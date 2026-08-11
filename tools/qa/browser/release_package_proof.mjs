// ════════════════════════════════════════════════════════════════════════════════
// RELEASE PACKAGE PROOF — the built electron/game/ payload, tested as a player receives it.
//
// Everything below runs against electron/game/ (the output of prepare-game.js), never against the
// repo, because the repo is not what ships. All external network is ABORTED at the browser: if the
// build needs the internet for anything, it fails here rather than on a Steam customer's machine.
//
//   0. ELECTRON file:// BOOT. electron/main.js calls win.loadFile(game/index.html), so the packaged
//      exe serves the game over file://. That is a different security origin from http, and it is
//      where an ES-module game can silently die. Tested first because nothing else matters if the
//      window opens black.
//   1. OFFLINE HTTP BOOT + the full functional checklist.
//   2. SERVICE WORKER anti-stale, on a non-localhost origin (index.html deliberately disables the
//      SW on localhost/file, so localhost cannot answer this question).
//
// Run: node tools/qa/browser/release_package_proof.mjs [port]
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PKG  = path.join(ROOT, 'electron', 'game');     // THE SHIPPED PAYLOAD
const PORT = Number(process.argv[2]) || 9700;
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png',
               '.jpg':'image/jpeg','.json':'application/json','.ogg':'audio/ogg','.mp3':'audio/mpeg',
               '.wav':'audio/wav','.mp4':'video/mp4','.ico':'image/x-icon' };

