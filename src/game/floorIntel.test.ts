/**
 * 편성 판단 보조 — 다음 층 적 종류 · 상성 집계 · 역할 경고.
 *
 * 지키려는 것:
 *   1. ⚠️ 적 **수**를 돌려주지 않는다 — 수·전력은 정찰 보고(STEP 60)의 영역이다
 *   2. 상성은 기존 `elementChart`만 읽는다 (새 배수를 만들지 않는다)
 *   3. 경고는 엔진에 실제로 있는 것만 — 치유는 역할이 아니라 **스킬**로 판정한다
 */
import { describe, it, expect } from 'vitest';
import { enemyKindsOf, matchupOf, compositionWarnings, canHeal, type EnemyKind } from './floorIntel';
import { heroes, enemies, skills, elementChart, ENEMY, HERO } from './data/sample';
import { klassFor } from './stats';
import type { FloorSpec } from './data/floors';
import type { Element, HeroDefId, HeroInstId, HeroInstance } from './types';

const floor = (enemyIds: FloorSpec['enemyIds']): FloorSpec => ({
  id: 1, name: '시험', scene: 'ruins', mission: { kind: 'subjugate', briefing: '' }, enemyIds,
});

const hero = (defId: HeroDefId, n = 0): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star: 3, klass: klassFor(3), level: 10, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const kind = (element: Element): EnemyKind =>
  ({ defId: ENEMY.slime, name: 'x', element, role: 'dealer', isBoss: false });

describe('enemyKindsOf — 적 종류', () => {
  it('같은 적이 여럿이어도 종류는 하나다 — 수를 돌려주지 않는다', () => {
    const k = enemyKindsOf(floor([ENEMY.slime, ENEMY.slime, ENEMY.slime, ENEMY.hound]), enemies);
    expect(k.map((x) => x.defId)).toEqual([ENEMY.slime, ENEMY.hound]);
    expect(Object.keys(k[0]).sort()).toEqual(['defId', 'element', 'isBoss', 'name', 'role']);
  });
  it('속성·역할·이름을 적 정의에서 가져온다', () => {
    const [s] = enemyKindsOf(floor([ENEMY.slime]), enemies);
    expect(s).toMatchObject({ name: enemies[ENEMY.slime].name, element: 'water', role: 'dealer' });
  });
  it('모르는 적 id는 건너뛴다', () => {
    expect(enemyKindsOf(floor(['e_nope' as never, ENEMY.hound]), enemies)).toHaveLength(1);
  });
});

describe('matchupOf — 상성 집계', () => {
  // 순환: 화 → 풍 → 지 → 뇌 → 수 → 화
  it('화 속성: 풍에게 강하고 수에게 약하다', () => {
    expect(matchupOf('fire', [kind('wind')], elementChart)).toEqual({ strong: 1, weak: 0 });
    expect(matchupOf('fire', [kind('water')], elementChart)).toEqual({ strong: 0, weak: 1 });
    expect(matchupOf('fire', [kind('earth')], elementChart)).toEqual({ strong: 0, weak: 0 });
  });
  it('적 종류마다 센다', () => {
    expect(matchupOf('fire', [kind('wind'), kind('wind'), kind('water')], elementChart))
      .toEqual({ strong: 2, weak: 1 });
  });
});

describe('canHeal — 치유 판정은 스킬로', () => {
  it('치유 역할(세인)은 치유한다', () => {
    expect(canHeal(heroes[HERO.tide], skills)).toBe(true);
  });
  it('보조 역할이라도 치유 스킬이 있으면 치유한다 (h_ward의 sk_mend)', () => {
    expect(heroes['h_ward' as HeroDefId].role).toBe('support');
    expect(canHeal(heroes['h_ward' as HeroDefId], skills)).toBe(true);
  });
  it('공격수는 치유하지 않는다', () => {
    expect(canHeal(heroes[HERO.ashen], skills)).toBe(false);
  });
});

describe('compositionWarnings — 역할 경고', () => {
  const kinds = enemyKindsOf(floor([ENEMY.slime]), enemies); // 수 속성 적
  const warn = (ids: HeroDefId[], k = kinds) =>
    compositionWarnings(ids.map((d, i) => hero(d, i)), heroes, skills, k, elementChart).map((w) => w.kind);

  it('빈 편성은 경고하지 않는다', () => {
    expect(warn([])).toEqual([]);
  });
  it('수호·치유가 다 있으면 역할 경고 없음', () => {
    expect(warn([HERO.bulwark, HERO.tide, HERO.bolt])).not.toContain('noTank');
    expect(warn([HERO.bulwark, HERO.tide, HERO.bolt])).not.toContain('noHealer');
  });
  it('수호가 없으면 noTank', () => {
    expect(warn([HERO.tide, HERO.bolt])).toContain('noTank');
  });
  it('치유 스킬 보유자가 없으면 noHealer — 보조 치유자가 있으면 안 뜬다', () => {
    expect(warn([HERO.bulwark, HERO.ashen])).toContain('noHealer');
    expect(warn([HERO.bulwark, 'h_ward' as HeroDefId])).not.toContain('noHealer');
  });
  it('편성 절반 이상이 한 적 속성에 약하면 weakMajority — 그 속성을 알려 준다', () => {
    // 수 속성 적은 화 속성을 1.5배로 때린다
    const out = compositionWarnings(
      [hero(HERO.ashen, 0), hero(HERO.cinder, 1), hero(HERO.bulwark, 2)],
      heroes, skills, kinds, elementChart,
    );
    expect(out).toContainEqual({ kind: 'weakMajority', element: 'water' });
  });
  it('절반 미만이면 weakMajority 없음', () => {
    expect(warn([HERO.ashen, HERO.bulwark, HERO.tide])).not.toContain('weakMajority');
  });
  it('경고는 배수·퍼센트를 담지 않는다 — 없는 수치를 약속하지 않는다', () => {
    const out = compositionWarnings([hero(HERO.ashen)], heroes, skills, kinds, elementChart);
    expect(JSON.stringify(out)).not.toMatch(/\d/);
  });
});
