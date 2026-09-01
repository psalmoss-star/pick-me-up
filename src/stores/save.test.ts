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
import { MATERIAL } from '../game/data/materials';
import { ASSIGN_SLOTS } from '../game/data/facilities';
import type { CodexEntry, HeroDefId, HeroInstId } from '../game/types';

/** 저장 대상만 담은 최소 슬라이스 */
const sample = (): RunSlice => {
  const roster = initialRoster();
  return {
    floorIndex: 2,
    maxFloorReached: 2,
    revisits: {},
    roster,
    squads: [roster.slice(0, 2).map((h) => h.instId), []],
    lockedSquad: null,
    lastSortieSquad: 0,
    wallet: initialWallet(),
    gacha: initialGachaState(0),
    codex: {} as Record<HeroDefId, CodexEntry>,
    facilities: { rest: 0, training: 0, forge: 0, armory: 0 },
    assignments: { training: [], forge: [] },
    gear: [],
    gearSeq: 0,
    battleCount: 0,
    potions: 0,
    materials: {},
    dispatches: [],
    adventureOutcomes: [],
    carriedPotions: 0,
    prep: null,
    claimedQuests: [],
    questGrants: [],
    seenFirstLegendary: false,
    seed: 999,
    interventions: [],
    result: null,
    snapshot: [],
    deathCount: 1,
    towerCleared: false,
    runNo: 1,
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
    expect(back!.squads).toEqual(s.squads);
    expect(back!.roster).toHaveLength(s.roster.length);
  });

  it('제작 재료가 왕복해도 보존된다', () => {
    const s = { ...sample(), materials: { [MATERIAL.ore]: 7, [MATERIAL.essence]: 2 } };
    const back = deserialize(serialize(s));
    expect(back!.materials).toEqual({ [MATERIAL.ore]: 7, [MATERIAL.essence]: 2 });
  });

  it('재료 이전 옛 세이브는 빈 주머니로 읽힌다', () => {
    const s = sample();
    const raw = JSON.parse(serialize(s));
    delete raw.run.materials;
    expect(deserialize(JSON.stringify(raw))!.materials).toEqual({});
  });

  it('정의에 없는 재료 id는 버린다 (유령 재료 방지)', () => {
    const s = sample();
    const raw = JSON.parse(serialize(s));
    raw.run.materials = { [MATERIAL.ore]: 3, mt_ghost: 99 };
    const back = deserialize(JSON.stringify(raw));
    expect(back!.materials).toEqual({ [MATERIAL.ore]: 3 });
  });

  it('재료 수량이 음수·소수·비숫자면 버리거나 내림한다 (수동 편집 방지)', () => {
    const s = sample();
    const raw = JSON.parse(serialize(s));
    raw.run.materials = {
      [MATERIAL.ore]: -5, [MATERIAL.hide]: 2.7, [MATERIAL.essence]: 'many',
    };
    const back = deserialize(JSON.stringify(raw));
    // 음수·문자열은 사라지고, 소수는 내림
    expect(back!.materials).toEqual({ [MATERIAL.hide]: 2 });
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

  it('즐겨찾기 표식이 왕복해도 보존된다', () => {
    // 표식이 새로고침으로 풀리면 제물 확인 창이 조용히 약해진다.
    const s = sample();
    s.roster[0] = { ...s.roster[0], favorite: true };
    expect(deserialize(serialize(s))!.roster[0].favorite).toBe(true);
  });

  /** 이 필드 이전 세이브 — 표식이 없으면 즐겨찾기 아님으로 읽힌다 */
  it('즐겨찾기 이전 옛 세이브도 읽힌다', () => {
    const raw = JSON.parse(serialize(sample()));
    for (const h of raw.run.roster) delete h.favorite;
    const back = deserialize(JSON.stringify(raw));
    expect(back).not.toBeNull();
    expect(back!.roster[0].favorite).toBeFalsy();
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

  it('squads에 없는 영웅이 섞여 있으면 걸러낸다', () => {
    const raw = JSON.parse(serialize(sample()));
    raw.run.squads[0] = [...raw.run.squads[0], 'ghost#999'];
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.squads[0]).not.toContain('ghost#999' as HeroInstId);
  });

  it('죽은 영웅은 편성에서 걸러낸다', () => {
    const s = sample();
    s.roster[0] = { ...s.roster[0], isDead: true };
    const back = deserialize(serialize(s))!;
    expect(back.squads.flat()).not.toContain(s.roster[0].instId);
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
    const victim = store.getState().squads[0][0];
    store.setState({
      result: { ...store.getState().result!, casualties: [victim], outcome: 'defeat' },
    });
    store.getState().finish();

    // finish()가 자동 저장하므로 별도 호출 없이 불러온다
    const back = loadRun()!;
    expect(back.roster.find((h) => h.instId === victim)!.isDead).toBe(true);
    expect(back.squads[0]).not.toContain(victim);
    expect(back.deathCount).toBe(1);
  });

  it('발굴 진행도도 저장된다 (전투로 쌓은 관찰이 날아가지 않는다)', () => {
    const store = createRunStore(() => 12345);
    const fighter = store.getState().squads[0][0];
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

describe('세이브 v2 — maxFloorReached / revisits', () => {
  it('v1 세이브의 floorIndex가 maxFloorReached로 올라온다', () => {
    // v1엔 maxFloorReached가 없다. floorIndex가 "거기까지 갔다"는 뜻이므로 그 값이 정답이다.
    const v1 = JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      run: {
        floorIndex: 5,
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        party: ['h_ashen#1'],
      },
    });

    const out = deserialize(v1);
    expect(out).not.toBeNull();
    expect(out!.maxFloorReached).toBe(5);
    expect(out!.floorIndex).toBe(5);
  });

  it('v1 세이브의 revisits는 빈 객체가 된다', () => {
    const v1 = JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      run: {
        floorIndex: 3,
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        party: [],
      },
    });

    expect(deserialize(v1)!.revisits).toEqual({});
  });

  it('maxFloorReached는 floorIndex보다 작을 수 없다', () => {
    // 수동 편집 방어. 작으면 해금 상한이 현재 층보다 낮아 층 선택이 깨진다.
    const broken = JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      run: {
        floorIndex: 9,
        maxFloorReached: 2,
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        party: [],
      },
    });

    const out = deserialize(broken)!;
    expect(out.maxFloorReached).toBeGreaterThanOrEqual(out.floorIndex);
  });

  it('revisits의 음수·비정수·비숫자 값은 걸러진다', () => {
    const dirty = JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      run: {
        floorIndex: 0,
        maxFloorReached: 0,
        revisits: { 3: 2, 4: -1, 5: 'x', 6: 1.7 },
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        party: [],
      },
    });

    const out = deserialize(dirty)!;
    expect(out.revisits[3]).toBe(2);
    expect(out.revisits[4]).toBeUndefined();
    expect(out.revisits[5]).toBeUndefined();
    expect(out.revisits[6]).toBe(1);   // 내림
  });

  it('미래 버전(v3)은 여전히 읽지 않는다', () => {
    const v3 = JSON.stringify({ version: 3, savedAt: Date.now(), run: { floorIndex: 0, roster: [] } });
    expect(deserialize(v3)).toBeNull();
  });
});

