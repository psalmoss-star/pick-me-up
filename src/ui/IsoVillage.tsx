import { useEffect, useRef, useState } from 'react';
import { ISO, T } from './tokens';
import { TOUCH_MIN } from './Button';
import { iso, pts, depth, OX, projectPin, type Pt, type VillageSpot } from './iso';
import { FACILITY_MAX_LEVEL, type FacilityKind } from '../game/data/facilities';

/**
 * 마을 아이소메트릭 부감도 — 대기실의 주 화면.
 *
 * ── 왜 사이드뷰에서 갈아탔나 ──────────────────────────
 * 사이드뷰는 건물을 **한 줄로** 세워야 해서 폭 390px에 6채가 한계였고,
 * 라벨이 서로 밀어내 두 줄로 나눠야 했다. 아이소메트릭은 같은 폭에
 * 안쪽으로 깊이가 생겨 **같은 면적에 더 많은 건물**이 들어간다.
 *
 * ── 그리기 순서가 곧 깊이다 ───────────────────────────
 * SVG에는 z-index가 없다. `depth()`(=x+y)로 정렬해 뒤에서 앞으로 그린다.
 * 이걸 빠뜨리면 뒤 건물이 앞 건물 위에 얹혀 입체가 무너진다.
 *
 * ── 레벨은 색이 아니라 구조로 ─────────────────────────
 * CLAUDE.md의 등급 규칙을 시설에도 적용한다. 레벨이 오르면 **층이 쌓이고**
 * 창이 늘고 만렙에 깃발이 선다. 색만 바꾸면 Lv.1과 Lv.3이 구분되지 않는다.
 */

/**
 * viewBox — **폰 세로 비율에 맞춘다**(390 : 785 ≈ 1 : 2).
 *
 * ⚠️ 처음에 390×420(가로에 가까운 비율)으로 두고 폰에서 봤더니
 * **섬 아래 385px이 검게 비었다.** 비율이 화면과 다르면 남는 쪽이 버려진다.
 * 세로로 길게 잡아 화면 비율에 가깝게 만들면 `slice`가 잘라내는 양도 최소가 된다.
 *
 * 섬은 이 안에서 위쪽 절반에 놓이고(OY), 아래는 바위와 하늘이 이어진다.
 */
const W = 390;
const H = 760;

/**
 * 섬 격자 크기.
 *
 * ⚠️ 예전 주석은 "8×8이면 시설 8개가 라벨 겹침 없이 들어간다(실측)"였는데,
 * 그 문장이 **"8개가 상한"으로 잘못 읽힌다.** 실제로는 여유 있는 자리가 훨씬 많다
 * (모험 관문을 9번째로 넣을 때 재서 확인했다). 몇 개가 들어가는지는 주석이 아니라
 * `iso.test.ts`의 겹침 테스트가 판정한다.
 */
const GRID = 8;

/** 사각 기둥 하나 — 윗면·오른면·왼면 3개로 입체를 만든다. */
function Box({
  x, y, w, d, h, z0 = 0, top, right, left, opacity = 1,
}: {
  x: number; y: number; w: number; d: number; h: number; z0?: number;
  top: string; right: string; left: string; opacity?: number;
}) {
  const zt = z0 + h;
  const A = iso(x, y, zt);
  const B = iso(x + w, y, zt);
  const C = iso(x + w, y + d, zt);
  const D = iso(x, y + d, zt);
  const B0 = iso(x + w, y, z0);
  const C0 = iso(x + w, y + d, z0);
  const D0 = iso(x, y + d, z0);

  return (
    <g opacity={opacity}>
      {/* 오른면 → 왼면 → 윗면 순. 윗면을 마지막에 둬야 모서리가 깔끔하다 */}
      <polygon points={pts([B, C, C0, B0])} fill={right} stroke={ISO.outline} strokeWidth=".8" strokeLinejoin="round" />
      <polygon points={pts([D, C, C0, D0])} fill={left} stroke={ISO.outline} strokeWidth=".8" strokeLinejoin="round" />
      <polygon points={pts([A, B, C, D])} fill={top} stroke={ISO.outline} strokeWidth=".8" strokeLinejoin="round" />
    </g>
  );
}

