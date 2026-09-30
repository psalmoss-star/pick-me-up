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
import { formationOf, elementSpread, recommendParty, matchupScore, lineOf } from './formation';
import { enemyKindsOf } from './floorIntel';
import { ROLE_LINE, LINE_ORDER, ROLE_KR, LINE_KR } from './data/formation';
import { klassFor } from './stats';
import { heroes, enemies, skills, elementChart, starScaling, HERO, ENEMY } from './data/sample';
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

describe('recommendParty — 추천 편성과 이유', () => {
  const pool = () => [
    hero(HERO.ashen, 2, 5, 1),
    hero(HERO.bulwark, 2, 20, 2),
    hero(HERO.tide, 3, 30, 3),
    hero(HERO.ashen, 2, 12, 4),
  ];
  const kinds = enemyKindsOf(
    { id: 1, name: '', scene: 'ruins', mission: { kind: 'subjugate', briefing: '' }, enemyIds: [ENEMY.hound] },
    enemies,
  ); // 화 속성 적
  const rec = (members: HeroInstance[], candidates: HeroInstance[], room: number) =>
    recommendParty({ members, candidates, defs: heroes, skills, scaling: starScaling, room, kinds, chart: elementChart });

  it('남은 칸을 넘지 않는다', () => {
    expect(rec([], pool(), 3).ids).toHaveLength(3);
  });
  it('사망자를 고르지 않는다', () => {
    const withDead = pool().map((h, i) => (i === 2 ? { ...h, isDead: true } : h));
    expect(rec([], withDead, 4).ids).not.toContain('h_tide#3');
  });
  it('후보가 칸보다 적으면 있는 만큼만', () => {
    expect(rec([], pool().slice(0, 2), 5).ids).toHaveLength(2);
  });
  it('칸 0이면 빈 추천', () => {
    expect(rec([], pool(), 0)).toEqual({ ids: [], reasons: {} });
  });
  it('편성에 수호가 없으면 수호를 먼저 — 전투력이 낮아도', () => {
    const r = rec([], [hero(HERO.ashen, 4, 60, 1), hero(HERO.bulwark, 1, 1, 2)], 1);
    expect(r.ids).toEqual(['h_bulwark#2']);
    expect(r.reasons['h_bulwark#2' as HeroInstId]).toMatch(/수호/);
  });
  it('이미 수호가 있으면 수호를 우선하지 않는다', () => {
    const r = rec([hero(HERO.bulwark, 3, 30, 9)], [hero(HERO.ashen, 4, 60, 1), hero(HERO.bulwark, 1, 1, 2)], 1);
    expect(r.ids).toEqual(['h_ashen#1']);
  });
  it('치유 스킬 보유자가 없으면 치유자를 먼저 (수호 다음)', () => {
    const r = rec([], [hero(HERO.ashen, 4, 60, 1), hero(HERO.bulwark, 1, 1, 2), hero(HERO.tide, 1, 1, 3)], 2);
    expect(r.ids).toEqual(['h_bulwark#2', 'h_tide#3']);
    expect(r.reasons['h_tide#3' as HeroInstId]).toMatch(/치유/);
  });
  it('나머지는 전투력 × 상성 순 — 유리한 영웅은 이유에 적 종류 수를 말한다', () => {
    // 화 속성 적(hound)에게 수 속성(tide)이 유리하다
    const r = rec([hero(HERO.bulwark, 3, 30, 8), hero('h_ward' as HeroDefId, 3, 30, 9)], [hero(HERO.tide, 3, 30, 3)], 1);
    expect(r.reasons['h_tide#3' as HeroInstId]).toMatch(/1종 중 1종에 유리/);
  });
  it('상성 보정은 정렬 키일 뿐 — 유리 +, 불리 −', () => {
    expect(matchupScore(100, { strong: 1, weak: 0 })).toBeGreaterThan(100);
    expect(matchupScore(100, { strong: 0, weak: 1 })).toBeLessThan(100);
    expect(matchupScore(100, { strong: 0, weak: 0 })).toBe(100);
  });
});
