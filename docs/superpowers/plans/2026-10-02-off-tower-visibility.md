# 탑 밖의 일 (훈련소·모험 체감) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 탑 팀이 돌아오면 결과 화면 '탑 밖' 패널에서 훈련소 성장·모험 귀환·원정 진행이 읽히게 한다. 정산 규칙·수치는 그대로.

**Architecture:** `finish()`의 훈련소·모험 정산을 순수 함수 `settleOffTower`(`src/game/offTower.ts`)로 빼고, `finish()`와 결과 화면 미리보기가 **같은 함수**를 쓴다. 레벨업 미리보기도 같은 모듈의 `growthOf`로 옮겨 버그 2건(파견자 훈련 표시·모험 exp 누락)을 구조적으로 닫는다. 진행 문장은 `data/adventures.ts`의 `legs`.

**Tech Stack:** React 18 + TypeScript + Zustand + Vitest. 명령: `npm test`, `npm run typecheck`, `npx vitest run <file>`.

**Spec:** `docs/superpowers/specs/2026-10-02-off-tower-visibility-design.md`

## Global Constraints

- `src/game/` 아래는 React·DOM·브라우저 API 금지. 순수 함수만. `Math.random()` 금지 — RNG는 기존 `adventureRng`만.
- **정산은 비트 단위로 현행과 같아야 한다.** 기존 `dispatch.test.ts`·`levelup.test.ts`·`facility.test.ts`·`assignment.test.ts`·`ordersBaseline.test.ts`가 그대로 통과해야 한다. 기존 테스트를 고쳐 통과시키지 말 것.
- 새 `STREAM` 번호 없음. 밸런스 수치 변경 없음.
- UI: 정보 표시는 `<SystemPanel>`, 텍스트 가운데 정렬, 색은 `src/ui/tokens.ts`의 `T`만, 진행 바는 `HpBar`(`src/ui/Button.tsx`) 재사용.
- 영웅 이름은 `displayName(inst, gameData.heroes)`로만.
- 진행 문장(`legs`)은 **결과를 암시하지 않는다**(위치·풍경만).
- 주석·커밋 메시지는 한국어. 커밋 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 테스트는 프로젝트 관례대로 **구현을 일부러 깨서 실패하는지** 확인한 뒤 되돌린다.

## Review Focus

1. **파견자가 훈련소 exp로 레벨업한 것처럼 보이는 경우** — 결과 화면 "▲ 성장"에 안 나와야 한다(Task 3 테스트).
2. **패배한 전투에서 모험이 귀환한 경우** — 훈련 성과는 없지만 모험 귀환·모험 exp 레벨업은 보여야 한다(Task 3·5).
3. **명단에 있지만 로스터에서 사라진(또는 정의가 사라진) 원정** — 빈손 귀환으로 표시되고 화면이 깨지지 않아야 한다(Task 1 테스트).
4. **진행 문장이 결과를 흘리는 경우** — 성공/실패를 암시하는 단어가 `legs`에 들어가면 테스트가 실패해야 한다(Task 4).
5. **원정이 출발한 바로 그 전투 직후**(`done` 경계) — 모험 관문에서는 `done = 0`, 결과 화면에서는 `done ≥ 1`이고 `legs` 범위를 벗어나지 않아야 한다(Task 1·4).

---

### Task 1: `settleOffTower` 순수 함수

**Files:**
- Create: `src/game/offTower.ts`
- Test: `src/game/offTower.test.ts`

**Interfaces:**
- Consumes: `adventureRng`, `resolveAdventure`, `isComplete`, `dispatchedHeroIds`, `AdventureOutcome` (`src/game/adventure.ts`), `ADVENTURE_BY_ID`, `Dispatch` (`src/game/data/adventures.ts`), `idleExpWithAssign` (`src/game/data/facilities.ts`), `gainExp` (`src/game/progression.ts`), `statsOfInstance` (`src/game/stats.ts`), `mergeMaterials` (`src/game/loot.ts`), `gameData` (`src/game/data`).
- Produces:
  ```ts
  export interface HeroGain { instId: HeroInstId; exp: number; before: HeroInstance; after: HeroInstance }
  export interface AdventureReturn { dispatch: Dispatch; outcome: AdventureOutcome; heroes: HeroGain[] }
  export interface AdventureProgress { dispatch: Dispatch; done: number; duration: number }
  export interface OffTowerInput {
    roster: readonly HeroInstance[]; dispatches: readonly Dispatch[];
    assignedIds: ReadonlySet<string>; trainingAssigned: readonly string[];
    trainingLevel: number; battleCount: number; seed: number;
    fought: ReadonlySet<string>; casualties: ReadonlySet<string>; cleared: boolean;
  }
  export interface OffTowerResult {
    idleExp: number; trainees: HeroGain[]; returned: AdventureReturn[];
    away: AdventureProgress[]; stillAway: Dispatch[]; outcomes: AdventureOutcome[];
    materials: MaterialBag; awakeningStones: number;
    after: Map<HeroInstId, HeroInstance>;
  }
  export function settleOffTower(input: OffTowerInput): OffTowerResult;
  ```

- [ ] **Step 1: 실패하는 테스트 작성** — `src/game/offTower.test.ts`

