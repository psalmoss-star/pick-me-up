import { describe, it, expect, vi } from 'vitest';
import { AI_ENDPOINT, AI_MODEL, requestLastWords, testApiKey } from './client';
import type { LastWordsContext } from './prompt';

const ctx: LastWordsContext = {
  name: '세인', title: '가라앉은 자', star: 2, klass: '견습병', role: '치유',
  temper: { label: '다정', desc: '…' }, aware: false, origin: null,
  joinedFloor: 1, diedFloor: 4, mission: '토벌', revealed: 0,
  fallenWith: [], survivors: ['카일'], won: false,
};

const okResponse = (text: string) => ({
  ok: true,
  json: async () => ({ content: [{ type: 'text', text }] }),
}) as unknown as Response;

describe('AI 호출', () => {
  it('Messages API 형식으로 부른다', async () => {
    const f = vi.fn(async () => okResponse('{"lastWords":"다들… 무사하죠…?"}'));
    const w = await requestLastWords(ctx, 'sk-test', f);
    expect(w?.lastWords).toBe('다들… 무사하죠…?');

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(AI_ENDPOINT);
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(AI_MODEL);
    expect(body.messages[0].content).toContain('세인');
  });

  it('실패는 전부 null이다 — 던지지 않는다', async () => {
    const notOk = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response);
    expect(await requestLastWords(ctx, 'k', notOk)).toBeNull();

    const boom = vi.fn(async () => { throw new Error('network'); });
    expect(await requestLastWords(ctx, 'k', boom)).toBeNull();

    const weird = vi.fn(async () => ({ ok: true, json: async () => ({ nope: 1 }) }) as unknown as Response);
    expect(await requestLastWords(ctx, 'k', weird)).toBeNull();
  });

  it('규칙을 어긴 답(★2가 마스터를 부름)은 null — 템플릿이 남는다', async () => {
    const f = vi.fn(async () => okResponse('{"lastWords":"마스터… 잘 있어요."}'));
    expect(await requestLastWords(ctx, 'k', f)).toBeNull();
  });

  it('시간이 넘으면 끊고 null이다', async () => {
    const hang = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, rej) => {
      init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    }));
    expect(await requestLastWords(ctx, 'k', hang, 20)).toBeNull();
  });

  it('키 시험은 응답 여부만 본다', async () => {
    expect(await testApiKey('k', vi.fn(async () => ({ ok: true }) as Response))).toBe(true);
    expect(await testApiKey('k', vi.fn(async () => ({ ok: false }) as Response))).toBe(false);
  });
});
