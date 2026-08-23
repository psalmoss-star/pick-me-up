/**
 * 시설 스토어 연결 테스트. STEP 6.
 *
 * 지키려는 것:
 *   1. 층간 HP가 실제로 이어진다 — 엔진이 준 잔여 HP를 버리지 않는다
 *   2. 숙소 레벨이 회복량을 바꾼다
 *   3. 훈련소는 **나가지 않은** 영웅만 키운다 (참전자와 경쟁하면 퍼머데스의 긴장이 죽는다)
 *   4. 업그레이드 실패가 상태를 더럽히지 않는다
 *   5. 시설이 저장을 견딘다
 *
 * 수치 테이블 자체(단조 증가·범위 clamp)는 game/facilities.test.ts의 몫이다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore, initialWallet, restQuote } from './runStore';
import { loadRun } from './save';
import { restHealRate, FACILITY_COST, FACILITY_MAX_LEVEL } from '../game/data/facilities';
import { statsOfInstance } from '../game/stats';
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

/** 1층을 한 번 치르고 결과를 확정시킨다 */
function fightOnce(s: ReturnType<typeof store>) {
  s.getState().start();
  s.getState().finish();
}

const heroById = (s: ReturnType<typeof store>, id: HeroInstId) =>
  s.getState().roster.find((h) => h.instId === id)!;

describe('층간 HP 유지', () => {
  it('전투 후 참전 영웅의 currentHp가 기록된다 — 예전엔 버려지고 있었다', () => {
    const s = store();
    const party = s.getState().squads[0];
    fightOnce(s);

    // 참전자 중 살아남은 쪽은 currentHp가 0이 아니어야 한다
    const survivors = party
      .map((id) => heroById(s, id))
      .filter((h) => !h.isDead);
    expect(survivors.length).toBeGreaterThan(0);
    expect(survivors.some((h) => h.currentHp > 0)).toBe(true);
  });

  it('전투에 나가지 않은 영웅의 HP는 건드리지 않는다', () => {
    const s = store();
    const benched = s.getState().roster.filter((h) => !s.getState().squads[0].includes(h.instId));
    expect(benched.length).toBeGreaterThan(0);
    fightOnce(s);
    for (const b of benched) {
      expect(heroById(s, b.instId).currentHp).toBe(0);
    }
  });

  it('회복 후에도 최대 HP를 넘지 않는다', () => {
    const s = store();
    const party = s.getState().squads[0];
    fightOnce(s);
    for (const id of party) {
      const h = heroById(s, id);
      if (h.isDead) continue;
      const max = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling).hp;
      expect(h.currentHp).toBeLessThanOrEqual(max);
    }
  });

  it('숙소 레벨이 높을수록 전투 후 HP가 많이 남는다', () => {
    /**
     * 같은 시드·같은 전투를 숙소 레벨만 바꿔 돌린다.
     * 회복은 전투 뒤에 얹히므로 전투 결과 자체는 같고 HP만 달라져야 한다.
     *
     * 1층으로 재면 안 된다 — 손상이 얕아(최대의 70~80% 잔존) Lv.0의 35%만으로도
     * 전원이 만피 상한에 걸려 레벨 간 차이가 0이 된다. 실제로 그렇게 짰다가 걸렸다.
     * 보스층(6층)은 소모가 깊어 상한에 닿지 않으므로 차이가 드러난다.
     */
    const BOSS_FLOOR = 5; // floorIndex 5 = 6층
    const hpSumAt = (level: number) => {
      const s = store();
      s.setState({
        floorIndex: BOSS_FLOOR,
        facilities: { rest: level, training: 0, forge: 0, armory: 0 },
      });
      const party = s.getState().squads[0];
      fightOnce(s);
      return party
        .map((id) => heroById(s, id))
        .filter((h) => !h.isDead)
        .reduce((sum, h) => sum + h.currentHp, 0);
    };

    expect(hpSumAt(FACILITY_MAX_LEVEL)).toBeGreaterThan(hpSumAt(0));
  });

  it('숙소 미건설이어도 회복이 0은 아니다 — 0이면 등반이 성립하지 않는다', () => {
    expect(restHealRate(0)).toBeGreaterThan(0);
  });

  it('손상이 얕은 층은 미건설 숙소만으로도 만피로 돌아온다', () => {
    /**
     * 1층 잔여는 최대의 70~80%라 Lv.0(35%)로도 상한에 걸린다.
     * 저층에서 소모가 누적되지 않는 것은 의도된 완급이다 — 대가는 6층부터 요구한다.
     */
    const s = store();
    const party = s.getState().squads[0];
    fightOnce(s);
    for (const id of party) {
      const h = heroById(s, id);
      if (h.isDead) continue;
      const max = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling).hp;
      expect(h.currentHp).toBe(max);
    }
  });
});

