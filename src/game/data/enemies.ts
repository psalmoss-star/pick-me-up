/**
 * 적 도감 19종.
 *
 * ⚠️ **보스 수치는 칼날이다** (HANDOFF §5-1). 골렘 HP 3200 → 승률 100%, 4300 → 1%.
 *    아래 주석의 "처음엔 X로 냈다가" 기록은 그 도출 근거다 — 지우지 말 것.
 *    수치를 만졌으면 반드시 `npm run sim`으로 승률·사망을 함께 확인한다(§5-22).
 */
import type { EnemyDef, EnemyDefId, SkillId } from '../types';

const id = <T extends string>(s: string) => s as T;

/**
 * 도감 항목의 검사용 타입 — `heroes.ts`의 `HeroDefEntry`와 같은 이유다.
 *
 * `id`만 brand를 벗긴다. 예전엔 배열 전체를 `as EnemyDef[]`로 캐스팅했는데,
 * 같은 모양의 캐스팅이 `heroes.ts`에서 **`attackAttr: 'agi'`를 통째로 삼켰다**(STEP 43).
 */
type EnemyDefEntry = Omit<EnemyDef, 'id'> & { id: string };

export const enemies: Record<EnemyDefId, EnemyDef> = Object.fromEntries(
  ([
    {
      id: 'e_slime',
      name: '잿빛 슬라임',
      element: 'water',
      role: 'dealer',
      stats: { hp: 900, atk: 105, def: 30, spd: 40, crit: 0.03 },
      skillIds: ['sk_slash'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_hound',
      name: '재의 사냥개',
      element: 'fire',
      role: 'dealer',
      stats: { hp: 650, atk: 98, def: 22, spd: 62, crit: 0.10 },
      skillIds: ['sk_slash'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_golem',
      name: '균열의 골렘',
      element: 'earth',
      role: 'tank',
      // ⚠️ 4100 → 4250 (STEP 44). role이 살아나면서 6층이 **쉬워졌다** —
      // 보스 승률 76.7%로 스모크 테스트 상한(75%)을 넘었고, gear.test의
      // "40회 안에 사망" 유도는 400회에 0명이 될 만큼 무해해졌다.
      // 골렘은 **단독 출현**이라 어그로 재분배가 이득도 손해도 아닌데,
      // 아군이 도발에 끌려다니지 않게 되면서 딜이 온전히 들어간 것이다.
      //
      // 4400 → 보스 62.0% / 6층 59%·사망 1.54 (기준선 70%·1.35보다 어렵다)
      // 4250 → 보스 68.0% / 6층 65%·사망 1.40  ← 채택. 기준선에 가장 가깝다
      stats: { hp: 4250, atk: 190, def: 55, spd: 44, crit: 0.08 },
      skillIds: ['sk_maul', 'sk_taunt_hit'] as SkillId[],
      isBoss: true,
    },
    // --- 중층(7~12층)용. 상성표의 wind/thunder 축을 여기서 처음 사용한다 ---
    {
      id: 'e_wisp',
      name: '떠도는 불씨',
      element: 'wind',
      role: 'dealer',
      // 물몸 고속 딜러. 방치하면 누적 피해가 크지만 한 대에 정리된다.
      stats: { hp: 1150, atk: 178, def: 28, spd: 78, crit: 0.15 },
      skillIds: ['sk_spark'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_warden',
      name: '녹슨 파수병',
      element: 'thunder',
      role: 'tank',
      // 수비/호위 층의 압박용. 딜은 낮고 대신 잘 죽지 않아 턴을 잡아먹는다.
      stats: { hp: 2600, atk: 148, def: 68, spd: 38, crit: 0.05 },
      skillIds: ['sk_taunt_hit', 'sk_guard'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_revenant',
      name: '재의 망령',
      element: 'water',
      role: 'breaker',
      // 회복 없는 파티를 처벌한다. 단일 고화력.
      stats: { hp: 1500, atk: 132, def: 30, spd: 52, crit: 0.10 },
      skillIds: ['sk_rend', 'sk_slash'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_tyrant',
      name: '폭풍의 폭군',
      element: 'wind',
      role: 'breaker',
      // 12층 보스. 골렘이 '버티는' 보스라면 이쪽은 '때리는' 보스다.
      stats: { hp: 5900, atk: 218, def: 50, spd: 64, crit: 0.12 },
      skillIds: ['sk_maul', 'sk_rend'] as SkillId[],
      isBoss: true,
    },
    // --- 상층(13~20층)용 ---
    //
    // 중층 적을 그대로 쓰면 8개 층이 난이도 평지가 된다. 다만 수치만 올린 상위
    // 호환을 만들면 층마다 같은 전투가 반복되므로, 각자 **다른 것을 처벌하도록** 짰다.
    {
      id: 'e_seraph',
      name: '타락한 세라프',
      element: 'thunder',
      role: 'dealer',
      // 광역 딜러. 파티를 넓게 깎아 힐러 한 명으로는 못 메우게 만든다.
      // 물몸(def 34)이라 먼저 자르면 사라진다 — 처리 순서를 묻는 적.
      stats: { hp: 2200, atk: 205, def: 34, spd: 82, crit: 0.14 },
      skillIds: ['sk_maul', 'sk_spark'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_colossus',
      name: '무쇠 거상',
      element: 'earth',
      role: 'tank',
      // 상층의 도발 담당. §5-11 — 도발 적이 없으면 힐러가 먼저 죽어 승률이
      // 0%/100%로 굳고 수치 조정이 먹지 않는다. 상층에도 반드시 한 축 있어야 한다.
      stats: { hp: 4800, atk: 176, def: 92, spd: 34, crit: 0.05 },
      skillIds: ['sk_taunt_hit', 'sk_guard'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_wraith',
      name: '심연의 원귀',
      element: 'water',
      role: 'breaker',
      // 방깎 단일 고화력. 탱커를 녹여 뒷줄을 여는 역할이라 거상과 짝지으면
      // "도발을 믿고 버티기"가 통하지 않는다.
      stats: { hp: 2400, atk: 196, def: 40, spd: 68, crit: 0.16 },
      skillIds: ['sk_rend', 'sk_slash'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_sovereign',
      name: '재의 군주',
      element: 'fire',
      role: 'breaker',
      // 20층 보스. 골렘=버티는 보스, 폭군=때리는 보스, 군주=둘 다.
      // 광역+방깎이라 장기전이 성립하지 않는다 — 화력으로 끊어야 한다.
      //
      // ⚠️ 처음엔 hp 8600·atk 244로 냈다가 승률 80%·턴 15.3이 나왔다. 어려운 게 아니라
      // **긴** 것이었다 — HP만 높고 화력이 모자라면 지루한 소모전이 된다.
      // HP를 낮추고 공격력을 올려 '짧고 위험하게' 뒤집는다. 최상층은 길이가 아니라 무게다.
      stats: { hp: 7400, atk: 286, def: 74, spd: 70, crit: 0.14 },
      skillIds: ['sk_maul', 'sk_rend'] as SkillId[],
      isBoss: true,
    },
    // ------------------------------------------------------------
    // 확장 적 — 21층 이후 생성기용 풀.
    //
    // 문제였던 것: 11종이 dealer/tank/breaker 셋뿐이라 **적 진영에 힐러도 서포터도 없었다.**
    // 보스 3종은 스킬 조합이 사실상 둘(maul+taunt / maul+rend)이라 전부 "광역으로 시작"했다.
    // 여기서는 **역할과 행동**을 늘린다 — 수치만 높은 상위 호환은 만들지 않는다.
    // ------------------------------------------------------------
    {
      id: 'e_hexweaver',
      name: '주술을 엮는 자',
      element: 'water',
      role: 'support',
      // 최초의 적 서포터. 직접 죽이지 않고 파티를 **느리고 약하게** 만든다.
      // 물몸이라 먼저 자를 수 있지만, 그러면 딜러를 방치하게 된다.
      stats: { hp: 1900, atk: 150, def: 36, spd: 74, crit: 0.06 },
      skillIds: ['sk_sap', 'sk_mire'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_grovekeeper',
      name: '숲을 지키는 것',
      element: 'earth',
      role: 'healer',
      // 최초의 적 힐러. "화력을 모아 끊는다"는 판단을 처음으로 요구한다.
      // 방어가 높아 찔끔 때려서는 회복량을 못 넘는다.
      stats: { hp: 2800, atk: 168, def: 70, spd: 46, crit: 0.05 },
      skillIds: ['sk_siphon', 'sk_bulwark'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_plaguebearer',
      name: '역병을 나르는 것',
      element: 'wind',
      role: 'dealer',
      // 도트 전문. 즉발이 약해 한 턴만 보면 순해 보이는데 장기전에서 무너뜨린다.
      // 수비/생존처럼 **턴을 버텨야 하는 임무**에서 특히 아프다.
      stats: { hp: 2100, atk: 162, def: 40, spd: 70, crit: 0.08 },
      skillIds: ['sk_venom', 'sk_emberfall'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_direwolf',
      name: '굶주린 큰늑대',
      element: 'fire',
      role: 'dealer',
      // 저·중층용 속공. 사냥개의 상위지만 **독을 문다**는 점이 다르다.
      stats: { hp: 1300, atk: 155, def: 26, spd: 88, crit: 0.18 },
      skillIds: ['sk_venom', 'sk_slash'] as SkillId[],
      isBoss: false,
    },
    {
      id: 'e_stonewarden',
      name: '돌결의 감시자',
      element: 'earth',
      role: 'tank',
      // 도발 + 보호막. 기존 탱커(방벽=방어 버프)와 달리 **피해를 흡수**해
      // 광역으로 뭉개는 전략을 막는다.
      stats: { hp: 3600, atk: 158, def: 80, spd: 40, crit: 0.05 },
      skillIds: ['sk_taunt_hit', 'sk_bulwark'] as SkillId[],
      isBoss: false,
    },
    // --- 보스 ---
    {
      id: 'e_hierophant',
      name: '잿빛 교주',
      element: 'water',
      role: 'healer',
      // **회복하는 보스.** 기존 보스가 전부 "때리는" 쪽이라 화력만 올리면 됐는데,
      // 이쪽은 딜을 끊으면 원상복구된다 — 처음으로 "빨리 끝내야 하는" 보스다.
      //
      // ⚠️ HP 6800으로 냈더니 **19.1턴**이 걸렸다. 어려운 게 아니라 긴 것이다
      // (군주에서 이미 겪은 함정 — §STEP 9). 자힐하는 보스는 HP를 낮게 잡아야 한다.
      // HP를 줄이고 공격력을 올려 "짧고 위험하게" 만든다.
      stats: { hp: 5400, atk: 258, def: 66, spd: 62, crit: 0.10 },
      skillIds: ['sk_siphon', 'sk_emberfall', 'sk_rally'] as SkillId[],
      isBoss: true,
    },
    {
      id: 'e_blightlord',
      name: '창궐의 주인',
      element: 'wind',
      role: 'breaker',
      // **도트 보스.** 즉발이 낮은 대신 중독·화상이 계속 쌓인다.
      // 오래 끌수록 불리하므로 폭군(순수 화력)과 반대 방향의 압박이다.
      stats: { hp: 7600, atk: 244, def: 68, spd: 66, crit: 0.12 },
      skillIds: ['sk_emberfall', 'sk_venom', 'sk_sap'] as SkillId[],
      isBoss: true,
    },
    {
      id: 'e_warcaller',
      name: '전열을 부르는 자',
      element: 'thunder',
      role: 'support',
      // **버티는 보스.** 결계로 자기 진영을 감싸고 규합으로 디버프를 씻는다.
      // 도트·기절 위주 공략을 무력화하므로 순수 화력이 답이 되는 보스다.
      //
      // ⚠️ 보호막까지 겹치면 전투가 길어진다(15.3턴). 교주와 같은 이유로
      // HP를 낮추고 화력을 올렸다 — 버티는 성질은 결계에서 나오지 HP에서 나오는 게 아니다.
      stats: { hp: 5800, atk: 250, def: 84, spd: 58, crit: 0.09 },
      skillIds: ['sk_bulwark', 'sk_rally', 'sk_maul'] as SkillId[],
      isBoss: true,
    },
    {
      id: 'e_ashking',
      name: '재를 쓰는 왕',
      element: 'fire',
      role: 'breaker',
      /**
       * **100층 전용 최종 보스.**
       *
       * ── 왜 전용 보스가 필요했나 ──────────────────────────
       * 100층이 90층과 **같은 적(재의 군주)**을 썼다. 깊이 배수만 다른 셈이라
       * 최종 보스에 새로울 게 없었고, 보스 감쇠를 0.45로 낮추자
       * **100층이 97%·사망 0.36으로 90층(78%·1.13)보다 쉬워지는 역전**이 났다.
       * 한쪽만 조절할 수 없는 구조였으므로 층을 갈랐다.
       *
       * ── 무엇을 묻는 보스인가 ────────────────────────────
       * 기존 보스는 각자 다른 질문을 한다: 교주=회복(빨리 끝내라) ·
       * 창궐=도트(끌지 마라) · 전열=결계(화력으로 뚫어라) · 군주=둘 다.
       * 이 보스는 **파티의 강점을 빼앗는다** — `sk_sap`이 제일 센 아군의 공격력을
       * 정확히 깎고(highestAtk), `sk_mire`가 둘의 속도를 늦춘다.
       * 그래서 "한 명에게 몰아준 파티"가 가장 크게 흔들린다 —
       * 100층까지 올라온 플레이어가 대개 그렇게 짜므로 마지막에 그것을 되묻는다.
       *
       * ⚠️ **자힐·결계를 주지 않았다.** 군주(15.4턴)·교주(19.1턴)·전열(15.3턴)이
       * 전부 "어려운 게 아니라 **긴**" 함정을 밟았다(§STEP 9). 여기에 회복까지 얹으면
       * 같은 실수를 최종 보스에서 반복한다. 무게는 화력과 디버프로 내고 길이는 짧게 둔다.
       *
       * 수치는 실측으로 잡았다 — `scripts/floor-tune.mts`가 보스 층은 안 건드리므로
       * 여기 값이 곧 100층의 난이도다. 90층보다 확실히 무거워야 한다.
       *
       * 실측 (기준 파티 / 대체 파티, 300회):
       *   hp 8200·atk 300 → 73%·사망 0.94·**16.3턴**  ← 길다
       *   hp 7000·atk 330 → 66%·사망 1.19·15.3턴
       *   **hp 6200·atk 345 → 65%·사망 1.26·14.7턴 / 53%·1.79**  ★채택
       * HP를 깎고 화력을 올릴수록 짧고 무거워진다 — 교주·전열에서 쓴 방법 그대로다.
       * 90층(82%·0.92)보다 어렵고, 이기면 한 명 이상 값을 치른다.
       */
      stats: { hp: 6200, atk: 345, def: 74, spd: 72, crit: 0.16 },
      skillIds: ['sk_maul', 'sk_sap', 'sk_mire'] as SkillId[],
      isBoss: true,
    },
  ] satisfies EnemyDefEntry[]).map((e) => [e.id, e]),
) as Record<EnemyDefId, EnemyDef>;

export const ENEMY = {
  slime: id<EnemyDefId>('e_slime'),
  hound: id<EnemyDefId>('e_hound'),
  golem: id<EnemyDefId>('e_golem'),
  wisp: id<EnemyDefId>('e_wisp'),
  warden: id<EnemyDefId>('e_warden'),
  revenant: id<EnemyDefId>('e_revenant'),
  tyrant: id<EnemyDefId>('e_tyrant'),
  seraph: id<EnemyDefId>('e_seraph'),
  colossus: id<EnemyDefId>('e_colossus'),
  wraith: id<EnemyDefId>('e_wraith'),
  sovereign: id<EnemyDefId>('e_sovereign'),
  hexweaver: id<EnemyDefId>('e_hexweaver'),
  grovekeeper: id<EnemyDefId>('e_grovekeeper'),
  plaguebearer: id<EnemyDefId>('e_plaguebearer'),
  direwolf: id<EnemyDefId>('e_direwolf'),
  stonewarden: id<EnemyDefId>('e_stonewarden'),
  hierophant: id<EnemyDefId>('e_hierophant'),
  blightlord: id<EnemyDefId>('e_blightlord'),
  warcaller: id<EnemyDefId>('e_warcaller'),
  ashking: id<EnemyDefId>('e_ashking'),
};
