import { useState } from 'react';
import { HeroCard } from '../ui/HeroCard';
import { SystemPanel } from '../ui/SystemPanel';
import { tabSafePadding } from '../ui/TabBar';
import { Button, TOUCH_MIN } from '../ui/Button';
import { useViewport } from '../ui/useViewport';
import { heroArtOf } from '../ui/artMap';
import { heroVariantOf } from '../ui/art/heroImages';
import { T } from '../ui/tokens';
import { klassName } from '../game/klass';
import { displayName } from '../game/identity';
import { livingHeroes } from '../game/roster';
import { estimatePotential } from '../game/reveal';
import { canPromote } from '../game/progression';
import { heroPower } from '../game/power';
import { sortRoster, SORT_KEYS, SORT_LABEL, type SortKey } from '../game/rosterSort';
import { gameData } from '../game/data';
import type { HeroInstId, HeroInstance, Wallet } from '../game/types';

export interface HeroesScreenProps {
  roster: HeroInstance[];
  squads: HeroInstId[][];
  wallet: Wallet;
  /** 카드를 눌렀을 때 — 장비 착용이 가능한 상세 모달 */
  onInspect: (hero: HeroInstance) => void;
  /** 상태창 탭으로 보내며 이 영웅을 고정한다 */
  onOpenStatus: (hero: HeroInstance) => void;
  /** 합성소(제단)로 — 승급·합성은 거기서 한다 */
  onOpenForge: () => void;
}

/**
 * 영웅 — 보유 목록과 도감.
 *
 * ── 왜 대기실에서 떼어냈나 (원래 RosterScreen의 근거, 그대로 유효하다) ──
 * 카드가 237px이고 2열이라 로스터 5명이면 1185px, 10명이면 2400px대다.
 * 대기실에 두면 마을·다음 층·주 동선이 전부 그 아래로 밀려서
 * **`탑 입장`에 닿는 데 711px을 스크롤해야 했다**(실측).
 * 카드를 줄이는 선택지는 없다 — 타로카드형이고 등급을 구조로 표현해야 한다.
 *
 * ── 왜 편성을 뺐나 ─────────────────────────────────
 * 편성은 파티 탭이 맡는다. 예전에는 한 화면이 목록·편성을 다 해서
 * 탭 3개가 전부 여기로 왔고 **서로 구별되지 않았다**(실기기 보고).
 * 여기는 "무엇을 가졌나"만 본다.
 */
