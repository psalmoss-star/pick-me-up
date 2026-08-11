import { describe, it, expect } from 'vitest';
import { deriveBeats, type BeatContext, type BeatUnit } from './beats';
import type { BattleEvent } from './types';

const hero = (uid: string, name: string, maxHp = 1000): BeatUnit => ({
  uid, name, maxHp, kind: 'hero',
});
const guard = (
  uid: string, name: string, guardKind: 'objective' | 'npc', maxHp = 1000,
): BeatUnit => ({ uid, name, maxHp, kind: 'guard', guardKind });
const enemy = (uid: string, name: string, maxHp = 1000): BeatUnit => ({
  uid, name, maxHp, kind: 'enemy',
});

const ctx = (roster: BeatUnit[], bossName?: string): BeatContext => ({ roster, bossName });

const dmg = (target: string, amount: number): BattleEvent =>
  ({ turn: 1, type: 'damage', targetUids: [target], amount });
const heal = (target: string, amount: number): BattleEvent =>
  ({ turn: 1, type: 'heal', targetUids: [target], amount });
const death = (target: string): BattleEvent =>
  ({ turn: 1, type: 'death', targetUids: [target] });

describe('보스 조우', () => {
  it('bossName이 있으면 맨 앞(at=0)에 경고 비트를 넣는다', () => {
    const beats = deriveBeats([], ctx([enemy('E:0', '골렘')], '균열의 골렘'));
    expect(beats).toHaveLength(1);
    expect(beats[0].at).toBe(0);
    expect(beats[0].tone).toBe('warning');
    expect(beats[0].lines[0]).toContain('균열의 골렘');
  });

  it('bossName이 없으면 조우 비트가 없다', () => {
    expect(deriveBeats([], ctx([enemy('E:0', '슬라임')]))).toHaveLength(0);
  });
});

describe('영웅 사망', () => {
  it('영웅이 죽으면 되살릴 수 없다는 비트가 뜬다', () => {
    const beats = deriveBeats([death('A:h1')], ctx([hero('A:h1', '재의 카일')]));
    expect(beats).toHaveLength(1);
    expect(beats[0].tone).toBe('death');
    expect(beats[0].title).toBe('영웅 사망');
    expect(beats[0].lines.join(' ')).toContain('되살릴 수 없습니다');
  });

  it('적이 죽는 것은 비트가 되지 않는다', () => {
    expect(deriveBeats([death('E:0')], ctx([enemy('E:0', '슬라임')]))).toHaveLength(0);
  });

  it('비트의 at은 해당 이벤트 다음 인덱스를 가리킨다', () => {
    const events = [dmg('A:h1', 10), dmg('A:h1', 10), death('A:h1')];
    const beats = deriveBeats(events, ctx([hero('A:h1', '카일')]));
    expect(beats[0].at).toBe(3);
  });
});

describe('보호 대상 경고', () => {
  it('절반 이하로 떨어지면 경고한다', () => {
    const beats = deriveBeats(
      [dmg('G:objective:gate', 600)],
      ctx([guard('G:objective:gate', '성문', 'objective', 1000)]),
    );
    expect(beats).toHaveLength(1);
    expect(beats[0].tone).toBe('warning');
    expect(beats[0].lines[1]).toContain('파괴되면');
  });

  it('경고는 유닛당 한 번만 발생한다', () => {
    const beats = deriveBeats(
      [dmg('G:objective:gate', 600), dmg('G:objective:gate', 100), dmg('G:objective:gate', 100)],
      ctx([guard('G:objective:gate', '성문', 'objective', 1000)]),
    );
    expect(beats.filter((b) => b.title === '경고')).toHaveLength(1);
  });

  it('절반 위로 남아있으면 경고하지 않는다', () => {
    const beats = deriveBeats(
      [dmg('G:objective:gate', 400)],
      ctx([guard('G:objective:gate', '성문', 'objective', 1000)]),
    );
    expect(beats).toHaveLength(0);
  });

  it('한 방에 파괴되면 경고 없이 실패 비트만 뜬다', () => {
    const beats = deriveBeats(
      [dmg('G:objective:gate', 1000), death('G:objective:gate')],
      ctx([guard('G:objective:gate', '성문', 'objective', 1000)]),
    );
    expect(beats.map((b) => b.title)).toEqual(['임무 실패']);
  });

  it('회복으로 절반 위로 올라갔다 다시 내려와도 경고는 한 번뿐', () => {
    const beats = deriveBeats(
      [dmg('G:npc:p', 600), heal('G:npc:p', 400), dmg('G:npc:p', 400)],
      ctx([guard('G:npc:p', '황녀', 'npc', 1000)]),
    );
    expect(beats.filter((b) => b.title === '경고')).toHaveLength(1);
  });

  it('NPC와 오브젝트는 실패 문구가 다르다', () => {
    const npc = deriveBeats(
      [dmg('G:npc:p', 600)],
      ctx([guard('G:npc:p', '황녀', 'npc', 1000)]),
    );
    expect(npc[0].lines[1]).toContain('쓰러지면');
  });

  it('보호 대상이 죽으면 임무 실패 비트가 뜬다', () => {
    const beats = deriveBeats(
      [death('G:npc:p')],
      ctx([guard('G:npc:p', '황녀', 'npc')]),
    );
    expect(beats[0].title).toBe('임무 실패');
    expect(beats[0].lines[0]).toContain('황녀');
  });
});

describe('정렬 및 견고성', () => {
  it('비트는 at 오름차순으로 정렬된다 (보스 비트가 항상 먼저)', () => {
    const events = [dmg('A:h1', 10), death('A:h1')];
    const beats = deriveBeats(events, ctx([hero('A:h1', '카일')], '골렘'));
    expect(beats.map((b) => b.at)).toEqual([0, 2]);
  });

  it('로스터에 없는 uid는 조용히 무시한다', () => {
    const beats = deriveBeats([dmg('X:없음', 999), death('X:없음')], ctx([hero('A:h1', '카일')]));
    expect(beats).toHaveLength(0);
  });

  it('전체 공격(대상 여럿)에서도 각 대상이 개별 평가된다', () => {
    const multi: BattleEvent = {
      turn: 1, type: 'damage', targetUids: ['G:npc:a', 'G:npc:b'], amount: 600,
    };
    const beats = deriveBeats(
      [multi],
      ctx([guard('G:npc:a', '황녀', 'npc', 1000), guard('G:npc:b', '기사', 'npc', 1000)]),
    );
    expect(beats).toHaveLength(2);
  });
});
