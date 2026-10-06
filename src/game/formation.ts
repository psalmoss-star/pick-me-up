/**
 * 편성 파생값 — 배치 정렬 · 속성 구성 · 자동 편성 후보.
 *
 * 전부 순수 함수이고 **표시와 조작 보조**에만 쓰인다.
 * 전투 엔진은 이 모듈을 모른다.
 */
import type {
  Element, GearBonus, HeroDef, HeroDefId, HeroInstance, HeroInstId, Skill, SkillId, Star, StarScaling,
} from './types';
import { heroPower } from './power';
import { canHeal, matchupOf, type EnemyKind, type Matchup } from './floorIntel';
import { ROLE_LINE, LINE_ORDER, RECOMMEND_MATCHUP_WEIGHT, type Line } from './data/formation';
import { TRAIT_BRIEF, TRAIT_NAME } from './data/traits';

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

/** 상성 보정 정렬 키 — 표시 보조일 뿐 전투에 안 닿는다 */
export function matchupScore(power: number, m: Matchup): number {
  return power * (1 + RECOMMEND_MATCHUP_WEIGHT * (m.strong - m.weak));
}

export interface Recommendation {
  ids: HeroInstId[];
  /** 영웅마다 왜 골랐는지 한 줄 */
  reasons: Record<HeroInstId, string>;
}

/**
 * 추천 편성 — 이미 편성된 영웅(`members`)은 두고 **남은 칸(`room`)만** 채운다.
 *
 * 1. 편성에 수호가 없으면 수호 1명(전투력 최고)
 * 2. 편성에 치유 스킬 보유자가 없으면 1명 — 역할이 아니라 스킬로 본다(`canHeal`)
 * 3. 나머지는 전투력 × 상성 보정(`matchupScore`) 순 — 이유는 상성, 아니면 계열 특성
 *
 * 수호·치유 우선의 근거는 엔진에 있다: 탱커가 단일 공격의 60%를 대신 맞고(`TANK_AGGRO`),
 * 도발 없는 파티는 치유자가 먼저 쓰러진다(HANDOFF 측정). 그 밖의 역할 균형은 맞추지 않는다.
 *
 * ⚠️ 고르기만 한다. 실제 편성은 호출부가 `toggleSquadMember`를 반복 호출해서 한다 —
 * 잠금·정원·중복 판정은 **스토어가 정본**이고, 여기서 다시 판정하면 두 곳으로 갈린다.
 */
export function recommendParty(args: {
  members: readonly HeroInstance[];
  candidates: readonly HeroInstance[];
  defs: Record<HeroDefId, HeroDef>;
  skills: Record<SkillId, Skill>;
  scaling: Record<Star, StarScaling>;
  room: number;
  kinds: readonly EnemyKind[];
  chart: Record<Element, Record<Element, number>>;
  bonusOfHero?: (h: HeroInstance) => GearBonus | undefined;
}): Recommendation {
  const { members, defs, skills, scaling, kinds, chart, bonusOfHero } = args;
  const ids: HeroInstId[] = [];
  const reasons: Record<HeroInstId, string> = {};
  let room = Math.max(0, args.room);

  const pool = args.candidates
    .filter((h) => !h.isDead && defs[h.defId])
    .map((h) => {
      const def = defs[h.defId];
      const power = heroPower(h, def, scaling, bonusOfHero?.(h));
      const m = matchupOf(def.element, kinds, chart);
      return { h, def, power, m, score: matchupScore(power, m) };
    });
  const partyDefs = members.map((h) => defs[h.defId]).filter(Boolean);
  const take = (x: (typeof pool)[number], reason: string) => {
    partyDefs.push(x.def);
    ids.push(x.h.instId);
    reasons[x.h.instId] = reason;
    pool.splice(pool.indexOf(x), 1);
    room--;
  };
  const strongest = (ok: (x: (typeof pool)[number]) => boolean) =>
    pool.filter(ok).sort((a, b) => b.power - a.power)[0];

  if (room > 0 && !partyDefs.some((d) => d.role === 'tank')) {
    const t = strongest((x) => x.def.role === 'tank');
    if (t) take(t, '수호 — 먼저 맞아 준다');
  }
  if (room > 0 && !partyDefs.some((d) => canHeal(d, skills))) {
    const t = strongest((x) => canHeal(x.def, skills));
    if (t) take(t, '치유 — 회복을 맡는다');
  }
  for (const x of [...pool].sort((a, b) => b.score - a.score)) {
    if (room <= 0) break;
    /*
      상성으로 뽑힌 것이 아니면 그 영웅의 **계열 특성**을 적는다(STEP 72). 예전의 "전투력 상위"는
      옆 칸의 숫자가 이미 말하는 것이라 이유가 되지 못했다. 고르는 기준(전투력 × 상성)은 그대로다 —
      바뀐 것은 문장뿐이다.
    */
    take(x, x.m.strong > 0
      ? `적 ${kinds.length}종 중 ${x.m.strong}종에 유리`
      : `${TRAIT_NAME[x.def.lineage]} — ${TRAIT_BRIEF[x.def.lineage]}`);
  }
  return { ids, reasons };
}
