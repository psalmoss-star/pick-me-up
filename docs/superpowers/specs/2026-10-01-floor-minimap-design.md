# 층 맵 → 미니맵 설계 (2026-10-01)

## 배경

1차 셀프 테스트 지적 2번: "층 맵은 스타크래프트 미니맵처럼 — 원작에서도 미니맵이 보인다. 지금 경로 선이 곡선이라 읽기 어렵다."

지금 층 맵(STEP 59)은 노드·엣지 그래프다. 입구(왼쪽 가운데)에서 경로 줄(위·아래)로 갈라졌다가
계단(오른쪽 가운데)으로 모여서 선이 **대각선으로 꺾인 지그재그**가 된다. 브리핑에 140~184px 지도,
전투 화면 위에 46px 띠가 있고, 띠의 영웅 점은 입구 → 접점 → 계단 세 자리만 오간다.

## 사용자 결정 (2026-10-01)

| 질문 | 결정 |
|---|---|
| 미니맵의 목적 | **보이는 것(표시 전용).** 엔진·승률표·전투 지문은 건드리지 않는다 |
| 전투 화면 배치 | **전장 왼쪽 위 모서리 정사각형.** 46px 띠를 없앤다. 누르면 크게 펼친다 |
| 지형 그리기 | **A안 — 노드 기준 격자 칠하기**(가장 가까운 경로 노드의 지형) |

## 비목표

- 유닛 좌표·사거리·이동이 전투 수치에 닿는 것(엔진 위치 개념) — 하지 않는다.
- 2군 동시 출전의 점선 경로(STEP 59 "알아둘 것") — 이번 범위 밖.
- 시야 가림(fog) — 이번 범위 밖.

## 1. 배치 계산 — `src/ui/minimapLayout.ts` (순수 함수)

입력 `FloorMap`(기존 `floorMapOf`), 출력 그리기용 데이터. 층 번호에서 결정적이고 저장하지 않는다.

```ts
interface MinimapLayout {
  cols: number;                          // 16
  rows: number;                          // 12
  cells: Array<TerrainTag | null>;       // row-major, 칸마다 지형 — 가장 가까운 경로 노드의 것
  nodes: Array<{ id: string; x: number; y: number }>;  // 격자 좌표(칸 단위, 실수)
  roads: Array<{ route: number; points: Array<[number, number]> }>;  // 가로·세로로만 꺾인 길
}
```

- **노드:** 입구 = 왼쪽 가운데, 계단 = 오른쪽 가운데(지금과 같다). 경로 줄의 y는 격자 행 중심에 붙인다.
- **길:** 노드 사이를 대각선이 아니라 **가로·세로 구간**으로 잇는다. 입구에서 갈라지는 세로 구간은
  입구 바로 옆 열 하나로 고정하고(계단 쪽도 대칭), 그 사이는 경로 줄을 따라 가로로 간다.
  그래서 경로끼리는 입구·계단 옆 갈림 열에서만 겹친다.
- **지형 면:** 칸 중심에서 가장 가까운 **경로 노드**(입구·계단 제외)의 지형을 칠한다.
  가장 가까운 노드까지 거리가 `MINIMAP.terrainRadius`(칸 단위)를 넘으면 `null`(빈 땅).
  지형은 언제나 **참**이다 — 정찰 보고가 틀려도 땅은 그대로이고 ✕만 보고 위치에 찍힌다.
- 튜닝 값(격자 크기, 반경)은 이 파일 상단 상수 `MINIMAP`에 둔다(표시 값이라 `game/data`가 아니다).

**테스트**
- 결정적: 같은 층이면 같은 배치.
- 접점 노드가 있는 칸의 지형 = 그 노드의 지형(1~100층 전부).
- 모든 길 구간은 가로 또는 세로(두 점 중 x나 y 하나가 같다).
- 모든 길은 입구 좌표에서 시작해 계단 좌표에서 끝나고, 그 경로의 노드를 순서대로 지난다(1~100층).

## 2. 그리기 — `src/screens/map/Minimap.tsx`

한 컴포넌트를 크기만 달리해 두 곳에 쓴다.

| 쓰임 | 크기 | 하는 일 |
|---|---|---|
| 브리핑(`RoutePanel`) | 폭 가득 ≈ 340×255 | 지형 면 · 길 · 지형 이름 · ✕(보고대로) · 길을 눌러 경로 선택 |
| 전투(`BattleScreen`) | 전장 왼쪽 위 96×72 | 지형 면 · 길 · 점. 글자 없음. 누르면 가운데에 크게 펼침, 다시 누르면 닫힘 |

