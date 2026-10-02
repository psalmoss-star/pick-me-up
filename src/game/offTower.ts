/**
 * 탑 밖의 정산 — 훈련소 유휴 exp와 모험 귀환(2026-10-02, 1차 셀프 테스트 지적 3번).
 *
 * ⚠️ **`finish()`와 결과 화면이 이 함수 하나를 같이 쓴다.** 결과 화면은 `finish()`보다
 * 먼저 뜨므로 예전에는 화면이 정산을 따로 다시 계산했고, 그 사본이 실제와 갈라져
 * "파견자가 훈련으로 올랐다"·"모험으로 오른 레벨이 안 보인다"가 났다.
 * `resolveScout`·`questRng`와 같은 이유로 정산식을 여기 가둔다.
 *
 * 규칙은 이 분리 전 `finish()`와 비트 단위로 같다:
 *   - 훈련소: 미참전·생존·비파견·비배치, 돌파했을 때만(gdd-v3 §4.5)
 *   - 모험: 승패 무관, 로스터에 남은 인원만, exp → 부상(HP 하한 1)
 * 파견자는 출전하지 못하므로(`dispatch.test.ts`가 잠근다) 참전 영웅은 여기서 다루지 않는다.
 */
import {
  adventureRng, dispatchedHeroIds, isComplete, resolveAdventure,
  type AdventureOutcome,
} from './adventure';
import { ADVENTURE_BY_ID, type Dispatch } from './data/adventures';
import { idleExpWithAssign } from './data/facilities';
import { gameData } from './data';
import { gainExp } from './progression';
import { statsOfInstance } from './stats';
import { mergeMaterials } from './loot';
import type { HeroInstId, HeroInstance, MaterialBag } from './types';

export interface HeroGain {
  instId: HeroInstId;
  /** 이번에 받은 exp — 훈련소 유휴 또는 모험 1인당 */
  exp: number;
  /** 표시용 — 레벨·exp 바의 시작점 */
  before: HeroInstance;
  /** 정산 뒤(exp·부상 반영) */
  after: HeroInstance;
}

export interface AdventureReturn {
  dispatch: Dispatch;
  outcome: AdventureOutcome;
  /** 로스터에 남아 있던 인원만 */
  heroes: HeroGain[];
}

export interface AdventureProgress {
  dispatch: Dispatch;
  /** 이번 전투까지 지난 전투 수 */
  done: number;
  duration: number;
}

export interface OffTowerInput {
  roster: readonly HeroInstance[];
  dispatches: readonly Dispatch[];
  /** 배치된 전원 — 유휴 exp에서 뺀다 */
  assignedIds: ReadonlySet<string>;
  /** 훈련소 배치 명단 */
  trainingAssigned: readonly string[];
  trainingLevel: number;
  /** **증가 전** 값 */
  battleCount: number;
  seed: number;
  fought: ReadonlySet<string>;
  casualties: ReadonlySet<string>;
  cleared: boolean;
}

export interface OffTowerResult {
  idleExp: number;
  trainees: HeroGain[];
  returned: AdventureReturn[];
  /** 이번 전투 뒤에도 나가 있는 원정 */
  away: AdventureProgress[];
  stillAway: Dispatch[];
  outcomes: AdventureOutcome[];
  materials: MaterialBag;
  awakeningStones: number;
  /** 정산 뒤 영웅(훈련생·귀환자만). `finish()`가 그대로 끼운다 */
  after: Map<HeroInstId, HeroInstance>;
}

