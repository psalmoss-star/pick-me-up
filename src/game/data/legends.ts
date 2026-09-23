/**
 * 고유 전설 영웅 — ★5 소환에서만 나오는 이름 있는 인물. gdd-v3 §4.11.
 *
 * ── 왜 필요했나 ─────────────────────────────────────────
 * 가챠의 동기는 "**그** 캐릭터를 갖고 싶다"다. 유형 12종 × 무작위 이름으로는
 * 기다릴 대상이 생기지 않는다. 여기 있는 여섯은 직접 쓴 인물이라 이름·기질·생전·말이 고정이다.
 *
 * ── 전투는 유형의 것이다 ────────────────────────────────
 * `defId`는 기존 유형을 **빌린다.** 능력치·스킬·초상은 그 유형의 ★5와 같다.
 * 고유 스킬을 주면 `sim`에 없는 개체가 생기고, 그건 밸런스 도구로 따로 재야 한다(보류).
 *
 * ── 톤 ──────────────────────────────────────────────────
 * `origins.ts`·`voice.ts`와 같다. 어둡고 건조하게. ★5 이상이므로 전원 **자각 "앎"** —
 * 탑과 마스터를 알고 마스터에게 말한다. IP 원칙: 이름·설정은 전부 오리지널(CLAUDE.md).
 *
 * ── 이름 ────────────────────────────────────────────────
 * 일반 개체의 이름은 항상 「수식어의 이름」 꼴이다(`names.ts`). 전설은 **한 단어**라서
 * 둘이 겹칠 수 없고, 한 단어라는 것 자체가 "이 사람은 다르다"로 읽힌다.
 * `names.ts`의 이름 어휘와도 겹치지 않는다(테스트가 잠근다).
 *
 * ⚠️ **id는 세이브와 무덤에 남는다.** 바꾸거나 지우면 그 전설을 가진 세이브가 깨진다.
 * 인물을 늘리는 것은 뒤에 붙이면 된다. 순서를 바꾸면 "어느 전설이 나오나"의 추첨이 바뀐다
 * (이미 뽑힌 개체는 legendId를 저장하므로 안 바뀐다).
 */
import type { HeroDefId } from '../types';
import type { TemperId } from './temperaments';
import type { VoiceMoment } from './voice';

export type LegendId =
  | 'l_adelhart'
  | 'l_sien'
  | 'l_morga'
  | 'l_valek'
  | 'l_irene'
  | 'l_kael';

export interface LegendDef {
  id: LegendId;
  /** 한 단어. 봉인·유일성 판정의 키이기도 하다 */
  name: string;
  title: string;
  /** 빌리는 유형 — 전투·스킬·초상 */
  defId: HeroDefId;
  temper: TemperId;
  /** 유형의 초상 변형 중 고정된 한 장. 회차마다 얼굴이 바뀌면 안 된다 */
  variant: number;
  /** 생전 — `origin.ts`의 station/ending과 같은 꼴(마침표 없이) */
  station: string;
  ending: string;
  /** 다섯 순간의 말. 동료 사망은 `{ally:이/가}` 꼴을 쓴다(voice.ts와 같은 규칙) */
  lines: Record<VoiceMoment, readonly string[]>;
}

