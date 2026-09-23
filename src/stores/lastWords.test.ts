/**
 * 유언 — 무덤에 적히는 마지막 말. gdd-v3 §4.10.
 *
 * AI 유언은 결과 화면(finish 전)에서 요청되므로, 응답이 finish **앞**에 올 수도
 * **뒤**에 올 수도 있다. 두 순서 모두 같은 무덤을 만들어야 한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deserializeLegacy, emptyLegacy, loadLegacy, saveLegacy, serializeLegacy, withLastWords } from './legacy';
import { clearPendingWords, offerAiWords, takePendingWords } from './lastWords';
import { createRunStore } from './runStore';
import { displayName } from '../game/identity';
import { templateLastWords } from '../game/voice';
import { gameData } from '../game/data';
import type { Legacy } from '../game/legacyTypes';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  get length() { return this.m.size; }
  key = (i: number) => [...this.m.keys()][i] ?? null;
  clear = () => this.m.clear();
}

/** legacy.test.ts와 같은 방식 — HP 1로 낮춰 사망을 상태로 강제한다 */
function killOnFloor1() {
  const store = createRunStore(() => 42);
  store.setState({ roster: store.getState().roster.map((h) => ({ ...h, currentHp: 1 })) });
  store.getState().start();
  const casualties = store.getState().result?.casualties ?? [];
  const dead = casualties.map((id) => store.getState().roster.find((h) => h.instId === id)!);
  return { store, dead };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
  clearPendingWords();
});

describe('유언 — 저장 모양', () => {
  it('유언 필드는 왕복한다', () => {
    const l: Legacy = {
      ...emptyLegacy(),
      fallen: [{
        name: '세인', title: 't', star: 3, defId: 'h_tide' as never, floorId: 6,
        revealProgress: 0, runNo: 1, lastWords: '먼저 가서… 기다리겠습니다.',
        lastWordsBy: 'ai', epitaph: '그는 끝까지 명령을 지켰다.',
      }],
    };
    const back = deserializeLegacy(serializeLegacy(l));
    expect(back.fallen[0].lastWords).toBe('먼저 가서… 기다리겠습니다.');
    expect(back.fallen[0].lastWordsBy).toBe('ai');
    expect(back.fallen[0].epitaph).toBe('그는 끝까지 명령을 지켰다.');
  });

  it('유언 이전의 옛 기록도 그대로 읽힌다 — 키가 새로 생기지 않는다', () => {
    const raw = JSON.stringify({
      version: 1, runNo: 1, runs: [], summit: [], codex: {},
      fallen: [{ name: '세인', title: 't', star: 3, defId: 'h_tide', floorId: 6, revealProgress: 0, runNo: 1 }],
    });
    const f = deserializeLegacy(raw).fallen[0];
    expect(f.name).toBe('세인');
    expect('lastWords' in f).toBe(false);
    expect('lastWordsBy' in f).toBe(false);
  });

  it('모르는 작성자 값은 버린다', () => {
    const raw = JSON.stringify({
      version: 1, runNo: 1, runs: [], summit: [], codex: {},
      fallen: [{ name: '세인', title: 't', star: 3, defId: 'h_tide', floorId: 6,
        revealProgress: 0, runNo: 1, lastWords: 'x', lastWordsBy: 'hacker' }],
    });
    expect('lastWordsBy' in deserializeLegacy(raw).fallen[0]).toBe(false);
  });

  it('withLastWords는 이름으로 찾고, 없으면 아무것도 안 바꾼다', () => {
    const l = { ...emptyLegacy() };
    expect(withLastWords(l, '없는 이름', { lastWords: 'x', lastWordsBy: 'ai' })).toBe(l);
  });
});

describe('유언 — finish()가 무덤에 적는다', () => {
  it('AI가 없으면 템플릿 유언이 적힌다 (결과 화면과 같은 문장)', () => {
    const { store, dead } = killOnFloor1();
    expect(dead.length).toBeGreaterThan(0);
    store.getState().finish();

    for (const h of dead) {
      const rec = loadLegacy().fallen.find((f) => f.name === displayName(h, gameData.heroes))!;
      expect(rec.lastWords).toBe(templateLastWords(h, 1));
      expect(rec.lastWordsBy).toBe('template');
      expect(rec.epitaph).toBeUndefined();
    }
  });

  it('순서 1 — AI 유언이 finish 전에 도착하면 보관했다가 그대로 적는다', () => {
    const { store, dead } = killOnFloor1();
    const name = displayName(dead[0], gameData.heroes);

    expect(offerAiWords(name, { lastWords: 'AI가 쓴 말', epitaph: 'AI가 쓴 비문' })).toBe('pending');
    store.getState().finish();

    const rec = loadLegacy().fallen.find((f) => f.name === name)!;
    expect(rec.lastWords).toBe('AI가 쓴 말');
    expect(rec.lastWordsBy).toBe('ai');
    expect(rec.epitaph).toBe('AI가 쓴 비문');
    // 한 번 쓰면 보관함에서 빠진다
    expect(takePendingWords(name)).toBeUndefined();
  });

  it('순서 2 — finish 뒤에 도착하면 무덤을 고쳐 적는다', () => {
    const { store, dead } = killOnFloor1();
    const name = displayName(dead[0], gameData.heroes);
    store.getState().finish();

    expect(offerAiWords(name, { lastWords: '늦게 온 말' })).toBe('saved');
    const rec = loadLegacy().fallen.find((f) => f.name === name)!;
    expect(rec.lastWords).toBe('늦게 온 말');
    expect(rec.lastWordsBy).toBe('ai');
  });

  it('두 순서의 무덤이 같다', () => {
    const a = killOnFloor1();
    const nameA = displayName(a.dead[0], gameData.heroes);
    offerAiWords(nameA, { lastWords: '같은 말' });
    a.store.getState().finish();
    const early = loadLegacy().fallen.find((f) => f.name === nameA)!;

    vi.stubGlobal('localStorage', new MemStorage());
    clearPendingWords();
    const b = killOnFloor1();
    b.store.getState().finish();
    offerAiWords(nameA, { lastWords: '같은 말' });
    const late = loadLegacy().fallen.find((f) => f.name === nameA)!;

    expect(late).toEqual(early);
  });

  it('유언은 사망 판정에 닿지 않는다 — AI 유무와 무관하게 같은 사람이 죽는다', () => {
    const a = killOnFloor1();
    const b = killOnFloor1();
    offerAiWords(displayName(b.dead[0], gameData.heroes), { lastWords: 'x' });
    expect(b.store.getState().result?.casualties).toEqual(a.store.getState().result?.casualties);
  });

  it('무덤이 없을 때 offer해도 던지지 않는다', () => {
    saveLegacy(emptyLegacy());
    expect(() => offerAiWords('아무개', { lastWords: 'x' })).not.toThrow();
  });
});
