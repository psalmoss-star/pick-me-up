/**
 * 생성된 영웅 일러스트 등록소.
 *
 * Vite의 import.meta.glob으로 assets/ 폴더를 훑는다 — 파일이 없어도 빌드가 깨지지 않는다.
 * (정적 import를 쓰면 아트를 안 받은 사람의 빌드가 실패한다. 아트는 선택 사항이어야 한다.)
 *
 * 파일명 규칙은 `{defId}.jpg` — scripts/gen-art.mts가 그렇게 저장한다.
 * 별도 매핑표를 만들지 않는 이유: artMap처럼 손으로 관리하는 표가 하나 더 생기면
 * 키가 어긋나도 타입이 안 잡아준다 (HANDOFF §5-16에서 이미 겪었다).
 */
const FILES = import.meta.glob<string>('./assets/*.jpg', {
  eager: true,
  import: 'default',
  query: '?url',
});

/** defId → 이미지 URL. 없으면 undefined이고, 호출부는 SVG로 폴백한다. */
export const HERO_IMAGE: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [
    path.replace('./assets/', '').replace('.jpg', ''),
    url,
  ]),
);

export const heroImageOf = (defId: string): string | undefined => HERO_IMAGE[defId];
