/**
 * 고유 전설 영웅 — gdd-v3 §4.11.
 *
 * 가장 중요한 잠금은 "소환 난수를 밀지 않는다"다. 전설이 생겨도 일반 개체의
 * 잠재치·이름·유형 추첨이 비트 단위로 같아야 한다.
 */
import { describe, it, expect } from 'vitest';
import { availableLegends, isLegendId, legendOf, rollLegend } from './legend';
import { LEGENDS, LEGEND_BY_ID, LEGEND_SHARE_OF_STAR5, type LegendId } from './data/legends';
import { GIVEN_NAMES, MODIFIERS } from './data/names';
import { TEMPER_BY_ID } from './data/temperaments';
import { BANNERS, initialGachaState, pull } from './gacha';
import { createRng } from './rng';
import { heroes } from './data/sample';
import { temperOf } from './temperament';
import { originOf } from './origin';
import { lineFor, templateLastWords } from './voice';
import { variantOf } from './portraitVariant';
import { displayName } from './identity';
import type { HeroInstance, Star, Wallet } from './types';

const MOMENTS = ['summon', 'sortie', 'sacrifice', 'allyDeath', 'death'] as const;

const wallet = (): Wallet => ({ gold: 1e9, gems: 1e9, promotionStones: 0, awakeningStones: 0, revivalTokens: 0 });
let n = 0;
const makeId = () => `L${++n}`;

const legendInst = (id: string, star: Star = 5, seed = 1): HeroInstance => {
  const l = LEGEND_BY_ID[id as LegendId];
  return {
    instId: `x-${id}` as any, defId: l.defId, star, klass: '기사단장' as any, level: 1, exp: 0,
    name: l.name, title: l.title, seed, legendId: id, currentHp: 0, isDead: false, acquiredAtFloor: 1,
  };
};

describe('전설 — 데이터', () => {
  it('id·이름이 유일하다', () => {
    expect(new Set(LEGENDS.map((l) => l.id)).size).toBe(LEGENDS.length);
    expect(new Set(LEGENDS.map((l) => l.name)).size).toBe(LEGENDS.length);
  });

  it('이름은 한 단어이고 일반 개체의 이름 어휘와 겹치지 않는다', () => {
    for (const l of LEGENDS) {
      expect(l.name, l.name).not.toMatch(/\s/);
      expect(GIVEN_NAMES).not.toContain(l.name);
      expect(MODIFIERS).not.toContain(l.name);
    }
  });

  it('빌리는 유형·기질이 실제로 있다', () => {
    for (const l of LEGENDS) {
      expect(heroes[l.defId], l.id).toBeDefined();
      expect(TEMPER_BY_ID[l.temper], l.id).toBeDefined();
      expect(l.variant).toBeGreaterThanOrEqual(0);
    }
  });

  it('다섯 순간 모두 말이 있고, 자리표시 규칙을 지킨다', () => {
    for (const l of LEGENDS) {
      for (const m of MOMENTS) {
        expect(l.lines[m].length, `${l.id}/${m}`).toBeGreaterThan(0);
        for (const line of l.lines[m]) {
          const left = line
            .replace(/\{ally:(이\/가|을\/를|은\/는|이었\/였)\}/g, '')
            .replace(/\{ally\}/g, '');
          expect(left, line).not.toMatch(/[{}]/);
          if (m !== 'allyDeath') expect(line, line).not.toContain('{ally');
          expect(line, line).not.toMatch(/\{ally\}(이|가|을|를|은|는|였|이었)/);
        }
      }
    }
  });

  it('몫은 0과 1 사이다 — ★5를 다 먹지 않는다', () => {
    expect(LEGEND_SHARE_OF_STAR5).toBeGreaterThan(0);
    expect(LEGEND_SHARE_OF_STAR5).toBeLessThan(1);
  });
});

describe('전설 — 판정', () => {
  it('같은 시드면 같은 결과다', () => {
    for (let s = 0; s < 100; s++) {
      expect(rollLegend(s, LEGENDS, 0.5)).toBe(rollLegend(s, LEGENDS, 0.5));
    }
  });

  it('몫이 0이면 안 나오고 1이면 반드시 나온다', () => {
    for (let s = 0; s < 50; s++) {
      expect(rollLegend(s, LEGENDS, 0)).toBeNull();
      expect(rollLegend(s, LEGENDS, 1)).not.toBeNull();
    }
  });

  it('후보가 없으면 안 나온다', () => {
    expect(rollLegend(1, [], 1)).toBeNull();
  });

  it('로스터에 있는 전설은 후보가 아니다 — 사망자 포함', () => {
    const dead = { ...legendInst('l_sien'), isDead: true };
    const av = availableLegends(LEGENDS, [legendInst('l_morga'), dead]);
    expect(av.map((l) => l.id)).not.toContain('l_morga');
    expect(av.map((l) => l.id)).not.toContain('l_sien');
    expect(av).toHaveLength(LEGENDS.length - 2);
  });

  it('봉인된 전설은 모든 회차에서 다시 오지 않는다', () => {
    const av = availableLegends(LEGENDS, [], new Set(['아델하르트']));
    expect(av.map((l) => l.id)).not.toContain('l_adelhart');
  });

  it('모르는 id는 전설이 아니다', () => {
    expect(isLegendId('l_nobody')).toBe(false);
    expect(legendOf({ legendId: 'l_nobody' })).toBeNull();
    expect(legendOf({})).toBeNull();
  });
});

