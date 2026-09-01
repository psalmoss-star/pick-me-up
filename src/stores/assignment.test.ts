/**
 * 시설 배치 — 스토어 규칙.
 *
 * 설계: docs/superpowers/specs/2026-09-01-facility-assignment-design.md
 *
 * 규칙 4개를 잠근다:
 *   1. 배치자는 유휴 exp를 못 받는다 (파견의 awayNow와 같은 이유)
 *   2. 배치자가 출전하면 그 층 동안 산출이 멈춘다 (전투력과 생산의 제로섬)
 *   3. 사망 시 자동 해제
 *   4. 제물이 되면 자동 해제
 *
 * 3·4를 빠뜨리면 유령 instId가 슬롯을 영구 점유한다 —
 * HANDOFF §"교착은 못 하는 게 아니라 못 빠져나오는 것"이다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { ASSIGN_SLOTS, idleExpWithAssign, idleExpGain } from '../game/data/facilities';
import { ADVENTURE_DEFS } from '../game/data/adventures';
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

/** 훈련소를 켜 둔 스토어. Lv.0은 유휴 exp가 0이라 아무것도 측정할 수 없다 */
function started(trainingLevel = 2) {
  const s = store();
  s.getState().start();
  s.setState({ facilities: { ...s.getState().facilities, training: trainingLevel, forge: 1 } });
  return s;
}

/** 로스터에서 이번 전투에 안 나간 영웅 하나 */
function idleHero(s: ReturnType<typeof store>): HeroInstId {
  const fought = new Set(
    s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
  );
  const h = s.getState().roster.find((x) => !fought.has(x.instId) && !x.isDead);
  if (!h) throw new Error('대기 영웅이 없다 — 테스트 전제가 깨졌다');
  return h.instId;
}

describe('배치 — 기본 동작', () => {
  it('배치하면 목록에 남고 해제하면 빠진다', () => {
    const s = started();
    const id = idleHero(s);

    expect(s.getState().assign('training', id).ok).toBe(true);
    expect(s.getState().assignments.training).toContain(id);

    s.getState().unassign(id);
    expect(s.getState().assignments.training).not.toContain(id);
  });

  it('슬롯을 넘겨 배치하면 거부되고 상태가 변하지 않는다', () => {
    const s = started();
    const fought = new Set(
      s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
    );
    const idle = s.getState().roster.filter((h) => !fought.has(h.instId) && !h.isDead);
    // 슬롯보다 한 명 더 있어야 이 테스트가 일한다
    expect(idle.length).toBeGreaterThan(ASSIGN_SLOTS.training);

    for (let i = 0; i < ASSIGN_SLOTS.training; i++) {
      expect(s.getState().assign('training', idle[i].instId).ok).toBe(true);
    }
    const before = s.getState().assignments.training;
    const r = s.getState().assign('training', idle[ASSIGN_SLOTS.training].instId);

    expect(r.ok).toBe(false);
    expect(s.getState().assignments.training).toEqual(before);
  });

  it('같은 영웅이 두 시설에 동시에 배치되지 않는다', () => {
    const s = started();
    const id = idleHero(s);

    s.getState().assign('training', id);
    s.getState().assign('forge', id);

    const both = s.getState().assignments.training.includes(id)
      && s.getState().assignments.forge.includes(id);
    expect(both).toBe(false);
  });

  it('파견 중인 영웅은 배치되지 않는다', () => {
    // 둘 다 "대기실에 없는" 상태다. 겹치면 유휴 exp 제외가 두 번 걸린다.
    const s = started();
    const fought = new Set(
      s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
    );
    const idle = s.getState().roster.filter((h) => !fought.has(h.instId) && !h.isDead);

    // 정원이 맞는 모험을 고른다 — 인원이 안 맞으면 파견 자체가 거부된다
    const def = ADVENTURE_DEFS.find((d) => d.partySize <= idle.length);
    if (!def) throw new Error('보낼 수 있는 모험이 없다 — 테스트 전제가 깨졌다');

    const sent = idle.slice(0, def.partySize).map((h) => h.instId);
    const r = s.getState().dispatchAdventure(def.id, sent);
    expect(r.ok).toBe(true);

    expect(s.getState().assign('training', sent[0]).ok).toBe(false);
  });
});

