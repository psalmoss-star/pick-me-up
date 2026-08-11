/**
 * 무덤 저장 계층.
 *
 * save.ts와 같은 규칙을 따른다: **절대 던지지 않는다.**
 * 무덤을 못 읽어서 앱이 안 뜨는 것이 기록 하나 잃는 것보다 나쁘다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_KEY, emptyLegacy, serializeLegacy, deserializeLegacy,
  loadLegacy, saveLegacy, sealedNames,
} from './legacy';
import type { Legacy } from '../game/legacyTypes';
import { createRunStore, initialRoster } from './runStore';
import { clearRun, saveRun, deserialize, serialize } from './save';
import { displayName, displayTitle } from '../game/identity';
import { gameData } from '../game/data';
import { FLOORS } from '../game/data/floors';

/** vitest 환경이 node라 localStorage가 없다 — save.test.ts와 같은 흉내 저장소 */
class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
  get length() { return this.m.size; }
  key = (i: number) => [...this.m.keys()][i] ?? null;
  clear = () => this.m.clear();
}

function sample(): Legacy {
  return {
    ...emptyLegacy(),
    runNo: 2,
    fallen: [
      { name: '물결의 세인', title: '가라앉은 자', star: 3, defId: 'h_tide' as never,
        floorId: 6, revealProgress: 0.62, runNo: 1 },
    ],
    runs: [
      { runNo: 1, reachedFloor: 100, cleared: true, deaths: 12, summons: 47, endedAt: 1 },
    ],
  };
}

describe('무덤 저장', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemStorage());
  });

  it('빈 기록은 1회차에서 시작한다', () => {
    const l = emptyLegacy();
    expect(l.runNo).toBe(1);
    expect(l.fallen).toEqual([]);
    expect(l.runs).toEqual([]);
  });

  it('왕복해도 값이 보존된다', () => {
    const back = deserializeLegacy(serializeLegacy(sample()));
    expect(back.runNo).toBe(2);
    expect(back.fallen[0].name).toBe('물결의 세인');
    expect(back.fallen[0].revealProgress).toBeCloseTo(0.62);
    expect(back.runs[0].cleared).toBe(true);
  });

  it('깨진 JSON은 빈 기록이 된다 (던지지 않는다)', () => {
    expect(() => deserializeLegacy('{{{')).not.toThrow();
    expect(deserializeLegacy('{{{').fallen).toEqual([]);
  });

  it('미래 버전은 빈 기록이 된다', () => {
    const raw = JSON.stringify({ ...sample(), version: 999 });
    expect(deserializeLegacy(raw).fallen).toEqual([]);
  });

  it('필드가 없어도 기본값으로 채운다', () => {
    const l = deserializeLegacy(JSON.stringify({ version: 1 }));
    expect(l.runNo).toBe(1);
    expect(l.fallen).toEqual([]);
    expect(l.codex).toEqual({});
  });

  it('저장한 적 없으면 빈 기록을 돌려준다', () => {
    expect(loadLegacy().fallen).toEqual([]);
  });

  it('저장하고 다시 읽으면 같다', () => {
    saveLegacy(sample());
    expect(loadLegacy().fallen[0].name).toBe('물결의 세인');
  });

  it('봉인 이름 집합을 만든다', () => {
    expect(sealedNames(sample()).has('물결의 세인')).toBe(true);
    expect(sealedNames(sample()).has('없는 이름')).toBe(false);
  });

  it('저장 키가 런 세이브와 다르다', () => {
    // 같은 키면 회차 시작이 무덤을 지운다 — 이 분리가 설계의 핵심이다.
    expect(LEGACY_KEY).not.toBe('tower-of-picks:run');
  });
});

