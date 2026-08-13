import { describe, it, expect } from 'vitest';
import { iso, pts, depth, OX, OY, HW, HH, ZH } from './iso';

describe('iso 투영', () => {
  it('원점은 OX/OY로 간다', () => {
    expect(iso(0, 0, 0)).toEqual([OX, OY]);
  });

  /*
    아이소메트릭의 정의 그 자체 — x는 오른쪽 아래로, y는 왼쪽 아래로 간다.
    부호가 뒤집히면 섬이 거울상이 되어 건물 배치가 전부 반대편에 선다.
  */
  it('x가 늘면 오른쪽 아래로, y가 늘면 왼쪽 아래로 간다', () => {
    expect(iso(1, 0)).toEqual([OX + HW, OY + HH]);
    expect(iso(0, 1)).toEqual([OX - HW, OY + HH]);
  });

  it('z는 화면에서 위로 올린다', () => {
    const ground = iso(2, 2, 0);
    const raised = iso(2, 2, 1);
    expect(raised[0]).toBe(ground[0]);
    expect(raised[1]).toBe(ground[1] - ZH);
  });

  /*
    ⚠️ 이게 깨지면 건물이 공중에 뜬다.
    같은 (x,y)의 z=0은 반드시 같은 점이어야 접지선이 유지된다.
  */
  it('같은 격자의 접지점은 항상 같다', () => {
    expect(iso(3, 4, 0)).toEqual(iso(3, 4, 0));
    expect(iso(3, 4, 5)[0]).toBe(iso(3, 4, 0)[0]);
  });
});

describe('depth', () => {
  /*
    SVG는 문서 순서가 곧 깊이다. 이 값으로 정렬하지 않으면
    뒤 건물이 앞 건물 위에 얹혀 원근이 무너진다 — z-index로는 못 고친다.
  */
  it('x+y가 클수록 앞이다', () => {
    expect(depth(0, 0)).toBeLessThan(depth(1, 1));
    expect(depth(5, 0)).toBe(depth(0, 5));
  });

  it('정렬하면 뒤에서 앞 순서가 된다', () => {
    const items = [{ x: 4, y: 4 }, { x: 0, y: 0 }, { x: 2, y: 1 }];
    const sorted = [...items].sort((a, b) => depth(a.x, a.y) - depth(b.x, b.y));
    expect(sorted.map((s) => s.x)).toEqual([0, 2, 4]);
  });
});

describe('pts', () => {
  it('SVG points 문자열로 만든다', () => {
    expect(pts([[0, 0], [10, 20]])).toBe('0.0,0.0 10.0,20.0');
  });

  it('소수점 1자리로 자른다 (문자열이 무한정 길어지지 않게)', () => {
    expect(pts([[1.23456, 2.9999]])).toBe('1.2,3.0');
  });
});
