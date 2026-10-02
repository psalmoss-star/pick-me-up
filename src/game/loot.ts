/**
 * 전리품 판정 — 재료 드롭.
 *
 * 순수 함수다. 무작위는 **주입된 RNG만** 쓴다 (CLAUDE.md 아키텍처 규칙).
 * 장비 드롭은 아직 `runStore.finish()` 안에 있다 — 그쪽을 옮기지 않은 이유는
 * `gearSeq` 발번이 스토어 상태에 묶여 있어서다. 재료는 개체가 없어 순수하게 나온다.
 */
import {
  MATERIAL_BOSS_DROP_CHANCE, MATERIAL_DROP_AMOUNT, MATERIAL_DROP_CHANCE,
  materialOfTier, materialWeights,
} from './data/materials';
import { GEAR_TUNING, ladderSet, tierOf } from './data/gear';
import { rollRecovery } from './gear';
import { STREAM, substream } from './rng';
import type {
  GearDefId, GearInstId, GearSlot, MaterialBag, MaterialTier, RNG,
} from './types';

/**
 * 전리품 RNG 유도식 — **여기가 단일 출처다.**
 *
 * ⚠️ 결과 화면은 `finish()`보다 **먼저** 뜬다. 그래서 화면이 획득물을 보여주려면
 * 스토어에서 읽는 게 아니라 **같은 식으로 다시 계산**해야 한다
 * (`game/quest.ts`의 `questRng`가 같은 이유로 밖으로 빠져 있다).
 * 식이 두 곳에 생기면 "보인 것과 들어온 것이 다르다"가 된다.
 *
 * 전투 시드만 쓰면 시드 고정 환경·같은 층 재도전에서 같은 난수열이 나오고,
 * 개입 재시뮬레이션마다 새로 뽑으면 "좋은 템 나올 때까지 개입 돌리기"가 된다.
 * → 시드 + 층 + 전투 횟수를 섞는다. 개입은 이 셋을 바꾸지 않는다.
 */
export function lootRngFor(seed: number, floorId: number, battleCount: number): RNG {
  return substream(
    (seed ^ Math.imul(floorId, 0x85ebca6b) ^ Math.imul(battleCount + 1, 0xc2b2ae35)) >>> 0,
    STREAM.LOOT,
  );
}

/** 가중치 표에서 하나 고른다. 총합이 0이면 undefined */
function pickTier(w: Record<MaterialTier, number>, rng: RNG): MaterialTier | undefined {
  const entries = (Object.entries(w) as [MaterialTier, number][]).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return undefined;

  let roll = rng() * total;
  for (const [tier, v] of entries) {
    roll -= v;
    if (roll < 0) return tier;
  }
  return entries[entries.length - 1][0];
}

/**
 * 층 돌파 재료 드롭.
 *
 * ⚠️ **RNG 소비 횟수가 결과에 따라 달라진다**(안 나오면 1회, 나오면 3회).
 * 이 함수를 다른 추첨 **앞에** 끼워 넣으면 그 뒤의 모든 결과가 바뀐다.
 * 호출 순서를 옮기지 말 것 — `finish()`에서 장비 드롭 다음에 온다.
 *
 * @returns 종류별 수량. 빈손이면 빈 객체
 */
export function rollMaterials(floorId: number, isBoss: boolean, rng: RNG): MaterialBag {
  const chance = isBoss ? MATERIAL_BOSS_DROP_CHANCE : MATERIAL_DROP_CHANCE;
  if (rng() >= chance) return {};

  const tier = pickTier(materialWeights(floorId), rng);
  if (!tier) return {};
  const def = materialOfTier(tier);
  if (!def) return {};

  const [lo, hi] = MATERIAL_DROP_AMOUNT;
  const amount = lo + Math.floor(rng() * (hi - lo + 1));
  return { [def.id]: amount };
}

