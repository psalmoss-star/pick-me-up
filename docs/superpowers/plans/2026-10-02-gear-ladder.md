# 장비 성장 사다리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 10층마다 한 단계씩 열리는 보급형(상점·일반 드롭)과 정예(보스 확정·모험 확률) 장비 사다리를 만들어, 100층 내내 "그 단계 한 벌 = 기준 파티 전투력 +15%(보급) / +25%(정예)"를 유지한다.

**Architecture:** `GearDef`에 `tier`·`line`을 더하고, 2단계 이상 장비 수치는 `scripts/gear-ladder.mts`가 기준 파티로 풀어 `data/gearLadder.ts`(생성 파일)에 쓴다. 기존 12종은 id를 유지한 채 1·2단계에 배치한다. 드롭·과제·모험·상점이 "층의 단계"로 장비를 고르고, 전리품·모험의 **난수 소비 횟수는 변경 전과 같게** 해 재료·모험 결과를 지킨다.

**Tech Stack:** React 18 + TypeScript + Zustand + Vitest. 명령: `npx vitest run <file>`, `npm run typecheck`, `npx tsx <script>`.

**Spec:** `docs/superpowers/specs/2026-10-02-gear-ladder-design.md`

## Global Constraints

- `src/game/` 아래는 순수 함수만. `Math.random()` 금지 — 무작위는 주입된 RNG만.
- 밸런스 수치는 `src/game/data/`에만. 2단계 이상 장비 수치·가격은 **생성 파일**(`data/gearLadder.ts`)에만 있고 손으로 고치지 않는다.
- **기존 장비 12종 id 유지**(세이브가 참조). 새 id는 `g_t{단계}_{line}_{slot}` — 추가만.
- 층 난이도·`sim`·`climb-check` 기본값은 **장비 없음 그대로**. 기존 측정 결과가 바뀌면 안 된다.
- 전리품 판정 순서(회수 → 장비 → 재료)와 장비 판정의 **난수 소비 횟수(발동 1 + 등급 자리 1 + 종류 1)** 불변.
- 모험 판정 난수는 **기존 소비(성공 → 각성석) 뒤에** 붙인다.
- 비율 허용 범위: 보급 한 벌 **12~18%**, 정예 한 벌 **21~29%**(목표 15% / 25%).
- 정예 모험 확률: 폐광 **0** · 상단 **0.15** · 균열 **0.3**.
- 유물은 상점에 없고(가격 없음) **일반 드롭에서 나오지 않는다.** 유물 과제는 100층만.
- 등급 라벨: 보급 / 정예 / 유물. `rank`는 화면 호환용으로 line에서 정한다(supply→common, elite→rare, relic→relic).
- UI: 정보는 `<SystemPanel>`, 가운데 정렬, 색은 `tokens.ts`의 `T`만.
- 주석·커밋은 한국어. 커밋 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 테스트는 구현을 일부러 깨서 실패하는지 확인한 뒤 되돌린다.

## Review Focus

1. **재료 드롭이 조용히 바뀌는 것** — 장비 판정 난수 소비가 하나라도 달라지면 모든 층의 재료가 바뀐다. 변경 전 지문과 같아야 한다(Task 4).
2. **기존 세이브의 장비** — 옛 fine/rare 장비를 가진 세이브가 열려도 장비가 남고, 상점에서 못 사게 될 뿐 착용·강화는 그대로다(Task 1·3).
3. **모험 결과가 바뀌는 것** — 정예 판정을 넣어도 기존 성공·각성석 결과가 같아야 한다(Task 6 지문).
4. **단계 경계 층**(10·11·20·21·100층) — `tierOf`가 경계에서 맞고, 100층이 10단계, 101 이상이 없다(Task 1).
5. **상점 잠금 우회** — 화면이 숨겨도 스토어 `buyGear`가 다음 단계 장비를 거부해야 한다(Task 3).

---

### Task 1: 단계·계열 모델과 기존 장비 재배치

**Files:**
- Modify: `src/game/types.ts:267-299` (`GearLine` 추가, `GearDef`에 `tier`·`line`)
- Modify: `src/game/data/gear.ts` (`RANK_LABEL`, 기존 12종에 tier·line, fine→rare 재배치, `tierOf`·`TIER_COUNT`·`LINE_LABEL`·`gearTag`)
- Create: `src/game/data/refParty.ts`
- Test: `src/game/gearLadder.test.ts` (새 파일)

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type GearLine = 'supply' | 'elite' | 'relic';
  // GearDef += { tier: number; line: GearLine }
  // data/gear.ts
  export const TIER_COUNT = 10;
  export const TIER_SPAN = 10;
  export function tierOf(floorId: number): number;          // 1..10
  export function tierFirstFloor(tier: number): number;     // 1, 11, 21, …
  export const LINE_LABEL: Record<GearLine, string>;        // 보급/정예/유물
  export function gearTag(def: GearDef): string;            // "3단계 · 보급", 유물은 "유물"
  // data/refParty.ts
  export function refPartyAt(floorId: number): HeroInstance[];  // sim 기준 출전 파티(대기 제외)
  export function tierRefFloor(tier: number): number;            // 단계 가운데 층 = 10k − 5
  ```

- [ ] **Step 1: 실패하는 테스트** — `src/game/gearLadder.test.ts`

```ts
/**
 * 장비 성장 사다리(2026-10-02) — 단계·계열 모델.
 * 10층마다 한 단계. 보급형은 상점·일반 드롭, 정예는 보스·모험, 유물은 제작.
 */
