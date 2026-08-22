/**
 * runStore 테스트.
 *
 * 여기서 지키려는 것은 두 가지다.
 *   1. 퍼머데스가 finish() 한 곳에서만, 정확히 일어난다
 *   2. 개입이 시드 재현성을 깨지 않는다
 *
 * 밸런스 수치는 검증하지 않는다 — 그건 sim/battle 테스트의 몫이다.
 */
import { describe, it, expect } from 'vitest';
import { createRunStore, initialRoster } from './runStore';
import { FLOORS } from '../game/data/floors';
import { partyLimitAt } from '../game/data/party';
import type { HeroInstId } from '../game/types';

/** 초기 파티 화면(1층 기준)의 정원. */
const initialPartyLimit = partyLimitAt(FLOORS[0].id);

/** 시드를 고정한 스토어. 같은 시드면 전투 결과가 같아야 한다. */
const fixedStore = (seed = 12345) => createRunStore(() => seed);

/** 로스터에서 개체 하나를 꺼낸다. 없으면 테스트를 실패시킨다. */
const heroOf = (store: ReturnType<typeof fixedStore>, id: HeroInstId) => {
  const h = store.getState().roster.find((x) => x.instId === id);
  if (!h) throw new Error(`로스터에 ${id}가 없다`);
  return h;
};

describe('파티 편성', () => {
  it('초기 파티는 정원만큼 채워져 있다', () => {
    const s = fixedStore().getState();
    expect(s.squads[0]).toHaveLength(initialPartyLimit);
  });

  it('이미 편성된 영웅을 다시 누르면 빠진다', () => {
    const store = fixedStore();
    const id = store.getState().squads[0][0];
    store.getState().toggleSquadMember(0, id);
    expect(store.getState().squads[0]).not.toContain(id);
  });

  it('정원을 넘겨 추가할 수 없다', () => {
    const store = fixedStore();
    // 초기 파티가 이미 정원이므로, 미편성 영웅을 넣어도 늘지 않는다
    const outsider = store
      .getState()
      .roster.find((h) => !store.getState().squads[0].includes(h.instId))!;
    store.getState().toggleSquadMember(0, outsider.instId);
    expect(store.getState().squads[0]).toHaveLength(initialPartyLimit);
    expect(store.getState().squads[0]).not.toContain(outsider.instId);
  });

  it('빠진 자리에는 다시 넣을 수 있다', () => {
    const store = fixedStore();
    const removed = store.getState().squads[0][0];
    store.getState().toggleSquadMember(0, removed);
    store.getState().toggleSquadMember(0, removed);
    expect(store.getState().squads[0]).toContain(removed);
    expect(store.getState().squads[0]).toHaveLength(initialPartyLimit);
  });
});

describe('전투 시작', () => {
  it('주입된 시드를 그대로 쓴다', () => {
    const store = fixedStore(777);
    store.getState().start();
    expect(store.getState().seed).toBe(777);
  });

  it('결과와 스냅샷이 채워진다', () => {
    const store = fixedStore();
    expect(store.getState().start()).toBe(true);
    expect(store.getState().result).not.toBeNull();
    // 스냅샷은 로스터 전체를 담는다. 인원수를 상수로 박으면 로스터가
    // 늘어날 때마다 무관한 테스트가 깨진다 — 5인 → 6인에서 실제로 그랬다.
    expect(store.getState().snapshot).toHaveLength(initialRoster().length);
  });

  it('파티가 비어 있으면 시작하지 않는다', () => {
    const store = fixedStore();
    for (const id of [...store.getState().squads[0]]) store.getState().toggleSquadMember(0, id);
    expect(store.getState().start()).toBe(false);
    expect(store.getState().result).toBeNull();
  });

  it('같은 시드는 같은 전투를 만든다', () => {
    const a = fixedStore(2024);
    const b = fixedStore(2024);
    a.getState().start();
    b.getState().start();
    expect(a.getState().result!.events).toEqual(b.getState().result!.events);
  });

  it('시작할 때 이전 개입이 초기화된다', () => {
    const store = fixedStore();
    store.getState().start();
    store.getState().intervene([{ kind: 'focus', turn: 2, targetUid: 'E:0:x' } as never]);
    store.getState().start();
    expect(store.getState().interventions).toEqual([]);
  });
});

