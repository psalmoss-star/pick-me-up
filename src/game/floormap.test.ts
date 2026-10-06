import { describe, it, expect } from 'vitest';
import {
  clampRoute, contactTerrain, floorMapOf, groupsAt, terrainModifier, MAP_SHAPES, type FloorMap,
} from './floormap';
import { ENEMY_PLACE, enemyPlaceOf } from './data/enemyPlaces';
import { TERRAIN, TERRAIN_TAGS, TERRAIN_TUNING } from './data/terrain';
import { STRATAGEMS } from './data/stratagems';
import { FLOORS, floorAt, gameData } from './data';
import { runEncounter } from './encounter';
import { createRng, substream, STREAM } from './rng';
import { klassFor } from './stats';
import { HERO, ENEMY } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

describe('층 맵 모양', () => {
  const pathNodes = (m: FloorMap) => m.nodes.filter((n) => n.kind === 'path');

  it('1~100층 전부 — 경로는 입구에서 계단까지 이어지고, 접점은 그 길 위의 땅이다', () => {
    for (const f of FLOORS) {
      const m = floorMapOf(f);
      expect(m.nodes.length).toBeGreaterThanOrEqual(3);
      expect(m.nodes.length).toBeLessThanOrEqual(10);
      expect(m.routes.length).toBeGreaterThanOrEqual(1);
      expect(m.routes.length).toBeLessThanOrEqual(3);
      const edge = new Set(m.edges.map(([a, b]) => `${a}>${b}`));
      expect(edge.size).toBe(m.edges.length); // 같은 길을 두 번 긋지 않는다(모이는 길)
      for (const r of m.routes) {
        expect(r.nodeIds[0]).toBe('entry');
        expect(r.nodeIds.at(-1)).toBe('exit');
        for (let i = 0; i < r.nodeIds.length - 1; i++) {
          expect(edge.has(`${r.nodeIds[i]}>${r.nodeIds[i + 1]}`)).toBe(true);
        }
        expect(r.nodeIds).toContain(r.contactId);
        expect(m.nodes.find((n) => n.id === r.contactId)!.tag).not.toBeNull();
      }
      // 모든 자리는 어느 길 위에 있다 — 길 없는 외딴 자리를 그리지 않는다
      const onRoute = new Set(m.routes.flatMap((r) => r.nodeIds));
      for (const n of m.nodes) expect(onRoute.has(n.id)).toBe(true);
    }
  });

  // 폰 피드백(2026-10-06): "보스 맵은 보통 한 공간일 텐데 전략이 필요 없을 것 같다"
  it('보스 층은 한 공간이다 — 길 하나, 넓은 자리 하나', () => {
    const bosses = FLOORS.filter((f) => f.isBoss);
    expect(bosses.length).toBeGreaterThan(0);
    for (const f of bosses) {
      const m = floorMapOf(f);
      expect(m.shape).toBe('arena');
      expect(m.routes).toHaveLength(1);
      expect(pathNodes(m)).toHaveLength(1);
      expect(pathNodes(m)[0].wide).toBe(true);
    }
  });

  // "슬라임이 3개인데 굳이 길을 여러 군데 가는 건 아닌 것 같다" — 적이 한 줌이면 외길이다
  it('적이 둘 이하면 외길, 셋 이상이면 갈림길이다(보스 층 제외)', () => {
    let solo = 0, forked = 0;
    for (const f of FLOORS.filter((x) => !x.isBoss)) {
      const m = floorMapOf(f);
      if (f.enemyIds.length <= MAP_SHAPES.soloMax) {
        expect(m.shape).toBe('corridor');
        expect(m.routes).toHaveLength(1);
        solo++;
      } else {
        expect(m.routes.length).toBeGreaterThanOrEqual(2);
        forked++;
      }
    }
    expect(solo).toBeGreaterThan(0);
    expect(forked).toBeGreaterThan(0);
  });

  it('경로마다 접점이 다른 자리이고 지형도 다르다 — 경로 선택은 언제나 다른 싸움터다', () => {
    for (const f of FLOORS) {
      const m = floorMapOf(f);
      const tags = m.routes.map((_, i) => contactTerrain(m, i));
      expect(new Set(tags).size).toBe(tags.length);
      expect(new Set(m.routes.map((r) => r.contactId)).size).toBe(m.routes.length);
    }
  });

  it('결정적 — 같은 층은 언제나 같은 맵', () => {
    for (const f of FLOORS.slice(0, 30)) expect(floorMapOf(f)).toEqual(floorMapOf(f));
  });

  // "대부분 동일한 맵으로 진행되니 전술에 의미가 없어진다"
  it('층마다 맵이 다양하다 — 모양이 여럿이고, 이웃한 층이 똑같지 않다', () => {
    const maps = FLOORS.map((f) => floorMapOf(f));
    expect(new Set(maps.map((m) => m.shape)).size).toBeGreaterThanOrEqual(7);
    const sig = (m: FloorMap) => JSON.stringify([m.shape, m.nodes.map((n) => n.tag), m.groups]);
    let same = 0;
    for (let i = 1; i < maps.length; i++) if (sig(maps[i]) === sig(maps[i - 1])) same++;
    expect(same).toBeLessThan(5);
    // 갈림길 층끼리도 한 모양에 몰리지 않는다
    const multi = maps.filter((m) => m.routes.length > 1);
    const top = Math.max(...Object.values(
      multi.reduce<Record<string, number>>((a, m) => ({ ...a, [m.shape]: (a[m.shape] ?? 0) + 1 }), {}),
    ));
    expect(top / multi.length).toBeLessThan(0.4);
  });

  it('모든 지형이 어딘가에 나온다', () => {
    const seen = new Set(FLOORS.flatMap((f) => floorMapOf(f).nodes.map((n) => n.tag)));
    for (const t of TERRAIN_TAGS) expect(seen.has(t)).toBe(true);
  });

  it('경로 번호는 맵 안으로 끌어온다', () => {
    const m = FLOORS.map((f) => floorMapOf(f)).find((x) => x.routes.length >= 2)!;
    expect(clampRoute(m, 99)).toBe(0);
    expect(clampRoute(m, -1)).toBe(0);
    expect(clampRoute(m, 1)).toBe(1);
    // 외길에서는 무엇을 넘겨도 0이다
    const solo = FLOORS.map((f) => floorMapOf(f)).find((x) => x.routes.length === 1)!;
    expect(clampRoute(solo, 1)).toBe(0);
  });
});

