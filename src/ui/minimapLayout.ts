/**
 * 미니맵 배치 — 층 맵(노드 그래프)을 "위에서 내려다본 지형도"로 옮긴다. 표시 전용(2026-10-01).
 *
 * - 순수 함수. 층 번호(→ `floorMapOf`)에서 결정적이고 저장하지 않는다.
 * - 지형 면: 격자 칸마다 **가장 가까운 경로 노드**의 지형을 칠한다(보로노이). 멀면 빈 땅.
 *   지형은 언제나 참이다 — 정찰 보고가 틀려도 땅은 그대로이고 ✕만 보고 위치에 찍힌다.
 * - 길: 대각선 대신 **가로·세로로만** 꺾는다(1차 셀프 테스트: "선이 곡선이라 읽기 어렵다").
 *   입구 옆 갈림 열에서 갈라져 경로 줄을 따라 가로로 가고, 계단 옆 모임 열에서 모인다.
 * - 수치는 표시 값이라 `game/data`가 아니라 여기 둔다.
 */
import type { FloorMap, MapNode } from '../game/floormap';
import type { TerrainTag } from '../game/data/terrain';

export const MINIMAP = {
  /** 격자 — 4:3. 전투 미니맵 96px이면 칸 하나가 6px */
  cols: 16,
  rows: 12,
  /** 경로 노드에서 이 거리(칸)보다 먼 칸은 빈 땅 — 지형이 "그 노드 주변 땅"으로 읽히게 */
  terrainRadius: 2.8,
  /** 입구·계단의 가장자리 여백(칸) */
  edge: 0.5,
  /** 갈림·모임 열과 위·아래 여백(칸) */
  margin: 1.5,
} as const;

export interface MinimapLayout {
  cols: number;
  rows: number;
  /** row-major. 칸마다 지형, 빈 땅은 null */
  cells: Array<TerrainTag | null>;
  /** 격자 좌표(칸 단위, 실수) */
  nodes: Array<{ id: string; x: number; y: number }>;
  /** 경로마다 가로·세로로만 꺾인 길. 입구에서 시작해 계단에서 끝난다 */
  roads: Array<{ route: number; points: Array<[number, number]> }>;
}

function nodePoint(n: MapNode): [number, number] {
  const { cols, rows, edge, margin } = MINIMAP;
  const y = margin + n.y * (rows - margin * 2);
  if (n.kind === 'entry') return [edge, y];
  if (n.kind === 'exit') return [cols - edge, y];
  return [margin + n.x * (cols - margin * 2), y];
}

/** 연속한 같은 점을 지운다 — 경로 줄이 입구와 같은 높이면 갈림 꺾임이 0길이가 된다 */
function dedupe(points: Array<[number, number]>): Array<[number, number]> {
  return points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}

export function minimapLayout(map: FloorMap): MinimapLayout {
  const { cols, rows, terrainRadius, margin } = MINIMAP;
  const point = new Map(map.nodes.map((n) => [n.id, nodePoint(n)]));
  const nodes = map.nodes.map((n) => {
    const [x, y] = point.get(n.id)!;
    return { id: n.id, x, y };
  });

  const paths = map.nodes.filter((n) => n.kind === 'path');
  const cells: Array<TerrainTag | null> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c + 0.5;
      const cy = r + 0.5;
      let best: MapNode | null = null;
      let bestD = Infinity;
      for (const n of paths) {
        const [x, y] = point.get(n.id)!;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) { bestD = d; best = n; }
      }
      cells.push(best && bestD <= terrainRadius ? best.tag : null);
    }
  }

  const [entryX, entryY] = point.get('entry')!;
  const [exitX, exitY] = point.get('exit')!;
  const branchX = margin;
  const mergeX = cols - margin;
  const roads = map.routes.map((route) => {
    const mids = route.nodeIds.slice(1, -1).map((id) => point.get(id)!);
    const rowY = mids[0][1];
    return {
      route: route.index,
      points: dedupe([
        [entryX, entryY], [branchX, entryY], [branchX, rowY],
        ...mids,
        [mergeX, rowY], [mergeX, exitY], [exitX, exitY],
      ]),
    };
  });

  return { cols, rows, cells, nodes, roads };
}
