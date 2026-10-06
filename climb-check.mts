/**
 * 연속 등반 측정 — 층간 HP 유지의 영향과 숙소 회복률을 잰다.
 *
 * `npm run sim`은 매 층을 currentHp:0(만피)으로 **독립** 측정하므로
 * 층간 HP 유지를 켜도 표가 미동도 하지 않는다 (HANDOFF §5-7/§5-9와 같은 사각지대).
 * 여기서는 1층부터 실제로 이어서 오르며 잔여 HP를 다음 층으로 넘긴다.
 *
 * 목적: 숙소(층간 회복) 수치를 정하기 위해, 회복률별로 등반이 어디서 끊기는지 본다.
 */
import { runEncounter } from './src/game/encounter';
import { createRng } from './src/game/rng';
import { klassFor, statsOfInstance } from './src/game/stats';
import { gameData, FLOORS } from './src/game/data';
import { HERO } from './src/game/data/sample';
import { restHealRate, FACILITY_MAX_LEVEL } from './src/game/data/facilities';
import { floorRewards } from './src/game/data/floors';
import { partyLimitAt } from './src/game/data/party';
import { gainExp } from './src/game/progression';
import type {
  GearInstance, GearInstId, GearSlot, HeroDefId, HeroInstId, HeroInstance, Star,
} from './src/game/types';
import { GEAR_DEFS, ladderSet, tierOf } from './src/game/data/gear';
import { makeGear } from './src/game/gear';

/**
 * --gear supply|elite — 기준 파티가 **층의 단계에 맞는 한 벌**을 입고 오른다(장비 사다리 측정).
 * 옵션이 없으면 지금과 같다(장비 없음 = 층 난이도 기준선). 기준선을 바꾸지 말 것.
 */
const GEAR_ARG = process.argv.includes('--gear')
  ? (process.argv[process.argv.indexOf('--gear') + 1] as 'supply' | 'elite' | 'relic' | 'relic1')
  : null;

/**
 * --gear relic|relic1 — 유물 한 벌(제작 3종)이 사다리 옆에서 얼마나 센지 재는 측정.
 * 유물은 단계가 없으므로 재료가 모이는 21층부터 입힌 것으로 치고, 그 전은 정예다.
 * relic = 전원(상한), relic1 = 첫 출전자 1명만(30층까지 재료로 닿는 현실적인 양), 나머지는 정예.
 */
const RELIC_FROM = 21;
const RELIC_SET = Object.values(GEAR_DEFS).filter((d) => d.line === 'relic');

/** 단계별 한 벌 인벤토리 — 영웅마다 같은 장비를 따로 입힌 것으로 친다(인스턴스 id만 다르게) */
function gearUp(
  roster: HeroInstance[], floorId: number,
): { party: HeroInstance[]; inventory?: Map<GearInstId, GearInstance> } {
  if (!GEAR_ARG) return { party: roster };
  const relicMode = GEAR_ARG === 'relic' || GEAR_ARG === 'relic1';
  const ladder = ladderSet(tierOf(floorId), relicMode ? 'elite' : GEAR_ARG);
  const inventory = new Map<GearInstId, GearInstance>();
  const party = roster.map((h, i) => {
    const gear: Partial<Record<GearSlot, GearInstId>> = {};
    const wearsRelic = relicMode && floorId >= RELIC_FROM && (GEAR_ARG === 'relic' || i === 0);
    const set = wearsRelic ? RELIC_SET : ladder;
    set.forEach((d, k) => {
      const g = { ...makeGear(d.id, i * 3 + k + 1), equippedBy: h.instId };
      inventory.set(g.instId, g);
      gear[d.slot] = g.instId;
    });
    return { ...h, gear };
  });
  return { party, inventory };
}

const hero = (
  defId: HeroDefId, star: Star, level: number, n: number,
): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