export function settleOffTower(input: OffTowerInput): OffTowerResult {
  const {
    roster, dispatches, assignedIds, trainingAssigned, trainingLevel,
    battleCount, seed, fought, casualties, cleared,
  } = input;

  // 출전한 배치자는 그 층 산출에서 빠진다 — "전투력과 생산의 제로섬"(설계 §5-2)
  const workingTrainees = trainingAssigned
    .filter((id) => !fought.has(id) && !casualties.has(id)).length;
  const idleExp = cleared ? idleExpWithAssign(trainingLevel, workingTrainees) : 0;

  /*
    완료 판정은 **증가 후** 전투 수로 한다 — `finish()`가 battleCount + 1을
    저장하므로, 그래야 "N전투짜리 모험이 N번째 전투 직후에 끝난다"가 성립한다.
  */
  const next = battleCount + 1;
  const settled = dispatches.filter((d) => isComplete(d, next));
  const stillAway = dispatches.filter((d) => !isComplete(d, next));
  const outcomes = settled.map((d) => resolveAdventure({
    dispatch: d,
    heroes: roster.filter((h) => !h.isDead && d.heroIds.includes(h.instId)),
    rng: adventureRng(seed, d.advId, d.startedAtBattle),
  }));

  const advExp = new Map<string, number>();
  const advInjury = new Map<string, number>();
  for (const o of outcomes) {
    for (const id of o.heroIds) {
      if (o.expEach > 0) advExp.set(id, (advExp.get(id) ?? 0) + o.expEach);
      if (o.injuryRatio > 0) advInjury.set(id, Math.max(advInjury.get(id) ?? 0, o.injuryRatio));
    }
  }
  /** 이번 전투 시점에 나가 있던 인원 — 유휴 exp와 모험 exp를 둘 다 받으면 파견이 순이득이 된다 */
  const awayNow = dispatchedHeroIds(dispatches);

  const after = new Map<HeroInstId, HeroInstance>();
  const trainees: HeroGain[] = [];
  for (const h of roster) {
    if (h.isDead || fought.has(h.instId)) continue;
    let cur = h;
    const trains = idleExp > 0 && !awayNow.has(h.instId) && !assignedIds.has(h.instId);
    if (trains) cur = gainExp(cur, idleExp, gameData.starScaling).hero;

    const gained = advExp.get(h.instId);
    if (gained) cur = gainExp(cur, gained, gameData.starScaling).hero;

    const ratio = advInjury.get(h.instId);
    if (ratio) {
      const max = statsOfInstance(cur, gameData.heroes[cur.defId], gameData.starScaling).hp;
      // ⚠️ currentHp === 0은 "만피"라는 뜻이지 빈사가 아니다(freshHero 주석)
      const base = cur.currentHp === 0 ? max : cur.currentHp;
      // 최소 1은 남긴다 — 모험에서는 죽지 않는다(사용자 결정)
      cur = { ...cur, currentHp: Math.max(1, base - Math.round(max * ratio)) };
    }

    if (cur !== h) after.set(h.instId, cur);
    if (trains) trainees.push({ instId: h.instId, exp: idleExp, before: h, after: cur });
  }

  const byId = new Map(roster.map((h) => [h.instId as string, h]));
  const returned: AdventureReturn[] = settled.map((d, i) => ({
    dispatch: d,
    outcome: outcomes[i],
    heroes: d.heroIds
      .map((id) => byId.get(id))
      .filter((h): h is HeroInstance => !!h && !h.isDead && !fought.has(h.instId))
      .map((h) => ({
        instId: h.instId,
        exp: outcomes[i].expEach,
        before: h,
        after: after.get(h.instId) ?? h,
      })),
  }));

  const away: AdventureProgress[] = stillAway.map((d) => {
    const duration = ADVENTURE_BY_ID[d.advId]?.duration ?? 0;
    return { dispatch: d, done: Math.min(duration, Math.max(0, next - d.startedAtBattle)), duration };
  });

  return {
    idleExp,
    trainees,
    returned,
    away,
    stillAway,
    outcomes,
    materials: outcomes.reduce<MaterialBag>((bag, o) => mergeMaterials(bag, o.materials), {}),
    awakeningStones: outcomes.reduce((n, o) => n + o.awakeningStones, 0),
    after,
  };
}
