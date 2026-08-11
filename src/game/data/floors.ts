/**
 * 층 정의.
 *
 * 프로토타입의 인라인 FLOORS를 대체한다.
 * 밸런스 수치(적 구성/보호 대상 HP/요구 턴)는 전부 여기 있고 코드에는 없다.
 *
 * FloorSpec이 층의 유일한 형태다. (types.ts에 있던 FloorDef는 인카운터/보상 중심의
 * 초기 설계였고 엔진이 쓰지 않아 2026-08-10에 제거했다.)
 */
import type { EnemyDefId } from '../types';
import type { GuardDef, Mission } from '../mission';
import { ENEMY } from './sample';
import { generateFloor, HANDCRAFTED_UNTIL, TIERS, TOWER_HEIGHT } from './floorgen';

/** 층 배경 종류 — src/ui/art/Scene.tsx의 SceneKind와 일치해야 한다 */
export type FloorScene = 'ruins' | 'field' | 'outpost' | 'gate' | 'corridor' | 'chasm';

export interface FloorSpec {
  id: number;
  name: string;
  scene: FloorScene;
  mission: Mission;
  enemyIds: EnemyDefId[];
  /** 수비/호위 대상. 없으면 생략 */
  guards?: GuardDef[];
  isBoss?: boolean;
}

/**
 * 손으로 짠 층 1~20.
 *
 * 이 구간은 **생성기가 건드리지 않는다.** 각 층에 "10층은 도발이 없어 전멸했다" 같은
 * 개별 사연이 있고, 실측으로 잡은 승률 표(§STEP 9)가 여기 걸려 있다.
 */
