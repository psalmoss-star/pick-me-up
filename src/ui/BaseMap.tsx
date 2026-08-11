import { T } from './tokens';
import { FACILITY_MAX_LEVEL, type FacilityKind } from '../game/data/facilities';

/**
 * 거점 부감 맵 — gdd-v2 §2.2의 "시설 배치도가 메인 화면".
 *
 * ── 왜 목록형 대신 이걸 두는가 ─────────────────────────
 * 목록형 화면도 동작은 한다. 다만 시설이 **장소**로 읽히지 않아서
 * "대기실에 산다"는 감각이 없었다. 부감 맵은 정보량이 같아도 공간을 만든다.
 *
 * ── 왜 game/이 아니라 ui/인가 ──────────────────────────
 * 배치 좌표는 밸런스가 아니라 그림이다. `src/game/`은 아트를 몰라야 한다
 * (artMap.ts와 같은 원칙). 시설 종류·레벨만 받고 나머지는 여기서 정한다.
 *
 * ── 레벨을 색이 아니라 구조로 ─────────────────────────
 * 등급 표현 규칙(CLAUDE.md)을 시설에도 적용한다. Lv.0은 터만 있고,
 * 레벨이 오를수록 건물이 실제로 **자란다**(높이·지붕·굴뚝·깃발).
 * 색만 바꾸면 Lv.1과 Lv.3이 구분되지 않는다.
 */

/** 부감 맵에서 고를 수 있는 자리. 무덤은 시설이 아니지만 같은 공간에 산다. */
export type BaseMapSpot = FacilityKind | 'grave';

/** 무덤 자리 — 광장 위. 시설(y=92)과 겹치지 않도록 충분히 띄운다. */
const GRAVE = { x: 160, y: 46 };

export interface BaseMapProps {
  facilities: Record<FacilityKind, number>;
  /** 탭하면 해당 자리로. 없으면 표시 전용 */
  onSelect?: (spot: BaseMapSpot) => void;
  /** 강조할 자리 (선택 상태) */
  selected?: BaseMapSpot | null;
  /** 잃은 영웅 수. 0이면 비석이 서지 않는다 */
  deathCount?: number;
}

/**
 * 배치 — viewBox 320×200 기준. (x, y)는 **바닥 중앙**이다.
 *
 * ⚠️ 건물은 위로 자란다(Lv.3 + 깃발이면 바닥에서 약 80px). 위아래로 마주보는 칸은
 * 그만큼 벌려야 아래 칸의 지붕이 위 칸을 침범하지 않는다.
 * 처음에 y=78 / y=146으로 뒀다가 숙소와 합성소가 겹쳐 이름표가 가려졌다.
 */
const SPOT: Record<FacilityKind, { x: number; y: number; label: string }> = {
  rest: { x: 66, y: 92, label: '숙소' },
  training: { x: 254, y: 92, label: '훈련소' },
  forge: { x: 66, y: 186, label: '합성소' },
  armory: { x: 254, y: 186, label: '무기창고' },
};

const ORDER: FacilityKind[] = ['rest', 'training', 'forge', 'armory'];

/**
 * 건물 한 채. level 0~3에 따라 실제로 자란다.
 * 좌표는 (x, y)를 **바닥 중앙**으로 잡는다 — 높이가 달라져도 접지선이 유지된다.
 */
