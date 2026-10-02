/**
 * 모험 판정 — 순수 로직.
 *
 * 지키려는 것:
 *   1. 결정론 — 같은 시드·같은 입력이면 결과가 완전히 같다
 *   2. **"안 내보내는 게 이득"이 아니다** — 모험 exp가 참전 exp를 넘지 않는다
 *   3. 각성석은 균열에서만, 그것도 확률로
 *   4. 실패는 부상뿐이고 **사망은 없다**
 */
import { describe, it, expect } from 'vitest';
import {
  adventureRng, battlesRemaining, dispatchedHeroIds, isComplete, legLine,
  resolveAdventure, successChance,
} from './adventure';
import {
  ADVENTURE_BY_ID, ADVENTURE_DEFS, ADVENTURE_SUCCESS_MAX, adventuresFor,
  type AdventureId, type Dispatch,
} from './data/adventures';
import { FLOORS, floorRewards } from './data/floors';
import { klassFor } from './stats';
import { HERO } from './data/sample';
import { GEAR_DEFS } from './data/gear';
import type { HeroInstId, HeroInstance } from './types';

function hero(level: number, n = 0): HeroInstance {
  return {
    instId: `h#${n}` as HeroInstId,
    defId: HERO.ashen,
    star: 2,
    klass: klassFor(2),
    level,
    exp: 0,
    currentHp: 0,
    isDead: false,
    acquiredAtFloor: 1,
  };
}

const MINE = 'adv_mine' as AdventureId;
const RIFT = 'adv_rift' as AdventureId;

const dispatchOf = (advId: AdventureId, startedAtBattle = 0, n = 2): Dispatch => ({
  advId,
  heroIds: Array.from({ length: n }, (_, i) => `h#${i}` as HeroInstId),
  startedAtBattle,
});

const resolve = (advId: AdventureId, seed: number, level = 10, startedAtBattle = 0) =>
  resolveAdventure({
    dispatch: dispatchOf(advId, startedAtBattle),
    heroes: [hero(level, 0), hero(level, 1)],
    rng: adventureRng(seed, advId, startedAtBattle),
    tier: 1,
  });

describe('모험 — 결정론', () => {
  it('같은 시드·같은 입력이면 결과가 완전히 같다', () => {
    for (const seed of [1, 42, 999]) {
      const a = resolve(RIFT, seed);
      const b = resolve(RIFT, seed);
      expect(a).toEqual(b);
    }
  });

  it('시드가 다르면 결과가 갈린다 — 판정이 실제로 무작위다', () => {
    const results = new Set<boolean>();
    for (let seed = 0; seed < 40; seed++) results.add(resolve(RIFT, seed).success);
    expect(results.size).toBe(2);
  });

  it('파견 시점(startedAtBattle)이 다르면 결과가 갈린다 — 같은 모험 반복이 복사되지 않는다', () => {
    const results = new Set<boolean>();
    for (let b = 0; b < 40; b++) results.add(resolve(RIFT, 7, 10, b).success);
    expect(results.size).toBe(2);
  });
});

describe('모험 — 함정2: "안 내보내는 게 이득"이 되면 안 된다', () => {
  /**
   * ⚠️ **이 테스트가 이 파일에서 가장 중요하다.**
   *
   * `facilities.ts:80` — "참전 영웅과 경쟁하지 않도록 작게 잡는다. 이게 크면
   * '안 내보내는 게 이득'이 되어 퍼머데스의 긴장이 사라진다."
   *
   * 참전 exp는 층 비례라 **1층이 가장 낮다**(6턴 기준 120). 즉 1층조차 넘지 못해야
   * 어느 구간에서도 파견이 등반보다 낫지 않다. 층 깊이에 비례하는 exp를 주면
   * 여기서 잡힌다.
   */
  it('모험 exp 총량이 같은 전투 수를 1층에서 싸운 exp보다 적다', () => {
    const floor1 = FLOORS.find((f) => f.id === 1)!;
    const SHORT_BATTLE = 6; // 실측 전투는 6~12턴. 하한을 쓴다 = 가장 불리한 비교
    const perBattle = floorRewards(floor1, SHORT_BATTLE).exp;
    expect(perBattle).toBeGreaterThan(0);

    for (const def of ADVENTURE_DEFS) {
      const climbing = perBattle * def.duration;
      expect(def.reward.exp, `${def.name}`).toBeLessThan(climbing);
    }
  });

  it('모험 exp는 정액이다 — 층 깊이를 인자로 받지 않는다', () => {
    // 깊은 층에서 보낸 것과 1층에서 보낸 것이 같아야 한다.
    // resolveAdventure는 층을 아예 모르므로 시그니처가 이 규칙을 강제한다
    const deep = resolve(RIFT, 5, 50);
    const shallow = resolve(RIFT, 5, 50);
    expect(deep.expEach).toBe(shallow.expEach);
    expect(deep.expEach).toBe(ADVENTURE_BY_ID[RIFT].reward.exp);
  });
});

