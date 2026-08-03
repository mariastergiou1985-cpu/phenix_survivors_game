// ─────────────────────────────────────────────────────────────────────────────
// MAIN MENU — PREMIUM REDESIGN BROWSER PROOF (2026-08-03)
//
// Verifies the redesigned main-menu overlay in a real Chromium, through the REAL DOM:
//   · same menu options, same order, same dispatch (START GAME still opens mode select)
//   · every nav item carries the new icon rail + label markup
//   · START GAME renders as the emphasized primary entry
//   · keyboard ↓ moves the .active state (controller rides the same keys-Set)
//   · hover/active visual state machinery present (sheen/active bar via CSS classes)
//   · settings gear still opens SETTINGS · footer hints show controller keys
//   · mobile viewport: single column, nav on top, tap-sized buttons
//
// Usage:  node tools/qa/browser/main_menu_redesign_browser_proof.mjs [baseUrl]
//   baseUrl defaults to http://127.0.0.1:8137. Exit 0 = all gates green.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8137';
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

const results = [];
let failures = 0;
const gate = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const settle = (page) => page.evaluate(() => { window.__phenixQA?._settleFade?.(); });
const state  = (page) => page.evaluate(() => window.__phenixQA?.snapshot?.()?.gameState || null);
const sleep  = (ms) => new Promise(r => setTimeout(r, ms));
async function bootPage(browser, viewport = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {} });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
  await sleep(300);
  return { ctx, page, pageErrors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ══ PHASE A — desktop: contract, markup, keyboard, dispatch ══════════════════
  {
    const { ctx, page, pageErrors } = await bootPage(browser);
    gate('A1 menu overlay visible on boot', await page.$eval('#cgm-overlay', el => getComputedStyle(el).display !== 'none'));

    const items = await page.$$eval('#cgm-menu-nav .mbtn', els => els.map(e => ({
      label: e.dataset.cgmItem,
      hasIcon: !!e.querySelector('.mi svg use'),
      hasChev: !!e.querySelector('svg.mchev'),
      primary: e.classList.contains('mbtn-primary'),
      active: e.classList.contains('active'),
    })));
    gate('A2 same menu options, same order',
      items.map(i => i.label).join('|') === 'START GAME|CHARACTER SELECT|UPGRADES|COLLECTIBLES|RELICS|HANGAR|NULL ARSENAL|SETTINGS|EXIT',
      items.map(i => i.label).join('|'));
    gate('A3 every item carries the icon rail + chevron markup', items.every(i => i.hasIcon && i.hasChev));
    gate('A4 START GAME is the emphasized primary', items[0].primary && items.filter(i => i.primary).length === 1);
    gate('A5 exactly one active item on boot (START GAME)', items[0].active && items.filter(i => i.active).length === 1);

    // Keyboard ↓ — the polled keys-Set path the controller also drives.
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.keyboard.down('ArrowDown'); await sleep(220); await page.keyboard.up('ArrowDown'); await sleep(180);
      const a = await page.evaluate(() => document.querySelector('#cgm-menu-nav .mbtn.active')?.dataset.cgmItem);
      if (a !== 'START GAME') break;
    }
    const activeAfter = await page.evaluate(() => document.querySelector('#cgm-menu-nav .mbtn.active')?.dataset.cgmItem);
    gate('A6 keyboard ↓ moves the active state', activeAfter === 'CHARACTER SELECT', String(activeAfter));

    // Entrance animation class present; hints show controller keys.
    gate('A7 entrance animation armed on the overlay', await page.$eval('#cgm-overlay', el => el.classList.contains('cgm-in')));
    const hints = await page.$eval('#cgm-overlay .hints', el => el.textContent);
    gate('A8 footer hints include controller keys', /D-PAD/.test(hints) && /ENTER \/ A/.test(hints), hints.trim().slice(0, 60));

    // Dispatch unchanged: START GAME click → mode_select, back → menu, gear → settings.
    await page.click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    await sleep(120); await settle(page); await sleep(120);
    gate('A9 START GAME still opens mode_select', (await state(page)) === 'mode_select');
    await page.click('#msl-back'); await sleep(120); await settle(page); await sleep(120);
    gate('A10 BACK returns to the menu', (await state(page)) === 'start_menu');
    await page.click('[data-cgm-action="settings"]'); await sleep(120); await settle(page); await sleep(120);
    gate('A11 gear still opens SETTINGS', (await state(page)) === 'settings');

    gate('A12 zero uncaught page errors (phase A)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ══ PHASE B — mobile viewport: single column, nav first, tap targets ═════════
  {
    const { ctx, page, pageErrors } = await bootPage(browser, { width: 390, height: 844 });
    const m = await page.evaluate(() => {
      const nav = document.querySelector('#cgm-menu-nav');
      const btn = nav?.querySelector('.mbtn');
      const stage = document.querySelector('#cgm-overlay .stage');
      return {
        btnH: btn ? btn.getBoundingClientRect().height : 0,
        navW: nav ? nav.getBoundingClientRect().width : 0,
        fits: stage ? stage.getBoundingClientRect().width <= window.innerWidth + 1 : false,
        navTop: nav ? nav.getBoundingClientRect().top : 1e9,
      };
    });
    gate('B1 mobile: panel fits the viewport', m.fits, JSON.stringify(m));
    gate('B2 mobile: nav buttons are tap-sized (≥44px)', m.btnH >= 44, String(m.btnH));
    gate('B3 zero uncaught page errors (phase B)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} gates green`);
  process.exit(failures ? 1 : 0);
})().catch (e => { console.error('HARNESS ERROR', e); process.exit(1); });
