/**
 * 비주얼 언어의 단일 출처.
 * 색과 등급 표현을 여기 밖에서 하드코딩하지 말 것.
 */

export const T = {
  void: '#050508',
  panel: '#0F0D16',
  panelHi: '#1C1628',
  frame: '#E8E4D9',
  rare: '#B57CE0',
  gold: '#D4AF37',
  blood: '#C1272D',
  amber: '#E0913A',
  text: '#F0ECE2',
  dim: '#8A8496',
} as const;

/**
 * 마을(대기실) 전용 팔레트 — 사이드뷰 배경화.
 *
 * 왜 T와 따로 두는가: 마을은 유일하게 "밤하늘 아래 거점"을 그리는 장면이고
 * 보라/인디고 계열이 필요하다. 이걸 T에 섞으면 카드·전투·패널까지 물들어
 * 등급 표현(STAR_TIERS)과 경쟁한다. 장면 전용 색은 여기 모아둔다.
 *
 * 규칙은 그대로다 — 색은 tokens 밖에서 하드코딩하지 않는다.
 */
export const V = {
  skyTop: '#141031',
  skyBottom: '#1E1748',
  moon: '#F2EDD8',
  ridgeFar: '#221A4A',
  ridgeNear: '#2A2158',
  ground: '#2E2560',
  groundEdge: '#3A2F72',
  wall: '#3B2F6E',
  wallDark: '#2A2150',
  roofWarm: '#4A3A32',
  roofCool: '#2F5D52',
  roofShop: '#C4522E',
  window: '#F0A93B',
  windowAlt: '#4ED3A0',
  windowShop: '#F0A882',
  tower: '#453A80',
  towerDark: '#332A63',
  accent: '#8B7BE8',
  label: '#2A2350',
} as const;

/**
 * 아이소메트릭 마을 전용 팔레트.
 *
 * ── 왜 V로 부족한가 ───────────────────────────────────
 * V는 사이드뷰용이라 면이 둘(벽·지붕)뿐이었다. 아이소메트릭은 한 덩어리에
 * **윗면·오른면·왼면 셋**이 동시에 보이므로, 같은 재질의 밝기 3단계가 있어야
 * 입체로 읽힌다. 셋을 같은 색으로 두면 도형이 납작해진다(색이 아니라 명도가 형태를 만든다).
 *
 * ⚠️ 레퍼런스는 밝은 파스텔이지만 이 프로젝트는 **어두운 배경이 절대 규칙**이라
 * 명도를 통째로 내렸다. 대비(윗면 vs 왼면)는 레퍼런스와 같은 비율로 유지한다 —
 * 어둡게 만들면서 대비까지 줄이면 형태가 사라진다.
 */
export const ISO = {
  /** 하늘 — 위에서 아래로. 밤이지만 지면 쪽이 살짝 밝아 지평선이 생긴다 */
  skyTop: '#0B0918',
  skyBottom: '#1B1540',

  /** 섬 지면 (윗면 / 측면 / 바닥 그림자) */
  turfTop: '#2E2560',
  turfSide: '#231C4C',
  rock: '#191338',

  /** 석재 — 성벽·주요 건물. 3면 */
  stoneTop: '#4A3E86',
  stoneR: '#3A2F6E',
  stoneL: '#2C2354',

  /** 목재 — 부속 건물. 3면 */
  woodTop: '#5A4270',
  woodR: '#463358',
  woodL: '#342644',

  /** 지붕 — 계열을 나눠 건물 종류가 실루엣 밖에서도 구분되게 */
  roofWarm: '#7A3F5E',
  roofWarmD: '#5A2C45',
  roofCool: '#2F5D6E',
  roofCoolD: '#224553',
  roofRoyal: '#4A3A90',
  roofRoyalD: '#362A6C',

  /** 발광 — 창·소환진·탑. 어두운 배경에서 시선을 끄는 유일한 수단 */
  glow: '#F0A93B',
  glowAlt: '#4ED3A0',
  arcane: '#8B7BE8',
  outline: '#0A0818',
} as const;

export type Tone = 'normal' | 'rare' | 'warning' | 'death';

