/**
 * 카드 이름 표시 규칙 — `≪ ≫` 장식을 언제 떼는가.
 *
 * ── 이 스위트가 지키는 것 ──────────────────────────────
 * **이름이 잘리지 않는 것.** 개체 이름은 이 게임에서 정체성이다
 * (CLAUDE.md: "같은 이름의 영웅이 둘 존재하면 안 되고, 그게 화면에 보여야 한다").
 * 장식 때문에 이름이 밀려 `재의 카일…`처럼 성씨만 남으면 그 규칙이 화면에서 깨진다.
 *
 * 실측 배경 (2026-08-14, 폰 스크린샷에서 발견):
 * 합성 화면 카드(92px) 9장이 **전부** 잘려 있었다. 11px 글자에서 최장 이름
 * `모래바람의 아이비`는 장식 포함 115px이 필요한데 가용 폭은 72px뿐이었다.
 */
import { describe, it, expect } from 'vitest';
import { fitsOrnament } from './HeroCard';

/** 카드 폭 → 이름 글자 크기. HeroCard의 계산과 같아야 한다. */
const nameSizeFor = (width: number) => Math.max(11, Math.round(12 * (width / 130)));

/** 실제 쓰이는 카드 폭들 — 합성/파티 92, 상세 100, 기본 130, 로스터 150 */
const WIDTHS = [92, 100, 130, 150];

describe('fitsOrnament — 장식을 붙여도 이름이 안 잘리는가', () => {
  /*
    ⚠️ 이 프로젝트가 실제로 밟은 오답 두 개를 테스트로 박아둔다.
    둘 다 "그럴듯하지만 틀린" 규칙이라 주석만으로는 다시 도입될 수 있다.
  */
  it('폭만으로 판단하지 않는다 — 넓은 카드도 최장 이름은 장식을 못 단다', () => {
    // 처음엔 `width >= 112`로 뒀다가 150px 로스터 카드에서 잘렸다.
    const worst = '모래바람의 아이비'; // 9글자, 어휘상 최장
    for (const w of WIDTHS) {
      expect(fitsOrnament(worst, w, nameSizeFor(w))).toBe(false);
    }
  });

  it('글자 수만으로도 판단하지 않는다 — 같은 길이가 폭에 따라 갈린다', () => {
    const short = '재의 카일'; // 5글자
    // 좁은 카드에서는 안 되고
    expect(fitsOrnament(short, 92, nameSizeFor(92))).toBe(false);
    // 넓은 카드에서는 된다 — 길이가 같은데 결과가 다르다
    expect(fitsOrnament(short, 130, nameSizeFor(130))).toBe(true);
  });

  it('짧은 이름은 넓은 카드에서 장식을 유지한다', () => {
    // 장식은 여유가 있을 때의 톤이다. 무조건 떼면 카드가 밋밋해진다.
    expect(fitsOrnament('재의 온', 130, nameSizeFor(130))).toBe(true);
    expect(fitsOrnament('재의 온', 150, nameSizeFor(150))).toBe(true);
  });

  /*
    ⚠️ 직관과 반대되는 성질이라 적어둔다 — **카드를 키워도 장식이 쉬워지지 않는다.**
    글자가 폭에 비례해 커지므로(12/130 ≈ 0.092px/px) 필요 폭이 `(len+4)*0.092`씩 늘고,
    가용 폭은 1px씩 늘어난다. len+4 > 10.8, 즉 **7글자 이상이면 넓힐수록 오히려 불리하다.**
    "150px 카드니까 들어가겠지"라고 넘겨짚다가 실제로 잘렸다.
  */
  it('7글자 이상은 카드를 키워도 장식이 안 들어간다', () => {
    const long = '물결의 이스카'; // 7글자
    for (const w of [...WIDTHS, 200, 300]) {
      expect(fitsOrnament(long, w, nameSizeFor(w))).toBe(false);
    }
  });

  /*
    보수적으로 틀려야 한다 — 장식이 빠지는 것은 눈에 안 띄지만
    이름이 잘리면 개체를 구분할 수 없게 된다. 그래서 경계에서는 false 쪽으로.
  */
  it('경계에서는 장식을 빼는 쪽으로 틀린다', () => {
    const name = '북풍의 리엔'; // 6글자
    // 92px: (6+4)*11 = 110 > 72(=92-20) → 뗀다
    expect(fitsOrnament(name, 92, nameSizeFor(92))).toBe(false);
    // 150px에서도 (6+4)*14 = 140 > 130 → 여전히 뗀다
    expect(fitsOrnament(name, 150, nameSizeFor(150))).toBe(false);
  });

  it('빈 이름이어도 터지지 않는다', () => {
    expect(typeof fitsOrnament('', 130, 12)).toBe('boolean');
  });
});
