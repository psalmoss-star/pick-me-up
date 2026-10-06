/**
 * 계열 특성의 설명 문장 — **표시 전용.** 엔진은 이 파일을 모른다.
 *
 * 수치 문장을 손으로 적으면 `data/traits.ts`를 고칠 때 화면이 거짓말을 한다
 * (`describeStratagem`과 같은 이유). 여기서 데이터로부터 만든다.
 */
import type { Lineage } from './types';
import { LINEAGE_TRAITS, type LineageTraits } from './data/traits';

/** 배수 → "+30%" / "−12%" */
const pct = (mult: number): string => {
  const p = Math.round((mult - 1) * 100);
  return p >= 0 ? `+${p}%` : `−${-p}%`;
};
const ratio = (r: number): string => `${Math.round(r * 100)}%`;

export function describeTrait(lineage: Lineage, t: LineageTraits = LINEAGE_TRAITS): string {
  switch (lineage) {
    case 'blade':
      return `HP ${ratio(t.blade.hpBelow)} 이하인 적에게 피해 ${pct(t.blade.damageMult)}`;
    case 'guardian':
      return `공격으로 받는 피해 ${pct(t.guardian.damageTakenMult)}`;
    case 'priest':
      return `치유가 넘치면 넘친 양의 ${ratio(t.priest.overflowToShield)}가 보호막이 된다`;
    case 'mage':
      return `대상이 둘 이상인 기술의 위력 ${pct(t.mage.multiTargetMult)}`;
    case 'hunter':
      return `해로운 상태에 걸린 적에게 피해 ${pct(t.hunter.afflictedMult)}`;
    case 'scout':
      return `전투 첫 ${t.scout.turns === 1 ? '턴' : `${t.scout.turns}턴`}에 속도 ${pct(t.scout.spdMult)} · 피해 ${pct(t.scout.damageMult)}`;
    case 'commander':
      return `전장에 있는 동안 아군 전체 공격력 ${pct(t.commander.allyAtkMult)}`;
  }
}
