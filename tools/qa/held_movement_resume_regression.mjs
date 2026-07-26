// HELD-MOVEMENT RESUME REGRESSION (P1, 2026-07-26)
// ------------------------------------------------------------------------------------------------
// Maria, in real play: hold W, level up, pick a card with the mouse or with 1/2/3, and the character
// does NOT keep walking — she has to release W and press it again. That is lost survival time on
// every single level-up, and it silently contaminates any pressure measurement taken around a card.
//
// ROOT CAUSE. Game._quiesceMovementInput() called this._releaseHeldInput(), which is main.js's
// _releaseAllHeldInput() — and that does `keys.clear()`. `keys` is the RAW physical held-key set.
// It is called when a card panel opens AND when it closes (selectUpgrade / selectMutation), so a key
// held straight through the panel came back as "not held". The browser does not re-announce a key
// that is already down, so nothing moved until the next OS auto-repeat (~0.5s) or a manual re-press.
// Second, smaller defect in the same lifecycle: the keydown listener refused to record movement keys
// at all while a panel was up, so a key FIRST pressed during the panel was lost as well.
//
// FIX. _quiesceMovementInput() now calls _quiesceModalInput() (clears only the pointer latch) plus
// player.cancelMovement() (zeroes velocity). The raw key set is left alone — the world is already
// frozen because Game.update() returns before the player while upgradeUI/mutationUI/paused. The
// keydown listener records every key unconditionally. _releaseAllHeldInput() is untouched and still
// wired to blur / pagehide / visibilitychange, where the physical state truly is unknowable.
//
// These gates FAIL on the pre-fix build and PASS after it.
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MAIN_SRC = readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
const GAME_SRC = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');

