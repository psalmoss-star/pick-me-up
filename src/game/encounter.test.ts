import { describe, it, expect } from 'vitest';
import { runEncounter, findMvp } from './encounter';
import type { BattleData, BattleOutcome } from './battle';
import { createRng } from './rng';
import { klassFor } from './stats';
import { heroes, enemies, skills, starScaling, elementChart, HERO } from './data/sample';
import { FLOORS, floorAt, floorRewards } from './data/floors';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const data = { heroes, enemies, skills, starScaling, elementChart } as unknown as BattleData;

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const party = () => [
  hero(HERO.ashen, 2, 15, 1),
  hero(HERO.bulwark, 2, 15, 2),
  hero(HERO.tide, 3, 20, 3),
];

const run = (floorIndex: number, seed = 11) =>
  runEncounter({ party: party(), floor: floorAt(floorIndex), data, rng: createRng(seed) });

describe('로스터 구성', () => {
  it('영웅 + 적이 모두 로스터에 들어간다', () => {
    const r = run(0); // 1층: 적 2기
    expect(r.roster.filter((u) => u.kind === 'hero')).toHaveLength(3);
    expect(r.roster.filter((u) => u.kind === 'enemy')).toHaveLength(2);
  });

  it('보호 대상이 있는 층은 guard가 로스터에 포함된다', () => {
    const r = run(3); // 4층: 성문
    const guards = r.roster.filter((u) => u.kind === 'guard');
    expect(guards).toHaveLength(1);
    expect(guards[0].name).toBe('성문');
    expect(guards[0].guardKind).toBe('objective');
  });

  it('로스터 uid는 전투 이벤트의 uid와 일치한다', () => {
    const r = run(0);
    const known = new Set(r.roster.map((u) => u.uid));
    const seen = r.events.flatMap((e) => [
      ...(e.targetUids ?? []),
      ...(e.actorUid ? [e.actorUid] : []),
    ]);
    for (const uid of seen) expect(known.has(uid)).toBe(true);
  });

  it('영웅 로스터의 maxHp는 실제 파생 스탯과 같다', () => {
    const r = run(0);
    for (const u of r.roster.filter((x) => x.kind === 'hero')) {
      expect(u.maxHp).toBeGreaterThan(0);
      expect(u.star).toBeGreaterThanOrEqual(1);
      expect(u.defId).toBeTruthy();
    }
  });

  it('사망한 영웅은 출전하지 않는다 (퍼머데스)', () => {
    const withDead = [...party(), { ...hero(HERO.gale, 4, 30, 9), isDead: true }];
    const r = runEncounter({
      party: withDead, floor: floorAt(0), data, rng: createRng(3),
    });
    expect(r.roster.some((u) => u.sourceId === 'h_gale#9')).toBe(false);
  });
});

describe('MVP', () => {
  it('피해를 가장 많이 준 아군이 MVP가 된다', () => {
    const outcome = {
      events: [
        { turn: 1, type: 'damage', actorUid: 'A:h1', amount: 100 },
        { turn: 1, type: 'damage', actorUid: 'A:h2', amount: 250 },
        { turn: 2, type: 'damage', actorUid: 'A:h1', amount: 100 },
      ],
    } as unknown as BattleOutcome;
    expect(findMvp(outcome)).toBe('h2');
  });

  it('적이 준 피해는 MVP 계산에 들어가지 않는다', () => {
    const outcome = {
      events: [
        { turn: 1, type: 'damage', actorUid: 'E:0:e_slime', amount: 9999 },
        { turn: 1, type: 'damage', actorUid: 'A:h1', amount: 10 },
      ],
    } as unknown as BattleOutcome;
    expect(findMvp(outcome)).toBe('h1');
  });

  it('아무도 피해를 주지 못하면 null', () => {
    expect(findMvp({ events: [] } as unknown as BattleOutcome)).toBeNull();
  });

  it('실제 전투에서 MVP는 출전한 영웅 중 하나다', () => {
    const r = run(0);
    if (r.mvp) expect(party().some((h) => h.instId === r.mvp)).toBe(true);
  });
});

describe('층 데이터', () => {
  it('모든 층의 적 정의가 실제로 존재한다', () => {
    for (const f of FLOORS) {
      for (const eid of f.enemyIds) {
        expect(data.enemies[eid], `${f.id}층의 ${eid}`).toBeTruthy();
      }
    }
  });

  it('수비 임무는 objective, 호위 임무는 npc 보호 대상을 가진다', () => {
    for (const f of FLOORS) {
      if (f.mission.kind === 'defend') {
        expect(f.guards?.some((g) => g.kind === 'objective')).toBe(true);
      }
      if (f.mission.kind === 'escort') {
        expect(f.guards?.some((g) => g.kind === 'npc')).toBe(true);
      }
    }
  });

  it('턴 제한이 필요한 임무는 turns가 지정돼 있다', () => {
    for (const f of FLOORS) {
      if (['survive', 'defend', 'escape'].includes(f.mission.kind)) {
        expect(f.mission.turns, `${f.id}층`).toBeGreaterThan(0);
      }
    }
  });

  it('floorAt은 범위를 벗어나면 양 끝으로 고정한다', () => {
    expect(floorAt(-5).id).toBe(FLOORS[0].id);
    expect(floorAt(999).id).toBe(FLOORS[FLOORS.length - 1].id);
  });

  it('보스 층은 승급석을 더 준다', () => {
    const boss = FLOORS.find((f) => f.isBoss)!;
    const normal = FLOORS.find((f) => !f.isBoss)!;
    expect(floorRewards(boss, 10).promotionStones)
      .toBeGreaterThan(floorRewards(normal, 10).promotionStones);
  });
});

describe('임무별 실제 동작', () => {
  it('생존 임무는 요구 턴에 도달하면 승리로 끝난다', () => {
    const r = run(2); // 3층: 6턴 생존
    if (r.outcome === 'victory') expect(r.turnsElapsed).toBeLessThanOrEqual(6);
  });

  it('결정론 — 같은 시드는 같은 결과', () => {
    const a = run(5, 42);
    const b = run(5, 42);
    expect(a.outcome).toBe(b.outcome);
    expect(a.mvp).toBe(b.mvp);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });
});
