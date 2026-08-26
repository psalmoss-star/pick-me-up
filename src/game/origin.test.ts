import { describe, it, expect } from 'vitest';
import { deriveOrigin, originOf, originText } from './origin';
import { ENDINGS, STATIONS } from './data/origins';
import { derivePotential, potentialScore } from './potential';
import { deriveVariant } from './portraitVariant';
import { STREAM } from './rng';
import type { HeroInstance, Star } from './types';

const STARS: Star[] = [1, 2, 3, 4, 5, 6];

const inst = (seed: number | undefined, star: Star): HeroInstance => ({
  instId: `h#${seed}` as any,
  defId: 'h_ashen' as any,
  star,
  klass: '초보자' as any,
  level: 1,
  exp: 0,
  seed,
  currentHp: 0,
  isDead: false,
  acquiredAtFloor: 1,
});

describe('생전 서사 — 결정성', () => {
  it('같은 시드·같은 등급이면 항상 같은 서사다', () => {
    for (let s = 0; s < 200; s++) {
      const a = deriveOrigin(s, 3);
      const b = deriveOrigin(s, 3);
      expect(a).toEqual(b);
    }
  });

  it('시드가 다르면 서사도 갈린다 (개체가 구별된다)', () => {
    /*
      이 테스트가 이 기능의 존재 이유다 — 같은 종류·같은 등급을 여러 번 뽑아도
      읽을 것이 달라야 한다. 종류 lore(def.lore)는 이걸 못 한다.
    */
    const texts = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const o = deriveOrigin(s, 3);
      if (o) texts.add(originText(o));
    }
    // 200개 시드에서 조합(6 지위 × 18 최후 = 108)의 상당수가 나와야 한다
    expect(texts.size).toBeGreaterThan(50);
  });

  it('seed가 없으면 null이다 (빈 문자열을 만들지 않는다)', () => {
    expect(deriveOrigin(undefined, 3)).toBeNull();
    expect(originOf(inst(undefined, 3))).toBeNull();
  });
});

describe('생전 서사 — 등급이 지위를 정한다', () => {
  it('지위는 항상 그 등급의 목록에서 나온다', () => {
    for (const star of STARS) {
      for (let s = 0; s < 100; s++) {
        const o = deriveOrigin(s, star);
        if (!o) throw new Error('시드가 있는데 null이다');
        expect(STATIONS[star]).toContain(o.station);
      }
    }
  });

  it('최후는 등급과 무관하다 — 전 등급이 같은 목록을 쓴다', () => {
    /*
      ★6이 초라하게, ★1이 장렬하게 죽을 수 있어야 조합이 인물처럼 읽힌다.
      지위마다 최후를 묶으면 등급이 곧 서사가 되어 조합의 의미가 사라진다.
    */
    for (const star of STARS) {
      for (let s = 0; s < 50; s++) {
        const o = deriveOrigin(s, star);
        if (!o) throw new Error('시드가 있는데 null이다');
        expect(ENDINGS).toContain(o.ending);
      }
    }
  });

  it('등급마다 지위 목록이 서로 겹치지 않는다', () => {
    // 겹치면 "★1인데 대장군이었다"가 나와 태생 등급 개념이 무너진다
    const seen = new Map<string, Star>();
    for (const star of STARS) {
      for (const st of STATIONS[star]) {
        expect(seen.has(st), `"${st}"가 ★${seen.get(st)}와 ★${star}에 중복`).toBe(false);
        seen.set(st, star);
      }
    }
  });

  it('모든 등급에 지위가 둘 이상 있다', () => {
    // 하나뿐이면 그 등급 개체가 전부 같은 문장을 달아 종류 lore와 같은 문제가 된다
    for (const star of STARS) {
      expect(STATIONS[star].length).toBeGreaterThan(1);
    }
  });
});

