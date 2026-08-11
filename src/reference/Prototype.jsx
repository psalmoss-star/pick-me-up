import React, { useState, useEffect, useRef, useMemo } from 'react';

/* ══════════════════════════════════════════════════════════
 *  탑 등반 프로토타입 v2
 *  대기실(탑 미니맵) → 브리핑 → 전투(스테이지 아트 + 이벤트 확인) → 결과
 * ══════════════════════════════════════════════════════════ */

const T = {
  void: '#050508', panel: '#0F0D16', panelHi: '#1C1628',
  frame: '#E8E4D9', rare: '#B57CE0', gold: '#D4AF37',
  blood: '#C1272D', amber: '#E0913A', text: '#F0ECE2', dim: '#8A8496',
};

const TONES = {
  normal: { line: T.frame, glow: 'rgba(232,228,217,.20)', text: T.text },
  rare: { line: T.rare, glow: 'rgba(181,124,224,.45)', text: '#F3E8FF' },
  warning: { line: T.amber, glow: 'rgba(224,145,58,.35)', text: '#FFE9CC' },
  death: { line: T.blood, glow: 'rgba(193,39,45,.40)', text: '#F5D0D0' },
};

const STAR_TIERS = {
  1: { ring: '#4E4B45', fill: '#1A1916', glow: 0, corners: 0, lattice: 0, halo: 0 },
  2: { ring: '#8A5E36', fill: '#231810', glow: 0, corners: 1, lattice: 0, halo: 0 },
  3: { ring: '#6F8598', fill: '#141A20', glow: 5, corners: 2, lattice: 0, halo: 0 },
  4: { ring: '#D4AF37', ringHi: '#F6E08A', fill: '#241C0B', glow: 20, corners: 3, lattice: 1, halo: 0 },
  5: { ring: '#FFF3C9', ringHi: '#FFF', fill: '#1E1830', glow: 38, corners: 4, lattice: 1, halo: 1 },
  6: { ring: '#F0C34A', ringHi: '#FFF6D0', fill: '#070505', glow: 54, corners: 4, lattice: 1, halo: 1 },
};

const TINT = { fire: '#C1442D', water: '#2D7FA8', wind: '#3E9E73', earth: '#8A6A3C', thunder: '#8B6FC4' };
const EL_KR = { fire: '화', water: '수', wind: '풍', earth: '지', thunder: '뇌' };
const KLASS = { 1: '초보자', 2: '견습병', 3: '정예병', 4: '기사', 5: '기사단장', 6: '영웅' };
const SCALING = { 1: { maxLevel: 10, mult: 1 }, 2: { maxLevel: 20, mult: 1.35 }, 3: { maxLevel: 40, mult: 1.9 }, 4: { maxLevel: 60, mult: 2.7 }, 5: { maxLevel: 80, mult: 3.8 }, 6: { maxLevel: 99, mult: 5.4 } };

function createRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SKILLS = {
  slash: { name: '가름', cd: 0, side: 'enemy', scope: 'single', power: 1.8, scale: 'atk' },
  rend: { name: '찢는 일격', cd: 3, side: 'enemy', scope: 'single', power: 2.5, scale: 'atk', debuff: 'defDown' },
  guard: { name: '방벽', cd: 4, side: 'ally', scope: 'all', buff: 'defUp' },
  bash: { name: '강타', cd: 0, side: 'enemy', scope: 'single', power: 2, scale: 'def' },
  mend: { name: '치유의 빛', cd: 3, side: 'ally', scope: 'lowestHp', heal: 1.5 },
  spark: { name: '전격', cd: 0, side: 'enemy', scope: 'single', power: 1.5, scale: 'atk' },
  maul: { name: '포효 강타', cd: 3, side: 'enemy', scope: 'all', power: 1.3, scale: 'atk' },
};

const HERO_DEFS = {
  ashen: { name: '재의 카일', title: '무너진 성벽의 파수꾼', element: 'fire', role: 'dealer', atkAttr: 'str', caps: { str: 22, int: 8, vit: 14, agi: 17 }, skills: ['rend', 'slash'], art: 'sword' },
  bulwark: { name: '석문의 오르나', title: '움직이지 않는 자', element: 'earth', role: 'tank', atkAttr: 'str', caps: { str: 13, int: 6, vit: 30, agi: 9 }, skills: ['guard', 'bash'], art: 'shield' },
  tide: { name: '물결의 세인', title: '가라앉은 사원의 사제', element: 'water', role: 'healer', atkAttr: 'int', caps: { str: 7, int: 21, vit: 16, agi: 14 }, skills: ['mend', 'spark'], art: 'staff' },
  gale: { name: '북풍의 리엔', title: '서리 위를 걷는 자', element: 'wind', role: 'dealer', atkAttr: 'str', caps: { str: 20, int: 10, vit: 15, agi: 22 }, skills: ['rend', 'slash'], art: 'dagger' },
  bolt: { name: '벼락의 이스카', title: '하늘을 가른 검', element: 'thunder', role: 'breaker', atkAttr: 'int', caps: { str: 12, int: 24, vit: 17, agi: 20 }, skills: ['maul', 'spark'], art: 'greatsword' },
};

const ENEMY_DEFS = {
  slime: { name: '잿빛 슬라임', element: 'water', role: 'dealer', art: 'blob', stats: { hp: 900, atk: 105, def: 30, spd: 40, crit: .03 }, skills: ['slash'] },
  hound: { name: '재의 사냥개', element: 'fire', role: 'dealer', art: 'beast', stats: { hp: 650, atk: 98, def: 22, spd: 62, crit: .1 }, skills: ['slash'] },
  golem: { name: '균열의 골렘', element: 'earth', role: 'tank', art: 'golem', stats: { hp: 3700, atk: 180, def: 55, spd: 44, crit: .08 }, skills: ['maul', 'bash'] },
};

const MISSION_LABEL = { subjugate: '토벌', survive: '생존', defend: '수비', escort: '호위', escape: '탈출', seize: '탈취' };

const FLOORS = [
  { id: 1, name: '무너진 관문', scene: 'ruins', mission: { kind: 'subjugate', briefing: '길을 막은 것들을 치워라.' }, enemies: ['slime', 'hound'] },
  { id: 2, name: '재의 들판', scene: 'field', mission: { kind: 'subjugate', briefing: '적을 섬멸하라!' }, enemies: ['slime', 'slime'] },
  { id: 3, name: '버려진 초소', scene: 'outpost', mission: { kind: 'survive', turns: 6, briefing: '지원이 도착할 때까지 6턴간 살아남아라!' }, enemies: ['hound', 'hound'] },
  { id: 4, name: '성문 앞', scene: 'gate', mission: { kind: 'defend', turns: 7, briefing: '성문이 무너지기 전에 7턴을 버텨라!' }, enemies: ['hound', 'hound'], guards: [{ id: 'gate', name: '성문', kind: 'objective', art: 'gate', hp: 850, def: 16 }] },
  { id: 5, name: '무너진 회랑', scene: 'corridor', mission: { kind: 'escort', briefing: '황녀를 살린 채 적을 섬멸하라!' }, enemies: ['hound', 'slime'], guards: [{ id: 'princess', name: '황녀', kind: 'npc', art: 'princess', hp: 1300, def: 24 }] },
  { id: 6, name: '균열의 심장', scene: 'chasm', boss: true, mission: { kind: 'subjugate', briefing: '균열의 골렘을 토벌하라!' }, enemies: ['golem'] },
];

