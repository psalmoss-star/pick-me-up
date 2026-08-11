import { HeroCard } from '../ui/HeroCard';
import { Button, TOUCH_MIN } from '../ui/Button';
import { TowerMap } from '../ui/TowerMap';
import { useViewport } from '../ui/useViewport';
import { Scene } from '../ui/art/Scene';
import { heroArtOf } from '../ui/artMap';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { MISSION_LABEL } from '../game/mission';
import { klassFor } from '../game/stats';
import { displayName } from '../game/identity';
import { estimatePotential } from '../game/reveal';
import { gameData } from '../game/data';
import type { FloorSpec } from '../game/data/floors';
import type { HeroInstId, HeroInstance } from '../game/types';

export const PARTY_LIMIT = 3;

export interface BaseScreenProps {
  floor: FloorSpec;
  floorIndex: number;
  roster: HeroInstance[];
  party: HeroInstId[];
  onToggleParty: (id: HeroInstId) => void;
  onEnter: () => void;
  onInspect: (hero: HeroInstance) => void;
  onSummon: () => void;
  onForge: () => void;
  onFacility: () => void;
  onShop: () => void;
  onSmith: () => void;
  /** 최상층을 이미 클리어했는가 — 더 오를 층이 없다 */
  towerCleared?: boolean;
  /**
   * 런 전체 누적 사망자 수.
   *
   * 로스터에서 세면 안 된다 — 합성 제물로 사라진 영웅은 로스터에 없어서 빠지고,
   * 그러면 결과 화면의 엔딩("N명을 두고 왔다")과 숫자가 갈린다.
   * 퍼머데스 게임에서 "몇 명 잃었나"는 런 전체 기준이 정답이므로 스토어 값을 받는다.
   */
  deathCount?: number;
}

/** 대기실 — 탑 미니맵 + 다음 층 + 파티 편성 */
export function BaseScreen({
  floor, floorIndex, roster, party, onToggleParty, onEnter, onInspect, onSummon, onForge,
  onFacility, onShop, onSmith,
  towerCleared = false, deathCount,
}: BaseScreenProps) {
  const alive = roster.filter((h) => !h.isDead);
  const { width } = useViewport();
  // 2열 그리드에 맞춰 카드 폭을 잡는다. 컨테이너 패딩 24 + 그리드 간격 18.
  const cardWidth = Math.max(112, Math.min(150, Math.floor((Math.min(width, 480) - 42) / 2)));

  return (
    <div style={{ padding: '14px 12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 18 }}>
        <span>대기실</span>
        <span>생존 영웅 {alive.length} / {roster.length}</span>
      </div>

      {/* 다음 층 — 주 정보라 항상 펼쳐둔다 */}
      <SectionLabel>{towerCleared ? '등반 종료' : '다음 층'}</SectionLabel>
      <div style={{ position: 'relative', height: 132, border: `1px solid ${T.panelHi}`, overflow: 'hidden', marginBottom: 10 }}>
        <Scene kind={floor.scene} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textShadow: '0 2px 8px #000' }}>
          {towerCleared ? (
            <>
              <div style={{ fontSize: 19, color: T.gold }}>정상</div>
              <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.16em', marginTop: 6 }}>
                {floor.id}층까지 올랐다
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 19 }}>{floor.id}층 · {floor.name}</div>
              <div style={{ fontSize: 12, color: T.gold, letterSpacing: '.16em', marginTop: 6 }}>
                임무 [{MISSION_LABEL[floor.mission.kind]}]
              </div>
            </>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, marginBottom: 20 }}>
        {towerCleared ? (
          // 퍼머데스 게임이므로 끝에 남는 건 '누가 남았는가'다. 그것만 말한다.
          // 숫자는 결과 화면의 엔딩과 같은 출처(deathCount)를 쓴다 — 갈리면 둘 중 하나가 거짓말이 된다.
          <>더 오를 층이 없다 · 잃은 영웅 {deathCount ?? roster.length - alive.length}</>
        ) : (
          <>
            적 {floor.enemyIds.length}기
            {floor.guards?.length ? ` · 보호 대상 ${floor.guards[0].name}` : ''}
            {floor.isBoss ? ' · 보스' : ''}
          </>
        )}
      </div>

      {/* 탑 전경은 참조 정보 — 접어둔다 */}
      <details style={{ marginBottom: 20 }}>
        <summary
          style={{
            cursor: 'pointer', listStyle: 'none', color: T.dim,
            fontSize: 11, letterSpacing: '.3em', padding: '12px 0',
          }}
        >
          탑 전경 보기
        </summary>
        <div style={{ border: `1px solid ${T.panelHi}`, background: '#08070C', padding: '16px 14px', marginTop: 4 }}>
          <TowerMap current={floorIndex} cleared={towerCleared} />
        </div>
      </details>

      <SectionLabel>파티 편성 ({party.length}/{PARTY_LIMIT})</SectionLabel>
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

      {/* 로스터가 길어지면 버튼이 화면 밖으로 밀린다 → 하단에 고정 */}
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
        {/*
          폭 375px에 6개가 한 줄로는 안 들어간다. small(최소 44px)을 유지한 채
          wrap으로 여러 줄이 되게 둔다 — 터치 타깃을 줄여 한 줄에 맞추지 말 것.
        */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button small onClick={onSummon}>소환</Button>
          <Button small onClick={onForge}>제단</Button>
          <Button small onClick={onFacility}>시설</Button>
          <Button small onClick={onShop}>상점</Button>
          <Button small onClick={onSmith}>대장간</Button>
          <Button
            tone="rare"
            onClick={onEnter}
            disabled={party.length === 0 || towerCleared}
          >
            {towerCleared ? '등반 완료' : '탑 입장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
