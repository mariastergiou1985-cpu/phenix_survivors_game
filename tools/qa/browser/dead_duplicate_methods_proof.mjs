// ════════════════════════════════════════════════════════════════════════════════
// DEAD DUPLICATE CHAOS METHODS — removed, with the live versions provably untouched.
//
// Game.js defined eight methods TWICE inside `export class Game`. In a JS class body the later
// definition wins outright: the earlier one is written to the prototype and then overwritten
// before any instance exists. So the first copy of each was unreachable code that could never
// run, no matter what the game did.
//
// That made them worse than clutter. Two of the eight had genuinely DIFFERENT bodies from the
// versions that actually run — the dead _updateChaosPylons had no CHAOS DOCTRINE pylon roll and
// did not tally _chaosPulseHits, and the dead _drawChaosPylons knew none of the ten doctrine pylon
// colours. Anyone reading the file top-down would have read the wrong implementation of both and
// concluded, reasonably and wrongly, that the SILENCE contract's tally does not exist.
//
// The whole risk of this change is one thing: that a removal took the WRONG copy, or nicked the
// surviving one. So that is what the proof is built around.
//
//   S-block  SOURCE — each name is now defined exactly once, no method in class Game is defined
//            twice at all, and each survivor's text hashes to the SAME SHA-256 it had in da375af.
//            A hash is used rather than a spot-check because "byte-identical" was the brief and a
//            regex would only prove the lines I remembered to look at.
//   R-block  RUNTIME — the survivor on the prototype is the DOCTRINE-aware one, identified by
//            code only the live version ever contained.
//   B-block  BEHAVIOUR — pylons still spawn, doctrine pylons still trigger, and _chaosPulseHits
//            still tallies. This is the check that would catch "kept the wrong copy" even if the
//            hashes had been mis-transcribed.
//   D-block  a real Chaos run renders. No black screen, no console errors.
//
// Run: node tools/qa/browser/dead_duplicate_methods_proof.mjs [port]
// Writes: /tmp/dead_duplicate_methods_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/dead_duplicate_methods_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8971;
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
               '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const SRC   = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const LINES = SRC.split('\n');
const BUILD = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];
const MAIN_V = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').match(/Game\.js\?v=(\d+)/)[1];

let passN = 0, failN = 0;
const failures = [], results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}${extra ? '  ' + extra : ''}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

// The eight, and the SHA-256 of each surviving definition as it stood in da375af — the commit
// immediately before the removal. These are the contract: if a removal nicked a single character
// of a live method, its hash moves and S03 says which one.
const LIVE_SHA = {
  _drawEndlessNexusBase: '94fa2f637abe7eeec72a15c1e43c9dcd95835f03bc00fd7aab2f53fdc6992cb1',
  _updateChaosPylons:    '61a597d6feee33572ec0948369ffea4d49938d07a7312fc9791a85effc5f6b2f',
  _spawnFloatingText:    'df6c382213139b70013f21f2fcfe9ed51be3d75559c7a1d38ee6811a6b76ecfd',
  _drawChaosPylons:      '426e56f03a7cf16dde457f88bb03c8e3334d047fae5caed34dce973730717d83',
  _drawChaosDebris:      '31804b7c1b85f8f4ea235b2a3ebb822ea65da8eef798c6b92e7d5ff7175a465a',
  _drawChaosRimGlow:     '501aad361d39ea7e39c626361549b9b7891b0391760a85d7c139d06c853a7ba5',
  _drawChaosVignette:    '9642a9e33362a611cc0ad8a5b691de8a6db711c66d398c212ea33196c6dc967d',
  _drawWorldBackground:  '2a5ddc15ce3e306b9cf5b189805dddec517720cc1b4f34b620d3e6e2853018ae',
};
const NAMES = Object.keys(LIVE_SHA);

