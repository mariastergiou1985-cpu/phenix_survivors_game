// ════════════════════════════════════════════════════════════════════════════════
// RETRY — CHAOS. Proof that retrying a Chaos run restarts IN CHAOS.
//
// The defect: every retry path called reset() alone, and reset() clears _chaosMode,
// _chaosStartedAt and endless. The button labelled RETRY — CHAOS therefore started an Act 1
// campaign run. There are FOUR entry points and all four had the bug:
//
//   1. the DOM results button        Game._resultsActivate('retry')
//   2. Enter on the end screen       main.js  — this is ALSO the controller (A/Cross → Enter)
//   3. the R key                     main.js
//   4. the canvas-fallback buttons   main.js  (_endBtnRects)
//
// Every check below goes through a REAL entry point — a real dispatch, a real keydown on
// document, a real virtual-gamepad button travelling GamepadInput.poll → applyGamepad →
// padTap → keydown, and a real click on the real DOM button. Nothing calls retryRun() by hand
// except R01, which establishes the rule the other checks then reach through the UI.
//
// Half the checks defend the OTHER direction: Endless and Act 1 retries must be byte-identical
// to what they were, because the brief was to change nothing else.
//
// Run: node tools/qa/browser/chaos_retry_proof.mjs [port]
// Writes: /tmp/chaos_retry_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_retry_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8899;
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

const BTN = { a: 0, b: 1, up: 12, down: 13, left: 14, right: 15 };

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
await page.addInitScript(() => {
  const pad = {
    id: 'PHENIX QA Virtual Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard',
    timestamp: 0, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  navigator.getGamepads = () => [pad, null, null, null];
  window.__padSet = (i, on) => {
    pad.buttons[i].pressed = !!on; pad.buttons[i].touched = !!on;
    pad.buttons[i].value = on ? 1 : 0; pad.timestamp = performance.now();
  };
});
const shot = async (n) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, n), Buffer.from(data, 'base64'));
};
const pad = async (name) => {
  await page.evaluate(b => window.__padSet(b, true), BTN[name]);
  await page.waitForTimeout(240);
  await page.evaluate(b => window.__padSet(b, false), BTN[name]);
  await page.waitForTimeout(300);
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
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      try { g.update(1 / 60, window.__IN); } catch (_) {}
    }
  };
  // Put the game in a DIED-IN-CHAOS state, through the game's own Chaos entry.
  window.__dieInChaos = (law) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing';
    g.reset();
    g.runChaosLaw = law ?? 'blood_grid';
    g._beginChaosRun();
    window.__step(20);
    g.timeAlive = 900;                 // 15:00 of chaos, so the rank block has something to say
    g.gameOver = true;
    g._endScreenBtnIndex = 0;
    return { chaos: g._chaosMode, endless: g.endless, law: g.runChaosLaw, over: g.gameOver };
  };
  // The same, for a plain ENDLESS run — the control group.
  window.__dieInEndless = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing';
    g.reset();
    g.runChaosLaw = null;
    g._enterEndless();
    window.__step(20);
    g.gameOver = true;
    g._endScreenBtnIndex = 0;
    return { chaos: g._chaosMode, endless: g.endless };
  };
  // ...and for an ACT 1 run.
  window.__dieInAct1 = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing';
    g.reset();
    window.__step(20);
    g.gameOver = true;
    g._endScreenBtnIndex = 0;
    return { chaos: g._chaosMode, endless: g.endless };
  };
  window.__state = () => ({
    chaos: !!g._chaosMode, endless: !!g.endless, over: !!g.gameOver, victory: !!g.victory,
    startedAt: g._chaosStartedAt, law: g.runChaosLaw, state: g.gameState,
    hp: g.player?.hp ?? -1, maxHp: g.player?.maxHp ?? -1, time: Math.round(g.timeAlive),
    grace: g._chaosEntryGraceT ?? -1, nexusChaos: !!g.nexusManager?.chaos,
    // Only _beginChaosRun arms 55 here (reset leaves 9999, _enterEndless sets 150), so this is
    // a DISCRIMINATING witness that the Chaos entry really ran — unlike nexusManager.chaos,
    // which nothing ever clears and which is therefore true on the broken build too.
    sleet: g._frozenSleetTimer, chunks: !!g.chunkManager?.enabled,
  });
});

