import { ELEMENT_TINT } from '../tokens';

export type HeroArtKind = 'sword' | 'shield' | 'staff' | 'dagger' | 'greatsword';

/**
 * 영웅 실루엣. 실제 일러스트가 들어오기 전까지의 자리.
 *
 * 5종은 몸통 자체가 다르다 — 소품만 바꾸면 색만 다른 같은 인형이 된다.
 * (등급 표현에서 이미 겪은 함정과 같은 종류다. CLAUDE.md 참조)
 * 실루엣은 sample.ts의 역할·수치에서 끌어왔다:
 *   shield=거인족 탱커(vit 30) / dagger=순찰병(agi 22) / staff=사제(int 21) 등
 *
 * viewBox와 접지선(cy=74)은 5종 공통 — 전투 화면에서 유닛이 같은 바닥에 서야 한다.
 */

type Build = {
  /** 몸통 윤곽 */
  body: string;
  /** 머리 중심/반지름 — 체격에 따라 다르다 */
  head: { cx: number; cy: number; r: number };
  /** 접지 그림자 가로 반경. 넓을수록 무겁게 보인다 */
  shadow: number;
  /** 머리 위 장식(투구/두건/후드). 없으면 생략 */
  crown?: string;
};

/**
 * 직업별 체형.
 * 넓은 어깨+낮은 무게중심(탱커) ↔ 좁고 웅크린 윤곽(로그)이 양 극단이고
 * 나머지가 그 사이에 놓이도록 잡았다.
 */
const BUILD: Record<HeroArtKind, Build> = {
  // 병사 — 기준 체형. 곧게 선 자세, 어깨 각짐
  sword: {
    body: 'M30 32 L27 40 C24 52 24 63 26 72 L54 72 C56 63 56 52 53 40 L50 32 Z',
    head: { cx: 40, cy: 23, r: 9 },
    shadow: 17,
    crown: 'M31 21 Q40 11 49 21 Q40 16 31 21 Z',
  },
  // 거인족 탱커 — 가장 넓고 낮다. 어깨가 머리보다 훨씬 크고 다리가 짧다
  shield: {
    body: 'M28 34 Q22 36 20 44 L20 72 L60 72 L60 44 Q58 36 52 34 Z',
    head: { cx: 40, cy: 26, r: 8 },
    shadow: 22,
    crown: 'M31 25 Q40 16 49 25 L46 22 Q40 19 34 22 Z',
  },
  // 사제 — 발끝까지 퍼지는 로브. 다리 없음, 소매가 늘어진다
  staff: {
    body: 'M33 30 Q26 44 22 72 L58 72 Q54 44 47 30 Z',
    head: { cx: 40, cy: 22, r: 8.5 },
    shadow: 19,
    // 후드
    crown: 'M30 24 Q31 9 40 9 Q49 9 50 24 Q40 17 30 24 Z',
  },
  // 순찰병 — 웅크린 자세. 좁고 앞으로 기울어져 있다
  dagger: {
    body: 'M34 34 Q27 42 28 52 L31 72 L49 72 L50 50 Q50 40 45 34 Z',
    head: { cx: 42, cy: 25, r: 7.5 },
    shadow: 14,
    // 망토 깃
    crown: 'M34 24 Q42 14 50 23 Q42 19 34 24 Z',
  },
  // 파괴자 — 벌어진 자세, 두꺼운 상체
  greatsword: {
    body: 'M29 33 Q23 38 23 48 L27 72 L53 72 L57 48 Q57 38 51 33 Z',
    head: { cx: 40, cy: 24, r: 8.5 },
    shadow: 20,
    crown: 'M30 22 Q40 10 50 22 L45 19 Q40 16 35 19 Z',
  },
};

export function HeroArt({
  art, element, size = 74, faded,
}: { art: HeroArtKind; element: string; size?: number; faded?: boolean }) {
  const c = ELEMENT_TINT[element] ?? ELEMENT_TINT.fire;
  const gid = `hero-${art}-${element}`;
  const b = BUILD[art] ?? BUILD.sword;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ opacity: faded ? 0.3 : 1, transition: 'opacity 300ms' }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity=".95" />
          <stop offset="100%" stopColor="#0A0810" stopOpacity=".9" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="74" rx={b.shadow} ry="4" fill="#000" opacity=".5" />
      <path d={b.body} fill={`url(#${gid})`} />
      <circle cx={b.head.cx} cy={b.head.cy} r={b.head.r} fill={c} opacity=".9" />
      {b.crown && <path d={b.crown} fill="#0B0910" opacity=".85" />}
      {art === 'sword' && (
        <g stroke={c} strokeWidth="3" strokeLinecap="round"><path d="M60 62 L72 26" /><path d="M55 40 L67 44" /></g>
      )}
      {art === 'shield' && (
        <g><path d="M60 34 L76 34 L76 52 Q68 64 60 52 Z" fill="#3A3630" stroke={c} strokeWidth="2" /><path d="M68 38 L68 56" stroke={c} strokeWidth="1.5" /></g>
      )}
      {art === 'staff' && (
        <g><path d="M64 70 L64 22" stroke={c} strokeWidth="3" strokeLinecap="round" /><circle cx="64" cy="18" r="6" fill="none" stroke={c} strokeWidth="2" /><circle cx="64" cy="18" r="2.5" fill={c} /></g>
      )}
      {art === 'dagger' && (
        <g stroke={c} strokeWidth="2.5" strokeLinecap="round"><path d="M56 54 L66 40" /><path d="M26 56 L16 44" /></g>
      )}
      {art === 'greatsword' && (
        <g><path d="M40 6 L46 18 L46 60 L34 60 L34 18 Z" fill={c} opacity=".55" stroke={c} strokeWidth="1.5" /><path d="M26 60 L54 60" stroke={c} strokeWidth="3" strokeLinecap="round" /></g>
      )}
    </svg>
  );
}