describe('전설 — 소환', () => {
  const premium = (seed: number, legends?: { table: typeof LEGENDS; share: number }, roster: HeroInstance[] = []) =>
    pull({
      banner: BANNERS.premium, wallet: wallet(), gacha: initialGachaState(0), pool: heroes, codex: {},
      rng: createRng(seed), now: 0, currentFloor: 1, makeId, roster, legends,
    });

  it('소환 난수를 한 개도 밀지 않는다 — 전설 유무와 관계없이 개체 시드와 다음 난수가 같다', () => {
    for (let s = 0; s < 400; s++) {
      const a = createRng(s), b = createRng(s);
      const base = { banner: BANNERS.premium, wallet: wallet(), gacha: initialGachaState(0), pool: heroes, codex: {}, now: 0, currentFloor: 1, makeId };
      const without = pull({ ...base, rng: a });
      const withL = pull({ ...base, rng: b, legends: { table: LEGENDS, share: 1 } });
      expect(without.ok && withL.ok).toBe(true);
      if (!without.ok || !withL.ok) continue;
      expect(withL.hero.seed).toBe(without.hero.seed);
      expect(withL.star).toBe(without.star);
      expect(b()).toBe(a()); // 뒤이은 난수열도 같다
    }
  });

  it('★4는 전설이 되지 않는다', () => {
    for (let s = 0; s < 400; s++) {
      const r = premium(s, { table: LEGENDS, share: 1 });
      if (r.ok && r.star < 5) expect(r.hero.legendId).toBeUndefined();
    }
  });

  it('★5이고 전설이면 이름·이명·유형이 전설의 것이다', () => {
    let seen = 0;
    for (let s = 0; s < 2000 && seen < 5; s++) {
      const r = premium(s, { table: LEGENDS, share: 1 });
      if (!r.ok || r.star < 5) continue;
      seen++;
      const l = legendOf(r.hero)!;
      expect(l).not.toBeNull();
      expect(r.hero.name).toBe(l.name);
      expect(r.hero.title).toBe(l.title);
      expect(r.hero.defId).toBe(l.defId);
      expect(displayName(r.hero, heroes)).toBe(l.name);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('실제 몫으로 돌리면 ★5의 대략 1/3이 전설이다', () => {
    let s5 = 0, legend = 0;
    for (let s = 0; s < 20000; s++) {
      const r = premium(s, { table: LEGENDS, share: LEGEND_SHARE_OF_STAR5 });
      if (!r.ok || r.star < 5) continue;
      s5++;
      if (r.hero.legendId) legend++;
    }
    expect(s5).toBeGreaterThan(500);
    expect(legend / s5).toBeGreaterThan(0.26);
    expect(legend / s5).toBeLessThan(0.41);
  });

  it('로스터에 있는 전설은 다시 나오지 않는다 — 같은 이름 둘 금지', () => {
    const roster = LEGENDS.slice(0, 5).map((l) => legendInst(l.id));
    for (let s = 0; s < 2000; s++) {
      const r = premium(s, { table: LEGENDS, share: 1 }, roster);
      if (r.ok && r.hero.legendId) expect(r.hero.legendId).toBe(LEGENDS[5].id);
    }
  });

  it('도감의 "새로 기록"은 전설이 빌린 유형 기준이다', () => {
    for (let s = 0; s < 2000; s++) {
      const r = pull({
        banner: BANNERS.premium, wallet: wallet(), gacha: initialGachaState(0), pool: heroes,
        codex: Object.fromEntries(LEGENDS.map((l) => [l.defId, {}])) as never,
        rng: createRng(s), now: 0, currentFloor: 1, makeId, legends: { table: LEGENDS, share: 1 },
      });
      if (r.ok && r.hero.legendId) {
        expect(r.isNewInCodex).toBe(false);
        return;
      }
    }
    throw new Error('전설이 한 번도 안 나왔다');
  });
});

describe('전설 — 정체성', () => {
  it('기질·생전은 정해진 것이고, 승급해도 같다', () => {
    for (const l of LEGENDS) {
      for (const star of [5, 6] as Star[]) {
        const h = legendInst(l.id, star, 12345);
        expect(temperOf(h)!.id).toBe(l.temper);
        expect(originOf(h)).toEqual({ station: l.station, ending: l.ending });
      }
    }
  });

  it('자기 대사를 한다', () => {
    for (const l of LEGENDS) {
      const h = legendInst(l.id);
      expect(l.lines.summon).toContain(lineFor(h, 'summon', 'x')!.text);
      expect(l.lines.death).toContain(templateLastWords(h, 30));
    }
  });

  it('얼굴이 정해져 있다 — 시드가 달라도 같은 초상', () => {
    for (const l of LEGENDS) {
      const a = variantOf(legendInst(l.id, 5, 1), 6);
      const b = variantOf(legendInst(l.id, 5, 999), 6);
      expect(a).toBe(b);
      expect(a).toBe(l.variant % 6);
    }
  });
});
