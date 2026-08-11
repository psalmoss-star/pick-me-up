import { useEffect, useRef, useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { Button, TOUCH_MIN } from '../ui/Button';
import { HeroCard } from '../ui/HeroCard';
import { heroArtOf } from '../ui/artMap';
import { STAR_TIERS, T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { klassFor } from '../game/stats';
import { displayName, displayTitle } from '../game/identity';
import { gameData } from '../game/data';
import { BANNERS, FREE_COOLDOWN_MS } from '../game/gacha';
import type { PullResult, PullSuccess } from '../game/gacha';
import type { BannerKind, GachaState, Wallet } from '../game/types';

/**
 * 소환 연출 단계.
 * 각 단계의 길이는 HANDOFF STEP 4에 정해진 값이다.
 */
type Phase = 'idle' | 'sigil' | 'pillar' | 'flash' | 'reveal';

const DURATION: Record<Exclude<Phase, 'idle' | 'reveal'>, number> = {
  sigil: 600,
  pillar: 800,
  flash: 150,
};

/** 이 등급부터 연출이 화려해진다 (tokens.ts의 ★4~6 = 발광·장식과 같은 분기) */
const RARE_FROM = 4;

export interface SummonScreenProps {
  wallet: Wallet;
  gacha: GachaState;
  /** 이미 첫 ★5를 본 적이 있는지 — 처음이면 스킵을 막는다 */
  seenFirstLegendary: boolean;
  onSummon: (kind: BannerKind) => PullResult;
  onLegendarySeen: () => void;
  onBack: () => void;
}

export function SummonScreen({
  wallet, gacha, seenFirstLegendary, onSummon, onLegendarySeen, onBack,
}: SummonScreenProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [pulled, setPulled] = useState<PullSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  // 금 소환에는 쿨다운이 없다(FREE_COOLDOWN_MS = 0) — 남은 시간을 셀 초시계도 필요 없다.
  // 쿨다운을 되살리면 여기에 setInterval을 다시 넣을 것.

  // 언마운트 시 예약된 타이머를 반드시 정리한다 (화면을 나가도 setState가 돌면 경고).
  useEffect(() => () => { timers.current.forEach(window.clearTimeout); }, []);

  const goldCost = BANNERS.free.cost.gold ?? 0;
  const canGold = wallet.gold >= goldCost;
  const premiumCost = BANNERS.premium.cost.gems ?? 0;
  const canPremium = wallet.gems >= premiumCost;

  /**
   * 첫 ★5는 스킵할 수 없다.
   * 이 게임에서 ★5는 드물게 오는 사건이라, 처음 한 번은 끝까지 보게 한다.
   */
  const isUnskippable = !!pulled && pulled.star >= 5 && !seenFirstLegendary;

  const run = (kind: BannerKind) => {
    if (phase !== 'idle') return;
    const r = onSummon(kind);

    if (!r.ok) {
      setError(
        r.reason === 'cooldown' ? '아직 소환의 기운이 모이지 않았습니다.'
          // 배너마다 쓰는 재화가 다르다 — 부족한 쪽을 그대로 말한다
          : r.reason === 'insufficient'
            ? (r.missing.gold
              ? `금이 ${r.missing.gold} 부족합니다.`
              : `젬이 ${r.missing.gems ?? 0} 부족합니다.`)
            : '소환할 수 있는 영웅이 없습니다.',
      );
      return;
    }

    setError(null);
    setPulled(r);
    setPhase('sigil');

    // 연출 체인. 등급이 낮으면 플래시를 건너뛴다.
    const rare = r.star >= RARE_FROM;
    const t: number[] = [];
    t.push(window.setTimeout(() => setPhase('pillar'), DURATION.sigil));
    if (rare) {
      t.push(window.setTimeout(() => setPhase('flash'), DURATION.sigil + DURATION.pillar));
      t.push(window.setTimeout(
        () => setPhase('reveal'),
        DURATION.sigil + DURATION.pillar + DURATION.flash,
      ));
    } else {
      t.push(window.setTimeout(() => setPhase('reveal'), DURATION.sigil + DURATION.pillar));
    }
    timers.current = t;
  };

  /** 연출 건너뛰기 — 첫 ★5만 예외 */
  const skip = () => {
    if (isUnskippable) return;
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setPhase('reveal');
  };

  const close = () => {
    if (pulled && pulled.star >= 5) onLegendarySeen();
    setPulled(null);
    setPhase('idle');
  };

  const playing = phase === 'sigil' || phase === 'pillar' || phase === 'flash';

  return (
    <div style={{ padding: '14px 12px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 18 }}>
        <span>소환</span>
        <span>젬 {wallet.gems} · 금 {wallet.gold}</span>
      </div>

      {/* 연출 무대. 비어 있어도 자리를 지켜 화면이 튀지 않게 한다 */}
      <div
        onClick={playing ? skip : undefined}
        style={{
          position: 'relative',
          height: 250,
          border: `1px solid ${T.panelHi}`,
          background: 'radial-gradient(60% 70% at 50% 60%,#171326 0%,#07060C 75%)',
          overflow: 'hidden',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: playing && !isUnskippable ? 'pointer' : 'default',
        }}
      >
        {phase === 'idle' && (
          <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.2em', lineHeight: 2 }}>
            소환진이 잠들어 있습니다
            <br />
            <span style={{ fontSize: 11 }}>영웅은 죽으면 돌아오지 않습니다</span>
          </div>
        )}

        {(phase === 'sigil' || phase === 'pillar') && (
          <Sigil star={pulled?.star ?? 1} phase={phase} />
        )}

        {phase === 'flash' && (
          <div style={{ position: 'absolute', inset: 0, background: '#FFF8E0', animation: `rareFlash ${DURATION.flash}ms ease-out forwards` }} />
        )}

        {phase === 'reveal' && pulled && (
          <div style={{ animation: 'cardFlip 500ms cubic-bezier(.2,.8,.3,1) both' }}>
            <HeroCard
              name={displayName(pulled.hero, gameData.heroes)}
              star={pulled.star}
              element={gameData.heroes[pulled.hero.defId].element}
              art={heroArtOf(pulled.hero.defId)}
              defId={pulled.hero.defId}
              level={pulled.hero.level}
              klass={klassFor(pulled.star)}
              width={132}
            />
          </div>
        )}

        {playing && (
          <div style={{ position: 'absolute', bottom: 8, width: '100%', fontSize: 10, color: T.dim, letterSpacing: '.2em' }}>
            {isUnskippable ? '' : '화면을 누르면 건너뜁니다'}
          </div>
        )}
      </div>

      {/* 결과 문구 — 연출이 끝난 뒤에만 */}
      {phase === 'reveal' && pulled && (
        <div style={{ marginBottom: 14 }}>
          <SystemPanel tone={pulled.star >= RARE_FROM ? 'rare' : 'normal'} compact>
            <div style={{ fontSize: 16, marginBottom: 6 }}>
              {displayName(pulled.hero, gameData.heroes)}
              <span style={{ color: STAR_TIERS[pulled.star]?.ring, marginLeft: 8 }}>
                {'★'.repeat(pulled.star)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9 }}>
              {displayTitle(pulled.hero, gameData.heroes)}
              <br />
              {pulled.wasPity && <span style={{ color: T.gold }}>천장 확정 · </span>}
              {pulled.isNewInCodex ? '도감에 새로 기록되었습니다' : '이미 도감에 있는 영웅입니다'}
            </div>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 10 }}>
              잠재력은 아직 알 수 없습니다 — 전투에 내보내야 드러납니다.
            </div>
          </SystemPanel>
          <div style={{ marginTop: 14 }}>
            <Button tone={pulled.star >= RARE_FROM ? 'rare' : 'normal'} onClick={close}>확인</Button>
          </div>
        </div>
      )}

      {error && phase === 'idle' && (
        <div style={{ fontSize: 12, color: T.amber, marginBottom: 12 }}>{error}</div>
      )}

      {phase === 'idle' && (
        <>
          <SectionLabel>소환진</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            <BannerRow
              title="희미한 소환진"
              desc="★1~3 · 금이 있는 한 계속"
              cost={`금 ${goldCost}`}
              disabled={!canGold}
              onClick={() => run('free')}
            />
            <BannerRow
              title="심연의 소환진"
              desc={`★4 이상 확정 · ${BANNERS.premium.pity!.count}회 천장 (현재 ${gacha.pityCounters.premium})`}
              cost={`젬 ${premiumCost}`}
              disabled={!canPremium}
              onClick={() => run('premium')}
            />
          </div>
          <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.9, marginBottom: 20 }}>
            누적 소환 {gacha.totalPulls}회
          </div>
          <Button onClick={onBack}>대기실로</Button>
        </>
      )}
    </div>
  );
}

