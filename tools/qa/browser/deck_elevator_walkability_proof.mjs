// ════════════════════════════════════════════════════════════════════════════════
// ENDLESS / CHAOS ELEVATOR — arrival position and deck walkability regression.
//
// THE DEFECT, measured on the shipped masks before the fix. deckAnchorWorld() picks the spot
// the elevator puts the player down on a section deck. It scanned inward from the deck corner
// and accepted the FIRST cell with two clear cells in every direction — 48 world px — so the
// cell it returned was, by construction, the most cramped legal one on the deck. Free run from
// the arrival cell in each direction:
//
//   endless/lower   UP 48   DOWN 48   LEFT 144  RIGHT 48     <- a 192 x 96 px alcove
//   chaos/upper     UP 96   DOWN 48   LEFT 48   RIGHT 1320
//   chaos/lower     UP 72   DOWN 600  LEFT 1008 RIGHT 48
//   endless/upper   UP 336  DOWN 48   LEFT 336  RIGHT 768
//
// The player is ~32 px across. On endless/lower that is a pocket three body-widths wide with
// the deck edge on three sides — invisible walls, no free movement, exactly as reported.
//
// DeckMasks.js already documented the intended clearance: ">=120 world px of slack around a
// 32px player". At 24 px per cell that is FIVE cells, not two. The fix implements the number
// the data file always specified; the scan still starts at the same corner, so each deck's
// elevator still arrives from the side its route comes from.
//
// This proof measures the REAL mapManager on the REAL masks, and drives the REAL _enterDeck()
// transition — it does not re-implement the search.
//
// Run: node tools/qa/browser/deck_elevator_walkability_proof.mjs [port]
// Writes: /tmp/deck_elevator_proof/report.json
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/deck_elevator_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8977;
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

const BUILD = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];

let passN = 0, failN = 0;
const failures = [], results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}${extra ? '  ' + extra : ''}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;
console.log(`serving ${ROOT} on ${BASE}   BUILD=${BUILD}`);

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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