describe('모험 — 보상', () => {
  it('실패하면 빈손이고 부상만 남는다 — 사망은 없다', () => {
    const fails = Array.from({ length: 60 }, (_, s) => resolve(RIFT, s))
      .filter((o) => !o.success);
    expect(fails.length).toBeGreaterThan(0);
    for (const o of fails) {
      expect(o.materials).toEqual({});
      expect(o.awakeningStones).toBe(0);
      expect(o.expEach).toBe(0);
      expect(o.injuryRatio).toBeGreaterThan(0);
      // 부상은 최대 HP 비율이며 1 미만이다 — 1이면 그게 곧 사망이다
      expect(o.injuryRatio).toBeLessThan(1);
    }
  });

  it('성공하면 재료가 들어오고 부상이 없다', () => {
    const wins = Array.from({ length: 60 }, (_, s) => resolve(RIFT, s))
      .filter((o) => o.success);
    expect(wins.length).toBeGreaterThan(0);
    for (const o of wins) {
      expect(Object.keys(o.materials).length).toBeGreaterThan(0);
      expect(o.injuryRatio).toBe(0);
      expect(o.expEach).toBeGreaterThan(0);
    }
  });

  it('각성석은 균열에서만 나온다 — ★5의 유일한 통로', () => {
    let mineStones = 0;
    let riftStones = 0;
    for (let s = 0; s < 200; s++) {
      mineStones += resolve(MINE, s).awakeningStones;
      riftStones += resolve(RIFT, s).awakeningStones;
    }
    expect(mineStones).toBe(0);
    expect(riftStones).toBeGreaterThan(0);
  });

  it('각성석이 흔하지 않다 — 성공한 균열의 절반 이하', () => {
    let wins = 0;
    let stones = 0;
    for (let s = 0; s < 300; s++) {
      const o = resolve(RIFT, s);
      if (o.success) wins++;
      stones += o.awakeningStones;
    }
    expect(stones).toBeLessThanOrEqual(wins / 2);
  });
});

describe('모험 — 성공률', () => {
  it('레벨이 높을수록 성공률이 오른다', () => {
    const def = ADVENTURE_BY_ID[RIFT];
    const low = successChance(def, [hero(1)]);
    const high = successChance(def, [hero(40)]);
    expect(high).toBeGreaterThan(low);
  });

  it('만렙을 보내도 확정이 아니다 — 파견이 수도꼭지가 되면 안 된다', () => {
    for (const def of ADVENTURE_DEFS) {
      expect(successChance(def, [hero(99), hero(99)])).toBeLessThanOrEqual(ADVENTURE_SUCCESS_MAX);
      expect(ADVENTURE_SUCCESS_MAX).toBeLessThan(1);
    }
  });

  it('평균 레벨을 쓴다 — 인원이 많다고 저절로 쉬워지지 않는다', () => {
    const def = ADVENTURE_BY_ID[RIFT];
    const one = successChance(def, [hero(20)]);
    const four = successChance(def, [hero(20), hero(20), hero(20), hero(20)]);
    expect(four).toBeCloseTo(one, 10);
  });

  it('인원이 아무도 없으면 RNG를 소비하지 않고 빈손이다', () => {
    let calls = 0;
    const counting = () => { calls++; return 0; };
    const o = resolveAdventure({ dispatch: dispatchOf(RIFT), heroes: [], rng: counting, tier: 1 });
    expect(calls).toBe(0);
    expect(o.success).toBe(false);
    expect(o.injuryRatio).toBe(0); // 없는 사람을 다치게 할 수 없다
  });
});

describe('모험 — 기간은 전투 횟수다', () => {
  it('소요 전투 수를 채워야 완료된다', () => {
    const def = ADVENTURE_BY_ID[RIFT];
    const d = dispatchOf(RIFT, 10);
    expect(battlesRemaining(d, 10)).toBe(def.duration);
    expect(isComplete(d, 10)).toBe(false);
    expect(isComplete(d, 10 + def.duration - 1)).toBe(false);
    expect(isComplete(d, 10 + def.duration)).toBe(true);
  });

  it('전투 수를 넘겨도 음수가 되지 않는다', () => {
    expect(battlesRemaining(dispatchOf(RIFT, 0), 9999)).toBe(0);
  });

  it('정의가 사라진 모험은 즉시 완료로 본다 — 파견이 영원히 남으면 그게 교착이다', () => {
    const ghost = dispatchOf('adv_ghost' as AdventureId, 0);
    expect(isComplete(ghost, 0)).toBe(true);
  });
});

