import { SystemPanel } from '../ui/SystemPanel';
import { tabSafePadding } from '../ui/TabBar';
import { Button, HpBar, TOUCH_MIN } from '../ui/Button';
import { HeroPortrait } from '../ui/art/HeroPortrait';
import { heroArtOf } from '../ui/artMap';
import { heroVariantOf } from '../ui/art/heroImages';
import { T, ELEMENT_KR, ELEMENT_TINT, STAR_TIERS, quartersFor } from '../ui/tokens';
import { SectionLabel } from './SectionLabel';
import { statsOfInstance, attributesOfInstance, klassFor } from '../game/stats';
import { displayName, displayTitle } from '../game/identity';
import { estimatePotential } from '../game/reveal';
import { originOf, originText } from '../game/origin';
import { DeedList } from './DeedList';
import { livingHeroes } from '../game/roster';
import { canPromote, expToNext } from '../game/progression';
import { heroPower } from '../game/power';
import { heroBonus, applyBonus } from '../game/gear';
import { ROLE_KR, LINE_KR } from '../game/data/formation';
import { lineOf } from '../game/formation';
import { gameData } from '../game/data';
import { temperOf } from '../game/temperament';
import { legendOf } from '../game/legend';
import type {
  Attribute, GearInstance, HeroInstId, HeroInstance, Wallet,
} from '../game/types';

export interface StatusScreenProps {
  roster: HeroInstance[];
  squads: HeroInstId[][];
  gear: GearInstance[];
  wallet: Wallet;
  /** 지금 보고 있는 영웅. 없으면 화면이 스스로 고른다 */
  selectedId: HeroInstId | null;
  onSelect: (id: HeroInstId) => void;
  onOpenSummon: () => void;
  onOpenForge: () => void;
}

/**
 * 상태창 — 개체 하나를 깊게 읽는다.
 *
 * ── 영웅 탭·장비 모달과 무엇이 다른가 ─────────────────
 * 영웅 탭은 "무엇을 가졌나"(목록), 장비 모달은 "무엇을 끼울까"(조작),
 * 여기는 **"이 개체가 어떤 존재인가"(판독)**다. 조작 버튼을 두지 않고
 * 승급·스킬강화는 제단으로 보낸다.
 *
 * ⚠️ **탭이므로 '닫기'가 없다.** 아무도 안 고른 상태가 항상 존재하며,
 * 그때 빈 화면을 보이면 고장으로 읽힌다 — 아래 폴백이 그것을 막는다.
 */
