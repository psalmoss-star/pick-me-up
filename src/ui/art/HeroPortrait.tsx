/**
 * 영웅 초상 — 생성 일러스트 우선, 없거나 로드 실패하면 SVG 실루엣.
 *
 * ── 왜 HeroArt를 고치지 않고 감쌌나 ──────────────────────
 * HeroArt는 **전투 화면에서 5종이 같은 접지선(cy=74)에 서도록** 설계돼 있다.
 * 거기에 사진형 이미지를 끼우면 유닛들이 서로 다른 바닥에 뜬 것처럼 보인다.
 * 그래서 카드(정면 초상이 어울리는 곳)만 이 컴포넌트를 쓰고,
 * 전투 화면은 기존 HeroArt를 그대로 둔다.
 *
 * 폴백은 장식이 아니라 필수다 — 아트 생성은 외부 서비스에 의존하므로
 * 파일을 안 받은 사람도 게임이 정상으로 보여야 한다.
 */
import { useState } from 'react';
import { HeroArt, type HeroArtKind } from './HeroArt';
import { heroImageOf } from './heroImages';
import { ELEMENT_TINT } from '../tokens';

export interface HeroPortraitProps {
  /** 이미지 조회 키. 없으면 항상 SVG로 간다. */
  defId?: string;
  art: HeroArtKind;
  element: string;
  size?: number;
  faded?: boolean;
}

export function HeroPortrait({
  defId, art, element, size = 74, faded,
}: HeroPortraitProps) {
  // 로드 실패를 기억해 무한 재시도를 막는다
  const [broken, setBroken] = useState(false);
  const src = defId ? heroImageOf(defId) : undefined;

  if (!src || broken) {
    return <HeroArt art={art} element={element} size={size} faded={faded} />;
  }

  const tint = ELEMENT_TINT[element] ?? ELEMENT_TINT.fire;

  return (
    <div
      style={{
        width: size,
        // 세로로 긴 초상. 카드 안에서 인물이 충분히 보이는 비율이다.
        height: size * 1.24,
        overflow: 'hidden',
        position: 'relative',
        opacity: faded ? 0.3 : 1,
        transition: 'opacity 300ms',
      }}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        onError={() => setBroken(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // 생성 결과의 채도가 제각각이라 여기서 눌러 화면 톤에 맞춘다.
          // (프롬프트의 "muted desaturated"를 모델이 항상 지키지는 않는다)
          filter: 'saturate(0.75) contrast(1.05) brightness(0.92)',
        }}
      />
      {/* 속성 틴트 — 카드가 원소를 색으로도 말해주던 것을 유지한다 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg,${tint}14 0%,transparent 40%,#0A0810E6 100%)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
