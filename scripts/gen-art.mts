/**
 * 영웅 카드 아트 생성 — Pollinations.ai (무료, API 키 불필요).
 *
 *   npx tsx scripts/gen-art.mts            # 없는 것만 생성
 *   npx tsx scripts/gen-art.mts --force    # 전부 다시 생성
 *   npx tsx scripts/gen-art.mts ashen bolt # 지정한 것만
 *
 * ── 왜 bash가 아니라 TS인가 ──────────────────────────────
 * 이 프로젝트는 Windows에서 개발되고 이미 tsx를 쓴다.
 * bash의 `declare -A`(연관배열)는 Git Bash에서 동작이 갈리고, python3 의존도 생긴다.
 * 여기서는 sample.ts를 **직접 import** 하므로 영웅이 늘거나 속성이 바뀌면
 * 프롬프트가 자동으로 따라간다 — 두 곳에 같은 정보를 적지 않는다.
 *
 * ── 화풍 통일이 핵심이다 ─────────────────────────────────
 * STYLE_ANCHOR는 전 캐릭터가 **글자 하나까지 동일**하다. 이게 5장을 한 세계관으로 묶는다.
 * 캐릭터마다 바뀌는 것은 인물 묘사(APPEARANCE)와 등급 장식(tierAccent)뿐이다.
 *
 * ⚠️ 실존 작가 이름을 프롬프트에 넣지 않는다.
 *    CLAUDE.md가 "아트는 전부 오리지널"을 요구하고, 생존 작가 화풍 지목은
 *    상업적 이용 시 분쟁 소지가 있다. 화풍 통일은 아래 앵커 문구만으로 충분하다.
 */
import { writeFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heroes } from '../src/game/data/sample.js';
import type { HeroDef } from '../src/game/types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src/ui/art/assets');

/** 전 캐릭터 공통. 절대 캐릭터마다 바꾸지 말 것 — 바꾸는 순간 화풍이 갈라진다. */
const STYLE_ANCHOR = [
  'dark fantasy tarot card portrait',
  'painterly digital illustration',
  'muted desaturated palette',
  'dramatic rim lighting',
  'ornate gothic border motif',
  'single character centered',
  'chest-up composition',
  'moody atmosphere',
  'highly detailed',
].join(', ');

/**
 * 인물 묘사. sample.ts의 lore/role/element를 그림으로 옮긴 것이다.
 * 여기만 캐릭터별로 다르다.
 */
const APPEARANCE: Record<string, string> = {
  h_ashen:
    "young male swordsman with tousled ash-grey hair, weathered leather armor over tattered soldier's coat, "
    + 'ember-red glowing eyes, holding a worn longsword, faint fire wisps around shoulders',
  // "giantess"만으로는 모델이 성별로만 받아들여 날씬한 인물이 나왔다.
  // 체격을 뜻하는 단어(towering, hulking, broad)를 앞쪽에 여러 번 둬야 덩치가 잡힌다.
  h_bulwark:
    'towering hulking stone giant warrior, enormous broad shoulders filling the frame, '
    + 'grey cracked granite skin, heavy weathered armor plates, '
    + 'gripping a huge rune-etched tower shield, deep amber glowing eyes, '
    + 'moss and earth clinging to shoulders, immovable stoic presence',
  h_tide:
    'serene female priest with flowing seafoam-blue robes, damp silver hair clinging to face, '
    + 'holding an ornate coral staff, pale luminous eyes, faint water droplets suspended around hands',
  h_gale:
    'lithe female duelist wielding twin curved daggers, frost-rimmed hair tied back, '
    + 'tattered wind-torn cloak billowing sideways, sharp pale green eyes, faint frost mist trailing from blades',
  h_bolt:
    'imposing figure wielding an enormous crackling greatsword, lightning-scarred pale skin, '
    + 'storm-grey hair whipped upward by static, glowing violet-white eyes, '
    + "electricity arcing along blade edge, torn noble's coat",
};

