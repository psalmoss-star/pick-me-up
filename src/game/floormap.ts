/**
 * 층 맵 — 입구에서 계단까지의 길과 그 위의 땅. 기획서 2단계(2026-09-29), 모양 재설계 STEP 71(2026-10-06).
 *
 * 설계 원칙:
 * - 순수 함수. React/DOM 의존 없음. **층(번호·배경·적 구성)만으로 결정된다** — 같은 층은 언제나 같은 맵이다.
 *   (저장하지 않는다. 층 생성기 `floorgen.ts`와 같은 원칙)
 * - 전투는 층당 한 판 그대로다(사용자 결정). 경로가 정하는 것은 **접점의 지형**뿐이고,
 *   그 지형은 책략 성공률에만 닿는다(`terrainModifier`).
 * - 배치는 가로다: 입구(왼쪽) → 계단(오른쪽). 세로 화면에서도 띠로 줄일 수 있다.
 *
 * ── STEP 71: 적 구성이 지도의 생김새를 정한다 ─────────────────────────
 * 폰 피드백(2026-10-06): "대부분 같은 맵이라 전술에 의미가 없다 / 보스 맵은 한 공간일 텐데 /
 * 슬라임 셋인데 굳이 길이 여럿일 필요가 없다 / 좁은 길에 오크, 그다음 길에 골렘처럼 몹마다 달라야 한다."
 *
 * - **보스 층은 한 공간이다.** 길은 하나, 고를 것이 없다.
 * - **적이 둘 이하면 외길이다.** 갈림길은 적이 셋 이상일 때부터 나온다.
 * - 갈림길의 모양이 여럿이다(갈라졌다 모이기 · 가다가 갈리기 · 짧은 길과 긴 길 · 나란한 두세 길).
 * - **적 종류마다 머무는 자리가 있다**(`groups`). 자리의 땅은 그 적에게 어울리는 땅이다(`data/enemyPlaces.ts`).
 *   어느 길로 가든 층의 적 전부와 싸운다 — 자리는 "어디서 몰려오는가"이고 표시 전용이다.
 *   ⚠️ `groups`에는 **종류만** 있다. 수를 넣으면 지도가 참 수를 말해 정찰 보고 왜곡(STEP 60)이 무의미해진다.
 */
import type { FloorSpec } from './data/floors';
import type { StratagemId } from './data/stratagems';
import {
  TERRAIN, TERRAIN_TAGS, TERRAIN_TUNING, TERRAIN_WEIGHT_BY_SCENE, type TerrainTag,
} from './data/terrain';
import { enemyPlaceOf } from './data/enemyPlaces';
import { createRng, rngInt } from './rng';
import type { EnemyDefId, RNG } from './types';

export type MapNodeKind = 'entry' | 'path' | 'exit';

export interface MapNode {
  id: string;
  kind: MapNodeKind;
  /** 배치 좌표 0~1 (왼쪽→오른쪽 = 입구→계단, 위→아래) */
  x: number;
  y: number;
  /** 입구·계단은 지형이 없다 */
  tag: TerrainTag | null;
  /** 넓은 자리 — 보스의 방. 지도에서 땅을 크게 칠한다 */
  wide?: boolean;
}

export interface MapRoute {
  index: number;
  /** 입구 → … → 계단, 노드 id 순서 */
  nodeIds: string[];
  /** 적과 부딪히는 노드 — 전투가 여기서 벌어진다 */
  contactId: string;
}

/** 지도의 모양 — 이름은 화면이 "어떤 길인가"를 말하는 데도 쓴다 */
export type MapShape =
  | 'arena'      // 보스의 방 — 한 공간
  | 'corridor'   // 외길
  | 'fork'       // 갈라졌다가 모인다
  | 'split'      // 한 길로 가다가 갈린다
  | 'detour'     // 짧은 길과 긴 길
  | 'twin'       // 나란한 두 길
  | 'long'       // 나란한 두 길, 길다
  | 'trident'    // 세 갈래가 한곳으로 모인다
  | 'triple';    // 나란한 세 길

