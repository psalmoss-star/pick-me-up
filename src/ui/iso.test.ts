import { describe, it, expect } from 'vitest';
import { iso, pts, depth, projectPin, OX, OY, HW, HH, ZH } from './iso';
import { VILLAGE_LOTS } from './IsoVillage';

describe('iso 투영', () => {
  it('원점은 OX/OY로 간다', () => {
    expect(iso(0, 0, 0)).toEqual([OX, OY]);
  });

  /*
    아이소메트릭의 정의 그 자체 — x는 오른쪽 아래로, y는 왼쪽 아래로 간다.
    부호가 뒤집히면 섬이 거울상이 되어 건물 배치가 전부 반대편에 선다.
  */
  it('x가 늘면 오른쪽 아래로, y가 늘면 왼쪽 아래로 간다', () => {
    expect(iso(1, 0)).toEqual([OX + HW, OY + HH]);
    expect(iso(0, 1)).toEqual([OX - HW, OY + HH]);
  });

  it('z는 화면에서 위로 올린다', () => {
    const ground = iso(2, 2, 0);
    const raised = iso(2, 2, 1);
    expect(raised[0]).toBe(ground[0]);
    expect(raised[1]).toBe(ground[1] - ZH);
  });

  /*
    ⚠️ 이게 깨지면 건물이 공중에 뜬다.
    같은 (x,y)의 z=0은 반드시 같은 점이어야 접지선이 유지된다.
  */
  it('같은 격자의 접지점은 항상 같다', () => {
    expect(iso(3, 4, 0)).toEqual(iso(3, 4, 0));
    expect(iso(3, 4, 5)[0]).toBe(iso(3, 4, 0)[0]);
  });
});

describe('depth', () => {
  /*
    SVG는 문서 순서가 곧 깊이다. 이 값으로 정렬하지 않으면
    뒤 건물이 앞 건물 위에 얹혀 원근이 무너진다 — z-index로는 못 고친다.
  */
  it('x+y가 클수록 앞이다', () => {
    expect(depth(0, 0)).toBeLessThan(depth(1, 1));
    expect(depth(5, 0)).toBe(depth(0, 5));
  });

  it('정렬하면 뒤에서 앞 순서가 된다', () => {
    const items = [{ x: 4, y: 4 }, { x: 0, y: 0 }, { x: 2, y: 1 }];
    const sorted = [...items].sort((a, b) => depth(a.x, a.y) - depth(b.x, b.y));
    expect(sorted.map((s) => s.x)).toEqual([0, 2, 4]);
  });
});

/*
  ── 이 스위트가 지키는 것 ──────────────────────────────
  핀(HTML 버튼)과 그림(SVG)이 **같은 좌표계**를 쓰는지.
  둘이 갈라지면 라벨이 건물에서 떨어지는데, 데이터는 완벽히 맞고
  변환만 틀린 것이라 **타입체크도 렌더 테스트도 못 잡는다**(§5-33).

  실측 근거 (2026-08-14, 375×667 iPhone SE):
  상자 375×609에 viewBox 390×760이 들어가면 그림은 731px로 그려지고
  넘치는 122px이 잘린다. 예전 %배치는 이 122px을 모르고 609 기준으로 찍어
  **탭 바가 화면 밖 93px로 밀리고** 핀이 건물에서 어긋났다.
*/
describe('projectPin — 핀을 slice된 그림에 맞춘다', () => {
  const VB_W = 390, VB_H = 760;

  it('상자 비율이 viewBox와 같으면 단순 배율이다', () => {
    // 390:760과 같은 비율(절반 크기) — 자를 것이 없다
    const [x, y] = projectPin(195, 380, 195, 380, VB_W, VB_H);
    expect(x).toBeCloseTo(97.5, 5);
    expect(y).toBeCloseTo(190, 5);
  });

  /*
    slice는 cover다 — 상자를 덮으려면 **큰 쪽** 배율을 써야 한다.
    meet(contain)으로 잘못 구현하면 그림이 상자 안에 들어가면서
    가장자리에 빈 띠가 생기고, 핀은 그림 밖으로 밀린다.
  */
  it('상자가 viewBox보다 납작하면 폭 기준으로 덮는다(cover)', () => {
    // 375×609 — 실측값. 폭 배율 0.9615 > 높이 배율 0.8013 이므로 폭이 이긴다
    const scale = 375 / VB_W;
    const [x, y] = projectPin(0, 0, 375, 609, VB_W, VB_H);
    expect(x).toBeCloseTo(0, 5);          // xMid: 폭이 딱 맞으므로 오프셋 0
    expect(y).toBeCloseTo(0, 5);          // YMin: 위 맞춤이므로 오프셋 0
    // 아래쪽이 잘린다 — 그려지는 높이가 상자보다 크다
    expect(VB_H * scale).toBeGreaterThan(609);
  });

  /*
    ⚠️ alignY는 SVG의 preserveAspectRatio와 짝이다.
    기본 0(YMin)이 아니라 0.5(YMid)로 두면 섬이 위로 올라가 HUD와 겹친다(실측 23px).
  */
  it('alignY=0(기본)은 위 맞춤 — 위쪽이 잘리지 않는다', () => {
    const [, yTop] = projectPin(0, 0, 375, 609, VB_W, VB_H);
    expect(yTop).toBe(0);
  });

  it('alignY=0.5는 가운데 맞춤이라 위쪽도 잘린다(그래서 안 쓴다)', () => {
    const [, yMid] = projectPin(0, 0, 375, 609, VB_W, VB_H, 0.5);
    // 음수 = viewBox 원점이 상자 위로 올라간다 = 위가 잘린다
    expect(yMid).toBeLessThan(0);
    expect(yMid).toBeCloseTo((609 - VB_H * (375 / VB_W)) / 2, 5);
  });

  /*
    핀이 그림을 따라가는지의 핵심 — 상자 크기가 변해도
    **viewBox상 같은 점은 그림상 같은 자리**에 있어야 한다.
    이 성질이 깨지면 뷰포트마다 라벨이 다른 건물에 붙는다.
  */
  it('상자가 커져도 viewBox 좌표의 상대 위치가 보존된다', () => {
    const p = [195, 250] as const; // 섬 중앙 근처
    const small = projectPin(p[0], p[1], 375, 609, VB_W, VB_H);
    const big = projectPin(p[0], p[1], 750, 1218, VB_W, VB_H);
    // 두 배 상자면 좌표도 정확히 두 배
    expect(big[0]).toBeCloseTo(small[0] * 2, 5);
    expect(big[1]).toBeCloseTo(small[1] * 2, 5);
  });

  it('가로가 남으면 좌우 가운데로 정렬한다(xMid)', () => {
    // 세로로 긴 상자 — 높이 배율이 이겨서 폭이 남고, 남은 만큼 절반씩 나눈다
    const boxW = 300, boxH = 760;
    const scale = Math.max(boxW / VB_W, boxH / VB_H); // = 1 (높이 기준)
    const [x] = projectPin(0, 0, boxW, boxH, VB_W, VB_H);
    expect(x).toBeCloseTo((boxW - VB_W * scale) / 2, 5);
    expect(x).toBeLessThan(0); // 좌우가 잘린다
  });
});

