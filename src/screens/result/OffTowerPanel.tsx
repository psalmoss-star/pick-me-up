import { useEffect, useState } from 'react';
import { SystemPanel } from '../../ui/SystemPanel';
import { HpBar } from '../../ui/Button';
import { T } from '../../ui/tokens';
import { gameData } from '../../game/data';
import { displayName } from '../../game/identity';
import { expToNext } from '../../game/progression';
import { legLine } from '../../game/adventure';
import { ADVENTURE_BY_ID } from '../../game/data/adventures';
import { MATERIAL_DEFS, MATERIAL_ORDER } from '../../game/data/materials';
import { isEmptyBag } from '../../game/loot';
import type { HeroGain, OffTowerResult } from '../../game/offTower';

const label = { fontSize: 12, letterSpacing: '.2em', marginBottom: 6 } as const;
const line = { fontSize: 13, lineHeight: 1.9 } as const;

/** exp 바 — 정산 전 값에서 시작해 정산 뒤 값까지 차오른다(레벨이 올랐으면 새 레벨 기준) */
function ExpRise({ g }: { g: HeroGain }) {
  const leveled = g.after.level > g.before.level;
  const max = expToNext(g.after.star, g.after.level);
  const [cur, setCur] = useState(leveled ? 0 : g.before.exp);
  useEffect(() => {
    const t = setTimeout(() => setCur(g.after.exp), 120);
    return () => clearTimeout(t);
  }, [g.after.exp]);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
      <HpBar cur={cur} max={max} color={T.gold} w={140} h={4} />
    </div>
  );
}

const nameOf = (g: HeroGain) => displayName(g.after, gameData.heroes);

/**
 * 탑 밖 — 탑에 간 사이 남은 이들에게 있었던 일(1차 셀프 테스트 지적 3번).
 * 값은 `settleOffTower`가 준다 — `finish()`가 지급하는 것과 같은 함수다.
 */
export function OffTowerPanel({ off, cleared, trainingLevel }: {
  off: OffTowerResult;
  cleared: boolean;
  trainingLevel: number;
}) {
  // 훈련소가 있는데 층을 못 넘었으면 규칙(돌파 시에만)을 한 줄로 보인다
  const noTraining = !cleared && trainingLevel > 0;
  if (off.trainees.length === 0 && !noTraining && off.returned.length === 0 && off.away.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 16 }}>
      <SystemPanel compact>
        <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em', marginBottom: 10 }}>탑 밖</div>

        {(off.trainees.length > 0 || noTraining) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...label, color: T.gold }}>훈련소</div>
            {noTraining && (
              <div style={{ ...line, color: T.dim }}>층을 넘지 못해 훈련 성과가 없다</div>
            )}
            {off.trainees.map((g) => (
              <div key={g.instId} style={{ marginBottom: 6 }}>
                <div style={line}>
                  {nameOf(g)}
                  <span style={{ color: T.gold }}> +{g.exp} exp</span>
                  {g.after.level > g.before.level
                    ? <span style={{ color: T.gold }}> · Lv.{g.before.level} → {g.after.level}</span>
                    : <span style={{ color: T.dim }}> · Lv.{g.after.level}</span>}
                </div>
                <ExpRise g={g} />
              </div>
            ))}
          </div>
        )}

        {off.returned.map((r, i) => {
          const def = ADVENTURE_BY_ID[r.dispatch.advId];
          const o = r.outcome;
          return (
            <div key={`ret-${i}`} style={{ marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${T.panelHi}` }}>
              <div style={{ ...label, color: o.success ? T.rare : T.amber }}>
                {def?.name ?? '알 수 없는 모험'} — {o.success ? '귀환' : '빈손 귀환'}
              </div>
              {r.heroes.map((g) => (
                <div key={g.instId} style={line}>
                  {nameOf(g)}
                  {o.success && <span style={{ color: T.gold }}> +{g.exp} exp</span>}
                  {g.after.level > g.before.level && (
                    <span style={{ color: T.gold }}> · Lv.{g.before.level} → {g.after.level}</span>
                  )}
                  {o.injuryRatio > 0 && <span style={{ color: T.blood }}> · 부상</span>}
                </div>
              ))}
              {!isEmptyBag(o.materials) && (
                <div style={{ ...line, color: T.rare }}>
                  {MATERIAL_ORDER.filter((m) => (o.materials[m] ?? 0) > 0)
                    .map((m) => `${MATERIAL_DEFS[m].name} +${o.materials[m]}`).join(' · ')}
                </div>
              )}
              {o.awakeningStones > 0 && (
                <div style={{ ...line, color: T.gold }}>각성석 +{o.awakeningStones}</div>
              )}
            </div>
          );
        })}

        {off.away.map((a, i) => {
          const def = ADVENTURE_BY_ID[a.dispatch.advId];
          if (!def) return null;
          return (
            <div key={`away-${i}`} style={{ paddingTop: 10, borderTop: `1px solid ${T.panelHi}`, marginBottom: 6 }}>
              <div style={{ ...label, color: T.dim }}>{def.name} — {a.done}/{a.duration}전투</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <HpBar cur={a.done} max={a.duration} color={T.amber} w={140} h={4} />
              </div>
              <div style={{ ...line, color: T.dim }}>{legLine(def, a.done)}</div>
            </div>
          );
        })}
      </SystemPanel>
    </div>
  );
}
