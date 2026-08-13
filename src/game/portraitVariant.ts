/**
 * 개체별 초상 변형(슬롯) 선택.
 *
 * ── 이 모듈은 "아트"를 모른다 ────────────────────────────
 * 알고 있는 것은 **"교환 가능한 N개 중 몇 번인가"**뿐이다.
 * `count`가 실제로는 `.jpg` 파일 개수라는 사실은 호출부(`src/ui/art/`)만 안다.
 * `src/game/`이 파일 시스템·아트를 알게 되는 순간 순수성 규칙이 깨진다(CLAUDE.md).
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * "이름만 다르고 캐릭터는 똑같다"의 마지막 층이다. 원인이 셋이었다:
 *   A. 이름이 종류에 붙어 있었다        → identity.ts 가 해결
 *   B. 등급이 곧 캐릭터였다              → gacha.ts pickArchetype 이 해결
 *   C. **초상이 defId 하나로만 정해진다** → 여기
 * A·B를 고쳐도 같은 유형을 다시 뽑으면 얼굴이 그대로 돌아왔다.
 *
 * ── 저장하지 않는다 ─────────────────────────────────────
 * `HeroInstance.seed`에서 매번 다시 계산된다 (types.ts의 "파생값은 저장하지 않는다").
 * 저장하면 변형 파일을 늘렸을 때 기존 개체가 새 아트를 영원히 못 보고,
 * 파일을 줄이면 저장된 번호가 허공을 가리킨다.
 *
 * ⚠️ 변형 **개수**를 바꾸면 기존 개체의 얼굴이 재배치된다.
 *    파생이 count에 의존하기 때문이며, 이를 없애려면 번호를 저장해야 하는데
 *    그건 위 규칙과 충돌한다. 잠재치·이름은 한 비트도 안 변하므로 게임성 영향은 없다.
 *    **그래서 변형 추가는 릴리스 단위로 한 번에 하고, 찔끔찔끔 늘리지 않는다.**
 */
import { substream, rngInt, STREAM } from './rng';
import type { HeroInstance } from './types';

/**
 * 개체 시드 + 후보 수 → 슬롯 번호.
 *
 * ⚠️ `star`를 받지 않는다. 겉모습은 등급과 무관해야 한다 —
 * 등급 표현은 카드 구조(tokens.ts의 STAR_TIERS)가 이미 담당하고,
 * 여기까지 등급을 섞으면 ★5만 특정 얼굴이 나오는 편향이 생긴다.
 *
 * 잠재치와 달리 **전용 스트림(STREAM.VARIANT)**을 쓰므로 pull 스트림 난수를
 * 한 개도 소비하지 않는다. 즉 이 기능을 추가해도 이미 뽑힌 영웅의 잠재치가
 * 비트 단위로 그대로다 (rng.ts의 substream 주석 참조).
 */
export function deriveVariant(seed: number, count: number): number {
  // 후보가 하나뿐이거나 아예 없으면 RNG를 건드리기 전에 끝낸다.
  // 변형 파일을 안 받은 사람에게도 현행과 동일하게 동작해야 한다.
  if (count <= 1) return 0;
  return rngInt(substream(seed, STREAM.VARIANT), count);
}

/**
 * 개체의 슬롯 번호. **여기가 유일한 관문이다** (stats.ts의 `potentialOf`와 같은 패턴).
 *
 * `seed`가 없는 옛 개체는 0번으로 떨어진다 — 0번은 기존 `{defId}.jpg`이므로
 * 구세이브의 영웅은 지금까지 보던 초상을 그대로 유지한다.
 */
export function variantOf(inst: HeroInstance, count: number): number {
  return inst.seed === undefined ? 0 : deriveVariant(inst.seed, count);
}
