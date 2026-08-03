// ─────────────────────────────────────────────────────────────────────────────
// NEXUS CHAKRAM + STORM CONDUCTOR — STRICT VISUAL REPLACEMENT PROOF (2026-08-03)
//
// Boots a REAL Endless run through the production flow (menu → mode select →
// briefing → character select → START ENDLESS), grants the two weapons at
// catalog levels through the existing acquired-weapon path, and verifies:
//   · both weapons FIRE and spawn the new WeaponStrikeFx2 visuals
//   · the old oversized illustration path is NOT used for these two ids
//   · the new FX footprint stays bounded (no screen-covering surfaces)
//   · damage numbers / player / enemies keep rendering (canvas stays busy)
//   · zero page errors, zero non-404 console errors
// Screenshots are captured mid-attack for the readability review.
//
// Usage:  node tools/qa/browser/weapon_vfx2_browser_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8137';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.WFX_PROOF_SHOTS || '/tmp/wfx2_shots';
const BUILD = '20260903070000';

const results = [];
let failures = 0;
const gate = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
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
    try {
      localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 6 }));
    } catch (_) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return;   // missing non-staged art in the harness
    consoleErrors.push(t);
  });
  const cdp = await ctx.newCDPSession(page);
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOTS + '/' + name, Buffer.from(data, 'base64'));
  };

  await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
  await sleep(300);
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

  // Enter a REAL Endless run through the production flow.
  const click = async (sel) => { await page.click(sel, { timeout: 6000 }); await sleep(140); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(140); };
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await click('#cgm-modesel .msl-card[data-mode="endless"]');
  await click('#mi-continue');
  await click('#csc-endless-btn');
  const gs = await page.evaluate(() => window.__phenixQA?.snapshot?.()?.gameState);
  gate('A1 real START ENDLESS reaches gameState=playing', gs === 'playing', String(gs));

  // Grant the two weapons through the EXISTING acquired-weapon container the
  // auto-fire loop already reads (visual proof only — QA-local browser state).
  await page.evaluate(() => {
    const g = window.__g;
    g._weaponLevels.set('nexus_chakram', 3);
    g._weaponLevels.set('storm_conductor', 5);
    g.player.maxHp = 99999; g.player.hp = 99999;   // survive the photo session
  });
  await sleep(600);

  // Let the run breathe, then sample while the weapons fire.
  let sawCrescent = false, sawBolt = false, sawOldArt = false, maxActive = 0;
  let shotsTaken = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(320);
    const s = await page.evaluate(() => {
      const g = window.__g;
      const fx = g._activeWeaponVFX || [];
      return {
        crescent: fx.some(v => v && v.kind === 'crescent'),
        bolt: fx.some(v => v && v.kind === 'bolt'),
        oldArt: fx.some(v => v && v.overrideImg && /nexus_chakram|storm_conductor/.test(v.overrideImg.src || '')),
        n: fx.length,
        enemies: (g.enemies || []).length,
        t: g.timeAlive,
      };
    });
    maxActive = Math.max(maxActive, s.n);
    if (s.oldArt) sawOldArt = true;
    if (s.crescent) { sawCrescent = true; if (shotsTaken < 2) { await shot(`wfx_crescent_${shotsTaken}.png`); shotsTaken++; } }
    if (s.bolt) { sawBolt = true; if (shotsTaken < 4) { await shot(`wfx_bolt_${shotsTaken}.png`); shotsTaken++; } }
    if (sawCrescent && sawBolt && shotsTaken >= 4) break;
  }
  gate('B1 new crescent FX spawns for nexus_chakram', sawCrescent);
  gate('B2 new branched-lightning FX spawns for storm_conductor', sawBolt);
  gate('B3 the old oversized illustration path is NEVER used for the two ids', !sawOldArt);
  gate('B4 active FX stays hard-capped (<=24)', maxActive <= 24, String(maxActive));
  await shot('wfx_wide.png');

  // Readability probe: the world around the strike point keeps visible variety
  // (a screen-covering sheet would flatten a big sample area to near-uniform).
  const spread = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const d = g.getImageData(c.width / 2 - 200, c.height / 2 - 150, 400, 300).data;
    let lum = [], step = 4 * 24;
    for (let i = 0; i < d.length; i += step) lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const varc = lum.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lum.length;
    return { mean: Math.round(mean), sd: Math.round(Math.sqrt(varc)) };
  });
  gate('B5 scene keeps contrast under fire (no white-out: mean<170, sd>12)',
    spread.mean < 170 && spread.sd > 12, JSON.stringify(spread));

  gate('C1 zero page errors for the whole run', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  gate('C2 zero non-404 console errors for the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await ctx.close();
  await browser.close();
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} gates green`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
