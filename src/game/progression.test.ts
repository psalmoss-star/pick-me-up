import { describe, it, expect } from 'vitest';
import {
  canFuse, canPromote, expToNext, fuse, fuseEfficiency,
  gainExp, needsPromotion, promote, sacrificeValue,
} from './progression';
import { computeHeroStats, klassFor } from './stats';
import { heroes, starScaling, HERO } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star, Wallet } from './types';

const hero = (defId: HeroDefId, star: Star, level: number, n = 1): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const W = (o: Partial<Wallet> = {}): Wallet =>
  ({ gold: 0, gems: 0, promotionStones: 0, awakeningStones: 0, revivalTokens: 0, ...o });

describe('경험치', () => {
  it('요구 경험치는 레벨과 등급에 따라 증가한다', () => {
    expect(expToNext(1, 5)).toBeLessThan(expToNext(1, 10));
    expect(expToNext(1, 5)).toBeLessThan(expToNext(5, 5));
  });

  it('경험치를 주면 레벨이 오른다', () => {
    const r = gainExp(hero(HERO.ashen, 1, 1), 500, starScaling);
    expect(r.levelsGained).toBeGreaterThan(0);
    expect(r.hero.level).toBeGreaterThan(1);
  });

  it('해당 등급 만렙을 넘지 않는다', () => {
    const r = gainExp(hero(HERO.ashen, 1, 1), 9_999_999, starScaling);
    expect(r.hero.level).toBe(starScaling[1].maxLevel);
    expect(r.hitMaxLevel).toBe(true);
  });

  it('만렙에서 넘친 경험치는 버려지고 그 양이 보고된다', () => {
    const r = gainExp(hero(HERO.ashen, 1, 10), 5000, starScaling);
    expect(r.levelsGained).toBe(0);
    expect(r.wastedExp).toBe(5000);
  });

  it('경험치가 부족하면 레벨은 그대로이고 exp만 쌓인다', () => {
    const h = hero(HERO.ashen, 1, 1);
    const r = gainExp(h, 10, starScaling);
    expect(r.hero.level).toBe(1);
    expect(r.hero.exp).toBe(10);
  });

  it('원본 객체를 변경하지 않는다', () => {
    const h = hero(HERO.ashen, 1, 1);
    gainExp(h, 5000, starScaling);
    expect(h.level).toBe(1);
  });
});

describe('승급', () => {
  it('만렙이 아니면 승급할 수 없다', () => {
    const c = canPromote(hero(HERO.ashen, 1, 5), W({ promotionStones: 99 }), starScaling);
    expect(c.ok).toBe(false);
    if (!c.ok && c.reason === 'level') expect(c.needLevel).toBe(10);
  });

  it('재료가 부족하면 승급할 수 없고 부족분을 알려준다', () => {
    const c = canPromote(hero(HERO.ashen, 1, 10), W({ promotionStones: 0 }), starScaling);
    expect(c.ok).toBe(false);
    if (!c.ok && c.reason === 'materials') expect(c.missing.promotionStones).toBe(1);
  });

  it('조건을 갖추면 승급하고 재료가 차감된다', () => {
    const r = promote(hero(HERO.ashen, 1, 10), W({ promotionStones: 5 }), starScaling);
    expect('toStar' in r).toBe(true);
    if ('toStar' in r) {
      expect(r.toStar).toBe(2);
      expect(r.hero.klass).toBe('견습병');
      expect(r.wallet.promotionStones).toBe(4);
    }
  });

  it('승급하면 레벨이 1로 리셋된다 — 즉각적 보상이 아니라 투자다', () => {
    const r = promote(hero(HERO.ashen, 1, 10), W({ promotionStones: 5 }), starScaling);
    if ('toStar' in r) {
      expect(r.hero.level).toBe(1);
      const before = computeHeroStats(heroes[HERO.ashen], 1, 10, starScaling);
      const after = computeHeroStats(heroes[HERO.ashen], 2, 1, starScaling);
      expect(after.atk).toBeLessThan(before.atk);
    }
  });

  it('★5→★6은 각성석을 요구한다', () => {
    const c = canPromote(hero(HERO.ashen, 5, 80), W({ promotionStones: 999 }), starScaling);
    expect(c.ok).toBe(false);
    if (!c.ok && c.reason === 'materials') expect(c.missing.awakeningStones).toBe(1);
    const c2 = canPromote(hero(HERO.ashen, 5, 80), W({ awakeningStones: 1 }), starScaling);
    expect(c2.ok).toBe(true);
  });

  it('★6은 더 승급할 수 없다', () => {
    const c = canPromote(hero(HERO.ashen, 6, 99), W({ awakeningStones: 99 }), starScaling);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('max-star');
  });

  it('전 등급을 순차 승급해도 어디서도 막히지 않는다', () => {
    let h = hero(HERO.ashen, 1, 1);
    let w = W({ promotionStones: 999, awakeningStones: 9 });
    for (let s = 1; s <= 5; s++) {
      h = gainExp(h, 9_999_999, starScaling).hero;
      const r = promote(h, w, starScaling);
      expect('toStar' in r, `★${s}에서 승급 실패`).toBe(true);
      if ('toStar' in r) { h = r.hero; w = r.wallet; }
    }
    expect(h.star).toBe(6);
    expect(h.klass).toBe('영웅');
  });

  it('능력치가 상한에 닿으면 승급 필요 신호가 켜진다', () => {
    expect(needsPromotion(hero(HERO.ashen, 1, 10), heroes[HERO.ashen], starScaling)).toBe(true);
    expect(needsPromotion(hero(HERO.ashen, 1, 5), heroes[HERO.ashen], starScaling)).toBe(false);
  });
});

