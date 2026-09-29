/**
 * 책략 카드 측정 — 카드마다 구간별 승률·사망·발동률·성공률. npx tsx scripts/stratagem-check.mts
 *
 * ── 합격 기준 (계획서, 2026-09-29) ──────────────────────
 * 1. 독주 금지: 어떤 카드도 **모든 구간에서** 승률↑·사망↓가 동시에 나오면 안 되고,
 *    카드 단독 승률 이득은 구간 평균 +10p 이내.
 * 2. 간파가 아프다: 간파가 난 판의 사망이 기준(카드 없음)보다 높은 구간이 있어야 한다.
 * 3. 성공률: 일반 층 55~70%, 보스 층은 그보다 10~15p 낮게.
 *
 * ⚠️ 기준 파티는 `src/game/sim.ts`와 같아야 비교가 성립한다 (`orders-check.mts`와 같은 표).
 */
import { runEncounter } from '../src/game/encounter';
import { createRng, substream, STREAM } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData, FLOORS } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import { STRATAGEMS, type StratagemId } from '../src/game/data/stratagems';
import type { FloorSpec } from '../src/game/data/floors';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

const trio = (s1: Star, l1: number, s2: Star, l2: number, s3: Star, l3: number) => () => [
  hero(HERO.ashen, s1, l1, 1), hero(HERO.bulwark, s2, l2, 2), hero(HERO.tide, s3, l3, 3),
];

const genParty = (floorId: number) => () => {
  const [s, l, lh]: [Star, number, number] =
    floorId <= 40 ? [5, 60, 65] : floorId <= 60 ? [5, 75, 80] : floorId <= 80 ? [6, 85, 90] : [6, 95, 99];
  return [
    hero(HERO.ashen, s, l, 1), hero(HERO.bulwark, s, l, 2), hero(HERO.tide, s, lh, 3),
    hero(HERO.gale, s, l, 4), hero(HERO.banner, s, l, 5),
  ];
};

interface Band { name: string; floors: FloorSpec[]; party: (f: FloorSpec) => () => HeroInstance[]; n: number }

const BANDS: Band[] = [
  { name: '저층 1~6', floors: FLOORS.filter((f) => f.id <= 6), party: () => trio(2, 15, 2, 15, 3, 20), n: 300 },
  { name: '중층 7~12', floors: FLOORS.filter((f) => f.id > 6 && f.id <= 12), party: () => trio(3, 30, 3, 30, 3, 35), n: 300 },
  { name: '상층 13~20', floors: FLOORS.filter((f) => f.id > 12 && f.id <= 20), party: () => trio(4, 50, 4, 50, 4, 55), n: 300 },
  {
    name: '생성 21~100(표본)',
    floors: FLOORS.filter((f) => f.id > 20 && (f.id % 10 === 0 || f.id % 10 === 1 || f.id % 10 === 5)),
    party: (f) => genParty(f.id), n: 100,
  },
];

interface Stat {
  win: number; deaths: number; fired: number; ok: number;
  okBoss: number; firedBoss: number; failDeaths: number; failGames: number;
}

function measure(band: Band, ids: StratagemId[]): Stat {
  const st: Stat = { win: 0, deaths: 0, fired: 0, ok: 0, okBoss: 0, firedBoss: 0, failDeaths: 0, failGames: 0 };
  let total = 0;
  for (const floor of band.floors) {
    const make = band.party(floor);
    const boss = !!floor.isBoss;
    for (let s = 0; s < band.n; s++) {
      const r = runEncounter({
        party: make(), floor, data: gameData, rng: createRng(s),
        stratagems: ids.length ? { ids, rng: substream(s, STREAM.STRATAGEM) } : undefined,
      });
      total++;
      if (r.outcome === 'victory') st.win++;
      st.deaths += r.casualties.length;
      const ev = r.events.filter((e) => e.type === 'stratagem');
      for (const e of ev) {
        if (boss) { st.firedBoss++; if (e.success) st.okBoss++; } else { st.fired++; if (e.success) st.ok++; }
      }
      if (ev.some((e) => !e.success)) { st.failGames++; st.failDeaths += r.casualties.length; }
    }
  }
  return { ...st, win: st.win / total, deaths: st.deaths / total, fired: st.fired, ok: st.ok };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(4);
const rate = (a: number, b: number) => (b === 0 ? '  --' : pct(a / b));
const w = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));

const gains: Record<string, number[]> = {};

for (const band of BANDS) {
  const base = measure(band, []);
  console.log(`\n  ${band.name} — 층 ${band.floors.length}개 × ${band.n}회   기준 승률 ${pct(base.win)} · 사망 ${base.deaths.toFixed(2)}\n`);
  console.log(`  ${w('카드', 14)} 승률    Δ    사망   발동  성공(일반/보스)  간파판 사망`);
  for (const s of STRATAGEMS) {
    const o = measure(band, [s.id]);
    const d = (o.win - base.win) * 100;
    (gains[s.name] ??= []).push(d);
    const fired = o.fired + o.firedBoss;
    const games = band.floors.length * band.n;
    console.log(
      `  ${w(s.name, 14)} ${pct(o.win)}  ${((d >= 0 ? '+' : '') + d.toFixed(0)).padStart(4)}p  ` +
      `${o.deaths.toFixed(2)}  ${pct(fired / games)}   ${rate(o.ok, o.fired)} / ${rate(o.okBoss, o.firedBoss)}      ` +
      `${o.failGames ? (o.failDeaths / o.failGames).toFixed(2) : ' -- '}`,
    );
  }
}

console.log('\n  카드별 구간 평균 승률 이득 (기준: +10p 이내)\n');
for (const [name, g] of Object.entries(gains)) {
  const avg = g.reduce((a, b) => a + b, 0) / g.length;
  console.log(`  ${w(name, 14)} ${((avg >= 0 ? '+' : '') + avg.toFixed(1)).padStart(6)}p   [${g.map((x) => x.toFixed(0)).join(', ')}]`);
}
console.log('');
