// ════════════════════════════════════════════════════════════════════════════════
// COLLECTION SCREEN — ACTIVATE buttons, controller acceptance proof.
//
// Before this, Collection had controller nav for TABS / SELECTION / FILTER only; the
// spending actions were mouse/touch-only (Game.js said so in a comment). This proves the
// gap is closed for the ACTIVATE buttons — the collectible ACTIVATE (#ca-grid .ca-activate)
// and the Boss Echo ACTIVATE (#ce-grid .ce-activate) — and that nothing else moved.
//
// WHY A VIRTUAL GAMEPAD, NOT SYNTHETIC ARROW KEYS
// Dispatching KeyboardEvents would test the keyboard path and silently assume the pad maps
// onto it. This installs a real navigator.getGamepads() pad BEFORE any game code runs, so
// D-pad / A / B travel the production route: GamepadInput.poll() -> main.js applyGamepad()
// rising-edge detection -> padTap() -> the real keydown handler -> _updateAchievementsScreen.
// A break anywhere in that chain fails here.
//
// WHAT IT REFUSES TO ASSUME
//   · that "it activated" means the SPEND happened — currency deltas are asserted exactly.
//   · that an unaffordable ACTIVATE is harmless — it is pressed and proven to be a no-op.
//   · that the controller path is the same code as the mouse path — the mouse path is run
//     afterwards on a second item and must still work.
//
// Self-hosting and self-versioning: serves the repo and reads BUILD from sw.js, so the
// module specifier can never drift from the shipped cache-bust (a hard-coded ?v= silently
// imports a SECOND, empty Game module and every check becomes meaningless).
//
// Run: node tools/qa/browser/collection_activate_controller_proof.mjs [port]
// Writes: /tmp/collection_activate_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/collection_activate_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8933;
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
// The stamp Game.js itself pins for MetaProgress — read from source, never hard-coded, so the
// proof and the game always resolve the SAME module instance.
const META_V = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8').match(/MetaProgress\.js\?v=(\d+)/)[1];

let passN = 0, failN = 0;
const failures = [];
const results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

// Standard Gamepad mapping — same indices js/Gamepad.js reads.
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

// ── Virtual controller, installed before any game code ──
await page.addInitScript(() => {
  const pad = {
    id: 'PHENIX QA Virtual Pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
    index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  navigator.getGamepads = () => [pad, null, null, null];
  window.__padSet = (i, on) => {
    pad.buttons[i].pressed = !!on;
    pad.buttons[i].touched = !!on;
    pad.buttons[i].value = on ? 1 : 0;
    pad.timestamp = performance.now();
  };
});

const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
};
// A pad press must span >= 1 game frame: applyGamepad() detects the rising edge on a frame
// boundary and releases the synthetic keydown on the NEXT frame. An instant press+release
// inside one frame would never be seen and would be a harness artifact, not a game bug.
const pad = async (name) => {
  await page.evaluate(i => window.__padSet(i, true), BTN[name]);
  await page.waitForTimeout(140);
  await page.evaluate(i => window.__padSet(i, false), BTN[name]);
  await page.waitForTimeout(200);
};

