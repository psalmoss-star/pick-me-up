/**
 * 합성/승급 스토어 연결 테스트.
 *
 * 지키려는 것:
 *   1. 제물은 영구히 사라진다 — 로스터에서 지워지고 저장까지 반영된다
 *   2. 승급은 레벨을 1로 리셋한다 (약화는 설계다, 버그가 아니다)
 *   3. 실패가 상태를 더럽히지 않는다
 *
 * 경험치 환산식·승급 조건 자체는 progression.test.ts의 몫이라 여기서 다시 보지 않는다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
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

const store = () => createRunStore(() => 42);
const idAt = (s: ReturnType<typeof store>, i: number) => s.getState().roster[i].instId;

describe('합성 — 제물은 사라진다', () => {
  it('제물이 로스터에서 제거된다', () => {
    const s = store();
    const target = idAt(s, 0);
    const sac = idAt(s, 1);
    const before = s.getState().roster.length;

    const r = s.getState().fuse(target, sac);
    expect(r.ok).toBe(true);
    expect(s.getState().roster).toHaveLength(before - 1);
    expect(s.getState().roster.find((h) => h.instId === sac)).toBeUndefined();
  });

  it('제물이 파티에 있었다면 파티에서도 빠진다', () => {
    const s = store();
    const target = idAt(s, 0);
    const sac = idAt(s, 1);
    expect(s.getState().party).toContain(sac);

    s.getState().fuse(target, sac);
    expect(s.getState().party).not.toContain(sac);
  });

  it('대상이 경험치를 받는다', () => {
    const s = store();
    const target = idAt(s, 0);
    const before = s.getState().roster.find((h) => h.instId === target)!;
    s.getState().fuse(target, idAt(s, 1));
    const after = s.getState().roster.find((h) => h.instId === target)!;

    const grew = after.level > before.level || after.exp > before.exp;
    expect(grew).toBe(true);
  });

  it('제물 소멸이 저장된다 (새로고침으로 되살아나지 않는다)', () => {
    const s = store();
    const sac = idAt(s, 1);
    s.getState().fuse(idAt(s, 0), sac);

    const saved = loadRun()!;
    expect(saved.roster.find((h) => h.instId === sac)).toBeUndefined();
  });

  it('자기 자신은 제물이 될 수 없다', () => {
    const s = store();
    const id = idAt(s, 0);
    const before = s.getState().roster.length;

    const r = s.getState().fuse(id, id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('same-hero');
    expect(s.getState().roster).toHaveLength(before);
  });

  it('죽은 영웅은 제물이 될 수 없다', () => {
    const s = store();
    const sac = idAt(s, 1);
    s.setState({
      roster: s.getState().roster.map((h) => (h.instId === sac ? { ...h, isDead: true } : h)),
    });

    const r = s.getState().fuse(idAt(s, 0), sac);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('sacrifice-dead');
  });

  it('죽은 영웅은 합성 대상이 될 수 없다', () => {
    const s = store();
    const target = idAt(s, 0);
    s.setState({
      roster: s.getState().roster.map((h) => (h.instId === target ? { ...h, isDead: true } : h)),
    });

    const r = s.getState().fuse(target, idAt(s, 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('target-dead');
  });

  it('실패하면 제물이 살아남는다', () => {
    const s = store();
    const id = idAt(s, 0);
    const before = s.getState().roster.length;
    s.getState().fuse(id, id); // same-hero 실패
    expect(s.getState().roster).toHaveLength(before);
  });

  it('없는 영웅을 가리키면 실패한다', () => {
    const s = store();
    const r = s.getState().fuse('ghost#1' as HeroInstId, idAt(s, 1));
    expect(r.ok).toBe(false);
  });
});

describe('승급', () => {
  /** 승급 가능 상태로 만든다 — 만렙 + 재료 충분 */
  const readyToPromote = (s: ReturnType<typeof store>, i = 0) => {
    const id = idAt(s, i);
    const hero = s.getState().roster.find((h) => h.instId === id)!;
    const maxLevel = gameData.starScaling[hero.star].maxLevel;
    s.setState({
      roster: s.getState().roster.map((h) => (h.instId === id ? { ...h, level: maxLevel } : h)),
      wallet: { ...s.getState().wallet, promotionStones: 99, awakeningStones: 99 },
    });
    return id;
  };

  it('등급이 오른다', () => {
    const s = store();
    const id = readyToPromote(s);
    const before = s.getState().roster.find((h) => h.instId === id)!.star;

    // PromoteResult에는 ok 필드가 없다 — 성공은 toStar의 존재로 판정한다
    const r = s.getState().promote(id);
    expect('toStar' in r).toBe(true);
    expect(s.getState().roster.find((h) => h.instId === id)!.star).toBe(before + 1);
  });

  it('레벨이 1로 리셋된다 (승급 직후는 약해진다 — 설계다)', () => {
    const s = store();
    const id = readyToPromote(s);
    s.getState().promote(id);
    const after = s.getState().roster.find((h) => h.instId === id)!;
    expect(after.level).toBe(1);
    expect(after.exp).toBe(0);
  });

  it('재료가 차감된다', () => {
    const s = store();
    const id = readyToPromote(s);
    const before = s.getState().wallet.promotionStones;
    s.getState().promote(id);
    expect(s.getState().wallet.promotionStones).toBeLessThan(before);
  });

  it('만렙이 아니면 실패한다', () => {
    const s = store();
    const id = idAt(s, 0);
    s.setState({
      roster: s.getState().roster.map((h) => (h.instId === id ? { ...h, level: 1 } : h)),
      wallet: { ...s.getState().wallet, promotionStones: 99 },
    });
    const r = s.getState().promote(id);
    expect('toStar' in r).toBe(false);
    if (!('toStar' in r) && !r.ok) expect(r.reason).toBe('level');
  });

  it('재료가 없으면 실패하고 등급이 그대로다', () => {
    const s = store();
    const id = idAt(s, 0);
    const hero = s.getState().roster.find((h) => h.instId === id)!;
    s.setState({
      roster: s.getState().roster.map((h) =>
        h.instId === id ? { ...h, level: gameData.starScaling[h.star].maxLevel } : h),
      wallet: { ...s.getState().wallet, promotionStones: 0, awakeningStones: 0 },
    });
    const r = s.getState().promote(id);
    expect('toStar' in r).toBe(false);
    if (!('toStar' in r) && !r.ok) expect(r.reason).toBe('materials');
    expect(s.getState().roster.find((h) => h.instId === id)!.star).toBe(hero.star);
  });

  it('개체 시드와 발굴 진행도는 승급해도 유지된다 (같은 개체다)', () => {
    const s = store();
    const id = readyToPromote(s);
    s.setState({
      roster: s.getState().roster.map((h) =>
        h.instId === id ? { ...h, revealProgress: 0.5 } : h),
    });
    const seedBefore = s.getState().roster.find((h) => h.instId === id)!.seed;

    s.getState().promote(id);
    const after = s.getState().roster.find((h) => h.instId === id)!;
    expect(after.seed).toBe(seedBefore);
    expect(after.revealProgress).toBe(0.5);
  });

  it('승급이 저장된다', () => {
    const s = store();
    const id = readyToPromote(s);
    s.getState().promote(id);
    const star = s.getState().roster.find((h) => h.instId === id)!.star;
    expect(loadRun()!.roster.find((h) => h.instId === id)!.star).toBe(star);
  });
});
