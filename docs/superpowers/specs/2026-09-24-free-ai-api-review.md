# 무료 AI API 검토 — 사용자 결정 전 (2026-09-24)

> 사용자 요구(2026-09-24): "외부 API를 캐릭터 생성처럼 끌어올 것이다. 단 **돈이 나가는 건 절대 안 된다.**
> 무료이고 검증된 API만. **끌어오기 전 반드시 나에게 알릴 것.**"
>
> 이 문서는 조사 결과와 결정지다. **코드·CLAUDE.md·`noExternalApi.test.ts`·CSP는 아직 그대로다.**
> 사용자가 §5의 결정을 내리면 그때 규칙을 고친다(STEP 56의 "테스트를 고쳐서 통과시키지 말 것"은
> 사용자 결정 없이 고치지 말라는 뜻이고, 이 문서가 그 결정을 받는 자리다).

---

## 1. 먼저 갈라야 할 것 — 빌드 타임 vs 런타임

| | 빌드 타임 | 런타임 |
|---|---|---|
| 누가 부르나 | **개발자 PC에서 한 번** (`scripts/`) | **플레이어 폰이 매번** (`src/`) |
| 결과 | 파일로 저장 → `data/`·`assets/`에 커밋 | 그 자리에서 생성 |
| 비용 | 개발자 무료 한도 안에서 0 | 플레이어 수에 비례 |
| 키 | 개발자 PC에만 | **앱 안에 들어간다** (§2-1) |
| 결정성 | 유지(게임은 파일만 읽음) | 깨짐 → 표시 전용 + 문장 저장 필수 |
| 현행 규칙 | **이미 허용** — `gen-art.mts`가 Pollinations로 초상을 만든다 | **금지**(STEP 56) |

**빌드 타임은 규칙을 바꾸지 않고 지금 바로 할 수 있고, 게임을 "알차게" 만드는 데는 이쪽이 더 크다.**
런타임은 "내 플레이에 반응한다"는 재미가 있지만 §2의 문제를 "무료"가 풀어주지 않는다.

---

## 2. "무료"가 풀어주지 않는 네 가지

1. **키 노출.** 서버가 없으면 API 키가 앱 번들에 들어가고, 누구나 꺼내 쓴다.
   카드가 붙은 계정이면 **남이 쓴 만큼 청구된다.** "돈이 절대 안 나간다"의 최대 위험은 요금표가 아니라 **탈취된 키**다.
2. **무료 한도는 키당이지 플레이어당이 아니다.** Google AI Studio 20~1,500회/일, OpenRouter 50회/일,
   Groq 1,000회/일 — 플레이어 100명이면 첫날 소진. 소진 뒤엔 그 기능이 전원에게 죽는다.
3. **무료 조건은 바뀐다.** Pollinations가 **이번 달**(9/15, 9/21) 모델 6개를 유료(Pollen)로 돌리고
   `sk_` 키를 요구하기 시작했다 — 우리 `gen-art.mts`가 쓰는 곳이다. **PC에서 `npm run gen-art`가 아직 도는지 확인할 것.**
4. **약관·심사.** Google AI Studio 무료는 EU 밖 데이터를 **학습에 쓴다.** 플레이어 데이터(이름·플레이 기록)를
   보내면 개인정보 고지가 필요하고, 앱 출시 심사 대상이 된다.

---

## 3. "돈이 절대 안 나가는" 조건을 실제로 만족하는 조합

- **카드를 등록하지 않는 제공자만 쓴다.** OpenRouter · Google AI Studio · Groq · Cerebras · Cloudflare · Hugging Face · AI Horde는
  전부 카드 없이 무료 티어를 연다. 카드가 없으면 한도 초과 시 **요청이 거부될 뿐 청구가 불가능하다.**
  → CLAUDE.md에 **"어느 제공자에도 결제 수단을 등록하지 않는다"**를 박는다(§5-C).
- **키를 숨길 곳이 하나 필요하다.** Cloudflare Worker(무료 플랜, 카드 불요, 하루 10만 요청)가 "초소형 서버"다.
  키를 Worker에 두고, 플레이어당 하루 N회로 자른다. 이게 없으면 **런타임 API는 하지 않는다** — "서버 없음"의 유일한 예외.
  Workers AI(같은 계정)는 하루 10,000 뉴런 무료, 텍스트·이미지 모델 포함. 초과 시 "유료로 업그레이드"이지 자동 청구가 아니다(카드 미등록 전제).
- **온디바이스(WebLLM / Transformers.js).** 키·서버·비용 0, 오프라인. 대신 모델 0.5~2GB 다운로드, WebGPU 되는 폰만, 품질 낮음.
  **옵션("AI 모드")으로만** 두고 템플릿 폴백을 유지한다.
- **AI Horde.** 완전 무료·익명 키(`0000000000`)·이미지+텍스트. 단 익명은 큐 최하위(수 분 대기), AGPL, 상업 이용 조건 미명시. 빌드 타임용.

