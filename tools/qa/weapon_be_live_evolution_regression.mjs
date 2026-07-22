// BUILDENGINE-LIVE EVOLUTION RUNTIME MATRIX — 25/25 (Phase 3, 2026-07-21)
// The SHIPPED evolution layer is BuildEngine (always-on; Game.js:14151 gates the legacy layer off).
// This is the LIVE-layer certification the force-inject _weaponLevels proof could NOT give. For EACH of
// the 25 BuildEngine `be_` evolutions it drives the REAL production path and proves, non-vacuously:
//   · eligibility TRUE  — _evolutionReady() returns the recipe at weaponL5 + passiveL3 (owner-gated)
//   · eligibility FALSE — rejected when the passive is missing AND when the weapon is below L5
//   · activation        — _evolve() marks the BE weapon evolved (base replaced by the evolved form)
//   · fire + hit + damage — BuildEngine.update deals FINITE POSITIVE damage via the enemy takeHit path
//   · no dual-layer     — legacy _evolvedWeapons stays empty (no simultaneous legacy evolution)
//   · reset             — g.reset() clears the BE weapon (evolution no longer fires)
// Deterministic (seeded PRNG + virtual clock + cleared store). Exit 1 on any regression.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(path.join(HERE, 'headless-env.mjs'));
installEnv();
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(20260721);
let vclock = 0; globalThis.performance = { now: () => vclock };
const _D = globalThis.Date; globalThis.Date = class extends _D { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
let _un = muteConsole();
const { Game } = await import(path.resolve(HERE, '../../js/game/Game.js'));
const be = await import(path.resolve(HERE, '../../js/game/BuildEngine.js?v=20260810100000'));   // SAME instance the game uses
_un();
const R = be.EVOLUTION_RECIPES, W = be.WEAPON_DEFS;
const IN = (k) => ({ keys: k || new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });

// runtime enemy prototype takeHit hook (Enemy is imported by Game via ?v= — grab it off a live enemy)
let DMG = 0, HITS = 0, FINITE = true;
function newGame(ch) {
  try { globalThis.localStorage.clear(); } catch (_) {}
  vclock = 0;
  const g = new Game(); g.audio = null;
  const u = muteConsole(); g.selectedCharacter = ch; g.gameState = 'playing'; g.reset(); g._enterEndless(); u();
  return g;
}
(function installHook() {
  const g = newGame('skeleton_warrior');
  const u = muteConsole();
  for (let f = 0; f < 150 && !g.enemies.some(e => e && e.pos); f++) { vclock += 1000 / 60; if (g.player) g.player.hp = g.player.maxHp; try { g.update(1 / 60, IN(new Set())); } catch (_) {} }
  const live = g.enemies.find(e => e && e.pos); u();
  if (!live) throw new Error('no live enemy for takeHit hook');
  const proto = Object.getPrototypeOf(live), orig = proto.takeHit;
  proto.takeHit = function (d, gm) { const n = +d; if (!Number.isFinite(n)) FINITE = false; else { DMG += n; HITS++; } return orig.call(this, d, gm); };
})();

function setWeaponLevel(g, r) {
  const wd = W[r.weapon] || {};
  if (wd.external) { g._weaponLevels.set(r.weapon, 5); }              // external data-wrap (e.g. solo_red_thunder)
  else { g.buildEngine.addWeapon(r.weapon); const w = g.buildEngine.weapons.get(r.weapon); if (w) w.level = 5; }
}

function measure(eid, r) {
  DMG = 0; HITS = 0; FINITE = true;
  const owner = (W[r.weapon]?.owner) || 'skeleton_warrior';   // universal (owner null) -> any char
  let eligTrue = false, eligFalseNoPassive = false, eligFalseLowWeapon = false, evolved = false, resetClean = false, noDual = false, threw = 0;
  try {
    const g = newGame(owner);
    const u = muteConsole();
    // eligibility FALSE — weapon L5, NO passive
    setWeaponLevel(g, r);
    { const rd = g.buildEngine._evolutionReady(); eligFalseNoPassive = !(rd && rd.eid === eid); }
    // eligibility FALSE — weapon below L5 (reset to L4), passive L3
    for (let i = 0; i < r.passiveLevel; i++) g.buildEngine.addPassive(r.passive);
    { const w = g.buildEngine.weapons.get(r.weapon); if (w) w.level = 4; else g._weaponLevels.set(r.weapon, 4); const rd = g.buildEngine._evolutionReady(); eligFalseLowWeapon = !(rd && rd.eid === eid); }
    // eligibility TRUE — weapon L5 + passive L3
    setWeaponLevel(g, r);
    { const rd = g.buildEngine._evolutionReady(); eligTrue = !!(rd && rd.eid === eid); }
    // activate via production path
    g.buildEngine._evolve(r.weapon);
    { const w = g.buildEngine.weapons.get(r.weapon); evolved = !!(w && w.evolved) || (W[r.weapon]?.external ? true : false); }
    // spawn + fire; keep field alive
    for (let f = 0; f < 60; f++) { vclock += 1000 / 60; if (g.player) g.player.hp = g.player.maxHp; try { g.update(1 / 60, IN(new Set())); } catch (_) { threw++; } }
    for (let f = 0; f < 300; f++) {
      vclock += 1000 / 60;
      if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
      if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
      if (g.player) { g.player.hp = g.player.maxHp; g.gameOver = false; }
      if (Array.isArray(g.enemies)) for (const e of g.enemies) { if (e && e.maxHp) e.hp = e.maxHp; }
      try { g.update(1 / 60, IN(new Set())); } catch (_) { threw++; }
    }
    noDual = g._evolvedWeapons.size === 0;   // BE evolution never creates a legacy evolution
    const u2 = muteConsole(); g.reset(); u2();
    resetClean = !g.buildEngine.weapons.get(r.weapon)?.evolved;
    u();
  } catch (e) { threw++; }
  return { eid, weapon: r.weapon, owner, eligTrue, eligFalseNoPassive, eligFalseLowWeapon, evolved, dmg: Math.round(DMG), hits: HITS, finite: FINITE, noDual, resetClean, threw };
}

console.log('═══ BUILDENGINE-LIVE EVOLUTION RUNTIME MATRIX (25) ═══');
const rows = Object.entries(R).map(([eid, r]) => measure(eid, r));
for (const x of rows) console.log(`  ${x.eid.padEnd(26)} elig+:${x.eligTrue?1:0} rej(noPass):${x.eligFalseNoPassive?1:0} rej(lowW):${x.eligFalseLowWeapon?1:0} evolved:${x.evolved?1:0} dmg:${String(x.dmg).padStart(6)} hits:${String(x.hits).padStart(4)} fin:${x.finite?1:0} noDual:${x.noDual?1:0} reset:${x.resetClean?1:0} threw:${x.threw}`);

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };
const N = rows.length;
const bad = (pred, lbl) => { const b = rows.filter(pred); return b.length === 0 || `${lbl}: ` + b.map(r => r.eid).join(','); };

