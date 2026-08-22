import { useState } from 'react';
import { T } from './tokens';
import { TOUCH_MIN } from './Button';
import { MISSION_LABEL } from '../game/mission';
import { FLOORS, FLOOR_SEGMENTS, segmentIndexOfFloor } from '../game/data/floors';

type CellState = 'done' | 'now' | 'locked';

function stateOf(index: number, current: number, cleared: boolean): CellState {
  // 정상 클리어 후에는 current가 마지막 층에 묶여 있어도 '현재'로 남으면 안 된다.
  return cleared || index < current ? 'done' : index === current ? 'now' : 'locked';
}

function colorOf(state: CellState): string {
  return state === 'now' ? T.gold : state === 'done' ? '#4A6B4A' : '#26232E';
}

/**
 * 층 한 칸.
 *
 * **보스는 색이 아니라 형태로 구분한다** — 모서리를 잘라 팔각으로 만든다.
 * 색만 바꾸면 잠긴 보스(#26232E)와 잠긴 일반 층이 구분되지 않는다.
 * (등급 표현에서 이미 겪은 함정을 층에도 적용한 것이다.)
 *
 * 항상 순수 표시용 `<div>`다 — 층 선택은 이 칸을 감싸는 쪽(펼친 구간의 `known` 줄)에서
 * `<button>`으로 처리한다. 접힌 격자(`FloorGrid`)의 칸은 20px 안팎이라 여기서 44px
 * 터치 타깃을 억지로 씌우면 `repeat(10, 1fr)` 격자가 겹쳐 깨진다 — 격자는 그대로
 * 진행도 표시로만 두고, 실제 선택은 이름이 보이는 펼친 줄에서만 받는다.
 */
function Cell({
  id, state, size, boss, showLabel,
}: { id: number; state: CellState; size: number; boss: boolean; showLabel?: boolean }) {
  const col = colorOf(state);
  const cut = Math.max(4, Math.round(size * 0.26));
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `1px solid ${col}`,
        background: state === 'now' ? `${T.gold}1A` : boss ? '#120E1A' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: showLabel ? 12 : size <= 22 ? 9 : 10,
        color: state === 'locked' ? '#3A3646' : col,
        boxShadow: state === 'now' ? `0 0 14px ${T.gold}55` : 'none',
        // 보스 층은 팔각. 잠겨 있어도 실루엣으로 읽힌다.
        clipPath: boss
          ? `polygon(${cut}px 0,calc(100% - ${cut}px) 0,100% ${cut}px,100% calc(100% - ${cut}px),calc(100% - ${cut}px) 100%,${cut}px 100%,0 calc(100% - ${cut}px),0 ${cut}px)`
          : undefined,
        transition: 'all 400ms',
        flexShrink: 0,
      }}
    >
      {id}
    </div>
  );
}

/**
 * 층을 격자로 눌러 담는다 (10칸씩).
 *
 * ⚠️ **격자도 아래에서 위로 읽혀야 한다.** 그냥 `grid`에 쏟으면 채우기 순서가
 * 좌→우·위→아래라 **낮은 층이 맨 윗줄**에 온다 — 줄 세우기는 뒤집어 놓고 격자만
 * 그대로 두면 같은 화면 안에서 방향이 서로 반대가 된다(실측으로 2층이 20층보다 위였다).
 * 그래서 10칸씩 끊어 **행 단위로 뒤집어** 쌓는다.
 */
