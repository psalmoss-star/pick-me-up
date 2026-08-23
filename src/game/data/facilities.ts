/**
 * 시설 튜닝 — 대기실 경영. STEP 6.
 *
 * 밸런스 수치는 전부 여기 있고 코드에는 없다 (CLAUDE.md 아키텍처 규칙).
 *
 * ⚠️ 이 파일의 수치는 전부 칼날이다 (HANDOFF §5-1).
 * 특히 `restHeal`과 `armoryAtk`는 층별 승률을 통째로 밀어 올린다.
 * 만졌으면 `npm run sim`과 **`npx tsx climb-check.mts`를 둘 다** 돌릴 것 —
 * sim은 매 층을 만피로 독립 측정하므로 층간 회복의 영향을 구조적으로 못 잡는다.
 */

export type FacilityKind = 'rest' | 'training' | 'forge' | 'armory';

/** 시설 최대 레벨. GDD v2 §2.2 "Lv.3까지". */
export const FACILITY_MAX_LEVEL = 3;

export const FACILITY_META: Record<FacilityKind, { name: string; desc: string }> = {
  rest: { name: '숙소', desc: '층 사이 회복량' },
  training: { name: '훈련소', desc: '대기 영웅 유휴 경험치' },
  forge: { name: '합성소', desc: '합성 경험치 전환율' },
  armory: { name: '무기창고', desc: '파티 공격력' },
};

/**
 * 숙소 — 층 사이 HP 회복 비율(최대 HP 대비).
 *
 * 인덱스가 시설 레벨(0=미건설). 실측(`climb-check.mts`, 저층 파티 300회)으로 잡았다:
 *
 *   회복률   평균 도달층   6층 완주율
 *     0%        1.76          0%   ← 등반 자체가 성립하지 않는다
 *    35%        4.03         25%   ← Lv.0
 *    45%        4.40         36%   ← Lv.1
 *    65%        4.69         45%   ← Lv.3
 *   100%        4.76         46%   (포화)
 *
 * Lv.0을 0%로 두지 않은 이유: 층간 HP 유지를 켠 순간 회복이 없으면 평균 1.76층에서
 * 끊긴다. 시설을 안 지었다고 게임이 붕괴하면 그건 선택지가 아니라 함정이다.
 *
 * Lv.3(65%)이 전회복(100%)과 완주율 1p 차이인 것은 의도적이다. 65% 이상은 포화 구간이라
 * 더 줘도 효과가 없으므로, 만렙이 곧 "예전의 전회복 밸런스"가 되도록 상한을 맞췄다.
 * 즉 기존에 검증된 층별 승률이 시설 만렙 기준선으로 보존된다.
 */
export const REST_HEAL: readonly number[] = [0.35, 0.45, 0.55, 0.65];

/**
 * 무기창고 — 파티 전체 공격력 배수. GDD v2 §2.2 "+Lv×3%".
 * 인덱스가 시설 레벨(0=미건설, 보정 없음).
 */
export const ARMORY_ATK: readonly number[] = [1.0, 1.03, 1.06, 1.09];

/**
 * 합성소 — 제물 영웅의 가치가 경험치로 넘어가는 비율.
 * 인덱스가 시설 레벨(0=미건설).
 *
 * ⚠️ **Lv.0과 Lv.1이 같으면 안 된다.** 예전에는 수치가 이 파일이 아니라
 * `progression.ts`의 공식(`Math.max(1, level)`)에 있었고, 그 clamp가 Lv.0을 Lv.1로
 * 끌어올려 **둘 다 65%**였다. 300금짜리 Lv.1 강화가 효과 0인 함정 구매였고
 * 화면에도 "Lv.0 · 65%" → "다음 단계 → 65%"로 그대로 드러났다(실기기에서 발견).
 *
 * Lv.1~3(65/80/95%)은 기존 값 그대로다 — 바뀐 것은 Lv.0뿐이라
 * 이미 검증된 합성 밸런스는 보존된다. 층별 승률과는 무관하다
 * (`sim`·`climb-check` 어느 쪽도 합성을 쓰지 않는다).
 */
export const FORGE_RATE: readonly number[] = [0.5, 0.65, 0.8, 0.95];

/**
 * 훈련소 — 전투에 나가지 않은 영웅이 층 돌파당 받는 유휴 경험치.
 *
 * 참전 영웅과 경쟁하지 않도록 작게 잡는다. 이게 크면 "안 내보내는 게 이득"이 되어
 * 퍼머데스의 긴장(내보내야 크는데 내보내면 죽는다)이 사라진다.
 */
export const TRAINING_IDLE_EXP: readonly number[] = [0, 40, 90, 160];

/**
 * 시설 업그레이드 비용(금). 인덱스 = 올린 뒤의 레벨.
 * [_, Lv1로, Lv2로, Lv3로]
 *
 * 층 보상이 층당 수백 금 규모이므로, Lv.1은 초반 몇 층이면 닿고
 * Lv.3은 중층까지 올라가야 닿는 간격으로 잡았다.
 */
export const FACILITY_COST: readonly number[] = [0, 300, 900, 2200];

/** 다음 레벨 비용. 만렙이면 null. */
export function upgradeCost(level: number): number | null {
  const next = level + 1;
  if (next > FACILITY_MAX_LEVEL) return null;
  return FACILITY_COST[next];
}

/** 층 사이 회복 비율 */
export function restHealRate(level: number): number {
  return REST_HEAL[clampLevel(level)];
}

/** 파티 공격력 배수 */
export function armoryAtkMult(level: number): number {
  return ARMORY_ATK[clampLevel(level)];
}

/** 대기 영웅의 층당 유휴 경험치 */
export function idleExpGain(level: number): number {
  return TRAINING_IDLE_EXP[clampLevel(level)];
}

/** 합성 경험치 전환율 */
export function forgeRate(level: number): number {
  return FORGE_RATE[clampLevel(level)];
}

function clampLevel(level: number): number {
  return Math.min(FACILITY_MAX_LEVEL, Math.max(0, Math.floor(level)));
}
