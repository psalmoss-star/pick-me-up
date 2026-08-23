import { HeroCard } from '../ui/HeroCard';
import { SystemPanel } from '../ui/SystemPanel';
import { tabSafePadding } from '../ui/TabBar';
import { TOUCH_MIN } from '../ui/Button';
import { useViewport } from '../ui/useViewport';
import { heroArtOf } from '../ui/artMap';
import { heroVariantOf } from '../ui/art/heroImages';
import { T } from '../ui/tokens';
import { SQUAD_OPEN_ROSTER } from '../game/data/party';
import { klassFor } from '../game/stats';
import { displayName } from '../game/identity';
import { livingHeroes } from '../game/roster';
import { estimatePotential } from '../game/reveal';
import { gameData } from '../game/data';
import type { HeroInstId, HeroInstance } from '../game/types';

export interface RosterScreenProps {
  roster: HeroInstance[];
  squads: HeroInstId[][];
  /** 지금 편성 중인 군 */
  editing: number;
  onEditingChange: (squad: number) => void;
  /** 층별 정원 */
  partyLimit: number;
  /** 2군이 열렸는가 */
  squadsUnlocked: boolean;
  /** 잠긴 군(직전 전투 출전) */
  lockedSquad: number | null;
  onToggleParty: (squad: number, id: HeroInstId) => void;
  onInspect: (hero: HeroInstance) => void;
}

/**
 * 영웅 전체 — 로스터 편성 전용 화면.
 *
 * ── 왜 대기실에서 떼어냈나 ─────────────────────────────
 * 카드가 237px이고 2열이라 로스터 5명이면 1185px, 10명이면 2400px대다.
 * 대기실에 두면 마을·다음 층·주 동선이 전부 그 아래로 밀려서
 * **`탑 입장`에 닿는 데 711px을 스크롤해야 했다**(실측).
 * 카드를 줄이는 선택지는 없다 — 타로카드형이고 등급을 구조로 표현해야 한다.
 * 그래서 화면을 나눈다. 여기서는 길어져도 된다. 이 화면의 목적이 그것이므로.
 */
export function RosterScreen({
  roster, squads, editing, onEditingChange, partyLimit, squadsUnlocked, lockedSquad, onToggleParty, onInspect,
}: RosterScreenProps) {
  const alive = livingHeroes(roster);
  const { width } = useViewport();
  // 대기실과 같은 산식 — 두 화면의 카드 크기가 갈리면 같은 영웅이 달라 보인다.
  const cardWidth = Math.max(112, Math.min(150, Math.floor((Math.min(width, 480) - 42) / 2)));

  return (
    // 하단 여백은 sticky 바 높이만큼 — 없으면 마지막 카드가 바 뒤에 가린다
    <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 18 }}>
        <span>영웅</span>
        <span>생존 {alive.length} / {roster.length}</span>
      </div>

      {/*
        1군/2군 전환 버튼. 2군 미개방이어도 버튼을 숨기지 않고 조건을 적는다 —
        숨기면 "그런 기능이 없다"로 읽힌다(시설이 잠긴 채 열려 오독됐던 것과 같은 함정).
      */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[0, 1].map((i) => {
          const locked = lockedSquad === i;
          const unavailable = i === 1 && !squadsUnlocked;
          const label = i === 0 ? '1군' : '2군';
          const role = i === 0 ? '최전선' : '파밍';
          return (
            <button
              key={i}
              onClick={() => !unavailable && onEditingChange(i)}
              disabled={unavailable}
              style={{
                flex: 1,
                minHeight: TOUCH_MIN,
                padding: '8px 6px',
                background: editing === i ? T.panelHi : 'transparent',
                border: `1px solid ${editing === i ? T.gold : T.panelHi}`,
                color: unavailable ? T.dim : T.text,
                fontFamily: 'inherit',
                fontSize: 12,
                cursor: unavailable ? 'default' : 'pointer',
                textAlign: 'center',
                lineHeight: 1.6,
              }}
            >
              {unavailable
                ? `${label} 🔒 로스터 ${SQUAD_OPEN_ROSTER}인부터`
                : `${label} ${squads[i].length}/${partyLimit}${locked ? ' 🔒' : ''}`}
              <br />
              <span style={{ fontSize: 10, color: T.dim }}>{role}</span>
            </button>
          );
        })}
      </div>

      {/* 잠긴 군은 사유를 함께 띄운다. 설명 없이 안 눌리면 고장으로 읽힌다. */}
      {lockedSquad === editing && (
        <div style={{ textAlign: 'center', fontSize: 11, color: T.dim, marginBottom: 12, lineHeight: 1.8 }}>
          직전 전투에 나갔습니다.
          <br />
          다음 전투까지 편성할 수 없습니다.
        </div>
      )}

      {/*
        전멸 상태. 안내 없이 그리드만 비면 화면이 고장난 것으로 읽힌다.
        (사망자를 목록에서 뺐으므로 이제 실제로 도달 가능한 상태다)
      */}
      {alive.length === 0 && (
        <SystemPanel>
          <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, padding: '10px 0' }}>
            살아있는 영웅이 없습니다.
            <br />
            소환소에서 새 영웅을 맞이하십시오.
          </div>
        </SystemPanel>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 18,
          justifyItems: 'center',
          marginBottom: 10,
        }}
      >
        {alive.map((h) => {
          const def = gameData.heroes[h.defId];
          const memberOf = squads.findIndex((m) => m.includes(h.instId));
          return (
            <div key={h.instId} style={{ textAlign: 'center' }}>
              <HeroCard
                name={displayName(h, gameData.heroes)}
                star={h.star}
                element={def.element}
                art={heroArtOf(h.defId)}
                defId={h.defId}
                level={h.level}
                klass={klassFor(h.star)}
                width={cardWidth}
                selected={memberOf === editing}
                squad={memberOf === -1 ? undefined : ((memberOf + 1) as 1 | 2)}
                favorite={h.favorite}
                reveal={estimatePotential(h).progress}
                variant={heroVariantOf(h)}
                onClick={() => onToggleParty(editing, h.instId)}
              />
              <button
                onClick={() => onInspect(h)}
                style={{
                  marginTop: 2,
                  minHeight: TOUCH_MIN,
                  minWidth: 64,
                  padding: '10px 16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: T.dim,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                상세
              </button>
            </div>
          );
        })}
      </div>

      {/*
        사망자를 여기서 뺐으므로 어디로 갔는지 반드시 말해줘야 한다.
        말 없이 사라지면 "내 영웅이 없어졌다"로 읽힌다 — 퍼머데스는
        숨기는 것이 아니라 무덤에 남기는 것이다.
      */}
      <div style={{ textAlign: 'center', color: T.dim, fontSize: 11, marginBottom: 12, lineHeight: 1.8 }}>
        카드를 눌러 편성
        <br />
        사망한 영웅은 되살릴 수 없으며 무덤에 기록됩니다
      </div>

      {/*
        ⚠️ 여기 있던 sticky `대기실로` 버튼을 뺐다.
        하단에 떠 있어서 **마지막 줄 카드를 덮고 있었다**(폰 스크린샷에서 발견) —
        스크롤을 내려도 따라오므로 가려진 카드는 영영 안 보였다.
        돌아갈 길은 이제 `App.tsx`의 상시 탭 바('대기실')가 대신한다.
      */}
    </div>
  );
}
