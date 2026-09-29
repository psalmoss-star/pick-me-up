import { describe, it, expect } from 'vitest';
import {
  appendDeeds, chronicleOf, deedsOf, deedText, DEEDS_KEEP, type ChronicleUnit,
} from './chronicle';
import { deriveBeats } from './beats';
import { CHRONICLE_LINES } from './data/chronicle';
import { STRATAGEMS } from './data/stratagems';
import { runEncounter } from './encounter';
import { createRng, substream, STREAM } from './rng';
import { klassFor } from './stats';
import { gameData, floorAt } from './data';
import { HERO } from './data/sample';
import type { BattleEvent, HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const roster: ChronicleUnit[] = [
  { uid: 'A:h1', name: '세인', side: 'ally', sourceId: 'h1' },
  { uid: 'A:h2', name: '마르', side: 'ally', sourceId: 'h2' },
];
const ev = (i: Partial<BattleEvent>): BattleEvent => ({ turn: 3, type: 'turnStart', ...i });

describe('기록 문장 데이터', () => {
  it('모든 책략에 성공·간파 문장이 있다', () => {
    for (const s of STRATAGEMS) {
      expect(CHRONICLE_LINES[s.id].success.length).toBeGreaterThan(0);
      expect(CHRONICLE_LINES[s.id].failure.length).toBeGreaterThan(0);
    }
  });
  it('자리표시는 {ally}와 {ally:X/Y}뿐이다 — 조사를 뒤에 붙여 쓰지 않는다', () => {
    for (const l of Object.values(CHRONICLE_LINES)) {
      for (const t of [l.success, l.failure]) {
        const holes = t.match(/\{[^}]*\}/g) ?? [];
        for (const h of holes) expect(h).toMatch(/^\{ally(:[^/}]+\/[^}]+)?\}$/);
        // `{ally}가`처럼 쓰면 「세인가」가 찍힌다
        expect(t).not.toMatch(/\{ally\}[이가을를은는]/);
      }
    }
  });
});

describe('chronicleOf', () => {
  it('책략 이벤트를 장면으로 — 이름과 조사가 채워진다', () => {
    const out = chronicleOf([
      ev({ type: 'turnStart' }),
      ev({ type: 'stratagem', actorUid: 'A:h1', stratagemId: 'lureFire', success: true }),
      ev({ type: 'stratagem', turn: 5, actorUid: 'A:h2', stratagemId: 'ambush', success: false }),
    ], roster);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ at: 2, turn: 3, actor: 'h1', success: true, title: '유인 후 화공' });
    expect(out[0].text).toContain('세인이');
    expect(out[0].text).not.toMatch(/[{}]/);
    expect(out[1]).toMatchObject({ actor: 'h2', success: false });
    expect(out[1].text).toContain('마르가');
  });
  it('모르는 책략·모르는 수행자는 건너뛴다', () => {
    expect(chronicleOf([
      ev({ type: 'stratagem', actorUid: 'A:h1', stratagemId: 'nope', success: true }),
      ev({ type: 'stratagem', actorUid: 'A:zz', stratagemId: 'ambush', success: true }),
    ], roster)).toEqual([]);
  });
});

describe('연대기', () => {
  it('수행자별로 모으고, 최근 DEEDS_KEEP개만 남긴다', () => {
    const entries = chronicleOf([
      ev({ type: 'stratagem', actorUid: 'A:h1', stratagemId: 'flood', success: true }),
      ev({ type: 'stratagem', actorUid: 'A:h1', stratagemId: 'ambush', success: false }),
    ], roster);
    const m = deedsOf(entries, 12);
    expect(m.get('h1' as HeroInstId)).toEqual([
      { floor: 12, stratagemId: 'flood', success: true },
      { floor: 12, stratagemId: 'ambush', success: false },
    ]);
    const long = Array.from({ length: 9 }, (_, i) => ({ floor: i, stratagemId: 'ambush' as const, success: true }));
    expect(appendDeeds(long.slice(0, 4), long.slice(4))).toHaveLength(DEEDS_KEEP);
    expect(appendDeeds(undefined, long).at(-1)!.floor).toBe(8);
  });
  it('한 줄 표기', () => {
    expect(deedText({ floor: 12, stratagemId: 'lureFire', success: true })).toBe('12층 · 유인 후 화공 · 성공');
    expect(deedText({ floor: 3, stratagemId: 'ambush', success: false })).toBe('3층 · 매복 · 간파당함');
  });
});

describe('실전 — 전투 중 비트와 결과 기록이 같은 장면이다', () => {
  const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
    instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
    currentHp: 0, isDead: false, acquiredAtFloor: 1,
  });
  it('책략이 발동한 전투에서 비트가 같은 문장으로 멈춘다', () => {
    let found = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = runEncounter({
        party: [hero(HERO.ashen, 3, 30, 1), hero(HERO.bulwark, 3, 30, 2), hero(HERO.tide, 3, 35, 3)],
        floor: floorAt(9), data: gameData, rng: createRng(seed),
        stratagems: { ids: ['ambush', 'flood'], rng: substream(seed, STREAM.STRATAGEM) },
      });
      const entries = chronicleOf(r.events, r.roster);
      const beats = deriveBeats(r.events, { roster: r.roster, chronicle: entries });
      for (const c of entries) {
        expect(beats.some((b) => b.at === c.at && b.lines[0] === c.text)).toBe(true);
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