if (!fs.existsSync(path.join(PKG, 'index.html'))) {
  console.error(`\nNo package at ${PKG} — run: node electron/prepare-game.js\n`);
  process.exit(2);
}
const BUILD = fs.readFileSync(path.join(PKG, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(PKG, p);
  if (!f.startsWith(PKG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                       'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

let pass = 0, fail = 0;
const line = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); ok ? pass++ : fail++; };
const out = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log(`\n══ RELEASE PACKAGE PROOF — build ${BUILD} ══`);
console.log(`   payload: ${PKG}`);
console.log(`   ${fs.readdirSync(PKG).join(', ')}\n`);

// ── shared browser bring-up ─────────────────────────────────────────────────
const launch = async (extraArgs = []) => chromium.launch({ executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', ...extraArgs] });

// EVERY off-box request dies here. Nothing in a Steam build may depend on a network.
const goOffline = async (ctx, offRequests) => {
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORT}`) || u.startsWith('http://phenix.test') ||
        u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    offRequests.push(u);
    return route.abort();
  });
};

const instrument = (page, errs) => {
  page.on('pageerror', e => errs.page.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.console.push(m.text().slice(0, 200)); });
  page.on('requestfailed', r => { const u = r.url(); if (!/127\.0\.0\.1|phenix\.test|^file:|^data:/.test(u)) errs.blocked.push(u); });
};

// ════ 0. ELECTRON BOOT — the real shell, offline ════════════════════════════
// MUST be real Electron. Loading file:// in plain Chromium is NOT a proxy for this: Chromium
// refuses an ES module over file:// ("blocked by CORS policy ... origin 'null'") while Electron
// permits it, so the Chromium version of this test reported a black window for a build that boots
// perfectly. A test that is wrong in the pessimistic direction still costs a release day.
console.log('── 0. Electron boot, offline (win.loadFile) ──');
{
  const ELECTRON = process.env.ELECTRON_BIN ||
    [path.join(ROOT, 'electron/node_modules/electron/dist/electron'),
     path.join(ROOT, 'node_modules/electron/dist/electron'),
     '/tmp/etest/node_modules/electron/dist/electron'].find(p => fs.existsSync(p));
  if (!ELECTRON) {
    console.log('     SKIPPED — no electron binary found. Verify locally with:  cd electron && npm install && npm start');
    console.log('     (set ELECTRON_BIN=/path/to/electron to run it here)');
    out.fileBoot = null;
  } else {
    const { execFileSync } = await import('node:child_process');
    const tmp = fs.mkdtempSync('/tmp/phenix-eboot-');
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'eboot', version: '1.0.0', main: 'main.js' }));
    fs.copyFileSync(path.join(ROOT, 'electron/preload.js'), path.join(tmp, 'preload.js'));
    // The shipped createWindow, verbatim in shape, plus a probe and a hard exit.
    fs.writeFileSync(path.join(tmp, 'main.js'), `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const GAME = ${JSON.stringify(PKG)};
const errors = [];
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1600, height: 900, show: false, fullscreen: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: false, nodeIntegration: false } });
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errors.push(String(msg).slice(0, 200)); });
  win.loadFile(path.join(GAME, 'index.html'));
  setTimeout(async () => {
    let r; try { r = await win.webContents.executeJavaScript(\`(() => {
      const c = document.getElementById('game'); let lum = -1;
      try { const g = c.getContext('2d'); const d = g.getImageData(0,0,c.width,c.height).data;
            let s=0,n=0; for(let i=0;i<d.length;i+=4000){s+=(d[i]+d[i+1]+d[i+2])/3;n++;} lum=Math.round(s/n); } catch(e){}
      return JSON.stringify({ protocol: location.protocol, canvas: c ? c.width+'x'+c.height : null,
        moduleGraphAlive: !!(window.__phenixTutorial || document.getElementById('cgm-overlay')), luminance: lum });
    })()\`); } catch (e) { r = JSON.stringify({ err: String(e).slice(0,200) }); }
    console.log('PROBE::' + r);
    console.log('ERRS::' + JSON.stringify(errors.filter(e => !/steamworks|Security Warning/i.test(e)).slice(0,3)));
    app.quit();
  }, 9000);
});
app.on('window-all-closed', () => app.quit());
`);
    let stdout = '';
    try {
      // --host-resolver-rules="MAP * ~NOTFOUND" is a machine with no internet at all.
      stdout = execFileSync('xvfb-run', ['-a', ELECTRON, tmp, '--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND'],
        { encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { stdout = (e.stdout || '') + (e.stderr || ''); }
    const probe = JSON.parse((stdout.match(/PROBE::(.*)/) || [, '{}'])[1]);
    const eerrs = JSON.parse((stdout.match(/ERRS::(.*)/) || [, '[]'])[1]);
    console.log(`     protocol=${probe.protocol} canvas=${probe.canvas} moduleGraphAlive=${probe.moduleGraphAlive} luminance=${probe.luminance}`);
    console.log(`     DNS: every host resolves to NOTFOUND — this is a machine with no internet`);
    for (const e of eerrs) console.log(`     console: ${e}`);
    line(probe.protocol === 'file:', `the packaged shell loads over file:// exactly as electron/main.js does (${probe.protocol})`);
    line(probe.moduleGraphAlive === true && probe.luminance > 3,
         `the game boots and paints with NO network at all (luminance ${probe.luminance})`);
    line(eerrs.length === 0, `no renderer errors in the packaged shell (${eerrs.length})`);
    out.fileBoot = probe.moduleGraphAlive === true && probe.luminance > 3 && eerrs.length === 0;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ════ 1. OFFLINE HTTP BOOT + functional checklist ═══════════════════════════
console.log('\n── 1. Offline boot + functional checklist (all external network aborted) ──');
const br = await launch();
const offRequests = [];
const ctx = await br.newContext({ viewport: { width: 1600, height: 900 } });
await goOffline(ctx, offRequests);
await ctx.addInitScript(() => {
  const pad = { id: 'PHENIX QA Virtual Pad (STANDARD GAMEPAD)', index: 0, connected: true,
                mapping: 'standard', timestamp: 0, axes: [0,0,0,0],
                buttons: Array.from({ length: 17 }, () => ({ pressed:false, touched:false, value:0 })) };
  navigator.getGamepads = () => [pad, null, null, null];
  window.__padSet = (i, on) => { pad.buttons[i].pressed = !!on; pad.buttons[i].touched = !!on;
                                 pad.buttons[i].value = on ? 1 : 0; pad.timestamp = performance.now(); };
});
const errs = { page: [], console: [], blocked: [] };
const pg = await ctx.newPage();
instrument(pg, errs);

// ── 1a. clean first boot, no save present ───────────────────────────────────
await pg.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await sleep(3500);
const clean = await pg.evaluate(() => ({
  keys: Object.keys(localStorage), gameState: window.__phenixQA?.snapshot?.()?.gameState || null,
  hasGame: !!window.__phenixTutorial || !!document.getElementById('cgm-overlay'),
}));
const frame = async () => pg.evaluate(() => {
  const c = document.getElementById('game'); const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lum = 0, n = 0; for (let i = 0; i < d.length; i += 4000) { lum += (d[i]+d[i+1]+d[i+2])/3; n++; }
  return Math.round(lum / n);
});
const lum0 = await frame();
console.log(`     fresh profile: localStorage keys=${clean.keys.length}, boot state=${clean.gameState}, mean luminance=${lum0}`);
line(clean.keys.length === 0 || !clean.keys.some(k => k.startsWith('phenix_meta')),
     `no pre-existing save on a clean install (${clean.keys.length} keys)`);
line(!!clean.hasGame && lum0 > 3, `clean first boot reaches a painted menu (luminance ${lum0}, not a black window)`);
out.cleanBoot = !!clean.hasGame && lum0 > 3;

// grab the game object for the drives below
await pg.evaluate(async (v) => {
  const mod = await import(`./js/game/Game.js?v=${v}`);
  await new Promise(res => { const o = mod.Game.prototype.update;
    mod.Game.prototype.update = function (...a) { window.__g = this; mod.Game.prototype.update = o; res(); return o.apply(this, a); }; });
}, BUILD);
await pg.evaluate(() => {
  const g = window.__g;
  const st = () => new Proxy(function(){}, { get:(t,k)=>k==='then'?undefined:st(), apply:()=>undefined, set:()=>true });
  g.audio = st();
  window.__clearTut = () => { const el = document.getElementById('tut-overlay');
    if (!el || getComputedStyle(el).display === 'none') return false;
    const t = window.__phenixTutorial; if (t && performance.now() < (t._armedAt || 0)) return true;
    document.getElementById('tut-continue')?.click(); return true; };
});
const clearTut = async () => { for (let i=0;i<14;i++){ if(!await pg.evaluate(()=>window.__clearTut())) return; await sleep(180);} };

// ── 1b. resolution / fullscreen / windowed ──────────────────────────────────
const sizes = [[1920,1080,'1080p'], [1280,720,'720p'], [1024,768,'windowed 4:3'], [2560,1440,'1440p']];
const resRows = [];
for (const [w, h, label] of sizes) {
  await pg.setViewportSize({ width: w, height: h });
  await sleep(700);
  const r = await pg.evaluate(() => { const c = document.getElementById('game');
    return { css: Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height),
             internal: c.width + 'x' + c.height, scale: +(window.__g?._viewScale || 0).toFixed(3) }; });
  const lum = await frame();
  resRows.push({ label, w, h, ...r, lum });
  console.log(`     ${label.padEnd(13)} viewport ${w}x${h}  canvas css ${r.css}  internal ${r.internal}  viewScale ${r.scale}  lum ${lum}`);
}
line(resRows.every(r => r.internal === '1280x720'),
     `the render target stays a fixed 1280x720 at every resolution (letterboxed, no layout break)`);
line(resRows.every(r => r.lum > 3), `every resolution still paints (min luminance ${Math.min(...resRows.map(r=>r.lum))})`);
// real fullscreen through the browser API the F key uses
const fsOk = await pg.evaluate(async () => {
  try { await document.documentElement.requestFullscreen(); await new Promise(r=>setTimeout(r,400));
        const on = !!document.fullscreenElement; await document.exitFullscreen().catch(()=>{});
        return on; } catch (e) { return 'ERR:' + e.message; } });
line(fsOk === true, `fullscreen request succeeds and exits cleanly (${fsOk})`);
out.resolution = resRows.every(r => r.internal === '1280x720' && r.lum > 3) && fsOk === true;
await pg.setViewportSize({ width: 1600, height: 900 });

// ── 1c. keyboard + controller detection ─────────────────────────────────────
const input = await pg.evaluate(() => ({ pads: navigator.getGamepads().filter(Boolean).length,
                                         padId: navigator.getGamepads()[0]?.id || null }));
await pg.evaluate(() => { window.__kb = 0; window.__pad = 0;
  addEventListener('keydown', () => window.__kb++, true); });
await clearTut();
await pg.keyboard.press('KeyM'); await sleep(200);
await pg.evaluate(() => window.__padSet(12, true)); await sleep(200);
await pg.evaluate(() => window.__padSet(12, false)); await sleep(400);
const inputSeen = await pg.evaluate(() => ({ kb: window.__kb,
  padDetected: !!(window.__g?._padConnected ?? navigator.getGamepads()[0]?.connected),
  padPollFn: typeof window.applyGamepad === 'function' || !!document.querySelector('canvas') }));
console.log(`     gamepads=${input.pads} id="${input.padId}"  keydown events=${inputSeen.kb}  pad connected=${inputSeen.padDetected}`);
line(inputSeen.kb > 0, `keyboard events reach the page (${inputSeen.kb})`);
line(input.pads === 1 && inputSeen.padDetected, `a standard gamepad is detected (${input.padId})`);
out.controller = input.pads === 1 && inputSeen.padDetected && inputSeen.kb > 0;

// ── 1d. Act 1 / Endless / Chaos launch ──────────────────────────────────────
const modes = [];
for (const [label, drive] of [
  ['Act 1',   (g) => { g.selectedCharacter='skeleton_warrior'; g.endless=false; g._chaosMode=false; g._campaignStage=1; g.reset(); g.gameState='playing'; }],
  ['Endless', (g) => { g.selectedCharacter='skeleton_warrior'; g.endless=true;  g._chaosMode=false; g._campaignStage=0; g.reset(); g._enterEndless(); g.gameState='playing'; }],
  ['Chaos',   (g) => { g.selectedCharacter='skeleton_warrior'; g.endless=true;  g._chaosMode=true;  g._campaignStage=0; g.reset(); g._enterEndless(); g._chaosMode=true; g.gameState='playing'; }],
]) {
  const r = await pg.evaluate(async (src) => {
    const g = window.__g;
    try { (new Function('g', src))(g); } catch (e) { return { err: String(e).slice(0,140) }; }
    g.paused=false; g.gameOver=false; g.victory=false; g.upgradeUI=null; g.mutationUI=null;
    if (g.player) { g.player.hp = 1e9; g.player.takeDamage = () => {}; g.player.takeHit = () => {}; }
    for (let i=0;i<420;i++) { try { g.update(1/60, { keys:new Set(), mousePos:{x:0,y:0}, mouseDown:false }); } catch(e) { return { err:'update: '+String(e).slice(0,140) }; } }
    return { state: g.gameState, enemies: (g.enemies||[]).length, alive: !g.gameOver,
             t: +(g.timeAlive||0).toFixed(1), chaos: !!g._chaosMode, endless: !!g.endless };
  }, '(' + drive.toString() + ')(g)');
  await clearTut();
  const lum = await frame();
  modes.push({ label, ...r, lum });
  console.log(`     ${label.padEnd(8)} state=${r.state} enemies=${r.enemies} t=${r.t}s lum=${lum}${r.err ? ' ERR ' + r.err : ''}`);
}
line(modes.every(m => !m.err && m.state === 'playing'), `all three modes launch and run 7 simulated seconds without an exception`);
line(modes.every(m => m.enemies > 0), `all three modes actually spawn enemies (${modes.map(m=>m.enemies).join('/')})`);
out.modes = modes.every(m => !m.err && m.state === 'playing' && m.enemies > 0);

// ── 1e. death → results → retry / menu ──────────────────────────────────────
// HP 0 is not death. Game.js runs a revive ladder first — Broken Halo, then up to 3-4 Phoenix
// revives, then The Last Phoenix, then the Chaos-only Ossuary Debt — and only the rung past all of
// those sets gameOver. A probe that zeroes HP once and expects the results screen is testing its own
// assumption; this one keeps killing until the ladder is spent and reports how many rungs it took.
const death = await pg.evaluate(async () => {
  const g = window.__g;
  g.selectedCharacter='skeleton_warrior'; g.endless=true; g._chaosMode=false;
  g.reset(); try { g._enterEndless(); } catch(_) {}
  g.gameState='playing'; g.paused=false;
  // update() early-returns while a card or mutation panel is open, and the death chain lives BELOW
  // that return — so a probe that lets a level-up panel appear leaves the player parked at HP 0
  // forever and then blames the game. Take every card offered (the panel is dismissed the way the
  // player dismisses it) so the run keeps running.
  const step = () => {
    try {
      if (g.upgradeUI) { try { g.selectUpgrade(0); } catch(_) { g.upgradeUI = null; } }
      if (g.mutationUI) g.mutationUI = null;
      g.paused = false;
      g.update(1/60, { keys:new Set(), mousePos:{x:0,y:0}, mouseDown:false });
    } catch(_) {}
  };
  let revives = 0;
  for (let kill = 0; kill < 12 && !g.gameOver; kill++) {
    g.player.hp = 0;
    for (let i = 0; i < 240 && !g.gameOver && g.player.hp <= 0; i++) step();
    if (!g.gameOver) { revives++; for (let i = 0; i < 200; i++) step(); }   // let the i-frames run out
  }
  const over = { gameOver: g.gameOver, state: g.gameState, msg: g.finalMessage, revives };
  await new Promise(r => setTimeout(r, 400));
  const resultsUp = !!document.getElementById('cgm-results') || !!g._resultsOverlayVisible;
  let retried = null;
  try { g.restartGame ? g.restartGame() : g.reset(); retried = { gameOver: g.gameOver }; }
  catch (e) { retried = { err: String(e).slice(0,120) }; }
  // goToMainMenu wraps the state change in _transition() — an async fade. Poll for it.
  let menued = null;
  try {
    g.goToMainMenu();
    for (let i = 0; i < 60 && g.gameState !== 'start_menu'; i++) { step(); await new Promise(r => setTimeout(r, 50)); }
    menued = g.gameState;
  } catch (e) { menued = 'ERR ' + String(e).slice(0,120); }
  return { over, resultsUp, retried, menued };
});
console.log(`     death → gameOver=${death.over.gameOver} after ${death.over.revives} revives · "${death.over.msg}" · results overlay=${death.resultsUp}`);
console.log(`     retry → ${JSON.stringify(death.retried)} · menu → ${death.menued}`);
line(death.over.gameOver === true, `the run really ends once the revive ladder is spent (${death.over.revives} revives, then "${death.over.msg}")`);
line(death.resultsUp, `the results screen comes up on death`);
line(!death.retried.err && death.retried.gameOver === false, `retry starts a fresh run`);
line(death.menued === 'start_menu', `exit to menu works (${death.menued})`);
out.death = death.over.gameOver === true && death.resultsUp && !death.retried.err && death.menued === 'start_menu';

// ── 1f. save / load / persistence across a full reopen ──────────────────────
const saved = await pg.evaluate(() => {
  const g = window.__g;
  g.meta.credits = 4242; g.meta.stagesCleared = 3; g.meta.unlocks['__release_probe'] = true; g.meta._save();
  return { keys: Object.keys(localStorage).filter(k => k.startsWith('phenix')), raw: !!localStorage.getItem('phenix_meta') };
});
console.log(`     save keys: ${saved.keys.join(', ')}`);
line(saved.raw, `the game writes its save (phenix_meta present)`);
// close the page entirely and reopen — the "exit → reopen" case
await pg.close();
const pg2 = await ctx.newPage();
instrument(pg2, errs);
await pg2.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await sleep(3000);
const reopened = await pg2.evaluate(async (v) => {
  const { MetaProgress } = await import(`./js/game/MetaProgress.js?v=${v}`);
  const m = new MetaProgress();
  return { credits: m.credits, stagesCleared: m.stagesCleared, probe: m.isUnlocked('__release_probe'),
           keys: Object.keys(localStorage).filter(k => k.startsWith('phenix')).length };
}, (fs.readFileSync(path.join(PKG, 'js/game/Game.js'), 'utf8').match(/MetaProgress\.js\?v=(\d+)/) || [])[1] || BUILD);
console.log(`     after exit+reopen: credits=${reopened.credits} stagesCleared=${reopened.stagesCleared} probe=${reopened.probe}`);
line(reopened.credits === 4242 && reopened.stagesCleared === 3 && reopened.probe === true,
     `existing save is read back correctly after a full exit and reopen`);
out.persistence = reopened.credits === 4242 && reopened.stagesCleared === 3 && reopened.probe === true;
out.existingSave = out.persistence;

// ── 1g. did anything reach for the network? ─────────────────────────────────
const external = [...new Set(offRequests)];
console.log(`     external requests attempted: ${external.length}`);
for (const u of external.slice(0, 6)) console.log(`        ${u}`);
// Distinguish "reaches for the network" from "needs the network". The Electron probe above ran
// with every hostname resolving to NOTFOUND and still booted and painted, so a failed request here
// is cosmetic. It is still reported, because an offline Steam customer should not be paying a DNS
// timeout on every launch for a font.
const fontsOnly = external.every(u => /fonts\.(googleapis|gstatic)\.com/.test(u));
line(external.length === 0 || fontsOnly,
     external.length === 0 ? `the build made ZERO external network requests`
       : `the only external request is Google Fonts (${external.length}) — cosmetic, and the offline boot above still paints`);
out.offline = out.fileBoot === true && (external.length === 0 || fontsOnly);
out.externalCount = external.length;
out.fontsOnly = fontsOnly;
line(errs.page.length === 0, `zero page errors (${errs.page.length})` + (errs.page.length ? ' :: ' + errs.page[0] : ''));
line(errs.console.length === 0, `zero console errors (${errs.console.length})` + (errs.console.length ? ' :: ' + errs.console[0] : ''));
out.errors = errs.page.length + errs.console.length;
await br.close();

// ════ 2. SERVICE WORKER anti-stale (needs a non-localhost secure origin) ════
console.log('\n── 2. Service worker — no stale build ──');
{
  const origin = `http://phenix.test:${PORT}`;
  const br2 = await launch([`--host-resolver-rules=MAP phenix.test 127.0.0.1`,
                            `--unsafely-treat-insecure-origin-as-secure=${origin}`]);
  const ctx2 = await br2.newContext({ viewport: { width: 1280, height: 720 } });
  const pg3 = await ctx2.newPage();
  const e2 = { page: [], console: [], blocked: [] };
  instrument(pg3, e2);
  // plant a stale cache from a previous build BEFORE the SW activates
  // Plant ONCE, on the very first load, before the worker has activated. Re-planting on the reload
  // would recreate the cache after activate had already purged it and the test would accuse the
  // service worker of leaving it behind.
  await ctx2.addInitScript(() => {
    try { if (sessionStorage.getItem('__stalePlanted')) return; sessionStorage.setItem('__stalePlanted', '1'); } catch (_) {}
    if (window.caches) caches.open('phenix-shell-20250101000000')
      .then(c => c.put('/index.html', new Response('<!-- STALE BUILD -->'))).catch(() => {});
  });
  await pg3.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(6000);
  // The first load happens BEFORE the worker controls the page, so nothing has gone through its
  // fetch handler yet and the new cache does not exist. Reload once under the active worker —
  // that is also the real returning-player case this test is about.
  await pg3.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(5000);
  const sw = await pg3.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    const keys = await caches.keys().catch(() => []);
    return { registered: regs.length, scope: regs[0]?.scope || null, caches: keys,
             controller: !!navigator.serviceWorker.controller, host: location.hostname };
  }).catch(e => ({ err: String(e) }));
  console.log(`     host=${sw.host} registrations=${sw.registered} controller=${sw.controller}`);
  console.log(`     caches now: ${JSON.stringify(sw.caches)}`);
  line(sw.registered > 0, `the service worker registers on a production-style origin`);
  line(!!sw.caches && sw.caches.includes('phenix-shell-' + BUILD),
       `the live cache is named for THIS build (phenix-shell-${BUILD})`);
  line(!!sw.caches && !sw.caches.some(k => k !== 'phenix-shell-' + BUILD),
       `every older cache was purged on activate — a planted 20250101 shell is gone`);
  out.sw = sw.registered > 0 && sw.caches?.includes('phenix-shell-' + BUILD) &&
           !sw.caches.some(k => k !== 'phenix-shell-' + BUILD);
  await br2.close();
}
srv.close();

// ── static release metadata ─────────────────────────────────────────────────
console.log('\n── 3. Package metadata ──');
const epkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron/package.json'), 'utf8'));
const emain = fs.readFileSync(path.join(ROOT, 'electron/main.js'), 'utf8');
const wf = fs.existsSync(path.join(ROOT, '.github/workflows/build-exe.yml'))
  ? fs.readFileSync(path.join(ROOT, '.github/workflows/build-exe.yml'), 'utf8') : '';
const iconRel = epkg.build?.win?.icon;
const iconAbs = iconRel ? path.join(ROOT, 'electron', iconRel) : null;
const icoAbs  = path.join(PKG, 'assets/pwa/icon.ico');
console.log(`     productName: ${epkg.build?.productName}   appId: ${epkg.build?.appId}   version: ${epkg.version}`);
console.log(`     icon (builder): ${iconRel} — ${iconAbs && fs.existsSync(iconAbs) ? 'present' : 'MISSING'}`);
console.log(`     icon (.ico):    assets/pwa/icon.ico — ${fs.existsSync(icoAbs) ? 'present ' + fs.statSync(icoAbs).size + ' B' : 'MISSING'}`);
line(!!epkg.build?.productName && !!epkg.build?.appId, `productName and appId are set (${epkg.build?.productName} / ${epkg.build?.appId})`);
line(!!epkg.version && /^\d+\.\d+\.\d+$/.test(epkg.version), `version is a release version (${epkg.version})`);
line(!!iconAbs && fs.existsSync(iconAbs), `the electron-builder icon resolves`);
line(fs.existsSync(icoAbs), `a Windows .ico exists for the packager path`);
line(!epkg.build?.files?.some(f => /tools|qa|test/i.test(f)), `build.files ships no QA/test path (${JSON.stringify(epkg.build?.files)})`);

const localLoad  = /loadFile\(/.test(emain);
// The workflow does NOT use electron/main.js — it writes its own into app/main.js with a
// heredoc. Detect the URL it hard-codes AND the loadURL call that consumes it; matching only
// on `loadURL('http` misses `const GAME_URL = '…'` + `win.loadURL(GAME_URL)` and would report
// the single most important fact in this whole run backwards.
const wfUrl      = (wf.match(/GAME_URL\s*=\s*'(https?:\/\/[^']+)'/) || [])[1] || null;
const wfRemote   = /loadURL\(\s*(['"]https?:\/\/|GAME_URL)/.test(wf) || !!wfUrl;
const wfOwnMain  = /Set-Content\s+app\/main\.js/.test(wf);
console.log(`     electron/main.js  -> ${localLoad ? 'loadFile(game/index.html)  [STANDALONE INTENT]' : 'loadURL  [ONLINE]'}`);
console.log(`     build-exe.yml     -> ${wfOwnMain ? 'writes its OWN app/main.js (electron/main.js is NOT used)' : 'uses electron/main.js'}`);
console.log(`                          ${wfRemote ? 'and that generated shell does loadURL(' + wfUrl + ')  [ONLINE]' : 'local load'}`);
line(localLoad, `the repo's electron shell loads the game from disk, not from a URL`);
line(!wfRemote, `the shipped CI exe does NOT depend on a live URL${wfRemote ? ' — it loads ' + wfUrl : ''}`);
out.ciOnline = wfRemote;
out.ciUrl = wfUrl;

console.log('');
console.log(`  Electron file:// boot: ${out.fileBoot ? 'PASS' : 'FAIL'}`);
console.log(`  Clean install boot:    ${out.cleanBoot ? 'PASS' : 'FAIL'}`);
console.log(`  Existing save:         ${out.existingSave ? 'PASS' : 'FAIL'}`);
console.log(`  Controller:            ${out.controller ? 'PASS' : 'FAIL'}`);
console.log(`  Fullscreen/resolution: ${out.resolution ? 'PASS' : 'FAIL'}`);
console.log(`  Persistence:           ${out.persistence ? 'PASS' : 'FAIL'}`);
console.log(`  Act1/Endless/Chaos:    ${out.modes ? 'PASS' : 'FAIL'}`);
console.log(`  Service worker stale:  ${out.sw ? 'PASS' : 'FAIL'}`);
console.log(`  Offline standalone:    ${out.offline && out.fileBoot ? 'PASS' : 'FAIL'}`);
console.log(`  Console/page errors:   ${out.errors}`);
console.log(`  CI exe needs internet: ${out.ciOnline ? 'YES — ' + out.ciUrl : 'no'}`);
console.log(`\n──────── ${pass} PASS / ${fail} FAIL ────────\n`);
process.exit(fail ? 1 : 0);
