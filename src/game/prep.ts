/**
 * 출정 준비 한 수 — 전투 입력 변환. STEP 49.
 *
 * 설계 원칙 (`intervention.ts`와 같다):
 * - 이 파일은 순수하다. React/DOM 의존 없음.
 * - **새로운 밸런스 축을 만들지 않는다.** 전투 엔진이 이미 받는 입력만 바꾼다.
 * - 준비는 **전투 입력**이지 전투 중 조작이 아니다. 시드 고정 재현성이 깨지면 안 된다.
 * - RNG를 받지 않는다. 같은 입력에 항상 같은 출력이다 (`craft.ts`와 같은 원칙).
 *
 * 엔진(`battle.ts`·`mission.ts`·`encounter.ts`)은 준비를 **모른다.**
 * 호출부가 엔진을 부르기 전에 입력을 이 함수로 통과시킬 뿐이다.
 */
import type { FloorSpec } from './data/floors';
import type { PrepDef } from './data/preps';

/**
 * 요구 턴의 바닥.
 *
 * ⚠️ 0이 되면 **1턴차에 즉시 승리**해서 전투가 아예 안 돈다.
 * `evaluateMission`이 `turn >= turns`로 판정하기 때문이다.
 */
export const PREP_MIN_TURNS = 1;

export interface PreppedInputs {
  /** 변형된 층. 준비가 없으면 **인자와 같은 참조**를 돌려준다 */
  floor: FloorSpec;
  /**
   * 준비 몫의 아군 공격력 배수. 준비가 없으면 1.
   *
   * ⚠️ 시설(무기창고) 배수와 **곱하는 것은 호출부의 몫**이다.
   * 여기서 합치면 시설 규칙이 두 곳으로 갈라진다.
   */
  atkMult: number;
}

/**
 * 준비 한 수를 전투 입력에 반영한다.
 *
 * ⚠️ **층을 제자리에서 고치지 않는다. 반드시 복제한다.**
 * `FLOORS`는 모듈 전역 배열이고 생성 층은 캐시된다 — 제자리 변형은 그 다음 전투와
 * 다른 화면까지 영구히 오염시킨다. 이 파일에서 가장 위험한 지점이고,
 * `prep.test.ts`가 호출 전후의 원본 불변을 잠근다.
 *
 * 임무 유형이 안 맞으면 **아무 일도 하지 않는다** — 층을 바꾸고 전투를 시작하는
 * 경합에 대한 안전망이다(스토어의 `selectFloor` 클리어와 이중 방어).
 */
export function applyPrep(floor: FloorSpec, prep: PrepDef | null): PreppedInputs {
  if (!prep) return { floor, atkMult: 1 };

  switch (prep.effect.axis) {
    case 'atk':
      // 층은 안 건드린다 — 화력은 아군 쪽 손잡이다
      return { floor, atkMult: prep.effect.mult };

    case 'guardHp': {
      // 보호 대상이 없는 층이면 팔 것이 없다. 조용히 무효로 둔다.
      if (!floor.guards || floor.guards.length === 0) return { floor, atkMult: 1 };
      const mult = prep.effect.mult;
      return {
        // 배열도 원소도 새로 만든다. 얕은 복사만 하면 원본 GuardDef가 공유된다.
        floor: {
          ...floor,
          guards: floor.guards.map((g) => ({ ...g, hp: Math.round(g.hp * mult) })),
        },
        atkMult: 1,
      };
    }

    case 'turns': {
      // 요구 턴이 없는 임무면 팔 것이 없다.
      if (floor.mission.turns == null) return { floor, atkMult: 1 };
      const cut = Math.max(PREP_MIN_TURNS, floor.mission.turns - prep.effect.reduce);
      return {
        floor: { ...floor, mission: { ...floor.mission, turns: cut } },
        atkMult: 1,
      };
    }
  }
}
