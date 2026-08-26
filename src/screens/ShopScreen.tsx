import { useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { tabSafePadding } from '../ui/TabBar';
import { Button, TOUCH_MIN } from '../ui/Button';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { bonusOf, makeGear } from '../game/gear';
import { GEAR_SLOTS, SLOT_LABEL, RANK_LABEL, POTION_TUNING, shopStock } from '../game/data/gear';
import type { GearDef, GearDefId, GearSlot, Wallet } from '../game/types';
import type { BuyGearResult, BuyPotionResult } from '../stores/runStore';

export interface ShopScreenProps {
  wallet: Wallet;
  /** 이미 몇 개 갖고 있는지 표시용 (defId → 개수) */
  ownedCount: Record<string, number>;
  /** 보유 포션 */
  potions: number;
  onBuy: (defId: GearDefId) => BuyGearResult;
  onBuyPotion: () => BuyPotionResult;
  onBack: () => void;
  /**
   * 산 장비를 바로 채우러 간다.
   *
   * ⚠️ **여기서 고리가 끊겨 있었다.** 사고 나면 `"…을(를) 손에 넣었습니다"`로 끝나고,
   * 착용 경로(영웅 → 상세창 → 장비 슬롯)를 플레이어가 스스로 찾아야 했다.
   * 그래서 산 장비가 창고에 잠들고 **"사나 마나"** 로 읽혔다 —
   * 장비가 약해서가 아니라 효과를 볼 방법이 안 보여서다.
   */
  onGoEquip?: () => void;
}

/**
 * 상점 — 무기 / 방어구 / 장신구.
 *
 * 유물 등급은 여기 없다. 금으로 최상급을 살 수 있으면 등반이 아니라 지갑이
 * 강함을 정하기 때문이다 (data/gear.ts 주석 참조).
 */
export function ShopScreen({
  wallet, ownedCount, potions, onBuy, onBuyPotion, onBack, onGoEquip,
}: ShopScreenProps) {
  const [slot, setSlot] = useState<GearSlot>('weapon');
  const [notice, setNotice] = useState<string | null>(null);
  /** 방금 장비를 샀는가 — 착용 안내를 띄울지 정한다 */
  const [boughtGear, setBoughtGear] = useState(false);

  const stock = shopStock(slot);

  const doBuyPotion = () => {
    const r = onBuyPotion();
    setBoughtGear(false);
    setNotice(r.ok ? `치유 물약을 샀습니다. (금 ${r.spent} 소모)` : '금이 부족합니다.');
  };

  const doBuy = (def: GearDef) => {
    const r = onBuy(def.id);
    if (!r.ok) {
      setBoughtGear(false);
      setNotice(r.reason === 'not-enough-gold' ? '금이 부족합니다.' : '판매하지 않는 물건입니다.');
      return;
    }
    // 사는 것으로 끝내지 않는다 — 채워야 효과가 난다
    setBoughtGear(true);
    setNotice(`${def.name}을(를) 손에 넣었습니다. (금 ${r.spent} 소모)`);
  };

  /** 보정을 사람이 읽는 문구로. 계산은 gear.ts가 하고 여기선 표기만 한다. */
  const bonusText = (def: GearDef) => {
    const b = bonusOf(makeGear(def.id, 0));
    const parts: string[] = [];
    if (b.atk) parts.push(`공격 ${b.atk >= 0 ? '+' : ''}${b.atk}`);
    if (b.hp) parts.push(`HP ${b.hp >= 0 ? '+' : ''}${b.hp}`);
    if (b.def) parts.push(`방어 ${b.def >= 0 ? '+' : ''}${b.def}`);
    if (b.spd) parts.push(`속도 ${b.spd >= 0 ? '+' : ''}${b.spd}`);
    if (b.crit) parts.push(`치명 ${b.crit >= 0 ? '+' : ''}${Math.round(b.crit * 100)}%`);
    return parts.join(' · ');
  };

  return (
    <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 16 }}>
        <span>상점</span>
        <span>금 {wallet.gold.toLocaleString()}</span>
      </div>

      {/* 슬롯 전환 — 제단의 탭 전환과 같은 패턴 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {GEAR_SLOTS.map((s) => (
          <button
            key={s}
            onClick={() => { setSlot(s); setNotice(null); }}
            style={{
              flex: 1,
              minHeight: TOUCH_MIN,
              background: 'transparent',
              border: `1px solid ${slot === s ? T.frame : T.panelHi}`,
              color: slot === s ? T.text : T.dim,
              fontFamily: 'inherit',
              fontSize: 13,
              letterSpacing: '.1em',
              cursor: 'pointer',
            }}
          >
            {SLOT_LABEL[s]}
          </button>
        ))}
      </div>

      <SectionLabel>{SLOT_LABEL[slot]}</SectionLabel>

      <div style={{ display: 'grid', gap: 12 }}>
        {stock.map((def) => {
          const price = def.price!;
          const affordable = wallet.gold >= price;
          const owned = ownedCount[def.id] ?? 0;

          return (
            <SystemPanel key={def.id} compact>
              <div style={{ fontSize: 15, letterSpacing: '.1em', marginBottom: 2 }}>
                {def.name}
                {owned > 0 && (
                  <span style={{ fontSize: 11, color: T.dim }}> · 보유 {owned}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.1em', marginBottom: 8 }}>
                {RANK_LABEL[def.rank]}
              </div>
              <div style={{ fontSize: 13, color: T.gold, marginBottom: def.lore ? 6 : 12 }}>
                {bonusText(def)}
              </div>
              {def.lore && (
                <div style={{ fontSize: 11, color: T.dim, marginBottom: 12, lineHeight: 1.7 }}>
                  {def.lore}
                </div>
              )}
              <Button small onClick={() => doBuy(def)} disabled={!affordable}>
                {affordable ? `구입 · 금 ${price}` : `금 ${price} 필요`}
              </Button>
            </SystemPanel>
          );
        })}
      </div>

      {/*
        포션 — 슬롯 장비가 아니므로 탭 밖에 항상 둔다.
        전투 전에 사두는 물건이라 탭 안에 숨기면 살 타이밍을 놓친다.
      */}
      {/* 위 여백은 SectionLabel이 갖는다 — 여기 또 주면 두 배가 된다 */}
      <div>
        <SectionLabel>소모품</SectionLabel>
        <SystemPanel compact>
          <div style={{ fontSize: 15, letterSpacing: '.1em', marginBottom: 2 }}>
            치유 물약
            {potions > 0 && <span style={{ fontSize: 11, color: T.dim }}> · 보유 {potions}</span>}
          </div>
          <div style={{ fontSize: 13, color: T.gold, marginBottom: 6 }}>
            HP {Math.round(POTION_TUNING.healRatio * 100)}% 회복
          </div>
          <div style={{ fontSize: 11, color: T.dim, marginBottom: 12, lineHeight: 1.7 }}>
            HP가 {Math.round(POTION_TUNING.triggerAt * 100)}% 아래로 떨어지면 저절로 터집니다.<br />
            한 전투에 최대 {POTION_TUNING.maxPerBattle}개까지 들고 갑니다.
          </div>
          <Button
            small
            onClick={doBuyPotion}
            disabled={wallet.gold < POTION_TUNING.price}
          >
            {wallet.gold >= POTION_TUNING.price
              ? `구입 · 금 ${POTION_TUNING.price}`
              : `금 ${POTION_TUNING.price} 필요`}
          </Button>
        </SystemPanel>
      </div>

      {notice && (
        <div style={{ marginTop: 16 }}>
          <SystemPanel compact tone="rare">
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>{notice}</div>
            {/*
              사는 것으로 끝나면 창고에 잠든다 — 채우는 곳까지 데려간다.
              장비는 영웅에게 채워야 전투 스탯에 반영된다(battle.ts:136).
            */}
            {boughtGear && onGoEquip && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: T.dim, marginBottom: 8, lineHeight: 1.7 }}>
                  장비는 영웅에게 채워야 효과가 난다
                </div>
                <Button small onClick={onGoEquip}>채우러 가기</Button>
              </div>
            )}
          </SystemPanel>
        </div>
      )}

      {/*
        전부 못 사는 상태에서 설명이 없으면 "아직 못 여는 곳"으로 읽힌다.
        시설 화면에서 같은 문제를 겪었다 (HANDOFF STEP 6).
      */}
      {stock.every((d) => wallet.gold < d.price!) && (
        <div style={{ marginTop: 16 }}>
          <SystemPanel compact tone="warning">
            <div style={{ fontSize: 12, lineHeight: 1.8, color: T.dim }}>
              금이 부족합니다.<br />
              금은 <span style={{ color: T.text }}>탑의 층을 돌파</span>하면 들어옵니다.
            </div>
          </SystemPanel>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <SystemPanel compact>
          <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.8 }}>
            가장 귀한 것들은 팔지 않습니다.<br />
            유물은 탑에서만 나옵니다.
          </div>
        </SystemPanel>
      </div>

      <div style={{ marginTop: 20, textAlign: 'center', minHeight: TOUCH_MIN }}>
        <Button onClick={onBack}>돌아가기</Button>
      </div>
    </div>
  );
}
