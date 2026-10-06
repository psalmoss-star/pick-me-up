/**
 * 계열 특성 — 켠 전투와 끈 전투를 **같은 시드로** 나란히 돌려 처음 갈리는 지점을 본다.
 *
 * 특성은 난수를 새로 뽑지 않으므로, 특성이 처음 발동하기 전까지 두 로그는 글자 하나까지 같다.
 * 그 첫 지점의 수치가 정확히 배수만큼 달라야 한다 — "켜면 뭔가 달라진다"가 아니라
 * "그 조건에서 그 배수만큼"을 잰다.
 */
import { describe, it, expect } from 'vitest';
import { simulateBattle, type BattleData, type BattleInput, type BattleOutcome } from './battle';
import { createRng } from './rng';
import { klassFor, statsOfInstance } from './stats';
import { heroes, enemies, skills, starScaling, elementChart, HERO, ENEMY } from './data/sample';
import { LINEAGE_TRAITS, TRAIT_NAME, type LineageTraits } from './data/traits';
import { LINEAGES } from './data/lineages';
import { describeTrait } from './trait';
import type { BattleEvent, HeroDefId, HeroInstId, HeroInstance, Lineage, Star } from './types';

const base = { heroes, enemies, skills, starScaling, elementChart };
const OFF = base as unknown as BattleData;
const withTraits = (traits: LineageTraits) => ({ ...base, traits }) as unknown as BattleData;
const ON = withTraits(LINEAGE_TRAITS);

const hero = (defId: HeroDefId, star: Star, level: number, n = 0): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});
const uidOf = (h: HeroInstance) => `A:${h.instId}`;

function pair(input: Omit<BattleInput, 'data' | 'rng'>, seed: number, on: BattleData = ON) {
  return {
    off: simulateBattle({ ...input, data: OFF, rng: createRng(seed) }),
    on: simulateBattle({ ...input, data: on, rng: createRng(seed) }),
  };
}

/** `trait` 이벤트(선제·진두지휘 알림, 은총 보호막)를 뺀 로그 — 끈 쪽과 줄을 맞추기 위해서다 */
const core = (r: BattleOutcome) => r.events.filter((e) => e.type !== 'trait');
const strip = ({ trait: _t, ...e }: BattleEvent) => e;

/** 특성 꼬리표가 처음 붙은 damage 이벤트와, 끈 전투의 같은 자리 이벤트 */
function firstTagged(seedRange: number[], lineage: Lineage, input: Omit<BattleInput, 'data' | 'rng'>) {
  for (const seed of seedRange) {
    const { off, on } = pair(input, seed);
    const a = core(on);
    const b = core(off);
    const i = a.findIndex((e) => e.type === 'damage' && e.trait === lineage);
    if (i === -1) continue;
    return { seed, i, on: a, off: b };
  }
  throw new Error(`${lineage} 특성이 한 번도 발동하지 않았다 — 테스트가 아무것도 재지 않는다`);
}

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

describe('특성이 없으면 계열은 전투에 닿지 않는다', () => {
  it('traits를 뺀 번들에서는 trait 이벤트도 꼬리표도 없다', () => {
    const r = simulateBattle({
      allies: Object.values(HERO).map((id, n) => hero(id, 3, 25, n)),
      enemyIds: [ENEMY.slime, ENEMY.hound, ENEMY.wisp],
      data: OFF, rng: createRng(3),
    });
    expect(r.events.some((e) => e.type === 'trait' || e.trait !== undefined)).toBe(false);
  });
});

describe('검사 — 마무리', () => {
  const input = { allies: [hero(HERO.ashen, 3, 30, 1)], enemyIds: [ENEMY.slime] };

  it('HP가 기준 이하인 적에게만, 정확히 배수만큼 더 아프다', () => {
    const { i, on, off } = firstTagged(SEEDS, 'blade', input);
    // 발동 전까지는 글자 하나까지 같다
    expect(on.slice(0, i).map(strip)).toEqual(off.slice(0, i));
    expect(on[i].amount).toBe(Math.round(off[i].amount! * LINEAGE_TRAITS.blade.damageMult));

    // 그 순간 대상의 HP 비율이 실제로 기준 이하였는가
    const target = on[i].targetUids![0];
    const dealt = on.slice(0, i)
      .filter((e) => e.type === 'damage' && e.targetUids![0] === target)
      .reduce((a, e) => a + e.amount!, 0);
    const maxHp = enemies[ENEMY.slime].stats.hp;
    expect((maxHp - dealt) / maxHp).toBeLessThanOrEqual(LINEAGE_TRAITS.blade.hpBelow);
  });

  it('기준 위의 적에게는 붙지 않는다 — 첫 타는 언제나 그대로다', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { on } = pair(input, seed);
      const first = core(on).find((e) => e.type === 'damage' && e.actorUid?.startsWith('A:'))!;
      expect(first.trait).toBeUndefined();
    }
  });
});

