/**
 * 테스트용 재화 지급.
 *
 * ── 왜 initialWallet()을 직접 올리지 않는가 ─────────────
 * 두 가지 이유이고, 둘 다 실제로 걸린다.
 *
 * 1. **설계가 잠겨 있다.** `initialWallet()`의 금 300은 "시설 딱 한 채분"이고
 *    `facility.test.ts`가 *두 채는 못 연다*를 테스트로 고정해 뒀다. 어디에 먼저
 *    투자할지 고르는 것이 이 게임의 첫 결정이라서다. 테스트 편의로 그 값을 올리면
 *    게임 설계를 훼손하면서 테스트까지 깨진다.
 *
 * 2. **이미 세이브가 있으면 값이 안 바뀐다.** `save.ts`의 로드는 저장된 지갑을
 *    기본값 위에 덮어쓴다(`{ ...initialWallet(), ...saved.wallet }`). 한 번이라도
 *    플레이한 브라우저·폰에서는 시작값을 올려도 화면에 아무 변화가 없다.
 *    지급은 **로드 이후**에 얹혀야 한다.
 *
 * 그래서 시작 재화는 그대로 두고, 개발 모드에서만 별도 경로로 얹는다.
 *
 * ⚠️ **`import.meta.env.DEV`는 프로덕션 빌드에서 상수 false로 치환된다.**
 * 그래서 `grantTestFunds`는 배포본에서 조기 반환만 남고, **지급액과
 * `grantDevWallet` 본문은 번들에서 제거된다**(빌드 산출물에서 확인함 —
 * `9999999`가 검색되지 않는다). 액션 이름만 껍데기로 남는다.
 *
 * 이것은 관리자/유저 모드를 제대로 나누기 전까지의 **임시 안전장치**다.
 * 개발 서버는 LAN에 열려 있어(폰 테스트용) 같은 네트워크면 누구나 접속할 수 있다 —
 * 여기서 막는 것은 배포본이지 개발 서버가 아니다.
 */
import type { Wallet } from '../game/types';

/**
 * 테스트용 지급량.
 *
 * 소환 천장(90회)을 여러 번 돌리고 강화를 반복해도 안 마르는 선. 정확한 값에
 * 의미는 없다 — "재화 때문에 테스트가 막히지 않는다"가 유일한 요구사항이다.
 * 다만 무한대는 쓰지 않는다. Infinity는 저장 시 JSON에서 null이 되고,
 * 로드할 때 숫자 검사에 걸려 지갑이 통째로 기본값으로 떨어진다.
 */
export const DEV_WALLET: Pick<Wallet, 'gold' | 'gems' | 'promotionStones' | 'awakeningStones'> = {
  gold: 9_999_999,
  gems: 9_999_999,
  promotionStones: 9_999,
  awakeningStones: 9_999,
};

/** 개발 모드인가. 프로덕션 빌드에서는 상수 false로 치환된다. */
export const isDevMode = (): boolean => import.meta.env.DEV;

/**
 * 지갑에 테스트용 재화를 얹는다.
 *
 * ⚠️ **`revivalTokens`는 건드리지 않는다.** 퍼머데스가 이 게임의 축이고,
 * 부활권은 소비 경로가 없는 폐기된 필드다(`types.ts` 참조).
 * 테스트 편의로도 되살리는 수단을 만들지 않는다.
 *
 * 이미 가진 양보다 적게 주지 않는다(`Math.max`) — 지급이 재화를 **깎는** 일은 없어야 한다.
 */
export function grantDevWallet(wallet: Wallet): Wallet {
  return {
    ...wallet,
    gold: Math.max(wallet.gold, DEV_WALLET.gold),
    gems: Math.max(wallet.gems, DEV_WALLET.gems),
    promotionStones: Math.max(wallet.promotionStones, DEV_WALLET.promotionStones),
    awakeningStones: Math.max(wallet.awakeningStones, DEV_WALLET.awakeningStones),
  };
}