// ─── 능력치 ───────────────────────────────────────────────
function attrsOf(def, star, level) {
  const { mult, maxLevel } = SCALING[star];
  const fill = Math.min(1, level / maxLevel);
  const b = (k) => { const max = Math.round(def.caps[k] * mult); return { current: Math.max(1, Math.round(max * fill)), max }; };
  return { str: b('str'), int: b('int'), vit: b('vit'), agi: b('agi') };
}
function statsOf(def, star, level) {
  const a = attrsOf(def, star, level);
  return { hp: a.vit.current * 20 + star * 100, atk: (def.atkAttr === 'int' ? a.int.current : a.str.current) * 6, def: a.vit.current * 2 + a.str.current, spd: a.agi.current * 3, crit: Math.min(.6, .03 + a.agi.current * .002) };
}
const atCap = (a) => ['str', 'int', 'vit', 'agi'].every((k) => a[k].current >= a[k].max);

const CHART = (() => {
  const o = ['fire', 'wind', 'earth', 'thunder', 'water'], m = {};
  o.forEach((atk, i) => { m[atk] = {}; o.forEach((d, j) => { m[atk][d] = (i + 1) % 5 === j ? 1.5 : (j + 1) % 5 === i ? .7 : 1; }); });
  return m;
})();

// ─── 전투 시뮬레이터 ──────────────────────────────────────
const DEF_K = 300, TANK_AGGRO = .6;
const FOCUS = { defend: { kind: 'objective', chance: .7 }, escort: { kind: 'npc', chance: .6 } };

function simulate({ party, floor, seed }) {
  const rng = createRng(seed), units = [];
  party.forEach((h) => {
    const d = HERO_DEFS[h.defId], s = statsOf(d, h.star, h.level);
    units.push({ uid: 'A:' + h.id, kind: 'hero', side: 'ally', srcId: h.id, defId: h.defId, star: h.star, name: d.name, element: d.element, role: d.role, stats: s, hp: s.hp, maxHp: s.hp, statuses: [], cd: {}, alive: true, skills: d.skills });
  });
  (floor.guards ?? []).forEach((g) => {
    units.push({ uid: 'G:' + g.id, kind: 'guard', guardKind: g.kind, art: g.art, side: 'ally', srcId: g.id, name: g.name, element: 'earth', role: 'support', stats: { hp: g.hp, atk: 0, def: g.def, spd: 0, crit: 0 }, hp: g.hp, maxHp: g.hp, statuses: [], cd: {}, alive: true, skills: [] });
  });
  floor.enemies.forEach((e, i) => {
    const d = ENEMY_DEFS[e];
    units.push({ uid: 'E:' + i, kind: 'enemy', side: 'enemy', srcId: e, name: d.name, element: d.element, role: d.role, stats: { ...d.stats }, hp: d.stats.hp, maxHp: d.stats.hp, statuses: [], cd: {}, alive: true, skills: d.skills });
  });

  const heroes = units.filter((u) => u.kind === 'hero'), guards = units.filter((u) => u.kind === 'guard'), enemies = units.filter((u) => u.kind === 'enemy');
  const focus = FOCUS[floor.mission.kind], events = [];
  const mod = (c, up, dn) => { let m = 1; c.statuses.forEach((s) => { if (s.k === up) m += .35; if (s.k === dn) m -= .3; }); return Math.max(.1, m); };
  const eA = (c) => c.stats.atk * mod(c, 'atkUp', 'atkDown');
  const eD = (c) => c.stats.def * mod(c, 'defUp', 'defDown');

  const check = (turn) => {
    if (!heroes.some((h) => h.alive)) return 'defeat';
    const m = floor.mission, gA = (k) => guards.filter((g) => g.guardKind === k).every((g) => g.alive);
    if (m.kind === 'subjugate') return enemies.some((e) => e.alive) ? 'ongoing' : 'victory';
    if (m.kind === 'survive' || m.kind === 'escape') return turn >= m.turns ? 'victory' : 'ongoing';
    if (m.kind === 'defend') { if (!gA('objective')) return 'defeat'; return turn >= m.turns ? 'victory' : 'ongoing'; }
    if (m.kind === 'escort') { if (!gA('npc')) return 'defeat'; return enemies.some((e) => e.alive) ? 'ongoing' : 'victory'; }
    return 'ongoing';
  };

  const hit = (tg, amt, actorUid, turn) => {
    tg.hp = Math.max(0, tg.hp - amt);
    events.push({ turn, type: 'damage', actor: actorUid, target: tg.uid, amount: amt });
    if (tg.hp <= 0 && tg.alive) { tg.alive = false; events.push({ turn, type: 'death', target: tg.uid, name: tg.name, kind: tg.kind, guardKind: tg.guardKind }); }
  };

  let turn = 0, outcome = 'timeout';
  while (turn < 40) {
    turn++;
    events.push({ turn, type: 'turn' });
    const order = units.filter((u) => u.alive && u.kind !== 'guard').sort((a, b) => b.stats.spd - a.stats.spd);
    for (const actor of order) {
      if (!actor.alive) continue;
      const usable = actor.skills.map((k) => ({ k, s: SKILLS[k] })).filter(({ k }) => (actor.cd[k] ?? 0) <= 0);
      const pick = usable.length ? usable.reduce((a, b) => (a.s.cd >= b.s.cd ? a : b)) : null;
      if (pick) {
        const sk = pick.s;
        const pool = units.filter((u) => u.alive && (sk.side === 'ally' ? u.side === actor.side : u.side !== actor.side));
        let targets = [];
        if (pool.length) {
          if (sk.scope === 'all') targets = pool;
          else if (sk.scope === 'lowestHp') targets = [pool.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))];
          else {
            const prot = pool.filter((c) => c.kind === 'guard' && c.guardKind === focus?.kind);
            if (focus && actor.side === 'enemy' && prot.length && rng() < focus.chance) targets = [prot[Math.floor(rng() * prot.length)]];
            else {
              const tanks = pool.filter((c) => c.role === 'tank');
              const cand = actor.side === 'enemy' && tanks.length && rng() < TANK_AGGRO ? tanks : pool;
              targets = [cand[Math.floor(rng() * cand.length)]];
            }
          }
        }
        if (targets.length) {
          events.push({ turn, type: 'skill', actor: actor.uid, actorName: actor.name, skill: sk.name, targets: targets.map((t) => t.uid) });
          targets.forEach((tg) => {
            if (sk.power) {
              const base = sk.scale === 'def' ? eD(actor) : eA(actor);
              const mit = DEF_K / (DEF_K + eD(tg)), el = CHART[actor.element][tg.element];
              const crit = rng() < actor.stats.crit;
              hit(tg, Math.max(1, Math.round(base * sk.power * mit * el * (crit ? 1.6 : 1) * (.95 + rng() * .1))), actor.uid, turn);
            }
            if (sk.heal) { const b4 = tg.hp; tg.hp = Math.min(tg.maxHp, tg.hp + Math.round(eA(actor) * sk.heal)); events.push({ turn, type: 'heal', actor: actor.uid, target: tg.uid, amount: tg.hp - b4 }); }
            if (sk.buff) tg.statuses.push({ k: sk.buff, t: 3 });
            if (sk.debuff && rng() < .7) tg.statuses.push({ k: sk.debuff, t: 2 });
          });
          actor.cd[pick.k] = sk.cd;
        }
      }
      Object.keys(actor.cd).forEach((k) => { actor.cd[k] = Math.max(0, actor.cd[k] - 1); });
      actor.statuses = actor.statuses.filter((s) => --s.t > 0);
      const mid = check(turn);
      if (mid !== 'ongoing') { outcome = mid; break; }
    }
    if (outcome !== 'timeout') break;
    const end = check(turn);
    if (end !== 'ongoing') { outcome = end; break; }
  }

  const dmg = {};
  events.filter((e) => e.type === 'damage' && e.actor?.startsWith('A:')).forEach((e) => { dmg[e.actor] = (dmg[e.actor] ?? 0) + e.amount; });
  const mvpUid = Object.keys(dmg).sort((a, b) => dmg[b] - dmg[a])[0];

  return {
    outcome, events, turns: turn,
    casualties: heroes.filter((h) => !h.alive).map((h) => h.srcId),
    mvp: mvpUid ? mvpUid.slice(2) : null,
    roster: units.map((u) => ({ uid: u.uid, kind: u.kind, guardKind: u.guardKind, art: u.art, defId: u.defId, star: u.star, srcId: u.srcId, name: u.name, maxHp: u.maxHp, side: u.side })),
  };
}

