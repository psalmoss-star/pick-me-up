# 유물 재련 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 유물 3종을 2~10단계 사다리에 넣고, 대장간에서 재료·금으로 같은 유물을 한 단계씩 재련하게 만든다. 유물은 같은 단계 정예보다 한 칸 위에 머문다.

**Architecture:** 단계마다 유물 `GearDef`를 따로 두고(2단계는 기존 id, 3~10단계는 `{기존 id}_t{단계}`) 재련은 장비 개체의 `defId`만 다음 단계 것으로 바꾼다. 세이브 형식·전투 엔진·장비 비교는 손대지 않는다. 수치는 사다리와 같은 생성기(`scripts/gear-ladder.mts --write`)가 만들고, 비율과 재련 비용의 최종값은 측정(`climb-check --gear relic`, `scripts/mat-probe.mts`)으로 고른다.

**Tech Stack:** React 18 + TypeScript + Zustand + Vitest. 명령: `npx vitest run <file>`, `npm test`, `npm run typecheck`, `npx tsx <script>`.

**Spec:** `docs/superpowers/specs/2026-10-06-relic-refine-design.md`

## Global Constraints

- `src/game/` 아래는 순수 함수만. `Math.random()` 금지.
- **재련·제작은 RNG를 받지 않는다.** `craft.ts`의 어떤 함수 인자에도 RNG가 등장하면 안 된다.
- 밸런스 수치는 `src/game/data/`에만. 유물 수치는 **생성 파일**(`data/gearLadder.ts`)에만 있고 손으로 고치지 않는다.
- **장비 id는 추가만.** 기존 `w_towerbane`·`a_ashshroud`·`t_lastlight`는 2단계 유물로 남는다. 새 id는 `{기존 id}_t{3..10}`.
- 유물은 2~10단계. 1단계 유물은 없다.
- 유물은 상점·일반 드롭·보스 드롭·모험에 없다(가격 없음). 유물 과제 보상은 최종 층에만.
- 층 난이도·`sim`·`climb-check` 기본값(옵션 없음)은 **장비 없음 그대로**. 출력이 바뀌면 안 된다.
- 지문 불변: `ordersBaseline.test.ts`, `loot.test.ts`(재료 `4bf1febb`), `adventure.test.ts`(모험 `b1142e9f`). **깨지면 갱신하지 말고 변경을 의심한다.**
- 비율 출발값: 유물 한 벌 2단계 **13%**(범위 11~15%), 3단계 이후 **7%**(범위 5.5~9%). 최종값은 Task 2가 완주율로 고른다.
- 합격 기준(`climb-check --gear relic`, 숙소 Lv.3, 21층 이후 네 구간): 장비 없음 대비 **+35~40%p 근처**, 구간마다 정예보다 높고, **어느 구간도 90%를 넘지 않는다.**
- 제작 레시피(재료·금·해금 층)는 바꾸지 않는다.
- UI: 정보는 `<SystemPanel>`, 가운데 정렬, 색은 `tokens.ts`의 `T`만, 밝은 배경 금지.
- 주석·커밋은 한국어. 커밋 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 테스트는 구현을 일부러 깨서 실패하는지 확인한 뒤 되돌린다(각 Task의 "깨서 확인" 단계).
- 게임 로직 커밋 전에는 `/verify`를 돌린다(문서·테스트만 바뀐 커밋은 제외).

## Review Focus

스펙이 암시하지만 놓치기 쉬운 것. 각 줄의 테스트는 괄호 안 Task에 들어 있다.

1. **착용 중인 유물을 재련한다** → 영웅의 `gear` 참조(`instId`)가 그대로 유효하고 착용자가 유지된다. (Task 4)
2. **강화 +5 유물을 재련한다** → `enhance`가 보존되고 보정은 새 단계 base × 1.6이다. (Task 3)
3. **옛 세이브에 `w_towerbane`이 있다** → 불러온 뒤 2단계 유물로 살아 있고, 재련한 유물(`_t3`)도 저장·복원된다. (Task 4)
4. **조건 미달로 재련을 누른다** → 재료·금이 하나도 빠지지 않는다. 재료는 충분한데 금만 모자란 경우도 같다. (Task 4)
5. **저층을 고른 채 대장간에 온다** → 잠금은 `maxFloorReached`로 판정한다. 지금 고른 층이 아니다. (Task 4)

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `src/game/data/gear.ts` | 유물 계보(가족·단계별 def)·`ladderTarget` 유물 줄·`relicNext`·`gearTag` | 수정 |
| `scripts/gear-ladder.mts` | 유물 2~10단계 수치 풀이 | 수정 |
| `src/game/data/gearLadder.ts` | 생성 파일 — 유물 27행 추가 | 재생성 |
| `src/game/gearLadder.test.ts` | 유물 단계·비율·단조·계보 잠금 | 수정 |
| `climb-check.mts` | `--gear relic`이 층 단계의 유물을 입힌다 | 수정 |
| `src/game/data/quests.ts` | 100층 과제 보상 = 10단계 유물 | 수정 |
| `src/game/data/recipes.ts` | 재련 비용(`REFINE_MATERIALS`·`refineCostOf`) | 수정 |
| `src/game/craft.ts` | `canRefine`·`refine` | 수정 |
| `src/game/craft.test.ts` | 재련 판정 테스트 | 수정 |
| `src/stores/runStore.ts` | `refineGear` 액션 | 수정 |
| `src/stores/refine.test.ts` | 스토어 재련·저장 테스트 | 생성 |
| `scripts/mat-probe.mts` | 구간별 재료 수급 측정 | 생성 |
| `src/screens/SmithScreen.tsx`, `src/App.tsx` | 재련 영역·연결 | 수정 |
| `CLAUDE.md`, `docs/HANDOFF.md`, `docs/gdd-v3.md`, 장비 사다리 스펙 | 기록 | 수정 |

---

### Task 1: 유물 단계 데이터와 생성기

**Files:**
- Modify: `src/game/data/gear.ts`
- Modify: `scripts/gear-ladder.mts`
- Regenerate: `src/game/data/gearLadder.ts`
- Test: `src/game/gearLadder.test.ts`

**Interfaces:**
- Produces:
  - `RELIC_FIRST_TIER = 2`
  - `ladderTarget(tier: number, line: GearLine): { goal: number; lo: number; hi: number }`
  - `ladderSet(tier: number, line: GearLine): GearDef[]` — 유물은 2~10단계에서 3개, 1단계는 빈 배열
  - `relicNext(defId: GearDefId): GearDefId | null` — 유물이 아니거나 10단계면 null
  - `gearTag(def)` — 유물도 `"3단계 · 유물"`
  - 유물 id: 2단계 `w_towerbane`·`a_ashshroud`·`t_lastlight`, N단계(3~10) `w_towerbane_tN` 등

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/gearLadder.test.ts`에서 아래 두 곳을 고치고, 파일 끝에 새 `describe`를 붙인다. import에 `relicNext`, `RELIC_FIRST_TIER`를 더한다.

기존 60행과 66행을 바꾼다:

```ts
    for (const id of ['w_towerbane', 'a_ashshroud', 't_lastlight']) expect([at(id).tier, at(id).line]).toEqual([2, 'relic']);
```

```ts
    expect(gearTag(GEAR_DEFS['w_towerbane' as GearDefId])).toBe('2단계 · 유물');
```

파일 끝에 추가:

```ts
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/game/gearLadder.test.ts`
Expected: FAIL — `relicNext`·`RELIC_FIRST_TIER`가 export되지 않았다는 오류.

- [ ] **Step 3: `data/gear.ts`를 고친다**

(a) `gearTag`와 그 주석(64~67행)을 바꾼다:

```ts
/** 화면 꼬리표 — "3단계 · 보급". 유물도 단계가 있다(재련, 2026-10-06) */
export function gearTag(def: GearDef): string {
  return `${def.tier}단계 · ${LINE_LABEL[def.line]}`;
}
```

(b) `LEGACY_DEFS`에서 유물 세 줄(`w_towerbane`·`a_ashshroud`·`t_lastlight`)을 **지운다.** 도감 주석의 "기존 12종은 1·2단계와 유물이다"를 "기존 9종은 1·2단계다. 유물 3종은 아래 `RELIC_DEFS`가 만든다"로 고친다.

(c) `LADDER_TARGET` 셋과 `ladderTarget`을 바꾼다:

```ts
export const LADDER_TARGET = {
  supply: { goal: 0.03, lo: 0.02, hi: 0.04 },
  elite: { goal: 0.05, lo: 0.04, hi: 0.065 },
  /** 유물 — 정예보다 한 칸 위(재련, 2026-10-06). `climb-check --gear relic`으로 고른다 */
  relic: { goal: 0.07, lo: 0.055, hi: 0.09 },
} as const;
```

```ts
export const LADDER_TARGET_TIER2 = {
  supply: { goal: 0.05, lo: 0.04, hi: 0.06 },
  elite: { goal: 0.09, lo: 0.075, hi: 0.105 },
  relic: { goal: 0.13, lo: 0.11, hi: 0.15 },
} as const;
```

```ts
/** 단계·계열의 비율 목표 — 생성기와 테스트가 같이 쓴다. 유물은 2단계부터라 1단계 값이 없다 */
export function ladderTarget(tier: number, line: GearLine) {
  if (line === 'relic') return (tier <= RELIC_FIRST_TIER ? LADDER_TARGET_TIER2 : LADDER_TARGET).relic;
  const t = tier <= 1 ? LADDER_TARGET_TIER1 : tier === 2 ? LADDER_TARGET_TIER2 : LADDER_TARGET;
  return t[line];
}
```

(d) `LADDER_DEFS`가 유물 행을 건너뛰게 하고, 그 아래에 유물 def를 만든다. `GEAR_DEFS` 조립에 넣는다:

```ts
/** 2단계 이상 사다리 장비 — 수치는 생성 파일(`gearLadder.ts`)에서 온다 */
const LADDER_DEFS: GearDef[] = GEAR_LADDER.flatMap((r) => (r.line === 'relic' ? [] : [{
  id: g(`g_t${r.tier}_${r.line}_${r.slot}`),
  name: `${TIER_WORD[r.tier]} ${LINE_NOUN[r.line][r.slot]}`,
  slot: r.slot,
  rank: r.line === 'supply' ? 'common' as const : 'rare' as const,
  tier: r.tier,
  line: r.line,
  base: r.base,
  ...(r.line === 'supply' ? { price: r.price } : {}),
}]));

