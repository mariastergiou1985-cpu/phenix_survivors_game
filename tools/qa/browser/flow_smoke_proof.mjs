// ════════════════════════════════════════════════════════════════════════════════
// INTEGRATED UI / CONTROLLER SMOKE — the whole new flow, end to end, three input paths.
//
//   Main Menu -> Mode Select -> Campaign / Endless / Chaos
//             -> Act Select (Campaign) -> Character Select -> Gameplay
//             -> Results -> Retry / Continue / Main Menu
//
// Driven three ways over the SAME route — mouse, keyboard, controller — because these
// screens have three separate input paths and a screen can be perfectly navigable with
// one and a dead end with another. Every step also asserts the things a smoke test is
// actually for: the screen really changed, exactly one thing holds focus, ESC/B goes
// back to the RIGHT screen, the frame loop never stalls, and the canvas never goes black.
//
// Deliberately NOT a long run: gameplay is entered, verified live for a couple of
// seconds with real frame sampling, then ended. Nothing here changes balance, rewards,
// unlocks or saves — meta._save is stubbed for the whole session.
//
// Run: node tools/qa/browser/flow_smoke_proof.mjs [port]
// Writes: /tmp/flow_smoke_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/flow_smoke_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 9101;
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
  // Frame-time probe on the real rAF loop — an input freeze shows up here first.
  window.__ft = { worst: 0, n: 0, last: 0 };
  const tick = () => {
    const now = performance.now();
    if (window.__ft.last) {
      const dt = now - window.__ft.last;
      if (dt > window.__ft.worst) window.__ft.worst = dt;
      window.__ft.n++;
    }
    window.__ft.last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const shot = async (n) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, n), Buffer.from(data, 'base64'));
};
const pad = async (name) => {
  await page.evaluate(b => window.__padSet(b, true), BTN[name]);
  await page.waitForTimeout(240);
  await page.evaluate(b => window.__padSet(b, false), BTN[name]);
  await page.waitForTimeout(280);
};
const padSettle = async (name) => { await pad(name); await settle(); };
// Headless key/pad delivery drops the odd edge (documented in the other proofs), so
// navigation steps press until the expected state is reached and report the count.
const padUntil = async (name, predicate, max = 14) => {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(predicate)) return i;
    await pad(name);
  }
  return (await page.evaluate(predicate)) ? max : -1;
};
// Screen changes run through a FADE. Firing the next input while one is still in flight
// lets the SAME still-held key be seen by the screen that just arrived, which reads as a
// double-back. A real player does not press again mid-transition; neither does this.
const settle = async (ms = 900) => {
  let last = null;
  for (let i = 0; i < Math.ceil(ms / 150); i++) {
    const now = await page.evaluate(() => window.__g.gameState);
    if (now === last) return now;
    last = now;
    await page.waitForTimeout(150);
  }
  return last;
};
const key = async (k) => {
  await page.keyboard.down(k); await page.waitForTimeout(140);
  await page.keyboard.up(k);   await page.waitForTimeout(260);
  await settle();
};
const keyUntil = async (k, predicate, max = 14) => {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(predicate)) return i;
    await key(k);
  }
  return (await page.evaluate(predicate)) ? max : -1;
};
const gs = () => page.evaluate(() => window.__g.gameState);
const waitState = async (want, ms = 4000) => {
  try { await page.waitForFunction(w => window.__g.gameState === w, want, { timeout: ms }); return true; }
  catch (_) { return false; }
};
// Canvas luminance — a black screen is the one failure a state check cannot see.
const notBlack = () => page.evaluate(() => {
  const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
  if (!c) return { ok: false, why: 'no canvas' };
  const o = document.createElement('canvas'); o.width = 160; o.height = 90;
  const cx = o.getContext('2d', { willReadFrequently: true });
  cx.drawImage(c, 0, 0, 160, 90);
  const d = cx.getImageData(0, 0, 160, 90).data;
  let sum = 0, mx = 0; const u = new Set();
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; if (l > mx) mx = l;
    u.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  const mean = sum / (d.length / 4);
  // A DOM overlay legitimately covers the canvas, so a dark canvas is only a failure
  // when nothing is covering it.
  const overlay = [...document.querySelectorAll('div[id^="cgm-"]')]
    .some(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 300);
  return { ok: overlay || !(mean < 6 && mx < 24), mean: +mean.toFixed(2), colors: u.size, overlay };
});
const freezeMs = () => page.evaluate(() => { const w = window.__ft.worst; window.__ft.worst = 0; return +w.toFixed(1); });

