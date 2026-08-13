/**
 * 영웅 카드 아트 생성 — Pollinations.ai (무료, API 키 불필요).
 *
 *   npx tsx scripts/gen-art.mts               # 없는 것만 생성 (변형 1 = 기존 동작)
 *   npx tsx scripts/gen-art.mts --variants=6  # 유형당 6장 — 개체별 얼굴 분화용
 *   npx tsx scripts/gen-art.mts --force       # 전부 다시 생성
 *   npx tsx scripts/gen-art.mts ashen bolt    # 지정한 것만
 *
 * ── 변형(variant)이 왜 필요한가 ─────────────────────────
 * 초상이 defId 하나로만 정해지면 **같은 유형의 두 개체가 같은 얼굴**이 된다.
 * 이름(identity.ts)과 등급 분리(gacha.ts)를 고쳐도 이 층이 남아 있었다.
 * 슬롯 0은 접미사 없는 `{defId}.jpg`이고 추가분이 `{defId}_{n}.jpg`(n≥2)다 —
 * 파싱 규칙은 `src/ui/art/variantNaming.ts`에 있고 **양쪽이 일치해야 한다.**
 *
 * ⚠️ 동시 요청은 즉시 429다(실측). 순차 유지 — 병렬화하지 말 것.
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

  // ── 확장 7종 (STEP: 영웅 유형 5 → 12) ──────────────────
  // 실루엣은 5종을 공유하지만(artMap.ts), 인물 묘사는 겹치지 않게 잡는다.
  // 같은 'staff' 실루엣이라도 하란(불)·델라(결계)·비라(피)가 한눈에 갈려야 한다.
  h_thorn:
    'gaunt male poacher crouched with a bone shortbow, hood of woven bramble and dead leaves, '
    + 'sickly green venom dripping from arrowheads, thorn scars across his throat, '
    + 'sunken jaundiced eyes, moss-eaten forest-earth cloak',
  h_cinder:
    'gaunt female fire sorceress with no shadow behind her, ash-white hair lifting in heat haze, '
    + 'scorched crimson robes flaking into embers, cracked glowing burn-veins across her hands, '
    + 'molten orange eyes, cinders spiralling upward around her',
  h_hush:
    'silent female figure with lower face bound in grey wrappings, wind-torn ash cloak, '
    + 'pale windswept hair across one eye, spectral grey-green mist curling from open palms, '
    + 'hollow voiceless stare, faint sigils fading around her throat',
  h_ward:
    'resolute female warden holding both palms outward casting a translucent hexagonal barrier, '
    + 'deep blue mantle over scaled ceremonial armor, wet dark hair bound tight, '
    + 'calm steel-blue eyes, geometric light-glyphs suspended before her',
  h_banner:
    'commanding male standard-bearer raising a tattered war banner overhead, '
    + 'crimson and gold surcoat over battered plate, greying braided beard, '
    + 'fierce amber eyes, warm firelight breaking through smoke behind him',
  h_leech:
    'solemn female blood-healer with palms opened and bleeding, dark red-black robes, '
    + 'long wet ink-black hair, crimson droplets rising upward as motes of light, '
    + 'exhausted sorrowful dark eyes, pallid drained skin',
  h_anvil:
    'squat immovable male smith-guardian with enormous barrel chest filling the frame, '
    + 'soot-blackened forge apron over dented iron plate, '
    + 'arms crossed like a shut gate, iron-grey braided beard, '
    + 'ember-lit forge glow from below, stone-still unyielding stance',
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

/**
 * 변형 수식어 — 같은 유형이라도 개체마다 다른 얼굴을 만든다.
 *
 * ⚠️ **STYLE_ANCHOR는 절대 건드리지 않는다.** 화풍이 갈리면 같은 유형의 6장이
 *    여섯 세계에서 온 것처럼 보인다. 여기서 바꾸는 것은 화풍이 아니라 **개체**다.
 *
 * ⚠️ **체격을 건드리지 않는다.** 인물의 정체성(직업·무기·속성)은 APPEARANCE가 고정하고,
 *    여기서는 나이·머리·흉터·자세·시선만 흔든다. 체격을 넣으면 실루엣이 무너진다 —
 *    오르나(거인족)에 `slighter narrow build`를 넣으면 탱커로 안 보이고,
 *    반대로 `giantess` 하나로는 덩치가 안 잡혔던 전례가 있다(§아트 강화 2단계).
 *
 * 0번은 **반드시 빈 문자열**이다. 그래야 이미 채택·커밋된 12장이 그대로 재현된다.
 */
