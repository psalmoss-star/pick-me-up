/**
 * 개체 정체성 테스트.
 *
 * 지키려는 것:
 *   1. **보유 중인 카드끼리 이름이 겹치지 않는다** — 사용자가 실제로 겪은 결함
 *   2. 죽은 자의 이름은 재사용되지 않는다 (퍼머데스)
 *   3. 순수 함수가 반드시 종료한다 (어휘가 바닥나도 무한 루프 없음)
 *   4. 이 필드 이전 세이브의 개체도 이름이 표시된다
 */
import { describe, it, expect } from 'vitest';
import {
  UNKNOWN_NAME, displayName, displayTitle, generateIdentity, takenNames,
} from './identity';
import { GIVEN_NAMES, MODIFIERS, TITLES } from './data/names';
import { createRng } from './rng';
import { heroes } from './data/sample';
import { gameData } from './data';
import { klassFor } from './stats';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const inst = (over: Partial<HeroInstance> = {}): HeroInstance => ({
  instId: 'i1' as HeroInstId,
  defId: 'h_tide' as HeroDefId,
  star: 3 as Star,
  klass: klassFor(3),
  level: 1,
  exp: 0,
  currentHp: 0,
  isDead: false,
  acquiredAtFloor: 1,
  ...over,
});

const gen = (seed: number, taken: ReadonlySet<string> = new Set()) =>
  generateIdentity({ rng: createRng(seed), taken });

describe('이름 생성', () => {
  it('"{수식어}의 {이름}" 형식을 지킨다', () => {
    for (let s = 0; s < 100; s++) {
      const { name } = gen(s);
      expect(name).toMatch(/^.+의 .+$/);
      const [mod, given] = name.split('의 ');
      expect(MODIFIERS).toContain(mod);
      expect(GIVEN_NAMES).toContain(given);
    }
  });

  it('이명은 목록에서 나온다', () => {
    for (let s = 0; s < 50; s++) {
      expect(TITLES).toContain(gen(s).title);
    }
  });

  it('같은 시드 + 같은 taken = 같은 결과 (결정론)', () => {
    const a = gen(42);
    const b = gen(42);
    expect(b).toEqual(a);
  });

  it('시드가 다르면 대체로 다른 이름이 나온다', () => {
    const names = new Set(Array.from({ length: 50 }, (_, s) => gen(s).name));
    // 3,185 조합에서 50개를 뽑으면 대부분 달라야 한다
    expect(names.size).toBeGreaterThan(40);
  });
});

describe('유일성 — 이 기능의 핵심', () => {
  it('taken에 있는 이름은 절대 반환하지 않는다', () => {
    const banned = gen(7).name;
    const taken = new Set([banned]);
    for (let s = 0; s < 500; s++) {
      expect(gen(s, taken).name).not.toBe(banned);
    }
  });

  /**
   * 사용자가 실제로 겪은 결함의 직접 재현 방지.
   * 뽑을 때마다 로스터에 넣고 다음 뽑기의 taken에 반영한다 — 실제 pull()과 같은 흐름.
   */
  it('200회 연속 생성해도 이름이 하나도 겹치지 않는다', () => {
    const taken = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const { name } = gen(s * 1103515245 + 12345, taken);
      expect(taken.has(name)).toBe(false);
      taken.add(name);
    }
    expect(taken.size).toBe(200);
  });

  it('어휘가 거의 바닥나도 종료한다 (무한 루프 없음)', () => {
    // 가능한 조합을 전부 taken에 넣는다
    const all = new Set<string>();
    for (const m of MODIFIERS) for (const g of GIVEN_NAMES) all.add(`${m}의 ${g}`);

    const r = gen(1, all);
    expect(r.name.length).toBeGreaterThan(0);
    expect(all.has(r.name)).toBe(false); // 접미사가 붙어 빠져나온다
  });

  it('접미 폴백도 중복을 만들지 않는다', () => {
    const all = new Set<string>();
    for (const m of MODIFIERS) for (const g of GIVEN_NAMES) all.add(`${m}의 ${g}`);

    for (let s = 0; s < 20; s++) {
      const { name } = gen(s, all);
      expect(all.has(name)).toBe(false);
      all.add(name);
    }
  });
});

describe('표시 관문', () => {
  it('개체 이름이 있으면 그것을 쓴다', () => {
    const h = inst({ name: '잿빛의 노아' });
    expect(displayName(h, heroes)).toBe('잿빛의 노아');
  });

  /** 이 필드 이전 세이브 — seed?와 같은 흡수 패턴 */
  it('개체 이름이 없으면 종류 이름으로 폴백한다', () => {
    expect(displayName(inst(), heroes)).toBe(heroes['h_tide' as HeroDefId].name);
  });

  /** save.ts의 isHero()가 defId를 도감과 대조하지 않으므로 유령이 통과할 수 있다 */
  it('정의에 없는 defId여도 던지지 않는다', () => {
    const ghost = inst({ defId: 'h_ghost' as HeroDefId });
    expect(() => displayName(ghost, heroes)).not.toThrow();
    expect(displayName(ghost, heroes)).toBe(UNKNOWN_NAME);
  });

  it('이명도 같은 방식으로 폴백한다', () => {
    expect(displayTitle(inst({ title: '이름을 버린 자' }), heroes)).toBe('이름을 버린 자');
    expect(displayTitle(inst(), heroes)).toBe(heroes['h_tide' as HeroDefId].title);
    expect(displayTitle(inst({ defId: 'h_ghost' as HeroDefId }), heroes)).toBe('');
  });
});