/** 유물이 시작하는 단계 — 제작(10·12·15층)이 만드는 것이 이 단계다 */
export const RELIC_FIRST_TIER = 2;

/**
 * 유물 가족 — 슬롯마다 하나. 이름·설명은 단계가 올라도 같다(같은 물건을 재련한다).
 * 2단계 id는 옛 유물 id 그대로다 — 세이브의 유물이 저절로 2단계가 된다.
 */
const RELIC_FAMILY: Record<GearSlot, { id: string; name: string; lore?: string }> = {
  weapon: { id: 'w_towerbane', name: '탑을 베는 것', lore: '이름만 남고 주인은 남지 않았다.' },
  armor: { id: 'a_ashshroud', name: '재의 장막' },
  trinket: { id: 't_lastlight', name: '마지막 불빛', lore: '꺼지기 직전이 가장 밝다.' },
};
const relicId = (slot: GearSlot, tier: number) =>
  g(tier === RELIC_FIRST_TIER ? RELIC_FAMILY[slot].id : `${RELIC_FAMILY[slot].id}_t${tier}`);

/** 유물 2~10단계 — 수치는 생성 파일에서 온다. 상점에 없다(price 없음) */
const RELIC_DEFS: GearDef[] = GEAR_LADDER.flatMap((r) => (r.line !== 'relic' ? [] : [{
  id: relicId(r.slot, r.tier),
  name: RELIC_FAMILY[r.slot].name,
  slot: r.slot,
  rank: 'relic' as const,
  tier: r.tier,
  line: 'relic' as const,
  base: r.base,
  ...(RELIC_FAMILY[r.slot].lore ? { lore: RELIC_FAMILY[r.slot].lore } : {}),
}]));

export const GEAR_DEFS: Record<GearDefId, GearDef> = Object.fromEntries(
  [...LEGACY_DEFS, ...LADDER_DEFS, ...RELIC_DEFS].map((d) => [d.id, d]),
) as Record<GearDefId, GearDef>;

/** 단계·계열의 한 벌 — [무기, 방어구, 장신구] 순. 빠진 슬롯은 건너뛴다 */
export function ladderSet(tier: number, line: GearLine): GearDef[] {
  return GEAR_SLOTS
    .map((slot) => Object.values(GEAR_DEFS).find((d) => d.tier === tier && d.line === line && d.slot === slot))
    .filter((d): d is GearDef => !!d);
}

/** 재련하면 되는 다음 단계 유물. 유물이 아니거나 마지막 단계면 null */
export function relicNext(defId: GearDefId): GearDefId | null {
  const d = GEAR_DEFS[defId];
  if (!d || d.line !== 'relic' || d.tier >= TIER_COUNT) return null;
  return relicId(d.slot, d.tier + 1);
}
```

기존 `ladderSet`(238~242행)은 위 것으로 대체한다(중복 선언 금지).

(e) `src/game/types.ts`의 `GearDef.tier` 주석을 고친다: `/** 단계 1~10 — 10층마다 하나(\`tierOf\`). 유물은 2~10 */`. `GearLine` 주석의 "단계 사다리 밖이다"는 "제작·최종 과제로만. 대장간에서 재련해 단계를 올린다"로.

- [ ] **Step 4: 생성기를 고친다 — `scripts/gear-ladder.mts`**

(a) 23~30행을 바꾼다:

```ts
type Line = 'supply' | 'elite' | 'relic';
const SLOTS: GearSlot[] = ['weapon', 'armor', 'trinket'];
const SHARE: Record<GearSlot, number> = { weapon: 0.4, armor: 0.35, trinket: 0.25 };
/** 단계와 무관한 고정 부분. 유물은 모양이 다르다 — 무기에 속도가 붙고 장신구는 체력으로 큰다 */
const FIXED: Record<Line, Record<GearSlot, GearBonus>> = {
  supply: { weapon: { crit: 0.02 }, armor: {}, trinket: { spd: 4, crit: 0.02 } },
  elite: { weapon: { crit: 0.04 }, armor: {}, trinket: { spd: 8, crit: 0.03 } },
  relic: { weapon: { crit: 0.05, spd: 4 }, armor: {}, trinket: { spd: 10, crit: 0.05 } },
};
```

(b) `solve`의 마지막 줄을 바꾼다(유물 장신구는 공격 대신 체력):

```ts
  if (line === 'relic' && slot === 'trinket') return { ...fixed, hp: Math.max(1, Math.round(rest / W.hp)) };
  return { ...fixed, atk: Math.max(1, Math.round(rest / W.atk)) };
```

(c) 메인 루프를 유물까지 돌게 바꾼다(116~140행 전체 대체):

```ts
for (let t = 1; t <= TIER_COUNT; t++) {
  for (const line of ['supply', 'elite', 'relic'] as Line[]) {
    // 유물은 2단계부터다 — 제작이 10·12·15층에 열린다
    if (line === 'relic' && t < 2) continue;
    // 기존 장비가 차지한 자리(1단계 보급·정예, 2단계 정예)는 생성하지 않고 비율만 보고한다
    const legacy = line !== 'relic' && (t === 1 || (t === 2 && line === 'elite'));
    const set = SLOTS.map((slot) => {
      if (legacy) {
        const d = Object.values(GEAR_DEFS).find((x) => x.tier === t && x.line === line && x.slot === slot)!;
        prevBase.set(`${line}:${slot}`, d.base);
        return d.base;
      }
      const base = atLeastPrev(solve(t, line, slot), prevBase.get(`${line}:${slot}`));
      prevBase.set(`${line}:${slot}`, base);
      rows.push(`  { tier: ${t}, line: '${line}', slot: '${slot}', base: ${JSON.stringify(base)}${line === 'supply' ? `, price: ${price(t)}` : ''} },`);
      return base;
    });
    const r = setPowerRatio(refPartyAt(tierRefFloor(t)), set);
    const { lo, hi } = ladderTarget(t, line);
    const out = r < lo || r > hi;
    console.log(`  ${String(t).padStart(2)}   | ${line.padEnd(6)} | ${(r * 100).toFixed(1)}%${out ? '  ← 범위 밖' : ''}${legacy ? ' (기존)' : ''}`);
    // 기존 자리가 범위 밖이면 같은 풀이로 맞춘 값을 제안한다 — data/gear.ts의 기존 항목에 손으로 옮긴다(id·이름 유지)
    if (legacy && out) {
      for (const slot of SLOTS) console.log(`         제안 ${slot}: ${JSON.stringify(solve(t, line, slot))}`);
    }
  }
}
```

(d) `--write` 본문의 `LadderRow.line` 타입을 `'supply' | 'elite' | 'relic'`으로 바꾼다. 파일 머리 주석의 "보급 +15% / 정예 +25%"는 "`ladderTarget`의 목표(보급·정예·유물)"로 고친다.

(e) `scalable`의 MIN_STEP 보정은 `hp`를 키우므로 유물 장신구에도 그대로 작동한다 — 손대지 않는다.

- [ ] **Step 5: 생성 파일을 다시 쓴다**

Run: `npx tsx scripts/gear-ladder.mts --write`
Expected: 표에 `relic` 줄이 2~10단계로 9개 찍히고 "← 범위 밖"이 없다. 마지막 줄 `썼다: src/game/data/gearLadder.ts (78행)`(기존 51 + 유물 27).

"← 범위 밖"이 유물 줄에 뜨면: 구간의 두 번째 단계(4·6·8·10)는 기하 평균 풀이 때문에 목표보다 높게 나온다. `LADDER_TARGET.relic.hi`를 그 실측값 + 0.005로 올리고 다시 돌린다(정예의 `hi: 0.065`가 같은 이유로 goal보다 30% 높다).

- [ ] **Step 6: 테스트를 통과시킨다**

Run: `npx vitest run src/game/gearLadder.test.ts`
Expected: PASS.

Run: `npm test`
Expected: 전부 통과. 실패하면 아래만 고친다.
- `src/game/gear.test.ts`의 "무기를 끼우면 적을 더 빨리 죽인다"가 실패하면(유물이 약해져 `faster > slower`가 안 서는 경우) 그 테스트의 무기를 `gd('w_towerbane_t10')`으로 바꾼다 — 그 테스트가 재는 것은 "무기 보정이 전투에 닿는가"이지 유물 수치가 아니다.
- 지문 테스트(`ordersBaseline`·`loot`·`adventure`)가 깨지면 **갱신하지 말고** 이 Task의 변경을 되짚는다. 유물 def는 드롭 후보가 아니어야 한다(`line === 'supply' | 'elite'`로만 고른다).

Run: `npm run typecheck`
Expected: 에러 없음.

- [ ] **Step 7: 깨서 확인한다**

각각 고친 뒤 `npx vitest run src/game/gearLadder.test.ts`가 **실패**하는지 보고 되돌린다.
1. `relicNext`의 `d.tier >= TIER_COUNT`를 `d.tier > TIER_COUNT`로 → "끝에서 null" 실패.
2. `relicId`가 2단계에도 `_t2`를 붙이게 → "id 규칙" 실패.
3. `LADDER_TARGET.relic.goal`을 0.04로 바꾸고 `--write` → "유물이 정예보다 강하다" 실패. 되돌리고 다시 `--write`.

- [ ] **Step 8: 커밋**

```bash
git add src/game/data/gear.ts src/game/data/gearLadder.ts src/game/types.ts scripts/gear-ladder.mts src/game/gearLadder.test.ts src/game/gear.test.ts
git commit -m "feat(gear): 유물을 사다리에 — 2~10단계 27종 생성, 2단계는 기존 id, relicNext 계보

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 완주율로 유물 비율을 고른다 + 100층 과제 보상