describe('개입', () => {
  it('개입 목록이 상태에 남는다', () => {
    const store = fixedStore();
    store.getState().start();
    const target = store.getState().result!.roster.find((u) => u.side === 'enemy')!;
    const iv = [{ kind: 'focus', turn: 2, targetUid: target.uid } as never];
    store.getState().intervene(iv);
    expect(store.getState().interventions).toEqual(iv);
  });

  it('같은 개입을 다시 적용하면 같은 결과가 나온다 (재현성)', () => {
    const store = fixedStore(999);
    store.getState().start();
    const target = store.getState().result!.roster.find((u) => u.side === 'enemy')!;
    const iv = [{ kind: 'focus', turn: 2, targetUid: target.uid } as never];

    store.getState().intervene(iv);
    const first = store.getState().result!.events;
    store.getState().intervene(iv);
    expect(store.getState().result!.events).toEqual(first);
  });

  it('전투 시작 전 개입은 무시된다', () => {
    const store = fixedStore();
    store.getState().intervene([{ kind: 'focus', turn: 1, targetUid: 'x' } as never]);
    expect(store.getState().result).toBeNull();
  });
});

describe('퍼머데스 (finish)', () => {
  it('전사자는 isDead로 표시되고 파티에서 빠진다', () => {
    const store = fixedStore();
    store.getState().start();

    // 결과를 직접 조작해 사망자를 강제한다 — 밸런스에 의존하지 않기 위해
    const victim = store.getState().squads[0][0];
    store.setState({
      result: { ...store.getState().result!, casualties: [victim], outcome: 'defeat' },
    });
    store.getState().finish();

    const s = store.getState();
    expect(s.roster.find((h) => h.instId === victim)!.isDead).toBe(true);
    expect(s.squads[0]).not.toContain(victim);
    expect(s.deathCount).toBe(1);
  });

  it('사망한 영웅은 로스터에서 지워지지 않는다 (기록 보존)', () => {
    const store = fixedStore();
    const before = store.getState().roster.length;
    store.getState().start();
    const victim = store.getState().squads[0][0];
    store.setState({
      result: { ...store.getState().result!, casualties: [victim], outcome: 'defeat' },
    });
    store.getState().finish();
    expect(store.getState().roster).toHaveLength(before);
  });

  it('승리하면 다음 층으로 올라간다', () => {
    const store = fixedStore();
    store.getState().start();
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'victory' },
    });
    store.getState().finish();
    expect(store.getState().floorIndex).toBe(1);
  });

  /**
   * 참전 영웅의 경험치.
   *
   * floorRewards().exp는 결과 화면이 "Exp +80"으로 **이미 보여주고 있었는데**
   * 어디에서도 지급되지 않아 사라지고 있었다 — 즉 싸운 영웅은 영원히 레벨이 안 올랐다.
   * (훈련소의 유휴 exp는 전투에 **안 나간** 영웅만 받으므로 이걸 대신하지 못한다.)
   * §5-12와 같은 종류의 버그이고, 표시와 실제가 어긋나는 것이라 반드시 잠가둔다.
   */
  it('승리하면 참전 영웅이 경험치를 받는다', () => {
    const store = fixedStore();
    store.getState().start();
    const fighter = store.getState().squads[0][0];
    const before = store.getState().roster.find((h) => h.instId === fighter)!;
    const beforeTotal = before.level * 1e6 + before.exp;

    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'victory' },
    });
    store.getState().finish();

    const after = store.getState().roster.find((h) => h.instId === fighter)!;
    expect(after.level * 1e6 + after.exp).toBeGreaterThan(beforeTotal);
  });

  it('패배하면 경험치를 주지 않는다', () => {
    // 층 보상과 같은 규칙 — 결과 화면의 "획득: 없음"과 일치해야 한다.
    const store = fixedStore();
    store.getState().start();
    const fighter = store.getState().squads[0][0];
    const before = store.getState().roster.find((h) => h.instId === fighter)!;

    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'defeat' },
    });
    store.getState().finish();

    const after = store.getState().roster.find((h) => h.instId === fighter)!;
    expect(after.level).toBe(before.level);
    expect(after.exp).toBe(before.exp);
  });

  it('패배하면 층이 그대로다', () => {
    const store = fixedStore();
    store.getState().start();
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'defeat' },
    });
    store.getState().finish();
    expect(store.getState().floorIndex).toBe(0);
  });

  it('마지막 층을 넘어가지 않는다', () => {
    const store = fixedStore();
    // 최상층으로 밀어놓고 승리시킨다.
    // 층 수를 하드코딩하면 층이 늘 때 조용히 '중간 층 테스트'가 된다 → FLOORS에서 파생시킨다.
    store.getState().start();
    const last = FLOORS.length - 1;
    store.setState({ floorIndex: last });
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'victory' },
    });
    store.getState().finish();
    expect(store.getState().floorIndex).toBe(last);
  });

  it('최상층을 깨면 towerCleared가 선다', () => {
    const store = fixedStore();
    store.getState().start();
    // towerCleared는 maxFloorReached 기준이므로 최전선도 같이 최상층으로 올려둔다.
    store.setState({ floorIndex: FLOORS.length - 1, maxFloorReached: FLOORS.length - 1 });
    expect(store.getState().towerCleared).toBe(false);
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'victory' },
    });
    store.getState().finish();
    expect(store.getState().towerCleared).toBe(true);
  });

  it('최상층에서 패배하면 towerCleared가 서지 않는다', () => {
    const store = fixedStore();
    store.getState().start();
    store.setState({ floorIndex: FLOORS.length - 1 });
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'defeat' },
    });
    store.getState().finish();
    expect(store.getState().towerCleared).toBe(false);
  });

  it('중간 층을 깨는 것만으로는 towerCleared가 서지 않는다', () => {
    const store = fixedStore();
    store.getState().start();
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'victory' },
    });
    store.getState().finish();
    expect(store.getState().towerCleared).toBe(false);
  });

  it('finish 후 결과가 비워져 화면이 결과에 머물지 않는다', () => {
    const store = fixedStore();
    store.getState().start();
    store.getState().finish();
    expect(store.getState().result).toBeNull();
  });

  it('결과가 없으면 아무 일도 하지 않는다', () => {
    const store = fixedStore();
    const before = store.getState();
    store.getState().finish();
    expect(store.getState().floorIndex).toBe(before.floorIndex);
    expect(store.getState().deathCount).toBe(0);
  });

  it('사망자가 누적된다', () => {
    const store = fixedStore();
    const kill = (id: HeroInstId) => {
      store.getState().start();
      store.setState({
        result: { ...store.getState().result!, casualties: [id], outcome: 'defeat' },
      });
      store.getState().finish();
    };
    const [a, b] = store.getState().squads[0];
    kill(a);
    kill(b);
    expect(store.getState().deathCount).toBe(2);
  });

  it('죽은 영웅은 다시 편성되지 않는다', () => {
    const store = fixedStore();
    store.getState().start();
    const victim = store.getState().squads[0][0];
    store.setState({
      result: { ...store.getState().result!, casualties: [victim], outcome: 'defeat' },
    });
    store.getState().finish();

    store.getState().toggleSquadMember(0, victim);
    // toggleSquadMember 자체가 죽은 영웅을 거부한다 — 편성에 애초에 안 들어간다
    expect(store.getState().squads[0]).not.toContain(victim);
    store.getState().start();
    const fought = store.getState().result!.roster.filter((u) => u.side === 'ally');
    expect(fought.map((u) => u.sourceId)).not.toContain(victim);
  });
});

