/**
 * 저장/불러오기 테스트.
 *
 * 여기서 지키려는 것:
 *   1. 퍼머데스가 저장을 견딘다 — 죽은 영웅이 새로고침으로 살아나지 않는다
 *   2. 개체 정체성(seed)과 발굴 진행도가 왕복해도 그대로다
 *   3. 깨진 세이브가 앱을 죽이지 않는다
 *
 * 순수 함수(serialize/deserialize)와 저장소(localStorage)를 나눠 검증한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SAVE_VERSION, serialize, deserialize, saveRun, loadRun, clearRun, SAVE_KEY,
} from './save';
import { createRunStore, initialRoster, initialWallet } from './runStore';
import type { RunSlice } from './runStore';
import { initialGachaState } from '../game/gacha';
import { displayName } from '../game/identity';
import { gameData } from '../game/data';
import type { CodexEntry, HeroDefId, HeroInstId } from '../game/types';

/** 저장 대상만 담은 최소 슬라이스 */
const sample = (): RunSlice => {
  const roster = initialRoster();
  return {
    floorIndex: 2,
    roster,
    party: roster.slice(0, 2).map((h) => h.instId),
    wallet: initialWallet(),
    gacha: initialGachaState(0),
    codex: {} as Record<HeroDefId, CodexEntry>,
    facilities: { rest: 0, training: 0, forge: 0, armory: 0 },
    gear: [],
    gearSeq: 0,
    battleCount: 0,
    potions: 0,
    carriedPotions: 0,
    claimedQuests: [],
    questGrants: [],
    seenFirstLegendary: false,
    seed: 999,
    interventions: [],
    result: null,
    snapshot: [],
    deathCount: 1,
    towerCleared: false,
  };
};

/** jsdom이 없는 환경이므로 localStorage를 흉내낸다 */
class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  get length() { return this.m.size; }
  key = (i: number) => [...this.m.keys()][i] ?? null;
  clear = () => this.m.clear();
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

describe('직렬화', () => {
  it('왕복해도 저장 대상이 보존된다', () => {
    const s = sample();
    const back = deserialize(serialize(s));
    expect(back).not.toBeNull();
    expect(back!.floorIndex).toBe(s.floorIndex);
    expect(back!.deathCount).toBe(s.deathCount);
    expect(back!.party).toEqual(s.party);
    expect(back!.roster).toHaveLength(s.roster.length);
  });

  it('정상 클리어 표시가 왕복해도 유지된다', () => {
    // 새로고침으로 등반 완료가 풀리면 마지막 층을 무한히 반복할 수 있다.
    const s = { ...sample(), towerCleared: true };
    expect(deserialize(serialize(s))!.towerCleared).toBe(true);
  });

  it('층 확장 이전 세이브(towerCleared 없음)는 미클리어로 읽힌다', () => {
    const s = sample();
    const raw = JSON.parse(serialize(s));
    delete raw.run.towerCleared;
    expect(deserialize(JSON.stringify(raw))!.towerCleared).toBe(false);
  });

  it('개체 이름과 이명이 왕복해도 보존된다', () => {
    const s = sample();
    s.roster[0] = { ...s.roster[0], name: '잿빛의 노아', title: '이름을 버린 자' };
    const back = deserialize(serialize(s))!;
    expect(back.roster[0].name).toBe('잿빛의 노아');
    expect(back.roster[0].title).toBe('이름을 버린 자');
  });

  /** 이 필드 이전 세이브 — 이름이 없어도 읽히고, 표시는 종류 이름으로 폴백한다 */
  it('이름 없는 옛 세이브도 읽힌다', () => {
    const raw = JSON.parse(serialize(sample()));
    for (const h of raw.run.roster) { delete h.name; delete h.title; }
    const back = deserialize(JSON.stringify(raw));
    expect(back).not.toBeNull();
    expect(back!.roster[0].name).toBeUndefined();
    // 화면은 관문을 통과하므로 undefined가 새어나가지 않는다
    expect(displayName(back!.roster[0], gameData.heroes).length).toBeGreaterThan(0);
  });

  it('이름이 문자열이 아니면 버린다 (수동 편집 방지)', () => {
    const raw = JSON.parse(serialize(sample()));
    raw.run.roster[0].name = 123;
    raw.run.roster[0].title = { evil: true };
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.roster[0].name).toBeUndefined();
    expect(back.roster[0].title).toBeUndefined();
  });

  it('빈 이름은 없는 것으로 취급한다', () => {
    const raw = JSON.parse(serialize(sample()));
    raw.run.roster[0].name = '';
    expect(deserialize(JSON.stringify(raw))!.roster[0].name).toBeUndefined();
  });

  it('개체 시드와 발굴 진행도가 그대로 돌아온다 (개체 정체성)', () => {
    const s = sample();
    s.roster[0] = { ...s.roster[0], revealProgress: 0.42 };
    const back = deserialize(serialize(s))!;
    expect(back.roster[0].seed).toBe(s.roster[0].seed);
    expect(back.roster[0].revealProgress).toBe(0.42);
  });

  it('전투 중 상태는 저장하지 않는다 (복원 시 화면이 깨진다)', () => {
    const raw = JSON.parse(serialize({ ...sample(), seed: 777 }));
    expect(raw.run).not.toHaveProperty('result');
    expect(raw.run).not.toHaveProperty('snapshot');
    expect(raw.run).not.toHaveProperty('interventions');
    expect(raw.run).not.toHaveProperty('seed');
  });

  it('버전이 기록된다 (마이그레이션 대비)', () => {
    expect(JSON.parse(serialize(sample())).version).toBe(SAVE_VERSION);
  });
});

