// ════════════════════════════════════════════════════════════════════════════════
// AUDIO SYSTEM + PHENIX NULL RADIO — Chromium proof.
//
// Every volume claim here is measured on the REAL WebAudio graph — the gain node
// values the mix actually runs at — not on the numbers the panel prints. And every
// persistence claim is measured by constructing a SECOND AudioManager, which re-reads
// localStorage exactly as a page reload does.
//
// The defect this was written for, measured before the fix on a clean profile:
//   setMasterVolume(0); setSfxVolume(0)  ->  localStorage "0" / "0"      (saved fine)
//   new AudioManager()                   ->  master 1.0, sfx 0.8
//                                            _volumeRepairs ["master","sfx"]
// A slider pulled to zero silenced the game for that session and then quietly undid
// itself on the next boot. The audibility repair could not tell a deliberate 0 from
// the stray-drag 0.0172 it was written to catch.
//
// Run: node tools/qa/browser/audio_radio_proof.mjs [port]
// Writes: /tmp/audio_radio_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/audio_radio_proof';
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

const BUILD = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];
const AUD_V = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').match(/AudioManager\.js\?v=(\d+)/)[1];

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
console.log(`serving ${ROOT} on ${BASE}   BUILD=${BUILD}  audio=${AUD_V}`);

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
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
check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

// ════════════════════════════════════════════════════════════════════════════
// B. EVERY SLIDER MOVES THE REAL BUS
// ════════════════════════════════════════════════════════════════════════════
const bus = await page.evaluate(async (v) => {
  const m = await import(`./js/audio/AudioManager.js?v=${v}`);
  const A = m.AudioManager;
  localStorage.clear();
  const a = new A();
  const read = () => ({
    masterNode: +a.masterGain.gain.value.toFixed(4),
    musicNode:  +a.musicGain.gain.value.toFixed(4),
    sfxNode:    +a.sfxGain.gain.value.toFixed(4),
    master: a.masterVolume, music: a.musicVolume, sfx: a.sfxVolume, eden: a.edenVolume,
  });
  const steps = [];
  for (const t of [0.25, 0.5, 0.75, 1.0]) {
    a.setMasterVolume(t); a.setMusicVolume(t); a.setSfxVolume(t); a.setEdenVolume(t);
    steps.push({ t, ...read() });
  }
  a.setMasterVolume(0); a.setMusicVolume(0); a.setSfxVolume(0); a.setEdenVolume(0);
  const zero = read();
  // near-zero drag must snap to a true zero on BOTH buses that guard against it
  const b2 = new A(); b2.setMasterVolume(0.017); b2.setSfxVolume(0.017);
  const snap = { master: b2.masterVolume, sfx: b2.sfxVolume,
                 masterNode: b2.masterGain.gain.value, sfxNode: b2.sfxGain.gain.value };
  return { steps, zero, snap };
}, AUD_V);
check('B01 the MASTER slider drives the real master gain node at every step',
  bus.steps.every(s => Math.abs(s.masterNode - s.t) < 1e-4), JSON.stringify(bus.steps.map(s => [s.t, s.masterNode])));
check('B02 the MUSIC slider drives the real music gain node at every step',
  bus.steps.every(s => Math.abs(s.musicNode - s.t) < 1e-4), JSON.stringify(bus.steps.map(s => [s.t, s.musicNode])));
check('B03 the SFX slider drives the real SFX gain node at every step',
  bus.steps.every(s => Math.abs(s.sfxNode - s.t) < 1e-4), JSON.stringify(bus.steps.map(s => [s.t, s.sfxNode])));
check('B04 the EDEN slider stores what it was given at every step',
  bus.steps.every(s => Math.abs(s.eden - s.t) < 1e-4), JSON.stringify(bus.steps.map(s => [s.t, s.eden])));
check('B05 at 0 every bus is truly silent, not almost silent',
  bus.zero.masterNode === 0 && bus.zero.musicNode === 0 && bus.zero.sfxNode === 0 && bus.zero.eden === 0,
  JSON.stringify(bus.zero));
check('B06 a near-zero drag snaps to a true 0 on BOTH master and SFX',
  bus.snap.master === 0 && bus.snap.sfx === 0 && bus.snap.masterNode === 0 && bus.snap.sfxNode === 0,
  JSON.stringify(bus.snap));

