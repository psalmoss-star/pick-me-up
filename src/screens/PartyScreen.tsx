import { SystemPanel } from '../ui/SystemPanel';
import { tabSafePadding } from '../ui/TabBar';
import { Button, TOUCH_MIN } from '../ui/Button';
import { HeroCard } from '../ui/HeroCard';
import { useViewport } from '../ui/useViewport';
import { heroArtOf } from '../ui/artMap';
import { heroVariantOf } from '../ui/art/heroImages';
import { T, ELEMENT_KR, ELEMENT_TINT } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { SQUAD_OPEN_ROSTER } from '../game/data/party';
import { LINE_KR } from '../game/data/formation';
import { formationOf, elementSpread, pickAutoParty } from '../game/formation';
import { heroPower, partyPower } from '../game/power';
import { sortRoster } from '../game/rosterSort';
import { klassFor } from '../game/stats';
import { displayName } from '../game/identity';
import { livingHeroes } from '../game/roster';
import { estimatePotential } from '../game/reveal';
import { gameData } from '../game/data';
import type { HeroInstId, HeroInstance } from '../game/types';

export interface PartyScreenProps {
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
  /** 탑(층 선택)으로. 파티가 비면 호출부가 막는다 */
  onSortie: () => void;
}

/**
 * 파티 — 편성과 출전.
 *
 * ── 왜 영웅 탭과 나눴나 ─────────────────────────────
 * 예전에는 영웅 목록과 편성이 한 화면(`RosterScreen`)이었고, 탭 3개가 전부 거기로 갔다.
 * 탭 이름만 다르고 내용이 같아 **세 탭이 구별되지 않았다**(실기기 보고).
 * 여기는 "누구를 내보낼까"만 다룬다. 개체 정보는 상태창 탭이 맡는다.
 */