function FloorGrid({
  floors, size, cellState,
}: {
  floors: { id: number; isBoss?: boolean }[];
  size: number;
  cellState: (floorId: number) => CellState;
}) {
  const rows: typeof floors[] = [];
  for (let i = 0; i < floors.length; i += 10) rows.push(floors.slice(i, i + 10));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 3,
        width: '100%',
        padding: '6px 10px 2px',
      }}
    >
      {rows.map((row) => (
        <div
          key={row[0].id}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3, justifyItems: 'center' }}
        >
          {row.map((f) => (
            <Cell key={f.id} id={f.id} state={cellState(f.id)} size={size} boss={!!f.isBoss} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * 탑 미니맵. 아래에서 위로 쌓인다 — 오르는 방향과 시선 방향을 맞춘다.
 *
 * ── 왜 구간으로 접는가 ─────────────────────────────────
 * 탑이 100층이 되면서 한 줄로 쌓으면 세로가 3,800px을 넘는다. 대기실에서 참조로 보는
 * 정보인데 스크롤을 한참 굴려야 현재 층이 나온다.
 * → **구간(`FLOOR_SEGMENTS`) 단위로 접고, 현재 구간만 펼친다.**
 *
 * 접힌 구간도 **완전히 숨기지 않는다.** 20칸을 격자로 눌러 담아 진행도가 한눈에 보인다 —
 * "얼마나 왔고 얼마나 남았나"는 등반 게임에서 정보가 아니라 동기다(§5-6: 허전하다고 빼지 말 것).
 */
export function TowerMap({
  current, compact, cleared, maxFloorReached, onSelectFloor,
}: {
  current: number;
  compact?: boolean;
  cleared?: boolean;
  /** 해금 상한(인덱스). 이 위는 못 고른다 */
  maxFloorReached: number;
  onSelectFloor?: (index: number) => void;
}) {
  const currentFloorId = FLOORS[Math.max(0, Math.min(FLOORS.length - 1, current))]?.id ?? 1;
  const currentSeg = segmentIndexOfFloor(currentFloorId);
  // 정상에 서면 마지막 구간을 편다 — 클리어 직후 화면이 접힌 채로 뜨면 허전하다.
  const [openSeg, setOpenSeg] = useState<number>(cleared ? FLOOR_SEGMENTS.length - 1 : currentSeg);

  return (
    <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 10, alignItems: 'stretch' }}>
      {FLOOR_SEGMENTS.map((seg, si) => {
        const open = si === openSeg;
        const floors = FLOORS.slice(seg.from - 1, seg.to);
        const doneCount = floors.filter((_, k) => stateOf(seg.from - 1 + k, current, !!cleared) === 'done').length;
        const hasCurrent = si === currentSeg && !cleared;
        const reached = doneCount > 0 || hasCurrent;

        // 펼쳤을 때 이름을 보여줄 층(도달했거나 현재) vs 아직 모르는 층.
        // 이름을 아는 층만 줄로 세우고 나머지는 격자로 눌러 담는다.
        const known = floors.filter((_, k) => stateOf(seg.from - 1 + k, current, !!cleared) !== 'locked');
        const lockedAhead = floors.filter((_, k) => stateOf(seg.from - 1 + k, current, !!cleared) === 'locked');

        return (
          <div key={seg.name + seg.from}>
            <button
              type="button"
              onClick={() => setOpenSeg(open ? -1 : si)}
              style={{
                width: '100%',
                minHeight: 44, // 터치 타깃 — Button.tsx의 TOUCH_MIN과 같은 기준
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '0 10px',
                background: hasCurrent ? `${T.gold}0F` : 'transparent',
                border: `1px solid ${hasCurrent ? `${T.gold}66` : T.panelHi}`,
                color: reached ? T.text : T.dim,
                font: 'inherit',
                fontSize: 12,
                letterSpacing: '.15em',
                cursor: 'pointer',
              }}
            >
              <span>
                {reached ? seg.name : '???'}
                <span style={{ color: T.dim, letterSpacing: 0 }}> · {seg.from}~{seg.to}층</span>
              </span>
              <span style={{ color: hasCurrent ? T.gold : T.dim, fontSize: 11, letterSpacing: 0 }}>
                {doneCount}/{floors.length}
                <span style={{ marginLeft: 8 }}>{open ? '−' : '+'}</span>
              </span>
            </button>

            {open ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  gap: 4,
                  alignItems: 'center',
                  padding: '10px 0 2px',
                }}
              >
                {known.map((f) => {
                  const idx = FLOORS.indexOf(f);
                  const state = stateOf(idx, current, !!cleared);
                  // 해금된 층만 고를 수 있다 — 잠긴 층은 애초에 known에 안 들어오지만
                  // (§5-29의 상태 판정과 별개로) 상한을 다시 확인해 이중으로 막는다.
                  const selectable = !!onSelectFloor && idx <= maxFloorReached;
                  const rowStyle = {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                  } as const;
                  const content = (
                    <>
                      <Cell
                        id={f.id}
                        state={state}
                        size={compact ? 26 : 34}
                        boss={!!f.isBoss}
                        showLabel={!compact}
                      />
                      {!compact && (
                        <div
                          style={{
                            fontSize: 11,
                            color: state === 'now' ? T.text : T.dim,
                            minWidth: 150,
                            textAlign: 'left',
                          }}
                        >
                          {`${f.name} · ${MISSION_LABEL[f.mission.kind]}`}
                          {state === 'now' && <span style={{ color: T.gold }}> ◀ 현재</span>}
                        </div>
                      )}
                    </>
                  );

                  return selectable ? (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onSelectFloor(idx)}
                      style={{
                        ...rowStyle,
                        minHeight: TOUCH_MIN,
                        padding: 0,
                        background: 'transparent',
                        border: 'none',
                        font: 'inherit',
                        cursor: 'pointer',
                        justifyContent: 'flex-start',
                      }}
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={f.id} style={rowStyle}>
                      {content}
                    </div>
                  );
                })}

                {/*
                  **잠긴 층은 줄로 늘어놓지 않는다.**
                  전부 '???'라 20줄을 쌓아도 정보가 없는데 세로만 950px을 먹었다(실측 1318→651px).
                  접기를 넣은 이유가 사라지므로 격자로 눌러 담는다 — §5-6("허전하다고 정보를
                  빼지 말 것")과 충돌하지 않는다. 빼는 게 아니라 **모르는 것을 모른다고**
                  같은 밀도로 표시하는 것이다.

                  ⚠️ **이 블록은 반드시 `known` 뒤에 온다.** 부모가 `column-reverse`라
                  DOM 앞이 화면 **아래**다 — 앞에 두면 아직 안 오른 층이 현재 층보다 밑에 깔려
                  "아래에서 위로 오른다"는 방향이 뒤집힌다(실측으로 2층이 1층보다 아래였다).
                */}
                {lockedAhead.length > 0 && (
                  <FloorGrid
                    floors={lockedAhead}
                    size={compact ? 16 : 20}
                    cellState={() => 'locked'}
                  />
                )}
              </div>
            ) : (
              // 접힌 구간 — 격자로 눌러 담아 진행도만 보여준다.
              <FloorGrid
                floors={floors}
                size={compact ? 16 : 20}
                cellState={(id) => stateOf(id - 1, current, !!cleared)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
