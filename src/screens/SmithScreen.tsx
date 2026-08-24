import { useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { tabSafePadding } from '../ui/TabBar';
import { Button, TOUCH_MIN } from '../ui/Button';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { bonusOf } from '../game/gear';
import { displayName } from '../game/identity';
import {
  GEAR_DEFS, GEAR_TUNING, SLOT_LABEL, RANK_LABEL,
  enhanceCostOf, enhanceChanceOf,
} from '../game/data/gear';
import { RECIPES } from '../game/data/recipes';
import { MATERIAL_DEFS, MATERIAL_ORDER } from '../game/data/materials';
import { canCraft, amountOf, type CraftResult } from '../game/craft';
import { gameData } from '../game/data';
import type {
  GearDefId, GearInstId, GearInstance, HeroInstance, MaterialBag, Wallet,
} from '../game/types';
import type { EnhanceGearResult } from '../stores/runStore';

type Mode = 'enhance' | 'craft';

export interface SmithScreenProps {
  gear: GearInstance[];
  roster: HeroInstance[];
  wallet: Wallet;
  onEnhance: (gearId: GearInstId) => EnhanceGearResult;
  onBack: () => void;
  /** 무기창고 시설 강화 카드로. 마을이 Lv.N을 약속하므로 여기서 닿아야 한다 */
  onOpenFacility?: () => void;
  /** 보유 재료 — 제작 탭이 부족분을 그려야 하므로 필요하다 */
  materials: MaterialBag;
  /** 도달한 최고 층. **지금 고른 층이 아니다** — 레시피 해금 판정 기준 */
  highestFloor: number;
  onCraft: (defId: GearDefId) => CraftResult;
}

/**
 * 대장간 — 장비 강화.
 *
 * 실패해도 **파괴되지 않는다.** 금만 잃는다.
 * 퍼머데스가 이 게임의 유일한 상실이어야 하고, 강화까지 파괴를 넣으면
 * 상실이 흔해져서 영웅을 잃는 무게가 오히려 줄어든다 (data/gear.ts 주석).
 */
export function SmithScreen({
  gear, roster, wallet, onEnhance, onBack, onOpenFacility,
  materials, highestFloor, onCraft,
}: SmithScreenProps) {
  const [mode, setMode] = useState<Mode>('enhance');
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

  const doCraft = (defId: GearDefId) => {
    const r = onCraft(defId);
    if (!r.ok) {
      setNotice(craftError(r));
      return;
    }
    // 확률이 없으므로 "성공했습니다"가 아니라 결과를 그대로 말한다
    setNotice(`${GEAR_DEFS[defId].name}이(가) 완성되었습니다. 창고에 넣었습니다.`);
  };

  const cost = target ? enhanceCostOf(target.enhance) : null;
  const chance = target ? enhanceChanceOf(target.enhance) : null;
  const maxed = target != null && cost == null;

  const switchMode = (m: Mode) => {
    setMode(m);
    setSelected(null);
    setNotice(null);
  };

  return (
    <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 16 }}>
        <span>대장간</span>
        <span>금 {wallet.gold.toLocaleString()}</span>
      </div>

      {/* 모드 전환 — 제단(ForgeScreen)과 같은 모양 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['enhance', 'craft'] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            style={{
              flex: 1,
              minHeight: TOUCH_MIN,
              background: 'transparent',
              border: `1px solid ${mode === m ? T.frame : T.panelHi}`,
              color: mode === m ? T.text : T.dim,
              fontFamily: 'inherit',
              fontSize: 13,
              letterSpacing: '.16em',
              cursor: 'pointer',
            }}
          >
            {m === 'enhance' ? '벼리기' : '만들기'}
          </button>
        ))}
      </div>

      {mode === 'craft' && (
        <CraftPanel
          materials={materials}
          gold={wallet.gold}
          highestFloor={highestFloor}
          onCraft={doCraft}
        />
      )}

      {mode === 'enhance' && (gear.length === 0 ? (
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
      ))}

      {mode === 'enhance' && target && targetDef && (
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

      {/*
        무기창고 건물에는 마을 부감도에 Lv.N이 붙어 있다 — 그런데 이 화면에는
        강화 카드가 없어 **자기 건물로 들어오면 자기 레벨을 올릴 방법이 없었다.**
        지도가 약속한 것을 화면이 지키게 한다.
      */}
      <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center', minHeight: TOUCH_MIN }}>
        <Button onClick={onBack}>돌아가기</Button>
        {onOpenFacility && <Button onClick={onOpenFacility}>시설 강화</Button>}
      </div>
    </div>
  );
}

/**
 * 제작 탭.
 *
 * ⚠️ **잠긴 레시피도 목록에 보인다.** 무엇을 위해 모으는지 모르면 재료가
 * 다시 "숫자 채우기"가 된다 — `materials.ts`가 종류를 3종으로 나눈 것과 같은 이유다.
 * 대신 잠긴 것은 흐리게 두고 "N층에서 열립니다"를 그대로 적는다.
 */
