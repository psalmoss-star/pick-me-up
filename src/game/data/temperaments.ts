/**
 * 기질 — 개체의 성격. gdd-v3 §4.10.
 *
 * ── 왜 필요했나 ─────────────────────────────────────────
 * 이름·잠재치·서사로 개체를 **구별**할 수는 있게 됐지만, 구별되는 것과
 * **정이 드는 것**은 다르다. 한 마디도 안 하는 개체는 결국 숫자로 읽힌다.
 * 기질은 대사(`data/voice.ts`)의 목소리를 정하는 축이다.
 *
 * ── 전투에 넣지 않는다 ─────────────────────────────────
 * 여기에는 수치가 **하나도 없다.** 넣는 순간 "호전적인 기질이 딜러에 좋다"가 되어
 * 기질이 취향이 아니라 스펙이 된다. 즐겨찾기를 밸런스에 안 넣는 것과 같은 판단이다.
 *
 * ── 톤 ──────────────────────────────────────────────────
 * `names.ts`·`origins.ts`와 같다. 어둡고 건조하게. 설명은 한 문장.
 *
 * ⚠️ **순서를 바꾸지 말 것.** 기질은 seed에서 파생하므로(저장하지 않는다)
 * 배열 순서가 곧 기존 개체의 성격이다. 늘리는 것은 뒤에 붙이면 되지만,
 * 그래도 기존 개체의 기질이 **재배치된다**(rngInt의 max가 바뀐다).
 * 그러니 늘리는 것도 결정이다 — 대사 표(`voice.ts`)도 같이 채워야 한다.
 */

export type TemperId =
  | 'loyal'     // 충직
  | 'proud'     // 오만
  | 'timid'     // 소심
  | 'cynic'     // 냉소
  | 'gentle'    // 다정
  | 'fierce'    // 호전
  | 'silent'    // 과묵
  | 'resigned'; // 체념

export interface TemperDef {
  id: TemperId;
  /** 화면에 찍히는 두 글자 */
  label: string;
  /** 상태창에 한 줄. 이 사람이 어떤 식으로 말하는지 */
  desc: string;
}

export const TEMPERS: readonly TemperDef[] = [
  { id: 'loyal', label: '충직', desc: '한 번 따르기로 한 자를 끝까지 따른다.' },
  { id: 'proud', label: '오만', desc: '자기보다 약한 자의 명령을 견디지 못한다.' },
  { id: 'timid', label: '소심', desc: '겁이 많지만, 그래서 물러설 때를 안다.' },
  { id: 'cynic', label: '냉소', desc: '아무것도 믿지 않는다. 특히 약속을.' },
  { id: 'gentle', label: '다정', desc: '자기보다 옆 사람을 먼저 살핀다.' },
  { id: 'fierce', label: '호전', desc: '싸움 속에서만 살아 있다고 느낀다.' },
  { id: 'silent', label: '과묵', desc: '말이 적다. 남기는 말은 짧고 무겁다.' },
  { id: 'resigned', label: '체념', desc: '이미 한 번 죽었다는 것을 받아들였다.' },
];

export const TEMPER_BY_ID: Record<TemperId, TemperDef> =
  Object.fromEntries(TEMPERS.map((t) => [t.id, t])) as Record<TemperId, TemperDef>;
