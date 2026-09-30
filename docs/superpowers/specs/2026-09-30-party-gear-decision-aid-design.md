# 편성·장비 판단 보조 — 설계 (2026-09-30)

## 왜

1차 셀프 테스트(2026-09-30) 지적: "탱커·치유자 역할은 전투에서 보이지만, **장비를 끼거나 출진 조합을 짤 때는 고려가 어려웠다.**"

원인은 수치가 아니라 **판단 근거의 부재**다(실측):

- 편성 화면(`PartyScreen`)은 전투력·배치·속성 인원수만 보인다. **다음 층의 적 종류·속성·역할은 어디에도 없다** —
  브리핑도 보스 그림과 임무만 참으로 보이고, 적 수·전력은 정찰 보고(STEP 60, 일부러 틀릴 수 있음)로만 나온다.
- 장비는 상세창(`DetailModal`) 슬롯에서 끼는데, **끼기 전에 무엇이 얼마나 오르는지 비교가 없다.**
- 자동 편성(`pickAutoParty`)은 전투력 상위 N명이고 이유를 말하지 않는다.

사용자가 고른 네 가지(전부): **장비 착용 전 비교 · 편성 화면에 다음 층 적 정보 · 추천 버튼과 그 이유 · 역할 구성 경고.**

## 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 적 정보의 참/거짓 | **종류(이름·속성·역할)는 참, 수·전력은 정찰 보고만** | 사용자 결정(2026-09-30). 상성 편성이 가능해지고, 보고를 의심하는 재미(STEP 60)는 남는다 |
| 접근 | **A안** — 편성 화면에 적 정보·상성·경고·추천, 장비는 상세창 슬롯을 비교형으로 | 사용자 결정. 화면 구조 유지, 변경 범위 최소 |
| 전투 엔진 | **바꾸지 않는다** | 전부 표시·조작 보조. `ordersBaseline` 지문·`sim` 표가 그대로여야 한다 |

## 범위 밖

- 전투 수치·역할 메커니즘 변경(직업 신설, 역할 효과 추가) — 이번 지적은 가시성이다.
- 편성을 브리핑과 합치는 화면 재구성(B안) — 기획서 10단계 UI 리빌딩에서.
- 적 수·전력 표시 — 정찰 보고의 영역이다. 편성 화면에 쓰지 않는다.

---

## 1. 다음 층 적 정보 — `game/floorIntel.ts` (새, 순수)

```ts
interface EnemyKind { defId: EnemyDefId; name: string; element: Element; role: Role; isBoss: boolean }
/** 층에 나오는 적 종류 — 중복 제거, 등장 순서 유지. **몇 기인지는 돌려주지 않는다** */
function enemyKindsOf(floor: FloorSpec, enemies: Record<EnemyDefId, EnemyDef>): EnemyKind[]
```

- 대상 층 = 스토어 `floorIndex`(탑 화면의 "◀ 현재"). `floorAt(floorIndex)`로 생성 층도 같은 경로.
- **반환형에 수(count)가 없다** — 화면이 실수로 "적 5기"를 적을 수 없게 타입으로 막는다. 테스트: 같은 적이 3기인 층도 종류 1개.
- 편성 화면 상단: `7층 · 잿바람 고개 · 토벌` 한 줄 + 적 종류 칩(이름 · 속성 색 `ELEMENT_TINT` · 역할 `ROLE_KR`, 보스는 표식).

## 2. 상성 집계 — `floorIntel.ts`

```ts
interface Matchup { strong: number; weak: number }
/** strong = 이 속성이 때릴 때 1.5배인 적 종류 수, weak = 적이 이 속성을 때릴 때 1.5배인 적 종류 수 */
function matchupOf(element: Element, kinds: EnemyKind[], chart: Record<Element, Record<Element, number>>): Matchup
```

- 기존 `elementChart`만 읽는다(ADV 1.5 판정은 `chart[a][d] > 1`). 새 배수를 만들지 않는다.
- 편성 목록 영웅 카드 아래에 `▲2 ▼1` (0이면 그 기호를 생략, 둘 다 0이면 아무것도 안 그린다).

## 3. 역할 경고 — `floorIntel.ts`

```ts
type CompositionWarning =
  | { kind: 'noTank' }                          // 편성에 role 'tank' 없음
  | { kind: 'noHealer' }                        // 편성 누구도 heal 효과 스킬이 없음
  | { kind: 'weakMajority'; element: Element }  // 편성 절반 이상이 이 적 속성에 weak
function compositionWarnings(party, heroDefs, skills, kinds, chart): CompositionWarning[]
```

- **엔진에 실제로 있는 것만** 말한다:
  - `noTank` — 탱커는 단일 공격의 60%를 대신 맞는다(`battle.ts` `TANK_AGGRO`). 문구: "수호 없음 — 공격이 후위에게도 그대로 간다".
  - `noHealer` — **역할이 아니라 스킬로 판정한다**(보조 역할 중에도 `sk_mend` 보유 영웅이 있다). 효과 `kind: 'heal'`을 가진 스킬 보유 여부. 문구: "치유 없음 — 회복은 포션뿐".
  - `weakMajority` — 적 종류 중 어떤 속성이, 편성 절반 이상을 1.5배로 때리는가. 문구: "○ 속성 적에게 약한 영웅이 많다".
- **수치 약속을 만들지 않는다**("+12%" 금지) — `formation.test.ts`의 `elementSpread` 계약과 같은 원칙.
- 편성이 비었으면 경고 없음. 위치: 적 칩 아래, 출전 버튼 위.

## 4. 추천 편성 + 이유 — `formation.ts`

