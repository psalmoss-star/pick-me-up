/**
 * 생성 층 승률 검증 — 빌드 타임 도구.
 *
 * ── 왜 필요한가 ────────────────────────────────────────
 * `npm run sim`은 층별 승률을 재지만 **결과를 코드로 되먹이지 않는다.** 사람이 표를 보고
 * 손으로 고쳐야 하는데, 생성 층이 80개라 감당이 안 된다. 실제로 2026-08-14 전수 측정에서
 * **28개 층이 승률 50% 미만**이었고 그중 12개는 0~7%(사실상 전멸)였다.
 *
 * ── 왜 생성기 안에서 못 하나 ───────────────────────────
 * 승률을 알려면 전투를 수백 번 돌려야 한다. 그걸 `pickEnemies()` 안에서 하면
 * 앱 기동이 수십 초 걸리고, `game/`이 순수 계층이라는 규칙도 깨진다.
 * 그래서 **여기서 미리 계산해 표(FLOOR_VARIANT)로 박고**, 생성기는 그 표만 읽는다.
 * 표는 층 번호 → variant 번호뿐이라 결정성도 유지된다.
 *
 * ── 사용법 ─────────────────────────────────────────────
 *   npx tsx scripts/floor-tune.mts          # 측정만 (현재 상태 진단)
 *   npx tsx scripts/floor-tune.mts --write  # data/floorVariants.ts 갱신
 *
 * ⚠️ **"변형으로 해결 0"이 나올 때까지 반복해서 돌릴 것.**
 * 한 층의 선택이 이웃의 중복 회피 조건을 바꾸므로 한 번에 수렴하지 않는다 —
 * 실제로 91층은 1회차에 이웃(92·96)이 아직 옛 구성이라 합격 변형이 전부 충돌로 보였고,
 * 2회차에 v1(0%→83%)이 열렸다. 표를 이어받아 누적되므로 여러 번 돌려도 안전하다.
 * 처음부터 다시 계산하려면 `floorVariants.ts`의 목록을 비우고 시작한다.
 *
 * ⚠️ 적 수치·깊이 배수·파티 기준을 만졌으면 **반드시 다시 돌릴 것.** 표가 낡으면
 * 생성기가 옛 판단을 그대로 쓴다.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runEncounter } from '../src/game/encounter';
import { createRng } from '../src/game/rng';
import { klassFor } from '../src/game/stats';
import { gameData } from '../src/game/data';
import { HERO } from '../src/game/data/sample';
import {
  HANDCRAFTED_UNTIL, TOWER_HEIGHT, BOSS_EVERY, MIN_REPEAT_GAP,
  buildEnemyVariant, VARIANT_COUNT, tierOf, generateFloor,
} from '../src/game/data/floorgen';
import { FLOOR_VARIANT } from '../src/game/data/floorVariants';
import { partyLimitAt } from '../src/game/data/party';
import type { EnemyDefId, HeroDefId, HeroInstId, HeroInstance, Star } from '../src/game/types';

const hero = (defId: HeroDefId, star: Star, level: number, n: number): HeroInstance => ({
  instId: `${defId}#${n}` as HeroInstId, defId, star, klass: klassFor(star), level, exp: 0,
  currentHp: 0, isDead: false, acquiredAtFloor: 1,
});

/**
 * 구간별 기준 파티 — `sim.ts`의 `genParty`와 **같아야 한다.**
 * 여기서 쓰는 전력이 sim과 다르면, 이 도구가 통과시킨 층이 sim 표에서 실패로 나온다.
 */
const genParty = (fid: number): HeroInstance[] => {
  if (fid <= 40) return [hero(HERO.ashen, 5, 60, 1), hero(HERO.bulwark, 5, 60, 2), hero(HERO.tide, 5, 65, 3), hero(HERO.gale, 5, 60, 4), hero(HERO.banner, 5, 60, 5)];
  if (fid <= 60) return [hero(HERO.ashen, 5, 75, 1), hero(HERO.bulwark, 5, 75, 2), hero(HERO.tide, 5, 80, 3), hero(HERO.gale, 5, 75, 4), hero(HERO.banner, 5, 75, 5)];
  if (fid <= 80) return [hero(HERO.ashen, 6, 85, 1), hero(HERO.bulwark, 6, 85, 2), hero(HERO.tide, 6, 90, 3), hero(HERO.gale, 6, 85, 4), hero(HERO.banner, 6, 85, 5)];
  return [hero(HERO.ashen, 6, 95, 1), hero(HERO.bulwark, 6, 95, 2), hero(HERO.tide, 6, 99, 3), hero(HERO.gale, 6, 95, 4), hero(HERO.banner, 6, 95, 5)];
};

