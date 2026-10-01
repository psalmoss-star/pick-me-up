import { useMemo } from 'react';
import { MM, T } from '../../ui/tokens';
import { TERRAIN } from '../../game/data/terrain';
import type { FloorMap } from '../../game/floormap';
import { minimapLayout } from '../../ui/minimapLayout';
import type { MinimapDot } from '../../ui/minimapDots';

export interface MinimapProps {
  map: FloorMap;
  /** 고른 경로 — 금색 실선. 나머지는 흐린 점선 */
  route: number;
  /** 픽셀 폭. 높이는 격자 비율(rows/cols)로 정해진다 */
  width: number;
  /** 지형·입구·계단 이름 — 브리핑 크기에서만 */
  labels?: boolean;
  /** 있으면 길을 눌러 경로를 고른다(브리핑) */
  onSelectRoute?: (index: number) => void;
  /** 정찰 보고의 접점(경로 순서, null = 모름). 없으면 참 접점을 그린다 */
  contacts?: Array<string | null>;
  /** 전투 점 — `minimapDots`의 결과 */
  dots?: MinimapDot[];
}

/**
 * 층 미니맵 — 위에서 내려다본 지형도(2026-10-01, 1차 셀프 테스트 "스타크래프트 미니맵처럼").
 *
 * 지형 면은 참이고, ✕만 보고를 따른다. 브리핑(큰 지도, 경로 선택)과 전투(모서리 미니맵·펼친 지도)가
 * 같은 컴포넌트를 크기만 달리해 쓴다 — 두 지도가 같은 모양이어야 "브리핑에서 본 그 길"로 읽힌다.
 */
export function Minimap({ map, route, width, labels, onSelectRoute, contacts: reported, dots }: MinimapProps) {
  const layout = useMemo(() => minimapLayout(map), [map]);
  const { cols, rows } = layout;
  const u = width / cols;
  const H = rows * u;
  const px = (v: number) => v * u;
  const chosen = map.routes[route] ?? map.routes[0];
  const onChosen = new Set(chosen.nodeIds);
  const contacts = new Set(
    reported ? reported.filter((id): id is string => !!id) : map.routes.map((r) => r.contactId),
  );
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const small = !labels;

  return (
    <svg
      viewBox={`0 0 ${width} ${H}`}
      width="100%"
      style={{ display: 'block', maxWidth: width, margin: '0 auto' }}
      role="img"
      aria-label="층 지도"
    >
      <rect width={width} height={H} fill={MM.ground} />
      {/* 지형 면 — 칸 경계에 실금이 안 보이게 반 픽셀 겹친다 */}
      {layout.cells.map((tag, i) => tag && (
        <rect
          key={i}
          x={px(i % cols)} y={px(Math.floor(i / cols))}
          width={u + 0.5} height={u + 0.5}
          fill={MM[tag]}
        />
      ))}

      {/* 길 — 고른 경로를 마지막에 그려 위에 오게 한다 */}
      {[...layout.roads]
        .sort((a, b) => Number(a.route === chosen.index) - Number(b.route === chosen.index))
        .map((road) => {
          const pts = road.points.map(([x, y]) => `${px(x)},${px(y)}`).join(' ');
          const on = road.route === chosen.index;
          return (
            <g key={road.route}>
              <polyline
                points={pts}
                fill="none"
                stroke={on ? T.gold : T.dim}
                strokeWidth={small ? (on ? 1.2 : 0.8) : (on ? 2 : 1.2)}
                strokeDasharray={on ? undefined : small ? '2 2' : '4 4'}
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
                  onClick={() => onSelectRoute(road.route)}
                />
              )}
            </g>
          );
        })}

      {layout.nodes.map((p) => {
        const n = byId.get(p.id)!;
        const on = onChosen.has(n.id);
        const r = small ? 2.2 : 6;
        const x = px(p.x);
        const y = px(p.y);
        return (
          <g key={n.id} style={{ pointerEvents: 'none' }}>
            {contacts.has(n.id) ? (
              <g stroke={on ? T.blood : T.dim} strokeWidth={small ? 1.2 : 2.2}>
                <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
                <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} />
              </g>
            ) : (
              <circle
                cx={x} cy={y} r={n.kind === 'path' ? r * 0.6 : r}
                fill={n.kind === 'path' ? (on ? T.frame : T.panelHi) : T.panel}
                stroke={on ? T.gold : T.dim}
                strokeWidth={small ? 0.8 : 1.2}
              />
            )}
            {labels && (() => {
              const text = n.kind === 'entry' ? '입구' : n.kind === 'exit' ? '계단' : TERRAIN[n.tag!].name;
              const at = { x, y: y + (n.y > 0.5 ? -11 : 19), textAnchor: 'middle' as const, fontSize: 10, style: { fontFamily: 'inherit' } };
              // 테두리를 별도 층으로 먼저 그린다 — paint-order를 무시하는 폰 브라우저에서는
              // 테두리가 글자 위에 덮여 10px 글자가 뭉개졌다(2026-10-01 폰 실측).
              return (
                <>
                  <text {...at} fill="none" stroke={MM.ground} strokeWidth={3} strokeLinejoin="round">{text}</text>
                  <text {...at} fill={on ? T.text : T.dim}>{text}</text>
                </>
              );
            })()}
          </g>
        );
      })}

      {/* 점 — 위치가 바뀌면 직선으로 미끄러져 가고, 쓰러지면 회색이 되어 사라진다 */}
      {dots?.map((d) => {
        const color = d.dead ? T.dim : d.side === 'enemy' ? T.blood : d.side === 'guard' ? T.gold : T.rare;
        const s = u * 0.3;
        return (
          <g
            key={d.uid}
            style={{
              transform: `translate(${px(d.x)}px, ${px(d.y)}px)`,
              transition: 'transform 900ms ease-in-out, opacity 600ms',
              opacity: d.dead ? 0 : 1,
              pointerEvents: 'none',
            }}
          >
            {d.side === 'guard'
              ? <rect x={-s} y={-s} width={s * 2} height={s * 2} transform="rotate(45)" fill={color} />
              : <circle r={s} fill={color} />}
          </g>
        );
      })}
    </svg>
  );
}