// ════════════════════════════════════════════════════════════════════════════
// C. PERSISTENCE — a second AudioManager re-reads localStorage like a reload
// ════════════════════════════════════════════════════════════════════════════
const persist = await page.evaluate(async (v) => {
  const m = await import(`./js/audio/AudioManager.js?v=${v}`);
  const A = m.AudioManager;
  const roundTrip = (vals) => {
    localStorage.clear();
    const a = new A();
    a.setMasterVolume(vals.master); a.setMusicVolume(vals.music);
    a.setSfxVolume(vals.sfx);       a.setEdenVolume(vals.eden);
    const raw = {
      master: localStorage.getItem('phenix_master_volume'), music: localStorage.getItem('phenix_music_volume'),
      sfx: localStorage.getItem('phenix_sfx_volume'),       eden: localStorage.getItem('phenix_eden_volume'),
    };
    const b = new A();     // <- the reload
    return { raw, after: { master: b.masterVolume, music: b.musicVolume, sfx: b.sfxVolume, eden: b.edenVolume },
             nodes: { master: b.masterGain.gain.value, music: b.musicGain.gain.value, sfx: b.sfxGain.gain.value },
             repairs: (b._volumeRepairs || []).map(r => r.bus) };
  };
  const mid  = roundTrip({ master: 0.42, music: 0.31, sfx: 0.33, eden: 0.66 });
  const zero = roundTrip({ master: 0, music: 0, sfx: 0, eden: 0 });
  // the stray-drag case the repair exists for MUST still be repaired
  localStorage.clear();
  localStorage.setItem('phenix_master_volume', '0.0172');
  localStorage.setItem('phenix_sfx_volume', '0.011');
  const c = new A();
  const stray = { master: c.masterVolume, sfx: c.sfxVolume, repairs: (c._volumeRepairs || []).map(r => r.bus) };
  // and so must a corrupted value
  localStorage.clear();
  localStorage.setItem('phenix_master_volume', 'not-a-number');
  const d = new A();
  const junk = { master: d.masterVolume, repairs: (d._volumeRepairs || []).map(r => r.bus) };
  // mute round-trips
  localStorage.clear();
  const e = new A(); if (!e.muted) e.toggleMute();
  const f = new A();
  const mute = { saved: localStorage.getItem('phenix_muted'), after: f.muted, node: f.masterGain.gain.value };
  return { mid, zero, stray, junk, mute };
}, AUD_V);
check('C01 ordinary values round-trip through a reload exactly',
  Math.abs(persist.mid.after.master - 0.42) < 1e-6 && Math.abs(persist.mid.after.music - 0.31) < 1e-6 &&
  Math.abs(persist.mid.after.sfx - 0.33) < 1e-6 && Math.abs(persist.mid.after.eden - 0.66) < 1e-6,
  JSON.stringify(persist.mid));
check('C02 a deliberate ZERO is written to storage', persist.zero.raw.master === '0' && persist.zero.raw.sfx === '0',
  JSON.stringify(persist.zero.raw));
check('C03 a deliberate ZERO SURVIVES the reload — this is the defect',
  persist.zero.after.master === 0 && persist.zero.after.sfx === 0 &&
  persist.zero.after.music === 0 && persist.zero.after.eden === 0,
  JSON.stringify(persist.zero.after));
check('C04 no audibility repair fires on a deliberate zero',
  persist.zero.repairs.length === 0, JSON.stringify(persist.zero.repairs));
check('C05 the reloaded buses are actually silent, not just the numbers',
  persist.zero.nodes.master === 0 && persist.zero.nodes.music === 0 && persist.zero.nodes.sfx === 0,
  JSON.stringify(persist.zero.nodes));
check('C06 the stray-drag case the repair exists for is STILL repaired',
  persist.stray.master === 1 && persist.stray.sfx === 0.8 &&
  persist.stray.repairs.includes('master') && persist.stray.repairs.includes('sfx'),
  JSON.stringify(persist.stray));
// NOTE: a corrupted value never reaches the repair — _loadVolumes' own read() already
// substitutes the default for anything non-finite. The repair list is empty here and that
// is correct; what matters is that the loaded value is sane, which is what this asserts.
check('C07 a corrupted stored value loads as the default, never as NaN',
  persist.junk.master === 1 && Number.isFinite(persist.junk.master), JSON.stringify(persist.junk));
check('C08 mute round-trips through a reload and really zeroes the master bus',
  persist.mute.saved === 'true' && persist.mute.after === true && persist.mute.node === 0,
  JSON.stringify(persist.mute));

