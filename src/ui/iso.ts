/**
 * 아이소메트릭 투영 — 마을 부감도의 좌표계.
 *
 * ── 왜 별도 모듈인가 ──────────────────────────────────
 * 격자 좌표 → 화면 좌표 변환이 컴포넌트 안에 있으면 눈으로만 검증할 수 있다.
 * 건물이 공중에 뜨거나 접지선이 어긋나는 버그는 **숫자로 잡아야** 하고,
 * 그러려면 순수 함수여야 한다. `game/`이 아니라 `ui/`에 있는 이유는
 * 게임 규칙이 아니라 작화 도구이기 때문이다(밸런스와 무관).
 *
 * ── 좌표계 ────────────────────────────────────────────
 * (x, y)는 바닥 격자, z는 높이. 화면 x는 (x-y)에, 화면 y는 (x+y)에 비례한다.
 * 그래서 **x+y가 클수록 화면 아래쪽 = 앞**이다 — 이게 그리기 순서의 근거다.
 */
import type { FacilityKind } from '../game/data/facilities';

/** 격자 한 칸의 화면 폭/높이 절반. 2:1 비율이 아이소메트릭의 관례다. */
export const HW = 18;
export const HH = 15;
/** z 한 칸의 화면 높이. HH보다 커야 건물이 납작해 보이지 않는다. */
export const ZH = 24;

/**
 * 원점 — 섬이 viewBox 안에서 가운데 오도록 잡은 값.
 *
 * ⚠️ 8×8 격자에서 x와 y가 대칭이므로 화면 x의 중심은 격자 (0,0)이 아니라
 * **대각선 중앙**이다. OX를 viewBox 폭의 절반으로 두면 섬이 오른쪽으로 밀린다
 * (실제로 그랬다 — 내용 bbox가 x:55~339로 치우쳤다).
 * OY도 마찬가지로 위쪽 여백만큼만 내린다 — 크게 잡으면 섬 아래가 잘린다.
 */
export const OX = 195;
export const OY = 250;

export type Pt = readonly [number, number];

/**
 * 마을에서 고를 수 있는 자리.
 *
 * 시설 4종(숙소·훈련소·합성소·무기창고)이 **전부 개별 건물**이다.
 * 예전에는 '여관·시설' 하나에 4종이 숨어 있어서, 마을을 봐도 무엇을
 * 지을 수 있는지 알 수 없었다 — 부감도의 목적에 어긋난다.
 *
 * (사이드뷰 `VillageScene.tsx`에 있던 타입이다. 그 화면은 STEP 23에서
 * 아이소메트릭으로 교체되며 삭제됐고, 타입만 여기로 옮겼다.)
 */
export type VillageSpot = FacilityKind | 'grave' | 'summon' | 'shop' | 'tower';

/** 격자(x, y, z) → 화면(px, py). 이 파일의 유일한 관문이다. */
export function iso(x: number, y: number, z = 0): Pt {
  return [OX + (x - y) * HW, OY + (x + y) * HH - z * ZH];
}

/** 점 배열 → SVG points 문자열. */
export function pts(list: readonly Pt[]): string {
  return list.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

/**
 * 그리기 순서 키 — 값이 작을수록 뒤(먼저 그린다).
 *
 * 아이소메트릭에서 **뒤에 있는 것을 먼저 그려야** 앞 건물이 뒤 건물을 가린다.
 * 이 값을 안 쓰고 선언 순서대로 그리면 뒤쪽 건물이 앞 건물 위에 얹혀
 * 깊이가 무너진다 — z-index로는 못 고친다(SVG는 문서 순서가 곧 깊이다).
 */
export function depth(x: number, y: number): number {
  return x + y;
}

/**
 * viewBox 좌표 → 래퍼 기준 픽셀. **핀(HTML 버튼)을 그림 위에 얹는 유일한 관문.**
 *
 * ── 왜 %배치로는 안 되는가 (실측으로 드러난 버그) ─────────
 * SVG는 `preserveAspectRatio="xMidYMid slice"`로 그려진다. 즉 상자 비율이
 * viewBox 비율과 다르면 **그림이 상자보다 커지고 넘치는 만큼 잘린다.**
 * 그런데 핀은 `top: (py/H)*100%`로 **래퍼 기준** %를 썼다 — 잘린 그림과
 * 안 잘린 상자는 좌표계가 다르므로 둘이 어긋난다.
 *
 * 실측(375×667): 상자 609px에 그림이 731px로 그려져 위아래 **61px씩 잘렸고**,
 * 그만큼 핀이 건물에서 밀렸다(무기창고 라벨이 지붕 아래로 내려감).
 * 390px 폭에서는 비율이 우연히 일치해 offY=0이라 **STEP 23이 못 봤다.**
 *
 * `slice`와 같은 규칙을 여기서 그대로 재현한다:
 * 배율은 두 축 중 **큰 쪽**(cover), 남는 쪽은 가운데 정렬(xMidYMid).
 */
export function projectPin(
  px: number, py: number,
  boxW: number, boxH: number,
  vbW: number, vbH: number,
  /**
   * 세로 정렬 — 0=위 맞춤(Min), 0.5=가운데(Mid), 1=아래 맞춤(Max).
   *
   * 기본을 **0(YMin)**으로 둔다. 가운데(0.5)로 자르면 섬 꼭대기가 위로 올라가
   * **HUD(상단 96px)와 겹친다** — 실제로 `탑 입장` 핀이 재화 칩 위로 23px 파고들었다.
   * 위 맞춤이면 잘리는 곳이 전부 아래쪽 하늘·바위라 잃는 정보가 없다
   * (섬은 viewBox 위쪽 절반에 있다 — `OY` 주석 참조).
   *
   * ⚠️ 이 값은 SVG의 `preserveAspectRatio`와 **반드시 같아야 한다.**
   * 한쪽만 바꾸면 핀과 그림이 즉시 어긋난다.
   */
  alignY = 0,
): Pt {
  // slice = cover. contain(=meet)과 반대로 큰 배율을 쓴다
  const scale = Math.max(boxW / vbW, boxH / vbH);
  // 가로는 가운데(xMid) 고정 — 섬이 좌우로 치우치면 즉시 눈에 띈다
  const offX = (boxW - vbW * scale) / 2;
  const offY = (boxH - vbH * scale) * alignY;
  return [px * scale + offX, py * scale + offY];
}
