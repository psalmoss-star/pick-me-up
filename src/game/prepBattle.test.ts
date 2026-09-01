/**
 * 준비 한 수 × 전투 엔진 — 재현성과 효과.
 *
 * `intervention.test.ts:112-135`의 3단 패턴을 그대로 쓴다.
 * 새 전투 입력을 더할 때의 정본이다:
 *   1. 빈 값이면 기존과 **바이트 단위로 동일** (하위 호환)
 *   2. 값을 넣으면 결과가 **달라진다** (테스트가 실제로 뭔가를 잰다는 증거)
 *   3. 같은 값 + 같은 시드 = 완전히 동일 (재현성)
 *
 * 2번이 없으면 "아무것도 안 하는 준비"를 팔면서 테스트가 통과한다 —
 * `FORGE_RATE`의 Lv.0=Lv.1 함정이 그렇게 났다.
 */
import { describe, it, expect } from 'vitest';
import { applyPrep } from './prep';
import { prepForMission } from './data/preps';
import { runEncounter } from './encounter';
import { createRng } from './rng';
import { klassFor } from './stats';
import { gameData, FLOORS } from './data';
import { HERO } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';
import type { FloorSpec } from './data/floors';
import type { MissionKind } from './mission';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const party = () => [
  hero(HERO.ashen, 3, 25, 1),
  hero(HERO.bulwark, 3, 25, 2),
  hero(HERO.tide, 3, 25, 3),
];

const floorOf = (kind: MissionKind): FloorSpec => {
  const f = FLOORS.find((x) => x.mission.kind === kind);
  if (!f) throw new Error(`${kind} 층이 없다`);
  return f;
};

/** 준비를 적용해 한 판 돌린다. prep이 null이면 기존 경로와 같아야 한다 */
function run(kind: MissionKind, seed: number, withPrep: boolean) {
  const floor = floorOf(kind);
  const p = applyPrep(floor, withPrep ? prepForMission(kind) : null);
  return runEncounter({
    party: party(),
    floor: p.floor,
    data: gameData,
    rng: createRng(seed),
    allyAtkMult: p.atkMult,
  });
}

describe('1. 준비가 없으면 기존 동작과 완전히 같다 (하위 호환)', () => {
  it('applyPrep(null)을 거친 전투가 직접 호출과 바이트 단위로 같다', () => {
    // 이게 sim·climb-check 기준선이 보존된다는 구조적 근거다
    for (const kind of ['subjugate', 'defend', 'survive'] as MissionKind[]) {
      const floor = floorOf(kind);
      const direct = runEncounter({
        party: party(), floor, data: gameData, rng: createRng(7),
      });
      const through = run(kind, 7, false);
      expect(JSON.stringify(through.events)).toBe(JSON.stringify(direct.events));
    }
  });
});

describe('2. 준비를 넣으면 결과가 달라진다', () => {
  /*
    ⚠️ 효과가 0인 손잡이를 팔지 않기 위한 테스트다.
    축 3개를 각각 대표하는 임무로 확인한다. 여러 시드를 도는 이유는
    한 시드에서 우연히 같은 로그가 나올 수 있기 때문이다.
  */
  const differsInSomeSeed = (kind: MissionKind) =>
    [1, 2, 3, 4, 5, 6, 7, 8].some(
      (s) => JSON.stringify(run(kind, s, true).events)
        !== JSON.stringify(run(kind, s, false).events),
    );

  it('축 A(화력) — 토벌에서 로그가 달라진다', () => {
    expect(differsInSomeSeed('subjugate')).toBe(true);
  });

  it('축 B(보호 대상) — 수비에서 로그가 달라진다', () => {
    expect(differsInSomeSeed('defend')).toBe(true);
  });

  it('축 C(요구 턴) — 생존에서 더 일찍 끝난다', () => {
    // 요구 턴이 줄었으므로 승리까지의 턴이 짧아져야 한다
    const withPrep = run('survive', 11, true);
    const without = run('survive', 11, false);
    expect(withPrep.turnsElapsed).toBeLessThan(without.turnsElapsed);
  });
});

describe('3. 같은 준비 + 같은 시드 = 완전히 동일 (재현성)', () => {
  it('6종 전부 재현된다', () => {
    const kinds: MissionKind[] = [
      'subjugate', 'seize', 'defend', 'escort', 'survive', 'escape',
    ];
    for (const kind of kinds) {
      const a = run(kind, 99, true);
      const b = run(kind, 99, true);
      expect(a.outcome).toBe(b.outcome);
      expect(a.turnsElapsed).toBe(b.turnsElapsed);
      expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    }
  });
});

describe('준비는 도움이 되는 방향으로 작동한다', () => {
  /*
    방향성 확인. 승률을 미는 것이 목적이므로 "달라졌다"만으로는 부족하다 —
    나쁜 쪽으로 달라져도 통과하기 때문이다.

    ⚠️ **위험한 층을 골라야 한다.** 처음엔 첫 수비 층(4층)으로 쟀는데
    거기는 기준 파티가 40/40으로 이미 다 이겨서 보호 대상이 죽지 않는다 —
    체력을 더 줘도 잴 것이 없어 "효과 0"으로 보였다.
    §"승률이 0%/100%에 붙어 있으면 스탯 조정에 반응하지 않는다"와 같은 모양이다.
  */
  const nthFloor = (kind: MissionKind, n: number) => {
    const list = FLOORS.filter((f) => f.mission.kind === kind);
    if (list.length <= n) throw new Error(`${kind} 층이 ${n + 1}개 미만이다`);
    return list[n];
  };

  const winsOver = (floor: FloorSpec, withPrep: boolean, seeds: number) => {
    const prep = withPrep ? prepForMission(floor.mission.kind) : null;
    let wins = 0;
    for (let s = 1; s <= seeds; s++) {
      const p = applyPrep(floor, prep);
      const r = runEncounter({
        party: party(), floor: p.floor, data: gameData,
        rng: createRng(s), allyAtkMult: p.atkMult,
      });
      if (r.outcome === 'victory') wins++;
    }
    return wins;
  };

  it('수비 — 보호 대상이 살아남아 승률이 오른다 (15층 실측 18→40)', () => {
    const floor = nthFloor('defend', 2);
    expect(winsOver(floor, true, 40)).toBeGreaterThan(winsOver(floor, false, 40));
  });
});
