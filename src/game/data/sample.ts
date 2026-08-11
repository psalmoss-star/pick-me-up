/**
 * MVP 검증용 최소 데이터 세트.
 * 확정 후 JSON으로 분리한다 (src/game/data/*.json).
 */
import type {
  Element, EnemyDef, EnemyDefId, HeroDef, HeroDefId,
  Skill, SkillId, Star, StarScaling,
} from '../types';

const id = <T extends string>(s: string) => s as T;

// ------------------------------------------------------------
// 속성 상성: 화 → 풍 → 지 → 뇌 → 수 → 화
// ------------------------------------------------------------
const ADV = 1.5;
const DIS = 0.7;
const NEU = 1.0;

const order: Element[] = ['fire', 'wind', 'earth', 'thunder', 'water'];

export const elementChart: Record<Element, Record<Element, number>> =
  Object.fromEntries(
    order.map((atk, i) => [
      atk,
      Object.fromEntries(
        order.map((def, j) => {
          if ((i + 1) % order.length === j) return [def, ADV];
          if ((j + 1) % order.length === i) return [def, DIS];
          return [def, NEU];
        }),
      ),
    ]),
  ) as Record<Element, Record<Element, number>>;

// ------------------------------------------------------------
// 등급 스케일링
// ------------------------------------------------------------
export const starScaling: Record<Star, StarScaling> = {
  1: { star: 1, maxLevel: 10, statMultiplier: 1.0, promotionStones: 1 },
  2: { star: 2, maxLevel: 20, statMultiplier: 1.35, promotionStones: 3 },
  3: { star: 3, maxLevel: 40, statMultiplier: 1.9, promotionStones: 8 },
  4: { star: 4, maxLevel: 60, statMultiplier: 2.7, promotionStones: 20 },
  5: { star: 5, maxLevel: 80, statMultiplier: 3.8, promotionStones: 0, requiresAwakening: true },
  6: { star: 6, maxLevel: 99, statMultiplier: 5.4, promotionStones: 0 },
};

