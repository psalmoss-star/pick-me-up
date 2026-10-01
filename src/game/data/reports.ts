/**
 * 정찰 보고 — 성향 4종과 왜곡 튜닝. 기획서 3단계(2026-09-29).
 *
 * 마스터는 전장을 직접 보지 않고 정찰자의 보고를 받는다. 보고는 정찰자의 **기질**에 따라 틀린다.
 * 보고는 **정보만** 바꾼다 — 전투 수치·전투 난수에는 닿지 않는다(CLAUDE.md "기질은 행동 선택에만").
 * 틀린 보고가 해치는 것은 마스터의 판단(경로·책략·후퇴 신호)이다.
 *
 * 사용자 결정(2026-09-29): 정직 1 · 허세 2 · 겁많음 3 · 침묵 2. 정직은 8명 중 1명꼴로 **드물다**.
 */
import type { TemperId } from './temperaments';
import type { CrisisLevel } from './orders';

export type ReportStyle = 'honest' | 'bluff' | 'coward' | 'silent';

export interface ReportStyleDef {
  id: ReportStyle;
  /** 화면에 찍히는 이름. 기질 이름과 따로 둔다 — 마스터가 기질에서 성향을 **알아내야** 한다 */
  label: string;
  /** 위기(후퇴 신호 창)를 언제 알리는가. null이면 알리지 않는다 */
  crisisLevel: CrisisLevel | null;
}

export const REPORT_STYLES: Record<ReportStyle, ReportStyleDef> = {
  honest: { id: 'honest', label: '정직', crisisLevel: 'hp30' },
  bluff: { id: 'bluff', label: '허세', crisisLevel: 'hp15' },
  coward: { id: 'coward', label: '겁많음', crisisLevel: 'hp50' },
  silent: { id: 'silent', label: '침묵', crisisLevel: null },
};

/**
 * 기질 → 보고 성향. 기질 8종 **전부**를 덮어야 한다(테스트가 잠근다).
 * - 충직: 본 대로 말한다.
 * - 오만·호전: 적을 얕본다 — 위험을 줄여 말한다.
 * - 소심·다정·냉소: 최악을 먼저 본다 — 위험을 부풀린다(다정은 동료 걱정에, 냉소는 불신에).
 * - 과묵·체념: 말하지 않는다.
 */
export const REPORT_STYLE_BY_TEMPER: Record<TemperId, ReportStyle> = {
  loyal: 'honest',
  proud: 'bluff',
  fierce: 'bluff',
  timid: 'coward',
  gentle: 'coward',
  cynic: 'coward',
  silent: 'silent',
  resigned: 'silent',
};

/**
 * 위기 창 첫 줄. 조사는 `{scout:이/가}`·`{hurt:이/가}`처럼 두 꼴을 적는다(CLAUDE.md 대사 규칙).
 * `hurt` = 위기에 빠진 영웅.
 */
export const REPORT_LINES: Record<ReportStyle, { crisis: string }> = {
  honest: { crisis: '{scout:이/가} 알린다 — {hurt}의 숨이 가빠졌다.' },
  bluff: { crisis: '{scout:이/가} 그제야 입을 열었다 — {hurt:이/가} 쓰러지기 직전이다.' },
  coward: { crisis: '{scout:이/가} 소리친다 — {hurt:이/가} 위험하다!' },
  silent: { crisis: '' },
};

/**
 * 브리핑 보고 — **기질마다** 한 줄(2026-10-01). 성향마다 한 줄이면 겁많음 셋이 같은 말을 해서
 * 말투가 아니라 문장 자체로 성향이 드러났다(1차 셀프 테스트: "같은 성향이 겹쳐 나온다").
 *
 * 자리표시: `{scout}` 정찰자 · `{forces}` 종류별 수("잿빛 슬라임이 셋, 균열의 골렘이 하나") ·
 * `{terrain}` 접점 지형 이름. 조사는 `{scout:이/가}`·`{terrain:을/를}`처럼 두 꼴을 적는다.
 * - 말하는 기질은 **보고된** 접점 지형을 말한다(틀릴 수 있다).
 * - 침묵 기질(과묵·체념)은 수를 말하지 않고 **참** 접점 지형을 몸짓으로 알린다 —
 *   드물게 입을 열지 않지만 틀리지도 않는 보고자다(사용자 결정, 2026-10-01).
 * 성향 이름("허세" 등)을 문장에 쓰지 않는다(테스트가 잠근다).
 */
export const REPORT_BRIEF_BY_TEMPER: Record<TemperId, string> = {
  loyal: '{scout:이/가} 본 대로 적어 올렸다. "{forces}. {terrain}에서 마주칩니다."',
  proud: '{scout:이/가} 코웃음 쳤다. "{forces}. {terrain}에서 끝내겠습니다. 별것 없습니다."',
  fierce: '{scout:이/가} 이를 드러냈다. "{forces}뿐입니다. {terrain}에서 부숴 버리죠."',
  timid: '{scout:이/가} 목소리를 떨며 보고했다. "{forces}… 너무 많습니다. {terrain}에서 기다리고 있어요."',
  gentle: '{scout:이/가} 동료들을 돌아보며 말했다. "{forces}. {terrain}에서 부딪힙니다. 다들 무사해야 할 텐데요."',
  cynic: '{scout:이/가} 한숨을 쉬었다. "{forces}. {terrain}에서요. 이번엔 다 돌아오진 못하겠군요."',
  silent: '{scout:은/는} 아무 말도 하지 않았다. 땅에 {terrain:을/를} 그리고 두 번 두드렸다.',
  resigned: '{scout:은/는} 대답 대신 {terrain} 쪽을 한 번 보고, 고개를 저었다.',
};

/** 종류별 수를 말로 — 1~10은 고유어, 그 위는 숫자 */
export const COUNT_WORDS = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'] as const;

/** 접점을 모를 때(지도에 접점이 없는 경로) 지형 대신 쓰는 말 */
export const UNKNOWN_TERRAIN_WORD = '길목';

/**
 * 왜곡 폭. 허세는 줄이고 겁많음은 부풀린다.
 * - `countShift`: 적 수를 1~max만큼 틀린다(허세는 빼고 겁많음은 더한다. 허세여도 1기 밑으로는 안 간다).
 * - `powerMult`: 적 전력에 곱하는 범위 [min, max).
 * - `misplace`: 경로마다 접점(✕)을 **같은 경로의 다른 지점**에 찍을 확률.
 *   지점마다 지형이 보이므로, ✕가 옮겨지면 마스터는 틀린 지형을 보고 길과 책략을 고른다.
 */
export const REPORT_TUNING = {
  countShiftMax: 2,
  powerMult: {
    bluff: [0.55, 0.8],
    coward: [1.3, 1.7],
  },
  misplace: 0.5,
} as const;