/** 박공 지붕 — 마루가 y축을 따라 놓인다. */
function Roof({
  x, y, w, d, h, rh, warm, dark,
}: {
  x: number; y: number; w: number; d: number; h: number; rh: number;
  warm: string; dark: string;
}) {
  const ov = 0.14;
  const X = x - ov, Y = y - ov, WD = w + ov * 2, D = d + ov * 2;
  const r1 = iso(X + WD / 2, Y, h + rh);
  const r2 = iso(X + WD / 2, Y + D, h + rh);
  const e1 = iso(X + WD, Y, h);
  const e2 = iso(X + WD, Y + D, h);
  const g1 = iso(X, Y, h);
  const g2 = iso(X, Y + D, h);

  return (
    <g>
      <polygon points={pts([r1, e1, e2, r2])} fill={dark} stroke={ISO.outline} strokeWidth=".8" strokeLinejoin="round" />
      <polygon points={pts([r1, g1, g2, r2])} fill={warm} stroke={ISO.outline} strokeWidth=".8" strokeLinejoin="round" />
    </g>
  );
}

/** 창 — 레벨이 오르면 개수가 는다. 어두운 화면에서 '살아있는 건물'의 신호다. */
function Windows({
  x, y, d, z, n, color,
}: { x: number; y: number; d: number; z: number; n: number; color: string }) {
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const t = d * ((i + 0.5) / n);
        const p = iso(x, y + t, z);
        return (
          <rect
            key={i}
            x={p[0] - 2.6} y={p[1] - 5}
            width={5.2} height={6}
            fill={color}
            opacity={0.95}
            rx="1"
          />
        );
      })}
    </g>
  );
}

/** 만렙 깃발 — 구조로 만렙을 말한다(색이 아니라). */
function Flag({ x, y, z }: { x: number; y: number; z: number }) {
  const p = iso(x, y, z);
  return (
    <g>
      <line x1={p[0]} y1={p[1]} x2={p[0]} y2={p[1] - 16} stroke={T.gold} strokeWidth="1.6" />
      <path d={`M${p[0]} ${p[1] - 16} L${p[0] + 11} ${p[1] - 12} L${p[0]} ${p[1] - 8} Z`} fill={T.gold} />
    </g>
  );
}

/**
 * 시설 건물 — 레벨이 오르면 **층이 쌓인다.**
 * Lv.0도 1층은 서 있다. 0층으로 두면 새 런의 마을이 빈 땅이 된다.
 */
function Facility({
  x, y, level, warm,
}: { x: number; y: number; level: number; warm: boolean }) {
  const floors = Math.min(3, level + 1);
  const fh = 0.62;
  const roofZ = floors * fh;

  return (
    <g>
      {Array.from({ length: floors }).map((_, i) => (
        <Box
          key={i}
          x={x} y={y} w={1.5} d={1.2} h={fh} z0={i * fh}
          top={ISO.stoneTop} right={ISO.stoneR} left={ISO.stoneL}
        />
      ))}
      <Roof
        x={x} y={y} w={1.5} d={1.2} h={roofZ} rh={0.5}
        warm={warm ? ISO.roofWarm : ISO.roofCool}
        dark={warm ? ISO.roofWarmD : ISO.roofCoolD}
      />
      <Windows
        x={x + 1.5} y={y} d={1.2} z={roofZ - fh * 0.45}
        n={floors} color={warm ? ISO.glow : ISO.glowAlt}
      />
      {level >= FACILITY_MAX_LEVEL && <Flag x={x + 0.75} y={y + 0.6} z={roofZ + 0.5} />}
    </g>
  );
}

/**
 * 거주 구역의 층수 — 등급 6단계를 구조 3단계로 접는다.
 *
 * **건물과 라벨 높이가 같은 곳에서 나와야 한다.** 두 곳에 따로 적으면
 * 등급이 오를 때 라벨만 안 따라 올라가는 식으로 조용히 어긋난다
 * (건물 배열과 핀 배열을 갈랐다가 라벨이 엉뚱한 건물에 붙은 전례가 있다).
 */
function quartersFloors(topStar: number): number {
  return topStar >= 5 ? 3 : topStar >= 3 ? 2 : 1;
}

/**
 * 거주 구역 — 영웅들이 사는 곳. **로스터 최고 등급이 구조를 정한다.**
 *
 * ── 왜 등급이 구조를 정하는가 ─────────────────────────
 * 원작에서 가져온 축이 "층이 곧 계급"이고(제안서 §2-1), 승급이 곧 이사다.
 * 그 계급이 마을에서 눈에 보이려면 **등급이 건물의 모양을 바꿔야** 한다 —
 * 색만 바꾸면 ★2와 ★5가 구분되지 않는다(카드에서 이미 겪은 함정).
 *
 * ── 왜 Facility로 안 그리는가 ─────────────────────────
 * `Gate`가 남긴 판단과 같다. 시설 4종은 전부 `Facility` 실루엣이라 레벨로만
 * 갈리므로, 같은 모양을 하나 더 두면 "다섯 번째 시설"로 읽힌다.
 * 거주 구역은 **한 채가 아니라 여러 채**로 그려서 한눈에 갈라놓는다
 * (사는 곳이므로 여러 채인 편이 뜻에도 맞다).
 *
 * 재질도 등급을 따라 올라간다 — 목재는 tokens에 정의만 돼 있고 이 파일에서
 * 한 번도 안 쓰이던 3면 팔레트다(시설이 전부 석재라서).
 */
