/**
 * src/stores/save.ts
 *
 * 저장/불러오기. STEP 3.
 *
 * 이 게임에서 저장은 편의 기능이 아니라 **퍼머데스를 성립시키는 장치**다.
 * 새로고침으로 사망을 무를 수 있으면 영웅을 잃는 무게가 사라지고, 그러면
 * 이 프로젝트의 유일한 차별점이 없어진다. 그래서 전투가 끝나 결과가 확정되는
 * 순간(`finish()`)에 자동 저장한다 — 유저가 저장 시점을 고르게 두지 않는다.
 *
 * 저장 단위는 `RunSlice`에서 **전투 중 상태를 뺀 것**이다.
 * `result`/`snapshot`/`interventions`/`seed`는 전투가 진행 중일 때만 의미가 있고,
 * 복원 시점엔 화면이 이미 대기실이므로 넣으면 오히려 깨진다(runStore.ts 주석 참조).
 *
 * localStorage를 쓰는 이유: 현재 세이브가 2KB 남짓이라 5MB 한도에 한참 못 미치고,
 * 동기 API라 스토어와 화면에 async가 번지지 않는다. 데이터가 커지면
 * 이 파일 내부만 IndexedDB로 갈아끼우면 된다 — 바깥은 이 모듈만 본다.
 */
import { FLOORS } from '../game/data';
import { FACILITY_MAX_LEVEL } from '../game/data/facilities';
import { GEAR_DEFS, GEAR_TUNING } from '../game/data/gear';
import { questById, type QuestId } from '../game/data/quests';
import { initialGachaState } from '../game/gacha';
import type {
  GearDefId, GearInstId, GearInstance, GearSlot, HeroInstId, HeroInstance,
} from '../game/types';
import { initialWallet, type RunSlice } from './runStore';

/** 저장 키. 바꾸면 기존 세이브가 유실된다. */
export const SAVE_KEY = 'tower-of-picks:run';

/**
 * 세이브 포맷 버전.
 * 필드를 더하거나 의미를 바꿨으면 올리고 `migrate()`에 분기를 추가할 것.
 */
export const SAVE_VERSION = 2;

/** 실제로 디스크에 나가는 부분 — RunSlice에서 전투 중 상태를 뺀 것 */
export type SavedRun = Pick<
  RunSlice,
  'floorIndex' | 'maxFloorReached' | 'revisits' | 'roster' | 'party' | 'deathCount'
  | 'wallet' | 'gacha' | 'codex' | 'seenFirstLegendary' | 'towerCleared'
  | 'facilities' | 'gear' | 'gearSeq' | 'battleCount' | 'potions' | 'claimedQuests'
>;

interface SaveFile {
  version: number;
  savedAt: number;
  run: SavedRun;
}

export function serialize(s: RunSlice): string {
  const file: SaveFile = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    // 전투 중 상태를 흘리지 않으려고 필드를 명시적으로 고른다.
    // 스프레드로 넘기면 나중에 RunSlice에 필드가 늘 때 조용히 새어나간다.
    run: {
      floorIndex: s.floorIndex,
      maxFloorReached: s.maxFloorReached,
      revisits: s.revisits,
      roster: s.roster,
      party: s.party,
      deathCount: s.deathCount,
      wallet: s.wallet,
      gacha: s.gacha,
      codex: s.codex,
      seenFirstLegendary: s.seenFirstLegendary,
      towerCleared: s.towerCleared,
      facilities: s.facilities,
      gear: s.gear,
      gearSeq: s.gearSeq,
      battleCount: s.battleCount,
      potions: s.potions,
      claimedQuests: s.claimedQuests,
    },
  };
  return JSON.stringify(file);
}