const VARIANT_TRAITS: string[] = [
  '', // 0 — 채택된 원본. 절대 채우지 말 것
  ', younger face, shorter cropped hair, three-quarter turn, wary sidelong gaze',
  ', older weathered face, long unkempt hair, deep scar across the cheek, head lowered',
  ', gaunt hollow-cheeked, shaved head, chin raised in defiance, direct hard stare',
  ', braided hair bound with cord, tilted head, half of the face lost in shadow',
  ', hair hidden under a drawn hood, downcast eyes, face turned partly away',
];

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
  //
  // 현재 12종 전부 DEFAULT_SEED(42)로 생성해 채택했다.
  // 특정 캐릭터만 다시 뽑고 싶으면 여기에 다른 시드를 적고 그 영웅만 --force 할 것
  // (`npx tsx scripts/gen-art.mts ward --force`). 전체 --force는 채택본을 통째로 갈아버린다.
};

/**
 * 파일 경로. **`src/ui/art/variantNaming.ts`의 파싱 규칙과 반드시 일치해야 한다.**
 * 한쪽만 고치면 에러 없이 조용히 SVG 폴백으로 떨어진다(HANDOFF §5-16 유형).
 */
function outFor(hero: HeroDef, v: number): string {
  return join(OUT_DIR, v === 0 ? `${hero.id}.jpg` : `${hero.id}_${v + 1}.jpg`);
}

function promptFor(hero: HeroDef, v: number): string {
  const look = APPEARANCE[hero.id];
  if (!look) throw new Error(`APPEARANCE에 ${hero.id}가 없다. sample.ts에 영웅을 추가했으면 여기도 추가할 것.`);

  const trait = VARIANT_TRAITS[v];
  // 조용히 같은 프롬프트로 중복 생성하면 기능이 죽은 채 성공한 것처럼 보인다
  if (trait === undefined) {
    throw new Error(`VARIANT_TRAITS에 ${v}번이 없다 (현재 ${VARIANT_TRAITS.length}개). 표를 늘릴 것.`);
  }

  // 변형 수식어는 APPEARANCE 직후 · STYLE_ANCHOR 앞에 둔다 —
  // flux는 앞쪽 토큰에 가중치를 더 주므로 앵커의 위치가 고정돼야 화풍이 안 흔들린다.
  return `${look}${trait}, ${STYLE_ANCHOR}${tierAccent(hero.baseStar)}`;
}

