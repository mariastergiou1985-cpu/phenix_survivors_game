// ─────────────────────────────────────────────────────────────────────────────
// ENDLESS MEGACITY — RAIN + NEON REFLECTIONS RUNTIME PROOF (2026-08-09, Maria)
//
// Πραγματικό endless run μέσω production flow. Gates:
//   R1 boot → start_menu, 0 page errors
//   R2 ζωντανό Game instance
//   R3 endless: playing, endless=true, city strip ενεργό
//   R4 _drawCityRain υπάρχει και καλείται κάθε frame (draw-spy)
//   R5 stub-ctx render στο plaza → πραγματικά rain/splash/reflection ops
//   R5b acid rain mutual exclusion: με acidRainSystem active → ΜΗΔΕΝ ops
//   R6 κίνηση βροχής: δύο canvas samples 700ms απόσταση διαφέρουν αισθητά
//   R7 guard: call site μόνο για το endless city art (όχι chaos deck)
//   R8 μηδέν page errors / μηδέν non-404 console errors συνολικά
// Usage:  node tools/qa/browser/endless_city_rain_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.RAIN_PROOF_SHOTS || '/tmp/endless_rain_shots';
const BUILD = '20260908120000';

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
    try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 6 })); } catch (_) {}
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
  gate('R1 boot → start_menu', true);
  gate('R1b μηδέν page errors στο boot', pageErrors.length === 0, pageErrors.join(' | '));

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
  gate('R2 ζωντανό Game instance', await page.evaluate(() => !!window.__g));

  const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(160); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(160); };
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await click('#cgm-modesel .msl-card[data-mode="endless"]');
  await click('#mi-continue');
  await sleep(400);
  await page.evaluate(() => { document.querySelector('.csc-card')?.click(); });
  await sleep(250);
  await click('#csc-endless-btn');
  await sleep(800);
  const st = await page.evaluate(() => {
    const g = window.__g, mm = g.mapManager;
    return { gs: g.gameState, endless: !!g.endless,
             city: !!(mm.chunkStreamingEnabled && mm._cityImg?.complete && mm._cityImg.naturalWidth > 0) };
  });
  gate('R3 endless: playing + city strip', st.gs === 'playing' && st.endless && st.city, JSON.stringify(st));

  // R4: υπάρχει + καλείται κάθε frame
  const spy = await page.evaluate(async () => {
    const mm = window.__g.mapManager;
    if (typeof mm._drawCityRain !== 'function') return { exists: false, calls: 0 };
    let calls = 0;
    const orig = mm._drawCityRain.bind(mm);
    mm._drawCityRain = (...a) => { calls++; return orig(...a); };
    await new Promise(r => setTimeout(r, 2000));
    mm._drawCityRain = orig;
    return { exists: true, calls };
  });
  gate('R4 _drawCityRain υπάρχει', spy.exists);
  gate('R4b καλείται συνεχώς', spy.calls > 10, `${spy.calls} calls / 2s`);

  // R5 / R5b: stub-ctx render + acid-rain mutual exclusion
  const stub = await page.evaluate(() => {
    const g = window.__g, mm = g.mapManager;
    const mk = () => {
      const c = { ops: 0, globalAlpha: 1, globalCompositeOperation: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '' };
      for (const f of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'translate', 'scale'])
        c[f] = () => {};
      for (const f of ['arc', 'ellipse', 'fill', 'stroke', 'fillRect'])
        c[f] = () => { c.ops++; };
      c.createRadialGradient = () => ({ addColorStop: () => {} });
      c.createLinearGradient = () => ({ addColorStop: () => {} });
      return c;
    };
    const S  = mm.CITY_SCALE;
    const tw = mm._cityImg.naturalWidth * S, th = mm._cityImg.naturalHeight * S;
    const vs = g._viewScale || 1, vw = 1280 / vs, vh = 720 / vs;
    const midY = Math.max(0, th / 2 - vh / 2);
    const cA = mk();
    mm._drawCityRain(cA, tw, th, S, -96, vw + 96, 0, midY, vw, vh);
    // acid-rain active → η ambient βροχή σωπαίνει
    const ar = g.acidRainSystem;
    let acidOps = -1;
    if (ar) {
      const prev = ar._phase;
      ar._phase = 'storm';
      const cB = mk();
      mm._drawCityRain(cB, tw, th, S, -96, vw + 96, 0, midY, vw, vh);
      ar._phase = prev;
      acidOps = cB.ops;
    }
    return { plaza: cA.ops, acidOps };
  });
  gate('R5 plaza → rain/splash/reflection ops > 40', stub.plaza > 40, `ops=${stub.plaza}`);
  gate('R5b acid rain active → ΜΗΔΕΝ ambient ops', stub.acidOps === 0, `ops=${stub.acidOps}`);

  // R6: κίνηση βροχής — samples στο μεσαίο band του καμβά
  await page.evaluate(() => { const g = window.__g; g.player.maxHp = 99999; g.player.hp = 99999; });
  await sleep(300);
  await shot('rain.png');
  const motion = await page.evaluate(async () => {
    const cv = document.querySelector('canvas');
    const grab = () => {
      const c = document.createElement('canvas');
      c.width = cv.width; c.height = cv.height;
      const cx = c.getContext('2d');
      cx.drawImage(cv, 0, 0);
      return cx.getImageData(0, Math.floor(cv.height * 0.3), cv.width, 200).data;
    };
    const a = grab();
    await new Promise(r => setTimeout(r, 700));
    const b = grab();
    let diff = 0;
    for (let i = 0; i < a.length; i += 16) diff += Math.abs(a[i] - b[i]);
    return diff;
  });
  gate('R6 βροχή κινείται (frame diff > 3000)', motion > 3000, `diff=${motion}`);
  await shot('rain2.png');

  // R7: guard στο call site
  const guard = await page.evaluate(() => {
    const src = window.__g.mapManager._drawCityWorld.toString();
    return /img === this\._cityImg/.test(src) && /_drawCityRain/.test(src);
  });
  gate('R7 call-site guard: μόνο endless city art', guard);

  await sleep(800);
  gate('R8 μηδέν page errors συνολικά', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  gate('R8b μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
