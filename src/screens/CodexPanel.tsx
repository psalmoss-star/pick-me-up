/**
 * 도감 — 어떤 종류를 만났고, 몇을 잃었는가.
 *
 * ── 왜 이제야 만드나 ────────────────────────────────────
 * `CodexEntry`는 **처음부터 쌓이고 있었다.** `gacha.ts`의 `registerCodex`가
 * 획득을, `recordLoss`가 상실을 적었고 회차를 넘어 유지되기까지 했다
 * (gdd-v3 §7의 "계승은 기록뿐" 원칙의 **명시적 예외**).
 *
 * 그런데 **보여주는 화면이 하나도 없었다.** 유일한 사용처가
 * `SummonScreen`의 "도감에 새로 기록되었습니다" 한 줄이었다.
 * `timesAcquired`·`timesLost`는 수집만 되고 어디에도 나타나지 않았다.
 *
 * §STEP 37(★6 각성석 공급원 없음)·§STEP 38(유물 제작 경로 없음)과
 * **같은 종류의 결함**이다 — 데이터는 있는데 닿는 길이 없다.
 *
 * ── `timesLost`가 이 화면의 핵심이다 ────────────────────
 * 퍼머데스 게임에서만 의미가 생기는 지표다. 보통 수집 요소는 "몇 개 모았나"만
 * 세는데, 여기서는 **"몇을 잃었나"가 같은 칸에 있다.**
 * gdd-v3 §4.1("기쁨과 상실을 분리하지 않는다")을 도감에도 적용한 것이다.
 *
 * ── 미획득도 보여준다 ───────────────────────────────────
 * 무엇을 모으는 중인지 모르면 수집이 성립하지 않는다.
 * §STEP 38의 "잠긴 레시피도 목록에는 보인다"와 같은 판단이다.
 */
import { SystemPanel } from '../ui/SystemPanel';
import { T, STAR_TIERS } from '../ui/tokens';
import { gameData } from '../game/data';
import type { CodexEntry, HeroDefId } from '../game/types';

export interface CodexPanelProps {
  codex: Record<HeroDefId, CodexEntry>;
}

export function CodexPanel({ codex }: CodexPanelProps) {
  /*
    표시 순서는 **데이터 정의 순서**를 그대로 쓴다.
    획득순으로 정렬하면 도감이 플레이마다 다른 모양이 되어 "빈 칸이 어디였는지"를
    기억할 수 없다. 도감은 목록이 고정돼야 수집판으로 읽힌다.
  */
  const defs = Object.values(gameData.heroes);
  const found = defs.filter((d) => codex[d.id]).length;

  const totalLost = Object.values(codex).reduce(
    (n, e: CodexEntry) => n + e.timesLost, 0,
  );

  return (
    <>
      <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.2em', marginBottom: 16 }}>
        기록 {found} / {defs.length}
        {totalLost > 0 && <span style={{ color: T.blood }}> · 잃음 {totalLost}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {defs.map((def) => {
          const e = codex[def.id];
          /*
            미획득은 흐리게 두되 **이름은 가린다.** 이름까지 보이면 도감이
            "설명서"가 되고 만나는 순간의 발견이 사라진다.
            대신 몇 명이 남았는지는 위 카운터가 말하고 있다.
          */
          if (!e) {
            return (
              <SystemPanel key={def.id} compact>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', opacity: 0.45 }}>
                  <span style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em' }}>???</span>
                  <span style={{ fontSize: 11, color: T.dim }}>아직 만나지 못했다</span>
                </div>
              </SystemPanel>
            );
          }

          const tier = STAR_TIERS[e.highestStarReached];
          return (
            <SystemPanel key={def.id} compact>
              <div style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, color: T.text }}>{def.name}</span>
                  {/*
                    최고 등급은 색이 아니라 별 개수로도 말한다 —
                    CLAUDE.md: "등급 차이는 색이 아니라 구조로 표현한다"
                  */}
                  <span style={{ fontSize: 12, color: tier?.ring ?? T.gold, flexShrink: 0 }}>
                    {'★'.repeat(e.highestStarReached)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.8, marginTop: 2 }}>
                  {def.title}
                </div>
                <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.8 }}>
                  만남 {e.timesAcquired}
                  {/*
                    잃은 수는 0이어도 숨기지 않는다 — "아직 아무도 안 죽었다"가
                    이 게임에서는 정보다. 다만 0일 때는 색을 죽인다.
                  */}
                  {' · '}
                  <span style={{ color: e.timesLost > 0 ? T.blood : T.dim }}>
                    잃음 {e.timesLost}
                  </span>
                </div>
              </div>
            </SystemPanel>
          );
        })}
      </div>
    </>
  );
}
