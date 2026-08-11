import { T } from './tokens';
import { TOUCH_MIN } from './Button';

/**
 * 하단 탭 바 — 마을 화면의 상시 동선.
 *
 * 마을(사이드뷰)은 '장소'를 담당하고, 이 바는 '소지품·정보'를 담당한다.
 * 둘을 섞으면 마을에 라벨이 10개가 붙어 그림이 무너진다.
 *
 * ⚠️ 여기 있는 탭은 전부 **실제로 열리는 화면**이어야 한다.
 * 눌러도 아무 일 없는 탭은 UI가 거짓말을 하는 것이다.
 */

export type TabKey = 'party' | 'heroes' | 'bag' | 'quest';

export interface TabBarProps {
  onSelect: (tab: TabKey) => void;
  /** 배지 숫자. 0이면 표시하지 않는다 */
  badges?: Partial<Record<TabKey, number>>;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'party', label: '파티 편성' },
  { key: 'heroes', label: '영웅' },
  { key: 'bag', label: '가방' },
  { key: 'quest', label: '퀘스트' },
];

export function TabBar({ onSelect, badges = {} }: TabBarProps) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
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
