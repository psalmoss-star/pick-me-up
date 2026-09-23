/**
 * 결과 화면의 유언 — 템플릿을 먼저 보이고, AI 유언이 오면 바꿔 끼운다. gdd-v3 §4.10.
 *
 * ⚠️ **한 사람당 한 번만 부른다.** 결과 화면은 다시 그려질 수 있고(리렌더·재진입),
 * 부를 때마다 다른 문장이 오면 "읽던 유언이 바뀐다". 그래서 요청은 모듈 전역에서
 * 이름으로 한 번만 하고, 도착한 문장은 `offerAiWords`로 무덤에 넘긴다.
 * 봉인된 이름은 유일하므로(§4.8) 이름이 곧 그 사람이다.
 */
import { useEffect, useState } from 'react';
import { loadAiConfig } from './config';
import { requestLastWords } from './client';
import type { AiWords, LastWordsContext } from './prompt';
import { offerAiWords } from '../stores/lastWords';

export interface DeathWords {
  text: string;
  epitaph?: string;
  byAi: boolean;
  /** AI 유언을 기다리는 중 */
  waiting: boolean;
}

/** 이름 → 진행 중이거나 끝난 요청. 끝난 결과가 null이면 AI가 실패한 것 */
const inflight = new Map<string, Promise<AiWords | null>>();
const settled = new Map<string, AiWords | null>();

export interface DeathEntry {
  name: string;
  template: string | null;
  ctx: LastWordsContext;
}

export function useLastWords(entries: DeathEntry[]): Record<string, DeathWords> {
  const [, bump] = useState(0);
  const cfg = loadAiConfig();
  // 의존성 비교용 키 — 배열 정체성이 아니라 사람 목록으로 본다
  const key = entries.map((e) => e.name).join('|');

  useEffect(() => {
    if (!cfg) return;
    let alive = true;
    for (const e of entries) {
      if (settled.has(e.name) || inflight.has(e.name)) {
        inflight.get(e.name)?.then(() => alive && bump((n) => n + 1));
        continue;
      }
      const p = requestLastWords(e.ctx, cfg.apiKey).then((w) => {
        settled.set(e.name, w);
        inflight.delete(e.name);
        if (w) offerAiWords(e.name, w);
        return w;
      });
      inflight.set(e.name, p);
      p.then(() => alive && bump((n) => n + 1));
    }
    return () => { alive = false; };
    // cfg는 렌더마다 새로 읽지만 키 유무만 의미가 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cfg?.apiKey]);

  const out: Record<string, DeathWords> = {};
  for (const e of entries) {
    const ai = settled.get(e.name);
    if (ai) {
      out[e.name] = { text: ai.lastWords, epitaph: ai.epitaph, byAi: true, waiting: false };
    } else if (e.template) {
      out[e.name] = {
        text: e.template,
        byAi: false,
        waiting: !!cfg && !settled.has(e.name),
      };
    }
  }
  return out;
}