export const LEGENDS: readonly LegendDef[] = [
  {
    id: 'l_adelhart',
    name: '아델하르트',
    title: '왕관 없이 죽은 왕',
    defId: 'h_banner' as HeroDefId,
    temper: 'proud',
    variant: 2,
    station: '무너진 왕국의 마지막 왕이었다',
    ending: '성문이 열린 날, 왕관을 벗어 적장의 발밑에 던졌다',
    lines: {
      summon: ['왕을 부른 자가 누구냐. …마스터라. 좋다, 이번엔 네 깃발 아래 서 주지.'],
      sortie: ['내 뒤에 선 자는 하나도 잃지 않는다. 한 번 어긴 맹세다. 두 번은 없다.',
        '마스터, 왕은 앞에 선다. 그게 왕관보다 오래 남는 것이다.'],
      sacrifice: ['왕을 제단에 올리는가. …그래, 백성도 나를 그렇게 썼지.'],
      allyDeath: ['{ally:을/를} 지키지 못했다. 왕국을 잃은 날과 같은 얼굴을 하고 있군, 나는.'],
      death: ['왕관은… 이미 던졌다… 이번엔… 목숨이군.'],
    },
  },
  {
    id: 'l_sien',
    name: '시엔',
    title: '천 번 결투한 검',
    defId: 'h_bolt' as HeroDefId,
    temper: 'silent',
    variant: 4,
    station: '용병단 백 개를 혼자 끝낸 검사였다',
    ending: '천 번째 결투에서, 처음으로 상대를 살려 보냈다',
    lines: {
      summon: ['…천한 번째인가. 마스터, 상대는 어디 있지.'],
      sortie: ['……벤다.', '…마스터. 끝나면 이름을 불러라. 돌아오겠다.'],
      sacrifice: ['…칼을 놓는 법은 배운 적이 없는데.'],
      allyDeath: ['……{ally}. 네 몫까지 벤다.'],
      death: ['…천한 번째는… 졌군.'],
    },
  },
  {
    id: 'l_morga',
    name: '모르가',
    title: '역병을 품은 성녀',
    defId: 'h_leech' as HeroDefId,
    temper: 'gentle',
    variant: 1,
    station: '역병 도시에 스스로 걸어 들어간 성녀였다',
    ending: '마지막 환자의 손을 잡은 채 숨을 거뒀다',
    lines: {
      summon: ['또 아픈 사람들이 있는 곳이군요. 마스터, 누구부터 돌보면 될까요?'],
      sortie: ['다친 사람은 제 뒤로. 피는 제가 대신 흘릴게요.',
        '마스터, 이번에도 전부 데리고 돌아올게요. 그게 제 일이니까.'],
      sacrifice: ['제 피가 그 사람을 살린다면… 그건 제가 늘 해 오던 일이에요.'],
      allyDeath: ['{ally}의 손을 끝까지 잡아 주지 못했어요. …다음엔 놓지 않을게요.'],
      death: ['괜찮아요… 이번엔… 제가 환자네요.'],
    },
  },
  {
    id: 'l_valek',
    name: '발레크',
    title: '북문의 거인',
    defId: 'h_anvil' as HeroDefId,
    temper: 'loyal',
    variant: 3,
    station: '왕도 북문을 삼십 년 지킨 문지기 대장이었다',
    ending: '문이 무너진 뒤에도 그 자리에 서 있었다',
    lines: {
      summon: ['문을 지키라 하시면 지키겠습니다, 마스터. 그것밖에 모르는 사람입니다.'],
      sortie: ['제가 문입니다. 제 뒤로는 아무것도 못 지나갑니다.',
        '삼십 년 섰던 자리입니다. 한 층쯤이야.'],
      sacrifice: ['문은 무너져도 돌은 남지요. 제 돌로 다른 문을 세우십시오, 마스터.'],
      allyDeath: ['{ally:이/가} 제 등 뒤에서 쓰러졌습니다. 문지기가… 문을 놓쳤습니다.'],
      death: ['아직… 서 있습니까… 제가…'],
    },
  },
  {
    id: 'l_irene',
    name: '이레네',
    title: '서고를 태운 마녀',
    defId: 'h_cinder' as HeroDefId,
    temper: 'cynic',
    variant: 5,
    station: '금지된 서고를 불태운 궁정 마법사였다',
    ending: '화형대 위에서 끝까지 웃었다',
    lines: {
      summon: ['불에 타 죽은 마녀를 다시 불러? 마스터, 취향 한번 고약하네.'],
      sortie: ['전부 태우면 되는 거지? 그건 자신 있어.',
        '살아 돌아오면 칭찬해 줘, 마스터. 죽으면… 뭐, 익숙하니까.'],
      sacrifice: ['또 누군가를 위해 타는 거네. 이번엔 장작이 나고.'],
      allyDeath: ['{ally}. 멍청하게 앞에 서더니. …다음엔 내가 먼저 태워 줄게, 그놈들.'],
      death: ['또 불이네… 이번엔… 웃을 힘이 없어.'],
    },
  },
  {
    id: 'l_kael',
    name: '카엘',
    title: '이름이 지워진 영웅',
    defId: 'h_gale' as HeroDefId,
    temper: 'resigned',
    variant: 0,
    station: '한 시대의 전쟁을 끝낸 뒤 스스로 사라진 영웅이었다',
    ending: '아무도 그의 무덤이 어디 있는지 모른다',
    lines: {
      summon: ['한 번 끝낸 이야기다, 마스터. …그래도 불렀다면, 한 번 더 걷지.'],
      sortie: ['전쟁을 끝내 봤다. 탑 하나쯤은 끝낼 수 있겠지.',
        '마스터, 영웅은 돌아오지 않는 쪽이 더 오래 기억된다. …그래도 돌아오마.'],
      sacrifice: ['이름을 지우고 사라지는 건, 한 번 해 봤다.'],
      allyDeath: ['{ally}의 이름은 내가 기억한다. 내 이름은 아무도 기억하지 않아도 된다.'],
      death: ['이번엔… 무덤이 어디 있는지… 다들 알겠군.'],
    },
  },
];

export const LEGEND_BY_ID: Record<LegendId, LegendDef> =
  Object.fromEntries(LEGENDS.map((l) => [l.id, l])) as Record<LegendId, LegendDef>;

/**
 * ★5 소환 중 전설이 나올 몫. **첫 제안값**이다.
 *
 * ★5가 이미 희소하다(젬 소환 4% + 천장 60). 1/3이면 젬 소환 1회당 약 1.3%.
 * 올리면 전설이 흔해져 "그 사람"의 무게가 사라지고, 내리면 한 회차에 한 명도 못 만난다.
 * 전투 수치에는 닿지 않으므로 `sim`·`climb-check`는 이 값에 반응하지 않는다.
 */
export const LEGEND_SHARE_OF_STAR5 = 1 / 3;
