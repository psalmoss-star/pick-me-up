/** 잠재치 비대칭 진단용 임시 스크립트 */
import { runEncounter } from '../src/game/encounter';
import { createRng } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData, FLOORS } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import { derivePotential, potentialScore } from '../src/game/potential';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number, seed?: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  seed, currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const floor6 = FLOORS[5];

/** 세 영웅 전원에게 동일한 고정 계수를 강제 주입한 파티로 승률을 잰다 */
function winRateAtFixedBonus(target: number, n = 400): number {
  // 목표 계수에 가장 가까운 시드를 찾아 쓴다 (계수를 직접 못 넣으므로)
  let bestSeed = 0, bestErr = Infinity;
  for (let s = 1; s < 40000; s++) {
    const sc = potentialScore(derivePotential(s, 2));
    const err = Math.abs(sc - target);
    if (err < bestErr) { bestErr = err; bestSeed = s; }
  }
  let wins = 0;
  for (let s = 0; s < n; s++) {
    const party = [
      hero(HERO.ashen, 2, 15, 1, bestSeed),
      hero(HERO.bulwark, 2, 15, 2, bestSeed),
      hero(HERO.tide, 3, 20, 3, bestSeed),
    ];
    const r = runEncounter({ party, floor: floor6, data: gameData, rng: createRng(s) });
    if (r.outcome === 'victory') wins++;
  }
  const actual = potentialScore(derivePotential(bestSeed, 2));
  console.log(`  계수 ${target >= 0 ? '+' : ''}${target.toFixed(2)} (실제 ${actual >= 0 ? '+' : ''}${actual.toFixed(3)}) → 승률 ${((wins / n) * 100).toFixed(1)}%`);
  return wins / n;
}

console.log('\n6층 승률 vs 잠재 계수 (전원 동일 계수, 400회)\n');
const lo = winRateAtFixedBonus(-0.20);
const mid = winRateAtFixedBonus(0.0);
const hi = winRateAtFixedBonus(+0.20);
console.log(`\n  하락폭 ${((mid - lo) * 100).toFixed(1)}p  vs  상승폭 ${((hi - mid) * 100).toFixed(1)}p`);
console.log('  → 하락폭이 크면 비대칭이 확인된 것 (기댓값 0이어도 평균 승률이 내려간다)\n');
