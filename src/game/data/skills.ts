/**
 * 스킬 도감 15종.
 *
 * 밸런스 수치의 정본이다 — 쿨다운·배율을 만졌으면 `npm run sim`으로 승률을 재확인할 것.
 */
import type { Skill, SkillId } from '../types';

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
