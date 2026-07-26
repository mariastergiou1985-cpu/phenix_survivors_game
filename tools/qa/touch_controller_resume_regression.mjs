// TOUCH + CONTROLLER RESUME REGRESSION (P1-mobile / P1-pad, 2026-07-26)
// ------------------------------------------------------------------------------------------------
// The keyboard twin of this defect was fixed earlier today (held_movement_resume_regression.mjs):
// a key held through a level-up card panel stopped moving the hero until it was released and
// pressed again. This harness asks the same question for the OTHER two input devices.
//
// TOUCH — real defect. TouchInput.tick() hides the on-screen joystick whenever a card panel is up
// (inPlay excludes upgradeUI/mutationUI) and calls joyReset(), which sets joyPid = null. The finger
// is still on the glass, but the joystick element is display:none, so no new pointerdown ever
// arrives and every later pointermove is ignored (`e.pointerId !== joyPid`). The hero stands still
// in the middle of the swarm until the player lifts the thumb and puts it back down — on EVERY
// level-up. On a phone that is worse than the keyboard case, because the thumb never leaves the pad.
//
// CONTROLLER — no defect. applyGamepad() re-derives w/a/s/d from the LIVE stick axes on every
// frame and padHeld only tracks keys the bridge itself injected, so the frame after the panel
// closes re-injects the held direction with no player action. Gated here so it stays that way.
//
// This file runs the REAL js/TouchInput.js against a live mini-DOM (real listeners, real bubbling,
// real PointerEvents) and the REAL js/Gamepad.js against a synthetic pad. Nothing about the touch
// result is asserted from source text.
//
// Run: node tools/qa/touch_controller_resume_regression.mjs   (exit 1 on failure)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MAIN_SRC = readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');

let pass = 0, fail = 0;
const T = (n, ok, note = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

// ══ live mini-DOM ════════════════════════════════════════════════════════════════════════════
// Deliberately small but ACTIVE: listeners really fire and really bubble, so what the gates below
// observe is produced by production code, never by the shim.
class Ev {
  constructor(t, o = {}) { this.type = t; Object.assign(this, o); this.defaultPrevented = false; }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() {}
}
globalThis.KeyboardEvent = class extends Ev {};
globalThis.MouseEvent = class extends Ev {};
globalThis.Event = class extends Ev {};

class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.style = {}; this.dataset = {}; this.id = ''; this.className = ''; this.title = '';
    this.textContent = ''; this.width = 1280; this.height = 720;
    this._ls = new Map(); this.children = []; this.parentNode = null; this._rect = null; this._html = '';
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { if (k === 'id') this.id = v; }
  getAttribute() { return null; }
  addEventListener(t, fn) { if (!this._ls.has(t)) this._ls.set(t, []); this._ls.get(t).push(fn); }
  removeEventListener(t, fn) { const a = this._ls.get(t) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  dispatchEvent(ev) { return dispatch(this, ev); }
  setPointerCapture() {} releasePointerCapture() {}
  getContext() { return null; }
  getBoundingClientRect() { return this._rect || { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }; }
  querySelector(sel) { return sel.startsWith('#') ? byId(this, sel.slice(1)) : null; }
  querySelectorAll(sel) { const out = []; (function w(n) { for (const c of n.children) { if (c.tagName === sel.toUpperCase()) out.push(c); w(c); } })(this); return out; }
  closest(sel) {
    const ids = sel.split(',').map(s => s.trim()).filter(s => s.startsWith('#')).map(s => s.slice(1));
    let n = this; while (n) { if (ids.includes(n.id)) return n; n = n.parentNode; } return null;
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; this.children = []; parseHTML(v, this); }
}
function byId(root, id) { for (const c of root.children) { if (c.id === id) return c; const r = byId(c, id); if (r) return r; } return null; }
function parseHTML(html, parent) {
  const re = /<\/?([a-zA-Z]+)([^>]*)>/g; const stack = [parent]; let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { if (stack.length > 1) stack.pop(); continue; }
    const el = new El(m[1]); const are = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g; let a;
    while ((a = are.exec(m[2]))) {
      const k = a[1], v = a[2];
      if (k === 'id') el.id = v;
      else if (k === 'class') el.className = v;
      else if (k === 'title') el.title = v;
      else if (k.startsWith('data-')) el.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
    }
    stack[stack.length - 1].appendChild(el);
    if (!m[0].endsWith('/>')) stack.push(el);
  }
}
const fireOn = (n, ev) => { for (const fn of (n._ls.get(ev.type) || []).slice()) fn(ev); };
function dispatch(target, ev) {
  if (!ev.target) ev.target = target;
  let n = target; while (n && n._ls) { fireOn(n, ev); n = n.parentNode; }
  if (target !== DOC) fireOn(DOC, ev);
  fireOn(WIN, ev);
  return true;
}

