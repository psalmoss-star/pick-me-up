/**
 * 정찰 보고 — 기획서 3단계(2026-09-29). "마스터는 전장을 직접 보지 않고 영웅의 보고를 받는다."
 *
 * 설계 원칙:
 * - 순수 함수. React/DOM 의존 없음.
 * - **전투 입력이 아니다.** 보고는 화면에 보이는 정보(적 수·전력·접점·위기 창 시점)만 바꾼다.
 *   전투 엔진은 이 모듈을 모른다 — 그래서 승률표를 다시 잴 필요가 없다. 틀린 보고가 해치는 것은
 *   마스터의 판단(경로·책략·후퇴 신호)이다.
 * - 결정적: 같은 정찰자가 같은 층을 보면 **언제나 같은 보고**를 한다(정찰자 seed × 층 번호,
 *   `STREAM.REPORT`). 저장하지 않는다.
 * - 보스 여부는 보고와 무관하게 늘 보인다(브리핑 장면에 보스가 그려진다).
 */
import type { BattleData } from './battle';
import type { FloorSpec } from './data/floors';
import { enemyStatMultFor } from './data/floorgen';
import type { CrisisLevel } from './data/orders';
import {
  REPORT_LINES, REPORT_STYLES, REPORT_STYLE_BY_TEMPER, REPORT_TUNING, type ReportStyle,
} from './data/reports';
import type { FloorMap } from './floormap';
import { combatPower, heroPower } from './power';
import { STREAM, rngChance, rngInt, substream } from './rng';
import { temperOf } from './temperament';
import { hasBatchim } from './voice';
import type { HeroInstance, HeroInstId, RNG } from './types';

export interface ScoutReport {
  scoutId: HeroInstId;
  style: ReportStyle;
  /** 보고된 적 수. 침묵이면 null */
  enemyCount: number | null;
  /** 보고된 적 전력(아군 전투력과 같은 척도). 침묵이면 null */
  enemyPower: number | null;
  /**
   * 경로마다 보고된 접점 노드 id(`map.routes`와 같은 순서). 침묵이면 전부 null — ✕를 그리지 않는다.
   * 틀린 보고는 **같은 경로의 다른 지점**을 가리킨다.
   */
  contacts: Array<string | null>;
  /** 위기(후퇴 신호 창)를 알리는 단계. 침묵이면 null — 창이 뜨지 않는다 */
  crisisLevel: CrisisLevel | null;
}

/** 기질 → 보고 성향. seed가 없는 옛 개체(기질 없음)는 정직으로 본다 — 보고를 잃게 하지 않는다 */
export function reportStyleOf(inst: Pick<HeroInstance, 'seed' | 'legendId'>): ReportStyle {
  const temper = temperOf(inst);
  return temper ? REPORT_STYLE_BY_TEMPER[temper.id] : 'honest';
}

/** 적 전력 참값 — 층 깊이 배수까지 반영한 적 스탯의 전투력 합. 엔진의 `buildEnemy`와 같은 배수 규칙 */
export function trueEnemyPower(floor: Pick<FloorSpec, 'id' | 'enemyIds'>, data: Pick<BattleData, 'enemies'>): number {
  const mult = enemyStatMultFor(floor.id);
  return floor.enemyIds.reduce((sum, id) => {
    const s = data.enemies[id].stats;
    return sum + combatPower({
      ...s,
      hp: Math.round(s.hp * mult),
      atk: Math.round(s.atk * mult),
      def: Math.round(s.def * mult),
    });
  }, 0);
}

/** 아군 전투력 — 편성 화면(`PartyScreen`)과 같은 산식(장비 제외) */
export function partyPowerOf(members: HeroInstance[], data: Pick<BattleData, 'heroes' | 'starScaling'>): number {
  return members.reduce((sum, h) => sum + heroPower(h, data.heroes[h.defId], data.starScaling), 0);
}

function reportRng(scout: Pick<HeroInstance, 'seed' | 'instId'>, floorId: number): RNG {
  // seed 없는 옛 개체도 층마다 같은 보고를 하도록 instId 길이로 대신한다(정직이라 난수를 거의 안 쓴다)
  const base = scout.seed ?? scout.instId.length;
  return substream((base ^ Math.imul(floorId, 0x85ebca6b)) >>> 0, STREAM.REPORT);
}

