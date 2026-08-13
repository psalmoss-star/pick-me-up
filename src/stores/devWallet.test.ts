import { describe, it, expect } from 'vitest';
import { grantDevWallet, DEV_WALLET, isDevMode } from './devWallet';
import { initialWallet } from './runStore';
import type { Wallet } from '../game/types';

describe('grantDevWallet', () => {
  it('시작 지갑을 테스트용 잔액까지 올린다', () => {
    const w = grantDevWallet(initialWallet());
    expect(w.gold).toBe(DEV_WALLET.gold);
    expect(w.gems).toBe(DEV_WALLET.gems);
    expect(w.promotionStones).toBe(DEV_WALLET.promotionStones);
    expect(w.awakeningStones).toBe(DEV_WALLET.awakeningStones);
  });

  /**
   * 퍼머데스는 협상 대상이 아니다(CLAUDE.md). 부활권은 소비 경로가 없는
   * 폐기 필드이며, 테스트 편의로도 되살리는 수단을 만들지 않는다.
   */
  it('부활권은 지급하지 않는다', () => {
    expect(grantDevWallet(initialWallet()).revivalTokens).toBe(0);
    expect(grantDevWallet({ ...initialWallet(), revivalTokens: 0 }).revivalTokens).toBe(0);
    expect('revivalTokens' in DEV_WALLET).toBe(false);
  });

  /** 지급이 재화를 깎으면 안 된다 — 이미 부자인 세이브를 가난하게 만드는 버그가 된다 */
  it('이미 가진 양이 더 많으면 줄이지 않는다', () => {
    const rich: Wallet = {
      gold: DEV_WALLET.gold * 2,
      gems: DEV_WALLET.gems * 2,
      promotionStones: DEV_WALLET.promotionStones * 2,
      awakeningStones: DEV_WALLET.awakeningStones * 2,
      revivalTokens: 0,
    };
    expect(grantDevWallet(rich)).toEqual(rich);
  });

  it('원본을 변경하지 않는다', () => {
    const w = initialWallet();
    grantDevWallet(w);
    expect(w).toEqual(initialWallet());
  });

  /**
   * ⚠️ Infinity를 쓰면 JSON 직렬화에서 null이 되고, 로드할 때 숫자 검사에 걸려
   * **지갑이 통째로 기본값으로 떨어진다.** 유한값 유지를 고정한다.
   */
  it('지급액은 전부 유한한 정수다 — JSON 왕복에서 살아남아야 한다', () => {
    for (const v of Object.values(DEV_WALLET)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Number.isInteger(v)).toBe(true);
    }
    const w = grantDevWallet(initialWallet());
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });

  /**
   * 시작 재화의 설계 의도(시설 딱 한 채분)는 그대로 남아야 한다.
   * 지급은 얹는 것이지 시작값을 바꾸는 것이 아니다 — 이걸 놓치면
   * facility.test.ts의 "두 채는 못 연다"가 깨진다.
   */
  it('initialWallet()은 건드리지 않는다', () => {
    grantDevWallet(initialWallet());
    expect(initialWallet()).toEqual({
      gold: 300, gems: 500, promotionStones: 0, awakeningStones: 0, revivalTokens: 0,
    });
  });
});

describe('isDevMode', () => {
  it('boolean을 돌려준다', () => {
    expect(typeof isDevMode()).toBe('boolean');
  });

  /**
   * 지급 차단이 `import.meta.env.DEV` **하나에만** 걸려 있어야 한다.
   * 프로덕션 빌드는 이 값을 상수 false로 치환하고, 그래야 지급 코드가
   * 번들에서 제거된다(빌드 산출물에서 `9999999` 미검출 확인).
   * 여기에 런타임 조건(호스트명·쿼리스트링 등)을 섞으면 그 최적화가 깨지면서
   * **지급액이 배포본에 그대로 실린다.**
   */
  it('vitest(개발 모드)에서는 true다', () => {
    expect(isDevMode()).toBe(true);
  });
});
