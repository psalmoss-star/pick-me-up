/**
 * 파티 정원 규칙 — 밸런스 수치 단일 출처.
 *
 * ⚠️ 정원은 이 게임에서 **가장 센 밸런스 손잡이**다. 실측(생성 구간 완주율):
 *   정원 3 → 61~80구간 17% / 81~100구간  1%
 *   정원 4 → 94% / 83%
 *   정원 5 → 100% / 100%
 * 정원 하나가 전 구간을 100%로 만든다. 만졌으면 반드시 `npx tsx climb-check.mts`.
 *
 * ⚠️ 상수가 아니라 **함수**인 이유: 층 구간마다 값이 다르다.
 * 예전에는 `screens/BaseScreen.tsx`에 상수로 있었고 `climb-check.mts`가 값을
 * 복제해 뒀는데, 구간별로 갈리는 순간 그 복제는 반드시 어긋난다 (HANDOFF §5-21).
 */

/** 군의 개수 — 1군(최전선) / 2군(파밍) */
export const SQUAD_COUNT = 2;

/**
 * 2군 개방 조건: 로스터 인원.
 *
 * 8인 = 1군 5 + 2군 3. 개방 즉시 1군을 채우고도 2군에 3인이 남는다.
 * "열렸는데 못 쓴다"를 피하려는 것 — 시작 금 300 = 시설 딱 한 채분과 같은 원칙이다.
 */
export const SQUAD_OPEN_ROSTER = 8;

/** 2군 개방 조건: 도달 층. 정원이 5로 늘어나는 층과 같다 */
export const SQUAD_OPEN_FLOOR = 21;

/** 손으로 짠 구간의 정원. 검증된 승률 표가 이 값 기준이다 */
const PARTY_LIMIT_HANDCRAFTED = 3;
/** 생성 구간의 정원 */
const PARTY_LIMIT_GENERATED = 5;

/**
 * 층별 파티 정원.
 *
 * 1~20층이 3인으로 남는 것이 이 설계의 **회귀 감지선**이다 —
 * 손으로 짠 20개 층의 검증된 승률(6층 70%, 12층 43%, 20층 55%)이 보존되고,
 * 재튜닝 대상이 21층 이상으로 한정된다.
 */
export function partyLimitAt(floorId: number): number {
  return floorId >= SQUAD_OPEN_FLOOR ? PARTY_LIMIT_GENERATED : PARTY_LIMIT_HANDCRAFTED;
}

/**
 * 2군이 열렸는가.
 *
 * `maxFloorReached`(해금 상한)로 판정한다 — `floorIndex`로 보면 재도전으로
 * 아래층에 내려간 순간 2군이 닫힌다.
 */
export function squadsOpen(rosterSize: number, maxFloorReached: number): boolean {
  return rosterSize >= SQUAD_OPEN_ROSTER && maxFloorReached >= SQUAD_OPEN_FLOOR;
}
