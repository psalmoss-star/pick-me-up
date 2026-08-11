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
