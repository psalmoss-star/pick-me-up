import { describe, it, expect } from 'vitest';
import {
  FACILITY_MAX_LEVEL, REST_HEAL, ARMORY_ATK, TRAINING_IDLE_EXP,
  restHealRate, armoryAtkMult, idleExpGain, upgradeCost,
} from './data/facilities';
import { simulateBattle } from './battle';
import { createRng } from './rng';
import { klassFor } from './stats';
import { gameData, FLOORS } from './data';
import { HERO } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const party = () => [
  hero(HERO.ashen, 2, 15, 1),
  hero(HERO.bulwark, 2, 15, 2),
  hero(HERO.tide, 3, 20, 3),
];

describe('시설 수치 테이블', () => {
  it('모든 테이블이 레벨 0~최대까지 값을 갖는다', () => {
    for (const t of [REST_HEAL, ARMORY_ATK, TRAINING_IDLE_EXP]) {
      expect(t.length).toBe(FACILITY_MAX_LEVEL + 1);
    }
  });

  it('레벨이 오를수록 효과가 좋아진다', () => {
    for (let lv = 1; lv <= FACILITY_MAX_LEVEL; lv++) {
      expect(REST_HEAL[lv]).toBeGreaterThan(REST_HEAL[lv - 1]);
      expect(ARMORY_ATK[lv]).toBeGreaterThan(ARMORY_ATK[lv - 1]);
      expect(TRAINING_IDLE_EXP[lv]).toBeGreaterThan(TRAINING_IDLE_EXP[lv - 1]);
    }
  });

  /**
   * 이게 깨지면 층간 HP 유지가 게임을 붕괴시킨다.
   * 회복 0%에서는 저층 파티가 평균 1.76층에서 끊긴다 (climb-check.mts 실측).
   */
  it('숙소 미건설(Lv.0)에도 회복이 남아 있다 — 0이면 등반이 성립하지 않는다', () => {
    expect(REST_HEAL[0]).toBeGreaterThan(0.3);
  });

  it('숙소 만렙은 전회복을 넘지 않는다 — 기존 밸런스가 상한이다', () => {
    expect(REST_HEAL[FACILITY_MAX_LEVEL]).toBeLessThanOrEqual(1);
  });

  it('무기창고 미건설은 보정이 없다', () => {
    expect(ARMORY_ATK[0]).toBe(1);
  });

  it('훈련소 미건설은 유휴 경험치가 없다', () => {
    expect(TRAINING_IDLE_EXP[0]).toBe(0);
  });

  it('레벨을 벗어난 입력은 범위 안으로 잘린다', () => {
    expect(restHealRate(-5)).toBe(REST_HEAL[0]);
    expect(restHealRate(99)).toBe(REST_HEAL[FACILITY_MAX_LEVEL]);
    expect(armoryAtkMult(99)).toBe(ARMORY_ATK[FACILITY_MAX_LEVEL]);
    expect(idleExpGain(-1)).toBe(TRAINING_IDLE_EXP[0]);
  });

  it('만렙이면 다음 비용이 없다', () => {
    expect(upgradeCost(FACILITY_MAX_LEVEL)).toBeNull();
    expect(upgradeCost(0)).toBeGreaterThan(0);
  });

  it('업그레이드 비용은 레벨이 오를수록 비싸진다', () => {
    const c1 = upgradeCost(0)!, c2 = upgradeCost(1)!, c3 = upgradeCost(2)!;
    expect(c2).toBeGreaterThan(c1);
    expect(c3).toBeGreaterThan(c2);
  });
});

describe('무기창고 보정이 전투에 실제로 반영된다', () => {
  const floor = FLOORS[1]; // 2층 토벌

  it('배수 1은 보정 없는 것과 완전히 같은 결과를 낸다', () => {
    const a = simulateBattle({
      allies: party(), enemyIds: floor.enemyIds, data: gameData,
      rng: createRng(7), mission: floor.mission,
    });
    const b = simulateBattle({
      allies: party(), enemyIds: floor.enemyIds, data: gameData,
      rng: createRng(7), mission: floor.mission, allyAtkMult: 1,
    });
    expect(b.turnsElapsed).toBe(a.turnsElapsed);
    expect(b.outcome).toBe(a.outcome);
    expect(b.events.length).toBe(a.events.length);
  });

  it('공격력 배수를 올리면 적을 더 빨리 죽인다', () => {
    // 같은 시드에서 총 턴 수가 줄어드는지 여러 시드로 확인한다
    let faster = 0, slower = 0;
    for (let s = 0; s < 40; s++) {
      const base = simulateBattle({
        allies: party(), enemyIds: floor.enemyIds, data: gameData,
        rng: createRng(s), mission: floor.mission,
      });
      const buffed = simulateBattle({
        allies: party(), enemyIds: floor.enemyIds, data: gameData,
        rng: createRng(s), mission: floor.mission, allyAtkMult: 1.5,
      });
      if (buffed.turnsElapsed < base.turnsElapsed) faster++;
      if (buffed.turnsElapsed > base.turnsElapsed) slower++;
    }
    expect(faster).toBeGreaterThan(slower);
  });

  it('보정은 결정론을 깨지 않는다 — 같은 배수·같은 시드면 같은 결과', () => {
    const run = () => simulateBattle({
      allies: party(), enemyIds: floor.enemyIds, data: gameData,
      rng: createRng(99), mission: floor.mission, allyAtkMult: 1.09,
    });
    const a = run(), b = run();
    expect(b.events.length).toBe(a.events.length);
    expect(b.turnsElapsed).toBe(a.turnsElapsed);
    expect(b.survivors).toEqual(a.survivors);
  });
});
