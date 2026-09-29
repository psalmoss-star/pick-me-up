/**
 * 작전 카드 × 전투 엔진.
 *
 * `prepBattle.test.ts`의 3단 패턴을 따른다:
 *   1. 기본값이면 기존과 동일 (`ordersBaseline.test.ts`가 1~30층 지문으로 잠근다)
 *   2. 카드를 넣으면 결과가 **달라진다**
 *   3. 같은 카드 + 같은 시드 = 완전히 동일
 */
import { describe, it, expect } from 'vitest';
import {
  attackCandidates, protecteeUids, sanitizeOrders, DEFAULT_ORDERS, type Orders,
} from './orders';
import { canWithdraw, withdrawnBy, type Intervention } from './intervention';
import { runEncounter, type EncounterResult } from './encounter';
import { createRng } from './rng';
import { klassFor } from './stats';
import { gameData, floorAt } from './data';
import { HERO, enemies, skills } from './data/sample';
import { CRISIS_HP_RATIO } from './data/orders';
import type {
  Combatant, EnemyDefId, HeroDefId, HeroInstId, HeroInstance, Role, Star,
} from './types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

// 탱커(bulwark)·힐러(tide)·딜러 — 세 방침이 전부 밟히는 편성
const party = () => [
  hero(HERO.ashen, 3, 25, 1),
  hero(HERO.bulwark, 3, 25, 2),
  hero(HERO.tide, 3, 25, 3),
  hero(HERO.bolt, 2, 15, 4),
];

const run = (floor: number, seed: number, orders?: Orders, interventions?: Intervention[]) =>
  runEncounter({
    party: party(), floor: floorAt(floor), data: gameData, rng: createRng(seed),
    potions: 1, orders, interventions,
  });

/** 1~20층 × 시드 5개 */
const sweep = (orders?: Orders): EncounterResult[] => {
  const out: EncounterResult[] = [];
  for (let f = 0; f < 20; f++) for (let seed = 1; seed <= 5; seed++) out.push(run(f, seed, orders));
  return out;
};

const with_ = (patch: Partial<Orders>): Orders => ({ ...DEFAULT_ORDERS, ...patch });

const unit = (uid: string, role: Role, hp: number, maxHp: number, atk: number): Combatant => ({
  uid, side: 'enemy', sourceId: uid, name: uid, element: 'fire', role,
  stats: { hp: maxHp, atk, def: 0, spd: 0, crit: 0 },
  currentHp: hp, shield: 0, statuses: [], cooldowns: {}, isAlive: true,
});

const roleOfEnemyUid = (uid: string): Role =>
  enemies[uid.split(':')[2] as EnemyDefId].role;

// ============================================================
// 순수 함수
// ============================================================

describe('카드 값 검증', () => {
  it('모르는 값은 기본값으로 돌린다 (옛·손상 세이브)', () => {
    expect(sanitizeOrders(undefined)).toEqual(DEFAULT_ORDERS);
    expect(sanitizeOrders({ attack: 'nuke', protect: 1, fallback: 'hp99' })).toEqual(DEFAULT_ORDERS);
  });
  it('아는 값은 그대로 둔다', () => {
    const o: Orders = { attack: 'backline', protect: 'healer', fallback: 'hp30' };
    expect(sanitizeOrders(o)).toEqual(o);
  });
});

describe('공격 방침 후보', () => {
  const pool = [
    unit('tank', 'tank', 50, 100, 10),
    unit('dealer', 'dealer', 80, 100, 40),
    unit('healer', 'healer', 30, 100, 5),
  ];
  const atk = (c: Combatant) => c.stats.atk;

  it('자유면 null — 엔진이 현행 규칙으로 고른다', () => {
    expect(attackCandidates('free', pool, atk)).toBeNull();
  });
  it('약한 적 = 남은 HP가 가장 적은 적', () => {
    expect(attackCandidates('weakest', pool, atk)!.map((c) => c.uid)).toEqual(['healer']);
  });
  it('강한 적 = 공격력이 가장 높은 적', () => {
    expect(attackCandidates('strongest', pool, atk)!.map((c) => c.uid)).toEqual(['dealer']);
  });
  it('후열 = 탱커를 뺀 적. 탱커만 남으면 탱커', () => {
    expect(attackCandidates('backline', pool, atk)!.map((c) => c.uid)).toEqual(['dealer', 'healer']);
    expect(attackCandidates('backline', [pool[0]], atk)!.map((c) => c.uid)).toEqual(['tank']);
  });
});

