/**
 * 장비 착용 전 비교 — "끼면 얼마나 바뀌나"와 "이 슬롯의 추천".
 *
 * 지키려는 것:
 *   1. 증감은 **지금 낀 것 대비**다 (빈 슬롯이면 0 대비)
 *   2. 내려가는 스탯도 그대로 보인다 (성벽 판금의 속도 −3)
 *   3. 추천·자동 장착은 **남이 낀 장비를 고르지 않는다** — `equip`이 막는 이유와 같다
 */
import { describe, it, expect } from 'vitest';
import { gearDelta, bestFreeGear } from './gearCompare';
import { makeGear } from './gear';
import { GEAR_DEFS } from './data/gear';
import { GEAR_AFFINITY } from './data/gearAffinity';
import { heroes, starScaling, HERO } from './data/sample';
import { klassFor } from './stats';
import type { GearDefId, GearInstance, GearSlot, GearInstId, HeroInstId, HeroInstance } from './types';

const g = (defId: string, n: number, equippedBy: string | null = null): GearInstance =>
  ({ ...makeGear(defId as GearDefId, n), equippedBy: equippedBy as HeroInstId | null });

const hero = (gear: Partial<Record<GearSlot, GearInstId>> = {}): HeroInstance => ({
  instId: 'h_ashen#1' as HeroInstId, defId: HERO.ashen, star: 3, klass: klassFor(3), level: 20, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1, gear,
});
const inv = (list: GearInstance[]) => new Map(list.map((x) => [x.instId, x]));
const def = heroes[HERO.ashen];
/** 장비 수치는 도감에서 읽는다 — 사다리(STEP 66)에서 기존 장비 수치를 다시 맞췄다 */
const base = (id: string) => GEAR_DEFS[id as GearDefId].base;
/**
 * 카일은 검사라 **무기가 주 장비**다 — 무기의 공격력은 궁합 배수가 붙은 값으로 오른다(STEP 70).
 * 방어구는 주 장비가 아니라 도감 값 그대로다(아래 판금 테스트).
 */
const myAtk = (id: string) => Math.round(base(id).atk! * GEAR_AFFINITY.mult);

describe('gearDelta — 끼면 얼마나 바뀌나', () => {
  it('빈 슬롯에 끼면 장비 보정만큼 오른다', () => {
    const sword = g('w_soldier', 1);
    const d = gearDelta(hero(), def, starScaling, inv([sword]), 'weapon', sword);
    expect(d.stats.atk).toBe(myAtk('w_soldier'));
    expect(myAtk('w_soldier')).toBeGreaterThan(base('w_soldier').atk!);
    expect(d.power).toBeGreaterThan(0);
  });
  it('더 약한 것으로 바꾸면 내려간다 — 지금 낀 것 대비', () => {
    const sword = g('w_soldier', 1, 'h_ashen#1');
    const chipped = g('w_chipped', 2);
    const d = gearDelta(hero({ weapon: sword.instId }), def, starScaling, inv([sword, chipped]), 'weapon', chipped);
    expect(d.stats.atk).toBe(myAtk('w_chipped') - myAtk('w_soldier'));
    expect(d.power).toBeLessThan(0);
  });
  it('내려가는 스탯도 보인다 — 성벽 판금 속도 −3', () => {
    const plate = g('a_bulwark', 1);
    const d = gearDelta(hero(), def, starScaling, inv([plate]), 'armor', plate);
    expect(d.stats.spd).toBe(-3);
    expect(d.stats.hp).toBe(base('a_bulwark').hp);
  });
  it('null은 벗기 — 지금 것만큼 내려간다', () => {
    const sword = g('w_soldier', 1, 'h_ashen#1');
    const d = gearDelta(hero({ weapon: sword.instId }), def, starScaling, inv([sword]), 'weapon', null);
    expect(d.stats.atk).toBe(-myAtk('w_soldier'));
  });
  it('바뀌지 않는 스탯은 담지 않는다', () => {
    const sword = g('w_chipped', 1);
    const d = gearDelta(hero(), def, starScaling, inv([sword]), 'weapon', sword);
    expect(Object.keys(d.stats)).toEqual(['atk']);
  });
});

describe('bestFreeGear — 이 슬롯의 추천', () => {
  it('전투력이 가장 오르는 빈 장비', () => {
    const list = [g('w_chipped', 1), g('w_soldier', 2), g('a_guard', 3)];
    expect(bestFreeGear(hero(), def, starScaling, inv(list), 'weapon')?.defId).toBe('w_soldier');
  });
  it('남이 낀 장비는 고르지 않는다', () => {
    const list = [g('w_chipped', 1), g('w_emberfang', 2, 'h_bulwark#2')];
    expect(bestFreeGear(hero(), def, starScaling, inv(list), 'weapon')?.defId).toBe('w_chipped');
  });
  it('지금 것보다 오르는 게 없으면 null', () => {
    const worn = g('w_emberfang', 1, 'h_ashen#1');
    const list = [worn, g('w_chipped', 2)];
    expect(bestFreeGear(hero({ weapon: worn.instId }), def, starScaling, inv(list), 'weapon')).toBeNull();
  });
});