/**
 * 로스터 = 출전 3인 + 대기 3인.
 *
 * 앞의 3명은 sim.ts의 기준 파티와 **같은 구성이어야** 층별 표와 비교가 성립한다.
 * 뒤는 실제 게임의 대기 인원(초기 로스터 6인, 저층 정원은 3)을 반영한 것으로,
 * 사망자가 나왔을 때 빈자리를 채운다. 대기 인원 없이 재면 사망 한 번이 곧 실패가 되어
 * 완주율이 실제보다 훨씬 낮게 나온다(중층 0% → 이게 원인이었다).
 *
 * ⚠️ **대기 인원을 `initialRoster()`의 실제 등급으로 올리지 말 것.**
 * 실제 로스터의 gale/bolt는 ★4 Lv.30 / ★5 Lv.40이라 출전 3인보다 강하다.
 * 그대로 넣었더니 선발 기준(HP 비율 높은 순) 때문에 **회복률이 낮을수록 완주율이
 * 오르는 역전**이 났다 — 앞 3인이 다쳐 뒤로 밀리면 더 강한 대기 인원이 나가서다
 * (실측: 숙소 Lv.0 100% > Lv.3 96% > 전회복 84%).
 *
 * 이 도구가 재는 것은 "sim 기준 파티로 구간을 이어 오를 수 있는가"이므로
 * 대기는 **빈자리를 메우되 주력을 밀어내지 않는** 전력이어야 한다.
 * 실제 로스터와 다른 것은 그래서이고, 의도된 차이다.
 */
const party = (): HeroInstance[] => [
  hero(HERO.ashen, 2, 15, 1),
  hero(HERO.bulwark, 2, 15, 2),
  hero(HERO.tide, 3, 20, 3),
  hero(HERO.gale, 2, 15, 4),
  hero(HERO.bolt, 2, 15, 5),
  hero(HERO.banner, 2, 15, 6),
];

const midParty = (): HeroInstance[] => [
  hero(HERO.ashen, 3, 30, 1),
  hero(HERO.bulwark, 3, 30, 2),
  hero(HERO.tide, 3, 35, 3),
  hero(HERO.gale, 3, 30, 4),
  hero(HERO.bolt, 3, 30, 5),
];

const highParty = (): HeroInstance[] => [
  hero(HERO.ashen, 4, 50, 1),
  hero(HERO.bulwark, 4, 50, 2),
  hero(HERO.tide, 4, 55, 3),
  hero(HERO.gale, 4, 50, 4),
  hero(HERO.bolt, 4, 50, 5),
];

/**
 * 생성 구간(21~100) 기준 파티 — **`sim.ts`의 `genParty`와 같은 전력**이어야 한다.
 *
 * sim 표와 이 표를 나란히 놓고 "층별로는 되는데 이어서 오르면 안 된다"를 판단하는 게
 * 목적이므로, 두 도구의 전력 가정이 다르면 비교 자체가 성립하지 않는다.
 * 다만 여기서는 뒤에 **대기 2인**을 붙인다 — 사망 시 빈자리를 채우는 실제 플레이를
 * 반영하지 않으면 완주율이 실제보다 훨씬 낮게 나온다(위 `party` 주석 참조).
 *
 * ⚠️ **로스터는 7인이다**(출전 5 + 대기 2). 정원이 5로 늘었으므로 5인 로스터로 재면
 * 대기가 0이 되어 사망 한 번이 곧 영구 결손이 된다 — 저층에서 "정원 3 + 대기 2"로
 * 재던 것과 조건이 달라져 비교가 성립하지 않는다(§5-23: 측정 도구가 실제 플레이와
 * 다르면 없는 문제를 만들어낸다). 2군이 열리는 구간이라 실제 로스터는 8인 이상이다.
 *
 * ⚠️ `sim.ts`의 `genParty`를 고치면 여기도 같이 고칠 것 — **앞 5인**이 그것과 같아야
 * 한다. 값을 복제하는 이유는 sim이 CLI 전용 모듈이라 import하면 순환이 생기기 때문이다.
 */
const genParty = (floorId: number): HeroInstance[] => {
  if (floorId <= 40) return [
    hero(HERO.ashen, 5, 60, 1), hero(HERO.bulwark, 5, 60, 2), hero(HERO.tide, 5, 65, 3),
    hero(HERO.gale, 5, 60, 4), hero(HERO.banner, 5, 60, 5),
    hero(HERO.bolt, 5, 60, 6), hero(HERO.leech, 5, 60, 7),
  ];
  if (floorId <= 60) return [
    hero(HERO.ashen, 5, 75, 1), hero(HERO.bulwark, 5, 75, 2), hero(HERO.tide, 5, 80, 3),
    hero(HERO.gale, 5, 75, 4), hero(HERO.banner, 5, 75, 5),
    hero(HERO.bolt, 5, 75, 6), hero(HERO.leech, 5, 75, 7),
  ];
  if (floorId <= 80) return [
    hero(HERO.ashen, 6, 85, 1), hero(HERO.bulwark, 6, 85, 2), hero(HERO.tide, 6, 90, 3),
    hero(HERO.gale, 6, 85, 4), hero(HERO.banner, 6, 85, 5),
    hero(HERO.bolt, 6, 85, 6), hero(HERO.leech, 6, 85, 7),
  ];
  return [
    hero(HERO.ashen, 6, 95, 1), hero(HERO.bulwark, 6, 95, 2), hero(HERO.tide, 6, 99, 3),
    hero(HERO.gale, 6, 95, 4), hero(HERO.banner, 6, 95, 5),
    hero(HERO.bolt, 6, 99, 6), hero(HERO.leech, 6, 95, 7),
  ];
};

