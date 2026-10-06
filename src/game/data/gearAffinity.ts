/**
 * 장비 궁합 — 계열마다 **주 장비 슬롯** 하나. 그 슬롯의 장비는 효과가 더 크다(STEP 70).
 *
 * 착용 제한이 아니라 증폭이다(사용자 결정, 2026-10-06). 장비가 슬롯 3종뿐이라 "이 직업은 이것만 낀다"를
 * 걸 만큼 종류가 없고, 제한은 창고에 쌓인 장비를 쓸모없게 만든다. 누구나 무엇이든 끼되
 * **누가 끼느냐에 따라 값이 다르다** — 좋은 무기 하나를 누구에게 줄지가 판단이 된다.
 *
 * - 오르는 것은 **이로운 수치만**이다. 판금의 속도 감소 같은 대가는 커지지 않는다.
 * - 층 난이도 기준(`sim`·`climb-check` 기본값)은 장비 없음이라 이 값에 움직이지 않는다.
 *   장비를 입힌 측정(`climb-check --gear …`)만 움직인다 — 값을 만졌으면 그쪽을 다시 잴 것.
 */
import type { GearSlot, Lineage } from '../types';

export const GEAR_AFFINITY: { mult: number; slot: Record<Lineage, GearSlot> } = {
  mult: 1.25,
  slot: {
    blade: 'weapon',      // 검사 — 칼이 곧 직업이다
    hunter: 'weapon',     // 사냥꾼 — 활
    guardian: 'armor',    // 수호자 — 맞는 것이 일이다
    commander: 'armor',   // 지휘관 — 대열 앞에 선다
    priest: 'trinket',    // 사제 — 성물
    mage: 'trinket',      // 술사 — 촉매
    scout: 'trinket',     // 척후 — 가벼운 것(속도·치명)
  },
};

/** 이 계열이 이 슬롯의 장비를 꼈을 때의 배수. 계열을 모르면 1 */
export function affinityOf(lineage: Lineage | undefined, slot: GearSlot): number {
  return lineage && GEAR_AFFINITY.slot[lineage] === slot ? GEAR_AFFINITY.mult : 1;
}