describe('생전 서사 — 기존 축을 건드리지 않는다', () => {
  it('ORIGIN 스트림 번호가 기존 스트림과 겹치지 않는다', () => {
    /*
      ⚠️ **이 테스트가 진짜 잠금장치다.**

      처음에는 "서사를 파생해도 잠재치가 안 변한다"를 `derivePotential` 전후
      비교로 썼는데, **ORIGIN을 POTENTIAL과 같은 3으로 바꿔도 통과했다.**
      `derivePotential`이 호출마다 새 substream을 만들기 때문에 사이에 무엇을
      하든 영향을 받을 수 없다 — 구조적으로 실패할 수 없는 테스트였다(§5-31).

      실제로 잠가야 하는 것은 **번호가 겹치지 않는 것**이다. 겹치면 두 축이
      같은 난수열을 읽어 서로 상관되고, 잠재치가 서사에서 예측 가능해진다.
    */
    const ids = Object.values(STREAM);
    expect(new Set(ids).size, `스트림 번호 중복: ${ids.join(',')}`).toBe(ids.length);
  });

  it('같은 시드에서 서사와 잠재치가 상관되지 않는다', () => {
    /*
      번호가 겹치면 같은 난수열을 소비하므로 "지위가 좋으면 잠재치도 좋다"가 된다.
      등급과 잠재치의 상관(rho 0.3)은 의도된 것이지만, 표시 전용인 서사가
      숨은 수치를 누설하면 발굴(reveal)이 무의미해진다.

      지위 인덱스별 잠재 점수 평균을 내고, 그 편차가 충분히 작은지 본다.
    */
    const byStation = new Map<string, number[]>();
    for (let s = 0; s < 3000; s++) {
      const o = deriveOrigin(s, 4);
      if (!o) continue;
      const score = potentialScore(derivePotential(s, 4));
      const arr = byStation.get(o.station) ?? [];
      arr.push(score);
      byStation.set(o.station, arr);
    }
    const means = [...byStation.values()].map((a) => a.reduce((x, y) => x + y, 0) / a.length);
    const spread = Math.max(...means) - Math.min(...means);
    // 무관하다면 지위별 평균이 거의 같아야 한다. 겹치면 이 값이 크게 벌어진다
    expect(spread, `지위별 잠재 평균 편차 ${spread.toFixed(4)}`).toBeLessThan(0.02);
  });

  it('서사와 초상 변형이 상관되지 않는다', () => {
    const byVariant = new Map<number, Set<string>>();
    for (let s = 0; s < 1000; s++) {
      const o = deriveOrigin(s, 4);
      if (!o) continue;
      const v = deriveVariant(s, 6);
      const set = byVariant.get(v) ?? new Set<string>();
      set.add(o.station);
      byVariant.set(v, set);
    }
    // 상관돼 있으면 변형마다 특정 지위만 나온다. 무관하면 전 지위가 골고루 나온다
    for (const [v, set] of byVariant) {
      expect(set.size, `변형 ${v}에 지위가 ${set.size}종만 나온다`).toBe(STATIONS[4].length);
    }
  });

  it('등급이 오르면 지위는 바뀌고 최후는 그대로다', () => {
    /*
      승급은 "더 대단한 존재로 다시 불려나왔다"이므로 지위가 오른다.
      죽은 방식은 사실이므로 변하지 않는다 (origin.ts 주석 참조).
    */
    for (let s = 0; s < 100; s++) {
      const low = deriveOrigin(s, 2);
      const high = deriveOrigin(s, 5);
      if (!low || !high) throw new Error('시드가 있는데 null이다');
      expect(high.ending).toBe(low.ending);
      expect(STATIONS[5]).toContain(high.station);
    }
  });
});

describe('생전 서사 — 서식', () => {
  it('한 곳에서만 조립한다 — 지위와 최후가 모두 들어간다', () => {
    const o = deriveOrigin(7, 4);
    if (!o) throw new Error('시드가 있는데 null이다');
    const text = originText(o);
    expect(text).toContain(o.station);
    expect(text).toContain(o.ending);
    expect(text.endsWith('.')).toBe(true);
  });
});
