/**
 * 층 데이터의 불변조건.
 *
 * 층은 앞으로 계속 늘어난다(목표 100층). 데이터가 늘 때 조용히 깨지는 것들 —
 * 존재하지 않는 적 id, 임무와 맞지 않는 보호 대상, 범위를 벗어난 targetIndex —
 * 은 타입으로 못 잡고 전투 중에야 터진다. 여기서 막는다.
 */
import { describe, expect, it } from 'vitest';
import {
  FLOORS,
  FLOOR_SEGMENTS,
  floorAt,
  floorRewards,
  isFinalFloor,
  segmentIndexOfFloor,
} from './data/floors';
import {
  generateFloor,
  HANDCRAFTED_UNTIL,
  NAME_REPEAT_GAP,
  PLACE_REPEAT_GAP,
} from './data/floorgen';
import { enemies } from './data/sample';
import type { SceneKind } from '../ui/art/Scene';

describe('층 데이터', () => {
  it('id가 1부터 빈틈없이 이어진다', () => {
    expect(FLOORS.map((f) => f.id)).toEqual(
      FLOORS.map((_, i) => i + 1),
    );
  });

  it('모든 적 id가 실제로 정의돼 있다', () => {
    for (const floor of FLOORS) {
      expect(floor.enemyIds.length).toBeGreaterThan(0);
      for (const id of floor.enemyIds) {
        expect(enemies[id], `${floor.id}층의 적 ${id}`).toBeDefined();
      }
    }
  });

  it('수비/호위 임무에는 그에 맞는 보호 대상이 있다', () => {
    // 이게 없으면 임무가 성립하지 않는다 — 적이 오브젝트를 무시해 무한정 이긴다.
    for (const floor of FLOORS) {
      if (floor.mission.kind === 'defend') {
        expect(floor.guards?.some((g) => g.kind === 'objective'), `${floor.id}층`).toBe(true);
      }
      if (floor.mission.kind === 'escort') {
        expect(floor.guards?.some((g) => g.kind === 'npc'), `${floor.id}층`).toBe(true);
      }
    }
  });

  it('보호 대상이 없는 임무에는 guards를 두지 않는다', () => {
    for (const floor of FLOORS) {
      if (floor.mission.kind === 'defend' || floor.mission.kind === 'escort') continue;
      expect(floor.guards ?? [], `${floor.id}층`).toHaveLength(0);
    }
  });

  it('턴 제한이 필요한 임무에는 turns가 있다', () => {
    for (const floor of FLOORS) {
      if (['survive', 'defend', 'escape'].includes(floor.mission.kind)) {
        expect(floor.mission.turns, `${floor.id}층`).toBeGreaterThan(0);
      }
    }
  });

  it('탈취 임무의 targetIndex가 적 배열 범위 안에 있다', () => {
    // 범위를 벗어나면 evaluateMission이 영원히 ongoing을 반환해 전투가 끝나지 않는다.
    for (const floor of FLOORS) {
      if (floor.mission.kind !== 'seize') continue;
      const idx = floor.mission.targetIndex ?? 0;
      expect(idx, `${floor.id}층`).toBeLessThan(floor.enemyIds.length);
      expect(idx).toBeGreaterThanOrEqual(0);
    }
  });

  it('guard id가 층 안에서 중복되지 않는다', () => {
    for (const floor of FLOORS) {
      const ids = (floor.guards ?? []).map((g) => g.id);
      expect(new Set(ids).size, `${floor.id}층`).toBe(ids.length);
    }
  });

  it('scene이 Scene 컴포넌트가 아는 종류다', () => {
    const known: SceneKind[] = ['ruins', 'field', 'outpost', 'gate', 'corridor', 'chasm'];
    for (const floor of FLOORS) {
      expect(known, `${floor.id}층`).toContain(floor.scene);
    }
  });

  it('브리핑 문구가 비어 있지 않다', () => {
    for (const floor of FLOORS) {
      expect(floor.mission.briefing.trim().length, `${floor.id}층`).toBeGreaterThan(0);
    }
  });

  it('마지막 층은 보스층이다', () => {
    expect(FLOORS[FLOORS.length - 1].isBoss).toBe(true);
  });

  /**
   * §5-11 — 도발 적이 하나도 없으면 적들이 힐러를 직접 때려 승률이 0%/100%로 굳고
   * 수치 조정이 먹지 않는다. 10층에서 실제로 겪었고, 상층을 짤 때 또 밟을 뻔했다.
   * "구성이 먼저, 수치는 그 다음"을 데이터 차원에서 잠근다.
   */
  it('고화력 적이 둘 이상인 층에는 도발 적이 있다', () => {
    // 단일 고화력(breaker)이 겹치면 힐러가 먼저 죽고, 그때부터 결과가 이분법이 되어
    // 수치를 아무리 조정해도 표가 안 움직인다. 10층에서 겪었고 16층에서 재현됐다
    // (원귀 2기 → 승률 8%, 사망 2.85). 광역 딜러는 이 함정을 만들지 않으므로 제외한다.
    const roleOf = (id: string) => Object.values(enemies).find((e) => e.id === id)?.role;
    const taunts = new Set(
      Object.values(enemies)
        .filter((e) => e.skillIds.includes('sk_taunt_hit' as never))
        .map((e) => e.id),
    );
    for (const floor of FLOORS) {
      const breakers = floor.enemyIds.filter((id) => roleOf(id) === 'breaker').length;
      if (breakers < 2) continue;
      expect(
        floor.enemyIds.some((id) => taunts.has(id)),
        `${floor.id}층 — breaker가 ${breakers}기인데 도발이 없으면 힐러부터 죽는다`,
      ).toBe(true);
    }
  });

  it('손으로 짠 상층(13~20)은 같은 적 구성을 두 번 쓰지 않는다', () => {
    // 구성이 같으면 사실상 같은 전투가 된다 — 실제로 13·16층이
    // 79%/사망1.01/턴10.6으로 수치까지 완전히 동일했다.
    //
    // 저층 3·4층([hound,hound])은 임무 유형을 가르치는 의도적 반복이고,
    // 10·11층([revenant,warden,slime])은 임무가 달라 승률이 갈린다(61% vs 63%) —
    // 둘 다 기존에 검증된 밸런스라 지금 와서 강제하지 않는다.
    const seen = new Map<string, number>();
    for (const floor of FLOORS) {
      if (floor.id < 13 || floor.id > HANDCRAFTED_UNTIL) continue;
      const key = [...floor.enemyIds].sort().join(',');
      const prev = seen.get(key);
      expect(prev, `${floor.id}층이 ${prev}층과 적 구성이 같다`).toBeUndefined();
      seen.set(key, floor.id);
    }
  });

  /**
   * 생성 구간(21~)은 **완전 무중복을 요구하지 않는다.**
   * 적 풀이 6~7종인데 3~4기를 뽑아 80층을 채우므로 비둘기집 원리상 겹칠 수밖에 없다.
   * 실제로 문제가 되는 것은 "가까운 층이 똑같이 느껴지는 것"이므로 **간격**을 잠근다.
   */
  it('생성 구간은 가까운 층끼리 같은 구성을 쓰지 않는다', () => {
    const MIN_GAP = 8;
    const lastSeen = new Map<string, number>();
    for (const floor of FLOORS) {
      if (floor.id <= HANDCRAFTED_UNTIL) continue;
      const key = [...floor.enemyIds].sort().join(',');
      const prev = lastSeen.get(key);
      if (prev != null) {
        expect(
          floor.id - prev,
          `${floor.id}층이 ${prev}층과 구성이 같다 (간격 ${floor.id - prev} < ${MIN_GAP})`,
        ).toBeGreaterThanOrEqual(MIN_GAP);
      }
      lastSeen.set(key, floor.id);
    }
  });

  /**
   * 이름 중복은 구성 중복보다 **눈에 잘 띈다** — 화면 상단에 글자로 박혀 있기 때문이다.
   * 실측으로 '얼어붙은 제단'이 32·36층에 간격 4로 나왔고, 이 정도면 플레이 중에 바로 알아챈다.
   * 그래서 구성(간격 8)보다 큰 간격을 요구한다.
   */
  it('가까운 층끼리 같은 이름을 쓰지 않는다', () => {
    const lastSeen = new Map<string, number>();
    for (const floor of FLOORS) {
      const prev = lastSeen.get(floor.name);
      if (prev != null) {
        expect(
          floor.id - prev,
          `${floor.id}층이 ${prev}층과 이름이 같다 ('${floor.name}', 간격 ${floor.id - prev} < ${NAME_REPEAT_GAP})`,
        ).toBeGreaterThanOrEqual(NAME_REPEAT_GAP);
      }
      lastSeen.set(floor.name, floor.id);
    }
  });

  /**
   * 손으로 짠 층(1~20)은 플레이어가 **실제로 지나온** 층이라 이름을 기억한다.
   * 실측으로 100층이 19층과 똑같이 '잿빛 회랑'이었다 — 엔딩이 재탕 이름 위에서 떴다.
   */
  it('생성 층이 손으로 짠 층의 이름을 다시 쓰지 않는다', () => {
    const handcrafted = new Set(
      FLOORS.filter((f) => f.id <= HANDCRAFTED_UNTIL).map((f) => f.name),
    );
    for (const floor of FLOORS) {
      if (floor.id <= HANDCRAFTED_UNTIL) continue;
      expect(
        handcrafted.has(floor.name),
        `${floor.id}층 '${floor.name}'이 손으로 짠 층의 이름과 같다`,
      ).toBe(false);
    }
  });

  /**
   * 수식어만 갈아끼운 이름이 연달아 나오면 조합기라는 게 드러난다.
   * 실측으로 21·22층이 '창백한 옥좌' / '얼어붙은 옥좌'였고, 옥좌가 80층 중 11번 나왔다.
   */
  it('같은 장소어가 인접해서 반복되지 않는다', () => {
    const placeOf = (name: string) => name.slice(name.indexOf(' ') + 1);
    const lastSeen = new Map<string, number>();
    for (const floor of FLOORS) {
      if (floor.id <= HANDCRAFTED_UNTIL) continue;
      const place = placeOf(floor.name);
      const prev = lastSeen.get(place);
      if (prev != null) {
        expect(
          floor.id - prev,
          `${floor.id}층 '${floor.name}'이 ${prev}층과 장소어('${place}')가 같다`,
        ).toBeGreaterThanOrEqual(PLACE_REPEAT_GAP);
      }
      lastSeen.set(place, floor.id);
    }
  });

  it('최상층은 조합 이름을 쓰지 않는다', () => {
    // 엔딩이 뜨는 층이라 '무너진 중정' 같은 조합 이름이면 무게가 안 실린다.
    const summit = FLOORS[FLOORS.length - 1];
    expect(summit.id).toBe(100);
    expect(summit.name).toBe('잿불의 왕좌');
  });

  it('생성 구간의 구성 다양성이 충분하다', () => {
    // 70/80 정도가 나온다. 절반 아래로 떨어지면 생성기가 사실상 몇 가지만 반복하는 것이다.
    const keys = new Set<string>();
    let n = 0;
    for (const floor of FLOORS) {
      if (floor.id <= HANDCRAFTED_UNTIL) continue;
      keys.add([...floor.enemyIds].sort().join(','));
      n++;
    }
    expect(keys.size / n).toBeGreaterThan(0.7);
  });

  it('6종 임무가 모두 쓰인다', () => {
    // 생성 주기(CYCLE)에서 하나를 빠뜨리면 그 임무는 영영 안 나온다 — 실제로 escort가 빠져 있었다.
    const kinds = new Set(FLOORS.map((f) => f.mission.kind));
    for (const k of ['subjugate', 'survive', 'defend', 'escort', 'escape', 'seize']) {
      expect(kinds, `${k} 임무가 어느 층에도 없다`).toContain(k);
    }
  });

  it('보스는 10층마다 온다 (생성 구간)', () => {
    for (const floor of FLOORS) {
      if (floor.id <= HANDCRAFTED_UNTIL) continue;
      expect(!!floor.isBoss, `${floor.id}층`).toBe(floor.id % 10 === 0);
    }
  });

  it('같은 층 번호는 언제나 같은 층을 만든다 (결정적)', () => {
    // 생성이 결정적이지 않으면 세이브에 층 내용을 넣어야 하고,
    // sim으로 잰 승률이 다음 실행에서 달라져 밸런싱이 성립하지 않는다.
    for (const id of [21, 37, 50, 73, 100]) {
      expect(generateFloor(id)).toEqual(generateFloor(id));
    }
  });
});