/**
 * 발굴 진행도.
 *
 * 여기서 지키려는 것은 "진행도는 전투에 내보내야만 오른다"는 규칙이다(reveal.ts 참조).
 * 대기실에 앉아 있는 영웅이 조금이라도 오르면 발굴과 퍼머데스의 맞물림이 풀린다.
 *
 * 증가량 자체(perBattle/perFloor)는 검증하지 않는다 — 그건 REVEAL_TUNING의 몫이고,
 * 여기서 숫자를 박으면 튜닝할 때마다 테스트가 깨진다.
 */
describe('발굴 진행도 (finish)', () => {
  const progressOf = (store: ReturnType<typeof fixedStore>, id: HeroInstId) =>
    store.getState().roster.find((h) => h.instId === id)!.revealProgress ?? 0;

  it('초기 로스터는 개체 시드를 가진다 (없으면 발굴이 영원히 판단 불가)', () => {
    for (const h of fixedStore().getState().roster) {
      expect(h.seed).toBeDefined();
      expect(h.revealProgress).toBe(0);
    }
  });

  it('전투에 나간 영웅은 진행도가 오른다', () => {
    const store = fixedStore();
    const fighter = store.getState().squads[0][0];
    store.getState().start();
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'victory' },
    });
    store.getState().finish();
    expect(progressOf(store, fighter)).toBeGreaterThan(0);
  });

  it('대기실에 남은 영웅은 오르지 않는다', () => {
    const store = fixedStore();
    const bench = store
      .getState()
      .roster.find((h) => !store.getState().squads[0].includes(h.instId))!.instId;
    store.getState().start();
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'victory' },
    });
    store.getState().finish();
    expect(progressOf(store, bench)).toBe(0);
  });

  it('층을 돌파하면 참여만 했을 때보다 더 오른다', () => {
    const run = (outcome: 'victory' | 'defeat') => {
      const store = fixedStore();
      const fighter = store.getState().squads[0][0];
      store.getState().start();
      store.setState({
        result: { ...store.getState().result!, casualties: [], outcome },
      });
      store.getState().finish();
      return progressOf(store, fighter);
    };
    expect(run('victory')).toBeGreaterThan(run('defeat'));
  });

  it('패배해도 참여분은 오른다 (관찰은 쌓인다)', () => {
    const store = fixedStore();
    const fighter = store.getState().squads[0][0];
    store.getState().start();
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'defeat' },
    });
    store.getState().finish();
    expect(progressOf(store, fighter)).toBeGreaterThan(0);
  });

  it('죽은 영웅의 진행도도 남는다 (무덤 기록)', () => {
    const store = fixedStore();
    store.getState().start();
    const victim = store.getState().squads[0][0];
    store.setState({
      result: { ...store.getState().result!, casualties: [victim], outcome: 'defeat' },
    });
    store.getState().finish();
    const dead = store.getState().roster.find((h) => h.instId === victim)!;
    expect(dead.isDead).toBe(true);
    expect(dead.revealProgress ?? 0).toBeGreaterThan(0);
  });

  it('전투를 반복하면 누적된다', () => {
    const store = fixedStore();
    const fighter = store.getState().squads[0][0];
    const once = (() => {
      store.getState().start();
      store.setState({
        result: { ...store.getState().result!, casualties: [], outcome: 'defeat' },
      });
      store.getState().finish();
      return progressOf(store, fighter);
    })();
    store.getState().start();
    store.setState({
      result: { ...store.getState().result!, casualties: [], outcome: 'defeat' },
    });
    store.getState().finish();
    expect(progressOf(store, fighter)).toBeGreaterThan(once);
  });

  it('진행도는 1을 넘지 않는다', () => {
    const store = fixedStore();
    const fighter = store.getState().squads[0][0];
    for (let i = 0; i < 40; i++) {
      store.getState().start();
      store.setState({
        result: { ...store.getState().result!, casualties: [], outcome: 'defeat' },
      });
      store.getState().finish();
    }
    expect(progressOf(store, fighter)).toBe(1);
  });
});

