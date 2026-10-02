/**
 * 탑 밖의 정산 — 훈련소 유휴 exp와 모험 귀환.
 *
 * `finish()`와 결과 화면이 **같은 함수**를 쓰므로, 규칙이 여기서 틀리면
 * 화면과 지급이 함께 틀린다. 지키는 것:
 *   1. 훈련소는 미참전·생존·비파견·비배치만, 돌파했을 때만
 *   2. 모험 완료 판정은 `battleCount + 1` 기준(N전투 모험이 N번째 전투 직후 귀환)
 *   3. 진행 중 원정의 `done`이 `battleCount + 1 − startedAtBattle`
 */
import { describe, it, expect } from 'vitest';
import { settleOffTower, type OffTowerInput } from './offTower';
import { ADVENTURE_BY_ID, type AdventureId, type Dispatch } from './data/adventures';
import { idleExpWithAssign } from './data/facilities';
import { klassFor } from './stats';
import { HERO } from './data/sample';
import type { HeroInstId, HeroInstance } from './types';

const MINE = 'adv_mine' as AdventureId;
const RIFT = 'adv_rift' as AdventureId;

function hero(n: number, level = 5): HeroInstance {
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

const id = (n: number) => `h#${n}` as HeroInstId;

function input(over: Partial<OffTowerInput> = {}): OffTowerInput {
  return {
    roster: [hero(0), hero(1), hero(2), hero(3), hero(4)],
    dispatches: [],
    assignedIds: new Set(),
    trainingAssigned: [],
    trainingLevel: 2,
    battleCount: 10,
    seed: 42,
    fought: new Set([id(0)]),
    casualties: new Set(),
    cleared: true,
    ...over,
  };
}

describe('settleOffTower — 훈련소', () => {
  it('미참전·생존·비파견·비배치만 유휴 exp를 받는다', () => {
    const d: Dispatch = { advId: RIFT, heroIds: [id(2)], startedAtBattle: 10 };
    const r = settleOffTower(input({
      dispatches: [d],
      assignedIds: new Set([id(3)]),
      roster: [hero(0), hero(1), hero(2), hero(3), { ...hero(4), isDead: true }],
    }));
    expect(r.idleExp).toBe(idleExpWithAssign(2, 0));
    expect(r.trainees.map((t) => t.instId)).toEqual([id(1)]);
    expect(r.trainees[0].exp).toBe(r.idleExp);
    expect(r.trainees[0].before.exp).toBe(0);
    expect(r.after.get(id(1))).toBe(r.trainees[0].after);
  });

  it('층을 넘지 못하면 아무도 받지 않는다', () => {
    const r = settleOffTower(input({ cleared: false }));
    expect(r.idleExp).toBe(0);
    expect(r.trainees).toEqual([]);
  });

  it('훈련소 Lv.0이면 아무도 받지 않는다', () => {
    const r = settleOffTower(input({ trainingLevel: 0 }));
    expect(r.trainees).toEqual([]);
  });

  it('출전한 배치자는 그 층 산출에서 빠진다', () => {
    const r = settleOffTower(input({
      trainingAssigned: [id(0), id(3)],
      assignedIds: new Set([id(0), id(3)]),
    }));
    // id(0)은 출전했으므로 일한 배치자는 id(3) 한 명
    expect(r.idleExp).toBe(idleExpWithAssign(2, 1));
  });
});

describe('settleOffTower — 모험', () => {
  it('N전투 모험은 N번째 전투 직후에 귀환한다', () => {
    const dur = ADVENTURE_BY_ID[MINE].duration;
    const d: Dispatch = { advId: MINE, heroIds: [id(2)], startedAtBattle: 10 - (dur - 1) };
    const r = settleOffTower(input({ dispatches: [d] }));
    expect(r.returned).toHaveLength(1);
    expect(r.stillAway).toEqual([]);
    expect(r.outcomes).toHaveLength(1);
    expect(r.returned[0].heroes.map((h) => h.instId)).toEqual([id(2)]);
  });

  it('진행 중 원정의 done은 battleCount + 1 − startedAtBattle이다', () => {
    const d: Dispatch = { advId: RIFT, heroIds: [id(2)], startedAtBattle: 10 };
    const r = settleOffTower(input({ dispatches: [d] }));
    expect(r.away).toEqual([{ dispatch: d, done: 1, duration: ADVENTURE_BY_ID[RIFT].duration }]);
  });

  it('귀환자는 exp(성공) 또는 부상(실패)이 after에 반영된다 — HP는 1 아래로 안 간다', () => {
    let sawSuccess = false;
    let sawFail = false;
    for (let seed = 1; seed < 60 && !(sawSuccess && sawFail); seed++) {
      const d: Dispatch = { advId: RIFT, heroIds: [id(2), id(3)], startedAtBattle: 6 };
      const r = settleOffTower(input({ seed, dispatches: [d] }));
      const ret = r.returned[0];
      for (const g of ret.heroes) {
        if (ret.outcome.success) {
          sawSuccess = true;
          expect(g.exp).toBe(ret.outcome.expEach);
          expect(g.after.level * 1e6 + g.after.exp).toBeGreaterThan(g.before.level * 1e6 + g.before.exp);
        } else {
          sawFail = true;
          expect(g.exp).toBe(0);
          expect(g.after.currentHp).toBeGreaterThanOrEqual(1);
          expect(g.after.currentHp).not.toBe(0);
        }
      }
    }
    expect(sawSuccess && sawFail).toBe(true);
  });

  it('로스터에서 사라진 인원은 귀환 명단에 없다 — 전원 사라지면 빈손 귀환', () => {
    const d: Dispatch = { advId: MINE, heroIds: [id(9)], startedAtBattle: 0 };
    const r = settleOffTower(input({ dispatches: [d] }));
    expect(r.returned).toHaveLength(1);
    expect(r.returned[0].heroes).toEqual([]);
    expect(r.returned[0].outcome.success).toBe(false);
    expect(r.returned[0].outcome.injuryRatio).toBe(0);
  });

  it('성공한 원정의 재료·각성석이 합산된다', () => {
    for (let seed = 1; seed < 60; seed++) {
      const d: Dispatch = { advId: MINE, heroIds: [id(2)], startedAtBattle: 0 };
      const r = settleOffTower(input({ seed, dispatches: [d] }));
      if (!r.outcomes[0].success) continue;
      expect(r.materials).toEqual(r.outcomes[0].materials);
      expect(r.awakeningStones).toBe(0);
      return;
    }
    throw new Error('성공 시드를 못 찾았다');
  });
});