describe('보호 대상', () => {
  const heroes = [
    unit('t', 'tank', 90, 100, 1),
    unit('h', 'healer', 60, 100, 1),
    unit('d', 'dealer', 20, 100, 1),
  ];
  it('자유면 아무도 지키지 않는다', () => {
    expect(protecteeUids('free', heroes).size).toBe(0);
  });
  it('치유자 = 힐러 전원', () => {
    expect([...protecteeUids('healer', heroes)]).toEqual(['h']);
  });
  it('가장 약한 아군 = HP 비율이 가장 낮은 영웅', () => {
    expect([...protecteeUids('weakest', heroes)]).toEqual(['d']);
  });
});

describe('후퇴 신호 사용 규칙', () => {
  it('전투당 1회', () => {
    expect(canWithdraw([])).toBe(true);
    expect(canWithdraw([{ turn: 3, kind: 'withdraw', targetId: 'x' }])).toBe(false);
  });
  it('발효 턴부터 끝까지 이탈 상태다', () => {
    const list: Intervention[] = [{ turn: 3, kind: 'withdraw', targetId: 'x' }];
    expect(withdrawnBy(list, 2).has('x')).toBe(false);
    expect(withdrawnBy(list, 3).has('x')).toBe(true);
    expect(withdrawnBy(list, 30).has('x')).toBe(true);
  });
});

// ============================================================
// 엔진 통합
// ============================================================

describe('기본값 = 현행', () => {
  it('DEFAULT_ORDERS를 명시해도 생략과 완전히 같다', () => {
    for (let f = 0; f < 20; f += 3) {
      expect(run(f, 7, { ...DEFAULT_ORDERS })).toEqual(run(f, 7));
    }
  });
  it('기본값에서는 cover·withdraw 이벤트가 하나도 없다', () => {
    for (const r of sweep()) {
      expect(r.events.some((e) => e.type === 'cover' || e.type === 'withdraw')).toBe(false);
      expect(r.withdrawn).toEqual([]);
    }
  });
});

describe('카드마다 결과가 달라지고, 재현된다', () => {
  const cards: Array<[string, Orders]> = [
    ['약한 적', with_({ attack: 'weakest' })],
    ['강한 적', with_({ attack: 'strongest' })],
    ['후열', with_({ attack: 'backline' })],
    ['치유자 보호', with_({ protect: 'healer' })],
    ['약한 아군 보호', with_({ protect: 'weakest' })],
    ['퇴각 50%', with_({ fallback: 'hp50' })],
    ['퇴각 15%', with_({ fallback: 'hp15' })],
  ];
  const base = sweep().map((r) => JSON.stringify(r.events));

  for (const [name, orders] of cards) {
    it(`${name}: 기준과 다른 전투가 나온다`, () => {
      const got = sweep(orders).map((r) => JSON.stringify(r.events));
      expect(got.filter((g, i) => g !== base[i]).length).toBeGreaterThan(0);
    });
    it(`${name}: 같은 카드 + 같은 시드 = 동일`, () => {
      expect(run(9, 3, orders)).toEqual(run(9, 3, orders));
    });
  }
});