/** 객체면 그대로, 아니면 undefined — 스프레드 기본값 채우기에 쓴다 */
function asObject(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/**
 * 저장된 장비 하나가 쓸 수 있는 모양인지.
 * 정의에 없는 defId는 여기서 걸러진다 — 통과시키면 보정이 조용히 0이 된다.
 */
function isGear(g: unknown): g is GearInstance {
  if (typeof g !== 'object' || g === null) return false;
  const o = g as Record<string, unknown>;
  return typeof o.instId === 'string'
    && typeof o.defId === 'string'
    && typeof o.enhance === 'number'
    && Number.isFinite(o.enhance)
    && (o.equippedBy === null || typeof o.equippedBy === 'string')
    && GEAR_DEFS[o.defId as GearDefId] != null;
}

/** 저장된 영웅 하나가 최소한의 모양을 갖췄는지 */
function isHero(h: unknown): h is HeroInstance {
  if (typeof h !== 'object' || h === null) return false;
  const o = h as Record<string, unknown>;
  return typeof o.instId === 'string'
    && typeof o.defId === 'string'
    && typeof o.star === 'number'
    && typeof o.level === 'number'
    && typeof o.isDead === 'boolean';
}

/**
 * 문자열 → 상태. 복구 불가능하면 null을 돌려주고 **절대 던지지 않는다.**
 *
 * 깨진 세이브로 앱이 아예 안 뜨는 것이 세이브 하나를 잃는 것보다 나쁘다.
 * 손상 시엔 새 런으로 시작하게 둔다.
 */
export function deserialize(raw: string): SavedRun | null {
  if (!raw) return null;

  let file: unknown;
  try {
    file = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof file !== 'object' || file === null) return null;

  const f = file as Record<string, unknown>;
  const version = typeof f.version === 'number' ? f.version : 0;
  // 미래 버전은 읽지 않는다. 억지로 읽으면 모르는 필드를 떨어뜨린 채 덮어써서
  // 상위 버전 세이브를 조용히 파괴한다.
  if (version > SAVE_VERSION) return null;

  const run = f.run;
  if (typeof run !== 'object' || run === null) return null;
  const r = run as Record<string, unknown>;

  if (!Array.isArray(r.roster)) return null;
  const roster = r.roster.filter(isHero);
  if (roster.length === 0) return null;

  const ids = new Set(roster.filter((h) => !h.isDead).map((h) => h.instId));
  // 죽었거나 존재하지 않는 영웅이 파티에 남아 있으면 걸러낸다.
  // 저장 시점엔 정상이었어도 마이그레이션·수동 편집으로 깨질 수 있다.
  const party = (Array.isArray(r.party) ? r.party : [])
    .filter((id): id is HeroInstId => typeof id === 'string' && ids.has(id as HeroInstId));

  const rawFloor = typeof r.floorIndex === 'number' ? r.floorIndex : 0;
  const floorIndex = Math.max(0, Math.min(FLOORS.length - 1, Math.floor(rawFloor)));

  /*
    v1엔 maxFloorReached가 없다. floorIndex가 "거기까지 갔다"는 뜻이므로 그 값으로 채운다.
    상한이 현재 층보다 낮으면 층 선택이 깨지므로 floorIndex 이상으로 강제한다(수동 편집 방어).
  */
  const rawMax = typeof r.maxFloorReached === 'number' ? r.maxFloorReached : floorIndex;
  const maxFloorReached = Math.max(
    floorIndex,
    Math.min(FLOORS.length - 1, Math.floor(Number.isFinite(rawMax) ? rawMax : floorIndex)),
  );

  /*
    재도전 횟수. 음수·비정수·비숫자는 버린다 — 보상 계수의 입력이라
    이상값이 들어오면 배수가 튄다.
  */
  const rawRevisits = asObject(r.revisits) ?? {};
  const revisits: Record<number, number> = {};
  for (const [k, v] of Object.entries(rawRevisits)) {
    const floorId = Number(k);
    if (!Number.isInteger(floorId) || floorId < 1) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    revisits[floorId] = Math.floor(v);
  }

  const deathCount = typeof r.deathCount === 'number' && r.deathCount >= 0
    ? Math.floor(r.deathCount)
    : 0;

  /*
    지갑·천장·도감은 v1 중간에 추가됐다. 없는 세이브도 읽혀야 하므로
    기본값으로 채운다 — 여기서 null을 돌려주면 STEP 3 시절 세이브가 통째로 버려진다.
  */
  const wallet = { ...initialWallet(), ...asObject(r.wallet) };
  const gacha = { ...initialGachaState(0), ...asObject(r.gacha) };
  const codex = (asObject(r.codex) ?? {}) as SavedRun['codex'];
  const seenFirstLegendary = r.seenFirstLegendary === true;
  // 층 확장 전 세이브에는 없다. 없으면 false — 미클리어로 취급하는 쪽이 안전하다.
  const towerCleared = r.towerCleared === true;

  /*
    시설은 STEP 6에서 추가됐다. 없는 세이브는 전부 미건설(0)로 읽는다.
    레벨은 범위를 강제한다 — 수동 편집으로 Lv.99가 들어오면 회복률·공격력 테이블을
    벗어나 밸런스가 통째로 깨진다.
  */
  const rawFac = asObject(r.facilities) ?? {};
  const facLevel = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(0, Math.min(FACILITY_MAX_LEVEL, Math.floor(v)))
      : 0;
  const facilities: SavedRun['facilities'] = {
    rest: facLevel(rawFac.rest),
    training: facLevel(rawFac.training),
    forge: facLevel(rawFac.forge),
    armory: facLevel(rawFac.armory),
  };

  /*
    장비는 STEP 7에서 추가됐다. 없는 세이브는 빈 인벤토리로 읽는다.

    정의(GEAR_DEFS)에 없는 defId는 버린다 — 도감에서 뺀 장비가 세이브에 남아 있으면
    보정 계산에서 조용히 무시되어 "낀 것 같은데 효과가 없는" 상태가 된다.
    강화 단계도 범위를 강제한다(수동 편집 방지).
  */
  const rawGear = Array.isArray(r.gear) ? r.gear : [];
  const gear = rawGear.filter(isGear).map((g) => ({
    ...g,
    enhance: Math.max(0, Math.min(GEAR_TUNING.maxEnhance, Math.floor(g.enhance))),
  }));

  /*
    착용 관계를 양방향으로 맞춘다. 한쪽만 남으면
    "영웅은 꼈다는데 장비는 창고에 있다"가 되어 보정이 새거나 이중 착용이 생긴다.
  */
  const gearIds = new Set(gear.map((g) => g.instId));
  const aliveIds = new Set(roster.filter((h) => !h.isDead).map((h) => h.instId));
  const claimed = new Set<GearInstId>();
  /*
    개체 이름은 STEP 8 이후에 생긴 필드다. 없는 세이브는 그대로 두고
    (identity.ts의 displayName이 종류 이름으로 폴백한다), 문자열이 아닌 값만 걷어낸다.
    isHero()에서 필수로 검사하지 않는 이유도 같다 — 필수로 만들면 옛 세이브가 통째로 버려진다.
  */
  const cleanText = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined;

  const fixedRoster = roster.map((h) => {
    const named = { ...h, name: cleanText(h.name), title: cleanText(h.title) };
    if (!h.gear) return named;

    const kept: Partial<Record<GearSlot, GearInstId>> = {};
    for (const [slot, id] of Object.entries(h.gear) as Array<[GearSlot, GearInstId]>) {
      // 죽은 영웅은 장비를 들고 있을 수 없다 (finish()가 비우지만 옛 세이브 대비)
      if (!id || !gearIds.has(id) || claimed.has(id) || !aliveIds.has(h.instId)) continue;
      kept[slot] = id;
      claimed.add(id);
    }
    return { ...named, gear: kept };
  });
  const fixedGear = gear.map((g) => ({
    ...g,
    equippedBy: claimed.has(g.instId) ? g.equippedBy : null,
  }));

  const gearSeq = typeof r.gearSeq === 'number' && r.gearSeq >= 0
    ? Math.floor(r.gearSeq)
    // 옛 세이브엔 없다. 보유 수만큼 잡아야 새 장비가 기존 id와 충돌하지 않는다.
    : fixedGear.length;

  // 전리품 RNG를 전투마다 가르는 값. 없으면 0부터 — 재현성만 달라질 뿐 안전하다.
  const battleCount = typeof r.battleCount === 'number' && r.battleCount >= 0
    ? Math.floor(r.battleCount)
    : 0;

  const potions = typeof r.potions === 'number' && r.potions >= 0
    ? Math.floor(r.potions)
    : 0;

  /*
    달성 과제는 STEP 8에서 추가됐다. 없는 세이브는 미달성으로 읽는다.

    정의에 없는 id는 버린다 — 과제를 빼거나 이름을 바꿨을 때 유령 id가 남으면
    목록에 안 보이는데 달성 처리되어 영영 못 받는 보상이 생긴다.
    중복도 제거한다(수동 편집 방지). 순서는 저장 순을 유지한다.
  */
  const rawQuests = Array.isArray(r.claimedQuests) ? r.claimedQuests : [];
  const seenQuest = new Set<string>();
  const claimedQuests = rawQuests.filter((id): id is QuestId => {
    if (typeof id !== 'string' || seenQuest.has(id)) return false;
    if (!questById(id as QuestId)) return false;
    seenQuest.add(id);
    return true;
  });

  return migrate(
    {
      floorIndex, maxFloorReached, revisits, roster: fixedRoster, party, deathCount,
      wallet, gacha, codex, seenFirstLegendary, towerCleared, facilities,
      gear: fixedGear, gearSeq, battleCount, potions, claimedQuests,
    },
    version,
  );
}

/**
 * 버전별 보정.
 *
 * v1 → v2: `maxFloorReached`와 `revisits`가 추가됐다.
 * 두 필드는 `deserialize()`가 이미 기본값으로 채우므로(없으면 floorIndex / {})
 * 여기서 따로 할 일이 없다. v0(version 필드가 없던 세이브)도 같은 경로를 탄다.
 *
 * 포맷을 또 바꾸면 여기에 분기를 넣고 SAVE_VERSION을 올릴 것.
 */
function migrate(run: SavedRun, _version: number): SavedRun {
  return run;
}

/**
 * localStorage 접근은 전부 던질 수 있다.
 * 사파리 프라이빗 모드, 용량 초과, 스토리지 차단 설정 등.
 * 저장 실패가 게임을 멈춰서는 안 되므로 조용히 삼킨다.
 */
export function saveRun(s: RunSlice): void {
  try {
    localStorage.setItem(SAVE_KEY, serialize(s));
  } catch {
    // 저장 실패는 치명적이지 않다 — 진행은 계속된다
  }
}

export function loadRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw === null ? null : deserialize(raw);
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 무시
  }
}
