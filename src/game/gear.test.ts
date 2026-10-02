import { describe, it, expect } from 'vitest';
import {
  bonusOf, sumBonus, heroBonus, applyBonus, equip, unequip,
  rollRecovery, enhance, weightedPick, makeGear,
} from './gear';
import {
  GEAR_DEFS, GEAR_TUNING, enhanceMult, enhanceCostOf, enhanceChanceOf,
  shopStock,
} from './data/gear';
import { simulateBattle } from './battle';
import { createRng } from './rng';
import { klassFor, statsOfInstance } from './stats';
import { gameData, FLOORS } from './data';
import { HERO } from './data/sample';
import type {
  GearDefId, GearInstId, GearInstance, GearSlot, HeroDefId, HeroInstId, HeroInstance, Star, Stats,
} from './types';

const gd = (s: string) => s as GearDefId;

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const party = () => [
  hero(HERO.ashen, 2, 15, 1),
  hero(HERO.bulwark, 2, 15, 2),
  hero(HERO.tide, 3, 20, 3),
];

/** 인벤토리 헬퍼 */
const inv = (list: GearInstance[]) => new Map(list.map((g) => [g.instId, g]));

describe('장비 도감', () => {
  it('모든 정의의 id가 키와 일치한다', () => {
    for (const [key, def] of Object.entries(GEAR_DEFS)) {
      expect(def.id).toBe(key);
    }
  });

  it('슬롯 3종이 각각 등급별로 갖춰져 있다', () => {
    for (const slot of ['weapon', 'armor', 'trinket'] as GearSlot[]) {
      const list = Object.values(GEAR_DEFS).filter((d) => d.slot === slot);
      expect(list.length).toBeGreaterThanOrEqual(4);
    }
  });

  /** 금으로 최상급을 살 수 있으면 등반이 아니라 지갑이 강함을 정한다 */
  it('유물 등급은 상점에서 팔지 않는다', () => {
    for (const def of Object.values(GEAR_DEFS)) {
      if (def.rank === 'relic') expect(def.price).toBeUndefined();
    }
  });

  it('상점 재고는 전부 가격이 있는 보급형이다', () => {
    for (const slot of ['weapon', 'armor', 'trinket'] as GearSlot[]) {
      const stock = shopStock(slot, 10);
      expect(stock.length).toBe(10);
      for (const d of stock) {
        expect(d.price).toBeGreaterThan(0);
        expect(d.line).toBe('supply');
      }
    }
  });

  /** 장비 사다리(2026-10-02) — 등급이 아니라 단계로 오른다 */
  it('위 단계일수록 비싸다', () => {
    const w = shopStock('weapon', 10); // 최신 단계 먼저
    for (let i = 1; i < w.length; i++) expect(w[i - 1].price!).toBeGreaterThan(w[i].price!);
  });

  /*
    드롭 등급 가중치(dropWeights) 테스트 셋은 장비 사다리(2026-10-02)에서 지웠다 —
    "저층에 상위 장비 없음·깊이로 잠금"은 `loot.test.ts`의 단계 드롭 테스트가 맡는다.
  */
});

