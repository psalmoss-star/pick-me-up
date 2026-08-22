/**
 * SEED_OFFSET 탐색 — 초기 로스터의 잠재 계수를 정하는 값의 근거를 남긴다.
 *
 * ── 왜 별도 스크립트인가 ──────────────────────────────
 * `npm run sim`으로는 이 영역이 **안 잡힌다.** sim은 층별 승률을 자체 기준 파티로
 * 재므로, `initialRoster()`를 바꿔도 표가 미동도 하지 않는다(§5-9).
 * 초기 로스터의 승률을 보려면 그 로스터로 직접 돌리는 수밖에 없다.
 *
 * ── 계수 합 0만으로는 부족하다 ────────────────────────
 * SEED_OFFSET은 "시작 파티의 잠재 계수 합이 0"이 되도록 고른 값이다 —
 * 개체차는 보이되 파티 전체 강함은 안 변하게 하려는 것이다.
 * 그런데 **합이 0인 후보가 6층 43%를 낸 적이 있다**(§5-10).
 * 계수는 4종(hp/atk/def/spd)인데 합은 그 평균이라, 어느 능력치에 몰렸는지를
 * 지운다 — 방어에 몰린 +0.05와 공격에 몰린 +0.05는 전투에서 다르게 작동한다.
 * 그래서 **반드시 승률까지 재고 고른다.** 이 스크립트가 하는 일이 그것이다.
 *
 * ── 무엇을 고르는가 ───────────────────────────────────
 * 계수 합이 0에 가까운 후보들 중 **6층 승률이 기준선(67~70%)에 가장 가까운 것**.
 * 6층을 보는 이유는 저층에서 유일한 보스 층이자 승률이 100%가 아닌 층이라
 * 변화가 드러나기 때문이다. 1~5층은 거의 100%라 후보를 못 가른다.
 *
 * 실행: npx tsx scripts/seed-search.mts
 *       npx tsx scripts/seed-search.mts --wide   (탐색 범위를 넓힌다, 느리다)
 */
import { runEncounter } from '../src/game/encounter';
import { createRng } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import { FLOORS } from '../src/game/data/floors';
import { derivePotential, potentialScore } from '../src/game/potential';
import { partyLimitAt } from '../src/game/data/party';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

/**
 * 초기 로스터의 정의 — `runStore.ts`의 `initialRoster()`와 **같아야 한다.**
 *
 * 값을 복제하는 이유는 runStore가 Zustand 스토어라 import하면 브라우저 의존이
 * 딸려오기 때문이다. `initialRoster()`를 고치면 여기도 같이 고칠 것.
 */
const ROSTER: Array<[HeroDefId, Star, number]> = [
  [HERO.ashen, 2, 15],
  [HERO.bulwark, 2, 15],
  [HERO.tide, 3, 20],
  [HERO.gale, 4, 30],
  [HERO.bolt, 5, 40],
  [HERO.banner, 3, 20],
];

/** runStore.ts의 makeHero와 같은 시드 파생식. */
const seedOf = (n: number, offset: number) => (n * 2654435761 + offset) >>> 0;

const makeRoster = (offset: number): HeroInstance[] =>
  ROSTER.map(([defId, star, level], i) => ({
    instId: `${defId}#${i + 1}` as HeroInstId,
    defId, star, klass: klassFor(star), level, exp: 0,
    seed: seedOf(i + 1, offset),
    revealProgress: 0,
    currentHp: 0,
    isDead: false,
    acquiredAtFloor: 1,
  }));

/** 로스터 전체의 잠재 계수 합. 0에 가까울수록 "파티 강함이 안 변한" 것이다. */
const coeffSum = (roster: HeroInstance[]) =>
  roster.reduce((s, h) => s + potentialScore(derivePotential(h.seed!, h.star)), 0);

/**
 * 그 로스터로 실제 층을 돌린다.
 *
 * 출전은 정원까지만 — 실제 플레이와 같아야 측정이 성립한다(§5-23).
 * 저층은 정원 3이라 6인 중 HP 높은 3인이 나간다.
 */