import { describe, it, expect } from 'vitest';
import { GEAR_DEFS, gearTag, tierOf, tierFirstFloor, TIER_COUNT } from './data/gear';
import { refPartyAt, tierRefFloor } from './data/refParty';
import type { GearDefId } from './types';

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

  it('기준 파티 — 저층 3인 · 생성 구간 5인, 단계 가운데 층', () => {
    expect(refPartyAt(5)).toHaveLength(3);
    expect(refPartyAt(25)).toHaveLength(5);
    expect(tierRefFloor(1)).toBe(5);
    expect(tierRefFloor(10)).toBe(95);
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
    for (const id of ['w_towerbane', 'a_ashshroud', 't_lastlight']) expect(at(id).line).toBe('relic');
  });

  it('표시 꼬리표', () => {
    expect(gearTag(GEAR_DEFS['w_chipped' as GearDefId])).toBe('1단계 · 보급');
    expect(gearTag(GEAR_DEFS['w_emberfang' as GearDefId])).toBe('2단계 · 정예');
    expect(gearTag(GEAR_DEFS['w_towerbane' as GearDefId])).toBe('유물');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/gearLadder.test.ts`
Expected: FAIL — `tierOf`·`refPartyAt` import 실패

- [ ] **Step 3: 타입** — `src/game/types.ts`의 `export type GearRank …` 아래에:

```ts
/**
 * 장비 계열(2026-10-02 장비 성장 사다리).
 *   supply — 보급형. 그 단계에 들어서면 상점에 열리고 일반 층에서도 떨어진다
 *   elite  — 정예. 그 단계 보스가 확정으로, 모험이 확률로 준다. 상점에 없다
 *   relic  — 유물. 제작·최종 과제로만. 단계 사다리 밖이다
 */
export type GearLine = 'supply' | 'elite' | 'relic';
```

`GearDef`에 (`rank` 아래):

```ts
  /** 단계 1~10 — 10층마다 하나(`tierOf`). 유물은 정해진 단계가 없어 0 */
  tier: number;
  line: GearLine;
```

- [ ] **Step 4: 기준 파티** — `src/game/data/refParty.ts`

```ts
/**
 * 단계별 기준 파티 — 장비 사다리의 비율을 재는 잣대.
 *
 * ⚠️ `src/game/sim.ts`의 저층/중층/상층/genParty **출전 인원과 같아야 한다.**
 * sim은 실행하면 표를 찍는 CLI라 import할 수 없어 값을 복제한다(climb-check와 같은 사정).
 * sim을 고치면 여기도 고칠 것. 시드가 없으므로 잠재 계수 0.
 */
import { klassFor } from '../stats';
import { HERO } from './sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from '../types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

export function refPartyAt(floorId: number): HeroInstance[] {
  if (floorId <= 6) return [hero(HERO.ashen, 2, 15, 1), hero(HERO.bulwark, 2, 15, 2), hero(HERO.tide, 3, 20, 3)];
  if (floorId <= 12) return [hero(HERO.ashen, 3, 30, 1), hero(HERO.bulwark, 3, 30, 2), hero(HERO.tide, 3, 35, 3)];
  if (floorId <= 20) return [hero(HERO.ashen, 4, 50, 1), hero(HERO.bulwark, 4, 50, 2), hero(HERO.tide, 4, 55, 3)];
  const g = (star: Star, lv: number, tideLv: number) => [
    hero(HERO.ashen, star, lv, 1), hero(HERO.bulwark, star, lv, 2), hero(HERO.tide, star, tideLv, 3),
    hero(HERO.gale, star, lv, 4), hero(HERO.banner, star, lv, 5),
  ];
  if (floorId <= 40) return g(5, 60, 65);
  if (floorId <= 60) return g(5, 75, 80);
  if (floorId <= 80) return g(6, 85, 90);
  return g(6, 95, 99);
}

/** 단계의 비율을 잴 층 — 단계 가운데(10k − 5). 단계 첫 층은 저층 파티에 치우친다 */
export function tierRefFloor(tier: number): number {
  return tier * 10 - 5;
}
```

  (주의: `../stats`가 `./data`를 import해 순환이 생기면 `klassFor`가 정의된 원래 모듈을 직접 import한다. `sim.ts`가 `./stats`의 `klassFor`를 쓰는 것과 같다.)

- [ ] **Step 5: `data/gear.ts`**
  - `import type { GearDef, GearDefId, GearLine, GearRank, GearSlot } from '../types';`
  - `RANK_LABEL`을 `{ common: '보급', fine: '정교', rare: '정예', relic: '유물' }`로(`fine`은 더 쓰지 않지만 타입이 요구한다 — 주석으로 남긴다).
  - 아래를 `RANK_ORDER` 다음에 추가:

```ts
/** 단계 수 — 10층마다 하나, 100층까지 */
export const TIER_COUNT = 10;
export const TIER_SPAN = 10;

/** 층 → 단계(1~10). 범위 밖은 양 끝으로 접는다 */
export function tierOf(floorId: number): number {
  return Math.min(TIER_COUNT, Math.max(1, Math.ceil(floorId / TIER_SPAN)));
}

export function tierFirstFloor(tier: number): number {
  return (tier - 1) * TIER_SPAN + 1;
}

export const LINE_LABEL: Record<GearLine, string> = {
  supply: '보급',
  elite: '정예',
  relic: '유물',
};

/** 화면 꼬리표 — "3단계 · 보급". 유물은 단계가 없다 */
export function gearTag(def: GearDef): string {
  return def.line === 'relic' ? LINE_LABEL.relic : `${def.tier}단계 · ${LINE_LABEL[def.line]}`;
}
```

  - 기존 12종 각 항목에 `tier`·`line`**만** 넣는다. **`rank`와 `price`는 이 Task에서 건드리지 않는다** —
    옛 드롭·과제 코드가 아직 `rank`로 후보를 거르므로, 여기서 fine을 rare로 바꾸면 후보가 비어 난수 소비가
    달라지고 재료 드롭이 바뀐다. rank 재배치는 Task 5, 가격 정리는 Task 3에서 한다.
    - `w_chipped`·`a_tatter`·`t_charm`: `tier: 1, line: 'supply'`
    - `w_soldier`·`a_guard`·`t_swift`: `tier: 1, line: 'elite'`
    - `w_emberfang`·`a_bulwark`·`t_bloodpact`: `tier: 2, line: 'elite'`
    - 유물 3종: `tier: 0, line: 'relic'`
  - 도감 위 주석을 "기존 12종은 1·2단계와 유물이다. 2단계 이상의 나머지는 `gearLadder.ts`(생성)에서 온다"로 바꾼다.

- [ ] **Step 5b: 재료 지문을 지금 뜬다(드롭 코드가 아직 그대로일 때)** — `src/game/loot.test.ts` 끝에:

```ts
import { rollFloorLoot } from './loot';

/**
 * 재료 지문 — 장비 사다리(STEP 66)가 장비 판정의 난수 소비를 바꾸면 재료가 통째로 바뀐다.
 * 장비의 **종류**는 의도대로 바뀌므로 넣지 않고, 드롭 **유무**와 재료만 넣는다.
 */
function materialsFingerprint(): string {
  let h = 2166136261;
  for (let seed = 1; seed <= 60; seed++) {
    for (const floorId of [1, 3, 6, 9, 12, 20, 30, 55, 90, 100]) {
      const isBoss = floorId === 6 || floorId === 12 || floorId === 20 || (floorId > 20 && floorId % 10 === 0);
      const r = rollFloorLoot({ seed, floorId, isBoss, battleCount: seed % 7, casualties: [], cleared: true });
      const s = JSON.stringify(r.materials) + (r.gearDefId ? 'G' : '-');
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
  }
  return (h >>> 0).toString(16);
}

const EXPECTED_MATERIALS = 'TODO-fill';

describe('장비 사다리 — 재료 드롭 불변', () => {
  it('재료와 장비 드롭 유무가 사다리 도입 전과 같다', () => {
    expect(materialsFingerprint()).toBe(EXPECTED_MATERIALS);
  });
});
```

  Run: `npx vitest run src/game/loot.test.ts` → 실패 메시지의 `Received` 해시를 `EXPECTED_MATERIALS`에 적고 다시 돌려 PASS. 이 지문은 Task 2~5 내내 통과해야 한다(Task 2가 도감에 행을 더해도 후보가 비지 않으므로 소비 횟수는 같다).

- [ ] **Step 6: 확인**

Run: `npm run typecheck && npx vitest run`
Expected: 전체 PASS. 이 Task는 필드를 더하고 함수를 추가할 뿐이라 기존 동작이 바뀌지 않는다.

- [ ] **Step 7: 일부러 깨기** — `tierOf`의 `Math.ceil`을 `Math.floor`로 바꾸면 경계 테스트가 실패해야 한다. 되돌린다.

- [ ] **Step 8: 커밋**

```bash
git add src/game/types.ts src/game/data/gear.ts src/game/data/refParty.ts src/game/gearLadder.test.ts src/game/loot.test.ts
git commit -m "feat(gear): 단계·계열 모델 — 10층 단위 tierOf, 기존 12종에 단계·계열, 재료 드롭 지문

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 사다리 생성 — 비율 함수·생성 스크립트·도감 합치기

**Files:**
- Create: `src/game/gearLadder.ts` (비율 계산 — 순수)
- Create: `scripts/gear-ladder.mts` (풀어서 `--write`)
- Create: `src/game/data/gearLadder.ts` (생성 파일)
- Modify: `src/game/data/gear.ts` (생성 행을 도감에 합치기, 이름 어휘, `ladderSet`)
- Test: `src/game/gearLadder.test.ts` (추가)

**Interfaces:**
- Consumes: `tierOf`, `TIER_COUNT`, `refPartyAt`, `tierRefFloor` (Task 1)
- Produces:
  ```ts
  // game/gearLadder.ts
  export function setPowerRatio(party: readonly HeroInstance[], set: readonly GearBonus[]): number;
  // data/gearLadder.ts (생성)
  export interface LadderRow { tier: number; line: 'supply' | 'elite'; slot: GearSlot; base: GearBonus; price?: number }
  export const GEAR_LADDER: readonly LadderRow[];
  // data/gear.ts
  export function ladderSet(tier: number, line: 'supply' | 'elite'): GearDef[];   // [무기, 방어구, 장신구]
  export const LADDER_TARGET: { supply: { goal: 0.15, lo: 0.12, hi: 0.18 }, elite: { goal: 0.25, lo: 0.21, hi: 0.29 } };
  ```

- [ ] **Step 1: 실패하는 테스트 추가** — `src/game/gearLadder.test.ts` 끝에 (import에 `ladderSet`, `LADDER_TARGET`, `GEAR_SLOTS`, `bonusOf`·`makeGear`(`./gear`), `setPowerRatio`(`./gearLadder`) 추가)

```ts
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
   */
  it('보급 한 벌 12~18%, 정예 한 벌 21~29% — 1~10단계 전부', () => {
    for (let t = 1; t <= TIER_COUNT; t++) {
      const party = refPartyAt(tierRefFloor(t));
      for (const line of ['supply', 'elite'] as const) {
        const r = setPowerRatio(party, ladderSet(t, line).map((d) => bonusOf(makeGear(d.id, 1))));
        const { lo, hi } = LADDER_TARGET[line];
        expect(r, `${t}단계 ${line} ${(r * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(lo);
        expect(r, `${t}단계 ${line} ${(r * 100).toFixed(1)}%`).toBeLessThanOrEqual(hi);
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/gearLadder.test.ts`
Expected: FAIL — `setPowerRatio`/`ladderSet` 없음

- [ ] **Step 3: 비율 함수** — `src/game/gearLadder.ts`

```ts
/**
 * 장비 사다리의 잣대 — 한 벌을 입혔을 때 파티 전투력 증가율.
 *
 * 전투력(`power.ts`)은 표시 전용 요약값이지만, 스탯의 가중합이라 "장비가 얼마나 거드는가"를
 * 한 숫자로 비교하기에 알맞다. 파티 단위 합으로 잰다 — `partyPower`가 합이기 때문이다.
 */
import { combatPower } from './power';
import { applyBonus, sumBonus } from './gear';
import { statsOfInstance } from './stats';
import { gameData } from './data';
import type { GearBonus, HeroInstance } from './types';

export function setPowerRatio(party: readonly HeroInstance[], set: readonly GearBonus[]): number {
  const bonus = sumBonus([...set]);
  let before = 0;
  let after = 0;
  for (const h of party) {
    const base = statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling);
    before += combatPower(base);
    after += combatPower(applyBonus(base, bonus));
  }
  return after / before - 1;
}
```

  (`sumBonus`의 실제 시그니처를 `src/game/gear.ts`에서 확인해 맞춘다 — 배열을 받아 합친 `GearBonus`를 돌려주는 함수다.)

- [ ] **Step 4: 생성 스크립트** — `scripts/gear-ladder.mts`

```ts
/**
 * 장비 사다리 수치 생성 — `npx tsx scripts/gear-ladder.mts [--write]`
 *
 * 단계 t의 기준 파티(refPartyAt(tierRefFloor(t)))에 한 벌을 입혔을 때 파티 전투력이
 * 보급 +15% / 정예 +25%가 되도록 슬롯별 크기를 푼다. 전투력은 스탯의 가중합(선형)이라
 * 닫힌 식으로 풀린다. 결과를 setPowerRatio로 다시 재서 허용 범위를 확인하고,
 * --write면 src/game/data/gearLadder.ts에 쓴다(floor-tune --write와 같은 방식).
 *
 * 슬롯 몫: 무기 40% · 방어구 35% · 장신구 25%.
 * crit·spd는 단계와 무관하게 고정(무한히 키우면 crit 상한 1에 닿는다) — atk/hp/def만 키운다.
 */
import { writeFileSync } from 'node:fs';
import { POWER_WEIGHTS as W, POWER_SCALE } from '../src/game/data/power';
import { refPartyAt, tierRefFloor } from '../src/game/data/refParty';
import { TIER_COUNT, LADDER_TARGET, GEAR_DEFS } from '../src/game/data/gear';
import { setPowerRatio } from '../src/game/gearLadder';
import { combatPower } from '../src/game/power';
import { statsOfInstance } from '../src/game/stats';
import { gameData, FLOORS } from '../src/game/data';
import { floorRewards } from '../src/game/data/floors';
import type { GearBonus, GearDefId, GearSlot } from '../src/game/types';

type Line = 'supply' | 'elite';
const SHARE: Record<GearSlot, number> = { weapon: 0.4, armor: 0.35, trinket: 0.25 };
/** 단계와 무관한 고정 부분 */
const FIXED: Record<Line, Record<GearSlot, GearBonus>> = {
  supply: { weapon: { crit: 0.02 }, armor: {}, trinket: { spd: 4, crit: 0.02 } },
  elite: { weapon: { crit: 0.04 }, armor: {}, trinket: { spd: 8, crit: 0.03 } },
};
const raw = (b: GearBonus) =>
  (b.hp ?? 0) * W.hp + (b.atk ?? 0) * W.atk + (b.def ?? 0) * W.def + (b.spd ?? 0) * W.spd + (b.crit ?? 0) * W.crit;

/** 1인 평균 전투력 원값(÷POWER_SCALE 전) */
function avgRaw(tier: number): number {
  const party = refPartyAt(tierRefFloor(tier));
  const sum = party.reduce((s, h) => s + combatPower(statsOfInstance(h, gameData.heroes[h.defId], gameData.starScaling)), 0);
  return (sum * POWER_SCALE) / party.length;
}

function solve(tier: number, line: Line, slot: GearSlot): GearBonus {
  const want = LADDER_TARGET[line].goal * SHARE[slot] * avgRaw(tier);
  const fixed = FIXED[line][slot];
  const rest = Math.max(0, want - raw(fixed));
  if (slot === 'weapon') return { ...fixed, atk: Math.max(1, Math.round(rest / W.atk)) };
  if (slot === 'trinket') return { ...fixed, atk: Math.max(1, Math.round(rest / W.atk)) };
  // 방어구: hp:def = 11:1
  const u = rest / (11 * W.hp + W.def);
  return { hp: Math.max(1, Math.round(11 * u)), def: Math.max(1, Math.round(u)) };
}

/** 보급형 한 개 값 = 그 단계 가운데 층 한 번 돌파(8턴 가정)의 금. 10 단위 반올림 */
function price(tier: number): number {
  const f = FLOORS.find((x) => x.id === tierRefFloor(tier))!;
  return Math.round(floorRewards(f, 8).gold / 10) * 10;
}

const rows: string[] = [];
console.log('\n  단계 | 계열 | 비율');
for (let t = 1; t <= TIER_COUNT; t++) {
  for (const line of ['supply', 'elite'] as Line[]) {
    // 기존 장비가 차지한 자리(1단계 보급·정예, 2단계 정예)는 생성하지 않고 비율만 보고한다
    const legacy = (t === 1) || (t === 2 && line === 'elite');
    const set = (['weapon', 'armor', 'trinket'] as GearSlot[]).map((slot) => {
      if (legacy) {
        const d = Object.values(GEAR_DEFS).find((x) => x.tier === t && x.line === line && x.slot === slot)!;
        return d.base;
      }
      const base = solve(t, line, slot);
      rows.push(`  { tier: ${t}, line: '${line}', slot: '${slot}', base: ${JSON.stringify(base)}${line === 'supply' ? `, price: ${price(t)}` : ''} },`);
      return base;
    });
    const r = setPowerRatio(refPartyAt(tierRefFloor(t)), set);
    const { lo, hi } = LADDER_TARGET[line];
    console.log(`  ${String(t).padStart(2)}   | ${line.padEnd(6)} | ${(r * 100).toFixed(1)}%${r < lo || r > hi ? '  ← 범위 밖' : ''}${legacy ? ' (기존)' : ''}`);
  }
}

if (process.argv.includes('--write')) {
  const body = `/**
 * 장비 사다리 수치 — **자동 생성 파일. 손으로 고치지 말 것.**
 * \`npx tsx scripts/gear-ladder.mts --write\`가 단계별 기준 파티로 풀어 쓴다.
 * 기준 파티·전투력 가중치·LADDER_TARGET을 바꿨으면 다시 돌릴 것.
 */
import type { GearBonus, GearSlot } from '../types';

export interface LadderRow {
  tier: number;
  line: 'supply' | 'elite';
  slot: GearSlot;
  base: GearBonus;
  price?: number;
}

export const GEAR_LADDER: readonly LadderRow[] = [
${rows.join('\n')}
];
`;
  writeFileSync(new URL('../src/game/data/gearLadder.ts', import.meta.url), body);
  console.log(`\n  썼다: src/game/data/gearLadder.ts (${rows.length}행)`);
}
```

  ⚠️ `scripts/gear-ladder.mts`가 `data/gear.ts`를 import하고 `data/gear.ts`는 `gearLadder.ts`(생성)를 import한다. 첫 실행 전에 `src/game/data/gearLadder.ts`를 **빈 배열로** 만들어 둔다:

```ts
/** 자동 생성 파일 — scripts/gear-ladder.mts --write. 손으로 고치지 말 것. */
import type { GearBonus, GearSlot } from '../types';
export interface LadderRow { tier: number; line: 'supply' | 'elite'; slot: GearSlot; base: GearBonus; price?: number }
export const GEAR_LADDER: readonly LadderRow[] = [];
```

- [ ] **Step 5: 도감 합치기** — `src/game/data/gear.ts`

```ts
import { GEAR_LADDER } from './gearLadder';

/** 사다리 비율 목표 — 단계 기준 파티가 한 벌을 입었을 때 파티 전투력 증가율 */
export const LADDER_TARGET = {
  supply: { goal: 0.15, lo: 0.12, hi: 0.18 },
  elite: { goal: 0.25, lo: 0.21, hi: 0.29 },
} as const;

/**
 * 단계 이름 어휘 — 2단계부터. 1단계와 2단계 정예는 기존 장비가 차지했다.
 * 구간(기슭·상층·심층·천층·정상)마다 두 단계씩이다.
 */
const TIER_WORD: Record<number, string> = {
  2: '관문', 3: '상층', 4: '바람벽', 5: '심층', 6: '잿물',
  7: '천층', 8: '구름결', 9: '정상', 10: '꼭대기',
};
const LINE_NOUN: Record<'supply' | 'elite', Record<GearSlot, string>> = {
  supply: { weapon: '보급 장검', armor: '보급 갑옷', trinket: '보급 부적' },
  elite: { weapon: '파수꾼의 검', armor: '파수꾼의 판금', trinket: '파수꾼의 인장' },
};
```

  `GEAR_DEFS` 생성식을 "기존 12종 + 사다리 행"으로 바꾼다 — 기존 배열을 `LEGACY_DEFS`로 이름 붙이고:

```ts
const LADDER_DEFS: GearDef[] = GEAR_LADDER.map((r) => {
  const id = g(`g_t${r.tier}_${r.line}_${r.slot}`);
  return {
    id,
    name: `${TIER_WORD[r.tier]} ${LINE_NOUN[r.line][r.slot]}`,
    slot: r.slot,
    rank: r.line === 'supply' ? 'common' : 'rare',
    tier: r.tier,
    line: r.line,
    base: r.base,
    ...(r.line === 'supply' ? { price: r.price } : {}),
  };
});

export const GEAR_DEFS: Record<GearDefId, GearDef> = Object.fromEntries(
  [...LEGACY_DEFS, ...LADDER_DEFS].map((d) => [d.id, d]),
) as Record<GearDefId, GearDef>;

/** 단계·계열의 한 벌 — [무기, 방어구, 장신구] 순 */
export function ladderSet(tier: number, line: 'supply' | 'elite'): GearDef[] {
  return GEAR_SLOTS.map((slot) =>
    Object.values(GEAR_DEFS).find((d) => d.tier === tier && d.line === line && d.slot === slot)!,
  ).filter(Boolean);
}
```

- [ ] **Step 6: 생성 실행**

Run: `npx tsx scripts/gear-ladder.mts`
Expected: 단계별 비율 표. 2단계 보급 이상 생성 행은 전부 범위 안(풀이가 목표 15%/25%를 겨눈다). **기존 자리(1단계 보급·정예, 2단계 정예)가 "범위 밖"이면** Step 7.

Run: `npx tsx scripts/gear-ladder.mts --write`
Expected: `썼다: src/game/data/gearLadder.ts (51행)` — 보급 2~10단계 27행 + 정예 3~10단계 24행.

- [ ] **Step 7: 기존 장비 맞추기(필요할 때만)** — 범위 밖인 기존 한 벌은 **id·이름·설명은 두고** 그 벌 세 개의 `atk`·`hp`·`def`를 같은 배수로 곱해 목표에 맞춘다(배수 = 목표 / 현재 비율 근사, crit·spd는 그대로). 고친 값과 전후 비율을 ledger에 `Ruling:`으로 남긴다. 다시 `npx tsx scripts/gear-ladder.mts`로 확인.

- [ ] **Step 8: 확인**

Run: `npx vitest run src/game/gearLadder.test.ts && npm run typecheck`
Expected: PASS(단계 구성·비율·가격 오름차순).

Run: `npx vitest run`
Expected: 재료 지문은 PASS. **의도된 일시 실패**: `gear.test.ts`의 "상점 재고는 등급 오름차순…"·"등급이 높을수록 비싸다" — 옛 `shopStock`이 가격 있는 사다리 보급형까지 섞어 보여서다. Task 3이 상점 규칙과 함께 바꿔 쓴다. 이 둘 밖의 실패는 원인을 먼저 본다.

- [ ] **Step 9: 일부러 깨기** — `LADDER_TARGET.supply.goal`을 0.3으로 바꾸고 `--write` 없이 테스트만 돌리면 통과(생성 파일 그대로)하지만, `--write`로 다시 쓰면 비율 테스트가 실패해야 한다. 확인 후 0.15로 되돌리고 `--write`를 다시 돌려 원래 파일로 복구한다(`git diff src/game/data/gearLadder.ts`가 비어야 한다).

- [ ] **Step 10: 커밋**

```bash
git add src/game/gearLadder.ts scripts/gear-ladder.mts src/game/data/gearLadder.ts src/game/data/gear.ts src/game/gearLadder.test.ts
git commit -m "feat(gear): 장비 사다리 생성 — 2~10단계 보급·정예 51종, 비율 보급 15%·정예 25% 잠금

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 상점 — 열린 단계의 보급형만, 잠금 미리보기

**Files:**
- Modify: `src/game/data/gear.ts:140-145` (`shopStock` 시그니처, `nextShopTier`)
- Modify: `src/stores/runStore.ts:1715-` (`buyGear` 잠금), `BuyGearResult` reason에 `'locked'`
- Modify: `src/game/gear.test.ts:56-72` (상점 테스트를 새 규칙으로)
- Test: `src/game/gearLadder.test.ts` (추가), `src/stores/gear.test.ts` (추가)

**Interfaces:**
- Consumes: `tierOf`, `tierFirstFloor`, `ladderSet` (Task 1·2)
- Produces:
  ```ts
  export function shopStock(slot: GearSlot, unlockedTier: number): GearDef[];  // 최신 단계 먼저
  export function nextShopTier(unlockedTier: number): { tier: number; floor: number } | null;
  export function unlockedTierOf(maxFloorId: number): number;  // = tierOf(maxFloorId)
  // BuyGearResult: { ok: false; reason: 'not-sold' | 'not-enough-gold' | 'locked' }
  ```

- [ ] **Step 1: 실패하는 테스트**
  - `src/game/gearLadder.test.ts` 끝에:

```ts
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
});
```

  - `src/game/gear.test.ts:56-72`의 두 테스트("상점 재고는 등급 오름차순…", "등급이 높을수록 비싸다")를 다음으로 **바꾼다**(같은 의도 — 상점은 가격이 있는 것만, 위 단계가 더 비싸다):

```ts
  it('상점 재고는 전부 가격이 있는 보급형이다', () => {
    for (const slot of ['weapon', 'armor', 'trinket'] as GearSlot[]) {
      const stock = shopStock(slot, 10);
      expect(stock.length).toBe(10);
      for (const d of stock) {
        expect(d.price).toBeGreaterThan(0);
        expect(d.line).toBe('supply');
      }
    }
  });

  it('위 단계일수록 비싸다', () => {
    const w = shopStock('weapon', 10); // 최신 단계 먼저
    for (let i = 1; i < w.length; i++) expect(w[i - 1].price!).toBeGreaterThan(w[i].price!);
  });
```

  - `src/game/gearLadder.test.ts`의 '기존 장비 재배치' describe에 추가:

```ts
  it('보급형만 가격이 있다 — 정예·유물은 상점에 없다(옛 정교·희귀도)', () => {
    for (const d of Object.values(GEAR_DEFS)) {
      if (d.line === 'supply') expect(d.price, d.id).toBeGreaterThan(0);
      else expect(d.price, d.id).toBeUndefined();
    }
  });
```

  - `src/stores/gear.test.ts`에 추가(파일 상단의 기존 store 헬퍼 이름에 맞춘다 — `createRunStore`와 MemStorage stub이 이미 있다):

```ts
describe('상점 잠금', () => {
  it('아직 안 열린 단계의 보급형은 금이 있어도 못 산다', () => {
    const s = createRunStore(() => 1);
    s.setState({ wallet: { ...s.getState().wallet, gold: 999999 } });
    const r = s.getState().buyGear('g_t2_supply_weapon' as GearDefId);
    expect(r).toEqual({ ok: false, reason: 'locked' });
  });

  it('최전선이 11층이면 2단계 보급형을 산다', () => {
    const s = createRunStore(() => 1);
    s.setState({ maxFloorReached: 10, wallet: { ...s.getState().wallet, gold: 999999 } });
    expect(s.getState().buyGear('g_t2_supply_weapon' as GearDefId).ok).toBe(true);
  });

  it('정예는 상점에서 팔지 않는다 — 옛 정교 장비도', () => {
    const s = createRunStore(() => 1);
    s.setState({ maxFloorReached: 99, wallet: { ...s.getState().wallet, gold: 999999 } });
    expect(s.getState().buyGear('w_soldier' as GearDefId)).toEqual({ ok: false, reason: 'not-sold' });
  });
});
```

  (`maxFloorReached`는 **층 인덱스**다 — `FLOORS[maxFloorReached].id`가 층 번호. 10 → 11층.)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/gearLadder.test.ts src/game/gear.test.ts src/stores/gear.test.ts`
Expected: FAIL — `shopStock` 인자·`nextShopTier`·`'locked'` 없음

- [ ] **Step 3: 구현** — `data/gear.ts`의 `shopStock`을 교체:

```ts
/**
 * 상점 재고 — 열린 단계까지의 **보급형**, 최신 단계 먼저.
 * 정예·유물은 팔지 않는다(정예는 보스·모험, 유물은 제작). 금으로 상위 장비를 살 수 있으면
 * 등반이 아니라 지갑이 강함을 정한다.
 */
export function shopStock(slot: GearSlot, unlockedTier: number): GearDef[] {
  return Object.values(GEAR_DEFS)
    .filter((d) => d.slot === slot && d.line === 'supply' && d.price != null && d.tier <= unlockedTier)
    .sort((a, b) => b.tier - a.tier);
}

/** 다음에 열릴 보급형 단계와 그 층. 마지막 단계면 null */
export function nextShopTier(unlockedTier: number): { tier: number; floor: number } | null {
  const tier = unlockedTier + 1;
  return tier > TIER_COUNT ? null : { tier, floor: tierFirstFloor(tier) };
}

/** 최전선 층 번호 → 열린 단계 */
export function unlockedTierOf(maxFloorId: number): number {
  return tierOf(maxFloorId);
}
```

  `runStore.ts` `buyGear`:

```ts
      if (!def || def.price == null || def.line !== 'supply') return { ok: false, reason: 'not-sold' };
      // 화면이 숨겨도 여기서 막는다 — 다음 단계는 그 단계 첫 층에 닿아야 열린다
      if (def.tier > unlockedTierOf(FLOORS[get().maxFloorReached].id)) return { ok: false, reason: 'locked' };
```

  `data/gear.ts`의 옛 fine 3종(`w_soldier`·`a_guard`·`t_swift`)과 rare 3종(`w_emberfang`·`a_bulwark`·`t_bloodpact`)에서 **`price`를 지운다**(정예는 상점에 없다). `rank`는 아직 그대로 둔다(Task 5).

  `BuyGearResult` 타입의 reason 유니온에 `'locked'` 추가.

  `ShopScreen`은 `shopStock`의 시그니처가 바뀌어 typecheck가 깨지므로, 이 Task에서 **배선만** 한다: `ShopScreenProps`에 `/** 열린 단계 — 최전선 층에서 */ unlockedTier: number;`를 추가하고 `shopStock(slot, unlockedTier)`로 부른다. App은 `unlockedTier={unlockedTierOf(FLOORS[maxFloorReached].id)}`를 넘긴다(App이 `maxFloorReached`를 구독하지 않으면 `useRunStore((s) => s.maxFloorReached)` 추가). 잠금 카드 등 화면 모양은 Task 7.

- [ ] **Step 4: 확인**

Run: `npx vitest run src/game/gearLadder.test.ts src/game/gear.test.ts src/stores/gear.test.ts && npm run typecheck`
Expected: PASS(드롭 가중치 테스트는 아직 실패 — Task 4).

- [ ] **Step 5: 일부러 깨기** — `buyGear`의 `locked` 줄을 지우면 "아직 안 열린 단계" 테스트가 실패해야 한다. 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add src/game/data/gear.ts src/stores/runStore.ts src/game/gear.test.ts src/game/gearLadder.test.ts src/stores/gear.test.ts src/screens/ShopScreen.tsx src/App.tsx
git commit -m "feat(shop): 상점은 열린 단계의 보급형만 — 다음 단계는 그 단계 첫 층에서, 스토어가 잠금 강제

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 층 드롭 — 일반은 보급형, 보스는 정예 (난수 소비 불변)

**Files:**
- Modify: `src/game/loot.ts:131-142`
- Modify: `src/game/data/gear.ts` (`dropWeights`·`dropTable` 삭제)
- Modify: `src/game/gear.test.ts:74-91` (드롭 가중치 테스트를 새 규칙으로)
- Test: `src/game/loot.test.ts` (추가)

**Interfaces:**
- Consumes: `tierOf`, `ladderSet` (Task 1·2)
- Produces: `rollFloorLoot` 반환 모양 불변(`gearDefId`)

- [ ] **Step 1: 지문 확인** — 재료 지문 테스트는 Task 1(Step 5b)에서 사다리 도입 전 값으로 이미 들어가 있다.

Run: `npx vitest run src/game/loot.test.ts`
Expected: 지문 PASS(아직 드롭 코드를 안 바꿨다).

- [ ] **Step 2: 새 규칙 테스트** — `src/game/loot.test.ts`에 추가:

```ts
import { GEAR_DEFS, tierOf } from './data/gear';

describe('장비 사다리 — 층 드롭', () => {
  const drop = (floorId: number, isBoss: boolean) => {
    for (let seed = 1; seed < 400; seed++) {
      const r = rollFloorLoot({ seed, floorId, isBoss, battleCount: 0, casualties: [], cleared: true });
      if (r.gearDefId) return GEAR_DEFS[r.gearDefId];
    }
    throw new Error('드롭이 안 나왔다');
  };

  it('일반 층은 그 층 단계의 보급형', () => {
    for (const f of [1, 9, 15, 33, 77, 99]) {
      const d = drop(f, false);
      expect([d.tier, d.line], `${f}층`).toEqual([tierOf(f), 'supply']);
    }
  });

  it('보스 층은 그 층 단계의 정예(확정)', () => {
    for (const f of [6, 12, 20, 30, 100]) {
      const r = rollFloorLoot({ seed: 3, floorId: f, isBoss: true, battleCount: 0, casualties: [], cleared: true });
      expect(r.gearDefId, `${f}층`).not.toBeNull();
      const d = GEAR_DEFS[r.gearDefId!];
      expect([d.tier, d.line], `${f}층`).toEqual([tierOf(f), 'elite']);
    }
  });

  it('일반 드롭에서 유물은 나오지 않는다', () => {
    for (let seed = 1; seed < 300; seed++) {
      for (const f of [10, 50, 100]) {
        const r = rollFloorLoot({ seed, floorId: f, isBoss: f === 50, battleCount: 1, casualties: [], cleared: true });
        if (r.gearDefId) expect(GEAR_DEFS[r.gearDefId].line).not.toBe('relic');
      }
    }
  });
});
```

  `src/game/gear.test.ts:74-91`의 드롭 가중치 테스트 셋("저층 드롭 표에는…", "깊어질수록 유물…", "모든 깊이에서 가중치 합…")은 **삭제**하고, import의 `dropWeights`도 지운다 — 같은 의도(저층에 상위 장비 없음, 깊이로 잠금)는 위 `loot.test.ts`의 단계 테스트가 맡는다. 삭제 사유를 커밋 메시지에 적는다.

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/game/loot.test.ts`
Expected: 지문 PASS, 새 규칙 3개 FAIL(지금은 등급 추첨이라 단계·계열이 안 맞는다)

- [ ] **Step 4: 구현** — `loot.ts` ②를 교체:

```ts
  // ② 층 드롭 장비 — 그 층 단계의 보급형, 보스 층이면 정예
  let gearDefId: GearDefId | null = null;
  const gearChance = isBoss ? GEAR_TUNING.bossDropChance : GEAR_TUNING.dropChance;
  if (rng() < gearChance) {
    /*
      ⚠️ 옛 "등급 추첨" 자리 — 값은 쓰지 않지만 **소비는 지킨다.**
      이 한 번을 빼면 뒤의 재료 판정이 전 층에서 한 칸씩 밀린다(지문 테스트가 잠근다).
    */
    rng();
    const pool = ladderSet(tierOf(floorId), isBoss ? 'elite' : 'supply');
    if (pool.length > 0) {
      gearDefId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id;
    }
  }
```

  import를 `import { GEAR_TUNING, ladderSet, tierOf } from './data/gear';`로, `weightedPick` import가 더 안 쓰이면 지운다. `data/gear.ts`의 `dropTable`·`dropWeights`를 삭제한다(`quest.ts`가 `dropTable`을 쓰면 Task 5에서 바꾸므로, 이 Task에서는 `dropTable`만 남겨 두고 `dropWeights`만 지운다). `materials.ts`·`recipes.ts`의 `dropWeights` 언급 주석은 "단계 사다리(`tierOf`)"로 고친다.

- [ ] **Step 5: 확인**

Run: `npx vitest run src/game/loot.test.ts src/game/gear.test.ts && npm run typecheck`
Expected: PASS — **지문이 그대로 통과해야 한다.**

- [ ] **Step 6: 일부러 깨기** — `rng();`(옛 등급 자리)를 지우면 지문이 실패해야 한다. 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add src/game/loot.ts src/game/data/gear.ts src/game/loot.test.ts src/game/gear.test.ts src/game/data/materials.ts src/game/data/recipes.ts
git commit -m "feat(loot): 층 드롭을 단계 사다리로 — 일반 보급형·보스 정예, 유물 일반 드롭 제외, 재료 지문 불변

드롭 가중치 테스트 3개는 dropWeights 삭제로 지웠다 — 저층 상위 장비 금지는 loot.test 단계 테스트가 맡는다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 과제 장비 보상 — 그 과제 층의 단계

**Files:**
- Modify: `src/game/quest.ts:133, 153-165`
- Modify: `src/game/data/gear.ts` (`dropTable` 삭제 — 더 쓰는 곳이 없으면)
- Modify: `src/game/quest.test.ts:217-227`, `src/stores/gear.test.ts:349` (새 규칙으로)

**Interfaces:**
- Consumes: `tierOf`, `ladderSet`
- Produces: `rollQuestGear(reward: QuestReward, rng: RNG, n: number, floorId: number): GearInstance | null`

- [ ] **Step 1: 테스트를 새 규칙으로** — `quest.test.ts:217` 부근 두 테스트를:

```ts
  it('gearRank common은 그 과제 층 단계의 보급형, fine·rare는 정예', () => {
    for (let s = 1; s < 30; s++) {
      const a = rollQuestGear({ gearRank: 'common' }, createRng(s), 1, 15)!;
      expect([GEAR_DEFS[a.defId].tier, GEAR_DEFS[a.defId].line]).toEqual([2, 'supply']);
      const b = rollQuestGear({ gearRank: 'fine' }, createRng(s), 1, 7)!;
      expect([GEAR_DEFS[b.defId].tier, GEAR_DEFS[b.defId].line]).toEqual([1, 'elite']);
      const c = rollQuestGear({ gearRank: 'rare' }, createRng(s), 1, 18)!;
      expect([GEAR_DEFS[c.defId].tier, GEAR_DEFS[c.defId].line]).toEqual([2, 'elite']);
    }
  });

  it('난수는 한 번만 쓴다 — 과제 보상이 뒤의 판정을 밀지 않는다', () => {
    const r1 = createRng(9);
    rollQuestGear({ gearRank: 'rare' }, r1, 1, 18);
    const r2 = createRng(9);
    r2();
    expect(r1()).toBe(r2());
  });
```

  (기존 `:227` 테스트가 위 두 번째와 같은 의도면 그것을 바꿔 쓴다.) `src/stores/gear.test.ts:349`의 `expect(['common', 'fine']).toContain(…rank)`는 그 테스트가 재는 층의 의도(저층 보상은 상위가 아니다)를 유지해 `expect(GEAR_DEFS[g.defId].tier).toBe(1)`로 바꾼다 — 바꾸기 전에 그 테스트 본문을 읽고 층 번호를 확인한다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/quest.test.ts`
Expected: FAIL — 인자 수·단계 불일치

- [ ] **Step 3: 구현** — `quest.ts`:

```ts
export function rollQuestGear(
  reward: QuestReward,
  rng: RNG,
  n: number,
  floorId: number,
): GearInstance | null {
  if (reward.gear) return makeGear(reward.gear, n);
  if (!reward.gearRank) return null;

  /*
    등급 → 그 과제 층의 단계 사다리. common은 보급형, 그 위는 정예.
    유물 과제는 `gear`(종류 확정)로만 준다 — gearRank 'relic'은 쓰지 않는다.
  */
  const pool = reward.gearRank === 'common'
    ? ladderSet(tierOf(floorId), 'supply')
    : ladderSet(tierOf(floorId), 'elite');
  if (pool.length === 0) return null;
  const pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return makeGear(pick.id, n);
}
```

  호출부 `:133`을 `rollQuestGear(quest.reward, rng, seq + 1, quest.floorId)`로. `dropTable` import 제거, 다른 사용처가 없으면 `data/gear.ts`에서 `dropTable` 삭제.

  이제 `rank`로 후보를 거르는 코드가 없으므로 **rank를 line에 맞춘다** — 옛 fine 3종을 `rank: 'rare'`로. 그리고 `gearLadder.test.ts` '기존 장비 재배치'에 추가:

```ts
  it('rank는 line에서 정해진다 — supply=common, elite=rare, relic=relic', () => {
    const want = { supply: 'common', elite: 'rare', relic: 'relic' } as const;
    for (const d of Object.values(GEAR_DEFS)) expect(d.rank, d.id).toBe(want[d.line]);
  });
```

  rank를 아직 읽는 곳(`craft.test.ts:24`의 relic 확인, `quest.test.ts:77-78`의 relic 확인)은 relic이라 영향이 없다. `grep -rn "\.rank" src`로 다시 확인한다.

- [ ] **Step 4: 확인**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS(Task 1에서 기록한 의도된 실패가 모두 해소).

- [ ] **Step 5: 일부러 깨기** — `quest.floorId`를 `1`로 바꾸면 단계 테스트가 실패해야 한다. 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add src/game/quest.ts src/game/data/gear.ts src/game/quest.test.ts src/stores/gear.test.ts src/game/gearLadder.test.ts
git commit -m "feat(quest): 과제 장비 보상을 그 과제 층의 단계로 — common 보급, fine·rare 정예. 옛 정교 rank를 정예로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 모험 정예 드롭

**Files:**
- Modify: `src/game/data/adventures.ts` (`AdventureReward.eliteChance`, 3종 값)
- Modify: `src/game/adventure.ts` (`resolveAdventure`에 `tier`, `AdventureOutcome.gearDefId`)
- Modify: `src/game/offTower.ts` (`OffTowerInput.tier`, 통과)
- Modify: `src/stores/runStore.ts` (finish — 모험 장비 지급), `src/App.tsx` (`previewOffTower`에 tier)
- Modify: `src/screens/result/OffTowerPanel.tsx` (귀환 블록에 장비 이름)
- Test: `src/game/adventure.test.ts`, `src/game/offTower.test.ts`, `src/stores/dispatch.test.ts` (추가)

**Interfaces:**
- Consumes: `tierOf`, `ladderSet`, `unlockedTierOf`
- Produces:
  ```ts
  // AdventureReward += { eliteChance: number }
  // AdventureOutcome += { gearDefId: GearDefId | null }
  // resolveAdventure(args: { dispatch; heroes; rng; tier: number })
  // OffTowerInput += { tier: number }
  ```

- [ ] **Step 1: 지문 먼저(변경 전 코드에서)** — `src/game/adventure.test.ts` 끝에 `EXPECTED_OUTCOMES = 'TODO-fill'`로 넣고 돌려 해시를 적는다:

```ts
/** 모험 결과 지문 — 정예 판정을 기존 소비 뒤에 붙였는지 잠근다 */
function outcomesFingerprint(): string {
  let h = 2166136261;
  for (const advId of [MINE, 'adv_caravan' as AdventureId, RIFT]) {
    for (let seed = 1; seed <= 80; seed++) {
      const o = resolveAdventure({
        dispatch: dispatchOf(advId, seed % 5),
        heroes: [hero(10, 0), hero(10, 1)],
        rng: adventureRng(seed, advId, seed % 5),
        // @ts-expect-error 변경 전 코드에는 tier 인자가 없다 — 변경 후 이 주석을 지운다
        tier: 3,
      });
      const s = `${o.success ? 1 : 0}${o.awakeningStones}${o.expEach}${o.injuryRatio}`;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
  }
  return (h >>> 0).toString(16);
}
const EXPECTED_OUTCOMES = 'TODO-fill';

describe('모험 — 정예 장비', () => {
  it('정예 판정을 넣어도 성공·각성석·exp·부상은 그대로다', () => {
    expect(outcomesFingerprint()).toBe(EXPECTED_OUTCOMES);
  });
});
```

  Run: `npx vitest run src/game/adventure.test.ts` → `Received` 해시를 적고 PASS 확인.

- [ ] **Step 2: 새 규칙 테스트** — 같은 describe에 추가:

```ts
  it('균열·상단은 성공 시 확률로 그 단계 정예를, 폐광은 주지 않는다', () => {
    let rift = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = resolveAdventure({ dispatch: dispatchOf(RIFT, 0), heroes: [hero(30, 0), hero(30, 1)], rng: adventureRng(seed, RIFT, 0), tier: 4 });
      if (r.gearDefId) {
        rift++;
        expect(r.success).toBe(true);
        expect([GEAR_DEFS[r.gearDefId].tier, GEAR_DEFS[r.gearDefId].line]).toEqual([4, 'elite']);
      }
      const m = resolveAdventure({ dispatch: dispatchOf(MINE, 0, 1), heroes: [hero(30, 0)], rng: adventureRng(seed, MINE, 0), tier: 4 });
      expect(m.gearDefId).toBeNull();
    }
    expect(rift).toBeGreaterThan(0);
  });
```

  `offTower.test.ts`에 `input()` 기본값 `tier: 1` 추가, 그리고:

```ts
  it('모험 장비는 outcomes에 정의 id로만 실린다 — 발번은 스토어 몫', () => {
    for (let seed = 1; seed < 200; seed++) {
      const d: Dispatch = { advId: RIFT, heroIds: [id(2), id(3)], startedAtBattle: 6 };
      const r = settleOffTower(input({ seed, tier: 5, dispatches: [d], roster: [hero(0), hero(2, 40), hero(3, 40)] }));
      const g = r.outcomes[0].gearDefId;
      if (!g) continue;
      expect(GEAR_DEFS[g].tier).toBe(5);
      return;
    }
    throw new Error('정예가 한 번도 안 나왔다');
  });
```

  `src/stores/dispatch.test.ts` '파견 — 보상 지급'에 추가:

```ts
  it('모험이 정예를 주면 창고에 들어온다', () => {
    for (let seed = 1; seed < 80; seed++) {
      const { s, outcome } = runToCompletion(seed, RIFT);
      if (!outcome?.gearDefId) continue;
      expect(s.getState().gear.some((g) => g.defId === outcome.gearDefId && g.equippedBy === null)).toBe(true);
      return;
    }
    throw new Error('정예가 한 번도 안 나왔다');
  });
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/game/adventure.test.ts src/game/offTower.test.ts src/stores/dispatch.test.ts`
Expected: 지문 PASS, 새 테스트 FAIL(`gearDefId` 없음)

- [ ] **Step 4: 구현**
  - `data/adventures.ts`: `AdventureReward`에

```ts
  /**
   * 성공 시 그 단계 **정예** 장비를 줄 확률(장비 사다리, 2026-10-02).
   * 판정은 각성석 **뒤에** 한다 — 앞에 끼우면 기존 모험 결과가 전부 바뀐다.
   */
  eliteChance: number;
```
    폐광 `eliteChance: 0`, 상단 `0.15`, 균열 `0.3`.
  - `adventure.ts`: `AdventureOutcome`에 `gearDefId: GearDefId | null;`(빈손·실패는 null). `resolveAdventure` 인자에 `tier: number`. 성공 분기에서 각성석 판정 **다음**에:

```ts
  // 정예 — 각성석 **뒤**. 순서를 바꾸면 기존 모험 결과가 전부 바뀐다(지문 테스트)
  let gearDefId: GearDefId | null = null;
  if (def.reward.eliteChance > 0 && rng() < def.reward.eliteChance) {
    const pool = ladderSet(tier, 'elite');
    if (pool.length > 0) gearDefId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id;
  }
```
    `empty`에 `gearDefId: null`, 성공 반환에 `gearDefId`.
  - `offTower.ts`: `OffTowerInput`에 `/** 정산 시점의 열린 단계 — 모험 정예의 단계 */ tier: number;`, `resolveAdventure` 호출에 `tier: input.tier`.
  - `runStore.ts` finish: `settleOffTower` 입력에 `tier: unlockedTierOf(FLOORS[get().maxFloorReached].id)`. 장비 지급:

```ts
      /** 모험 정예 — 발번은 드롭·과제 다음 번호부터 */
      const advGear = off.outcomes
        .map((o) => o.gearDefId)
        .filter((id): id is GearDefId => id != null)
        .map((id, k) => makeGear(id, get().gearSeq + dropped.length + questGear.length + k + 1));
```
    `gear` 배열 끝에 `...advGear`, `gearSeq`에 `+ advGear.length`.
  - `App.tsx` `previewOffTower`의 입력에 `tier: unlockedTierOf(FLOORS[maxFloorReached].id)`(App이 이미 `maxFloorReached`를 구독하는지 확인하고 없으면 `useRunStore((s) => s.maxFloorReached)` 추가).
  - `OffTowerPanel.tsx` 귀환 블록, 각성석 줄 아래:

```tsx
              {o.gearDefId && GEAR_DEFS[o.gearDefId] && (
                <div style={{ ...line, color: T.gold }}>
                  {GEAR_DEFS[o.gearDefId].name} <span style={{ color: T.dim }}>· {gearTag(GEAR_DEFS[o.gearDefId])}</span>
                </div>
              )}
```
  - 지문 테스트의 `// @ts-expect-error` 주석을 지운다.

- [ ] **Step 5: 확인**

Run: `npx vitest run && npm run typecheck`
Expected: 전체 PASS — **모험 지문 그대로**, `src/stores/offTower.test.ts`(finish = settleOffTower)도 그대로.

- [ ] **Step 6: 일부러 깨기** — 정예 판정 블록을 각성석 판정 **앞**으로 옮기면 모험 지문이 실패해야 한다. 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add src/game/data/adventures.ts src/game/adventure.ts src/game/offTower.ts src/stores/runStore.ts src/App.tsx src/screens/result/OffTowerPanel.tsx src/game/adventure.test.ts src/game/offTower.test.ts src/stores/dispatch.test.ts
git commit -m "feat(adventure): 모험 성공 시 그 단계 정예를 확률로 — 상단 15%·균열 30%, 기존 결과 지문 불변

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 화면 — 상점 단계·잠금 카드, 결과 화면 드롭, 대장간 정렬, 꼬리표

**Files:**
- Modify: `src/screens/ShopScreen.tsx` (단계 카드·잠금 미리보기, `RANK_LABEL` → `gearTag`)
- Modify: `src/screens/SmithScreen.tsx:165, 190, 335` (정렬, 꼬리표)
- Modify: `src/screens/DetailModal.tsx:206, 228` (꼬리표)
- Modify: `src/screens/ResultScreen.tsx` (층 드롭 장비 줄), `src/App.tsx` (`previewMaterials` → 드롭 장비도)

**Interfaces:**
- Consumes: `shopStock(slot, unlockedTier)`, `nextShopTier`, `gearTag`, `GEAR_DEFS`
- Produces: `ResultScreenProps.gearDrop?: GearDefId | null`

- [ ] **Step 1: 상점** — `ShopScreen`에서 `const stock = shopStock(slot, unlockedTier);` 와 `const next = nextShopTier(unlockedTier);`. 재고 목록 **위**에 다음 단계 잠금 카드:

```tsx
            {next && (() => {
              const d = ladderSet(next.tier, 'supply').find((x) => x.slot === slot);
              return d && (
                <SystemPanel compact>
                  <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.1em' }}>
                    🔒 {d.name}
                  </div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>
                    {next.floor}층 도달 시 · {gearTag(d)} · 금 {d.price}
                  </div>
                </SystemPanel>
              );
            })()}
```
  카드의 `RANK_LABEL[def.rank]` 자리를 `gearTag(def)`로. "전부 못 삼" 경고(`:198` 부근)가 재고 전체를 보던 판정이면 **최신 단계(stock[0])** 기준으로 바꾼다 — 옛 단계를 못 사는 것은 경고할 일이 아니다.

- [ ] **Step 2: 대장간** — `SmithScreen`의 `gear.map(...)` 전에 정렬:

```tsx
  /** 단계 내림차순 → 슬롯 순 — 장비가 60종이 되면 정렬 없는 목록이 가장 먼저 무너진다 */
  const sorted = [...gear].sort((a, b) => {
    const da = GEAR_DEFS[a.defId];
    const db = GEAR_DEFS[b.defId];
    if (!da || !db) return 0;
    return (db.tier - da.tier) || (GEAR_SLOTS.indexOf(da.slot) - GEAR_SLOTS.indexOf(db.slot));
  });
```
  `gear.map` → `sorted.map`. `RANK_LABEL[d.rank]` 두 곳(`:190`, `:335`) → `gearTag(d)`/`gearTag(def)`. 유물은 `tier: 0`이라 맨 아래로 간다 — 유물을 위로 올리려면 정렬 키를 `(d.line === 'relic' ? 99 : d.tier)`로 둔다(유물이 보통 가장 강하므로 이쪽으로 한다).

- [ ] **Step 3: 상세창** — `DetailModal.tsx:206, 228`의 `RANK_LABEL[...]`을 `gearTag(...)`로. 안 쓰이게 된 `RANK_LABEL` import 정리.

- [ ] **Step 4: 결과 화면 드롭** — `App.tsx`의 `previewMaterials`를 `previewLoot`로 바꿔 `rollFloorLoot(...)` 결과 전체를 돌려주고, `materials={loot.materials}` `gearDrop={loot.gearDefId}`를 넘긴다(승리가 아니면 `{ materials: {}, gearDefId: null }`). `ResultScreen` props에 `gearDrop?: GearDefId | null`, 재료 블록 **위**에:

```tsx
        {gearDrop && GEAR_DEFS[gearDrop] && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.panelHi}` }}>
            <div style={{ fontSize: 12, color: floor.isBoss ? T.gold : T.rare, letterSpacing: '.2em', marginBottom: 6 }}>
              {floor.isBoss ? `◆ ${floor.id}층 보스의 전리품` : '◇ 장비'}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              {GEAR_DEFS[gearDrop].name}
              <span style={{ color: T.dim }}> · {gearTag(GEAR_DEFS[gearDrop])}</span>
            </div>
          </div>
        )}
