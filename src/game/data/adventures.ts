/**
 * 모험 파견 — 탑 밖으로 영웅을 보낸다.
 *
 * 밸런스 수치는 전부 여기 있고 코드에는 없다 (CLAUDE.md 아키텍처 규칙).
 *
 * ── 왜 이게 있는가 ───────────────────────────────────────
 * ★5가 **도달 불가**였다. ★4→★5는 각성석 1개가 필요한데
 * (`progression.ts:88`, `elements.ts` `requiresAwakening: true`)
 * 게임 안에 각성석을 주는 곳이 하나도 없었다 (`stores/devWallet.ts`에만 있었다).
 * 실측(2026-08-23) 30전투 후: 금 32,986 · 승급석 43 · **각성석 0**.
 * 모험이 그 유일한 공급원이 된다.
 *
 * ── 기간이 왜 "전투 횟수"인가 ────────────────────────────
 * 이 게임에는 시계도 날짜도 스케줄러도 없다(전 코드 grep으로 확인).
 * 실제 시간을 쓰면 저장 시각을 믿어야 하고, 그러면 기기 시계를 돌려
 * 보상을 즉시 받는 길이 열린다 — 퍼머데스 게임에서 시간 조작은 곧 사망 무효화의
 * 첫 단추다. `battleCount`는 유일한 단조 카운터이며 조작할 수 없다.
 *
 * ── 사망이 없는 이유 (사용자 결정) ───────────────────────
 * 죽음은 **탑에서만** 일어난다. 모험에서도 죽으면 퍼머데스의 무게가 여러 갈래로
 * 흩어져 "탑이 무서운 곳"이라는 축이 흐려진다. 실패는 **부상과 빈손 귀환**이다.
 */
import type { HeroInstId, MaterialBag, MaterialId } from '../types';
import { MATERIAL } from './materials';

export type AdventureId = string & { readonly __brand: 'AdventureId' };

const a = (s: string) => s as AdventureId;

export interface AdventureReward {
  /** 종류별 수량. 성공 시 지급 */
  materials: MaterialBag;
  /**
   * 각성석.
   *
   * ⚠️ **흔하면 승급이 헐거워진다.** ★5는 이 게임의 상한이고, 상한이 쉬우면
   * 그 아래 등급이 전부 무의미해진다. 고난도 모험에만, 그것도 확률로 붙인다.
   */
  awakeningChance: number;
  /**
   * 파견 인원 **1인당** 경험치. **정액이다.**
   *
   * ⚠️ **절대로 층 깊이에 비례시키지 말 것.** 훈련소 유휴 exp가 정액 160인 것과
   * 같은 이유다(`facilities.ts:83`): "참전 영웅과 경쟁하지 않도록 작게 잡는다.
   * 이게 크면 **안 내보내는 게 이득**이 되어 퍼머데스의 긴장이 사라진다."
   *
   * 실측 참전 exp(가장 짧은 6턴 전투 기준):
   *   1층 120 · 6층 330 · 12층 582 · 20층 918 · 40층 1,758 · 60층 2,598
   *
   * 즉 **1층 6턴 × 소요 전투 수**가 상한선이다. 그걸 넘으면 1층에서조차
   * 파견이 등반보다 이득이 되어 게임이 뒤집힌다.
   * 아래 값은 전부 `exp * duration < 120 * duration`을 만족한다
   * (테스트 `모험 exp가 1층 참전 exp를 넘지 않는다`가 이 부등식을 잠근다).
   */
  exp: number;
}

export interface AdventureDef {
  id: AdventureId;
  name: string;
  /** 화면에 그대로 나가는 한 줄 */
  desc: string;
  /** 소요 **전투 횟수**. 시간이 아니다 */
  duration: number;
  /** 필요 인원 */
  partySize: number;
  /** 이 층에 도달해야 열린다 */
  unlockFloor: number;
  /**
   * 성공 확률.
   *
   * 파견 인원의 레벨로 보정된다(`adventure.ts`의 `successChance`).
   * 여기 값은 **보정 전 기준선**이다.
   */
  baseSuccess: number;
  /**
   * 실패 시 잃는 최대 HP 비율.
   *
   * ⚠️ 이게 크면 "파견 = 다음 층 전멸"이 되어 아무도 안 쓴다. 반대로 0이면
   * 실패에 대가가 없어 무지성 파견이 최적이 된다. 숙소 Lv.0 회복률(48%)보다
   * 작게 잡아 **한 층 쉬면 복구되는** 수준으로 둔다.
   */
  injury: number;
  reward: AdventureReward;
}

