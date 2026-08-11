import { estimatePotential } from '../src/game/reveal';
import { derivePotential, potentialScore } from '../src/game/potential';
import { klassFor } from '../src/game/stats';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

const mk = (seed: number, p: number, star: Star): HeroInstance => ({
  instId: 'i' as HeroInstId, defId: 'd' as HeroDefId, star, klass: klassFor(star),
  level: 10, exp: 0, seed, revealProgress: p, currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

// 잭팟(★1인데 잠재치 높음)과 함정(★5인데 낮음)을 찾아 발굴 과정을 보여준다
let jackpot = 0, trap = 0;
for (let s = 1; s < 200000; s++) {
  if (!jackpot && potentialScore(derivePotential(s, 1)) > 0.16) jackpot = s;
  if (!trap && potentialScore(derivePotential(s, 5)) < -0.05) trap = s;
  if (jackpot && trap) break;
}

for (const [name, seed, star] of [
  ['★1 잭팟', jackpot, 1],
  ['★5 함정', trap, 5],
] as const) {
  const truth = potentialScore(derivePotential(seed, star as Star));
  console.log(`\n${name}  (참값 ${truth >= 0 ? '+' : ''}${truth.toFixed(3)})`);
  for (const p of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) {
    const e = estimatePotential(mk(seed, p, star as Star));
    const r = e.range ? ` [${e.range.low >= 0 ? '+' : ''}${e.range.low.toFixed(3)} ~ ${e.range.high >= 0 ? '+' : ''}${e.range.high.toFixed(3)}]` : '';
    console.log(`  발굴 ${(p * 100).toFixed(0).padStart(3)}%  ${e.label}${r}`);
  }
}
console.log('');
