/**
 * 생전 서사 — 개체가 죽기 전에 무엇이었고 어떻게 끝났는가.
 *
 * ── 왜 저장하지 않고 파생하는가 (이름과 다른 판단) ──────────
 * `identity.ts`는 이름을 **저장**한다. 요구가 "보유 중인 카드끼리 겹치지 않는다"는
 * **로스터 전역 제약**이라 개체 하나만 보고는 만족시킬 수 없기 때문이다.
 *
 * 서사에는 그 제약이 **없다.** 두 영웅이 같은 최후를 맞았어도 이상하지 않고,
 * 오히려 "같은 전장에서 죽은 둘"로 읽힌다. 유일성이 필요 없으므로 저장할 이유도 없다.
 *
 * 파생의 이점은 **세이브가 커지지 않는다**는 것이다. 서사는 순수 표시용이라
 * 세이브 스키마에 넣으면 전투와 무관한 문자열이 개체마다 쌓인다.
 * (`potentialOf`·`portraitVariant`가 같은 이유로 파생이다 — gdd-v3 §7)
 *
 * ── 왜 별도 스트림인가 ──────────────────────────────────
 * `rng.ts`가 이 용도를 미리 적어놨다:
 *
 * > "스트림을 나누는 이유는 추가 안정성이다. 나중에 **재능·성격**을 새 스트림에
 * >  붙여도 이미 뽑힌 영웅의 잠재치는 한 비트도 변하지 않는다."
 *
 * `STREAM.ORIGIN`을 **맨 뒤에 추가**했으므로 기존 개체의 잠재치·초상·발굴이
 * 전부 그대로다. 번호를 재배치하면 무덤 기록이 전부 거짓이 된다(`rng.ts:40`).
 *
 * ── 등급이 곧 지위다 ────────────────────────────────────
 * 원작의 "태생 등급"을 재현한다. 지위는 `star`가 고르고 최후는 그와 독립이다.
 * 근거와 톤은 `data/origins.ts`의 주석에 있다.
 *
 * ⚠️ **승급하면 서사의 지위가 바뀐다.** ★2로 뽑아 ★4로 올린 개체는 ★4의 지위를
 * 읽는다. 이상해 보이지만 의도다 — 이 게임에서 승급은 "더 강해졌다"가 아니라
 * **"더 대단한 존재로 다시 불려나왔다"**이고, 그래야 등급이 인물의 무게로 읽힌다.
 * 최후(`ENDINGS`)는 seed만 보므로 승급해도 변하지 않는다 — 죽은 방식은 사실이니까.
 */
import type { HeroInstance, Star } from './types';
import { STREAM, rngPick, substream } from './rng';
import { ENDINGS, STATIONS } from './data/origins';

export interface Origin {
  /** 생전의 지위. 등급이 정한다 */
  station: string;
  /** 어떻게 끝났는가. 등급과 독립 */
  ending: string;
}

/**
 * 개체의 생전 서사.
 *
 * seed가 없는 개체(이 필드 이전 세이브)는 `null`을 돌려준다 —
 * 빈 문자열을 만들면 화면이 빈 패널을 그린다. 호출부가 유무를 판단해야 한다.
 * (`potentialOf`가 seed 없을 때 계수 0으로 떨어지는 것과 같은 성격의 폴백이다)
 */
export function deriveOrigin(seed: number | undefined, star: Star): Origin | null {
  if (seed === undefined) return null;

  const rng = substream(seed, STREAM.ORIGIN);
  /*
    소비 순서: station → ending.
    바꾸면 기존 개체의 서사가 통째로 재배치된다. 밸런스에는 영향이 없지만
    (표시 전용) 무덤에 적힌 문장과 갈리므로 순서를 고정한다.
  */
  const station = rngPick(rng, STATIONS[star]);
  const ending = rngPick(rng, ENDINGS);
  return { station, ending };
}

/** 개체에서 바로 읽는 편의 함수. 화면은 이쪽을 쓴다. */
export function originOf(inst: HeroInstance): Origin | null {
  return deriveOrigin(inst.seed, inst.star);
}

/**
 * 한 문단으로 이어 붙인다.
 *
 * 화면마다 다른 방식으로 조립하면 같은 개체가 화면마다 다르게 읽힌다
 * (§5-48: 같은 값을 여러 화면에서 보여줄 때 서식은 한 곳에서 정한다).
 */
export function originText(o: Origin): string {
  return `${o.station}. ${o.ending}.`;
}
