/**
 * AI 유언 설정 — 플레이어 자신의 API 키. gdd-v3 §4.10.
 *
 * ── 왜 플레이어 키인가 ──────────────────────────────────
 * 이 게임은 서버 없는 정적 웹앱이다. 개발자 키를 번들에 넣으면 누구나 꺼내 쓴다.
 * 그래서 **선택 기능**으로 두고, 켜려면 플레이어가 자기 키를 넣는다.
 * 키는 이 브라우저의 localStorage에만 있고 Anthropic API 외에는 어디로도 안 간다.
 *
 * 무덤·런 세이브와 **키를 나눈다.** 회차를 새로 시작해도(clearRun) 설정은 남아야 하고,
 * 세이브를 내보내거나 지울 때 키가 딸려 가면 안 된다.
 */
export const AI_KEY = 'tower-of-picks:ai';

export interface AiConfig {
  apiKey: string;
}

export function loadAiConfig(): AiConfig | null {
  try {
    const raw = localStorage.getItem(AI_KEY);
    if (!raw) return null;
    const p: unknown = JSON.parse(raw);
    if (typeof p === 'object' && p !== null && typeof (p as AiConfig).apiKey === 'string'
      && (p as AiConfig).apiKey.trim() !== '') {
      return { apiKey: (p as AiConfig).apiKey.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAiConfig(c: AiConfig): boolean {
  try {
    localStorage.setItem(AI_KEY, JSON.stringify({ apiKey: c.apiKey.trim() }));
    return true;
  } catch {
    return false;
  }
}

export function clearAiConfig(): void {
  try {
    localStorage.removeItem(AI_KEY);
  } catch {
    // 지우지 못해도 치명적이지 않다
  }
}

/** 화면에 키를 그대로 찍지 않는다 — 끝 네 자리만 */
export function maskKey(k: string): string {
  return k.length <= 4 ? '••••' : `••••${k.slice(-4)}`;
}
