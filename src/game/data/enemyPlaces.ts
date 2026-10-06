/**
 * 적이 머무는 곳 — 지도에 "좁은 통로에 슬라임, 관문에 골렘"을 그리기 위한 표(STEP 71).
 *
 * 폰 피드백(2026-10-06): "맵이 다 비슷해 전술에 의미가 없다 … 몹마다 다양성을 줘야 한다."
 * 지형을 층 배경에서만 뽑으면 어느 층이나 같은 그림이 된다. 적마다 어울리는 땅을 두어
 * **적 구성이 지도의 생김새를 정하게** 한다.
 *
 * ⚠️ **표시 전용이다.** 전투는 이 표를 모른다 — 전투는 층당 한 판 그대로이고(사용자 결정 2026-09-29),
 *    지도에서 전투에 닿는 것은 여전히 고른 길의 접점 지형 하나(책략 성공률)뿐이다.
 * `short`는 지도 이름표용 짧은 이름이다. 정식 이름은 `enemies.ts`.
 * 적을 추가하면 여기에도 추가한다(`floormap.test.ts`가 빠진 적을 잡는다).
 */
import type { TerrainTag } from './terrain';

export interface EnemyPlace {
  short: string;
  /** 어울리는 땅 — 앞의 것일수록 먼저 고른다 */
  habitat: TerrainTag[];
}

export const ENEMY_PLACE: Record<string, EnemyPlace> = {
  e_slime: { short: '슬라임', habitat: ['narrow', 'river'] },         // 축축하고 좁은 곳에 고인다
  e_hound: { short: '사냥개', habitat: ['open', 'forest'] },          // 달릴 곳이 있어야 한다
  e_golem: { short: '골렘', habitat: ['fort', 'narrow'] },            // 길목을 막고 선다
  e_wisp: { short: '불씨', habitat: ['forest', 'river'] },            // 숲과 물가를 떠돈다
  e_warden: { short: '파수병', habitat: ['fort'] },
  e_revenant: { short: '망령', habitat: ['narrow', 'open'] },
  e_tyrant: { short: '폭군', habitat: ['open'] },                     // 폭풍은 트인 곳에서 분다
  e_seraph: { short: '세라프', habitat: ['open', 'fort'] },
  e_colossus: { short: '거상', habitat: ['fort'] },
  e_wraith: { short: '원귀', habitat: ['river', 'narrow'] },          // 심연 — 깊은 물과 틈
  e_sovereign: { short: '군주', habitat: ['fort'] },
  e_hexweaver: { short: '주술사', habitat: ['forest'] },
  e_grovekeeper: { short: '숲지기', habitat: ['forest'] },
  e_plaguebearer: { short: '역병꾼', habitat: ['river'] },
  e_direwolf: { short: '큰늑대', habitat: ['forest', 'open'] },
  e_stonewarden: { short: '감시자', habitat: ['narrow', 'fort'] },
  e_hierophant: { short: '교주', habitat: ['fort'] },
  e_blightlord: { short: '창궐주', habitat: ['river'] },
  e_warcaller: { short: '전령', habitat: ['open'] },
  e_ashking: { short: '재의 왕', habitat: ['fort'] },
};

/** 표에 없는 적(새로 추가됐거나 세이브의 유령 id)도 지도가 깨지지 않게 한다 */
export function enemyPlaceOf(defId: string): EnemyPlace {
  return ENEMY_PLACE[defId] ?? { short: '적', habitat: [] };
}
