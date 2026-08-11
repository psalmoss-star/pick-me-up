import { describe, expect, it } from 'vitest';
import { derivePotential, potentialScore, rollHeroSeed } from './potential';
import { POTENTIAL_TUNING as P } from './data/potential';
import { createRng, STREAM, rngNormal, substream } from './rng';
import type { Star } from './types';

const ALL_STARS: Star[] = [1, 2, 3, 4, 5, 6];

/** 피어슨 상관계수 */
function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}

describe('서브스트림', () => {
  it('같은 시드 + 같은 스트림은 같은 수열을 낸다', () => {
    const a = substream(12345, STREAM.POTENTIAL);
    const b = substream(12345, STREAM.POTENTIAL);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('같은 시드라도 스트림이 다르면 수열이 다르다', () => {
    const p = substream(12345, STREAM.POTENTIAL);
    const r = substream(12345, STREAM.REVEAL);
    expect(p()).not.toBeCloseTo(r(), 6);
  });

  it('인접한 시드가 서로 무관한 수열을 낸다 (mix가 실제로 흩는가)', () => {
    // 시드 1,2,3...이 비슷한 잠재치를 내면 가챠가 연속 뽑기에서 편향된다
    const firsts = [1, 2, 3, 4, 5].map((s) => substream(s, STREAM.POTENTIAL)());
    const spread = Math.max(...firsts) - Math.min(...firsts);
    expect(spread).toBeGreaterThan(0.3);
  });
});

describe('rngNormal — Irwin-Hall 표준정규 근사', () => {
  it('평균 0, 표준편차 1에 가깝다', () => {
    const rng = createRng(777);
    const xs = Array.from({ length: 20000 }, () => rngNormal(rng));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(sd).toBeGreaterThan(0.97);
    expect(sd).toBeLessThan(1.03);
  });

  it('꼬리가 살아 있다 — 잭팟이 존재하려면 ±2σ 밖이 나와야 한다', () => {
    const rng = createRng(888);
    const xs = Array.from({ length: 20000 }, () => rngNormal(rng));
    expect(xs.some((x) => x > 2)).toBe(true);
    expect(xs.some((x) => x < -2)).toBe(true);
  });
});

describe('derivePotential — 결정론', () => {
  it('같은 시드 + 같은 등급은 항상 같은 잠재치를 낸다', () => {
    expect(derivePotential(42, 3)).toEqual(derivePotential(42, 3));
  });

  it('시드가 다르면 잠재치가 다르다 (개체차가 실제로 생긴다)', () => {
    expect(derivePotential(42, 3)).not.toEqual(derivePotential(43, 3));
  });

  it('능력치 4종이 서로 독립이다 — 한 개체 안에서 값이 갈린다', () => {
    // 4종이 전부 같으면 "힘은 좋은데 민첩은 별로"인 개체가 안 나온다
    const anySplit = Array.from({ length: 50 }, (_, i) => derivePotential(i * 7919, 3))
      .some((b) => Math.abs(b.str - b.agi) > 0.05);
    expect(anySplit).toBe(true);
  });

  it('계수는 항상 하한/상한 안에 있다', () => {
    for (let s = 0; s < 3000; s++) {
      for (const star of ALL_STARS) {
        const b = derivePotential(s * 104729, star);
        for (const v of Object.values(b)) {
          expect(v).toBeGreaterThanOrEqual(P.minBonus);
          expect(v).toBeLessThanOrEqual(P.maxBonus);
        }
      }
    }
  });
});

describe('분포 (설계서 §12.3 핵심 지표)', () => {
  /** 등급 분포를 가챠와 무관하게 균등 샘플링해 상관만 본다 */
  const SAMPLE = 24000;
  const sample = Array.from({ length: SAMPLE }, (_, i) => {
    const star = (ALL_STARS[i % 6]) as Star;
    return { star, score: potentialScore(derivePotential(i * 2654435761, star)) };
  });

  it('잠재 계수의 기댓값이 bias와 일치한다 — 승률 중립점이 0이 아니다', () => {
    // 전투가 비선형이라 계수를 0 중심으로 두면 평균 승률이 70%→52.7%로 떨어진다.
    // bias는 그 비대칭을 상쇄하는 값이다 (data/potential.ts 주석 참조).
    const mean = sample.reduce((a, b) => a + b.score, 0) / sample.length;
    expect(Math.abs(mean - P.bias)).toBeLessThan(0.01);
  });

  it('corr(등급, 잠재치 총합) ≈ 0.33 — 보이는 등급은 약한 신호여야 한다', () => {
    // 설계상 기대치 0.329 (shared/unique 3:1에서 유도). 총합은 잡음이 평균화되어
    // 개별(0.300)보다 구조적으로 조금 높다. 자세한 유도는 potential.ts 주석 참조.
    const corr = correlation(sample.map((s) => s.star), sample.map((s) => s.score));
    expect(corr).toBeGreaterThan(0.28);
    expect(corr).toBeLessThan(0.38);
  });

  it('개별 능력치로 재도 상관이 같다 — rho가 재는 각도에 안 흔들려야 한다', () => {
    // 총합만 0.30으로 맞추면 개별은 0.25, 총합은 0.45로 갈라진다 (겪은 버그).
    // 그러면 rho가 튜닝 파라미터로 쓸모가 없어진다.
    const bonuses = Array.from({ length: SAMPLE }, (_, i) => {
      const star = ALL_STARS[i % 6] as Star;
      return { star, b: derivePotential(i * 2654435761, star) };
    });
    for (const k of ['str', 'int', 'vit', 'agi'] as const) {
      const corr = correlation(bonuses.map((x) => x.star), bonuses.map((x) => x.b[k]));
      expect(corr).toBeGreaterThan(0.24);
      expect(corr).toBeLessThan(0.36);
    }
  });

  it('저등급이면서 잠재치 상위 5%인 개체가 실제로 존재한다 (잭팟)', () => {
    const sorted = [...sample].map((s) => s.score).sort((a, b) => b - a);
    const top5 = sorted[Math.floor(sorted.length * 0.05)];

    const low = sample.filter((s) => s.star <= 2);
    const jackpot = low.filter((s) => s.score >= top5).length / low.length;

    // 너무 낮으면 발굴이 신화가 되어 아무도 시도하지 않고,
    // 너무 높으면 등급이 무의미해진다.
    expect(jackpot).toBeGreaterThan(0.005);
    expect(jackpot).toBeLessThan(0.05);
  });

  it('고등급이라고 잠재치가 보장되지는 않는다 — ★5~6에도 하위권이 있다', () => {
    const sorted = [...sample].map((s) => s.score).sort((a, b) => a - b);
    const bottom25 = sorted[Math.floor(sorted.length * 0.25)];
    const high = sample.filter((s) => s.star >= 5);
    const dud = high.filter((s) => s.score <= bottom25).length / high.length;
    expect(dud).toBeGreaterThan(0.05);
  });
});

describe('rollHeroSeed', () => {
  it('부호 없는 32비트 정수를 낸다', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 500; i++) {
      const s = rollHeroSeed(rng);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('연속 호출이 서로 다른 시드를 낸다', () => {
    const rng = createRng(2024);
    const seeds = new Set(Array.from({ length: 500 }, () => rollHeroSeed(rng)));
    expect(seeds.size).toBeGreaterThan(490);
  });
});
