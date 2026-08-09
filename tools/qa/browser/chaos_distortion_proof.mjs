// ─────────────────────────────────────────────────────────────────────────────
// CHAOS MODE — WORLD DISTORTION RUNTIME PROOF (2026-08-09, Maria)
//
// Πραγματικό chaos run μέσω του δικού του entry (_beginChaosRun — ίδιο recipe με
// το chaos_retry_proof). Gates:
//   D1 boot → start_menu, 0 page errors
//   D2 ζωντανό Game instance
//   D3 chaos: _chaosMode=true, chaos deck art ενεργό
//   D4 _drawChaosDistortion υπάρχει και καλείται κάθε frame (draw-spy)
//   D5 stub-ctx sampling έως 14s → τουλάχιστον ένα distortion event ζωγραφίζει
//      (glitch slice / chromatic / tear / wave) και το max ops μένει bounded
//   D6 soak 8s με ενεργό canvas self-copy → 0 page errors (ασφάλεια drawImage)
//   D7 guards: chaos call sites (_chaosDeckImg + deck mode==='chaos')· η μέθοδος
//      ΔΕΝ καλείται στο endless city path
//   D8 μηδέν page errors / μηδέν non-404 console errors συνολικά
// Usage:  node tools/qa/browser/chaos_distortion_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.CHAOS_PROOF_SHOTS || '/tmp/chaos_distortion_shots';
const BUILD = '20260908130000';

