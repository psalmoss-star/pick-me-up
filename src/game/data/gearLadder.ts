/**
 * 장비 사다리 수치 — **자동 생성 파일. 손으로 고치지 말 것.**
 * `npx tsx scripts/gear-ladder.mts --write`가 단계별 기준 파티로 풀어 쓴다.
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
  { tier: 2, line: 'supply', slot: 'weapon', base: {"crit":0.02,"atk":57}, price: 740 },
  { tier: 2, line: 'supply', slot: 'armor', base: {"hp":125,"def":11}, price: 740 },
  { tier: 2, line: 'supply', slot: 'trinket', base: {"spd":4,"crit":0.02,"atk":23}, price: 740 },
  { tier: 3, line: 'supply', slot: 'weapon', base: {"crit":0.02,"atk":75}, price: 1070 },
  { tier: 3, line: 'supply', slot: 'armor', base: {"hp":158,"def":14}, price: 1070 },
  { tier: 3, line: 'supply', slot: 'trinket', base: {"spd":4,"crit":0.02,"atk":34}, price: 1070 },
  { tier: 3, line: 'elite', slot: 'weapon', base: {"crit":0.04,"atk":121} },
  { tier: 3, line: 'elite', slot: 'armor', base: {"hp":263,"def":24} },
  { tier: 3, line: 'elite', slot: 'trinket', base: {"spd":8,"crit":0.03,"atk":57} },
  { tier: 4, line: 'supply', slot: 'weapon', base: {"crit":0.02,"atk":84}, price: 1400 },
  { tier: 4, line: 'supply', slot: 'armor', base: {"hp":174,"def":16}, price: 1400 },
  { tier: 4, line: 'supply', slot: 'trinket', base: {"spd":4,"crit":0.02,"atk":40}, price: 1400 },
  { tier: 4, line: 'elite', slot: 'weapon', base: {"crit":0.04,"atk":136} },
  { tier: 4, line: 'elite', slot: 'armor', base: {"hp":290,"def":26} },
  { tier: 4, line: 'elite', slot: 'trinket', base: {"spd":8,"crit":0.03,"atk":66} },
  { tier: 5, line: 'supply', slot: 'weapon', base: {"crit":0.02,"atk":94}, price: 1730 },
  { tier: 5, line: 'supply', slot: 'armor', base: {"hp":192,"def":17}, price: 1730 },
  { tier: 5, line: 'supply', slot: 'trinket', base: {"spd":4,"crit":0.02,"atk":46}, price: 1730 },
  { tier: 5, line: 'elite', slot: 'weapon', base: {"crit":0.04,"atk":152} },
  { tier: 5, line: 'elite', slot: 'armor', base: {"hp":320,"def":29} },
  { tier: 5, line: 'elite', slot: 'trinket', base: {"spd":8,"crit":0.03,"atk":76} },
  { tier: 6, line: 'supply', slot: 'weapon', base: {"crit":0.02,"atk":108}, price: 2060 },
  { tier: 6, line: 'supply', slot: 'armor', base: {"hp":218,"def":20}, price: 2060 },
  { tier: 6, line: 'supply', slot: 'trinket', base: {"spd":4,"crit":0.02,"atk":55}, price: 2060 },
  { tier: 6, line: 'elite', slot: 'weapon', base: {"crit":0.04,"atk":176} },
  { tier: 6, line: 'elite', slot: 'armor', base: {"hp":363,"def":33} },
  { tier: 6, line: 'elite', slot: 'trinket', base: {"spd":8,"crit":0.03,"atk":91} },
  { tier: 7, line: 'supply', slot: 'weapon', base: {"crit":0.02,"atk":124}, price: 2400 },
  { tier: 7, line: 'supply', slot: 'armor', base: {"hp":247,"def":22}, price: 2400 },
  { tier: 7, line: 'supply', slot: 'trinket', base: {"spd":4,"crit":0.02,"atk":65}, price: 2400 },
  { tier: 7, line: 'elite', slot: 'weapon', base: {"crit":0.04,"atk":203} },
  { tier: 7, line: 'elite', slot: 'armor', base: {"hp":412,"def":37} },
  { tier: 7, line: 'elite', slot: 'trinket', base: {"spd":8,"crit":0.03,"atk":108} },
  { tier: 8, line: 'supply', slot: 'weapon', base: {"crit":0.02,"atk":131}, price: 2730 },
  { tier: 8, line: 'supply', slot: 'armor', base: {"hp":260,"def":24}, price: 2730 },
  { tier: 8, line: 'supply', slot: 'trinket', base: {"spd":4,"crit":0.02,"atk":69}, price: 2730 },
  { tier: 8, line: 'elite', slot: 'weapon', base: {"crit":0.04,"atk":214} },
  { tier: 8, line: 'elite', slot: 'armor', base: {"hp":433,"def":39} },
  { tier: 8, line: 'elite', slot: 'trinket', base: {"spd":8,"crit":0.03,"atk":115} },
  { tier: 9, line: 'supply', slot: 'weapon', base: {"crit":0.02,"atk":138}, price: 3060 },
  { tier: 9, line: 'supply', slot: 'armor', base: {"hp":273,"def":25}, price: 3060 },
  { tier: 9, line: 'supply', slot: 'trinket', base: {"spd":4,"crit":0.02,"atk":74}, price: 3060 },
  { tier: 9, line: 'elite', slot: 'weapon', base: {"crit":0.04,"atk":226} },
  { tier: 9, line: 'elite', slot: 'armor', base: {"hp":454,"def":41} },
  { tier: 9, line: 'elite', slot: 'trinket', base: {"spd":8,"crit":0.03,"atk":122} },
  { tier: 10, line: 'supply', slot: 'weapon', base: {"crit":0.02,"atk":146}, price: 3390 },
  { tier: 10, line: 'supply', slot: 'armor', base: {"hp":286,"def":26}, price: 3390 },
  { tier: 10, line: 'supply', slot: 'trinket', base: {"spd":4,"crit":0.02,"atk":79}, price: 3390 },
  { tier: 10, line: 'elite', slot: 'weapon', base: {"crit":0.04,"atk":239} },
  { tier: 10, line: 'elite', slot: 'armor', base: {"hp":477,"def":43} },
  { tier: 10, line: 'elite', slot: 'trinket', base: {"spd":8,"crit":0.03,"atk":130} },
];
