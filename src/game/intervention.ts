/**
 * 개입 — 마스터가 전투에 손을 대는 유일한 수단.
 *
 * 이 게임에서 플레이어는 유닛을 조종하지 않는다. 관전한다.
 * 다만 턴당 1회, 판을 살짝 비틀 수 있다. 그 한 번을 언제 쓰느냐가 이 게임의 전략이다.
 *
 * 특히 '후퇴'는 퍼머데스와 직결된다.
 * 죽기 직전의 영웅을 뺄 수 있다면, 그 판단이 곧 게임이 된다.
 *
 * 설계 원칙:
 * - 이 파일은 순수하다. React/DOM 의존 없음.
 * - 새로운 밸런스 축을 만들지 않는다. 전투 엔진에 이미 있는 개념(타겟팅/상태이상/행동)만 쓴다.
 * - 개입은 전투 입력이지 전투 중 조작이 아니다. 시드 고정 재현성이 깨지면 안 된다.
 */
import type { HeroInstId, StatusKind } from './types';

export type InterventionKind =
  | 'focus'    // 집중 — 아군의 단일 대상 공격을 지정한 적에게 몰아준다
  | 'guard'    // 수호 — 지정 아군의 피해를 줄인다
  | 'retreat'   // 후퇴 — 지정 아군을 한 턴 물린다 (행동도 피격도 안 함)
  /**
   * 후퇴 신호 — 지정 아군을 **전투에서 완전히 뺀다.** 그 턴부터 끝까지 행동도 피격도 없고 생존한다.
   * 전투당 1회, 위기 순간(자동 정지)에만 쓴다(사용자 결정 §8-1, 2026-09-29).
   * 작전 카드의 퇴각 방침(자동)과 같은 이탈이고, 다른 것은 누가 언제 정하느냐뿐이다.
   */
  | 'withdraw';

export interface Intervention {
  /** 이 개입이 발효되는 턴. 해당 턴 시작 시점부터 적용된다. */
  turn: number;
  kind: InterventionKind;
  /**
   * 대상.
   * focus → 적 uid
   * guard/retreat → 아군 영웅 instId
   */
  targetId: string;
}

// ------------------------------------------------------------
// 규칙 상수 — 밸런스 수치는 전부 여기 모은다
// ------------------------------------------------------------

/** 개입 효과가 지속되는 턴 수 */
export const INTERVENTION_DURATION = 1;

/** 개입을 한 번 쓰고 나서 다시 쓸 수 있게 되기까지의 턴 수 */
export const INTERVENTION_COOLDOWN = 2;

/** 수호: 방어력 상승폭 */
export const GUARD_DEF_BONUS = 0.6;

/** 수호로 부여되는 상태 */
export const GUARD_STATUS: StatusKind = 'defUp';

// ------------------------------------------------------------
// 사용 가능 여부
// ------------------------------------------------------------

/**
 * 해당 턴에 개입할 수 있는가.
 * 턴당 1회 + 쿨다운. 마지막 개입으로부터 COOLDOWN 턴이 지나야 한다.
 */
export function canIntervene(turn: number, used: Intervention[]): boolean {
  if (turn < 1) return false;
  if (used.some((i) => i.turn === turn)) return false;
  const last = lastInterventionTurn(used);
  if (last === null) return true;
  return turn - last >= INTERVENTION_COOLDOWN;
}

/** 가장 최근에 개입한 턴. 없으면 null. */
export function lastInterventionTurn(used: Intervention[]): number | null {
  if (used.length === 0) return null;
  return used.reduce((max, i) => (i.turn > max ? i.turn : max), used[0].turn);
}

/** 다음에 개입 가능해지는 턴 */
export function nextAvailableTurn(used: Intervention[]): number {
  const last = lastInterventionTurn(used);
  return last === null ? 1 : last + INTERVENTION_COOLDOWN;
}

// ------------------------------------------------------------
// 조회 — 전투 엔진이 매 턴 물어보는 것들
// ------------------------------------------------------------

/** 이 턴에 발효 중인 개입들 */
export function activeAt(interventions: Intervention[], turn: number): Intervention[] {
  return interventions.filter(
    (i) => turn >= i.turn && turn < i.turn + INTERVENTION_DURATION,
  );
}

/** 이 턴에 후퇴 중인 아군 instId 집합 */
export function retreatedAt(interventions: Intervention[], turn: number): Set<string> {
  return new Set(
    activeAt(interventions, turn)
      .filter((i) => i.kind === 'retreat')
      .map((i) => i.targetId),
  );
}

/** 이 턴에 집중 지정된 적 uid. 없으면 null. */
export function focusTargetAt(interventions: Intervention[], turn: number): string | null {
  const focus = activeAt(interventions, turn).find((i) => i.kind === 'focus');
  return focus ? focus.targetId : null;
}

/**
 * 이 턴까지 후퇴 신호로 이탈한 아군 instId 집합.
 * `activeAt`(지속 1턴)을 쓰지 않는다 — 이탈은 **발효 턴부터 전투 끝까지**다.
 */
export function withdrawnBy(interventions: Intervention[], turn: number): Set<string> {
  return new Set(
    interventions
      .filter((i) => i.kind === 'withdraw' && i.turn <= turn)
      .map((i) => i.targetId),
  );
}

/** 후퇴 신호는 전투당 1회다 */
export function canWithdraw(used: Intervention[]): boolean {
  return !used.some((i) => i.kind === 'withdraw');
}

/** 이 턴에 수호받는 아군 instId 집합 */
export function guardedAt(interventions: Intervention[], turn: number): Set<string> {
  return new Set(
    activeAt(interventions, turn)
      .filter((i) => i.kind === 'guard')
      .map((i) => i.targetId),
  );
}

// ------------------------------------------------------------
// UI 표시용
// ------------------------------------------------------------

export const INTERVENTION_LABEL: Record<InterventionKind, string> = {
  focus: '집중',
  guard: '수호',
  retreat: '후퇴',
  withdraw: '후퇴 신호',
};

export const INTERVENTION_DESC: Record<InterventionKind, string> = {
  focus: '아군의 공격을 한 적에게 몰아준다',
  guard: '한 영웅이 받는 피해를 줄인다',
  retreat: '한 영웅을 전선에서 물린다',
  withdraw: '한 영웅을 전투에서 완전히 빼낸다',
};

/** 개입 대상이 아군인지 적인지 */
export function targetSideOf(kind: InterventionKind): 'ally' | 'enemy' {
  return kind === 'focus' ? 'enemy' : 'ally';
}

/** 아군 대상 개입의 targetId는 HeroInstId다 */
export function isAllyTarget(i: Intervention): i is Intervention & { targetId: HeroInstId } {
  return targetSideOf(i.kind) === 'ally';
}
