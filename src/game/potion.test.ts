/**
 * 포션 테스트.
 *
 * 포션은 **전투 전 입력**이다 — 개입과 같은 원칙이라 재현성이 유지되어야 한다.
 * 전투 중 조작이 되면 시드 재현이 무너지고 밸런싱 수단을 잃는다 (HANDOFF §5-8).
 */
import { describe, it, expect } from 'vitest';
import { simulateBattle } from './battle';
import { createRng } from './rng';
import { klassFor } from './stats';
import { POTION_TUNING } from './data/gear';
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

/** 보스층 — 소모가 깊어 포션이 실제로 터진다 */
const boss = FLOORS[5];

const run = (potions: number, seed: number) => simulateBattle({
  allies: party(), enemyIds: boss.enemyIds, data: gameData,
  rng: createRng(seed), mission: boss.mission, guards: boss.guards, potions,
});

const potionHeals = (r: ReturnType<typeof run>) =>
  r.events.filter((e) => e.type === 'heal' && e.fromPotion);

describe('포션 튜닝', () => {
  it('발동 임계는 위급한 구간이다 — 너무 높으면 낭비, 낮으면 발동 전에 죽는다', () => {
    expect(POTION_TUNING.triggerAt).toBeGreaterThan(0.1);
    expect(POTION_TUNING.triggerAt).toBeLessThan(0.6);
  });

  it('회복량이 임계보다 커야 한 대 더 버틴다', () => {
    expect(POTION_TUNING.healRatio).toBeGreaterThan(POTION_TUNING.triggerAt * 0.5);
  });

  it('전투당 상한이 있다 — 무한히 들고 가면 사망이 사라진다', () => {
    expect(POTION_TUNING.maxPerBattle).toBeGreaterThan(0);
    expect(POTION_TUNING.maxPerBattle).toBeLessThanOrEqual(5);
  });
});

describe('전투 중 발동', () => {
  it('포션이 없으면 발동하지 않는다', () => {
    for (let s = 0; s < 10; s++) {
      expect(potionHeals(run(0, s))).toHaveLength(0);
    }
  });

  it('들고 간 수를 넘겨 터지지 않는다', () => {
    for (let s = 0; s < 20; s++) {
      expect(potionHeals(run(2, s)).length).toBeLessThanOrEqual(2);
    }
  });

  it('위급해지면 실제로 터진다', () => {
    let fired = 0;
    for (let s = 0; s < 20; s++) {
      if (potionHeals(run(3, s)).length > 0) fired++;
    }
    expect(fired).toBeGreaterThan(0);
  });

  it('회복량이 0보다 크다 — 만피에게 낭비되지 않는다', () => {
    for (let s = 0; s < 20; s++) {
      for (const e of potionHeals(run(3, s))) {
        expect(e.amount ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('포션 회복은 스킬 회복과 구분된다', () => {
    const r = run(3, 3);
    const all = r.events.filter((e) => e.type === 'heal');
    const byPotion = all.filter((e) => e.fromPotion);
    // 포션 이벤트에는 시전자가 없다 — 물약이 터진 것이지 누가 걸어준 게 아니다
    for (const e of byPotion) expect(e.actorUid).toBeUndefined();
    expect(all.length).toBeGreaterThanOrEqual(byPotion.length);
  });

  /** 개입과 같은 원칙 — 전투 전 입력이므로 재현성이 유지되어야 한다 */
  it('같은 시드 + 같은 개수 = 같은 결과', () => {
    const a = run(3, 42);
    const b = run(3, 42);
    expect(b.events.length).toBe(a.events.length);
    expect(b.survivors).toEqual(a.survivors);
    expect(b.outcome).toBe(a.outcome);
  });

  it('포션을 더 들고 가면 덜 죽는다', () => {
    let none = 0, full = 0;
    for (let s = 0; s < 60; s++) {
      none += run(0, s).casualties.length;
      full += run(POTION_TUNING.maxPerBattle, s).casualties.length;
    }
    expect(full).toBeLessThan(none);
  });

  it('음수나 소수를 넘겨도 안전하다', () => {
    expect(potionHeals(run(-5, 1))).toHaveLength(0);
    expect(potionHeals(run(1.7, 1)).length).toBeLessThanOrEqual(1);
  });
});
