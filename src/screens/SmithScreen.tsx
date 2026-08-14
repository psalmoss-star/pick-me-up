import { useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { Button, TOUCH_MIN } from '../ui/Button';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { bonusOf } from '../game/gear';
import { displayName } from '../game/identity';
import {
  GEAR_DEFS, GEAR_TUNING, SLOT_LABEL, RANK_LABEL,
  enhanceCostOf, enhanceChanceOf,
} from '../game/data/gear';
import { gameData } from '../game/data';
import type { GearInstId, GearInstance, HeroInstance, Wallet } from '../game/types';
import type { EnhanceGearResult } from '../stores/runStore';

export interface SmithScreenProps {
  gear: GearInstance[];
  roster: HeroInstance[];
  wallet: Wallet;
  onEnhance: (gearId: GearInstId) => EnhanceGearResult;
  onBack: () => void;
}

/**
 * 대장간 — 장비 강화.
 *
 * 실패해도 **파괴되지 않는다.** 금만 잃는다.
 * 퍼머데스가 이 게임의 유일한 상실이어야 하고, 강화까지 파괴를 넣으면
 * 상실이 흔해져서 영웅을 잃는 무게가 오히려 줄어든다 (data/gear.ts 주석).
 */
export function SmithScreen({ gear, roster, wallet, onEnhance, onBack }: SmithScreenProps) {
  const [selected, setSelected] = useState<GearInstId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const target = gear.find((g) => g.instId === selected) ?? null;
  const targetDef = target ? GEAR_DEFS[target.defId] : null;

  /** 누가 끼고 있는지 — 강화 대상을 고를 때 맥락이 된다 */
  const holderName = (g: GearInstance) => {
    if (!g.equippedBy) return null;
    const h = roster.find((x) => x.instId === g.equippedBy);
    return h ? displayName(h, gameData.heroes) : null;
  };

  const bonusText = (g: GearInstance) => {
    const b = bonusOf(g);
    const parts: string[] = [];
    if (b.atk) parts.push(`공격 ${b.atk >= 0 ? '+' : ''}${b.atk}`);
    if (b.hp) parts.push(`HP ${b.hp >= 0 ? '+' : ''}${b.hp}`);
    if (b.def) parts.push(`방어 ${b.def >= 0 ? '+' : ''}${b.def}`);
    if (b.spd) parts.push(`속도 ${b.spd >= 0 ? '+' : ''}${b.spd}`);
    if (b.crit) parts.push(`치명 ${b.crit >= 0 ? '+' : ''}${Math.round(b.crit * 100)}%`);
    return parts.join(' · ');
  };

  const doEnhance = () => {
    if (!target || !targetDef) return;
    const r = onEnhance(target.instId);
    if (!r.ok) {
      setNotice(
        r.reason === 'not-enough-gold' ? '금이 부족합니다.'
          : r.reason === 'max-enhance' ? '더는 벼릴 수 없습니다.'
            : '없는 장비입니다.',
      );
      return;
    }
    setNotice(
      r.success
        ? `${targetDef.name} +${r.enhance}. 쇠가 울었습니다. (금 ${r.spent} 소모)`
        // 실패해도 장비는 멀쩡하다는 것을 문구가 분명히 말해야 한다
        : `실패했습니다. 장비는 무사하지만 금 ${r.spent}을(를) 잃었습니다.`,
    );
  };

  const cost = target ? enhanceCostOf(target.enhance) : null;
  const chance = target ? enhanceChanceOf(target.enhance) : null;
  const maxed = target != null && cost == null;

  return (
    <div style={{ padding: '14px 12px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 16 }}>
        <span>대장간</span>
        <span>금 {wallet.gold.toLocaleString()}</span>
      </div>

      {gear.length === 0 ? (
        <SystemPanel compact tone="warning">
          <div style={{ fontSize: 12, lineHeight: 1.9, color: T.dim }}>
            벼릴 것이 없습니다.<br />
            장비는 <span style={{ color: T.text }}>상점</span>에서 사거나
            <span style={{ color: T.text }}> 탑</span>에서 얻습니다.
          </div>
        </SystemPanel>
      ) : (
        <>
          <SectionLabel>벼릴 것</SectionLabel>
          <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
            {gear.map((g) => {
              const d = GEAR_DEFS[g.defId];
              if (!d) return null;
              const on = g.instId === selected;
              const holder = holderName(g);
              return (
                <button
                  key={g.instId}
                  onClick={() => { setSelected(g.instId); setNotice(null); }}
                  style={{
                    minHeight: TOUCH_MIN,
                    background: 'transparent',
                    border: `1px solid ${on ? T.frame : T.panelHi}`,
                    color: T.text,
                    fontFamily: 'inherit',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: on ? `0 0 14px ${T.frame}22` : 'none',
                  }}
                >
                  <div style={{ fontSize: 13 }}>
                    {d.name}
                    {g.enhance > 0 && <span style={{ color: T.gold }}> +{g.enhance}</span>}
                    <span style={{ fontSize: 11, color: T.dim }}>
                      {' · '}{SLOT_LABEL[d.slot]} · {RANK_LABEL[d.rank]}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 3 }}>
                    {bonusText(g)}
                    {holder && ` · ${holder} 착용 중`}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {target && targetDef && (
        <SystemPanel compact tone={maxed ? 'rare' : 'normal'}>
          <div style={{ fontSize: 15, marginBottom: 6 }}>
            {targetDef.name}
            {target.enhance > 0 && <span style={{ color: T.gold }}> +{target.enhance}</span>}
          </div>

          {/* 강화 단계 — 시설과 같은 원리로 색이 아니라 칸으로 보인다 */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: 10 }}>
            {Array.from({ length: GEAR_TUNING.maxEnhance }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 20, height: 4,
                  background: i < target.enhance ? T.gold : T.panelHi,
                  boxShadow: i < target.enhance ? `0 0 8px ${T.gold}66` : 'none',
                }}
              />
            ))}
          </div>

          <div style={{ fontSize: 12, color: T.dim, marginBottom: 10 }}>
            현재 {bonusText(target)}
          </div>

          {maxed ? (
            <div style={{ fontSize: 12, color: T.gold, letterSpacing: '.2em' }}>
              더 벼릴 수 없습니다
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                다음 단계 → {bonusText({ ...target, enhance: target.enhance + 1 })}
              </div>
              <div style={{ fontSize: 11, color: T.dim, marginBottom: 12 }}>
                성공 확률 {Math.round((chance ?? 0) * 100)}% · 실패해도 장비는 무사합니다
              </div>
              <Button
                small
                onClick={doEnhance}
                disabled={cost == null || wallet.gold < cost}
              >
                {cost != null && wallet.gold >= cost ? `벼리기 · 금 ${cost}` : `금 ${cost} 필요`}
              </Button>
            </>
          )}
        </SystemPanel>
      )}

      {notice && (
        <div style={{ marginTop: 16 }}>
          <SystemPanel compact tone="rare">
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>{notice}</div>
          </SystemPanel>
        </div>
      )}

      <div style={{ marginTop: 20, textAlign: 'center', minHeight: TOUCH_MIN }}>
        <Button onClick={onBack}>돌아가기</Button>
      </div>
    </div>
  );
}
