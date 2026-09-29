import { useState } from 'react';
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
import type { PrepDef } from '../game/data/preps';
import type { BuyPrepResult } from '../stores/runStore';
import type { HeroInstance } from '../game/types';
import { displayName } from '../game/identity';
import { lineFor, pickSpeaker } from '../game/voice';
import { Quote } from '../ui/Quote';
import { StratagemPanel, type StratagemPanelProps } from './brief/StratagemPanel';
import { RoutePanel, type RoutePanelProps } from './map/RoutePanel';

export interface BriefScreenProps {
  floor: FloorSpec;
  partySize: number;
  /** 아직 달성하지 않은 이 층의 과제 */
  quests?: QuestDef[];
  onBack: () => void;
  onStart: () => void;
  /**
   * 이 층의 임무에 대응하는 준비 한 수. STEP 49.
   *
   * 개입이 *전투 중* 판단이라면 이건 *전투 전* 판단이다 —
   * 브리핑이 정보 표시에서 **결정 지점**으로 바뀐다.
   */
  prep?: PrepDef;
  /** 이미 샀는가 — 층당 1개다 */
  prepBought?: boolean;
  /** 살 수 있는지 판단용 */
  gold?: number;
  onBuyPrep?: () => BuyPrepResult;
  /**
   * 출전할 영웅들 — 이 중 한 명이 문 앞에서 한 마디 한다(gdd-v3 §4.10).
   * 누가 말할지는 층 번호로 정한다. 같은 층에 다시 오면 같은 사람이 같은 말을 한다.
   */
  speakers?: HeroInstance[];
  /** 작전 — 책략 2장 + 군령. 없으면 패널을 그리지 않는다 */
  stratagem?: StratagemPanelProps;
  /** 지도 — 경로 선택(기획서 2단계). 없으면 패널을 그리지 않는다 */
  routePanel?: RoutePanelProps;
}

/** 임무 브리핑 — 진입 전 마지막 확인 */
export function BriefScreen({
  floor, partySize, quests = [], onBack, onStart,
  prep, prepBought = false, gold = 0, onBuyPrep, speakers = [], stratagem, routePanel,
}: BriefScreenProps) {
  const speaker = pickSpeaker(speakers, floor.id);
  const sortieLine = speaker ? lineFor(speaker, 'sortie', floor.id) : null;
  const [notice, setNotice] = useState<string | null>(null);

  const buy = () => {
    if (!onBuyPrep) return;
    const r = onBuyPrep();
    if (r.ok) {
      setNotice(null);
      return;
    }
    setNotice(
      r.reason === 'not-enough-gold' ? '금이 부족합니다.'
        : r.reason === 'already-bought' ? '이미 준비를 마쳤습니다.'
          : '지금은 준비할 수 없습니다.',
    );
  };

  /**
   * 준비를 사 두고 돌아가면 그 금은 사라진다(층을 바꾸면 무효).
   *
   * 되돌릴 수 없는 소비 앞에서는 한 단계 더 묻는다 — 합성 제물과 같은 원칙이다.
   * ⚠️ `window.confirm`을 쓰지 않는다. 이 프로젝트는 확인을 **화면 안의 상태**로
   * 처리한다(`ForgeScreen`의 제물 확인). 브라우저 모달은 톤이 깨진다.
   */
  const [confirmBack, setConfirmBack] = useState(false);
  const back = () => {
    if (prepBought && !confirmBack) {
      setConfirmBack(true);
      return;
    }
    onBack();
  };
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
        지도 — 임무 바로 아래. "어디서 부딪히는가"는 임무 다음으로 먼저 읽을 정보이고,
        아래의 작전(책략)을 고를 때 이 접점 지형을 보고 고르게 된다.
      */}
      {routePanel && (
        <div style={{ marginTop: 16 }}>
          <RoutePanel {...routePanel} />
        </div>
      )}

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

      {/*
        준비 한 수 — 전투 전 판단. STEP 49.

        과제 **아래**에 둔다. 과제는 "어떻게 싸울지 바꾸는 정보"이고 준비는
        그 정보를 보고 내리는 **결정**이라, 읽기 → 결정 순서가 화면 흐름과 맞는다.
      */}
      {prep && onBuyPrep && (
        <div style={{ marginTop: 16 }}>
          <SystemPanel compact>
            <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.3em', marginBottom: 10 }}>
              출정 준비
            </div>
            <div style={{ fontSize: 15, color: T.gold, letterSpacing: '.08em', marginBottom: 6 }}>
              {prep.name}
            </div>
            <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.8, marginBottom: 12 }}>
              {prep.desc}
            </div>

            {prepBought ? (
              // 산 뒤에는 버튼이 사라진다 — "층당 1회"가 화면에서 자명해야 한다
              <div style={{ fontSize: 13, color: T.amber, letterSpacing: '.08em' }}>
                준비를 마쳤다
              </div>
            ) : (
              <>
                <Button
                  small
                  disabled={gold < prep.cost}
                  onClick={buy}
                >
                  준비 · 금 {prep.cost}
                </Button>
                {notice && (
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 10, lineHeight: 1.7 }}>
                    {notice}
                  </div>
                )}
              </>
            )}
          </SystemPanel>
        </div>
      )}

      {/*
        작전 — 준비 한 수 **아래**. 준비는 이 층 한정의 소비이고 작전은 매 전투 들고 가는
        방침이라, 층 정보 → 이 층 결정 → 늘 쓰는 결정 순서로 읽힌다.
      */}
      {stratagem && (
        <div style={{ marginTop: 16 }}>
          <StratagemPanel {...stratagem} />
        </div>
      )}

      {/*
        출정 전 한 마디. 진입 버튼 **바로 위**에 둔다 — 문을 열기 직전의 말이라서다.
        말이 "들어간다"를 누르는 손을 한 번 멈추게 하면 그걸로 제 몫을 한 것이다.
      */}
      {speaker && sortieLine && (
        <div style={{ marginTop: 16 }}>
          <SystemPanel compact>
            <Quote
              text={sortieLine.text}
              speaker={displayName(speaker, gameData.heroes)}
              temper={sortieLine.temper.label}
            />
          </SystemPanel>
        </div>
      )}

      {/*
        과제 문구가 길어지면 진입 버튼이 접힘선 아래로 내려간다 —
        1층 기준으로도 600px 화면에서 65px 밀렸다(실측). 하단에 고정한다.
        ⚠️ 준비 패널이 늘어난 뒤로 이 고정이 더 중요해졌다.
      */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginTop: 26,
          padding: '14px 0 calc(14px + env(safe-area-inset-bottom))',
          background: `linear-gradient(180deg,transparent,${T.void} 45%)`,
          zIndex: 10,
        }}
      >
        <Button onClick={back}>
          {confirmBack ? '준비를 버리고 돌아가기' : '돌아가기'}
        </Button>
        <Button tone="warning" onClick={onStart}>진입</Button>
      </div>
      {confirmBack && (
        <div style={{
          fontSize: 11, color: T.amber, textAlign: 'center', lineHeight: 1.8, marginTop: -6,
        }}>
          돌아가면 준비한 것이 무효가 되고 금은 돌아오지 않습니다.
        </div>
      )}
    </div>
  );
}
