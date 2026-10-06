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
import { displayName } from './identity';
import { applyBonus, heroBonus } from './gear';
import { POTION_TUNING } from './data/gear';
import {
  DEFAULT_MISSION, evaluateMission, focusOf,
  type GuardDef, type Mission,
} from './mission';
import {
  focusTargetAt, guardedAt, retreatedAt, withdrawnBy,
  GUARD_DEF_BONUS, GUARD_STATUS, type Intervention,
} from './intervention';
import {
  attackCandidates, fallbackRatio, protecteeUids, DEFAULT_ORDERS, type Orders,
} from './orders';
import { COVER_CHANCE, CRISIS_LEVELS, type CrisisLevel } from './data/orders';
import {
  STRATAGEM_BY_ID, type StratagemEffect, type StratagemId,
} from './data/stratagems';
import { conditionMet, pickExecutor, successChance, type FieldView } from './stratagem';
import { terrainModifier } from './floormap';
import type { TerrainTag } from './data/terrain';
import { attributesOfInstance, statsOfInstance } from './stats';
import { rngChance } from './rng';
import type { LineageTraits } from './data/traits';

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
  /**
   * 계열 특성 수치(`data/traits.ts`). **생략하면 특성 없이 돈다** — 특성 이전 엔진과
   * 비트 단위로 같다(`ordersBaseline.test.ts`). `gameData`에는 들어 있다.
   */
  traits?: LineageTraits;
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
  /**
   * 작전 카드 3장(공격·보호·퇴각). 생략 = `DEFAULT_ORDERS` = 현행 엔진과 비트 단위로 같다.
   * 개입·포션과 같은 **전투 전 입력**이다.
   */
  orders?: Orders;
  /**
   * 책략 카드. 생략하면 책략 없이 돈다(현행과 비트 단위로 같다).
   *
   * `rng`는 **주 전투 난수와 다른 흐름**이어야 한다(`STREAM.STRATAGEM`) —
   * 같은 흐름을 쓰면 판정 한 번이 이후 전투 전체를 다시 섞는다.
   */
  stratagems?: {
    ids: StratagemId[];
    /** 책략별 적의 내성 (0~3) */
    resist?: Partial<Record<StratagemId, number>>;
    /**
     * 접점 지형(층 맵에서 고른 경로). 성공률에만 ±를 준다(`terrainModifier`).
     * 생략하면 보정 없음 — 맵 이전과 같다.
     */
    terrain?: TerrainTag | null;
    rng: RNG;
  };
}

/**
 * 위기 — 아군 영웅의 HP가 처음으로 `CRISIS_HP_RATIO` 이하가 된 순간.
 *
 * ⚠️ **이벤트가 아니라 결과 필드다.** `events`에 한 줄이라도 더하면 카드 없는 전투가
 * 기준선과 달라진다(`ordersBaseline.test.ts`). 화면은 이 값으로 리플레이를 멈춘다.
 */
export interface Crisis {
  turn: number;
  /** 이 인덱스의 이벤트까지 재생하면 멈춘다 (`Beat.at`과 같은 뜻) */
  at: number;
  uid: string;
}

