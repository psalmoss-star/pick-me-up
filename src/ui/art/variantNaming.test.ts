import { describe, it, expect } from 'vitest';
import { parseVariantName, groupVariants } from './variantNaming';

describe('parseVariantName', () => {
  it('defId의 밑줄을 변형 표식으로 오해하지 않는다', () => {
    // split('_')[0]을 쓰면 12종이 전부 'h' 한 바구니로 뭉친다
    expect(parseVariantName('h_ashen')).toEqual({ base: 'h_ashen', ord: 1 });
    expect(parseVariantName('h_bulwark')).toEqual({ base: 'h_bulwark', ord: 1 });
  });

  it('숫자 꼬리만 변형으로 인정한다', () => {
    expect(parseVariantName('h_ashen_2')).toEqual({ base: 'h_ashen', ord: 2 });
    expect(parseVariantName('h_ashen_10')).toEqual({ base: 'h_ashen', ord: 10 });
  });

  it('_0 · _1은 변형으로 치지 않는다 (슬롯 0 덮어쓰기 방지)', () => {
    expect(parseVariantName('h_ashen_1')).toEqual({ base: 'h_ashen_1', ord: 1 });
    expect(parseVariantName('h_ashen_0')).toEqual({ base: 'h_ashen_0', ord: 1 });
  });
});

describe('groupVariants', () => {
  const url = (n: string) => `/assets/${n}.jpg`;
  const entry = (n: string) => [`./assets/${n}.jpg`, url(n)] as const;

  it('접미사 없는 파일이 슬롯 0이다', () => {
    const g = groupVariants([entry('h_ashen_2'), entry('h_ashen')]);
    expect(g.h_ashen[0]).toBe(url('h_ashen'));
    expect(g.h_ashen[1]).toBe(url('h_ashen_2'));
  });

  it('숫자로 정렬한다 — _10이 _2 앞에 오면 안 된다', () => {
    // 문자열 정렬이면 [bare, _10, _2]가 되어 10번째 파일 추가일에
    // 모든 영웅의 얼굴이 조용히 재배치된다
    const g = groupVariants([entry('h_ashen_10'), entry('h_ashen'), entry('h_ashen_2')]);
    expect(g.h_ashen).toEqual([url('h_ashen'), url('h_ashen_2'), url('h_ashen_10')]);
  });

  it('glob 키 순서가 뒤집혀도 결과가 같다', () => {
    const a = groupVariants([entry('h_ashen'), entry('h_ashen_2'), entry('h_ashen_3')]);
    const b = groupVariants([entry('h_ashen_3'), entry('h_ashen'), entry('h_ashen_2')]);
    expect(a).toEqual(b);
  });

  it('여러 defId를 섞어도 각자의 바구니로 간다', () => {
    const g = groupVariants([entry('h_ashen'), entry('h_ashen_2'), entry('h_bulwark')]);
    expect(g.h_ashen).toHaveLength(2);
    expect(g.h_bulwark).toHaveLength(1);
  });

  it('접미사 파일만 있어도 구멍 없이 0부터 채운다', () => {
    // h_x.jpg가 없고 h_x_2.jpg만 있는 경우 — 슬롯 0이 undefined면 안 된다
    const g = groupVariants([entry('h_x_2'), entry('h_x_3')]);
    expect(g.h_x[0]).toBe(url('h_x_2'));
    expect(g.h_x).toHaveLength(2);
  });

  it('빈 입력은 빈 객체다', () => {
    expect(groupVariants([])).toEqual({});
  });
});
