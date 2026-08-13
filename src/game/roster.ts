/**
 * 로스터 조회.
 *
 * ── 왜 화면마다 filter를 쓰지 않고 여기 모았나 ──────────
 * `roster.filter(h => !h.isDead)`가 화면 세 곳에 각자 복붙돼 있었는데,
 * **`RosterScreen`만 그 결과를 계산해 놓고 정작 목록은 `roster` 전체를 돌렸다.**
 * 그 결과 파티 편성 화면에 죽은 영웅이 카드로 계속 남아 있었다
 * (누를 수는 없지만 자리를 차지하고, 로스터가 길어질수록 심해진다).
 *
 * 같은 판정이 여러 곳에 흩어져 있으면 한 곳만 어긋나도 아무도 모른다.
 * 관문을 하나로 만들고 테스트로 잠근다 — `potentialOf`(stats.ts)와 같은 이유다.
 *
 * ⚠️ **사망자는 숨기는 것이 아니라 옮기는 것이다.** 여기서 걸러낸 영웅은
 * 무덤(`GraveScreen` ← `legacy.fallen`)에 영구히 남는다. 퍼머데스의 기록이
 * 사라지면 이 게임의 축이 사라진다 — 걸러낸 화면은 무덤을 가리켜야 한다.
 */
import type { HeroInstance } from './types';

/** 살아있는 영웅만. 편성·합성·상세 등 "지금 쓸 수 있는" 목록은 전부 이걸 쓴다. */
export function livingHeroes(roster: readonly HeroInstance[]): HeroInstance[] {
  return roster.filter((h) => !h.isDead);
}

/**
 * 사망자. 런 내 조회용이다.
 *
 * ⚠️ **영구 기록의 정본은 `legacy.fallen`(무덤)이다.** 회차가 바뀌면 로스터는
 * 통째로 리셋되므로 여기서 얻은 목록은 이번 런의 것뿐이다.
 */
export function fallenHeroes(roster: readonly HeroInstance[]): HeroInstance[] {
  return roster.filter((h) => h.isDead);
}

/** 제물 확인 창을 한 번 더 세우는 기준값. 밸런스가 아니라 UI 안전장치다. */
export const PRECIOUS_REVEAL = 0.45;

/**
 * 제물로 바치기 전에 한 단계 더 물어야 하는 개체인가.
 *
 * 합성은 되돌릴 수 없으므로 오조작 한 번이 영구 손실이 된다.
 * 판정을 화면이 아니라 여기에 두는 이유는 `livingHeroes`와 같다 —
 * 화면에 흩어지면 한 곳만 어긋나도 아무도 모른다.
 *
 * **즐겨찾기가 가장 강한 근거**지만 유일한 근거로 두지는 않는다.
 * 표식을 한 번도 안 찍은 플레이어에게는 확인 창이 통째로 사라지기 때문이다.
 * 나머지 셋은 그런 사람을 위한 자동 기준이다.
 */
export function isPreciousSacrifice(
  h: HeroInstance,
  party: readonly string[] = [],
): boolean {
  return h.favorite === true
    || h.star >= 4
    || (h.revealProgress ?? 0) >= PRECIOUS_REVEAL
    || party.includes(h.instId);
}
