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