describe('보정 계산', () => {
  it('강화 0단계는 정의값 그대로다', () => {
    const g = makeGear(gd('w_soldier'), 1);
    expect(bonusOf(g).atk).toBe(GEAR_DEFS[gd('w_soldier')].base.atk);
  });

  it('강화하면 보정이 커진다', () => {
    const base = bonusOf(makeGear(gd('w_soldier'), 1));
    const plus3 = bonusOf({ ...makeGear(gd('w_soldier'), 1), enhance: 3 });
    expect(plus3.atk!).toBeGreaterThan(base.atk!);
  });

  it('강화는 최대 단계에서 멈춘다', () => {
    const max = enhanceMult(GEAR_TUNING.maxEnhance);
    expect(enhanceMult(GEAR_TUNING.maxEnhance + 10)).toBe(max);
  });

  it('crit은 반올림하지 않는다 — 반올림하면 소수점이 통째로 날아간다', () => {
    const g = { ...makeGear(gd('t_charm'), 1), enhance: 1 };
    const b = bonusOf(g);
    expect(b.crit).toBeGreaterThan(0);
    expect(Number.isInteger(b.crit)).toBe(false);
  });

  it('여러 장비의 보정이 합산된다', () => {
    const sum = sumBonus([{ atk: 10, hp: 100 }, { atk: 5, def: 3 }]);
    expect(sum).toEqual({ atk: 15, hp: 100, def: 3 });
  });

  it('착용한 것만 합산한다 — 창고 장비는 세지 않는다', () => {
    const worn = makeGear(gd('w_soldier'), 1);
    const stored = makeGear(gd('w_emberfang'), 2);
    const b = heroBonus({ weapon: worn.instId }, inv([worn, stored]));
    expect(b.atk).toBe(GEAR_DEFS[gd('w_soldier')].base.atk);
  });

  it('장비가 없으면 보정이 없다', () => {
    expect(heroBonus(undefined, inv([]))).toEqual({});
  });

  it('인벤토리에 없는 id는 조용히 무시한다 — 깨진 세이브가 전투를 막으면 안 된다', () => {
    const b = heroBonus({ weapon: 'ghost#1' as GearInstId }, inv([]));
    expect(b).toEqual({});
  });

  it('보정을 얹어도 스탯이 음수가 되지 않는다', () => {
    const base: Stats = { hp: 100, atk: 10, def: 5, spd: 10, crit: 0.05 };
    const out = applyBonus(base, { atk: -999, def: -999, spd: -999, hp: -999 });
    expect(out.atk).toBeGreaterThanOrEqual(0);
    expect(out.def).toBeGreaterThanOrEqual(0);
    expect(out.spd).toBeGreaterThanOrEqual(1);
    expect(out.hp).toBeGreaterThanOrEqual(1);
  });

  it('crit은 0~1 범위를 벗어나지 않는다', () => {
    const base: Stats = { hp: 100, atk: 10, def: 5, spd: 10, crit: 0.9 };
    expect(applyBonus(base, { crit: 5 }).crit).toBeLessThanOrEqual(1);
    expect(applyBonus(base, { crit: -5 }).crit).toBeGreaterThanOrEqual(0);
  });
});

