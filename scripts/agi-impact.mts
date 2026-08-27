/**
 * 버그 B 영향 측정 — 마르·예니를 실제로 전투에 세워 본다.
 *
 * sim·climb-check·fresh-check는 전부 ashen/bulwark/tide/gale/bolt·banner만 쓴다.
 * 마르(h_thorn)·예니(h_hush)를 **한 번도 안 밟는다** — 그래서 세 표가 전부
 * 정상인 채로 이 결함이 남아 있었다. 이 스크립트가 그 축을 본다.
 *
 * ── 왜 지우지 않는가 ─────────────────────────────────
 * 1회성 진단이 아니라 **상시 측정 수단**이다(climb-check.mts와 같은 성격).
 * 세 표가 안 보는 영웅이 있다는 사실 자체가 구조적이라, 마르·예니의 스탯이나
 * 성장 곡선을 만지면 여기서 다시 재야 한다.
 *
 * ── 실측 (2026-08-27, STEP 43) ───────────────────────
 *   마르 atk 138 → 180 (+30%) | 10층 73%/사망 1.36 → 86%/사망 0.99
 *   예니 atk  84 → 162 (+93%) | 10층  2%/사망 2.97 →  2%/사망 2.97 (불변)
 * 예니가 안 움직이는 것이 정상이다 — 스킬 둘 다 순수 디버프라 atk를 안 탄다.
 *
 * 실행: npx tsx scripts/agi-impact.mts
 */
import { runEncounter } from '../src/game/encounter';
import { createRng } from '../src/game/rng';
import { klassFor, computeHeroStats } from '../src/game/stats';
import { gameData } from '../src/game/data';
import { HERO, heroes } from '../src/game/data/sample';
import { FLOORS } from '../src/game/data/floors';
import { starScaling } from '../src/game/data/elements';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

const N = 500;
const THORN = 'h_thorn' as HeroDefId;
const HUSH = 'h_hush' as HeroDefId;

/** 시드를 주지 않는다 → 잠재 계수 0 (fresh-check·sim과 같은 판단) */
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

function measure(floorId: number, party: () => HeroInstance[]) {
  const floor = FLOORS[floorId - 1];
  let wins = 0;
  let deaths = 0;
  for (let s = 0; s < N; s++) {
    const r = runEncounter({ party: party(), floor, data: gameData, rng: createRng(s) });
    if (r.outcome === 'victory') wins++;
    deaths += r.casualties.length;
  }
  return { win: (wins / N) * 100, death: deaths / N };
}

console.log(`\n  마르·예니 실전 측정 (표본 ${N}회)\n`);

for (const [label, defId] of [['마르(h_thorn)', THORN], ['예니(h_hush)', HUSH]] as const) {
  const def = heroes[defId];
  const st = computeHeroStats(def, 3, 30, starScaling);
  console.log(`  ${label}  attackAttr=${def.attackAttr}  ★3 Lv.30 → atk ${st.atk} · spd ${st.spd}`);
}

console.log('\n  ── 딜러 자리를 갈아끼워 저층 승률 ──────────────');
console.log('  구성: [딜러] + 오르나(탱) + 세인(힐)  ★3 Lv.30\n');

const withDealer = (defId: HeroDefId) => () => [
  hero(defId, 3, 30, 1),
  hero(HERO.bulwark, 3, 30, 2),
  hero(HERO.tide, 3, 35, 3),
];

console.log('        카일(대조)      마르            예니');
for (const f of [6, 10, 12]) {
  const b = measure(f, withDealer(HERO.ashen));
  const t = measure(f, withDealer(THORN));
  const h = measure(f, withDealer(HUSH));
  const fmt = (r: { win: number; death: number }) =>
    `${r.win.toFixed(0).padStart(3)}%/사망 ${r.death.toFixed(2)}`;
  console.log(`  ${String(f).padStart(2)}층  ${fmt(b)}   ${fmt(t)}   ${fmt(h)}`);
}
console.log('');