describe('훈련소 — 유휴 경험치', () => {
  it('전투에 안 나간 영웅만 경험치를 받는다', () => {
    const s = store();
    s.setState({ facilities: { rest: 0, training: FACILITY_MAX_LEVEL, forge: 0, armory: 0 } });

    const party = s.getState().squads[0];
    const benched = s.getState().roster.filter((h) => !party.includes(h.instId));
    const before = new Map(benched.map((h) => [h.instId, { lv: h.level, exp: h.exp }]));

    fightOnce(s);

    for (const b of benched) {
      const after = heroById(s, b.instId);
      const prev = before.get(b.instId)!;
      const grew = after.level > prev.lv || after.exp > prev.exp;
      expect(grew).toBe(true);
    }
  });

  it('훈련소 미건설이면 대기 영웅이 자라지 않는다', () => {
    const s = store();
    const party = s.getState().squads[0];
    const benched = s.getState().roster.filter((h) => !party.includes(h.instId));
    const before = benched.map((h) => ({ id: h.instId, lv: h.level, exp: h.exp }));

    fightOnce(s);

    for (const b of before) {
      const after = heroById(s, b.id);
      expect(after.level).toBe(b.lv);
      expect(after.exp).toBe(b.exp);
    }
  });
});

describe('시설 업그레이드', () => {
  it('금이 부족하면 실패하고 상태가 그대로다', () => {
    const s = store();
    // 시작 금은 300(= Lv.1 한 채분)이므로 부족 상황을 명시적으로 만든다
    s.setState({ wallet: { ...s.getState().wallet, gold: 0 } });

    const r = s.getState().upgradeFacility('rest');
    expect(r).toEqual({ ok: false, reason: 'not-enough-gold' });
    expect(s.getState().facilities.rest).toBe(0);
  });

  /**
   * 시작 금과 Lv.1 비용이 어긋나면 시설 화면이 첫 진입에서 전부 잠긴 채 열린다.
   * 실제로 그렇게 냈다가 "들어갈 수가 없다"는 지적을 받았다 — 둘의 관계를 고정한다.
   */
  it('시작 금으로 시설 하나는 바로 열 수 있다', () => {
    const s = store();
    expect(initialWallet().gold).toBeGreaterThanOrEqual(FACILITY_COST[1]);

    const r = s.getState().upgradeFacility('rest');
    expect(r.ok).toBe(true);
    expect(s.getState().facilities.rest).toBe(1);
  });

  it('시작 금으로 두 채까지는 못 연다 — 어디에 투자할지가 선택이어야 한다', () => {
    const s = store();
    expect(s.getState().upgradeFacility('rest').ok).toBe(true);
    expect(s.getState().upgradeFacility('armory')).toEqual({
      ok: false, reason: 'not-enough-gold',
    });
  });

  it('성공하면 레벨이 오르고 금이 정확히 빠진다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gold: 10_000 } });

    const r = s.getState().upgradeFacility('rest');
    expect(r.ok).toBe(true);
    expect(s.getState().facilities.rest).toBe(1);
    expect(s.getState().wallet.gold).toBe(10_000 - FACILITY_COST[1]);
  });

  it('만렙을 넘길 수 없다', () => {
    const s = store();
    s.setState({
      wallet: { ...s.getState().wallet, gold: 1_000_000 },
      facilities: { rest: FACILITY_MAX_LEVEL, training: 0, forge: 0, armory: 0 },
    });
    const r = s.getState().upgradeFacility('rest');
    expect(r).toEqual({ ok: false, reason: 'max-level' });
    expect(s.getState().facilities.rest).toBe(FACILITY_MAX_LEVEL);
  });

  it('한 시설을 올려도 다른 시설은 그대로다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gold: 10_000 } });
    s.getState().upgradeFacility('armory');
    expect(s.getState().facilities.armory).toBe(1);
    expect(s.getState().facilities.rest).toBe(0);
    expect(s.getState().facilities.training).toBe(0);
    expect(s.getState().facilities.forge).toBe(0);
  });

  it('업그레이드는 즉시 저장된다 — 새로고침으로 금을 되돌릴 수 없다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gold: 10_000 } });
    s.getState().upgradeFacility('forge');

    const saved = loadRun();
    expect(saved?.facilities.forge).toBe(1);
    expect(saved?.wallet.gold).toBe(10_000 - FACILITY_COST[1]);
  });

  it('불러오면 시설 레벨이 복원된다', () => {
    const s = store();
    s.setState({ wallet: { ...s.getState().wallet, gold: 10_000 } });
    s.getState().upgradeFacility('training');
    s.getState().upgradeFacility('training');

    const saved = loadRun()!;
    const s2 = store();
    s2.getState().hydrate(saved);
    expect(s2.getState().facilities.training).toBe(2);
  });
});

