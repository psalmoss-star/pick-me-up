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
import { DEFAULT_ORDERS, type FallbackOrder, type Orders } from '../game/orders';
import {
  defaultLoadout, isStratagemUnlocked, nextResist,
} from '../game/stratagem';
import { STRATAGEM_SLOTS, type StratagemId } from '../game/data/stratagems';
import { appendDeeds, chronicleOf, deedsOf } from '../game/chronicle';
import { clampRoute, contactTerrain, floorMapOf } from '../game/floormap';
import { runEncounter, type EncounterResult } from '../game/encounter';
import type { Intervention } from '../game/intervention';
import { klassFor, statsOfInstance } from '../game/stats';
import { advanceReveal } from '../game/reveal';
import { saveRun, type SavedRun } from './save';
import { grantDevWallet, isDevMode } from './devWallet';
import { gameData, FLOORS, floorAt, HERO } from '../game/data';
import { floorRewards, isFinalFloor } from '../game/data/floors';
import { partyLimitAt, squadsOpen, SQUAD_COUNT } from '../game/data/party';
import { livingHeroes } from '../game/roster';
import { revisitMultiplier } from '../game/data/revisit';
import {
  armoryAtkMult, restHealRate, upgradeCost, ASSIGN_SLOTS, ASSIGNABLE,
  REST_COST_PER_HP, REST_COST_MIN, type FacilityKind, type AssignableFacility,
} from '../game/data/facilities';
import { GEAR_DEFS, POTION_TUNING, unlockedTierOf } from '../game/data/gear';
import {
  equip as equipGearPure, unequip as unequipGearPure, enhance as enhanceGearPure,
  makeGear,
} from '../game/gear';
import { craft as craftPure, refine as refinePure, spendMaterials, type CraftResult, type RefineResult } from '../game/craft';
import { applyPrep } from '../game/prep';
import { resolveScout, scoutReport, type ScoutReport } from '../game/report';
import { prepForMission, prepById, type PrepId } from '../game/data/preps';
import { evaluateQuests, questContext, questRng, type QuestGrant } from '../game/quest';
import type { QuestId } from '../game/data/quests';
import { BANNERS, initialGachaState, pull, recordLoss, registerCodex, type PullResult } from '../game/gacha';
import {
  fuse as fuseHeroes, promote as promoteHero, gainExp,
  type FuseCheck, type FuseResult, type PromoteCheck, type PromoteResult,
} from '../game/progression';
import { displayName, displayTitle } from '../game/identity';
import { mergeMaterials, rollFloorLoot } from '../game/loot';
import { settleOffTower } from '../game/offTower';
import {
  dispatchedHeroIds,
  type AdventureOutcome,
} from '../game/adventure';
import { ADVENTURE_BY_ID, type AdventureId, type Dispatch } from '../game/data/adventures';
import type {
  BannerKind, CodexEntry, GachaState, GearDefId, GearInstId, GearInstance, GearSlot,
  HeroDefId, HeroInstId, HeroInstance, MaterialBag, Star, Wallet,
} from '../game/types';
import type { FallenRecord, Legacy } from '../game/legacyTypes';
import { templateLastWords } from '../game/voice';
import { LEGENDS, LEGEND_SHARE_OF_STAR5 } from '../game/data/legends';
import { loadLegacy, saveLegacy, sealedNames , withLegendMet } from './legacy';

/**
 * 배열 인벤토리를 조회용 Map으로.
 * RunSlice가 배열을 들고 있는 것은 저장 때문이고(Map은 JSON이 안 된다),
 * 전투·보정 계산은 id 조회가 필요해 이 변환을 거친다.
 */
export function gearIndex(gear: GearInstance[]): Map<GearInstId, GearInstance> {
  return new Map(gear.map((g) => [g.instId, g]));
}

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
   *
   * ⚠️ **22537 → 13622 (2026-08-23).** 22537은 시작 파티 **3인**의 계수 합이 0이
   * 되도록 고른 값이었다. 로스터가 6인이 되면서 그 근거가 사라졌다 —
   * 실측으로 6인의 계수 합이 **+0.2709**였다(0이어야 할 값이).
   *
   * 13622는 6인의 계수 합이 -0.0001이면서 6층 승률이 기준선과 같은 값이다
   * → **6층 70%/사망 1.32** (1000회). 시드 없던 기준선 70%를 그대로 유지하면서
   *   개체별 계수는 +0.035/-0.028/-0.029/-0.049/+0.021/+0.049로 편차를 남긴다.
   *
   * ⚠️ **계수 합 0만 보고 고르면 안 된다**(§5-10). 합이 0인 후보 12개를 실측했더니
   * 6층 승률이 **22%~91%로 갈렸다.** 계수 4종의 평균인 합은 "어느 능력치에
   * 몰렸는지"를 지우기 때문이다. 근거와 탐색 절차는 `scripts/seed-search.mts`에 있다.
   *
   * 바꿨다면 `npm run sim`만으로는 부족하다. sim은 자체 파티를 쓰므로
   * 이 로스터의 승률은 잡히지 않는다(§5-9) — `npx tsx scripts/seed-search.mts`로 잴 것.
   */
  seed: (n * 2654435761 + 13622) >>> 0,
  revealProgress: 0,
  currentHp: 0,        // 0이면 전투 시작 시 최대 HP로 채워진다
  isDead: false,
  acquiredAtFloor: 1,
});

/**
 * STEP 3에서 저장 데이터 로드로 대체될 초기 로스터.
 *
 * ⚠️ **6인이다.** 정원이 21층부터 5로 늘어나므로(`partyLimitAt`) 5인 로스터로는
 * 대기가 0이 되어 사망 한 번이 곧 영구 결손이 된다 — 저층의 "정원 3 + 대기 2"와
 * 조건이 달라진다. 여섯 번째는 **서포트**다: 기존 5인이 탱1·힐1·딜2·브레이커1이라
 * 유일하게 빈 역할이고, 5인 편성에서 서포트 자리를 채우는 것이 sim·튜너의
 * 기준 파티 구성과도 맞는다.
 *
 * ⚠️ 여기를 만졌으면 `npm run sim`으로는 확인이 안 된다 — sim은 자체 파티를 쓴다
 * (§5-9). `npx tsx scripts/seed-search.mts`로 재고, SEED_OFFSET 근거도 다시 볼 것.
 */
export function initialRoster(): HeroInstance[] {
  return [
    makeHero(HERO.ashen, 2, 15, 1),
    makeHero(HERO.bulwark, 2, 15, 2),
    makeHero(HERO.tide, 3, 20, 3),
    makeHero(HERO.gale, 4, 30, 4),
    makeHero(HERO.bolt, 5, 40, 5),
    makeHero(HERO.banner, 3, 20, 6),
  ];
}

