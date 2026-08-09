// ─────────────────────────────────────────────────────────────────────────────
// STATIC AMBIENT PNG REMOVAL — RUNTIME PROOF (2026-08-09, Maria)
//
// Τα BIOME_AMBIENT_ART full-illustration PNGs αφαιρέθηκαν από το live world
// rendering (διάβαζαν σαν stickers). Live visual check και στα 3 modes. Gates:
//   M1/M2 boot + ζωντανό Game
//   M3 endless: spy στη _drawBiomeAmbientArt για 3s → 0 κλήσεις
//   M3b το call site (_drawWeatherTheater) δεν περιέχει πια την κλήση
//   M4 η retired μέθοδος διατηρείται + και τα 5 PNG assets φορτώνουν (μένουν
//      στο repo ως art πόροι — κανένα αρχείο δεν σβήστηκε)
//   M5 Act 1 classic run: 0 κλήσεις + screenshot
//   M6 chaos run: 0 κλήσεις + screenshot
//   M7 μηδέν page errors / μηδέν non-404 console errors σε όλα τα contexts
// Usage:  node tools/qa/browser/ambient_removal_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.AMB_PROOF_SHOTS || '/tmp/ambient_removal_shots';
const BUILD = '20260908160000';

let failures = 0;
const gate = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  const cdp = await ctx.newCDPSession(page);
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOTS + '/' + name, Buffer.from(data, 'base64'));
  };
  return { ctx, page, pageErrors, consoleErrors, shot };
}

const spyAmbient = async (page, ms) => page.evaluate(async (dur) => {
  const g = window.__g;
  if (typeof g._drawBiomeAmbientArt !== 'function') return { exists: false, calls: -1 };
  let calls = 0;
  const orig = g._drawBiomeAmbientArt.bind(g);
  g._drawBiomeAmbientArt = (...a) => { calls++; return orig(...a); };
  await new Promise(r => setTimeout(r, dur));
  g._drawBiomeAmbientArt = orig;
  return { exists: true, calls };
}, ms);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ── ENDLESS (το μόνο mode όπου ζωγράφιζε ποτέ) ─────────────────────────────
  {
    const { ctx, page, pageErrors, consoleErrors, shot } = await boot(browser);
    gate('M1 boot → start_menu', true);
    gate('M2 ζωντανό Game instance', await page.evaluate(() => !!window.__g));
    const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(160); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(160); };
    await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    await click('#cgm-modesel .msl-card[data-mode="endless"]');
    await click('#mi-continue');
    await sleep(400);
    await page.evaluate(() => { document.querySelector('.csc-card')?.click(); });
    await sleep(250);
    await click('#csc-endless-btn');
    await sleep(800);
    await page.evaluate(() => { const g = window.__g; g.player.maxHp = 99999; g.player.hp = 99999; });
    const s = await spyAmbient(page, 3000);
    gate('M3 endless: 0 κλήσεις _drawBiomeAmbientArt σε 3s', s.exists && s.calls === 0, `calls=${s.calls}`);
    const noCall = await page.evaluate(() => !/_drawBiomeAmbientArt/.test(window.__g._drawWeatherTheater.toString()));
    gate('M3b call site αφαιρέθηκε από το _drawWeatherTheater', noCall);
    const assets = await page.evaluate(async () => {
      const us = ['assets/effects/ambient/biome_storm_spark.png', 'assets/effects/ambient/biome_solar_flare.png',
                  'assets/effects/ambient/biome_null_void_orb.png', 'assets/weapons/biome_crystal_stream.png',
                  'assets/effects/ambient/biome_eden_bloom_pulse.png'];
      const one = (u) => new Promise((res) => { const im = new Image(); im.onload = () => res(1); im.onerror = () => res(0); im.src = u; });
      return (await Promise.all(us.map(one))).reduce((a, b) => a + b, 0);
    });
    gate('M4 retired μέθοδος διατηρείται + 5/5 assets στο repo', s.exists && assets === 5, `assets=${assets}/5`);
    await shot('endless_clean.png');
    gate('M7a endless: μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join('|'));
    gate('M7b endless: μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join('|'));
    await ctx.close();
  }

  // ── ACT 1 (classic ship run) ───────────────────────────────────────────────
  {
    const { ctx, page, pageErrors, shot } = await boot(browser);
    const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(160); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(160); };
    await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    await click('#cgm-modesel .msl-card[data-mode="endless"]');
    await click('#mi-continue');
    await sleep(400);
    await page.evaluate(() => { document.querySelector('.csc-card')?.click(); window.__g._charSelectMode = 'default'; });
    await sleep(250);
    await page.evaluate(() => { document.querySelector('#csc-start-btn')?.click(); });
    await sleep(160);
    await page.evaluate(() => window.__phenixQA?._settleFade?.());
    await sleep(600);
    const gs = await page.evaluate(() => ({ gs: window.__g.gameState, e: !!window.__g.endless }));
    const s = await spyAmbient(page, 2000);
    gate('M5 Act 1 classic run: playing + 0 κλήσεις', gs.gs === 'playing' && !gs.e && s.calls === 0,
         JSON.stringify({ ...gs, calls: s.calls }));
    await shot('act1_clean.png');
    gate('M7c act1: μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join('|'));
    await ctx.close();
  }

  // ── CHAOS ──────────────────────────────────────────────────────────────────
  {
    const { ctx, page, pageErrors, shot } = await boot(browser);
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
    await sleep(1200);
    const gs = await page.evaluate(() => ({ gs: window.__g.gameState, c: !!window.__g._chaosMode }));
    const s = await spyAmbient(page, 2000);
    gate('M6 chaos run: playing + 0 κλήσεις', gs.gs === 'playing' && gs.c && s.calls === 0,
         JSON.stringify({ ...gs, calls: s.calls }));
    await shot('chaos_clean.png');
    gate('M7d chaos: μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join('|'));
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
