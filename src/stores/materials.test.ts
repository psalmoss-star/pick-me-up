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
   */
  it('장비 드롭이 재료 도입 이전과 완전히 같다 — 소비 순서 회귀 고정', () => {
    const LEGACY: [number, number, boolean, number, string | null][] = [
      [11, 1, false, 0, 'w_soldier'],
      [23, 1, false, 0, 'w_chipped'],
      [47, 1, false, 0, 'w_chipped'],
      [88, 1, false, 0, 'a_tatter'],
      [11, 6, true, 3, 'w_emberfang'],
      [42, 12, true, 7, 'w_emberfang'],
      [7, 20, false, 12, null],
      [99, 40, false, 25, null],
    ];
    for (const [seed, floorId, isBoss, battleCount, expected] of LEGACY) {
      const loot = rollFloorLoot({
        seed, floorId, isBoss, battleCount, casualties: [], cleared: true,
      });
      expect(loot.gearDefId, `seed ${seed} / ${floorId}층`).toBe(expected);
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
