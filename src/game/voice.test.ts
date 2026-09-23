import { describe, it, expect } from 'vitest';
import { awarenessOf, fillVoice, hasBatchim, lineFor, pickSpeaker, templateLastWords } from './voice';
import { VOICE_LINES, type VoiceMoment } from './data/voice';
import { TEMPERS } from './data/temperaments';
import { deriveTemper } from './temperament';
import type { HeroInstance, Star } from './types';

const MOMENTS: VoiceMoment[] = ['summon', 'sortie', 'sacrifice', 'allyDeath', 'death'];

const inst = (seed: number | undefined, star: Star, id = `h#${seed}`): HeroInstance => ({
  instId: id as any,
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

describe('대사 표 — 빠짐없이 채워져 있다', () => {
  it('모든 순간 × 기질 × 자각 칸에 한 줄 이상 있다', () => {
    for (const m of MOMENTS) {
      for (const t of TEMPERS) {
        for (const a of ['low', 'high'] as const) {
          expect(VOICE_LINES[m][t.id][a].length, `${m}/${t.id}/${a}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('알려진 자리표시만 쓴다 — 중괄호가 화면에 찍히면 안 된다', () => {
    for (const m of MOMENTS) {
      for (const t of TEMPERS) {
        for (const a of ['low', 'high'] as const) {
          for (const line of VOICE_LINES[m][t.id][a]) {
            const left = line
              .replace(/\{ally:(이\/가|을\/를|은\/는|이었\/였)\}/g, '')
              .replace(/\{ally\}|\{floor\}/g, '');
            expect(left, line).not.toMatch(/[{}]/);
          }
        }
      }
    }
  });

  it('{ally}는 동료 사망에서만, {floor}는 죽음에서만 쓴다', () => {
    for (const m of MOMENTS) {
      for (const t of TEMPERS) {
        for (const a of ['low', 'high'] as const) {
          for (const line of VOICE_LINES[m][t.id][a]) {
            if (m !== 'allyDeath') expect(line, line).not.toContain('{ally}');
            if (m !== 'death') expect(line, line).not.toContain('{floor}');
          }
        }
      }
    }
  });

  it('★1~3(low)은 마스터·탑·가챠를 모른다 — 원작의 자각 단계', () => {
    /*
      원작에서 저등급 영웅은 자기가 불려 왔다는 사실조차 모른다.
      low 줄에 이 단어가 새면 등급 차이가 말투에서 사라진다.
    */
    for (const m of MOMENTS) {
      for (const t of TEMPERS) {
        for (const line of VOICE_LINES[m][t.id].low) {
          expect(line, line).not.toMatch(/마스터|탑|가챠|뽑기|봉인/);
        }
      }
    }
  });
});

describe('대사 선택 — 결정적이다', () => {
  it('같은 영웅·같은 순간·같은 맥락이면 항상 같은 말이다', () => {
    for (let s = 0; s < 100; s++) {
      const h = inst(s, 3);
      expect(lineFor(h, 'sortie', 12)).toEqual(lineFor(h, 'sortie', 12));
    }
  });

  it('맥락이 다르면 말이 갈릴 수 있다 (층마다 같은 말만 하지 않는다)', () => {
    let differs = 0;
    for (let s = 0; s < 100; s++) {
      const h = inst(s, 3);
      if (lineFor(h, 'sortie', 1)!.text !== lineFor(h, 'sortie', 2)!.text) differs++;
    }
    expect(differs).toBeGreaterThan(20);
  });

  it('seed가 없으면 말하지 않는다', () => {
    expect(lineFor(inst(undefined, 3), 'summon', 0)).toBeNull();
    expect(templateLastWords(inst(undefined, 3), 5)).toBeNull();
  });

  it('말은 그 영웅의 기질·자각 칸에서만 나온다', () => {
    for (let s = 0; s < 200; s++) {
      for (const star of [1, 3, 4, 6] as Star[]) {
        const h = inst(s, star);
        const l = lineFor(h, 'summon', 'x')!;
        expect(l.temper).toBe(deriveTemper(s));
        expect(VOICE_LINES.summon[l.temper.id][awarenessOf(star)]).toContain(l.text);
      }
    }
  });

  it('자각 경계는 ★4다', () => {
    expect(awarenessOf(3)).toBe('low');
    expect(awarenessOf(4)).toBe('high');
  });
});

describe('자리표시 채우기', () => {
  it('받침에 따라 조사가 바뀐다 — 「세인가」가 찍히면 안 된다', () => {
    expect(hasBatchim('세인')).toBe(true);
    expect(hasBatchim('오르나')).toBe(false);
    expect(fillVoice('{ally:이/가} 갔다', { ally: '물결의 세인' })).toBe('물결의 세인이 갔다');
    expect(fillVoice('{ally:이/가} 갔다', { ally: '석문의 오르나' })).toBe('석문의 오르나가 갔다');
    expect(fillVoice('{ally:을/를} 잃었다', { ally: '세인' })).toBe('세인을 잃었다');
    expect(fillVoice('{ally:은/는} 싸웠다', { ally: '카일' })).toBe('카일은 싸웠다');
    expect(fillVoice('{ally:이었/였}을 뿐', { ally: '라니' })).toBe('라니였을 뿐');
  });

  it('조사 바로 앞에 맨 {ally}를 쓰지 않는다 — 꼴을 적어야 한다', () => {
    for (const t of TEMPERS) {
      for (const a of ['low', 'high'] as const) {
        for (const line of VOICE_LINES.allyDeath[t.id][a]) {
          expect(line, line).not.toMatch(/\{ally\}(이|가|을|를|은|는|였|이었)/);
        }
      }
    }
  });

  it('동료 이름과 층이 들어간다', () => {
    expect(fillVoice('{ally}… 잘 가라', { ally: '세인' })).toBe('세인… 잘 가라');
    expect(fillVoice('{floor}층이라', { floor: 37 })).toBe('37층이라');
  });

  it('동료 사망 대사에는 실제 이름이 박힌다', () => {
    for (let s = 0; s < 50; s++) {
      const l = lineFor(inst(s, 5), 'allyDeath', '카일', { ally: '카일' })!;
      expect(l.text).not.toContain('{');
    }
  });

  it('템플릿 유언은 죽은 층을 채운다', () => {
    for (let s = 0; s < 200; s++) {
      const w = templateLastWords(inst(s, 5), 42)!;
      expect(w).not.toContain('{');
    }
  });
});

describe('말할 사람 고르기', () => {
  it('편성 순서가 바뀌어도 같은 사람이 말한다', () => {
    const a = inst(1, 3, 'h_a'), b = inst(2, 3, 'h_b'), c = inst(3, 3, 'h_c');
    for (let f = 1; f <= 30; f++) {
      expect(pickSpeaker([a, b, c], f)).toBe(pickSpeaker([c, a, b], f));
    }
  });

  it('seed 없는 개체는 후보가 아니다', () => {
    const old = inst(undefined, 3, 'h_old');
    expect(pickSpeaker([old], 1)).toBeNull();
    const n = inst(9, 3, 'h_new');
    expect(pickSpeaker([old, n], 1)).toBe(n);
  });
});