**Files:**
- Modify: `climb-check.mts`
- Modify: `src/game/data/gear.ts` (`LADDER_TARGET.relic`·`LADDER_TARGET_TIER2.relic` — 측정 결과에 따라)
- Regenerate: `src/game/data/gearLadder.ts`
- Modify: `src/game/data/quests.ts`
- Test: `src/game/quest.test.ts`

**Interfaces:**
- Consumes: `ladderSet(tier, 'relic')`, `RELIC_FIRST_TIER` (Task 1)
- Produces: 확정된 `ladderTarget(tier, 'relic')` 값. 과제 보상 id `w_towerbane_t10`·`t_lastlight_t10`.

- [ ] **Step 1: `climb-check.mts`의 유물 옵션을 단계에 맞춘다**

`RELIC_FROM`·`RELIC_SET` 선언과 그 주석을 아래로 바꾼다:

```ts
/**
 * --gear relic|relic1 — 유물 한 벌이 사다리 옆에서 얼마나 센지 재는 측정.
 * 층 단계의 유물을 입힌다. 유물은 2단계(11층)부터라 그 전은 정예다.
 * relic = 전원(상한), relic1 = 첫 출전자 1명만, 나머지는 정예.
 */
```

import를 `import { RELIC_FIRST_TIER, ladderSet, tierOf } from './src/game/data/gear';`로 바꾸고, `gearUp` 안을 고친다:

```ts
  const relicMode = GEAR_ARG === 'relic' || GEAR_ARG === 'relic1';
  const tier = tierOf(floorId);
  const ladder = ladderSet(tier, relicMode ? 'elite' : GEAR_ARG);
  const relics = relicMode && tier >= RELIC_FIRST_TIER ? ladderSet(tier, 'relic') : null;
  const inventory = new Map<GearInstId, GearInstance>();
  const party = roster.map((h, i) => {
    const gear: Partial<Record<GearSlot, GearInstId>> = {};
    const set = relics && (GEAR_ARG === 'relic' || i === 0) ? relics : ladder;
```

안내 문구의 `${RELIC_FROM}층부터`는 `11층부터`로 바꾼다.

- [ ] **Step 2: 기본 출력이 그대로인지 확인한다**

Run: `npx tsx climb-check.mts`
Expected: 구간별 완주율이 `저층 66% / 중층 14% / 상층 10% / 31 / 31 / 42 / 21%` 근처(300회 표본, 변경 전과 같은 값). "⚙ 장비" 줄이 없다.

- [ ] **Step 3: 재서 표를 채운다**

Run: `npx tsx climb-check.mts --gear elite`, `npx tsx climb-check.mts --gear relic1`, `npx tsx climb-check.mts --gear relic`

마지막 표("구간별 연속 등반")의 완주율을 적는다:

| 장비 | 저층 | 중층 | 상층 | 21~40 | 41~60 | 61~80 | 81~100 |
|---|---|---|---|---|---|---|---|
| 없음(기준) | 66 | 14 | 10 | 31 | 31 | 42 | 21 |
| elite | | | | | | | |
| relic1 | | | | | | | |
| relic | | | | | | | |

- [ ] **Step 4: 합격 기준과 대조하고 필요하면 조정한다**

합격 기준(21층 이후 네 구간, `relic` 줄):
1. 각 구간이 `elite`보다 높다.
2. 각 구간이 90% 이하다.
3. 네 구간 평균 상승폭(없음 대비)이 +32~42%p 안이다.
4. `relic1`이 각 구간에서 `elite` 이상 `relic` 이하다(±3%p 표본 오차 허용).

조정 규칙 — `LADDER_TARGET.relic`(3단계 이후)만 움직인다. 한 번에 goal ±0.005:
- 기준 2 또는 3을 **넘으면**(너무 셈) goal을 0.005 낮춘다.
- 기준 1 또는 3에 **못 미치면**(너무 약함) goal을 0.005 올린다.
- `lo`·`hi`는 goal과 같은 비율로 옮긴다(`lo = goal × 0.79`, `hi = goal × 1.29`, 소수 셋째 자리 반올림).
- 바꿀 때마다 `npx tsx scripts/gear-ladder.mts --write` → `npx vitest run src/game/gearLadder.test.ts` → `--gear relic` 재측정.
- goal이 0.055 아래로 내려가야 합격하면 "유물 > 정예"(정예 0.05)가 위태롭다 — **멈추고 사용자에게 표를 보이고 묻는다.**

2단계(11~20층, `LADDER_TARGET_TIER2.relic`)는 중층·상층 구간에 걸려 있어 21층 이후 기준을 쓸 수 없다. 기준은 하나다: `relic`의 상층(13~20) 완주율이 `elite`보다 높고 60% 이하. 넘으면 goal을 0.01 낮춘다.

- [ ] **Step 5: 과제 테스트를 쓴다**

`src/game/quest.test.ts`의 "유물 보상은 최종 층에만 걸려 있다" 바로 아래에 추가:

```ts
  it('최종 층 과제의 유물은 10단계다 — 100층에서 2단계 유물을 받으면 받는 순간 쓸모가 없다', () => {
    const relics = QUESTS
      .filter((q) => q.reward.gear != null && GEAR_DEFS[q.reward.gear].line === 'relic')
      .map((q) => GEAR_DEFS[q.reward.gear!]);
    expect(relics.length).toBe(2);
    for (const d of relics) expect(d.tier, d.id).toBe(10);
  });
```

Run: `npx vitest run src/game/quest.test.ts`
Expected: FAIL — `expected 2 to be 10`.

- [ ] **Step 6: 과제 보상을 바꾼다**

`src/game/data/quests.ts`:
- `f100_summit`의 보상: `reward: { gold: 12000, gear: 'w_towerbane_t10' as GearDefId },`
- `run_nodeath`의 보상: `reward: { gold: 12000, gear: 't_lastlight_t10' as GearDefId },`

Run: `npx vitest run src/game/quest.test.ts`
Expected: PASS. (`rollQuestGear({ gear: 'w_towerbane' })`를 직접 부르는 222행 테스트는 그대로 통과한다.)

- [ ] **Step 7: 전체 확인**

Run: `npm test` → 전부 통과. `npm run typecheck` → 에러 없음. `npm run sim` → `6층 65%/사망 1.40 · 12층 43% · 20층 67%` 그대로.

- [ ] **Step 8: 커밋**

Step 3·4의 최종 표를 커밋 메시지 본문에 적는다.

```bash
git add climb-check.mts src/game/data/gear.ts src/game/data/gearLadder.ts src/game/data/quests.ts src/game/quest.test.ts
git commit -m "tune(gear): 유물 비율을 완주율로 고름 + 100층 과제 보상은 10단계 유물

<여기에 Step 3·4의 최종 표>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 재련 판정 — `craft.ts`

**Files:**
- Modify: `src/game/data/recipes.ts`
- Modify: `src/game/craft.ts`
- Test: `src/game/craft.test.ts`

**Interfaces:**
- Consumes: `relicNext`, `GEAR_DEFS`, `tierFirstFloor`, `ladderSet` (Task 1)
- Produces:
  - `REFINE_MATERIALS: Record<GearSlot, MaterialBag>`
  - `refineCostOf(slot: GearSlot, toTier: number): { cost: MaterialBag; gold: number }`
  - `type RefineFailReason = 'not-relic' | 'max-tier' | 'locked' | 'not-enough-materials' | 'not-enough-gold'`
  - `interface RefineArgs { gear: GearInstance; have: MaterialBag; gold: number; highestFloor: number }`
  - `type RefineCheck = { ok: true; next: GearDef; cost: MaterialBag; gold: number } | { ok: false; reason: RefineFailReason; next?: GearDef; unlockFloor?: number; missing?: MaterialBag; missingGold?: number }`
  - `type RefineResult = { ok: true; gear: GearInstance; spentMaterials: MaterialBag; spentGold: number } | Extract<RefineCheck, { ok: false }>`
  - `canRefine(args: RefineArgs): RefineCheck`, `refine(args: RefineArgs): RefineResult`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/game/craft.test.ts`의 import를 고치고 파일 끝에 붙인다.

