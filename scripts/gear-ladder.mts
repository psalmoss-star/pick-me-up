/**
 * 장비 사다리 수치 생성 — `npx tsx scripts/gear-ladder.mts [--write]`
 *
 * 단계 t의 기준 파티(refPartyAt(tierRefFloor(t)))에 한 벌을 입혔을 때 파티 전투력이
 * 보급 +15% / 정예 +25%가 되도록 슬롯별 크기를 푼다. 전투력은 스탯의 가중합(선형)이라
 * 닫힌 식으로 풀린다. 결과를 setPowerRatio로 다시 재서 허용 범위를 확인하고,
 * --write면 src/game/data/gearLadder.ts에 쓴다(floor-tune --write와 같은 방식).
 *
 * 슬롯 몫: 무기 40% · 방어구 35% · 장신구 25%.
 * crit·spd는 단계와 무관하게 고정(무한히 키우면 crit 상한 1에 닿는다) — atk/hp/def만 키운다.
 */
import { writeFileSync } from 'node:fs';
import { POWER_WEIGHTS as W, POWER_SCALE } from '../src/game/data/power';
import { refPartyAt, tierRefFloor } from '../src/game/data/refParty';
import { TIER_COUNT, LADDER_TARGET, GEAR_DEFS } from '../src/game/data/gear';
import { setPowerRatio } from '../src/game/gearLadder';
import { combatPower } from '../src/game/power';
import { statsOfInstance } from '../src/game/stats';
import { gameData, FLOORS } from '../src/game/data';
import { floorRewards } from '../src/game/data/floors';
import type { GearBonus, GearSlot } from '../src/game/types';

type Line = 'supply' | 'elite';
const SLOTS: GearSlot[] = ['weapon', 'armor', 'trinket'];
const SHARE: Record<GearSlot, number> = { weapon: 0.4, armor: 0.35, trinket: 0.25 };
/** 단계와 무관한 고정 부분 */
const FIXED: Record<Line, Record<GearSlot, GearBonus>> = {
  supply: { weapon: { crit: 0.02 }, armor: {}, trinket: { spd: 4, crit: 0.02 } },
  elite: { weapon: { crit: 0.04 }, armor: {}, trinket: { spd: 8, crit: 0.03 } },
};
const raw = (b: GearBonus) =>
  (b.hp ?? 0) * W.hp + (b.atk ?? 0) * W.atk + (b.def ?? 0) * W.def + (b.spd ?? 0) * W.spd + (b.crit ?? 0) * W.crit;

/** 그 단계 기준 파티의 1인 평균 전투력 원값(÷POWER_SCALE 전) */
function partyRaw(tier: number): number {
  const party = refPartyAt(tierRefFloor(tier));
  const sum = party.reduce((s, h) => s + combatPower(statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling)), 0);
  return (sum * POWER_SCALE) / party.length;
}

/**
 * 풀이에 쓰는 기준 전력.
 *
 * ⚠️ 기준 파티는 20층 구간마다 바뀐다(3·4단계가 같은 파티). 그대로 풀면 구간 안 두 단계의
 * 수치가 **똑같아진다**(첫 생성에서 실제로 3=4·5=6·7=8·9=10단계였다 — 값만 오르고 성능은 그대로).
 * 그래서 구간의 두 번째 단계는 이웃 구간 전력과의 **기하 평균**으로 키운다. 마지막 단계(10)는
 * 다음 구간이 없으므로 직전 구간 성장률의 절반만큼 늘린다. 비율은 여전히 그 단계 파티로 재므로
 * 두 번째 단계는 목표보다 조금 높게(보급 ~17%, 정예 ~28%) 나온다 — 허용 범위 안이다.
 */
function avgRaw(tier: number): number {
  const here = partyRaw(tier);
  const sameAsPrev = tier > 1 && Math.abs(partyRaw(tier - 1) - here) < 1e-9;
  if (!sameAsPrev) return here;
  if (tier < TIER_COUNT) return Math.sqrt(here * partyRaw(tier + 1));
  return here * Math.sqrt(here / partyRaw(tier - 2));
}

function solve(tier: number, line: Line, slot: GearSlot): GearBonus {
  const want = LADDER_TARGET[line].goal * SHARE[slot] * avgRaw(tier);
  const fixed = FIXED[line][slot];
  const rest = Math.max(0, want - raw(fixed));
  if (slot === 'armor') {
    // 방어구: hp:def = 11:1
    const u = rest / (11 * W.hp + W.def);
    return { hp: Math.max(1, Math.round(11 * u)), def: Math.max(1, Math.round(u)) };
  }
  return { ...fixed, atk: Math.max(1, Math.round(rest / W.atk)) };
}

/** 보급형 한 개 값 = 그 단계 가운데 층 한 번 돌파(8턴 가정)의 금. 10 단위 반올림 */
function price(tier: number): number {
  const f = FLOORS.find((x) => x.id === tierRefFloor(tier))!;
  return Math.round(floorRewards(f, 8).gold / 10) * 10;
}

const rows: string[] = [];
console.log('\n  단계 | 계열   | 비율');
for (let t = 1; t <= TIER_COUNT; t++) {
  for (const line of ['supply', 'elite'] as Line[]) {
    // 기존 장비가 차지한 자리(1단계 보급·정예, 2단계 정예)는 생성하지 않고 비율만 보고한다
    const legacy = t === 1 || (t === 2 && line === 'elite');
    const set = SLOTS.map((slot) => {
      if (legacy) {
        const d = Object.values(GEAR_DEFS).find((x) => x.tier === t && x.line === line && x.slot === slot)!;
        return d.base;
      }
      const base = solve(t, line, slot);
      rows.push(`  { tier: ${t}, line: '${line}', slot: '${slot}', base: ${JSON.stringify(base)}${line === 'supply' ? `, price: ${price(t)}` : ''} },`);
      return base;
    });
    const r = setPowerRatio(refPartyAt(tierRefFloor(t)), set);
    const { lo, hi } = LADDER_TARGET[line];
    const out = r < lo || r > hi;
    console.log(`  ${String(t).padStart(2)}   | ${line.padEnd(6)} | ${(r * 100).toFixed(1)}%${out ? '  ← 범위 밖' : ''}${legacy ? ' (기존)' : ''}`);
    // 기존 자리가 범위 밖이면 같은 풀이로 맞춘 값을 제안한다 — data/gear.ts의 기존 항목에 손으로 옮긴다(id·이름 유지)
    if (legacy && out) {
      for (const slot of SLOTS) console.log(`         제안 ${slot}: ${JSON.stringify(solve(t, line, slot))}`);
    }
  }
}

if (process.argv.includes('--write')) {
  const body = `/**
 * 장비 사다리 수치 — **자동 생성 파일. 손으로 고치지 말 것.**
 * \`npx tsx scripts/gear-ladder.mts --write\`가 단계별 기준 파티로 풀어 쓴다.
 * 기준 파티·전투력 가중치·LADDER_TARGET을 바꿨으면 다시 돌릴 것.
 */
import type { GearBonus, GearSlot } from '../types';

export interface LadderRow {
  tier: number;
  line: 'supply' | 'elite';
  slot: GearSlot;
  base: GearBonus;
  price?: number;
}

export const GEAR_LADDER: readonly LadderRow[] = [
${rows.join('\n')}
];
`;
  writeFileSync(new URL('../src/game/data/gearLadder.ts', import.meta.url), body);
  console.log(`\n  썼다: src/game/data/gearLadder.ts (${rows.length}행)`);
}