/**
 * 합격 구간.
 *
 * 하한 55%: 절반 아래면 재도전을 강요당한다. 퍼머데스 게임에서 재도전은
 *   "영웅을 또 잃는다"는 뜻이라 저층보다 관대할 이유가 없다.
 * 상한 96%: 전부 100%면 등반이 소모전이 아니라 산책이 된다.
 *   §STEP 9가 손으로 짠 층에서 지킨 감각(6층 70%, 12층 43%)보다는 느슨하다 —
 *   생성 층은 개성이 없으므로 "가끔 죽는 통행로"가 목표다.
 */
const MIN_WIN = 55;
const MAX_WIN = 96;
/**
 * 합격 사망 상한 — **정원 대비 비율**이다(§5-22).
 *
 * ⚠️ 절대값으로 두면 안 된다. 3인 기준 1.2를 5인에 그대로 쓰면 허용치가 상대적으로
 * 빡빡해지고(0.24 → 0.4가 아니라 그대로 1.2), 반대로 3인 감각으로 2.0을 주면
 * 승률은 합격인데 매 층 2명씩 죽는 구간이 생긴다.
 * 그 대가는 다음 층에서 청구된다 — 7층은 승률 90%지만 사망 1.16이고,
 * 3인이 2인이 되면 8층이 78%→0~4%로 무너진다.
 *
 * 0.4 = 3인이면 1.2(기존 값과 동일), 5인이면 2.0.
 */
const MAX_DEATH_RATIO = 0.4;
const maxDeathAt = (fid: number) => partyLimitAt(fid) * MAX_DEATH_RATIO;

/**
 * ⚠️ **"너무 쉬움"과 "너무 어려움"을 같이 취급하면 안 된다.**
 *
 * 처음에 합격 구간을 벗어나면 전부 재추첨했더니, 98%/사망 0.00짜리 멀쩡한 층까지
 * 흔들어 **62%/사망 1.59로 만들어 놓는** 일이 벌어졌다(51층 실측).
 * 쉬운 층은 등반의 숨돌림이고(§STEP 9의 9층이 97%인 것도 의도),
 * 어려운 층은 **진행을 막는다.** 고쳐야 하는 것은 후자뿐이다.
 *
 * 그래서 재추첨 대상은 `tooHard`만으로 좁힌다. 상한은 보고용으로만 남긴다.
 */
const tooHard = (fid: number, m: { win: number; death: number }) =>
  m.win < MIN_WIN || m.death > maxDeathAt(fid);

/**
 * 편성마다 N회씩 돌리므로 실제 전투 수는 2N이다.
 * 80을 쓰면 층당 160회 — 승률 오차가 ±5%p 안쪽이라 55%/96% 경계 판정에 충분하다.
 * 정밀하게 보려면 `TUNE_N=200 npx tsx ...`처럼 올릴 것.
 */
const N = Number(process.env.TUNE_N ?? 80);

/**
 * 대체 편성 — 등반 중 실제로 나가게 되는 **다른 5인**.
 *
 * ⚠️ 기준 파티(탱+딜+힐+딜+서폿)만으로 재면 안 된다. 연속 등반은 HP가 높은 순으로
 * 뽑으므로, 누가 다치면 **탱커나 힐러가 빠진 편성**이 나간다.
 * 실제로 53층은 기준 파티에서 97%인데 딜러 위주 편성에서는 **43%**였다 —
 * 튜너는 합격으로 봤지만 등반에서는 26%가 여기서 막혔다.
 *
 * 5인의 "최악"은 **탱커와 힐러가 동시에 빠진** 편성이다. 정원이 늘면 빈자리를
 * 딜러가 메우므로, 3인 시절보다 오히려 역할이 무너진 편성이 나오기 쉽다.
 * 힐러를 아예 빼면 어떤 층도 통과 못 해 튜너가 무한 재추첨에 빠지므로,
 * 탱커를 빼고 힐러를 하급(leech)으로 낮춰 "버티지 못하는 5인"을 만든다.
 */
