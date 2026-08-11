import { T } from '../tokens';

export type GuardArtKind = 'gate' | 'princess' | 'depot' | 'envoy';

/**
 * 보호 대상. ratio(현재HP/최대HP)에 따라 실제로 부서진다 —
 * 숫자를 보지 않아도 상태가 보이게 하는 것이 목적.
 */
export function GuardArt({
  art, ratio = 1, size = 92,
}: { art: GuardArtKind; ratio?: number; size?: number }) {
  const cracked = ratio < 0.55;
  const ruined = ratio < 0.25;

  if (art === 'gate') {
    return (
      <svg width={size} height={size} viewBox="0 0 90 90" aria-hidden="true">
        <ellipse cx="45" cy="84" rx="26" ry="4" fill="#000" opacity=".5" />
        <path d="M14 82 L14 30 Q45 10 76 30 L76 82 Z" fill="#2C2A26" stroke={T.amber} strokeWidth="2" />
        {[24, 34, 44, 54, 64].map((x) => <path key={x} d={`M${x} 34 L${x} 82`} stroke="#4A4640" strokeWidth="3" />)}
        {[42, 56, 70].map((y) => <path key={y} d={`M16 ${y} L74 ${y}`} stroke="#4A4640" strokeWidth="3" />)}
        {cracked && <g stroke={T.blood} strokeWidth="2" fill="none"><path d="M30 34 L38 52 L28 64" /><path d="M62 38 L54 56" /></g>}
        {ruined && <g stroke={T.blood} strokeWidth="2.5" fill="none"><path d="M20 46 L44 58 L36 80" /><path d="M70 44 L58 70" /><path d="M45 30 L48 58" /></g>}
      </svg>
    );
  }

  // 보급고 — 9층 수비 대상. 오브젝트이므로 성문과 같은 '부서지는' 언어를 따른다.
  if (art === 'depot') {
    return (
      <svg width={size} height={size} viewBox="0 0 90 90" aria-hidden="true">
        <ellipse cx="45" cy="84" rx="24" ry="4" fill="#000" opacity=".5" />
        <path d="M18 82 L18 40 L45 26 L72 40 L72 82 Z" fill="#2C2A26" stroke={T.amber} strokeWidth="2" />
        <path d="M18 40 L45 26 L72 40" fill="none" stroke={T.amber} strokeWidth="1.6" opacity=".7" />
        <path d="M34 82 L34 56 L56 56 L56 82" fill="#4A4640" stroke={T.amber} strokeWidth="1.4" />
        <path d="M45 56 L45 82" stroke="#2C2A26" strokeWidth="2" />
        {cracked && <g stroke={T.blood} strokeWidth="2" fill="none"><path d="M24 46 L34 62 L26 74" /><path d="M66 48 L58 66" /></g>}
        {ruined && <g stroke={T.blood} strokeWidth="2.5" fill="none"><path d="M20 52 L44 64 L36 80" /><path d="M70 44 L58 76" /><path d="M45 30 L48 54" /></g>}
      </svg>
    );
  }

  // 사절 — 12층 호위 대상. NPC이므로 황녀와 같은 인물 실루엣 계열을 쓰되 관 대신 두건.
  if (art === 'envoy') {
    return (
      <svg width={size} height={size} viewBox="0 0 90 90" aria-hidden="true">
        <ellipse cx="45" cy="84" rx="16" ry="4" fill="#000" opacity=".5" />
        <path d="M45 34 C32 34 27 58 25 82 L65 82 C63 58 58 34 45 34 Z" fill="#4A5C7A" opacity=".9" />
        <path d="M45 34 L45 82" stroke="#D9B45C" strokeWidth="1.6" opacity=".7" />
        <circle cx="45" cy="24" r="10" fill="#E8D6C0" />
        <path d="M34 24 Q45 10 56 24 L56 20 Q45 6 34 20 Z" fill="#3A4A63" />
        <path d="M56 26 L64 34 L60 40" fill="none" stroke={T.gold} strokeWidth="1.8" />
        <circle cx="45" cy="50" r="4" fill={T.gold} opacity=".8" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 90 90" aria-hidden="true">
      <ellipse cx="45" cy="84" rx="16" ry="4" fill="#000" opacity=".5" />
      <path d="M45 34 C33 34 28 58 26 82 L64 82 C62 58 57 34 45 34 Z" fill="#7A5C8A" opacity=".9" />
      <circle cx="45" cy="24" r="10" fill="#E8D6C0" />
      <path d="M35 22 Q45 8 55 22 Q52 14 45 14 Q38 14 35 22 Z" fill="#D9B45C" />
      <path d="M38 12 L42 6 L45 11 L48 6 L52 12 Z" fill={T.gold} />
      <path d="M45 44 L45 66" stroke="#E8D6C0" strokeWidth="2" opacity=".6" />
    </svg>
  );
}
