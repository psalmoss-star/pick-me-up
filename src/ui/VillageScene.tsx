import { V, T } from './tokens';
import { FACILITY_MAX_LEVEL, type FacilityKind } from '../game/data/facilities';

/**
 * 마을 사이드뷰 — 대기실의 주 화면.
 *
 * ── 왜 부감도가 아니라 사이드뷰인가 ───────────────────
 * 부감도(BaseMap)는 시설을 '장소'로 만들었지만 여전히 배치도에 가까웠다.
 * 사이드뷰는 지평선·하늘·달이 생기면서 **거점이 세계 안에 있다**는 인상을 만든다.
 * 방치형 게임이 대부분 이 구도를 쓰는 이유이기도 하다.
 *
 * ── 탑이 오른쪽에 서 있다 ─────────────────────────────
 * 이 게임의 목적은 등반이다. 마을 오른쪽 끝에 탑을 세워 **항상 보이게** 두고,
 * 거기에 '탑 입장'을 붙인다. 목적지가 화면에 늘 있는 것과 버튼 목록에 있는 것은 다르다.
 *
 * ── 레벨은 여전히 구조로 ──────────────────────────────
 * 시설 레벨이 오르면 창문이 늘고 지붕이 자란다(CLAUDE.md 등급 규칙의 연장).
 * 색만 바꾸면 Lv.1과 Lv.3이 구분되지 않는다.
 */

/** 마을에서 고를 수 있는 자리. */
export type VillageSpot = FacilityKind | 'grave' | 'summon' | 'shop' | 'tower';

export interface VillageSceneProps {
  facilities: Record<FacilityKind, number>;
  onSelect: (spot: VillageSpot) => void;
  /** 잃은 영웅 수 — 무덤 비석 개수 */
  deathCount?: number;
  /** 탑 입장 가능 여부. 파티가 비었거나 등반이 끝나면 잠긴다 */
  towerLocked?: boolean;
}

/**
 * viewBox — 버튼 퍼센트 배치의 분모이기도 하다.
 *
 * ⚠️ 라벨 행(y=422)까지 들어가야 하므로 H는 그보다 충분히 커야 한다.
 * 처음에 500으로 뒀다가 지면 아래 빈 보라 영역이 90px 남았다.
 */
const W = 400;
const H = 450;

/** 지면 높이 — 건물들이 이 선 위에 선다. */
const GROUND_Y = 360;

/** 건물 라벨이 놓이는 줄 — 지면 안쪽. */
const LABEL_Y = 402;

/**
 * 건물 한 채. 레벨에 따라 창문이 늘어난다.
 * (x, y)는 **바닥 중앙**이라 높이가 달라져도 접지선이 유지된다.
 */
function House({
  x, y, w, h, roof, roofColor, level, windowColor,
}: {
  x: number; y: number; w: number; h: number;
  roof: 'gable' | 'flat' | 'awning';
  roofColor: string; level: number; windowColor: string;
}) {
  /*
    창문은 레벨만큼 늘어난다. 다만 **Lv.0에도 창 하나는 켠다** —
    이 게임은 시설이 전부 Lv.0인 상태로 시작하므로, 0개로 두면
    새 런의 마을이 통째로 불 꺼진 폐허처럼 보인다(실제로 그렇게 보였다).
    레벨 차이는 창 개수(1→3)와 만렙 깃발로 여전히 읽힌다.
  */
  const windows = Math.min(3, level + 1);

  return (
    <g>
      {/* 벽 — 항상 같은 밝기. 어둡게 두면 건물 자체가 안 보인다 */}
      <rect x={x - w / 2} y={y - h} width={w} height={h} fill={V.wall} rx="2" />

      {roof === 'gable' && (
        <path d={`M${x - w / 2 - 6} ${y - h} L${x} ${y - h - 26} L${x + w / 2 + 6} ${y - h} Z`} fill={roofColor} />
      )}
      {roof === 'flat' && (
        <rect x={x - w / 2 - 5} y={y - h - 10} width={w + 10} height={10} fill={roofColor} rx="2" />
      )}
      {roof === 'awning' && (
        <>
          <rect x={x - w / 2 - 6} y={y - h - 14} width={w + 12} height={14} fill={roofColor} rx="2" />
          {/* 차양 줄무늬 — 상점이 상점으로 읽히게 */}
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={x - w / 2 - 6 + i * ((w + 12) / 4)} y={y - h - 14} width={(w + 12) / 8} height={14} fill="#F2E7DA" opacity=".55" />
          ))}
        </>
      )}

      {/* 창 — 레벨이 오르면 불이 하나씩 켜진다 */}
      {Array.from({ length: windows }).map((_, i) => (
        <rect
          key={i}
          x={x - w / 2 + 8 + i * 20}
          y={y - h + 14}
          width={14} height={16}
          fill={windowColor}
          rx="2"
        />
      ))}

      {/* 만렙 표식 — 지붕 위 작은 깃발. 구조로 만렙을 말한다 */}
      {level >= FACILITY_MAX_LEVEL && (
        <g>
          <line x1={x} y1={y - h - 26} x2={x} y2={y - h - 42} stroke={T.gold} strokeWidth="2" />
          <path d={`M${x} ${y - h - 42} L${x + 14} ${y - h - 37} L${x} ${y - h - 32} Z`} fill={T.gold} />
        </g>
      )}
    </g>
  );
}

