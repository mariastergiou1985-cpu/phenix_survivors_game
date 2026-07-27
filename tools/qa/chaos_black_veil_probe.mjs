// CHAOS BLACK VEIL — WHO PAINTS THE BIG DARK RECTANGLE?
// ------------------------------------------------------------------------------------------------
// Maria filmed a large dark rectangle covering roughly the top 20-25% of gameplay during the
// Chaos announcements (REACTOR PLASMA / ANNIHILATOR OVERRIDE / PHASE 3 - FINAL OVERRIDE).
// Source reading alone cannot answer this: Game.js has 38 full-canvas fillRect calls. So record
// every fill the frame actually performs, with its rectangle, its colour, its effective alpha and
// its Game.js call site, and keep the ones that are BOTH large AND dark.
//
//   node tools/qa/chaos_black_veil_probe.mjs [seconds]
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0; globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
u0();

const GAME_SRC = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const lineOwner = (() => {
  const lines = GAME_SRC.split('\n'); const own = new Array(lines.length + 1); let cur = '?';
  for (let i = 0; i < lines.length; i++) { const m = lines[i].match(/^  ([A-Za-z_][\w]*)\s*\(/); if (m) cur = m[1]; own[i + 1] = cur; }
  return own;
})();
const site = () => {
  const st = (new Error().stack || '').split('\n');
  for (let i = 2; i < st.length; i++) {
    const m = st[i].match(/Game\.js[^:]*:(\d+):/);
    if (m) return (lineOwner[Number(m[1])] || '?') + '@' + m[1];
    const f = st[i].match(/\/js\/(effects|game|entities)\/([A-Za-z0-9_.-]+)\.js[^:]*:(\d+):/);
    if (f) return f[1] + ':' + f[2] + '@' + f[3];
  }
  return 'unknown';
};

const W = 1280, H = 720, AREA = W * H;
// luminance of a css colour string, 0..1, plus its own alpha channel
function parseColor(c) {
  if (typeof c !== 'string') return { lum: 1, a: 1 };
  let m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\)/);
  if (m) return { lum: (+m[1] * 0.299 + +m[2] * 0.587 + +m[3] * 0.114) / 255, a: m[4] === undefined ? 1 : +m[4] };
  m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return { lum: (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255, a: 1 }; }
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) { const n = parseInt(m[1], 16); return { lum: ((((n >> 8) & 15) * 17) * 0.299 + (((n >> 4) & 15) * 17) * 0.587 + ((n & 15) * 17) * 0.114) / 255, a: 1 }; }
  return { lum: 1, a: 1 };   // gradients / patterns: not a flat dark fill, ignore
}

const ctx = makeCtx();
ctx.canvas = { width: W, height: H };
const hits = new Map();      // site -> {n, maxArea, rect, color, alpha, firstT, lastT}
let RECORD = false, TNOW = 0;
const origFillRect = ctx.fillRect;
ctx.fillRect = function (x, y, w, h) {
  if (RECORD && isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h)) {
    const area = Math.abs(w * h);
    if (area >= AREA * 0.08) {
      const { lum, a } = parseColor(this.fillStyle);
      const eff = a * (typeof this.globalAlpha === 'number' ? this.globalAlpha : 1);
      if (lum < 0.25 && eff >= 0.15) {
        const k = site();
        const e = hits.get(k) || { n: 0, maxArea: 0, rect: null, color: null, alpha: 0, firstT: TNOW, lastT: TNOW };
        e.n++; e.lastT = TNOW;
        if (area > e.maxArea) { e.maxArea = area; e.rect = [Math.round(x), Math.round(y), Math.round(w), Math.round(h)]; e.color = String(this.fillStyle); }
        e.alpha = Math.max(e.alpha, +eff.toFixed(3));
        hits.set(k, e);
      }
    }
  }
  return origFillRect.apply(this, arguments);
};

