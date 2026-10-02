/**
 * 장비 성장 사다리(2026-10-02) — 단계·계열 모델.
 * 10층마다 한 단계. 보급형은 상점·일반 드롭, 정예는 보스·모험, 유물은 제작.
 */
import { describe, it, expect } from 'vitest';
import { GEAR_DEFS, gearTag, tierOf, tierFirstFloor, TIER_COUNT } from './data/gear';
import { refPartyAt, tierRefFloor } from './data/refParty';
import type { GearDefId } from './types';

const LEGACY = [
  'w_chipped', 'a_tatter', 't_charm',
  'w_soldier', 'a_guard', 't_swift',
  'w_emberfang', 'a_bulwark', 't_bloodpact',
  'w_towerbane', 'a_ashshroud', 't_lastlight',
] as const;

describe('단계', () => {
  it('10층마다 한 단계 — 경계 층이 맞다', () => {
    expect(tierOf(1)).toBe(1);
    expect(tierOf(10)).toBe(1);
    expect(tierOf(11)).toBe(2);
    expect(tierOf(20)).toBe(2);
    expect(tierOf(21)).toBe(3);
    expect(tierOf(100)).toBe(TIER_COUNT);
    expect(tierOf(999)).toBe(TIER_COUNT);
    expect(tierOf(0)).toBe(1);
  });

  it('단계 첫 층', () => {
    expect(tierFirstFloor(1)).toBe(1);
    expect(tierFirstFloor(3)).toBe(21);
    expect(tierFirstFloor(10)).toBe(91);
  });

  it('기준 파티 — 저층 3인 · 생성 구간 5인, 단계 가운데 층', () => {
    expect(refPartyAt(5)).toHaveLength(3);
    expect(refPartyAt(25)).toHaveLength(5);
    expect(tierRefFloor(1)).toBe(5);
    expect(tierRefFloor(10)).toBe(95);
  });
});

describe('기존 장비 재배치', () => {
  it('기존 12종 id가 모두 남아 있다 — 세이브가 참조한다', () => {
    for (const id of LEGACY) expect(GEAR_DEFS[id as GearDefId], id).toBeDefined();
  });

  it('common 3종 = 1단계 보급, fine 3종 = 1단계 정예, rare 3종 = 2단계 정예, relic = 유물', () => {
    const at = (id: string) => GEAR_DEFS[id as GearDefId];
    for (const id of ['w_chipped', 'a_tatter', 't_charm']) expect([at(id).tier, at(id).line]).toEqual([1, 'supply']);
    for (const id of ['w_soldier', 'a_guard', 't_swift']) expect([at(id).tier, at(id).line]).toEqual([1, 'elite']);
    for (const id of ['w_emberfang', 'a_bulwark', 't_bloodpact']) expect([at(id).tier, at(id).line]).toEqual([2, 'elite']);
    for (const id of ['w_towerbane', 'a_ashshroud', 't_lastlight']) expect(at(id).line).toBe('relic');
  });

  it('표시 꼬리표', () => {
    expect(gearTag(GEAR_DEFS['w_chipped' as GearDefId])).toBe('1단계 · 보급');
    expect(gearTag(GEAR_DEFS['w_emberfang' as GearDefId])).toBe('2단계 · 정예');
    expect(gearTag(GEAR_DEFS['w_towerbane' as GearDefId])).toBe('유물');
  });
});