/**
 * 숙소 휴식 — 금을 내고 즉시 회복 (STEP 30).
 *
 * 지키려는 것:
 *   1. `currentHp === 0`은 **만피**다 — 멀쩡한 영웅에게 돈을 받으면 안 된다
 *   2. 표시 비용과 실제 청구액이 같다 (restQuote 하나만 쓴다)
 *   3. 죽은 영웅은 되살아나지 않는다 — 퍼머데스는 금으로 못 되돌린다
 */
describe('숙소 휴식', () => {
  /** 첫 영웅을 절반 피로 만든다. 반환값은 최대 HP */
  const injure = (s: ReturnType<typeof store>, idx = 0) => {
    const h = s.getState().roster[idx];
    const max = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling).hp;
    s.setState({
      roster: s.getState().roster.map(
        (x, i) => (i === idx ? { ...x, currentHp: Math.floor(max / 2) } : x),
      ),
    });
    return max;
  };

  it('전원 만전이면 휴식할 것이 없다 — currentHp 0을 부상으로 읽지 않는다', () => {
    const s = store();
    // 초기 로스터는 전부 currentHp: 0(=만피)이다
    expect(restQuote(s.getState().roster).cost).toBeNull();
    expect(s.getState().rest()).toEqual({ ok: false, reason: 'already-full' });
  });

  it('부상자가 있으면 회복하고 금을 낸다', () => {
    const s = store();
    const max = injure(s);
    s.setState({ wallet: { ...s.getState().wallet, gold: 10_000 } });

    const quoted = restQuote(s.getState().roster).cost!;
    const r = s.getState().rest();

    expect(r.ok).toBe(true);
    // 표시된 비용과 실제 청구액이 같아야 한다
    if (r.ok) expect(r.spent).toBe(quoted);
    expect(s.getState().wallet.gold).toBe(10_000 - quoted);
    expect(s.getState().roster[0].currentHp).toBe(max);
  });

  it('금이 모자라면 회복도 차감도 없다', () => {
    const s = store();
    injure(s);
    s.setState({ wallet: { ...s.getState().wallet, gold: 0 } });
    const before = s.getState().roster[0].currentHp;

    const r = s.getState().rest();

    expect(r.ok).toBe(false);
    expect(s.getState().roster[0].currentHp).toBe(before);
    expect(s.getState().wallet.gold).toBe(0);
  });

  it('죽은 영웅은 되살아나지 않는다', () => {
    const s = store();
    s.setState({
      roster: s.getState().roster.map(
        (x, i) => (i === 0 ? { ...x, isDead: true, currentHp: 0 } : x),
      ),
      wallet: { ...s.getState().wallet, gold: 10_000 },
    });

    s.getState().rest();

    expect(s.getState().roster[0].isDead).toBe(true);
    expect(s.getState().roster[0].currentHp).toBe(0);
  });

  it('잃은 HP가 많을수록 비싸다', () => {
    const light = store();
    injure(light);
    const heavy = store();
    const max = injure(heavy);
    heavy.setState({
      roster: heavy.getState().roster.map((x, i) => (i === 0 ? { ...x, currentHp: 1 } : x)),
    });

    expect(restQuote(heavy.getState().roster).cost!)
      .toBeGreaterThan(restQuote(light.getState().roster).cost!);
    expect(max).toBeGreaterThan(1);
  });
});
