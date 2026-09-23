/**
 * 외부 API 금지 — 사용자 결정(2026-09-23). CLAUDE.md "외부 API" 절.
 *
 * 게임은 어떤 외부 API도 부르지 않는다. AI 유언(STEP 55)을 넣었다가 같은 날 걷어냈다.
 * 이 테스트가 막는 것은 **다시 들어오는 것**이다 — 코드 리뷰나 기억에 맡기면
 * 언젠가 "편의 기능"으로 슬그머니 돌아온다.
 *
 * 두 겹이다:
 * 1. 여기 — `src/`에 네트워크 호출 코드·API 주소·SDK 의존성이 있으면 실패한다.
 * 2. `index.html`의 CSP `connect-src 'self'` — 테스트를 피해 들어와도 브라우저가 막는다.
 *
 * ⚠️ 이 테스트를 고쳐서 통과시키지 말 것. 풀어야 한다면 사용자에게 먼저 묻는다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const SELF = 'noExternalApi.test.ts';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|js|jsx|mjs|mts)$/.test(name) && name !== SELF ? [p] : [];
  });
}

/** 네트워크를 여는 코드와 AI API의 흔적 */
const FORBIDDEN: [RegExp, string][] = [
  [/\bfetch\s*\(/, 'fetch 호출'],
  [/XMLHttpRequest/, 'XHR'],
  [/new\s+WebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/sendBeacon/, 'sendBeacon'],
  [/\baxios\b/, 'axios'],
  [/api\.anthropic\.com/, 'Anthropic API 주소'],
  [/api\.openai\.com/, 'OpenAI API 주소'],
  [/generativelanguage\.googleapis\.com/, 'Gemini API 주소'],
  [/x-api-key/i, 'API 키 헤더'],
  [/anthropic-dangerous-direct-browser-access/, '브라우저 직접 호출 헤더'],
  [/Authorization['"]?\s*:\s*[`'"]Bearer/, 'Bearer 인증 헤더'],
];

const FORBIDDEN_DEPS = [
  '@anthropic-ai/sdk', 'openai', '@google/generative-ai', '@google/genai',
  'ai', '@ai-sdk/anthropic', '@ai-sdk/openai', 'langchain', '@langchain/core', 'axios',
];

describe('외부 API 금지', () => {
  it('src/ 어디에도 네트워크 호출·API 주소가 없다', () => {
    const hits: string[] = [];
    for (const f of walk(SRC)) {
      const text = readFileSync(f, 'utf8');
      for (const [re, what] of FORBIDDEN) {
        if (re.test(text)) hits.push(`${relative(ROOT, f)} — ${what}`);
      }
    }
    expect(hits, '외부 API는 사용자 결정으로 금지다(CLAUDE.md)').toEqual([]);
  });

  it('AI·HTTP SDK를 의존성에 넣지 않는다', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => FORBIDDEN_DEPS.includes(d))).toEqual([]);
  });

  it('index.html이 CSP로 외부 연결을 막는다', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
    expect(m, 'CSP meta가 없다').not.toBeNull();
    const connect = m![1].split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'));
    expect(connect).toBe("connect-src 'self'");
  });

  it('AI 코드 폴더가 없다', () => {
    expect(() => statSync(join(SRC, 'ai'))).toThrow();
  });
});
