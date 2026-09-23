/**
 * AI 유언 — 프롬프트 조립과 응답 검사(순수). gdd-v3 §4.10.
 *
 * ── AI는 문장만 쓴다 ────────────────────────────────────
 * 이 모듈이 AI에 넘기는 것은 **이미 확정된 사실**뿐이다(누가, 몇 층에서, 누구와).
 * 사망 판정·보상·전투는 전부 끝난 뒤에 부른다. AI의 답이 무엇이든
 * 게임 상태는 한 비트도 바뀌지 않고, 바뀌는 것은 무덤에 적히는 문장뿐이다.
 *
 * ── 규칙은 코드가 지킨다 ────────────────────────────────
 * 프롬프트로 부탁한 규칙(자각 단계, 길이, 영어 금지)을 AI가 어기면
 * `parseLastWords`가 **버리고** 템플릿 유언이 남는다. 프롬프트는 요청이고
 * 검사는 보증이다 — ★2가 "마스터"를 부르는 순간 원작의 자각 단계가 무너진다.
 */
import type { HeroInstance, HeroDef } from '../game/types';
import type { MissionKind } from '../game/mission';
import { MISSION_LABEL } from '../game/mission';
import { ROLE_KR } from '../game/data/formation';
import { klassFor } from '../game/stats';
import { originOf } from '../game/origin';
import { temperOf } from '../game/temperament';
import { awarenessOf } from '../game/voice';

/** AI에 넘기는 사실 묶음. 전부 이미 일어난 일이다 */
export interface LastWordsContext {
  name: string;
  title: string;
  star: number;
  klass: string;
  role: string;
  temper: { label: string; desc: string } | null;
  aware: boolean;
  origin: string | null;
  joinedFloor: number;
  diedFloor: number;
  mission: string;
  /** 발굴 진행도 0~100 — "알아내던 중에 잃었다"의 정도 */
  revealed: number;
  /** 같은 전투에서 함께 죽은 동료 */
  fallenWith: string[];
  /** 살아남은 동료 */
  survivors: string[];
  won: boolean;
}

export function buildContext(args: {
  hero: HeroInstance;
  def: HeroDef;
  name: string;
  title: string;
  floorId: number;
  mission: MissionKind;
  fallenWith: string[];
  survivors: string[];
  won: boolean;
}): LastWordsContext {
  const { hero, def } = args;
  const t = temperOf(hero);
  const o = originOf(hero);
  return {
    name: args.name,
    title: args.title,
    star: hero.star,
    klass: klassFor(hero.star),
    role: ROLE_KR[def.role],
    temper: t ? { label: t.label, desc: t.desc } : null,
    aware: awarenessOf(hero.star) === 'high',
    origin: o ? `${o.station}. ${o.ending}.` : null,
    joinedFloor: hero.acquiredAtFloor,
    diedFloor: args.floorId,
    mission: MISSION_LABEL[args.mission],
    revealed: Math.round((hero.revealProgress ?? 0) * 100),
    fallenWith: args.fallenWith,
    survivors: args.survivors,
    won: args.won,
  };
}

export const SYSTEM_PROMPT = [
  '너는 다크 판타지 가챠 RPG의 대사 작가다.',
  '이 세계의 영웅은 이미 한 번 죽은 자들이 불려 온 존재이고, 탑에서 죽으면 영원히 사라진다.',
  '지금 한 영웅이 전투에서 죽었다. 그 영웅의 유언과 비문을 쓴다.',
  '',
  '규칙:',
  '- 유언: 영웅 본인의 1인칭 마지막 말. 한국어 1~2문장, 60자 이내. 말줄임표로 끊기는 호흡을 써도 된다.',
  '- 기질이 말투로 드러나게 하라. 기질 이름을 직접 말하지 마라.',
  '- 자각이 "모름"이면 마스터·탑·가챠·소환·뽑기라는 말을 절대 쓰지 말고, 자기가 살던 옛 세계의 말로 말하라.',
  '- 자각이 "앎"이면 자기를 부린 마스터에게 말해도 된다.',
  '- 주어진 사실만 쓴다. 새 인물·장소·사건을 지어내지 마라. 동료 이름은 주어진 것만 쓴다.',
  '- 비문: 무덤에 새길 3인칭 한 문장. 40자 이내, 과거형, 건조하게.',
  '- 숫자 능력치, 게임 용어(레벨·경험치·스킬), 이모지, 영어를 쓰지 마라.',
  '',
  '출력은 JSON 한 줄만: {"lastWords":"…","epitaph":"…"}',
].join('\n');

/** 사람이 읽는 사실 목록 — JSON보다 모델이 말투를 잡기 쉽다 */
export function buildUserPrompt(c: LastWordsContext): string {
  const lines = [
    `이름: ${c.name} (${c.title})`,
    `등급: ★${c.star} ${c.klass} · 역할: ${c.role}`,
    c.temper ? `기질: ${c.temper.label} — ${c.temper.desc}` : null,
    `자각: ${c.aware ? '앎' : '모름'}`,
    c.origin ? `생전: ${c.origin}` : null,
    `${c.joinedFloor}층에서 합류해 ${c.diedFloor}층 ${c.mission} 임무에서 죽었다.`,
    `전투 결과: ${c.won ? '동료들은 이겼다' : '패배했다'}`,
    c.fallenWith.length ? `함께 죽은 동료: ${c.fallenWith.join(', ')}` : null,
    c.survivors.length ? `살아남은 동료: ${c.survivors.join(', ')}` : null,
    c.revealed > 0 ? `아무도 이 영웅의 진짜 재능을 끝까지 알지 못했다(드러난 정도 ${c.revealed}%).` : null,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

export interface AiWords {
  lastWords: string;
  epitaph?: string;
}

const MAX_WORDS = 120;
const MAX_EPITAPH = 80;
/** 자각 "모름"이 쓰면 안 되는 말 — data/voice.ts의 low 줄과 같은 규칙 */
const UNAWARE_BANNED = /마스터|탑|가챠|뽑기|소환|봉인/;

function clean(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/^["“”'‘’「」『』]+|["“”'‘’「」『』]+$/g, '').trim();
  return t === '' ? null : t;
}

/**
 * 응답 검사. 조건을 하나라도 어기면 `null` → 템플릿 유언이 남는다.
 * 비문만 어기면 비문만 버린다(유언은 살린다).
 */
export function parseLastWords(raw: string, aware: boolean): AiWords | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const rec = obj as Record<string, unknown>;

  const ok = (t: string | null, max: number): t is string =>
    t !== null
    && t.length <= max
    && !/[A-Za-z]{2,}/.test(t)
    && !/[{}<>]/.test(t)
    && (aware || !UNAWARE_BANNED.test(t));

  const lastWords = clean(rec.lastWords);
  if (!ok(lastWords, MAX_WORDS)) return null;
  const epitaph = clean(rec.epitaph);
  return ok(epitaph, MAX_EPITAPH) ? { lastWords, epitaph } : { lastWords };
}