function Quarters({ x, y, topStar }: { x: number; y: number; topStar: number }) {
  /*
    ★1~2 목재 단층 막사 / ★3~4 석조 2층 숙사 / ★5~6 3층 저택.
    등급 6단계를 3단계 구조로 접는 이유는, 부감도에서 한 칸짜리 건물이
    구분 가능한 높이 단계가 그 정도이기 때문이다(시설도 3층이 상한이다).
  */
  const floors = quartersFloors(topStar);
  const grade = floors - 1;
  const fh = 0.62;
  const mat = grade === 0
    ? { top: ISO.woodTop, right: ISO.woodR, left: ISO.woodL }
    : { top: ISO.stoneTop, right: ISO.stoneR, left: ISO.stoneL };
  /* 저택만 왕가 지붕 — 지금까지 탑 첨탑에만 쓰이던 색이라 '가장 높은 자리'로 읽힌다 */
  const roof = grade === 2
    ? { warm: ISO.roofRoyal, dark: ISO.roofRoyalD }
    : { warm: ISO.roofCool, dark: ISO.roofCoolD };

  /* 본채 + 곁채. 곁채는 등급이 오를수록 커지되 본채를 넘지 않는다 */
  const annexH = fh * (grade === 0 ? 1 : 1.5);

  return (
    <g>
      {/* 곁채 — 본채보다 뒤(작은 x+y)에 둬야 앞에서 안 가린다 */}
      <Box
        x={x - 0.05} y={y + 0.95} w={0.72} d={0.62} h={annexH}
        top={mat.top} right={mat.right} left={mat.left}
      />
      <Roof
        x={x - 0.05} y={y + 0.95} w={0.72} d={0.62} h={annexH} rh={0.3}
        warm={roof.warm} dark={roof.dark}
      />

      {/* 본채 */}
      {Array.from({ length: floors }).map((_, i) => (
        <Box
          key={i}
          x={x} y={y} w={1.15} d={0.9} h={fh} z0={i * fh}
          top={mat.top} right={mat.right} left={mat.left}
        />
      ))}
      <Roof
        x={x} y={y} w={1.15} d={0.9} h={floors * fh} rh={0.46}
        warm={roof.warm} dark={roof.dark}
      />
      {/*
        창은 거주 인원이 아니라 층수를 따른다 — 인원을 창으로 세면
        영웅이 늘 때마다 건물이 반짝여서 등급 신호와 경쟁한다.
      */}
      <Windows
        x={x + 1.15} y={y} d={0.9} z={floors * fh - fh * 0.45}
        n={floors} color={ISO.glow}
      />
    </g>
  );
}

/** 소환진 — 건물이 아니다. 바닥의 빛나는 원. */
function SummonCircle({ x, y }: { x: number; y: number }) {
  const c = iso(x, y, 0.05);
  return (
    <g>
      <ellipse cx={c[0]} cy={c[1]} rx={34} ry={19} fill={ISO.stoneL} stroke={ISO.outline} strokeWidth=".8" />
      <ellipse cx={c[0]} cy={c[1]} rx={26} ry={14.5} fill={ISO.arcane} opacity=".28" />
      <ellipse cx={c[0]} cy={c[1]} rx={17} ry={9.5} fill="none" stroke={ISO.arcane} strokeWidth="1.4" strokeDasharray="4 4" />
      <ellipse cx={c[0]} cy={c[1]} rx={7} ry={4} fill={ISO.arcane} opacity=".85" />
      {/* 떠 있는 결정 — 이 자리가 '무언가 나오는 곳'임을 말한다 */}
      <path
        d={`M${c[0]} ${c[1] - 44} l6,9 -6,11 -6,-11 z`}
        fill={ISO.arcane}
        stroke={ISO.outline}
        strokeWidth=".7"
      />
      <ellipse cx={c[0]} cy={c[1] - 24} rx={8} ry={2.6} fill={ISO.arcane} opacity=".3" />
    </g>
  );
}

/**
 * 모험 관문 — 건물이 아니라 **마을 밖으로 나가는 길**이다.
 *
 * 시설처럼 그리지 않는 이유: 시설 4종은 전부 `Facility`로 그려서 실루엣이 같고
 * 레벨로만 구분된다. 모험은 레벨이 없고 성격도 달라(밖으로 나간다) 같은 모양이면
 * "다섯 번째 시설"로 읽힌다. 문설주 둘과 길로 그려서 한눈에 갈라놓는다.
 *
 * 나가 있는 인원이 있으면 등불을 켠다 — 마을을 보기만 해도 누가 밖에 있는지
 * 알 수 있어야 한다(화면을 열어봐야 아는 정보는 부감도의 목적에 어긋난다).
 */
