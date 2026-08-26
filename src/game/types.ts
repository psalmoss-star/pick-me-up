/**
 * src/game/types.ts
 *
 * 게임 전체 도메인 모델.
 * 규칙: 이 파일은 React / DOM / 브라우저 API에 의존하지 않는다.
 */

// ============================================================
// 0. 기본 별칭 (원시 타입 혼동 방지)
// ============================================================

export type HeroDefId = string & { readonly __brand: 'HeroDefId' }; // 도감상 영웅 종류 ID
export type HeroInstId = string & { readonly __brand: 'HeroInstId' }; // 보유 중인 개별 영웅 ID
export type EnemyDefId = string & { readonly __brand: 'EnemyDefId' };
export type SkillId = string & { readonly __brand: 'SkillId' };
export type FloorId = number;
/** 장비 종류 ID (도감상 정의) */
export type GearDefId = string & { readonly __brand: 'GearDefId' };
/** 보유 중인 개별 장비 ID. 같은 종류라도 이 값이 다르면 다른 물건이다. */
export type GearInstId = string & { readonly __brand: 'GearInstId' };
/**
 * 제작 재료 종류 ID.
 *
 * 장비와 달리 **개체가 없다** — 같은 재료는 서로 구별되지 않으므로
 * 포션처럼 수량만 센다(`Record<MaterialId, number>`).
 */
export type MaterialId = string & { readonly __brand: 'MaterialId' };
/** 재료 등급. 드롭되는 층 깊이를 가른다 */
export type MaterialTier = 'common' | 'fine' | 'rare';
/** 보유 재료 — 종류별 수량. 없는 키는 0으로 읽는다 */
export type MaterialBag = Partial<Record<MaterialId, number>>;

/** 0.0 ~ 1.0 사이 난수를 반환. 시드 기반 구현을 주입한다. */
export type RNG = () => number;

// ============================================================
// 1. 공통 열거형
// ============================================================

export type Star = 1 | 2 | 3 | 4 | 5 | 6;

export type Element = 'fire' | 'water' | 'wind' | 'earth' | 'thunder';

export type Klass =
  | '초보자' | '견습병' | '정예병' | '기사' | '기사단장' | '영웅' | '초월';

export type Role = 'dealer' | 'tank' | 'healer' | 'support' | 'breaker';

export type TargetSide = 'ally' | 'enemy' | 'self';

export type TargetScope =
  | 'single'      // 단일
  | 'all'         // 전체
  | 'lowestHp'    // HP 비율 최저
  | 'highestAtk'  // 공격력 최고
  | 'random2';    // 무작위 2인

// ============================================================
// 2. 스탯
// ============================================================

/** 현재/최대 형식의 능력치. 레벨업으로 채우고, 승급으로 상한이 열린다. */
export interface Attribute {
  current: number;
  max: number;
}

export interface Attributes {
  str: Attribute; // 힘
  int: Attribute; // 지능
  vit: Attribute; // 체력
  agi: Attribute; // 민첩
}

export type AttrKey = keyof Attributes;

/** ★1 기준 능력치 상한. 승급 시 statMultiplier가 곱해진다. */
export type AttrCaps = Record<AttrKey, number>;

/** 전투에서 실제로 쓰이는 파생 스탯. Attributes에서 계산된다. */
export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;   // 턴 순서 결정
  crit: number;  // 0.0 ~ 1.0
}

/** 등급 승급 시 곱해지는 계수 (data/starScaling.json) */
export interface StarScaling {
  star: Star;
  maxLevel: number;
  statMultiplier: number;      // 기본 스탯에 곱
  promotionStones: number;     // 다음 등급 승급에 필요한 승급석
  requiresAwakening?: boolean; // ★5 → ★6 등, 각성석 필요 여부
  /**
   * 소환으로 얻은 개체의 시작 레벨.
   *
   * **승급(promote)에는 적용되지 않는다** — 승급은 Lv.1 리셋이 의도된 대가다
   * (gdd-v3 §3: "승급 직후는 이전보다 약하다. 버그가 아니라 설계다").
   * 근거와 실측은 `data/elements.ts`의 `starScaling` 주석에 있다.
   */
  summonLevel: number;
}

// ============================================================
// 3. 스킬 & 효과
// ============================================================

export type EffectKind =
  | 'damage'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'shield'
  | 'cleanse'
  | 'revive';

export type StatusKind =
  | 'atkUp' | 'atkDown'
  | 'defUp' | 'defDown'
  | 'spdUp' | 'spdDown'
  | 'poison' | 'stun' | 'burn';

