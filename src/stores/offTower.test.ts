/**
 * `finish()`의 정산이 `settleOffTower`와 **같은가** — 정산 단일 출처 잠금.
 * 결과 화면이 같은 함수로 미리 보여주므로, 갈라지면 "보인 것과 들어온 것이 다르다".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { settleOffTower } from '../game/offTower';
import { ASSIGNABLE } from '../game/data/facilities';
import type { AdventureId } from '../game/data/adventures';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}
beforeEach(() => vi.stubGlobal('localStorage', new MemStorage()));

const MINE = 'adv_mine' as AdventureId;

describe('finish() = settleOffTower', () => {
  it('훈련생·귀환자의 정산 뒤 상태와 남은 원정이 같다', () => {
    for (const seed of [3, 7, 11, 19]) {
      const s = createRunStore(() => seed);
      s.setState({ maxFloorReached: 15, facilities: { ...s.getState().facilities, training: 2 } });
      const alive = s.getState().roster.filter((h) => !h.isDead);
      const squad = new Set<string>(s.getState().squads[0]);
      const free = alive.filter((h) => !squad.has(h.instId));
      expect(free.length).toBeGreaterThan(0);
      // 이번 전투 직후 끝나는 원정 하나
      s.setState({ battleCount: 4, dispatches: [{ advId: MINE, heroIds: [free[0].instId], startedAtBattle: 3 }] });

      s.getState().start();
      const r = s.getState().result!;
      s.setState({ result: { ...r, outcome: 'victory', casualties: [] } });

      const st = s.getState();
      const fought = new Set<string>(st.result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId));
      const expected = settleOffTower({
        roster: st.roster,
        dispatches: st.dispatches,
        assignedIds: new Set(ASSIGNABLE.flatMap((k) => st.assignments[k] as string[])),
        trainingAssigned: st.assignments.training,
        trainingLevel: st.facilities.training,
        battleCount: st.battleCount,
        seed: st.seed,
        fought,
        casualties: new Set(),
        cleared: true,
      });
      expect(expected.trainees.length + expected.returned.length).toBeGreaterThan(0);

      s.getState().finish();
      const after = s.getState();
      for (const [id, h] of expected.after) {
        expect(after.roster.find((x) => x.instId === id), `seed ${seed} ${id}`).toEqual(h);
      }
      expect(after.dispatches).toEqual(expected.stillAway);
      expect(after.adventureOutcomes).toEqual(expected.outcomes);
    }
  });
});