/**
 * 미니맵이 100층을 접는 단위. UI가 구간 경계를 다시 적으면 `TIERS`를 고칠 때
 * 미니맵만 옛 경계로 남는다(§5-21) — 그래서 데이터에서 유도하고 여기서 잠근다.
 */
describe('FLOOR_SEGMENTS', () => {
  it('모든 층을 빈틈·겹침 없이 덮는다', () => {
    expect(FLOOR_SEGMENTS[0].from).toBe(1);
    expect(FLOOR_SEGMENTS[FLOOR_SEGMENTS.length - 1].to).toBe(FLOORS.length);
    for (let i = 1; i < FLOOR_SEGMENTS.length; i++) {
      expect(
        FLOOR_SEGMENTS[i].from,
        `${FLOOR_SEGMENTS[i - 1].name}과 ${FLOOR_SEGMENTS[i].name} 사이가 불연속`,
      ).toBe(FLOOR_SEGMENTS[i - 1].to + 1);
    }
    const total = FLOOR_SEGMENTS.reduce((n, s) => n + (s.to - s.from + 1), 0);
    expect(total).toBe(FLOORS.length);
  });

  it('손으로 짠 구간이 생성 구간과 섞이지 않는다', () => {
    // 경계가 밀리면 미니맵이 21층을 '기슭'으로 접어 생성 구간 시작이 흐려진다.
    expect(FLOOR_SEGMENTS[0].to).toBe(HANDCRAFTED_UNTIL);
    expect(FLOOR_SEGMENTS[1].from).toBe(HANDCRAFTED_UNTIL + 1);
  });

  it('모든 층이 자기 구간으로 매핑된다', () => {
    for (const f of FLOORS) {
      const seg = FLOOR_SEGMENTS[segmentIndexOfFloor(f.id)];
      expect(f.id >= seg.from && f.id <= seg.to, `${f.id}층이 '${seg.name}'에 안 들어간다`).toBe(true);
    }
  });

  it('범위를 벗어난 층도 구간을 돌려준다', () => {
    // 미니맵은 clamp된 인덱스를 넘기지만, 방어적으로 -1을 내면 렌더가 깨진다.
    expect(FLOOR_SEGMENTS[segmentIndexOfFloor(0)]).toBeDefined();
    expect(FLOOR_SEGMENTS[segmentIndexOfFloor(9999)]).toBeDefined();
  });
});

