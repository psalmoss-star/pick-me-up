/**
 * 과제 판정 테스트.
 *
 * 여기서 지키려는 것:
 *   1. 판정이 전투 기록만 보고 이뤄진다 — 개입해도 결과가 안 바뀐다
 *   2. 사망을 요구하는 과제가 하나도 없다 (퍼머데스를 보상으로 바꾸지 않는다)
 *   3. 유물이 저층에서 새지 않는다
 */
import { describe, it, expect } from 'vitest';
import { evaluateQuests, guardsSurvived, questContext, rollQuestGear } from './quest';
import { QUESTS, questsForFloor, questById, type QuestContext, type QuestId } from './data/quests';
import { GEAR_DEFS } from './data/gear';
import { createRng } from './rng';
import { FLOORS } from './data';
import type { BattleEvent } from './types';

/** 기본은 "아무 조건도 만족하지 않는" 밋밋한 돌파 */
const ctx = (over: Partial<QuestContext> = {}): QuestContext => ({
  floorId: 1,
  turnsElapsed: 99,
  deaths: 1,
  partySize: 5,
  flawless: false,
  noPotion: false,
  totalDeaths: 3,
  guardsAlive: false,
  ...over,
});

const rng = () => createRng(12345);

describe('과제 정의', () => {
  it('id가 중복되지 않는다 — 겹치면 하나가 영영 달성 불가가 된다', () => {
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 과제가 실재하는 층에 걸려 있다', () => {
    const floorIds = new Set(FLOORS.map((f) => f.id));
    for (const q of QUESTS) expect(floorIds.has(q.floorId)).toBe(true);
  });

  it('보상이 비어 있지 않다', () => {
    for (const q of QUESTS) {
      const r = q.reward;
      const total = (r.gold ?? 0) + (r.promotionStones ?? 0) + (r.potions ?? 0);
      expect(total > 0 || r.gear != null || r.gearRank != null).toBe(true);
    }
  });

  it('확정 지급 장비는 도감에 실재한다', () => {
    for (const q of QUESTS) {
      if (q.reward.gear) expect(GEAR_DEFS[q.reward.gear]).toBeDefined();
    }
  });

  /**
   * 이 게임에서 죽음은 규칙이지 벌점이 아니다.
   * 사망을 요구하는 과제가 생기면 영웅을 일부러 버리는 것이 최적 플레이가 된다.
   */
  it('사망을 요구하는 과제가 없다', () => {
    for (const q of QUESTS) {
      // 사망자만 늘린 맥락에서 달성되는 과제가 있으면 안 된다
      const dead = ctx({ floorId: q.floorId, deaths: 3, totalDeaths: 3 });
      const alive = { ...dead, deaths: 0, totalDeaths: 0 };
      if (q.check(dead)) {
        // 죽어서 달성됐다면 안 죽어도 달성돼야 한다 (사망이 조건이 아니어야 한다)
        expect(q.check(alive)).toBe(true);
      }
    }
  });

  /** 유물은 상점에 없다. 저층 과제로 새면 이후 등반이 무의미해진다. */
  it('유물 보상은 최종 층에만 걸려 있다', () => {
    const top = Math.max(...FLOORS.map((f) => f.id));
    for (const q of QUESTS) {
      const relic = q.reward.gearRank === 'relic'
        || (q.reward.gear != null && GEAR_DEFS[q.reward.gear].rank === 'relic');
      if (relic) expect(q.floorId).toBe(top);
    }
  });

  it('questsForFloor는 해당 층 것만 돌려준다', () => {
    for (const f of FLOORS) {
      for (const q of questsForFloor(f.id)) expect(q.floorId).toBe(f.id);
    }
  });

  it('questById로 전부 조회된다', () => {
    for (const q of QUESTS) expect(questById(q.id)).toBe(q);
  });
});

