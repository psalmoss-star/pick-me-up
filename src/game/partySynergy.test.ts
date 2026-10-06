import { describe, it, expect } from 'vitest';
import { idleMainSlots, inflictsStatus, synergyNotes } from './partySynergy';
import { recommendParty } from './formation';
import { enemyKindsOf } from './floorIntel';
import { makeGear } from './gear';
import { klassFor } from './stats';
import { heroes, skills, starScaling, elementChart, enemies, HERO } from './data/sample';
import { floorAt } from './data';
import { TRAIT_BRIEF, TRAIT_NAME } from './data/traits';
import { LINEAGES } from './data/lineages';
import type { GearDefId, GearInstId, GearInstance, HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const hero = (defId: HeroDefId, n: number, o: Partial<HeroInstance> = {}): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star: 3 as Star, klass: klassFor(3), level: 20, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1, ...o,
});
const HUSH = 'h_hush' as HeroDefId;
const inv = (list: GearInstance[]) => new Map<GearInstId, GearInstance>(list.map((g) => [g.instId, g]));
const kindsOf = (notes: ReturnType<typeof synergyNotes>) => notes.map((n) => n.kind);

describe('inflictsStatus', () => {
  it('적에게 약화·도트·기절을 거는 기술이 있으면 참이다', () => {
    expect(inflictsStatus(heroes[HERO.thorn], skills)).toBe(true);   // 독
    expect(inflictsStatus(heroes[HERO.cinder], skills)).toBe(true);  // 화상
    expect(inflictsStatus(heroes[HUSH], skills)).toBe(true);         // 공격·속도 약화
  });
  it('아군 버프·치유만 있는 영웅은 거짓이다', () => {
    expect(inflictsStatus(heroes[HERO.bulwark], skills)).toBe(false); // 강타 · 방벽(아군 방어 증가)
  });
});

describe('synergyNotes — 엔진에 있는 맞물림만 말한다', () => {
  it('지휘관이 있으면 편성 전원이 덕을 본다 — 혼자면 말하지 않는다', () => {
    expect(kindsOf(synergyNotes([hero(HERO.banner, 1), hero(HERO.ashen, 2)], heroes, skills))).toContain('led');
    expect(synergyNotes([hero(HERO.banner, 1)], heroes, skills)).toEqual([]);
  });

  it('지휘관이 둘이면 한 번만 걸린다고 알린다', () => {
    const notes = synergyNotes([hero(HERO.banner, 1), hero(HERO.banner, 2), hero(HERO.ashen, 3)], heroes, skills);
    expect(kindsOf(notes)).toEqual(['led', 'doubleCommander']);
  });

  it('사냥꾼은 상태이상을 거는 **다른** 동료 수를 센다 — 자기 독은 세지 않는다', () => {
    const alone = synergyNotes([hero(HERO.thorn, 1), hero(HERO.bulwark, 2)], heroes, skills);
    expect(kindsOf(alone)).not.toContain('hunterFed');
    const fed = synergyNotes([hero(HERO.thorn, 1), hero(HERO.cinder, 2), hero(HUSH, 3)], heroes, skills);
    expect(fed).toContainEqual({ kind: 'hunterFed', allies: 2 });
  });

  it('쓰러진 영웅은 세지 않는다', () => {
    const notes = synergyNotes([hero(HERO.banner, 1, { isDead: true }), hero(HERO.ashen, 2)], heroes, skills);
    expect(notes).toEqual([]);
  });

  it('맞물림이 없는 편성은 아무것도 말하지 않는다', () => {
    expect(synergyNotes([hero(HERO.ashen, 1), hero(HERO.bulwark, 2), hero(HERO.tide, 3)], heroes, skills)).toEqual([]);
  });
});

describe('idleMainSlots — 주 장비가 비었고 창고에 낄 것이 있을 때만', () => {
  const ashen = hero(HERO.ashen, 1);     // 검사 — 주 장비는 무기
  const bulwark = hero(HERO.bulwark, 2); // 수호자 — 주 장비는 방어구
  const sword = makeGear('w_soldier' as GearDefId, 1);

  it('창고에 그 슬롯의 장비가 있으면 알린다', () => {
    const r = idleMainSlots([ashen, bulwark], heroes, inv([sword]));
    expect(r.map((x) => [x.hero.instId, x.slot])).toEqual([[ashen.instId, 'weapon']]);
  });

  it('창고가 비었으면 알리지 않는다 — 할 수 있는 일이 없다', () => {
    expect(idleMainSlots([ashen, bulwark], heroes, inv([]))).toEqual([]);
  });

  it('남이 낀 장비는 창고의 것이 아니다', () => {
    const worn = { ...sword, equippedBy: bulwark.instId };
    expect(idleMainSlots([ashen], heroes, inv([worn]))).toEqual([]);
  });

  it('이미 주 장비를 꼈으면 알리지 않는다', () => {
    const mine = { ...sword, equippedBy: ashen.instId };
    const spare = makeGear('w_chipped' as GearDefId, 2);
    const armed = { ...ashen, gear: { weapon: mine.instId } };
    expect(idleMainSlots([armed], heroes, inv([mine, spare]))).toEqual([]);
  });
});

describe('추천 편성의 이유 — 특성을 말한다', () => {
  it('일곱 계열 모두 한 줄 요약이 있고, 수치를 약속하지 않는다', () => {
    for (const l of LINEAGES) {
      expect(TRAIT_BRIEF[l].length).toBeGreaterThan(0);
      expect(TRAIT_BRIEF[l]).not.toMatch(/[0-9%]/);
    }
  });

  it('상성으로 뽑힌 것이 아니면 "전투력 상위" 대신 그 영웅의 특성을 적는다', () => {
    // 속성이 전부 같은 적을 두어 누구도 유리하지 않게 한다 → 이유가 특성으로 떨어진다
    const neutral = heroes[HERO.ashen].element;
    const kinds = enemyKindsOf(floorAt(0), enemies).map((k) => ({ ...k, element: neutral }));
    const candidates = [hero(HERO.gale, 1), hero(HERO.thorn, 2), hero(HERO.banner, 3)];
    const rec = recommendParty({
      members: [hero(HERO.bulwark, 8), hero(HERO.tide, 9)], candidates,
      defs: heroes, skills, scaling: starScaling, room: 3, kinds, chart: elementChart,
    });
    expect(rec.ids).toHaveLength(3);
    for (const h of candidates) {
      const reason = rec.reasons[h.instId];
      if (reason.includes('유리')) continue;
      const l = heroes[h.defId].lineage;
      expect(reason).toBe(`${TRAIT_NAME[l]} — ${TRAIT_BRIEF[l]}`);
      expect(reason).not.toBe('전투력 상위');
    }
    expect(Object.values(rec.reasons).some((r) => r.includes(' — '))).toBe(true);
  });
});
