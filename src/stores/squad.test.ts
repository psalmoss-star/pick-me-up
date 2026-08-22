/**
 * squads(1군/2군) 테스트. TASK 3.
 *
 * 지키려는 것:
 *   1. 한 영웅은 두 군에 동시에 못 든다 — 스토어가 강제한다
 *   2. lockedSquad가 걸린 군은 편성이 바뀌지 않는다
 *   3. 저장 왕복 후에도 squads/lockedSquad가 보존되고, 수동 편집 중복은 교정된다
 */
import { describe, it, expect } from 'vitest';
import { createRunStore } from './runStore';
import { serialize, deserialize } from './save';
import type { HeroInstId } from '../game/types';

const store = () => createRunStore(() => 42);

describe('squads — 편성', () => {
  it('초기 상태는 1군에 3인, 2군은 비어 있다', () => {
    const s = store().getState();
    expect(s.squads).toHaveLength(2);
    expect(s.squads[0]).toHaveLength(3);
    expect(s.squads[1]).toEqual([]);
  });

  it('한 영웅은 두 군에 동시에 들 수 없다 — 넣으면 원래 군에서 빠진다', () => {
    const st = store();
    const moved = st.getState().squads[0][0];

    st.getState().toggleSquadMember(1, moved);

    expect(st.getState().squads[0]).not.toContain(moved);
    expect(st.getState().squads[1]).toContain(moved);
  });

  it('같은 군에서 다시 누르면 빠진다', () => {
    const st = store();
    const id = st.getState().squads[0][0];

    st.getState().toggleSquadMember(0, id);

    expect(st.getState().squads[0]).not.toContain(id);
  });

  it('정원을 넘겨 넣을 수 없다', () => {
    const st = store();
    // 1층(정원 3)에서 시작한다. 이미 3인이므로 네 번째는 안 들어간다.
    const outsider = st.getState().roster.find(
      (h) => !st.getState().squads[0].includes(h.instId),
    )!;

    st.getState().toggleSquadMember(0, outsider.instId);

    expect(st.getState().squads[0]).toHaveLength(3);
    expect(st.getState().squads[0]).not.toContain(outsider.instId);
  });

  it('죽은 영웅은 편성할 수 없다', () => {
    const st = store();
    const victim = st.getState().roster.find(
      (h) => !st.getState().squads[0].includes(h.instId),
    )!;
    st.setState((s) => ({
      roster: s.roster.map((h) => (h.instId === victim.instId ? { ...h, isDead: true } : h)),
      squads: [[], []],
    }));

    st.getState().toggleSquadMember(0, victim.instId);

    expect(st.getState().squads[0]).not.toContain(victim.instId);
  });

  it('없는 id는 무시된다', () => {
    const st = store();
    const before = st.getState().squads[0].length;

    st.getState().toggleSquadMember(0, 'nope#999' as HeroInstId);

    expect(st.getState().squads[0]).toHaveLength(before);
  });
});

describe('lockedSquad — 교체 잠금', () => {
  it('초기에는 잠금이 없다', () => {
    expect(store().getState().lockedSquad).toBeNull();
  });

  it('잠긴 군은 편성이 바뀌지 않는다', () => {
    const st = store();
    st.setState({ lockedSquad: 0 });
    const before = [...st.getState().squads[0]];

    st.getState().toggleSquadMember(0, before[0]);

    expect(st.getState().squads[0]).toEqual(before);
  });

  it('잠기지 않은 군은 여전히 편성된다', () => {
    const st = store();
    st.setState({ lockedSquad: 0 });
    const id = st.getState().roster.find(
      (h) => !st.getState().squads[0].includes(h.instId),
    )!.instId;

    st.getState().toggleSquadMember(1, id);

    expect(st.getState().squads[1]).toContain(id);
  });
});

describe('저장 왕복 (§5-32)', () => {
  it('squads와 lockedSquad가 저장·복원된다', () => {
    const st = store();
    const id = st.getState().roster.find(
      (h) => !st.getState().squads[0].includes(h.instId),
    )!.instId;
    st.getState().toggleSquadMember(1, id);
    st.setState({ lockedSquad: 1 });

    // serialize → deserialize 왕복
    const restored = deserialize(serialize(st.getState()))!;

    expect(restored.squads[1]).toContain(id);
    expect(restored.lockedSquad).toBe(1);
  });

  it('두 군에 중복으로 든 영웅은 복원 시 교정된다', () => {
    const raw = JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      run: {
        floorIndex: 0,
        maxFloorReached: 0,
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        squads: [['h_ashen#1'], ['h_ashen#1']],
      },
    });

    const out = deserialize(raw)!;
    const flat = out.squads.flat();
    expect(new Set(flat).size).toBe(flat.length);   // 중복 없음
  });
});