export interface SkillEffect {
  kind: EffectKind;
  /** damage/heal: 시전자 스탯 대비 배율 (예: 1.8 = ATK의 180%) */
  power?: number;
  /** 어떤 스탯을 기준으로 계산할지 */
  scalesWith?: keyof Stats;
  /** buff/debuff일 때 부여할 상태 */
  status?: StatusKind;
  /** 상태 지속 턴 */
  duration?: number;
  /** 발동 확률 (미지정 시 1.0) */
  chance?: number;
}

export interface Skill {
  id: SkillId;
  name: string;
  description: string;
  /** passive는 전투 시작 시 1회 적용, active는 쿨다운마다 사용 */
  type: 'active' | 'passive';
  cooldown: number;      // 턴 단위. passive는 0
  targetSide: TargetSide;
  targetScope: TargetScope;
  effects: SkillEffect[];
  /** 이 스킬이 해금되는 등급 */
  unlockStar: Star;
}

// ============================================================
// 4. 영웅
// ============================================================

/** 영웅 "종류" 정의 — data/heroes.json. 불변. */
export interface HeroDef {
  id: HeroDefId;
  name: string;
  title: string;          // 이명 (예: "무너진 성벽의 파수꾼")
  lore: string;           // 출신 세계 설정
  baseStar: Star;         // 가챠에서 뽑힐 때의 최초 등급
  element: Element;
  role: Role;
  /** 공격력이 힘(str) 기반인지 지능(int) 기반인지 */
  attackAttr: 'str' | 'int';
  /** ★1 기준 능력치 상한. 승급마다 statMultiplier가 곱해진다. */
  baseCaps: AttrCaps;
  skillIds: SkillId[];
}

/** 플레이어가 실제로 보유한 개체. 변동 상태를 가진다. */
export interface HeroInstance {
  instId: HeroInstId;
  defId: HeroDefId;
  star: Star;
  klass: Klass;
  level: number;
  exp: number;
  /**
   * 개체 고유 이름. 소환 시 확정되고 이후 불변이다.
   *
   * 이름이 종류(HeroDef)가 아니라 개체에 붙는 이유는 위 원칙 그대로다 —
   * 같은 종류를 두 번 뽑아도 서로 다른 인물이어야 하고, 그게 화면에 보여야 한다.
   *
   * 시드에서 파생하지 않고 문자열로 저장하는 이유는 **유일성**이다.
   * "겹치면 안 된다"는 로스터 전역 제약이라 개체 시드만으로는 만족시킬 수 없고,
   * 충돌을 피하려 시드를 다시 굴리면 잠재치까지 바뀐다.
   *
   * 선택적인 이유는 이 필드 이전 세이브 때문 — 없으면 종류 이름으로 폴백한다
   * (identity.ts의 displayName이 그 유일한 관문이다).
   */
  name?: string;
  /** 개체 고유 이명. name과 함께 확정된다. 유일성 제약은 없다. */
  title?: string;
  /**
   * 개체 고유 시드. 잠재치 등 개체차의 근원이며, 파생값은 저장하지 않는다.
   *
   * 같은 defId·같은 등급이라도 이 값이 다르면 다른 영웅이다.
   * 퍼머데스가 무게를 가지려면 개체가 대체 불가능해야 하고, 그 대체 불가능성이 여기서 나온다.
   * 선택적인 이유는 이 필드 이전에 만들어진 세이브 때문 — 없으면 잠재 계수 0으로 취급한다.
   */
  seed?: number;
  /**
   * 능력치별 발굴 진행도 0~1. 전투에 내보내야 오른다.
   * 저장 대상(가변 상태)이며, 이 값에 따라 잠재치 추정 구간이 좁아진다.
   */
  revealProgress?: number;
  /**
   * 잃으면 아픈 개체라고 플레이어가 직접 찍은 표식.
   *
   * **게임 규칙이 아니라 UI 안전장치다.** 전투력·확률·밸런스 어디에도 들어가지 않는다 —
   * 들어가는 순간 "즐겨찾기를 찍는 게 이득"이 되어 표식이 취향이 아니라 최적화가 된다.
   * 하는 일은 제물 확인 창을 한 단계 더 세우는 것 하나뿐이다(`ForgeScreen.isPrecious`).
   *
   * 선택적인 이유는 이 필드 이전 세이브 때문 — 없으면 즐겨찾기 아님으로 읽는다.
   */
  favorite?: boolean;
  /** 던전 진행 중 유지되는 현재 HP (층 사이 자동회복 없음) */
  currentHp: number;
  /** 퍼머데스. true면 파티 편성 불가, 복구 불가. */
  isDead: boolean;
  acquiredAtFloor: FloorId;
  /**
   * 착용 중인 장비. 슬롯당 최대 1개.
   *
   * 영웅이 죽으면 여기 있던 장비는 **슬롯마다 따로** 회수 판정을 받는다
   * (`gear.ts`의 GEAR_TUNING.recoveryRate). 전부 돌려주면 죽음의 비용이 줄어
   * 퍼머데스가 희석되고, 전부 뺏으면 좋은 장비를 아무도 안 쓰게 된다.
   */
  gear?: Partial<Record<GearSlot, GearInstId>>;
}

