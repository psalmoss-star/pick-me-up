/**
 * 소환 스토어 연결 테스트.
 *
 * 지키려는 것:
 *   1. 소환한 영웅이 로스터에 들어가고 저장까지 살아남는다
 *   2. 재화·천장이 스토어에서 실제로 소비/누적된다
 *   3. 실패(재화 부족)가 상태를 더럽히지 않는다
 *
 * 확률 분포 자체는 검증하지 않는다 — gacha.test.ts의 몫이다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { loadRun } from './save';
import { BANNERS } from '../game/gacha';
import { displayName } from '../game/identity';
import { gameData } from '../game/data';

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

describe('무료 소환', () => {
  it('영웅이 로스터에 추가된다', () => {
    const s = store();
    const before = s.getState().roster.length;
    const r = s.getState().summon('free', 0);
    expect(r.ok).toBe(true);
    expect(s.getState().roster).toHaveLength(before + 1);
  });

  it('뽑은 영웅은 개체 시드와 발굴 진행도를 가진다', () => {
    const s = store();
    s.getState().summon('free', 0);
    const newest = s.getState().roster[s.getState().roster.length - 1];
    expect(newest.seed).toBeDefined();
    expect(newest.revealProgress).toBe(0);
    expect(newest.isDead).toBe(false);
  });

  it('금이 부족하면 실패하고 로스터가 그대로다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gold: 0 } });
    const after = s.getState().roster.length;

    const r = s.getState().summon('free', 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('insufficient');
    expect(s.getState().roster).toHaveLength(after);
  });

  /** 금이 제동 장치다 — 시간 제한까지 걸면 층을 올라도 뽑을 수가 없다 */
  it('쿨다운 없이 연속으로 뽑을 수 있다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gold: 100000 } });
    const before = s.getState().roster.length;
    // now를 전혀 올리지 않는다
    for (let i = 0; i < 5; i++) expect(s.getState().summon('free', 0).ok).toBe(true);
    expect(s.getState().roster).toHaveLength(before + 5);
  });

  it('금 소환은 금만 쓰고 젬은 건드리지 않는다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gold: 1000 } });
    const before = { ...s.getState().wallet };
    s.getState().summon('free', 0);
    const after = s.getState().wallet;
    expect(after.gold).toBe(before.gold - (BANNERS.free.cost.gold ?? 0));
    expect(after.gems).toBe(before.gems);
  });
});

/**
 * 사용자가 실제로 겪은 결함: 「물결의 세인」 카드가 3장 나왔다.
 * 원인은 (A) 이름이 종류에 붙어 있었고 (B) 등급이 곧 캐릭터였던 것.
 */
describe('개체는 서로 다른 인물이다', () => {
  const rich = (s: ReturnType<typeof store>) =>
    s.setState({ wallet: { ...s.getState().wallet, gold: 1_000_000 } });

  it('60회를 뽑아도 로스터에 같은 이름이 없다', () => {
    const s = store();
    rich(s);
    for (let i = 0; i < 60; i++) s.getState().summon('free', i);

    const names = s.getState().roster.map((h) => displayName(h, gameData.heroes));
    expect(new Set(names).size).toBe(names.length);
  });

  it('같은 등급이어도 유형이 갈린다', () => {
    const s = store();
    rich(s);
    for (let i = 0; i < 80; i++) s.getState().summon('free', i);

    const byStar = new Map<number, Set<string>>();
    for (const h of s.getState().roster) {
      if (!byStar.has(h.star)) byStar.set(h.star, new Set());
      byStar.get(h.star)!.add(h.defId);
    }
    // 어떤 등급이든 최소 한 곳은 유형이 둘 이상이어야 한다
    expect([...byStar.values()].some((set) => set.size > 1)).toBe(true);
  });

  /**
   * 퍼머데스. 죽은 자와 같은 이름의 영웅이 소환되면 그 무덤 기록이 무의미해진다.
   * 사용자는 **초상화** 재사용만 허용했다.
   */
  it('죽은 영웅의 이름은 다시 나오지 않는다', () => {
    const s = store();
    rich(s);
    s.getState().start();
    const victim = s.getState().party[0];
    s.setState({
      result: { ...s.getState().result!, outcome: 'defeat', casualties: [victim] },
    });
    s.getState().finish();

    const deadHero = s.getState().roster.find((h) => h.instId === victim)!;
    expect(deadHero.isDead).toBe(true);
    const deadName = displayName(deadHero, gameData.heroes);

    for (let i = 0; i < 100; i++) {
      const r = s.getState().summon('free', i);
      if (r.ok) expect(displayName(r.hero, gameData.heroes)).not.toBe(deadName);
    }
  });

  it('소환된 영웅의 이름이 저장을 견딘다', () => {
    const s = store();
    rich(s);
    const r = s.getState().summon('free', 0);
    if (!r.ok) throw new Error();
    const back = loadRun()!;
    expect(back.roster.find((h) => h.instId === r.hero.instId)!.name).toBe(r.hero.name);
  });
});

