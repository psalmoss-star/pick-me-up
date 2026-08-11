/** sigma 후보별 6층 승률 분포 진단용 임시 스크립트 */
import { runEncounter } from '../src/game/encounter';
import { createRng, STREAM, rngNormal, substream } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData, FLOORS } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import type { AttrKey, HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

const ATTR: AttrKey[] = ['str', 'int', 'vit', 'agi'];
const RHO = 0.3, SQ = 0.9539392, SHARED = 0.8660254, UNIQ = 0.5, SCALE = 0.585556;

/** potential.ts와 동일한 구성법이지만 sigma를 인자로 받는다 */
function bonusWithSigma(seed: number, star: Star, sigma: number, cap: number) {
  const rng = substream(seed, STREAM.POTENTIAL);
  const z1 = (star - 3.5) * SCALE;
  const shared = rngNormal(rng);
  const out = {} as Record<AttrKey, number>;
  for (const k of ATTR) {
    const z = RHO * z1 + SQ * (SHARED * shared + UNIQ * rngNormal(rng));
    out[k] = Math.min(cap, Math.max(-cap, z * sigma));
  }
  return out;
}

const floor6 = FLOORS[5];
const heroOf = (defId: HeroDefId, star: Star, lv: number, n: number, seed?: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level: lv, exp: 0,
  seed, currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

/**
 * capsFor에 계수를 직접 못 넣으므로, sigma를 바꾼 값이 나오는 시드를 못 찾는다.
 * 대신 baseCaps를 직접 스케일한 가짜 HeroDef로 같은 효과를 만든다.
 */
function winRate(sigma: number, cap: number, trials = 300): { mean: number; min: number; max: number } {
  const rates: number[] = [];
  for (let p = 0; p < 24; p++) {
    const seeds = [(p * 2654435761) >>> 0, (p * 40503 + 12345) >>> 0, (p * 69069 + 1) >>> 0];
    const bonuses = seeds.map((s, i) => bonusWithSigma(s, (i === 2 ? 3 : 2) as Star, sigma, cap));
    const data = {
      ...gameData,
      heroes: Object.fromEntries(
        Object.entries(gameData.heroes).map(([id, def]: [string, any]) => {
          const idx = [HERO.ashen, HERO.bulwark, HERO.tide].indexOf(id as HeroDefId);
          if (idx < 0) return [id, def];
          const b = bonuses[idx];
          return [id, {
            ...def,
            baseCaps: Object.fromEntries(
              ATTR.map((k) => [k, def.baseCaps[k] * (1 + b[k])]),
            ),
          }];
        }),
      ),
    };
    let wins = 0;
    for (let s = 0; s < trials; s++) {
      const party = [
        heroOf(HERO.ashen, 2, 15, 1), heroOf(HERO.bulwark, 2, 15, 2), heroOf(HERO.tide, 3, 20, 3),
      ];
      const r = runEncounter({ party, floor: floor6, data: data as any, rng: createRng(s) });
      if (r.outcome === 'victory') wins++;
    }
    rates.push(wins / trials);
  }
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return { mean, min: Math.min(...rates), max: Math.max(...rates) };
}

console.log('\n6층 승률 (기준 70%) — sigma별 파티 24종\n');
console.log('  sigma  cap    평균승률   최저    최고');
for (const [sigma, cap] of [[0.18, 0.55], [0.12, 0.36], [0.08, 0.24], [0.06, 0.18], [0.04, 0.12]] as const) {
  const r = winRate(sigma, cap);
  console.log(
    `  ${sigma.toFixed(2)}   ${cap.toFixed(2)}   ` +
    `${(r.mean * 100).toFixed(1).padStart(5)}%   ${(r.min * 100).toFixed(0).padStart(3)}%   ${(r.max * 100).toFixed(0).padStart(3)}%`,
  );
}
console.log('');
