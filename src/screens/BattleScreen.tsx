import { useEffect, useMemo, useRef, useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { Button } from '../ui/Button';
import { Scene } from '../ui/art/Scene';
import { T } from '../ui/tokens';
import { BattleUnit, STATUS_MARK, type Floater } from './battle/BattleUnit';
import { InterventionBar } from './battle/InterventionBar';
import { deriveBeats } from '../game/beats';
import { chronicleOf } from '../game/chronicle';
import { MISSION_LABEL } from '../game/mission';
import { gameData } from '../game/data';
import { canWithdraw, retreatedAt, type Intervention } from '../game/intervention';
import type { EncounterResult, RosterUnit } from '../game/encounter';
import { STRATAGEM_BY_ID, type StratagemId } from '../game/data/stratagems';
import { floorMapOf } from '../game/floormap';
import { crisisFor, reportLine, type ScoutReport } from '../game/report';
import { Minimap } from './map/Minimap';
import { minimapLayout } from '../ui/minimapLayout';
import { minimapDots, type DotUnit, type MinimapPhase } from '../ui/minimapDots';
import type { FloorSpec } from '../game/data/floors';
import type { StatusKind } from '../game/types';

/** 이벤트 하나를 재생하는 기본 시간(ms) */
const STEP_MS = 400;
const FLOAT_MS = 720;
const SHAKE_MS = 180;

/** 세로 예산에 맞춘 수치. 375x667에서 스크롤 없이 들어가야 한다. */
const SIZE = {
  enemyArt: 68,
  heroArt: 74,
  guardArt: 76,
  enemyScale: 0.92,   // 뒤쪽은 살짝 작게 — 원근
  heroScale: 1,
  logLines: 3,
  /** 전장 왼쪽 위 미니맵 폭(px). 높이는 격자 비율 3/4 → 72 */
  miniMap: 96,
  /** 펼친 지도 폭(px) — 375에서 좌우 여백 포함해 들어간다 */
  bigMap: 320,
} as const;

export interface BattleScreenProps {
  result: EncounterResult;
  floor: FloorSpec;
  floorIndex: number;
  onEnd: () => void;
  /** 개입으로 전투를 다시 계산해야 할 때 */
  onIntervene?: (interventions: Intervention[]) => void;
  interventions?: Intervention[];
  /** 브리핑에서 고른 경로 — 상단 지도 띠에 그린다 */
  route?: number;
  /**
   * 정찰 보고(기획서 3단계) — 위기 창을 **언제** 띄울지 정한다. 정직 30% · 허세 15% · 겁많음 50%,
   * 침묵이면 창이 없다. 없으면(옛 경로) 정직과 같다.
   */
  report?: ScoutReport | null;
}

/**
 * 관전 화면.
 *
 * 전투 엔진이 만든 BattleEvent[]를 재생만 한다.
 * 단 하나의 예외가 후퇴 신호 — 위기 순간 리플레이가 멈추고, 마스터가 한 명을 빼내면
 * 같은 시드로 다시 계산해 이어붙인다(발효는 다음 턴이라 지금까지 본 장면은 그대로다).
 */
export function BattleScreen({
  result, floor, floorIndex: _floorIndex, onEnd, onIntervene, interventions = [], route = 0, report,
}: BattleScreenProps) {
  const floorMap = useMemo(() => floorMapOf(floor), [floor]);
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [beatIdx, setBeatIdx] = useState(0);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [hitUid, setHitUid] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  /** 위기 창을 이미 넘겼는가 — 신호를 보냈든 그대로 싸우기로 했든 */
  const [crisisHandled, setCrisisHandled] = useState(false);
  /** 미니맵을 크게 펼쳤는가 — 재생은 멈추지 않는다. 위기 창이 뜨면 닫는다(위기 창이 우선) */
  const [mapOpen, setMapOpen] = useState(false);
  const mmLayout = useMemo(() => minimapLayout(floorMap), [floorMap]);
  const floaterId = useRef(0);

  const bossName = floor.isBoss ? gameData.enemies[floor.enemyIds[0]]?.name : undefined;
  /** 책략 장면 — 결과 화면의 전투 기록과 같은 함수·같은 문장 */
  const chronicle = useMemo(() => chronicleOf(result.events, result.roster), [result]);
  const beats = useMemo(
    () => deriveBeats(result.events, { roster: result.roster, bossName, chronicle }),
    [result, bossName, chronicle],
  );
  const pending = beats[beatIdx] && beats[beatIdx].at <= step ? beats[beatIdx] : null;

  /**
   * 위기 — 정찰자가 **알리는** 순간. 정직은 누군가 30% 아래로 떨어진 때, 허세는 15%(늦게),
   * 겁많음은 50%(이르게), 침묵은 알리지 않는다(`crisisFor`). 기획서 3단계.
   * 비트가 먼저 뜨고(같은 순간이면 책략·사망 알림부터), 그다음 이 창이 뜬다.
   */
  const crisis = crisisFor(result, report);
  const signalLeft = !!onIntervene && canWithdraw(interventions);
  const crisisOpen = !pending && !crisisHandled && signalLeft
    && !!crisis && step >= crisis.at;
  const scoutUnit = report ? result.roster.find((u) => u.sourceId === report.scoutId) : undefined;

  /** step 시점의 HP — 이벤트 로그가 단일 출처 */
  const hp = useMemo(() => {
    const m: Record<string, number> = {};
    const max: Record<string, number> = {};
    for (const u of result.roster) { m[u.uid] = u.startHp ?? u.maxHp; max[u.uid] = u.maxHp; }
    for (const e of result.events.slice(0, step)) {
      if (e.type !== 'damage' && e.type !== 'heal') continue;
      for (const uid of e.targetUids ?? []) {
        if (m[uid] === undefined) continue;
        m[uid] = e.type === 'damage'
          ? Math.max(0, m[uid] - (e.amount ?? 0))
          : Math.min(max[uid], m[uid] + (e.amount ?? 0));
      }
    }
    return m;
  }, [step, result]);

  /** step 시점의 상태이상 */
  const statuses = useMemo(() => {
    const m: Record<string, StatusKind[]> = {};
    for (const e of result.events.slice(0, step)) {
      if (e.type === 'statusApplied' && e.status) {
        for (const uid of e.targetUids ?? []) {
          m[uid] = [...(m[uid] ?? []).filter((s) => s !== e.status), e.status];
        }
      }
      if (e.type === 'statusExpired' && e.status) {
        for (const uid of e.targetUids ?? []) {
          m[uid] = (m[uid] ?? []).filter((s) => s !== e.status);
        }
      }
    }
    return m;
  }, [step, result]);

  /** 현재 턴 */
  const curTurn = result.events[Math.min(step, result.events.length - 1)]?.turn ?? 1;

  /** 지금 시전 중인 스킬 (직전 이벤트가 skillUse면 표시) */
  const casting = useMemo(() => {
    const e = result.events[step - 1];
    if (!e || e.type !== 'skillUse' || !e.actorUid) return null;
    return { uid: e.actorUid, name: gameData.skills[e.skillId!]?.name ?? '' };
  }, [step, result]);

  const retreatedNow = useMemo(
    () => retreatedAt(interventions, curTurn),
    [interventions, curTurn],
  );

  /** step 시점까지 전투에서 이탈한 영웅 uid — 군령(퇴각)과 후퇴 신호 모두 */
  const withdrawnNow = useMemo(() => {
    const set = new Set<string>();
    for (const e of result.events.slice(0, step)) {
      if (e.type === 'withdraw') for (const uid of e.targetUids ?? []) set.add(uid);
    }
    return set;
  }, [step, result]);

  // --- 재생 루프 ---
  useEffect(() => {
    if (pending || crisisOpen || step >= result.events.length) return;
    const timer = setTimeout(() => {
      const e = result.events[step];
      if (e && (e.type === 'damage' || e.type === 'heal')) {
        const targets = e.targetUids ?? [];
        const added: Floater[] = targets.map((uid) => ({
          id: ++floaterId.current,
          uid,
          amount: e.amount ?? 0,
          heal: e.type === 'heal',
          crit: e.isCrit === true,
          affinity: e.affinity,
          fromPotion: e.fromPotion === true,
        }));
        if (added.length) {
          setFloaters((f) => [...f, ...added]);
          const ids = new Set(added.map((a) => a.id));
          setTimeout(() => setFloaters((f) => f.filter((x) => !ids.has(x.id))), FLOAT_MS);
        }
        if (e.type === 'damage' && targets[0]) {
          setHitUid(targets[0]);
          setTimeout(() => setHitUid(null), SHAKE_MS);
          // 아군이 맞으면 화면 가장자리가 붉게 번쩍인다
          if (targets[0].startsWith('A:')) setFlash((n) => n + 1);
        }
      }
      setStep((s) => s + 1);
    }, STEP_MS / speed);
    return () => clearTimeout(timer);
  }, [step, speed, pending, crisisOpen, result]);

  const done = step >= result.events.length && !pending;

  useEffect(() => { if (crisisOpen) setMapOpen(false); }, [crisisOpen]);

  /** 미니맵 점 — 화면이 이미 가진 HP·이탈·단계만 읽는다(엔진은 미니맵을 모른다) */
  const mapPhase: MinimapPhase = step === 0 ? 'approach' : done ? 'after' : 'engage';
  const mapDots = useMemo(() => minimapDots(mmLayout, floorMap, route, {
    phase: mapPhase,
    outcome: result.outcome === 'victory' ? 'victory' : 'defeat',
    units: result.roster.map((u): DotUnit => ({
      uid: u.uid,
      side: u.kind,
      alive: (hp[u.uid] ?? u.maxHp) > 0,
      withdrawn: u.kind === 'hero' && (withdrawnNow.has(u.uid) || retreatedNow.has(u.sourceId)),
    })),
  }), [mmLayout, floorMap, route, mapPhase, result, hp, withdrawnNow, retreatedNow]);

  /*
    ⚠️ `statusApplied`를 추가했다 — 디버프가 걸리는 순간이 안 보이면
    "왜 갑자기 녹지"가 설명되지 않는다. 엔진은 이벤트를 내고 있었고 화면이 버렸다.
    ⚠️ 줄 수(`SIZE.logLines`)는 375×667 무스크롤 예산이므로 **늘리지 않았다.**
  */
  const log = result.events
    .slice(0, step)
    .filter((e) =>
      e.type === 'skillUse' || e.type === 'damage' || e.type === 'heal'
      || e.type === 'death' || e.type === 'retreat' || e.type === 'statusApplied'
      || e.type === 'stratagem' || e.type === 'withdraw')
    .slice(-SIZE.logLines);

  const nameOf = (uid?: string) => result.roster.find((u) => u.uid === uid)?.name ?? '';

  const skipAll = () => {
    setStep(result.events.length);
    setBeatIdx(beats.length);
    // 건너뛰면 위기 창도 지나간다 — 끝난 전투에 신호를 보낼 수는 없다
    setCrisisHandled(true);
  };

  /**
   * 후퇴 신호 — 한 명을 전투에서 빼낸다. 위기 **다음 턴**부터 발효한다.
   * 이번 턴은 이미 재생 중이라 되돌리면 화면이 튄다(개입의 원래 원칙).
   */
  const sendSignal = (instId: string) => {
    if (!onIntervene || !crisis) return;
    onIntervene([...interventions, { turn: crisis.turn + 1, kind: 'withdraw', targetId: instId }]);
    setCrisisHandled(true);
  };

  const enemies = result.roster.filter((u) => u.kind === 'enemy');
  const guards = result.roster.filter((u) => u.kind === 'guard');
  const heroes = result.roster.filter((u) => u.kind === 'hero');
  /** 신호로 빼낼 수 있는 영웅 — 지금 살아서 전장에 있는 사람 */
  const signalable = heroes.filter((u) => (hp[u.uid] ?? u.maxHp) > 0 && !withdrawnNow.has(u.uid));

  const renderUnit = (u: RosterUnit, artSize: number, scale: number) => (
    <BattleUnit
      key={u.uid}
      unit={u}
      hp={hp[u.uid] ?? u.maxHp}
      castingSkill={casting?.uid === u.uid ? casting.name : undefined}
      floaters={floaters.filter((f) => f.uid === u.uid)}
      shaking={hitUid === u.uid}
      retreated={u.kind === 'hero' && (retreatedNow.has(u.sourceId) || withdrawnNow.has(u.uid))}
      statuses={statuses[u.uid] ?? []}
      artSize={artSize}
      scale={scale}
      selectable={false}
      onSelect={() => undefined}
    />
  );

  const turnCap = floor.mission.turns;

  return (
    <div style={{ padding: '10px 12px calc(20px + env(safe-area-inset-bottom))' }}>
      {/* 헤더 — 층 정보가 곧 탑 진행도다 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, color: T.dim, letterSpacing: '.1em', marginBottom: 6 }}>
        <span>{floor.id}층 {floor.name} · {MISSION_LABEL[floor.mission.kind]}</span>
        <span style={{ color: turnCap ? T.amber : T.dim }}>
          TURN {curTurn}{turnCap ? ` / ${turnCap}` : ''}
        </span>
      </div>

      {/* 턴 게이지 — 생존/수비는 남은 턴이 곧 승리 조건 */}
      {turnCap && (
        <div style={{ height: 3, background: '#1A1620', marginBottom: 8 }}>
          <div
            style={{
              width: `${Math.min(100, (curTurn / turnCap) * 100)}%`,
              height: '100%',
              background: T.amber,
              boxShadow: `0 0 8px ${T.amber}88`,
              transition: 'width 300ms',
            }}
          />
        </div>
      )}

      {/*
        전장 — 왼쪽 위에 미니맵(2026-10-01, 46px 띠를 대체). 적이 3기 이상이면 가운데 정렬된 적 줄이
        미니맵 자리와 겹친다(375 실측) — 그래서 위 여백을 미니맵 높이만큼 늘렸다(14 → 84).
      */}
      <div style={{ position: 'relative', border: `1px solid ${T.panelHi}`, overflow: 'hidden', padding: `${SIZE.miniMap * 0.75 + 12}px 8px 12px`, marginBottom: 10 }}>
        <Scene kind={floor.scene} />

        <button
          onClick={() => setMapOpen(true)}
          aria-label="지도 펼치기"
          style={{
            position: 'absolute', top: 6, left: 6, zIndex: 2,
            width: SIZE.miniMap, height: SIZE.miniMap * 0.75, padding: 0,
            border: `1px solid ${T.panelHi}`, background: 'transparent', cursor: 'pointer',
          }}
        >
          <Minimap map={floorMap} route={route} width={SIZE.miniMap} dots={mapDots} />
        </button>

        <div style={{ position: 'relative', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: guards.length ? 8 : 18 }}>
          {enemies.map((u) => renderUnit(u, SIZE.enemyArt, SIZE.enemyScale))}
        </div>

        {guards.length > 0 && (
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            {guards.map((u) => renderUnit(u, SIZE.guardArt, 1))}
          </div>
        )}

        <div style={{ position: 'relative', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {heroes.map((u) => renderUnit(u, SIZE.heroArt, SIZE.heroScale))}
        </div>

        {/* 피격 섬광 */}
        <div
          key={flash}
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            boxShadow: `inset 0 0 60px ${T.blood}`,
            opacity: 0,
            animation: flash > 0 ? 'hitFlash 300ms ease-out' : 'none',
          }}
        />
      </div>

      {/* 로그 */}
      <div
        style={{
          minHeight: 68, border: `1px solid ${T.panelHi}`, background: '#08070C',
          padding: '8px 12px', fontSize: 12, lineHeight: 1.7,
          textAlign: 'left', marginBottom: 10,
        }}
      >
        {log.map((e, i) => (
          <div
            key={i}
            style={{
              color: e.type === 'death' ? T.blood
                : e.type === 'heal' ? '#6FBF8F'
                : e.type === 'retreat' || e.type === 'withdraw' ? T.rare
                : e.type === 'stratagem' ? (e.success ? T.gold : T.amber)
                : e.type === 'statusApplied' ? T.dim
                : e.type === 'damage' && e.affinity === 'adv' ? '#FFB454'
                : e.type === 'damage' && e.affinity === 'dis' ? '#7E93A8'
                : T.text,
              opacity: 0.4 + (i / Math.max(1, log.length)) * 0.6,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {e.type === 'skillUse' && `${nameOf(e.actorUid)} — ${gameData.skills[e.skillId!]?.name ?? ''}`}
            {/*
              예전엔 `　└ 120 피해`라 **누구를 때렸는지가 없었다.**
              대상과 상성을 붙여야 "왜 이 숫자인지"가 읽힌다.
            */}
            {e.type === 'damage' && (
              `　└ ${nameOf((e.targetUids ?? [])[0])}에게 ${e.amount} 피해`
              + `${e.isCrit ? ' (치명타)' : ''}`
              + `${e.affinity === 'adv' ? ' ▲효과적' : e.affinity === 'dis' ? ' ▼반감' : ''}`
            )}
            {e.type === 'heal' && (
              `　└ ${nameOf((e.targetUids ?? [])[0])} ${e.amount} 회복`
              + `${e.fromPotion ? ' (물약)' : ''}`
            )}
            {e.type === 'statusApplied' && (
              `　└ ${nameOf((e.targetUids ?? [])[0])} ${STATUS_MARK[e.status!]?.sign ?? e.status}`
            )}
            {e.type === 'death' && `✖ ${nameOf((e.targetUids ?? [])[0])} 쓰러짐`}
            {e.type === 'retreat' && `↩ ${nameOf((e.targetUids ?? [])[0])} 후퇴`}
            {e.type === 'withdraw' && `↩ ${nameOf((e.targetUids ?? [])[0])} 전장 이탈`}
            {e.type === 'stratagem' && (
              `⚑ ${nameOf(e.actorUid)} — ${STRATAGEM_BY_ID[e.stratagemId as StratagemId]?.name ?? '책략'}`
              + ` ${e.success ? '성공' : '간파당함'}`
            )}
          </div>
        ))}
      </div>

      {/* 개입 */}
      <div style={{ marginBottom: 10 }}>
        <InterventionBar
          used={!canWithdraw(interventions)}
          passed={crisisHandled}
          silent={report?.style === 'silent'}
          hidden={done || !onIntervene}
        />
      </div>

      {/* 컨트롤 */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {!done && <Button small onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}>배속 ×{speed}</Button>}
        {!done && <Button small onClick={skipAll}>건너뛰기</Button>}
        {done && <Button tone="rare" onClick={onEnd}>결과 확인</Button>}
      </div>

      {/*
        이벤트 확인 창.

        alignItems는 'flex-start' + 자식 margin:auto다. 'center'와 overflowY:'auto'를
        같이 쓰면 내용이 뷰포트보다 커질 때 위쪽이 스크롤로 닿을 수 없게 된다
        (DetailModal에서 실제로 확인 버튼이 잘렸다). 비트 줄 수가 늘어도 안전하도록 맞춰둔다.
      */}
      {/*
        위기 — 후퇴 신호 창. 비트 창과 같은 틀(확인 창)을 쓴다.
        빼낼 영웅을 여기서 바로 고른다 — 전장의 작은 초상을 누르게 하면 375px에서 빗나간다.
      */}
      {crisisOpen && crisis && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', zIndex: 60, overflowY: 'auto' }}>
          <div style={{ maxWidth: 420, width: '100%', margin: 'auto' }}>
            <SystemPanel tone="warning">
              <div style={{ fontSize: 12, letterSpacing: '.3em', color: T.dim, marginBottom: 14 }}>위기</div>
              <div style={{ fontSize: 15, lineHeight: 2 }}>
                {report && scoutUnit
                  ? reportLine(report.style, 'crisis', { scout: scoutUnit.name, hurt: nameOf(crisis.uid) })
                  : `${nameOf(crisis.uid)}의 숨이 가빠졌다.`}
              </div>
              <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, marginTop: 8 }}>
                후퇴 신호로 한 명을 전장에서 빼낼 수 있다. 빠진 자는 살아남지만 다시 싸우지 않는다.
                <br />이 전투에서 단 한 번이다.
              </div>
            </SystemPanel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18, alignItems: 'center' }}>
              {signalable.map((u) => (
                <Button key={u.uid} tone="rare" onClick={() => sendSignal(u.sourceId)}>
                  {u.name} 후퇴 · HP {Math.max(0, Math.round(hp[u.uid] ?? u.maxHp))}/{u.maxHp}
                </Button>
              ))}
              <Button onClick={() => setCrisisHandled(true)}>그대로 싸운다</Button>
            </div>
          </div>
        </div>
      )}

      {pending && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', zIndex: 60, overflowY: 'auto' }}>
          <div style={{ maxWidth: 420, width: '100%', margin: 'auto' }}>
            <SystemPanel tone={pending.tone}>
              <div style={{ fontSize: 12, letterSpacing: '.3em', color: T.dim, marginBottom: 14 }}>{pending.title}</div>
              {pending.lines.map((l, i) => (
                <div key={i} style={{ fontSize: 15, lineHeight: 2 }}>{l}</div>
              ))}
            </SystemPanel>
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <Button tone={pending.tone} onClick={() => setBeatIdx((b) => b + 1)}>확 인</Button>
            </div>
          </div>
        </div>
      )}

      {/* 펼친 지도 — 재생은 계속된다. 어디를 눌러도 닫힌다 */}
      {mapOpen && (
        <div
          role="dialog"
          aria-label="층 지도 크게 보기"
          onClick={() => setMapOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50, padding: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${T.void}E6`,
          }}
        >
          <div style={{ width: '100%', maxWidth: SIZE.bigMap + 40 }}>
            <SystemPanel compact>
              <Minimap map={floorMap} route={route} width={SIZE.bigMap} labels dots={mapDots} />
              <div style={{ fontSize: 11, color: T.dim, marginTop: 8 }}>눌러서 닫기</div>
            </SystemPanel>
          </div>
        </div>
      )}
    </div>
  );
}
