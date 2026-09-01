# CLAUDE.md — 탑 등반 (Tower of Picks)

## 이 프로젝트가 무엇인가

가챠 RPG. 뽑기로 얻은 영웅을 소모하며 100층 탑을 오른다.
**영웅이 죽으면 영구히 사라진다(퍼머데스).** 이것이 유일한 차별점이며 모든 설계의 축이다.

원작 웹툰의 **시스템 구조와 UI 톤만** 참고한다. 캐릭터명·고유명사·아트는 전부 오리지널.

---

## 응답 언어

한국어로 답한다.

---

## 절대 규칙 (위반 시 프로젝트 정체성이 붕괴한다)

### 아키텍처
- `src/game/` 아래 코드는 **React·DOM·브라우저 API 의존 금지.** 순수 함수만.
- 무작위성은 **반드시 주입된 `RNG`를 통해서만** 발생한다. `Math.random()` 직접 호출 금지.
  시드 고정으로 전투가 100% 재현되어야 하고, 이게 밸런싱의 유일한 수단이다.
- 밸런스 수치를 코드에 하드코딩하지 않는다 → `src/game/data/`.
- 게임 로직을 바꾸면 **대응하는 Vitest 케이스를 같은 커밋에** 넣는다.
- 전투 엔진은 결과가 아니라 `BattleEvent[]`를 반환한다. UI는 그것을 재생만 한다.

### UI (이 프로젝트가 한 번 실패했던 지점)
- 모든 정보 표시는 `<SystemPanel>`을 통과한다. **맨 div로 카드를 만들지 말 것.**
- 영웅 표시는 `<HeroCard>`(타로카드형)만 사용. **사각 썸네일 금지.**
- 본문 폰트는 **명조 계열.** 산세리프 금지.
- 배경은 항상 어둡게. `bg-white`, `bg-gray-50` 등 밝은 배경 클래스 금지.
- 텍스트 정렬 기본값은 **center.** 좌측 정렬하면 즉시 웹앱처럼 보인다.
- shadcn/ui 기본 스타일을 그대로 쓰지 않는다.
- 색·등급 표현은 `src/ui/tokens.ts` 밖에서 하드코딩하지 않는다.
- **등급 차이는 색이 아니라 구조로 표현한다.** `STAR_TIERS`의 `corners`/`lattice`/`rays`/`halo`를
  실제로 렌더에 반영해야 한다. 색만 바꾸면 ★3과 ★5가 구분되지 않는다 (이미 겪은 버그).
- ★1~3은 무광·정적, ★4~6은 발광·장식·움직임. 이 분기를 흐리지 말 것.
- 마을에 자리를 더할 때 **좌표는 `VILLAGE_LOTS` 한 곳에만** 적는다.
  라벨 겹침은 눈이 아니라 `iso.test.ts`가 판정한다 — 깊이(x+y)로 재면 안 된다
  (훈련소와 숙소는 깊이가 같은데도 안 겹친다. 겹침은 투영 좌표에서만 보인다).

### 게임 규칙
- 퍼머데스는 협상 대상이 아니다. 사망한 영웅은 어떤 경로로도 되돌리지 않는다.
- **같은 이름의 영웅이 둘 존재하면 안 된다.** 개체는 대체 불가능하고, 그게 화면에 보여야 한다.
  이름은 `displayName(inst, defs)`으로만 읽는다 — `def.name` 직접 읽기 금지.
  죽은 영웅의 이름도 영구 봉인된다(초상화 재사용은 허용).
- 등급과 캐릭터 유형은 **독립**이다. ★5 카일도, ★1 이스카도 나올 수 있다.
- 합성 UI에서 **"제물"이라는 단어를 그대로 쓴다.** 순화하지 말 것.
- 승급은 레벨을 1로 리셋한다 → 승급 직후는 이전보다 약하다. 이건 버그가 아니라 설계다.
  **소환 시작 레벨(`summonLevel`)을 승급에 적용하지 말 것** — 그 대가가 사라진다.
- MVP와 사망자는 **같은 결과 화면에** 표시한다. 기쁨과 상실을 분리하면 퍼머데스의 무게가 사라진다.
  도감의 `잃음`도 같은 이유로 `만남` 옆에 둔다.