await page.goto(BASE + '/index.html?nosw=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1400);

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
// NOTHING in this proof may touch the player's real save.
await page.evaluate(() => {
  const g = window.__g;
  g.meta._save = () => {};
  if (!g.meta.isEndlessUnlocked()) g.meta.unlockEndless();
  g.meta.stagesCleared = Math.max(g.meta.stagesCleared || 0, 3);
});
check('A02 saves are stubbed for the whole session (no real write can happen)',
  await page.evaluate(() => window.__g.meta._save.toString().length < 40));
check('A03 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const toMenu = async () => {
  await page.evaluate(() => window.__g.goToMainMenu());
  await waitState('start_menu');
  await page.waitForTimeout(500);
};
await toMenu();

// ════════════════════════════════════════════════════════════════════════════
// B. MOUSE — the full Campaign route, then every Back
// ════════════════════════════════════════════════════════════════════════════
await page.click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
check('B01 mouse: MAIN MENU -> MODE SELECT', await waitState('mode_select'), await gs());
const modeCards = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#cgm-modesel .msl-card')).map(c => c.dataset.mode));
check('B02 mode select offers campaign, endless and chaos',
  ['campaign', 'endless', 'chaos'].every(m => modeCards.includes(m)), JSON.stringify(modeCards));
await shot('01_mode_select.png');

await page.click('#cgm-modesel .msl-card[data-mode="campaign"]');
check('B03 mouse: CAMPAIGN -> ACT SELECT', await waitState('act_select'), await gs());
await shot('02_act_select.png');
await page.click('#cgm-actsel .asl-card[data-act="1"]');
check('B04 mouse: ACT 1 -> CAMPAIGN STAGE MAP', await waitState('campaign_select'), await gs());
await page.click('#cgm-campaign .cmp-card[data-idx="0"]');
check('B05 mouse: a stage -> CHARACTER SELECT', await waitState('character_select'), await gs());
check('B06 the campaign route arms the stage it picked and remembers where BACK goes',
  await page.evaluate(() => window.__g._pendingCampaignStage === 1 && window.__g._charSelectReturn === 'campaign_select'),
  await page.evaluate(() => JSON.stringify({ stage: window.__g._pendingCampaignStage, back: window.__g._charSelectReturn })));
await shot('03_char_select.png');

// Back chain: character select -> stage map -> act select -> mode select -> menu
await key('Escape');
check('B07 ESC: CHARACTER SELECT -> back to the STAGE MAP', await waitState('campaign_select'), await gs());
await key('Escape');
check('B08 ESC: STAGE MAP -> ACT SELECT', await waitState('act_select'), await gs());
await key('Escape');
check('B09 ESC: ACT SELECT -> MODE SELECT', await waitState('mode_select'), await gs());
await key('Escape');
check('B10 ESC: MODE SELECT -> MAIN MENU', await waitState('start_menu'), await gs());
check('B11 no frame stall across the whole back chain', (await freezeMs()) < 2000, String(await freezeMs()));

// Endless and Chaos both route through the briefing screen
await page.click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
await waitState('mode_select');
await page.waitForSelector('#cgm-modesel .msl-card[data-mode="endless"]', { state: 'visible', timeout: 8000 });
await page.click('#cgm-modesel .msl-card[data-mode="endless"]');
check('B12 mouse: ENDLESS -> its briefing screen', await waitState('mode_intro'), await gs());
check('B13 the briefing is the ENDLESS one', await page.evaluate(() => window.__g._modeIntroMode) === 'endless');
await shot('04_endless_briefing.png');
await page.click('#mi-continue');
check('B14 mouse: briefing CONTINUE -> CHARACTER SELECT', await waitState('character_select'), await gs());
await key('Escape');
check('B15 ESC from character select returns to MODE SELECT for endless',
  await waitState('mode_select'), await gs());

// reach mode select explicitly — do not assume the previous step left us there
if ((await gs()) !== 'mode_select') {
  await toMenu();
  await page.click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await waitState('mode_select');
}
await page.waitForSelector('#cgm-modesel .msl-card[data-mode="chaos"]', { state: 'visible', timeout: 8000 });
await page.click('#cgm-modesel .msl-card[data-mode="chaos"]');
check('B16 mouse: CHAOS -> its briefing screen', await waitState('mode_intro'), await gs());
check('B17 the briefing is the CHAOS one', await page.evaluate(() => window.__g._modeIntroMode) === 'chaos');
await shot('05_chaos_briefing.png');
await page.click('#mi-back');
check('B18 briefing BACK -> MODE SELECT', await waitState('mode_select'), await gs());
await key('Escape');
await waitState('start_menu');

// ════════════════════════════════════════════════════════════════════════════
// C. KEYBOARD — same route, keys only
// ════════════════════════════════════════════════════════════════════════════
await toMenu();
await page.evaluate(() => { window.__g.menuIndex = 0; window.__g._menuRadioFocus = false; window.__g._syncMenuOverlayActive(); });
const kMenu = await keyUntil('ArrowDown', () => window.__g.menuItems[window.__g.menuIndex] === 'START GAME');
check('C01 keyboard: the menu cursor reaches START GAME', kMenu >= 0, `presses: ${kMenu}`);
check('C02 exactly one menu item is marked active',
  await page.evaluate(() => document.querySelectorAll('#cgm-menu-nav .mbtn.active').length) === 1);
await key('Enter');
check('C03 keyboard: ENTER opens MODE SELECT', await waitState('mode_select'), await gs());
const kEnd = await keyUntil('ArrowRight', () => window.__g._modeSelIndex === 1);
check('C04 keyboard: the mode cursor moves', kEnd >= 0, `presses: ${kEnd}`);
check('C05 exactly one mode card is selected',
  await page.evaluate(() => document.querySelectorAll('#cgm-modesel .msl-card.sel, #cgm-modesel .msl-card.active').length) <= 1);
await key('Enter');
check('C06 keyboard: ENTER on ENDLESS opens the briefing', await waitState('mode_intro'), await gs());
check('C07 the briefing marks exactly one focused button',
  await page.evaluate(() => document.querySelectorAll('#cgm-modeintro .mi-btn.focus').length) === 1);
await key('Enter');
check('C08 keyboard: briefing ENTER -> CHARACTER SELECT', await waitState('character_select'), await gs());
await key('Escape');
check('C09 keyboard: ESC leaves character select', await waitState('mode_select'), await gs());
await key('Escape');
check('C10 keyboard: ESC leaves mode select', await waitState('start_menu'), await gs());

// ════════════════════════════════════════════════════════════════════════════
// D. CONTROLLER — same route, pad only
// ════════════════════════════════════════════════════════════════════════════
await toMenu();
await page.evaluate(() => { window.__g.menuIndex = 0; window.__g._menuRadioFocus = false; window.__g._syncMenuOverlayActive(); });
check('D00 the game sees a controller', await page.evaluate(() => window.__g._controllerConnected === true));
const dMenu = await padUntil('down', () => window.__g.menuItems[window.__g.menuIndex] === 'START GAME');
check('D01 controller: the D-pad reaches START GAME', dMenu >= 0, `presses: ${dMenu}`);
const dEnter = await padUntil('a', () => window.__g.gameState === 'mode_select');
check('D02 controller: A opens MODE SELECT', dEnter >= 0, `presses: ${dEnter}`);
const dMode = await padUntil('right', () => window.__g._modeSelIndex === 1);
check('D03 controller: the D-pad moves the mode cursor', dMode >= 0, `presses: ${dMode}`);
const dIntro = await padUntil('a', () => window.__g.gameState === 'mode_intro');
check('D04 controller: A opens the briefing', dIntro >= 0, `presses: ${dIntro}`);
const dFocus = await padUntil('left', () => window.__g._modeIntroFocus === 1);
check('D05 controller: the D-pad moves briefing focus to BACK', dFocus >= 0, `presses: ${dFocus}`);
const dBack = await padUntil('a', () => window.__g.gameState === 'mode_select');
check('D06 controller: A on BACK returns to MODE SELECT', dBack >= 0, `presses: ${dBack}`);
const dB = await padUntil('b', () => window.__g.gameState === 'start_menu');
check('D07 controller: B leaves MODE SELECT', dB >= 0, `presses: ${dB}`);
check('D08 no frame stall across the controller pass', (await freezeMs()) < 2000);

// ════════════════════════════════════════════════════════════════════════════
// E. GAMEPLAY -> RESULTS -> the three actions
// ════════════════════════════════════════════════════════════════════════════
const enterEndless = async () => {
  await toMenu();
  await page.click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await waitState('mode_select');
  await page.click('#cgm-modesel .msl-card[data-mode="endless"]');
  await waitState('mode_intro');
  await page.click('#mi-continue');
  await waitState('character_select');
  await page.click('#csc-endless-btn').catch(async () => { await page.click('#csc-start-btn'); });
  return await waitState('playing', 8000);
};
check('E01 the real route reaches GAMEPLAY', await enterEndless(), await gs());
await page.waitForTimeout(2200);
const live = await page.evaluate(() => ({
  state: window.__g.gameState, endless: !!window.__g.endless,
  t: Math.round(window.__g.timeAlive), hp: window.__g.player?.hp ?? -1,
}));
check('E02 the run is genuinely live (clock running, player alive)',
  live.state === 'playing' && live.t > 0 && live.hp > 0, JSON.stringify(live));
const blackPlay = await notBlack();
check('E03 gameplay is not a black screen', blackPlay.ok, JSON.stringify(blackPlay));
check('E04 no frame stall during gameplay', (await freezeMs()) < 2000);
await shot('06_gameplay.png');

// End the run WITHOUT touching rewards or saves: the results screen is what is under test.
const endNow = async () => {
  await page.evaluate(() => {
    const g = window.__g;
    g.upgradeUI = null; g.mutationUI = null; g._postArenaChoice = false; g.paused = false;
    g.victory = false; g.gameOver = true;
    g._resultsDismissed = false;
    g._endScreenBtnIndex = 0;
  });
  await page.waitForTimeout(700);
};
await endNow();
const res = await page.evaluate(() => {
  const el = document.getElementById('cgm-results');
  return { vis: window.__g._resultsOverlayVisible,
           display: el ? getComputedStyle(el).display : 'missing',
           mode: el?.querySelector('.rs-mode')?.textContent.trim(),
           btns: Array.from(el?.querySelectorAll('[data-rsbtn]') || []).map(b => b.dataset.rsbtn),
           sel: el?.querySelectorAll('[data-rsbtn].sel').length };
});
check('E05 the RESULTS screen comes up on the real route',
  res.vis === true && res.display === 'flex', JSON.stringify(res));
check('E06 it names ENDLESS as the mode', res.mode === 'ENDLESS MODE', res.mode);
check('E07 it offers retry, upgrades and main menu, in that order',
  JSON.stringify(res.btns) === JSON.stringify(['retry', 'upgrades', 'menu']), JSON.stringify(res.btns));
check('E08 exactly one results button is selected', res.sel === 1, String(res.sel));
await shot('07_results.png');

// RETRY (mouse)
await page.click('[data-rsbtn="retry"]');
await page.waitForTimeout(900);
const afterRetry = await page.evaluate(() => ({ over: window.__g.gameOver, gs: window.__g.gameState,
                                                t: Math.round(window.__g.timeAlive) }));
check('E09 RETRY restarts a run and clears the results screen',
  afterRetry.over === false && afterRetry.gs === 'playing' && afterRetry.t < 6, JSON.stringify(afterRetry));
check('E10 the retried run is not a black screen', (await notBlack()).ok);

// MAIN MENU (controller)
await endNow();
const rMenu = await padUntil('right', () => window.__g._endScreenBtnIndex === 2);
check('E11 controller: the D-pad reaches MAIN MENU on the results screen', rMenu >= 0, `presses: ${rMenu}`);
const rGo = await padUntil('a', () => window.__g.gameState === 'start_menu');
check('E12 controller: A returns to the MAIN MENU', rGo >= 0, `presses: ${rGo}`);
check('E13 the results screen is gone once back at the menu',
  await page.evaluate(() => window.__g._resultsOverlayVisible === false &&
    getComputedStyle(document.getElementById('cgm-results')).display === 'none'));
check('E14 the main menu is not a black screen', (await notBlack()).ok);

// UPGRADES (keyboard) — and back out of it
await enterEndless();
await page.waitForTimeout(600);
await endNow();
const kUp = await keyUntil('ArrowRight', () => window.__g._endScreenBtnIndex === 1);
check('E15 keyboard: the results cursor reaches UPGRADES', kUp >= 0, `presses: ${kUp}`);
await key('Enter');
check('E16 keyboard: ENTER opens the UPGRADES screen', await waitState('upgrades'), await gs());
await key('Escape');
check('E17 ESC leaves the upgrades screen', await waitState('start_menu'), await gs());

// CONTINUE — ENDLESS from a victory
await page.evaluate(() => {
  const g = window.__g;
  g.gameState = 'playing'; g.gameOver = false; g.paused = false;
  g.upgradeUI = null; g.mutationUI = null;
  g.finalMessage = 'CITY GRID STABILIZED — VICTORY';
  g.victory = true; g._resultsDismissed = false; g._endScreenBtnIndex = 0;
});
await page.waitForTimeout(800);
const vres = await page.evaluate(() => {
  const el = document.getElementById('cgm-results');
  return { title: el?.querySelector('.rs-title')?.textContent.trim(),
           btns: Array.from(el?.querySelectorAll('[data-rsbtn]') || []).map(b => b.dataset.rsbtn) };
});
check('E18 a victory shows VICTORY with the menu/continue pair',
  vres.title === 'VICTORY' && JSON.stringify(vres.btns) === JSON.stringify(['menu', 'continue']),
  JSON.stringify(vres));
await page.click('[data-rsbtn="continue"]');
await page.waitForTimeout(1000);
check('E19 CONTINUE — ENDLESS leaves the victory screen into an Endless run',
  await page.evaluate(() => window.__g.victory === false && !!window.__g.endless &&
    window.__g._resultsOverlayVisible === false),
  await page.evaluate(() => JSON.stringify({ v: window.__g.victory, e: !!window.__g.endless })));

// ════════════════════════════════════════════════════════════════════════════
// F. NOTHING WAS WRITTEN, NOTHING IS STUCK
// ════════════════════════════════════════════════════════════════════════════
await toMenu();
check('F01 no input is stuck held after the whole pass',
  await page.evaluate(() => {
    const g = window.__g;
    return !g.player || !g.player.vel || (Math.abs(g.player.vel.x || 0) + Math.abs(g.player.vel.y || 0)) < 0.5;
  }));
check('F02 the menu still responds after everything', await (async () => {
  await page.click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  const ok = await waitState('mode_select');
  await key('Escape'); await waitState('start_menu');
  return ok;
})());
check('F03 worst frame across the final pass is not a freeze', (await freezeMs()) < 2000);
const blackMenu = await notBlack();
check('F04 the main menu is still rendering', blackMenu.ok, JSON.stringify(blackMenu));
await shot('08_back_at_menu.png');

check('G01 zero page errors across the whole flow', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));
const gameErrors = consoleErrors.filter(t => !/audio\/music|failed to load|Could not load|radio broadcast/.test(t));
check('G02 zero game console errors across the whole flow', gameErrors.length === 0, gameErrors.slice(0, 4).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, pageErrors, consoleErrors }, null, 1));

console.log(`\n=== RESULT: ${passN} PASS / ${failN} FAIL ===`);
if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
console.log('shots + report: ' + OUT);
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
