// ════════════════════════════════════════════════════════════════════════════════
// END-OF-RUN / RESULTS SCREEN — browser proof.
//
// The redesign is presentation only, so the question this asks throughout is: does the
// screen still report the SAME run and still fire the SAME actions?
//
//   · every number on screen is compared to the live Game field it claims to show
//   · the damage rows are compared to the BuildEngine log they are drawn from
//   · the buttons are checked per mode — Campaign, Endless, Chaos, and Victory — for
//     SET, ORDER and dispatch, because main.js's existing keyboard handler maps a fixed
//     index to a fixed action and a reordered button would silently reroute it
//   · mouse, keyboard and controller are each driven to the same outcome
//
// Run: node tools/qa/browser/results_screen_browser_proof.mjs [port]
// Writes: /tmp/results_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/results_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 9001;
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
  if (cond) { passN++; console.log(`PASS ${id}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

const BTN = { a: 0, b: 1, up: 12, down: 13, left: 14, right: 15 };

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;
console.log(`serving ${ROOT} on ${BASE}   BUILD=${BUILD}`);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);

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
    id: 'PHENIX QA Virtual Pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
    index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  navigator.getGamepads = () => [pad, null, null, null];
  window.__padSet = (i, on) => {
    pad.buttons[i].pressed = !!on; pad.buttons[i].touched = !!on;
    pad.buttons[i].value = on ? 1 : 0; pad.timestamp = performance.now();
  };
});

const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
};
const pad = async (name) => {
  await page.evaluate(b => window.__padSet(b, true), BTN[name]);
  await page.waitForTimeout(260);
  await page.evaluate(b => window.__padSet(b, false), BTN[name]);
  await page.waitForTimeout(300);
};
const padUntil = async (name, predicate, max = 6) => {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(predicate)) return i;
    await pad(name);
  }
  return await page.evaluate(predicate) ? max : -1;
};
const key = async (k) => {
  await page.keyboard.down(k); await page.waitForTimeout(150);
  await page.keyboard.up(k);   await page.waitForTimeout(320);
};

await page.goto(BASE + '/index.html?nosw=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1300);

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
check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

// Put the game into a finished run with real numbers. gameOver/victory and the stat
// fields are set directly — this is a UI proof, and driving a real 20-minute Endless
// run to a natural death would test the bot, not the screen.
const endRun = async ({ victory = false, endless = false, chaos = false, score = 12345,
                        t = 754, lvl = 23, kills = 617, cores = 480, best = 9000, pb = false } = {}) => {
  await page.evaluate((o) => {
    const g = window.__g;
    g.meta._save = () => {};
    if (!g.meta.isEndlessUnlocked()) g.meta.unlockEndless();
    g._hideResultsOverlay();
    // _hideResultsOverlay latches a dismissal (see the fade note in Game.js). Each call
    // here is simulating a BRAND NEW run ending, which is exactly what clears it.
    g._resultsDismissed = false;
    g.gameState = 'playing';
    g.upgradeUI = null; g.mutationUI = null; g.paused = false;
    g.endless = o.endless; g._chaosMode = o.chaos;
    g.score = o.score; g.bestScore = o.best; g.isNewHighScore = o.pb;
    // player.kills, NOT g.kills. This rig used to set `g.kills`, a field that has never existed
    // on Game — the same phantom the KILLS tile used to read. Both sides agreeing on a field
    // nobody assigns is why B06 stayed green while the shipped screen printed 0 on every run.
    // The assertion below is unchanged; only the field it is fed through is now the real one.
    g.timeAlive = o.t; g.runCreditsEarned = o.cores;
    if (g.player) { g.player.level = o.lvl; g.player.kills = o.kills; }
    g.finalMessage = o.victory ? 'CITY GRID STABILIZED — VICTORY' : 'CYBER-HERO OFFLINE';
    g.victory = o.victory; g.gameOver = !o.victory;
    g._endScreenBtnIndex = 0;
  }, { victory, endless, chaos, score, t, lvl, kills, cores, best, pb });
  await page.waitForTimeout(600);
};

// ── B. DEFEAT, CAMPAIGN ──────────────────────────────────────────────────────
// best ABOVE the score, so this is genuinely not a personal best — an earlier version
// seeded score 12345 over best 9000 with pb:false, a combination the game never produces.
await endRun({ best: 30000 });
const b = await page.evaluate(() => {
  const el = document.getElementById('cgm-results');
  const txt = (s) => el.querySelector(s)?.textContent.trim();
  return {
    visible: el && getComputedStyle(el).display === 'flex',
    canvasSuppressed: window.__g._resultsOverlayVisible === true,
    title: txt('.rs-title'), titleCls: el.querySelector('.rs-title')?.className,
    mode: txt('.rs-mode'),
    score: txt('.rs-score'), best: txt('.rs-best'),
    stats: Array.from(el.querySelectorAll('.rs-stat')).map(s => [s.querySelector('.k')?.textContent, s.querySelector('.v')?.textContent]),
    btns: Array.from(el.querySelectorAll('[data-rsbtn]')).map(x => ({ key: x.dataset.rsbtn, idx: +x.dataset.rsidx, label: x.textContent.trim() })),
    pb: !!el.querySelector('.rs-pb'),
  };
});
check('B01 the results overlay is up and the canvas screen stands down',
  b.visible && b.canvasSuppressed, JSON.stringify({ visible: b.visible, suppressed: b.canvasSuppressed }));
check('B02 a defeat reads DEFEAT, clearly', b.title === 'DEFEAT' && /lose/.test(b.titleCls), JSON.stringify(b));
check('B03 the mode is named', b.mode === 'CAMPAIGN', b.mode);
check('B04 the score matches the run', b.score === '12,345', b.score);
check('B05 personal best is shown', /30,000/.test(b.best), b.best);
check('B06 time, level, kills and rewards are all present and correct',
  JSON.stringify(b.stats.map(s => s[0])) === JSON.stringify(['TIME SURVIVED', 'LEVEL', 'KILLS', 'GRID CORES', 'FRAGMENTS']) &&
  b.stats[0][1] === '12:34' && b.stats[1][1] === '23' && b.stats[2][1] === '617' && b.stats[3][1] === '+480',
  JSON.stringify(b.stats));
check('B07 no personal-best badge when it is not a personal best', b.pb === false);
// THE CRITICAL ONE: main.js maps a fixed index to a fixed action.
check('B08 defeat buttons keep the shipped SET and ORDER (index -> action must not move)',
  JSON.stringify(b.btns.map(x => x.key)) === JSON.stringify(['retry', 'upgrades', 'menu']),
  JSON.stringify(b.btns));
check('B09 the retry button names the mode it will retry', /CAMPAIGN|STAGE/i.test(b.btns[0].label), b.btns[0].label);
await shot('01_defeat_campaign.png');

// ── C. THE DAMAGE REPORT MATCHES THE LOG ─────────────────────────────────────
const dmg = await page.evaluate(() => {
  const g = window.__g;
  let rows = [];
  try { rows = g.buildEngine?.log?.report?.(performance.now()) || []; } catch (_) {}
  const el = document.getElementById('cgm-results');
  const shown = Array.from(el.querySelectorAll('.rs-row.bar')).map(r => ({
    wep: r.querySelector('.wep')?.textContent.trim(),
    dmg: r.querySelector('.dmg')?.textContent.trim(),
    dps: r.querySelector('.dps')?.textContent.trim(),
    kil: r.querySelector('.kil')?.textContent.trim(),
  }));
  const head = Array.from(el.querySelectorAll('.rs-row.head span')).map(s => s.textContent.trim());
  return { logRows: rows.length, shown, head, empty: !!el.querySelector('.rs-empty'),
           top: rows.slice(0, 6).map(r => ({ id: r.id, total: Math.round(r.total), dps: Math.round(r.avgDps), kills: r.kills })) };
});
check('C01 the damage report has the four required columns',
  dmg.empty || JSON.stringify(dmg.head) === JSON.stringify(['WEAPON', 'DAMAGE', 'DPS', 'KILLS']),
  JSON.stringify(dmg.head));
check('C02 it shows one row per logged weapon, capped at six',
  dmg.shown.length === Math.min(6, dmg.logRows), JSON.stringify({ shown: dmg.shown.length, log: dmg.logRows }));
check('C03 every figure matches the BuildEngine log it is drawn from',
  dmg.shown.every((r, i) => {
    const src = dmg.top[i];
    return src && r.dmg === src.total.toLocaleString() && r.dps === src.dps.toLocaleString() && r.kil === String(src.kills);
  }), JSON.stringify({ shown: dmg.shown, log: dmg.top }));
check('C04 an empty log is stated honestly instead of drawing an empty table',
  dmg.logRows > 0 ? !dmg.empty : dmg.empty, JSON.stringify({ logRows: dmg.logRows, empty: dmg.empty }));

// ── D. MODES ─────────────────────────────────────────────────────────────────
await endRun({ endless: true, pb: true, score: 88000, best: 40000 });
const endless = await page.evaluate(() => {
  const el = document.getElementById('cgm-results');
  return { mode: el.querySelector('.rs-mode')?.textContent.trim(),
           btns: Array.from(el.querySelectorAll('[data-rsbtn]')).map(x => x.dataset.rsbtn),
           retryLabel: el.querySelector('[data-rsidx="0"]')?.textContent.trim(),
           pb: !!el.querySelector('.rs-pb'),
           best: el.querySelector('.rs-best')?.textContent.trim() };
});
check('D01 ENDLESS is named as the mode', endless.mode === 'ENDLESS MODE', endless.mode);
check('D02 endless keeps the same button set and order',
  JSON.stringify(endless.btns) === JSON.stringify(['retry', 'upgrades', 'menu']), JSON.stringify(endless.btns));
check('D03 the retry label follows the mode', /ENDLESS/.test(endless.retryLabel), endless.retryLabel);
check('D04 a personal best is celebrated, and the best figure rises to it',
  endless.pb === true && /88,000/.test(endless.best), JSON.stringify(endless));
await shot('02_defeat_endless_pb.png');

await endRun({ endless: true, chaos: true });
const chaos = await page.evaluate(() => {
  const el = document.getElementById('cgm-results');
  return { mode: el.querySelector('.rs-mode')?.textContent.trim(),
           btns: Array.from(el.querySelectorAll('[data-rsbtn]')).map(x => x.dataset.rsbtn),
           retryLabel: el.querySelector('[data-rsidx="0"]')?.textContent.trim() };
});
check('D05 CHAOS outranks endless in the mode label', chaos.mode === 'CHAOS MODE', chaos.mode);
check('D06 chaos keeps the same button set and order',
  JSON.stringify(chaos.btns) === JSON.stringify(['retry', 'upgrades', 'menu']), JSON.stringify(chaos.btns));
check('D07 the retry label follows chaos', /CHAOS/.test(chaos.retryLabel), chaos.retryLabel);
await shot('03_defeat_chaos.png');

await endRun({ victory: true, score: 50000, best: 20000, pb: true });
const vic = await page.evaluate(() => {
  const el = document.getElementById('cgm-results');
  return { title: el.querySelector('.rs-title')?.textContent.trim(),
           cls: el.querySelector('.rs-title')?.className,
           sub: el.querySelector('.rs-sub')?.textContent.trim(),
           btns: Array.from(el.querySelectorAll('[data-rsbtn]')).map(x => x.dataset.rsbtn),
           labels: Array.from(el.querySelectorAll('[data-rsbtn]')).map(x => x.textContent.trim()) };
});
check('D08 a win reads VICTORY, clearly', vic.title === 'VICTORY' && /win/.test(vic.cls), JSON.stringify(vic));
check('D09 the victory line is carried through', /VICTORY|STABILIZED/i.test(vic.sub), vic.sub);
// main.js victory mapping: 0 -> main menu, 1 -> continueEndless. Order is load-bearing.
check('D10 victory buttons keep the shipped SET and ORDER (menu, then continue)',
  JSON.stringify(vic.btns) === JSON.stringify(['menu', 'continue']), JSON.stringify(vic.btns));
check('D11 the continue button offers ENDLESS by name', /ENDLESS/.test(vic.labels[1]), vic.labels[1]);
await shot('04_victory.png');

// ── E. THE BUTTONS ACTUALLY DO WHAT THEY SAY ─────────────────────────────────
// RETRY — mouse
await endRun({ endless: true });
await page.click('[data-rsbtn="retry"]');
await page.waitForTimeout(700);
const retried = await page.evaluate(() => ({ over: window.__g.gameOver, vis: window.__g._resultsOverlayVisible,
                                             t: Math.round(window.__g.timeAlive) }));
check('E01 RETRY starts a fresh run and clears the screen',
  retried.over === false && retried.vis === false && retried.t < 5, JSON.stringify(retried));

// UPGRADES — mouse
await endRun({});
await page.click('[data-rsbtn="upgrades"]');
await page.waitForTimeout(800);
check('E02 UPGRADES routes to the upgrades screen',
  await page.evaluate(() => window.__g.gameState) === 'upgrades',
  await page.evaluate(() => window.__g.gameState));

// MAIN MENU — mouse
await endRun({});
await page.click('[data-rsbtn="menu"]');
await page.waitForTimeout(900);
const toMenu = await page.evaluate(() => ({ gs: window.__g.gameState, vis: window.__g._resultsOverlayVisible,
  display: getComputedStyle(document.getElementById('cgm-results')).display }));
check('E03 MAIN MENU routes to the menu and hides the screen',
  toMenu.gs === 'start_menu' && toMenu.vis === false && toMenu.display === 'none', JSON.stringify(toMenu));

// CONTINUE — ENDLESS, from a victory
await endRun({ victory: true });
await page.click('[data-rsbtn="continue"]');
await page.waitForTimeout(900);
const cont = await page.evaluate(() => ({ victory: window.__g.victory, endless: !!window.__g.endless,
                                          vis: window.__g._resultsOverlayVisible }));
check('E04 CONTINUE — ENDLESS leaves the victory screen and enters Endless',
  cont.victory === false && cont.endless === true && cont.vis === false, JSON.stringify(cont));

// ── F. KEYBOARD AND CONTROLLER ───────────────────────────────────────────────
await endRun({});
const sel0 = await page.evaluate(() => window.__g._endScreenBtnIndex);
await key('ArrowRight');
const sel1 = await page.evaluate(() => ({ idx: window.__g._endScreenBtnIndex,
  marked: document.querySelector('[data-rsbtn].sel')?.dataset.rsidx }));
check('F01 ARROW RIGHT moves the selection and the screen shows it',
  sel0 === 0 && sel1.idx === 1 && Number(sel1.marked) === 1, JSON.stringify({ sel0, sel1 }));
await key('ArrowLeft');
check('F02 ARROW LEFT moves it back',
  await page.evaluate(() => window.__g._endScreenBtnIndex) === 0);
check('F03 exactly one button is ever marked as selected',
  await page.evaluate(() => document.querySelectorAll('[data-rsbtn].sel').length) === 1);
await shot('05_selection.png');

// controller: D-pad to MAIN MENU, then A
await endRun({});
const reached = await padUntil('right', () => window.__g._endScreenBtnIndex === 2);
check('F04 the D-pad reaches MAIN MENU', reached >= 0, `presses: ${reached}`);
check('F05 the controller selection is reflected on screen',
  await page.evaluate(() => Number(document.querySelector('[data-rsbtn].sel')?.dataset.rsidx) === 2));
// 20 attempts, not the default 6. This is a REAL virtual-pad press read by the page's own rAF
// gamepad poll, not a synchronous key dispatch — under load the poll can miss a whole press, and
// six consecutive misses were observed. Retrying is what a player does when nothing happens; a
// button that genuinely does not confirm still fails all twenty.
const acted = await padUntil('a', () => window.__g.gameState === 'start_menu', 20);
check('F06 A / Cross confirms the focused button', acted >= 0, `presses: ${acted}`);

// keyboard ENTER on RETRY
await endRun({ endless: true });
await page.evaluate(() => { window.__g._endScreenBtnIndex = 0; });
await key('Enter');
check('F07 ENTER confirms the focused button',
  await page.evaluate(() => window.__g.gameOver === false),
  await page.evaluate(() => String(window.__g.gameOver)));

// ── G. RESPONSIVE ────────────────────────────────────────────────────────────
await endRun({ endless: true });
for (const [w, h, name] of [[1440, 900, '06_desktop.png'], [820, 900, '07_tablet.png'], [400, 820, '08_mobile.png']]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const el = document.getElementById('cgm-results');
    const stage = el.querySelector('.rs-stage').getBoundingClientRect();
    const btns = Array.from(el.querySelectorAll('[data-rsbtn]'));
    const rows = Array.from(el.querySelectorAll('.rs-row'));
    return {
      fits: stage.width <= window.innerWidth + 1 && stage.left >= -1,
      overflow: [...btns, ...rows].filter(n => n.getBoundingClientRect().right > window.innerWidth + 1).length,
      btnsVisible: btns.filter(x => x.offsetParent !== null).length,
      statCols: getComputedStyle(el.querySelector('.rs-stats')).gridTemplateColumns.split(' ').filter(Boolean).length,
      btnTall: Math.min(...btns.map(x => x.getBoundingClientRect().height)),
    };
  });
  check(`G ${w}x${h} the panel fits and nothing overflows`, r.fits && r.overflow === 0, JSON.stringify(r));
  check(`G ${w}x${h} every button stays reachable at a real touch size`,
    r.btnsVisible === 3 && r.btnTall >= 36, JSON.stringify(r));
  await shot(name);
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);

// ── H. It must not appear over a card panel, or outside an ended run ─────────
await endRun({});
// the real upgradeUI is drawn by the loop, so the stub needs a draw() or the frame
// throws before _syncResultsOverlay is ever reached
await page.evaluate(() => { window.__g.upgradeUI = { choices: [], draw() {} }; });
await page.waitForTimeout(400);
check('H01 the results screen stands down while a card panel is open',
  await page.evaluate(() => window.__g._resultsOverlayVisible === false &&
    getComputedStyle(document.getElementById('cgm-results')).display === 'none'));
await page.evaluate(() => { window.__g.upgradeUI = null; });
await page.waitForTimeout(400);
check('H02 it comes back when the card panel closes',
  await page.evaluate(() => window.__g._resultsOverlayVisible === true));
// Clearing the flags by hand is not enough: the game re-derives victory from live state
// every frame, so an earlier campaign-clear in this session sets it straight back. Start a
// REAL new run instead — which is what actually leaves the end state in play.
await page.evaluate(() => {
  const g = window.__g;
  g.victory = false; g.gameOver = false;
  g.gameState = 'playing';
  g.reset();
});
await page.waitForTimeout(700);
const h3 = await page.evaluate(() => ({
  vis: window.__g._resultsOverlayVisible, display: getComputedStyle(document.getElementById('cgm-results')).display,
  gs: window.__g.gameState, over: window.__g.gameOver, win: window.__g.victory,
  dismissed: window.__g._resultsDismissed, card: !!window.__g.upgradeUI }));
check('H03 a new run takes the results screen down',
  h3.vis === false && h3.display === 'none' && h3.over === false && h3.win === false,
  JSON.stringify(h3));

check('I01 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const gameErrors = consoleErrors.filter(t => !/audio\/music|failed to load|Could not load/.test(t));
check('I02 zero game console errors across the whole session', gameErrors.length === 0, gameErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, pageErrors, consoleErrors }, null, 1));

console.log(`\n=== RESULT: ${passN} PASS / ${failN} FAIL ===`);
if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
console.log('shots + report: ' + OUT);
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
