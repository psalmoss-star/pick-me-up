import { SystemPanel } from '../ui/SystemPanel';
import { Button } from '../ui/Button';
import { HeroCard } from '../ui/HeroCard';
import { heroArtOf } from '../ui/artMap';
import { heroVariantOf } from '../ui/art/heroImages';
import { T } from '../ui/tokens';
import { MISSION_LABEL } from '../game/mission';
import { klassFor } from '../game/stats';
import { displayName } from '../game/identity';
import { hasBatchim, lineFor, pickSpeaker, templateLastWords } from '../game/voice';
import { chronicleOf } from '../game/chronicle';
import { floorMapOf, contactTerrain, clampRoute } from '../game/floormap';
import { reportedTerrain, trueForces, type ScoutForce, type ScoutReport } from '../game/report';
import { TERRAIN } from '../game/data/terrain';
import { Quote } from '../ui/Quote';
import { estimatePotential } from '../game/reveal';
import { originOf, originText } from '../game/origin';
import { gameData } from '../game/data';
import { floorRewards } from '../game/data/floors';
import { MATERIAL_DEFS, MATERIAL_ORDER } from '../game/data/materials';
import { isEmptyBag } from '../game/loot';
import type { MaterialBag } from '../game/types';
import { GEAR_DEFS } from '../game/data/gear';
import type { FloorSpec } from '../game/data/floors';
import type { EncounterResult } from '../game/encounter';
import type { QuestGrant } from '../game/quest';
import type { HeroInstance } from '../game/types';
import type { OffTowerResult } from '../game/offTower';
import { OffTowerPanel } from './result/OffTowerPanel';

/** 과제 보상 한 줄. 지급된 것만 나열한다. */
function rewardText(g: QuestGrant): string {
  const parts: string[] = [];
  if (g.gold) parts.push(`골드 +${g.gold}`);
  if (g.promotionStones) parts.push(`승급석 +${g.promotionStones}`);
  if (g.potions) parts.push(`포션 +${g.potions}`);
  if (g.gear) parts.push(GEAR_DEFS[g.gear.defId].name);
  return parts.join(' · ');
}

/** 이번 전투로 레벨이 오른 개체. 표시 전용 — 지급은 `finish()`가 한다 */
export interface LevelUp {
  instId: string;
  name: string;
  from: number;
  to: number;
}

export interface ResultScreenProps {
  result: EncounterResult;
  /** 전투 직전의 로스터 — 사망자 정보를 여기서 찾는다 */
  roster: HeroInstance[];
  floor: FloorSpec;
  /** 이번 돌파로 새로 달성한 과제. 없으면 아무것도 그리지 않는다. */
  questGrants?: QuestGrant[];
  /**
   * 이 승리로 탑을 완주했는가 — 최상층을 깬 그 순간에만 true.
   *
   * 엔딩을 대기실이 아니라 **여기**에 두는 이유: 대기실은 "다음"을 고르는 곳이라
   * 이미 끝난 뒤다. 마지막 일격이 떨어진 화면에서 끝나야 등반의 끝으로 읽힌다.
   */
  towerCleared?: boolean;
  /** 런 전체 누적 사망자 수. 엔딩 문구가 이 수를 그대로 말한다. */
  totalDeaths?: number;
  /**
   * 재도전 보상 배수. **`App`이 스토어와 같은 식으로 구해 내려준다.**
   *
   * ⚠️ 이 화면이 `floorRewards()`를 직접 부르면 배수가 빠져 **표시와 지급이 어긋난다**
   * (재도전에서 실제로 어긋나고 있었다).
   */
  rewardMult?: number;
  /** 이번 전투로 레벨이 오른 개체들 — 참전·훈련소·모험으로 오른 것 전부 */
  levelUps?: LevelUp[];
  /** 탑 밖 정산 미리보기 — `settleOffTower`. 없으면 패널을 그리지 않는다 */
  offTower?: OffTowerResult | null;
  /** 훈련소 레벨 — 층 미돌파 시 "훈련 성과 없음" 줄을 띄울지 */
  trainingLevel?: number;
  /** 이번 돌파로 얻은 제작 재료. 빈 주머니면 아무것도 그리지 않는다 */
  materials?: MaterialBag;
  /**
   * 이번 전투의 정찰 보고와 고른 경로 — "보고와 실제"를 나란히 적는다(기획서 3단계).
   * 틀린 보고가 **틀렸다고 드러나야** 다음 층에서 그 사람의 말을 의심할 수 있다.
   */
  report?: ScoutReport | null;
  route?: number;
  onFinish: () => void;
}