```ts
import { canCraft, craft, missingFor, spendMaterials, amountOf, canRefine, refine } from './craft';
import { RECIPES, RECIPE_BY_GEAR, REFINE_MATERIALS, refineCostOf } from './data/recipes';
import { GEAR_DEFS, GEAR_SLOTS, RELIC_FIRST_TIER, TIER_COUNT, ladderSet, tierFirstFloor } from './data/gear';
import { bonusOf, makeGear } from './gear';
import type { GearDefId, GearInstance, HeroInstId, MaterialBag } from './types';
```

```ts
/**
 * 재련(2026-10-06) — 같은 유물의 단계를 하나 올린다. 제작과 같은 원칙이다:
 * 확률이 없고, 조건이 안 되면 아무것도 바뀌지 않는다.
 */
describe('재련', () => {
  const relic = (id: string, over: Partial<GearInstance> = {}): GearInstance =>
    ({ ...makeGear(id as GearDefId, 7), ...over });
  /** 그 유물을 다음 단계로 올릴 재료를 딱 맞게 */
  const exact = (g: GearInstance) => {
    const d = GEAR_DEFS[g.defId];
    return refineCostOf(d.slot, d.tier + 1);
  };

  it('비용 데이터 — 슬롯마다 실재하는 재료만, 금은 단계가 오를수록 비싸다', () => {
    for (const slot of GEAR_SLOTS) {
      for (const id of Object.keys(REFINE_MATERIALS[slot]) as (keyof MaterialBag)[]) {
        expect(MATERIAL_DEFS[id], `${String(id)}는 없는 재료다`).toBeDefined();
      }
      for (let t = RELIC_FIRST_TIER + 2; t <= TIER_COUNT; t++) {
        expect(refineCostOf(slot, t).gold, `${slot} ${t}단계`).toBeGreaterThan(refineCostOf(slot, t - 1).gold);
      }
    }
  });

  it('성공 — defId만 다음 단계로 바뀌고 instId·강화·착용자는 그대로다', () => {
    const g = relic('w_towerbane', { enhance: 3, equippedBy: 'h#1' as HeroInstId });
    const c = exact(g);
    const r = refine({ gear: g, have: c.cost, gold: c.gold, highestFloor: tierFirstFloor(3) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gear).toEqual({ ...g, defId: 'w_towerbane_t3' });
    expect(r.spentMaterials).toEqual(c.cost);
    expect(r.spentGold).toBe(c.gold);
    // 원본을 바꾸지 않는다
    expect(g.defId).toBe('w_towerbane');
  });

  it('강화 +5 유물 — 재련 뒤 보정은 새 단계 base × 강화 배수다', () => {
    const g = relic('a_ashshroud', { enhance: 5 });
    const c = exact(g);
    const r = refine({ gear: g, have: c.cost, gold: c.gold, highestFloor: 100 });
    if (!r.ok) throw new Error(r.reason);
    const fresh = { ...makeGear('a_ashshroud_t3' as GearDefId, 1), enhance: 5 };
    expect(bonusOf(r.gear)).toEqual(bonusOf(fresh));
    expect(bonusOf(r.gear).hp!).toBeGreaterThan(bonusOf(g).hp!);
  });

  it('한 번에 한 단계 — 100층에 닿아 있어도 2단계는 3단계가 된다', () => {
    const g = relic('t_lastlight');
    const c = exact(g);
    const r = refine({ gear: g, have: { ...c.cost, [MATERIAL.essence]: 99 }, gold: RICH, highestFloor: 100 });
    if (!r.ok) throw new Error(r.reason);
    expect(GEAR_DEFS[r.gear.defId].tier).toBe(3);
  });

  it('잠금 — 다음 단계의 첫 층에 닿아야 한다. 경계 층에서 갈린다', () => {
    const g = relic('w_towerbane');
    const c = exact(g);
    const before = canRefine({ gear: g, have: c.cost, gold: c.gold, highestFloor: tierFirstFloor(3) - 1 });
    expect(before).toMatchObject({ ok: false, reason: 'locked', unlockFloor: 21 });
    expect(canRefine({ gear: g, have: c.cost, gold: c.gold, highestFloor: tierFirstFloor(3) }).ok).toBe(true);
  });

  it('잠금이 재료 부족보다 먼저다 — 못 여는 단계의 부족분을 띄우지 않는다', () => {
    const r = canRefine({ gear: relic('w_towerbane'), have: {}, gold: 0, highestFloor: 20 });
    expect(r).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('재료 부족 — 모자란 것만 돌려준다', () => {
    const g = relic('a_ashshroud');
    const c = exact(g);
    const [firstId] = Object.keys(c.cost) as (keyof MaterialBag)[];
    const have = { ...c.cost, [firstId]: c.cost[firstId]! - 1 };
    const r = canRefine({ gear: g, have, gold: RICH, highestFloor: 100 });
    expect(r).toMatchObject({ ok: false, reason: 'not-enough-materials', missing: { [firstId]: 1 } });
  });

  it('금 부족 — 재료가 차 있으면 모자란 금을 돌려준다', () => {
    const g = relic('w_towerbane');
    const c = exact(g);
    const r = canRefine({ gear: g, have: c.cost, gold: c.gold - 1, highestFloor: 100 });
    expect(r).toMatchObject({ ok: false, reason: 'not-enough-gold', missingGold: 1 });
  });

  it('유물이 아니면 재련할 수 없다 — 정예도 안 된다', () => {
    for (const id of ['w_chipped', 'w_emberfang', 'g_t5_elite_weapon']) {
      const r = canRefine({ gear: relic(id), have: {}, gold: RICH, highestFloor: 100 });
      expect(r, id).toMatchObject({ ok: false, reason: 'not-relic' });
    }
  });

  it('10단계는 더 올릴 수 없다', () => {
    const r = canRefine({ gear: relic('w_towerbane_t10'), have: {}, gold: RICH, highestFloor: 100 });
    expect(r).toMatchObject({ ok: false, reason: 'max-tier' });
  });

  it('2단계에서 10단계까지 여덟 번 재련하면 10단계 유물과 같다', () => {
    let g = relic('t_lastlight', { enhance: 2 });
    for (let i = 0; i < 8; i++) {
      const c = exact(g);
      const r = refine({ gear: g, have: c.cost, gold: c.gold, highestFloor: 100 });
      if (!r.ok) throw new Error(`${i}번째: ${r.reason}`);
      g = r.gear;
    }
    expect(g.defId).toBe('t_lastlight_t10');
    expect(g.enhance).toBe(2);
    expect(GEAR_DEFS[g.defId]).toBe(ladderSet(10, 'relic').find((d) => d.slot === 'trinket'));
  });

  it('재련·제작은 난수를 받지 않는다 — 인자가 하나뿐이다', () => {
    expect(refine.length).toBe(1);
    expect(canRefine.length).toBe(1);
    expect(craft.length).toBe(1);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/game/craft.test.ts`
Expected: FAIL — `canRefine`·`refine`·`REFINE_MATERIALS`·`refineCostOf`가 없다는 오류.

- [ ] **Step 3: 비용 데이터를 넣는다 — `src/game/data/recipes.ts` 끝에 추가**

import를 고친다:

```ts
import type { GearDefId, GearSlot, MaterialBag } from '../types';
import { MATERIAL } from './materials';
import { ladderSet } from './gear';
```

파일 끝에:

```ts
/**
 * 재련 비용 — 유물을 한 단계 올리는 데 드는 재료(슬롯별, 단계와 무관하게 같다).
 *
 * ── 기준 ──────────────────────────────────────────────
 * **한 영웅의 유물 한 벌(3종)을 한 단계 올리는 비용 ≈ 등반 한 구간(10층)에서 쌓이는 재료.**
 * 한 벌은 등반만으로 따라가고, 두 번째 영웅부터는 모험·재도전이 있어야 한다.
 * 수급 실측은 `scripts/mat-probe.mts`. 수급(드롭 확률·가중치)을 바꿨으면 다시 잴 것.
 *
 * 단계가 올라도 재료 수량이 같은 이유: 21층 이후 재료 가중치가 고정이라(`materialWeights`)
 * 구간당 수급이 같다. 수량을 키우면 깊이 갈수록 재련이 밀린다.
 */
export const REFINE_MATERIALS: Record<GearSlot, MaterialBag> = {
  weapon: bag([[MATERIAL.essence, 2], [MATERIAL.hide, 1]]),
  armor: bag([[MATERIAL.essence, 1], [MATERIAL.hide, 2], [MATERIAL.ore, 1]]),
  trinket: bag([[MATERIAL.essence, 2], [MATERIAL.hide, 1]]),
};

/**
 * 재련 비용 — 재료 + 금. 금은 **곁들이**다(제작과 같은 원칙): 올라갈 단계의 보급형 한 개 값.
 * 재료가 문지기이고 금은 문턱이 아니다.
 */
export function refineCostOf(slot: GearSlot, toTier: number): { cost: MaterialBag; gold: number } {
  const supply = ladderSet(toTier, 'supply').find((d) => d.slot === slot);
  return { cost: REFINE_MATERIALS[slot], gold: supply?.price ?? 0 };
}
```

- [ ] **Step 4: 재련 판정을 넣는다 — `src/game/craft.ts`**

