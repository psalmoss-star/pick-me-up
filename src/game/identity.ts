/**
 * 개체 정체성 — 이름 생성과 표시.
 *
 * 이 게임에서 영웅은 **대체 불가능한 개체**다 (types.ts의 HeroInstance.seed 주석).
 * 그동안 그 대체 불가능성은 숨은 잠재치로만 구현돼 있었고, 이름은 종류(HeroDef)에
 * 붙어 있어서 같은 종류를 두 번 뽑으면 화면에 **똑같은 카드 두 장**이 나왔다.
 * 여기가 그것을 고치는 지점이다.
 *
 * ── 왜 파생이 아니라 저장인가 ────────────────────────────
 * 요구는 "이름이 매번 다르다"가 아니라 **"보유 중인 카드끼리 겹치지 않는다"** 이다.
 * 이건 개체 하나만 보고 결정할 수 없는 **로스터 전역 제약**이라 seed 파생으로는 못 지킨다.
 * 충돌을 피하려고 시드를 다시 굴리면 그 시드가 결정하는 **잠재치까지 바뀐다**
 * — 이름 문제를 고치다 밸런스를 흔드는 셈이다.
 * 그래서 생성 시점에 문자열로 확정해 HeroInstance에 저장한다.
 */
import type { HeroDef, HeroDefId, HeroInstance, RNG } from './types';
import { rngPick } from './rng';
import { GIVEN_NAMES, MODIFIERS, NAME_RETRY_LIMIT, TITLES } from './data/names';

/** 이름이 없는 개체를 위한 최후 표시값. 화면에 undefined가 새어나가지 않게 한다. */
export const UNKNOWN_NAME = '이름 없는 자';

export interface Identity {
  name: string;
  title: string;
}

/**
 * 새 개체의 이름과 이명을 만든다.
 *
 * `taken`에 있는 이름은 절대 반환하지 않는다 — 여기가 유일성을 보장하는 유일한 지점이다.
 * 호출부는 `takenNames(roster, defs)`로 집합을 만들어 넘긴다.
 *
 * ⚠️ **호출 순서 주의.** gacha.pull()에서 이 함수는 반드시 `rollHeroSeed()` **뒤에**
 *    불려야 한다. 앞에 두면 이름 추첨이 소비한 난수만큼 시드가 밀려
 *    소환되는 영웅 전원의 잠재치가 통째로 이동한다 (밸런스 기준선이 깨진다).
 */
export function generateIdentity(args: {
  rng: RNG;
  taken: ReadonlySet<string>;
}): Identity {
  const { rng, taken } = args;
  const title = rngPick(rng, TITLES);

  for (let i = 0; i < NAME_RETRY_LIMIT; i++) {
    const name = `${rngPick(rng, MODIFIERS)}의 ${rngPick(rng, GIVEN_NAMES)}`;
    if (!taken.has(name)) return { name, title };
  }

  /*
    여기까지 왔다면 어휘가 거의 소진됐다는 뜻이다.
    순수 함수는 반드시 종료해야 하므로 무한 재추첨 대신 접미사로 강제 분리한다.
    3,185 조합에 로스터 수십 명이면 실제로는 도달하지 않는 경로다.
  */
  const base = `${rngPick(rng, MODIFIERS)}의 ${rngPick(rng, GIVEN_NAMES)}`;
  for (let n = 2; ; n++) {
    const name = `${base} ${n}세`;
    if (!taken.has(name)) return { name, title };
  }
}

/**
 * 표시용 이름. **화면과 전투 로그는 전부 이 함수를 통과해야 한다.**
 *
 * stats.ts의 potentialOf가 seed 없는 개체를 흡수하는 것과 같은 관문 패턴이다.
 * def.name을 직접 읽는 코드가 하나라도 남으면 이 필드 이전 세이브의 개체와
 * 새 개체의 표시가 갈린다.
 *
 * defs 조회에 옵셔널 체이닝을 쓰는 이유: save.ts의 isHero()는 defId를 도감과
 * 대조하지 않는다(장비의 isGear는 하는데 영웅은 안 한다). 유령 defId가 통과할 수
 * 있으므로 여기서 함께 막는다.
 */
export function displayName(
  inst: HeroInstance,
  defs: Record<HeroDefId, HeroDef>,
): string {
  return inst.name ?? defs[inst.defId]?.name ?? UNKNOWN_NAME;
}

/** 표시용 이명. 없으면 종류의 이명으로 폴백한다. */
export function displayTitle(
  inst: HeroInstance,
  defs: Record<HeroDefId, HeroDef>,
): string {
  return inst.title ?? defs[inst.defId]?.title ?? '';
}

/**
 * 이미 쓰이고 있는 이름 집합. generateIdentity의 입력이 된다.
 *
 * **사망자를 제외하지 않는다.** 죽은 영웅은 isDead=true로 로스터에 남고,
 * 그 이름은 영구히 봉인된다 — 같은 이름의 새 영웅이 소환되면 그 죽음의 기록이
 * 무의미해지고, 퍼머데스가 정확히 거기서 새어나간다 (CLAUDE.md: "사망한 영웅은
 * 어떤 경로로도 되돌리지 않는다").
 *
 * 반면 합성 제물은 로스터에서 완전히 제거되므로 이름이 풀린다. 의도된 차이다 —
 * 제물은 죽음이 아니라 흡수이고 무덤 기록에 남지 않는다.
 */
export function takenNames(
  roster: readonly HeroInstance[],
  defs: Record<HeroDefId, HeroDef>,
  /**
   * 회차를 넘어 봉인된 이름 (무덤에 오른 사망자).
   *
   * 로스터는 회차마다 비므로 이것 없이는 1회차에 죽은 이름이 2회차에 다시 나온다 —
   * 무덤에 "6층에서 전사"라고 적힌 이름의 영웅이 살아 걸어다니게 된다.
   *
   * 옵셔널인 이유: src/game/은 stores/를 모른다. 집합을 만들어 넘기는 것은
   * 호출부(runStore.summon)의 일이고, sim·테스트는 안 넘겨도 동작해야 한다.
   */
  sealed?: ReadonlySet<string>,
): Set<string> {
  const out = new Set(roster.map((h) => displayName(h, defs)));
  if (sealed) for (const n of sealed) out.add(n);
  return out;
}