// ─── 이벤트 비트 (확인 창이 뜨는 순간) ────────────────────
function deriveBeats(result, floor) {
  const beats = [];
  const hp = {};
  result.roster.forEach((u) => { hp[u.uid] = u.maxHp; });
  const halfFired = {};

  if (floor.boss) beats.push({ at: 0, tone: 'warning', title: '보스 조우', lines: [`${ENEMY_DEFS[floor.enemies[0]].name}이(가) 앞을 가로막았다.`, '한 번의 실수가 파티를 무너뜨린다.'] });

  result.events.forEach((e, i) => {
    if (e.type === 'damage') {
      hp[e.target] -= e.amount;
      const u = result.roster.find((r) => r.uid === e.target);
      if (u?.kind === 'guard' && !halfFired[u.uid] && hp[u.uid] <= u.maxHp * 0.5 && hp[u.uid] > 0) {
        halfFired[u.uid] = true;
        beats.push({ at: i + 1, tone: 'warning', title: '경고', lines: [`${u.name}의 내구도가 절반 이하로 떨어졌습니다.`, u.guardKind === 'objective' ? '파괴되면 즉시 임무 실패입니다.' : '쓰러지면 즉시 임무 실패입니다.'] });
      }
    }
    if (e.type === 'heal') hp[e.target] += e.amount;
    if (e.type === 'death') {
      const u = result.roster.find((r) => r.uid === e.target);
      if (u?.kind === 'hero') beats.push({ at: i + 1, tone: 'death', title: '영웅 사망', lines: [`${e.name}이(가) 쓰러졌습니다.`, '되살릴 수 없습니다.'] });
      else if (u?.kind === 'guard') beats.push({ at: i + 1, tone: 'death', title: '임무 실패', lines: [`${e.name}을(를) 지키지 못했습니다.`] });
    }
  });
  return beats.sort((a, b) => a.at - b.at);
}

// ═══ 아트 ═════════════════════════════════════════════════

function HeroArt({ defId, size = 74, faded }) {
  const d = HERO_DEFS[defId], c = TINT[d.element];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ opacity: faded ? .3 : 1, transition: 'opacity 300ms' }} aria-hidden="true">
      <defs>
        <linearGradient id={`h${defId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity=".95" />
          <stop offset="100%" stopColor="#0A0810" stopOpacity=".9" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="74" rx="18" ry="4" fill="#000" opacity=".5" />
      {/* 망토 */}
      <path d="M28 30 C18 46 18 62 22 72 L58 72 C62 62 62 46 52 30 Z" fill={`url(#h${defId})`} />
      {/* 머리 */}
      <circle cx="40" cy="22" r="10" fill={c} opacity=".9" />
      <path d="M30 20 Q40 8 50 20 Q40 15 30 20 Z" fill="#0B0910" opacity=".85" />
      {/* 직업 소품 */}
      {d.art === 'sword' && <g stroke={c} strokeWidth="3" strokeLinecap="round"><path d="M60 62 L72 26" /><path d="M55 40 L67 44" /></g>}
      {d.art === 'shield' && <g><path d="M56 34 L74 34 L74 52 Q65 64 56 52 Z" fill="#3A3630" stroke={c} strokeWidth="2" /><path d="M65 38 L65 56" stroke={c} strokeWidth="1.5" /></g>}
      {d.art === 'staff' && <g><path d="M64 70 L64 22" stroke={c} strokeWidth="3" strokeLinecap="round" /><circle cx="64" cy="18" r="6" fill="none" stroke={c} strokeWidth="2" /><circle cx="64" cy="18" r="2.5" fill={c} /></g>}
      {d.art === 'dagger' && <g stroke={c} strokeWidth="2.5" strokeLinecap="round"><path d="M60 58 L70 42" /><path d="M20 58 L10 42" /></g>}
      {d.art === 'greatsword' && <g><path d="M40 8 L46 20 L46 60 L34 60 L34 20 Z" fill={c} opacity=".55" stroke={c} strokeWidth="1.5" /><path d="M26 60 L54 60" stroke={c} strokeWidth="3" strokeLinecap="round" /></g>}
    </svg>
  );
}