const HANDCRAFTED: FloorSpec[] = [
  {
    id: 1,
    name: '무너진 관문',
    scene: 'ruins',
    mission: { kind: 'subjugate', briefing: '길을 막은 것들을 치워라.' },
    enemyIds: [ENEMY.slime, ENEMY.hound],
  },
  {
    id: 2,
    name: '재의 들판',
    scene: 'field',
    mission: { kind: 'subjugate', briefing: '적을 섬멸하라!' },
    enemyIds: [ENEMY.slime, ENEMY.slime],
  },
  {
    id: 3,
    name: '버려진 초소',
    scene: 'outpost',
    mission: { kind: 'survive', turns: 6, briefing: '지원이 도착할 때까지 6턴간 살아남아라!' },
    enemyIds: [ENEMY.hound, ENEMY.hound],
  },
  {
    id: 4,
    name: '성문 앞',
    scene: 'gate',
    mission: { kind: 'defend', turns: 7, briefing: '성문이 무너지기 전에 7턴을 버텨라!' },
    enemyIds: [ENEMY.hound, ENEMY.hound],
    guards: [{ id: 'gate', name: '성문', kind: 'objective', hp: 850, def: 16 }],
  },
  {
    id: 5,
    name: '무너진 회랑',
    scene: 'corridor',
    mission: { kind: 'escort', briefing: '황녀를 살린 채 적을 섬멸하라!' },
    enemyIds: [ENEMY.hound, ENEMY.slime],
    guards: [{ id: 'princess', name: '황녀', kind: 'npc', hp: 1300, def: 24 }],
  },
  {
    id: 6,
    name: '균열의 심장',
    scene: 'chasm',
    mission: { kind: 'subjugate', briefing: '균열의 골렘을 토벌하라!' },
    enemyIds: [ENEMY.golem],
    isBoss: true,
  },
  // ------------------------------------------------------------
  // 중층 (7~12층)
  //
  // 1~6층은 '규칙을 가르치는' 구간이라 승률 98~100%가 의도된 것이다.
  // 7층부터는 매 층이 사망을 각오해야 하는 구간이며, 승률을 90% 아래로 유지한다.
  // 여기서 처음으로 wind/thunder 적이 등장해 상성표 전체가 쓰인다.
  // ------------------------------------------------------------
  {
    id: 7,
    name: '잿바람 고개',
    scene: 'field',
    mission: { kind: 'subjugate', briefing: '불씨가 흩어지기 전에 태워버려라!' },
    // 물몸 고속 딜러 3기 — 광역이 없는 파티는 누적 피해를 감당해야 한다.
    enemyIds: [ENEMY.wisp, ENEMY.wisp, ENEMY.hound],
  },
  {
    id: 8,
    name: '봉쇄된 계단',
    scene: 'corridor',
    // 정의만 있고 한 번도 쓰이지 않던 탈출 임무를 여기서 처음 사용한다.
    mission: { kind: 'escape', turns: 7, briefing: '길이 무너진다. 7턴간 버틴 뒤 이탈하라!' },
    enemyIds: [ENEMY.warden, ENEMY.wisp, ENEMY.wisp],
  },
  {
    id: 9,
    name: '파수병의 안뜰',
    scene: 'outpost',
    mission: { kind: 'defend', turns: 8, briefing: '보급고가 부서지기 전에 8턴을 사수하라!' },
    enemyIds: [ENEMY.warden, ENEMY.hound, ENEMY.hound],
    guards: [{ id: 'depot', name: '보급고', kind: 'objective', hp: 1150, def: 20 }],
  },
  {
    id: 10,
    name: '재의 묘역',
    scene: 'ruins',
    mission: { kind: 'subjugate', briefing: '망령을 잠재워라!' },
    // 망령 2기는 도발이 없어 힐러를 직접 노린다 → 힐러가 먼저 죽고 전멸(승률 0%)했다.
    // 파수병을 섞어 어그로를 분산시킨다. 스탯이 아니라 구성으로 푸는 문제였다.
    enemyIds: [ENEMY.revenant, ENEMY.warden, ENEMY.slime],
  },
  {
    id: 11,
    name: '폭군의 성문',
    scene: 'gate',
    // 탈취 임무 최초 사용. targetIndex는 enemyIds 배열 기준이다.
    mission: {
      kind: 'seize', targetIndex: 0,
      briefing: '문지기를 베고 성문을 열어라! 나머지는 상대하지 않아도 된다.',
    },
    enemyIds: [ENEMY.warden, ENEMY.revenant, ENEMY.slime],
  },
  {
    id: 12,
    name: '무너지는 첨탑',
    scene: 'chasm',
    mission: {
      kind: 'escort',
      // 기본 호위 focus(0.6)는 폭군의 화력에서 사절이 4턴 만에 부서진다.
      // 보스전은 보스를 상대할 시간이 나와야 성립하므로 여기만 낮춘다.
      enemyFocus: { kind: 'npc', chance: 0.3 },
      briefing: '사절을 살린 채 폭군을 토벌하라!',
    },
    enemyIds: [ENEMY.tyrant, ENEMY.wisp],
    guards: [{ id: 'envoy', name: '사절', kind: 'npc', hp: 2400, def: 34 }],
    isBoss: true,
  },
  // ------------------------------------------------------------
  // 상층 (13~20층)
  //
  // 중층이 '매 층 사망을 각오하는' 구간이라면, 상층은 **구성이 틀리면 못 넘는** 구간이다.
  // 목표 승률은 40~75%(9층 같은 숨돌림 층만 예외). 100%도 0%도 두지 않는다 —
  // 0%는 대개 밸런스가 아니라 구성 문제이고(§5-11), 100%는 층을 둔 의미가 없다.
  //
  // 층 배치 원칙: 보스(16·20층) 앞에는 반드시 숨돌림 층을 둔다. 연속 학살은 지친다.
  // ------------------------------------------------------------
  {
    id: 13,
    name: '무쇠 계단',
    scene: 'corridor',
    mission: { kind: 'subjugate', briefing: '거상이 길을 막았다. 부숴라!' },
    // 상층 첫 층 — 거상으로 '이제 도발을 못 뚫으면 시간이 간다'를 가르친다.
    // 거상+불씨만으로는 100%(측정함)라 도입부로도 무르다. 세라프를 얹어 광역으로 압박한다.
    // 16층은 같은 거상을 쓰되 원귀(방깎)를 짝지어 다른 축으로 민다 — 구성을 겹치면
    // 두 층이 수치까지 똑같은 전투가 된다(실제로 13·16층이 79%/1.01/10.6로 동일했다).
    enemyIds: [ENEMY.colossus, ENEMY.seraph, ENEMY.wisp],
  },
  {
    id: 14,
    name: '빛바랜 성소',
    scene: 'outpost',
    mission: { kind: 'subjugate', briefing: '세라프가 타락했다. 잠재워라!' },
    // 세라프 2기 = 광역이 겹친다. 힐러 하나로는 못 메우므로 빨리 자르는 게 정답.
    enemyIds: [ENEMY.seraph, ENEMY.seraph, ENEMY.hound],
  },
  {
    id: 15,
    name: '침묵의 제단',
    scene: 'ruins',
    mission: { kind: 'defend', turns: 8, briefing: '제단이 부서지기 전에 8턴을 사수하라!' },
    // 보스(16층) 직전의 숨돌림. 수비는 적을 죽일 필요가 없어 구조적으로 안전하다(9층과 같은 역할).
    //
    // ⚠️ 처음엔 제단 HP 1600·def 26으로 냈다가 승률 26%가 나왔다. 파티가 죽은 게 아니라
    // (사망 0.01) **제단이 먼저 부서졌다** — 원귀의 방깎 앞에서 def 26은 없는 것과 같다.
    // 숨돌림 층이 되려면 보호 대상이 8턴을 실제로 버텨야 한다. 스탯이 아니라 역할의 문제였다.
    enemyIds: [ENEMY.wraith, ENEMY.warden, ENEMY.wisp],
    guards: [{ id: 'depot', name: '제단', kind: 'objective', hp: 3400, def: 52 }],
  },
  {
    id: 16,
    name: '군주의 앞뜰',
    scene: 'gate',
    mission: { kind: 'subjugate', briefing: '군주의 그림자를 먼저 걷어내라!' },
    // 중간 보스급 밀도 — 거상(도발) + 원귀(방깎). 도발을 믿고 버티면 탱커가 녹는다.
    //
    // ⚠️ 원귀 2기로 냈더니 승률 8%(사망 2.85 = 사실상 전멸)였다. 방깎이 겹치면
    // 탱커가 2턴 만에 종잇장이 되고, 그 뒤로는 무엇을 해도 복구가 안 된다.
    // 같은 디버프를 주는 적을 겹쳐 쌓지 말 것 — 중첩은 선형이 아니라 급격하다.
    enemyIds: [ENEMY.colossus, ENEMY.wraith, ENEMY.wisp],
  },
  {
    id: 17,
    name: '재의 강',
    scene: 'field',
    mission: { kind: 'escape', turns: 8, briefing: '강이 불탄다. 8턴간 버틴 뒤 건너라!' },
    // 탈출은 8층에서 한 번 쓰고 방치돼 있었다. 상층에서 다시 쓰되 압박을 올린다.
    enemyIds: [ENEMY.seraph, ENEMY.wraith, ENEMY.wisp],
  },
  {
    id: 18,
    name: '깨어진 왕좌',
    scene: 'chasm',
    mission: {
      kind: 'seize', targetIndex: 0,
      briefing: '옥좌의 파수를 베어라! 나머지는 상대하지 않아도 된다.',
    },
    // 탈취 대상이 거상(HP 4800·def 92)이라 '한 놈만 팬다'가 처음으로 어렵다.
    //
    // ⚠️ 호위 적을 세라프+원귀로 두면 23%다. 탈취는 대상만 잡으면 끝나는 임무인데,
    // 주변 적이 너무 강하면 대상을 팰 시간 자체가 안 나와 임무 종류가 무의미해진다.
    // 대상은 단단하게 두되(거상 유지) 주변을 가볍게 해서 '집중'이 보상받게 한다.
    // 13층도 거상을 쓰므로 호위 구성을 달리한다 — 같으면 같은 전투가 된다.
    // 망령+불씨로 내렸더니 100%(사망 0.10)라 너무 물렀다. 원귀를 더해 무게를 되돌린다.
    enemyIds: [ENEMY.colossus, ENEMY.revenant, ENEMY.wraith],
  },
  {
    id: 19,
    name: '잿빛 회랑',
    scene: 'corridor',
    mission: { kind: 'escort', briefing: '생존자를 살린 채 길을 뚫어라!' },
    // 최종 보스 직전 숨돌림. 호위지만 적 밀도를 낮춰 전력을 보존하고 20층에 보낸다.
    // 다만 99%는 층을 둔 의미가 없다(측정함). 숨돌림이지 공짜는 아니어야 한다.
    //
    // ⚠️ 세라프 2기로 올렸더니 25%로 뒤집혔다 — 광역이 겹치면 호위 대상이 먼저 부서진다.
    // 호위 층에서 광역 딜러를 겹쳐 쌓지 말 것(16층의 방깎 중첩과 같은 함정).
    // 세라프 1기 + 사냥개로 되돌려 숨돌림 자리를 지킨다.
    enemyIds: [ENEMY.seraph, ENEMY.wraith, ENEMY.hound],
    guards: [{ id: 'envoy', name: '생존자', kind: 'npc', hp: 2600, def: 36 }],
  },
  {
    id: 20,
    name: '잿불의 옥좌',
    scene: 'chasm',
    mission: { kind: 'subjugate', briefing: '재의 군주를 토벌하라!' },
    // 최상층 보스. 호위 대상을 두지 않는다 — 12층이 이미 '보스+호위'를 했고,
    // 마지막은 변수를 줄여 순수하게 전력으로 겨루게 한다.
    enemyIds: [ENEMY.sovereign, ENEMY.colossus],
    isBoss: true,
  },
];