const altParty = (fid: number): HeroInstance[] => {
  if (fid <= 40) return [hero(HERO.gale, 5, 60, 4), hero(HERO.bolt, 5, 60, 5), hero(HERO.leech, 5, 65, 6), hero(HERO.thorn, 5, 60, 7), hero(HERO.cinder, 5, 60, 8)];
  if (fid <= 60) return [hero(HERO.gale, 5, 75, 4), hero(HERO.bolt, 5, 75, 5), hero(HERO.leech, 5, 80, 6), hero(HERO.thorn, 5, 75, 7), hero(HERO.cinder, 5, 75, 8)];
  if (fid <= 80) return [hero(HERO.gale, 6, 85, 4), hero(HERO.bolt, 6, 85, 5), hero(HERO.leech, 6, 90, 6), hero(HERO.thorn, 6, 85, 7), hero(HERO.cinder, 6, 85, 8)];
  return [hero(HERO.gale, 6, 95, 4), hero(HERO.bolt, 6, 99, 5), hero(HERO.leech, 6, 99, 6), hero(HERO.thorn, 6, 95, 7), hero(HERO.cinder, 6, 95, 8)];
};

/**
 * 승률·사망을 잰다. **두 편성 중 나쁜 쪽**을 돌려준다.
 *
 * 층이 "어떤 편성으로도 통과 가능한가"를 물어야 등반에서 안 막힌다.
 * 좋은 쪽만 보면 기준 파티가 온전할 때만 성립하는 층을 합격시킨다.
 */
function measure(fid: number, enemyIds: readonly EnemyDefId[]) {
  /*
    층의 나머지(임무·이름·보호 대상)는 생성기가 만든 그대로 두고 **적 구성만** 바꾼다.
    임무까지 바꾸면 이 도구가 층을 새로 설계하는 셈이라 생성기와 판단이 갈린다.
  */
  const floor = { ...generateFloor(fid), enemyIds: [...enemyIds] };
  const one = (make: (f: number) => HeroInstance[]) => {
    let w = 0, d = 0;
    for (let s = 0; s < N; s++) {
      const r = runEncounter({ party: make(fid), floor, data: gameData, rng: createRng(s) });
      if (r.outcome === 'victory') w++;
      d += r.casualties.length;
    }
    return { win: (w / N) * 100, death: d / N };
  };
  const a = one(genParty), b = one(altParty);
  return a.win <= b.win ? a : b;
}

/** 합격 = 너무 어렵지 않다. 쉬운 쪽은 위 주석대로 건드리지 않는다. */
const ok = (fid: number, m: { win: number; death: number }) => !tooHard(fid, m);

/**
 * ⚠️ **기존 표를 이어받아 시작한다.**
 *
 * 빈 객체에서 시작하면 이번 실행에서 "손 안 댄" 층이 표에서 **사라진다** —
 * 그 층이 합격인 이유가 바로 지난 실행이 골라준 변형인데도 그렇다.
 * 실제로 그렇게 짰다가 표가 29개에서 4개로 줄었고, 되돌아간 25개 층이 다시 0%가 됐다.
 *
 * 표를 이어받으면 실행이 **누적**된다 — 이번에 새로 찾은 것만 얹힌다.
 * 처음부터 다시 계산하려면 `floorVariants.ts`를 비우고 돌릴 것.
 */
const chosen: Record<number, number> = { ...FLOOR_VARIANT };
const report: string[] = [];
const tooEasy: string[] = [];
let fixed = 0, failed = 0, untouched = 0;

/**
 * 지금 이 순간 그 층이 쓰는 구성의 키.
 *
 * 이번 실행에서 변형을 정한 층은 그 변형을, 아직 안 정한 층은 생성기 기본값을 본다.
 * `generateFloor`만 쓰면 **지난 실행의 표**를 읽어 이번 변경이 안 보인다(위 ⚠️⚠️ 참조).
 */
const composition = (floorId: number): string => {
  const v = chosen[floorId];
  const ids = v != null
    ? buildEnemyVariant(floorId, tierOf(floorId), v)
    : generateFloor(floorId).enemyIds;
  return [...ids].sort().join(',');
};