const htmlEl = new El('html'), headEl = new El('head'), bodyEl = new El('body');
htmlEl.appendChild(headEl); htmlEl.appendChild(bodyEl);
const DOCLS = new Map(), WINLS = new Map();
const WIN = { _ls: WINLS };
const DOC = {
  _ls: DOCLS,
  addEventListener(t, fn) { if (!DOCLS.has(t)) DOCLS.set(t, []); DOCLS.get(t).push(fn); },
  removeEventListener() {},
  createElement: t => new El(t),
  head: headEl, body: bodyEl, documentElement: htmlEl,
  hidden: false, fullscreenElement: null,
  dispatchEvent(ev) { return dispatch(DOC, ev); },
};
globalThis.window = globalThis;
globalThis.document = DOC;
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.addEventListener = (t, fn) => { if (!WINLS.has(t)) WINLS.set(t, []); WINLS.get(t).push(fn); };
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = ev => dispatch(WIN, ev);
globalThis.matchMedia = q => ({ matches: /coarse/.test(q), addEventListener() {}, addListener() {} });
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node-qa-mobile', maxTouchPoints: 5, getGamepads: () => [PAD] }, configurable: true,
});
let RAF = [];
globalThis.requestAnimationFrame = fn => RAF.push(fn);
const frame = (n = 1) => { for (let i = 0; i < n; i++) { const q = RAF; RAF = []; for (const fn of q) fn(0); } };

// ══ boot the REAL touch controls ═════════════════════════════════════════════════════════════
const canvas = new El('canvas');
const keys = new Set();
const game = {
  gameState: 'playing', paused: false, gameOver: false, victory: false,
  upgradeUI: null, mutationUI: null, _controllerConnected: false, _controllerActivated: false,
};
let PAD = null;

const { initTouchControls } = await import(pathToFileURL(path.join(ROOT, 'js/TouchInput.js')).href);
const handle = initTouchControls({ canvas, keys, game, setAim: () => {}, onQ: () => {}, onE: () => {}, onUlt: () => {} });

console.log('\n═══ TOUCH + CONTROLLER RESUME REGRESSION ═══');
console.log('\n[0] touch overlay really booted');
T('initTouchControls returned an overlay on a touch device', !!(handle && handle.overlay));
const joy = bodyEl.querySelector('#touch-joy');
const btns = bodyEl.querySelector('#touch-btns');
T('joystick + button cluster exist in the live DOM', !!joy && !!btns);
joy._rect = { left: 40, top: 600, right: 130, bottom: 690, width: 90, height: 90 };  // centre (85, 645)
frame(1);   // first tick(): _shown = true