/** 소환 제단 — 건물이 아니다. 기둥 + 상징 원. */
function Altar({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 44} y={y - 18} width={88} height={18} fill={V.wallDark} rx="2" />
      <rect x={x - 34} y={y - 74} width={12} height={56} fill={V.wall} />
      <rect x={x + 22} y={y - 74} width={12} height={56} fill={V.wall} />
      <rect x={x - 44} y={y - 86} width={88} height={14} fill={V.wall} rx="2" />
      {/* 소환진 — 이 자리가 '무언가 나오는 곳'임을 말한다 */}
      <circle cx={x} cy={y - 44} r={26} fill="none" stroke={V.accent} strokeWidth="3" />
      <circle cx={x} cy={y - 44} r={11} fill={V.accent} opacity=".9" />
      <line x1={x - 26} y1={y - 44} x2={x + 26} y2={y - 44} stroke={V.accent} strokeWidth="2.5" />
      <line x1={x} y1={y - 70} x2={x} y2={y - 18} stroke={V.accent} strokeWidth="2.5" />
    </g>
  );
}

/**
 * 무덤 — 자라지 않는다. 비석만 늘어난다.
 * 시설과 같은 상자로 그리면 "지을 수 있는 것"으로 읽히므로 실루엣을 분리한다.
 */
function Graveyard({ x, y, deaths }: { x: number; y: number; deaths: number }) {
  const stones = Math.min(3, deaths);
  return (
    <g>
      {Array.from({ length: Math.max(1, stones) }).map((_, i) => {
        const sx = x - 18 + i * 18;
        const faded = stones === 0;
        return (
          <path
            key={i}
            d={`M${sx - 7} ${y} L${sx - 7} ${y - 16} Q${sx} ${y - 26} ${sx + 7} ${y - 16} L${sx + 7} ${y} Z`}
            fill={V.wallDark}
            opacity={faded ? 0.4 : 1}
          />
        );
      })}
      {deaths > stones && (
        <text x={x + 30} y={y - 4} fill={T.dim} fontSize="11">외 {deaths - stones}</text>
      )}
    </g>
  );
}

/** 탑 — 오른쪽 끝. 등반 목적지라 항상 보인다. */
function Tower({ x, locked }: { x: number; locked: boolean }) {
  const top = 60;
  return (
    <g opacity={locked ? 0.55 : 1}>
      <rect x={x - 30} y={top} width={60} height={GROUND_Y - top} fill={V.tower} />
      <rect x={x - 30} y={top} width={16} height={GROUND_Y - top} fill={V.towerDark} />
      {/* 첨탑 */}
      <path d={`M${x - 38} ${top} L${x} ${top - 46} L${x + 38} ${top} Z`} fill={V.tower} />
      {/* 층 창문 — 위로 이어지는 느낌을 만든다 */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={x - 9} y={top + 46 + i * 62} width={18} height={30} fill={V.accent} rx="9" opacity=".85" />
      ))}
    </g>
  );
}

