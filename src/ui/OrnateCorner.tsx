import { STAR_TIERS } from './tokens';

export interface OrnateCornerProps {
  color: string;
  size?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** 0~4. 클수록 장식이 많아진다. */
  density?: number;
}

/** 시스템 창과 카드 프레임의 코너 장식. 등급/톤에 따라 밀도가 달라진다. */
export function OrnateCorner({ color, size = 30, flipX, flipY, density = 4 }: OrnateCornerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      style={{ transform: `scale(${flipX ? -1 : 1},${flipY ? -1 : 1})`, transformOrigin: 'center', overflow: 'visible' }}
      aria-hidden="true"
    >
      <g fill="none" stroke={color} strokeLinecap="round" strokeWidth="1.1">
        <path d="M2 14 Q2 2 14 2" />
        {density >= 1 && <path d="M2 22 Q2 8 8 4" opacity=".75" />}
        {density >= 2 && <path d="M6 2 Q18 2 24 6" opacity=".6" />}
        {density >= 3 && <path d="M4 10 Q10 6 14 8 Q10 12 4 10 Z" fill={color} fillOpacity=".5" stroke="none" />}
        {density >= 4 && <circle cx="16" cy="16" r="1.6" fill={color} stroke="none" opacity=".9" />}
      </g>
    </svg>
  );
}

/** 카드용(더 작고 밀도가 등급에 묶인 버전) */
export function CardCorners({ star, size = 20 }: { star: number; size?: number }) {
  const tier = STAR_TIERS[star];
  if (!tier || tier.corners === 0) return null;
  return (
    <>
      {([[0, 0], [0, 1], [1, 0], [1, 1]] as const).map(([x, y]) => (
        <div
          key={`${x}${y}`}
          style={{ position: 'absolute', [y ? 'bottom' : 'top']: 2, [x ? 'right' : 'left']: 2 } as React.CSSProperties}
        >
          <OrnateCorner color={tier.ring} size={size} flipX={!!x} flipY={!!y} density={tier.corners} />
        </div>
      ))}
    </>
  );
}