const SECONDS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 200;
Math.random = mul(12345); vclock = 0;
try { globalThis.localStorage.clear(); } catch (_) {}
const un = muteConsole();
const g = new Game();
g.audio = null; g.selectedCharacter = 'oni_cataclysm_protocol'; g.gameState = 'playing';
g.reset(); g._enterEndless();
g.forceChaos = true;                     // the 21:00 gate, taken immediately
const p = g.player;
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
const seen = [];                          // announcement timeline
// ART-vs-CAMERA COVERAGE. MapManager._drawCityWorld builds its tiling window from p.pos, but the
// readability dim (and the camera transform) use camera.y. Any vertical offset between them is a
// strip of screen the tiler never covers and the dim still paints. Measure it every frame.
const bands = [];
let lastAnn = null;
RECORD = true;
for (let f = 0; f < SECONDS * 60; f++) {
  vclock += 1000 / 60; TNOW = +(f / 60).toFixed(2);
  if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
  if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
  input.keys.clear(); input.keys.add(f % 240 < 120 ? 'd' : 'a');
  input.mousePos = { x: p.pos.x + 400, y: p.pos.y };
  try { g.update(1 / 60, input); } catch (_) { break; }
  {
    const vs = g._viewScale || 1, vh = 720 / vs, M = 96;
    const artTop = p.pos.y - vh / 2 - M, artBot = p.pos.y + vh / 2 + M;
    const camTop = g.camera.y,           camBot = g.camera.y + vh;
    const topGapWorld = Math.max(0, artTop - camTop);      // camera shows this much ABOVE the art
    const botGapWorld = Math.max(0, camBot - artBot);
    bands.push({ t: TNOW, camY: +g.camera.y.toFixed(1), playerY: +p.pos.y.toFixed(1),
                 topGapPx: +(topGapWorld * vs).toFixed(1), botGapPx: +(botGapWorld * vs).toFixed(1),
                 topGapPctOfScreen: +(100 * topGapWorld * vs / 720).toFixed(1) });
  }
  const annText = g.announcement?.text ?? null;
  if (annText !== lastAnn) { seen.push({ t: TNOW, text: annText, phase: g.announcement?.phase ?? null }); lastAnn = annText; }
  try { g.draw(ctx); } catch (_) {}
  p.hp = p.maxHp; g.gameOver = false;
}
RECORD = false;
un();
const rows = [...hits.entries()].sort((a, b) => b[1].maxArea - a[1].maxArea).map(([k, v]) => ({
  site: k, frames: v.n, rect: v.rect, pctOfCanvas: +(100 * v.maxArea / AREA).toFixed(1),
  color: v.color, maxEffectiveAlpha: v.alpha, firstSeenSec: v.firstT, lastSeenSec: v.lastT,
}));
console.error('=== LARGE DARK FILLS (>=8% of canvas, luminance <0.25, effective alpha >=0.15) ===');
for (const r of rows) console.error(`  ${String(r.pctOfCanvas).padStart(5)}%  a=${String(r.maxEffectiveAlpha).padEnd(5)} frames=${String(r.frames).padStart(6)}  rect=${JSON.stringify(r.rect).padEnd(22)} ${r.color.padEnd(22)} ${r.site}`);
console.error('=== ANNOUNCEMENT TIMELINE ===');
for (const s of seen.filter(s => s.text)) console.error(`  t=${s.t}s  ${s.text}`);
const withGap = bands.filter(b => b.topGapPx > 1 || b.botGapPx > 1);
const q = (a, f, p) => a.length ? +a.map(f).sort((x, y) => x - y)[Math.floor(p * (a.length - 1))].toFixed(1) : 0;
const gapSummary = {
  framesTotal: bands.length, framesWithUncoveredBand: withGap.length,
  pctOfFrames: +(100 * withGap.length / (bands.length || 1)).toFixed(1),
  topGapPx_p50: q(withGap, b => b.topGapPx, 0.5), topGapPx_p90: q(withGap, b => b.topGapPx, 0.9),
  topGapPx_max: withGap.length ? Math.max(...withGap.map(b => b.topGapPx)) : 0,
  topGapPctOfScreen_max: withGap.length ? Math.max(...withGap.map(b => b.topGapPctOfScreen)) : 0,
  botGapPx_max: withGap.length ? Math.max(...withGap.map(b => b.botGapPx)) : 0,
};
console.error('=== UNCOVERED BAND (camera shows what the tiler never draws) ===');
console.error('  ' + JSON.stringify(gapSummary));
console.log(JSON.stringify({ rows, announcements: seen, gapSummary }, null, 1));
