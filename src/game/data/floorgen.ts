/**
 * 층 생성기 — 21층 이후.
 *
 * ── 왜 필요한가 ────────────────────────────────────────
 * 1~20층은 손으로 짰다. 8개 층(13~20)에 sim을 6~7회 돌렸고 중복 구성이 3번 나왔다.
 * 같은 방식으로 80층을 더 하는 것은 감당이 안 되고, 무엇보다 **재미가 없는 반복**이다.
 *
 * ── 무엇을 생성하고 무엇을 안 하는가 ──────────────────
 * 생성: 일반 층의 적 구성 / 임무 / 배경 / 보호 대상 수치
 * 손으로: **보스 층**(10층마다). 최상층과 구간 보스는 개성이 있어야 한다.
 *
 * ── 반드시 결정적이어야 한다 ──────────────────────────
 * 같은 층 번호는 **언제나 같은 층**이 나와야 한다. 안 그러면
 *   - 세이브에 층 내용을 저장해야 하고(용량·마이그레이션 부담)
 *   - `npm run sim`으로 잰 승률이 다음 실행에서 달라져 밸런싱이 불가능해진다.
 * 그래서 Math.random을 쓰지 않고 **층 번호에서 유도한 해시**로만 뽑는다.
 * (`src/game/`의 RNG 규칙과 같은 정신이다 — 재현 불가능한 무작위는 이 프로젝트에서 금지다.)
 */
import type { EnemyDefId } from '../types';
import type { GuardDef, Mission, MissionKind } from '../mission';
import { ENEMY } from './sample';
import { enemies } from './enemies';
import { FLOOR_VARIANT } from './floorVariants';
import type { FloorScene, FloorSpec } from './floors';

/** 손으로 짠 층의 마지막 번호. 여기까지는 floors.ts의 배열이 정본이다. */
export const HANDCRAFTED_UNTIL = 20;

/** 최종 목표 층. */
export const TOWER_HEIGHT = 100;

/** 보스 주기 — 10층마다. 20층까지의 리듬(6·12·20)을 이어받되 규칙적으로 만든다. */
export const BOSS_EVERY = 10;

/**
 * 같은 적 구성이 다시 나오기까지 최소 간격.
 *
 * 적 풀이 6~7종인데 3~4기를 뽑아 80층을 채우므로 **전체 무중복은 불가능하다**
 * (비둘기집 원리). 멀리 떨어진 층끼리 같은 것은 플레이 중에 알아채지 못하므로
 * 간격만 강제한다. `floors.test.ts`가 이 값으로 잠근다.
 */
export const MIN_REPEAT_GAP = 8;

/**
 * 한 층에 같은 적이 들어갈 수 있는 최대 기수.
 *
 * 같은 디버프가 겹치면 급격히 무너진다(§STEP 9). 예전에는 재추첨 3번의
 * best-effort라 실제로 새어 나갔다(89층 hexweaver 3기 — 실측).
 */
export const MAX_SAME_ENEMY = 2;

/**
 * 한 층에 같은 **역할**의 적이 들어갈 수 있는 최대 기수.
 *
 * 적 id가 달라도 역할이 같으면 같은 방식으로 무너뜨린다 — §5-19에서
 * 방깎 2기로 16층이 8%(전멸), 광역 2기로 19층이 97%→25%가 됐다.
 * 기수를 4~6으로 올리면 중복 확률이 구조적으로 오르므로 id 상한만으로는 부족하다.
 *
 * ⚠️ 상층 풀은 7종 중 4종이 dealer다. 이 값을 1로 내리면 채울 적이 없어
 * 기수가 무너진다(`pickUnderCaps`가 자리를 포기한다).
 */
export const MAX_SAME_ROLE = 2;

/**
 * 같은 층 **이름**이 다시 나오기까지 최소 간격.
 *
 * 적 구성보다 크게 잡는다. 구성은 전투 중에 흐릿하게 인지되지만 **이름은 화면 상단에
 * 글자로 박혀 있어** 훨씬 쉽게 기억된다. 실측으로 '얼어붙은 제단'이 32·36층에
 * 간격 4로 나왔는데, 이 정도면 플레이 중에 바로 알아챈다.
 *
 * 16×16=256조합에 80층이라 간격 20은 충분히 여유가 있다(재추첨 24회면 반드시 성공).
 * `floors.test.ts`가 이 값으로 잠근다.
 */
export const NAME_REPEAT_GAP = 20;

