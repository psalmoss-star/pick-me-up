# 영웅 카드 아트 — 생성 프롬프트와 채택 시드

생성기: **Pollinations.ai** (무료, API 키 불필요, `flux` 모델)
실행: `npm run gen-art`

```bash
npm run gen-art                     # 없는 것만 생성 (변형 1장 = 예전 동작)
npm run gen-art -- --variants=6     # 유형당 6장 — 개체별 얼굴 분화
npm run gen-art -- --force          # 전부 다시 생성
npm run gen-art -- ashen bolt       # 지정한 것만
```

> ### ⚠️ 전체 `--force`를 함부로 돌리지 말 것
> 시드가 같아도 모델이 갱신되면 결과가 달라져 **채택본이 통째로 바뀐다.**
> 특정 캐릭터만 다시 뽑을 때: `npm run gen-art -- ward --force`

프롬프트 조립은 `scripts/gen-art.mts`가 **`src/game/data/sample.ts`에서 직접 읽어** 한다.
영웅이 늘거나 등급이 바뀌면 프롬프트가 자동으로 따라간다 — 같은 정보를 두 곳에 적지 않는다.
새 영웅을 추가했으면 `APPEARANCE`에 인물 묘사만 넣으면 된다 (없으면 스크립트가 에러로 알려준다).

---

## 스타일 앵커 — 절대 캐릭터마다 바꾸지 말 것

```
dark fantasy tarot card portrait, painterly digital illustration,
muted desaturated palette, dramatic rim lighting, ornate gothic border motif,
single character centered, chest-up composition, moody atmosphere, highly detailed
```

이 문구가 5장을 하나의 세계관으로 묶는다. 캐릭터마다 바뀌는 것은
**인물 묘사(`APPEARANCE`)와 등급 장식(`tierAccent`)뿐**이다.

### ⚠️ 실존 작가 이름을 넣지 않는다

초안 프롬프트에는 `by Greg Rutkowski and Ayami Kojima style`이 있었으나 **제거했다.**

- CLAUDE.md가 "아트는 전부 오리지널"을 요구한다
- 두 사람 모두 생존해 활동 중인 실제 아티스트이고, 화풍 지목 생성물은 상업적 이용 시 분쟁 소지가 있다
- **없어도 된다.** 화풍 통일은 위 앵커 문구가 이미 다 하고 있다

### 등급 장식 (`tierAccent`)

| 등급 | 추가 문구 | 근거 |
|---|---|---|
| ★1~3 | 없음 | CLAUDE.md — "★1~3은 무광·정적" |
| ★4 | `golden ornamental filigree frame accents` | |
| ★5+ | `radiant white-gold halo aura, ornate baroque frame filigree` | "★4~6은 발광·장식" |

`tokens.ts`의 `STAR_TIERS`가 카드 테두리로 하는 일을 **아트 안에서도** 하게 한 것이다.
둘이 어긋나면 ★5 카드에 수수한 그림이 들어가 등급 차이가 흐려진다.

---

## 채택 시드

전부 `seed=42`, `768x1024`, `model=flux`.
바꾸고 싶으면 `scripts/gen-art.mts`의 `SEED_OVERRIDE`에 캐릭터별로 적는다.

| 영웅 | 등급 | 시드 | 상태 |
|---|---|---|---|
| `h_ashen` 재의 카일 | ★1 | 42 | **양호** — 잿빛 머리·불씨 눈·낡은 갑옷 일치 |
| `h_bulwark` 석문의 오르나 | ★2 | 42 | **양호** (프롬프트 수정 후 재생성) ↓ |
| `h_tide` 물결의 세인 | ★3 | 42 | 보통 — 인물은 맞으나 채도가 높고 산호 지팡이 없음 |
| `h_gale` 북풍의 리엔 | ★4 | 42 | 보통 — 단검이 하나뿐(쌍검 아님) |
| `h_bolt` 벼락의 이스카 | ★5 | 42 | **양호** — 뇌전·존재감 확실. 전신 구도라 카드에서 상반신만 보임 |

### 배운 것: 체격은 명사가 아니라 형용사로 준다

첫 시도에서 오르나가 **날씬한 체형에 방패도 돌 질감도 없이** 나왔다.
`sample.ts`의 오르나는 거인족 탱커(vit 30, 5종 중 최고)이므로 정체성이 반대로 나온 것이다.

원인은 `massive stone-skinned **giantess** warrior` — 모델이 `giantess`를
**체격이 아니라 성별로만** 받아들였다. 체격 단어를 앞쪽에 여러 개 깔아 해결했다:

```
towering hulking stone giant warrior, enormous broad shoulders filling the frame, ...
```

**교훈: 체형이 캐릭터 정체성인 경우 `giant`/`giantess` 같은 명사 하나에 기대지 말 것.**
`towering` `hulking` `enormous broad shoulders` 처럼 형용사를 겹쳐야 덩치가 잡힌다.
같은 함정이 `lithe`(리엔) 같은 반대 방향 단어에도 있을 수 있다.

### 남은 개선 여지 (급하지 않음)

