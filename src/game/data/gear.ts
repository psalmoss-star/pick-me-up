/**
 * 장비 튜닝 + 도감.
 *
 * 밸런스 수치는 전부 여기 있고 코드에는 없다 (CLAUDE.md 아키텍처 규칙).
 *
 * ⚠️ 장비는 시설·잠재치와 같은 칼날이다 (HANDOFF §5-1).
 * 수치를 만졌으면 `npm run sim`과 `npx tsx climb-check.mts`를 둘 다 돌릴 것.
 *
 * ── 강도 기준 (실측, gear-probe) ────────────────────────────
 *   저층 파티 1인 평균: atk 114 / hp 633 / def 55
 *   중층 파티 1인 평균: atk 172 / hp 893 / def 80
 *
 * "보조적" = 3슬롯 full 착용 시 파티 전투력 +15~20%.
 * 잠재치 개체차(±8%)보다 크고 등급 차이보다 작아야 한다 —
 * 영웅이 주인공으로 남고 장비는 거들기만 한다.
 * 그래서 등급별로 저층용/중층용을 나눠 두고, 한 등급이 전 구간을 덮지 않게 했다.
 */
import type { GearDef, GearDefId, GearLine, GearRank, GearSlot } from '../types';
import { GEAR_LADDER } from './gearLadder';

export const GEAR_SLOTS: readonly GearSlot[] = ['weapon', 'armor', 'trinket'];

export const SLOT_LABEL: Record<GearSlot, string> = {
  weapon: '무기',
  armor: '방어구',
  trinket: '장신구',
};

/**
 * 등급 라벨 — 장비 사다리(2026-10-02) 뒤로 rank는 계열에서 정해진다
 * (보급=common, 정예=rare, 유물=relic). `fine`은 더 쓰지 않지만 타입이 요구해 남긴다.
 */
export const RANK_LABEL: Record<GearRank, string> = {
  common: '보급',
  fine: '정교',
  rare: '정예',
  relic: '유물',
};

/** 등급 순서 — 정렬·비교용 */
export const RANK_ORDER: Record<GearRank, number> = {
  common: 0, fine: 1, rare: 2, relic: 3,
};

/** 단계 수 — 10층마다 하나, 100층까지 */
export const TIER_COUNT = 10;
export const TIER_SPAN = 10;

/** 층 → 단계(1~10). 범위 밖은 양 끝으로 접는다 */
export function tierOf(floorId: number): number {
  return Math.min(TIER_COUNT, Math.max(1, Math.ceil(floorId / TIER_SPAN)));
}

export function tierFirstFloor(tier: number): number {
  return (tier - 1) * TIER_SPAN + 1;
}

export const LINE_LABEL: Record<GearLine, string> = {
  supply: '보급',
  elite: '정예',
  relic: '유물',
};

/** 화면 꼬리표 — "3단계 · 보급". 유물은 단계가 없다 */
export function gearTag(def: GearDef): string {
  return def.line === 'relic' ? LINE_LABEL.relic : `${def.tier}단계 · ${LINE_LABEL[def.line]}`;
}

