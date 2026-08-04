// ════════════════════════════════════════════════════════════════════════════════
// SETTINGS / CONTROLS REDESIGN — browser proof (self-hosting Chromium).
//
// The redesign is UI ONLY: every control must read and write the SAME AudioManager
// setters, the SAME game flags and the SAME save actions as before. So this proof is
// built around one question — does the new screen still drive the OLD state?
//
//   · sliders are read back off AudioManager, not off the DOM
//   · toggles are read back off audio.muted / audio.radioEnabled / game.aimAssist
//   · RESET TO DEFAULTS is checked against AudioManager's own VOL_DEFAULTS, and the
//     save/progression fields are snapshotted before and compared after
//   · the confirmation is proven to be a real gate: cancelling must change nothing
//
// Controller navigation goes through a REAL injected navigator.getGamepads() pad, so
// D-pad / A / B travel the production route (GamepadInput.poll -> applyGamepad ->
// padTap -> keydown) instead of a synthetic-keyboard shortcut that would only prove
// the keyboard works.
//
// Self-hosting and self-versioning: serves the repo and reads BUILD from sw.js, so the
// module specifier can never drift from the shipped cache-bust.
//
// Run: node tools/qa/browser/settings_redesign_browser_proof.mjs [port]
// Writes: /tmp/settings_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/settings_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8941;
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
// A press must span >= 1 game frame: applyGamepad detects the rising edge on a frame
// boundary and releases the synthetic keydown on the NEXT frame.
// page.keyboard.press() is down+up inside ~10ms, which can fall entirely between two
// game frames — the key is added to and removed from `keys` before update() ever reads
// it. Every real key press spans frames, so the harness must hold too.
const key = async (k) => {
  await page.keyboard.down(k); await page.waitForTimeout(140);
  await page.keyboard.up(k);   await page.waitForTimeout(220);
};
const pad = async (name, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.evaluate(b => window.__padSet(b, true), BTN[name]);
    await page.waitForTimeout(130);
    await page.evaluate(b => window.__padSet(b, false), BTN[name]);
    await page.waitForTimeout(180);
  }
};

// Focus can be anywhere after a mouse click; walk up to the tab rail deterministically
// instead of assuming how many rows down the previous step left the cursor.
const toRail = async () => {
  for (let i = 0; i < 24; i++) {
    if (await page.evaluate(() => window.__g._setsSel === 0)) return true;
    await pad('up');
  }
  return await page.evaluate(() => window.__g._setsSel === 0);
};

