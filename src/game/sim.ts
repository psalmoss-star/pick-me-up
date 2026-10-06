/** 밸런싱용 시뮬레이터. npm run sim */
import { runEncounter } from './encounter';
import { createRng } from './rng';
import { klassFor } from './stats';
import { MISSION_LABEL } from './mission';
import { gameData as gameDataOn, gameDataNoTraits, FLOORS } from './data';
import type { FloorSpec } from './data/floors';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';
import { HERO } from './data/sample';

/** --no-traits — 계열 특성을 끈 번들로 잰다(특성 이전 기준선). 켠 것과의 차이를 볼 때만 쓴다 */
const gameData = process.argv.includes('--no-traits') ? gameDataNoTraits : gameDataOn;

const hero = (
  defId: HeroDefId, star: Star, level: number, n: number, seed?: number,
): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  seed, currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

/**
 * 기준 파티 — HANDOFF의 밸런스 표와 같은 구성이어야 비교가 성립한다.
 * 시드를 주지 않으므로 잠재 계수 0. 기준선은 개체차 없는 상태여야 한다.
 */
const party = () => [
  hero(HERO.ashen, 2, 15, 1),
  hero(HERO.bulwark, 2, 15, 2),
  hero(HERO.tide, 3, 20, 3),
];

/** 같은 구성에 개체 시드만 부여한 파티. 잠재치 영향 측정용. */
const seededParty = (s: number) => [
  hero(HERO.ashen, 2, 15, 1, (s * 2654435761) >>> 0),
  hero(HERO.bulwark, 2, 15, 2, (s * 40503 + 12345) >>> 0),
  hero(HERO.tide, 3, 20, 3, (s * 69069 + 1) >>> 0),
];

/**
 * 중층(7~12층) 기준 파티.
 * 6층 보스를 깬 시점에 합성/승급으로 도달 가능한 현실적 전력이며,
 * 저층 파티로 7층 이상을 재면 전멸이 나와 층 설계를 판단할 수 없다.
 */
const midParty = () => [
  hero(HERO.ashen, 3, 30, 1),
  hero(HERO.bulwark, 3, 30, 2),
  hero(HERO.tide, 3, 35, 3),
];

/**
 * 상층(13~20층) 기준 파티.
 * 12층 보스를 깬 시점에 도달 가능한 전력 — ★4 승급 + 레벨 50대를 가정한다.
 * 중층 파티로 상층을 재면 전멸이 나와 층 설계를 판단할 수 없다(중층 표와 같은 이유).
 */
const highParty = () => [
  hero(HERO.ashen, 4, 50, 1),
  hero(HERO.bulwark, 4, 50, 2),
  hero(HERO.tide, 4, 55, 3),
];

/**
 * 생성 구간용 기준 파티 — **5인이다**(`partyLimitAt(21) === 5`).
 *
 * 구간마다 전력이 다르므로 층 번호로 고른다 — 21층과 95층을 같은 파티로 재면
 * 한쪽은 전멸하고 한쪽은 100%가 나와 곡선을 판단할 수 없다.
 * (구간별 기준 파티가 다르다는 원칙은 저층/중층/상층에서 이미 세웠다.)
 *
 * ⚠️ **`scripts/floor-tune.mts`의 기준 파티와 반드시 같아야 한다.**
 * 튜너는 이 파티로 합격/불합격을 판정하고 sim은 그 결과를 표로 보여준다 —
 * 둘이 갈리면 "튜너는 합격시켰는데 sim에선 전멸"이 나고 원인을 못 찾는다(§5-28).
 *
 * 구성은 저층 3인(딜/탱/힐)에 딜러와 서포트를 하나씩 얹은 것이다.
 * 2군이 열리는 구간이라 실제 플레이도 역할이 갖춰진 5인에 가깝다.
 */
const genParty = (floorId: number) => {
  if (floorId <= 40) return [hero(HERO.ashen, 5, 60, 1), hero(HERO.bulwark, 5, 60, 2), hero(HERO.tide, 5, 65, 3), hero(HERO.gale, 5, 60, 4), hero(HERO.banner, 5, 60, 5)];
  if (floorId <= 60) return [hero(HERO.ashen, 5, 75, 1), hero(HERO.bulwark, 5, 75, 2), hero(HERO.tide, 5, 80, 3), hero(HERO.gale, 5, 75, 4), hero(HERO.banner, 5, 75, 5)];
  if (floorId <= 80) return [hero(HERO.ashen, 6, 85, 1), hero(HERO.bulwark, 6, 85, 2), hero(HERO.tide, 6, 90, 3), hero(HERO.gale, 6, 85, 4), hero(HERO.banner, 6, 85, 5)];
  return [hero(HERO.ashen, 6, 95, 1), hero(HERO.bulwark, 6, 95, 2), hero(HERO.tide, 6, 99, 3), hero(HERO.gale, 6, 95, 4), hero(HERO.banner, 6, 95, 5)];
};

