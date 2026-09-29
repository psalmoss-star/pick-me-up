import { T } from '../../ui/tokens';
import { TERRAIN } from '../../game/data/terrain';
import type { FloorMap, MapNode } from '../../game/floormap';

export type HeroMarkAt = 'entry' | 'contact' | 'exit';

export interface FloorMapViewProps {
  map: FloorMap;
  /** 고른 경로 — 실선·금색으로 그린다 */
  route: number;
  /** 있으면 경로를 눌러 고를 수 있다(브리핑) */
  onSelectRoute?: (index: number) => void;
  /** 띠 모양 — 전투 화면 위. 지형 글자를 빼고 낮게 그린다 */
  compact?: boolean;
  /** 영웅 점의 위치. 없으면 그리지 않는다 */
  heroAt?: HeroMarkAt;
  /**
   * 정찰 보고의 접점(경로 순서, null = 모름). 있으면 ✕를 **보고대로** 그린다(기획서 3단계).
   * 없으면 실제 접점을 그린다 — 전투 화면의 띠는 이미 부딪힌 뒤라 참을 보여 준다.
   */
  contacts?: Array<string | null>;
}

const W = 340;

/**
 * 층 맵 — 입구(왼쪽)에서 계단(오른쪽)까지. 기획서 2단계.
 *
 * 고른 경로는 실선, 나머지는 점선이다(기획서의 "실선은 1군, 점선은 2군"을 1~20층 1군 전용으로 줄였다).
 * 접점(✕)은 적과 부딪히는 곳이고, 그 지형이 책략 성공률을 바꾼다.
 * 색은 `tokens.ts`의 것만 쓴다.
 */
export function FloorMapView({ map, route, onSelectRoute, compact, heroAt, contacts: reported }: FloorMapViewProps) {
  // 경로가 셋이면 가운데 줄 글자가 아래 줄 글자와 닿는다(375px 실측) — 세로를 늘린다
  const H = compact ? 46 : map.routes.length >= 3 ? 184 : 140;
  const padX = compact ? 14 : 22;
  const padY = compact ? 9 : 26;
  const pos = (n: MapNode) => ({
    x: padX + n.x * (W - padX * 2),
    y: padY + n.y * (H - padY * 2),
  });
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const chosen = map.routes[route] ?? map.routes[0];
  const onChosen = new Set(chosen.nodeIds);
  const contacts = new Set(
    reported ? reported.filter((id): id is string => !!id) : map.routes.map((r) => r.contactId),
  );

  const heroNode = heroAt === 'entry' ? byId.get('entry')
    : heroAt === 'exit' ? byId.get('exit')
      : heroAt === 'contact' ? byId.get(chosen.contactId) : undefined;
  const hp = heroNode ? pos(heroNode) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: 'block', maxWidth: W, margin: '0 auto' }}
      role="img"
      aria-label="층 지도"
    >
      {/* 경로 선 — 고른 경로를 마지막에 그려 위에 오게 한다 */}
      {[...map.routes]
        .sort((a, b) => Number(a.index === chosen.index) - Number(b.index === chosen.index))
        .map((r) => {
        const pts = r.nodeIds.map((id) => pos(byId.get(id)!)).map((p) => `${p.x},${p.y}`).join(' ');
        const on = r.index === chosen.index;
        return (
          <g key={r.index}>
            <polyline
              points={pts}
              fill="none"
              stroke={on ? T.gold : T.dim}
              strokeWidth={on ? 2 : 1.2}
              strokeDasharray={on ? undefined : '4 4'}
              opacity={on ? 1 : 0.6}
            />
            {/* 누르기 쉬운 두꺼운 투명 선 — 가는 선은 손가락으로 못 누른다 */}
            {onSelectRoute && (
              <polyline
                points={pts}
                fill="none"
                stroke="transparent"
                strokeWidth={22}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectRoute(r.index)}
              />
            )}
          </g>
        );
      })}

      {map.nodes.map((n) => {
        const p = pos(n);
        const on = onChosen.has(n.id);
        const isContact = contacts.has(n.id);
        const r = compact ? 3.5 : 6;
        return (
          <g key={n.id} style={{ pointerEvents: 'none' }}>
            {isContact ? (
              <g stroke={on ? T.blood : T.dim} strokeWidth={compact ? 1.6 : 2.2}>
                <line x1={p.x - r} y1={p.y - r} x2={p.x + r} y2={p.y + r} />
                <line x1={p.x - r} y1={p.y + r} x2={p.x + r} y2={p.y - r} />
              </g>
            ) : (
              <circle
                cx={p.x} cy={p.y} r={n.kind === 'path' ? r * 0.6 : r}
                fill={n.kind === 'path' ? (on ? T.frame : T.panelHi) : T.panel}
                stroke={on ? T.gold : T.dim}
                strokeWidth={1.2}
              />
            )}
            {!compact && (
              <text
                x={p.x} y={p.y + (n.y > 0.5 ? -12 : 18)}
                textAnchor="middle"
                fontSize={10}
                fill={on ? T.text : T.dim}
                style={{ fontFamily: 'inherit' }}
              >
                {n.kind === 'entry' ? '입구' : n.kind === 'exit' ? '계단' : TERRAIN[n.tag!].name}
              </text>
            )}
          </g>
        );
      })}

      {/* 영웅 점 — 위치가 바뀌면 미끄러져 간다 */}
      {hp && (
        <g style={{ transform: `translate(${hp.x}px, ${hp.y}px)`, transition: 'transform 900ms ease-in-out', pointerEvents: 'none' }}>
          <circle r={compact ? 4.5 : 7} fill={T.rare} opacity={0.35} />
          <circle r={compact ? 2.6 : 4} fill={T.rare} />
        </g>
      )}
    </svg>
  );
}
