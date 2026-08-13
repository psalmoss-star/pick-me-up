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
