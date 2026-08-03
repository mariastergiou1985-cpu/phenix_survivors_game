// ─────────────────────────────────────────────────────────────────────────────
// START GAME FLOW — BROWSER PROOF (2026-08-03)
//
// Verifies the reworked entry flow end-to-end in a real Chromium, through the REAL
// DOM overlays (no synthetic game calls for navigation — every step is a click the
// player could make):
//
//   Main Menu → START GAME → MODE SELECT (Campaign / Endless / Chaos)
//     CAMPAIGN → ACT SELECT (Act 1) → stage map → Character Select
//     ENDLESS / CHAOS → Character Select (mode-scoped action buttons)
//   plus every BACK edge and the lock gates on a fresh save.
//
// Phase A runs on a FRESH save (Endless + Chaos locked). Phase B pre-seeds
// localStorage.phenix_meta with endlessUnlocked:true + full campaign clear and
// verifies the unlocked routes. The QA bridge (?qa=1 + sessionStorage opt-in) is
// used ONLY to read gameState snapshots and settle fades — never to navigate.
//
// Usage:  node tools/qa/browser/start_flow_browser_proof.mjs [baseUrl]
//   baseUrl defaults to http://127.0.0.1:8137 (a static server of the repo root).
// Exit 0 = all gates green. Any hard failure exits 1 with the failed gate named.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8137';
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

const results = [];
let failures = 0;
const gate = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const settle = (page) => page.evaluate(() => { window.__phenixQA?._settleFade?.(); });
const state  = (page) => page.evaluate(() => window.__phenixQA?.snapshot?.()?.gameState || null);
const sleep  = (ms) => new Promise(r => setTimeout(r, ms));

// A click through the real DOM, then settle the transition fade and give the loop a frame.
async function clickAndSettle(page, selector, opts = {}) {
  // force:true is needed for locked cards — aria-disabled makes Playwright refuse the
  // click, but the game-side inert-handling is exactly what those gates verify.
  await page.click(selector, { timeout: 5000, ...opts });
  await sleep(120);
  await settle(page);
  await sleep(120);
}