import를 고친다:

```ts
import type { GearDef, GearDefId, GearInstance, MaterialBag } from './types';
import { GEAR_DEFS, relicNext, tierFirstFloor } from './data/gear';
import { RECIPE_BY_GEAR, refineCostOf, type RecipeDef } from './data/recipes';
```

`missingFor`의 시그니처만 넓힌다(본문 그대로):

```ts
export function missingFor(recipe: Pick<RecipeDef, 'cost'>, have: MaterialBag): MaterialBag {
```

파일 끝에 추가:

```ts
// ------------------------------------------------------------
// 재련 — 유물의 단계를 하나 올린다
// ------------------------------------------------------------

export type RefineFailReason =
  | 'not-relic'
  | 'max-tier'
  | 'locked'
  | 'not-enough-materials'
  | 'not-enough-gold';

export interface RefineArgs {
  gear: GearInstance;
  have: MaterialBag;
  gold: number;
  /** 도달한 최고 층 — 지금 고른 층이 아니다(제작과 같다) */
  highestFloor: number;
}

export type RefineCheck =
  | { ok: true; next: GearDef; cost: MaterialBag; gold: number }
  | {
    ok: false;
    reason: RefineFailReason;
    /** 다음 단계가 있으면 실패해도 싣는다 — 화면이 "무엇이 되는가"를 그린다 */
    next?: GearDef;
    /** locked일 때 그 단계가 열리는 층 */
    unlockFloor?: number;
    missing?: MaterialBag;
    missingGold?: number;
  };

export type RefineResult =
  | { ok: true; gear: GearInstance; spentMaterials: MaterialBag; spentGold: number }
  | Extract<RefineCheck, { ok: false }>;

/**
 * 재련할 수 있는가.
 *
 * 판정 순서: 유물인가 → 다음 단계가 있는가 → 층이 열렸는가 → 재료 → 금.
 * 잠금이 재료보다 먼저다 — 못 여는 단계의 부족분을 띄우면 모아도 못 올리는 것을 모으게 된다.
 *
 * ⚠️ 제작과 같은 이유로 **RNG를 받지 않는다**(파일 머리 주석).
 */
export function canRefine(args: RefineArgs): RefineCheck {
  const { gear, have, gold, highestFloor } = args;

  const def = GEAR_DEFS[gear.defId];
  if (!def || def.line !== 'relic') return { ok: false, reason: 'not-relic' };

  const nextId = relicNext(gear.defId);
  const next = nextId ? GEAR_DEFS[nextId] : undefined;
  if (!next) return { ok: false, reason: 'max-tier' };

  const unlockFloor = tierFirstFloor(next.tier);
  if (highestFloor < unlockFloor) return { ok: false, reason: 'locked', next, unlockFloor };

  const price = refineCostOf(next.slot, next.tier);
  const missing = missingFor(price, have);
  if (Object.keys(missing).length > 0) {
    return { ok: false, reason: 'not-enough-materials', next, missing };
  }
  if (gold < price.gold) {
    return { ok: false, reason: 'not-enough-gold', next, missingGold: price.gold - gold };
  }
  return { ok: true, next, cost: price.cost, gold: price.gold };
}

/**
 * 재련. 상태를 바꾸지 않고 **결과만 돌려준다**(`craft`와 같다).
 *
 * 바뀌는 것은 `defId` 하나다 — 같은 물건이므로 instId·강화·착용자는 그대로다.
 * 그래서 착용 중에도 재련할 수 있고, 영웅이 들고 있는 참조(instId)는 손댈 필요가 없다.
 */
export function refine(args: RefineArgs): RefineResult {
  const r = canRefine(args);
  if (!r.ok) return r;
  return {
    ok: true,
    gear: { ...args.gear, defId: r.next.id },
    spentMaterials: r.cost,
    spentGold: r.gold,
  };
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run src/game/craft.test.ts`
Expected: PASS.

`data/recipes.ts → data/gear.ts` import가 순환을 만들면(`gear.ts`가 `recipes.ts`를 import하지 않으므로 생기지 않아야 한다) `npm run typecheck`로 확인한다. Expected: 에러 없음.

- [ ] **Step 6: 깨서 확인한다**

각각 고친 뒤 `npx vitest run src/game/craft.test.ts`가 실패하는지 보고 되돌린다.
1. `refine`이 `enhance: 0`을 덮어쓰게 → "강화·착용자는 그대로" 실패.
2. `canRefine`의 잠금 비교를 `<=`로 → "경계 층" 실패.
3. 잠금 판정을 재료 판정 뒤로 옮김 → "잠금이 재료 부족보다 먼저" 실패.
4. `def.line !== 'relic'` 검사를 지움 → "유물이 아니면" 실패.
5. `refine`에 둘째 인자 `rng`를 더함 → "난수를 받지 않는다" 실패.

- [ ] **Step 7: 커밋**

```bash
git add src/game/data/recipes.ts src/game/craft.ts src/game/craft.test.ts
git commit -m "feat(craft): 재련 — 유물의 단계를 하나 올린다. 확률 없음, defId만 바뀌고 강화·착용자 유지

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 스토어 — `refineGear`

**Files:**
- Modify: `src/stores/runStore.ts`
- Create: `src/stores/refine.test.ts`

**Interfaces:**
- Consumes: `refine`, `RefineResult` (Task 3), `refineCostOf` (Task 3)
- Produces:
  - `export type RefineGearResult = RefineResult | { ok: false; reason: 'not-owned' }`
  - 스토어 액션 `refineGear: (gearId: GearInstId) => RefineGearResult`

- [ ] **Step 1: 실패하는 테스트를 쓴다 — `src/stores/refine.test.ts` 생성**

```ts
/**
 * 재련 — 스토어 연결.
 *
 * 지키려는 것:
 *   1. 성공하면 그 장비가 다음 단계가 되고 재료·금이 정확히 비용만큼 빠진다
 *   2. 실패하면 아무것도 소모되지 않는다 (제작과 같은 원칙)
 *   3. 착용 중에 재련해도 영웅의 장비 참조가 유효하다
 *   4. 잠금은 도달 최고 층으로 판정한다
 *   5. 재련한 유물은 저장·복원된다. 옛 세이브의 유물은 2단계로 살아 있다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { loadRun } from './save';
import { refineCostOf } from '../game/data/recipes';
import { FLOORS } from '../game/data/floors';
import { GEAR_DEFS, tierFirstFloor } from '../game/data/gear';
import { makeGear } from '../game/gear';
import type { GearDefId, GearInstId, GearInstance, MaterialBag } from '../game/types';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

const store = (seed = 42) => createRunStore(() => seed);
const floorIndexOf = (floorId: number) => FLOORS.findIndex((f) => f.id >= floorId);

/** 유물 하나를 창고에 넣고, 다음 단계로 올릴 재료·금·층을 맞춘다 */
function ready(s: ReturnType<typeof store>, defId = 'w_towerbane', over: Partial<GearInstance> = {}) {
  const gear: GearInstance = { ...makeGear(defId as GearDefId, 901), ...over };
  const def = GEAR_DEFS[gear.defId];
  const price = refineCostOf(def.slot, def.tier + 1);
  const extra: MaterialBag = {};
  for (const [id, n] of Object.entries(price.cost) as [keyof MaterialBag, number][]) extra[id] = n + 2;
  s.setState({
    gear: [...s.getState().gear, gear],
    materials: extra,
    wallet: { ...s.getState().wallet, gold: price.gold + 500 },
    maxFloorReached: floorIndexOf(tierFirstFloor(def.tier + 1)),
  });
  return { gear, price };
}

describe('refineGear — 성공', () => {
  it('그 장비가 다음 단계가 되고 재료·금이 비용만큼 빠진다', () => {
    const s = store();
    const { gear, price } = ready(s);
    const count = s.getState().gear.length;
    const goldBefore = s.getState().wallet.gold;

    const r = s.getState().refineGear(gear.instId);
    expect(r.ok).toBe(true);

    const st = s.getState();
    // 새 장비가 생기지 않는다 — 같은 물건이 바뀐다
    expect(st.gear.length).toBe(count);
    expect(st.gear.find((g) => g.instId === gear.instId)!.defId).toBe('w_towerbane_t3');
    expect(st.wallet.gold).toBe(goldBefore - price.gold);
    for (const id of Object.keys(price.cost) as (keyof MaterialBag)[]) {
      expect(st.materials[id]).toBe(2);
    }
  });

  it('착용 중인 유물을 재련해도 영웅이 그대로 끼고 있다', () => {
    const s = store();
    const { gear } = ready(s);
    const hero = s.getState().roster.find((h) => !h.isDead)!;
    expect(s.getState().equipGear(hero.instId, gear.instId).ok).toBe(true);

    expect(s.getState().refineGear(gear.instId).ok).toBe(true);

    const st = s.getState();
    const after = st.gear.find((g) => g.instId === gear.instId)!;
    expect(after.equippedBy).toBe(hero.instId);
    expect(st.roster.find((h) => h.instId === hero.instId)!.gear?.weapon).toBe(gear.instId);
    expect(GEAR_DEFS[after.defId].tier).toBe(3);
  });

  it('강화 수치가 유지된다', () => {
    const s = store();
    const { gear } = ready(s, 'a_ashshroud', { enhance: 4 });
    s.getState().refineGear(gear.instId);
    expect(s.getState().gear.find((g) => g.instId === gear.instId)!.enhance).toBe(4);
  });

  it('두 번 누르면 한 단계씩 — 재료가 남아 있어도 층이 안 열렸으면 두 번째는 잠금이다', () => {
    const s = store();
    const { gear } = ready(s);
    expect(s.getState().refineGear(gear.instId).ok).toBe(true);
    const second = s.getState().refineGear(gear.instId);
    expect(second).toMatchObject({ ok: false, reason: 'locked', unlockFloor: 31 });
    expect(s.getState().gear.find((g) => g.instId === gear.instId)!.defId).toBe('w_towerbane_t3');
  });
});

