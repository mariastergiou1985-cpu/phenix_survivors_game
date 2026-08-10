// ════════════════════════════════════════════════════════════════════════════════
// CONTROLLER GAMEPLAY GATE — does pad input reach the hero while something else owns the screen?
//
// A real Chromium run with a virtual STANDARD gamepad. For every state where the run is frozen or
// a panel has focus, the driver holds the left stick and every face/shoulder button for ~0.8 s and
// then asks a question that cannot be argued with: DID THE GAMEPLAY BRANCH RUN?
//
// Two independent detectors, because either one alone can be explained away:
//   · GAMEPLAY KEYS. padSetHeld/padTap in main.js dispatch real KeyboardEvents on window for
//     w/a/s/d/shift/q/e/space/c/v. A capture-phase listener counts them. Arrow keys and the card
//     shortcuts are deliberately NOT counted — those are the menu branch doing its job.
//   · gamepadAimDir. Only the gameplay branch ever writes game.gamepadAimDir (to a vector or to
//     null). The probe stores a sentinel object first; if it is still the sentinel afterwards, that
//     branch never ran. This works even while the game is paused and nothing is updating.
//
// CONTROL SCENARIO FIRST. Plain gameplay must show BOTH detectors firing, otherwise a clean sheet
// everywhere else would only prove that the harness cannot see anything.
//
// Run: node tools/qa/browser/controller_gate_proof.mjs [port]
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 8971;

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
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const rows = [];
const T = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

