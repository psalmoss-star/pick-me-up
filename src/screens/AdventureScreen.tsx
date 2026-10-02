import { useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { tabSafePadding } from '../ui/TabBar';
import { Button, HpBar, TOUCH_MIN } from '../ui/Button';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { adventuresFor, type AdventureDef, type AdventureId, type Dispatch } from '../game/data/adventures';
import { MATERIAL_DEFS } from '../game/data/materials';
import { battlesRemaining, legLine, successChance } from '../game/adventure';
import type { HeroInstId, MaterialBag, MaterialId } from '../game/types';
import type { DispatchResult } from '../stores/runStore';

/** 목록에 세울 영웅 한 명 — 화면은 HeroInstance 전체를 알 필요가 없다 */
export interface AdventureHero {
  instId: HeroInstId;
  name: string;
  level: number;
  star: number;
  /** 지금 파견 중인가 */
  away: boolean;
  /** 1군/2군에 편성돼 있는가 — 보내면 편성에서 빠진다는 경고를 띄운다 */
  inSquad: boolean;
}

export interface AdventureScreenProps {
  /** 지금까지 도달한 최고 층 id — 해금 판정 */
  maxFloorId: number;
  heroes: AdventureHero[];
  dispatches: Dispatch[];
  /** 지금까지 치른 전투 수 — 남은 전투 계산에 쓴다 */
  battleCount: number;
  onDispatch: (advId: AdventureId, heroIds: HeroInstId[]) => DispatchResult;
  onRecall: (index: number) => void;
  onBack: () => void;
}

/** 재료 주머니를 사람이 읽는 한 줄로 */
function materialLine(bag: MaterialBag): string {
  return (Object.entries(bag) as [MaterialId, number][])
    .map(([id, n]) => `${MATERIAL_DEFS[id]?.name ?? id} ×${n}`)
    .join(' · ');
}

/**
 * 모험 파견 화면.
 *
 * ── 왜 '전투 N회'로 쓰는가 ────────────────────────────
 * 이 게임에는 시계가 없다. "3분 남음"처럼 쓰면 플레이어가 앱을 닫고 기다리게 되는데
 * 실제로는 **탑을 올라야만** 줄어든다. 단위를 그대로 드러내야 "탑에 가면 돌아온다"가
 * 읽힌다 — 그게 모험을 등반에 붙들어 매는 유일한 장치다.
 */
export function AdventureScreen({
  maxFloorId, heroes, dispatches, battleCount, onDispatch, onRecall, onBack,
}: AdventureScreenProps) {
  const [picked, setPicked] = useState<AdventureId | null>(null);
  const [chosen, setChosen] = useState<HeroInstId[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const open = adventuresFor(maxFloorId);
  const locked = adventuresFor(999).filter((d) => !open.some((o) => o.id === d.id));

  /** 지금 고를 수 있는 영웅 — 나가 있는 사람은 뺀다 */
  const available = heroes.filter((h) => !h.away);

  const selectAdventure = (def: AdventureDef) => {
    setNotice(null);
    setChosen([]);
    setPicked(picked === def.id ? null : def.id);
  };

  const toggleHero = (id: HeroInstId, def: AdventureDef) => {
    setNotice(null);
    setChosen((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      // 정원을 넘기면 가장 오래된 선택을 밀어낸다 — 매번 해제시키는 것보다 손이 덜 간다
      const next = [...cur, id];
      return next.length > def.partySize ? next.slice(next.length - def.partySize) : next;
    });
  };

  const send = (def: AdventureDef) => {
    const r = onDispatch(def.id, chosen);
    if (!r.ok) {
      const msg: Record<string, string> = {
        'unknown-adventure': '없는 모험입니다.',
        locked: '아직 열리지 않았습니다.',
        'wrong-party-size': `${def.partySize}명을 골라야 합니다.`,
        'already-away': '이미 나가 있는 영웅입니다.',
        'dead-hero': '보낼 수 없는 영웅입니다.',
      };
      setNotice(msg[r.reason] ?? '보낼 수 없습니다.');
      return;
    }
    setNotice(`${def.name}으로 떠났습니다. ${def.duration}전투 후 돌아옵니다.`);
    setPicked(null);
    setChosen([]);
  };

  return (
    <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 16 }}>
        <span>모험 관문</span>
        <span>{dispatches.length > 0 ? `${dispatches.length}건 원정 중` : '원정 없음'}</span>
      </div>

      {/* ── 나가 있는 원정 ─────────────────────────────── */}
      {dispatches.length > 0 && (
        <>
          <SectionLabel>원정 중</SectionLabel>
          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            {dispatches.map((d, i) => {
              const def = adventuresFor(999).find((x) => x.id === d.advId);
              const left = battlesRemaining(d, battleCount);
              const done = def ? def.duration - left : 0;
              const names = d.heroIds
                .map((id) => heroes.find((h) => h.instId === id)?.name ?? '???')
                .join(', ');
              return (
                <SystemPanel key={`${d.advId}-${d.startedAtBattle}-${i}`} compact tone="warning">
                  <div style={{ fontSize: 14, letterSpacing: '.15em', marginBottom: 4 }}>
                    {def?.name ?? '알 수 없는 모험'}
                  </div>
                  <div style={{ fontSize: 11, color: T.dim, marginBottom: 8 }}>{names}</div>
                  {/*
                    ⚠️ **시간이 아니라 전투다.** "탑을 올라야 줄어든다"가 여기서 읽혀야
                    플레이어가 앱을 켜둔 채 기다리지 않는다.
                  */}
                  {/*
                    "귀환 대기" 분기는 없다 — 완료된 파견은 `finish()`에서 바로 빠지므로
                    이 목록에 있는 원정은 늘 남은 전투가 1 이상이다.
                  */}
                  <div style={{ fontSize: 13, color: T.gold, letterSpacing: '.1em', marginBottom: 6 }}>
                    탑 {left}전투 남음
                  </div>
                  {def && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                        <HpBar cur={done} max={def.duration} color={T.amber} w={140} h={4} />
                      </div>
                      {/* 진행 문장 — 결과를 암시하지 않는다(data/adventures.ts `legs`) */}
                      <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.8, marginBottom: 10 }}>
                        {legLine(def, done)}
                      </div>
                    </>
                  )}
                  <Button small onClick={() => onRecall(i)}>
                    즉시 복귀 (보상 포기)
                  </Button>
                </SystemPanel>
              );
            })}
          </div>
        </>
      )}

      {/* ── 보낼 수 있는 모험 ───────────────────────────── */}
      <SectionLabel>모험</SectionLabel>
      <div style={{ display: 'grid', gap: 12 }}>
        {open.map((def) => {
          const isPicked = picked === def.id;
          const ready = chosen.length === def.partySize;
          const party = available.filter((h) => chosen.includes(h.instId));
          const chance = ready ? successChance(def, party) : def.baseSuccess;

          return (
            <SystemPanel key={def.id} compact tone={isPicked ? 'rare' : 'normal'}>
              <div style={{ fontSize: 15, letterSpacing: '.18em', marginBottom: 4 }}>{def.name}</div>
              <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.05em', marginBottom: 10 }}>
                {def.desc}
              </div>

              <div style={{ fontSize: 12, marginBottom: 2 }}>
                {def.partySize}명 · 탑 {def.duration}전투
              </div>
              <div style={{ fontSize: 11, color: T.dim, marginBottom: 2 }}>
                성공 {Math.round(chance * 100)}%
                {ready && ' (고른 영웅 기준)'}
              </div>
              <div style={{ fontSize: 11, color: T.dim, marginBottom: 10 }}>
                {materialLine(def.reward.materials)}
                {def.reward.awakeningChance > 0 && ` · 각성석 ${Math.round(def.reward.awakeningChance * 100)}%`}
              </div>

              {!isPicked && (
                <Button small onClick={() => selectAdventure(def)}>영웅 고르기</Button>
              )}

              {isPicked && (
                <div>
                  <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.1em', marginBottom: 8 }}>
                    {chosen.length} / {def.partySize} 선택
                  </div>

                  {available.length === 0 && (
                    <div style={{ fontSize: 11, color: T.amber, marginBottom: 10 }}>
                      보낼 수 있는 영웅이 없습니다.
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                    {available.map((h) => {
                      const on = chosen.includes(h.instId);
                      return (
                        <button
                          key={h.instId}
                          type="button"
                          onClick={() => toggleHero(h.instId, def)}
                          style={{
                            minHeight: TOUCH_MIN,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            background: on ? T.panelHi : 'transparent',
                            border: `1px solid ${on ? T.gold : T.panelHi}`,
                            color: T.text,
                            font: 'inherit',
                            fontSize: 12,
                            letterSpacing: '.05em',
                            cursor: 'pointer',
                          }}
                        >
                          <span>{h.name}</span>
                          <span style={{ color: T.dim, fontSize: 11 }}>
                            ★{h.star} Lv.{h.level}
                            {/*
                              편성된 영웅을 보내면 파티가 빈다. 막지는 않는다 —
                              막으면 "보낼 사람이 없는데 이유를 모르는" 상태가 되고,
                              그건 교착과 같은 인상을 준다. 대신 경고만 한다.
                            */}
                            {h.inSquad && <span style={{ color: T.amber }}> · 편성 중</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <Button small onClick={() => send(def)} disabled={!ready}>
                    {ready ? '파견' : `${def.partySize}명 선택 필요`}
                  </Button>
                </div>
              )}
            </SystemPanel>
          );
        })}

        {/*
          잠긴 모험도 보여준다 — 무엇이 기다리는지 모르면 층을 오를 이유가 하나 준다.
          각성석이 균열에만 있다는 사실이 여기서 처음 눈에 띈다.
        */}
        {locked.map((def) => (
          <SystemPanel key={def.id} compact>
            <div style={{ fontSize: 14, letterSpacing: '.18em', color: T.dim, marginBottom: 4 }}>
              {def.name}
            </div>
            <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.1em' }}>
              {def.unlockFloor}층 도달 시 열림
            </div>
          </SystemPanel>
        ))}
      </div>

      {notice && (
        <div style={{ marginTop: 14 }}>
          <SystemPanel compact tone="warning">
            <div style={{ fontSize: 12 }}>{notice}</div>
          </SystemPanel>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <Button onClick={onBack}>돌아가기</Button>
      </div>
    </div>
  );
}
