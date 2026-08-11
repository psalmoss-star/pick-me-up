import { SystemPanel } from '../ui/SystemPanel';
import { Button } from '../ui/Button';
import { Scene } from '../ui/art/Scene';
import { GuardArt } from '../ui/art/GuardArt';
import { EnemyArt } from '../ui/art/EnemyArt';
import { enemyArtOf, guardArtOf } from '../ui/artMap';
import { T } from '../ui/tokens';
import { MISSION_LABEL } from '../game/mission';
import { gameData } from '../game/data';
import type { FloorSpec } from '../game/data/floors';
import type { QuestDef } from '../game/data/quests';

export interface BriefScreenProps {
  floor: FloorSpec;
  partySize: number;
  /** 아직 달성하지 않은 이 층의 과제 */
  quests?: QuestDef[];
  onBack: () => void;
  onStart: () => void;
}

/** 임무 브리핑 — 진입 전 마지막 확인 */
export function BriefScreen({
  floor, partySize, quests = [], onBack, onStart,
}: BriefScreenProps) {
  const bossId = floor.isBoss ? floor.enemyIds[0] : null;
  const boss = bossId ? gameData.enemies[bossId] : null;

  return (
    <div style={{ padding: '20px 14px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ position: 'relative', height: 140, border: `1px solid ${T.panelHi}`, overflow: 'hidden', marginBottom: 24 }}>
        <Scene kind={floor.scene} />
        {floor.guards?.map((g) => (
          <div key={g.id} style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)' }}>
            <GuardArt art={guardArtOf(g.id)} ratio={1} size={78} />
          </div>
        ))}
        {boss && bossId && (
          <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)' }}>
            <EnemyArt art={enemyArtOf(bossId)} element={boss.element} size={92} />
          </div>
        )}
      </div>

      <SystemPanel tone="warning">
        <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.3em', marginBottom: 12 }}>
          {floor.id}층 · {floor.name}
        </div>
        <div style={{ fontSize: 21, letterSpacing: '.1em', marginBottom: 14 }}>
          임무 유형 [{MISSION_LABEL[floor.mission.kind]}]
        </div>
        <div style={{ fontSize: 15, lineHeight: 2 }}>{floor.mission.briefing}</div>
        {floor.guards?.map((g) => (
          <div key={g.id} style={{ fontSize: 13, color: T.amber, marginTop: 12 }}>
            보호 대상 : {g.name} — 잃으면 즉시 실패
          </div>
        ))}
        <div style={{ fontSize: 12, color: T.dim, marginTop: 16, lineHeight: 1.9 }}>
          출전 {partySize}명 · 적 {floor.enemyIds.length}기
          <br />
          전투 중 사망한 영웅은 되살릴 수 없습니다.
        </div>
      </SystemPanel>

      {/*
        과제는 진입 전에 보여야 의미가 있다 — 어떻게 싸울지를 바꾸는 정보이기 때문이다.
        결과 화면에서만 알려주면 "몰랐는데 됐다"가 되어 선택이 사라진다.
      */}
      {quests.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SystemPanel compact>
            <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.3em', marginBottom: 10 }}>
              과제
            </div>
            {quests.map((q) => (
              <div key={q.id} style={{ lineHeight: 1.9, marginBottom: 6 }}>
                <div style={{ fontSize: 14, color: T.gold, letterSpacing: '.08em' }}>
                  ◆ {q.name}
                </div>
                <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>{q.desc}</div>
              </div>
            ))}
          </SystemPanel>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
        <Button onClick={onBack}>돌아가기</Button>
        <Button tone="warning" onClick={onStart}>진입</Button>
      </div>
    </div>
  );
}
