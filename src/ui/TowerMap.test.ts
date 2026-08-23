import { describe, it, expect } from 'vitest';
import { stateOf } from './TowerMap';

/**
 * 층 칸 상태 판정.
 *
 * ⚠️ 이 테스트가 없어서 STEP 29의 회귀가 그대로 통과했다.
 * `floorIndex`와 `maxFloorReached`가 갈린 뒤에도 `stateOf`가 `floorIndex`로
 * 잠금을 판정하고 있었고, 실기기에서야 "1층을 고르면 2층이 사라진다"로 드러났다.
 *
 * 인덱스는 0부터다 — `index 0` = 1층, `index 1` = 2층.
 */
describe('stateOf — 잠금은 해금 상한 기준', () => {
  it('재도전으로 아래층을 골라도 위층이 잠기지 않는다', () => {
    // 2층까지 열어 둔 채(maxFloorReached=1) 1층을 고른 상태(current=0).
    // 실기기에서 보고된 바로 그 상황이다.
    expect(stateOf(1, 0, false, 1)).not.toBe('locked');
  });

  it('고른 층이 현재로 표시된다', () => {
    expect(stateOf(0, 0, false, 1)).toBe('now');
  });

  it('해금 상한 위는 잠긴다', () => {
    // 1층만 열린 상태에서 2층은 아직 모르는 층이다.
    expect(stateOf(1, 0, false, 0)).toBe('locked');
  });

  it('상한 안에서 고르지 않은 층은 done이다', () => {
    // 2층을 고른 채(current=1) 1층은 이미 깬 층으로 남는다.
    expect(stateOf(0, 1, false, 1)).toBe('done');
  });

  it('완주하면 상한 안의 전 층이 done이다', () => {
    // 정상 클리어 후에는 current가 마지막 층에 묶여도 '현재'로 남으면 안 된다.
    expect(stateOf(0, 5, true, 5)).toBe('done');
    expect(stateOf(5, 5, true, 5)).toBe('done');
  });

  it('완주해도 상한 위는 여전히 잠긴다', () => {
    expect(stateOf(6, 5, true, 5)).toBe('locked');
  });

  it('진행도(done 개수)가 재도전으로 되돌아가지 않는다', () => {
    // 헤더의 `doneCount`가 같은 함수를 쓴다. 1층을 고른다고 1/20이 0/20이 되면 안 된다.
    const atFloor2 = [0, 1].filter((i) => stateOf(i, 1, false, 1) === 'done').length;
    const revisitFloor1 = [0, 1].filter((i) => stateOf(i, 0, false, 1) === 'done').length;
    expect(revisitFloor1).toBe(atFloor2);
  });
});
