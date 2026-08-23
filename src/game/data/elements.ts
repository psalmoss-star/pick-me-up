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

/**
 * 하한 구간의 시작점 — Lv.1의 채움비가 `MIN_ATTR_FILL × RAMP_START`가 된다.
 *
 * ⚠️ **`MIN_ATTR_FILL`을 클램프(`Math.max`)로 쓰면 하한 아래가 통째로 평평해진다.**
 * 실측(2026-08-23): ★4의 Lv.1~15가 전투력 44로 **완전히 동일**했다. 만렙이 클수록
 * 무효 구간도 커져 ★6은 Lv.1~25, 즉 **모든 등급에서 레벨 범위의 25%가 죽어 있었다.**
 * 실기기에서 "새 ★4를 키웠는데 12~13층에서 3파티가 전멸"로 드러났다 —
 * 플레이어가 쓴 경험치가 실제로 아무것도 하지 않고 있었다.
 *
 * 그래서 하한 아래를 평지가 아니라 경사로로 만든다(`stats.ts`의 `attrFill`).
 * 무릎 위(기준 파티 구간)를 1비트도 건드리지 않으면서 하한 아래를 단조 증가시키려면
 * 시작점이 무릎값보다 낮아야 한다. 즉 **Lv.1이 조금 약해지는 것은 이 설계의 대가**다.
 *
 * 0.8인 이유 — 경사가 너무 완만하면 반올림에 먹혀 다시 평지가 된다.
 * 실측(ashen 기준, 최장 연속 정체 레벨 수):
 *
 *   RAMP_START   Lv.1 채움비   최장 정체
 *      0.90        0.2250        8      ← 여전히 ★4 Lv.4~12가 평평
 *      0.85        0.2125        5
 *      0.80        0.2000        3      ← 채택
 *      0.70        0.1750        2
 *      0.60        0.1500        1      ← 정체는 없지만 갓 뽑은 개체가 40% 약해진다
 *
 * 0.8은 "정체가 체감되지 않는 선(3레벨 이하)"과 "갓 뽑은 개체를 20% 이상 깎지 않는 선"이
 * 만나는 지점이다. 더 낮추면 정체 1~2로 줄지만 소환 직후 체감이 나빠진다 —
 * 그건 애초에 이 결함으로 고생한 플레이어가 겪던 문제와 같은 방향이다.
 *
 * ⚠️ 반올림 때문에 `combatPower` 같은 **합산 지표로 재면 정체가 가려진다.**
 * 반드시 개별 스탯(hp/atk/def/spd)으로 잴 것 — 실제로 합산으로 재다가
 * 0.9의 8레벨 정체를 놓쳤다.
 *
 * **만졌으면 `npm run sim`과 `npx tsx climb-check.mts`를 둘 다 돌릴 것.**
 */
export const RAMP_START = 0.8;

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
