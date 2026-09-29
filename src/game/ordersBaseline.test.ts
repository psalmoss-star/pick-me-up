/**
 * 작전 카드 도입 전 전투 지문 — "카드를 안 고르면 지금 전투와 똑같다"의 잠금.
 *
 * 기획서 1단계 완료 기준이다. 카드 기본값이 한 번이라도 RNG를 더 뽑거나
 * 타겟을 바꾸면 sim·climb-check·floorVariants 기준선이 전부 조용히 낡는다.
 *
 * ⚠️ 이 스냅샷은 **작전 카드를 넣기 전의 엔진**으로 찍었다.
 * 엔진 변경으로 이 테스트가 깨지면 스냅샷을 갱신하지 말고 변경을 의심할 것 —
 * 갱신은 "전투 규칙을 의도적으로 바꿨고 sim을 다시 쟀다"는 뜻이어야 한다.
 */
import { describe, it, expect } from 'vitest';
import { runEncounter } from './encounter';
import { createRng } from './rng';
import { klassFor } from './stats';
import { gameData, floorAt } from './data';
import { HERO } from './data/sample';
import type { HeroDefId, HeroInstId, HeroInstance, Star } from './types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId,
  defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

// 탱커·힐러·딜러가 모두 있어야 공격·보호·퇴각 분기가 전부 밟힌다
const party = () => [
  hero(HERO.ashen, 3, 25, 1),
  hero(HERO.bulwark, 3, 25, 2),
  hero(HERO.tide, 3, 25, 3),
  hero(HERO.bolt, 2, 15, 4),
];

/** FNV-1a 32bit — 이벤트 로그 전체를 한 줄로 줄여 스냅샷을 읽을 수 있게 한다 */
function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

describe('작전 카드 이전 기준선', () => {
  it('1~30층 × 시드 5개의 전투 로그가 변하지 않는다', () => {
    const rows: string[] = [];
    for (let i = 0; i < 30; i++) {
      for (let seed = 1; seed <= 5; seed++) {
        const r = runEncounter({
          party: party(), floor: floorAt(i), data: gameData, rng: createRng(seed), potions: 1,
        });
        rows.push(`${i + 1}:${seed} ${r.outcome} t${r.turnsElapsed} ${fingerprint(JSON.stringify(r.events))}`);
      }
    }
    expect(rows).toMatchSnapshot();
  });
});
