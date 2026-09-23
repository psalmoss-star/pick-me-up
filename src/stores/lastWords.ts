/**
 * AI 유언의 도착 창구. gdd-v3 §4.10.
 *
 * ── 왜 필요한가 — 두 순서가 다 일어난다 ─────────────────
 * 결과 화면은 `finish()`보다 **먼저** 뜬다(§5-17). AI 유언은 결과 화면에서 요청하는데,
 * 응답이 오는 시점은 둘 중 하나다:
 *
 * 1. 플레이어가 결과를 읽는 동안 도착 → 아직 무덤에 그 사람이 없다 → **보관**했다가
 *    `finish()`가 무덤에 올릴 때 꺼내 쓴다(`takePendingWords`).
 * 2. "대기실로"를 누른 뒤에 도착 → 이미 무덤에 있다 → **바로 고쳐 적는다.**
 *
 * 어느 쪽이든 결과가 같아야 한다. 한쪽만 처리하면 빨리 누르는 사람과 천천히 읽는
 * 사람의 무덤이 달라진다.
 *
 * 보관함은 메모리뿐이다 — 새로고침하면 사라지지만 그때는 템플릿 유언이 이미
 * 무덤에 있으므로 잃는 것은 AI 문장 하나다. 사망 판정은 무엇에도 영향받지 않는다.
 */
import { loadLegacy, saveLegacy, withLastWords } from './legacy';
import type { AiWords } from '../ai/prompt';

export type { AiWords };

const pending = new Map<string, AiWords>();

/** AI 유언이 도착했다. 무덤에 이미 있으면 고쳐 적고, 없으면 보관한다. */
export function offerAiWords(name: string, words: AiWords): 'saved' | 'pending' {
  const legacy = loadLegacy();
  if (legacy.fallen.some((f) => f.name === name)) {
    saveLegacy(withLastWords(legacy, name, { ...words, lastWordsBy: 'ai' }));
    return 'saved';
  }
  pending.set(name, words);
  return 'pending';
}

/** `finish()`가 무덤에 올릴 때 부른다. 꺼내면 보관함에서 지운다 */
export function takePendingWords(name: string): AiWords | undefined {
  const w = pending.get(name);
  pending.delete(name);
  return w;
}

/** 테스트용 */
export function clearPendingWords(): void {
  pending.clear();
}