/**
 * 21층 이후를 생성해 붙인다.
 *
 * **왜 배열로 펼치는가** — `FLOORS.length`를 읽는 곳이 이미 여럿이다
 * (TowerMap, 과제 판정, isFinalFloor, 테스트…). 생성기를 별도 경로로 두면
 * 그 전부가 "20층까지"로 남아 조용히 어긋난다. 배열 하나를 유지하는 편이 안전하다.
 *
 * 100층 × FloorSpec 하나당 수백 바이트라 메모리도 문제되지 않는다.
 * 생성이 결정적이므로 이 배열은 실행할 때마다 **완전히 동일하다.**
 */
export const FLOORS: FloorSpec[] = [
  ...HANDCRAFTED,
  ...Array.from(
    { length: TOWER_HEIGHT - HANDCRAFTED_UNTIL },
    (_, i) => generateFloor(HANDCRAFTED_UNTIL + 1 + i),
  ),
];

export function floorAt(index: number): FloorSpec {
  return FLOORS[Math.max(0, Math.min(FLOORS.length - 1, index))];
}

/**
 * 이 층을 깨면 탑이 끝나는가.
 *
 * `runStore.finish()`와 `ResultScreen`(엔딩 표시)이 **같은 판정을 두 곳에서** 해야 한다 —
 * 결과 화면은 finish()보다 먼저 뜨므로 스토어의 towerCleared를 읽을 수 없기 때문이다(§5-17).
 * 두 곳이 각자 `floorIndex >= FLOORS.length - 1`을 적으면 층을 늘릴 때 한쪽만 고쳐진다.
 * 판정식을 여기 하나로 가둔다.
 */
