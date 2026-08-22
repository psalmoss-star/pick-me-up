# 2군 편성 + 기존 층 재도전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파티 정원을 층 구간별로 나누고(1~20층 3인, 21층~ 5인), 2군을 열어 이미 깬 층을 재도전하며 파밍할 수 있게 한다.

**Architecture:** `party: HeroInstId[]`를 `squads: HeroInstId[][]`(1군/2군)로 넓히고, `floorIndex`가 겸하던 "현재 위치"와 "최대 진행도"를 `floorIndex` + `maxFloorReached`로 가른다. 정원 규칙과 재도전 보상 계수는 `src/game/data/`의 순수 함수로 두고 화면·스토어·측정 스크립트가 전부 거기서 읽는다. 세이브는 v1 → v2로 한 번만 올린다.

**Tech Stack:** TypeScript 5 / React 19 / Zustand / Vitest / Vite. 인라인 style(Tailwind 미사용), 모바일 세로 전용.

**Spec:** `docs/superpowers/specs/2026-08-18-squad-and-revisit-design.md`

## Global Constraints

이 프로젝트의 절대 규칙이다. **모든 태스크에 암묵적으로 적용된다.**

- `src/game/` 아래는 **React·DOM·브라우저 API 의존 금지.** 순수 함수만.
- 무작위성은 **주입된 `RNG`만** 사용. `Math.random()` 직접 호출 금지.
- 밸런스 수치는 코드에 하드코딩하지 않고 `src/game/data/`에 둔다.
- 게임 로직을 바꾸면 **대응하는 Vitest 케이스를 같은 커밋에** 넣는다.
- 응답·주석은 **한국어**. 식별자는 영어.
- 터치 타깃 **44px 이상** (`TOUCH_MIN`). 텍스트 정렬 기본 center, 배경은 항상 어둡게.
- 등급·색은 `src/ui/tokens.ts` 밖에서 하드코딩 금지.
- **퍼머데스는 협상 대상이 아니다.** 사망 영웅을 되살리는 경로를 만들지 않는다.
- 커밋 메시지는 한국어 본문 + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

**회귀 감지선 (매 태스크 후 확인):**
- `npm test` — 시작 시점 **595개** 통과. 신규분 외에 깨지면 그 태스크가 잘못된 것이다.
- `npm run typecheck` · `npm run build` 통과.
- **`npm run sim`의 1~20층 표가 안 변해야 한다** (6층 70%/1.35, 12층 43%, 20층 55%).
  움직였으면 "안전하다"가 아니라 **그 단계가 잘못됐다는 신호**다 — 되돌린다.

---

## File Structure

**신규**
- `src/game/data/party.ts` — 정원 규칙(층별 정원, 2군 개방 조건). 밸런스 수치 단일 출처
- `src/game/data/revisit.ts` — 재도전 보상 체감 계수. 튜닝 상수 단일 출처
- `src/game/party.test.ts` · `src/game/revisit.test.ts` — 순수 함수 테스트
- `src/stores/squad.test.ts` — 2군 편성·교체 잠금 스토어 테스트

**수정**
- `src/screens/BaseScreen.tsx:9` — `PARTY_LIMIT` 제거(정원은 `game/data/party.ts`로)
- `src/stores/runStore.ts` — `RunSlice.party` → `squads`, `maxFloorReached`/`revisits`/`lockedSquad` 추가, 역방향 import 제거
- `src/stores/save.ts` — `SAVE_VERSION` 2, `migrate()` v1 분기, 신규 필드 검증
- `src/screens/RosterScreen.tsx` — 편성 대상 전환 + 소속 배지
- `src/ui/HeroCard.tsx` — `squad?: 1 | 2` prop(배지)
- `src/ui/TowerMap.tsx` — 해금된 층 탭 → 층 선택
- `src/App.tsx` — `party` → `squads` 배선
- `src/screens/ForgeScreen.tsx` — `party` prop 소비부
- `src/game/data/floorgen.ts` — 적 기수 3~4 → 4~6
- `climb-check.mts` — `PARTY_LIMIT` 복제값 제거, 정원 규칙 import

---

### Task 1: 정원 규칙을 `game/data/party.ts`로 분리

**왜 먼저인가:** `runStore.ts`가 화면(`BaseScreen.tsx`)을 import하는 역방향 의존이 있고, `climb-check.mts`에는 값이 복제돼 있다. 정원이 구간별로 갈리는 순간 이 복제는 **반드시 어긋난다**(HANDOFF §5-21). 뒤 태스크가 전부 이 규칙을 읽으므로 여기가 출발점이다.

**Files:**
- Create: `src/game/data/party.ts`
- Create: `src/game/party.test.ts`
- Modify: `src/screens/BaseScreen.tsx:9` (`PARTY_LIMIT` 삭제)
- Modify: `src/stores/runStore.ts:55-57` (역방향 import 제거)
- Modify: `climb-check.mts:93-97` (복제값 제거)

**Interfaces:**
- Produces:
  - `SQUAD_COUNT: 2`
  - `SQUAD_OPEN_ROSTER: 8`
  - `SQUAD_OPEN_FLOOR: 21`
  - `partyLimitAt(floorId: number): number` — 1~20층 3, 21층~ 5
  - `squadsOpen(rosterSize: number, maxFloorReached: number): boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/party.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  partyLimitAt, squadsOpen, SQUAD_COUNT, SQUAD_OPEN_ROSTER, SQUAD_OPEN_FLOOR,
} from './data/party';

describe('partyLimitAt — 층 구간별 정원', () => {
  it('손으로 짠 구간(1~20층)은 3인이다', () => {
    // 검증된 승률 표(6층 70%, 12층 43%, 20층 55%)가 3인 기준이라 여기가 바뀌면 안 된다
    expect(partyLimitAt(1)).toBe(3);
    expect(partyLimitAt(20)).toBe(3);
  });

  it('생성 구간(21층~)은 5인이다', () => {
    expect(partyLimitAt(21)).toBe(5);
    expect(partyLimitAt(100)).toBe(5);
  });

  it('경계는 20/21층이다', () => {
    expect(partyLimitAt(20)).not.toBe(partyLimitAt(21));
  });

  it('범위 밖 입력도 정원을 돌려준다 — 화면이 방어 없이 부른다', () => {
    expect(partyLimitAt(0)).toBe(3);
    expect(partyLimitAt(-5)).toBe(3);
  });
});

describe('squadsOpen — 2군 개방 조건', () => {
  it('로스터 8인 이상 AND 21층 이상 도달해야 열린다', () => {
    expect(squadsOpen(8, 21)).toBe(true);
  });

  it('로스터가 모자라면 안 열린다', () => {
    expect(squadsOpen(7, 21)).toBe(false);
  });

  it('21층에 도달 못 했으면 안 열린다', () => {
    expect(squadsOpen(8, 20)).toBe(false);
  });

  it('둘 다 모자라면 안 열린다', () => {
    expect(squadsOpen(3, 1)).toBe(false);
  });
});

describe('상수', () => {
  it('2군까지 두 개다', () => {
    expect(SQUAD_COUNT).toBe(2);
  });

  it('개방 조건은 로스터 8인 · 21층이다', () => {
    // 1군 5 + 2군 3 = 8. 개방 시점에 1군을 채우고도 2군이 3인 남는다
    expect(SQUAD_OPEN_ROSTER).toBe(8);
    expect(SQUAD_OPEN_FLOOR).toBe(21);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/game/party.test.ts`
Expected: FAIL — `Failed to resolve import "./data/party"`

- [ ] **Step 3: 최소 구현**

`src/game/data/party.ts`:

```ts
/**
 * 파티 정원 규칙 — 밸런스 수치 단일 출처.
 *
 * ⚠️ 정원은 이 게임에서 **가장 센 밸런스 손잡이**다. 실측(생성 구간 완주율):
 *   정원 3 → 61~80구간 17% / 81~100구간  1%
 *   정원 4 → 94% / 83%
 *   정원 5 → 100% / 100%
 * 정원 하나가 전 구간을 100%로 만든다. 만졌으면 반드시 `npx tsx climb-check.mts`.
 *
 * ⚠️ 상수가 아니라 **함수**인 이유: 층 구간마다 값이 다르다.
 * 예전에는 `screens/BaseScreen.tsx`에 상수로 있었고 `climb-check.mts`가 값을
 * 복제해 뒀는데, 구간별로 갈리는 순간 그 복제는 반드시 어긋난다 (HANDOFF §5-21).
 */

/** 군의 개수 — 1군(최전선) / 2군(파밍) */
export const SQUAD_COUNT = 2;

/**
 * 2군 개방 조건: 로스터 인원.
 *
 * 8인 = 1군 5 + 2군 3. 개방 즉시 1군을 채우고도 2군에 3인이 남는다.
 * "열렸는데 못 쓴다"를 피하려는 것 — 시작 금 300 = 시설 딱 한 채분과 같은 원칙이다.
 */
export const SQUAD_OPEN_ROSTER = 8;

/** 2군 개방 조건: 도달 층. 정원이 5로 늘어나는 층과 같다 */
export const SQUAD_OPEN_FLOOR = 21;

/** 손으로 짠 구간의 정원. 검증된 승률 표가 이 값 기준이다 */
const PARTY_LIMIT_HANDCRAFTED = 3;
/** 생성 구간의 정원 */
const PARTY_LIMIT_GENERATED = 5;

/**
 * 층별 파티 정원.
 *
 * 1~20층이 3인으로 남는 것이 이 설계의 **회귀 감지선**이다 —
 * 손으로 짠 20개 층의 검증된 승률(6층 70%, 12층 43%, 20층 55%)이 보존되고,
 * 재튜닝 대상이 21층 이상으로 한정된다.
 */
export function partyLimitAt(floorId: number): number {
  return floorId >= SQUAD_OPEN_FLOOR ? PARTY_LIMIT_GENERATED : PARTY_LIMIT_HANDCRAFTED;
}

/**
 * 2군이 열렸는가.
 *
 * `maxFloorReached`(해금 상한)로 판정한다 — `floorIndex`로 보면 재도전으로
 * 아래층에 내려간 순간 2군이 닫힌다.
 */
export function squadsOpen(rosterSize: number, maxFloorReached: number): boolean {
  return rosterSize >= SQUAD_OPEN_ROSTER && maxFloorReached >= SQUAD_OPEN_FLOOR;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npm test -- src/game/party.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: 복제값과 역방향 의존을 걷어낸다**

`src/screens/BaseScreen.tsx` — 9번 줄 `export const PARTY_LIMIT = 3;`을 **삭제**한다.

`src/stores/runStore.ts` — 55~57번 줄을 삭제하고 정원 규칙 import로 바꾼다:

```ts
// 삭제할 것
/** 파티 정원. 게임 규칙이므로 스토어가 강제한다. */
export { PARTY_LIMIT } from '../screens/BaseScreen';
import { PARTY_LIMIT } from '../screens/BaseScreen';
```

```ts
// 대신 파일 상단 import 블록에 추가
import { partyLimitAt } from '../game/data/party';
```

그리고 `toggleParty`(330~337번 줄)의 `PARTY_LIMIT`을 `partyLimitAt(...)`으로 바꾼다.
이 시점엔 `floorIndex`가 아직 층 번호가 아니라 인덱스이므로 `FLOORS[s.floorIndex].id`로 층 번호를 얻는다:

```ts
    toggleParty: (id) =>
      set((s) => {
        const limit = partyLimitAt(FLOORS[s.floorIndex].id);
        return {
          party: s.party.includes(id)
            ? s.party.filter((x) => x !== id)
            : s.party.length >= limit
              ? s.party
              : [...s.party, id],
        };
      }),
```

`climb-check.mts` — 93~97번 줄의 주석과 `const PARTY_LIMIT = 3;`을 지우고 import로 바꾼다:

```ts
import { partyLimitAt } from './src/game/data/party';
```

137번 줄 `sorted.slice(0, PARTY_LIMIT)`을 `sorted.slice(0, partyLimitAt(floor.id))`로 바꾼다.
(`floor`는 그 루프가 이미 들고 있는 현재 층 객체다. 없으면 층 번호 변수를 쓴다.)

`PARTY_LIMIT`을 쓰던 다른 곳을 전부 찾아 고친다:

Run: `grep -rn "PARTY_LIMIT" src/ climb-check.mts`
Expected: 남은 참조 0건 (테스트 파일 포함)

- [ ] **Step 6: 전체 검증 — 여기서 sim을 반드시 뜬다**

```bash
npm test
npm run typecheck
npm run build
npm run sim > /tmp/sim-task1.txt
npx tsx climb-check.mts
```

Expected:
- 테스트 **608개** 통과 (595 + 신규 13)
- typecheck · build 통과
- **`npm run sim`의 1~20층 표가 기준선과 동일** — 6층 70%/1.35, 12층 43%, 20층 55%.
  아직 정원을 실제로 쓰는 곳이 없으므로 **반드시 같아야 한다.** 다르면 되돌린다.
- `climb-check.mts`가 **실행된다** (tsconfig 밖이라 typecheck가 안 본다 — HANDOFF §5-28)

- [ ] **Step 7: 커밋**

```bash
git add src/game/data/party.ts src/game/party.test.ts src/screens/BaseScreen.tsx src/stores/runStore.ts climb-check.mts
git commit -m "$(cat <<'EOF'
refactor: 정원 규칙을 game/data/party.ts로 분리

runStore(순수 계층)가 BaseScreen(화면)을 import하는 역방향 의존이었고
climb-check.mts에는 값이 복제돼 있었다. 정원이 구간별로 갈리면
(1~20층 3, 21층~ 5) 이 복제는 반드시 어긋난다 (HANDOFF §5-21).

상수가 아니라 함수로 둔다 — 층에 따라 값이 다르기 때문이다.

sim 1~20층 표 불변 확인. climb-check 실행 확인(tsconfig 밖이라
typecheck가 안 본다 — §5-28).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `maxFloorReached` 분리 + 세이브 v2

**왜 여기서 나누나:** 스펙 §7이 "2번이 가장 크다"고 한 단계를 **둘로 쪼갠다.** 저장 포맷 변경(Task 2)과 `squads` 구조 변경(Task 3)은 각각 독립적으로 테스트·리뷰 가능하고, 마이그레이션은 여전히 **한 번만** 일어난다(v2에서 두 변경을 같이 담되, 필드를 나눠 넣는다).

**Files:**
- Modify: `src/stores/runStore.ts` (`RunSlice`에 `maxFloorReached`/`revisits` 추가, `finish()` 진행 로직)
- Modify: `src/stores/save.ts` (`SAVE_VERSION` 2, `SavedRun`, `serialize`, `deserialize`, `migrate`)
- Test: `src/stores/save.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: Task 1의 `partyLimitAt`
- Produces:
  - `RunSlice.maxFloorReached: number` — 해금 상한(인덱스)
  - `RunSlice.revisits: Record<number, number>` — floorId → 재도전 횟수
  - `SAVE_VERSION = 2`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/stores/save.test.ts` 끝에 추가:

```ts
describe('세이브 v2 — maxFloorReached / revisits', () => {
  it('v1 세이브의 floorIndex가 maxFloorReached로 올라온다', () => {
    // v1엔 maxFloorReached가 없다. floorIndex가 "거기까지 갔다"는 뜻이므로 그 값이 정답이다.
    const v1 = JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      run: {
        floorIndex: 5,
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        party: ['h_ashen#1'],
      },
    });

    const out = deserialize(v1);
    expect(out).not.toBeNull();
    expect(out!.maxFloorReached).toBe(5);
    expect(out!.floorIndex).toBe(5);
  });

  it('v1 세이브의 revisits는 빈 객체가 된다', () => {
    const v1 = JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      run: {
        floorIndex: 3,
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        party: [],
      },
    });

    expect(deserialize(v1)!.revisits).toEqual({});
  });

  it('maxFloorReached는 floorIndex보다 작을 수 없다', () => {
    // 수동 편집 방어. 작으면 해금 상한이 현재 층보다 낮아 층 선택이 깨진다.
    const broken = JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      run: {
        floorIndex: 9,
        maxFloorReached: 2,
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        party: [],
      },
    });

    const out = deserialize(broken)!;
    expect(out.maxFloorReached).toBeGreaterThanOrEqual(out.floorIndex);
  });

  it('revisits의 음수·비정수·비숫자 값은 걸러진다', () => {
    const dirty = JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      run: {
        floorIndex: 0,
        maxFloorReached: 0,
        revisits: { 3: 2, 4: -1, 5: 'x', 6: 1.7 },
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        party: [],
      },
    });

    const out = deserialize(dirty)!;
    expect(out.revisits[3]).toBe(2);
    expect(out.revisits[4]).toBeUndefined();
    expect(out.revisits[5]).toBeUndefined();
    expect(out.revisits[6]).toBe(1);   // 내림
  });

  it('미래 버전(v3)은 여전히 읽지 않는다', () => {
    const v3 = JSON.stringify({ version: 3, savedAt: Date.now(), run: { floorIndex: 0, roster: [] } });
    expect(deserialize(v3)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/stores/save.test.ts`
Expected: FAIL — `maxFloorReached` / `revisits`가 `SavedRun`에 없어 타입 에러 또는 `undefined`

- [ ] **Step 3: `RunSlice`에 필드를 넣는다**

`src/stores/runStore.ts` — `RunSlice` 인터페이스(112번 줄 부근)에 추가:

```ts
export interface RunSlice {
  /**
   * 이번에 도전할 층(인덱스). 재도전으로 **앞뒤로 움직인다.**
   * 예전에는 이 값이 "현재 위치"와 "최대 진행도"를 겸했고 클리어 시 +1만 하는
   * 단방향이라 "1층으로 돌아간다"를 표현할 자리가 없었다.
   */
  floorIndex: number;
  /**
   * 해금 상한(인덱스). 최전선 진행은 이 값이 오를 때만 일어난다.
   *
   * ⚠️ `towerCleared` 판정은 **이 값**으로 한다. `floorIndex`로 하면
   * 100층을 깬 뒤 재도전으로 1층에 내려갔을 때 판정이 깨진다.
   */
  maxFloorReached: number;
  /** floorId → 재도전 횟수. 보상 체감의 입력이다 */
  revisits: Record<number, number>;
  // ...기존 필드
```

`freshSlice()`(294번 줄)에 추가:

```ts
    floorIndex: 0,
    maxFloorReached: 0,
    revisits: {},
```

`finish()`의 진행 로직(608~617번 줄)을 바꾼다:

