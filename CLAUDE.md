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

### 게임 규칙
- 퍼머데스는 협상 대상이 아니다. 사망한 영웅은 어떤 경로로도 되돌리지 않는다.
- **같은 이름의 영웅이 둘 존재하면 안 된다.** 개체는 대체 불가능하고, 그게 화면에 보여야 한다.
  이름은 `displayName(inst, defs)`으로만 읽는다 — `def.name` 직접 읽기 금지.
  죽은 영웅의 이름도 영구 봉인된다(초상화 재사용은 허용).
- 등급과 캐릭터 유형은 **독립**이다. ★5 카일도, ★1 이스카도 나올 수 있다.
- 합성 UI에서 **"제물"이라는 단어를 그대로 쓴다.** 순화하지 말 것.
- 승급은 레벨을 1로 리셋한다 → 승급 직후는 이전보다 약하다. 이건 버그가 아니라 설계다.
- MVP와 사망자는 **같은 결과 화면에** 표시한다. 기쁨과 상실을 분리하면 퍼머데스의 무게가 사라진다.

---

## 명령어

```bash
npm run dev        # 개발 서버
npm test           # Vitest 1회 실행 (현재 495개 통과)
npm run test:watch
npm run sim        # 밸런싱 시뮬레이터 (전 층 승률 출력)
npm run typecheck
```

```bash
npx tsx climb-check.mts   # 연속 등반 — 층간 HP·숙소 레벨별 도달 층 + 구간별 완주율
```

**밸런스를 만졌으면 `npm run sim`을 돌려 승률을 확인한다.** 손으로 플레이테스트하지 말 것.

⚠️ **`sim`은 매 층을 만피로 독립 측정한다.** 층간 HP·숙소·초기 로스터를 만졌으면
sim 표는 미동도 하지 않는다 — `climb-check.mts`를 함께 돌릴 것 (HANDOFF §5-7/§5-9).

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
│  ├─ identity.ts    # 개체 이름 — displayName이 유일한 관문. def.name 직접 읽기 금지
│  ├─ potential.ts    # 잠재치(개체차) — 등급과 약하게 상관된 숨은 계수
│  ├─ reveal.ts        # 발굴 — 잠재치 구간 추정, 전투로 진행도 상승
│  ├─ encounter.ts    # runEncounter — 로스터/MVP 조립
│  ├─ intervention.ts # 개입(집중/수호/후퇴)
│  ├─ beats.ts        # 이벤트 비트 (확인 창 트리거)
│  ├─ sim.ts          # 밸런싱용 CLI
│  └─ data/
│     ├─ sample.ts    # 영웅·적·스킬·상성표 (→ JSON으로 분리 예정)
│     ├─ floors.ts    # 층 정의 — 손으로 짠 1~20층 + 생성분 21~100층
│     ├─ floorgen.ts  # 층 생성기(21~) + 적 깊이 배수. 결정적이어야 한다
│     ├─ potential.ts # 잠재치/발굴 튜닝 상수 단일 출처
│     ├─ facilities.ts # 시설 4종 튜닝 (회복률·공격력·유휴 exp·비용)
│     ├─ gear.ts      # 장비 도감 12종 + 튜닝 (회수율·강화·드롭)
│     ├─ quests.ts    # 과제 13종 — 조건·보상 (사망을 요구하는 과제는 두지 않는다)
│     ├─ names.ts     # 개체 이름 어휘 (이름 66 × 수식어 44 + 이명 26)
│     └─ index.ts     # 전투 엔진용 데이터 번들 (gameData)
├─ stores/
│  ├─ runStore.ts     # 런 상태(Zustand). 게임 상태의 단일 출처
│  └─ save.ts         # 저장/불러오기(localStorage). finish() 직후 자동 저장
├─ ui/                # 비주얼 언어
│  ├─ tokens.ts       # 색·등급 구조. 여기가 단일 출처
│  ├─ SystemPanel.tsx # 시그니처 컴포넌트
│  ├─ HeroCard.tsx    # 타로카드형
│  ├─ OrnateCorner.tsx
│  ├─ BaseMap.tsx     # 거점 부감 맵 — 시설 레벨을 건물 구조로 표현
│  ├─ Button.tsx
│  ├─ useViewport.ts  # 반응형 훅 (분기점 480px 하나)
│  └─ art/            # HeroArt / EnemyArt / GuardArt / Scene (전부 SVG)
├─ screens/           # BaseScreen / BriefScreen / BattleScreen / ResultScreen
│                     # / SummonScreen / ForgeScreen / FacilityScreen
│                     # / ShopScreen / SmithScreen / DetailModal
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
