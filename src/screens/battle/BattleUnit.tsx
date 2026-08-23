import { HeroArt } from '../../ui/art/HeroArt';
import { EnemyArt } from '../../ui/art/EnemyArt';
import { GuardArt } from '../../ui/art/GuardArt';
import { enemyArtOf, guardArtOf, heroArtOf } from '../../ui/artMap';
import { T } from '../../ui/tokens';
import type { RosterUnit } from '../../game/encounter';
import type { Affinity, StatusKind } from '../../game/types';

/**
 * 상태이상 표시 — 엔진은 이벤트를 내는데 지금까지 화면이 버리고 있었다.
 * 전투 로그도 같은 표를 쓴다(`BattleScreen`) — 라벨이 두 곳으로 갈리면 어긋난다.
 */
export const STATUS_MARK: Record<StatusKind, { sign: string; color: string }> = {
  atkUp: { sign: '↑공', color: '#E8C56A' },
  atkDown: { sign: '↓공', color: '#9A93A8' },
  defUp: { sign: '↑방', color: '#6FA8DC' },
  defDown: { sign: '↓방', color: '#9A93A8' },
  spdUp: { sign: '↑속', color: '#8FD4A8' },
  spdDown: { sign: '↓속', color: '#9A93A8' },
  poison: { sign: '독', color: '#8FBF6F' },
  burn: { sign: '화', color: '#D97A45' },
  stun: { sign: '기절', color: '#E0913A' },
};

export interface Floater {
  id: number;
  uid: string;
  amount: number;
  heal: boolean;
  crit: boolean;
  /** 속성 상성 — 유리/불리. 중립이면 없다 */
  affinity?: Affinity;
  /** 물약으로 회복했는가 — 스킬 회복과 구별해서 읽혀야 한다 */
  fromPotion?: boolean;
}

/**
 * 상성 표식.
 *
 * ⚠️ **색만으로 구분하지 않는다.** 기호를 함께 쓴다 —
 * 등급을 색이 아니라 구조로 표현하는 규칙과 같은 이유다(색각·작은 화면).
 */
const AFFINITY_MARK: Record<Affinity, { sign: string; color: string; label: string }> = {
  adv: { sign: '▲', color: '#FFB454', label: '효과적' },
  dis: { sign: '▼', color: '#7E93A8', label: '반감' },
};

export interface BattleUnitProps {
  unit: RosterUnit;
  hp: number;
  /** 이번 프레임에 이 유닛이 쓴 스킬 이름 */
  castingSkill?: string;
  floaters: Floater[];
  shaking: boolean;
  /** 개입 '후퇴'로 물러나 있는가 */
  retreated: boolean;
  statuses: StatusKind[];
  artSize: number;
  /** 원근 — 뒤쪽(적)은 살짝 작게 */
  scale: number;
  /** 개입 대상 선택 중일 때 */
  selectable?: boolean;
  onSelect?: () => void;
}

/**
 * 전장의 유닛 1기.
 * 숫자를 읽지 않아도 상태가 보여야 한다 — 그게 이 컴포넌트의 목적이다.
 */