```ts
        floorIndex: cleared
          ? Math.min(FLOORS.length - 1, s.floorIndex + 1)
          : s.floorIndex,
        /**
         * 최전선은 **`floorIndex`가 상한과 같을 때 클리어**해야 오른다.
         * 재도전(아래층)으로는 안 오른다 — 그래야 파밍이 진행을 대체하지 않는다.
         */
        maxFloorReached: cleared && s.floorIndex >= s.maxFloorReached
          ? Math.min(FLOORS.length - 1, s.maxFloorReached + 1)
          : s.maxFloorReached,
        /**
         * ⚠️ 판정 기준이 maxFloorReached다.
         * floorIndex로 하면 100층을 깬 뒤 1층에 내려가 있을 때 깨진다.
         */
        towerCleared: s.towerCleared
          || (cleared && s.floorIndex >= s.maxFloorReached && isFinalFloor(s.maxFloorReached)),
```

- [ ] **Step 4: 세이브 v2를 구현한다**

`src/stores/save.ts`:

```ts
export const SAVE_VERSION = 2;

export type SavedRun = Pick<
  RunSlice,
  'floorIndex' | 'maxFloorReached' | 'revisits' | 'roster' | 'party' | 'deathCount'
  | 'wallet' | 'gacha' | 'codex' | 'seenFirstLegendary' | 'towerCleared'
  | 'facilities' | 'gear' | 'gearSeq' | 'battleCount' | 'potions' | 'claimedQuests'
>;
```

`serialize()`의 `run` 객체에 두 줄 추가(`floorIndex` 바로 뒤):

```ts
      floorIndex: s.floorIndex,
      maxFloorReached: s.maxFloorReached,
      revisits: s.revisits,
```

`deserialize()` — `floorIndex` 계산(149~150번 줄) 바로 뒤에 넣는다:

```ts
  /*
    v1엔 maxFloorReached가 없다. floorIndex가 "거기까지 갔다"는 뜻이므로 그 값으로 채운다.
    상한이 현재 층보다 낮으면 층 선택이 깨지므로 floorIndex 이상으로 강제한다(수동 편집 방어).
  */
  const rawMax = typeof r.maxFloorReached === 'number' ? r.maxFloorReached : floorIndex;
  const maxFloorReached = Math.max(
    floorIndex,
    Math.min(FLOORS.length - 1, Math.floor(Number.isFinite(rawMax) ? rawMax : floorIndex)),
  );

  /*
    재도전 횟수. 음수·비정수·비숫자는 버린다 — 보상 계수의 입력이라
    이상값이 들어오면 배수가 튄다.
  */
  const rawRevisits = asObject(r.revisits) ?? {};
  const revisits: Record<number, number> = {};
  for (const [k, v] of Object.entries(rawRevisits)) {
    const floorId = Number(k);
    if (!Number.isInteger(floorId) || floorId < 1) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    revisits[floorId] = Math.floor(v);
  }
```

반환 객체(260~267번 줄)에 두 필드를 추가한다:

```ts
  return migrate(
    {
      floorIndex, maxFloorReached, revisits, roster: fixedRoster, party, deathCount,
      wallet, gacha, codex, seenFirstLegendary, towerCleared, facilities,
      gear: fixedGear, gearSeq, battleCount, potions, claimedQuests,
    },
    version,
  );
```

`migrate()` 주석을 갱신한다:

```ts
/**
 * 버전별 보정.
 *
 * v1 → v2: `maxFloorReached`와 `revisits`가 추가됐다.
 * 두 필드는 `deserialize()`가 이미 기본값으로 채우므로(없으면 floorIndex / {})
 * 여기서 따로 할 일이 없다. v0(version 필드가 없던 세이브)도 같은 경로를 탄다.
 *
 * 포맷을 또 바꾸면 여기에 분기를 넣고 SAVE_VERSION을 올릴 것.
 */
function migrate(run: SavedRun, _version: number): SavedRun {
  return run;
}
```

`hydrate`(986번 줄 부근)에도 복원을 추가한다 — 없으면 새로고침 때 상한이 사라진다:

```ts
        floorIndex: saved.floorIndex,
        maxFloorReached: saved.maxFloorReached,
        revisits: saved.revisits,
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npm test -- src/stores/save.test.ts`
Expected: PASS — 신규 5개 포함 전부 통과

- [ ] **Step 6: 죽은 테스트가 아닌지 확인한다 (§5-31)**

`maxFloorReached`의 `Math.max(floorIndex, ...)` 가드를 **일부러 제거**하고 테스트를 돌린다.

Run: `npm test -- src/stores/save.test.ts`
Expected: **FAIL** — "maxFloorReached는 floorIndex보다 작을 수 없다"가 깨진다.

깨지는 것을 확인한 뒤 **가드를 되돌린다.** 안 깨지면 그 테스트는 없는 것과 같다.

- [ ] **Step 7: 전체 검증**

```bash
npm test
npm run typecheck
npm run build
npm run sim > /tmp/sim-task2.txt
```

Expected:
- 테스트 **613개** 통과 (608 + 5)
- **sim 1~20층 표가 Task 1과 동일** — 진행 로직만 바꿨고 전투는 안 건드렸다

- [ ] **Step 8: 커밋**

```bash
git add src/stores/runStore.ts src/stores/save.ts src/stores/save.test.ts
git commit -m "$(cat <<'EOF'
feat: floorIndex에서 maxFloorReached를 분리 + 세이브 v2

floorIndex가 "현재 위치"와 "최대 진행도"를 겸하고 클리어 시 +1만 하는
단방향이라 재도전(아래층으로 돌아가기)을 표현할 자리가 없었다.

towerCleared 판정을 maxFloorReached 기준으로 바꿨다. floorIndex로 하면
100층을 깬 뒤 재도전으로 1층에 내려갔을 때 판정이 깨진다.

최전선은 floorIndex가 상한과 같을 때 클리어해야 오른다 — 재도전으로는
안 오르므로 파밍이 진행을 대체하지 않는다.

v1 세이브는 floorIndex를 maxFloorReached로 올려 손실 없이 읽힌다.
가드를 일부러 제거해 테스트가 실패하는 것을 확인한 뒤 되돌렸다(§5-31).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `party` → `squads` 2차원화

**Files:**
- Modify: `src/stores/runStore.ts` (`RunSlice.party` → `squads`, `lockedSquad`, `toggleParty` → `toggleSquadMember`)
- Modify: `src/stores/save.ts` (`squads` 직렬화·검증)
- Modify: `src/App.tsx:53` · `src/screens/RosterScreen.tsx` · `src/screens/ForgeScreen.tsx` · `src/screens/BaseScreen.tsx` (prop 배선)
- Create: `src/stores/squad.test.ts`

**Interfaces:**
- Consumes: Task 1 `partyLimitAt`/`squadsOpen`, Task 2 `maxFloorReached`
- Produces:
  - `RunSlice.squads: HeroInstId[][]` — 길이 항상 `SQUAD_COUNT`(2)
  - `RunSlice.lockedSquad: number | null`
  - `toggleSquadMember(squad: number, id: HeroInstId): void`
  - `activeSquad(s: RunSlice): HeroInstId[]` — 전투에 나가는 군(현재는 항상 0번)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/stores/squad.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRunStore } from './runStore';
import type { HeroInstId } from '../game/types';

const store = () => createRunStore(() => 42);

describe('squads — 편성', () => {
  it('초기 상태는 1군에 3인, 2군은 비어 있다', () => {
    const s = store().getState();
    expect(s.squads).toHaveLength(2);
    expect(s.squads[0]).toHaveLength(3);
    expect(s.squads[1]).toEqual([]);
  });

  it('한 영웅은 두 군에 동시에 들 수 없다 — 넣으면 원래 군에서 빠진다', () => {
    const st = store();
    const moved = st.getState().squads[0][0];

    st.getState().toggleSquadMember(1, moved);

    expect(st.getState().squads[0]).not.toContain(moved);
    expect(st.getState().squads[1]).toContain(moved);
  });

  it('같은 군에서 다시 누르면 빠진다', () => {
    const st = store();
    const id = st.getState().squads[0][0];

    st.getState().toggleSquadMember(0, id);

    expect(st.getState().squads[0]).not.toContain(id);
  });

  it('정원을 넘겨 넣을 수 없다', () => {
    const st = store();
    // 1층(정원 3)에서 시작한다. 이미 3인이므로 네 번째는 안 들어간다.
    const outsider = st.getState().roster.find(
      (h) => !st.getState().squads[0].includes(h.instId),
    )!;

    st.getState().toggleSquadMember(0, outsider.instId);

    expect(st.getState().squads[0]).toHaveLength(3);
    expect(st.getState().squads[0]).not.toContain(outsider.instId);
  });

  it('죽은 영웅은 편성할 수 없다', () => {
    const st = store();
    const victim = st.getState().roster.find(
      (h) => !st.getState().squads[0].includes(h.instId),
    )!;
    st.setState((s) => ({
      roster: s.roster.map((h) => (h.instId === victim.instId ? { ...h, isDead: true } : h)),
      squads: [[], []],
    }));

    st.getState().toggleSquadMember(0, victim.instId);

    expect(st.getState().squads[0]).not.toContain(victim.instId);
  });

  it('없는 id는 무시된다', () => {
    const st = store();
    const before = st.getState().squads[0].length;

    st.getState().toggleSquadMember(0, 'nope#999' as HeroInstId);

    expect(st.getState().squads[0]).toHaveLength(before);
  });
});

describe('lockedSquad — 교체 잠금', () => {
  it('초기에는 잠금이 없다', () => {
    expect(store().getState().lockedSquad).toBeNull();
  });

  it('잠긴 군은 편성이 바뀌지 않는다', () => {
    const st = store();
    st.setState({ lockedSquad: 0 });
    const before = [...st.getState().squads[0]];

    st.getState().toggleSquadMember(0, before[0]);

    expect(st.getState().squads[0]).toEqual(before);
  });

  it('잠기지 않은 군은 여전히 편성된다', () => {
    const st = store();
    st.setState({ lockedSquad: 0 });
    const id = st.getState().roster.find(
      (h) => !st.getState().squads[0].includes(h.instId),
    )!.instId;

    st.getState().toggleSquadMember(1, id);

    expect(st.getState().squads[1]).toContain(id);
  });
});

describe('저장 왕복 (§5-32)', () => {
  it('squads와 lockedSquad가 저장·복원된다', () => {
    const st = store();
    const id = st.getState().roster.find(
      (h) => !st.getState().squads[0].includes(h.instId),
    )!.instId;
    st.getState().toggleSquadMember(1, id);
    st.setState({ lockedSquad: 1 });

    // serialize → deserialize 왕복
    const { serialize, deserialize } = require('./save');
    const restored = deserialize(serialize(st.getState()))!;

    expect(restored.squads[1]).toContain(id);
    expect(restored.lockedSquad).toBe(1);
  });

  it('두 군에 중복으로 든 영웅은 복원 시 교정된다', () => {
    const { deserialize } = require('./save');
    const raw = JSON.stringify({
      version: 2,
      savedAt: Date.now(),
      run: {
        floorIndex: 0,
        maxFloorReached: 0,
        roster: [{ instId: 'h_ashen#1', defId: 'h_ashen', star: 2, level: 15, isDead: false }],
        squads: [['h_ashen#1'], ['h_ashen#1']],
      },
    });

    const out = deserialize(raw)!;
    const flat = out.squads.flat();
    expect(new Set(flat).size).toBe(flat.length);   // 중복 없음
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/stores/squad.test.ts`
Expected: FAIL — `squads` / `toggleSquadMember` / `lockedSquad`가 없다

