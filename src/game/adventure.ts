/**
 * 모험 판정 — 순수 로직.
 *
 * 주입된 RNG만 쓴다. `game/quest.ts`가 같은 구조다 —
 * **스토어(실제 지급)와 화면(미리보기)이 반드시 같은 유도식을 써야** 하므로
 * RNG 유도를 이 파일의 함수 하나에 가둔다.
 *
 * ── 파견 상태를 영웅이 아니라 레코드로 두는 이유 ─────────
 * `HeroInstance`에 `away: true` 같은 플래그를 박으면 **세이브 마이그레이션 ·
 * 사망 처리 · 새 런 시작** 세 곳에서 동기화가 어긋난다. 특히 사망이 문제다 —
 * 파견 중인 영웅이 (다른 경로로) 사라지면 플래그만 남고 주인이 없어진다.
 * 레코드로 두면 "명단에 있는데 로스터에 없다"를 정산 시점에 걸러낼 수 있다.
 */
import {
  ADVENTURE_BY_ID, ADVENTURE_LEVEL_BONUS_PER_LEVEL,
  ADVENTURE_SUCCESS_MAX, ADVENTURE_SUCCESS_MIN,
  type AdventureDef, type AdventureId, type Dispatch,
} from './data/adventures';
import { STREAM, substream } from './rng';
import { ladderSet } from './data/gear';
import type { GearDefId, HeroInstance, HeroInstId, MaterialBag, RNG } from './types';

/**
 * 모험 판정용 RNG.
 *
 * ⚠️ **결과 화면·마을 화면이 완료된 모험을 미리 보여주려면 같은 식으로 다시 계산해야 한다**
 * (결과 화면은 `finish()`보다 먼저 뜬다 — `questRng`가 밖으로 빠진 것과 같은 이유).
 * 식이 두 곳에 생기면 "보인 것과 들어온 것이 다르다"가 된다.
 *
 * 파견 시작 시점(`startedAtBattle`)과 모험 종류를 섞는다. 둘 다 파견이 확정되는
 * 순간 고정되므로, 정산을 몇 번 다시 계산해도 결과가 같다.
 * 전리품(`STREAM.LOOT`)과 다른 스트림인 이유: 같은 스트림을 나눠 쓰면 모험 하나를
 * 보냈는지 아닌지에 따라 이후 **장비 드롭이 통째로 달라진다**.
 */
export function adventureRng(seed: number, advId: AdventureId, startedAtBattle: number): RNG {
  let h = 0;
  for (let i = 0; i < advId.length; i++) h = (Math.imul(h, 31) + advId.charCodeAt(i)) | 0;
  return substream(
    (seed ^ Math.imul(h, 0x9e3779b1) ^ Math.imul(startedAtBattle + 1, 0x85ebca6b)) >>> 0,
    STREAM.ADVENTURE,
  );
}

/**
 * 파견 인원의 레벨을 반영한 성공률.
 *
 * 평균 레벨을 쓴다 — 합계로 하면 인원이 많은 모험이 자동으로 쉬워져서
 * `partySize`가 난이도 손잡이 구실을 못 한다.
 *
 * 인자를 `HeroInstance`가 아니라 `{ level }`로 받는 이유: 화면이 파견 전
 * 성공률을 미리 보여줘야 하는데, 화면은 영웅 전체가 아니라 표시용 요약만 들고 있다.
 * 전체를 요구하면 호출부가 캐스팅으로 우회하게 되고 그 순간 타입이 거짓말이 된다.
 */
export function successChance(
  def: AdventureDef,
  heroes: readonly Pick<HeroInstance, 'level'>[],
): number {
  if (heroes.length === 0) return ADVENTURE_SUCCESS_MIN;
  const avgLevel = heroes.reduce((s, h) => s + h.level, 0) / heroes.length;
  const raw = def.baseSuccess + avgLevel * ADVENTURE_LEVEL_BONUS_PER_LEVEL;
  return Math.min(ADVENTURE_SUCCESS_MAX, Math.max(ADVENTURE_SUCCESS_MIN, raw));
}

/** 완료까지 남은 전투 수. 0이면 지금 정산할 수 있다 */
export function battlesRemaining(d: Dispatch, battleCount: number): number {
  const def = ADVENTURE_BY_ID[d.advId];
  if (!def) return 0;
  return Math.max(0, d.startedAtBattle + def.duration - battleCount);
}

