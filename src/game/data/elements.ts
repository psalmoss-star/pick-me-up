/**
 * 속성 상성표 + 등급 스케일링.
 *
 * 상성표는 손으로 적지 않고 순환 규칙에서 파생한다 — 25칸을 나열하면
 * "화 → 풍 → 지 → 뇌 → 수 → 화"라는 규칙 자체가 데이터에서 사라진다.
 */
import type { Element, Star, StarScaling } from '../types';

// ------------------------------------------------------------
// 속성 상성: 화 → 풍 → 지 → 뇌 → 수 → 화
// ------------------------------------------------------------
const ADV = 1.5;
const DIS = 0.7;
const NEU = 1.0;

const order: Element[] = ['fire', 'wind', 'earth', 'thunder', 'water'];

export const elementChart: Record<Element, Record<Element, number>> =
  Object.fromEntries(
    order.map((atk, i) => [
      atk,
      Object.fromEntries(
        order.map((def, j) => {
          if ((i + 1) % order.length === j) return [def, ADV];
          if ((j + 1) % order.length === i) return [def, DIS];
          return [def, NEU];
        }),
      ),
    ]),
  ) as Record<Element, Record<Element, number>>;

/**
 * 능력치 최소 충전율 — 갓 얻은 개체가 상한의 몇 %에서 시작하는가.
 *
 * ⚠️ **이게 없으면 등급이 높을수록 약하게 시작한다.**
 * 현재치는 `상한 × (레벨 / 만렙)`인데 만렙이 등급마다 커진다(★1은 10, ★5는 80).
 * 그래서 Lv.1 기준 충전율이 ★1은 10%, ★5는 1.25%로 **거꾸로 간다** —
 * 실측(2026-08-23)에서 갓 뽑은 ★4·★5의 atk이 6이었고, ★1의 12보다 낮았다.
 * 젬 500짜리 심연의 소환진이 저등급만 못한 개체를 주고 있었다.
 *
 * ⚠️ **`npm run sim`은 이 결함을 구조적으로 못 잡는다.** 시뮬레이터의 파티는
 * 전부 잘 키운 상태(★2 Lv.15, ★4 Lv.50)라 저레벨 구간을 밟지 않는다.
 * HANDOFF §5-9와 같은 종류의 사각지대다 — 표가 안 움직인다고 안전한 것이 아니다.
 *
 * 0.25는 "갓 뽑아도 즉시 쓸 수는 있되 키운 개체에는 한참 못 미친다"를 노린 값이다.
 * 올리면 육성의 의미가 줄고, 내리면 고등급 소환이 다시 함정이 된다.
 * **만졌으면 `npm run sim`과 `npx tsx climb-check.mts`를 둘 다 돌릴 것.**
 */
export const MIN_ATTR_FILL = 0.25;

// ------------------------------------------------------------
// 등급 스케일링
// ------------------------------------------------------------
export const starScaling: Record<Star, StarScaling> = {
  1: { star: 1, maxLevel: 10, statMultiplier: 1.0, promotionStones: 1 },
  2: { star: 2, maxLevel: 20, statMultiplier: 1.35, promotionStones: 3 },
  3: { star: 3, maxLevel: 40, statMultiplier: 1.9, promotionStones: 8 },
  4: { star: 4, maxLevel: 60, statMultiplier: 2.7, promotionStones: 20 },
  5: { star: 5, maxLevel: 80, statMultiplier: 3.8, promotionStones: 0, requiresAwakening: true },
  6: { star: 6, maxLevel: 99, statMultiplier: 5.4, promotionStones: 0 },
};
