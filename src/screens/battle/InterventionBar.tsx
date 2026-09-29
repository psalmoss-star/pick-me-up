import { T } from '../../ui/tokens';

export interface InterventionBarProps {
  /** 후퇴 신호를 이미 썼는가 (전투당 1회) */
  used: boolean;
  /** 위기 창을 쓰지 않고 넘겼는가 — 위기는 전투당 한 번이라 그 뒤로는 신호를 쓸 순간이 없다 */
  passed?: boolean;
  /** 전투가 끝났으면 숨긴다 */
  hidden?: boolean;
}

/**
 * 후퇴 신호 상태 줄.
 *
 * 출정 후 마스터가 손댈 수 있는 것은 후퇴 신호 하나뿐이다(사용자 결정 §8-1, 2026-09-29).
 * 예전의 집중·수호·후퇴(1턴) 버튼은 뺐다 — 집중·수호는 책략·군령이 흡수했고,
 * 신호는 **위기 순간 리플레이가 멈출 때만** 쓴다(그 창은 `BattleScreen`이 띄운다).
 * 여기는 "아직 남아 있는가"만 보여 준다. 아껴 뒀다가 못 쓰고 잃는 경험이 퍼머데스의 무게다.
 */
export function InterventionBar({ used, passed, hidden }: InterventionBarProps) {
  if (hidden) return null;
  return (
    <div style={{ ...shell, color: used || passed ? T.dim : T.rare }}>
      <div style={{ fontSize: 11, letterSpacing: '.14em' }}>
        {/* 위기가 올지 안 올지는 말하지 않는다 — 미래를 흘리면 긴장이 사라진다 */}
        {used ? '후퇴 신호를 보냈다'
          : passed ? '후퇴 신호를 쓰지 않았다'
            : '후퇴 신호 — 위기가 오면 한 번'}
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  minHeight: 44,
  padding: '6px 8px',
  border: `1px solid ${T.panelHi}`,
  background: '#08070C',
  boxSizing: 'border-box',
};