describe('수호자 — 버티기', () => {
  it('공격으로 받는 피해가 정확히 배수만큼 준다', () => {
    const input = { allies: [hero(HERO.bulwark, 3, 30, 1)], enemyIds: [ENEMY.slime] };
    const { i, on, off } = firstTagged(SEEDS, 'guardian', input);
    expect(on.slice(0, i).map(strip)).toEqual(off.slice(0, i));
    expect(on[i].targetUids![0].startsWith('A:')).toBe(true);
    expect(on[i].amount).toBe(Math.round(off[i].amount! * LINEAGE_TRAITS.guardian.damageTakenMult));
    expect(on[i].amount!).toBeLessThan(off[i].amount!);
  });

  it('수호자가 아닌 영웅이 맞을 때는 붙지 않는다', () => {
    const { on } = pair({ allies: [hero(HERO.ashen, 3, 30, 1)], enemyIds: [ENEMY.slime] }, 5);
    expect(on.events.some((e) => e.trait === 'guardian')).toBe(false);
  });
});

describe('술사 — 주문 증폭', () => {
  const input = { allies: [hero(HERO.cinder, 4, 40, 1)], enemyIds: [ENEMY.slime, ENEMY.hound] };

  it('대상이 둘 이상인 기술의 피해만 커진다', () => {
    const { i, on, off } = firstTagged(SEEDS, 'mage', input);
    expect(on[i].amount).toBe(Math.round(off[i].amount! * LINEAGE_TRAITS.mage.multiTargetMult));
    // 그 피해가 속한 기술은 대상이 둘 이상이다
    const use = [...on.slice(0, i)].reverse().find((e) => e.type === 'skillUse')!;
    expect(use.targetUids!.length).toBeGreaterThan(1);
  });

  it('단일 대상 기술에는 붙지 않는다', () => {
    const { on } = pair(input, 2);
    const events = core(on);
    events.forEach((e, idx) => {
      if (e.type !== 'damage' || e.trait !== 'mage') return;
      const use = [...events.slice(0, idx)].reverse().find((x) => x.type === 'skillUse')!;
      expect(skills[use.skillId!].targetScope).not.toBe('single');
    });
  });
});

describe('사냥꾼 — 약점 사냥', () => {
  it('해로운 상태에 걸린 적에게만, 정확히 배수만큼 더 아프다', () => {
    const input = { allies: [hero(HERO.thorn, 3, 30, 1)], enemyIds: [ENEMY.slime] };
    const { i, on, off } = firstTagged(SEEDS, 'hunter', input);
    expect(on.slice(0, i).map(strip)).toEqual(off.slice(0, i));
    expect(on[i].amount).toBe(Math.round(off[i].amount! * LINEAGE_TRAITS.hunter.afflictedMult));
    // 그 전에 그 대상에게 해로운 상태가 걸린 적이 있다
    const target = on[i].targetUids![0];
    expect(on.slice(0, i).some((e) => e.type === 'statusApplied' && e.targetUids![0] === target)).toBe(true);
  });

  it('멀쩡한 적을 때리는 첫 타에는 붙지 않는다', () => {
    const { on } = pair({ allies: [hero(HERO.thorn, 3, 30, 1)], enemyIds: [ENEMY.slime] }, 4);
    const first = core(on).find((e) => e.type === 'damage' && e.actorUid?.startsWith('A:'))!;
    expect(first.trait).toBeUndefined();
  });
});