function CraftPanel({
  materials, gold, highestFloor, onCraft,
}: {
  materials: MaterialBag;
  gold: number;
  highestFloor: number;
  onCraft: (defId: GearDefId) => void;
}) {
  const bonusLine = (defId: GearDefId) => {
    const b = GEAR_DEFS[defId].base;
    const parts: string[] = [];
    if (b.atk) parts.push(`공격 +${b.atk}`);
    if (b.hp) parts.push(`HP +${b.hp}`);
    if (b.def) parts.push(`방어 +${b.def}`);
    if (b.spd) parts.push(`속도 ${b.spd >= 0 ? '+' : ''}${b.spd}`);
    if (b.crit) parts.push(`치명 +${Math.round(b.crit * 100)}%`);
    return parts.join(' · ');
  };

  return (
    <>
      {/* 보유 재료 — 무엇이 얼마나 있는지가 먼저 보여야 한다 */}
      <SectionLabel>가진 재료</SectionLabel>
      <div style={{ display: 'grid', gap: 4, marginBottom: 18 }}>
        {MATERIAL_ORDER.map((id) => (
          <div
            key={id}
            style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, color: T.dim, padding: '2px 2px',
            }}
          >
            <span>{MATERIAL_DEFS[id].name}</span>
            <span style={{ color: amountOf(materials, id) > 0 ? T.text : T.dim }}>
              {amountOf(materials, id)}
            </span>
          </div>
        ))}
      </div>

      <SectionLabel>만들 수 있는 것</SectionLabel>
      <div style={{ display: 'grid', gap: 8, marginBottom: 4 }}>
        {RECIPES.map((r) => {
          const def = GEAR_DEFS[r.gearDefId];
          const check = canCraft({
            gearDefId: r.gearDefId, have: materials, gold, highestFloor,
          });
          const locked = !check.ok && check.reason === 'locked';

          return (
            <SystemPanel key={r.gearDefId} compact tone={check.ok ? 'rare' : 'normal'}>
              <div style={{ fontSize: 14, marginBottom: 4, opacity: locked ? 0.5 : 1 }}>
                {def.name}
                <span style={{ fontSize: 11, color: T.dim }}>
                  {' · '}{SLOT_LABEL[def.slot]} · {RANK_LABEL[def.rank]}
                </span>
              </div>
              <div style={{ fontSize: 11, color: T.dim, marginBottom: 8, opacity: locked ? 0.5 : 1 }}>
                {bonusLine(r.gearDefId)}
              </div>

              {locked ? (
                <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.14em' }}>
                  {r.unlockFloor}층에서 열립니다
                </div>
              ) : (
                <>
                  {/* 재료별로 가진 것/필요한 것을 나란히 — 부족한 쪽만 색이 다르다 */}
                  <div style={{ display: 'grid', gap: 3, marginBottom: 10 }}>
                    {(Object.entries(r.cost) as [keyof MaterialBag, number][]).map(([id, need]) => {
                      const have = amountOf(materials, id);
                      const short = have < need;
                      return (
                        <div
                          key={String(id)}
                          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}
                        >
                          <span style={{ color: T.dim }}>{MATERIAL_DEFS[id]?.name}</span>
                          <span style={{ color: short ? T.amber : T.text }}>
                            {have} / {need}
                          </span>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: T.dim }}>금</span>
                      <span style={{ color: gold < r.gold ? T.amber : T.text }}>
                        {gold.toLocaleString()} / {r.gold.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <Button small onClick={() => onCraft(r.gearDefId)} disabled={!check.ok}>
                    {check.ok ? '만들기' : '재료가 모자랍니다'}
                  </Button>
                </>
              )}
            </SystemPanel>
          );
        })}
      </div>

      {/* 제작에 확률이 없다는 것은 눌러보기 전에 알려야 한다 */}
      <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.8, margin: '10px 2px 18px' }}>
        제작은 실패하지 않습니다. 재료와 금이 차면 반드시 완성됩니다.
      </div>
    </>
  );
}

function craftError(r: Extract<CraftResult, { ok: false }>): string {
  switch (r.reason) {
    case 'locked': return '아직 열리지 않은 물건입니다.';
    case 'not-enough-gold': return `금이 ${r.missingGold?.toLocaleString()} 모자랍니다.`;
    case 'not-enough-materials': {
      const parts = (Object.entries(r.missing ?? {}) as [keyof MaterialBag, number][])
        .map(([id, n]) => `${MATERIAL_DEFS[id]?.name} ${n}`)
        .join(' · ');
      return `재료가 모자랍니다. (${parts})`;
    }
    default: return '만들 수 없는 물건입니다.';
  }
}
