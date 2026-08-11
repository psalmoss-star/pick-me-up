import type {
  BannerKind, CodexEntry, GachaBanner, GachaState, HeroDef, HeroDefId,
  HeroInstId, HeroInstance, RNG, Star, Wallet,
} from './types';
import { klassFor } from './stats';
import { rollHeroSeed } from './potential';
import { generateIdentity, takenNames } from './identity';

/**
 * 소환(가챠)
 *
 * 설계 원칙
 *  - 확률표의 합은 반드시 1.0 (검증 함수 제공)
 *  - 천장(pity)은 누적 카운터이며, 확정 등급이 나오면 리셋된다
 *  - 등급이 먼저 결정되고, 그 등급에 속한 영웅 중 하나가 뽑힌다
 *  - 재화 부족 / 쿨다운 미충족은 예외가 아니라 실패 결과로 반환한다
 */

/**
 * 두 배너의 역할이 겹치지 않아야 한다.
 *
 *   금(free)   — 층을 오르면 계속 쌓이는 재화. **양**을 담당한다.
 *                합성 제물과 파티 보충이 여기서 나온다. 쿨다운 없이 금만 있으면 계속 뽑는다.
 *   젬(premium)— 희소 재화. **질**을 담당한다. ★4 이상만 나온다.
 *
 * 금 소환에서 ★4가 나오면 젬을 쓸 이유가 사라지므로 금은 ★3에서 끊는다.
 * 반대로 젬에서 ★3이 나오면 "500젬 쓰고 제물 뽑았다"가 되어 희소 재화가 헛돈다.
 */
export const BANNERS: Record<BannerKind, GachaBanner> = {
  free: {
    kind: 'free',
    rates: { 1: 0.6, 2: 0.3, 3: 0.1 },
    /**
     * 금 200 — 층 보상이 230~300금이라 **한 층에 한 번 남짓** 뽑을 수 있다.
     * 이보다 싸면 등반하지 않고 뽑기만 반복하는 게 최적이 되고,
     * 비싸면 시설·장비·강화와 경쟁이 안 돼 아무도 안 쓴다.
     */
    cost: { gold: 200 },
    // 천장 없음 — 금 소환은 양을 담당하므로 확정 고등급을 주지 않는다
  },
  premium: {
    kind: 'premium',
    /**
     * ★4 이상 확정. 젬은 희소 재화이므로 하한을 보장한다.
     * ★5 4%는 유지 — 여기를 올리면 ★5의 무게가 사라진다.
     */
    rates: { 4: 0.96, 5: 0.04 },
    cost: { gems: 500 },
    pity: { count: 60, guaranteedStar: 5 },
  },
};

/**
 * 금 소환 쿨다운 — 없다.
 *
 * 금이 곧 제동 장치라 시간 제한이 겹치면 두 번 막는 셈이 된다.
 * 상수는 남겨둔다: 세이브에 `freeGachaReadyAt`이 이미 들어 있고,
 * 나중에 쿨다운을 되살릴 여지도 남긴다.
 */
export const FREE_COOLDOWN_MS = 0;

export function initialGachaState(now = 0): GachaState {
  return { pityCounters: { free: 0, premium: 0 }, freeGachaReadyAt: now, totalPulls: 0 };
}

/** 확률표가 정합한지 (데이터 실수를 조용히 넘기지 않기 위한 검증) */
export function validateBanner(b: GachaBanner): { ok: boolean; sum: number } {
  const sum = Object.values(b.rates).reduce((a, v) => a + (v ?? 0), 0);
  return { ok: Math.abs(sum - 1) < 1e-9, sum };
}

/**
 * 배너가 약속한 등급이 실제로 영웅 풀에 존재하는지 검증한다.
 * 확률 합만 맞고 풀이 비어 있으면 소환이 조용히 실패한다 — 반드시 기동 시 확인할 것.
 */