const maxHpOf = (h: HeroInstance): number =>
  statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling).hp;

/**
 * 연속으로 오른다. 패배하거나 구간 끝을 깰 때까지.
 *
 * @param healRate 층 사이 회복 비율(최대 HP 대비). 0 = 회복 없음.
 * @param maxFloor 이 구간에서 깰 층 수
 * @param from 시작 층 인덱스(0 = 1층). 중층/상층 구간을 재려면 옮긴다.
 * @param makeParty 구간별 기준 파티. sim.ts와 같은 구성이어야 비교가 성립한다.
 * @returns 클리어한 층 수
 */
function climb(
  seed: number, healRate: number, maxFloor: number,
  from = 0, makeParty: () => HeroInstance[] = party,
): number {
  let roster = makeParty();

  for (let n = 0; n < maxFloor; n++) {
    // i는 FLOORS의 절대 인덱스, n은 이 구간에서 깬 층 수다.
    // 반환값은 반드시 n이어야 한다 — i를 돌려주면 from>0인 구간에서
    // 첫 층에 지고도 from만큼 깬 것으로 잡힌다.
    const i = from + n;
    const alive = roster.filter((h) => !h.isDead);
    if (alive.length === 0) return n;

    /**
     * 파티는 정원(3)까지만 나간다 — 실제 게임과 같아야 측정이 성립한다.
     *
     * ⚠️ 예전엔 생존자를 전부 내보냈다. 그래서 한 명이라도 죽으면 그 다음 층을
     * **2인으로** 치렀고, 8층 기준 2인 승률은 0~4%다(3인은 78%). 즉 사망 한 번이
     * 곧 구간 실패였고, 이게 중층 완주율 0%의 진짜 원인이었다 — HP도 exp도 아니었다.
     * 실제 플레이는 대기 인원으로 빈자리를 채우므로 그것을 모델에 넣는다.
     *
     * 선발 기준은 HP 비율이 높은 순 — 다친 영웅을 쉬게 하는 자연스러운 플레이다.
     */
    const sorted = [...alive].sort((a, b) => {
      const ra = (a.currentHp === 0 ? maxHpOf(a) : a.currentHp) / maxHpOf(a);
      const rb = (b.currentHp === 0 ? maxHpOf(b) : b.currentHp) / maxHpOf(b);
      return rb - ra;
    });
    const sortie = sorted.slice(0, partyLimitAt(FLOORS[i].id));

    const geared = gearUp(sortie, FLOORS[i].id);
    const r = runEncounter({
      party: geared.party, floor: FLOORS[i], data: gameData,
      rng: createRng(seed * 1000 + i),
      inventory: geared.inventory,
    });
    if (r.outcome !== 'victory') return n;

    const survived = new Map(r.survivors.map((s) => [s.instId, s.currentHp]));
    const dead = new Set<string>(r.casualties);
    // 참전 보상 경험치. runStore.finish()와 같은 규칙이어야 측정이 실제 플레이와 맞는다.
    const exp = floorRewards(FLOORS[i], r.turnsElapsed).exp;
    roster = roster.map((h) => {
      if (dead.has(h.instId)) return { ...h, isDead: true };
      const hp = survived.get(h.instId);
      if (hp == null) return h;
      const grown = gainExp(h, exp, gameData.starScaling).hero;
      const max = maxHpOf(grown);
      return { ...grown, currentHp: Math.min(max, hp + Math.round(max * healRate)) };
    });
  }
  return maxFloor;
}

const N = 300;
const MAX = 6; // 저층 파티이므로 6층까지

/**
 * 1. 실제 숙소 레벨별 등반 — 시설 투자가 등반에 얼마나 기여하는가.
 *    수치는 data/facilities.ts에서 읽는다. 여기서 다시 적으면 튜닝이 갈라진다.
 */