describe('사제 — 넘치는 은총', () => {
  // 세인은 첫 행동으로 치유를 쓴다(쿨다운이 긴 기술 우선). 사냥개보다 느려도 한 대 맞은 정도라 치유가 넘친다
  const tide = hero(HERO.tide, 4, 40, 1);
  const input = { allies: [tide], enemyIds: [ENEMY.slime] };
  const maxHp = statsOfInstance(tide, heroes[HERO.tide], starScaling).hp;

  it('넘친 치유의 일부가 보호막이 되고, 상한을 넘지 않는다', () => {
    const { on, off } = pair(input, 1);
    const grace = on.events.filter((e) => e.type === 'trait' && e.trait === 'priest');
    expect(grace.length).toBeGreaterThan(0);
    expect(off.events.some((e) => e.type === 'trait')).toBe(false);
    const cap = Math.round(maxHp * LINEAGE_TRAITS.priest.shieldCapRatio);
    for (const g of grace) {
      expect(g.amount!).toBeGreaterThan(0);
      expect(g.amount!).toBeLessThanOrEqual(cap);
      expect(g.targetUids).toEqual([uidOf(tide)]);
    }
  });

  it('보호막은 실제로 피해를 막는다 — 같은 전투에서 HP가 그만큼 더 남는다', () => {
    /*
      보호막은 이벤트에 안 보이므로 결과로 잰다. 몇 턴에서 끊으면 아무도 죽지 않아
      두 전투의 난수·행동이 완전히 같고, 다른 것은 보호막이 받아낸 피해뿐이다.
    */
    const cut = { ...input, maxTurns: 3 };
    const { on, off } = pair(cut, 1);
    expect(core(on)).toEqual(off.events);
    const gained = on.events
      .filter((e) => e.type === 'trait' && e.trait === 'priest')
      .reduce((a, e) => a + e.amount!, 0);
    const saved = on.survivors[0].currentHp - off.survivors[0].currentHp;
    expect(saved).toBeGreaterThan(0);
    expect(saved).toBeLessThanOrEqual(gained);
  });

  it('상한이 0이면 보호막이 생기지 않는다', () => {
    const none = withTraits({ ...LINEAGE_TRAITS, priest: { overflowToShield: 0.5, shieldCapRatio: 0 } });
    const { on } = pair(input, 1, none);
    expect(on.events.some((e) => e.type === 'trait' && e.trait === 'priest')).toBe(false);
  });
});

describe('척후 — 선제', () => {
  // 예니 ★2 Lv.15의 속도는 60, 사냥개는 62 — 특성이 없으면 적이 먼저 움직인다
  // HERO 상수에는 예니가 없다(sim 기준 파티에 안 쓰여서) — 도감 id로 직접 가리킨다
  const hush = hero('h_hush' as HeroDefId, 2, 15, 1);
  const input = { allies: [hush], enemyIds: [ENEMY.hound] };
  const firstActorOf = (r: BattleOutcome, turn: number) =>
    r.events.find((e) => e.turn === turn && e.type === 'skillUse')?.actorUid;

  it('첫 턴에는 먼저 움직이고, 다음 턴부터는 원래 순서다', () => {
    const { on, off } = pair(input, 1);
    expect(firstActorOf(off, 1)).toMatch(/^E:/);
    expect(firstActorOf(on, 1)).toBe(uidOf(hush));
    expect(firstActorOf(on, 2)).toMatch(/^E:/);
  });

  it('전투 시작에 선제 알림이 한 번 뜬다', () => {
    const { on } = pair(input, 1);
    const marks = on.events.filter((e) => e.type === 'trait' && e.trait === 'scout');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ turn: 1, actorUid: uidOf(hush) });
  });

  const gale = hero(HERO.gale, 4, 40, 1);
  const duel = { allies: [gale], enemyIds: [ENEMY.golem] };

  it('속도 배수는 순서만 바꾼다 — 원래도 빠르면 아무것도 달라지지 않는다', () => {
    // 피해 배수를 1로 두면 남는 것은 속도뿐이고, 리엔은 원래도 골렘보다 빠르다
    const speedOnly = withTraits({ ...LINEAGE_TRAITS, scout: { turns: 1, spdMult: 1.5, damageMult: 1 } });
    const { on, off } = pair(duel, 1, speedOnly);
    expect(core(on).map(strip)).toEqual(off.events);
  });

  it('첫 턴의 피해만, 정확히 배수만큼 커진다', () => {
    const { on, off } = pair(duel, 1);
    const a = core(on);
    const i = a.findIndex((e) => e.type === 'damage' && e.trait === 'scout');
    expect(i).toBeGreaterThan(-1);
    expect(a[i].turn).toBe(1);
    expect(a[i].amount).toBe(Math.round(off.events[i].amount! * LINEAGE_TRAITS.scout.damageMult));
    // 둘째 턴부터는 꼬리표가 붙지 않는다
    expect(on.events.some((e) => e.trait === 'scout' && e.type === 'damage' && e.turn > LINEAGE_TRAITS.scout.turns)).toBe(false);
  });
});

