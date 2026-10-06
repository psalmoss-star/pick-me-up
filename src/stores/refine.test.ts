/**
 * 재련 — 스토어 연결.
 *
 * 지키려는 것:
 *   1. 성공하면 그 장비가 다음 단계가 되고 재료·금이 정확히 비용만큼 빠진다
 *   2. 실패하면 아무것도 소모되지 않는다 (제작과 같은 원칙)
 *   3. 착용 중에 재련해도 영웅의 장비 참조가 유효하다
 *   4. 잠금은 도달 최고 층으로 판정한다
 *   5. 재련한 유물은 저장·복원된다. 옛 세이브의 유물은 2단계로 살아 있다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { loadRun } from './save';
import { refineCostOf } from '../game/data/recipes';
import { FLOORS } from '../game/data/floors';
import { GEAR_DEFS, tierFirstFloor } from '../game/data/gear';
import { makeGear } from '../game/gear';
import type { GearDefId, GearInstId, GearInstance, MaterialBag } from '../game/types';

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
const floorIndexOf = (floorId: number) => FLOORS.findIndex((f) => f.id >= floorId);

/** 유물 하나를 창고에 넣고, 다음 단계로 올릴 재료·금·층을 맞춘다 */
function ready(s: ReturnType<typeof store>, defId = 'w_towerbane', over: Partial<GearInstance> = {}) {
  const gear: GearInstance = { ...makeGear(defId as GearDefId, 901), ...over };
  const def = GEAR_DEFS[gear.defId];
  const price = refineCostOf(def.slot, def.tier + 1);
  const extra: MaterialBag = {};
  for (const [id, n] of Object.entries(price.cost) as [keyof MaterialBag, number][]) extra[id] = n + 2;
  s.setState({
    gear: [...s.getState().gear, gear],
    materials: extra,
    wallet: { ...s.getState().wallet, gold: price.gold + 500 },
    maxFloorReached: floorIndexOf(tierFirstFloor(def.tier + 1)),
  });
  return { gear, price };
}

describe('refineGear — 성공', () => {
  it('그 장비가 다음 단계가 되고 재료·금이 비용만큼 빠진다', () => {
    const s = store();
    const { gear, price } = ready(s);
    const count = s.getState().gear.length;
    const goldBefore = s.getState().wallet.gold;

    const r = s.getState().refineGear(gear.instId);
    expect(r.ok).toBe(true);

    const st = s.getState();
    // 새 장비가 생기지 않는다 — 같은 물건이 바뀐다
    expect(st.gear.length).toBe(count);
    expect(st.gear.find((g) => g.instId === gear.instId)!.defId).toBe('w_towerbane_t3');
    expect(st.wallet.gold).toBe(goldBefore - price.gold);
    for (const id of Object.keys(price.cost) as (keyof MaterialBag)[]) {
      expect(st.materials[id]).toBe(2);
    }
  });

  it('착용 중인 유물을 재련해도 영웅이 그대로 끼고 있다', () => {
    const s = store();
    const { gear } = ready(s);
    const hero = s.getState().roster.find((h) => !h.isDead)!;
    expect(s.getState().equipGear(hero.instId, gear.instId).ok).toBe(true);

    expect(s.getState().refineGear(gear.instId).ok).toBe(true);

    const st = s.getState();
    const after = st.gear.find((g) => g.instId === gear.instId)!;
    expect(after.equippedBy).toBe(hero.instId);
    expect(st.roster.find((h) => h.instId === hero.instId)!.gear?.weapon).toBe(gear.instId);
    expect(GEAR_DEFS[after.defId].tier).toBe(3);
  });

  it('강화 수치가 유지된다', () => {
    const s = store();
    const { gear } = ready(s, 'a_ashshroud', { enhance: 4 });
    s.getState().refineGear(gear.instId);
    expect(s.getState().gear.find((g) => g.instId === gear.instId)!.enhance).toBe(4);
  });

  it('두 번 누르면 한 단계씩 — 재료가 남아 있어도 층이 안 열렸으면 두 번째는 잠금이다', () => {
    const s = store();
    const { gear } = ready(s);
    expect(s.getState().refineGear(gear.instId).ok).toBe(true);
    const second = s.getState().refineGear(gear.instId);
    expect(second).toMatchObject({ ok: false, reason: 'locked', unlockFloor: 31 });
    expect(s.getState().gear.find((g) => g.instId === gear.instId)!.defId).toBe('w_towerbane_t3');
  });
});