async function bootPage(browser, { seedMeta = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(({ seed }) => {
    try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
    if (seed) { try { localStorage.setItem('phenix_meta', JSON.stringify(seed)); } catch (_) {} }
  }, { seed: seedMeta });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  // Recipe: domcontentloaded only — networkidle never settles under a service worker,
  // and page.screenshot is avoided entirely (font fetches can hang headless).
  await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
  await sleep(250);
  return { ctx, page, pageErrors };
}

const menuLabels = (page) => page.$$eval('#cgm-menu-nav .mbtn', els => els.map(e => e.dataset.cgmItem));

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ══ PHASE A — fresh save: locks + full campaign path + every BACK edge ═══════
  {
    const { ctx, page, pageErrors } = await bootPage(browser);

    const labels = await menuLabels(page);
    gate('A1 menu has START GAME', labels.includes('START GAME'), labels.join(','));
    gate('A2 menu has NO CAMPAIGN entry', !labels.includes('CAMPAIGN'));
    gate('A3 menu has NO SELECT STAGE entry', !labels.includes('SELECT STAGE'));

    await clickAndSettle(page, '#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    gate('A4 START GAME → mode_select', (await state(page)) === 'mode_select');
    gate('A5 mode overlay visible', await page.$eval('#cgm-modesel', el => getComputedStyle(el).display !== 'none'));
    const cardInfo = await page.$$eval('#cgm-modesel .msl-card', els =>
      els.map(e => ({ mode: e.dataset.mode, locked: e.classList.contains('locked') })));
    gate('A6 three mode cards', cardInfo.length === 3, JSON.stringify(cardInfo));
    gate('A7 campaign unlocked on fresh save', cardInfo.find(c => c.mode === 'campaign')?.locked === false);
    gate('A8 endless LOCKED on fresh save', cardInfo.find(c => c.mode === 'endless')?.locked === true);
    gate('A9 chaos LOCKED on fresh save', cardInfo.find(c => c.mode === 'chaos')?.locked === true);

    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="endless"]', { force: true });
    gate('A10 locked endless card is inert', (await state(page)) === 'mode_select');

    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="campaign"]');
    gate('A11 CAMPAIGN → act_select', (await state(page)) === 'act_select');
    const acts = await page.$$eval('#cgm-actsel .asl-card', els => els.map(e => e.dataset.act));
    gate('A12 exactly ACT 1 offered', acts.length === 1 && acts[0] === '1', acts.join(','));
    const prog = await page.$eval('#cgm-actsel .asl-prog', el => el.textContent.trim()).catch(() => null);
    gate('A13 act progress chip present', !!prog, String(prog));

    await clickAndSettle(page, '#cgm-actsel .asl-card[data-act="1"]');
    gate('A14 ACT 1 → campaign stage map', (await state(page)) === 'campaign_select');
    const nStages = await page.$$eval('#cgm-campaign .cmp-card', els => els.length);
    gate('A15 stage map shows all 7 stages', nStages === 7, String(nStages));

    await clickAndSettle(page, '#cmp-back');
    gate('A16 stage map BACK → act_select', (await state(page)) === 'act_select');
    await clickAndSettle(page, '#asl-back');
    gate('A17 act select BACK → mode_select', (await state(page)) === 'mode_select');
    await clickAndSettle(page, '#msl-back');
    gate('A18 mode select BACK → main menu', (await state(page)) === 'start_menu');

    // Down into character select through the campaign path, then BACK must return
    // to the STAGE MAP (not the main menu) — the new return-routing contract.
    await clickAndSettle(page, '#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="campaign"]');
    await clickAndSettle(page, '#cgm-actsel .asl-card[data-act="1"]');
    await clickAndSettle(page, '#cgm-campaign .cmp-card[data-idx="0"]');
    gate('A19 stage 1 → character_select', (await state(page)) === 'character_select');
    const btnsA = await page.evaluate(() => ({
      start:   getComputedStyle(document.querySelector('#csc-start-btn')).display,
      endless: getComputedStyle(document.querySelector('#csc-endless-btn')).display,
      chaos:   getComputedStyle(document.querySelector('#csc-chaos-btn')).display,
    }));
    gate('A20 campaign entry keeps all three action buttons', btnsA.start !== 'none' && btnsA.endless !== 'none' && btnsA.chaos !== 'none', JSON.stringify(btnsA));
    await clickAndSettle(page, '#csc-back-btn');
    gate('A21 char select BACK → stage map', (await state(page)) === 'campaign_select');

    // ESC edge on the keyboard path: campaign map → act select. Hold the key across
    // several frames — the keys-Set path is polled by update(), so a tap can slip
    // between two frames and read as never-pressed.
    await page.keyboard.down('Escape');
    await sleep(150);
    await page.keyboard.up('Escape');
    await sleep(150); await settle(page); await sleep(120);
    gate('A22 ESC on stage map → act_select', (await state(page)) === 'act_select');

    gate('A23 zero uncaught page errors (phase A)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ══ PHASE B — unlocked save: endless/chaos routes + mode-scoped buttons ══════
  {
    const seed = { endlessUnlocked: true, stagesCleared: 6 };
    const { ctx, page, pageErrors } = await bootPage(browser, { seedMeta: seed });

    await clickAndSettle(page, '#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    const cardInfo = await page.$$eval('#cgm-modesel .msl-card', els =>
      els.map(e => ({ mode: e.dataset.mode, locked: e.classList.contains('locked') })));
    gate('B1 endless UNLOCKED with seeded save', cardInfo.find(c => c.mode === 'endless')?.locked === false);
    gate('B2 chaos UNLOCKED with seeded save', cardInfo.find(c => c.mode === 'chaos')?.locked === false);

    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="endless"]');
    gate('B3 ENDLESS → character_select', (await state(page)) === 'character_select');
    const btnsE = await page.evaluate(() => ({
      start:   getComputedStyle(document.querySelector('#csc-start-btn')).display,
      endless: getComputedStyle(document.querySelector('#csc-endless-btn')).display,
      chaos:   getComputedStyle(document.querySelector('#csc-chaos-btn')).display,
    }));
    gate('B4 endless entry shows ONLY START ENDLESS', btnsE.start === 'none' && btnsE.endless !== 'none' && btnsE.chaos === 'none', JSON.stringify(btnsE));
    await clickAndSettle(page, '#csc-back-btn');
    gate('B5 char select BACK → mode_select', (await state(page)) === 'mode_select');

    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="chaos"]');
    gate('B6 CHAOS → character_select', (await state(page)) === 'character_select');
    const btnsC = await page.evaluate(() => ({
      start:   getComputedStyle(document.querySelector('#csc-start-btn')).display,
      endless: getComputedStyle(document.querySelector('#csc-endless-btn')).display,
      chaos:   getComputedStyle(document.querySelector('#csc-chaos-btn')).display,
    }));
    gate('B7 chaos entry shows ONLY START CHAOS', btnsC.start === 'none' && btnsC.endless === 'none' && btnsC.chaos !== 'none', JSON.stringify(btnsC));

    gate('B8 zero uncaught page errors (phase B)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    // Informational only (needs full assets to be meaningful): confirm START ENDLESS
    // actually leaves the menus. Not a gate in asset-less harnesses.
    await clickAndSettle(page, '#csc-back-btn');                            // chaos entry → back
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="endless"]');
    await clickAndSettle(page, '#csc-endless-btn');
    const st = await state(page);
    console.log(`INFO  START ENDLESS click → gameState=${st}  (informational; run-start is covered by device regressions)`);

    await ctx.close();
  }

  await browser.close();
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} gates green`);
  process.exit(failures ? 1 : 0);
})().catch (e => { console.error('HARNESS ERROR', e); process.exit(1); });
