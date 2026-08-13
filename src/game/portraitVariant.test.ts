import { describe, it, expect } from 'vitest';
import { deriveVariant, variantOf } from './portraitVariant';
import { derivePotential } from './potential';
import { STREAM } from './rng';
import type { HeroInstance, HeroDefId, HeroInstId, Star } from './types';

/** 최소 개체 — 이 테스트가 보는 것은 seed뿐이다 */
function inst(seed: number | undefined): HeroInstance {
  return {
    instId: 'i1' as HeroInstId,
    defId: 'h_ashen' as HeroDefId,
    star: 3 as Star,
    klass: '견습병',
    level: 1,
    exp: 0,
    seed,
    currentHp: 100,
    isDead: false,
    acquiredAtFloor: 0,
  };
}

describe('deriveVariant — 결정론', () => {
  it('같은 (seed, count)는 항상 같은 슬롯을 준다', () => {
    const first = deriveVariant(12345, 6);
    for (let i = 0; i < 100; i++) {
      expect(deriveVariant(12345, 6)).toBe(first);
    }
  });

  it('슬롯은 항상 [0, count) 범위의 정수다', () => {
    // 범위를 벗어나면 배열 밖을 짚어 undefined가 되고,
    // 화면은 조용히 SVG로 떨어진다 — 에러 없이 기능만 죽는다.
    for (let seed = 0; seed < 1000; seed++) {
      for (let count = 1; count <= 8; count++) {
        const v = deriveVariant(seed, count);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(count);
      }
    }
  });

  it('후보가 1개 이하면 0을 준다 (RNG를 건드리지 않는다)', () => {
    expect(deriveVariant(999, 1)).toBe(0);
    expect(deriveVariant(999, 0)).toBe(0);
  });
});

describe('deriveVariant — 분포', () => {
  /*
    ⚠️ 이 테스트가 이 파일의 핵심이다.
    파생을 `return 0`으로 스텁하면 위의 결정론·범위 테스트는 **전부 통과한다.**
    실제로 갈리는지를 잡는 것은 여기뿐이다 (HANDOFF §31 — 테스트가 분기를 타는지 확인할 것).
  */
  it('6개 슬롯에 고르게 퍼진다', () => {
    const hits = new Array(6).fill(0);
    for (let seed = 0; seed < 2000; seed++) hits[deriveVariant(seed, 6)]++;

    // 모든 슬롯이 쓰인다 — 한 장이라도 죽으면 그 그림은 영원히 안 보인다
    for (const h of hits) expect(h).toBeGreaterThan(0);

    // 한쪽 쏠림 방지. 균등이면 각 333개.
    const expected = 2000 / 6;
    for (const h of hits) expect(h).toBeLessThan(expected * 1.5);
  });

  it('같은 유형의 두 개체는 대체로 다른 얼굴을 받는다', () => {
    // 이 기능의 요구사항 자체 — "이름만 다르고 캐릭터는 똑같다"의 해소.
    // 6슬롯이면 서로 다를 확률이 약 5/6.
    let differ = 0;
    const pairs = 1000;
    for (let i = 0; i < pairs; i++) {
      if (deriveVariant(i * 2, 6) !== deriveVariant(i * 2 + 1, 6)) differ++;
    }
    expect(differ / pairs).toBeGreaterThan(0.7);
  });
});

describe('deriveVariant — 잠재치 격리', () => {
  /*
    설계 전체가 이 성질에 얹혀 있다.
    변형이 전용 스트림을 쓰므로 pull 스트림 난수를 소비하지 않고,
    따라서 이 기능을 추가해도 이미 뽑힌 영웅의 잠재치가 안 움직인다.
  */
  it('변형을 뽑아도 같은 시드의 잠재치가 변하지 않는다', () => {
    const before = derivePotential(777, 3 as Star);
    deriveVariant(777, 6);
    deriveVariant(777, 3);
    const after = derivePotential(777, 3 as Star);
    expect(after).toEqual(before);
  });

  it('VARIANT는 다른 스트림과 겹치지 않는다', () => {
    const ids = Object.values(STREAM);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('variantOf — 관문', () => {
  it('seed가 없는 옛 개체는 항상 0번(기존 초상)이다', () => {
    for (let count = 0; count <= 8; count++) {
      expect(variantOf(inst(undefined), count)).toBe(0);
    }
  });

  it('seed가 있으면 deriveVariant와 같은 값을 준다', () => {
    expect(variantOf(inst(4242), 6)).toBe(deriveVariant(4242, 6));
  });
});
