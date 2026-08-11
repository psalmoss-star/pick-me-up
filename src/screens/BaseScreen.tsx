import { HeroCard } from '../ui/HeroCard';
import { Button, TOUCH_MIN } from '../ui/Button';
import { BaseMap, type BaseMapSpot } from '../ui/BaseMap';
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
import type { FacilityKind } from '../game/data/facilities';
import type { FloorSpec } from '../game/data/floors';
import type { HeroInstId, HeroInstance } from '../game/types';

export const PARTY_LIMIT = 3;

export interface BaseScreenProps {
  floor: FloorSpec;
  floorIndex: number;
  roster: HeroInstance[];
  party: HeroInstId[];
  facilities: Record<FacilityKind, number>;
  onEnter: () => void;
  onInspect: (hero: HeroInstance) => void;
  /** 마을에서 장소를 골랐다. 시설·소환소·상점·무덤이 전부 여기로 온다 */
  onGoTo: (spot: BaseMapSpot) => void;
  /** 영웅 전체 화면으로 */
  onOpenRoster: () => void;
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

/**
 * 대기실 — 마을 부감도가 주 화면이다.
 *
 * ── 왜 목록형 버튼이 아니라 마을인가 ───────────────────
 * 방치형 게임의 표준 동선이다. 시설이 **장소**로 읽히면 "거점에 산다"는
 * 감각이 생기고, 버튼 6개가 지도 위 건물로 흡수되어 화면이 짧아진다.
 *
 * ── 로스터를 뺀 이유 ──────────────────────────────────
 * 카드 5장이 1185px을 먹어 주 동선(`탑 입장`)을 화면 밖으로 밀어냈다(실측 y=1378).
 * 여기에는 **편성된 파티만** 가로로 보여주고, 전체는 RosterScreen으로 보낸다.
 * 그래서 로스터가 20명이 돼도 이 화면 높이는 변하지 않는다.
 */
export function BaseScreen({
  floor, floorIndex, roster, party, facilities,
  onEnter, onInspect, onGoTo, onOpenRoster,
  towerCleared = false, deathCount,
}: BaseScreenProps) {
  const alive = roster.filter((h) => !h.isDead);
  const { width } = useViewport();
  /*
    파티 카드는 3장을 한 줄에 넣는다. 2열 그리드(150px)보다 작아지지만
    타로카드 비율과 등급 구조는 그대로 유지된다 — 축소이지 썸네일화가 아니다.
  */
  const partyCardWidth = Math.max(84, Math.min(104, Math.floor((Math.min(width, 480) - 56) / 3)));

  // 편성 순서를 그대로 보여준다. roster 순서로 정렬하면 편성한 순서가 사라진다.
  const partyHeroes = party
    .map((id) => roster.find((h) => h.instId === id))
    .filter((h): h is HeroInstance => !!h);

  return (
    /*
      하단 여백은 sticky 액션 바 높이(약 78px)만큼 둔다.
      0으로 두면 마지막 콘텐츠가 바 뒤에 깔려 영구히 가려진다 —
      그라디언트 배경은 반투명이라 겹친 글자가 비쳐 보인다(실제로 '탑 전경 보기'가 겹쳤다).
    */
    <div style={{ padding: '14px 12px 78px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 14 }}>
        <span>대기실</span>
        <span>생존 영웅 {alive.length} / {roster.length}</span>
      </div>

      {/*
        마을 — 이 화면의 주인공. 시설·소환소·상점·무덤이 전부 여기서 열린다.
        선택 상태를 넘기지 않는다(selected 생략): 여기서는 고르는 게 아니라 이동한다.
      */}
      <BaseMap
        facilities={facilities}
        deathCount={deathCount ?? 0}
        onSelect={onGoTo}
      />
      <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.08em', margin: '8px 0 18px' }}>
        건물을 눌러 이동합니다
      </div>

      {/* 다음 층 — 주 정보라 항상 펼쳐둔다 */}
      <SectionLabel>{towerCleared ? '등반 종료' : '다음 층'}</SectionLabel>
      <div style={{ position: 'relative', height: 112, border: `1px solid ${T.panelHi}`, overflow: 'hidden', marginBottom: 10 }}>
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
      <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, marginBottom: 18 }}>
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
      <details style={{ marginBottom: 18 }}>
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

      {/*
        편성된 파티만. 전체 로스터는 '영웅 전체'로 나간다 —
        여기에 다 그리면 이 화면이 다시 1442px이 된다.
      */}
      <SectionLabel>파티 ({party.length}/{PARTY_LIMIT})</SectionLabel>
      {partyHeroes.length === 0 ? (
        <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, padding: '10px 0 4px' }}>
          편성된 영웅이 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 4 }}>
          {partyHeroes.map((h) => {
            const def = gameData.heroes[h.defId];
            return (
              <HeroCard
                key={h.instId}
                name={displayName(h, gameData.heroes)}
                star={h.star}
                element={def.element}
                art={heroArtOf(h.defId)}
                defId={h.defId}
                level={h.level}
                klass={klassFor(h.star)}
                width={partyCardWidth}
                selected
                reveal={estimatePotential(h).progress}
                onClick={() => onInspect(h)}
              />
            );
          })}
        </div>
      )}

      <button
        onClick={onOpenRoster}
        style={{
          marginTop: 6,
          minHeight: TOUCH_MIN,
          padding: '10px 16px',
          background: 'transparent',
          border: 'none',
          color: T.dim,
          fontSize: 12,
          fontFamily: 'inherit',
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        영웅 전체 ({roster.length}) ▸
      </button>

      {/*
        하단은 주 동선 하나만. 나머지는 전부 마을이 대신한다.

        ⚠️ sticky는 index.css의 `overflow-x: clip`에 의존한다.
        `hidden`으로 되돌리면 body가 스크롤 컨테이너가 되어 이게 조용히 죽는다.
      */}
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
        <Button
          tone="rare"
          onClick={onEnter}
          disabled={party.length === 0 || towerCleared}
        >
          {towerCleared ? '등반 완료' : '탑 입장'}
        </Button>
      </div>
    </div>
  );
}
