import { SystemPanel } from '../ui/SystemPanel';
import { Button } from '../ui/Button';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { TowerMap } from '../ui/TowerMap';

export interface TowerScreenProps {
  /** 지금 도전할 층(인덱스) — 브리핑으로 넘어갈 층이자 미니맵의 '현재' 표시 기준 */
  floorIndex: number;
  /** 해금 상한(인덱스). 이 위는 고를 수 없다 — TowerMap이 내부에서 다시 막는다 */
  maxFloorReached: number;
  /** 최상층을 이미 클리어했는가 — 미니맵을 '완주' 모양으로 그린다 */
  towerCleared: boolean;
  /** 층을 골랐다. 스토어의 selectFloor(index) 반영 뒤 브리핑으로 넘어간다 */
  onSelectFloor: (index: number) => void;
  onBack: () => void;
}

/**
 * 탑 — 층 선택.
 *
 * 대기실과 브리핑 사이에 낀 화면. 마을의 '탑 입장'은 예전엔 곧장 브리핑으로 갔지만,
 * 기존 층 재도전(파밍)이 들어오면서 **어느 층으로 들어갈지 고르는 자리**가 필요해졌다.
 * `TowerMap` 자체는 STEP 17에서 이미 완성돼 있었다 — 이 화면은 그걸 붙이기만 한다.
 *
 * 최상층 클리어 뒤에도 이 화면은 계속 열린다. 재도전 파밍은 클리어 이후에도
 * `maxFloorReached` 안에서 계속되는 행위이므로(설계 §5.1), 여기서 막으면
 * 파밍의 입구 자체가 사라진다. 전투 진입 가드(빈 파티·미해금 층)는 그대로 유지한다.
 */
export function TowerScreen({
  floorIndex, maxFloorReached, towerCleared, onSelectFloor, onBack,
}: TowerScreenProps) {
  return (
    <div style={{ padding: '20px 14px calc(24px + env(safe-area-inset-bottom))' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: T.dim,
          letterSpacing: '.1em',
          borderBottom: `1px solid ${T.panelHi}`,
          paddingBottom: 10,
          marginBottom: 16,
        }}
      >
        <span>탑</span>
        <span>{towerCleared ? '등반 완료 · 재도전 가능' : `해금 ${maxFloorReached + 1}층`}</span>
      </div>

      <SectionLabel>층 선택</SectionLabel>

      <SystemPanel compact>
        <TowerMap
          current={floorIndex}
          cleared={towerCleared}
          maxFloorReached={maxFloorReached}
          onSelectFloor={onSelectFloor}
        />
      </SystemPanel>

      <div style={{ marginTop: 20, textAlign: 'center', minHeight: 44 }}>
        <Button onClick={onBack}>돌아가기</Button>
      </div>
    </div>
  );
}
