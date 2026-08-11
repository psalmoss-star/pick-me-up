import type { ReactNode } from 'react';
import { T } from '../ui/tokens';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, color: T.dim, fontSize: 11, letterSpacing: '.3em' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${T.panelHi},transparent)` }} />
    </div>
  );
}