describe('규칙 1 — 배치자는 유휴 exp를 못 받는다', () => {
  it('배치된 영웅은 층을 깨도 exp가 오르지 않는다', () => {
    const s = started();
    const id = idleHero(s);
    s.getState().assign('training', id);

    s.setState({ result: { ...s.getState().result!, outcome: 'victory', casualties: [] } });
    const before = s.getState().roster.find((h) => h.instId === id)!;
    s.getState().finish();
    const after = s.getState().roster.find((h) => h.instId === id)!;

    expect(after.exp).toBe(before.exp);
    expect(after.level).toBe(before.level);
  });

  it('배치 안 된 대기 영웅은 (배치 보너스가 반영된) 유휴 exp를 받는다', () => {
    // 대조군이다. 이게 없으면 위 테스트는 "아무도 exp를 안 받는다"로도 통과한다.
    const s = started();
    const assigned = idleHero(s);
    s.getState().assign('training', assigned);

    const fought = new Set(
      s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
    );
    const other = s.getState().roster.find(
      (h) => !fought.has(h.instId) && !h.isDead && h.instId !== assigned,
    );
    if (!other) throw new Error('대조군 영웅이 없다');

    s.setState({ result: { ...s.getState().result!, outcome: 'victory', casualties: [] } });
    const before = other.exp;
    s.getState().finish();
    const after = s.getState().roster.find((h) => h.instId === other.instId)!;

    // 배치 1명이 반영된 값이어야 한다 — 기본 유휴 exp보다 커야 한다
    const level = s.getState().facilities.training;
    expect(after.exp - before).toBe(idleExpWithAssign(level, 1));
    expect(idleExpWithAssign(level, 1)).toBeGreaterThan(idleExpGain(level));
  });
});

describe('규칙 2 — 배치 이득 < 출전 성장 (핵심 부등식)', () => {
  it('배치자가 받는 exp(0)는 출전자가 받는 exp보다 항상 작다', () => {
    // 제안 문서의 수용 기준이다. 배치가 출전보다 이득이면
    // "안 내보내는 게 이득"이 되어 퍼머데스의 긴장이 사라진다.
    const s = started(3); // 만렙 훈련소 — 배치 이득이 가장 큰 조건
    const id = idleHero(s);
    s.getState().assign('training', id);

    s.setState({ result: { ...s.getState().result!, outcome: 'victory', casualties: [] } });
    const before = new Map(s.getState().roster.map((h) => [h.instId, h.exp]));
    const fought = new Set(
      s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
    );
    s.getState().finish();

    const gain = (x: HeroInstId) =>
      s.getState().roster.find((h) => h.instId === x)!.exp - before.get(x)!;

    const survivor = s.getState().roster.find((h) => fought.has(h.instId) && !h.isDead);
    if (!survivor) throw new Error('생존한 출전자가 없다 — 부등식을 잴 수 없다');

    expect(gain(id)).toBeLessThan(gain(survivor.instId));
  });
});

describe('규칙 3 — 배치자가 출전하면 그 층 산출이 멈춘다', () => {
  it('배치자가 이번 전투에 나갔으면 그 인원은 보너스에서 빠진다', () => {
    const s = started();
    const fought = [...new Set(
      s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
    )] as HeroInstId[];
    const idle = idleHero(s);

    // 출전자 1명 + 대기자 1명을 배치한다 → 유효 인원은 1명뿐이어야 한다
    s.getState().assign('training', fought[0]);
    s.getState().assign('training', idle);

    const other = s.getState().roster.find(
      (h) => !fought.includes(h.instId) && !h.isDead && h.instId !== idle,
    );
    if (!other) throw new Error('대조군 영웅이 없다');

    s.setState({ result: { ...s.getState().result!, outcome: 'victory', casualties: [] } });
    const before = other.exp;
    s.getState().finish();
    const after = s.getState().roster.find((h) => h.instId === other.instId)!;

    const level = s.getState().facilities.training;
    // 2명을 배치했지만 1명은 출전했으므로 1명분만 반영된다
    expect(after.exp - before).toBe(idleExpWithAssign(level, 1));
  });
});