```

- [ ] **Step 5: 확인**

Run: `npm run typecheck && npx vitest run`
Expected: 통과.

- [ ] **Step 6: 브라우저 375×667** — `npm run dev -- --port 5180 --strictPort`, Playwright로:
  1) 상점 무기 탭: 1단계 보급만 + "🔒 관문 보급 장검 · 11층 도달 시" 카드
  2) 1층 승리 결과: 드롭이 나오면 "◇ 장비 · 이 빠진 검 · 1단계 · 보급"(드롭은 35%라 안 나올 수 있다 — 안 나오면 기록만)
  3) 대장간 목록 단계·슬롯 순
  4) 세 화면 `document.documentElement.scrollWidth` ≤ 360
  측정값을 ledger에 적는다. 보스 전리품 화면은 6층까지 가야 하므로 플레이로 닿지 못하면 "미확인"으로 남긴다.

- [ ] **Step 7: 커밋**

```bash
git add src/screens/ShopScreen.tsx src/screens/SmithScreen.tsx src/screens/DetailModal.tsx src/screens/ResultScreen.tsx src/App.tsx
git commit -m "feat(ui): 상점 단계·다음 단계 잠금 카드, 결과 화면 장비 드롭·보스 전리품, 대장간 단계 정렬, 보급/정예 꼬리표

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 측정 — `climb-check --gear`

