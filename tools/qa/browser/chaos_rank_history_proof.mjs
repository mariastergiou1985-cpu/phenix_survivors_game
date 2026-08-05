// ════════════════════════════════════════════════════════════════════════════════
// CHAOS RANK on the DOM results screen, and 'Chaos' in the run history.
//
// Two defects, both of them "the game already knew, it just never said so":
//
//  1. game.chaosRank is read ONLY by HUD.drawEndScreen, and draw() renders the canvas end
//     screens only while the DOM overlay is DOWN (Game.js:23577) — which on a normal death it
//     never is. The rank a player spent 30 minutes earning has never been on screen.
//  2. recordRun filed every run as `this.endless ? 'Endless' : ...`, and a Chaos run goes
//     through _enterEndless(), so `endless` is true for it too. Every Chaos run was logged as
//     Endless; the player's own history could not tell the two apart.
//
// Both are asserted out of the REAL rendered results DOM and the REAL persisted MetaProgress
// history — never out of a variable. All three modes are covered, and Endless/Campaign are
// asserted to be UNCHANGED, which is the half of this proof that stops a UI fix leaking.
//
// Run: node tools/qa/browser/chaos_rank_history_proof.mjs [port]
// Writes: /tmp/chaos_rank_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_rank_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8903;
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

check('A00 sw.js BUILD equals index.html main.js ?v=', BUILD === IDX_V, `${BUILD} vs ${IDX_V}`);
await page.evaluate(b => { window.__BUILD = b; }, BUILD);
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
check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

// ── Rig ─────────────────────────────────────────────────────────────────────
await page.evaluate(() => {
  const g = window.__g;
  g.meta._save = () => {};
  g.meta.chaosRanks = {};                       // start from a clean per-character record
  g.meta.runHistory = [];
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

  // Run a mode to its end through the game's OWN entry and its OWN _grantRewards.
  // `secs` is the chaos-clock length the rank is scored on.
  window.__endRun = (mode, charId, secs) => {
    g.selectedCharacter = charId;
    g.gameState = 'playing';
    g.reset();
    if (mode === 'endless') { try { g._enterEndless(); } catch (_) {} }
    if (mode === 'chaos')   { g.runChaosLaw = 'blood_grid'; try { g._beginChaosRun(); } catch (_) {} }
    if (g.player) g.player.selectedCharacter = charId;
    window.__step(20);
    g.timeAlive = (mode === 'chaos' ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false;
    g._rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__grantErr = String(e); }
    g._resultsDismissed = false;
    g._resultsShownFor = null;
    try { g.draw(window.__ctx()); } catch (_) {}
    return {
      rank: g.chaosRank, secs: g.chaosTimeSecs, visible: !!g._resultsOverlayVisible,
      chaos: !!g._chaosMode, endless: !!g.endless,
    };
  };
  // Read the rank band straight out of the rendered results DOM.
  // Anchor on the LABEL and take its parent, not on "any div whose textContent matches" —
  // textContent bubbles, so that first matched .rs-stage and returned the whole screen with no
  // border of its own. The band is the label's parent, and nothing else on the screen is.
  window.__band = () => {
    const el = window.__g._resultsOverlayEl;
    if (!el) return null;
    for (const d of el.querySelectorAll('div')) {
      if ((d.textContent || '').trim() === '⚡ CHAOS SURVIVAL RANK') {
        const band = d.parentElement;
        if (!band) return null;
        return { text: band.textContent.replace(/\s+/g, ' ').trim(),
                 border: getComputedStyle(band).borderColor || null };
      }
    }
    return null;
  };
  window.__hist = () => (window.__g.meta.getRunHistory?.() || []).map(r => ({ mode: r.mode, char: r.char, time: r.time }));
});

