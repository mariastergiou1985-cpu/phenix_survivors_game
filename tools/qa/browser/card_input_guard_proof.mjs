// ════════════════════════════════════════════════════════════════════════════════
// CARD PANEL INPUT GUARD — an upgrade/reward card can only be left by picking one.
//
// THE BUG, stated as what the code actually did rather than as what it looked like. Triangle is
// the ULTIMATE in gameplay; on a card panel the same button is a direct shortcut for card 3, and
// B/Circle is dash in gameplay but REROLL on the panel. The panel opens between two gamepad
// polls, so a press the player made for gameplay was still held when applyGamepad next ran and
// landed on the panel instead: Triangle instantly selected card 3 and Circle silently burned the
// reroll. From the player's seat the cards vanished and the upgrade was gone — which is exactly
// how Maria described it. It was never a Back/Cancel: ESC could not close a panel before this
// commit either, and E01/E02 assert that on BOTH builds.
//
// The fix is a press guard, not a remap: a face button may only act on a panel once EVERY face
// button has been released after the panel appeared, plus a 200 ms settle window that swallows a
// spam re-press across the same transition. No shortcut is removed and nothing is rebound.
//
//   G-block  GAMEPLAY IS UNTOUCHED — Triangle still fires the ultimate before the panel, and
//            again after a card is chosen.
//   S-block  THE SPAM — Triangle held across the transition, and mashed during the panel, picks
//            nothing. The panel is still open and the choices are still the same three.
//   B-block  NO BACK — ESC, B/Circle and Start/Options cannot dismiss a panel.
//   F-block  STILL USABLE — a real, fresh press after the guard arms selects normally, and the
//            reroll still works when the player actually means it.
//
// Run: node tools/qa/browser/card_input_guard_proof.mjs [port]
// Writes: /tmp/card_input_guard_proof/  (report.json)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/card_input_guard_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8991;
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

const BUILD  = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];
// The module stamps, read from the files that DECLARE them. This commit changes main.js but not
// Game.js, so BUILD and the Game.js stamp legitimately differ — importing Game.js at ?v=BUILD
// fetched a SECOND module instance and the update hook never fired, because the running game was
// built from the other one. Every stamp is now taken from its own declaration site.
const GAME_V = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').match(/Game\.js\?v=(\d+)/)[1];
const UUI_V  = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8').match(/UpgradeUI\.js\?v=(\d+)/)[1];

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

// A FAKE PAD, installed before the page's own scripts run, so the shipped Gamepad class polls it
// through navigator.getGamepads exactly as it would poll a real DualSense. Nothing in main.js or
// Gamepad.js is stubbed: the guard under test runs for real.
await page.addInitScript(() => {
  window.__pad = { a: 0, b: 0, x: 0, y: 0, lb: 0, rb: 0, lt: 0, rt: 0,
                   back: 0, start: 0, l3: 0, r3: 0, up: 0, down: 0, left: 0, right: 0 };
  const ORDER = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'l3', 'r3',
                 'up', 'down', 'left', 'right'];
  // defineProperty on the PROTOTYPE, not `navigator.getGamepads = ...`. The plain assignment is
  // rejected (the property is read-only), which threw inside the init script and left window.__pad
  // undefined — so the shipped poll read it every frame and killed the page. Measured: the whole
  // proof hung before its first check.
  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true, writable: true,
    value: function () {
      return [{
        id: 'PROOF PAD (Vendor: 054c Product: 0ce6)', index: 0, connected: true, mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: ORDER.map(n => ({ pressed: !!window.__pad[n], touched: !!window.__pad[n],
                                   value: window.__pad[n] ? 1 : 0 })),
        timestamp: 0,
      }];
    },
  });
});

await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1300);

