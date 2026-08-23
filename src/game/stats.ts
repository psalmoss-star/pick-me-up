import type {
  AttrCaps, AttrKey, Attributes, HeroDef, HeroInstance,
  Klass, Star, StarScaling, Stats,
} from './types';
import { derivePotential, type PotentialBonus } from './potential';
import { MIN_ATTR_FILL } from './data/elements';

/**
 * 능력치 모델
 *
 *   상한(max)  = ★1 기준 상한 × 등급 배율 × (1 + 잠재 계수)  → 승급으로 열린다
 *   현재(cur)  = 상한 × max(최소 충전율, 레벨 / 등급 만렙)    → 레벨업으로 채운다
 *
 * "15/15"는 승급 없이 더 성장할 수 없다는 뜻이고, 화면에 숫자로 그대로 드러난다.
 *
 * 잠재 계수는 개체 시드에서 파생되며 저장하지 않는다(potential.ts).
 * 이것이 같은 등급·같은 종류 안에서 개체를 가르는 유일한 축이다.
 * 인자를 생략하면 계수 0 — 잠재치를 모르는 호출부(적, 시뮬레이터)는 기존과 동일하게 동작한다.
 */

const ATTR_KEYS: AttrKey[] = ['str', 'int', 'vit', 'agi'];

export function capsFor(
  base: AttrCaps,
  star: Star,
  scaling: Record<Star, StarScaling>,
  potential?: PotentialBonus,
): AttrCaps {
  const m = scaling[star].statMultiplier;
  const p = (k: AttrKey) => 1 + (potential?.[k] ?? 0);
  return {
    str: Math.round(base.str * m * p('str')),
    int: Math.round(base.int * m * p('int')),
    vit: Math.round(base.vit * m * p('vit')),
    agi: Math.round(base.agi * m * p('agi')),
  };
}

export function computeAttributes(
  def: HeroDef,
  star: Star,
  level: number,
  scaling: Record<Star, StarScaling>,
  potential?: PotentialBonus,
): Attributes {
  const caps = capsFor(def.baseCaps, star, scaling, potential);
  const maxLevel = scaling[star].maxLevel;
  /*
    ⚠️ 하한(`MIN_ATTR_FILL`)이 없으면 **등급이 높을수록 약하게 시작한다.**
    만렙이 등급마다 커지므로(★1은 10, ★5는 80) Lv.1 충전율이 10% → 1.25%로
    거꾸로 간다. 실측에서 갓 뽑은 ★4·★5의 atk이 6으로 ★1의 12보다 낮았다.
    수치의 근거와 재측정 조건은 `data/elements.ts`의 상수 주석에 있다.
  */
  const fill = Math.min(1, Math.max(MIN_ATTR_FILL, level / maxLevel));
  const build = (k: AttrKey) => ({
    current: Math.max(1, Math.round(caps[k] * fill)),
    max: caps[k],
  });
  return { str: build('str'), int: build('int'), vit: build('vit'), agi: build('agi') };
}

/** 능력치가 전부 상한에 도달했는가 = 승급 필요 신호 */
export function isAtCap(a: Attributes): boolean {
  return ATTR_KEYS.every((k) => a[k].current >= a[k].max);
}

// ------------------------------------------------------------
// 파생 전투 스탯
// ------------------------------------------------------------

export function deriveStats(a: Attributes, star: Star, attackAttr: 'str' | 'int'): Stats {
  const { str, int, vit, agi } = a;
  return {
    hp: vit.current * 20 + star * 100,
    atk: (attackAttr === 'int' ? int.current : str.current) * 6,
    def: vit.current * 2 + str.current,
    spd: agi.current * 3,
    crit: Math.min(0.6, 0.03 + agi.current * 0.002),
  };
}

export function computeHeroStats(
  def: HeroDef,
  star: Star,
  level: number,
  scaling: Record<Star, StarScaling>,
  potential?: PotentialBonus,
): Stats {
  return deriveStats(
    computeAttributes(def, star, level, scaling, potential),
    star,
    def.attackAttr,
  );
}

/**
 * 개체의 잠재 계수. seed가 없는 기존 개체는 계수 0으로 취급한다.
 *
 * 저장된 세이브에 seed가 없을 수 있으므로(마이그레이션 전) 여기서 한 번 흡수한다.
 * 이 지점이 "잠재치를 아는 유일한 관문"이며, 화면은 참값을 직접 읽으면 안 된다 — reveal.ts를 쓸 것.
 */
export function potentialOf(inst: HeroInstance): PotentialBonus | undefined {
  return inst.seed === undefined ? undefined : derivePotential(inst.seed, inst.star);
}

/** 개체 기준 최종 전투 스탯. 잠재치가 자동 반영된다. */
export function statsOfInstance(
  inst: HeroInstance,
  def: HeroDef,
  scaling: Record<Star, StarScaling>,
): Stats {
  return computeHeroStats(def, inst.star, inst.level, scaling, potentialOf(inst));
}

/** 개체 기준 능력치(현재/최대). 상세 화면이 쓴다. */
export function attributesOfInstance(
  inst: HeroInstance,
  def: HeroDef,
  scaling: Record<Star, StarScaling>,
): Attributes {
  return computeAttributes(def, inst.star, inst.level, scaling, potentialOf(inst));
}

export function maxHpOf(
  inst: HeroInstance,
  def: HeroDef,
  scaling: Record<Star, StarScaling>,
): number {
  return statsOfInstance(inst, def, scaling).hp;
}

// ------------------------------------------------------------
// 클래스 — 등급에 따라 자동 승격
// ------------------------------------------------------------

const KLASS_BY_STAR: Record<Star, Klass> = {
  1: '초보자', 2: '견습병', 3: '정예병',
  4: '기사', 5: '기사단장', 6: '영웅',
};

export function klassFor(star: Star): Klass {
  return KLASS_BY_STAR[star];
}
