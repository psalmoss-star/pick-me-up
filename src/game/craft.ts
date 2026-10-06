/**
 * 제작 — 재료를 장비로 바꾼다. 순수 함수(React 의존 X).
 *
 * ── 왜 실패가 없는가 ────────────────────────────────────
 * 강화(`gear.ts`)는 실패해도 **파괴되지 않고 금만 잃는다.** 그 주석의 근거는
 * "퍼머데스가 이 게임의 유일한 상실이어야 한다"였다.
 *
 * 제작은 거기서 한 걸음 더 간다 — **확률 자체가 없다.**
 * 재료는 층을 여러 번 돌파해서 모으는 자원이라, 여기에 실패를 넣으면
 * 열 층의 성과가 난수 한 번에 사라진다. 그건 강화의 금 손실과 무게가 다르다.
 * 비용이 곧 난이도이고, 난수는 수급 쪽(드롭)에 이미 들어 있다.
 *
 * 그래서 이 모듈은 **RNG를 받지 않는다.** 인자에 RNG가 등장하면 그 순간
 * 위 결정이 뒤집힌 것이다.
 */
import type { GearDef, GearDefId, GearInstance, MaterialBag } from './types';
import { GEAR_DEFS, relicNext, tierFirstFloor } from './data/gear';
import { RECIPE_BY_GEAR, refineCostOf, type RecipeDef } from './data/recipes';
import { makeGear } from './gear';

export type CraftFailReason =
  | 'no-recipe'
  | 'locked'
  | 'not-enough-materials'
  | 'not-enough-gold';

export type CraftResult =
  | { ok: true; gear: GearInstance; spentMaterials: MaterialBag; spentGold: number }
  | { ok: false; reason: CraftFailReason; missing?: MaterialBag; missingGold?: number };

/** 주머니에서 수량을 읽는다. 없는 키는 0 */
export function amountOf(bag: MaterialBag, id: keyof MaterialBag): number {
  return bag[id] ?? 0;
}

/**
 * 레시피에 대해 부족한 재료만 추린다.
 *
 * 화면이 "무엇이 얼마나 모자란가"를 그대로 쓸 수 있어야 한다 —
 * `ForgeScreen`의 승급 실패 문구가 `missing`을 그렇게 쓰고 있다.
 */
export function missingFor(recipe: Pick<RecipeDef, 'cost'>, have: MaterialBag): MaterialBag {
  const missing: MaterialBag = {};
  for (const [id, need] of Object.entries(recipe.cost) as [keyof MaterialBag, number][]) {
    const short = need - amountOf(have, id);
    if (short > 0) missing[id] = short;
  }
  return missing;
}

/** 재료 주머니에서 비용을 뺀다. 원본을 바꾸지 않는다 */
export function spendMaterials(have: MaterialBag, cost: MaterialBag): MaterialBag {
  const out: MaterialBag = { ...have };
  for (const [id, n] of Object.entries(cost) as [keyof MaterialBag, number][]) {
    if (!n) continue;
    const left = amountOf(out, id) - n;
    /*
      0이 된 키는 지운다 — 남겨두면 화면이 "무쇠 조각 0"을 재료 목록에
      계속 띄운다. 주머니는 "가진 것"만 담는다(`mergeMaterials`와 대칭).
    */
    if (left > 0) out[id] = left;
    else delete out[id];
  }
  return out;
}

export interface CraftArgs {
  gearDefId: GearDefId;
  have: MaterialBag;
  gold: number;
  highestFloor: number;
}

export type CraftCheck =
  | { ok: true; recipe: RecipeDef }
  | { ok: false; reason: CraftFailReason; missing?: MaterialBag; missingGold?: number };

/**
 * 만들 수 있는가 — 버튼 활성·부족분 표시에 쓴다.
 *
 * `craft`가 이 함수를 그대로 호출한다. 판정이 두 벌이면 화면이
 * "만들 수 있다"고 하는데 눌러보면 실패하는 어긋남이 생긴다.
 */
