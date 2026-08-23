/**
 * 레벨업 표시가 **실제 지급과 일치하는가**.
 *
 * 결과 화면은 `finish()`보다 **먼저** 뜬다(§5-17). 그래서 화면은 스토어에서
 * 읽는 대신 같은 식을 다시 계산해 보여준다(`App.previewLevelUps`).
 * 두 계산이 갈리면 **"올랐다고 했는데 안 오른"** 상태가 되므로 여기서 잠근다.
 *
 * 규칙(`runStore.ts:735-755`):
 *   - 참전 & 생존 → 층 보상 exp × 재도전 배수
 *   - 미출전 & 생존 → 훈련소 유휴 exp
 *   - 둘은 배타적이다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { FLOORS, floorRewards } from '../game/data/floors';
import { revisitMultiplier } from '../game/data/revisit';
import { idleExpGain } from '../game/data/facilities';
import { gainExp } from '../game/progression';
import { gameData } from '../game/data';
import type { HeroInstance } from '../game/types';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

const store = () => createRunStore(() => 42);

/** `App.previewLevelUps()`와 **같은 식**. 여기가 어긋나면 화면이 거짓말을 한다 */
function previewLevelUps(
  snapshot: HeroInstance[],
  result: {
    roster: readonly { side: string; sourceId: string }[];
    casualties: readonly string[];
    turnsElapsed: number;
    outcome: string;
  },
  floorIdx: number,
  maxFloorReached: number,
  revisitCount: number,
  trainingLevel: number,
) {
  if (result.outcome !== 'victory') return [];
  const floor = FLOORS[floorIdx];
  const mult = revisitMultiplier(floor.id, FLOORS[maxFloorReached].id, revisitCount);
  const fought = new Set(result.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId));
  const casualties = new Set(result.casualties);
  const gained = Math.round(floorRewards(floor, result.turnsElapsed).exp * mult);
  const idle = idleExpGain(trainingLevel);

  const out: { instId: string; from: number; to: number }[] = [];
  for (const h of snapshot) {
    if (h.isDead || casualties.has(h.instId)) continue;
    const exp = fought.has(h.instId) ? gained : idle;
    if (exp <= 0) continue;
    const r = gainExp(h, exp, gameData.starScaling);
    if (r.levelsGained > 0) out.push({ instId: h.instId, from: h.level, to: r.hero.level });
  }
  return out;
}

/**
 * ⚠️ **턴 수를 크게 잡아야 이 테스트가 일한다.**
 * 층 보상 exp는 `turnsElapsed`에 비례하는데(`floorRewards`), 1층을 9턴에 깨면
 * 180 exp라 **아무도 레벨이 오르지 않는다.** 그러면 예측도 실제도 빈 배열이라
 * 어떤 규칙을 넣어도 통과하는 **무의미한 테스트**가 된다(실제로 그렇게 썼다가
 * 일부러 규칙을 틀리게 바꿔도 통과하는 것을 확인했다).
 */
const LONG_BATTLE = 90;

describe('레벨업 표시', () => {
  it('미리 계산한 레벨업이 finish() 결과와 정확히 일치한다', () => {
    const s = store();
    s.getState().start();
    s.setState({
      result: {
        ...s.getState().result!, outcome: 'victory', casualties: [], turnsElapsed: LONG_BATTLE,
      },
    });

    const snapshot = s.getState().snapshot;
    const predicted = previewLevelUps(
      snapshot,
      s.getState().result! as never,
      s.getState().floorIndex,
      s.getState().maxFloorReached,
      0,
      s.getState().facilities.training,
    );

    s.getState().finish();
    const after = s.getState().roster;

    // 실제로 오른 개체
    const actual = snapshot
      .map((before) => {
        const now = after.find((h) => h.instId === before.instId)!;
        return { instId: before.instId, from: before.level, to: now.level };
      })
      .filter((x) => x.to > x.from);

    // 이 테스트가 실제로 무언가를 재고 있는지 자체 검사
    expect(actual.length).toBeGreaterThan(0);
    expect(predicted).toEqual(actual);
  });

  it('참전자와 대기 영웅은 서로 다른 exp를 받는다 — 규칙을 섞으면 안 된다', () => {
    const s = store();
    // 훈련소를 끈다(유휴 0) → 대기 영웅은 절대 오르면 안 된다
    s.setState({ facilities: { ...s.getState().facilities, training: 0 } });
    s.getState().start();
    s.setState({
      result: {
        ...s.getState().result!, outcome: 'victory', casualties: [], turnsElapsed: LONG_BATTLE,
      },
    });
    const snapshot = s.getState().snapshot;
    const fought = new Set(
      s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
    );
    const waiting = snapshot.filter((h) => !fought.has(h.instId) && !h.isDead);
    expect(waiting.length).toBeGreaterThan(0);

    s.getState().finish();
    const after = s.getState().roster;

    // 참전자는 올랐고, 대기자는 훈련소가 꺼져 있으므로 그대로여야 한다
    for (const h of snapshot) {
      const now = after.find((x) => x.instId === h.instId)!;
      if (fought.has(h.instId)) expect(now.level).toBeGreaterThan(h.level);
      else expect(now.level).toBe(h.level);
    }
  });

  it('훈련소가 켜져 있으면 미출전 영웅의 레벨업도 예측에 포함된다', () => {
    const s = store();
    s.setState({ facilities: { ...s.getState().facilities, training: 3 } });
    s.getState().start();
    s.setState({
      result: {
        ...s.getState().result!, outcome: 'victory', casualties: [], turnsElapsed: LONG_BATTLE,
      },
    });

    const snapshot = s.getState().snapshot;
    const fought = new Set(
      s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
    );
    // 출전하지 않은 생존 영웅이 실제로 존재해야 이 테스트가 의미를 갖는다
    const waiting = snapshot.filter((h) => !fought.has(h.instId) && !h.isDead);
    expect(waiting.length).toBeGreaterThan(0);

    const predicted = previewLevelUps(
      snapshot, s.getState().result! as never, s.getState().floorIndex,
      s.getState().maxFloorReached, 0, 3,
    );
    s.getState().finish();
    const after = s.getState().roster;

    const actual = snapshot
      .map((b) => ({ instId: b.instId, from: b.level, to: after.find((h) => h.instId === b.instId)!.level }))
      .filter((x) => x.to > x.from);

    expect(actual.length).toBeGreaterThan(0);
    expect(predicted).toEqual(actual);
  });

  it('패배하면 레벨업이 없다', () => {
    const s = store();
    s.getState().start();
    s.setState({
      result: { ...s.getState().result!, outcome: 'defeat', casualties: [], turnsElapsed: 5 },
    });
    const predicted = previewLevelUps(
      s.getState().snapshot, s.getState().result! as never, s.getState().floorIndex,
      s.getState().maxFloorReached, 0, s.getState().facilities.training,
    );
    expect(predicted).toEqual([]);
  });
});
