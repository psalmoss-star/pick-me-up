/**
 * 제작 레시피 — 재료의 유일한 소비처.
 *
 * 밸런스 수치는 전부 여기 있고 코드에는 없다 (CLAUDE.md 아키텍처 규칙).
 *
 * ── 왜 유물만 만드는가 ──────────────────────────────────
 * `data/gear.ts:110`이 이미 못 박아 뒀다 — "relic은 **상점에 없다**(price 없음),
 * 제작·드롭·과제로만 나온다. 금으로 최상급을 살 수 있으면 등반이 아니라
 * 지갑이 강함을 정한다."
 *
 * 즉 제작은 **금을 우회하는 경로여야 의미가 있다.** common~rare을 만들게 하면
 * 상점과 경쟁하게 되고, 상점이 금으로 즉시 주는 이상 제작은 항상 진다.
 * 유물 3종(무기/방어구/장신구 각 1)만 레시피를 갖는다.
 *
 * ── 왜 금도 함께 받는가 ────────────────────────────────
 * 재료만 받으면 후반에 남아도는 금(실측 30전투 32,986)이 갈 곳이 그대로 없다.
 * 금은 **곁들이**다 — 금이 부족해서 못 만드는 일이 없도록 잡되(유물 1개 =
 * rare 상점가 1,800 수준), 재료가 없으면 금이 아무리 많아도 못 만든다.
 * **재료가 문지기이고 금은 문턱이 아니다.**
 *
 * ── 비용의 근거 (실측, mat-probe) ──────────────────────
 * 층을 한 번씩만 돌파했을 때 쌓이는 평균(200시드):
 *
 *   6층까지   무쇠 5.7 · 가죽 1.5 · 정수 0.0
 *   12층까지  무쇠 9.2 · 가죽 4.4 · 정수 0.8
 *   20층까지  무쇠 12.1 · 가죽 8.8 · 정수 3.4
 *   30층까지  무쇠 14.3 · 가죽 13.7 · 정수 8.4
 *
 * 여기에 모험 보상이 더해진다(폐광 2전투당 무쇠 4 등) — 즉 아래 비용은
 * **등반만으로도 닿지만 모험을 섞으면 눈에 띄게 빨라지는** 지점에 있다.
 * 그게 STEP 37이 모험을 먼저 만든 이유와 맞물린다.
 *
 * ⚠️ **정수를 요구하는 것이 곧 "중층 이후 목표"라는 뜻이다.**
 * 정수는 12층 이전에 사실상 안 나온다(가중치 rare가 6층 이하에서 0).
 * 정수 요구량을 낮추면 유물이 저층 목표가 되고, 그러면 이후 등반의
 * 장비 드롭이 통째로 무의미해진다 (`dropWeights`가 9층부터 relic을 주는 것과 충돌).
 */
import type { GearDefId, MaterialBag } from '../types';
import { MATERIAL } from './materials';

export interface RecipeDef {
  /** 만들어지는 장비. `GEAR_DEFS`에 있어야 한다 (테스트가 잠근다) */
  gearDefId: GearDefId;
  /** 필요한 재료 — 종류별 수량 */
  cost: MaterialBag;
  /** 함께 드는 금 */
  gold: number;
  /**
   * 레시피가 보이기 시작하는 층.
   *
   * 잠긴 레시피도 **목록에는 보인다** — 무엇을 위해 모으는지 모르면
   * 재료가 다시 "숫자 채우기"가 된다 (`materials.ts`가 종류를 나눈 것과 같은 이유).
   */
  unlockFloor: number;
}

const bag = (pairs: Array<[string, number]>): MaterialBag =>
  Object.fromEntries(pairs) as MaterialBag;

/**
 * 유물 3종.
 *
 * 무기 → 방어구 → 장신구 순으로 비싸진다. 순서의 근거는 `gear.ts`의 보정값이다 —
 * 장신구 `t_lastlight`(hp 150 · spd 12 · crit 8%)가 셋 중 가장 넓게 붙는다.
 */
export const RECIPES: readonly RecipeDef[] = [
  {
    // 탑을 베는 것 — atk 56 · crit 7% · spd 4
    gearDefId: 'w_towerbane' as GearDefId,
    cost: bag([[MATERIAL.ore, 12], [MATERIAL.hide, 6], [MATERIAL.essence, 2]]),
    gold: 1800,
    unlockFloor: 10,
  },
  {
    // 재의 장막 — hp 330 · def 34
    gearDefId: 'a_ashshroud' as GearDefId,
    cost: bag([[MATERIAL.ore, 8], [MATERIAL.hide, 12], [MATERIAL.essence, 3]]),
    gold: 2000,
    unlockFloor: 12,
  },
  {
    // 마지막 불빛 — hp 150 · spd 12 · crit 8%. 셋 중 가장 넓게 붙는다
    gearDefId: 't_lastlight' as GearDefId,
    cost: bag([[MATERIAL.ore, 6], [MATERIAL.hide, 8], [MATERIAL.essence, 5]]),
    gold: 2400,
    unlockFloor: 15,
  },
];

export const RECIPE_BY_GEAR: Record<string, RecipeDef> = Object.fromEntries(
  RECIPES.map((r) => [r.gearDefId, r]),
);
