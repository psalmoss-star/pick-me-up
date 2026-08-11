import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { Button } from '../ui/Button';
import { Scene } from '../ui/art/Scene';
import { T } from '../ui/tokens';
import { BattleUnit, type Floater } from './battle/BattleUnit';
import { InterventionBar } from './battle/InterventionBar';
import { deriveBeats } from '../game/beats';
import { MISSION_LABEL } from '../game/mission';
import { gameData } from '../game/data';
import {
  canIntervene, nextAvailableTurn, retreatedAt,
  targetSideOf, type Intervention, type InterventionKind,
} from '../game/intervention';
import type { EncounterResult, RosterUnit } from '../game/encounter';
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
} as const;

export interface BattleScreenProps {
  result: EncounterResult;
  floor: FloorSpec;
  floorIndex: number;
  onEnd: () => void;
  /** 개입으로 전투를 다시 계산해야 할 때 */
  onIntervene?: (interventions: Intervention[]) => void;
  interventions?: Intervention[];
}

/**
 * 관전 화면.
 *
 * 전투 엔진이 만든 BattleEvent[]를 재생만 한다.
 * 단 하나의 예외가 개입 — 마스터가 판을 비틀면 같은 시드로 다시 계산해 이어붙인다.
 */
export function BattleScreen({
  result, floor, floorIndex: _floorIndex, onEnd, onIntervene, interventions = [],
}: BattleScreenProps) {
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [beatIdx, setBeatIdx] = useState(0);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [hitUid, setHitUid] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [selecting, setSelecting] = useState<InterventionKind | null>(null);
  const floaterId = useRef(0);

  const bossName = floor.isBoss ? gameData.enemies[floor.enemyIds[0]]?.name : undefined;
  const beats = useMemo(
    () => deriveBeats(result.events, { roster: result.roster, bossName }),
    [result, bossName],
  );
  const pending = beats[beatIdx] && beats[beatIdx].at <= step ? beats[beatIdx] : null;

  /** step 시점의 HP — 이벤트 로그가 단일 출처 */
  const hp = useMemo(() => {
    const m: Record<string, number> = {};
    const max: Record<string, number> = {};
    for (const u of result.roster) { m[u.uid] = u.maxHp; max[u.uid] = u.maxHp; }
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

  // --- 재생 루프 ---
  useEffect(() => {
    if (pending || selecting || step >= result.events.length) return;
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
  }, [step, speed, pending, selecting, result]);

  const done = step >= result.events.length && !pending;

  const log = result.events
    .slice(0, step)
    .filter((e) =>
      e.type === 'skillUse' || e.type === 'damage' || e.type === 'heal'
      || e.type === 'death' || e.type === 'retreat')
    .slice(-SIZE.logLines);

  const nameOf = (uid?: string) => result.roster.find((u) => u.uid === uid)?.name ?? '';

  const skipAll = () => { setStep(result.events.length); setBeatIdx(beats.length); };

  // --- 개입 ---
  const canUse = !done && canIntervene(curTurn, interventions) && !!onIntervene;

  const applyIntervention = useCallback((kind: InterventionKind, targetId: string) => {
    if (!onIntervene) return;
    // 다음 턴부터 발효한다. 이번 턴은 이미 재생 중이라 되돌리면 화면이 튄다.
    onIntervene([...interventions, { turn: curTurn + 1, kind, targetId }]);
    setSelecting(null);
  }, [onIntervene, interventions, curTurn]);

  const enemies = result.roster.filter((u) => u.kind === 'enemy');
  const guards = result.roster.filter((u) => u.kind === 'guard');
  const heroes = result.roster.filter((u) => u.kind === 'hero');

  /** 개입 대상으로 고를 수 있는 유닛인가 */
  const isSelectable = (u: RosterUnit) => {
    if (!selecting) return false;
    if ((hp[u.uid] ?? u.maxHp) <= 0) return false;
    return targetSideOf(selecting) === 'enemy' ? u.kind === 'enemy' : u.kind === 'hero';
  };

  const renderUnit = (u: RosterUnit, artSize: number, scale: number) => (
    <BattleUnit
      key={u.uid}
      unit={u}
      hp={hp[u.uid] ?? u.maxHp}
      castingSkill={casting?.uid === u.uid ? casting.name : undefined}
      floaters={floaters.filter((f) => f.uid === u.uid)}
      shaking={hitUid === u.uid}
      retreated={u.kind === 'hero' && retreatedNow.has(u.sourceId)}
      statuses={statuses[u.uid] ?? []}
      artSize={artSize}
      scale={scale}
      selectable={isSelectable(u)}
      onSelect={() => applyIntervention(selecting!, u.kind === 'enemy' ? u.uid : u.sourceId)}
    />
  );

  const turnCap = floor.mission.turns;

  return (
    <div style={{ padding: '10px 12px calc(20px + env(safe-area-inset-bottom))' }}>
      {/* 헤더 — 층 정보가 곧 탑 진행도다 (전투 중 미니맵을 두지 않는 이유) */}
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

      {/* 전장 */}
      <div style={{ position: 'relative', border: `1px solid ${T.panelHi}`, overflow: 'hidden', padding: '14px 8px 12px', marginBottom: 10 }}>
        <Scene kind={floor.scene} />

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
                : e.type === 'retreat' ? T.rare
                : T.text,
              opacity: 0.4 + (i / Math.max(1, log.length)) * 0.6,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {e.type === 'skillUse' && `${nameOf(e.actorUid)} — ${gameData.skills[e.skillId!]?.name ?? ''}`}
            {e.type === 'damage' && `　└ ${e.amount} 피해${e.isCrit ? ' (치명타)' : ''}`}
            {e.type === 'heal' && `　└ ${e.amount} 회복`}
            {e.type === 'death' && `✖ ${nameOf((e.targetUids ?? [])[0])} 쓰러짐`}
            {e.type === 'retreat' && `↩ ${nameOf((e.targetUids ?? [])[0])} 후퇴`}
          </div>
        ))}
      </div>

      {/* 개입 */}
      <div style={{ marginBottom: 10 }}>
        <InterventionBar
          available={canUse}
          currentTurn={curTurn}
          nextTurn={nextAvailableTurn(interventions)}
          selecting={selecting}
          onPick={setSelecting}
          onCancel={() => setSelecting(null)}
          hidden={done}
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
    </div>
  );
}
