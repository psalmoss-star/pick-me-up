import { describe, it, expect } from 'vitest';
import { capsFor, computeAttributes, computeHeroStats, deriveStats, isAtCap, klassFor } from './stats';
import { heroes, starScaling, HERO } from './data/sample';

const ashen = heroes[HERO.ashen];
const bulwark = heroes[HERO.bulwark];
const tide = heroes[HERO.tide];

describe('능력치 — 상한과 채움', () => {
  it('해당 등급 만렙이면 모든 능력치가 상한에 도달한다', () => {
    const a = computeAttributes(ashen, 1, 10, starScaling);
    expect(a.str.current).toBe(a.str.max);
    expect(isAtCap(a)).toBe(true);
  });

  it('만렙 미만이면 상한에 도달하지 않는다', () => {
    expect(isAtCap(computeAttributes(ashen, 1, 5, starScaling))).toBe(false);
  });

  it('current가 max를 절대 넘지 않는다 (레벨을 초과 입력해도)', () => {
    const a = computeAttributes(ashen, 1, 999, starScaling);
    for (const k of ['str', 'int', 'vit', 'agi'] as const) {
      expect(a[k].current).toBeLessThanOrEqual(a[k].max);
    }
  });

  it('current는 항상 1 이상 (Lv.1에서도 0이 되지 않는다)', () => {
    const a = computeAttributes(tide, 6, 1, starScaling);
    for (const k of ['str', 'int', 'vit', 'agi'] as const) {
      expect(a[k].current).toBeGreaterThanOrEqual(1);
    }
  });

  it('승급하면 상한이 반드시 열린다', () => {
    for (const s of [1, 2, 3, 4, 5] as const) {
      const lo = capsFor(ashen.baseCaps, s, starScaling);
      const hi = capsFor(ashen.baseCaps, (s + 1) as 2, starScaling);
      expect(hi.str).toBeGreaterThan(lo.str);
      expect(hi.vit).toBeGreaterThan(lo.vit);
    }
  });

  it('승급 직후(Lv.1)는 이전 등급 만렙보다 약하다 — 성장 병목이 존재한다', () => {
    const capped = computeHeroStats(ashen, 2, 20, starScaling);
    const fresh = computeHeroStats(ashen, 3, 1, starScaling);
    expect(fresh.atk).toBeLessThan(capped.atk);
  });
});

describe('파생 스탯', () => {
  it('탱커는 HP·DEF가, 딜러는 ATK가 더 높다', () => {
    const tank = computeHeroStats(bulwark, 2, 20, starScaling);
    const dps = computeHeroStats(ashen, 2, 20, starScaling);
    expect(tank.hp).toBeGreaterThan(dps.hp);
    expect(tank.def).toBeGreaterThan(dps.def);
    expect(dps.atk).toBeGreaterThan(tank.atk);
  });

  it('지능형 영웅의 ATK는 지능에서 나온다', () => {
    const a = computeAttributes(tide, 3, 40, starScaling);
    const s = deriveStats(a, 3, 'int');
    expect(s.atk).toBe(a.int.current * 6);
  });

  it('치명타율은 60%를 넘지 않는다', () => {
    const a = computeAttributes(ashen, 6, 99, starScaling);
    expect(deriveStats(a, 6, 'str').crit).toBeLessThanOrEqual(0.6);
  });
});

describe('클래스', () => {
  it('등급이 오르면 클래스가 승격한다', () => {
    expect(klassFor(1)).toBe('초보자');
    expect(klassFor(3)).toBe('정예병');
    expect(klassFor(6)).toBe('영웅');
  });
});