for (let fid = HANDCRAFTED_UNTIL + 1; fid <= TOWER_HEIGHT; fid++) {
  // 보스 층은 손으로 짠 개성이 있어야 한다 — 생성기가 건드리지 않는다
  if (fid % BOSS_EVERY === 0) continue;

  const tier = tierOf(fid);
  /*
    기준선은 **생성기가 실제로 내놓는 구성**이어야 한다.
    variant 0을 그냥 쓰면 중복 회피가 고른 다른 변형을 놓친다 —
    "지금 실제로 나오는 층"을 재는 게 아니게 된다.
  */
  const base = generateFloor(fid).enemyIds;
  const baseM = measure(fid, base);
  if (ok(fid, baseM)) {
    untouched++;
    // 고치지는 않지만 "숨돌림 층이 몇 개인지"는 알아야 곡선을 판단할 수 있다
    if (baseM.win > MAX_WIN) tooEasy.push(`${fid}층 ${baseM.win.toFixed(0)}%`);
    continue;
  }

  /*
    ⚠️ **가까운 층과 같은 구성은 고르면 안 된다.**
    승률만 보고 고르면 중복 회피(MIN_REPEAT_GAP)를 건너뛴다 — 실제로 67층을 v1로
    바꿨더니 64층과 완전히 같아져 `floors.test.ts`가 잡았다.

    ⚠️⚠️ 비교 대상은 `generateFloor(prev)`가 **아니라** 이번 실행에서 확정한 구성이다.
    `generateFloor`는 **지난 실행이 남긴 표**를 읽으므로, 이번에 바꾼 층이 반영되지 않는다.
    실제로 그렇게 짰다가 76층이 72층과 겹쳤다 — 76을 검사할 때 72는 아직 옛 구성이었고,
    그 뒤 72가 v4로 바뀌면서 둘이 같아졌다. **앞뒤 양방향**으로 봐야 한다.
  */
  const collides = (ids: readonly EnemyDefId[]) => {
    const key = [...ids].sort().join(',');
    for (let back = 1; back <= MIN_REPEAT_GAP; back++) {
      for (const other of [fid - back, fid + back]) {
        if (other <= HANDCRAFTED_UNTIL || other > TOWER_HEIGHT) continue;
        if (other % BOSS_EVERY === 0) continue;
        if (composition(other) === key) return true;
      }
    }
    return false;
  };

  // 변형을 순회해 합격하는 것을 찾는다
  let best: { v: number; m: { win: number; death: number } } | null = null;
  for (let v = 0; v < VARIANT_COUNT; v++) {
    const ids = buildEnemyVariant(fid, tier, v);
    if (collides(ids)) continue;
    const m = measure(fid, ids);
    if (ok(fid, m)) { best = { v, m }; break; }
    /*
      합격이 없으면 "가장 덜 나쁜 것"을 남긴다 — 기준은 **승률이 높은 쪽**이다.
      목표 구간 중앙에 가까운 쪽으로 고르면, 승률 3%와 60%가 있을 때 60%를 놓치고
      중앙(75%)에서 더 가까운 쪽을 집는 역전이 생긴다.
    */
    if (!best || m.win > best.m.win) best = { v, m };
  }

  if (best && ok(fid, best.m)) {
    chosen[fid] = best.v;
    fixed++;
    report.push(`  ${String(fid).padStart(3)}층 v0 ${baseM.win.toFixed(0)}%/${baseM.death.toFixed(2)} → v${best.v} ${best.m.win.toFixed(0)}%/${best.m.death.toFixed(2)}`);
  } else if (best) {
    chosen[fid] = best.v;
    failed++;
    report.push(`  ${String(fid).padStart(3)}층 v0 ${baseM.win.toFixed(0)}%/${baseM.death.toFixed(2)} → v${best.v} ${best.m.win.toFixed(0)}%/${best.m.death.toFixed(2)}  ⚠ 합격 변형 없음`);
  }
}

