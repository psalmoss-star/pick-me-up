/**
 * 장비 착용 전 비교 — **표시 전용.**
 *
 * 1차 셀프 테스트(2026-09-30): "장비를 낄 때 고려가 어려웠다." 끼기 전에 무엇이 얼마나 오르는지가 없었다.
 *
 * `gear.ts`가 아니라 여기 두는 이유: 전투력(`power.ts`)은 표시 전용이고 엔진이 닿으면 안 되는데,
 * `battle.ts`가 `gear.ts`를 import한다. 비교를 `gear.ts`에 넣으면 엔진이 전투력에 간접으로 닿는다.
 */
import type {
  GearInstId, GearInstance, GearSlot, HeroDef, HeroInstance, Star, StarScaling, Stats,
} from './types';
import { applyBonus, heroBonus } from './gear';
import { GEAR_DEFS } from './data/gear';
import { statsOfInstance } from './stats';
import { combatPower } from './power';

export interface GearDelta {
  /** 바뀌는 스탯만 담는다 (0인 항목은 없다) */
  stats: Partial<Record<keyof Stats, number>>;
  power: number;
}

const STAT_KEYS: (keyof Stats)[] = ['hp', 'atk', 'def', 'spd', 'crit'];

function statsWith(
  hero: HeroInstance,
  def: HeroDef,
  scaling: Record<Star, StarScaling>,
  inventory: Map<GearInstId, GearInstance>,
  gear: Partial<Record<GearSlot, GearInstId>>,
): Stats {
  return applyBonus(statsOfInstance(hero, def, scaling), heroBonus(gear, inventory, def.lineage));
}

/** 이 영웅이 `slot`에 `candidate`를 끼면(지금 것 대신) 얼마나 바뀌나. `null`은 벗기 */
export function gearDelta(
  hero: HeroInstance,
  def: HeroDef,
  scaling: Record<Star, StarScaling>,
  inventory: Map<GearInstId, GearInstance>,
  slot: GearSlot,
  candidate: GearInstance | null,
): GearDelta {
  const now = { ...(hero.gear ?? {}) };
  const next = { ...now };
  if (candidate) next[slot] = candidate.instId;
  else delete next[slot];

  const a = statsWith(hero, def, scaling, inventory, now);
  const b = statsWith(hero, def, scaling, inventory, next);
  const stats: GearDelta['stats'] = {};
  for (const k of STAT_KEYS) {
    const d = b[k] - a[k];
    // crit은 확률이라 부동소수 잔차가 남는다
    if (Math.abs(d) > 1e-9) stats[k] = d;
  }
  return { stats, power: combatPower(b) - combatPower(a) };
}

/**
 * 이 슬롯에서 전투력이 가장 오르는 **빈** 장비. 오르는 게 없으면 `null`.
 * 남이 낀 장비는 고르지 않는다 — 조용히 가져오면 그쪽 전투력이 말없이 떨어진다(`equip`과 같은 이유).
 */
export function bestFreeGear(
  hero: HeroInstance,
  def: HeroDef,
  scaling: Record<Star, StarScaling>,
  inventory: Map<GearInstId, GearInstance>,
  slot: GearSlot,
): GearInstance | null {
  let best: GearInstance | null = null;
  let bestGain = 0;
  for (const g of inventory.values()) {
    if (g.equippedBy || GEAR_DEFS[g.defId]?.slot !== slot) continue;
    const gain = gearDelta(hero, def, scaling, inventory, slot, g).power;
    if (gain > bestGain) {
      best = g;
      bestGain = gain;
    }
  }
  return best;
}