describe('무덤 적재', () => {
  beforeEach(() => localStorage.clear());

  it('clearRun()이 무덤을 지우지 않는다', () => {
    saveLegacy(sample());
    clearRun();
    expect(loadLegacy().fallen[0].name).toBe('물결의 세인');
  });

  it('회차를 시작하면 로스터·재화가 초기화된다', () => {
    const store = createRunStore(() => 42);
    store.setState({ floorIndex: 30, towerCleared: true, deathCount: 9 });
    store.getState().startNewRun();

    const s = store.getState();
    expect(s.floorIndex).toBe(0);
    expect(s.towerCleared).toBe(false);
    expect(s.deathCount).toBe(0);
    expect(s.roster.length).toBe(initialRoster().length);
    expect(s.wallet.gold).toBe(300);
  });

  it('회차를 시작하면 runNo가 오르고 직전 런이 기록된다', () => {
    const store = createRunStore(() => 42);
    store.setState({ floorIndex: 30, towerCleared: true, deathCount: 9 });
    store.getState().startNewRun();

    expect(store.getState().runNo).toBe(2);
    const l = loadLegacy();
    expect(l.runNo).toBe(2);
    expect(l.runs).toHaveLength(1);
    expect(l.runs[0].reachedFloor).toBe(31); // floorIndex 30 = 31층
    expect(l.runs[0].cleared).toBe(true);
    expect(l.runs[0].deaths).toBe(9);
  });

  it('회차를 시작해도 무덤의 사망자는 남는다', () => {
    saveLegacy(sample());
    const store = createRunStore(() => 42);
    // startNewRun()은 C3 가드 이후 towerCleared 없이는 아무 일도 하지 않는다.
    store.setState({ towerCleared: true });
    store.getState().startNewRun();
    expect(loadLegacy().fallen[0].name).toBe('물결의 세인');
  });

  it('도감은 회차를 넘어 유지된다', () => {
    const l = { ...sample(), codex: { h_tide: { firstSeenAt: 1, count: 3 } } as never };
    saveLegacy(l);
    const store = createRunStore(() => 42);
    // startNewRun()은 C3 가드 이후 towerCleared 없이는 아무 일도 하지 않는다.
    store.setState({ towerCleared: true });
    store.getState().startNewRun();
    // freshSlice()의 빈 도감이 아니라 무덤의 도감이 들어와야 한다
    expect(Object.keys(store.getState().codex)).toContain('h_tide');
  });

  it('전투 사망자가 명부에 오른다', () => {
    const store = createRunStore(() => 42);

    /**
     * 사망을 시드가 아니라 상태로 강제한다.
     * 파티 전원의 currentHp를 1로 낮추면 전투 시작 시 최대치로 안 채워지고
     * (battle.ts: currentHp>0이면 그 값을 쓴다) 첫 피격에 곧바로 죽는다 —
     * 시드 사냥보다 견고하고, 어떤 시드를 넣어도 재현된다.
     */
    const dying = store.getState().roster.map((h) => ({ ...h, currentHp: 1 }));
    store.setState({ roster: dying });

    store.getState().start();
    const casualties = store.getState().result?.casualties ?? [];
    expect(casualties.length).toBeGreaterThan(0); // 강제가 실제로 먹었는지 확인

    const deadId = casualties[0];
    const deadHero = store.getState().roster.find((h) => h.instId === deadId)!;
    const expectedName = displayName(deadHero, gameData.heroes);
    const expectedTitle = displayTitle(deadHero, gameData.heroes);

    store.getState().finish();

    const l = loadLegacy();
    expect(l.fallen).toHaveLength(casualties.length);
    const record = l.fallen.find((f) => f.defId === deadHero.defId && f.name === expectedName)!;
    expect(record).toBeDefined();
    expect(record.name).toBe(expectedName);
    expect(record.title).toBe(expectedTitle);
    expect(record.star).toBe(deadHero.star);
    expect(record.floorId).toBe(1);
    expect(record.runNo).toBe(1);
    expect(record.revealProgress).toBeGreaterThanOrEqual(0);
    expect(record.revealProgress).toBeLessThanOrEqual(1);
  });

  it('합성 제물은 명부에 오르지 않는다', () => {
    const store = createRunStore(() => 42);
    const [target, sacrifice] = store.getState().roster;
    store.getState().fuse(target.instId, sacrifice.instId);

    // 제물은 로스터에서 사라졌지만 casualties가 아니므로 무덤 기록은 그대로 비어 있다.
    expect(loadLegacy().fallen).toEqual([]);
  });
});

