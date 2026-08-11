/**
 * 무덤 저장 계층.
 *
 * save.ts와 같은 규칙을 따른다: **절대 던지지 않는다.**
 * 무덤을 못 읽어서 앱이 안 뜨는 것이 기록 하나 잃는 것보다 나쁘다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_KEY, emptyLegacy, serializeLegacy, deserializeLegacy,
  loadLegacy, saveLegacy, sealedNames,
} from './legacy';
import type { Legacy } from '../game/legacyTypes';
import { createRunStore, initialRoster } from './runStore';
import { clearRun } from './save';
import { displayName, displayTitle } from '../game/identity';
import { gameData } from '../game/data';

/** vitest 환경이 node라 localStorage가 없다 — save.test.ts와 같은 흉내 저장소 */
class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  get length() { return this.m.size; }
  key = (i: number) => [...this.m.keys()][i] ?? null;
  clear = () => this.m.clear();
}

function sample(): Legacy {
  return {
    ...emptyLegacy(),
    runNo: 2,
    fallen: [
      { name: '물결의 세인', title: '가라앉은 자', star: 3, defId: 'h_tide' as never,
        floorId: 6, revealProgress: 0.62, runNo: 1 },
    ],
    runs: [
      { runNo: 1, reachedFloor: 100, cleared: true, deaths: 12, summons: 47, endedAt: 1 },
    ],
  };
}

describe('무덤 저장', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemStorage());
  });

  it('빈 기록은 1회차에서 시작한다', () => {
    const l = emptyLegacy();
    expect(l.runNo).toBe(1);
    expect(l.fallen).toEqual([]);
    expect(l.runs).toEqual([]);
  });

  it('왕복해도 값이 보존된다', () => {
    const back = deserializeLegacy(serializeLegacy(sample()));
    expect(back.runNo).toBe(2);
    expect(back.fallen[0].name).toBe('물결의 세인');
    expect(back.fallen[0].revealProgress).toBeCloseTo(0.62);
    expect(back.runs[0].cleared).toBe(true);
  });

  it('깨진 JSON은 빈 기록이 된다 (던지지 않는다)', () => {
    expect(() => deserializeLegacy('{{{')).not.toThrow();
    expect(deserializeLegacy('{{{').fallen).toEqual([]);
  });

  it('미래 버전은 빈 기록이 된다', () => {
    const raw = JSON.stringify({ ...sample(), version: 999 });
    expect(deserializeLegacy(raw).fallen).toEqual([]);
  });

  it('필드가 없어도 기본값으로 채운다', () => {
    const l = deserializeLegacy(JSON.stringify({ version: 1 }));
    expect(l.runNo).toBe(1);
    expect(l.fallen).toEqual([]);
    expect(l.codex).toEqual({});
  });

  it('저장한 적 없으면 빈 기록을 돌려준다', () => {
    expect(loadLegacy().fallen).toEqual([]);
  });

  it('저장하고 다시 읽으면 같다', () => {
    saveLegacy(sample());
    expect(loadLegacy().fallen[0].name).toBe('물결의 세인');
  });

  it('봉인 이름 집합을 만든다', () => {
    expect(sealedNames(sample()).has('물결의 세인')).toBe(true);
    expect(sealedNames(sample()).has('없는 이름')).toBe(false);
  });

  it('저장 키가 런 세이브와 다르다', () => {
    // 같은 키면 회차 시작이 무덤을 지운다 — 이 분리가 설계의 핵심이다.
    expect(LEGACY_KEY).not.toBe('tower-of-picks:run');
  });
});

