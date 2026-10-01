# 층 미니맵 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 층 지도를 노드 그래프에서 "위에서 내려다본 지형 미니맵"(격자 지형 면 + ㄱ자 길 + 움직이는 점)으로 바꾸고, 전투 화면 46px 띠를 전장 왼쪽 위 정사각 미니맵(누르면 펼침)으로 대체한다.

**Architecture:** 표시 전용. 순수 함수 두 개(`src/ui/minimapLayout.ts` 배치, `src/ui/minimapDots.ts` 점 좌표)를 SVG 컴포넌트 하나(`src/screens/map/Minimap.tsx`)가 그린다. 브리핑(`RoutePanel`)과 전투(`BattleScreen`)가 같은 컴포넌트를 크기만 달리해 쓴다. 엔진(`src/game/`)·스토어·세이브는 손대지 않는다.

**Tech Stack:** React 19 + TypeScript, SVG, Vitest. 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-01-floor-minimap-design.md`

## Global Constraints

- 표시 전용 — `src/game/` 아래 파일을 수정하지 않는다. `ordersBaseline` 지문·`sim` 표가 그대로여야 한다.
- 색은 `src/ui/tokens.ts` 밖에서 하드코딩하지 않는다(새 팔레트 `MM`을 거기에 둔다). 배경은 항상 어둡게.
- 정보 표시는 `<SystemPanel>`을 통과한다(펼친 지도 포함). 본문 폰트는 상속(명조), 정렬 center.
- 모바일 세로 전용, 375×667 기준. 가로 스크롤 금지. 터치 영역 44px 이상.
- 층 맵은 층 번호에서 결정적이고 저장하지 않는다(`floorMapOf` 원칙) — 미니맵 배치도 같다.
- 지형 면은 언제나 **참**. 정찰 보고는 ✕ 위치만 바꾼다(브리핑). 전투 미니맵은 참 접점.
- 코드 주석은 한국어, 식별자는 영어. 게임 로직을 바꾸면 같은 커밋에 테스트(이번엔 순수 UI 함수 테스트).

## Review Focus

1. **경로 3개 층의 브리핑 라벨** — 위·가운데·아래 줄 지형 이름이 서로/입구·계단 이름과 겹치지 않아야 한다 → Task 3 브라우저 실측(3경로 층을 골라 `getBoundingClientRect`).
2. **적 6기 + 아군 3 + 호위 1의 전투 미니맵** — 점이 격자 밖으로 나가거나 서로 겹치면 안 된다 → Task 2 테스트 "1~100층 최대 인원에서 점이 격자 안·최소 간격".
3. **저장본·화면에서 온 잘못된 경로 번호(route=9)** — 첫 경로로 그려져야 한다 → Task 2 테스트 "범위 밖 경로는 0번".
4. **승리했지만 후퇴 신호로 빠진 영웅** — 계단이 아니라 입구에 있어야 한다 → Task 2 테스트.
5. **지도를 펼친 채 위기 창이 뜸** — 펼친 지도가 닫혀야 한다(위기 창이 우선) → Task 4 브라우저 확인.

---

### Task 1: 미니맵 배치 계산 + 지형 팔레트

**Files:**
- Create: `src/ui/minimapLayout.ts`
- Create: `src/ui/minimapLayout.test.ts`
- Modify: `src/ui/tokens.ts` (파일 끝에 `MM` 추가)

**Interfaces:**
- Consumes: `FloorMap`, `MapNode`, `floorMapOf` from `src/game/floormap.ts`; `TerrainTag` from `src/game/data/terrain.ts`; `FLOORS` from `src/game/data`.
- Produces:
  - `MINIMAP: { cols: 16; rows: 12; terrainRadius: 2.8; edge: 0.5; margin: 1.5 }`
  - `interface MinimapLayout { cols: number; rows: number; cells: Array<TerrainTag | null>; nodes: Array<{ id: string; x: number; y: number }>; roads: Array<{ route: number; points: Array<[number, number]> }> }`
  - `minimapLayout(map: FloorMap): MinimapLayout`
  - `MM: Record<'ground' | TerrainTag, string>` in `tokens.ts`

- [ ] **Step 1: Write the failing test**

`src/ui/minimapLayout.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/minimapLayout.test.ts`
Expected: FAIL — `Failed to resolve import "./minimapLayout"`.

- [ ] **Step 3: Write minimal implementation**

`src/ui/minimapLayout.ts`:

```ts
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
```

`src/ui/tokens.ts` — 파일 끝에 추가(맨 위 import 줄에 `import type { TerrainTag } from '../game/data/terrain';`를 더한다):

```ts
/**
 * 미니맵 지형 팔레트 — 층 지도 전용(2026-10-01).
 *
 * 왜 T와 따로 두는가: 마을 `V`와 같은 이유다 — 장면 전용 색을 T에 섞으면 카드·패널까지 물든다.
 * 전부 명도를 낮췄다. 길(금색)과 점(보라·핏빛)이 그 위에 떠야 지도가 읽힌다.
 */
