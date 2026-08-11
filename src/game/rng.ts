import type { RNG } from './types';

/**
 * mulberry32 — 빠르고 재현 가능한 32bit PRNG.
 * 게임 내 모든 무작위성은 반드시 이 함수를 통해서만 발생해야 한다.
 */
export function createRng(seed: number): RNG {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 이상 max 미만 정수 */
export function rngInt(rng: RNG, max: number): number {
  return Math.floor(rng() * max);
}

/** 배열에서 하나 선택 */
export function rngPick<T>(rng: RNG, arr: readonly T[]): T {
  return arr[rngInt(rng, arr.length)];
}

/** 확률 p로 true */
export function rngChance(rng: RNG, p: number): boolean {
  return rng() < p;
}

// ------------------------------------------------------------
// 서브스트림 — 개체 시드에서 속성군별 독립 난수 흐름을 판다
// ------------------------------------------------------------

/**
 * 스트림 ID.
 *
 * 이 번호는 영구히 고정된다. 재사용·재배치 금지. 신규는 반드시 뒤에 추가한다.
 * 번호가 바뀌면 기존 영웅의 잠재치가 통째로 달라지고, 무덤 기록이 전부 거짓이 된다.
 */
export const STREAM = {
  POTENTIAL: 3, // 잠재치 (능력치 상한 계수)
  REVEAL: 9,    // 발굴 추정 노이즈
  LOOT: 17,     // 전투 후 전리품 — 장비 드롭·사망 시 회수 판정
  QUEST: 23,    // 과제 보상 (등급만 정해진 장비의 종류 추첨)
} as const;

export type StreamId = (typeof STREAM)[keyof typeof STREAM];

/** 큰 홀수 상수 — 스트림 간 시드 공간을 갈라놓는다 */
const GOLDEN_ODD = 0x9e3779b1;

/** splitmix32 finalizer. 인접한 입력을 무관한 출력으로 흩는다. */
function mix32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * 개체 시드 + 스트림 ID → 해당 스트림 전용 RNG.
 *
 * 스트림을 나누는 이유는 "추가 안정성"이다. 나중에 재능·성격을 새 스트림에 붙여도
 * 이미 뽑힌 영웅의 잠재치는 한 비트도 변하지 않는다.
 */
export function substream(seed: number, streamId: StreamId): RNG {
  return createRng(mix32((seed >>> 0) ^ Math.imul(streamId, GOLDEN_ODD)));
}

/**
 * 표준정규 근사 — Irwin-Hall.
 *
 * Box-Muller(log·sqrt·cos)를 쓰지 않는 이유는 결정론이다. 초월함수는 플랫폼·엔진별로
 * 마지막 비트가 어긋날 수 있고, 그러면 같은 시드가 다른 영웅을 만든다.
 * 균등난수 12회 합은 평균 6·분산 1이므로 6을 빼면 표준정규에 충분히 가깝다.
 */
export function rngNormal(rng: RNG): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += rng();
  return sum - 6;
}
