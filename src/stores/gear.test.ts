/**
 * 장비 스토어 연결 테스트.
 *
 * 지키려는 것:
 *   1. 소유가 한 곳에서만 바뀐다 — 유령 참조·이중 착용이 없다
 *   2. 사망 시 회수/소실이 인벤토리에 정확히 반영된다 (퍼머데스의 무게)
 *   3. 재화를 쓴 결과는 즉시 저장된다
 *   4. 깨진 세이브가 앱을 죽이지 않는다
 *
 * 보정 계산·회수 확률 자체는 game/gear.test.ts의 몫이라 여기서 다시 보지 않는다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore, gearIndex } from './runStore';
import { loadRun, deserialize, serialize } from './save';
import { GEAR_DEFS } from '../game/data/gear';
import { makeGear } from '../game/gear';
import type { GearDefId, GearInstId, HeroInstId } from '../game/types';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

const store = () => createRunStore(() => 42);
const gd = (s: string) => s as GearDefId;

/** 금을 채워 구매 가능 상태로 */
const rich = (s: ReturnType<typeof store>, gold = 100_000) =>
  s.setState({ wallet: { ...s.getState().wallet, gold } });

const priceOf = (id: string) => GEAR_DEFS[gd(id)].price!;

describe('상점 구매', () => {
  it('금이 빠지고 창고에 들어온다', () => {
    const s = store();
    rich(s, 5000);
    const r = s.getState().buyGear(gd('w_soldier'));

    expect(r.ok).toBe(true);
    expect(s.getState().gear).toHaveLength(1);
    expect(s.getState().wallet.gold).toBe(5000 - priceOf('w_soldier'));
  });

  it('산 장비는 아무도 안 낀 상태다', () => {
    const s = store();
    rich(s);
    s.getState().buyGear(gd('w_soldier'));
    expect(s.getState().gear[0].equippedBy).toBeNull();
  });

  it('금이 부족하면 아무 일도 없다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gold: 0 } });
    expect(s.getState().buyGear(gd('w_soldier')))
      .toEqual({ ok: false, reason: 'not-enough-gold' });
    expect(s.getState().gear).toHaveLength(0);
  });

  /** 금으로 최상급을 살 수 있으면 등반이 아니라 지갑이 강함을 정한다 */
  it('유물은 아무리 돈이 많아도 못 산다', () => {
    const s = store();
    rich(s, 999_999);
    expect(s.getState().buyGear(gd('w_towerbane')))
      .toEqual({ ok: false, reason: 'not-sold' });
  });

  it('같은 종류를 여러 개 사면 id가 겹치지 않는다', () => {
    const s = store();
    rich(s);
    s.getState().buyGear(gd('w_soldier'));
    s.getState().buyGear(gd('w_soldier'));
    const ids = s.getState().gear.map((g) => g.instId);
    expect(new Set(ids).size).toBe(2);
  });

  it('구매는 즉시 저장된다', () => {
    const s = store();
    rich(s, 5000);
    s.getState().buyGear(gd('w_soldier'));
    expect(loadRun()?.gear).toHaveLength(1);
  });
});

