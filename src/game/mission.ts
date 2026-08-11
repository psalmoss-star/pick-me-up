import type { Combatant } from './types';

/**
 * 층마다 승리 조건이 다르다.
 * 전투 엔진은 이 파일의 함수 하나만 호출하고, 나머지는 전혀 모른다.
 */

export type MissionKind =
  | 'subjugate' // 토벌 — 적 전멸
  | 'survive'   // 생존 — N턴 버티기
  | 'defend'    // 수비 — 오브젝트를 N턴 사수
  | 'escort'    // 호위 — NPC를 살린 채 적 전멸
  | 'escape'    // 탈출 — N턴 뒤 이탈
  | 'seize';    // 탈취 — 지정 적 처치 후 이탈

export interface Mission {
  kind: MissionKind;
  /** survive / defend / escape 에서 요구되는 턴 수 */
  turns?: number;
  /** seize 에서 처치해야 할 적의 uid 접미사 (enemyIds 배열의 인덱스) */
  targetIndex?: number;
  /**
   * 적이 보호 대상을 우선 공격하는 비율.
   * 수비/호위 임무는 이게 없으면 임무가 성립하지 않는다 (적이 오브젝트를 무시함).
   */
  enemyFocus?: { kind: 'objective' | 'npc'; chance: number };
  /** 브리핑 문구 — 층 진입 전 시스템 창에 그대로 표시된다 */
  briefing: string;
}

/** 임무 유형별 기본 집중 타겟. Mission.enemyFocus가 있으면 그쪽이 우선. */
export function focusOf(m: Mission): Mission['enemyFocus'] {
  if (m.enemyFocus) return m.enemyFocus;
  if (m.kind === 'defend') return { kind: 'objective', chance: 0.7 };
  if (m.kind === 'escort') return { kind: 'npc', chance: 0.6 };
  return undefined;
}

/** 조종 불가 아군 — 오브젝트(수비 대상) 또는 NPC(호위 대상) */
export interface GuardDef {
  id: string;
  name: string;
  kind: 'objective' | 'npc';
  hp: number;
  def: number;
}

export type MissionOutcome = 'victory' | 'defeat' | 'ongoing';

export interface MissionContext {
  turn: number;
  heroesAlive: boolean;
  enemiesAlive: boolean;
  guards: Combatant[];
  enemies: Combatant[];
}

/** 매 턴 종료 시 호출된다. 'ongoing'이면 전투 계속. */
export function evaluateMission(m: Mission, ctx: MissionContext): MissionOutcome {
  // 영웅 전멸은 어떤 임무에서도 즉시 패배
  if (!ctx.heroesAlive) return 'defeat';

  const guardsAlive = (kind: GuardDef['kind']) =>
    ctx.guards.filter((g) => g.sourceId.startsWith(kind)).every((g) => g.isAlive);

  switch (m.kind) {
    case 'subjugate':
      return ctx.enemiesAlive ? 'ongoing' : 'victory';

    case 'survive':
      return ctx.turn >= (m.turns ?? 10) ? 'victory' : 'ongoing';

    case 'defend':
      if (!guardsAlive('objective')) return 'defeat';
      return ctx.turn >= (m.turns ?? 10) ? 'victory' : 'ongoing';

    case 'escort':
      if (!guardsAlive('npc')) return 'defeat';
      return ctx.enemiesAlive ? 'ongoing' : 'victory';

    case 'escape':
      return ctx.turn >= (m.turns ?? 8) ? 'victory' : 'ongoing';

    case 'seize': {
      const target = ctx.enemies[m.targetIndex ?? 0];
      if (target && !target.isAlive) return 'victory';
      return 'ongoing';
    }

    default:
      return 'ongoing';
  }
}

export const DEFAULT_MISSION: Mission = {
  kind: 'subjugate',
  briefing: '적을 섬멸하라!',
};

/** 임무 유형별 한글 라벨 — UI 표시용 */
export const MISSION_LABEL: Record<MissionKind, string> = {
  subjugate: '토벌',
  survive: '생존',
  defend: '수비',
  escort: '호위',
  escape: '탈출',
  seize: '탈취',
};