function Building({
  kind, x, y, level, dim,
}: { kind: FacilityKind; x: number; y: number; level: number; dim: boolean }) {
  const built = level > 0;
  /**
   * 레벨당 높이 증가. Lv.0은 터(기단)만 남는다.
   *
   * ⚠️ 총 높이가 배치 간격을 넘으면 아래 칸 건물이 위 칸 이름표를 덮는다.
   * 최악(Lv.3): 벽 41 + 뾰족지붕 12 + 깃대 13 = **66px**.
   * 상하 간격이 94px이므로 이름표(기단+21) 자리까지 여유가 남는다.
   * 벽 높이를 키우려면 SPOT의 y 간격도 같이 벌릴 것.
   */
  const h = built ? 23 + level * 6 : 8;
  const w = 44;
  const line = built ? (level >= FACILITY_MAX_LEVEL ? T.gold : T.frame) : T.dim;
  const fill = built ? '#171226' : '#0D0B14';
  const op = dim ? 0.45 : 1;

  return (
    <g opacity={op} style={{ transition: 'opacity 200ms' }}>
      {/* 기단 — 미건설이어도 자리는 보인다. '지을 곳이 있다'가 읽혀야 한다 */}
      <ellipse cx={x} cy={y + 4} rx={w / 2 + 6} ry={7} fill="#000" opacity=".45" />
      <rect x={x - w / 2 - 4} y={y} width={w + 8} height={6} fill="#100D18" stroke={line} strokeWidth="1" opacity={built ? 1 : 0.7} />

      {built && (
        <>
          <rect x={x - w / 2} y={y - h} width={w} height={h} fill={fill} stroke={line} strokeWidth="1.4" />
          {/* 지붕 — Lv.2부터 뾰족해진다 */}
          {level >= 2 ? (
            <path d={`M${x - w / 2 - 3} ${y - h} L${x} ${y - h - 12} L${x + w / 2 + 3} ${y - h} Z`} fill="#1E1730" stroke={line} strokeWidth="1.4" />
          ) : (
            <rect x={x - w / 2 - 3} y={y - h - 5} width={w + 6} height={5} fill="#1E1730" stroke={line} strokeWidth="1.2" />
          )}
          {/* 창 — 레벨만큼 늘어난다. 불이 켜져 있다 = 사람이 산다 */}
          {Array.from({ length: level }).map((_, i) => (
            <rect
              key={i}
              x={x - 13 + i * 12} y={y - h + 9}
              width={7} height={9}
              fill={T.amber} opacity=".72"
            />
          ))}
          {/* 만렙 깃발 — 구조로 만렙을 말한다 */}
          {level >= FACILITY_MAX_LEVEL && (
            <g>
              <line x1={x} y1={y - h - 12} x2={x} y2={y - h - 25} stroke={T.gold} strokeWidth="1.4" />
              <path d={`M${x} ${y - h - 25} L${x + 13} ${y - h - 21} L${x} ${y - h - 17} Z`} fill={T.gold} opacity=".9" />
            </g>
          )}
          {/* 시설별 표식 — 같은 상자 4개로 보이지 않게 */}
          {kind === 'forge' && <circle cx={x} cy={y - 11} r={4} fill={T.amber} opacity=".8" />}
          {kind === 'armory' && <path d={`M${x - 5} ${y - 7} L${x} ${y - 17} L${x + 5} ${y - 7} Z`} fill={line} opacity=".75" />}
          {kind === 'training' && <path d={`M${x - 6} ${y - 8} L${x + 6} ${y - 8}`} stroke={line} strokeWidth="2" opacity=".75" />}
          {kind === 'rest' && <path d={`M${x - 5} ${y - 8} Q${x} ${y - 15} ${x + 5} ${y - 8}`} fill="none" stroke={line} strokeWidth="1.6" opacity=".75" />}
        </>
      )}
    </g>
  );
}

/**
 * 무덤 — 시설이 아니다.
 *
 * `Building`을 재사용하지 않는 이유: 같은 상자로 그리면 "지을 수 있는 것"으로 읽히고
 * 레벨·비용을 기대하게 된다. 무덤은 **자라지 않는다** — 대신 비석이 늘어난다.
 * 사망자가 0이면 터만 보인다(미건설 시설과 같은 표현).
 */
function Grave({ x, y, deaths, dim }: { x: number; y: number; deaths: number; dim: boolean }) {
  // 비석은 최대 3개까지만. 27명을 다 그리면 그림이 무너진다.
  const stones = Math.min(3, deaths);
  const line = deaths > 0 ? T.frame : T.dim;

  return (
    <g opacity={dim ? 0.45 : 1} style={{ transition: 'opacity 200ms' }}>
      <ellipse cx={x} cy={y + 4} rx={30} ry={6} fill="#000" opacity=".45" />
      <rect x={x - 26} y={y} width={52} height={5} fill="#100D18" stroke={line} strokeWidth="1" opacity={deaths > 0 ? 1 : 0.7} />
      {Array.from({ length: stones }).map((_, i) => {
        const sx = x - 16 + i * 16;
        return (
          <g key={i}>
            {/* 비석 — 위가 둥근 판. 높이 20px로 낮게 유지한다(위 칸 침범 방지) */}
            <path
              d={`M${sx - 5} ${y} L${sx - 5} ${y - 13} Q${sx} ${y - 20} ${sx + 5} ${y - 13} L${sx + 5} ${y} Z`}
              fill="#171226" stroke={line} strokeWidth="1.2"
            />
          </g>
        );
      })}
      {deaths > stones && (
        <text x={x + 30} y={y - 2} fill={T.dim} fontSize="9">외 {deaths - stones}</text>
      )}
    </g>
  );
}