export const MM: Record<'ground' | TerrainTag, string> = {
  ground: '#0B0A10',
  forest: '#1D3324',
  river: '#172A3D',
  fort: '#36302A',
  narrow: '#2A2530',
  open: '#3A3322',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/minimapLayout.test.ts && npm run typecheck`
Expected: PASS (7 tests), typecheck 무출력.

- [ ] **Step 5: Break it on purpose — the tests must catch it**

`minimapLayout.ts`의 `[branchX, entryY], [branchX, rowY],` 줄을 `[branchX, rowY],`로 바꿔(입구에서 대각선으로 출발) 다시 실행 → "가로 또는 세로" 테스트가 FAIL해야 한다. 확인 후 되돌린다.
`terrainRadius`를 `0.1`로 바꿔 실행 → "노드가 있는 칸의 지형" 또는 "면으로 칠해진다"가 FAIL해야 한다. 되돌린다.

- [ ] **Step 6: Commit**

```bash
git add src/ui/minimapLayout.ts src/ui/minimapLayout.test.ts src/ui/tokens.ts
git commit -m "feat(minimap): 배치 계산 — 격자 지형 면(가까운 경로 노드)·ㄱ자 길, 지형 팔레트 MM"
```

---

### Task 2: 미니맵 점 좌표

**Files:**
- Create: `src/ui/minimapDots.ts`
- Create: `src/ui/minimapDots.test.ts`

**Interfaces:**
- Consumes: `MinimapLayout`, `minimapLayout`, `MINIMAP` (Task 1); `FloorMap`, `clampRoute`, `floorMapOf` from `src/game/floormap.ts`.
- Produces:
  - `type MinimapPhase = 'approach' | 'engage' | 'after'`
  - `type DotSide = 'hero' | 'enemy' | 'guard'`
  - `interface DotUnit { uid: string; side: DotSide; alive: boolean; withdrawn: boolean }`
  - `interface MinimapDot { uid: string; side: DotSide; x: number; y: number; dead: boolean }`
  - `DOT: { gap: 0.7; perRow: 3; entryInset: 0.7; contactOffset: 1.2; enemyWait: 1.6 }`
  - `minimapDots(layout: MinimapLayout, map: FloorMap, route: number, state: { phase: MinimapPhase; units: DotUnit[]; outcome?: 'victory' | 'defeat' }): MinimapDot[]`

- [ ] **Step 1: Write the failing test**

`src/ui/minimapDots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FLOORS, floorAt } from '../game/data';
import { floorMapOf } from '../game/floormap';
import { MINIMAP, minimapLayout } from './minimapLayout';
import { DOT, minimapDots, type DotUnit, type MinimapDot } from './minimapDots';

const unit = (uid: string, side: DotUnit['side'], o: Partial<DotUnit> = {}): DotUnit =>
  ({ uid, side, alive: true, withdrawn: false, ...o });
const party = [unit('A:1', 'hero'), unit('A:2', 'hero'), unit('A:3', 'hero')];
const foes = [unit('E:1', 'enemy'), unit('E:2', 'enemy'), unit('E:3', 'enemy'), unit('E:4', 'enemy')];

const f = floorAt(12);
const map = floorMapOf(f);
const layout = minimapLayout(map);
const at = (id: string) => layout.nodes.find((n) => n.id === id)!;
const contact = at(map.routes[0].contactId);
const near = (d: MinimapDot, x: number, y: number) => Math.hypot(d.x - x, d.y - y) <= 1.5;
const by = (dots: MinimapDot[], uid: string) => dots.find((d) => d.uid === uid)!;