describe('지휘관 — 진두지휘', () => {
  const ashen = hero(HERO.ashen, 3, 30, 1);
  const led = { allies: [ashen, hero(HERO.banner, 3, 30, 2)], enemyIds: [ENEMY.golem] };
  const firstHitBy = (r: BattleOutcome, uid: string) =>
    r.events.find((e) => e.type === 'damage' && e.actorUid === uid)!.amount!;

  it('지휘관이 있으면 다른 아군의 피해가 배수만큼 오른다', () => {
    const { on, off } = pair(led, 1);
    const a = firstHitBy(on, uidOf(ashen));
    const b = firstHitBy(off, uidOf(ashen));
    // 공격력에 곱해지므로 반올림 한 칸까지만 어긋난다
    expect(Math.abs(a - b * LINEAGE_TRAITS.commander.allyAtkMult)).toBeLessThanOrEqual(1);
    expect(a).toBeGreaterThan(b);
  });

  it('지휘관이 둘이어도 한 번만 걸린다', () => {
    const doubled = withTraits({ ...LINEAGE_TRAITS, commander: { allyAtkMult: 2 } });
    const two = { ...led, allies: [...led.allies, hero(HERO.banner, 3, 30, 3)] };
    const { on, off } = pair(two, 1, doubled);
    const ratio = firstHitBy(on, uidOf(ashen)) / firstHitBy(off, uidOf(ashen));
    expect(ratio).toBeGreaterThan(1.9);
    expect(ratio).toBeLessThan(2.1);
  });

  it('지휘관이 없으면 걸리지 않는다', () => {
    const { on, off } = pair({ allies: [ashen], enemyIds: [ENEMY.golem] }, 1);
    expect(firstHitBy(on, uidOf(ashen))).toBe(firstHitBy(off, uidOf(ashen)));
  });

  it('지휘관이 쓰러지면 꺼진다', () => {
    /*
      배수를 10으로 과장하고 약한 지휘관을 먼저 쓰러뜨린다(폭군의 첫 행동이 전체 공격이다).
      꺼지지 않았다면 그 뒤의 한 방이 끈 전투의 어떤 한 방보다도 몇 배 크다.
    */
    const weak = hero(HERO.banner, 1, 1, 2);
    const dealer = hero(HERO.ashen, 5, 60, 1);
    const huge = withTraits({ ...LINEAGE_TRAITS, commander: { allyAtkMult: 10 } });
    const input = { allies: [dealer, weak], enemyIds: [ENEMY.tyrant], enemyStatMult: 8 };
    let seen = 0;
    for (const seed of SEEDS) {
      const { on, off } = pair(input, seed, huge);
      const death = on.events.findIndex((e) => e.type === 'death' && e.targetUids![0] === uidOf(weak));
      if (death === -1) continue;
      const after = on.events.slice(death).filter((e) => e.type === 'damage' && e.actorUid === uidOf(dealer));
      if (after.length === 0) continue;
      const offMax = Math.max(...off.events
        .filter((e) => e.type === 'damage' && e.actorUid === uidOf(dealer)).map((e) => e.amount!));
      for (const e of after) expect(e.amount!).toBeLessThan(offMax * 2);
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('특성 설명 문장', () => {
  it('일곱 계열 모두 이름과 설명이 있다', () => {
    for (const l of LINEAGES) {
      expect(TRAIT_NAME[l].length).toBeGreaterThan(0);
      expect(describeTrait(l).length).toBeGreaterThan(0);
    }
    expect(new Set(LINEAGES.map((l) => TRAIT_NAME[l])).size).toBe(LINEAGES.length);
  });

  it('수치는 데이터에서 나온다 — 손으로 적은 문장이 아니다', () => {
    const tuned: LineageTraits = {
      ...LINEAGE_TRAITS,
      blade: { hpBelow: 0.5, damageMult: 1.1 },
      guardian: { damageTakenMult: 0.88 },
      scout: { turns: 2, spdMult: 1.5, damageMult: 1.2 },
    };
    expect(describeTrait('blade', tuned)).toBe('HP 50% 이하인 적에게 피해 +10%');
    expect(describeTrait('guardian', tuned)).toBe('공격으로 받는 피해 −12%');
    expect(describeTrait('scout', tuned)).toBe('전투 첫 2턴에 속도 +50% · 피해 +20%');
    // 현행 수치로 만든 문장에도 그 수치가 들어 있다
    expect(describeTrait('blade')).toContain(`${Math.round(LINEAGE_TRAITS.blade.hpBelow * 100)}%`);
  });
});