describe('즐겨찾기', () => {
  it('처음에는 아무도 즐겨찾기가 아니다', () => {
    const s = fixedStore().getState();
    expect(s.roster.every((h) => !h.favorite)).toBe(true);
  });

  it('누르면 켜지고 다시 누르면 꺼진다', () => {
    const store = fixedStore();
    const id = store.getState().roster[0].instId;

    store.getState().toggleFavorite(id);
    expect(heroOf(store, id).favorite).toBe(true);

    store.getState().toggleFavorite(id);
    expect(heroOf(store, id).favorite).toBe(false);
  });

  it('한 명을 켜도 다른 영웅은 그대로다', () => {
    const store = fixedStore();
    const [a, b] = store.getState().roster;
    store.getState().toggleFavorite(a.instId);
    expect(heroOf(store, b.instId).favorite).toBeFalsy();
  });

  /**
   * 퍼머데스는 되돌리지 않는다 — 죽은 영웅의 표식을 바꾸게 두면
   * 무덤 기록이 사후에 편집 가능해진다.
   */
  it('죽은 영웅은 즐겨찾기를 바꿀 수 없다', () => {
    const store = fixedStore();
    const id = store.getState().roster[0].instId;
    store.setState((s) => ({
      roster: s.roster.map((h) => (h.instId === id ? { ...h, isDead: true } : h)),
    }));

    store.getState().toggleFavorite(id);
    expect(heroOf(store, id).favorite).toBeFalsy();
  });

  it('없는 id를 눌러도 아무 일도 없다', () => {
    const store = fixedStore();
    const before = store.getState().roster;
    store.getState().toggleFavorite('없는영웅#99' as HeroInstId);
    expect(store.getState().roster).toEqual(before);
  });
});

describe('reset', () => {
  it('초기 상태로 되돌린다', () => {
    const store = fixedStore();
    store.getState().start();
    store.setState({ floorIndex: 3, deathCount: 2 });
    store.getState().reset();

    const s = store.getState();
    expect(s.floorIndex).toBe(0);
    expect(s.deathCount).toBe(0);
    expect(s.result).toBeNull();
    expect(s.roster.every((h) => !h.isDead)).toBe(true);
  });
});