const mat = (pairs: [MaterialId, number][]): MaterialBag =>
  Object.fromEntries(pairs) as MaterialBag;

/**
 * 모험 3종.
 *
 * ⚠️ **처음부터 많이 만들지 않는다.** 제작 레시피가 정해지기 전에 모험만 늘리면
 * 쓸 데 없는 자원이 쌓이고, 나중에 보상표를 두 번 짜게 된다
 * (`materials.ts`가 재료를 3종으로 시작한 것과 같은 이유).
 *
 * 셋의 역할이 겹치지 않게 갈랐다:
 *   폐광  — 초반. 짧고 안전하고 흔한 재료. "일단 보내둔다"
 *   상단  — 중반. 인원 부담이 크고 상위 재료. 2군이 열리기 전이면 아프다
 *   균열  — 후반. **각성석의 유일한 통로.** 길고 위험하다
 */
export const ADVENTURE_DEFS: readonly AdventureDef[] = [
  {
    id: a('adv_mine'),
    name: '버려진 폐광',
    desc: '탑 아래로 뻗은 갱도. 쇳조각이 지천이지만 무너진 구간이 많다.',
    duration: 2,
    partySize: 1,
    unlockFloor: 1,
    baseSuccess: 0.75,
    injury: 0.2,
    reward: {
      materials: mat([[MATERIAL.ore, 4]]),
      awakeningChance: 0,
      exp: 60, // 1층 6턴(120)의 절반
    },
  },
  {
    id: a('adv_caravan'),
    name: '상단 호위',
    desc: '탑을 도는 행상을 지킨다. 사람 수가 곧 값이라 여럿을 내줘야 한다.',
    duration: 3,
    partySize: 2,
    unlockFloor: 5,
    baseSuccess: 0.65,
    injury: 0.3,
    reward: {
      materials: mat([[MATERIAL.ore, 3], [MATERIAL.hide, 3]]),
      awakeningChance: 0,
      exp: 90,
    },
  },
  {
    id: a('adv_rift'),
    name: '균열 조사',
    desc: '탑이 새어 나온 자리. 돌아온 자들은 빛을 한 줌씩 들고 온다.',
    duration: 5,
    partySize: 2,
    unlockFloor: 10,
    baseSuccess: 0.5,
    injury: 0.4,
    reward: {
      materials: mat([[MATERIAL.hide, 2], [MATERIAL.essence, 2]]),
      /**
       * ⚠️ **각성석의 유일한 공급원이다.**
       *
       * 0.35 × 5전투 = 사실상 14전투에 1개꼴. ★4를 ★5로 올리려면 그만큼 기다린다.
       * 이걸 올리면 ★5가 흔해지고, ★5가 흔해지면 그 아래 등급이 전부 의미를 잃는다.
       */
      awakeningChance: 0.35,
      exp: 140,
    },
  },
];

export const ADVENTURE_BY_ID: Record<AdventureId, AdventureDef> = Object.fromEntries(
  ADVENTURE_DEFS.map((d) => [d.id, d]),
) as Record<AdventureId, AdventureDef>;

/**
 * 레벨에 따른 성공률 보정.
 *
 * 잘 키운 영웅을 보내면 더 잘 된다 — 그래야 "누구를 보낼까"가 선택이 된다.
 * 다만 **상한을 둔다.** 만렙을 보내면 무조건 성공이 되면 파견이 그냥 수도꼭지가 되고,
 * 하한도 둬서 저레벨을 보내도 완전히 헛수고는 아니게 한다.
 */
export const ADVENTURE_LEVEL_BONUS_PER_LEVEL = 0.006;
export const ADVENTURE_SUCCESS_MAX = 0.95;
export const ADVENTURE_SUCCESS_MIN = 0.2;

/** 해금된 모험 — 최고 도달 층 기준 */
export function adventuresFor(maxFloorReached: number): AdventureDef[] {
  return ADVENTURE_DEFS.filter((d) => d.unlockFloor <= maxFloorReached);
}

/** 파견 레코드 — 스토어에 저장된다. 영웅에 플래그를 박지 않는 이유는 `adventure.ts` 참조 */
export interface Dispatch {
  advId: AdventureId;
  heroIds: HeroInstId[];
  /** 파견을 시작한 시점의 `battleCount` */
  startedAtBattle: number;
}
