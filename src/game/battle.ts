/**
 * src/game/battle.ts
 *
 * 턴제 전투 시뮬레이터.
 * - React/DOM 의존 없음
 * - 모든 무작위성은 주입된 RNG로만 발생 → 시드 고정 시 100% 재현
 * - 결과뿐 아니라 턴별 BattleEvent 로그를 반환 (UI는 이를 재생만 한다)
 */
import type {
  ActiveStatus, Affinity, BattleEvent, Combatant, Element, EnemyDef, EnemyDefId,
  GearInstId, GearInstance,
  HeroDef, HeroDefId, HeroInstId, HeroInstance, RNG, Skill, SkillId,
  Star, StarScaling, StatusKind, Stats,
} from './types';
import { statsOfInstance } from './stats';
import { displayName } from './identity';
import { applyBonus, heroBonus } from './gear';
import { POTION_TUNING } from './data/gear';
import {
  DEFAULT_MISSION, evaluateMission, focusOf,
  type GuardDef, type Mission,
} from './mission';
import {
  focusTargetAt, guardedAt, retreatedAt,
  GUARD_DEF_BONUS, GUARD_STATUS, type Intervention,
} from './intervention';
import { rngChance } from './rng';

// ------------------------------------------------------------
// 입력/출력
// ------------------------------------------------------------

export interface BattleData {
  heroes: Record<HeroDefId, HeroDef>;
  /*
    ⚠️ 예전엔 여기가 `role`을 뺀 인라인 구조 타입이었다. 그래서 엔진이 적 role을
    **읽을 수단 자체가 없었고**, buildEnemy가 `'dealer'`를 하드코딩할 수밖에 없었다.
    `enemies.ts`는 19종에 role을 성실히 적어뒀는데 그것이 통째로 사장됐다(STEP 44).
  */
  enemies: Record<EnemyDefId, EnemyDef>;
  skills: Record<SkillId, Skill>;
  starScaling: Record<Star, StarScaling>;
  elementChart: Record<Element, Record<Element, number>>;
}

export interface BattleInput {
  allies: HeroInstance[];
  enemyIds: EnemyDefId[];
  data: BattleData;
  rng: RNG;
  maxTurns?: number;
  /** 층의 임무 유형. 생략 시 토벌(적 전멸). */
  mission?: Mission;
  /** 수비 대상 오브젝트 또는 호위 대상 NPC */
  guards?: GuardDef[];
  /**
   * 마스터의 개입. 전투 중 조작이 아니라 '입력'이다.
   * 같은 개입 목록 + 같은 시드 = 같은 결과여야 한다.
   */
  interventions?: Intervention[];
  /**
   * 무기창고 보정 — 아군 공격력 배수. 생략 시 1(보정 없음).
   *
   * 시설 레벨을 엔진에 직접 넘기지 않고 이미 계산된 배수만 받는다.
   * game/은 시설 규칙을 몰라야 하고, 여기서 아는 것은 "공격력이 몇 배인가"뿐이다.
   */
  allyAtkMult?: number;
  /**
   * 적 스탯 배수 — 층 깊이에 따른 강화. 생략 시 1(보정 없음).
   *
   * **왜 필요한가:** 영웅은 ★2→★6에서 배수가 1.35→5.4(4배)로 커지는데 적 수치는 고정이라,
   * 생성 구간(21~100층)이 전부 승률 100%였다. 90층 적이 21층 적과 같은 수치를 썼다.
   *
   * `allyAtkMult`와 같은 원칙으로 **이미 계산된 배수만** 받는다 —
   * game/battle은 "몇 층인가"를 몰라야 하고, 여기서 아는 것은 "적이 몇 배인가"뿐이다.
   * 생략 가능하게 둔 이유도 같다: sim·기존 테스트가 배수 없이 기준선을 잰다.
   */
  enemyStatMult?: number;
  /**
   * 장비 조회용 인벤토리. 생략하면 장비 보정 없이 돈다.
   *
   * 영웅이 gear에 들고 있는 것은 id뿐이라 실물을 여기서 찾는다.
   * 생략 가능하게 둔 이유는 sim·기존 테스트가 장비 없이 기준선을 재기 때문이다.
   */
  inventory?: Map<GearInstId, GearInstance>;
  /**
   * 전투에 들려 보낸 포션 개수. 파티 공용이며 위급한 순서로 소모된다.
   *
   * 전투 중 조작이 아니라 **전투 전 입력**이다 — 개입과 같은 원칙이라
   * 같은 시드 + 같은 개수 = 같은 결과가 유지된다.
   */
  potions?: number;
}