await page.goto(BASE + '/index.html?nosw=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1200);

// ── A. Boot + live instance on the SHIPPED module specifier ──
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
check('A01 live Game instance captured on the shipped ?v=', await page.evaluate(() => !!window.__g && !!window.__g.meta));
check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('A03 zero non-404 console errors at boot', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
check('A04 controller detected by the game', await page.evaluate(() => window.__g._controllerConnected === true));

// ── B. Seed an ACTIVATABLE state (in-memory only; saves are stubbed out) ──
const COSTS = await page.evaluate(async (mpv) => {
  const g = window.__g;
  g.meta._save = () => {};                      // never write a real save from QA
  // Same ?v= Game.js itself imports, so this is the SAME module instance the game uses —
  // importing it under any other specifier would hand back a second, unrelated copy.
  const mp = await import(`./js/game/MetaProgress.js?v=${mpv}`);
  g.meta.achievements.first_endless    = true;  // earned -> ACTIVATE offered
  g.meta.achievements.endless_survivor = true;  // second one, for the mouse-path re-check
  g.meta.bossKills.cyberSerpent = true;         // archived echo -> ACTIVATE offered
  g.meta.protocolFragments = 999; g.meta.credits = 999999;
  return {
    colFrag: mp.COLLECTIBLE_FRAGMENT_COST, colGrid: mp.COLLECTIBLE_GRID_COST,
    echoFrag: mp.ECHO_FRAGMENT_COST,      echoGrid: mp.ECHO_GRID_COST,
  };
}, META_V);
check('B00 spend costs read from MetaProgress', Number.isFinite(COSTS.colFrag) && Number.isFinite(COSTS.colGrid),
  JSON.stringify(COSTS));

await page.click('[data-cgm-item="COLLECTIBLES"]');
await page.waitForTimeout(500);
await page.evaluate(() => { window.__g._colSetTab('achievements'); window.__g._syncAchievementsOverlay(); });
await page.waitForTimeout(300);
check('B01 COLLECTIBLES open on the ACHIEVEMENTS tab',
  await page.evaluate(() => window.__g.gameState === 'achievements' && window.__g._colTab === 'achievements'));
check('B02 an ACTIVATE button is rendered', await page.evaluate(() => !!document.querySelector('#ca-grid .ca-activate')));

// ── C. D-pad reaches the ACTIVATE and shows a clean focus state ──
// Walk right until the selection carries an ACTIVATE. Bounded by the visible count so a
// regression that makes it unreachable fails instead of looping forever.
const visN = await page.evaluate(() => window.__g._colVisibleSelectables().length);
let steps = 0, reached = false;
for (; steps < visN + 1; steps++) {
  reached = await page.evaluate(() => !!window.__g._colActivateNode?.());
  if (reached) break;
  await pad('right');
}
check('C01 D-pad RIGHT reaches an ACTIVATE button', reached, `after ${steps} presses of ${visN} items`);

const focus = await page.evaluate(() => {
  const btn = window.__g._colActivateNode();
  if (!btn) return null;
  const card = btn.closest('[data-sidx]');
  const cs = getComputedStyle(btn);
  return {
    cardSelected: !!card && card.classList.contains('ct-on'),
    onCount: document.querySelectorAll('#cgm-achievements .ct-on').length,
    outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor,
    visible: btn.offsetParent !== null,
    label: btn.textContent.trim().slice(0, 40),
  };
});
check('C02 exactly one selected card, and it owns the ACTIVATE',
  focus && focus.cardSelected && focus.onCount === 1, JSON.stringify(focus));
check('C03 the focused ACTIVATE has a real focus ring (not inherited/none)',
  focus && focus.outlineStyle === 'solid' && parseFloat(focus.outlineWidth) >= 2 &&
  focus.outlineColor === 'rgb(255, 212, 71)', JSON.stringify(focus));
await shot('01_activate_focused.png');

// ── D. A / Cross executes the SAME action, and the spend is exact ──
const before = await page.evaluate(() => {
  const g = window.__g;
  const btn = g._colActivateNode();
  return {
    frag: g.meta.protocolFragments, grid: g.meta.credits,
    kind: btn.className.includes('ce-activate') ? 'echo' : 'collectible',
    id: btn.dataset.achId || btn.dataset.echoId,
    activeCol: Object.keys(g.meta.activeCollectibles || {}).length,
  };
});
await pad('a');
await page.waitForTimeout(350);
const after = await page.evaluate((id) => {
  const g = window.__g;
  return {
    frag: g.meta.protocolFragments, grid: g.meta.credits,
    isActive: g.meta.isCollectibleActive?.(id) === true || g.meta.isEchoActive?.(id) === true,
    label: (document.querySelector(`[data-sidx] .ca-status, [data-sidx] .ce-status`) && '') ||
           Array.from(document.querySelectorAll('#ca-grid .ca-status, #ce-grid .ce-status'))
             .map(n => n.textContent.trim()).filter(t => t === '★ ACTIVE').length,
    stillOffered: !!window.__g._colActivateNode(),
  };
}, before.id);
check('D01 A / Cross activated the selected item', after.isActive, JSON.stringify({ before, after }));
const expFrag = before.kind === 'echo' ? COSTS.echoFrag : COSTS.colFrag;
const expGrid = before.kind === 'echo' ? COSTS.echoGrid : COSTS.colGrid;
check('D02 fragments spent exactly once, at the catalog cost',
  before.frag - after.frag === expFrag, `${before.frag}->${after.frag}, expected -${expFrag}`);
check('D03 grids spent exactly once, at the catalog cost',
  before.grid - after.grid === expGrid, `${before.grid}->${after.grid}, expected -${expGrid}`);
check('D04 the activated item no longer offers ACTIVATE (shows ACTIVE)',
  after.label >= 1 && !after.stillOffered, JSON.stringify(after));
await shot('02_after_activate.png');

// ── E. Unaffordable ACTIVATE is a proven no-op under A ──
await page.evaluate(() => { window.__g.meta.protocolFragments = 0; window.__g._syncAchievementsOverlay(); });
await page.waitForTimeout(250);
let poor = false;
for (let i = 0; i < visN + 1; i++) {
  poor = await page.evaluate(() => !!window.__g._colActivateNode?.());
  if (poor) break;
  await pad('right');
}
if (poor) {
  const p0 = await page.evaluate(() => {
    const g = window.__g, b = g._colActivateNode();
    return { frag: g.meta.protocolFragments, grid: g.meta.credits, id: b.dataset.achId || b.dataset.echoId };
  });
  await pad('a');
  await page.waitForTimeout(300);
  const p1 = await page.evaluate((id) => {
    const g = window.__g;
    return {
      frag: g.meta.protocolFragments, grid: g.meta.credits,
      isActive: g.meta.isCollectibleActive?.(id) === true || g.meta.isEchoActive?.(id) === true,
    };
  }, p0.id);
  check('E01 A on an unaffordable ACTIVATE does not activate', p1.isActive === false, JSON.stringify(p1));
  check('E02 A on an unaffordable ACTIVATE spends nothing',
    p0.frag === p1.frag && p0.grid === p1.grid, JSON.stringify({ p0, p1 }));
} else {
  check('E01 A on an unaffordable ACTIVATE does not activate', false, 'no ACTIVATE left to probe');
  check('E02 A on an unaffordable ACTIVATE spends nothing', false, 'no ACTIVATE left to probe');
}
await page.evaluate(() => { window.__g.meta.protocolFragments = 999; window.__g._syncAchievementsOverlay(); });
await page.waitForTimeout(200);

// ── F. Mouse / touch path unchanged ──
const mouseTarget = await page.evaluate(() => {
  const b = document.querySelector('#ca-grid .ca-activate') || document.querySelector('#ce-grid .ce-activate');
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: b.dataset.achId || b.dataset.echoId,
           echo: b.className.includes('ce-activate') };
});
if (mouseTarget) {
  await page.mouse.click(mouseTarget.x, mouseTarget.y);   // real hit-test, same as a touch tap
  await page.waitForTimeout(350);
  const m = await page.evaluate(({ id, echo }) => {
    const g = window.__g;
    return echo ? g.meta.isEchoActive?.(id) === true : g.meta.isCollectibleActive?.(id) === true;
  }, mouseTarget);
  check('F01 mouse/touch click on ACTIVATE still works', m === true, JSON.stringify(mouseTarget));
} else {
  check('F01 mouse/touch click on ACTIVATE still works', false, 'no ACTIVATE rendered to click');
}

// ── G. Nothing else on the screen changed behaviour ──
await page.evaluate(() => window.__g._colSetTab('characters'));
await page.waitForTimeout(200);
const f0 = await page.evaluate(() => window.__g._colFilter);
await pad('a');
const f1 = await page.evaluate(() => window.__g._colFilter);
check('G01 A still cycles the filter where there is no ACTIVATE', f0 === 'all' && f1 === 'unlocked', `${f0} -> ${f1}`);
await pad('a'); await pad('a');
check('G02 filter cycle still wraps back to ALL', await page.evaluate(() => window.__g._colFilter) === 'all');

await pad('down');
check('G03 D-pad DOWN still switches tab', await page.evaluate(() => window.__g._colTab) === 'weapons');
await pad('up');
check('G04 D-pad UP still returns to CHARACTERS', await page.evaluate(() => window.__g._colTab) === 'characters');

await page.evaluate(() => { window.__g._colSetTab('ost'); window.__g.meta.recordEddieTime?.(2000); window.__g._syncAchievementsOverlay(); });
await page.waitForTimeout(250);
const ostPlayable = await page.evaluate(() => document.querySelectorAll('#jb-list .jb-row[data-unlocked="1"]').length);
if (ostPlayable > 0) {
  await pad('a');
  await page.waitForTimeout(250);
  const playing = await page.evaluate(() => document.querySelectorAll('#jb-list .jb-row.playing').length);
  check('G05 A still plays the selected OST track', playing === 1, String(playing));
  await pad('a');
} else {
  check('G05 A still plays the selected OST track', false, 'no unlocked track to probe');
}

// ── H. B / Circle returns ──
await page.evaluate(() => window.__g._colSetTab('achievements'));
await page.waitForTimeout(200);
await pad('b');
await page.waitForTimeout(600);
const back = await page.evaluate(() => ({
  gs: window.__g.gameState,
  vis: getComputedStyle(document.getElementById('cgm-achievements')).display,
}));
check('H01 B / Circle returns to the main menu and hides the overlay',
  back.gs === 'start_menu' && back.vis === 'none', JSON.stringify(back));
await shot('03_back_to_menu.png');

// re-enter and leave with ESC too (keyboard parity)
await page.click('[data-cgm-item="COLLECTIBLES"]');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
check('H02 ESC returns to the main menu as well',
  await page.evaluate(() => window.__g.gameState === 'start_menu'));

// ── I. Error sweep ──
check('I01 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const gameErrors = consoleErrors.filter(t => !/audio\/music/.test(t));
check('I02 zero game console errors across the whole session', gameErrors.length === 0, gameErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, pageErrors, consoleErrors,
                   missing: [...new Set(notFound)].slice(0, 40) }, null, 1));

console.log(`\n=== RESULT: ${passN} PASS / ${failN} FAIL ===`);
if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
console.log('shots + report: ' + OUT);
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