describe('무덤 적재', () => {
  beforeEach(() => localStorage.clear());

  it('clearRun()이 무덤을 지우지 않는다', () => {
    saveLegacy(sample());
    clearRun();
    expect(loadLegacy().fallen[0].name).toBe('물결의 세인');
  });

  it('회차를 시작하면 로스터·재화가 초기화된다', () => {
    const store = createRunStore(() => 42);
    store.setState({ floorIndex: 30, towerCleared: true, deathCount: 9 });
    store.getState().startNewRun();

    const s = store.getState();
    expect(s.floorIndex).toBe(0);
    expect(s.towerCleared).toBe(false);
    expect(s.deathCount).toBe(0);
    expect(s.roster.length).toBe(initialRoster().length);
    expect(s.wallet.gold).toBe(300);
  });

  it('회차를 시작하면 runNo가 오르고 직전 런이 기록된다', () => {
    const store = createRunStore(() => 42);
    store.setState({ floorIndex: 30, towerCleared: true, deathCount: 9 });
    store.getState().startNewRun();

    expect(store.getState().runNo).toBe(2);
    const l = loadLegacy();
    expect(l.runNo).toBe(2);
    expect(l.runs).toHaveLength(1);
    expect(l.runs[0].reachedFloor).toBe(31); // floorIndex 30 = 31층
    expect(l.runs[0].cleared).toBe(true);
    expect(l.runs[0].deaths).toBe(9);
  });

  it('회차를 시작해도 무덤의 사망자는 남는다', () => {
    saveLegacy(sample());
    const store = createRunStore(() => 42);
    store.getState().startNewRun();
    expect(loadLegacy().fallen[0].name).toBe('물결의 세인');
  });

  it('도감은 회차를 넘어 유지된다', () => {
    const l = { ...sample(), codex: { h_tide: { firstSeenAt: 1, count: 3 } } as never };
    saveLegacy(l);
    const store = createRunStore(() => 42);
    store.getState().startNewRun();
    // freshSlice()의 빈 도감이 아니라 무덤의 도감이 들어와야 한다
    expect(Object.keys(store.getState().codex)).toContain('h_tide');
  });

  it('전투 사망자가 명부에 오른다', () => {
    const store = createRunStore(() => 42);

    /**
     * 사망을 시드가 아니라 상태로 강제한다.
     * 파티 전원의 currentHp를 1로 낮추면 전투 시작 시 최대치로 안 채워지고
     * (battle.ts: currentHp>0이면 그 값을 쓴다) 첫 피격에 곧바로 죽는다 —
     * 시드 사냥보다 견고하고, 어떤 시드를 넣어도 재현된다.
     */
    const dying = store.getState().roster.map((h) => ({ ...h, currentHp: 1 }));
    store.setState({ roster: dying });

    store.getState().start();
    const casualties = store.getState().result?.casualties ?? [];
    expect(casualties.length).toBeGreaterThan(0); // 강제가 실제로 먹었는지 확인

    const deadId = casualties[0];
    const deadHero = store.getState().roster.find((h) => h.instId === deadId)!;
    const expectedName = displayName(deadHero, gameData.heroes);
    const expectedTitle = displayTitle(deadHero, gameData.heroes);

    store.getState().finish();

    const l = loadLegacy();
    expect(l.fallen).toHaveLength(casualties.length);
    const record = l.fallen.find((f) => f.defId === deadHero.defId && f.name === expectedName)!;
    expect(record).toBeDefined();
    expect(record.name).toBe(expectedName);
    expect(record.title).toBe(expectedTitle);
    expect(record.star).toBe(deadHero.star);
    expect(record.floorId).toBe(1);
    expect(record.runNo).toBe(1);
    expect(record.revealProgress).toBeGreaterThanOrEqual(0);
    expect(record.revealProgress).toBeLessThanOrEqual(1);
  });

  it('합성 제물은 명부에 오르지 않는다', () => {
    const store = createRunStore(() => 42);
    const [target, sacrifice] = store.getState().roster;
    store.getState().fuse(target.instId, sacrifice.instId);

    // 제물은 로스터에서 사라졌지만 casualties가 아니므로 무덤 기록은 그대로 비어 있다.
    expect(loadLegacy().fallen).toEqual([]);
  });
});
