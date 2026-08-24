/**
 * 제작 — 스토어 연결.
 *
 * 지키려는 것:
 *   1. 성공하면 장비가 생기고 재료·금이 **정확히 비용만큼** 빠진다
 *   2. **실패하면 아무것도 소모되지 않는다** — 부분 차감이 남으면
 *      재료만 잃고 장비는 없는 상태가 되고, 되돌릴 방법이 게임 안에 없다
 *   3. 해금 판정은 **도달 최고 층**이다 — 저층으로 내려가도 레시피가 닫히지 않는다
 *   4. 재료는 음수가 되지 않는다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { loadRun } from './save';
import { RECIPES } from '../game/data/recipes';
import { FLOORS } from '../game/data/floors';
import { GEAR_DEFS } from '../game/data/gear';
import type { MaterialBag } from '../game/types';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

const store = (seed = 42) => createRunStore(() => seed);

/** 해당 레시피를 만들 수 있는 상태로 만든다 */
function ready(s: ReturnType<typeof store>, recipe = RECIPES[0], extraMaterial = 0) {
  const have: MaterialBag = {};
  for (const [id, n] of Object.entries(recipe.cost) as [keyof MaterialBag, number][]) {
    have[id] = n + extraMaterial;
  }
  const floorIndex = FLOORS.findIndex((f) => f.id >= recipe.unlockFloor);
  s.setState({
    materials: have,
    wallet: { ...s.getState().wallet, gold: recipe.gold + 500 },
    maxFloorReached: floorIndex,
  });
}

describe('craftGear — 성공', () => {
  it('장비가 생기고 재료·금이 비용만큼 빠진다', () => {
    const s = store();
    const recipe = RECIPES[0];
    ready(s, recipe, 3);

    const goldBefore = s.getState().wallet.gold;
    const gearBefore = s.getState().gear.length;

    const r = s.getState().craftGear(recipe.gearDefId);
    expect(r.ok).toBe(true);

    const st = s.getState();
    expect(st.gear.length).toBe(gearBefore + 1);
    expect(st.gear.at(-1)!.defId).toBe(recipe.gearDefId);
    expect(st.wallet.gold).toBe(goldBefore - recipe.gold);

    // 여분 3만 남아야 한다
    for (const id of Object.keys(recipe.cost) as (keyof MaterialBag)[]) {
      expect(st.materials[id]).toBe(3);
    }
  });

  it('만들어진 장비는 아무도 안 끼고 있다 — 창고로 들어간다', () => {
    const s = store();
    ready(s);
    s.getState().craftGear(RECIPES[0].gearDefId);
    expect(s.getState().gear.at(-1)!.equippedBy).toBeNull();
  });

  it('강화 단계 0으로 시작한다 — 제작이 강화를 건너뛰지 않는다', () => {
    const s = store();
    ready(s);
    s.getState().craftGear(RECIPES[0].gearDefId);
    expect(s.getState().gear.at(-1)!.enhance).toBe(0);
  });

  it('두 번 만들면 서로 다른 개체가 된다', () => {
    const s = store();
    ready(s, RECIPES[0], RECIPES[0].cost[Object.keys(RECIPES[0].cost)[0] as keyof MaterialBag]!);
    // 재료를 두 배로 채운다
    const doubled: MaterialBag = {};
    for (const [id, n] of Object.entries(RECIPES[0].cost) as [keyof MaterialBag, number][]) {
      doubled[id] = n * 2;
    }
    s.setState({ materials: doubled, wallet: { ...s.getState().wallet, gold: RECIPES[0].gold * 2 } });

    s.getState().craftGear(RECIPES[0].gearDefId);
    s.getState().craftGear(RECIPES[0].gearDefId);

    const made = s.getState().gear.slice(-2);
    expect(made[0].instId).not.toBe(made[1].instId);
  });
});

