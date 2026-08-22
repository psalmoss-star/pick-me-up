import { useState, useEffect } from 'react';
import { BaseScreen } from './screens/BaseScreen';
import { RosterScreen } from './screens/RosterScreen';
import { BriefScreen } from './screens/BriefScreen';
import { SummonScreen } from './screens/SummonScreen';
import { ForgeScreen } from './screens/ForgeScreen';
import { FacilityScreen } from './screens/FacilityScreen';
import { ShopScreen } from './screens/ShopScreen';
import { SmithScreen } from './screens/SmithScreen';
import { GraveScreen } from './screens/GraveScreen';
import { TowerScreen } from './screens/TowerScreen';
import { BattleScreen } from './screens/BattleScreen';
import { ResultScreen } from './screens/ResultScreen';
import { DetailModal } from './screens/DetailModal';
import { T } from './ui/tokens';
import type { VillageSpot } from './ui/iso';
import { TabBar, type TabKey } from './ui/TabBar';
import { useRunStore } from './stores/runStore';
import { loadRun } from './stores/save';
import { loadLegacy } from './stores/legacy';
import { floorAt } from './game/data';
import { FLOORS, isFinalFloor } from './game/data/floors';
import { partyLimitAt, squadsOpen } from './game/data/party';
import { livingHeroes } from './game/roster';
import {
  evaluateQuests, pendingQuests, questContext, questRng, type QuestGrant,
} from './game/quest';
import type { HeroInstance } from './game/types';

type Screen =
  | 'base' | 'tower' | 'brief' | 'battle' | 'result'
  | 'summon' | 'forge' | 'facility' | 'shop' | 'smith' | 'grave' | 'roster';

/** 모바일 전용. 데스크톱에서도 이 폭의 세로 화면을 중앙에 띄운다. */
const MOBILE_WIDTH = 480;

