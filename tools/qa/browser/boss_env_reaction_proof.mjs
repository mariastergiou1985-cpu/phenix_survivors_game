// ─────────────────────────────────────────────────────────────────────────────
// BOSS-SPAWN ENVIRONMENT REACTIONS — RUNTIME PROOF (2026-08-09, Maria)
//
// Endless: city-light flicker/dim + traffic slow (time-warp) + warning glow στο
// spawn. Chaos: distortion boost + local pulse + floor warning. Gates:
//   B1/B2 boot + ζωντανό Game
//   B3 endless run: playing + city strip
//   B4 pre-warning: _endlessBossTimer < 3 → _envPreK > 0 (read-only anticipation)
//   B5 πραγματικό boss spawn (_spawnStageBoss('mech')) → _envBossEvt με θέση
//   B6 traffic time-warp μεγαλώνει όσο ισχύει η επιβράδυνση (χωρίς position jump)
//   B7 warning glow ζωγραφίζει ΜΕΣΑ στο plaza κατά το event (stub ops > 0 —
//      εκεί που το city-life baseline ήταν 0)
//   B8 μετά τα ~3s το event καθαρίζει και το plaza ξαναγίνεται 0 ops
//   B9 chaos run: playing + chaos deck
//   B10 boss spawn στο chaos → _envBossEvt + pulse/floor warning ops > 0 (stub)
//   B11 boost hook παρών στο chaos source (windows ×boost)
//   B12 μηδέν page errors / μηδέν non-404 console errors συνολικά
// Usage:  node tools/qa/browser/boss_env_reaction_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.BOSS_PROOF_SHOTS || '/tmp/boss_env_shots';
const BUILD = '20260908120000';

let failures = 0;
const gate = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const STUB_SRC = `(camX, camY) => {
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
}`;

