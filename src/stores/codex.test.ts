/**
 * 도감 연결 테스트.
 *
 * 지키려는 것:
 *   1. 소환이 도감에 **획득**을 적는다 (원래 있던 동작)
 *   2. 전투 사망이 도감에 **상실**을 적는다 (STEP 41에서 연결한 동작)
 *   3. 도감이 회차를 넘어 남는다 (gdd-v3 §7의 계승 예외)
 *
 * ⚠️ **`recordLoss`는 여태 아무도 부르지 않았다.** 함수와 필드가 처음부터
 * 있었는데 호출부가 없어 `timesLost`가 항상 0이었다. 도감 화면을 만들다 드러났고,
 * 여기가 그 연결을 잠그는 자리다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { loadLegacy } from './legacy';
import { loadRun } from './save';
import { gameData } from '../game/data';
import type { HeroInstId } from '../game/types';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

const store = (seed = 42) => createRunStore(() => seed);

describe('도감 — 획득', () => {
  it('소환하면 도감에 종류가 기록된다', () => {
    const s = store();
    const r = s.getState().summon('free', 0);
    if (!r.ok) throw new Error('소환 실패');
    const entry = s.getState().codex[r.hero.defId];
    expect(entry).toBeDefined();
    expect(entry.timesAcquired).toBeGreaterThanOrEqual(1);
    expect(entry.highestStarReached).toBeGreaterThanOrEqual(r.hero.star);
  });

  it('같은 종류를 또 뽑으면 획득 수가 오른다', () => {
    /*
      금이 한정돼 있으므로 넉넉히 채워두고 뽑는다.
      시드 고정 스토어라 매 소환이 같은 결과를 주는 것을 피하려고
      wallet만 채우고 시드는 스토어 기본값을 쓴다 — 어차피 같은 종류가
      나오는지만 보면 되고, 같은 종류가 연속으로 나오는 것도 유효한 경로다.
    */
    const s = store();
    const first = s.getState().summon('free', 0);
    if (!first.ok) throw new Error('소환 실패');
    const target = first.hero.defId;
    const before = s.getState().codex[target].timesAcquired;

    for (let i = 0; i < 200; i++) {
      s.setState({ wallet: { ...s.getState().wallet, gold: 100000 } });
      const r = s.getState().summon('free', i + 1);
      if (r.ok && r.hero.defId === target) {
        expect(s.getState().codex[target].timesAcquired).toBe(before + 1);
        return;
      }
    }
    throw new Error('같은 종류가 200회 안에 안 나왔다');
  });

  it('도감은 무덤에도 저장되어 회차를 넘는다', () => {
    const s = store();
    const r = s.getState().summon('free', 0);
    if (!r.ok) throw new Error('소환 실패');
    // gdd-v3 §7: 계승은 기록뿐이지만 도감은 명시적 예외다
    expect(loadLegacy().codex[r.hero.defId]).toBeDefined();
  });
});