/** 직렬화 가능한 순수 데이터 부분 — STEP 3의 저장 단위가 된다. */
export interface RunSlice {
  /**
   * 이번에 도전할 층(인덱스). 재도전으로 **앞뒤로 움직인다.**
   * 예전에는 이 값이 "현재 위치"와 "최대 진행도"를 겸했고 클리어 시 +1만 하는
   * 단방향이라 "1층으로 돌아간다"를 표현할 자리가 없었다.
   */
  floorIndex: number;
  /**
   * 해금 상한(인덱스). 최전선 진행은 이 값이 오를 때만 일어난다.
   *
   * ⚠️ `towerCleared` 판정은 **이 값**으로 한다. `floorIndex`로 하면
   * 100층을 깬 뒤 재도전으로 1층에 내려갔을 때 판정이 깨진다.
   */
  maxFloorReached: number;
  /** floorId → 재도전 횟수. 보상 체감의 입력이다 */
  revisits: Record<number, number>;
  roster: HeroInstance[];
  /**
   * 편성. `[1군, 2군]`이고 길이는 항상 SQUAD_COUNT다.
   *
   * 1군 = 최전선 정복 / 2군 = 이미 깬 층 파밍.
   * **한 영웅은 두 군에 동시에 못 든다** — 스토어가 강제하고 save.ts가 복원 시 교정한다.
   */
  squads: HeroInstId[][];
  /**
   * 직전 전투에 나간 군. 다음 전투까지 편성이 잠긴다.
   *
   * 저장 대상이다 — 새로고침으로 풀리면 규칙이 없는 것과 같다.
   * "이 전투에 누굴 보낼지"가 되돌릴 수 없는 결정이 되어 퍼머데스와 결이 맞는다.
   */
  lockedSquad: number | null;
  /** 직전 출전 군. finish()가 lockedSquad를 세울 때 참조한다. 저장 대상은 아니다. */
  lastSortieSquad: number;
  /** 재화. 층 보상으로 쌓이고 소환에 쓰인다. */
  wallet: Wallet;
  /** 천장·쿨다운 카운터 */
  gacha: GachaState;
  /** 도감 — 어떤 영웅을 몇 번 얻었는지 */
  codex: Record<HeroDefId, CodexEntry>;
  /** 시설 레벨(0=미건설). 대기실 경영 — STEP 6 */
  facilities: Record<FacilityKind, number>;
  /**
   * 시설 배치 — 잉여 영웅의 세 번째 출구(제물·파견에 이어). STEP 48.
   *
   * 파견이 **일회성 이벤트**라면 배치는 **영구 상태**다. 배치자는 exp를 받지 않고
   * 대신 그 시설의 산출을 올린다 — 보상의 *종류*가 달라 유휴 exp와 경쟁하지 않는다.
   *
   * ⚠️ **묶는 기능이므로 푸는 쪽이 무조건이어야 한다.** 사망·제물은 배치를 자동
   * 해제한다(`finish`·`fuse`). 안 그러면 유령 instId가 슬롯을 영구 점유하는데,
   * 화면에 이름이 안 뜨니 해제할 방법도 없다 — 교착이다.
   */
  assignments: Record<AssignableFacility, HeroInstId[]>;
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
   * 보유 제작 재료 — 종류별 수량.
   *
   * 포션과 같은 이유로 개체가 없다. 다만 종류가 있어서 레코드다.
   * **금으로 살 수 없다**(`data/materials.ts` 주석 참조) — 탑 드롭과 모험으로만 들어온다.
   */
  materials: MaterialBag;
  /**
   * 진행 중인 모험 파견.
   *
   * ⚠️ **영웅에 `away` 플래그를 박지 않는 이유**는 동기화 지점이 셋(세이브 마이그레이션 ·
   * 사망 처리 · 새 런)으로 늘어나기 때문이다. 레코드로 두면 "명단에 있는데 로스터에 없다"를
   * 정산 시점에 한 곳에서 걸러낼 수 있다.
   *
   * ⚠️ **파견은 등반을 절대 막지 않는다.** 잠금 교착(`isSquadLocked` 주석)과 같은 모양의
   * 위험이다 — 해제가 다른 행동의 성공에 의존하면 "영웅이 묶였는데 풀 방법이 없는" 상태가
   * 생긴다. 그래서 `recallDispatch`는 **무조건** 성공한다.
   */
  dispatches: Dispatch[];
  /**
   * 직전 층 돌파에서 정산된 모험 결과. 화면 표시용이며 저장하지 않는다.
   * (`questGrants`와 같은 성격 — 다음 전투가 시작되면 의미가 없다)
   */
  adventureOutcomes: AdventureOutcome[];
  /**
   * 이번 전투에 들려 보낸 개수.
   *
   * 개입으로 재시뮬레이션할 때 같은 값을 넘겨야 재현성이 유지된다 —
   * seed·interventions와 같은 이유로 전투 중 상태이며 저장하지 않는다.
   */
  carriedPotions: number;
  /**
   * 이번 층에 산 준비 한 수. 없으면 null. STEP 49.
   *
   * 개입·포션과 같은 **전투 전 입력**이다 — 같은 시드 + 같은 준비 = 같은 `BattleEvent[]`.
   * ⚠️ **`intervene()`이 이 값을 반드시 다시 넘겨야 한다.** 한쪽에서 빠지면
   * 개입할 때마다 준비 효과가 사라진다(아래 `intervene` 주석 참조).
   *
   * ⚠️ **저장하지 않는다.** `seed`·`interventions`·`carriedPotions`와 같은 자리다.
   * 한 층에만 유효한 값이라 저장하면 새로고침으로 되살아나거나 다음 층에 샌다.
   */
  prep: PrepId | null;
  /**
   * 들고 가는 책략 카드(최대 `STRATAGEM_SLOTS`장, 슬롯 순서 = 발동 우선순위). 저장한다.
   *
   * 준비(`prep`)와 달리 층에 묶이지 않는다 — 매 전투 다시 꽂는 잡일이 되면 안 된다.
   * ⚠️ `start()`와 `intervene()`이 **같은 값**을 넘겨야 한다(`battleInputs` 하나로 모았다).
   */
  stratagemLoadout: StratagemId[];
  /**
   * 적의 내성 — 같은 책략을 연속으로 쓰면 쌓이고, 쉬면 빠진다(`nextResist`). 저장한다.
   * 저장하지 않으면 새로고침으로 적의 기억이 지워져 같은 책략 하나로 탑을 민다.
   */
  stratagemResist: Partial<Record<StratagemId, number>>;
  /**
   * 군령 — 퇴각 방침. HP가 이 이하면 그 영웅은 전투에서 빠진다(생존). 저장한다.
   * 작전 카드 중 공격·보호 방침은 측정에서 독주·무효로 나와 화면에서 뺐다(2026-09-29).
   */
  fallback: FallbackOrder;
  /**
   * 층 맵에서 고른 경로(0부터). 접점 지형이 책략 성공률을 바꾼다. 기획서 2단계.
   *
   * ⚠️ **저장하지 않는다 — 준비(`prep`)와 같은 자리다.** 맵은 층마다 다르므로 이 값은
   * 그 층에서만 뜻이 있다. 비우는 지점도 준비와 같다: `finish()` · `selectFloor()` · `hydrate()`.
   */
  route: number;
  /**
   * 정찰자 — 브리핑에서 고른 한 명. 보고(적 수·전력·접점·위기 창)가 이 사람의 기질대로 틀린다.
   * null이거나 출전 명단에 없으면 첫 번째 출전자다(`resolveScout`). 기획서 3단계.
   *
   * ⚠️ **저장하지 않는다 — 경로(`route`)와 같은 자리다.** 비우는 지점도 같다:
   * `finish()` · `selectFloor()` · `hydrate()`.
   */
  scout: HeroInstId | null;
  /**
   * 이번 전투의 정찰 보고. `start()`가 브리핑과 **같은 함수**(`scoutReport`)로 만든다.
   * 전투 화면이 위기 창 시점을, 결과 화면이 "보고와 실제"를 이걸로 읽는다.
   * 전투 입력이 아니다 — `intervene()`은 건드리지 않는다. result와 같은 이유로 저장하지 않는다.
   */
  report: ScoutReport | null;
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
  /**
   * 현재 회차 (1부터). 무덤(legacy)이 정본이고 여기는 표시용 사본이다.
   * 저장 대상이 아니다 — 회차 시작 시 legacy에서 다시 읽는다.
   */
  runNo: number;
}

export interface RunActions {
  /**
   * 편성 토글. 이미 그 군이면 빼고, 다른 군이면 옮기고, 없으면 넣는다.
   * 잠긴 군·정원 초과·죽은 영웅·없는 id는 조용히 무시한다.
   */
  toggleSquadMember: (squad: number, id: HeroInstId) => void;
  /**
   * 즐겨찾기 표식을 켜고 끈다. 죽은 영웅과 없는 id는 무시한다.
   * 전투·밸런스에 영향이 없다 — 제물 확인 창의 기준일 뿐이다.
   */
  toggleFavorite: (id: HeroInstId) => void;
  /** 전투 시작. 지정한 군이 비어 있으면 아무 일도 하지 않고 false를 반환한다. */
  start: (squad?: number) => boolean;
  /** 개입 — 같은 시드로 재시뮬레이션한다. */
  intervene: (next: Intervention[]) => void;
  /** 전투 종료 처리. 퍼머데스가 반영되는 유일한 지점. */
  finish: () => void;
  /**
   * 도전할 층을 고른다. 해금 상한 안에서만 움직인다.
   * 최전선 진행은 `maxFloorReached`가 맡으므로 여기서는 안 건드린다.
   */
  selectFloor: (index: number) => void;
  /**
   * 회차 시작. 런을 전부 버리고 1층부터 다시 시작한다.
   *
   * **되돌릴 수 없다.** 호출 전에 반드시 확인 창을 거칠 것 (합성 제물과 같은 원칙).
   * 무덤(사망자 명부·등반 기록·도감)은 보존된다.
   */
  startNewRun: () => void;
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
  /**
   * 이 층의 준비 한 수를 산다. 층당 1개.
   *
   * ⚠️ 금은 여기서 **즉시** 빠지지만 `saveRun`을 부르지 않는다 —
   * 준비 자체가 저장 대상이 아니라서, 여기서 저장하면 금만 빠진 상태가 굳는다.
   * 확정은 `finish()`의 저장이 맡는다.
   */
  buyPrep: () => BuyPrepResult;
  /**
   * 책략 슬롯에 카드를 꽂는다(null이면 비운다). 잠긴 카드·전투 중·범위 밖 슬롯은 거부.
   * 이미 다른 슬롯에 있는 카드를 꽂으면 **자리를 바꾼다** — 같은 카드 두 장은 없다.
   */
  setStratagemSlot: (slot: number, id: StratagemId | null) => boolean;
  /** 군령(퇴각 방침)을 정한다. 전투 중에는 거부 */
  setFallback: (order: FallbackOrder) => boolean;
  /** 이 층의 경로를 고른다. 맵 밖 번호·전투 중은 거부 */
  setRoute: (index: number) => boolean;
  /** 정찰자를 고른다. 출전 명단 밖·전투 중은 거부 */
  setScout: (id: HeroInstId) => boolean;
  /** 영웅을 시설에 배치한다. 슬롯이 차 있거나 이미 묶인 영웅이면 거부된다 */
  assign: (kind: AssignableFacility, id: HeroInstId) => AssignResult;
  /**
   * 배치를 푼다.
   *
   * ⚠️ **무조건 성공한다** — `recallDispatch`와 같은 원칙이다.
   * 해제에 조건을 달면 "묶였는데 풀 방법이 없는" 교착이 생긴다.
   */
  unassign: (id: HeroInstId) => void;
  /** 숙소 휴식 — 금을 내고 살아있는 영웅 전원의 HP를 즉시 만피로 되돌린다. */
  rest: () => RestResult;
  /** 상점 구매. 금으로 장비를 사서 창고에 넣는다. */
  buyGear: (defId: GearDefId) => BuyGearResult;
  /** 장비 착용. 같은 슬롯에 있던 것은 자동으로 창고로 돌아간다. */
  equipGear: (heroId: HeroInstId, gearId: GearInstId) => EquipGearResult;
  /**
   * 가져오기 — 다른 영웅이 낀 장비를 **명시적으로** 옮겨 낀다. 창고의 장비면 착용과 같다.
   * `equipGear`는 남의 장비를 막는다(조용히 뺏으면 그쪽 전투력이 말없이 떨어진다) —
   * 이 액션은 화면이 그 하락을 보여 준 뒤에만 부른다.
   */
  takeGear: (heroId: HeroInstId, gearId: GearInstId) => TakeGearResult;
  /** 장비 해제 */
  unequipGear: (heroId: HeroInstId, slot: GearSlot) => void;
  /** 장비 강화. 실패해도 파괴되지 않고 금만 잃는다. */
  enhanceGear: (gearId: GearInstId) => EnhanceGearResult;
  /**
   * 제작 — 재료를 유물로 바꾼다. **확률이 없다**(`game/craft.ts` 주석 참조):
   * 성공하면 반드시 나오고, 조건이 안 되면 아무것도 소모되지 않는다.
   */
  craftGear: (defId: GearDefId) => CraftResult;
  /**
   * 재련 — 유물의 단계를 하나 올린다. **확률이 없다.** 착용 중에도 된다.
   * 조건이 안 되면 아무것도 소모되지 않는다(`game/craft.ts`의 `refine`).
   */
  refineGear: (gearId: GearInstId) => RefineGearResult;
  /** 포션 구매 */
  buyPotion: (count?: number) => BuyPotionResult;
  /**
   * 모험 파견. 실패(해금 전/인원 불일치/이미 나간 영웅/사망자)는 예외가 아니라
   * 결과로 돌아온다 — summon()/fuse()와 같은 원칙이며 실패 시 상태는 그대로다.
   */
  dispatchAdventure: (advId: AdventureId, heroIds: HeroInstId[]) => DispatchResult;
  /**
   * 조기 복귀 — 보상을 포기하고 즉시 데려온다.
   *
   * ⚠️ **어떤 조건도 붙이면 안 된다.** 이것이 교착 방지의 유일한 탈출구다.
   * 금도 받지 않고, 완료 여부도 보지 않고, 파티가 비었는지도 묻지 않는다.
   * 조건이 하나라도 붙는 순간 "영웅이 묶였는데 풀 방법이 없는" 상태가 가능해진다
   * (`isSquadLocked` 주석의 잠금 교착과 같은 모양이다).
   */
  recallDispatch: (index: number) => void;
  /**
   * 저장된 런을 불러와 상태에 얹는다.
   * 전투 중 상태는 받지 않는다 — 복원 시점은 항상 대기실이다.
   */
  hydrate: (saved: SavedRun) => void;
  /** 테스트/신규 런용 초기화 */
  reset: (seedSource?: SeedSource) => void;
  /**
   * 테스트용 재화 지급. 개발 모드 전용이며 프로덕션에서는 아무 일도 하지 않는다.
   * 세부 사항은 `devWallet.ts` 참조.
   */
  grantTestFunds: () => void;
}

