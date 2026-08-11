export type SceneKind = 'ruins' | 'field' | 'outpost' | 'gate' | 'corridor' | 'chasm';

const PALETTE: Record<SceneKind, { sky: [string, string]; acc: string }> = {
  ruins: { sky: ['#221A2E', '#0B0812'], acc: '#4A3A5C' },
  field: { sky: ['#2E1E18', '#0D0808'], acc: '#5C3A2A' },
  outpost: { sky: ['#182430', '#080A10'], acc: '#2E4658' },
  gate: { sky: ['#2A2216', '#0C0A06'], acc: '#5C4A22' },
  corridor: { sky: ['#1C2028', '#08090C'], acc: '#3A4250' },
  chasm: { sky: ['#2A0E12', '#0A0406'], acc: '#6C2020' },
};

/**
 * 층 배경. 층마다 하늘 색조와 실루엣이 바뀐다.
 *
 * preserveAspectRatio를 'none'으로 두면 컨테이너 비율에 따라 최대 40% 넘게 늘어난다
 * (전투 스테이지가 특히 심하다 — 골렘이 납작해진다).
 * 'xMidYMax slice'는 비율을 지키면서 하단(지평선) 기준으로 맞춰,
 * 남는 위쪽 하늘만 잘려나간다. 하늘은 단색 그라디언트라 잘려도 티가 안 난다.
 * 잘린 위쪽이 비지 않도록 컨테이너에 같은 색을 깔아둔다.
 */
export function Scene({ kind }: { kind: SceneKind }) {
  const P = PALETTE[kind] ?? PALETTE.ruins;
  return (
    <svg
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMax slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: P.sky[0] }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sky-${kind}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={P.sky[0]} />
          <stop offset="100%" stopColor={P.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#sky-${kind})`} />
      {kind === 'chasm' && (<><circle cx="200" cy="150" r="80" fill={P.acc} opacity=".22" /><circle cx="200" cy="150" r="46" fill={P.acc} opacity=".3" /></>)}
      {kind === 'gate' && <path d="M120 200 L120 90 Q200 50 280 90 L280 200 Z" fill={P.acc} opacity=".28" />}
      {kind === 'outpost' && <path d="M60 200 L60 110 L100 88 L140 110 L140 200 Z" fill={P.acc} opacity=".3" />}
      {kind === 'corridor' && (<><path d="M40 200 L40 60 L70 60 L70 200 Z" fill={P.acc} opacity=".3" /><path d="M330 200 L330 60 L360 60 L360 200 Z" fill={P.acc} opacity=".3" /></>)}
      <path d="M0 200 L0 150 L40 120 L80 155 L130 118 L180 150 L230 112 L290 148 L340 122 L400 152 L400 200 Z" fill="#000" opacity=".55" />
      {kind === 'ruins' && (
        <g fill={P.acc} opacity=".35">
          <rect x="70" y="105" width="14" height="95" />
          <rect x="300" y="118" width="12" height="82" />
          <rect x="325" y="130" width="10" height="70" />
        </g>
      )}
      <rect y="176" width="400" height="24" fill="#000" opacity=".6" />
    </svg>
  );
}
