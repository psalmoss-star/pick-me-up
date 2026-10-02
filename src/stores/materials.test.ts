/**
 * 재료 드롭 — 스토어 연결.
 *
 * 지키려는 것:
 *   1. 결과 화면 미리보기가 **실제 지급과 일치**한다
 *      (결과 화면은 `finish()`보다 먼저 뜨므로 같은 식을 다시 계산한다)
 *   2. 재료 추첨을 넣어도 **기존 장비 드롭이 바뀌지 않는다** (소비 순서 규율)
 *   3. 패배하면 재료가 없다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { rollFloorLoot, isEmptyBag } from '../game/loot';
import { FLOORS } from '../game/data/floors';
import { GEAR_DEFS, tierOf } from '../game/data/gear';

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

/** `App.previewMaterials()`와 **같은 식**이어야 한다 */
function preview(s: ReturnType<typeof store>) {
  const st = s.getState();
  const floor = FLOORS[st.floorIndex];
  return rollFloorLoot({
    seed: st.seed,
    floorId: floor.id,
    isBoss: !!floor.isBoss,
    battleCount: st.battleCount,
    casualties: st.result!.casualties
      .map((id) => st.snapshot.find((h) => h.instId === id))
      .filter((h): h is NonNullable<typeof h> => !!h)
      .map((h) => h.gear),
    cleared: true,
  }).materials;
}

describe('재료 드롭 — 스토어', () => {
  it('미리 계산한 재료가 실제 지급과 정확히 일치한다', () => {
    // 여러 시드로 — 한 시드만 보면 우연히 맞을 수 있다
    for (const seed of [1, 7, 42, 99, 256]) {
      const s = store(seed);
      s.getState().start();
      s.setState({
        result: { ...s.getState().result!, outcome: 'victory', casualties: [], turnsElapsed: 8 },
      });
      const predicted = preview(s);
      const before = { ...s.getState().materials };
      s.getState().finish();
      const after = s.getState().materials;

      // 늘어난 만큼이 예측과 같아야 한다
      const delta: Record<string, number> = {};
      for (const [id, n] of Object.entries(after)) {
        const d = (n ?? 0) - (before[id as keyof typeof before] ?? 0);
        if (d > 0) delta[id] = d;
      }
      expect(delta).toEqual(predicted);
    }
  });

  it('승리하면 재료가 실제로 쌓인다', () => {
    const s = store(3);
    let gained = 0;
    for (let i = 0; i < 8; i++) {
      s.getState().start();
      const r = s.getState().result;
      if (!r) break;
      s.setState({ result: { ...r, outcome: 'victory', casualties: [] } });
      s.getState().finish();
    }
    gained = Object.values(s.getState().materials).reduce<number>((a, n) => a + (n ?? 0), 0);
    expect(gained).toBeGreaterThan(0);
  });

  it('패배하면 재료가 들어오지 않는다', () => {
    const s = store(5);
    s.getState().start();
    s.setState({
      result: { ...s.getState().result!, outcome: 'defeat', casualties: [], turnsElapsed: 4 },
    });
    s.getState().finish();
    expect(isEmptyBag(s.getState().materials)).toBe(true);
  });

  /**
   * ⚠️ **가장 중요한 테스트 — 회귀 고정값.**
   *
   * `lootRng`는 순서대로 소비되는 스트림이라 재료 추첨을 앞에 끼우면
   * 기존 장비 드롭이 전부 달라진다(실측: 200시드 중 120개가 바뀌었다).
   *
   * 아래 값은 **재료 기능을 넣기 전** 코드로 뽑은 실측 결과다. `rollFloorLoot`의
   * 결과를 자기 자신과 비교하면 순서를 통째로 밀어도 양쪽이 같이 움직여
   * **아무것도 못 잡는다**(실제로 그렇게 썼다가 변조가 통과하는 것을 확인했다).
   * 그래서 바깥에서 가져온 고정값과 비교한다.
   *
   * 이 테스트가 깨지면 = 전리품 소비 순서가 바뀌었다 = 기존 세이브의 드롭 운이
   * 통째로 달라졌다는 뜻이다.
   *
   * 장비 사다리(STEP 66, 2026-10-02)에서 드롭 **종류**는 의도대로 바뀌었다(등급 추첨 → 층의 단계).
   * 그래서 고정값은 **드롭 유무**만 지키고, 종류는 단계 규칙(일반=보급, 보스=정예)으로 본다.
   * 옛 종류 기록: 1층 w_soldier·w_chipped·w_chipped·a_tatter, 6·12층 보스 w_emberfang.
   * 재료까지 포함한 소비 순서는 `game/loot.test.ts`의 재료 지문이 잠근다.
   */
  it('장비 드롭 유무가 재료 도입 이전과 같다 — 소비 순서 회귀 고정', () => {
    const LEGACY: [number, number, boolean, number, boolean][] = [
      [11, 1, false, 0, true],
      [23, 1, false, 0, true],
      [47, 1, false, 0, true],
      [88, 1, false, 0, true],
      [11, 6, true, 3, true],
      [42, 12, true, 7, true],
      [7, 20, false, 12, false],
      [99, 40, false, 25, false],
    ];
    for (const [seed, floorId, isBoss, battleCount, dropped] of LEGACY) {
      const loot = rollFloorLoot({
        seed, floorId, isBoss, battleCount, casualties: [], cleared: true,
      });
      expect(loot.gearDefId != null, `seed ${seed} / ${floorId}층`).toBe(dropped);
      if (loot.gearDefId) {
        const d = GEAR_DEFS[loot.gearDefId];
        expect([d.tier, d.line], `seed ${seed} / ${floorId}층`).toEqual([tierOf(floorId), isBoss ? 'elite' : 'supply']);
      }
    }
  });

  it('재료가 저장·복원을 견딘다', () => {
    const s = store(13);
    s.getState().start();
    s.setState({
      result: { ...s.getState().result!, outcome: 'victory', casualties: [], turnsElapsed: 8 },
    });
    s.getState().finish();
    const saved = { ...s.getState().materials };

    const s2 = store(13);
    s2.getState().hydrate({ ...s.getState() } as never);
    expect(s2.getState().materials).toEqual(saved);
  });
});