describe('floorAt', () => {
  it('범위를 벗어나면 양끝으로 고정한다', () => {
    expect(floorAt(-5)).toBe(FLOORS[0]);
    expect(floorAt(0)).toBe(FLOORS[0]);
    expect(floorAt(FLOORS.length + 99)).toBe(FLOORS[FLOORS.length - 1]);
  });
});

describe('isFinalFloor', () => {
  /**
   * runStore.finish()와 ResultScreen(엔딩 표시)이 같은 판정을 쓴다.
   * 결과 화면은 finish()보다 먼저 뜨므로 towerCleared를 읽을 수 없어
   * 판정을 각자 하게 되는데, 식이 갈리면 엔딩이 안 뜨거나 엉뚱한 층에서 뜬다(§5-17).
   */
  it('마지막 층에서만 참이다', () => {
    expect(isFinalFloor(FLOORS.length - 1)).toBe(true);
    expect(isFinalFloor(FLOORS.length - 2)).toBe(false);
    expect(isFinalFloor(0)).toBe(false);
  });

  it('클램프 범위를 넘어가도 참이다', () => {
    // floorAt이 클램프하므로 인덱스가 넘칠 수 있다. 그때도 "끝"이어야 한다.
    expect(isFinalFloor(FLOORS.length + 10)).toBe(true);
  });

  it('층을 늘리면 판정도 따라 옮겨간다', () => {
    // 숫자를 박아두면 층 확장 때 조용히 중간 층이 엔딩이 된다.
    const top = FLOORS[FLOORS.length - 1];
    expect(top.isBoss).toBe(true);
    expect(isFinalFloor(FLOORS.indexOf(top))).toBe(true);
  });
});

