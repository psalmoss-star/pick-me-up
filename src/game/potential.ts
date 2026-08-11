import type { AttrKey, RNG, Star } from './types';
import { STREAM, rngNormal, substream } from './rng';
import { POTENTIAL_TUNING as P } from './data/potential';

/**
 * 잠재치 — 개체차의 유일한 출처
 *
 * 이 모듈이 없으면 같은 defId·같은 등급의 영웅은 완전히 동일하다.
 * 그러면 죽어도 아깝지 않다. 똑같은 걸 다시 뽑으면 되니까.
 * 퍼머데스가 무게를 가지려면 "이 개체"가 대체 불가능해야 한다.
 *
 * 저장하지 않는다. HeroInstance.seed에서 언제든 다시 계산된다.
 */

const ATTR_KEYS: AttrKey[] = ['str', 'int', 'vit', 'agi'];

/** 능력치별 잠재 계수. capsFor에서 (1 + bonus)로 곱해진다. */
export type PotentialBonus = Record<AttrKey, number>;

function clampBonus(v: number): number {
  return Math.min(P.maxBonus, Math.max(P.minBonus, v));
}

/**
 * 등급을 현재치 쪽 신호(Z1)로 환산한다.
 *
 * 설계서는 "현재치 총합의 백분위로 등급을 매긴다"고 하지만, 이 프로젝트는 인과가 반대다.
 * 등급이 가챠에서 먼저 정해지고(gacha.ts의 rollStar) 능력치가 뒤따른다.
 * 그래서 이미 정해진 등급을 Z1로 되돌려 상관을 건다.
 *
 * 계수는 1/SD(★1~6 균등) = 1/1.7078. 이래야 Z1의 표준편차가 1이 되고,
 * 그때만 아래 구성법의 상관이 실제로 rho와 일치한다.
 */
const STAR_Z_SCALE = 0.585556; // 1 / 1.7078

function starToZ(star: Star): number {
  return (star - 3.5) * STAR_Z_SCALE;
}

/**
 * 개체 시드 + 등급 → 능력치별 잠재 계수.
 *
 * 이변량 정규 구성법:  potential = rho·Z1 + sqrt(1-rho²)·Z2
 *   Z1 = 등급에서 온 신호 (4종 공통)
 *   Z2 = 개체 시드에서 뽑은 잡음
 *
 * Z2를 능력치마다 완전 독립으로 두면 안 된다. 4종을 평균 낼 때 잡음만 1/4로 줄어들어
 * 총합 기준 상관이 0.45까지 치솟는다 (실제로 겪었다). 그러면 rho가 "어느 각도로 재느냐"에
 * 따라 달라져 튜닝 파라미터로 쓸모가 없어진다.
 *
 * 그래서 Z2를 공통 성분(shared)과 능력치별 성분(unique)으로 쪼개 섞는다.
 * 분산비 3:1 (계수 0.866 : 0.5, 제곱합 = 1)에서 개별 기준 0.300, 총합 기준 0.329가 나온다.
 *
 * 총합까지 정확히 0.300으로 맞추려면 unique를 0으로 지워야 하는데, 그러면 능력치 4종이
 * 전부 같은 값이 되어 개체가 밋밋해진다. 소수점 셋째 자리보다 그쪽 손실이 크다.
 *
 * 두 성분이 하는 일이 다르다는 점이 이 구조의 값어치다.
 * 공통 성분은 "이 개체는 전반적으로 대기만성"을, 개별 성분은 "힘은 좋은데 민첩은 별로"를
 * 만든다. 두 층이 다 있어야 개체가 캐릭터처럼 읽힌다.
 */
const Z2_SHARED = 0.8660254; // sqrt(3/4)
const Z2_UNIQUE = 0.5;       // sqrt(1/4)

export function derivePotential(seed: number, star: Star): PotentialBonus {
  const rng = substream(seed, STREAM.POTENTIAL);
  const z1 = starToZ(star);

  // 공통 성분을 먼저 뽑는다. 추출 순서는 곧 스트림 내 위치이므로 바꾸지 말 것.
  const shared = rngNormal(rng);

  const out = {} as PotentialBonus;
  for (const k of ATTR_KEYS) {
    const unique = rngNormal(rng);
    const z2 = Z2_SHARED * shared + Z2_UNIQUE * unique;
    const z = P.rho * z1 + P.sqrtOneMinusRhoSq * z2;
    // bias는 전투의 비대칭을 상쇄한다 (data/potential.ts 주석 참조)
    out[k] = clampBonus(z * P.sigma + P.bias);
  }
  return out;
}

/** 잠재 계수 4종의 평균. 발굴 표시와 분포 검증이 쓰는 단일 지표. */
export function potentialScore(b: PotentialBonus): number {
  return ATTR_KEYS.reduce((s, k) => s + b[k], 0) / ATTR_KEYS.length;
}

/** 개체 시드를 뽑는다. 가챠가 영웅을 만들 때 호출한다. */
export function rollHeroSeed(rng: RNG): number {
  return Math.floor(rng() * 0x100000000) >>> 0;
}
