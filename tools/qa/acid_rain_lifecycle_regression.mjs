// ════════════════════════════════════════════════════════════════════════════════
// ACID RAIN — deterministic lifecycle + draw-space regression (no browser).
//
// The green square was a SPACE bug, not a colour bug: every coordinate AcidRain
// draws is world-space, but the call site sat in the screen-space block. This gate
// pins the contract that made that possible to miss:
//
//   · the storm's own draw output is world-space, keyed to game.camera — asserted by
//     moving the camera and checking the drawn rect moves WITH it
//   · the full-screen haze covers exactly the visible world rect, no more, no less
//   · nothing at all is drawn while idle
//   · the event cleans up completely when it ends: no puddle, impact, particle or
//     streak outlives the storm, and the cooldown is re-armed
//
// It runs the REAL AcidRain class against a stub game and a recording context, so it
// needs no DOM and no canvas.
//
// Run: node tools/qa/acid_rain_lifecycle_regression.mjs
// ════════════════════════════════════════════════════════════════════════════════
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

let pass = 0, fail = 0;
const failures = [];
const check = (id, cond, extra) => {
  if (cond) { pass++; console.log(`PASS ${id}`); }
  else { fail++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

// Same ?v= Game.js pins, so this exercises the module the game actually loads.
const GAME_SRC = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const STAMP = GAME_SRC.match(/AcidRain\.js\?v=(\d+)/)[1];
const { AcidRain } = await import(
  pathToFileURL(path.join(ROOT, 'js/game/AcidRain.js')).href + '?v=' + STAMP);
check('A01 AcidRain loads on the specifier Game.js pins', typeof AcidRain === 'function', STAMP);

// ── recording 2D context ────────────────────────────────────────────────────
function makeCtx() {
  const rects = [], ops = [];
  const grad = () => ({ addColorStop() {} });
  return {
    rects, ops,
    globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000',
    strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, shadowColor: 'transparent',
    save() { ops.push('save'); }, restore() { ops.push('restore'); },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, rect() {}, clip() {}, translate() {},
    rotate() {}, scale() {}, setTransform() {}, transform() {}, drawImage() {},
    fill() {}, stroke() {}, roundRect() {},
    createLinearGradient(...a) { ops.push(['lg', ...a]); return grad(); },
    createRadialGradient(...a) { ops.push(['rg', ...a]); return grad(); },
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, alpha: this.globalAlpha }); },
    strokeRect() {}, fillText() {}, measureText() { return { width: 10 }; },
  };
}

// ── stub game: only what AcidRain touches ───────────────────────────────────
function makeGame(camX = 4000, camY = 3000) {
  return {
    camera: { x: camX, y: camY },
    _viewScale: 0.85,
    get _viewW() { return 1280 / this._viewScale; },
    get _viewH() { return 720 / this._viewScale; },
    timeAlive: 600,
    endless: true,
    _chaosMode: false,
    player: { pos: { x: camX + 700, y: camY + 400 }, hp: 100, maxHp: 100, radius: 18 },
    floatingTexts: [],
    enemies: [],
    audio: null,
    announcements: [],
    triggerAnnouncement(t) { this.announcements.push(t); },
    _majorEventBlocked() { return false; },
  };
}

// NOTE: takes the game explicitly — an earlier version defaulted it and every call
// site silently passed `seconds` into `g`, so the loop bound was undefined and not a
// single tick ran. The checks still went green on the phase the test had set by hand,
// which is exactly the kind of vacuous pass this comment exists to prevent.
const drive = (rain, g, seconds, step = 1 / 60) => {
  let ticks = 0;
  for (let t = 0; t < seconds; t += step) { g.timeAlive += step; rain.update(step); ticks++; }
  return ticks;
};

// ── B. Idle draws nothing ───────────────────────────────────────────────────
{
  const g = makeGame(), rain = new AcidRain(g), ctx = makeCtx();
  rain.draw(ctx);
  check('B01 an idle storm draws nothing at all', ctx.rects.length === 0 && ctx.ops.length === 0,
    JSON.stringify({ rects: ctx.rects.length, ops: ctx.ops.length }));
}

// ── C. The haze covers exactly the visible world rect, and follows the camera ──
const hazeAt = (camX, camY) => {
  const g = makeGame(camX, camY);
  const rain = new AcidRain(g);
  rain._cdLeft = 0; rain._warned = false;
  rain._enterPhase('raining', 30);
  const ticks = drive(rain, g, 3);
  if (ticks < 100) throw new Error('drive() did not tick: ' + ticks);
  const ctx = makeCtx();
  rain.draw(ctx);
  // the haze is the only full-view rect the storm draws
  const full = ctx.rects.filter(r => Math.abs(r.w - g._viewW) < 1 && Math.abs(r.h - g._viewH) < 1);
  return { g, rects: ctx.rects, full };
};
{
  const a = hazeAt(4000, 3000);
  check('C01 the storm draws exactly one full-view wash', a.full.length === 1,
    JSON.stringify(a.rects.map(r => [r.x | 0, r.y | 0, r.w | 0, r.h | 0])));
  check('C02 the wash is anchored to the camera, in WORLD units',
    a.full[0] && Math.abs(a.full[0].x - 4000) < 1 && Math.abs(a.full[0].y - 3000) < 1,
    JSON.stringify(a.full[0]));
  check('C03 the wash is exactly the visible world rect (not the 1280x720 canvas)',
    a.full[0] && Math.abs(a.full[0].w - a.g._viewW) < 1 && Math.abs(a.full[0].h - a.g._viewH) < 1 &&
    Math.abs(a.full[0].w - 1280) > 100,
    JSON.stringify({ drawn: a.full[0], viewW: a.g._viewW, viewH: a.g._viewH }));

  const b = hazeAt(9000, 7000);
  check('C04 move the camera and the wash moves with it — it is not screen-space',
    b.full[0] && Math.abs(b.full[0].x - 9000) < 1 && Math.abs(b.full[0].y - 7000) < 1,
    JSON.stringify(b.full[0]));
  check('C05 no rect is left at a screen-space origin while the camera is far away',
    !a.rects.some(r => Math.abs(r.x) < 1 && Math.abs(r.y) < 1 && r.w > 100),
    JSON.stringify(a.rects.filter(r => Math.abs(r.x) < 1 && Math.abs(r.y) < 1)));
}