**Files:**
- Modify: `climb-check.mts:122-170` (`climb`에 장비 옵션)

**Interfaces:**
- Consumes: `ladderSet`, `tierOf`, `makeGear`(`src/game/gear.ts`)

- [ ] **Step 1: 기준선 확인(변경 전)**

Run: `npx tsx climb-check.mts > /tmp-climb-before.txt` 대신 작업 공간 파일로: `npx tsx climb-check.mts > .superpowers/sdd/2026-10-02-gear-ladder/climb-before.txt`
Expected: 표 출력(저층 66% / 중층 14% / … 현행 기준선과 같아야 한다).

- [ ] **Step 2: 옵션 구현** — 파일 상단:

```ts
import { ladderSet, tierOf } from './src/game/data/gear';
import { makeGear } from './src/game/gear';
import type { GearInstance, GearInstId } from './src/game/types';

/**
 * --gear supply|elite — 기준 파티가 **층의 단계에 맞는 한 벌**을 입고 오른다(장비 사다리 측정).
 * 옵션이 없으면 지금과 같다(장비 없음 = 층 난이도 기준선). 기준선을 바꾸지 말 것.
 */
const GEAR_ARG = process.argv.includes('--gear')
  ? (process.argv[process.argv.indexOf('--gear') + 1] as 'supply' | 'elite')
  : null;

/** 단계별 한 벌 인벤토리 — 영웅마다 같은 장비를 따로 입힌 것으로 친다(인스턴스 id만 다르게) */
function gearUp(roster: HeroInstance[], floorId: number): { party: HeroInstance[]; inventory?: Map<GearInstId, GearInstance> } {
  if (!GEAR_ARG) return { party: roster };
  const set = ladderSet(tierOf(floorId), GEAR_ARG);
  const inventory = new Map<GearInstId, GearInstance>();
  const party = roster.map((h, i) => {
    const gear: Partial<Record<string, GearInstId>> = {};
    set.forEach((d, k) => {
      const g = { ...makeGear(d.id, i * 3 + k + 1), equippedBy: h.instId };
      inventory.set(g.instId, g);
      gear[d.slot] = g.instId;
    });
    return { ...h, gear };
  });
  return { party, inventory };
}
```

  `climb` 안 `runEncounter` 호출을:

```ts
    const geared = gearUp(sortie, FLOORS[i].id);
    const r = runEncounter({
      party: geared.party, floor: FLOORS[i], data: gameData,
      rng: createRng(seed * 1000 + i),
      inventory: geared.inventory,
    });
```
  첫 `console.log` 제목 줄에 `GEAR_ARG ? ` · 장비 ${GEAR_ARG}` : ''`를 붙인다. (`HeroInstance.gear`의 실제 타입 이름을 `types.ts`에서 확인해 `Partial<Record<GearSlot, GearInstId>>`로 맞춘다.)

- [ ] **Step 3: 기준선 불변 확인**

Run: `npx tsx climb-check.mts > .superpowers/sdd/2026-10-02-gear-ladder/climb-after.txt && diff .superpowers/sdd/2026-10-02-gear-ladder/climb-before.txt .superpowers/sdd/2026-10-02-gear-ladder/climb-after.txt`
Expected: 차이 없음.

- [ ] **Step 4: 장비 측정**

Run: `npx tsx climb-check.mts --gear supply` 와 `--gear elite`
Expected: 구간 완주율이 기준선보다 오른다. 수치를 ledger와 Task 9의 HANDOFF에 기록(합격 기준이 아니라 기록).

- [ ] **Step 5: 커밋**