describe('착용 / 해제', () => {
  const setup = () => {
    const s = store();
    rich(s);
    s.getState().buyGear(gd('w_soldier'));
    const heroId = s.getState().roster[0].instId;
    const gearId = s.getState().gear[0].instId;
    return { s, heroId, gearId };
  };

  it('착용하면 영웅과 장비 양쪽에 반영된다', () => {
    const { s, heroId, gearId } = setup();
    expect(s.getState().equipGear(heroId, gearId).ok).toBe(true);

    const hero = s.getState().roster.find((h) => h.instId === heroId)!;
    const gear = s.getState().gear.find((g) => g.instId === gearId)!;
    expect(hero.gear?.weapon).toBe(gearId);
    expect(gear.equippedBy).toBe(heroId);
  });

  it('교체하면 이전 장비가 창고로 돌아간다', () => {
    const { s, heroId, gearId } = setup();
    s.getState().equipGear(heroId, gearId);
    s.getState().buyGear(gd('w_chipped'));
    const second = s.getState().gear.find((g) => g.defId === gd('w_chipped'))!.instId;

    const r = s.getState().equipGear(heroId, second);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.unequipped).toBe(gearId);

    expect(s.getState().gear.find((g) => g.instId === gearId)!.equippedBy).toBeNull();
    expect(s.getState().gear.find((g) => g.instId === second)!.equippedBy).toBe(heroId);
  });

  it('한 장비를 두 영웅이 동시에 낄 수 없다', () => {
    const { s, heroId, gearId } = setup();
    s.getState().equipGear(heroId, gearId);
    const other = s.getState().roster[1].instId;

    expect(s.getState().equipGear(other, gearId))
      .toEqual({ ok: false, reason: 'equipped-elsewhere' });
  });

  it('해제하면 양쪽에서 풀린다', () => {
    const { s, heroId, gearId } = setup();
    s.getState().equipGear(heroId, gearId);
    s.getState().unequipGear(heroId, 'weapon');

    expect(s.getState().roster.find((h) => h.instId === heroId)!.gear?.weapon).toBeUndefined();
    expect(s.getState().gear.find((g) => g.instId === gearId)!.equippedBy).toBeNull();
  });

  it('없는 영웅에게 채우려 하면 실패한다', () => {
    const { s, gearId } = setup();
    expect(s.getState().equipGear('ghost#1' as HeroInstId, gearId))
      .toEqual({ ok: false, reason: 'no-hero' });
  });
});

describe('강화', () => {
  const setup = () => {
    const s = store();
    rich(s);
    s.getState().buyGear(gd('w_soldier'));
    return { s, gearId: s.getState().gear[0].instId };
  };

  it('성공하든 실패하든 금은 나간다', () => {
    const { s, gearId } = setup();
    const before = s.getState().wallet.gold;
    const r = s.getState().enhanceGear(gearId);
    expect(r.ok).toBe(true);
    if (r.ok) expect(s.getState().wallet.gold).toBe(before - r.spent);
  });

  /** 강화 실패까지 파괴로 만들면 상실이 흔해져 퍼머데스의 무게가 줄어든다 */
  it('실패해도 장비가 사라지지 않는다', () => {
    const { s, gearId } = setup();
    for (let i = 0; i < 20; i++) s.getState().enhanceGear(gearId);
    expect(s.getState().gear.find((g) => g.instId === gearId)).toBeDefined();
  });

  it('강화해도 착용 상태가 유지된다', () => {
    const { s, gearId } = setup();
    const heroId = s.getState().roster[0].instId;
    s.getState().equipGear(heroId, gearId);
    s.getState().enhanceGear(gearId);
    expect(s.getState().gear.find((g) => g.instId === gearId)!.equippedBy).toBe(heroId);
  });

  it('없는 장비는 강화할 수 없다', () => {
    const s = store();
    expect(s.getState().enhanceGear('ghost#1' as GearInstId))
      .toEqual({ ok: false, reason: 'not-owned' });
  });

  it('강화는 즉시 저장된다 — 금을 되돌릴 수 없다', () => {
    const { s, gearId } = setup();
    const after = s.getState().enhanceGear(gearId);
    if (after.ok) expect(loadRun()?.wallet.gold).toBe(s.getState().wallet.gold);
  });
});

