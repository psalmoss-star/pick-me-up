/**
 * 제작 재료 — 탑 드롭과 모험 보상으로 모으는 자원.
 *
 * 밸런스 수치는 전부 여기 있고 코드에는 없다 (CLAUDE.md 아키텍처 규칙).
 *
 * ── 왜 금이 아니라 새 자원인가 ────────────────────────────
 * 실측(2026-08-23): 30전투 후 금 32,986 / 승급석 43.
 * **금은 후반에 남아돈다.** 그런데 GDD §4.2가 금 수급 인상을 금지한다
 * ("금이 급증하면 상점·강화가 등반보다 강해진다"). 즉 금으로 보상을 주면
 * 초반엔 부족해서 못 쓰고 후반엔 남아돌아 의미가 없다.
 *
 * 재료는 **금으로 살 수 없다.** 살 수 있으면 후반의 남는 금이 제작을 통째로
 * 건너뛰어, 모으는 과정 자체가 사라진다.
 *
 * ── 왜 종류를 나누는가 ──────────────────────────────────
 * 단일 카운트로 두면 목표가 "숫자 채우기" 하나뿐이라 대장간이 다시 밋밋해진다.
 * 종류가 있으면 "이 무기를 만들려면 무엇이 부족한가"가 곧 다음 등반의 이유가 된다.
 *
 * ⚠️ **종류를 함부로 늘리지 말 것.** 제작 레시피가 정해지기 전에 재료만 늘리면
 * 쓸 데 없는 자원이 쌓이고, 나중에 보상표를 두 번 짜게 된다. 3종으로 시작한다.
 */
import type { MaterialId, MaterialTier } from '../types';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  /** 화면에 그대로 나가는 한 줄 설명 */
  desc: string;
  tier: MaterialTier;
}

const m = (s: string) => s as MaterialId;

export const MATERIAL = {
  ore: m('mt_ore'),
  hide: m('mt_hide'),
  essence: m('mt_essence'),
} as const;

/**
 * 재료 3종.
 *
 * 등급(tier)은 **드롭되는 층 깊이**를 가른다 — `dropWeights`와 같은 원리다.
 * 저층에서 정수가 쏟아지면 이후 등반이 무의미해진다.
 */
export const MATERIAL_DEFS: Record<MaterialId, MaterialDef> = Object.fromEntries(
  ([
    {
      id: MATERIAL.ore,
      name: '무쇠 조각',
      desc: '탑의 잔해에서 긁어낸 쇳조각. 무엇을 만들든 바탕이 된다.',
      tier: 'common',
    },
    {
      id: MATERIAL.hide,
      name: '질긴 가죽',
      desc: '탑에 사는 것들의 껍질. 두드리면 갑옷이 된다.',
      tier: 'fine',
    },
    {
      id: MATERIAL.essence,
      name: '탑의 정수',
      desc: '층이 무너질 때 남는 빛. 사람의 손으로는 만들 수 없다.',
      tier: 'rare',
    },
  ] satisfies MaterialDef[]).map((d) => [d.id, d]),
) as Record<MaterialId, MaterialDef>;

/** 정렬·표시 순서 — 등급 순 */
export const MATERIAL_ORDER: readonly MaterialId[] = [
  MATERIAL.ore, MATERIAL.hide, MATERIAL.essence,
];

/**
 * 층 돌파 시 재료가 떨어질 확률.
 *
 * ⚠️ 장비 드롭(0.35)보다 **높게** 잡는다. 재료는 여러 개를 모아야 의미가 생기는
 * 자원이라 장비처럼 가끔 나오면 영영 안 쌓인다. 다만 1을 주지 않는 이유는
 * "이번 층은 빈손"이 있어야 나온 층이 반가워지기 때문이다.
 */
export const MATERIAL_DROP_CHANCE = 0.6;

/** 보스 층은 확정 — 대가를 크게 치르는 층이므로 (장비 드롭과 같은 원칙) */
export const MATERIAL_BOSS_DROP_CHANCE = 1;

/** 한 번에 떨어지는 개수 범위 [최소, 최대] */
export const MATERIAL_DROP_AMOUNT: readonly [number, number] = [1, 3];

/**
 * 층 깊이에 따른 재료 등급 가중치.
 *
 * `data/gear.ts`의 `dropWeights`와 같은 구조·같은 이유다 —
 * 저층에서 상위 재료가 나오면 이후 등반이 무의미해진다.
 */
export function materialWeights(floorId: number): Record<MaterialTier, number> {
  if (floorId <= 6) return { common: 80, fine: 20, rare: 0 };
  if (floorId <= 12) return { common: 50, fine: 40, rare: 10 };
  if (floorId <= 20) return { common: 30, fine: 45, rare: 25 };
  return { common: 20, fine: 40, rare: 40 };
}

/** 해당 등급의 재료. 등급당 하나씩이므로 단일 반환이다 */
export function materialOfTier(tier: MaterialTier): MaterialDef | undefined {
  return MATERIAL_ORDER.map((id) => MATERIAL_DEFS[id]).find((d) => d.tier === tier);
}
