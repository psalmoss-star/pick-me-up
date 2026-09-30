/**
 * 전투 기록 — 이미 나온 `BattleEvent[]`에서 인상적인 장면(책략)을 문장으로 꺼낸다.
 *
 * 전투를 다시 돌리지 않는다(`quest.ts`와 같은 원칙). 순수 함수이며 React 의존이 없다.
 * 결과 화면·전투 중 비트·영웅 연대기가 **같은 함수**를 쓴다 — 셋이 따로 문장을 만들면
 * 전투 중에 본 장면과 결과 화면의 기록이 갈라진다.
 */
import type { BattleEvent, HeroInstId } from './types';
import { fillVoice } from './voice';
import { STRATAGEM_BY_ID, type StratagemId } from './data/stratagems';
import { CHRONICLE_LINES } from './data/chronicle';

/** 문장을 만드는 데 필요한 유닛 정보 — `RosterUnit`의 부분집합 */
export interface ChronicleUnit {
  uid: string;
  name: string;
  side: 'ally' | 'enemy';
  sourceId: string;
}

export interface ChronicleEntry {
  turn: number;
  /** 이 장면을 연 이벤트의 인덱스 (비트가 여기서 멈춘다) */
  at: number;
  stratagemId: StratagemId;
  success: boolean;
  /** 수행자 instId */
  actor: HeroInstId;
  /** 카드 이름 — 「유인 화공」 */
  title: string;
  /** 장면 문장 — 수행자 이름이 채워져 있다 */
  text: string;
  /** 출전 한 줄 — 책 이름 + 편 */
  source: string;
}

/**
 * 이 전투의 책략 장면들. 발동 순서대로.
 * 모르는 책략 id(미래 세이브 등)는 건너뛴다 — 화면에 빈 기록을 그리지 않는다.
 */
export function chronicleOf(events: BattleEvent[], roster: ChronicleUnit[]): ChronicleEntry[] {
  const byUid = new Map(roster.map((u) => [u.uid, u]));
  const out: ChronicleEntry[] = [];
  events.forEach((e, i) => {
    if (e.type !== 'stratagem' || !e.stratagemId || !e.actorUid) return;
    const id = e.stratagemId as StratagemId;
    const def = STRATAGEM_BY_ID[id];
    const lines = CHRONICLE_LINES[id];
    const actor = byUid.get(e.actorUid);
    if (!def || !lines || !actor) return;
    const success = !!e.success;
    out.push({
      turn: e.turn,
      at: i + 1,
      stratagemId: id,
      success,
      actor: actor.sourceId as HeroInstId,
      title: def.name,
      text: fillVoice(success ? lines.success : lines.failure, { ally: actor.name }),
      source: def.source,
    });
  });
  return out;
}

/**
 * 영웅 연대기에 남기는 한 줄 — **문장이 아니라 사실만** 저장한다.
 * 문장은 표시할 때 `deedText`로 다시 만든다(이름이 바뀌지 않으므로 같은 문장이 나온다).
 */
export interface Deed {
  floor: number;
  stratagemId: StratagemId;
  success: boolean;
}

/** 영웅 한 명이 남기는 연대기는 최근 이만큼만 */
export const DEEDS_KEEP = 5;

/** 이번 전투의 수행자별 연대기 항목 */
export function deedsOf(entries: ChronicleEntry[], floor: number): Map<HeroInstId, Deed[]> {
  const out = new Map<HeroInstId, Deed[]>();
  for (const e of entries) {
    const list = out.get(e.actor) ?? [];
    list.push({ floor, stratagemId: e.stratagemId, success: e.success });
    out.set(e.actor, list);
  }
  return out;
}

/** 기존 연대기에 붙이고 최근 `DEEDS_KEEP`개만 남긴다 */
export function appendDeeds(prev: Deed[] | undefined, add: Deed[]): Deed[] {
  return [...(prev ?? []), ...add].slice(-DEEDS_KEEP);
}

/** 연대기 한 줄 — 「12층 · 유인 화공 · 성공」 */
export function deedText(d: Deed): string {
  const def = STRATAGEM_BY_ID[d.stratagemId];
  return `${d.floor}층 · ${def ? def.name : '잊힌 책략'} · ${d.success ? '성공' : '간파당함'}`;
}

/**
 * 저장본의 연대기 검증 — 모르는 책략·이상한 값은 버린다. 비면 undefined(키를 안 만든다).
 * 세이브(영웅)와 무덤(쓰러진 영웅) 양쪽이 쓴다.
 */
export function sanitizeDeeds(raw: unknown): Deed[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Deed[] = [];
  for (const d of raw) {
    if (typeof d !== 'object' || d === null) continue;
    const o = d as Record<string, unknown>;
    if (typeof o.stratagemId !== 'string' || !STRATAGEM_BY_ID[o.stratagemId as StratagemId]) continue;
    if (typeof o.floor !== 'number' || !Number.isFinite(o.floor) || o.floor < 1) continue;
    out.push({ floor: Math.floor(o.floor), stratagemId: o.stratagemId as StratagemId, success: o.success === true });
  }
  return out.length > 0 ? out.slice(-DEEDS_KEEP) : undefined;
}
