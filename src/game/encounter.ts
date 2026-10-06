/**
 * 층 하나를 전투로 돌리는 진입점.
 *
 * 프로토타입의 인라인 simulate()가 하던 일 중
 * "화면이 필요로 하지만 전투 엔진이 돌려주지 않는 것"을 여기서 채운다.
 *   - roster : 유닛 표시 정보 (이름/최대HP/아트) — 엔진은 uid만 알려준다
 *   - mvp    : 아군 누적 피해량 1위
 *
 * 전투 엔진 자체는 건드리지 않는다. 여기는 조립만 한다.
 */
import { scaledEnemyStats, simulateBattle, type BattleData, type BattleInput, type BattleOutcome } from './battle';
import { statsOfInstance } from './stats';
import { displayName } from './identity';
import { applyBonus, heroBonus } from './gear';
import type { Orders } from './orders';
import type { FloorSpec } from './data/floors';
import { enemyStatMultFor } from './data/floorgen';
import type { BeatUnit } from './beats';
import type { Intervention } from './intervention';
import type { GearInstId, GearInstance, HeroInstId, HeroInstance, RNG } from './types';

/** 화면이 유닛 하나를 그리는 데 필요한 전부 */
export interface RosterUnit extends BeatUnit {
  side: 'ally' | 'enemy';
  /** 아군 영웅이면 HeroInstId, 적이면 EnemyDefId, 보호 대상이면 guard id */
  sourceId: string;
  element: string;
  /** 영웅 카드/아트 렌더에 필요 */
  defId?: string;
  star?: number;
}

export interface EncounterResult extends BattleOutcome {
  roster: RosterUnit[];
  /** 누적 피해량 1위 아군의 instId. 아무도 피해를 주지 못했으면 null */
  mvp: HeroInstId | null;
}

/**
 * uid 규칙은 battle.ts가 정한다. 여기서는 그것을 그대로 되짚어
 * 표시용 정보를 붙인다.
 *   아군 영웅   A:{instId}
 *   보호 대상   G:{kind}:{id}
 *   적          E:{index}:{enemyDefId}
 */
export function runEncounter(args: {
  party: HeroInstance[];
  floor: FloorSpec;
  data: BattleData;
  rng: RNG;
  maxTurns?: number;
  /** 마스터의 개입 목록 */
  interventions?: Intervention[];
  /** 무기창고 보정 — 아군 공격력 배수. 생략 시 보정 없음. */
  allyAtkMult?: number;
  /** 장비 조회용. 생략하면 장비 없이 돈다. */
  inventory?: Map<GearInstId, GearInstance>;
  /** 들려 보낸 포션 개수 */
  potions?: number;
  /** 작전 카드. 생략하면 현행 엔진 그대로 */
  orders?: Orders;
  /** 책략 카드. 판정 난수는 호출부가 `STREAM.STRATAGEM`으로 판다 */
  stratagems?: BattleInput['stratagems'];
}): EncounterResult {
  const { party, floor, data, rng, inventory } = args;
  const alive = party.filter((h) => !h.isDead);
  // 엔진과 로스터(HP 바 분모)가 같은 배수를 쓴다
  const enemyStatMult = enemyStatMultFor(floor.id);

  const outcome = simulateBattle({
    allies: alive,
    enemyIds: floor.enemyIds,
    data,
    rng,
    mission: floor.mission,
    guards: floor.guards,
    maxTurns: args.maxTurns,
    interventions: args.interventions,
    orders: args.orders,
    stratagems: args.stratagems,
    allyAtkMult: args.allyAtkMult,
    /**
     * 층 깊이에 따른 적 강화.
     *
     * 호출부가 넘기지 않고 **여기서 층으로부터 유도한다** — 화면·스토어·sim이
     * 각자 계산하면 갈라지고, 하나라도 빠뜨리면 그 경로만 조용히 쉬운 전투가 된다.
     * (§5-14 "밸런스 수치를 화면에서 다시 계산하지 말 것"과 같은 이유다.)
     */
    enemyStatMult,
    inventory,
    potions: args.potions,
  });

  const roster: RosterUnit[] = [
    ...alive.map((h): RosterUnit => {
      const def = data.heroes[h.defId];
      /*
        maxHp는 화면의 HP 바 분모다. 장비를 안 태우면 방어구를 낀 영웅이
        전투 시작부터 바가 넘쳐 보인다 — battle.ts와 같은 계산을 써야 한다.
      */
      const base = statsOfInstance(h, def, data.starScaling);
      const stats = inventory ? applyBonus(base, heroBonus(h.gear, inventory, def.lineage)) : base;
      return {
        uid: `A:${h.instId}`,
        // 화면에 뜨는 이름. 개체 이름이 유일한 진실이다 (identity.ts).
        name: displayName(h, data.heroes),
        maxHp: stats.hp,
        // battle.ts의 buildAlly와 같은 식 — currentHp 0은 "만피"라는 뜻이다
        startHp: Math.min(h.currentHp > 0 ? h.currentHp : stats.hp, stats.hp),
        kind: 'hero',
        side: 'ally',
        sourceId: h.instId,
        element: def.element,
        defId: h.defId,
        star: h.star,
      };
    }),
    ...(floor.guards ?? []).map((g): RosterUnit => ({
      uid: `G:${g.kind}:${g.id}`,
      name: g.name,
      maxHp: g.hp,
      kind: 'guard',
      guardKind: g.kind,
      side: 'ally',
      sourceId: g.id,
      element: 'earth',
    })),
    ...floor.enemyIds.map((eid, i): RosterUnit => {
      const e = data.enemies[eid];
      return {
        uid: `E:${i}:${eid}`,
        name: e.name,
        // 엔진의 buildEnemy와 같은 함수 — 깊이 배수를 빼면 21층 이후 바가 어긋난다
        maxHp: scaledEnemyStats(e.stats, enemyStatMult).hp,
        kind: 'enemy',
        side: 'enemy',
        sourceId: eid,
        element: e.element,
      };
    }),
  ];

  return { ...outcome, roster, mvp: findMvp(outcome) };
}

/** 아군이 입힌 누적 피해량 1위. 동점이면 먼저 나온 쪽. */
export function findMvp(outcome: BattleOutcome): HeroInstId | null {
  const total = new Map<string, number>();
  for (const e of outcome.events) {
    if (e.type !== 'damage') continue;
    const uid = e.actorUid;
    if (!uid || !uid.startsWith('A:')) continue;
    total.set(uid, (total.get(uid) ?? 0) + (e.amount ?? 0));
  }
  let best: string | null = null;
  let bestAmount = -1;
  for (const [uid, amount] of total) {
    if (amount > bestAmount) { best = uid; bestAmount = amount; }
  }
  return best ? (best.slice(2) as HeroInstId) : null;
}