function Gate({ x, y, away }: { x: number; y: number; away: boolean }) {
  const [lx, ly] = iso(x - 0.45, y + 0.45);
  const [rx, ry] = iso(x + 0.45, y - 0.45);
  const H = 26;
  return (
    <g>
      {/* 바깥으로 이어지는 길 — 앞쪽(x+y가 큰 쪽)으로 뻗는다 */}
      <polygon
        points={pts([iso(x - 0.5, y + 0.5), iso(x + 0.5, y - 0.5),
          iso(x + 1.5, y + 0.5), iso(x + 0.5, y + 1.5)])}
        fill={ISO.stoneL}
        opacity=".55"
      />
      {/* 문설주 둘 */}
      {[[lx, ly], [rx, ry]].map(([px, py], i) => (
        <polygon
          key={i}
          points={pts([[px - 3, py], [px + 3, py], [px + 3, py - H], [px - 3, py - H]])}
          fill={ISO.stoneR}
          stroke={ISO.outline}
          strokeWidth=".8"
          strokeLinejoin="round"
        />
      ))}
      {/* 상인방 */}
      <polygon
        points={pts([[lx - 3, ly - H], [rx + 3, ry - H], [rx + 3, ry - H - 6], [lx - 3, ly - H - 6]])}
        fill={ISO.stoneTop}
        stroke={ISO.outline}
        strokeWidth=".8"
        strokeLinejoin="round"
      />
      {/* 등불 — 나가 있는 인원이 있을 때만 */}
      <circle
        cx={(lx + rx) / 2}
        cy={(ly + ry) / 2 - H - 3}
        r={3.2}
        fill={away ? ISO.glow : ISO.stoneL}
        stroke={ISO.outline}
        strokeWidth=".6"
        opacity={away ? 1 : 0.6}
      />
    </g>
  );
}

/** 무덤 — 자라지 않는다. 비석만 는다. */
function Graves({ x, y, deaths }: { x: number; y: number; deaths: number }) {
  const stones = Math.max(1, Math.min(4, deaths));
  return (
    <g>
      {Array.from({ length: stones }).map((_, i) => {
        const p = iso(x + (i % 2) * 0.5, y + Math.floor(i / 2) * 0.5, 0);
        return (
          <path
            key={i}
            d={`M${p[0] - 4} ${p[1]} L${p[0] - 4} ${p[1] - 9} Q${p[0]} ${p[1] - 15} ${p[0] + 4} ${p[1] - 9} L${p[0] + 4} ${p[1]} Z`}
            fill={ISO.stoneL}
            stroke={ISO.outline}
            strokeWidth=".7"
            opacity={deaths === 0 ? 0.35 : 1}
          />
        );
      })}
    </g>
  );
}

/** 탑 — 등반 목적지. 섬에서 가장 높아야 목적지로 읽힌다. */
function Tower({ x, y, locked }: { x: number; y: number; locked: boolean }) {
  const seg = 1.15;
  return (
    <g opacity={locked ? 0.45 : 1}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          x={x + i * 0.1} y={y + i * 0.1}
          w={1.3 - i * 0.2} d={1.3 - i * 0.2} h={seg} z0={i * seg}
          top={ISO.stoneTop} right={ISO.stoneR} left={ISO.stoneL}
        />
      ))}
      {/* 첨탑 */}
      {(() => {
        const base = iso(x + 0.2, y + 0.2, seg * 3);
        const apex = iso(x + 0.65, y + 0.65, seg * 3 + 1.5);
        const l = iso(x + 0.2, y + 1.1, seg * 3);
        const r = iso(x + 1.1, y + 0.2, seg * 3);
        return (
          <>
            <polygon points={pts([base, r, apex])} fill={ISO.roofRoyalD} stroke={ISO.outline} strokeWidth=".8" strokeLinejoin="round" />
            <polygon points={pts([base, l, apex])} fill={ISO.roofRoyal} stroke={ISO.outline} strokeWidth=".8" strokeLinejoin="round" />
          </>
        );
      })()}
      {/* 꼭대기 불빛 — 잠기면 꺼진다. 상태를 색이 아니라 유무로 말한다 */}
      {!locked && (() => {
        const p = iso(x + 0.65, y + 0.65, seg * 3 + 1.75);
        return (
          <>
            <circle cx={p[0]} cy={p[1]} r={4} fill={T.gold} />
            <circle cx={p[0]} cy={p[1]} r={9} fill={T.gold} opacity=".25" />
          </>
        );
      })()}
      {/* 층 창 — 위로 이어지는 인상 */}
      {[0, 1, 2].map((i) => {
        const p = iso(x + 1.3 - i * 0.2, y + 0.5, i * seg + 0.55);
        return <rect key={i} x={p[0] - 2.4} y={p[1] - 5} width={4.8} height={7} fill={ISO.arcane} rx="1" opacity=".9" />;
      })}
    </g>
  );
}