// ------------------------------------------------------------
// 스킬
// ------------------------------------------------------------
export const skills: Record<SkillId, Skill> = Object.fromEntries(
  ([
    {
      id: 'sk_slash',
      name: '가름',
      description: '적 하나에게 공격력 180% 피해.',
      type: 'active',
      cooldown: 0,
      targetSide: 'enemy',
      targetScope: 'single',
      effects: [{ kind: 'damage', power: 1.8, scalesWith: 'atk' }],
      unlockStar: 1,
    },
    {
      id: 'sk_rend',
      name: '찢는 일격',
      description: '적 하나에게 공격력 250% 피해 + 방어력 감소.',
      type: 'active',
      cooldown: 3,
      targetSide: 'enemy',
      targetScope: 'single',
      effects: [
        { kind: 'damage', power: 2.5, scalesWith: 'atk' },
        { kind: 'debuff', status: 'defDown', duration: 2, chance: 0.7 },
      ],
      unlockStar: 2,
    },
    {
      id: 'sk_guard',
      name: '방벽',
      description: '아군 전체에게 방어력 증가 부여.',
      type: 'active',
      cooldown: 4,
      targetSide: 'ally',
      targetScope: 'all',
      effects: [{ kind: 'buff', status: 'defUp', duration: 3 }],
      unlockStar: 1,
    },
    {
      id: 'sk_taunt_hit',
      name: '강타',
      description: '적 하나에게 방어력 200% 피해.',
      type: 'active',
      cooldown: 0,
      targetSide: 'enemy',
      targetScope: 'single',
      effects: [{ kind: 'damage', power: 2.0, scalesWith: 'def' }],
      unlockStar: 1,
    },
    {
      id: 'sk_mend',
      name: '치유의 빛',
      description: 'HP 비율이 가장 낮은 아군을 공격력 150%만큼 회복.',
      type: 'active',
      cooldown: 3,
      targetSide: 'ally',
      targetScope: 'lowestHp',
      effects: [{ kind: 'heal', power: 1.5, scalesWith: 'atk' }],
      unlockStar: 1,
    },
    {
      id: 'sk_spark',
      name: '전격',
      description: '적 하나에게 공격력 150% 피해 + 기절(30%).',
      type: 'active',
      cooldown: 0,
      targetSide: 'enemy',
      targetScope: 'single',
      effects: [
        { kind: 'damage', power: 1.5, scalesWith: 'atk' },
        { kind: 'debuff', status: 'stun', duration: 1, chance: 0.3 },
      ],
      unlockStar: 1,
    },
    {
      id: 'sk_maul',
      name: '포효 강타',
      description: '적 전체에게 공격력 130% 피해.',
      type: 'active',
      cooldown: 3,
      targetSide: 'enemy',
      targetScope: 'all',
      effects: [{ kind: 'damage', power: 1.3, scalesWith: 'atk' }],
      unlockStar: 1,
    },
    // ------------------------------------------------------------
    // 확장 스킬 — 엔진에 이미 있으나 아무도 쓰지 않던 기능을 꺼낸다.
    //
    // poison/burn(도트) · atkDown/spdDown · shield · cleanse ·
    // random2/highestAtk(타겟팅)이 전부 구현돼 있는데 스킬이 하나도 안 썼다.
    // 새 적을 만들 때 "수치만 다른 상위 호환"이 되지 않으려면 **행동이 달라야** 하고,
    // 그 재료가 여기다. 엔진 변경은 없다.
    // ------------------------------------------------------------
    {
      id: 'sk_venom',
      name: '독니',
      description: '적 하나에게 공격력 110% 피해 + 중독(3턴).',
      type: 'active',
      cooldown: 2,
      targetSide: 'enemy',
      targetScope: 'single',
      // 도트는 즉발이 약한 대신 시간이 갈수록 아프다 → 장기전을 처벌한다.
      effects: [
        { kind: 'damage', power: 1.1, scalesWith: 'atk' },
        { kind: 'debuff', status: 'poison', duration: 3, chance: 0.85 },
      ],
      unlockStar: 1,
    },
    {
      id: 'sk_emberfall',
      name: '잿불 낙하',
      description: '적 전체에게 공격력 90% 피해 + 화상(2턴).',
      type: 'active',
      cooldown: 4,
      targetSide: 'enemy',
      targetScope: 'all',
      // 광역 + 도트. 즉발 피해는 maul보다 낮지만 뒤가 길다.
      effects: [
        { kind: 'damage', power: 0.9, scalesWith: 'atk' },
        { kind: 'debuff', status: 'burn', duration: 2, chance: 0.6 },
      ],
      unlockStar: 2,
    },
    {
      id: 'sk_sap',
      name: '기력 갉기',
      description: '공격력이 가장 높은 적의 공격력을 낮춘다(3턴).',
      type: 'active',
      cooldown: 3,
      targetSide: 'enemy',
      targetScope: 'highestAtk',
      // highestAtk 타겟팅 최초 사용. 파티의 주력을 정확히 노린다 —
      // "누가 맞을지 모른다"가 아니라 "제일 센 놈이 맞는다"라 체감이 다르다.
      effects: [{ kind: 'debuff', status: 'atkDown', duration: 3, chance: 0.8 }],
      unlockStar: 2,
    },
    {
      id: 'sk_mire',
      name: '수렁',
      description: '적 둘의 속도를 낮춘다(2턴).',
      type: 'active',
      cooldown: 3,
      targetSide: 'enemy',
      targetScope: 'random2',
      // random2 타겟팅 최초 사용. 속도를 깎으면 행동 순서가 밀려
      // "먼저 때리고 시작"하던 파티 구성이 흔들린다.
      effects: [{ kind: 'debuff', status: 'spdDown', duration: 2, chance: 0.9 }],
      unlockStar: 1,
    },
    {
      id: 'sk_bulwark',
      name: '결계',
      description: '아군 전체에게 보호막을 씌운다.',
      type: 'active',
      cooldown: 4,
      targetSide: 'ally',
      targetScope: 'all',
      // shield 최초 사용. 적에게 주면 "먼저 껍질을 벗겨야 하는" 층이 된다.
      effects: [{ kind: 'shield', power: 1.2, scalesWith: 'atk' }],
      unlockStar: 2,
    },
    {
      id: 'sk_rally',
      name: '규합',
      description: '아군 전체의 해로운 상태를 씻어내고 공격력을 올린다(2턴).',
      type: 'active',
      cooldown: 5,
      targetSide: 'ally',
      targetScope: 'all',
      // cleanse 최초 사용. 이걸 가진 적이 있으면 도트·기절 위주 전략이 무력화된다 —
      // "먼저 이놈부터 잘라야 한다"는 우선순위를 만든다.
      effects: [
        { kind: 'cleanse' },
        { kind: 'buff', status: 'atkUp', duration: 2 },
      ],
      unlockStar: 3,
    },
    {
      id: 'sk_siphon',
      name: '흡혈',
      description: 'HP가 가장 낮은 아군을 공격력 200%만큼 회복.',
      type: 'active',
      // ⚠️ 쿨다운 3이면 보스가 자힐로 버텨 전투가 17턴까지 늘어졌다.
      // 회복하는 적의 재미는 "끊어야 한다"는 압박이지 긴 소모전이 아니다.
      // 쿨다운을 늘려 **회복 사이에 창이 생기도록** 한다.
      cooldown: 5,
      targetSide: 'ally',
      targetScope: 'lowestHp',
      // 적 진영에 힐러가 하나도 없었다. 회복하는 적이 생기면
      // "화력을 모아 끊는다"는 판단이 처음으로 필요해진다.
      effects: [{ kind: 'heal', power: 2.0, scalesWith: 'atk' }],
      unlockStar: 2,
    },
  ] as Skill[]).map((s) => [s.id, s]),
) as Record<SkillId, Skill>;

