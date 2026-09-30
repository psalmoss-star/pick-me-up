/**
 * 책략 카드 — 병법서·역사서의 책략을 카드로. 단일 출처. 기획서 1단계(2026-09-29), 원리 중심 개편(2026-09-30).
 *
 * 사용자 요청: 게임이 아니라 **책(삼국지연의·삼십육계·손자병법·사기)의 책략**을 담는다.
 * 1차 셀프 테스트(2026-09-30)에서 "조조가 나오는 장면 이야기는 이 게임과 안 어울린다,
 * 직관성이 먼저"라는 지적을 받았다. 그래서 카드는 **이름 · 원리 한 줄 · 출전(책과 편)**만 쓰고
 * 역사 인물 이름은 화면에 쓰지 않는다(`stratagem.test.ts`가 잠근다).
 * 발동·성공·간파 수치 문장은 여기 적지 않는다 — `describeStratagem`이 효과 데이터에서 만든다.
 *
 * 성공하면 적이 크게 무너지고, 간파당하면 아군이 대가를 치른다.
 * 불리할 때 영웅이 **자동으로 판단해서** 쓴다(마스터가 전투 중에 고르지 않는다).
 *
 * ⚠️ **id는 세이브(해금·장착·내성·영웅 연대기)에 남는다. 바꾸거나 지우지 말 것 — 추가만.**
 *
 * 효과는 엔진에 이미 있는 것(피해·상태이상)만 쓴다. 새 능력치를 만들지 않는다.
 */
import type { StatusKind } from '../types';

export type StratagemId =
  | 'ambush'      // 매복
  | 'nightRaid'   // 야습
  | 'lureFire'    // 유인 화공
  | 'flood'       // 수공
  | 'emptyFort'   // 공성계
  | 'redCliffs'   // 연환 화공 (id는 옛 이름 '적벽 화공' 시절 것 — 세이브 때문에 그대로 둔다)
  | 'feint'       // 성동격서
  | 'lastStand'   // 배수진
  | 'besieged';   // 사면초가

/** 발동 조건 — "불리하다"는 판단. 턴 시작에 전장 상태로 판정한다 */
export type StratagemCondition =
  /** 전장의 아군 누군가 HP 비율이 이 값 이하 */
  | { kind: 'allyHpBelow'; ratio: number }
  /** 적 수가 전장의 아군 수보다 많다 */
  | { kind: 'outnumbered' }
  /** 적이 n체 이상이고, 아군 HP 합 비율이 적 HP 합 비율보다 낮다 */
  | { kind: 'swarmLosing'; minEnemies: number }
  /** 이 턴 이상 경과 */
  | { kind: 'longBattle'; turn: number }
  /** 아군 전장 인원이 적의 절반 이하, 또는 아군 HP 합 비율이 ratio 이하 */
  | { kind: 'desperate'; ratio: number }
  /** (적 n체 이상 또는 보스) 그리고 이 턴 이상 경과 */
  | { kind: 'bigBattle'; minEnemies: number; turn: number };

/** 효과 — 성공·간파 양쪽이 같은 문법을 쓴다 */
export type StratagemEffect =
  /** 살아 있는 적 전원에게 각자 최대 HP의 ratio만큼 피해 */
  | { kind: 'enemiesDamage'; ratio: number }
  /** 가장 강한(공격력) 적의 HP를 최대 HP의 ratio까지 깎는다 — 이미 그보다 낮으면 그대로 */
  | { kind: 'strongestTo'; ratio: number }
  /** 살아 있는 적 전원에게 상태이상 */
  | { kind: 'enemiesStatus'; status: StatusKind; turns: number }
  /** 전장의 아군 전원에게 상태이상 */
  | { kind: 'alliesStatus'; status: StatusKind; turns: number }
  /**
   * 수행자가 최대 HP의 ratio만큼 잃는다. **치명적이지 않다**(HP 1에서 멈춘다) —
   * 마스터가 고르지 않은 순간의 판정으로 영웅이 영구히 죽으면 퍼머데스가 운이 된다.
   */
  | { kind: 'executorLoses'; ratio: number };

