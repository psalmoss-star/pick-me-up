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

/**
 * 갓 얻은 개체의 하한 (STEP 33).
 *
 * ⚠️ **`npm run sim`·`climb-check`은 이 구간을 구조적으로 못 잡는다.**
 * 두 도구의 파티는 전부 잘 키운 상태(★2 Lv.15, ★4 Lv.50)라 저레벨을 밟지 않는다.
 * 실제로 이 결함이 있는 채로 두 도구의 표가 완전히 정상이었다 —
 * 실기기의 상태창에서 "갓 뽑은 ★4의 atk이 6"으로 처음 드러났다.
 * 그래서 여기서 테스트로 잠근다.
 */
describe('신규 개체 하한 — 등급이 높을수록 강하게 시작해야 한다', () => {
  const STARS = [1, 2, 3, 4, 5, 6] as const;

  it('Lv.1 전투 스탯이 등급을 따라 단조 증가한다', () => {
    const atk = STARS.map((s) => computeHeroStats(ashen, s, 1, starScaling).atk);
    expect(atk).toEqual([...atk].sort((a, b) => a - b));
    // 예전에는 ★1이 12, ★4·★5가 6이었다 — 거꾸로였다
    expect(atk[4]).toBeGreaterThan(atk[0]);
  });

  it('Lv.1 HP도 등급을 따라 단조 증가한다', () => {
    const hp = STARS.map((s) => computeHeroStats(ashen, s, 1, starScaling).hp);
    expect(hp).toEqual([...hp].sort((a, b) => a - b));
  });

  it('갓 뽑은 개체도 상한의 일부는 채워져 있다', () => {
    for (const s of STARS) {
      const a = computeAttributes(ashen, s, 1, starScaling);
      for (const k of ['str', 'int', 'vit', 'agi'] as const) {
        // 1로 바닥을 치던 값이 실제 비율을 갖는다
        expect(a[k].current).toBeGreaterThan(a[k].max * 0.2);
      }
    }
  });

  /**
   * 하한이 육성을 대체하면 안 된다 — 갓 뽑은 고등급이 만렙 저등급을 이기면
   * 레벨을 올릴 이유가 사라진다.
   */
  it('갓 뽑은 ★5가 만렙 ★2보다 강하지 않다 — 육성이 의미를 잃으면 안 된다', () => {
    const fresh5 = computeHeroStats(ashen, 5, 1, starScaling);
    const maxed2 = computeHeroStats(ashen, 2, starScaling[2].maxLevel, starScaling);
    expect(fresh5.atk).toBeLessThan(maxed2.atk);
  });

  it('만렙 도달은 여전히 상한을 정확히 채운다', () => {
    for (const s of STARS) {
      expect(isAtCap(computeAttributes(ashen, s, starScaling[s].maxLevel, starScaling))).toBe(true);
    }
  });

  it('하한이 걸려도 레벨을 올리면 계속 강해진다', () => {
    const lv = [1, 20, 40, 60].map((l) => computeHeroStats(ashen, 4, l, starScaling).atk);
    expect(lv).toEqual([...lv].sort((a, b) => a - b));
    expect(lv[3]).toBeGreaterThan(lv[0]);
  });
});
