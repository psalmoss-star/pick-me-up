# 탑 밖의 일 — 훈련소·모험 체감 설계 (2026-10-02)

## 왜

1차 셀프 테스트(2026-09-30) 지적 3번: "탑 팀이 돌아온 뒤 **훈련소 영웅의 성장이 보여야** 하고, **모험은 실시간으로 보이길** 원한다."

원인은 수치가 아니라 **표시의 부재**다(2026-10-02 실측):

- 훈련소 유휴 exp와 모험 정산은 둘 다 `finish()` 안에서 **전투 횟수(`battleCount`) 기준**으로 한 번에 처리된다.
- **모험 결과(`adventureOutcomes`)를 읽는 화면이 없다.** 성공·실패·재료·각성석·부상이 조용히 지나간다.
- 결과 화면 "▲ 성장"은 레벨이 오른 영웅만 섞어 보인다. **받은 exp(+N)·출처(훈련소/참전)**가 없다.
- 모험 관문 카드는 "탑 N전투 남음" 텍스트뿐이다. 진행 바·진행 묘사가 없다.

### 같이 고치는 버그 2건 (결과 화면 `previewLevelUps`)

결과 화면은 `finish()`보다 **먼저** 뜨므로 `App.tsx`가 정산을 따로 다시 계산한다. 그 사본이 실제와 갈라져 있다.

1. **파견 중인 영웅을 빼지 않는다** — 훈련소 exp로 레벨업한 것처럼 보이지만 실제 `finish()`는 주지 않는다(`awayNow`).
2. **모험 exp가 빠져 있다** — 모험 정산으로 오른 레벨이 "▲ 성장"에 안 나온다.

## 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 모험 시간 | **전투 기준 유지, 진행을 보이게** | 사용자 결정(2026-10-02). 실제 시계는 기기 시계 조작 → 퍼머데스 무력화의 첫 단추(`data/adventures.ts` 머리 주석) |
| 표시 위치 | **결과 화면 아래 '탑 밖' 패널** | 사용자 결정(2026-10-02). 한 화면에서 "탑에 간 사이 남은 이들에게 무슨 일이" 읽힌다 |
| 계산 구조 | **A안 — 순수 함수 `settleOffTower` 하나를 `finish()`와 결과 화면이 같이 쓴다** | 사용자 승인. `resolveScout`와 같은 이유 — 화면과 정산이 구조적으로 갈라질 수 없다 |
| 진행 문장 | **결과를 암시하지 않는다** | 아래 §3 |
| 엔진·수치·세이브 | **바꾸지 않는다** | 표시만 바꾼다. `ordersBaseline` 지문·`sim` 표가 그대로여야 한다 |

## 범위 밖

- 마을 화면(IsoVillage) 변경 — 귀환 알림 창은 고르지 않았다.
- 정산 규칙·수치 변경(유휴 exp 양, 모험 성공률·보상).
- 실제 시계 기반 모험, 실시간 애니메이션 연출.
- 지적 4번(UI 관례 UX·시설의 재미) — 별도 작업.

---

## 1. 구조 — `game/offTower.ts`

`finish()`의 훈련소·모험 부분(현 `runStore.ts` 약 1043~1209줄의 해당 분기)을 순수 함수로 뺀다.
React·브라우저 의존 없음, RNG는 기존 `adventureRng`만 쓴다(새 `STREAM` 없음 — 소비 순서도 그대로).

```ts
export interface OffTowerInput {
  roster: readonly HeroInstance[];
  dispatches: readonly Dispatch[];
  assignedIds: ReadonlySet<string>;     // 배치 전체(assignedNow)
  trainingAssigned: readonly string[];  // assignments.training
  trainingLevel: number;
  battleCount: number;                  // 증가 전 값
  seed: number;
  fought: ReadonlySet<string>;
  casualties: ReadonlySet<string>;
  cleared: boolean;
}

export interface TraineeGain {
  instId: string;
  exp: number;                // 이번에 받은 유휴 exp
  before: HeroInstance;       // 표시용 — 레벨·exp 바의 시작점
  after: HeroInstance;        // gainExp 결과
}

export interface AdventureReturn {
  dispatch: Dispatch;
  outcome: AdventureOutcome;
}

export interface AdventureProgress {
  dispatch: Dispatch;
  done: number;               // 이번 전투까지 지난 전투 수
  duration: number;
}

export interface OffTowerResult {
  idleExp: number;
  trainees: TraineeGain[];
  returned: AdventureReturn[];
  away: AdventureProgress[];  // 이번 전투 뒤에도 나가 있는 원정
  stillAway: Dispatch[];
  advExp: Map<string, number>;
  advInjury: Map<string, number>;
  advMaterials: MaterialBag;
  advStones: number;
}

export function settleOffTower(input: OffTowerInput): OffTowerResult;
```