export function HeroesScreen({
  roster, squads, wallet, onInspect, onOpenStatus, onOpenForge,
}: HeroesScreenProps) {
  const alive = livingHeroes(roster);
  const [sortKey, setSortKey] = useState<SortKey>('power');
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const { width } = useViewport();
  // 다른 화면과 같은 산식 — 화면마다 카드 크기가 갈리면 같은 영웅이 달라 보인다
  const cardWidth = Math.max(112, Math.min(150, Math.floor((Math.min(width, 480) - 42) / 2)));

  /*
    기본은 전투력 내림차순 — 방치형에서 목록의 기본 관심사는 "누가 센가"다.
    다만 개체가 늘면 다른 축이 필요해진다(제물은 약한 쪽에서 고른다).
    산식은 `game/rosterSort.ts`가 단일 출처다 — 화면마다 따로 쓰면 순서가 갈린다.
  */
  const shown = onlyFavorite ? alive.filter((h) => h.favorite) : alive;
  const sorted = sortRoster(shown, sortKey, gameData.heroes, gameData.starScaling);

  /*
    승급 가능 인원. `needsPromotion`이 아니라 `canPromote`를 쓴다 —
    전자는 "상한 도달"만 보고 재료를 안 봐서, 재료가 없는데 가능하다고 나온다.
  */
  const promotable = alive.filter(
    (h) => canPromote(h, wallet, gameData.starScaling).ok,
  ).length;

  return (
    <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 18 }}>
        <span>영웅</span>
        {/*
          사망자가 있으면 '생존 N / 전체'로 쓴다. '보유 3 / 12'라고 하면
          12명을 들고 있는 것으로 읽히는데 실제로는 9명이 무덤에 있다.
        */}
        <span>
          {roster.length === alive.length
            ? `보유 ${alive.length}`
            : `생존 ${alive.length} / ${roster.length}`}
        </span>
      </div>

      {/*
        정렬·필터.

        ⚠️ 로스터가 2명 이하면 정렬이 의미가 없으므로 띄우지 않는다 —
        초반 화면에서 세로 예산(375×667)을 먹는 것이 더 나쁘다.
        칩은 한 줄에 5개(정렬 4 + 표식)이고 가로 스크롤을 허용한다.
      */}
      {alive.length > 2 && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: 16,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {SORT_KEYS.map((k) => (
            <Chip key={k} active={sortKey === k} onClick={() => setSortKey(k)}>
              {SORT_LABEL[k]}
            </Chip>
          ))}
          {/*
            표식은 **필터로만** 쓴다. 정렬 키로 쓰면 표식이 취향이 아니라
            최적화가 된다(gdd-v3 §7). 보고 싶은 것만 보는 것은 최적화가 아니다.
          */}
          <Chip active={onlyFavorite} onClick={() => setOnlyFavorite((v) => !v)}>
            ❖ 표식
          </Chip>
        </div>
      )}

      {alive.length === 0 && (
        <SystemPanel>
          <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, padding: '10px 0' }}>
            살아있는 영웅이 없습니다.
            <br />
            소환소에서 새 영웅을 맞이하십시오.
          </div>
        </SystemPanel>
      )}

      {/* 필터를 켰는데 아무도 없으면 빈 화면이 된다 — 왜 비었는지 말해준다 */}
      {alive.length > 0 && sorted.length === 0 && (
        <SystemPanel>
          <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, padding: '10px 0' }}>
            표식을 단 영웅이 없습니다.
            <br />
            카드를 눌러 상세창에서 표식을 달 수 있습니다.
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
                klass={klassName(h.defId, h.star, gameData.heroes)}
                width={cardWidth}
                squad={memberOf === -1 ? undefined : ((memberOf + 1) as 1 | 2)}
                favorite={h.favorite}
                reveal={estimatePotential(h).progress}
                variant={heroVariantOf(h)}
                onClick={() => onOpenStatus(h)}
              />
              <div style={{ fontSize: 10, color: T.gold, marginTop: 2 }}>
                {heroPower(h, def, gameData.starScaling).toLocaleString()}
              </div>
              <button
                onClick={() => onInspect(h)}
                style={{
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
                장비
              </button>
            </div>
          );
        })}
      </div>

      {alive.length > 0 && (
        <div style={{ textAlign: 'center', margin: '8px 0 12px' }}>
          <div style={{ fontSize: 11, color: promotable > 0 ? T.gold : T.dim, marginBottom: 10 }}>
            {promotable > 0 ? `승급 가능 ${promotable}명` : '승급 가능한 영웅이 없습니다'}
          </div>
          {/*
            ⚠️ '자동 강화'를 두지 않는다. 합성은 제물이 **영구히 소멸**하는 행위이고
            `isPreciousSacrifice` 확인 창이 그 앞을 지킨다. 일괄 실행 버튼은 그 확인을
            우회하므로, 퍼머데스 게임에서 만들면 안 되는 버튼이다.
            자리는 그대로 두되 동작은 제단으로 보내는 것으로 바꾼다.
          */}
          <Button small onClick={onOpenForge}>합성소로</Button>
        </div>
      )}

      {/*
        사망자를 목록에서 뺐으므로 어디로 갔는지 반드시 말해줘야 한다.
        말 없이 사라지면 "내 영웅이 없어졌다"로 읽힌다 — 퍼머데스는
        숨기는 것이 아니라 무덤에 남기는 것이다.
      */}
      <div style={{ textAlign: 'center', color: T.dim, fontSize: 11, lineHeight: 1.8 }}>
        카드를 눌러 상태창 · 아래를 눌러 장비
        <br />
        사망한 영웅은 되살릴 수 없으며 무덤에 기록됩니다
      </div>
    </div>
  );
}

/**
 * 정렬·필터 칩.
 *
 * `Button`을 쓰지 않는 이유는 크기다 — Button은 44px 높이의 주 조작용이고,
 * 칩 5개를 375px에 넣으면 화면의 절반이 컨트롤이 된다.
 * 대신 터치 타깃은 세로 34px + 좌우 여백으로 확보한다(가로 스크롤이라 폭은 여유가 있다).
 */
function Chip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        minHeight: 34,
        padding: '0 12px',
        background: 'transparent',
        border: `1px solid ${active ? T.frame : T.panelHi}`,
        color: active ? T.text : T.dim,
        fontFamily: 'inherit',
        fontSize: 12,
        letterSpacing: '.1em',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
