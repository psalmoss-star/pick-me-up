/**
 * 층 돌파 연계 과제.
 *
 * 층을 깨는 것만으로는 보상이 늘 같다 — 어떻게 깼는지가 아무 의미가 없다.
 * 과제는 **이미 치른 전투를 다시 읽어** 조건을 만족했는지 판정한다.
 * 전투를 다시 돌리지 않으므로 재현성에 아무 영향이 없다.
 *
 * ── 설계 원칙 ──────────────────────────────────────────────
 * 1. 조건은 **전투 기록만으로 판정 가능**해야 한다. 별도 상태를 만들지 않는다.
 * 2. "무사 귀환"류(사망자 0)를 넣되 **보상을 크게 하지 않는다.**
 *    안 죽는 쪽에 큰 보상을 걸면 안전한 파티만 굴리게 되고,
 *    퍼머데스가 "피해야 할 실패"로 격하된다. 죽음은 이 게임의 규칙이지 벌점이 아니다.
 * 3. 그래서 사망을 **요구하는** 과제는 절대 두지 않는다. 상실을 보상으로 바꾸면
 *    영웅을 일부러 버리는 것이 최적 플레이가 된다 — 정확히 반대 방향이다.
 * 4. 과제 보상은 **유물을 포함할 수 있다.** 상점에서 못 사는 것을 여기서 준다.
 *    (금으로 최상급을 살 수 있으면 등반이 아니라 지갑이 강함을 정한다 — data/gear.ts)
 * 5. 한 번 달성하면 끝이다. 반복 파밍 대상이 아니다.
 */
import type { GearDefId, GearRank } from '../types';

/** 과제 판정에 필요한 전투 요약. 스토어가 전투 결과에서 뽑아 넘긴다. */
export interface QuestContext {
  /** 돌파한 층 id */
  floorId: number;
  /** 소요 턴 */
  turnsElapsed: number;
  /** 이번 전투 사망자 수 */
  deaths: number;
  /** 출전 인원 */
  partySize: number;
  /** 파티 전원이 만피로 끝났는가 (무피해 돌파) */
  flawless: boolean;
  /** 이번 전투에 포션을 한 개도 안 썼는가 */
  noPotion: boolean;
  /** 이번 런 누적 사망자 수 */
  totalDeaths: number;
  /** 보호 대상(수비/호위)이 살아남았는가. 대상이 없는 층이면 true */
  guardsAlive: boolean;
}

export type QuestId = string & { readonly __brand: 'QuestId' };

export interface QuestDef {
  id: QuestId;
  name: string;
  /** 화면에 그대로 나가는 조건 설명 */
  desc: string;
  /** 이 층을 돌파했을 때만 판정한다 */
  floorId: number;
  /** 조건. 전투 요약만 보고 판정한다 (순수 함수) */
  check: (c: QuestContext) => boolean;
  reward: QuestReward;
}

export interface QuestReward {
  gold?: number;
  promotionStones?: number;
  potions?: number;
  /** 확정 지급 장비 */
  gear?: GearDefId;
  /** 등급만 지정하고 종류는 뽑는다 */
  gearRank?: GearRank;
}

const q = (id: string) => id as QuestId;

/**
 * 과제 목록.
 *
 * 층마다 하나씩 두되 **그 층의 임무 성격을 되묻는 형태**로 잡았다.
 * 수비 층은 대상을 지키라 하고, 탈출 층은 빠르게 나가라 한다 —
 * 층을 한 번 더 이해해야 달성되도록.
 *
 * 유물은 12층(최종 보스)에만 걸려 있다. 그 전에 나오면 이후 등반이 무의미해진다.
 */
