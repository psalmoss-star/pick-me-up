import { useRef, useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { tabSafePadding } from '../ui/TabBar';
import { Button, HpBar, TOUCH_MIN } from '../ui/Button';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import {
  FACILITY_META, FACILITY_MAX_LEVEL, upgradeCost,
  restHealRate, armoryAtkMult, idleExpWithAssign, ASSIGN_SLOTS, ASSIGNABLE,
  type FacilityKind, type AssignableFacility,
} from '../game/data/facilities';
import { fuseEfficiency } from '../game/progression';
import type { Wallet } from '../game/types';
import type { FacilityUpgradeResult, RestResult } from '../stores/runStore';

export interface FacilityScreenProps {
  facilities: Record<FacilityKind, number>;
  wallet: Wallet;
  onUpgrade: (kind: FacilityKind) => FacilityUpgradeResult;
  onBack: () => void;
  /**
   * 마을에서 어느 건물을 눌러 들어왔는가 — 그 카드로 스크롤하고 강조한다.
   *
   * ⚠️ 이게 없어서 숙소를 눌러도 **4개 카드가 그냥 다 나왔다.** 화면 안에 포커스
   * 기계(`focus`/`cardRefs`)는 이미 있었는데 이 화면에 박혀 있던 두 번째 부감 맵으로만
   * 구동돼서, 정작 마을에서 온 진입에는 죽어 있었다(실기기에서 발견).
   */
  initialFocus?: FacilityKind;
  /**
   * 숙소 휴식 — 금을 내고 부상을 즉시 지운다.
   *
   * 비용·부상자 수는 화면이 계산하지 않고 받는다. HP 산식이 두 곳에 생기면
   * 표시와 실제 청구액이 갈린다(합성소에서 겪은 함정과 같다).
   */
  onRest?: () => RestResult;
  /** 지금 휴식에 드는 금. 부상자가 없으면 null */
  restCost: number | null;
  /** 부상자 수 */
  restInjured: number;
  /**
   * 훈련 중인(=1군에 없는 생존) 영웅들.
   *
   * ⚠️ **훈련소에는 누를 것도 볼 것도 없었다.** 층을 깰 때 조용히 유휴 exp가
   * 들어갈 뿐이라, 시설을 올려도 무슨 일이 일어나는지 화면에 흔적이 없었다.
   * 숙소가 `onRest`로 "장소"가 된 것처럼(이 파일 아래 주석 참조),
   * 훈련소는 **누가 크고 있는지**를 보여주는 것으로 장소가 된다.
   */
  trainees?: Trainee[];
  /**
   * 시설 배치 — 잉여 영웅의 세 번째 출구(제물·파견에 이어).
   *
   * 배치자는 유휴 exp를 받지 않는 대신 그 시설의 산출을 올린다.
   * 훈련소·합성소만 받는다 — 숙소·무기창고는 전투력에 직접 닿아
   * 배치가 승률을 밀어 올리기 때문이다.
   */
  assignments?: Record<AssignableFacility, string[]>;
  /** 배치 가능한(=살아있고 파견·배치 안 된) 영웅. 이름과 함께 받는다 */
  assignable?: { instId: string; name: string; level: number }[];
  onAssign?: (kind: AssignableFacility, instId: string) => void;
  onUnassign?: (instId: string) => void;
}

/** 훈련소에 표시할 대기 영웅 한 명 */
export interface Trainee {
  instId: string;
  name: string;
  level: number;
  /** 다음 레벨까지 남은 exp. 만렙이면 null */
  toNext: number | null;
  /** 다음 레벨까지 필요한 총량 — 진행 바의 분모 */
  need: number;
  /** 현재 누적 exp */
  exp: number;
}

const ORDER: FacilityKind[] = ['rest', 'training', 'forge', 'armory'];

/**
 * 시설별 현재 효과를 사람이 읽는 문장으로.
 *
 * 화면이 수치를 직접 계산하지 않고 data/facilities.ts의 함수를 부른다 —
 * 밸런스 수치가 두 곳으로 갈라지면 표시와 실제가 어긋난다.
 */
function effectText(kind: FacilityKind, level: number, assigned = 0): string {
  switch (kind) {
    case 'rest':
      return `층 사이 회복 ${Math.round(restHealRate(level) * 100)}%`;
    case 'training': {
      // 배치 인원이 반영된 값이다 — 화면이 따로 더하면 실제 지급과 갈라진다
      const exp = idleExpWithAssign(level, assigned);
      return exp === 0 ? '유휴 경험치 없음' : `대기 영웅 층당 +${exp} exp`;
    }
    case 'forge': {
      // 수치는 반드시 progression의 함수에서 가져온다. 여기서 다시 계산하면
      // 표시와 실제가 갈라진다.
      const pct = Math.round(fuseEfficiency(level, assigned) * 100);
      return `전환율 ${pct}%`;
    }
    case 'armory': {
      const pct = Math.round((armoryAtkMult(level) - 1) * 100);
      return pct === 0 ? '공격력 보정 없음' : `파티 공격력 +${pct}%`;
    }
  }
}

/** 다음 레벨에서 무엇이 좋아지는지 — 투자 판단의 근거 */
function nextText(kind: FacilityKind, level: number, assigned = 0): string | null {
  if (level >= FACILITY_MAX_LEVEL) return null;
  return effectText(kind, level + 1, assigned);
}

/** 배치를 받는 시설인가 */
function isAssignable(kind: FacilityKind): kind is AssignableFacility {
  return (ASSIGNABLE as readonly FacilityKind[]).includes(kind);
}

/**
 * 대기실 시설. STEP 6.
 *
 * 숙소는 층간 회복이므로 **탑에 오르기 전에** 의미가 생긴다.
 * 그래서 효과를 현재값과 다음값으로 나란히 보여준다 — 투자 판단이 화면에서 끝나야 한다.
 */
export function FacilityScreen({
  facilities, wallet, onUpgrade, onBack, initialFocus, onRest, restCost, restInjured,
  trainees = [],
  assignments = { training: [], forge: [] },
  assignable = [], onAssign, onUnassign,
}: FacilityScreenProps) {
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 마을에서 고른 시설. 해당 카드로 스크롤하고 강조만 한다.
   *
   * 여기서 바로 업그레이드하지 않는 이유: 업그레이드는 되돌릴 수 없는 금 소비라
   * 효과·비용·다음 단계를 **보고 나서** 눌러야 한다. 마을은 '어디로 갈까'를 고르는 곳이고
   * 결정은 카드에서 한다.
   */
  const [focus] = useState<FacilityKind | null>(initialFocus ?? null);
  const cardRefs = useRef<Partial<Record<FacilityKind, HTMLDivElement | null>>>({});

  /*
    스크롤(`scrollIntoView`)은 쓰지 않는다 — 누른 시설을 목록 맨 위로 올리므로
    이미 첫 화면에 보인다. 여기서 또 스크롤하면 머리글이 화면 밖으로 밀려
    "어느 시설로 들어왔는지"가 오히려 안 보인다.
  */

  /** 만렙이 아닌 시설이 남아 있는데 그중 무엇도 살 수 없는 상태인가 */
  const nothingAffordable = ORDER.some((k) => upgradeCost(facilities[k]) != null)
    && ORDER.every((k) => {
      const cost = upgradeCost(facilities[k]);
      return cost == null || wallet.gold < cost;
    });

  const doUpgrade = (kind: FacilityKind) => {
    const r = onUpgrade(kind);
    if (!r.ok) {
      setNotice(
        r.reason === 'max-level'
          ? `${FACILITY_META[kind].name}은(는) 이미 최대 단계입니다.`
          : '금이 부족합니다.',
      );
      return;
    }
    setNotice(`${FACILITY_META[kind].name} Lv.${r.level} — ${effectText(kind, r.level)} (금 ${r.spent} 소모)`);
  };

  /**
   * 누른 시설을 맨 위로 올린다.
   *
   * 나머지 셋을 숨기지는 않는다 — 시설끼리 금을 두고 경쟁하므로 무엇이 덜 자랐는지
   * 같이 보여야 투자 판단이 화면에서 끝난다(§5-6: 허전하다고 빼지 말 것).
   * 다만 **누른 것이 첫 화면에 보여야** 건물마다 다른 화면으로 읽힌다.
   */
  const ordered = focus ? [focus, ...ORDER.filter((k) => k !== focus)] : ORDER;

  const doRest = () => {
    if (!onRest) return;
    const r = onRest();
    if (!r.ok) {
      setNotice(r.reason === 'already-full' ? '모두 만전입니다.' : '금이 부족합니다.');
      return;
    }
    setNotice(`${r.heroes}명이 회복했습니다. HP +${r.healed} (금 ${r.spent} 소모)`);
  };

  return (
    <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
      {/*
        머리글에 **누른 건물 이름**을 쓴다. 숙소를 눌렀는데 '시설'이라고만 떠 있으면
        훈련소를 눌렀을 때와 화면이 구분되지 않는다 — 실기기에서 "숙소랑 훈련소는
        같은 화면"으로 읽힌 이유다.
      */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 16 }}>
        <span>{focus ? FACILITY_META[focus].name : '시설'}</span>
        <span>금 {wallet.gold.toLocaleString()}</span>
      </div>

      <SectionLabel>대기실</SectionLabel>

      {/*
        ⚠️ 여기에 부감 맵(`BaseMap`)을 두지 않는다.
        이 화면은 **마을 부감도에서 건물을 눌러** 오는 곳이다. 방금 지도에서 고르고
        들어왔는데 또 지도가 나오면 같은 선택을 두 번 시키는 셈이고,
        그 두 번째 지도는 방금 무엇을 골랐는지도 기억하지 못했다
        (실기기에서 "쓸데없는 화면들"로 보고됨).
      */}
      <div style={{ display: 'grid', gap: 12 }}>
        {ordered.map((kind) => {
          const level = facilities[kind];
          const cost = upgradeCost(level);
          const maxed = cost == null;
          const affordable = !maxed && wallet.gold >= cost;
          // 배치를 안 받는 시설은 항상 0이라 기존 표시와 완전히 같다
          const assignedHere = isAssignable(kind) ? assignments[kind] : [];
          const next = nextText(kind, level, assignedHere.length);

          return (
            /*
              ref는 SystemPanel이 아니라 바깥 div가 받는다 —
              SystemPanel은 ref를 전달하지 않으므로 여기 감싸는 게 유일하게 안전하다.
            */
            <div
              key={kind}
              ref={(el) => { cardRefs.current[kind] = el; }}
              style={{
                // 맵에서 고른 시설을 카드에서도 알아볼 수 있게. 색은 토큰만 쓴다.
                outline: focus === kind ? `1px solid ${T.gold}` : 'none',
                outlineOffset: 3,
                transition: 'outline-color 200ms',
              }}
            >
            <SystemPanel compact tone={maxed ? 'rare' : 'normal'}>
              <div style={{ fontSize: 15, letterSpacing: '.18em', marginBottom: 4 }}>
                {FACILITY_META[kind].name}
              </div>
              <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.1em', marginBottom: 10 }}>
                {FACILITY_META[kind].desc}
              </div>

              {/* 등급 표현과 같은 원리 — 단계는 색이 아니라 칸으로 보인다 */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
                {Array.from({ length: FACILITY_MAX_LEVEL }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 26, height: 4,
                      background: i < level ? T.gold : T.panelHi,
                      boxShadow: i < level ? `0 0 8px ${T.gold}66` : 'none',
                    }}
                  />
                ))}
              </div>

              <div style={{ fontSize: 13, marginBottom: 2 }}>
                Lv.{level} · {effectText(kind, level, assignedHere.length)}
              </div>

              {next && (
                <div style={{ fontSize: 11, color: T.dim, marginBottom: 12 }}>
                  다음 단계 → {next}
                </div>
              )}
              {maxed && (
                <div style={{ fontSize: 11, color: T.gold, letterSpacing: '.2em', marginBottom: 12 }}>
                  최대 단계
                </div>
              )}

              {!maxed && (
                <Button small onClick={() => doUpgrade(kind)} disabled={!affordable}>
                  {affordable ? `강화 · 금 ${cost}` : `금 ${cost} 필요`}
                </Button>
              )}

              {/*
                숙소만 '휴식'을 가진다 — 시설 레벨(자동 회복률)과 별개로
                지금 금을 써서 부상을 지우는 **행동**이다. 시설이 수치 표가 아니라
                장소로 읽히려면 누를 것이 있어야 한다.
              */}
              {/*
                훈련소 — 지금 크고 있는 영웅을 보여준다.

                수치 표가 아니라 장소로 읽히려면 **여기서 무슨 일이 일어나는지**가
                보여야 한다. 유휴 exp는 원래도 들어가고 있었지만 화면에 흔적이 없어서
                "그냥 올라간다 설정하고 끝"으로 읽혔다.
              */}
              {kind === 'training' && (
                <div style={{ marginTop: 10, borderTop: `1px solid ${T.panelHi}`, paddingTop: 10 }}>
                  {level === 0 ? (
                    <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>
                      아직 아무도 훈련하지 않는다 — 강화하면 대기 영웅이 층마다 성장한다
                    </div>
                  ) : trainees.length === 0 ? (
                    <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>
                      대기 중인 영웅이 없다 — 파티에서 빠진 영웅이 여기서 큰다
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: T.dim, marginBottom: 8, letterSpacing: '.1em' }}>
                        훈련 중 {trainees.length}명 · 층당 +{idleExpWithAssign(level, assignedHere.length)} exp
                      </div>
                      <div style={{ display: 'grid', gap: 7 }}>
                        {trainees.map((t) => (
                          <div key={t.instId}>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between',
                              fontSize: 12, marginBottom: 3,
                            }}>
                              <span>{t.name}</span>
                              <span style={{ color: T.dim }}>
                                Lv.{t.level}
                                {t.toNext == null ? ' · 만렙' : ` · ${t.toNext} exp 남음`}
                              </span>
                            </div>
                            {t.toNext != null && (
                              <HpBar cur={t.exp} max={t.need} color={T.gold} w="100%" h={4} />
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/*
                배치 — 잉여 영웅의 세 번째 출구.

                제물이 "갈아 없앤다"라면 배치는 "곁에 두고 일을 시킨다"다.
                둘 다 있어야 선택이 되므로 같은 무게로 보여야 한다.

                ⚠️ **배치자는 성장하지 않는다**는 것을 문구로 밝힌다. 화면에 안 적으면
                플레이어는 "왜 얘만 exp가 안 오르지"를 버그로 읽는다.
              */}
              {isAssignable(kind) && onAssign && onUnassign && (
                <div style={{ marginTop: 10, borderTop: `1px solid ${T.panelHi}`, paddingTop: 10 }}>
                  <div style={{
                    fontSize: 11, color: T.dim, marginBottom: 8, letterSpacing: '.1em',
                  }}>
                    배치 {assignedHere.length}/{ASSIGN_SLOTS[kind]} · 성장 대신 산출
                  </div>

                  <div style={{ display: 'grid', gap: 6 }}>
                    {assignedHere.map((id) => {
                      const who = assignable.find((a) => a.instId === id);
                      return (
                        <div
                          key={id}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            gap: 8, fontSize: 12,
                          }}
                        >
                          <span>{who ? `${who.name} Lv.${who.level}` : '—'}</span>
                          <Button small onClick={() => onUnassign(id)}>해제</Button>
                        </div>
                      );
                    })}
                  </div>

                  {assignedHere.length < ASSIGN_SLOTS[kind] && (
                    <div style={{ marginTop: assignedHere.length > 0 ? 8 : 0 }}>
                      {assignable.length === 0 ? (
                        <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>
                          배치할 수 있는 영웅이 없다
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {assignable.map((a) => (
                            <Button key={a.instId} small onClick={() => onAssign(kind, a.instId)}>
                              {a.name} 배치
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {kind === 'rest' && onRest && (
                <div style={{ marginTop: 10, borderTop: `1px solid ${T.panelHi}`, paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: T.dim, marginBottom: 8, lineHeight: 1.7 }}>
                    {restCost == null
                      ? '전원 만전입니다'
                      : `부상 ${restInjured}명 · 금 ${restCost}`}
                  </div>
                  <Button
                    small
                    onClick={doRest}
                    disabled={restCost == null || wallet.gold < restCost}
                  >
                    {restCost == null
                      ? '휴식 불필요'
                      : wallet.gold >= restCost ? `휴식 · 금 ${restCost}` : `금 ${restCost} 필요`}
                  </Button>
                </div>
              )}
            </SystemPanel>
            </div>
          );
        })}
      </div>

      {notice && (
        <div style={{ marginTop: 16 }}>
          <SystemPanel compact tone="rare">
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>{notice}</div>
          </SystemPanel>
        </div>
      )}

      {/*
        아무것도 살 수 없을 때만 금의 출처를 알려준다.
        전부 잠긴 화면에 설명이 없으면 "아직 못 들어가는 컨텐츠"로 읽힌다 — 실제로 겪었다.
        살 수 있는 게 하나라도 있으면 노이즈이므로 띄우지 않는다.
      */}
      {nothingAffordable && (
        <div style={{ marginTop: 16 }}>
          <SystemPanel compact tone="warning">
            <div style={{ fontSize: 12, lineHeight: 1.8, color: T.dim }}>
              금이 부족합니다.<br />
              금은 <span style={{ color: T.text }}>탑의 층을 돌파</span>하면 들어옵니다.
            </div>
          </SystemPanel>
        </div>
      )}

      <div style={{ marginTop: 20, textAlign: 'center', minHeight: TOUCH_MIN }}>
        <Button onClick={onBack}>돌아가기</Button>
      </div>
    </div>
  );
}