- **h_tide** — 채도가 높다. `HeroPortrait`의 `saturate(0.75)`가 완화하지만 근본 해결은 재생성이다.
- **h_gale** — 쌍검이 아니라 단검 하나. `twin curved daggers`를 모델이 자주 무시한다.
  `dual wielding two daggers, one in each hand`처럼 풀어 쓰면 나아질 수 있다.
- 둘 다 **카드 크기에서는 거의 티가 안 난다.** 실제 화면을 보고 판단할 것.

---

## 변형(variant) — 같은 유형, 다른 얼굴

초상이 `defId` 하나로만 정해지면 **같은 유형의 두 개체가 같은 얼굴**이 된다.
이름(`identity.ts`)과 등급 분리(`gacha.ts`)를 고쳤어도 이 층이 남아 있었다 —
"이름만 다르고 캐릭터는 똑같다"의 마지막 원인이다.

### 파일명 규칙

```
h_ashen.jpg     → 슬롯 0   (기존 채택본. 이름을 바꾸지 않는다)
h_ashen_2.jpg   → 슬롯 1
h_ashen_3.jpg   → 슬롯 2
```

슬롯 0을 접미사 없는 이름으로 두는 이유: 이미 커밋된 12장을 안 건드려도 되고,
`seed` 없는 옛 개체와 무덤 기록(`FallenRecord`)이 전부 슬롯 0으로 떨어져
**시각적 회귀가 0**이 된다.

> ⚠️ 파싱은 `src/ui/art/variantNaming.ts`, 파일 쓰기는 `scripts/gen-art.mts`다.
> **한쪽만 고치면 에러 없이 조용히 SVG로 폴백한다** (HANDOFF §5-16 유형).

### 어느 슬롯이 나오는가

`HeroInstance.seed`에서 파생한다(`src/game/portraitVariant.ts`). **저장하지 않는다.**
전용 RNG 스트림(`STREAM.VARIANT`)을 쓰므로 **소환 난수열을 한 개도 소비하지 않는다** —
즉 이 기능을 넣어도 이미 뽑힌 영웅의 잠재치가 비트 단위로 그대로다.

> ⚠️ **변형 개수를 바꾸면 기존 개체의 얼굴이 재배치된다.** 파생이 후보 수에 의존하기
> 때문이다. 잠재치·이름은 안 변하므로 게임성 영향은 없지만, **변형 추가는 릴리스 단위로
> 한 번에 하고 찔끔찔끔 늘리지 않는다.**

### 변형 수식어 (`VARIANT_TRAITS`)

**`STYLE_ANCHOR`는 한 글자도 안 바꾼다.** 화풍이 갈리면 6장이 여섯 세계에서 온 것처럼 보인다.
바꾸는 것은 화풍이 아니라 개체다 — **나이·머리·흉터·자세·시선만** 흔든다.

⚠️ **체격은 건드리지 않는다.** 위 "체격은 명사가 아니라 형용사로" 항목의 반대 방향 함정이다.
오르나(거인족)·군드(벽)에 `slighter narrow build`를 넣으면 탱커로 안 보인다.
0번은 **반드시 빈 문자열**이어야 기존 채택본이 재현된다.

시드는 `기본시드 + v * 1000`이라 `v=0`이 기존 값 그대로다.

### 무료 한도 (2026-08-13 실측)

| 항목 | 값 |
|---|---|
| **동시 요청** | **1개** — 4개 동시 요청 시 3개가 즉시 429 |
| 순차 요청 | 연속 성공, 총량 쿼터 확인 안 됨 |
| 장당 | 약 45초 (768×1024, flux) |

**총량이 아니라 동시성 제한이다. 병렬화하지 말 것.** 72장이면 약 54분이며,
스크립트가 파일별로 건너뛰므로 중간에 끊겨도 다시 돌리면 이어받는다.
3연속 실패면 자동 중단한다(레이트리밋·장애 신호).

---

## 폴백 구조 — 아트는 **선택 사항**이다

```
HeroCard
  └ HeroPortrait          # 이미지 우선
      ├ heroImages.ts     # import.meta.glob으로 assets/ 를 훑는다
      └ HeroArt (SVG)     # 파일이 없거나 로드 실패 시
```

- **파일을 안 받아도 게임이 정상으로 보인다.** 정적 import를 쓰지 않은 이유가 이것이다 —
  정적 import는 파일이 없으면 빌드 자체가 깨진다.
- `onError`로 로드 실패를 기억해 무한 재시도를 막는다.
- **전투 화면(`HeroArt`)은 SVG를 그대로 쓴다.** 5종이 같은 접지선(`cy=74`)에 서도록
  설계돼 있어서, 사진형 이미지를 끼우면 유닛들이 서로 다른 바닥에 뜬 것처럼 보인다.
  정면 초상이 어울리는 **카드에만** 이미지를 쓴다.
- 생성 결과의 채도가 제각각이라 `HeroPortrait`에서 `saturate(0.75)`로 눌러 화면 톤에 맞춘다.
  프롬프트의 "muted desaturated"를 모델이 항상 지키지는 않는다.
