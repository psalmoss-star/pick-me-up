/**
 * 과제 스토어 연결 테스트.
 *
 * 지키려는 것:
 *   1. 보상이 실제로 지갑·창고에 들어간다 (표시만 되고 사라지지 않는다)
 *   2. 달성 기록이 저장을 견딘다 — 새로고침으로 반복 수령이 불가능하다
 *   3. 개입으로 재시뮬레이션해도 달성 판정이 흔들리지 않는다
 *
 * 조건 판정 자체는 game/quest.test.ts의 몫이라 여기서 다시 보지 않는다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { loadRun, deserialize, serialize } from './save';
import { evaluateQuests, questContext, questRng } from '../game/quest';
import { questById, QUESTS, type QuestId } from '../game/data/quests';
import { FLOORS, floorRewards } from '../game/data/floors';
import { GEAR_DEFS } from '../game/data/gear';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

const store = () => createRunStore(() => 42);

/**
 * 1층을 승리로 끝낸다. 1층 과제(f1_swift)는 5턴 이내 돌파라
 * turnsElapsed를 직접 지정해 달성/미달성을 만든다.
 */
function clearFloor1(s: ReturnType<typeof store>, turns: number) {
  s.getState().start();
  s.setState({
    result: {
      ...s.getState().result!,
      outcome: 'victory',
      casualties: [],
      turnsElapsed: turns,
    },
  });
  s.getState().finish();
}

