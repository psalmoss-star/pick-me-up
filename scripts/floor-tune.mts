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
  if (fid <= 40) return [hero(HERO.ashen, 5, 60, 1), hero(HERO.bulwark, 5, 60, 2), hero(HERO.tide, 5, 65, 3)];
  if (fid <= 60) return [hero(HERO.ashen, 5, 75, 1), hero(HERO.bulwark, 5, 75, 2), hero(HERO.tide, 5, 80, 3)];
  if (fid <= 80) return [hero(HERO.ashen, 6, 85, 1), hero(HERO.bulwark, 6, 85, 2), hero(HERO.tide, 6, 90, 3)];
  return [hero(HERO.ashen, 6, 95, 1), hero(HERO.bulwark, 6, 95, 2), hero(HERO.tide, 6, 99, 3)];
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
/** 사망 상한 — 승률이 높아도 매번 한 명씩 죽으면 다음 층이 무너진다(§5-22). */
const MAX_DEATH = 1.2;

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
const tooHard = (m: { win: number; death: number }) => m.win < MIN_WIN || m.death > MAX_DEATH;

const N = Number(process.env.TUNE_N ?? 120);

function measure(fid: number, enemyIds: readonly EnemyDefId[]) {
  /*
    층의 나머지(임무·이름·보호 대상)는 생성기가 만든 그대로 두고 **적 구성만** 바꾼다.
    임무까지 바꾸면 이 도구가 층을 새로 설계하는 셈이라 생성기와 판단이 갈린다.
  */
  const floor = { ...generateFloor(fid), enemyIds: [...enemyIds] };
  let w = 0, d = 0;
  for (let s = 0; s < N; s++) {
    const r = runEncounter({ party: genParty(fid), floor, data: gameData, rng: createRng(s) });
    if (r.outcome === 'victory') w++;
    d += r.casualties.length;
  }
  return { win: (w / N) * 100, death: d / N };
}

/** 합격 = 너무 어렵지 않다. 쉬운 쪽은 위 주석대로 건드리지 않는다. */
const ok = (m: { win: number; death: number }) => !tooHard(m);

const chosen: Record<number, number> = {};
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
  if (ok(baseM)) {
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
    if (ok(m)) { best = { v, m }; break; }
    /*
      합격이 없으면 "가장 덜 나쁜 것"을 남긴다 — 기준은 **승률이 높은 쪽**이다.
      목표 구간 중앙에 가까운 쪽으로 고르면, 승률 3%와 60%가 있을 때 60%를 놓치고
      중앙(75%)에서 더 가까운 쪽을 집는 역전이 생긴다.
    */
    if (!best || m.win > best.m.win) best = { v, m };
  }

  if (best && ok(best.m)) {
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
  ── 마무리: 남은 충돌을 없앤다 ─────────────────────────
  위 루프는 층을 한 번씩만 훑으므로, **나중 층이 앞 층의 판단을 무효로 만들 수 있다**
  (76을 정한 뒤 72가 바뀌어 둘이 같아진 실제 사례). 한 번 더 훑어 충돌이 남아 있으면
  다른 변형으로 갈아탄다. 변화가 없을 때까지 반복하면 수렴한다.
*/
for (let pass = 0; pass < 5; pass++) {
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
    if (!clash) continue;

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
      if (!ok(measure(fid, ids))) continue;
      chosen[fid] = v;
      changed++;
      break;
    }
  }
  if (changed === 0) break;
  console.log(`  (충돌 정리 ${pass + 1}회차: ${changed}개 층 재선택)`);
}

console.log(`\n  합격 구간 ${MIN_WIN}~${MAX_WIN}% · 사망 ${MAX_DEATH} 이하 · ${N}회\n`);
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
 * 사망 ${MAX_DEATH} 이하)을 벗어나는 층을 찾아, 통과하는 변형 번호를 기록한 것이다.
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
