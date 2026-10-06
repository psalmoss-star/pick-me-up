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
import { gameData, gameDataNoTraits, floorAt } from './data';
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

const rowsWith = (data: typeof gameData): string[] => {
  const rows: string[] = [];
  for (let i = 0; i < 30; i++) {
    for (let seed = 1; seed <= 5; seed++) {
      const r = runEncounter({
        party: party(), floor: floorAt(i), data, rng: createRng(seed), potions: 1,
      });
      rows.push(`${i + 1}:${seed} ${r.outcome} t${r.turnsElapsed} ${fingerprint(JSON.stringify(r.events))}`);
    }
  }
  return rows;
};

describe('작전 카드 이전 기준선', () => {
  /*
    계열 특성(STEP 69) 뒤로 이 지문은 **특성을 뺀 번들**로 찍는다 — 스냅샷은 특성 이전 그대로다.
    즉 이 테스트는 "카드도 특성도 없으면 옛 엔진과 비트 단위로 같다"를 잠근다.
    특성 코드가 특성 없는 전투에서 난수를 하나라도 더 뽑거나 이벤트 한 줄을 더하면 여기서 깨진다.

    2026-10-06에 한 번 갱신했다 — 엔진이 아니라 **적 배수**(`floorgen.ts`의 `TRAIT_COMPENSATION`)가 바뀌어서다.
    보정을 1로 두면 작전 카드 이전에 찍은 옛 스냅샷이 그대로 통과하는 것을 확인하고 갱신했다.
    다음에도 같은 순서로: 층 수치를 바꿨다면 그것을 되돌려 옛 지문이 나오는지부터 볼 것.
  */
  it('1~30층 × 시드 5개의 전투 로그가 변하지 않는다', () => {
    expect(rowsWith(gameDataNoTraits)).toMatchSnapshot();
  });

  /*
    특성을 켠 실제 게임의 지문. 특성 수치(`data/traits.ts`)를 의도적으로 바꿨을 때만 갱신한다 —
    그때는 trait-check·sim·climb-check·floor-tune을 다시 쟀다는 뜻이어야 한다.
  */
  it('계열 특성을 켠 전투 로그가 변하지 않는다', () => {
    const on = rowsWith(gameData);
    expect(on).toMatchSnapshot();
    // 켠 것과 끈 것이 같으면 특성이 실제로는 아무 일도 안 하는 것이다
    expect(on).not.toEqual(rowsWith(gameDataNoTraits));
  });
});