export interface StratagemDef {
  id: StratagemId;
  /** 카드 이름 */
  name: string;
  /** 출전 — 책 이름 + 편·계·회. 인물 이름은 쓰지 않는다 */
  source: string;
  /** 원리 한 줄 — 무엇을 하는 책략인가 */
  principle: string;
  condition: StratagemCondition;
  /** 기본 성공 확률 (수행자·보스·내성 보정 전) */
  baseChance: number;
  success: StratagemEffect[];
  failure: StratagemEffect[];
  /** 이 층을 깨면 해금된다. 0이면 처음부터 */
  unlockFloor: number;
}

/**
 * 카드 목록. **배열 순서는 도감 표시 순서일 뿐** 판정에 쓰지 않는다(판정은 장착 슬롯 순서).
 */
export const STRATAGEMS: StratagemDef[] = [
  {
    id: 'ambush',
    name: '매복',
    source: '삼십육계 제4계 이일대로',
    principle: '숨어 기다렸다가 가장 강한 적을 친다',
    condition: { kind: 'allyHpBelow', ratio: 0.5 },
    baseChance: 0.5,
    success: [{ kind: 'strongestTo', ratio: 0.3 }],
    failure: [{ kind: 'executorLoses', ratio: 0.3 }],
    unlockFloor: 0,
  },
  {
    id: 'nightRaid',
    name: '야습',
    source: '삼국지연의 68회',
    principle: '밤을 틈타 적진을 흔든다',
    condition: { kind: 'outnumbered' },
    baseChance: 0.5,
    success: [
      { kind: 'enemiesDamage', ratio: 0.1 },
      { kind: 'enemiesStatus', status: 'stun', turns: 1 },
    ],
    failure: [{ kind: 'executorLoses', ratio: 0.4 }],
    unlockFloor: 0,
  },
  {
    id: 'lureFire',
    name: '유인 화공',
    source: '삼국지연의 39회',
    principle: '짐짓 물러나 좁은 곳으로 끌어들여 태운다',
    condition: { kind: 'swarmLosing', minEnemies: 3 },
    baseChance: 0.48,
    success: [
      { kind: 'enemiesDamage', ratio: 0.2 },
      { kind: 'enemiesStatus', status: 'burn', turns: 2 },
    ],
    failure: [{ kind: 'executorLoses', ratio: 0.3 }],
    unlockFloor: 5,
  },
  {
    id: 'flood',
    name: '수공',
    source: '손자병법 화공편',
    principle: '물길을 터 적의 발을 묶는다',
    condition: { kind: 'longBattle', turn: 6 },
    baseChance: 0.5,
    success: [
      { kind: 'enemiesDamage', ratio: 0.15 },
      { kind: 'enemiesStatus', status: 'spdDown', turns: 3 },
      { kind: 'enemiesStatus', status: 'defDown', turns: 3 },
    ],
    // 간파되면 터진 물길이 아군 진영으로 역류한다 — 거의 항상 발동하는 카드라 대가가 가벼우면 공짜가 된다
    failure: [
      { kind: 'executorLoses', ratio: 0.25 },
      { kind: 'alliesStatus', status: 'spdDown', turns: 3 },
    ],
    unlockFloor: 10,
  },
  {
    id: 'emptyFort',
    name: '공성계',
    source: '삼십육계 제32계',
    principle: '빈 성문을 열어 보여 적을 망설이게 한다',
    condition: { kind: 'desperate', ratio: 0.3 },
    baseChance: 0.45,
    success: [{ kind: 'enemiesStatus', status: 'stun', turns: 2 }],
    failure: [{ kind: 'enemiesStatus', status: 'atkUp', turns: 2 }],
    unlockFloor: 15,
  },
  {
    id: 'redCliffs',
    name: '연환 화공',
    source: '삼십육계 제35계 연환계',
    principle: '적을 한데 묶어 한꺼번에 태운다',
    condition: { kind: 'bigBattle', minEnemies: 4, turn: 5 },
    baseChance: 0.55,
    success: [
      { kind: 'enemiesDamage', ratio: 0.3 },
      { kind: 'enemiesStatus', status: 'burn', turns: 3 },
    ],
    failure: [
      { kind: 'executorLoses', ratio: 0.3 },
      { kind: 'alliesStatus', status: 'atkDown', turns: 2 },
    ],
    unlockFloor: 20,
  },
  // ---- 21층 이후 (2026-09-30 추가) — 엔진에 이미 있는 효과 문법만 쓴다 ----
  {
    id: 'feint',
    name: '성동격서',
    source: '삼십육계 제6계',
    principle: '동쪽을 치는 척하고 서쪽을 친다',
    condition: { kind: 'longBattle', turn: 4 },
    baseChance: 0.5,
    // 거의 항상 발동한다(측정 99%) — 효과가 가벼우면 칸만 차지한다
    success: [
      { kind: 'enemiesDamage', ratio: 0.12 },
      { kind: 'enemiesStatus', status: 'defDown', turns: 3 },
    ],
    failure: [{ kind: 'executorLoses', ratio: 0.3 }],
    unlockFloor: 30,
  },
  {
    // 유일하게 아군을 강하게 하는 카드. 대가도 아군에게 온다 — 물러날 곳을 버렸으니 막을 것도 없다
    id: 'lastStand',
    name: '배수진',
    source: '사기 권92',
    principle: '물러날 길을 끊어 죽기로 싸우게 한다',
    condition: { kind: 'desperate', ratio: 0.3 },
    baseChance: 0.55,
    success: [{ kind: 'alliesStatus', status: 'atkUp', turns: 3 }],
    failure: [{ kind: 'alliesStatus', status: 'defDown', turns: 2 }],
    unlockFloor: 40,
  },
  {
    id: 'besieged',
    name: '사면초가',
    source: '사기 권7',
    principle: '사방에서 고향 노래를 불러 적의 싸울 뜻을 꺾는다',
    condition: { kind: 'longBattle', turn: 6 },
    baseChance: 0.5,
    success: [
      { kind: 'enemiesStatus', status: 'atkDown', turns: 3 },
      { kind: 'enemiesStatus', status: 'spdDown', turns: 2 },
    ],
    failure: [{ kind: 'executorLoses', ratio: 0.25 }],
    unlockFloor: 50,
  },
];