export interface BattleOutcome {
  outcome: 'victory' | 'defeat' | 'timeout';
  events: BattleEvent[];
  survivors: Array<{ instId: HeroInstId; currentHp: number }>;
  casualties: HeroInstId[];
  turnsElapsed: number;
}

// ------------------------------------------------------------
// 상태이상 수치 (한 곳에서만 관리)
// ------------------------------------------------------------

const STATUS_MAGNITUDE: Record<StatusKind, number> = {
  atkUp: 0.3, atkDown: 0.25,
  defUp: 0.35, defDown: 0.3,
  spdUp: 0.2, spdDown: 0.2,
  poison: 0.05,  // 최대 HP 비례 턴당 피해
  burn: 0.07,
  stun: 0,
};

const DEFENSE_CONSTANT = 300; // 방어력 감쇠 상수
const TANK_AGGRO = 0.6;       // 단일 대상 공격이 탱커에게 갈 확률

// ------------------------------------------------------------
// 셋업
// ------------------------------------------------------------

function buildAlly(
  inst: HeroInstance,
  d: BattleData,
  atkMult = 1,
  inventory?: Map<GearInstId, GearInstance>,
): Combatant {
  const def = d.heroes[inst.defId];
  // 개체 기준으로 계산해야 잠재치가 실제 전투에 반영된다
  const base = statsOfInstance(inst, def, d.starScaling);
  /**
   * 장비·무기창고 보정은 여기서 **한 번만** 적용한다.
   * 데미지 계산 경로가 여러 갈래(일반/스킬/도트)라 그쪽에 넣으면 누락되거나 중복된다.
   * 스탯 원천이 한 곳이므로 여기가 유일하게 안전한 지점이다.
   *
   * 순서: 장비 가산 → 무기창고 배수.
   * 무기창고는 "파티 전체 공격력 +Lv×3%"이므로 장비를 포함한 실제 공격력에 걸려야 한다.
   * 뒤집으면 장비를 낄수록 시설 효과가 상대적으로 약해진다.
   */
  const geared = inventory ? applyBonus(base, heroBonus(inst.gear, inventory)) : base;
  const stats = atkMult === 1 ? geared : { ...geared, atk: Math.round(geared.atk * atkMult) };
  return {
    uid: `A:${inst.instId}`,
    side: 'ally',
    sourceId: inst.instId,
    // 전투 로그에 뜨는 이름. 개체 이름이 유일한 진실이다 (identity.ts).
    name: displayName(inst, d.heroes),
    element: def.element,
    role: def.role,
    stats,
    currentHp: Math.min(inst.currentHp > 0 ? inst.currentHp : stats.hp, stats.hp),
    shield: 0,
    statuses: [],
    cooldowns: {},
    isAlive: true,
  };
}

function buildEnemy(eid: EnemyDefId, index: number, d: BattleData, mult = 1): Combatant {
  const e = d.enemies[eid];
  /**
   * 층 깊이 배수는 hp/atk/def에만 곱한다.
   * - spd를 곱하면 적이 항상 선공하게 되어 전투가 일방적이 된다(속도는 순서를 정할 뿐이다).
   * - crit은 확률이라 곱하면 1.0을 넘어 전부 치명타가 된다.
   */
  const stats: Stats = mult === 1 ? { ...e.stats } : {
    ...e.stats,
    hp: Math.round(e.stats.hp * mult),
    atk: Math.round(e.stats.atk * mult),
    def: Math.round(e.stats.def * mult),
  };
  return {
    uid: `E:${index}:${eid}`,
    side: 'enemy',
    sourceId: eid,
    name: e.name,
    element: e.element,
    /*
      ⚠️ 예전엔 `'dealer'` 하드코딩이라 `enemies.ts`의 role 선언이 통째로 버려졌다 —
      19종 중 14종(탱커 5·브레이커 5·힐러 2·서포트 2)이 전부 딜러로 싸웠다.
      아군 타겟팅이 `role === 'tank'`로 어그로를 가르므로(아래 pickTargets),
      적 탱커가 앞에 서지 못하고 뒤의 힐러가 그대로 노출됐다.
    */
    role: e.role,
    stats,
    currentHp: stats.hp,
    shield: 0,
    statuses: [],
    cooldowns: {},
    isAlive: true,
  };
}