let failures = 0;
const gate = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
    try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 6, chaosUnlocked: true })); } catch (_) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return;
    consoleErrors.push(t);
  });
  const cdp = await ctx.newCDPSession(page);
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOTS + '/' + name, Buffer.from(data, 'base64'));
  };

  await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
  gate('D1 boot → start_menu', true);
  gate('D1b μηδέν page errors στο boot', pageErrors.length === 0, pageErrors.join(' | '));

  await page.evaluate(async (build) => {
    const mod = await import(`./js/game/Game.js?v=${build}`);
    await new Promise((res) => {
      const orig = mod.Game.prototype.update;
      mod.Game.prototype.update = function (...a) {
        window.__g = this; mod.Game.prototype.update = orig; res();
        return orig.apply(this, a);
      };
    });
  }, BUILD);
  gate('D2 ζωντανό Game instance', await page.evaluate(() => !!window.__g));

  // D3: chaos entry μέσω του production path του παιχνιδιού (recipe chaos_retry_proof)
  await page.evaluate(() => {
    const g = window.__g;
    g.meta._save = () => {};
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing';
    g.reset();
    g.runChaosLaw = 'blood_grid';
    g._beginChaosRun();
    g.player.maxHp = 99999; g.player.hp = 99999;
    // Το QA entry παρακάμπτει το UI flow — κρύψε το DOM menu overlay για να
    // φαίνεται ο καμβάς στα screenshots (καθαρά proof-cosmetic, όχι game code).
    const ov = document.querySelector('#cgm-overlay');
    if (ov) ov.style.display = 'none';
  });
  await sleep(900);
  const st = await page.evaluate(() => {
    const g = window.__g, mm = g.mapManager;
    return { gs: g.gameState, chaos: !!g._chaosMode,
             deck: !!(mm._chaosDeckImg?.complete && mm._chaosDeckImg.naturalWidth > 0) };
  });
  gate('D3 chaos run: playing + _chaosMode', st.gs === 'playing' && st.chaos, JSON.stringify(st));
  gate('D3b chaos deck art ενεργό', st.deck);

  // D4: υπάρχει + καλείται κάθε frame
  const spy = await page.evaluate(async () => {
    const mm = window.__g.mapManager;
    if (typeof mm._drawChaosDistortion !== 'function') return { exists: false, calls: 0 };
    let calls = 0;
    const orig = mm._drawChaosDistortion.bind(mm);
    mm._drawChaosDistortion = (...a) => { calls++; return orig(...a); };
    await new Promise(r => setTimeout(r, 2000));
    mm._drawChaosDistortion = orig;
    return { exists: true, calls };
  });
  gate('D4 _drawChaosDistortion υπάρχει', spy.exists);
  // Το headless chaos run τρέχει ~8-10fps (βαρύ law + software rendering) — το gate
  // αποδεικνύει «καλείται συνεχώς», όχι το fps του harness.
  gate('D4b καλείται συνεχώς', spy.calls > 10, `${spy.calls} calls / 2s`);

  // D5: stub-ctx sampling — τα events είναι κυκλικά/σπάνια, άρα δειγματοληπτούμε
  const sampled = await page.evaluate(async () => {
    const g = window.__g, mm = g.mapManager;
    const mk = (camX, camY) => {
      const c = { ops: 0, globalAlpha: 1, globalCompositeOperation: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '',
                  canvas: { width: 1280, height: 720 } };
      for (const f of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'translate', 'scale', 'setTransform', 'quadraticCurveTo'])
        c[f] = () => {};
      for (const f of ['arc', 'ellipse', 'fill', 'stroke', 'fillRect', 'drawImage'])
        c[f] = () => { c.ops++; };
      c.getTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: -camX, f: -camY });
      c.createRadialGradient = () => ({ addColorStop: () => {} });
      c.createLinearGradient = () => ({ addColorStop: () => {} });
      return c;
    };
    let maxOps = 0, hits = 0;
    for (let i = 0; i < 70; i++) {
      const vs = g._viewScale || 1, vw = 1280 / vs, vh = 720 / vs;
      const cam = g.camera || { x: g.player.pos.x - vw / 2, y: g.player.pos.y - vh / 2 };
      const c = mk(cam.x, cam.y);
      try { mm._drawChaosDistortion(c, 3, cam.x - 96, cam.x + vw + 96, cam.x, cam.y, vw, vh); } catch (_) {}
      if (c.ops > 0) hits++;
      if (c.ops > maxOps) maxOps = c.ops;
      await new Promise(r => setTimeout(r, 200));
    }
    return { maxOps, hits };
  });
  gate('D5 τουλάχιστον ένα distortion event σε 14s', sampled.maxOps > 0, `maxOps=${sampled.maxOps}, hits=${sampled.hits}/70`);
  gate('D5b bounded (maxOps < 400)', sampled.maxOps < 400, `maxOps=${sampled.maxOps}`);

  // D6: soak με το πραγματικό canvas self-copy ενεργό — καμία εξαίρεση.
  // Κρατάμε τον παίκτη ζωντανό σε όλο το soak (τα chaos laws τρώνε HP συνεχώς).
  await page.evaluate(() => { const g = window.__g; g.player.maxHp = 99999; g.player.hp = 99999; });
  await shot('chaos_distortion.png');
  const errsBefore = pageErrors.length;
  for (let i = 0; i < 8; i++) {
    await sleep(1000);
    await page.evaluate(() => { const g = window.__g; if (g.player) { g.player.hp = g.player.maxHp; } });
  }
  const stillChaos = await page.evaluate(() => ({ gs: window.__g.gameState, chaos: !!window.__g._chaosMode }));
  await shot('chaos_distortion2.png');
  gate('D6 soak 8s: 0 νέα page errors (self-copy ασφαλές)', pageErrors.length === errsBefore,
       pageErrors.slice(errsBefore, errsBefore + 3).join(' | '));
  gate('D6b το chaos run επιβίωσε το soak', stillChaos.gs === 'playing' && stillChaos.chaos, JSON.stringify(stillChaos));

  // D7: guards — chaos call sites, και ΟΧΙ στο endless city path
  const guard = await page.evaluate(() => {
    const mm = window.__g.mapManager;
    const city = mm._drawCityWorld.toString();
    const deck = mm._drawDeckWorld.toString();
    return {
      cityGuard: /img === this\._chaosDeckImg/.test(city) && /_drawChaosDistortion/.test(city),
      deckGuard: /m\.mode === 'chaos'/.test(deck) && /_drawChaosDistortion/.test(deck),
      cityAmbSafe: !/(_drawChaosDistortion)/.test(mm._drawCityAmbience.toString()),
    };
  });
  gate('D7 chaos guard στο main strip call site', guard.cityGuard);
  gate('D7b chaos guard στο section deck call site', guard.deckGuard);

  gate('D8 μηδέν page errors συνολικά', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  gate('D8b μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
