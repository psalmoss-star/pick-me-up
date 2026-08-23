import { useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { tabSafePadding } from '../ui/TabBar';
import { Button, TOUCH_MIN } from '../ui/Button';
import { HeroCard } from '../ui/HeroCard';
import { heroArtOf } from '../ui/artMap';
import { heroVariantOf } from '../ui/art/heroImages';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { klassFor } from '../game/stats';
import { displayName } from '../game/identity';
import { estimatePotential } from '../game/reveal';
import { livingHeroes, isPreciousSacrifice } from '../game/roster';
import { gameData } from '../game/data';
import { canPromote, sacrificeValue, fuseEfficiency, expToNext } from '../game/progression';
import type { FuseCheck, FuseResult, PromoteCheck, PromoteResult } from '../game/progression';
import type { HeroInstId, HeroInstance, Wallet } from '../game/types';

type Mode = 'fuse' | 'promote';

export interface ForgeScreenProps {
  roster: HeroInstance[];
  party: HeroInstId[];
  wallet: Wallet;
  /**
   * 합성소 레벨 — 예상 경험치를 실제 획득량과 맞추는 데 쓴다.
   *
   * ⚠️ 예전에는 이 프롭이 없어 예상치가 `fuseEfficiency(1)`로 하드코딩돼 있었다.
   * Lv.3에서 65%로 보여주고 실제로는 95%를 줘서 **표시와 결과가 갈렸고**,
   * 시설 강화가 눈에 띄는 유일한 자리에서 효과가 없어 보였다(실기기에서 발견).
   */
  forgeLevel: number;
  onFuse: (targetId: HeroInstId, sacrificeId: HeroInstId) => FuseResult | FuseCheck;
  onPromote: (id: HeroInstId) => PromoteResult | PromoteCheck;
  /** 합성소 시설 강화 카드로. 마을이 Lv.N을 약속하므로 여기서 닿아야 한다 */
  onOpenFacility?: () => void;
}

/**
 * 합성 / 승급.
 *
 * "제물"이라는 단어를 순화하지 않는다 — 영웅을 태워 다른 영웅을 키우는 일이고,
 * 그 사실을 화면이 숨기면 퍼머데스의 무게가 사라진다 (CLAUDE.md).
 */
export function ForgeScreen({
  roster, party, wallet, forgeLevel, onFuse, onPromote, onOpenFacility,
}: ForgeScreenProps) {
  const [mode, setMode] = useState<Mode>('fuse');
  const [targetId, setTargetId] = useState<HeroInstId | null>(null);
  const [sacrificeId, setSacrificeId] = useState<HeroInstId | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const alive = livingHeroes(roster);
  const target = alive.find((h) => h.instId === targetId) ?? null;
  const sacrifice = alive.find((h) => h.instId === sacrificeId) ?? null;

  const reset = () => {
    setTargetId(null);
    setSacrificeId(null);
    setConfirming(false);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setNotice(null);
    reset();
  };

  /** 되돌릴 수 없는 소멸이므로 한 단계 더 묻는 대상. 판정은 game/roster.ts가 정본. */
  const isPrecious = (h: HeroInstance) => isPreciousSacrifice(h, party);

  const doFuse = () => {
    if (!target || !sacrifice) return;
    if (isPrecious(sacrifice) && !confirming) {
      setConfirming(true);
      return;
    }
    const r = onFuse(target.instId, sacrifice.instId);
    if (!r.ok) {
      setNotice(fuseError(r));
      setConfirming(false);
      return;
    }
    const gained = 'levelsGained' in r ? r.levelsGained : 0;
    const exp = 'expGained' in r ? r.expGained : 0;
    const name = displayName(sacrifice, gameData.heroes);
    const tName = displayName(target, gameData.heroes);
    /*
      레벨이 안 오르는 경우가 흔하다 — ★2 Lv.15 제물(936)은 ★3 Lv.20의
      다음 레벨(1520)에 못 미친다. 그때 "흡수했습니다"만 띄우면 아무 일도
      안 일어난 것처럼 보이므로 획득량을 반드시 숫자로 보여준다.
    */
    setNotice(
      `${name}을(를) 제물로 바쳤습니다. ${tName} 경험치 +${exp}` +
      (gained > 0 ? ` · Lv.${target.level} → Lv.${target.level + gained}` : ' (레벨 변화 없음)'),
    );
    reset();
  };

  const doPromote = () => {
    if (!target) return;
    const r = onPromote(target.instId);
    if (!('toStar' in r)) {
      setNotice(promoteError(r));
      return;
    }
    setNotice(
      `${displayName(target, gameData.heroes)} ★${r.fromStar} → ★${r.toStar}. ` +
      '레벨이 1로 돌아갔습니다 — 지금은 이전보다 약합니다.',
    );
    reset();
  };

  return (
    <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 16 }}>
        <span>제단</span>
        <span>승급석 {wallet.promotionStones.toLocaleString()} · 각성석 {wallet.awakeningStones.toLocaleString()}</span>
      </div>

      {/* 모드 전환 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['fuse', 'promote'] as const).map((m) => (
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
            {m === 'fuse' ? '합성' : '승급'}
          </button>
        ))}
      </div>

      {notice && (
        <div style={{ marginBottom: 14 }}>
          <SystemPanel compact>
            <div style={{ fontSize: 12, lineHeight: 1.9 }}>{notice}</div>
          </SystemPanel>
        </div>
      )}

      {/* 선택된 대상 */}
      <SectionLabel>{mode === 'fuse' ? '강화할 영웅' : '승급할 영웅'}</SectionLabel>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 8 }}>
        <Slot hero={target} label="대상" onClear={() => setTargetId(null)} />
        {mode === 'fuse' && (
          <>
            <div style={{ alignSelf: 'center', color: T.blood, fontSize: 20 }}>✖</div>
            <Slot hero={sacrifice} label="제물" tone="death" onClear={() => setSacrificeId(null)} />
          </>
        )}
      </div>

      {/* 예상 결과 */}
      {mode === 'fuse' && target && sacrifice && (() => {
        const gain = Math.round(sacrificeValue(sacrifice, gameData.starScaling) * fuseEfficiency(forgeLevel));
        const need = expToNext(target.star, target.level) - target.exp;
        const enough = gain >= need;
        return (
          <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, marginBottom: 14 }}>
            획득 경험치 약 {gain} · 다음 레벨까지 {need}
            <br />
            {/* 레벨이 오를지 미리 알려준다 — 바친 뒤에 알면 늦다 */}
            <span style={{ color: enough ? T.gold : T.dim }}>
              {enough ? '레벨이 오릅니다' : '이번 합성으로는 레벨이 오르지 않습니다'}
            </span>
            <br />
            <span style={{ color: T.blood }}>제물은 영구히 사라집니다.</span>
          </div>
        );
      })()}
      {mode === 'promote' && target && (
        <PromoteInfo hero={target} wallet={wallet} />
      )}

      {/* 실행 */}
      <div style={{ margin: '4px 0 20px' }}>
        {confirming ? (
          <SystemPanel tone="death" compact>
            <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 12 }}>
              {/*
                직접 찍은 표식은 자동 기준(고등급·발굴·파티원)보다 강한 근거다.
                그걸 안 알려주면 왜 한 번 더 묻는지 모른 채 확인을 누르게 된다.
              */}
              {sacrifice?.favorite && (
                <>
                  <span style={{ color: T.gold }}>❖ 표식을 남긴 영웅입니다.</span>
                  <br />
                </>
              )}
              {sacrifice && displayName(sacrifice, gameData.heroes)}은(는) 되돌릴 수 없습니다.
              <br />
              정말 제물로 바치겠습니까?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Button small onClick={() => setConfirming(false)}>취소</Button>
              <Button small tone="death" onClick={doFuse}>바친다</Button>
            </div>
          </SystemPanel>
        ) : (
          <Button
            tone={mode === 'fuse' ? 'death' : 'rare'}
            disabled={mode === 'fuse' ? !target || !sacrifice : !target}
            onClick={mode === 'fuse' ? doFuse : doPromote}
          >
            {mode === 'fuse' ? '제물 바치기' : '승급'}
          </Button>
        )}
      </div>

      {/* 로스터에서 고르기 */}
      <SectionLabel>
        {mode === 'fuse' && targetId ? '제물 고르기' : '영웅 고르기'}
      </SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, justifyItems: 'center', marginBottom: 20 }}>
        {alive.map((h) => {
          const def = gameData.heroes[h.defId];
          const isTarget = h.instId === targetId;
          const isSac = h.instId === sacrificeId;
          return (
            <div key={h.instId} style={{ position: 'relative' }}>
              <HeroCard
                name={displayName(h, gameData.heroes)}
                star={h.star}
                element={def.element}
                art={heroArtOf(h.defId)}
                defId={h.defId}
                level={h.level}
                klass={klassFor(h.star)}
                width={92}
                selected={isTarget || isSac}
                favorite={h.favorite}
                reveal={estimatePotential(h).progress}
                variant={heroVariantOf(h)}
                onClick={() => {
                  setNotice(null);
                  setConfirming(false);
                  // 대상이 비었으면 대상으로, 아니면 제물로 (합성일 때만)
                  if (!targetId || isTarget) {
                    setTargetId(isTarget ? null : h.instId);
                    if (isTarget) setSacrificeId(null);
                  } else if (mode === 'fuse') {
                    setSacrificeId(isSac ? null : h.instId);
                  } else {
                    setTargetId(h.instId);
                  }
                }}
              />
              {isSac && (
                <div style={{ position: 'absolute', top: 4, left: 0, right: 0, fontSize: 10, color: T.blood, letterSpacing: '.2em' }}>
                  제물
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/*
        돌아갈 길은 App.tsx의 상시 탭 바('대기실')가 맡는다.
        다만 **합성소 시설 강화**는 탭 바로 갈 수 없다 — 마을 부감도에는 이 건물에
        Lv.N이 붙어 있는데 여기서는 그 레벨을 올릴 방법이 없었다(실기기에서 발견).
      */}
      {onOpenFacility && (
        <div style={{ marginTop: 4, textAlign: 'center', minHeight: TOUCH_MIN }}>
          <Button onClick={onOpenFacility}>시설 강화</Button>
        </div>
      )}
    </div>
  );
}

function Slot({
  hero, label, tone, onClear,
}: { hero: HeroInstance | null; label: string; tone?: 'death'; onClear: () => void }) {
  const c = tone === 'death' ? T.blood : T.frame;
  if (!hero) {
    return (
      <div style={{ width: 100, height: 158, border: `1px dashed ${T.panelHi}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: T.dim }}>
        {label}
      </div>
    );
  }
  const def = gameData.heroes[hero.defId];
  return (
    <div style={{ textAlign: 'center' }}>
      <HeroCard
        name={displayName(hero, gameData.heroes)}
        star={hero.star}
        element={def.element}
        art={heroArtOf(hero.defId)}
        defId={hero.defId}
        level={hero.level}
        klass={klassFor(hero.star)}
        width={100}
        favorite={hero.favorite}
        reveal={estimatePotential(hero).progress}
        variant={heroVariantOf(hero)}
        onClick={onClear}
      />
      <div style={{ fontSize: 10, color: c, letterSpacing: '.2em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function PromoteInfo({ hero, wallet }: { hero: HeroInstance; wallet: Wallet }) {
  const check = canPromote(hero, wallet, gameData.starScaling);
  const rule = gameData.starScaling[hero.star];
  return (
    <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, marginBottom: 14 }}>
      {check.ok ? (
        <>
          ★{hero.star} → ★{hero.star + 1}
          <br />
          <span style={{ color: T.gold }}>
            레벨이 1로 리셋됩니다 — 승급 직후에는 이전보다 약해집니다.
          </span>
        </>
      ) : (
        <span style={{ color: T.amber }}>{promoteError(check)}</span>
      )}
      {!check.ok && check.reason === 'level' && (
        <>
          <br />
          현재 Lv.{hero.level} / 필요 Lv.{rule.maxLevel}
        </>
      )}
    </div>
  );
}

function fuseError(r: FuseCheck | FuseResult): string {
  if (r.ok) return '';
  switch (r.reason) {
    case 'same-hero': return '같은 영웅은 제물이 될 수 없습니다.';
    case 'target-dead': return '사망한 영웅은 강화할 수 없습니다.';
    case 'sacrifice-dead': return '사망한 영웅은 제물이 될 수 없습니다.';
    case 'target-max-level': return '이미 만렙입니다. 승급이 필요합니다.';
    default: return '합성할 수 없습니다.';
  }
}

function promoteError(r: PromoteCheck | PromoteResult): string {
  if ('toStar' in r || r.ok) return '';
  switch (r.reason) {
    case 'max-star': return '더 이상 승급할 수 없습니다.';
    case 'level': return '만렙에 도달해야 승급할 수 있습니다.';
    case 'materials': return `재료가 부족합니다. (승급석 ${r.missing.promotionStones ?? 0} · 각성석 ${r.missing.awakeningStones ?? 0})`;
    default: return '승급할 수 없습니다.';
  }
}