export function validatePool(
  _b: GachaBanner,
  pool: Record<HeroDefId, HeroDef>,
): { ok: boolean; missingStars: Star[] } {
  /*
    이전에는 "배너가 약속한 별마다 그 별의 영웅이 있는가"를 봤다.
    아키타입 추첨이 등급과 분리된 지금은 그 검사가 의미를 잃었을 뿐 아니라
    항상 실패한다 — ★6은 baseStar가 6인 정의가 아예 없기 때문이다.
    이제 확인할 것은 "뽑을 대상이 하나라도 있는가"뿐이다.

    반환 타입은 유지한다. 호출부와 기존 테스트의 형태를 깨지 않기 위해서다.
  */
  return { ok: Object.keys(pool).length > 0, missingStars: [] };
}

function rollStar(b: GachaBanner, rng: RNG): Star {
  const entries = Object.entries(b.rates)
    .map(([s, p]) => [Number(s) as Star, p ?? 0] as const)
    .sort((a, b2) => a[0] - b2[0]);
  let r = rng();
  for (const [star, p] of entries) {
    if (r < p) return star;
    r -= p;
  }
  return entries[entries.length - 1][0];
}

/**
 * 아키타입(캐릭터 유형) 추첨. **등급과 독립이다.**
 *
 * 이전에는 `baseStar`로 걸렀는데, sample.ts에 별당 정의가 하나뿐이라
 * **등급이 곧 캐릭터**가 됐다 — ★3을 뽑으면 반드시 물결의 세인이었다.
 * 그 결과 같은 등급을 여러 번 뽑으면 이름·초상화·역할이 전부 같은 카드가 쌓였다.
 *
 * 이제 등급은 rollStar가 정하고 여기는 "어떤 유형인가"만 정한다.
 * baseStar는 도감상 기준 등급으로만 남고 추첨 필터가 아니다.
 *
 * inst.star ≠ def.baseStar는 새로운 상태가 아니다 — promote()가 defId를 둔 채
 * star만 올리므로 이미 정상적으로 발생한다. capsFor도 baseStar가 아니라
 * inst.star만 쓰므로 능력치 계산은 그대로다.
 */
function pickArchetype(
  pool: Record<HeroDefId, HeroDef>,
  rng: RNG,
): HeroDefId | null {
  const cands = Object.values(pool);
  if (cands.length === 0) return null;
  return cands[Math.floor(rng() * cands.length)].id;
}

export type PullFailure =
  | { ok: false; reason: 'insufficient'; missing: Partial<Wallet> }
  | { ok: false; reason: 'cooldown'; readyAt: number }
  | { ok: false; reason: 'empty-pool'; star: Star };

export type PullSuccess = {
  ok: true;
  hero: HeroInstance;
  star: Star;
  wasPity: boolean;
  isNewInCodex: boolean;
  wallet: Wallet;
  gacha: GachaState;
};

export type PullResult = PullSuccess | PullFailure;