describe('보호 대상 생존 판정', () => {
  const guarded = FLOORS.find((f) => (f.guards?.length ?? 0) > 0)!;

  it('대상이 없는 층은 항상 true', () => {
    const plain = FLOORS.find((f) => !f.guards || f.guards.length === 0)!;
    expect(guardsSurvived(plain, [])).toBe(true);
  });

  it('사망 이벤트가 없으면 생존', () => {
    expect(guardsSurvived(guarded, [])).toBe(true);
  });

  it('보호 대상이 죽으면 false', () => {
    const g = guarded.guards![0];
    const events: BattleEvent[] = [
      { turn: 1, type: 'death', targetUids: [`G:${g.kind}:${g.id}`] },
    ];
    expect(guardsSurvived(guarded, events)).toBe(false);
  });

  it('다른 유닛이 죽는 건 상관없다', () => {
    const events: BattleEvent[] = [
      { turn: 1, type: 'death', targetUids: ['E:0:slime', 'A:hero#1'] },
    ];
    expect(guardsSurvived(guarded, events)).toBe(true);
  });
});

describe('달성 판정', () => {
  it('패배하면 아무것도 달성되지 않는다', () => {
    const grants = evaluateQuests({
      // 모든 조건을 만족시켜도 패배면 0건
      ctx: ctx({ turnsElapsed: 1, deaths: 0, flawless: true, noPotion: true,
        guardsAlive: true, totalDeaths: 0 }),
      cleared: false, claimed: [], rng: rng(), gearSeq: 0,
    });
    expect(grants).toHaveLength(0);
  });

  it('조건을 만족하면 달성된다', () => {
    const grants = evaluateQuests({
      ctx: ctx({ floorId: 1, turnsElapsed: 3 }),
      cleared: true, claimed: [], rng: rng(), gearSeq: 0,
    });
    expect(grants.map((g) => g.quest.id)).toContain('f1_swift' as QuestId);
  });

  it('조건을 못 채우면 달성되지 않는다', () => {
    const grants = evaluateQuests({
      ctx: ctx({ floorId: 1, turnsElapsed: 30 }),
      cleared: true, claimed: [], rng: rng(), gearSeq: 0,
    });
    expect(grants).toHaveLength(0);
  });

  /** 반복 파밍 대상이 아니다 */
  it('이미 달성한 과제는 다시 주지 않는다', () => {
    const args = {
      ctx: ctx({ floorId: 1, turnsElapsed: 3 }),
      cleared: true, rng: rng(), gearSeq: 0,
    };
    const first = evaluateQuests({ ...args, claimed: [] });
    expect(first.length).toBeGreaterThan(0);
    const again = evaluateQuests({
      ...args, claimed: first.map((g) => g.quest.id),
    });
    expect(again).toHaveLength(0);
  });

  it('다른 층 과제는 판정하지 않는다', () => {
    const grants = evaluateQuests({
      // 2층 조건(무피해)을 만족해도 1층을 깼으면 안 준다
      ctx: ctx({ floorId: 1, flawless: true, turnsElapsed: 99 }),
      cleared: true, claimed: [], rng: rng(), gearSeq: 0,
    });
    expect(grants.every((g) => g.quest.floorId === 1)).toBe(true);
  });

  it('보상 금액이 정의와 일치한다', () => {
    const grants = evaluateQuests({
      ctx: ctx({ floorId: 1, turnsElapsed: 3 }),
      cleared: true, claimed: [], rng: rng(), gearSeq: 0,
    });
    const q = questById('f1_swift' as QuestId)!;
    const g = grants.find((x) => x.quest.id === q.id)!;
    expect(g.gold).toBe(q.reward.gold ?? 0);
    expect(g.potions).toBe(q.reward.potions ?? 0);
  });

  /** 개입해도 판정이 안 바뀌는 근거 — 같은 입력이면 같은 출력 */
  it('같은 맥락 + 같은 시드 = 같은 보상', () => {
    const args = {
      ctx: ctx({ floorId: 2, flawless: true }),
      cleared: true, claimed: [] as QuestId[], gearSeq: 0,
    };
    const a = evaluateQuests({ ...args, rng: rng() });
    const b = evaluateQuests({ ...args, rng: rng() });
    expect(b.map((g) => g.gear?.defId)).toEqual(a.map((g) => g.gear?.defId));
  });

  it('장비 instId가 서로 충돌하지 않는다', () => {
    // 최종 층은 과제가 둘(f20_sovereign, run_nodeath) 걸려 있고 둘 다 장비를 준다.
    // 층 수를 숫자로 박으면 층 확장 때 조용히 다른 층 테스트로 변질된다 —
    // 실제로 12로 박혀 있다가 상층 신설 때 깨졌다. FLOORS에서 파생시킨다.
    const top = FLOORS[FLOORS.length - 1].id;
    const grants = evaluateQuests({
      ctx: ctx({ floorId: top, guardsAlive: true, deaths: 0, totalDeaths: 0 }),
      cleared: true, claimed: [], rng: rng(), gearSeq: 0,
    });
    const ids = grants.map((g) => g.gear?.instId).filter(Boolean);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('보상 장비 추첨', () => {
  it('종류가 확정된 보상은 그대로 나온다', () => {
    const g = rollQuestGear({ gear: 'w_towerbane' as never }, rng(), 1);
    expect(g!.defId).toBe('w_towerbane');
  });

  it('등급만 정해진 보상은 그 등급에서 나온다', () => {
    for (let s = 0; s < 20; s++) {
      const g = rollQuestGear({ gearRank: 'fine' }, createRng(s), 1);
      expect(GEAR_DEFS[g!.defId].rank).toBe('fine');
    }
  });

  it('장비 보상이 없으면 null', () => {
    expect(rollQuestGear({ gold: 100 }, rng(), 1)).toBeNull();
  });

  it('새 장비는 강화 0 / 미착용 상태로 나온다', () => {
    const g = rollQuestGear({ gearRank: 'rare' }, rng(), 7)!;
    expect(g.enhance).toBe(0);
    expect(g.equippedBy).toBeNull();
  });
});

describe('전투 기록 → 판정 입력', () => {
  const floor = FLOORS[0];

  const result = (over: Record<string, unknown> = {}) => ({
    outcome: 'victory' as const,
    events: [] as BattleEvent[],
    survivors: [{ instId: 'h1' as never, currentHp: 100 }],
    casualties: [] as never[],
    turnsElapsed: 4,
    roster: [
      { uid: 'A:h1', name: '가', maxHp: 100, kind: 'hero' as const,
        side: 'ally' as const, sourceId: 'h1', element: 'fire' },
    ],
    mvp: null,
    ...over,
  });

  it('만피로 끝나면 무피해', () => {
    const c = questContext({
      floor, result: result() as never, potionsUsed: 0, totalDeaths: 0,
    });
    expect(c.flawless).toBe(true);
    expect(c.partySize).toBe(1);
    expect(c.noPotion).toBe(true);
  });

  it('피해를 입었으면 무피해가 아니다', () => {
    const c = questContext({
      floor,
      result: result({ survivors: [{ instId: 'h1', currentHp: 40 }] }) as never,
      potionsUsed: 0, totalDeaths: 0,
    });
    expect(c.flawless).toBe(false);
  });

  it('죽은 영웅이 있으면 무피해가 아니다', () => {
    const c = questContext({
      floor,
      result: result({ survivors: [], casualties: ['h1'] }) as never,
      potionsUsed: 0, totalDeaths: 1,
    });
    expect(c.flawless).toBe(false);
    expect(c.deaths).toBe(1);
  });

  it('포션을 썼으면 noPotion이 false', () => {
    const c = questContext({
      floor, result: result() as never, potionsUsed: 2, totalDeaths: 0,
    });
    expect(c.noPotion).toBe(false);
  });

  /** 보호 대상은 side가 ally여도 파티원이 아니다 */
  it('보호 대상은 파티 인원에 세지 않는다', () => {
    const c = questContext({
      floor,
      result: result({
        roster: [
          { uid: 'A:h1', name: '가', maxHp: 100, kind: 'hero',
            side: 'ally', sourceId: 'h1', element: 'fire' },
          { uid: 'G:npc:princess', name: '황녀', maxHp: 500, kind: 'guard',
            side: 'ally', sourceId: 'princess', element: 'earth' },
        ],
      }) as never,
      potionsUsed: 0, totalDeaths: 0,
    });
    expect(c.partySize).toBe(1);
  });
});
