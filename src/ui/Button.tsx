import type { ReactNode } from 'react';
import { T, TONES, type Tone } from './tokens';

/** 터치 타깃 최소 크기. 손가락으로 누를 수 있는 모든 것에 적용한다. */
export const TOUCH_MIN = 44;

export function Button({
  children, onClick, tone = 'normal', disabled, small,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: Tone;
  disabled?: boolean;
  small?: boolean;
}) {
  const c = TONES[tone].line;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        // 터치 타깃 최소 44x44 (Apple HIG / Material).
        // inline-flex가 없으면 minHeight만으로는 글자가 위에 붙는다.
        minHeight: TOUCH_MIN,
        minWidth: TOUCH_MIN,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        padding: small ? '10px 18px' : '13px 28px',
        background: 'transparent',
        border: `1px solid ${disabled ? T.dim : c}`,
        color: disabled ? T.dim : T.text,
        fontFamily: 'inherit',
        fontSize: small ? 13 : 15,
        letterSpacing: '.18em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : `0 0 18px ${c}22`,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

/**
 * 얇은 진행 바. HP 말고 경험치·훈련 진행도에도 쓴다 —
 * 프로젝트에 바 구현이 여럿 생기는 것을 막으려고 이걸 재사용한다.
 *
 * `w`에 문자열('100%')을 줄 수 있다 — 부모 폭을 채워야 하는 목록에서 쓴다.
 */
export function HpBar({
  cur, max, color = T.blood, w = 108, h = 6,
}: { cur: number; max: number; color?: string; w?: number | string; h?: number }) {
  const p = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  return (
    <div style={{ width: w, height: h, background: '#1A1620', border: '1px solid #2A2434' }}>
      <div style={{ width: `${p * 100}%`, height: '100%', background: color, transition: 'width 220ms ease-out' }} />
    </div>
  );
}
