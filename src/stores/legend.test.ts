/**
 * 전설(gdd-v3 §4.11)의 저장 경로 — 소환 → 로스터 → 세이브 → 무덤.
 * 판정 자체는 game/legend.test.ts의 몫이다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRunStore } from './runStore';
import { deserialize, loadRun, serialize } from './save';
import { deserializeLegacy, emptyLegacy, loadLegacy, serializeLegacy } from './legacy';
import { LEGEND_BY_ID, type LegendId } from '../game/data/legends';

class MemStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage());
});

/** 젬을 채우고 전설이 나올 때까지 젬 소환 — 시드마다 새 스토어 */
function pullLegend() {
  for (let s = 0; s < 20000; s++) {
    vi.stubGlobal('localStorage', new MemStorage());
    const st = createRunStore(() => s);
    st.setState({ wallet: { ...st.getState().wallet, gems: 500 } });
    const r = st.getState().summon('premium', 0);
    if (r.ok && r.hero.legendId) return { st, hero: r.hero };
  }
  throw new Error('전설이 한 번도 안 나왔다');
}

describe('전설 — 저장 경로', () => {
  it('소환된 전설은 로스터에 들어가고, 세이브를 거쳐도 전설이다', () => {
    const { hero } = pullLegend();
    const saved = loadRun()!;
    const back = saved.roster.find((h) => h.instId === hero.instId)!;
    expect(back.legendId).toBe(hero.legendId);
    expect(back.name).toBe(LEGEND_BY_ID[hero.legendId as LegendId].name);
  });

  it('만난 전설은 무덤(회차를 넘는 기록)에 적힌다', () => {
    const { hero } = pullLegend();
    expect(loadLegacy().legendsMet).toContain(hero.legendId);
  });

  it('모르는 전설 id는 불러올 때 버린다', () => {
    const { st, hero } = pullLegend();
    const s = st.getState();
    const raw = serialize({
      ...s,
      roster: s.roster.map((h) => (h.instId === hero.instId ? { ...h, legendId: 'l_nobody' } : h)),
    });
    const back = deserialize(raw)!.roster.find((h) => h.instId === hero.instId)!;
    expect('legendId' in back).toBe(false);
  });

  it('무덤의 전설 목록은 왕복하고, 옛 무덤에서는 빈 목록이다', () => {
    const l = { ...emptyLegacy(), legendsMet: ['l_sien', 'l_nobody', 'l_sien'] };
    expect(deserializeLegacy(serializeLegacy(l)).legendsMet).toEqual(['l_sien']);
    const old = JSON.stringify({ version: 1, runNo: 1, runs: [], fallen: [], summit: [], codex: {} });
    expect(deserializeLegacy(old).legendsMet).toEqual([]);
  });
});
