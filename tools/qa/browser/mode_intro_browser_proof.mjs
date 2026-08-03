// ─────────────────────────────────────────────────────────────────────────────
// ENDLESS / CHAOS MODE BRIEFING SCREENS — BROWSER PROOF (2026-08-03)
//
// Verifies the premium presentation screens between Mode Select and Character
// Select, in a real Chromium through the REAL DOM overlays:
//   · per-mode visual identity (accent, icon, tagline) and description
//   · OBJECTIVE / DIFFICULTY / REWARDS rows + PERSONAL BEST from the SAME
//     records the game maintains (endlessRecords, chaosRanks)
//   · honest locked/unlocked state from meta.isEndlessUnlocked (display only)
//   · CONTINUE → Character Select (existing entry path) · BACK → Mode Select
//   · keyboard/controller navigation (arrows move focus, ENTER, ESC)
//   · responsive mobile layout
//
// Usage:  node tools/qa/browser/mode_intro_browser_proof.mjs [baseUrl]
//   baseUrl defaults to http://127.0.0.1:8137. Exit 0 = all gates green.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8137';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.MI_PROOF_SHOTS || '/tmp/mode_intro_proof_shots';
const BUILD = '20260903060000';

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

async function clickAndSettle(page, selector, opts = {}) {
  await page.click(selector, { timeout: 5000, ...opts });
  await sleep(120);
  await settle(page);
  await sleep(120);
}

// Real taps span >= 1 game frame (controller padTap releases NEXT frame).
async function tap(page, k) {
  await page.keyboard.down(k); await sleep(120);
  await page.keyboard.up(k);   await sleep(140);
  await settle(page);          await sleep(120);
}

async function bootPage(browser, { seedMeta = null, viewport = { width: 1280, height: 720 } } = {}) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(({ seed }) => {
    try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
    if (seed) { try { localStorage.setItem('phenix_meta', JSON.stringify(seed)); } catch (_) {} }
  }, { seed: seedMeta });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
  await sleep(250);
  // Live instance handle (one-shot prototype hook, same module) — used ONLY to
  // render the briefing's defensive locked state; navigation stays click-driven.
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
  return { ctx, page, pageErrors, shot };
}