/**
 * 결과 화면.
 * MVP와 사망자를 같은 화면에 둔다 — 기쁨과 상실을 분리하지 않는다.
 */
export function ResultScreen({
  result, roster, floor, questGrants = [], towerCleared = false, totalDeaths = 0,
  rewardMult = 1, levelUps = [], materials = {}, report = null, route = 0,
  offTower = null, trainingLevel = 0, onFinish,
}: ResultScreenProps) {
  const win = result.outcome === 'victory';
  const find = (id: string) => roster.find((h) => h.instId === id);

  const mvp = result.mvp ? find(result.mvp) : undefined;
  const dead = result.casualties.map(find).filter((h): h is HeroInstance => !!h);
  /** 살아남은 출전자 — 후퇴한 사람도 포함한다(죽지 않았으니까) */
  const survivors = result.roster
    .filter((u) => u.side === 'ally' && !result.casualties.includes(u.sourceId as never))
    .map((u) => find(u.sourceId))
    .filter((h): h is HeroInstance => !!h);
  const nameOf = (h: HeroInstance) => displayName(h, gameData.heroes);

  /*
    유언 — gdd-v3 §4.10. `finish()`가 무덤에 적는 것과 **같은 함수·같은 입력**이라
    여기서 읽은 말이 그대로 무덤에 남는다.
  */
  /*
    남겨진 자의 말. 먼저 간 사람 중 첫 번째에 대해, 살아남은 사람 하나가 말한다.
    둘 이상이 한꺼번에 말하면 손실 목록이 수다가 된다 — 한 마디면 충분하다.
  */
  const firstLost = dead[0];
  const mourner = firstLost ? pickSpeaker(survivors, nameOf(firstLost)) : null;
  const mourning = firstLost && mourner
    ? lineFor(mourner, 'allyDeath', nameOf(firstLost), { ally: nameOf(firstLost) })
    : null;
  // 재도전 배수를 반영한다 — 안 하면 표시와 실제 지급이 어긋난다(위 prop 주석 참조)
  const base = floorRewards(floor, result.turnsElapsed);
  const rewards = {
    exp: Math.round(base.exp * rewardMult),
    gold: Math.round(base.gold * rewardMult),
    promotionStones: Math.round(base.promotionStones * rewardMult),
  };

  /**
   * 전투 기록 — 책략 장면. 전투 중 비트와 **같은 함수·같은 문장**이고,
   * `finish()`가 수행자 연대기에 남기는 것도 이 목록이다.
   */
  const scenes = chronicleOf(result.events, result.roster);
  /** 군령·후퇴 신호로 물러나 살아남은 자 */
  const withdrawn = result.withdrawn.map(find).filter((h): h is HeroInstance => !!h);

  /** 정찰 보고 대조 — 적 수와 고른 길의 접점 지형 */
  const scoutHero = report ? find(report.scoutId) : undefined;
  const map = floorMapOf(floor);
  const routeIdx = clampRoute(map, route);
  const realTag = contactTerrain(map, routeIdx);
  const saidTag = report ? reportedTerrain(map, report, routeIdx) : null;
  const tagName = (t: typeof realTag) => (t ? TERRAIN[t].name : '?');
  /** 「숲이라」·「강가라」 — 조사는 받침으로 고른다 */
  const said = (t: typeof realTag) => (t ? tagName(t) + (hasBatchim(tagName(t)) ? '이라' : '라') : '모른다고');
  const was = (t: typeof realTag) => tagName(t) + (hasBatchim(tagName(t)) ? '이었다' : '였다');
  /** 「잿빛 슬라임 3기 · 균열의 골렘 1기」 — 종류별 대조. 종류는 늘 참이므로 순서가 같다 */
  const forcesText = (fs: readonly ScoutForce[]) =>
    fs.map((f) => `${gameData.enemies[f.defId].name} ${f.count}기`).join(' · ');
  const realForces = trueForces(floor);
  const sameForces = report?.forces
    ? report.forces.every((f, i) => f.count === realForces[i]?.count)
    : true;

  /** 엔딩은 최상층을 '이겼을 때'만. 최상층에서 져도 뜨면 안 된다. */
  const ending = towerCleared && win;

  return (
    <div style={{ padding: '26px 14px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.3em', marginBottom: 10 }}>
          {floor.id}층 · {MISSION_LABEL[floor.mission.kind]}
        </div>
        <div style={{ fontSize: 27, letterSpacing: '.24em', color: win ? T.gold : T.blood }}>
          {win ? '임무 완수' : '임무 실패'}
        </div>
      </div>

      {/*
        엔딩.

        MVP 카드보다 **위**에 둔다 — 마지막 층에서는 이번 전투의 MVP보다
        등반이 끝났다는 사실이 먼저다.

        문구가 승리만 말하지 않는다. 퍼머데스 게임의 끝은 "무엇을 얻었나"가 아니라
        "누구를 두고 왔나"이고, CLAUDE.md의 "기쁨과 상실을 분리하지 않는다"가
        가장 크게 적용되어야 할 지점이 여기다.
      */}
      {ending && (
        <div style={{ marginBottom: 26 }}>
          <SystemPanel tone="rare">
            <div style={{ fontSize: 11, color: T.dim, letterSpacing: '.34em', marginBottom: 14 }}>
              등 반 종 료
            </div>
            <div style={{ fontSize: 23, letterSpacing: '.2em', color: T.gold, lineHeight: 1.6 }}>
              정상에 섰다
            </div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 2.1, marginTop: 16 }}>
              {floor.id}개 층을 올랐다.
            </div>
            <div style={{ fontSize: 13, lineHeight: 2.1, color: totalDeaths > 0 ? T.blood : T.dim }}>
              {totalDeaths > 0
                ? `그 길에 ${totalDeaths}명을 두고 왔다.`
                : '아무도 잃지 않았다.'}
            </div>
            <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.9, marginTop: 16 }}>
              {totalDeaths > 0
                ? '이름은 봉인되었다 — 같은 이름의 영웅은 다시 오지 않는다.'
                : '드문 일이다.'}
            </div>
          </SystemPanel>
        </div>
      )}

      {win && mvp && (
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 15, letterSpacing: '.2em', marginBottom: 12 }}>
            MVP — {displayName(mvp, gameData.heroes)}({'★'.repeat(mvp.star)})
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <HeroCard
              name={displayName(mvp, gameData.heroes)}
              star={mvp.star}
              element={gameData.heroes[mvp.defId].element}
              art={heroArtOf(mvp.defId)}
              defId={mvp.defId}
              level={mvp.level}
              klass={klassFor(mvp.star)}
              width={150}
              reveal={estimatePotential(mvp).progress}
              variant={heroVariantOf(mvp)}
            />
          </div>
        </div>
      )}

      {/*
        전투 기록 — MVP와 획득 **사이**. 무엇을 얻었나보다 먼저 "어떻게 싸웠나"를 읽게 한다.
        성공도 간파도 같은 목록에 둔다 — 기쁨과 상실을 분리하지 않는다는 원칙과 같다.
      */}
      {(scenes.length > 0 || withdrawn.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <SystemPanel tone={scenes.some((c) => c.success) ? 'rare' : 'normal'} compact>
            <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em', marginBottom: 10 }}>
              전투 기록
            </div>
            {scenes.map((c) => (
              <div key={c.at} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, letterSpacing: '.08em', color: c.success ? T.gold : T.amber }}>
                  {c.turn}턴 · {c.title} · {c.success ? '성공' : '간파당함'}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.9, marginTop: 4 }}>{c.text}</div>
                <div style={{ fontSize: 10, color: T.dim, lineHeight: 1.7, marginTop: 2 }}>{c.source}</div>
              </div>
            ))}
            {withdrawn.length > 0 && (
              <div style={{ fontSize: 12, color: T.rare, lineHeight: 1.9 }}>
                물러나 살아남은 자 — {withdrawn.map(nameOf).join(', ')}
              </div>
            )}
          </SystemPanel>
        </div>
      )}

      {/*
        정찰 보고 대조 — 전투 기록 아래, 획득 위. 성향 이름은 여기서도 말하지 않는다 —
        "누가 틀렸나"만 보여 주고, 그 사람을 믿을지는 마스터가 정한다.
      */}
      {report && scoutHero && (
        <div style={{ marginBottom: 16 }}>
          <SystemPanel compact>
            <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em', marginBottom: 10 }}>
              정찰 보고 — {nameOf(scoutHero)}
            </div>
            {report.forces === null ? (
              // 침묵 — 수는 말하지 않았고, 몸짓으로 가리킨 접점 지형은 참이다
              <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.9 }}>
                말 없이 {tagName(realTag)} 쪽을 가리켰다. 적은 {floor.enemyIds.length}기, 접점은 {was(realTag)}.
              </div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.9 }}>
                <div style={{ color: sameForces ? T.text : T.amber }}>
                  {forcesText(report.forces)}라 했다
                </div>
                <div style={{ color: sameForces ? T.text : T.amber }}>
                  → 실제 {forcesText(realForces)}
                </div>
                <div style={{ color: saidTag === realTag ? T.text : T.amber }}>
                  접점 {said(saidTag)} 했다 → 실제 {tagName(realTag)}
                </div>
              </div>
            )}
          </SystemPanel>
        </div>
      )}

      <SystemPanel tone={dead.length ? 'death' : 'normal'} compact>
        <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em', marginBottom: 10 }}>획득</div>
        <div style={{ fontSize: 14, lineHeight: 1.9 }}>
          {win
            ? `Exp +${rewards.exp} · 골드 +${rewards.gold} · 승급석 +${rewards.promotionStones}`
            : '없음'}
        </div>

        {/*
          레벨업.

          `gainExp()`는 예전부터 `levelsGained`를 돌려줬는데 스토어가 `.hero`만 꺼내
          **버리고 있었다.** 그래서 경험치를 부어도 "올랐다"는 말이 어디에도 없었다.
          훈련소 유휴 exp로 오른 것도 여기 함께 나온다 — 그래야 대기 영웅이
          크고 있다는 게 보인다.
        */}
        {levelUps.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.panelHi}` }}>
            <div style={{ fontSize: 12, color: T.gold, letterSpacing: '.2em', marginBottom: 6 }}>
              ▲ 성장
            </div>
            {levelUps.map((l) => (
              <div key={l.instId} style={{ fontSize: 13, lineHeight: 1.9 }}>
                {l.name}
                <span style={{ color: T.dim }}> Lv.{l.from} → </span>
                <span style={{ color: T.gold }}>Lv.{l.to}</span>
              </div>
            ))}
          </div>
        )}

        {/*
          제작 재료.

          장비처럼 개체가 아니라 수량이라 이름과 개수만 적는다.
          여기 쌓이는 것이 나중에 대장간에서 무기가 된다 —
          "왜 또 오르나"의 답이 결과 화면에 보여야 한다.
        */}
        {!isEmptyBag(materials) && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.panelHi}` }}>
            <div style={{ fontSize: 12, color: T.rare, letterSpacing: '.2em', marginBottom: 6 }}>
              ◈ 재료
            </div>
            {MATERIAL_ORDER.filter((id) => (materials[id] ?? 0) > 0).map((id) => (
              <div key={id} style={{ fontSize: 13, lineHeight: 1.9 }}>
                {MATERIAL_DEFS[id].name}
                <span style={{ color: T.rare }}> +{materials[id]}</span>
              </div>
            ))}
          </div>
        )}

        {/*
          과제 달성. 손실보다 위에 두되 같은 패널 안이다 —
          기쁨과 상실을 분리하지 않는다는 규칙은 과제에도 그대로 적용된다.
        */}
        {questGrants.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em', margin: '20px 0 10px' }}>
              과제 달성
            </div>
            {questGrants.map((g) => (
              <div key={g.quest.id} style={{ lineHeight: 1.9, marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: T.gold, letterSpacing: '.08em' }}>
                  ◆ {g.quest.name}
                </div>
                <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>
                  {g.quest.desc}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                  {rewardText(g)}
                </div>
              </div>
            ))}
          </>
        )}

        {dead.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em', margin: '20px 0 10px' }}>손실</div>
            {dead.map((h) => {
              /*
                무덤 기록. 발굴이 진행돼 있었다면 "무엇을 잃었는지"까지 같이 보여준다.
                알아내던 중에 잃는 것이 발굴×퍼머데스의 핵심이므로, 이 문구가 손실 옆에 있어야 한다.
                (roster는 전투 직전 스냅샷이라 사망 시점의 진행도가 그대로 남아 있다)
              */
              const r = estimatePotential(h);
              /*
                생전 서사도 여기 붙인다. 발굴 진행도가 "알아내던 중에 잃었다"라면
                이쪽은 "무엇이었던 사람을 잃었다"이다 — 둘 다 손실의 무게에 속한다.
                이름만 남기고 보내면 개체가 숫자로 읽힌다.
              */
              const o = originOf(h);
              return (
                <div key={h.instId} style={{ lineHeight: 2 }}>
                  <div style={{ fontSize: 14, color: T.blood }}>
                    ✖ {displayName(h, gameData.heroes)}({'★'.repeat(h.star)}) — 되살릴 수 없습니다
                  </div>
                  {o && (
                    <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7 }}>
                      {originText(o)}
                    </div>
                  )}
                  {r.stage !== 'unknown' && (
                    <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.7, marginBottom: 6 }}>
                      발굴 {Math.round(r.progress * 100)}% · {r.label}
                    </div>
                  )}
                  {(() => {
                    const w = templateLastWords(h, floor.id);
                    return w && (
                      <div style={{ margin: '2px 0 10px' }}>
                        <Quote text={w} tone="death" />
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            {mourner && mourning && (
              <div style={{ marginTop: 10, paddingTop: 12, borderTop: `1px solid ${T.panelHi}` }}>
                <Quote
                  text={mourning.text}
                  speaker={nameOf(mourner)}
                  temper={mourning.temper.label}
                />
              </div>
            )}
          </>
        )}
      </SystemPanel>

      {/* 탑 밖 — 획득·손실 다음, 버튼 위. 탑에 간 사이 남은 이들에게 있었던 일 */}
      {offTower && <OffTowerPanel off={offTower} cleared={win} trainingLevel={trainingLevel} />}

      <div style={{ textAlign: 'center', marginTop: 30 }}>
        <Button tone={win ? 'rare' : 'normal'} onClick={onFinish}>
          {ending ? '기록을 남긴다' : '대기실로'}
        </Button>
      </div>
    </div>
  );
}