describe('규칙 4 — 사망·제물은 배치를 자동 해제한다', () => {
  it('배치된 영웅이 죽으면 슬롯이 풀린다', () => {
    const s = started();
    const fought = [...new Set(
      s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
    )] as HeroInstId[];
    s.getState().assign('training', fought[0]);

    s.setState({
      result: { ...s.getState().result!, outcome: 'victory', casualties: [fought[0]] },
    });
    s.getState().finish();

    expect(s.getState().assignments.training).not.toContain(fought[0]);
  });

  it('배치된 영웅을 제물로 바치면 슬롯이 풀린다', () => {
    const s = started();
    const alive = s.getState().roster.filter((h) => !h.isDead);
    const target = alive[0].instId;
    const sacrifice = alive[1].instId;

    s.getState().assign('training', sacrifice);
    expect(s.getState().assignments.training).toContain(sacrifice);

    s.getState().fuse(target, sacrifice);

    expect(s.getState().roster.some((h) => h.instId === sacrifice)).toBe(false);
    expect(s.getState().assignments.training).not.toContain(sacrifice);
  });
});

/*
  폰 실측(2026-09-01)에서 배치된 영웅 이름이 `—`로 떴다.

  화면이 후보 목록(`assignable`)으로 배치자의 이름을 찾고 있었는데, 그 목록은
  **정의상 배치된 사람을 제외**하므로 조회가 100% 실패한다. 두 목록은 서로
  배타적인 집합이라 한 배열이 둘 다 할 수 없다 — `assignedInfo`를 따로 둔 이유다.

  화면을 직접 렌더하지 않고 App이 넘기는 두 목록의 **관계**를 잠근다.
*/
describe('배치 목록과 후보 목록은 배타적이다', () => {
  /** App.tsx가 `assignable`/`assignedInfo`를 만드는 것과 같은 규칙 */
  const lists = (s: ReturnType<typeof store>) => {
    const assigned = new Set<string>([
      ...s.getState().assignments.training,
      ...s.getState().assignments.forge,
    ]);
    const party = s.getState().squads[0];
    return {
      assigned,
      assignable: s.getState().roster.filter(
        (h) => !h.isDead && !party.includes(h.instId) && !assigned.has(h.instId),
      ),
      assignedInfo: s.getState().roster.filter((h) => assigned.has(h.instId)),
    };
  };

  it('배치된 영웅은 후보 목록에 없고, 이름표 목록에는 있다', () => {
    const s = started();
    const id = idleHero(s);
    s.getState().assign('training', id);

    const { assignable, assignedInfo } = lists(s);

    // 후보에 남아 있으면 이미 배치된 사람을 또 배치하라고 권하는 셈이다
    expect(assignable.some((h) => h.instId === id)).toBe(false);
    // 이름표에 없으면 화면에 `—`가 뜬다 — 폰에서 실제로 그랬다
    expect(assignedInfo.some((h) => h.instId === id)).toBe(true);
  });

  it('배치된 모든 영웅의 이름을 이름표 목록에서 찾을 수 있다', () => {
    const s = started();
    const fought = new Set(
      s.getState().result!.roster.filter((u) => u.side === 'ally').map((u) => u.sourceId),
    );
    const idle = s.getState().roster.filter((h) => !fought.has(h.instId) && !h.isDead);
    s.getState().assign('training', idle[0].instId);
    s.getState().assign('forge', idle[1].instId);

    const { assigned, assignedInfo } = lists(s);
    expect(assigned.size).toBe(2);

    for (const id of assigned) {
      expect(assignedInfo.some((h) => h.instId === id)).toBe(true);
    }
  });
});

describe('배치는 회차를 넘지 않는다', () => {
  it('새 런을 시작하면 배치가 비워진다', () => {
    // gdd-v3 §7 — 계승은 기록뿐이다. 시설·배치를 물려주면 sim 기준선이 회차마다 갈린다.
    const s = started();
    s.getState().assign('training', idleHero(s));
    expect(s.getState().assignments.training.length).toBeGreaterThan(0);

    s.getState().reset();

    expect(s.getState().assignments.training).toEqual([]);
    expect(s.getState().assignments.forge).toEqual([]);
  });
});
