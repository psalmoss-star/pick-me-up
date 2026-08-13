import { T } from './tokens';
import type { Wallet } from '../game/types';

/**
 * 대기실 상단 HUD — 정체·진행도·재화.
 *
 * ── 왜 마을 위에 겹치는가 ─────────────────────────────
 * 마을 위에 얹으면 그림이 화면 끝까지 이어져 '세계'로 보인다.
 * 별도 행으로 빼면 그만큼 마을이 눌려 폰 세로에서 섬이 납작해진다(실측).
 * 대신 위쪽에 어두운 그라데이션을 깔아 글자 대비를 확보한다.
 *
 * ⚠️ **재화 칩에 부활권을 넣지 말 것.** Wallet에 필드는 있지만 항상 0이고
 * 구현 금지 대상이다(types.ts). 화면에 보이면 "언젠가 쓰는 것"으로 읽힌다.
 */

export interface BaseHudProps {
  wallet: Wallet;
  /** 현재 층 표시 — 등반이 끝났으면 그 사실을 대신 보여준다 */
  floorText: string;
  /** 살아있는 영웅 / 전체 */
  alive: number;
  total: number;
}

/** 재화 칩 하나. 아이콘 없이 이름+숫자만 — 명조 톤에 이모지가 섞이면 깨진다. */
function Chip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: 'rgba(12,9,26,.72)',
        border: `1px solid ${T.panelHi}`,
        borderRadius: 8,
        padding: '5px 8px',
        fontSize: 11,
        color: T.dim,
        minWidth: 0,
      }}
    >
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      <span
        style={{
          marginLeft: 'auto',
          color,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export function BaseHud({ wallet, floorText, alive, total }: BaseHudProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0, right: 0, top: 0,
        zIndex: 5,
        padding: '10px 12px 14px',
        background: 'linear-gradient(180deg, rgba(5,5,8,.92), rgba(5,5,8,0))',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ minWidth: 0, textAlign: 'left' }}>
          <div style={{ fontSize: 13, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {floorText}
          </div>
          <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
            영웅 {alive}/{total}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <Chip label="금" value={wallet.gold} color={T.gold} />
        <Chip label="젬" value={wallet.gems} color={T.rare} />
        <Chip label="승급석" value={wallet.promotionStones} color={T.amber} />
      </div>
    </div>
  );
}
