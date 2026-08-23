/**
 * 모험 파견 — 스토어 연결.
 *
 * ⚠️ **이 파일의 절반은 교착 방지 테스트다.**
 *
 * `runStore.ts`의 `isSquadLocked` 주석에 기록된 실기기 사고가 있다:
 *   "잠금 해제는 start() 안에서만 일어나는데, 그 군에 살아있는 사람이 없으면
 *    start()가 실패해서 **해제가 영영 안 돈다** … '영웅이 죽었는데 탑을 오를 수 없는' 교착"
 *
 * 파견(`away`)은 **같은 모양의 잠금**이다. 영웅을 묶어두는데, 푸는 조건이
 * 다른 행동의 성공에 의존하면 똑같은 사고가 난다. 그래서 아래를 잠근다:
 *   - 로스터 전원을 파견해도 등반이 막히지 않는다
 *   - 조기 복귀는 **무조건** 성공한다 (완료 여부·금·파티 상태 무관)
 *   - 새 런은 파견을 전부 청산한다
 *   - 정의가 사라진 모험도 영웅을 붙잡지 못한다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { serialize, deserialize } from './save';
import { ADVENTURE_BY_ID } from '../game/data/adventures';
import { dispatchedHeroIds } from '../game/adventure';
import { TRAINING_IDLE_EXP } from '../game/data/facilities';
import type { AdventureId } from '../game/data/adventures';
import type { HeroInstId } from '../game/types';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

const store = (seed = 42) => createRunStore(() => seed);
const MINE = 'adv_mine' as AdventureId;
const RIFT = 'adv_rift' as AdventureId;

/** 승리로 한 층 돌파시킨다 */
function clearFloor(s: ReturnType<typeof store>) {
  s.getState().start();
  const r = s.getState().result;
  if (!r) throw new Error('start() 실패');
  s.setState({ result: { ...r, outcome: 'victory', casualties: [] } });
  s.getState().finish();
}

/** 파견 가능하도록 모험을 전부 해금한다 */
function unlockAll(s: ReturnType<typeof store>) {
  s.setState({ maxFloorReached: 15 });
}

const rosterIds = (s: ReturnType<typeof store>) =>
  s.getState().roster.filter((h) => !h.isDead).map((h) => h.instId);

describe('파견 — 기본', () => {
  it('보내면 명단에 남고 시작 전투 수가 기록된다', () => {
    const s = store();
    unlockAll(s);
    s.setState({ battleCount: 5 });
    const res = s.getState().dispatchAdventure(MINE, [rosterIds(s)[0]]);
    expect(res.ok).toBe(true);
    expect(s.getState().dispatches).toHaveLength(1);
    expect(s.getState().dispatches[0].startedAtBattle).toBe(5);
  });

  it('해금 전 모험은 못 보낸다', () => {
    const s = store();
    s.setState({ maxFloorReached: 0 }); // 1층
    const res = s.getState().dispatchAdventure(RIFT, rosterIds(s).slice(0, 2));
    expect(res).toEqual({ ok: false, reason: 'locked' });
    expect(s.getState().dispatches).toHaveLength(0);
  });

  it('인원 수가 안 맞으면 거절한다', () => {
    const s = store();
    unlockAll(s);
    const res = s.getState().dispatchAdventure(RIFT, [rosterIds(s)[0]]); // 균열은 2명
    expect(res).toEqual({ ok: false, reason: 'wrong-party-size' });
  });

  it('이미 나가 있는 영웅은 두 번 못 보낸다', () => {
    const s = store();
    unlockAll(s);
    const [a, b, c] = rosterIds(s);
    s.getState().dispatchAdventure(MINE, [a]);
    expect(s.getState().dispatchAdventure(RIFT, [a, b])).toEqual({
      ok: false, reason: 'already-away',
    });
    // 겹치지 않으면 된다
    expect(s.getState().dispatchAdventure(RIFT, [b, c]).ok).toBe(true);
  });

  it('죽은 영웅은 못 보낸다', () => {
    const s = store();
    unlockAll(s);
    const id = rosterIds(s)[0];
    s.setState({
      roster: s.getState().roster.map((h) => (h.instId === id ? { ...h, isDead: true } : h)),
    });
    expect(s.getState().dispatchAdventure(MINE, [id])).toEqual({ ok: false, reason: 'dead-hero' });
  });
});

