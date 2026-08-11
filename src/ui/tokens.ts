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
}

/**
 * 등급은 "색"이 아니라 "구조"로 올라간다.
 * ★1~3 = 무광·정적 / ★4~6 = 발광·장식·움직임
 * 색만 바꾸면 작은 크기에서 ★3과 ★5가 구분되지 않는다 (실제로 겪은 문제).
 */
export const STAR_TIERS: Record<number, StarTier> = {
  1: { ring: '#4E4B45', fill: '#1A1916', glow: 0, corners: 0, lattice: false, rays: false, halo: false, emblem: 'plain', label: '무광 회동' },
  2: { ring: '#8A5E36', fill: '#231810', glow: 0, corners: 1, lattice: false, rays: false, halo: false, emblem: 'plain', label: '청동' },
  3: { ring: '#6F8598', fill: '#141A20', glow: 5, corners: 2, lattice: false, rays: false, halo: false, emblem: 'star', label: '강철은' },
  4: { ring: '#D4AF37', ringHi: '#F6E08A', fill: '#241C0B', glow: 20, corners: 3, lattice: true, rays: false, halo: false, emblem: 'star', label: '금' },
  5: { ring: '#FFF3C9', ringHi: '#FFFFFF', fill: '#1E1830', glow: 38, corners: 4, lattice: true, rays: true, halo: true, emblem: 'ornate', label: '백금' },
  6: { ring: '#F0C34A', ringHi: '#FFF6D0', fill: '#070505', glow: 54, corners: 4, lattice: true, rays: true, halo: true, emblem: 'ornate', label: '흑금' },
};

export const ELEMENT_TINT: Record<string, string> = {
  fire: '#C1442D', water: '#2D7FA8', wind: '#3E9E73', earth: '#8A6A3C', thunder: '#8B6FC4',
};

export const ELEMENT_KR: Record<string, string> = {
  fire: '화', water: '수', wind: '풍', earth: '지', thunder: '뇌',
};
