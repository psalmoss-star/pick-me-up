import { useEffect, useState } from 'react';

/**
 * 반응형 분기.
 *
 * 이 프로젝트는 인라인 style 객체를 쓰므로 미디어 쿼리를 못 쓴다.
 * 그래서 JS가 뷰포트를 알아야 한다.
 *
 * 분기점은 하나만 둔다. 3단(mobile/tablet/desktop)으로 나누면
 * 컴포넌트마다 스타일을 3벌 갖게 되고 인라인에서는 관리가 불가능해진다.
 */

export const BREAKPOINT = { compact: 480 } as const;

export interface Viewport {
  /** 480px 미만 = 모바일 세로 */
  compact: boolean;
  width: number;
  /** 전투 화면이 세로 예산을 계산할 때 쓴다 */
  height: number;
}

/** SSR/테스트 환경 기본값 — iPhone 14 기준 */
const FALLBACK = { width: 390, height: 844 };

function read(): Viewport {
  if (typeof window === 'undefined') {
    return { compact: true, ...FALLBACK };
  }
  const { innerWidth: width, innerHeight: height } = window;
  return { compact: width < BREAKPOINT.compact, width, height };
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(read);

  useEffect(() => {
    let raf = 0;
    // iOS는 주소창이 접힐 때 resize가 연속 발화한다 → rAF로 묶는다
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setViewport(read()));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return viewport;
}
