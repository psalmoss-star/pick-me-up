/**
 * 구간 완주율이 왜 낮은가 — 산술 확인.
 *
 * 층별 승률은 평균 92~98%인데 구간 완주율은 18~20%다. 이 둘이 모순처럼 보이지만
 * **연속 등반은 곱셈**이다(climb-check.mts:157 — 한 번 지면 그 자리에서 끝난다).
 * 0.95^20 = 0.36. 즉 층별로 아무리 관대해도 20층을 이으면 이렇게 된다.
 *
 * 이 스크립트는 그 곱을 실제 측정값으로 계산해 **"층 난이도 문제인가,
 * 구간 길이 문제인가"**를 가른다. 진단 전용이며 아무것도 안 고친다.
 *
 * ⚠️ 이 구분이 중요한 이유: 예전 세션이 같은 표를 보고 "누적 소모"라고 진단했다가
 * 실측(전멸률 0% · 패배 시점 HP 95~98%)에 반증됐다. 원인을 틀리면 손잡이도 틀린다.
 *
 * 실행: npx tsx scripts/climb-math.mts
 */
import { runEncounter } from '../src/game/encounter';
import { createRng } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import { generateFloor } from '../src/game/data/floorgen';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

const N = Number(process.env.TUNE_N ?? 80);

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const genParty = (fid: number): HeroInstance[] => {
  if (fid <= 40) return [hero(HERO.ashen, 5, 60, 1), hero(HERO.bulwark, 5, 60, 2), hero(HERO.tide, 5, 65, 3), hero(HERO.gale, 5, 60, 4), hero(HERO.banner, 5, 60, 5)];
  if (fid <= 60) return [hero(HERO.ashen, 5, 75, 1), hero(HERO.bulwark, 5, 75, 2), hero(HERO.tide, 5, 80, 3), hero(HERO.gale, 5, 75, 4), hero(HERO.banner, 5, 75, 5)];
  if (fid <= 80) return [hero(HERO.ashen, 6, 85, 1), hero(HERO.bulwark, 6, 85, 2), hero(HERO.tide, 6, 90, 3), hero(HERO.gale, 6, 85, 4), hero(HERO.banner, 6, 85, 5)];
  return [hero(HERO.ashen, 6, 95, 1), hero(HERO.bulwark, 6, 95, 2), hero(HERO.tide, 6, 99, 3), hero(HERO.gale, 6, 95, 4), hero(HERO.banner, 6, 95, 5)];
};

/** 기준 파티 단독 승률 — climb-check가 실제로 쓰는 편성에 가깝다 */
function winRate(fid: number): number {
  const floor = generateFloor(fid);
  let w = 0;
  for (let s = 0; s < N; s++) {
    const r = runEncounter({ party: genParty(fid), floor, data: gameData, rng: createRng(s) });
    if (r.outcome === 'victory') w++;
  }
  return w / N;
}

console.log(`\n  구간 완주율 = 층별 승률의 곱 (표본 ${N}회)\n`);
console.log('  구간      | 층수 | 평균 승률 | 최저 층      | 곱(예측 완주율)');

for (const [lo, hi] of [[21, 40], [41, 60], [61, 80], [81, 100]] as const) {
  const rates: { fid: number; p: number }[] = [];
  for (let fid = lo; fid <= hi; fid++) rates.push({ fid, p: winRate(fid) });

  const product = rates.reduce((s, r) => s * r.p, 1);
  const avg = rates.reduce((s, r) => s + r.p, 0) / rates.length;
  const worst = rates.reduce((a, b) => (a.p <= b.p ? a : b));

  console.log(
    `  ${lo}~${hi}`.padEnd(11) +
    `| ${String(rates.length).padStart(4)} ` +
    `| ${(avg * 100).toFixed(0).padStart(8)}% ` +
    `| ${String(worst.fid).padStart(3)}층 ${(worst.p * 100).toFixed(0).padStart(3)}% ` +
    `| ${(product * 100).toFixed(0).padStart(6)}%`,
  );
}

console.log('\n  참고 — 평균 승률이 p인 층 20개를 이었을 때의 완주율');
for (const p of [0.90, 0.93, 0.95, 0.97, 0.98, 0.99]) {
  console.log(`    p=${(p * 100).toFixed(0)}%  →  ${(Math.pow(p, 20) * 100).toFixed(0)}%`);
}
console.log('');
