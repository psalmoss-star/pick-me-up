/**
 * 책략 판정 — 언제 쓰는가, 누가 쓰는가, 성공 확률은 얼마인가.
 *
 * 설계 원칙 (`orders.ts`·`prep.ts`와 같다):
 * - 이 파일은 순수하다. React/DOM 의존 없음. **RNG를 받지 않는다** — 굴리는 것은 엔진이다.
 * - 책략은 **전투 입력**이다. 카드를 안 들고 가면 엔진은 현행과 비트 단위로 같다
 *   (`ordersBaseline.test.ts`).
 * - 효과 적용은 `battle.ts`가 한다 — 피해·상태이상 헬퍼가 거기 있고, 두 곳에 두면 갈라진다.
 */
import type { Combatant } from './types';
import {
  STRATAGEMS, STRATAGEM_BY_ID, STRATAGEM_SLOTS, STRATAGEM_TUNING,
  type StratagemCondition, type StratagemId,
} from './data/stratagems';

/** 판정에 필요한 전장 상태 — 엔진이 매 턴 만들어 넘긴다 */
export interface FieldView {
  turn: number;
  /** 전장에 남은(살아 있고 이탈하지 않은) 아군 영웅 */
  heroes: Combatant[];
  /** 살아 있는 적 */
  enemies: Combatant[];
  /** 살아 있는 적 중에 보스가 있는가 */
  bossPresent: boolean;
}

const hpRatioSum = (units: Combatant[]) => {
  const max = units.reduce((a, u) => a + u.stats.hp, 0);
  return max === 0 ? 0 : units.reduce((a, u) => a + u.currentHp, 0) / max;
};

/** 조건이 맞는가. 아군이나 적이 없으면 언제나 false */
export function conditionMet(c: StratagemCondition, v: FieldView): boolean {
  if (v.heroes.length === 0 || v.enemies.length === 0) return false;
  switch (c.kind) {
    case 'allyHpBelow':
      return v.heroes.some((h) => h.currentHp / h.stats.hp <= c.ratio);
    case 'outnumbered':
      return v.enemies.length > v.heroes.length;
    case 'swarmLosing':
      return v.enemies.length >= c.minEnemies && hpRatioSum(v.heroes) < hpRatioSum(v.enemies);
    case 'longBattle':
      return v.turn >= c.turn;
    case 'desperate':
      return v.heroes.length * 2 <= v.enemies.length || hpRatioSum(v.heroes) <= c.ratio;
    case 'bigBattle':
      return (v.enemies.length >= c.minEnemies || v.bossPresent) && v.turn >= c.turn;
  }
}

/**
 * 수행자(책사) — 지능이 가장 높은 영웅. 같으면 먼저 선 영웅(편성 순서).
 * @param intOf 영웅 uid → 지능(현재값). 엔진이 셋업 때 계산해 둔다
 */
export function pickExecutor(
  heroes: Combatant[],
  intOf: (uid: string) => number,
): Combatant | null {
  if (heroes.length === 0) return null;
  return heroes.reduce((a, b) => (intOf(b.uid) > intOf(a.uid) ? b : a));
}

/**
 * 성공 확률. 파티 평균 대비 수행자의 지능 · 보스의 통찰 · 같은 책략의 반복(내성).
 */
export function successChance(args: {
  base: number;
  executorInt: number;
  partyAvgInt: number;
  bossPresent: boolean;
  resist: number;
  /** 접점 지형 보정(`terrainModifier`). 생략하면 0 — 맵 이전과 같다 */
  terrain?: number;
}): number {
  const t = STRATAGEM_TUNING;
  const rel = args.partyAvgInt > 0 ? args.executorInt / args.partyAvgInt - 1 : 0;
  const resist = Math.min(t.resistMax, Math.max(0, args.resist));
  const p = args.base
    + t.intWeight * rel
    - (args.bossPresent ? t.bossInsight : 0)
    - t.resistStep * resist
    + (args.terrain ?? 0);
  return Math.min(t.maxChance, Math.max(t.minChance, p));
}

/**
 * 층을 넘긴 뒤의 내성 갱신 — **스토어가 부른다.** 쓴 책략은 +1(상한), 안 쓴 책략은 −1(0 하한).
 * "쓴" = 이번 전투에서 **실제로 발동한** 책략. 들고만 가고 조건이 안 맞았으면 적은 모른다.
 */
export function nextResist(
  prev: Partial<Record<StratagemId, number>>,
  used: StratagemId[],
): Partial<Record<StratagemId, number>> {
  const out: Partial<Record<StratagemId, number>> = {};
  const usedSet = new Set(used);
  const ids = new Set<StratagemId>([...(Object.keys(prev) as StratagemId[]), ...used]);
  for (const id of ids) {
    const v = usedSet.has(id)
      ? Math.min(STRATAGEM_TUNING.resistMax, (prev[id] ?? 0) + 1)
      : Math.max(0, (prev[id] ?? 0) - 1);
    if (v > 0) out[id] = v;
  }
  return out;
}

// ------------------------------------------------------------
// 해금·장착 — 스토어와 화면이 쓴다
// ------------------------------------------------------------

/**
 * 해금 여부. `maxFloorReached`는 **인덱스**다 — 5층(인덱스 4)을 깨면 5가 된다.
 * 그래서 "n층을 깼다" ⇔ `maxFloorReached >= n`. 해금은 저장하지 않고 진행도에서 파생한다.
 */
export function isStratagemUnlocked(id: StratagemId, maxFloorReached: number): boolean {
  const def = STRATAGEM_BY_ID[id];
  return !!def && (def.unlockFloor === 0 || maxFloorReached >= def.unlockFloor);
}

export function unlockedStratagems(maxFloorReached: number): StratagemId[] {
  return STRATAGEMS.filter((s) => isStratagemUnlocked(s.id, maxFloorReached)).map((s) => s.id);
}

/** 새 런의 기본 장착 — 처음부터 쓸 수 있는 카드로 슬롯을 채운다 */
export function defaultLoadout(): StratagemId[] {
  return unlockedStratagems(0).slice(0, STRATAGEM_SLOTS);
}

/** 저장본의 장착 검증 — 모르는·잠긴·중복 카드는 빼고 슬롯 수로 자른다 */
export function sanitizeLoadout(raw: unknown, maxFloorReached: number): StratagemId[] {
  if (!Array.isArray(raw)) return defaultLoadout();
  const out: StratagemId[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const id = v as StratagemId;
    if (!isStratagemUnlocked(id, maxFloorReached) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= STRATAGEM_SLOTS) break;
  }
  return out;
}

/** 저장본의 내성 검증 — 0~상한 정수, 모르는 책략은 버린다 */
export function sanitizeResist(raw: unknown): Partial<Record<StratagemId, number>> {
  const out: Partial<Record<StratagemId, number>> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!STRATAGEM_BY_ID[k as StratagemId]) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const n = Math.max(0, Math.min(STRATAGEM_TUNING.resistMax, Math.floor(v)));
    if (n > 0) out[k as StratagemId] = n;
  }
  return out;
}