// ── helpers: real PointerEvents through the real listeners ─────────────────────────────────────
const ptr = (type, x, y, target, id = 1) => new Ev(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', target });
const thumbDown = (x = 85, y = 620) => dispatch(joy, ptr('pointerdown', x, y, joy));           // 25px up  → 'w'
const thumbMoveOnJoy = (x, y) => dispatch(joy, ptr('pointermove', x, y, joy));
const thumbMoveOffJoy = (x, y) => dispatch(DOC, ptr('pointermove', x, y, joy));                // capture lost (worst case)
const thumbUpOffJoy = (x = 85, y = 620) => dispatch(DOC, ptr('pointerup', x, y, joy));
const thumbUpOnJoy = (x = 85, y = 620) => dispatch(joy, ptr('pointerup', x, y, joy));
const openPanel = () => { game.upgradeUI = {}; frame(1); };
const closePanel = () => { game.upgradeUI = null; frame(1); };
const mv = () => [...keys].filter(k => 'wasd'.includes(k)).sort().join('');
const reset = () => { dispatch(WIN, new Ev('blur')); keys.clear(); game.upgradeUI = null; frame(2); };

// ══ 1. the defect ════════════════════════════════════════════════════════════════════════════
console.log('\n[1] thumb held on the joystick through a level-up card');
reset();
thumbDown();
T('thumb up on the pad injects W', mv() === 'w', 'keys=' + mv());
openPanel();
T('card panel hides the joystick and stops injecting', joy.style.display === 'none' && mv() === '', 'display=' + joy.style.display + ' keys=' + mv());
closePanel();
T('THE GATE: the hero keeps walking after the card is picked, thumb never lifted', mv() === 'w', 'keys=' + mv());
T('the joystick is visible again', joy.style.display !== 'none');

// ══ 2. no ghost movement ═════════════════════════════════════════════════════════════════════
console.log('\n[2] the opposite failure — phantom walking');
reset();
thumbDown();
openPanel();
thumbUpOffJoy();                      // thumb lifted while the joystick was hidden
closePanel();
T('thumb lifted DURING the panel → no movement on resume', mv() === '', 'keys=' + mv());

reset();
openPanel(); closePanel();
T('no thumb at all → panel open/close injects nothing', mv() === '', 'keys=' + mv());

reset();
thumbDown();
closePanel();                         // panel never opened; make sure nothing double-fires
T('idle tick with a held thumb does not duplicate or drop the key', mv() === 'w', 'keys=' + mv());

// ══ 3. direction changed while the panel was up ══════════════════════════════════════════════
console.log('\n[3] the thumb moves while the joystick is hidden');
reset();
thumbDown();
openPanel();
thumbMoveOffJoy(115, 645);            // 30px right of centre → 'd'
T('no injection while the panel is up', mv() === '', 'keys=' + mv());
closePanel();
T('resume uses the CURRENT thumb position, not the stale one', mv() === 'd', 'keys=' + mv());

// ══ 4. repeated level-ups ════════════════════════════════════════════════════════════════════
console.log('\n[4] ten consecutive level-ups with the thumb down');
reset();
thumbDown();
let ok10 = 0;
for (let i = 0; i < 10; i++) { openPanel(); closePanel(); if (mv() === 'w') ok10++; }
T('10/10 level-ups resume movement', ok10 === 10, ok10 + '/10');
thumbUpOnJoy();
T('lifting the thumb after all that still stops the hero', mv() === '', 'keys=' + mv());

// ══ 5. focus loss must still win ═════════════════════════════════════════════════════════════
console.log('\n[5] focus loss / backgrounding still clears everything');
reset();
thumbDown();
dispatch(WIN, new Ev('blur'));
T('blur clears the injected movement keys', mv() === '', 'keys=' + mv());
openPanel(); closePanel();
T('a card after a blur does not resurrect the lost thumb', mv() === '', 'keys=' + mv());

reset();
thumbDown();
DOC.hidden = true; dispatch(DOC, new Ev('visibilitychange')); DOC.hidden = false;
T('tab hidden clears the injected movement keys', mv() === '', 'keys=' + mv());
openPanel(); closePanel();
T('a card after backgrounding does not resurrect the thumb', mv() === '', 'keys=' + mv());

// ══ 6. controller takeover ═══════════════════════════════════════════════════════════════════
console.log('\n[6] controller takeover hides the touch pad');
reset();
thumbDown();
game._controllerConnected = true; game._controllerActivated = true; frame(1);
T('an active pad hides the joystick and drops its injected keys', joy.style.display === 'none' && mv() === '', 'keys=' + mv());
game._controllerConnected = false; game._controllerActivated = false; frame(1);
T('pad goes idle → the still-held thumb takes over again', mv() === 'w', 'keys=' + mv());
reset();

// ══ 7. controller: held stick through a card panel ═══════════════════════════════════════════
console.log('\n[7] controller — stick held through a card panel');
const { GamepadInput } = await import(pathToFileURL(path.join(ROOT, 'js/Gamepad.js')).href);
const mkPad = (lx, ly, pressed = []) => ({
  connected: true, id: 'Xbox Controller', axes: [lx, ly, 0, 0],
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});
const gp = new GamepadInput(); gp.activated = true;
PAD = mkPad(0, -1);
let upFrames = 0;
for (let i = 0; i < 180; i++) { const s = gp.poll(); if (s && s.axes.ly < -0.38) upFrames++; }   // 3s of "panel up + panel down"
T('the reader reports the held stick on EVERY frame (no UI state inside it)', upFrames === 180, upFrames + '/180');
PAD = mkPad(0, 0);
T('stick released → the reader stops reporting it', gp.poll().axes.ly === 0);

// The bridge lives in main.js, which cannot be imported headlessly (it boots the whole game), so
// the mapping is pinned by contract. Recovery is structural: the direction is re-derived from the
// live axes inside `if (inGameplay)` on every frame, and padHeld only tracks what the bridge itself
// injected — so the first frame after the panel closes re-adds the key with no player action.
const AG = MAIN_SRC.slice(MAIN_SRC.indexOf('function applyGamepad'), MAIN_SRC.indexOf('STUCK-KEY GUARD'));
T('applyGamepad re-derives w/a/s/d from the live axes every frame',
  /const up = s\.axes\.ly < -\(prevDir\.up \? release : enter\)/.test(AG) &&
  /padSetHeld\('w', up\); padSetHeld\('s', down\); padSetHeld\('a', left\); padSetHeld\('d', right\);/.test(AG));
T('the card-panel branch only drops what the bridge injected (padClearHeld, not keys.clear)',
  /\} else \{\s*\n\s*padClearHeld\(\);/.test(AG) && !/keys\.clear\(\)/.test(AG));
T('padSetHeld re-adds a key it believes it has not injected',
  /function padSetHeld[\s\S]{0,200}if \(!padHeld\.has\(key\)\) \{ keys\.add\(key\);\s+padHeld\.add\(key\); \}/.test(MAIN_SRC));
T('the modal quiesce never touches padHeld',
  /function _quiesceModalInput\(\)\s*\{[^}]*\}/.test(MAIN_SRC) &&
  !/function _quiesceModalInput\(\)\s*\{[^}]*padClearHeld/.test(MAIN_SRC));
T('blur / pagehide / visibility still clear padHeld (stuck-stick safety kept)',
  /function _releaseAllHeldInput\(\)[\s\S]{0,220}padClearHeld\(\)/.test(MAIN_SRC));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
