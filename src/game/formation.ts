/**
 * 편성 파생값 — 배치 정렬 · 속성 구성 · 자동 편성 후보.
 *
 * 전부 순수 함수이고 **표시와 조작 보조**에만 쓰인다.
 * 전투 엔진은 이 모듈을 모른다.
 */
import type {
  Element, GearBonus, HeroDef, HeroDefId, HeroInstance, HeroInstId, Star, StarScaling,
} from './types';
import { heroPower } from './power';
import { ROLE_LINE, LINE_ORDER, type Line } from './data/formation';

export interface FormationSlot {
  hero: HeroInstance;
  line: Line;
  power: number;
}

/** 역할 → 배치 */
export function lineOf(def: HeroDef): Line {
  return ROLE_LINE[def.role];
}

/**
 * 편성원을 배치 순(전위 → 중위 → 후위)으로 정렬한다.
 * 같은 줄 안에서는 전투력 내림차순.
 */
export function formationOf(
  members: readonly HeroInstance[],
  defs: Record<HeroDefId, HeroDef>,
  scaling: Record<Star, StarScaling>,
  bonusOfHero?: (h: HeroInstance) => GearBonus | undefined,
): FormationSlot[] {
  return members
    .map((hero) => {
      const def = defs[hero.defId];
      return {
        hero,
        line: lineOf(def),
        power: heroPower(hero, def, scaling, bonusOfHero?.(hero)),
      };
    })
    .sort((a, b) => {
      const d = LINE_ORDER.indexOf(a.line) - LINE_ORDER.indexOf(b.line);
      return d !== 0 ? d : b.power - a.power;
    });
}

/**
 * 파티의 속성 구성 — 속성별 인원수.
 *
 * ⚠️ **배수·보너스를 돌려주지 않는다. 집계만 한다.**
 * 이 게임에는 파티 단위 속성 시너지가 **없다** — 상성표(`elementChart`)는
 * 공격자↔방어자 1:1로만 적용된다(`battle.ts`). 여기서 "+12%" 같은 값을
 * 만들어 내보내면 화면이 존재하지 않는 이득을 약속하게 된다.
 * (`formation.test.ts`가 이 계약을 잠근다.)
 */
export function elementSpread(
  members: readonly HeroInstance[],
  defs: Record<HeroDefId, HeroDef>,
): { element: Element; count: number }[] {
  const tally = new Map<Element, number>();
  for (const h of members) {
    const el = defs[h.defId]?.element;
    if (!el) continue;
    tally.set(el, (tally.get(el) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([element, count]) => ({ element, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 자동 편성 후보 — 살아있는 영웅 중 전투력 상위 `limit`명.
 *
 * ⚠️ 고르기만 한다. 실제 편성은 호출부가 `toggleSquadMember`를 반복 호출해서 한다 —
 * 잠금·정원·중복 판정은 **스토어가 정본**이고, 여기서 다시 판정하면 두 곳으로 갈린다.
 *
 * 역할 균형(탱1 힐1 같은 것)은 맞추지 않는다. 그건 밸런스 설계 영역이다.
 */
export function pickAutoParty(
  candidates: readonly HeroInstance[],
  defs: Record<HeroDefId, HeroDef>,
  scaling: Record<Star, StarScaling>,
  limit: number,
  bonusOfHero?: (h: HeroInstance) => GearBonus | undefined,
): HeroInstId[] {
  return candidates
    .filter((h) => !h.isDead)
    .map((h) => ({ h, p: heroPower(h, defs[h.defId], scaling, bonusOfHero?.(h)) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, Math.max(0, limit))
    .map((x) => x.h.instId);
}