describe('유료 소환', () => {
  it('젬이 부족하면 실패한다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gems: 0 } });
    const r = s.getState().summon('premium', 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('insufficient');
  });

  it('성공하면 젬이 정확히 차감된다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gems: 1000 } });
    s.getState().summon('premium', 0);
    expect(s.getState().wallet.gems).toBe(1000 - (BANNERS.premium.cost.gems ?? 0));
  });

  it('실패하면 젬이 줄지 않는다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gems: 10 } });
    s.getState().summon('premium', 0);
    expect(s.getState().wallet.gems).toBe(10);
  });

  it('천장 카운터가 누적된다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gems: 999999 } });
    s.getState().summon('premium', 0);
    s.getState().summon('premium', 0);
    expect(s.getState().gacha.pityCounters.premium).toBeGreaterThan(0);
  });

  it('천장에 도달하면 확정 등급이 나온다', () => {
    const s = store();
    const pity = BANNERS.premium.pity!;
    s.setState({
      wallet: { ...s.getState().wallet, gems: 999999 },
      gacha: { ...s.getState().gacha, pityCounters: { free: 0, premium: pity.count - 1 } },
    });
    const r = s.getState().summon('premium', 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.star).toBeGreaterThanOrEqual(pity.guaranteedStar);
      expect(s.getState().gacha.pityCounters.premium).toBe(0); // 리셋
    }
  });
});

describe('도감', () => {
  it('처음 뽑은 영웅은 도감에 등록된다', () => {
    const s = store();
    const r = s.getState().summon('free', 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(s.getState().codex[r.hero.defId]).toBeDefined();
      expect(s.getState().codex[r.hero.defId].timesAcquired).toBeGreaterThanOrEqual(1);
    }
  });

  it('같은 영웅을 다시 뽑으면 획득 횟수가 는다', () => {
    const s = store();
    // 40회를 돌려면 금이 넉넉해야 한다 — 중간에 떨어지면 실패 사유가 엉뚱해진다
    s.setState({ wallet: { ...s.getState().wallet, gold: 100000 } });
    const first = s.getState().summon('free', 0);
    if (!first.ok) throw new Error('first pull failed');
    const defId = first.hero.defId;
    const before = s.getState().codex[defId].timesAcquired;

    // 같은 영웅이 나올 때까지 반복
    for (let i = 1; i <= 40; i++) {
      const r = s.getState().summon('free', i);
      if (r.ok && r.hero.defId === defId) {
        expect(s.getState().codex[defId].timesAcquired).toBe(before + 1);
        return;
      }
    }
    throw new Error('같은 영웅이 40회 안에 안 나옴');
  });
});

describe('보상 적립', () => {
  it('승리하면 지갑이 는다', () => {
    const s = store();
    const before = { ...s.getState().wallet };
    s.getState().start();
    s.setState({
      result: { ...s.getState().result!, casualties: [], outcome: 'victory' },
    });
    s.getState().finish();
    expect(s.getState().wallet.gold).toBeGreaterThan(before.gold);
  });

  it('패배하면 지갑이 그대로다', () => {
    const s = store();
    const before = { ...s.getState().wallet };
    s.getState().start();
    s.setState({
      result: { ...s.getState().result!, casualties: [], outcome: 'defeat' },
    });
    s.getState().finish();
    expect(s.getState().wallet).toEqual(before);
  });
});

describe('첫 ★5 연출', () => {
  it('처음에는 아직 안 본 상태다', () => {
    expect(store().getState().seenFirstLegendary).toBe(false);
  });

  it('본 것으로 표시하면 유지된다', () => {
    const s = store();
    s.getState().markLegendarySeen();
    expect(s.getState().seenFirstLegendary).toBe(true);
  });

  it('표시가 저장돼 새로고침해도 다시 강제되지 않는다', () => {
    const s = store();
    s.getState().markLegendarySeen();

    const fresh = store();
    fresh.getState().hydrate(loadRun()!);
    expect(fresh.getState().seenFirstLegendary).toBe(true);
  });
});

describe('저장', () => {
  it('소환 결과가 저장된다', () => {
    const s = store();
    s.getState().summon('free', 0);
    const count = s.getState().roster.length;
    expect(loadRun()!.roster).toHaveLength(count);
  });

  it('지갑과 천장 카운터가 저장·복원된다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gems: 4321 } });
    s.getState().summon('free', 0);

    const saved = loadRun()!;
    expect(saved.wallet.gems).toBe(4321);
    expect(saved.gacha).toBeDefined();

    const fresh = store();
    fresh.getState().hydrate(saved);
    expect(fresh.getState().wallet.gems).toBe(4321);
  });

  it('도감이 저장·복원된다', () => {
    const s = store();
    const r = s.getState().summon('free', 0);
    if (!r.ok) throw new Error('pull failed');

    const fresh = store();
    fresh.getState().hydrate(loadRun()!);
    expect(fresh.getState().codex[r.hero.defId]).toBeDefined();
  });

  it('예전 세이브(지갑 없음)도 불러와진다', () => {
    const s = store();
    s.getState().summon('free', 0);
    const raw = JSON.parse(localStorage.getItem('tower-of-picks:run')!);
    delete raw.run.wallet;
    delete raw.run.gacha;
    delete raw.run.codex;
    localStorage.setItem('tower-of-picks:run', JSON.stringify(raw));

    const saved = loadRun();
    expect(saved).not.toBeNull();
    expect(saved!.wallet).toBeDefined(); // 기본값으로 채워진다
  });
});