- **색:** `tokens.ts`에 미니맵 지형 팔레트 `MM`을 더한다(마을 `V`와 같은 이유 — 장면 전용 색을 T에 섞지 않는다).
  숲(어두운 녹) · 강가(어두운 청) · 관문(회갈) · 좁은 통로(짙은 바위) · 개활지(흐린 황토) · 빈 땅(`T.void`보다 약간 밝게).
  전부 명도를 낮춰 배경은 어둡게 유지한다. 길은 고른 경로 금색 실선 / 나머지 흐린 점선(지금 규칙).
- **지형 이름:** 브리핑 크기에서만, 노드 옆에 어두운 바탕을 깔고 쓴다. 입구·계단도 이름을 쓴다.
- **✕:** `contacts` prop이 있으면 보고대로, 없으면 참 접점(지금 `FloorMapView`와 같은 규칙).
  전투 크기는 참 접점(이미 부딪힌 뒤다).
- **터치:** 브리핑의 길은 22px 투명 선으로 누른다(지금과 같다). 전투 미니맵 전체가 44px 이상의 버튼이다.
- **펼친 지도:** 전투 재생을 멈추지 않는다. 위기 창이 뜨면 자동으로 닫는다(위기 창이 우선).
- **교체:** `FloorMapView.tsx`를 지운다. `RoutePanel`의 지도와 전투 46px 띠가 이 컴포넌트로 바뀐다.

## 3. 점 — `src/ui/minimapDots.ts` (순수 함수)

```ts
type Phase = 'approach' | 'engage' | 'after';
interface DotUnit { uid: string; side: 'hero' | 'enemy' | 'guard'; alive: boolean; withdrawn: boolean }
function minimapDots(
  layout: MinimapLayout, map: FloorMap, route: number,
  state: { phase: Phase; units: DotUnit[]; outcome?: 'victory' | 'defeat' },
): Array<{ uid: string; side: DotUnit['side']; x: number; y: number; dead: boolean }>
```

`BattleScreen`이 이미 가진 값(`hp[uid]`, `withdrawnNow`, `retreatedNow`, `done`, `result.outcome`, 로스터)에서
`units`와 `phase`를 만든다. 엔진·이벤트는 새로 만들지 않는다.

| 단계 | 조건 | 아군·호위 | 적 |
|---|---|---|---|
| `approach` | `step === 0` | 입구에 모임 | 접점 오른쪽에 모임 |
| `engage` | 재생 중 | 접점 왼쪽에 붙음 | 접점 오른쪽에 붙음 |
| `after` | `done` | 승리 → 계단 / 패배 → 그 자리 | 남은 적은 접점 |

- **후퇴 신호·이탈:** `withdrawn`인 영웅은 단계와 무관하게 입구.
- **쓰러짐:** `alive === false`면 `dead: true`로 돌려준다. 화면은 회색으로 0.6초 그린 뒤 숨긴다(타이머는 화면 몫).
- **무리:** 같은 편 점은 기준점 둘레에 고정 간격으로 퍼뜨린다. 순서는 uid 정렬 — 같은 입력이면 같은 좌표.
- **이동:** 화면은 점을 CSS transition(900ms, 지금 띠와 같다)으로 옮긴다. 길을 따라가는 느낌을 위해
  접점까지의 경로 꺾임점을 단계적으로 지나게 하는 것은 화면 몫이며, 이 함수는 목표 좌표만 준다.
- **색:** 아군 `T.rare`(지금 영웅 점) · 적 `T.blood` · 호위 `T.gold`, 호위는 작은 마름모.

**테스트**
- 점 수 = 유닛 수(쓰러진 유닛은 `dead: true`로 남는다 — 숨기는 건 화면).
- `withdrawn` 영웅은 입구 좌표.
- `after` + 승리 → 살아 있는 아군은 계단 / 패배 → 계단에 아군 없음.
- 결정적, 그리고 같은 무리 점끼리 최소 거리 이상.

## 검증

- `npm test`, `npm run typecheck`. 엔진 무변경 → `ordersBaseline` 지문·`sim` 그대로여야 한다.
- 375×667 브라우저, `getBoundingClientRect` 실측:
  - 브리핑 가로 스크롤 없음, 지형 이름끼리 겹침 없음.
  - 전투 미니맵이 전장 안에 있고 적·영웅 그림과 겹치지 않음. 겹치면 전장 위 여백을 늘린다.
  - 펼친 지도가 화면 안에 들어오고, 위기 창이 뜨면 닫힘.
- 실기기(폰)에서 한 번 볼 것(레이아웃 변경 — CLAUDE.md).

## 영향 범위

| 구분 | 파일 |
|---|---|
| 새 파일 | `src/ui/minimapLayout.ts`(+test) · `src/ui/minimapDots.ts`(+test) · `src/screens/map/Minimap.tsx` |
| 수정 | `src/ui/tokens.ts`(`MM`) · `src/screens/map/RoutePanel.tsx` · `src/screens/BattleScreen.tsx` |
| 삭제 | `src/screens/map/FloorMapView.tsx` |
| 무변경 | 엔진(`src/game/`)·스토어·세이브 |
