// EVOLUTION-LAYER SAFETY REGRESSION (Phase 3, 2026-07-21)
// PHENIX runs TWO evolution systems: legacy WeaponCatalog (Game.js _autoFireWeapon/_evolvedWeapons)
// and the P2 BuildEngine (be_-prefixed). Audit (traced in Game.js:14151) confirmed BuildEngine is the
// SOLE live evolution layer — the legacy evolution CARD is gated to `buildEngine === null` (emergency
// fallback only), so legacy evolutions are never CREATED at runtime and cannot double-fire with a BE
// evolution. This regression LOCKS that invariant and TRACKS the one real coexistence conflict.
//
// Non-vacuous: every assertion drives the real BuildEngine + Game runtime, not registry inspection.
// Deterministic (seeded PRNG + virtual clock + cleared store, single process is fine here — no natural runs).
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(20260721);
let vclock = 0; globalThis.performance = { now: () => vclock };
const _D = globalThis.Date; globalThis.Date = class extends _D { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
let _un = muteConsole();
const { Game } = await import(pathToFileURL(path.resolve(HERE, '../../js/game/Game.js')).href);
_un();
const IN = (k) => ({ keys: k || new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });

function newRun(ch) {
  try { globalThis.localStorage.clear(); } catch (_) {}
  vclock = 0;
  const g = new Game(); g.audio = null;
  const u = muteConsole(); g.selectedCharacter = ch; g.gameState = 'playing'; g.reset(); g._enterEndless(); u();
  return g;
}
function drive(g, frames) { for (let f = 0; f < frames; f++) { vclock += 1000 / 60; if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } } if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } } if (g.player) g.player.hp = g.player.maxHp; try { g.update(1 / 60, IN(new Set(['d']))); } catch (_) {} } }

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

console.log('═══ EVOLUTION-LAYER SAFETY REGRESSION ═══');

// 1) BuildEngine is the live evolution layer (default-active).
const g0 = newRun('skeleton_warrior');
T('BuildEngine runtime is active by default (game.buildEngine present)', () => !!g0.buildEngine || 'no buildEngine instance');

// 2) Forcing a BUILDENGINE evolution never creates a LEGACY evolution (no dual-layer creation).
const g1 = newRun('skeleton_warrior');
let beEvolved = false, legacyAfter = -1;
{
  const u = muteConsole();
  const be = g1.buildEngine;
  be.addWeapon('marrow_spitter'); const w = be.weapons.get('marrow_spitter'); if (w) w.level = 5;
  be.addPassive('ossified_dynamo'); be.addPassive('ossified_dynamo'); be.addPassive('ossified_dynamo'); // -> L3
  const ready = be._evolutionReady();
  be._evolve('marrow_spitter');
  beEvolved = !!be.weapons.get('marrow_spitter')?.evolved;
  drive(g1, 120);
  legacyAfter = g1._evolvedWeapons.size;
  u();
}
T('BuildEngine _evolve marks the BE weapon evolved', () => beEvolved || 'marrow_spitter not evolved');
T('legacy _evolvedWeapons stays EMPTY when a BE evolution fires (no dual-layer)', () => legacyAfter === 0 || `legacy evolvedWeapons=${legacyAfter}`);

// 3) Legacy evolution creation is gated OFF while BuildEngine is active — no legacy evolution is ever
//    created across a driven run (the card path is `buildEngine ? null : _buildEvolutionCard()`).
const g2 = newRun('skeleton_warrior');
drive(g2, 60 * 60);   // 1 min driven
T('no legacy evolution created during a driven run with BE active', () => g2._evolvedWeapons.size === 0 || `legacy evolvedWeapons=${g2._evolvedWeapons.size}`);

// 4) Eddie's solo_red_thunder is a base weapon in BOTH catalogs. BuildEngine._evolve must consume
//    the legacy base when the BE evolution takes ownership, or both layers fire simultaneously.
const g3 = newRun('eddie');
let soloConsumed = null;
{
  const u = muteConsole();
  const be = g3.buildEngine;
  be.addWeapon('solo_red_thunder'); const w = be.weapons.get('solo_red_thunder'); if (w) w.level = 5;
  be.addPassive('forbidden_amplifier'); be.addPassive('forbidden_amplifier'); be.addPassive('forbidden_amplifier');
  be._evolve('solo_red_thunder');
  soloConsumed = g3._consumedWeapons.has('solo_red_thunder');
  u();
}
T('solo_red_thunder is consumed by BE evolve (legacy base cannot stack with evolved weapon)',
  () => soloConsumed === true || `solo consumed=${soloConsumed}`);

// 5) The internal activation path rejects calls that do not have a complete recipe.
const g4 = newRun('skeleton_warrior');
let unearnedResult = null, unearnedEvents = -1, unearnedEvolved = null;
{
  const u = muteConsole();
  unearnedResult = g4.buildEngine._evolve('marrow_spitter');
  unearnedEvents = g4.buildEngine.evolutionEvents.length;
  unearnedEvolved = !!g4.buildEngine.weapons.get('marrow_spitter')?.evolved;
  u();
}
T('_evolve rejects an incomplete recipe without changing weapon state or emitting an event',
  () => (unearnedResult === false && unearnedEvents === 0 && !unearnedEvolved)
    || `result=${unearnedResult}, events=${unearnedEvents}, evolved=${unearnedEvolved}`);

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
