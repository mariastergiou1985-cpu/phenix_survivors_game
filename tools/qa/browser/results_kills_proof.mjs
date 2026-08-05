// ════════════════════════════════════════════════════════════════════════════════
// RESULTS · KILLS. Proof that the tile prints the run's real kill count.
//
// The defect: _resultsHTML read `this.kills ?? this.killCount ?? 0`, and NEITHER is ever
// assigned on Game. The game's only kill counter is player.kills, incremented once per death
// in Enemy.takeHit. So both nullish coalesces fell through and the DOM tile printed 0 on every
// run, in every mode, since it was written.
//
// Every kill in this proof is a REAL kill: an Enemy instance is constructed and killed through
// Enemy.takeHit, so the counter moves by the same code path a player's shot moves it. Nothing
// here writes player.kills by hand except K08, which exists only to check the number formatter.
//
// The canvas end screen was ALREADY correct (HUD.js reads game.player.kills). K07 asserts it
// anyway, by capturing the real _statCapsule call while the real drawEndScreen runs — a check
// that passes on the broken build too, which is exactly why it is worth having: it proves this
// fix did not disturb the path that was already right.
//
// Run: node tools/qa/browser/results_kills_proof.mjs [port]
// Writes: /tmp/results_kills_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/results_kills_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8901;
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
const rig = await page.evaluate(async () => {
  const g = window.__g;
  g.meta._save = () => {};
  const src = await fetch('./js/game/Game.js?v=' + window.__BUILD).then(r => r.text()).catch(() => '');
  const ev = (src.match(/Enemy\.js\?v=(\d+)/) || [])[1] || '';
  try { window.__Enemy = (await import(`./js/entities/Enemy.js?v=${ev}`)).Enemy; } catch (_) { window.__Enemy = null; }
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

  // Start a run in a given mode, through the game's own entries.
  window.__run = (mode) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing';
    g.reset();
    if (mode === 'endless') { try { g._enterEndless(); } catch (_) {} }
    if (mode === 'chaos')   { g.runChaosLaw = 'blood_grid'; try { g._beginChaosRun(); } catch (_) {} }
    window.__step(20);
    return g.player.kills;
  };

  // REAL kills: build enemies and kill them through Enemy.takeHit, the one place that
  // increments player.kills. takeHit splices g.enemies, so the list is snapshotted.
  window.__kill = (n) => {
    const made = [];
    for (let i = 0; i < n; i++) {
      let e = null;
      try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { break; }
      e.maxHp = 10; e.hp = 10;
      e.pos.x = g.player.pos.x + 200 + i * 12; e.pos.y = g.player.pos.y;
      g.enemies.push(e); made.push(e);
    }
    for (const e of made) { try { e.takeHit(1e6, g); } catch (_) {} }
    return made.length;
  };

  // Read the KILLS tile out of the REAL rendered results DOM.
  window.__tile = (label) => {
    const el = window.__g._resultsOverlayEl;
    if (!el) return null;
    for (const s of el.querySelectorAll('.rs-stat')) {
      const k = s.querySelector('.k'), v = s.querySelector('.v');
      if (k && v && k.textContent.trim() === label) return v.textContent.trim();
    }
    return null;
  };
  // Put the game on the results screen and render it for real.
  window.__showResults = (victory) => {
    if (victory) { g.victory = true; g.gameOver = false; } else { g.gameOver = true; g.victory = false; }
    g._resultsDismissed = false;
    g._resultsShownFor = null;                 // force a rebuild so the HTML is regenerated
    try { g.draw(window.__ctx()); } catch (_) {}
    return { visible: !!g._resultsOverlayVisible, kills: window.__tile('KILLS'), real: g.player.kills };
  };
  return { enemy: !!window.__Enemy, gameKills: g.kills, gameKillCount: g.killCount };
});
check('A03 the Enemy class is available to the rig', rig.enemy === true);

// ════════════════════════════════════════════════════════════════════════════
// K. THE ROOT CAUSE, THEN THE THREE MODES
// ════════════════════════════════════════════════════════════════════════════
check('K01 the fields the tile used to read really are undefined on Game — player.kills is the only counter',
  rig.gameKills === undefined && rig.gameKillCount === undefined,
  `this.kills=${rig.gameKills}, this.killCount=${rig.gameKillCount}`);

for (const [id, mode, label] of [['K02', 'chaos', 'CHAOS'], ['K03', 'endless', 'ENDLESS'], ['K04', 'campaign', 'CAMPAIGN']]) {
  const r = await page.evaluate((m) => {
    const g = window.__g;
    const start = window.__run(m);
    const made = window.__kill(17);
    const real = g.player.kills;
    const shown = window.__showResults(false);
    return { start, made, real, ...shown, chaos: !!g._chaosMode, endless: !!g.endless };
  }, mode);
  check(`${id} ${label}: the tile prints the run's real kill count`,
    r.start === 0 && r.made === 17 && r.real === 17 && r.visible === true && r.kills === '17',
    JSON.stringify(r));
}

