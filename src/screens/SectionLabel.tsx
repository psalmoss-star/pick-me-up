import type { ReactNode } from 'react';
import { T } from '../ui/tokens';

/**
 * 섹션 라벨.
 *
 * ⚠️ **위 여백은 이 컴포넌트가 갖는다.** 예전에는 `marginBottom`만 있어서
 * 앞 패널의 밑변에 라벨이 붙어 겹쳐 읽혔다(§STEP 33에서 상태창이 처음 겪었다).
 * 그때는 화면 쪽에서 `<div style={{ marginTop: 18 }} />`를 끼워 막았는데,
 * 그 방식은 **라벨을 쓰는 화면마다 기억해야 하는 규칙**이 되어 반드시 빠뜨린다 —
 * 실제로 무덤의 '등반 기록'이 같은 증상으로 폰에서 잡혔다(2026-08-26).
 *
 * §5-46("공통 UI를 화면마다 넣으면 반드시 빠뜨린다 — 소유자를 한 곳으로")에 따라
 * 여백을 여기로 옮겼다. 화면 쪽 수동 스페이서는 제거했다(넣으면 두 배가 된다).
 *
 * 첫 번째 라벨에도 위 여백이 붙지만, 헤더 아래라 오히려 자연스럽다.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 14, color: T.dim, fontSize: 11, letterSpacing: '.3em' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${T.panelHi},transparent)` }} />
    </div>
  );
}
