import { describe, it, expect } from 'vitest';
import { klassName } from './klass';
import { klassFor } from './stats';
import { heroes, HERO } from './data/heroes';
import { KLASS_BY_LINEAGE, LINEAGES } from './data/lineages';
import type { HeroDefId, Star } from './types';

const STARS: Star[] = [1, 2, 3, 4, 5, 6];

describe('계열별 클래스 이름', () => {
  // 폰 피드백(2026-10-06)의 원래 결함 — 사제도 ★3이면 "정예병"이었다
  it('사제 ★3은 정예병이 아니라 정예 사제다', () => {
    expect(klassName(HERO.tide, 3, heroes)).toBe('정예 사제');
    expect(klassName(HERO.tide, 3, heroes)).not.toBe(klassFor(3));
  });

  it('같은 등급이라도 계열이 다르면 이름이 다르다', () => {
    for (const star of STARS) {
      const names = LINEAGES.map((l) => KLASS_BY_LINEAGE[l][star]);
      expect(new Set(names).size).toBe(LINEAGES.length);
    }
  });

  it('한 계열 안에서 등급마다 이름이 다르다', () => {
    for (const l of LINEAGES) {
      const names = STARS.map((s) => KLASS_BY_LINEAGE[l][s]);
      expect(names.every((n) => n.length > 0)).toBe(true);
      expect(new Set(names).size).toBe(STARS.length);
    }
  });

  it('영웅 12종 전부가 표에 있는 계열을 갖는다', () => {
    const all = Object.values(heroes);
    expect(all.length).toBe(12);
    for (const def of all) {
      expect(LINEAGES).toContain(def.lineage);
      expect(klassName(def.id, 1, heroes)).toBe(KLASS_BY_LINEAGE[def.lineage][1]);
    }
  });

  it('쓰이지 않는 계열이 없다', () => {
    const used = new Set(Object.values(heroes).map((d) => d.lineage));
    expect([...used].sort()).toEqual([...LINEAGES].sort());
  });

  it('승급하면 같은 계열의 다음 이름으로 올라간다', () => {
    expect(STARS.map((s) => klassName(HERO.ashen, s, heroes))).toEqual([
      '수습 검사', '검사', '정예 검사', '검객', '검호', '검성',
    ]);
  });

  // save.ts는 defId를 도감과 대조하지 않는다(identity.ts displayName과 같은 이유)
  it('도감에 없는 defId는 등급 이름으로 폴백한다', () => {
    expect(klassName('h_ghost' as HeroDefId, 4, heroes)).toBe(klassFor(4));
  });
});