export const QUESTS: QuestDef[] = [
  {
    id: q('f1_swift'),
    name: '망설임 없이',
    desc: '1층을 5턴 이내에 돌파',
    floorId: 1,
    check: (c) => c.turnsElapsed <= 5,
    reward: { gold: 200, potions: 1 },
  },
  {
    id: q('f2_flawless'),
    name: '흠 없는 진군',
    desc: '2층을 전원 무피해로 돌파',
    floorId: 2,
    check: (c) => c.flawless,
    reward: { gold: 300, gearRank: 'common' },
  },
  {
    id: q('f3_endure'),
    name: '버텨낸 자들',
    desc: '3층을 사망자 없이 돌파',
    floorId: 3,
    check: (c) => c.deaths === 0,
    reward: { gold: 350, potions: 2 },
  },
  {
    id: q('f4_gatekeeper'),
    name: '문은 부서지지 않았다',
    desc: '4층을 성문이 버틴 채 돌파',
    floorId: 4,
    check: (c) => c.guardsAlive,
    reward: { gold: 450, gearRank: 'fine' },
  },
  {
    id: q('f5_escort'),
    name: '약속을 지켰다',
    desc: '5층을 황녀와 파티 전원이 살아서 돌파',
    floorId: 5,
    check: (c) => c.guardsAlive && c.deaths === 0,
    reward: { gold: 500, promotionStones: 1 },
  },
  {
    id: q('f6_golem'),
    name: '맨손으로 균열을',
    desc: '6층을 포션 없이 돌파',
    floorId: 6,
    check: (c) => c.noPotion,
    reward: { gold: 700, gearRank: 'rare' },
  },
  {
    id: q('f7_outnumbered'),
    name: '수가 전부는 아니다',
    desc: '7층을 3명 이하로 돌파',
    floorId: 7,
    check: (c) => c.partySize <= 3,
    reward: { gold: 800, gearRank: 'fine' },
  },
  {
    id: q('f8_escape'),
    name: '무너지기 전에',
    desc: '8층을 사망자 없이 돌파',
    floorId: 8,
    check: (c) => c.deaths === 0,
    reward: { gold: 900, potions: 3 },
  },
  {
    id: q('f9_depot'),
    name: '보급고는 무사하다',
    desc: '9층을 보급고가 버틴 채 돌파',
    floorId: 9,
    check: (c) => c.guardsAlive,
    reward: { gold: 1000, gearRank: 'rare' },
  },
  {
    id: q('f10_revenant'),
    name: '망령을 잠재우고',
    desc: '10층을 8턴 이내에 돌파',
    floorId: 10,
    check: (c) => c.turnsElapsed <= 8,
    reward: { gold: 1200, promotionStones: 2 },
  },
  {
    id: q('f11_seize'),
    name: '문지기만 베었다',
    desc: '11층을 6턴 이내에 돌파',
    floorId: 11,
    check: (c) => c.turnsElapsed <= 6,
    reward: { gold: 1400, gearRank: 'rare' },
  },
  {
    id: q('f12_envoy'),
    name: '첨탑을 넘어',
    desc: '12층을 사절과 파티 전원이 살아서 돌파',
    floorId: 12,
    // 12층은 더 이상 최종 층이 아니다(상층 신설). 유물은 최종 층에만 둔다는 규칙에 따라
    // 보상을 희귀 등급으로 낮췄다 — 여기서 유물이 새면 13~20층 등반이 무의미해진다.
    check: (c) => c.guardsAlive && c.deaths === 0,
    reward: { gold: 2000, gearRank: 'rare' },
  },
  // ------------------------------------------------------------
  // 상층 (13~20층)
  // ------------------------------------------------------------
  {
    id: q('f14_seraph'),
    name: '빛을 끄다',
    desc: '14층을 6턴 이내에 돌파',
    floorId: 14,
    check: (c) => c.turnsElapsed <= 6,
    reward: { gold: 1600, promotionStones: 2 },
  },
  {
    id: q('f15_altar'),
    name: '제단은 무사하다',
    desc: '15층을 제단이 버틴 채 돌파',
    floorId: 15,
    check: (c) => c.guardsAlive,
    reward: { gold: 1800, gearRank: 'rare' },
  },
  {
    id: q('f17_river'),
    name: '불타는 강을 건너',
    desc: '17층을 한 명도 잃지 않고 돌파',
    floorId: 17,
    check: (c) => c.deaths === 0,
    reward: { gold: 2200, gearRank: 'rare' },
  },
  {
    id: q('f20_sovereign'),
    name: '재의 군주를 넘어',
    desc: '20층을 파티 전원이 살아서 돌파',
    floorId: 20,
    // 20층은 더 이상 최종 층이 아니다(생성 구간 신설). 유물은 최종 층에만 둔다는
    // 규칙에 따라 희귀 등급으로 낮췄다 — 여기서 유물이 새면 21층 이후가 무의미해진다.
    check: (c) => c.deaths === 0,
    reward: { gold: 3000, gearRank: 'rare' },
  },
  {
    id: q('f100_summit'),
    name: '탑을 베는 자',
    desc: '최상층을 파티 전원이 살아서 돌파',
    floorId: 100,
    check: (c) => c.deaths === 0,
    reward: { gold: 12000, gear: 'w_towerbane_t10' as GearDefId },
  },
  /**
   * 등반 전체를 관통하는 과제.
   *
   * floorId 100은 "최종 층 돌파 시점에 판정한다"는 뜻이지 그 층의 조건이 아니다.
   * 무사 완주 보상을 유물로 두되, 위 f100과 달리 **런 전체 누적**을 본다.
   *
   * ⚠️ 최종 층을 늘리면 이 두 과제의 floorId도 함께 옮겨야 한다.
   * quest.test.ts의 "유물 보상은 최종 층에만"이 FLOORS에서 파생해 잠그고 있다.
   * 실제로 12→20층, 20→100층 확장 때 두 번 다 이 테스트가 잡아냈다.
   */
  {
    id: q('run_nodeath'),
    name: '아무도 잃지 않았다',
    desc: '한 명도 잃지 않고 탑을 완주',
    floorId: 100,
    check: (c) => c.totalDeaths === 0,
    reward: { gold: 12000, gear: 't_lastlight_t10' as GearDefId },
  },
];

/** 해당 층에서 판정할 과제들 */
export function questsForFloor(floorId: number): QuestDef[] {
  return QUESTS.filter((quest) => quest.floorId === floorId);
}

/** id로 조회 */
export function questById(id: QuestId): QuestDef | undefined {
  return QUESTS.find((quest) => quest.id === id);
}
