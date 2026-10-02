/**
 * 단계별 기준 파티 — 장비 사다리의 비율을 재는 잣대.
 *
 * ⚠️ `src/game/sim.ts`의 저층/중층/상층/genParty **출전 인원과 같아야 한다.**
 * sim은 실행하면 표를 찍는 CLI라 import할 수 없어 값을 복제한다(climb-check와 같은 사정).
 * sim을 고치면 여기도 고칠 것. 시드가 없으므로 잠재 계수 0.
 */
import { klassFor } from '../stats';
import { HERO } from './sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

export function refPartyAt(floorId: number): HeroInstance[] {
  if (floorId <= 6) return [hero(HERO.ashen, 2, 15, 1), hero(HERO.bulwark, 2, 15, 2), hero(HERO.tide, 3, 20, 3)];
  if (floorId <= 12) return [hero(HERO.ashen, 3, 30, 1), hero(HERO.bulwark, 3, 30, 2), hero(HERO.tide, 3, 35, 3)];
  if (floorId <= 20) return [hero(HERO.ashen, 4, 50, 1), hero(HERO.bulwark, 4, 50, 2), hero(HERO.tide, 4, 55, 3)];
  const g = (star: Star, lv: number, tideLv: number) => [
    hero(HERO.ashen, star, lv, 1), hero(HERO.bulwark, star, lv, 2), hero(HERO.tide, star, tideLv, 3),
    hero(HERO.gale, star, lv, 4), hero(HERO.banner, star, lv, 5),
  ];
  if (floorId <= 40) return g(5, 60, 65);
  if (floorId <= 60) return g(5, 75, 80);
  if (floorId <= 80) return g(6, 85, 90);
  return g(6, 95, 99);
}

/**
 * 단계의 비율을 잴 층 — **단계 첫 층**(10k − 9). 그 단계에서 가장 약한 기준 파티다.
 *
 * ⚠️ 처음엔 단계 가운데(10k − 5)로 맞췄는데, 11층 파티(★3 Lv.30)가 15층 파티(★4 Lv.50)보다
 * 훨씬 약해 11~12층에서 상한을 넘었다(보급 +22.7%·정예 +38.9%, STEP 66 리뷰).
 * 가장 약한 파티로 맞추면 단계 안 어느 층에서도 상한을 넘지 않는다.
 */
export function tierRefFloor(tier: number): number {
  return tier * 10 - 9;
}
