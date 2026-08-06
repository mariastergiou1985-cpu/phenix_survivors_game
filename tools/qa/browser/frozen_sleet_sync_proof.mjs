// ════════════════════════════════════════════════════════════════════════════════
// FROZEN SLEET — REGRESSION. The logic and the visual now read ONE set of durations.
//
// _updateFrozenSleet ran HOLD 2.0 (the cap Maria asked for on the player freeze) while
// _drawFrozenSleet declared its own `this._chaosMode ? 5.5 : 3.0` — the pre-cap numbers. Stated
// honestly up front: that stale constant was DEAD, because the draw paints full frost during
// `hold` regardless of duration, so nothing looked wrong. The defect was that each half owned a
// copy of the timings at all.
//
// So this file proves the SHARING, not a visual delta: S-block asserts one source drives both,
// T-block asserts the timings the player actually experiences are unchanged, and B-block asserts
// no damage or balance moved.
//
// Run: node tools/qa/browser/frozen_sleet_sync_proof.mjs [port]
// Writes: /tmp/frozen_sleet_sync_proof/
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/frozen_sleet_sync_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8945;
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
const SRC   = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');

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

// ════════════════════════════════════════════════════════════════════════════
// S. ONE SOURCE
// ════════════════════════════════════════════════════════════════════════════
// Plain slicing, not a built regex. The first version escaped itself into oblivion via
// new RegExp('...\\\\(\\\\w*\\\\)...') and matched nothing, so all three S checks compared empty
// strings and "failed" against a fix that was already in place.
const fn = (name) => {
  const start = SRC.indexOf('  ' + name + '(');
  if (start < 0) return '';
  const end = SRC.indexOf('\n  }', start);
  return end < 0 ? '' : SRC.slice(start, end + 4);
};
const upd = fn('_updateFrozenSleet'), drw = fn('_drawFrozenSleet');
check('S01 neither half declares its own durations any more',
  upd.length > 0 && drw.length > 0 &&
  !/const\s+ONSET_DUR\s*=\s*[\d.]/.test(upd) && !/const\s+HOLD_DUR\s*=\s*[\d.]/.test(upd) &&
  !/const\s+ONSET_DUR\s*=\s*[\d.]/.test(drw) && !/const\s+HOLD_DUR\s*=/.test(drw),
  JSON.stringify({ updLen: upd.length, drwLen: drw.length }));
check('S02 both read the shared FROZEN_SLEET table',
  /FROZEN_SLEET/.test(upd) && /FROZEN_SLEET/.test(drw),
  JSON.stringify({ update: /FROZEN_SLEET/.test(upd), draw: /FROZEN_SLEET/.test(drw) }));
// COMMENTS STRIPPED. The draw's comment now explains what the old 5.5 / 3.0 was, and a bare
// /5\.5/ matched that explanation and called the fix incomplete. Third time this session a loose
// pattern has matched prose instead of code; only executable lines can hold a stale constant.
const code = (s) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
check('S03 the stale pre-cap 5.5 / 3.0 hold is gone from the draw',
  !/5\.5/.test(code(drw)) && !/_chaosMode\s*\?\s*5\.5/.test(code(SRC)),
  JSON.stringify({ inDrawCode: /5\.5/.test(code(drw)), inDrawText: /5\.5/.test(drw) }));
check('S04 the table itself is defined exactly once',
  (SRC.match(/const FROZEN_SLEET\s*=/g) || []).length === 1,
  String((SRC.match(/const FROZEN_SLEET\s*=/g) || []).length));

// ════════════════════════════════════════════════════════════════════════════
// T. THE TIMINGS THE PLAYER ACTUALLY EXPERIENCES
// ════════════════════════════════════════════════════════════════════════════
await page.evaluate(async () => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__ctx = () => (document.querySelector('canvas#game') ||
    [...document.querySelectorAll('canvas')].find(x => x.width > 400)).getContext('2d');
  window.__run = (chaos) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = chaos ? 'blood_grid' : null;
    if (chaos) { g._contractRolled = true; g.runChaosContract = 'tc_boss_rush'; try { g._beginChaosRun(); } catch (_) {} }
    else { g.reset(); try { g._enterEndless(); } catch (_) {} g._chaosMode = false; }
    for (let i = 0; i < 20; i++) { try { g.update(1 / 60, window.__IN); } catch (_) {} }
    g.gameOver = false; g.victory = false;
  };
  // Arms the storm and steps ONLY the sleet updater, recording how long each phase lasts.
  window.__storm = () => {
    const g2 = window.__g;
    g2._frozenSleet = null;
    g2._frozenSleetTimer = 0;
    g2._updateFrozenSleet(1 / 60);                 // spawns it
    if (!g2._frozenSleet) return null;
    const seen = { onset: 0, hold: 0, recovery: 0 };
    let frames = 0;
    while (g2._frozenSleet && frames < 60 * 20) {
      seen[g2._frozenSleet.phase] += 1 / 60;
      g2._updateFrozenSleet(1 / 60);
      frames++;
    }
    return { onset: +seen.onset.toFixed(2), hold: +seen.hold.toFixed(2),
             recovery: +seen.recovery.toFixed(2), ended: !g2._frozenSleet };
  };
  // How long the INPUT is actually frozen — the thing the 2 s cap was about.
  window.__frozenFrames = () => {
    const g2 = window.__g;
    g2._frozenSleet = null; g2._frozenSleetTimer = 0;
    g2._updateFrozenSleet(1 / 60);
    let frames = 0, frozen = 0;
    while (g2._frozenSleet && frames < 60 * 20) {
      if (g2._frozenSleet.phase === 'hold') frozen++;
      g2._updateFrozenSleet(1 / 60);
      frames++;
    }
    return +(frozen / 60).toFixed(2);
  };
  window.__drawOnce = () => {
    let err = null;
    try { g.draw(window.__ctx()); } catch (e) { err = String(e); }
    return err;
  };
});