const briefInfo = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const stage = q('#cgm-modeintro .mi-stage');
  return {
    name: q('#cgm-modeintro .mi-name')?.textContent || '',
    tagline: q('#cgm-modeintro .mi-tagline')?.textContent || '',
    desc: (q('#cgm-modeintro .mi-desc')?.textContent || '').length,
    accGreen: !!stage?.classList.contains('acc-green'),
    accPink: !!stage?.classList.contains('acc-pink'),
    stateTxt: q('#cgm-modeintro .mi-state')?.textContent || '',
    rows: Array.from(document.querySelectorAll('#cgm-modeintro .mi-row-label')).map(r => r.textContent),
    pipsOn: document.querySelectorAll('#cgm-modeintro .mi-pip.on').length,
    best: Array.from(document.querySelectorAll('#cgm-modeintro .mi-best-row')).map(r => ({
      k: r.querySelector('.mi-best-k')?.textContent, v: r.querySelector('.mi-best-v')?.textContent,
    })),
    bestEmpty: !!q('#cgm-modeintro .mi-best-empty'),
    contDisabled: !!q('#mi-continue')?.disabled,
    reqShown: q('#cgm-modeintro .mi-req')?.textContent || null,
  };
});

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ══ PHASE A — fresh save: locked behavior + defensive locked rendering ═══════
  {
    const { ctx, page, pageErrors, shot } = await bootPage(browser);
    await clickAndSettle(page, '#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    gate('A1 START GAME → mode_select', (await state(page)) === 'mode_select');

    // Locked cards stay inert on Mode Select — behavior unchanged by this feature.
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="endless"]', { force: true });
    gate('A2 locked ENDLESS card never navigates', (await state(page)) === 'mode_select');

    // Defensive: if the briefing is ever shown while locked, it must say so honestly.
    await page.evaluate(() => window.__g.goToModeIntro('endless'));
    await sleep(300); await settle(page); await sleep(150);
    const locked = await briefInfo(page);
    gate('A3 locked briefing: LOCKED badge + requirement + disabled CONTINUE',
      locked.stateTxt.includes('LOCKED') && locked.contDisabled && /CLEAR ACT 1/.test(locked.reqShown || ''),
      JSON.stringify({ state: locked.stateTxt, req: locked.reqShown, dis: locked.contDisabled }));
    gate('A4 locked briefing: fresh save shows NO RUNS yet', locked.bestEmpty === true);
    await shot('mi_A_endless_locked.png');
    await clickAndSettle(page, '#mi-back');
    gate('A5 BACK → mode_select', (await state(page)) === 'mode_select');
    gate('A6 zero uncaught page errors (phase A)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ══ PHASE B — seeded save: identity, records, flow, keyboard ═════════════════
  {
    const seed = {
      endlessUnlocked: true, stagesCleared: 6,
      endlessRecords: { time: 1234, score: 152300, level: 41 },
      chaosRanks: { taekwondo_girl: { bestSecs: 754, bestRank: 'SILVER' } },
    };
    const { ctx, page, pageErrors, shot } = await bootPage(browser, { seedMeta: seed });
    await clickAndSettle(page, '#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');

    // ENDLESS briefing
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="endless"]');
    gate('B1 ENDLESS card → mode_intro', (await state(page)) === 'mode_intro');
    const e = await briefInfo(page);
    gate('B2 endless identity: name/tagline/desc + green accent',
      e.name === 'ENDLESS MODE' && e.tagline.length > 5 && e.desc > 60 && e.accGreen && !e.accPink,
      JSON.stringify({ name: e.name, accGreen: e.accGreen }));
    gate('B3 OBJECTIVE / DIFFICULTY / REWARDS rows present',
      JSON.stringify(e.rows) === JSON.stringify(['OBJECTIVE', 'DIFFICULTY', 'REWARDS']), JSON.stringify(e.rows));
    gate('B4 endless difficulty: SCALING 3/5 pips', e.pipsOn === 3, String(e.pipsOn));
    gate('B5 endless PERSONAL BEST matches endlessRecords (20:34 / 152,300 / LV 41)',
      JSON.stringify(e.best) === JSON.stringify([
        { k: 'BEST SURVIVAL', v: '20:34' }, { k: 'BEST SCORE', v: '152,300' }, { k: 'BEST LEVEL', v: 'LV 41' },
      ]), JSON.stringify(e.best));
    gate('B6 endless UNLOCKED: badge + enabled CONTINUE', e.stateTxt.includes('UNLOCKED') && !e.contDisabled && !e.reqShown);
    await shot('mi_B_endless_seeded.png');

    await clickAndSettle(page, '#mi-continue');
    gate('B7 CONTINUE → character_select (endless entry)', (await state(page)) === 'character_select');
    const btnsE = await page.evaluate(() => ({
      start:   getComputedStyle(document.querySelector('#csc-start-btn')).display,
      endless: getComputedStyle(document.querySelector('#csc-endless-btn')).display,
      chaos:   getComputedStyle(document.querySelector('#csc-chaos-btn')).display,
    }));
    gate('B8 char select is endless-scoped (ONLY START ENDLESS)',
      btnsE.start === 'none' && btnsE.endless !== 'none' && btnsE.chaos === 'none', JSON.stringify(btnsE));
    await clickAndSettle(page, '#csc-back-btn');
    gate('B9 char select BACK → mode_select (unchanged contract)', (await state(page)) === 'mode_select');

    // CHAOS briefing
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="chaos"]');
    gate('B10 CHAOS card → mode_intro', (await state(page)) === 'mode_intro');
    const c = await briefInfo(page);
    gate('B11 chaos identity: name + pink accent + EXTREME 5/5 pips',
      c.name === 'CHAOS MODE' && c.accPink && !c.accGreen && c.pipsOn === 5,
      JSON.stringify({ name: c.name, accPink: c.accPink, pips: c.pipsOn }));
    gate('B12 chaos PERSONAL BEST from chaosRanks (12:34 SILVER Taekwondo)',
      JSON.stringify(c.best) === JSON.stringify([
        { k: 'BEST SURVIVAL', v: '12:34' }, { k: 'BEST RANK', v: 'SILVER' }, { k: 'PILOT', v: 'Neon Taekwondo Girl' },
      ]), JSON.stringify(c.best));
    await shot('mi_B_chaos_seeded.png');

    // Keyboard / controller path (synthetic Arrow keydowns = D-pad)
    await tap(page, 'Escape');
    gate('B13 ESC / B → mode_select', (await state(page)) === 'mode_select');
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="chaos"]');
    await tap(page, 'ArrowLeft');
    const focusBack = await page.evaluate(() =>
      document.querySelector('#mi-back')?.classList.contains('focus') === true &&
      document.querySelector('#mi-continue')?.classList.contains('focus') === false);
    gate('B14 ArrowLeft / D-pad moves focus to BACK', focusBack);
    await tap(page, 'Enter');
    gate('B15 ENTER on focused BACK → mode_select', (await state(page)) === 'mode_select');
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="chaos"]');
    await tap(page, 'ArrowRight');   // focus CONTINUE (also the default)
    await tap(page, 'Enter');
    gate('B16 ENTER on focused CONTINUE → character_select', (await state(page)) === 'character_select');

    gate('B17 zero uncaught page errors (phase B)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ══ PHASE C — mobile viewport ════════════════════════════════════════════════
  {
    const seed = { endlessUnlocked: true, stagesCleared: 6 };
    const { ctx, page, pageErrors, shot } = await bootPage(browser, { seedMeta: seed, viewport: { width: 420, height: 800 } });
    await clickAndSettle(page, '#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="endless"]');
    gate('C1 mobile: briefing opens', (await state(page)) === 'mode_intro');
    const mob = await page.evaluate(() => {
      const stage = document.querySelector('#cgm-modeintro .mi-stage');
      const cols = document.querySelector('#cgm-modeintro .mi-cols');
      const cont = document.querySelector('#mi-continue');
      const r = stage.getBoundingClientRect();
      return {
        fits: r.width <= window.innerWidth + 1,
        stacked: getComputedStyle(cols).flexDirection === 'column',
        btnH: cont.getBoundingClientRect().height,
      };
    });
    gate('C2 mobile: panel fits, columns stacked, tap-sized CONTINUE (>=44px)',
      mob.fits && mob.stacked && mob.btnH >= 44, JSON.stringify(mob));
    await shot('mi_C_mobile.png');
    gate('C3 zero uncaught page errors (phase C)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} gates green`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
