import { describe, it, expect } from 'vitest';
import { FLOORS, floorAt } from '../game/data';
import { floorMapOf } from '../game/floormap';
import { MINIMAP, minimapLayout } from './minimapLayout';

const pointOf = (layout: ReturnType<typeof minimapLayout>, id: string): [number, number] => {
  const n = layout.nodes.find((x) => x.id === id)!;
  return [n.x, n.y];
};

describe('미니맵 배치', () => {
  it('결정적 — 같은 층이면 같은 배치', () => {
    const f = floorAt(12);
    expect(minimapLayout(floorMapOf(f))).toEqual(minimapLayout(floorMapOf(f)));
  });

  it('격자 크기와 칸 수가 맞다', () => {
    const l = minimapLayout(floorMapOf(floorAt(0)));
    expect(l.cols).toBe(MINIMAP.cols);
    expect(l.rows).toBe(MINIMAP.rows);
    expect(l.cells).toHaveLength(MINIMAP.cols * MINIMAP.rows);
  });

  it('1~100층 — 경로 노드가 있는 칸의 지형은 그 노드의 지형이다(접점 포함)', () => {
    for (const f of FLOORS) {
      const map = floorMapOf(f);
      const l = minimapLayout(map);
      for (const n of map.nodes.filter((x) => x.kind === 'path')) {
        const [x, y] = pointOf(l, n.id);
        expect(l.cells[Math.floor(y) * l.cols + Math.floor(x)]).toBe(n.tag);
      }
    }
  });

  it('지형이 면으로 칠해진다 — 빈 땅만 있지 않고, 노드에서 먼 칸은 빈 땅이다', () => {
    const l = minimapLayout(floorMapOf(floorAt(12)));
    const filled = l.cells.filter((c) => c !== null).length;
    expect(filled).toBeGreaterThan(l.cells.length * 0.3);
    expect(filled).toBeLessThan(l.cells.length);
  });

  it('1~100층 — 모든 길 구간이 가로 또는 세로다(대각선 없음)', () => {
    for (const f of FLOORS) {
      for (const road of minimapLayout(floorMapOf(f)).roads) {
        for (let i = 0; i < road.points.length - 1; i++) {
          const [a, b] = [road.points[i], road.points[i + 1]];
          expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
        }
      }
    }
  });

  it('1~100층 — 길은 입구에서 시작해 계단에서 끝나고, 그 경로의 노드를 순서대로 지난다', () => {
    for (const f of FLOORS) {
      const map = floorMapOf(f);
      const l = minimapLayout(map);
      expect(l.roads).toHaveLength(map.routes.length);
      for (const road of l.roads) {
        const ids = map.routes[road.route].nodeIds;
        const idx = ids.map((id) => {
          const [x, y] = pointOf(l, id);
          return road.points.findIndex((p) => p[0] === x && p[1] === y);
        });
        expect(idx[0]).toBe(0);
        expect(idx[idx.length - 1]).toBe(road.points.length - 1);
        for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
      }
    }
  });

  it('노드 좌표가 격자 안에 있다', () => {
    for (const f of FLOORS.slice(0, 30)) {
      for (const n of minimapLayout(floorMapOf(f)).nodes) {
        expect(n.x).toBeGreaterThan(0);
        expect(n.x).toBeLessThan(MINIMAP.cols);
        expect(n.y).toBeGreaterThan(0);
        expect(n.y).toBeLessThan(MINIMAP.rows);
      }
    }
  });
});

describe('미니맵 배치 — 모양(STEP 71)', () => {
  const mapOf = (shape: string) => FLOORS.map((f) => floorMapOf(f)).find((m) => m.shape === shape)!;
  const segments = (pts: Array<[number, number]>) =>
    pts.slice(1).map((p, i) => [pts[i], p].map((q) => q.join(',')).sort().join('|'));

  it('1~100층 — 길은 가로·세로로만 꺾이고, 입구에서 시작해 계단에서 끝난다', () => {
    for (const f of FLOORS) {
      const map = floorMapOf(f);
      const l = minimapLayout(map);
      expect(l.roads).toHaveLength(map.routes.length);
      for (const road of l.roads) {
        expect(road.points[0]).toEqual(pointOf(l, 'entry'));
        expect(road.points.at(-1)).toEqual(pointOf(l, 'exit'));
        for (let i = 1; i < road.points.length; i++) {
          const [ax, ay] = road.points[i - 1];
          const [bx, by] = road.points[i];
          expect(ax === bx || ay === by).toBe(true);
        }
      }
    }
  });

  it('모이는 길 — 함께 지나는 구간은 어느 경로에서든 같은 선이다', () => {
    const map = mapOf('fork');
    const l = minimapLayout(map);
    const [a, b] = l.roads.map((r) => new Set(segments(r.points)));
    const shared = [...a].filter((s) => b.has(s));
    // 모인 뒤 계단까지의 구간은 겹쳐 그려진다
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.length).toBeLessThan(a.size);
  });

  it('보스의 방은 땅을 넓게 칠한다', () => {
    const arena = minimapLayout(mapOf('arena'));
    const corridor = minimapLayout(mapOf('corridor'));
    const filled = (l: typeof arena) => l.cells.filter((c) => c !== null).length;
    // 자리 하나가 자리 둘인 외길만큼은 칠한다 — 가운데가 한 공간으로 읽힌다
    expect(filled(arena)).toBeGreaterThan(filled(corridor) * 0.9);
    expect(new Set(arena.cells.filter((c) => c !== null)).size).toBe(1);
  });
});