---

## 4. 기능별 후보

| 게임 기능 | 방식 | 후보 | 판단 |
|---|---|---|---|
| 초상 변형 확대 (12종 × N장, 전설 전용 초상) | 빌드 | Pollinations(§2-3 확인) / AI Horde / Cloudflare FLUX-schnell | **지금 바로.** 규칙 변경 없음 |
| 전설 6→30명 서사·대사, 층 도감 문구, 보스 패턴 설명, 이름·서사 어휘 확장 | 빌드 | Google AI Studio / Groq / OpenRouter free | **지금 바로.** 생성 → 사람이 검수 → `data/`에 파일로. 게임은 순수 함수 그대로 |
| 사망 정리 문장 · 연대기 제목 · 유언 | 런타임 | 온디바이스(옵션) → 나중에 Worker+Gemini | 템플릿 폴백 필수. 생성 결과는 **문장으로 저장**(유언 규칙 — 표를 고쳐도 무덤이 안 바뀐다) |
| 개체별 초상 (뽑을 때 1장) | 런타임 | Worker + Cloudflare FLUX / AI Horde | 하루 한도 실측 필요. IndexedDB 저장, 실패 시 기존 변형 초상 |
| 내 플레이에 반응하는 대사 (평판 대사) | 런타임 | Worker + Gemini | 결정성 깨짐 → 표시 전용·저장·하루 N회. **5명 테스트 뒤** |

**순서:** ① 빌드 타임(지금) → ② 온디바이스 옵션 → ③ Worker 경유 런타임(테스트 뒤).
①만으로도 "알참"의 대부분이 온다. ③은 fun-plan-v2의 순환이 돌아간 뒤에 얹는다.

---

## ✅ 결정 (2026-09-24, 사용자)

**A — 미리 만들기(빌드 타임)만으로 시작. 폰 안 AI(WebLLM)는 5명 테스트 뒤 다시 정한다.**

- 런타임 외부 호출 금지(STEP 56)는 **그대로**다. `noExternalApi.test.ts`·CSP 변경 없음.
- 빌드 타임 도구(`scripts/`)는 **무료·카드/충전 없음·사용 전 사용자 승인** 조건으로 쓴다(CLAUDE.md에 반영).
- 테스트에서 "사망 기록 문장이 뻔하다"는 반응이 나오면 B(온디바이스)를 다시 꺼낸다. A로 만든 문장은 B의 폴백이 된다.
- 아래 §5의 B·C(Cloudflare 계정, 런타임 규칙 문안)는 **보류**.

## 5. 사용자 결정 필요 (A로 결정됨 — 위 참고)

- **A. 허용 범위** — (a) 빌드 타임만(현행 규칙 유지) / (b) + 온디바이스 / (c) + Worker 경유 런타임
- **B. Cloudflare 무료 계정을 만들 것인가** (카드 없이). (c)의 전제이며 "서버 없음"의 유일한 예외
- **C. 규칙 문구** — CLAUDE.md의 "외부 API 금지"를 아래로 바꾸는 데 동의하는가

> ⛔ 외부 API (사용자 결정, 2026-09-24)
> - 외부 API는 **무료·카드 미등록·검증된 제공자**만, **끌어오기 전에 사용자에게 먼저 알리고 승인받는다.**
> - **어느 제공자에도 결제 수단을 등록하지 않는다.** 한도 초과는 기능 정지이지 청구가 아니어야 한다.
> - 키를 앱 번들에 넣지 않는다. 런타임 호출은 Worker 경유만.
> - 생성 결과는 표시 전용이며 **문장·파일로 저장**한다. `game/`은 여전히 순수 함수이고 결정적이다.
> - 모든 AI 기능은 **템플릿 폴백**을 가진다 — 한도가 소진돼도 게임은 완전하다.

- **D. Pollinations 상태 확인** — PC에서 `npm run gen-art` 실행. 실패하면 AI Horde 또는 Cloudflare로 교체.

---

## 출처

- OpenRouter, *Free LLM API in 2026: 13 Options Ranked and Compared* https://openrouter.ai/blog/tutorials/free-llm-apis-compared/
- Pollinations 무료 티어 변경(2026-09) https://github.com/vava-nessa/free-coding-models/issues/190
- Cloudflare Workers AI 무료 티어 https://costbench.com/software/llm-api-providers/cloudflare-workers-ai/free-plan/
- AI Horde https://github.com/Haidra-Org/AI-Horde
- Google AI Studio 무료 한도 https://www.aifreeapi.com/en/posts/gemini-api-free-tier-complete-guide
- Groq 무료 한도 https://tokenmix.ai/blog/groq-free-tier-limits-2026
- 브라우저 내 LLM https://www.intel.com/content/www/us/en/developer/articles/technical/web-developers-guide-to-in-browser-llms.html
