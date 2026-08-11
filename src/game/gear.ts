/**
 * 장비 규칙 — 순수 로직.
 *
 * React·DOM 의존 금지. 무작위성은 주입된 RNG를 통해서만 발생한다 (CLAUDE.md).
 *
 * 이 모듈의 책임은 "장비가 스탯에 어떻게 반영되는가"와 "죽으면 어떻게 되는가"까지다.
 * 소유·인벤토리 변경은 호출자(runStore)의 몫이다 — progression.fuse()가
 * consumedInstId만 돌려주고 제거는 스토어가 하는 것과 같은 경계다.
 */
import type {
  GearBonus, GearDefId, GearInstId, GearInstance, GearSlot, HeroInstId, RNG, Stats,
} from './types';
import { GEAR_DEFS, GEAR_TUNING, enhanceMult, enhanceChanceOf, enhanceCostOf } from './data/gear';

/** 강화까지 반영한 개별 장비의 실효 보정 */
export function bonusOf(inst: GearInstance): GearBonus {
  const def = GEAR_DEFS[inst.defId];
  if (!def) return {};
  const m = enhanceMult(inst.enhance);
  const out: GearBonus = {};
  for (const [k, v] of Object.entries(def.base) as Array<[keyof GearBonus, number]>) {
    if (v == null) continue;
    /*
      crit은 확률(0~1)이라 반올림하면 소수점이 통째로 날아간다.
      나머지는 정수 스탯이므로 반올림한다.
    */
    out[k] = k === 'crit' ? v * m : Math.round(v * m);
  }
  return out;
}