describe('사용 중인 이름 수집', () => {
  it('로스터의 이름을 모은다', () => {
    const taken = takenNames([
      inst({ instId: 'a' as HeroInstId, name: '재의 카일' }),
      inst({ instId: 'b' as HeroInstId, name: '무쇠의 벨렌' }),
    ], heroes);
    expect(taken).toEqual(new Set(['재의 카일', '무쇠의 벨렌']));
  });

  it('이름 없는 개체는 종류 이름으로 잡힌다', () => {
    const taken = takenNames([inst()], heroes);
    expect(taken.has(heroes['h_tide' as HeroDefId].name)).toBe(true);
  });

  /**
   * 퍼머데스. 죽은 자의 이름이 풀리면 같은 이름의 새 영웅이 나오고,
   * 그 순간 무덤 기록이 무의미해진다.
   */
  it('죽은 영웅의 이름도 봉인된다', () => {
    const dead = inst({ name: '재의 카일', isDead: true });
    const taken = takenNames([dead], heroes);
    expect(taken.has('재의 카일')).toBe(true);

    for (let s = 0; s < 300; s++) {
      expect(gen(s, taken).name).not.toBe('재의 카일');
    }
  });
});

describe('어휘 데이터', () => {
  it('중복 항목이 없다', () => {
    expect(new Set(GIVEN_NAMES).size).toBe(GIVEN_NAMES.length);
    expect(new Set(MODIFIERS).size).toBe(MODIFIERS.length);
    expect(new Set(TITLES).size).toBe(TITLES.length);
  });

  /** 조합수가 로스터 규모를 크게 웃돌아야 재추첨이 수렴한다 */
  it('조합수가 충분하다', () => {
    expect(GIVEN_NAMES.length * MODIFIERS.length).toBeGreaterThan(2000);
  });

  it('빈 문자열이 없다', () => {
    for (const v of [...GIVEN_NAMES, ...MODIFIERS, ...TITLES]) {
      expect(v.trim().length).toBeGreaterThan(0);
    }
  });

  /** 이름에 '의'가 들어가면 파싱이 깨진다 */
  it('이름 부분에 구분자가 섞이지 않는다', () => {
    for (const g of GIVEN_NAMES) expect(g).not.toContain('의 ');
  });
});

describe('회차 너머 이름 봉인', () => {
  it('봉인된 이름은 takenNames에 포함된다', () => {
    const sealed = new Set(['물결의 세인']);
    const taken = takenNames([], gameData.heroes, sealed);
    expect(taken.has('물결의 세인')).toBe(true);
  });

  it('sealed를 안 넘기면 기존 동작과 같다 (회귀)', () => {
    // 기존 호출부(sim·테스트)를 깨뜨리지 않아야 한다.
    expect(takenNames([], gameData.heroes).size).toBe(0);
  });

  it('봉인된 이름은 생성되지 않는다 (재추첨 분기가 실제로 실행됨을 증명)', () => {
    /*
      단순히 "여러 시드를 돌려서 봉인된 이름이 안 나온다"는 것만으로는 부족하다 —
      애초에 그 시드에서 봉인된 이름이 1차 후보로 나오지 않으면 재추첨 분기를
      한 번도 타지 않고도 테스트가 통과해버린다 (sealed 유니온을 통째로 지워도 그린).

      그래서 seed 0의 "봉인 없는 1차 후보"가 정확히 무엇인지 먼저 확정하고
      (createRng(0) → generateIdentity({ taken: new Set() }) === '재의 도윤'),
      바로 그 이름을 seal한 뒤 같은 seed로 다시 생성해 **결과가 달라지는지**를 본다.
      결과가 다르면 taken.has()가 그 1차 후보를 걸러내고 재추첨 루프가 도는
      경로가 실제로 실행됐다는 뜻이다.
    */
    const unsealed = generateIdentity({ rng: createRng(0), taken: new Set() });
    expect(unsealed.name).toBe('재의 도윤'); // 1차 후보 고정 — 이 값이 바뀌면 아래 검증의 전제가 깨진다

    const sealed = takenNames([], gameData.heroes, new Set([unsealed.name]));
    const result = generateIdentity({ rng: createRng(0), taken: sealed });

    expect(result.name).not.toBe(unsealed.name);
  });
});