- **즐겨찾기(favorite)는 밸런스에도 정렬에도 넣지 않는다.** 표식이 취향이 아니라
  최적화가 되기 때문이다. 하는 일은 제물 확인 창 한 단계와 **필터**뿐이다.
- **`STREAM` 번호는 재배치·재사용 금지, 신규는 반드시 뒤에 추가.** 바꾸면 기존 개체의
  잠재치·초상·서사가 전부 달라지고 무덤 기록이 거짓이 된다.
- **배치자는 유휴 exp를 받지 않는다.** 배치는 exp 대신 시설 산출을 주는 거래다.
  둘 다 받게 하면 "일단 다 배치하기"가 유일한 최적해가 되고, **"배치 이득 < 출전 성장"**
  부등식이 깨져 퍼머데스의 긴장이 사라진다. 파견(`awayNow`)과 정확히 같은 이유다.
- **배치는 훈련소·합성소만 받는다** (`AssignableFacility`). 숙소·무기창고는 전투력에
  직접 닿아 배치가 승률을 밀어 올린다 — 넓히면 구간 완주율 표를 전부 재수렴시켜야 한다.
- **묶는 기능에는 무조건적인 해제를 함께 넣는다.** 배치는 사망·제물에서 자동 해제되고
  `unassign`은 조건 없이 성공한다. 안 그러면 화면에 안 뜨는 유령이 슬롯을 영구 점유한다.
- **준비 한 수는 전투 입력이다.** `start()`와 `intervene()`이 **같은 변환**(`applyPrep`)을
  거쳐야 한다 — 한쪽에서 빠지면 개입하는 순간 준비가 조용히 증발한다.
- **`applyPrep`은 층을 복제한다. 제자리에서 고치지 말 것.** `FLOORS`는 모듈 전역이고
  생성 층은 캐시되므로, 제자리 변형은 다음 전투와 다른 화면까지 영구히 오염시킨다.
- **준비는 층당 1개, 저장하지 않는다.** 저장하면 새로고침으로 되살아나거나 다음 층에 샌다.
  사라지는 지점은 `finish()`(승패 무관) · `selectFloor()` · `hydrate()` **셋 다**이다.

---

## 명령어

```bash
npm run dev        # 개발 서버
npm test           # Vitest 1회 실행 (현재 901개 통과)
npm run test:watch
npm run sim        # 밸런싱 시뮬레이터 (전 층 승률 출력)
npm run typecheck
```

```bash
npx tsx climb-check.mts   # 연속 등반 — 층간 HP·숙소 레벨별 도달 층 + 구간별 완주율
npx tsx scripts/fresh-check.mts         # 갓 뽑은 개체 — 등급×레벨 저층 승률
npx tsx scripts/agi-impact.mts          # 마르·예니 — 위 세 도구가 안 쓰는 두 영웅
npx tsx scripts/floor-tune.mts          # 생성 층(21~100) 승률 점검
npx tsx scripts/floor-tune.mts --write  # → data/floorVariants.ts 갱신
```

⚠️ **소환 시작 레벨(`summonLevel`)·성장 곡선을 만졌으면 `fresh-check`를 돌릴 것.**
`sim`과 `climb-check`는 **자체 기준 파티(★2 Lv.15~★4 Lv.50)만** 쓰므로 이 축을
구조적으로 못 본다 — 두 표가 안 움직이는 것이 정상이다(§STEP 33·39).

⚠️ **적 수치·깊이 배수·기준 파티를 만졌으면 `floor-tune`을 다시 돌릴 것.**
`floorVariants.ts`는 실측으로 고른 변형 번호 표라서, 입력이 바뀌면 조용히 낡는다
(생성기가 옛 판단을 그대로 쓴다).

⚠️ **튜너가 "합격 변형 없음"이라고 해도 그대로 믿지 말 것.** 94층이 그렇게 보고됐지만
실제로는 v19가 100%/사망 0.17이었고, 이웃(96층)이 자리를 쥐고 있었을 뿐이다 —
**탐색 범위 밖이었지 없는 게 아니었다**(HANDOFF §STEP 46). 고치기 전에 변형 24개를
전수로 재볼 것. `DEATH_CAP_EXEMPT`(현재 99층 하나)는 그 전수 조사를 통과한 층만 넣는다.

