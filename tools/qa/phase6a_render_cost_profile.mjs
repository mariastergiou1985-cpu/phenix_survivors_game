// PHASE 6A-R — HEADLESS RENDER-COST PROFILE (source-level RCA for the Chaos fill-rate P1)
// ------------------------------------------------------------------------------------------------
// The rendered-browser gate is blocked (the game window cannot be raised above another Chrome
// window from this session, so every tab reports visibilityState "hidden" and rAF is frozen).
// Fill-rate cost, however, does not have to be timed to be located: it is produced by DRAW
// OPERATIONS covering PIXELS, and both are countable exactly in a headless run.
//
// This replaces the real 2D context with a counting context that records, per CALL SITE:
//   - fill / stroke / drawImage / fillText operations
//   - shadowBlur assignments and their values
//   - globalCompositeOperation and globalAlpha assignments
//   - gradient and Path2D creation
//   - save/restore balance
//   - COVERED PIXEL AREA, estimated from the geometry of each operation
//   - BLUR-EXPANDED AREA, because a shadowBlur of b grows the rasterised footprint of a shape of
//     radius r to roughly (r + 2b)^2 / r^2 times its area - this is where fill-rate is actually
//     spent.
//
// Call sites are resolved the same way Phase 6A resolved damage: walk the stack for the first
// Game.js frame and map the line to its enclosing method.
//
//   node tools/qa/phase6a_render_cost_profile.mjs [frames] [chaos|endless] [character]
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