describe('refineGear — 실패하면 아무것도 소모되지 않는다', () => {
  const snapshot = (s: ReturnType<typeof store>) => JSON.stringify({
    gear: s.getState().gear, materials: s.getState().materials, wallet: s.getState().wallet,
  });

  it('재료 부족', () => {
    const s = store();
    const { gear } = ready(s);
    s.setState({ materials: {} });
    const before = snapshot(s);
    expect(s.getState().refineGear(gear.instId)).toMatchObject({ ok: false, reason: 'not-enough-materials' });
    expect(snapshot(s)).toBe(before);
  });

  it('재료는 충분한데 금만 모자라도 재료가 빠지지 않는다', () => {
    const s = store();
    const { gear } = ready(s);
    s.setState({ wallet: { ...s.getState().wallet, gold: 0 } });
    const before = snapshot(s);
    expect(s.getState().refineGear(gear.instId)).toMatchObject({ ok: false, reason: 'not-enough-gold' });
    expect(snapshot(s)).toBe(before);
  });

  it('층 미도달', () => {
    const s = store();
    const { gear } = ready(s);
    s.setState({ maxFloorReached: floorIndexOf(20) });
    const before = snapshot(s);
    expect(s.getState().refineGear(gear.instId)).toMatchObject({ ok: false, reason: 'locked' });
    expect(snapshot(s)).toBe(before);
  });

  it('없는 장비', () => {
    const s = store();
    expect(s.getState().refineGear('ghost#1' as GearInstId)).toEqual({ ok: false, reason: 'not-owned' });
  });

  it('유물이 아닌 장비', () => {
    const s = store();
    const { gear } = ready(s);
    const plain = { ...makeGear('w_chipped' as GearDefId, 902) };
    s.setState({ gear: [...s.getState().gear, plain] });
    expect(s.getState().refineGear(plain.instId)).toMatchObject({ ok: false, reason: 'not-relic' });
    expect(s.getState().gear.find((g) => g.instId === gear.instId)!.defId).toBe('w_towerbane');
  });
});

describe('refineGear — 잠금은 도달 최고 층으로 판정한다', () => {
  it('저층을 고르고 있어도 이미 연 단계는 열려 있다', () => {
    const s = store();
    const { gear } = ready(s);
    s.getState().selectFloor(0);
    expect(s.getState().floorIndex).toBe(0);
    expect(s.getState().refineGear(gear.instId).ok).toBe(true);
  });
});