function buildGuard(g: GuardDef): Combatant {
  return {
    uid: `G:${g.kind}:${g.id}`,
    side: 'ally',
    sourceId: `${g.kind}:${g.id}`,
    name: g.name,
    element: 'earth',
    role: 'support',
    stats: { hp: g.hp, atk: 0, def: g.def, spd: 0, crit: 0 },
    currentHp: g.hp,
    shield: 0,
    statuses: [],
    cooldowns: {},
    isAlive: true,
  };
}

const isGuard = (c: Combatant) => c.uid.startsWith('G:');
const isHero = (c: Combatant) => c.uid.startsWith('A:');

// ------------------------------------------------------------
// 스탯 보정
// ------------------------------------------------------------

function modifier(c: Combatant, up: StatusKind, down: StatusKind): number {
  let m = 1;
  for (const s of c.statuses) {
    if (s.kind === up) m += s.magnitude;
    if (s.kind === down) m -= s.magnitude;
  }
  return Math.max(0.1, m);
}

const effAtk = (c: Combatant) => c.stats.atk * modifier(c, 'atkUp', 'atkDown');
const effDef = (c: Combatant) => c.stats.def * modifier(c, 'defUp', 'defDown');
const effSpd = (c: Combatant) => c.stats.spd * modifier(c, 'spdUp', 'spdDown');

const isStunned = (c: Combatant) => c.statuses.some((s) => s.kind === 'stun');

// ------------------------------------------------------------
// 대미지 공식
// ------------------------------------------------------------

export function computeDamage(
  attacker: Combatant,
  defender: Combatant,
  power: number,
  scalesWith: keyof Stats,
  chart: Record<Element, Record<Element, number>>,
  rng: RNG,
): { amount: number; isCrit: boolean; affinity?: Affinity } {
  const base =
    scalesWith === 'atk' ? effAtk(attacker)
    : scalesWith === 'def' ? effDef(attacker)
    : attacker.stats[scalesWith];

  const raw = base * power;
  const mitigation = DEFENSE_CONSTANT / (DEFENSE_CONSTANT + effDef(defender));
  const elem = chart[attacker.element][defender.element];
  const isCrit = rngChance(rng, attacker.stats.crit);
  const critMul = isCrit ? 1.6 : 1;
  const variance = 0.95 + rng() * 0.1; // ±5%

  const amount = Math.max(1, Math.round(raw * mitigation * elem * critMul * variance));
  /*
    ⚠️ 상성 계수는 **원래도 계산되고 있었고 화면까지 오지 않았을 뿐**이다.
    유리 1.5 / 불리 0.7은 전투에서 가장 큰 변수 중 하나인데, 그 결과가
    "숫자가 좀 크다/작다"로만 보여서 플레이어가 이유를 알 수 없었다.
    여기서 하는 일은 **이미 나온 값을 이름 붙여 내보내는 것뿐**이며
    `amount` 계산에는 한 글자도 손대지 않는다 — 시드 재현성이 걸려 있다.
  */
  return { amount, isCrit, affinity: affinityOf(elem) };
}

/** 상성 계수 → 표시용 분류. 1이면 표식을 달지 않는다(중립을 표시하면 소음이 된다) */
export function affinityOf(elem: number): Affinity | undefined {
  if (elem > 1) return 'adv';
  if (elem < 1) return 'dis';
  return undefined;
}

// ------------------------------------------------------------
// 타겟 선택
// ------------------------------------------------------------

