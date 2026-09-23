import { useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { Button, TOUCH_MIN } from '../ui/Button';
import { CodexPanel } from './CodexPanel';
import { AiSettingsPanel } from './AiSettingsPanel';
import { Quote } from '../ui/Quote';
import { HeroCard } from '../ui/HeroCard';
import { heroArtOf } from '../ui/artMap';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { klassFor } from '../game/stats';
import { gameData } from '../game/data';
import type { Legacy } from '../game/legacyTypes';

export interface GraveScreenProps {
  legacy: Legacy;
  /** 현재(진행 중) 런 정보 — runs에는 아직 없다 */
  runNo: number;
  floorIndex: number;
  deathCount: number;
  towerCleared: boolean;
  onStartNewRun: () => void;
  onBack: () => void;
}

/**
 * 무덤 — 회차를 넘어 남는 기록.
 *
 * 퍼머데스가 축적되는 것이 보여야 한다. 사망자를 숫자로만 두면
 * "12명 잃음"이 되고, 그건 상실이 아니라 통계다.
 */
export function GraveScreen({
  legacy, runNo, floorIndex, deathCount, towerCleared, onStartNewRun, onBack,
}: GraveScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<'grave' | 'codex'>('grave');

  // 최신 회차가 위로 — 방금 잃은 것이 먼저 보여야 한다.
  const fallen = [...legacy.fallen].reverse();

  return (
    <div style={{ padding: '26px 14px calc(24px + env(safe-area-inset-bottom))', textAlign: 'center' }}>
      <div style={{ fontSize: 24, letterSpacing: '.4em', color: T.frame, marginBottom: 8 }}>무 덤</div>
      {/*
        명부에 오른 수를 그대로 말한다. deathCount(이번 런)를 더하면 이중 계산이 된다 —
        finish()가 이미 사망자를 legacy.fallen에 넣었기 때문이다.
      */}
      <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.2em', marginBottom: 18 }}>
        {runNo}회차 · 잃은 영웅 {legacy.fallen.length}
      </div>

      {/*
        탭 전환 — 대장간(SmithScreen)의 벼리기/만들기와 같은 모양.
        도감을 새 화면으로 만들지 않은 이유는 **회차를 넘어 남는 기록**이라는
        성격이 무덤과 같기 때문이다. 도감은 gdd-v3 §7이 명시한 계승의 유일한
        예외이고, 무덤도 계승되는 기록이다 — 둘은 같은 서랍에 있어야 한다.
        (마을에 자리를 하나 더 여는 것은 별개 결정이기도 하다)
      */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['grave', 'codex'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              minHeight: TOUCH_MIN,
              background: 'transparent',
              border: `1px solid ${tab === t ? T.frame : T.panelHi}`,
              color: tab === t ? T.text : T.dim,
              fontFamily: 'inherit',
              fontSize: 13,
              letterSpacing: '.16em',
              cursor: 'pointer',
            }}
          >
            {t === 'grave' ? '기록' : '도감'}
          </button>
        ))}
      </div>

      {tab === 'codex' && <CodexPanel codex={legacy.codex} />}

      {tab === 'grave' && (
      <>
      <SectionLabel>사망자 명부</SectionLabel>
      {fallen.length === 0 ? (
        <SystemPanel>
          <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, padding: '10px 0' }}>
            아직 아무도 잃지 않았다.
          </div>
        </SystemPanel>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {fallen.map((f, i) => (
            <SystemPanel key={`${f.name}-${i}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                <div style={{ flexShrink: 0 }}>
                  {/*
                    죽은 카드는 `dead`로 그린다. 폭은 width로 준다 —
                    HeroCard에는 size/faded prop이 없다(확인함).
                    reveal은 넘기지 않는다: 발굴 진행도는 아래 문구로 이미 말하고 있고,
                    카드 밑변 선과 중복되면 노이즈다.
                  */}
                  <HeroCard
                    name={f.name}
                    star={f.star}
                    klass={klassFor(f.star)}
                    art={heroArtOf(f.defId)}
                    defId={f.defId}
                    element={gameData.heroes[f.defId]?.element ?? 'fire'}
                    width={96}
                    dead
                  />
                </div>
                <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.9 }}>
                  <div style={{ color: T.text, fontSize: 13 }}>{f.name}</div>
                  <div>{f.title}</div>
                  <div style={{ color: T.blood }}>
                    {f.runNo}회차 · {f.floorId}층
                    {f.revealProgress > 0 && ` · 발굴 ${Math.round(f.revealProgress * 100)}%`}
                  </div>
                </div>
              </div>
              {/*
                유언은 카드 옆이 아니라 **아래 한 줄 전체**에 둔다. 카드 옆 칸은 96px 카드를
                빼면 폭이 좁아서 긴 유언이 여섯 줄로 쪼개진다. 유언 이전의 기록은 말이 없다.
              */}
              {f.lastWords && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.panelHi}` }}>
                  <Quote text={f.lastWords} tone="death" byAi={f.lastWordsBy === 'ai'} />
                  {f.epitaph && (
                    <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>{f.epitaph}</div>
                  )}
                </div>
              )}
            </SystemPanel>
          ))}
        </div>
      )}

      {legacy.summit.length > 0 && (
        <>
          <SectionLabel>정상에 선 자들</SectionLabel>
          <SystemPanel>
            <div style={{ fontSize: 12, color: T.dim, lineHeight: 2, padding: '6px 0' }}>
              {legacy.summit.map((s) => (
                <div key={s.runNo}>
                  <span style={{ color: T.gold }}>{s.runNo}회차</span>
                  {' · '}
                  {s.heroes.map((h) => h.name).join(' · ')}
                </div>
              ))}
            </div>
          </SystemPanel>
        </>
      )}

      <SectionLabel>등반 기록</SectionLabel>
      <SystemPanel>
        <div style={{ fontSize: 12, color: T.dim, lineHeight: 2, padding: '6px 0' }}>
          {legacy.runs.map((r) => (
            <div key={r.runNo}>
              {r.runNo}회차 · {r.cleared ? <span style={{ color: T.gold }}>{r.reachedFloor}층 클리어</span> : `${r.reachedFloor}층에서 중단`}
              {' · '}사망 {r.deaths} · 소환 {r.summons}
            </div>
          ))}
          {/* 진행 중인 런은 runs에 없다 — 끝나지 않았기 때문이다. 별도 행으로 보여준다. */}
          <div style={{ color: T.text }}>
            {runNo}회차 · {floorIndex + 1}층 · 사망 {deathCount}
            <span style={{ color: T.amber }}> · 진행 중</span>
          </div>
        </div>
      </SystemPanel>

      <div style={{ marginTop: 20 }}>
        <AiSettingsPanel />
      </div>
      </>
      )}

      {/* 새 회차 시작은 탭 밖에 둔다 — 도감을 보다가도 눌러야 하는 조작이 아니라,
          어느 탭에 있든 같은 자리에 있어야 하는 화면 전체의 조작이다 */}
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {towerCleared && !confirming && (
          <Button onClick={() => setConfirming(true)}>새로운 등반을 시작한다</Button>
        )}
        {confirming && (
          <SystemPanel tone="warning">
            <div style={{ fontSize: 12, color: T.text, lineHeight: 1.9, padding: '6px 0' }}>
              이번 런의 영웅·장비·재화가 <span style={{ color: T.blood }}>전부 사라진다.</span>
              <br />
              무덤의 기록은 남는다.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button small onClick={() => setConfirming(false)}>되돌아간다</Button>
              <Button small onClick={onStartNewRun}>시작한다</Button>
            </div>
          </SystemPanel>
        )}
        <Button small onClick={onBack}>돌아가기</Button>
      </div>
    </div>
  );
}