await page.goto(BASE + '/index.html?nosw=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1200);

// ── A. Boot ──
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

// ── B. Open SETTINGS from the real menu ──
await page.click('[data-cgm-item="SETTINGS"]');
await page.waitForTimeout(600);
const open = await page.evaluate(() => ({
  gs: window.__g.gameState,
  vis: getComputedStyle(document.getElementById('cgm-settings')).display,
  tab: window.__g._setsTab,
  tabs: Array.from(document.querySelectorAll('#cgs-tabs .cgs-tab')).map(t => t.dataset.tab),
  rows: document.querySelectorAll('#cgs-body .cgs-row').length,
}));
check('B01 SETTINGS opens the DOM overlay', open.gs === 'settings' && open.vis === 'flex', JSON.stringify(open));
check('B02 four tabs: audio, display, gameplay, controls',
  open.tabs.join(',') === 'audio,display,gameplay,controls', JSON.stringify(open.tabs));
check('B03 AUDIO is the default tab and renders rows', open.tab === 'audio' && open.rows >= 6, JSON.stringify(open));
await shot('01_audio.png');

// ── C. Sliders write through to AudioManager ──
const s0 = await page.evaluate(() => ({ master: window.__g.audio.masterVolume, music: window.__g.audio.musicVolume }));
// select MASTER (nav entry 1 = first row), then nudge left with the D-pad
await pad('down');                       // tabs -> first row
const selRow = await page.evaluate(() => document.querySelector('#cgs-body .cgs-row.sel')?.dataset.row);
check('C01 D-pad DOWN moves focus from the tab rail onto the first row', selRow === 'master', String(selRow));
await pad('left', 2);
const s1 = await page.evaluate(() => ({
  master: window.__g.audio.masterVolume,
  shown: document.querySelector('#cgs-body .cgs-row[data-row="master"] .cgs-val')?.textContent,
  stored: localStorage.getItem('phenix_master_volume'),
}));
check('C02 D-pad LEFT lowers MASTER on the real AudioManager',
  s1.master < s0.master, JSON.stringify({ before: s0.master, after: s1.master }));
check('C03 the readout matches the live value', s1.shown === Math.round(s1.master * 100) + '%',
  JSON.stringify(s1));
check('C04 the change is persisted through the existing setter (localStorage)',
  Math.abs(Number(s1.stored) - s1.master) < 1e-6, JSON.stringify(s1));
await pad('right', 2);
const s2 = await page.evaluate(() => window.__g.audio.masterVolume);
check('C05 D-pad RIGHT restores it symmetrically', Math.abs(s2 - s0.master) < 1e-6, `${s2} vs ${s0.master}`);

// mouse drag on the MUSIC track
const drag = await page.evaluate(() => {
  const r = document.querySelector('#cgs-body .cgs-row[data-row="music"] .cgs-track').getBoundingClientRect();
  return { x0: r.x + r.width * 0.25, y: r.y + r.height / 2, x1: r.x + r.width * 0.75 };
});
await page.mouse.move(drag.x0, drag.y);
await page.mouse.down();
await page.mouse.move(drag.x1, drag.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const mv = await page.evaluate(() => window.__g.audio.musicVolume);
check('C06 mouse drag sets MUSIC (~0.75)', mv > 0.6 && mv < 0.9, String(mv));

// ── D. Toggles drive the real flags ──
const mute0 = await page.evaluate(() => !!window.__g.audio.muted);
await page.click('#cgs-body .cgs-row[data-row="mute"] .cgs-sw');
await page.waitForTimeout(200);
const mute1 = await page.evaluate(() => ({
  muted: !!window.__g.audio.muted,
  label: document.querySelector('#cgs-body .cgs-row[data-row="mute"] .cgs-state')?.textContent,
}));
check('D01 MUTE toggle flips audio.muted', mute1.muted !== mute0, JSON.stringify({ mute0, mute1 }));
check('D02 the ON/OFF label follows the real state', mute1.label === (mute1.muted ? 'ON' : 'OFF'), JSON.stringify(mute1));
await page.click('#cgs-body .cgs-row[data-row="mute"] .cgs-sw');
await page.waitForTimeout(200);
check('D03 mute restored', await page.evaluate(() => !!window.__g.audio.muted) === mute0);

const radio0 = await page.evaluate(() => !!window.__g.audio.radioEnabled);
await page.click('#cgs-body .cgs-row[data-row="radio"] .cgs-sw');
await page.waitForTimeout(200);
check('D04 NULL RADIO toggle flips audio.radioEnabled',
  await page.evaluate(() => !!window.__g.audio.radioEnabled) !== radio0);
await page.click('#cgs-body .cgs-row[data-row="radio"] .cgs-sw');
await page.waitForTimeout(200);

// ── E. Tabs, via controller and via mouse ──
check('E00 focus returns to the tab rail with D-pad UP', await toRail());
await pad('right');
check('E01 D-pad RIGHT on the rail switches to DISPLAY',
  await page.evaluate(() => window.__g._setsTab) === 'display');
const disp = await page.evaluate(() => Array.from(document.querySelectorAll('#cgs-body .cgs-row')).map(r => r.dataset.row));
check('E02 DISPLAY shows fullscreen + read-only info',
  disp.includes('fullscreen') && disp.includes('res') && disp.includes('padstate'), JSON.stringify(disp));
await shot('02_display.png');

await pad('right');
check('E03 next tab is GAMEPLAY', await page.evaluate(() => window.__g._setsTab) === 'gameplay');
const gp = await page.evaluate(() => Array.from(document.querySelectorAll('#cgs-body .cgs-row')).map(r => r.dataset.row));
check('E04 GAMEPLAY keeps AIM ASSIST + both save actions',
  gp.includes('aim') && gp.includes('backup') && gp.includes('restore'), JSON.stringify(gp));
await shot('03_gameplay.png');

const aim0 = await page.evaluate(() => !!window.__g.aimAssist);
await toRail();
await pad('down');                                 // rail -> first GAMEPLAY row (AIM ASSIST)
check('E04b D-pad DOWN lands on AIM ASSIST',
  await page.evaluate(() => document.querySelector('#cgs-body .cgs-row.sel')?.dataset.row) === 'aim');
await pad('a');
check('E05 A toggles AIM ASSIST (the same flag the T key sets)',
  await page.evaluate(() => !!window.__g.aimAssist) !== aim0);
await pad('a');
check('E06 AIM ASSIST restored', await page.evaluate(() => !!window.__g.aimAssist) === aim0);

await page.click('#cgs-tabs .cgs-tab[data-tab="controls"]');
await page.waitForTimeout(250);
const ctl = await page.evaluate(() => ({
  tab: window.__g._setsTab,
  binds: document.querySelectorAll('#cgs-body .cgs-row .cgs-keys').length,
  kb: document.querySelectorAll('#cgs-body .cgs-key:not(.padkey):not(.none)').length,
  gpKeys: document.querySelectorAll('#cgs-body .cgs-key.padkey').length,
  hasHowTo: !!document.querySelector('#cgs-body .cgs-row[data-row="howto"]'),
  note: !!document.querySelector('#cgs-body .cgs-note'),
}));
check('E07 mouse click selects the CONTROLS tab', ctl.tab === 'controls');
check('E08 CONTROLS lists both keyboard and controller bindings',
  ctl.binds >= 12 && ctl.kb >= 15 && ctl.gpKeys >= 10, JSON.stringify(ctl));
check('E09 HOW TO PLAY is still reachable from CONTROLS', ctl.hasHowTo);
check('E10 CONTROLS states honestly that bindings are not remappable here', ctl.note);
await shot('04_controls.png');

// ── F. RESET TO DEFAULTS is gated by a real confirmation ──
await page.evaluate(() => {
  const g = window.__g;
  g.audio.setMasterVolume(0.30); g.audio.setMusicVolume(0.20); g.audio.setSfxVolume(0.10);
  if (g.audio.setEdenVolume) g.audio.setEdenVolume(0.20);
  if (!g.audio.muted) g.audio.toggleMute();
  g.audio.setRadioEnabled(false);
  g.aimAssist = false;
  g._setsRender();
});
const save0 = await page.evaluate(() => {
  const m = window.__g.meta;
  return { stages: m.stagesCleared, credits: m.credits, frags: m.protocolFragments,
           unlocks: JSON.stringify(m.unlocked || {}).length, relics: JSON.stringify(m.relics || {}).length };
});
await page.click('[data-foot="reset"]');
await page.waitForTimeout(250);
check('F01 RESET opens a confirmation instead of acting immediately',
  await page.evaluate(() => !!window.__g._setsConfirmOpen &&
    document.getElementById('cgs-confirm').classList.contains('open')));
await shot('05_confirm.png');
// B / Circle cancels
await pad('b');
await page.waitForTimeout(250);
const cancelled = await page.evaluate(() => ({
  open: !!window.__g._setsConfirmOpen,
  master: window.__g.audio.masterVolume,
  gs: window.__g.gameState,
}));
check('F02 B / Circle closes the confirmation', cancelled.open === false, JSON.stringify(cancelled));
check('F03 cancelling changes nothing', Math.abs(cancelled.master - 0.30) < 1e-6, JSON.stringify(cancelled));
check('F04 cancelling does not leave the SETTINGS screen', cancelled.gs === 'settings', cancelled.gs);

// now confirm for real, with the controller
await page.click('[data-foot="reset"]');
await page.waitForTimeout(250);
await pad('right');    // CANCEL -> RESET
await pad('a');
await page.waitForTimeout(350);
const reset = await page.evaluate(() => {
  const g = window.__g, m = g.meta;
  return {
    open: !!g._setsConfirmOpen,
    master: g.audio.masterVolume, music: g.audio.musicVolume, sfx: g.audio.sfxVolume,
    eden: g.audio.edenVolume, muted: !!g.audio.muted, radio: !!g.audio.radioEnabled,
    aim: !!g.aimAssist,
    save: { stages: m.stagesCleared, credits: m.credits, frags: m.protocolFragments,
            unlocks: JSON.stringify(m.unlocked || {}).length, relics: JSON.stringify(m.relics || {}).length },
  };
});
const DEF = { master: 1.0, music: 0.70, sfx: 0.80, eden: 0.95 };
check('F05 confirmation closes after RESET', reset.open === false);
check('F06 audio levels restored to AudioManager defaults',
  Math.abs(reset.master - DEF.master) < 1e-6 && Math.abs(reset.music - DEF.music) < 1e-6 &&
  Math.abs(reset.sfx - DEF.sfx) < 1e-6 && Math.abs(reset.eden - DEF.eden) < 1e-6, JSON.stringify(reset));
check('F07 mute off and NULL RADIO on after reset', reset.muted === false && reset.radio === true, JSON.stringify(reset));
check('F08 aim assist back on after reset', reset.aim === true);
check('F09 RESET does not touch save, progression, unlocks or relics',
  JSON.stringify(reset.save) === JSON.stringify(save0), JSON.stringify({ save0, after: reset.save }));

// ── G. Footer + exit paths ──
await page.evaluate(() => { window.__g._setsSel = window.__g._setsNav().length - 1; window.__g._setsFoot = 3; window.__g._setsRender(); });
const footSel = await page.evaluate(() => document.querySelector('[data-foot="back"]')?.classList.contains('sel'));
check('G01 the footer takes controller focus and marks the active button', footSel === true);
await pad('a');
await page.waitForTimeout(600);
const backOut = await page.evaluate(() => ({
  gs: window.__g.gameState,
  vis: getComputedStyle(document.getElementById('cgm-settings')).display,
}));
check('G02 A on BACK returns to the main menu', backOut.gs === 'start_menu' && backOut.vis === 'none', JSON.stringify(backOut));

await page.click('[data-cgm-item="SETTINGS"]');
await page.waitForTimeout(500);
await pad('b');
await page.waitForTimeout(600);
check('G03 B / Circle exits SETTINGS from anywhere',
  await page.evaluate(() => window.__g.gameState) === 'start_menu');

await page.click('[data-cgm-item="SETTINGS"]');
await page.waitForTimeout(500);
await key('Escape');
await page.waitForTimeout(400);
check('G04 ESC exits SETTINGS as well',
  await page.evaluate(() => window.__g.gameState) === 'start_menu');

// ── H. Mobile viewport ──
await page.click('[data-cgm-item="SETTINGS"]');
await page.waitForTimeout(500);
await page.setViewportSize({ width: 400, height: 780 });
await page.waitForTimeout(400);
const mob = await page.evaluate(() => {
  const stage = document.querySelector('#cgm-settings .cgs-stage').getBoundingClientRect();
  const rows = Array.from(document.querySelectorAll('#cgs-body .cgs-row'));
  const tabs = Array.from(document.querySelectorAll('#cgs-tabs .cgs-tab'));
  const back = document.querySelector('[data-foot="back"]').getBoundingClientRect();
  return {
    fits: stage.width <= 400 && stage.left >= -1,
    rowsVisible: rows.filter(r => r.offsetParent !== null).length,
    overflowing: rows.filter(r => r.getBoundingClientRect().right > 401).length,
    tabsVisible: tabs.filter(t => t.offsetParent !== null).length,
    backTall: back.height >= 40,
  };
});
check('H01 mobile: the panel fits the viewport', mob.fits, JSON.stringify(mob));
check('H02 mobile: rows render and none overflow', mob.rowsVisible > 0 && mob.overflowing === 0, JSON.stringify(mob));
check('H03 mobile: all four tabs stay reachable', mob.tabsVisible === 4, JSON.stringify(mob));
check('H04 mobile: footer buttons grow to a real touch target', mob.backTall, JSON.stringify(mob));
await shot('06_mobile.png');
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);

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