/*
  ── 마무리: 수렴할 때까지 다시 훑는다 ──────────────────
  위 루프는 층을 한 번씩만 훑으므로 **나중 층이 앞 층의 판단을 무효로 만든다.**
  두 가지가 남는다:
   1. 충돌 — 76을 정한 뒤 72가 바뀌어 둘이 같아진 사례.
   2. **놓친 층** — 91층은 처음 훑을 때 이웃(92·96)이 아직 옛 구성이라
      합격 변형이 전부 충돌로 보였다. 이웃이 정해진 뒤 다시 보면 v1(83%)이 열린다.
      실제로 이것 때문에 승률 0%인 층이 표에서 빠진 채 남아 있었다.
  변화가 없을 때까지 반복하면 수렴한다.
*/
for (let pass = 0; pass < 6; pass++) {
  let changed = 0;
  for (let fid = HANDCRAFTED_UNTIL + 1; fid <= TOWER_HEIGHT; fid++) {
    if (fid % BOSS_EVERY === 0) continue;
    const key = composition(fid);
    let clash = false;
    for (let back = 1; back <= MIN_REPEAT_GAP && !clash; back++) {
      const prev = fid - back;
      if (prev <= HANDCRAFTED_UNTIL || prev % BOSS_EVERY === 0) continue;
      if (composition(prev) === key) clash = true;
    }
    /*
      충돌뿐 아니라 **아직 너무 어려운 층**도 다시 본다.
      이웃이 확정되면서 막혀 있던 변형이 열릴 수 있기 때문이다.
    */
    const cur = chosen[fid] != null
      ? buildEnemyVariant(fid, tierOf(fid), chosen[fid])
      : generateFloor(fid).enemyIds;
    const stillHard = tooHard(fid, measure(fid, cur));
    if (!clash && !stillHard) continue;

    // 충돌하지 않으면서 합격하는 변형을 다시 찾는다
    for (let v = 0; v < VARIANT_COUNT; v++) {
      const ids = buildEnemyVariant(fid, tierOf(fid), v);
      const cand = [...ids].sort().join(',');
      let bad = false;
      for (let back = 1; back <= MIN_REPEAT_GAP && !bad; back++) {
        for (const other of [fid - back, fid + back]) {
          if (other <= HANDCRAFTED_UNTIL || other > TOWER_HEIGHT) continue;
          if (other % BOSS_EVERY === 0) continue;
          if (composition(other) === cand) bad = true;
        }
      }
      if (bad) continue;
      const m = measure(fid, ids);
      if (!ok(fid, m)) continue;
      if (chosen[fid] === v) break; // 이미 그 변형이다 — 바뀐 게 없다
      chosen[fid] = v;
      changed++;
      report.push(`  ${String(fid).padStart(3)}층 (재선택) → v${v} ${m.win.toFixed(0)}%/${m.death.toFixed(2)}`);
      break;
    }
  }
  if (changed === 0) break;
  console.log(`  (정리 ${pass + 1}회차: ${changed}개 층 재선택)`);
}