/**
 * 같은 **장소어**(NAME_B — '옥좌', '묘역' …)가 다시 나오기까지 최소 간격.
 *
 * 전체 이름 간격(20)보다 짧다. 장소어가 16종뿐이라 80층을 채우려면 재사용이 불가피하고,
 * 20을 요구하면 후보가 고갈돼 오히려 이름 중복이 생긴다.
 * 막으려는 것은 **인접 반복**이다 — '창백한 옥좌' 다음 층이 '얼어붙은 옥좌'면
 * 수식어만 갈아끼운 게 드러난다.
 */
export const PLACE_REPEAT_GAP = 6;

/** 이름에서 장소어만 떼어낸다. 이름은 항상 '수식어 장소어' 두 토막이다. */
function placeOf(name: string): string {
  return name.slice(name.indexOf(' ') + 1);
}

/**
 * 결정적 해시. 층 번호 + 용도(salt)로 0~1 값을 만든다.
 *
 * 층마다 여러 번 뽑아야 하는데(적/임무/배경…) 같은 값이 나오면 안 되므로
 * salt로 스트림을 나눈다. rng.ts의 substream과 같은 발상이다.
 */
function pick01(floorId: number, salt: number): number {
  // salt를 먼저 섞는다. 층 번호만 먼저 해싱하면 인접 층이 비슷한 값을 내
  // 서로 다른 층에서 같은 구성이 자주 나온다(실제로 80층 중 17쌍이 겹쳤다).
  let h = Math.imul((floorId * 0x27d4eb2d) ^ (salt * 0x165667b1), 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h ^ floorId, 0x9e3779b1);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/** 배열에서 하나 고른다 (결정적) */
function pickOne<T>(arr: readonly T[], floorId: number, salt: number): T {
  return arr[Math.floor(pick01(floorId, salt) * arr.length) % arr.length];
}

// ------------------------------------------------------------
// 구간 정의 — 난이도 곡선의 단일 출처
// ------------------------------------------------------------

export interface Tier {
  /** 이 구간이 시작되는 층 */
  from: number;
  name: string;
  /** 이 구간에서 뽑을 수 있는 일반 적 */
  pool: EnemyDefId[];
  /** 도발을 가진 적 — §5-11. 최소 하나는 섞여야 힐러가 먼저 죽는 구조가 안 된다 */
  taunts: EnemyDefId[];
  /**
   * 적 기수 범위 — 일반 층에만 적용된다(보스 층은 보스+호위 2~3기 고정).
   *
   * 정원이 5로 늘자 3~4기로는 생성 구간이 사실상 전부 100%가 됐다(STEP 29).
   * 수치 배수가 아니라 기수로 올린다 — 지수는 0.008 폭에서 결과가 뒤집히는
   * 칼날이고(STEP 15) 기수는 선형에 가깝다.
   *
   * ⚠️ 상한은 6을 넘기지 말 것. `MAX_SAME_ROLE`이 2인데 풀의 역할이 3~4종이라
   * 7기째는 채울 후보가 없어 조용히 잘린다.
   */
  count: [number, number];
  /** 보호 대상 HP 기준값 (수비/호위 층에서 사용) */
  guardHp: number;
  guardDef: number;
  /** 이 구간의 보스 */
  boss: EnemyDefId;
}

/**
 * 구간은 20층 단위다.
 *
 * 왜 20층인가: 10층마다 보스가 오므로 한 구간에 보스가 2번 들어간다.
 * 구간을 10층으로 끊으면 적 풀이 매 10층 갈려 "방금 본 적"이 사라져 연속성이 없고,
 * 40층으로 끊으면 같은 적을 40층 내내 본다.
 *
 * 적 풀은 **겹치게** 짰다. 21층에서 중층 적이 사라지면 난이도가 급변하고,
 * 무엇보다 19종으로 100층을 채우려면 재사용이 불가피하다.
 * 대신 구간이 오를수록 강한 적의 비중이 늘어난다.
 */
export const TIERS: Tier[] = [
  {
    from: 21, name: '상층',
    pool: [
      ENEMY.seraph, ENEMY.wraith, ENEMY.wisp, ENEMY.revenant,
      ENEMY.plaguebearer, ENEMY.direwolf, ENEMY.hexweaver,
    ],
    taunts: [ENEMY.colossus, ENEMY.stonewarden, ENEMY.warden],
    count: [4, 5], guardHp: 3800, guardDef: 56,
    boss: ENEMY.hierophant,
  },
  {
    from: 41, name: '심층',
    pool: [
      ENEMY.seraph, ENEMY.wraith, ENEMY.plaguebearer,
      ENEMY.hexweaver, ENEMY.grovekeeper, ENEMY.direwolf,
    ],
    taunts: [ENEMY.colossus, ENEMY.stonewarden],
    count: [4, 6], guardHp: 5200, guardDef: 68,
    boss: ENEMY.blightlord,
  },
  {
    from: 61, name: '천층',
    pool: [
      ENEMY.seraph, ENEMY.wraith, ENEMY.plaguebearer,
      ENEMY.hexweaver, ENEMY.grovekeeper, ENEMY.revenant,
    ],
    taunts: [ENEMY.colossus, ENEMY.stonewarden],
    count: [5, 6], guardHp: 6800, guardDef: 80,
    boss: ENEMY.warcaller,
  },
  {
    from: 81, name: '정상',
    pool: [
      ENEMY.seraph, ENEMY.wraith, ENEMY.grovekeeper,
      ENEMY.hexweaver, ENEMY.plaguebearer, ENEMY.direwolf,
    ],
    taunts: [ENEMY.colossus, ENEMY.stonewarden],
    count: [5, 6], guardHp: 8600, guardDef: 92,
    boss: ENEMY.sovereign,
  },
];

export function tierOf(floorId: number): Tier {
  let found = TIERS[0];
  for (const t of TIERS) if (floorId >= t.from) found = t;
  return found;
}

/**
 * 층 깊이에 따른 적 스탯 배수.
 *
 * ── 왜 필요한가 ────────────────────────────────────────
 * 영웅은 ★2→★6에서 배수가 1.35→5.4(**4배**)로 커지고 레벨도 15→99로 오른다.
 * 적 수치가 고정이면 90층 적이 21층 적과 같아서, 실제로 생성 구간 표본이
 * **전부 승률 100%**였다. 층을 만들어도 전투가 성립하지 않았다.
 *
 * ── 곡선 ───────────────────────────────────────────────
 * 1~20층은 **반드시 1.0**이다. 실측으로 잡은 승률 표(§STEP 9)가 여기 걸려 있어
 * 배수를 먹이면 검증된 밸런스가 통째로 날아간다.
 *
 * 21층부터 층당 복리로 오른다. 영웅 성장이 등급 승급(불연속)+레벨(연속)의 곱이라
 * 선형으로 따라가면 구간 끝에서 벌어진다 — 지수가 자연스럽다.
 *
 * ⚠️ **지수는 영웅 성장폭에서 역산해야 한다.** 처음에 1.031로 냈다가
 * 100층 배수가 **11.5배**가 되어 40층부터 승률이 0%로 붙었다.
 * 실제 영웅 성장은 그만큼 크지 않다(실측):
 *
 *   ★5 Lv.60 → ★6 Lv.99 = 등급 1.42배 × 레벨 1.65배 ≈ **2.34배**
 *
 * 적도 같은 폭으로 커져야 하지만 **성장 배수를 그대로 맞추면 안 된다.**
 * 영웅에는 장비·잠재치·개입·포션이 추가로 얹히기 때문이다 —
 * 실제로 1.012(100층 2.6배)로 잡았더니 표본이 거의 전부 100%였다.
 * 성장보다 조금 더 앞서게 잡는다.
 *
 *   40층 ≈ 1.4배 · 60층 ≈ 1.9배 · 80층 ≈ 2.5배 · 100층 ≈ 3.4배
 *
 * **이 값은 칼날이다**(§5-1과 같은 성질). 실측한 양끝:
 *   1.031 → 100층 11.5배, **40층부터 전멸**
 *   1.020 → 100층  4.8배, **60층부터 전멸**
 *   1.012 → 100층  2.6배, **전 구간 100%**
 * 폭이 0.008밖에 안 되는데 결과가 완전히 뒤집힌다.
 * 만졌으면 반드시 `npm run sim`으로 표본 승률을 확인할 것.
 */
export const DEPTH_MULT_BASE = 1.015;

export function enemyStatMultFor(floorId: number): number {
  if (floorId <= HANDCRAFTED_UNTIL) return 1;
  const base = DEPTH_MULT_BASE ** (floorId - HANDCRAFTED_UNTIL);
  /**
   * 보스 층은 배수를 **덜 먹인다**.
   *
   * 보스 자체가 이미 일반 적의 2~3배 HP를 갖고 있어서, 같은 배수를 곱하면
   * 격차가 곱으로 벌어진다 — 실측으로 90층 보스 층이 32,959, 같은 깊이 일반 층이
   * 23,016이었고 승률이 4% vs 100%로 갈렸다.
   * 보스는 "수치가 큰 적"이 아니라 "다르게 싸워야 하는 적"이어야 한다.
   *
   * ⚠️ **0.55 → 0.45 (2026-08-14).** 0.55에서는 90층이 승률 53%·**사망 1.93**이라
   * 이겨도 3인 중 2인을 잃어 다음 층으로 못 넘어갔다 — 연속 등반에서 **48%가 여기서 막혔다**
   * (§5-22: 승률만 보고 층을 합격시키지 말 것). 게다가 15.4턴이라
   * `e_sovereign` 주석이 경고한 "어려운 게 아니라 **긴** 것"이 깊이 배수 때문에 재발했다.
   *
   * 실측(90층, 기준 파티 / 대체 파티):
   *   0.55 → 53%·사망 1.93 / 22%·2.68   ← 진행 불가
   *   **0.45 → 78%·사망 1.13 / 56%·1.97**  ← 이기되 한 명 값을 치른다
   *   0.35 → 94%·사망 0.45 / 89%·1.02   ← 보스가 안 무섭다
   * 소모전(이기되 대가를 치른다)을 목표로 0.45를 골랐다.
   */
  return floorId % BOSS_EVERY === 0 ? 1 + (base - 1) * 0.45 : base;
}

// ------------------------------------------------------------
// 임무 배치
// ------------------------------------------------------------

/**
 * 임무 리듬 — 10층 주기.
 *
 * **5의 배수는 수비/호위(숨돌림)**다. 9층·15층·19층이 그 역할을 했고
 * 실측으로 97~98%가 나왔다 — 매 층이 학살이면 플레이가 지친다(§STEP 9).
 * 나머지는 토벌을 기본으로 하되 생존/탈출/탈취를 섞어 6종을 모두 쓴다.
 */
const CYCLE: MissionKind[] = [
  'subjugate', // 1
  'seize',     // 2
  'escape',    // 3
  'subjugate', // 4
  'defend',    // 5 ← 숨돌림
  'subjugate', // 6
  'survive',   // 7
  'escort',    // 8
  'subjugate', // 9
  'subjugate', // 10 ← 보스(아래에서 덮어씀)
];

const SCENES: FloorScene[] = ['ruins', 'field', 'outpost', 'gate', 'corridor', 'chasm'];

/**
 * 층 이름 — 수식어 + 장소. 조합으로 만든다(66×… 이름 어휘와 같은 발상)
 *
 * ⚠️ **어휘를 줄이지 말 것.** 16×16=256조합으로 80층을 채우는데도
 * 생일 문제 때문에 무작위로 뽑으면 중복이 수십 쌍 나온다(12×12=144일 때 실측 15종이었다).
 * 조합 수는 `pickName()`의 재추첨이 성공할 여지를 만드는 것이지, 그 자체로 중복을 막지 못한다.
 */
const NAME_A = [
  '무너진', '잿빛', '봉인된', '메마른', '끝없는', '얼어붙은',
  '잊혀진', '피어린', '고요한', '뒤틀린', '검은', '부서진',
  '침묵의', '녹슨', '허물어진', '창백한',
];
const NAME_B = [
  '회랑', '성소', '계단', '안뜰', '묘역', '성문',
  '탑신', '광장', '제단', '수로', '난간', '옥좌',
  '중정', '망루', '아치', '지하도',
];

/**
 * 손으로 짠 층(1~20)의 이름 — 생성 이름이 이걸 다시 쓰면 안 된다.
 *
 * 실측으로 **100층이 19층과 똑같이 '잿빛 회랑'**이었다. 어제 공들인 엔딩이
 * 재탕 이름 위에서 뜨고 있었던 것이다. 5층('무너진 회랑')도 생성 어휘와 겹친다.
 *
 * ⚠️ 여기에 `floors.ts`를 import하면 **순환 참조**가 된다(floors.ts가 이 파일을 부른다).
 * 그래서 겹치는 것만 문자열로 적는다 — 손으로 짠 층은 20개뿐이고 더 늘지 않으므로
 * 목록이 낡을 위험보다 순환 참조가 더 나쁘다.
 */
const HANDCRAFTED_NAMES: readonly string[] = [
  '무너진 관문', '재의 들판', '버려진 초소', '성문 앞', '무너진 회랑', '균열의 심장',
  '잿바람 고개', '봉쇄된 계단', '파수병의 안뜰', '재의 묘역', '폭군의 성문', '무너지는 첨탑',
  '무쇠 계단', '빛바랜 성소', '침묵의 제단', '군주의 앞뜰', '재의 강', '깨어진 왕좌',
  '잿빛 회랑', '잿불의 옥좌',
];

/**
 * 최상층 이름 — 생성에 맡기지 않는다.
 *
 * 100층은 엔딩이 뜨는 층이라 "무너진 중정" 같은 조합 이름이면 무게가 안 실린다.
 * 보스 층 중 유일하게 손으로 준다(나머지 보스 층은 조합으로 충분하다).
 */
const SUMMIT_NAME = '잿불의 왕좌';

/** 임무별 브리핑. 층마다 다르게 보이되 의미는 임무가 결정한다. */
function briefingOf(kind: MissionKind, turns: number): string {
  switch (kind) {
    case 'subjugate': return '앞을 막은 것들을 베어라!';
    case 'survive': return `지원이 올 때까지 ${turns}턴간 버텨라!`;
    case 'defend': return `제단이 부서지기 전에 ${turns}턴을 사수하라!`;
    case 'escort': return '동행자를 살린 채 길을 뚫어라!';
    case 'escape': return `길이 무너진다. ${turns}턴간 버틴 뒤 이탈하라!`;
    case 'seize': return '앞장선 것을 베어라! 나머지는 상대하지 않아도 된다.';
  }
}

// ------------------------------------------------------------
// 생성
// ------------------------------------------------------------

/**
 * 생성 결과 캐시.
 *
 * 생성이 결정적이므로 캐싱해도 결과가 달라지지 않는다 — 순수하게 성능만을 위한 것이다.
 * 중복 회피가 이전 층을 참조하므로 캐시 없이는 재귀가 **지수적으로 터진다**
 * (한 층이 8개 이전 층을 부르고 그 각각이 또 8개 — 실제로 테스트가 5분 넘게 멈췄다).
 */
const enemyCache = new Map<number, EnemyDefId[]>();

/**
 * 적 구성을 뽑는다.
 *
 * 규칙(전부 이미 밟은 함정에서 나온 것이다):
 *  - **도발 적을 반드시 하나 넣는다**(§5-11). 없으면 힐러가 먼저 죽어 승률이 0/100으로 굳는다.
 *  - **같은 적을 3기 이상 넣지 않는다.** 같은 디버프가 겹치면 급격히 무너진다(§STEP 9).
 *  - 보스 층은 보스 + 호위 1~2기.
 */
function pickEnemies(floorId: number, tier: Tier, isBoss: boolean): EnemyDefId[] {
  const cached = enemyCache.get(floorId);
  if (cached) return cached;

  const result = computeEnemies(floorId, tier, isBoss);
  enemyCache.set(floorId, result);
  return result;
}

/**
 * 뽑을 수 있는 변형의 개수.
 *
 * 중복 회피(아래)와 승률 조정(`scripts/floor-tune.mts`)이 **같은 변형 목록**을 쓴다.
 * 둘이 다른 범위를 보면 튜닝 도구가 고른 번호를 생성기가 못 만들어낸다.
 *
 * ⚠️ **6에서 24로 늘렸다.** 정상 구간(81~100)은 깊이 배수가 2.8~3.2배라
 * 어지간한 조합은 전부 전멸한다 — 6개 중에 합격이 하나도 없는 층이 6개 있었다
 * (89·96·99층은 6변형 전부 승률 0~36%). 후보를 늘리면 그 안에 통과하는 조합이 생긴다.
 *
 * 늘려도 **런타임 비용은 0이다.** 생성기는 표(`floorVariants.ts`)에 적힌 번호 하나만
 * 만들고, 24개를 전부 돌려보는 것은 빌드 타임 스크립트뿐이다.
 * 중복 회피 루프도 대개 첫 후보에서 끝나므로 실질 비용이 없다.
 */
export const VARIANT_COUNT = 24;

/**
 * 중복 회피가 훑는 범위 — **원래 값(6)에서 늘리지 말 것.**
 * 이 값을 키우면 지금 v0으로 확정된 층들이 다른 구성으로 갈아타 기존 승률이 흔들린다.
 * `VARIANT_COUNT`와 분리해 둔 이유가 그것이다.
 */
const DEDUPE_VARIANTS = 6;

/**
 * 한 층의 적 구성을 만든다 — 변형 번호로 여러 후보를 낼 수 있다.
 *
 * 규칙(전부 이미 밟은 함정에서 나온 것이다):
 *  - **도발 적을 반드시 하나 넣는다**(§5-11).
 *  - **같은 적을 3기 이상 넣지 않는다**(§STEP 9).
 *
 * ⚠️ 이 두 규칙만으로는 **승률이 보장되지 않는다.** 2026-08-14 전수 측정에서
 * 규칙을 다 지킨 층 28개가 승률 50% 미만이었다(12개는 0~7%).
 * 원인은 수치 총량이 아니라 **적 조합 × 임무의 상호작용**이라 생성 규칙으로는 못 막는다.
 * 그래서 `floorVariants.ts`가 실측으로 고른 변형 번호를 덮어쓴다.
 *
 * 순수 함수로 export하는 이유는 튜닝 스크립트가 같은 구성을 재현해야 하기 때문이다 —
 * 스크립트가 자체 구현을 두면 생성기와 조용히 갈라진다(§5-28과 같은 성격).
 */
/**
 * 한 자리를 채울 적을 고른다 — **상한을 반드시 지킨다.**
 *
 * 예전에는 최대 3번 다시 뽑고 실패하면 그냥 넣었다. 그래서 상한이 "권고"였고
 * 실제로 새어 나갔다 — 89층에 hexweaver가 3기(같은 적 상한 2 위반),
 * 28·99층에 dealer가 3기 있었다(실측). 기수를 4~6으로 올리면 한 층이 풀에서
 * 뽑는 횟수가 늘어 이 확률이 구조적으로 커지므로 best-effort로는 못 막는다.
 *
 * 그래서 재추첨 대신 **후보를 걸러낸 뒤 그 안에서 뽑는다.** 남는 후보가 없으면
 * 그 자리는 포기한다(호출부가 기수를 줄인다) — 상한을 어기느니 한 기 적은 게 낫다.
 */
function pickUnderCaps(
  pool: EnemyDefId[],
  floorId: number,
  salt: number,
  counts: Map<EnemyDefId, number>,
  roleCounts: Map<string, number>,
): EnemyDefId | null {
  const ok = pool.filter(
    (id) =>
      (counts.get(id) ?? 0) < MAX_SAME_ENEMY &&
      (roleCounts.get(enemies[id].role) ?? 0) < MAX_SAME_ROLE,
  );
  if (ok.length === 0) return null;
  return pickOne(ok, floorId, salt);
}

export function buildEnemyVariant(floorId: number, tier: Tier, variant: number): EnemyDefId[] {
  const [lo, hi] = tier.count;
  const n = lo + Math.floor(pick01(floorId, 1) * (hi - lo + 1));

  const first = pickOne(tier.taunts, floorId, 2 + variant * 100);
  const out: EnemyDefId[] = [first];
  const counts = new Map<EnemyDefId, number>([[first, 1]]);
  const roleCounts = new Map<string, number>([[enemies[first].role, 1]]);

  for (let i = 1; i < n; i++) {
    const cand = pickUnderCaps(
      tier.pool, floorId, 3 + i + variant * 100, counts, roleCounts,
    );
    // 상한 때문에 채울 수 있는 적이 없다 — 기수를 줄인다.
    if (cand === null) break;
    out.push(cand);
    counts.set(cand, (counts.get(cand) ?? 0) + 1);
    const role = enemies[cand].role;
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }
  return out;
}

function computeEnemies(floorId: number, tier: Tier, isBoss: boolean): EnemyDefId[] {
  if (isBoss) {
    /**
     * 최상층은 **전용 보스**를 쓴다.
     *
     * 그러지 않으면 90·100층이 같은 구간이라 `tier.boss`(재의 군주)를 공유해
     * "깊이 배수만 다른 같은 적"이 된다. 엔딩 연출이 붙는 층인데 새로울 게 없고,
     * 보스 감쇠를 낮추자 **100층이 90층보다 쉬워지는 역전**까지 났다
     * (97%·사망 0.36 vs 78%·1.13). 한쪽만 조절할 수 없어서 층을 갈랐다.
     */
    if (floorId === TOWER_HEIGHT) {
      return [ENEMY.ashking, ENEMY.stonewarden, ENEMY.seraph];
    }
    /**
     * 보스 + 호위.
     *
     * ⚠️ 호위를 pool에서만 뽑으면 **보스와 호위가 둘 다 breaker**인 층이 생긴다.
     * 그러면 도발이 없어 힐러가 먼저 죽고 승률이 0/100으로 굳는다(§5-11).
     * 실제로 50층이 그렇게 나왔다 — 도발 하나를 확정으로 넣는다.
     * 보스전에서 도발 탱커는 "보스를 때릴 시간을 벌어야 한다"는 압박도 만든다.
     */
    const guardEscort = pickOne(tier.taunts, floorId, 11);
    /**
     * 한 구간에 보스 층이 둘인데(예: 30·40층) 보스도 도발도 같은 풀에서 나오므로
     * 그대로 두면 **두 층이 완전히 같아진다**(실제로 30·40층이 동일했다).
     * 구간 안에서 두 번째 보스 층에는 호위를 하나 더 붙여 차이를 만든다.
     */
    const secondBossOfTier = Math.floor((floorId - tier.from) / BOSS_EVERY) % 2 === 1;
    if (!(floorId >= 61 || secondBossOfTier)) return [tier.boss, guardEscort];

    /**
     * 세 번째 자리는 앞선 보스 층과 겹치지 않게 고른다.
     * 도발 풀이 2종뿐이라 그냥 두면 70·80층이 완전히 같아진다(실제로 그랬다).
     */
    const prevBoss = floorId - BOSS_EVERY;
    const prevThird = prevBoss > HANDCRAFTED_UNTIL && tierOf(prevBoss) === tier
      ? pickOne(tier.pool, prevBoss, 12)
      : null;
    let third = pickOne(tier.pool, floorId, 12);
    for (let v = 1; v < 5 && third === prevThird; v++) {
      third = pickOne(tier.pool, floorId, 12 + v * 37);
    }
    return [tier.boss, guardEscort, third];
  }

  const build = (variant: number): EnemyDefId[] => buildEnemyVariant(floorId, tier, variant);

  /**
   * 최근 층과 같은 구성이면 다시 뽑는다.
   *
   * 해시만으로는 가까운 층이 겹치는 것을 막을 수 없다(실제로 32·39층이 같았다).
   * 적 풀이 6~7종이라 80층 전체 무중복은 비둘기집 원리상 불가능하므로,
   * **간격만 벌린다** — 멀리 떨어진 층끼리 같은 건 플레이 중에 알아채지 못한다.
   *
   * 앞선 층을 다시 생성해 비교하므로 여전히 결정적이다(재귀는 아니다 — build만 부른다).
   */
  const recent = new Set<string>();
  for (let back = 1; back <= MIN_REPEAT_GAP && floorId - back > HANDCRAFTED_UNTIL; back++) {
    const prev = floorId - back;
    if (prev % BOSS_EVERY === 0) continue; // 보스 층은 별도 규칙
    // 이전 층을 **실제로 다시 생성해** 비교한다. 근사치로 비교하면 놓친다
    // (기수를 대충 맞췄더니 79·72층이 그대로 겹쳤다).
    //
    // ⚠️ 메모이즈가 없으면 지수적으로 터진다. 한 층이 8개 이전 층을 부르고
    // 그 각각이 또 8개를 부른다 — 실제로 테스트가 5분 넘게 멈췄다.
    // 캐시가 있으면 층당 한 번만 계산되므로 전체가 선형이다.
    recent.add([...pickEnemies(prev, tierOf(prev), false)].sort().join(','));
  }

  /*
    실측으로 고른 변형이 있으면 그것을 **우선한다**.

    승률은 생성 규칙으로 표현할 수 없어서(조합×임무의 상호작용) 밖에서 재고
    결과만 표로 들여온다 — `scripts/floor-tune.mts` 참조.
    중복 회피보다 앞에 두는 이유: 같은 구성이 멀리서 한 번 더 나오는 것보다
    **승률 0%인 층이 남는 것이 훨씬 나쁘다.**
  */
  const tuned = FLOOR_VARIANT[floorId];
  if (tuned != null) return build(tuned);

  /*
    ⚠️ 중복 회피는 **원래 범위(6)만 훑는다.** `VARIANT_COUNT`(24)를 쓰면
    지금까지 v0으로 확정돼 있던 층들이 다른 변형으로 갈아타면서
    **이미 합격한 층의 승률까지 통째로 움직인다.** 후보를 늘린 목적은
    "합격 변형이 없던 층을 구제"하는 것뿐이므로, 그 탐색은 튜닝 도구에만 맡긴다.
  */
  for (let v = 0; v < DEDUPE_VARIANTS; v++) {
    const cand = build(v);
    if (!recent.has([...cand].sort().join(','))) return cand;
  }
  return build(0);
}


/**
 * 이름 캐시. `pickEnemies`와 같은 이유로 반드시 필요하다.
 *
 * 이름도 중복 회피를 위해 이전 층을 다시 계산하므로, 캐시가 없으면
 * 한 층이 MIN_REPEAT_GAP개 이전 층을 부르고 그 각각이 또 부른다 —
 * 적 구성에서 이미 밟은 지수 폭발(테스트 5분 정지)과 똑같은 함정이다.
 */
const nameCache = new Map<number, string>();

/**
 * 층 이름을 뽑는다.
 *
 * 적 구성과 **같은 규칙**이다(§MIN_REPEAT_GAP) — 가까운 층끼리만 겹치지 않게 하고
 * 전체 무중복은 요구하지 않는다. 다만 이름은 적 구성과 달리 **손으로 짠 층과도**
 * 겹치면 안 된다. 플레이어는 1~20층을 실제로 지나왔으므로 기억하고 있다.
 */
function pickName(floorId: number): string {
  const cached = nameCache.get(floorId);
  if (cached) return cached;

  // 최상층은 조합에 맡기지 않는다.
  if (floorId === TOWER_HEIGHT) {
    nameCache.set(floorId, SUMMIT_NAME);
    return SUMMIT_NAME;
  }

  const taken = new Set<string>(HANDCRAFTED_NAMES);
  /**
   * 장소어(NAME_B)는 **전체 이름보다 짧은 간격**으로만 막는다.
   *
   * 전체 이름만 비교하면 '창백한 옥좌'(21층)와 '얼어붙은 옥좌'(22층)가 나란히 통과한다 —
   * 실측으로 옥좌가 80층 중 **11번**(기대 4.7) 나왔고 인접 반복이 10건이었다.
   * 수식어만 다른 이름이 연달아 나오면 조합기라는 게 드러난다.
   */
  const nearbyPlaces = new Set<string>();
  for (let back = 1; back <= NAME_REPEAT_GAP && floorId - back > HANDCRAFTED_UNTIL; back++) {
    const prev = pickName(floorId - back);
    taken.add(prev);
    if (back <= PLACE_REPEAT_GAP) nearbyPlaces.add(placeOf(prev));
  }

  /**
   * salt를 바꿔가며 다시 뽑는다. 두 축을 함께 굴려야 한다 —
   * 수식어만 바꾸면 '…제단'이 연달아 나와 겹치지 않아도 단조롭게 읽힌다.
   *
   * 앞쪽 절반은 장소어 간격까지 지키고, 실패하면 후반부에서 그 조건을 푼다.
   * 장소어가 16종뿐이라 간격을 항상 지킬 수는 없다 — **이름 중복(더 눈에 띈다)을
   * 막는 쪽이 우선**이므로 완화 순서를 이렇게 잡았다.
   */
  for (let v = 0; v < 24; v++) {
    const cand = `${pickOne(NAME_A, floorId, 41 + v * 13)} ${pickOne(NAME_B, floorId, 42 + v * 29)}`;
    if (taken.has(cand)) continue;
    if (v < 12 && nearbyPlaces.has(placeOf(cand))) continue;
    nameCache.set(floorId, cand);
    return cand;
  }

  // 24번 모두 실패하는 경우는 실측상 없지만, 결정적으로 끝나야 하므로 기본값을 둔다.
  const fallback = `${pickOne(NAME_A, floorId, 41)} ${pickOne(NAME_B, floorId, 42)}`;
  nameCache.set(floorId, fallback);
  return fallback;
}

/** 층 하나를 만든다. 같은 floorId는 언제나 같은 결과. */
export function generateFloor(floorId: number): FloorSpec {
  const tier = tierOf(floorId);
  const isBoss = floorId % BOSS_EVERY === 0;

  const slot = ((floorId - 1) % CYCLE.length + CYCLE.length) % CYCLE.length;
  const kind: MissionKind = isBoss ? 'subjugate' : CYCLE[slot];

  const enemyIds = pickEnemies(floorId, tier, isBoss);

  // 요구 턴은 층이 깊을수록 조금씩 늘어난다. 너무 늘리면 지루해지므로 상한을 둔다.
  const turns = Math.min(10, 7 + Math.floor(floorId / 40));

  const mission: Mission = {
    kind,
    ...(kind === 'survive' || kind === 'defend' || kind === 'escape' ? { turns } : {}),
    ...(kind === 'seize' ? { targetIndex: 0 } : {}),
    briefing: briefingOf(kind, turns),
  };

  const guards: GuardDef[] | undefined =
    kind === 'defend'
      ? [{ id: 'depot', name: '제단', kind: 'objective', hp: tier.guardHp, def: tier.guardDef }]
      : kind === 'escort'
        ? [{ id: 'envoy', name: '동행자', kind: 'npc', hp: tier.guardHp, def: tier.guardDef }]
        : undefined;

  return {
    id: floorId,
    name: pickName(floorId),
    scene: pickOne(SCENES, floorId, 43),
    mission,
    enemyIds,
    ...(guards ? { guards } : {}),
    ...(isBoss ? { isBoss: true } : {}),
  };
}