export type RunStore = RunSlice & RunActions;

/** 시설 업그레이드 결과. 실패 사유를 화면이 문구로 바꿔 보여준다. */
export type FacilityUpgradeResult =
  | { ok: true; kind: FacilityKind; level: number; spent: number }
  | { ok: false; reason: 'max-level' | 'not-enough-gold' };

/**
 * 배치 결과.
 *
 * `already-assigned`는 다른 시설에 이미 있는 경우다 — 한 영웅이 두 자리를 채우면
 * 산출이 두 번 세어진다. `away`는 파견 중 — 둘 다 "대기실에 없는" 상태라
 * 겹치면 유휴 exp 제외가 이중으로 걸린다.
 */
/**
 * 준비 구매 결과.
 *
 * `already-bought`는 층당 1개 제한이다 — 여러 개를 쌓으면 상승폭이 누적되어
 * 상층 완주율에 직결된다.
 */
export type BuyPrepResult =
  | { ok: true; prep: PrepId; spent: number }
  | { ok: false; reason: 'not-enough-gold' | 'already-bought' | 'in-battle' };

export type AssignResult =
  | { ok: true; kind: AssignableFacility; id: HeroInstId }
  | { ok: false; reason: 'no-slot' | 'already-assigned' | 'away' | 'dead-hero' };

export type BuyGearResult =
  | { ok: true; gear: GearInstance; spent: number }
  | { ok: false; reason: 'not-sold' | 'not-enough-gold' | 'locked' };

export type TakeGearResult =
  | { ok: true; from: HeroInstId | null; unequipped: GearInstId | null }
  | Exclude<EquipGearResult, { ok: true }>;

export type EquipGearResult =
  | { ok: true; unequipped: GearInstId | null }
  | { ok: false; reason: 'not-owned' | 'hero-dead' | 'equipped-elsewhere' | 'no-hero' };

export type EnhanceGearResult =
  | { ok: true; success: boolean; enhance: number; spent: number }
  | { ok: false; reason: 'max-enhance' | 'not-enough-gold' | 'not-owned' };

export type RefineGearResult = RefineResult | { ok: false; reason: 'not-owned' };

export type BuyPotionResult =
  | { ok: true; count: number; spent: number }
  | { ok: false; reason: 'not-enough-gold' };

export type RestResult =
  | { ok: true; healed: number; heroes: number; spent: number }
  | { ok: false; reason: 'not-enough-gold' | 'already-full'; cost?: number };

export type DispatchResult =
  | { ok: true; dispatch: Dispatch }
  | {
    ok: false;
    reason: 'unknown-adventure' | 'locked' | 'wrong-party-size' | 'already-away' | 'dead-hero';
  };

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

/**
 * 시작 로스터를 도감에 올린다.
 *
 * ⚠️ 예전엔 `codex: {}`로 시작해서 **처음 받은 6인이 도감에 없었다.**
 * 도감은 "어떤 종류를 만났는가"의 기록인데 시작 파티를 빼면 거짓말이 되고,
 * 이들이 죽어도 `recordLoss`가 조용히 무시한다(항목이 없으면 no-op).
 *
 * `firstAcquiredAt: 0`은 "시작부터 있었다"는 뜻이다. 소환으로 얻은 것과
 * 구분되지만 화면은 그 차이를 쓰지 않는다 — 만난 것은 만난 것이다.
 */
function registerInitialCodex(
  roster: readonly HeroInstance[],
): Record<HeroDefId, CodexEntry> {
  let codex = {} as Record<HeroDefId, CodexEntry>;
  for (const h of roster) codex = registerCodex(codex, h, 0);
  return codex;
}

/**
 * 무덤 도감 + 런 도감 병합.
 *
 * ⚠️ **`{ ...legacy, ...run }`로 덮으면 안 된다** — 실측으로 잡힌 버그다(2026-08-26).
 * 런 도감은 **상실을 기록하지 않는다**(`recordLoss`는 무덤에만 쓴다).
 * 그래서 런 값으로 통째로 덮으면 누적된 `timesLost`가 0으로 되돌아간다.
 * 새로고침이 끼면 런 도감이 0인 채로 복원되므로 실제로 이 경로를 탄다 —
 * 같은 종류를 두 번 잃어도 도감에는 1로 남았다.
 *
 * **필드마다 정본이 다르다.** 획득 수·최고 등급은 런이 최신이고(소환이 런에서 일어난다),
 * 상실 수는 무덤이 최신이다. 그래서 항목별로 더 큰 쪽을 남긴다.
 * 최초 획득 시각만 반대로 **이른 쪽**을 남긴다.
 */
function mergeCodex(
  legacy: Record<HeroDefId, CodexEntry>,
  run: Record<HeroDefId, CodexEntry>,
): Record<HeroDefId, CodexEntry> {
  const out = { ...legacy };
  for (const [id, e] of Object.entries(run) as [HeroDefId, CodexEntry][]) {
    const prev = out[id];
    out[id] = prev
      ? {
        ...e,
        timesAcquired: Math.max(prev.timesAcquired, e.timesAcquired),
        timesLost: Math.max(prev.timesLost, e.timesLost),
        highestStarReached: Math.max(prev.highestStarReached, e.highestStarReached) as Star,
        firstAcquiredAt: Math.min(prev.firstAcquiredAt, e.firstAcquiredAt),
      }
      : e;
  }
  return out;
}

/**
 * 저장된 도감에 **빠진 종류만** 채운다.
 *
 * 기존 세이브는 도감이 비어 있거나 소환분만 갖고 있다(시작 로스터가 빠져 있다).
 * 그대로 로드하면 도감이 "기록 0 / 12"로 뜬다 — 실제로 6명을 데리고 있는데도.
 *
 * ⚠️ **이미 있는 항목은 절대 다시 등록하지 않는다.** `registerCodex`는
 * `timesAcquired`를 올리므로, 새로고침할 때마다 돌면 획득 수가 계속 부풀려진다.
 * 세이브를 고쳐 쓰지 않고 **읽는 시점에만 메우는** 이유도 같다 —
 * 마이그레이션으로 처리하면 `SAVE_VERSION`을 올려야 하는데,
 * 이건 파생 가능한 값이라 스키마를 건드릴 일이 아니다.
 */
function backfillCodex(
  saved: Record<HeroDefId, CodexEntry>,
  roster: readonly HeroInstance[],
): Record<HeroDefId, CodexEntry> {
  let codex = saved;
  for (const h of roster) {
    if (codex[h.defId]) continue;
    codex = registerCodex(codex, h, 0);
  }
  return codex;
}

/**
 * 군령·책략 — 전투 입력. **`start()`와 `intervene()`이 둘 다 이 함수 하나를 부른다.**
 *
 * 준비(`applyPrep`)에서 배운 것: 입력 변환이 두 곳에 적히면 한쪽이 빠지는 순간
 * 개입(후퇴 신호)할 때마다 책략이 조용히 증발한다. 판정 난수는 전투 시드에서
 * `STREAM.STRATAGEM`으로 판다 — 같은 시드로 다시 돌리면 같은 판정이 나온다.
 *
 * 잠긴 카드는 여기서도 거른다(세이브·스토어 검증과 이중 방어).
 */
function battleInputs(
  s: Pick<RunSlice, 'stratagemLoadout' | 'stratagemResist' | 'fallback' | 'maxFloorReached' | 'floorIndex' | 'route'>,
  seed: number,
) {
  const map = floorMapOf(floorAt(s.floorIndex));
  return {
    orders: { ...DEFAULT_ORDERS, fallback: s.fallback } as Orders,
    stratagems: {
      ids: s.stratagemLoadout.filter((id) => isStratagemUnlocked(id, s.maxFloorReached)),
      resist: s.stratagemResist,
      // 고른 경로의 접점 지형 — 책략 성공률에만 닿는다
      terrain: contactTerrain(map, clampRoute(map, s.route)),
      rng: substream(seed, STREAM.STRATAGEM),
    },
  };
}