describe('미니맵 점', () => {
  it('점 수 = 유닛 수, 쓰러진 유닛은 dead로 남는다(숨기는 건 화면)', () => {
    const units = [...party, ...foes.slice(0, 3), unit('E:4', 'enemy', { alive: false })];
    const dots = minimapDots(layout, map, 0, { phase: 'engage', units });
    expect(dots).toHaveLength(units.length);
    expect(by(dots, 'E:4').dead).toBe(true);
    expect(by(dots, 'A:1').dead).toBe(false);
  });

  it('출정 전 — 아군은 입구, 적은 접점 오른쪽', () => {
    const dots = minimapDots(layout, map, 0, { phase: 'approach', units: [...party, ...foes] });
    const entry = at('entry');
    for (const p of party) expect(near(by(dots, p.uid), entry.x + DOT.entryInset, entry.y)).toBe(true);
    for (const e of foes) expect(by(dots, e.uid).x).toBeGreaterThan(contact.x);
  });

  it('교전 — 아군은 접점 왼쪽, 적은 접점 오른쪽', () => {
    const dots = minimapDots(layout, map, 0, { phase: 'engage', units: [...party, ...foes] });
    for (const p of party) expect(by(dots, p.uid).x).toBeLessThan(contact.x);
    for (const e of foes) expect(by(dots, e.uid).x).toBeGreaterThan(contact.x);
  });

  it('승리 — 살아 있는 아군은 계단, 쓰러진 아군은 접점에 남는다', () => {
    const units = [unit('A:1', 'hero'), unit('A:2', 'hero', { alive: false }), ...foes.map((e) => ({ ...e, alive: false }))];
    const dots = minimapDots(layout, map, 0, { phase: 'after', units, outcome: 'victory' });
    const exit = at('exit');
    expect(near(by(dots, 'A:1'), exit.x - DOT.entryInset, exit.y)).toBe(true);
    expect(by(dots, 'A:2').x).toBeLessThan(contact.x);
  });

  it('패배 — 계단에 아군이 없다', () => {
    const dots = minimapDots(layout, map, 0, { phase: 'after', units: [...party, ...foes], outcome: 'defeat' });
    const exit = at('exit');
    for (const p of party) expect(near(by(dots, p.uid), exit.x, exit.y)).toBe(false);
  });

  it('후퇴 신호로 빠진 영웅은 입구 — 승리해도 계단으로 가지 않는다', () => {
    const units = [...party.slice(0, 2), unit('A:3', 'hero', { withdrawn: true }), ...foes];
    const entry = at('entry');
    for (const phase of ['engage', 'after'] as const) {
      const dots = minimapDots(layout, map, 0, { phase, units, outcome: 'victory' });
      expect(near(by(dots, 'A:3'), entry.x + DOT.entryInset, entry.y)).toBe(true);
    }
  });

  it('호위 대상은 아군 무리와 함께 움직인다', () => {
    const units = [...party, unit('G:1', 'guard'), ...foes];
    const dots = minimapDots(layout, map, 0, { phase: 'engage', units });
    expect(by(dots, 'G:1').x).toBeLessThan(contact.x);
  });

  it('범위 밖 경로 번호는 첫 경로로 그린다', () => {
    const a = minimapDots(layout, map, 9, { phase: 'engage', units: [...party, ...foes] });
    const b = minimapDots(layout, map, 0, { phase: 'engage', units: [...party, ...foes] });
    expect(a).toEqual(b);
  });

  it('결정적 — 같은 입력이면 같은 좌표(유닛 순서와 무관)', () => {
    const units = [...party, ...foes];
    const a = minimapDots(layout, map, 0, { phase: 'engage', units });
    const b = minimapDots(layout, map, 0, { phase: 'engage', units: [...units].reverse() });
    for (const d of a) expect(by(b, d.uid)).toEqual(d);
  });

  it('1~100층 최대 인원(아군 3·호위 1·적 6 + 후퇴 1)에서 점이 격자 안에 있고 서로 겹치지 않는다', () => {
    const units = [
      unit('A:1', 'hero'), unit('A:2', 'hero'), unit('A:3', 'hero', { withdrawn: true }), unit('G:1', 'guard'),
      ...[1, 2, 3, 4, 5, 6].map((i) => unit(`E:${i}`, 'enemy')),
    ];
    for (const fl of FLOORS) {
      const m = floorMapOf(fl);
      const l = minimapLayout(m);
      for (let r = 0; r < m.routes.length; r++) {
        for (const phase of ['approach', 'engage', 'after'] as const) {
          const dots = minimapDots(l, m, r, { phase, units, outcome: 'victory' });
          for (const d of dots) {
            expect(d.x).toBeGreaterThanOrEqual(0);
            expect(d.x).toBeLessThanOrEqual(MINIMAP.cols);
            expect(d.y).toBeGreaterThanOrEqual(0);
            expect(d.y).toBeLessThanOrEqual(MINIMAP.rows);
          }
          for (let i = 0; i < dots.length; i++) {
            for (let j = i + 1; j < dots.length; j++) {
              expect(Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y)).toBeGreaterThanOrEqual(DOT.gap - 1e-9);
            }
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/minimapDots.test.ts`
Expected: FAIL — `Failed to resolve import "./minimapDots"`.

- [ ] **Step 3: Write minimal implementation**

`src/ui/minimapDots.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/minimapDots.test.ts && npm run typecheck`
Expected: PASS (10 tests).

- [ ] **Step 5: Break it on purpose — the tests must catch it**

`anchorOf`에서 `if (u.withdrawn) return entry;` 줄을 지우고 실행 → "후퇴 신호로 빠진 영웅" FAIL. 되돌린다.
`DOT.gap`을 쓰는 `x:` 줄에서 `* DOT.gap`을 `* 0.2`로 바꿔 실행 → "겹치지 않는다" FAIL. 되돌린다.

- [ ] **Step 6: Commit**

```bash
git add src/ui/minimapDots.ts src/ui/minimapDots.test.ts
git commit -m "feat(minimap): 점 좌표 — 입구·접점·계단 무리, 후퇴는 입구, 쓰러짐은 dead"
```

---

### Task 3: `Minimap` 컴포넌트 + 브리핑 지도 교체

**Files:**
- Create: `src/screens/map/Minimap.tsx`
- Modify: `src/screens/map/RoutePanel.tsx:7,36` (`FloorMapView` → `Minimap`)

**Interfaces:**
- Consumes: `minimapLayout`, `MinimapLayout` (Task 1); `MinimapDot` (Task 2); `MM`, `T` from `src/ui/tokens.ts`; `TERRAIN` from `src/game/data/terrain.ts`; `FloorMap`.
- Produces:
  - `interface MinimapProps { map: FloorMap; route: number; width: number; labels?: boolean; onSelectRoute?: (index: number) => void; contacts?: Array<string | null>; dots?: MinimapDot[] }`
  - `Minimap(props: MinimapProps): JSX.Element` — `<svg role="img" aria-label="층 지도">`

- [ ] **Step 1: Write the component**

`src/screens/map/Minimap.tsx`:

```tsx
import { useMemo } from 'react';
import { MM, T } from '../../ui/tokens';
import { TERRAIN } from '../../game/data/terrain';
import type { FloorMap } from '../../game/floormap';
import { minimapLayout } from '../../ui/minimapLayout';
import type { MinimapDot } from '../../ui/minimapDots';

export interface MinimapProps {
  map: FloorMap;
  /** 고른 경로 — 금색 실선. 나머지는 흐린 점선 */
  route: number;
  /** 픽셀 폭. 높이는 격자 비율(rows/cols)로 정해진다 */
  width: number;
  /** 지형·입구·계단 이름 — 브리핑 크기에서만 */
  labels?: boolean;
  /** 있으면 길을 눌러 경로를 고른다(브리핑) */
  onSelectRoute?: (index: number) => void;
  /** 정찰 보고의 접점(경로 순서, null = 모름). 없으면 참 접점을 그린다 */
  contacts?: Array<string | null>;
  /** 전투 점 — `minimapDots`의 결과 */
  dots?: MinimapDot[];
}

/**
 * 층 미니맵 — 위에서 내려다본 지형도(2026-10-01, 1차 셀프 테스트 "스타크래프트 미니맵처럼").
 *
 * 지형 면은 참이고, ✕만 보고를 따른다. 브리핑(큰 지도, 경로 선택)과 전투(모서리 미니맵·펼친 지도)가
 * 같은 컴포넌트를 크기만 달리해 쓴다 — 두 지도가 같은 모양이어야 "브리핑에서 본 그 길"로 읽힌다.
 */
export function Minimap({ map, route, width, labels, onSelectRoute, contacts: reported, dots }: MinimapProps) {
  const layout = useMemo(() => minimapLayout(map), [map]);
  const { cols, rows } = layout;
  const u = width / cols;
  const H = rows * u;
  const px = (v: number) => v * u;
  const chosen = map.routes[route] ?? map.routes[0];
  const onChosen = new Set(chosen.nodeIds);
  const contacts = new Set(
    reported ? reported.filter((id): id is string => !!id) : map.routes.map((r) => r.contactId),
  );
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const small = !labels;

  return (
    <svg
      viewBox={`0 0 ${width} ${H}`}
      width="100%"
      style={{ display: 'block', maxWidth: width, margin: '0 auto' }}
      role="img"
      aria-label="층 지도"
    >
      <rect width={width} height={H} fill={MM.ground} />
      {/* 지형 면 — 칸 경계에 실금이 안 보이게 반 픽셀 겹친다 */}
      {layout.cells.map((tag, i) => tag && (
        <rect
          key={i}
          x={px(i % cols)} y={px(Math.floor(i / cols))}
          width={u + 0.5} height={u + 0.5}
          fill={MM[tag]}
        />
      ))}

      {/* 길 — 고른 경로를 마지막에 그려 위에 오게 한다 */}
      {[...layout.roads]
        .sort((a, b) => Number(a.route === chosen.index) - Number(b.route === chosen.index))
        .map((road) => {
          const pts = road.points.map(([x, y]) => `${px(x)},${px(y)}`).join(' ');
          const on = road.route === chosen.index;
          return (
            <g key={road.route}>
              <polyline
                points={pts}
                fill="none"
                stroke={on ? T.gold : T.dim}
                strokeWidth={small ? (on ? 1.2 : 0.8) : (on ? 2 : 1.2)}
                strokeDasharray={on ? undefined : small ? '2 2' : '4 4'}
                opacity={on ? 1 : 0.6}
              />
              {/* 누르기 쉬운 두꺼운 투명 선 — 가는 선은 손가락으로 못 누른다 */}
              {onSelectRoute && (
                <polyline
                  points={pts}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={22}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectRoute(road.route)}
                />
              )}
            </g>
          );
        })}

      {layout.nodes.map((p) => {
        const n = byId.get(p.id)!;
        const on = onChosen.has(n.id);
        const r = small ? 2.2 : 6;
        const x = px(p.x);
        const y = px(p.y);
        return (
          <g key={n.id} style={{ pointerEvents: 'none' }}>
            {contacts.has(n.id) ? (
              <g stroke={on ? T.blood : T.dim} strokeWidth={small ? 1.2 : 2.2}>
                <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
                <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} />
              </g>
            ) : (
              <circle
                cx={x} cy={y} r={n.kind === 'path' ? r * 0.6 : r}
                fill={n.kind === 'path' ? (on ? T.frame : T.panelHi) : T.panel}
                stroke={on ? T.gold : T.dim}
                strokeWidth={small ? 0.8 : 1.2}
              />
            )}
            {labels && (
              <text
                x={x} y={y + (n.y > 0.5 ? -11 : 19)}
                textAnchor="middle"
                fontSize={10}
                fill={on ? T.text : T.dim}
                stroke={MM.ground}
                strokeWidth={3}
                paintOrder="stroke"
                style={{ fontFamily: 'inherit' }}
              >
                {n.kind === 'entry' ? '입구' : n.kind === 'exit' ? '계단' : TERRAIN[n.tag!].name}
              </text>
            )}
          </g>
        );
      })}

      {/* 점 — 위치가 바뀌면 직선으로 미끄러져 가고, 쓰러지면 회색이 되어 사라진다 */}
      {dots?.map((d) => {
        const color = d.dead ? T.dim : d.side === 'enemy' ? T.blood : d.side === 'guard' ? T.gold : T.rare;
        const s = u * 0.3;
        return (
          <g
            key={d.uid}
            style={{
              transform: `translate(${px(d.x)}px, ${px(d.y)}px)`,
              transition: 'transform 900ms ease-in-out, opacity 600ms',
              opacity: d.dead ? 0 : 1,
              pointerEvents: 'none',
            }}
          >
            {d.side === 'guard'
              ? <rect x={-s} y={-s} width={s * 2} height={s * 2} transform="rotate(45)" fill={color} />
              : <circle r={s} fill={color} />}
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Swap the briefing map**

`src/screens/map/RoutePanel.tsx`:
- 7행 `import { FloorMapView } from './FloorMapView';` → `import { Minimap } from './Minimap';`
- 36행 `<FloorMapView map={map} route={route} onSelectRoute={onSelectRoute} contacts={report?.contacts} />` →

```tsx
      <Minimap map={map} route={route} width={340} labels onSelectRoute={onSelectRoute} contacts={report?.contacts} />
```

- [ ] **Step 3: Typecheck + full tests**

Run: `npm run typecheck && npm test`
Expected: typecheck 무출력, 전체 통과(1134 + Task 1·2의 17 = 1151).

- [ ] **Step 4: Browser check — 375×667 briefing**

`npm run dev`(백그라운드) → 375×667 → 대기실 `탑 입장` → 현재 층 → 브리핑. 다음을 `browser_evaluate`로 잰다.

```js
() => {
  const svg = document.querySelector('svg[aria-label="층 지도"]');
  const texts = [...svg.querySelectorAll('text')].map((t) => t.getBoundingClientRect());
  let overlaps = 0;
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
  }
  return { svgW: svg.getBoundingClientRect().width, svgH: svg.getBoundingClientRect().height, overlaps, scrollW: document.documentElement.scrollWidth };
}
```

Expected: `overlaps: 0`, `scrollW ≤ 375`.
**경로 3개인 층에서도** 잰다(Review Focus 1). 아래 스크립트로 3경로 층 번호를 찾고, 탑 화면에서 해금된 층이면 열어서 같은 스크립트를 돌린다.
해금된 3경로 층이 없으면 그 사실을 기록해 두고(Task 5 HANDOFF에 적는다) 넘어간다 — 세이브를 조작하지 않는다.

```bash
cat > _shape.mts <<'EOF'
import { FLOORS } from './src/game/data/index.ts';
import { floorMapOf } from './src/game/floormap.ts';
console.log(FLOORS.filter((f) => floorMapOf(f).routes.length === 3).slice(0, 5).map((f) => f.id));
EOF
npx tsx _shape.mts; rm _shape.mts
```

길(투명 선)을 눌러 경로가 바뀌는지, 경로 버튼과 ✕가 함께 바뀌는지 확인한다. 스크린샷을 한 장 읽어 지형 면이 어둡고 길·글자가 읽히는지 눈으로 본다.

- [ ] **Step 5: Commit**

```bash
git add src/screens/map/Minimap.tsx src/screens/map/RoutePanel.tsx
git commit -m "feat(minimap): Minimap 컴포넌트 — 지형 면·ㄱ자 길·✕·점, 브리핑 지도 교체"
```

---

### Task 4: 전투 화면 — 모서리 미니맵·펼친 지도, 띠·`FloorMapView` 제거

**Files:**
- Modify: `src/screens/BattleScreen.tsx` (import 15-17행, 상태 64-72행 근처, 헤더 주석 247행, 띠 270-281행, 전장 284행)
- Delete: `src/screens/map/FloorMapView.tsx`

**Interfaces:**
- Consumes: `Minimap` (Task 3); `minimapLayout` (Task 1); `minimapDots`, `MinimapPhase`, `DotUnit` (Task 2); 기존 `hp`, `withdrawnNow`, `retreatedNow`, `done`, `step`, `crisisOpen`, `floorMap`, `route`, `result`.
- Produces: 없음(화면 끝단).

- [ ] **Step 1: Imports and constants**

`BattleScreen.tsx`:
- `import { FloorMapView } from './map/FloorMapView';` 삭제 → 다음 세 줄로:

```tsx
import { Minimap } from './map/Minimap';
import { minimapLayout } from '../ui/minimapLayout';
import { minimapDots, type DotUnit, type MinimapPhase } from '../ui/minimapDots';
```

- `SIZE` 객체에 두 값을 더한다(주석 포함):

```tsx
  /** 전장 왼쪽 위 미니맵 폭(px). 높이는 격자 비율 3/4 → 72 */
  miniMap: 96,
  /** 펼친 지도 폭(px) — 375에서 좌우 여백 포함해 들어간다 */
  bigMap: 320,
```

- [ ] **Step 2: State, dots, auto-close**

`const [crisisHandled, setCrisisHandled] = useState(false);` 다음 줄에:

```tsx
  /** 미니맵을 크게 펼쳤는가 — 재생은 멈추지 않는다. 위기 창이 뜨면 닫는다(위기 창이 우선) */
  const [mapOpen, setMapOpen] = useState(false);
  const mmLayout = useMemo(() => minimapLayout(floorMap), [floorMap]);
```

`const done = step >= result.events.length && !pending;` 다음에:

```tsx
  useEffect(() => { if (crisisOpen) setMapOpen(false); }, [crisisOpen]);

  /** 미니맵 점 — 화면이 이미 가진 HP·이탈·단계만 읽는다(엔진은 미니맵을 모른다) */
  const mapPhase: MinimapPhase = step === 0 ? 'approach' : done ? 'after' : 'engage';
  const mapDots = useMemo(() => minimapDots(mmLayout, floorMap, route, {
    phase: mapPhase,
    outcome: result.outcome === 'victory' ? 'victory' : 'defeat',
    units: result.roster.map((u): DotUnit => ({
      uid: u.uid,
      side: u.kind,
      alive: (hp[u.uid] ?? u.maxHp) > 0,
      withdrawn: u.kind === 'hero' && (withdrawnNow.has(u.uid) || retreatedNow.has(u.sourceId)),
    })),
  }), [mmLayout, floorMap, route, mapPhase, result, hp, withdrawnNow, retreatedNow]);
```

- [ ] **Step 3: Replace the strip with the corner minimap**

헤더 주석 `{/* 헤더 — 층 정보가 곧 탑 진행도다 (전투 중 미니맵을 두지 않는 이유) */}` → `{/* 헤더 — 층 정보가 곧 탑 진행도다 */}`

"지도 띠" 주석 블록과 그 아래 `<div style={{ border: ..., background: '#08070C', marginBottom: 8 }}> <FloorMapView .../> </div>` 전체를 삭제한다.

전장 div `<div style={{ position: 'relative', border: `1px solid ${T.panelHi}`, overflow: 'hidden', padding: '14px 8px 12px', marginBottom: 10 }}>` 의 padding을 바꾸고, `<Scene kind={floor.scene} />` 바로 다음에 미니맵 버튼을 넣는다:

```tsx
      {/*
        전장 — 왼쪽 위에 미니맵(2026-10-01, 46px 띠를 대체). 적이 3기 이상이면 가운데 정렬된 적 줄이
        미니맵 자리와 겹친다(375 실측) — 그래서 위 여백을 미니맵 높이만큼 늘렸다(14 → 84).
      */}
      <div style={{ position: 'relative', border: `1px solid ${T.panelHi}`, overflow: 'hidden', padding: `${SIZE.miniMap * 0.75 + 12}px 8px 12px`, marginBottom: 10 }}>
        <Scene kind={floor.scene} />

        <button
          onClick={() => setMapOpen(true)}
          aria-label="지도 펼치기"
          style={{
            position: 'absolute', top: 6, left: 6, zIndex: 2,
            width: SIZE.miniMap, height: SIZE.miniMap * 0.75, padding: 0,
            border: `1px solid ${T.panelHi}`, background: 'transparent', cursor: 'pointer',
          }}
        >
          <Minimap map={floorMap} route={route} width={SIZE.miniMap} dots={mapDots} />
        </button>
```

(`SIZE.miniMap * 0.75` = 72 = `MINIMAP.rows / MINIMAP.cols * 96`.)

- [ ] **Step 4: Expanded map overlay**

컴포넌트 반환 JSX의 마지막 닫는 `</div>` 바로 앞에:

```tsx
      {/* 펼친 지도 — 재생은 계속된다. 어디를 눌러도 닫힌다 */}
      {mapOpen && (
        <div
          role="dialog"
          aria-label="층 지도 크게 보기"
          onClick={() => setMapOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50, padding: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${T.void}E6`,
          }}
        >
          <div style={{ width: '100%', maxWidth: SIZE.bigMap + 40 }}>
            <SystemPanel compact>
              <Minimap map={floorMap} route={route} width={SIZE.bigMap} labels dots={mapDots} />
              <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>눌러서 닫기</div>
            </SystemPanel>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Delete the old view, typecheck, tests**

```bash
git rm src/screens/map/FloorMapView.tsx
grep -rn "FloorMapView" src || echo "no refs"
npm run typecheck && npm test
```

Expected: `no refs`, typecheck 무출력, 전체 통과(1151). `ordersBaseline` 포함 — 엔진 무변경이므로 지문 그대로.

- [ ] **Step 6: Browser check — 375×667 battle**

개발 서버 → 브리핑 → `진입`. 재생 첫 순간(`step 0`)과 중간, 끝에서 다음을 잰다.

```js
() => {
  const btn = document.querySelector('button[aria-label="지도 펼치기"]');
  const m = btn.getBoundingClientRect();
  const field = btn.parentElement.getBoundingClientRect();
  const arts = [...btn.parentElement.children].filter((c) => c.tagName === 'DIV')
    .flatMap((row) => [...row.children]).map((k) => k.getBoundingClientRect());
  const hit = arts.filter((a) => a.left < m.right && m.left < a.right && a.top < m.bottom && m.top < a.bottom).length;
  const bs = [...document.querySelectorAll('button')];
  const bottom = Math.max(...bs.map((b) => b.getBoundingClientRect().bottom));
  return { mini: [m.left - field.left, m.top - field.top, m.width, m.height], overlapArts: hit, lastButtonBottom: bottom, scrollW: document.documentElement.scrollWidth };
}
```

Expected: `mini ≈ [7, 7, 96, 72]`, `overlapArts: 0`, `lastButtonBottom ≤ 667`, `scrollW ≤ 375`.
점: 첫 순간 아군 점이 입구, 재생 중 접점 양쪽, 승리 후 계단으로 가는지 스크린샷 두 장(교전·끝)으로 본다.
펼치기: 미니맵을 누르면 `[role=dialog]`가 뜨고 재생이 계속되는지(`TURN` 숫자 증가), 누르면 닫히는지.
**Review Focus 5:** 위기 창이 뜨는 전투(겁많음 정찰자 + 강한 층)에서 펼친 채 기다려 위기 창이 뜰 때 `[role=dialog]`가 사라지는지.
**Review Focus 1:** Task 3에서 못 본 3경로 층이 있으면 `floorMapOf` 모양이 (3,2)인 층을 브리핑에서 열어 라벨 겹침 스크립트(Task 3 Step 4)를 다시 돌린다. 해금 안 된 층이면 개발 세이브로 못 가므로 그 사실을 HANDOFF에 적는다.

- [ ] **Step 7: Commit**

```bash
git add src/screens/BattleScreen.tsx
git commit -m "feat(minimap): 전투 — 전장 모서리 미니맵·펼친 지도, 46px 띠와 FloorMapView 제거"
```

---

### Task 5: 문서

**Files:**
- Modify: `docs/HANDOFF.md` (STEP 63 다음에 STEP 64, 셀프 테스트 지적 2번에 "→ STEP 64")
- Modify: `CLAUDE.md` (디렉토리 목록 `ui/`에 `minimapLayout.ts`·`minimapDots.ts`, 테스트 수, 층 맵 규칙에 한 줄)

- [ ] **Step 1: CLAUDE.md**

`ui/` 목록의 `iso.ts` 줄 다음에:

```
│  ├─ minimapLayout.ts # 층 미니맵 배치(순수) — 격자 지형 면(가까운 경로 노드)·ㄱ자 길. 지형은 언제나 참
│  ├─ minimapDots.ts   # 미니맵 점 좌표(순수) — 재생 상태에서 파생. 엔진은 미니맵을 모른다
```

`screens/` 목록에 `map/Minimap.tsx`가 없으면 `# / BattleScreen ...` 근처 주석에 `map/Minimap(브리핑·전투 공용 지도)`를 더한다. "층 맵(STEP 59)" 규칙 단락 끝에:

```
  **미니맵(STEP 64)은 표시 전용이다** — 지형 면은 참, ✕만 보고를 따른다. 점은 `minimapDots`가 화면 상태(HP·이탈·단계)에서만 만든다.
  엔진에 위치를 넣는 것은 사용자 결정으로 하지 않았다(2026-10-01) — 넣으면 1~100층 승률표를 다시 잰다.
```

`npm test` 줄의 현재 개수를 Task 4 Step 5의 실제 숫자로 바꾼다.

- [ ] **Step 2: HANDOFF.md STEP 64**

STEP 63 섹션 다음(`---` 앞)에 STEP 63과 같은 형식(배경 · 만든 것 표 · 설계 판단 · 알아둘 것 · 결과)으로 쓴다. 반드시 들어갈 사실:
- 사용자 결정 3개(표시 전용 · 전장 모서리 · A안 격자).
- 계획 단계 수정 2개(직선 이동, CSS 투명도로 지우기)와 이유.
- 전장 위 여백 14 → 84 이유(적 3기 이상이면 겹침, 실측)와 Task 4 Step 6의 실측 숫자.
- 브리핑 지도 높이 140~184 → 255(브리핑은 원래 스크롤 화면).
- 일부러 깨 본 4건과 결과.
- 3경로 층 라벨 실측 결과(또는 못 본 이유).

셀프 테스트 지적 목록 2번 줄 끝에 ` → STEP 64에서 처리(표시 전용).`를 붙인다.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/HANDOFF.md
git commit -m "docs: 층 미니맵 STEP 64 — HANDOFF·CLAUDE.md 규칙"
```
