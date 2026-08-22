/**
 * 기존 층 재도전 — 보상 체감 계수. 튜닝 상수 단일 출처.
 *
 * 두 축을 곱한다:
 *   거리 — 최전선에서 멀수록 깎는다. 스케일을 맞추는 역할
 *   횟수 — 같은 층을 반복할수록 깎는다. 층을 갈아타게 만드는 압력
 *
 * 거리만 쓰면 같은 층 무한 반복이 안 막히고(89층을 100번 돌면 100번치),
 * 횟수만 쓰면 1층 파밍이 고층과 같은 값을 준다.
 *
 * ⚠️ 이 값들은 실측이 아니라 역산이다. 구현 후 `npx tsx climb-check.mts`로
 * 재조정할 것 — 파밍이 너무 세면 등반이 무의미해지고, 너무 약하면 2군이 죽는다.
 */

/** 최전선에서 1층 멀어질 때마다 깎이는 비율 */
const DISTANCE_DECAY = 0.04;
/** 거리 계수 하한. 0이면 그 층이 "가면 안 되는 곳"이 되어 미니맵의 죽은 칸이 된다 */
const DISTANCE_FLOOR = 0.15;

/** 재도전 1회마다 곱해지는 비율 */
const REPEAT_DECAY = 0.7;
/** 횟수 계수 하한. 0.3이면 "돌 수는 있지만 다른 층이 낫다"가 된다 */
const REPEAT_FLOOR = 0.3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 재도전 보상 배수 (0 초과 ~ 1 이하).
 *
 * ⚠️ **최전선 첫 도전은 정확히 1.0이어야 한다.** 이게 기존 밸런스 기준선이
 * 보존된다는 증거다 — `revisit.test.ts`가 이 값을 잠근다.
 *
 * @param floorId            도전하는 층 번호 (1-based)
 * @param maxFloorReachedId  해금 상한 층 번호 (1-based)
 * @param revisitCount       이 층을 이미 깬 횟수
 */
export function revisitMultiplier(
  floorId: number,
  maxFloorReachedId: number,
  revisitCount: number,
): number {
  const distance = Math.max(0, maxFloorReachedId - floorId);
  const dist = clamp(1 - distance * DISTANCE_DECAY, DISTANCE_FLOOR, 1);

  const repeats = Math.max(0, Math.floor(revisitCount));
  const rep = Math.max(REPEAT_FLOOR, REPEAT_DECAY ** repeats);

  return dist * rep;
}
