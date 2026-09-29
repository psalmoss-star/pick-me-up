/**
 * 작전 카드 — 전투 전에 고르는 방침 3장. 기획서 1단계 / fun-plan-v2 §5.1.
 *
 * 설계 원칙 (`intervention.ts`·`prep.ts`와 같다):
 * - 이 파일은 순수하다. React/DOM 의존 없음.
 * - 카드는 **전투 입력**이다. 같은 카드 + 같은 시드 = 같은 결과.
 * - ⚠️ **기본값(`DEFAULT_ORDERS`)은 현행 엔진과 비트 단위로 같아야 한다.**
 *   기본 카드가 RNG를 한 번이라도 더 뽑으면 sim·climb-check·floorVariants 기준선이 조용히 낡는다.
 *   `ordersBaseline.test.ts`가 잠근다.
 * - 새 능력치를 만들지 않는다. 카드는 **누구를 치고, 누구를 지키고, 언제 빠지는가**만 바꾼다.
 */
import type { Combatant } from './types';
import { FALLBACK_THRESHOLD } from './data/orders';

/** 공격 방침 — 아군의 단일 대상 공격이 어느 적에게 가는가 */
export type AttackOrder =
  | 'free'       // 자유 — 현행(무작위 + 적 탱커 어그로)
  | 'weakest'    // 약한 적 — 남은 HP가 가장 적은 적
  | 'strongest'  // 강한 적 — 공격력이 가장 높은 적
  | 'backline';  // 후열 — 탱커를 건너뛰고 뒤의 적

/** 보호 방침 — 아군 탱커가 누구를 막아서는가 */
export type ProtectOrder =
  | 'free'       // 자유 — 현행(막아서지 않음)
  | 'healer'     // 치유자
  | 'weakest';   // 가장 약한 아군 — 그 순간 HP 비율이 가장 낮은 영웅

/** 퇴각 방침 — HP가 얼마 이하면 전투에서 빠지는가 */
export type FallbackOrder = 'none' | keyof typeof FALLBACK_THRESHOLD;

export interface Orders {
  attack: AttackOrder;
  protect: ProtectOrder;
  fallback: FallbackOrder;
}

/** 아무 카드도 안 고른 상태 = 현행 엔진 */
export const DEFAULT_ORDERS: Readonly<Orders> = Object.freeze({
  attack: 'free',
  protect: 'free',
  fallback: 'none',
});

export const ATTACK_ORDERS: AttackOrder[] = ['free', 'weakest', 'strongest', 'backline'];
export const PROTECT_ORDERS: ProtectOrder[] = ['free', 'healer', 'weakest'];
export const FALLBACK_ORDERS: FallbackOrder[] = ['none', 'hp50', 'hp30', 'hp15'];

/** 퇴각 기준 HP 비율. `none`이면 null */
export function fallbackRatio(order: FallbackOrder): number | null {
  return order === 'none' ? null : FALLBACK_THRESHOLD[order];
}

/**
 * 저장본에서 읽은 값을 검증한다. 모르는 값은 기본값으로 — 옛 세이브·손상 세이브 방어.
 */
export function sanitizeOrders(raw: unknown): Orders {
  const o = (raw ?? {}) as Partial<Record<keyof Orders, unknown>>;
  const pick = <T>(list: readonly T[], v: unknown, fallback: T): T =>
    (list as readonly unknown[]).includes(v) ? (v as T) : fallback;
  return {
    attack: pick(ATTACK_ORDERS, o.attack, DEFAULT_ORDERS.attack),
    protect: pick(PROTECT_ORDERS, o.protect, DEFAULT_ORDERS.protect),
    fallback: pick(FALLBACK_ORDERS, o.fallback, DEFAULT_ORDERS.fallback),
  };
}

// ------------------------------------------------------------
// 엔진이 묻는 것들 — RNG를 받지 않는다(무작위가 필요하면 엔진이 굴린다)
// ------------------------------------------------------------

/**
 * 공격 방침에 따른 후보. `free`면 null — 엔진이 현행 규칙(무작위 + 탱커 어그로)으로 고른다.
 *
 * @param pool 살아 있고 공격 가능한 적 (비어 있지 않다)
 * @param atkOf 버프를 반영한 공격력. 엔진 쪽 계산을 그대로 받는다
 */
export function attackCandidates(
  order: AttackOrder,
  pool: Combatant[],
  atkOf: (c: Combatant) => number,
): Combatant[] | null {
  switch (order) {
    case 'free':
      return null;
    case 'weakest':
      // 남은 HP 절대값 — "곧 쓰러질 적부터"가 플레이어가 기대하는 뜻이다
      return [pool.reduce((a, b) => (b.currentHp < a.currentHp ? b : a))];
    case 'strongest':
      return [pool.reduce((a, b) => (atkOf(b) > atkOf(a) ? b : a))];
    case 'backline': {
      // 탱커만 남았으면 칠 수밖에 없다
      const back = pool.filter((c) => c.role !== 'tank');
      return back.length > 0 ? back : pool;
    }
  }
}

/**
 * 보호 대상 uid. `free`면 빈 집합.
 * @param heroes 살아 있고 전투에 남아 있는 아군 영웅
 */
export function protecteeUids(order: ProtectOrder, heroes: Combatant[]): Set<string> {
  if (order === 'free' || heroes.length === 0) return new Set();
  if (order === 'healer') {
    return new Set(heroes.filter((c) => c.role === 'healer').map((c) => c.uid));
  }
  const weakest = heroes.reduce((a, b) =>
    (b.currentHp / b.stats.hp < a.currentHp / a.stats.hp ? b : a));
  return new Set([weakest.uid]);
}

// ------------------------------------------------------------
// UI 표시용
// ------------------------------------------------------------

export const ATTACK_LABEL: Record<AttackOrder, string> = {
  free: '자유',
  weakest: '약한 적',
  strongest: '강한 적',
  backline: '후열',
};

export const PROTECT_LABEL: Record<ProtectOrder, string> = {
  free: '자유',
  healer: '치유자',
  weakest: '가장 약한 아군',
};

export const FALLBACK_LABEL: Record<FallbackOrder, string> = {
  none: '없음',
  hp50: 'HP 50%',
  hp30: 'HP 30%',
  hp15: 'HP 15%',
};