const chaosTimes = await page.evaluate(() => { window.__run(true);  return window.__storm(); });
const endTimes   = await page.evaluate(() => { window.__run(false); return window.__storm(); });
check('T01 the CHAOS storm runs onset 0.65 / hold 2.0 / recovery 1.1, and ends',
  chaosTimes && Math.abs(chaosTimes.onset - 0.65) < 0.05 &&
  Math.abs(chaosTimes.hold - 2.0) < 0.05 && Math.abs(chaosTimes.recovery - 1.1) < 0.05 &&
  chaosTimes.ended === true, JSON.stringify(chaosTimes));
check('T02 the ENDLESS storm runs the SAME durations — no mode-dependent hold any more',
  endTimes && JSON.stringify(endTimes) === JSON.stringify(chaosTimes), JSON.stringify(endTimes));

const frozen = await page.evaluate(() => {
  window.__run(true);
  const chaos = window.__frozenFrames();
  window.__run(false);
  return { chaos, endless: window.__frozenFrames() };
});
check('T03 the player freeze is 2.0 s and NEVER more — the cap this all came from holds',
  frozen.chaos <= 2.05 && frozen.chaos >= 1.95 &&
  frozen.endless <= 2.05 && frozen.endless >= 1.95,
  JSON.stringify(frozen));

const visual = await page.evaluate(() => {
  const g = window.__g;
  window.__run(true);
  g._frozenSleet = null; g._frozenSleetTimer = 0;
  g._updateFrozenSleet(1 / 60);
  const out = [];
  let frames = 0, err = null;
  while (g._frozenSleet && frames < 60 * 20) {
    // Draw at the START, MIDDLE and END of every phase and confirm it never throws — the draw now
    // reads durations it does not own, which is exactly where a mismatch would surface.
    if (frames % 12 === 0) {
      const e = window.__drawOnce();
      if (e && !err) err = e;
      out.push({ phase: g._frozenSleet.phase, t: +g._frozenSleet.t.toFixed(2) });
    }
    g._updateFrozenSleet(1 / 60);
    frames++;
  }
  return { err, samples: out.length, phases: [...new Set(out.map(o => o.phase))],
           maxT: Math.max(...out.map(o => o.t)) };
});
check('T04 the visual draws through every phase without throwing, and t never exceeds its phase',
  visual.err === null && visual.samples > 10 &&
  JSON.stringify(visual.phases) === JSON.stringify(['onset', 'hold', 'recovery']) &&
  visual.maxT <= 2.05,
  JSON.stringify(visual));

// ════════════════════════════════════════════════════════════════════════════
// B. NO DAMAGE, NO BALANCE
// ════════════════════════════════════════════════════════════════════════════
const balance = await page.evaluate(() => {
  const g = window.__g;
  window.__run(true);
  const before = { hp: g.player.hp, maxHp: g.player.maxHp, credits: g.meta.credits || 0,
                   score: Math.floor(g.score || 0), kills: g.player.kills || 0 };
  g._frozenSleet = null; g._frozenSleetTimer = 0;
  g._updateFrozenSleet(1 / 60);
  let frames = 0;
  while (g._frozenSleet && frames < 60 * 20) { g._updateFrozenSleet(1 / 60); frames++; }
  return { before, after: { hp: g.player.hp, maxHp: g.player.maxHp, credits: g.meta.credits || 0,
                            score: Math.floor(g.score || 0), kills: g.player.kills || 0 } };
});
check('B01 a whole storm does NO damage and moves no score, credits or kills',
  JSON.stringify(balance.before) === JSON.stringify(balance.after),
  JSON.stringify(balance));

const cadence = await page.evaluate(() => {
  const g = window.__g;
  window.__run(true);
  g._frozenSleet = null; g._frozenSleetTimer = 0;
  g._updateFrozenSleet(1 / 60);
  let frames = 0;
  while (g._frozenSleet && frames < 60 * 20) { g._updateFrozenSleet(1 / 60); frames++; }
  return { next: +g._frozenSleetTimer.toFixed(1) };
});
check('B02 the gap to the next storm is still the shipped 110-140 s',
  cadence.next >= 110 && cadence.next <= 140, JSON.stringify(cadence));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
const draw = await page.evaluate(() => {
  const g = window.__g;
  try { g._hideCharSelectOverlay?.(); } catch (_) {}
  try { g._hideChaosLawSelectionOverlay?.(); } catch (_) {}
  try { g._hideMenuOverlay?.(); } catch (_) {}
  for (const sel of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel']) {
    const n = document.querySelector(sel); if (n) n.remove();
  }
  window.__run(true);
  g._frozenSleet = null; g._frozenSleetTimer = 0;
  g._updateFrozenSleet(1 / 60);
  for (let i = 0; i < 45; i++) { g._updateFrozenSleet(1 / 60); try { g.update(1 / 60, window.__IN); } catch (_) {} }
  g.gameState = 'playing'; g.gameOver = false; g.victory = false;
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
await shot('sleet.png');
check('D01 a frame drawn mid-storm renders — no black screen',
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
