import { describe, expect, it } from 'vitest';
import { canCraft, craft, missingFor, spendMaterials, amountOf, canRefine, refine } from './craft';
import { RECIPES, RECIPE_BY_GEAR, REFINE_MATERIALS, refineCostOf } from './data/recipes';
import { GEAR_DEFS, GEAR_SLOTS, RELIC_FIRST_TIER, TIER_COUNT, ladderSet, tierFirstFloor } from './data/gear';
import { bonusOf, makeGear } from './gear';
import { MATERIAL, MATERIAL_DEFS, materialWeights } from './data/materials';
import { TOWER_HEIGHT } from './data/floorgen';
import type { GearDefId, GearInstance, HeroInstId, MaterialBag } from './types';

/** 레시피 비용을 그대로 가진 주머니 — "딱 맞게 있다" 상태 */
const exactly = (gearDefId: GearDefId): MaterialBag => ({ ...RECIPE_BY_GEAR[gearDefId].cost });

const DEEP = TOWER_HEIGHT; // 잠금은 별도 테스트에서만 다룬다
const RICH = 999_999;

describe('레시피 정합성 — 데이터가 코드보다 먼저 틀린다', () => {
  it('모든 레시피의 결과 장비가 도감에 있다', () => {
    for (const r of RECIPES) {
      expect(GEAR_DEFS[r.gearDefId], `${r.gearDefId}가 GEAR_DEFS에 없다`).toBeDefined();
    }
  });

  it('제작 대상은 전부 유물이다 — 상점과 경쟁하면 제작이 항상 진다', () => {
    for (const r of RECIPES) {
      expect(GEAR_DEFS[r.gearDefId].rank).toBe('relic');
    }
  });

  it('유물은 상점에 없다 — 금으로 살 수 있으면 제작 경로가 죽는다', () => {
    for (const r of RECIPES) {
      expect(GEAR_DEFS[r.gearDefId].price).toBeUndefined();
    }
  });

  it('모든 레시피가 실재하는 재료만 요구한다', () => {
    for (const r of RECIPES) {
      for (const id of Object.keys(r.cost) as (keyof MaterialBag)[]) {
        expect(MATERIAL_DEFS[id], `${String(id)}는 없는 재료다`).toBeDefined();
      }
    }
  });

  it('유물 3종(무기·방어구·장신구)이 각각 하나씩 만들어진다', () => {
    const slots = RECIPES.map((r) => GEAR_DEFS[r.gearDefId].slot).sort();
    expect(slots).toEqual(['armor', 'trinket', 'weapon']);
  });
});

describe('비용 — 정수가 문지기다', () => {
  /*
    정수(rare)는 6층 이하에서 가중치가 0이다. 모든 레시피가 정수를 요구해야
    유물이 저층 목표가 되지 않는다. 이게 무너지면 9층부터 relic을 주는
    장비 사다리(gear.ts의 단계)가 통째로 무의미해진다.
  */
  it('모든 레시피가 탑의 정수를 요구한다', () => {
    for (const r of RECIPES) {
      expect(amountOf(r.cost, MATERIAL.essence), `${r.gearDefId}가 정수를 안 쓴다`).toBeGreaterThan(0);
    }
  });

  it('정수는 저층에서 나오지 않는다 — 해금 층이 그보다 얕으면 안 된다', () => {
    for (const r of RECIPES) {
      expect(materialWeights(r.unlockFloor).rare).toBeGreaterThan(0);
    }
  });

  it('재료 없이는 금이 아무리 많아도 못 만든다', () => {
    for (const r of RECIPES) {
      const c = canCraft({ gearDefId: r.gearDefId, have: {}, gold: RICH, highestFloor: DEEP });
      expect(c.ok).toBe(false);
      if (!c.ok) expect(c.reason).toBe('not-enough-materials');
    }
  });
});

describe('canCraft / craft — 판정이 갈라지지 않는다', () => {
  it('딱 맞게 있으면 만들어진다', () => {
    for (const r of RECIPES) {
      const out = craft({
        gearDefId: r.gearDefId, have: exactly(r.gearDefId),
        gold: r.gold, highestFloor: DEEP, seq: 1,
      });
      expect(out.ok, `${r.gearDefId} 제작 실패`).toBe(true);
      if (out.ok) expect(out.gear.defId).toBe(r.gearDefId);
    }
  });

  it('하나라도 모자라면 못 만들고, 부족분이 정확히 그만큼 나온다', () => {
    const r = RECIPES[0];
    const have = exactly(r.gearDefId);
    const id = Object.keys(r.cost)[0] as keyof MaterialBag;
    have[id] = amountOf(r.cost, id) - 1;

    const c = canCraft({ gearDefId: r.gearDefId, have, gold: RICH, highestFloor: DEEP });
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.reason).toBe('not-enough-materials');
      expect(c.missing?.[id]).toBe(1);
    }
  });

  it('금이 1 모자라면 못 만든다', () => {
    const r = RECIPES[0];
    const c = canCraft({
      gearDefId: r.gearDefId, have: exactly(r.gearDefId),
      gold: r.gold - 1, highestFloor: DEEP,
    });
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.reason).toBe('not-enough-gold');
      expect(c.missingGold).toBe(1);
    }
  });

  it('해금 층에 못 닿으면 잠겨 있다', () => {
    const r = RECIPES.find((x) => x.unlockFloor > 1)!;
    const c = canCraft({
      gearDefId: r.gearDefId, have: exactly(r.gearDefId),
      gold: RICH, highestFloor: r.unlockFloor - 1,
    });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('locked');
  });

  it('레시피가 없는 장비는 만들 수 없다 — 상점 장비를 제작으로 우회하지 못한다', () => {
    const c = canCraft({
      gearDefId: 'w_chipped' as GearDefId, have: {}, gold: RICH, highestFloor: DEEP,
    });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('no-recipe');
  });

  it('canCraft가 통과시킨 것은 craft도 통과시킨다', () => {
    for (const r of RECIPES) {
      const args = {
        gearDefId: r.gearDefId, have: exactly(r.gearDefId),
        gold: r.gold, highestFloor: DEEP,
      };
      expect(craft({ ...args, seq: 1 }).ok).toBe(canCraft(args).ok);
    }
  });
});

