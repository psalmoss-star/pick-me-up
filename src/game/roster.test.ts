import { describe, it, expect } from 'vitest';
import { livingHeroes, fallenHeroes } from './roster';
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
