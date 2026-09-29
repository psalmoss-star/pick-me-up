/**
 * 작전 카드 측정 — 카드 한 장씩 바꿨을 때 구간별 승률·사망·이탈이 얼마나 움직이는가.
 * 기획서 1단계 완료 기준 "카드별 승률 재측정". npx tsx scripts/orders-check.mts
 *
 * ── 무엇을 보는가 ─────────────────────────────────────
 * - 카드가 **거래**인가: 승률이 오르면 다른 것(사망·이탈)이 나빠져야 한다.
 *   모든 구간에서 모든 지표가 좋아지는 카드가 있으면 그게 유일한 최적해가 된다.
 * - 퇴각 카드는 사망을 이탈로 바꾼다. **사망 + 이탈**이 "잃은 전력"이다.
 *
 * ⚠️ 기준 파티는 `src/game/sim.ts`의 LOW/MID/HIGH/genParty와 같아야 비교가 성립한다.
 */
import { runEncounter } from '../src/game/encounter';
import { createRng } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData, FLOORS } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import {
  ATTACK_LABEL, DEFAULT_ORDERS, FALLBACK_LABEL, PROTECT_LABEL, type Orders,
} from '../src/game/orders';
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

const CARDS: Array<[string, Orders]> = [
  ['기본(카드 없음)', { ...DEFAULT_ORDERS }],
  ...(['weakest', 'strongest', 'backline'] as const).map((a): [string, Orders] =>
    [`공격 ${ATTACK_LABEL[a]}`, { ...DEFAULT_ORDERS, attack: a }]),
  ...(['healer', 'weakest'] as const).map((p): [string, Orders] =>
    [`보호 ${PROTECT_LABEL[p]}`, { ...DEFAULT_ORDERS, protect: p }]),
  ...(['hp50', 'hp30', 'hp15'] as const).map((f): [string, Orders] =>
    [`퇴각 ${FALLBACK_LABEL[f]}`, { ...DEFAULT_ORDERS, fallback: f }]),
];

function measure(band: Band, orders: Orders) {
  let wins = 0, deaths = 0, gone = 0, total = 0;
  for (const floor of band.floors) {
    const make = band.party(floor);
    for (let s = 0; s < band.n; s++) {
      const r = runEncounter({ party: make(), floor, data: gameData, rng: createRng(s), orders });
      if (r.outcome === 'victory') wins++;
      deaths += r.casualties.length;
      gone += r.withdrawn.length;
      total++;
    }
  }
  return { win: wins / total, deaths: deaths / total, gone: gone / total };
}

const w = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));

for (const band of BANDS) {
  console.log(`\n  ${band.name} — 층 ${band.floors.length}개 × ${band.n}회\n`);
  console.log(`  ${w('카드', 20)} 승률    Δ     사망   이탈   잃은 전력`);
  const base = measure(band, DEFAULT_ORDERS);
  for (const [name, orders] of CARDS) {
    const o = name.startsWith('기본') ? base : measure(band, orders);
    const d = (o.win - base.win) * 100;
    console.log(
      `  ${w(name, 20)} ${(o.win * 100).toFixed(0).padStart(3)}%  ` +
      `${(d >= 0 ? '+' : '') + d.toFixed(0)}`.padStart(4) + 'p  ' +
      `${o.deaths.toFixed(2)}   ${o.gone.toFixed(2)}   ${(o.deaths + o.gone).toFixed(2)}`,
    );
  }
}
console.log('');