export function isFinalFloor(floorIndex: number): boolean {
  return floorIndex >= FLOORS.length - 1;
}

/** 미니맵이 접는 단위. `from`/`to`는 층 번호(1-based, 양끝 포함). */
export interface FloorSegment {
  name: string;
  from: number;
  to: number;
}

/**
 * 탑을 구간으로 나눈다 — 미니맵이 100층을 한 줄로 쏟아내지 않기 위한 것이다.
 *
 * **손으로 짠 1~20층은 `TIERS`에 없다**(생성기가 안 건드리므로 구간 정의가 필요 없었다).
 * 그래서 앞 구간만 여기서 보충하고, 21층 이후는 `TIERS`에서 유도한다 —
 * 구간 경계를 UI에 다시 적으면 `TIERS`를 고칠 때 미니맵만 옛 경계로 남는다(§5-21).
 *
 * ⚠️ **이름이 `sim.ts`와 다르다.** sim은 1~6을 '저층', 7~12를 '중층', 13~20을 '상층'이라
 * 부르는데 `TIERS`는 21~40을 '상층'이라 부른다. 같은 단어가 다른 구간을 가리키므로
 * 앞 구간은 sim의 어휘를 쓰지 않고 **'1~20층'을 그대로 쓴다.** 섞으면 표를 오독한다.
 */
