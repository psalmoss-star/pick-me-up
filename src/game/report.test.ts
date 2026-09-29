import { describe, it, expect } from 'vitest';
import {
  crisisFor, partyPowerOf, reportLine, reportStyleOf, reportedTerrain, resolveScout, scoutReport, trueEnemyPower,
} from './report';
import { REPORT_STYLES, REPORT_STYLE_BY_TEMPER, REPORT_TUNING, type ReportStyle } from './data/reports';
import { TEMPERS } from './data/temperaments';
import { CRISIS_LEVELS } from './data/orders';
import { FLOORS, floorAt, gameData } from './data';
import { floorMapOf } from './floormap';
import { deriveTemper } from './temperament';
import { runEncounter } from './encounter';
import { createRng } from './rng';
import { klassFor } from './stats';
import { HERO } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance } from './types';

const hero = (seed: number | undefined, n = 1, defId: HeroDefId = HERO.ashen): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star: 3, klass: klassFor(3), level: 20, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1, seed,
});

/** 성향마다 그 성향이 나오는 seed 하나 */
const seedFor = (style: ReportStyle): number => {
  for (let s = 1; s < 5000; s++) {
    const t = deriveTemper(s);
    if (t && REPORT_STYLE_BY_TEMPER[t.id] === style) return s;
  }
  throw new Error(`no seed for ${style}`);
};

describe('성향 묶음 (사용자 결정: 정직 1 · 허세 2 · 겁많음 3 · 침묵 2)', () => {
  it('기질 8종이 전부 성향에 묶이고, 개수가 결정대로다', () => {
    const count: Record<ReportStyle, number> = { honest: 0, bluff: 0, coward: 0, silent: 0 };
    for (const t of TEMPERS) count[REPORT_STYLE_BY_TEMPER[t.id]]++;
    expect(count).toEqual({ honest: 1, bluff: 2, coward: 3, silent: 2 });
  });

  it('위기 단계 — 정직 30% · 허세 15%(늦게) · 겁많음 50%(이르게) · 침묵 없음', () => {
    expect(REPORT_STYLES.honest.crisisLevel).toBe('hp30');
    expect(REPORT_STYLES.bluff.crisisLevel).toBe('hp15');
    expect(REPORT_STYLES.coward.crisisLevel).toBe('hp50');
    expect(REPORT_STYLES.silent.crisisLevel).toBeNull();
    expect(CRISIS_LEVELS.hp15).toBeLessThan(CRISIS_LEVELS.hp30);
    expect(CRISIS_LEVELS.hp30).toBeLessThan(CRISIS_LEVELS.hp50);
  });

  it('기질이 없는 옛 개체는 정직으로 본다', () => {
    expect(reportStyleOf(hero(undefined))).toBe('honest');
  });
});

describe('보고 내용', () => {
  const floors = FLOORS.filter((f) => f.id <= 40);

  it('정직 — 적 수·전력·접점이 전부 참이다', () => {
    const scout = hero(seedFor('honest'));
    for (const f of floors) {
      const map = floorMapOf(f);
      const r = scoutReport(scout, f, map, gameData);
      expect(r.style).toBe('honest');
      expect(r.enemyCount).toBe(f.enemyIds.length);
      expect(r.enemyPower).toBe(trueEnemyPower(f, gameData));
      expect(r.contacts).toEqual(map.routes.map((x) => x.contactId));
    }
  });

  it('침묵 — 아무것도 말하지 않는다(✕도 위기 창도 없다)', () => {
    const scout = hero(seedFor('silent'));
    const f = floorAt(5);
    const r = scoutReport(scout, f, floorMapOf(f), gameData);
    expect(r.enemyCount).toBeNull();
    expect(r.enemyPower).toBeNull();
    expect(r.contacts.every((c) => c === null)).toBe(true);
    expect(r.crisisLevel).toBeNull();
  });

  it('허세는 줄이고 겁많음은 부풀린다 — 적 수·전력 모두', () => {
    const bluff = hero(seedFor('bluff'));
    const coward = hero(seedFor('coward'));
    for (const f of floors) {
      const map = floorMapOf(f);
      const power = trueEnemyPower(f, gameData);
      const b = scoutReport(bluff, f, map, gameData);
      const c = scoutReport(coward, f, map, gameData);
      expect(b.enemyCount!).toBeLessThanOrEqual(f.enemyIds.length);
      expect(b.enemyCount!).toBeGreaterThanOrEqual(1);
      expect(b.enemyPower!).toBeLessThan(power);
      expect(c.enemyCount!).toBeGreaterThan(f.enemyIds.length);
      expect(c.enemyCount!).toBeLessThanOrEqual(f.enemyIds.length + REPORT_TUNING.countShiftMax);
      expect(c.enemyPower!).toBeGreaterThan(power);
    }
  });

  it('틀린 접점은 같은 경로 위의 지형 있는 지점이고, 여러 층에 걸쳐 실제로 틀린다', () => {
    let wrong = 0;
    let total = 0;
    for (const style of ['bluff', 'coward'] as const) {
      const scout = hero(seedFor(style));
      for (const f of floors) {
        const map = floorMapOf(f);
        const r = scoutReport(scout, f, map, gameData);
        map.routes.forEach((route, i) => {
          const id = r.contacts[i]!;
          expect(route.nodeIds).toContain(id);
          expect(id).not.toBe('entry');
          expect(id).not.toBe('exit');
          total++;
          if (id !== route.contactId) wrong++;
        });
      }
    }
    // 틀릴 확률 0.5 근처 — 너무 드물면 의심할 일이 없고, 늘 틀리면 보고를 뒤집어 읽으면 그만이다
    expect(wrong / total).toBeGreaterThan(0.3);
    expect(wrong / total).toBeLessThan(0.7);
  });

  it('결정적 — 같은 정찰자·같은 층이면 같은 보고, 다른 정찰자면 다를 수 있다', () => {
    const f = floorAt(8);
    const map = floorMapOf(f);
    const a = hero(seedFor('coward'), 1);
    expect(scoutReport(a, f, map, gameData)).toEqual(scoutReport({ ...a }, f, map, gameData));
  });

  it('보고된 지형은 보고된 접점 노드의 지형이다', () => {
    const f = floorAt(12);
    const map = floorMapOf(f);
    const r = scoutReport(hero(seedFor('bluff')), f, map, gameData);
    map.routes.forEach((_, i) => {
      expect(reportedTerrain(map, r, i)).toBe(map.nodes.find((n) => n.id === r.contacts[i])!.tag);
    });
    const silent = scoutReport(hero(seedFor('silent')), f, map, gameData);
    expect(reportedTerrain(map, silent, 0)).toBeNull();
  });

  it('전력 척도 — 적 전력과 아군 전투력이 같은 산식이라 비교가 된다(0이 아니다)', () => {
    expect(trueEnemyPower(floorAt(0), gameData)).toBeGreaterThan(0);
    expect(partyPowerOf([hero(1)], gameData)).toBeGreaterThan(0);
    // 깊은 층은 깊이 배수가 붙어 같은 적이어도 전력이 크다
    const deep = FLOORS.find((f) => f.id > 40)!;
    expect(trueEnemyPower(deep, gameData)).toBeGreaterThan(0);
  });
});