describe('파견 — ⚠️ 교착 방지', () => {
  /**
   * ⚠️ **가장 중요한 테스트.**
   *
   * 전원을 내보내면 싸울 사람이 없으므로 `start()`는 당연히 실패한다 — 그건 교착이
   * 아니다. 교착은 **거기서 빠져나올 방법이 없을 때** 생긴다.
   *
   * 그래서 검사하는 것은 "항상 등반할 수 있다"가 아니라
   * **"언제든 되돌려서 등반할 수 있다"**이다. 조기 복귀가 그 유일한 탈출구이고,
   * 그래서 어떤 조건도 붙으면 안 된다.
   */
  it('전원을 파견해도 복귀만 하면 즉시 등반할 수 있다', () => {
    const s = store();
    unlockAll(s);
    const ids = rosterIds(s);
    expect(ids.length).toBeGreaterThan(2);
    for (const id of ids) expect(s.getState().dispatchAdventure(MINE, [id]).ok).toBe(true);
    expect(dispatchedHeroIds(s.getState().dispatches).size).toBe(ids.length);

    // 전원이 나가 있으면 출전할 사람이 없다 — 여기까지는 정상이다
    expect(s.getState().start()).toBe(false);

    // 탈출구: 아무 조건 없이 되돌린다. 되돌리는 데 전투도 금도 필요하지 않다
    while (s.getState().dispatches.length > 0) s.getState().recallDispatch(0);
    expect(s.getState().start()).toBe(true);
  });

  it('조기 복귀는 무조건 성공한다 — 완료 전이어도, 금이 0이어도', () => {
    const s = store();
    unlockAll(s);
    s.setState({ wallet: { ...s.getState().wallet, gold: 0 } });
    const [a, b] = rosterIds(s);
    s.getState().dispatchAdventure(RIFT, [a, b]);
    expect(s.getState().dispatches).toHaveLength(1);

    s.getState().recallDispatch(0);
    expect(s.getState().dispatches).toHaveLength(0);
  });

  it('조기 복귀는 보상도 부상도 주지 않는다 — 판정 자체를 안 한다', () => {
    const s = store();
    unlockAll(s);
    const before = { ...s.getState().materials };
    const stonesBefore = s.getState().wallet.awakeningStones;
    const [a, b] = rosterIds(s);
    s.getState().dispatchAdventure(RIFT, [a, b]);
    s.getState().recallDispatch(0);

    expect(s.getState().materials).toEqual(before);
    expect(s.getState().wallet.awakeningStones).toBe(stonesBefore);
  });

  it('범위 밖 index로 복귀를 불러도 던지지 않는다 — 화면이 죽는 것도 교착이다', () => {
    const s = store();
    unlockAll(s);
    s.getState().dispatchAdventure(MINE, [rosterIds(s)[0]]);
    expect(() => s.getState().recallDispatch(99)).not.toThrow();
    expect(s.getState().dispatches).toHaveLength(1);
  });

  it('새 런은 파견을 전부 청산한다', () => {
    const s = store();
    unlockAll(s);
    s.getState().dispatchAdventure(MINE, [rosterIds(s)[0]]);
    expect(s.getState().dispatches).toHaveLength(1);

    // startNewRun()은 towerCleared를 전제한다 — 아니면 조용히 아무것도 안 한다
    s.setState({ towerCleared: true });
    s.getState().startNewRun();
    expect(s.getState().dispatches).toHaveLength(0);
  });

  it('탑을 깨지 않았으면 새 런 자체가 안 돌아가므로 파견도 그대로다', () => {
    // 위 테스트가 towerCleared를 세우는 이유를 남긴다 — 안 그러면 다음 사람이
    // "청산이 되네?"라고 착각하고 조건을 지운다
    const s = store();
    unlockAll(s);
    s.getState().dispatchAdventure(MINE, [rosterIds(s)[0]]);
    s.getState().startNewRun(); // towerCleared가 false라 무시된다
    expect(s.getState().dispatches).toHaveLength(1);
  });

  it('정의가 사라진 모험은 다음 돌파에서 정산되어 영웅을 놓아준다', () => {
    const s = store();
    unlockAll(s);
    // 데이터에서 모험을 지운 상황을 흉내낸다 (세이브가 살아남은 경우)
    s.setState({
      dispatches: [{
        advId: 'adv_ghost' as AdventureId,
        heroIds: [rosterIds(s)[0]],
        startedAtBattle: 0,
      }],
    });
    clearFloor(s);
    expect(s.getState().dispatches).toHaveLength(0);
  });
});