// ════════════════════════════════════════════════════════════════════════════
// R. THE RANK BAND — all four ranks, out of the real DOM
// ════════════════════════════════════════════════════════════════════════════
const TIERS = [
  ['R01', 'BRONZE',   9 * 60 + 30, '#cd7f32'],
  ['R02', 'SILVER',  14 * 60 + 12, '#c0c0c0'],
  ['R03', 'GOLD',    21 * 60 +  5, '#ffd700'],
  ['R04', 'PLATINUM',33 * 60 + 41, '#e0e0f8'],
];
const seen = [];
for (const [id, want, secs, hex] of TIERS) {
  const r = await page.evaluate(([s]) => {
    const g = window.__g;
    g.meta.chaosRanks = {};                     // isolate: this run is the character's only run
    const end = window.__endRun('chaos', 'skeleton_warrior', s);
    return { ...end, band: window.__band(), rec: g.meta.chaosRanks.skeleton_warrior || null };
  }, [secs]);
  seen.push({ id, want, ...r });
  const mm = String(Math.floor(secs / 60)).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
  check(`${id} a ${want} Chaos run shows ${want} on the DOM results screen`,
    r.rank === want && r.visible === true && r.band !== null &&
    new RegExp('\\b' + want + '\\b').test(r.band.text) &&
    r.band.text.includes(`${mm}:${ss}`),
    r.band ? r.band.text : 'NO BAND');
  check(`${id}b it is tinted with the shipped ${want} colour, the same one HUD.js uses`,
    !!r.band && (r.band.border || '').toLowerCase().replace(/\s/g, '')
      .includes(hexToRgb(hex)), r.band ? r.band.border : 'no band');
}
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

// The CHARACTER'S BEST, not just this run's — a weaker run after a strong one still shows the best.
const best = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosRanks = {};
  window.__endRun('chaos', 'taekwondo_girl', 25 * 60 + 40);   // GOLD, becomes the best
  const strong = { band: window.__band(), rec: { ...g.meta.chaosRanks.taekwondo_girl } };
  window.__endRun('chaos', 'taekwondo_girl', 3 * 60 + 5);     // a poor BRONZE run after it
  return { strong, weak: { rank: g.chaosRank, secs: g.chaosTimeSecs, band: window.__band(),
                           rec: { ...g.meta.chaosRanks.taekwondo_girl } } };
});
// Null-safe on purpose: with the band absent this must report FAIL, not throw. A proof that
// crashes takes every check after it down with it, which is how the run-history half of this
// file went unreported on the first baseline attempt.
const wt = best.weak.band?.text ?? '';
check('R05 the band shows THIS run and the CHARACTER\'S BEST separately',
  best.weak.rank === 'BRONZE' && /BRONZE/.test(wt) &&
  /03:05/.test(wt) &&                                        // this run
  /GOLD/.test(wt) && /25:40/.test(wt) &&                     // the best, kept
  best.weak.rec.bestSecs === 25 * 60 + 40 && best.weak.rec.bestRank === 'GOLD',
  wt || 'NO BAND');

check('R06 the best is PER CHARACTER — the other character\'s record is untouched',
  await page.evaluate(() => {
    const g = window.__g;
    const t = g.meta.chaosRanks.taekwondo_girl, s = g.meta.chaosRanks.skeleton_warrior;
    return !!t && t.bestRank === 'GOLD' && (!s || s.bestSecs !== t.bestSecs);
  }));

const noBand = await page.evaluate(() => {
  const g = window.__g;
  const e = window.__endRun('endless', 'skeleton_warrior', 900);
  const endlessBand = window.__band();
  const c = window.__endRun('campaign', 'skeleton_warrior', 400);
  const campBand = window.__band();
  return { e, endlessBand, c, campBand };
});
check('R07 ENDLESS shows no rank band at all — the screen is unchanged for it',
  noBand.e.rank === null && noBand.endlessBand === null && noBand.e.visible === true,
  JSON.stringify({ rank: noBand.e.rank, band: noBand.endlessBand }));
check('R08 CAMPAIGN shows no rank band at all',
  noBand.c.rank === null && noBand.campBand === null && noBand.c.visible === true,
  JSON.stringify({ rank: noBand.c.rank, band: noBand.campBand }));

