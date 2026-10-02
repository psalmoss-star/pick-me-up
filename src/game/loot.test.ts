/**
 * 재료 드롭 — 순수 판정.
 *
 * 지키려는 것:
 *   1. 같은 시드면 결과가 완전히 같다 (밸런싱의 전제)
 *   2. 층 깊이로 등급이 잠긴다 — 저층에서 상위 재료가 나오면 등반이 무의미해진다
 *   3. 보스는 확정
 */
import { describe, it, expect } from 'vitest';
import { rollMaterials, mergeMaterials, isEmptyBag, rollFloorLoot } from './loot';
import { createRng } from './rng';
import { MATERIAL, MATERIAL_DEFS, MATERIAL_DROP_AMOUNT } from './data/materials';
import { GEAR_DEFS, tierOf } from './data/gear';
import type { MaterialBag } from './types';

const bagTotal = (b: MaterialBag) =>
  Object.values(b).reduce<number>((s, n) => s + (n ?? 0), 0);

describe('재료 드롭', () => {
  it('같은 시드면 완전히 같은 결과', () => {
    for (const floorId of [1, 7, 15, 40]) {
      const a = rollMaterials(floorId, false, createRng(1234));
      const b = rollMaterials(floorId, false, createRng(1234));
      expect(a).toEqual(b);
    }
  });

  it('보스 층은 반드시 무언가 떨어진다', () => {
    for (let seed = 1; seed <= 60; seed++) {
      expect(isEmptyBag(rollMaterials(6, true, createRng(seed)))).toBe(false);
    }
  });

  it('일반 층은 빈손일 때가 있다 — 나온 층이 반가우려면 안 나오는 층이 있어야 한다', () => {
    let empty = 0;
    for (let seed = 1; seed <= 200; seed++) {
      if (isEmptyBag(rollMaterials(5, false, createRng(seed)))) empty++;
    }
    expect(empty).toBeGreaterThan(0);
    expect(empty).toBeLessThan(200);
  });

  /**
   * 깊이 잠금. `data/gear.ts`의 장비 단계(`tierOf`)와 같은 이유다 —
   * 저층에서 상위 재료가 나오면 이후 등반이 무의미해진다.
   */
  it('저층(1~6)에서는 정수(rare)가 나오지 않는다', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const bag = rollMaterials(3, false, createRng(seed));
      expect(bag[MATERIAL.essence] ?? 0).toBe(0);
    }
  });

  it('깊이 갈수록 상위 재료가 실제로 나온다', () => {
    let deepRare = 0;
    for (let seed = 1; seed <= 400; seed++) {
      if ((rollMaterials(40, false, createRng(seed))[MATERIAL.essence] ?? 0) > 0) deepRare++;
    }
    expect(deepRare).toBeGreaterThan(0);
  });

  it('수량이 정해진 범위 안이다', () => {
    const [lo, hi] = MATERIAL_DROP_AMOUNT;
    for (let seed = 1; seed <= 300; seed++) {
      const bag = rollMaterials(20, false, createRng(seed));
      if (isEmptyBag(bag)) continue;
      const n = bagTotal(bag);
      expect(n).toBeGreaterThanOrEqual(lo);
      expect(n).toBeLessThanOrEqual(hi);
    }
  });

  it('정의에 있는 재료만 나온다', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const id of Object.keys(rollMaterials(30, false, createRng(seed)))) {
        expect(MATERIAL_DEFS[id as keyof typeof MATERIAL_DEFS]).toBeTruthy();
      }
    }
  });
});

describe('재료 주머니', () => {
  it('합치면 수량이 더해진다', () => {
    const a = { [MATERIAL.ore]: 2, [MATERIAL.hide]: 1 };
    const b = { [MATERIAL.ore]: 3 };
    expect(mergeMaterials(a, b)).toEqual({ [MATERIAL.ore]: 5, [MATERIAL.hide]: 1 });
  });

  it('합쳐도 원본이 바뀌지 않는다', () => {
    const a = { [MATERIAL.ore]: 2 };
    mergeMaterials(a, { [MATERIAL.ore]: 3 });
    expect(a).toEqual({ [MATERIAL.ore]: 2 });
  });

  it('빈 주머니 판정', () => {
    expect(isEmptyBag({})).toBe(true);
    expect(isEmptyBag({ [MATERIAL.ore]: 0 })).toBe(true);
    expect(isEmptyBag({ [MATERIAL.ore]: 1 })).toBe(false);
  });
});

/**
 * 재료 지문 — 장비 사다리(STEP 66)가 장비 판정의 난수 소비를 바꾸면 재료가 통째로 바뀐다.
 * 장비의 **종류**는 의도대로 바뀌므로 넣지 않고, 드롭 **유무**와 재료만 넣는다.
 */
function materialsFingerprint(): string {
  let h = 2166136261;
  for (let seed = 1; seed <= 60; seed++) {
    for (const floorId of [1, 3, 6, 9, 12, 20, 30, 55, 90, 100]) {
      const isBoss = floorId === 6 || floorId === 12 || floorId === 20 || (floorId > 20 && floorId % 10 === 0);
      const r = rollFloorLoot({ seed, floorId, isBoss, battleCount: seed % 7, casualties: [], cleared: true });
      const s = JSON.stringify(r.materials) + (r.gearDefId ? 'G' : '-');
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
  }
  return (h >>> 0).toString(16);
}

/** 사다리 도입 전(2026-10-02, 8b32462 기준 드롭 코드)에서 뜬 값. 깨지면 갱신하지 말고 난수 소비를 의심할 것 */
const EXPECTED_MATERIALS = '4bf1febb';

describe('장비 사다리 — 재료 드롭 불변', () => {
  it('재료와 장비 드롭 유무가 사다리 도입 전과 같다', () => {
    expect(materialsFingerprint()).toBe(EXPECTED_MATERIALS);
  });
});

describe('장비 사다리 — 층 드롭', () => {
  const drop = (floorId: number, isBoss: boolean) => {
    for (let seed = 1; seed < 400; seed++) {
      const r = rollFloorLoot({ seed, floorId, isBoss, battleCount: 0, casualties: [], cleared: true });
      if (r.gearDefId) return GEAR_DEFS[r.gearDefId];
    }
    throw new Error('드롭이 안 나왔다');
  };

  it('일반 층은 그 층 단계의 보급형', () => {
    for (const f of [1, 9, 15, 33, 77, 99]) {
      const d = drop(f, false);
      expect([d.tier, d.line], `${f}층`).toEqual([tierOf(f), 'supply']);
    }
  });

  it('보스 층은 그 층 단계의 정예(확정)', () => {
    for (const f of [6, 12, 20, 30, 100]) {
      const r = rollFloorLoot({ seed: 3, floorId: f, isBoss: true, battleCount: 0, casualties: [], cleared: true });
      expect(r.gearDefId, `${f}층`).not.toBeNull();
      const d = GEAR_DEFS[r.gearDefId!];
      expect([d.tier, d.line], `${f}층`).toEqual([tierOf(f), 'elite']);
    }
  });

  it('일반 드롭에서 유물은 나오지 않는다', () => {
    for (let seed = 1; seed < 300; seed++) {
      for (const f of [10, 50, 100]) {
        const r = rollFloorLoot({ seed, floorId: f, isBoss: f === 50, battleCount: 1, casualties: [], cleared: true });
        if (r.gearDefId) expect(GEAR_DEFS[r.gearDefId].line).not.toBe('relic');
      }
    }
  });
});