describe('착용 / 해제', () => {
  it('빈 슬롯에 착용하면 벗겨지는 것이 없다', () => {
    const g = makeGear(gd('w_soldier'), 1);
    const r = equip({ hero: hero(HERO.ashen, 2, 15, 1), gearId: g.instId, inventory: inv([g]) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.gear.weapon).toBe(g.instId);
      expect(r.unequipped).toBeNull();
    }
  });

  it('같은 슬롯을 교체하면 이전 것이 벗겨진다', () => {
    const old = makeGear(gd('w_chipped'), 1);
    const neu = makeGear(gd('w_soldier'), 2);
    const h = { ...hero(HERO.ashen, 2, 15, 1), gear: { weapon: old.instId } };
    const r = equip({ hero: h, gearId: neu.instId, inventory: inv([old, neu]) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.gear.weapon).toBe(neu.instId);
      expect(r.unequipped).toBe(old.instId);
    }
  });

  it('다른 슬롯은 서로 밀어내지 않는다', () => {
    const w = makeGear(gd('w_soldier'), 1);
    const a = makeGear(gd('a_guard'), 2);
    const h = { ...hero(HERO.ashen, 2, 15, 1), gear: { weapon: w.instId } };
    const r = equip({ hero: h, gearId: a.instId, inventory: inv([w, a]) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.gear.weapon).toBe(w.instId);
      expect(r.gear.armor).toBe(a.instId);
      expect(r.unequipped).toBeNull();
    }
  });

  it('죽은 영웅에게는 못 채운다', () => {
    const g = makeGear(gd('w_soldier'), 1);
    const dead = { ...hero(HERO.ashen, 2, 15, 1), isDead: true };
    expect(equip({ hero: dead, gearId: g.instId, inventory: inv([g]) }))
      .toEqual({ ok: false, reason: 'hero-dead' });
  });

  it('없는 장비는 못 채운다', () => {
    expect(equip({
      hero: hero(HERO.ashen, 2, 15, 1),
      gearId: 'ghost#1' as GearInstId,
      inventory: inv([]),
    })).toEqual({ ok: false, reason: 'not-owned' });
  });

  /** 조용히 뺏으면 그쪽 전투력이 말없이 떨어진다 */
  it('다른 영웅이 쓰는 장비는 못 뺏는다', () => {
    const g = { ...makeGear(gd('w_soldier'), 1), equippedBy: 'other#9' as HeroInstId };
    expect(equip({ hero: hero(HERO.ashen, 2, 15, 1), gearId: g.instId, inventory: inv([g]) }))
      .toEqual({ ok: false, reason: 'equipped-elsewhere' });
  });

  it('자기가 이미 낀 것을 다시 껴도 문제없다', () => {
    const g = makeGear(gd('w_soldier'), 1);
    const h = hero(HERO.ashen, 2, 15, 1);
    const owned = { ...g, equippedBy: h.instId };
    const r = equip({
      hero: { ...h, gear: { weapon: g.instId } },
      gearId: g.instId,
      inventory: inv([owned]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.unequipped).toBeNull();
  });

  it('해제하면 슬롯이 비고 무엇이 벗겨졌는지 알려준다', () => {
    const g = makeGear(gd('a_guard'), 1);
    const r = unequip({ gear: { armor: g.instId } }, 'armor');
    expect(r.gear.armor).toBeUndefined();
    expect(r.unequipped).toBe(g.instId);
  });

  it('빈 슬롯을 해제해도 안전하다', () => {
    expect(unequip({}, 'weapon').unequipped).toBeNull();
  });
});

describe('사망 시 회수 — 퍼머데스의 무게를 지키는 지점', () => {
  const three = {
    weapon: 'w#1' as GearInstId,
    armor: 'a#1' as GearInstId,
    trinket: 't#1' as GearInstId,
  };

  it('회수율 1이면 전부 돌아온다', () => {
    const r = rollRecovery(three, createRng(1), 1);
    expect(r.recovered).toHaveLength(3);
    expect(r.lost).toHaveLength(0);
  });

  it('회수율 0이면 전부 사라진다', () => {
    const r = rollRecovery(three, createRng(1), 0);
    expect(r.recovered).toHaveLength(0);
    expect(r.lost).toHaveLength(3);
  });

  it('장비가 없으면 잃을 것도 없다', () => {
    const r = rollRecovery(undefined, createRng(1));
    expect(r.recovered).toHaveLength(0);
    expect(r.lost).toHaveLength(0);
  });

  it('모든 장비는 회수 아니면 소실이다 — 사라지거나 복제되지 않는다', () => {
    for (let s = 0; s < 30; s++) {
      const r = rollRecovery(three, createRng(s));
      expect(r.recovered.length + r.lost.length).toBe(3);
      expect(new Set([...r.recovered, ...r.lost]).size).toBe(3);
    }
  });

  it('슬롯마다 독립 판정이라 부분 회수가 나온다', () => {
    let partial = 0;
    for (let s = 0; s < 60; s++) {
      const r = rollRecovery(three, createRng(s));
      if (r.recovered.length > 0 && r.lost.length > 0) partial++;
    }
    expect(partial).toBeGreaterThan(0);
  });

  it('같은 시드면 같은 결과 — 재현성', () => {
    expect(rollRecovery(three, createRng(42))).toEqual(rollRecovery(three, createRng(42)));
  });

  it('기본 회수율은 전부도 전무도 아니다', () => {
    expect(GEAR_TUNING.recoveryRate).toBeGreaterThan(0);
    expect(GEAR_TUNING.recoveryRate).toBeLessThan(1);
  });
});

describe('강화', () => {
  it('성공하면 단계가 오르고 금이 빠진다', () => {
    const g = makeGear(gd('w_soldier'), 1);
    const r = enhance({ gear: g, gold: 10_000, rng: () => 0 }); // 항상 성공
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.success).toBe(true);
      expect(r.gear.enhance).toBe(1);
      expect(r.spent).toBe(enhanceCostOf(0));
    }
  });

  /** 강화 실패까지 파괴로 만들면 상실이 흔해져 퍼머데스의 무게가 줄어든다 */
  it('실패해도 단계가 내려가거나 파괴되지 않는다 — 금만 잃는다', () => {
    const g = { ...makeGear(gd('w_soldier'), 1), enhance: 4 };
    const r = enhance({ gear: g, gold: 10_000, rng: () => 0.999 }); // 항상 실패
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.success).toBe(false);
      expect(r.gear.enhance).toBe(4);
      expect(r.spent).toBeGreaterThan(0);
    }
  });

  it('금이 부족하면 아무 일도 일어나지 않는다', () => {
    const g = makeGear(gd('w_soldier'), 1);
    expect(enhance({ gear: g, gold: 0, rng: () => 0 }))
      .toEqual({ ok: false, reason: 'not-enough-gold' });
  });

  it('만강이면 더 못 올린다', () => {
    const g = { ...makeGear(gd('w_soldier'), 1), enhance: GEAR_TUNING.maxEnhance };
    expect(enhance({ gear: g, gold: 999_999, rng: () => 0 }))
      .toEqual({ ok: false, reason: 'max-enhance' });
  });

  it('단계가 오를수록 비싸지고 어려워진다', () => {
    for (let lv = 1; lv < GEAR_TUNING.maxEnhance; lv++) {
      expect(enhanceCostOf(lv)!).toBeGreaterThan(enhanceCostOf(lv - 1)!);
      expect(enhanceChanceOf(lv)!).toBeLessThanOrEqual(enhanceChanceOf(lv - 1)!);
    }
  });

  it('같은 시드면 같은 결과 — 재현성', () => {
    const g = { ...makeGear(gd('w_soldier'), 1), enhance: 3 };
    const a = enhance({ gear: g, gold: 10_000, rng: createRng(7) });
    const b = enhance({ gear: g, gold: 10_000, rng: createRng(7) });
    expect(a).toEqual(b);
  });
});

