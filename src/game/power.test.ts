/**
 * 전투력 — 표시 전용 요약값.
 *
 * 지키려는 것:
 *   1. 단조성 — 스탯이 오르면 전투력이 내려가지 않는다
 *   2. hp가 전투력을 지배하지 않는다 (가중치 도출 근거의 회귀 감지선)
 *   3. `favorite`가 전투력에 안 들어간다 (types.ts의 명시적 금지)
 *   4. ⭐ **전투 엔진과 격리돼 있다** — 가중치를 바꿔도 전투 결과가 같다
 */
import { describe, it, expect } from 'vitest';
import { combatPower, heroPower, partyPower } from './power';
import { simulateBattle, type BattleData } from './battle';
import { createRng } from './rng';
import { klassFor } from './stats';
import { heroes, enemies, skills, starScaling, elementChart, HERO, ENEMY } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star, Stats } from './types';

const data = { heroes, enemies, skills, starScaling, elementChart } as unknown as BattleData;

const S = (o: Partial<Stats> = {}): Stats =>
  ({ hp: 1000, atk: 100, def: 50, spd: 30, crit: 0.1, ...o });

const hero = (defId: HeroDefId, star: Star, level: number, n = 0): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

describe('combatPower — 단조성과 경계', () => {
  it('모든 스탯이 0이어도 1 이상을 돌려준다', () => {
    expect(combatPower(S({ hp: 0, atk: 0, def: 0, spd: 0, crit: 0 }))).toBeGreaterThanOrEqual(1);
  });

  it('어떤 스탯이 올라도 전투력이 내려가지 않는다', () => {
    const base = combatPower(S());
    for (const k of ['hp', 'atk', 'def', 'spd'] as const) {
      expect(combatPower(S({ [k]: S()[k] + 100 }))).toBeGreaterThan(base);
    }
    expect(combatPower(S({ crit: 0.5 }))).toBeGreaterThan(base);
  });

  /**
   * hp는 vit*20 스케일이라 가중치를 안 맞추면 전투력의 90%를 먹는다.
   * 능력치 1점의 기여가 스탯별로 비슷해야 한다 — 2배를 넘으면 가중치가 낡은 것이다.
   */
  it('hp가 전투력을 지배하지 않는다', () => {
    const zero = combatPower(S({ hp: 0, atk: 0, def: 0, spd: 0, crit: 0 }));
    // 능력치 1점이 만드는 스탯: vit→hp 20, str→atk 6, agi→spd 3
    const byVit = combatPower(S({ hp: 20, atk: 0, def: 0, spd: 0, crit: 0 })) - zero;
    const byStr = combatPower(S({ hp: 0, atk: 6, def: 0, spd: 0, crit: 0 })) - zero;
    const byAgi = combatPower(S({ hp: 0, atk: 0, def: 0, spd: 3, crit: 0 })) - zero;

    const lo = Math.min(byVit, byStr, byAgi);
    const hi = Math.max(byVit, byStr, byAgi);
    expect(hi).toBeLessThanOrEqual(lo * 2);
  });

  it('crit는 상한에서도 atk 기여를 압도하지 않는다', () => {
    const zero = combatPower(S({ hp: 0, atk: 0, def: 0, spd: 0, crit: 0 }));
    const byCrit = combatPower(S({ hp: 0, atk: 0, def: 0, spd: 0, crit: 0.6 })) - zero;
    const byAtk = combatPower(S({ hp: 0, atk: 600, def: 0, spd: 0, crit: 0 })) - zero;
    expect(byCrit).toBeLessThan(byAtk);
  });
});

describe('heroPower', () => {
  it('레벨이 오르면 전투력이 오른다', () => {
    const lo = heroPower(hero(HERO.ashen, 2, 5), heroes[HERO.ashen], starScaling);
    const hi = heroPower(hero(HERO.ashen, 2, 15), heroes[HERO.ashen], starScaling);
    expect(hi).toBeGreaterThan(lo);
  });

  it('seed가 없는 구세이브 개체도 예외 없이 계산된다', () => {
    const legacy = hero(HERO.ashen, 2, 10);
    expect(legacy.seed).toBeUndefined();
    expect(heroPower(legacy, heroes[HERO.ashen], starScaling)).toBeGreaterThan(0);
  });

  it('장비 보정을 넘기면 전투력이 오른다', () => {
    const h = hero(HERO.ashen, 2, 10);
    const bare = heroPower(h, heroes[HERO.ashen], starScaling);
    const armed = heroPower(h, heroes[HERO.ashen], starScaling, { atk: 50, hp: 200 });
    expect(armed).toBeGreaterThan(bare);
  });

  /**
   * ⚠️ `types.ts`가 명시적으로 금지한다 —
   * "표식은 전투력·확률·밸런스 어디에도 들어가지 않는다".
   */
  it('❖ 표식을 뒤집어도 전투력이 바뀌지 않는다', () => {
    const plain = hero(HERO.ashen, 2, 10);
    const marked = { ...plain, favorite: true };
    expect(heroPower(marked, heroes[HERO.ashen], starScaling))
      .toBe(heroPower(plain, heroes[HERO.ashen], starScaling));
  });
});

describe('partyPower', () => {
  it('구성원의 합이다 — 시너지 배수를 얹지 않는다', () => {
    expect(partyPower([100, 250, 30])).toBe(380);
  });

  it('빈 파티는 0이다', () => {
    expect(partyPower([])).toBe(0);
  });
});

/**
 * ⭐ **이 파일에서 가장 중요한 테스트.**
 *
 * "전투력은 표시 전용이라 밸런스가 안 움직인다"는 주장을 코드로 증명한다.
 * 나중에 누가 전투력을 엔진에 끼워 넣으면 여기가 먼저 깨진다.
 */
describe('전투 엔진과의 격리', () => {
  const run = (seed: number) => simulateBattle({
    allies: [
      hero(HERO.ashen, 2, 15, 1),
      hero(HERO.bulwark, 2, 15, 2),
      hero(HERO.tide, 3, 20, 3),
    ],
    enemyIds: [ENEMY.slime, ENEMY.hound],
    data,
    rng: createRng(seed),
  });

  it('전투는 전투력을 참조하지 않는다 — 같은 시드면 이벤트가 완전히 동일하다', () => {
    const a = run(12345);
    // 전투력을 잔뜩 계산해 본다. 엔진이 이걸 읽는다면 상태가 오염될 것이다.
    for (const h of [HERO.ashen, HERO.bulwark, HERO.tide]) {
      heroPower(hero(h, 6, 99), heroes[h], starScaling, { atk: 9999, hp: 9999 });
    }
    const b = run(12345);

    expect(a.outcome).toBe(b.outcome);
    expect(a.turnsElapsed).toBe(b.turnsElapsed);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('battle.ts는 power를 import하지 않는다', async () => {
    // 정적 검사 — 의존이 생기면 이 테스트의 의도를 다시 읽게 된다
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./battle.ts', import.meta.url), 'utf8'));
    expect(src).not.toMatch(/from '\.\/power'/);
    expect(src).not.toMatch(/from '\.\/data\/power'/);
  });
});
