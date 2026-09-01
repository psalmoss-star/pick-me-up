/**
 * 시설 배치 — 수치와 파생 함수.
 *
 * 설계: docs/superpowers/specs/2026-09-01-facility-assignment-design.md
 * 스토어 쪽 규칙(유휴 exp 제외 / 출전 시 정지 / 사망·제물 해제)은
 * `stores/assignment.test.ts`가 잡는다. 여기는 순수 수치만 본다.
 */
import { describe, it, expect } from 'vitest';
import {
  ASSIGN_SLOTS, ASSIGN_BONUS, ASSIGNABLE, FORGE_RATE, TRAINING_IDLE_EXP,
  FACILITY_MAX_LEVEL, idleExpWithAssign, forgeRateWithAssign, idleExpGain, forgeRate,
} from './data/facilities';

describe('배치 수치 테이블', () => {
  it('배치 가능 시설은 훈련소·합성소 둘뿐이다', () => {
    // 숙소·무기창고는 전투력에 직접 닿는 칼날이라 제외했다(설계 §2).
    // 여기가 늘어나면 climb-check 재수렴 의무가 생기므로 조용히 늘면 안 된다.
    expect([...ASSIGNABLE].sort()).toEqual(['forge', 'training']);
  });

  it('배치 가능 시설마다 슬롯과 보너스가 있다', () => {
    for (const kind of ASSIGNABLE) {
      expect(ASSIGN_SLOTS[kind]).toBeGreaterThan(0);
      expect(ASSIGN_BONUS[kind]).toBeGreaterThan(0);
    }
  });
});

describe('idleExpWithAssign — 훈련소', () => {
  it('배치가 없으면 기존 유휴 exp와 정확히 같다', () => {
    // 배치 기능이 기존 밸런스를 건드리지 않는다는 회귀선이다.
    for (let lv = 0; lv <= FACILITY_MAX_LEVEL; lv++) {
      expect(idleExpWithAssign(lv, 0)).toBe(idleExpGain(lv));
    }
  });

  it('배치 인원당 보너스가 더해진다', () => {
    expect(idleExpWithAssign(1, 2)).toBe(TRAINING_IDLE_EXP[1] + ASSIGN_BONUS.training * 2);
  });

  it('미건설(Lv.0)에는 배치해도 exp가 나오지 않는다', () => {
    // Lv.0은 유휴 exp가 0이다. 배치로 0을 넘기면 "안 지어도 되는 시설"이 된다.
    expect(idleExpWithAssign(0, ASSIGN_SLOTS.training)).toBe(0);
  });

  it('슬롯 수를 넘는 인원은 세지 않는다', () => {
    const full = idleExpWithAssign(3, ASSIGN_SLOTS.training);
    expect(idleExpWithAssign(3, ASSIGN_SLOTS.training + 5)).toBe(full);
  });
});

describe('forgeRateWithAssign — 합성소', () => {
  it('배치가 없으면 기존 전환율과 정확히 같다', () => {
    for (let lv = 0; lv <= FACILITY_MAX_LEVEL; lv++) {
      expect(forgeRateWithAssign(lv, 0)).toBe(forgeRate(lv));
    }
  });

  it('배치 인원당 보너스가 더해진다', () => {
    expect(forgeRateWithAssign(1, 1)).toBeCloseTo(FORGE_RATE[1] + ASSIGN_BONUS.forge, 10);
  });

  it('전환율은 1.0을 절대 넘지 않는다', () => {
    // 만렙 0.95 + 슬롯 2×0.05 = 1.05다. 제물 가치보다 많이 나오면
    // 합성이 exp 생성기가 되어 성장 곡선이 무너진다(설계 §4).
    expect(forgeRateWithAssign(FACILITY_MAX_LEVEL, ASSIGN_SLOTS.forge)).toBeLessThanOrEqual(1);
    expect(forgeRateWithAssign(FACILITY_MAX_LEVEL, 99)).toBeLessThanOrEqual(1);
  });

  it('만렙+만배치에서도 전환율이 손해가 아니다', () => {
    // 클램프가 값을 깎아 만렙보다 낮아지면 배치가 벌점이 된다.
    expect(forgeRateWithAssign(FACILITY_MAX_LEVEL, ASSIGN_SLOTS.forge))
      .toBeGreaterThanOrEqual(forgeRate(FACILITY_MAX_LEVEL));
  });

  it('슬롯 수를 넘는 인원은 세지 않는다', () => {
    const full = forgeRateWithAssign(0, ASSIGN_SLOTS.forge);
    expect(forgeRateWithAssign(0, ASSIGN_SLOTS.forge + 5)).toBe(full);
  });
});
