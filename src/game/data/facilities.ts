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

/**
 * 배치를 받는 시설 — **훈련소·합성소 둘뿐이다.**
 *
 * ⚠️ 숙소(`restHeal`)와 무기창고(`armoryAtk`)는 뺐다. 이 파일 맨 위가 경고하듯
 * 그 둘은 층별 승률을 통째로 밀어 올리는 칼날이라, 배치가 닿는 순간
 * 검증된 구간 완주율 표를 전부 다시 수렴시켜야 한다.
 *
 * 훈련소·합성소는 `sim`도 `climb-check`도 쓰지 않으므로 **밸런스 재측정 의무가 없다**
 * (`FORGE_RATE` 주석: "층별 승률과는 무관하다").
 *
 * `Record<FacilityKind, ...>`가 아니라 좁은 유니온을 쓰는 이유: 숙소·무기창고를
 * 키로 가지면 "왜 여긴 항상 비어 있지?"가 되고 다음 사람이 채운다.
 * 타입이 금지하면 그 실수가 **컴파일 에러**가 된다.
 */
export type AssignableFacility = 'training' | 'forge';

/** 배치 가능 시설 목록 — 화면 순회용. 늘어나면 테스트가 잡는다 */
export const ASSIGNABLE: readonly AssignableFacility[] = ['training', 'forge'];

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
 * 인덱스가 시설 레벨(0=미건설). 실측(`climb-check.mts`, 저층 파티 300회, 2026-08-23):
 *
 *   회복률   평균 도달층   6층 완주율
 *     0%        4.95         15%   ← 참고선. 층간 유지만 하고 회복 없음
 *    48%        5.31         43%   ← Lv.0
 *    53%        5.39         53%   ← Lv.1
 *    59%        5.52         63%   ← Lv.2
 *    65%        5.59         71%   ← Lv.3
 *   100%        5.70         82%   (포화)
 *
 * Lv.0을 0%로 두지 않은 이유: 층간 HP 유지를 켠 순간 회복이 없으면 등반이 성립하지 않는다.
 * 시설을 안 지었다고 게임이 붕괴하면 그건 선택지가 아니라 함정이다.
 *
 * ⚠️ **Lv.0을 35%에서 48%로 올렸다 (2026-08-23, 실기기 피드백).**
 * 시작 금이 300인데 소환진이 200, 숙소 Lv.1이 300이라 **둘 중 하나만 살 수 있다.**
 * 소환은 보이는 보상이고 숙소는 안 보이는 %라 사실상 모든 플레이어가 소환을 먼저 하고,
 * 그래서 **시작 구간이 곧 Lv.0 구간**이 된다. 그런데 그 완주율이 35%였다 —
 * 실제로 "1~3층에서 3파티 연속 전멸"이 보고됐고 0.65³ ≈ 27%로 충분히 나오는 결과였다.
 *
 * ⚠️ **Lv.3(65%)은 건드리지 않았다.** 검증된 기준선이 거기에 걸려 있다 —
 * 구간별 완주율 표(저층 71% / 21~40 51% …)가 전부 Lv.3 기준이다.
 * 레벨당 상승폭(약 10%p)도 유지해 숙소 강화의 의미가 사라지지 않게 했다.
 *
 * Lv.3(65%)이 전회복(100%)과 완주율 1p 차이인 것은 의도적이다. 65% 이상은 포화 구간이라
 * 더 줘도 효과가 없으므로, 만렙이 곧 "예전의 전회복 밸런스"가 되도록 상한을 맞췄다.
 * 즉 기존에 검증된 층별 승률이 시설 만렙 기준선으로 보존된다.
 */
export const REST_HEAL: readonly number[] = [0.48, 0.53, 0.59, 0.65];

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
 * 시설당 배치 슬롯 수.
 *
 * 2인으로 잡은 이유: 로스터가 8인일 때 1군 5 + 배치 2면 1명이 남는다.
 * 슬롯이 더 크면 "남는 영웅을 전부 꽂는 것"이 무조건 정답이 되어 선택이 사라진다.
 */
