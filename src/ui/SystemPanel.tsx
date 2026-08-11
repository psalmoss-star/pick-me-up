import { useEffect, useState, type ReactNode } from 'react';
import { T, TONES, type Tone } from './tokens';
import { OrnateCorner } from './OrnateCorner';

export interface SystemPanelProps {
  tone?: Tone;
  children: ReactNode;
  compact?: boolean;
  animate?: boolean;
}

/**
 * 이 게임의 시그니처 컴포넌트.
 * 모든 정보 전달은 이 창을 통과한다 — 맨 div로 카드를 만들지 말 것.
 */
export function SystemPanel({ tone = 'normal', children, compact, animate = true }: SystemPanelProps) {
  const c = TONES[tone];
  const [on, setOn] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  const hairline = {
    height: 1,
    background: `linear-gradient(90deg,transparent,${c.line} 18%,${c.line} 82%,transparent)`,
    opacity: 0.85,
  };

  return (
    <div
      style={{
        position: 'relative',
        opacity: on ? 1 : 0,
        transform: on ? 'none' : 'translateY(14px)',
        transition: 'opacity 260ms, transform 260ms',
      }}
    >
      <div
        style={{
          background: `radial-gradient(120% 140% at 50% 0%,${T.panelHi} 0%,${T.panel} 55%,#07060B 100%)`,
          border: `1px solid ${c.line}`,
          boxShadow: `0 0 26px ${c.glow}, inset 0 0 34px rgba(0,0,0,.75)`,
          padding: compact ? '16px 18px' : '26px 22px',
          textAlign: 'center',
          color: c.text,
        }}
      >
        <div style={hairline} />
        <div style={{ padding: compact ? '10px 0' : '16px 0' }}>{children}</div>
        <div style={hairline} />
      </div>
      {([[0, 0], [0, 1], [1, 0], [1, 1]] as const).map(([x, y]) => (
        <div
          key={`${x}${y}`}
          style={{ position: 'absolute', [y ? 'bottom' : 'top']: -8, [x ? 'right' : 'left']: -8 } as React.CSSProperties}
        >
          <OrnateCorner color={c.line} flipX={!!x} flipY={!!y} />
        </div>
      ))}
    </div>
  );
}
