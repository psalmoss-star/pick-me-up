/**
 * 출정 준비 한 수 — 순수 로직.
 *
 * 계획: ~/.claude/plans/6-modular-snail.md
 * 엔진 통합(재현성)은 `prepBattle.test.ts`, 스토어 규칙은 `stores/prep.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { applyPrep, PREP_MIN_TURNS } from './prep';
import { PREP_BY_MISSION, prepForMission, prepById } from './data/preps';
import { FLOORS } from './data/floors';
import { MISSION_LABEL, type MissionKind } from './mission';
import type { FloorSpec } from './data/floors';

const KINDS = Object.keys(MISSION_LABEL) as MissionKind[];

/** 그 임무를 쓰는 실제 층 하나 */
const floorOf = (kind: MissionKind): FloorSpec => {
  const f = FLOORS.find((x) => x.mission.kind === kind);
  if (!f) throw new Error(`${kind} 층이 없다 — 테스트 전제가 깨졌다`);
  return f;
};

describe('준비 정의', () => {
  it('임무 6종 전부에 준비가 있다', () => {
    // 하나라도 빠지면 그 층 브리핑에 살 것이 없다
    for (const kind of KINDS) {
      expect(PREP_BY_MISSION[kind]).toBeDefined();
      expect(PREP_BY_MISSION[kind].cost).toBeGreaterThan(0);
    }
  });

  it('축은 셋뿐이다', () => {
    // ⚠️ 여기가 늘면 새 밸런스 축을 만든 것이다. 조용히 늘면 안 된다.
    const axes = new Set(Object.values(PREP_BY_MISSION).map((p) => p.effect.axis));
    expect([...axes].sort()).toEqual(['atk', 'guardHp', 'turns']);
  });

  it('id가 전부 다르다', () => {
    const ids = Object.values(PREP_BY_MISSION).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('100층 전부가 살 수 있는 준비를 갖는다', () => {
    // 임무가 늘거나 생성기가 바뀌어도 "살 게 없는 층"이 생기면 안 된다
    for (const f of FLOORS) {
      expect(prepForMission(f.mission.kind)).toBeDefined();
    }
  });

  it('prepById는 없는 id에 null을 준다', () => {
    expect(prepById(null)).toBeNull();
    expect(prepById('nope' as never)).toBeNull();
    expect(prepById('edge')?.id).toBe('edge');
  });
});

describe('applyPrep — 준비가 없으면 아무 일도 없다', () => {
  it('null이면 층을 같은 참조로 돌려주고 배수는 1이다', () => {
    // 참조까지 같아야 "기존과 완전히 동일"이 구조적으로 보장된다
    const floor = floorOf('subjugate');
    const out = applyPrep(floor, null);
    expect(out.floor).toBe(floor);
    expect(out.atkMult).toBe(1);
  });
});

describe('applyPrep — 원본을 절대 고치지 않는다', () => {
  /*
    ⚠️ 이 파일에서 가장 중요한 테스트다.

    FLOORS는 모듈 전역 배열이고 생성 층은 캐시된다. 제자리 변형(`floor.mission.turns -= 2`)을
    하면 그 다음 전투와 다른 화면까지 영구히 오염된다 — 화면에는 안 보이고
    승률만 조용히 틀어진다.
  */
  it('6종 전부 — 호출 전후로 원본이 불변이다', () => {
    for (const kind of KINDS) {
      const floor = floorOf(kind);
      const before = JSON.stringify(floor);

      applyPrep(floor, prepForMission(kind));

      expect(JSON.stringify(floor)).toBe(before);
    }
  });

  it('보호 대상 배열도 원소까지 새로 만든다', () => {
    const floor = floorOf('defend');
    const out = applyPrep(floor, prepForMission('defend'));

    expect(out.floor).not.toBe(floor);
    expect(out.floor.guards).not.toBe(floor.guards);
    expect(out.floor.guards![0]).not.toBe(floor.guards![0]);
  });
});

describe('applyPrep — 축 A: 아군 화력', () => {
  it('atk 준비는 배수만 올리고 층은 안 건드린다', () => {
    const floor = floorOf('subjugate');
    const prep = prepForMission('subjugate');
    const out = applyPrep(floor, prep);

    expect(out.floor).toBe(floor);
    expect(out.atkMult).toBeGreaterThan(1);
    if (prep.effect.axis === 'atk') expect(out.atkMult).toBe(prep.effect.mult);
  });
});

describe('applyPrep — 축 B: 보호 대상 내구', () => {
  it('보호 대상 hp가 오른다', () => {
    const floor = floorOf('defend');
    const prep = prepForMission('defend');
    const out = applyPrep(floor, prep);

    expect(out.floor.guards![0].hp).toBeGreaterThan(floor.guards![0].hp);
    expect(out.atkMult).toBe(1);
  });

  it('def는 안 건드린다', () => {
    // 방어는 적의 defDown과 방어 상수에 얽혀 있어 별개 축이다
    const floor = floorOf('escort');
    const out = applyPrep(floor, prepForMission('escort'));
    expect(out.floor.guards![0].def).toBe(floor.guards![0].def);
  });

  it('보호 대상이 없는 층이면 무효다', () => {
    const floor = floorOf('subjugate');
    const out = applyPrep(floor, PREP_BY_MISSION.defend);
    expect(out.floor).toBe(floor);
    expect(out.atkMult).toBe(1);
  });
});

describe('applyPrep — 축 C: 임무 요구치', () => {
  it('요구 턴이 준다', () => {
    const floor = floorOf('survive');
    const out = applyPrep(floor, prepForMission('survive'));

    expect(out.floor.mission.turns).toBeLessThan(floor.mission.turns!);
    expect(out.atkMult).toBe(1);
  });

  it('요구 턴은 하한 아래로 안 내려간다', () => {
    /*
      ⚠️ 0이 되면 1턴차에 즉시 승리라 전투가 아예 안 돈다.
      실제 층은 6~10턴이라 이 경로를 안 밟지만, 층을 조이면 밟게 된다.
    */
    const tight: FloorSpec = {
      ...floorOf('survive'),
      mission: { ...floorOf('survive').mission, turns: 1 },
    };
    const out = applyPrep(tight, prepForMission('survive'));
    expect(out.floor.mission.turns).toBe(PREP_MIN_TURNS);
  });

  it('요구 턴이 없는 임무면 무효다', () => {
    const floor = floorOf('subjugate');
    const out = applyPrep(floor, PREP_BY_MISSION.survive);
    expect(out.floor).toBe(floor);
  });
});

describe('applyPrep — 결정론', () => {
  it('같은 입력은 항상 같은 출력이다', () => {
    for (const kind of KINDS) {
      const floor = floorOf(kind);
      const a = applyPrep(floor, prepForMission(kind));
      const b = applyPrep(floor, prepForMission(kind));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