const exact = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos');
  window.__kill(9);
  const shown = window.__showResults(false);
  return { shown: shown.kills, real: g.player.kills, zero: shown.kills === '0' };
});
check('K05 the tile equals player.kills exactly — and is no longer the hardcoded 0',
  exact.shown === String(exact.real) && exact.real === 9 && exact.zero === false,
  JSON.stringify(exact));

const fresh = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos');
  window.__kill(12);
  const first = window.__showResults(false).kills;
  window.__run('chaos');                       // a brand new run — reset() builds a new Player
  const second = window.__showResults(false);
  return { first, afterRestart: second.kills, real: g.player.kills };
});
check('K06 the count is PER RUN — a fresh run starts the tile at 0, it does not accumulate',
  fresh.first === '12' && fresh.afterRestart === '0' && fresh.real === 0, JSON.stringify(fresh));

// ── K07: the canvas fallback. Capture the REAL _statCapsule call inside drawEndScreen. ──
const canvasSide = await page.evaluate(async () => {
  const g = window.__g;
  window.__run('endless');
  window.__kill(23);
  g.gameOver = true; g.victory = false;
  g._resultsDismissed = true;                  // force the CANVAS path: DOM overlay stays down
  const caps = [];
  const orig = g._statCapsule;
  g._statCapsule = function (ctx, x, y, w, h, label, value, color) {
    caps.push({ label, value });
    return orig.call(this, ctx, x, y, w, h, label, value, color);
  };
  try { g.draw(window.__ctx()); } catch (_) {}
  g._statCapsule = orig;
  const cap = caps.find(c => c.label === 'ENEMIES DEFEATED');
  return { domUp: !!g._resultsOverlayVisible, capLabel: cap?.label ?? null,
           capValue: cap?.value ?? null, real: g.player.kills, caps: caps.map(c => c.label) };
});
check('K07 the canvas fallback renders the real count too (it always did — this fix did not disturb it)',
  canvasSide.domUp === false && canvasSide.capValue === String(canvasSide.real) &&
  canvasSide.real === 23, JSON.stringify(canvasSide));

const big = await page.evaluate(() => {
  const g = window.__g;
  window.__run('campaign');
  g.player.kills = 12345;                      // formatter check only — not a gameplay path
  const shown = window.__showResults(false);
  return { shown: shown.kills, real: g.player.kills };
});
check('K08 large counts keep their thousands separator', big.shown === (12345).toLocaleString(),
  `${big.shown} for ${big.real}`);

const win = await page.evaluate(() => {
  const g = window.__g;
  window.__run('campaign');
  window.__kill(6);
  const shown = window.__showResults(true);    // VICTORY, the Campaign win screen
  return { ...shown, victory: !!g.victory };
});
check('K09 a CAMPAIGN victory screen shows it as well',
  win.victory === true && win.visible === true && win.kills === '6' && win.real === 6,
  JSON.stringify(win));

// ════════════════════════════════════════════════════════════════════════════
// D. NOTHING ELSE MOVED
// ════════════════════════════════════════════════════════════════════════════
const others = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos');
  window.__kill(4);
  g.timeAlive = 754; g.score = 98765;
  const shown = window.__showResults(false);
  const t = (l) => window.__tile(l);
  return { kills: shown.kills, time: t('TIME SURVIVED'), level: t('LEVEL'),
           cores: t('GRID CORES'), frags: t('FRAGMENTS'),
           lvlReal: g.player.level, mm: Math.floor(754 / 60), ss: 754 % 60 };
});
// D01 is a CONTROL: it must pass on the broken build too, or it is not evidence that the other
// tiles were left alone. The kills value is deliberately NOT asserted here — K02-K05 own that.
check('D01 CONTROL — the other four tiles render their own values, unchanged by this fix',
  others.time === '12:34' && others.level === String(others.lvlReal) &&
  /^\+/.test(others.cores) && others.frags !== null, JSON.stringify(others));
check('D01b and the KILLS tile in that same render is the real count',
  others.kills === '4', `${others.kills} for 4 real kills`);

await page.evaluate(() => { const g = window.__g; g.gameOver = false; g.victory = false; window.__step(60); });
await page.waitForTimeout(400);
await shot('01_after.png');
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
check('D02 the game is still rendering — no black screen',
  lum.ok && !(lum.mean < 6 && lum.max < 24) && lum.colors > 4, JSON.stringify(lum));
check('D03 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D04 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, rig, exact, fresh, canvasSide, big, win, others, lum,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
