/**
 * src/stores/runStore.ts
 *
 * 런(1회 플레이) 상태의 단일 출처. STEP 2.
 *
 * 여기 담긴 것은 곧 STEP 3에서 저장할 것과 같다. 그래서 화면 전환(`screen`)이나
 * 모달 개폐(`detail`) 같은 뷰 상태는 **일부러 넣지 않았다.** 저장 파일에
 * `screen:'battle'`이 들어가면 복원 시 result가 없어 화면이 깨진다.
 *
 * 이 파일은 스토어이므로 React에 의존하지만(zustand), 게임 규칙 계산은
 * 전부 `src/game/`의 순수 함수에 위임한다. 여기서 밸런스를 계산하지 않는다.
 */
import { create } from 'zustand';
import { createRng, substream, STREAM } from '../game/rng';
import { runEncounter, type EncounterResult } from '../game/encounter';
import type { Intervention } from '../game/intervention';
import { klassFor, statsOfInstance } from '../game/stats';
import { advanceReveal } from '../game/reveal';
import { saveRun, type SavedRun } from './save';
import { gameData, FLOORS, floorAt, HERO } from '../game/data';
import { floorRewards, isFinalFloor } from '../game/data/floors';
import {
  armoryAtkMult, idleExpGain, restHealRate, upgradeCost, type FacilityKind,
} from '../game/data/facilities';
import { GEAR_DEFS, GEAR_TUNING, POTION_TUNING, dropWeights, dropTable } from '../game/data/gear';
import {
  equip as equipGearPure, unequip as unequipGearPure, enhance as enhanceGearPure,
  makeGear, rollRecovery, weightedPick,
} from '../game/gear';
import { evaluateQuests, questContext, questRng, type QuestGrant } from '../game/quest';
import type { QuestId } from '../game/data/quests';
import { BANNERS, initialGachaState, pull, registerCodex, type PullResult } from '../game/gacha';
import {
  fuse as fuseHeroes, promote as promoteHero, gainExp,
  type FuseCheck, type FuseResult, type PromoteCheck, type PromoteResult,
} from '../game/progression';
import type {
  BannerKind, CodexEntry, GachaState, GearDefId, GearInstId, GearInstance, GearSlot,
  HeroDefId, HeroInstId, HeroInstance, Star, Wallet,
} from '../game/types';

/**
 * 배열 인벤토리를 조회용 Map으로.
 * RunSlice가 배열을 들고 있는 것은 저장 때문이고(Map은 JSON이 안 된다),
 * 전투·보정 계산은 id 조회가 필요해 이 변환을 거친다.
 */
export function gearIndex(gear: GearInstance[]): Map<GearInstId, GearInstance> {
  return new Map(gear.map((g) => [g.instId, g]));
}

/** 파티 정원. 게임 규칙이므로 스토어가 강제한다. */
export { PARTY_LIMIT } from '../screens/BaseScreen';
import { PARTY_LIMIT } from '../screens/BaseScreen';

/**
 * 시드 생성기. 기본은 Math.random이지만 테스트는 고정값을 주입한다.
 *
 * `src/game/`은 Math.random을 금지하지만 여기는 "새 시드를 뽑는" 경계다.
 * 뽑힌 시드는 이후 전부 createRng를 통해서만 소비되므로 재현성은 유지된다.
 */
export type SeedSource = () => number;

const defaultSeedSource: SeedSource = () => Math.floor(Math.random() * 1e9);

const makeHero = (
  defId: HeroDefId, star: Star, level: number, n: number,
): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId,
  star,
  klass: klassFor(star),
  level,
  exp: 0,
  /**
   * 개체 시드. 없으면 potentialOf가 undefined를 돌려주고
   * 발굴이 영원히 '판단 불가'에 머문다 (stats.ts / reveal.ts 참조).
   *
   * 소환 영웅은 rollHeroSeed(rng)로 받지만 초기 로스터는 전투 RNG 밖에서 만들어지므로
   * 순번에서 결정론적으로 파생시킨다. 시작 멤버가 매번 달라지면 밸런스 기준선이 흔들린다.
   *
   * ⚠️ SEED_OFFSET은 밸런스 상수다. 임의로 바꾸지 말 것.
   * 이 값 하나로 6층 승률이 18%~91%까지 갈린다 (HANDOFF §5-1 "칼날"의 또 다른 사례).
   * 22537은 시작 파티 3인의 잠재 계수 합이 정확히 0이 되도록 탐색해 고른 값이다
   * → 6층 67%로 시드 없던 기준선 70%를 사실상 유지하면서, 셋 사이 편차 0.10은 남긴다
   *   (+0.050 / -0.049 / -0.001 — 개체차는 보이되 파티 전체 강함은 안 변한다).
   * 바꿨다면 `npm run sim`만으로는 부족하다. sim은 자체 파티를 쓰므로
   * 이 로스터의 승률은 잡히지 않는다 — 별도로 재볼 것.
   */
  seed: (n * 2654435761 + 22537) >>> 0,
  revealProgress: 0,
  currentHp: 0,        // 0이면 전투 시작 시 최대 HP로 채워진다
  isDead: false,
  acquiredAtFloor: 1,
});