/**
 * 등급 장식.
 *
 * CLAUDE.md: "★1~3은 무광·정적, ★4~6은 발광·장식·움직임."
 * tokens.ts의 STAR_TIERS가 카드 테두리로 하는 일을 **아트 안에서도** 하게 한다.
 * 둘이 어긋나면 ★5 카드에 수수한 그림이 들어가 등급 차이가 흐려진다.
 */
function tierAccent(star: number): string {
  if (star >= 5) return ', radiant white-gold halo aura, ornate baroque frame filigree';
  if (star === 4) return ', golden ornamental filigree frame accents';
  return ''; // ★1~3 — 무광·정적. 장식을 더하지 않는다
}

/** 카드 비율(HeroCard가 세로로 길다)에 맞춘 값 */
const WIDTH = 768;
const HEIGHT = 1024;

/**
 * 고정 시드.
 *
 * 같은 시드는 같은 그림을 준다 → 팀원이 각자 돌려도 같은 화면이 나온다.
 * 마음에 드는 결과가 나오면 그 캐릭터의 시드를 SEED_OVERRIDE에 적어 고정할 것.
 */
const DEFAULT_SEED = 42;
const SEED_OVERRIDE: Record<string, number> = {
  // 예: h_bolt: 7,   ← 채택한 시드를 여기 기록한다
};

function promptFor(hero: HeroDef): string {
  const look = APPEARANCE[hero.id];
  if (!look) throw new Error(`APPEARANCE에 ${hero.id}가 없다. sample.ts에 영웅을 추가했으면 여기도 추가할 것.`);
  return `${look}, ${STYLE_ANCHOR}${tierAccent(hero.baseStar)}`;
}

function urlFor(hero: HeroDef): string {
  const seed = SEED_OVERRIDE[hero.id] ?? DEFAULT_SEED;
  const q = new URLSearchParams({
    width: String(WIDTH),
    height: String(HEIGHT),
    model: 'flux',
    seed: String(seed),
    // 로고 없이 받는다 — 카드 안에 워터마크가 찍히면 못 쓴다
    nologo: 'true',
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(promptFor(hero))}?${q}`;
}

const exists = (p: string) => access(p).then(() => true, () => false);

/** 짧은 이름(ashen)과 전체 id(h_ashen) 둘 다 받는다 */
function resolve(arg: string): HeroDef | undefined {
  return Object.values(heroes).find((h) => h.id === arg || h.id === `h_${arg}`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const names = args.filter((a) => !a.startsWith('--'));

  const targets = names.length > 0
    ? names.map((n) => {
        const h = resolve(n);
        if (!h) throw new Error(`모르는 영웅: ${n}`);
        return h;
      })
    : Object.values(heroes);

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`영웅 아트 생성 — ${targets.length}종 (${WIDTH}x${HEIGHT}, flux)\n`);

  let made = 0;
  let skipped = 0;

  for (const hero of targets) {
    // 파일명은 defId 그대로. artMap 같은 별도 매핑을 하나 더 만들지 않는다.
    const out = join(OUT_DIR, `${hero.id}.jpg`);

    if (!force && (await exists(out))) {
      console.log(`  건너뜀  ${hero.id}  (이미 있음 — 다시 만들려면 --force)`);
      skipped++;
      continue;
    }

    process.stdout.write(`  생성 중  ${hero.id} (${hero.name}, ★${hero.baseStar}) ... `);
    try {
      // flux는 한 장에 20~60초가 걸린다. 기본 타임아웃으로는 모자란다.
      const res = await fetch(urlFor(hero), { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const buf = Buffer.from(await res.arrayBuffer());
      // 실패 시 에러 페이지(HTML)가 200으로 오는 경우가 있다. 크기로 거른다.
      if (buf.length < 10_000) throw new Error(`응답이 너무 작다 (${buf.length}B) — 이미지가 아닐 수 있다`);

      await writeFile(out, buf);
      console.log(`완료 (${Math.round(buf.length / 1024)}KB)`);
      made++;
    } catch (e) {
      console.log(`실패 — ${e instanceof Error ? e.message : String(e)}`);
      console.log('    (아트가 없으면 화면은 기존 SVG 실루엣으로 폴백한다. 치명적이지 않다.)');
    }
  }

  console.log(`\n생성 ${made}장 · 건너뜀 ${skipped}장 → ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
