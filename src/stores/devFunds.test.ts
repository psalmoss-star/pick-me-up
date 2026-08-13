/**
 * 테스트용 재화 지급의 스토어 연결.
 *
 * 지키려는 것은 지급량이 아니라 **순서**다.
 * 세이브 로드가 지갑을 통째로 덮어쓰므로(`save.ts`의 `{ ...initialWallet(), ...saved.wallet }`),
 * hydrate보다 먼저 지급하면 지급분이 조용히 사라진다. 화면엔 아무 에러도 안 뜨고
 * "재화가 안 늘어난다"만 남는다 — 그래서 테스트로 잠근다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { DEV_WALLET, isDevMode } from './devWallet';
import { loadRun } from './save';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

/**
 * ⚠️ 이 스위트는 개발 모드에서만 의미가 있다.
 * vitest는 `import.meta.env.DEV`가 true라 그대로 돌지만, 혹시 false인 환경에서
 * 돌더라도 **조용히 통과하지 않고 건너뛴 것이 보이게** 한다.
 */
const devOnly = isDevMode() ? it : it.skip;

describe('grantTestFunds', () => {
  devOnly('지갑을 테스트용 잔액으로 채운다', () => {
    const s = createRunStore();
    expect(s.getState().wallet.gold).toBeLessThan(DEV_WALLET.gold);

    s.getState().grantTestFunds();

    expect(s.getState().wallet.gold).toBe(DEV_WALLET.gold);
    expect(s.getState().wallet.gems).toBe(DEV_WALLET.gems);
  });

  devOnly('퍼머데스는 건드리지 않는다 — 부활권은 0으로 남는다', () => {
    const s = createRunStore();
    s.getState().grantTestFunds();
    expect(s.getState().wallet.revivalTokens).toBe(0);
  });

  /**
   * 저장하지 않으면 새로고침마다 지급이 다시 일어나 재화가 늘었다 줄었다 하는 것처럼
   * 보인다. 지급 결과가 세이브에 고정돼야 그 다음부터 평범한 지갑처럼 움직인다.
   */
  devOnly('지급 결과가 저장된다', () => {
    const s = createRunStore();
    s.getState().grantTestFunds();

    const saved = loadRun();
    expect(saved?.wallet.gold).toBe(DEV_WALLET.gold);
  });

  /**
   * 이 테스트가 이 파일의 존재 이유다.
   * App.tsx가 `hydrate()` → `grantTestFunds()` 순서로 부르는 것을 고정한다.
   * 뒤집으면 로드가 지급분을 덮어쓴다.
   */
  devOnly('hydrate 이후에 부르면 지급이 살아남는다', () => {
    const seed = createRunStore();
    seed.getState().grantTestFunds();
    const saved = loadRun()!;

    // 가난한 세이브를 흉내낸다 — 예전에 저장된 런을 불러오는 상황
    const poor = { ...saved, wallet: { ...saved.wallet, gold: 10, gems: 10 } };

    const s = createRunStore();
    s.getState().hydrate(poor);
    expect(s.getState().wallet.gold).toBe(10); // 로드가 지갑을 덮어썼다

    s.getState().grantTestFunds();
    expect(s.getState().wallet.gold).toBe(DEV_WALLET.gold);
  });

  devOnly('여러 번 불러도 결과가 같다 (멱등)', () => {
    const s = createRunStore();
    s.getState().grantTestFunds();
    const once = { ...s.getState().wallet };
    s.getState().grantTestFunds();
    expect(s.getState().wallet).toEqual(once);
  });

  /** 소환·시설·강화가 재화 때문에 막히지 않아야 테스트가 된다 */
  devOnly('지급 후 유료 소환이 재화 부족으로 막히지 않는다', () => {
    const s = createRunStore();
    s.getState().grantTestFunds();

    const before = s.getState().wallet.gems;
    const r = s.getState().summon('premium');

    // 쿨다운 등 다른 사유로 막히는 건 이 테스트의 관심사가 아니다.
    // 잠그려는 건 **재화 부족(insufficient)이 사유가 되지 않는다**는 것 하나뿐이다.
    if (!r.ok) expect(r.reason).not.toBe('insufficient');
    else expect(s.getState().wallet.gems).toBeLessThan(before);
  });
});