function EnemyArt({ srcId, size = 78, faded }) {
  const d = ENEMY_DEFS[srcId], c = TINT[d.element];
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ opacity: faded ? .18 : 1, transition: 'opacity 400ms' }} aria-hidden="true">
      <ellipse cx="40" cy="74" rx="20" ry="4" fill="#000" opacity=".5" />
      {d.art === 'blob' && (
        <g>
          <path d="M12 68 Q8 40 40 30 Q72 40 68 68 Z" fill={c} opacity=".75" />
          <path d="M12 68 Q8 40 40 30 Q72 40 68 68 Z" fill="none" stroke={c} strokeWidth="1.5" />
          <circle cx="31" cy="52" r="3.5" fill="#0A0810" />
          <circle cx="49" cy="52" r="3.5" fill="#0A0810" />
          <path d="M22 44 Q40 36 58 44" stroke="#fff" strokeWidth="1" opacity=".25" fill="none" />
        </g>
      )}
      {d.art === 'beast' && (
        <g>
          <path d="M14 62 L22 42 L44 38 L64 44 L70 58 L60 62 L56 52 L34 54 L28 64 Z" fill={c} opacity=".8" />
          <path d="M62 44 L72 30 L74 46 Z" fill={c} />
          <circle cx="66" cy="42" r="2.2" fill="#FFE08A" />
          <g stroke={c} strokeWidth="2.5" strokeLinecap="round"><path d="M24 62 L20 72" /><path d="M36 60 L34 72" /><path d="M52 58 L54 72" /><path d="M62 60 L66 72" /></g>
          <path d="M14 62 L4 56" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      {d.art === 'golem' && (
        <g>
          <path d="M20 72 L18 34 L30 22 L50 22 L62 34 L60 72 Z" fill="#3B3125" stroke={c} strokeWidth="2" />
          <path d="M30 22 L34 40 L46 34 L50 22" fill="none" stroke="#E0913A" strokeWidth="1.6" opacity=".9" />
          <path d="M26 48 L40 56 L54 46" fill="none" stroke="#E0913A" strokeWidth="1.6" opacity=".7" />
          <circle cx="32" cy="34" r="3" fill="#E0913A" />
          <circle cx="48" cy="34" r="3" fill="#E0913A" />
          <path d="M8 40 L18 36 L18 60 L8 62 Z" fill="#3B3125" stroke={c} strokeWidth="1.5" />
          <path d="M72 40 L62 36 L62 60 L72 62 Z" fill="#3B3125" stroke={c} strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}

function GuardArt({ art, ratio = 1, size = 92 }) {
  const cracked = ratio < .55, ruined = ratio < .25;
  if (art === 'gate') {
    return (
      <svg width={size} height={size} viewBox="0 0 90 90" aria-hidden="true">
        <ellipse cx="45" cy="84" rx="26" ry="4" fill="#000" opacity=".5" />
        <path d="M14 82 L14 30 Q45 10 76 30 L76 82 Z" fill="#2C2A26" stroke={T.amber} strokeWidth="2" />
        {[24, 34, 44, 54, 64].map((x) => <path key={x} d={`M${x} 34 L${x} 82`} stroke="#4A4640" strokeWidth="3" />)}
        {[42, 56, 70].map((y) => <path key={y} d={`M16 ${y} L74 ${y}`} stroke="#4A4640" strokeWidth="3" />)}
        {cracked && <g stroke={T.blood} strokeWidth="2" fill="none"><path d="M30 34 L38 52 L28 64" /><path d="M62 38 L54 56" /></g>}
        {ruined && <g stroke={T.blood} strokeWidth="2.5" fill="none"><path d="M20 46 L44 58 L36 80" /><path d="M70 44 L58 70" /><path d="M45 30 L48 58" /></g>}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 90 90" aria-hidden="true">
      <ellipse cx="45" cy="84" rx="16" ry="4" fill="#000" opacity=".5" />
      <path d="M45 34 C33 34 28 58 26 82 L64 82 C62 58 57 34 45 34 Z" fill="#7A5C8A" opacity=".9" />
      <circle cx="45" cy="24" r="10" fill="#E8D6C0" />
      <path d="M35 22 Q45 8 55 22 Q52 14 45 14 Q38 14 35 22 Z" fill="#D9B45C" />
      <path d="M38 12 L42 6 L45 11 L48 6 L52 12 Z" fill={T.gold} />
      <path d="M45 44 L45 66" stroke="#E8D6C0" strokeWidth="2" opacity=".6" />
    </svg>
  );
}

function Scene({ kind }) {
  const P = {
    ruins: { sky: ['#221A2E', '#0B0812'], acc: '#4A3A5C' },
    field: { sky: ['#2E1E18', '#0D0808'], acc: '#5C3A2A' },
    outpost: { sky: ['#182430', '#080A10'], acc: '#2E4658' },
    gate: { sky: ['#2A2216', '#0C0A06'], acc: '#5C4A22' },
    corridor: { sky: ['#1C2028', '#08090C'], acc: '#3A4250' },
    chasm: { sky: ['#2A0E12', '#0A0406'], acc: '#6C2020' },
  }[kind] ?? { sky: ['#1A1626', '#08070C'], acc: '#3A3450' };

  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
      <defs>
        <linearGradient id={`sk${kind}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={P.sky[0]} /><stop offset="100%" stopColor={P.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#sk${kind})`} />
      {kind === 'chasm' && <><circle cx="200" cy="150" r="80" fill={P.acc} opacity=".22" /><circle cx="200" cy="150" r="46" fill={P.acc} opacity=".3" /></>}
      {kind === 'gate' && <path d="M120 200 L120 90 Q200 50 280 90 L280 200 Z" fill={P.acc} opacity=".28" />}
      {kind === 'outpost' && <path d="M60 200 L60 110 L100 88 L140 110 L140 200 Z" fill={P.acc} opacity=".3" />}
      {kind === 'corridor' && <><path d="M40 200 L40 60 L70 60 L70 200 Z" fill={P.acc} opacity=".3" /><path d="M330 200 L330 60 L360 60 L360 200 Z" fill={P.acc} opacity=".3" /></>}
      {/* 원경 실루엣 */}
      <path d="M0 200 L0 150 L40 120 L80 155 L130 118 L180 150 L230 112 L290 148 L340 122 L400 152 L400 200 Z" fill="#000" opacity=".55" />
      {kind === 'ruins' && <g fill={P.acc} opacity=".35"><rect x="70" y="105" width="14" height="95" /><rect x="300" y="118" width="12" height="82" /><rect x="325" y="130" width="10" height="70" /></g>}
      <rect y="176" width="400" height="24" fill="#000" opacity=".6" />
    </svg>
  );
}

// ─── 탑 미니맵 ────────────────────────────────────────────
function TowerMap({ current, compact }) {
  const cell = compact ? 26 : 34;
  return (
    <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4, alignItems: 'center' }}>
      {FLOORS.map((f, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'locked';
        const col = state === 'now' ? T.gold : state === 'done' ? '#4A6B4A' : '#26232E';
        return (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: cell, height: cell, border: `1px solid ${col}`,
              background: state === 'now' ? `${T.gold}1A` : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: compact ? 10 : 12, color: state === 'locked' ? '#3A3646' : col,
              boxShadow: state === 'now' ? `0 0 14px ${T.gold}55` : 'none',
              transition: 'all 400ms',
            }}>{f.id}</div>
            {!compact && (
              <div style={{ fontSize: 11, color: state === 'locked' ? '#3A3646' : state === 'now' ? T.text : T.dim, minWidth: 150, textAlign: 'left' }}>
                {state === 'locked' ? '???' : `${f.name} · ${MISSION_LABEL[f.mission.kind]}`}
                {state === 'now' && <span style={{ color: T.gold }}> ◀ 현재</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 전장 배치 미니맵 ─────────────────────────────────────
function FieldMap({ roster, hp }) {
  const dot = (u) => {
    const dead = hp[u.uid] <= 0;
    const c = u.kind === 'enemy' ? '#8B2E2E' : u.kind === 'guard' ? T.amber : '#3E7FBF';
    return <div key={u.uid} title={u.name} style={{ width: u.kind === 'guard' ? 12 : 8, height: u.kind === 'guard' ? 12 : 8, borderRadius: u.kind === 'guard' ? 2 : '50%', background: dead ? '#2A2630' : c, border: `1px solid ${dead ? '#2A2630' : c}`, opacity: dead ? .4 : 1, transition: 'all 300ms' }} />;
  };
  return (
    <div style={{ border: `1px solid ${T.panelHi}`, background: '#08070C', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7, minWidth: 108 }}>
      <div style={{ fontSize: 9, color: T.dim, letterSpacing: '.2em' }}>전장</div>
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>{roster.filter((u) => u.kind === 'enemy').map(dot)}</div>
      <div style={{ height: 1, background: T.panelHi }} />
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>{roster.filter((u) => u.kind === 'guard').map(dot)}</div>
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>{roster.filter((u) => u.kind === 'hero').map(dot)}</div>
    </div>
  );
}

// ═══ 공통 UI ══════════════════════════════════════════════
function OrnateCorner({ color, size = 28, flipX, flipY, density = 4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ transform: `scale(${flipX ? -1 : 1},${flipY ? -1 : 1})`, transformOrigin: 'center', overflow: 'visible' }} aria-hidden="true">
      <g fill="none" stroke={color} strokeLinecap="round" strokeWidth="1.1">
        <path d="M2 14 Q2 2 14 2" />
        {density >= 1 && <path d="M2 22 Q2 8 8 4" opacity=".75" />}
        {density >= 2 && <path d="M6 2 Q18 2 24 6" opacity=".6" />}
        {density >= 3 && <path d="M4 10 Q10 6 14 8 Q10 12 4 10 Z" fill={color} fillOpacity=".5" stroke="none" />}
        {density >= 4 && <circle cx="16" cy="16" r="1.6" fill={color} stroke="none" opacity=".9" />}
      </g>
    </svg>
  );
}

function SystemPanel({ tone = 'normal', children, compact }) {
  const c = TONES[tone] ?? TONES.normal;
  const [on, setOn] = useState(false);
  useEffect(() => { const i = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(i); }, []);
  const line = { height: 1, background: `linear-gradient(90deg,transparent,${c.line} 18%,${c.line} 82%,transparent)`, opacity: .85 };
  return (
    <div style={{ position: 'relative', opacity: on ? 1 : 0, transform: on ? 'none' : 'translateY(14px)', transition: 'opacity 260ms,transform 260ms' }}>
      <div style={{ background: `radial-gradient(120% 140% at 50% 0%,${T.panelHi} 0%,${T.panel} 55%,#07060B 100%)`, border: `1px solid ${c.line}`, boxShadow: `0 0 26px ${c.glow},inset 0 0 34px rgba(0,0,0,.75)`, padding: compact ? '16px 18px' : '26px 22px', textAlign: 'center', color: c.text }}>
        <div style={line} />
        <div style={{ padding: compact ? '10px 0' : '16px 0' }}>{children}</div>
        <div style={line} />
      </div>
      {[[0, 0], [0, 1], [1, 0], [1, 1]].map(([x, y]) => (
        <div key={`${x}${y}`} style={{ position: 'absolute', [y ? 'bottom' : 'top']: -8, [x ? 'right' : 'left']: -8 }}>
          <OrnateCorner color={c.line} flipX={!!x} flipY={!!y} />
        </div>
      ))}
    </div>
  );
}

function Btn({ children, onClick, tone = 'normal', disabled, small }) {
  const c = TONES[tone].line;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? '7px 16px' : '12px 28px', background: 'transparent',
      border: `1px solid ${disabled ? T.dim : c}`, color: disabled ? T.dim : T.text,
      fontFamily: 'inherit', fontSize: small ? 12 : 14, letterSpacing: '.18em',
      cursor: disabled ? 'not-allowed' : 'pointer', boxShadow: disabled ? 'none' : `0 0 18px ${c}22`, opacity: disabled ? .45 : 1,
    }}>{children}</button>
  );
}

function HpBar({ cur, max, color = '#C1272D', w = 108, h = 6 }) {
  const p = Math.max(0, Math.min(1, cur / max));
  return (
    <div style={{ width: w, height: h, background: '#1A1620', border: '1px solid #2A2434' }}>
      <div style={{ width: `${p * 100}%`, height: '100%', background: color, transition: 'width 220ms ease-out' }} />
    </div>
  );
}

function HeroCard({ hero, width = 122, selected, dead, onClick }) {
  const def = HERO_DEFS[hero.defId], tier = STAR_TIERS[hero.star];
  const hi = tier.ringHi || tier.ring, lum = hero.star >= 4;
  return (
    <button onClick={onClick} style={{ width, height: Math.round(width * 1.58), position: 'relative', padding: 0, border: 'none', background: 'transparent', cursor: onClick ? 'pointer' : 'default', filter: dead ? 'grayscale(1) brightness(.5)' : 'none', transform: selected ? 'translateY(-8px)' : 'none', transition: 'transform 180ms,filter 300ms' }}>
      {tier.halo && !dead && <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: `radial-gradient(circle,${hi}33 0%,transparent 70%)`, animation: 'halo 4.5s ease-in-out infinite' }} />}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg,${tier.fill} 0%,#06050A 72%)`, border: `${lum ? 2 : 1}px solid ${selected ? hi : tier.ring}`, boxShadow: tier.glow ? `0 0 ${tier.glow}px ${tier.ring}66,inset 0 0 26px rgba(0,0,0,.85)` : 'inset 0 0 26px rgba(0,0,0,.9)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!!tier.lattice && <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(45deg,${tier.ring}0F 0 1px,transparent 1px 9px),repeating-linear-gradient(-45deg,${tier.ring}0F 0 1px,transparent 1px 9px)` }} />}
        {hero.star >= 3 && <div style={{ position: 'absolute', inset: 5, border: `1px solid ${tier.ring}${lum ? '77' : '44'}` }} />}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1, paddingTop: 12 }}>
          <HeroArt defId={hero.defId} size={width * 0.62} />
        </div>
        <div style={{ textAlign: 'center', padding: '4px 0 2px', zIndex: 1 }}>
          <span style={{ letterSpacing: '.1em', fontSize: hero.star >= 5 ? 10 : 12, color: hi, textShadow: lum ? `0 0 8px ${tier.ring}` : 'none' }}>{'★'.repeat(hero.star)}</span>
        </div>
        <div style={{ margin: '0 6px 6px', zIndex: 1, background: 'linear-gradient(90deg,transparent,#000000CC 14%,#000000CC 86%,transparent)', borderTop: `1px solid ${tier.ring}88`, borderBottom: `1px solid ${tier.ring}88`, padding: '4px 2px' }}>
          <span style={{ color: lum ? hi : T.text, fontSize: 10, whiteSpace: 'nowrap' }}>≪ {def.name} ≫</span>
        </div>
        <div style={{ textAlign: 'center', color: T.dim, fontSize: 9, paddingBottom: 5, zIndex: 1 }}>Lv.{hero.level} · {KLASS[hero.star]}</div>
        {tier.corners > 0 && [[0, 0], [0, 1], [1, 0], [1, 1]].map(([x, y]) => (
          <div key={`${x}${y}`} style={{ position: 'absolute', [y ? 'bottom' : 'top']: 2, [x ? 'right' : 'left']: 2 }}>
            <OrnateCorner color={tier.ring} size={20} flipX={!!x} flipY={!!y} density={tier.corners} />
          </div>
        ))}
      </div>
      {dead && <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true"><line x1="8%" y1="8%" x2="92%" y2="92%" stroke={T.blood} strokeWidth="5" opacity=".85" /><line x1="92%" y1="8%" x2="8%" y2="92%" stroke={T.blood} strokeWidth="5" opacity=".85" /></svg>}
    </button>
  );
}

