/**
 * 도메인 id ↔ 아트 매핑.
 *
 * 여기가 어긋나도 타입 오류가 나지 않는다 — fallback으로 조용히 떨어져서
 * "엉뚱한 그림이 나오는" 형태로만 드러난다. 실제로 그런 버그가 있었다:
 * 전투 화면은 sourceId('npc:princess')를, 브리핑 화면은 id('princess')를 넘기는데
 * 매핑은 후자만 알고 있어서 전투 중 황녀가 성문으로 그려졌다.
 */
import { describe, expect, it } from 'vitest';
import { enemyArtOf, guardArtOf, heroArtOf, HERO_ART } from './artMap';
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
  /*
    ⚠️ 예전에는 "영웅마다 아트가 고유하다"를 검사했다. 유형이 5종이고
    실루엣도 5종이라 그때는 성립했지만, 유형을 12종으로 늘리면서 깨졌다 —
    실루엣이 5개뿐이라 **겹치는 것이 정상**이다.

    다만 원래 의도(누락되면 조용히 전부 검사가 된다)는 그대로 지켜야 한다.
    그래서 "고유한가" 대신 **"매핑표에 명시돼 있는가"**를 검사한다.
    이게 진짜 잡고 싶었던 것이다.
  */
  it('정의된 모든 영웅이 매핑표에 명시돼 있다', () => {
    const missing = Object.keys(heroes).filter((id) => !(id in HERO_ART));
    expect(missing, `매핑 누락: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('실루엣이 한쪽으로 쏠리지 않는다', () => {
    // 전부 'sword'로 떨어지는 사고를 잡는다 — 폴백 누락의 실제 증상이다.
    const arts = Object.keys(heroes).map(heroArtOf);
    expect(new Set(arts).size).toBeGreaterThanOrEqual(4);
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