export interface FloorLootArgs {
  seed: number;
  floorId: number;
  isBoss: boolean;
  battleCount: number;
  /** 사망자들이 착용 중이던 장비(슬롯 맵). **순서가 판정에 영향을 준다** */
  casualties: readonly (Partial<Record<GearSlot, GearInstId>> | undefined)[];
  /**
   * 층을 돌파했는가.
   *
   * ⚠️ **회수는 패배해도 일어나고, 드롭·재료는 승리했을 때만이다.**
   * 이 분기를 빠뜨리면 패배 시 있지도 않은 드롭을 뽑느라 RNG를 더 소비해
   * 다음 판정이 어긋난다.
   */
  cleared: boolean;
}

export interface FloorLoot {
  /** 사망자에게서 회수한 장비 */
  recovered: GearInstId[];
  /** 소실된 장비 */
  lost: GearInstId[];
  /** 층 드롭 장비 종류. 없으면 null */
  gearDefId: GearDefId | null;
  materials: MaterialBag;
}

/**
 * 층 돌파 전리품 **전체**를 한 번에 판정한다.
 *
 * ⚠️ **이 함수가 소비 순서의 단일 출처다.** `lootRng`는 순서대로 소비되는 스트림이라
 * 회수 → 장비 → 재료 중 하나라도 순서가 바뀌면 **그 뒤가 전부 달라진다**
 * (실측: 재료를 앞에 두면 200시드 중 120개에서 장비 드롭이 바뀌었다).
 *
 * 예전에는 이 순서가 `runStore.finish()` 안에만 있었다. 결과 화면이 획득물을
 * 미리 보여주려면 같은 순서를 **다시 적어야** 했고, 그러면 두 곳이 조용히 갈라진다
 * (과제가 `questRng`를 밖으로 뺀 것과 같은 이유). 그래서 여기로 모았다.
 *
 * 장비 instId 발번(`gearSeq`)은 스토어 상태라 여기서 하지 않는다 — 종류만 돌려준다.
 */
export function rollFloorLoot(args: FloorLootArgs): FloorLoot {
  const { seed, floorId, isBoss, battleCount, casualties, cleared } = args;
  const rng = lootRngFor(seed, floorId, battleCount);

  // ① 사망자 장비 회수 — 슬롯마다 독립 판정
  const recovered: GearInstId[] = [];
  const lost: GearInstId[] = [];
  for (const gear of casualties) {
    const r = rollRecovery(gear, rng, GEAR_TUNING.recoveryRate);
    recovered.push(...r.recovered);
    lost.push(...r.lost);
  }

  // 패배하면 여기서 끝 — 드롭도 재료도 없다. RNG를 더 소비하지 않는다
  if (!cleared) return { recovered, lost, gearDefId: null, materials: {} };

  // ② 층 드롭 장비 — 그 층 단계의 보급형, 보스 층이면 정예(장비 사다리, 2026-10-02)
  let gearDefId: GearDefId | null = null;
  const gearChance = isBoss ? GEAR_TUNING.bossDropChance : GEAR_TUNING.dropChance;
  if (rng() < gearChance) {
    /*
      ⚠️ 옛 "등급 추첨" 자리 — 값은 쓰지 않지만 **소비는 지킨다.**
      이 한 번을 빼면 뒤의 재료 판정이 전 층에서 한 칸씩 밀린다(`loot.test.ts` 재료 지문이 잠근다).
    */
    rng();
    const pool = ladderSet(tierOf(floorId), isBoss ? 'elite' : 'supply');
    if (pool.length > 0) {
      gearDefId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id;
    }
  }

  // ③ 재료 — **항상 마지막이다.** 앞에 끼우면 위 둘이 전부 달라진다
  const materials = rollMaterials(floorId, isBoss, rng);

  return { recovered, lost, gearDefId, materials };
}

/** 재료 주머니 두 개를 합친다. 원본을 바꾸지 않는다 */
export function mergeMaterials(a: MaterialBag, b: MaterialBag): MaterialBag {
  const out: MaterialBag = { ...a };
  for (const [id, n] of Object.entries(b) as [keyof MaterialBag, number][]) {
    if (!n) continue;
    out[id] = (out[id] ?? 0) + n;
  }
  return out;
}

/** 재료 주머니가 비었는가 — 표시 여부 판정에 쓴다 */
export function isEmptyBag(bag: MaterialBag): boolean {
  return Object.values(bag).every((n) => !n);
}
