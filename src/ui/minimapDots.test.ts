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