**실기기(폰) 확인** — `vite.config.ts`에 `server.host`가 켜져 있어 `npm run dev` 출력의
`Network: http://<LAN IP>:5173/` 주소로 같은 WiFi의 폰에서 접속된다.
`172.20.x`는 Hyper-V·WSL 가상 어댑터라 안 닿는다 — 실제 LAN 주소를 쓸 것.
**이 프로젝트는 모바일 세로 전용이다. 레이아웃을 만졌으면 폰에서 한 번 볼 것**
(데스크톱 좌표 측정이 놓친 것을 폰 스크린샷이 잡은 적이 있다 — HANDOFF §5-34).

**밸런스를 만졌으면 `npm run sim`을 돌려 승률을 확인한다.** 손으로 플레이테스트하지 말 것.

**현행 기준선 (2026-08-27, STEP 45 이후).** 이전 문서의 `71/20/9/51/43/20/18%`는
적 role이 죽어 있던 시절 값이라 **지금 기준으로 쓰면 안 된다.**

```
sim         6층 65%/사망 1.40 · 12층 43% · 20층 67%
climb-check 저층 66% / 중층 14% / 상층 10% / 31 / 31 / 42 / 19%
```

⚠️ **`sim`은 매 층을 만피로 독립 측정한다.** 층간 HP·숙소·초기 로스터를 만졌으면
sim 표는 미동도 하지 않는다 — `climb-check.mts`를 함께 돌릴 것 (HANDOFF §5-7/§5-9).

⚠️ **두 도구 다 "잘 키운 파티"만 돌린다** (★2 Lv.15 ~ ★4 Lv.50).
**갓 뽑은 저레벨 개체를 아예 밟지 않는다** — 실제로 "★4 Lv.1이 ★1 Lv.1보다 약한"
결함이 있는 채로 두 표가 완전히 정상이었다(STEP 33). 성장 곡선·소환 보상·초기 스탯을
만졌으면 **표가 아니라 테스트로 잠글 것.** 표가 안 움직이는 것은 안전의 증거가 아니다.

⚠️ **도구마다 쓰는 영웅이 다르다. 만진 영웅이 어느 표에 있는지부터 확인할 것.**

| 도구 | 쓰는 영웅 |
|---|---|
| `sim` · `climb-check` · `fresh-check` | ashen · bulwark · tide · gale · bolt · banner |
| `floor-tune`의 **`altParty`** | gale · bolt · leech · **thorn** · cinder |
| 어디에도 없음 | **예니(`h_hush`)** |

마르(`h_thorn`)는 `floor-tune`의 대체 편성에만 있고 나머지 세 표에는 없다.
그래서 두 영웅이 최약 능력치로 때리는 결함이 있는 채로 sim·climb-check·fresh-check가
전부 정상이었다(STEP 43). 표에 없는 영웅은 `agi-impact.mts`가 잰다.

⚠️ **마르를 만지면 `floorVariants.ts`가 낡는다** — `altParty`가 튜너의 판정 기준이라
그 전력이 바뀌면 변형 번호 표를 다시 수렴시켜야 한다.

⚠️ **승률만 보고 층을 합격시키지 말 것.** 7층은 승률 90%지만 사망 1.16이다 —
이기는데 매번 한 명 죽고, 3인이 2인이 되면 다음 층 승률이 78%→0~4%로 무너진다.
**승률·사망을 함께 볼 것** (HANDOFF §5-22).

---

## 디렉토리