export function BattleUnit({
  unit, hp, castingSkill, floaters, shaking, retreated,
  statuses, artSize, scale, selectable, onSelect,
}: BattleUnitProps) {
  const dead = hp <= 0;
  const ratio = Math.max(0, Math.min(1, hp / unit.maxHp));
  const danger = unit.kind === 'guard' && ratio <= 0.5 && !dead;

  const barColor =
    unit.kind === 'enemy' ? '#8B2E2E' : unit.kind === 'guard' ? T.amber : '#3E7FBF';
  const barWidth = unit.kind === 'guard' ? 88 : 68;

  const body = (
    <>
      {/* 데미지/회복 숫자 */}
      {floaters.map((f) => {
        const aff = f.affinity ? AFFINITY_MARK[f.affinity] : null;
        /*
          상성이 붙은 타격은 숫자 색까지 바꾼다 — 유리타가 치명타처럼 눈에 띄어야
          "왜 이번엔 크게 박혔지"가 설명된다. 치명타가 더 세므로 치명타가 우선한다.
        */
        const color = f.heal ? '#6FBF8F'
          : f.crit ? T.gold
          : aff ? aff.color
          : '#FF6B6B';
        return (
          <div
            key={f.id}
            style={{
              position: 'absolute',
              left: '50%',
              top: -4,
              transform: 'translateX(-50%)',
              animation: 'floatUp 720ms ease-out forwards',
              color,
              fontSize: f.crit ? 24 : aff?.sign === '▲' ? 19 : 17,
              fontWeight: 700,
              textShadow: f.crit
                ? `0 0 12px ${T.gold}, 0 2px 6px #000`
                : aff ? `0 0 8px ${aff.color}, 0 2px 6px #000`
                : '0 2px 6px #000',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              zIndex: 6,
            }}
          >
            {/* 물약은 스킬 회복과 달리 "터졌다"로 읽혀야 한다 */}
            {f.heal && f.fromPotion && <span style={{ fontSize: 12 }}>🜂 </span>}
            {f.heal ? '+' : ''}{f.amount}
            {f.crit ? ' !' : ''}
            {aff && <span style={{ fontSize: 12 }}> {aff.sign}</span>}
          </div>
        );
      })}

      {/* 시전 중인 스킬명 */}
      {castingSkill && !dead && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: -18,
            transform: 'translateX(-50%)',
            fontSize: 11,
            letterSpacing: '.08em',
            color: T.frame,
            background: 'rgba(8,7,12,.88)',
            border: `1px solid ${T.panelHi}`,
            padding: '2px 8px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {castingSkill}
        </div>
      )}

      {/* 아트 */}
      <div
        style={{
          transform: `scale(${scale})${castingSkill && !dead ? ' translateY(-5px)' : ''}`,
          transformOrigin: 'bottom center',
          transition: 'transform 200ms',
          opacity: retreated ? 0.35 : 1,
          filter: dead ? 'grayscale(1) brightness(.45)' : 'none',
        }}
      >
        {unit.kind === 'enemy' && (
          <EnemyArt art={enemyArtOf(unit.sourceId)} element={unit.element} size={artSize} faded={dead} />
        )}
        {unit.kind === 'hero' && (
          <HeroArt art={heroArtOf(unit.defId ?? '')} element={unit.element} size={artSize} faded={dead} />
        )}
        {unit.kind === 'guard' && (
          <GuardArt art={guardArtOf(unit.sourceId)} ratio={ratio} size={artSize} />
        )}
      </div>

      {/* 후퇴 표시 */}
      {retreated && !dead && (
        <div
          style={{
            position: 'absolute', left: '50%', top: '38%',
            transform: 'translate(-50%,-50%)',
            fontSize: 10, letterSpacing: '.2em', color: T.rare,
            border: `1px solid ${T.rare}`, background: 'rgba(8,7,12,.9)',
            padding: '3px 8px', whiteSpace: 'nowrap', zIndex: 4,
          }}
        >
          후퇴
        </div>
      )}

      {/* 이름 */}
      <div
        style={{
          fontSize: 11,
          marginTop: 1,
          color: unit.kind === 'guard' ? T.amber : dead ? T.dim : T.text,
          textShadow: '0 1px 4px #000',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: barWidth + 20,
        }}
      >
        {unit.kind === 'guard' ? `◆ ${unit.name}` : unit.name}
      </div>

      {/* HP 바 — 감소분이 뒤따라오는 2단 구조 */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 3 }}>
        <div
          style={{
            position: 'relative',
            width: barWidth,
            height: unit.kind === 'guard' ? 8 : 6,
            background: '#1A1620',
            border: `1px solid ${danger ? T.blood : '#2A2434'}`,
            boxShadow: danger ? `0 0 8px ${T.blood}88` : 'none',
            animation: danger ? 'pulse 1.4s ease-in-out infinite' : 'none',
          }}
        >
          {/* 잔상 — 늦게 줄어든다 */}
          <div
            style={{
              position: 'absolute', inset: 0,
              width: `${ratio * 100}%`,
              background: '#6B2530',
              transition: 'width 620ms ease-out 160ms',
            }}
          />
          <div
            style={{
              position: 'absolute', inset: 0,
              width: `${ratio * 100}%`,
              background: barColor,
              transition: 'width 200ms ease-out',
            }}
          />
        </div>
      </div>

      {/* 상태이상 */}
      {statuses.length > 0 && !dead && (
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 2, flexWrap: 'wrap' }}>
          {statuses.map((s, i) => {
            const m = STATUS_MARK[s];
            return (
              <span
                key={`${s}-${i}`}
                style={{
                  fontSize: 9, lineHeight: 1.3, color: m.color,
                  border: `1px solid ${m.color}66`, padding: '0 3px',
                  background: 'rgba(8,7,12,.7)',
                }}
              >
                {m.sign}
              </span>
            );
          })}
        </div>
      )}
    </>
  );

  const frame: React.CSSProperties = {
    textAlign: 'center',
    position: 'relative',
    animation: shaking ? 'shake 180ms' : 'none',
  };

  if (selectable && onSelect && !dead) {
    return (
      <button
        onClick={onSelect}
        style={{
          ...frame,
          background: 'transparent',
          border: `1px solid ${T.rare}`,
          boxShadow: `0 0 14px ${T.rare}55`,
          borderRadius: 2,
          padding: '4px 6px',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
        }}
      >
        {body}
      </button>
    );
  }

  return <div style={frame}>{body}</div>;
}