```bash
git add climb-check.mts
git commit -m "chore(climb-check): --gear supply|elite — 단계에 맞는 한 벌을 입고 오르는 측정, 기본값 불변

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 문서 — HANDOFF STEP 66 · CLAUDE.md

**Files:**
- Modify: `docs/HANDOFF.md` (STEP 65 뒤에 STEP 66, §1차 셀프 테스트 결과 4번에 "→ STEP 66(장비 사다리, 하위 작업 A)")
- Modify: `CLAUDE.md` (게임 규칙·디렉토리·명령어·테스트 수)
- Modify: `docs/gdd-v3.md` (§4.6 장비 — 사다리 반영 한 단락, BaseMap 언급이 낡았으면 그대로 두고 범위 밖으로 기록)

- [ ] **Step 1: HANDOFF STEP 66** — 기존 STEP 형식(만든 것 / 설계 판단 / 알아둘 것 / 결과). 반드시:
  - 사용자 결정 셋(장비 비중 여유분·상점=보급/보스·모험=정예·10단계), 지적 4번 분해(A~D)와 남은 B·C·D
  - 난수 소비 불변(재료·모험 지문), 유물 일반 드롭 제외, 옛 fine/rare 상점 제외
  - 생성 파일 규칙(`gear-ladder.mts --write`, 손으로 고치지 말 것), 기존 장비 수치를 고쳤다면 그 값
  - `climb-check --gear` 측정값, 실제 테스트 수, 브라우저 실측
- [ ] **Step 2: CLAUDE.md**
  - 게임 규칙에: "**장비 사다리(STEP 66).** 10층마다 1단계(`tierOf`), 단계마다 보급형(상점·일반 드롭)·정예(보스 확정·모험 확률). 장비는 **여유분**이다 — 층 난이도·sim·climb-check 기본값은 장비 없음. 2단계 이상 수치는 `data/gearLadder.ts`(생성 — `npx tsx scripts/gear-ladder.mts --write`)에만 있고 손으로 고치지 않는다. 비율(보급 12~18%·정예 21~29%)을 테스트가 잠근다. 장비 판정 난수 소비를 바꾸지 말 것(재료 지문), 모험 정예 판정은 각성석 뒤(모험 지문). 장비 id는 세이브에 남으므로 추가만."
  - 디렉토리에 `gearLadder.ts  # 장비 사다리 비율(setPowerRatio)`, `data/gearLadder.ts  # 생성 파일`, `data/refParty.ts  # 단계별 기준 파티 — sim과 같아야 한다`.
  - 명령어 블록에 `npx tsx scripts/gear-ladder.mts [--write]`, `npx tsx climb-check.mts --gear supply|elite`.
  - `⚠️ 장비는 시설·잠재치와 같은 칼날` 문단에 "기본 표는 장비를 안 쓴다 — 장비를 만졌으면 `--gear`로 잴 것" 한 줄.
  - 테스트 수 갱신.
- [ ] **Step 3: 커밋**

```bash
git add docs/HANDOFF.md CLAUDE.md docs/gdd-v3.md
git commit -m "docs: 장비 성장 사다리 STEP 66 — HANDOFF·CLAUDE.md 규칙·gdd-v3 §4.6

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
