import { describe, it, expect } from 'vitest';
import { STAR_TIERS, quartersFor, nextQuartersFor } from './tokens';
import { klassFor } from '../game/stats';
import type { Star } from '../game/types';

const STARS: Star[] = [1, 2, 3, 4, 5, 6];

/**
 * 거처 — "층이 곧 계급"을 등급에 붙인 표시.
 *
 * 밸런스와 무관한 표시 전용이지만, **★5와 ★6을 가르는 유일한 구조적 차이**라서
 * 조용히 무너지면 눈으로는 안 보인다(둘은 STAR_TIERS의 구조 값이 전부 같고
 * 색만 다르다). 그래서 표를 테스트로 잠근다.
 */
describe('거처 — 등급별 이름', () => {
  it('★1~6 전부 거처가 있다', () => {
    for (const s of STARS) {
      expect(quartersFor(s), `★${s}`).toBeTruthy();
    }
  });

  /**
   * ⚠️ 이것이 이 파일의 핵심이다. ★5·★6은 corners/lattice/rays/halo가 전부 같아
   * **카드 구조로는 구분되지 않는다.** 거처 이름까지 겹치면 두 등급을 가르는
   * 표시가 하나도 안 남는다.
   */
  it('여섯 거처가 서로 다르다 — 겹치면 그 등급 쌍을 가를 표시가 사라진다', () => {
    const names = STARS.map(quartersFor);
    expect(new Set(names).size).toBe(STARS.length);
  });

  it('★5와 ★6은 구조가 같으므로 거처가 반드시 갈라야 한다', () => {
    // 전제 확인 — 구조가 같다는 것이 이 테스트의 존재 이유다
    const a = STAR_TIERS[5];
    const b = STAR_TIERS[6];
    expect([a.corners, a.lattice, a.rays, a.halo])
      .toEqual([b.corners, b.lattice, b.rays, b.halo]);
    expect(quartersFor(5)).not.toBe(quartersFor(6));
  });

  it('계급 사다리와 1:1이다 — 한쪽만 늘리면 "계급이 사는 곳"이 성립하지 않는다', () => {
    const klasses = new Set(STARS.map(klassFor));
    const quarters = new Set(STARS.map(quartersFor));
    expect(quarters.size).toBe(klasses.size);
  });
});

describe('nextQuartersFor — 승급하면 옮겨갈 곳', () => {
  it('★1~5는 다음 거처가 있고, 그것이 한 단계 위의 거처다', () => {
    for (const s of [1, 2, 3, 4, 5] as Star[]) {
      expect(nextQuartersFor(s), `★${s}`).toBe(quartersFor(s + 1));
    }
  });

  /**
   * ★6은 더 갈 곳이 없다. `undefined`가 아니라 `null`이어야 호출부가
   * 반드시 갈라 쓴다 — DetailModal의 승급 권유 문구가 이 값으로 갈린다.
   */
  it('★6은 null이다 — 화면에 undefined가 새면 안 된다', () => {
    expect(nextQuartersFor(6)).toBeNull();
  });

  it('범위 밖 등급에도 undefined를 흘리지 않는다', () => {
    expect(nextQuartersFor(99)).toBeNull();
    expect(quartersFor(0)).toBe(quartersFor(1));
  });
});