let pass = 0, fail = 0;
const T = (n, ok, note = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

// ── 1. static contract ──────────────────────────────────────────────────────────────────────────
console.log('\n[1] Input lifecycle contract');
T('the modal quiesce no longer wipes the raw held-key set',
  /_quiesceMovementInput\(\)\s*\{[\s\S]{0,240}_quiesceModalInput/.test(GAME_SRC) &&
  !/_quiesceMovementInput\(\)\s*\{[\s\S]{0,240}_releaseHeldInput/.test(GAME_SRC));
T('the modal quiesce still zeroes the gameplay movement output',
  /_quiesceMovementInput\(\)\s*\{[\s\S]{0,300}cancelMovement/.test(GAME_SRC));
T('_quiesceModalInput clears only the pointer latch, never the key set',
  /function _quiesceModalInput\(\)\s*\{[^}]*mouseDown = false;[^}]*\}/.test(MAIN_SRC) &&
  !/function _quiesceModalInput\(\)\s*\{[^}]*keys\.clear\(\)/.test(MAIN_SRC));
T('blur / pagehide / visibility still clear everything (stuck-key safety kept)',
  /function _releaseAllHeldInput\(\)\s*\{[\s\S]{0,200}keys\.clear\(\)/.test(MAIN_SRC) &&
  /addEventListener\('blur', _releaseAllHeldInput\)/.test(MAIN_SRC) &&
  /addEventListener\('pagehide', _releaseAllHeldInput\)/.test(MAIN_SRC) &&
  /document\.hidden\) _releaseAllHeldInput\(\)/.test(MAIN_SRC));
T('focus loss and modal close are NOT the same code path',
  /_quiesceModalInput/.test(MAIN_SRC) && /_releaseAllHeldInput/.test(MAIN_SRC) &&
  !/function _quiesceModalInput\(\)\s*\{[^}]*_releaseAllHeldInput/.test(MAIN_SRC));
T('keydown records movement keys unconditionally (a key pressed during a panel counts)',
  !/movementBlocked && MOVEMENT_KEYS\.has\(key\)/.test(MAIN_SRC));
T('the player is never updated while a card panel is open (freeze does the suppressing)',
  /if \(this\.upgradeUI \|\| this\.mutationUI\) return;/.test(GAME_SRC));

// ── runtime ─────────────────────────────────────────────────────────────────────────────────────
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mulberry32 = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0;
globalThis.performance = { now: () => vclock };
const RealDate = globalThis.Date;
globalThis.Date = class extends RealDate { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const un = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { UpgradeUI } = await import(pathToFileURL(path.join(ROOT, 'js/game/UpgradeUI.js')).href);
un();

// A faithful stand-in for main.js's input plumbing: the same raw Set, the same two hooks, wired the
// same way. Nothing here suppresses movement — that is Game.update()'s freeze, exactly as shipped.
function makeRig(mode = 'endless') {
  const quiet = muteConsole();
  Math.random = mulberry32(31337);
  vclock = 0;
  const keys = new Set();
  const state = { mouseDown: false };
  const game = new Game();
  game.audio = null;
  game.selectedCharacter = 'skeleton_warrior';
  game.gameState = 'playing';
  if (mode === 'chaos') { game.reset(); game._beginChaosRun(); } else { game.reset(); game._enterEndless(); }
  game._releaseHeldInput = () => { keys.clear(); state.mouseDown = false; game.player?.cancelMovement?.(); };
  game._quiesceModalInput = () => { state.mouseDown = false; };
  game.enemies.length = 0;
  const input = { keys, mousePos: { x: 0, y: 0 }, mouseDown: false };
  const step = () => { game.enemies.length = 0; game.player.hp = game.player.maxHp; game.gameOver = false; vclock += 1000 / 60; game.update(1 / 60, input); };
  for (let i = 0; i < 20; i++) step();
  quiet();
  const card = { key: 'qa_noop', name: 'QA', description: '', rarity: 'common', maxLevel: 9, apply() {}, canApply: () => true };
  const openPanel = () => { game._quiesceMovementInput(); game.upgradeUI = new UpgradeUI([card, card, card]); };
  const selectCard = (i = 0) => { const q = muteConsole(); game.selectUpgrade(i); q(); };
  return { game, keys, state, step, openPanel, selectCard };
}
const firstFrameDelta = rig => {
  const p0 = { x: rig.game.player.pos.x, y: rig.game.player.pos.y };
  rig.step();
  return { dx: +(rig.game.player.pos.x - p0.x).toFixed(4), dy: +(rig.game.player.pos.y - p0.y).toFixed(4) };
};

console.log('\n[2] Card-panel scenarios (delta measured on the FIRST resumed frame)');
{ // 1. HOLD_W_MOUSE_SELECT
  const r = makeRig(); r.keys.add('w'); r.openPanel(); r.step(); r.selectCard(0);
  const d = firstFrameDelta(r);
  T('HOLD_W_MOUSE_SELECT — W still held after a card click resumes immediately', d.dy < 0, `dy=${d.dy} keys=[${[...r.keys]}]`);
}
{ // 2. HOLD_D_KEYBOARD_SELECT (1/2/3 goes through the same selectUpgrade path)
  const r = makeRig(); r.keys.add('d'); r.openPanel(); r.step(); r.keys.add('1'); r.selectCard(0); r.keys.delete('1');
  const d = firstFrameDelta(r);
  T('HOLD_D_KEYBOARD_SELECT — D resumes and the 1 key creates no movement', d.dx > 0 && Math.abs(d.dy) < 1e-6, `dx=${d.dx} dy=${d.dy}`);
}
{ // 3. RELEASE_DURING_MODAL
  const r = makeRig(); r.keys.add('a'); r.openPanel(); r.step(); r.keys.delete('a'); r.selectCard(0);
  const d = firstFrameDelta(r);
  T('RELEASE_DURING_MODAL — a key released behind the panel stays released', Math.abs(d.dx) < 1e-6 && Math.abs(d.dy) < 1e-6, `dx=${d.dx} dy=${d.dy}`);
}
{ // 4. PRESS_DURING_MODAL
  const r = makeRig(); r.openPanel(); r.step(); r.keys.add('s'); r.selectCard(0);
  const d = firstFrameDelta(r);
  T('PRESS_DURING_MODAL — a key first pressed behind the panel counts on resume', d.dy > 0, `dy=${d.dy}`);
}
{ // 5. HELD_DIAGONAL
  const r = makeRig(); r.keys.add('w'); r.keys.add('d'); r.openPanel(); r.step(); r.selectCard(0);
  const d = firstFrameDelta(r);
  const ratio = Math.abs(d.dx) > 0 ? Math.abs(d.dy / d.dx) : 0;
  T('HELD_DIAGONAL — W+D resumes as a normalized diagonal', d.dx > 0 && d.dy < 0 && Math.abs(ratio - 1) < 0.05, `dx=${d.dx} dy=${d.dy}`);
}
{ // 6. REPEATED_LEVEL_UPS — no accumulating delay across 10 panels
  const r = makeRig(); r.keys.add('w');
  const deltas = [];
  for (let i = 0; i < 10; i++) { r.openPanel(); r.step(); r.selectCard(0); deltas.push(firstFrameDelta(r).dy); }
  const allMoved = deltas.every(v => v < 0);
  const spread = Math.max(...deltas.map(Math.abs)) - Math.min(...deltas.map(Math.abs));
  T('REPEATED_LEVEL_UPS — resumes on all 10 panels', allMoved, `deltas=${deltas.map(v => v.toFixed(2)).join(',')}`);
  T('REPEATED_LEVEL_UPS — no accumulating dead period', spread < 0.5, `spread=${spread.toFixed(3)}px`);
}
{ // 7. BLUR_SAFETY
  const r = makeRig(); r.keys.add('w'); r.openPanel(); r.step(); r.selectCard(0);
  r.game._releaseHeldInput();                       // real blur path
  const d = firstFrameDelta(r);
  T('BLUR_SAFETY — focus loss still clears held movement', r.keys.size === 0 && Math.abs(d.dy) < 1e-6, `keys=${r.keys.size} dy=${d.dy}`);
  const d2 = firstFrameDelta(r);
  T('BLUR_SAFETY — movement does not restart by itself after focus returns', Math.abs(d2.dx) < 1e-6 && Math.abs(d2.dy) < 1e-6);
}
{ // 8. ZERO_INPUT_DRIFT
  const r = makeRig(); r.openPanel(); r.step(); r.selectCard(0);
  const p0 = { x: r.game.player.pos.x, y: r.game.player.pos.y };
  for (let i = 0; i < 300; i++) r.step();
  const drift = Math.hypot(r.game.player.pos.x - p0.x, r.game.player.pos.y - p0.y);
  T('ZERO_INPUT_DRIFT — no held key, no movement for 300 frames after a card', drift === 0, `drift=${drift}`);
}
{ // 9. SECOND_RUN
  const r = makeRig(); r.keys.add('w'); r.openPanel(); r.step(); r.selectCard(0); r.step();
  const q = muteConsole(); r.game.reset(); r.game._enterEndless(); q();
  r.keys.clear(); r.keys.add('a'); r.openPanel(); r.step(); r.selectCard(0);
  const d = firstFrameDelta(r);
  T('SECOND_RUN — the lifecycle is clean after a reset', d.dx < 0, `dx=${d.dx}`);
}
{ // 10. PAUSE_REGRESSION
  const r = makeRig(); r.keys.add('w');
  r.game.paused = true; for (let i = 0; i < 30; i++) r.step();
  r.game.paused = false;
  const d = firstFrameDelta(r);
  T('PAUSE_REGRESSION — held movement resumes straight out of pause', d.dy < 0, `dy=${d.dy}`);
  r.keys.clear();
  const d2 = firstFrameDelta(r);
  T('PAUSE_REGRESSION — releasing during pause leaves no stuck movement', Math.abs(d2.dy) < 1e-6, `dy=${d2.dy}`);
}
{ // chaos parity
  const r = makeRig('chaos'); r.keys.add('w'); r.openPanel(); r.step(); r.selectCard(0);
  const d = firstFrameDelta(r);
  T('CHAOS parity — held movement resumes in Chaos as well', d.dy < 0, `dy=${d.dy}`);
}

console.log(`\nRESULT ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