check('A00 the cache-bust chain agrees on sw.js and index.html', BUILD === IDX_V, `${BUILD} / ${IDX_V}`);
await page.evaluate(async (build) => {
  const mod = await import(`./js/game/Game.js?v=${build}`);
  await new Promise((res) => {
    const orig = mod.Game.prototype.update;
    mod.Game.prototype.update = function (...a) {
      window.__g = this; mod.Game.prototype.update = orig; res(); return orig.apply(this, a);
    };
  });
}, GAME_V);
check('A01 live Game instance captured on the shipped ?v=', await page.evaluate(() => !!window.__g));
check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await page.evaluate(() => {
  const g = window.__g;
  g.meta._save = () => {};

  // Drive the SHIPPED gamepad bridge. applyGamepad is not exported, so it is reached the only way
  // it ever runs: by letting the real rAF loop tick. One "frame" = one animation frame, which is
  // one applyGamepad call, which is one gamepad poll — the same granularity the bug lives at.
  window.__frames = (n) => new Promise((res) => {
    let i = 0;
    const tick = () => { if (++i >= n) return res(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  window.__hold = (btn, v) => { window.__pad[btn] = v ? 1 : 0; };

  window.__startRun = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing';
    try { g._beginChaosRun(); } catch (_) {}
    g.gameOver = false; g.victory = false; g.paused = false;
    g.upgradeUI = null; g.mutationUI = null;
    g._postArenaChoice = null; g._clsVisible = false;
  };

  // Ultimate detection: the shipped bridge taps ' ' for Y/Triangle in gameplay. Count the key
  // events rather than the ability firing, because the ability has its own cooldown and this
  // block is about INPUT reaching gameplay, not about the ultimate's own rules.
  window.__space = 0;
  window.addEventListener('keydown', (e) => { if (e.key === ' ') window.__space++; }, true);

  window.__panel = () => (g.upgradeUI ? { open: true, n: g.upgradeUI.choices.length,
                                          sel: g.upgradeUI.selectedIndex,
                                          names: g.upgradeUI.choices.map(c => c.name) }
                                      : { open: false });
});

// Build a real UpgradeUI with real choices, and record every selectUpgrade / rerollUpgrade call.
await page.evaluate(async (build) => {
  const g = window.__g;
  const mod = await import(`./js/game/UpgradeUI.js?v=${build}`);
  window.__UpgradeUI = mod.UpgradeUI;
  window.__log = { selected: [], rerolled: 0 };
  const origSel = g.selectUpgrade.bind(g);
  const origRr  = g.rerollUpgrade ? g.rerollUpgrade.bind(g) : null;
  // Intercept, do NOT suppress: the panel must really close on a real pick, or F01 would pass
  // against a panel that simply never closes.
  g.selectUpgrade = function (i) { window.__log.selected.push(i); g.upgradeUI = null; };
  g.rerollUpgrade = function () { window.__log.rerolled++; };
  window.__origSel = origSel; window.__origRr = origRr;
  window.__open = () => {
    const choices = [0, 1, 2].map(i => ({
      key: 'proof_' + i, name: 'PROOF CARD ' + (i + 1), description: 'Proof card',
      rarity: 'common', icon: '+', iconColor: '#2ee6f6', level: 1, maxLevel: 5,
    }));
    g.upgradeUI = new window.__UpgradeUI(choices, { title: 'PROOF' });
    window.__log.selected.length = 0; window.__log.rerolled = 0;
  };
}, UUI_V);

// ════════════════════════════════════════════════════════════════════════════
// G. GAMEPLAY IS UNTOUCHED
// ════════════════════════════════════════════════════════════════════════════
const before = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  await window.__frames(6);
  window.__space = 0;
  for (let i = 0; i < 4; i++) {                  // four clean Triangle taps in gameplay
    window.__hold('y', 1); await window.__frames(3);
    window.__hold('y', 0); await window.__frames(3);
  }
  return { space: window.__space, state: g.gameState, panel: !!g.upgradeUI };
});
check('G01 Triangle still fires the ULTIMATE in normal gameplay — nothing was remapped',
  before.space >= 4 && before.panel === false && before.state === 'playing',
  JSON.stringify(before));

// ════════════════════════════════════════════════════════════════════════════
// S. THE SPAM
// ════════════════════════════════════════════════════════════════════════════
const held = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  await window.__frames(4);
  window.__hold('y', 1);                          // Triangle DOWN for the ultimate...
  await window.__frames(3);
  window.__open();                                // ...and the panel opens underneath it
  await window.__frames(30);                      // half a second of it still being held
  const mid = { open: !!g.upgradeUI, sel: window.__log.selected.slice(), rr: window.__log.rerolled };
  window.__hold('y', 0);
  return mid;
});
check('S01 Triangle HELD across the panel opening picks nothing — the panel is still open',
  held.open === true && held.sel.length === 0 && held.rr === 0, JSON.stringify(held));

const spam = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  await window.__frames(4);
  // Mash Triangle continuously, and let the panel open in the middle of the mashing.
  let opened = false;
  for (let i = 0; i < 14; i++) {
    window.__hold('y', 1); await window.__frames(2);
    window.__hold('y', 0); await window.__frames(2);
    if (i === 3 && !opened) { window.__open(); opened = true; }
    if (window.__log.selected.length) break;      // stop at the first pick so the count is honest
  }
  const out = { open: !!g.upgradeUI, sel: window.__log.selected.slice(), rr: window.__log.rerolled,
                names: g.upgradeUI ? g.upgradeUI.choices.map(c => c.name) : null };
  window.__hold('y', 0);
  return out;
});
check('S02 Triangle SPAMMED through the transition never picks anything — the panel stays open',
  spam.sel.length === 0 && spam.open === true, JSON.stringify(spam));
check('S03 all three cards are still on offer — nothing was consumed',
  spam.names && spam.names.length === 3 &&
  JSON.stringify(spam.names) === JSON.stringify(['PROOF CARD 1', 'PROOF CARD 2', 'PROOF CARD 3']),
  JSON.stringify(spam.names));

const dash = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  await window.__frames(4);
  window.__hold('b', 1);                          // dash held as the panel opens
  await window.__frames(3);
  window.__open();
  await window.__frames(30);
  const out = { open: !!g.upgradeUI, rr: window.__log.rerolled, sel: window.__log.selected.slice() };
  window.__hold('b', 0);
  return out;
});
check('S04 B/Circle held across the opening does NOT burn the reroll',
  dash.rr === 0 && dash.sel.length === 0 && dash.open === true, JSON.stringify(dash));

