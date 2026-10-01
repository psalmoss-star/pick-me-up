import { SystemPanel } from '../../ui/SystemPanel';
import { T } from '../../ui/tokens';
import { TERRAIN } from '../../game/data/terrain';
import { STRATAGEM_BY_ID, type StratagemId } from '../../game/data/stratagems';
import { contactTerrain, terrainModifier, type FloorMap } from '../../game/floormap';
import { reportedTerrain, type ScoutReport } from '../../game/report';
import { Minimap } from './Minimap';

export interface RoutePanelProps {
  map: FloorMap;
  route: number;
  onSelectRoute: (index: number) => boolean;
  /** 들고 가는 책략 — 경로마다 유리/불리를 말해 준다 */
  loadout: StratagemId[];
  /**
   * 정찰 보고 — 있으면 접점과 그 지형을 **보고대로** 보여 준다(기획서 3단계).
   * 보고는 틀릴 수 있다. 참은 전투가 시작돼야 드러난다.
   */
  report?: ScoutReport | null;
  /** 정찰자 이름 — 아래 안내 문구에 쓴다 */
  scoutName?: string;
}

/**
 * 브리핑의 지도 — 경로를 고르는 곳. 기획서 2단계.
 *
 * 경로마다 접점 지형이 다르고, 그 지형이 **들고 가는 책략**에 유리한지 불리한지를 적는다.
 * "이 길이면 화공이 잘 통한다"를 지도를 보고 읽게 하는 것이 목적이다 — 카드와 경로가 서로 물린다.
 */
export function RoutePanel({ map, route, onSelectRoute, loadout, report, scoutName }: RoutePanelProps) {
  return (
    <SystemPanel compact>
      <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.3em', marginBottom: 8 }}>
        지도
      </div>
      <Minimap map={map} route={route} width={340} labels onSelectRoute={onSelectRoute} contacts={report?.contacts} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {map.routes.map((r) => {
          const tag = report ? reportedTerrain(map, report, r.index) : contactTerrain(map, r.index);
          const on = r.index === route;
          const notes = loadout.map((id) => ({ id, mod: terrainModifier(tag, id) }))
            .filter((x) => x.mod !== 0);
          return (
            <button
              key={r.index}
              onClick={() => onSelectRoute(r.index)}
              style={{
                minHeight: 44, padding: '8px 10px', boxSizing: 'border-box', width: '100%',
                background: 'transparent', fontFamily: 'inherit', color: T.text, cursor: 'pointer',
                border: `1px solid ${on ? T.gold : T.panelHi}`,
              }}
            >
              <div style={{ fontSize: 13, letterSpacing: '.08em', color: on ? T.gold : T.text }}>
                {r.index + 1}번 길 · 접점 {tag ? TERRAIN[tag].name : '?'}
              </div>
              {notes.length > 0 && (
                <div style={{ fontSize: 11, lineHeight: 1.7, marginTop: 2 }}>
                  {notes.map((x, i) => (
                    <span key={x.id} style={{ color: x.mod > 0 ? T.gold : T.amber }}>
                      {i > 0 ? ' · ' : ''}{STRATAGEM_BY_ID[x.id].name} {x.mod > 0 ? '유리' : '불리'}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.8, marginTop: 8 }}>
        {!report
          ? '✕ 는 적과 부딪히는 곳이다. 그곳의 땅이 책략의 성패를 바꾼다.'
          : report.style === 'silent'
            ? '어디서 부딪힐지 아무도 말하지 않았다.'
            : `✕ 는 ${scoutName ?? '정찰자'}의 보고다. 그곳의 땅이 책략의 성패를 바꾼다.`}
      </div>
    </SystemPanel>
  );
}