export const GEAR_TUNING = {
  /**
   * 영웅 사망 시 착용 장비가 회수될 확률. **슬롯마다 독립 판정.**
   *
   * 0.5인 이유: 3슬롯이면 보통 한두 개만 돌아온다. 손실이 확실히 체감되면서도
   * 전멸이 곧 장비 전멸은 아니라 좋은 장비를 꺼내 쓸 수 있다.
   *   1.0 → 죽어도 장비는 남는다. 퍼머데스가 "영웅 갈아끼우기"로 희석된다.
   *   0.0 → 아무도 좋은 장비를 안 쓴다. 만들어놓고 창고에 재우는 게 최적이 된다.
   */
  recoveryRate: 0.5,

  /** 강화 최대 단계 */
  maxEnhance: 5,

  /**
   * 강화 1단계당 보정 증가율. base에 (1 + step*rate)가 곱해진다.
   * +5면 1.6배 — 등급 하나를 거의 따라잡되 넘지는 못하는 폭.
   */
  enhanceRate: 0.12,

  /** 강화 비용(금). 인덱스 = 올린 뒤 단계. */
  enhanceCost: [0, 120, 260, 460, 760, 1200] as readonly number[],

  /**
   * 강화 성공 확률. 인덱스 = 올린 뒤 단계.
   *
   * 실패해도 **단계가 내려가거나 파괴되지는 않는다.** 금만 잃는다.
   * 퍼머데스가 이미 이 게임의 상실 담당이다. 강화까지 파괴를 넣으면
   * 상실이 흔해져서 영웅을 잃는 무게가 오히려 줄어든다.
   */
  enhanceChance: [1, 1, 0.9, 0.75, 0.55, 0.35] as readonly number[],

  /** 층 돌파 시 장비가 떨어질 확률 */
  dropChance: 0.35,

  /** 보스 층은 드롭이 확정이다 — 대가를 크게 치르는 층이므로 */
  bossDropChance: 1,
} as const;

/**
 * 강화 단계를 반영한 보정 배수.
 * 여기가 단일 출처다 — 화면이 따로 계산하지 말 것 (HANDOFF §5-14).
 */
export function enhanceMult(enhance: number): number {
  const step = Math.max(0, Math.min(GEAR_TUNING.maxEnhance, Math.floor(enhance)));
  return 1 + step * GEAR_TUNING.enhanceRate;
}

/** 다음 강화 비용. 만강이면 null. */
export function enhanceCostOf(enhance: number): number | null {
  const next = enhance + 1;
  if (next > GEAR_TUNING.maxEnhance) return null;
  return GEAR_TUNING.enhanceCost[next];
}

/** 다음 강화 성공 확률. 만강이면 null. */
export function enhanceChanceOf(enhance: number): number | null {
  const next = enhance + 1;
  if (next > GEAR_TUNING.maxEnhance) return null;
  return GEAR_TUNING.enhanceChance[next];
}

const g = (id: string) => id as GearDefId;

/**
 * 장비 도감.
 *
 * common/fine은 저층(1인 atk 114) 기준, rare/relic은 중층(atk 172) 기준으로 잡았다.
 * 한 등급이 전 구간을 덮으면 저층에서 과하거나 중층에서 무의미해진다.
 *
 * relic은 **상점에 없다**(price 없음) — 제작·드롭·과제로만 나온다.
 * 금으로 최상급을 살 수 있으면 등반이 아니라 지갑이 강함을 정한다.
 *
 * 장비 사다리(2026-10-02): 기존 12종은 1·2단계와 유물이다 — common = 1단계 보급,
 * fine = 1단계 정예, rare = 2단계 정예. 2단계 이상의 나머지는 `gearLadder.ts`(생성)에서 온다.
 * id는 세이브에 남으므로 바꾸지 않는다.
 */
