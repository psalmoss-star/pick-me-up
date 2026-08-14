import { useRef, useState } from 'react';
import { SystemPanel } from '../ui/SystemPanel';
import { BaseMap } from '../ui/BaseMap';
import { Button, TOUCH_MIN } from '../ui/Button';
import { T } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import {
  FACILITY_META, FACILITY_MAX_LEVEL, upgradeCost,
  restHealRate, armoryAtkMult, idleExpGain,
  type FacilityKind,
} from '../game/data/facilities';
import { fuseEfficiency } from '../game/progression';
import type { Wallet } from '../game/types';
import type { FacilityUpgradeResult } from '../stores/runStore';

export interface FacilityScreenProps {
  facilities: Record<FacilityKind, number>;
  wallet: Wallet;
  onUpgrade: (kind: FacilityKind) => FacilityUpgradeResult;
  onBack: () => void;
  /** 무덤으로. 부감 맵에서 무덤을 누르면 호출된다 */
  onOpenGrave: () => void;
  /**
   * 소환소·상점으로. 부감 맵은 이 화면에도 있으므로 여기서도 눌린다 —
   * 대응 카드가 없다고 무시하면 '눌리지 않는 건물'이 되어 지도가 거짓말을 한다.
   */
  onOpenSummon: () => void;
  onOpenShop: () => void;
  /** 잃은 영웅 수 — 무덤에 비석이 몇 개 서는지 */
  deathCount: number;
}

const ORDER: FacilityKind[] = ['rest', 'training', 'forge', 'armory'];

/**
 * 시설별 현재 효과를 사람이 읽는 문장으로.
 *
 * 화면이 수치를 직접 계산하지 않고 data/facilities.ts의 함수를 부른다 —
 * 밸런스 수치가 두 곳으로 갈라지면 표시와 실제가 어긋난다.
 */
function effectText(kind: FacilityKind, level: number): string {
  switch (kind) {
    case 'rest':
      return `층 사이 회복 ${Math.round(restHealRate(level) * 100)}%`;
    case 'training': {
      const exp = idleExpGain(level);
      return exp === 0 ? '유휴 경험치 없음' : `대기 영웅 층당 +${exp} exp`;
    }
    case 'forge': {
      // 수치는 반드시 progression의 함수에서 가져온다. 여기서 다시 계산하면
      // 표시와 실제가 갈라진다. clamp 때문에 미건설도 Lv.1과 같은 전환율이다.
      const pct = Math.round(fuseEfficiency(level) * 100);
      return level === 0 ? `전환율 ${pct}% (기본)` : `전환율 ${pct}%`;
    }
    case 'armory': {
      const pct = Math.round((armoryAtkMult(level) - 1) * 100);
      return pct === 0 ? '공격력 보정 없음' : `파티 공격력 +${pct}%`;
    }
  }
}

/** 다음 레벨에서 무엇이 좋아지는지 — 투자 판단의 근거 */
function nextText(kind: FacilityKind, level: number): string | null {
  if (level >= FACILITY_MAX_LEVEL) return null;
  return effectText(kind, level + 1);
}

/**
 * 대기실 시설. STEP 6.
 *
 * 숙소는 층간 회복이므로 **탑에 오르기 전에** 의미가 생긴다.
 * 그래서 효과를 현재값과 다음값으로 나란히 보여준다 — 투자 판단이 화면에서 끝나야 한다.
 */
export function FacilityScreen({
  facilities, wallet, onUpgrade, onBack, onOpenGrave, onOpenSummon, onOpenShop, deathCount,
}: FacilityScreenProps) {
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 부감 맵에서 고른 시설. 해당 카드로 스크롤하고 강조만 한다.
   *
   * 맵에서 바로 업그레이드하지 않는 이유: 업그레이드는 되돌릴 수 없는 금 소비라
   * 효과·비용·다음 단계를 **보고 나서** 눌러야 한다. 맵은 '어디로 갈까'를 고르는 곳이고
   * 결정은 카드에서 한다.
   */
  const [focus, setFocus] = useState<FacilityKind | null>(null);
  const cardRefs = useRef<Partial<Record<FacilityKind, HTMLDivElement | null>>>({});

  const selectOnMap = (kind: FacilityKind) => {
    setFocus(kind);
    cardRefs.current[kind]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

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

  return (
    <div style={{ padding: '14px 12px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 16 }}>
        <span>시설</span>
        <span>금 {wallet.gold.toLocaleString()}</span>
      </div>

      <SectionLabel>대기실</SectionLabel>

      {/*
        거점 부감 맵. 시설이 '항목'이 아니라 '장소'로 읽히게 하는 것이 목적이다.
        정보는 아래 카드와 같지만, 레벨이 건물 높이·창·깃발로 보이므로
        한눈에 "무엇이 덜 자랐나"가 잡힌다.
      */}
      <div style={{ marginBottom: 18 }}>
        <BaseMap
          facilities={facilities}
          selected={focus}
          deathCount={deathCount}
          onSelect={(spot) => {
            // 무덤은 시설이 아니다 — 강조·스크롤이 아니라 화면 전환이다.
            if (spot === 'grave') { onOpenGrave(); return; }
            // 소환소·상점도 시설이 아니다 — 각자 화면으로 바로 보낸다.
            if (spot === 'summon') { onOpenSummon(); return; }
            if (spot === 'shop') { onOpenShop(); return; }
            selectOnMap(spot);
          }}
        />
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {ORDER.map((kind) => {
          const level = facilities[kind];
          const cost = upgradeCost(level);
          const maxed = cost == null;
          const affordable = !maxed && wallet.gold >= cost;
          const next = nextText(kind, level);

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
                Lv.{level} · {effectText(kind, level)}
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