/** STEP 3에서 저장 데이터 로드로 대체될 초기 로스터 */
export function initialRoster(): HeroInstance[] {
  return [
    makeHero(HERO.ashen, 2, 15, 1),
    makeHero(HERO.bulwark, 2, 15, 2),
    makeHero(HERO.tide, 3, 20, 3),
    makeHero(HERO.gale, 4, 30, 4),
    makeHero(HERO.bolt, 5, 40, 5),
  ];
}

/** 직렬화 가능한 순수 데이터 부분 — STEP 3의 저장 단위가 된다. */
export interface RunSlice {
  floorIndex: number;
  roster: HeroInstance[];
  party: HeroInstId[];
  /** 재화. 층 보상으로 쌓이고 소환에 쓰인다. */
  wallet: Wallet;
  /** 천장·쿨다운 카운터 */
  gacha: GachaState;
  /** 도감 — 어떤 영웅을 몇 번 얻었는지 */
  codex: Record<HeroDefId, CodexEntry>;
  /** 시설 레벨(0=미건설). 대기실 경영 — STEP 6 */
  facilities: Record<FacilityKind, number>;
  /**
   * 보유 장비. 착용 여부는 각 인스턴스의 equippedBy가 들고 있다.
   *
   * Map이 아니라 배열인 이유는 저장이다 — Map은 JSON으로 직렬화되지 않는다.
   * 조회가 필요한 곳(전투 진입)에서만 gearIndex()로 Map을 만든다.
   */
  gear: GearInstance[];
  /** 장비 instId 발번용 카운터. 같은 종류를 여러 개 가질 수 있어야 한다. */
  gearSeq: number;
  /**
   * 지금까지 치른 전투 수. 전리품 RNG를 전투마다 갈라놓는 데 쓴다.
   *
   * 전투 시드만으로는 부족하다 — 시드가 고정된 환경(테스트)이나 같은 층 재도전에서
   * 매번 같은 난수열이 나와 드롭이 영영 안 나오거나 항상 나온다(실제로 겪었다).
   */
  battleCount: number;
  /**
   * 보유 포션. 전투에 들려 보내면 소모된다.
   * 장비와 달리 개체가 없는 순수 수량이라 숫자 하나로 충분하다.
   */
  potions: number;
  /**
   * 이번 전투에 들려 보낸 개수.
   *
   * 개입으로 재시뮬레이션할 때 같은 값을 넘겨야 재현성이 유지된다 —
   * seed·interventions와 같은 이유로 전투 중 상태이며 저장하지 않는다.
   */
  carriedPotions: number;
  /**
   * 달성한 과제 id 목록.
   *
   * 한 번 달성하면 끝이므로 **반드시 저장된다** — 새로고침으로 초기화되면
   * 같은 층을 다시 깨서 보상을 반복 수령할 수 있다.
   */
  claimedQuests: QuestId[];
  /**
   * 방금 돌파로 새로 달성한 과제. 결과 화면이 보여주고 나면 의미가 없다.
   * result와 같은 성격의 전투 직후 상태라 저장하지 않는다.
   */
  questGrants: QuestGrant[];
  /**
   * 첫 ★5 소환 연출을 이미 봤는지.
   * 처음 한 번은 스킵을 막으므로 이 플래그가 저장돼야 한다 — 새로고침으로 되살아나면 안 된다.
   */
  seenFirstLegendary: boolean;
  /** 이번 전투의 시드. 개입으로 재계산할 때 같은 값을 써야 재현된다. */
  seed: number;
  interventions: Intervention[];
  /** 전투 결과. 파생값이므로 저장 대상은 아니다(시드+개입으로 재생성 가능). */
  result: EncounterResult | null;
  /** 전투 시점의 로스터 스냅샷 — 결과 화면에서 사망자를 찾는 데 쓴다 */
  snapshot: HeroInstance[];
  /** 이번 런에서 잃은 영웅 수 */
  deathCount: number;
  /**
   * 최상층을 클리어했는가.
   * floorIndex는 마지막 층에서 클램프되므로 이 플래그 없이는
   * "정상에 서 있음"과 "정상을 넘었음"을 구분할 수 없다.
   */
  towerCleared: boolean;
}

