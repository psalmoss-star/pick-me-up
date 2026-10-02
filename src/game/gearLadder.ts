/**
 * 장비 사다리의 잣대 — 한 벌을 입혔을 때 파티 전투력 증가율.
 *
 * 전투력(`power.ts`)은 표시 전용 요약값이지만, 스탯의 가중합이라 "장비가 얼마나 거드는가"를
 * 한 숫자로 비교하기에 알맞다. 파티 단위 합으로 잰다 — `partyPower`가 합이기 때문이다.
 */
import { combatPower } from './power';
import { applyBonus, sumBonus } from './gear';
import { statsOfInstance } from './stats';
import { gameData } from './data';
import type { GearBonus, HeroInstance } from './types';

export function setPowerRatio(party: readonly HeroInstance[], set: readonly GearBonus[]): number {
  const bonus = sumBonus([...set]);
  let before = 0;
  let after = 0;
  for (const h of party) {
    const base = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling);
    before += combatPower(base);
    after += combatPower(applyBonus(base, bonus));
  }
  return after / before - 1;
}
