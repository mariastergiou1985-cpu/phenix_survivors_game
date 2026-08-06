// ════════════════════════════════════════════════════════════════════════════════
// nexusManager.chaos — REGRESSION. The flag leaked out of Chaos into every later run.
//
// NexusManager is REUSED across runs. `chaos` was set true by _beginChaosRun and by the mid-run
// escalation, and cleared NOWHERE — so once a player had touched Chaos, every Campaign and Endless
// run afterwards was still running with:
//   · `defence` matrices skipped for rewards entirely   (NexusManager ~533)
//   · rewards drawn from pickChaosReward, not pickWeightedReward (NexusManager ~540)
//
// This file is the regression: L-block proves the leak is gone on every entry path, C-block proves
// a real Chaos run is unaffected, and R-block proves RETRY and the mid-run escalation still work.
//
// Run: node tools/qa/browser/nexus_chaos_leak_proof.mjs [port]
// Writes: /tmp/nexus_chaos_leak_proof/
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/nexus_chaos_leak_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8943;
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

await page.evaluate(async () => {
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
  window.__nm = () => {
    const nm = g.nexusManager;
    if (!nm) return null;
    const ms = nm.matrices || [];
    return { chaos: nm.chaos === true, roles: nm._chaosRolesAssigned === true,
             sameObj: nm === window.__nmRef,
             withRole: ms.filter(m => m && m.chaosRole !== undefined).length, matrices: ms.length };
  };
  window.__pin = () => { window.__nmRef = g.nexusManager; };
  window.__chaos = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
    try { g._beginChaosRun(); } catch (_) {}
    window.__step(20);
  };
  window.__endless = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = null;
    g.reset();
    try { g._enterEndless(); } catch (_) {}
    window.__step(20);
  };
  window.__campaign = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = null;
    g.reset();                       // campaign is a plain reset with no Endless/Chaos entry
    window.__step(20);
  };
  window.__retry = () => { try { g.retryRun(); } catch (e) { window.__err = String(e); } window.__step(20); };
});

// ════════════════════════════════════════════════════════════════════════════
// L. THE LEAK
// ════════════════════════════════════════════════════════════════════════════
const sameManager = await page.evaluate(() => {
  window.__chaos(); window.__pin();
  window.__endless();
  return window.__nm();
});
check('L01 the NexusManager really is REUSED across runs — which is why the leak mattered',
  sameManager.sameObj === true, JSON.stringify(sameManager));

const toEndless = await page.evaluate(() => {
  window.__chaos();
  const inChaos = window.__nm();
  window.__endless();
  return { inChaos, after: window.__nm() };
});
check('L02 CHAOS -> ENDLESS: the flag is cleared',
  toEndless.inChaos.chaos === true && toEndless.after.chaos === false,
  JSON.stringify({ inChaos: toEndless.inChaos.chaos, after: toEndless.after.chaos }));

const toCampaign = await page.evaluate(() => {
  window.__chaos();
  const inChaos = window.__nm();
  window.__campaign();
  return { inChaos, after: window.__nm() };
});
check('L03 CHAOS -> CAMPAIGN: the flag is cleared',
  toCampaign.inChaos.chaos === true && toCampaign.after.chaos === false,
  JSON.stringify({ inChaos: toCampaign.inChaos.chaos, after: toCampaign.after.chaos }));

const rolesLeak = await page.evaluate(() => {
  const g = window.__g;
  window.__chaos();
  try { g.nexusManager.assignChaosRoles?.(); } catch (_) {}
  const inChaos = window.__nm();
  window.__endless();
  const afterE = window.__nm();
  window.__chaos();
  try { g.nexusManager.assignChaosRoles?.(); } catch (_) {}
  window.__campaign();
  return { inChaos, afterE, afterC: window.__nm() };
});
check('L04 _chaosRolesAssigned is cleared too — it leaked alongside the flag',
  rolesLeak.afterE.roles === false && rolesLeak.afterC.roles === false,
  JSON.stringify({ inChaos: rolesLeak.inChaos.roles, endless: rolesLeak.afterE.roles, campaign: rolesLeak.afterC.roles }));
check('L05 and no matrix carries a stale chaosRole into the next run',
  rolesLeak.afterE.withRole === 0 && rolesLeak.afterC.withRole === 0,
  JSON.stringify({ endless: rolesLeak.afterE.withRole, campaign: rolesLeak.afterC.withRole }));

const repeated = await page.evaluate(() => {
  // Alternate hard for a while — one missed clear anywhere in the cycle shows up here.
  const seen = [];
  for (let i = 0; i < 5; i++) {
    window.__chaos();   seen.push({ mode: 'chaos',   chaos: window.__nm().chaos });
    window.__endless(); seen.push({ mode: 'endless', chaos: window.__nm().chaos });
    window.__campaign();seen.push({ mode: 'campaign',chaos: window.__nm().chaos });
  }
  return seen;
});
check('L06 fifteen alternating runs: true in Chaos, false everywhere else, every time',
  repeated.length === 15 && repeated.every(r => r.chaos === (r.mode === 'chaos')),
  JSON.stringify(repeated.filter(r => r.chaos !== (r.mode === 'chaos'))) + ' mismatches');

// ════════════════════════════════════════════════════════════════════════════
// C. CHAOS ITSELF IS UNAFFECTED
// ════════════════════════════════════════════════════════════════════════════
const chaosOk = await page.evaluate(() => {
  const g = window.__g;
  window.__endless();
  const before = window.__nm();
  window.__chaos();
  const inChaos = window.__nm();
  window.__step(60);
  return { before, inChaos, afterFrames: window.__nm() };
});
check('C01 a Chaos run still SETS the flag — reset() clears it, _beginChaosRun sets it right back',
  chaosOk.before.chaos === false && chaosOk.inChaos.chaos === true &&
  chaosOk.afterFrames.chaos === true,
  JSON.stringify({ before: chaosOk.before.chaos, inChaos: chaosOk.inChaos.chaos, held: chaosOk.afterFrames.chaos }));

const chaosRoles = await page.evaluate(() => {
  const g = window.__g;
  window.__chaos();
  try { g.nexusManager.assignChaosRoles?.(); } catch (_) {}
  window.__step(30);
  return window.__nm();
});
check('C02 Chaos roles still get assigned and survive the run they belong to',
  chaosRoles.chaos === true && chaosRoles.roles === true, JSON.stringify(chaosRoles));

const retry = await page.evaluate(() => {
  const g = window.__g;
  window.__chaos();
  g.gameOver = true;
  window.__retry();
  return { chaos: window.__nm().chaos, mode: !!g._chaosMode, over: g.gameOver };
});
check('C03 RETRY — CHAOS still comes back up in Chaos, flag and all',
  retry.chaos === true && retry.mode === true && retry.over === false, JSON.stringify(retry));

const escalation = await page.evaluate(() => {
  const g = window.__g;
  window.__endless();
  const before = window.__nm().chaos;
  // The MID-RUN escalation path — Chaos engaged without _beginChaosRun.
  g._chaosMode = true;
  if (g.nexusManager) g.nexusManager.chaos = true;
  window.__step(20);
  const during = window.__nm().chaos;
  window.__campaign();
  return { before, during, after: window.__nm().chaos };
});
check('C04 the MID-RUN escalation path sets it too, and it is still cleared afterwards',
  escalation.before === false && escalation.during === true && escalation.after === false,
  JSON.stringify(escalation));

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
  window.__chaos();
  window.__endless();                       // the transition this fix is about
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
await shot('after_chaos_endless.png');
check('D01 an Endless run started right after Chaos renders — no black screen',
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