/*
  ── 마지막: 이웃에게 자리를 비켜달라고 한다 ────────────
  위의 두 루프는 **막힌 층 자신만** 움직인다. 그래서 어떤 층의 유일한 합격 변형을
  이웃이 이미 쓰고 있으면, 그 이웃에게 다른 합격 변형이 있어도 영영 안 풀린다.

  실제로 94층이 그랬다. v19가 **100%/사망 0.17**(양쪽 편성)인데 96층(v14)과 구성이
  같아 막혔고, 96층에는 v3(100%/0.10)이라는 멀쩡한 대안이 있었다. STEP 45가 96층을
  고치면서 94층이 필요한 자리를 먼저 가져간 것이다. 튜너는 "94층 합격 변형 없음"이라고
  보고했지만 **사실이 아니었다** — 탐색 범위 밖이었을 뿐이다(§STEP 45와 같은 모양).

  그래서 막힌 층이 남았을 때만, 그 층을 막고 있는 이웃을 **다른 합격 변형으로** 옮겨
  자리를 비우게 한다. 이웃이 합격을 유지하는 경우에만 옮긴다 — 문제를 떠넘기면 안 된다.
*/
{
  let yielded = 0;
  for (const fid of Object.keys(chosen).map(Number)) {
    const curIds = buildEnemyVariant(fid, tierOf(fid), chosen[fid]);
    if (!tooHard(fid, measure(fid, curIds))) continue; // 안 막혔으면 볼 것 없다

    for (let v = 0; v < VARIANT_COUNT; v++) {
      const ids = buildEnemyVariant(fid, tierOf(fid), v);
      const m = measure(fid, ids);
      if (!ok(fid, m)) continue; // 합격하는 변형만 자리를 다툴 가치가 있다

      // 이 변형을 막고 있는 이웃을 찾는다
      const key = [...ids].sort().join(',');
      const blockers: number[] = [];
      for (let back = 1; back <= MIN_REPEAT_GAP; back++) {
        for (const other of [fid - back, fid + back]) {
          if (other <= HANDCRAFTED_UNTIL || other > TOWER_HEIGHT) continue;
          if (other % BOSS_EVERY === 0) continue;
          if (composition(other) === key) blockers.push(other);
        }
      }
      if (blockers.length === 0) continue; // 안 막혔는데 여태 못 골랐다면 다른 이유다

      /*
        이웃 각각이 "합격을 유지하면서 다른 구성으로" 옮길 수 있어야 한다.
        하나라도 못 옮기면 이 변형은 포기한다 — 이웃을 불합격으로 만들면서까지
        자리를 뺏으면 총량이 그대로다.
      */
      const moves = new Map<number, number>();
      for (const b of blockers) {
        let moved = false;
        for (let bv = 0; bv < VARIANT_COUNT; bv++) {
          const bIds = buildEnemyVariant(b, tierOf(b), bv);
          const bKey = [...bIds].sort().join(',');
          if (bKey === key) continue; // 여전히 같은 자리다
          if (!ok(b, measure(b, bIds))) continue;
          // 이웃의 새 구성이 또 다른 층과 겹치면 안 된다
          let clash = false;
          for (let back = 1; back <= MIN_REPEAT_GAP && !clash; back++) {
            for (const other of [b - back, b + back]) {
              if (other === fid) continue; // fid는 곧 key로 바뀐다
              if (other <= HANDCRAFTED_UNTIL || other > TOWER_HEIGHT) continue;
              if (other % BOSS_EVERY === 0) continue;
              if (composition(other) === bKey) clash = true;
            }
          }
          if (clash) continue;
          moves.set(b, bv);
          moved = true;
          break;
        }
        if (!moved) { moves.clear(); break; }
      }
      if (moves.size === 0) continue;

      for (const [b, bv] of moves) {
        chosen[b] = bv;
        report.push(`  ${String(b).padStart(3)}층 (자리 양보) → v${bv}`);
      }
      chosen[fid] = v;
      yielded++;
      report.push(`  ${String(fid).padStart(3)}층 (이웃 양보로 해결) → v${v} ${m.win.toFixed(0)}%/${m.death.toFixed(2)}`);
      break;
    }
  }
  if (yielded > 0) console.log(`  (자리 양보로 ${yielded}개 층 해결)`);
}

console.log(
  `\n  합격 구간 ${MIN_WIN}~${MAX_WIN}% · 사망 정원×${MAX_DEATH_RATIO}` +
  ` (생성 구간 ${maxDeathAt(TOWER_HEIGHT).toFixed(1)}) 이하 · ${N}회\n`,
);
console.log(report.join('\n') || '  (조정 대상 없음)');
console.log(`\n  손 안 댐 ${untouched} | 변형으로 해결 ${fixed} | 합격 변형 없음 ${failed}`);
console.log(`  (그중 ${MAX_WIN}% 초과로 쉬운 층 ${tooEasy.length}개 — 숨돌림이므로 건드리지 않는다)\n`);

if (process.argv.includes('--write')) {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, '..', 'src', 'game', 'data', 'floorVariants.ts');
  const entries = Object.entries(chosen).map(([k, v]) => `  ${k}: ${v},`).join('\n');
  writeFileSync(out, `/**
 * 층별 적 구성 변형 번호 — **자동 생성 파일. 손으로 고치지 말 것.**
 *
 * \`scripts/floor-tune.mts\`가 실제 전투를 돌려 승률이 합격 구간(${MIN_WIN}~${MAX_WIN}%,
 * 사망 정원×${MAX_DEATH_RATIO} = ${maxDeathAt(TOWER_HEIGHT).toFixed(1)} 이하)을
 * 벗어나는 층을 찾아, 통과하는 변형 번호를 기록한 것이다.
 * 여기 없는 층은 기본 변형(0)을 쓴다.
 *
 * 갱신: npx tsx scripts/floor-tune.mts --write
 *
 * ⚠️ 적 수치·깊이 배수·기준 파티를 만졌으면 반드시 다시 생성할 것.
 */
export const FLOOR_VARIANT: Record<number, number> = {
${entries}
};
`, 'utf8');
  console.log(`  → ${out} 갱신됨 (${Object.keys(chosen).length}개 층)\n`);
}
