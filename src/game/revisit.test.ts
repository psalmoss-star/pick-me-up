import { describe, it, expect } from 'vitest';
import { revisitMultiplier } from './data/revisit';

describe('revisitMultiplier', () => {
  it('최전선 첫 도전은 정확히 1.0이다', () => {
    // ⚠️ 이게 기준선 보존의 증거다. 1.0이 아니면 기존 밸런스가 통째로 움직인다.
    expect(revisitMultiplier(90, 90, 0)).toBe(1);
    expect(revisitMultiplier(1, 1, 0)).toBe(1);
  });

  it('최전선에서 멀수록 깎인다', () => {
    const near = revisitMultiplier(89, 90, 0);
    const far = revisitMultiplier(50, 90, 0);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThan(1);
  });

  it('거리 계수는 하한 0.15에서 멈춘다', () => {
    // 1층 파밍이 무의미해지되 0은 아니다 — 0이면 죽은 칸이 된다
    expect(revisitMultiplier(1, 100, 0)).toBeCloseTo(0.15, 5);
  });

  it('같은 층을 반복하면 깎인다', () => {
    const first = revisitMultiplier(90, 90, 0);
    const second = revisitMultiplier(90, 90, 1);
    const third = revisitMultiplier(90, 90, 2);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it('횟수 계수는 하한 0.3에서 멈춘다', () => {
    const many = revisitMultiplier(90, 90, 99);
    expect(many).toBeCloseTo(0.3, 5);
  });

  it('단조감소한다 — 반복할수록 이득이 늘지 않는다', () => {
    let prev = Infinity;
    for (let n = 0; n < 10; n += 1) {
      const cur = revisitMultiplier(90, 90, n);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  it('배수는 항상 0보다 크고 1 이하다', () => {
    for (let floor = 1; floor <= 100; floor += 7) {
      for (let n = 0; n < 5; n += 1) {
        const m = revisitMultiplier(floor, 100, n);
        expect(m).toBeGreaterThan(0);
        expect(m).toBeLessThanOrEqual(1);
      }
    }
  });
});
