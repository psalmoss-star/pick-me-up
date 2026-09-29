import { T } from '../ui/tokens';
import { deedText, type Deed } from '../game/chronicle';

/**
 * 영웅 연대기 — 이 영웅이 수행한 책략(층·책략·성패). 상태창과 무덤이 같이 쓴다.
 *
 * 패널이 아니라 **패널 안에 들어가는 목록**이다(모든 정보 표시는 `SystemPanel`을 통과한다).
 * 성공은 금색, 간파는 호박색 — 둘 다 이 영웅의 이야기라 지우지 않는다.
 */
export function DeedList({ deeds }: { deeds: Deed[] }) {
  return (
    <div style={{ fontSize: 11, lineHeight: 1.9 }}>
      <div style={{ color: T.dim, letterSpacing: '.3em', marginBottom: 2 }}>연대기</div>
      {deeds.map((d, i) => (
        <div key={i} style={{ color: d.success ? T.gold : T.amber }}>{deedText(d)}</div>
      ))}
    </div>
  );
}