const LEGACY_DEFS: GearDef[] = ([
    // ── 무기 ──
    { id: 'w_chipped', name: '이 빠진 검', slot: 'weapon', rank: 'common', tier: 1, line: 'supply', base: { atk: 12 }, price: 220,
      lore: '누군가 끝까지 쥐고 있었던 자국이 남았다.' },
    { id: 'w_soldier', name: '병사의 장검', slot: 'weapon', rank: 'fine', tier: 1, line: 'elite', base: { atk: 22, crit: 0.02 } },
    { id: 'w_emberfang', name: '잿송곳니', slot: 'weapon', rank: 'rare', tier: 2, line: 'elite', base: { atk: 91, crit: 0.04 } }, // 사다리 2단계 정예에 맞춤(38 → 91, 2026-10-02)
    { id: 'w_towerbane', name: '탑을 베는 것', slot: 'weapon', rank: 'relic', tier: 0, line: 'relic', base: { atk: 56, crit: 0.07, spd: 4 },
      lore: '이름만 남고 주인은 남지 않았다.' },

    // ── 방어구 ──
    { id: 'a_tatter', name: '해진 가죽갑옷', slot: 'armor', rank: 'common', tier: 1, line: 'supply', base: { hp: 70, def: 6 }, price: 220 },
    { id: 'a_guard', name: '수비대 사슬갑옷', slot: 'armor', rank: 'fine', tier: 1, line: 'elite', base: { hp: 130, def: 12 } },
    { id: 'a_bulwark', name: '성벽 판금', slot: 'armor', rank: 'rare', tier: 2, line: 'elite', base: { hp: 230, def: 22, spd: -3 },
      lore: '무겁다. 그만큼 오래 버틴다.' },
    { id: 'a_ashshroud', name: '재의 장막', slot: 'armor', rank: 'relic', tier: 0, line: 'relic', base: { hp: 330, def: 34 } },

    // ── 장신구 ──
    { id: 't_charm', name: '닳은 부적', slot: 'trinket', rank: 'common', tier: 1, line: 'supply', base: { spd: 4, crit: 0.02 }, price: 220 },
    { id: 't_swift', name: '질풍의 고리', slot: 'trinket', rank: 'fine', tier: 1, line: 'elite', base: { spd: 9, crit: 0.03 } },
    { id: 't_bloodpact', name: '피의 서약', slot: 'trinket', rank: 'rare', tier: 2, line: 'elite', base: { atk: 36, crit: 0.06 } }, // 사다리 2단계 정예에 맞춤(18 → 36, 2026-10-02)
    { id: 't_lastlight', name: '마지막 불빛', slot: 'trinket', rank: 'relic', tier: 0, line: 'relic', base: { hp: 150, spd: 12, crit: 0.08 },
      lore: '꺼지기 직전이 가장 밝다.' },
  ] satisfies Array<Omit<GearDef, 'id'> & { id: string }>)
  .map((d) => ({ ...d, id: g(d.id) } as GearDef));

/** 사다리 비율 목표 — 단계 기준 파티가 한 벌을 입었을 때 파티 전투력 증가율 */
export const LADDER_TARGET = {
  supply: { goal: 0.15, lo: 0.12, hi: 0.18 },
  elite: { goal: 0.25, lo: 0.21, hi: 0.29 },
} as const;

/**
 * 단계 이름 어휘 — 2단계부터. 1단계와 2단계 정예는 기존 장비가 차지했다.
 * 구간(기슭·상층·심층·천층·정상)마다 두 단계씩이다.
 */
const TIER_WORD: Record<number, string> = {
  2: '관문', 3: '상층', 4: '바람벽', 5: '심층', 6: '잿물',
  7: '천층', 8: '구름결', 9: '정상', 10: '꼭대기',
};
const LINE_NOUN: Record<'supply' | 'elite', Record<GearSlot, string>> = {
  supply: { weapon: '보급 장검', armor: '보급 갑옷', trinket: '보급 부적' },
  elite: { weapon: '파수꾼의 검', armor: '파수꾼의 판금', trinket: '파수꾼의 인장' },
};

/** 2단계 이상 사다리 장비 — 수치는 생성 파일(`gearLadder.ts`)에서 온다 */
const LADDER_DEFS: GearDef[] = GEAR_LADDER.map((r) => ({
  id: g(`g_t${r.tier}_${r.line}_${r.slot}`),
  name: `${TIER_WORD[r.tier]} ${LINE_NOUN[r.line][r.slot]}`,
  slot: r.slot,
  rank: r.line === 'supply' ? 'common' : 'rare',
  tier: r.tier,
  line: r.line,
  base: r.base,
  ...(r.line === 'supply' ? { price: r.price } : {}),
}));