// ═══ 메인 ═════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState('base');
  const [floorIdx, setFloorIdx] = useState(0);
  const [roster, setRoster] = useState([
    { id: 'h1', defId: 'ashen', star: 2, level: 15, dead: false },
    { id: 'h2', defId: 'bulwark', star: 2, level: 15, dead: false },
    { id: 'h3', defId: 'tide', star: 3, level: 20, dead: false },
    { id: 'h4', defId: 'gale', star: 4, level: 30, dead: false },
    { id: 'h5', defId: 'bolt', star: 5, level: 40, dead: false },
  ]);
  const [party, setParty] = useState(['h1', 'h2', 'h3']);
  const [result, setResult] = useState(null);
  const [detail, setDetail] = useState(null);

  const floor = FLOORS[floorIdx];

  const start = () => {
    const members = party.map((id) => roster.find((h) => h.id === id)).filter(Boolean);
    setResult(simulate({ party: members, floor, seed: Math.floor(Math.random() * 1e5) }));
    setScreen('battle');
  };

  const finish = () => {
    setRoster((r) => r.map((h) => (result?.casualties.includes(h.id) ? { ...h, dead: true } : h)));
    setParty((p) => p.filter((id) => !result?.casualties.includes(id)));
    if (result?.outcome === 'victory') setFloorIdx((i) => Math.min(FLOORS.length - 1, i + 1));
    setResult(null);
    setScreen('base');
  };

  return (
    <div style={{ minHeight: '100vh', background: `radial-gradient(80% 60% at 50% 0%,#12101C 0%,${T.void} 70%)`, color: T.text, fontFamily: "'Nanum Myeongjo','Noto Serif KR',serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap');
        @keyframes halo{0%,100%{opacity:.5}50%{opacity:1}}
        @keyframes float{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-34px);opacity:0}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
        @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
        button:focus-visible{outline:2px solid ${T.rare};outline-offset:2px}
      `}</style>

      {screen === 'base' && <BaseScreen {...{ floor, floorIdx, roster, party, setParty, setScreen, setDetail }} />}
      {screen === 'brief' && <BriefScreen {...{ floor, party, setScreen, start }} />}
      {screen === 'battle' && result && <BattleScreen {...{ result, floor, floorIdx, onEnd: () => setScreen('result') }} />}
      {screen === 'result' && result && <ResultScreen {...{ result, roster, floor, finish }} />}
      {detail && <DetailModal hero={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ─── 대기실 ───────────────────────────────────────────────
function BaseScreen({ floor, floorIdx, roster, party, setParty, setScreen, setDetail }) {
  const toggle = (id) => setParty((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  const alive = roster.filter((h) => !h.dead);
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.1em', borderBottom: `1px solid ${T.panelHi}`, paddingBottom: 10, marginBottom: 22 }}>
        <span>대기실</span><span>생존 영웅 {alive.length} / {roster.length}</span>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 30 }}>
        <div style={{ flex: '1 1 300px', minWidth: 280 }}>
          <SectionLabel>탑</SectionLabel>
          <div style={{ border: `1px solid ${T.panelHi}`, background: '#08070C', padding: '16px 14px' }}>
            <TowerMap current={floorIdx} />
          </div>
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 260 }}>
          <SectionLabel>다음 층</SectionLabel>
          <div style={{ position: 'relative', height: 128, border: `1px solid ${T.panelHi}`, overflow: 'hidden', marginBottom: 14 }}>
            <Scene kind={floor.scene} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textShadow: '0 2px 8px #000' }}>
              <div style={{ fontSize: 18 }}>{floor.id}층 · {floor.name}</div>
              <div style={{ fontSize: 12, color: T.gold, letterSpacing: '.16em', marginTop: 6 }}>임무 [{MISSION_LABEL[floor.mission.kind]}]</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.9 }}>
            적 {floor.enemies.length}기
            {floor.guards?.length ? ` · 보호 대상 ${floor.guards[0].name}` : ''}
            {floor.boss ? ' · 보스' : ''}
          </div>
        </div>
      </div>

      <SectionLabel>파티 편성 ({party.length}/3)</SectionLabel>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 10 }}>
        {roster.map((h) => (
          <div key={h.id} style={{ textAlign: 'center' }}>
            <HeroCard hero={h} dead={h.dead} selected={party.includes(h.id)} onClick={() => !h.dead && toggle(h.id)} />
            <button onClick={() => setDetail(h)} disabled={h.dead} style={{ marginTop: 5, background: 'transparent', border: 'none', color: T.dim, fontSize: 11, fontFamily: 'inherit', cursor: h.dead ? 'default' : 'pointer', textDecoration: 'underline' }}>
              {h.dead ? '사망' : '상세'}
            </button>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', color: T.dim, fontSize: 11, marginBottom: 28 }}>카드를 눌러 편성 · 사망한 영웅은 되살릴 수 없습니다</div>
      <div style={{ textAlign: 'center' }}>
        <Btn tone="rare" onClick={() => setScreen('brief')} disabled={!party.length}>탑 입장</Btn>
      </div>
    </div>
  );
}

// ─── 브리핑 ───────────────────────────────────────────────
function BriefScreen({ floor, party, setScreen, start }) {
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '40px 16px' }}>
      <div style={{ position: 'relative', height: 160, border: `1px solid ${T.panelHi}`, overflow: 'hidden', marginBottom: 28 }}>
        <Scene kind={floor.scene} />
        {floor.guards?.map((g) => (
          <div key={g.id} style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)' }}>
            <GuardArt art={g.art} ratio={1} size={78} />
          </div>
        ))}
        {floor.boss && (
          <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)' }}>
            <EnemyArt srcId={floor.enemies[0]} size={92} />
          </div>
        )}
      </div>
      <SystemPanel tone="warning">
        <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.3em', marginBottom: 12 }}>{floor.id}층 · {floor.name}</div>
        <div style={{ fontSize: 21, letterSpacing: '.1em', marginBottom: 14 }}>임무 유형 [{MISSION_LABEL[floor.mission.kind]}]</div>
        <div style={{ fontSize: 15, lineHeight: 2 }}>{floor.mission.briefing}</div>
        {floor.guards?.map((g) => (
          <div key={g.id} style={{ fontSize: 13, color: T.amber, marginTop: 12 }}>보호 대상 : {g.name} — 잃으면 즉시 실패</div>
        ))}
        <div style={{ fontSize: 12, color: T.dim, marginTop: 16, lineHeight: 1.9 }}>
          출전 {party.length}명 · 적 {floor.enemies.length}기<br />전투 중 사망한 영웅은 되살릴 수 없습니다.
        </div>
      </SystemPanel>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28 }}>
        <Btn onClick={() => setScreen('base')}>돌아가기</Btn>
        <Btn tone="warning" onClick={start}>진입</Btn>
      </div>
    </div>
  );
}

// ─── 전투 ─────────────────────────────────────────────────
function BattleScreen({ result, floor, floorIdx, onEnd }) {
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [beatIdx, setBeatIdx] = useState(0);
  const [floaters, setFloaters] = useState([]);
  const [hitUid, setHitUid] = useState(null);
  const timer = useRef(null), fid = useRef(0);

  const beats = useMemo(() => deriveBeats(result, floor), [result, floor]);
  const pending = beats[beatIdx] && beats[beatIdx].at <= step ? beats[beatIdx] : null;

  const hp = useMemo(() => {
    const m = {};
    result.roster.forEach((u) => { m[u.uid] = u.maxHp; });
    result.events.slice(0, step).forEach((e) => {
      if (e.type === 'damage') m[e.target] = Math.max(0, m[e.target] - e.amount);
      if (e.type === 'heal') m[e.target] = Math.min(result.roster.find((r) => r.uid === e.target).maxHp, m[e.target] + e.amount);
    });
    return m;
  }, [step, result]);

  useEffect(() => {
    if (pending || step >= result.events.length) return;
    timer.current = setTimeout(() => {
      const e = result.events[step];
      if (e && (e.type === 'damage' || e.type === 'heal')) {
        const id = ++fid.current;
        setFloaters((f) => [...f, { id, uid: e.target, amount: e.amount, heal: e.type === 'heal' }]);
        setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 720);
        if (e.type === 'damage') { setHitUid(e.target); setTimeout(() => setHitUid(null), 180); }
      }
      setStep((s) => s + 1);
    }, 400 / speed);
    return () => clearTimeout(timer.current);
  }, [step, speed, pending, result]);

  const done = step >= result.events.length && !pending;
  const curTurn = result.events[Math.min(step, result.events.length - 1)]?.turn ?? 1;
  const log = result.events.slice(Math.max(0, step - 5), step).filter((e) => e.type !== 'turn');

  const Unit = ({ u }) => {
    const dead = hp[u.uid] <= 0;
    const ratio = hp[u.uid] / u.maxHp;
    const mine = floaters.filter((f) => f.uid === u.uid);
    return (
      <div style={{ textAlign: 'center', position: 'relative', animation: hitUid === u.uid ? 'shake 180ms' : 'none' }}>
        {mine.map((f) => (
          <div key={f.id} style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', animation: 'float 720ms ease-out forwards', color: f.heal ? '#6FBF8F' : '#FF6B6B', fontSize: 17, fontWeight: 700, textShadow: '0 2px 6px #000', pointerEvents: 'none', zIndex: 5 }}>
            {f.heal ? '+' : '-'}{f.amount}
          </div>
        ))}
        {u.kind === 'enemy' && <EnemyArt srcId={u.srcId} faded={dead} />}
        {u.kind === 'hero' && <HeroArt defId={u.defId} faded={dead} />}
        {u.kind === 'guard' && <GuardArt art={u.art} ratio={ratio} size={82} />}
        <div style={{ fontSize: 11, marginTop: 2, color: u.kind === 'guard' ? T.amber : dead ? T.dim : T.text }}>
          {u.kind === 'guard' ? `◆ ${u.name}` : u.name}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <HpBar cur={hp[u.uid]} max={u.maxHp} w={u.kind === 'guard' ? 96 : 78} color={u.kind === 'enemy' ? '#8B2E2E' : u.kind === 'guard' ? T.amber : '#3E7FBF'} />
        </div>
        <div style={{ fontSize: 9, color: T.dim, marginTop: 2 }}>{Math.max(0, hp[u.uid])}</div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '14px 12px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.dim, letterSpacing: '.12em', marginBottom: 10 }}>
        <span>{floor.id}층 {floor.name} · {MISSION_LABEL[floor.mission.kind]}</span>
        <span>TURN {curTurn}{floor.mission.turns ? ` / ${floor.mission.turns}` : ''}</span>
      </div>

      {/* 스테이지 */}
      <div style={{ position: 'relative', border: `1px solid ${T.panelHi}`, overflow: 'hidden', padding: '18px 12px 14px', marginBottom: 14 }}>
        <Scene kind={floor.scene} />
        <div style={{ position: 'relative', display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          {result.roster.filter((u) => u.kind === 'enemy').map((u) => <Unit key={u.uid} u={u} />)}
        </div>
        {result.roster.some((u) => u.kind === 'guard') && (
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            {result.roster.filter((u) => u.kind === 'guard').map((u) => <Unit key={u.uid} u={u} />)}
          </div>
        )}
        <div style={{ position: 'relative', display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
          {result.roster.filter((u) => u.kind === 'hero').map((u) => <Unit key={u.uid} u={u} />)}
        </div>
      </div>

      {/* 로그 + 미니맵 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, alignItems: 'stretch' }}>
        <div style={{ flex: 1, minHeight: 108, border: `1px solid ${T.panelHi}`, background: '#08070C', padding: '10px 14px', fontSize: 12, lineHeight: 1.95 }}>
          {log.map((e, i) => (
            <div key={i} style={{ color: e.type === 'death' ? T.blood : e.type === 'heal' ? '#6FBF8F' : T.text, opacity: .35 + (i / Math.max(1, log.length)) * .65 }}>
              {e.type === 'skill' && `${e.actorName} — ${e.skill}`}
              {e.type === 'damage' && `　└ ${e.amount} 피해`}
              {e.type === 'heal' && `　└ ${e.amount} 회복`}
              {e.type === 'death' && `✖ ${e.name} 쓰러짐`}
            </div>
          ))}
        </div>
        <FieldMap roster={result.roster} hp={hp} />
        <div style={{ border: `1px solid ${T.panelHi}`, background: '#08070C', padding: '10px 8px' }}>
          <div style={{ fontSize: 9, color: T.dim, letterSpacing: '.2em', marginBottom: 8, textAlign: 'center' }}>탑</div>
          <TowerMap current={floorIdx} compact />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {!done && <Btn small onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}>배속 ×{speed}</Btn>}
        {!done && <Btn small onClick={() => { setStep(result.events.length); setBeatIdx(beats.length); }}>건너뛰기</Btn>}
        {done && <Btn tone="rare" onClick={onEnd}>결과 확인</Btn>}
      </div>

      {/* 이벤트 확인 창 */}
      {pending && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}>
          <div style={{ maxWidth: 420, width: '100%' }}>
            <SystemPanel tone={pending.tone}>
              <div style={{ fontSize: 12, letterSpacing: '.4em', color: T.dim, marginBottom: 14 }}>{pending.title}</div>
              {pending.lines.map((l, i) => (
                <div key={i} style={{ fontSize: 15, lineHeight: 2.1 }}>{l}</div>
              ))}
            </SystemPanel>
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <Btn tone={pending.tone} onClick={() => setBeatIdx((b) => b + 1)}>확 인</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 결과 ─────────────────────────────────────────────────
function ResultScreen({ result, roster, floor, finish }) {
  const win = result.outcome === 'victory';
  const mvp = result.mvp ? roster.find((h) => h.id === result.mvp) : null;
  const dead = result.casualties.map((id) => roster.find((h) => h.id === id)).filter(Boolean);
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '44px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div style={{ fontSize: 12, color: T.dim, letterSpacing: '.4em', marginBottom: 10 }}>{floor.id}층 · {MISSION_LABEL[floor.mission.kind]}</div>
        <div style={{ fontSize: 30, letterSpacing: '.3em', color: win ? T.gold : T.blood }}>{win ? '임무 완수' : '임무 실패'}</div>
      </div>
      {win && mvp && (
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 15, letterSpacing: '.2em', marginBottom: 12 }}>MVP — {HERO_DEFS[mvp.defId].name}({'★'.repeat(mvp.star)})</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}><HeroCard hero={mvp} width={162} /></div>
        </div>
      )}
      <SystemPanel tone={dead.length ? 'death' : 'normal'} compact>
        <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em', marginBottom: 10 }}>획득</div>
        <div style={{ fontSize: 14, lineHeight: 1.9 }}>
          {win ? `Exp +${result.turns * 20} · 골드 +${180 + result.turns * 12} · 승급석 +${floor.boss ? 3 : 1}` : '없음'}
        </div>
        {dead.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: T.dim, letterSpacing: '.2em', margin: '20px 0 10px' }}>손실</div>
            {dead.map((h) => (
              <div key={h.id} style={{ fontSize: 14, color: T.blood, lineHeight: 2 }}>
                ✖ {HERO_DEFS[h.defId].name}({'★'.repeat(h.star)}) — 되살릴 수 없습니다
              </div>
            ))}
          </>
        )}
      </SystemPanel>
      <div style={{ textAlign: 'center', marginTop: 30 }}>
        <Btn tone={win ? 'rare' : 'normal'} onClick={finish}>대기실로</Btn>
      </div>
    </div>
  );
}

// ─── 상세 ─────────────────────────────────────────────────
function DetailModal({ hero, onClose }) {
  const def = HERO_DEFS[hero.defId];
  const a = attrsOf(def, hero.star, hero.level), s = statsOf(def, hero.star, hero.level);
  const row = (label, at) => (
    <span style={{ display: 'inline-block', minWidth: 98, margin: '0 4px' }}>
      <span style={{ color: T.dim }}>{label} : </span>
      <span style={{ color: at.current >= at.max ? T.gold : T.text }}>{at.current}/{at.max}</span>
    </span>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '100%' }}>
        <SystemPanel>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><HeroArt defId={hero.defId} size={92} /></div>
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>
            {def.name}({'★'.repeat(hero.star)}) <span style={{ fontSize: 15 }}>Lv.{hero.level}</span>
          </div>
          <div style={{ fontSize: 12, color: T.dim, marginBottom: 14 }}>{def.title} · 클래스 : {KLASS[hero.star]} · 속성 : {EL_KR[def.element]}</div>
          <div style={{ fontSize: 14, lineHeight: 2.1 }}>
            {row('힘', a.str)}{row('지능', a.int)}<br />{row('체력', a.vit)}{row('민첩', a.agi)}
          </div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 14, lineHeight: 1.9 }}>
            HP {s.hp} · 공격 {s.atk} · 방어 {s.def} · 속도 {s.spd}<br />
            보유스킬 : {def.skills.map((k) => SKILLS[k].name).join(', ')}
          </div>
          {atCap(a) && <div style={{ fontSize: 12, color: T.gold, marginTop: 16 }}>모든 능력치가 상한에 도달했습니다. 승급이 필요합니다.</div>}
        </SystemPanel>
        <div style={{ textAlign: 'center', marginTop: 18 }}><Btn onClick={onClose}>닫기</Btn></div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, color: T.dim, fontSize: 11, letterSpacing: '.3em' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${T.panelHi},transparent)` }} />
    </div>
  );
}