describe('pts', () => {
  it('SVG points 문자열로 만든다', () => {
    expect(pts([[0, 0], [10, 20]])).toBe('0.0,0.0 10.0,20.0');
  });

  it('소수점 1자리로 자른다 (문자열이 무한정 길어지지 않게)', () => {
    expect(pts([[1.23456, 2.9999]])).toBe('1.2,3.0');
  });
});

/**
 * 마을 라벨 겹침 — **눈이 아니라 숫자로 잡는다.**
 *
 * 예전에는 `IsoVillage.tsx` 주석에 "8×8이면 시설 8개가 라벨 겹침 없이 들어간다(실측)"
 * 라고만 적혀 있었다. 그래서 9번째(모험 관문)를 넣을 때 **어디가 비었는지 알 수 없어**
 * "격자가 꽉 찼으니 새 자리를 못 만든다"고 잘못 판단할 뻔했다 — 재보니 여유가 많았다.
 *
 * 깊이(x+y)로 재면 안 된다. 훈련소와 숙소는 깊이가 **정확히 같은데도**(둘 다 3.7)
 * 화면 좌우로 갈라져 안 겹친다. 겹침은 투영 좌표에서만 보인다.
 */
describe('마을 배치 — 라벨 겹침', () => {
  /** 라벨 상자 어림치. 한글 4~5자 + 부제 한 줄 */
  const LW = 76;
  const LH = 24;

  /** 두 자리의 여유. 1 미만이면 라벨 상자가 겹친다 */
  function clearance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const [ax, ay] = iso(a.x, a.y);
    const [bx, by] = iso(b.x, b.y);
    // 가로·세로 중 **한쪽만** 충분히 벌어져도 안 겹친다
    return Math.max(Math.abs(ax - bx) / LW, Math.abs(ay - by) / LH);
  }

  const spots = Object.keys(VILLAGE_LOTS) as (keyof typeof VILLAGE_LOTS)[];

  it('모든 자리 쌍이 라벨 상자만큼 떨어져 있다', () => {
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const c = clearance(VILLAGE_LOTS[spots[i]], VILLAGE_LOTS[spots[j]]);
        expect(c, `${spots[i]} x ${spots[j]}`).toBeGreaterThanOrEqual(0.85);
      }
    }
  });

  it('모험 관문이 기존 자리 중 가장 빡빡한 쌍보다 여유롭다', () => {
    // 기존 8개끼리의 최소 여유 = 실기기에서 문제없던 기준선
    const prior = spots.filter((s) => s !== 'adventure');
    let baseline = Infinity;
    for (let i = 0; i < prior.length; i++) {
      for (let j = i + 1; j < prior.length; j++) {
        baseline = Math.min(baseline, clearance(VILLAGE_LOTS[prior[i]], VILLAGE_LOTS[prior[j]]));
      }
    }
    let added = Infinity;
    for (const s of prior) {
      added = Math.min(added, clearance(VILLAGE_LOTS.adventure, VILLAGE_LOTS[s]));
    }
    expect(added).toBeGreaterThan(baseline);
  });

  it('자리마다 좌표가 하나씩 있다 — 같은 칸에 둘을 두면 하나가 안 보인다', () => {
    const keys = new Set(spots.map((s) => `${VILLAGE_LOTS[s].x},${VILLAGE_LOTS[s].y}`));
    expect(keys.size).toBe(spots.length);
  });
});