export const GEAR_DEFS: Record<GearDefId, GearDef> = Object.fromEntries(
  [...LEGACY_DEFS, ...LADDER_DEFS].map((d) => [d.id, d]),
) as Record<GearDefId, GearDef>;

/** 단계·계열의 한 벌 — [무기, 방어구, 장신구] 순. 빠진 슬롯은 건너뛴다 */
export function ladderSet(tier: number, line: 'supply' | 'elite'): GearDef[] {
  return GEAR_SLOTS
    .map((slot) => Object.values(GEAR_DEFS).find((d) => d.tier === tier && d.line === line && d.slot === slot))
    .filter((d): d is GearDef => !!d);
}

/**
 * 상점 재고 — 열린 단계까지의 **보급형**, 최신 단계 먼저.
 * 정예·유물은 팔지 않는다(정예는 보스·모험, 유물은 제작). 금으로 상위 장비를 살 수 있으면
 * 등반이 아니라 지갑이 강함을 정한다.
 */
export function shopStock(slot: GearSlot, unlockedTier: number): GearDef[] {
  return Object.values(GEAR_DEFS)
    .filter((d) => d.slot === slot && d.line === 'supply' && d.price != null && d.tier <= unlockedTier)
    .sort((a, b) => b.tier - a.tier);
}

/** 다음에 열릴 보급형 단계와 그 층. 마지막 단계면 null */
export function nextShopTier(unlockedTier: number): { tier: number; floor: number } | null {
  const tier = unlockedTier + 1;
  return tier > TIER_COUNT ? null : { tier, floor: tierFirstFloor(tier) };
}

/** 최전선 층 번호 → 열린 단계 */
export function unlockedTierOf(maxFloorId: number): number {
  return tierOf(maxFloorId);
}

// ------------------------------------------------------------
// 포션 — 소모품
// ------------------------------------------------------------

/**
 * 포션은 **전투 전에 지급**하고 전투 중 자동 발동한다.
 *
 * 개입 슬롯(집중/수호/후퇴)에 넣지 않은 이유: 개입은 횟수가 제한된 선택이라
 * 거기에 회복을 끼우면 전술 선택이 회복에 밀려 희석된다.
 * 층 사이 즉시 회복으로 하지 않은 이유: 숙소(층간 회복)와 역할이 정면으로 겹친다.
 *
 * 전투 전 지급은 "입력"이므로 재현성도 유지된다 — 같은 시드 + 같은 지급 = 같은 결과.
 */
export const POTION_TUNING = {
  /** 최대 HP 대비 회복 비율 */
  healRatio: 0.4,
  /**
   * 이 비율 이하로 떨어지면 발동한다.
   *
   * 0.35인 이유: 한 대 더 맞으면 죽는 구간에서 터져야 의미가 있다.
   * 너무 높으면 멀쩡할 때 낭비되고, 너무 낮으면 발동 전에 죽는다.
   */
  triggerAt: 0.35,
  /** 개당 가격(금) */
  price: 150,
  /** 한 전투에 파티 전체가 들고 갈 수 있는 최대 개수 */
  maxPerBattle: 3,
} as const;

/** 드롭 후보 — 상점에 없는 유물까지 포함한다 */
export function dropTable(): GearDef[] {
  return Object.values(GEAR_DEFS);
}

/**
 * 층 깊이에 따른 드롭 등급 가중치.
 * 저층에서 유물이 나오면 이후 등반이 무의미해지므로 깊이로 잠근다.
 */
export function dropWeights(floorId: number): Record<GearRank, number> {
  if (floorId <= 3) return { common: 70, fine: 30, rare: 0, relic: 0 };
  if (floorId <= 6) return { common: 40, fine: 45, rare: 15, relic: 0 };
  if (floorId <= 9) return { common: 15, fine: 40, rare: 40, relic: 5 };
  return { common: 5, fine: 25, rare: 50, relic: 20 };
}
