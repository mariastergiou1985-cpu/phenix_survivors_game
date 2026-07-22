// CONTROLS / MOVEMENT / INPUT REGRESSION — keyboard, gamepad, touch, movement math.
// Drives the REAL GamepadInput and the REAL Player movement resolver where possible, and
// statically pins the wiring that cannot be instantiated headlessly (DOM listeners).
//
// Failure classes covered: stuck keys after focus loss, held-input leakage into pause/menus,
// gamepad dead zones, diagonal movement, movement normalization, dash bounds, character
// speed differences, touch latch-up, and non-finite movement reaching the walkability clamp.
//
// Run: node tools/qa/controls_input_regression.mjs   (exit 1 on failure)

import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);

globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }) };
globalThis.Image = class { constructor() { this.complete = false; this.naturalWidth = 0; } set src(_) {} };
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.resolve(HERE, '../../js');
const MAIN = fs.readFileSync(path.join(JS, 'main.js'), 'utf8');
const TOUCH = fs.readFileSync(path.join(JS, 'TouchInput.js'), 'utf8');
const PL = fs.readFileSync(path.join(JS, 'entities/Player.js'), 'utf8');
const GAME = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');

let pass = 0, fail = 0;
const T = (n, f) => {
  let ok = false, note = '';
  try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; }
  catch (e) { note = 'THREW: ' + e.message; }
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`);
};

// ── real gamepad reader, driven by a synthetic pad ─────────────────────────
const { GamepadInput } = await import(pathToFileURL(path.join(JS, 'Gamepad.js')).href);
const { Vec2 } = await import(pathToFileURL(path.join(JS, 'constants.js')).href);

let PAD = null;
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [PAD] }, configurable: true });
const mkPad = (lx, ly, rx = 0, ry = 0, pressed = []) => ({
  connected: true, id: 'Xbox Controller', axes: [lx, ly, rx, ry],
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});
// main.js maps axes onto boolean W/A/S/D exactly like this.
const dirsOf = a => ({ up: a.ly < 0, down: a.ly > 0, left: a.lx < 0, right: a.lx > 0 });
const read = (lx, ly) => { PAD = mkPad(lx, ly); const g = new GamepadInput(); g.activated = true; return dirsOf(g.poll().axes); };
const nDirs = d => (d.up ? 1 : 0) + (d.down ? 1 : 0) + (d.left ? 1 : 0) + (d.right ? 1 : 0);

console.log('═══ CONTROLS / MOVEMENT / INPUT REGRESSION ═══');

console.log('\n── 1. stuck keys: focus loss / visibility ──');
T('window blur απελευθερώνει ΟΛΑ τα held keys',
  () => /window\.addEventListener\('blur', _releaseAllHeldInput\)/.test(MAIN));
T('document.hidden απελευθερώνει ΟΛΑ τα held keys',
  () => /visibilitychange[\s\S]{0,80}document\.hidden[\s\S]{0,40}_releaseAllHeldInput\(\)/.test(MAIN));
T('pagehide απελευθερώνει ΟΛΑ τα held keys',
  () => /window\.addEventListener\('pagehide', _releaseAllHeldInput\)/.test(MAIN));
T('_releaseAllHeldInput καθαρίζει keys, mouseDown ΚΑΙ padHeld', () => {
  const i = MAIN.indexOf('function _releaseAllHeldInput');
  const body = MAIN.slice(i, MAIN.indexOf('\n}', i));
  return /keys\.clear\(\)/.test(body) && /mouseDown = false/.test(body) && /padClearHeld\(\)/.test(body);
});
T('padHeld καθαρίζεται μαζί με keys (αλλιώς το pad ξεσυγχρονίζεται)', () => {
  // padSetHeld only re-adds a key it thinks it has NOT injected; clearing `keys` alone
  // would leave padHeld stale and the controller would go dead after one alt-tab.
  const i = MAIN.indexOf('function _releaseAllHeldInput');
  const body = MAIN.slice(i, MAIN.indexOf('\n}', i));
  return /padClearHeld\(\)/.test(body) && /prevDir\.up = /.test(body);
});
T('touch joystick ξεκλειδώνει σε visibilitychange/blur',
  () => /document\.hidden[\s\S]{0,60}clearHeld\(\)[\s\S]{0,30}joyReset\(\)/.test(TOUCH) &&
        /window\.addEventListener\('blur'[\s\S]{0,60}clearHeld\(\)/.test(TOUCH));

console.log('\n── 2. gamepad dead zones (radial, not square) ──');
T('stick σε ηρεμία → καμία κατεύθυνση', () => nDirs(read(0, 0)) === 0);
T('μικρό drift (0.10, 0.10) αγνοείται', () => nDirs(read(0.10, 0.10)) === 0);
T('drift ακριβώς κάτω από το deadzone αγνοείται', () => nDirs(read(0.20, 0.20)) === 0);
T('cardinal push 0.31 κινεί', () => { const d = read(0, -0.31); return d.up && nDirs(d) === 1; });
T('DIAGONAL 45° σε magnitude 0.35 ΚΙΝΕΙ (το παλιό square deadzone το έριχνε)', () => {
  const v = 0.35 / Math.SQRT2;                 // 0.2475 per axis — both under the old 0.30
  const d = read(v, -v);
  return d.up && d.right && nDirs(d) === 2 || `up=${d.up} right=${d.right}`;
});
T('διαγώνιο και cardinal έχουν ΤΟ ΙΔΙΟ κατώφλι magnitude', () => {
  const eps = 0.005, M = 0.30;
  const card = read(0, -(M + eps));
  const v = (M + eps) / Math.SQRT2;
  const diag = read(v, -v);
  return nDirs(card) > 0 && nDirs(diag) > 0;
});
T('κάτω από το κατώφλι, καμία κατεύθυνση σε ΚΑΜΙΑ γωνία', () => {
  for (let a = 0; a < 360; a += 5) {
    const r = 0.29, x = Math.cos(a * Math.PI / 180) * r, y = Math.sin(a * Math.PI / 180) * r;
    if (nDirs(read(x, y)) !== 0) return `γωνία ${a}° πέρασε στο magnitude ${r}`;
  }
  return true;
});
T('πάνω από το κατώφλι, ΚΑΘΕ γωνία δίνει κίνηση (κανένα dead cross)', () => {
  // Sweeps the EXACT window where the old square deadzone failed: magnitude is over the
  // 0.30 threshold, but at 45° each axis lands under 0.30 until magnitude reaches 0.424.
  for (let r = 0.31; r <= 0.43; r += 0.01) {
    for (let a = 0; a < 360; a += 5) {
      const x = Math.cos(a * Math.PI / 180) * r, y = Math.sin(a * Math.PI / 180) * r;
      if (nDirs(read(x, y)) === 0) return `γωνία ${a}° ΝΕΚΡΗ στο magnitude ${r.toFixed(2)}`;
    }
  }
  return true;
});
T('σχεδόν-κάθετο push μένει ΚΑΘΑΡΑ κάθετο (κανένα diagonal drift)', () => {
  const d = read(0.05, -0.99);
  return d.up && !d.left && !d.right || `left=${d.left} right=${d.right}`;
});
T('σχεδόν-οριζόντιο push μένει ΚΑΘΑΡΑ οριζόντιο', () => {
  const d = read(0.99, 0.05);
  return d.right && !d.up && !d.down;
});
T('ποτέ αντίθετες κατευθύνσεις ταυτόχρονα', () => {
  for (let a = 0; a < 360; a += 7) {
    const x = Math.cos(a * Math.PI / 180), y = Math.sin(a * Math.PI / 180);
    const d = read(x, y);
    if ((d.up && d.down) || (d.left && d.right)) return `γωνία ${a}°`;
  }
  return true;
});
T('right stick χρησιμοποιεί το ίδιο radial deadzone', () => {
  PAD = mkPad(0, 0, 0.10, 0.10); const g = new GamepadInput(); g.activated = true;
  const a = g.poll().axes; return a.rx === 0 && a.ry === 0;
});
T('χωρίς pad → poll() επιστρέφει null, καμία κίνηση', () => { PAD = null; return new GamepadInput().poll() === null; });
T('μη-συνδεδεμένο pad αγνοείται', () => { PAD = { connected: false, axes: [1, 1], buttons: [] }; return new GamepadInput().poll() === null; });
T('poll() δεν κάνει throw με ελλιπή axes/buttons', () => {
  PAD = { connected: true, id: 'x', axes: [], buttons: [] };
  const g = new GamepadInput(); g.activated = true; const s = g.poll();
  return s.axes.lx === 0 && s.axes.ly === 0;
});
T('rising edge: κρατημένο κουμπί δίνει pressed ΜΙΑ φορά', () => {
  PAD = mkPad(0, 0, 0, 0, [0]); const g = new GamepadInput();
  const a = g.poll(), b = g.poll();
  return a.btn.a.pressed === true && b.btn.a.pressed === false && b.btn.a.held === true;
});

console.log('\n── 3. movement normalization / diagonal ──');
const dirFromKeys = keys => {
  const d = new Vec2();
  if (keys.has('w') || keys.has('arrowup')) d.y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) d.y += 1;
  if (keys.has('a') || keys.has('arrowleft')) d.x -= 1;
  if (keys.has('d') || keys.has('arrowright')) d.x += 1;
  d.normalizeMut();
  return d;
};
T('Player.update κάνει normalizeMut στο dir (καμία γρήγορη διαγώνιος)', () => /dir\.normalizeMut\(\);/.test(PL));
T('διαγώνια ταχύτητα == cardinal ταχύτητα', () => {
  const c = dirFromKeys(new Set(['w'])), dg = dirFromKeys(new Set(['w', 'd']));
  return Math.abs(c.length() - 1) < 1e-9 && Math.abs(dg.length() - 1) < 1e-9;
});
T('αντίθετα πλήκτρα ακυρώνονται (dir = 0, κανένα NaN)', () => {
  const d = dirFromKeys(new Set(['w', 's', 'a', 'd']));
  return d.x === 0 && d.y === 0 && Number.isFinite(d.x) && Number.isFinite(d.y);
});
T('normalizeMut είναι zero-guarded (κανένα div-by-zero → NaN)', () => {
  const z = new Vec2(0, 0).normalizeMut();
  return z.x === 0 && z.y === 0 && Number.isFinite(z.x);
});
T('και τα 8 directions έχουν μήκος 1', () => {
  const combos = [['w'], ['s'], ['a'], ['d'], ['w', 'a'], ['w', 'd'], ['s', 'a'], ['s', 'd']];
  return combos.every(c => Math.abs(dirFromKeys(new Set(c)).length() - 1) < 1e-9);
});
T('arrow keys ισοδύναμα με WASD', () => {
  const a = dirFromKeys(new Set(['w', 'd'])), b = dirFromKeys(new Set(['arrowup', 'arrowright']));
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
});

console.log('\n── 4. dash & special input ──');
T('dash duration πεπερασμένη', () => /this\.dashDuration = 0\.16;/.test(PL));
T('dash cooldown πεπερασμένο και > 0', () => /this\.dashCooldown = this\.selectedCharacter === 'taekwondo_girl' \? 0\.32 : 0\.4;/.test(PL));
T('dash απαιτεί stamina (δεν είναι spammable)', () => /wantsDash && this\.dashCooldown <= 0 && this\.stamina >= dashCost/.test(PL));
T('dash velocity ΑΝΑΤΙΘΕΤΑΙ, δεν συσσωρεύεται', () => /this\.vel = this\._dashDir\.scale\(this\.speed \* 3\.5\);/.test(PL));
T('μετά το dash η ταχύτητα επανέρχεται (καμία μόνιμη μεταβολή)', () => /\} else \{[\s\S]{0,400}this\.vel = dir\.scale\(this\.speed \* moveMult\);/.test(PL));
T('dash trail κλαδεύεται in-place (bounded)', () => /const _a = this\._dashTrail;[\s\S]{0,200}_a\.length = _w;/.test(PL));
T('dash χωρίς κατεύθυνση χρησιμοποιεί lastFacingDir (κανένα zero-vector dash)',
  () => /const dashDir\s+= dir\.lengthSq\(\) > 0 \? dir : this\.lastFacingDir;/.test(PL));
T('SHIFT = dash, SPACE = ultimate (χωρίς επικάλυψη)',
  () => /const wantsDash = keys\.has\('shift'\);/.test(PL) && /if \(key === ' '\) \{ game\.activateThunderSolo/.test(MAIN));

console.log('\n── 5. pause / menu input leakage ──');
T('update() σταματά πριν το player.update όταν paused/gameOver/victory',
  () => /if \(this\.paused \|\| this\.gameOver \|\| this\.victory\) return;/.test(GAME));
T('update() σταματά όταν upgradeUI/mutationUI ανοιχτά',
  () => /if \(this\.upgradeUI \|\| this\.mutationUI\) return;/.test(GAME));
T('ο pause gate προηγείται του player.update στη ροή', () => {
  const g = GAME.indexOf('if (this.paused || this.gameOver || this.victory) return;');
  const p = GAME.indexOf('this.player.update(dt, _frozenInput);');
  return g > 0 && p > 0 && g < p;
});
T('controller ΔΕΝ κρατά movement keys εκτός gameplay',
  () => /\} else \{\s*\n\s*padClearHeld\(\);\s+\/\/ no held movement outside gameplay/.test(MAIN));
T('gameplay gate του controller ελέγχει paused + όλα τα UI',
  () => /const inGameplay = game\.gameState === 'playing' && !game\.paused && !game\.gameOver &&\s*\n\s*!game\.victory && !game\.upgradeUI && !game\.mutationUI;/.test(MAIN));
T('pad taps απελευθερώνονται το επόμενο frame (ένα press = μία ενέργεια)',
  () => /for \(const k of padTapUp\) window\.dispatchEvent\(new KeyboardEvent\('keyup'/.test(MAIN));
T('Frozen Sleet παγώνει το input χωρίς να αγγίξει το keys Set',
  () => /const _frozenInput = _sleetFrozen \? \{ \.\.\.input, keys: new Set\(\) \} : input;/.test(MAIN + GAME));

console.log('\n── 6. touch / mobile ──');
T('joystick χειρίζεται pointercancel (διακοπή κλήσης/notification)',
  () => /joy\.addEventListener\('pointercancel', joyUp\);/.test(TOUCH));
T('hold buttons χειρίζονται pointercancel', () => /el\.addEventListener\('pointercancel', up\);/.test(TOUCH));
T('joystick χρησιμοποιεί setPointerCapture (το δάχτυλο μπορεί να βγει από το pad)',
  () => /joy\.setPointerCapture\(e\.pointerId\)/.test(TOUCH));
T('ένα μόνο pointer ελέγχει το joystick', () => /if \(joyPid !== null\) return;/.test(TOUCH));
T('touch καθαρίζει ΜΟΝΟ τα δικά του keys', () => /function clearHeld\(\) \{ for \(const k of heldMove\) keys\.delete\(k\); heldMove\.clear\(\); \}/.test(TOUCH));
T('joystick deadzone μικρότερη από MAXR (τα διαγώνια είναι εφικτά)', () => {
  const m = TOUCH.match(/const DEAD = (\d+), MAXR = (\d+)/);
  if (!m) return 'δεν βρέθηκαν DEAD/MAXR';
  const DEAD = +m[1], MAXR = +m[2];
  return DEAD * Math.SQRT2 < MAXR || `DEAD*√2=${(DEAD * Math.SQRT2).toFixed(1)} >= MAXR=${MAXR}`;
});

console.log('\n── 7. walkability / collision interaction ──');
T('walkable clamp εφαρμόζεται ΜΕΤΑ το player.update (dash + knockback υπακούν)', () => {
  const p = GAME.indexOf('this.player.update(dt, _frozenInput);');
  const c = GAME.indexOf('const b = this.getWalkableBounds();', p);
  return c > p && c - p < 1200;
});
T('clamp ελέγχει isFinite πριν εφαρμόσει όρια και κρατά ολόκληρο το footprint', () =>
  /if \(isFinite\(b\.x0\)\) this\.player\.pos\.x = Math\.max\(b\.x0 \+ PLAYER_RADIUS, Math\.min\(b\.x1 - PLAYER_RADIUS, this\.player\.pos\.x\)\);/.test(GAME));
T('enemy move resolver υπάρχει (δεν χάθηκε σε conflict resolution)', () => /_resolveEnemyMove = \(fx, fy, tx, ty, r\) =>/.test(GAME));
T('stuck-recovery resolver υπάρχει', () => /_recoverEnemyPos = \(x, y, r\) =>/.test(GAME));

console.log('\n── 8. character-specific movement ──');
T('Taekwondo Girl έχει φθηνότερο/ταχύτερο dash', () => {
  const cost = /const dashCost\s+= this\.selectedCharacter === 'taekwondo_girl' \? 30 : 35;/.test(PL);
  const cd = /'taekwondo_girl' \? 0\.32 : 0\.4;/.test(PL);
  return cost && cd;
});
T('stagger επιβραδύνει το περπάτημα αλλά ΟΧΙ το dash (παραμένει escape)',
  () => /const moveMult\s+= this\.staggerTimer > 0 \? 0\.45 : 1\.0;/.test(PL));
T('ανά χαρακτήρα ταχύτητα δεν διαρρέει σε άλλους (self-guarded)',
  () => (GAME.match(/selectedCharacter !== 'japan_phasewalker'\) return;/g) || []).length >= 2);

console.log(`\n═══ ${pass} assertions passed · ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
