import { ELEMENT_TINT } from '../tokens';

export type EnemyArtKind =
  | 'blob' | 'beast' | 'golem'
  | 'wisp' | 'warden' | 'revenant' | 'tyrant'
  | 'seraph' | 'colossus' | 'wraith' | 'sovereign'
  | 'hexweaver' | 'grovekeeper' | 'plaguebearer' | 'direwolf' | 'stonewarden'
  | 'hierophant' | 'blightlord' | 'warcaller' | 'ashking';

export function EnemyArt({
  art, element, size = 78, faded,
}: { art: EnemyArtKind; element: string; size?: number; faded?: boolean }) {
  const c = ELEMENT_TINT[element] ?? ELEMENT_TINT.earth;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ opacity: faded ? 0.18 : 1, transition: 'opacity 400ms' }} aria-hidden="true">
      {/* 부유형(불씨·망령·세라프·원귀·주술사)은 그림자를 좁혀 접지하지 않음을 드러낸다 */}
      <ellipse
        cx="40" cy="74"
        rx={art === 'wisp' ? 9 : art === 'revenant' || art === 'wraith' ? 12
          : art === 'seraph' || art === 'hexweaver' ? 14
          : art === 'tyrant' || art === 'sovereign' || art === 'blightlord' ? 24
          : art === 'ashking' ? 27
          : art === 'colossus' ? 26
          : art === 'grovekeeper' || art === 'stonewarden' || art === 'warcaller' ? 23
          : art === 'hierophant' ? 22 : 20}
        ry={art === 'wisp' || art === 'revenant' || art === 'wraith'
          || art === 'seraph' || art === 'hexweaver' ? 2.5 : 4}
        fill="#000" opacity={art === 'wisp' ? 0.3 : 0.5}
      />
      {art === 'blob' && (
        <g>
          <path d="M12 68 Q8 40 40 30 Q72 40 68 68 Z" fill={c} opacity=".75" />
          <path d="M12 68 Q8 40 40 30 Q72 40 68 68 Z" fill="none" stroke={c} strokeWidth="1.5" />
          <circle cx="31" cy="52" r="3.5" fill="#0A0810" />
          <circle cx="49" cy="52" r="3.5" fill="#0A0810" />
          <path d="M22 44 Q40 36 58 44" stroke="#fff" strokeWidth="1" opacity=".25" fill="none" />
        </g>
      )}
      {art === 'beast' && (
        <g>
          <path d="M14 62 L22 42 L44 38 L64 44 L70 58 L60 62 L56 52 L34 54 L28 64 Z" fill={c} opacity=".8" />
          <path d="M62 44 L72 30 L74 46 Z" fill={c} />
          <circle cx="66" cy="42" r="2.2" fill="#FFE08A" />
          <g stroke={c} strokeWidth="2.5" strokeLinecap="round">
            <path d="M24 62 L20 72" /><path d="M36 60 L34 72" /><path d="M52 58 L54 72" /><path d="M62 60 L66 72" />
          </g>
          <path d="M14 62 L4 56" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      {art === 'golem' && (
        <g>
          <path d="M20 72 L18 34 L30 22 L50 22 L62 34 L60 72 Z" fill="#3B3125" stroke={c} strokeWidth="2" />
          <path d="M30 22 L34 40 L46 34 L50 22" fill="none" stroke="#E0913A" strokeWidth="1.6" opacity=".9" />
          <path d="M26 48 L40 56 L54 46" fill="none" stroke="#E0913A" strokeWidth="1.6" opacity=".7" />
          <circle cx="32" cy="34" r="3" fill="#E0913A" />
          <circle cx="48" cy="34" r="3" fill="#E0913A" />
          <path d="M8 40 L18 36 L18 60 L8 62 Z" fill="#3B3125" stroke={c} strokeWidth="1.5" />
          <path d="M72 40 L62 36 L62 60 L72 62 Z" fill="#3B3125" stroke={c} strokeWidth="1.5" />
        </g>
      )}
      {/* 떠도는 불씨 — 유일하게 접지하지 않는 적. 그림자를 작게 두어 부유를 표현한다. */}
      {art === 'wisp' && (
        <g>
          <path d="M40 20 Q52 38 50 50 Q48 62 40 64 Q32 62 30 50 Q28 38 40 20 Z" fill={c} opacity=".55" />
          <path d="M40 28 Q47 40 46 49 Q45 57 40 59 Q35 57 34 49 Q33 40 40 28 Z" fill={c} opacity=".9" />
          <circle cx="40" cy="47" r="3" fill="#FFF3C4" />
          <g stroke={c} strokeWidth="1.2" opacity=".5" fill="none">
            <path d="M22 40 Q18 50 24 58" /><path d="M58 40 Q62 50 56 58" />
          </g>
        </g>
      )}
      {/* 녹슨 파수병 — 방패로 정면을 막는 실루엣. 폭이 넓어 '뚫기 어렵다'가 읽혀야 한다. */}
      {art === 'warden' && (
        <g>
          <path d="M26 72 L24 36 L32 26 L48 26 L56 36 L54 72 Z" fill="#2E2A33" stroke={c} strokeWidth="2" />
          <path d="M33 26 L33 18 L47 18 L47 26" fill="#2E2A33" stroke={c} strokeWidth="1.6" />
          <circle cx="35" cy="35" r="2.4" fill={c} />
          <circle cx="45" cy="35" r="2.4" fill={c} />
          <path d="M6 34 L22 30 L22 66 L6 62 Z" fill="#2E2A33" stroke={c} strokeWidth="2" />
          <path d="M14 40 L14 56" stroke={c} strokeWidth="1.4" opacity=".7" />
          <path d="M60 30 L66 30 L64 70 L58 70 Z" fill="#2E2A33" stroke={c} strokeWidth="1.5" />
        </g>
      )}
      {/* 재의 망령 — 하반신이 흩어진다. 골렘/파수병과 달리 바닥에 닿는 선이 없다. */}
      {art === 'revenant' && (
        <g>
          <path d="M40 16 Q56 24 54 44 L50 66 Q45 72 40 66 Q35 72 30 66 L26 44 Q24 24 40 16 Z" fill={c} opacity=".7" />
          <path d="M31 30 Q40 24 49 30 Q40 34 31 30 Z" fill="#0A0810" opacity=".8" />
          <circle cx="34" cy="33" r="2.6" fill="#FFD5D5" />
          <circle cx="46" cy="33" r="2.6" fill="#FFD5D5" />
          <g stroke={c} strokeWidth="2" strokeLinecap="round" opacity=".85">
            <path d="M24 40 L10 52" /><path d="M56 40 L70 52" />
          </g>
          <path d="M30 60 Q40 68 50 60" fill="none" stroke={c} strokeWidth="1.2" opacity=".4" />
        </g>
      )}
      {/* 폭풍의 폭군 — 12층 보스. 골렘보다 크고 위로 뻗는다(뿔). */}
      {art === 'tyrant' && (
        <g>
          <path d="M18 72 L16 38 Q16 26 28 22 L52 22 Q64 26 64 38 L62 72 Z" fill="#241F2E" stroke={c} strokeWidth="2.2" />
          <path d="M26 22 L18 6 L34 18 Z" fill="#241F2E" stroke={c} strokeWidth="2" />
          <path d="M54 22 L62 6 L46 18 Z" fill="#241F2E" stroke={c} strokeWidth="2" />
          <path d="M28 34 L36 40 L28 44" fill="none" stroke="#C9B6FF" strokeWidth="2" />
          <path d="M52 34 L44 40 L52 44" fill="none" stroke="#C9B6FF" strokeWidth="2" />
          <path d="M30 56 Q40 64 50 56" fill="none" stroke="#C9B6FF" strokeWidth="1.8" opacity=".8" />
          <path d="M4 30 L16 40 L4 46" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M76 30 L64 40 L76 46" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
      {/* 타락한 세라프 — 유일하게 좌우로 넓게 펼쳐진다(날개). 광역 딜러임이 실루엣에 있다. */}
      {art === 'seraph' && (
        <g>
          <path d="M38 24 Q10 30 4 48 Q22 44 34 50 Z" fill={c} opacity=".55" />
          <path d="M42 24 Q70 30 76 48 Q58 44 46 50 Z" fill={c} opacity=".55" />
          <path d="M40 14 Q50 22 48 40 L45 62 Q40 68 35 62 L32 40 Q30 22 40 14 Z" fill="#241F2E" stroke={c} strokeWidth="1.8" />
          <path d="M33 28 Q40 23 47 28 Q40 32 33 28 Z" fill="#0A0810" opacity=".85" />
          <circle cx="36" cy="30" r="2.2" fill="#FFF3C4" />
          <circle cx="44" cy="30" r="2.2" fill="#FFF3C4" />
          {/* 부서진 후광 — 온전한 원이 아니다 */}
          <path d="M28 12 Q40 4 52 12" fill="none" stroke="#FFF3C4" strokeWidth="1.6" opacity=".8" />
        </g>
      )}
      {/* 무쇠 거상 — 상층 도발 담당. 가장 넓고 낮다(폭 56). 골렘보다 크게 읽혀야 한다. */}
      {art === 'colossus' && (
        <g>
          <path d="M12 72 L10 40 Q10 28 24 24 L56 24 Q70 28 70 40 L68 72 Z" fill="#2B2A2E" stroke={c} strokeWidth="2.4" />
          <path d="M24 24 L28 14 L52 14 L56 24 Z" fill="#2B2A2E" stroke={c} strokeWidth="1.8" />
          <rect x="26" y="36" width="28" height="20" fill="none" stroke={c} strokeWidth="1.6" opacity=".8" />
          <circle cx="33" cy="30" r="2.6" fill="#9FE6C4" />
          <circle cx="47" cy="30" r="2.6" fill="#9FE6C4" />
          {/* 양쪽 거대한 팔 — 방벽처럼 읽히도록 몸통보다 두껍게 */}
          <path d="M2 36 L12 32 L12 68 L2 64 Z" fill="#2B2A2E" stroke={c} strokeWidth="2" />
          <path d="M78 36 L68 32 L68 68 L78 64 Z" fill="#2B2A2E" stroke={c} strokeWidth="2" />
          <path d="M30 62 L50 62" stroke={c} strokeWidth="1.4" opacity=".6" />
        </g>
      )}
      {/* 심연의 원귀 — 망령의 상위. 갈고리 팔이 길게 뻗어 '방어를 찢는다'가 보인다. */}
      {art === 'wraith' && (
        <g>
          <path d="M40 12 Q58 20 56 42 L52 64 Q46 72 40 64 Q34 72 28 64 L24 42 Q22 20 40 12 Z" fill={c} opacity=".62" />
          <path d="M40 20 Q52 26 50 42 L47 60 Q43 66 40 60 Q37 66 33 60 L30 42 Q28 26 40 20 Z" fill="#0A0810" opacity=".55" />
          <circle cx="34" cy="34" r="2.8" fill="#8FE3FF" />
          <circle cx="46" cy="34" r="2.8" fill="#8FE3FF" />
          {/* 갈고리 — 끝이 꺾여 있다 */}
          <g stroke={c} strokeWidth="2.2" strokeLinecap="round" fill="none">
            <path d="M24 40 L8 50 L14 58" />
            <path d="M56 40 L72 50 L66 58" />
          </g>
          <path d="M32 56 Q40 62 48 56" fill="none" stroke="#8FE3FF" strokeWidth="1.2" opacity=".5" />
        </g>
      )}
      {/* 재의 군주 — 20층 보스. 폭군보다 크고, 뿔이 아니라 왕관이다(위로 5갈래). */}
      {art === 'sovereign' && (
        <g>
          <path d="M16 72 L14 36 Q14 22 28 18 L52 18 Q66 22 66 36 L64 72 Z" fill="#2A1C1C" stroke={c} strokeWidth="2.4" />
          {/* 왕관 — 폭군의 뿔 2개와 구분되도록 5갈래 */}
          <path d="M24 18 L20 2 L30 12 L40 0 L50 12 L60 2 L56 18 Z" fill="#2A1C1C" stroke={c} strokeWidth="2" />
          <circle cx="32" cy="34" r="3" fill="#FFB47A" />
          <circle cx="48" cy="34" r="3" fill="#FFB47A" />
          <path d="M28 48 L40 56 L52 48" fill="none" stroke="#FFB47A" strokeWidth="2" />
          <path d="M30 62 Q40 70 50 62" fill="none" stroke="#FFB47A" strokeWidth="1.8" opacity=".85" />
          {/* 좌우로 흘러내리는 화염 망토 */}
          <path d="M14 34 Q2 46 6 68 Q12 56 16 54" fill={c} opacity=".45" />
          <path d="M66 34 Q78 46 74 68 Q68 56 64 54" fill={c} opacity=".45" />
        </g>
      )}
      {/*
        재를 쓰는 왕 — 100층 전용. 군주와 **같은 왕좌 계보**지만 실루엣이 갈려야 한다.
        군주는 5갈래 왕관에 화염 망토, 이쪽은 **부서진 관과 흘러내리는 재**다.
        어깨를 가장 넓게(그림자 27) 잡아 최종 보스임을 크기로도 말한다.
      */}
      {art === 'ashking' && (
        <g>
          {/* 어깨가 벌어진 몸통 — 사다리꼴이라 군주의 직립 실루엣과 구분된다 */}
          <path d="M10 72 L16 34 Q22 20 40 18 Q58 20 64 34 L70 72 Z" fill="#1E1418" stroke={c} strokeWidth="2.6" />
          {/* 부서진 관 — 가운데가 꺾여 나갔다. 왕관이되 온전하지 않다 */}
          <path d="M22 18 L18 2 L28 11 L34 3 L38 12 L46 4 L50 13 L58 3 L58 18 Z" fill="#1E1418" stroke={c} strokeWidth="2" />
          <path d="M38 12 L42 6" stroke={c} strokeWidth="1.6" opacity=".7" />
          {/* 눈 — 군주(둥근 2점)와 달리 가늘게 그어 냉정함을 준다 */}
          <path d="M28 33 L36 35" stroke="#FFD9A0" strokeWidth="3" strokeLinecap="round" />
          <path d="M52 33 L44 35" stroke="#FFD9A0" strokeWidth="3" strokeLinecap="round" />
          {/* 가슴의 균열 — 안에서 불이 새어나온다 */}
          <path d="M40 44 L36 54 L42 58 L38 68" fill="none" stroke="#FFB47A" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M30 50 L26 60" fill="none" stroke="#FFB47A" strokeWidth="1.4" opacity=".7" />
          <path d="M50 50 L54 60" fill="none" stroke="#FFB47A" strokeWidth="1.4" opacity=".7" />
          {/* 흘러내리는 재 — 망토가 아니라 부스러져 떨어지는 결 */}
          <g stroke={c} strokeWidth="1.6" opacity=".5" strokeLinecap="round">
            <path d="M14 40 L8 58" /><path d="M10 48 L5 66" />
            <path d="M66 40 L72 58" /><path d="M70 48 L75 66" />
          </g>
        </g>
      )}
      {/* 주술을 엮는 자 — 팔이 길고 손끝에 실이 걸려 있다. 직접 때리지 않는 실루엣 */}
      {art === 'hexweaver' && (
        <g>
          <path d="M40 18 Q54 26 52 46 L48 66 Q44 72 40 66 Q36 72 32 66 L28 46 Q26 26 40 18 Z" fill={c} opacity=".6" />
          <path d="M32 30 Q40 25 48 30 Q40 34 32 30 Z" fill="#0A0810" opacity=".85" />
          <circle cx="35" cy="32" r="2.2" fill="#CFF3FF" />
          <circle cx="45" cy="32" r="2.2" fill="#CFF3FF" />
          {/* 긴 팔 + 실 */}
          <g stroke={c} strokeWidth="1.8" strokeLinecap="round" fill="none">
            <path d="M28 42 L10 56" /><path d="M52 42 L70 56" />
          </g>
          <g stroke="#CFF3FF" strokeWidth=".8" opacity=".5" fill="none">
            <path d="M10 56 Q26 66 40 60" /><path d="M70 56 Q54 66 40 60" />
          </g>
        </g>
      )}
      {/* 숲을 지키는 것 — 유일하게 위로 가지가 뻗는다. 회복하는 적임이 실루엣에 있다 */}
      {art === 'grovekeeper' && (
        <g>
          <path d="M24 72 L22 40 Q22 26 40 22 Q58 26 58 40 L56 72 Z" fill="#1B2A1E" stroke={c} strokeWidth="2" />
          {/* 가지 — 좌우 비대칭으로 자연물처럼 */}
          <g stroke={c} strokeWidth="2.2" strokeLinecap="round" fill="none">
            <path d="M32 24 Q26 10 16 6" /><path d="M40 22 Q42 8 38 2" /><path d="M48 24 Q56 12 66 10" />
          </g>
          <circle cx="18" cy="7" r="3" fill="#9FE6C4" opacity=".85" />
          <circle cx="38" cy="3" r="2.6" fill="#9FE6C4" opacity=".85" />
          <circle cx="65" cy="11" r="3" fill="#9FE6C4" opacity=".85" />
          <circle cx="34" cy="40" r="2.6" fill="#9FE6C4" />
          <circle cx="46" cy="40" r="2.6" fill="#9FE6C4" />
          <path d="M32 56 Q40 62 48 56" fill="none" stroke="#9FE6C4" strokeWidth="1.4" opacity=".6" />
        </g>
      )}
      {/* 역병을 나르는 것 — 부리 가면 + 등의 항아리. 도트 전문임을 소품으로 말한다 */}
      {art === 'plaguebearer' && (
        <g>
          <path d="M26 72 L24 38 Q24 26 40 22 Q56 26 56 38 L54 72 Z" fill="#231F2A" stroke={c} strokeWidth="1.9" />
          {/* 부리 */}
          <path d="M40 30 L58 40 L40 44 Z" fill="#2E2836" stroke={c} strokeWidth="1.4" />
          <circle cx="34" cy="33" r="2.4" fill="#B8FF9F" />
          {/* 등짐 항아리 — 연기가 오른다 */}
          <ellipse cx="20" cy="46" rx="8" ry="10" fill="#1A1620" stroke={c} strokeWidth="1.4" />
          <g stroke="#B8FF9F" strokeWidth="1.2" opacity=".55" fill="none">
            <path d="M20 36 Q16 30 20 24" /><path d="M24 36 Q28 30 24 24" />
          </g>
        </g>
      )}
      {/* 굶주린 큰늑대 — beast보다 길고 낮다. 등줄기가 솟아 있다 */}
      {art === 'direwolf' && (
        <g>
          <path d="M8 64 L18 40 L34 32 L58 36 L72 48 L68 64 L58 62 L54 50 L30 52 L22 66 Z" fill={c} opacity=".82" />
          {/* 등줄기 가시 */}
          <g stroke={c} strokeWidth="2" strokeLinecap="round">
            <path d="M28 34 L26 24" /><path d="M38 32 L37 21" /><path d="M48 34 L50 24" />
          </g>
          <path d="M58 36 L70 22 L72 40 Z" fill={c} />
          <circle cx="63" cy="40" r="2.4" fill="#FFD08A" />
          <g stroke={c} strokeWidth="2.6" strokeLinecap="round">
            <path d="M22 66 L18 74" /><path d="M34 62 L32 74" /><path d="M52 60 L54 74" /><path d="M64 62 L68 74" />
          </g>
          <path d="M8 64 L2 74" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}
      {/* 돌결의 감시자 — 몸 앞에 떠 있는 결계판. 보호막을 두르는 탱커 */}
      {art === 'stonewarden' && (
        <g>
          <path d="M24 72 L22 34 L32 24 L48 24 L58 34 L56 72 Z" fill="#2A2A30" stroke={c} strokeWidth="2.2" />
          <path d="M33 24 L33 16 L47 16 L47 24" fill="#2A2A30" stroke={c} strokeWidth="1.6" />
          <circle cx="34" cy="34" r="2.6" fill="#9FD8E6" />
          <circle cx="46" cy="34" r="2.6" fill="#9FD8E6" />
          {/* 결계판 — 육각. 이게 이 적의 정체성이다 */}
          <path d="M40 40 L54 48 L54 62 L40 70 L26 62 L26 48 Z" fill="none" stroke="#9FD8E6" strokeWidth="1.8" opacity=".75" />
          <path d="M40 46 L48 51 L48 60 L40 65 L32 60 L32 51 Z" fill="#9FD8E6" opacity=".14" />
        </g>
      )}
      {/* 잿빛 교주 — 보스. 후광이 온전한 원이다(세라프의 부서진 후광과 대비) */}
      {art === 'hierophant' && (
        <g>
          <circle cx="40" cy="14" r="13" fill="none" stroke="#CFE8FF" strokeWidth="1.6" opacity=".8" />
          <path d="M18 72 L20 36 Q22 22 40 18 Q58 22 60 36 L62 72 Z" fill="#1C2230" stroke={c} strokeWidth="2.2" />
          {/* 늘어진 소매 — 폭이 넓어 '때리는 보스'와 다르게 읽힌다 */}
          <path d="M20 40 Q6 52 10 70 L22 66 Z" fill="#1C2230" stroke={c} strokeWidth="1.6" />
          <path d="M60 40 Q74 52 70 70 L58 66 Z" fill="#1C2230" stroke={c} strokeWidth="1.6" />
          <circle cx="34" cy="32" r="2.6" fill="#CFE8FF" />
          <circle cx="46" cy="32" r="2.6" fill="#CFE8FF" />
          <path d="M40 44 L40 62 M32 52 L48 52" stroke="#CFE8FF" strokeWidth="1.8" opacity=".8" />
        </g>
      )}
      {/* 창궐의 주인 — 보스. 몸에서 포자가 퍼진다. 폭군의 뿔과 달리 둥글고 부푼 실루엣 */}
      {art === 'blightlord' && (
        <g>
          <path d="M14 72 Q10 40 40 18 Q70 40 66 72 Z" fill="#20261C" stroke={c} strokeWidth="2.4" />
          {/* 혹 — 좌우 비대칭 */}
          <circle cx="24" cy="40" r="9" fill="#2A3324" stroke={c} strokeWidth="1.4" />
          <circle cx="58" cy="46" r="7" fill="#2A3324" stroke={c} strokeWidth="1.4" />
          <circle cx="42" cy="30" r="6" fill="#2A3324" stroke={c} strokeWidth="1.4" />
          <circle cx="34" cy="52" r="3" fill="#B8FF9F" />
          <circle cx="48" cy="52" r="3" fill="#B8FF9F" />
          {/* 포자 */}
          <g fill="#B8FF9F" opacity=".55">
            <circle cx="16" cy="24" r="2" /><circle cx="66" cy="28" r="2" />
            <circle cx="8" cy="46" r="1.6" /><circle cx="72" cy="58" r="1.6" />
          </g>
          <path d="M30 64 Q40 70 50 64" fill="none" stroke="#B8FF9F" strokeWidth="1.6" opacity=".7" />
        </g>
      )}
      {/* 전열을 부르는 자 — 보스. 깃대를 세우고 있다. '버티는 보스'의 표식 */}
      {art === 'warcaller' && (
        <g>
          <path d="M22 72 L20 36 Q22 24 40 20 Q58 24 60 36 L58 72 Z" fill="#2A2438" stroke={c} strokeWidth="2.2" />
          <path d="M31 20 L29 10 L51 10 L49 20 Z" fill="#2A2438" stroke={c} strokeWidth="1.6" />
          <circle cx="34" cy="34" r="2.6" fill="#C9B6FF" />
          <circle cx="46" cy="34" r="2.6" fill="#C9B6FF" />
          {/* 군기 — 세로로 길게. 다른 보스에 없는 수직 요소다 */}
          <line x1="68" y1="8" x2="68" y2="72" stroke={c} strokeWidth="2.4" />
          <path d="M68 12 L48 18 L68 26 Z" fill="#C9B6FF" opacity=".7" />
          <path d="M30 50 L50 50" stroke="#C9B6FF" strokeWidth="1.8" opacity=".8" />
          <path d="M32 60 Q40 66 48 60" fill="none" stroke="#C9B6FF" strokeWidth="1.4" opacity=".6" />
        </g>
      )}
    </svg>
  );
}