function selectTargets(
  actor: Combatant,
  skill: Skill,
  all: Combatant[],
  rng: RNG,
  focus?: Mission['enemyFocus'],
  /** 개입 '집중'으로 지정된 적 uid. 아군의 단일 공격이 여기로 몰린다. */
  focusedEnemyUid?: string | null,
  /** 개입 '후퇴' 중인 유닛 uid — 피격 대상에서 빠진다 */
  retreatedUids?: Set<string>,
): Combatant[] {
  const pool = all.filter((c) => {
    if (!c.isAlive) return false;
    // 후퇴한 유닛은 전선에서 빠져 있으므로 공격 대상이 되지 않는다.
    // 단 아군의 회복/버프 대상으로는 남는다.
    if (retreatedUids?.has(c.uid) && skill.targetSide === 'enemy') return false;
    if (skill.targetSide === 'self') return c.uid === actor.uid;
    if (skill.targetSide === 'ally') return c.side === actor.side;
    return c.side !== actor.side;
  });
  if (pool.length === 0) return [];

  switch (skill.targetScope) {
    case 'all':
      return pool;
    case 'lowestHp':
      return [pool.reduce((a, b) => (a.currentHp / a.stats.hp <= b.currentHp / b.stats.hp ? a : b))];
    case 'highestAtk':
      return [pool.reduce((a, b) => (effAtk(a) >= effAtk(b) ? a : b))];
    case 'random2':
      return pool.length <= 2 ? pool : [...pool].sort(() => rng() - 0.5).slice(0, 2);
    case 'single':
    default: {
      // 개입 '집중' — 아군의 단일 공격을 지정한 적에게 몰아준다.
      // 마스터의 지시이므로 확률이 아니라 확정이다.
      if (focusedEnemyUid && actor.side === 'ally' && skill.targetSide === 'enemy') {
        const focused = pool.find((c) => c.uid === focusedEnemyUid);
        if (focused) return [focused];
      }
      // 임무 집중 타겟 — 적은 보호 대상을 우선 노린다
      if (focus && actor.side === 'enemy' && skill.targetSide === 'enemy') {
        const protectee = pool.filter((c) => c.sourceId.startsWith(`${focus.kind}:`));
        if (protectee.length > 0 && rng() < focus.chance) {
          return [protectee[Math.floor(rng() * protectee.length)]];
        }
      }
      // 탱커 우선 피격 — 단, 확정이 아니라 확률 (무한 사수 방지)
      const tanks = pool.filter((c) => c.role === 'tank');
      const useTank = skill.targetSide === 'enemy' && tanks.length > 0 && rng() < TANK_AGGRO;
      const candidates = useTank ? tanks : pool;
      return [candidates[Math.floor(rng() * candidates.length)]];
    }
  }
}

// ------------------------------------------------------------
// 스킬 선택: 쿨다운이 도는 액티브 중 쿨다운이 가장 긴 것 우선
// ------------------------------------------------------------

function chooseSkill(actor: Combatant, d: BattleData, skillIds: SkillId[]): Skill | null {
  const usable = skillIds
    .map((sid) => d.skills[sid])
    .filter((s): s is Skill => !!s && s.type === 'active' && (actor.cooldowns[s.id] ?? 0) <= 0);
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => (a.cooldown >= b.cooldown ? a : b));
}

// ------------------------------------------------------------
// 메인 시뮬레이션
// ------------------------------------------------------------