export function floorWinRate(
  floor: FloorSpec, n = 500, makeParty: (s: number) => HeroInstance[] = party,
) {
  let wins = 0, deaths = 0, turns = 0;
  for (let s = 0; s < n; s++) {
    const r = runEncounter({ party: makeParty(s), floor, data: gameData, rng: createRng(s) });
    if (r.outcome === 'victory') wins++;
    deaths += r.casualties.length;
    turns += r.turnsElapsed;
  }
  return { win: wins / n, avgDeaths: deaths / n, avgTurns: turns / n };
}

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].length * 2));

const row = (floor: FloorSpec, makeParty?: (s: number) => HeroInstance[]) => {
  const o = floorWinRate(floor, 500, makeParty ?? party);
  const label = `${floor.id}층 ${floor.name}`;
  console.log(
    `  ${pad(label, 22)} [${MISSION_LABEL[floor.mission.kind]}] ` +
    `승률 ${(o.win * 100).toFixed(0).padStart(3)}% | ` +
    `사망 ${o.avgDeaths.toFixed(2)} | 턴 ${o.avgTurns.toFixed(1)}`,
  );
};

const LOW = FLOORS.filter((f) => f.id <= 6);
const MID = FLOORS.filter((f) => f.id > 6 && f.id <= 12);
const HIGH = FLOORS.filter((f) => f.id > 12 && f.id <= 20);
/**
 * 생성 구간(21~100)은 80층이라 전부 500회씩 돌리면 너무 느리다.
 * 구간의 성격을 보는 것이 목적이므로 **표본 층만** 잰다 —
 * 각 구간의 첫 층 / 중간 / 보스를 뽑는다.
 */
const SAMPLED = FLOORS.filter((f) => f.id > 20 && (f.id % 10 === 0 || f.id % 10 === 1 || f.id % 10 === 5));

console.log('\n  저층 (★2 Lv.15 + ★2 Lv.15 + ★3 Lv.20, 500회)\n');
for (const floor of LOW) row(floor);

// 중층은 성장한 파티를 전제로 설계했다. 저층 파티로 재면 의미가 없다.
console.log('\n  중층 (★3 Lv.30 + ★3 Lv.30 + ★3 Lv.35, 500회)\n');
for (const floor of MID) row(floor, midParty);

// 상층도 마찬가지 — 구간마다 기준 파티가 다르다는 것을 잊으면 표를 오독한다.
console.log('\n  상층 (★4 Lv.50 + ★4 Lv.50 + ★4 Lv.55, 500회)\n');
for (const floor of HIGH) row(floor, highParty);

/**
 * 생성 구간 — 표본만. 층마다 기준 파티가 다르므로 파티도 함께 표시한다.
 * 여기서 보려는 것은 개별 층의 정밀한 승률이 아니라 **곡선이 무너지지 않았는가**다.
 */
console.log('\n  생성 구간 21~100 (표본, 구간별 파티, 200회)\n');
for (const floor of SAMPLED) {
  const o = floorWinRate(floor, 200, () => genParty(floor.id));
  const label = `${floor.id}층 ${floor.name}`;
  console.log(
    `  ${pad(label, 24)} [${MISSION_LABEL[floor.mission.kind]}]` +
    `${floor.isBoss ? '★' : ' '} 승률 ${(o.win * 100).toFixed(0).padStart(3)}% | ` +
    `사망 ${o.avgDeaths.toFixed(2)} | 턴 ${o.avgTurns.toFixed(1)}`,
  );
}
// ------------------------------------------------------------
// 잠재치가 실제로 결과를 흔드는가
//
// 위 표는 시드 없는 영웅(계수 0)이므로 잠재치를 도입해도 변하지 않는다 — 그게 정상이다.
// 개체차가 유의미한지는 시드를 부여한 파티로 따로 재야 한다.
// ------------------------------------------------------------
console.log('\n  개체 시드 부여 시 (저층, 같은 구성, 잠재치만 다름)\n');
for (const floor of LOW) {
  const base = floorWinRate(floor);
  const seeded = floorWinRate(floor, 500, seededParty);
  const d = (seeded.win - base.win) * 100;
  const label = `${floor.id}층 ${floor.name}`;
  console.log(
    `  ${pad(label, 22)} 승률 ${(seeded.win * 100).toFixed(0).padStart(3)}% ` +
    `(기준 ${(base.win * 100).toFixed(0)}%, ${d >= 0 ? '+' : ''}${d.toFixed(1)}p) | ` +
    `사망 ${seeded.avgDeaths.toFixed(2)}`,
  );
}
console.log('');