export function BaseMap({ facilities, onSelect, selected, deathCount = 0 }: BaseMapProps) {
  return (
    <div style={{ position: 'relative', border: `1px solid ${T.panelHi}`, background: '#08070C', overflow: 'hidden' }}>
      <svg viewBox="0 0 320 216" style={{ display: 'block', width: '100%' }} aria-hidden="true">
        <defs>
          <radialGradient id="baseGlow" cx="50%" cy="46%" r="62%">
            <stop offset="0%" stopColor="#1A1428" />
            <stop offset="100%" stopColor="#07060B" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="320" height="216" fill="url(#baseGlow)" />

        {/* 광장 — 시설들이 둘러싸는 중심. 여기가 '대기실'이다 */}
        <ellipse cx="160" cy="140" rx="52" ry="24" fill="#0E0B16" stroke={T.panelHi} strokeWidth="1" />
        <ellipse cx="160" cy="140" rx="36" ry="15" fill="none" stroke={T.panelHi} strokeWidth="1" opacity=".7" />
        <text x="160" y="144" textAnchor="middle" fill={T.dim} fontSize="10" letterSpacing="4">광장</text>

        {/*
          길 — 광장에서 각 시설 '바닥'으로. 공간이라는 인상을 만드는 건 대부분 이것이다.
          점선으로 두어 건물 실루엣과 경쟁하지 않게 한다(실선이면 그림이 어수선해진다).
        */}
        {ORDER.map((k) => (
          <line
            key={k}
            x1="160" y1="140" x2={SPOT[k].x} y2={SPOT[k].y}
            stroke={T.panelHi} strokeWidth="1.4" strokeDasharray="3 4" opacity=".9"
          />
        ))}

        {/* 광장 → 무덤 길 */}
        <line
          x1="160" y1="140" x2={GRAVE.x} y2={GRAVE.y}
          stroke={T.panelHi} strokeWidth="1.4" strokeDasharray="3 4" opacity=".9"
        />

        {ORDER.map((k) => (
          <Building
            key={k}
            kind={k}
            x={SPOT[k].x}
            y={SPOT[k].y}
            level={facilities[k] ?? 0}
            dim={!!selected && selected !== k}
          />
        ))}

        {/* 이름표는 기단 바로 아래. 하단 행이 viewBox(216) 안에 들어오도록 y를 186으로 잡았다 */}
        {ORDER.map((k) => (
          <text
            key={k}
            x={SPOT[k].x} y={SPOT[k].y + 21}
            textAnchor="middle"
            fill={selected === k ? T.gold : T.dim}
            fontSize="10"
            letterSpacing="1"
          >
            {SPOT[k].label}
          </text>
        ))}

        <Grave x={GRAVE.x} y={GRAVE.y} deaths={deathCount} dim={!!selected && selected !== 'grave'} />
        <text
          x={GRAVE.x} y={GRAVE.y + 19}
          textAnchor="middle"
          fill={selected === 'grave' ? T.gold : T.dim}
          fontSize="10" letterSpacing="1"
        >
          무덤
        </text>
      </svg>

      {/*
        탭 영역을 SVG 밖 버튼으로 둔다.
        SVG 안에 넣으면 터치 타깃이 그림 크기에 묶여 44px을 못 지킨다.
        퍼센트 배치라 뷰포트가 달라져도 그림 위 같은 자리에 남는다.
      */}
      {onSelect && ORDER.map((k) => (
        <button
          key={k}
          onClick={() => onSelect(k)}
          aria-label={`${SPOT[k].label} (Lv.${facilities[k] ?? 0})`}
          style={{
            position: 'absolute',
            // viewBox 높이(216)로 나눈다 — 여기가 SVG와 어긋나면 버튼이 그림에서 밀린다
            left: `${(SPOT[k].x / 320) * 100}%`,
            top: `${(SPOT[k].y / 216) * 100}%`,
            transform: 'translate(-50%, -70%)',
            width: 72, height: 56,
            minWidth: 44, minHeight: 44,
            background: 'transparent',
            border: selected === k ? `1px solid ${T.gold}` : '1px solid transparent',
            cursor: 'pointer',
            padding: 0,
          }}
        />
      ))}

      {onSelect && (
        <button
          onClick={() => onSelect('grave')}
          aria-label={`무덤 (잃은 영웅 ${deathCount})`}
          style={{
            position: 'absolute',
            left: `${(GRAVE.x / 320) * 100}%`,
            top: `${(GRAVE.y / 216) * 100}%`,
            transform: 'translate(-50%, -70%)',
            width: 72, height: 56,
            minWidth: 44, minHeight: 44,
            background: 'transparent',
            border: selected === 'grave' ? `1px solid ${T.gold}` : '1px solid transparent',
            cursor: 'pointer',
            padding: 0,
          }}
        />
      )}
    </div>
  );
}
