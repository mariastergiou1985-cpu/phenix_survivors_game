// ════════════════════════════════════════════════════════════════════════════════
// THREE SCOPED FIXES — browser proof (self-hosting Chromium, real injected gamepad).
//
//   A. GRID FORGE bulk conversion (Cores -> Fragments)
//   B. Chaos Law Selection — keyboard / controller navigation
//   C. Post-Endless (post-arena) panel — the controller reaches it at all
//
// THE ECONOMY IS THE THING TO PROTECT IN (A). So the forge is not checked by reading
// the dialog: every conversion is measured against MetaProgress itself — cores spent,
// fragments gained, the rate they imply, and the loop guard (rewardedPFTotal) that
// keeps forged fragments out of the pilot-level metric. Forging N in one go must cost
// exactly what forging one N times costs; that is asserted directly, by running both.
//
// (B) and (C) are checked by driving a REAL navigator.getGamepads() pad through the
// production route, and by confirming the mouse path still ends in the same state.
//
// Self-hosting and self-versioning: serves the repo and reads BUILD from sw.js.
//
// Run: node tools/qa/browser/forge_chaoslaw_postendless_proof.mjs [port]
// Writes: /tmp/three_fix_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/three_fix_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8955;
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

const pageErrors = [], consoleErrors = [], notFound = [];
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/.test(t)) return;
  consoleErrors.push(t);
});
page.on('response', r => { if (r.status() === 404) notFound.push(new URL(r.url()).pathname); });
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
// A press must span >= 1 game frame; headless delivery is imperfect, so navigation
// steps below press until the expected state is reached, bounded, and report the count.
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

