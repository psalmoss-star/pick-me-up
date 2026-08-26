/**
 * 로스터 정렬 — 목록을 어떤 순서로 볼 것인가.
 *
 * ── 왜 필요했나 ────────────────────────────────────────
 * `HeroesScreen`은 **전투력 내림차순 고정**이었고 사용자가 바꿀 수 없었다.
 * 개체가 늘수록 "누굴 제물로 쓸까"를 판단하기 어렵다 — 제물은 약한 쪽에서
 * 고르는데 목록은 항상 강한 쪽부터 보여준다.
 * (`PartyScreen`은 아예 원본 순서라 정렬조차 없었다)
 *
 * ── 왜 game/에 두나 ────────────────────────────────────
 * 화면마다 정렬 산식을 따로 쓰면 같은 로스터가 화면마다 다른 순서로 나온다.
 * §5-48("같은 값을 여러 화면에서 보여줄 때 서식은 한 곳에서 정한다")과 같은 이유다.
 * 순수 함수이므로 `game/`에 둔다 — React·DOM 의존이 없다.
 *
 * ⚠️ **밸런스가 아니다.** 정렬은 표시 순서일 뿐이고 전투력·확률 어디에도
 * 들어가지 않는다. 즐겨찾기(favorite)를 정렬 키로 쓰지 않는 이유도 같다 —
 * gdd-v3 §7: "넣으면 표식이 취향이 아니라 최적화가 된다."
 * 여기서 favorite은 **필터**로만 쓴다(보고 싶은 것만 보는 것은 최적화가 아니다).
 */
import type { HeroDef, HeroDefId, HeroInstance, StarScaling, Star } from './types';
import { heroPower } from './power';

export type SortKey = 'power' | 'level' | 'star' | 'recent';

export const SORT_LABEL: Record<SortKey, string> = {
  power: '전투력',
  level: '레벨',
  star: '등급',
  recent: '획득순',
};

export const SORT_KEYS: readonly SortKey[] = ['power', 'level', 'star', 'recent'];

/**
 * 정렬. **원본 배열을 건드리지 않는다.**
 *
 * 전부 내림차순이다 — 방치형 목록의 기본 관심사는 "무엇이 위인가"이고,
 * 오름차순까지 넣으면 버튼이 두 배가 되는데 375px에 들어가지 않는다.
 * 약한 것을 찾는 경우(제물)는 목록 끝을 보면 된다.
 */
export function sortRoster(
  heroes: readonly HeroInstance[],
  key: SortKey,
  defs: Record<HeroDefId, HeroDef>,
  scaling: Record<Star, StarScaling>,
): HeroInstance[] {
  const arr = [...heroes];
  switch (key) {
    case 'power':
      return arr.sort((a, b) =>
        heroPower(b, defs[b.defId], scaling) - heroPower(a, defs[a.defId], scaling));
    case 'level':
      // 레벨이 같으면 등급으로 가른다 — 안 그러면 같은 레벨 무리의 순서가 무의미해진다
      return arr.sort((a, b) => (b.level - a.level) || (b.star - a.star));
    case 'star':
      return arr.sort((a, b) => (b.star - a.star) || (b.level - a.level));
    case 'recent':
      /*
        획득순 = 로스터 배열 순서의 역순. 새로 얻은 것이 뒤에 붙기 때문이다.
        `acquiredAtFloor`로 정렬하지 않는다 — 같은 층에서 여러 번 뽑으면
        전부 같은 값이라 순서가 안 갈린다.
      */
      return arr.reverse();
  }
}
