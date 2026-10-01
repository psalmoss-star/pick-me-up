/**
 * 미니맵 점 — 전투 재생 상태를 미니맵 좌표로 옮긴다. 표시 전용(2026-10-01).
 *
 * - 순수 함수. 엔진은 이 파일을 모르고, 이 파일은 화면이 이미 가진 값(HP·이탈·단계·결과)만 읽는다.
 * - 전투는 접점 한 곳에서 한 판이다(사용자 결정) — 점은 입구 → 접점 → (승리 시) 계단만 오간다.
 * - 목표 좌표만 준다. 이동(직선 transition)과 쓰러진 점 지우기(투명도 전환)는 화면 몫이다.
 */
import { clampRoute, type FloorMap } from '../game/floormap';
import type { MinimapLayout } from './minimapLayout';

export type MinimapPhase = 'approach' | 'engage' | 'after';
export type DotSide = 'hero' | 'enemy' | 'guard';

export interface DotUnit {
  uid: string;
  side: DotSide;
  alive: boolean;
  /** 후퇴 신호·군령·1턴 후퇴로 전장을 벗어났다 — 입구로 돌아간다 */
  withdrawn: boolean;
}

export interface MinimapDot {
  uid: string;
  side: DotSide;
  x: number;
  y: number;
  dead: boolean;
}

export const DOT = {
  /** 같은 무리 점 사이 간격(칸). 전투 미니맵에서 약 4px */
  gap: 0.7,
  /** 한 줄에 놓는 점 수 — 적 6기면 두 줄 */
  perRow: 3,
  /** 입구·계단 무리를 가장자리에서 안쪽으로 당기는 거리(칸) — 격자 밖으로 안 나가게 */
  entryInset: 0.7,
  /** 교전 중 아군·적 무리가 접점에서 떨어진 거리(칸) */
  contactOffset: 1.2,
  /** 출정 전 적이 기다리는 자리(접점 오른쪽, 칸) */
  enemyWait: 1.6,
} as const;

/** 무리 순서 — 아군, 호위, 적. 같은 편은 uid 순 */
const SIDE_ORDER: Record<DotSide, number> = { hero: 0, guard: 1, enemy: 2 };

export function minimapDots(
  layout: MinimapLayout,
  map: FloorMap,
  route: number,
  state: { phase: MinimapPhase; units: DotUnit[]; outcome?: 'victory' | 'defeat' },
): MinimapDot[] {
  const at = (id: string): [number, number] => {
    const n = layout.nodes.find((x) => x.id === id)!;
    return [n.x, n.y];
  };
  const chosen = map.routes[clampRoute(map, route)];
  const [ex, ey] = at('entry');
  const [xx, xy] = at('exit');
  const [cx, cy] = at(chosen.contactId);

  const entry: [number, number] = [ex + DOT.entryInset, ey];
  const exit: [number, number] = [xx - DOT.entryInset, xy];
  const allyFront: [number, number] = [cx - DOT.contactOffset, cy];
  const enemyFront: [number, number] = [cx + DOT.contactOffset, cy];
  const enemyWait: [number, number] = [cx + DOT.enemyWait, cy];

  const anchorOf = (u: DotUnit): [number, number] => {
    if (u.side === 'enemy') return state.phase === 'approach' ? enemyWait : enemyFront;
    if (u.withdrawn) return entry;
    if (!u.alive) return allyFront;
    if (state.phase === 'approach') return entry;
    if (state.phase === 'after' && state.outcome === 'victory') return exit;
    return allyFront;
  };

  const sorted = [...state.units].sort((a, b) =>
    SIDE_ORDER[a.side] - SIDE_ORDER[b.side] || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

  // 같은 기준점에 모인 유닛끼리 무리를 이룬다
  const groups = new Map<string, { anchor: [number, number]; units: DotUnit[] }>();
  for (const u of sorted) {
    const anchor = anchorOf(u);
    const key = `${anchor[0]},${anchor[1]}`;
    const g = groups.get(key) ?? { anchor, units: [] };
    g.units.push(u);
    groups.set(key, g);
  }

  const out: MinimapDot[] = [];
  for (const { anchor: [ax, ay], units } of groups.values()) {
    const n = units.length;
    const colsN = Math.min(n, DOT.perRow);
    const rowsN = Math.ceil(n / DOT.perRow);
    units.forEach((u, i) => {
      const col = i % DOT.perRow;
      const row = Math.floor(i / DOT.perRow);
      out.push({
        uid: u.uid,
        side: u.side,
        x: ax + (col - (colsN - 1) / 2) * DOT.gap,
        y: ay + (row - (rowsN - 1) / 2) * DOT.gap,
        dead: !u.alive,
      });
    });
  }
  return out;
}
