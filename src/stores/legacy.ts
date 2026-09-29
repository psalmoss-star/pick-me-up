/**
 * 무덤(영구 기록) 저장.
 *
 * ── 왜 런 세이브와 키를 나누는가 ───────────────────────
 * 한 파일에 두면 회차 시작이 "일부만 지우는" 작업이 되고, RunSlice에 필드가 늘 때마다
 * "이건 지우나 남기나"를 판단해야 한다. 파일이 갈려 있으면 실수할 수 없다 —
 * clearRun()은 SAVE_KEY만 지우므로 **퍼머데스가 무덤을 오염시킬 경로가 없다.**
 *
 * ── save.ts와 같은 규칙 ────────────────────────────────
 * 절대 던지지 않는다. 깨졌거나 없으면 빈 기록을 돌려준다.
 */
import type { CodexEntry, HeroDefId } from '../game/types';
import type { FallenRecord, Legacy, RunRecord, SummitRecord } from '../game/legacyTypes';
import { isLegendId } from '../game/legend';
import { sanitizeDeeds } from '../game/chronicle';

export const LEGACY_KEY = 'tower-of-picks:legacy';
export const LEGACY_VERSION = 1;

export function emptyLegacy(): Legacy {
  return {
    version: LEGACY_VERSION,
    runNo: 1,
    runs: [],
    fallen: [],
    summit: [],
    codex: {} as Record<HeroDefId, CodexEntry>,
    legendsMet: [],
  };
}

export function serializeLegacy(l: Legacy): string {
  // 필드를 명시적으로 고른다 — 스프레드로 넘기면 나중에 런 상태가 조용히 새어나간다.
  return JSON.stringify({
    version: LEGACY_VERSION,
    runNo: l.runNo,
    runs: l.runs,
    fallen: l.fallen,
    summit: l.summit,
    codex: l.codex,
    legendsMet: l.legendsMet,
  });
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function deserializeLegacy(raw: string): Legacy {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed)) return emptyLegacy();

    /**
     * 미래 버전은 읽지 않는다. 억지로 읽으면 모르는 필드를 떨어뜨린 채 덮어써서
     * 상위 버전 기록을 파괴한다 (save.ts와 같은 판단).
     */
    const version = num(parsed.version, 0);
    if (version > LEGACY_VERSION) return emptyLegacy();

    const fallen: FallenRecord[] = Array.isArray(parsed.fallen)
      ? parsed.fallen.filter(isObj).map((f): FallenRecord => ({
          name: str(f.name),
          title: str(f.title),
          star: num(f.star, 1) as FallenRecord['star'],
          defId: str(f.defId) as HeroDefId,
          floorId: num(f.floorId, 1),
          revealProgress: Math.max(0, Math.min(1, num(f.revealProgress, 0))),
          runNo: num(f.runNo, 1),
          // 유언은 선택 필드 — 없으면 키 자체를 안 만든다(옛 기록과 모양이 같아야 한다)
          ...(typeof f.lastWords === 'string' && f.lastWords !== ''
            ? { lastWords: f.lastWords } : {}),
          ...(() => { const deeds = sanitizeDeeds(f.deeds); return deeds ? { deeds } : {}; })(),
        })).filter((f) => f.name !== '')
      : [];

    const runs: RunRecord[] = Array.isArray(parsed.runs)
      ? parsed.runs.filter(isObj).map((r) => ({
          runNo: num(r.runNo, 1),
          reachedFloor: num(r.reachedFloor, 1),
          cleared: r.cleared === true,
          deaths: num(r.deaths, 0),
          summons: num(r.summons, 0),
          endedAt: num(r.endedAt, 0),
        }))
      : [];

    const summit: SummitRecord[] = Array.isArray(parsed.summit)
      ? parsed.summit.filter(isObj).map((s) => ({
          runNo: num(s.runNo, 1),
          heroes: Array.isArray(s.heroes)
            ? s.heroes.filter(isObj).map((h) => ({
                name: str(h.name),
                title: str(h.title),
                star: num(h.star, 1) as SummitRecord['heroes'][number]['star'],
                defId: str(h.defId) as HeroDefId,
              }))
            : [],
        }))
      : [];

    return {
      version: LEGACY_VERSION,
      runNo: Math.max(1, num(parsed.runNo, 1)),
      runs,
      fallen,
      summit,
      codex: isObj(parsed.codex)
        ? (parsed.codex as Record<HeroDefId, CodexEntry>)
        : ({} as Record<HeroDefId, CodexEntry>),
      // 이 필드 이전의 무덤에는 없다 — 빈 목록. 모르는 id는 버린다
      legendsMet: Array.isArray(parsed.legendsMet)
        ? [...new Set(parsed.legendsMet.filter(isLegendId))]
        : [],
    };
  } catch {
    return emptyLegacy();
  }
}

/**
 * localStorage 접근은 전부 던질 수 있다 (사파리 프라이빗, 용량 초과, 차단 설정).
 * 무덤을 못 읽는다고 게임이 멈춰서는 안 된다.
 */
export function loadLegacy(): Legacy {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw === null ? emptyLegacy() : deserializeLegacy(raw);
  } catch {
    return emptyLegacy();
  }
}

export function saveLegacy(l: Legacy): void {
  try {
    localStorage.setItem(LEGACY_KEY, serializeLegacy(l));
  } catch {
    // 저장 실패는 치명적이지 않다
  }
}

/** 봉인된 이름 집합. generateIdentity의 입력이 된다. */
export function sealedNames(l: Legacy): Set<string> {
  return new Set(l.fallen.map((f) => f.name));
}


/** 전설을 만났다고 적는다(순수). 이미 있으면 같은 객체 */
export function withLegendMet(l: Legacy, legendId: string): Legacy {
  return l.legendsMet.includes(legendId) ? l : { ...l, legendsMet: [...l.legendsMet, legendId] };
}
