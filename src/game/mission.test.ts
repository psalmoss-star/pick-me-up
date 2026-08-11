import { describe, it, expect } from 'vitest';
import { simulateBattle, type BattleData } from './battle';
import { createRng } from './rng';
import { klassFor } from './stats';
import { heroes, enemies, skills, starScaling, elementChart, HERO, ENEMY } from './data/sample';
import type { GuardDef, Mission } from './mission';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const data = { heroes, enemies, skills, starScaling, elementChart } as unknown as BattleData;

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const strongParty = () => [
  hero(HERO.ashen, 4, 60, 1),
  hero(HERO.bulwark, 4, 60, 2),
  hero(HERO.tide, 4, 60, 3),
];
const weakParty = () => [hero(HERO.ashen, 1, 1, 1)];

const run = (mission: Mission, opts: {
  party?: () => HeroInstance[];
  enemyIds?: any[];
  guards?: GuardDef[];
  seed?: number;
} = {}) =>
  simulateBattle({
    allies: (opts.party ?? strongParty)(),
    enemyIds: opts.enemyIds ?? [ENEMY.slime, ENEMY.hound],
    data,
    rng: createRng(opts.seed ?? 11),
    mission,
    guards: opts.guards,
    maxTurns: 40,
  });

describe('토벌', () => {
  it('적을 전멸시키면 승리', () => {
    const r = run({ kind: 'subjugate', briefing: '적을 섬멸하라!' });
    expect(r.outcome).toBe('victory');
  });
});

describe('생존', () => {
  it('요구 턴을 버티면 적이 남아있어도 승리', () => {
    const r = run(
      { kind: 'survive', turns: 5, briefing: '5턴간 살아남아라!' },
      { enemyIds: [ENEMY.golem] },
    );
    expect(r.outcome).toBe('victory');
    expect(r.turnsElapsed).toBe(5);
  });

  it('버티기 전에 전멸하면 패배', () => {
    const r = run(
      { kind: 'survive', turns: 30, briefing: '30턴간 살아남아라!' },
      { party: weakParty, enemyIds: [ENEMY.golem] },
    );
    expect(r.outcome).toBe('defeat');
  });
});

describe('수비', () => {
  const objective = (hp: number): GuardDef[] => [
    { id: 'gate', name: '성문', kind: 'objective', hp, def: 20 },
  ];

  it('오브젝트를 지킨 채 턴을 채우면 승리', () => {
    const r = run(
      { kind: 'defend', turns: 4, briefing: '성문을 사수하라!' },
      { guards: objective(99999) },
    );
    expect(r.outcome).toBe('victory');
  });

  it('오브젝트가 파괴되면 영웅이 멀쩡해도 패배', () => {
    const r = run(
      { kind: 'defend', turns: 30, briefing: '성문을 사수하라!' },
      { guards: objective(1), enemyIds: [ENEMY.hound, ENEMY.hound] },
    );
    expect(r.outcome).toBe('defeat');
    expect(r.survivors.length).toBeGreaterThan(0); // 영웅은 살아있다
  });
});

describe('호위', () => {
  it('NPC가 죽으면 패배', () => {
    const r = run(
      { kind: 'escort', briefing: '황녀를 호위하라!' },
      {
        guards: [{ id: 'princess', name: '황녀', kind: 'npc', hp: 1, def: 0 }],
        enemyIds: [ENEMY.golem], // 오래 버티는 적이라야 호위 실패가 검증된다
      },
    );
    expect(r.outcome).toBe('defeat');
  });

  it('NPC를 살린 채 적을 전멸시키면 승리', () => {
    const r = run(
      { kind: 'escort', briefing: '황녀를 호위하라!' },
      { guards: [{ id: 'princess', name: '황녀', kind: 'npc', hp: 99999, def: 50 }] },
    );
    expect(r.outcome).toBe('victory');
  });

  it('여러 시드에서 호위 실패가 실제로 발생한다 (임무가 형해화되지 않음)', () => {
    let failures = 0;
    for (let seed = 0; seed < 40; seed++) {
      const r = run(
        { kind: 'escort', briefing: '황녀를 호위하라!' },
        {
          guards: [{ id: 'princess', name: '황녀', kind: 'npc', hp: 400, def: 10 }],
          enemyIds: [ENEMY.golem],
          seed,
        },
      );
      if (r.outcome === 'defeat') failures++;
    }
    expect(failures).toBeGreaterThan(0);
  });
});

describe('탈취', () => {
  it('지정한 적만 처치하면 나머지가 살아있어도 승리', () => {
    const r = run(
      { kind: 'seize', targetIndex: 0, briefing: '보석을 지키는 수호자를 처치하라!' },
      { enemyIds: [ENEMY.slime, ENEMY.golem] },
    );
    expect(r.outcome).toBe('victory');
    // 골렘은 아직 살아있어야 한다 (턴 수가 짧음)
    expect(r.turnsElapsed).toBeLessThan(10);
  });
});

describe('공통 불변식', () => {
  it('어떤 임무든 보호 대상은 사상자 목록에 포함되지 않는다', () => {
    const r = run(
      { kind: 'defend', turns: 3, briefing: '사수하라!' },
      { guards: [{ id: 'gate', name: '성문', kind: 'objective', hp: 1, def: 0 }] },
    );
    for (const c of r.casualties) expect(c).not.toContain('gate');
    for (const s of r.survivors) expect(s.instId).not.toContain('gate');
  });
});