describe('가중치 추첨', () => {
  it('가중치 0인 항목은 절대 안 나온다', () => {
    const w = { a: 0, b: 10 };
    for (let s = 0; s < 50; s++) {
      expect(weightedPick(w, createRng(s))).toBe('b');
    }
  });

  it('전부 0이면 null', () => {
    expect(weightedPick({ a: 0, b: 0 }, createRng(1))).toBeNull();
  });

  it('가중치가 큰 쪽이 더 자주 나온다', () => {
    let a = 0;
    for (let s = 0; s < 400; s++) {
      if (weightedPick({ a: 90, b: 10 }, createRng(s)) === 'a') a++;
    }
    expect(a).toBeGreaterThan(250);
  });
});

describe('전투 반영', () => {
  const floor = FLOORS[1];

  it('인벤토리를 안 주면 장비 없이 돈 것과 완전히 같다 — 기존 기준선 보존', () => {
    const a = simulateBattle({
      allies: party(), enemyIds: floor.enemyIds, data: gameData,
      rng: createRng(5), mission: floor.mission,
    });
    const b = simulateBattle({
      allies: party(), enemyIds: floor.enemyIds, data: gameData,
      rng: createRng(5), mission: floor.mission, inventory: new Map(),
    });
    expect(b.turnsElapsed).toBe(a.turnsElapsed);
    expect(b.events.length).toBe(a.events.length);
  });

  it('무기를 끼우면 적을 더 빨리 죽인다', () => {
    const w = { ...makeGear(gd('w_towerbane'), 1), enhance: 5 };
    let faster = 0, slower = 0;
    for (let s = 0; s < 40; s++) {
      const plain = simulateBattle({
        allies: party(), enemyIds: floor.enemyIds, data: gameData,
        rng: createRng(s), mission: floor.mission,
      });
      const p = party();
      p[0] = { ...p[0], gear: { weapon: w.instId } };
      const armed = simulateBattle({
        allies: p, enemyIds: floor.enemyIds, data: gameData,
        rng: createRng(s), mission: floor.mission, inventory: inv([w]),
      });
      if (armed.turnsElapsed < plain.turnsElapsed) faster++;
      if (armed.turnsElapsed > plain.turnsElapsed) slower++;
    }
    expect(faster).toBeGreaterThan(slower);
  });

  it('방어구를 끼우면 최대 HP가 실제로 늘어난다', () => {
    const a = makeGear(gd('a_bulwark'), 1);
    const h = { ...hero(HERO.ashen, 2, 15, 1), gear: { armor: a.instId } };
    const base = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling);
    const geared = applyBonus(base, heroBonus(h.gear, inv([a])));
    expect(geared.hp).toBe(base.hp + GEAR_DEFS[gd('a_bulwark')].base.hp!);
  });

  it('장비를 껴도 결정론이 유지된다', () => {
    const w = makeGear(gd('w_emberfang'), 1);
    const run = () => {
      const p = party();
      p[0] = { ...p[0], gear: { weapon: w.instId } };
      return simulateBattle({
        allies: p, enemyIds: floor.enemyIds, data: gameData,
        rng: createRng(11), mission: floor.mission, inventory: inv([w]),
      });
    };
    expect(run().survivors).toEqual(run().survivors);
  });

  /**
   * "보조적" 강도 검증 — 3슬롯 full 착용이 파티 전투력을 크게 흔들지 않아야 한다.
   * 잠재치 개체차(±8%)보다 크고 등급 차이보다는 작은 자리.
   */
  it('저층 상점 장비 3종 착용은 공격력 +15~30% 안에 든다', () => {
    const w = makeGear(gd('w_soldier'), 1);
    const a = makeGear(gd('a_guard'), 2);
    const t = makeGear(gd('t_swift'), 3);
    const h = {
      ...hero(HERO.ashen, 2, 15, 1),
      gear: { weapon: w.instId, armor: a.instId, trinket: t.instId },
    };
    const base = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling);
    const geared = applyBonus(base, heroBonus(h.gear, inv([w, a, t])));
    const ratio = geared.atk / base.atk;
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.35);
  });
});