describe('floorRewards', () => {
  it('보스층이 일반 층보다 승급석을 많이 준다', () => {
    const boss = FLOORS.find((f) => f.isBoss)!;
    const normal = FLOORS.find((f) => !f.isBoss)!;
    expect(floorRewards(boss, 5).promotionStones)
      .toBeGreaterThan(floorRewards(normal, 5).promotionStones);
  });

  it('턴이 길수록 보상이 늘어난다', () => {
    const f = FLOORS[0];
    expect(floorRewards(f, 10).exp).toBeGreaterThan(floorRewards(f, 3).exp);
    expect(floorRewards(f, 10).gold).toBeGreaterThan(floorRewards(f, 3).gold);
  });

  /**
   * 깊은 층이 더 준다.
   *
   * 예전 공식(turnsElapsed * 20)은 층을 아예 안 봐서 **20층과 1층 보상이 같았다.**
   * 그러면 파티가 자라지 않아 구간을 이어 오를 수 없다(층은 어려워지는데 영웅은 그대로).
   */
  it('같은 턴이면 깊은 층이 더 많은 보상을 준다', () => {
    const turns = 8;
    for (let i = 1; i < FLOORS.length; i++) {
      const prev = floorRewards(FLOORS[i - 1], turns);
      const cur = floorRewards(FLOORS[i], turns);
      expect(cur.exp, `${FLOORS[i].id}층 exp`).toBeGreaterThan(prev.exp);
      expect(cur.gold, `${FLOORS[i].id}층 gold`).toBeGreaterThanOrEqual(prev.gold);
    }
  });

  it('exp가 금보다 가파르게 오른다', () => {
    // 금이 exp만큼 급증하면 상점·강화가 등반보다 강해진다.
    const first = floorRewards(FLOORS[0], 8);
    const last = floorRewards(FLOORS[FLOORS.length - 1], 8);
    expect(last.exp / first.exp).toBeGreaterThan(last.gold / first.gold);
  });
});
