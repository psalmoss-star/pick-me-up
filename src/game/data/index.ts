/**
 * 전투 엔진에 넘길 정적 데이터 번들.
 * 화면·시뮬레이터 모두 여기서 같은 번들을 가져다 쓴다.
 */
import type { BattleData } from '../battle';
import { heroes, enemies, skills, starScaling, elementChart } from './sample';
import { LINEAGE_TRAITS } from './traits';

export const gameData = {
  heroes, enemies, skills, starScaling, elementChart,
  traits: LINEAGE_TRAITS,
} as unknown as BattleData;

/**
 * 계열 특성을 뺀 번들 — 특성 이전 엔진과 비트 단위로 같다.
 * 켜고 끈 차이를 재는 측정과 기준선 잠금에만 쓴다. **화면·스토어는 `gameData`를 쓴다.**
 */
export const gameDataNoTraits = {
  heroes, enemies, skills, starScaling, elementChart,
} as unknown as BattleData;

export { heroes, enemies, skills, starScaling, elementChart, HERO, ENEMY } from './sample';
export { FLOORS, floorAt, floorRewards, type FloorSpec, type FloorScene } from './floors';