describe('사망 시 회수 — 인벤토리 반영', () => {
  /**
   * 회수율을 극단으로 고정해 결과를 확정시킨다.
   * 확률 자체는 game/gear.test.ts가 검증하므로, 여기서는 "인벤토리에 어떻게 반영되나"만 본다.
   */
  const fightUntilDeath = (s: ReturnType<typeof store>) => {
    // 보스층(6층)은 사망이 잦다
    s.setState({ floorIndex: 5 });
    for (let i = 0; i < 40; i++) {
      s.getState().start();
      const res = s.getState().result;
      if (!res) break;
      const died = res.casualties.length > 0;
      s.getState().finish();
      if (died) return true;
      s.setState({ floorIndex: 5 });
    }
    return false;
  };

  it('죽은 영웅은 장비를 들고 있지 않는다', () => {
    const s = store();
    rich(s);
    // 파티 전원에게 무기를 하나씩
    for (const id of s.getState().party) {
      s.getState().buyGear(gd('w_soldier'));
      const free = s.getState().gear.find((g) => !g.equippedBy)!;
      s.getState().equipGear(id, free.instId);
    }

    expect(fightUntilDeath(s)).toBe(true);

    for (const h of s.getState().roster.filter((x) => x.isDead)) {
      expect(Object.keys(h.gear ?? {})).toHaveLength(0);
    }
  });

  it('회수된 장비는 창고에 남고 아무도 안 낀 상태다', () => {
    const s = store();
    rich(s);
    for (const id of s.getState().party) {
      s.getState().buyGear(gd('a_guard'));
      const free = s.getState().gear.find((g) => !g.equippedBy)!;
      s.getState().equipGear(id, free.instId);
    }
    expect(fightUntilDeath(s)).toBe(true);

    const deadIds = new Set(s.getState().roster.filter((h) => h.isDead).map((h) => h.instId));
    for (const g of s.getState().gear) {
      // 죽은 영웅을 가리키는 장비가 남아 있으면 유령 참조다
      expect(deadIds.has(g.equippedBy as HeroInstId)).toBe(false);
    }
  });

  it('살아남은 영웅의 장비는 그대로 유지된다', () => {
    const s = store();
    rich(s);
    const first = s.getState().party[0];
    s.getState().buyGear(gd('w_soldier'));
    const gearId = s.getState().gear[0].instId;
    s.getState().equipGear(first, gearId);

    // 1층은 거의 안 죽는다
    s.getState().start();
    s.getState().finish();

    const hero = s.getState().roster.find((h) => h.instId === first)!;
    if (!hero.isDead) {
      expect(hero.gear?.weapon).toBe(gearId);
      expect(s.getState().gear.find((g) => g.instId === gearId)!.equippedBy).toBe(first);
    }
  });
});

