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
  STRATAGEM_TUNING, type StratagemCondition, type StratagemId,
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
}): number {
  const t = STRATAGEM_TUNING;
  const rel = args.partyAvgInt > 0 ? args.executorInt / args.partyAvgInt - 1 : 0;
  const resist = Math.min(t.resistMax, Math.max(0, args.resist));
  const p = args.base
    + t.intWeight * rel
    - (args.bossPresent ? t.bossInsight : 0)
    - t.resistStep * resist;
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
