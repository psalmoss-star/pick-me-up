/**
 * 갓 뽑은 개체 측정 — 소환 직후의 전력으로 저층을 오를 수 있는가.
 *
 * ── 왜 별도 도구인가 ──────────────────────────────────
 * `npm run sim`과 `climb-check.mts`는 **둘 다 잘 키운 파티만 돌린다**
 * (★2 Lv.15 / ★3 Lv.30 / ★4 Lv.50). 저레벨 구간을 아예 밟지 않으므로
 * 갓 뽑은 개체의 결함이 있어도 두 표가 완전히 정상으로 나온다.
 *
 * 실제로 그런 일이 있었다(§STEP 33) — "★4 Lv.1이 ★1 Lv.1보다 약한" 결함이
 * 있는 채로 sim·climb-check가 전부 정상이었고, 실기기 상태창에 숫자를
 * 띄우고 나서야 눈에 보였다.
 *
 * > **표가 안 움직이는 것은 안전의 증거가 아니다** — 도구가 그 축을 안 볼 뿐이다.
 *
 * 이 스크립트가 그 축(등급 × 레벨)을 본다.
 *
 * ── 무엇을 재는가 ─────────────────────────────────────
 * 등급×레벨 격자마다 **동일 등급·동일 레벨 파티**로 1층 승률을 잰다.
 * 소환은 `level: 1`로 개체를 만들므로(`gacha.ts`), Lv.1 열이 곧
 * "가챠로 얻은 영웅만으로 등반을 시작할 수 있는가"의 답이다.
 *
 * 동일 등급 파티로 재는 이유는 **등급 축을 분리**하기 위해서다. 섞은 파티로 재면
 * 강한 한 명이 약한 둘을 업고 가서 어느 등급이 문제인지 안 갈린다.
 *
 * ── 기준선 (HANDOFF §STEP 33, 고치기 전) ──────────────
 *   등급 | Lv.1  Lv.5  Lv.10 Lv.15
 *   ★1   |   0%    0%  100%   --
 *   ★2   |   0%    0%   38%  100%
 *   ★3   |   0%    0%    1%   88%
 *
 * 현행 코드에서 이 표가 재현되면 도구가 옳은 것이다.
 *
 * 실행: npx tsx scripts/fresh-check.mts
 *       npx tsx scripts/fresh-check.mts --floors 1,2,6   (여러 층을 잰다)
 *       npx tsx scripts/fresh-check.mts --n 500          (표본 수, 기본 300)
 */
import { runEncounter } from '../src/game/encounter';
import { createRng } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import { FLOORS } from '../src/game/data/floors';
import { starScaling } from '../src/game/data/elements';
import { partyLimitAt } from '../src/game/data/party';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

/**
 * 파티 구성 — 딜/탱/힐. sim.ts의 기준 파티와 **같은 종류**를 쓴다.
 *
 * 등급·레벨만 격자에 따라 갈아끼우므로, 종류가 다르면 이 표와 sim 표를
 * 나란히 놓고 읽을 수 없다. 정원이 5인 구간에서는 뒤 둘을 더 쓴다.
 */
const COMPOSITION: HeroDefId[] = [
  HERO.ashen,   // 딜
  HERO.bulwark, // 탱
  HERO.tide,    // 힐
  HERO.gale,
  HERO.bolt,
];

/**
 * 시드를 주지 않는다 → 잠재 계수 0.
 * 기준선은 개체차 없는 상태여야 한다(sim.ts의 `party()`와 같은 판단).
 */
const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId,
  star,
  klass: klassFor(star),
  level,
  exp: 0,
  currentHp: 0, // 0 = 전투 시작 시 최대치로 채워진다
  isDead: false,
  acquiredAtFloor: 1,
});

/** 동일 등급·동일 레벨 파티. 정원은 층이 정한다(§실제 플레이와 같아야 측정이 성립한다). */
const uniformParty = (star: Star, level: number, limit: number): HeroInstance[] =>
  COMPOSITION.slice(0, limit).map((defId, i) => hero(defId, star, level, i + 1));

function measure(star: Star, level: number, floorId: number, n: number) {
  const floor = FLOORS[floorId - 1];
  const limit = partyLimitAt(floorId);
  let wins = 0;
  let deaths = 0;
  let turns = 0;
  for (let s = 0; s < n; s++) {
    const r = runEncounter({
      party: uniformParty(star, level, limit),
      floor,
      data: gameData,
      rng: createRng(s),
    });
    if (r.outcome === 'victory') wins++;
    deaths += r.casualties.length;
    turns += r.turnsElapsed;
  }
  return { win: (wins / n) * 100, death: deaths / n, turn: turns / n };
}

// ------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const N = Number(argValue('--n') ?? 300);
const floorIds = (argValue('--floors') ?? '1')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 1 && n <= FLOORS.length);

/**
 * 레벨 격자. 등급마다 만렙이 다르므로(★1은 10) **만렙을 넘는 칸은 비운다** —
 * 넣으면 클램프된 값이 찍혀 "★1 Lv.15가 Lv.10과 같다"는 가짜 정보가 된다.
 */
const LEVELS = [1, 5, 10, 15, 20, 30];
const STARS: Star[] = [1, 2, 3, 4, 5, 6];

console.log(`\n  갓 뽑은 개체 — 등급×레벨 승률 (표본 ${N}회, 동일 등급 파티)\n`);

for (const floorId of floorIds) {
  const floor = FLOORS[floorId - 1];
  const limit = partyLimitAt(floorId);
  console.log(`  ── ${floorId}층 ${floor.name} [정원 ${limit}] ────────────────────`);
  console.log(`  등급 | ${LEVELS.map((l) => `Lv.${l}`.padStart(5)).join(' ')}`);

  for (const star of STARS) {
    const maxLevel = starScaling[star].maxLevel;
    const cells = LEVELS.map((level) => {
      // 만렙을 넘는 칸은 측정하지 않는다 — 존재할 수 없는 개체다
      if (level > maxLevel) return '   --';
      const m = measure(star, level, floorId, N);
      return `${m.win.toFixed(0)}%`.padStart(5);
    });
    console.log(`  ★${star}   | ${cells.join(' ')}`);
  }

  /*
    승률만 보고 합격시키지 말 것 — 사망을 함께 봐야 한다(§5-22).
    Lv.1 열은 이 도구의 존재 이유이므로 사망·턴까지 펼쳐 보여준다.
  */
  console.log(`\n     Lv.1 상세 (소환 직후 = 가챠 산출물의 실제 전력)`);
  for (const star of STARS) {
    const m = measure(star, 1, floorId, N);
    console.log(
      `     ★${star} | 승률 ${m.win.toFixed(0).padStart(3)}%` +
      ` | 사망 ${m.death.toFixed(2)} | 턴 ${m.turn.toFixed(1)}`,
    );
  }
  console.log('');
}

/*
  ⚠️ 이 도구는 **소환 개체의 전력**만 잰다. 층 설계·연속 등반은 못 본다.
  `npm run sim`(층별)과 `climb-check.mts`(연속)를 대체하지 않는다 — 셋이 서로 다른 축이다.
*/
console.log(`  (sim·climb-check가 구조적으로 못 보는 축이다. 셋을 함께 볼 것)\n`);
