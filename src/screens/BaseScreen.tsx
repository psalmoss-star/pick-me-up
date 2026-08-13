import { VillageScene, type VillageSpot } from '../ui/VillageScene';
import { TabBar, type TabKey } from '../ui/TabBar';
import { T } from '../ui/tokens';
import type { FacilityKind } from '../game/data/facilities';
import type { FloorSpec } from '../game/data/floors';
import type { HeroInstId, HeroInstance } from '../game/types';
import { livingHeroes } from '../game/roster';

export const PARTY_LIMIT = 3;

export interface BaseScreenProps {
  floor: FloorSpec;
  roster: HeroInstance[];
  party: HeroInstId[];
  facilities: Record<FacilityKind, number>;
  /** 마을에서 장소를 골랐다 */
  onGoTo: (spot: VillageSpot) => void;
  /** 하단 탭 */
  onTab: (tab: TabKey) => void;
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
 * 대기실 — 마을 사이드뷰가 전부다.
 *
 * ── 왜 이 화면에 목록이 없는가 ────────────────────────
 * 이전 버전은 마을 + 다음 층 + 파티 카드 + 버튼을 한 화면에 쌓아 1442px이 됐고,
 * 주 동선인 '탑 입장'이 화면 밖(y=1378)으로 밀려났다.
 * 지금은 **마을과 탭 바만** 둔다 — 나머지는 전부 별도 화면이다.
 * 그래서 로스터가 몇 명이 되든 이 화면 높이는 변하지 않는다.
 *
 * 층 정보는 상단 알약에, 등반 시작은 마을 안 탑에 붙어 있다.
 */
export function BaseScreen({
  floor, roster, party, facilities,
  onGoTo, onTab,
  towerCleared = false, deathCount,
}: BaseScreenProps) {
  const alive = livingHeroes(roster);

  return (
    // flex:1 — App의 flex column 안에서 남은 높이를 받아 탭 바를 바닥에 붙인다
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* 상단 — 어디까지 왔나 / 누가 남았나. 퍼머데스 게임의 두 축이다 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          gap: 10,
        }}
      >
        <span
          style={{
            background: T.panelHi,
            borderRadius: 999,
            padding: '7px 14px',
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {towerCleared ? '등반 종료' : `${floor.id}층 · ${floor.name}`}
        </span>
        <span style={{ fontSize: 13, color: T.dim, whiteSpace: 'nowrap' }}>
          영웅 {alive.length}/{roster.length}
        </span>
      </div>

      {/*
        마을이 상단바와 탭 바 사이를 **전부** 채운다.
        여기에 flex:1 스페이서를 대신 두면 마을 아래가 검게 비어(실제로 그랬다)
        장면이 잘린 것처럼 보인다 — 배경화는 화면을 채워야 배경화다.
      */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>
        <VillageScene
          facilities={facilities}
          deathCount={deathCount ?? 0}
          onSelect={onGoTo}
          // 파티가 비었거나 등반이 끝났으면 탑이 잠긴다 — 그림으로도 보인다
          towerLocked={party.length === 0 || towerCleared}
        />
      </div>

      <TabBar onSelect={onTab} />
    </div>
  );
}
