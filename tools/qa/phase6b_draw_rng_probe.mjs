// PHASE 6B §4b — WHO CONSUMES Math.random INSIDE draw()?
// ------------------------------------------------------------------------------------------------
// After the §5 canvas fix the kits build without a frame, but the roster still diverges by draw
// cadence. The remaining coupling candidate is the shared random stream: if draw() pulls randoms,
// every visual effect shifts the rolls that spawns, drops and crits read next, so the simulation
// depends on how many frames were painted. This counts randoms taken while inside game.draw() and
// attributes them to the enclosing Game.js method (same call-site walk as the DPS harness).
//
//   node tools/qa/phase6b_draw_rng_probe.mjs [seconds] <id>
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0; globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
const DRAW_CTX = makeCtx();
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
    if (m) return lineOwner[Number(m[1])] || '?';
    const f = st[i].match(/\/js\/(effects|entities|game)\/([A-Za-z0-9_.-]+)\.js/);
    if (f) return f[1] + ':' + f[2];
  }
  return 'unknown';
};

const args = process.argv.slice(2);
const SECONDS = Number(args[0]) > 0 ? Number(args.shift()) : 120;
const ID = args.filter(a => !a.startsWith('--'))[0] || 'oni_cataclysm_protocol';

let INSIDE_DRAW = false, drawRng = 0, updateRng = 0;
const byDraw = {};
const mul = a => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  if (INSIDE_DRAW) { drawRng++; const k = site(); byDraw[k] = (byDraw[k] || 0) + 1; } else updateRng++;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

Math.random = mul(12345); vclock = 0;
try { globalThis.localStorage.clear(); } catch (_) {}
const un = muteConsole();
const g = new Game();
g.audio = null; g.selectedCharacter = ID; g.gameState = 'playing';
g.reset(); g._enterEndless();
const p = g.player;
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
const setDir = (dx, dy, dash) => {
  input.keys.clear();
  if (dy < -0.35) input.keys.add('w'); else if (dy > 0.35) input.keys.add('s');
  if (dx < -0.35) input.keys.add('a'); else if (dx > 0.35) input.keys.add('d');
  if (dash) input.keys.add('shift');
};
for (let f = 0; f < SECONDS * 60; f++) {
  vclock += 1000 / 60;
  if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
  if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
  let vx = 0, vy = 0, nearest = Infinity, touching = 0;
  for (const e of g.enemies) {
    if (!e || e.hp <= 0 || !e.pos) continue;
    const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y, d = Math.hypot(dx, dy);
    if (d > 340 || d < 1) continue;
    vx += dx / d; vy += dy / d;
    if (d < nearest) nearest = d;
    if (d < 16 + (e.radius || 14)) touching++;
  }
  const len = Math.hypot(vx, vy) || 1;
  setDir(vx / len, vy / len, (p.dashCooldown || 0) <= 0 && (touching >= 2 || nearest < 46));
  input.mousePos = { x: p.pos.x + 400, y: p.pos.y };
  try { g.update(1 / 60, input); } catch (_) { break; }
  INSIDE_DRAW = true;
  try { g.draw(DRAW_CTX); } catch (_) {}
  INSIDE_DRAW = false;
  p.hp = p.maxHp; g.gameOver = false;
}
un();
const rows = Object.entries(byDraw).sort((a, b) => b[1] - a[1]).slice(0, 20);
const out = { id: ID, seconds: SECONDS, updateRng, drawRng,
              drawSharePct: +(100 * drawRng / (drawRng + updateRng)).toFixed(2), topDrawSites: rows };
console.error(`  ${ID}  update ${updateRng}  draw ${drawRng}  (${out.drawSharePct}% of the stream)`);
for (const [k, v] of rows.slice(0, 10)) console.error(`     ${String(v).padStart(8)}  ${k}`);
console.log(JSON.stringify(out, null, 1));