describe('공격 방침 — 후열', () => {
  it('적 비탱커가 살아 있는 동안 아군 단일 공격은 적 탱커로 가지 않는다', () => {
    let checked = 0;
    for (const r of sweep(with_({ attack: 'backline' }))) {
      const enemyUids = r.roster.filter((u) => u.kind === 'enemy').map((u) => u.uid);
      const dead = new Set<string>();
      for (const e of r.events) {
        if (e.type === 'death') for (const t of e.targetUids ?? []) dead.add(t);
        if (e.type !== 'skillUse' || !e.actorUid?.startsWith('A:')) continue;
        const sk = skills[e.skillId!];
        if (sk.targetScope !== 'single' || sk.targetSide !== 'enemy') continue;
        const target = e.targetUids![0];
        const backAlive = enemyUids.some((u) => !dead.has(u) && roleOfEnemyUid(u) !== 'tank');
        if (roleOfEnemyUid(target) === 'tank') expect(backAlive).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('보호 방침', () => {
  it('치유자 보호: 막아서는 것은 아군 탱커, 막아지는 것은 힐러', () => {
    const covers = sweep(with_({ protect: 'healer' }))
      .flatMap((r) => r.events.filter((e) => e.type === 'cover'));
    expect(covers.length).toBeGreaterThan(0);
    for (const e of covers) {
      expect(e.actorUid).toBe(`A:${HERO.bulwark}#2`);
      expect(e.targetUids).toEqual([`A:${HERO.tide}#3`]);
    }
  });
  it('막아선 직후의 피격은 탱커가 받는다', () => {
    for (const r of sweep(with_({ protect: 'healer' }))) {
      r.events.forEach((e, i) => {
        if (e.type !== 'cover') return;
        const use = r.events[i + 1];
        expect(use.type).toBe('skillUse');
        expect(use.targetUids).toEqual([e.actorUid]);
      });
    }
  });
});

describe('퇴각 방침 — 이탈', () => {
  const results = sweep(with_({ fallback: 'hp50' }));

  it('이탈한 영웅이 실제로 나온다', () => {
    expect(results.some((r) => r.withdrawn.length > 0)).toBe(true);
  });
  it('이탈한 영웅은 생존자이고 사망자가 아니다', () => {
    for (const r of results) {
      const alive = new Set(r.survivors.map((s) => s.instId));
      for (const id of r.withdrawn) {
        expect(alive.has(id)).toBe(true);
        expect(r.casualties).not.toContain(id);
      }
    }
  });
  it('이탈 뒤에는 맞지도, 회복받지도, 행동하지도 않는다', () => {
    for (const r of results) {
      const gone = new Set<string>();
      for (const e of r.events) {
        if (e.type === 'withdraw') { gone.add(e.targetUids![0]); continue; }
        if (e.actorUid && gone.has(e.actorUid)) throw new Error(`이탈한 ${e.actorUid}가 행동했다`);
        for (const t of e.targetUids ?? []) {
          if (gone.has(t) && e.type !== 'statusExpired') throw new Error(`이탈한 ${t}가 ${e.type} 대상이 됐다`);
        }
      }
    }
  });
  it('전장에 남은 인원이 전멸하면 패배로 끝난다 (이탈자로 전투가 늘어지지 않는다)', () => {
    for (const r of results) {
      const inField = r.survivors.filter((s) => !r.withdrawn.includes(s.instId));
      if (inField.length === 0) expect(r.outcome).toBe('defeat');
    }
  });
});

describe('후퇴 신호', () => {
  it('지정한 영웅이 그 턴부터 이탈하고 생존한다', () => {
    const id = `${HERO.ashen}#1`;
    const r = run(9, 2, undefined, [{ turn: 3, kind: 'withdraw', targetId: id }]);
    const ev = r.events.find((e) => e.type === 'withdraw');
    expect(ev?.turn).toBe(3);
    expect(ev?.targetUids).toEqual([`A:${id}`]);
    expect(r.withdrawn).toEqual([id]);
    expect(r.casualties).not.toContain(id);
  });
});

describe('위기 기록', () => {
  it('어떤 전투에서는 위기가 기록되고, 그 순간 영웅 HP는 기준 이하다', () => {
    const rs = sweep();
    const withCrisis = rs.filter((r) => r.crisis);
    expect(withCrisis.length).toBeGreaterThan(0);
    for (const r of withCrisis) {
      const c = r.crisis!;
      expect(c.uid.startsWith('A:')).toBe(true);
      expect(c.at).toBeGreaterThan(0);
      expect(c.at).toBeLessThanOrEqual(r.events.length);
      // HP를 되짚어 확인 — 시작 HP는 최대치(currentHp 0 = 만피)
      const max = r.roster.find((u) => u.uid === c.uid)!.maxHp;
      let hp = max;
      for (const e of r.events.slice(0, c.at)) {
        if (!(e.targetUids ?? []).includes(c.uid)) continue;
        if (e.type === 'damage') hp -= e.amount ?? 0;
        if (e.type === 'heal') hp = Math.min(max, hp + (e.amount ?? 0));
      }
      // 보호막 흡수분만큼 되짚은 HP가 실제보다 낮을 수 있다 → 상한만 본다
      expect(hp).toBeLessThanOrEqual(max * CRISIS_HP_RATIO);
    }
  });
});
