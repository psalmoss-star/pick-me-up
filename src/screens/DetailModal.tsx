import { useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { Button, TOUCH_MIN } from '../ui/Button';
import { HeroPortrait } from '../ui/art/HeroPortrait';
import { heroVariantOf } from '../ui/art/heroImages';
import { heroArtOf } from '../ui/artMap';
import { ELEMENT_KR, T, quartersFor, nextQuartersFor } from '../ui/tokens';
import { computeAttributes, computeHeroStats, isAtCap } from '../game/stats';
import { klassName } from '../game/klass';
import { displayName, displayTitle } from '../game/identity';
import { estimatePotential } from '../game/reveal';
import { applyBonus, heroBonus, bonusOf } from '../game/gear';
import { bestFreeGear, gearDelta, type GearDelta } from '../game/gearCompare';
import { GEAR_DEFS, GEAR_SLOTS, SLOT_LABEL, gearTag } from '../game/data/gear';
import { gameData } from '../game/data';
import type {
  Attribute, GearInstId, GearInstance, GearSlot, HeroInstance,
} from '../game/types';

export interface DetailModalProps {
  hero: HeroInstance;
  onClose: () => void;
  /** 보유 장비 전체. 없으면 장비 섹션을 아예 그리지 않는다. */
  gear?: GearInstance[];
  onEquip?: (gearId: GearInstId) => void;
  onUnequip?: (slot: GearSlot) => void;
  /** 다른 영웅이 낀 장비를 가져온다(명시적). 없으면 남의 장비는 보이기만 한다 */
  onTake?: (gearId: GearInstId) => void;
  /** 착용자 이름·전투력 하락을 보이려고 쓴다 */
  roster?: HeroInstance[];
  /** 즐겨찾기 토글. 없으면 버튼을 그리지 않는다(무덤처럼 못 바꾸는 화면). */
  onToggleFavorite?: () => void;
}

/** 장비로 올라간 수치는 금색 — 레벨 덕인지 장비 덕인지 구분되어야 한다 */
function Stat({ v, up }: { v: number; up: boolean }) {
  return <span style={{ color: up ? T.gold : T.dim }}>{v}</span>;
}

/** 영웅 상세 — 능력치의 현재/상한을 그대로 드러낸다. 상한 도달은 금색. */
export function DetailModal({
  hero, onClose, gear, onEquip, onUnequip, onTake, roster, onToggleFavorite,
}: DetailModalProps) {
  /** 후보 목록을 펼친 슬롯 — 기존 모바일 RPG 관례(슬롯 탭 → 목록 → 비교 → 착용) */
  const [openSlot, setOpenSlot] = useState<GearSlot | null>(null);
  const def = gameData.heroes[hero.defId];
  const attrs = computeAttributes(def, hero.star, hero.level, gameData.starScaling);
  const baseStats = computeHeroStats(def, hero.star, hero.level, gameData.starScaling);
  const capped = isAtCap(attrs);
  /** 승급하면 옮겨갈 거처. ★6이면 null — 아래 경고 문구가 갈라 쓴다 */
  const nextQuarters = nextQuartersFor(hero.star);

  /**
   * 표시 스탯에 장비를 태운다. 안 그러면 상세창 숫자와 실제 전투가 어긋난다.
   * 계산은 battle.ts와 같은 함수를 쓴다 — 여기서 다시 더하면 두 곳으로 갈라진다.
   */
  const index = new Map((gear ?? []).map((g) => [g.instId, g]));
  const bonus = gear ? heroBonus(hero.gear, index) : {};
  const stats = gear ? applyBonus(baseStats, bonus) : baseStats;

  const holderOf = (g: GearInstance) =>
    g.equippedBy ? roster?.find((h) => h.instId === g.equippedBy && !h.isDead) : undefined;
  /**
   * 이 슬롯의 후보 — 창고의 것 + 살아 있는 다른 영웅이 낀 것(가져오기용). 전투력이 오르는 순.
   * 이 영웅이 지금 낀 것은 빼고 슬롯 줄에 따로 보인다.
   */
  const candidatesFor = (slot: GearSlot) =>
    (gear ?? [])
      .filter((g) => GEAR_DEFS[g.defId]?.slot === slot && g.equippedBy !== hero.instId)
      .filter((g) => !g.equippedBy || !!holderOf(g))
      .map((g) => ({ g, delta: gearDelta(hero, def, gameData.starScaling, index, slot, g) }))
      .sort((a, b) => b.delta.power - a.delta.power);
  /** 슬롯마다 창고에서 전투력이 가장 오르는 것 — 자동 장착과 '추천' 표식이 같은 값을 쓴다 */
  const autoPicks = GEAR_SLOTS
    .map((slot) => (gear ? bestFreeGear(hero, def, gameData.starScaling, index, slot) : null))
    .filter((g): g is GearInstance => !!g);

  /** 보정을 사람이 읽는 짧은 문구로 */
  const bonusText = (g: GearInstance) => {
    const b = bonusOf(g);
    const parts: string[] = [];
    if (b.atk) parts.push(`공${b.atk >= 0 ? '+' : ''}${b.atk}`);
    if (b.hp) parts.push(`HP${b.hp >= 0 ? '+' : ''}${b.hp}`);
    if (b.def) parts.push(`방${b.def >= 0 ? '+' : ''}${b.def}`);
    if (b.spd) parts.push(`속${b.spd >= 0 ? '+' : ''}${b.spd}`);
    if (b.crit) parts.push(`치명${b.crit >= 0 ? '+' : ''}${Math.round(b.crit * 100)}%`);
    return parts.join(' · ');
  };
  /**
   * 잠재치는 참값이 아니라 구간 추정만 읽는다 (reveal.ts).
   * 여기서 potentialOf/derivePotential을 직접 부르면 화면이 참값을 알게 된다 — 금지.
   */
  const reveal = estimatePotential(hero);

  const row = (label: string, at: Attribute) => (
    <span style={{ display: 'inline-block', minWidth: 98, margin: '0 4px' }}>
      <span style={{ color: T.dim }}>{label} : </span>
      <span style={{ color: at.current >= at.max ? T.gold : T.text }}>
        {at.current}/{at.max}
      </span>
    </span>
  );

  return (
    <div
      onClick={onClose}
      /*
        alignItems:'center'와 overflowY:'auto'를 같이 쓰면 안 된다.
        내용이 뷰포트보다 커지는 순간 센터링이 위쪽을 스크롤 원점 밖으로 밀어내
        **스크롤로도 닿을 수 없는 영역**이 생긴다 (375×667에서 닫기 버튼이 잘렸다).
        flex-start로 두고 자식의 margin:auto가 여백이 남을 때만 가운데로 보낸다.
      */
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 14px', zIndex: 50, overflowY: 'auto' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '100%', margin: 'auto' }}>
        <SystemPanel>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            {/*
              카드와 같은 정면 초상 맥락이므로 생성 일러스트를 쓴다.
              전투 화면만 HeroArt로 남는다 — 거기는 5종이 같은 접지선(cy=74)에
              서야 해서 사진형 이미지를 끼우면 유닛이 다른 바닥에 뜬 것처럼 보인다.
              (HeroPortrait는 이미지가 없거나 로드에 실패하면 알아서 HeroArt로 폴백한다)
            */}
            <HeroPortrait defId={hero.defId} variant={heroVariantOf(hero)} art={heroArtOf(hero.defId)} element={def.element} size={92} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>
            {displayName(hero, gameData.heroes)}({'★'.repeat(hero.star)}) <span style={{ fontSize: 15 }}>Lv.{hero.level}</span>
          </div>
          <div style={{ fontSize: 12, color: T.dim, marginBottom: 14 }}>
            {displayTitle(hero, gameData.heroes)} · 클래스 : {klassName(hero.defId, hero.star, gameData.heroes)} · 거처 : {quartersFor(hero.star)} · 속성 : {ELEMENT_KR[def.element]}
          </div>
          <div style={{ fontSize: 14, lineHeight: 2.1 }}>
            {row('힘', attrs.str)}{row('지능', attrs.int)}
            <br />
            {row('체력', attrs.vit)}{row('민첩', attrs.agi)}
          </div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 14, lineHeight: 1.9 }}>
            {/*
              장비를 낀 항목은 금색으로 올려 보여준다.
              숫자만 바뀌면 그게 장비 덕인지 레벨 덕인지 구분이 안 된다.
            */}
            HP <Stat v={stats.hp} up={!!bonus.hp} /> · 공격 <Stat v={stats.atk} up={!!bonus.atk} />
            {' · '}방어 <Stat v={stats.def} up={!!bonus.def} /> · 속도 <Stat v={stats.spd} up={!!bonus.spd} />
            <br />
            보유스킬 : {def.skillIds.map((id) => gameData.skills[id]?.name).filter(Boolean).join(', ')}
          </div>

          {/* 장비 — 슬롯 3칸. gear를 안 넘기면 통째로 감춘다 */}
          {gear && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.panelHi}` }}>
              <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.3em', marginBottom: 6 }}>
                장비
              </div>
              {onEquip && (
                <div style={{ marginBottom: 10 }}>
                  {/* 자동 장착은 창고의 장비만 쓴다 — 남의 장비를 조용히 가져오지 않는다 */}
                  <Button small disabled={autoPicks.length === 0} onClick={() => autoPicks.forEach((g) => onEquip(g.instId))}>
                    자동 장착
                  </Button>
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 4 }}>
                    {autoPicks.length ? '창고에서 전투력이 가장 오르는 것으로 낍니다' : '창고에 더 나은 장비가 없습니다'}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gap: 10 }}>
                {GEAR_SLOTS.map((slot) => {
                  const wornId = hero.gear?.[slot];
                  const worn = wornId ? index.get(wornId) : undefined;
                  const wornDef = worn ? GEAR_DEFS[worn.defId] : undefined;

                  return (
                    <div key={slot} style={{ border: `1px solid ${T.panelHi}`, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => setOpenSlot(openSlot === slot ? null : slot)}
                          disabled={!onEquip}
                          style={{
                            minHeight: TOUCH_MIN, minWidth: 64, padding: '0 8px',
                            background: openSlot === slot ? T.panelHi : 'transparent',
                            border: `1px solid ${openSlot === slot ? T.gold : T.panelHi}`,
                            color: T.text, fontFamily: 'inherit', fontSize: 11, letterSpacing: '.1em',
                            cursor: onEquip ? 'pointer' : 'default',
                          }}
                        >
                          {SLOT_LABEL[slot]} {onEquip ? (openSlot === slot ? '▴' : '▾') : ''}
                        </button>
                        <span style={{ flex: 1, fontSize: 13, textAlign: 'left', color: wornDef ? T.text : T.dim }}>
                          {wornDef
                            ? `${wornDef.name}${worn!.enhance > 0 ? ` +${worn!.enhance}` : ''}`
                            : '비어 있음'}
                        </span>
                        {wornDef && onUnequip && (
                          <button
                            onClick={() => onUnequip(slot)}
                            style={{
                              minHeight: TOUCH_MIN, minWidth: TOUCH_MIN,
                              background: 'transparent', border: `1px solid ${T.panelHi}`,
                              color: T.dim, fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
                            }}
                          >
                            해제
                          </button>
                        )}
                      </div>
                      {wornDef && (
                        <div style={{ fontSize: 11, color: T.gold, textAlign: 'left', marginTop: 4 }}>
                          {gearTag(wornDef)} · {bonusText(worn!)}
                        </div>
                      )}

                      {/* 후보 목록 — 슬롯 이름을 누르면 펼친다 */}
                      {onEquip && openSlot === slot && (
                        <div style={{ marginTop: 8, borderTop: `1px solid ${T.panelHi}`, paddingTop: 6 }}>
                          {candidatesFor(slot).length === 0 && (
                            <div style={{ fontSize: 11, color: T.dim, padding: '6px 0' }}>낄 수 있는 장비가 없습니다</div>
                          )}
                          {candidatesFor(slot).map(({ g, delta }) => {
                            const d = GEAR_DEFS[g.defId];
                            const holder = holderOf(g);
                            const recommended = autoPicks.some((x) => x.instId === g.instId);
                            const loss = holder
                              ? gearDelta(holder, gameData.heroes[holder.defId], gameData.starScaling, index, slot, null).power
                              : 0;
                            return (
                              <div key={g.instId} style={{ padding: '6px 0', borderBottom: `1px solid ${T.panelHi}55` }}>
                                <div style={{ fontSize: 12, textAlign: 'left' }}>
                                  {recommended && <span style={{ color: T.gold, fontSize: 10, marginRight: 4 }}>추천</span>}
                                  {d.name}{g.enhance > 0 ? ` +${g.enhance}` : ''}
                                  <span style={{ color: T.dim, fontSize: 10 }}> · {gearTag(d)}</span>
                                </div>
                                <DeltaLine delta={delta} />
                                {holder && (
                                  <div style={{ fontSize: 10, color: T.amber, textAlign: 'left' }}>
                                    {displayName(holder, gameData.heroes)} 착용 중 · 가져오면 그 영웅 전투력 {loss}
                                  </div>
                                )}
                                <div style={{ textAlign: 'right', marginTop: 4 }}>
                                  {holder ? (
                                    onTake && <Button small tone="warning" onClick={() => onTake(g.instId)}>가져오기</Button>
                                  ) : (
                                    <Button small onClick={() => { onEquip(g.instId); setOpenSlot(null); }}>착용</Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/*
            발굴 — 진행도를 함께 보여준다.
            추정 문구만 띄우면 "왜 흐릿한지"와 "어떻게 좁히는지"를 알 수 없다.
            전투에 내보내야만 오른다는 규칙이 화면에서 읽혀야 한다.
          */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.panelHi}` }}>
            <div style={{ fontSize: 13, color: reveal.stage === 'unknown' ? T.dim : T.text }}>
              {reveal.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: T.dim, letterSpacing: '.1em' }}>발굴</span>
              <div style={{ width: 128, height: 3, background: T.panelHi, position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute', inset: 0,
                    width: `${Math.round(reveal.progress * 100)}%`,
                    background: reveal.stage === 'confident' ? T.gold : T.dim,
                    transition: 'width 400ms',
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: T.dim, minWidth: 30, textAlign: 'left' }}>
                {Math.round(reveal.progress * 100)}%
              </span>
            </div>
            {reveal.progress < 1 && (
              <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>
                전투에 내보낼수록 잠재력이 드러납니다.
              </div>
            )}
          </div>

          {capped && (
            <div style={{ fontSize: 12, color: T.gold, marginTop: 16 }}>
              {/*
                승급은 레벨을 1로 되돌려 **직후에 약해진다**(의도된 대가).
                그래서 승급을 권하는 이 자리에서 얻는 쪽도 같이 보여준다 —
                손실만 통지하면 플레이어가 받는 것이 손실뿐이다.
                ★6은 옮겨갈 곳이 없으므로 반드시 갈라야 한다(안 가르면 undefined가 샌다).
              */}
              {nextQuarters
                ? `모든 능력치가 상한에 도달했습니다. 승급하면 ${nextQuarters}(으)로 옮겨갑니다.`
                : '모든 능력치가 상한에 도달했습니다. 승급이 필요합니다.'}
            </div>
          )}
        </SystemPanel>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap',
        }}>
          {/* 죽은 영웅은 표식이 고정된다 — 스토어도 같은 판정을 한다(이중 방어). */}
          {onToggleFavorite && !hero.isDead && (
            <Button onClick={onToggleFavorite} tone={hero.favorite ? 'rare' : 'normal'}>
              {hero.favorite ? '❖ 표식 해제' : '❖ 표식'}
            </Button>
          )}
          <Button onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  );
}

const DELTA_LABEL: Record<string, string> = { hp: 'HP', atk: '공격', def: '방어', spd: '속도', crit: '치명' };

/** 착용하면 바뀌는 수치 — 오름 금색, 내림 주황. 전투력을 마지막에 */
function DeltaLine({ delta }: { delta: GearDelta }) {
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const parts = Object.entries(delta.stats).map(([k, v]) => ({
    k,
    v: v ?? 0,
    text: `${DELTA_LABEL[k]} ${k === 'crit' ? `${sign(Math.round((v ?? 0) * 100))}%` : sign(v ?? 0)}`,
  }));
  return (
    <div style={{ fontSize: 11, textAlign: 'left', lineHeight: 1.7 }}>
      {parts.map((p, i) => (
        <span key={p.k} style={{ color: p.v > 0 ? T.gold : T.amber }}>
          {i > 0 ? ' · ' : ''}{p.text}
        </span>
      ))}
      <span style={{ color: delta.power > 0 ? T.gold : delta.power < 0 ? T.amber : T.dim }}>
        {parts.length ? ' · ' : ''}전투력 {sign(delta.power)}
      </span>
    </div>
  );
}
