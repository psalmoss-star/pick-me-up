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
 * 장비 드롭이 통째로 무의미해진다 (장비 사다리 뒤로 유물은 일반 드롭에서 나오지 않는다 — 제작·최종 과제가 유일한 길이다).
 */
import type { GearDefId, GearSlot, MaterialBag } from '../types';
import { MATERIAL } from './materials';
import { ladderSet } from './gear';

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

/**
 * 재련 비용 — 유물을 한 단계 올리는 데 드는 재료(슬롯별, 단계와 무관하게 같다).
 *
 * ── 기준 ──────────────────────────────────────────────
 * **한 영웅의 유물 한 벌(3종)을 한 단계 올리는 비용 ≈ 등반 한 구간(10층)에서 쌓이는 재료.**
 * 한 벌은 등반만으로 따라가고, 두 번째 영웅부터는 모험·재도전이 있어야 한다.
 * 수급 실측은 `scripts/mat-probe.mts`. 수급(드롭 확률·가중치)을 바꿨으면 다시 잴 것.
 *
 *   구간(10층)당 수급, 층당 1회 돌파 200시드 평균 — 한 벌 비용(무쇠 1 · 가죽 3 · 정수 4)의 비율
 *     3단계  무쇠 2.7 · 가죽 5.3 · 정수 5.0   →  37% · 56% · 80%
 *     6단계  무쇠 2.5 · 가죽 5.0 · 정수 5.3   →  40% · 60% · 75%
 *    10단계  무쇠 2.6 · 가죽 5.2 · 정수 5.1   →  38% · 58% · 78%
 *
 * ⚠️ **구간 비율만 보면 안 된다 — 유물 3종 제작이 먼저 재료를 먹는다**(무쇠 26 · 가죽 26 · 정수 10).
 * 100층까지 누적 수급과 "제작 3종 + 재련 8회"를 나란히 놓아야 "한 벌은 등반만으로"가 참이 된다:
 *
 *            누적 수급   제작   재련 8회   합계
 *     무쇠     35.1      26      8        34
 *     가죽     50.2      26     24        50
 *     정수     44.2      10     32        42
 *
 * 처음 값(무쇠 2 · 가죽 4 · 정수 5)은 구간 비율로는 합격이었지만 누적으로는 셋 다 모자랐다
 * (정수 50/44, 가죽 58/50, 무쇠 42/35 — 등반만으로는 한 벌도 끝까지 못 따라갔다).
 * 두 번째 영웅부터는 모험·재도전이 있어야 한다.
 *
 * 단계가 올라도 재료 수량이 같은 이유: 21층 이후 재료 가중치가 고정이라(`materialWeights`)
 * 구간당 수급이 같다. 수량을 키우면 깊이 갈수록 재련이 밀린다.
 */
export const REFINE_MATERIALS: Record<GearSlot, MaterialBag> = {
  weapon: bag([[MATERIAL.essence, 2]]),
  armor: bag([[MATERIAL.essence, 1], [MATERIAL.hide, 2], [MATERIAL.ore, 1]]),
  trinket: bag([[MATERIAL.essence, 1], [MATERIAL.hide, 1]]),
};

/**
 * 재련 비용 — 재료 + 금. 금은 **곁들이**다(제작과 같은 원칙): 올라갈 단계의 보급형 한 개 값.
 * 재료가 문지기이고 금은 문턱이 아니다.
 */
export function refineCostOf(slot: GearSlot, toTier: number): { cost: MaterialBag; gold: number } {
  const supply = ladderSet(toTier, 'supply').find((d) => d.slot === slot);
  return { cost: REFINE_MATERIALS[slot], gold: supply?.price ?? 0 };
}
