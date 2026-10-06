/**
 * 숙소 회복 공식 — 한 곳에만 둔다.
 *
 * 숙소에서 쉬면 최대 HP의 `rate`(숙소 레벨의 회복률, `data/facilities.ts`의 `REST_HEAL`)만큼 회복한다.
 * 예전에는 전투 직후 자동으로 걸리던 값이고(STEP 6~34), STEP 73부터는 숙소에서 직접 받는다.
 * **공식은 바꾸지 않았다** — 측정 도구(`climb-check.mts`)가 같은 식을 복제해 쓰므로,
 * 여기를 만지면 그쪽도 고치고 구간 완주율을 다시 잰다.
 */
export function innHeal(current: number, max: number, rate: number): number {
  return Math.min(max, current + Math.round(max * rate));
}