export default function App() {
  /**
   * 뷰 상태만 여기 남는다. 게임 상태는 runStore에 있다.
   * screen을 스토어에 넣지 않는 이유는 runStore.ts 주석 참조 (저장 시 복원 불가).
   */
  const [screen, setScreen] = useState<Screen>('base');
  const [detail, setDetail] = useState<HeroInstance | null>(null);
  /** 로스터 화면에서 지금 편성 중인 군(0=1군, 1=2군). 화면 전환과 무관하게 유지된다. */
  const [editingSquad, setEditingSquad] = useState(0);
  // 무덤은 저장소에서 읽으므로 화면을 열 때 최신값을 가져온다.
  const [legacy, setLegacy] = useState(() => loadLegacy());
  /**
   * 무덤에 어디서 들어왔는가. 마을과 시설 화면 둘 다 무덤을 열 수 있어서
   * 돌아가기 대상이 진입 경로에 따라 달라져야 한다.
   * 엔딩(결과 화면)에서 들어오는 경우는 'base'로 둔다 — 그 런은 이미 끝났다.
   */
  const [graveFrom, setGraveFrom] = useState<'base' | 'facility'>('base');

  const floorIndex = useRunStore((s) => s.floorIndex);
  const towerCleared = useRunStore((s) => s.towerCleared);
  const roster = useRunStore((s) => s.roster);
  /**
   * 1군만 브리핑/전투 등 기존 화면에 넘긴다 — 그 화면들은 2군을 모른다.
   * squads[0]을 party 자리에 넣으면 화면 동작은 지금과 완전히 같다.
   * 로스터 화면(편성 UI)만 squads 전체와 lockedSquad를 받아 2군을 다룬다.
   */
  const squads = useRunStore((s) => s.squads);
  const party = squads[0];
  const lockedSquad = useRunStore((s) => s.lockedSquad);
  const maxFloorReached = useRunStore((s) => s.maxFloorReached);
  const result = useRunStore((s) => s.result);
  const snapshot = useRunStore((s) => s.snapshot);
  const interventions = useRunStore((s) => s.interventions);
  const wallet = useRunStore((s) => s.wallet);
  const gacha = useRunStore((s) => s.gacha);
  const seenFirstLegendary = useRunStore((s) => s.seenFirstLegendary);

  const toggleSquadMember = useRunStore((s) => s.toggleSquadMember);
  const selectFloor = useRunStore((s) => s.selectFloor);
  const startBattle = useRunStore((s) => s.start);
  const intervene = useRunStore((s) => s.intervene);
  const finishBattle = useRunStore((s) => s.finish);
  const hydrate = useRunStore((s) => s.hydrate);
  const grantTestFunds = useRunStore((s) => s.grantTestFunds);
  const runNo = useRunStore((s) => s.runNo);
  const startNewRun = useRunStore((s) => s.startNewRun);
  const summon = useRunStore((s) => s.summon);
  const markLegendarySeen = useRunStore((s) => s.markLegendarySeen);
  const fuse = useRunStore((s) => s.fuse);
  const promote = useRunStore((s) => s.promote);
  const facilities = useRunStore((s) => s.facilities);
  const upgradeFacility = useRunStore((s) => s.upgradeFacility);
  const gear = useRunStore((s) => s.gear);
  const buyGear = useRunStore((s) => s.buyGear);
  const equipGear = useRunStore((s) => s.equipGear);
  const unequipGear = useRunStore((s) => s.unequipGear);
  const toggleFavorite = useRunStore((s) => s.toggleFavorite);
  const enhanceGear = useRunStore((s) => s.enhanceGear);
  const potions = useRunStore((s) => s.potions);
  const buyPotion = useRunStore((s) => s.buyPotion);
  // 결과 화면의 과제 미리보기 입력 — finish()가 쓰는 값과 같아야 한다
  const seed = useRunStore((s) => s.seed);
  const battleCount = useRunStore((s) => s.battleCount);
  const deathCount = useRunStore((s) => s.deathCount);
  const claimedQuests = useRunStore((s) => s.claimedQuests);

  /**
   * 기동 시 저장된 런을 불러온다.
   * 저장이 없거나 깨졌으면 loadRun()이 null을 주고, 그대로 새 런으로 시작한다.
   * 저장은 finish()가 알아서 하므로 여기서 할 일은 불러오기뿐이다.
   */
  useEffect(() => {
    const saved = loadRun();
    if (saved) hydrate(saved);
    /*
      테스트용 재화 지급 — 개발 모드에서만 동작한다(프로덕션 빌드에서는 no-op).
      ⚠️ 반드시 hydrate **다음**이어야 한다. 로드가 지갑을 통째로 덮어쓰므로
      순서가 뒤집히면 지급분이 조용히 사라진다.
    */
    grantTestFunds();
  }, [hydrate, grantTestFunds]);

  const floor = floorAt(floorIndex);

  /** 전투 계산은 스토어가 하고, 화면 전환만 여기서 한다 */
  const start = () => {
    if (startBattle()) setScreen('battle');
  };

  /**
   * 마을 부감도의 자리 → 화면.
   *
   * 시설 4종은 전부 시설 화면 하나로 간다(거기서 업그레이드한다).
   * 소환소·상점·무덤은 각자 화면이 따로 있다.
   * 무덤은 진입 시 무덤 파일을 다시 읽는다 — 다른 화면에서 회차가 끝났을 수 있다.
   */
  const goToSpot = (spot: VillageSpot) => {
    switch (spot) {
      case 'summon': setScreen('summon'); break;
      case 'shop': setScreen('shop'); break;
      case 'grave': setGraveFrom('base'); setLegacy(loadLegacy()); setScreen('grave'); break;
      // 마을의 '대장간' 건물은 무기창고(armory) 자리이고 실제 동작은 강화다.
      case 'armory': setScreen('smith'); break;
      case 'forge': setScreen('forge'); break;
      // 여관·시설 — 시설 화면에서 레벨을 올린다.
      case 'rest':
      case 'training': setScreen('facility'); break;
      /*
        탑 — 층 선택 화면으로. 예전엔 곧장 브리핑으로 갔지만, 기존 층 재도전(파밍)이
        들어오면서 "어느 층으로 들어갈지" 고르는 자리가 필요해졌다(TowerScreen).
        파티가 비었으면 그 화면조차 보여주지 않는다 — 골라봤자 브리핑에서 막히므로
        입구 단계에서 끊는 편이 자연스럽다.
        IsoVillage가 잠긴 모습으로 그리지만 클릭 자체는 들어오므로 여기서도 막는다
        (그림만 믿고 가드를 빼면 나중에 스타일이 바뀔 때 조용히 뚫린다).

        ⚠️ **`towerCleared`는 여기서도, `start()`에서도 막지 않는다 — 의도적으로 없다.**
        예전(Task 5 이전) 가드는 `party.length > 0 && !towerCleared`였지만, 그건
        층 진행이 순선형이던 시절 얘기다. `towerCleared`는 sticky고(runStore.ts:589-590,
        최상층을 이미 깬 뒤 재도전해도 계속 true) 절대 꺼지지 않으므로, 이 자리에서
        그대로 다시 걸면 **클리어한 순간부터 탑 전체가 영구히 잠긴다** — 재도전 파밍
        (2군의 존재 이유, 설계서 §5.1~5.5)이 성립하지 않는다. `finish()`도 `towerCleared`
        여부와 무관하게 보상·`revisits`를 처리한다(runStore.ts:700-735) — 스토어 어디에도
        "클리어 후 전투 금지" 규칙이 없다. **이 주석을 보고 가드를 "복원"하지 말 것.**
        진짜 막아야 할 것은 아래 두 가지뿐이고 각자 원래 있던 자리에서 막힌다:
          · 빈 파티 → 이 case의 `party.length > 0`, 그리고 store `start()`의 `members.length === 0`
          · 미해금 층 → `TowerMap`의 `idx <= maxFloorReached` (selectFloor도 동일 상한으로 클램프)
      */
      case 'tower':
        if (party.length > 0) setScreen('tower');
        break;
    }
  };

  /**
   * 하단 탭 → 화면.
   *
   * ⚠️ **소환·파티는 마을에도 입구가 있다(의도된 중복).**
   * 예전 규칙은 "입구는 하나"였지만, 실제로 문제였던 것은 중복이 아니라
   * **이름이 다른 중복**이었다. 지금은 탭과 마을 라벨의 목적지가 정확히 같다 —
   * 부감도에서 작은 건물을 조준하는 것보다 하단 탭이 빠르므로 둘 다 둔다.
   * 탭을 늘릴 때는 마을 라벨과 목적지가 어긋나지 않는지 확인할 것 (TabBar 주석).
   *
   * '상태창'은 로스터와 같은 화면으로 간다 — 개체 상세는 거기서 카드를 눌러 연다.
   * 별도 화면을 새로 만들면 같은 정보가 두 곳에 생겨 유지보수가 갈린다.
   */
  const goToTab = (tab: TabKey) => {
    switch (tab) {
      case 'home': setScreen('base'); break;
      case 'heroes':
      case 'status':
      case 'party': setScreen('roster'); break;
      case 'summon': setScreen('summon'); break;
    }
  };

  /**
   * 탭 바를 띄우는 화면들 — **거점(hub)**.
   *
   * ── 왜 화면마다 안 넣고 여기서 한 번에 다는가 ──────────
   * 탭 바는 화면의 내용이 아니라 **거점의 상시 동선**이다. 화면마다 넣으면
   * 새 화면이 생길 때마다 빠뜨리고, 실제로 그렇게 돼 있었다 —
   * 대기실에만 탭이 있고 영웅·소환으로 들어가면 **탭이 사라져서**
   * "탭으로 들어간 화면에 탭이 없는" 상태였다(폰 스크린샷에서 발견).
   *
   * ⚠️ **전투 흐름(brief/battle/result)에는 두지 않는다.** 등반 중에 탭으로
   * 빠져나갈 수 있으면 퍼머데스의 긴장이 풀리고, 전투 화면은 세로 공간이
   * 이미 빠듯하다(§STEP 19에서 667px 기준 넘침 0으로 맞춰둔 상태).
   * 무덤(grave)도 제외한다 — 엔딩·기록 화면이라 거점이 아니다.
   */
  const HUB_SCREENS = ['base', 'roster', 'summon', 'facility', 'shop', 'smith', 'forge'] as const;
  const showTabs = (HUB_SCREENS as readonly string[]).includes(screen);

  /** 지금 화면이 어느 탭에 해당하는가 — 선택 표시가 실제 위치와 맞아야 한다 */
  const activeTab: TabKey =
    screen === 'roster' ? 'heroes'
    : screen === 'summon' ? 'summon'
    : 'home';

  /**
   * 결과 화면에 보여줄 과제 달성 목록을 **미리** 판정한다.
   *
   * 결과 화면은 finish()보다 먼저 뜨므로 스토어의 questGrants는 아직 비어 있다.
   * 그래서 지급 결과를 받아오는 대신 같은 순수 함수에 같은 입력을 넣어 표시만 만든다.
   * 상태를 건드리지 않으므로 두 번 지급될 일이 없고, RNG도 questRng()로 같으니
   * 여기 보인 보상이 곧 finish()가 실제로 주는 보상이다.
   */
  const previewQuests = (): QuestGrant[] => {
    if (!result) return [];
    const potionsUsed = result.events.filter((e) => e.type === 'heal' && e.fromPotion).length;
    return evaluateQuests({
      ctx: questContext({
        floor,
        result,
        potionsUsed,
        totalDeaths: deathCount + result.casualties.length,
      }),
      cleared: result.outcome === 'victory',
      claimed: claimedQuests,
      rng: questRng(seed, floor.id, battleCount),
      gearSeq: 0, // 표시에는 instId가 쓰이지 않는다
    });
  };

  return (
    <div
      style={{
        /*
          minHeight는 index.css의 #root가 100dvh로 처리한다 (인라인은 폴백 선언 불가).
          ⚠️ 다만 자식이 `minHeight: inherit`로 받아쓰려면 여기에 실제 값이 있어야 한다 —
          #root에만 있으면 이 층에서 0px로 끊겨 하단 고정 레이아웃이 화면을 못 채운다
          (마을 화면 탭 바 아래에 133px 빈 공간이 생겼던 원인).
        */
        minHeight: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        background: `radial-gradient(80% 60% at 50% 0%,#12101C 0%,${T.void} 70%)`,
        color: T.text,
        fontFamily: "'Nanum Myeongjo','Noto Serif KR',serif",
        textAlign: 'center',
      }}
    >
      {/*
        모바일 전용 레이아웃. 데스크톱에서도 세로 화면 폭을 유지한다.
        각 화면의 maxWidth보다 이쪽이 좁으므로 실질 상한은 여기서 정해진다.
      */}
      <div
        style={{
          maxWidth: MOBILE_WIDTH,
          margin: '0 auto',
          width: '100%',
          // 부모가 flex column이므로 남은 높이를 전부 받는다 — 화면 채우기의 실제 수단
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {screen === 'base' && (
          <BaseScreen
            floor={floor}
            roster={roster}
            party={party}
            facilities={facilities}
            wallet={wallet}
            onGoTo={goToSpot}
            towerCleared={towerCleared}
            deathCount={deathCount}
          />
        )}
        {screen === 'roster' && (
          <RosterScreen
            roster={roster}
            squads={squads}
            editing={editingSquad}
            onEditingChange={setEditingSquad}
            partyLimit={partyLimitAt(floor.id)}
            squadsUnlocked={squadsOpen(livingHeroes(roster).length, FLOORS[maxFloorReached].id)}
            lockedSquad={lockedSquad}
            onToggleParty={(squad, id) => toggleSquadMember(squad, id)}
            onInspect={setDetail}
          />
        )}
        {screen === 'facility' && (
          <FacilityScreen
            facilities={facilities}
            wallet={wallet}
            onUpgrade={upgradeFacility}
            onBack={() => setScreen('base')}
            deathCount={deathCount}
            onOpenGrave={() => { setGraveFrom('facility'); setLegacy(loadLegacy()); setScreen('grave'); }}
            onOpenSummon={() => setScreen('summon')}
            onOpenShop={() => setScreen('shop')}
          />
        )}
        {screen === 'grave' && (
          <GraveScreen
            legacy={legacy}
            runNo={runNo}
            floorIndex={floorIndex}
            deathCount={deathCount}
            towerCleared={towerCleared}
            onStartNewRun={() => { startNewRun(); setLegacy(loadLegacy()); setScreen('base'); }}
            /*
              무덤은 마을(대기실)과 시설 화면 양쪽에서 열린다.
              돌아가기를 한쪽으로 고정하면 나머지 경로에서 '가본 적 없는 곳'으로 튕긴다.
            */
            onBack={() => setScreen(graveFrom)}
          />
        )}
        {screen === 'shop' && (
          <ShopScreen
            wallet={wallet}
            ownedCount={gear.reduce<Record<string, number>>((acc, g) => {
              acc[g.defId] = (acc[g.defId] ?? 0) + 1;
              return acc;
            }, {})}
            potions={potions}
            onBuy={buyGear}
            onBuyPotion={buyPotion}
            onBack={() => setScreen('base')}
          />
        )}
        {screen === 'smith' && (
          <SmithScreen
            gear={gear}
            roster={roster}
            wallet={wallet}
            onEnhance={enhanceGear}
            onBack={() => setScreen('base')}
          />
        )}
        {screen === 'forge' && (
          <ForgeScreen
            roster={roster}
            party={party}
            wallet={wallet}
            onFuse={fuse}
            onPromote={promote}
          />
        )}
        {screen === 'summon' && (
          <SummonScreen
            wallet={wallet}
            gacha={gacha}
            seenFirstLegendary={seenFirstLegendary}
            onSummon={summon}
            onLegendarySeen={markLegendarySeen}
          />
        )}
        {screen === 'tower' && (
          <TowerScreen
            floorIndex={floorIndex}
            maxFloorReached={maxFloorReached}
            towerCleared={towerCleared}
            onSelectFloor={(index) => { selectFloor(index); setScreen('brief'); }}
            onBack={() => setScreen('base')}
          />
        )}
        {screen === 'brief' && (
          <BriefScreen
            floor={floor}
            partySize={party.length}
            quests={pendingQuests(floor.id, claimedQuests)}
            // 이제 브리핑 앞에 층 선택(tower)이 낀다 — 돌아가기는 대기실이 아니라
            // 거기로 가야 "선택 → 확인 → 돌아가서 다시 선택"이 자연스럽다.
            onBack={() => setScreen('tower')}
            onStart={start}
          />
        )}
        {screen === 'battle' && result && (
          <BattleScreen
            result={result}
            floor={floor}
            floorIndex={floorIndex}
            onEnd={() => setScreen('result')}
            interventions={interventions}
            onIntervene={intervene}
          />
        )}
        {screen === 'result' && result && (
          <ResultScreen
            result={result}
            roster={snapshot}
            floor={floor}
            /*
              엔딩 판정도 과제 미리보기와 같은 사정이다 — 결과 화면은 finish()보다
              먼저 뜨므로 스토어의 towerCleared는 아직 false다(§5-17).
              그래서 스토어를 읽지 않고 runStore.finish()와 **같은 식**으로 여기서 판정한다.
              지급이 아니라 표시뿐이므로 상태를 건드리지 않는다.
            */
            towerCleared={isFinalFloor(floorIndex)}
            totalDeaths={deathCount + result.casualties.length}
            /*
              결과 화면은 finish()보다 먼저 뜬다 — 이 시점의 스토어 questGrants는
              아직 비어 있다. 그래서 지급 결과를 받아오는 게 아니라 같은 순수 함수로
              **미리 판정해서 보여준다.** 실제 지급은 finish()가 하고, 둘은 같은 입력을
              쓰므로 결과가 갈리지 않는다.
            */
            questGrants={previewQuests()}
            onFinish={() => {
              /*
                무덤행 조건은 ResultScreen의 `ending`(towerCleared && win)과 반드시 같은 뜻이어야
                한다 — 최상층에서 져도 wasFinal만 보고 무덤으로 보내면, 패배 결과 화면(엔딩 패널
                없음, "대기실로" 버튼)을 보고 눌렀는데 무덤이 뜨는 모순이 생긴다. 최상층 패배는
                재도전이 가능해야 하므로 대기실로 돌려보내야 한다.
                finishBattle()이 result를 지우므로 승패도 wasFinal과 함께 미리 읽어둔다.
              */
              const wasFinal = isFinalFloor(floorIndex);
              const wasVictory = result.outcome === 'victory';
              finishBattle();
              /*
                엔딩 직후에는 무덤으로. "기록을 남긴다"가 가리키는 곳이다.
                graveFrom을 명시적으로 되돌린다 — 이전에 시설에서 무덤을 열었다면
                그 값이 남아 있어서 엔딩의 '돌아가기'가 시설로 튄다.
              */
              if (wasFinal && wasVictory) {
                setGraveFrom('base');
                setLegacy(loadLegacy());
                setScreen('grave');
              }
              else setScreen('base');
            }}
          />
        )}

        {/*
          거점 화면의 상시 탭 바. `BaseScreen`이 자기 안에 또 두면 두 줄이 되므로
          거기서는 뺐다 — 탭 바의 소유자는 이제 여기 한 곳뿐이다.
        */}
        {showTabs && <TabBar onSelect={goToTab} active={activeTab} />}
      </div>
      {/*
        detail은 열 때의 스냅샷이라 착용 직후 갱신되지 않는다.
        스토어에서 같은 id를 다시 찾아 최신 상태를 넘긴다 — 안 그러면
        장비를 껴도 상세창 숫자가 그대로다.
      */}
      {detail && (() => {
        const live = roster.find((h) => h.instId === detail.instId) ?? detail;
        return (
          <DetailModal
            hero={live}
            gear={gear}
            onEquip={(gearId) => equipGear(live.instId, gearId)}
            onUnequip={(slot) => unequipGear(live.instId, slot)}
            onToggleFavorite={() => toggleFavorite(live.instId)}
            onClose={() => setDetail(null)}
          />
        );
      })()}
    </div>
  );
}