// ============================================================
// 4.5 장비
// ============================================================

export type GearSlot = 'weapon' | 'armor' | 'trinket';

/**
 * 장비 등급. 영웅의 Star와 **일부러 다른 축**으로 둔다.
 * 같은 ★ 체계를 쓰면 "★5 무기 = ★5 영웅"으로 읽혀 소환의 의미가 흐려진다.
 */
export type GearRank = 'common' | 'fine' | 'rare' | 'relic';

/**
 * 장비가 주는 보정.
 *
 * Stats에 직접 더하지 않고 배수/가산을 분리해 들고 있는 이유는
 * 강화(+n)가 곱해질 자리를 남기기 위해서다.
 */
export interface GearBonus {
  /** 공격력 가산 */
  atk?: number;
  /** 최대 HP 가산 */
  hp?: number;
  /** 방어력 가산 */
  def?: number;
  /** 속도 가산 */
  spd?: number;
  /** 치명타 확률 가산 (0.05 = +5%p) */
  crit?: number;
}

/** 장비 종류 정의 (도감) */
export interface GearDef {
  id: GearDefId;
  name: string;
  slot: GearSlot;
  rank: GearRank;
  /** 강화 0단계 기준 보정치 */
  base: GearBonus;
  /** 상점 판매가(금). 상점에 안 파는 물건이면 생략 */
  price?: number;
  lore?: string;
}

/** 플레이어가 보유한 개별 장비 */
export interface GearInstance {
  instId: GearInstId;
  defId: GearDefId;
  /** 강화 단계. 0이 미강화. */
  enhance: number;
  /** 착용 중인 영웅. 창고에 있으면 null */
  equippedBy: HeroInstId | null;
}

// ============================================================
// 5. 적 & 층
// ============================================================

export interface EnemyDef {
  id: EnemyDefId;
  name: string;
  element: Element;
  role: Role;
  stats: Stats;           // 적은 레벨 개념 없이 층별로 고정 수치
  skillIds: SkillId[];
  isBoss: boolean;
}

/*
 * 층 정의(FloorDef/Encounter/FloorKind)는 여기 없다.
 *
 * 초기 설계는 "인카운터 배열 + 보상"이 중심이었는데, 실제 엔진은 임무 유형과
 * 보호 대상이 중심이라 모양이 아예 달랐다. 두 개가 공존하며 죽은 쪽이 오래 남아 있었다.
 * → 현행은 `data/floors.ts`의 **FloorSpec** 하나뿐이고, 보상은 `floorRewards()`가 계산한다.
 */

// ============================================================
// 6. 재화
// ============================================================

export interface Wallet {
  gold: number;
  gems: number;
  promotionStones: number;
  awakeningStones: number;
  /**
   * ⚠️ **부활권 — 쓰지 말 것.** 항상 0이고 소비 경로가 없다.
   *
   * 퍼머데스가 확정되기 전 설계의 잔재다. 이걸 실제로 구현하면
   * "사망한 영웅은 어떤 경로로도 되돌리지 않는다"는 이 게임의 축이 무너진다.
   * 필드를 남겨둔 것은 기존 세이브 호환 때문이며, 되살리라는 뜻이 아니다.
   */
  revivalTokens: number;
}

// ============================================================
// 7. 가챠
// ============================================================

export type BannerKind = 'free' | 'premium';

export interface GachaBanner {
  kind: BannerKind;
  /** 등급별 확률. 합은 반드시 1.0 */
  rates: Partial<Record<Star, number>>;
  cost: Partial<Wallet>;
  /** 천장: N회 누적 시 확정 등급 지급. 없으면 undefined */
  pity?: { count: number; guaranteedStar: Star };
}

export interface GachaState {
  /** 배너별 천장 카운터 */
  pityCounters: Record<BannerKind, number>;
  /** 무료 가챠 다음 사용 가능 시각 (epoch ms) */
  freeGachaReadyAt: number;
  totalPulls: number;
}