- `finish()`는 이 결과로 로스터·재료·`dispatches`·`adventureOutcomes`를 갱신한다. 지급 규칙은 **비트 단위로 현행과 같다**
  (훈련소: 미참전·생존·비파견·비배치, 돌파 시에만 / 모험: 승패 무관, 로스터에 남은 인원만, exp·부상 HP 하한 1).
- 결과 화면은 같은 입력(전투 시작 시점 `snapshot`·현재 `dispatches` 등)으로 불러 패널과 "▲ 성장"을 그린다.
  `previewLevelUps`는 참전 exp + `settleOffTower`의 훈련소·모험 exp를 합쳐 계산한다 → 버그 2건이 함께 닫힌다.

## 2. 화면 — 결과 화면 '탑 밖' 패널

`ResultScreen` 하단, 기존 블록 뒤에 `<SystemPanel>` 하나. 가운데 정렬·명조(프로젝트 규칙).

- **훈련소**
  - 받은 영웅마다 `이름 · +N exp · Lv.a → b`(레벨이 안 올랐으면 `Lv.a`), exp 바가 `before`에서 `after`까지 차오른다.
  - 받은 사람이 없으면 이유 한 줄: 층 미돌파 → "층을 넘지 못해 훈련 성과가 없다" / 훈련소 Lv.0 → 블록을 그리지 않는다.
- **모험 귀환** (`returned`) — 모험 이름, 성공/실패, 재료·각성석·exp, 부상(실패 시). 인원 이름은 `displayName`.
- **원정 중** (`away`) — 모험 이름, 진행 바 `done/duration`, 그 구간의 진행 문장(§3).
- 세 블록이 모두 비면 패널을 그리지 않는다.
- **모험 관문 카드**(`AdventureScreen`)에도 같은 진행 바와 진행 문장을 단다. 사실상 안 나오는 "귀환 대기" 문구는 지운다.

## 3. 원정 진행 문장 — `data/adventures.ts`의 `legs`

- 모험마다 `legs: string[]`, 길이 = `duration`. `legs[done - 1]`이 "지금까지 온 곳"이다(출발 직후 `done = 0`은 "출발했다" 공통 문장).
  - 폐광(2): 입구 → 갱도 깊은 곳 / 상단(3) / 균열(5) — 문장은 구현 때 쓰고 사람이 검수한다.
- ⚠️ **결과를 암시하지 않는다.** 파견 중인 영웅은 exp를 안 받아 레벨이 고정되므로, 결과는 **파견하는 순간 사실상 정해진다**
  (`adventureRng(seed, advId, startedAtBattle)` + 고정 레벨). 문장이 실패를 흘리면 "즉시 복귀"로 실패할 원정만 빼내
  부상을 피하는 길이 생긴다. 그래서 문장은 결과와 무관한 **위치·풍경**만 말하고, 결과는 귀환 때만 공개한다.

## 4. 테스트

- `offTower.test.ts`
  - 파견 중 영웅은 `trainees`에 없다 / 배치자·참전자·사망자도 없다 / 미돌파면 `idleExp = 0`.
  - 완료 판정이 `battleCount + 1` 기준이다(N전투 모험이 N번째 전투 직후 귀환).
  - `away[].done`이 `battleCount + 1 − startedAtBattle`이다.
- 스토어: `finish()` 후 로스터·재료·`dispatches`가 **같은 입력의 `settleOffTower` 결과와 같다**(정산 단일 출처 잠금).
- `previewLevelUps`: 모험 exp로 오른 레벨이 포함되고, 파견 중 영웅은 훈련소로 레벨업하지 않는다.
- 데이터: 모든 모험의 `legs.length === duration`.
- 회귀: `ordersBaseline` 지문·기존 runStore 테스트 그대로.
- 프로젝트 관례대로 각 테스트는 구현을 일부러 깨서 실패하는지 확인한다.
- 브라우저 375×667: 결과 화면 가로 스크롤 없음, 패널 높이 기록. 이후 폰 확인.