describe('저장', () => {
  it('재련한 유물이 다시 켜도 그 단계로 남아 있다', () => {
    const s = store();
    const { gear } = ready(s);
    s.getState().refineGear(gear.instId);

    const saved = loadRun();
    expect(saved).not.toBeNull();
    const restored = saved!.gear.find((g) => g.instId === gear.instId)!;
    expect(restored.defId).toBe('w_towerbane_t3');
  });

  it('옛 세이브의 유물(기존 id)은 2단계 유물로 살아 있다', () => {
    const s = store();
    const { gear } = ready(s);
    // 재련 없이 저장만 — 착용이 저장을 일으킨다
    const hero = s.getState().roster.find((h) => !h.isDead)!;
    expect(s.getState().equipGear(hero.instId, gear.instId).ok).toBe(true);
    const saved = loadRun();
    const kept = saved?.gear.find((g) => g.instId === gear.instId);
    expect(kept?.defId).toBe('w_towerbane');
    expect([GEAR_DEFS[kept!.defId].tier, GEAR_DEFS[kept!.defId].line]).toEqual([2, 'relic']);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/stores/refine.test.ts`
Expected: FAIL — `refineGear is not a function`.

- [ ] **Step 3: 스토어에 액션을 넣는다 — `src/stores/runStore.ts`**

(a) `craft`를 import하는 줄에 `refine as refinePure`와 타입 `RefineResult`를 더한다(기존 `craft as craftPure`가 있는 import).

(b) 인터페이스의 `craftGear` 선언 바로 아래에:

```ts
  /**
   * 재련 — 유물의 단계를 하나 올린다. **확률이 없다.** 착용 중에도 된다.
   * 조건이 안 되면 아무것도 소모되지 않는다(`game/craft.ts`의 `refine`).
   */
  refineGear: (gearId: GearInstId) => RefineGearResult;
```

(c) `EnhanceGearResult` 타입 선언 아래에:

```ts
export type RefineGearResult = RefineResult | { ok: false; reason: 'not-owned' };
```

(d) `craftGear` 구현 바로 아래에:

```ts
    refineGear: (gearId) => {
      const { gear, materials, wallet, maxFloorReached } = get();
      const target = gear.find((g) => g.instId === gearId);
      if (!target) return { ok: false, reason: 'not-owned' };

      // 잠금은 도달한 최고 층이다 — 제작과 같다(지금 고른 층이 아니다)
      const r = refinePure({
        gear: target,
        have: materials,
        gold: wallet.gold,
        highestFloor: FLOORS[maxFloorReached].id,
      });
      if (!r.ok) return r;

      /*
        한 번의 set — 교체와 차감이 갈라지면 재료만 잃고 유물은 그대로인 상태가 남는다.
        영웅의 gear 참조는 instId라 손댈 것이 없다(같은 물건이다).
      */
      set((s) => ({
        gear: s.gear.map((g) => (g.instId === gearId ? r.gear : g)),
        materials: spendMaterials(s.materials, r.spentMaterials),
        wallet: { ...s.wallet, gold: s.wallet.gold - r.spentGold },
      }));
      saveRun(get());
      return r;
    },
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/stores/refine.test.ts`
Expected: PASS.

Run: `npm test` → 전부 통과. `npm run typecheck` → 에러 없음.

- [ ] **Step 5: 깨서 확인한다**

1. `set` 안에서 `materials` 차감 줄을 지움 → "재료·금이 비용만큼 빠진다" 실패.
2. `highestFloor: FLOORS[get().floorIndex].id`로 바꿈 → "저층을 고르고 있어도" 실패.
3. `gear: [...s.gear, r.gear]`로 바꿈(교체 대신 추가) → "새 장비가 생기지 않는다" 실패.

각각 되돌린다.

- [ ] **Step 6: /verify 후 커밋**

```bash
git add src/stores/runStore.ts src/stores/refine.test.ts
git commit -m "feat(store): refineGear — 유물 재련을 한 번의 set으로, 착용 중에도 되고 실패하면 아무것도 안 빠진다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 재료 수급을 재서 재련 비용을 확정한다

**Files:**
- Create: `scripts/mat-probe.mts`
- Modify: `src/game/data/recipes.ts` (`REFINE_MATERIALS` — 측정 결과에 따라)

**Interfaces:**
- Consumes: `rollMaterials(floorId, isBoss, rng)`(`src/game/loot.ts`), `REFINE_MATERIALS` (Task 3)
- Produces: 확정된 `REFINE_MATERIALS`

- [ ] **Step 1: 측정 스크립트를 만든다 — `scripts/mat-probe.mts`**

```ts
/**
 * 재료 수급 측정 — `npx tsx scripts/mat-probe.mts`
 *
 * 층을 **한 번씩만** 돌파했을 때 단계(10층)마다 쌓이는 재료의 평균(200시드).
 * 재련 비용(`data/recipes.ts`의 REFINE_MATERIALS)의 근거다 — 한 벌 비용을 구간 수급 옆에 찍는다.
 * 모험·재도전은 넣지 않는다(그건 "두 번째 영웅부터"의 몫이다).
 *
 * ⚠️ 실제 전리품은 회수 → 장비 → 재료 순으로 한 난수를 나눠 쓴다. 여기서는 재료만 따로 굴리므로
 * 개별 판은 실제와 다르지만 평균은 같다(재료 판정은 앞 소비와 독립이다).
 */
import { createRng } from '../src/game/rng';
import { rollMaterials } from '../src/game/loot';
import { FLOORS } from '../src/game/data/floors';
import { TIER_COUNT, tierOf, GEAR_SLOTS } from '../src/game/data/gear';
import { MATERIAL_ORDER, MATERIAL_DEFS } from '../src/game/data/materials';
import { REFINE_MATERIALS } from '../src/game/data/recipes';
import type { MaterialBag, MaterialId } from '../src/game/types';

const SEEDS = 200;
const sum: Record<number, Record<string, number>> = {};
for (let t = 1; t <= TIER_COUNT; t++) sum[t] = Object.fromEntries(MATERIAL_ORDER.map((id) => [id, 0]));

for (let seed = 1; seed <= SEEDS; seed++) {
  for (const f of FLOORS) {
    const rng = createRng((seed * 7919 + f.id * 104729) >>> 0);
    const drop = rollMaterials(f.id, !!f.isBoss, rng);
    for (const [id, n] of Object.entries(drop) as [MaterialId, number][]) sum[tierOf(f.id)][id] += n;
  }
}

const setCost: MaterialBag = {};
for (const slot of GEAR_SLOTS) {
  for (const [id, n] of Object.entries(REFINE_MATERIALS[slot]) as [MaterialId, number][]) {
    setCost[id] = (setCost[id] ?? 0) + n;
  }
}

const name = (id: MaterialId) => MATERIAL_DEFS[id].name;
console.log(`\n  단계별 재료 수급 (층당 1회 돌파, ${SEEDS}시드 평균)\n`);
console.log(`  단계 | ${MATERIAL_ORDER.map((id) => name(id).padEnd(8)).join(' | ')}`);
for (let t = 1; t <= TIER_COUNT; t++) {
  console.log(`  ${String(t).padStart(2)}   | ${MATERIAL_ORDER.map((id) => (sum[t][id] / SEEDS).toFixed(1).padEnd(10)).join(' | ')}`);
}
console.log(`\n  재련 한 벌(3종) 비용: ${MATERIAL_ORDER.map((id) => `${name(id)} ${setCost[id] ?? 0}`).join(' · ')}`);
console.log('  단계 | 재료별 비용/수급 (3단계 이후 — 재련이 열리는 구간)');
for (let t = 3; t <= TIER_COUNT; t++) {
  const cells = MATERIAL_ORDER.map((id) => {
    const supply = sum[t][id] / SEEDS;
    return `${name(id)} ${((setCost[id] ?? 0) / supply * 100).toFixed(0)}%`;
  });
  console.log(`  ${String(t).padStart(2)}   | ${cells.join(' · ')}`);
}
```

- [ ] **Step 2: 돌려서 표를 얻는다**

Run: `npx tsx scripts/mat-probe.mts`
Expected: 단계 1~10의 수급 표와, 3~10단계의 "비용/수급" 비율 표.

- [ ] **Step 3: 기준과 대조하고 필요하면 조정한다**

기준(3~10단계 평균, 재료별 `비용/수급`):
- **정수: 70~100%.** 정수가 문지기다 — 한 벌을 한 구간 수급으로 겨우 올리는 수준.
- **가죽·무쇠: 100% 이하.** 문지기가 아닌 재료가 막으면 안 된다.

조정 규칙 — `REFINE_MATERIALS`의 수량을 **정수 1개 단위로** 바꾼다:
- 정수 비율이 100%를 넘으면 무기 또는 장신구의 정수를 1 줄인다(2 → 1). 그래도 넘으면 방어구의 정수를 0으로(항목 삭제).
- 정수 비율이 70%에 못 미치면 방어구의 정수를 1 늘린다(1 → 2). 그래도 못 미치면 무기를 3으로.
- 가죽·무쇠가 100%를 넘으면 가장 많이 쓰는 슬롯에서 1 줄인다.
- 바꿀 때마다 `npx tsx scripts/mat-probe.mts`와 `npx vitest run src/game/craft.test.ts src/stores/refine.test.ts`.

최종 표를 `REFINE_MATERIALS` 주석의 "── 기준 ──" 아래에 적는다(단계 3·6·10 세 줄이면 된다).

- [ ] **Step 4: 커밋**

```bash
git add scripts/mat-probe.mts src/game/data/recipes.ts
git commit -m "tune(craft): 재련 비용을 구간 재료 수급으로 확정 + mat-probe 측정 스크립트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 화면 — 대장간 재련

**Files:**
- Modify: `src/screens/SmithScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `canRefine`, `RefineCheck` (Task 3), `refineGear`, `RefineGearResult` (Task 4), `gearTag`, `tierFirstFloor`
- Produces: `SmithScreenProps.onRefine: (gearId: GearInstId) => RefineGearResult`

프로젝트에 jsdom이 없어 화면 컴포넌트 렌더 테스트는 쓰지 않는다(HANDOFF STEP 65). 판정 로직은 Task 3·4의 테스트가 잠그고, 화면은 브라우저 실측으로 확인한다.

- [ ] **Step 1: props와 재련 핸들러를 넣는다 — `SmithScreen.tsx`**

import를 고친다:

```ts
import { canCraft, canRefine, amountOf, type CraftResult } from '../game/craft';
import type { EnhanceGearResult, RefineGearResult } from '../stores/runStore';
```

`SmithScreenProps`에 추가:

```ts
  /** 유물 재련 — 확률이 없다. 착용 중에도 된다 */
  onRefine: (gearId: GearInstId) => RefineGearResult;
```

컴포넌트 인자에 `onRefine`을 더하고, `doCraft` 아래에:

```ts
  /** 재련 판정 — 유물을 골랐을 때만. 버튼·부족분·잠금 문구가 전부 이 결과 하나에서 나온다 */
  const refineCheck = target && targetDef?.line === 'relic'
    ? canRefine({ gear: target, have: materials, gold: wallet.gold, highestFloor })
    : null;

  const doRefine = () => {
    if (!target || !targetDef) return;
    const r = onRefine(target.instId);
    if (!r.ok) {
      setNotice(
        r.reason === 'locked' ? `${r.unlockFloor}층에 닿아야 올릴 수 있습니다.`
          : r.reason === 'not-enough-gold' ? `금이 ${r.missingGold?.toLocaleString()} 모자랍니다.`
            : r.reason === 'not-enough-materials' ? '재료가 모자랍니다.'
              : r.reason === 'max-tier' ? '더는 올릴 수 없습니다.'
                : '재련할 수 없는 물건입니다.',
      );
      return;
    }
    // 확률이 없으므로 결과를 그대로 말한다(제작과 같다)
    setNotice(`${targetDef.name}이(가) ${GEAR_DEFS[r.gear.defId].tier}단계가 되었습니다.`);
  };
```

"유물(tier 0)은 보통 가장 강하므로 맨 위로 올린다" 주석을 "유물은 맨 위로 올린다 — 재련하러 오는 물건이다"로 고친다.

- [ ] **Step 2: 재련 영역을 그린다**

강화 대상 패널(`mode === 'enhance' && target && targetDef` 블록)의 닫는 `</SystemPanel>` 바로 뒤, 같은 조건 안에 재련 패널을 더한다. 조건식을 프래그먼트로 감싼다:

```tsx
      {mode === 'enhance' && target && targetDef && (
        <>
          <SystemPanel compact tone={maxed ? 'rare' : 'normal'}>
            {/* …기존 강화 패널 내용 그대로… */}
          </SystemPanel>

          {refineCheck && (
            <div style={{ marginTop: 12 }}>
              <SystemPanel compact tone={refineCheck.ok ? 'rare' : 'normal'}>
                <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.14em', marginBottom: 8 }}>
                  재련 · {gearTag(targetDef)}
                </div>
                <RefineBody
                  check={refineCheck}
                  target={target}
                  materials={materials}
                  gold={wallet.gold}
                  bonusText={bonusText}
                  onRefine={doRefine}
                />
              </SystemPanel>
            </div>
          )}
        </>
      )}
```

파일 끝(`craftError` 위)에 컴포넌트를 추가한다:

```tsx
/**
 * 재련 영역 — 유물을 골랐을 때 강화 패널 아래에 뜬다.
 *
 * 잠긴 단계도 **무엇이 되는지는 보인다**(상점의 잠금 카드와 같은 원리) — 숨기면
 * "이 유물은 여기까지"로 읽힌다. 재료 부족분은 잠겨 있을 때는 띄우지 않는다.
 */
function RefineBody({
  check, target, materials, gold, bonusText, onRefine,
}: {
  check: RefineCheck;
  target: GearInstance;
  materials: MaterialBag;
  gold: number;
  bonusText: (g: GearInstance) => string;
  onRefine: () => void;
}) {
  if (!check.ok && (check.reason === 'max-tier' || !check.next)) {
    return (
      <div style={{ fontSize: 12, color: T.gold, letterSpacing: '.2em' }}>
        더 올릴 수 없습니다
      </div>
    );
  }

  const next = check.next!;
  const after = bonusText({ ...target, defId: next.id });

  if (!check.ok && check.reason === 'locked') {
    return (
      <>
        <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.5 }}>
          {next.tier}단계 → {after}
        </div>
        <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.14em' }}>
          🔒 {check.unlockFloor}층 도달 시
        </div>
      </>
    );
  }

  const price = refineCostOf(next.slot, next.tier);
  return (
    <>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        {next.tier}단계 → {after}
      </div>
      <div style={{ display: 'grid', gap: 3, marginBottom: 10 }}>
        {(Object.entries(price.cost) as [keyof MaterialBag, number][]).map(([id, need]) => {
          const have = amountOf(materials, id);
          return (
            <div key={String(id)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: T.dim }}>{MATERIAL_DEFS[id]?.name}</span>
              <span style={{ color: have < need ? T.amber : T.text }}>{have} / {need}</span>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: T.dim }}>금</span>
          <span style={{ color: gold < price.gold ? T.amber : T.text }}>
            {gold.toLocaleString()} / {price.gold.toLocaleString()}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.dim, marginBottom: 12 }}>
        재련은 실패하지 않습니다 · 벼린 단계와 착용은 그대로입니다
      </div>
      <Button small onClick={onRefine} disabled={!check.ok}>
        {check.ok ? `재련 → ${next.tier}단계` : '재료가 모자랍니다'}
      </Button>
    </>
  );
}
```

import에 `type RefineCheck`(`../game/craft`)와 `refineCostOf`(`../game/data/recipes`)를 더한다:

```ts
import { canCraft, canRefine, amountOf, type CraftResult, type RefineCheck } from '../game/craft';
import { RECIPES, refineCostOf } from '../game/data/recipes';
```

금만 모자란 경우 버튼 문구가 "재료가 모자랍니다"가 되지 않게 바꾼다:

```tsx
        {check.ok ? `재련 → ${next.tier}단계`
          : check.reason === 'not-enough-gold' ? '금이 모자랍니다' : '재료가 모자랍니다'}
```

- [ ] **Step 3: 제작 탭에 재련 안내 한 줄**

`CraftPanel` 끝의 "제작은 실패하지 않습니다…" 문단을 바꾼다:

```tsx
      <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.8, margin: '10px 2px 18px' }}>
        제작은 실패하지 않습니다. 재료와 금이 차면 반드시 완성됩니다.
        <br />
        만든 유물은 '벼리기'에서 재련해 단계를 올립니다.
      </div>
```

- [ ] **Step 4: App에 연결한다 — `src/App.tsx`**

`const craftGear = useRunStore((s) => s.craftGear);` 아래에:

```ts
  const refineGear = useRunStore((s) => s.refineGear);
```

`<SmithScreen … onCraft={craftGear}` 아래에 `onRefine={refineGear}`를 더한다.

- [ ] **Step 5: 타입·테스트 확인**

Run: `npm run typecheck` → 에러 없음. `npm test` → 전부 통과.

- [ ] **Step 6: 브라우저 375×667 실측**

`npm run dev`를 띄우고 브라우저를 375×667로 맞춘다. 대장간 → 벼리기 → 유물을 고른다. 그 브라우저 프로필에 유물이 없으면 페이지에서 스토어 모듈을 불러 상태를 맞춘다(Vite 개발 서버는 소스 모듈을 그대로 준다 — 측정용 프로필에서만, 사용자의 폰 세이브와 무관하다):

```js
const { useRunStore } = await import('/src/stores/runStore.ts');
const s = useRunStore.getState();
useRunStore.setState({
  gear: [...s.gear, { instId: 'probe#1', defId: 'w_towerbane', enhance: 2, equippedBy: null }],
  materials: { mt_ore: 9, mt_hide: 9, mt_essence: 9 },
  wallet: { ...s.wallet, gold: 99999 },
  maxFloorReached: 20, // 21층
});
```

상태별로 `materials`·`maxFloorReached`·`defId`(`w_towerbane_t10`)만 바꿔 가며 본다.

아래 네 상태를 `getBoundingClientRect()`와 `document.documentElement.scrollWidth`로 잰다:
1. 재련 가능 — 버튼 "재련 → 3단계", 재료 줄 색 정상.
2. 재료 부족 — 모자란 줄이 `T.amber`, 버튼 비활성.
3. 잠금 — "🔒 31층 도달 시", 재료 줄이 안 보인다.
4. 10단계 — "더 올릴 수 없습니다".

합격: 네 상태 모두 `scrollWidth ≤ 375`(가로 스크롤 없음), 재련 버튼 높이 ≥ 44px, 재련 뒤 목록의 꼬리표가 "3단계 · 유물"로 바뀌고 착용자 문구("○○ 착용 중")가 남는다.

- [ ] **Step 7: /verify 후 커밋**

```bash
git add src/screens/SmithScreen.tsx src/App.tsx
git commit -m "feat(ui): 대장간 재련 — 유물 카드에 다음 단계 수치·재료·잠금, 제작 탭에 재련 안내

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 문서

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/gdd-v3.md`
- Modify: `docs/superpowers/specs/2026-10-02-gear-ladder-design.md`
- Modify: `src/game/data/recipes.ts` (주석만)

- [ ] **Step 1: `CLAUDE.md`**

- "장비 사다리(STEP 66)" 규칙 단락의 "유물은 제작·최종 과제만." 뒤에 추가:
  "**유물도 사다리에 있다(STEP 67)** — 2~10단계, 같은 단계 정예보다 한 칸 위(`ladderTarget(tier, 'relic')`). 제작이 만드는 것은 2단계이고, 대장간에서 **재련**(`craft.ts`의 `refine` — 확률 없음, `defId`만 바뀌고 강화·착용자 유지)으로 한 단계씩 올린다. 다음 단계는 그 단계 첫 층 도달 시 열린다. 2단계 id는 옛 유물 id 그대로(`w_towerbane`), 3~10단계는 `_t{단계}`. 재련 비용은 `data/recipes.ts`의 `REFINE_MATERIALS`(구간 재료 수급으로 고름 — `scripts/mat-probe.mts`)."
- 명령어 절에 두 줄 추가:
  `npx tsx climb-check.mts --gear relic|relic1  # 층 단계의 유물을 입고 연속 등반(전원 / 1명만)`
  `npx tsx scripts/mat-probe.mts              # 단계별 재료 수급 — 재련 비용의 근거`
- 디렉토리 절: `craft.ts` 줄을 "제작·재련 — 재료→유물, 유물 단계 올리기. **확률이 없다**(RNG를 받지 않는다)"로, `gearLadder.ts`(data) 줄에 "유물 2~10단계 포함"을 더한다.
- `npm test` 줄의 테스트 수를 실제 값으로 고친다.

- [ ] **Step 2: `docs/HANDOFF.md`**

`### STEP 66` 절 끝(`---` 앞)에 새 절을 쓴다. 제목 `### STEP 67 — 유물 재련: 유물을 사다리에 넣다 (2026-10-06)`. 담을 것:
- 발단: "유물은 따라잡힌다"는 전제가 10/2 비율 재조정 뒤 뒤집혔다 — 스펙의 실측 표(무기 30 vs 56, 완주율 99/87/94/79%).
- 사용자 결정 넷(방향 1 · 같은 유물 재련 · 정예보다 한 칸 위 · 한 단계씩/기존 유물 2단계).
- 만든 것 표(파일 · 내용): `data/gear.ts`, `scripts/gear-ladder.mts`, `craft.ts`, `data/recipes.ts`, `runStore.ts`, `SmithScreen`, `climb-check.mts`, `scripts/mat-probe.mts`.
- 측정: Task 2의 최종 완주율 표, Task 5의 수급·비용 표, 확정된 `ladderTarget` 유물 값.
- 기존 세이브 영향: 유물 3종의 새 2단계 수치(생성값 그대로 적는다).
- 알아둘 것: 생성 파일 재생성 명령, "깨서 확인"한 목록, 화면 렌더 테스트 없음, 폰 확인 여부.
- 결과: 테스트 수, typecheck, 브라우저 실측 값.

같은 파일의 STEP 66 "알아둘 것"에 있는 "유물은 고정 수치라 높은 단계에서 따라잡힌다 — 강화·재련은 C(대장간)에서." 줄 끝에 "→ **틀렸다(STEP 67)**: 비율을 낮춘 뒤로는 유물이 100층 내내 가장 셌다."를 붙인다.

1차 셀프 테스트 표의 4번 줄 끝 "A는 STEP 66, B·C·D는 남았다."를 "A는 STEP 66, C의 유물 재련은 STEP 67, B·D는 남았다."로 고친다.

- [ ] **Step 3: `docs/gdd-v3.md`**

§4.6(장비)에서 유물을 설명하는 문단을 찾아(`grep -n "유물" docs/gdd-v3.md`) "유물은 2~10단계가 있고 대장간에서 재련한다. 제작은 2단계를 만든다. 재련은 재료 + 금, 확률 없음, 한 번에 한 단계, 다음 단계는 그 단계 첫 층에서 열린다. 같은 단계 정예보다 한 칸 위다." 한 문단을 더한다.

- [ ] **Step 4: 장비 사다리 스펙 정정**

`docs/superpowers/specs/2026-10-02-gear-ladder-design.md` 36행 "유물 재설계 — 유물은 고정 수치라 단계가 오르면 따라잡힌다…" 줄 끝에 추가:
" **정정(2026-10-06):** 비율을 3~5%로 낮춘 뒤로는 반대였다(유물이 10단계 정예의 두 배). `2026-10-06-relic-refine-design.md` 참조."

- [ ] **Step 5: `recipes.ts` 주석**

파일 머리의 "── 왜 유물만 만드는가 ──" 절 끝에 한 줄: "만들어지는 것은 **2단계 유물**이다. 그 뒤는 재련(`REFINE_MATERIALS`)으로 올린다."
`RECIPES` 항목 위의 수치 주석 세 줄(`// 탑을 베는 것 — atk 56 · crit 7% · spd 4` 등)은 낡았으므로 수치를 빼고 이름만 남긴다(`// 탑을 베는 것`). "장신구 … (hp 150 · spd 12 · crit 8%)가 셋 중 가장 넓게 붙는다"도 "장신구가 셋 중 가장 넓게 붙는다(체력·속도·치명)"로.

- [ ] **Step 6: 커밋**

```bash
git add CLAUDE.md docs/HANDOFF.md docs/gdd-v3.md docs/superpowers/specs/2026-10-02-gear-ladder-design.md src/game/data/recipes.ts
git commit -m "docs: 유물 재련 STEP 67 — HANDOFF·CLAUDE.md 규칙·gdd-v3 §4.6, 측정값과 기존 세이브 영향

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