```
src/
├─ game/              # 순수 로직 (React 의존 X) — 여기가 진실의 원천
│  ├─ types.ts        # 도메인 모델. 먼저 읽을 것
│  ├─ rng.ts          # 시드 기반 PRNG
│  ├─ stats.ts        # 능력치(현재/최대, Attributes) → 파생 전투 스탯
│  ├─ battle.ts       # 턴제 시뮬레이터, BattleEvent[] 반환
│  ├─ mission.ts      # 층별 승리 조건 (토벌/생존/수비/호위/탈출/탈취)
│  ├─ gacha.ts        # 소환: 확률, 천장, 쿨다운, 도감
│  ├─ progression.ts  # 경험치 / 승급 / 합성
│  ├─ gear.ts        # 장비 — 보정·착용·사망 시 회수·강화·드롭
│  ├─ quest.ts       # 층 돌파 과제 — 전투 기록 재판정 (전투를 다시 돌리지 않는다)
│  ├─ loot.ts       # 층 전리품 — 회수→장비→재료. **소비 순서의 단일 출처**
│  ├─ adventure.ts  # 모험 파견 판정 — 사망 없음(부상만). 각성석의 유일한 공급원
│  ├─ craft.ts     # 제작 — 재료→유물. **확률이 없다**(RNG를 받지 않는다)
│  ├─ identity.ts    # 개체 이름 — displayName이 유일한 관문. def.name 직접 읽기 금지
│  ├─ origin.ts      # 생전 서사(지위·최후) — seed에서 파생, 저장하지 않는다. 표시 전용
│  ├─ rosterSort.ts  # 목록 정렬 — 화면마다 따로 쓰지 말 것. favorite은 정렬 키가 아니다
│  ├─ potential.ts    # 잠재치(개체차) — 등급과 약하게 상관된 숨은 계수
│  ├─ portraitVariant.ts # 개체별 초상 슬롯. 아트를 모른다 — 후보 수를 인자로 받는다
│  ├─ reveal.ts        # 발굴 — 잠재치 구간 추정, 전투로 진행도 상승
│  ├─ encounter.ts    # runEncounter — 로스터/MVP 조립
│  ├─ power.ts        # 전투력 — **표시 전용.** 엔진이 import하면 안 된다(테스트로 잠금)
│  ├─ formation.ts    # 진형·속성 구성·자동 편성 후보. 전부 표시/보조용 파생값
│  ├─ intervention.ts # 개입(집중/수호/후퇴)
│  ├─ beats.ts        # 이벤트 비트 (확인 창 트리거)
│  ├─ sim.ts          # 밸런싱용 CLI
│  └─ data/
│     ├─ sample.ts    # 재export 배럴만. 새 데이터는 아래 4개 파일에 넣는다
│     ├─ elements.ts  # 상성표(순환 규칙에서 파생) + 등급 스케일링
│     ├─ skills.ts    # 스킬 15종
│     ├─ heroes.ts    # 영웅 12종 + HERO 상수
│     ├─ enemies.ts   # 적 19종 + ENEMY 상수. 보스 수치 주석 = 밸런스 도출 근거
│     ├─ floors.ts    # 층 정의 — 손으로 짠 1~20층 + 생성분 21~100층
│     ├─ floorgen.ts  # 층 생성기(21~) + 적 깊이 배수. 결정적이어야 한다
│     ├─ potential.ts # 잠재치/발굴 튜닝 상수 단일 출처
│     ├─ facilities.ts # 시설 4종 튜닝 (회복률·공격력·유휴 exp·비용)
│     ├─ gear.ts      # 장비 도감 12종 + 튜닝 (회수율·강화·드롭)
│     ├─ quests.ts    # 과제 18종 — 조건·보상 (사망을 요구하는 과제는 두지 않는다)
│     ├─ party.ts     # 파티 정원 규칙 — 층 구간별 정원, 2군 개방 조건. 상수가 아니라 함수다
│     ├─ revisit.ts   # 기존 층 재도전 — 재도전 횟수별 보상 체감
│     ├─ materials.ts # 제작 재료 3종 — 금으로 살 수 없다(주석에 이유)
│     ├─ adventures.ts # 모험 3종. exp는 **정액**이어야 한다(1층 참전 exp가 상한)
│     ├─ names.ts     # 개체 이름 어휘 (이름 65 × 수식어 49 + 이명 26)
│     ├─ origins.ts   # 생전 서사 어휘 — 등급별 지위 12 × 최후 38. **순서를 바꾸면 재배치된다**
│     └─ index.ts     # 전투 엔진용 데이터 번들 (gameData)
├─ stores/
│  ├─ runStore.ts     # 런 상태(Zustand). 게임 상태의 단일 출처
│  └─ save.ts         # 저장/불러오기(localStorage). finish() 직후 자동 저장
├─ ui/                # 비주얼 언어
│  ├─ tokens.ts       # 색·등급 구조. 여기가 단일 출처
│  ├─ SystemPanel.tsx # 시그니처 컴포넌트
│  ├─ HeroCard.tsx    # 타로카드형
│  ├─ OrnateCorner.tsx
│  ├─ iso.ts          # 아이소메트릭 투영(순수). 그리기 순서 = depth(x+y)
│  ├─ IsoVillage.tsx  # 대기실 주 화면 — 섬 부감도. 건물과 라벨이 같은 좌표에서 나온다
│  ├─ BaseHud.tsx     # 상단 HUD (층·영웅수·재화). 마을 위에 겹친다
│  ├─ BaseMap.tsx     # 거점 부감 맵 — 시설 레벨을 건물 구조로 표현
│  ├─ Button.tsx
│  ├─ useViewport.ts  # 반응형 훅 (분기점 480px 하나)
│  └─ art/            # HeroArt / EnemyArt / GuardArt / Scene (전부 SVG)
│     ├─ HeroPortrait.tsx  # 생성 일러스트 우선 + SVG 폴백 (카드 전용)
│     ├─ heroImages.ts     # assets/ glob → defId별 변형 URL 배열
│     └─ variantNaming.ts  # 변형 파일명 규칙(순수 파서). gen-art.mts와 반드시 일치
├─ screens/           # BaseScreen / BriefScreen / BattleScreen / ResultScreen
│                     # / SummonScreen / ForgeScreen / FacilityScreen
│                     # / ShopScreen / SmithScreen / DetailModal / TowerScreen
│                     # / AdventureScreen (모험 파견 — 마을 '모험 관문')
│                     # / GraveScreen (무덤 — '기록/도감' 두 탭) + CodexPanel(도감)
│                     # 하단 탭 3개는 각자 화면이다 (STEP 32에서 갈랐다):
│                     # / HeroesScreen(목록) / StatusScreen(판독) / PartyScreen(편성)
├─ reference/
│  └─ Prototype.jsx   # 동작하는 프로토타입 전체. 화면 추출의 원본
└─ App.tsx            # 화면 전환(view state)만 담당. 게임 상태는 runStore
```