export function simulateBattle(input: BattleInput): BattleOutcome {
  const { allies, enemyIds, data, rng } = input;
  const maxTurns = input.maxTurns ?? 60;

  const mission = input.mission ?? DEFAULT_MISSION;
  const missionFocus = focusOf(mission);
  const guardDefs = input.guards ?? [];
  const interventions = input.interventions ?? [];

  const units: Combatant[] = [
    ...allies.filter((a) => !a.isDead)
      .map((a) => buildAlly(a, data, input.allyAtkMult ?? 1, input.inventory)),
    ...guardDefs.map(buildGuard),
    ...enemyIds.map((e, i) => buildEnemy(e, i, data, input.enemyStatMult ?? 1)),
  ];

  const skillsOf = (c: Combatant): SkillId[] => {
    if (isGuard(c)) return [];
    if (c.side === 'ally') {
      return data.heroes[allies.find((a) => a.instId === c.sourceId)!.defId].skillIds;
    }
    return data.enemies[c.sourceId as EnemyDefId].skillIds;
  };

  const events: BattleEvent[] = [];
  const heroUnits = units.filter(isHero);
  const guardUnits = units.filter(isGuard);
  const enemyUnits = units.filter((u) => u.side === 'enemy');
  const heroesAlive = () => heroUnits.some((u) => u.isAlive);
  const enemiesAlive = () => enemyUnits.some((u) => u.isAlive);

  const checkMission = (turn: number) =>
    evaluateMission(mission, {
      turn,
      heroesAlive: heroesAlive(),
      enemiesAlive: enemiesAlive(),
      guards: guardUnits,
      enemies: enemyUnits,
    });

  let turn = 0;
  let outcome: BattleOutcome['outcome'] = 'timeout';
  // 파티 공용 재고. 전투 전 입력이므로 도중에 늘지 않는다.
  let potionsLeft = Math.max(0, Math.floor(input.potions ?? 0));

  while (turn < maxTurns) {
    turn++;
    events.push({ turn, type: 'turnStart' });

    // --- 개입 발효 ---
    // uid로 변환해 둔다. 개입은 instId로 대상을 가리키지만 전투는 uid로 돈다.
    const retreatedIds = retreatedAt(interventions, turn);
    const retreatedUids = new Set(
      units.filter((u) => isHero(u) && retreatedIds.has(u.sourceId)).map((u) => u.uid),
    );
    const focusedEnemyUid = focusTargetAt(interventions, turn);

    // 수호 — 해당 턴에 방어 상태를 걸어준다
    const guardedIds = guardedAt(interventions, turn);
    for (const u of units) {
      if (!isHero(u) || !guardedIds.has(u.sourceId) || !u.isAlive) continue;
      if (u.statuses.some((s) => s.kind === GUARD_STATUS && s.magnitude >= GUARD_DEF_BONUS)) continue;
      u.statuses.push({
        kind: GUARD_STATUS,
        remainingTurns: 2, // 이번 턴 끝의 tick으로 1 줄어드니 실제 1턴
        magnitude: GUARD_DEF_BONUS,
      });
      events.push({
        turn, type: 'statusApplied', targetUids: [u.uid], status: GUARD_STATUS,
      });
    }

    for (const uid of retreatedUids) {
      events.push({ turn, type: 'retreat', targetUids: [uid] });
    }

    /**
     * 포션 자동 발동.
     *
     * 턴 **시작**에 검사하는 이유는 "한 대 더 맞으면 죽는" 상태를 넘기기 위해서다.
     * 행동 뒤에 보면 이미 죽은 뒤라 늦는다.
     *
     * HP 비율이 가장 낮은 아군부터 먹인다. 위급한 순서가 아니면
     * 멀쩡한 쪽이 먼저 마셔 정작 죽을 영웅이 못 받는다.
     */
    if (potionsLeft > 0) {
      const needy = units
        .filter((u) => u.isAlive && u.side === 'ally' && !isGuard(u)
          && u.currentHp / u.stats.hp <= POTION_TUNING.triggerAt)
        .sort((a, b) => a.currentHp / a.stats.hp - b.currentHp / b.stats.hp);

      for (const u of needy) {
        if (potionsLeft <= 0) break;
        const before = u.currentHp;
        u.currentHp = Math.min(u.stats.hp, u.currentHp + Math.round(u.stats.hp * POTION_TUNING.healRatio));
        potionsLeft--;
        events.push({
          turn, type: 'heal', targetUids: [u.uid],
          amount: u.currentHp - before,
          fromPotion: true,
        });
      }
    }

    // 턴 시작 시 속도 순 정렬 (버프 반영)
    const order = units
      .filter((u) => u.isAlive && !isGuard(u))
      .sort((a, b) => effSpd(b) - effSpd(a));

    for (const actor of order) {
      if (!actor.isAlive) continue;
      // 후퇴한 영웅은 이번 턴 행동하지 않는다
      if (retreatedUids.has(actor.uid)) continue;

      // 도트 피해
      for (const st of actor.statuses) {
        if (st.kind === 'poison' || st.kind === 'burn') {
          const dot = Math.max(1, Math.round(actor.stats.hp * st.magnitude));
          applyDamage(actor, dot, events, turn, undefined);
        }
      }
      if (!actor.isAlive) continue;

      if (isStunned(actor)) {
        tickStatuses(actor, events, turn);
        continue;
      }

      const skill = chooseSkill(actor, data, skillsOf(actor));
      if (skill) {
        const targets = selectTargets(
          actor, skill, units, rng, missionFocus, focusedEnemyUid, retreatedUids,
        );
        if (targets.length > 0) {
          events.push({
            turn, type: 'skillUse', actorUid: actor.uid, skillId: skill.id,
            targetUids: targets.map((t) => t.uid),
          });
          for (const target of targets) {
            for (const eff of skill.effects) {
              applyEffect(actor, target, eff, data, rng, events, turn);
            }
          }
          actor.cooldowns[skill.id] = skill.cooldown;
        }
      }

      // 쿨다운 감소
      for (const k of Object.keys(actor.cooldowns)) {
        actor.cooldowns[k as SkillId] = Math.max(0, actor.cooldowns[k as SkillId] - 1);
      }
      tickStatuses(actor, events, turn);

      const mid = checkMission(turn);
      if (mid !== 'ongoing') { outcome = mid; break; }
    }

    if (outcome !== 'timeout') break;

    const end = checkMission(turn);
    if (end !== 'ongoing') { outcome = end; break; }
  }

  events.push({ turn, type: 'battleEnd' });

  const allyUnits = heroUnits;
  return {
    outcome,
    events,
    turnsElapsed: turn,
    survivors: allyUnits
      .filter((u) => u.isAlive)
      .map((u) => ({ instId: u.sourceId as HeroInstId, currentHp: u.currentHp })),
    casualties: allyUnits.filter((u) => !u.isAlive).map((u) => u.sourceId as HeroInstId),
  };
}