export function PartyScreen({
  roster, squads, editing, onEditingChange, partyLimit,
  squadsUnlocked, lockedSquad, onToggleParty, onInspect, onSortie,
}: PartyScreenProps) {
  const alive = livingHeroes(roster);
  /*
    영웅 탭의 **기본 정렬과 같게** 맞춘다. 예전엔 원본 배열 순서라
    같은 로스터가 두 화면에서 다른 순서로 나왔다 — 편성하러 넘어오면
    방금 본 목록과 배치가 달라 같은 영웅을 다시 찾아야 했다.

    여기엔 정렬 선택 UI를 두지 않는다. 이 화면은 이미 진형·통계·버튼으로
    세로가 빡빡하고(375×667), 편성의 관심사는 "누가 센가" 하나다.
  */
  const sorted = sortRoster(alive, 'power', gameData.heroes, gameData.starScaling);
  const { width } = useViewport();
  // 대기실·영웅 탭과 같은 산식 — 화면마다 카드 크기가 갈리면 같은 영웅이 달라 보인다
  const cardWidth = Math.max(112, Math.min(150, Math.floor((Math.min(width, 480) - 42) / 2)));

  const locked = lockedSquad === editing;
  const members = (squads[editing] ?? [])
    .map((id) => alive.find((h) => h.instId === id))
    .filter((h): h is HeroInstance => !!h);

  const slots = formationOf(members, gameData.heroes, gameData.starScaling);
  const powers = slots.map((s) => s.power);
  const total = partyPower(powers);
  const avgLevel = members.length
    ? Math.round(members.reduce((n, h) => n + h.level, 0) / members.length)
    : 0;
  const spread = elementSpread(members, gameData.heroes);

  const doAuto = () => {
    if (locked) return;
    // 이미 편성된 사람은 빼지 않고, 빈 자리만 전투력 순으로 채운다.
    const room = partyLimit - members.length;
    if (room <= 0) return;
    const taken = new Set(squads.flat());
    const free = alive.filter((h) => !taken.has(h.instId));
    for (const id of pickAutoParty(free, gameData.heroes, gameData.starScaling, room)) {
      // 정원·잠금·중복 판정은 스토어가 정본이다 — 여기서 다시 판정하지 않는다
      onToggleParty(editing, id);
    }
  };

  return (
    <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 16 }}>
        <span>파티</span>
        <span>{members.length} / {partyLimit}</span>
      </div>

      {/*
        1군/2군 전환. 2군 미개방이어도 버튼을 숨기지 않고 조건을 적는다 —
        숨기면 "그런 기능이 없다"로 읽힌다.
      */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[0, 1].map((i) => {
          const isLocked = lockedSquad === i;
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
                : `${label} ${squads[i].length}/${partyLimit}${isLocked ? ' 🔒' : ''}`}
              <br />
              <span style={{ fontSize: 10, color: T.dim }}>{role}</span>
            </button>
          );
        })}
      </div>

      {locked && (
        <div style={{ textAlign: 'center', fontSize: 11, color: T.dim, marginBottom: 12, lineHeight: 1.8 }}>
          직전 전투에 나갔습니다.
          <br />
          다음 전투까지 편성할 수 없습니다.
        </div>
      )}

      <SectionLabel>진형</SectionLabel>

      {/*
        슬롯 줄. 정원만큼만 그린다 — 정원 3 구간에서 5칸을 그리고 2칸을 회색으로 두면
        "정원이 5인데 왜 못 넣지"로 읽힌다.
        ⚠️ 375px에서 5칸은 칸당 ~67px이라 이름이 잘린다. 가로 스크롤로 흘린다.
      */}
      <div style={{ overflowX: 'auto', marginBottom: 6, WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: members.length ? 'flex-start' : 'center', minWidth: 'min-content', padding: '2px 0 6px' }}>
          {Array.from({ length: partyLimit }, (_, i) => {
            const slot = slots[i];
            return (
              <div
                key={i}
                style={{
                  /*
                    이름이 두 줄로 접히지 않을 만큼은 줘야 한다 — 72px에서는
                    '북풍의 리엔'이 칸을 꽉 채워 답답했다(실기기 확인).
                    가로 스크롤이므로 넓혀도 넘치지 않는다.
                  */
                  width: 92,
                  flexShrink: 0,
                  border: `1px solid ${slot ? T.panelHi : T.panelHi}`,
                  borderStyle: slot ? 'solid' : 'dashed',
                  padding: '8px 4px',
                  textAlign: 'center',
                  minHeight: TOUCH_MIN + 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 9, color: T.dim, letterSpacing: '.1em' }}>
                  {slot ? LINE_KR[slot.line] : ' '}
                </div>
                <div style={{ fontSize: 11, color: slot ? T.text : T.dim, lineHeight: 1.3, wordBreak: 'keep-all' }}>
                  {slot ? displayName(slot.hero, gameData.heroes) : '＋'}
                </div>
                {slot && (
                  <div style={{ fontSize: 9, color: T.gold }}>{slot.power.toLocaleString()}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/*
        ⚠️ 배치는 역할에서 자동으로 정해진다. 사용자가 바꿀 수 없다 —
        전투 엔진에 위치 개념이 없으므로(탱커 우선 피격만 있다) 바꿀 수 있게 만들면
        아무 효과 없는 조작을 제공하게 된다.
      */}
      <div style={{ textAlign: 'center', fontSize: 10, color: T.dim, marginBottom: 14 }}>
        배치는 역할에 따라 정해집니다
      </div>

      <SystemPanel compact>
        <Row label="파티 총 전투력" value={total.toLocaleString()} gold />
        <Row label="평균 레벨" value={members.length ? `Lv.${avgLevel}` : '—'} />
        <Row
          label="속성 구성"
          value={
            spread.length
              ? spread.map((s) => (
                <span key={s.element} style={{ color: ELEMENT_TINT[s.element], marginLeft: 6 }}>
                  {ELEMENT_KR[s.element]}{s.count}
                </span>
              ))
              : '—'
          }
        />
        <Row
          label="편성 가능"
          value={squadsUnlocked ? `1군 · 2군 (각 ${partyLimit})` : `1군 (${partyLimit})`}
        />
        {/*
          ⚠️ '시너지'가 아니라 '구성'이다. 이 게임에는 파티 단위 속성 보너스가 없다 —
          상성은 공격 한 번마다 적과 1:1로만 걸린다. "+12%" 같은 숫자를 적으면
          화면이 존재하지 않는 이득을 약속하게 된다.
        */}
        <div style={{ fontSize: 10, color: T.dim, marginTop: 8, lineHeight: 1.7 }}>
          속성은 적과의 상성으로만 작용합니다
        </div>
      </SystemPanel>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '16px 0 20px' }}>
        <Button small onClick={doAuto} disabled={locked || members.length >= partyLimit}>
          자동 편성
        </Button>
        <Button onClick={onSortie} disabled={members.length === 0}>출전</Button>
      </div>

      <SectionLabel>{locked ? '보유 영웅' : '눌러서 편성'}</SectionLabel>

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
        }}
      >
        {sorted.map((h) => {
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
                onClick={() => !locked && onToggleParty(editing, h.instId)}
              />
              <div style={{ fontSize: 10, color: T.gold, marginTop: 2 }}>
                {heroPower(h, def, gameData.starScaling).toLocaleString()}
              </div>
              <button
                onClick={() => onInspect(h)}
                style={{
                  marginTop: 0,
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
    </div>
  );
}

/** 요약 한 줄. 라벨은 왼쪽, 값은 오른쪽 */
function Row({ label, value, gold }: { label: string; value: React.ReactNode; gold?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontSize: 12,
        padding: '7px 0',
        borderBottom: `1px solid ${T.panelHi}`,
      }}
    >
      <span style={{ color: T.dim }}>{label}</span>
      <span style={{ color: gold ? T.gold : T.text }}>{value}</span>
    </div>
  );
}