describe('제작에는 확률이 없다 — 열 층의 성과가 난수 하나로 사라지면 안 된다', () => {
  it('같은 입력이면 항상 같은 결과다', () => {
    const r = RECIPES[0];
    const args = {
      gearDefId: r.gearDefId, have: exactly(r.gearDefId),
      gold: r.gold, highestFloor: DEEP, seq: 7,
    };
    const first = craft(args);
    for (let i = 0; i < 50; i++) {
      expect(craft(args)).toEqual(first);
    }
  });
});

describe('spendMaterials — 주머니는 가진 것만 담는다', () => {
  it('비용만큼 정확히 빠진다', () => {
    const have: MaterialBag = { [MATERIAL.ore]: 10, [MATERIAL.hide]: 5 };
    const left = spendMaterials(have, { [MATERIAL.ore]: 4 });
    expect(left[MATERIAL.ore]).toBe(6);
    expect(left[MATERIAL.hide]).toBe(5);
  });

  it('0이 된 종류는 키째 사라진다 — 화면에 "무쇠 조각 0"이 남으면 안 된다', () => {
    const left = spendMaterials({ [MATERIAL.ore]: 3 }, { [MATERIAL.ore]: 3 });
    expect(MATERIAL.ore in left).toBe(false);
  });

  it('원본을 바꾸지 않는다', () => {
    const have: MaterialBag = { [MATERIAL.ore]: 10 };
    spendMaterials(have, { [MATERIAL.ore]: 4 });
    expect(have[MATERIAL.ore]).toBe(10);
  });

  it('제작 뒤 남은 재료 = 가진 것 - 레시피 비용', () => {
    const r = RECIPES[0];
    const have: MaterialBag = {};
    for (const [id, n] of Object.entries(r.cost) as [keyof MaterialBag, number][]) {
      have[id] = n + 3;
    }
    const out = craft({ gearDefId: r.gearDefId, have, gold: r.gold, highestFloor: DEEP, seq: 1 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const left = spendMaterials(have, out.spentMaterials);
    for (const id of Object.keys(r.cost) as (keyof MaterialBag)[]) {
      expect(left[id]).toBe(3);
    }
  });
});

describe('missingFor', () => {
  it('빈손이면 비용 전체가 부족분이다', () => {
    const r = RECIPES[0];
    expect(missingFor(r, {})).toEqual(r.cost);
  });

  it('넉넉하면 부족분이 없다', () => {
    const r = RECIPES[0];
    const have: MaterialBag = {};
    for (const [id, n] of Object.entries(r.cost) as [keyof MaterialBag, number][]) have[id] = n * 2;
    expect(missingFor(r, have)).toEqual({});
  });
});

/**
 * 재련(2026-10-06) — 같은 유물의 단계를 하나 올린다. 제작과 같은 원칙이다:
 * 확률이 없고, 조건이 안 되면 아무것도 바뀌지 않는다.
 */
describe('재련', () => {
  const relic = (id: string, over: Partial<GearInstance> = {}): GearInstance =>
    ({ ...makeGear(id as GearDefId, 7), ...over });
  /** 그 유물을 다음 단계로 올릴 재료를 딱 맞게 */
  const exact = (g: GearInstance) => {
    const d = GEAR_DEFS[g.defId];
    return refineCostOf(d.slot, d.tier + 1);
  };

  it('비용 데이터 — 슬롯마다 실재하는 재료만, 금은 단계가 오를수록 비싸다', () => {
    for (const slot of GEAR_SLOTS) {
      for (const id of Object.keys(REFINE_MATERIALS[slot]) as (keyof MaterialBag)[]) {
        expect(MATERIAL_DEFS[id], `${String(id)}는 없는 재료다`).toBeDefined();
      }
      for (let t = RELIC_FIRST_TIER + 2; t <= TIER_COUNT; t++) {
        expect(refineCostOf(slot, t).gold, `${slot} ${t}단계`).toBeGreaterThan(refineCostOf(slot, t - 1).gold);
      }
    }
  });

  it('성공 — defId만 다음 단계로 바뀌고 instId·강화·착용자는 그대로다', () => {
    const g = relic('w_towerbane', { enhance: 3, equippedBy: 'h#1' as HeroInstId });
    const c = exact(g);
    const r = refine({ gear: g, have: c.cost, gold: c.gold, highestFloor: tierFirstFloor(3) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gear).toEqual({ ...g, defId: 'w_towerbane_t3' });
    expect(r.spentMaterials).toEqual(c.cost);
    expect(r.spentGold).toBe(c.gold);
    // 원본을 바꾸지 않는다
    expect(g.defId).toBe('w_towerbane');
  });

  it('강화 +5 유물 — 재련 뒤 보정은 새 단계 base × 강화 배수다', () => {
    const g = relic('a_ashshroud', { enhance: 5 });
    const c = exact(g);
    const r = refine({ gear: g, have: c.cost, gold: c.gold, highestFloor: 100 });
    if (!r.ok) throw new Error(r.reason);
    const fresh = { ...makeGear('a_ashshroud_t3' as GearDefId, 1), enhance: 5 };
    expect(bonusOf(r.gear)).toEqual(bonusOf(fresh));
    expect(bonusOf(r.gear).hp!).toBeGreaterThan(bonusOf(g).hp!);
  });

  it('한 번에 한 단계 — 100층에 닿아 있어도 2단계는 3단계가 된다', () => {
    const g = relic('t_lastlight');
    const c = exact(g);
    const r = refine({ gear: g, have: { ...c.cost, [MATERIAL.essence]: 99 }, gold: RICH, highestFloor: 100 });
    if (!r.ok) throw new Error(r.reason);
    expect(GEAR_DEFS[r.gear.defId].tier).toBe(3);
  });

  it('잠금 — 다음 단계의 첫 층에 닿아야 한다. 경계 층에서 갈린다', () => {
    const g = relic('w_towerbane');
    const c = exact(g);
    const before = canRefine({ gear: g, have: c.cost, gold: c.gold, highestFloor: tierFirstFloor(3) - 1 });
    expect(before).toMatchObject({ ok: false, reason: 'locked', unlockFloor: 21 });
    expect(canRefine({ gear: g, have: c.cost, gold: c.gold, highestFloor: tierFirstFloor(3) }).ok).toBe(true);
  });

  it('잠금이 재료 부족보다 먼저다 — 못 여는 단계의 부족분을 띄우지 않는다', () => {
    const r = canRefine({ gear: relic('w_towerbane'), have: {}, gold: 0, highestFloor: 20 });
    expect(r).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('재료 부족 — 모자란 것만 돌려준다', () => {
    const g = relic('a_ashshroud');
    const c = exact(g);
    const [firstId] = Object.keys(c.cost) as (keyof MaterialBag)[];
    const have = { ...c.cost, [firstId]: c.cost[firstId]! - 1 };
    const r = canRefine({ gear: g, have, gold: RICH, highestFloor: 100 });
    expect(r).toMatchObject({ ok: false, reason: 'not-enough-materials', missing: { [firstId]: 1 } });
  });

  it('금 부족 — 재료가 차 있으면 모자란 금을 돌려준다', () => {
    const g = relic('w_towerbane');
    const c = exact(g);
    const r = canRefine({ gear: g, have: c.cost, gold: c.gold - 1, highestFloor: 100 });
    expect(r).toMatchObject({ ok: false, reason: 'not-enough-gold', missingGold: 1 });
  });

  it('유물이 아니면 재련할 수 없다 — 정예도 안 된다', () => {
    for (const id of ['w_chipped', 'w_emberfang', 'g_t5_elite_weapon']) {
      const r = canRefine({ gear: relic(id), have: {}, gold: RICH, highestFloor: 100 });
      expect(r, id).toMatchObject({ ok: false, reason: 'not-relic' });
    }
  });

  it('10단계는 더 올릴 수 없다', () => {
    const r = canRefine({ gear: relic('w_towerbane_t10'), have: {}, gold: RICH, highestFloor: 100 });
    expect(r).toMatchObject({ ok: false, reason: 'max-tier' });
  });

  it('2단계에서 10단계까지 여덟 번 재련하면 10단계 유물과 같다', () => {
    let g = relic('t_lastlight', { enhance: 2 });
    for (let i = 0; i < 8; i++) {
      const c = exact(g);
      const r = refine({ gear: g, have: c.cost, gold: c.gold, highestFloor: 100 });
      if (!r.ok) throw new Error(`${i}번째: ${r.reason}`);
      g = r.gear;
    }
    expect(g.defId).toBe('t_lastlight_t10');
    expect(g.enhance).toBe(2);
    expect(GEAR_DEFS[g.defId]).toBe(ladderSet(10, 'relic').find((d) => d.slot === 'trinket'));
  });

  it('재련·제작은 난수를 받지 않는다 — 인자가 하나뿐이다', () => {
    expect(refine.length).toBe(1);
    expect(canRefine.length).toBe(1);
    expect(craft.length).toBe(1);
  });
});