describe('보상 지급', () => {
  it('달성하면 금이 실제로 들어온다', () => {
    const s = store();
    const before = s.getState().wallet.gold;
    clearFloor1(s, 3);

    const q = questById('f1_swift' as QuestId)!;
    // 층 보상과 과제 보상이 함께 들어오므로 과제분만큼은 더 많아야 한다
    expect(s.getState().wallet.gold).toBeGreaterThanOrEqual(before + (q.reward.gold ?? 0));
    expect(s.getState().claimedQuests).toContain(q.id);
  });

  it('포션 보상이 보유량에 더해진다', () => {
    const s = store();
    clearFloor1(s, 3);
    const q = questById('f1_swift' as QuestId)!;
    expect(s.getState().potions).toBe(q.reward.potions ?? 0);
  });

  it('조건을 못 채우면 달성 목록이 비어 있다', () => {
    const s = store();
    clearFloor1(s, 99);
    expect(s.getState().claimedQuests).toHaveLength(0);
    expect(s.getState().questGrants).toHaveLength(0);
  });

  it('패배하면 달성되지 않는다', () => {
    const s = store();
    s.getState().start();
    s.setState({
      result: { ...s.getState().result!, outcome: 'defeat', casualties: [], turnsElapsed: 1 },
    });
    s.getState().finish();
    expect(s.getState().claimedQuests).toHaveLength(0);
  });

  it('questGrants가 결과 화면용으로 남는다', () => {
    const s = store();
    clearFloor1(s, 3);
    expect(s.getState().questGrants.length).toBeGreaterThan(0);
    expect(s.getState().questGrants[0].quest.name).toBeTruthy();
  });

  it('다음 전투를 시작하면 지난 달성 표시가 지워진다', () => {
    const s = store();
    clearFloor1(s, 3);
    expect(s.getState().questGrants.length).toBeGreaterThan(0);
    s.getState().start();
    expect(s.getState().questGrants).toHaveLength(0);
  });

  /** 보상 장비가 창고에 실제로 들어가는지 — 표시만 되고 사라지면 안 된다 */
  it('장비 보상이 창고에 들어온다', () => {
    const s = store();
    // 2층 과제는 무피해 돌파 → 장비(평범)를 준다
    s.setState({ floorIndex: 1 });
    s.getState().start();
    const before = s.getState().gear.length;
    const alive = s.getState().result!.roster
      .filter((u) => u.side === 'ally' && u.kind === 'hero');
    s.setState({
      result: {
        ...s.getState().result!,
        outcome: 'victory',
        casualties: [],
        turnsElapsed: 4,
        // 전원 만피 생존 = 무피해
        survivors: alive.map((u) => ({ instId: u.sourceId as never, currentHp: u.maxHp })),
      },
    });
    s.getState().finish();

    expect(s.getState().claimedQuests).toContain('f2_flawless' as QuestId);
    expect(s.getState().gear.length).toBeGreaterThan(before);
  });

  it('보상 장비 instId가 드롭분과 겹치지 않는다', () => {
    const s = store();
    s.setState({ floorIndex: 1 });
    s.getState().start();
    const alive = s.getState().result!.roster
      .filter((u) => u.side === 'ally' && u.kind === 'hero');
    s.setState({
      result: {
        ...s.getState().result!,
        outcome: 'victory', casualties: [], turnsElapsed: 4,
        survivors: alive.map((u) => ({ instId: u.sourceId as never, currentHp: u.maxHp })),
      },
    });
    s.getState().finish();

    const ids = s.getState().gear.map((g) => g.instId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('중복 수령 방지', () => {
  /**
   * 층 보상(216금)이 과제 보상(200금)보다 커서 "적게 들어왔나"로는 구분되지 않는다.
   * 두 번째 돌파의 증가분이 **층 보상과 정확히 같은지**를 본다.
   */
  it('같은 과제를 두 번 달성해도 한 번만 준다', () => {
    const s = store();
    clearFloor1(s, 3);
    const afterFirst = s.getState().wallet.gold;
    const q = questById('f1_swift' as QuestId)!;

    // 1층으로 되돌려 같은 조건으로 다시 깬다
    s.setState({ floorIndex: 0 });
    clearFloor1(s, 3);

    const gained = s.getState().wallet.gold - afterFirst;
    expect(gained).toBe(floorRewards(FLOORS[0], 3).gold);
    // 목록에도 하나만 남는다
    expect(s.getState().claimedQuests.filter((id) => id === q.id)).toHaveLength(1);
  });
});

describe('저장', () => {
  it('달성 기록이 저장된다 — 새로고침으로 반복 수령할 수 없다', () => {
    const s = store();
    clearFloor1(s, 3);
    // finish()가 자동 저장한다
    const back = loadRun()!;
    expect(back.claimedQuests).toContain('f1_swift' as QuestId);
  });

  it('불러온 뒤 다시 깨도 보상이 두 번 나오지 않는다', () => {
    const s = store();
    clearFloor1(s, 3);
    const saved = loadRun()!;

    const fresh = store();
    fresh.getState().hydrate(saved);
    const before = fresh.getState().wallet.gold;
    fresh.setState({ floorIndex: 0 });
    clearFloor1(fresh, 3);

    // 층 보상만 들어와야 한다 — 과제분이 또 붙으면 이 값을 넘는다
    expect(fresh.getState().wallet.gold - before).toBe(floorRewards(FLOORS[0], 3).gold);
  });

  it('과제 기록이 없는 옛 세이브도 읽힌다', () => {
    const s = store();
    const raw = JSON.parse(serialize(s.getState()));
    delete raw.run.claimedQuests;
    const back = deserialize(JSON.stringify(raw));
    expect(back).not.toBeNull();
    expect(back!.claimedQuests).toEqual([]);
  });

  it('정의에 없는 과제 id는 버린다', () => {
    const s = store();
    s.setState({ claimedQuests: ['ghost_quest' as QuestId, QUESTS[0].id] });
    const back = deserialize(serialize(s.getState()))!;
    expect(back.claimedQuests).not.toContain('ghost_quest' as QuestId);
    expect(back.claimedQuests).toContain(QUESTS[0].id);
  });

  it('중복 id는 하나로 줄인다', () => {
    const s = store();
    s.setState({ claimedQuests: [QUESTS[0].id, QUESTS[0].id] });
    const back = deserialize(serialize(s.getState()))!;
    expect(back.claimedQuests).toHaveLength(1);
  });

  it('hydrate는 지난 달성 표시를 남기지 않는다', () => {
    const s = store();
    clearFloor1(s, 3);
    const saved = loadRun()!;
    const fresh = store();
    fresh.getState().hydrate(saved);
    expect(fresh.getState().questGrants).toEqual([]);
  });
});

describe('개입해도 판정이 흔들리지 않는다', () => {
  /**
   * 과제는 이미 나온 전투 기록을 다시 읽을 뿐이라
   * 같은 결과에 대해서는 몇 번을 판정해도 같아야 한다.
   */
  it('같은 결과로 finish하면 같은 보상이 나온다', () => {
    const a = store();
    clearFloor1(a, 3);
    const b = store();
    clearFloor1(b, 3);
    expect(b.getState().claimedQuests).toEqual(a.getState().claimedQuests);
    expect(b.getState().wallet.gold).toBe(a.getState().wallet.gold);
  });
});

describe('결과 화면 미리보기와 실제 지급이 일치한다', () => {
  /**
   * 결과 화면은 finish()보다 먼저 뜨므로 지급 결과를 못 받는다.
   * 대신 같은 순수 함수로 미리 판정해 보여준다 — 두 경로가 갈리면
   * "화면엔 잿송곳니라 했는데 창고엔 다른 게 들어온" 상태가 된다.
   */
  it('미리보기가 실제 지급과 같은 장비를 가리킨다', () => {
    const s = store();
    s.setState({ floorIndex: 1 });
    s.getState().start();
    const alive = s.getState().result!.roster
      .filter((u) => u.side === 'ally' && u.kind === 'hero');
    s.setState({
      result: {
        ...s.getState().result!,
        outcome: 'victory', casualties: [], turnsElapsed: 4,
        survivors: alive.map((u) => ({ instId: u.sourceId as never, currentHp: u.maxHp })),
      },
    });

    // 화면이 하는 것과 똑같이 미리 판정한다
    const st = s.getState();
    const preview = evaluateQuests({
      ctx: questContext({
        floor: FLOORS[1],
        result: st.result!,
        potionsUsed: 0,
        totalDeaths: st.deathCount,
      }),
      cleared: true,
      claimed: st.claimedQuests,
      rng: questRng(st.seed, FLOORS[1].id, st.battleCount),
      gearSeq: 0,
    });

    const beforeIds = new Set(st.gear.map((g) => g.instId));
    s.getState().finish();
    const added = s.getState().gear.filter((g) => !beforeIds.has(g.instId));

    expect(preview.length).toBeGreaterThan(0);
    const previewGear = preview.map((p) => p.gear?.defId).filter(Boolean);
    for (const defId of previewGear) {
      expect(added.map((g) => g.defId)).toContain(defId);
    }
  });

  it('미리보기는 상태를 바꾸지 않는다', () => {
    const s = store();
    s.getState().start();
    s.setState({
      result: { ...s.getState().result!, outcome: 'victory', casualties: [], turnsElapsed: 3 },
    });
    const st = s.getState();
    evaluateQuests({
      ctx: questContext({
        floor: FLOORS[0], result: st.result!, potionsUsed: 0, totalDeaths: 0,
      }),
      cleared: true, claimed: st.claimedQuests,
      rng: questRng(st.seed, FLOORS[0].id, st.battleCount), gearSeq: 0,
    });
    // 판정만으로는 아무것도 지급되지 않는다
    expect(s.getState().claimedQuests).toHaveLength(0);
    expect(s.getState().wallet.gold).toBe(st.wallet.gold);
  });
});

describe('퍼머데스와의 관계', () => {
  /**
   * 사망을 요구하는 과제가 없다는 것은 game/quest.test.ts가 정의 차원에서 본다.
   * 여기서는 실제 런에서 사망이 보상으로 바뀌지 않는지를 본다.
   */
  it('영웅이 죽어도 그 자체로 과제가 달성되지 않는다', () => {
    const s = store();
    s.getState().start();
    const victim = s.getState().party[0];
    s.setState({
      result: {
        ...s.getState().result!,
        outcome: 'victory', casualties: [victim], turnsElapsed: 99,
      },
    });
    s.getState().finish();
    expect(s.getState().claimedQuests).toHaveLength(0);
    expect(s.getState().deathCount).toBe(1);
  });

  it('유물 보상은 최종 층 전에는 나오지 않는다', () => {
    const s = store();
    // 1~2층을 조건 만족으로 깨도 유물은 없다
    clearFloor1(s, 3);
    for (const g of s.getState().gear) {
      expect(GEAR_DEFS[g.defId].rank).not.toBe('relic');
    }
  });
});