describe('적이 머무는 자리', () => {
  it('적 종류마다 자리가 정확히 하나 있고, 그 자리는 길 위의 땅이다', () => {
    for (const f of FLOORS) {
      const m = floorMapOf(f);
      const kinds = [...new Set(f.enemyIds)];
      expect(m.groups.map((g) => g.defId).sort()).toEqual([...kinds].sort());
      for (const g of m.groups) {
        expect(m.nodes.find((n) => n.id === g.nodeId)?.kind).toBe('path');
        expect(groupsAt(m, g.nodeId)).toContain(g.defId);
      }
    }
  });

  // 지도가 참 수를 말하면 정찰 보고의 왜곡(STEP 60)이 무의미해진다
  it('자리에는 종류만 있다 — 수가 없다', () => {
    for (const f of FLOORS) {
      for (const g of floorMapOf(f).groups) expect(Object.keys(g).sort()).toEqual(['defId', 'nodeId']);
    }
    // 같은 적이 여럿인 층에서도 무리는 하나다
    const dup = FLOORS.find((f) => new Set(f.enemyIds).size < f.enemyIds.length)!;
    expect(floorMapOf(dup).groups).toHaveLength(new Set(dup.enemyIds).size);
  });

  it('자리의 땅은 대체로 그 적에게 어울리는 땅이다', () => {
    let fit = 0, all = 0;
    for (const f of FLOORS) {
      const m = floorMapOf(f);
      for (const g of m.groups) {
        all++;
        if (enemyPlaceOf(g.defId).habitat.includes(m.nodes.find((n) => n.id === g.nodeId)!.tag!)) fit++;
      }
    }
    // 접점 지형을 서로 다르게 하는 규칙이 먼저라 전부는 아니다(실측 86%)
    expect(fit / all).toBeGreaterThan(0.75);
  });

  it('적이 다르면 같은 층 번호·배경이라도 지도가 달라진다', () => {
    const base = FLOORS.find((f) => !f.isBoss && f.enemyIds.length <= MAP_SHAPES.soloMax)!;
    const a = floorMapOf({ ...base, enemyIds: [ENEMY.slime, ENEMY.slime] });
    const b = floorMapOf({ ...base, enemyIds: [ENEMY.golem, ENEMY.golem] });
    const land = (m: FloorMap) => m.nodes.find((n) => n.id === m.groups[0].nodeId)!.tag;
    expect(enemyPlaceOf(ENEMY.slime).habitat).toContain(land(a));
    expect(enemyPlaceOf(ENEMY.golem).habitat).toContain(land(b));
  });

  it('도감의 모든 적에게 머무는 곳과 짧은 이름이 있다', () => {
    for (const id of Object.keys(gameData.enemies)) {
      expect(ENEMY_PLACE[id], id).toBeDefined();
      expect(ENEMY_PLACE[id].short.length).toBeGreaterThan(0);
      expect(ENEMY_PLACE[id].habitat.length).toBeGreaterThan(0);
      for (const t of ENEMY_PLACE[id].habitat) expect(TERRAIN_TAGS).toContain(t);
    }
    expect(enemyPlaceOf('e_ghost')).toEqual({ short: '적', habitat: [] });
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