/** 마법진 — 회전하며 떠오르고, 빛 기둥 단계에서 기둥이 선다 */
function Sigil({ star, phase }: { star: number; phase: 'sigil' | 'pillar' }) {
  // 연출 중 등급을 그대로 드러내면 김이 새므로 색만 은근히 쓴다
  const c = star >= RARE_FROM ? T.gold : T.dim;
  return (
    <div style={{ position: 'relative', width: 170, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {phase === 'pillar' && (
        <div
          style={{
            position: 'absolute', bottom: '50%', width: 54, height: 210,
            background: `linear-gradient(180deg,transparent,${c}66 40%,${c}CC)`,
            transformOrigin: 'bottom',
            animation: `pillar ${DURATION.pillar}ms ease-out both`,
            filter: 'blur(1px)',
          }}
        />
      )}
      <svg
        viewBox="0 0 100 100"
        style={{
          width: 170, height: 170,
          animation: `spin 6s linear infinite, sigilRise ${DURATION.sigil}ms ease-out both`,
        }}
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r="46" fill="none" stroke={c} strokeWidth="0.8" opacity=".8" />
        <circle cx="50" cy="50" r="34" fill="none" stroke={c} strokeWidth="0.5" opacity=".5" />
        <circle cx="50" cy="50" r="22" fill="none" stroke={c} strokeWidth="0.8" opacity=".7" />
        {/* 육망성 — 두 삼각형 */}
        <path d="M50 12 L83 68 L17 68 Z" fill="none" stroke={c} strokeWidth="0.7" opacity=".75" />
        <path d="M50 88 L17 32 L83 32 Z" fill="none" stroke={c} strokeWidth="0.7" opacity=".75" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <circle
              key={i}
              cx={50 + Math.cos(a) * 46}
              cy={50 + Math.sin(a) * 46}
              r="1.6"
              fill={c}
              opacity=".9"
            />
          );
        })}
      </svg>
    </div>
  );
}

function BannerRow({
  title, desc, cost, disabled, onClick,
}: { title: string; desc: string; cost: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: TOUCH_MIN,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '12px 14px',
        background: 'transparent',
        border: `1px solid ${disabled ? T.panelHi : T.frame}`,
        color: 'inherit',
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        textAlign: 'left',
      }}
    >
      <span>
        <span style={{ fontSize: 14, display: 'block' }}>{title}</span>
        <span style={{ fontSize: 11, color: T.dim }}>{desc}</span>
      </span>
      <span style={{ fontSize: 12, color: disabled ? T.dim : T.gold, whiteSpace: 'nowrap' }}>
        {cost}
      </span>
    </button>
  );
}

export { FREE_COOLDOWN_MS };