// ── D. Telegraph -> rain -> fade -> idle, with full cleanup ──────────────────
{
  const g = makeGame(), rain = new AcidRain(g);
  rain._cdLeft = 0; rain._warned = false;
  rain._enterPhase('warning', 3);
  drive(rain, g, 0.5);
  check('D01 the warning phase runs and announces exactly once',
    rain.stats().phase === 'warning' && g.announcements.filter(a => /ACID RAIN/i.test(a)).length === 1,
    JSON.stringify({ phase: rain.stats().phase, ann: g.announcements }));
  drive(rain, g, 1.0);
  check('D02 the announcement is not repeated while the warning is still up',
    g.announcements.filter(a => /ACID RAIN/i.test(a)).length === 1, JSON.stringify(g.announcements));

  drive(rain, g, 3.0);
  check('D03 the warning becomes rain', rain.stats().phase === 'raining', rain.stats().phase);

  // let the storm build so there is something real to clean up
  drive(rain, g, 8);
  const mid = rain.stats();
  check('D04 a live storm actually produces VFX (streaks and impacts)',
    mid.streaks > 0 && (mid.impacts > 0 || mid.particles > 0), JSON.stringify(mid));
  const ctx2 = makeCtx();
  rain.draw(ctx2);
  check('D05 a live storm draws (the VFX reach the context)', ctx2.rects.length > 0 || ctx2.ops.length > 0,
    JSON.stringify({ rects: ctx2.rects.length, ops: ctx2.ops.length }));

  // Run it out and STOP at the transition. Driving past it would keep ticking the idle
  // branch, which drains the cooldown the storm just armed — an earlier version did
  // exactly that and made D09 look like a game defect.
  let ranOut = 0;
  while (rain.stats().phase !== 'idle' && ranOut < 400) { drive(rain, g, 1); ranOut++; }
  const armedCd = rain._cdLeft;
  const end = rain.stats();
  check('D06 the storm returns to idle', end.phase === 'idle', end.phase);
  check('D07 cleanup is complete — no streak, impact, particle or puddle survives',
    end.streaks === 0 && end.impacts === 0 && end.particles === 0 && end.puddles === 0,
    JSON.stringify(end));
  const ctx3 = makeCtx();
  rain.draw(ctx3);
  check('D08 nothing is drawn after the storm ends', ctx3.rects.length === 0 && ctx3.ops.length === 0,
    JSON.stringify({ rects: ctx3.rects.length, ops: ctx3.ops.length }));
  check('D09 the cooldown is re-armed at the moment the storm ends',
    armedCd > 0 && ranOut < 400, JSON.stringify({ armedCd, ranOut }));
}

// ── E. reset() wipes it mid-storm too ───────────────────────────────────────
{
  const g = makeGame(), rain = new AcidRain(g);
  rain._cdLeft = 0; rain._enterPhase('raining', 30);
  drive(rain, g, 6);
  rain.reset();
  const st = rain.stats();
  check('E01 reset() clears a live storm completely',
    st.phase === 'idle' && st.streaks === 0 && st.impacts === 0 && st.particles === 0 && st.puddles === 0,
    JSON.stringify(st));
  const ctx = makeCtx();
  rain.draw(ctx);
  check('E02 nothing is drawn after reset()', ctx.rects.length === 0, String(ctx.rects.length));
}

// ── F. Source invariants: the call site must be inside the camera block ─────
{
  const draw = GAME_SRC.slice(GAME_SRC.indexOf('  draw(ctx) {'));
  const iCall    = draw.indexOf('this.acidRainSystem.draw(ctx);');
  const iRestore = draw.indexOf('ctx.restore();  // end camera-space block');
  check('F01 acidRainSystem.draw is called inside the camera-space block',
    iCall > 0 && iRestore > 0 && iCall < iRestore, JSON.stringify({ iCall, iRestore }));
  check('F02 it is called exactly once',
    (GAME_SRC.match(/this\.acidRainSystem\.draw\(ctx\);/g) || []).length === 1);
}

console.log(`\n=== ACID RAIN LIFECYCLE: ${pass} PASS / ${fail} FAIL ===`);
if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
process.exit(fail ? 1 : 0);