function winRate(offset: number, floorId: number, n = 300) {
  const floor = FLOORS[floorId - 1];
  const limit = partyLimitAt(floorId);
  let w = 0, d = 0;
  for (let s = 0; s < n; s++) {
    const roster = makeRoster(offset);
    const sortie = roster.slice(0, limit);
    const r = runEncounter({ party: sortie, floor, data: gameData, rng: createRng(s) });
    if (r.outcome === 'victory') w++;
    d += r.casualties.length;
  }
  return { win: (w / n) * 100, death: d / n };
}

// ------------------------------------------------------------

/** 기준선 — 시드가 없던 시절의 6층 승률. 여기서 멀어지면 안 된다. */
const TARGET_FLOOR = 6;
const TARGET_WIN = 70;

const wide = process.argv.includes('--wide');
const LIMIT = wide ? 200000 : 50000;

console.log(`\n  SEED_OFFSET 탐색 — 로스터 ${ROSTER.length}인, 0~${LIMIT} 범위\n`);

// 1단계: 계수 합이 0에 가까운 후보를 모은다 (전투를 안 돌리므로 빠르다)
const candidates: Array<{ offset: number; sum: number }> = [];
for (let offset = 1; offset <= LIMIT; offset++) {
  const sum = coeffSum(makeRoster(offset));
  if (Math.abs(sum) < 0.002) candidates.push({ offset, sum });
}
candidates.sort((a, b) => Math.abs(a.sum) - Math.abs(b.sum));

console.log(`  계수 합 |합| < 0.002인 후보: ${candidates.length}개`);

// 2단계: 상위 후보의 실제 승률을 잰다 (§5-10 — 합만 보면 안 된다)
const TOP = Math.min(12, candidates.length);
console.log(`  그중 상위 ${TOP}개의 ${TARGET_FLOOR}층 승률 실측 (300회)\n`);
console.log('  offset  | 계수 합    | 6층 승률   | 개체별 계수');

const scored = candidates.slice(0, TOP).map((c) => {
  const m = winRate(c.offset, TARGET_FLOOR);
  const each = makeRoster(c.offset)
    .map((h) => potentialScore(derivePotential(h.seed!, h.star)))
    .map((v) => (v >= 0 ? '+' : '') + v.toFixed(3))
    .join(' ');
  console.log(
    `  ${String(c.offset).padStart(6)}  | ${(c.sum >= 0 ? '+' : '') + c.sum.toFixed(4)}` +
    `   | ${m.win.toFixed(0).padStart(3)}%/${m.death.toFixed(2)}  | ${each}`,
  );
  return { ...c, ...m };
});

// 3단계: 기준선에 가장 가까운 것을 고른다
scored.sort((a, b) => Math.abs(a.win - TARGET_WIN) - Math.abs(b.win - TARGET_WIN));
const best = scored[0];

console.log(`\n  ⇒ 추천: ${best.offset} (${TARGET_FLOOR}층 ${best.win.toFixed(0)}%/사망 ${best.death.toFixed(2)}, 계수 합 ${best.sum.toFixed(4)})`);
console.log(`     기준선 ${TARGET_WIN}%와의 차이: ${Math.abs(best.win - TARGET_WIN).toFixed(0)}%p`);

/*
  ⚠️ **여기 추천값을 그대로 채택하지 말 것.** 300회는 후보를 추리는 용도다.
  실제로 300회에서 29147(69%)이 13622(70%)보다 앞섰는데, 1000회로 다시 재자
  29147은 73%, 13622는 70%로 순위가 뒤집혔다.
  상위 3~4개를 표본 1000회로 다시 재고 고를 것 — 채택값 13622는 그렇게 골랐다.
*/
console.log(`     (300회는 후보 추리기용이다. 상위 몇 개를 1000회로 다시 잴 것)\n`);

/*
  ⚠️ 승률 폭을 함께 보여준다. 후보들이 전부 비슷하면 offset이 이 로스터에서는
  칼날이 아니라는 뜻이고, 크게 갈리면 고른 값의 근거가 그만큼 중요하다는 뜻이다.
*/
const wins = scored.map((s) => s.win);
console.log(`  후보 승률 폭: ${Math.min(...wins).toFixed(0)}% ~ ${Math.max(...wins).toFixed(0)}%`);
console.log(`  (합이 0이어도 승률이 갈린다면 §5-10이 경고한 그것이다)\n`);
