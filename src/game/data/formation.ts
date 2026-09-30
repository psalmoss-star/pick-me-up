/**
 * 배치(전위/중위/후위)와 역할 라벨 — **표시 전용 파생값.**
 *
 * ⚠️ **전투 엔진에는 배치 개념이 아예 없다.**
 * `battle.ts`에 row·position·formation이 한 글자도 없고,
 * `squads` 배열의 순서는 전투에 아무 영향을 주지 않는다.
 * 엔진에서 "앞줄"에 가장 가까운 것은 **탱커 우선 피격** 하나뿐이다
 * (`battle.ts`의 `TANK_AGGRO = 0.6` — 단일 대상 공격이 60% 확률로 탱커에게 간다).
 * 이 표는 그 사실을 시각화한 것이다.
 *
 * 그래서 배치는 `role`에서 결정론적으로 **파생**하며, 사용자가 바꿀 수 없다.
 * 바꿀 수 있게 만들면 화면이 "배치가 전투에 영향을 준다"고 거짓말하게 된다.
 */
import type { Role } from '../types';

export type Line = 'front' | 'mid' | 'back';

export const LINE_KR: Record<Line, string> = {
  front: '전위',
  mid: '중위',
  back: '후위',
};

/** 그리는 순서 — 왼쪽이 앞이다 */
export const LINE_ORDER: readonly Line[] = ['front', 'mid', 'back'];

/** 역할 한글 라벨. 지금까지 어느 화면에도 표시되지 않았다 */
export const ROLE_KR: Record<Role, string> = {
  tank: '수호',
  dealer: '공격',
  breaker: '파쇄',
  healer: '치유',
  support: '보조',
};

/**
 * 역할 → 배치.
 *
 * `tank`만 **엔진 근거가 있다** — 실제로 먼저 맞는다(`TANK_AGGRO`).
 * 나머지는 역할의 통념을 따른 표시상의 분류다.
 */
export const ROLE_LINE: Record<Role, Line> = {
  tank: 'front',
  dealer: 'mid',
  breaker: 'mid',
  healer: 'back',
  support: 'back',
};

/**
 * 추천 편성의 상성 보정 — 정렬 키 `전투력 × (1 + 이 값 × (유리 − 불리))`.
 * **표시 보조일 뿐 전투에 안 닿는다**(엔진은 `formation.ts`를 모른다). 상성 배수 1.5와 섞지 말 것.
 */
export const RECOMMEND_MATCHUP_WEIGHT = 0.1;