function freshSlice(): RunSlice {
  const roster = initialRoster();
  return {
    floorIndex: 0,
    maxFloorReached: 0,
    revisits: {},
    towerCleared: false,
    roster,
    squads: [roster.slice(0, 3).map((h) => h.instId), []],
    lockedSquad: null,
    lastSortieSquad: 0,
    wallet: initialWallet(),
    gacha: initialGachaState(0),
    codex: registerInitialCodex(roster),
    facilities: { rest: 0, training: 0, forge: 0, armory: 0 },
    // 회차를 넘기지 않는다 — gdd-v3 §7, 계승은 기록뿐이다
    assignments: { training: [], forge: [] },
    gear: [],
    gearSeq: 0,
    battleCount: 0,
    potions: 0,
    materials: {},
    dispatches: [],
    adventureOutcomes: [],
    carriedPotions: 0,
    prep: null,
    stratagemLoadout: defaultLoadout(),
    stratagemResist: {},
    fallback: DEFAULT_ORDERS.fallback,
    route: 0,
    scout: null,
    report: null,
    claimedQuests: [],
    questGrants: [],
    seenFirstLegendary: false,
    seed: 0,
    interventions: [],
    result: null,
    snapshot: [],
    deathCount: 0,
    runNo: 1,
  };
}

/**
 * 특정 군의 편성원.
 *
 * 지금은 전투에 나가는 군이 항상 1군(0번)이다 — 2군은 "층 선택으로 파밍하는" 쪽이라
 * 출전 자체는 같은 경로를 탄다(턴제: 한 번에 한 군). 어느 군이 나가는지는 호출부가 정한다.
 */
export function squadMembers(s: Pick<RunSlice, 'squads'>, squad: number): HeroInstId[] {
  return s.squads[squad] ?? [];
}

/**
 * 숙소 휴식 견적 — 부상자·잃은 HP 총합·비용.
 *
 * ⚠️ **화면과 스토어가 같은 함수를 써야 한다.** 비용 산식이 두 곳에 생기면
 * "표시된 금액과 실제 청구액이 다르다"가 된다 — 합성소에서 이미 겪은 함정이다
 * (ForgeScreen이 전환율을 하드코딩해 표시와 결과가 갈렸다).
 *
 * ⚠️ `currentHp === 0`은 **만피**를 뜻하지 빈사가 아니다(freshHero 주석).
 * 0을 부상으로 읽으면 멀쩡한 영웅에게 돈을 받게 된다.
 */
export function restQuote(roster: HeroInstance[]) {
  const injured = roster
    .filter((h) => !h.isDead)
    .map((h) => {
      const max = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling).hp;
      const cur = h.currentHp === 0 ? max : h.currentHp;
      return { h, max, missing: Math.max(0, max - cur) };
    })
    .filter((x) => x.missing > 0);

  const missingTotal = injured.reduce((n, x) => n + x.missing, 0);
  return {
    injured,
    missingTotal,
    /** 부상자가 없으면 null — 화면은 이걸로 버튼을 끈다 */
    cost: missingTotal === 0
      ? null
      : Math.max(REST_COST_MIN, missingTotal * REST_COST_PER_HP),
  };
}

/**
 * 이 군이 지금 편성 잠금 상태인가.
 *
 * ⚠️ **전멸한 군은 잠그지 않는다.** 잠금 해제는 `start()` 안에서만 일어나는데,
 * 그 군에 살아있는 사람이 없으면 `start()`가 실패해서 **해제가 영영 안 돈다.**
 * 보충 편성까지 막히므로 "영웅이 죽었는데 탑을 오를 수 없는" 교착이 된다
 * (실기기에서 보고됨). 잠금의 목적은 "이긴 파티를 그대로 다음 층에"이지
 * 진행을 막는 것이 아니다.
 */
/**
 * 조건을 만족하지 않는 영웅을 모든 배치에서 뺀다.
 *
 * 사망·제물 두 경로가 같은 청소를 해야 하므로 한 곳에 둔다 — 한쪽만 고치면
 * 다른 쪽에서 유령이 남고, 그 슬롯은 해제할 방법이 없어 영영 잠긴다.
 */
export function pruneAssignments(
  assignments: Record<AssignableFacility, HeroInstId[]>,
  keep: (id: HeroInstId) => boolean,
): Record<AssignableFacility, HeroInstId[]> {
  return {
    training: assignments.training.filter(keep),
    forge: assignments.forge.filter(keep),
  };
}

export function isSquadLocked(
  s: Pick<RunSlice, 'squads' | 'lockedSquad' | 'roster' | 'maxFloorReached'>, squad: number,
): boolean {
  if (s.lockedSquad !== squad) return false;

  /*
    ⚠️ **2군이 열리기 전에는 잠그지 않는다.**
    잠금은 "이번엔 어느 군을 보낼까"가 선택일 때만 리듬이 된다. 군이 하나뿐이면
    고를 것이 없어서 리듬 장치가 아니라 그냥 "전투 후엔 편성 금지"가 된다 —
    초반 내내 편성이 막힌다(실기기에서 "편성이 되질 않아"로 보고됨).
  */
  if (!squadsOpen(livingHeroes(s.roster).length, FLOORS[s.maxFloorReached].id)) return false;

  return squadMembers(s, squad).some((id) => {
    const h = s.roster.find((x) => x.instId === id);
    return !!h && !h.isDead;
  });
}

/**
 * 스토어 본체를 만든다. 테스트는 이 팩토리로 격리된 인스턴스를 얻는다.
 * (전역 훅 하나만 두면 테스트끼리 상태가 새어나간다)
 */
