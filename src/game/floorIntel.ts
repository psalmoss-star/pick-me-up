/**
 * 편성 판단 보조 — 다음 층의 적 종류 · 상성 집계 · 역할 경고.
 *
 * 1차 셀프 테스트(2026-09-30): "역할은 전투에서 보이지만 출진 조합을 짤 때는 고려가 어려웠다."
 * 편성 화면에 판단 근거가 없었다 — 적 종류가 어디에도 안 보였다.
 *
 * 설계 원칙:
 * - 순수 함수. React·DOM 의존 없음. **전투 엔진은 이 모듈을 모른다**(표시 보조).
 * - ⚠️ **적 수를 돌려주지 않는다.** 종류(이름·속성·역할)는 참이고, 수·전력은 정찰 보고(STEP 60)만
 *   말한다(사용자 결정, 2026-09-30). 반환형에 count가 없어서 화면이 실수로 "적 5기"를 적을 수 없다.
 * - 상성은 기존 `elementChart`만 읽는다. 경고는 엔진에 실제로 있는 것만 말하고 **수치를 약속하지 않는다**.
 */
import type {
  Element, EnemyDef, EnemyDefId, HeroDef, HeroDefId, HeroInstance, Role, Skill, SkillId,
} from './types';
import type { FloorSpec } from './data/floors';

export interface EnemyKind {
  defId: EnemyDefId;
  name: string;
  element: Element;
  role: Role;
  isBoss: boolean;
}

/** 층에 나오는 적 종류 — 중복 제거, 등장 순서 유지. 모르는 id는 건너뛴다 */
export function enemyKindsOf(floor: FloorSpec, enemies: Record<EnemyDefId, EnemyDef>): EnemyKind[] {
  const seen = new Set<EnemyDefId>();
  const out: EnemyKind[] = [];
  for (const id of floor.enemyIds) {
    const e = enemies[id];
    if (!e || seen.has(id)) continue;
    seen.add(id);
    out.push({ defId: id, name: e.name, element: e.element, role: e.role, isBoss: e.isBoss });
  }
  return out;
}

export interface Matchup {
  /** 이 속성이 때릴 때 배수가 1보다 큰 적 종류 수 */
  strong: number;
  /** 적이 이 속성을 때릴 때 배수가 1보다 큰 적 종류 수 */
  weak: number;
}

export function matchupOf(
  element: Element,
  kinds: readonly EnemyKind[],
  chart: Record<Element, Record<Element, number>>,
): Matchup {
  let strong = 0;
  let weak = 0;
  for (const k of kinds) {
    if (chart[element][k.element] > 1) strong++;
    if (chart[k.element][element] > 1) weak++;
  }
  return { strong, weak };
}

/**
 * 치유할 수 있는가 — **역할이 아니라 스킬로** 판정한다.
 * 보조 역할에도 치유 스킬(`sk_mend`) 보유 영웅이 있다. 엔진은 `unlockStar`를 쓰지 않으므로 여기서도 안 본다.
 */
export function canHeal(def: HeroDef, skills: Record<SkillId, Skill>): boolean {
  return def.skillIds.some((id) => skills[id]?.effects.some((e) => e.kind === 'heal'));
}

export type CompositionWarning =
  /** 수호 없음 — 탱커가 단일 공격의 60%를 대신 맞는다(`battle.ts` TANK_AGGRO) */
  | { kind: 'noTank' }
  /** 치유 스킬 보유자 없음 — 회복은 포션뿐 */
  | { kind: 'noHealer' }
  /** 편성 절반 이상이 이 적 속성에게 약하다 */
  | { kind: 'weakMajority'; element: Element };

export function compositionWarnings(
  party: readonly HeroInstance[],
  heroDefs: Record<HeroDefId, HeroDef>,
  skills: Record<SkillId, Skill>,
  kinds: readonly EnemyKind[],
  chart: Record<Element, Record<Element, number>>,
): CompositionWarning[] {
  const defs = party.map((h) => heroDefs[h.defId]).filter((d): d is HeroDef => !!d);
  if (defs.length === 0) return [];

  const out: CompositionWarning[] = [];
  if (!defs.some((d) => d.role === 'tank')) out.push({ kind: 'noTank' });
  if (!defs.some((d) => canHeal(d, skills))) out.push({ kind: 'noHealer' });

  const enemyElements = [...new Set(kinds.map((k) => k.element))];
  for (const el of enemyElements) {
    const weakCount = defs.filter((d) => chart[el][d.element] > 1).length;
    if (weakCount * 2 >= defs.length) out.push({ kind: 'weakMajority', element: el });
  }
  return out;
}
