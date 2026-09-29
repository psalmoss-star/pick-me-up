/**
 * 책략 카드 — 삼국지연의의 전투를 카드로. 단일 출처. 기획서 1단계(2026-09-29 재설계).
 *
 * 사용자 요청: 게임 삼국지가 아니라 **책(삼국지연의)의 유명 전투와 책략**을 담는다.
 * 성공하면 적이 크게 무너지고, 간파당하면 아군이 대가를 치른다.
 * 불리할 때 영웅이 **자동으로 판단해서** 쓴다(마스터가 전투 중에 고르지 않는다).
 *
 * ⚠️ **id는 세이브(해금·장착·내성·영웅 연대기)에 남는다. 바꾸거나 지우지 말 것 — 추가만.**
 * ⚠️ 배수진(한신)·십면매복(해하)은 **초한지**라 넣지 않는다.
 *
 * 효과는 엔진에 이미 있는 것(피해·상태이상)만 쓴다. 새 능력치를 만들지 않는다.
 */
import type { StatusKind } from '../types';

export type StratagemId =
  | 'ambush'      // 매복 — 정군산
  | 'nightRaid'   // 야습 — 감녕 백기겁영
  | 'lureFire'    // 유인 후 화공 — 박망파
  | 'flood'       // 수공 — 번성 수몰칠군
  | 'emptyFort'   // 공성계 — 서성
  | 'redCliffs';  // 적벽 화공 — 고육계·연환계

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
  /** 연의 출처 — 카드와 기록에 그대로 쓴다 */
  source: string;
  /** 카드 설명 한 줄 — 언제 쓰는가 */
  when: string;
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
    source: '정군산 — 황충이 기다렸다가 하후연을 베다 (연의 71회)',
    when: '아군이 몰릴 때, 숨겨 둔 병력으로 가장 강한 적을 친다',
    condition: { kind: 'allyHpBelow', ratio: 0.5 },
    baseChance: 0.5,
    success: [{ kind: 'strongestTo', ratio: 0.3 }],
    failure: [{ kind: 'executorLoses', ratio: 0.3 }],
    unlockFloor: 0,
  },
  {
    id: 'nightRaid',
    name: '야습',
    source: '유수구 — 감녕이 기병 백으로 조조의 진을 치다 (연의 68회)',
    when: '적이 더 많을 때, 밤을 틈타 적진을 흔든다',
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
    name: '유인 후 화공',
    source: '박망파 — 제갈량이 하후돈을 골짜기로 끌어들여 불을 놓다 (연의 39회)',
    when: '많은 적에게 밀릴 때, 좁은 곳으로 끌어들여 태운다',
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
    source: '번성 — 관우가 강물을 터 우금의 칠군을 수몰시키다 (연의 74회)',
    when: '싸움이 길어질 때, 물길을 터 적의 발을 묶는다',
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
    source: '서성 — 제갈량이 성문을 열고 거문고를 타 사마의를 물리다 (연의 95회)',
    when: '무너지기 직전, 빈 성을 보여 적을 망설이게 한다',
    condition: { kind: 'desperate', ratio: 0.3 },
    baseChance: 0.45,
    success: [{ kind: 'enemiesStatus', status: 'stun', turns: 2 }],
    failure: [{ kind: 'enemiesStatus', status: 'atkUp', turns: 2 }],
    unlockFloor: 15,
  },
  {
    id: 'redCliffs',
    name: '적벽 화공',
    source: '적벽 — 황개의 고육계와 방통의 연환계로 조조의 대군을 태우다 (연의 46~49회)',
    when: '큰 싸움이 무르익으면, 적을 묶어 한꺼번에 태운다',
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
];

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
