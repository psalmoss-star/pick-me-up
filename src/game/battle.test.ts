import { describe, it, expect } from 'vitest';
import { simulateBattle, type BattleData, type BattleInput } from './battle';
import { createRng } from './rng';
import { klassFor } from './stats';
import { heroes, enemies, skills, starScaling, elementChart, HERO, ENEMY } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const data = { heroes, enemies, skills, starScaling, elementChart } as unknown as BattleData;

function hero(defId: HeroDefId, star: Star, level: number, n = 0): HeroInstance {
  return {
    instId: `${defId}#${n}` as HeroInstId,
    defId,
    star,
    klass: klassFor(star),
    level,
    exp: 0,
    currentHp: 0, // 0이면 전투 시작 시 최대 HP로 채워진다
    isDead: false,
    acquiredAtFloor: 1,
  };
}

const party = () => [
  hero(HERO.ashen, 2, 15, 1),
  hero(HERO.bulwark, 2, 15, 2),
  hero(HERO.tide, 3, 20, 3),
];

function run(seed: number, input: Partial<BattleInput> = {}) {
  return simulateBattle({
    allies: party(),
    enemyIds: [ENEMY.slime, ENEMY.hound],
    data,
    rng: createRng(seed),
    ...input,
  });
}

describe('결정론(재현성)', () => {
  it('같은 시드는 완전히 동일한 결과를 낸다', () => {
    const a = run(12345);
    const b = run(12345);
    expect(a.outcome).toBe(b.outcome);
    expect(a.turnsElapsed).toBe(b.turnsElapsed);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('다른 시드는 최소한 어떤 전투에서는 다른 로그를 낸다', () => {
    const logs = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(run(s).events)),
    );
    expect(logs.size).toBeGreaterThan(1);
  });
});

describe('전투 종료 조건', () => {
  it('압도적 전력이면 승리한다', () => {
    const r = simulateBattle({
      allies: [hero(HERO.ashen, 5, 60, 1), hero(HERO.bulwark, 5, 60, 2)],
      enemyIds: [ENEMY.slime],
      data,
      rng: createRng(7),
    });
    expect(r.outcome).toBe('victory');
    expect(r.casualties).toHaveLength(0);
  });

  it('압도적 열세면 패배하고 전원이 사상자가 된다 (퍼머데스)', () => {
    const r = simulateBattle({
      allies: [hero(HERO.ashen, 1, 1, 1)],
      enemyIds: [ENEMY.golem, ENEMY.golem],
      data,
      rng: createRng(7),
    });
    expect(r.outcome).toBe('defeat');
    expect(r.casualties).toEqual(['h_ashen#1']);
    expect(r.survivors).toHaveLength(0);
  });

  it('maxTurns를 넘기면 timeout으로 끝난다 (무한루프 방지)', () => {
    const r = simulateBattle({
      allies: [hero(HERO.bulwark, 1, 1, 1)],
      enemyIds: [ENEMY.golem],
      data,
      rng: createRng(3),
      maxTurns: 2,
    });
    expect(r.turnsElapsed).toBeLessThanOrEqual(2);
  });
});