export function createRunStore(seedSource: SeedSource = defaultSeedSource) {
  return create<RunStore>((set, get) => ({
    ...freshSlice(),

    toggleSquadMember: (squad, id) =>
      set((s) => {
        // 잠긴 군은 못 바꾼다. 화면도 막지만 스토어가 정본이다.
        if (isSquadLocked(s, squad)) return {};
        if (squad < 0 || squad >= SQUAD_COUNT) return {};

        const hero = s.roster.find((h) => h.instId === id);
        // 없는 id·죽은 영웅은 무시한다. 죽은 자를 편성하면 유령 참조가 된다.
        if (!hero || hero.isDead) return {};

        const limit = partyLimitAt(FLOORS[s.floorIndex].id);
        const cur = s.squads[squad] ?? [];

        // 같은 군에 이미 있으면 뺀다
        if (cur.includes(id)) {
          const next = s.squads.map((m, i) => (i === squad ? m.filter((x) => x !== id) : m));
          return { squads: next };
        }

        /*
          ⚠️ **빼는 것은 위에서 이미 처리했다.** 파견 검사는 **넣을 때만** 한다 —
          넣기 전에 막으면 "나가 있는 동안 파티에서 뺄 수도 없는" 상태가 생기고,
          그건 잠금 교착과 같은 모양이다(`isSquadLocked` 주석).
          나가 있는 사람을 편성하면 정원만 차지한 채 전투에 안 나온다.
        */
        if (dispatchedHeroIds(s.dispatches).has(id)) return {};

        if (cur.length >= limit) return {};

        /*
          다른 군에 들어 있으면 거기서 빼고 여기로 옮긴다.
          막지 않는 이유: UI에서 "이동"이 조작 수가 적다. 금지는 스토어가
          "두 군에 동시에 못 든다"로만 지키면 된다.
          단, 상대 군이 잠겨 있으면 옮길 수 없다 — 잠금이 우회되기 때문이다.
        */
        const owner = s.squads.findIndex((m) => m.includes(id));
        if (owner !== -1 && isSquadLocked(s, owner)) return {};

        const next = s.squads.map((m, i) => {
          if (i === owner) return m.filter((x) => x !== id);
          if (i === squad) return [...m, id];
          return m;
        });
        return { squads: next };
      }),

    toggleFavorite: (id) => {
      const hero = get().roster.find((h) => h.instId === id);
      // 죽은 자의 표식은 고정된다 — 무덤 기록이 사후에 편집되면 안 된다.
      if (!hero || hero.isDead) return;

      set((s) => ({
        roster: s.roster.map((h) => (h.instId === id ? { ...h, favorite: !h.favorite } : h)),
      }));
      // 제물 확인 창의 기준이라, 새로고침으로 풀리면 안전장치가 조용히 사라진다.
      saveRun(get());
    },

    start: (squad = 0) => {
      const { roster, floorIndex, potions } = get();
      /*
        ⚠️ **나가 있는 영웅은 출전에서 뺀다.** 편성해둔 뒤에 파견을 보내면
        명단에는 남아 있는데 마을에 없는 상태가 되는데, 그대로 내보내면
        모험 중인 사람이 탑에서 싸우고 심지어 죽는다.

        **여기서 false를 돌려주면 안 된다** — 남은 인원이 있으면 그들로 간다.
        전원이 나가 있어야만 실패한다. 파견이 등반을 막는 순간 교착이다.
      */
      const away = dispatchedHeroIds(get().dispatches);
      const members = squadMembers(get(), squad)
        .map((id) => roster.find((h) => h.instId === id))
        .filter((h): h is HeroInstance => !!h && !h.isDead && !away.has(h.instId));
      if (members.length === 0) return false;

      /**
       * 들고 갈 포션. 보유량과 전투당 상한 중 작은 쪽이다.
       *
       * 유저가 개수를 고르게 하지 않는다 — 매 전투 전에 슬라이더를 만지는 건
       * 결정이 아니라 잡일이고, 어차피 최적해는 "항상 최대"다.
       */
      const carried = Math.min(potions, POTION_TUNING.maxPerBattle);

      const seed = seedSource();

      /*
        정찰 보고 — 브리핑이 보여 준 것과 같은 함수·같은 정찰자 규칙이다.
        어긋나면 브리핑의 보고와 전투의 위기 창이 서로 다른 사람의 말이 된다.
      */
      const scoutHero = resolveScout(members, get().scout);
      const report = scoutHero
        ? scoutReport(scoutHero, floorAt(floorIndex), floorMapOf(floorAt(floorIndex)), gameData)
        : null;

      /**
       * 준비 한 수를 전투 입력에 반영한다.
       *
       * ⚠️ **`intervene()`도 정확히 같은 변환을 해야 한다.** 한쪽에서 빠지면
       * 개입하는 순간 준비 효과가 사라져 "같은 시드 + 같은 입력 = 같은 결과"가 깨진다.
       */
      const prepped = applyPrep(floorAt(floorIndex), prepById(get().prep));

      set({
        seed,
        carriedPotions: carried,
        interventions: [],
        // 지난 전투의 과제 달성 표시가 결과 화면에 남으면 안 된다
        questGrants: [],
        snapshot: roster,
        lastSortieSquad: squad,
        lockedSquad: null,
        report,
        result: runEncounter({
          party: members,
          floor: prepped.floor,
          data: gameData,
          rng: createRng(seed),
          allyAtkMult: armoryAtkMult(get().facilities.armory) * prepped.atkMult,
          inventory: gearIndex(get().gear),
          potions: carried,
          ...battleInputs(get(), seed),
        }),
      });
      return true;
    },

    /**
     * 재생 중인 화면을 조작하는 게 아니라 입력을 바꿔 재시뮬레이션하는 방식이다.
     * 이래야 "같은 시드 + 같은 개입 = 같은 결과"라는 재현성이 유지된다.
     */
    intervene: (next) => {
      const {
        snapshot, seed, floorIndex, facilities, carriedPotions, lastSortieSquad, prep,
      } = get();
      const party = squadMembers(get(), lastSortieSquad);
      /*
        ⚠️ start()와 **같은 명단**이어야 한다 — 나가 있는 영웅을 빼지 않으면 후퇴 신호를 쓰는
        순간 모험 중인 사람이 탑에 들어와 싸우고 죽을 수 있다(STEP 65 리뷰에서 발견).
      */
      const away = dispatchedHeroIds(get().dispatches);
      const members = snapshot.filter((h) => party.includes(h.instId) && !h.isDead && !away.has(h.instId));
      if (members.length === 0) return;

      // start()와 **같은 변환**이어야 한다. 이 줄이 빠지면 개입하는 순간 준비가 증발한다.
      const prepped = applyPrep(floorAt(floorIndex), prepById(prep));

      set({
        interventions: next,
        result: runEncounter({
          party: members,
          floor: prepped.floor,
          data: gameData,
          rng: createRng(seed),
          interventions: next,
          // start()와 같은 입력을 넘겨야 한다. 빠뜨리면 개입만으로 전투가 달라져 재현성이 깨진다.
          allyAtkMult: armoryAtkMult(facilities.armory) * prepped.atkMult,
          inventory: gearIndex(get().gear),
          potions: carriedPotions,
          // start()와 같은 군령·책략. 빠지면 후퇴 신호를 쓰는 순간 책략이 증발한다
          ...battleInputs(get(), seed),
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
       * 재도전 보상 체감 계수. 최전선 첫 도전이면 정확히 1.0이라
       * 기존 밸런스 기준선이 보존된다 (`revisit.test.ts`가 이 값을 잠근다).
       *
       * exp·gold·승급석에만 곱한다. 과제 보상(questGold/questStones)에는 곱하지 않는다 —
       * claimedQuests가 이미 재수령을 막으므로 파밍 대상이 아니다.
       */
      const curFloorId = FLOORS[get().floorIndex].id;
      const maxFloorId = FLOORS[get().maxFloorReached].id;
      const mult = revisitMultiplier(curFloorId, maxFloorId, get().revisits[curFloorId] ?? 0);
      const scaledGold = Math.round((reward?.gold ?? 0) * mult);
      const scaledStones = Math.round((reward?.promotionStones ?? 0) * mult);
      const scaledExp = Math.round((reward?.exp ?? 0) * mult);

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
      /*
        전리품 판정은 **game/loot.ts의 `rollFloorLoot` 하나**가 맡는다.
        회수 → 장비 → 재료의 소비 순서가 결과를 좌우하는데(실측: 순서를 바꾸면
        200시드 중 120개에서 장비 드롭이 달라졌다), 그 순서가 여기와 결과 화면
        미리보기 두 곳에 적히면 조용히 갈라진다 — 과제가 `questRng`를 밖으로 뺀 것과
        같은 이유다.
      */
      const casualtyGear = get().roster
        .filter((h) => casualties.has(h.instId))
        .map((h) => h.gear);
      const loot = rollFloorLoot({
        seed: get().seed,
        floorId: floorSpec.id,
        isBoss: !!floorSpec.isBoss,
        battleCount: get().battleCount,
        casualties: casualtyGear,
        cleared,
      });

      const freedGear = new Set<GearInstId>(loot.recovered);
      const lostGear = new Set<GearInstId>(loot.lost);
      /** 층 드롭. instId 발번은 스토어 몫이라 여기서 붙인다 */
      const dropped: GearInstance[] = loot.gearDefId
        ? [makeGear(loot.gearDefId, get().gearSeq + 1)]
        : [];
      const droppedMaterials = loot.materials;

      /**
       * 전투 후 잔여 HP. 엔진이 계산해 주던 것을 예전에는 버리고 있었다
       * (= 매 층을 만피로 시작). 시설(숙소)이 의미를 가지려면 소모가 남아야 한다.
       */
      /**
       * 실제로 터진 포션 수. 이벤트 로그가 유일한 진실이다 —
       * 엔진이 몇 개 썼는지는 여기서만 알 수 있다.
       */
      const potionsUsed = result.events.filter((e) => e.type === 'heal' && e.fromPotion).length;

      /**
       * towerCleared는 sticky다("|| " 로만 켜지고 꺼지지 않는다) — 최상층을 이미 깬 뒤
       * 재도전해도 계속 true다. set() 이후의 after.towerCleared만 보면 "방금 막 클리어했다"와
       * "이미 클리어된 채로 다시 싸웠다"를 구분할 수 없어서, 재도전 중 사상자가 나오면
       * 그 시점의(생존자가 줄어든) 파티로 정상 기록이 재작성된다. set() 이전 값을 미리
       * 떼어 둬야 "방금 전환됐는가"를 판정할 수 있다.
       */
      const wasCleared = get().towerCleared;

      const survivedHp = new Map(result.survivors.map((s) => [s.instId as string, s.currentHp]));
      const healRate = restHealRate(get().facilities.rest);
      /**
       * 배치된 영웅 전체 — 유휴 exp에서 빼는 데 쓴다(파견의 `awayNow`와 같은 이유).
       * 배치자는 exp 대신 시설 산출을 올리므로, 둘 다 받으면 배치가 순이득이 되어
       * "일단 다 배치하기"가 유일한 최적해가 된다.
       */
      const assignedNow = new Set<string>(
        ASSIGNABLE.flatMap((k) => get().assignments[k] as string[]),
      );

      /**
       * 훈련소 유휴 exp·모험 정산 — **`settleOffTower` 하나**가 맡는다.
       * 결과 화면이 같은 함수로 미리 보여주므로 규칙을 여기에 다시 적지 말 것.
       * 출전한 배치자 제외·완료 판정(battleCount + 1)·승패 무관 정산·파견자/배치자의
       * 유휴 exp 제외와 그 이유는 전부 `game/offTower.ts`에 있다.
       */
      const off = settleOffTower({
        roster: get().roster,
        dispatches: get().dispatches,
        assignedIds: assignedNow,
        trainingAssigned: get().assignments.training,
        trainingLevel: get().facilities.training,
        battleCount: get().battleCount,
        seed: get().seed,
        fought,
        casualties,
        cleared,
        tier: unlockedTierOf(FLOORS[get().maxFloorReached].id),
      });

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

      /**
       * 책략 — 이번 전투의 장면을 수행자 연대기에 붙이고, 적의 내성을 갱신한다.
       * 결과 화면과 **같은 함수**(`chronicleOf`)로 읽어 기록이 갈리지 않게 한다.
       * 내성은 **실제로 발동한** 책략만 센다 — 들고만 갔으면 적은 모른다.
       */
      const scenes = chronicleOf(result.events, result.roster);
      const newDeeds = deedsOf(scenes, floorSpec.id);
      const usedStratagems = scenes.map((c) => c.stratagemId);

      const questGear = grants.map((g) => g.gear).filter((g): g is GearInstance => g != null);
      /** 모험 정예(장비 사다리) — 발번은 드롭·과제 다음 번호부터 */
      const advGear = off.outcomes
        .map((o) => o.gearDefId)
        .filter((id): id is GearDefId => id != null)
        .map((id, k) => makeGear(id, get().gearSeq + dropped.length + questGear.length + k + 1));
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
             *
             * 재도전 체감 계수(mult)가 곱해진 scaledExp를 쓴다 — 최전선 첫 도전은
             * mult가 1.0이라 기존 지급량과 완전히 같다.
             */
            if (reward && !casualties.has(h.instId)) {
              next = gainExp(next, scaledExp, gameData.starScaling).hero;
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
          } else {
            /**
             * 탑 밖 — 훈련소 유휴 exp와 모험 귀환(exp·부상).
             * 파견자·배치자를 유휴 exp에서 빼는 이유("배치 이득 < 출전 성장"을 구조로 지킨다),
             * HP 하한 1(모험에서는 죽지 않는다)은 `game/offTower.ts`에 있다.
             */
            next = off.after.get(h.instId) ?? next;
          }

          const gainedDeeds = newDeeds.get(h.instId);
          if (gainedDeeds) next = { ...next, deeds: appendDeeds(next.deeds, gainedDeeds) };

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
          ...advGear,
        ],
        gearSeq: s.gearSeq + dropped.length + questGear.length + advGear.length,
        claimedQuests: [...s.claimedQuests, ...grants.map((g) => g.quest.id)],
        questGrants: grants,
        // 다음 전투의 전리품이 다른 난수를 받도록 한다
        battleCount: s.battleCount + 1,
        /**
         * 포션은 **실제로 터진 만큼만** 차감한다.
         * 들고 나간 수를 그냥 빼면 안 쓰고 이긴 전투에서도 사라진다.
         */
        potions: Math.max(0, s.potions - potionsUsed) + questPotions,
        materials: mergeMaterials(mergeMaterials(s.materials, droppedMaterials), off.materials),
        // 완료된 파견은 명단에서 빠진다 — 남겨두면 영영 나가 있는 유령이 된다
        dispatches: off.stillAway,
        /**
         * 사망자는 배치에서 빠진다.
         *
         * ⚠️ 남겨두면 그 슬롯이 **영영 잠긴다** — 죽은 영웅은 화면 목록에 안 뜨니
         * 플레이어가 해제할 방법이 없다. 파견이 유령 레코드를 버리는 것과 같은 이유다.
         */
        assignments: pruneAssignments(s.assignments, (id) => !casualties.has(id)),
        adventureOutcomes: off.outcomes,
        carriedPotions: 0,
        /**
         * 준비는 그 층에서만 유효하다 — **승패와 무관하게** 비운다(사용자 결정).
         * 지면 금도 효과도 사라지고 재도전은 다시 산다. "이번 판에 거는 판돈"이라
         * 퍼머데스의 긴장과 결이 맞고, "졌으니 환불" 경로를 안 만들어 구현도 단순하다.
         */
        prep: null,
        // 경로도 그 층에서만 유효하다 — 다음 층은 맵이 다르다
        route: 0,
        scout: null,
        stratagemResist: nextResist(s.stratagemResist, usedStratagems),
        squads: s.squads.map((m) => m.filter((id) => !casualties.has(id))),
        // 출전한 군은 다음 전투까지 편성이 잠긴다
        lockedSquad: s.lastSortieSquad ?? 0,
        deathCount: s.deathCount + casualties.size,
        wallet: {
          ...s.wallet,
          gold: s.wallet.gold + scaledGold + questGold,
          promotionStones:
            s.wallet.promotionStones + scaledStones + questStones,
          /**
           * ⚠️ **모험이 각성석의 유일한 공급원이다.**
           * 여기 말고 다른 경로를 열면 ★6의 희소성이 사라진다
           * (`data/adventures.ts`의 `awakeningChance` 주석 참조).
           */
          awakeningStones: s.wallet.awakeningStones + off.awakeningStones,
        },
        /**
         * ⚠️ 클리어했을 때만 올린다. 져도 올리면 "실패로 보상을 깎는"
         * 이중 처벌이 된다 — 진 전투는 보상 자체가 없으므로 순손실이다.
         */
        revisits: cleared
          ? { ...s.revisits, [curFloorId]: (s.revisits[curFloorId] ?? 0) + 1 }
          : s.revisits,
        floorIndex: cleared
          ? Math.min(FLOORS.length - 1, s.floorIndex + 1)
          : s.floorIndex,
        /**
         * 최전선은 **`floorIndex`가 상한과 같을 때 클리어**해야 오른다.
         * 재도전(아래층)으로는 안 오른다 — 그래야 파밍이 진행을 대체하지 않는다.
         */
        maxFloorReached: cleared && s.floorIndex >= s.maxFloorReached
          ? Math.min(FLOORS.length - 1, s.maxFloorReached + 1)
          : s.maxFloorReached,
        /**
         * 최상층 클리어 표시.
         * floorIndex는 클램프되므로 "마지막 층에 있음"과 "마지막 층을 깼음"을
         * 구분할 수 없다. 이 플래그가 없으면 정상을 밟아도 같은 층이 계속 열린다.
         *
         * ⚠️ 판정 기준이 maxFloorReached다.
         * floorIndex로 하면 100층을 깬 뒤 1층에 내려가 있을 때 깨진다.
         */
        towerCleared: s.towerCleared
          || (cleared && s.floorIndex >= s.maxFloorReached && isFinalFloor(s.maxFloorReached)),
        result: null,
      }));

      /**
       * 무덤 적재 — 사망자는 **죽는 즉시** 명부에 오른다.
       * 회차가 끝날 때 몰아서 쓰면 중간에 그만둔 런의 사망자가 통째로 사라진다.
       *
       * 합성 제물은 여기 오지 않는다. casualties는 전투 사망자만 담기 때문이며,
       * 그게 맞다 — 제물은 죽음이 아니라 흡수다 (identity.ts 참조).
       */
      const after = get();
      if (casualties.size > 0 || after.towerCleared) {
        const legacy = loadLegacy();

        /**
         * after.snapshot을 쓰는 이유: 위 set()은 snapshot 필드를 건드리지 않으므로
         * start()가 채운 "전투 시작 시점 로스터"가 그대로 남아 있다 — 사망자를 찾으려면
         * 이걸 봐야 한다(사후의 s.roster에서 죽은 개체를 걸러내는 것보다 직접적이다).
         * 나중에 이 set()에 snapshot 갱신 로직이 추가되면 이 find()가 조용히 깨지니 주의할 것.
         */
        const newlyFallen: FallenRecord[] = [...casualties]
          .map((id) => after.snapshot.find((h) => h.instId === id))
          .filter((h): h is HeroInstance => h != null)
          .map((h): FallenRecord => {
            const name = displayName(h, gameData.heroes);
            /**
             * 유언 — gdd-v3 §4.10. 결과 화면과 **같은 함수·같은 입력**이라 둘이 갈리지 않는다.
             * seed 없는 옛 개체는 말하지 않으므로 필드 자체가 없다.
             * ⚠️ 외부 API로 유언을 만들지 않는다(사용자 결정, 2026-09-23 · CLAUDE.md).
             */
            const lastWords = templateLastWords(h, floorSpec.id);
            return {
              name,
              title: displayTitle(h, gameData.heroes),
              star: h.star,
              defId: h.defId,
              floorId: floorSpec.id,
              revealProgress: h.revealProgress ?? 0,
              runNo: legacy.runNo,
              ...(lastWords ? { lastWords } : {}),
              // 죽는 전투의 책략까지 — snapshot은 전투 전 로스터라 이번 장면을 따로 붙인다
              ...(() => {
                const deeds = appendDeeds(h.deeds, newDeeds.get(h.instId) ?? []);
                return deeds.length > 0 ? { deeds } : {};
              })(),
            };
          });

        /**
         * 정상에 선 파티 — towerCleared가 **막 서는 순간**(!wasCleared && after.towerCleared)의
         * 생존 파티원만 기록한다. wasCleared까지 함께 봐야 하는 이유는 위 주석 참조 —
         * 안 그러면 클리어 후 재도전에서 사상자가 난 파티로 정상 기록이 덮어써진다.
         * dedupe(`!legacy.summit.some(...)`) 때문에 한 번 잘못 쓰이면 올바른 파티로도
         * 다시는 덮어쓸 수 없으므로, 애초에 전환 시점에만 쓴다.
         *
         * heroes가 빈 배열이면 아예 append하지 않는다 — 파티 전멸 직후의 클리어처럼
         * "정상에 선 자"가 아무도 없는 경우까지 영구 기록에 남기는 건 의미가 없다.
         */
        const justCleared = !wasCleared && after.towerCleared;
        const summitHeroes = justCleared
          ? after.roster
              .filter((h) => after.squads.flat().includes(h.instId) && !h.isDead)
              .map((h) => ({
                name: displayName(h, gameData.heroes),
                title: displayTitle(h, gameData.heroes),
                star: h.star,
                defId: h.defId,
              }))
          : [];
        const summitAdd = justCleared
          && summitHeroes.length > 0
          && !legacy.summit.some((x) => x.runNo === legacy.runNo)
          ? [{ runNo: legacy.runNo, heroes: summitHeroes }]
          : [];

        /**
         * 도감의 상실 기록.
         *
         * ⚠️ `recordLoss`는 **여태 아무도 부르지 않았다**(2026-08-26 확인).
         * 함수와 필드(`CodexEntry.timesLost`)는 처음부터 있었는데 호출부가 없어
         * 항상 0이었다 — §STEP 37(각성석)·§STEP 38(유물 제작)과 같은 종류의
         * "데이터는 있는데 닿는 길이 없는" 구멍이다. 도감 화면을 만들면서 드러났다.
         *
         * 무덤(`fallen`)과 따로 세는 이유: 무덤은 **개체**의 명부이고
         * 도감은 **종류**의 집계다. 같은 defId를 세 번 잃으면 무덤엔 세 줄,
         * 도감엔 `timesLost: 3`이 남는다.
         *
         * 합성 제물은 여기 오지 않는다 — casualties는 전투 사망자만 담는다.
         * 제물은 죽음이 아니라 흡수이므로 상실로 세지 않는다(identity.ts와 같은 판단).
         */
        let nextCodex = mergeCodex(legacy.codex, after.codex);
        for (const f of newlyFallen) nextCodex = recordLoss(nextCodex, f.defId);

        saveLegacy({
          ...legacy,
          fallen: [...legacy.fallen, ...newlyFallen],
          summit: [...legacy.summit, ...summitAdd],
          codex: nextCodex,
        });
      }

      /**
       * 자동 저장. 여기가 사망이 확정되는 지점이므로 여기서 저장해야
       * 새로고침으로 퍼머데스를 무를 수 없다 (save.ts 주석 참조).
       * set() 이후에 부르는 이유는 갱신된 상태를 저장하기 위해서다.
       */
      saveRun(get());
    },

    /**
     * 도전할 층을 고른다. 해금 상한 안에서만 움직인다.
     * 최전선 진행은 `maxFloorReached`가 맡으므로 여기서는 안 건드린다.
     */
    selectFloor: (index) =>
      set((s) => ({
        floorIndex: Math.max(0, Math.min(s.maxFloorReached, Math.floor(index))),
        /**
         * ⚠️ **층을 바꾸면 준비가 무효가 된다.**
         *
         * 준비는 임무 유형에 묶여 있어서, 수비 층에서 사고 토벌 층으로 옮기면
         * 살 수 없는 것을 든 상태가 된다. `applyPrep`의 유형 검사가 효과는 막지만
         * 화면에는 "산 것"으로 남아 거짓말이 된다.
         *
         * 환불하지 않는다 — 되돌리지 않는 것이 이 게임의 원칙이다.
         * 대신 `BriefScreen`이 돌아가기 전에 경고한다.
         */
        prep: null,
        // 층이 바뀌면 맵이 바뀐다 — 옛 경로 번호가 새 맵의 엉뚱한 길을 가리키면 안 된다
        route: 0,
        scout: null,
      })),

    startNewRun: () => {
      const s = get();
      /**
       * 선행 조건은 상태가 사는 이 자리에서 강제한다.
       * GraveScreen.tsx의 UI 가드는 그대로 두되(방어의 이중화), 여기서도 막아야
       * 스토어를 직접 조작하는 어떤 호출자도 towerCleared 없이 런을 끝낼 수 없다.
       * 어기면 reachedFloor:1·cleared:false짜리 유령 기록이 runs에 남고
       * legacy.runNo가 되돌릴 수 없이 올라간다.
       */
      if (!s.towerCleared) return;
      const legacy = loadLegacy();

      /**
       * 직전 런을 기록으로 확정한다. **여기가 런의 끝**이다 —
       * 진행 중인 런은 runs에 없어야 하므로(끝나지 않았으므로) 이 시점에 append한다.
       */
      const next: Legacy = {
        ...legacy,
        runNo: legacy.runNo + 1,
        runs: [
          ...legacy.runs,
          {
            runNo: legacy.runNo,
            reachedFloor: s.floorIndex + 1,
            cleared: s.towerCleared,
            deaths: s.deathCount,
            summons: s.gacha.totalPulls,
            endedAt: Date.now(),
          },
        ],
      };
      saveLegacy(next);

      /**
       * 런을 갈아끼운다. freshSlice()를 그대로 쓰므로 **1회차와 완전히 같은 출발**이고,
       * 그래서 sim으로 잡은 층별 승률이 회차와 무관하게 유지된다.
       *
       * 도감만 예외적으로 계승한다 — 전력에 영향이 없어 밸런스가 안 움직인다.
       */
      set({ ...freshSlice(), runNo: next.runNo, codex: next.codex });
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
        /** 회차를 넘어 봉인된 이름 — 무덤의 사망자 (identity.ts 참조) */
        sealed: sealedNames(loadLegacy()),
        /** 시작 레벨(summonLevel)의 출처. 없으면 Lv.1이라 등반이 시작되지 않는다 */
        scaling: gameData.starScaling,
        /** 고유 전설 영웅 — ★5의 일부가 전설이다(gdd-v3 §4.11) */
        legends: { table: LEGENDS, share: LEGEND_SHARE_OF_STAR5 },
      });

      // 실패는 상태를 건드리지 않는다. 재화 부족/쿨다운은 정상 흐름이다.
      if (!result.ok) return result;

      set((s) => ({
        roster: [...s.roster, result.hero],
        wallet: result.wallet,
        gacha: result.gacha,
        codex: registerCodex(s.codex, result.hero, now),
      }));

      /**
       * 도감은 무덤이 정본이다 — 회차를 넘어 유지되므로 여기서도 같이 갱신한다.
       * 런 쪽 codex만 갱신하면 회차를 시작할 때 이번 회차의 발견이 사라진다.
       *
       * **반드시 병합해야 한다 — 통째로 대체하면 안 된다.**
       * 런의 codex는 무덤의 codex의 부분집합일 수 있다(예: 새로고침으로 runNo만 복원되고
       * 런 codex는 startNewRun()을 거치지 않아 비어 있는 경우). 이때 `codex: get().codex`로
       * 그대로 덮어쓰면 이전 회차들이 쌓아온 영구 도감이 통째로 사라진다.
       */
      const lg = loadLegacy();
      // 병합 규칙은 mergeCodex 하나가 갖는다 — 덮어쓰면 timesLost가 0으로 돌아간다
      const merged = { ...lg, codex: mergeCodex(lg.codex, get().codex) };
      // 전설을 만났으면 무덤에 적는다 — 도감의 전설 칸은 회차를 넘어 남는다(§4.11)
      saveLegacy(result.hero.legendId ? withLegendMet(merged, result.hero.legendId) : merged);

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
         * 합성소 레벨. 전환율은 `data/facilities.ts`의 `FORGE_RATE`가 정한다 —
         * 미건설(0)은 0.5, Lv.1부터 0.65로 시설 도입 전 밸런스를 잇는다.
         */
        target,
        sacrifice,
        facilityLevel: facilities.forge,
        /**
         * 합성소 배치 인원이 전환율을 올린다.
         *
         * ⚠️ **제물 본인이 배치돼 있으면 세지 않는다.** 자기를 바쳐 자기 전환율을
         * 올리는 것은 "일하면서 동시에 사라지는" 모순이다.
         */
        assigned: get().assignments.forge.filter((id) => id !== sacrificeId).length,
        scaling: gameData.starScaling,
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
        squads: s.squads.map((m) => m.filter((id) => id !== r.consumedInstId)),
        // 제물도 배치에서 빠진다 — 사망과 같은 이유다(유령이 슬롯을 영구 점유한다)
        assignments: pruneAssignments(s.assignments, (id) => id !== r.consumedInstId),
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

    buyPrep: () => {
      const s = get();

      // 전투 중에는 못 산다 — 브리핑에서만 유효한 결정이다
      if (s.result != null) return { ok: false, reason: 'in-battle' };
      // 층당 1개. 쌓이면 상승폭이 누적되어 상층 완주율에 직결된다
      if (s.prep != null) return { ok: false, reason: 'already-bought' };

      const def = prepForMission(floorAt(s.floorIndex).mission.kind);
      if (s.wallet.gold < def.cost) return { ok: false, reason: 'not-enough-gold' };

      set((cur) => ({
        prep: def.id,
        wallet: { ...cur.wallet, gold: cur.wallet.gold - def.cost },
      }));

      /**
       * ⚠️ **여기서 `saveRun`을 부르지 않는다** — 다른 금 소비 액션과 유일하게 다른 점이다.
       *
       * 준비는 저장 대상이 아니다(전투 중 상태). 여기서 저장하면 **금만 빠진 상태가
       * 디스크에 굳고** 준비는 새로고침에 증발한다. 저장하지 않으면 금 차감도
       * 메모리에만 남아 새로고침 시 둘이 함께 없던 일이 된다 — 그쪽이 일관적이다.
       * 확정은 `finish()`의 저장이 맡는다.
       */
      return { ok: true, prep: def.id, spent: def.cost };
    },

    setStratagemSlot: (slot, id) => {
      const s = get();
      if (s.result != null) return false;
      if (!Number.isInteger(slot) || slot < 0 || slot >= STRATAGEM_SLOTS) return false;
      if (id !== null && !isStratagemUnlocked(id, s.maxFloorReached)) return false;

      const next: Array<StratagemId | null> = Array.from(
        { length: STRATAGEM_SLOTS }, (_, i) => s.stratagemLoadout[i] ?? null,
      );
      const other = id === null ? -1 : next.indexOf(id);
      // 다른 슬롯에 이미 있으면 자리를 바꾼다 — 같은 카드 두 장은 없다
      if (other >= 0) next[other] = next[slot];
      next[slot] = id;
      set({ stratagemLoadout: next.filter((x): x is StratagemId => x !== null) });
      saveRun(get());
      return true;
    },

    setRoute: (index) => {
      const s = get();
      if (s.result != null) return false;
      const map = floorMapOf(floorAt(s.floorIndex));
      if (clampRoute(map, index) !== index) return false;
      // 저장하지 않는다(준비와 같다) — saveRun을 부르지 않는다
      set({ route: index });
      return true;
    },

    setScout: (id) => {
      const s = get();
      if (s.result != null) return false;
      // 편성된 살아 있는 사람만 — start()가 정찰자를 찾는 명단(파견자 제외)과 같은 조건이다.
      // 어느 군으로 나갈지는 start()가 정하므로 여기선 군을 가리지 않는다(명단 밖이면 resolveScout가 첫 번째로 돌린다)
      const inSquad = s.squads.some((m) => m.includes(id));
      const hero = s.roster.find((h) => h.instId === id);
      if (!inSquad || !hero || hero.isDead || dispatchedHeroIds(s.dispatches).has(id)) return false;
      // 저장하지 않는다(경로와 같다) — saveRun을 부르지 않는다
      set({ scout: id });
      return true;
    },

    setFallback: (order) => {
      if (get().result != null) return false;
      set({ fallback: order });
      saveRun(get());
      return true;
    },

    assign: (kind, id) => {
      const s = get();

      // 죽은 영웅은 배치할 수 없다. 로스터에 없는 id도 마찬가지 —
      // 유령이 들어오면 그 슬롯을 해제할 방법이 없다.
      const alive = new Set(livingHeroes(s.roster).map((h) => h.instId));
      if (!alive.has(id)) return { ok: false, reason: 'dead-hero' };

      // 파견과 배치는 둘 다 "대기실에 없는" 상태다. 겹치면 유휴 exp 제외가 두 번 걸린다.
      if (dispatchedHeroIds(s.dispatches).has(id)) return { ok: false, reason: 'away' };

      // 한 영웅이 두 자리를 채우면 산출이 두 번 세어진다
      if (ASSIGNABLE.some((k) => s.assignments[k].includes(id))) {
        return { ok: false, reason: 'already-assigned' };
      }

      if (s.assignments[kind].length >= ASSIGN_SLOTS[kind]) {
        return { ok: false, reason: 'no-slot' };
      }

      set((cur) => ({
        assignments: { ...cur.assignments, [kind]: [...cur.assignments[kind], id] },
      }));
      saveRun(get());
      return { ok: true, kind, id };
    },

    /**
     * ⚠️ **무조건 성공한다.** 조건을 붙이지 말 것 — `recallDispatch`와 같은 원칙이다.
     * 해제가 다른 조건에 걸리면 "묶였는데 풀 방법이 없는" 교착이 생긴다.
     */
    unassign: (id) => {
      set((s) => ({ assignments: pruneAssignments(s.assignments, (x) => x !== id) }));
      saveRun(get());
    },

    /**
     * 숙소 휴식 — 금을 내고 살아있는 영웅 전원을 즉시 만피로 되돌린다.
     *
     * ⚠️ **`currentHp === 0`은 "만피"라는 뜻이지 빈사가 아니다**(freshHero 주석).
     * 0을 부상으로 읽으면 멀쩡한 영웅에게 돈을 받게 된다.
     *
     * 죽은 영웅은 대상이 아니다 — 퍼머데스는 금으로 되돌리지 않는다.
     */
    rest: () => {
      const { roster, wallet } = get();
      const { injured, missingTotal, cost } = restQuote(roster);

      if (missingTotal === 0 || cost == null) return { ok: false, reason: 'already-full' };
      if (wallet.gold < cost) return { ok: false, reason: 'not-enough-gold', cost };

      const healIds = new Set(injured.map((x) => x.h.instId));
      set((s) => ({
        roster: s.roster.map((h) => {
          if (!healIds.has(h.instId)) return h;
          const max = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling).hp;
          return { ...h, currentHp: max };
        }),
        wallet: { ...s.wallet, gold: s.wallet.gold - cost },
      }));
      // 재화를 쓴 결과이므로 즉시 저장한다 (upgradeFacility와 같은 원칙).
      saveRun(get());
      return { ok: true, healed: missingTotal, heroes: injured.length, spent: cost };
    },

    buyGear: (defId) => {
      const def = GEAR_DEFS[defId];
      // 보급형만 판다 — 정예·유물은 price가 없다. 금으로 상위 장비를 살 수 있으면 지갑이 강함을 정한다.
      if (!def || def.price == null || def.line !== 'supply') return { ok: false, reason: 'not-sold' };
      // 화면이 숨겨도 여기서 막는다 — 다음 단계는 그 단계 첫 층에 닿아야 열린다(장비 사다리)
      if (def.tier > unlockedTierOf(FLOORS[get().maxFloorReached].id)) return { ok: false, reason: 'locked' };
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

    takeGear: (heroId, gearId) => {
      const { roster, gear } = get();
      const hero = roster.find((h) => h.instId === heroId);
      if (!hero) return { ok: false, reason: 'no-hero' };
      const inst = gear.find((g) => g.instId === gearId);
      const from = inst?.equippedBy && inst.equippedBy !== heroId ? inst.equippedBy : null;
      const holder = from ? roster.find((h) => h.instId === from) : undefined;

      // 원 소유자에게서 먼저 벗긴 **가상의** 인벤토리로 판정한다 — 실패하면 아무것도 안 바뀐다
      const index = gearIndex(gear);
      if (inst && from) index.set(gearId, { ...inst, equippedBy: null });
      const r = equipGearPure({ hero, gearId, inventory: index });
      if (!r.ok) return r;
      const slot = GEAR_DEFS[inst!.defId].slot;

      // 한 번의 set — 중간 상태(두 영웅이 같은 장비를 낀 순간)가 저장되지 않게
      set((s) => ({
        roster: s.roster.map((h) => {
          if (h.instId === heroId) return { ...h, gear: r.gear };
          if (holder && h.instId === from) {
            const g = { ...(h.gear ?? {}) };
            delete g[slot];
            return { ...h, gear: g };
          }
          return h;
        }),
        gear: s.gear.map((g) => {
          if (g.instId === gearId) return { ...g, equippedBy: heroId };
          if (g.instId === r.unequipped) return { ...g, equippedBy: null };
          return g;
        }),
      }));
      saveRun(get());
      return { ok: true, from, unequipped: r.unequipped };
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

    craftGear: (defId) => {
      const { materials, wallet, maxFloorReached, gearSeq } = get();
      const seq = gearSeq + 1;

      /*
        해금 판정은 **도달한 최고 층**이다 — 지금 고른 층이 아니다.
        층 선택으로 저층에 내려가 있어도 이미 연 레시피가 닫히면 안 된다
        (revisit이 같은 이유로 maxFloorReached를 본다).
      */
      const r = craftPure({
        gearDefId: defId,
        have: materials,
        gold: wallet.gold,
        highestFloor: FLOORS[maxFloorReached].id,
        seq,
      });
      // 조건 미달이면 아무것도 소모되지 않는다. 실패는 예외가 아니라 결과다.
      if (!r.ok) return r;

      set((s) => ({
        gear: [...s.gear, r.gear],
        gearSeq: seq,
        materials: spendMaterials(s.materials, r.spentMaterials),
        wallet: { ...s.wallet, gold: s.wallet.gold - r.spentGold },
      }));
      // 재화를 쓴 결과이므로 즉시 저장한다 (buyGear()와 같은 원칙).
      saveRun(get());
      return r;
    },

    refineGear: (gearId) => {
      const { gear, materials, wallet, maxFloorReached } = get();
      const target = gear.find((g) => g.instId === gearId);
      if (!target) return { ok: false, reason: 'not-owned' };

      // 잠금은 도달한 최고 층이다 — 제작과 같다(지금 고른 층이 아니다)
      const r = refinePure({
        gear: target,
        have: materials,
        gold: wallet.gold,
        highestFloor: FLOORS[maxFloorReached].id,
      });
      if (!r.ok) return r;

      /*
        한 번의 set — 교체와 차감이 갈라지면 재료만 잃고 유물은 그대로인 상태가 남는다.
        영웅의 gear 참조는 instId라 손댈 것이 없다(같은 물건이다).
      */
      set((s) => ({
        gear: s.gear.map((g) => (g.instId === gearId ? r.gear : g)),
        materials: spendMaterials(s.materials, r.spentMaterials),
        wallet: { ...s.wallet, gold: s.wallet.gold - r.spentGold },
      }));
      saveRun(get());
      return r;
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

    dispatchAdventure: (advId, heroIds) => {
      const s = get();
      const def = ADVENTURE_BY_ID[advId];
      if (!def) return { ok: false, reason: 'unknown-adventure' };
      if (def.unlockFloor > FLOORS[s.maxFloorReached].id) return { ok: false, reason: 'locked' };

      const ids = [...new Set(heroIds)];
      if (ids.length !== def.partySize) return { ok: false, reason: 'wrong-party-size' };

      const away = dispatchedHeroIds(s.dispatches);
      if (ids.some((id) => away.has(id))) return { ok: false, reason: 'already-away' };

      // 죽은 영웅은 못 보낸다. 로스터에 없는 id도 마찬가지 — 유령 파견이 되면
      // 정산 때 주인 없는 보상이 나온다
      const alive = new Set(livingHeroes(s.roster).map((h) => h.instId));
      if (ids.some((id) => !alive.has(id))) return { ok: false, reason: 'dead-hero' };

      const dispatch: Dispatch = { advId, heroIds: ids, startedAtBattle: s.battleCount };
      set((cur) => ({ dispatches: [...cur.dispatches, dispatch] }));
      saveRun(get());
      return { ok: true, dispatch };
    },

    /**
     * ⚠️ **무조건 성공한다.** 조건을 붙이지 말 것 — 위 인터페이스 주석 참조.
     * 범위 밖 index도 조용히 무시한다(던지면 화면이 죽고, 그것도 일종의 교착이다).
     */
    recallDispatch: (index) => {
      set((s) => ({ dispatches: s.dispatches.filter((_, i) => i !== index) }));
      saveRun(get());
    },

    markLegendarySeen: () => {
      if (get().seenFirstLegendary) return;
      set({ seenFirstLegendary: true });
      saveRun(get());
    },

    /**
     * 테스트용 재화 지급.
     *
     * ⚠️ **반드시 hydrate 이후에 불러야 한다.** 세이브 로드가 지갑을 통째로
     * 덮어쓰므로, 먼저 부르면 지급분이 조용히 사라진다. App.tsx의 기동 effect가
     * 로드 다음 줄에서 부르는 이유다.
     *
     * 저장까지 하는 이유: 저장을 안 하면 새로고침마다 지급이 반복돼
     * "재화가 늘었다 줄었다" 하는 것처럼 보인다. 지급 결과가 세이브에 고정돼야
     * 그 다음부터는 평범한 지갑처럼 움직인다.
     */
    grantTestFunds: () => {
      if (!isDevMode()) return;
      set((s) => ({ wallet: grantDevWallet(s.wallet) }));
      saveRun(get());
    },

    hydrate: (saved) =>
      set({
        floorIndex: saved.floorIndex,
        maxFloorReached: saved.maxFloorReached,
        revisits: saved.revisits,
        roster: saved.roster,
        squads: saved.squads,
        lockedSquad: saved.lockedSquad,
        deathCount: saved.deathCount,
        wallet: saved.wallet,
        gacha: saved.gacha,
        /**
         * 로스터를 도감에 메운다 — **기존 세이브 때문이다.**
         *
         * `registerInitialCodex`는 `freshSlice()`에서만 도므로 새 런에만 적용된다.
         * 이 필드 이전에 만들어진 세이브는 도감이 비어 있고, 로드하면 그대로
         * 복원되어 **화면에 "기록 0 / 12"에 전부 ???** 가 뜬다(폰에서 실측).
         * §5-38("시작값을 바꿔도 이미 세이브가 있으면 화면은 그대로다")이다.
         *
         * `registerCodex`는 이미 있는 항목의 `timesAcquired`를 올리므로
         * **저장된 도감을 먼저 깔고 그 위에 로스터를 덮으면 수치가 부풀려진다.**
         * 그래서 이미 있는 defId는 건드리지 않고 **빠진 것만** 채운다.
         */
        codex: backfillCodex(saved.codex, saved.roster),
        facilities: saved.facilities,
        assignments: saved.assignments,
        gear: saved.gear,
        gearSeq: saved.gearSeq,
        battleCount: saved.battleCount,
        potions: saved.potions,
        materials: saved.materials,
        dispatches: saved.dispatches,
        stratagemLoadout: saved.stratagemLoadout,
        stratagemResist: saved.stratagemResist,
        fallback: saved.fallback,
        claimedQuests: saved.claimedQuests,
        seenFirstLegendary: saved.seenFirstLegendary,
        towerCleared: saved.towerCleared,
        /**
         * runNo는 SavedRun에 없다(무덤이 정본이라 런 세이브에 중복 저장하지 않는다).
         * 그래서 hydrate 시점에 무덤에서 직접 읽는다 — 안 그러면 새로고침마다
         * runNo가 freshSlice()의 1로 되돌아가면서 무덤 헤더와 어긋난다.
         */
        runNo: loadLegacy().runNo,
        // 전투 중 상태는 항상 초기화한다. 저장 파일엔 없지만,
        // 진행 중이던 스토어에 hydrate가 불릴 수 있다.
        seed: 0,
        interventions: [],
        result: null,
        snapshot: [],
        questGrants: [],
        lastSortieSquad: 0,
        // 준비도 전투 중 상태다. 안 비우면 새로고침 뒤 유령 준비가 남는다
        prep: null,
        route: 0,
        scout: null,
        report: null,
      }),

    reset: () => set(freshSlice()),
  }));
}

/** 앱이 쓰는 전역 인스턴스 */
export const useRunStore = createRunStore();
