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
   * 기질·대사는 파생이지만 유언은 **문장으로 저장한다.** AI가 쓴 문장은 다시 만들 수
   * 없고, 무덤에 적힌 말은 나중에 대사 표를 고쳐도 바뀌면 안 된다.
   * 선택적인 이유: 이 필드 이전의 기록, 그리고 seed 없는 옛 개체(말하지 않는다).
   */
  lastWords?: string;
  /** 누가 쓴 유언인가. 'ai'면 무덤에 표식을 단다 — 플레이어의 키로 만든 문장이다 */
  lastWordsBy?: 'ai' | 'template';
  /** AI가 쓴 비문 한 줄(3인칭). 템플릿 대체는 없다 — 없으면 안 그린다 */
  epitaph?: string;
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
}
