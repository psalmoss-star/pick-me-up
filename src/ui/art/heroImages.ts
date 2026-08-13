/**
 * 생성된 영웅 일러스트 등록소.
 *
 * Vite의 import.meta.glob으로 assets/ 폴더를 훑는다 — 파일이 없어도 빌드가 깨지지 않는다.
 * (정적 import를 쓰면 아트를 안 받은 사람의 빌드가 실패한다. 아트는 선택 사항이어야 한다.)
 *
 * 파일명 규칙은 `{defId}.jpg`(슬롯 0)와 `{defId}_{n}.jpg`(n≥2) — 규칙과 파싱은
 * `variantNaming.ts`에 있고 `scripts/gen-art.mts`가 같은 규칙으로 파일을 쓴다.
 * 별도 매핑표를 만들지 않는 이유: artMap처럼 손으로 관리하는 표가 하나 더 생기면
 * 키가 어긋나도 타입이 안 잡아준다 (HANDOFF §5-16에서 이미 겪었다).
 */
import { groupVariants } from './variantNaming';
import { variantOf } from '../../game/portraitVariant';
import type { HeroInstance } from '../../game/types';

const FILES = import.meta.glob<string>('./assets/*.jpg', {
  eager: true,
  import: 'default',
  query: '?url',
});

/** defId → 변형 URL 배열. 배열 인덱스가 곧 슬롯 번호다(0번이 접미사 없는 파일). */
export const HERO_IMAGES: Record<string, string[]> = groupVariants(Object.entries(FILES));

const EMPTY: readonly string[] = [];

export const heroImagesOf = (defId: string): readonly string[] => HERO_IMAGES[defId] ?? EMPTY;

/** 이 defId에 준비된 변형 수. 0이면 아트가 없다는 뜻이고 화면은 SVG로 간다. */
export const heroVariantCountOf = (defId: string): number => heroImagesOf(defId).length;

/**
 * defId + 슬롯 → 이미지 URL. 없으면 undefined이고, 호출부는 SVG로 폴백한다.
 *
 * 두 번째 인자에 기본값이 있어 기존 호출부(`heroImageOf(defId)`)가 그대로 동작한다.
 */
export const heroImageOf = (defId: string, variant = 0): string | undefined =>
  heroImagesOf(defId)[variant];

/**
 * 개체 → 슬롯 번호. 파일 수 조회와 파생을 한 번에 묶는다.
 *
 * 화면 6곳이 같은 두 줄을 복붙하지 않도록 여기 둔다. `game/`은 파일 개수를 모르고
 * (아트를 몰라야 하므로), 세는 일은 이 모듈의 책임이다.
 */
export const heroVariantOf = (inst: HeroInstance): number =>
  variantOf(inst, heroVariantCountOf(inst.defId));
