import { describe, it, expect } from 'vitest';
import { bonusOf, heroBonus, makeGear } from './gear';
import { GEAR_DEFS, GEAR_SLOTS } from './data/gear';
import { GEAR_AFFINITY, affinityOf } from './data/gearAffinity';
import { LINEAGES } from './data/lineages';
import { simulateBattle, type BattleData } from './battle';
import { runEncounter } from './encounter';
import { gearDelta } from './gearCompare';
import { createRng } from './rng';
import { klassFor, statsOfInstance } from './stats';
import { heroes, enemies, skills, starScaling, elementChart, HERO, ENEMY } from './data/sample';
import { floorAt } from './data';
import type {
  GearDefId, GearInstId, GearInstance, HeroDefId, HeroInstId, HeroInstance, Lineage, Star,
} from './types';

const gd = (s: string) => s as GearDefId;
const inv = (list: GearInstance[]) => new Map<GearInstId, GearInstance>(list.map((g) => [g.instId, g]));
const hero = (defId: HeroDefId, star: Star, level: number, n = 1): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});
const M = GEAR_AFFINITY.mult;

describe('궁합 표', () => {
  it('일곱 계열 모두 주 장비 슬롯이 있고, 세 슬롯이 다 쓰인다', () => {
    for (const l of LINEAGES) expect(GEAR_SLOTS).toContain(GEAR_AFFINITY.slot[l]);
    expect(new Set(LINEAGES.map((l) => GEAR_AFFINITY.slot[l])).size).toBe(GEAR_SLOTS.length);
  });

  it('주 슬롯에서만 배수가 붙는다', () => {
    expect(affinityOf('blade', 'weapon')).toBe(M);
    expect(affinityOf('blade', 'armor')).toBe(1);
    expect(affinityOf(undefined, 'weapon')).toBe(1);
  });
});

describe('bonusOf — 궁합 배수', () => {
  const sword = makeGear(gd('w_soldier'), 1); // atk 14 · crit 0.02

  it('배수를 안 넘기면 예전과 같다', () => {
    expect(bonusOf(sword)).toEqual(bonusOf(sword, 1));
    expect(bonusOf(sword).atk).toBe(GEAR_DEFS[gd('w_soldier')].base.atk);
  });

  it('이로운 수치가 배수만큼 커진다 — 정수 스탯은 반올림, 치명은 그대로 곱한다', () => {
    const base = GEAR_DEFS[gd('w_soldier')].base;
    const b = bonusOf(sword, M);
    expect(b.atk).toBe(Math.round(base.atk! * M));
    expect(b.crit).toBeCloseTo(base.crit! * M, 10);
  });

  it('대가(음수 수치)는 커지지 않는다', () => {
    const plate = makeGear(gd('a_bulwark'), 1); // hp 60 · def 6 · spd −3
    const base = GEAR_DEFS[gd('a_bulwark')].base;
    expect(base.spd!).toBeLessThan(0);
    const b = bonusOf(plate, M);
    expect(b.spd).toBe(base.spd);
    expect(b.hp).toBe(Math.round(base.hp! * M));
  });

  it('강화 배수와 함께 걸린다', () => {
    const plus3 = { ...sword, enhance: 3 };
    expect(bonusOf(plus3, M).atk!).toBeGreaterThan(bonusOf(plus3).atk!);
    expect(bonusOf(plus3, M).atk!).toBeGreaterThan(bonusOf(sword, M).atk!);
  });
});

