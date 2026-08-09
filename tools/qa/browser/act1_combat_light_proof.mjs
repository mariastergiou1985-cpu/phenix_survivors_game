// ─────────────────────────────────────────────────────────────────────────────
// ACT 1 COMBAT LIGHTING REACTIONS — RUNTIME PROOF (2026-08-09, Maria)
//
// Πραγματικό classic Act 1 ship run μέσω production flow. Gates:
//   C1 boot → start_menu, 0 page errors
//   C2 ζωντανό Game instance
//   C3 classic Act 1: playing, ΟΧΙ endless, ΟΧΙ campaign stage, ship map ενεργό
//   C4 _drawShipCombatLight υπάρχει και καλείται κάθε frame (draw-spy)
//   C5 explosion event: spawnExplosion → 'boom' στο _cmbQ (observer wrap ζωντανό)
//   C6 ultimate event: πτώση mana ≥60 σε ένα frame → 'ult' στο _cmbQ
//   C7 heavy impact: screenShake rising edge → 'impact' στο _cmbQ
//   C8 boss spawn (πραγματικό _spawnStageBoss('mech')) → flicker window + warning pulse
//   C9 bounded: queue ≤ 24 μετά από burst 12 explosions
//   C10 μηδέν page errors / μηδέν non-404 console errors συνολικά
// Usage:  node tools/qa/browser/act1_combat_light_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.CMB_PROOF_SHOTS || '/tmp/act1_cmb_shots';
const BUILD = '20260908100000';

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
  gate('C1 boot → start_menu', true);
  gate('C1b μηδέν page errors στο boot', pageErrors.length === 0, pageErrors.join(' | '));

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
  gate('C2 ζωντανό Game instance', await page.evaluate(() => !!window.__g));

  // C3: production flow → char select → classic Act 1 (default mode) → ship run
  const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(160); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(160); };
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await click('#cgm-modesel .msl-card[data-mode="endless"]');
  await click('#mi-continue');
  await sleep(400);
  await page.evaluate(() => { document.querySelector('.csc-card')?.click(); window.__g._charSelectMode = 'default'; });
  await sleep(250);
  // QA-local: ίδιο production path (_charSelectConfirm→selectCharacter) — το κουμπί
  // είναι CSS-hidden στο endless χρώμα του screen, οπότε JS click (όπως στο ambience proof).
  await page.evaluate(() => { document.querySelector('#csc-start-btn')?.click(); });
  await sleep(160);
  await page.evaluate(() => window.__phenixQA?._settleFade?.());
  await sleep(600);
  const st = await page.evaluate(() => {
    const g = window.__g;
    return { gs: g.gameState, endless: !!g.endless, camp: !!g._campaignStage,
             ship: !!(g.mapManager?._shipImg?.complete && g.mapManager._shipImg.naturalWidth > 0) };
  });
  gate('C3 classic Act 1: playing', st.gs === 'playing', String(st.gs));
  gate('C3b ΟΧΙ endless / ΟΧΙ campaign stage', !st.endless && !st.camp, JSON.stringify(st));
  gate('C3c ship map ενεργό', st.ship);

  // C4: combat-light υπάρχει + καλείται κάθε frame
  const spy = await page.evaluate(async () => {
    const mm = window.__g.mapManager;
    if (typeof mm._drawShipCombatLight !== 'function') return { exists: false, calls: 0 };
    let calls = 0;
    const orig = mm._drawShipCombatLight.bind(mm);
    mm._drawShipCombatLight = (...a) => { calls++; return orig(...a); };
    await new Promise(r => setTimeout(r, 2000));
    mm._drawShipCombatLight = orig;
    return { exists: true, calls };
  });
  gate('C4 _drawShipCombatLight υπάρχει', spy.exists);
  gate('C4b καλείται κάθε frame', spy.calls > 30, `${spy.calls} calls / 2s`);

  // C5: explosion → 'boom' event + observer wrap ζωντανό
  const boom = await page.evaluate(async () => {
    const g = window.__g, mm = g.mapManager;
    const q = g.player.pos.clone(); q.x += 80;
    g.particles.spawnExplosion(q, ['#ff6600', '#ffaa22', '#ffffff'], 24);
    await new Promise(r => setTimeout(r, 120));
    return { wrapped: mm._cmbWrapT === g.particles,
             boom: (mm._cmbQ || []).some(e => e.kind === 'boom') };
  });
  gate('C5 observer wrap εγκατεστημένο', boom.wrapped);
  gate('C5b explosion → boom event', boom.boom);
  await shot('boom.png');

  // C6: ultimate → πτώση mana ≥60
  const ult = await page.evaluate(async () => {
    const g = window.__g, mm = g.mapManager;
    g.player.mana = 100;
    await new Promise(r => setTimeout(r, 150));      // να καταγραφεί το 100 ως prev
    g.player.mana = 0;
    await new Promise(r => setTimeout(r, 200));
    return (mm._cmbQ || []).some(e => e.kind === 'ult');
  });
  gate('C6 ultimate → ult pulse event', ult);
  await shot('ult.png');

  // C7: heavy impact → shake rising edge
  const imp = await page.evaluate(async () => {
    const g = window.__g, mm = g.mapManager;
    await new Promise(r => setTimeout(r, 700));      // άφησε το shake να ηρεμήσει < 5
    g.screenShake.trigger(8, 0.4);
    await new Promise(r => setTimeout(r, 200));
    return (mm._cmbQ || []).some(e => e.kind === 'impact');
  });
  gate('C7 heavy impact → impact glow event', imp);

  // C8: boss spawn μέσω ΠΡΑΓΜΑΤΙΚΟΥ spawner → flicker + warning
  const boss = await page.evaluate(async () => {
    const g = window.__g, mm = g.mapManager;
    const ok = g._spawnStageBoss('mech');
    await new Promise(r => setTimeout(r, 400));
    return { ok, flicker: (mm._cmbFlickerUntil || -1) > (g.timeAlive || 0), warn: !!mm._cmbWarn };
  });
  gate('C8 _spawnStageBoss("mech") επέστρεψε true', boss.ok);
  gate('C8b flicker window ενεργό', boss.flicker);
  gate('C8c warning pulse ενεργό', boss.warn);
  await shot('boss_flicker.png');

  // C9: bounded queue μετά από burst
  const bounded = await page.evaluate(async () => {
    const g = window.__g, mm = g.mapManager;
    for (let i = 0; i < 12; i++) {
      const q = g.player.pos.clone(); q.x += (i - 6) * 40;
      g.particles.spawnExplosion(q, ['#ff6600'], 20);
    }
    await new Promise(r => setTimeout(r, 100));
    return (mm._cmbQ || []).length;
  });
  gate('C9 queue bounded ≤ 24', bounded <= 24, `len=${bounded}`);

  await sleep(1200);
  gate('C10 μηδέν page errors συνολικά', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  gate('C10b μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
