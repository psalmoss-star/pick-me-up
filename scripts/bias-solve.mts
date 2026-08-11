/** sigma=0.08 고정, 중심 이동(bias)을 찾아 승률 평균을 70%에 맞추는 임시 스크립트 */
import { runEncounter } from '../src/game/encounter';
import { createRng, STREAM, rngNormal, substream } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData, FLOORS } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import type { AttrKey, HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

const ATTR: AttrKey[] = ['str', 'int', 'vit', 'agi'];
const RHO = 0.3, SQ = 0.9539392, SHARED = 0.8660254, UNIQ = 0.5, SCALE = 0.585556;
const SIGMA = 0.08, CAP = 0.24;

function bonus(seed: number, star: Star, bias: number) {
  const rng = substream(seed, STREAM.POTENTIAL);
  const z1 = (star - 3.5) * SCALE;
  const shared = rngNormal(rng);
  const out = {} as Record<AttrKey, number>;
  for (const k of ATTR) {
    const z = RHO * z1 + SQ * (SHARED * shared + UNIQ * rngNormal(rng));
    out[k] = Math.min(CAP + bias, Math.max(-CAP + bias, z * SIGMA + bias));
  }
  return out;
}

const floor6 = FLOORS[5];
const H = (defId: HeroDefId, star: Star, lv: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level: lv, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

function meanWinRate(bias: number, parties = 32, trials = 300) {
  const rates: number[] = [];
  for (let p = 0; p < parties; p++) {
    const seeds = [(p * 2654435761) >>> 0, (p * 40503 + 12345) >>> 0, (p * 69069 + 1) >>> 0];
    const bs = seeds.map((s, i) => bonus(s, (i === 2 ? 3 : 2) as Star, bias));
    const ids = [HERO.ashen, HERO.bulwark, HERO.tide];
    const data = {
      ...gameData,
      heroes: Object.fromEntries(
        Object.entries(gameData.heroes).map(([id, def]: [string, any]) => {
          const idx = ids.indexOf(id as HeroDefId);
          if (idx < 0) return [id, def];
          const b = bs[idx];
          return [id, { ...def, baseCaps: Object.fromEntries(ATTR.map((k) => [k, def.baseCaps[k] * (1 + b[k])])) }];
        }),
      ),
    };
    let wins = 0;
    for (let s = 0; s < trials; s++) {
      const party = [H(HERO.ashen, 2, 15, 1), H(HERO.bulwark, 2, 15, 2), H(HERO.tide, 3, 20, 3)];
      if (runEncounter({ party, floor: floor6, data: data as any, rng: createRng(s) }).outcome === 'victory') wins++;
    }
    rates.push(wins / trials);
  }
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return { mean, min: Math.min(...rates), max: Math.max(...rates) };
}

console.log('\nsigma=0.08 고정, bias별 6층 승률 (목표 70%)\n');
console.log('  bias    평균승률   최저    최고');
for (const bias of [0, 0.01, 0.02, 0.03, 0.04]) {
  const r = meanWinRate(bias);
  console.log(`  +${bias.toFixed(2)}   ${(r.mean * 100).toFixed(1).padStart(5)}%   ${(r.min * 100).toFixed(0).padStart(3)}%   ${(r.max * 100).toFixed(0).padStart(3)}%`);
}
console.log('');