await page.goto(BASE + '/index.html?nosw=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1200);

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
check('A03 zero non-404 console errors at boot', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

const RATE = await page.evaluate(async (mpv) => {
  const mp = await import(`./js/game/MetaProgress.js?v=${mpv}`);
  return mp.GRID_TO_PF_RATE ?? null;
}, fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8').match(/MetaProgress\.js\?v=(\d+)/)[1]);

// ════════════════════════════════════════════════════════════════════════════
// A. GRID FORGE — bulk conversion
// ════════════════════════════════════════════════════════════════════════════
const openForge = async (cores) => {
  await page.evaluate((c) => {
    const g = window.__g;
    g.meta._save = () => {};
    g.meta.credits = c;
    g.gameState = 'upgrades';
    g._showUpgradesOverlay ? g._showUpgradesOverlay() : g.goToUpgrades();
  }, cores);
  await page.waitForTimeout(500);
  await page.click('#cgu-forge-btn');
  await page.waitForTimeout(350);
};
await openForge(100000);
const opened = await page.evaluate(() => ({
  open: document.getElementById('cgu-forge-modal')?.classList.contains('open'),
  chips: Array.from(document.querySelectorAll('#cgu-fq .cgu-fchip')).map(c => Number(c.dataset.qty)),
  hasInput: !!document.getElementById('cgu-fqty'),
  hasMax: !!document.getElementById('cgu-fmax'),
  prev: document.getElementById('cgu-fprev')?.textContent.replace(/\s+/g, ' ').trim(),
}));
check('B01 the GRID FORGE button opens a quantity dialog instead of forging on the spot', opened.open === true);
check('B02 quantity chips step by 10 up to 100 (plus a single)',
  JSON.stringify(opened.chips) === JSON.stringify([1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]),
  JSON.stringify(opened.chips));
check('B03 a numeric quantity field and a MAX button exist', opened.hasInput && opened.hasMax, JSON.stringify(opened));
check('B04 the preview names the cost and the fragments before confirming',
  /CORES/.test(opened.prev) && /FRAGMENTS/.test(opened.prev) && /BALANCE AFTER/.test(opened.prev), opened.prev);
await shot('01_forge_dialog.png');

// preview arithmetic must equal the rate the economy actually uses
const previews = [];
for (const q of [10, 50, 100]) {
  await page.click(`#cgu-fq .cgu-fchip[data-qty="${q}"]`);
  await page.waitForTimeout(200);
  previews.push(await page.evaluate((rate) => {
    const t = document.getElementById('cgu-fprev').textContent.replace(/ /g, ' ');
    const cost = Number((t.match(/([\d,]+)\s*⬡\s*CORES/) || [])[1]?.replace(/,/g, ''));
    const gain = Number((t.match(/\+(\d+)\s*🧩/) || [])[1]);
    return { qty: window.__g._forgeQty, cost, gain, rate,
             input: document.getElementById('cgu-fqty').value,
             on: document.querySelector('#cgu-fq .cgu-fchip.on')?.dataset.qty };
  }, RATE));
}
check('B05 the preview cost is exactly qty * GRID_TO_PF_RATE at every quantity',
  previews.every(p => p.cost === p.qty * RATE), JSON.stringify(previews));
check('B06 the preview fragments equal the chosen quantity',
  previews.every(p => p.gain === p.qty), JSON.stringify(previews));
check('B07 the chip selection and the numeric field stay in sync',
  previews.every(p => Number(p.on) === p.qty && Number(p.input) === p.qty), JSON.stringify(previews));

// typing into the field drives the same state
await page.fill('#cgu-fqty', '37');
await page.waitForTimeout(250);
const typed = await page.evaluate(() => ({
  qty: window.__g._forgeQty,
  cost: Number((document.getElementById('cgu-fprev').textContent.match(/([\d,]+)/) || [])[1]?.replace(/,/g, '')),
}));
check('B08 typing a quantity is accepted and priced', typed.qty === 37 && typed.cost === 37 * RATE, JSON.stringify(typed));

// MAX clamps to what the balance can actually buy
await page.evaluate(() => { window.__g.meta.credits = 7 * 30 + 5; window.__g._syncUpgradesOverlay(); });
await page.click('#cgu-fmax');
await page.waitForTimeout(250);
const maxed = await page.evaluate(() => ({
  qty: window.__g._forgeQty,
  afford: window.__g.meta.affordableForgedPF(),
  confirmDisabled: document.getElementById('cgu-forge-confirm').disabled,
}));
check('B09 MAX picks exactly meta.affordableForgedPF()', maxed.qty === maxed.afford, JSON.stringify(maxed));
check('B10 an affordable quantity leaves CONFIRM enabled', maxed.confirmDisabled === false, JSON.stringify(maxed));

// unaffordable quantity is blocked, and blocked means nothing moves
await page.click('#cgu-fq .cgu-fchip[data-qty="100"]');
await page.waitForTimeout(250);
const poor0 = await page.evaluate(() => ({
  cores: window.__g.meta.credits, frags: window.__g.meta.protocolFragments,
  disabled: document.getElementById('cgu-forge-confirm').disabled,
  poorStyle: document.getElementById('cgu-fprev').classList.contains('poor'),
}));
check('B11 an unaffordable quantity disables CONFIRM and marks the preview', poor0.disabled === true && poor0.poorStyle === true,
  JSON.stringify(poor0));
await page.evaluate(() => window.__g._confirmForge());   // force the path even so
await page.waitForTimeout(250);
const poor1 = await page.evaluate(() => ({ cores: window.__g.meta.credits, frags: window.__g.meta.protocolFragments }));
check('B12 forcing an unaffordable forge spends nothing and grants nothing',
  poor1.cores === poor0.cores && poor1.frags === poor0.frags, JSON.stringify({ poor0, poor1 }));

// THE ECONOMY CHECK: bulk must equal the loop, exactly.
const econ = await page.evaluate((rate) => {
  const g = window.__g, m = g.meta;
  const snap = () => ({ c: m.credits, f: m.protocolFragments, r: m.rewardedPFTotal });
  m.credits = 100000; m.protocolFragments = 0; m.rewardedPFTotal = 0;
  const a0 = snap();
  g._forgeQty = 25; g._confirmForge();
  const a1 = snap();
  m.credits = 100000; m.protocolFragments = 0; m.rewardedPFTotal = 0;
  const b0 = snap();
  for (let i = 0; i < 25; i++) { g._forgeQty = 1; g._confirmForge(); }
  const b1 = snap();
  return {
    bulk: { cores: a0.c - a1.c, frags: a1.f - a0.f, ledger: a1.r - a0.r },
    loop: { cores: b0.c - b1.c, frags: b1.f - b0.f, ledger: b1.r - b0.r },
    expectedCores: 25 * rate,
  };
}, RATE);
check('B13 forging 25 at once costs exactly 25 * GRID_TO_PF_RATE',
  econ.bulk.cores === econ.expectedCores && econ.bulk.frags === 25, JSON.stringify(econ));
check('B14 bulk and one-at-a-time are identical — no discount, no premium',
  econ.bulk.cores === econ.loop.cores && econ.bulk.frags === econ.loop.frags, JSON.stringify(econ));
check('B15 the pilot-level loop guard still absorbs every forged fragment',
  econ.bulk.ledger === 25 && econ.loop.ledger === 25, JSON.stringify(econ));

// CANCEL is a real no-op
await page.evaluate(() => { window.__g.meta.credits = 100000; window.__g._openForgeModal(); });
await page.waitForTimeout(250);
const c0 = await page.evaluate(() => ({ c: window.__g.meta.credits, f: window.__g.meta.protocolFragments }));
await page.click('#cgu-forge-cancel');
await page.waitForTimeout(250);
const c1 = await page.evaluate(() => ({
  c: window.__g.meta.credits, f: window.__g.meta.protocolFragments,
  open: document.getElementById('cgu-forge-modal').classList.contains('open'),
}));
check('B16 CANCEL closes the dialog and changes nothing',
  c1.open === false && c1.c === c0.c && c1.f === c0.f, JSON.stringify({ c0, c1 }));

// mouse confirm end to end
await page.evaluate(() => { window.__g.meta.credits = 100000; window.__g._openForgeModal(); });
await page.waitForTimeout(250);
await page.click('#cgu-fq .cgu-fchip[data-qty="20"]');
await page.waitForTimeout(200);
const m0 = await page.evaluate(() => ({ c: window.__g.meta.credits, f: window.__g.meta.protocolFragments }));
await page.click('#cgu-forge-confirm');
await page.waitForTimeout(350);
const m1 = await page.evaluate(() => ({
  c: window.__g.meta.credits, f: window.__g.meta.protocolFragments,
  open: document.getElementById('cgu-forge-modal').classList.contains('open'),
}));
check('B17 a real mouse confirm forges the chosen quantity and closes',
  m1.f - m0.f === 20 && m0.c - m1.c === 20 * RATE && m1.open === false, JSON.stringify({ m0, m1, RATE }));
await shot('02_forge_confirmed.png');

// ════════════════════════════════════════════════════════════════════════════
// B. CHAOS LAW SELECTION — keyboard / controller
// ════════════════════════════════════════════════════════════════════════════
const openLaws = async () => {
  await page.evaluate(() => {
    const g = window.__g;
    g._hideChaosLawSelectionOverlay();
    g._pendingChaosStart = false;
    g.gameState = 'start_menu';
    g._showChaosLawSelectionOverlay();
  });
  await page.waitForTimeout(400);
};
await openLaws();
const laws = await page.evaluate(() => ({
  visible: !!document.getElementById('cgm-chaos-law-sel'),
  flag: window.__g._clsVisible === true,
  nodes: window.__g._clsNodes().map(n => n.dataset?.law || n.id),
  onCount: document.querySelectorAll('#cgm-chaos-law-sel .cls-on').length,
  hint: !!document.querySelector('#cgm-chaos-law-sel .cls-hint'),
}));
check('C01 the chaos law overlay opens and claims the key focus', laws.visible && laws.flag);
check('C02 the focus ring is every playable law, then SKIP, then BACK',
  laws.nodes.length === 8 && laws.nodes[6] === 'cls-skip-btn' && laws.nodes[7] === 'cls-back-btn',
  JSON.stringify(laws.nodes));
check('C03 exactly one node carries the focus state on open', laws.onCount === 1, String(laws.onCount));
check('C04 the screen states its controls', laws.hint);
await shot('03_chaos_laws.png');

const moved = await padUntil('down', () => window.__g._clsIdx === 1);
check('C05 D-pad DOWN moves the chaos-law selection', moved >= 0, `presses: ${moved}`);
const focusOk = await page.evaluate(() => {
  const nodes = window.__g._clsNodes();
  return { on: document.querySelectorAll('#cgm-chaos-law-sel .cls-on').length,
           correct: nodes[window.__g._clsIdx].classList.contains('cls-on') };
});
check('C06 the focus state follows the selection', focusOk.on === 1 && focusOk.correct, JSON.stringify(focusOk));
const back = await padUntil('up', () => window.__g._clsIdx === 0);
check('C07 D-pad UP moves it back', back >= 0, `presses: ${back}`);

// coming-soon / non-selectable cards are never focusable (they are pointer-events:none for the mouse)
check('C08 only selectable cards are in the ring',
  await page.evaluate(() => window.__g._clsNodes().every(n =>
    n.id === 'cls-skip-btn' || n.id === 'cls-back-btn' ||
    (n.dataset.law && !n.classList.contains('coming-soon')))));

// The RULE, deterministically: confirming clicks the same node the mouse would.
const rule = await page.evaluate(() => {
  const g = window.__g, out = {};
  const send = (k) => g._updateChaosLawKeys(new Set([k]));
  g._clsIdx = 0; send('arrowdown'); out.down = g._clsIdx;
  send('arrowright'); out.right = g._clsIdx;
  send('arrowup');    out.up = g._clsIdx;
  send('arrowleft');  out.left = g._clsIdx;
  g._clsIdx = 7; send('arrowdown'); out.wrap = g._clsIdx;
  return out;
});
check('C09 DOWN/RIGHT advance and UP/LEFT retreat through the ring',
  rule.down === 1 && rule.right === 2 && rule.up === 1 && rule.left === 0, JSON.stringify(rule));
check('C10 the ring wraps', rule.wrap === 0, JSON.stringify(rule));

// ENTER on a law starts the run through the SAME handler the click uses
await openLaws();
const lawId = await page.evaluate(() => window.__g._clsNodes()[0].dataset.law);
await page.evaluate(() => { window.__g._clsIdx = 0; window.__g._clsSync();
  window.__g._updateChaosLawKeys(new Set(['enter'])); });
await page.waitForTimeout(600);
const confirmed = await page.evaluate(() => ({
  law: window.__g.runChaosLaw, gs: window.__g.gameState,
  gone: !document.getElementById('cgm-chaos-law-sel'),
  flag: window.__g._clsVisible,
}));
check('C11 ENTER / A confirms the focused law and starts the run',
  confirmed.law === lawId && confirmed.gone && confirmed.flag === false, JSON.stringify({ lawId, confirmed }));
check('C12 confirming leaves the game in a run', confirmed.gs === 'playing', confirmed.gs);

// ESC goes back, and does not start anything
await openLaws();
await page.evaluate(() => { window.__g.runChaosLaw = null; window.__g._updateChaosLawKeys(new Set(['escape'])); });
await page.waitForTimeout(700);
const escd = await page.evaluate(() => ({
  gs: window.__g.gameState, gone: !document.getElementById('cgm-chaos-law-sel'),
  law: window.__g.runChaosLaw, flag: window.__g._clsVisible,
}));
check('C13 ESC / B returns to the main menu without arming a law',
  escd.gone && escd.law === null && escd.gs === 'start_menu' && escd.flag === false, JSON.stringify(escd));

// mouse still works, unchanged
await openLaws();
const mouseLaw = await page.evaluate(() => document.querySelector('#cgm-chaos-law-sel .cls-card[data-law]').dataset.law);
await page.click('#cgm-chaos-law-sel .cls-card[data-law]');
await page.waitForTimeout(600);
check('C14 clicking a law still works exactly as before',
  await page.evaluate(() => window.__g.runChaosLaw) === mouseLaw &&
  await page.evaluate(() => !document.getElementById('cgm-chaos-law-sel')));

// SKIP by keyboard leaves no law
await openLaws();
await page.evaluate(() => {
  const g = window.__g;
  g.runChaosLaw = 'blood_grid';
  g._clsIdx = g._clsNodes().findIndex(n => n.id === 'cls-skip-btn');
  g._updateChaosLawKeys(new Set(['enter']));
});
await page.waitForTimeout(600);
check('C15 SKIP via ENTER clears the law and starts a standard run',
  await page.evaluate(() => window.__g.runChaosLaw) === null &&
  await page.evaluate(() => window.__g.gameState) === 'playing',
  await page.evaluate(() => String(window.__g.runChaosLaw) + '/' + window.__g.gameState));

// ════════════════════════════════════════════════════════════════════════════
// C. POST-ENDLESS PANEL — the controller has to reach it
// ════════════════════════════════════════════════════════════════════════════
const openPac = async () => {
  await page.evaluate(() => {
    const g = window.__g;
    g._hideChaosLawSelectionOverlay();
    g.gameState = 'playing';
    g.gameOver = false; g.victory = false; g.paused = false;
    g.upgradeUI = null; g.mutationUI = null;
    g._chaosMode = false;
    g._postArenaChoice = true;
    g._pacIdx = 0;
    g._pacMsgStep = 5;
    g._pacMsgAt = performance.now() - 5000;
  });
  await page.waitForTimeout(400);
};
await openPac();
// The regression this fixes: gameState is still 'playing' here, so the old inGameplay
// test was true and the pad drove the HERO. Assert the routing itself.
const routing = await page.evaluate(() => ({
  gs: window.__g.gameState,
  pac: window.__g._postArenaChoice,
}));
check('D01 the panel really is up while gameState is still playing',
  routing.gs === 'playing' && routing.pac === true, JSON.stringify(routing));

const movedPac = await padUntil('down', () => window.__g._pacIdx === 1);
check('D02 D-pad DOWN moves the post-Endless selection', movedPac >= 0, `presses: ${movedPac}`);
const heldKeys = await page.evaluate(() => window.__g._lastInputKeys || null);
const upPac = await padUntil('up', () => window.__g._pacIdx === 0);
check('D03 D-pad UP moves it back', upPac >= 0, `presses: ${upPac}`);
await shot('04_post_endless.png');

// the hero must NOT be walking while the panel is up
const notWalking = await page.evaluate(() => {
  const p = window.__g.player;
  return !p || !p.vel || (Math.abs(p.vel.x || 0) + Math.abs(p.vel.y || 0)) < 0.001;
});
check('D04 the controller no longer drives the hero while the panel is up', notWalking, String(heldKeys));

// the three options, each reached and confirmed
await openPac();
await page.evaluate(() => { window.__g._pacIdx = 0; window.__g._selectPostArenaChoice(0); });
await page.waitForTimeout(300);
check('D05 CONTINUE ENDLESS closes the panel and keeps the run',
  await page.evaluate(() => window.__g._postArenaChoice === false && window.__g.gameState === 'playing'));

await openPac();
const chaos0 = await page.evaluate(() => !!window.__g._chaosMode);
const chaosReached = await padUntil('down', () => window.__g._pacIdx === 1);
await padUntil('a', () => window.__g._postArenaChoice === false);
await page.waitForTimeout(400);
const chaos1 = await page.evaluate(() => ({ chaos: !!window.__g._chaosMode, pac: window.__g._postArenaChoice }));
check('D06 A / Cross on ENTER CHAOS MODE engages chaos',
  chaosReached >= 0 && chaos0 === false && chaos1.chaos === true && chaos1.pac === false,
  JSON.stringify({ chaosReached, chaos0, chaos1 }));

await openPac();
const menuReached = await padUntil('down', () => window.__g._pacIdx === 2);
check('D07 the third option (RETURN MAIN MENU) is reachable with the pad', menuReached >= 0, `presses: ${menuReached}`);
await page.evaluate(() => window.__g._selectPostArenaChoice(2));
await page.waitForTimeout(900);
check('D08 RETURN MAIN MENU routes to the menu',
  await page.evaluate(() => window.__g.gameState) === 'start_menu',
  await page.evaluate(() => window.__g.gameState));

// B / Circle is the documented ESC = CONTINUE ENDLESS shortcut. This is where a real
// pre-existing defect surfaced: main.js's ESC branch toggled pause and cleared `keys`,
// so the panel's own handler could never see it — ESC paused the game instead of doing
// what the panel prints, and the controller inherited it through B / Start.
await openPac();
const bPressed = await padUntil('b', () => window.__g._postArenaChoice === false);
const bState = await page.evaluate(() => ({ gs: window.__g.gameState, paused: !!window.__g.paused }));
check('D09 B / Circle applies the documented ESC = CONTINUE ENDLESS shortcut',
  bPressed >= 0 && bState.gs === 'playing', `presses: ${bPressed} ${JSON.stringify(bState)}`);
check('D10 B / Circle does NOT pause the game instead', bState.paused === false, JSON.stringify(bState));

// same on the keyboard
await openPac();
await page.keyboard.down('Escape'); await page.waitForTimeout(160);
await page.keyboard.up('Escape');   await page.waitForTimeout(400);
const escState = await page.evaluate(() => ({
  pac: window.__g._postArenaChoice, gs: window.__g.gameState, paused: !!window.__g.paused }));
check('D11 keyboard ESC continues Endless instead of pausing',
  escState.pac === false && escState.gs === 'playing' && escState.paused === false, JSON.stringify(escState));

// and ESC still pauses in ordinary gameplay — the fix must not have stolen it
await page.evaluate(() => {
  const g = window.__g;
  g._postArenaChoice = false; g.paused = false; g.gameState = 'playing';
  g.gameOver = false; g.victory = false; g._stageCompleteBanner = null;
});
await page.waitForTimeout(200);
await page.keyboard.down('Escape'); await page.waitForTimeout(160);
await page.keyboard.up('Escape');   await page.waitForTimeout(400);
check('D12 ESC still toggles pause during ordinary gameplay',
  await page.evaluate(() => window.__g.paused === true),
  JSON.stringify(await page.evaluate(() => ({ paused: window.__g.paused, gs: window.__g.gameState }))));
await page.evaluate(() => { window.__g.paused = false; });

// ── Error sweep ──
check('E01 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const gameErrors = consoleErrors.filter(t => !/audio\/music/.test(t));
check('E02 zero game console errors across the whole session', gameErrors.length === 0, gameErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, rate: RATE, pass: passN, fail: failN, results, pageErrors, consoleErrors,
                   missing: [...new Set(notFound)].slice(0, 40) }, null, 1));

console.log(`\n=== RESULT: ${passN} PASS / ${failN} FAIL ===`);
if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
console.log('shots + report: ' + OUT);
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
