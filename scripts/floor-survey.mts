/**
 * 생성 층 난이도 분포 조사 — 진단 전용(표를 쓰지 않는다).
 *
 * `floor-tune.mts`는 **문제 층만** 보고한다("합격 변형 없음 1"). 그래서
 * "어디가 쉽고 어디가 어려운지"의 분포가 안 보인다 — 실제로 80층 중 52층이
 * 96% 초과인데 그 사실이 한 줄 괄호로만 나온다.
 *
 * 이 스크립트는 층별 승률·사망을 그대로 찍어 **구간별 분포**를 본다.
 * 판단(재추첨)은 하지 않는다. 그건 floor-tune의 일이다.
 *
 * 실행: npx tsx scripts/floor-survey.mts
 *       TUNE_N=200 npx tsx scripts/floor-survey.mts
 */
import { runEncounter } from '../src/game/encounter';
import { createRng } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import { HANDCRAFTED_UNTIL, TOWER_HEIGHT, generateFloor } from '../src/game/data/floorgen';
import { partyLimitAt } from '../src/game/data/party';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

const N = Number(process.env.TUNE_N ?? 80);

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

/** floor-tune.mts와 **같아야 한다.** 다르면 두 도구의 판단이 갈린다. */
const genParty = (fid: number): HeroInstance[] => {
  if (fid <= 40) return [hero(HERO.ashen, 5, 60, 1), hero(HERO.bulwark, 5, 60, 2), hero(HERO.tide, 5, 65, 3), hero(HERO.gale, 5, 60, 4), hero(HERO.banner, 5, 60, 5)];
  if (fid <= 60) return [hero(HERO.ashen, 5, 75, 1), hero(HERO.bulwark, 5, 75, 2), hero(HERO.tide, 5, 80, 3), hero(HERO.gale, 5, 75, 4), hero(HERO.banner, 5, 75, 5)];
  if (fid <= 80) return [hero(HERO.ashen, 6, 85, 1), hero(HERO.bulwark, 6, 85, 2), hero(HERO.tide, 6, 90, 3), hero(HERO.gale, 6, 85, 4), hero(HERO.banner, 6, 85, 5)];
  return [hero(HERO.ashen, 6, 95, 1), hero(HERO.bulwark, 6, 95, 2), hero(HERO.tide, 6, 99, 3), hero(HERO.gale, 6, 95, 4), hero(HERO.banner, 6, 95, 5)];
};

const altParty = (fid: number): HeroInstance[] => {
  if (fid <= 40) return [hero(HERO.gale, 5, 60, 4), hero(HERO.bolt, 5, 60, 5), hero(HERO.leech, 5, 65, 6), hero(HERO.thorn, 5, 60, 7), hero(HERO.cinder, 5, 60, 8)];
  if (fid <= 60) return [hero(HERO.gale, 5, 75, 4), hero(HERO.bolt, 5, 75, 5), hero(HERO.leech, 5, 80, 6), hero(HERO.thorn, 5, 75, 7), hero(HERO.cinder, 5, 75, 8)];
  if (fid <= 80) return [hero(HERO.gale, 6, 85, 4), hero(HERO.bolt, 6, 85, 5), hero(HERO.leech, 6, 90, 6), hero(HERO.thorn, 6, 85, 7), hero(HERO.cinder, 6, 85, 8)];
  return [hero(HERO.gale, 6, 95, 4), hero(HERO.bolt, 6, 99, 5), hero(HERO.leech, 6, 99, 6), hero(HERO.thorn, 6, 95, 7), hero(HERO.cinder, 6, 95, 8)];
};

/** 두 편성 중 **나쁜 쪽** — floor-tune과 같은 판단 */
function measure(fid: number) {
  const floor = generateFloor(fid);
  const one = (make: (f: number) => HeroInstance[]) => {
    let w = 0, d = 0;
    for (let s = 0; s < N; s++) {
      const r = runEncounter({ party: make(fid), floor, data: gameData, rng: createRng(s) });
      if (r.outcome === 'victory') w++;
      d += r.casualties.length;
    }
    return { win: (w / N) * 100, death: d / N };
  };
  const a = one(genParty), b = one(altParty);
  return a.win <= b.win ? a : b;
}

console.log(`\n  생성 층 난이도 분포 (표본 ${N}회, 두 편성 중 나쁜 쪽)\n`);

const buckets = [
  { label: '21~40', lo: 21, hi: 40 },
  { label: '41~60', lo: 41, hi: 60 },
  { label: '61~80', lo: 61, hi: 80 },
  { label: '81~100', lo: 81, hi: 100 },
];

for (const b of buckets) {
  const rows: { fid: number; win: number; death: number }[] = [];
  for (let fid = Math.max(b.lo, HANDCRAFTED_UNTIL + 1); fid <= Math.min(b.hi, TOWER_HEIGHT); fid++) {
    rows.push({ fid, ...measure(fid) });
  }
  const easy = rows.filter((r) => r.win > 96).length;
  const hard = rows.filter((r) => r.win < 55).length;
  const avgWin = rows.reduce((s, r) => s + r.win, 0) / rows.length;
  const avgDeath = rows.reduce((s, r) => s + r.death, 0) / rows.length;
  const maxD = partyLimitAt(b.lo) * 0.4;

  console.log(`  ── ${b.label} ─────────────────────────────`);
  console.log(`  평균 승률 ${avgWin.toFixed(0)}% · 평균 사망 ${avgDeath.toFixed(2)} (상한 ${maxD.toFixed(1)})`);
  console.log(`  96% 초과(쉬움) ${easy} / ${rows.length}   55% 미만(막힘) ${hard} / ${rows.length}`);
  // 눈에 띄는 층만 — 전부 찍으면 80줄이라 안 읽힌다
  const notable = rows.filter((r) => r.win < 80 || r.death > maxD * 0.5);
  if (notable.length > 0) {
    console.log('  주목:');
    for (const r of notable) {
      console.log(`    ${String(r.fid).padStart(3)}층  ${r.win.toFixed(0).padStart(3)}% / 사망 ${r.death.toFixed(2)}`);
    }
  }
  console.log('');
}