async function boot(browser) {
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
    if (/Failed to load resource/.test(m.text())) return;
    consoleErrors.push(m.text());
  });
  await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
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
  return { ctx, page, pageErrors, consoleErrors };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ── ENDLESS ────────────────────────────────────────────────────────────────
  {
    const { ctx, page, pageErrors, consoleErrors } = await boot(browser);
    gate('B1 boot → start_menu (endless ctx)', true);
    gate('B2 ζωντανό Game instance', await page.evaluate(() => !!window.__g));
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
      g.player.maxHp = 99999; g.player.hp = 99999;
      return { gs: g.gameState, endless: !!g.endless,
               city: !!(mm.chunkStreamingEnabled && mm._cityImg?.complete && mm._cityImg.naturalWidth > 0) };
    });
    gate('B3 endless: playing + city strip', st.gs === 'playing' && st.endless && st.city, JSON.stringify(st));

    // B4: pre-warning — read-only anticipation από τον υπαρκτό rotation timer
    const pre = await page.evaluate(async () => {
      window.__g._endlessBossTimer = 2.5;               // QA: επιταχύνουμε ό,τι θα γινόταν ούτως ή άλλως
      await new Promise(r => setTimeout(r, 250));
      return window.__g.mapManager._envPreK || 0;
    });
    gate('B4 pre-warning: _envPreK > 0 όταν timer < 3s', pre > 0, `preK=${pre.toFixed(2)}`);

    // B5-B7: πραγματικό spawn → event + traffic warp + warning glow στο plaza
    const spawn = await page.evaluate(async (stubSrc) => {
      const g = window.__g, mm = g.mapManager;
      const mk = eval(stubSrc);
      const vs = g._viewScale || 1, vw = 1280 / vs, vh = 720 / vs;
      const S = mm.CITY_SCALE, tw = mm._cityImg.naturalWidth * S, th = mm._cityImg.naturalHeight * S;
      const midY = Math.max(0, th / 2 - vh / 2);
      const warp0 = mm._envTrafficWarp || 0;
      const ok = g._spawnStageBoss('mech');
      await new Promise(r => setTimeout(r, 300));
      const evt = mm._envBossEvt;
      // stub στο ΚΕΝΤΡΟ του plaza αλλά με κάμερα κοντά στο evt ώστε το glow να είναι στο view
      const c = mk(0, midY);
      mm._drawCityAmbience(c, tw, th, S, -96, vw + 96, 0, midY, vw, vh);
      await new Promise(r => setTimeout(r, 1200));
      const warp1 = mm._envTrafficWarp || 0;
      return { ok, evt: !!evt, ex: evt ? Math.round(evt.x) : null, plazaOps: c.ops, warp0, warp1 };
    }, STUB_SRC);
    gate('B5 boss spawn → _envBossEvt με θέση', spawn.ok && spawn.evt, JSON.stringify({ ok: spawn.ok, x: spawn.ex }));
    gate('B6 traffic time-warp μεγάλωσε στην επιβράδυνση', spawn.warp1 - spawn.warp0 > 0.2,
         `Δwarp=${(spawn.warp1 - spawn.warp0).toFixed(2)}s`);
    gate('B7 warning glow ζωγραφίζει στο plaza κατά το event', spawn.plazaOps > 0, `ops=${spawn.plazaOps}`);

    // B8: μετά τα ~3s το event καθαρίζει → plaza πάλι 0 ops. (Το B4 όπλισε και το
    // rotation spawn ~2.5s μετά — δεύτερο νόμιμο event — οπότε περιμένουμε poll
    // μέχρι να καθαρίσουν ΟΛΑ, έως 8s.)
    const after = await page.evaluate(async (stubSrc) => {
      const g = window.__g, mm = g.mapManager;
      const mk = eval(stubSrc);
      const t0 = Date.now();
      while (mm._envBossEvt && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 250));
      const vs = g._viewScale || 1, vw = 1280 / vs, vh = 720 / vs;
      const S = mm.CITY_SCALE, tw = mm._cityImg.naturalWidth * S, th = mm._cityImg.naturalHeight * S;
      const midY = Math.max(0, th / 2 - vh / 2);
      const c = mk(0, midY);
      mm._drawCityAmbience(c, tw, th, S, -96, vw + 96, 0, midY, vw, vh);
      return { evt: !!mm._envBossEvt, ops: c.ops };
    }, STUB_SRC);
    gate('B8 event καθάρισε + plaza ξανά 0 ops', !after.evt && after.ops === 0, JSON.stringify(after));
    gate('B12a endless: μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join('|'));
    gate('B12b endless: μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join('|'));
    await ctx.close();
  }

  // ── CHAOS ──────────────────────────────────────────────────────────────────
  {
    const { ctx, page, pageErrors, consoleErrors } = await boot(browser);
    await page.evaluate(() => {
      const g = window.__g;
      g.meta._save = () => {};
      g.selectedCharacter = 'skeleton_warrior';
      g.gameState = 'playing';
      g.reset();
      g.runChaosLaw = 'blood_grid';
      g._beginChaosRun();
      g.player.maxHp = 99999; g.player.hp = 99999;
      const ov = document.querySelector('#cgm-overlay');
      if (ov) ov.style.display = 'none';
    });
    // Ο watcher αγνοεί ό,τι εμφανίζεται στο πρώτο ~1.2s του run (προϋπάρχοντα
    // entities) — περίμενε το timeAlive να το περάσει πριν το QA spawn.
    await page.waitForFunction(() => (window.__g?.timeAlive || 0) > 1.5, null, { timeout: 15000 });
    const st = await page.evaluate(() => {
      const g = window.__g, mm = g.mapManager;
      return { gs: g.gameState, chaos: !!g._chaosMode,
               deck: !!(mm._chaosDeckImg?.complete && mm._chaosDeckImg.naturalWidth > 0) };
    });
    gate('B9 chaos run: playing + deck', st.gs === 'playing' && st.chaos && st.deck, JSON.stringify(st));

    const spawn = await page.evaluate(async (stubSrc) => {
      const g = window.__g, mm = g.mapManager;
      const mk = eval(stubSrc);
      // Το chaos rotation (5s) μπορεί να έχει ήδη δικό του mech ζωντανό — τότε το
      // QA spawn επιστρέφει false και το event έρχεται από το rotation boss.
      let ok = false;
      try { ok = g._spawnStageBoss('mech'); } catch (_) {}
      let evt = null;
      const t0 = Date.now();
      while (!(evt = mm._envBossEvt) && Date.now() - t0 < 12000) await new Promise(r => setTimeout(r, 200));
      if (!evt) return { ok, evt: false, ops: 0 };
      const vs = g._viewScale || 1, vw = 1280 / vs, vh = 720 / vs;
      // κάμερα κεντραρισμένη στο evt ώστε pulse + floor warning να είναι στο view
      const cx = evt.x - vw / 2, cy = evt.y - vh / 2;
      const c = mk(cx, cy);
      mm._drawChaosDistortion(c, 3, cx - 96, cx + vw + 96, cx, cy, vw, vh);
      return { ok, evt: true, ops: c.ops };
    }, STUB_SRC);
    gate('B10 chaos boss event → pulse/floor warning ops > 0', spawn.evt && spawn.ops > 0,
         JSON.stringify(spawn));
    const boostHook = await page.evaluate(() => {
      const src = window.__g.mapManager._drawChaosDistortion.toString();
      return /_envBossWatch/.test(src) && /boost/.test(src);
    });
    gate('B11 boost hook παρών στο chaos distortion', boostHook);
    const { data } = await (await ctx.newCDPSession(page)).send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOTS + '/chaos_boss.png', Buffer.from(data, 'base64'));
    gate('B12c chaos: μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join('|'));
    gate('B12d chaos: μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join('|'));
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
