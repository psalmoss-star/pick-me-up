import { ELEMENT_TINT, STAR_TIERS, T } from './tokens';
import { CardCorners } from './OrnateCorner';
import { type HeroArtKind } from './art/HeroArt';
import { HeroPortrait } from './art/HeroPortrait';

export interface HeroCardProps {
  name: string;
  star: number;
  element: string;
  art: HeroArtKind;
  /**
   * 일러스트 조회용. 넘기면 생성 초상을 쓰고, 없거나 파일이 없으면 SVG 실루엣으로 폴백한다.
   * 생략해도 카드는 정상 동작한다 — 아트는 선택 사항이다.
   */
  defId?: string;
  level?: number;
  klass?: string;
  width?: number;
  selected?: boolean;
  dead?: boolean;
  favorite?: boolean;
  /**
   * 발굴 진행도 0~1. 카드는 게임 로직을 모르므로 호출부가 estimatePotential에서 꺼내 넘긴다
   * (art/klass를 호출부가 계산해 넘기는 것과 같은 방식).
   * 여기에 참값이나 추정 구간을 넘기지 말 것 — 카드에 필요한 건 "얼마나 알아냈나"뿐이다.
   */
  reveal?: number;
  onClick?: () => void;
}

/**
 * 타로카드형 영웅 표시. 사각 썸네일 금지.
 * 등급 표현은 STAR_TIERS의 구조 값(corners/lattice/rays/halo)을 반드시 사용할 것.
 */
export function HeroCard({
  name, star, element, art, defId, level, klass,
  width = 130, selected, dead, favorite, reveal, onClick,
}: HeroCardProps) {
  const tier = STAR_TIERS[star] ?? STAR_TIERS[1];
  const hi = tier.ringHi ?? tier.ring;
  const tint = ELEMENT_TINT[element] ?? ELEMENT_TINT.fire;
  const luminous = star >= 4;

  // 폭에 비례해 내부 요소를 줄인다. 다만 글자는 하한을 둔다 —
  // 카드가 작아져도 안 읽히면 의미가 없다.
  const s = width / 130;
  const nameSize = Math.max(11, Math.round(12 * s));
  const metaSize = Math.max(10, Math.round(10 * s));
  const starSize = Math.max(10, Math.round((star >= 5 ? 10 : 12) * s));
  const haloInset = Math.round(14 * s);

  return (
    <button
      onClick={onClick}
      style={{
        width,
        height: Math.round(width * 1.58),
        position: 'relative',
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        filter: dead ? 'grayscale(1) brightness(.5)' : 'none',
        transform: selected ? 'translateY(-8px)' : 'none',
        transition: 'transform 180ms, filter 300ms',
      }}
    >
      {tier.halo && !dead && (
        <div style={{ position: 'absolute', inset: -haloInset, borderRadius: '50%', background: `radial-gradient(circle,${hi}33 0%,transparent 70%)`, animation: 'halo 4.5s ease-in-out infinite' }} />
      )}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(160deg,${tier.fill} 0%,#06050A 72%)`,
          border: `${luminous ? 2 : 1}px solid ${selected ? hi : tier.ring}`,
          boxShadow: tier.glow
            ? `0 0 ${tier.glow}px ${tier.ring}66, inset 0 0 26px rgba(0,0,0,.85)`
            : 'inset 0 0 26px rgba(0,0,0,.9)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {tier.lattice && (
          <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(45deg,${tier.ring}0F 0 1px,transparent 1px 9px),repeating-linear-gradient(-45deg,${tier.ring}0F 0 1px,transparent 1px 9px)` }} />
        )}
        {star >= 3 && <div style={{ position: 'absolute', inset: 5, border: `1px solid ${tier.ring}${luminous ? '77' : '44'}` }} />}
        {tier.rays && (
          <svg viewBox="0 0 100 150" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <path
                key={i}
                d={`M50 62 L${50 + Math.cos((i / 10) * 6.283) * 90} ${62 + Math.sin((i / 10) * 6.283) * 90}`}
                stroke={hi}
                strokeWidth="0.7"
                opacity="0.2"
              />
            ))}
          </svg>
        )}

        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1, paddingTop: 12 }}>
          <HeroPortrait defId={defId} art={art} element={element} size={width * 0.62} />
        </div>

        <div style={{ textAlign: 'center', padding: '4px 0 2px', zIndex: 1 }}>
          <span style={{ letterSpacing: '.1em', fontSize: starSize, color: hi, textShadow: luminous ? `0 0 8px ${tier.ring}` : 'none' }}>
            {'★'.repeat(star)}
          </span>
        </div>

        <div
          style={{
            margin: '0 6px 6px',
            zIndex: 1,
            background: luminous
              ? `linear-gradient(90deg,transparent,${tier.ring}22 10%,#000000DD 30%,#000000DD 70%,${tier.ring}22 90%,transparent)`
              : 'linear-gradient(90deg,transparent,#000000CC 14%,#000000CC 86%,transparent)',
            borderTop: `1px solid ${tier.ring}88`,
            borderBottom: `1px solid ${tier.ring}88`,
            padding: '4px 2px',
          }}
        >
          {/* 긴 이름이 밴드를 넘치면 부모의 overflow:hidden에 잘린다 → ellipsis로 처리 */}
          <span
            style={{
              display: 'block',
              color: luminous ? hi : T.text,
              fontSize: nameSize,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              padding: '0 2px',
            }}
          >
            ≪ {name} ≫
          </span>
        </div>

        <div style={{ textAlign: 'center', color: T.dim, fontSize: metaSize, paddingBottom: 5, zIndex: 1 }}>
          {level != null ? `Lv.${level}` : ''}{klass ? ` · ${klass}` : ''}
        </div>

        {/*
          발굴 진행도 — 카드 밑변에 붙는 가는 선.
          숫자나 배지로 넣으면 등급 표현과 경쟁하므로, 구조에 얹되 조용하게 둔다.
          다 밝혀진 개체만 금색이 되어 눈에 띈다.
        */}
        {reveal != null && reveal > 0 && !dead && (
          <div style={{ position: 'absolute', left: 5, right: 5, bottom: 5, height: 2, background: '#00000066', zIndex: 1 }}>
            <div
              style={{
                width: `${Math.round(Math.min(1, reveal) * 100)}%`,
                height: '100%',
                background: reveal >= 1 ? T.gold : `${T.dim}CC`,
                transition: 'width 400ms',
              }}
            />
          </div>
        )}

        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <CardCorners star={star} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg,${tint}00 60%,${tint}0A 100%)`, pointerEvents: 'none' }} />
      </div>

      {favorite && !dead && <div style={{ position: 'absolute', top: 8, right: 10, color: T.gold, fontSize: 14, zIndex: 2 }}>❖</div>}
      {dead && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2 }} aria-hidden="true">
          <line x1="8%" y1="8%" x2="92%" y2="92%" stroke={T.blood} strokeWidth="5" opacity=".85" />
          <line x1="92%" y1="8%" x2="8%" y2="92%" stroke={T.blood} strokeWidth="5" opacity=".85" />
        </svg>
      )}
    </button>
  );
}