```ts
/**
 * 탑 밖의 정산 — 훈련소 유휴 exp와 모험 귀환.
 *
 * `finish()`와 결과 화면이 **같은 함수**를 쓰므로, 규칙이 여기서 틀리면
 * 화면과 지급이 함께 틀린다. 지키는 것:
 *   1. 훈련소는 미참전·생존·비파견·비배치만, 돌파했을 때만
 *   2. 모험 완료 판정은 `battleCount + 1` 기준(N전투 모험이 N번째 전투 직후 귀환)
 *   3. 진행 중 원정의 `done`이 `battleCount + 1 − startedAtBattle`
 */
import { describe, it, expect } from 'vitest';
import { settleOffTower, type OffTowerInput } from './offTower';
import { ADVENTURE_BY_ID, type AdventureId, type Dispatch } from './data/adventures';
import { idleExpWithAssign } from './data/facilities';
import { klassFor } from './stats';
import { HERO } from './data/sample';
import type { HeroInstId, HeroInstance } from './types';

const MINE = 'adv_mine' as AdventureId;
const RIFT = 'adv_rift' as AdventureId;

function hero(n: number, level = 5): HeroInstance {
  return {
    instId: `h#${n}` as HeroInstId,
    defId: HERO.ashen,
    star: 2,
    klass: klassFor(2),
    level,
    exp: 0,
    currentHp: 0,
    isDead: false,
    acquiredAtFloor: 1,
  };
}

const id = (n: number) => `h#${n}` as HeroInstId;

function input(over: Partial<OffTowerInput> = {}): OffTowerInput {
  return {
    roster: [hero(0), hero(1), hero(2), hero(3), hero(4)],
    dispatches: [],
    assignedIds: new Set(),
    trainingAssigned: [],
    trainingLevel: 2,
    battleCount: 10,
    seed: 42,
    fought: new Set([id(0)]),
    casualties: new Set(),
    cleared: true,
    ...over,
  };
}

describe('settleOffTower — 훈련소', () => {
  it('미참전·생존·비파견·비배치만 유휴 exp를 받는다', () => {
    const d: Dispatch = { advId: RIFT, heroIds: [id(2)], startedAtBattle: 10 };
    const r = settleOffTower(input({
      dispatches: [d],
      assignedIds: new Set([id(3)]),
      roster: [hero(0), hero(1), hero(2), hero(3), { ...hero(4), isDead: true }],
    }));
    expect(r.idleExp).toBe(idleExpWithAssign(2, 0));
    expect(r.trainees.map((t) => t.instId)).toEqual([id(1)]);
    expect(r.trainees[0].exp).toBe(r.idleExp);
    expect(r.trainees[0].before.exp).toBe(0);
    expect(r.after.get(id(1))).toBe(r.trainees[0].after);
  });

  it('층을 넘지 못하면 아무도 받지 않는다', () => {
    const r = settleOffTower(input({ cleared: false }));
    expect(r.idleExp).toBe(0);
    expect(r.trainees).toEqual([]);
  });

  it('훈련소 Lv.0이면 아무도 받지 않는다', () => {
    const r = settleOffTower(input({ trainingLevel: 0 }));
    expect(r.trainees).toEqual([]);
  });

  it('출전한 배치자는 그 층 산출에서 빠진다', () => {
    const r = settleOffTower(input({
      trainingAssigned: [id(0), id(3)],
      assignedIds: new Set([id(0), id(3)]),
    }));
    // id(0)은 출전했으므로 일한 배치자는 id(3) 한 명
    expect(r.idleExp).toBe(idleExpWithAssign(2, 1));
  });
});

