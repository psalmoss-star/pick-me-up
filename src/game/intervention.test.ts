import { describe, it, expect } from 'vitest';
import {
  canIntervene, nextAvailableTurn, lastInterventionTurn,
  activeAt, retreatedAt, focusTargetAt, guardedAt,
  INTERVENTION_COOLDOWN, type Intervention,
} from './intervention';
import { simulateBattle, type BattleData } from './battle';
import { createRng } from './rng';
import { klassFor } from './stats';
import { heroes, enemies, skills, starScaling, elementChart, HERO, ENEMY } from './data/sample';
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

const iv = (turn: number, kind: Intervention['kind'], targetId: string): Intervention =>
  ({ turn, kind, targetId });

// ============================================================
// 사용 규칙
// ============================================================

describe('개입 사용 규칙', () => {
  it('아무것도 안 썼으면 개입할 수 있다', () => {
    expect(canIntervene(1, [])).toBe(true);
  });

  it('같은 턴에 두 번 개입할 수 없다', () => {
    const used = [iv(3, 'guard', 'h1')];
    expect(canIntervene(3, used)).toBe(false);
  });

  it('쿨다운 중에는 개입할 수 없다', () => {
    const used = [iv(3, 'guard', 'h1')];
    // COOLDOWN이 2면 4턴은 막히고 5턴부터 가능
    expect(canIntervene(3 + INTERVENTION_COOLDOWN - 1, used)).toBe(false);
    expect(canIntervene(3 + INTERVENTION_COOLDOWN, used)).toBe(true);
  });

  it('쿨다운이 지나면 다시 개입할 수 있다', () => {
    const used = [iv(1, 'focus', 'E:0')];
    expect(canIntervene(1 + INTERVENTION_COOLDOWN, used)).toBe(true);
  });

  it('여러 번 썼으면 가장 최근 개입 기준으로 쿨다운을 잰다', () => {
    const used = [iv(1, 'focus', 'E:0'), iv(5, 'guard', 'h1')];
    expect(lastInterventionTurn(used)).toBe(5);
    expect(canIntervene(6, used)).toBe(false);
    expect(canIntervene(7, used)).toBe(true);
  });

  it('0턴 이하에는 개입할 수 없다', () => {
    expect(canIntervene(0, [])).toBe(false);
  });

  it('nextAvailableTurn은 다음 가능 턴을 알려준다', () => {
    expect(nextAvailableTurn([])).toBe(1);
    expect(nextAvailableTurn([iv(4, 'retreat', 'h1')])).toBe(4 + INTERVENTION_COOLDOWN);
  });
});

// ============================================================
// 조회
// ============================================================

describe('턴별 발효 조회', () => {
  it('발효 턴에만 활성화된다', () => {
    const list = [iv(3, 'guard', 'h1')];
    expect(activeAt(list, 2)).toHaveLength(0);
    expect(activeAt(list, 3)).toHaveLength(1);
    expect(activeAt(list, 4)).toHaveLength(0); // 지속 1턴
  });

  it('종류별로 분리해서 조회된다', () => {
    const list = [
      iv(2, 'retreat', 'h_ashen#1'),
      iv(2, 'guard', 'h_bulwark#2'),
      iv(2, 'focus', 'E:0:e_slime'),
    ];
    expect(retreatedAt(list, 2).has('h_ashen#1')).toBe(true);
    expect(guardedAt(list, 2).has('h_bulwark#2')).toBe(true);
    expect(focusTargetAt(list, 2)).toBe('E:0:e_slime');
  });

  it('해당 턴에 개입이 없으면 비어 있다', () => {
    const list = [iv(5, 'retreat', 'h1')];
    expect(retreatedAt(list, 1).size).toBe(0);
    expect(focusTargetAt(list, 1)).toBeNull();
  });
});

// ============================================================
// 전투 엔진 통합 — 개입이 실제로 전투를 바꾸는가
// ============================================================

const run = (interventions: Intervention[], seed = 7, enemyIds = [ENEMY.slime, ENEMY.hound]) =>
  simulateBattle({
    allies: party(), enemyIds, data, rng: createRng(seed),
    interventions, maxTurns: 40,
  });

describe('전투 엔진 통합', () => {
  it('개입이 없으면 기존 동작과 완전히 같다 (하위 호환)', () => {
    const without = simulateBattle({
      allies: party(), enemyIds: [ENEMY.slime, ENEMY.hound],
      data, rng: createRng(7), maxTurns: 40,
    });
    const withEmpty = run([]);
    expect(JSON.stringify(withEmpty.events)).toBe(JSON.stringify(without.events));
  });

  it('개입을 넣으면 결과가 달라진다', () => {
    const base = run([]);
    const withIv = run([iv(1, 'focus', 'E:0:e_slime')]);
    expect(JSON.stringify(withIv.events)).not.toBe(JSON.stringify(base.events));
  });

  it('같은 개입 + 같은 시드는 완전히 동일한 결과 (재현성 유지)', () => {
    const list = [iv(2, 'guard', 'h_bulwark#2'), iv(4, 'retreat', 'h_ashen#1')];
    const a = run(list, 99);
    const b = run(list, 99);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });
});