if (GEAR_ARG) console.log(`\n  ⚙ 장비: 층 단계에 맞는 ${GEAR_ARG === 'supply' ? '보급형' : '정예'} 한 벌을 입고 오른다${
  GEAR_ARG === 'relic' ? ` — ${RELIC_FROM}층부터 전원 유물` : GEAR_ARG === 'relic1' ? ` — ${RELIC_FROM}층부터 첫 출전자만 유물` : ''}`);
console.log('\n  숙소 레벨별 연속 등반 (저층 파티, 300회)\n');
console.log('  숙소      | 회복률 | 평균 도달 | 6층 완주');
for (let lv = 0; lv <= FACILITY_MAX_LEVEL; lv++) {
  const rate = restHealRate(lv);
  let total = 0, full = 0;
  for (let s = 0; s < N; s++) {
    const reached = climb(s, rate, MAX);
    total += reached;
    if (reached >= MAX) full++;
  }
  console.log(
    `  Lv.${lv}     | ${`${(rate * 100).toFixed(0)}%`.padStart(6)} | ` +
    `${(total / N).toFixed(2).padStart(9)} | ${((full / N) * 100).toFixed(0).padStart(7)}%`,
  );
}

/**
 * 2. 참고선 — 회복 0%(층간 유지만)와 전회복(시설 도입 전 동작).
 *    Lv.3이 전회복에 근접해야 "기존 밸런스가 만렙 기준선으로 보존된다"가 성립한다.
 */
console.log('\n  참고선\n');
console.log('  구분      | 회복률 | 평균 도달 | 6층 완주');
for (const [name, rate] of [['회복없음', 0], ['전회복', 1]] as const) {
  let total = 0, full = 0;
  for (let s = 0; s < N; s++) {
    const reached = climb(s, rate, MAX);
    total += reached;
    if (reached >= MAX) full++;
  }
  console.log(
    `  ${name.padEnd(8)}| ${`${(rate * 100).toFixed(0)}%`.padStart(6)} | ` +
    `${(total / N).toFixed(2).padStart(9)} | ${((full / N) * 100).toFixed(0).padStart(7)}%`,
  );
}
/**
 * 3. 구간별 연속 등반 — sim이 구조적으로 못 재는 영역.
 *
 * sim은 매 층을 만피로 **독립** 측정하므로 "6층을 깨고 그 HP로 7층에 들어간다"를
 * 영영 못 본다(§5-13). 층별 승률이 전부 합격이어도 구간을 이어 오르면 무너질 수 있다.
 *
 * 숙소는 만렙(Lv.3)을 가정한다 — 상층에 도달한 플레이어가 시설을 안 올렸을 리 없고,
 * 여기서 보려는 것은 시설 효과가 아니라 **구간 자체가 이어서 오를 수 있는가**다.
 */
console.log('\n  구간별 연속 등반 (숙소 Lv.3, 300회)\n');
console.log('  구간              | 평균 도달 | 완주율');
const SEGMENTS = [
  { name: '저층 1~6', from: 0, count: 6, make: party },
  { name: '중층 7~12', from: 6, count: 6, make: midParty },
  { name: '상층 13~20', from: 12, count: 8, make: highParty },
  /*
    생성 구간(21~100) — **여기는 지금까지 한 번도 이어서 재본 적이 없다.**
    `npm run sim`이 층별 승률만 재고(독립), 이 스크립트는 20층에서 끊겨 있었다.
    즉 80개 층이 "이어서 오를 수 있는가"라는 질문을 아무도 안 던진 상태였다.

    구간은 `genParty`의 전력 경계(40/60/80/100)와 같게 끊는다 —
    경계를 걸쳐서 재면 어느 쪽 전력으로 판단해야 할지 알 수 없다.
  */
  { name: '생성 21~40', from: 20, count: 20, make: () => genParty(40) },
  { name: '생성 41~60', from: 40, count: 20, make: () => genParty(60) },
  { name: '생성 61~80', from: 60, count: 20, make: () => genParty(80) },
  { name: '생성 81~100', from: 80, count: 20, make: () => genParty(100) },
] as const;
for (const seg of SEGMENTS) {
  const rate = restHealRate(FACILITY_MAX_LEVEL);
  let total = 0, full = 0;
  for (let s = 0; s < N; s++) {
    const reached = climb(s, rate, seg.count, seg.from, seg.make);
    total += reached;
    if (reached >= seg.count) full++;
  }
  console.log(
    `  ${seg.name.padEnd(14)}| ${(total / N).toFixed(2).padStart(9)} / ${seg.count} | ` +
    `${((full / N) * 100).toFixed(0).padStart(5)}%`,
  );
}
console.log('');