describe('도감 — 상실', () => {
  /**
   * 사망을 만들어 낸다. 전투를 돌리지 않고 `result`를 직접 넣는 방식은
   * finish()가 result만 보고 사망을 확정하기 때문에 성립한다.
   */
  const killFirstPartyMember = (s: ReturnType<typeof store>) => {
    const victim = s.getState().roster[0];
    s.setState({
      // finish()는 snapshot에서 사망자를 찾는다 (runStore 주석 참조)
      snapshot: s.getState().roster,
      result: {
        outcome: 'defeat',
        events: [],
        survivors: [],
        casualties: [victim.instId as HeroInstId],
        turnsElapsed: 3,
        roster: s.getState().roster,
        mvp: null,
      } as any,
    });
    s.getState().finish();
    return victim;
  };

  it('전투 사망이 도감에 상실로 기록된다', () => {
    /*
      ⚠️ 이 테스트가 STEP 41의 핵심이다. 연결 전에는 timesLost가 영원히 0이었다.
    */
    const s = store();
    const victim = killFirstPartyMember(s);
    const entry = loadLegacy().codex[victim.defId];
    expect(entry).toBeDefined();
    expect(entry.timesLost).toBe(1);
  });

  it('상실은 무덤 명부와 별개로 센다 — 종류 집계와 개체 명부는 다르다', () => {
    const s = store();
    const victim = killFirstPartyMember(s);
    const lg = loadLegacy();
    // 무덤엔 개체가 한 줄, 도감엔 종류의 카운터가 하나
    expect(lg.fallen).toHaveLength(1);
    expect(lg.fallen[0].defId).toBe(victim.defId);
    expect(lg.codex[victim.defId].timesLost).toBe(1);
  });

  it('같은 종류를 두 번 잃으면 2가 된다 (새로고침이 끼어도)', () => {
    /*
      ⚠️ 폰 실측에서 잡힌 버그다. 도감은 **종류**의 집계이므로 같은 defId를
      두 번 잃으면 2여야 하는데 1로 남았다.

      원인: `{ ...legacy.codex, ...run.codex }`가 런 도감으로 무덤을 덮었다.
      런 도감은 상실을 기록하지 않으므로(무덤만 한다), 새로고침으로 런 도감이
      0인 채 복원되면 누적된 timesLost가 통째로 0으로 되돌아갔다.
    */
    const s = store();
    const a = s.getState().roster[0];
    // 같은 종류의 두 번째 개체
    const clone = { ...a, instId: `${a.instId}-c` as any, name: '복제된 자' };
    s.setState({ roster: [...s.getState().roster, clone] });

    const kill = (instId: string) => {
      s.setState({
        snapshot: s.getState().roster,
        result: {
          outcome: 'defeat', events: [], survivors: [], casualties: [instId],
          turnsElapsed: 3, roster: s.getState().roster, mvp: null,
        } as any,
      });
      s.getState().finish();
    };

    kill(a.instId);
    expect(loadLegacy().codex[a.defId].timesLost).toBe(1);

    // 새로고침 — 런 도감은 상실을 모른 채 복원된다
    const saved = loadRun();
    if (saved) s.getState().hydrate(saved);

    kill(clone.instId);
    expect(loadLegacy().codex[a.defId].timesLost).toBe(2);
  });

  it('다음 전투를 치러도 이전 상실 기록이 남는다', () => {
    /*
      ⚠️ 폰 실측에서 잡힌 버그다. 무덤 명부에는 죽은 영웅이 있는데
      도감은 `잃음 0`이었다.

      원인: `{ ...legacy.codex, ...after.codex }`가 **런 도감으로 무덤 도감을
      덮어썼다.** 런 도감은 상실을 기록하지 않으므로(무덤만 한다),
      전투가 끝날 때마다 누적된 timesLost가 런의 값(0)으로 되돌아갔다.
    */
    const s = store();
    const victim = killFirstPartyMember(s);
    expect(loadLegacy().codex[victim.defId].timesLost).toBe(1);

    // 아무도 안 죽는 두 번째 전투
    s.setState({
      snapshot: s.getState().roster,
      result: {
        outcome: 'victory', events: [], survivors: [], casualties: [],
        turnsElapsed: 3, roster: s.getState().roster, mvp: null,
      } as any,
    });
    s.getState().finish();

    // 첫 전투의 상실이 살아 있어야 한다
    expect(loadLegacy().codex[victim.defId].timesLost).toBe(1);
  });

  it('사망자가 없으면 상실이 오르지 않는다', () => {
    const s = store();
    const before = s.getState().roster[0].defId;
    s.setState({
      snapshot: s.getState().roster,
      result: {
        outcome: 'victory', events: [], survivors: [], casualties: [],
        turnsElapsed: 3, roster: s.getState().roster, mvp: null,
      } as any,
    });
    s.getState().finish();
    expect(loadLegacy().codex[before]?.timesLost ?? 0).toBe(0);
  });
});

describe('도감 — 기존 세이브 메우기 (hydrate)', () => {
  /*
    ⚠️ 폰 실측에서 잡힌 버그다. registerInitialCodex는 freshSlice()에서만 돌므로
    이 필드 이전에 만들어진 세이브는 도감이 빈 채로 복원되어
    화면에 "기록 0 / 12"에 전부 ???가 떴다 — 실제로 6명을 데리고 있는데도.
    §5-38("시작값을 바꿔도 이미 세이브가 있으면 화면은 그대로다").
  */
  it('도감이 빈 세이브를 로드하면 로스터가 도감에 채워진다', () => {
    const s = store();
    const roster = s.getState().roster;
    s.getState().hydrate({
      ...(s.getState() as any),
      roster,
      codex: {}, // 옛 세이브
    });
    const codex = s.getState().codex;
    for (const h of roster) {
      expect(codex[h.defId], `${h.defId}가 도감에 없다`).toBeDefined();
    }
  });

  it('이미 있는 항목의 획득 수를 부풀리지 않는다', () => {
    /*
      registerCodex는 timesAcquired를 올린다. 무조건 다시 등록하면
      새로고침할 때마다 획득 수가 계속 오른다 — 그래서 빠진 것만 채운다.
    */
    const s = store();
    const roster = s.getState().roster;
    const target = roster[0].defId;
    const saved = { ...s.getState().codex };
    const before = saved[target].timesAcquired;

    // 두 번 로드해도 수치가 그대로여야 한다
    s.getState().hydrate({ ...(s.getState() as any), roster, codex: saved });
    s.getState().hydrate({ ...(s.getState() as any), roster, codex: s.getState().codex });

    expect(s.getState().codex[target].timesAcquired).toBe(before);
  });
});

describe('도감 — 소환 시작 레벨이 실제 경로에 걸린다', () => {
  it('스토어로 소환한 개체는 Lv.1이 아니다', () => {
    /*
      `pull()`의 `scaling`은 선택 인자라 안 넘기면 Lv.1로 조용히 폴백한다.
      실제 경로(runStore.summon)가 넘기고 있는지를 여기서 잠근다 —
      빠뜨려도 타입 에러가 안 나므로 테스트가 유일한 방어선이다.
    */
    const s = store();
    const r = s.getState().summon('free', 0);
    if (!r.ok) throw new Error('소환 실패');
    expect(r.hero.level).toBe(gameData.starScaling[r.hero.star].summonLevel);
    expect(r.hero.level).toBeGreaterThan(1);
  });
});