describe('합성', () => {
  it('같은 영웅을 제물로 삼을 수 없다', () => {
    const h = hero(HERO.ashen, 1, 5);
    const c = canFuse(h, h, starScaling);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('same-hero');
  });

  it('사망한 영웅은 제물이 될 수 없다', () => {
    const c = canFuse(hero(HERO.ashen, 1, 5), { ...hero(HERO.tide, 3, 10, 2), isDead: true }, starScaling);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('sacrifice-dead');
  });

  it('만렙 영웅은 합성 대상이 될 수 없다 (경험치가 버려지므로)', () => {
    const c = canFuse(hero(HERO.ashen, 1, 10), hero(HERO.tide, 3, 10, 2), starScaling);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('target-max-level');
  });

  it('합성하면 대상이 성장하고 제물의 id가 반환된다', () => {
    const target = hero(HERO.ashen, 2, 3);
    const sac = hero(HERO.tide, 3, 20, 2);
    const r = fuse({ target, sacrifice: sac, facilityLevel: 1, scaling: starScaling });
    expect('consumedInstId' in r).toBe(true);
    if ('consumedInstId' in r) {
      expect(r.consumedInstId).toBe(sac.instId);
      expect(r.expGained).toBeGreaterThan(0);
      expect(r.target.level).toBeGreaterThan(target.level);
    }
  });

  it('제물 등급이 높을수록 더 많은 경험치가 나온다', () => {
    const lo = sacrificeValue(hero(HERO.ashen, 1, 10), starScaling);
    const hi = sacrificeValue(hero(HERO.bolt, 5, 10, 2), starScaling);
    expect(hi).toBeGreaterThan(lo);
  });

  it('합성소 레벨이 높을수록 전환율이 좋다', () => {
    expect(fuseEfficiency(1)).toBeLessThan(fuseEfficiency(3));
    expect(fuseEfficiency(3)).toBeLessThanOrEqual(1);
  });

  /**
   * 예전에 `Math.max(1, level)` clamp가 Lv.0을 Lv.1로 끌어올려 둘이 같은 65%였다.
   * 300금짜리 Lv.1 강화가 효과 0인 함정 구매였다 — 실기기 확인에서 드러났다.
   */
  it('미건설(Lv.0)이 Lv.1보다 나쁘다 — 첫 강화가 헛돈이면 안 된다', () => {
    expect(fuseEfficiency(0)).toBeLessThan(fuseEfficiency(1));
  });

  it('레벨이 오를 때마다 전환율이 실제로 오른다', () => {
    for (let lv = 0; lv < 3; lv++) {
      expect(fuseEfficiency(lv)).toBeLessThan(fuseEfficiency(lv + 1));
    }
  });

  it('합성으로도 등급 만렙을 넘지 못한다 — 승급 없이는 벽을 못 넘는다', () => {
    const target = hero(HERO.ashen, 1, 9);
    const r = fuse({ target, sacrifice: hero(HERO.bolt, 5, 80, 2), facilityLevel: 3, scaling: starScaling });
    if ('target' in r) {
      expect(r.target.level).toBe(starScaling[1].maxLevel);
      expect(r.wastedExp).toBeGreaterThan(0); // 초과분은 그냥 사라진다
    }
  });
});