describe('깨진 세이브', () => {
  it('빈 문자열이면 null', () => {
    expect(deserialize('')).toBeNull();
  });

  it('JSON이 아니면 null', () => {
    expect(deserialize('{{{')).toBeNull();
  });

  it('버전이 미래면 null (다운그레이드 거부)', () => {
    const raw = JSON.parse(serialize(sample()));
    raw.version = SAVE_VERSION + 99;
    expect(deserialize(JSON.stringify(raw))).toBeNull();
  });

  it('roster가 배열이 아니면 null', () => {
    const raw = JSON.parse(serialize(sample()));
    raw.run.roster = 'nope';
    expect(deserialize(JSON.stringify(raw))).toBeNull();
  });

  it('party에 없는 영웅이 섞여 있으면 걸러낸다', () => {
    const raw = JSON.parse(serialize(sample()));
    raw.run.party = [...raw.run.party, 'ghost#999'];
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.party).not.toContain('ghost#999' as HeroInstId);
  });

  it('죽은 영웅은 파티에서 걸러낸다', () => {
    const s = sample();
    s.roster[0] = { ...s.roster[0], isDead: true };
    const back = deserialize(serialize(s))!;
    expect(back.party).not.toContain(s.roster[0].instId);
  });

  it('floorIndex가 범위를 벗어나면 잘라낸다', () => {
    const raw = JSON.parse(serialize(sample()));
    raw.run.floorIndex = 9999;
    expect(deserialize(JSON.stringify(raw))!.floorIndex).toBeLessThan(9999);
  });
});

describe('저장소 왕복', () => {
  it('저장한 뒤 불러오면 같은 상태다', () => {
    const s = sample();
    saveRun(s);
    const back = loadRun()!;
    expect(back.floorIndex).toBe(s.floorIndex);
    expect(back.roster.map((h) => h.instId)).toEqual(s.roster.map((h) => h.instId));
  });

  it('저장이 없으면 null', () => {
    expect(loadRun()).toBeNull();
  });

  it('지우면 사라진다', () => {
    saveRun(sample());
    clearRun();
    expect(loadRun()).toBeNull();
  });

  it('localStorage가 던져도 앱이 죽지 않는다 (사파리 프라이빗 등)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => saveRun(sample())).not.toThrow();
    expect(loadRun()).toBeNull();
    expect(() => clearRun()).not.toThrow();
  });
});

describe('퍼머데스는 저장을 견딘다', () => {
  it('전투에서 죽은 영웅은 불러와도 죽어 있다', () => {
    const store = createRunStore(() => 12345);
    store.getState().start();
    const victim = store.getState().party[0];
    store.setState({
      result: { ...store.getState().result!, casualties: [victim], outcome: 'defeat' },
    });
    store.getState().finish();

    // finish()가 자동 저장하므로 별도 호출 없이 불러온다
    const back = loadRun()!;
    expect(back.roster.find((h) => h.instId === victim)!.isDead).toBe(true);
    expect(back.party).not.toContain(victim);
    expect(back.deathCount).toBe(1);
  });

  it('발굴 진행도도 저장된다 (전투로 쌓은 관찰이 날아가지 않는다)', () => {
    const store = createRunStore(() => 12345);
    const fighter = store.getState().party[0];
    store.getState().start();
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'victory' },
    });
    store.getState().finish();

    const back = loadRun()!;
    const h = back.roster.find((x) => x.instId === fighter)!;
    expect(h.revealProgress ?? 0).toBeGreaterThan(0);
  });

  it('불러온 상태를 스토어에 넣으면 그대로 이어진다', () => {
    const store = createRunStore(() => 1);
    store.getState().start();
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'victory' },
    });
    store.getState().finish();
    const savedFloor = store.getState().floorIndex;

    const fresh = createRunStore(() => 1);
    fresh.getState().hydrate(loadRun()!);
    expect(fresh.getState().floorIndex).toBe(savedFloor);
  });

  it('hydrate는 전투 중 상태를 남기지 않는다', () => {
    const store = createRunStore(() => 1);
    store.getState().start();
    store.getState().hydrate(sample());
    expect(store.getState().result).toBeNull();
    expect(store.getState().snapshot).toEqual([]);
    expect(store.getState().interventions).toEqual([]);
  });
});

describe('저장 키', () => {
  it('키가 고정돼 있다 (바꾸면 기존 세이브가 사라진다)', () => {
    saveRun(sample());
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
  });
});