function urlFor(hero: HeroDef, v: number): string {
  // v=0이 기존 시드 그대로라 채택된 12장이 비트 단위로 재현된다
  const seed = (SEED_OVERRIDE[hero.id] ?? DEFAULT_SEED) + v * 1000;
  const q = new URLSearchParams({
    width: String(WIDTH),
    height: String(HEIGHT),
    model: 'flux',
    seed: String(seed),
    // 로고 없이 받는다 — 카드 안에 워터마크가 찍히면 못 쓴다
    nologo: 'true',
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(promptFor(hero, v))}?${q}`;
}

const exists = (p: string) => access(p).then(() => true, () => false);

/** 짧은 이름(ashen)과 전체 id(h_ashen) 둘 다 받는다 */
function resolve(arg: string): HeroDef | undefined {
  return Object.values(heroes).find((h) => h.id === arg || h.id === `h_${arg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 연속 실패 한도.
 * 3연속 실패는 레이트리밋이나 서비스 장애의 신호다. 그대로 밀어붙이면
 * 남은 수십 장을 헛되이 때리며 한 시간을 버리고 스로틀만 깊어진다.
 */
const FAIL_STREAK_LIMIT = 3;

/** 요청 간 간격. 장당 45초에 비하면 무시할 비용이고, 레이트리밋 여유를 준다. */
const GAP_MS = 1500;

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const names = args.filter((a) => !a.startsWith('--'));

  // --variants=N. 기본 1 → 인자 없이 돌리면 기존과 완전히 동일하게 동작한다.
  const vArg = args.find((a) => a.startsWith('--variants='));
  const variants = vArg ? Number(vArg.split('=')[1]) : 1;
  if (!Number.isInteger(variants) || variants < 1) {
    throw new Error(`--variants는 1 이상의 정수여야 한다: ${vArg}`);
  }
  if (variants > VARIANT_TRAITS.length) {
    throw new Error(
      `--variants=${variants}인데 VARIANT_TRAITS는 ${VARIANT_TRAITS.length}개뿐이다. 표를 먼저 늘릴 것.`,
    );
  }

  const targets = names.length > 0
    ? names.map((n) => {
        const h = resolve(n);
        if (!h) throw new Error(`모르는 영웅: ${n}`);
        return h;
      })
    : Object.values(heroes);

  await mkdir(OUT_DIR, { recursive: true });

  const total = targets.length * variants;
  console.log(
    `영웅 아트 생성 — ${targets.length}종 × ${variants}변형 = ${total}장 (${WIDTH}x${HEIGHT}, flux)`,
  );
  // 동시 요청은 즉시 429다(실측). 순차 유지가 유일한 방법이므로 예상 시간을 미리 알린다.
  console.log(`순차 요청이라 장당 약 45초 — 최대 ${Math.ceil((total * 46) / 60)}분 예상\n`);

  let made = 0;
  let skipped = 0;
  let failed = 0;
  let streak = 0;
  let done = 0;
  const t0 = Date.now();

  for (const hero of targets) {
    for (let v = 0; v < variants; v++) {
      done++;
      const out = outFor(hero, v);
      const tag = `${hero.id} v${v + 1}/${variants}`;

      if (!force && (await exists(out))) {
        console.log(`  건너뜀  ${tag}  (이미 있음 — 다시 만들려면 --force)`);
        skipped++;
        continue;
      }

      // 남은 장수 × 실측 평균으로 ETA. 무음으로 한 시간 도는 것처럼 보이면 안 된다.
      const eta = made > 0
        ? ` · 남은 ${Math.ceil(((Date.now() - t0) / made) * (total - done + 1) / 60000)}분`
        : '';
      process.stdout.write(`  생성 중  ${tag} (${done}/${total}${eta}) ... `);

      try {
        // flux는 한 장에 20~60초가 걸린다. 기본 타임아웃으로는 모자란다.
        const res = await fetch(urlFor(hero, v), { signal: AbortSignal.timeout(180_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const buf = Buffer.from(await res.arrayBuffer());
        // 실패 시 에러 페이지(HTML)가 200으로 오는 경우가 있다. 크기로 거른다.
        if (buf.length < 10_000) throw new Error(`응답이 너무 작다 (${buf.length}B) — 이미지가 아닐 수 있다`);

        await writeFile(out, buf);
        console.log(`완료 (${Math.round(buf.length / 1024)}KB)`);
        made++;
        streak = 0;
      } catch (e) {
        console.log(`실패 — ${e instanceof Error ? e.message : String(e)}`);
        failed++;
        streak++;
        if (streak >= FAIL_STREAK_LIMIT) {
          console.log(`\n⚠️ ${FAIL_STREAK_LIMIT}연속 실패 — 중단한다 (레이트리밋 또는 장애).`);
          console.log('   받은 파일은 그대로 남는다. 잠시 뒤 같은 명령을 다시 돌리면 이어받는다.');
          break;
        }
      }

      await sleep(GAP_MS);
    }
    if (streak >= FAIL_STREAK_LIMIT) break;
  }

  console.log(`\n생성 ${made}장 · 건너뜀 ${skipped}장 · 실패 ${failed}장 → ${OUT_DIR}`);
  if (failed > 0) {
    console.log('(아트가 없으면 화면은 기존 SVG 실루엣으로 폴백한다. 치명적이지 않다.)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
