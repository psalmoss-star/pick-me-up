/**
 * 초상 아트 커버리지.
 *
 * `artMap.test.ts`의 "매핑표에 명시돼 있는가"와 같은 성격이다 —
 * 파일이 빠져도 **에러가 나지 않고 조용히 SVG로 폴백**하므로,
 * 눈으로 보기 전에는 누락을 알 수 없다(HANDOFF §5-16 유형).
 *
 * vitest는 environment가 node여도 Vite가 `import.meta.glob`을 변환하므로
 * 이 테스트가 실제 assets/ 폴더를 본다.
 */
import { describe, it, expect } from 'vitest';
import { heroImagesOf, heroVariantCountOf } from './heroImages';
import { heroes } from '../../game/data/sample';

describe('초상 아트 커버리지', () => {
  it('정의된 모든 영웅이 초상을 최소 1장 갖는다', () => {
    const missing = Object.keys(heroes).filter((id) => heroVariantCountOf(id) === 0);
    expect(missing, `초상 누락: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('슬롯에 구멍이 없다 (undefined가 섞이면 그 개체만 SVG로 떨어진다)', () => {
    for (const id of Object.keys(heroes)) {
      for (const url of heroImagesOf(id)) {
        expect(typeof url, `${id}의 슬롯에 빈 값이 있다`).toBe('string');
      }
    }
  });

  it('없는 defId는 빈 배열이고 count가 0이다 (SVG 폴백 경로)', () => {
    expect(heroImagesOf('h_does_not_exist')).toEqual([]);
    expect(heroVariantCountOf('h_does_not_exist')).toBe(0);
  });
});
