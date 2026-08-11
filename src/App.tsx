import { useState, useEffect } from 'react';
import { BaseScreen } from './screens/BaseScreen';
import { BriefScreen } from './screens/BriefScreen';
import { SummonScreen } from './screens/SummonScreen';
import { ForgeScreen } from './screens/ForgeScreen';
import { FacilityScreen } from './screens/FacilityScreen';
import { ShopScreen } from './screens/ShopScreen';
import { SmithScreen } from './screens/SmithScreen';
import { GraveScreen } from './screens/GraveScreen';
import { BattleScreen } from './screens/BattleScreen';
import { ResultScreen } from './screens/ResultScreen';
import { DetailModal } from './screens/DetailModal';
import { T } from './ui/tokens';
import { useRunStore } from './stores/runStore';
import { loadRun } from './stores/save';
import { loadLegacy } from './stores/legacy';
import { floorAt } from './game/data';
import { isFinalFloor } from './game/data/floors';
import {
  evaluateQuests, pendingQuests, questContext, questRng, type QuestGrant,
} from './game/quest';
import type { HeroInstance } from './game/types';

type Screen =
  | 'base' | 'brief' | 'battle' | 'result'
  | 'summon' | 'forge' | 'facility' | 'shop' | 'smith' | 'grave';

/** 모바일 전용. 데스크톱에서도 이 폭의 세로 화면을 중앙에 띄운다. */
const MOBILE_WIDTH = 480;

export default function App() {
  /**
   * 뷰 상태만 여기 남는다. 게임 상태는 runStore에 있다.
   * screen을 스토어에 넣지 않는 이유는 runStore.ts 주석 참조 (저장 시 복원 불가).
   */
  const [screen, setScreen] = useState<Screen>('base');
  const [detail, setDetail] = useState<HeroInstance | null>(null);
  // 무덤은 저장소에서 읽으므로 화면을 열 때 최신값을 가져온다.
  const [legacy, setLegacy] = useState(() => loadLegacy());

  const floorIndex = useRunStore((s) => s.floorIndex);
  const towerCleared = useRunStore((s) => s.towerCleared);
  const roster = useRunStore((s) => s.roster);
  const party = useRunStore((s) => s.party);
  const result = useRunStore((s) => s.result);
  const snapshot = useRunStore((s) => s.snapshot);
  const interventions = useRunStore((s) => s.interventions);
  const wallet = useRunStore((s) => s.wallet);
  const gacha = useRunStore((s) => s.gacha);
  const seenFirstLegendary = useRunStore((s) => s.seenFirstLegendary);

  const toggleParty = useRunStore((s) => s.toggleParty);
  const startBattle = useRunStore((s) => s.start);
  const intervene = useRunStore((s) => s.intervene);
  const finishBattle = useRunStore((s) => s.finish);
  const hydrate = useRunStore((s) => s.hydrate);
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
  }, [hydrate]);

  const floor = floorAt(floorIndex);

  /** 전투 계산은 스토어가 하고, 화면 전환만 여기서 한다 */
  const start = () => {
    if (startBattle()) setScreen('battle');
  };

  const finish = () => {
    finishBattle();
    setScreen('base');
  };

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
        // minHeight는 index.css의 #root가 100dvh로 처리한다 (인라인은 폴백 선언 불가)
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
          minHeight: 'inherit',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {screen === 'base' && (
          <BaseScreen
            floor={floor}
            floorIndex={floorIndex}
            roster={roster}
            party={party}
            onToggleParty={toggleParty}
            onEnter={() => setScreen('brief')}
            onInspect={setDetail}
            onSummon={() => setScreen('summon')}
            onForge={() => setScreen('forge')}
            onFacility={() => setScreen('facility')}
            onShop={() => setScreen('shop')}
            onSmith={() => setScreen('smith')}
            towerCleared={towerCleared}
            deathCount={deathCount}
          />
        )}
        {screen === 'facility' && (
          <FacilityScreen
            facilities={facilities}
            wallet={wallet}
            onUpgrade={upgradeFacility}
            onBack={() => setScreen('base')}
            deathCount={deathCount}
            onOpenGrave={() => { setLegacy(loadLegacy()); setScreen('grave'); }}
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
            onBack={() => setScreen('facility')}
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
            onBack={() => setScreen('base')}
          />
        )}
        {screen === 'summon' && (
          <SummonScreen
            wallet={wallet}
            gacha={gacha}
            seenFirstLegendary={seenFirstLegendary}
            onSummon={summon}
            onLegendarySeen={markLegendarySeen}
            onBack={() => setScreen('base')}
          />
        )}
        {screen === 'brief' && (
          <BriefScreen
            floor={floor}
            partySize={party.length}
            quests={pendingQuests(floor.id, claimedQuests)}
            onBack={() => setScreen('base')}
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
            onFinish={finish}
          />
        )}
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
            onClose={() => setDetail(null)}
          />
        );
      })()}
    </div>
  );
}