/**
 * ── 배치 ──────────────────────────────────────────────
 *
 * 탑은 가장 안쪽(x,y 작음)에 둔다 — 부감도에서 안쪽이 '멀리·높이'로 읽히고,
 * 앞줄에 두면 다른 건물을 전부 가린다.
 * 시설 4종은 중앙, 상점·무덤은 바깥. 무덤은 가장 앞(가장 잘 보이는 자리)에
 * 두지 않는다 — 마을의 주인공이 아니다.
 *
 * ⚠️ **라벨 겹침은 눈이 아니라 숫자로 잡는다.** 예전 주석은 "8개가 라벨 겹침 없이
 * 들어간다"고만 적혀 있었고, 그래서 9번째를 넣을 때 **어디가 비었는지 알 수 없었다**
 * (실제로 "격자가 꽉 찼다"고 잘못 판단할 뻔했다 — 재보니 빈 자리가 많았다).
 * 좌표를 밖으로 빼서 `iso.test.ts`가 쌍마다 여유를 재도록 한다.
 *
 * 깊이(x+y)만으로는 부족하다 — 훈련소와 숙소는 깊이가 **정확히 같지만** 화면
 * 좌우로 갈라져 안 겹친다. 겹침은 투영 좌표에서 봐야 한다.
 */
export const VILLAGE_LOTS: Record<VillageSpot, { x: number; y: number }> = {
  tower: { x: 0.4, y: 0.4 },
  training: { x: 3.4, y: 0.3 },
  forge: { x: 6.1, y: 1.4 },
  rest: { x: 0.3, y: 3.4 },
  summon: { x: 3.6, y: 3.6 },
  armory: { x: 6.2, y: 4.4 },
  shop: { x: 1.0, y: 6.2 },
  adventure: { x: 3.4, y: 6.0 },
  grave: { x: 5.4, y: 6.6 },
  /*
    거주 구역 — **브라우저 실측으로 고른 자리다**(2026-09-03, 375×667).

    처음엔 (5.4, 0.2)에 뒀다. `iso.test.ts`의 clearance는 1.188로 통과했는데
    실제 브라우저에서 **훈련소 핀과 32.8% 겹쳤다**(가로 35.9px · 세로 26.3px).
    기존 최악 쌍(무기창고×무덤)이 7.8%인데 그 네 배였다.

    ⚠️ **테스트의 clearance는 핀 상자를 76×24로 어림잡는데 실제는 79.3×44다.**
    높이가 83% 크다 — 44px은 손가락 터치 영역이라 줄일 수 없다.
    그래서 clearance가 통과해도 실제로는 겹칠 수 있다. **테스트만 믿지 말 것.**

    실측 사각형으로 격자 1674칸을 전수 조사한 결과:
      겹침 0인 칸        : 섬 안에 **단 하나** — 이 자리
      기존 최악(7.8%) 미만 : 11칸, 전부 이 뒷모서리 주변
      이 자리의 여유      : 탑 입장까지 7.7px, 나머지는 27px 이상

    즉 44px 핀 기준으로 마을은 이미 꽉 찼다. 자리를 더 늘리려면
    좌표가 아니라 **핀 배치 방식**을 바꿔야 한다.

    ⚠️ **위 수치는 전부 `button`(투명 44px) 기준이다** — STEP 54에서 다시 쟀다.
    실제로 보이는 것은 아래 `span` 알약(23.8~35px)이고, 그쪽 겹침은
    시설 만렙·★6(=lz 최대)에서도 **0쌍**이다(가장 빡빡한 쌍도 4.4px 여유).
    각 알약 중심을 `elementFromPoint`로 눌러보면 10개 전부 자기가 잡힌다.
    **눈에 보이는 결함은 없다** — 여기 적힌 "꽉 찼다"는 터치 영역의 한계다.
  */
  quarters: { x: -0.4, y: -0.4 },
};

