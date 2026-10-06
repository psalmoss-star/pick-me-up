/**
 * 보호막과 HP 재생 — 이벤트 로그만으로 HP를 다시 계산하면 엔진의 실제 HP와 같아야 한다.
 *
 * 전투 화면과 경고 비트는 로그에서 HP를 재생한다(`hpLossOf`). 보호막이 막은 피해까지
 * HP에서 빼면 **보호막을 두른 영웅의 HP 바가 실제보다 낮게** 보인다(결계·넘치는 은총).
 */
import { describe, it, expect } from 'vitest';
import { simulateBattle, type BattleData } from './battle';
import { hpLossOf } from './beats';
import { createRng } from './rng';
import { klassFor, statsOfInstance } from './stats';
import { gameData, gameDataNoTraits } from './data';
import { HERO, ENEMY } from './data/sample';
import type { BattleEvent, HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

// 결계를 쓰는 둘(델라·군드)과 넘치는 은총의 사제를 함께 세운다 — 보호막이 가장 많이 쌓이는 편성
const party = () => [
  hero('h_ward' as HeroDefId, 4, 40, 1),
  hero('h_anvil' as HeroDefId, 4, 40, 2),
  hero(HERO.tide, 4, 40, 3),
];

/** 화면이 하는 것과 같은 재생 — 시작 HP에서 이벤트를 차례로 적용한다 */
function replayHp(events: BattleEvent[], maxHp: Record<string, number>): Record<string, number> {
  const hp: Record<string, number> = { ...maxHp };
  for (const e of events) {
    for (const uid of e.targetUids ?? []) {
      if (hp[uid] === undefined) continue;
      if (e.type === 'damage') hp[uid] = Math.max(0, hp[uid] - hpLossOf(e));
      if (e.type === 'heal') hp[uid] = Math.min(maxHp[uid], hp[uid] + (e.amount ?? 0));
    }
  }
  return hp;
}

describe.each([
  ['특성 켬', gameData],
  ['특성 끔', gameDataNoTraits],
])('보호막이 막은 피해는 HP에서 빠지지 않는다 (%s)', (_name, data: BattleData) => {
  it('로그로 재생한 HP가 엔진의 생존자 HP와 같다', () => {
    let absorbedSeen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const allies = party();
      const maxHp = Object.fromEntries(allies.map((h) =>
        [`A:${h.instId}`, statsOfInstance(h, data.heroes[h.defId], data.starScaling).hp]));
      const r = simulateBattle({
        allies, enemyIds: [ENEMY.revenant, ENEMY.wisp, ENEMY.hound], data, rng: createRng(seed),
      });
      absorbedSeen += r.events.filter((e) => e.type === 'damage' && (e.absorbed ?? 0) > 0).length;
      const hp = replayHp(r.events, maxHp);
      for (const s of r.survivors) expect(hp[`A:${s.instId}`]).toBe(s.currentHp);
      for (const dead of r.casualties) expect(hp[`A:${dead}`]).toBe(0);
    }
    // 보호막이 한 번도 피해를 막지 않았다면 이 테스트는 아무것도 재지 않는다
    expect(absorbedSeen).toBeGreaterThan(0);
  });
});

describe('hpLossOf', () => {
  it('막은 양이 없으면 피해량 그대로다', () => {
    expect(hpLossOf({ turn: 1, type: 'damage', amount: 120 })).toBe(120);
  });
  it('막은 양만큼 덜 깎인다 — 전부 막으면 0이다', () => {
    expect(hpLossOf({ turn: 1, type: 'damage', amount: 120, absorbed: 50 })).toBe(70);
    expect(hpLossOf({ turn: 1, type: 'damage', amount: 120, absorbed: 120 })).toBe(0);
  });
});