- [ ] **Step 3: 스토어를 바꾼다**

`src/stores/runStore.ts`:

```ts
import { partyLimitAt, SQUAD_COUNT } from '../game/data/party';

export interface RunSlice {
  // ...
  /**
   * 편성. `[1군, 2군]`이고 길이는 항상 SQUAD_COUNT다.
   *
   * 1군 = 최전선 정복 / 2군 = 이미 깬 층 파밍.
   * **한 영웅은 두 군에 동시에 못 든다** — 스토어가 강제하고 save.ts가 복원 시 교정한다.
   */
  squads: HeroInstId[][];
  /**
   * 직전 전투에 나간 군. 다음 전투까지 편성이 잠긴다.
   *
   * 저장 대상이다 — 새로고침으로 풀리면 규칙이 없는 것과 같다.
   * "이 전투에 누굴 보낼지"가 되돌릴 수 없는 결정이 되어 퍼머데스와 결이 맞는다.
   */
  lockedSquad: number | null;
}
```

`freshSlice()`:

```ts
    squads: [roster.slice(0, 3).map((h) => h.instId), []],
    lockedSquad: null,
```

`RunSlice.party`를 **삭제**하고, 전투에 나가는 군을 읽는 관문을 둔다:

```ts
/**
 * 전투에 나가는 군.
 *
 * 지금은 항상 1군이다 — 2군은 "층 선택으로 파밍하는" 쪽이라 출전 자체는
 * 같은 경로를 탄다(턴제: 한 번에 한 군). 어느 군이 나가는지는 호출부가 정한다.
 */
export function squadMembers(s: Pick<RunSlice, 'squads'>, squad: number): HeroInstId[] {
  return s.squads[squad] ?? [];
}
```

`toggleParty`를 `toggleSquadMember`로 교체한다:

```ts
    toggleSquadMember: (squad, id) =>
      set((s) => {
        // 잠긴 군은 못 바꾼다. 화면도 막지만 스토어가 정본이다.
        if (s.lockedSquad === squad) return {};
        if (squad < 0 || squad >= SQUAD_COUNT) return {};

        const hero = s.roster.find((h) => h.instId === id);
        // 없는 id·죽은 영웅은 무시한다. 죽은 자를 편성하면 유령 참조가 된다.
        if (!hero || hero.isDead) return {};

        const limit = partyLimitAt(FLOORS[s.floorIndex].id);
        const cur = s.squads[squad] ?? [];

        // 같은 군에 이미 있으면 뺀다
        if (cur.includes(id)) {
          const next = s.squads.map((m, i) => (i === squad ? m.filter((x) => x !== id) : m));
          return { squads: next };
        }

        if (cur.length >= limit) return {};

        /*
          다른 군에 들어 있으면 거기서 빼고 여기로 옮긴다.
          막지 않는 이유: UI에서 "이동"이 조작 수가 적다. 금지는 스토어가
          "두 군에 동시에 못 든다"로만 지키면 된다.
          단, 상대 군이 잠겨 있으면 옮길 수 없다 — 잠금이 우회되기 때문이다.
        */
        const owner = s.squads.findIndex((m) => m.includes(id));
        if (owner !== -1 && s.lockedSquad === owner) return {};

        const next = s.squads.map((m, i) => {
          if (i === owner) return m.filter((x) => x !== id);
          if (i === squad) return [...m, id];
          return m;
        });
        return { squads: next };
      }),
```

`party`를 읽던 나머지 지점을 전부 고친다:

- `finish()` 600번 줄 `party: s.party.filter(...)` → `squads: s.squads.map((m) => m.filter((id) => !casualties.has(id)))`
- `finish()` 664번 줄 `after.party.includes(...)` → `after.squads.flat().includes(...)`
- `fuse()` 824번 줄 `party: s.party.filter((id) => id !== r.consumedInstId)` → `squads: s.squads.map((m) => m.filter((id) => id !== r.consumedInstId))`
- `start()`/`intervene()` 375·398번 줄의 `party: members`는 전투 입력이라 이름을 유지한다(엔진의 `party`는 `HeroInstance[]`로 별개 개념이다)

**출전 시 잠금을 건다** — `finish()`의 set 안에 추가:

```ts
        // 출전한 군은 다음 전투까지 편성이 잠긴다
        lockedSquad: s.lastSortieSquad ?? 0,
```

여기서 `lastSortieSquad`는 `start()`가 기록한다. `start()`에 인자를 추가한다:

```ts
    start: (squad = 0) => {
      // ...기존 로직에서 members를 squads[squad]로 뽑는다
      set({ lastSortieSquad: squad, lockedSquad: null });
    },
```

`RunSlice`에 `lastSortieSquad: number`를 추가하고 `freshSlice()`에서 `0`으로 둔다.

- [ ] **Step 4: 세이브에 `squads`를 넣는다**

`src/stores/save.ts`:

```ts
export type SavedRun = Pick<
  RunSlice,
  'floorIndex' | 'maxFloorReached' | 'revisits' | 'roster' | 'squads' | 'lockedSquad'
  | 'deathCount' | 'wallet' | 'gacha' | 'codex' | 'seenFirstLegendary' | 'towerCleared'
  | 'facilities' | 'gear' | 'gearSeq' | 'battleCount' | 'potions' | 'claimedQuests'
>;
```

`serialize()`에서 `party: s.party`를 지우고:

```ts
      squads: s.squads,
      lockedSquad: s.lockedSquad,
```

`deserialize()`에서 `party` 계산(146~147번 줄)을 교체한다:

```ts
  /*
    편성 복원.
      - 죽었거나 없는 영웅은 걸러낸다
      - **두 군에 중복으로 든 영웅은 앞선 군만 남긴다** — 한쪽에만 남기지 않으면
        전투에 두 번 나가거나 보정이 이중으로 걸린다
      - v1 세이브의 `party`는 1군으로 올린다
      - 길이는 항상 SQUAD_COUNT로 맞춘다(모자라면 빈 배열로 채운다)
  */
  const rawSquads: unknown[] = Array.isArray(r.squads)
    ? r.squads
    : [Array.isArray(r.party) ? r.party : [], []];

  const takenMember = new Set<HeroInstId>();
  const squads: HeroInstId[][] = [];
  for (let i = 0; i < SQUAD_COUNT; i += 1) {
    const raw = Array.isArray(rawSquads[i]) ? (rawSquads[i] as unknown[]) : [];
    const members: HeroInstId[] = [];
    for (const id of raw) {
      if (typeof id !== 'string') continue;
      const hid = id as HeroInstId;
      if (!ids.has(hid) || takenMember.has(hid)) continue;
      takenMember.add(hid);
      members.push(hid);
    }
    squads.push(members);
  }

  const rawLocked = r.lockedSquad;
  const lockedSquad = typeof rawLocked === 'number'
    && Number.isInteger(rawLocked)
    && rawLocked >= 0
    && rawLocked < SQUAD_COUNT
    ? rawLocked
    : null;
```

`save.ts` 상단에 `import { SQUAD_COUNT } from '../game/data/party';`를 추가하고, 반환 객체의 `party`를 `squads, lockedSquad`로 바꾼다.