describe('refineGear — 실패하면 아무것도 소모되지 않는다', () => {
  const snapshot = (s: ReturnType<typeof store>) => JSON.stringify({
    gear: s.getState().gear, materials: s.getState().materials, wallet: s.getState().wallet,
  });

  it('재료 부족', () => {
    const s = store();
    const { gear } = ready(s);
    s.setState({ materials: {} });
    const before = snapshot(s);
    expect(s.getState().refineGear(gear.instId)).toMatchObject({ ok: false, reason: 'not-enough-materials' });
    expect(snapshot(s)).toBe(before);
  });

  it('재료는 충분한데 금만 모자라도 재료가 빠지지 않는다', () => {
    const s = store();
    const { gear } = ready(s);
    s.setState({ wallet: { ...s.getState().wallet, gold: 0 } });
    const before = snapshot(s);
    expect(s.getState().refineGear(gear.instId)).toMatchObject({ ok: false, reason: 'not-enough-gold' });
    expect(snapshot(s)).toBe(before);
  });

  it('층 미도달', () => {
    const s = store();
    const { gear } = ready(s);
    s.setState({ maxFloorReached: floorIndexOf(20) });
    const before = snapshot(s);
    expect(s.getState().refineGear(gear.instId)).toMatchObject({ ok: false, reason: 'locked' });
    expect(snapshot(s)).toBe(before);
  });

  it('없는 장비', () => {
    const s = store();
    expect(s.getState().refineGear('ghost#1' as GearInstId)).toEqual({ ok: false, reason: 'not-owned' });
  });

  it('유물이 아닌 장비', () => {
    const s = store();
    const { gear } = ready(s);
    const plain = { ...makeGear('w_chipped' as GearDefId, 902) };
    s.setState({ gear: [...s.getState().gear, plain] });
    expect(s.getState().refineGear(plain.instId)).toMatchObject({ ok: false, reason: 'not-relic' });
    expect(s.getState().gear.find((g) => g.instId === gear.instId)!.defId).toBe('w_towerbane');
  });
});

describe('refineGear — 잠금은 도달 최고 층으로 판정한다', () => {
  it('저층을 고르고 있어도 이미 연 단계는 열려 있다', () => {
    const s = store();
    const { gear } = ready(s);
    s.getState().selectFloor(0);
    expect(s.getState().floorIndex).toBe(0);
    expect(s.getState().refineGear(gear.instId).ok).toBe(true);
  });
});

describe('저장', () => {
  it('재련한 유물이 다시 켜도 그 단계로 남아 있다', () => {
    const s = store();
    const { gear } = ready(s);
    s.getState().refineGear(gear.instId);

    const saved = loadRun();
    expect(saved).not.toBeNull();
    const restored = saved!.gear.find((g) => g.instId === gear.instId)!;
    expect(restored.defId).toBe('w_towerbane_t3');
  });

  it('옛 세이브의 유물(기존 id)은 2단계 유물로 살아 있다', () => {
    const s = store();
    const { gear } = ready(s);
    // 재련 없이 저장만 — 착용이 저장을 일으킨다
    const hero = s.getState().roster.find((h) => !h.isDead)!;
    expect(s.getState().equipGear(hero.instId, gear.instId).ok).toBe(true);
    const saved = loadRun();
    const kept = saved?.gear.find((g) => g.instId === gear.instId);
    expect(kept?.defId).toBe('w_towerbane');
    expect([GEAR_DEFS[kept!.defId].tier, GEAR_DEFS[kept!.defId].line]).toEqual([2, 'relic']);
  });
});