export interface FloorMap {
  floorId: number;
  shape: MapShape;
  nodes: MapNode[];
  /** [from, to] 노드 id */
  edges: Array<[string, string]>;
  routes: MapRoute[];
  /**
   * 적 종류가 머무는 자리 — 종류마다 하나(같은 종류는 한 무리다). **수는 없다**(위 주석).
   * 표시 전용: 어느 길을 골라도 전부와 싸운다.
   */
  groups: Array<{ defId: EnemyDefId; nodeId: string }>;
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

/** 모양의 뼈대 — 길 위 자리의 좌표와, 길마다 지나는 자리 */
interface ShapeDef {
  /** [id, x, y] */
  spots: Array<[string, number, number]>;
  /** 길마다 지나는 자리 id(입구·계단 제외) */
  routes: string[][];
  /**
   * 길마다 접점이 될 수 있는 자리. 길끼리 겹치지 않아야 한다 —
   * 함께 지나는 자리(모이는 곳)가 접점이면 어느 길을 골라도 같은 싸움터가 된다.
   */
  contacts: string[][];
}

const SHAPE_DEFS: Record<MapShape, ShapeDef> = {
  arena: {
    spots: [['a', 0.5, 0.5]],
    routes: [['a']],
    contacts: [['a']],
  },
  corridor: {
    spots: [['c0', 1 / 3, 0.5], ['c1', 2 / 3, 0.5]],
    routes: [['c0', 'c1']],
    contacts: [['c0', 'c1']],
  },
  fork: {
    spots: [['a', 1 / 3, 0.1], ['b', 1 / 3, 0.9], ['m', 2 / 3, 0.5]],
    routes: [['a', 'm'], ['b', 'm']],
    contacts: [['a'], ['b']],
  },
  split: {
    spots: [['s', 1 / 3, 0.5], ['a', 2 / 3, 0.1], ['b', 2 / 3, 0.9]],
    routes: [['s', 'a'], ['s', 'b']],
    contacts: [['a'], ['b']],
  },
  detour: {
    spots: [['s', 0.5, 0.05], ['l0', 0.25, 0.95], ['l1', 0.5, 0.95], ['l2', 0.75, 0.95]],
    routes: [['s'], ['l0', 'l1', 'l2']],
    contacts: [['s'], ['l0', 'l1', 'l2']],
  },
  twin: {
    spots: [['r0n0', 1 / 3, 0], ['r0n1', 2 / 3, 0], ['r1n0', 1 / 3, 1], ['r1n1', 2 / 3, 1]],
    routes: [['r0n0', 'r0n1'], ['r1n0', 'r1n1']],
    contacts: [['r0n0', 'r0n1'], ['r1n0', 'r1n1']],
  },
  long: {
    spots: [
      ['r0n0', 0.25, 0], ['r0n1', 0.5, 0], ['r0n2', 0.75, 0],
      ['r1n0', 0.25, 1], ['r1n1', 0.5, 1], ['r1n2', 0.75, 1],
    ],
    routes: [['r0n0', 'r0n1', 'r0n2'], ['r1n0', 'r1n1', 'r1n2']],
    contacts: [['r0n0', 'r0n1', 'r0n2'], ['r1n0', 'r1n1', 'r1n2']],
  },
  trident: {
    spots: [['a', 1 / 3, 0], ['b', 1 / 3, 0.5], ['c', 1 / 3, 1], ['m', 2 / 3, 0.5]],
    routes: [['a', 'm'], ['b', 'm'], ['c', 'm']],
    contacts: [['a'], ['b'], ['c']],
  },
  triple: {
    spots: [
      ['r0n0', 1 / 3, 0], ['r0n1', 2 / 3, 0],
      ['r1n0', 1 / 3, 0.5], ['r1n1', 2 / 3, 0.5],
      ['r2n0', 1 / 3, 1], ['r2n1', 2 / 3, 1],
    ],
    routes: [['r0n0', 'r0n1'], ['r1n0', 'r1n1'], ['r2n0', 'r2n1']],
    contacts: [['r0n0', 'r0n1'], ['r1n0', 'r1n1'], ['r2n0', 'r2n1']],
  },
};

/**
 * 적 수에 따라 고를 수 있는 모양.
 * - 둘 이하: 외길. 적이 한 줌인데 길이 여럿이면 "굳이?"가 된다(폰 피드백).
 * - 셋~넷: 작은 갈림길. 길을 고르는 맛은 남기되 지도가 적보다 크지 않게 한다.
 * - 다섯 이상: 큰 지도.
 */
export const MAP_SHAPES = {
  soloMax: 2,
  small: ['fork', 'split', 'detour', 'twin'] as MapShape[],
  smallMax: 4,
  large: ['long', 'trident', 'triple', 'detour', 'fork'] as MapShape[],
};

function shapeFor(floor: Pick<FloorSpec, 'enemyIds' | 'isBoss'>, rng: RNG): MapShape {
  /*
    난수는 **모양을 고르지 않는 층에서도 한 번 뽑는다** — 보스·외길 층이 섞여 있어도
    뒤따르는 지형·접점 난수의 자리가 층마다 같아야 디버깅할 때 읽힌다.
  */
  const roll = rng();
  if (floor.isBoss) return 'arena';
  const n = floor.enemyIds.length;
  if (n <= MAP_SHAPES.soloMax) return 'corridor';
  const pool = n <= MAP_SHAPES.smallMax ? MAP_SHAPES.small : MAP_SHAPES.large;
  return pool[Math.floor(roll * pool.length)];
}

/** 적 종류 — 처음 나온 순서대로, 겹치지 않게 */
function kindsOf(enemyIds: readonly EnemyDefId[]): EnemyDefId[] {
  return [...new Set(enemyIds)];
}

/** 층 맵 — 결정적. 캐시하지 않는다(가볍고, 전역 캐시는 `applyPrep` 오염 같은 사고를 부른다) */
export function floorMapOf(floor: Pick<FloorSpec, 'id' | 'scene' | 'enemyIds' | 'isBoss'>): FloorMap {
  const rng = mapRng(floor.id);
  const shape = shapeFor(floor, rng);
  const def = SHAPE_DEFS[shape];
  const weights = TERRAIN_WEIGHT_BY_SCENE[floor.scene];

  const paths: MapNode[] = def.spots.map(([id, x, y]) => ({
    id, kind: 'path', x, y, tag: weightedTag(rng, weights),
    ...(shape === 'arena' ? { wide: true } : {}),
  }));
  const byId = new Map(paths.map((n) => [n.id, n]));

  const edges: Array<[string, string]> = [];
  const seen = new Set<string>();
  const routes: MapRoute[] = def.routes.map((ids, index) => {
    const chain = ['entry', ...ids, 'exit'];
    for (let i = 0; i < chain.length - 1; i++) {
      const key = `${chain[i]}>${chain[i + 1]}`;
      if (!seen.has(key)) { seen.add(key); edges.push([chain[i], chain[i + 1]]); }
    }
    const options = def.contacts[index];
    return { index, nodeIds: chain, contactId: options[rngInt(rng, options.length)] };
  });

  /*
    적 종류마다 자리를 준다. 어울리는 땅의 빈자리가 있으면 거기, 없으면 아무 빈자리,
    빈자리가 없으면 가장 덜 붐비는 자리에 함께 둔다. 자리는 입구에서 가까운 순으로 본다.
  */
  const order = [...paths].sort((a, b) => a.x - b.x || a.y - b.y);
  const load = new Map(order.map((n) => [n.id, 0]));
  const groups: FloorMap['groups'] = [];
  for (const defId of kindsOf(floor.enemyIds)) {
    const habitat = enemyPlaceOf(defId).habitat;
    const free = order.filter((n) => load.get(n.id) === 0);
    const spot = free.find((n) => habitat.includes(n.tag!))
      ?? free[0]
      ?? order.reduce((a, b) => (load.get(b.id)! < load.get(a.id)! ? b : a));
    load.set(spot.id, load.get(spot.id)! + 1);
    groups.push({ defId, nodeId: spot.id });
    /*
      자리의 땅을 그 적에게 어울리는 땅으로 바꾼다 — "좁은 통로에 슬라임".
      그 자리의 첫 주인만 땅을 정한다(나중에 온 무리가 땅을 뒤집지 않는다).
      난수는 어울리는 땅이 이미 맞아도 뽑는다 — 적 구성이 같으면 뒤의 난수 자리가 같다.
    */
    const pick = habitat.length > 0 ? habitat[rngInt(rng, habitat.length)] : null;
    if (pick && load.get(spot.id) === 1 && !habitat.includes(spot.tag!)) spot.tag = pick;
  }

  /*
    경로마다 접점 지형이 다 같으면 고를 이유가 없다. 앞 경로와 같은 지형의 접점이 있으면
    그 접점만 다른 지형으로 바꾼다 — 경로 선택이 언제나 "다른 싸움터"를 뜻하게 한다.
    (적에게 맞춘 땅보다 이 규칙이 먼저다. 길을 고르는 이유가 지도의 생김새보다 중요하다.)
  */
  const used = new Set<TerrainTag>();
  for (const route of routes) {
    const node = byId.get(route.contactId)!;
    if (used.has(node.tag!)) {
      const free = TERRAIN_TAGS.filter((t) => !used.has(t));
      node.tag = free[rngInt(rng, free.length)];
    }
    used.add(node.tag!);
  }

  const entry: MapNode = { id: 'entry', kind: 'entry', x: 0, y: 0.5, tag: null };
  const exit: MapNode = { id: 'exit', kind: 'exit', x: 1, y: 0.5, tag: null };
  return { floorId: floor.id, shape, nodes: [entry, ...paths, exit], edges, routes, groups };
}

/** 이 자리에 머무는 적 종류 */
export function groupsAt(map: FloorMap, nodeId: string): EnemyDefId[] {
  return map.groups.filter((g) => g.nodeId === nodeId).map((g) => g.defId);
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
