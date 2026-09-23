import { describe, it, expect } from 'vitest';
import { deriveTemper, temperOf } from './temperament';
import { TEMPERS, TEMPER_BY_ID } from './data/temperaments';
import { STREAM } from './rng';
import type { HeroInstance, Star } from './types';

const inst = (seed: number | undefined, star: Star): HeroInstance => ({
  instId: `h#${seed}` as any,
  defId: 'h_ashen' as any,
  star,
  klass: '초보자' as any,
  level: 1,
  exp: 0,
  seed,
  currentHp: 0,
  isDead: false,
  acquiredAtFloor: 1,
});

describe('기질 — 결정성', () => {
  it('같은 시드면 항상 같은 기질이다', () => {
    for (let s = 0; s < 200; s++) {
      expect(deriveTemper(s)).toBe(deriveTemper(s));
    }
  });

  it('seed가 없으면 null이다 (옛 세이브)', () => {
    expect(deriveTemper(undefined)).toBeNull();
    expect(temperOf(inst(undefined, 3))).toBeNull();
  });

  it('승급해도 기질은 안 바뀐다 — 성격은 등급이 아니라 사람에 붙는다', () => {
    for (let s = 0; s < 100; s++) {
      const a = temperOf(inst(s, 1));
      for (const star of [2, 3, 4, 5, 6] as Star[]) {
        expect(temperOf(inst(s, star))).toBe(a);
      }
    }
  });
});

describe('기질 — 분포', () => {
  it('8종이 전부 나오고 어느 하나가 쏠리지 않는다', () => {
    const count = new Map<string, number>();
    const N = 4000;
    for (let s = 0; s < N; s++) {
      const t = deriveTemper(s)!;
      count.set(t.id, (count.get(t.id) ?? 0) + 1);
    }
    expect(count.size).toBe(TEMPERS.length);
    for (const c of count.values()) {
      // 균등이면 12.5%. 8~17% 안에 있어야 한다
      expect(c / N).toBeGreaterThan(0.08);
      expect(c / N).toBeLessThan(0.17);
    }
  });
});

describe('기질 — 데이터', () => {
  it('id가 유일하고 조회표와 일치한다', () => {
    const ids = TEMPERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEMPERS) expect(TEMPER_BY_ID[t.id]).toBe(t);
  });

  it('스트림 번호는 고정이다 — 바꾸면 기존 개체의 성격이 전부 바뀐다', () => {
    expect(STREAM.TEMPER).toBe(43);
    expect(STREAM.VOICE).toBe(47);
    // 기존 스트림과 겹치지 않는다
    const others = [STREAM.POTENTIAL, STREAM.REVEAL, STREAM.LOOT, STREAM.QUEST,
      STREAM.VARIANT, STREAM.ADVENTURE, STREAM.ORIGIN];
    expect(others).not.toContain(STREAM.TEMPER);
    expect(others).not.toContain(STREAM.VOICE);
  });
});
