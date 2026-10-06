/**
 * 이벤트 비트 — 전투 재생 도중 "확인 창"이 떠서 재생을 멈추는 순간.
 *
 * 프로토타입의 deriveBeats()를 옮긴 것. 순수 함수이며 React 의존이 없다.
 * 전투 로그(BattleEvent[])를 훑어 HP를 되짚으면서
 * 플레이어가 반드시 봐야 하는 순간만 골라낸다.
 */
import type { BattleEvent } from './types';
import type { ChronicleEntry } from './chronicle';

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
  /**
   * 전투 시작 HP. 없으면 만피. 영웅은 층 사이 HP를 들고 오므로(숙소 회복 전 잔여) 만피가 아니다 —
   * 이 값 없이 되짚으면 화면 HP가 실제보다 높게 보여 위기 창이 "36%인데 위기"를 말한다.
   * 엔진(`buildAlly`)과 같은 식으로 `runEncounter`가 채운다.
   */
  startHp?: number;
  kind: 'hero' | 'enemy' | 'guard';
  /** kind === 'guard'일 때만 의미가 있다 */
  guardKind?: 'objective' | 'npc';
}

export interface BeatContext {
  roster: BeatUnit[];
  /** 보스 층이면 조우 경고를 맨 앞에 넣는다 */
  bossName?: string;
  /**
   * 책략 장면 — `chronicleOf`가 만든 것을 그대로 받는다.
   * 결과 화면의 전투 기록과 **같은 문장**이어야 해서 여기서 다시 만들지 않는다.
   */
  chronicle?: ChronicleEntry[];
}

/**
 * damage 이벤트가 HP를 실제로 깎은 양 — 보호막이 막은 만큼은 빠진다.
 * **로그에서 HP를 재생하는 곳은 전부 이 함수를 쓴다**(전투 화면의 HP 바, 아래 경고 비트).
 */
export function hpLossOf(e: BattleEvent): number {
  return Math.max(0, (e.amount ?? 0) - (e.absorbed ?? 0));
}

/** 보호 대상이 이 비율 밑으로 떨어지면 한 번 경고한다 */
const GUARD_WARN_RATIO = 0.5;

export function deriveBeats(events: BattleEvent[], ctx: BeatContext): Beat[] {
  const beats: Beat[] = [];
  const byUid = new Map(ctx.roster.map((u) => [u.uid, u]));

  const hp: Record<string, number> = {};
  for (const u of ctx.roster) hp[u.uid] = u.startHp ?? u.maxHp;

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
        hp[uid] = Math.max(0, (hp[uid] ?? u.maxHp) - hpLossOf(e));

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

  // 책략 — 성공은 드문 장면(rare), 간파는 경고(warning)
  for (const c of ctx.chronicle ?? []) {
    beats.push({
      at: c.at,
      tone: c.success ? 'rare' : 'warning',
      title: `${c.title} — ${c.success ? '성공' : '간파당함'}`,
      lines: [c.text],
    });
  }

  // 같은 인덱스면 넣은 순서를 지킨다(Array.prototype.sort는 안정 정렬)
  return beats.sort((a, b) => a.at - b.at);
}
