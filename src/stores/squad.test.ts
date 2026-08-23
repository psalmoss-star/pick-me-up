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

/**
 * 2군이 열린 상태로 만든다 (로스터 8인 + 21층 도달).
 *
 * 교체 잠금은 **2군 개방 이후에만** 걸린다 — 군이 하나뿐이면 "어느 군을 보낼까"라는
 * 선택 자체가 없어서 잠금이 리듬 장치가 아니라 진행 차단이 되기 때문이다.
 * 그래서 잠금을 검사하려면 먼저 2군을 열어야 한다.
 */
function withSquadsOpen(st: ReturnType<typeof store>) {
  const s = st.getState();
  const extra = Array.from({ length: 8 - s.roster.length }, (_, i) => ({
    ...s.roster[0],
    instId: `filler_${i}` as HeroInstId,
  }));
  st.setState({
    roster: [...s.roster, ...extra],
    maxFloorReached: 20, // 인덱스 20 = 21층
  });
  return st;
}

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
    const st = withSquadsOpen(store());
    st.setState({ lockedSquad: 0 });
    const before = [...st.getState().squads[0]];

    st.getState().toggleSquadMember(0, before[0]);

    expect(st.getState().squads[0]).toEqual(before);
  });

  /**
   * ⚠️ **군이 하나뿐일 때 잠그면 초반 내내 편성이 막힌다.**
   * 2군은 로스터 8인 + 21층에야 열리는데, 그 전에도 매 전투가 1군을 잠갔다.
   * "어느 군을 보낼까"가 선택이 아닌 구간에서 잠금은 리듬이 아니라 차단이다
   * (실기기에서 "편성이 되질 않아"로 보고됨).
   */
  it('2군 개방 전에는 잠기지 않는다 — 고를 군이 없으면 리듬 장치가 아니다', () => {
    const st = store(); // 2군 미개방(초기 로스터 6인, 1층)
    st.setState({ lastSortieSquad: 0, lockedSquad: 0 });
    const id = st.getState().squads[0][0];

    st.getState().toggleSquadMember(0, id);

    expect(st.getState().squads[0]).not.toContain(id);
  });

  it('잠기지 않은 군은 여전히 편성된다', () => {
    const st = withSquadsOpen(store());
    st.setState({ lockedSquad: 0 });
    const id = st.getState().roster.find(
      (h) => !st.getState().squads[0].includes(h.instId),
    )!.instId;

    st.getState().toggleSquadMember(1, id);

    expect(st.getState().squads[1]).toContain(id);
  });

  /**
   * ⚠️ **잠금이 교착을 만들면 안 된다.**
   *
   * `finish()`가 출전 군을 잠그는데 해제는 `start()` 안에서만 일어났다.
   * 그 군이 전멸하면 `start()`가 `members.length === 0`으로 실패하므로
   * **해제가 영영 안 돌고, 보충 편성도 막혀서 탑을 오를 수 없었다**
   * (실기기에서 "영웅이 죽었는데 탑을 오를 수가 없다"로 보고됨).
   *
   * 잠금의 목적은 "이긴 파티를 그대로 다음 층에"이지 진행 차단이 아니다.
   */
  it('출전 군이 전멸하면 잠기지 않는다 — 아니면 보충이 막혀 교착이다', () => {
    const st = withSquadsOpen(store());
    const wiped = [...st.getState().squads[0]];
    // 1군 전원 사망 + 직전 출전 군이 1군인 상태 = finish() 직후의 모습
    st.setState({
      roster: st.getState().roster.map(
        (h) => (wiped.includes(h.instId) ? { ...h, isDead: true, currentHp: 0 } : h),
      ),
      squads: [[], st.getState().squads[1]],
      lastSortieSquad: 0,
      lockedSquad: 0,
    });

    // 살아있는 영웅을 1군에 보충할 수 있어야 한다
    const alive = st.getState().roster.find((h) => !h.isDead)!.instId;
    st.getState().toggleSquadMember(0, alive);

    expect(st.getState().squads[0]).toContain(alive);
  });

  it('생존자가 남은 군은 여전히 잠긴다 — 잠금 자체는 살아 있어야 한다', () => {
    const st = withSquadsOpen(store());
    st.setState({ lastSortieSquad: 0, lockedSquad: 0 });
    const before = [...st.getState().squads[0]];

    st.getState().toggleSquadMember(0, before[0]);

    expect(st.getState().squads[0]).toEqual(before);
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