export interface BattleOutcome {
  outcome: 'victory' | 'defeat' | 'timeout';
  events: BattleEvent[];
  /** 살아남은 영웅. **전투에서 이탈한 영웅도 여기 있다**(이탈 = 생존) */
  survivors: Array<{ instId: HeroInstId; currentHp: number }>;
  casualties: HeroInstId[];
  /** 퇴각 방침·후퇴 신호로 이탈한 영웅. `survivors`의 부분집합 */
  withdrawn: HeroInstId[];
  turnsElapsed: number;
  /** 정직한 보고 기준의 위기(`crises.hp30`과 같다) */
  crisis: Crisis | null;
  /**
   * 위기 단계별 첫 순간(`CRISIS_LEVELS`). 보고자 성향이 어느 단계를 쓸지 정한다(`report.ts`).
   * `crisis`와 같은 이유로 이벤트가 아니라 결과 필드다.
   */
  crises: Partial<Record<CrisisLevel, Crisis>>;
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

/**
 * 단일 대상 공격이 탱커에게 갈 확률. **진영마다 다르다.**
 *
 * 0.6은 원래 **아군 탱커가 파티를 지키는** 값으로 맞춰졌다(적은 role이 전부
 * dealer라 이 분기가 아예 안 돌았다 — §STEP 44). 적 role을 살리면서 같은 값을
 * 적 진영에도 쓰자 **토벌 층이 무너졌다**: 아군 딜의 60%가 적 탱커에게 강제로
 * 빨려 들어가는데, 토벌은 전멸이 승리 조건이라 그 HP를 결국 다 깎아야 한다.
 * 그 사이 뒤의 딜러·힐러가 멀쩡히 일한다.
 *
 *   실측(0.6 공용): 10층 61%→26% · 13층 89%→30% · 16층 79%→25%
 *
 * 적 탱커는 **"먼저 자를지 말지"를 묻는 존재**여야지 반드시 통과해야 하는
 * 관문이면 안 된다. 그래서 적 쪽만 낮춘다. 아군 쪽 0.6은 검증된 값이라 유지한다.
 *
 * ── 0.2를 고른 근거 (climb-check 구간 완주율) ──────────
 *   계수  | 중층 | 상층 | 21~40 | 41~60 | 61~80 | 81~100
 *   0.6   |   2% |   3% |   12% |   20% |    0% |     1%   ← 무너진다
 *   0.3   |   9% |   7% |   23% |   31% |   20% |     4%
 *   0.2   |  14% |  10% |   24% |   30% |   23% |     8%   ← 채택
 *   0.15  |  14% |   7% |   32% |   34% |   26% |     8%
 * (기준선: 중층 20% · 상층 9% · 51/43/20/18%)
 *
 * 0.15가 생성 구간 수치는 더 좋지만 **적 탱커가 사실상 무의미해진다** —
 * 그러면 role을 살린 의미가 없다. 0.2는 상층이 기준선(9%)을 넘고
 * 중층도 14%로 회복하면서 탱커가 여전히 "다섯 대 중 한 대"를 가져간다.
 */
const TANK_AGGRO_VS_ALLY = 0.6;  // 적이 아군 탱커를 노릴 확률 (기존 값)
const TANK_AGGRO_VS_ENEMY = 0.2; // 아군이 적 탱커를 노릴 확률

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
    lineage: def.lineage,
    stats,
    currentHp: Math.min(inst.currentHp > 0 ? inst.currentHp : stats.hp, stats.hp),
    shield: 0,
    statuses: [],
    cooldowns: {},
    isAlive: true,
  };
}

/**
 * 층 깊이 배수를 먹인 적 스탯.
 *
 * 배수는 hp/atk/def에만 곱한다.
 * - spd를 곱하면 적이 항상 선공하게 되어 전투가 일방적이 된다(속도는 순서를 정할 뿐이다).
 * - crit은 확률이라 곱하면 1.0을 넘어 전부 치명타가 된다.
 *
 * export하는 이유: 화면의 HP 바 분모(`encounter.ts` 로스터)가 이 값을 따로 다시 적으면
 * 갈라진다 — 실제로 로스터가 배수 없는 hp를 써서 21층 이후 적 HP 바가 어긋났다.
 */
export function scaledEnemyStats(base: Stats, mult = 1): Stats {
  return mult === 1 ? { ...base } : {
    ...base,
    hp: Math.round(base.hp * mult),
    atk: Math.round(base.atk * mult),
    def: Math.round(base.def * mult),
  };
}

