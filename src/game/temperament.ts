/**
 * 기질 파생 — gdd-v3 §4.10.
 *
 * 서사(`origin.ts`)와 같은 이유로 **저장하지 않고 seed에서 파생한다.**
 * 유일성 제약이 없고(같은 기질이 여럿이어도 된다) 표시 전용이라 세이브에 넣을 이유가 없다.
 *
 * ⚠️ **등급을 입력으로 받지 않는다.** 서사의 지위는 승급하면 바뀌지만(더 대단한 존재로
 * 다시 불려나왔다), 성격은 사람에 붙는다. 승급해도 같은 사람이어야 한다.
 *
 * ⚠️ `STREAM.TEMPER`를 **맨 뒤에 추가**했으므로 기존 개체의 잠재치·초상·서사는 그대로다.
 */
import type { HeroInstance } from './types';
import { STREAM, rngPick, substream } from './rng';
import { TEMPERS, type TemperDef } from './data/temperaments';

/** seed가 없는 옛 세이브 개체는 null — 기질 패널을 그리지 않는다 */
export function deriveTemper(seed: number | undefined): TemperDef | null {
  if (seed === undefined) return null;
  return rngPick(substream(seed, STREAM.TEMPER), TEMPERS);
}

export function temperOf(inst: HeroInstance): TemperDef | null {
  return deriveTemper(inst.seed);
}
