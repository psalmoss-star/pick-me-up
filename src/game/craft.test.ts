import { describe, expect, it } from 'vitest';
import { canCraft, craft, missingFor, spendMaterials, amountOf } from './craft';
import { RECIPES, RECIPE_BY_GEAR } from './data/recipes';
import { GEAR_DEFS } from './data/gear';
import { MATERIAL, MATERIAL_DEFS, materialWeights } from './data/materials';
import { TOWER_HEIGHT } from './data/floorgen';
import type { GearDefId, MaterialBag } from './types';

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
