import { useState } from 'react';
import { SystemPanel } from '../../ui/SystemPanel';
import { Button } from '../../ui/Button';
import { T } from '../../ui/tokens';
import {
  STRATAGEMS, STRATAGEM_BY_ID, STRATAGEM_SLOTS, STRATAGEM_TUNING,
  type StratagemDef, type StratagemId,
} from '../../game/data/stratagems';
import { describeStratagem } from '../../game/stratagem';
import { FALLBACK_LABEL, FALLBACK_ORDERS, type FallbackOrder } from '../../game/orders';

export interface StratagemPanelProps {
  /** 장착한 책략 — 슬롯 순서 = 발동 우선순위 */
  loadout: StratagemId[];
  /** 해금된 책략 */
  unlocked: StratagemId[];
  /** 적의 내성 */
  resist: Partial<Record<StratagemId, number>>;
  fallback: FallbackOrder;
  onSetSlot: (slot: number, id: StratagemId | null) => boolean;
  onSetFallback: (order: FallbackOrder) => boolean;
}

/**
 * 출정 전 작전 — 책략 2장 + 군령(퇴각). 기획서 1단계(2026-09-29 재설계).
 *
 * 책략은 **전투 중에 마스터가 고르지 않는다** — 불리하면 영웅이 알아서 쓴다.
 * 그래서 이 화면이 책략에 손대는 유일한 자리다. 출정 후 바꿀 수 있는 것은 후퇴 신호 하나뿐이다.
 */
export function StratagemPanel({
  loadout, unlocked, resist, fallback, onSetSlot, onSetFallback,
}: StratagemPanelProps) {
  /** 지금 카드를 고르고 있는 슬롯. null이면 접혀 있다 */
  const [picking, setPicking] = useState<number | null>(null);
  const locked = STRATAGEMS.filter((s) => !unlocked.includes(s.id));

  const choose = (id: StratagemId | null) => {
    if (picking === null) return;
    onSetSlot(picking, id);
    setPicking(null);
  };

  return (
    <SystemPanel compact>
      <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.3em', marginBottom: 6 }}>
        작전
      </div>
      <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.8, marginBottom: 12 }}>
        불리해지면 가장 지혜로운 영웅이 책략을 쓴다. 간파당하면 대가를 치른다.
      </div>

      {Array.from({ length: STRATAGEM_SLOTS }, (_, slot) => {
        const id = loadout[slot];
        const def = id ? STRATAGEM_BY_ID[id] : null;
        const open = picking === slot;
        return (
          <div key={slot} style={{ marginBottom: 10 }}>
            <button
              onClick={() => setPicking(open ? null : slot)}
              style={{
                width: '100%', minHeight: 44, padding: '10px 12px', boxSizing: 'border-box',
                background: 'transparent', color: T.text, fontFamily: 'inherit', cursor: 'pointer',
                border: `1px solid ${open ? T.gold : T.panelHi}`,
              }}
            >
              <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.2em' }}>
                책략 {slot + 1}
              </div>
              {def ? (
                <>
                  <div style={{ fontSize: 15, color: T.gold, letterSpacing: '.1em', marginTop: 4 }}>
                    {def.name}
                  </div>
                  <CardText def={def} />
                  <ResistNote n={resist[def.id] ?? 0} />
                </>
              ) : (
                <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>비어 있음</div>
              )}
            </button>

            {open && (
              <div style={{ border: `1px solid ${T.panelHi}`, borderTop: 'none', padding: '8px 10px' }}>
                {unlocked.map((sid) => {
                  const d = STRATAGEM_BY_ID[sid];
                  const here = loadout[slot] === sid;
                  return (
                    <button
                      key={sid}
                      onClick={() => choose(sid)}
                      style={{
                        width: '100%', minHeight: 44, padding: '8px 6px', marginBottom: 4,
                        boxSizing: 'border-box', background: 'transparent', fontFamily: 'inherit',
                        color: T.text, cursor: 'pointer',
                        border: `1px solid ${here ? T.gold : 'transparent'}`,
                      }}
                    >
                      <div style={{ fontSize: 14, color: here ? T.gold : T.text, letterSpacing: '.08em' }}>
                        {d.name}
                        {loadout.includes(sid) && !here ? ' · 다른 칸에 있음' : ''}
                      </div>
                      <CardText def={d} />
                      <ResistNote n={resist[sid] ?? 0} />
                    </button>
                  );
                })}
                {loadout[slot] && (
                  <Button small onClick={() => choose(null)}>비우기</Button>
                )}
                {/* 아직 모르는 책략 — "다음 층에서 얻을 수 있는 것" */}
                {locked.map((d) => (
                  <div key={d.id} style={{ fontSize: 11, color: T.dim, lineHeight: 1.9, opacity: 0.7 }}>
                    {d.name} — {d.unlockFloor}층을 넘으면 알게 된다
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.3em', margin: '16px 0 6px' }}>
        군령 · 퇴각
      </div>
      <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.8, marginBottom: 10 }}>
        체력이 이만큼 떨어진 영웅은 싸움에서 물러나 살아남는다. 남은 자들이 지면 패배다.
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {FALLBACK_ORDERS.map((o) => (
          <Button
            key={o}
            small
            tone={fallback === o ? 'warning' : 'normal'}
            onClick={() => onSetFallback(o)}
          >
            {FALLBACK_LABEL[o]}
          </Button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.amber, lineHeight: 1.8, marginTop: 12 }}>
        출정 후 바꿀 수 있는 것은 후퇴 신호 하나뿐입니다.
      </div>
    </SystemPanel>
  );
}

/**
 * 카드 본문 — 원리 한 줄 · 발동/성공/간파 · 출전.
 * 수치 문장은 `describeStratagem`이 효과 데이터에서 만든다(손으로 적으면 튜닝 때 갈라진다).
 */
function CardText({ def }: { def: StratagemDef }) {
  const d = describeStratagem(def);
  return (
    <>
      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.7, marginTop: 2 }}>{def.principle}</div>
      <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7, marginTop: 4 }}>발동 · {d.trigger}</div>
      <div style={{ fontSize: 11, color: T.rare, lineHeight: 1.7 }}>성공 · {d.success}</div>
      <div style={{ fontSize: 11, color: T.amber, lineHeight: 1.7 }}>간파 · {d.failure}</div>
      <div style={{ fontSize: 10, color: T.dim, lineHeight: 1.7, marginTop: 2, opacity: 0.8 }}>{def.source}</div>
    </>
  );
}

/** 적의 내성 — 같은 책략을 연달아 쓰면 적이 알아챈다 */
function ResistNote({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <div style={{ fontSize: 11, color: T.amber, marginTop: 2 }}>
      적이 알아챔 {'●'.repeat(n)}{'○'.repeat(STRATAGEM_TUNING.resistMax - n)}
    </div>
  );
}