프로젝트 루트의 측정 도구 (src/ 밖 — tsconfig include 밖이라 typecheck가 안 본다):

```
climb-check.mts   # 연속 등반 — sim이 못 재는 층간 HP·숙소를 잰다. 상시 측정 수단
scripts/
  gen-art.mts     # 영웅 일러스트 생성 (npm run gen-art)
  sigma-sweep.mts bias-solve.mts asym-check.mts dist-check.mts reveal-demo.mts
                  # 잠재치 σ=0.08 / bias=0.04의 도출 근거. 수치를 만지기 전에 먼저 볼 것
  seed-search.mts # SEED_OFFSET 도출 근거. 초기 로스터를 만졌으면 여기서 다시 잰다
                  # (sim은 자체 파티를 쓰므로 initialRoster 변경을 못 잡는다)
```

---

## 작업할 때

1. **`docs/HANDOFF.md`를 먼저 읽는다.** 무엇이 끝났고 무엇이 남았는지 정리돼 있다.
   특히 §5(함정)는 이미 밟아본 것들이라 읽지 않으면 같은 걸 다시 밟는다.
2. **설계 의도가 궁금하면 `docs/gdd-v3.md`.** 현행 기획이다.
   `gdd-v1/v2`는 이력용이며 **v2를 현행으로 읽으면 안 된다**(장비를 MVP에서 뺀다고 적혀 있는데
   이미 구현돼 있다). 충돌하면 v3이 이긴다.
3. 로직을 만질 거면 `src/game/types.ts`를 먼저 읽는다.
4. 화면을 만들 거면 `src/reference/Prototype.jsx`를 먼저 읽는다. 이미 동작하는 구현이 있다.
5. 단계마다 커밋한다.
