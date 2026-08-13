import { HeroCard } from '../ui/HeroCard';
import { Button, TOUCH_MIN } from '../ui/Button';
import { useViewport } from '../ui/useViewport';
import { heroArtOf } from '../ui/artMap';
import { heroVariantOf } from '../ui/art/heroImages';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { klassFor } from '../game/stats';
import { displayName } from '../game/identity';
import { estimatePotential } from '../game/reveal';
import { gameData } from '../game/data';
import type { HeroInstId, HeroInstance } from '../game/types';

export interface RosterScreenProps {
  roster: HeroInstance[];
  party: HeroInstId[];
  partyLimit: number;
  onToggleParty: (id: HeroInstId) => void;
  onInspect: (hero: HeroInstance) => void;
  onBack: () => void;
}

/**
 * 영웅 전체 — 로스터 편성 전용 화면.
 *
 * ── 왜 대기실에서 떼어냈나 ─────────────────────────────
 * 카드가 237px이고 2열이라 로스터 5명이면 1185px, 10명이면 2400px대다.
 * 대기실에 두면 마을·다음 층·주 동선이 전부 그 아래로 밀려서
 * **`탑 입장`에 닿는 데 711px을 스크롤해야 했다**(실측).
 * 카드를 줄이는 선택지는 없다 — 타로카드형이고 등급을 구조로 표현해야 한다.
 * 그래서 화면을 나눈다. 여기서는 길어져도 된다. 이 화면의 목적이 그것이므로.
 */
export function RosterScreen({
  roster, party, partyLimit, onToggleParty, onInspect, onBack,
}: RosterScreenProps) {
  const alive = roster.filter((h) => !h.isDead);
  const { width } = useViewport();
  // 대기실과 같은 산식 — 두 화면의 카드 크기가 갈리면 같은 영웅이 달라 보인다.
  const cardWidth = Math.max(112, Math.min(150, Math.floor((Math.min(width, 480) - 42) / 2)));

  return (
    // 하단 여백은 sticky 바 높이만큼 — 없으면 마지막 카드가 바 뒤에 가린다
    <div style={{ padding: '14px 12px 78px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 18 }}>
        <span>영웅</span>
        <span>생존 {alive.length} / {roster.length}</span>
      </div>

      <SectionLabel>파티 편성 ({party.length}/{partyLimit})</SectionLabel>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 18,
          justifyItems: 'center',
          marginBottom: 10,
        }}
      >
        {roster.map((h) => {
          const def = gameData.heroes[h.defId];
          return (
            <div key={h.instId} style={{ textAlign: 'center' }}>
              <HeroCard
                name={displayName(h, gameData.heroes)}
                star={h.star}
                element={def.element}
                art={heroArtOf(h.defId)}
                defId={h.defId}
                level={h.level}
                klass={klassFor(h.star)}
                width={cardWidth}
                dead={h.isDead}
                selected={party.includes(h.instId)}
                reveal={estimatePotential(h).progress}
                variant={heroVariantOf(h)}
                onClick={() => !h.isDead && onToggleParty(h.instId)}
              />
              <button
                onClick={() => onInspect(h)}
                disabled={h.isDead}
                style={{
                  marginTop: 2,
                  minHeight: TOUCH_MIN,
                  minWidth: 64,
                  padding: '10px 16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: T.dim,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  cursor: h.isDead ? 'default' : 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                {h.isDead ? '사망' : '상세'}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: 'center', color: T.dim, fontSize: 11, marginBottom: 12 }}>
        카드를 눌러 편성 · 사망한 영웅은 되살릴 수 없습니다
      </div>

      {/* 로스터가 길어져도 돌아갈 길은 항상 보여야 한다 */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          textAlign: 'center',
          padding: '14px 0 calc(14px + env(safe-area-inset-bottom))',
          background: `linear-gradient(180deg,transparent,${T.void} 45%)`,
          zIndex: 10,
        }}
      >
        <Button onClick={onBack}>대기실로</Button>
      </div>
    </div>
  );
}