export const FLOOR_SEGMENTS: FloorSegment[] = (() => {
  const out: FloorSegment[] = [];
  if (HANDCRAFTED_UNTIL > 0) {
    out.push({ name: '기슭', from: 1, to: Math.min(HANDCRAFTED_UNTIL, FLOORS.length) });
  }
  for (let i = 0; i < TIERS.length; i++) {
    const from = TIERS[i].from;
    if (from > FLOORS.length) break;
    const to = Math.min(TIERS[i + 1] ? TIERS[i + 1].from - 1 : FLOORS.length, FLOORS.length);
    out.push({ name: TIERS[i].name, from, to });
  }
  return out;
})();

/** 이 층이 속한 구간의 인덱스. 못 찾으면 마지막 구간(범위 밖 보호). */
export function segmentIndexOfFloor(floorId: number): number {
  const i = FLOOR_SEGMENTS.findIndex((s) => floorId >= s.from && floorId <= s.to);
  return i === -1 ? FLOOR_SEGMENTS.length - 1 : i;
}

/**
 * 층 깊이 배수.
 *
 * 이게 없으면 20층 보상이 1층과 **완전히 같다**(실제로 그랬다).
 * 그러면 깊은 층을 오를 이유가 보상에 없고, 무엇보다 파티가 자라지 않아
 * 구간을 이어 오를 수 없다 — 층은 어려워지는데 영웅은 그대로이기 때문이다.
 *
 * k=0.35의 근거(구간을 완주하는 동안 약 2레벨이 오르는 것을 목표로 역산):
 *   저층 1~6   총 1125 exp / 2레벨분 1740 = 0.6배
 *   중층 7~12  총 3816 exp / 2레벨분 4560 = 0.8배
 *   상층 13~20 총 9252 exp / 2레벨분 9400 = 1.0배
 * 깊이 올라갈수록 자급률이 오른다 — 초반은 합성·소환에 기대고, 후반은 등반 자체로
 * 자라도록 의도한 곡선이다. 1배를 넘기면(k=0.5) 합성이 필요 없어져 제단이 죽는다.
 */
const DEPTH_EXP_K = 0.35;

/** 금은 exp보다 완만하게 — 금이 급증하면 상점·강화가 등반보다 강해진다 */
const DEPTH_GOLD_K = 0.12;

export function depthMultiplier(floorId: number, k: number): number {
  return 1 + (floorId - 1) * k;
}

/**
 * 층 클리어 보상.
 * 프로토타입에서 결과 화면에 인라인으로 박혀 있던 계산식을 옮긴 것.
 *
 * ⚠️ exp는 **참전 영웅에게 실제로 지급된다**(`runStore.finish()`).
 * 예전에는 결과 화면이 "Exp +80"을 보여주기만 하고 아무도 안 받아서
 * 싸운 영웅이 영원히 레벨업하지 못했다 — 표시와 동작이 어긋나 있었다.
 */
export function floorRewards(floor: FloorSpec, turnsElapsed: number) {
  return {
    exp: Math.round(turnsElapsed * 20 * depthMultiplier(floor.id, DEPTH_EXP_K)),
    gold: Math.round((180 + turnsElapsed * 12) * depthMultiplier(floor.id, DEPTH_GOLD_K)),
    promotionStones: floor.isBoss ? 3 : 1,
  };
}
