import { T } from './tokens';

/**
 * 영웅의 한 마디. gdd-v3 §4.10.
 *
 * 화면마다 따옴표·색·크기를 따로 정하면 같은 영웅의 말이 화면마다 다른 목소리로
 * 읽힌다(§5-48: 같은 값을 여러 화면에서 보여줄 때 서식은 한 곳에서 정한다).
 * 그래서 대사는 전부 이 컴포넌트를 통과한다.
 *
 * 패널은 호출부가 감싼다 — 결과 화면처럼 이미 패널 안에 있는 곳이 있어서,
 * 여기서 `SystemPanel`을 또 두르면 패널 속 패널이 된다.
 */
export interface QuoteProps {
  text: string;
  /** 말한 사람. 없으면 이름 줄을 안 그린다(이미 위에 이름이 있는 화면) */
  speaker?: string;
  /** 기질 두 글자 — 말투의 이유를 한눈에 */
  temper?: string;
  /** 유언처럼 무거운 말은 핏빛으로 */
  tone?: 'normal' | 'death';
}

export function Quote({ text, speaker, temper, tone = 'normal' }: QuoteProps) {
  return (
    <div style={{ textAlign: 'center', padding: '4px 0' }}>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.9,
          color: tone === 'death' ? T.frame : T.text,
          letterSpacing: '.02em',
          wordBreak: 'keep-all',
        }}
      >
        “{text}”
      </div>
      {(speaker || temper) && (
        <div style={{ fontSize: 10, color: T.dim, letterSpacing: '.14em', marginTop: 4 }}>
          {speaker && <span style={{ color: tone === 'death' ? T.blood : T.dim }}>— {speaker}</span>}
          {temper && <span>{speaker ? ' · ' : ''}{temper}</span>}
        </div>
      )}
    </div>
  );
}