// ------------------------------------------------------------
// 영웅 (★1 Lv.1 기준 스탯)
// ------------------------------------------------------------
export const heroes: Record<HeroDefId, HeroDef> = Object.fromEntries(
  ([
    {
      id: 'h_ashen',
      name: '재의 카일',
      title: '무너진 성벽의 파수꾼',
      lore: '불타 사라진 왕국의 마지막 병사. 이름 없는 자로 소환되었다.',
      baseStar: 1,
      element: 'fire',
      role: 'dealer',
      attackAttr: 'str',
      baseCaps: { str: 22, int: 8, vit: 14, agi: 17 },
      skillIds: ['sk_slash', 'sk_rend'] as SkillId[],
    },
    {
      id: 'h_bulwark',
      name: '석문의 오르나',
      title: '움직이지 않는 자',
      lore: '지하 도시의 최후 방벽이었던 거인족 전사.',
      baseStar: 2,
      element: 'earth',
      role: 'tank',
      attackAttr: 'str',
      baseCaps: { str: 13, int: 6, vit: 30, agi: 9 },
      skillIds: ['sk_taunt_hit', 'sk_guard'] as SkillId[],
    },
    {
      id: 'h_tide',
      name: '물결의 세인',
      title: '가라앉은 사원의 사제',
      lore: '바다에 삼켜진 사원에서 마지막까지 기도를 멈추지 않았다.',
      baseStar: 3,
      element: 'water',
      role: 'healer',
      attackAttr: 'int',
      baseCaps: { str: 7, int: 21, vit: 16, agi: 14 },
      skillIds: ['sk_mend', 'sk_spark'] as SkillId[],
    },
    {
      id: 'h_gale',
      name: '북풍의 리엔',
      title: '서리 위를 걷는 자',
      lore: '얼어붙은 국경을 홀로 지켰던 순찰병.',
      baseStar: 4,
      element: 'wind',
      role: 'dealer',
      attackAttr: 'str',
      baseCaps: { str: 20, int: 10, vit: 15, agi: 22 },
      skillIds: ['sk_rend', 'sk_slash'] as SkillId[],
    },
    {
      id: 'h_bolt',
      name: '벼락의 이스카',
      title: '하늘을 가른 검',
      lore: '단 한 번의 검격으로 왕성의 첨탑을 갈랐다고 전해진다.',
      baseStar: 5,
      element: 'thunder',
      role: 'breaker',
      attackAttr: 'int',
      baseCaps: { str: 12, int: 24, vit: 17, agi: 20 },
      skillIds: ['sk_maul', 'sk_spark'] as SkillId[],
    },
  ] as HeroDef[]).map((h) => [h.id, h]),
) as Record<HeroDefId, HeroDef>;

// ------------------------------------------------------------
// 적
// ------------------------------------------------------------
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
      stats: { hp: 4100, atk: 190, def: 55, spd: 44, crit: 0.08 },
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
  ] as EnemyDef[]).map((e) => [e.id, e]),
) as Record<EnemyDefId, EnemyDef>;

export const HERO = {
  ashen: id<HeroDefId>('h_ashen'),
  bulwark: id<HeroDefId>('h_bulwark'),
  tide: id<HeroDefId>('h_tide'),
  gale: id<HeroDefId>('h_gale'),
  bolt: id<HeroDefId>('h_bolt'),
};

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
};
