import { T } from './tokens';
import { TOUCH_MIN } from './Button';

/**
 * 하단 탭 바 — 대기실의 상시 동선.
 *
 * ── 왜 마을과 겹치는 입구를 허용하는가 (2026-08-13 방침 변경) ──
 * 이전에는 탭이 '영웅' 하나뿐이었다. 마을에 있는 것을 탭에 또 두면
 * 사용자가 다른 곳인 줄 알고 양쪽을 눌러본다는 이유였다.
 *
 * 이번에 **의도적으로 되돌렸다.** 실제로 문제였던 것은 중복 자체가 아니라
 * **이름이 다른 중복**이었다('퀘스트' 탭과 '탑 입장'이 같은 브리핑으로 갔다).
 * 같은 이름·같은 목적지면 사용자는 그냥 가까운 쪽을 누른다 — 이게 표준 모바일 패턴이고,
 * 부감도에서 작은 건물을 조준하는 것보다 하단 탭이 훨씬 빠르다.
 *
 * ⚠️ 그래서 규칙이 "중복 금지"에서 **"중복하되 이름과 목적지가 정확히 같을 것"**으로 바뀌었다.
 * 탭을 추가할 때 마을의 라벨과 글자가 다르면 둘 중 하나를 고쳐서 맞출 것.
 */

export type TabKey = 'home' | 'heroes' | 'status' | 'summon' | 'party';

export interface TabBarProps {
  onSelect: (tab: TabKey) => void;
  /** 지금 보고 있는 탭 — 대기실에서는 'home' */
  active?: TabKey;
  /** 배지 숫자. 0이면 표시하지 않는다 */
  badges?: Partial<Record<TabKey, number>>;
}

/**
 * 아이콘은 SVG path로 둔다.
 * 이모지를 쓰면 기기마다 글꼴이 달라 5개의 크기·굵기가 제각각이 된다(레퍼런스도 SVG다).
 */
const TABS: { key: TabKey; label: string; d: string }[] = [
  { key: 'home', label: '대기실', d: 'M3 10 12 3l9 7M5.5 9.5V20h13V9.5' },
  { key: 'heroes', label: '영웅', d: 'M12 4.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2M4.5 20c0-4 3.4-6.6 7.5-6.6s7.5 2.6 7.5 6.6' },
  { key: 'status', label: '상태창', d: 'M3.5 3.5h17v17h-17zM7.5 15V9M12 15V7M16.5 15v-4' },
  { key: 'summon', label: '소환', d: 'M12 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14M12 4v14M5 11h14' },
  { key: 'party', label: '파티', d: 'M8.5 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6M3 19c0-3.2 2.5-5.2 5.5-5.2S14 15.8 14 19M14.5 19c0-2.6 2-4.3 4.3-4.3S23 16.4 23 19' },
];

export function TabBar({ onSelect, active = 'home', badges = {} }: TabBarProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
        borderTop: `1px solid ${T.panelHi}`,
        background: T.panel,
        // 홈 인디케이터가 있는 기기에서 마지막 줄이 가리지 않도록
        paddingBottom: 'env(safe-area-inset-bottom)',
        flex: 'none',
        /*
          ⚠️ `sticky`여야 한다. 흐름에만 두면 로스터처럼 긴 화면(실측 1110px 스크롤)에서
          **탭이 문서 맨 끝으로 밀려** 끝까지 스크롤해야 닿는다 — 하단 탭 바의 의미가 없다.
          대기실처럼 스크롤이 없는 화면에서는 `sticky`가 아무 영향을 주지 않는다.

          §5-33 주의: 조상에 `overflow:hidden`이 있으면 sticky가 죽는다.
          여기서는 `html,body`가 `overflow-x: clip`이라 스크롤 컨테이너가 안 생겨 살아 있다
          (`clip`은 `hidden`과 달리 스크롤 컨테이너를 만들지 않는다 — 그래서 clip을 쓴다).
        */
        position: 'sticky',
        bottom: 0,
        zIndex: 10,
      }}
    >
      {TABS.map((t) => {
        const n = badges[t.key] ?? 0;
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            aria-current={on ? 'page' : undefined}
            style={{
              position: 'relative',
              minHeight: TOUCH_MIN,
              padding: '8px 2px 7px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              background: 'transparent',
              border: 'none',
              // 선택 상태는 색 + 아래 표식 둘로 말한다 — 색만으로는 약하다
              color: on ? T.gold : T.dim,
              fontFamily: 'inherit',
              fontSize: 10,
              letterSpacing: '.02em',
              cursor: 'pointer',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
              <path d={t.d} />
            </svg>
            {t.label}
            <span
              style={{
                width: 14, height: 2, borderRadius: 2,
                background: T.gold,
                opacity: on ? 1 : 0,
              }}
            />
            {n > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: '50%',
                  transform: 'translateX(18px)',
                  minWidth: 15,
                  height: 15,
                  lineHeight: '15px',
                  borderRadius: 999,
                  background: T.blood,
                  color: T.text,
                  fontSize: 9,
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
