import { SystemPanel } from '../ui/SystemPanel';
import { Button, TOUCH_MIN } from '../ui/Button';
import { HeroPortrait } from '../ui/art/HeroPortrait';
import { heroArtOf } from '../ui/artMap';
import { ELEMENT_KR, T } from '../ui/tokens';
import { computeAttributes, computeHeroStats, isAtCap, klassFor } from '../game/stats';
import { displayName, displayTitle } from '../game/identity';
import { estimatePotential } from '../game/reveal';
import { applyBonus, heroBonus, bonusOf } from '../game/gear';
import { GEAR_DEFS, GEAR_SLOTS, SLOT_LABEL, RANK_LABEL } from '../game/data/gear';
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
}

/** 장비로 올라간 수치는 금색 — 레벨 덕인지 장비 덕인지 구분되어야 한다 */
function Stat({ v, up }: { v: number; up: boolean }) {
  return <span style={{ color: up ? T.gold : T.dim }}>{v}</span>;
}

/** 영웅 상세 — 능력치의 현재/상한을 그대로 드러낸다. 상한 도달은 금색. */
export function DetailModal({ hero, onClose, gear, onEquip, onUnequip }: DetailModalProps) {
  const def = gameData.heroes[hero.defId];
  const attrs = computeAttributes(def, hero.star, hero.level, gameData.starScaling);
  const baseStats = computeHeroStats(def, hero.star, hero.level, gameData.starScaling);
  const capped = isAtCap(attrs);

  /**
   * 표시 스탯에 장비를 태운다. 안 그러면 상세창 숫자와 실제 전투가 어긋난다.
   * 계산은 battle.ts와 같은 함수를 쓴다 — 여기서 다시 더하면 두 곳으로 갈라진다.
   */
  const index = new Map((gear ?? []).map((g) => [g.instId, g]));
  const bonus = gear ? heroBonus(hero.gear, index) : {};
  const stats = gear ? applyBonus(baseStats, bonus) : baseStats;

  /** 이 슬롯에 낄 수 있는 후보 — 창고에 있거나 이 영웅이 이미 낀 것 */
  const candidatesFor = (slot: GearSlot) =>
    (gear ?? []).filter((g) => {
      const d = GEAR_DEFS[g.defId];
      if (!d || d.slot !== slot) return false;
      return !g.equippedBy || g.equippedBy === hero.instId;
    });

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
            <HeroPortrait defId={hero.defId} art={heroArtOf(hero.defId)} element={def.element} size={92} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>
            {displayName(hero, gameData.heroes)}({'★'.repeat(hero.star)}) <span style={{ fontSize: 15 }}>Lv.{hero.level}</span>
          </div>
          <div style={{ fontSize: 12, color: T.dim, marginBottom: 14 }}>
            {displayTitle(hero, gameData.heroes)} · 클래스 : {klassFor(hero.star)} · 속성 : {ELEMENT_KR[def.element]}
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
              <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.3em', marginBottom: 10 }}>
                장비
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {GEAR_SLOTS.map((slot) => {
                  const wornId = hero.gear?.[slot];
                  const worn = wornId ? index.get(wornId) : undefined;
                  const wornDef = worn ? GEAR_DEFS[worn.defId] : undefined;
                  const others = candidatesFor(slot).filter((g) => g.instId !== wornId);

                  return (
                    <div key={slot} style={{ border: `1px solid ${T.panelHi}`, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: T.dim, letterSpacing: '.1em', minWidth: 44, textAlign: 'left' }}>
                          {SLOT_LABEL[slot]}
                        </span>
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
                          {RANK_LABEL[wornDef.rank]} · {bonusText(worn!)}
                        </div>
                      )}

                      {/* 교체 후보 */}
                      {onEquip && others.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {others.map((g) => {
                            const d = GEAR_DEFS[g.defId];
                            return (
                              <button
                                key={g.instId}
                                onClick={() => onEquip(g.instId)}
                                style={{
                                  minHeight: TOUCH_MIN,
                                  background: 'transparent',
                                  border: `1px solid ${T.frame}55`,
                                  color: T.text, fontFamily: 'inherit', fontSize: 11,
                                  padding: '6px 10px', cursor: 'pointer', textAlign: 'left',
                                }}
                              >
                                {d.name}{g.enhance > 0 ? ` +${g.enhance}` : ''}
                                <span style={{ color: T.dim }}> · {bonusText(g)}</span>
                              </button>
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
              모든 능력치가 상한에 도달했습니다. 승급이 필요합니다.
            </div>
          )}
        </SystemPanel>
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <Button onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  );
}
