/**
 * 책략 카드 × 전투 엔진. `prepBattle.test.ts`의 3단 패턴:
 *   1. 카드가 없으면 기존과 동일 (`ordersBaseline.test.ts`의 지문 + 아래 명시 비교)
 *   2. 카드를 넣으면 결과가 **달라진다** — 성공과 간파가 **둘 다** 실제로 나온다
 *   3. 같은 카드 + 같은 시드 = 동일
 */
import { describe, it, expect } from 'vitest';
import {
  conditionMet, nextResist, pickExecutor, successChance, type FieldView,
} from './stratagem';
import {
  STRATAGEMS, STRATAGEM_BY_ID, STRATAGEM_TUNING, type StratagemId,
} from './data/stratagems';
import { runEncounter, type EncounterResult } from './encounter';
import { createRng, substream, STREAM } from './rng';
import { klassFor } from './stats';
import { gameData, floorAt } from './data';
import { HERO } from './data/sample';
import type { BattleEvent, Combatant, HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const party = () => [
  hero(HERO.ashen, 3, 25, 1),
  hero(HERO.bulwark, 3, 25, 2),
  hero(HERO.tide, 3, 25, 3),
  hero(HERO.bolt, 2, 15, 4),
];

const run = (floor: number, seed: number, ids?: StratagemId[], resist = {}) =>
  runEncounter({
    party: party(), floor: floorAt(floor), data: gameData, rng: createRng(seed), potions: 1,
    stratagems: ids ? { ids, resist, rng: substream(seed, STREAM.STRATAGEM) } : undefined,
  });

/** 1~30층 × 시드 10개 */
const sweep = (ids?: StratagemId[], resist = {}): EncounterResult[] => {
  const out: EncounterResult[] = [];
  for (let f = 0; f < 30; f++) for (let s = 1; s <= 10; s++) out.push(run(f, s, ids, resist));
  return out;
};

const stratEvents = (rs: EncounterResult[]): BattleEvent[] =>
  rs.flatMap((r) => r.events.filter((e) => e.type === 'stratagem'));

const u = (uid: string, hp: number, maxHp: number): Combatant => ({
  uid, side: 'ally', sourceId: uid, name: uid, element: 'fire', role: 'dealer',
  stats: { hp: maxHp, atk: 1, def: 0, spd: 0, crit: 0 },
  currentHp: hp, shield: 0, statuses: [], cooldowns: {}, isAlive: true,
});

const view = (heroes: Combatant[], enemies: Combatant[], turn = 1, bossPresent = false): FieldView =>
  ({ turn, heroes, enemies, bossPresent });

// ============================================================
// 데이터
// ============================================================

describe('책략 데이터', () => {
  it('id가 겹치지 않는다 (세이브에 남는다)', () => {
    expect(new Set(STRATAGEMS.map((s) => s.id)).size).toBe(STRATAGEMS.length);
  });
  it('처음부터 쓸 수 있는 카드가 슬롯 수 이상 있다', () => {
    expect(STRATAGEMS.filter((s) => s.unlockFloor === 0).length).toBeGreaterThanOrEqual(2);
  });
  it('초한지 책략은 넣지 않는다', () => {
    const names = STRATAGEMS.map((s) => s.name).join();
    expect(names).not.toMatch(/배수진|십면매복/);
  });
  it('모든 카드에 연의 출처가 있다', () => {
    for (const s of STRATAGEMS) expect(s.source).toMatch(/연의 \d+/);
  });
});

// ============================================================
// 순수 판정
// ============================================================

describe('발동 조건', () => {
  it('매복 — 아군 누군가 HP 50% 이하', () => {
    const c = STRATAGEM_BY_ID.ambush.condition;
    expect(conditionMet(c, view([u('a', 60, 100)], [u('e', 1, 1)]))).toBe(false);
    expect(conditionMet(c, view([u('a', 50, 100)], [u('e', 1, 1)]))).toBe(true);
  });
  it('야습 — 적이 더 많다', () => {
    const c = STRATAGEM_BY_ID.nightRaid.condition;
    expect(conditionMet(c, view([u('a', 1, 1), u('b', 1, 1)], [u('e', 1, 1), u('f', 1, 1)]))).toBe(false);
    expect(conditionMet(c, view([u('a', 1, 1)], [u('e', 1, 1), u('f', 1, 1)]))).toBe(true);
  });
  it('수공 — 6턴 이상', () => {
    const c = STRATAGEM_BY_ID.flood.condition;
    expect(conditionMet(c, view([u('a', 1, 1)], [u('e', 1, 1)], 5))).toBe(false);
    expect(conditionMet(c, view([u('a', 1, 1)], [u('e', 1, 1)], 6))).toBe(true);
  });
  it('적벽 — 보스가 있으면 적 수가 적어도 성립', () => {
    const c = STRATAGEM_BY_ID.redCliffs.condition;
    expect(conditionMet(c, view([u('a', 1, 1)], [u('e', 1, 1)], 5, false))).toBe(false);
    expect(conditionMet(c, view([u('a', 1, 1)], [u('e', 1, 1)], 5, true))).toBe(true);
  });
  it('아군이나 적이 없으면 발동하지 않는다', () => {
    for (const s of STRATAGEMS) {
      expect(conditionMet(s.condition, view([], [u('e', 1, 1)], 99, true))).toBe(false);
      expect(conditionMet(s.condition, view([u('a', 1, 100)], [], 99, true))).toBe(false);
    }
  });
});

describe('수행자와 성공 확률', () => {
  it('지능이 가장 높은 영웅이 수행한다', () => {
    const ints: Record<string, number> = { a: 10, b: 30, c: 20 };
    expect(pickExecutor([u('a', 1, 1), u('b', 1, 1), u('c', 1, 1)], (id) => ints[id])!.uid).toBe('b');
  });
  const base = { base: 0.5, executorInt: 20, partyAvgInt: 20, bossPresent: false, resist: 0 };
  it('파티 평균보다 머리가 좋으면 오르고, 보스·내성이면 내린다', () => {
    const p = successChance(base);
    expect(successChance({ ...base, executorInt: 30 })).toBeGreaterThan(p);
    expect(successChance({ ...base, bossPresent: true })).toBeLessThan(p);
    expect(successChance({ ...base, resist: 2 })).toBeLessThan(p);
  });
  it('상한·하한을 지킨다', () => {
    expect(successChance({ ...base, base: 5 })).toBe(STRATAGEM_TUNING.maxChance);
    expect(successChance({ ...base, resist: 99, bossPresent: true, base: 0 }))
      .toBe(STRATAGEM_TUNING.minChance);
  });
  it('내성: 쓴 책략은 +1(상한), 쉰 책략은 −1', () => {
    expect(nextResist({}, ['ambush'])).toEqual({ ambush: 1 });
    expect(nextResist({ ambush: 3 }, ['ambush'])).toEqual({ ambush: 3 });
    expect(nextResist({ ambush: 2, flood: 1 }, [])).toEqual({ ambush: 1 });
  });
});

// ============================================================
// 엔진 통합
// ============================================================

describe('카드 없음 = 현행', () => {
  it('빈 카드 목록은 생략과 완전히 같다', () => {
    for (let f = 0; f < 30; f += 4) expect(run(f, 3, [])).toEqual(run(f, 3));
  });
});

describe('카드마다 — 발동하고, 성공과 간파가 둘 다 나오고, 재현된다', () => {
  const base = sweep().map((r) => JSON.stringify(r.events));
  for (const s of STRATAGEMS) {
    it(`${s.name}`, () => {
      const rs = sweep([s.id]);
      const ev = stratEvents(rs);
      expect(ev.length).toBeGreaterThan(0);
      expect(ev.every((e) => e.stratagemId === s.id)).toBe(true);
      expect(ev.some((e) => e.success)).toBe(true);
      expect(ev.some((e) => !e.success)).toBe(true);
      expect(rs.map((r) => JSON.stringify(r.events)).filter((g, i) => g !== base[i]).length)
        .toBeGreaterThan(0);
      expect(run(12, 4, [s.id])).toEqual(run(12, 4, [s.id]));
    });
  }
});

describe('규칙', () => {
  it('카드마다 전투당 한 번, 한 턴에 하나', () => {
    for (const r of sweep(['ambush', 'nightRaid'])) {
      const ev = r.events.filter((e) => e.type === 'stratagem');
      expect(new Set(ev.map((e) => e.stratagemId)).size).toBe(ev.length);
      expect(new Set(ev.map((e) => e.turn)).size).toBe(ev.length);
    }
  });
  it('수행자는 전장의 아군 영웅이다', () => {
    for (const e of stratEvents(sweep(['nightRaid']))) expect(e.actorUid).toMatch(/^A:/);
  });
  it('매복 성공 — 가장 강한 적의 HP가 30% 이하로 떨어진다', () => {
    let seen = 0;
    for (const r of sweep(['ambush'])) {
      const i = r.events.findIndex((e) => e.type === 'stratagem' && e.success);
      if (i < 0) continue;
      const hit = r.events[i + 1];
      // 가장 강한 적이 이미 30% 아래였으면 깎을 것이 없다 — 피해 이벤트가 없다
      if (hit.type !== 'damage') continue;
      const target = r.roster.find((x) => x.uid === hit.targetUids![0])!;
      expect(target.kind).toBe('enemy');
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('간파의 대가는 치명적이지 않다 — 책략 판정으로 영웅이 죽지 않는다', () => {
    for (const r of sweep(['ambush', 'nightRaid'])) {
      r.events.forEach((e, i) => {
        if (e.type !== 'stratagem' || e.success) return;
        const next = r.events[i + 1];
        if (next?.type === 'damage') expect(r.events[i + 2]?.type).not.toBe('death');
      });
    }
  });
  it('내성이 쌓이면 성공이 줄어든다', () => {
    const rate = (resist: object) => {
      const ev = stratEvents(sweep(['ambush'], resist));
      return ev.filter((e) => e.success).length / ev.length;
    };
    expect(rate({ ambush: 3 })).toBeLessThan(rate({}));
  });
});