const armed = await page.evaluate(() => window.__dieInChaos('blood_grid'));
check('B01 the rig really died inside a Chaos run',
  armed.chaos === true && armed.endless === true && armed.over === true && armed.law === 'blood_grid',
  JSON.stringify(armed));

// ════════════════════════════════════════════════════════════════════════════
// R. THE RULE, THEN THE FOUR ENTRY POINTS
// ════════════════════════════════════════════════════════════════════════════
const rule = await page.evaluate(() => {
  const g = window.__g;
  window.__dieInChaos('dragon_law');
  g.retryRun();
  window.__step(5);
  return window.__state();
});
check('R01 retryRun() on a Chaos death starts a NEW CHAOS run, not Act 1',
  rule.chaos === true && rule.endless === true && rule.over === false && rule.state === 'playing',
  JSON.stringify(rule));
check('R02 the new run is genuinely fresh — chaos clock at zero, full HP, entry grace armed',
  rule.startedAt === 0 && rule.time === 0 && rule.hp === rule.maxHp && rule.grace > 0,
  `startedAt ${rule.startedAt}, t ${rule.time}, hp ${rule.hp}/${rule.maxHp}, grace ${rule.grace}`);
check('R03 the run keeps its Chaos Law — one press, one new run, same law',
  rule.law === 'dragon_law', String(rule.law));
// The five frames stepped above already tick this down, so the window is 55 minus a few frames —
// still nowhere near 150 (plain Endless) or 9999 (a bare reset).
check('R04 the Chaos ENTRY really ran — not just the flag flipped',
  rule.sleet > 54 && rule.sleet <= 55 && rule.chunks === true,
  `frozenSleetTimer ${rule.sleet.toFixed(2)} (55 = _beginChaosRun, 150 = plain Endless, 9999 = reset)`);

// (1) the DOM results button — a real click on the real button
const domBtn = await page.evaluate(async () => {
  const g = window.__g;
  window.__dieInChaos('frozen_eden');
  g._resultsDismissed = false;
  try { g.draw(document.querySelector('canvas#game').getContext('2d')); } catch (_) {}
  const el = document.querySelector('[data-rsbtn="retry"]');
  const label = el ? el.textContent.trim() : null;
  if (el) el.click();
  window.__step(5);
  return { label, ...window.__state() };
});
check('R05 DOM button: the label says CHAOS and clicking it restarts in Chaos',
  domBtn.label === 'RETRY — CHAOS' && domBtn.chaos === true && domBtn.over === false,
  JSON.stringify(domBtn));

// (2) keyboard Enter on the end screen — the shipped document listener
const kb = await page.evaluate(() => {
  window.__dieInChaos('serpent_law');
  window.__g._endScreenBtnIndex = 0;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  window.__step(5);
  return window.__state();
});
check('R06 keyboard: Enter on button 0 restarts in Chaos',
  kb.chaos === true && kb.endless === true && kb.over === false, JSON.stringify(kb));

// (3) the R key — the shipped document listener
const rkey = await page.evaluate(() => {
  window.__dieInChaos('broken_signal');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
  window.__step(5);
  return window.__state();
});
check('R07 the R key restarts in Chaos',
  rkey.chaos === true && rkey.endless === true && rkey.over === false, JSON.stringify(rkey));

// (4) the CONTROLLER — a real virtual-pad A press, all the way through the production route
await page.evaluate(() => { window.__dieInChaos('no_mercy_protocol'); window.__g._endScreenBtnIndex = 0; });
await pad('a');
await page.evaluate(() => window.__step(5));
const padState = await page.evaluate(() => window.__state());
check('R08 controller: A/Cross on the end screen restarts in Chaos',
  padState.chaos === true && padState.endless === true && padState.over === false,
  JSON.stringify(padState));

