/**
 * 책략·군령 — 스토어 규칙. 순수 판정은 `game/stratagem.test.ts`, 문장은 `game/chronicle.test.ts`.
 * 여기는 **장착·저장·배선·내성·연대기**만 본다.
 *
 * 가장 중요한 것은 준비(`prep.test.ts`)와 같다 — 후퇴 신호로 재시뮬레이션해도
 * 책략이 살아남는가. `start()`와 `intervene()`이 같은 입력을 만들지 않으면 그 순간 증발한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { serialize, deserialize } from './save';
import { STRATAGEM_SLOTS } from '../game/data/stratagems';
import { defaultLoadout } from '../game/stratagem';

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

describe('장착', () => {
  it('새 런은 처음부터 쓸 수 있는 카드로 슬롯이 차 있다', () => {
    expect(store().getState().stratagemLoadout).toEqual(defaultLoadout());
    expect(defaultLoadout()).toHaveLength(STRATAGEM_SLOTS);
  });
  it('잠긴 카드는 꽂을 수 없다', () => {
    const s = store();
    expect(s.getState().setStratagemSlot(0, 'redCliffs')).toBe(false);
    expect(s.getState().stratagemLoadout).toEqual(defaultLoadout());
  });
  it('층을 깨 해금되면 꽂을 수 있다', () => {
    const s = store();
    s.setState({ maxFloorReached: 20 });
    expect(s.getState().setStratagemSlot(0, 'redCliffs')).toBe(true);
    expect(s.getState().stratagemLoadout[0]).toBe('redCliffs');
  });
  it('이미 다른 슬롯에 있는 카드를 꽂으면 자리를 바꾼다 — 같은 카드 두 장은 없다', () => {
    const s = store();
    const [a, b] = s.getState().stratagemLoadout;
    s.getState().setStratagemSlot(0, b);
    expect(s.getState().stratagemLoadout).toEqual([b, a]);
  });
  it('비울 수 있고, 범위 밖 슬롯은 거부', () => {
    const s = store();
    expect(s.getState().setStratagemSlot(STRATAGEM_SLOTS, 'ambush')).toBe(false);
    s.getState().setStratagemSlot(0, null);
    s.getState().setStratagemSlot(0, null);
    expect(s.getState().stratagemLoadout).toEqual([]);
  });
  it('전투 중에는 바꿀 수 없다', () => {
    const s = store();
    s.getState().start();
    expect(s.getState().setStratagemSlot(0, null)).toBe(false);
    expect(s.getState().setFallback('hp30')).toBe(false);
  });
});

describe('저장', () => {
  it('장착·내성·군령이 세이브를 왕복한다', () => {
    const s = store();
    s.setState({ maxFloorReached: 10, stratagemResist: { ambush: 2 } });
    s.getState().setStratagemSlot(0, 'flood');
    s.getState().setFallback('hp30');
    const back = deserialize(serialize(s.getState()))!;
    expect(back.stratagemLoadout).toEqual(s.getState().stratagemLoadout);
    expect(back.stratagemResist).toEqual({ ambush: 2 });
    expect(back.fallback).toBe('hp30');
  });
  it('옛 세이브(필드 없음)는 기본값으로 읽힌다', () => {
    const raw = JSON.parse(serialize(store().getState()));
    delete raw.run.stratagemLoadout;
    delete raw.run.stratagemResist;
    delete raw.run.fallback;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.stratagemLoadout).toEqual(defaultLoadout());
    expect(back.stratagemResist).toEqual({});
    expect(back.fallback).toBe('none');
  });
  it('손댄 세이브 — 잠긴 카드·모르는 값은 버린다', () => {
    const raw = JSON.parse(serialize(store().getState()));
    raw.run.stratagemLoadout = ['redCliffs', 'nope', 'ambush', 'ambush'];
    raw.run.stratagemResist = { ambush: 99, nope: 1, flood: -3 };
    raw.run.fallback = 'hp99';
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.stratagemLoadout).toEqual(['ambush']);
    expect(back.stratagemResist).toEqual({ ambush: 3 });
    expect(back.fallback).toBe('none');
  });
});

/** 책략이 발동하는 전투를 찾는다 — 시드를 바꿔 가며 */
function battleWithStratagem() {
  for (let seed = 1; seed <= 60; seed++) {
    const s = store(seed);
    s.setState({ maxFloorReached: 10, floorIndex: 8 });
    s.getState().start();
    const r = s.getState().result!;
    if (r.events.some((e) => e.type === 'stratagem')) return s;
  }
  throw new Error('60시드 안에 책략이 한 번도 발동하지 않았다');
}