/**
 * 최종 리뷰에서 잡힌 회귀 4건.
 *
 * 위의 기존 테스트는 전부 "무덤이 비어 있는 상태"에서 시작한다 — 그래서
 * "무덤엔 이미 데이터가 있는데 런은 비어 있다"는 상태(새로고침 직후가 정확히 이렇다)를
 * 한 번도 재현하지 못했고, 그게 C1·C2가 리뷰를 통과한 이유다. 아래는 그 상태를
 * 명시적으로 만들어 검증한다.
 */
describe('최종 리뷰 회귀 — 회차 복원·도감 병합·시작 가드·정상 기록', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemStorage()));

  it('C1: 새로고침(hydrate) 후에도 runNo가 무덤과 일치한다', () => {
    // 무덤은 이미 2회차를 가리키는데, 런 세이브에는 runNo가 없다(설계상 의도 — save.ts §3.1).
    saveLegacy({ ...sample(), runNo: 2 });

    // "새로고침 직전"의 런 세이브를 하나 만든다. runNo 필드 자체가 SavedRun에 없으므로
    // 여기서 몇 회차였는지는 저장 데이터에 아무 흔적도 남기지 않는다.
    const before = createRunStore(() => 42);
    saveRun(before.getState());

    // 새로고침 후: 완전히 새 스토어 인스턴스(freshSlice → runNo:1)에 저장된 런을 hydrate.
    const fresh = createRunStore(() => 42);
    expect(fresh.getState().runNo).toBe(1); // hydrate 전 기준선

    const saved = deserialize(serialize(before.getState()))!;
    fresh.getState().hydrate(saved);

    // AFTER RELOAD: 무덤(legacy.runNo=2)과 일치해야 한다. 고쳐지지 않으면 1로 남는다.
    expect(fresh.getState().runNo).toBe(2);
    expect(fresh.getState().runNo).toBe(loadLegacy().runNo);
  });

  it('C2: summon()은 무덤 도감을 대체하지 않고 병합한다', () => {
    // 무덤에 h_ember가 이미 등록돼 있다 — 예: 이전 회차 또는 다른 경로로 얻은 영웅.
    const legacyWithEmber: Legacy = {
      ...emptyLegacy(),
      runNo: 1,
      codex: { h_ember: { firstSeenAt: 1, count: 1 } } as never,
    };
    saveLegacy(legacyWithEmber);

    // 런은 도감이 비어 있는 채로 시작한다(예: startNewRun()을 거치지 않은 새 스토어 —
    // C1의 새로고침 경로와 동일한 전제).
    const store = createRunStore(() => 42);
    expect(store.getState().codex).toEqual({});

    // 소환 1회. 결과와 무관하게 codex가 최소 1건은 등록된다.
    const result = store.getState().summon('free');
    expect(result.ok).toBe(true);

    // 무덤의 기존 항목(h_ember)이 사라지면 안 된다 — 병합이 아니라 대체하면 이게 깨진다.
    const after = loadLegacy();
    expect(Object.keys(after.codex)).toContain('h_ember');
    // 이번 소환으로 얻은 영웅도 함께 있어야 한다(병합이지 무시가 아니라는 뜻).
    expect(Object.keys(after.codex).length).toBeGreaterThan(1);
  });

  it('C3: towerCleared 없이 startNewRun()을 불러도 유령 기록이 남지 않는다', () => {
    saveLegacy(emptyLegacy());
    const store = createRunStore(() => 42);
    // 최상층을 깨지 않은 채(towerCleared: false, 기본값) 직접 호출 — UI 가드를 우회한 상황.
    store.setState({ floorIndex: 0, deathCount: 0 });
    store.getState().startNewRun();

    // 가드가 없다면 runNo가 2로 오르고 reachedFloor:1/cleared:false 유령 기록이 append된다.
    expect(store.getState().runNo).toBe(1);
    const l = loadLegacy();
    expect(l.runNo).toBe(1);
    expect(l.runs).toEqual([]);
  });

  it('I1: 최상층을 다시 도전해 사상자가 나도 정상 기록이 빈 파티로 오염되지 않는다', () => {
    const store = createRunStore(() => 42);
    /**
     * dedupe(`!legacy.summit.some(x => x.runNo === legacy.runNo)`)는 summit에
     * 이번 runNo 기록이 "이미 있을 때만" 막는다 — 최초 클리어 순간에 정상 기록을 놓친 채
     * (예: 그 전투에 party가 비어 있었다거나) 넘어간 런이라면 summit이 비어 있는 채로
     * towerCleared만 true다. 이 상태에서 재도전 중 사상자가 나면, wasCleared 판정이 없는
     * 버전은 "전이 아님"을 구분 못 해 사망 후 파티(비거나 줄어든)로 summit을 채운다.
     */
    saveLegacy({ ...emptyLegacy(), runNo: 1, summit: [] });
    const firstParty = store.getState().roster.slice(0, 2).map((h) => h.instId);
    store.setState({ towerCleared: true, party: firstParty });

    // 파티 전원을 빈사 상태로 만들어 재도전에서 전멸(사상자 발생)을 강제한다.
    const dying = store.getState().roster.map((h) => ({ ...h, currentHp: 1 }));
    store.setState({ roster: dying });
    store.getState().start();
    const casualties = store.getState().result?.casualties ?? [];
    expect(casualties.length).toBeGreaterThan(0);

    store.getState().finish();

    /**
     * 이미 towerCleared였으므로 이번 전투는 "막 클리어한 순간"이 아니다.
     * wasCleared 가드가 없으면 사망자로 줄어든(또는 전멸한) 파티가 summit에 기록된다.
     * 고쳐진 버전은 애초에 전이 시점이 아니므로 아무것도 쓰지 않는다.
     */
    expect(loadLegacy().summit).toEqual([]);
  });

  it('I1: 승리 직후라도 정상 파티가 전멸(빈 배열)이면 summit에 기록하지 않는다', () => {
    saveLegacy(emptyLegacy());
    const store = createRunStore(() => 42);

    /*
      ⚠️ **최상층에 서 있어야 이 검증이 성립한다.**
      towerCleared는 `cleared && isFinalFloor(floorIndex)`로만 서므로, floorIndex가 0이면
      승리를 주입해도 전이가 일어나지 않고 summit 블록 자체가 실행되지 않는다 —
      그러면 이 테스트는 가드를 지워도 통과하는 빈 테스트가 된다(실제로 그랬다).
    */
    store.setState({ floorIndex: FLOORS.length - 1 });

    const dying = store.getState().roster.map((h) => ({ ...h, currentHp: 1 }));
    store.setState({ roster: dying });
    store.getState().start();

    /*
      승리하면서 파티 전원이 죽는 상황은 시드 조작으로 만들기 어렵다.
      전이 조건(towerCleared)과 빈 파티를 동시에 만들기 위해 결과를 주입한다 —
      party 전원을 사상자로 넣어 생존 파티원이 0명이 되게 한다.
    */
    const partyIds = store.getState().party;
    store.setState({
      result: { ...store.getState().result!, outcome: 'victory', casualties: [...partyIds] },
    });
    store.getState().finish();

    // 전이는 실제로 일어났는가 — 이게 false면 위 주입이 무의미해진 것이다.
    expect(store.getState().towerCleared).toBe(true);
    // heroes.length === 0 가드가 없다면 여기서 빈 summit row가 append된다.
    expect(loadLegacy().summit).toEqual([]);
  });
});
