/**
 * 출정 준비 한 수 — 전투 전 판단. STEP 49.
 *
 * 개입(`intervention.ts`)이 *전투 중* 판단이라면 이것은 *전투 전* 판단이다.
 * 브리핑 화면이 임무 유형을 이미 보여주는데 플레이어가 그걸 보고 할 일이 없었다.
 *
 * ⚠️ **새 밸런스 축을 만들지 않는다.** `intervention.ts`의 원칙과 같다 —
 * 전투 엔진이 이미 받는 입력(`allyAtkMult` / `guards[].hp` / `mission.turns`)만 쓴다.
 * 6종을 두되 축은 **3개**이고, 층당 1개만 살 수 있으므로 한 전투가 받는
 * 상승폭은 항상 한 개분이다.
 *
 * ⚠️ **`enemyStatMult`는 절대 손대지 않는다.** `runEncounter`가 `floor.id`에서
 * 직접 유도하며 "호출자가 밸런스 수치를 계산하지 말 것"이라고 못박고 있다.
 *
 * ⚠️ 수치를 만졌으면 `npm run sim`과 `npx tsx climb-check.mts`를 돌릴 것.
 * 다만 **두 도구는 준비를 사지 않으므로 표가 안 움직이는 것이 정상이다** —
 * 그건 "기존 밸런스가 안 깨졌다"는 뜻이지 "준비가 동작한다"는 뜻이 아니다.
 * 효과 자체는 `prep.test.ts`·`prepBattle.test.ts`가 잠근다.
 */
import type { MissionKind } from '../mission';

export type PrepId =
  | 'edge'      // 예기 — 토벌
  | 'mark'      // 표적 지시 — 탈취
  | 'rampart'   // 방벽 — 수비
  | 'harness'   // 호구 — 호위
  | 'smoke'     // 연막 — 생존
  | 'retreat';  // 퇴로 확보 — 탈출

/**
 * 준비가 건드리는 축. 셋뿐이다.
 *
 * - `atk`     — 아군 공격력 배수 (무기창고와 **같은 축**)
 * - `guardHp` — 보호 대상 최대 HP 배수
 * - `turns`   — 임무 요구 턴 감소
 */
export type PrepEffect =
  | { axis: 'atk'; mult: number }
  | { axis: 'guardHp'; mult: number }
  | { axis: 'turns'; reduce: number };

export interface PrepDef {
  id: PrepId;
  name: string;
  /** 브리핑에 그대로 뜬다 — 무엇을 사는지가 화면에서 끝나야 한다 */
  desc: string;
  /** 금. 층 보상이 층당 230~300금이라 이 값이 곧 "이번 층 벌이를 여기 쓸까"가 된다 */
  cost: number;
  effect: PrepEffect;
}

/**
 * ⚠️ **아군 공격력 배수는 작게 잡는다.**
 *
 * 엔진이 이 축에서 겪어본 범위는 무기창고의 1.00~1.09뿐이다(`ARMORY_ATK`).
 * 1.08이면 무기창고 만렙과 곱해도 1.18이라 미검증 구간으로 크게 안 나간다.
 */
const ATK_MULT = 1.08;

/** 보호 대상 HP 배수. 수비·호위는 이 값이 곧 그 층의 난이도다 */
const GUARD_HP_MULT = 1.5;

/**
 * 요구 턴 감소량.
 *
 * 생성 층의 요구 턴이 7~9이므로 2턴이면 체감되는 크기다.
 * ⚠️ 요구 턴은 1 미만으로 내려가면 안 된다 — 0이면 첫 턴에 즉시 승리한다.
 * 그 하한은 `prep.ts`의 `applyPrep`이 지킨다.
 */
const TURN_REDUCE = 2;

/**
 * 임무 유형 → 그 층에서 살 수 있는 준비. **6종 전단사.**
 *
 * ⚠️ **생존·탈출에 화력을 주면 안 된다.** 두 임무의 승리 조건은 `turn >= turns`
 * 하나뿐이라 적을 빨리 죽여도 전투가 일찍 안 끝난다 — 화력이 거의 무의미하다.
 * 그래서 이 둘만 요구 턴을 건드린다.
 *
 * ⚠️ **수비·호위는 보호 대상이 지배적 변수다.** `enemyFocus`(0.7/0.6)로 적이
 * 보호 대상을 노리게 돼 있어서, 그 HP가 곧 난이도다.
 */
export const PREP_BY_MISSION: Record<MissionKind, PrepDef> = {
  subjugate: {
    id: 'edge',
    name: '예기',
    desc: `출전 전 날을 세운다 — 공격력 +${Math.round((ATK_MULT - 1) * 100)}%`,
    cost: 220,
    effect: { axis: 'atk', mult: ATK_MULT },
  },
  seize: {
    id: 'mark',
    name: '표적 지시',
    desc: `벨 것을 미리 정한다 — 공격력 +${Math.round((ATK_MULT - 1) * 100)}%`,
    cost: 220,
    effect: { axis: 'atk', mult: ATK_MULT },
  },
  defend: {
    id: 'rampart',
    name: '방벽',
    desc: `사수 대상을 덧댄다 — 내구 +${Math.round((GUARD_HP_MULT - 1) * 100)}%`,
    cost: 260,
    effect: { axis: 'guardHp', mult: GUARD_HP_MULT },
  },
  escort: {
    id: 'harness',
    name: '호구',
    desc: `동행자에게 갑주를 입힌다 — 내구 +${Math.round((GUARD_HP_MULT - 1) * 100)}%`,
    cost: 260,
    effect: { axis: 'guardHp', mult: GUARD_HP_MULT },
  },
  survive: {
    id: 'smoke',
    name: '연막',
    desc: `지원이 일찍 닿는다 — 요구 턴 −${TURN_REDUCE}`,
    cost: 240,
    effect: { axis: 'turns', reduce: TURN_REDUCE },
  },
  escape: {
    id: 'retreat',
    name: '퇴로 확보',
    desc: `물러설 길을 미리 낸다 — 요구 턴 −${TURN_REDUCE}`,
    cost: 240,
    effect: { axis: 'turns', reduce: TURN_REDUCE },
  },
};

/** 이 임무에서 살 수 있는 준비 */
export function prepForMission(kind: MissionKind): PrepDef {
  return PREP_BY_MISSION[kind];
}

/** id로 찾는다. 없는 id면 null — 화면·저장이 이상한 값을 줘도 여기서 막힌다 */
export function prepById(id: PrepId | null): PrepDef | null {
  if (!id) return null;
  return Object.values(PREP_BY_MISSION).find((p) => p.id === id) ?? null;
}
