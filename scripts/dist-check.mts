import { derivePotential, potentialScore } from '../src/game/potential';

const N = 60000;
const S = [1, 2, 3, 4, 5, 6] as const;
const rows = Array.from({ length: N }, (_, i) => {
  const star = S[i % 6];
  return { star, score: potentialScore(derivePotential((i * 2654435761) >>> 0, star)) };
});
const desc = [...rows].map((r) => r.score).sort((a, b) => b - a);
const t5 = desc[Math.floor(N * 0.05)];
const b25 = desc[Math.floor(N * 0.75)];

console.log('잠재 계수 분포 (sigma=0.08, bias=+0.04)');
console.log(`  상위5% 컷 ${t5.toFixed(4)}   하위25% 컷 ${b25.toFixed(4)}`);
console.log('\n등급별');
for (const s of S) {
  const g = rows.filter((r) => r.star === s);
  const avg = g.reduce((a, b) => a + b.score, 0) / g.length;
  const top = (100 * g.filter((r) => r.score >= t5).length) / g.length;
  console.log(`  ★${s}: 평균 ${avg >= 0 ? '+' : ''}${avg.toFixed(4)}   상위5%내 ${top.toFixed(2)}%`);
}
const low = rows.filter((r) => r.star <= 2);
const high = rows.filter((r) => r.star >= 5);
console.log(`\n★1~2 중 잠재치 상위5% = ${((100 * low.filter((r) => r.score >= t5).length) / low.length).toFixed(2)}%  ← 잭팟 (목표 1~2%)`);
console.log(`★5~6 중 잠재치 하위25% = ${((100 * high.filter((r) => r.score <= b25).length) / high.length).toFixed(2)}%  ← 함정`);
console.log(`\n계수 범위: ${Math.min(...rows.map(r => r.score)).toFixed(3)} ~ ${Math.max(...rows.map(r => r.score)).toFixed(3)}`);
