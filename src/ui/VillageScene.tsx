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

/**
 * 마을에서 고를 수 있는 자리.
 *
 * 시설 4종(숙소·훈련소·합성소·무기창고)이 **전부 개별 건물**이다.
 * 예전에는 '여관·시설' 하나에 4종이 숨어 있어서, 마을을 봐도 무엇을
 * 지을 수 있는지 알 수 없었다 — 배치도의 목적에 어긋난다.
 */
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
const H = 470;

/**
 * 건물이 두 줄로 선다 — 시설 4종 + 상점 + 무덤을 한 줄에 넣으면
 * 폭 375px에서 라벨이 서로 겹친다(부감도 시절에 이미 겪었다).
 * 뒷줄은 언덕 위, 앞줄은 지면. 원근이 생겨 마을이 깊어 보이는 부수 효과도 있다.
 */
const BACK_Y = 286;
const GROUND_Y = 384;

/** 각 줄의 라벨 높이 — 건물 바로 아래. */
const BACK_LABEL_Y = 306;
const FRONT_LABEL_Y = 420;

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
        <path d="M0 226 L64 150 L128 226 Z" fill={V.ridgeFar} />
        <path d="M92 226 L170 140 L248 226 Z" fill={V.ridgeFar} />

        {/* 뒷줄 언덕 */}
        <rect x="0" y="226" width={W} height={GROUND_Y - 226} fill={V.ridgeNear} />
        <rect x="0" y={BACK_Y} width={W} height="4" fill={V.ground} opacity=".5" />

        {/* 앞줄 지면 */}
        <rect x="0" y={GROUND_Y} width={W} height={H - GROUND_Y} fill={V.ground} />
        <rect x="0" y={GROUND_Y} width={W} height="5" fill={V.groundEdge} />

        <Tower x={352} locked={towerLocked} />

        {/*
          ── 뒷줄 (언덕) ────────────────────────────────
          소환 제단이 중앙. 좌우로 훈련소·합성소.
          탑(x=352)과 겹치지 않도록 x는 300을 넘지 않는다.
        */}
        <House x={64} y={BACK_Y} w={62} h={42} roof="flat" roofColor={V.roofWarm} level={facilities.training ?? 0} windowColor={V.window} />
        <Altar x={172} y={BACK_Y} />
        <House x={272} y={BACK_Y} w={62} h={42} roof="gable" roofColor={V.roofCool} level={facilities.forge ?? 0} windowColor={V.windowAlt} />

        {/*
          ── 앞줄 (지면) ────────────────────────────────
          무덤 · 숙소 · 무기창고 · 상점.
        */}
        <Graveyard x={38} y={GROUND_Y} deaths={deathCount} />
        <House x={124} y={GROUND_Y} w={70} h={54} roof="gable" roofColor={V.roofCool} level={facilities.rest ?? 0} windowColor={V.windowAlt} />
        <House x={216} y={GROUND_Y} w={70} h={54} roof="gable" roofColor={V.roofWarm} level={facilities.armory ?? 0} windowColor={V.window} />
        {/* 상점 — 레벨 개념이 없으므로 항상 같은 모습 */}
        <House x={306} y={GROUND_Y} w={62} h={44} roof="awning" roofColor={V.roofShop} level={1} windowColor={V.windowShop} />
      </svg>

      {/*
        라벨은 SVG 밖 버튼이다. 안에 넣으면 터치 타깃이 그림 크기에 묶여 44px을 못 지킨다.
        퍼센트 배치라 뷰포트가 달라져도 그림 위 같은 자리에 남는다.
      */}
      <Label spot="tower" x={352} y={34} text="탑 입장" />

      {/* 뒷줄 라벨 */}
      <Label spot="training" x={64} y={BACK_LABEL_Y} text="훈련소" />
      <Label spot="summon" x={172} y={BACK_LABEL_Y} text="소환 제단" />
      <Label spot="forge" x={272} y={BACK_LABEL_Y} text="합성소" />

      {/* 앞줄 라벨 */}
      <Label spot="grave" x={38} y={FRONT_LABEL_Y} text="무덤" />
      <Label spot="rest" x={124} y={FRONT_LABEL_Y} text="숙소" />
      <Label spot="armory" x={216} y={FRONT_LABEL_Y} text="무기창고" />
      <Label spot="shop" x={306} y={FRONT_LABEL_Y} text="상점" />
    </div>
  );
}
