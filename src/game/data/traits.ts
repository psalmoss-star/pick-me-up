/**
 * 계열 특성 — 계열마다 하나, 전투에 닿는 수치의 단일 출처(STEP 69).
 *
 * 원칙:
 * - **확률이 없다.** 전부 조건으로 발동한다 — 난수를 새로 뽑지 않으므로 주 전투 난수의
 *   소비 순서가 그대로다. 확률 특성을 넣으려면 `STREAM`에 번호를 **뒤에 추가**할 것.
 * - **죽음이 이득이 되는 특성을 두지 않는다**(gdd-v3 §4.1과 같은 이유).
 * - 적은 계열이 없다. 영웅만 받는다.
 *
 * `BattleData.traits`로 엔진에 들어간다. **빼고 돌리면 특성 이전 엔진과 비트 단위로 같다**
 * (`ordersBaseline.test.ts`가 잠근다) — 켜고 끈 차이를 재는 수단이기도 하다(`scripts/trait-check.mts`).
 *
 * 수치를 만졌으면 `trait-check` → `npm run sim` → `climb-check` → `floor-tune` 순으로 다시 잰다.
 * 설명 문장은 손으로 적지 않는다 — `describeTrait`(trait.ts)가 여기 값에서 만든다.
 */
import type { Lineage } from '../types';

export interface LineageTraits {
  /** 마무리 — HP 비율이 `hpBelow` 이하인 적에게 주는 피해 배수 */
  blade: { hpBelow: number; damageMult: number };
  /** 버티기 — 공격으로 받는 피해 배수 (도트·책략 대가는 줄이지 않는다) */
  guardian: { damageTakenMult: number };
  /**
   * 넘치는 은총 — 치유가 최대 HP를 넘긴 만큼의 `overflowToShield`가 보호막이 된다.
   * 이 특성이 쌓는 보호막은 대상 최대 HP의 `shieldCapRatio`까지다(이미 있는 보호막을 깎지는 않는다).
   */
  priest: { overflowToShield: number; shieldCapRatio: number };
  /** 주문 증폭 — 대상이 둘 이상인 기술(전체·둘)의 피해·회복·보호막 배수 */
  mage: { multiTargetMult: number };
  /** 약점 사냥 — 해로운 상태에 걸린 적에게 주는 피해 배수 */
  hunter: { afflictedMult: number };
  /**
   * 선제 — 전투 첫 `turns`턴 동안 행동 순서를 정하는 속도 배수와, 그 턴에 주는 피해 배수.
   * 속도만으로는 효과가 0이었다(척후는 원래도 가장 빨라 순서가 안 바뀐다 — `trait-check` 실측).
   */
  scout: { turns: number; spdMult: number; damageMult: number };
  /** 진두지휘 — 전장에 있는 동안 아군 영웅 전체의 공격력 배수. 지휘관이 둘이어도 한 번만 */
  commander: { allyAtkMult: number };
}

export const LINEAGE_TRAITS: LineageTraits = {
  blade: { hpBelow: 0.35, damageMult: 1.35 },
  guardian: { damageTakenMult: 0.95 },
  priest: { overflowToShield: 0.3, shieldCapRatio: 0.12 },
  mage: { multiTargetMult: 1.2 },
  hunter: { afflictedMult: 1.3 },
  scout: { turns: 1, spdMult: 1.5, damageMult: 1.2 },
  commander: { allyAtkMult: 1.03 },
};

export const TRAIT_NAME: Record<Lineage, string> = {
  blade: '마무리',
  guardian: '버티기',
  priest: '넘치는 은총',
  mage: '주문 증폭',
  hunter: '약점 사냥',
  scout: '선제',
  commander: '진두지휘',
};

/**
 * 특성 한 줄 요약 — 편성 화면의 좁은 칸(추천 이유)에 쓴다.
 * **수치를 적지 않는다**(테스트가 숫자·%를 막는다). 수치는 `describeTrait`가 데이터에서 만들어 상태창에 보인다 —
 * 여기에 또 적으면 수치를 고칠 때 한쪽이 거짓말을 한다.
 */
export const TRAIT_BRIEF: Record<Lineage, string> = {
  blade: '다 깎인 적을 끊는다',
  guardian: '덜 아프게 맞는다',
  priest: '넘친 치유가 보호막이 된다',
  mage: '여럿을 한꺼번에 친다',
  hunter: '약해진 적을 노린다',
  scout: '첫 턴에 먼저 친다',
  commander: '모두의 공격을 올린다',
};
