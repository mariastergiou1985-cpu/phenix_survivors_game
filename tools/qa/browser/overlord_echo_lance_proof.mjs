// ════════════════════════════════════════════════════════════════════════════════
// OVERLORD ECHO — PRISM LANCE. The overlordMega boss echo stops being a flat stat.
//
// It used to pay +0.2 pulse damage and nothing else. It now fires ONE Plasma-White bolt at the
// nearest enemy every 4 s, Chaos only, through the shipped _petBolts pipeline — the same
// projectile the Overlord's own drones use, so travel, damage, drawing and expiry are all shipped
// code. Caps: 4 s cooldown, 40 lances per run, 520 px range.
//
// WHICH ECHO: `overlordMega` in meta.bossEchoes, NOT the relic `overlord_prism_array` — the relic
// has fired drones since 95c1332 and was never "a simple stat". The E-block asserts the flat bonus
// is gone; the O-block asserts the other echoes still pay theirs.
//
// Run: node tools/qa/browser/overlord_echo_lance_proof.mjs [port]
// Writes: /tmp/overlord_echo_lance_proof/
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/overlord_echo_lance_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8939;
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
  window.__echo = (on, ids) => {
    g.meta.bossEchoes = {}; g.meta.echoesActive = {};
    for (const id of (ids || (on ? ['overlordMega'] : []))) { g.meta.bossEchoes[id] = true; g.meta.echoesActive[id] = true; }
  };
  window.__run = (mode) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    if (mode === 'chaos') {
      g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
      try { g._beginChaosRun(); } catch (_) {}
    } else { g.reset(); try { g._enterEndless(); } catch (_) {} g._chaosMode = false; }
    window.__step(20);
    g._petBolts.length = 0;
  };
  window.__spawn = (n, dx, spread) => {
    const made = [];
    for (let i = 0; i < n; i++) {
      let e = null;
      try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { break; }
      e.maxHp = 1e7; e.hp = e.maxHp; e.stunned = 0;
      e.pos.x = g.player.pos.x + dx + i * (spread ?? 10); e.pos.y = g.player.pos.y;
      g.enemies.push(e); made.push(e);
    }
    return made;
  };
  // Ticks ONLY the lance, so nothing else in the frame can spawn a bolt and be mistaken for one.
  window.__lance = (n, dt) => { for (let i = 0; i < n; i++) g._updateOverlordLance(dt ?? 1 / 60); };
  window.__bolts = () => g._petBolts.length;
  window.__stats = () => ({
    pulse: g.player?.upgrades?.['Pulse Damage'] || 0,
    maxHp: g.player?.maxHp || 0, speedBonus: g.player?.speedBonus || 0,
    fireRate: g.player?.fireRateBonus || 0,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// E. THE FLAT STAT IS GONE
// ════════════════════════════════════════════════════════════════════════════
const flat = await page.evaluate(() => {
  window.__echo(false); window.__run('chaos');
  const off = window.__stats();
  window.__echo(true);  window.__run('chaos');
  const on = window.__stats();
  return { off, on };
});
check('E01 the flat +0.2 pulse damage is GONE — this replaces it',
  flat.on.pulse === flat.off.pulse,
  `Pulse Damage ${flat.off.pulse} -> ${flat.on.pulse}`);

// ════════════════════════════════════════════════════════════════════════════
// L. THE LANCE
// ════════════════════════════════════════════════════════════════════════════
const fires = await page.evaluate(() => {
  const g = window.__g;
  window.__echo(true); window.__run('chaos');
  window.__spawn(1, 200);
  const before = window.__bolts();
  window.__lance(1);                       // cooldown starts at 0 → fires immediately
  const after = window.__bolts();
  const b = g._petBolts[0] || null;
  return { before, after, fired: g._lanceFired, cd: +(g._lanceCd || 0).toFixed(2),
           bolt: b ? { color: b.color, dmg: b.dmg, moving: Math.hypot(b.vx, b.vy) > 100 } : null };
});
check('L01 it fires ONE bolt through the shipped _petBolts pipeline, aimed and moving',
  fires.before === 0 && fires.after === 1 && fires.fired === 1 &&
  fires.bolt?.color === '#eaffff' && fires.bolt.dmg === 26 && fires.bolt.moving === true,
  JSON.stringify(fires));

const damages = await page.evaluate(() => {
  const g = window.__g;
  window.__echo(true); window.__run('chaos');
  const e = window.__spawn(1, 120)[0];
  const hp0 = e.hp;
  window.__lance(1);
  // Only the pet-projectile tick, so the player's own weapons cannot be credited with the damage.
  // The SPATIAL GRID has to be rebuilt by hand first: _tickPetProjectiles tests hits against
  // _spatialGrid.query, and an enemy pushed straight into g.enemies is not in the grid until
  // update() rebuilds it — so the bolt flew straight through a target the grid could not see, and
  // the check read "no damage" against a working lance.
  for (let i = 0; i < 60; i++) {
    try { g._spatialGrid?.rebuild(g.enemies); } catch (_) {}
    try { g._tickPetProjectiles(1 / 60); } catch (_) {}
  }
  return { hp0, hp1: e.hp, hurt: e.hp < hp0 };
});
check('L02 the bolt does real damage through the shipped projectile tick',
  damages.hurt === true, JSON.stringify(damages));

const cooldown = await page.evaluate(() => {
  const g = window.__g;
  window.__echo(true); window.__run('chaos');
  window.__spawn(1, 200);
  window.__lance(1);
  const one = window.__bolts();
  window.__lance(120);                     // 2 s of frames — still inside the 4 s cooldown
  const stillOne = window.__bolts();
  window.__lance(150);                     // now past 4 s total
  return { one, stillOne, after: window.__bolts(), fired: g._lanceFired };
});
check('L03 CAP — a 4 s cooldown holds it to one bolt, then lets the next through',
  cooldown.one === 1 && cooldown.stillOne === 1 && cooldown.after === 2 && cooldown.fired === 2,
  JSON.stringify(cooldown));

const runCap = await page.evaluate(() => {
  const g = window.__g;
  window.__echo(true); window.__run('chaos');
  window.__spawn(1, 200);
  // Drive far past the cap: 60 lance opportunities at a full cooldown each.
  for (let i = 0; i < 60; i++) { g._lanceCd = 0; window.__lance(1); g._petBolts.length = 0; }
  const atCap = g._lanceFired;
  g._lanceCd = 0; window.__lance(1);
  const after = { fired: g._lanceFired, bolts: window.__bolts() };
  window.__run('chaos');                   // a fresh run must re-arm it
  return { atCap, after, freshFired: g._lanceFired, freshCd: g._lanceCd };
});
check('L04 CAP — 40 lances per run, silent after that, and a fresh run re-arms it',
  runCap.atCap === 40 && runCap.after.fired === 40 && runCap.after.bolts === 0 &&
  runCap.freshFired === 0 && runCap.freshCd === 0,
  JSON.stringify(runCap));

const range = await page.evaluate(() => {
  const g = window.__g;
  window.__echo(true); window.__run('chaos');
  g.enemies.length = 0;
  window.__lance(1);                       // nothing on the field at all
  const empty = { bolts: window.__bolts(), fired: g._lanceFired, cd: g._lanceCd };
  window.__spawn(1, 900);                  // far outside the 520 px reach
  window.__lance(1);
  const far = { bolts: window.__bolts(), fired: g._lanceFired };
  g.enemies.length = 0;
  window.__spawn(1, 300);                  // inside it
  window.__lance(1);
  return { empty, far, near: { bolts: window.__bolts(), fired: g._lanceFired } };
});
check('L05 CAP — it never fires into empty space, and never past 520 px; no cooldown is burned',
  range.empty.bolts === 0 && range.empty.fired === 0 && range.empty.cd === 0 &&
  range.far.bolts === 0 && range.far.fired === 0 &&
  range.near.bolts === 1 && range.near.fired === 1,
  JSON.stringify(range));

const chaosOnly = await page.evaluate(() => {
  const g = window.__g;
  window.__echo(true); window.__run('endless');
  window.__spawn(1, 200);
  window.__lance(60);
  const endless = { bolts: window.__bolts(), fired: g._lanceFired, chaos: !!g._chaosMode };
  window.__echo(false); window.__run('chaos');
  window.__spawn(1, 200);
  window.__lance(60);
  return { endless, noEcho: { bolts: window.__bolts(), fired: g._lanceFired } };
});
check('L06 CONTROL — nothing fires in Endless, and nothing fires without the echo active',
  chaosOnly.endless.bolts === 0 && chaosOnly.endless.fired === 0 &&
  chaosOnly.noEcho.bolts === 0 && chaosOnly.noEcho.fired === 0,
  JSON.stringify(chaosOnly));

// ════════════════════════════════════════════════════════════════════════════
// O. THE OTHER ECHOES ARE UNTOUCHED
// ════════════════════════════════════════════════════════════════════════════
const others = await page.evaluate(() => {
  const g = window.__g;
  window.__echo(false); window.__run('chaos');
  const base = window.__stats();
  const out = {};
  for (const id of ['annihilator', 'cyberSerpent', 'leviathanMega', 'emperorMega', 'tyrantMega']) {
    window.__echo(true, [id]); window.__run('chaos');
    const s = window.__stats();
    out[id] = { pulse: +(s.pulse - base.pulse).toFixed(3),
                hp: s.maxHp > base.maxHp, speed: +(s.speedBonus - base.speedBonus).toFixed(3),
                fire: +(s.fireRate - base.fireRate).toFixed(3) };
  }
  return { base, out };
});
check('O01 CONTROL — every OTHER echo still pays exactly what it always paid',
  others.out.annihilator.pulse === 0.2 && others.out.cyberSerpent.pulse === 0.2 &&
  others.out.leviathanMega.hp === true &&
  others.out.emperorMega.speed === 0.02 && others.out.tyrantMega.fire === 0.02,
  JSON.stringify(others.out));

const noLance = await page.evaluate(() => {
  const g = window.__g;
  // Another echo active must NOT fire the Overlord's lance.
  window.__echo(true, ['leviathanMega', 'tyrantMega']); window.__run('chaos');
  window.__spawn(1, 200);
  window.__lance(60);
  return { bolts: window.__bolts(), fired: g._lanceFired };
});
check('O02 CONTROL — a different echo does not fire the Overlord\'s lance',
  noLance.bolts === 0 && noLance.fired === 0, JSON.stringify(noLance));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
const draw = await page.evaluate(() => {
  const g = window.__g;
  // Leave the DOM screens through the SHIPPED teardown, not by ripping nodes out. Removing
  // #cgm-charselect by hand left g._charSelectOverlayEl cached, so update() walked gameState
  // straight back to 'character_select' and the frame sampled a screen the canvas does not draw.
  try { g._hideCharSelectOverlay?.(); } catch (_) {}
  try { g._hideChaosLawSelectionOverlay?.(); } catch (_) {}
  try { g._hideMenuOverlay?.(); } catch (_) {}
  for (const sel of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel']) {
    const n = document.querySelector(sel); if (n) n.remove();
  }
  window.__echo(true); window.__run('chaos');
  window.__spawn(6, 180, 30);
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
  return { mean: sum / n, max, colors: colors.size, err, state: g.gameState, fired: g._lanceFired };
});
await shot('chaos_run.png');
check('D01 real frames run with the lance firing, and the game renders — no black screen',
  draw.err === null && draw.state === 'playing' && draw.fired > 0 &&
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
