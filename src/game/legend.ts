/**
 * 고유 전설 영웅 판정. gdd-v3 §4.11.
 *
 * ── 소환 난수를 밀지 않는다 ─────────────────────────────
 * 전설 여부와 누구인지는 **개체 시드의 전용 스트림**(`STREAM.LEGEND`)에서 굴린다.
 * 소환의 주 난수(rollStar → pickArchetype → rollHeroSeed → generateIdentity, §5-18)는
 * 전설 도입 전과 **한 개도 다르지 않게** 소비된다. 그래서 일반 개체의 잠재치·이름은
 * 전설이 생겨도 비트 단위로 같다(gacha.test.ts의 시드 회귀 테스트가 그대로 통과한다).
 *
 * ── 누가 나올 수 있나 ───────────────────────────────────
 * - 지금 로스터에 있는 전설은 안 나온다(사망자 포함 — 이름이 같으면 안 된다, §4.8).
 * - **봉인된 이름은 안 나온다.** 전설이 한 번 죽으면 모든 회차에서 다시 오지 않는다.
 * - 제물로 바친 전설은 로스터에서 빠지므로 다시 나올 수 있다(제물은 흡수다).
 */
import type { HeroInstance } from './types';
import { STREAM, rngPick, substream } from './rng';
import { LEGEND_BY_ID, type LegendDef, type LegendId } from './data/legends';

export function isLegendId(id: unknown): id is LegendId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(LEGEND_BY_ID, id);
}

/** 개체가 전설이면 그 정의. 모르는 id는 일반 개체로 읽는다 */
export function legendOf(inst: { legendId?: string }): LegendDef | null {
  return isLegendId(inst.legendId) ? LEGEND_BY_ID[inst.legendId] : null;
}

/** 지금 나올 수 있는 전설 — 로스터에 없고, 이름이 봉인되지 않은 자 */
export function availableLegends(
  table: readonly LegendDef[],
  roster: readonly HeroInstance[],
  sealed?: ReadonlySet<string>,
): LegendDef[] {
  const inRoster = new Set(roster.map((h) => h.legendId).filter((x): x is string => !!x));
  const names = new Set(roster.map((h) => h.name).filter((x): x is string => !!x));
  return table.filter((l) => !inRoster.has(l.id) && !names.has(l.name) && !sealed?.has(l.name));
}

/**
 * 이 ★5 개체가 전설인가. 아니면 null.
 * 후보가 없으면(전원 봉인·보유) 굴리지 않고 null — 그때는 평범한 ★5가 나온다.
 */
export function rollLegend(
  seed: number,
  available: readonly LegendDef[],
  share: number,
): LegendDef | null {
  if (available.length === 0) return null;
  const rng = substream(seed, STREAM.LEGEND);
  if (rng() >= share) return null;
  return rngPick(rng, available);
}
