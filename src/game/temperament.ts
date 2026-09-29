/**
 * 기질 파생 — gdd-v3 §4.10.
 *
 * 서사(`origin.ts`)와 같은 이유로 **저장하지 않고 seed에서 파생한다.**
 * 유일성 제약이 없고(같은 기질이 여럿이어도 된다) 전투 수치에 닿지 않아 세이브에 넣을 이유가 없다.
 * (기질이 닿는 곳은 대사와 정찰 보고의 성향뿐이다 — `report.ts`, 기획서 3단계)
 *
 * ⚠️ **등급을 입력으로 받지 않는다.** 서사의 지위는 승급하면 바뀌지만(더 대단한 존재로
 * 다시 불려나왔다), 성격은 사람에 붙는다. 승급해도 같은 사람이어야 한다.
 *
 * ⚠️ `STREAM.TEMPER`를 **맨 뒤에 추가**했으므로 기존 개체의 잠재치·초상·서사는 그대로다.
 */
import type { HeroInstance } from './types';
import { STREAM, rngPick, substream } from './rng';
import { TEMPERS, TEMPER_BY_ID, type TemperDef } from './data/temperaments';
import { legendOf } from './legend';

/** seed가 없는 옛 세이브 개체는 null — 기질 패널을 그리지 않는다 */
export function deriveTemper(seed: number | undefined): TemperDef | null {
  if (seed === undefined) return null;
  return rngPick(substream(seed, STREAM.TEMPER), TEMPERS);
}

/** 전설(§4.11)은 기질이 정해져 있다. 나머지는 seed에서 파생한다 */
export function temperOf(inst: Pick<HeroInstance, 'seed' | 'legendId'>): TemperDef | null {
  const legend = legendOf(inst);
  return legend ? TEMPER_BY_ID[legend.temper] : deriveTemper(inst.seed);
}
