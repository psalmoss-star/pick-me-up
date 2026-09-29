/**
 * 층 맵 — 입구에서 계단까지 2~3개 경로, 노드 6~10개. 기획서 2단계(2026-09-29).
 *
 * 설계 원칙:
 * - 순수 함수. React/DOM 의존 없음. **층 번호만으로 결정된다** — 같은 층은 언제나 같은 맵이다.
 *   (저장하지 않는다. 층 생성기 `floorgen.ts`와 같은 원칙)
 * - 전투는 층당 한 판 그대로다(사용자 결정). 경로가 정하는 것은 **접점의 지형**뿐이고,
 *   그 지형은 책략 성공률에만 닿는다(`terrainModifier`).
 * - 배치는 가로다: 입구(왼쪽) → 계단(오른쪽), 경로는 위아래 줄. 세로 화면에서도 띠로 줄일 수 있다.
 */
import type { FloorSpec } from './data/floors';
import type { StratagemId } from './data/stratagems';
import {
  TERRAIN, TERRAIN_TAGS, TERRAIN_TUNING, TERRAIN_WEIGHT_BY_SCENE, type TerrainTag,
} from './data/terrain';
import { createRng, rngInt } from './rng';
import type { RNG } from './types';

export type MapNodeKind = 'entry' | 'path' | 'exit';

export interface MapNode {
  id: string;
  kind: MapNodeKind;
  /** 배치 좌표 0~1 (왼쪽→오른쪽 = 입구→계단, 위→아래 = 경로 줄) */
  x: number;
  y: number;
  /** 입구·계단은 지형이 없다 */
  tag: TerrainTag | null;
}

export interface MapRoute {
  index: number;
  /** 입구 → … → 계단, 노드 id 순서 */
  nodeIds: string[];
  /** 적과 부딪히는 노드 — 전투가 여기서 벌어진다 */
  contactId: string;
}

export interface FloorMap {
  floorId: number;
  nodes: MapNode[];
  /** [from, to] 노드 id */
  edges: Array<[string, string]>;
  routes: MapRoute[];
}

/** 층 번호 → 맵 전용 시드. 층 생성기의 salt들과 겹치지 않게 고정 상수를 섞는다 */
function mapRng(floorId: number): RNG {
  return createRng((Math.imul(floorId, 0x9e3779b1) ^ 0x6d61702a) >>> 0);
}

function weightedTag(rng: RNG, weights: Record<TerrainTag, number>): TerrainTag {
  const total = TERRAIN_TAGS.reduce((a, t) => a + weights[t], 0);
  let r = rng() * total;
  for (const t of TERRAIN_TAGS) {
    r -= weights[t];
    if (r < 0) return t;
  }
  return TERRAIN_TAGS[TERRAIN_TAGS.length - 1];
}

/**
 * 모양 — (경로 수, 경로당 노드 수). 노드 수 = 2 + 경로 × 경로당 노드.
 * (2,2)=6 · (3,2)=8 · (2,3)=8. 기획서의 6~10 안에 든다.
 */
const SHAPES: Array<[number, number]> = [[2, 2], [3, 2], [2, 3]];

/** 층 맵 — 결정적. 캐시하지 않는다(가볍고, 전역 캐시는 `applyPrep` 오염 같은 사고를 부른다) */
export function floorMapOf(floor: Pick<FloorSpec, 'id' | 'scene'>): FloorMap {
  const rng = mapRng(floor.id);
  const [routeCount, perRoute] = SHAPES[rngInt(rng, SHAPES.length)];
  const weights = TERRAIN_WEIGHT_BY_SCENE[floor.scene];

  const entry: MapNode = { id: 'entry', kind: 'entry', x: 0, y: 0.5, tag: null };
  const exit: MapNode = { id: 'exit', kind: 'exit', x: 1, y: 0.5, tag: null };
  const nodes: MapNode[] = [entry];
  const edges: Array<[string, string]> = [];
  const routes: MapRoute[] = [];

  for (let r = 0; r < routeCount; r++) {
    const y = routeCount === 1 ? 0.5 : r / (routeCount - 1);
    const ids: string[] = [];
    for (let c = 0; c < perRoute; c++) {
      const id = `r${r}n${c}`;
      nodes.push({ id, kind: 'path', x: (c + 1) / (perRoute + 1), y, tag: weightedTag(rng, weights) });
      ids.push(id);
    }
    const chain = ['entry', ...ids, 'exit'];
    for (let i = 0; i < chain.length - 1; i++) edges.push([chain[i], chain[i + 1]]);
    routes.push({ index: r, nodeIds: chain, contactId: ids[rngInt(rng, ids.length)] });
  }
  nodes.push(exit);

  /*
    경로마다 접점 지형이 다 같으면 고를 이유가 없다. 첫 경로와 같은 지형의 접점이 있으면
    그 접점만 다른 지형으로 바꾼다 — 경로 선택이 언제나 "다른 싸움터"를 뜻하게 한다.
  */
  const used = new Set<TerrainTag>();
  for (const route of routes) {
    const node = nodes.find((n) => n.id === route.contactId)!;
    if (used.has(node.tag!)) {
      const free = TERRAIN_TAGS.filter((t) => !used.has(t));
      node.tag = free[rngInt(rng, free.length)];
    }
    used.add(node.tag!);
  }

  return { floorId: floor.id, nodes, edges, routes };
}

/** 경로의 접점 지형 */
export function contactTerrain(map: FloorMap, routeIndex: number): TerrainTag | null {
  const route = map.routes[routeIndex] ?? map.routes[0];
  return map.nodes.find((n) => n.id === route.contactId)?.tag ?? null;
}

/** 지형이 책략 성공률에 주는 보정. 지형이 없으면 0 */
export function terrainModifier(tag: TerrainTag | null | undefined, id: StratagemId): number {
  if (!tag) return 0;
  const def = TERRAIN[tag];
  if (def.good.includes(id)) return TERRAIN_TUNING.good;
  if (def.bad.includes(id)) return TERRAIN_TUNING.bad;
  return 0;
}

/** 경로 번호를 맵 안으로 끌어온다 — 저장본·화면에서 온 값을 믿지 않는다 */
export function clampRoute(map: FloorMap, routeIndex: number): number {
  return Number.isInteger(routeIndex) && routeIndex >= 0 && routeIndex < map.routes.length
    ? routeIndex : 0;
}
