import { describe, expect, it } from 'vitest';
import { advanceReveal, estimatePotential, stageOf } from './reveal';
import { derivePotential, potentialScore } from './potential';
import { REVEAL_TUNING as R } from './data/potential';
import { klassFor } from './stats';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const mk = (seed: number | undefined, progress: number, star: Star = 2): HeroInstance => ({
  instId: 'i1' as HeroInstId,
  defId: 'd1' as HeroDefId,
  star,
  klass: klassFor(star),
  level: 10,
  exp: 0,
  seed,
  revealProgress: progress,
  currentHp: 0,
  isDead: false,
  acquiredAtFloor: 1,
});

describe('stageOf', () => {
  it('진행도에 따라 단계가 올라간다', () => {
    expect(stageOf(0)).toBe('unknown');
    expect(stageOf(0.3)).toBe('vague');
    expect(stageOf(0.6)).toBe('narrowing');
    expect(stageOf(1)).toBe('confident');
  });
});

describe('estimatePotential — 정보 은닉', () => {
  it('진행도 0이면 아무것도 알려주지 않는다', () => {
    const e = estimatePotential(mk(12345, 0));
    expect(e.stage).toBe('unknown');
    expect(e.range).toBeNull();
    expect(e.label).toContain('판단 불가');
  });

  it('시드가 없는 개체(구 세이브)는 판단 불가로 처리한다', () => {
    expect(estimatePotential(mk(undefined, 1)).stage).toBe('unknown');
  });

  it('참값을 문구에 그대로 노출하지 않는다', () => {
    const inst = mk(999, 1);
    const truth = potentialScore(derivePotential(999, 2));
    expect(estimatePotential(inst).label).not.toContain(truth.toFixed(2));
  });

  it('반환 객체에 참값 필드가 없다 (설계서 §3.3)', () => {
    // 뷰 모델에 참값이 실리면 개발자도구로 그냥 읽힌다. 발굴 시스템이 무의미해진다.
    const keys = Object.keys(estimatePotential(mk(999, 1)));
    expect(keys.sort()).toEqual(['label', 'progress', 'range', 'stage']);
  });

  it('완전 발굴에서도 구간이 한 점으로 닫히지 않는다', () => {
    const e = estimatePotential(mk(999, 1));
    expect(e.range!.high - e.range!.low).toBeGreaterThan(0);
  });
});

describe('estimatePotential — 세이브스커밍 방지', () => {
  it('같은 개체를 여러 번 열어도 추정치가 같다', () => {
    const inst = mk(4242, 0.5);
    const runs = Array.from({ length: 20 }, () => estimatePotential(inst));
    for (const r of runs) {
      expect(r.range!.low).toBe(runs[0].range!.low);
      expect(r.label).toBe(runs[0].label);
    }
  });

  it('진행도가 양자화 간격보다 작게 움직이면 추정치가 바뀌지 않는다', () => {
    // 이게 깨지면 유저가 창을 여닫으며 추정치를 재추첨할 수 있다
    const a = estimatePotential(mk(4242, 0.50));
    const b = estimatePotential(mk(4242, 0.50 + R.quantizeStep * 0.3));
    expect(b.range!.low).toBe(a.range!.low);
  });

  it('개체마다 노이즈 방향이 다르다 — 전부 같으면 보정으로 뚫린다', () => {
    const centers = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
      const e = estimatePotential(mk(s * 7919, 0.5));
      const truth = potentialScore(derivePotential(s * 7919, 2));
      return (e.range!.low + e.range!.high) / 2 - truth;
    });
    expect(centers.some((c) => c > 0)).toBe(true);
    expect(centers.some((c) => c < 0)).toBe(true);
  });
});

describe('estimatePotential — 수렴', () => {
  it('진행도가 오르면 구간이 좁아진다', () => {
    const widths = [0.2, 0.5, 0.8, 1.0].map((p) => {
      const e = estimatePotential(mk(31337, p));
      return e.range!.high - e.range!.low;
    });
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThan(widths[i - 1]);
    }
  });

  it('발굴 완료 시 추정 중심이 참값에 가깝다', () => {
    // 여러 개체의 평균 오차로 본다 (개별 개체는 노이즈 방향이 있으므로)
    const errs = Array.from({ length: 200 }, (_, i) => {
      const seed = (i * 2654435761) >>> 0;
      const e = estimatePotential(mk(seed, 1));
      const truth = potentialScore(derivePotential(seed, 2));
      return Math.abs((e.range!.low + e.range!.high) / 2 - truth);
    });
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    expect(mean).toBeLessThan(0.02);
  });

  it('진행도 중간에는 오차가 유의미하게 남는다 — 오판이 가능해야 한다', () => {
    const errs = Array.from({ length: 200 }, (_, i) => {
      const seed = (i * 40503 + 7) >>> 0;
      const e = estimatePotential(mk(seed, 0.3));
      const truth = potentialScore(derivePotential(seed, 2));
      return Math.abs((e.range!.low + e.range!.high) / 2 - truth);
    });
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    expect(mean).toBeGreaterThan(0.02);
  });
});

describe('advanceReveal', () => {
  it('전투 참여로 진행도가 오른다', () => {
    const next = advanceReveal(mk(1, 0), { battles: 1 });
    expect(next.revealProgress).toBeCloseTo(R.perBattle, 6);
  });

  it('층 돌파가 전투보다 더 많이 올려준다', () => {
    const a = advanceReveal(mk(1, 0), { battles: 1 }).revealProgress!;
    const b = advanceReveal(mk(1, 0), { floorsCleared: 1 }).revealProgress!;
    expect(b).toBeGreaterThan(a);
  });

  it('1을 넘지 않는다', () => {
    expect(advanceReveal(mk(1, 0.98), { floorsCleared: 5 }).revealProgress).toBe(1);
  });

  it('증가분이 없으면 같은 객체를 돌려준다 (불필요한 리렌더 방지)', () => {
    const inst = mk(1, 0.5);
    expect(advanceReveal(inst, {})).toBe(inst);
  });

  it('원본을 변경하지 않는다', () => {
    const inst = mk(1, 0.2);
    advanceReveal(inst, { battles: 3 });
    expect(inst.revealProgress).toBe(0.2);
  });

  it('전투를 반복하면 결국 완전 발굴에 도달한다', () => {
    let h = mk(1, 0);
    for (let i = 0; i < 40; i++) h = advanceReveal(h, { battles: 1 });
    expect(h.revealProgress).toBe(1);
    expect(stageOf(h.revealProgress!)).toBe('confident');
  });
});