export interface RunActions {
  toggleParty: (id: HeroInstId) => void;
  /** 전투 시작. 파티가 비어 있으면 아무 일도 하지 않고 false를 반환한다. */
  start: () => boolean;
  /** 개입 — 같은 시드로 재시뮬레이션한다. */
  intervene: (next: Intervention[]) => void;
  /** 전투 종료 처리. 퍼머데스가 반영되는 유일한 지점. */
  finish: () => void;
  /**
   * 소환. 성공하면 영웅이 로스터에 들어가고 재화·천장·도감이 갱신된다.
   * 실패(재화 부족/쿨다운)는 예외가 아니라 결과로 돌아온다 — 상태는 그대로다.
   * `now`는 쿨다운 판정용. 테스트가 시간을 고정할 수 있도록 주입받는다.
   */
  summon: (kind: BannerKind, now?: number) => PullResult;
  /** 첫 ★5 연출을 끝까지 봤음을 기록한다 (이후로는 스킵 가능) */
  markLegendarySeen: () => void;
  /**
   * 합성 — 제물을 바쳐 대상을 성장시킨다.
   * 성공하면 **제물은 로스터에서 영구히 사라진다.** 되돌릴 수 없다.
   */
  fuse: (targetId: HeroInstId, sacrificeId: HeroInstId) => FuseResult | FuseCheck;
  /** 승급 — 등급을 올리고 레벨을 1로 되돌린다. */
  promote: (id: HeroInstId) => PromoteResult | PromoteCheck;
  /**
   * 시설 업그레이드. 실패(만렙/금 부족)는 예외가 아니라 결과로 돌아온다
   * — summon()/fuse()와 같은 원칙이며, 실패 시 상태는 그대로다.
   */
  upgradeFacility: (kind: FacilityKind) => FacilityUpgradeResult;
  /** 상점 구매. 금으로 장비를 사서 창고에 넣는다. */
  buyGear: (defId: GearDefId) => BuyGearResult;
  /** 장비 착용. 같은 슬롯에 있던 것은 자동으로 창고로 돌아간다. */
  equipGear: (heroId: HeroInstId, gearId: GearInstId) => EquipGearResult;
  /** 장비 해제 */
  unequipGear: (heroId: HeroInstId, slot: GearSlot) => void;
  /** 장비 강화. 실패해도 파괴되지 않고 금만 잃는다. */
  enhanceGear: (gearId: GearInstId) => EnhanceGearResult;
  /** 포션 구매 */
  buyPotion: (count?: number) => BuyPotionResult;
  /**
   * 저장된 런을 불러와 상태에 얹는다.
   * 전투 중 상태는 받지 않는다 — 복원 시점은 항상 대기실이다.
   */
  hydrate: (saved: SavedRun) => void;
  /** 테스트/신규 런용 초기화 */
  reset: (seedSource?: SeedSource) => void;
}

export type RunStore = RunSlice & RunActions;

/** 시설 업그레이드 결과. 실패 사유를 화면이 문구로 바꿔 보여준다. */
export type FacilityUpgradeResult =
  | { ok: true; kind: FacilityKind; level: number; spent: number }
  | { ok: false; reason: 'max-level' | 'not-enough-gold' };

export type BuyGearResult =
  | { ok: true; gear: GearInstance; spent: number }
  | { ok: false; reason: 'not-sold' | 'not-enough-gold' };

export type EquipGearResult =
  | { ok: true; unequipped: GearInstId | null }
  | { ok: false; reason: 'not-owned' | 'hero-dead' | 'equipped-elsewhere' | 'no-hero' };

export type EnhanceGearResult =
  | { ok: true; success: boolean; enhance: number; spent: number }
  | { ok: false; reason: 'max-enhance' | 'not-enough-gold' | 'not-owned' };

export type BuyPotionResult =
  | { ok: true; count: number; spent: number }
  | { ok: false; reason: 'not-enough-gold' };

/**
 * 시작 재화.
 *
 * 젬 500 = 유료 소환 1회분. 처음부터 한 번은 당겨볼 수 있어야 소환이
 * "언젠가 열리는 기능"이 아니라 지금 만질 수 있는 것이 된다.
 *
 * 금 300 = 시설 Lv.1 한 채분(FACILITY_COST[1]). 같은 원칙이다.
 * 0으로 두면 시설 화면에 들어가도 4개가 전부 잠겨 있어 "아직 아무것도 못 하는 곳"이 된다.
 * 층 보상이 층당 230~300금이라 어차피 1~2층이면 닿지만, 그때까지 화면이 죽어 있는 것과
 * 처음부터 **어디에 먼저 투자할지 고르게 하는 것**은 다르다 — 후자가 이 게임의 결정이다.
 * 딱 한 채분만 준다. 두 채를 주면 그 선택이 사라진다.
 */
export function initialWallet(): Wallet {
  return { gold: 300, gems: 500, promotionStones: 0, awakeningStones: 0, revivalTokens: 0 };
}

