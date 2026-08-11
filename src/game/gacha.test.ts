import { describe, it, expect } from 'vitest';
import { BANNERS, initialGachaState, pull, registerCodex, recordLoss, validateBanner, validatePool } from './gacha';
import { createRng } from './rng';
import { heroes } from './data/sample';
import type { HeroInstance, Wallet } from './types';

// 금 소환(free 배너)도 비용이 생겼으므로 둘 다 채워준다.
// 재화 부족을 시험하는 테스트는 각자 0을 명시해 넘긴다.
const wallet = (gems = 100000, gold = 100000): Wallet =>
  ({ gold, gems, promotionStones: 0, awakeningStones: 0, revivalTokens: 0 });
let n = 0;
const makeId = () => `i${++n}`;

const doPull = (
  bannerKind: 'free' | 'premium', st: any, w: Wallet, seed: number,
  now = 0, roster: HeroInstance[] = [],
) =>
  pull({ banner: BANNERS[bannerKind], wallet: w, gacha: st, pool: heroes, codex: {}, rng: createRng(seed), now, currentFloor: 1, makeId, roster });

describe('확률표 정합성', () => {
  it('모든 배너의 확률 합은 정확히 1.0', () => {
    for (const b of Object.values(BANNERS)) {
      const v = validateBanner(b);
      expect(v.ok, `${b.kind} 합계 ${v.sum}`).toBe(true);
    }
  });
});

describe('풀 커버리지', () => {
  it('모든 배너가 약속한 등급의 영웅이 풀에 존재한다', () => {
    for (const b of Object.values(BANNERS)) {
      const v = validatePool(b, heroes);
      expect(v.ok, `${b.kind} 배너에 ★${v.missingStars.join(',★')} 영웅이 없음`).toBe(true);
    }
  });

  it('풀이 비면 empty-pool로 실패한다 (조용히 넘기지 않는다)', () => {
    const r = pull({
      banner: BANNERS.premium, wallet: wallet(), gacha: initialGachaState(0),
      pool: {} as any, codex: {}, rng: createRng(1), now: 0, currentFloor: 1, makeId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty-pool');
  });
});

describe('등급 분포', () => {
  it('무료 배너는 표기 확률에 수렴한다 (10000회)', () => {
    const counts: Record<number, number> = {};
    let st = initialGachaState(0);
    for (let i = 0; i < 10000; i++) {
      const r = doPull('free', { ...st, freeGachaReadyAt: 0 }, wallet(), i);
      if (r.ok) counts[r.star] = (counts[r.star] ?? 0) + 1;
    }
    expect(counts[1] / 10000).toBeCloseTo(0.6, 1);
    expect(counts[2] / 10000).toBeCloseTo(0.3, 1);
    expect(counts[3] / 10000).toBeCloseTo(0.1, 1);
  });

  it('무료 배너에서는 ★4 이상이 절대 나오지 않는다', () => {
    for (let i = 0; i < 3000; i++) {
      const r = doPull('free', initialGachaState(0), wallet(), i);
      if (r.ok) expect(r.star).toBeLessThanOrEqual(3);
    }
  });

  /**
   * 두 배너의 역할이 겹치면 안 된다.
   * 젬 배너에서 ★3이 나오면 "500젬 쓰고 합성 제물을 뽑았다"가 되어 희소 재화가 헛돈다.
   */
  it('젬 배너에서는 ★4 미만이 절대 나오지 않는다', () => {
    for (let i = 0; i < 3000; i++) {
      const r = doPull('premium', initialGachaState(0), wallet(), i);
      if (r.ok) expect(r.star).toBeGreaterThanOrEqual(4);
    }
  });

  it('두 배너의 등급 구간이 겹치지 않는다', () => {
    const goldStars = Object.entries(BANNERS.free.rates)
      .filter(([, p]) => (p ?? 0) > 0).map(([s]) => Number(s));
    const gemStars = Object.entries(BANNERS.premium.rates)
      .filter(([, p]) => (p ?? 0) > 0).map(([s]) => Number(s));
    expect(Math.max(...goldStars)).toBeLessThan(Math.min(...gemStars));
  });
});

/**
 * 등급과 캐릭터 유형의 분리.
 *
 * 이전에는 pickHeroOfStar가 baseStar로 걸렀고 sample.ts에 별당 1명뿐이라
 * **★3 = 반드시 물결의 세인**이었다. 같은 등급을 여러 번 뽑으면 이름·초상화·역할이
 * 전부 같은 카드가 쌓였다 (사용자가 실제로 겪은 결함).
 */
describe('등급 ↔ 아키타입 독립', () => {
  it('같은 등급에서 서로 다른 유형이 나온다', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const r = doPull('free', initialGachaState(0), wallet(), i);
      if (r.ok && r.star === 3) seen.add(r.hero.defId);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('저등급 원형도 고등급으로 나올 수 있다', () => {
    // h_ashen은 baseStar 1이지만 ★4 배너에서도 나와야 한다
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      const r = doPull('premium', initialGachaState(0), wallet(), i);
      if (r.ok && r.hero.defId === 'h_ashen' && r.star >= 4) found = true;
    }
    expect(found).toBe(true);
  });

  it('모든 아키타입이 뽑힐 수 있다', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const r = doPull('free', initialGachaState(0), wallet(), i);
      if (r.ok) seen.add(r.hero.defId);
    }
    expect(seen.size).toBe(Object.keys(heroes).length);
  });
});

