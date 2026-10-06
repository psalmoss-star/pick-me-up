/**
 * 클래스 이름 — 계열 × 등급. **화면은 이 함수로만 클래스를 읽는다.**
 *
 * `klassFor(star)`(stats.ts)는 등급만 보는 옛 이름이고, `HeroInstance.klass`에
 * 저장되지만 아무도 읽지 않는다. 화면에서 그것을 다시 쓰면 계열이 사라진다.
 *
 * 표시 전용이다 — 전투는 계열을 모른다(data/lineages.ts 주석).
 */
import type { HeroDef, HeroDefId, Star } from './types';
import { klassFor } from './stats';
import { KLASS_BY_LINEAGE } from './data/lineages';

/**
 * defs 조회에 옵셔널 체이닝을 쓰는 이유는 `displayName`과 같다 —
 * save.ts가 defId를 도감과 대조하지 않아 유령 defId가 통과할 수 있다.
 */
export function klassName(
  defId: HeroDefId,
  star: Star,
  defs: Record<HeroDefId, HeroDef>,
): string {
  const lineage = defs[defId]?.lineage;
  return lineage ? KLASS_BY_LINEAGE[lineage][star] : klassFor(star);
}