- [ ] **Step 5: 화면 배선을 고친다**

- `src/App.tsx:53` — `const party = useRunStore((s) => s.party)` → `const squads = useRunStore((s) => s.squads)`
- `RosterScreen` / `ForgeScreen` / `BaseScreen`의 `party: HeroInstId[]` prop → `squads: HeroInstId[][]`
  (이 태스크에서는 **1군만 표시**한다 — 편성 UI는 Task 4다. `squads[0]`을 넘기면 화면이 지금과 동일하게 동작한다)

Run: `grep -rn "\.party\b" src/ | grep -v "\.test\." | grep -v "encounter\|sim\|roster.ts"`
Expected: 남은 참조 0건

- [ ] **Step 6: 통과 확인 + 죽은 테스트 검증**

Run: `npm test -- src/stores/squad.test.ts`
Expected: PASS (10 tests)

그다음 **"두 군에 동시에 못 든다" 가드를 일부러 제거**한다 (`toggleSquadMember`의 `owner` 처리를 지운다).

Run: `npm test -- src/stores/squad.test.ts`
Expected: **FAIL** — "한 영웅은 두 군에 동시에 들 수 없다"가 깨진다. 확인 후 되돌린다.

- [ ] **Step 7: 전체 검증**

```bash
npm test
npm run typecheck
npm run build
npm run sim > /tmp/sim-task3.txt
npx tsx climb-check.mts
```

Expected:
- 테스트 **623개** 통과 (613 + 10)
- **sim 1~20층 표 불변** — 편성 자료구조만 바꿨고 전투 입력은 그대로다
- `climb-check.mts` 실행됨

- [ ] **Step 8: 커밋**

```bash
git add src/stores/ src/App.tsx src/screens/
git commit -m "$(cat <<'EOF'
feat: party를 squads(1군/2군) 2차원 구조로 전환

1군은 최전선 정복, 2군은 이미 깬 층 파밍. 한 영웅은 두 군에 동시에
들 수 없고 스토어가 강제한다 — 복원 시에도 교정하므로 수동 편집으로
중복이 들어와도 앞선 군만 남는다(전투 이중 출전 방지).

출전한 군은 다음 전투까지 편성이 잠긴다(lockedSquad). 저장 대상이다 —
새로고침으로 풀리면 규칙이 없는 것과 같다.

v1 세이브의 party는 1군으로 올라온다.
중복 가드를 일부러 제거해 테스트가 실패하는 것을 확인한 뒤 되돌렸다(§5-31).

sim 1~20층 표 불변 확인.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 편성 UI — `RosterScreen` 확장

**Files:**
- Modify: `src/screens/RosterScreen.tsx`
- Modify: `src/ui/HeroCard.tsx` (`squad?: 1 | 2` prop)
- Modify: `src/App.tsx` (prop 배선)

**Interfaces:**
- Consumes: Task 1 `partyLimitAt`/`squadsOpen`, Task 3 `squads`/`lockedSquad`/`toggleSquadMember`
- Produces: 없음(화면 종단)

- [ ] **Step 1: `HeroCard`에 소속 배지를 넣는다**

`src/ui/HeroCard.tsx` — props에 추가:

```ts
  /**
   * 소속 군(1 또는 2). 없으면 미편성.
   *
   * `selected`(테두리)만으로는 "어느 군인지"를 표현하지 못한다 —
   * 두 군을 오가며 편성하므로 소속이 카드에 보여야 한다.
   */
  squad?: 1 | 2;