describe('heroBonus — 계열', () => {
  const w = { ...makeGear(gd('w_soldier'), 1) };
  const a = { ...makeGear(gd('a_guard'), 2) };
  const t = { ...makeGear(gd('t_swift'), 3) };
  const gear = { weapon: w.instId, armor: a.instId, trinket: t.instId };
  const all = inv([w, a, t]);

  it('계열을 안 넘기면 예전과 같다', () => {
    const plain = heroBonus(gear, all);
    expect(plain.atk).toBe(GEAR_DEFS[w.defId].base.atk);
    expect(plain.hp).toBe(GEAR_DEFS[a.defId].base.hp);
  });

  it.each(LINEAGES)('%s — 주 슬롯의 장비만 커지고 나머지 둘은 그대로다', (l: Lineage) => {
    const plain = heroBonus(gear, all);
    const mine = heroBonus(gear, all, l);
    const main = GEAR_AFFINITY.slot[l];
    // 무기 → atk, 방어구 → hp, 장신구 → spd 로 슬롯마다 대표 수치가 갈린다
    expect(mine.atk! > plain.atk!).toBe(main === 'weapon');
    expect(mine.hp! > plain.hp!).toBe(main === 'armor');
    expect(mine.spd! > plain.spd!).toBe(main === 'trinket');
  });
});

describe('엔진·화면이 같은 값을 쓴다', () => {
  const noTraits = { heroes, enemies, skills, starScaling, elementChart } as unknown as BattleData;
  const sword = (owner: HeroInstance) => ({ ...makeGear(gd('w_soldier'), 1), enhance: 5, equippedBy: owner.instId });

  it('검사가 무기를 끼면 전투에서도 그만큼 더 아프다 — 같은 영웅을 다른 계열로 두면 덜 아프다', () => {
    const ashen = hero(HERO.ashen, 2, 15);
    const g = sword(ashen);
    const armed = { ...ashen, gear: { weapon: g.instId } };
    // 같은 영웅을 사제 계열로 바꾼 도감 — 다른 것은 전부 같고 궁합만 사라진다
    const asPriest = {
      ...noTraits,
      heroes: { ...heroes, [HERO.ashen]: { ...heroes[HERO.ashen], lineage: 'priest' as const } },
    } as unknown as BattleData;
    const firstHit = (data: BattleData) => simulateBattle({
      allies: [armed], enemyIds: [ENEMY.golem], data, rng: createRng(1), inventory: inv([g]),
    }).events.find((e) => e.type === 'damage' && e.actorUid?.startsWith('A:'))!.amount!;
    expect(firstHit(noTraits)).toBeGreaterThan(firstHit(asPriest));
  });

  it('장비가 없으면 계열이 달라도 같다', () => {
    const ashen = hero(HERO.ashen, 2, 15);
    const asPriest = {
      ...noTraits,
      heroes: { ...heroes, [HERO.ashen]: { ...heroes[HERO.ashen], lineage: 'priest' as const } },
    } as unknown as BattleData;
    const log = (data: BattleData) => JSON.stringify(simulateBattle({
      allies: [ashen], enemyIds: [ENEMY.golem], data, rng: createRng(1),
    }).events);
    expect(log(noTraits)).toBe(log(asPriest));
  });

  it('전투 화면의 HP 바 분모(로스터)와 착용 전 비교가 궁합을 반영한다', () => {
    const bulwark = hero(HERO.bulwark, 2, 15);
    const plate: GearInstance = { ...makeGear(gd('a_guard'), 1), equippedBy: bulwark.instId };
    const worn = { ...bulwark, gear: { armor: plate.instId } };
    const base = statsOfInstance(bulwark, heroes[HERO.bulwark], starScaling);
    const expectedHp = base.hp + Math.round(GEAR_DEFS[plate.defId].base.hp! * M);

    const r = runEncounter({
      party: [worn], floor: floorAt(0), data: noTraits, rng: createRng(1), inventory: inv([plate]),
    });
    expect(r.roster.find((u) => u.kind === 'hero')!.maxHp).toBe(expectedHp);

    // 끼기 전 비교가 말하는 증가량도 같다 — 화면이 약속한 만큼 실제로 오른다
    const delta = gearDelta(bulwark, heroes[HERO.bulwark], starScaling, inv([{ ...plate, equippedBy: null }]), 'armor', plate);
    expect(delta.stats.hp).toBe(expectedHp - base.hp);
  });
});