// ════════════════════════════════════════════════════════════════════════════
// S. SOURCE
// ════════════════════════════════════════════════════════════════════════════
const CLASS_GAME = LINES.findIndex(l => /^export class Game\b/.test(l));
const methodLines = new Map();
for (let i = CLASS_GAME + 1; i < LINES.length; i++) {
  const m = /^  ([_A-Za-z][A-Za-z0-9_]*)\s*\(/.exec(LINES[i]);
  if (!m) continue;
  if (/^\s*(if|for|while|switch|catch|return|function|else)\b/.test(LINES[i])) continue;
  if (!methodLines.has(m[1])) methodLines.set(m[1], []);
  methodLines.get(m[1]).push(i);
}
const endOf = (i) => { for (let j = i + 1; j < LINES.length; j++) if (LINES[j] === '  }') return j; return -1; };
const blockOf = (i) => LINES.slice(i, endOf(i) + 1).join('\n');

check('S01 every one of the eight is now defined EXACTLY ONCE in class Game',
  NAMES.every(n => (methodLines.get(n) || []).length === 1),
  JSON.stringify(NAMES.map(n => n + ':' + (methodLines.get(n) || []).length)));

// Not just the eight — nothing in class Game may be defined twice, or the next duplicate goes
// unnoticed exactly the way these eight did.
const anyDupes = [...methodLines.entries()].filter(([, v]) => v.length > 1);
check('S02 NO method in class Game is defined twice — the whole class, not only the eight',
  anyDupes.length === 0,
  JSON.stringify(anyDupes.map(([k, v]) => k + '@' + v.map(x => x + 1).join('/'))));

const hashes = {};
for (const n of NAMES) {
  const at = (methodLines.get(n) || [])[0];
  hashes[n] = at === undefined ? 'MISSING' : crypto.createHash('sha256').update(blockOf(at)).digest('hex');
}
check('S03 each survivor is BYTE-IDENTICAL to its da375af self — same SHA-256, all eight',
  NAMES.every(n => hashes[n] === LIVE_SHA[n]),
  JSON.stringify(NAMES.filter(n => hashes[n] !== LIVE_SHA[n]).map(n => n + ': ' + hashes[n])));

// The two that differed. If the WRONG copy had been kept, these markers are exactly what would be
// missing — and only these two checks would notice, because the other six pairs were identical.
const upd = blockOf((methodLines.get('_updateChaosPylons') || [])[0] ?? 0);
const drw = blockOf((methodLines.get('_drawChaosPylons') || [])[0] ?? 0);
check('S04 the surviving _updateChaosPylons is the DOCTRINE one — the roll and the SILENCE tally are both in it',
  /const doc = this\._doctrine\(\)/.test(upd) &&
  /this\._doctrineTriggerPylon\(p\)/.test(upd) &&
  /this\._chaosPulseHits = \(this\._chaosPulseHits \|\| 0\) \+ 1/.test(upd) &&
  /this\._chaosPylonsTaken/.test(upd),
  `doc=${/const doc = this\._doctrine\(\)/.test(upd)} trigger=${/_doctrineTriggerPylon/.test(upd)} pulse=${/_chaosPulseHits/.test(upd)}`);
check('S05 the surviving _drawChaosPylons is the DOCTRINE one — all ten doctrine pylon colours present',
  /this\._drawDoctrineFx\(ctx\)/.test(drw) &&
  ['fate', 'foundry', 'venom', 'proof', 'pyre', 'amp', 'frost', 'aegis', 'marrow', 'quake']
    .every(t => new RegExp("p\\.type === '" + t + "'").test(drw)),
  `fx=${/_drawDoctrineFx/.test(drw)} colours=${['fate','foundry','venom','proof','pyre','amp','frost','aegis','marrow','quake'].filter(t => new RegExp("p\\.type === '" + t + "'").test(drw)).length}/10`);

check('S06 the cache-bust chain agrees end to end',
  BUILD === IDX_V && IDX_V === MAIN_V, `${BUILD} / ${IDX_V} / ${MAIN_V}`);

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}   BUILD=${BUILD}`);

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp  = await page.context().newCDPSession(page);

const pageErrors = [], consoleErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/.test(t)) return;
  consoleErrors.push(t);
});
await page.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
  const u = r.request().url();
  if (/fonts\.googleapis/.test(u)) return r.fulfill({ status: 200, contentType: 'text/css', body: '/* offline proof */' });
  return r.abort();
});
const shot = async (n) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, n), Buffer.from(data, 'base64'));
};

await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1300);

await page.evaluate(async (build) => {
  const mod = await import(`./js/game/Game.js?v=${build}`);
  window.__Game = mod.Game;
  await new Promise((res) => {
    const orig = mod.Game.prototype.update;
    mod.Game.prototype.update = function (...a) {
      window.__g = this; mod.Game.prototype.update = orig; res(); return orig.apply(this, a);
    };
  });
}, BUILD);
check('R01 the module LOADS and a live Game instance is captured — zero page errors at boot',
  await page.evaluate(() => !!window.__g) && pageErrors.length === 0,
  pageErrors.slice(0, 3).join(' | '));

// ════════════════════════════════════════════════════════════════════════════
// R. RUNTIME — what is actually ON the prototype
// ════════════════════════════════════════════════════════════════════════════
const proto = await page.evaluate((names) => {
  const P = window.__Game.prototype;
  const out = {};
  for (const n of names) {
    const f = P[n];
    out[n] = { type: typeof f, len: typeof f === 'function' ? f.toString().length : -1 };
  }
  out.__updSrc = String(P._updateChaosPylons || '');
  out.__drwSrc = String(P._drawChaosPylons || '');
  return out;
}, NAMES);
check('R02 all eight resolve to exactly one function on the prototype',
  NAMES.every(n => proto[n].type === 'function' && proto[n].len > 0),
  JSON.stringify(NAMES.map(n => n + ':' + proto[n].type)));
check('R03 the function the ENGINE will call is the doctrine-aware _updateChaosPylons',
  /_doctrineTriggerPylon/.test(proto.__updSrc) && /_chaosPulseHits/.test(proto.__updSrc) &&
  /this\._doctrine\(\)/.test(proto.__updSrc),
  `len=${proto.__updSrc.length}`);
check('R04 the function the ENGINE will call is the doctrine-aware _drawChaosPylons',
  /_drawDoctrineFx/.test(proto.__drwSrc) && /'foundry'/.test(proto.__drwSrc),
  `len=${proto.__drwSrc.length}`);

// ════════════════════════════════════════════════════════════════════════════
// B. BEHAVIOUR
// ════════════════════════════════════════════════════════════════════════════
await page.evaluate(() => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      if (g.player) g.player.hp = g.player.maxHp;
      try { g.update(1 / 60, window.__IN); } catch (_) {}
    }
  };
  window.__ctx = () => (document.querySelector('canvas#game') ||
    [...document.querySelectorAll('canvas')].find(x => x.width > 400)).getContext('2d');
  window.__chaos = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = null;
    g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
    try { g._beginChaosRun(); } catch (_) {}
    window.__step(20);
  };
  try { g._hideCharSelectOverlay?.(); } catch (_) {}
  try { g._hideMenuOverlay?.(); } catch (_) {}
  for (const sel of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel']) {
    const n = document.querySelector(sel); if (n) n.remove();
  }
});

// Pylons are built through the SHIPPED spawner and then retyped, never hand-rolled. My first
// attempt at this block invented `{x, y, r, active, alive}` and the real shape is
// `{pos: Vec2, type, life, maxLife, radius, triggered}` — the run threw inside Vec2.distanceTo
// and three checks "failed" against code that was fine. That was my bug, not the game's, and the
// lesson is the general one: let the code under test construct its own objects.
await page.evaluate(() => {
  const g = window.__g;
  window.__mkPylon = (type, onPlayer) => {
    g._chaosPylons = [];
    g._chaosPylonCd = 0;
    window.__step(2);                      // the shipped spawner fills _chaosPylons for us
    const p = (g._chaosPylons || [])[0];
    if (!p) return null;
    g._chaosPylons = [p];
    p.type = type; p.triggered = false; p.life = 6.0;
    if (onPlayer) { p.pos.x = g.player.pos.x; p.pos.y = g.player.pos.y; }
    else          { p.pos.x = g.player.pos.x + 400; p.pos.y = g.player.pos.y; }
    return { type: p.type, pos: { x: p.pos.x, y: p.pos.y } };
  };
});

const spawn = await page.evaluate(() => {
  const g = window.__g;
  window.__chaos();
  g._chaosPylons = [];
  g._chaosPylonCd = 0;
  window.__step(60 * 30);                        // let the shipped spawner run for 30 s
  return { n: (g._chaosPylons || []).length, sample: (g._chaosPylons || [])[0]
    ? { type: g._chaosPylons[0].type, hasPos: typeof g._chaosPylons[0].pos?.x === 'number',
        radius: g._chaosPylons[0].radius } : null };
});
check('B01 pylons still spawn under the surviving updater, in the shipped shape',
  spawn.n > 0 && spawn.sample?.hasPos === true && spawn.sample?.radius === 28,
  JSON.stringify(spawn));

const tally = await page.evaluate(() => {
  const g = window.__g;
  window.__chaos();
  g._chaosPulseHits = 0; g._chaosPylonsTaken = 0;
  // A DANGER pylon, sitting on the player and walked into. The tally lives in the surviving
  // updater; the dead copy did not have it, so a wrong keep shows up here as a flat zero.
  const d = window.__mkPylon('danger', true);
  window.__step(6);
  const afterDanger = { pulse: g._chaosPulseHits || 0, taken: g._chaosPylonsTaken || 0 };
  const h = window.__mkPylon('heal', true);
  window.__step(6);
  return { made: !!d && !!h, afterDanger, afterBuff: { pulse: g._chaosPulseHits || 0, taken: g._chaosPylonsTaken || 0 } };
});
check('B02 a DANGER pylon still tallies _chaosPulseHits — the counter the dead copy never had',
  tally.made && tally.afterDanger.pulse > 0, JSON.stringify(tally.afterDanger));
check('B03 a BUFF pylon still tallies _chaosPylonsTaken, and the two counters stay separate',
  tally.afterBuff.taken > tally.afterDanger.taken && tally.afterBuff.pulse === tally.afterDanger.pulse,
  JSON.stringify(tally));

const doctrine = await page.evaluate(() => {
  const g = window.__g;
  window.__chaos();
  let err = null, drew = false;
  // Force one doctrine-typed pylon and draw it. The dead draw copy knew none of these types and
  // would have fallen through to the default colour rather than throwing, so this check is paired
  // with S05: together they say the drawn pylon is the doctrine one.
  const made = window.__mkPylon('foundry', false);
  try { g._drawChaosPylons(window.__ctx()); drew = true; } catch (e) { err = String(e); }
  return { made: !!made, drew, err, hasFx: typeof g._drawDoctrineFx === 'function' };
});
check('B04 a doctrine-typed pylon draws through the surviving draw without throwing',
  doctrine.made && doctrine.drew === true && doctrine.err === null && doctrine.hasFx === true,
  JSON.stringify(doctrine));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
const draw = await page.evaluate(() => {
  const g = window.__g;
  window.__chaos();
  g.gameState = 'playing'; g.gameOver = false; g.victory = false;
  window.__step(45);
  let err = null;
  try { g.draw(window.__ctx()); } catch (e) { err = String(e); }
  const ctx = window.__ctx();
  const { width: w, height: h } = ctx.canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, max = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += v; if (v > max) max = v;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  const n = Math.floor(d.length / (4 * 97));
  return { mean: sum / n, max, colors: colors.size, err, state: g.gameState };
});
await shot('chaos_run.png');
check('D01 a real Chaos run renders — no black screen',
  draw.err === null && draw.state === 'playing' &&
  draw.mean > 3 && draw.max > 40 && draw.colors > 30, JSON.stringify(draw));
check('D02 zero page errors across the whole session',
  pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D03 zero console errors across the whole session',
  consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); }
fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, failures }, null, 2));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