describe('배선', () => {
  it('출정하면 장착한 책략이 전투에 들어간다', () => {
    const s = battleWithStratagem();
    const ids = s.getState().result!.events
      .filter((e) => e.type === 'stratagem').map((e) => e.stratagemId);
    for (const id of ids) expect(s.getState().stratagemLoadout).toContain(id);
  });
  it('후퇴 신호로 다시 돌려도 책략이 살아남는다 (start와 intervene이 같은 입력)', () => {
    const s = battleWithStratagem();
    const r = s.getState().result!;
    const first = r.events.find((e) => e.type === 'stratagem')!;
    // 책략이 나온 턴보다 뒤에 신호를 넣으면, 그 앞의 전투는 한 비트도 달라지면 안 된다
    const hero = r.roster.find((u) => u.side === 'ally')!;
    s.getState().intervene([{ turn: first.turn + 1, kind: 'withdraw', targetId: hero.sourceId }]);
    const again = s.getState().result!.events.find((e) => e.type === 'stratagem')!;
    expect(again).toEqual(first);
  });
  it('군령이 전투에 들어간다 — HP 50%면 이탈이 나온다', () => {
    let seen = false;
    for (let seed = 1; seed <= 40 && !seen; seed++) {
      const s = store(seed);
      s.setState({ maxFloorReached: 10, floorIndex: 9 });
      s.getState().setFallback('hp50');
      s.getState().start();
      seen = s.getState().result!.withdrawn.length > 0;
    }
    expect(seen).toBe(true);
  });
});

describe('전투 뒤', () => {
  it('발동한 책략은 내성이 오르고, 수행자 연대기에 남는다', () => {
    const s = battleWithStratagem();
    const r = s.getState().result!;
    const ev = r.events.filter((e) => e.type === 'stratagem');
    const actor = r.roster.find((u) => u.uid === ev[0].actorUid)!.sourceId;
    s.getState().finish();
    for (const e of ev) expect(s.getState().stratagemResist[e.stratagemId as 'ambush']).toBe(1);
    const h = s.getState().roster.find((x) => x.instId === actor)!;
    expect(h.deeds?.[0]).toMatchObject({ floor: 9, stratagemId: ev[0].stratagemId, success: ev[0].success });
  });
  it('연대기는 세이브를 왕복한다', () => {
    const s = battleWithStratagem();
    s.getState().finish();
    const back = deserialize(serialize(s.getState()))!;
    const withDeeds = s.getState().roster.filter((h) => h.deeds);
    expect(withDeeds.length).toBeGreaterThan(0);
    for (const h of withDeeds) {
      expect(back.roster.find((x) => x.instId === h.instId)!.deeds).toEqual(h.deeds);
    }
  });
});

describe('무덤', () => {
  it('쓰러진 영웅의 연대기가 무덤 기록을 왕복한다 — 모르는 책략은 버린다', async () => {
    const { serializeLegacy, deserializeLegacy, emptyLegacy } = await import('./legacy');
    const l = emptyLegacy();
    const fallen = {
      name: '세인', title: '', star: 3 as const, defId: 'h_ashen' as never, floorId: 9,
      revealProgress: 0.2, runNo: 1,
      deeds: [
        { floor: 7, stratagemId: 'lureFire' as const, success: true },
        { floor: 9, stratagemId: 'nope' as never, success: false },
      ],
    };
    const back = deserializeLegacy(serializeLegacy({ ...l, fallen: [fallen] }));
    expect(back.fallen[0].deeds).toEqual([{ floor: 7, stratagemId: 'lureFire', success: true }]);
  });
});

describe('층 맵 경로', () => {
  it('경로를 고르면 그 접점 지형이 전투에 들어간다 — 같은 시드, 다른 경로, 다른 판정', async () => {
    const { floorMapOf, contactTerrain, terrainModifier } = await import('../game/floormap');
    const { floorAt } = await import('../game/data');
    // 두 경로의 매복 보정이 실제로 다른 층을 고른다 — 둘 다 중립이면 판정이 같은 게 정상이다
    let floorIndex = -1;
    for (let i = 5; i < 20 && floorIndex < 0; i++) {
      const m = floorMapOf(floorAt(i));
      if (terrainModifier(contactTerrain(m, 0), 'ambush') !== terrainModifier(contactTerrain(m, 1), 'ambush')) floorIndex = i;
    }
    expect(floorIndex).toBeGreaterThanOrEqual(0);
    let differed = false;
    for (let seed = 1; seed <= 60 && !differed; seed++) {
      const runs = [0, 1].map((route) => {
        const s = store(seed);
        s.setState({ maxFloorReached: 20, floorIndex, stratagemLoadout: ['ambush'] });
        expect(s.getState().setRoute(route)).toBe(true);
        s.getState().start();
        return s.getState().result!.events.filter((e) => e.type === 'stratagem').map((e) => e.success);
      });
      differed = JSON.stringify(runs[0]) !== JSON.stringify(runs[1]);
    }
    expect(differed).toBe(true);
  });
  it('맵 밖 경로·전투 중은 거부, 층을 바꾸거나 전투가 끝나면 0으로 돌아간다', () => {
    const s = store();
    expect(s.getState().setRoute(9)).toBe(false);
    s.getState().setRoute(1);
    s.getState().selectFloor(0);
    expect(s.getState().route).toBe(0);
    s.getState().setRoute(1);
    s.getState().start();
    expect(s.getState().setRoute(0)).toBe(false);
    s.getState().finish();
    expect(s.getState().route).toBe(0);
  });
  it('경로는 저장하지 않는다', () => {
    const s = store();
    s.getState().setRoute(1);
    expect(JSON.parse(serialize(s.getState())).run.route).toBeUndefined();
  });
});
