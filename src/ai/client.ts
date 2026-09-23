/**
 * Anthropic Messages API 호출 — 브라우저 전용. gdd-v3 §4.10.
 *
 * 실패는 전부 `null`이다(네트워크·타임아웃·401·형식 위반). 호출부는 null이면
 * 템플릿 유언을 그대로 두면 된다 — **AI가 없어도 게임은 완전하다.**
 * 던지지 않는 이유: 결과 화면에서 부르는데, 유언 하나 때문에 화면이 깨지면 안 된다.
 */
import { SYSTEM_PROMPT, buildUserPrompt, parseLastWords, type AiWords, type LastWordsContext } from './prompt';

export const AI_ENDPOINT = 'https://api.anthropic.com/v1/messages';
/** 짧은 문장 한 쌍이라 가장 빠르고 싼 모델로 충분하다 */
export const AI_MODEL = 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = 12_000;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function requestLastWords(
  ctx: LastWordsContext,
  apiKey: string,
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
  timeoutMs = TIMEOUT_MS,
): Promise<AiWords | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
  try {
    const res = await fetchImpl(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // 브라우저에서 직접 부르려면 필요하다. 키가 플레이어 자신의 것이라 허용되는 방식이다
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
      }),
      signal: ctrl?.signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const text = extractText(data);
    return text ? parseLastWords(text, ctx.aware) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractText(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts = content
    .filter((b): b is { type: 'text'; text: string } =>
      typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text'
      && typeof (b as { text?: unknown }).text === 'string')
    .map((b) => b.text);
  return parts.length ? parts.join('') : null;
}

/** 설정 화면의 "시험" 버튼 — 키가 살아 있는지만 본다 */
export async function testApiKey(apiKey: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)): Promise<boolean> {
  try {
    const res = await fetchImpl(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 5,
        messages: [{ role: 'user', content: '응' }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
