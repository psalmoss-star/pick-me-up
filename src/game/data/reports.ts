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
