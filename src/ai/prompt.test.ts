import { describe, it, expect } from 'vitest';
import { buildContext, buildUserPrompt, parseLastWords, SYSTEM_PROMPT } from './prompt';
import { gameData } from '../game/data';
import type { HeroInstance, Star } from '../game/types';

const hero = (star: Star, seed: number | undefined): HeroInstance => ({
  instId: 'h#1' as any,
  defId: 'h_tide' as any,
  star,
  klass: '초보자' as any,
  level: 10,
  exp: 0,
  seed,
  revealProgress: 0.4,
  currentHp: 0,
  isDead: true,
  acquiredAtFloor: 3,
});

const ctxOf = (star: Star, seed: number | undefined = 7) => buildContext({
  hero: hero(star, seed),
  def: gameData.heroes['h_tide' as never],
  name: '세인',
  title: '가라앉은 자',
  floorId: 12,
  mission: 'defend',
  fallenWith: ['카일'],
  survivors: ['이스카', '마르'],
  won: true,
});

const ctxArgs = () => ({
  hero: hero(3, 7),
  def: gameData.heroes['h_tide' as never],
  name: '세인', title: '가라앉은 자', floorId: 12, mission: 'defend' as const,
  fallenWith: [], survivors: [], won: true,
});

describe('AI 유언 — 넘기는 사실', () => {
  it('확정된 사실만 담는다 — 층·동료·생전·기질', () => {
    const p = buildUserPrompt(ctxOf(5));
    expect(p).toContain('세인');
    expect(p).toContain('3층에서 합류해 12층');
    expect(p).toContain('카일');
    expect(p).toContain('이스카, 마르');
    expect(p).toContain('기질:');
    expect(p).toContain('자각: 앎');
  });

  it('★1~3은 자각 "모름"으로 넘어간다', () => {
    expect(ctxOf(3).aware).toBe(false);
    expect(buildUserPrompt(ctxOf(2))).toContain('자각: 모름');
  });

  it('seed 없는 옛 개체는 기질·생전 줄이 빠진다(지어내지 않는다)', () => {
    const p = buildUserPrompt(buildContext({ ...ctxArgs(), hero: hero(3, undefined) }));
    expect(p).not.toContain('기질:');
    expect(p).not.toContain('생전:');
  });

  it('시스템 프롬프트가 출력 형식과 자각 규칙을 말한다', () => {
    expect(SYSTEM_PROMPT).toContain('"lastWords"');
    expect(SYSTEM_PROMPT).toContain('모름');
  });
});

describe('AI 유언 — 응답 검사 (규칙은 코드가 지킨다)', () => {
  it('정상 응답을 읽는다', () => {
    const w = parseLastWords('{"lastWords":"먼저 가서… 기다리겠습니다.","epitaph":"그는 끝까지 서 있었다."}', true);
    expect(w).toEqual({ lastWords: '먼저 가서… 기다리겠습니다.', epitaph: '그는 끝까지 서 있었다.' });
  });

  it('앞뒤 잡담과 따옴표를 걷어낸다', () => {
    const w = parseLastWords('여기 있습니다:\n{"lastWords":"“잘 있어라…”","epitaph":"조용히 갔다."}\n끝', true);
    expect(w?.lastWords).toBe('잘 있어라…');
  });

  it('JSON이 아니면 버린다', () => {
    expect(parseLastWords('그냥 문장', true)).toBeNull();
    expect(parseLastWords('{깨진 json', true)).toBeNull();
  });

  it('★1~3이 마스터·탑을 말하면 버린다 — 원작의 자각 단계', () => {
    expect(parseLastWords('{"lastWords":"마스터… 미안합니다."}', false)).toBeNull();
    expect(parseLastWords('{"lastWords":"탑이 너무 높군."}', false)).toBeNull();
    // 자각 "앎"이면 괜찮다
    expect(parseLastWords('{"lastWords":"마스터… 미안합니다."}', true)?.lastWords).toBe('마스터… 미안합니다.');
  });

  it('영어·너무 긴 문장·중괄호는 버린다', () => {
    expect(parseLastWords('{"lastWords":"Goodbye master"}', true)).toBeNull();
    expect(parseLastWords(`{"lastWords":"${'가'.repeat(121)}"}`, true)).toBeNull();
    expect(parseLastWords('{"lastWords":"{ally}여 안녕"}', true)).toBeNull();
  });

  it('비문만 어기면 비문만 버리고 유언은 살린다', () => {
    const w = parseLastWords('{"lastWords":"잘 가라.","epitaph":"He died."}', true);
    expect(w).toEqual({ lastWords: '잘 가라.' });
  });
});
