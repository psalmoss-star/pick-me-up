/**
 * 도메인 ID → 아트 종류 매핑.
 *
 * 게임 데이터(src/game/data)는 아트를 모른다 — 순수 로직이므로 그래야 한다.
 * 그 연결을 UI 쪽에서 담당하는 것이 이 파일이다.
 */
import type { HeroArtKind } from './art/HeroArt';
import type { EnemyArtKind } from './art/EnemyArt';
import type { GuardArtKind } from './art/GuardArt';

/**
 * ⚠️ 새 영웅을 추가하면 여기도 반드시 채울 것.
 * 빠뜨리면 `?? 'sword'` 폴백에 걸려 **조용히 전부 검사가 된다** —
 * 유형을 늘린 의미가 사라지는데 에러는 안 난다(§5-16과 같은 종류의 함정).
 *
 * 실루엣은 5종뿐이라 겹칠 수밖에 없다. 겹칠 때는 **역할이 다른 쪽**으로 묶는다
 * (같은 지팡이라도 힐러와 딜러는 카드 색·별이 달라 구분된다).
 * 실루엣 자체를 늘리는 것은 HeroArt.tsx 작업이라 별건이다.
 */
export const HERO_ART: Record<string, HeroArtKind> = {
  h_ashen: 'sword',
  h_bulwark: 'shield',
  h_tide: 'staff',
  h_gale: 'dagger',
  h_bolt: 'greatsword',
  // 확장분
  h_thorn: 'dagger',      // 밀렵꾼 — 단검
  h_cinder: 'staff',      // 술사 — 지팡이
  h_hush: 'dagger',       // 숨을 지우는 자 — 단검
  h_ward: 'staff',        // 결계 — 지팡이
  h_banner: 'greatsword', // 대열을 세운 자 — 대검
  h_leech: 'staff',       // 술사 계열
  h_anvil: 'shield',      // 벽 — 방패
};

const ENEMY_ART: Record<string, EnemyArtKind> = {
  e_slime: 'blob',
  e_hound: 'beast',
  e_golem: 'golem',
  e_wisp: 'wisp',
  e_warden: 'warden',
  e_revenant: 'revenant',
  e_tyrant: 'tyrant',
  e_seraph: 'seraph',
  e_colossus: 'colossus',
  e_wraith: 'wraith',
  e_sovereign: 'sovereign',
  e_hexweaver: 'hexweaver',
  e_grovekeeper: 'grovekeeper',
  e_plaguebearer: 'plaguebearer',
  e_direwolf: 'direwolf',
  e_stonewarden: 'stonewarden',
  e_hierophant: 'hierophant',
  e_blightlord: 'blightlord',
  e_warcaller: 'warcaller',
  e_ashking: 'ashking',
};

const GUARD_ART: Record<string, GuardArtKind> = {
  gate: 'gate',
  princess: 'princess',
  depot: 'depot',
  envoy: 'envoy',
};

export const heroArtOf = (defId: string): HeroArtKind => HERO_ART[defId] ?? 'sword';
export const enemyArtOf = (defId: string): EnemyArtKind => ENEMY_ART[defId] ?? 'blob';
/**
 * 호출부마다 넘기는 키가 다르다:
 *   BriefScreen  → GuardDef.id            ('princess')
 *   BattleUnit   → Combatant.sourceId     ('npc:princess')  ← battle.ts가 kind를 접두사로 붙인다
 * 접두사를 떼고 조회한다. 이걸 안 하면 전투 중 황녀가 성문으로 그려진다(실제로 그랬다).
 */
export const guardArtOf = (guardId: string): GuardArtKind => {
  const id = guardId.includes(':') ? guardId.slice(guardId.indexOf(':') + 1) : guardId;
  return GUARD_ART[id] ?? 'gate';
};
