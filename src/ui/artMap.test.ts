/**
 * 도메인 id ↔ 아트 매핑.
 *
 * 여기가 어긋나도 타입 오류가 나지 않는다 — fallback으로 조용히 떨어져서
 * "엉뚱한 그림이 나오는" 형태로만 드러난다. 실제로 그런 버그가 있었다:
 * 전투 화면은 sourceId('npc:princess')를, 브리핑 화면은 id('princess')를 넘기는데
 * 매핑은 후자만 알고 있어서 전투 중 황녀가 성문으로 그려졌다.
 */
import { describe, expect, it } from 'vitest';
import { enemyArtOf, guardArtOf, heroArtOf } from './artMap';
import { FLOORS } from '../game/data/floors';
import { enemies, heroes } from '../game/data/sample';

describe('enemyArtOf', () => {
  it('정의된 모든 적이 고유한 아트를 갖는다', () => {
    // 전부 fallback('blob')으로 떨어지면 모든 적이 슬라임으로 보인다.
    const arts = Object.keys(enemies).map(enemyArtOf);
    expect(new Set(arts).size).toBe(Object.keys(enemies).length);
  });

  it('층에 등장하는 적은 전부 매핑돼 있다', () => {
    /*
      fallback이 'blob'이고 슬라임의 정답도 'blob'이라 반환값만으로는
      "매핑됨"과 "누락돼서 떨어짐"을 구분할 수 없다.
      전체 아트가 고유하다는 건 위 테스트가 보장하므로,
      여기서는 서로 다른 적이 같은 아트로 뭉치지 않는지를 본다.
    */
    const used = FLOORS.flatMap((f) => f.enemyIds);
    for (const id of used) {
      const others = Object.keys(enemies).filter((e) => e !== id);
      const collides = others.filter((e) => enemyArtOf(e) === enemyArtOf(id));
      expect(collides, `${id}가 ${collides.join(',')}와 같은 아트`).toHaveLength(0);
    }
  });
});

describe('heroArtOf', () => {
  it('정의된 모든 영웅이 고유한 아트를 갖는다', () => {
    const arts = Object.keys(heroes).map(heroArtOf);
    expect(new Set(arts).size).toBe(Object.keys(heroes).length);
  });
});

describe('guardArtOf', () => {
  it('GuardDef.id와 Combatant.sourceId를 모두 받는다', () => {
    // battle.ts가 `${kind}:${id}` 형태로 조립한다. 두 호출부가 서로 다른 걸 넘긴다.
    expect(guardArtOf('princess')).toBe('princess');
    expect(guardArtOf('npc:princess')).toBe('princess');
    expect(guardArtOf('gate')).toBe('gate');
    expect(guardArtOf('objective:gate')).toBe('gate');
  });

  it('층에 등장하는 보호 대상은 두 형식 모두 같은 아트로 풀린다', () => {
    for (const floor of FLOORS) {
      for (const g of floor.guards ?? []) {
        const byId = guardArtOf(g.id);
        const bySourceId = guardArtOf(`${g.kind}:${g.id}`);
        expect(bySourceId, `${floor.id}층의 ${g.id}`).toBe(byId);
        expect(byId, `${floor.id}층의 ${g.id}`).toBe(g.id);
      }
    }
  });

  it('모르는 id는 fallback으로 떨어진다', () => {
    expect(guardArtOf('없는것')).toBe('gate');
  });
});