describe('모험 — 해금', () => {
  it('도달 층에 따라 열린다', () => {
    expect(adventuresFor(1).map((d) => d.id)).toEqual([MINE]);
    expect(adventuresFor(99).length).toBe(ADVENTURE_DEFS.length);
  });

  it('첫 모험은 1층부터 열린다 — 등반 없이는 아무것도 못 하는 상태를 만들지 않는다', () => {
    expect(adventuresFor(1).length).toBeGreaterThan(0);
  });
});

describe('모험 — 파견 명단', () => {
  it('여러 파견의 인원을 합쳐 준다', () => {
    const ids = dispatchedHeroIds([dispatchOf(MINE, 0, 2), dispatchOf(RIFT, 1, 3)]);
    expect(ids.size).toBe(3); // h#0..h#2 — 겹치는 것은 한 번만
    expect(ids.has('h#2' as HeroInstId)).toBe(true);
  });
});

describe('원정 진행 문장', () => {
  it('모든 모험의 구간 문장 수가 소요 전투 수와 같다', () => {
    for (const def of ADVENTURE_DEFS) {
      expect(def.legs.length, def.name).toBe(def.duration);
    }
  });

  /**
   * ⚠️ 결과는 파견 순간 사실상 정해진다(파견자는 레벨이 안 오른다).
   * 진행 문장이 결과를 흘리면 "즉시 복귀"로 실패할 원정만 빼내 부상을 피할 수 있다.
   */
  it('진행 문장은 결과를 암시하지 않는다', () => {
    const banned = ['성공', '실패', '다쳤', '다친', '부상', '피를', '쓰러', '얻었', '손에 넣', '빈손', '품고', '무사'];
    for (const def of ADVENTURE_DEFS) {
      for (const line of def.legs) {
        for (const w of banned) expect(line, `${def.name}: ${line}`).not.toContain(w);
      }
    }
  });

  it('legLine은 범위를 벗어나도 마지막·첫 구간으로 접는다', () => {
    const def = ADVENTURE_BY_ID[MINE];
    expect(legLine(def, 0)).toBe(def.legs[0]);
    expect(legLine(def, def.duration - 1)).toBe(def.legs[def.duration - 1]);
    expect(legLine(def, 99)).toBe(def.legs[def.duration - 1]);
    expect(legLine(def, -1)).toBe(def.legs[0]);
  });
});

/** 모험 결과 지문 — 정예 판정을 기존 소비(성공 → 각성석) 뒤에 붙였는지 잠근다(장비 사다리) */
function outcomesFingerprint(): string {
  let h = 2166136261;
  for (const advId of [MINE, 'adv_caravan' as AdventureId, RIFT]) {
    for (let seed = 1; seed <= 80; seed++) {
      const o = resolveAdventure({
        dispatch: dispatchOf(advId, seed % 5),
        heroes: [hero(10, 0), hero(10, 1)],
        rng: adventureRng(seed, advId, seed % 5),
        tier: 3,
      });
      const s = `${o.success ? 1 : 0}${o.awakeningStones}${o.expEach}${o.injuryRatio}`;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
  }
  return (h >>> 0).toString(16);
}
/** 정예 판정 도입 전(2026-10-02, bc1c479)에서 뜬 값. 깨지면 갱신하지 말고 판정 순서를 의심할 것 */
const EXPECTED_OUTCOMES = 'b1142e9f';

describe('모험 — 정예 장비', () => {
  it('정예 판정을 넣어도 성공·각성석·exp·부상은 그대로다', () => {
    expect(outcomesFingerprint()).toBe(EXPECTED_OUTCOMES);
  });
});

describe('모험 — 정예 드롭', () => {
  it('균열은 성공 시 확률로 그 단계 정예를, 폐광은 주지 않는다', () => {
    let rift = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = resolveAdventure({ dispatch: dispatchOf(RIFT, 0), heroes: [hero(30, 0), hero(30, 1)], rng: adventureRng(seed, RIFT, 0), tier: 4 });
      if (r.gearDefId) {
        rift++;
        expect(r.success).toBe(true);
        expect([GEAR_DEFS[r.gearDefId].tier, GEAR_DEFS[r.gearDefId].line]).toEqual([4, 'elite']);
      }
      const m = resolveAdventure({ dispatch: dispatchOf(MINE, 0, 1), heroes: [hero(30, 0)], rng: adventureRng(seed, MINE, 0), tier: 4 });
      expect(m.gearDefId).toBeNull();
    }
    expect(rift).toBeGreaterThan(0);
  });
});