// ════════════════════════════════════════════════════════════════════════════
// H. RUN HISTORY — the mode string
// ════════════════════════════════════════════════════════════════════════════
const hist = await page.evaluate(() => {
  const g = window.__g;
  g.meta.runHistory = [];
  window.__endRun('chaos', 'skeleton_warrior', 660);
  window.__endRun('endless', 'cyber_arm_hero', 500);
  window.__endRun('campaign', 'brawler_warrior', 300);
  return window.__hist();                       // newest first
});
check('H01 a CHAOS run is filed as Chaos, not Endless',
  hist[2]?.mode === 'Chaos' && hist[2]?.char === 'skeleton_warrior', JSON.stringify(hist));
check('H02 an ENDLESS run is still filed as Endless',
  hist[1]?.mode === 'Endless' && hist[1]?.char === 'cyber_arm_hero', JSON.stringify(hist[1]));
check('H03 a CAMPAIGN run is still filed as Act 1',
  hist[0]?.mode === 'Act 1' && hist[0]?.char === 'brawler_warrior', JSON.stringify(hist[0]));
check('H04 the three modes are genuinely distinguishable in the log now',
  new Set(hist.map(r => r.mode)).size === 3, hist.map(r => r.mode).join(' / '));

const win = await page.evaluate(() => {
  const g = window.__g;
  g.meta.runHistory = [];
  g.selectedCharacter = 'skeleton_warrior';
  g.gameState = 'playing'; g.reset(); window.__step(20);
  g.timeAlive = 600; g.victory = true; g.gameOver = false; g._rewardsGranted = false;
  try { g._grantRewards(); } catch (_) {}
  return window.__hist()[0] || null;
});
check('H05 an Act 1 VICTORY is still filed as Act 1 Win', win?.mode === 'Act 1 Win', JSON.stringify(win));

// ════════════════════════════════════════════════════════════════════════════
// D. NOTHING ELSE MOVED
// ════════════════════════════════════════════════════════════════════════════
const tiles = await page.evaluate(() => {
  const g = window.__g;
  window.__endRun('chaos', 'skeleton_warrior', 754);
  const el = g._resultsOverlayEl;
  const out = [];
  for (const s of el.querySelectorAll('.rs-stat')) {
    const k = s.querySelector('.k'), v = s.querySelector('.v');
    if (k && v) out.push([k.textContent.trim(), v.textContent.trim()]);
  }
  const mode = el.querySelector('.rs-mode');
  return { tiles: out, mode: mode ? mode.textContent.trim() : null,
           btns: [...el.querySelectorAll('[data-rsbtn]')].map(b => b.dataset.rsbtn) };
});
check('D01 CONTROL — the five stat tiles keep their shipped set and order',
  JSON.stringify(tiles.tiles.map(t => t[0])) ===
  JSON.stringify(['TIME SURVIVED', 'LEVEL', 'KILLS', 'GRID CORES', 'FRAGMENTS']),
  JSON.stringify(tiles.tiles));
check('D02 CONTROL — the mode pill and the button set/order are untouched',
  tiles.mode === 'CHAOS MODE' &&
  JSON.stringify(tiles.btns) === JSON.stringify(['retry', 'upgrades', 'menu']),
  JSON.stringify(tiles));

await shot('01_chaos_results_with_rank.png');
await page.evaluate(() => { const g = window.__g; g.gameOver = false; g.victory = false; window.__step(60); });
await page.waitForTimeout(400);
const lum = await page.evaluate(() => {
  const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
  if (!c) return { ok: false };
  const o = document.createElement('canvas'); o.width = 160; o.height = 90;
  const cx = o.getContext('2d', { willReadFrequently: true });
  cx.drawImage(c, 0, 0, 160, 90);
  const d = cx.getImageData(0, 0, 160, 90).data;
  let sum = 0, mx = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; if (l > mx) mx = l;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  return { ok: true, mean: +(sum / (d.length / 4)).toFixed(2), max: mx, colors: colors.size };
});
check('D03 the game is still rendering — no black screen',
  lum.ok && !(lum.mean < 6 && lum.max < 24) && lum.colors > 4, JSON.stringify(lum));
check('D04 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D05 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, seen, best, noBand, hist, win, tiles, lum,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
