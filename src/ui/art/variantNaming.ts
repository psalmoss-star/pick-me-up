/**
 * 초상 변형 파일명 규칙 — 순수 파서.
 *
 * ── 왜 heroImages.ts에서 분리했나 ────────────────────────
 * `heroImages.ts`는 `import.meta.glob`을 쓰므로 Vite 밖(node 환경 테스트)에서
 * import할 수 없다. 규칙 자체는 실수가 나기 쉬운 부분이라 반드시 테스트해야 하고,
 * 그러려면 glob과 떨어져 있어야 한다. (`vite.config.ts`는 environment: 'node')
 *
 * ── 규칙 ────────────────────────────────────────────────
 *   h_ashen.jpg     → 슬롯 0   (기존 12장. 이름을 바꾸지 않는다)
 *   h_ashen_2.jpg   → 슬롯 1
 *   h_ashen_3.jpg   → 슬롯 2
 *
 * 슬롯 0을 접미사 없는 이름으로 두는 이유:
 * 이미 채택·커밋된 12장을 건드리지 않아도 되고, seed 없는 옛 개체와
 * 무덤 기록(FallenRecord)이 전부 슬롯 0으로 떨어져 **시각적 회귀가 0**이 된다.
 *
 * ⚠️ `scripts/gen-art.mts`가 파일을 쓸 때 같은 규칙을 쓴다. 한쪽만 고치면
 *    에러 없이 조용히 SVG 폴백으로 떨어진다(HANDOFF §5-16 유형의 함정).
 */

/** `{base}_{ord}` 또는 `{base}` — ord는 1부터(접미사 없는 파일이 1) */
export interface ParsedVariant {
  base: string;
  ord: number;
}

/**
 * 파일명(확장자 제외) → 기준 이름 + 순번.
 *
 * ⚠️ **defId 자체에 밑줄이 있다** (`h_ashen`, `h_bulwark`).
 * `split('_')[0]`을 쓰면 12종이 전부 `'h'` 한 바구니로 뭉친다.
 * 그래서 **꼬리가 숫자일 때만** 변형 표식으로 인정한다.
 */
export function parseVariantName(stem: string): ParsedVariant {
  const m = /^(.*)_(\d+)$/.exec(stem);
  if (!m) return { base: stem, ord: 1 };

  const ord = Number(m[2]);
  // `_0`·`_1`은 규칙상 나오지 않는다. 나왔다면 손으로 만든 파일이므로
  // 변형으로 치지 않고 이름 그대로 둔다 — 슬롯 0을 덮어쓰는 사고를 막는다.
  if (ord < 2) return { base: stem, ord: 1 };

  return { base: m[1], ord };
}

/**
 * 경로 목록 → defId별 URL 배열. **배열의 인덱스가 곧 슬롯 번호다.**
 *
 * @param entries [경로, URL] 쌍. 경로는 `./assets/h_ashen_2.jpg` 형태.
 */
export function groupVariants(entries: readonly (readonly [string, string])[]): Record<string, string[]> {
  const buckets: Record<string, { ord: number; url: string }[]> = {};

  for (const [path, url] of entries) {
    const stem = path.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
    const { base, ord } = parseVariantName(stem);
    (buckets[base] ??= []).push({ ord, url });
  }

  const out: Record<string, string[]> = {};
  for (const [base, list] of Object.entries(buckets)) {
    /*
      ⚠️ 반드시 **숫자로** 정렬한다.
      문자열 정렬이면 `_10`이 `_2`보다 앞에 와서, 10번째 파일이 추가되는 날
      모든 영웅의 얼굴이 조용히 재배치된다. glob의 키 순서도 보장되지 않으므로
      여기서 명시적으로 정렬해야 슬롯 번호가 안정된다.
    */
    list.sort((a, b) => a.ord - b.ord);
    out[base] = list.map((v) => v.url);
  }
  return out;
}