```ts
interface Recommendation { ids: HeroInstId[]; reasons: Record<HeroInstId, string> }
/** members = 이미 편성된 영웅(그대로 둔다), candidates = 비어 있는 후보, room = 남은 칸 */
function recommendParty(members, candidates, defs, skills, scaling, room, kinds, chart, bonusOfHero?): Recommendation
```

지금 자동 편성과 같게 **이미 편성된 영웅은 두고 남은 칸만 채운다.** 순서:
1. 편성(members)에 수호가 없으면, 후보 중 **수호 1명**(전투력 최고). 이유 "수호 — 먼저 맞아 준다".
2. 편성(1 포함)에 치유 스킬 보유자가 없으면, **치유 스킬 보유 1명**(전투력 최고). 이유 "치유 — 회복을 맡는다".
3. 나머지 칸 = **전투력 × 상성 보정** 내림차순. 보정 = `1 + 0.1 × (strong − weak)`(표시 보조용 정렬 키, 전투에 안 닿는다 — `data/formation.ts`에 상수로). 이유: strong>0이면 "적 N종 중 M종에 유리", 아니면 "전투력 상위".
- 사망자 제외. `room`보다 후보가 적으면 전원. `room` 0이면 빈 추천. 1·2의 대상이 없으면 건너뛰고 3으로 채운다.
- `pickAutoParty`는 호출부가 편성 화면 하나뿐이다 → **`recommendParty`로 대체하고 지운다.** 기존 테스트의 불변식(사망자 제외·정원·0칸·후보 부족)은 새 테스트로 옮긴다.
- 편성은 기존대로 호출부가 `toggleSquadMember`를 반복 호출 — 잠금·정원 판정은 스토어가 정본.
- 이유는 추천 직후 편성 슬롯 아래 한 줄씩(다음 수동 변경 시 사라짐 — 화면 로컬 상태).

## 5. 장비 착용 전 비교 — `gear.ts` + `DetailModal`

```ts
interface GearDelta { stats: Partial<Record<keyof Stats, number>>; power: number }
/** 이 영웅이 slot에 candidate를 끼면(지금 것 대신) 스탯·전투력이 얼마나 바뀌나. candidate null = 벗기 */
function gearDelta(hero, def, scaling, inventory, slot, candidate: GearInstance | null): GearDelta
/** 이 슬롯에서 전투력이 가장 오르는 **빈** 장비(남이 낀 것 제외). 오르는 게 없으면 null */
function bestFreeGear(hero, def, scaling, inventory, slot): GearInstance | null
```

- 상세창 슬롯을 누르면 후보 목록이 펼쳐진다(지금은 슬롯 아래 버튼 나열 → 슬롯 탭으로 열고 닫는 목록).
  후보마다 `공격 +12 · 방어 −3 · 전투력 +85` — 오름 금색(`T.gold`), 내림 주황(`T.amber`).
- 목록 맨 위 후보에 **"추천"** 표식 = `bestFreeGear`.
- 영웅마다 **"자동 장착"** 버튼 — 슬롯마다 `bestFreeGear`를 낀다. **남이 낀 장비는 가져오지 않는다.**
- **다른 영웅이 낀 장비**는 목록에 `○○ 착용 중`으로 보이고 **"가져오기"**로 명시적으로 옮긴다.
  `equip`이 `equipped-elsewhere`를 막는 이유("조용히 뺏으면 그쪽 전투력이 말없이 떨어진다")를 지키기 위해,
  가져오기 버튼 옆에 그 영웅의 전투력 감소(`gearDelta(holder, …, null)`)를 함께 보인다.
  스토어에 `takeGear(heroId, gearId)` — 원 소유자 `unequip` → `equip`을 **한 번의 set**으로(중간 상태가 저장되지 않게).
- 전투력은 `heroPower`(표시 전용)를 쓴다 — `power.ts`는 엔진이 import하지 않는다(기존 테스트 잠금).

## 6. 검증

- 순수 함수 전부 Vitest: `enemyKindsOf`(중복 제거·수 없음·보스), `matchupOf`(순환 5속성), `compositionWarnings`(세 경고·빈 편성·보조 치유자),
  `recommendParty`(수호·치유 우선, 상성 정렬, 후보 부족, 사망자 제외), `gearDelta`(교체·빈 슬롯·벗기), `bestFreeGear`(남의 장비 제외, 오름 없으면 null),
  스토어 `takeGear`(원 소유자 슬롯 비움·equippedBy 갱신·사망 영웅 거부).
- 엔진 무변경 확인: `ordersBaseline.test.ts` 지문 · `npm run sim` 표(6층 65%/1.40 · 12층 43% · 20층 67%) 그대로.
- 브라우저 375×667: 편성 화면에 적 줄·경고가 들어간 뒤 **출전 버튼이 화면 안**(`getBoundingClientRect`), 가로 스크롤 없음.
  세로가 모자라면 적 칩 줄을 한 줄 가로 나열(넘치면 줄바꿈 대신 "외 N종")로 줄인다.
- 폰 실기기 확인은 사용자에게 요청.

## 영향 파일 (예상)

`game/floorIntel.ts`(새) · `game/floorIntel.test.ts`(새) · `game/formation.ts`·`.test.ts` · `game/data/formation.ts` ·
`game/gear.ts`·`.test.ts` · `stores/runStore.ts`(+`takeGear`)·테스트 · `screens/PartyScreen.tsx` · `screens/DetailModal.tsx` · `App.tsx`(배선) ·
`CLAUDE.md`(규칙: 편성 화면에 적 수 금지) · `docs/HANDOFF.md`