describe('시설 배치 저장', () => {
  it('배치가 왕복해도 보존된다', () => {
    const s = sample();
    const ids = s.roster.map((h) => h.instId);
    s.assignments = { training: [ids[0]], forge: [ids[1]] };

    const out = deserialize(serialize(s))!;

    expect(out.assignments.training).toEqual([ids[0]]);
    expect(out.assignments.forge).toEqual([ids[1]]);
  });

  /*
    ⚠️ 유령 instId는 슬롯을 **영구 점유**한다. 화면에 이름이 안 뜨니
    해제할 방법도 없어 그 자리가 영영 잠긴다 — 교착이다.
    파견이 "정의에 없는 모험은 버린다"로 막은 것과 같은 모양.
  */
  it('로스터에 없는 instId는 버려진다', () => {
    const s = sample();
    s.assignments = { training: ['h_ghost#99' as HeroInstId], forge: [] };

    const out = deserialize(serialize(s))!;

    expect(out.assignments.training).toEqual([]);
  });

  it('죽은 영웅은 배치에서 버려진다', () => {
    const s = sample();
    s.roster = s.roster.map((h, i) => (i === 0 ? { ...h, isDead: true } : h));
    s.assignments = { training: [s.roster[0].instId], forge: [] };

    const out = deserialize(serialize(s))!;

    expect(out.assignments.training).toEqual([]);
  });

  it('슬롯을 넘는 인원은 잘린다 (수동 편집 방지)', () => {
    const s = sample();
    const ids = s.roster.map((h) => h.instId);
    expect(ids.length).toBeGreaterThan(ASSIGN_SLOTS.training);
    s.assignments = { training: ids, forge: [] };

    const out = deserialize(serialize(s))!;

    expect(out.assignments.training.length).toBe(ASSIGN_SLOTS.training);
  });

  it('같은 영웅이 두 시설에 있으면 뒤엣것을 버린다', () => {
    const s = sample();
    const id = s.roster[0].instId;
    s.assignments = { training: [id], forge: [id] };

    const out = deserialize(serialize(s))!;

    expect(out.assignments.training).toEqual([id]);
    expect(out.assignments.forge).toEqual([]);
  });

  it('배치가 없는 예전 세이브는 빈 배치로 읽힌다', () => {
    // SAVE_VERSION을 올리지 않은 근거다 — 기본값이 안전하므로 마이그레이션이 필요 없다.
    const old = JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      run: {
        floorIndex: 0,
        maxFloorReached: 0,
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        party: [],
      },
    });

    const out = deserialize(old)!;

    expect(out.assignments).toEqual({ training: [], forge: [] });
  });
});