function freshSlice(): RunSlice {
  const roster = initialRoster();
  return {
    floorIndex: 0,
    towerCleared: false,
    roster,
    party: roster.slice(0, 3).map((h) => h.instId),
    wallet: initialWallet(),
    gacha: initialGachaState(0),
    codex: {} as Record<HeroDefId, CodexEntry>,
    facilities: { rest: 0, training: 0, forge: 0, armory: 0 },
    gear: [],
    gearSeq: 0,
    battleCount: 0,
    potions: 0,
    carriedPotions: 0,
    claimedQuests: [],
    questGrants: [],
    seenFirstLegendary: false,
    seed: 0,
    interventions: [],
    result: null,
    snapshot: [],
    deathCount: 0,
  };
}

/**
 * 스토어 본체를 만든다. 테스트는 이 팩토리로 격리된 인스턴스를 얻는다.
 * (전역 훅 하나만 두면 테스트끼리 상태가 새어나간다)
 */
export function createRunStore(seedSource: SeedSource = defaultSeedSource) {
  return create<RunStore>((set, get) => ({
    ...freshSlice(),

    toggleParty: (id) =>
      set((s) => ({
        party: s.party.includes(id)
          ? s.party.filter((x) => x !== id)
          : s.party.length >= PARTY_LIMIT
            ? s.party
            : [...s.party, id],
      })),

    start: () => {
      const { party, roster, floorIndex, potions } = get();
      const members = party
        .map((id) => roster.find((h) => h.instId === id))
        .filter((h): h is HeroInstance => !!h && !h.isDead);
      if (members.length === 0) return false;

      /**
       * 들고 갈 포션. 보유량과 전투당 상한 중 작은 쪽이다.
       *
       * 유저가 개수를 고르게 하지 않는다 — 매 전투 전에 슬라이더를 만지는 건
       * 결정이 아니라 잡일이고, 어차피 최적해는 "항상 최대"다.
       */
      const carried = Math.min(potions, POTION_TUNING.maxPerBattle);

      const seed = seedSource();
      set({
        seed,
        carriedPotions: carried,
        interventions: [],
        // 지난 전투의 과제 달성 표시가 결과 화면에 남으면 안 된다
        questGrants: [],
        snapshot: roster,
        result: runEncounter({
          party: members,
          floor: floorAt(floorIndex),
          data: gameData,
          rng: createRng(seed),
          allyAtkMult: armoryAtkMult(get().facilities.armory),
          inventory: gearIndex(get().gear),
          potions: carried,
        }),
      });
      return true;
    },

    /**
     * 재생 중인 화면을 조작하는 게 아니라 입력을 바꿔 재시뮬레이션하는 방식이다.
     * 이래야 "같은 시드 + 같은 개입 = 같은 결과"라는 재현성이 유지된다.
     */
    intervene: (next) => {
      const { snapshot, party, seed, floorIndex, facilities, carriedPotions } = get();
      const members = snapshot.filter((h) => party.includes(h.instId) && !h.isDead);
      if (members.length === 0) return;
      set({
        interventions: next,
        result: runEncounter({
          party: members,
          floor: floorAt(floorIndex),
          data: gameData,
          rng: createRng(seed),
          interventions: next,
          // start()와 같은 입력을 넘겨야 한다. 빠뜨리면 개입만으로 전투가 달라져 재현성이 깨진다.
          allyAtkMult: armoryAtkMult(facilities.armory),
          inventory: gearIndex(get().gear),
          potions: carriedPotions,
        }),
      });
    },

    /** 퍼머데스가 상태에 반영되는 유일한 지점 */
    finish: () => {
      const { result } = get();
      if (!result) return;
      const casualties = new Set<string>(result.casualties);
      const cleared = result.outcome === 'victory';

      /**
       * 실제로 전장에 선 영웅만 발굴이 진행된다.
       * result.roster의 아군 유닛이 그 정답이다 — party 목록은 죽은 멤버를 걸러내기 전이라
       * 이걸로 판단하면 나가지 않은 영웅도 진행도가 오른다.
       */
      const fought = new Set<string>(
        result.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
      );

      /**
       * 층 보상 적립. 결과 화면이 이미 이 수치를 보여주고 있었지만
       * 지갑에 들어가지 않아 사라지고 있었다 — 소환이 생기면서 쓸 곳이 생겼다.
       * 패배 시엔 주지 않는다 (결과 화면의 "획득: 없음"과 일치).
       */
      const reward = cleared
        ? floorRewards(floorAt(get().floorIndex), result.turnsElapsed)
        : null;

      /**
       * 장비 처리 — 사망자의 회수 판정과 층 드롭.
       *
       * **전투 시드에서 파생시키되 별도 스트림을 쓴다.**
       *   - seedSource()를 다시 부르면 안 된다: 테스트처럼 시드가 고정된 환경에서
       *     매 전투가 같은 난수열을 받아 드롭이 영영 안 나오거나 항상 나온다(실제로 겪었다).
       *   - 전투 RNG를 그대로 쓰면 안 된다: 개입으로 재시뮬레이션할 때마다 드롭이 바뀌어
       *     "좋은 템 나올 때까지 개입 돌리기"가 된다.
       *   - 전투 시드만 쓰면 안 된다: 시드가 고정된 환경이나 같은 층 재도전에서
       *     매번 같은 난수열이 나온다. 실제로 드롭이 30전 내내 0이었다.
       *   → 전투 시드 + 층 + 전투 횟수를 섞는다. 개입은 이 셋 중 무엇도 바꾸지 않으므로
       *     재시뮬레이션해도 드롭은 그대로다.
       */
      const floorSpec = floorAt(get().floorIndex);
      const lootRng = substream(
        (get().seed ^ Math.imul(floorSpec.id, 0x85ebca6b)
          ^ Math.imul(get().battleCount + 1, 0xc2b2ae35)) >>> 0,
        STREAM.LOOT,
      );

      /** 사망자가 들고 있던 장비: 슬롯마다 독립 판정으로 회수 또는 소실 */
      const lostGear = new Set<GearInstId>();
      const freedGear = new Set<GearInstId>();
      for (const h of get().roster) {
        if (!casualties.has(h.instId)) continue;
        const { recovered, lost } = rollRecovery(h.gear, lootRng, GEAR_TUNING.recoveryRate);
        for (const id of recovered) freedGear.add(id);
        for (const id of lost) lostGear.add(id);
      }

      /** 층 드롭. 승리했을 때만, 깊이에 따라 등급이 잠긴다. */
      const dropped: GearInstance[] = [];
      if (cleared) {
        const chance = floorSpec.isBoss ? GEAR_TUNING.bossDropChance : GEAR_TUNING.dropChance;
        if (lootRng() < chance) {
          const rank = weightedPick(dropWeights(floorSpec.id), lootRng);
          if (rank) {
            const pool = dropTable().filter((d) => d.rank === rank);
            if (pool.length > 0) {
              const pick = pool[Math.min(pool.length - 1, Math.floor(lootRng() * pool.length))];
              dropped.push(makeGear(pick.id, get().gearSeq + dropped.length + 1));
            }
          }
        }
      }

      /**
       * 전투 후 잔여 HP. 엔진이 계산해 주던 것을 예전에는 버리고 있었다
       * (= 매 층을 만피로 시작). 시설(숙소)이 의미를 가지려면 소모가 남아야 한다.
       */
      /**
       * 실제로 터진 포션 수. 이벤트 로그가 유일한 진실이다 —
       * 엔진이 몇 개 썼는지는 여기서만 알 수 있다.
       */
      const potionsUsed = result.events.filter((e) => e.type === 'heal' && e.fromPotion).length;

      const survivedHp = new Map(result.survivors.map((s) => [s.instId as string, s.currentHp]));
      const healRate = restHealRate(get().facilities.rest);
      const idleExp = cleared ? idleExpGain(get().facilities.training) : 0;

      /**
       * 과제 판정.
       *
       * 전투를 다시 돌리지 않고 이미 나온 기록만 다시 읽는다 → 개입해도 판정이 안 바뀐다.
       * RNG 유도식은 questRng() 하나에만 있다 — 결과 화면의 미리보기가 같은 함수를
       * 쓰므로, 보인 장비와 실제로 들어온 장비가 갈리지 않는다.
       * instId는 드롭분 다음 번호부터 이어 붙여 충돌을 피한다.
       */
      const grants = evaluateQuests({
        ctx: questContext({
          floor: floorSpec,
          result,
          potionsUsed,
          totalDeaths: get().deathCount + casualties.size,
        }),
        cleared,
        claimed: get().claimedQuests,
        rng: questRng(get().seed, floorSpec.id, get().battleCount),
        gearSeq: get().gearSeq + dropped.length,
      });

      const questGear = grants.map((g) => g.gear).filter((g): g is GearInstance => g != null);
      const questGold = grants.reduce((sum, g) => sum + g.gold, 0);
      const questStones = grants.reduce((sum, g) => sum + g.promotionStones, 0);
      const questPotions = grants.reduce((sum, g) => sum + g.potions, 0);

      set((s) => ({
        roster: s.roster.map((h) => {
          // 사망자도 진행도를 받는다. "알아냈는데 잃었다"가 무덤 기록에 남아야 한다.
          let next = fought.has(h.instId)
            ? advanceReveal(h, { battles: 1, floorsCleared: cleared ? 1 : 0 })
            : h;

          if (fought.has(h.instId)) {
            /**
             * 참전 보상 경험치.
             *
             * floorRewards().exp는 결과 화면이 "Exp +80"으로 이미 보여주고 있었는데
             * 어디에서도 지급되지 않아 사라지고 있었다 — **싸운 영웅은 영원히 레벨이 안 올랐다.**
             * 그래서 층을 이어 오르면 파티는 그대로인데 층만 어려워져 구간 완주율이 0%였다.
             * 사망자에게는 주지 않는다(레벨업한 시신은 기록으로도 이상하다).
             */
            if (reward && !casualties.has(h.instId)) {
              next = gainExp(next, reward.exp, gameData.starScaling).hero;
            }

            /**
             * 잔여 HP를 넘기고 숙소만큼 회복시킨다.
             * 상한(최대 HP)은 battle.ts의 buildAlly가 clamp하므로 여기서는 계산만 한다 —
             * 스토어가 최대 HP를 다시 계산하면 잠재치·등급 규칙이 두 곳으로 갈라진다.
             */
            const hp = survivedHp.get(h.instId);
            if (hp != null && hp > 0) {
              const max = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling).hp;
              next = { ...next, currentHp: Math.min(max, hp + Math.round(max * healRate)) };
            }
          } else if (idleExp > 0 && !h.isDead) {
            /**
             * 훈련소 — 전투에 나가지 않은 영웅만 받는다.
             * 참전 영웅과 경쟁시키면 "안 내보내는 게 이득"이 되어 퍼머데스의 긴장이 사라진다.
             */
            next = gainExp(next, idleExp, gameData.starScaling).hero;
          }

          // 사망 표시는 참전 여부와 무관하게 casualties만 보고 판단한다 —
          // 두 판정을 얽으면 퍼머데스가 발굴 로직에 종속된다.
          //
          // 사망자의 gear는 비운다. 회수분은 창고로, 소실분은 사라졌으므로
          // 어느 쪽이든 시신이 계속 들고 있으면 유령 참조가 된다.
          return casualties.has(h.instId) ? { ...next, isDead: true, gear: {} } : next;
        }),
        /**
         * 장비 인벤토리 갱신.
         *   - 소실분은 목록에서 제거 (영웅과 함께 사라졌다)
         *   - 회수분은 남기되 착용 해제 (창고로 돌아왔다)
         *   - 드롭분을 추가
         */
        gear: [
          ...s.gear
            .filter((g) => !lostGear.has(g.instId))
            .map((g) => (freedGear.has(g.instId) ? { ...g, equippedBy: null } : g)),
          ...dropped,
          ...questGear,
        ],
        gearSeq: s.gearSeq + dropped.length + questGear.length,
        claimedQuests: [...s.claimedQuests, ...grants.map((g) => g.quest.id)],
        questGrants: grants,
        // 다음 전투의 전리품이 다른 난수를 받도록 한다
        battleCount: s.battleCount + 1,
        /**
         * 포션은 **실제로 터진 만큼만** 차감한다.
         * 들고 나간 수를 그냥 빼면 안 쓰고 이긴 전투에서도 사라진다.
         */
        potions: Math.max(0, s.potions - potionsUsed) + questPotions,
        carriedPotions: 0,
        party: s.party.filter((id) => !casualties.has(id)),
        deathCount: s.deathCount + casualties.size,
        wallet: {
          ...s.wallet,
          gold: s.wallet.gold + (reward?.gold ?? 0) + questGold,
          promotionStones:
            s.wallet.promotionStones + (reward?.promotionStones ?? 0) + questStones,
        },
        floorIndex: cleared
          ? Math.min(FLOORS.length - 1, s.floorIndex + 1)
          : s.floorIndex,
        /**
         * 최상층 클리어 표시.
         * floorIndex는 클램프되므로 "마지막 층에 있음"과 "마지막 층을 깼음"을
         * 구분할 수 없다. 이 플래그가 없으면 정상을 밟아도 같은 층이 계속 열린다.
         */
        towerCleared: s.towerCleared
          || (cleared && isFinalFloor(s.floorIndex)),
        result: null,
      }));

      /**
       * 자동 저장. 여기가 사망이 확정되는 지점이므로 여기서 저장해야
       * 새로고침으로 퍼머데스를 무를 수 없다 (save.ts 주석 참조).
       * set() 이후에 부르는 이유는 갱신된 상태를 저장하기 위해서다.
       */
      saveRun(get());
    },

    summon: (kind, now = Date.now()) => {
      const { wallet, gacha, codex, floorIndex, roster } = get();
      /**
       * 소환 RNG는 전투 시드와 독립이어야 한다.
       * 전투 시드를 재사용하면 "같은 층에서 재도전하면 같은 영웅이 나온다"가 되고,
       * 개입 재시뮬레이션(같은 시드로 다시 돌림)이 소환 결과까지 바꿔버린다.
       */
      const rng = createRng(seedSource());
      const result = pull({
        banner: BANNERS[kind],
        wallet, gacha, codex,
        pool: gameData.heroes,
        rng,
        now,
        currentFloor: floorIndex + 1,
        makeId: () => `sum-${now.toString(36)}-${Math.floor(rng() * 0xffffff).toString(36)}`,
        /*
          이름 유일성 검사용. 사망자도 포함된 로스터를 그대로 넘긴다 —
          죽은 영웅의 이름이 재사용되면 그 무덤 기록이 무의미해진다 (identity.ts 참조).
        */
        roster,
      });

      // 실패는 상태를 건드리지 않는다. 재화 부족/쿨다운은 정상 흐름이다.
      if (!result.ok) return result;

      set((s) => ({
        roster: [...s.roster, result.hero],
        wallet: result.wallet,
        gacha: result.gacha,
        codex: registerCodex(s.codex, result.hero, now),
      }));

      // 소환은 되돌릴 수 없다 — 뽑는 즉시 저장한다.
      saveRun(get());
      return result;
    },

    fuse: (targetId, sacrificeId) => {
      const { roster, facilities } = get();
      const target = roster.find((h) => h.instId === targetId);
      const sacrifice = roster.find((h) => h.instId === sacrificeId);
      // 없는 영웅을 가리킨 경우. same-hero로 뭉뚱그리지 않고 명시적으로 막는다.
      if (!target || !sacrifice) return { ok: false, reason: 'same-hero' };

      const r = fuseHeroes({
        /**
         * 합성소 레벨. fuseEfficiency가 1~3으로 clamp하므로 미건설(0)은 Lv.1과 같은
         * 0.65 전환율이 된다 — 시설 도입 전 밸런스가 하한으로 그대로 보존된다.
         */
        target, sacrifice, facilityLevel: facilities.forge, scaling: gameData.starScaling,
      });
      // FuseCheck의 성공형 {ok:true}와 FuseResult가 겹치므로 고유 필드로 좁힌다
      if (!r.ok || !('consumedInstId' in r)) return r;

      /**
       * 제물이 끼고 있던 장비는 **전부 창고로 돌아온다.**
       * 사망(50% 판정)과 달리 합성은 플레이어가 스스로 고른 소멸이므로
       * 장비까지 뺏으면 "제물 바치기 전에 장비를 빼야 한다"는 잡일만 는다.
       * 회수하지 않으면 그 장비는 주인 없이 영구히 잠긴다.
       */
      const freed = new Set<GearInstId>(
        Object.values(sacrifice.gear ?? {}).filter((id): id is GearInstId => !!id),
      );

      set((s) => ({
        // 제물은 여기서 사라진다. progression.ts가 consumedInstId를 주고
        // "호출자가 반드시 제거해야 한다"고 명시한 그 지점이다.
        roster: s.roster
          .filter((h) => h.instId !== r.consumedInstId)
          .map((h) => (h.instId === targetId ? r.target : h)),
        gear: freed.size === 0
          ? s.gear
          : s.gear.map((g) => (freed.has(g.instId) ? { ...g, equippedBy: null } : g)),
        party: s.party.filter((id) => id !== r.consumedInstId),
      }));

      // 되돌릴 수 없는 소멸이므로 즉시 저장한다.
      saveRun(get());
      return r;
    },

    promote: (id) => {
      const hero = get().roster.find((h) => h.instId === id);
      if (!hero) return { ok: false, reason: 'max-star' };

      const r = promoteHero(hero, get().wallet, gameData.starScaling);
      if (!('toStar' in r)) return r; // PromoteCheck (실패)

      set((s) => ({
        roster: s.roster.map((h) => (h.instId === id ? r.hero : h)),
        wallet: r.wallet,
      }));
      saveRun(get());
      return r;
    },

    upgradeFacility: (kind) => {
      const { facilities, wallet } = get();
      const level = facilities[kind];
      const cost = upgradeCost(level);
      if (cost == null) return { ok: false, reason: 'max-level' };
      if (wallet.gold < cost) return { ok: false, reason: 'not-enough-gold' };

      set((s) => ({
        facilities: { ...s.facilities, [kind]: level + 1 },
        wallet: { ...s.wallet, gold: s.wallet.gold - cost },
      }));
      // 재화를 쓴 결과이므로 즉시 저장한다 (summon()/fuse()와 같은 원칙).
      saveRun(get());
      return { ok: true, kind, level: level + 1, spent: cost };
    },

    buyGear: (defId) => {
      const def = GEAR_DEFS[defId];
      // 유물은 price가 없다 — 금으로 최상급을 살 수 있으면 지갑이 강함을 정한다.
      if (!def || def.price == null) return { ok: false, reason: 'not-sold' };
      if (get().wallet.gold < def.price) return { ok: false, reason: 'not-enough-gold' };

      const seq = get().gearSeq + 1;
      const inst = makeGear(defId, seq);
      set((s) => ({
        gear: [...s.gear, inst],
        gearSeq: seq,
        wallet: { ...s.wallet, gold: s.wallet.gold - def.price! },
      }));
      // 재화를 쓴 결과이므로 즉시 저장한다 (summon()/fuse()와 같은 원칙).
      saveRun(get());
      return { ok: true, gear: inst, spent: def.price };
    },

    equipGear: (heroId, gearId) => {
      const { roster, gear } = get();
      const hero = roster.find((h) => h.instId === heroId);
      if (!hero) return { ok: false, reason: 'no-hero' };

      const r = equipGearPure({ hero, gearId, inventory: gearIndex(gear) });
      if (!r.ok) return r;

      set((s) => ({
        roster: s.roster.map((h) => (h.instId === heroId ? { ...h, gear: r.gear } : h)),
        /*
          소유 갱신은 여기 한 곳에서만 한다. equip()이 상태를 안 건드리고
          결과만 돌려주는 이유가 이것이다 — 두 곳에서 바꾸면 유령 참조가 생긴다.
        */
        gear: s.gear.map((g) => {
          if (g.instId === gearId) return { ...g, equippedBy: heroId };
          if (g.instId === r.unequipped) return { ...g, equippedBy: null };
          return g;
        }),
      }));
      saveRun(get());
      return { ok: true, unequipped: r.unequipped };
    },

    unequipGear: (heroId, slot) => {
      const hero = get().roster.find((h) => h.instId === heroId);
      if (!hero) return;
      const r = unequipGearPure(hero, slot);
      if (!r.unequipped) return;

      set((s) => ({
        roster: s.roster.map((h) => (h.instId === heroId ? { ...h, gear: r.gear } : h)),
        gear: s.gear.map((g) => (g.instId === r.unequipped ? { ...g, equippedBy: null } : g)),
      }));
      saveRun(get());
    },

    enhanceGear: (gearId) => {
      const { gear, wallet } = get();
      const target = gear.find((g) => g.instId === gearId);
      if (!target) return { ok: false, reason: 'not-owned' };

      /*
        강화 RNG는 전투 시드와 독립이어야 한다 — summon()과 같은 이유다.

        seedSource()에 attempts를 섞는다. 시드가 고정된 환경(테스트)에서
        seedSource()만 쓰면 매 시도가 같은 난수를 받아 "영원히 실패"에 갇힌다.
        전리품 RNG가 같은 함정을 밟았다(§finish 주석).
      */
      const attempts = get().gearSeq + 1;
      const rng = createRng((seedSource() ^ Math.imul(attempts, 0x9e3779b1)) >>> 0);
      const r = enhanceGearPure({ gear: target, gold: wallet.gold, rng });
      if (!r.ok) return r;

      set((s) => ({
        gear: s.gear.map((g) => (g.instId === gearId ? r.gear : g)),
        wallet: { ...s.wallet, gold: s.wallet.gold - r.spent },
        // 다음 강화가 다른 난수를 받도록 카운터를 올린다 (id 발번과 공유)
        gearSeq: s.gearSeq + 1,
      }));
      // 실패해도 금은 나갔다 — 되돌릴 수 없으므로 즉시 저장한다.
      saveRun(get());
      return { ok: true, success: r.success, enhance: r.gear.enhance, spent: r.spent };
    },

    buyPotion: (count = 1) => {
      const n = Math.max(1, Math.floor(count));
      const cost = POTION_TUNING.price * n;
      if (get().wallet.gold < cost) return { ok: false, reason: 'not-enough-gold' };

      set((s) => ({
        potions: s.potions + n,
        wallet: { ...s.wallet, gold: s.wallet.gold - cost },
      }));
      saveRun(get());
      return { ok: true, count: n, spent: cost };
    },

    markLegendarySeen: () => {
      if (get().seenFirstLegendary) return;
      set({ seenFirstLegendary: true });
      saveRun(get());
    },

    hydrate: (saved) =>
      set({
        floorIndex: saved.floorIndex,
        roster: saved.roster,
        party: saved.party,
        deathCount: saved.deathCount,
        wallet: saved.wallet,
        gacha: saved.gacha,
        codex: saved.codex,
        facilities: saved.facilities,
        gear: saved.gear,
        gearSeq: saved.gearSeq,
        battleCount: saved.battleCount,
        potions: saved.potions,
        claimedQuests: saved.claimedQuests,
        seenFirstLegendary: saved.seenFirstLegendary,
        towerCleared: saved.towerCleared,
        // 전투 중 상태는 항상 초기화한다. 저장 파일엔 없지만,
        // 진행 중이던 스토어에 hydrate가 불릴 수 있다.
        seed: 0,
        interventions: [],
        result: null,
        snapshot: [],
        questGrants: [],
      }),

    reset: () => set(freshSlice()),
  }));
}

/** 앱이 쓰는 전역 인스턴스 */
export const useRunStore = createRunStore();
