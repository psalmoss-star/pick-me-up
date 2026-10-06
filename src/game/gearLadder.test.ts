/**
 * 장비 성장 사다리(2026-10-02) — 단계·계열 모델.
 * 10층마다 한 단계. 보급형은 상점·일반 드롭, 정예는 보스·모험, 유물은 제작.
 */
import { describe, it, expect } from 'vitest';
import {
  GEAR_DEFS, GEAR_SLOTS, ladderTarget, gearTag, ladderSet, nextShopTier, shopStock, tierOf,
  tierFirstFloor, TIER_COUNT, unlockedTierOf, relicNext, RELIC_FIRST_TIER,
} from './data/gear';
import { refPartyAt, tierRefFloor } from './data/refParty';
import { bonusOf, makeGear } from './gear';
import { setPowerRatio } from './gearLadder';
import type { GearBonus, GearDefId } from './types';
import { POWER_WEIGHTS as W } from './data/power';

const LEGACY = [
  'w_chipped', 'a_tatter', 't_charm',
  'w_soldier', 'a_guard', 't_swift',
  'w_emberfang', 'a_bulwark', 't_bloodpact',
  'w_towerbane', 'a_ashshroud', 't_lastlight',
] as const;

describe('단계', () => {
  it('10층마다 한 단계 — 경계 층이 맞다', () => {
    expect(tierOf(1)).toBe(1);
    expect(tierOf(10)).toBe(1);
    expect(tierOf(11)).toBe(2);
    expect(tierOf(20)).toBe(2);
    expect(tierOf(21)).toBe(3);
    expect(tierOf(100)).toBe(TIER_COUNT);
    expect(tierOf(999)).toBe(TIER_COUNT);
    expect(tierOf(0)).toBe(1);
  });

  it('단계 첫 층', () => {
    expect(tierFirstFloor(1)).toBe(1);
    expect(tierFirstFloor(3)).toBe(21);
    expect(tierFirstFloor(10)).toBe(91);
  });

  it('기준 파티 — 저층 3인 · 생성 구간 5인, 단계 첫 층(그 단계에서 가장 약한 파티)', () => {
    expect(refPartyAt(5)).toHaveLength(3);
    expect(refPartyAt(25)).toHaveLength(5);
    expect(tierRefFloor(1)).toBe(1);
    expect(tierRefFloor(2)).toBe(11);
    expect(tierRefFloor(10)).toBe(91);
  });
});

describe('기존 장비 재배치', () => {
  it('기존 12종 id가 모두 남아 있다 — 세이브가 참조한다', () => {
    for (const id of LEGACY) expect(GEAR_DEFS[id as GearDefId], id).toBeDefined();
  });

  it('common 3종 = 1단계 보급, fine 3종 = 1단계 정예, rare 3종 = 2단계 정예, relic = 유물', () => {
    const at = (id: string) => GEAR_DEFS[id as GearDefId];
    for (const id of ['w_chipped', 'a_tatter', 't_charm']) expect([at(id).tier, at(id).line]).toEqual([1, 'supply']);
    for (const id of ['w_soldier', 'a_guard', 't_swift']) expect([at(id).tier, at(id).line]).toEqual([1, 'elite']);
    for (const id of ['w_emberfang', 'a_bulwark', 't_bloodpact']) expect([at(id).tier, at(id).line]).toEqual([2, 'elite']);
    for (const id of ['w_towerbane', 'a_ashshroud', 't_lastlight']) expect([at(id).tier, at(id).line]).toEqual([2, 'relic']);
  });

  it('표시 꼬리표', () => {
    expect(gearTag(GEAR_DEFS['w_chipped' as GearDefId])).toBe('1단계 · 보급');
    expect(gearTag(GEAR_DEFS['w_emberfang' as GearDefId])).toBe('2단계 · 정예');
    expect(gearTag(GEAR_DEFS['w_towerbane' as GearDefId])).toBe('2단계 · 유물');
  });
});

