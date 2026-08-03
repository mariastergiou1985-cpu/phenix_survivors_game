/**
 * ROSTER RUNTIME QA — all 10 characters, short and deterministic (Maria 2026-08-02).
 *
 * A time-boxed gate, not a full playthrough sweep. For every character it drives the REAL
 * BuildEngineRuntime and a REAL Game instance and answers six questions:
 *
 *   A  base weapon damage   — each native weapon at L1 actually deals damage to a live enemy
 *   B  level 5              — the L5 tables are reachable and strictly stronger than L1
 *   C  catalyst / passive   — the evolution passive reaches L3 and its bonuses reach the runtime
 *   D  evolution            — the recipe reports ready and _evolve() really transforms the weapon
 *   E  fusion / synergy     — the character owns fusions, and any SYNERGY_FX layer it declares is
 *                             backed by a card that exists and is gated on its mastery
 *   F  reset to a new run   — Game.reset() replaces the runtime and leaves no stale weapon state
 *
 * Deterministic: seeded PRNG, virtual clock, no wall-clock, no sampling. Console errors and the
 * black-screen check are covered separately in real Chromium.
 *
 * Run: node tools/qa/roster_runtime_qa.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(20260802);
let vclock = 0;
globalThis.performance = { now: () => vclock };
const _D = globalThis.Date;
globalThis.Date = class extends _D { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
try { globalThis.localStorage.clear(); } catch (_) {}

const un = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const BE_STAMP = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngineChars1.js'), 'utf8')
  .match(/BuildEngine\.js\?v=(\d+)/)[1];
const BE = await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngine.js')).href + '?v=' + BE_STAMP);
const FC = await import(pathToFileURL(path.join(ROOT, 'js/game/FusionCatalog.js')).href);
const UP = await import(pathToFileURL(path.join(ROOT, 'js/game/Upgrades.js')).href);
const WCAT = await import(pathToFileURL(path.join(ROOT, 'js/game/WeaponCatalog.js')).href);
un();

const CHARS = ['skeleton_warrior', 'taekwondo_girl', 'cyber_arm_hero', 'brawler_warrior',
               'assassin_clone', 'eddie', 'dimis_kickboxer', 'japan_phasewalker',
               'euclid_vector', 'oni_cataclysm_protocol'];
const CHECKS = ['base dmg', 'level 5', 'catalyst', 'evolution', 'fusion/syn', 'reset'];

// MODULE IDENTITY: a wrong ?v= silently yields a 2-weapon BuildEngine and every result below
// would be a lie. Refuse to run rather than report on an empty registry.
if (Object.keys(BE.WEAPON_DEFS).length !== 25) {
  console.error(`FATAL: BuildEngine has ${Object.keys(BE.WEAPON_DEFS).length} weapons, expected 25 — wrong ?v= specifier.`);
  process.exit(2);
}

const mkEnemy = (x, y, hp = 1e9) => {
  const e = {
    id: 'e' + x + '_' + y, pos: { x, y }, hp, maxHp: hp, radius: 14, taken: 0,
    isBoss: () => false, isElite: false, rank: 'normal',
    takeHit(d) { this.taken += d; this.hp -= d; return d; },
    takeDamage(d) { return this.takeHit(d); },
  };
  return e;
};

const mkGame = (ch) => {
  const enemies = [];
  for (let i = 0; i < 14; i++) {
    const a = i * Math.PI * 2 / 14;
    enemies.push(mkEnemy(Math.cos(a) * 70, Math.sin(a) * 70));
  }
  const g = {
    selectedCharacter: ch, gameState: 'playing', endless: true, _bossRush: false, _chaosMode: false,
    gameOver: false, victory: false, timeAlive: 60,
    _weaponLevels: new Map(), _consumedWeapons: new Set(), _evolvedWeapons: new Set(),
    triggerAnnouncement() {}, audio: null,
    player: { pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, vel: { x: 0, y: 0 }, level: 1,
              upgrades: {}, selectedCharacter: ch, _facing: 1 },
    enemies, meta: { getFusionTier: () => 0 },
  };
  return g;
};

// Drive one weapon for `secs` of virtual time and return the damage it dealt.
const damageOf = (ch, wid, level, { passive = null, passiveLvl = 0, evolve = false } = {}) => {
  const g = mkGame(ch);
  const rt = new BE.BuildEngineRuntime(g); g.buildEngine = rt;
  const d = BE.WEAPON_DEFS[wid];
  if (d?.external) g._weaponLevels.set(wid, level);
  rt.addWeapon(wid);
  const w = rt.weapons.get(wid);
  if (w) w.level = level;
  if (passive) for (let i = 0; i < passiveLvl; i++) rt.addPassive(passive);
  if (evolve) rt._evolve(wid);
  let dealt = 0;
  const orig = rt._dealDamage.bind(rt);
  rt._dealDamage = (id, e, dmg, bm, crit) => { if (Number.isFinite(dmg)) dealt += dmg; return orig(id, e, dmg, bm, crit); };
  for (let f = 0; f < 60 * 8; f++) {            // 8 virtual seconds at 60 fps
    vclock += 1000 / 60;
    for (const e of g.enemies) { e.hp = e.maxHp; }   // keep targets alive so damage is comparable
    try { rt.update(1 / 60); } catch (_) { return { dealt: NaN, err: true }; }
  }
  return { dealt, weapons: rt.weapons.size, evolved: !!rt.weapons.get(wid)?.evolved };
};

const results = {};
const notes = [];
const t0 = Date.now();

for (const ch of CHARS) {
  const r = {}; results[ch] = r;
  const natives = Object.entries(BE.WEAPON_DEFS)
    .filter(([, d]) => d.owner === ch).map(([k]) => k);

  // ── A. base weapon damage at L1 ──────────────────────────────────────────
  {
    // An `external` weapon (Eddie's Solo Red Thunder) is a DATA WRAP: BuildEngine holds its stats
    // and evolution, but the base pattern lives in the legacy layer, so its BE executor is
    // evolved-only by design. Asserting BE damage at L1 for it would test a contract the game
    // never made. Instead assert exactly that: the executor is evolved-gated, and the legacy
    // catalog really owns the weapon that carries it.
    const beOwned = natives.filter(w => !BE.WEAPON_DEFS[w].external);
    const external = natives.filter(w => BE.WEAPON_DEFS[w].external);
    const per = beOwned.map(wid => ({ wid, ...damageOf(ch, wid, 1) }));
    const dead = per.filter(p => !(p.dealt > 0));
    const extBad = [];
    for (const wid of external) {
      const src = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngineChars3.js'), 'utf8');
      const blk = src.split('WEAPON_EXECUTORS.' + wid)[1] || '';
      if (!/^\s*=\s*\{\s*\n\s*update\(rt, w, dt\) \{\s*\n\s*if \(!w\.evolved\) return;/.test(blk))
        extBad.push(`${wid} is external but its executor is not evolved-gated`);
      if (!WCAT.WEAPON_DEFS[wid]) extBad.push(`${wid} is external but the legacy catalog does not own it`);
    }
    r['base dmg'] = dead.length === 0 && extBad.length === 0 && natives.length > 0;
    if (!r['base dmg']) notes.push(`${ch} base dmg: ${[...dead.map(p => p.wid + '=' + p.dealt), ...extBad].join(', ') || 'NO NATIVE WEAPONS'}`);
    r._natives = natives;
    r._ext = external;
    r._l1 = Object.fromEntries(per.map(p => [p.wid, +(p.dealt || 0).toFixed(1)]));
  }

  // ── B. level 5 is reachable and stronger ─────────────────────────────────
  {
    const bad = [];
    for (const wid of natives) {
      const d0 = BE.WEAPON_DEFS[wid];
      if (d0.external) {                       // evolved-only: its L5 gate is proven in D
        if (!Array.isArray(d0.damage) || d0.damage.length !== 5) bad.push(`${wid} damage table has ${d0.damage?.length} entries, not 5`);
        if (BE.EVOLUTION_RECIPES[d0.evolution]?.weaponLevel !== 5) bad.push(`${wid} evolution does not require L5`);
        continue;
      }
      const l5 = damageOf(ch, wid, 5);
      const l1 = r._l1[wid] ?? 0;
      if (!(l5.dealt > 0)) { bad.push(`${wid} L5 dealt ${l5.dealt}`); continue; }
      if (!(l5.dealt >= l1)) bad.push(`${wid} L5 ${l5.dealt.toFixed(1)} < L1 ${l1}`);
      const d = BE.WEAPON_DEFS[wid];
      if (Array.isArray(d.damage) && d.damage.length !== 5) bad.push(`${wid} damage table has ${d.damage.length} entries, not 5`);
      if (Array.isArray(d.cooldown) && d.cooldown.length !== 5) bad.push(`${wid} cooldown table has ${d.cooldown.length} entries, not 5`);
    }
    r['level 5'] = bad.length === 0;
    if (!r['level 5']) notes.push(`${ch} level 5: ${bad.join(' | ')}`);
  }

  // ── C. catalyst / passive reaches L3 and reaches the runtime ─────────────
  {
    const bad = [];
    for (const wid of natives) {
      const pid = BE.WEAPON_DEFS[wid].evolutionPassive;
      if (!pid) { bad.push(`${wid} declares no evolutionPassive`); continue; }
      const p = BE.PASSIVE_DEFS[pid];
      if (!p) { bad.push(`${wid} -> missing passive ${pid}`); continue; }
      if (p.maxLevel !== 3) bad.push(`${pid} maxLevel ${p.maxLevel}`);
      const g = mkGame(ch);
      const rt = new BE.BuildEngineRuntime(g);
      for (let i = 0; i < 3; i++) rt.addPassive(pid);
      if ((rt.passives.get(pid) || 0) !== 3) { bad.push(`${pid} stuck at ${rt.passives.get(pid) || 0}/3`); continue; }
      const keys = new Set(p.bonuses.flatMap(b => Object.keys(b)));
      for (const k of keys) if (!(rt._catalystSum(k) > 0)) bad.push(`${pid}.${k} sums to ${rt._catalystSum(k)}`);
    }
    r.catalyst = bad.length === 0;
    if (!r.catalyst) notes.push(`${ch} catalyst: ${bad.join(' | ')}`);
  }

  // ── D. evolution really fires ────────────────────────────────────────────
  {
    const bad = [];
    for (const wid of natives) {
      const eid = BE.WEAPON_DEFS[wid].evolution;
      const pid = BE.WEAPON_DEFS[wid].evolutionPassive;
      if (!eid || !BE.EVOLUTION_RECIPES[eid]) { bad.push(`${wid} -> missing recipe ${eid}`); continue; }
      const g = mkGame(ch);
      const rt = new BE.BuildEngineRuntime(g); g.buildEngine = rt;
      if (BE.WEAPON_DEFS[wid].external) g._weaponLevels.set(wid, 5);
      else { rt.addWeapon(wid); const w = rt.weapons.get(wid); if (w) w.level = 5; }
      for (let i = 0; i < 3; i++) rt.addPassive(pid);
      const ready = rt._readyEvolutions().map(e => e.eid);
      if (!ready.includes(eid)) { bad.push(`${eid} never reported ready`); continue; }
      if (rt._evolve(wid) !== true) { bad.push(`${eid} _evolve() returned false`); continue; }
      const w = rt.weapons.get(wid);
      if (!w?.evolved || w.level !== 5) { bad.push(`${eid} left weapon ${JSON.stringify(w && { e: w.evolved, l: w.level })}`); continue; }
      if (rt._readyEvolutions().map(e => e.eid).includes(eid)) bad.push(`${eid} still offered after evolving`);
      // and the evolved form must actually deal damage
      const dmg = damageOf(ch, wid, 5, { passive: pid, passiveLvl: 3, evolve: true });
      if (!(dmg.dealt > 0)) bad.push(`${eid} evolved form dealt ${dmg.dealt}`);
    }
    r.evolution = bad.length === 0;
    if (!r.evolution) notes.push(`${ch} evolution: ${bad.join(' | ')}`);
  }

  // ── E. fusion + synergy ──────────────────────────────────────────────────
  {
    const bad = [];
    const mine = Object.entries(FC.FUSION_DEFS).filter(([, d]) => d.char === ch).map(([k]) => k);
    if (mine.length < 2) bad.push(`only ${mine.length} fusions`);
    for (const fid of mine) {
      const d = FC.FUSION_DEFS[fid];
      for (const c of d.components) if (!BE.WEAPON_DEFS[c]) bad.push(`${fid} -> unknown component ${c}`);
      if (BE.WEAPON_DEFS[d.components[0]]?.owner !== ch) bad.push(`${fid} signature component not native`);
      // the recipe must be satisfiable at the declared levels
      const rt = new BE.BuildEngineRuntime(mkGame(ch));
      const g2 = rt.game;
      d.components.forEach((c, i) => {
        if (BE.WEAPON_DEFS[c].external) g2._weaponLevels.set(c, FC.FUSION_REQ_LEVELS[i]);
        else { rt.addWeapon(c); const w = rt.weapons.get(c); if (w) w.level = FC.FUSION_REQ_LEVELS[i]; }
      });
      if (!FC.fusionRecipeReady(d, rt, BE.WEAPON_DEFS)) bad.push(`${fid} not ready at ${FC.FUSION_REQ_LEVELS}`);
    }
    // synergy: every SYNERGY_FX layer this character declares must have a real, gated card
    const GS = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
    const fxBlock = GS.slice(GS.indexOf('const SYNERGY_FX = {'));
    const fx = [...fxBlock.slice(0, fxBlock.indexOf('\n};')).matchAll(/^\s*([a-z_]+):\s*\{\s*card:\s*'(synergy_[a-z_]+)'/gm)]
      .filter(m => m[1] === ch);
    if (fx.length === 0 && !['eddie', 'oni_cataclysm_protocol'].includes(ch))
      bad.push('no SYNERGY_FX layer declared (expected one)');
    for (const [, , key] of fx) {
      const card = UP.ALL_UPGRADES.find(c => c.key === key);
      if (!card) { bad.push(`SYNERGY_FX points at missing card ${key}`); continue; }
      if (card.char !== ch) bad.push(`${key} bound to ${card.char}, not ${ch}`);
      if (typeof card.prereq !== 'function') bad.push(`${key} has no prereq gate`);
      else if (card.prereq({ upgrades: {} }) !== false) bad.push(`${key} is offered with no mastery`);
    }
    r['fusion/syn'] = bad.length === 0;
    if (!r['fusion/syn']) notes.push(`${ch} fusion/syn: ${bad.join(' | ')}`);
    r._fusions = mine.length;
    r._synergy = fx.length;
  }

  // ── F. reset into a new run ──────────────────────────────────────────────
  {
    const bad = [];
    const un2 = muteConsole();
    let g = null;
    try {
      g = new Game(); g.audio = null; g.selectedCharacter = ch; g.gameState = 'playing'; g.reset();
      const rt1 = g.buildEngine;
      // build some state, then reset again
      const wid = natives[0];
      if (wid && !BE.WEAPON_DEFS[wid].external) { rt1.addWeapon(wid); const w = rt1.weapons.get(wid); if (w) w.level = 5; }
      const pid = wid ? BE.WEAPON_DEFS[wid].evolutionPassive : null;
      if (pid) for (let i = 0; i < 3; i++) rt1.addPassive(pid);
      const beforeLv = Math.max(0, ...[...rt1.weapons.values()].map(w => w.level || 0));
      const beforeP = Math.max(0, ...[...rt1.passives.values()].map(v => v || 0));
      g.reset();
      const rt2 = g.buildEngine;
      // Some characters are SEEDED a starter weapon on reset (dimis_kickboxer gets
      // cyber_gauntlets_injection), so a non-empty weapons map is correct and comparing raw
      // sizes is meaningless. What must not survive a reset is invested PROGRESS.
      if (rt2 === rt1) bad.push('reset reused the same BuildEngine runtime');
      const afterLv = Math.max(0, ...[...rt2.weapons.values()].map(w => w.level || 0));
      const afterP = Math.max(0, ...[...rt2.passives.values()].map(v => v || 0));
      if (beforeLv >= 5 && afterLv > 1) bad.push(`weapon level carried over (${beforeLv} -> ${afterLv})`);
      if (beforeP >= 3 && afterP > 0) bad.push(`passive level carried over (${beforeP} -> ${afterP})`);
      if ([...rt2.weapons.values()].some(w => w.evolved)) bad.push('an evolved weapon survived the reset');
      if (g._consumedWeapons && g._consumedWeapons.size) bad.push(`_consumedWeapons not cleared (${g._consumedWeapons.size})`);
      if (g.gameOver) bad.push('reset left gameOver set');
      if (g.player?.level !== 1) bad.push(`player level ${g.player?.level} after reset`);
    } catch (e) {
      bad.push('THREW: ' + e.message);
    } finally { un2(); }
    r.reset = bad.length === 0;
    if (!r.reset) notes.push(`${ch} reset: ${bad.join(' | ')}`);
  }
}

// ── report ────────────────────────────────────────────────────────────────
const W = 24;
console.log('\n═══ ROSTER RUNTIME QA — 10 characters × 6 deterministic checks ═══\n');
console.log('  ' + 'character'.padEnd(W) + CHECKS.map(c => c.padEnd(11)).join('') + '  natives/fusions');
console.log('  ' + '─'.repeat(W + CHECKS.length * 11 + 18));
let allPass = true;
for (const ch of CHARS) {
  const r = results[ch];
  const row = CHECKS.map(c => (r[c] ? 'PASS' : 'FAIL').padEnd(11)).join('');
  if (CHECKS.some(c => !r[c])) allPass = false;
  console.log('  ' + ch.padEnd(W) + row + `  ${r._natives.length}w / ${r._fusions}f / ${r._synergy}s`);
}
if (notes.length) {
  console.log('\n── failures ──');
  for (const n of notes) console.log('  ' + n);
}
const fails = CHARS.reduce((n, ch) => n + CHECKS.filter(c => !results[ch][c]).length, 0);
console.log(`\n  ${CHARS.length * CHECKS.length - fails} passed, ${fails} failed  ·  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(allPass ? '\n═══ ROSTER QA: ALL PASS ═══\n' : '\n═══ ROSTER QA: FAILURES ABOVE ═══\n');
process.exit(fails ? 1 : 0);