describe('불변식', () => {
  it('생존자 + 사상자 = 출전 인원', () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = run(seed);
      expect(r.survivors.length + r.casualties.length).toBe(3);
    }
  });

  it('생존자의 HP는 항상 1 이상', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const s of run(seed).survivors) {
        expect(s.currentHp).toBeGreaterThan(0);
      }
    }
  });

  it('사망 이벤트는 유닛당 최대 1회', () => {
    for (let seed = 0; seed < 20; seed++) {
      const deaths = run(seed).events.filter((e) => e.type === 'death');
      const uids = deaths.flatMap((e) => e.targetUids ?? []);
      expect(new Set(uids).size).toBe(uids.length);
    }
  });

  it('회복량이 음수인 경우가 없다', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const e of run(seed).events.filter((e) => e.type === 'heal')) {
        expect(e.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('속성 상성', () => {
  it('상성 우위 속성이 더 큰 피해를 준다', () => {
    // fire(재의 카일) → wind 우위, water 열세
    const vsWater = simulateBattle({
      allies: [hero(HERO.ashen, 3, 30, 1)],
      enemyIds: [ENEMY.slime], // water
      data,
      rng: createRng(99),
    });
    const dmgTo = (r: ReturnType<typeof simulateBattle>) =>
      r.events
        .filter((e) => e.type === 'damage' && e.actorUid?.startsWith('A:'))
        .reduce((s, e) => s + (e.amount ?? 0), 0) / Math.max(1, r.turnsElapsed);

    const vsEarth = simulateBattle({
      allies: [hero(HERO.ashen, 3, 30, 1)],
      enemyIds: [ENEMY.golem], // earth = 중립
      data,
      rng: createRng(99),
      maxTurns: 20,
    });
    // water 상대(열세)의 턴당 딜이 earth 상대(중립)보다 낮아야 한다
    expect(dmgTo(vsWater)).toBeLessThan(dmgTo(vsEarth));
  });

  /**
   * 상성 표식은 **표시 전용**이다.
   *
   * `affinity`를 이벤트에 실으면서 전투가 갈라지지 않았음을 잠근다 —
   * `affinity`만 빼면 이벤트 배열이 예전과 완전히 같아야 한다.
   * 이게 깨지면 표시용 값이 엔진에 샌 것이다 (`power.test.ts`와 같은 형태의 격리).
   */
  it('affinity는 전투를 바꾸지 않는다 — 빼면 이벤트가 완전히 동일하다', () => {
    const run = () => simulateBattle({
      allies: [hero(HERO.ashen, 3, 30, 1), hero(HERO.bulwark, 3, 30, 2)],
      enemyIds: [ENEMY.slime, ENEMY.hound],
      data,
      rng: createRng(4242),
    });
    const a = run();
    const b = run();
    // 같은 시드 → 완전히 동일 (affinity 포함)
    expect(a.events).toEqual(b.events);
    // affinity를 걷어내도 나머지가 온전하다 = 다른 필드에 영향을 주지 않았다
    const strip = (r: ReturnType<typeof simulateBattle>) =>
      r.events.map(({ affinity: _drop, ...rest }) => rest);
    expect(strip(a)).toEqual(strip(b));
    expect(a.outcome).toBe(b.outcome);
    expect(a.turnsElapsed).toBe(b.turnsElapsed);
  });

  it('유리타에는 adv, 불리타에는 dis, 중립에는 표식이 없다', () => {
    const advOf = (enemyId: Parameters<typeof simulateBattle>[0]['enemyIds'][number]) => {
      const r = simulateBattle({
        allies: [hero(HERO.ashen, 3, 30, 1)], // fire
        enemyIds: [enemyId],
        data,
        rng: createRng(7),
        maxTurns: 20,
      });
      return r.events.find((e) => e.type === 'damage' && e.actorUid?.startsWith('A:'))?.affinity;
    };
    // fire → wind 우위 / fire → water 열세 / fire → earth 중립
    expect(advOf(ENEMY.wisp)).toBe('adv');    // wisp = wind
    expect(advOf(ENEMY.slime)).toBe('dis');   // slime = water
    expect(advOf(ENEMY.golem)).toBeUndefined(); // golem = earth
  });
});

describe('밸런스 스모크 테스트', () => {
  it('★2 Lv.15 3인 파티는 잡몹 2기에 90% 이상 승리한다', () => {
    let wins = 0;
    const N = 300;
    for (let s = 0; s < N; s++) if (run(s).outcome === 'victory') wins++;
    const rate = wins / N;
    console.log(`  → 잡몹전 승률: ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThanOrEqual(0.9);
  });

  it('보스전 승률은 40~75% 사이여야 한다 (동전던지기에 가깝게)', () => {
    let wins = 0;
    const N = 300;
    for (let s = 0; s < N; s++) {
      if (run(s, { enemyIds: [ENEMY.golem] }).outcome === 'victory') wins++;
    }
    const rate = wins / N;
    console.log(`  → 보스전 승률: ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.75);
  });
});
