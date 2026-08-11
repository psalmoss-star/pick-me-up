/**
 * 과제 판정 — 순수 로직.
 *
 * 전투를 다시 돌리지 않는다. **이미 나온 BattleEvent[]를 다시 읽을 뿐이다.**
 * 그래서 개입으로 재시뮬레이션해도, 같은 시드로 다시 돌려도 판정이 같다.
 *
 * 보상 지급에 무작위가 끼는 경우(gearRank)는 주입된 RNG만 쓴다 —
 * 스토어가 전리품과 같은 스트림에서 갈라 준다.
 */
import type { BattleEvent, GearInstance, RNG } from './types';
import type { EncounterResult } from './encounter';
import type { FloorSpec } from './data/floors';
import { dropTable } from './data/gear';
import { makeGear } from './gear';
import { STREAM, substream } from './rng';
import {
  questsForFloor, type QuestContext, type QuestDef, type QuestId, type QuestReward,
} from './data/quests';

/**
 * 전투 결과 → 과제 판정 입력.
 *
 * 여기가 "전투 기록을 조건으로 번역하는" 유일한 지점이다.
 * 화면이나 스토어가 따로 계산하면 조건이 두 곳으로 갈라진다.
 */
export function questContext(args: {
  floor: FloorSpec;
  result: EncounterResult;
  /** 이번 전투에 실제로 터진 포션 수 */
  potionsUsed: number;
  /** 이번 런 누적 사망자 수 (이번 전투 사망자 포함) */
  totalDeaths: number;
}): QuestContext {
  const { floor, result, potionsUsed, totalDeaths } = args;

  /** 출전한 영웅 유닛 (보호 대상은 side가 ally여도 영웅이 아니다) */
  const heroes = result.roster.filter((u) => u.side === 'ally' && u.kind === 'hero');

  /**
   * 무피해 판정.
   *
   * survivors에 없는 영웅은 죽은 것이므로 무피해가 아니다.
   * 살아남았어도 최대 HP 미만이면 맞은 것이다.
   */
  const survived = new Map(result.survivors.map((s) => [s.instId as string, s.currentHp]));
  const flawless = heroes.length > 0 && heroes.every((u) => {
    const hp = survived.get(u.sourceId);
    return hp != null && hp >= u.maxHp;
  });

  return {
    floorId: floor.id,
    turnsElapsed: result.turnsElapsed,
    deaths: result.casualties.length,
    partySize: heroes.length,
    flawless,
    noPotion: potionsUsed === 0,
    totalDeaths,
    guardsAlive: guardsSurvived(floor, result.events),
  };
}

/**
 * 보호 대상이 전부 살아남았는가.
 *
 * 대상이 없는 층은 true — "지킬 것이 없었으니 지켰다"가 아니라,
 * 조건에 guardsAlive를 쓰는 과제를 그런 층에 걸지 않기 때문이다.
 * uid 규칙(G:{kind}:{id})은 encounter.ts가 정한 것을 그대로 따른다.
 */
export function guardsSurvived(floor: FloorSpec, events: BattleEvent[]): boolean {
  if (!floor.guards || floor.guards.length === 0) return true;
  const dead = new Set<string>();
  for (const e of events) {
    if (e.type !== 'death') continue;
    for (const uid of e.targetUids ?? []) dead.add(uid);
  }
  return floor.guards.every((g) => !dead.has(`G:${g.kind}:${g.id}`));
}

/**
 * 과제 보상 추첨용 RNG.
 *
 * **스토어(실제 지급)와 화면(미리보기)이 반드시 같은 것을 써야 한다.**
 * 여기가 갈리면 결과 화면에 보인 장비와 실제로 들어온 장비가 달라진다.
 * 그래서 유도식을 이 함수 하나에 가둔다 — 호출부가 직접 조합하지 말 것.
 *
 * 전리품(STREAM.LOOT)과 다른 스트림을 쓰는 이유: 같은 스트림을 나눠 쓰면
 * 과제 하나가 달성되고 안 되고에 따라 이후 장비 드롭이 통째로 달라진다.
 */
export function questRng(seed: number, floorId: number, battleCount: number): RNG {
  return substream(
    (seed ^ Math.imul(floorId, 0x27d4eb2f) ^ Math.imul(battleCount + 1, 0x165667b1)) >>> 0,
    STREAM.QUEST,
  );
}

/** 지급이 확정된 보상 한 건 */
export interface QuestGrant {
  quest: QuestDef;
  gold: number;
  promotionStones: number;
  potions: number;
  /** 실제로 만들어진 장비 (gear/gearRank가 있었을 때만) */
  gear: GearInstance | null;
}

/**
 * 이번 돌파로 새로 달성한 과제를 판정하고 보상을 확정한다.
 *
 * `claimed`에 이미 있는 과제는 건너뛴다 — 한 번 달성하면 끝이고 반복 파밍 대상이 아니다.
 * 승리하지 않았으면 아무것도 달성되지 않는다: 과제는 **돌파에 얹히는 것**이지
 * 따로 굴러가는 트랙이 아니다.
 */
export function evaluateQuests(args: {
  ctx: QuestContext;
  cleared: boolean;
  claimed: readonly QuestId[];
  rng: RNG;
  /** 장비 instId 발번 시작점 */
  gearSeq: number;
}): QuestGrant[] {
  const { ctx, cleared, claimed, rng } = args;
  if (!cleared) return [];

  const done = new Set<QuestId>(claimed);
  const grants: QuestGrant[] = [];
  let seq = args.gearSeq;

  for (const quest of questsForFloor(ctx.floorId)) {
    if (done.has(quest.id)) continue;
    if (!quest.check(ctx)) continue;

    const gear = rollQuestGear(quest.reward, rng, seq + 1);
    if (gear) seq += 1;

    grants.push({
      quest,
      gold: quest.reward.gold ?? 0,
      promotionStones: quest.reward.promotionStones ?? 0,
      potions: quest.reward.potions ?? 0,
      gear,
    });
  }
  return grants;
}

/**
 * 보상 장비를 만든다.
 *   - gear     : 종류 확정 (유물 등 특정 물건을 줄 때)
 *   - gearRank : 등급만 확정하고 종류는 뽑는다
 * 둘 다 없으면 null.
 */
export function rollQuestGear(
  reward: QuestReward,
  rng: RNG,
  n: number,
): GearInstance | null {
  if (reward.gear) return makeGear(reward.gear, n);
  if (!reward.gearRank) return null;

  const pool = dropTable().filter((d) => d.rank === reward.gearRank);
  if (pool.length === 0) return null;
  const pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return makeGear(pick.id, n);
}

/** 화면 표시용 — 아직 달성하지 않은 과제 */
export function pendingQuests(floorId: number, claimed: readonly QuestId[]): QuestDef[] {
  const done = new Set<QuestId>(claimed);
  return questsForFloor(floorId).filter((quest) => !done.has(quest.id));
}

export type { QuestContext, QuestDef, QuestId, QuestReward };