describe('파견 — 편성·출전에서 빠진다', () => {
  it('나가 있는 영웅은 파티에 넣을 수 없다', () => {
    const s = store();
    unlockAll(s);
    // 편성돼 있지 않은 영웅을 고른다
    const benched = rosterIds(s).filter((id) => !s.getState().squads.flat().includes(id));
    const id = benched[0];
    s.getState().dispatchAdventure(MINE, [id]);

    s.getState().toggleSquadMember(1, id);
    expect(s.getState().squads.flat()).not.toContain(id);
  });

  it('편성된 채로 나가도 파티에서 뺄 수는 있다 — 넣기만 막는다', () => {
    const s = store();
    unlockAll(s);
    const id = s.getState().squads[0][0];
    s.getState().dispatchAdventure(MINE, [id]);
    expect(s.getState().squads[0]).toContain(id);

    s.getState().toggleSquadMember(0, id);
    expect(s.getState().squads[0]).not.toContain(id);
  });

  it('편성된 채로 나간 영웅은 출전에 끼지 않는다 — 모험 중에 탑에서 죽으면 안 된다', () => {
    const s = store();
    unlockAll(s);
    const id = s.getState().squads[0][0];
    s.getState().dispatchAdventure(MINE, [id]);

    s.getState().start();
    const fought = s.getState().result!.roster
      .filter((u) => u.side === 'ally' && u.kind === 'hero')
      .map((u) => u.sourceId);
    expect(fought).not.toContain(id);
  });

  it('1군 전원이 나가 있으면 그 군은 출전하지 못한다 — 다만 다른 군은 멀쩡하다', () => {
    const s = store();
    unlockAll(s);
    for (const id of s.getState().squads[0]) {
      s.getState().dispatchAdventure(MINE, [id]);
    }
    expect(s.getState().start(0)).toBe(false);

    // 남은 인원으로 2군을 짜면 등반이 이어진다 = 교착이 아니다
    const free = rosterIds(s).filter((id) => !dispatchedHeroIds(s.getState().dispatches).has(id));
    expect(free.length).toBeGreaterThan(0);
    for (const id of free) s.getState().toggleSquadMember(1, id);
    expect(s.getState().start(1)).toBe(true);
  });
});

describe('파견 — 기간은 전투 횟수다', () => {
  it('소요 전투 수를 채우면 정산되고 명단에서 빠진다', () => {
    const s = store(7);
    unlockAll(s);
    const def = ADVENTURE_BY_ID[MINE];
    s.getState().dispatchAdventure(MINE, [rosterIds(s)[0]]);

    for (let i = 0; i < def.duration - 1; i++) {
      clearFloor(s);
      expect(s.getState().dispatches, `${i + 1}번째 전투 후`).toHaveLength(1);
    }
    clearFloor(s);
    expect(s.getState().dispatches).toHaveLength(0);
    expect(s.getState().adventureOutcomes).toHaveLength(1);
  });

  it('패배해도 정산된다 — 모험은 탑 밖의 일이다', () => {
    const s = store(7);
    unlockAll(s);
    const def = ADVENTURE_BY_ID[MINE];
    s.getState().dispatchAdventure(MINE, [rosterIds(s)[0]]);

    for (let i = 0; i < def.duration; i++) {
      s.getState().start();
      const r = s.getState().result!;
      s.setState({ result: { ...r, outcome: 'defeat', casualties: [] } });
      s.getState().finish();
    }
    expect(s.getState().dispatches).toHaveLength(0);
  });
});

