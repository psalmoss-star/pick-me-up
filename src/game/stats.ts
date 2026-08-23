import type {
  AttrCaps, AttrKey, Attributes, HeroDef, HeroInstance,
  Klass, Star, StarScaling, Stats,
} from './types';
import { derivePotential, type PotentialBonus } from './potential';
import { MIN_ATTR_FILL, RAMP_START } from './data/elements';

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

/**
 * 능력치 채움비 — 상한 중 몇 %가 현재 채워져 있는가.
 *
 * 하한(`MIN_ATTR_FILL`) 위에서는 `level / maxLevel` 그대로다. **여기가 검증된
 * 승률표(6층 70% / 12층 43% / 20층 55%)가 걸린 구간이므로 건드리면 안 된다.**
 * 기준 파티(★3 Lv.30, ★4 Lv.50 …)는 전부 이 구간에 있다.
 *
 * ⚠️ 예전에는 `Math.max(MIN_ATTR_FILL, level / maxLevel)`이었다. 클램프는
 * **하한 아래를 통째로 평평하게 만든다** — ★4의 Lv.1~15가 전부 채움비 0.25로
 * 같았고, 레벨 15개가 아무 효과도 없었다(실측: 전투력 44 고정).
 * 등급이 높을수록 만렙이 크므로 무효 구간도 같이 커진다(★6은 Lv.1~25).
 * 갓 뽑은 고등급을 키우던 플레이어가 "올려도 안 세진다"를 겪은 원인이다.
 *
 * 그래서 하한 아래를 평지가 아니라 **경사로**로 바꾼다. 하한에 닿는 레벨(무릎)에서
 * 기존 곡선과 정확히 만나므로 무릎 위는 1비트도 안 움직인다.
 * `RAMP_START`만큼 낮은 지점에서 출발해 무릎까지 단조 증가한다.
 */
export function attrFill(level: number, maxLevel: number): number {
  const ratio = level / maxLevel;
  // 하한 위 — 기존 공식 그대로. 밸런스 회귀선이 여기 있다
  if (ratio >= MIN_ATTR_FILL) return Math.min(1, ratio);

  const knee = MIN_ATTR_FILL * maxLevel; // 채움비가 하한에 닿는 레벨
  if (knee <= 1) return MIN_ATTR_FILL;
  const t = Math.min(1, Math.max(0, (level - 1) / (knee - 1)));
  return MIN_ATTR_FILL * (RAMP_START + (1 - RAMP_START) * t);
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
  // 채움비 규칙과 그 근거는 `attrFill` 주석에 있다 (하한·경사로 둘 다).
  const fill = attrFill(level, maxLevel);
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