/** 여러 장비의 보정을 합친다 */
export function sumBonus(bonuses: GearBonus[]): GearBonus {
  const out: GearBonus = {};
  for (const b of bonuses) {
    for (const [k, v] of Object.entries(b) as Array<[keyof GearBonus, number]>) {
      if (v == null) continue;
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

/**
 * 한 영웅이 착용 중인 장비 전체의 보정.
 * @param gear 영웅의 slot → GearInstId 매핑
 * @param inventory 보유 장비 조회용
 */
export function heroBonus(
  gear: Partial<Record<GearSlot, GearInstId>> | undefined,
  inventory: Map<GearInstId, GearInstance>,
): GearBonus {
  if (!gear) return {};
  const list: GearBonus[] = [];
  for (const id of Object.values(gear)) {
    if (!id) continue;
    const inst = inventory.get(id);
    if (inst) list.push(bonusOf(inst));
  }
  return sumBonus(list);
}

/**
 * 스탯에 보정을 얹는다.
 *
 * ⚠️ 이 함수는 전투 진입 시 **한 번만** 불려야 한다.
 * 데미지 계산 경로마다 부르면 중복 적용된다 — 무기창고 배수를 buildAlly에서만
 * 적용한 것과 같은 이유다 (HANDOFF STEP 6).
 */
export function applyBonus(base: Stats, bonus: GearBonus): Stats {
  return {
    hp: Math.max(1, base.hp + (bonus.hp ?? 0)),
    atk: Math.max(0, base.atk + (bonus.atk ?? 0)),
    def: Math.max(0, base.def + (bonus.def ?? 0)),
    // 방어구의 spd 페널티가 음수로 내려가지 않게 막는다
    spd: Math.max(1, base.spd + (bonus.spd ?? 0)),
    crit: Math.max(0, Math.min(1, base.crit + (bonus.crit ?? 0))),
  };
}

// ------------------------------------------------------------
// 착용 / 해제
// ------------------------------------------------------------

export type EquipResult =
  | { ok: true; gear: Partial<Record<GearSlot, GearInstId>>; unequipped: GearInstId | null }
  | { ok: false; reason: 'not-owned' | 'hero-dead' | 'equipped-elsewhere' };

/**
 * 착용. 같은 슬롯에 이미 있으면 교체하고 벗은 것을 알려준다.
 *
 * 상태를 직접 바꾸지 않고 **결과만** 돌려준다. 인벤토리의 equippedBy 갱신은
 * 호출자가 한다 — 한 곳에서만 소유가 바뀌어야 유령 참조가 안 생긴다.
 */
export function equip(args: {
  hero: { instId: HeroInstId; isDead: boolean; gear?: Partial<Record<GearSlot, GearInstId>> };
  gearId: GearInstId;
  inventory: Map<GearInstId, GearInstance>;
}): EquipResult {
  const { hero, gearId, inventory } = args;
  if (hero.isDead) return { ok: false, reason: 'hero-dead' };

  const inst = inventory.get(gearId);
  if (!inst) return { ok: false, reason: 'not-owned' };
  // 다른 영웅이 쓰고 있으면 막는다. 조용히 뺏으면 그쪽 전투력이 말없이 떨어진다.
  if (inst.equippedBy && inst.equippedBy !== hero.instId) {
    return { ok: false, reason: 'equipped-elsewhere' };
  }

  const def = GEAR_DEFS[inst.defId];
  if (!def) return { ok: false, reason: 'not-owned' };

  const cur = { ...(hero.gear ?? {}) };
  const prev = cur[def.slot] ?? null;
  cur[def.slot] = gearId;

  return { ok: true, gear: cur, unequipped: prev === gearId ? null : prev };
}

/** 해제. 비어 있던 슬롯이면 unequipped가 null이다. */
export function unequip(
  hero: { gear?: Partial<Record<GearSlot, GearInstId>> },
  slot: GearSlot,
): { gear: Partial<Record<GearSlot, GearInstId>>; unequipped: GearInstId | null } {
  const cur = { ...(hero.gear ?? {}) };
  const prev = cur[slot] ?? null;
  delete cur[slot];
  return { gear: cur, unequipped: prev };
}

// ------------------------------------------------------------
// 사망 시 회수
// ------------------------------------------------------------

export interface RecoveryOutcome {
  /** 창고로 돌아온 장비 */
  recovered: GearInstId[];
  /** 영웅과 함께 사라진 장비 */
  lost: GearInstId[];
}

/**
 * 사망한 영웅의 장비 회수 판정. **슬롯마다 독립**으로 굴린다.
 *
 * 전부 살리면 죽음의 비용이 줄어 퍼머데스가 희석되고,
 * 전부 뺏으면 좋은 장비를 아무도 안 쓴다. 그 사이가 recoveryRate다.
 *
 * 슬롯 순서를 고정(weapon→armor→trinket)하는 이유는 재현성이다.
 * 객체 키 순서에 의존하면 같은 시드로도 결과가 갈릴 수 있다.
 */
export function rollRecovery(
  gear: Partial<Record<GearSlot, GearInstId>> | undefined,
  rng: RNG,
  rate: number = GEAR_TUNING.recoveryRate,
): RecoveryOutcome {
  const recovered: GearInstId[] = [];
  const lost: GearInstId[] = [];
  if (!gear) return { recovered, lost };

  for (const slot of ['weapon', 'armor', 'trinket'] as const) {
    const id = gear[slot];
    if (!id) continue;
    if (rng() < rate) recovered.push(id);
    else lost.push(id);
  }
  return { recovered, lost };
}

// ------------------------------------------------------------
// 강화
// ------------------------------------------------------------

export type EnhanceResult =
  | { ok: true; success: true; gear: GearInstance; spent: number }
  | { ok: true; success: false; gear: GearInstance; spent: number }
  | { ok: false; reason: 'max-enhance' | 'not-enough-gold' | 'not-owned' };

/**
 * 강화. 실패해도 **단계가 내려가거나 파괴되지 않는다** — 금만 잃는다.
 *
 * 퍼머데스가 이미 이 게임의 상실을 담당한다. 강화까지 파괴를 넣으면
 * 상실이 흔해져서 영웅을 잃는 무게가 오히려 줄어든다.
 */
export function enhance(args: {
  gear: GearInstance;
  gold: number;
  rng: RNG;
}): EnhanceResult {
  const { gear, gold, rng } = args;
  if (!GEAR_DEFS[gear.defId]) return { ok: false, reason: 'not-owned' };

  const cost = enhanceCostOf(gear.enhance);
  const chance = enhanceChanceOf(gear.enhance);
  if (cost == null || chance == null) return { ok: false, reason: 'max-enhance' };
  if (gold < cost) return { ok: false, reason: 'not-enough-gold' };

  if (rng() < chance) {
    return { ok: true, success: true, gear: { ...gear, enhance: gear.enhance + 1 }, spent: cost };
  }
  return { ok: true, success: false, gear, spent: cost };
}

// ------------------------------------------------------------
// 드롭
// ------------------------------------------------------------

/**
 * 가중치 표에서 하나를 고른다.
 * 가중치가 전부 0이면 null (해당 깊이에 후보가 없는 경우).
 */
export function weightedPick<K extends string>(
  weights: Record<K, number>,
  rng: RNG,
): K | null {
  const entries = (Object.entries(weights) as Array<[K, number]>).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;

  let roll = rng() * total;
  for (const [k, w] of entries) {
    roll -= w;
    if (roll < 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** 새 장비 인스턴스를 만든다. id 부여는 호출자가 정한 번호를 쓴다. */
export function makeGear(defId: GearDefId, n: number): GearInstance {
  return {
    instId: `${defId}#${n}` as GearInstId,
    defId,
    enhance: 0,
    equippedBy: null,
  };
}
