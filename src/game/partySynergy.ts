/**
 * 편성의 특성 맞물림 — **표시 전용.** 전투 엔진은 이 모듈을 모른다.
 *
 * 계열 특성(STEP 69)과 장비 궁합(STEP 70)이 편성 화면의 판단 근거로 보이게 한다.
 * `floorIntel.ts`와 같은 원칙이다: **엔진에 실제로 있는 것만 말하고 수치를 약속하지 않는다.**
 * 수치는 상태창의 특성 줄(`describeTrait`)이 말한다 — 여기서 또 적으면 두 곳으로 갈린다.
 */
import type {
  GearInstId, GearInstance, GearSlot, HeroDef, HeroDefId, HeroInstance, Lineage, Skill, SkillId,
} from './types';
import { GEAR_DEFS } from './data/gear';
import { GEAR_AFFINITY } from './data/gearAffinity';

/** 적에게 해로운 상태를 거는 기술이 있는가 — 사냥꾼의 약점 사냥이 노리는 것을 만들어 주는 영웅 */
export function inflictsStatus(def: HeroDef, skills: Record<SkillId, Skill>): boolean {
  return def.skillIds.some((id) => {
    const s = skills[id];
    return !!s && s.targetSide === 'enemy' && s.effects.some((e) => e.kind === 'debuff');
  });
}

export type SynergyNote =
  /** 지휘관이 있다 — 전장에 있는 동안 편성 전원의 공격이 오른다 */
  | { kind: 'led' }
  /** 지휘관이 둘 이상 — 진두지휘는 한 번만 걸린다(`battle.ts` refreshAura) */
  | { kind: 'doubleCommander' }
  /** 사냥꾼이 있고, 상태이상을 거는 **다른** 동료가 `allies`명이다 */
  | { kind: 'hunterFed'; allies: number };

/** 편성에서 실제로 맞물리는 특성 — 맞물림이 없으면 빈 배열 */
export function synergyNotes(
  party: readonly HeroInstance[],
  defs: Record<HeroDefId, HeroDef>,
  skills: Record<SkillId, Skill>,
): SynergyNote[] {
  const members = party.filter((h) => !h.isDead && defs[h.defId]).map((h) => ({ h, def: defs[h.defId] }));
  const count = (l: Lineage) => members.filter((m) => m.def.lineage === l).length;
  const out: SynergyNote[] = [];

  const commanders = count('commander');
  if (commanders >= 1 && members.length >= 2) out.push({ kind: 'led' });
  if (commanders >= 2) out.push({ kind: 'doubleCommander' });

  const hunters = members.filter((m) => m.def.lineage === 'hunter');
  if (hunters.length > 0) {
    // 사냥꾼 자신이 거는 독은 세지 않는다 — "동료와 맞물리는가"를 말하는 줄이다
    const allies = members.filter((m) => m.def.lineage !== 'hunter' && inflictsStatus(m.def, skills)).length;
    if (allies > 0) out.push({ kind: 'hunterFed', allies });
  }
  return out;
}

/**
 * 주 장비 슬롯이 비어 있는데 **창고에 낄 것이 있는** 영웅 — 바로 손볼 수 있는 것만 알린다.
 * 창고가 비었으면 알릴 이유가 없다(할 수 있는 일이 없는 경고는 소음이다).
 */
export function idleMainSlots(
  party: readonly HeroInstance[],
  defs: Record<HeroDefId, HeroDef>,
  inventory: Map<GearInstId, GearInstance>,
): Array<{ hero: HeroInstance; slot: GearSlot }> {
  const freeSlots = new Set<GearSlot>();
  for (const g of inventory.values()) {
    const d = GEAR_DEFS[g.defId];
    if (d && !g.equippedBy) freeSlots.add(d.slot);
  }
  const out: Array<{ hero: HeroInstance; slot: GearSlot }> = [];
  for (const hero of party) {
    const def = defs[hero.defId];
    if (!def || hero.isDead) continue;
    const slot = GEAR_AFFINITY.slot[def.lineage];
    if (!hero.gear?.[slot] && freeSlots.has(slot)) out.push({ hero, slot });
  }
  return out;
}
