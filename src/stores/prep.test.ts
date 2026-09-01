/**
 * 출정 준비 한 수 — 스토어 규칙.
 *
 * 순수 로직은 `game/prep.test.ts`, 엔진 재현성은 `game/prepBattle.test.ts`.
 * 여기는 **구매·소멸·배선**만 본다.
 *
 * 가장 중요한 것은 "개입을 거쳐도 준비가 살아남는가"다 —
 * `start()`와 `intervene()`이 같은 입력을 만들지 않으면 그 순간 효과가 증발한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { serialize, deserialize } from './save';
import { prepForMission } from '../game/data/preps';
import { floorAt } from '../game/data';

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

/** 금을 넉넉히 준 스토어 */
function rich() {
  const s = store();
  s.setState({ wallet: { ...s.getState().wallet, gold: 99_999 } });
  return s;
}

/** 지금 층에서 살 수 있는 준비 */
const defOf = (s: ReturnType<typeof store>) =>
  prepForMission(floorAt(s.getState().floorIndex).mission.kind);

describe('구매 규칙', () => {
  it('사면 준비가 잡히고 금이 정확히 그만큼 빠진다', () => {
    const s = rich();
    const before = s.getState().wallet.gold;
    const def = defOf(s);

    const r = s.getState().buyPrep();

    expect(r.ok).toBe(true);
    expect(s.getState().prep).toBe(def.id);
    expect(s.getState().wallet.gold).toBe(before - def.cost);
  });

  it('금이 부족하면 거부되고 상태가 변하지 않는다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gold: 0 } });
    const walletBefore = { ...s.getState().wallet };

    const r = s.getState().buyPrep();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-enough-gold');
    expect(s.getState().prep).toBeNull();
    expect(s.getState().wallet).toEqual(walletBefore);
  });

  it('층당 1개만 살 수 있고 금도 한 번만 빠진다', () => {
    const s = rich();
    const def = defOf(s);
    const before = s.getState().wallet.gold;

    s.getState().buyPrep();
    const r = s.getState().buyPrep();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('already-bought');
    expect(s.getState().wallet.gold).toBe(before - def.cost);
  });

  it('전투 중에는 못 산다', () => {
    const s = rich();
    s.getState().start();

    const r = s.getState().buyPrep();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('in-battle');
  });
});

describe('준비는 전투 입력이다 — 개입을 견딘다', () => {
  /*
    ⚠️ 이 작업에서 가장 위험한 지점이다.

    `intervene()`이 `start()`와 같은 입력을 만들지 않으면, 개입하는 순간
    준비 효과가 조용히 사라진다. `runStore`가 이미 같은 함정을 겪고
    "start()와 같은 입력을 넘겨야 한다"는 주석을 남겨 뒀다.
  */
  it('빈 개입으로 재시뮬레이션해도 결과가 그대로다', () => {
    const s = rich();
    s.getState().buyPrep();
    s.getState().start();
    const before = JSON.stringify(s.getState().result!.events);

    s.getState().intervene([]);

    expect(JSON.stringify(s.getState().result!.events)).toBe(before);
  });

  it('준비를 산 전투는 안 산 전투와 다르다 (대조군)', () => {
    /*
      위 테스트만 있으면 "준비가 애초에 아무 효과도 없는" 경우에도 통과한다.
      대조군이 있어야 위 테스트가 실제로 무언가를 잰다.
    */
    const withPrep = rich();
    withPrep.getState().buyPrep();
    withPrep.getState().start();

    const without = rich();
    without.getState().start();

    expect(JSON.stringify(withPrep.getState().result!.events))
      .not.toBe(JSON.stringify(without.getState().result!.events));
  });
});

describe('준비는 그 층에서만 유효하다', () => {
  it('승리로 층을 넘기면 비워진다', () => {
    const s = rich();
    s.getState().buyPrep();
    s.getState().start();
    s.setState({
      result: { ...s.getState().result!, outcome: 'victory', casualties: [] },
    });

    s.getState().finish();

    expect(s.getState().prep).toBeNull();
  });

  it('패배해도 비워진다 — 환불은 없다', () => {
    const s = rich();
    const def = defOf(s);
    const before = s.getState().wallet.gold;
    s.getState().buyPrep();
    s.getState().start();
    s.setState({ result: { ...s.getState().result!, outcome: 'defeat' } });

    s.getState().finish();

    expect(s.getState().prep).toBeNull();
    // 금은 돌아오지 않는다. "이번 판에 거는 판돈"이다
    expect(s.getState().wallet.gold).toBeLessThanOrEqual(before - def.cost);
  });

  it('층을 바꾸면 무효가 된다', () => {
    // 준비는 임무 유형에 묶여 있다. 다른 층으로 옮기면 살 수 없는 것을 든 상태가 된다
    const s = rich();
    s.setState({ maxFloorReached: 3 });
    s.getState().buyPrep();
    expect(s.getState().prep).not.toBeNull();

    s.getState().selectFloor(2);

    expect(s.getState().prep).toBeNull();
  });
});

describe('준비는 저장되지 않는다', () => {
  it('직렬화 결과에 prep이 없다', () => {
    // 저장하면 새로고침으로 되살아나거나 다음 층에 샌다
    const s = rich();
    s.getState().buyPrep();

    const saved = JSON.parse(serialize(s.getState()));

    expect(saved.run.prep).toBeUndefined();
  });

  it('불러오면 준비가 비어 있다', () => {
    const s = rich();
    s.getState().buyPrep();
    const raw = serialize(s.getState());

    const fresh = store();
    fresh.getState().hydrate(deserialize(raw)!);

    expect(fresh.getState().prep).toBeNull();
  });

  it('회차를 넘기지 않는다', () => {
    const s = rich();
    s.getState().buyPrep();

    s.getState().reset();

    expect(s.getState().prep).toBeNull();
  });
});
