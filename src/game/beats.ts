/**
 * 이벤트 비트 — 전투 재생 도중 "확인 창"이 떠서 재생을 멈추는 순간.
 *
 * 프로토타입의 deriveBeats()를 옮긴 것. 순수 함수이며 React 의존이 없다.
 * 전투 로그(BattleEvent[])를 훑어 HP를 되짚으면서
 * 플레이어가 반드시 봐야 하는 순간만 골라낸다.
 */
import type { BattleEvent } from './types';

export type BeatTone = 'normal' | 'rare' | 'warning' | 'death';

export interface Beat {
  /** 이 비트가 걸리는 이벤트 인덱스. 재생 step이 이 값에 도달하면 멈춘다. */
  at: number;
  tone: BeatTone;
  title: string;
  lines: string[];
}

/** 비트 계산에 필요한 유닛 정보 — 전투 로그만으로는 알 수 없는 것들 */
export interface BeatUnit {
  uid: string;
  name: string;
  maxHp: number;
  kind: 'hero' | 'enemy' | 'guard';
  /** kind === 'guard'일 때만 의미가 있다 */
  guardKind?: 'objective' | 'npc';
}

export interface BeatContext {
  roster: BeatUnit[];
  /** 보스 층이면 조우 경고를 맨 앞에 넣는다 */
  bossName?: string;
}

/** 보호 대상이 이 비율 밑으로 떨어지면 한 번 경고한다 */
const GUARD_WARN_RATIO = 0.5;

export function deriveBeats(events: BattleEvent[], ctx: BeatContext): Beat[] {
  const beats: Beat[] = [];
  const byUid = new Map(ctx.roster.map((u) => [u.uid, u]));

  const hp: Record<string, number> = {};
  for (const u of ctx.roster) hp[u.uid] = u.maxHp;

  const warned: Record<string, boolean> = {};

  if (ctx.bossName) {
    beats.push({
      at: 0,
      tone: 'warning',
      title: '보스 조우',
      lines: [`${ctx.bossName}이(가) 앞을 가로막았다.`, '한 번의 실수가 파티를 무너뜨린다.'],
    });
  }

  events.forEach((e, i) => {
    const targets = e.targetUids ?? [];

    if (e.type === 'damage') {
      for (const uid of targets) {
        const u = byUid.get(uid);
        if (!u) continue;
        hp[uid] = Math.max(0, (hp[uid] ?? u.maxHp) - (e.amount ?? 0));

        // 보호 대상이 절반 이하로 떨어진 순간 — 단 1회
        if (
          u.kind === 'guard' &&
          !warned[uid] &&
          hp[uid] > 0 &&
          hp[uid] <= u.maxHp * GUARD_WARN_RATIO
        ) {
          warned[uid] = true;
          beats.push({
            at: i + 1,
            tone: 'warning',
            title: '경고',
            lines: [
              `${u.name}의 내구도가 절반 이하로 떨어졌습니다.`,
              u.guardKind === 'objective'
                ? '파괴되면 즉시 임무 실패입니다.'
                : '쓰러지면 즉시 임무 실패입니다.',
            ],
          });
        }
      }
    }

    if (e.type === 'heal') {
      for (const uid of targets) {
        const u = byUid.get(uid);
        if (!u) continue;
        hp[uid] = Math.min(u.maxHp, (hp[uid] ?? u.maxHp) + (e.amount ?? 0));
      }
    }

    if (e.type === 'death') {
      for (const uid of targets) {
        const u = byUid.get(uid);
        if (!u) continue;
        if (u.kind === 'hero') {
          beats.push({
            at: i + 1,
            tone: 'death',
            title: '영웅 사망',
            lines: [`${u.name}이(가) 쓰러졌습니다.`, '되살릴 수 없습니다.'],
          });
        } else if (u.kind === 'guard') {
          beats.push({
            at: i + 1,
            tone: 'death',
            title: '임무 실패',
            lines: [`${u.name}을(를) 지키지 못했습니다.`],
          });
        }
      }
    }
  });

  return beats.sort((a, b) => a.at - b.at);
}