export function canCraft(args: CraftArgs): CraftCheck {
  const { gearDefId, have, gold, highestFloor } = args;

  const recipe = RECIPE_BY_GEAR[gearDefId];
  if (!recipe || !GEAR_DEFS[gearDefId]) return { ok: false, reason: 'no-recipe' };
  if (highestFloor < recipe.unlockFloor) return { ok: false, reason: 'locked' };

  const missing = missingFor(recipe, have);
  if (Object.keys(missing).length > 0) {
    return { ok: false, reason: 'not-enough-materials', missing };
  }
  if (gold < recipe.gold) {
    return { ok: false, reason: 'not-enough-gold', missingGold: recipe.gold - gold };
  }
  return { ok: true, recipe };
}

/**
 * 제작. 상태를 바꾸지 않고 **결과만 돌려준다** —
 * 소유 갱신은 스토어 한 곳에서 한다(`gear.ts`의 `equip`과 같은 규칙).
 *
 * @param seq 새 장비에 붙일 번호. 호출자가 발번한다(`makeGear`와 같음)
 */
export function craft(args: CraftArgs & { seq: number }): CraftResult {
  const r = canCraft(args);
  if (!r.ok) return r;

  return {
    ok: true,
    gear: makeGear(args.gearDefId, args.seq),
    spentMaterials: r.recipe.cost,
    spentGold: r.recipe.gold,
  };
}

// ------------------------------------------------------------
// 재련 — 유물의 단계를 하나 올린다
// ------------------------------------------------------------

export type RefineFailReason =
  | 'not-relic'
  | 'max-tier'
  | 'locked'
  | 'not-enough-materials'
  | 'not-enough-gold';

export interface RefineArgs {
  gear: GearInstance;
  have: MaterialBag;
  gold: number;
  /** 도달한 최고 층 — 지금 고른 층이 아니다(제작과 같다) */
  highestFloor: number;
}

export type RefineCheck =
  | { ok: true; next: GearDef; cost: MaterialBag; gold: number }
  | {
    ok: false;
    reason: RefineFailReason;
    /** 다음 단계가 있으면 실패해도 싣는다 — 화면이 "무엇이 되는가"를 그린다 */
    next?: GearDef;
    /** locked일 때 그 단계가 열리는 층 */
    unlockFloor?: number;
    missing?: MaterialBag;
    missingGold?: number;
  };

export type RefineResult =
  | { ok: true; gear: GearInstance; spentMaterials: MaterialBag; spentGold: number }
  | Extract<RefineCheck, { ok: false }>;

/**
 * 재련할 수 있는가.
 *
 * 판정 순서: 유물인가 → 다음 단계가 있는가 → 층이 열렸는가 → 재료 → 금.
 * 잠금이 재료보다 먼저다 — 못 여는 단계의 부족분을 띄우면 모아도 못 올리는 것을 모으게 된다.
 *
 * ⚠️ 제작과 같은 이유로 **RNG를 받지 않는다**(파일 머리 주석).
 */
export function canRefine(args: RefineArgs): RefineCheck {
  const { gear, have, gold, highestFloor } = args;

  const def = GEAR_DEFS[gear.defId];
  if (!def || def.line !== 'relic') return { ok: false, reason: 'not-relic' };

  const nextId = relicNext(gear.defId);
  const next = nextId ? GEAR_DEFS[nextId] : undefined;
  if (!next) return { ok: false, reason: 'max-tier' };

  const unlockFloor = tierFirstFloor(next.tier);
  if (highestFloor < unlockFloor) return { ok: false, reason: 'locked', next, unlockFloor };

  const price = refineCostOf(next.slot, next.tier);
  const missing = missingFor(price, have);
  if (Object.keys(missing).length > 0) {
    return { ok: false, reason: 'not-enough-materials', next, missing };
  }
  if (gold < price.gold) {
    return { ok: false, reason: 'not-enough-gold', next, missingGold: price.gold - gold };
  }
  return { ok: true, next, cost: price.cost, gold: price.gold };
}

/**
 * 재련. 상태를 바꾸지 않고 **결과만 돌려준다**(`craft`와 같다).
 *
 * 바뀌는 것은 `defId` 하나다 — 같은 물건이므로 instId·강화·착용자는 그대로다.
 * 그래서 착용 중에도 재련할 수 있고, 영웅이 들고 있는 참조(instId)는 손댈 필요가 없다.
 */
export function refine(args: RefineArgs): RefineResult {
  const r = canRefine(args);
  if (!r.ok) return r;
  return {
    ok: true,
    gear: { ...args.gear, defId: r.next.id },
    spentMaterials: r.cost,
    spentGold: r.gold,
  };
}