function buildEnemy(eid: EnemyDefId, index: number, d: BattleData, mult = 1): Combatant {
  const e = d.enemies[eid];
  const stats = scaledEnemyStats(e.stats, mult);
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

// atkAura는 지휘관 특성이 건다 — 특성이 없으면 undefined라 계산이 예전과 같다
const effAtk = (c: Combatant) => c.stats.atk * modifier(c, 'atkUp', 'atkDown') * (c.atkAura ?? 1);
const effDef = (c: Combatant) => c.stats.def * modifier(c, 'defUp', 'defDown');
const effSpd = (c: Combatant) => c.stats.spd * modifier(c, 'spdUp', 'spdDown');

const isStunned = (c: Combatant) => c.statuses.some((s) => s.kind === 'stun');

/** 해로운 상태 — 정화가 씻는 것과 사냥꾼 특성이 노리는 것이 같은 목록이어야 한다 */
const HARMFUL: readonly StatusKind[] = ['atkDown', 'defDown', 'spdDown', 'poison', 'burn', 'stun'];
const isAfflicted = (c: Combatant) => c.statuses.some((s) => HARMFUL.includes(s.kind));
/** 대상이 둘 이상인 기술인가 — 술사 특성의 조건 */
const isMultiTarget = (s: Skill) => s.targetScope === 'all' || s.targetScope === 'random2';

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

/** 타겟 선택이 전투 상태에서 읽는 것들 — 인자가 늘어 묶었다 */
interface TargetingCtx {
  focus?: Mission['enemyFocus'];
  /** 개입 '집중'으로 지정된 적 uid. 아군의 단일 공격이 여기로 몰린다. */
  focusedEnemyUid?: string | null;
  /** 개입 '후퇴' 중인 유닛 uid — 피격 대상에서 빠진다 */
  retreatedUids?: Set<string>;
  /** 전투에서 이탈한 영웅 uid — 어떤 스킬의 대상도 되지 않는다 */
  withdrawnUids?: Set<string>;
  orders: Orders;
  /** 보호 방침으로 탱커가 막아섰을 때 부른다 (이벤트 기록용) */
  onCover?: (tank: Combatant, protectee: Combatant) => void;
}

function selectTargets(
  actor: Combatant,
  skill: Skill,
  all: Combatant[],
  rng: RNG,
  ctx: TargetingCtx,
): Combatant[] {
  const { focus, focusedEnemyUid, retreatedUids, withdrawnUids, orders } = ctx;
  const pool = all.filter((c) => {
    if (!c.isAlive) return false;
    // 이탈한 영웅은 전장에 없다 — 공격도 회복도 닿지 않는다
    if (withdrawnUids?.has(c.uid)) return false;
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
      const picked = pickSingle(actor, skill, pool, rng, focus, focusedEnemyUid, orders);
      return [coverIfOrdered(actor, skill, picked, pool, rng, ctx)];
    }
  }
}

function pickSingle(
  actor: Combatant,
  skill: Skill,
  pool: Combatant[],
  rng: RNG,
  focus: Mission['enemyFocus'] | undefined,
  focusedEnemyUid: string | null | undefined,
  orders: Orders,
): Combatant {
  const allyAttack = actor.side === 'ally' && skill.targetSide === 'enemy';
  // 개입 '집중' — 아군의 단일 공격을 지정한 적에게 몰아준다.
  // 마스터의 지시이므로 확률이 아니라 확정이다.
  if (focusedEnemyUid && allyAttack) {
    const focused = pool.find((c) => c.uid === focusedEnemyUid);
    if (focused) return focused;
  }
  /*
    작전 카드 — 공격 방침. `free`면 null이 와서 아래 현행 규칙으로 떨어진다.
    ⚠️ 이 분기는 `free`일 때 RNG를 한 번도 뽑지 않아야 한다(기준선 잠금).
  */
  if (allyAttack) {
    const ordered = attackCandidates(orders.attack, pool, effAtk);
    if (ordered) {
      return ordered.length === 1 ? ordered[0] : ordered[Math.floor(rng() * ordered.length)];
    }
  }
  // 임무 집중 타겟 — 적은 보호 대상을 우선 노린다
  if (focus && actor.side === 'enemy' && skill.targetSide === 'enemy') {
    const protectee = pool.filter((c) => c.sourceId.startsWith(`${focus.kind}:`));
    if (protectee.length > 0 && rng() < focus.chance) {
      return protectee[Math.floor(rng() * protectee.length)];
    }
  }
  // 탱커 우선 피격 — 단, 확정이 아니라 확률 (무한 사수 방지)
  const tanks = pool.filter((c) => c.role === 'tank');
  // 노리는 쪽이 적이면 '아군이 적 탱커를 친다' — 진영마다 계수가 다르다(위 주석)
  const aggro = actor.side === 'ally' ? TANK_AGGRO_VS_ENEMY : TANK_AGGRO_VS_ALLY;
  const useTank = skill.targetSide === 'enemy' && tanks.length > 0 && rng() < aggro;
  const candidates = useTank ? tanks : pool;
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * 작전 카드 — 보호 방침. 적의 단일 공격이 보호 대상을 노리면 아군 탱커가 확률로 막아선다.
 *
 * 새 능력치가 아니라 **대상 교체**다. 탱커가 없거나, 보호 대상이 탱커 자신이면 아무 일도 없다.
 * `free`면 RNG를 뽑지 않는다(기준선 잠금).
 */
function coverIfOrdered(
  actor: Combatant,
  skill: Skill,
  target: Combatant,
  pool: Combatant[],
  rng: RNG,
  ctx: TargetingCtx,
): Combatant {
  if (ctx.orders.protect === 'free') return target;
  if (actor.side !== 'enemy' || skill.targetSide !== 'enemy' || !isHero(target)) return target;
  if (target.role === 'tank') return target;
  // 보호 대상은 **이 순간** 기준으로 정한다 — "가장 약한 아군"은 매 공격마다 바뀐다
  const protectees = protecteeUids(ctx.orders.protect, pool.filter(isHero));
  if (!protectees.has(target.uid)) return target;
  const tank = pool.find((c) => isHero(c) && c.role === 'tank');
  if (!tank) return target;
  if (!rngChance(rng, COVER_CHANCE)) return target;
  ctx.onCover?.(tank, target);
  return tank;
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
  const orders = input.orders ?? DEFAULT_ORDERS;
  const fallbackAt = fallbackRatio(orders.fallback);

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
  /**
   * 전투에서 이탈한 영웅 uid. 한 번 들어가면 끝까지 나오지 않는다.
   * 이탈한 영웅은 행동·피격·회복이 전부 없고 **생존**한다 — 전장에 남은 인원이 지면 패배다.
   */
  const withdrawnUids = new Set<string>();
  const inField = (u: Combatant) => u.isAlive && !withdrawnUids.has(u.uid);
  // 이탈한 영웅을 "살아 있음"으로 세면 남은 인원이 전멸해도 전투가 안 끝난다
  const heroesAlive = () => heroUnits.some(inField);
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
  const crises: Partial<Record<CrisisLevel, Crisis>> = {};
  /** 위기 기록 — 행동 하나가 끝날 때마다 본다. 단계마다 전투당 한 번뿐이다 */
  const noteCrisis = () => {
    for (const level of Object.keys(CRISIS_LEVELS) as CrisisLevel[]) {
      if (crises[level]) continue;
      const ratio = CRISIS_LEVELS[level];
      const hurt = heroUnits.find((u) => inField(u) && u.currentHp / u.stats.hp <= ratio);
      if (hurt) crises[level] = { turn, at: events.length, uid: hurt.uid };
    }
  };
  /*
    책략 — 카드를 들고 왔을 때만 준비한다. 지능은 셋업 때 한 번 계산해 둔다
    (전투 중에 레벨이 변하지 않는다).
  */
  const strat = input.stratagems && input.stratagems.ids.length > 0 ? input.stratagems : null;
  const usedStratagems = new Set<StratagemId>();
  const intByUid = new Map<string, number>();
  if (strat) {
    for (const u of heroUnits) {
      const inst = allies.find((a) => a.instId === u.sourceId)!;
      intByUid.set(u.uid, attributesOfInstance(inst, data.heroes[inst.defId], data.starScaling).int.current);
    }
  }
  const withdraw = (u: Combatant) => {
    if (withdrawnUids.has(u.uid)) return;
    withdrawnUids.add(u.uid);
    events.push({ turn, type: 'withdraw', targetUids: [u.uid] });
  };

  /*
    계열 특성 — `data.traits`가 없으면 아래 셋 다 예전 계산 그대로다(이벤트도 내지 않는다).
  */
  const traits = data.traits;
  /** 척후 — 첫 몇 턴 동안 행동 순서만 앞당긴다. 속도 수치 자체는 건드리지 않는다 */
  const initiative = (u: Combatant) =>
    effSpd(u) * (traits && u.lineage === 'scout' && turn <= traits.scout.turns ? traits.scout.spdMult : 1);
  /**
   * 지휘관 — 전장에 있는 동안 아군 영웅 전체의 공격력을 올린다. 둘이어도 한 번이다.
   * 쓰러지거나 이탈하면 바로 꺼져야 하므로 행동마다 다시 정한다.
   */
  const refreshAura = () => {
    if (!traits) return;
    const led = heroUnits.some((u) => inField(u) && u.lineage === 'commander');
    for (const u of heroUnits) u.atkAura = led ? traits.commander.allyAtkMult : 1;
  };

  while (turn < maxTurns) {
    turn++;
    events.push({ turn, type: 'turnStart' });

    // 전투가 열리는 순간 드러나는 특성 — 화면이 "왜 먼저 움직였나 / 왜 더 아픈가"를 말할 수 있게
    if (traits && turn === 1) {
      for (const u of heroUnits) {
        if (inField(u) && (u.lineage === 'scout' || u.lineage === 'commander')) {
          events.push({ turn, type: 'trait', actorUid: u.uid, trait: u.lineage });
        }
      }
    }

    // --- 개입 발효 ---
    // uid로 변환해 둔다. 개입은 instId로 대상을 가리키지만 전투는 uid로 돈다.
    const retreatedIds = retreatedAt(interventions, turn);
    const retreatedUids = new Set(
      units.filter((u) => isHero(u) && retreatedIds.has(u.sourceId)).map((u) => u.uid),
    );
    const focusedEnemyUid = focusTargetAt(interventions, turn);

    // 후퇴 신호 — 발효 턴부터 끝까지 이탈
    const signalled = withdrawnBy(interventions, turn);
    for (const u of heroUnits) {
      if (u.isAlive && signalled.has(u.sourceId)) withdraw(u);
    }

    // 수호 — 해당 턴에 방어 상태를 걸어준다
    const guardedIds = guardedAt(interventions, turn);
    for (const u of units) {
      if (!isHero(u) || !guardedIds.has(u.sourceId) || !inField(u)) continue;
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
        .filter((u) => inField(u) && u.side === 'ally' && !isGuard(u)
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

    /*
      작전 카드 — 퇴각 방침. 포션 **다음**에 본다: 포션이 기준 위로 끌어올렸으면 남는다.
      턴 시작에만 보는 이유는 포션과 같다 — 행동 도중에 빠지면 이미 맞은 뒤라 늦거나,
      같은 턴 안에서 누가 먼저 움직였느냐에 따라 결과가 흔들린다.
    */
    if (fallbackAt !== null) {
      for (const u of heroUnits) {
        if (inField(u) && u.currentHp / u.stats.hp <= fallbackAt) withdraw(u);
      }
    }

    /*
      책략 — 퇴각 다음에 본다: 빠질 사람이 빠진 뒤의 전장으로 "불리한가"를 판단한다.
      한 턴에 하나만, 카드마다 전투당 한 번. 슬롯 순서가 우선순위다.
      판정 난수는 `strat.rng`(별도 흐름)만 쓴다 — 주 전투 난수를 밀지 않는다.
    */
    if (strat) {
      const view: FieldView = {
        turn,
        heroes: heroUnits.filter(inField),
        enemies: enemyUnits.filter((u) => u.isAlive),
        bossPresent: enemyUnits.some(
          (u) => u.isAlive && data.enemies[u.sourceId as EnemyDefId]?.isBoss,
        ),
      };
      const id = strat.ids.find((sid) => !usedStratagems.has(sid)
        && !!STRATAGEM_BY_ID[sid] && conditionMet(STRATAGEM_BY_ID[sid].condition, view));
      if (id) {
        usedStratagems.add(id);
        const def = STRATAGEM_BY_ID[id];
        const intOf = (uid: string) => intByUid.get(uid) ?? 0;
        const exec = pickExecutor(view.heroes, intOf)!;
        const avg = view.heroes.reduce((a, h) => a + intOf(h.uid), 0) / view.heroes.length;
        const chance = successChance({
          base: def.baseChance,
          executorInt: intOf(exec.uid),
          partyAvgInt: avg,
          bossPresent: view.bossPresent,
          resist: strat.resist?.[id] ?? 0,
          terrain: terrainModifier(strat.terrain, id),
        });
        const ok = rngChance(strat.rng, chance);
        events.push({ turn, type: 'stratagem', actorUid: exec.uid, stratagemId: id, success: ok });
        for (const eff of ok ? def.success : def.failure) {
          applyStratagemEffect(eff, exec, view, events, turn);
        }
        noteCrisis();
      }
    }

    // 턴 시작 시 속도 순 정렬 (버프 반영)
    const order = units
      .filter((u) => inField(u) && !isGuard(u))
      .sort((a, b) => initiative(b) - initiative(a));

    for (const actor of order) {
      if (!inField(actor)) continue;
      // 후퇴한 영웅은 이번 턴 행동하지 않는다
      if (retreatedUids.has(actor.uid)) continue;
      refreshAura();

      // 도트 피해
      for (const st of actor.statuses) {
        if (st.kind === 'poison' || st.kind === 'burn') {
          const dot = Math.max(1, Math.round(actor.stats.hp * st.magnitude));
          applyDamage(actor, dot, events, turn, undefined);
        }
      }
      noteCrisis();
      if (!actor.isAlive) continue;

      if (isStunned(actor)) {
        tickStatuses(actor, events, turn);
        continue;
      }

      const skill = chooseSkill(actor, data, skillsOf(actor));
      if (skill) {
        const targets = selectTargets(actor, skill, units, rng, {
          focus: missionFocus, focusedEnemyUid, retreatedUids, withdrawnUids, orders,
          onCover: (tank, protectee) => events.push({
            turn, type: 'cover', actorUid: tank.uid, targetUids: [protectee.uid],
          }),
        });
        if (targets.length > 0) {
          events.push({
            turn, type: 'skillUse', actorUid: actor.uid, skillId: skill.id,
            targetUids: targets.map((t) => t.uid),
          });
          for (const target of targets) {
            for (const eff of skill.effects) {
              applyEffect(actor, target, eff, data, rng, events, turn, isMultiTarget(skill));
            }
          }
          actor.cooldowns[skill.id] = skill.cooldown;
        }
      }
      noteCrisis();

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
    withdrawn: allyUnits
      .filter((u) => u.isAlive && withdrawnUids.has(u.uid))
      .map((u) => u.sourceId as HeroInstId),
    crisis: crises.hp30 ?? null,
    crises,
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
  /** 이 효과가 속한 기술이 둘 이상을 대상으로 하는가 — 술사 특성의 조건 */
  multiTarget = false,
): void {
  if (!target.isAlive && eff.kind !== 'revive') return;
  if (eff.chance !== undefined && !rngChance(rng, eff.chance)) return;

  const t = d.traits;
  // 술사 — 대상이 둘 이상인 기술의 피해·회복·보호막이 함께 커진다
  const amp = t && actor.lineage === 'mage' && multiTarget ? t.mage.multiTargetMult : 1;

  switch (eff.kind) {
    case 'damage': {
      const { amount, isCrit, affinity } = computeDamage(
        actor, target, eff.power ?? 1, eff.scalesWith ?? 'atk', d.elementChart, rng,
      );
      /*
        계열 특성은 **이미 나온 피해에 배수로** 건다 — computeDamage의 난수 소비(치명·편차)는
        그대로 두어야 특성을 켜도 주 전투 난수의 순서가 밀리지 않는다.
        공격자 쪽은 한 영웅이 한 계열이라 겹치지 않고, 수호자는 맞는 쪽이라 따로 곱한다.
      */
      let mult = amp;
      let trait: Combatant['lineage'] = amp !== 1 ? 'mage' : undefined;
      if (t && actor.lineage === 'blade' && target.currentHp / target.stats.hp <= t.blade.hpBelow) {
        mult *= t.blade.damageMult; trait = 'blade';
      }
      if (t && actor.lineage === 'hunter' && isAfflicted(target)) {
        mult *= t.hunter.afflictedMult; trait = 'hunter';
      }
      if (t && target.lineage === 'guardian') {
        mult *= t.guardian.damageTakenMult; trait = 'guardian';
      }
      const final = mult === 1 ? amount : Math.max(1, Math.round(amount * mult));
      applyDamage(target, final, events, turn, actor.uid, isCrit, affinity, trait);
      break;
    }
    case 'heal': {
      const base = eff.scalesWith === 'def' ? effDef(actor) : effAtk(actor);
      const raw = Math.round(base * (eff.power ?? 1));
      const amount = amp === 1 ? raw : Math.round(raw * amp);
      const before = target.currentHp;
      target.currentHp = Math.min(target.stats.hp, target.currentHp + amount);
      events.push({
        turn, type: 'heal', actorUid: actor.uid, targetUids: [target.uid],
        amount: target.currentHp - before,
        ...(amp !== 1 ? { trait: 'mage' as const } : {}),
      });
      // 사제 — 넘친 치유의 일부가 보호막으로 남는다. 상한까지만 쌓고, 이미 있는 보호막은 깎지 않는다
      if (t && actor.lineage === 'priest') {
        const overflow = before + amount - target.stats.hp;
        const room = Math.round(target.stats.hp * t.priest.shieldCapRatio) - target.shield;
        const gain = Math.min(Math.round(overflow * t.priest.overflowToShield), room);
        if (gain > 0) {
          target.shield += gain;
          events.push({
            turn, type: 'trait', actorUid: actor.uid, targetUids: [target.uid],
            amount: gain, trait: 'priest',
          });
        }
      }
      break;
    }
    case 'shield': {
      const raw = Math.round(effAtk(actor) * (eff.power ?? 1));
      target.shield += amp === 1 ? raw : Math.round(raw * amp);
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
      target.statuses = target.statuses.filter((s) => !HARMFUL.includes(s.kind));
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

/**
 * 책략 효과 한 줄을 적용한다. 효과 문법은 `data/stratagems.ts`의 `StratagemEffect`.
 *
 * 스킬 효과(`applyEffect`)와 따로 둔 이유: 책략은 **비율 피해**(최대 HP 대비)라
 * 공격력·방어력·상성을 거치지 않는다. 섞으면 "화공이 탱커에게 안 들어간다" 같은 일이 난다.
 * RNG를 쓰지 않는다 — 판정은 이미 끝났다.
 */
function applyStratagemEffect(
  eff: StratagemEffect,
  exec: Combatant,
  view: FieldView,
  events: BattleEvent[],
  turn: number,
): void {
  const liveEnemies = view.enemies.filter((u) => u.isAlive);
  switch (eff.kind) {
    case 'enemiesDamage':
      for (const e of liveEnemies) {
        applyDamage(e, Math.max(1, Math.round(e.stats.hp * eff.ratio)), events, turn, exec.uid);
      }
      break;
    case 'strongestTo': {
      if (liveEnemies.length === 0) break;
      const target = liveEnemies.reduce((a, b) => (effAtk(b) > effAtk(a) ? b : a));
      const cut = target.currentHp - Math.round(target.stats.hp * eff.ratio);
      // 보호막을 거치지 않는다 — 매복은 방패 뒤를 친다
      if (cut > 0) {
        target.currentHp -= cut;
        events.push({ turn, type: 'damage', actorUid: exec.uid, targetUids: [target.uid], amount: cut });
      }
      break;
    }
    case 'enemiesStatus':
      for (const e of liveEnemies) addStatus(e, eff.status, eff.turns, events, turn, exec.uid);
      break;
    case 'alliesStatus':
      for (const h of view.heroes) {
        if (h.isAlive) addStatus(h, eff.status, eff.turns, events, turn, exec.uid);
      }
      break;
    case 'executorLoses': {
      // 치명적이지 않다 — HP 1에서 멈춘다 (data/stratagems.ts 주석)
      const loss = Math.min(exec.currentHp - 1, Math.round(exec.stats.hp * eff.ratio));
      if (loss > 0) {
        exec.currentHp -= loss;
        events.push({ turn, type: 'damage', targetUids: [exec.uid], amount: loss });
      }
      break;
    }
  }
}

/** 상태이상 부여 — `applyEffect`의 buff/debuff와 같은 규칙(이미 있으면 기간만 늘린다) */
function addStatus(
  target: Combatant, kind: StatusKind, turns: number,
  events: BattleEvent[], turn: number, actorUid: string,
): void {
  const existing = target.statuses.find((s) => s.kind === kind);
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, turns);
  } else {
    target.statuses.push({ kind, remainingTurns: turns, magnitude: STATUS_MAGNITUDE[kind] });
  }
  events.push({ turn, type: 'statusApplied', actorUid, targetUids: [target.uid], status: kind });
}

function applyDamage(
  target: Combatant, amount: number, events: BattleEvent[], turn: number,
  actorUid?: string, isCrit?: boolean, affinity?: Affinity, trait?: Combatant['lineage'],
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
    // 특성이 없으면 키 자체를 싣지 않는다 — 특성 이전 로그와 글자 하나까지 같아야 한다
    ...(trait ? { trait } : {}),
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