await page.goto(BASE + '/index.html?nosw=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1400);

check('A00 sw.js BUILD equals index.html main.js ?v=', BUILD === IDX_V, `${BUILD} vs ${IDX_V}`);
await page.evaluate(async (build) => {
  const mod = await import(`./js/game/Game.js?v=${build}`);
  await new Promise((res) => {
    const orig = mod.Game.prototype.update;
    mod.Game.prototype.update = function (...a) {
      window.__g = this; mod.Game.prototype.update = orig; res(); return orig.apply(this, a);
    };
  });
}, BUILD);
check('A01 live Game instance captured on the shipped ?v=', await page.evaluate(() => !!window.__g));
await page.evaluate(() => { window.__g.meta._save = () => {}; });

// Wait for the deck art — every mask model needs the main strip image before deckBounds resolves.
const ready = await page.evaluate(async () => {
  const g = window.__g, mm = g.mapManager;
  for (let i = 0; i < 120; i++) {
    if (mm.deckBounds && mm.deckBounds('endless', 'lower') && mm.deckBounds('chaos', 'lower')) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
});
check('A02 the deck geometry resolves (map art loaded)', ready);

// ════════════════════════════════════════════════════════════════════════════
// B. THE ARRIVAL POCKET — measured on the real masks, in every direction
// ════════════════════════════════════════════════════════════════════════════
const anchors = await page.evaluate(() => {
  const mm = window.__g.mapManager;
  const out = {};
  for (const mode of ['endless', 'chaos']) {
    for (const section of ['upper', 'lower']) {
      const a = mm.deckAnchorWorld(mode, section);
      const meta = (mm.deckAnchorMeta() || {})[mode + ':' + section] || {};
      const key = mode + ':' + section;
      if (!a) { out[key] = null; continue; }
      // Free run in world px from the arrival point, stepping the REAL walkability model with a
      // real player footprint — not the mask, and not a re-implementation of the search.
      const R = 18, STEP = 12;
      const run = (dx, dy) => {
        let n = 0;
        for (; n < 400; n++) {
          const x = a.x + dx * STEP * (n + 1), y = a.y + dy * STEP * (n + 1);
          if (!mm.isWalkableFootprint(x, y, R, key)) break;
        }
        return n * STEP;
      };
      out[key] = {
        x: Math.round(a.x), y: Math.round(a.y), cell: meta.cell, corner: meta.corner,
        fallback: !!meta.fallback, clearCells: meta.clearCells ?? null, clearPx: meta.clearPx ?? null,
        standable: mm.isWalkableFootprint(a.x, a.y, R, key),
        up: run(0, -1), down: run(0, 1), left: run(-1, 0), right: run(1, 0),
        upLeft: run(-0.7071, -0.7071), downRight: run(0.7071, 0.7071),
      };
    }
  }
  return out;
});

const MIN_PX = 120;   // the clearance DeckMasks.js documents: >=120 world px around a 32px player
// The free run below is measured by walking a radius-18 FOOTPRINT outward, so it stops about one
// radius before the edge of the guaranteed clear block, and the 12 px probe step truncates further.
// Asserting the full 120 px here would be asking the footprint to cover its own radius twice. The
// contract this checks is the usable one: at least four body-widths of real travel in every
// direction. B06 asserts the raw 120 px clearance guarantee separately.
const MIN_RUN = 96;
for (const key of ['endless:lower', 'endless:upper', 'chaos:lower', 'chaos:upper']) {
  const a = anchors[key];
  const id = { 'endless:lower': 'B01', 'endless:upper': 'B02', 'chaos:lower': 'B03', 'chaos:upper': 'B04' }[key];
  check(`${id} ${key}: the elevator arrival is standable and open in ALL four directions`,
    !!a && a.standable && a.up >= MIN_RUN && a.down >= MIN_RUN && a.left >= MIN_RUN && a.right >= MIN_RUN,
    a ? `U${a.up} D${a.down} L${a.left} R${a.right} (diag ${a.upLeft}/${a.downRight}) cell ${JSON.stringify(a.cell)} clear ${a.clearPx}px` : 'no anchor');
}
check('B05 every deck resolves a real arrival cell, none falls back to the baked anchor',
  Object.values(anchors).every(a => a && a.fallback === false),
  JSON.stringify(Object.fromEntries(Object.entries(anchors).map(([k, v]) => [k, v && v.fallback]))));
check('B06 every deck meets the documented >=120px clearance',
  Object.values(anchors).every(a => a && a.clearPx >= MIN_PX),
  JSON.stringify(Object.fromEntries(Object.entries(anchors).map(([k, v]) => [k, v && v.clearPx]))));
check('B07 each elevator still arrives from its own corner — the route geography is unchanged',
  anchors['endless:lower'].corner === 'top-right' && anchors['chaos:lower'].corner === 'top-right' &&
  anchors['endless:upper'].corner === 'bottom-left' && anchors['chaos:upper'].corner === 'bottom-left',
  Object.entries(anchors).map(([k, v]) => `${k}:${v.corner}`).join(' '));

// ════════════════════════════════════════════════════════════════════════════
// C. THE REAL TRANSITION — take the elevator down and try to walk
// ════════════════════════════════════════════════════════════════════════════
const ride = await page.evaluate(async () => {
  const g = window.__g;
  g.selectedCharacter = g.selectedCharacter || 'skeleton_warrior';
  g.reset();
  g.gameState = 'playing';
  g.endless = true;                       // Endless is the mode the elevator belongs to
  if (typeof g._enterEndless === 'function') { try { g._enterEndless(); } catch (_) {} }
  g.endless = true;
  const before = { deck: g._deck || 'main', mode: g._walkMode(), pos: { x: g.player.pos.x, y: g.player.pos.y } };

  const ok = g._enterDeck('lower', { force: true });
  const after = { deck: g._deck || 'main', mode: g._walkMode(), pos: { x: g.player.pos.x, y: g.player.pos.y } };

  // Walk the player with the REAL move resolver, 8 directions, 40 steps of 8 px each.
  const R = 18, STEP = 8, N = 40;
  const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
                 upLeft: [-0.7071, -0.7071], upRight: [0.7071, -0.7071],
                 downLeft: [-0.7071, 0.7071], downRight: [0.7071, 0.7071] };
  const walked = {};
  const home = { x: g.player.pos.x, y: g.player.pos.y };
  for (const [name, [dx, dy]] of Object.entries(dirs)) {
    g.player.pos.x = home.x; g.player.pos.y = home.y;
    let moved = 0;
    for (let i = 0; i < N; i++) {
      const fx = g.player.pos.x, fy = g.player.pos.y;
      const r = g.resolveWalkableMove(fx, fy, fx + dx * STEP, fy + dy * STEP, R);
      const d = Math.hypot(r.x - fx, r.y - fy);
      if (d < 0.5) break;
      g.player.pos.x = r.x; g.player.pos.y = r.y; moved += d;
    }
    walked[name] = Math.round(moved);
  }
  g.player.pos.x = home.x; g.player.pos.y = home.y;

  // Does the MAIN strip's model still block here? It must not — that would be a leftover
  // collision from the space the player just left.
  const mm = g.mapManager;
  const leftover = {
    onDeckModel: mm.isWalkableFootprint(home.x, home.y, R, 'endless:lower'),
    onMainModel: mm.isWalkableFootprint(home.x, home.y, R, 'endless'),
    walkModeUsed: g._walkMode(),
  };

  // Enemies and pickups must resolve against the SAME model the player does.
  const spawn = g.resolveEnemySpawn ? g.resolveEnemySpawn(home.x + 60, home.y + 40, 16, 200, null) : null;
  const shared = {
    spawnOk: !!spawn && mm.isWalkableFootprint(spawn.x, spawn.y, 16, g._walkMode()),
    deckOfPlayer: g.deckOf(home.y),
    deckOfSpawn: spawn ? g.deckOf(spawn.y) : null,
  };
  return { ok, before, after, walked, leftover, shared };
});

check('C01 the elevator ride completes and lands the player on the lower deck',
  ride.ok === true && ride.after.deck === 'lower', `${ride.before.deck} -> ${ride.after.deck} (returned ${ride.ok})`);
check('C02 the walkability model follows the player to the new deck',
  ride.after.mode === 'endless:lower', `_walkMode() ${ride.before.mode} -> ${ride.after.mode}`);
check('C03 the landing spot is standable under the lower deck\'s own model',
  ride.leftover.onDeckModel === true);
check('C04 no leftover collision from the space just left — the MAIN strip model is not what is consulted',
  ride.leftover.walkModeUsed === 'endless:lower',
  `walkMode ${ride.leftover.walkModeUsed}, main-model verdict here would be ${ride.leftover.onMainModel}`);

const W = ride.walked;
const MIN_WALK = 96;   // four body-widths of real movement in every direction
for (const [id, dir] of [['C05', 'up'], ['C06', 'down'], ['C07', 'left'], ['C08', 'right']]) {
  check(`${id} the player can actually walk ${dir.toUpperCase()} after the transfer`,
    W[dir] >= MIN_WALK, `${W[dir]}px`);
}
check('C09 diagonal movement is free too',
  ['upLeft', 'upRight', 'downLeft', 'downRight'].every(d => W[d] >= MIN_WALK),
  JSON.stringify({ upLeft: W.upLeft, upRight: W.upRight, downLeft: W.downLeft, downRight: W.downRight }));
check('C10 enemies and pickups resolve against the SAME deck the player is on',
  ride.shared.spawnOk && ride.shared.deckOfSpawn === 'lower' && ride.shared.deckOfPlayer === 'lower',
  JSON.stringify(ride.shared));

// ════════════════════════════════════════════════════════════════════════════
// D. THE RETURN RIDE
// ════════════════════════════════════════════════════════════════════════════
const back = await page.evaluate(() => {
  const g = window.__g;
  const ok = g._enterDeck('main', { force: true });
  return { ok, deck: g._deck || 'main', mode: g._walkMode(),
           standable: g.mapManager.isWalkableFootprint(g.player.pos.x, g.player.pos.y, 18, g._walkMode()) };
});
check('D01 the return ride puts the player back on the main strip',
  back.ok === true && back.deck === 'main' && back.mode === 'endless', JSON.stringify(back));
check('D02 the return landing is standable on the main model', back.standable === true);

check('Z01 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('Z02 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, anchors, ride, back, pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