describe('정찰자 결정', () => {
  it('고른 사람이 명단에 있으면 그 사람, 없으면 첫 번째, 명단이 비면 null', () => {
    const a = hero(1, 1);
    const b = hero(2, 2);
    expect(resolveScout([a, b], b.instId)).toBe(b);
    expect(resolveScout([a, b], 'nobody#9' as HeroInstId)).toBe(a);
    expect(resolveScout([a, b], null)).toBe(a);
    expect(resolveScout([], a.instId)).toBeNull();
  });
});

describe('위기 단계 기록 (엔진)', () => {
  it('단계 순서가 맞고(50% ≤ 30% ≤ 15%), crisis는 hp30과 같다', () => {
    const party = () => [hero(1, 1, HERO.ashen), hero(2, 2, HERO.bulwark), hero(3, 3, HERO.tide)];
    let seen15 = 0;
    for (let f = 0; f < 20; f++) {
      for (let seed = 1; seed <= 5; seed++) {
        const r = runEncounter({ party: party(), floor: floorAt(f), data: gameData, rng: createRng(seed) });
        expect(r.crisis).toEqual(r.crises.hp30 ?? null);
        const { hp50, hp30, hp15 } = r.crises;
        if (hp30) expect(hp50).toBeDefined();
        if (hp15) { expect(hp30).toBeDefined(); seen15++; }
        if (hp50 && hp30) expect(hp50.at).toBeLessThanOrEqual(hp30.at);
        if (hp30 && hp15) expect(hp30.at).toBeLessThanOrEqual(hp15.at);
      }
    }
    expect(seen15).toBeGreaterThan(0);
  });
});

describe('보고 문장', () => {
  it('조사를 받침에 맞춰 고르고, 자리표시가 남지 않는다', () => {
    for (const style of ['honest', 'bluff', 'coward', 'silent'] as const) {
      for (const [scout, hurt] of [['세인', '카이'], ['카이', '세인']]) {
        for (const moment of ['brief', 'crisis'] as const) {
          const t = reportLine(style, moment, { scout, hurt });
          expect(t).not.toMatch(/[{}]/);
          expect(t).not.toMatch(/세인가|카이이|세인는|카이은/);
        }
      }
    }
    expect(reportLine('bluff', 'crisis', { scout: '세인', hurt: '카일' })).toContain('세인이');
    expect(reportLine('bluff', 'crisis', { scout: '세인', hurt: '카이' })).toContain('카이가');
    expect(reportLine('coward', 'crisis', { scout: '카이', hurt: '세인' })).toContain('카이가');
  });
});

describe('위기 창 고르기', () => {
  const result = { crisis: { at: 30 }, crises: { hp50: { at: 10 }, hp30: { at: 30 }, hp15: { at: 50 } } };
  it('정직 30% · 허세 15% · 겁많음 50% · 침묵 없음 · 보고 없음은 정직과 같다', () => {
    expect(crisisFor(result, { crisisLevel: 'hp30' })).toEqual({ at: 30 });
    expect(crisisFor(result, { crisisLevel: 'hp15' })).toEqual({ at: 50 });
    expect(crisisFor(result, { crisisLevel: 'hp50' })).toEqual({ at: 10 });
    expect(crisisFor(result, { crisisLevel: null })).toBeNull();
    expect(crisisFor(result, null)).toEqual({ at: 30 });
  });
  it('그 단계까지 안 떨어졌으면 창이 없다 — 허세는 위기를 끝내 말하지 않을 수 있다', () => {
    expect(crisisFor({ crisis: null, crises: { hp50: { at: 3 } } }, { crisisLevel: 'hp15' })).toBeNull();
  });
});