// ════════════════════════════════════════════════════════════════════════════
// D. THE MAIN-MENU NULL RADIO SWITCH
// ════════════════════════════════════════════════════════════════════════════
// The C block leaves whatever it last wrote in localStorage — including phenix_muted
// 'true' — and game.audio is only built on the FIRST user gesture, so it would boot
// muted and every music-bus reading below would be a reading of the mute. Clear first.
await page.evaluate(() => localStorage.clear());
// A neutral KEY press, not a click: a click at an arbitrary point can land on a menu
// button and navigate off the main menu. _initAudioOnGesture listens on keydown too.
await page.keyboard.down('Shift'); await page.waitForTimeout(120); await page.keyboard.up('Shift');
await page.waitForTimeout(1400);
check('D-pre the main menu is still the live screen',
  await page.evaluate(() => window.__g.gameState === 'start_menu'),
  await page.evaluate(() => window.__g.gameState));
check('D00 the audio engine came up on the first gesture',
  await page.evaluate(() => !!window.__g.audio && !!window.__g.audio.masterGain),
  await page.evaluate(() => String(!!window.__g.audio)));
await page.evaluate(() => {
  const g = window.__g;
  if (g.audio) { g.audio.setRadioEnabled(true); g.audio.stopMenuRadio(); }
  g._menuRadioFocus = false;
  g._syncMenuOverlayActive();
});
await page.waitForTimeout(300);
const sw = await page.evaluate(() => {
  const el = document.getElementById('cgm-radio-sw');
  return el ? { present: true, on: el.classList.contains('on'), label: el.querySelector('b')?.textContent,
                aria: el.getAttribute('aria-checked'), role: el.getAttribute('role'),
                inNowPlaying: !!el.closest('section')?.querySelector('#cgm-eq-bars') }
            : { present: false };
});
check('D01 the switch exists in the Main Menu, in the NOW PLAYING panel next to the radio',
  sw.present && sw.inNowPlaying, JSON.stringify(sw));
check('D02 it reads ON when the radio is enabled', sw.on === true && sw.label === 'ON' && sw.aria === 'true',
  JSON.stringify(sw));
check('D03 it is a real switch for assistive tech', sw.role === 'switch', JSON.stringify(sw));
await shot('01_menu_radio_on.png');

// MOUSE
const m0 = await page.evaluate(() => window.__g.audio.radioEnabled !== false);
await page.click('#cgm-radio-sw');
await page.waitForTimeout(350);
const m1 = await page.evaluate(() => ({
  enabled: window.__g.audio.radioEnabled !== false,
  onAir: !!window.__g.audio.isRadioOnAir(),
  cls: document.getElementById('cgm-radio-sw').classList.contains('on'),
  label: document.getElementById('cgm-radio-sw').querySelector('b')?.textContent,
  saved: localStorage.getItem('phenix_radio_enabled'),
}));
check('D04 a mouse click turns the radio OFF', m0 === true && m1.enabled === false, JSON.stringify({ m0, m1 }));
check('D05 OFF really stops the broadcast — nothing is on air', m1.onAir === false, JSON.stringify(m1));
check('D06 the button shows OFF and persists the choice',
  m1.cls === false && m1.label === 'OFF' && m1.saved === 'false', JSON.stringify(m1));
await shot('02_menu_radio_off.png');

// the menu theme is untouched by the switch — only the broadcast stops
const theme = await page.evaluate(() => {
  const a = window.__g.audio;
  return { musicNode: +a.musicGain.gain.value.toFixed(4), musicVol: a.musicVolume,
           title: a.currentTrackTitle, onAir: !!a.isRadioOnAir() };
});
check('D07 turning the radio off leaves the music bus at the level the slider says',
  Math.abs(theme.musicNode - theme.musicVol) < 1e-3 && theme.onAir === false, JSON.stringify(theme));

// KEYBOARD
await page.evaluate(() => { window.__g._menuRadioFocus = true; window.__g._syncMenuOverlayActive(); });
const k0 = await page.evaluate(() => ({ radio: window.__g.audio.radioEnabled !== false,
                                        gs: window.__g.gameState, focus: !!window.__g._menuRadioFocus }));
await page.keyboard.down('Enter'); await page.waitForTimeout(180);
await page.keyboard.up('Enter');   await page.waitForTimeout(450);
const k1 = await page.evaluate(() => ({ radio: window.__g.audio.radioEnabled !== false,
                                        gs: window.__g.gameState }));
check('D08 ENTER toggles the switch when it holds focus — exactly once',
  k0.gs === 'start_menu' && k0.focus === true && k1.radio !== k0.radio, JSON.stringify({ k0, k1 }));
