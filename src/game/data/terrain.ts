/**
 * 지형 태그 — 층 맵 노드의 성격. 기획서 2단계(2026-09-29).
 *
 * 사용자 결정: 전투는 층당 한 판 그대로다. 맵은 **경로와 지형**만 정한다.
 * 고른 경로의 **접점**(적과 부딪히는 노드) 지형이 책략 **성공률에만** ±를 준다.
 * 새 능력치·새 전투 규칙은 없다.
 *
 * 태그와 책략의 궁합은 연의의 장면에서 온다 — 박망파의 골짜기, 번성의 강, 서성의 성문.
 */
import type { FloorScene } from './floors';
import type { StratagemId } from './stratagems';

export type TerrainTag =
  | 'narrow'   // 좁은 통로·골짜기
  | 'river'    // 강가·물길
  | 'forest'   // 숲·갈대밭
  | 'open'     // 개활지
  | 'fort';    // 성문·관문

export interface TerrainDef {
  tag: TerrainTag;
  name: string;
  /** 이 지형에서 잘 통하는 책략 */
  good: StratagemId[];
  /** 이 지형에서 잘 안 통하는 책략 */
  bad: StratagemId[];
}

export const TERRAIN: Record<TerrainTag, TerrainDef> = {
  // 박망파 — 좁은 골짜기로 끌어들여 태운다. 복병을 숨기기도 좋다
  narrow: { tag: 'narrow', name: '좁은 통로', good: ['lureFire', 'ambush'], bad: ['nightRaid'] },
  // 번성의 수몰·적벽의 강 — 물이 있어야 물을 쓰고, 강 위의 배를 태운다. 젖은 땅엔 불이 안 번진다
  river: { tag: 'river', name: '강가', good: ['flood', 'redCliffs'], bad: ['lureFire'] },
  // 정군산 — 숲에 숨어 기다린다. 물길을 낼 곳이 없다
  forest: { tag: 'forest', name: '숲', good: ['ambush', 'nightRaid'], bad: ['flood'] },
  // 트인 곳 — 숨을 곳이 없어 매복이 보이고, 대신 밤을 틈타 치고 빠지기 좋다
  open: { tag: 'open', name: '개활지', good: ['nightRaid'], bad: ['ambush', 'lureFire'] },
  // 서성 — 성문을 열어 두는 계책은 성이 있어야 성립한다
  fort: { tag: 'fort', name: '관문', good: ['emptyFort'], bad: ['flood', 'ambush'] },
};

export const TERRAIN_TAGS: TerrainTag[] = ['narrow', 'river', 'forest', 'open', 'fort'];

/** 지형 보정 (사용자 결정: 성공률 ±만) */
export const TERRAIN_TUNING = {
  good: 0.15,
  bad: -0.1,
} as const;

/**
 * 층 배경(scene)별 지형 가중치 — 폐허 층에 강만 나오면 맵과 배경이 어긋난다.
 * 합이 1일 필요는 없다(비율로 쓴다).
 */
export const TERRAIN_WEIGHT_BY_SCENE: Record<FloorScene, Record<TerrainTag, number>> = {
  ruins: { narrow: 3, river: 1, forest: 2, open: 2, fort: 2 },
  field: { narrow: 1, river: 3, forest: 2, open: 3, fort: 1 },
  outpost: { narrow: 2, river: 1, forest: 2, open: 2, fort: 3 },
  gate: { narrow: 2, river: 1, forest: 1, open: 2, fort: 4 },
  corridor: { narrow: 4, river: 1, forest: 1, open: 1, fort: 2 },
  chasm: { narrow: 3, river: 3, forest: 1, open: 1, fort: 1 },
};
