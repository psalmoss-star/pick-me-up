/**
 * 로스터 정렬 테스트.
 *
 * 지키려는 것:
 *   1. 각 키가 실제로 그 축으로 정렬한다
 *   2. 원본 배열을 건드리지 않는다 (화면이 props를 그대로 넘긴다)
 *   3. ⭐ favorite이 정렬에 안 들어간다 (gdd-v3 §7의 명시적 금지)
 */
import { describe, it, expect } from 'vitest';
import { sortRoster, SORT_KEYS, SORT_LABEL } from './rosterSort';
import { heroPower } from './power';
import { klassFor } from './stats';
import { heroes, starScaling, HERO } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const hero = (
  defId: HeroDefId, star: Star, level: number, n: number,
  extra: Partial<HeroInstance> = {},
): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
  ...extra,
});

const sample = (): HeroInstance[] => [
  hero(HERO.ashen, 1, 5, 1),
  hero(HERO.bulwark, 4, 30, 2),
  hero(HERO.tide, 2, 18, 3),
  hero(HERO.gale, 3, 12, 4),
];

describe('정렬 — 각 키가 그 축으로 정렬한다', () => {
  it('전투력: 내림차순', () => {
    const out = sortRoster(sample(), 'power', heroes, starScaling);
    const powers = out.map((h) => heroPower(h, heroes[h.defId], starScaling));
    for (let i = 1; i < powers.length; i++) {
      expect(powers[i - 1]).toBeGreaterThanOrEqual(powers[i]);
    }
  });

  it('레벨: 내림차순', () => {
    const out = sortRoster(sample(), 'level', heroes, starScaling);
    expect(out.map((h) => h.level)).toEqual([30, 18, 12, 5]);
  });

  it('등급: 내림차순', () => {
    const out = sortRoster(sample(), 'star', heroes, starScaling);
    expect(out.map((h) => h.star)).toEqual([4, 3, 2, 1]);
  });

  it('획득순: 나중에 얻은 것이 먼저', () => {
    // 로스터 배열은 획득 순서대로 쌓인다 — 역순이 최신순이다
    const out = sortRoster(sample(), 'recent', heroes, starScaling);
    expect(out.map((h) => h.instId)).toEqual([
      `${HERO.gale}#4`, `${HERO.tide}#3`, `${HERO.bulwark}#2`, `${HERO.ashen}#1`,
    ]);
  });

  it('레벨이 같으면 등급으로 가른다', () => {
    const tied = [
      hero(HERO.ashen, 1, 10, 1),
      hero(HERO.bulwark, 5, 10, 2),
      hero(HERO.tide, 3, 10, 3),
    ];
    const out = sortRoster(tied, 'level', heroes, starScaling);
    expect(out.map((h) => h.star)).toEqual([5, 3, 1]);
  });
});

describe('정렬 — 원본을 건드리지 않는다', () => {
  it('입력 배열의 순서가 그대로 남는다', () => {
    /*
      화면이 props의 배열을 그대로 넘기므로, 여기서 제자리 정렬을 하면
      스토어의 로스터 순서가 조용히 바뀐다 — '획득순'이 그때부터 거짓말이 된다.
    */
    const input = sample();
    const before = input.map((h) => h.instId);
    for (const k of SORT_KEYS) sortRoster(input, k, heroes, starScaling);
    expect(input.map((h) => h.instId)).toEqual(before);
  });
});

describe('정렬 — favorite은 순서에 영향을 주지 않는다', () => {
  it('표식을 달아도 정렬 결과가 같다', () => {
    /*
      ⭐ gdd-v3 §7: "즐겨찾기를 밸런스에 넣지 않는다 —
      넣으면 표식이 취향이 아니라 최적화가 된다."
      정렬 키로 쓰는 것도 같은 종류의 위반이다. 표식은 **필터로만** 쓴다.
    */
    /*
      ⚠️ **전원에게 표식을 달면 이 테스트는 아무것도 검증하지 못한다.**
      정렬이 favorite을 보더라도 모두 같은 값이면 순서가 안 바뀌기 때문이다
      (처음에 그렇게 썼다가 실제로 변조를 못 잡았다 — §5-31).
      **가장 약한 개체에만** 표식을 달아야 한다. 표식이 정렬에 끼면
      그 개체가 맨 앞으로 튀어나오므로 어떤 키에서도 순서가 달라진다.
    */
    const plain = sample();
    const weakest = sortRoster(plain, 'power', heroes, starScaling).at(-1)!.instId;
    const marked = sample().map((h) =>
      (h.instId === weakest ? { ...h, favorite: true } : h));

    for (const k of SORT_KEYS) {
      const a = sortRoster(plain, k, heroes, starScaling).map((h) => h.instId);
      const b = sortRoster(marked, k, heroes, starScaling).map((h) => h.instId);
      expect(b, `${k} 정렬이 표식에 반응한다`).toEqual(a);
    }
  });
});

describe('정렬 — 라벨', () => {
  it('모든 키에 한국어 라벨이 있다', () => {
    for (const k of SORT_KEYS) {
      expect(SORT_LABEL[k], `${k} 라벨 없음`).toBeTruthy();
    }
  });
});