describe('craftGear — 실패하면 아무것도 소모되지 않는다', () => {
  /*
    이게 이 파일에서 가장 중요한 절이다. 부분 차감이 남으면
    "재료만 잃고 장비는 없는" 상태가 되는데, 게임 안에 되돌릴 방법이 없다.
  */
  const untouched = (fn: (s: ReturnType<typeof store>) => void) => {
    const s = store();
    ready(s);
    fn(s);

    const before = {
      materials: { ...s.getState().materials },
      gold: s.getState().wallet.gold,
      gear: s.getState().gear.length,
    };
    const r = s.getState().craftGear(RECIPES[0].gearDefId);
    expect(r.ok).toBe(false);

    const st = s.getState();
    expect(st.materials).toEqual(before.materials);
    expect(st.wallet.gold).toBe(before.gold);
    expect(st.gear.length).toBe(before.gear);
  };

  it('재료가 하나 모자랄 때', () => {
    untouched((s) => {
      const id = Object.keys(RECIPES[0].cost)[0] as keyof MaterialBag;
      s.setState({ materials: { ...s.getState().materials, [id]: RECIPES[0].cost[id]! - 1 } });
    });
  });

  it('금이 모자랄 때', () => {
    untouched((s) => {
      s.setState({ wallet: { ...s.getState().wallet, gold: RECIPES[0].gold - 1 } });
    });
  });

  it('해금 층에 못 닿았을 때', () => {
    untouched((s) => {
      s.setState({ maxFloorReached: 0 });
    });
  });

  it('레시피가 없는 장비를 요청했을 때', () => {
    const s = store();
    ready(s);
    const before = { ...s.getState().materials };
    const r = s.getState().craftGear('w_chipped' as never);
    expect(r.ok).toBe(false);
    expect(s.getState().materials).toEqual(before);
  });
});

describe('craftGear — 재료는 음수가 되지 않는다', () => {
  it('빈손으로 모든 레시피를 눌러도 주머니가 그대로다', () => {
    const s = store();
    s.setState({ materials: {}, wallet: { ...s.getState().wallet, gold: 999_999 }, maxFloorReached: FLOORS.length - 1 });

    for (const r of RECIPES) s.getState().craftGear(r.gearDefId);

    expect(s.getState().materials).toEqual({});
    for (const n of Object.values(s.getState().materials)) {
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('craftGear — 해금은 도달 최고 층으로 판정한다', () => {
  it('저층을 고르고 있어도 이미 연 레시피는 열려 있다', () => {
    const s = store();
    const recipe = RECIPES[0];
    ready(s, recipe);
    // 도달은 깊게, 지금 보고 있는 층은 1층
    s.setState({
      maxFloorReached: FLOORS.length - 1,
      floorIndex: 0,
    });

    expect(s.getState().craftGear(recipe.gearDefId).ok).toBe(true);
  });
});

describe('저장 — 만든 유물이 다시 켜도 남아 있다', () => {
  it('제작한 장비와 남은 재료가 복원된다', () => {
    const s = store();
    const recipe = RECIPES[0];
    ready(s, recipe, 2);
    s.getState().craftGear(recipe.gearDefId);

    const made = s.getState().gear.at(-1)!;
    const leftover = { ...s.getState().materials };

    // 같은 저장소를 보는 새 스토어 — 실제 재시작과 같은 경로다
    const restored = createRunStore(() => 42);
    const saved = loadRun();
    expect(saved).not.toBeNull();
    restored.getState().hydrate(saved!);

    expect(restored.getState().gear.some((g) => g.instId === made.instId)).toBe(true);
    expect(restored.getState().materials).toEqual(leftover);
  });
});

describe('제작으로만 닿는 장비 — 상점 우회가 아니다', () => {
  it('제작 대상 유물은 상점 목록에 없다', () => {
    for (const r of RECIPES) {
      expect(GEAR_DEFS[r.gearDefId].price).toBeUndefined();
    }
  });
});
