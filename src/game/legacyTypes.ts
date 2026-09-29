/**
 * 무덤(영구 기록) 타입.
 *
 * ── 왜 types.ts가 아닌가 ───────────────────────────────
 * types.ts는 **런 상태**의 도메인 모델이다. 무덤은 런을 넘어 살아남는 별개 축이라
 * 같은 파일에 두면 "이건 리셋되나?"를 매번 판단해야 한다.
 *
 * ── 왜 stores/가 아닌가 ────────────────────────────────
 * 화면(GraveScreen)도 이 타입을 읽는데, 화면이 stores/의 타입을 import하면
 * 저장 구현과 표시가 얽힌다. 타입은 게임 계층에 두고 저장은 stores/legacy.ts가 한다.
 */
import type { CodexEntry, HeroDefId, Star } from './types';
import type { Deed } from './chronicle';

/** 죽은 영웅 하나. 이름은 영구히 봉인된다. */
export interface FallenRecord {
  /** 봉인된 이름. 표시와 중복 회피 양쪽에 쓴다 */
  name: string;
  title: string;
  star: Star;
  /** 초상화용. 아트는 재사용이 허용된다(이름이 다르면 다른 인물로 읽힌다) */
  defId: HeroDefId;
  /** 죽은 층 */
  floorId: number;
  /** 죽는 순간의 발굴 진행도 0~1. "알아내던 중에 잃었다" */
  revealProgress: number;
  runNo: number;
  /**
   * 유언. gdd-v3 §4.10.
   *
   * 기질·대사는 파생이지만 유언은 **문장으로 저장한다.** 무덤에 적힌 말은
   * 나중에 대사 표를 고쳐도 바뀌면 안 된다(죽은 사람이 한 말은 사실이다).
   * 선택적인 이유: 이 필드 이전의 기록, 그리고 seed 없는 옛 개체(말하지 않는다).
   */
  lastWords?: string;
  /**
   * 생전의 책략 — 「박망파에서 불을 놓은 자」. 죽는 전투의 책략까지 포함한다.
   * 선택적인 이유: 책략을 한 번도 안 한 영웅과 이 필드 이전의 기록.
   */
  deeds?: Deed[];
}

/** 끝난 런 하나. 진행 중인 런은 여기 없다. */
export interface RunRecord {
  runNo: number;
  /** 도달한 최고 층 (1-based) */
  reachedFloor: number;
  cleared: boolean;
  deaths: number;
  summons: number;
  endedAt: number;
}

/** 정상에 선 파티. 회차당 최대 1건 */
export interface SummitRecord {
  runNo: number;
  heroes: { name: string; title: string; star: Star; defId: HeroDefId }[];
}

export interface Legacy {
  version: number;
  /** 현재 회차 (1부터) */
  runNo: number;
  runs: RunRecord[];
  fallen: FallenRecord[];
  summit: SummitRecord[];
  /**
   * 도감은 회차를 넘어 유지된다 — 계승 없음 원칙의 **명시적 예외**다.
   * 전력에 영향을 주지 않아 밸런스가 안 움직이고, 회차마다 비우면
   * 수집 요소가 성립하지 않는다.
   */
  codex: Record<HeroDefId, CodexEntry>;
  /**
   * 한 번이라도 만난 전설의 id(gdd-v3 §4.11). 도감의 전설 칸이 "만남/미발견"을 가른다.
   * 봉인 여부는 따로 저장하지 않는다 — `fallen`에 그 이름이 있으면 봉인이다(한 곳에서만 판정).
   * 도감과 같은 이유로 회차를 넘어 남는다(전력에 영향 없음).
   */
  legendsMet: string[];
}
