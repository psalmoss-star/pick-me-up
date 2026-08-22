/**
 * 영웅 도감 12종 (★1 Lv.1 기준 스탯).
 *
 * ⚠️ `baseStar`는 도감 표시용이고 추첨 필터가 아니다(gacha.ts pickArchetype).
 *    등급은 rollStar가 따로 정하므로 여기 값이 확률을 바꾸지 않는다.
 */
import type { HeroDef, HeroDefId, SkillId } from '../types';

const id = <T extends string>(s: string) => s as T;

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

    // ------------------------------------------------------------
    // 확장분 (2026-08-11) — 유형 5종으로는 돌려막기가 보인다
    //
    // 이름은 개체마다 새로 생성되지만(identity.ts) **유형이 5개뿐이라**
    // 소환을 반복하면 같은 초상·역할·스킬이 이름만 바꿔 돌아온다.
    // "이름만 바뀌고 캐릭터는 돌려막기"라는 지적이 정확했다.
    //
    // ⚠️ 새 유형은 **행동이 달라야** 한다. 수치만 다른 상위 호환을 만들면
    //    유형이 늘어도 체감은 그대로다(적 확충 때 겪은 함정, §STEP 13).
    //    그래서 지금까지 적만 쓰던 스킬 7종(venom/emberfall/sap/mire/
    //    bulwark/rally/siphon)을 영웅 쪽으로 연다 — 엔진 변경 없이
    //    도트·광역·디버프·보호막·정화·흡혈이 파티에 처음 들어온다.
    // ------------------------------------------------------------
    {
      id: 'h_thorn',
      name: '가시덤불의 마르',
      title: '숲이 삼킨 밀렵꾼',
      lore: '독을 바른 화살로 사냥했다. 마지막 사냥감은 자신이었다.',
      baseStar: 2,
      element: 'earth',
      role: 'dealer',
      attackAttr: 'agi',
      baseCaps: { str: 16, int: 9, vit: 13, agi: 21 },
      // 도트 딜러 — 즉발이 약한 대신 오래 끌수록 아프다
      skillIds: ['sk_venom', 'sk_slash'] as SkillId[],
    },
    {
      id: 'h_cinder',
      name: '잿불의 하란',
      title: '스스로를 태운 술사',
      lore: '불을 다루는 대가로 제 그림자를 잃었다.',
      baseStar: 4,
      element: 'fire',
      role: 'dealer',
      attackAttr: 'int',
      baseCaps: { str: 8, int: 23, vit: 13, agi: 16 },
      // 파티 최초의 광역기. 다수 적 층에서 판이 달라진다
      skillIds: ['sk_emberfall', 'sk_spark'] as SkillId[],
    },
    {
      id: 'h_hush',
      name: '침묵의 예니',
      title: '숨을 지우는 자',
      lore: '적의 힘을 빼앗는 법을 배웠으나 제 목소리를 대가로 냈다.',
      baseStar: 3,
      element: 'wind',
      role: 'support',
      attackAttr: 'agi',
      baseCaps: { str: 10, int: 17, vit: 14, agi: 19 },
      // 최초의 support 역할. 적 주력을 정확히 깎는다(highestAtk)
      skillIds: ['sk_sap', 'sk_mire'] as SkillId[],
    },
    {
      id: 'h_ward',
      name: '성문의 델라',
      title: '결계를 세운 손',
      lore: '무너지는 성문 앞에서 마지막 결계를 올렸다.',
      baseStar: 4,
      element: 'water',
      role: 'support',
      attackAttr: 'int',
      baseCaps: { str: 9, int: 20, vit: 19, agi: 12 },
      // 보호막 — 회복과 다르다. 맞기 전에 미리 두는 자원
      skillIds: ['sk_bulwark', 'sk_mend'] as SkillId[],
    },
    {
      id: 'h_banner',
      name: '깃발의 소른',
      title: '흩어진 대열을 세운 자',
      lore: '패주하는 군을 세 번 돌려세웠다고 전해진다.',
      baseStar: 5,
      element: 'fire',
      role: 'support',
      attackAttr: 'str',
      baseCaps: { str: 18, int: 14, vit: 18, agi: 15 },
      // 정화 + 공격력 버프. 도트·기절 위주 층의 해답이 된다
      skillIds: ['sk_rally', 'sk_slash'] as SkillId[],
    },
    {
      id: 'h_leech',
      name: '검은샘의 비라',
      title: '피로 갚는 자',
      lore: '살리는 값을 제 피로 치른다. 아무도 그 셈을 묻지 않았다.',
      baseStar: 3,
      element: 'water',
      role: 'healer',
      attackAttr: 'int',
      baseCaps: { str: 8, int: 19, vit: 17, agi: 13 },
      // 두 번째 힐러. 세인과 달리 최저 HP를 직접 노린다
      skillIds: ['sk_siphon', 'sk_spark'] as SkillId[],
    },
    {
      id: 'h_anvil',
      name: '쇠모루의 군드',
      title: '물러서지 않는 벽',
      lore: '대장간을 지키다 그대로 굳었다고 한다.',
      baseStar: 2,
      element: 'earth',
      role: 'tank',
      attackAttr: 'str',
      baseCaps: { str: 15, int: 6, vit: 28, agi: 8 },
      // 두 번째 탱커 — 오르나와 달리 도발 대신 광역 보호막을 쓴다
      skillIds: ['sk_taunt_hit', 'sk_bulwark'] as SkillId[],
    },
  ] as HeroDef[]).map((h) => [h.id, h]),
) as Record<HeroDefId, HeroDef>;

export const HERO = {
  ashen: id<HeroDefId>('h_ashen'),
  bulwark: id<HeroDefId>('h_bulwark'),
  tide: id<HeroDefId>('h_tide'),
  gale: id<HeroDefId>('h_gale'),
  bolt: id<HeroDefId>('h_bolt'),
  // 정원이 5로 늘면서 sim·튜너 기준 파티가 5인이 됐다 — 그 자리를 채우는 영웅들.
  thorn: id<HeroDefId>('h_thorn'),
  cinder: id<HeroDefId>('h_cinder'),
  banner: id<HeroDefId>('h_banner'),
  leech: id<HeroDefId>('h_leech'),
};