/**
 * 정찰 보고를 만든다.
 *
 * 난수 소비 순서는 고정이다(적 수 → 전력 → 경로별 접점). 순서를 바꾸면 같은 영웅의 같은 층 보고가
 * 달라진다 — 저장하지 않으므로 치명적이진 않지만, 마스터가 "그때 그 보고"를 기억할 수 있게 둔다.
 */
export function scoutReport(
  scout: HeroInstance,
  floor: Pick<FloorSpec, 'id' | 'enemyIds'>,
  map: FloorMap,
  data: Pick<BattleData, 'enemies'>,
): ScoutReport {
  const style = reportStyleOf(scout);
  const crisisLevel = REPORT_STYLES[style].crisisLevel;
  const trueContacts = map.routes.map((r) => r.contactId);

  if (style === 'silent') {
    return {
      scoutId: scout.instId, style, crisisLevel,
      enemyCount: null, enemyPower: null, contacts: map.routes.map(() => null),
    };
  }

  const count = floor.enemyIds.length;
  const power = trueEnemyPower(floor, data);
  if (style === 'honest') {
    return { scoutId: scout.instId, style, crisisLevel, enemyCount: count, enemyPower: power, contacts: trueContacts };
  }

  const rng = reportRng(scout, floor.id);
  const shift = 1 + rngInt(rng, REPORT_TUNING.countShiftMax);
  const enemyCount = style === 'bluff' ? Math.max(1, count - shift) : count + shift;
  const [lo, hi] = REPORT_TUNING.powerMult[style];
  const enemyPower = Math.max(1, Math.round(power * (lo + rng() * (hi - lo))));

  const contacts = map.routes.map((r) => {
    // 경로마다 두 번 굴린다(틀릴까, 어디로) — 틀리지 않아도 소비해서 경로끼리 난수가 밀리지 않게 한다
    const wrong = rngChance(rng, REPORT_TUNING.misplace);
    const path = r.nodeIds.filter((id) => id !== 'entry' && id !== 'exit' && id !== r.contactId);
    const pick = path.length > 0 ? path[rngInt(rng, path.length)] : r.contactId;
    return wrong ? pick : r.contactId;
  });

  return { scoutId: scout.instId, style, crisisLevel, enemyCount, enemyPower, contacts };
}

/** 보고된 접점의 지형 — 경로 패널이 이걸로 유리/불리를 말한다. 모르면 null */
export function reportedTerrain(map: FloorMap, report: ScoutReport, routeIndex: number) {
  const id = report.contacts[routeIndex];
  if (!id) return null;
  return map.nodes.find((n) => n.id === id)?.tag ?? null;
}

/**
 * 정찰자 결정 — 고른 사람이 출전 명단에 있으면 그 사람, 아니면 첫 번째.
 * `start()`와 브리핑이 **같은 규칙**을 써야 브리핑에서 본 보고와 전투의 위기 창이 어긋나지 않는다.
 */
export function resolveScout<H extends Pick<HeroInstance, 'instId'>>(members: H[], chosen: HeroInstId | null): H | null {
  return members.find((h) => h.instId === chosen) ?? members[0] ?? null;
}

/**
 * 보고 문장을 채운다 — `{scout:이/가}`·`{hurt:이/가}`·`{scout}`·`{hurt}`.
 * 조사는 `voice.ts`의 `hasBatchim` 하나로 고른다(「세인가」를 찍지 않는다).
 */
export function reportLine(
  style: ReportStyle, moment: 'brief' | 'crisis', names: { scout: string; hurt?: string },
): string {
  const vars: Record<string, string> = { scout: names.scout, hurt: names.hurt ?? '그' };
  return REPORT_LINES[style][moment]
    .replace(/\{(scout|hurt):([^/}]+)\/([^}]+)\}/g, (_, k: string, withB: string, noB: string) =>
      vars[k] + (hasBatchim(vars[k]) ? withB : noB))
    .replace(/\{(scout|hurt)\}/g, (_, k: string) => vars[k]);
}

/**
 * 이번 전투의 위기 창 — 보고자의 성향이 정한 단계의 첫 순간. 침묵이면 없다.
 * 보고가 없으면(옛 경로·테스트) 정직과 같다(`result.crisis`).
 */
export function crisisFor<C>(
  result: { crisis: C | null; crises: Partial<Record<CrisisLevel, C>> },
  report: Pick<ScoutReport, 'crisisLevel'> | null | undefined,
): C | null {
  if (!report) return result.crisis;
  return report.crisisLevel ? result.crises[report.crisisLevel] ?? null : null;
}
