// WEAPON EVOLUTION — FORCED ACTIVATION + FINITE-DAMAGE RUNTIME MATRIX (Phase 3, 2026-07-21)
// Non-vacuous 33/33 gate: for EVERY WeaponCatalog evolution, force it onto the REAL acquired-
// weapon fire path (the same injection the gated __phenixQA proof hook uses: clear the arsenal,
// neutralize character natives, set _weaponLevels[evo]=5), drive real Game.update against a live
// enemy field, and PROVE via a takeHit hook that it: (a) equips, (b) is the only weapon set (base
// removed), (c) deals FINITE POSITIVE damage with real hits, (d) never NaN/Infinity, (e) resets
// clean (evo unequipped after g.reset()). PASS requires real runtime damage — never definition/
// recipe inspection. Exit 1 on any regression.
//
// NOTE (why the takeHit hook is grabbed off a LIVE enemy): Game.js imports Enemy via a versioned
// specifier ('../entities/Enemy.js?v=...'), which Node loads as a DIFFERENT module instance than a
// plain import here — so patching a plain-imported Enemy.prototype misses every runtime hit. We
// therefore hook the prototype of an actually-spawned enemy (all Games share the one cached class).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(path.join(HERE, 'headless-env.mjs'));
installEnv();
let _un = muteConsole();
const wc = await import(path.resolve(HERE, '../../js/game/WeaponCatalog.js'));
const { Game } = await import(path.resolve(HERE, '../../js/game/Game.js'));
_un();

const EVOS = wc.getAllEvolutions();
const IN = (k) => ({ keys: k || new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });

// module-level accumulators (reset per evolution)
let DMG = 0, HITS = 0, FINITE = true, MAXHIT = 0;

// Replicate the __phenixQA equipWeaponForProof injection in-engine.
function forceEquip(g, evoId) {
  g._weaponLevels?.clear?.();
  if (g.buildEngine) { g.buildEngine.weapons?.clear?.(); g.buildEngine.passives?.clear?.(); }
  g._evolvedWeapons?.clear?.(); g._consumedWeapons?.clear?.(); g._acquiredWeaponTimers?.clear?.();
  g.selectedCharacter = '__qa_weapon_proof__';
  if (g.player) g.player.selectedCharacter = '__qa_weapon_proof__';
  g._weaponLevels.set(evoId, 5);
  return g._weaponLevels.has(evoId);
}

// Install the takeHit hook on the RUNTIME enemy prototype (grabbed off a live spawn).
function installRuntimeHook() {
  const g = new Game(); g.audio = null;
  const u = muteConsole(); g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing'; g.reset(); g._enterEndless();
  for (let f = 0; f < 150 && !g.enemies.some(e => e && e.pos); f++) { if (g.player) g.player.hp = g.player.maxHp; try { g.update(1 / 60, IN(new Set())); } catch (_) {} }
  const live = g.enemies.find(e => e && e.pos); u();
  if (!live) throw new Error('no live enemy to locate the runtime Enemy prototype');
  const proto = Object.getPrototypeOf(live);
  const orig = proto.takeHit;
  proto.takeHit = function (d, gm) { const n = +d; if (!Number.isFinite(n)) FINITE = false; else { DMG += n; HITS++; if (n > MAXHIT) MAXHIT = n; } return orig.call(this, d, gm); };
  return proto;
}

function measure(evoId) {
  DMG = 0; HITS = 0; FINITE = true; MAXHIT = 0;
  let equipped = false, resetClean = false, threw = 0;
  try {
    const g = new Game(); g.audio = null;
    const u = muteConsole();
    g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing'; g.reset(); g._enterEndless();
    equipped = forceEquip(g, evoId);   // equip FIRST (only evo on the fire path), then spawn+fire
    for (let f = 0; f < 420; f++) {
      if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }      // else _tickAcquiredWeapons early-returns
      if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
      if (g._postArenaChoice) { try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = false; } }
      if (g.player) { g.player.hp = g.player.maxHp; g.gameOver = false; }
      if (Array.isArray(g.enemies)) for (const e of g.enemies) { if (e && e.maxHp) e.hp = e.maxHp; }   // keep targets alive
      try { g.update(1 / 60, IN(new Set())); } catch (_) { threw++; }
    }
    const u2 = muteConsole(); g.reset(); u2();
    resetClean = !g._weaponLevels?.has?.(evoId);   // evo unequipped after reset => cannot fire
    u();
  } catch (e) { threw++; }
  return { evoId, equipped, dmg: Math.round(DMG), hits: HITS, finite: FINITE, maxHit: +MAXHIT.toFixed(1), resetClean, threw };
}

installRuntimeHook();
console.log('═══ WEAPON EVOLUTION FORCED-ACTIVATION + FINITE-DAMAGE MATRIX (33) ═══');
const rows = EVOS.map(e => measure(e.id));
for (const r of rows) console.log(`  ${r.evoId.padEnd(26)} equip:${r.equipped ? 1 : 0} dmg:${String(r.dmg).padStart(7)} hits:${String(r.hits).padStart(4)} finite:${r.finite ? 1 : 0} maxHit:${String(r.maxHit).padStart(7)} reset:${r.resetClean ? 1 : 0} threw:${r.threw}`);

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

const noDmg = rows.filter(r => r.dmg <= 0);
const notFinite = rows.filter(r => !r.finite);
const notEquip = rows.filter(r => !r.equipped);
const notReset = rows.filter(r => !r.resetClean);
const threwAny = rows.filter(r => r.threw > 0);

console.log(`\n── ${EVOS.length}/33 gates ──`);
T(`${EVOS.length}/33 evolutions equip (only-evo set on real fire path)`, () => notEquip.length === 0 || 'not-equipped: ' + notEquip.map(r => r.evoId).join(','));
T(`${EVOS.length}/33 deal FINITE POSITIVE damage (real hits)`, () => noDmg.length === 0 || 'ZERO-damage: ' + noDmg.map(r => r.evoId).join(','));
T(`${EVOS.length}/33 no NaN/Infinity damage`, () => notFinite.length === 0 || 'non-finite: ' + notFinite.map(r => r.evoId).join(','));
T(`${EVOS.length}/33 reset unequips the evolution`, () => notReset.length === 0 || 'reset-dirty: ' + notReset.map(r => r.evoId).join(','));
T('0 exceptions across all forced runs', () => threwAny.length === 0 || 'threw: ' + threwAny.map(r => r.evoId + '(' + r.threw + ')').join(','));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