describe('settleOffTower — 모험', () => {
  it('N전투 모험은 N번째 전투 직후에 귀환한다', () => {
    const dur = ADVENTURE_BY_ID[MINE].duration;
    const d: Dispatch = { advId: MINE, heroIds: [id(2)], startedAtBattle: 10 - (dur - 1) };
    const r = settleOffTower(input({ dispatches: [d] }));
    expect(r.returned).toHaveLength(1);
    expect(r.stillAway).toEqual([]);
    expect(r.outcomes).toHaveLength(1);
    expect(r.returned[0].heroes.map((h) => h.instId)).toEqual([id(2)]);
  });

  it('진행 중 원정의 done은 battleCount + 1 − startedAtBattle이다', () => {
    const d: Dispatch = { advId: RIFT, heroIds: [id(2)], startedAtBattle: 10 };
    const r = settleOffTower(input({ dispatches: [d] }));
    expect(r.away).toEqual([{ dispatch: d, done: 1, duration: ADVENTURE_BY_ID[RIFT].duration }]);
  });

  it('귀환자는 exp(성공) 또는 부상(실패)이 after에 반영된다 — HP는 1 아래로 안 간다', () => {
    let sawSuccess = false;
    let sawFail = false;
    for (let seed = 1; seed < 60 && !(sawSuccess && sawFail); seed++) {
      const d: Dispatch = { advId: RIFT, heroIds: [id(2), id(3)], startedAtBattle: 6 };
      const r = settleOffTower(input({ seed, dispatches: [d] }));
      const ret = r.returned[0];
      for (const g of ret.heroes) {
        if (ret.outcome.success) {
          sawSuccess = true;
          expect(g.exp).toBe(ret.outcome.expEach);
          expect(g.after.level * 1e6 + g.after.exp).toBeGreaterThan(g.before.level * 1e6 + g.before.exp);
        } else {
          sawFail = true;
          expect(g.exp).toBe(0);
          expect(g.after.currentHp).toBeGreaterThanOrEqual(1);
          expect(g.after.currentHp).not.toBe(0);
        }
      }
    }
    expect(sawSuccess && sawFail).toBe(true);
  });

  it('로스터에서 사라진 인원은 귀환 명단에 없다 — 전원 사라지면 빈손 귀환', () => {
    const d: Dispatch = { advId: MINE, heroIds: [id(9)], startedAtBattle: 0 };
    const r = settleOffTower(input({ dispatches: [d] }));
    expect(r.returned).toHaveLength(1);
    expect(r.returned[0].heroes).toEqual([]);
    expect(r.returned[0].outcome.success).toBe(false);
    expect(r.returned[0].outcome.injuryRatio).toBe(0);
  });

  it('성공한 원정의 재료·각성석이 합산된다', () => {
    for (let seed = 1; seed < 60; seed++) {
      const d: Dispatch = { advId: MINE, heroIds: [id(2)], startedAtBattle: 0 };
      const r = settleOffTower(input({ seed, dispatches: [d] }));
      if (!r.outcomes[0].success) continue;
      expect(r.materials).toEqual(r.outcomes[0].materials);
      expect(r.awakeningStones).toBe(0);
      return;
    }
    throw new Error('성공 시드를 못 찾았다');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/offTower.test.ts`
Expected: FAIL — `Failed to resolve import "./offTower"`

- [ ] **Step 3: 구현** — `src/game/offTower.ts`

```ts
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
    완료 판정은 **증가 후** 전투 수로 한다 — `finish()`가 아래에서 battleCount + 1을
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/game/offTower.test.ts`
Expected: PASS (9 tests). 만약 `gameData`가 import 시점에 undefined라 실패하면(순환 import), `src/game/data/index.ts`가 `gameData`를 어디서 조립하는지 보고 `heroes`·`starScaling`을 그 원본 모듈에서 직접 import한다. `sim.ts`가 이미 `./data`를 쓰므로 보통은 문제없다.

- [ ] **Step 5: 일부러 깨기** — 각각 바꿨다가 실패를 확인하고 되돌린다:
  - `const next = battleCount + 1` → `battleCount` (N전투 귀환·done 테스트 실패)
  - `!awayNow.has(h.instId) &&` 삭제 (훈련소 첫 테스트 실패)
  - `if (ratio) { … }` 블록 통째로 주석 처리 (부상 테스트의 `currentHp` 0 아님 단언 실패)

- [ ] **Step 6: 커밋**

```bash
git add src/game/offTower.ts src/game/offTower.test.ts
git commit -m "feat(offtower): settleOffTower — 훈련소 유휴 exp·모험 귀환·원정 진행을 순수 함수로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `finish()`가 `settleOffTower`를 쓴다

**Files:**
- Modify: `src/stores/runStore.ts` (`finish()` 약 1054~1101줄의 유휴 exp·모험 계산, 1140~1210줄 로스터 갱신, 1244·1246·1254·1280줄)
- Test: `src/stores/offTower.test.ts` (새 파일)

**Interfaces:**
- Consumes: `settleOffTower`, `OffTowerInput` (Task 1)
- Produces: 없음(동작 불변). 이후 Task 3이 같은 입력 모양을 App에서 만든다.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/stores/offTower.test.ts`

```ts
/**
 * `finish()`의 정산이 `settleOffTower`와 **같은가** — 정산 단일 출처 잠금.
 * 결과 화면이 같은 함수로 미리 보여주므로, 갈라지면 "보인 것과 들어온 것이 다르다".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { settleOffTower } from '../game/offTower';
import { ASSIGNABLE } from '../game/data/facilities';
import type { AdventureId } from '../game/data/adventures';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}
beforeEach(() => vi.stubGlobal('localStorage', new MemStorage()));

const MINE = 'adv_mine' as AdventureId;

describe('finish() = settleOffTower', () => {
  it('훈련생·귀환자의 정산 뒤 상태와 남은 원정이 같다', () => {
    for (const seed of [3, 7, 11, 19]) {
      const s = createRunStore(() => seed);
      s.setState({ maxFloorReached: 15, facilities: { ...s.getState().facilities, training: 2 } });
      const alive = s.getState().roster.filter((h) => !h.isDead);
      const squad = new Set(s.getState().squads[0]);
      const free = alive.filter((h) => !squad.has(h.instId));
      expect(free.length).toBeGreaterThan(0);
      // 하나는 이미 끝나가는 원정, 하나는 새 원정
      s.setState({ battleCount: 4, dispatches: [{ advId: MINE, heroIds: [free[0].instId], startedAtBattle: 3 }] });

      s.getState().start();
      const r = s.getState().result!;
      s.setState({ result: { ...r, outcome: 'victory', casualties: [] } });

      const st = s.getState();
      const fought = new Set<string>(st.result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId));
      const expected = settleOffTower({
        roster: st.roster,
        dispatches: st.dispatches,
        assignedIds: new Set(ASSIGNABLE.flatMap((k) => st.assignments[k] as string[])),
        trainingAssigned: st.assignments.training,
        trainingLevel: st.facilities.training,
        battleCount: st.battleCount,
        seed: st.seed,
        fought,
        casualties: new Set(),
        cleared: true,
      });
      expect(expected.trainees.length + expected.returned.length).toBeGreaterThan(0);

      s.getState().finish();
      const after = s.getState();
      for (const [id, h] of expected.after) {
        expect(after.roster.find((x) => x.instId === id), `seed ${seed} ${id}`).toEqual(h);
      }
      expect(after.dispatches).toEqual(expected.stillAway);
      expect(after.adventureOutcomes).toEqual(expected.outcomes);
    }
  });
});
```

- [ ] **Step 2: 테스트 실행** — 리팩터 전에도 통과해야 정상이다(동작 불변을 잠그는 테스트).

Run: `npx vitest run src/stores/offTower.test.ts`
Expected: PASS. 실패하면 테스트 입력 구성(예: `facilities` 필드 이름)을 `runStore.ts`의 상태 타입에 맞춰 고친다 — 구현은 아직 건드리지 않았다.

- [ ] **Step 3: `finish()` 교체** — `src/stores/runStore.ts`

  1) import 추가: `import { settleOffTower } from '../game/offTower';`
  2) `workingTrainees`·`idleExp`·모험 정산 블록(현 `const workingTrainees = …`부터 `const awayNow = dispatchedHeroIds(get().dispatches);`까지)을 아래로 바꾼다. 위에 있던 설명 주석 중 "출전한 배치자는 빠진다"·"battleCount가 아직 증가하기 전" 요지는 `offTower.ts`로 옮겨졌으므로 한 줄 포인터만 남긴다.

```ts
      /**
       * 훈련소 유휴 exp·모험 정산 — **`settleOffTower` 하나**가 맡는다.
       * 결과 화면이 같은 함수로 미리 보여주므로 규칙을 여기에 다시 적지 말 것(`game/offTower.ts`).
       */
      const off = settleOffTower({
        roster: get().roster,
        dispatches: get().dispatches,
        assignedIds: assignedNow,
        trainingAssigned: get().assignments.training,
        trainingLevel: get().facilities.training,
        battleCount: get().battleCount,
        seed: get().seed,
        fought,
        casualties,
        cleared,
      });
```

  3) `roster: s.roster.map((h) => { … })` 안에서
     - `} else if (idleExp > 0 && !h.isDead && !awayNow.has(h.instId) && !assignedNow.has(h.instId)) { … next = gainExp(next, idleExp, …).hero; }` 분기와
     - 그 아래 `if (!h.isDead) { const gained = advExp.get(…); … }` 모험 블록을
     하나로 바꾼다:

```ts
          } else {
            /**
             * 탑 밖 — 훈련소 유휴 exp와 모험 귀환(exp·부상).
             * 규칙과 그 이유(파견·배치 제외, HP 하한 1)는 `game/offTower.ts`에 있다.
             */
            next = off.after.get(h.instId) ?? next;
          }
```

  4) set() 안: `materials: mergeMaterials(mergeMaterials(s.materials, droppedMaterials), advMaterials)` → `off.materials`, `dispatches: stillAway` → `off.stillAway`, `adventureOutcomes: outcomes` → `off.outcomes`, `awakeningStones: s.wallet.awakeningStones + advStones` → `+ off.awakeningStones`.
  5) 쓰이지 않게 된 import(`adventureRng`, `isComplete`, `resolveAdventure`, `idleExpWithAssign` 등)는 typecheck/lint가 지적하는 것만 지운다(`dispatchedHeroIds`는 다른 곳에서 쓰면 남긴다).

- [ ] **Step 4: 전체 확인**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck 통과, 전체 통과(1151 + Task 1의 9 + 1 = 1161개). `dispatch.test.ts`·`levelup.test.ts`·`facility.test.ts`·`assignment.test.ts`가 그대로 통과해야 한다.

- [ ] **Step 5: 일부러 깨기** — `finish()`의 `off.after.get(h.instId) ?? next`를 `next`로 바꾸면 `src/stores/offTower.test.ts`가 실패해야 한다(정산이 로스터에 안 들어간다). 확인 후 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add src/stores/runStore.ts src/stores/offTower.test.ts
git commit -m "refactor(store): finish()의 훈련소·모험 정산을 settleOffTower로 — 동작 불변, 단일 출처 잠금

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 레벨업 미리보기 `growthOf` — 버그 2건

**Files:**
- Modify: `src/game/offTower.ts` (함수 추가)
- Modify: `src/App.tsx:384-415` (`previewLevelUps`), 새 `previewOffTower` 추가
- Test: `src/game/offTower.test.ts` (추가)

**Interfaces:**
- Consumes: `settleOffTower`, `OffTowerResult` (Task 1)
- Produces:
  ```ts
  export interface Growth { instId: HeroInstId; from: number; to: number }
  export function growthOf(args: {
    roster: readonly HeroInstance[]; fought: ReadonlySet<string>; casualties: ReadonlySet<string>;
    battleExp: number; off: OffTowerResult;
  }): Growth[];
  ```
  App의 `previewOffTower(): OffTowerResult | null` — Task 5가 쓴다.

- [ ] **Step 1: 실패하는 테스트 추가** — `src/game/offTower.test.ts` 끝에

```ts
import { growthOf } from './offTower';

describe('growthOf — 결과 화면 "▲ 성장"', () => {
  it('파견 중인 영웅은 훈련으로 오른 것처럼 나오지 않는다', () => {
    const d: Dispatch = { advId: RIFT, heroIds: [id(2)], startedAtBattle: 10 };
    const inp = input({ dispatches: [d], trainingLevel: 3, roster: [hero(0), hero(1, 1), hero(2, 1)] });
    const off = settleOffTower(inp);
    const g = growthOf({ roster: inp.roster, fought: inp.fought, casualties: inp.casualties, battleExp: 0, off });
    expect(g.map((x) => x.instId)).toContain(id(1));
    expect(g.map((x) => x.instId)).not.toContain(id(2));
  });

  it('모험 exp로 오른 레벨이 나온다 — 패배한 전투에서도', () => {
    for (let seed = 1; seed < 60; seed++) {
      const d: Dispatch = { advId: RIFT, heroIds: [id(2)], startedAtBattle: 6 };
      const inp = input({ seed, cleared: false, dispatches: [d], roster: [hero(0), hero(2, 1)] });
      const off = settleOffTower(inp);
      if (!off.outcomes[0].success) continue;
      const g = growthOf({ roster: inp.roster, fought: inp.fought, casualties: inp.casualties, battleExp: 0, off });
      expect(g).toEqual([{ instId: id(2), from: 1, to: off.after.get(id(2))!.level }]);
      return;
    }
    throw new Error('성공 시드를 못 찾았다');
  });

  it('참전 생존자는 battleExp로, 사망자는 나오지 않는다', () => {
    const inp = input({ roster: [hero(0, 1), hero(1, 1)], fought: new Set([id(0), id(1)]), casualties: new Set([id(1)]) });
    const off = settleOffTower(inp);
    const g = growthOf({ roster: inp.roster, fought: inp.fought, casualties: inp.casualties, battleExp: 500, off });
    expect(g.map((x) => x.instId)).toEqual([id(0)]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/offTower.test.ts`
Expected: FAIL — `growthOf is not a function` (또는 import 오류)

- [ ] **Step 3: 구현** — `src/game/offTower.ts` 끝에

```ts
/** 이번 전투 뒤 레벨이 오른 개체. 표시 전용 — 지급은 `finish()`가 한다 */
export interface Growth {
  instId: HeroInstId;
  from: number;
  to: number;
}

/**
 * 결과 화면 "▲ 성장" 목록 — 참전 exp + 탑 밖(훈련소·모험).
 *
 * ⚠️ 탑 밖 몫은 `settleOffTower`의 `after`를 그대로 읽는다. 예전 화면 사본은
 * 파견자를 빼지 않았고 모험 exp를 몰라서 "오른다던 영웅이 안 오르고, 오른 영웅이 안 보였다".
 * `battleExp`는 참전 생존자 1인당(승리가 아니면 0) — `finish()`의 `scaledExp`와 같은 값.
 */
export function growthOf(args: {
  roster: readonly HeroInstance[];
  fought: ReadonlySet<string>;
  casualties: ReadonlySet<string>;
  battleExp: number;
  off: OffTowerResult;
}): Growth[] {
  const { roster, fought, casualties, battleExp, off } = args;
  const out: Growth[] = [];
  for (const h of roster) {
    if (h.isDead || casualties.has(h.instId)) continue;
    const after = fought.has(h.instId)
      ? (battleExp > 0 ? gainExp(h, battleExp, gameData.starScaling).hero : h)
      : (off.after.get(h.instId) ?? h);
    if (after.level > h.level) out.push({ instId: h.instId, from: h.level, to: after.level });
  }
  return out;
}
```

- [ ] **Step 4: App 교체** — `src/App.tsx`

  `previewLevelUps` 전체(384~415줄, 위 주석 블록 포함)를 아래로 바꾼다. import에 `settleOffTower, growthOf, type OffTowerResult`(`./game/offTower`)를 추가하고, 더 안 쓰이는 `idleExpWithAssign`·`gainExp` import는 typecheck가 지적하면 지운다.

```ts
  /**
   * 탑 밖 정산 미리보기 — `finish()`와 **같은 함수·같은 입력**(`game/offTower.ts`).
   * 결과 화면은 `finish()`보다 먼저 뜨므로 스토어 결과를 읽을 수 없다(§5-17).
   * 입력: 전투 직전 로스터(snapshot)·지금의 파견·배치 — finish() 전까지 바뀌지 않는다.
   */
  const previewOffTower = (): OffTowerResult | null => {
    if (!result) return null;
    return settleOffTower({
      roster: snapshot,
      dispatches,
      assignedIds: assignedHeroIds,
      trainingAssigned: assignments.training,
      trainingLevel: facilities.training,
      battleCount,
      seed,
      fought: new Set(result.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId)),
      casualties: new Set(result.casualties),
      cleared: result.outcome === 'victory',
    });
  };

  /** "▲ 성장" — 참전 exp + 탑 밖. 승리가 아니어도 모험 귀환으로 오를 수 있다 */
  const previewLevelUps = (off: OffTowerResult | null): LevelUp[] => {
    if (!result || !off) return [];
    const battleExp = result.outcome === 'victory'
      ? Math.round(floorRewards(floor, result.turnsElapsed).exp * revisitMult())
      : 0;
    return growthOf({
      roster: snapshot,
      fought: new Set(result.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId)),
      casualties: new Set(result.casualties),
      battleExp,
      off,
    }).map((g) => ({
      ...g,
      name: displayName(snapshot.find((h) => h.instId === g.instId)!, gameData.heroes),
    }));
  };
```

  `<ResultScreen>` 렌더 직전(732줄 `{screen === 'result' && result && (`) 안에서 한 번만 계산하도록, JSX 위 컴포넌트 본문에 `const offTower = screen === 'result' ? previewOffTower() : null;`를 두고 `levelUps={previewLevelUps(offTower)}`로 바꾼다.

- [ ] **Step 5: 확인**

Run: `npm run typecheck && npx vitest run`
Expected: 통과. `src/stores/levelup.test.ts`가 그대로 통과해야 한다.

- [ ] **Step 6: 일부러 깨기** — `growthOf`에서 `off.after.get(h.instId) ?? h`를 `h`로 바꾸면 "모험 exp로 오른 레벨" 테스트가 실패해야 한다. 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add src/game/offTower.ts src/game/offTower.test.ts src/App.tsx
git commit -m "fix(result): 레벨업 미리보기를 growthOf로 — 파견자 훈련 표시·모험 exp 누락 2건

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 원정 진행 문장 `legs`

**Files:**
- Modify: `src/game/data/adventures.ts` (`AdventureDef`에 `legs`, 3개 모험에 값)
- Modify: `src/game/adventure.ts` (`legLine` 추가)
- Test: `src/game/adventure.test.ts` (추가)

**Interfaces:**
- Produces: `AdventureDef.legs: readonly string[]`, `export function legLine(def: AdventureDef, done: number): string` — Task 5·6이 쓴다.

- [ ] **Step 1: 실패하는 테스트 추가** — `src/game/adventure.test.ts` 끝에 (`legLine`을 import 목록에 추가)

```ts
describe('원정 진행 문장', () => {
  it('모든 모험의 구간 문장 수가 소요 전투 수와 같다', () => {
    for (const def of ADVENTURE_DEFS) {
      expect(def.legs.length, def.name).toBe(def.duration);
    }
  });

  /**
   * ⚠️ 결과는 파견 순간 사실상 정해진다(파견자는 레벨이 안 오른다).
   * 진행 문장이 결과를 흘리면 "즉시 복귀"로 실패할 원정만 빼내 부상을 피할 수 있다.
   */
  it('진행 문장은 결과를 암시하지 않는다', () => {
    const banned = ['성공', '실패', '다쳤', '다친', '부상', '피를', '쓰러', '얻었', '손에 넣', '빈손', '품고', '무사'];
    for (const def of ADVENTURE_DEFS) {
      for (const line of def.legs) {
        for (const w of banned) expect(line, `${def.name}: ${line}`).not.toContain(w);
      }
    }
  });

  it('legLine은 범위를 벗어나도 마지막·첫 구간으로 접는다', () => {
    const def = ADVENTURE_BY_ID[MINE];
    expect(legLine(def, 0)).toBe(def.legs[0]);
    expect(legLine(def, def.duration - 1)).toBe(def.legs[def.duration - 1]);
    expect(legLine(def, 99)).toBe(def.legs[def.duration - 1]);
    expect(legLine(def, -1)).toBe(def.legs[0]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/adventure.test.ts`
Expected: FAIL — typecheck 수준에서 `legs` 없음 / `legLine` import 실패

- [ ] **Step 3: 데이터** — `src/game/data/adventures.ts`

`AdventureDef`의 `reward` 위에 추가:

```ts
  /**
   * 원정 진행 문장 — **길이 = `duration`.** `legs[done]`이 "지금 있는 곳"이다
   * (0 = 출발 직후, duration − 1 = 돌아오는 길). 결과 화면·모험 관문에 나간다.
   *
   * ⚠️ **결과를 암시하지 않는다.** 파견자는 exp를 안 받아 레벨이 고정되므로 결과는
   * 파견 순간 사실상 정해진다. 문장이 실패를 흘리면 "즉시 복귀"로 실패할 원정만 빼내
   * 부상을 피하는 길이 생긴다. 위치·풍경만 쓴다(`adventure.test.ts`가 금지어로 잠근다).
   */
  legs: readonly string[];
```

각 모험에 (`duration` 다음 줄):

```ts
    // adv_mine
    legs: [
      '폐광 입구의 버팀목 사이로 내려갔다.',
      '무너진 갱도를 돌아 막장 쪽으로 가고 있다.',
    ],
```

```ts
    // adv_caravan
    legs: [
      '행상의 수레와 함께 첫 고개를 넘고 있다.',
      '탑 그늘의 장터 사이를 돌고 있다.',
      '마지막 장터를 떠나 돌아오는 길이다.',
    ],
```

```ts
    // adv_rift
    legs: [
      '균열이 보이는 언덕으로 향했다.',
      '빛이 새는 틈의 가장자리에 닿았다.',
      '균열 안쪽, 소리가 사라지는 곳을 지나고 있다.',
      '가장 깊은 곳을 살피고 있다.',
      '균열을 빠져나와 돌아오는 길이다.',
    ],
```

- [ ] **Step 4: `legLine`** — `src/game/adventure.ts`, `isComplete` 아래

```ts
/**
 * 원정 진행 문장. `done`은 지난 전투 수 — 범위 밖이면 양 끝으로 접는다
 * (정의가 바뀌어 duration이 줄어도 화면이 빈 줄을 내지 않게).
 */
export function legLine(def: AdventureDef, done: number): string {
  const i = Math.min(def.legs.length - 1, Math.max(0, done));
  return def.legs[i] ?? '';
}
```

- [ ] **Step 5: 확인**

Run: `npm run typecheck && npx vitest run src/game/adventure.test.ts`
Expected: PASS

- [ ] **Step 6: 일부러 깨기** — 균열 마지막 문장을 '빛을 품고 돌아오는 길이다.'로 바꾸면 금지어 테스트가 실패해야 한다. 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add src/game/data/adventures.ts src/game/adventure.ts src/game/adventure.test.ts
git commit -m "feat(adventure): 원정 진행 문장 legs — 위치·풍경만, 결과를 흘리지 않는다(금지어 잠금)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 결과 화면 '탑 밖' 패널

**Files:**
- Create: `src/screens/result/OffTowerPanel.tsx`
- Modify: `src/screens/ResultScreen.tsx` (prop `offTower` 추가, 버튼 위에 패널)
- Modify: `src/App.tsx` (`offTower={offTower}`·`trainingLevel` 전달)

**Interfaces:**
- Consumes: `OffTowerResult`, `HeroGain` (Task 1), `legLine` (Task 4), `ADVENTURE_BY_ID`, `expToNext`(`src/game/progression.ts`), `HpBar`, `SystemPanel`, `T`, `MATERIAL_DEFS`, `MATERIAL_ORDER`, `isEmptyBag`, `displayName`, `gameData`.
- Produces: `export function OffTowerPanel(props: { off: OffTowerResult; cleared: boolean; trainingLevel: number }): JSX.Element | null`

- [ ] **Step 1: 컴포넌트** — `src/screens/result/OffTowerPanel.tsx`

```tsx
import { useEffect, useState } from 'react';
import { SystemPanel } from '../../ui/SystemPanel';
import { HpBar } from '../../ui/Button';
import { T } from '../../ui/tokens';
import { gameData } from '../../game/data';
import { displayName } from '../../game/identity';
import { expToNext } from '../../game/progression';
import { legLine } from '../../game/adventure';
import { ADVENTURE_BY_ID } from '../../game/data/adventures';
import { MATERIAL_DEFS, MATERIAL_ORDER } from '../../game/data/materials';
import { isEmptyBag } from '../../game/loot';
import type { HeroGain, OffTowerResult } from '../../game/offTower';

const label = { fontSize: 12, letterSpacing: '.2em', marginBottom: 6 } as const;
const line = { fontSize: 13, lineHeight: 1.9 } as const;

/** exp 바 — 정산 전 값에서 시작해 정산 뒤 값까지 차오른다(레벨이 올랐으면 새 레벨 기준) */
function ExpRise({ g }: { g: HeroGain }) {
  const leveled = g.after.level > g.before.level;
  const max = expToNext(g.after.star, g.after.level);
  const [cur, setCur] = useState(leveled ? 0 : g.before.exp);
  useEffect(() => {
    const t = setTimeout(() => setCur(g.after.exp), 120);
    return () => clearTimeout(t);
  }, [g.after.exp]);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
      <HpBar cur={cur} max={max} color={T.gold} w={140} h={4} />
    </div>
  );
}

const nameOf = (g: HeroGain) => displayName(g.after, gameData.heroes);

/**
 * 탑 밖 — 탑에 간 사이 남은 이들에게 있었던 일(1차 셀프 테스트 지적 3번).
 * 값은 `settleOffTower`가 준다 — `finish()`가 지급하는 것과 같은 함수다.
 */
export function OffTowerPanel({ off, cleared, trainingLevel }: {
  off: OffTowerResult;
  cleared: boolean;
  trainingLevel: number;
}) {
  // 훈련소가 있는데 층을 못 넘었으면 규칙(돌파 시에만)을 한 줄로 보인다
  const noTraining = !cleared && trainingLevel > 0;
  if (off.trainees.length === 0 && !noTraining && off.returned.length === 0 && off.away.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 16 }}>
      <SystemPanel compact>
        <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em', marginBottom: 10 }}>탑 밖</div>

        {(off.trainees.length > 0 || noTraining) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...label, color: T.gold }}>훈련소</div>
            {noTraining && (
              <div style={{ ...line, color: T.dim }}>층을 넘지 못해 훈련 성과가 없다</div>
            )}
            {off.trainees.map((g) => (
              <div key={g.instId} style={{ marginBottom: 6 }}>
                <div style={line}>
                  {nameOf(g)}
                  <span style={{ color: T.gold }}> +{g.exp} exp</span>
                  {g.after.level > g.before.level
                    ? <span style={{ color: T.gold }}> · Lv.{g.before.level} → {g.after.level}</span>
                    : <span style={{ color: T.dim }}> · Lv.{g.after.level}</span>}
                </div>
                <ExpRise g={g} />
              </div>
            ))}
          </div>
        )}

        {off.returned.map((r, i) => {
          const def = ADVENTURE_BY_ID[r.dispatch.advId];
          const o = r.outcome;
          return (
            <div key={`ret-${i}`} style={{ marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${T.panelHi}` }}>
              <div style={{ ...label, color: o.success ? T.rare : T.amber }}>
                {def?.name ?? '알 수 없는 모험'} — {o.success ? '귀환' : '빈손 귀환'}
              </div>
              {r.heroes.map((g) => (
                <div key={g.instId} style={line}>
                  {nameOf(g)}
                  {o.success && <span style={{ color: T.gold }}> +{g.exp} exp</span>}
                  {g.after.level > g.before.level && (
                    <span style={{ color: T.gold }}> · Lv.{g.before.level} → {g.after.level}</span>
                  )}
                  {o.injuryRatio > 0 && <span style={{ color: T.blood }}> · 부상</span>}
                </div>
              ))}
              {!isEmptyBag(o.materials) && (
                <div style={{ ...line, color: T.rare }}>
                  {MATERIAL_ORDER.filter((m) => (o.materials[m] ?? 0) > 0)
                    .map((m) => `${MATERIAL_DEFS[m].name} +${o.materials[m]}`).join(' · ')}
                </div>
              )}
              {o.awakeningStones > 0 && (
                <div style={{ ...line, color: T.gold }}>각성석 +{o.awakeningStones}</div>
              )}
            </div>
          );
        })}

        {off.away.map((a, i) => {
          const def = ADVENTURE_BY_ID[a.dispatch.advId];
          if (!def) return null;
          return (
            <div key={`away-${i}`} style={{ paddingTop: 10, borderTop: `1px solid ${T.panelHi}`, marginBottom: 6 }}>
              <div style={{ ...label, color: T.dim }}>{def.name} — {a.done}/{a.duration}전투</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <HpBar cur={a.done} max={a.duration} color={T.amber} w={140} h={4} />
              </div>
              <div style={{ ...line, color: T.dim }}>{legLine(def, a.done)}</div>
            </div>
          );
        })}
      </SystemPanel>
    </div>
  );
}
```

  주: `T.amber`·`T.rare`·`T.panelHi`·`T.blood`·`T.gold`·`T.dim`은 `ResultScreen.tsx`가 이미 쓰는 토큰이다. `expToNext`가 `progression.ts`에서 export되어 있음(20줄)을 확인했다.

- [ ] **Step 2: ResultScreen 연결** — `src/screens/ResultScreen.tsx`
  - import: `import { OffTowerPanel } from './result/OffTowerPanel';`, `import type { OffTowerResult } from '../game/offTower';`
  - props에 추가(주석 포함):
    ```ts
    /** 탑 밖 정산 미리보기 — `settleOffTower`. 없으면 패널을 그리지 않는다 */
    offTower?: OffTowerResult | null;
    /** 훈련소 레벨 — 층 미돌파 시 "훈련 성과 없음" 줄을 띄울지 */
    trainingLevel?: number;
    ```
  - 구조분해에 `offTower = null, trainingLevel = 0` 추가.
  - `</SystemPanel>`(획득 패널 끝, 412줄)과 버튼 `<div style={{ textAlign: 'center', marginTop: 30 }}>` 사이에:
    ```tsx
      {offTower && <OffTowerPanel off={offTower} cleared={win} trainingLevel={trainingLevel} />}
    ```
  - `levelUps` prop 주석을 "참전·훈련소·모험으로 오른 것 전부"로 고친다.

- [ ] **Step 3: App 연결** — `<ResultScreen …>`에 `offTower={offTower}` `trainingLevel={facilities.training}` 추가.

- [ ] **Step 4: 확인**

Run: `npm run typecheck && npx vitest run`
Expected: 통과.

- [ ] **Step 5: 브라우저 375×667** — `npm run dev` 후 개발 세이브로:
  1) 훈련소 Lv.1 이상 + 미편성 영웅이 있는 상태에서 1층 승리 → '탑 밖'에 훈련소 줄·exp 바가 차오르는지
  2) 폐광 파견 후 1전투 → "버려진 폐광 — 1/2전투" + 진행 문장, 2전투 → 귀환 블록
  3) 패배 → "층을 넘지 못해 훈련 성과가 없다"
  4) `document.documentElement.scrollWidth`가 360 이하(가로 스크롤 없음), 패널 높이 기록
  세이브를 망가뜨리지 않는다 — 플레이로만 만든다.

- [ ] **Step 6: 커밋**

```bash
git add src/screens/result/OffTowerPanel.tsx src/screens/ResultScreen.tsx src/App.tsx
git commit -m "feat(result): 결과 화면 '탑 밖' 패널 — 훈련소 +exp·바, 모험 귀환 보고, 원정 진행

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 모험 관문 카드 진행 바·진행 문장

**Files:**
- Modify: `src/screens/AdventureScreen.tsx:107-137` (원정 중 카드)

**Interfaces:**
- Consumes: `legLine` (Task 4), `HpBar`(`src/ui/Button.tsx` — 이미 `Button`을 import하는 파일이므로 import에 `HpBar` 추가)

- [ ] **Step 1: 카드 수정** — `const left = battlesRemaining(d, battleCount);` 아래에 `const done = def ? def.duration - left : 0;` 추가. 기존 남은 전투 줄을 아래로 바꾼다(위 ⚠️ 주석은 유지):

```tsx
                  <div style={{ fontSize: 13, color: T.gold, letterSpacing: '.1em', marginBottom: 6 }}>
                    탑 {left}전투 남음
                  </div>
                  {def && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                        <HpBar cur={done} max={def.duration} color={T.amber} w={140} h={4} />
                      </div>
                      <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.8, marginBottom: 10 }}>
                        {legLine(def, done)}
                      </div>
                    </>
                  )}
```

  '귀환 대기 — 다음 전투에 정산' 분기는 지운다 — 완료된 파견은 `finish()`에서 바로 빠지므로 `left > 0`이 늘 참이다(남기면 다음 사람이 "언제 뜨나"를 찾는다). import에 `legLine` 추가.

- [ ] **Step 2: 확인**

Run: `npm run typecheck && npx vitest run`
Expected: 통과.

- [ ] **Step 3: 브라우저 375×667** — 모험 관문에서 파견 직후 "탑 2전투 남음" + 빈 바 + 첫 구간 문장, 1전투 후 바 절반 + 둘째 문장. 가로 스크롤 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/screens/AdventureScreen.tsx
git commit -m "feat(adventure): 모험 관문 원정 카드에 진행 바·진행 문장, 안 뜨는 '귀환 대기' 문구 제거

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 문서 — HANDOFF STEP 65 · CLAUDE.md

**Files:**
- Modify: `docs/HANDOFF.md` (STEP 64 뒤에 STEP 65, §1차 셀프 테스트 결과의 3번에 "→ STEP 65에서 처리")
- Modify: `CLAUDE.md` (게임 규칙·디렉토리·테스트 수)

- [ ] **Step 1: HANDOFF STEP 65** — 기존 STEP 형식(만든 것 표 / 설계 판단 / 알아둘 것 / 결과)으로 쓴다. 반드시 넣을 것:
  - 사용자 결정(2026-10-02): 전투 기준 유지·진행을 보이게 / 결과 화면 '탑 밖' 패널
  - 버그 2건과 원인(화면 사본), `settleOffTower`·`growthOf` 단일 출처
  - 진행 문장이 결과를 흘리면 안 되는 이유(즉시 복귀 악용), 금지어 테스트
  - 실제 테스트 수·브라우저 실측 수치(패널 높이·scrollWidth), 폰 확인 여부
- [ ] **Step 2: CLAUDE.md**
  - 게임 규칙에 한 항목: "**훈련소·모험 정산은 `settleOffTower` 하나다**(STEP 65). `finish()`와 결과 화면이 같은 함수를 쓴다 — 규칙을 둘 중 한 곳에 다시 적지 말 것. 원정 진행 문장(`legs`)은 결과를 암시하지 않는다(파견 순간 결과가 정해지므로 즉시 복귀 악용)."
  - 디렉토리 `game/` 목록에 `offTower.ts  # 탑 밖 정산(훈련소 유휴 exp·모험 귀환) — finish()와 결과 화면이 같이 쓴다`
  - `npm test` 줄의 테스트 수 갱신.
- [ ] **Step 3: 커밋**

```bash
git add docs/HANDOFF.md CLAUDE.md
git commit -m "docs: 탑 밖의 일 STEP 65 — HANDOFF·CLAUDE.md 규칙

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