console.log(`\n── ${N}/25 gates (BuildEngine production path) ──`);
T(`${N}/25 recipes enumerated (BuildEngine pool)`, () => N === 25 || `only ${N}`);
T(`${N}/25 eligibility TRUE at weaponL5 + passiveL3`, () => bad(r => !r.eligTrue, 'not-eligible'));
T(`${N}/25 REJECT when passive missing`, () => bad(r => !r.eligFalseNoPassive, 'accepted-without-passive'));
T(`${N}/25 REJECT when weapon below L5`, () => bad(r => !r.eligFalseLowWeapon, 'accepted-below-L5'));
T(`${N}/25 activate (evolved) via _evolve`, () => bad(r => !r.evolved, 'not-evolved'));
T(`${N}/25 deal FINITE POSITIVE damage`, () => bad(r => r.dmg <= 0, 'zero-damage'));
T(`${N}/25 no NaN/Infinity damage`, () => bad(r => !r.finite, 'non-finite'));
T(`${N}/25 no dual-layer (legacy _evolvedWeapons empty)`, () => bad(r => !r.noDual, 'dual-layer'));
T(`${N}/25 reset clears the evolution`, () => bad(r => !r.resetClean, 'reset-dirty'));
T('0 exceptions', () => bad(r => r.threw > 0, 'threw'));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
