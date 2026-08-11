import type { HeroInstance } from './types';
import { STREAM, substream } from './rng';
import { potentialOf } from './stats';
import { potentialScore } from './potential';
import { REVEAL_TUNING as R } from './data/potential';

/**
 * 발굴 — 잠재치를 가리고, 관찰로 좁혀간다
 *
 * 참값을 그대로 보여주면 개체차는 그냥 "숨은 스탯"이고 판단할 게 없다.
 * 구간 추정으로 내보내면 유저가 "이놈이 클지" 판단하게 되고, 그 판단이 게임이 된다.
 *
 * 그리고 진행도는 전투에 내보내야만 오른다. 즉 알아보려면 죽을 위험을 감수해야 한다.
 * 발굴과 퍼머데스가 맞물리는 지점이며, 두 시스템을 한 게임에 넣는 이유다.
 */

/** 발굴 진행도에 따른 표시 단계 */
export type RevealStage = 'unknown' | 'vague' | 'narrowing' | 'confident';

export function stageOf(progress: number): RevealStage {
  if (progress < 0.15) return 'unknown';
  if (progress < 0.45) return 'vague';
  if (progress < 0.8) return 'narrowing';
  return 'confident';
}

export interface PotentialEstimate {
  stage: RevealStage;
  progress: number;
  /** 추정 구간 (잠재 계수 단위). stage가 unknown이면 null */
  range: { low: number; high: number } | null;
  /** 화면에 그대로 띄울 문구 */
  label: string;
}

/**
 * 진행도를 양자화한다.
 *
 * 이게 없으면 진행도가 0.0001 움직일 때마다 노이즈가 다시 뽑혀 두 가지가 망가진다.
 * 표시값이 깜빡이고, 유저가 상세창을 여닫으며 추정치를 재추첨할 수 있다.
 */
function quantize(progress: number): number {
  return Math.round(progress / R.quantizeStep) * R.quantizeStep;
}

/**
 * 결정론적 추정 노이즈.
 *
 * 매 렌더마다 새로 뽑으면 안 된다. 시드 + 양자화된 진행도에서만 파생하므로
 * 같은 개체를 몇 번 열어봐도 같은 값이 나온다.
 */
function noiseFor(seed: number, qProgress: number): number {
  const step = Math.round(qProgress / R.quantizeStep);
  const rng = substream((seed ^ Math.imul(step + 1, 0x85ebca6b)) >>> 0, STREAM.REVEAL);
  rng(); // 첫 값은 버린다 — 시드 하위 비트의 영향을 줄인다
  return rng() * 2 - 1; // -1 ~ +1
}

const LABELS: Record<RevealStage, string> = {
  unknown: '잠재력: 판단 불가',
  vague: '잠재력: 가늠하기 어렵다',
  narrowing: '잠재력: ',
  confident: '잠재력: ',
};

/** 계수를 사람이 읽는 등급 표현으로 */
function describeBand(v: number): string {
  if (v < -0.06) return '기대 이하';
  if (v < 0.02) return '평범';
  if (v < 0.10) return '평균 이상';
  if (v < 0.18) return '우수';
  return '비범';
}

/**
 * 개체의 잠재치 추정. 화면은 참값 대신 이것만 읽어야 한다.
 *
 * 진행도가 오르면 노이즈 폭이 줄어 구간이 좁아진다.
 * 100%에서도 폭이 완전히 0은 아니다 — 확신을 주되 신비를 조금 남긴다.
 */
export function estimatePotential(inst: HeroInstance): PotentialEstimate {
  const progress = Math.min(1, Math.max(0, inst.revealProgress ?? 0));
  const stage = stageOf(progress);
  const bonus = potentialOf(inst);

  if (stage === 'unknown' || bonus === undefined || inst.seed === undefined) {
    return { stage: 'unknown', progress, range: null, label: LABELS.unknown };
  }

  const truth = potentialScore(bonus);
  const q = quantize(progress);
  const amplitude = R.maxNoise * Math.pow(1 - q, R.noiseDecayK);
  const center = truth + amplitude * noiseFor(inst.seed, q);
  // 완전 발굴에서도 최소 폭은 남긴다 — 구간이 한 점으로 닫히면 데이터 시트가 된다
  const half = Math.max(R.minWidth / 2, amplitude * 0.6);

  const range = { low: center - half, high: center + half };

  if (stage === 'vague') {
    return { stage, progress, range, label: LABELS.vague };
  }

  const lo = describeBand(range.low);
  const hi = describeBand(range.high);
  const body = lo === hi ? lo : `${lo} ~ ${hi}`;
  return { stage, progress, range, label: LABELS[stage] + body };
}

/**
 * 전투 참여로 진행도를 올린다. 생존 여부와 무관하게 관찰은 쌓인다.
 * (죽은 영웅의 진행도는 무덤 기록에 남는다 — 그게 "알아냈는데 잃었다"의 무게다)
 */
export function advanceReveal(
  inst: HeroInstance,
  opts: { battles?: number; floorsCleared?: number } = {},
): HeroInstance {
  const gain =
    (opts.battles ?? 0) * R.perBattle + (opts.floorsCleared ?? 0) * R.perFloor;
  if (gain <= 0) return inst;
  const next = Math.min(1, (inst.revealProgress ?? 0) + gain);
  return { ...inst, revealProgress: next };
}
