import { describe, it, expect } from 'vitest';
import {
  partyLimitAt, squadsOpen, SQUAD_COUNT, SQUAD_OPEN_ROSTER, SQUAD_OPEN_FLOOR,
} from './data/party';

describe('partyLimitAt — 층 구간별 정원', () => {
  it('손으로 짠 구간(1~20층)은 3인이다', () => {
    // 검증된 승률 표(6층 70%, 12층 43%, 20층 55%)가 3인 기준이라 여기가 바뀌면 안 된다
    expect(partyLimitAt(1)).toBe(3);
    expect(partyLimitAt(20)).toBe(3);
  });

  it('생성 구간(21층~)은 5인이다', () => {
    expect(partyLimitAt(21)).toBe(5);
    expect(partyLimitAt(100)).toBe(5);
  });

  it('경계는 20/21층이다', () => {
    expect(partyLimitAt(20)).not.toBe(partyLimitAt(21));
  });

  it('범위 밖 입력도 정원을 돌려준다 — 화면이 방어 없이 부른다', () => {
    expect(partyLimitAt(0)).toBe(3);
    expect(partyLimitAt(-5)).toBe(3);
  });
});

describe('squadsOpen — 2군 개방 조건', () => {
  it('로스터 8인 이상 AND 21층 이상 도달해야 열린다', () => {
    expect(squadsOpen(8, 21)).toBe(true);
  });

  it('로스터가 모자라면 안 열린다', () => {
    expect(squadsOpen(7, 21)).toBe(false);
  });

  it('21층에 도달 못 했으면 안 열린다', () => {
    expect(squadsOpen(8, 20)).toBe(false);
  });

  it('둘 다 모자라면 안 열린다', () => {
    expect(squadsOpen(3, 1)).toBe(false);
  });
});

describe('상수', () => {
  it('2군까지 두 개다', () => {
    expect(SQUAD_COUNT).toBe(2);
  });

  it('개방 조건은 로스터 8인 · 21층이다', () => {
    // 1군 5 + 2군 3 = 8. 개방 시점에 1군을 채우고도 2군이 3인 남는다
    expect(SQUAD_OPEN_ROSTER).toBe(8);
    expect(SQUAD_OPEN_FLOOR).toBe(21);
  });
});
