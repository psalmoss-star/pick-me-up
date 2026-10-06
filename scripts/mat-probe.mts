/**
 * 재료 수급 측정 — `npx tsx scripts/mat-probe.mts`
 *
 * 층을 **한 번씩만** 돌파했을 때 단계(10층)마다 쌓이는 재료의 평균(200시드).
 * 재련 비용(`data/recipes.ts`의 REFINE_MATERIALS)의 근거다 — 한 벌 비용을 구간 수급 옆에 찍는다.
 * 모험·재도전은 넣지 않는다(그건 "두 번째 영웅부터"의 몫이다).
 *
 * ⚠️ 실제 전리품은 회수 → 장비 → 재료 순으로 한 난수를 나눠 쓴다. 여기서는 재료만 따로 굴리므로
 * 개별 판은 실제와 다르지만 평균은 같다(재료 판정은 앞 소비와 독립이다).
 */
import { createRng } from '../src/game/rng';
import { rollMaterials } from '../src/game/loot';
import { FLOORS } from '../src/game/data/floors';
import { TIER_COUNT, tierOf, GEAR_SLOTS } from '../src/game/data/gear';
import { MATERIAL_ORDER, MATERIAL_DEFS } from '../src/game/data/materials';
import { REFINE_MATERIALS } from '../src/game/data/recipes';
import type { MaterialBag, MaterialId } from '../src/game/types';

const SEEDS = 200;
const sum: Record<number, Record<string, number>> = {};
for (let t = 1; t <= TIER_COUNT; t++) sum[t] = Object.fromEntries(MATERIAL_ORDER.map((id) => [id, 0]));

for (let seed = 1; seed <= SEEDS; seed++) {
  for (const f of FLOORS) {
    const rng = createRng((seed * 7919 + f.id * 104729) >>> 0);
    const drop = rollMaterials(f.id, !!f.isBoss, rng);
    for (const [id, n] of Object.entries(drop) as [MaterialId, number][]) sum[tierOf(f.id)][id] += n;
  }
}

const setCost: MaterialBag = {};
for (const slot of GEAR_SLOTS) {
  for (const [id, n] of Object.entries(REFINE_MATERIALS[slot]) as [MaterialId, number][]) {
    setCost[id] = (setCost[id] ?? 0) + n;
  }
}

const name = (id: MaterialId) => MATERIAL_DEFS[id].name;
console.log(`\n  단계별 재료 수급 (층당 1회 돌파, ${SEEDS}시드 평균)\n`);
console.log(`  단계 | ${MATERIAL_ORDER.map((id) => name(id).padEnd(8)).join(' | ')}`);
for (let t = 1; t <= TIER_COUNT; t++) {
  console.log(`  ${String(t).padStart(2)}   | ${MATERIAL_ORDER.map((id) => (sum[t][id] / SEEDS).toFixed(1).padEnd(10)).join(' | ')}`);
}
console.log(`\n  재련 한 벌(3종) 비용: ${MATERIAL_ORDER.map((id) => `${name(id)} ${setCost[id] ?? 0}`).join(' · ')}`);
console.log('  단계 | 재료별 비용/수급 (3단계 이후 — 재련이 열리는 구간)');
for (let t = 3; t <= TIER_COUNT; t++) {
  const cells = MATERIAL_ORDER.map((id) => {
    const supply = sum[t][id] / SEEDS;
    return `${name(id)} ${((setCost[id] ?? 0) / supply * 100).toFixed(0)}%`;
  });
  console.log(`  ${String(t).padStart(2)}   | ${cells.join(' · ')}`);
}