// ------------------------------------------------------------
// 효과 적용
// ------------------------------------------------------------

function applyEffect(
  actor: Combatant,
  target: Combatant,
  eff: Skill['effects'][number],
  d: BattleData,
  rng: RNG,
  events: BattleEvent[],
  turn: number,
): void {
  if (!target.isAlive && eff.kind !== 'revive') return;
  if (eff.chance !== undefined && !rngChance(rng, eff.chance)) return;

  switch (eff.kind) {
    case 'damage': {
      const { amount, isCrit, affinity } = computeDamage(
        actor, target, eff.power ?? 1, eff.scalesWith ?? 'atk', d.elementChart, rng,
      );
      applyDamage(target, amount, events, turn, actor.uid, isCrit, affinity);
      break;
    }
    case 'heal': {
      const base = eff.scalesWith === 'def' ? effDef(actor) : effAtk(actor);
      const amount = Math.round(base * (eff.power ?? 1));
      const before = target.currentHp;
      target.currentHp = Math.min(target.stats.hp, target.currentHp + amount);
      events.push({
        turn, type: 'heal', actorUid: actor.uid, targetUids: [target.uid],
        amount: target.currentHp - before,
      });
      break;
    }
    case 'shield': {
      target.shield += Math.round(effAtk(actor) * (eff.power ?? 1));
      break;
    }
    case 'buff':
    case 'debuff': {
      if (!eff.status) break;
      const existing = target.statuses.find((s) => s.kind === eff.status);
      if (existing) {
        existing.remainingTurns = Math.max(existing.remainingTurns, eff.duration ?? 1);
      } else {
        target.statuses.push({
          kind: eff.status,
          remainingTurns: eff.duration ?? 1,
          magnitude: STATUS_MAGNITUDE[eff.status],
        });
      }
      events.push({
        turn, type: 'statusApplied', actorUid: actor.uid,
        targetUids: [target.uid], status: eff.status,
      });
      break;
    }
    case 'cleanse': {
      target.statuses = target.statuses.filter(
        (s) => !['atkDown', 'defDown', 'spdDown', 'poison', 'burn', 'stun'].includes(s.kind),
      );
      break;
    }
    case 'revive': {
      if (!target.isAlive) {
        target.isAlive = true;
        target.currentHp = Math.round(target.stats.hp * (eff.power ?? 0.3));
      }
      break;
    }
  }
}

function applyDamage(
  target: Combatant, amount: number, events: BattleEvent[], turn: number,
  actorUid?: string, isCrit?: boolean, affinity?: Affinity,
): void {
  let remaining = amount;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.currentHp -= remaining;
  events.push({
    turn, type: 'damage', actorUid, targetUids: [target.uid], amount, isCrit, affinity,
  });

  if (target.currentHp <= 0) {
    target.currentHp = 0;
    target.isAlive = false;
    events.push({ turn, type: 'death', targetUids: [target.uid] });
  }
}

function tickStatuses(c: Combatant, events: BattleEvent[], turn: number): void {
  const expired: StatusKind[] = [];
  c.statuses = c.statuses.filter((s: ActiveStatus) => {
    s.remainingTurns -= 1;
    if (s.remainingTurns <= 0) { expired.push(s.kind); return false; }
    return true;
  });
  for (const kind of expired) {
    events.push({ turn, type: 'statusExpired', targetUids: [c.uid], status: kind });
  }
}