const square = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  await window.__frames(4);
  window.__hold('x', 1); window.__hold('a', 1);
  await window.__frames(3);
  window.__open();
  await window.__frames(30);
  const out = { open: !!g.upgradeUI, sel: window.__log.selected.slice() };
  window.__hold('x', 0); window.__hold('a', 0);
  return out;
});
check('S05 X/Square and A/Cross bleed the same way and are stopped the same way',
  square.sel.length === 0 && square.open === true, JSON.stringify(square));

// ════════════════════════════════════════════════════════════════════════════
// B. NO BACK / CANCEL
// ════════════════════════════════════════════════════════════════════════════
const back = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  window.__open();
  await window.__frames(20);
  const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  for (let i = 0; i < 5; i++) { esc(); }
  await window.__frames(6);
  const afterEsc = { open: !!g.upgradeUI, paused: !!g.paused, sel: window.__log.selected.slice() };
  // Start/Options and B/Circle, the two pad buttons that mean "back" everywhere else.
  window.__hold('start', 1); await window.__frames(3); window.__hold('start', 0);
  await window.__frames(6);
  window.__hold('b', 1); await window.__frames(3); window.__hold('b', 0);
  await window.__frames(6);
  return { afterEsc, open: !!g.upgradeUI, paused: !!g.paused,
           sel: window.__log.selected.slice(), state: g.gameState };
});
check('B01 ESC cannot dismiss an upgrade panel, and does not pause behind it',
  back.afterEsc.open === true && back.afterEsc.paused === false && back.afterEsc.sel.length === 0,
  JSON.stringify(back.afterEsc));
check('B02 Start/Options and B/Circle cannot dismiss it either',
  back.open === true && back.paused === false, JSON.stringify(back));

// ════════════════════════════════════════════════════════════════════════════
// F. STILL USABLE
// ════════════════════════════════════════════════════════════════════════════
const fresh = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  window.__open();
  await window.__frames(40);                       // let the guard arm (release + settle window)
  window.__hold('y', 1); await window.__frames(3);
  window.__hold('y', 0); await window.__frames(3);
  return { open: !!g.upgradeUI, sel: window.__log.selected.slice() };
});
check('F01 Triangle selects NOTHING on a panel even fully armed — it is the ultimate, not a card key',
  fresh.sel.length === 0 && fresh.open === true, JSON.stringify(fresh));

const sq = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  window.__open();
  await window.__frames(40);
  window.__hold('x', 1); await window.__frames(3);
  window.__hold('x', 0); await window.__frames(3);
  return { open: !!g.upgradeUI, sel: window.__log.selected.slice() };
});
check('F01b X/Square still takes card 2 — removing Triangle left no card unreachable',
  sq.sel.length === 1 && sq.sel[0] === 1 && sq.open === false, JSON.stringify(sq));

const confirm = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  window.__open();
  await window.__frames(40);
  window.__hold('a', 1); await window.__frames(3);
  window.__hold('a', 0); await window.__frames(3);
  return { open: !!g.upgradeUI, sel: window.__log.selected.slice() };
});
check('F02 A/Cross still confirms the highlighted card',
  confirm.sel.length === 1 && confirm.sel[0] === 0 && confirm.open === false, JSON.stringify(confirm));

const rr = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  window.__open();
  await window.__frames(40);
  window.__hold('b', 1); await window.__frames(3);
  window.__hold('b', 0); await window.__frames(3);
  return { open: !!g.upgradeUI, rr: window.__log.rerolled };
});
check('F03 the reroll still works when the player actually means it',
  rr.rr === 1 && rr.open === true, JSON.stringify(rr));

const after = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  window.__open();
  await window.__frames(40);
  window.__hold('a', 1); await window.__frames(3);
  window.__hold('a', 0); await window.__frames(8);   // card chosen, panel closed
  window.__space = 0;
  for (let i = 0; i < 3; i++) {
    window.__hold('y', 1); await window.__frames(3);
    window.__hold('y', 0); await window.__frames(3);
  }
  return { panel: !!g.upgradeUI, space: window.__space, state: g.gameState };
});
check('F04 after a normal card selection Triangle is the ULTIMATE again — the guard resets',
  after.panel === false && after.space >= 3 && after.state === 'playing', JSON.stringify(after));

const draw = await page.evaluate(async () => {
  const g = window.__g;
  window.__startRun();
  await window.__frames(20);
  const ctx = (document.querySelector('canvas#game') ||
    [...document.querySelectorAll('canvas')].find(x => x.width > 400)).getContext('2d');
  let err = null;
  try { g.draw(ctx); } catch (e) { err = String(e); }
  const d = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
  let sum = 0, max = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += v; if (v > max) max = v;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  const n = Math.floor(d.length / (4 * 97));
  return { err, state: g.gameState, mean: sum / n, max, colors: colors.size };
});
check('R01 the game still renders — no black screen',
  draw.err === null && draw.state === 'playing' && draw.mean > 3 && draw.max > 40 && draw.colors > 30,
  JSON.stringify(draw));
check('R02 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('R03 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); }
fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, failures }, null, 2));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
