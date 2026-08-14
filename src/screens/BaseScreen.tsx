import { IsoVillage } from '../ui/IsoVillage';
import { BaseHud } from '../ui/BaseHud';
import type { VillageSpot } from '../ui/iso';
import type { FacilityKind } from '../game/data/facilities';
import type { FloorSpec } from '../game/data/floors';
import type { HeroInstId, HeroInstance, Wallet } from '../game/types';
import { livingHeroes } from '../game/roster';

export const PARTY_LIMIT = 3;

export interface BaseScreenProps {
  floor: FloorSpec;
  roster: HeroInstance[];
  party: HeroInstId[];
  facilities: Record<FacilityKind, number>;
  /** 마을에서 장소를 골랐다 */
  onGoTo: (spot: VillageSpot) => void;
  /** 최상층을 이미 클리어했는가 — 더 오를 층이 없다 */
  towerCleared?: boolean;
  /** 상단 HUD의 재화 표시 */
  wallet: Wallet;
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
 * 대기실 — 아이소메트릭 마을 부감도가 전부다.
 *
 * ── 왜 이 화면에 목록이 없는가 ────────────────────────
 * 이전 버전은 마을 + 다음 층 + 파티 카드 + 버튼을 한 화면에 쌓아 1442px이 됐고,
 * 주 동선인 '탑 입장'이 화면 밖(y=1378)으로 밀려났다.
 * 지금은 **마을·HUD·탭 바만** 둔다 — 나머지는 전부 별도 화면이다.
 * 그래서 로스터가 몇 명이 되든 이 화면 높이는 변하지 않는다.
 *
 * ── 스크롤이 없어야 한다 ──────────────────────────────
 * 폰 세로 한 화면에 전부 들어가는 것이 이 화면의 요구사항이다.
 * HUD는 마을 위에 겹치고(자리를 안 뺏는다), 마을은 남은 높이에 맞춰 줄어들며,
 * 탭 바만 고정 높이를 갖는다. 여기에 세로로 쌓이는 요소를 추가하면 그 즉시 깨진다.
 */
export function BaseScreen({
  floor, roster, party, facilities, wallet,
  onGoTo,
  towerCleared = false, deathCount,
}: BaseScreenProps) {
  const alive = livingHeroes(roster);
  const floorText = towerCleared ? '등반 종료' : `${floor.id}층 · ${floor.name}`;

  return (
    /*
      ── 스크롤이 없는 3층 구조 ────────────────────────────
      minHeight:0이 핵심이다. flex 자식의 기본 min-height는 auto라
      내용이 크면 부모를 밀어내 화면이 스크롤된다 — 폰 세로에서 이건 실패다.
      0으로 눌러야 마을이 '남은 높이에 맞춰 줄어드는' 쪽이 된다.
    */
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/*
        HUD는 마을 위에 겹친다(position:absolute). 그래서 이 래퍼가
        상단바와 탭 바 사이 전부를 마을에게 준다 — 그림이 화면 끝까지 이어져야
        '세계 안의 거점'으로 보인다.
      */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <IsoVillage
          facilities={facilities}
          deathCount={deathCount ?? 0}
          onSelect={onGoTo}
          floorLabel={towerCleared ? undefined : `${floor.id}F`}
          // 파티가 비었거나 등반이 끝났으면 탑이 잠긴다 — 그림으로도 보인다
          towerLocked={party.length === 0 || towerCleared}
        />
        <BaseHud
          wallet={wallet}
          floorText={floorText}
          alive={alive.length}
          total={roster.length}
        />
      </div>

      {/*
        탭 바는 여기가 아니라 `App.tsx`가 그린다 — 거점 화면 전체가 공유하는
        상시 동선이라 화면마다 두면 새 화면에서 빠뜨린다(실제로 그랬다).
      */}
    </div>
  );
}