describe('층 드롭', () => {
  it('여러 번 돌면 장비가 쌓인다', () => {
    const s = store();
    let seen = 0;
    for (let i = 0; i < 30; i++) {
      s.setState({ floorIndex: 0 });
      s.getState().start();
      s.getState().finish();
      if (s.getState().gear.length > seen) seen = s.getState().gear.length;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('드롭된 장비의 id가 서로 겹치지 않는다', () => {
    const s = store();
    for (let i = 0; i < 30; i++) {
      s.setState({ floorIndex: 0 });
      s.getState().start();
      s.getState().finish();
    }
    const ids = s.getState().gear.map((g) => g.instId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /** 저층에서 유물이 나오면 이후 등반이 무의미해진다 */
  it('1층에서는 희귀·유물이 안 나온다', () => {
    const s = store();
    for (let i = 0; i < 40; i++) {
      s.setState({ floorIndex: 0 });
      s.getState().start();
      s.getState().finish();
    }
    for (const g of s.getState().gear) {
      expect(['common', 'fine']).toContain(GEAR_DEFS[g.defId].rank);
    }
  });
});

describe('합성 — 제물의 장비', () => {
  it('제물이 끼고 있던 장비는 창고로 돌아온다', () => {
    const s = store();
    rich(s);
    s.getState().buyGear(gd('w_soldier'));
    const gearId = s.getState().gear[0].instId;

    const target = s.getState().roster[0].instId;
    const sacrifice = s.getState().roster[1].instId;
    s.getState().equipGear(sacrifice, gearId);

    const r = s.getState().fuse(target, sacrifice);
    expect(r.ok).toBe(true);

    // 장비는 남아 있고, 사라진 주인을 가리키지 않는다
    const g = s.getState().gear.find((x) => x.instId === gearId);
    expect(g).toBeDefined();
    expect(g!.equippedBy).toBeNull();
  });
});

describe('저장 / 복원', () => {
  it('장비와 착용 관계가 왕복해도 유지된다', () => {
    const s = store();
    rich(s);
    s.getState().buyGear(gd('w_soldier'));
    const heroId = s.getState().roster[0].instId;
    const gearId = s.getState().gear[0].instId;
    s.getState().equipGear(heroId, gearId);

    const saved = loadRun()!;
    const s2 = store();
    s2.getState().hydrate(saved);

    expect(s2.getState().gear).toHaveLength(1);
    expect(s2.getState().gear[0].equippedBy).toBe(heroId);
    expect(s2.getState().roster.find((h) => h.instId === heroId)!.gear?.weapon).toBe(gearId);
  });

  it('장비가 없던 옛 세이브도 읽힌다', () => {
    const s = store();
    const raw = JSON.parse(serialize(s.getState()));
    delete raw.run.gear;
    delete raw.run.gearSeq;

    const restored = deserialize(JSON.stringify(raw));
    expect(restored).not.toBeNull();
    expect(restored!.gear).toEqual([]);
  });

  /** 도감에서 뺀 장비가 남아 있으면 보정이 조용히 0이 된다 */
  it('정의에 없는 장비는 버린다', () => {
    const s = store();
    const raw = JSON.parse(serialize(s.getState()));
    raw.run.gear = [{ instId: 'x#1', defId: 'w_deleted', enhance: 0, equippedBy: null }];

    const restored = deserialize(JSON.stringify(raw));
    expect(restored!.gear).toHaveLength(0);
  });

  it('강화 단계가 범위를 벗어나면 잘린다', () => {
    const s = store();
    const raw = JSON.parse(serialize(s.getState()));
    raw.run.gear = [{ instId: 'x#1', defId: 'w_soldier', enhance: 999, equippedBy: null }];

    const restored = deserialize(JSON.stringify(raw));
    expect(restored!.gear[0].enhance).toBeLessThanOrEqual(5);
  });

  /** 한쪽만 남으면 보정이 새거나 이중 착용이 생긴다 */
  it('영웅이 없는 장비를 가리키면 착용이 풀린다', () => {
    const s = store();
    const raw = JSON.parse(serialize(s.getState()));
    const heroId = s.getState().roster[0].instId;
    raw.run.roster[0].gear = { weapon: 'ghost#1' };
    raw.run.gear = [];

    const restored = deserialize(JSON.stringify(raw));
    const hero = restored!.roster.find((h) => h.instId === heroId)!;
    expect(hero.gear?.weapon).toBeUndefined();
  });

  it('두 영웅이 같은 장비를 가리키면 하나만 남는다', () => {
    const s = store();
    const raw = JSON.parse(serialize(s.getState()));
    raw.run.gear = [{ instId: 'x#1', defId: 'w_soldier', enhance: 0, equippedBy: null }];
    raw.run.roster[0].gear = { weapon: 'x#1' };
    raw.run.roster[1].gear = { weapon: 'x#1' };

    const restored = deserialize(JSON.stringify(raw));
    const holders = restored!.roster.filter((h) => h.gear?.weapon === 'x#1');
    expect(holders).toHaveLength(1);
  });

  it('죽은 영웅은 장비를 들고 있지 않은 채로 복원된다', () => {
    const s = store();
    const raw = JSON.parse(serialize(s.getState()));
    raw.run.gear = [{ instId: 'x#1', defId: 'w_soldier', enhance: 0, equippedBy: null }];
    raw.run.roster[0].isDead = true;
    raw.run.roster[0].gear = { weapon: 'x#1' };

    const restored = deserialize(JSON.stringify(raw));
    expect(restored!.roster[0].gear?.weapon).toBeUndefined();
    expect(restored!.gear[0].equippedBy).toBeNull();
  });

  it('gearSeq가 없으면 보유 수만큼 잡아 id 충돌을 막는다', () => {
    const s = store();
    const raw = JSON.parse(serialize(s.getState()));
    raw.run.gear = [{ instId: 'x#1', defId: 'w_soldier', enhance: 0, equippedBy: null }];
    delete raw.run.gearSeq;

    const restored = deserialize(JSON.stringify(raw));
    expect(restored!.gearSeq).toBeGreaterThanOrEqual(1);
  });
});

describe('gearIndex', () => {
  it('배열을 id로 조회할 수 있는 Map으로 바꾼다', () => {
    const a = makeGear(gd('w_soldier'), 1);
    const idx = gearIndex([a]);
    expect(idx.get(a.instId)).toEqual(a);
  });
});