describe('개체 이름', () => {
  it('소환된 영웅은 개체 이름과 이명을 가진다', () => {
    const r = doPull('free', initialGachaState(0), wallet(), 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hero.name).toMatch(/^.+의 .+$/);
    expect(r.hero.title!.length).toBeGreaterThan(0);
  });

  it('roster에 있는 이름은 다시 나오지 않는다', () => {
    const taken = doPull('free', initialGachaState(0), wallet(), 1);
    if (!taken.ok) throw new Error();
    for (let i = 0; i < 200; i++) {
      const r = doPull('free', initialGachaState(0), wallet(), i, 0, [taken.hero]);
      if (r.ok) expect(r.hero.name).not.toBe(taken.hero.name);
    }
  });

  /**
   * ⚠️ 가장 중요한 회귀 테스트.
   *
   * 이름 추첨을 rollHeroSeed 앞에 두면 난수열이 밀려 **소환되는 영웅 전원의
   * 잠재치가 통째로 이동한다.** 아래 값은 이름 기능 도입 **이전**에 측정한 것이며,
   * 하나라도 어긋나면 소비 순서가 깨진 것이다 (gacha.ts의 pull() 주석 참조).
   */
  it('개체 시드가 이름 도입 이전과 동일하다 (난수 소비 순서)', () => {
    const expected: Record<number, number> = {
      1: 2265367787, 2: 1225337227, 3: 1959330548, 42: 3661312704, 777: 826297289,
    };
    for (const [seed, heroSeed] of Object.entries(expected)) {
      const r = doPull('free', initialGachaState(0), wallet(), Number(seed));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.hero.seed).toBe(heroSeed);
    }
  });
});

describe('천장', () => {
  it('60회 안에 반드시 ★5가 나온다', () => {
    let st = initialGachaState(0);
    let w = wallet();
    let got5 = false, pulls = 0;
    while (pulls < 60) {
      const r = doPull('premium', st, w, 777 + pulls);
      if (!r.ok) throw new Error('pull failed: ' + r.reason);
      st = r.gacha; w = r.wallet; pulls++;
      if (r.star === 5) { got5 = true; break; }
    }
    expect(got5).toBe(true);
    expect(pulls).toBeLessThanOrEqual(60);
  });

  it('★5가 나오면 천장 카운터가 리셋된다', () => {
    let st = initialGachaState(0), w = wallet();
    for (let i = 0; i < 60; i++) {
      const r = doPull('premium', st, w, 40000 + i);
      if (!r.ok) break;
      st = r.gacha; w = r.wallet;
      if (r.star === 5) { expect(st.pityCounters.premium).toBe(0); break; }
    }
  });

  it('60회째 천장으로 나온 경우 wasPity가 true', () => {
    // 앞선 59회를 인위적으로 누적시킨 상태
    const st = { ...initialGachaState(0), pityCounters: { free: 0, premium: 59 } };
    const r = doPull('premium', st, wallet(), 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.wasPity).toBe(true);
      expect(r.star).toBe(5);
    }
  });
});

