import type {
  HeroDef, HeroDefId, HeroInstance, Star, StarScaling, Wallet,
} from './types';
import { attributesOfInstance, isAtCap, klassFor } from './stats';

/**
 * 성장의 세 갈래
 *
 *   경험치 → 레벨업 → 능력치가 상한까지 채워진다
 *   승급   → 상한 자체가 열린다 (레벨은 1로 리셋 = 일시적 약화)
 *   합성   → 다른 영웅을 제물로 바쳐 경험치/승급을 앞당긴다 (제물은 영구 소멸)
 */

// ------------------------------------------------------------
// 경험치 / 레벨
// ------------------------------------------------------------

/** 다음 레벨까지 필요한 경험치. 등급이 높을수록 비싸다. */
export function expToNext(star: Star, level: number): number {
  return Math.round(40 * level * (1 + (star - 1) * 0.45));
}

export interface GainResult {
  hero: HeroInstance;
  levelsGained: number;
  /** 만렙에 도달해 더 이상 경험치를 받을 수 없게 됨 */
  hitMaxLevel: boolean;
  /** 넘치는 경험치는 버려진다 (만렙일 때) */
  wastedExp: number;
}

export function gainExp(
  hero: HeroInstance,
  amount: number,
  scaling: Record<Star, StarScaling>,
): GainResult {
  const maxLevel = scaling[hero.star].maxLevel;
  let { level, exp } = hero;
  let gained = 0;
  let pool = Math.max(0, Math.round(amount));

  while (level < maxLevel && pool > 0) {
    const need = expToNext(hero.star, level) - exp;
    if (pool >= need) {
      pool -= need;
      level += 1;
      exp = 0;
      gained += 1;
    } else {
      exp += pool;
      pool = 0;
    }
  }

  const hitMax = level >= maxLevel;
  return {
    hero: { ...hero, level, exp: hitMax ? 0 : exp },
    levelsGained: gained,
    hitMaxLevel: hitMax,
    wastedExp: hitMax ? pool : 0,
  };
}

// ------------------------------------------------------------
// 승급
// ------------------------------------------------------------

export type PromoteCheck =
  | { ok: true; cost: Partial<Wallet> }
  | { ok: false; reason: 'max-star' }
  | { ok: false; reason: 'level'; needLevel: number }
  | { ok: false; reason: 'materials'; missing: Partial<Wallet> };

export function canPromote(
  hero: HeroInstance,
  wallet: Wallet,
  scaling: Record<Star, StarScaling>,
): PromoteCheck {
  if (hero.star >= 6) return { ok: false, reason: 'max-star' };

  const rule = scaling[hero.star];
  if (hero.level < rule.maxLevel) {
    return { ok: false, reason: 'level', needLevel: rule.maxLevel };
  }

  const cost: Partial<Wallet> = rule.requiresAwakening
    ? { awakeningStones: 1 }
    : { promotionStones: rule.promotionStones };

  const missing: Partial<Wallet> = {};
  for (const [k, v] of Object.entries(cost) as [keyof Wallet, number][]) {
    if ((wallet[k] ?? 0) < v) missing[k] = v - (wallet[k] ?? 0);
  }
  if (Object.keys(missing).length > 0) return { ok: false, reason: 'materials', missing };

  return { ok: true, cost };
}

export interface PromoteResult {
  hero: HeroInstance;
  wallet: Wallet;
  fromStar: Star;
  toStar: Star;
}

export function promote(
  hero: HeroInstance,
  wallet: Wallet,
  scaling: Record<Star, StarScaling>,
): PromoteResult | PromoteCheck {
  const check = canPromote(hero, wallet, scaling);
  if (!check.ok) return check;

  const toStar = (hero.star + 1) as Star;
  const nextWallet = { ...wallet };
  for (const [k, v] of Object.entries(check.cost) as [keyof Wallet, number][]) {
    nextWallet[k] = (nextWallet[k] ?? 0) - v;
  }

  return {
    hero: {
      ...hero,
      star: toStar,
      klass: klassFor(toStar),
      level: 1,       // 승급 직후는 일시적으로 약해진다
      exp: 0,
      currentHp: 0,   // 최대치로 회복
    },
    wallet: nextWallet,
    fromStar: hero.star,
    toStar,
  };
}

/** 승급이 필요한 상태인가 = 모든 능력치가 상한에 닿았는가 */
export function needsPromotion(
  hero: HeroInstance,
  def: HeroDef,
  scaling: Record<Star, StarScaling>,
): boolean {
  if (hero.star >= 6) return false;
  return isAtCap(attributesOfInstance(hero, def, scaling));
}

// ------------------------------------------------------------
// 합성 — 영웅을 제물로 바친다
// ------------------------------------------------------------

/** 합성소 레벨에 따른 경험치 전환율 */
export function fuseEfficiency(facilityLevel: number): number {
  return 0.5 + Math.min(3, Math.max(1, facilityLevel)) * 0.15; // Lv1 0.65 → Lv3 0.95
}

/** 제물 영웅이 가진 가치를 경험치로 환산 */
export function sacrificeValue(
  sac: HeroInstance,
  scaling: Record<Star, StarScaling>,
): number {
  // 등급이 높고 레벨이 높을수록 값이 크다
  const starWorth = Math.round(scaling[sac.star].statMultiplier * 400);
  const levelWorth = sac.level * 30 * sac.star;
  return starWorth + levelWorth;
}

export type FuseCheck =
  | { ok: true }
  | { ok: false; reason: 'same-hero' }
  | { ok: false; reason: 'target-dead' | 'sacrifice-dead' }
  | { ok: false; reason: 'target-max-level' };

export function canFuse(
  target: HeroInstance,
  sac: HeroInstance,
  scaling: Record<Star, StarScaling>,
): FuseCheck {
  if (target.instId === sac.instId) return { ok: false, reason: 'same-hero' };
  if (target.isDead) return { ok: false, reason: 'target-dead' };
  if (sac.isDead) return { ok: false, reason: 'sacrifice-dead' };
  if (target.level >= scaling[target.star].maxLevel) {
    return { ok: false, reason: 'target-max-level' };
  }
  return { ok: true };
}

export interface FuseResult {
  ok: true;
  target: HeroInstance;
  /** 소멸한 제물의 instId — 호출자는 반드시 로스터에서 제거해야 한다 */
  consumedInstId: string;
  consumedDefId: HeroDefId;
  expGained: number;
  levelsGained: number;
  wastedExp: number;
}

export function fuse(args: {
  target: HeroInstance;
  sacrifice: HeroInstance;
  facilityLevel: number;
  scaling: Record<Star, StarScaling>;
}): FuseResult | FuseCheck {
  const { target, sacrifice, facilityLevel, scaling } = args;
  const check = canFuse(target, sacrifice, scaling);
  if (!check.ok) return check;

  const raw = sacrificeValue(sacrifice, scaling);
  const exp = Math.round(raw * fuseEfficiency(facilityLevel));
  const grown = gainExp(target, exp, scaling);

  return {
    ok: true,
    target: grown.hero,
    consumedInstId: sacrifice.instId,
    consumedDefId: sacrifice.defId,
    expGained: exp,
    levelsGained: grown.levelsGained,
    wastedExp: grown.wastedExp,
  };
}
