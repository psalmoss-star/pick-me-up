/**
 * 전투 엔진에 넘길 정적 데이터 번들.
 * 화면·시뮬레이터 모두 여기서 같은 번들을 가져다 쓴다.
 */
import type { BattleData } from '../battle';
import { heroes, enemies, skills, starScaling, elementChart } from './sample';

export const gameData = {
  heroes, enemies, skills, starScaling, elementChart,
} as unknown as BattleData;

export { heroes, enemies, skills, starScaling, elementChart, HERO, ENEMY } from './sample';
export { FLOORS, floorAt, floorRewards, type FloorSpec, type FloorScene } from './floors';