export interface IsoVillageProps {
  facilities: Record<FacilityKind, number>;
  onSelect: (spot: VillageSpot) => void;
  deathCount?: number;
  towerLocked?: boolean;
  /** 현재 층 — 탑 핀의 부제로 쓴다 */
  floorLabel?: string;
  /** 지금 모험에 나가 있는 인원 수 — 관문 핀의 부제이자 등불의 점등 조건 */
  awayCount?: number;
  /**
   * 살아있는 영웅 수 — 거주 구역 핀의 부제.
   *
   * ⚠️ **로스터를 통째로 넘기지 말 것.** 이 컴포넌트는 게임 타입을 하나도 모르고
   * 숫자·시설 레벨만 받는다. 로스터를 넘기면 작화 도구가 도메인에 묶인다.
   * 파생은 호출부(BaseScreen)가 이미 하고 있다.
   */
  livingCount?: number;
  /** 로스터 최고 등급 — 거주 구역 건물의 **구조**를 정한다(색이 아니라) */
  topStar?: number;
}

/**
 * 자리 하나 — **건물과 라벨이 같은 좌표에서 나온다.**
 *
 * ⚠️ 처음에는 건물 배열과 핀 배열을 따로 뒀다가 **라벨이 엉뚱한 건물에 붙었다**
 * (무기창고 핀이 소환진 위에 있었다). 두 배열을 손으로 맞추는 구조라
 * 한쪽만 고치면 조용히 어긋난다. 자리를 하나로 합쳐 그 가능성을 없앤다.
 */
interface Lot {
  spot: VillageSpot;
  label: string;
  /** 바닥 격자 위치 */
  x: number; y: number;
  /** 라벨이 뜰 높이(건물 꼭대기보다 살짝 위) */
  lz: number;
  sub?: string;
  render: () => React.ReactNode;
}

