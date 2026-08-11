import { T } from '../../ui/tokens';
import { TOUCH_MIN } from '../../ui/Button';
import {
  INTERVENTION_LABEL, INTERVENTION_DESC,
  type InterventionKind,
} from '../../game/intervention';

const KINDS: InterventionKind[] = ['focus', 'guard', 'retreat'];

export interface InterventionBarProps {
  /** 지금 개입할 수 있는가 (턴당 1회 + 쿨다운) */
  available: boolean;
  /** 못 쓸 때 사유 표시용 */
  nextTurn: number;
  currentTurn: number;
  /** 선택 중인 개입. null이면 아직 안 고름 */
  selecting: InterventionKind | null;
  onPick: (kind: InterventionKind) => void;
  onCancel: () => void;
  /** 전투가 끝났으면 숨긴다 */
  hidden?: boolean;
}

/**
 * 개입 바.
 *
 * 이 게임에서 플레이어가 전투 중에 만질 수 있는 유일한 것.
 * 관전만 하던 화면에 이게 들어가면서 '볼 이유'가 생긴다.
 */
export function InterventionBar({
  available, nextTurn, currentTurn, selecting, onPick, onCancel, hidden,
}: InterventionBarProps) {
  if (hidden) return null;

  if (selecting) {
    return (
      <div style={shell}>
        <div style={{ fontSize: 11, color: T.rare, letterSpacing: '.16em' }}>
          {INTERVENTION_LABEL[selecting]} — 대상을 고르십시오
        </div>
        <button onClick={onCancel} style={cancelStyle}>취소</button>
      </div>
    );
  }

  if (!available) {
    const wait = Math.max(0, nextTurn - currentTurn);
    return (
      <div style={{ ...shell, color: T.dim }}>
        <div style={{ fontSize: 11, letterSpacing: '.14em' }}>
          {wait > 0 ? `개입 재정비 — ${wait}턴 후` : '이번 턴 개입을 사용했습니다'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...shell, gap: 8 }}>
      {KINDS.map((kind) => (
        <button
          key={kind}
          onClick={() => onPick(kind)}
          title={INTERVENTION_DESC[kind]}
          style={{
            flex: 1,
            minHeight: TOUCH_MIN,
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            padding: '6px 4px',
            background: 'transparent',
            border: `1px solid ${T.rare}`,
            boxShadow: `0 0 14px ${T.rare}22`,
            color: T.text,
            fontFamily: 'inherit',
            cursor: 'pointer',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontSize: 13, letterSpacing: '.14em' }}>
            {INTERVENTION_LABEL[kind]}
          </span>
        </button>
      ))}
    </div>
  );
}

const shell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  minHeight: 52,
  padding: '6px 8px',
  border: `1px solid ${T.panelHi}`,
  background: '#08070C',
  boxSizing: 'border-box',
};

const cancelStyle: React.CSSProperties = {
  minHeight: 36,
  padding: '6px 14px',
  background: 'transparent',
  border: `1px solid ${T.dim}`,
  color: T.dim,
  fontFamily: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
};