srv.listen(PORT, async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    headless: !process.env.DISPLAY, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
    try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 6 })); } catch (_) {}
    const p = {
      id: 'PHENIX QA Virtual Pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
      index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    navigator.getGamepads = () => [p, null, null, null];
    window.__padSet = (i, on) => {
      p.buttons[i].pressed = !!on; p.buttons[i].touched = !!on;
      p.buttons[i].value = on ? 1 : 0; p.timestamp = performance.now();
    };
    window.__padAxes = (lx, ly, rx, ry) => { p.axes = [lx, ly, rx, ry]; p.timestamp = performance.now(); };
    // GAMEPLAY-KEY COUNTER. Capture phase on window, so it sees the synthetic events main.js's own
    // gamepad layer dispatches before any handler can stop them.
    window.__gk = 0; window.__gkSeen = [];
    const GK = new Set(['w', 'a', 's', 'd', 'shift', 'q', 'e', ' ', 'c', 'v']);
    window.addEventListener('keydown', (ev) => {
      const k = (ev.key || '').toLowerCase();
      if (GK.has(k)) { window.__gk++; if (window.__gkSeen.length < 12) window.__gkSeen.push(k === ' ' ? 'SPACE' : k); }
    }, true);
  });
  const pg = await ctx.newPage();
  const pageErrors = [], consoleErrors = [];
  pg.on('pageerror', e => pageErrors.push((String(e) + ' | ' + (e?.stack || '')).slice(0, 400)));
  pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
  await pg.goto(`http://localhost:${PORT}/index.html?qa=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 30000 });
  await pg.mouse.click(640, 400).catch(() => {});

  const clearTutorial = async (max = 12) => {
    for (let n = 0; n < max; n++) {
      if (!(await pg.evaluate(() => !!document.querySelector('#tut-card, #tut-continue')))) return;
      try { await pg.click('#tut-continue', { timeout: 1200 }); } catch (_) { await pg.keyboard.press('Enter'); }
      await sleep(240);
    }
  };
  const settle = async () => { await sleep(150); await pg.evaluate(() => { window.__phenixQA?._settleFade?.(); }); await sleep(150); };
  const click = async (sel, opts = {}) => { await clearTutorial(); await pg.click(sel, { timeout: 10000, ...opts }); await settle(); };
  const waitState = async (w, ms = 8000) => {
    try { await pg.waitForFunction(x => window.__phenixQA?.snapshot?.()?.gameState === x, w, { timeout: ms }); return true; }
    catch (_) { return false; }
  };

  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await waitState('mode_select');
  await click('#cgm-modesel .msl-card[data-mode="endless"]', { force: true });
  if (await waitState('mode_intro', 3000)) await click('#mi-continue');
  await waitState('character_select');
  await click('#csc-endless-btn').catch(async () => { await click('#csc-start-btn'); });
  await waitState('playing', 12000);
  await clearTutorial();

  await pg.evaluate(async (build) => {
    const { Game } = await import('./js/game/Game.js?v=' + build);
    if (!window.__cgHooked) {
      const o = Game.prototype.update;
      Game.prototype.update = function (...a) { window.__g = this; return o.apply(this, a); };
      window.__cgHooked = true;
    }
  }, BUILD);
  await pg.waitForFunction(() => !!window.__g, undefined, { timeout: 20000 });
  await sleep(600);
  await clearTutorial();
  console.log(`\n  build ${BUILD} · live Endless run\n`);

  // ── one scenario: set the state, drive the pad hard, ask whether gameplay ran ────────────
  const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, start: 9 };
  //
  // PINNING. Holding every button at once includes A/Cross and Start, and in a pause menu or a
  // post-arena panel those are RESUME and CHOOSE — they legitimately close the very state under
  // test, after which the pad drives the hero for real. That is the panel working, not a leak, and
  // an unpinned probe scores it as a leak. `setup` is therefore re-applied every 60 ms for the
  // whole window, so the question stays "does the gate hold while the state is up".
  const drive = async (setup, teardown) => {
    await pg.evaluate(setup);
    await pg.evaluate(() => {
      window.__gk = 0; window.__gkSeen = [];
      window.__aimSentinel = { sentinel: true };
      window.__g.gamepadAimDir = window.__aimSentinel;
    });
    await sleep(120);
    const pin = setInterval(() => { pg.evaluate(setup).catch(() => {}); }, 60);
    await pg.evaluate(() => window.__padAxes(0.95, -0.95, 0.8, 0.6));   // both sticks off-centre
    for (const b of Object.values(BTN)) await pg.evaluate(i => window.__padSet(i, true), b);
    await sleep(800);
    for (const b of Object.values(BTN)) await pg.evaluate(i => window.__padSet(i, false), b);
    await pg.evaluate(() => window.__padAxes(0, 0, 0, 0));
    await sleep(220);
    clearInterval(pin);
    const out = await pg.evaluate(() => ({
      gk: window.__gk, keys: window.__gkSeen.join(','),
      aimTouched: window.__g.gamepadAimDir !== window.__aimSentinel,
      state: window.__g.gameState, paused: !!window.__g.paused,
    }));
    if (teardown) await pg.evaluate(teardown);
    await sleep(250);
    return out;
  };
  const leaked = r => r.gk > 0 || r.aimTouched;
  const fmt = r => `keys=${r.gk}${r.keys ? '(' + r.keys + ')' : ''} aimDirWritten=${r.aimTouched} state=${r.state} paused=${r.paused}${r.measuredInRun === false ? ' NOT-IN-RUN' : ''}`;

  // Some panels legitimately END the run when confirmed (the post-arena choice returns to the main
  // menu). A scenario measured from the main menu proves nothing, so the run is rebuilt through the
  // real menu route before every scenario and the state it was measured in is printed.
  const enterRun = async () => {
    const st = await pg.evaluate(() => window.__phenixQA?.snapshot?.()?.gameState);
    // Start/Options maps to Escape outside gameplay, so a previous scenario can leave the run
    // PAUSED. Clear it here or the next scenario inherits a gate it did not set.
    if (st === 'playing') { await pg.evaluate(() => { window.__g.paused = false; }); await sleep(150); return true; }
    await pg.evaluate(() => { const g = window.__g; if (g) { g.paused = false; g.gameOver = false; g.victory = false;
      g.upgradeUI = null; g.mutationUI = null; g._postArenaChoice = false; g._clsVisible = false;
      g._stageCompleteBanner = null; g._vaultPending = false; }
      window.__phenixTutModal = false; window.__phenixArsenalModal = false; });
    await pg.evaluate(() => { try { window.__g.goToMainMenu(); } catch (_) {} });
    await settle();
    await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]').catch(() => {});
    await waitState('mode_select', 5000);
    await click('#cgm-modesel .msl-card[data-mode="endless"]', { force: true }).catch(() => {});
    if (await waitState('mode_intro', 3000)) await click('#mi-continue').catch(() => {});
    await waitState('character_select', 5000);
    await click('#csc-endless-btn').catch(async () => { await click('#csc-start-btn').catch(() => {}); });
    const ok = await waitState('playing', 12000);
    await clearTutorial();
    await sleep(400);
    return ok;
  };

  // ── CONTROL — the detector must be able to see a leak, or nothing below means anything ──
  const control = await drive(() => {}, null);
  T('CONTROL plain gameplay DOES drive the hero (the detector works)', leaked(control), fmt(control));
  rows.push(['(control) gameplay', control, true]);

  const SCEN = [
    ['paused',              () => { window.__g.paused = true; },                        () => { window.__g.paused = false; }],
    // The stand-in panels carry the members Game.draw() and main.js touch, and selectUpgrade /
    // selectMutation are stubbed for the duration: a card CHOICE is the menu branch working
    // correctly, and letting it run a real upgrade off three null cards would only throw inside the
    // harness's own object. Nothing about the gate under test is stubbed.
    ['upgradeUI card panel',() => { const g = window.__g;
                              g.__selU = g.__selU || g.selectUpgrade; g.selectUpgrade = () => {};
                              g.upgradeUI = g.upgradeUI || { choices: [null, null, null], selectedIndex: 0, draw() {}, seedHover() {}, hover() {}, hitTest() { return -1; } }; },
                            () => { const g = window.__g; g.upgradeUI = null; if (g.__selU) { g.selectUpgrade = g.__selU; g.__selU = null; } }],
    ['mutationUI panel',    () => { const g = window.__g;
                              g.__selM = g.__selM || g.selectMutation; g.selectMutation = () => {};
                              g.mutationUI = g.mutationUI || { choices: [null, null, null], selectedIndex: 0, draw() {}, seedHover() {}, hover() {}, hitTest() { return -1; } }; },
                            () => { const g = window.__g; g.mutationUI = null; if (g.__selM) { g.selectMutation = g.__selM; g.__selM = null; } }],
    ['_postArenaChoice',    () => { window.__g._postArenaChoice = true; },               () => { window.__g._postArenaChoice = false; }],
    ['_clsVisible chaos law', () => { window.__g._clsVisible = true; },                  () => { window.__g._clsVisible = false; }],
    ['STAGE COMPLETE banner', () => { window.__g._stageCompleteBanner = { n: 1, isFinal: false, allDone: false, start: performance.now() }; },
                                                                                        () => { window.__g._stageCompleteBanner = null; }],
    ['tutorial modal',      () => { window.__phenixTutModal = true; },                   () => { window.__phenixTutModal = false; }],
    ['NULL ARSENAL modal',  () => { window.__phenixArsenalModal = true; },               () => { window.__phenixArsenalModal = false; }],
    ['gameOver',            () => { window.__g.gameOver = true; },                       () => { window.__g.gameOver = false; }],
    ['victory',             () => { window.__g.victory = true; },                        () => { window.__g.victory = false; }],
    ['RELICS screen focus', () => { window.__g.__cgPrev = window.__g.gameState; window.__g.gameState = 'relics'; },
                                                                                        () => { window.__g.gameState = window.__g.__cgPrev || 'playing'; }],
    ['HANGAR screen focus', () => { window.__g.__cgPrev = window.__g.gameState; window.__g.gameState = 'hangar'; },
                                                                                        () => { window.__g.gameState = window.__g.__cgPrev || 'playing'; }],
    ['STAGE COMPLETE banner + paused (as shipped)',
                            () => { window.__g._stageCompleteBanner = { n: 1, isFinal: false, allDone: false, start: performance.now() }; window.__g.paused = true; },
                                                                                        () => { window.__g._stageCompleteBanner = null; window.__g.paused = false; }],
  ];

  for (const [name, setup, teardown] of SCEN) {
    const live = await enterRun();
    const r = await drive(setup, teardown);
    r.measuredInRun = live && r.state === 'playing';
    T(`no gameplay input while ${name}`, !leaked(r), fmt(r));
    rows.push([name, r, false]);
  }

  // INVERTED CONTROL. _vaultPending means "a vault window is open but a boss rush / arena / Titan
  // owns the screen" — it is set during LIVE combat and must NOT gate anything, or the pad would go
  // dead in the middle of a boss fight. This scenario passes only if input still gets through.
  await enterRun();
  const vault = await drive(() => { window.__g._vaultPending = true; }, () => { window.__g._vaultPending = false; });
  T('_vaultPending does NOT gate the pad (it is a live-combat deferral flag)', leaked(vault), fmt(vault));
  rows.push(['(inverted) _vaultPending', vault, true]);

  // the run must still be alive and drivable after all that
  await enterRun();
  const after = await drive(() => {}, null);
  T('the pad still drives the hero once everything is closed', leaked(after), fmt(after));
  T('zero page errors', pageErrors.length === 0, pageErrors[0] || '');
  T('zero console errors', consoleErrors.length === 0, consoleErrors[0] || '');

  console.log('\n  ── leak table ─────────────────────────────────────────────');
  for (const [n, r, wantLeak] of rows) {
    const l = leaked(r);
    console.log(`    ${(l ? 'INPUT REACHED HERO' : 'blocked').padEnd(20)} ${n.padEnd(26)} ${fmt(r)}${wantLeak ? '   (expected)' : (l ? '   <<< LEAK' : '')}`);
  }
  const leaks = rows.filter(([, r, expected]) => !expected && leaked(r)).map(([n]) => n);
  console.log(`\n  Controller input leak: ${leaks.length ? 'YES — ' + leaks.join(', ') : 'NO'}`);
  console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══\n`);
  await ctx.close(); await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
});