export function VillageScene({
  facilities, onSelect, deathCount = 0, towerLocked = false,
}: VillageSceneProps) {
  /** 라벨 버튼 — SVG 밖 HTML이라 44px 터치 타깃을 지킬 수 있다. */
  const Label = ({ spot, x, y, text }: { spot: VillageSpot; x: number; y: number; text: string }) => (
    <button
      onClick={() => onSelect(spot)}
      style={{
        position: 'absolute',
        left: `${(x / W) * 100}%`,
        top: `${(y / H) * 100}%`,
        transform: 'translate(-50%, -50%)',
        minHeight: 34,
        padding: '7px 14px',
        background: V.label,
        border: 'none',
        borderRadius: 999,
        color: T.text,
        fontFamily: 'inherit',
        fontSize: 13,
        letterSpacing: '.02em',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </button>
  );

  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      {/*
        `none` — 비율을 버리고 컨테이너를 정확히 채운다.

        ⚠️ `slice`를 먼저 썼다가 **탑이 오른쪽 밖으로 잘렸다.** 이 게임에서 탑은
        목적지라 절대 잘리면 안 된다. `meet`은 반대로 아래에 빈 공간을 남긴다.
        마을은 사진이 아니라 도형이라 약간의 세로 늘어남은 눈에 띄지 않는다 —
        전부 보이는 쪽이 비율보다 중요하다.
        (라벨은 HTML이고 %로 배치되므로 어떤 모드에서도 같은 자리에 남는다.)
      */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="villageSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={V.skyTop} />
            <stop offset="100%" stopColor={V.skyBottom} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={W} height={H} fill="url(#villageSky)" />

        {/* 달 — 초승달. 원 두 개를 겹쳐 만든다(마스크 없이) */}
        <path d="M330 78 A30 30 0 1 1 300 48 A24 24 0 1 0 330 78 Z" fill={V.moon} opacity=".92" />

        {/* 먼 산 — 지평선을 만들어 '세계 안'이라는 인상을 준다 */}
        <path d="M0 285 L70 190 L140 285 Z" fill={V.ridgeFar} />
        <path d="M96 285 L186 180 L276 285 Z" fill={V.ridgeFar} />
        <rect x="0" y="285" width={W} height={GROUND_Y - 285} fill={V.ridgeNear} />

        {/* 지면 */}
        <rect x="0" y={GROUND_Y} width={W} height={H - GROUND_Y} fill={V.ground} />
        <rect x="0" y={GROUND_Y} width={W} height="5" fill={V.groundEdge} />

        <Tower x={348} locked={towerLocked} />

        {/*
          소환 제단 — 건물들보다 **뒤·위**에 둔다(먼저 그려 뒤에 깔림).
          같은 x에 집과 겹치면 가려지므로 지면보다 60px 위 언덕에 세운다.
        */}
        <Altar x={196} y={GROUND_Y - 60} />

        {/* 무덤 — 마을 왼쪽 끝 */}
        <Graveyard x={40} y={GROUND_Y} deaths={deathCount} />

        {/* 대장간 — 무기창고(armory) 자리 */}
        <House x={116} y={GROUND_Y} w={74} h={58} roof="gable" roofColor={V.roofWarm} level={facilities.armory ?? 0} windowColor={V.window} />
        {/* 여관·시설 — 숙소(rest) 자리 */}
        <House x={212} y={GROUND_Y} w={70} h={48} roof="gable" roofColor={V.roofCool} level={facilities.rest ?? 0} windowColor={V.windowAlt} />
        {/* 상점 — 차양. 레벨 개념이 없으므로 항상 Lv.1 모습 */}
        <House x={302} y={GROUND_Y} w={64} h={44} roof="awning" roofColor={V.roofShop} level={1} windowColor={V.windowShop} />
      </svg>

      {/*
        라벨은 SVG 밖 버튼이다. 안에 넣으면 터치 타깃이 그림 크기에 묶여 44px을 못 지킨다.
        퍼센트 배치라 뷰포트가 달라져도 그림 위 같은 자리에 남는다.
      */}
      <Label spot="tower" x={348} y={36} text="탑 입장" />
      <Label spot="summon" x={196} y={222} text="소환 제단" />
      {/*
        건물 라벨은 한 줄로 정렬한다. 무덤만 다른 높이에 두면 시선이 튀고,
        실제로 지붕과 겹쳐 글자가 읽히지 않았다.
      */}
      <Label spot="grave" x={40} y={LABEL_Y} text="무덤" />
      <Label spot="armory" x={116} y={LABEL_Y} text="대장간" />
      <Label spot="rest" x={212} y={LABEL_Y} text="여관·시설" />
      <Label spot="shop" x={306} y={LABEL_Y} text="상점" />
    </div>
  );
}