```

카드 우상단(즐겨찾기 ❖ 반대편, 좌상단)에 배지를 그린다. `favorite`와 자리가 겹치지 않게 한다:

```tsx
{squad != null && (
  <div
    style={{
      position: 'absolute',
      top: 4,
      left: 4,
      width: 18,
      height: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      borderRadius: '50%',
      background: T.panel,
      border: `1px solid ${squad === 1 ? T.gold : T.dim}`,
      color: squad === 1 ? T.gold : T.dim,
      pointerEvents: 'none',
    }}
  >
    {squad === 1 ? '①' : '②'}
  </div>
)}
```

⚠️ **`T.gold`/`T.panel`/`T.dim`이 `tokens.ts`에 실제로 있는지 먼저 확인할 것.** 없으면 있는 토큰을 쓴다 — 색을 새로 하드코딩하면 안 된다(절대 규칙).

- [ ] **Step 2: `RosterScreen`에 전환 버튼을 넣는다**

props를 바꾼다:

```ts
export interface RosterScreenProps {
  roster: HeroInstance[];
  squads: HeroInstId[][];
  /** 지금 편성 중인 군 */
  editing: number;
  onEditingChange: (squad: number) => void;
  /** 층별 정원 */
  partyLimit: number;
  /** 2군이 열렸는가 */
  squadsUnlocked: boolean;
  /** 잠긴 군(직전 전투 출전) */
  lockedSquad: number | null;
  onToggleParty: (squad: number, id: HeroInstId) => void;
  onInspect: (hero: HeroInstance) => void;
}
```

`SectionLabel` 자리에 전환 버튼 두 개를 둔다:

```tsx
<div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
  {[0, 1].map((i) => {
    const locked = lockedSquad === i;
    const unavailable = i === 1 && !squadsUnlocked;
    const label = i === 0 ? '1군' : '2군';
    const role = i === 0 ? '최전선' : '파밍';
    return (
      <button
        key={i}
        onClick={() => !unavailable && onEditingChange(i)}
        disabled={unavailable}
        style={{
          flex: 1,
          minHeight: TOUCH_MIN,
          padding: '8px 6px',
          background: editing === i ? T.panelHi : 'transparent',
          border: `1px solid ${editing === i ? T.gold : T.panelHi}`,
          color: unavailable ? T.dim : T.text,
          fontFamily: 'inherit',
          fontSize: 12,
          cursor: unavailable ? 'default' : 'pointer',
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        {unavailable
          ? `${label} 🔒 로스터 ${SQUAD_OPEN_ROSTER}인부터`
          : `${label} ${squads[i].length}/${partyLimit}${locked ? ' 🔒' : ''}`}
        <br />
        <span style={{ fontSize: 10, color: T.dim }}>{role}</span>
      </button>
    );
  })}
</div>

{lockedSquad === editing && (
  <div style={{ textAlign: 'center', fontSize: 11, color: T.dim, marginBottom: 12, lineHeight: 1.8 }}>
    직전 전투에 나갔습니다.
    <br />
    다음 전투까지 편성할 수 없습니다.
  </div>
)}
```

> ⚠️ **미개방일 때 버튼을 숨기지 않는다.** 숨기면 "그런 기능이 없다"로 읽힌다 — STEP 6에서 시설이 전부 잠긴 채 열려 "아직 열리지 않은 컨텐츠"로 오독됐던 것과 같은 함정이다.

카드 렌더에서 `selected`와 `squad`를 넘긴다:

```tsx
const memberOf = squads.findIndex((m) => m.includes(h.instId));
// ...
<HeroCard
  // ...기존 props
  selected={memberOf === editing}
  squad={memberOf === -1 ? undefined : ((memberOf + 1) as 1 | 2)}
  onClick={() => onToggleParty(editing, h.instId)}
/>
```

- [ ] **Step 3: `App.tsx`를 배선한다**

```tsx
const [editingSquad, setEditingSquad] = useState(0);
const squads = useRunStore((s) => s.squads);
const lockedSquad = useRunStore((s) => s.lockedSquad);
const maxFloorReached = useRunStore((s) => s.maxFloorReached);
const roster = useRunStore((s) => s.roster);
const floorIndex = useRunStore((s) => s.floorIndex);

// ...
<RosterScreen
  roster={roster}
  squads={squads}
  editing={editingSquad}
  onEditingChange={setEditingSquad}
  partyLimit={partyLimitAt(FLOORS[floorIndex].id)}
  squadsUnlocked={squadsOpen(livingHeroes(roster).length, FLOORS[maxFloorReached].id)}
  lockedSquad={lockedSquad}
  onToggleParty={(squad, id) => useRunStore.getState().toggleSquadMember(squad, id)}
  onInspect={setDetail}
/>
```

- [ ] **Step 4: 좌표를 실측한다 (§5-33 · §5-40)**

`npm run dev`를 띄우고 브라우저에서 **375×667과 430×932 양쪽**을 잰다.
한 사이즈만 재면 그 사이즈가 특이점인지 알 수 없다(§5-40 — STEP 23이 390px에서만 통과했다).

```js
// 전환 버튼이 44px 이상인가
[...document.querySelectorAll('button')].map(b => b.getBoundingClientRect().height).filter(h => h < 44)
// 기대: []

// 배지가 이름줄을 덮지 않는가 (§5-44 — 잘림과 가림은 다르다)
// 배지 rect와 이름 rect를 겹쳐본다
```

Expected: 44px 미만 버튼 0개, 가로 넘침 0(`scrollWidth === clientWidth`), 배지·이름 겹침 0

> ⚠️ **확인용 클릭은 새 세이브에서 하거나 읽기 전용 측정만 할 것.** 이 게임에서 오조작 한 번은 영구 손실이다(HANDOFF STEP 23의 사고).

- [ ] **Step 5: 전체 검증**

```bash
npm test
npm run typecheck
npm run build
```

Expected: 623개 통과(신규 테스트 없음 — 화면 태스크), typecheck·build 통과

- [ ] **Step 6: 커밋**

```bash
git add src/screens/RosterScreen.tsx src/ui/HeroCard.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat: 편성 UI — 1군/2군 전환과 소속 배지

새 화면을 만들지 않고 RosterScreen을 확장했다. 대기실은 STEP 20에서
목록을 떼어내 "로스터가 늘어도 높이 불변"을 얻은 곳이라 되돌리면 안 된다.

selected(테두리)만으로는 어느 군인지 표현이 안 되므로 카드에 소속
배지를 넣었다. 다른 군에 든 영웅을 누르면 거기서 빼고 옮긴다 —
금지가 아니라 이동으로 처리하는 쪽이 조작 수가 적다.

2군 미개방 시 버튼을 숨기지 않고 조건을 적는다. 숨기면 "그런 기능이
없다"로 읽힌다 — STEP 6에서 시설이 잠긴 채 열려 오독됐던 것과 같다.

잠긴 군은 사유를 함께 띄운다. 설명 없이 안 눌리면 고장으로 읽힌다.

375×667·430×932 양쪽에서 좌표 실측(§5-40 — 한 사이즈만 재면 그게
특이점인지 알 수 없다).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 재도전 보상 체감 + 층 선택

**Files:**
- Create: `src/game/data/revisit.ts`
- Create: `src/game/revisit.test.ts`
- Modify: `src/stores/runStore.ts` (`finish()`에서 계수 적용, `revisits` 증가, `selectFloor`)
- Modify: `src/ui/TowerMap.tsx` (해금된 층 탭)

**Interfaces:**
- Consumes: Task 2 `maxFloorReached`/`revisits`
- Produces:
  - `revisitMultiplier(floorId: number, maxFloorReachedId: number, revisitCount: number): number`
  - `selectFloor(index: number): void`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/revisit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { revisitMultiplier } from './data/revisit';

describe('revisitMultiplier', () => {
  it('최전선 첫 도전은 정확히 1.0이다', () => {
    // ⚠️ 이게 기준선 보존의 증거다. 1.0이 아니면 기존 밸런스가 통째로 움직인다.
    expect(revisitMultiplier(90, 90, 0)).toBe(1);
    expect(revisitMultiplier(1, 1, 0)).toBe(1);
  });

  it('최전선에서 멀수록 깎인다', () => {
    const near = revisitMultiplier(89, 90, 0);
    const far = revisitMultiplier(50, 90, 0);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeLessThan(1);
  });

  it('거리 계수는 하한 0.15에서 멈춘다', () => {
    // 1층 파밍이 무의미해지되 0은 아니다 — 0이면 죽은 칸이 된다
    expect(revisitMultiplier(1, 100, 0)).toBeCloseTo(0.15, 5);
  });

  it('같은 층을 반복하면 깎인다', () => {
    const first = revisitMultiplier(90, 90, 0);
    const second = revisitMultiplier(90, 90, 1);
    const third = revisitMultiplier(90, 90, 2);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it('횟수 계수는 하한 0.3에서 멈춘다', () => {
    const many = revisitMultiplier(90, 90, 99);
    expect(many).toBeCloseTo(0.3, 5);
  });

  it('단조감소한다 — 반복할수록 이득이 늘지 않는다', () => {
    let prev = Infinity;
    for (let n = 0; n < 10; n += 1) {
      const cur = revisitMultiplier(90, 90, n);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  it('배수는 항상 0보다 크고 1 이하다', () => {
    for (let floor = 1; floor <= 100; floor += 7) {
      for (let n = 0; n < 5; n += 1) {
        const m = revisitMultiplier(floor, 100, n);
        expect(m).toBeGreaterThan(0);
        expect(m).toBeLessThanOrEqual(1);
      }
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/game/revisit.test.ts`
Expected: FAIL — `Failed to resolve import "./data/revisit"`

- [ ] **Step 3: 구현**

`src/game/data/revisit.ts`:

```ts
/**
 * 기존 층 재도전 — 보상 체감 계수. 튜닝 상수 단일 출처.
 *
 * 두 축을 곱한다:
 *   거리 — 최전선에서 멀수록 깎는다. 스케일을 맞추는 역할
 *   횟수 — 같은 층을 반복할수록 깎는다. 층을 갈아타게 만드는 압력
 *
 * 거리만 쓰면 같은 층 무한 반복이 안 막히고(89층을 100번 돌면 100번치),
 * 횟수만 쓰면 1층 파밍이 고층과 같은 값을 준다.
 *
 * ⚠️ 이 값들은 실측이 아니라 역산이다. 구현 후 `npx tsx climb-check.mts`로
 * 재조정할 것 — 파밍이 너무 세면 등반이 무의미해지고, 너무 약하면 2군이 죽는다.
 */

/** 최전선에서 1층 멀어질 때마다 깎이는 비율 */
const DISTANCE_DECAY = 0.04;
/** 거리 계수 하한. 0이면 그 층이 "가면 안 되는 곳"이 되어 미니맵의 죽은 칸이 된다 */
const DISTANCE_FLOOR = 0.15;

/** 재도전 1회마다 곱해지는 비율 */
const REPEAT_DECAY = 0.7;
/** 횟수 계수 하한. 0.3이면 "돌 수는 있지만 다른 층이 낫다"가 된다 */
const REPEAT_FLOOR = 0.3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 재도전 보상 배수 (0 초과 ~ 1 이하).
 *
 * ⚠️ **최전선 첫 도전은 정확히 1.0이어야 한다.** 이게 기존 밸런스 기준선이
 * 보존된다는 증거다 — `revisit.test.ts`가 이 값을 잠근다.
 *
 * @param floorId            도전하는 층 번호 (1-based)
 * @param maxFloorReachedId  해금 상한 층 번호 (1-based)
 * @param revisitCount       이 층을 이미 깬 횟수
 */
export function revisitMultiplier(
  floorId: number,
  maxFloorReachedId: number,
  revisitCount: number,
): number {
  const distance = Math.max(0, maxFloorReachedId - floorId);
  const dist = clamp(1 - distance * DISTANCE_DECAY, DISTANCE_FLOOR, 1);

  const repeats = Math.max(0, Math.floor(revisitCount));
  const rep = Math.max(REPEAT_FLOOR, REPEAT_DECAY ** repeats);

  return dist * rep;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/game/revisit.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: `finish()`에 계수를 적용한다**

`src/stores/runStore.ts` — 보상 계산부에서 `reward`를 구한 직후 계수를 곱한다:

```ts
import { revisitMultiplier } from '../game/data/revisit';

// finish() 안, reward를 구한 뒤
const curFloorId = FLOORS[s.floorIndex].id;
const maxFloorId = FLOORS[s.maxFloorReached].id;
const mult = revisitMultiplier(curFloorId, maxFloorId, s.revisits[curFloorId] ?? 0);

// exp·gold·승급석에 곱한다. 과제 보상(questGold/questStones)에는 곱하지 않는다 —
// claimedQuests가 이미 재수령을 막으므로 파밍 대상이 아니다.
const scaledGold = Math.round((reward?.gold ?? 0) * mult);
const scaledStones = Math.round((reward?.promotionStones ?? 0) * mult);
const scaledExp = Math.round((reward?.exp ?? 0) * mult);
```

`wallet` 갱신에서 `reward?.gold`/`reward?.promotionStones`를 `scaledGold`/`scaledStones`로 바꾸고, 경험치 지급에서 `reward.exp`를 `scaledExp`로 바꾼다.

**`revisits`를 올린다** — `cleared`일 때만이다:

```ts
        /**
         * ⚠️ 클리어했을 때만 올린다. 져도 올리면 "실패로 보상을 깎는"
         * 이중 처벌이 된다 — 진 전투는 보상 자체가 없으므로 순손실이다.
         */
        revisits: cleared
          ? { ...s.revisits, [curFloorId]: (s.revisits[curFloorId] ?? 0) + 1 }
          : s.revisits,
```

**층 선택 액션을 추가한다:**

```ts
    /**
     * 도전할 층을 고른다. 해금 상한 안에서만 움직인다.
     * 최전선 진행은 `maxFloorReached`가 맡으므로 여기서는 안 건드린다.
     */
    selectFloor: (index) =>
      set((s) => ({
        floorIndex: Math.max(0, Math.min(s.maxFloorReached, Math.floor(index))),
      })),
```

- [ ] **Step 6: `TowerMap`에 층 선택을 붙인다**

`src/ui/TowerMap.tsx` — 층 칸에 `onSelect` prop을 받아, **해금된 층만** 눌리게 한다:

```tsx
// props에 추가
  /** 해금 상한(인덱스). 이 위는 못 고른다 */
  maxFloorReached: number;
  onSelectFloor?: (index: number) => void;
```

각 층 칸을 `<button>`으로 감싸되 **44px 터치 타깃**을 지킨다. 잠긴 층(`index > maxFloorReached`)은 `disabled`다.

> ⚠️ **`column-reverse`와 `grid`의 방향 함정을 건드리지 말 것**(§5-29). 지금 구조가 "아래에서 위로"를 맞춰놨다 — 칸을 버튼으로 바꾸되 **DOM 순서는 유지**한다.

- [ ] **Step 7: 죽은 테스트 검증 (§5-31)**

`revisitMultiplier`의 `REPEAT_FLOOR`를 `0`으로 **일부러 바꾼다.**

Run: `npm test -- src/game/revisit.test.ts`
Expected: **FAIL** — "횟수 계수는 하한 0.3에서 멈춘다"가 깨진다. 확인 후 되돌린다.

- [ ] **Step 8: 전체 검증 — 기준선 보존이 핵심이다**

```bash
npm test
npm run typecheck
npm run build
npm run sim > /tmp/sim-task5.txt
npx tsx climb-check.mts
```

Expected:
- 테스트 **630개** 통과 (623 + 7)
- **sim 1~20층 표 불변.** sim은 재도전 경로를 안 타므로 반드시 같아야 한다
- **최전선 첫 도전 보상이 변경 전과 동일한가** — 계수가 1.0이므로 한 원도 다르면 안 된다.
  스토어 테스트로 확인: 새 런에서 1층을 깨고 `wallet.gold` 증가분을 변경 전과 비교한다

- [ ] **Step 9: 커밋**

```bash
git add src/game/data/revisit.ts src/game/revisit.test.ts src/stores/runStore.ts src/ui/TowerMap.tsx
git commit -m "$(cat <<'EOF'
feat: 기존 층 재도전 — 보상 체감 + 층 선택

거리(최전선과의 차이)와 횟수(revisits) 두 축을 곱한다. 거리만 쓰면
같은 층 무한 반복이 안 막히고, 횟수만 쓰면 1층이 고층과 같은 값을 준다.

최전선 첫 도전은 계수가 정확히 1.0이라 기존 밸런스 기준선이 보존된다 —
테스트가 이 값을 잠근다.

하한을 0으로 두지 않았다(거리 0.15 / 횟수 0.3). 0이면 그 층이 "가면
안 되는 곳"이 되어 미니맵의 죽은 칸이 된다.

revisits는 클리어했을 때만 올린다. 져도 올리면 실패로 보상을 깎는
이중 처벌이 된다 — 진 전투는 보상 자체가 없어 순손실이다.

과제 보상에는 안 곱한다. claimedQuests가 이미 재수령을 막는다.

계수 하한을 일부러 0으로 바꿔 테스트가 실패하는 것을 확인한 뒤
되돌렸다(§5-31). sim 1~20층 표 불변 확인.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `floorgen.ts` 적 기수 확장

**왜 튜너보다 앞인가:** `floor-tune.mts`는 **변형 번호를 고르는 도구**지 적을 강하게 만드는 도구가 아니다. 지금 변형 24개는 전부 3인 기준 후보라 **그 안에 5인용 난이도가 없다** — 24개를 다 돌려도 최선이 100%다. 생성기를 먼저 키워야 튜너가 고를 것이 생긴다.

**Files:**
- Modify: `src/game/data/floorgen.ts`
- Modify: `src/game/floors.test.ts` (역할 중복 상한 불변조건 추가)

**Interfaces:**
- Consumes: 없음
- Produces: 생성 층의 적 기수 4~6

- [ ] **Step 1: 역할 중복 상한 테스트를 먼저 쓴다**

`src/game/floors.test.ts`에 추가:

```ts
describe('생성 층 — 역할 중복 상한', () => {
  it('같은 역할의 적이 3기 이상 겹치지 않는다', () => {
    /*
      §5-19: 같은 디버프를 주는 적을 겹쳐 쌓으면 급격하게 무너진다.
      방깎 2기로 16층이 8%(전멸), 광역 2기로 19층이 97%→25%가 됐다.
      기수를 늘리면 중복 확률이 구조적으로 오르므로 상한을 명시한다.
    */
    for (let id = 21; id <= 100; id += 1) {
      const floor = FLOORS[id - 1];
      const byRole = new Map<string, number>();
      for (const e of floor.enemyIds) {
        const role = gameData.enemies[e].role;
        byRole.set(role, (byRole.get(role) ?? 0) + 1);
      }
      for (const [role, n] of byRole) {
        expect(n, `${id}층 ${role} ${n}기`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('생성 층의 적은 4~6기다', () => {
    for (let id = 21; id <= 100; id += 1) {
      const n = FLOORS[id - 1].enemyIds.length;
      expect(n, `${id}층`).toBeGreaterThanOrEqual(4);
      expect(n, `${id}층`).toBeLessThanOrEqual(6);
    }
  });

  it('손으로 짠 1~20층은 안 건드린다', () => {
    // 회귀 감지선. 정원 3 구간이라 구성이 변하면 검증된 승률이 무너진다.
    // 6층(균열의 심장)은 보스 단독 구성이다 — 실측 확인함(floors.ts:74-80).
    expect(FLOORS[5].id).toBe(6);
    expect(FLOORS[5].enemyIds).toEqual([ENEMY.golem]);
    expect(FLOORS[5].isBoss).toBe(true);
  });
});
```

> ⚠️ **필드 이름은 `enemyIds`다** (`enemies`가 아니다 — 실측 확인함).
> `ENEMY` 상수는 `src/game/data/enemies.ts`에서 import한다.
> 위 역할 중복 테스트에서도 `floor.enemies`가 아니라 `floor.enemyIds`를 순회할 것.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/game/floors.test.ts`
Expected: FAIL — 지금은 3~4기라 "4~6기" 테스트가 깨진다

- [ ] **Step 3: 생성기를 고친다**

`src/game/data/floorgen.ts`에서 적 기수를 정하는 부분을 찾아 3~4 → 4~6으로 올리고, **역할 중복 상한 2를 강제**한다. 풀에서 뽑을 때 이미 2기가 찬 역할은 건너뛴다.

> ⚠️ **보스 층에는 도발을 확정으로 넣는 기존 규칙을 유지할 것**(§5-11). pool에서만 뽑으면 보스+호위가 둘 다 breaker가 되어 도발이 사라진다.
> ⚠️ **보스를 일반 적 풀에 넣지 말 것.** 81층에 최종 보스가 일반 적으로 나온 적이 있다.

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/game/floors.test.ts`
Expected: PASS

- [ ] **Step 5: 전체 검증 — 여기서 21층 이상이 크게 움직인다**

```bash
npm test
npm run typecheck
npm run sim > /tmp/sim-task6.txt
diff <(sed -n '/1층/,/20층/p' /tmp/sim-task5.txt) <(sed -n '/1층/,/20층/p' /tmp/sim-task6.txt)
```

Expected:
- **1~20층 diff가 비어 있어야 한다.** 생성 구간만 건드렸으므로 반드시 같다
- 21층 이상은 **크게 달라진다** — 그게 이 태스크의 목적이다

- [ ] **Step 6: 커밋**

```bash
git add src/game/data/floorgen.ts src/game/floors.test.ts
git commit -m "$(cat <<'EOF'
feat: 생성 층 적 기수 확장 (3~4 → 4~6)

정원 5로 전 구간 완주율이 100%가 됐는데 튜너로는 못 고친다 —
변형 번호를 고르는 도구지 적을 강하게 만드는 도구가 아니고,
지금 변형 24개는 전부 3인 기준 후보라 5인용 난이도가 그 안에 없다.

수치 배수가 아니라 기수로 올린다. 지수는 0.008 폭에서 결과가 뒤집히는
칼날이고(STEP 15) 기수는 선형에 가깝다.

역할 중복 상한 2를 강제했다. 기수를 늘리면 중복 확률이 구조적으로
오르는데, 같은 디버프가 겹치면 급격하게 무너진다(§5-19 — 방깎 2기로
16층이 8%, 광역 2기로 19층이 97%→25%).

sim 1~20층 diff 비어 있음 확인(회귀 감지선).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 튜너 재생성 + `MAX_DEATH` 비율화

**Files:**
- Modify: `scripts/floor-tune.mts` (기준 파티 5인, `MAX_DEATH` 비율)
- Modify: `climb-check.mts` (2군·재도전 반영)
- Regenerate: `src/game/data/floorVariants.ts`

- [ ] **Step 1: 튜너의 기준 파티를 5인으로 올린다**

`scripts/floor-tune.mts`에서 기준 파티와 대체 파티를 5인으로 만든다.
§5-52대로 **두 편성 중 나쁜 쪽**으로 판정하는 로직은 유지하되, 5인의 "최악"을 다시 정의한다(탱커 빠짐 / 힐러 빠짐).

- [ ] **Step 2: `MAX_DEATH`를 정원 대비 비율로 바꾼다**

```ts
/**
 * 합격 사망 상한 — **정원 대비 비율**이다.
 *
 * ⚠️ 절대값으로 두면 안 된다. 3인 기준 값을 5인에 그대로 쓰면 사망 허용치가
 * 상대적으로 헐거워져, 승률은 합격인데 매 층 2명씩 죽는 구간이 생긴다.
 * 그 대가는 다음 층에서 청구된다(§5-22 — 7층은 승률 90%지만 사망 1.16이고
 * 3인이 2인이 되면 8층이 78%→0~4%로 무너진다).
 */
const MAX_DEATH_RATIO = 0.4;   // 정원 5면 2.0, 정원 3이면 1.2
```

- [ ] **Step 3: 표를 명시적으로 비우고 재생성한다**

§5-54는 "표를 비우고 시작하지 말라"고 하지만 **이번은 입력이 통째로 바뀌므로 비우는 게 맞다.** 그 함정이 말한 "전체 재계산이 필요하면 명시적 절차로"에 해당한다.

```bash
# 기존 표를 백업하고 비운다 (명시적 절차)
cp src/game/data/floorVariants.ts /tmp/floorVariants-3인기준.ts
npx tsx scripts/floor-tune.mts --write
```

- [ ] **Step 4: 수렴할 때까지 반복한다 (§5-50)**

한 층의 선택이 이웃의 중복 회피 조건을 바꾸므로 **한 번에 수렴하지 않는다.**

```bash
npx tsx scripts/floor-tune.mts --write
npx tsx scripts/floor-tune.mts --write
```

**"변형으로 해결 0"이 나올 때까지** 돌린다.

- [ ] **Step 5: `climb-check.mts`를 실제 플레이에 맞춘다**

지금은 "HP 높은 순 3인"이다. 정원이 층별로 다르고 2군이 생겼으므로 모델을 맞춘다.

> ⚠️ **§5-23: 측정 도구가 실제 플레이와 다르면 없는 문제를 만들어낸다.** 정확히 이걸로 "중층 완주 0%"라는 헛것을 한 번 봤다. 모델이 게임과 같은지 먼저 확인할 것.

- [ ] **Step 6: 구간 완주율을 목표로 맞춘다**

```bash
npx tsx climb-check.mts
```

Expected: 생성 구간 완주율 **25~40%**. 넘으면 적을 더 키우고, 모자라면 줄인다.

- [ ] **Step 7: 전체 검증**

```bash
npm test
npm run typecheck
npm run build
npm run sim > /tmp/sim-task7.txt
diff <(sed -n '/1층/,/20층/p' /tmp/sim-task6.txt) <(sed -n '/1층/,/20층/p' /tmp/sim-task7.txt)
```

Expected: **1~20층 diff 비어 있음**, 테스트 전부 통과

- [ ] **Step 8: 커밋**

```bash
git add scripts/floor-tune.mts src/game/data/floorVariants.ts climb-check.mts
git commit -m "$(cat <<'EOF'
balance: 튜너를 5인 기준으로 재생성 + MAX_DEATH 비율화

floorVariants.ts의 29개 변형 번호는 3인 기준 실측값이었다.
정원이 5로 바뀌었으므로 입력이 통째로 달라졌다(§5-49).

표를 명시적으로 비우고 재생성했다. §5-54가 "비우고 시작하지 말라"고
경고하지만, 그건 자동으로 일어날 때의 이야기다 — 입력이 바뀐 전체
재계산은 명시적 절차로 하는 것이 그 함정이 지시한 바다.

MAX_DEATH를 절대값에서 정원 대비 비율로 바꿨다. 3인 기준 값을 5인에
그대로 쓰면 사망 허용치가 헐거워져, 승률은 합격인데 매 층 2명씩 죽는
구간이 생긴다(§5-22).

sim 1~20층 diff 비어 있음 확인.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `SEED_OFFSET` 재탐색

**왜 맨 마지막인가:** `SEED_OFFSET`은 **초기 로스터의 잠재 계수를 정하는 값이라 저층(1~6층) 승률을 움직인다.** 저층은 정원 3을 유지하는 불변 구간이므로 21~100층 재튜닝과 **독립**이고 튜너의 입력도 아니다. 중간에 끼우면 튜너 결과가 나빠졌을 때 적 기수 탓인지 시드 탓인지 못 가른다(§5-51). 게다가 로스터가 6인이 되는 변경이 앞 태스크에서 확정돼야 한다.

**Files:**
- Modify: `src/stores/runStore.ts:93` (`SEED_OFFSET`)
- Create: `scripts/seed-search.mts` (탐색 스크립트 — 근거를 남긴다)

- [ ] **Step 1: 로스터를 6인으로 늘린다**

`initialRoster()`에 한 명을 추가한다. 어떤 defId·등급·레벨인지는 **밸런스 판단**이므로, 기존 5인의 역할 분포(탱1·힐1·딜3)를 보고 부족한 역할을 채운다.

- [ ] **Step 2: 탐색 스크립트를 쓴다**

`scripts/seed-search.mts` — 후보 offset을 훑어 **6인의 잠재 계수 합이 0에 가까운 것**을 고르고, 각 후보로 **실제 승률을 잰다.**

> ⚠️ §5-10: 계수 합 0만으로는 부족하다. **합이 0인 후보가 43%를 내기도 했다.** 반드시 승률까지 확인한다.
> ⚠️ §5-9: `npm run sim`으로는 안 잡힌다. sim은 자체 파티를 쓰므로 `initialRoster()`를 바꿔도 표가 미동도 안 한다. **별도 측정이 필요한 이유가 이것이다.**

- [ ] **Step 3: 후보를 재고 고른다**

```bash
npx tsx scripts/seed-search.mts
```

목표: **6층 승률이 기존 기준선(67~70%)과 비슷**하고 개체 간 편차는 남는 것.

- [ ] **Step 4: 채택하고 근거를 주석에 남긴다**

`runStore.ts:93`의 `SEED_OFFSET`을 바꾸고, 기존 주석 형식대로 **탐색 근거와 실측 승률**을 적는다. 이 주석이 다음 사람에게 유일한 근거다.

- [ ] **Step 5: 전체 검증**

```bash
npm test
npm run typecheck
npm run build
npx tsx scripts/seed-search.mts
npx tsx climb-check.mts
```

Expected: 6층 승률이 기준선 범위, 테스트 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/stores/runStore.ts scripts/seed-search.mts
git commit -m "$(cat <<'EOF'
balance: 초기 로스터 6인 + SEED_OFFSET 재탐색

로스터가 5→6인이 되면서 기존 값(22537)의 근거가 사라졌다 —
3인의 계수 합이 0이 되도록 고른 값이었다.

계수 합 0만으로는 부족하다. 합이 0인 후보가 43%를 내기도 했으므로
(§5-10) 승률까지 재서 골랐다. npm run sim으로는 안 잡히는 영역이라
(sim은 자체 파티를 쓴다 — §5-9) 별도 스크립트로 쟀다.

탐색 근거를 scripts/seed-search.mts로 남긴다. 지우지 말 것 —
수치를 다시 만질 때 먼저 볼 파일이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 문서 갱신 (HANDOFF · gdd-v3)

**Files:**
- Modify: `docs/HANDOFF.md` (STEP 29 완료 처리, 새 함정)
- Modify: `docs/gdd-v3.md` (2군·재도전 반영)
- Modify: `tower-of-picks/CLAUDE.md` (테스트 개수, 디렉토리)

- [ ] **Step 1: HANDOFF STEP 29를 완료로 바꾸고 실측값을 적는다**

"설계 합의만 완료"를 실제 결과로 교체한다. **밟은 함정을 반드시 적는다** — 이 문서의 가치는 §5다.

- [ ] **Step 2: gdd-v3에 반영한다**

스펙 §9가 지적한 대로, gdd-v3는 **구현 반영판**이므로 2군·재도전이 들어가야 한다.

- [ ] **Step 3: CLAUDE.md의 테스트 개수와 디렉토리를 갱신한다**

`npm test` 개수, `src/game/data/party.ts`·`revisit.ts` 추가.

- [ ] **Step 4: 커밋**

```bash
git add docs/ CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: STEP 29 완료 반영 (2군 편성 + 기존 층 재도전)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 | 태스크 |
|---|---|
| §3.4 정원 상수 분리 | Task 1 |
| §3.1 `floorIndex`/`maxFloorReached` | Task 2 |
| §3.3 세이브 v2 | Task 2 |
| §3.2 `squads` 배열의 배열 | Task 3 |
| §2.5 교체 잠금 (`lockedSquad`) | Task 3(로직) · Task 4(화면) |
| §4.2~4.4 편성 UI | Task 4 |
| §5.1 층 선택(`TowerMap`) | Task 5 |
| §5.2~5.4 보상 체감 | Task 5 |
| §5.5 최전선 판정 | Task 2 |
| §6.2 1단계 적 기수 | Task 6 |
| §6.2 2~3단계 튜너·`MAX_DEATH` | Task 7 |
| §6.2 4단계 `SEED_OFFSET` | Task 8 |
| §6.4 측정 도구(`climb-check`) | Task 1(정원) · Task 7(2군) |
| §6.5 죽은 테스트 검증 | Task 2 · 3 · 5 (각 Step) |

**갭 없음.** §8(미해결 검증)은 의도적으로 구현 대상이 아니다 — Task 7 이후 측정 항목이다.

**2. 플레이스홀더**

Task 6 Step 1의 6층 적 구성 기대값과 Task 6 Step 3(생성기 수정 지점), Task 7·8의 일부 단계는 **실측·탐색이 필요해 코드를 미리 적을 수 없다.** 해당 위치에 "확인한 뒤 적는다"를 명시했고, 판단 기준(§5 함정 참조)을 함께 뒀다.

**3. 타입 일관성**

- `partyLimitAt` / `squadsOpen` — Task 1 정의, Task 3·4에서 동일 시그니처로 사용
- `squads: HeroInstId[][]` — Task 3 정의, Task 4에서 동일
- `toggleSquadMember(squad, id)` — Task 3 정의, Task 4에서 동일 인자 순서
- `revisitMultiplier(floorId, maxFloorReachedId, revisitCount)` — Task 5 정의·사용 일치
- `SQUAD_COUNT` — Task 1 정의, Task 3의 `save.ts`에서 import