describe('집중', () => {
  it('지정한 적에게 아군의 단일 공격이 몰린다', () => {
    const target = 'E:1:e_hound';
    const r = run([iv(1, 'focus', target)]);

    // 1턴에 아군이 가한 단일 대상 피해는 전부 지정 적에게 가야 한다
    const allyHits = r.events.filter(
      (e) => e.turn === 1 && e.type === 'damage' && e.actorUid?.startsWith('A:'),
    );
    const singleTargetHits = allyHits.filter((e) => (e.targetUids ?? []).length === 1);
    expect(singleTargetHits.length).toBeGreaterThan(0);
    for (const e of singleTargetHits) {
      expect(e.targetUids?.[0]).toBe(target);
    }
  });

  it('적의 타겟팅에는 영향을 주지 않는다', () => {
    // 집중은 아군 공격만 몰아준다. 적이 아군을 고르는 방식은 그대로.
    const r = run([iv(1, 'focus', 'E:0:e_slime')]);
    const enemyHits = r.events.filter(
      (e) => e.turn === 1 && e.type === 'damage' && e.actorUid?.startsWith('E:'),
    );
    for (const e of enemyHits) {
      expect(e.targetUids?.[0]?.startsWith('E:')).toBe(false);
    }
  });
});

describe('수호', () => {
  it('수호 대상에게 방어 상태가 부여된다', () => {
    const r = run([iv(1, 'guard', 'h_bulwark#2')]);
    const applied = r.events.find(
      (e) => e.turn === 1 && e.type === 'statusApplied'
        && e.status === 'defUp' && e.targetUids?.[0] === 'A:h_bulwark#2',
    );
    expect(applied).toBeTruthy();
  });

  it('수호받은 영웅은 같은 상황에서 피해를 덜 받는다', () => {
    // 골렘 상대로 탱커를 수호했을 때 누적 피해 비교
    const damageTo = (uid: string, interventions: Intervention[]) =>
      run(interventions, 5, [ENEMY.golem]).events
        .filter((e) => e.type === 'damage' && e.targetUids?.[0] === uid && e.turn <= 2)
        .reduce((s, e) => s + (e.amount ?? 0), 0);

    const uid = 'A:h_bulwark#2';
    const guarded = damageTo(uid, [iv(1, 'guard', 'h_bulwark#2')]);
    const plain = damageTo(uid, []);
    // 같은 시드에서 방어가 오르면 피해가 줄어야 한다 (피격이 발생한 경우)
    if (plain > 0 && guarded > 0) expect(guarded).toBeLessThan(plain);
  });
});

describe('후퇴', () => {
  it('후퇴한 영웅은 그 턴에 행동하지 않는다', () => {
    const r = run([iv(1, 'retreat', 'h_ashen#1')]);
    const acted = r.events.some(
      (e) => e.turn === 1 && e.type === 'skillUse' && e.actorUid === 'A:h_ashen#1',
    );
    expect(acted).toBe(false);
  });

  it('후퇴한 영웅은 그 턴에 공격받지 않는다', () => {
    const r = run([iv(1, 'retreat', 'h_ashen#1')], 3, [ENEMY.golem]);
    const hit = r.events.some(
      (e) => e.turn === 1 && e.type === 'damage'
        && e.targetUids?.[0] === 'A:h_ashen#1' && e.actorUid?.startsWith('E:'),
    );
    expect(hit).toBe(false);
  });

  it('후퇴 이벤트가 로그에 남는다', () => {
    const r = run([iv(2, 'retreat', 'h_tide#3')]);
    const ev = r.events.find((e) => e.type === 'retreat' && e.turn === 2);
    expect(ev?.targetUids?.[0]).toBe('A:h_tide#3');
  });

  it('다음 턴에는 정상 복귀한다', () => {
    const r = run([iv(1, 'retreat', 'h_ashen#1')]);
    const actedLater = r.events.some(
      (e) => e.turn >= 2 && e.type === 'skillUse' && e.actorUid === 'A:h_ashen#1',
    );
    expect(actedLater).toBe(true);
  });

  it('후퇴로 영웅을 살릴 수 있다 (퍼머데스 구제)', () => {
    // 압도적 열세에서 1턴 후퇴시키면 그 턴만큼은 죽지 않는다
    const weak = [hero(HERO.ashen, 1, 1, 1)];
    const withRetreat = simulateBattle({
      allies: weak, enemyIds: [ENEMY.golem], data, rng: createRng(7),
      interventions: [iv(1, 'retreat', 'h_ashen#1')], maxTurns: 1,
    });
    expect(withRetreat.casualties).toHaveLength(0);
  });
});

describe('치명타 이벤트', () => {
  it('damage 이벤트에 isCrit이 담긴다', () => {
    // 여러 시드를 돌리면 치명타가 최소 한 번은 난다
    let sawCrit = false;
    let sawNonCrit = false;
    for (let s = 0; s < 40 && !(sawCrit && sawNonCrit); s++) {
      for (const e of run([], s).events) {
        if (e.type !== 'damage') continue;
        if (e.isCrit === true) sawCrit = true;
        if (e.isCrit === false) sawNonCrit = true;
      }
    }
    expect(sawCrit).toBe(true);
    expect(sawNonCrit).toBe(true);
  });
});