export function isComplete(d: Dispatch, battleCount: number): boolean {
  return battlesRemaining(d, battleCount) === 0;
}

/**
 * 원정 진행 문장. `done`은 지난 전투 수 — 범위 밖이면 양 끝으로 접는다
 * (정의가 바뀌어 duration이 줄어도 화면이 빈 줄을 내지 않게).
 */
export function legLine(def: AdventureDef, done: number): string {
  const i = Math.min(def.legs.length - 1, Math.max(0, done));
  return def.legs[i] ?? '';
}

export interface AdventureOutcome {
  advId: AdventureId;
  heroIds: HeroInstId[];
  success: boolean;
  materials: MaterialBag;
  awakeningStones: number;
  /** 인원 **1인당** 경험치. 실패하면 0 */
  expEach: number;
  /**
   * 실패 시 잃는 최대 HP 비율 0~1. 성공하면 0.
   *
   * 비율로 돌려주는 이유: 여기는 순수 계층이라 영웅의 현재 HP를 모른다.
   * 실제 차감은 스토어가 한다.
   */
  injuryRatio: number;
  /**
   * 성공 시 받은 정예 장비(장비 사다리). 없으면 null.
   * 정의 id만 — instId 발번은 스토어 몫이다.
   */
  gearDefId: GearDefId | null;
}

/**
 * 모험 하나를 정산한다.
 *
 * ⚠️ **RNG 소비 횟수가 결과에 따라 달라진다** — 실패하면 1회, 성공하면 2회
 * (각성석 확률이 0인 모험은 성공해도 1회). 그래서 모험마다 **독립 RNG**를 판다
 * (`adventureRng`가 `advId`·`startedAtBattle`을 섞는 이유).
 * 하나의 스트림을 여러 모험이 나눠 쓰면 정산 순서에 따라 결과가 달라진다.
 *
 * **조기 복귀(`early`)는 판정 자체를 하지 않는다.** 보상을 포기하는 대신
 * 부상도 없다 — 이게 교착 방지의 핵심 경로라 어떤 조건도 붙이면 안 된다
 * (HANDOFF §5: "영웅이 죽었는데 탑을 오를 수 없는" 잠금 교착).
 */
export function resolveAdventure(args: {
  dispatch: Dispatch;
  /** 명단 중 **실제로 로스터에 남아 있는** 영웅만 */
  heroes: readonly HeroInstance[];
  rng: RNG;
  /** 정산 시점의 열린 단계 — 정예 장비의 단계 */
  tier: number;
}): AdventureOutcome {
  const { dispatch, heroes, rng, tier } = args;
  const def = ADVENTURE_BY_ID[dispatch.advId];

  const empty: AdventureOutcome = {
    advId: dispatch.advId,
    heroIds: [...dispatch.heroIds],
    success: false,
    materials: {},
    awakeningStones: 0,
    expEach: 0,
    injuryRatio: 0,
    gearDefId: null,
  };
  // 정의가 사라졌거나(데이터 삭제) 인원이 전부 없어졌으면 빈손. RNG를 소비하지 않는다
  if (!def || heroes.length === 0) return empty;

  const success = rng() < successChance(def, heroes);
  if (!success) return { ...empty, injuryRatio: def.injury };

  let awakeningStones = 0;
  if (def.reward.awakeningChance > 0 && rng() < def.reward.awakeningChance) {
    awakeningStones = 1;
  }

  // 정예 — 각성석 **뒤**. 순서를 바꾸면 기존 모험 결과가 전부 바뀐다(`adventure.test.ts` 지문)
  let gearDefId: GearDefId | null = null;
  if (def.reward.eliteChance > 0 && rng() < def.reward.eliteChance) {
    const pool = ladderSet(tier, 'elite');
    if (pool.length > 0) gearDefId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id;
  }

  return {
    advId: dispatch.advId,
    heroIds: [...dispatch.heroIds],
    success: true,
    materials: { ...def.reward.materials },
    awakeningStones,
    expEach: def.reward.exp,
    injuryRatio: 0,
    gearDefId,
  };
}

/** 파견 중인 영웅 전체 — 편성에서 제외할 때 쓴다 */
export function dispatchedHeroIds(dispatches: readonly Dispatch[]): Set<HeroInstId> {
  const out = new Set<HeroInstId>();
  for (const d of dispatches) for (const id of d.heroIds) out.add(id);
  return out;
}

export type { AdventureDef, AdventureId, Dispatch };