describe('파견 — 보상 지급', () => {
  /** 지정한 모험을 완료시키고 결과를 돌려준다 */
  function runToCompletion(seed: number, advId: AdventureId) {
    const s = store(seed);
    unlockAll(s);
    const def = ADVENTURE_BY_ID[advId];
    const ids = rosterIds(s).slice(0, def.partySize);
    s.getState().dispatchAdventure(advId, ids);
    const before = {
      materials: { ...s.getState().materials },
      stones: s.getState().wallet.awakeningStones,
    };
    for (let i = 0; i < def.duration; i++) clearFloor(s);
    return { s, before, outcome: s.getState().adventureOutcomes[0], ids };
  }

  it('성공하면 재료가 실제로 지갑에 들어온다', () => {
    // 성공하는 시드를 찾는다
    let found = false;
    for (let seed = 1; seed < 30 && !found; seed++) {
      const { s, outcome } = runToCompletion(seed, MINE);
      if (!outcome?.success) continue;
      found = true;
      const total = Object.values(s.getState().materials).reduce<number>((a, n) => a + (n ?? 0), 0);
      expect(total).toBeGreaterThan(0);
    }
    expect(found).toBe(true);
  });

  it('각성석이 실제로 지갑에 들어온다 — ★5가 도달 가능해진다', () => {
    let granted = 0;
    for (let seed = 1; seed < 40; seed++) {
      const { s, before, outcome } = runToCompletion(seed, RIFT);
      if (!outcome?.awakeningStones) continue;
      granted++;
      expect(s.getState().wallet.awakeningStones)
        .toBe(before.stones + outcome.awakeningStones);
    }
    expect(granted).toBeGreaterThan(0);
  });

  it('실패하면 부상만 남는다 — 아무도 죽지 않는다', () => {
    let checked = 0;
    for (let seed = 1; seed < 40; seed++) {
      const { s, outcome, ids } = runToCompletion(seed, RIFT);
      if (!outcome || outcome.success) continue;
      checked++;
      for (const id of ids) {
        const h = s.getState().roster.find((x) => x.instId === id)!;
        expect(h.isDead, '모험에서는 죽지 않는다').toBe(false);
        expect(h.currentHp).toBeGreaterThan(0);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('파견 — ⚠️ 함정2: "안 내보내는 게 이득"이 되면 안 된다', () => {
  /**
   * 파견 인원이 훈련소 유휴 exp까지 받으면 **파견이 순이득**이 된다 —
   * 대기실에 두는 것보다 항상 나으므로 "일단 다 내보내기"가 유일한 최적해가 되고,
   * 그러면 누구를 보낼지 고민할 이유가 사라진다.
   */
  it('파견 중인 영웅은 훈련소 유휴 exp를 받지 않는다', () => {
    const s = store(11);
    unlockAll(s);
    s.setState({ facilities: { ...s.getState().facilities, training: 3 } });
    expect(TRAINING_IDLE_EXP[3]).toBeGreaterThan(0);

    const ids = rosterIds(s);
    // 출전하지 않는 영웅 둘을 고른다 — 하나는 파견, 하나는 대기
    const benched = ids.filter((id) => !s.getState().squads.flat().includes(id));
    expect(benched.length).toBeGreaterThanOrEqual(2);
    const [awayId, idleId] = benched;

    s.getState().dispatchAdventure(MINE, [awayId]);
    const expOf = (id: HeroInstId) => {
      const h = s.getState().roster.find((x) => x.instId === id)!;
      return { level: h.level, exp: h.exp };
    };
    const awayBefore = expOf(awayId);
    const idleBefore = expOf(idleId);

    clearFloor(s); // 아직 완료 전(폐광 2전투) — 파견 중인 상태로 한 층 돌파

    expect(s.getState().dispatches, '아직 나가 있어야 한다').toHaveLength(1);
    // 대기 영웅은 받았다
    expect(expOf(idleId)).not.toEqual(idleBefore);
    // 파견 영웅은 못 받았다
    expect(expOf(awayId)).toEqual(awayBefore);
  });
});

describe('파견 — 저장 왕복', () => {
  it('파견 중 저장·복원 후 남은 전투 수가 보존된다', () => {
    const s = store(13);
    unlockAll(s);
    s.setState({ battleCount: 4 });
    s.getState().dispatchAdventure(RIFT, rosterIds(s).slice(0, 2));

    const restored = deserialize(serialize(s.getState()));
    expect(restored).not.toBeNull();
    expect(restored!.dispatches).toHaveLength(1);
    expect(restored!.dispatches[0].startedAtBattle).toBe(4);
    expect(restored!.dispatches[0].advId).toBe(RIFT);
    expect(restored!.battleCount).toBe(4);
  });

  it('새로고침으로 영웅을 즉시 되찾을 수 없다 — 기다림이 사라지면 모험이 성립하지 않는다', () => {
    const s = store(13);
    unlockAll(s);
    s.getState().dispatchAdventure(MINE, [rosterIds(s)[0]]);

    const s2 = store(13);
    s2.getState().hydrate(deserialize(serialize(s.getState()))!);
    expect(s2.getState().dispatches).toHaveLength(1);
  });

  it('정의에 없는 모험은 복원 때 버려진다 — 유령 파견은 곧 교착이다', () => {
    const s = store();
    unlockAll(s);
    s.setState({
      dispatches: [
        { advId: 'adv_ghost' as AdventureId, heroIds: ['x' as HeroInstId], startedAtBattle: 0 },
        { advId: MINE, heroIds: [rosterIds(s)[0]], startedAtBattle: 0 },
      ],
    });
    const restored = deserialize(serialize(s.getState()))!;
    expect(restored.dispatches).toHaveLength(1);
    expect(restored.dispatches[0].advId).toBe(MINE);
  });

  it('미래에서 시작한 파견은 눕혀진다 — 남은 전투가 영영 안 줄어들면 교착이다', () => {
    const s = store();
    unlockAll(s);
    s.setState({
      battleCount: 3,
      dispatches: [{ advId: MINE, heroIds: [rosterIds(s)[0]], startedAtBattle: 9999 }],
    });
    const restored = deserialize(serialize(s.getState()))!;
    expect(restored.dispatches[0].startedAtBattle).toBeLessThanOrEqual(3);
  });
});
