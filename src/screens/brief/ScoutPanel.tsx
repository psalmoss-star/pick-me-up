import { SystemPanel } from '../../ui/SystemPanel';
import { T } from '../../ui/tokens';
import { gameData } from '../../game/data';
import { displayName } from '../../game/identity';
import { temperOf } from '../../game/temperament';
import { briefLine, type ScoutReport } from '../../game/report';
import { clampRoute, type FloorMap } from '../../game/floormap';
import type { HeroInstance, HeroInstId } from '../../game/types';

export interface ScoutPanelProps {
  /** 정찰을 보낼 수 있는 사람 — 출전자(파견자 제외). `start()`의 명단과 같다 */
  members: HeroInstance[];
  /** 지금 정찰자(`resolveScout`로 정한 사람) */
  scoutId: HeroInstId | null;
  onSelect: (id: HeroInstId) => boolean;
  report: ScoutReport | null;
  /** 아군 전투력(참) — 보고된 적 전력과 비교하라고 옆에 둔다 */
  partyPower: number;
  /** 층 맵과 지금 고른 경로 — 보고 문장의 접점 지형을 정한다 */
  map: FloorMap;
  route: number;
}

/**
 * 전력은 **어림수로만** 말한다(두 자리). 정직한 보고만 끝자리까지 맞으면
 * 숫자 모양만 보고 누가 정직한지 알아버린다.
 */
function approx(n: number): string {
  if (n < 100) return String(Math.round(n));
  const unit = 10 ** (Math.floor(Math.log10(n)) - 1);
  return (Math.round(n / unit) * unit).toLocaleString();
}

/**
 * 정찰 보고 — 기획서 3단계. "마스터는 전장을 직접 보지 않고 영웅의 보고를 받는다."
 *
 * 정찰자를 고르는 것이 이 패널의 결정이다. 보고는 그 사람의 기질대로 틀린다 —
 * **성향 이름은 보여 주지 않는다.** 기질(상태창에 있다)과 말투, 그리고 전투에서 드러나는 참을 보고
 * 누구 말을 믿을지 마스터가 알아내야 한다. 그게 "보고를 의심했는가"다.
 */
export function ScoutPanel({ members, scoutId, onSelect, report, partyPower, map, route }: ScoutPanelProps) {
  const scout = members.find((h) => h.instId === scoutId) ?? null;
  const scoutName = scout ? displayName(scout, gameData.heroes) : '';

  return (
    <SystemPanel compact>
      <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.3em', marginBottom: 10 }}>
        정찰 보고
      </div>

      {/* 정찰자 고르기 — 누구 말을 믿을 것인가 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
        {members.map((h) => {
          const on = h.instId === scoutId;
          const temper = temperOf(h);
          return (
            <button
              key={h.instId}
              onClick={() => onSelect(h.instId)}
              aria-pressed={on}
              style={{
                minHeight: 44, minWidth: 88, padding: '6px 10px', boxSizing: 'border-box',
                background: 'transparent', fontFamily: 'inherit', cursor: 'pointer',
                color: on ? T.gold : T.text,
                border: `1px solid ${on ? T.gold : T.panelHi}`,
              }}
            >
              <div style={{ fontSize: 13, letterSpacing: '.06em' }}>{displayName(h, gameData.heroes)}</div>
              {temper && <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>{temper.label}</div>}
            </button>
          );
        })}
      </div>

      {scout && report && (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            {briefLine(scout, report, map, clampRoute(map, route), gameData.enemies, scoutName)}
          </div>
          {report.enemyCount !== null && report.enemyPower !== null ? (
            <div style={{ fontSize: 14, color: T.amber, letterSpacing: '.06em', lineHeight: 1.9, marginTop: 4 }}>
              적 {report.enemyCount}기 · 전력 약 {approx(report.enemyPower)}
              <span style={{ fontSize: 11, color: T.dim }}> (아군 {approx(partyPower)})</span>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: T.dim, letterSpacing: '.06em', lineHeight: 1.9, marginTop: 4 }}>
              적 ?기 · 전력 ?
            </div>
          )}
        </>
      )}
      <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.8, marginTop: 8 }}>
        보고는 정찰자의 성격대로 틀릴 수 있다. 위기를 알리는 때도 그 사람이 정한다.
      </div>
    </SystemPanel>
  );
}
