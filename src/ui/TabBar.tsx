import { T } from './tokens';
import { TOUCH_MIN } from './Button';

/**
 * 하단 탭 바 — 마을 화면의 상시 동선.
 *
 * 마을(사이드뷰)은 **장소**를, 이 바는 **소지품·기록**을 담당한다.
 * 경계가 흐려지면 같은 화면으로 가는 입구가 둘이 되고, 사용자는
 * 둘이 다른 곳인 줄 알고 양쪽을 다 눌러본다.
 *
 * ⚠️ 마을에 있는 것을 여기 또 두지 말 것. 실제로 겪은 중복:
 *   - '퀘스트' 탭과 '탑 입장'이 둘 다 브리핑으로 갔다
 *   - '파티 편성'과 '영웅'이 둘 다 로스터 화면으로 갔다
 *   - '가방'과 마을의 '대장간'이 둘 다 대장간으로 갔다
 *   - '명예의 전당'과 마을의 '무덤'이 둘 다 무덤으로 갔다
 *
 * 남은 것은 **하나뿐**이다 — 로스터 전체는 마을에 건물로 세울 수 없다
 * (장소가 아니라 목록이므로). 나머지는 전부 마을이 담는다.
 */

export type TabKey = 'heroes';

export interface TabBarProps {
  onSelect: (tab: TabKey) => void;
  /** 배지 숫자. 0이면 표시하지 않는다 */
  badges?: Partial<Record<TabKey, number>>;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'heroes', label: '영웅 · 파티 편성' },
];

export function TabBar({ onSelect, badges = {} }: TabBarProps) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'grid',
        // 남은 탭 수에 맞춰 나눈다 — 4개 고정으로 두면 1개짜리가 왼쪽에 몰린다
        gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
        borderTop: `1px solid ${T.panelHi}`,
        background: T.panel,
        // 홈 인디케이터가 있는 기기에서 마지막 줄이 가리지 않도록
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 10,
      }}
    >
      {TABS.map((t) => {
        const n = badges[t.key] ?? 0;
        return (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            style={{
              position: 'relative',
              minHeight: TOUCH_MIN,
              padding: '14px 4px',
              background: 'transparent',
              border: 'none',
              color: T.text,
              fontFamily: 'inherit',
              fontSize: 13,
              letterSpacing: '.02em',
              cursor: 'pointer',
            }}
          >
            {t.label}
            {n > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 6,
                  right: '50%',
                  transform: 'translateX(26px)',
                  minWidth: 16,
                  height: 16,
                  lineHeight: '16px',
                  borderRadius: 999,
                  background: T.blood,
                  color: T.text,
                  fontSize: 10,
                  padding: '0 4px',
                }}
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
