/**
 * 전투력 — 개체의 강함을 한 숫자로 요약한다. **표시 전용.**
 *
 * ⚠️ 이 모듈을 `battle.ts`·`encounter.ts`·`sim.ts`에서 import하지 말 것.
 * 전투력은 화면이 읽는 요약값이지 전투의 입력이 아니다.
 * (`power.test.ts`가 "가중치를 바꿔도 전투 결과가 같다"로 이 격리를 잠근다.)
 *
 * ⚠️ **`favorite`를 쓰지 않는다.** `types.ts`가 명시적으로 금지한다 —
 * "전투력·확률·밸런스 어디에도 들어가지 않는다". 표식은 UI 안전장치 전용이다.
 */
import type {
  GearBonus, HeroDef, HeroInstance, Star, StarScaling, Stats,
} from './types';
import { statsOfInstance } from './stats';
import { applyBonus } from './gear';
import { POWER_WEIGHTS as W, POWER_SCALE } from './data/power';

/**
 * 전투 스탯 → 전투력.
 *
 * 가중치가 전부 양수이므로 **어떤 스탯이 올라도 전투력은 내려가지 않는다.**
 * 단 승급은 레벨이 1로 리셋되어 실제로 떨어질 수 있다 — 그건 설계이고
 * (CLAUDE.md: "승급 직후는 이전보다 약하다") 화면은 그 하락을 숨기지 않는다.
 */
export function combatPower(s: Stats): number {
  const raw =
    s.hp * W.hp + s.atk * W.atk + s.def * W.def + s.spd * W.spd + s.crit * W.crit;
  // 0을 돌려주지 않는다 — 빈 화면·0 나누기를 막는다
  return Math.max(1, Math.round(raw / POWER_SCALE));
}

/**
 * 개체의 전투력.
 *
 * 잠재치는 `statsOfInstance`가 이미 스탯에 녹여 넣는다 — 여기서 참값을 따로 읽지 않는다.
 * 그래서 전투력은 잠재치의 **결과**만 보여줄 뿐 값을 누설하지 않는다.
 */
export function heroPower(
  inst: HeroInstance,
  def: HeroDef,
  scaling: Record<Star, StarScaling>,
  bonus?: GearBonus,
): number {
  const base = statsOfInstance(inst, def, scaling);
  return combatPower(bonus ? applyBonus(base, bonus) : base);
}

/**
 * 파티 전투력 = 구성원 합.
 *
 * ⚠️ 곱하거나 시너지 배수를 얹지 않는다. 파티 단위 보너스는 이 게임에 **없다** —
 * 없는 것을 요약값이 지어내면 화면이 밸런스에 대해 거짓말하게 된다.
 */
export function partyPower(powers: readonly number[]): number {
  return powers.reduce((a, b) => a + b, 0);
}