describe('비용과 쿨다운', () => {
  it('젬이 부족하면 실패하고 지갑이 변하지 않는다', () => {
    const w = wallet(100);
    const r = doPull('premium', initialGachaState(0), w, 1);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'insufficient') expect(r.missing.gems).toBe(400);
    expect(w.gems).toBe(100); // 원본 불변
  });

  it('성공하면 젬이 정확히 차감된다', () => {
    const r = doPull('premium', initialGachaState(0), wallet(1000), 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.wallet.gems).toBe(500);
  });

  /**
   * 금 소환에는 쿨다운이 없다 — 금 자체가 제동 장치다.
   * 시간 제한까지 걸면 두 번 막는 셈이라 층을 올라도 뽑을 수가 없다.
   */
  it('금 소환은 쿨다운 없이 연속으로 된다', () => {
    let st = initialGachaState(0);
    let w = wallet();
    for (let i = 0; i < 5; i++) {
      const r = doPull('free', st, w, i, 0); // now를 전혀 안 올려도 계속 성공해야 한다
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      st = r.gacha;
      w = r.wallet;
    }
  });

  it('금이 부족하면 실패하고 지갑이 변하지 않는다', () => {
    const cost = BANNERS.free.cost.gold ?? 0;
    const w = wallet(100000, cost - 1);
    const r = doPull('free', initialGachaState(0), w, 1);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'insufficient') expect(r.missing.gold).toBe(1);
    expect(w.gold).toBe(cost - 1); // 원본 불변
  });

  it('성공하면 금이 정확히 차감된다', () => {
    const cost = BANNERS.free.cost.gold ?? 0;
    const r = doPull('free', initialGachaState(0), wallet(100000, 1000), 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.wallet.gold).toBe(1000 - cost);
  });
});

describe('결과의 무결성', () => {
  it('뽑은 영웅은 Lv.1이고 등급에 맞는 클래스를 갖는다', () => {
    for (let i = 0; i < 200; i++) {
      const r = doPull('premium', initialGachaState(0), wallet(), i);
      if (!r.ok) continue;
      expect(r.hero.level).toBe(1);
      expect(r.hero.star).toBe(r.star);
      expect(r.hero.isDead).toBe(false);
      expect(r.hero.klass).toBeTruthy();
    }
  });

  it('instId는 매번 다르다', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const r = doPull('premium', initialGachaState(0), wallet(), i);
      if (r.ok) ids.add(r.hero.instId);
    }
    expect(ids.size).toBe(100);
  });
});

describe('도감', () => {
  it('첫 획득은 isNewInCodex가 true, 등록 후에는 false', () => {
    const r = doPull('free', initialGachaState(0), wallet(), 9);
    if (!r.ok) throw new Error();
    expect(r.isNewInCodex).toBe(true);
    const codex = registerCodex({}, r.hero, 0);
    const r2 = pull({ banner: BANNERS.free, wallet: wallet(), gacha: initialGachaState(0), pool: heroes, codex, rng: createRng(9), now: 0, currentFloor: 1, makeId });
    if (r2.ok) expect(r2.isNewInCodex).toBe(false);
  });

  it('재획득 시 카운트가 오르고 최고 등급이 유지된다', () => {
    const r = doPull('free', initialGachaState(0), wallet(), 9);
    if (!r.ok) throw new Error();
    let codex = registerCodex({}, r.hero, 0);
    codex = registerCodex(codex, { ...r.hero, star: 1 }, 1);
    const e = codex[r.hero.defId];
    expect(e.timesAcquired).toBe(2);
    expect(e.highestStarReached).toBe(Math.max(r.hero.star, 1));
  });

  it('상실이 기록된다', () => {
    const r = doPull('free', initialGachaState(0), wallet(), 9);
    if (!r.ok) throw new Error();
    const codex = recordLoss(registerCodex({}, r.hero, 0), r.hero.defId);
    expect(codex[r.hero.defId].timesLost).toBe(1);
  });
});