export function IsoVillage({
  facilities, onSelect, deathCount = 0, towerLocked = false, floorLabel, awayCount = 0,
  livingCount = 0, topStar = 1,
}: IsoVillageProps) {
  const fac = (k: FacilityKind) => facilities[k] ?? 0;
  /** 시설 높이 = 층수 × 층높이 + 지붕. Facility의 상수와 맞물려 있다 */
  const facTop = (k: FacilityKind) => Math.min(3, fac(k) + 1) * 0.62 + 0.7;

  /*
    ── 핀을 그림에 맞추려면 상자의 **실측 크기**가 필요하다 ──
    `slice`가 얼마나 잘라내는지는 상자 비율에 달렸고, 그 비율은 뷰포트마다 다르다.
    상수로 둘 수 없으므로(§5-35: 레이아웃 수치는 계산하지 말고 브라우저에 맡길 것)
    ResizeObserver로 실제 크기를 받아 `projectPin`에 넘긴다.

    측정 전(0×0)에는 핀을 그리지 않는다 — 좌표를 모르는 상태로 한 프레임
    엉뚱한 자리에 찍히면 그게 눈에 보이는 깜빡임이 된다.
  */
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 좌표는 VILLAGE_LOTS 하나에서만 온다 — 여기에 다시 적으면 조용히 어긋난다 */
  const at = (spot: VillageSpot) => VILLAGE_LOTS[spot];

  const lots: Lot[] = [
    {
      spot: 'tower', label: '탑 입장', sub: floorLabel,
      ...at('tower'), lz: 5.6,
      render: () => <Tower {...at('tower')} locked={towerLocked} />,
    },
    {
      spot: 'training', label: '훈련소', sub: `Lv.${fac('training')}`,
      ...at('training'), lz: facTop('training'),
      render: () => <Facility {...at('training')} level={fac('training')} warm />,
    },
    {
      spot: 'forge', label: '합성소', sub: `Lv.${fac('forge')}`,
      ...at('forge'), lz: facTop('forge'),
      render: () => <Facility {...at('forge')} level={fac('forge')} warm={false} />,
    },
    {
      spot: 'rest', label: '숙소', sub: `Lv.${fac('rest')}`,
      ...at('rest'), lz: facTop('rest'),
      render: () => <Facility {...at('rest')} level={fac('rest')} warm={false} />,
    },
    {
      spot: 'summon', label: '소환 제단',
      ...at('summon'), lz: 1.9,
      // 소환진은 바닥 원이라 그림 중심이 핀보다 살짝 앞이다(의도된 어긋남)
      render: () => <SummonCircle x={at('summon').x + 0.5} y={at('summon').y + 0.5} />,
    },
    {
      spot: 'armory', label: '무기창고', sub: `Lv.${fac('armory')}`,
      ...at('armory'), lz: facTop('armory'),
      render: () => <Facility {...at('armory')} level={fac('armory')} warm />,
    },
    {
      spot: 'shop', label: '상점',
      ...at('shop'), lz: 2.3,
      render: () => <Facility {...at('shop')} level={1} warm />,
    },
    {
      spot: 'adventure', label: '모험 관문', sub: awayCount > 0 ? `${awayCount}명 원정` : undefined,
      ...at('adventure'), lz: 1.6,
      render: () => <Gate {...at('adventure')} away={awayCount > 0} />,
    },
    {
      spot: 'quarters', label: '거주 구역', sub: livingCount > 0 ? `${livingCount}명` : undefined,
      ...at('quarters'), lz: quartersFloors(topStar) * 0.62 + 0.5,
      render: () => <Quarters {...at('quarters')} topStar={topStar} />,
    },
    {
      spot: 'grave', label: '무덤', sub: deathCount > 0 ? `${deathCount}명` : undefined,
      ...at('grave'), lz: 0.9,
      render: () => <Graves x={at('grave').x + 0.2} y={at('grave').y + 0.2} deaths={deathCount} />,
    },
  ];

  /** 뒤에서 앞으로. 이 정렬이 빠지면 앞 건물이 뒤 건물에 가려 입체가 무너진다 */
  const ordered = [...lots].sort((a, b) => depth(a.x, a.y) - depth(b.x, b.y));

  /** 섬 윗면 외곽 — 모서리를 깎아 '떠 있는 섬'으로 보이게 한다 */
  const isleTop: Pt[] = [
    iso(0.6, -0.4), iso(GRID - 0.4, -0.4), iso(GRID + 0.4, 0.6),
    iso(GRID + 0.4, GRID - 0.6), iso(GRID - 0.4, GRID + 0.4),
    iso(0.6, GRID + 0.4), iso(-0.4, GRID - 0.6), iso(-0.4, 0.6),
  ];

  return (
    /*
      ── 왜 래퍼를 통째로 채우는가 ─────────────────────────
      폰 세로에서 이 화면이 받는 높이는 785px인데 viewBox는 390×400이다.
      처음엔 `aspectRatio` 상자에 섬을 담았다가 **아래 385px이 검게 비었다**(실측).
      대신 viewBox 자체를 세로로 길게 잡고(`H`) SVG가 100%를 채우게 한다 —
      섬은 위쪽에, 아래는 하늘·바위가 이어져 빈 곳이 안 생긴다.

      `none`(비율 무시)을 쓰지 않는 이유는 아이소메트릭이 **각도가 곧 형태**라
      세로로 늘어나면 정육면체가 찌그러져 입체로 안 읽히기 때문이다.
      사이드뷰는 도형이라 늘려도 됐지만 여기서는 안 된다.

      SVG와 핀이 같은 상자를 공유하므로(둘 다 이 래퍼의 100%) 라벨이 그림과
      어긋나지 않는다 — 상자를 나누면 letterbox 때문에 즉시 어긋난다.
    */
    <div
      ref={boxRef}
      style={{
        /*
          ⚠️ `position: absolute` + inset:0이어야 한다. `height: '100%'`로는 안 된다.

          부모(`BaseScreen`의 `flex:1` 래퍼)는 높이가 **불확정**이라
          자식의 `height:100%`가 `auto`로 풀린다. 그러면 SVG가 남은 높이가 아니라
          **viewBox 비율(390:760)**로 자기 높이를 정하고, 그 높이가 부모를 밀어낸다.
          375×667에서 SVG가 702px가 되어 **탭 바 5개가 통째로 화면 밖(93px)으로 밀렸다.**
          390px 폭에서만 우연히 760이 나와 STEP 23 실측(390×844)이 이걸 못 봤다.

          absolute는 부모의 **패딩 박스**를 기준으로 잡으므로 높이가 확정되고,
          SVG는 그 안에서 `slice`로 잘린다 — 비율이 화면을 밀어내는 경로가 끊긴다.
          핀(아래 `projectPin` 배치)이 SVG와 **같은 상자**를 공유하는 것도 이 방식이라야 유지된다.
        */
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${ISO.skyTop}, ${ISO.skyBottom})`,
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        /*
          ⚠️ `YMin`(위 맞춤)이며 `projectPin`의 alignY 기본값 0과 **짝이다.**
          한쪽만 바꾸면 핀이 건물에서 떨어진다.
          Mid(가운데)로 두면 섬이 위로 올라가 상단 HUD와 겹친다(실측 23px).
        */
        preserveAspectRatio="xMidYMin slice"
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="isoSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ISO.skyTop} />
            <stop offset="100%" stopColor={ISO.skyBottom} />
          </linearGradient>
          <linearGradient id="isoRock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ISO.turfSide} />
            <stop offset="100%" stopColor={ISO.rock} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={W} height={H} fill="url(#isoSky)" />

        {/* 별 — 어두운 하늘이 비지 않게. 고정 좌표라 깜빡이지 않는다 */}
        {[[40, 60], [88, 128], [150, 44], [232, 92], [300, 56], [344, 150], [64, 190],
          [278, 172], [24, 300], [360, 262], [120, 610], [318, 668], [56, 700], [210, 730]]
          .map(([sx, sy], i) => (
            <circle key={i} cx={sx} cy={sy} r={i % 3 === 0 ? 1.4 : 1} fill={T.text} opacity={0.45} />
          ))}

        {/*
          섬 옆면 — 아래로 길게 늘어뜨린 바위.
          짧게 자르면 '판때기'로 보인다. 화면 아래까지 이어져야 **떠 있는 섬**이 된다.
          꼭짓점(spire)이 viewBox 바닥 근처에 오도록 잡았다.
        */}
        {(() => {
          const l = isleTop[6], bl = isleTop[5], br = isleTop[4], r = isleTop[3];
          const spire: Pt = [OX - 10, H - 60];
          return (
            <path
              d={`M${l[0]},${l[1]} L${bl[0]},${bl[1]} L${br[0]},${br[1]} L${r[0]},${r[1]}
                  L${r[0] - 8},${r[1] + 70} L${spire[0]},${spire[1]}
                  L${l[0] + 14},${l[1] + 84} Z`}
              fill="url(#isoRock)"
              stroke={ISO.outline}
              strokeWidth=".8"
              strokeLinejoin="round"
            />
          );
        })()}

        {/* 섬 윗면 */}
        <polygon points={pts(isleTop)} fill={ISO.turfTop} stroke={ISO.outline} strokeWidth="1" strokeLinejoin="round" />

        {/* 길 — 소환진을 중심으로 십자. 건물 사이가 비어 보이지 않게 한다 */}
        <polygon points={pts([iso(3.7, -0.4), iso(4.5, -0.4), iso(4.5, GRID + 0.4), iso(3.7, GRID + 0.4)])} fill={ISO.turfSide} opacity=".55" />
        <polygon points={pts([iso(-0.4, 3.3), iso(GRID + 0.4, 3.3), iso(GRID + 0.4, 4.1), iso(-0.4, 4.1)])} fill={ISO.turfSide} opacity=".55" />

        {/* 구조물 — 뒤에서 앞으로 */}
        {ordered.map((l) => <g key={l.spot}>{l.render()}</g>)}
      </svg>

      {/*
        핀은 SVG 밖 HTML 버튼이다.
        안에 넣으면 터치 타깃이 그림 크기에 묶여 44px을 못 지킨다(TOUCH_MIN 규칙).

        ⚠️ 예전 주석은 "퍼센트 배치라 어떤 뷰포트에서도 그림 위 같은 자리에 남는다"고
        적혀 있었는데 **틀렸다.** %는 래퍼 기준이고 그림은 `slice`로 잘리므로,
        상자 비율이 viewBox 비율(390:760)과 다른 순간 둘이 갈라진다.
        390px 폭에서만 우연히 일치해 오래 안 드러났다 — `projectPin`으로 같은
        변환을 재현해 맞춘다(근거는 `iso.ts`의 주석).
      */}
      {box.w > 0 && lots.map((p) => {
        // 건물과 같은 좌표에서 파생한다 — 손으로 맞추지 않으므로 어긋날 수 없다
        const [vx, vy] = iso(p.x + 0.75, p.y + 0.6, p.lz);
        // viewBox 좌표를 그림이 실제로 그려진 자리로 옮긴다
        const [px, py] = projectPin(vx, vy, box.w, box.h, W, H);
        return (
          /*
            ⚠️ 터치 타깃 44px과 '작은 라벨'은 충돌한다.
            핀을 44px로 키우면 부감도에서 알약이 건물을 다 덮는다.
            그래서 **보이는 알약은 작게 두고 버튼 자체를 44px로** 잡는다 —
            투명 여백이 손가락을 받고 눈에는 작은 라벨만 보인다(TOUCH_MIN 유지).
          */
          <button
            key={p.spot}
            onClick={() => onSelect(p.spot)}
            style={{
              position: 'absolute',
              // px 단위 — projectPin이 이미 상자 기준 픽셀로 변환했다
              left: px,
              top: py,
              transform: 'translate(-50%, -50%)',
              minHeight: TOUCH_MIN,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span
              style={{
                display: 'block',
                padding: '4px 10px',
                background: 'rgba(12,9,26,.82)',
                border: `1px solid ${T.panelHi}`,
                borderRadius: 999,
                color: T.text,
                fontSize: 11,
                lineHeight: 1.25,
                letterSpacing: '.02em',
                whiteSpace: 'nowrap',
                textAlign: 'center',
              }}
            >
              {p.label}
              {p.sub && (
                <span style={{ display: 'block', fontSize: 9, color: T.gold }}>{p.sub}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