export function pull(args: {
  banner: GachaBanner;
  wallet: Wallet;
  gacha: GachaState;
  pool: Record<HeroDefId, HeroDef>;
  codex: Record<HeroDefId, CodexEntry>;
  rng: RNG;
  now: number;
  currentFloor: number;
  makeId: () => string;
  /**
   * 현재 로스터(사망자 포함). 이름 유일성 검사에만 쓴다.
   * 생략하면 중복 검사 없이 이름이 생성된다 — 테스트·시뮬레이터용 편의이며
   * 실제 소환 경로(runStore.summon)는 반드시 넘긴다.
   */
  roster?: readonly HeroInstance[];
}): PullResult {
  const {
    banner, wallet, gacha, pool, codex, rng, now, currentFloor, makeId, roster = [],
  } = args;

  // 쿨다운
  if (banner.kind === 'free' && now < gacha.freeGachaReadyAt) {
    return { ok: false, reason: 'cooldown', readyAt: gacha.freeGachaReadyAt };
  }

  // 재화
  const missing: Partial<Wallet> = {};
  for (const [k, v] of Object.entries(banner.cost) as [keyof Wallet, number][]) {
    if ((wallet[k] ?? 0) < v) missing[k] = v - (wallet[k] ?? 0);
  }
  if (Object.keys(missing).length > 0) return { ok: false, reason: 'insufficient', missing };

  // 천장 판정
  const nextCount = gacha.pityCounters[banner.kind] + 1;
  const pityHit = !!banner.pity && nextCount >= banner.pity.count;
  const star = pityHit ? banner.pity!.guaranteedStar : rollStar(banner, rng);

  const defId = pickArchetype(pool, rng);
  if (!defId) return { ok: false, reason: 'empty-pool', star };

  /*
    ⚠️ 난수 소비 순서를 바꾸지 말 것: rollStar → pickArchetype → rollHeroSeed → generateIdentity.

    개체 시드는 잠재치를 결정하므로, 이름 추첨을 앞에 두면 그만큼 난수열이 밀려
    소환되는 영웅 전원의 잠재치가 통째로 이동한다. 이름을 추가하다 밸런스가 바뀌는 셈이다.
    시드를 먼저 확정하고, 이름은 그 뒤에 굴린다. (gacha.test.ts의 시드 회귀 테스트가 잠근다)
  */
  const seed = rollHeroSeed(rng);
  const identity = generateIdentity({ rng, taken: takenNames(roster, pool) });

  const hero: HeroInstance = {
    instId: makeId() as HeroInstId,
    defId,
    star,
    klass: klassFor(star),
    level: 1,
    exp: 0,
    // 같은 종류를 다시 뽑아도 다른 인물이어야 한다 (identity.ts 참조).
    name: identity.name,
    title: identity.title,
    // 개체차의 근원. 뽑는 순간 확정되고 이후 불변이다 (potential.ts 참조).
    seed,
    revealProgress: 0,
    currentHp: 0, // 0 = 전투 시작 시 최대치로 채워진다
    isDead: false,
    acquiredAtFloor: currentFloor,
  };

  const nextWallet: Wallet = { ...wallet };
  for (const [k, v] of Object.entries(banner.cost) as [keyof Wallet, number][]) {
    nextWallet[k] = (nextWallet[k] ?? 0) - v;
  }

  // 확정 등급이 나오면 천장 리셋 (천장으로 나왔든 운으로 나왔든)
  const resetPity = !!banner.pity && star >= banner.pity.guaranteedStar;

  return {
    ok: true,
    hero,
    star,
    wasPity: pityHit,
    isNewInCodex: !codex[defId],
    wallet: nextWallet,
    gacha: {
      ...gacha,
      totalPulls: gacha.totalPulls + 1,
      pityCounters: { ...gacha.pityCounters, [banner.kind]: resetPity ? 0 : nextCount },
      freeGachaReadyAt: banner.kind === 'free' ? now + FREE_COOLDOWN_MS : gacha.freeGachaReadyAt,
    },
  };
}

/** 도감 갱신 — 획득 시 호출 */
export function registerCodex(
  codex: Record<HeroDefId, CodexEntry>,
  hero: HeroInstance,
  now: number,
): Record<HeroDefId, CodexEntry> {
  const prev = codex[hero.defId];
  return {
    ...codex,
    [hero.defId]: prev
      ? {
          ...prev,
          timesAcquired: prev.timesAcquired + 1,
          highestStarReached: Math.max(prev.highestStarReached, hero.star) as Star,
        }
      : {
          defId: hero.defId,
          firstAcquiredAt: now,
          highestStarReached: hero.star,
          timesAcquired: 1,
          timesLost: 0,
        },
  };
}

/** 영웅을 잃었을 때 도감에 기록 (사망 또는 합성 제물) */
export function recordLoss(
  codex: Record<HeroDefId, CodexEntry>,
  defId: HeroDefId,
): Record<HeroDefId, CodexEntry> {
  const prev = codex[defId];
  if (!prev) return codex;
  return { ...codex, [defId]: { ...prev, timesLost: prev.timesLost + 1 } };
}
