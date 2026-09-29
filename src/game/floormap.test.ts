import { describe, it, expect } from 'vitest';
import { clampRoute, contactTerrain, floorMapOf, terrainModifier } from './floormap';
import { TERRAIN, TERRAIN_TAGS, TERRAIN_TUNING } from './data/terrain';
import { STRATAGEMS } from './data/stratagems';
import { FLOORS, floorAt, gameData } from './data';
import { runEncounter } from './encounter';
import { createRng, substream, STREAM } from './rng';
import { klassFor } from './stats';
import { HERO } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

describe('층 맵 모양', () => {
  it('1~100층 전부 — 노드 6~10개, 경로 2~3개, 경로는 입구에서 계단까지 이어진다', () => {
    for (const f of FLOORS) {
      const m = floorMapOf(f);
      expect(m.nodes.length).toBeGreaterThanOrEqual(6);
      expect(m.nodes.length).toBeLessThanOrEqual(10);
      expect(m.routes.length).toBeGreaterThanOrEqual(2);
      expect(m.routes.length).toBeLessThanOrEqual(3);
      const edge = new Set(m.edges.map(([a, b]) => `${a}>${b}`));
      for (const r of m.routes) {
        expect(r.nodeIds[0]).toBe('entry');
        expect(r.nodeIds.at(-1)).toBe('exit');
        for (let i = 0; i < r.nodeIds.length - 1; i++) {
          expect(edge.has(`${r.nodeIds[i]}>${r.nodeIds[i + 1]}`)).toBe(true);
        }
        // 접점은 경로 위의 지형 있는 노드다
        expect(r.nodeIds).toContain(r.contactId);
        expect(m.nodes.find((n) => n.id === r.contactId)!.tag).not.toBeNull();
      }
    }
  });
  it('경로마다 접점 지형이 다르다 — 경로 선택은 언제나 다른 싸움터다', () => {
    for (const f of FLOORS) {
      const m = floorMapOf(f);
      const tags = m.routes.map((_, i) => contactTerrain(m, i));
      expect(new Set(tags).size).toBe(tags.length);
    }
  });
  it('결정적 — 같은 층은 언제나 같은 맵', () => {
    for (const f of FLOORS.slice(0, 30)) expect(floorMapOf(f)).toEqual(floorMapOf(f));
  });
  it('층마다 맵이 다양하다 — 인접한 층이 똑같지 않다', () => {
    const sig = (i: number) => JSON.stringify(floorMapOf(FLOORS[i]).nodes.map((n) => n.tag));
    let same = 0;
    for (let i = 1; i < FLOORS.length; i++) if (sig(i) === sig(i - 1)) same++;
    expect(same).toBeLessThan(5);
  });
  it('모든 지형이 어딘가에 나온다', () => {
    const seen = new Set(FLOORS.flatMap((f) => floorMapOf(f).nodes.map((n) => n.tag)));
    for (const t of TERRAIN_TAGS) expect(seen.has(t)).toBe(true);
  });
  it('경로 번호는 맵 안으로 끌어온다', () => {
    const m = floorMapOf(FLOORS[0]);
    expect(clampRoute(m, 99)).toBe(0);
    expect(clampRoute(m, -1)).toBe(0);
    expect(clampRoute(m, 1)).toBe(1);
  });
});

describe('지형 보정', () => {
  it('유리 +, 불리 −, 무관 0, 지형 없음 0', () => {
    expect(terrainModifier('narrow', 'lureFire')).toBe(TERRAIN_TUNING.good);
    expect(terrainModifier('river', 'lureFire')).toBe(TERRAIN_TUNING.bad);
    expect(terrainModifier('fort', 'nightRaid')).toBe(0);
    expect(terrainModifier(null, 'lureFire')).toBe(0);
  });
  it('모든 책략에 잘 통하는 지형이 하나 이상 있다', () => {
    for (const s of STRATAGEMS) {
      expect(TERRAIN_TAGS.some((t) => TERRAIN[t].good.includes(s.id))).toBe(true);
    }
  });
  it('한 지형이 같은 책략을 유리·불리 둘 다로 두지 않는다', () => {
    for (const t of TERRAIN_TAGS) {
      for (const id of TERRAIN[t].good) expect(TERRAIN[t].bad).not.toContain(id);
    }
  });
});

describe('전투 — 지형이 성공률을 움직인다', () => {
  const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
    instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
    currentHp: 0, isDead: false, acquiredAtFloor: 1,
  });
  const party = () => [hero(HERO.ashen, 3, 30, 1), hero(HERO.bulwark, 3, 30, 2), hero(HERO.tide, 3, 35, 3)];
  const rate = (terrain: 'forest' | 'open' | null) => {
    let ok = 0, all = 0;
    for (let f = 6; f < 20; f++) {
      for (let seed = 1; seed <= 30; seed++) {
        const r = runEncounter({
          party: party(), floor: floorAt(f), data: gameData, rng: createRng(seed),
          stratagems: { ids: ['ambush'], terrain, rng: substream(seed, STREAM.STRATAGEM) },
        });
        for (const e of r.events) if (e.type === 'stratagem') { all++; if (e.success) ok++; }
      }
    }
    return ok / all;
  };
  it('매복: 숲 > 지형 없음 > 개활지', () => {
    const forest = rate('forest'), none = rate(null), open = rate('open');
    expect(forest).toBeGreaterThan(none);
    expect(none).toBeGreaterThan(open);
  });
  it('지형을 넘겨도 책략이 없으면 전투는 그대로다', () => {
    const base = runEncounter({ party: party(), floor: floorAt(9), data: gameData, rng: createRng(5) });
    const withEmpty = runEncounter({
      party: party(), floor: floorAt(9), data: gameData, rng: createRng(5),
      stratagems: { ids: [], terrain: 'forest', rng: substream(5, STREAM.STRATAGEM) },
    });
    expect(withEmpty).toEqual(base);
  });
});