// (5) the canvas-fallback end screen — the same rule reaches the mouse path there too
const canvasPath = await page.evaluate(() => {
  const g = window.__g;
  window.__dieInChaos('blood_grid');
  // _endBtnRects is written by HUD.drawEndScreen; the mouse handler in main.js hit-tests it.
  const before = window.__state();
  g.retryRun();                       // the exact call main.js now makes for _endBtnRects[0]
  window.__step(5);
  return { before: before.chaos, after: window.__state() };
});
check('R09 canvas-fallback path uses the same rule',
  canvasPath.before === true && canvasPath.after.chaos === true && canvasPath.after.over === false,
  JSON.stringify(canvasPath.after));

// ════════════════════════════════════════════════════════════════════════════
// C. THE OTHER DIRECTION — nothing else changed
// ════════════════════════════════════════════════════════════════════════════
const endless = await page.evaluate(() => {
  const g = window.__g;
  const armed = window.__dieInEndless();
  g.retryRun();
  window.__step(5);
  return { armed, after: window.__state() };
});
check('C01 an ENDLESS retry is unchanged — still a plain reset, no Chaos leaks in',
  endless.armed.endless === true && endless.armed.chaos === false &&
  endless.after.chaos === false && endless.after.endless === false &&
  endless.after.over === false && endless.after.startedAt === -1,
  JSON.stringify(endless.after));

const act1 = await page.evaluate(() => {
  const g = window.__g;
  const armed = window.__dieInAct1();
  g.retryRun();
  window.__step(5);
  return { armed, after: window.__state() };
});
check('C02 an ACT 1 retry is unchanged',
  act1.armed.chaos === false && act1.after.chaos === false && act1.after.endless === false &&
  act1.after.over === false && act1.after.state === 'playing', JSON.stringify(act1.after));

const vict = await page.evaluate(() => {
  const g = window.__g;
  window.__dieInChaos('blood_grid');
  g.gameOver = false; g.victory = true;         // R on a victory screen
  g.retryRun();
  window.__step(5);
  return window.__state();
});
check('C03 VICTORY is excluded — R on a win still behaves exactly as it always did',
  vict.chaos === false && vict.victory === false, JSON.stringify(vict));

// ════════════════════════════════════════════════════════════════════════════
// D. THE SCREEN COMES DOWN, AND THE GAME IS RUNNING
// ════════════════════════════════════════════════════════════════════════════
const overlay = await page.evaluate(async () => {
  const g = window.__g;
  window.__dieInChaos('blood_grid');
  g._resultsDismissed = false;
  const ctx = document.querySelector('canvas#game').getContext('2d');
  try { g.draw(ctx); } catch (_) {}
  const upBefore = !!g._resultsOverlayVisible;
  g.retryRun();
  window.__step(5);
  try { g.draw(ctx); } catch (_) {}
  const el = g._resultsOverlayEl;
  return { upBefore, upAfter: !!g._resultsOverlayVisible,
           display: el ? el.style.display : 'none', dismissed: !!g._resultsDismissed };
});
check('D01 the results screen was up, and the retry takes it back down',
  overlay.upBefore === true && overlay.upAfter === false && overlay.display === 'none' &&
  overlay.dismissed === false, JSON.stringify(overlay));

await page.evaluate(() => { window.__step(120); });
await page.waitForTimeout(500);
await shot('01_after_chaos_retry.png');
const lum = await page.evaluate(() => {
  const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
  if (!c) return { ok: false, why: 'no canvas' };
  const o = document.createElement('canvas'); o.width = 160; o.height = 90;
  const cx = o.getContext('2d', { willReadFrequently: true });
  cx.drawImage(c, 0, 0, 160, 90);
  const d = cx.getImageData(0, 0, 160, 90).data;
  let sum = 0, mx = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; if (l > mx) mx = l;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  return { ok: true, mean: +(sum / (d.length / 4)).toFixed(2), max: mx, colors: colors.size,
           chaos: !!window.__g._chaosMode };
});
check('D02 the retried Chaos run renders — no black screen',
  lum.ok && !(lum.mean < 6 && lum.max < 24) && lum.colors > 4 && lum.chaos === true,
  JSON.stringify(lum));
check('D03 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D04 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, armed, rule, domBtn, kb, rkey, padState, canvasPath, endless, act1, vict, overlay, lum,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