describe('사다리 — 단계마다 보급 한 벌·정예 한 벌', () => {
  it('1~10단계 전부 슬롯 3 × (보급 + 정예)가 있고 새 id는 규칙을 따른다', () => {
    for (let t = 1; t <= TIER_COUNT; t++) {
      for (const line of ['supply', 'elite'] as const) {
        const set = ladderSet(t, line);
        expect(set.map((d) => d.slot), `${t}단계 ${line}`).toEqual(['weapon', 'armor', 'trinket']);
        for (const d of set) {
          expect(d.tier).toBe(t);
          expect(d.line).toBe(line);
          if (!LEGACY.includes(d.id as never)) expect(d.id).toBe(`g_t${t}_${line}_${d.slot}`);
        }
      }
    }
  });

  /**
   * 여유분 — 그 단계 기준 파티가 한 벌을 입으면 파티 전투력이 일정하게 오른다(사용자 결정).
   * 층 난이도는 장비 없음 기준이므로 이 비율이 곧 "장비를 맞춘 만큼의 여유"다.
   * 수치는 `LADDER_TARGET`이 정하고, 그 값은 `climb-check --gear` 완주율 실측으로 골랐다.
   */
  it('단계 기준 파티(첫 층)에서 보급·정예 비율이 목표 범위 안 — 1~10단계 전부', () => {
    for (let t = 1; t <= TIER_COUNT; t++) {
      const party = refPartyAt(tierRefFloor(t));
      for (const line of ['supply', 'elite'] as const) {
        const r = setPowerRatio(party, ladderSet(t, line).map((d) => bonusOf(makeGear(d.id, 1))));
        const { lo, hi } = ladderTarget(t, line);
        expect(r, `${t}단계 ${line} ${(r * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(lo);
        expect(r, `${t}단계 ${line} ${(r * 100).toFixed(1)}%`).toBeLessThanOrEqual(hi);
      }
    }
  });

  /**
   * 단계 안 **어느 층**에서도 상한을 넘지 않는다 — 단계 가운데 층 파티로만 맞췄더니
   * 11층(더 약한 파티)에서 보급 +22.7%·정예 +38.9%로 넘었다(STEP 66 리뷰).
   */
  it('단계 안 모든 층의 기준 파티에 대해 상한을 넘지 않는다', () => {
    for (let t = 1; t <= TIER_COUNT; t++) {
      for (let f = tierFirstFloor(t); f <= tierFirstFloor(t) + 9; f++) {
        const party = refPartyAt(f);
        for (const line of ['supply', 'elite'] as const) {
          const r = setPowerRatio(party, ladderSet(t, line).map((d) => bonusOf(makeGear(d.id, 1))));
          expect(r, `${f}층 ${line} ${(r * 100).toFixed(1)}%`).toBeLessThanOrEqual(ladderTarget(t, line).hi);
        }
      }
    }
  });

  /**
   * "한 단계씩 업그레이드" — 기준 파티는 20층 구간마다 바뀌므로, 구간 안의 두 단계가
   * 같은 파티로 풀리면 수치가 똑같아진다(첫 생성에서 실제로 3=4·5=6·7=8·9=10단계였다).
   * 같은 계열·같은 슬롯이면 위 단계가 반드시 더 강해야 한다.
   */
  /**
   * 장비 한 개의 전력 — 전투력 가중합을 **반올림 전**으로 잰다.
   * `combatPower`는 ÷10 반올림이라 공격력 1~2 차이를 같은 값으로 뭉갰다(단조 비교가 거짓 실패).
   */
  const rawPower = (b: GearBonus) =>
    (b.hp ?? 0) * W.hp + (b.atk ?? 0) * W.atk + (b.def ?? 0) * W.def + (b.spd ?? 0) * W.spd + (b.crit ?? 0) * W.crit;

  it('같은 계열·슬롯이면 위 단계가 더 강하다 — 1~10단계', () => {
    const power = (id: string) => rawPower(bonusOf(makeGear(id as GearDefId, 1)));
    for (const line of ['supply', 'elite'] as const) {
      for (const slot of GEAR_SLOTS) {
        for (let t = 2; t <= TIER_COUNT; t++) {
          const prev = ladderSet(t - 1, line).find((d) => d.slot === slot)!;
          const cur = ladderSet(t, line).find((d) => d.slot === slot)!;
          expect(power(cur.id), `${line} ${slot} ${t - 1}→${t}단계`).toBeGreaterThan(power(prev.id));
        }
      }
    }
  });

  it('같은 단계면 정예가 보급보다 강하다', () => {
    const power = (id: string) => rawPower(bonusOf(makeGear(id as GearDefId, 1)));
    for (let t = 1; t <= TIER_COUNT; t++) {
      for (const slot of GEAR_SLOTS) {
        const s = ladderSet(t, 'supply').find((d) => d.slot === slot)!;
        const e = ladderSet(t, 'elite').find((d) => d.slot === slot)!;
        expect(power(e.id), `${t}단계 ${slot}`).toBeGreaterThan(power(s.id));
      }
    }
  });

  it('보급형 가격은 단계가 오를수록 비싸다', () => {
    for (const slot of GEAR_SLOTS) {
      for (let t = 2; t <= TIER_COUNT; t++) {
        const prev = ladderSet(t - 1, 'supply').find((d) => d.slot === slot)!;
        const cur = ladderSet(t, 'supply').find((d) => d.slot === slot)!;
        expect(cur.price!, `${t}단계 ${slot}`).toBeGreaterThan(prev.price!);
      }
    }
  });
});

describe('상점', () => {
  it('열린 단계까지의 보급형만, 최신 단계 먼저 — 정예·유물은 없다', () => {
    const stock = shopStock('weapon', 3);
    expect(stock.map((d) => d.tier)).toEqual([3, 2, 1]);
    for (const d of stock) expect(d.line).toBe('supply');
  });

  it('다음 단계 해금 층 — 마지막 단계면 없다', () => {
    expect(nextShopTier(1)).toEqual({ tier: 2, floor: 11 });
    expect(nextShopTier(3)).toEqual({ tier: 4, floor: 31 });
    expect(nextShopTier(TIER_COUNT)).toBeNull();
  });

  it('최전선 층으로 단계가 열린다', () => {
    expect(unlockedTierOf(1)).toBe(1);
    expect(unlockedTierOf(21)).toBe(3);
  });

  it('보급형만 가격이 있다 — 정예·유물은 상점에 없다(옛 정교·희귀도)', () => {
    for (const d of Object.values(GEAR_DEFS)) {
      if (d.line === 'supply') expect(d.price, d.id).toBeGreaterThan(0);
      else expect(d.price, d.id).toBeUndefined();
    }
  });
});

describe('rank 정리', () => {
  it('rank는 line에서 정해진다 — supply=common, elite=rare, relic=relic', () => {
    const want = { supply: 'common', elite: 'rare', relic: 'relic' } as const;
    for (const d of Object.values(GEAR_DEFS)) expect(d.rank, d.id).toBe(want[d.line]);
  });
});

/**
 * 유물 재련(2026-10-06) — 유물도 사다리에 있다. 2~10단계, 같은 단계 정예보다 한 칸 위.
 * 2단계는 기존 id 그대로다(세이브의 유물이 저절로 2단계가 된다).
 */
describe('유물 — 2~10단계', () => {
  const rawPower = (b: GearBonus) =>
    (b.hp ?? 0) * W.hp + (b.atk ?? 0) * W.atk + (b.def ?? 0) * W.def + (b.spd ?? 0) * W.spd + (b.crit ?? 0) * W.crit;
  const power = (id: GearDefId) => rawPower(bonusOf(makeGear(id, 1)));

  it('2~10단계마다 유물 한 벌이 있고 1단계에는 없다', () => {
    expect(ladderSet(1, 'relic')).toEqual([]);
    for (let t = RELIC_FIRST_TIER; t <= TIER_COUNT; t++) {
      const set = ladderSet(t, 'relic');
      expect(set.map((d) => d.slot), `${t}단계`).toEqual(['weapon', 'armor', 'trinket']);
      for (const d of set) {
        expect([d.tier, d.line, d.rank]).toEqual([t, 'relic', 'relic']);
        expect(d.price, d.id).toBeUndefined();
      }
    }
  });

  it('id 규칙 — 2단계는 기존 id, 3단계부터 _t{단계}. 이름·설명은 단계가 올라도 같다', () => {
    const family = { weapon: 'w_towerbane', armor: 'a_ashshroud', trinket: 't_lastlight' } as const;
    for (const slot of GEAR_SLOTS) {
      const first = GEAR_DEFS[family[slot] as GearDefId];
      for (let t = RELIC_FIRST_TIER; t <= TIER_COUNT; t++) {
        const d = ladderSet(t, 'relic').find((x) => x.slot === slot)!;
        expect(d.id).toBe(t === RELIC_FIRST_TIER ? family[slot] : `${family[slot]}_t${t}`);
        expect(d.name).toBe(first.name);
        expect(d.lore).toBe(first.lore);
      }
    }
  });

  it('relicNext — 2단계에서 10단계까지 한 단계씩 이어지고 끝에서 null', () => {
    for (const start of ['w_towerbane', 'a_ashshroud', 't_lastlight'] as const) {
      let id: GearDefId | null = start as GearDefId;
      const tiers: number[] = [];
      while (id) {
        tiers.push(GEAR_DEFS[id].tier);
        const next: GearDefId | null = relicNext(id);
        if (next) expect(GEAR_DEFS[next].slot).toBe(GEAR_DEFS[id].slot);
        id = next;
      }
      expect(tiers).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });

  it('relicNext — 유물이 아니면 null', () => {
    expect(relicNext('w_chipped' as GearDefId)).toBeNull();
    expect(relicNext('g_t3_elite_weapon' as GearDefId)).toBeNull();
    expect(relicNext('nope' as GearDefId)).toBeNull();
  });

  it('같은 슬롯이면 위 단계 유물이 더 강하다', () => {
    for (const slot of GEAR_SLOTS) {
      for (let t = RELIC_FIRST_TIER + 1; t <= TIER_COUNT; t++) {
        const prev = ladderSet(t - 1, 'relic').find((d) => d.slot === slot)!;
        const cur = ladderSet(t, 'relic').find((d) => d.slot === slot)!;
        expect(power(cur.id), `${slot} ${t - 1}→${t}단계`).toBeGreaterThan(power(prev.id));
      }
    }
  });

  /**
   * 재련 화면은 전후 수치를 나란히 보인다 — 합(전력)이 올라도 공격이 29 → 27로 내려가면
   * "올렸는데 약해졌다"로 읽힌다(첫 생성에서 5·8단계 무기가 실제로 그랬다, 치명이 오르며 공격이 밀렸다).
   */
  it('재련하면 어떤 능력치도 내려가지 않는다', () => {
    for (const slot of GEAR_SLOTS) {
      for (let t = RELIC_FIRST_TIER + 1; t <= TIER_COUNT; t++) {
        const prev = ladderSet(t - 1, 'relic').find((d) => d.slot === slot)!.base;
        const cur = ladderSet(t, 'relic').find((d) => d.slot === slot)!.base;
        for (const k of Object.keys(prev) as (keyof GearBonus)[]) {
          expect(cur[k] ?? 0, `${slot} ${t - 1}→${t}단계 ${k}`).toBeGreaterThanOrEqual(prev[k] ?? 0);
        }
      }
    }
  });

  it('같은 단계면 유물이 정예보다 강하다 — 슬롯마다', () => {
    for (let t = RELIC_FIRST_TIER; t <= TIER_COUNT; t++) {
      for (const slot of GEAR_SLOTS) {
        const e = ladderSet(t, 'elite').find((d) => d.slot === slot)!;
        const r = ladderSet(t, 'relic').find((d) => d.slot === slot)!;
        expect(power(r.id), `${t}단계 ${slot}`).toBeGreaterThan(power(e.id));
      }
    }
  });

  it('단계 기준 파티(첫 층)에서 유물 한 벌 비율이 목표 범위 안', () => {
    for (let t = RELIC_FIRST_TIER; t <= TIER_COUNT; t++) {
      const r = setPowerRatio(refPartyAt(tierRefFloor(t)), ladderSet(t, 'relic').map((d) => bonusOf(makeGear(d.id, 1))));
      const { lo, hi } = ladderTarget(t, 'relic');
      expect(r, `${t}단계 ${(r * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(lo);
      expect(r, `${t}단계 ${(r * 100).toFixed(1)}%`).toBeLessThanOrEqual(hi);
    }
  });

  it('단계 안 모든 층의 기준 파티에 대해 유물 상한을 넘지 않는다', () => {
    for (let t = RELIC_FIRST_TIER; t <= TIER_COUNT; t++) {
      for (let f = tierFirstFloor(t); f <= tierFirstFloor(t) + 9; f++) {
        const r = setPowerRatio(refPartyAt(f), ladderSet(t, 'relic').map((d) => bonusOf(makeGear(d.id, 1))));
        expect(r, `${f}층 ${(r * 100).toFixed(1)}%`).toBeLessThanOrEqual(ladderTarget(t, 'relic').hi);
      }
    }
  });

  it('유물의 능력치 구성 — 무기 공격·치명·속도 / 방어구 체력·방어 / 장신구 체력·속도·치명', () => {
    for (let t = RELIC_FIRST_TIER; t <= TIER_COUNT; t++) {
      const [w, a, tr] = ladderSet(t, 'relic').map((d) => Object.keys(d.base).sort());
      expect(w, `${t}단계 무기`).toEqual(['atk', 'crit', 'spd']);
      expect(a, `${t}단계 방어구`).toEqual(['def', 'hp']);
      expect(tr, `${t}단계 장신구`).toEqual(['crit', 'hp', 'spd']);
    }
  });
});
