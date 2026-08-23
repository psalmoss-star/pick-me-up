/**
 * 편성 파생값 — 배치·속성 구성·자동 편성.
 *
 * 지키려는 것:
 *   1. 역할 5종 전부에 배치가 있다 (누락 시 화면이 undefined를 그린다)
 *   2. 전위 → 중위 → 후위 순으로 정렬된다
 *   3. ⚠️ 속성 집계가 **배수를 만들어 내지 않는다** — 없는 시너지를 지어내면 안 된다
 *   4. 자동 편성이 정원·사망을 지킨다
 */
import { describe, it, expect } from 'vitest';
import { formationOf, elementSpread, pickAutoParty, lineOf } from './formation';
import { ROLE_LINE, LINE_ORDER, ROLE_KR, LINE_KR } from './data/formation';
import { klassFor } from './stats';
import { heroPower } from './power';
import { heroes, starScaling, HERO } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Role, Star } from './types';

const ROLES: Role[] = ['dealer', 'tank', 'healer', 'support', 'breaker'];

const hero = (defId: HeroDefId, star: Star, level: number, n = 0): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

describe('ROLE_LINE — 배치 매핑', () => {
  it('역할 5종 전부에 배치가 있다', () => {
    for (const r of ROLES) {
      expect(LINE_ORDER).toContain(ROLE_LINE[r]);
    }
  });

  it('역할 5종 전부에 한글 라벨이 있다', () => {
    for (const r of ROLES) {
      expect(ROLE_KR[r]).toBeTruthy();
    }
  });

  /**
   * 탱커만 엔진 근거가 있다 — `battle.ts`의 `TANK_AGGRO`로 실제로 먼저 맞는다.
   * 다른 역할이 전위가 되면 그 근거가 사라진다.
   */
  it('전위는 탱커뿐이다 — 엔진 근거가 있는 유일한 칸', () => {
    const front = ROLES.filter((r) => ROLE_LINE[r] === 'front');
    expect(front).toEqual(['tank']);
  });

  it('배치 3종 전부에 한글 라벨이 있다', () => {
    for (const l of LINE_ORDER) expect(LINE_KR[l]).toBeTruthy();
  });
});

describe('formationOf — 정렬', () => {
  it('전위 → 중위 → 후위 순으로 정렬된다', () => {
    // bulwark=tank(전위), ashen=dealer(중위), tide=healer(후위) — 일부러 뒤섞어 넣는다
    const members = [
      hero(HERO.tide, 3, 20, 1),
      hero(HERO.ashen, 2, 15, 2),
      hero(HERO.bulwark, 2, 15, 3),
    ];
    const slots = formationOf(members, heroes, starScaling);
    const order = slots.map((s) => LINE_ORDER.indexOf(s.line));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(slots[0].line).toBe('front');
  });

  it('같은 줄 안에서는 전투력 내림차순이다', () => {
    // 둘 다 dealer(중위)지만 레벨이 다르다
    const members = [hero(HERO.ashen, 2, 5, 1), hero(HERO.ashen, 2, 20, 2)];
    const slots = formationOf(members, heroes, starScaling);
    expect(slots[0].power).toBeGreaterThanOrEqual(slots[1].power);
  });

  it('빈 파티는 빈 배열을 준다 — 화면이 방어 없이 부른다', () => {
    expect(formationOf([], heroes, starScaling)).toEqual([]);
  });

  it('lineOf는 def의 역할을 그대로 따른다', () => {
    expect(lineOf(heroes[HERO.bulwark])).toBe(ROLE_LINE[heroes[HERO.bulwark].role]);
  });
});

describe('elementSpread — 속성 구성', () => {
  it('속성별 인원을 센다', () => {
    const members = [
      hero(HERO.ashen, 2, 10, 1),
      hero(HERO.ashen, 2, 10, 2),
      hero(HERO.tide, 3, 10, 3),
    ];
    const spread = elementSpread(members, heroes);
    const total = spread.reduce((n, x) => n + x.count, 0);
    expect(total).toBe(3);
    // 같은 속성 둘은 하나로 묶인다
    expect(spread.find((x) => x.element === heroes[HERO.ashen].element)?.count).toBe(2);
  });

  it('많은 순으로 정렬된다', () => {
    const members = [
      hero(HERO.ashen, 2, 10, 1),
      hero(HERO.ashen, 2, 10, 2),
      hero(HERO.tide, 3, 10, 3),
    ];
    const counts = elementSpread(members, heroes).map((x) => x.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('빈 파티는 빈 배열이다', () => {
    expect(elementSpread([], heroes)).toEqual([]);
  });

  /**
   * ⚠️ **이 게임에는 파티 단위 속성 시너지가 없다.**
   * 상성표는 공격자↔방어자 1:1로만 적용된다(`battle.ts`).
   * 집계 함수가 배수를 돌려주기 시작하면 화면이 없는 이득을 약속하게 된다.
   */
  it('배수·보너스를 돌려주지 않는다 — 집계만 한다', () => {
    const spread = elementSpread([hero(HERO.ashen, 2, 10, 1)], heroes);
    for (const entry of spread) {
      expect(Object.keys(entry).sort()).toEqual(['count', 'element']);
    }
  });
});

describe('pickAutoParty — 자동 편성', () => {
  const pool = () => [
    hero(HERO.ashen, 2, 5, 1),
    hero(HERO.bulwark, 2, 20, 2),
    hero(HERO.tide, 3, 30, 3),
    hero(HERO.ashen, 2, 12, 4),
  ];

  it('정원을 넘지 않는다', () => {
    expect(pickAutoParty(pool(), heroes, starScaling, 3)).toHaveLength(3);
  });

  /**
   * 특정 영웅을 이름으로 못박지 않는다 — 누가 1등인지는 가중치를 조정하면 바뀐다.
   * 지켜야 하는 것은 "뽑힌 사람이 안 뽑힌 사람보다 약하지 않다"는 성질이다.
   */
  it('전투력 상위부터 고른다', () => {
    const candidates = pool();
    const picked = pickAutoParty(candidates, heroes, starScaling, 2);
    const powerOf = (id: string) => {
      const h = candidates.find((x) => x.instId === id)!;
      return heroPower(h, heroes[h.defId], starScaling);
    };
    const inn = picked.map(powerOf);
    const out = candidates
      .filter((h) => !picked.includes(h.instId))
      .map((h) => heroPower(h, heroes[h.defId], starScaling));

    expect(Math.min(...inn)).toBeGreaterThanOrEqual(Math.max(...out));
    // 내림차순으로 돌려준다
    expect(inn).toEqual([...inn].sort((a, b) => b - a));
  });

  it('사망자를 고르지 않는다', () => {
    const withDead = pool().map((h, i) => (i === 2 ? { ...h, isDead: true } : h));
    const picked = pickAutoParty(withDead, heroes, starScaling, 4);
    expect(picked).not.toContain('h_tide#3');
  });

  it('후보가 정원보다 적으면 있는 만큼만 고른다', () => {
    expect(pickAutoParty(pool().slice(0, 2), heroes, starScaling, 5)).toHaveLength(2);
  });

  it('정원 0이면 아무도 고르지 않는다', () => {
    expect(pickAutoParty(pool(), heroes, starScaling, 0)).toEqual([]);
  });
});