// REAL IMAGE DIMENSIONS. headless-env's Image stub reports a flat 64x64 for every asset, which
// silently rewrites every tiling calculation in MapManager: CITY_SCALE 3 turns a 1672x440 strip
// into a 192x192 tile, so the mirror loop runs ten times horizontally and a hundred deck bands
// appear where the shipped art produces one or two draws. The first pass of this profile reported
// MapManager at 74% of all covered pixels for exactly that reason - an instrument artifact, not a
// production cost. PNG/JPEG headers are read straight off disk so the geometry matches the build.
const _dimCache = new Map();
function realDims(src) {
  const rel = String(src || '').replace(/^\.?\//, '').split('?')[0];
  if (!rel) return null;
  if (_dimCache.has(rel)) return _dimCache.get(rel);
  let out = null;
  try {
    const buf = readFileSync(path.join(ROOT, rel));
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {           // PNG
      out = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    } else if (buf[0] === 0xFF && buf[1] === 0xD8) {                        // JPEG
      let o = 2;
      while (o < buf.length - 9) {
        if (buf[o] !== 0xFF) { o++; continue; }
        const m = buf[o + 1];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          out = { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) }; break;
        }
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
  } catch (_) { out = null; }
  _dimCache.set(rel, out);
  return out;
}
let _missing = 0, _resolved = 0;
globalThis.Image = class {
  constructor() { this.complete = true; this._src = ''; this.naturalWidth = 64; this.naturalHeight = 64; this.width = 64; this.height = 64; }
  set src(v) {
    this._src = v;
    const d = realDims(v);
    if (d) { this.naturalWidth = this.width = d.w; this.naturalHeight = this.height = d.h; _resolved++; }
    else { _missing++; }
  }
  get src() { return this._src; }
  addEventListener() {}
  set onerror(_) {} set onload(_) {}
};
globalThis.__imgStats = () => ({ resolved: _resolved, missing: _missing });

const ownerMap = src => {
  const lines = src.split('\n'); const own = new Array(lines.length + 1); let cur = '?';
  for (let i = 0; i < lines.length; i++) { const m = lines[i].match(/^  ([A-Za-z_][\w]*)\s*\(/); if (m) cur = m[1]; own[i + 1] = cur; }
  return own;
};
const GAME_SRC = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const lineOwner = ownerMap(GAME_SRC);
// MapManager is resolved to method level too: the first pass showed it carrying 74% of all
// covered pixels, so "MapManager" as a single bucket is not actionable.
const MAP_SRC = readFileSync(path.join(ROOT, 'js/game/MapManager.js'), 'utf8');
const mapOwner = ownerMap(MAP_SRC);
let SITES_ON = false;
const site = () => {
  if (!SITES_ON) return 'off';
  const st = (new Error().stack || '').split('\n');
  for (let i = 2; i < st.length; i++) {
    const mm = st[i].match(/MapManager\.js[^:]*:(\d+):/);
    if (mm) return 'Map.' + (mapOwner[Number(mm[1])] || '?') + ':' + mm[1];
    const m = st[i].match(/Game\.js[^:]*:(\d+):/);
    if (m) return lineOwner[Number(m[1])] || '?';
    const f = st[i].match(/\/js\/(?:game|entities|effects)\/([A-Za-z0-9_]+)\.js/);
    if (f) return f[1];
  }
  return 'unknown';
};

// ── counting 2D context ────────────────────────────────────────────────────────────────────────
const W = 1280, H = 720;
function makeCountingCtx(stats) {
  const s = { blur: 0, alpha: 1, comp: 'source-over' };
  const stack = [];
  let pathArea = 0, pathMaxR = 0;
  const rec = (kind, area, radius) => {
    const key = site();
    const e = (stats.bySite[key] ||= { ops: 0, area: 0, blurArea: 0, blurOps: 0, additiveOps: 0, maxBlur: 0 });
    e.ops++; stats.ops++;
    const a = Math.max(0, Math.min(area || 0, W * H * 4));
    e.area += a; stats.area += a;
    if (s.blur > 0) {
      const r = Math.max(4, radius || Math.sqrt(a / Math.PI) || 4);
      const grow = Math.pow((r + 2 * s.blur) / r, 2);
      const ba = Math.min(a * grow, W * H * 6);
      e.blurArea += ba; stats.blurArea += ba; e.blurOps++; stats.blurOps++;
      e.maxBlur = Math.max(e.maxBlur, s.blur);
    } else { e.blurArea += a; stats.blurArea += a; }
    if (s.comp === 'lighter' || s.comp === 'screen') { e.additiveOps++; stats.additiveOps++; }
    void kind;
  };
  const ctx = {
    canvas: { width: W, height: H },
    get globalAlpha() { return s.alpha; }, set globalAlpha(v) { s.alpha = v; stats.alphaSets++; },
    get shadowBlur() { return s.blur; },
    set shadowBlur(v) { s.blur = Number(v) || 0; if (s.blur > 0) { stats.blurSets++; const k = site(); (stats.blurBySite[k] ||= { sets: 0, max: 0 }); stats.blurBySite[k].sets++; stats.blurBySite[k].max = Math.max(stats.blurBySite[k].max, s.blur); } },
    get globalCompositeOperation() { return s.comp; },
    set globalCompositeOperation(v) { s.comp = v; stats.compSets++; if (v === 'lighter' || v === 'screen') stats.additiveSets++; },
    shadowColor: '', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    lineCap: '', lineJoin: '', lineDashOffset: 0, filter: 'none', imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
    save() { stack.push(1); stats.saves++; stats.maxDepth = Math.max(stats.maxDepth, stack.length); },
    restore() { if (stack.length) { stack.pop(); stats.restores++; } else stats.unbalancedRestores++; },
    beginPath() { pathArea = 0; pathMaxR = 0; }, closePath() {},
    moveTo() {}, lineTo() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, setLineDash() {},
    arc(x, y, r) { pathArea += Math.PI * r * r; pathMaxR = Math.max(pathMaxR, r); },
    ellipse(x, y, rx, ry) { pathArea += Math.PI * rx * ry; pathMaxR = Math.max(pathMaxR, Math.max(rx, ry)); },
    rect(x, y, w, h) { pathArea += Math.abs(w * h); pathMaxR = Math.max(pathMaxR, Math.max(Math.abs(w), Math.abs(h)) / 2); },
    roundRect(x, y, w, h) { pathArea += Math.abs(w * h); pathMaxR = Math.max(pathMaxR, Math.max(Math.abs(w), Math.abs(h)) / 2); },
    fill() { rec('fill', pathArea, pathMaxR); }, stroke() { rec('stroke', pathArea * 0.25, pathMaxR); },
    clip() { stats.clips++; },
    fillRect(x, y, w, h) { rec('fillRect', Math.abs(w * h), Math.max(Math.abs(w), Math.abs(h)) / 2); },
    strokeRect(x, y, w, h) { rec('strokeRect', Math.abs(w * h) * 0.2, Math.max(Math.abs(w), Math.abs(h)) / 2); },
    clearRect() {},
    drawImage(img, a, b, c, d, e, f, g, h2) {
      const dw = arguments.length >= 9 ? g : (arguments.length >= 5 ? c : (img && img.naturalWidth) || 64);
      const dh = arguments.length >= 9 ? h2 : (arguments.length >= 5 ? d : (img && img.naturalHeight) || 64);
      rec('drawImage', Math.abs(dw * dh), Math.max(Math.abs(dw), Math.abs(dh)) / 2);
    },
    fillText(t) { rec('fillText', (String(t).length * 10) * 16, 16); stats.textOps++; },
    strokeText(t) { rec('strokeText', (String(t).length * 10) * 16 * 0.3, 16); stats.textOps++; },
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    translate() {}, scale() {}, rotate() {}, setTransform() {}, resetTransform() {}, transform() {},
    createRadialGradient() { stats.gradients++; const k = site(); stats.gradBySite[k] = (stats.gradBySite[k] || 0) + 1; return { addColorStop() {} }; },
    createLinearGradient() { stats.gradients++; const k = site(); stats.gradBySite[k] = (stats.gradBySite[k] || 0) + 1; return { addColorStop() {} }; },
    createPattern: () => null, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {},
    isPointInPath: () => false, drawFocusIfNeeded() {},
  };
  ctx._depth = () => stack.length;
  return ctx;
}
const newStats = () => ({ ops: 0, area: 0, blurArea: 0, blurOps: 0, additiveOps: 0, additiveSets: 0,
  blurSets: 0, alphaSets: 0, compSets: 0, gradients: 0, clips: 0, saves: 0, restores: 0,
  unbalancedRestores: 0, maxDepth: 0, textOps: 0, bySite: {}, blurBySite: {}, gradBySite: {} });

let vclock = 0; globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
u0();

const FRAMES = Number(process.argv[2] || 120);
const MODE   = process.argv[3] || 'chaos';
const CHAR   = process.argv[4] || 'euclid_vector';
const WARM   = MODE === 'chaos' ? 115 : 115;

Math.random = mul(12345); vclock = 0;
try { globalThis.localStorage.clear(); } catch (_) {}
const un = muteConsole();
const g = new Game();
g.audio = null; g.selectedCharacter = CHAR; g.gameState = 'playing';
if (MODE === 'chaos') { g.reset(); g._beginChaosRun(); } else { g.reset(); g._enterEndless(); }
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
for (let f = 0; f < WARM * 60; f++) {
  vclock += 1000 / 60;
  if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
  if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
  try { g.update(1 / 60, input); } catch (_) { break; }
  g.player.hp = g.player.maxHp; g.gameOver = false;
}
const fp = { enemies: g.enemies.length, titan: !!g.titanBoss, annihilator: !!g.annihilatorBoss,
  projectiles: (g.projectiles || []).length, enemyBullets: (g.enemyBullets || []).length,
  particles: (g.particles?.list || g.particles || []).length || 0,
  rockets: (g.airstrikeRockets || []).length, lightning: (g.lightningZones || []).length,
  trails: (g.bossTrails || []).length, floatingTexts: (g.floatingTexts || []).length,
  time: +g.timeAlive.toFixed(0) };

const stats = newStats();
const ctx = makeCountingCtx(stats);
SITES_ON = true;
for (let f = 0; f < FRAMES; f++) { try { g.draw(ctx); } catch (_) {} }
SITES_ON = false;
un();

const per = v => +(v / FRAMES).toFixed(1);
const rows = Object.entries(stats.bySite).sort((a, b) => b[1].blurArea - a[1].blurArea).slice(0, 16);
console.log(`═══ RENDER COST PROFILE — ${MODE.toUpperCase()} / ${CHAR} ═══`);
console.log('fingerprint: ' + JSON.stringify(fp));
console.log('image dims resolved from disk: ' + JSON.stringify(globalThis.__imgStats()));
console.log(`frames profiled: ${FRAMES}   canvas ${W}x${H}   screen area ${(W * H / 1e6).toFixed(2)} Mpx`);
console.log('');
console.log(`draw ops/frame            ${per(stats.ops)}`);
console.log(`raw covered px/frame      ${(per(stats.area) / 1e6).toFixed(2)} Mpx   = ${(stats.area / FRAMES / (W * H)).toFixed(1)}x the screen`);
console.log(`BLUR-EXPANDED px/frame    ${(per(stats.blurArea) / 1e6).toFixed(2)} Mpx   = ${(stats.blurArea / FRAMES / (W * H)).toFixed(1)}x the screen`);
console.log(`ops drawn WITH shadowBlur ${per(stats.blurOps)} of ${per(stats.ops)}`);
console.log(`shadowBlur assignments    ${per(stats.blurSets)}/frame`);
console.log(`additive (lighter) ops    ${per(stats.additiveOps)}/frame   composite sets ${per(stats.compSets)}/frame`);
console.log(`gradients created         ${per(stats.gradients)}/frame`);
console.log(`text ops                  ${per(stats.textOps)}/frame`);
console.log(`save/restore              ${per(stats.saves)} / ${per(stats.restores)}   unbalanced restores ${stats.unbalancedRestores}   max depth ${stats.maxDepth}   clips ${per(stats.clips)}`);
console.log('');
console.log('── cost by call site (ranked by blur-expanded pixels per frame) ──');
console.log('  site'.padEnd(34) + 'ops/f'.padStart(8) + 'raw Mpx/f'.padStart(11) + 'blurMpx/f'.padStart(11) + '% of blur'.padStart(11) + 'maxBlur'.padStart(9) + 'addOps/f'.padStart(10));
for (const [k, v] of rows) {
  console.log('  ' + k.padEnd(32) + String(per(v.ops)).padStart(8) + (per(v.area) / 1e6).toFixed(2).padStart(11) +
    (per(v.blurArea) / 1e6).toFixed(2).padStart(11) + (100 * v.blurArea / (stats.blurArea || 1)).toFixed(1).padStart(11) +
    String(v.maxBlur).padStart(9) + String(per(v.additiveOps)).padStart(10));
}
console.log('');
console.log('── shadowBlur assignment hot spots ──');
Object.entries(stats.blurBySite).sort((a, b) => b[1].sets - a[1].sets).slice(0, 8)
  .forEach(([k, v]) => console.log(`  ${k.padEnd(32)} ${per(v.sets).toFixed(1).padStart(7)}/frame   max blur ${v.max}`));