export const ASSIGN_SLOTS: Record<AssignableFacility, number> = { training: 2, forge: 2 };

/**
 * 배치 1인당 효과 상승.
 *
 * - `training`: 유휴 exp **절대값**(+25/인)
 * - `forge`: 전환율 **비율**(+5%p/인)
 *
 * ⚠️ 단위가 다르다. 시설 레벨 효과에 **곱이 아니라 합**으로 얹는다 —
 * 곱이면 만렙에서 상승폭이 커져 "만렙 먼저, 배치는 나중"이 유일한 순서가 된다.
 */
export const ASSIGN_BONUS: Record<AssignableFacility, number> = { training: 25, forge: 0.05 };

/**
 * 합성 전환율 상한.
 *
 * ⚠️ **1.0을 넘으면 안 된다.** 만렙 0.95 + 슬롯 2×0.05 = 1.05인데,
 * 제물이 가진 가치보다 많은 exp가 나오면 합성이 **exp 생성기**가 되어
 * "제물을 돌려 무한 성장"이 성립한다.
 */
const FORGE_RATE_CAP = 1;

/** 배치 인원을 슬롯 수로 자른다. 화면·저장 어느 쪽이 넘겨도 여기서 막힌다 */
function cappedAssigned(kind: AssignableFacility, assigned: number): number {
  return Math.min(ASSIGN_SLOTS[kind], Math.max(0, Math.floor(assigned)));
}

/**
 * 배치를 반영한 유휴 경험치.
 *
 * ⚠️ **Lv.0에는 배치해도 0이다.** 미건설 시설이 배치만으로 exp를 내면
 * "안 지어도 되는 시설"이 되어 강화의 의미가 사라진다.
 */
export function idleExpWithAssign(level: number, assigned: number): number {
  const base = idleExpGain(level);
  if (base === 0) return 0;
  return base + ASSIGN_BONUS.training * cappedAssigned('training', assigned);
}

/** 배치를 반영한 합성 전환율. 상한에서 잘린다 */
export function forgeRateWithAssign(level: number, assigned: number): number {
  const base = forgeRate(level);
  return Math.min(FORGE_RATE_CAP, base + ASSIGN_BONUS.forge * cappedAssigned('forge', assigned));
}

/**
 * 시설 업그레이드 비용(금). 인덱스 = 올린 뒤의 레벨.
 * [_, Lv1로, Lv2로, Lv3로]
 *
 * 층 보상이 층당 수백 금 규모이므로, Lv.1은 초반 몇 층이면 닿고
 * Lv.3은 중층까지 올라가야 닿는 간격으로 잡았다.
 */
export const FACILITY_COST: readonly number[] = [0, 300, 900, 2200];

/**
 * 숙소 휴식 — 금을 내고 **즉시** 부상을 회복한다.
 *
 * ⚠️ `REST_HEAL`(층 사이 자동 회복)과는 다른 손잡이다. 자동 회복은 등반 리듬을 정하고,
 * 휴식은 "지금 금을 써서 한 층 더 갈까"라는 **선택**을 만든다.
 *
 * ⚠️ **비용을 낮추면 등반 난이도가 통째로 내려간다.** 층 보상이 층당 230~300금이라
 * 여기가 싸지면 사실상 무한 회복이 된다. 만졌으면 `npx tsx climb-check.mts`를
 * 반드시 다시 돌릴 것.
 *
 * 잃은 HP 1당 비용으로 잡는다 — 정액이면 살짝 다친 영웅에게 쓰는 게 손해라
 * "만신창이가 될 때까지 기다리기"가 최적이 되어 버린다.
 */
export const REST_COST_PER_HP = 2;

/** 휴식 1회의 최소 비용. 푼돈 결제가 반복되는 것을 막는다 */
export const REST_COST_MIN = 20;

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