export interface GachaResult {
  heroInstance: HeroInstance;
  wasPity: boolean;
  /** 도감에 처음 등록되는 영웅인지 */
  isNewInCodex: boolean;
}

// ============================================================
// 8. 전투
// ============================================================

/** 전투 중에만 존재하는 유닛 (영웅/적 공통 뷰) */
export interface Combatant {
  uid: string;
  side: 'ally' | 'enemy';
  /** 아군이면 HeroInstId, 적이면 EnemyDefId 기반 */
  sourceId: string;
  name: string;
  element: Element;
  role: Role;
  stats: Stats;        // 버프/디버프 적용 전 최종 확정 스탯
  currentHp: number;
  shield: number;
  statuses: ActiveStatus[];
  cooldowns: Record<SkillId, number>;
  isAlive: boolean;
}

export interface ActiveStatus {
  kind: StatusKind;
  remainingTurns: number;
  magnitude: number;   // 예: 0.3 = 30% 증감
}

export interface BattleConfig {
  allies: HeroInstance[];
  floorId: FloorId;
  encounterIndex: number;
  rng: RNG;
  /** 무한루프 방지 */
  maxTurns: number;
}

export type BattleEventType =
  | 'turnStart'
  | 'skillUse'
  | 'damage'
  | 'heal'
  | 'statusApplied'
  | 'statusExpired'
  | 'death'
  | 'retreat'      // 마스터의 개입으로 한 턴 물러남
  | 'battleEnd';

/**
 * 속성 상성 결과 — **표시 전용 분류**.
 *
 * 상성 계수(유리 1.5 / 불리 0.7)는 예전에도 `computeDamage`가 계산했지만
 * 이벤트에 실리지 않아 화면에서 유리타와 불리타가 **완전히 동일하게** 보였다.
 * 데미지 계산은 그대로 두고 결과만 이름 붙여 내보낸다.
 */
export type Affinity = 'adv' | 'dis';

/** UI 재생용 로그. 전투 엔진은 이 배열을 반환하고 UI는 이를 애니메이션으로 재생. */
export interface BattleEvent {
  turn: number;
  type: BattleEventType;
  actorUid?: string;
  targetUids?: string[];
  skillId?: SkillId;
  amount?: number;
  status?: StatusKind;
  /** damage 이벤트 전용 — 치명타 여부. UI가 연출을 다르게 한다. */
  isCrit?: boolean;
  /**
   * damage 이벤트 전용 — 속성 상성. 중립이면 **없다**(표식을 달지 않는다).
   *
   * ⚠️ 표시 전용이다. 이 값을 보고 전투가 갈라지면 안 된다 —
   * 상성은 이미 `amount`에 반영돼 있고 여기 있는 것은 그 이유표뿐이다.
   */
  affinity?: Affinity;
  /**
   * heal 이벤트 전용 — 스킬이 아니라 포션으로 회복했는가.
   * 화면이 "누가 회복시켰나"가 아니라 "물약이 터졌다"로 읽어야 한다.
   */
  fromPotion?: boolean;
}

/*
 * 전투 결과(BattleResult)는 여기 없다 → `battle.ts`의 **BattleOutcome**이 정본이다.
 * 둘이 공존하던 시절 이쪽에만 `rewards`가 있었는데 엔진은 보상을 계산하지 않는다
 * (보상은 층이 정한다 — `floorRewards()`). 죽은 쪽을 지웠다.
 */

// ============================================================
// 9. 도감 — 런을 넘어 영구 저장
//
// 런 상태(RunState)와 메타 프로그레션(MetaState/Perk)은 **여기 없다.**
//   런 상태  → `stores/runStore.ts`의 RunSlice (저장 형태는 `stores/save.ts`가 고른다)
//   메타     → 미구현. 도입할 때 그때의 요구에 맞춰 새로 쓸 것
// 초기 설계 타입이 오래 남아 "이미 있는 기능"으로 오해되던 것을 걷어냈다.
// ============================================================

export interface CodexEntry {
  defId: HeroDefId;
  firstAcquiredAt: number;
  highestStarReached: Star;
  timesAcquired: number;
  timesLost: number;
}

/*
 * 저장 스냅샷(SaveGame)은 여기 없다 → `stores/save.ts`가 정본이다.
 * 정적 데이터 번들(GameData)도 여기 없다 → 엔진이 쓰는 것은 `battle.ts`의 **BattleData**이고,
 * 실제 번들은 `data/index.ts`의 `gameData`다.
 */