export const TONES: Record<Tone, { line: string; glow: string; text: string }> = {
  normal: { line: T.frame, glow: 'rgba(232,228,217,.20)', text: T.text },
  rare: { line: T.rare, glow: 'rgba(181,124,224,.45)', text: '#F3E8FF' },
  warning: { line: T.amber, glow: 'rgba(224,145,58,.35)', text: '#FFE9CC' },
  death: { line: T.blood, glow: 'rgba(193,39,45,.40)', text: '#F5D0D0' },
};

export interface StarTier {
  ring: string;
  ringHi?: string;
  fill: string;
  glow: number;
  /** 코너 장식 밀도 0~4 */
  corners: number;
  lattice: boolean;
  rays: boolean;
  halo: boolean;
  emblem: 'plain' | 'star' | 'ornate';
  label: string;
  /**
   * 거처 — 이 등급의 영웅이 마을에서 사는 곳.
   *
   * `stats.ts`의 계급(`KLASS_BY_STAR`: 초보자→…→영웅)과 **1:1로 짝이다.**
   * 계급이 사는 곳이라는 뜻이 성립해야 하므로 한쪽만 늘리지 말 것.
   *
   * ⚠️ **★5와 ★6은 위 구조 값이 전부 같다**(corners 4 / lattice / rays / halo).
   * 색만 다르므로 카드 구조로는 둘이 안 갈린다 — 거처 이름이 그 둘을 가르는
   * 유일한 구조적 차이다. 여섯이 서로 달라야 하며 `quarters.test.ts`가 잠근다.
   */
  quarters: string;
}

/**
 * 등급은 "색"이 아니라 "구조"로 올라간다.
 * ★1~3 = 무광·정적 / ★4~6 = 발광·장식·움직임
 * 색만 바꾸면 작은 크기에서 ★3과 ★5가 구분되지 않는다 (실제로 겪은 문제).
 */
export const STAR_TIERS: Record<number, StarTier> = {
  1: { ring: '#4E4B45', fill: '#1A1916', glow: 0, corners: 0, lattice: false, rays: false, halo: false, emblem: 'plain', label: '무광 회동', quarters: '훈련생 막사' },
  2: { ring: '#8A5E36', fill: '#231810', glow: 0, corners: 1, lattice: false, rays: false, halo: false, emblem: 'plain', label: '청동', quarters: '병사 숙소' },
  3: { ring: '#6F8598', fill: '#141A20', glow: 5, corners: 2, lattice: false, rays: false, halo: false, emblem: 'star', label: '강철은', quarters: '정예 숙사' },
  4: { ring: '#D4AF37', ringHi: '#F6E08A', fill: '#241C0B', glow: 20, corners: 3, lattice: true, rays: false, halo: false, emblem: 'star', label: '금', quarters: '기사관' },
  5: { ring: '#FFF3C9', ringHi: '#FFFFFF', fill: '#1E1830', glow: 38, corners: 4, lattice: true, rays: true, halo: true, emblem: 'ornate', label: '백금', quarters: '단장 관저' },
  6: { ring: '#F0C34A', ringHi: '#FFF6D0', fill: '#070505', glow: 54, corners: 4, lattice: true, rays: true, halo: true, emblem: 'ornate', label: '흑금', quarters: '영웅 저택' },
};

/**
 * 거처 읽기 — `STAR_TIERS[star].quarters`를 직접 읽지 말 것.
 *
 * `STAR_TIERS`는 `Record<number, …>`라 존재하지 않는 등급도 타입이 통과한다
 * (다른 소비자도 전부 `?? STAR_TIERS[1]`로 막고 있다). 여기 한 곳에서 막는다.
 */
export function quartersFor(star: number): string {
  return (STAR_TIERS[star] ?? STAR_TIERS[1]).quarters;
}

/**
 * 승급하면 옮겨갈 거처. **최고 등급이면 `null`** — 더 갈 곳이 없다.
 *
 * 호출부가 `null`을 반드시 갈라야 한다. 안 가르면 ★6 화면에
 * `undefined`가 그대로 새어 나온다.
 */
export function nextQuartersFor(star: number): string | null {
  return STAR_TIERS[star + 1]?.quarters ?? null;
}

export const ELEMENT_TINT: Record<string, string> = {
  fire: '#C1442D', water: '#2D7FA8', wind: '#3E9E73', earth: '#8A6A3C', thunder: '#8B6FC4',
};

export const ELEMENT_KR: Record<string, string> = {
  fire: '화', water: '수', wind: '풍', earth: '지', thunder: '뇌',
};