// The defect this pins: the button is a real <button>, so with DOM focus the browser turns
// Enter into a native click while the menu handler fires too. Two toggles cancelled out and
// the switch looked dead from the keyboard.
await page.evaluate(() => document.getElementById('cgm-radio-sw').focus());
const dbl0 = await page.evaluate(() => window.__g.audio.radioEnabled !== false);
await page.keyboard.down('Enter'); await page.waitForTimeout(180);
await page.keyboard.up('Enter');   await page.waitForTimeout(450);
const dbl1 = await page.evaluate(() => window.__g.audio.radioEnabled !== false);
check('D08b ENTER while the button holds DOM focus toggles once, not twice',
  dbl1 !== dbl0, JSON.stringify({ dbl0, dbl1 }));

// CONTROLLER — D-pad RIGHT focuses it, A toggles, LEFT returns to the rail
await page.evaluate(() => { window.__g._menuRadioFocus = false; window.__g.menuIndex = 0; window.__g._syncMenuOverlayActive(); });
const focused = await padUntil('right', () => window.__g._menuRadioFocus === true);
check('D09 D-pad RIGHT moves focus onto the switch', focused >= 0, `presses: ${focused}`);
check('D10 the focused switch is visibly marked',
  await page.evaluate(() => document.getElementById('cgm-radio-sw').classList.contains('navsel')));
await shot('03_menu_radio_focus.png');
// stash the starting value IN THE PAGE — padUntil's predicate is serialized and cannot
// close over a Node-side variable
const c0 = await page.evaluate(() => {
  window.__radio0 = window.__g.audio.radioEnabled !== false;
  return window.__radio0;
});
const toggled = await padUntil('a', () => (window.__g.audio.radioEnabled !== false) !== window.__radio0);
check('D11 A / Cross toggles the radio from the controller', toggled >= 0, `presses: ${toggled}, from ${c0}`);
const back = await padUntil('left', () => window.__g._menuRadioFocus === false);
check('D12 D-pad LEFT returns focus to the menu rail', back >= 0, `presses: ${back}`);
check('D13 the menu rail is highlighted again, and the switch is not',
  await page.evaluate(() => !document.getElementById('cgm-radio-sw').classList.contains('navsel') &&
    document.querySelectorAll('#cgm-menu-nav .mbtn.active').length === 1));

// UP/DOWN must never strand the player on the switch
await page.evaluate(() => { window.__g._menuRadioFocus = true; window.__g._syncMenuOverlayActive(); });
const outDown = await padUntil('down', () => window.__g._menuRadioFocus === false);
check('D14 D-pad DOWN also releases the switch — the player cannot get stuck on it',
  outDown >= 0, `presses: ${outDown}`);

// menu navigation itself is unchanged
const navOk = await page.evaluate(() => {
  const g = window.__g;
  g._menuRadioFocus = false; g.menuIndex = 0;
  const n = g.menuItems.length;
  const send = (k) => g._updateStartMenu(0.016, { keys: new Set([k]) });
  send('arrowdown'); const a = g.menuIndex;
  send('arrowdown'); const b = g.menuIndex;
  send('arrowup');   const c = g.menuIndex;
  return { n, a, b, c };
});
check('D15 UP/DOWN still walk the menu items exactly as before',
  navOk.a === 1 && navOk.b === 2 && navOk.c === 1, JSON.stringify(navOk));

// the settings row and the menu switch share one owner
const shared = await page.evaluate(() => {
  const g = window.__g;
  g.audio.setRadioEnabled(true);
  const afterOn = { enabled: g.audio.radioEnabled, btn: document.getElementById('cgm-radio-sw').classList.contains('on') };
  g._syncRadioSwitch();
  const synced = document.getElementById('cgm-radio-sw').classList.contains('on');
  g.audio.setRadioEnabled(false);
  g._syncRadioSwitch();
  const off = document.getElementById('cgm-radio-sw').classList.contains('on');
  return { afterOn, synced, off, saved: localStorage.getItem('phenix_radio_enabled') };
});
check('D16 the menu switch is a view of AudioManager.radioEnabled, not a second store',
  shared.synced === true && shared.off === false && shared.saved === 'false', JSON.stringify(shared));

check('E01 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const gameErrors = consoleErrors.filter(t => !/audio\/music|radio broadcast failed|Could not load|failed to load/.test(t));
check('E02 zero game console errors across the whole session', gameErrors.length === 0, gameErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, audio: AUD_V, pass: passN, fail: failN, results, pageErrors, consoleErrors }, null, 1));

console.log(`\n=== RESULT: ${passN} PASS / ${failN} FAIL ===`);
if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
console.log('shots + report: ' + OUT);
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
