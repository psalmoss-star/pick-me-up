/**
 * 계열 특성 측정 — 특성을 하나씩만 켜서 승률·사망이 얼마나 움직이는지 잰다(STEP 69).
 *
 *   npx tsx scripts/trait-check.mts            # 현행 수치
 *   TRAIT_N=200 npx tsx scripts/trait-check.mts # 정밀
 *
 * 왜 따로 있나: `sim`·`climb-check`의 기준 파티는 검사·수호자·사제·척후·지휘관뿐이라
 * **술사·사냥꾼의 특성을 아예 밟지 않는다**(`floor-tune`의 대체 편성에만 있다).
 * 표가 안 움직이는 것은 특성이 약하다는 뜻이 아니라 그 영웅이 표에 없다는 뜻이다.
 *
 * 읽는 법: 각 칸은 "끔" 대비 변화량(승률 %p / 사망). 특성 하나가 혼자 +10%p를 넘기면
 * 그 계열이 편성의 정답이 된다 — 일곱이 비슷한 크기여야 한다.
 */
import { runEncounter } from '../src/game/encounter';
import { createRng } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameDataNoTraits, FLOORS } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import { LINEAGE_TRAITS, TRAIT_NAME, type LineageTraits } from '../src/game/data/traits';
import { LINEAGES, LINEAGE_KR } from '../src/game/data/lineages';
import { refPartyAt } from '../src/game/data/refParty';
import type { BattleData } from '../src/game/battle';
import type { HeroDefId, HeroInstId, HeroInstance, Lineage, Star } from '../src/game/types';

const N = Number(process.env.TRAIT_N ?? 80);

/** 아무 일도 하지 않는 특성 — 여기서 하나씩만 실제 수치로 바꿔 끼운다 */
const NEUTRAL: LineageTraits = {
  blade: { hpBelow: 0, damageMult: 1 },
  guardian: { damageTakenMult: 1 },
  priest: { overflowToShield: 0, shieldCapRatio: 0 },
  mage: { multiTargetMult: 1 },
  hunter: { afflictedMult: 1 },
  scout: { turns: 0, spdMult: 1, damageMult: 1 },
  commander: { allyAtkMult: 1 },
};
const only = (l: Lineage): LineageTraits => ({ ...NEUTRAL, [l]: LINEAGE_TRAITS[l] });
const withTraits = (traits: LineageTraits) => ({ ...gameDataNoTraits, traits }) as BattleData;

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

/** `floor-tune`의 대체 편성과 같다 — 술사·사냥꾼이 여기에만 있다 */
const altPartyAt = (fid: number): HeroInstance[] => {
  const [star, lv, hi]: [Star, number, number] =
    fid <= 6 ? [2, 15, 20] : fid <= 12 ? [3, 30, 35] : fid <= 20 ? [4, 50, 55]
    : fid <= 40 ? [5, 60, 65] : fid <= 60 ? [5, 75, 80] : fid <= 80 ? [6, 85, 90] : [6, 95, 99];
  const five = [
    hero(HERO.gale, star, lv, 4), hero(HERO.bolt, star, lv, 5), hero(HERO.leech, star, hi, 6),
    hero(HERO.thorn, star, lv, 7), hero(HERO.cinder, star, lv, 8),
  ];
  // 20층까지는 정원이 3이다 — 사냥꾼·술사·사제를 남긴다(이 표가 재려는 두 계열)
  return fid <= 20 ? [five[3], five[4], five[2]] : five;
};

interface Row { win: number; death: number }
function measure(floors: number[], make: (fid: number) => HeroInstance[], data: BattleData): Row {
  let w = 0, d = 0, n = 0;
  for (const fid of floors) {
    const floor = FLOORS[fid - 1];
    for (let s = 0; s < N; s++) {
      const r = runEncounter({ party: make(fid), floor, data, rng: createRng(s) });
      if (r.outcome === 'victory') w++;
      d += r.casualties.length;
      n++;
    }
  }
  return { win: (w / n) * 100, death: d / n };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const GROUPS: Array<{ name: string; floors: number[]; make: (f: number) => HeroInstance[] }> = [
  { name: '손층 6~20 · 기준 파티(검·수·사)', floors: range(6, 20), make: refPartyAt },
  { name: '손층 6~20 · 대체(냥·술·사)', floors: range(6, 20), make: altPartyAt },
  { name: '손층 6~20 · 척·지·사', floors: range(6, 20), make: (f) => { const [s, lv, hi]: [Star, number, number] = f <= 6 ? [2, 15, 20] : f <= 12 ? [3, 30, 35] : [4, 50, 55]; return [hero(HERO.gale, s, lv, 1), hero(HERO.banner, s, lv, 2), hero(HERO.tide, s, hi, 3)]; } },
  { name: '생성 21~100 · 기준(검·수·사·척·지)', floors: range(21, 100), make: refPartyAt },
  { name: '생성 21~100 · 대체(척·검·사·냥·술)', floors: range(21, 100), make: altPartyAt },
];

const fmt = (r: Row, base: Row) =>
  `${(r.win - base.win >= 0 ? '+' : '') + (r.win - base.win).toFixed(1)}p/${(r.death - base.death >= 0 ? '+' : '') + (r.death - base.death).toFixed(2)}`;

console.log(`\n  계열 특성 — 하나씩만 켰을 때의 변화 (층당 ${N}회, 끔 대비 승률 %p / 사망)\n`);
for (const g of GROUPS) {
  const off = measure(g.floors, g.make, gameDataNoTraits);
  console.log(`  ${g.name}   — 끔: 승률 ${off.win.toFixed(1)}% · 사망 ${off.death.toFixed(2)}`);
  for (const l of LINEAGES) {
    const r = measure(g.floors, g.make, withTraits(only(l)));
    console.log(`    ${(LINEAGE_KR[l] + ' ' + TRAIT_NAME[l]).padEnd(14, '　')} ${fmt(r, off)}`);
  }
  const all = measure(g.floors, g.make, withTraits(LINEAGE_TRAITS));
  console.log(`    ${'전부'.padEnd(14, '　')} ${fmt(all, off)}   → 승률 ${all.win.toFixed(1)}% · 사망 ${all.death.toFixed(2)}\n`);
}
