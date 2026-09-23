/**
 * 대사 선택 — 누가, 어느 순간에, 무슨 말을 하는가. gdd-v3 §4.10.
 *
 * ── 결정적이어야 한다 ───────────────────────────────────
 * 같은 영웅이 같은 순간에 화면을 다시 열 때마다 다른 말을 하면 말이 아니라
 * 난수로 읽힌다. 그래서 선택은 **seed + 순간 + 맥락(salt)**만 본다.
 * 맥락은 순간마다 다르다 — 출정은 층 번호, 동료 사망은 먼저 간 동료의 이름.
 * 같은 층에 다시 올라가면 같은 말을 한다(그 층 앞에서 그 사람이 하는 말이다).
 *
 * ── 표시 전용 ───────────────────────────────────────────
 * 전투·보상·저장 어디에도 닿지 않는다. `STREAM.VOICE`는 게임 RNG를 소비하지 않는
 * 별도 흐름이라 시드 재현성(§4.3)과 무관하다.
 */
import type { HeroInstance, Star } from './types';
import { STREAM, rngPick, substream } from './rng';
import { temperOf } from './temperament';
import { legendOf } from './legend';
import { VOICE_LINES, type Awareness, type VoiceMoment } from './data/voice';
import type { TemperDef } from './data/temperaments';

/**
 * 자각 단계 — 원작 재현. 등급이 높을수록 자기 처지를 안다.
 * 경계가 ★4인 이유: ★1~3은 무광·정적, ★4~6은 발광·장식(CLAUDE.md의 UI 분기)과
 * 같은 자리다. 카드가 빛나기 시작하는 등급에서 영웅도 눈을 뜬다.
 */
export function awarenessOf(star: Star): Awareness {
  return star >= 4 ? 'high' : 'low';
}

/** 맥락 문자열/숫자 → 32bit. 결정적이면 충분하다(FNV-1a) */
function hashSalt(salt: string | number): number {
  const s = String(salt);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface VoiceVars {
  /** 동료 사망에서 먼저 간 동료의 이름 */
  ally?: string;
  /** 죽은 층 */
  floor?: number;
}

/**
 * 마지막 글자에 받침이 있는가. 한글 음절이 아니면(숫자·영문) 없음으로 본다.
 * 조사 선택(이/가, 을/를…)의 유일한 기준이다.
 */
export function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** 조사 꼴이 붙은 자리표시 — `{ally:이/가}` */
export const ALLY_PARTICLE = /\{ally:([^/}]+)\/([^}]+)\}/g;

/** 자리표시를 채운다. 값이 없는 자리표시는 지운다 — 중괄호가 화면에 찍히면 안 된다 */
export function fillVoice(text: string, vars: VoiceVars = {}): string {
  const ally = vars.ally ?? '그';
  return text
    .replace(ALLY_PARTICLE, (_, withB: string, noB: string) => ally + (hasBatchim(ally) ? withB : noB))
    .replace(/\{ally\}/g, ally)
    .replace(/\{floor\}/g, vars.floor !== undefined ? String(vars.floor) : '이');
}

export interface Line {
  text: string;
  temper: TemperDef;
}

/**
 * 한 마디. seed가 없는 옛 세이브 개체는 `null` — 말하지 않는다.
 * 화면은 null이면 대사 줄을 아예 그리지 않는다(빈 따옴표를 그리지 않는다).
 */
export function lineFor(
  hero: { seed?: number; star: Star; legendId?: string },
  moment: VoiceMoment,
  salt: string | number,
  vars: VoiceVars = {},
): Line | null {
  const temper = temperOf(hero);
  if (!temper || hero.seed === undefined) return null;
  // 전설(§4.11)은 자기 말을 한다. 기질 표가 아니라 그 사람의 대사에서 고른다
  const legend = legendOf(hero);
  const pool = legend
    ? legend.lines[moment]
    : VOICE_LINES[moment][temper.id][awarenessOf(hero.star)];
  const rng = substream((hero.seed ^ hashSalt(`${moment}:${salt}`)) >>> 0, STREAM.VOICE);
  return { text: fillVoice(rngPick(rng, pool), vars), temper };
}

/**
 * 템플릿 유언. AI 유언이 없거나 실패하면 이것이 무덤에 남는다.
 * `finish()`와 결과 화면이 **같은 함수·같은 입력**을 쓰므로 둘이 갈리지 않는다.
 */
export function templateLastWords(hero: HeroInstance, floorId: number): string | null {
  return lineFor(hero, 'death', floorId, { floor: floorId })?.text ?? null;
}

/**
 * 여럿 중 말할 사람 하나를 고른다(출정·동료 사망). seed가 있는 사람만 후보다.
 * 목록 순서가 아니라 **instId 정렬**로 고르는 이유: 편성 순서를 바꿨다고
 * 같은 층 앞에서 말하는 사람이 바뀌면 안 된다.
 */
export function pickSpeaker<H extends { instId: string; seed?: number }>(
  heroes: readonly H[],
  salt: string | number,
): H | null {
  const cands = heroes.filter((h) => h.seed !== undefined)
    .slice()
    .sort((a, b) => (a.instId < b.instId ? -1 : a.instId > b.instId ? 1 : 0));
  if (cands.length === 0) return null;
  return cands[hashSalt(`speaker:${salt}`) % cands.length];
}
