import { useMemo } from 'react';
import { MM, T } from '../../ui/tokens';
import { TERRAIN } from '../../game/data/terrain';
import { groupsAt, type FloorMap } from '../../game/floormap';
import { enemyPlaceOf } from '../../game/data/enemyPlaces';
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
    <div style={{ position: 'relative', width: '100%', maxWidth: width, margin: '0 auto' }}>
    <svg
      viewBox={`0 0 ${width} ${H}`}
      width="100%"
      style={{ display: 'block' }}
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
          </g>
        );
      })}

    </svg>
      {/*
        이름표는 SVG 글자가 아니라 HTML로 얹는다(2026-10-06 폰 스크린샷). SVG 두 겹(어두운 테두리 + 글자)이
        폰에서 흰 덩어리로 뭉개졌고, 같은 화면에서 지형 면도 코드 값보다 밝았다. 폰 브라우저 다크 모드가
        SVG의 어두운 색을 밝게 바꾼 것으로 **추정**한다(데스크톱에서 재현 못 함). 같은 화면의 HTML 글씨는
        멀쩡했으므로 이름표를 그쪽으로 옮겼다. 폰 재확인 전 — HANDOFF STEP 64.
      */}
      {labels && layout.nodes.map((p) => {
        const n = byId.get(p.id)!;
        const text = n.kind === 'entry' ? '입구' : n.kind === 'exit' ? '계단' : TERRAIN[n.tag!].name;
        // 입구·계단은 지도 가장자리에 있다 — 가운데 맞춤이면 이름표가 지도 밖으로 삐져나간다
        const edge = n.kind === 'entry' ? { left: 0, shift: '0' } : n.kind === 'exit' ? { left: '100%', shift: '-100%' } : null;
        return (
          <span
            key={n.id}
            style={{
              position: 'absolute',
              left: edge ? edge.left : `${(p.x / cols) * 100}%`,
              // 두 줄 이름표(땅 + 적)는 한 줄보다 키가 커서 자리 표식에서 더 멀리 띄운다
              top: `calc(${(p.y / rows) * 100}% + ${(n.y > 0.5 ? -1 : 1) * (n.kind === 'path' && groupsAt(map, n.id).length > 0 ? 21 : 15)}px)`,
              transform: `translate(${edge ? edge.shift : '-50%'}, -50%)`,
              padding: '1px 4px',
              borderRadius: 2,
              background: MM.label,
              color: onChosen.has(n.id) ? T.text : T.dim,
              fontSize: 10,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {text}
            {/*
              이 자리에 머무는 적 — 종류만 적는다. **수는 적지 않는다**(수는 정찰 보고의 몫이고,
              지도가 참 수를 말하면 보고 왜곡이 무의미해진다). 종류는 편성 화면도 참으로 보여 준다.
            */}
            {n.kind === 'path' && groupsAt(map, n.id).length > 0 && (
              <span style={{ display: 'block', color: T.blood, textAlign: 'center' }}>
                {groupsAt(map, n.id).map((id) => enemyPlaceOf(id).short).join('·')}
              </span>
            )}
          </span>
        );
      })}
      {/* 점은 이름표보다 위다 — 이름표 바탕이 점을 가리면 "지금 어디서 싸우나"가 안 읽힌다 */}
      {dots && (
        <svg
          viewBox={`0 0 ${width} ${H}`}
          width="100%"
          style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}
          aria-hidden
        >
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
      )}
    </div>
  );
}