/** 카드 설명에 쓰는 상태이상 이름 — 수치 문장은 `describeStratagem`이 만든다 */
export const STATUS_WORD: Record<StatusKind, string> = {
  atkUp: '공격↑', atkDown: '공격↓',
  defUp: '방어↑', defDown: '방어↓',
  spdUp: '속도↑', spdDown: '속도↓',
  poison: '중독', stun: '기절', burn: '화상',
};

export const STRATAGEM_BY_ID: Record<StratagemId, StratagemDef> =
  Object.fromEntries(STRATAGEMS.map((s) => [s.id, s])) as Record<StratagemId, StratagemDef>;

/** 한 전투에 들고 가는 카드 수 (사용자 결정, 2026-09-29) */
export const STRATAGEM_SLOTS = 2;

/**
 * 성공 확률 보정.
 *
 * 수행자(책사)는 전장의 영웅 중 지능이 가장 높은 영웅이다. 보정은 **파티 평균 대비**로 잰다 —
 * 지능 절대값은 ★·레벨에 따라 수십 배 벌어져서, 절대값으로 재면 후반엔 전부 상한에 붙는다.
 * "파티에 머리가 따로 있는가"가 보정의 뜻이다.
 */
export const STRATAGEM_TUNING = {
  /** (수행자 지능 / 파티 평균 − 1) × 이 값을 더한다 */
  intWeight: 0.15,
  /** 적 중에 보스가 있으면 간파가 쉬워진다 */
  bossInsight: 0.1,
  /** 내성 1당 감소 */
  resistStep: 0.1,
  /** 내성 상한 */
  resistMax: 3,
  minChance: 0.15,
  maxChance: 0.9,
} as const;
