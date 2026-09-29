/**
 * 전투 기록 문장 — 책략이 성공하거나 간파된 장면. 결과 화면·영웅 연대기·전투 중 비트가 쓴다.
 *
 * 자리표시는 `{ally}`(수행자 이름)와 조사 꼴 `{ally:이/가}`만 쓴다 — `fillVoice`로 채운다.
 * `{ally}가`처럼 조사를 붙여 쓰면 「세인가」가 찍힌다(CLAUDE.md 규칙). `chronicle.test.ts`가 잠근다.
 *
 * 문장은 연의의 장면을 **영웅이 다시 사는 것**으로 쓴다. 원작 인물 이름(황충·제갈량…)은
 * 카드의 출처 줄에만 두고, 여기서는 우리 영웅이 주어다.
 */
import type { StratagemId } from './stratagems';

export interface ChronicleLines {
  success: string;
  failure: string;
}

export const CHRONICLE_LINES: Record<StratagemId, ChronicleLines> = {
  ambush: {
    success: '{ally:이/가} 숨겨 둔 병력을 풀었다. 가장 날뛰던 적이 등 뒤에서 무너졌다.',
    failure: '적이 매복을 먼저 읽었다. 숨어 있던 {ally:이/가} 역으로 포위당해 크게 다쳤다.',
  },
  nightRaid: {
    success: '{ally:이/가} 어둠을 틈타 적진에 뛰어들었다. 놀란 적들이 한동안 칼을 들지 못했다.',
    failure: '적의 진영은 잠들어 있지 않았다. 기습에 나선 {ally:이/가} 피투성이로 돌아왔다.',
  },
  lureFire: {
    success: '{ally:이/가} 짐짓 물러나 적을 좁은 곳으로 끌어들이고 불을 놓았다. 적진이 불길에 휩싸였다.',
    failure: '적이 뒤쫓지 않았다. 미끼가 된 {ally:이/가} 홀로 남아 크게 다쳤다.',
  },
  flood: {
    success: '{ally:이/가} 물길을 텄다. 불어난 물에 적의 발이 묶이고 갑옷이 무거워졌다.',
    failure: '물길이 거꾸로 흘렀다. {ally:이/가} 휩쓸리고, 아군의 발이 진창에 빠졌다.',
  },
  emptyFort: {
    success: '{ally:은/는} 문을 열고 태연히 앉아 있었다. 적은 복병을 의심해 끝내 들어오지 못했다.',
    failure: '적은 속지 않았다. 빈 성임을 알아챈 적이 기세를 올려 몰려들었다.',
  },
  redCliffs: {
    success: '{ally:이/가} 적을 한데 묶어 불을 질렀다. 바람을 탄 불길이 적진 전체를 삼켰다.',
    failure: '거짓 투항이 간파됐다. {ally:이/가} 매를 맞은 채 돌아왔고, 아군의 기세가 꺾였다.',
  },
};