export function StatusScreen({
  roster, squads, gear, wallet, selectedId, onSelect, onOpenSummon, onOpenForge,
}: StatusScreenProps) {
  const alive = livingHeroes(roster);

  /*
    폴백 우선순위. **렌더 중 setState를 하지 않는다** — 파생값으로만 정한다.
      1. 고른 영웅이 살아있다 → 그 영웅
      2. 1군에 인원이 있다   → 1군 첫 번째
      3. 로스터는 있다        → 아무나(정렬 첫 번째)
      4. 전멸                 → null
    ⚠️ 고른 id가 죽은 영웅을 가리킬 수 있다(전투·합성 후). `?? null`이 필수다.
  */
  const picked = selectedId ? alive.find((h) => h.instId === selectedId) ?? null : null;
  const firstOfSquad = (squads[0] ?? [])
    .map((id) => alive.find((h) => h.instId === id))
    .find((h): h is HeroInstance => !!h) ?? null;
  const hero = picked ?? firstOfSquad ?? alive[0] ?? null;

  if (!hero) {
    return (
      <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
        <Header right="—" />
        <SystemPanel tone="warning">
          <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9, padding: '10px 0' }}>
            아직 살아있는 영웅이 없습니다.
            <br />
            소환소에서 새 영웅을 맞이하십시오.
          </div>
          <div style={{ marginTop: 12 }}>
            <Button small onClick={onOpenSummon}>소환소로</Button>
          </div>
        </SystemPanel>
      </div>
    );
  }

  const def = gameData.heroes[hero.defId];
  const attrs = attributesOfInstance(hero, def, gameData.starScaling);
  const index = new Map(gear.map((g) => [g.instId, g]));
  const bonus = heroBonus(hero.gear, index);
  const stats = applyBonus(statsOfInstance(hero, def, gameData.starScaling), bonus);
  const power = heroPower(hero, def, gameData.starScaling, bonus);
  const reveal = estimatePotential(hero);
  const tier = STAR_TIERS[hero.star];
  const maxLevel = gameData.starScaling[hero.star].maxLevel;
  const atMaxLevel = hero.level >= maxLevel;
  const promo = canPromote(hero, wallet, gameData.starScaling);
  const squadOf = squads.findIndex((m) => m.includes(hero.instId));
  /** 개체의 생전 서사. seed가 없는 옛 세이브는 null이라 패널이 안 뜬다 */
  const origin = originOf(hero);
  /** 기질 — 말투를 정한다. 전투 수치에는 닿지 않는다(gdd-v3 §4.10) */
  const temper = temperOf(hero);
  /** 전설(§4.11) — 죽으면 모든 회차에서 봉인된다는 사실을 가장 많이 열리는 화면에 둔다 */
  const legend = legendOf(hero);

  return (
    <div style={{ padding: `14px 12px ${tabSafePadding()}` }}>
      <Header right={`${alive.length}명`} />

      {/*
        영웅 전환 칩. 탭을 나갔다 오지 않고 다른 개체를 볼 수 있어야 한다 —
        없으면 "영웅 탭 → 카드 → 상태창"을 매번 왕복해야 한다.
      */}
      <div style={{ overflowX: 'auto', marginBottom: 14, WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'flex', gap: 6, minWidth: 'min-content', paddingBottom: 4 }}>
          {alive.map((h) => {
            const on = h.instId === hero.instId;
            return (
              <button
                key={h.instId}
                onClick={() => onSelect(h.instId)}
                style={{
                  flexShrink: 0,
                  minHeight: TOUCH_MIN,
                  padding: '6px 12px',
                  background: on ? T.panelHi : 'transparent',
                  border: `1px solid ${on ? T.gold : T.panelHi}`,
                  color: on ? T.text : T.dim,
                  fontFamily: 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayName(h, gameData.heroes)}
              </button>
            );
          })}
        </div>
      </div>

      <SystemPanel tone={hero.star >= 5 ? 'rare' : 'normal'}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', marginBottom: 12 }}>
          <HeroPortrait
            defId={hero.defId}
            variant={heroVariantOf(hero)}
            art={heroArtOf(hero.defId)}
            element={def.element}
            size={72}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>
              {displayName(hero, gameData.heroes)}
              <span style={{ color: tier.ring, marginLeft: 6, fontSize: 12 }}>
                {'★'.repeat(hero.star)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>
              {displayTitle(hero, gameData.heroes)}
            </div>
            <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>
              {klassFor(hero.star)}
              {/* 전직 트리는 없다 — 승급 횟수가 실제 대응물이다 */}
              {hero.star > 1 && ` · 승급 ${hero.star - 1}회`}
              {' · '}
              <span style={{ color: ELEMENT_TINT[def.element] }}>{ELEMENT_KR[def.element]}</span>
              {squadOf !== -1 && ` · ${squadOf + 1}군`}
            </div>
            {/*
              거처 — 계급이 사는 곳(`quartersFor`). 승급이 곧 이사라는 것을
              여기서 보여준다. **위 계급 줄에 붙이지 않는다** — 그 줄은 이미
              계급·승급·속성·군까지 넷을 이고 있어 §5-34에서 잘린 자리다.
              역할 줄이 둘뿐이라 여기에 얹는 것이 안전하다(실측으로 확인).
            */}
            <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>
              {ROLE_KR[def.role]} · {LINE_KR[lineOf(def)]} · {quartersFor(hero.star)}
            </div>
          </div>
        </div>

        <Row label="레벨" value={atMaxLevel ? `${hero.level} · 만렙` : `${hero.level} / ${maxLevel}`} gold={atMaxLevel} />
        <Row label="전투력" value={power.toLocaleString()} gold />
        <Row label="HP / ATK" value={`${stats.hp.toLocaleString()} / ${stats.atk.toLocaleString()}`} />
        <Row label="DEF / SPD" value={`${stats.def.toLocaleString()} / ${stats.spd.toLocaleString()}`} />
        <Row label="치명" value={`${Math.round(stats.crit * 100)}%`} />
        {/*
          경험치 진행 — 숫자만 있으면 "얼마나 남았나"가 안 읽힌다.
          바는 `HpBar`를 그대로 쓴다. 프로젝트에 이미 서로 다른 바 구현이
          여럿이라 여기서 또 만들면 넷째가 된다.
        */}
        {!atMaxLevel && (() => {
          const need = expToNext(hero.star, hero.level);
          return (
            <div style={{ marginTop: 4 }}>
              <Row label="다음 레벨까지" value={`${Math.max(0, need - hero.exp)} exp`} />
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                <HpBar cur={hero.exp} max={need} color={T.gold} w={160} h={5} />
              </div>
            </div>
          );
        })()}
      </SystemPanel>

      {/*
        SectionLabel은 위 여백이 없다 — 패널 바로 뒤에 붙이면 라벨이 패널 테두리에
        겹쳐 읽힌다(실기기 스크린샷에서 '능력치'가 위 패널에 걸쳐 보였다).
        패널과 패널 사이에는 여기서 간격을 준다.
      */}
      <SectionLabel>능력치</SectionLabel>
      <SystemPanel compact>
        {/* 현재/상한을 숫자로 그대로 드러낸다 — 상한 도달은 "승급 없이는 못 큰다"는 뜻이다 */}
        <Attr label="힘" at={attrs.str} />
        <Attr label="지능" at={attrs.int} />
        <Attr label="체력" at={attrs.vit} />
        <Attr label="민첩" at={attrs.agi} />
      </SystemPanel>

      <SectionLabel>잠재력</SectionLabel>
      <SystemPanel compact>
        {/*
          ⚠️ 참값(`potentialOf`/`derivePotential`)을 절대 직접 읽지 않는다.
          `estimatePotential`이 유일한 관문이고, label은 완성된 문장이므로
          자르거나 재조립하지 않는다.
        */}
        <div style={{ fontSize: 13, marginBottom: 8 }}>{reveal.label}</div>
        <div style={{ height: 4, background: T.panelHi, marginBottom: 6 }}>
          <div style={{ width: `${Math.round(reveal.progress * 100)}%`, height: '100%', background: T.gold }} />
        </div>
        <div style={{ fontSize: 10, color: T.dim }}>
          발굴 {Math.round(reveal.progress * 100)}% · 전투에 내보내야 드러납니다
        </div>
      </SystemPanel>

      <SectionLabel>스킬</SectionLabel>
      <SystemPanel compact>
        {/*
          ⚠️ '★N 해금' 표시를 넣지 않는다. 데이터에 `unlockStar`가 있지만
          전투 엔진(`chooseSkill`)은 그것을 **보지 않는다** — 타입과 쿨다운만 본다.
          해금 표시를 넣으면 화면에만 있는 규칙이 되어 실제 전투와 어긋난다.
        */}
        {def.skillIds.map((id) => {
          const sk = gameData.skills[id];
          if (!sk) return null;
          return (
            <div key={id} style={{ padding: '8px 0', borderBottom: `1px solid ${T.panelHi}` }}>
              <div style={{ fontSize: 13, marginBottom: 3 }}>
                {sk.name}
                <span style={{ fontSize: 10, color: T.dim, marginLeft: 8 }}>
                  {sk.type === 'passive' ? '지속' : sk.cooldown > 0 ? `쿨 ${sk.cooldown}` : '기본'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>{sk.description}</div>
            </div>
          );
        })}
      </SystemPanel>

      {(def.lore || origin || temper || hero.deeds?.length) && (
        <>
      <SectionLabel>기록</SectionLabel>
          <SystemPanel compact>
            {/*
              종류의 설정(def.lore)이 먼저, 개체의 생전(origin)이 그 아래.
              둘은 다른 층위다 — 앞은 "이런 종류의 영웅", 뒤는 "이 사람".
              종류 설정을 지우지 않는 이유가 이것이다(같이 있어야 층위가 보인다).
            */}
            {def.lore && (
              <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.9 }}>{def.lore}</div>
            )}
            {origin && (
              <div
                style={{
                  fontSize: 11,
                  color: T.gold,
                  lineHeight: 1.9,
                  marginTop: def.lore ? 10 : 0,
                  paddingTop: def.lore ? 10 : 0,
                  borderTop: def.lore ? `1px solid ${T.panelHi}` : undefined,
                }}
              >
                {originText(origin)}
              </div>
            )}
            {/* 연대기 — 생전(태어나기 전)이 아니라 이 탑에서 한 일. 생전 바로 아래에 둔다 */}
            {hero.deeds && hero.deeds.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.panelHi}` }}>
                <DeedList deeds={hero.deeds} />
              </div>
            )}
            {legend && (
              <div style={{ fontSize: 11, lineHeight: 1.9, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.panelHi}` }}>
                <span style={{ color: T.gold, letterSpacing: '.3em' }}>◆ 전설</span>
                <br />
                <span style={{ color: T.blood }}>이 사람이 죽으면 어느 회차에서도 다시 오지 않는다.</span>
              </div>
            )}
            {temper && (
              <div
                style={{
                  fontSize: 11,
                  lineHeight: 1.9,
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: `1px solid ${T.panelHi}`,
                  color: T.dim,
                }}
              >
                <span style={{ color: T.text, letterSpacing: '.2em' }}>기질 · {temper.label}</span>
                <br />
                {temper.desc}
              </div>
            )}
          </SystemPanel>
        </>
      )}

      {/*
        조작은 여기서 하지 않는다 — 사용자 확인: "승급은 어차피 소환제단에 있으니 상관없다".
        다만 지금 승급할 수 있는지는 알려준다. 사유까지 그대로 문구화한다.
      */}
      <div style={{ textAlign: 'center', margin: '16px 0 4px' }}>
        <div style={{ fontSize: 11, color: promo.ok ? T.gold : T.dim, marginBottom: 10, lineHeight: 1.8 }}>
          {promo.ok
            ? '승급할 수 있습니다'
            : promo.reason === 'max-star' ? '더 이상 승급할 수 없습니다'
              : promo.reason === 'level' ? `승급하려면 Lv.${promo.needLevel} 필요`
                : `승급석이 부족합니다 (${promo.missing.promotionStones ?? 0} 부족)`}
        </div>
        <Button small onClick={onOpenForge}>제단으로</Button>
      </div>
    </div>
  );
}

function Header({ right }: { right: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 16 }}>
      <span>상태창</span>
      <span>{right}</span>
    </div>
  );
}

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

/** 능력치 한 줄 — 상한 도달은 금색(더 크려면 승급이 필요하다는 신호) */
function Attr({ label, at }: { label: string; at: Attribute }) {
  const full = at.current >= at.max;
  return (
    <div style={{ padding: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: T.dim }}>{label}</span>
        <span style={{ color: full ? T.gold : T.text }}>{at.current} / {at.max}</span>
      </div>
      <div style={{ height: 3, background: T.panelHi }}>
        <div
          style={{
            width: `${at.max > 0 ? Math.min(100, Math.round((at.current / at.max) * 100)) : 0}%`,
            height: '100%',
            background: full ? T.gold : T.frame,
          }}
        />
      </div>
    </div>
  );
}
