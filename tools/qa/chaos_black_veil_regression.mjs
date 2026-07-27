// CHAOS BLACK VEIL — DECK COVERAGE REGRESSION
// ------------------------------------------------------------------------------------------------
// The defect (Maria's mayro_pepelo.mp4, in-game 00:21): a full-width BLACK rectangle with a hard
// bottom edge across roughly the top quarter of the screen, present in Chaos and gone seconds later.
//
// Mechanism: MapManager._drawCityWorld chose WHERE to paint the deck from a window centred on the
// PLAYER, while the canvas transform is ctx.translate(-camera.x, -camera.y) - centred on the CAMERA.
// _updateCamera clamps camera.y into the strip (0 .. th - viewH) while the player keeps walking in
// a taller band, so the player sits below the camera centre and the camera shows rows the tiler
// never covered. main.js calls ctx.reset() every frame, so uncovered rows are PURE BLACK.
//
// This test does not need pixels. It records the destination rectangle of every deck blit and
// asserts the union covers the camera rect, for camera/player offsets across the whole band.
// Against the pre-fix MapManager every offset beyond the 96px preload margin FAILS.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0; globalThis.performance = { now: () => vclock };
const u0 = muteConsole();
const { MapManager } = await import(pathToFileURL(path.join(ROOT, 'js/game/MapManager.js')).href);
u0();

let pass = 0, fail = 0;
const ok  = (c, m, extra = '') => { if (c) { pass++; console.log(`  PASS  ${m}`); } else { fail++; console.log(`  FAIL  ${m}${extra ? ' | ' + extra : ''}`); } };

// A recording context: every translate/scale is tracked so a blit's destination can be resolved
// into camera space, exactly as the real canvas would.
function recCtx() {
  const stack = [];
  let tx = 0, ty = 0, sx = 1, sy = 1;
  const covered = [];
  return {
    canvas: { width: 1280, height: 720 },
    imageSmoothingEnabled: true, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, font: '',
    save() { stack.push([tx, ty, sx, sy]); },
    restore() { const s = stack.pop(); if (s) { tx = s[0]; ty = s[1]; sx = s[2]; sy = s[3]; } },
    translate(x, y) { tx += x * sx; ty += y * sy; },
    scale(x, y) { sx *= x; sy *= y; },
    setTransform() {}, getTransform() { return { a: sx, b: 0, c: 0, d: sy, e: tx, f: ty }; },
    drawImage(img, ...a) {
      let dx, dy, dw, dh;
      if (a.length >= 8) { dx = a[4]; dy = a[5]; dw = a[6]; dh = a[7]; }
      else if (a.length >= 4) { dx = a[0]; dy = a[1]; dw = a[2]; dh = a[3]; }
      else return;
      const y0 = ty + dy * sy, y1 = ty + (dy + dh) * sy;
      covered.push([Math.min(y0, y1), Math.max(y0, y1)]);
    },
    fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {}, clip() {}, rect() {}, fillText() {}, strokeText() {},
    measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }), setLineDash() {}, getLineDash: () => [],
    _covered: covered, get depth() { return stack.length; },
  };
}

// the smallest gap in the deck coverage over the camera's vertical span
function topGapOverCamera(cov, camTop, camBot) {
  const ivs = cov.filter(([a, b]) => b > camTop && a < camBot).map(([a, b]) => [Math.max(a, camTop), Math.min(b, camBot)])
                 .sort((p, q) => p[0] - q[0]);
  let cursor = camTop, gap = 0;
  for (const [a, b] of ivs) { if (a > cursor) gap = Math.max(gap, a - cursor); cursor = Math.max(cursor, b); }
  if (cursor < camBot) gap = Math.max(gap, camBot - cursor);
  return gap;
}

console.log('\n=== CHAOS BLACK VEIL — the deck must cover everything the camera shows ===');
const img = { naturalWidth: 1672, naturalHeight: 440, complete: true };   // shipped Chaos deck art
const mm = new MapManager();
mm.CITY_SCALE = mm.CITY_SCALE || 3;

// camera offsets sweeping the whole documented desync range and past it, both directions
const OFFSETS = [0, 50, 96, 120, 200, 300, 334, 420, 500, -100, -200, -334, -500];
let worstGap = 0;
for (const off of OFFSETS) {
  const ctx = recCtx();
  const vs = 0.85, vw = 1280 / vs, vh = 720 / vs;
  const player = { pos: { x: 4000, y: 2000 } };
  const camera = { x: player.pos.x - vw / 2, y: player.pos.y - vh / 2 - off };   // player `off` px BELOW camera centre
  mm.game = { player, camera, _viewScale: vs, _viewW: vw, _viewH: vh };
  const un = muteConsole();
  try { mm._drawCityWorld(ctx, {}, img); } catch (e) { un(); console.log('  FAIL  _drawCityWorld threw at offset ' + off + ': ' + e.message); fail++; continue; }
  un();
  const gap = topGapOverCamera(ctx._covered, camera.y, camera.y + vh);
  worstGap = Math.max(worstGap, gap);
  ok(gap <= 0.5, `camera/player offset ${String(off).padStart(5)}px — deck covers the whole camera view`,
     `uncovered ${gap.toFixed(1)} world px = ${(100 * gap * vs / 720).toFixed(1)}% of screen height`);
  ok(ctx.depth === 0, `camera/player offset ${String(off).padStart(5)}px — save/restore balanced`, `depth ${ctx.depth}`);
}
console.log(`\n  worst uncovered band across all offsets: ${worstGap.toFixed(1)} world px`);
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
