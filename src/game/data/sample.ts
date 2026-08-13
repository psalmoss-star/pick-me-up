/**
 * 데이터 재export 배럴.
 *
 * 내용물은 2026-08-13에 넷으로 쪼갰다 (`elements` / `skills` / `heroes` / `enemies`).
 * **이 파일은 지우지 말 것** — 26곳이 `data/sample`에서 가져다 쓰고 있고,
 * 배럴로 남겨두면 그 import를 하나도 건드리지 않아도 된다(HANDOFF §5-28).
 *
 * 새 데이터를 추가할 때는 여기가 아니라 **해당 파일에** 넣는다.
 */
export { elementChart, starScaling } from './elements';
export { skills } from './skills';
export { heroes, HERO } from './heroes';
export { enemies, ENEMY } from './enemies';
