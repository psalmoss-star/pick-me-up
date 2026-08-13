import { describe, it, expect } from 'vitest';
import {
  livingHeroes, fallenHeroes, isPreciousSacrifice, PRECIOUS_REVEAL,
} from './roster';
import type { HeroInstance, HeroDefId, HeroInstId, Star } from './types';

function hero(id: string, isDead: boolean): HeroInstance {
  return {
    instId: id as HeroInstId,
    defId: 'h_ashen' as HeroDefId,
    star: 3 as Star,
    klass: '견습병',
    level: 1,
    exp: 0,
    currentHp: isDead ? 0 : 100,
    isDead,
    acquiredAtFloor: 0,
  };
}

const roster = [hero('a', false), hero('b', true), hero('c', false), hero('d', true)];

describe('livingHeroes', () => {
  /*
    ⚠️ 이 테스트가 잠그는 것은 "필터가 동작하는가"가 아니라
    **화면이 실제로 이 함수를 쓰는가**의 절반이다.
    RosterScreen이 alive를 계산해 놓고 roster 전체를 렌더해서
    죽은 영웅이 편성 화면에 남아 있었다 — 필터는 멀쩡했고 호출부가 틀렸다.
  */
  it('사망자를 제외한다', () => {
    expect(livingHeroes(roster).map((h) => h.instId)).toEqual(['a', 'c']);
  });

  it('전멸하면 빈 배열이다 (화면이 빈 상태를 처리해야 한다)', () => {
    expect(livingHeroes([hero('x', true)])).toEqual([]);
  });

  it('빈 로스터를 받아도 던지지 않는다', () => {
    expect(livingHeroes([])).toEqual([]);
  });

  it('원본을 변경하지 않는다', () => {
    const before = roster.length;
    livingHeroes(roster);
    expect(roster.length).toBe(before);
  });
});

describe('isPreciousSacrifice', () => {
  /** 어느 기준에도 안 걸리는 평범한 개체 — 확인 창이 뜨지 않아야 한다 */
  const plain = (): HeroInstance => ({ ...hero('p', false), star: 2 as Star });

  it('아무 기준에도 안 걸리면 확인 창을 세우지 않는다', () => {
    expect(isPreciousSacrifice(plain())).toBe(false);
  });

  /*
    이 테스트가 진짜로 잠그는 것은 "플래그를 읽는가"이다.
    ForgeScreen이 favorite를 안 읽던 시절에도 나머지 세 기준 덕에
    확인 창은 떴다 — 즉 표식이 죽은 채로 통과할 수 있었다.
  */
  it('즐겨찾기 표식만으로 확인 창이 선다', () => {
    expect(isPreciousSacrifice({ ...plain(), favorite: true })).toBe(true);
  });

  it('표식을 끄면 다시 평범해진다', () => {
    expect(isPreciousSacrifice({ ...plain(), favorite: false })).toBe(false);
  });

  it('표식이 없어도 ★4 이상이면 선다 (표식을 안 찍는 사람을 위한 자동 기준)', () => {
    expect(isPreciousSacrifice({ ...plain(), star: 4 as Star })).toBe(true);
  });

  it('발굴이 쌓이면 선다', () => {
    expect(isPreciousSacrifice({ ...plain(), revealProgress: PRECIOUS_REVEAL })).toBe(true);
    expect(isPreciousSacrifice({ ...plain(), revealProgress: PRECIOUS_REVEAL - 0.01 })).toBe(false);
  });

  it('파티원이면 선다', () => {
    expect(isPreciousSacrifice(plain(), ['p'])).toBe(true);
    expect(isPreciousSacrifice(plain(), ['다른영웅'])).toBe(false);
  });
});

describe('fallenHeroes', () => {
  it('사망자만 남긴다', () => {
    expect(fallenHeroes(roster).map((h) => h.instId)).toEqual(['b', 'd']);
  });

  it('livingHeroes와 서로 겹치지 않고 합치면 전체다', () => {
    const living = livingHeroes(roster);
    const fallen = fallenHeroes(roster);
    expect(living.length + fallen.length).toBe(roster.length);
    const ids = new Set([...living, ...fallen].map((h) => h.instId));
    expect(ids.size).toBe(roster.length);
  });
});
