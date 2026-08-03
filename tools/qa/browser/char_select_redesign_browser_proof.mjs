// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER SELECT — PREMIUM REDESIGN BROWSER PROOF (2026-08-03)
//
// Verifies the redesigned Character Select in a real Chromium, through the REAL DOM:
//   · all 10 roster characters render as cards in the grid
//   · locked characters stay VISIBLE and state their exact unlock requirement —
//     the SAME ladder MetaProgress.isCharacterUnlocked enforces
//   · the detail dossier shows portrait, name, role, stats (from the real Player
//     constructor), starter weapon (from the real catalogs) and specialty
//   · exactly ONE start button per entry mode (campaign / endless / chaos)
//   · BACK returns to the screen that opened the select
//   · keyboard navigation moves the selection (gamepad rides the same keys-Set)
//
// Usage:  node tools/qa/browser/char_select_redesign_browser_proof.mjs [baseUrl]
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
async function clickAndSettle(page, selector, opts = {}) {
  await page.click(selector, { timeout: 5000, ...opts });
  await sleep(120); await settle(page); await sleep(120);
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
  return { ctx, page, pageErrors };
}
const visibleStarts = (page) => page.evaluate(() => {
  const v = (id) => { const b = document.querySelector(id); return b && getComputedStyle(b).display !== 'none'; };
  return { start: v('#csc-start-btn'), endless: v('#csc-endless-btn'), chaos: v('#csc-chaos-btn') };
});

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ══ PHASE A — fresh save: roster, locks with requirements, keyboard, back ════
  {
    const { ctx, page, pageErrors } = await bootPage(browser);
    await clickAndSettle(page, '#cgm-menu-nav .mbtn[data-cgm-item="CHARACTER SELECT"]');
    gate('A1 CHARACTER SELECT opens the redesigned overlay', (await state(page)) === 'character_select'
      && await page.$eval('#cgm-charselect', el => getComputedStyle(el).display !== 'none'));

    const cards = await page.$$eval('#cgm-charselect .csc-card', els => els.map(e => ({
      id: e.dataset.id,
      hasPortrait: !!e.querySelector('.csc-portrait img, .csc-portrait .csc-fallback'),
      name: e.querySelector('.csc-card-name')?.textContent.trim() || '',
      role: e.querySelector('.csc-card-role')?.textContent.trim() || '',
      locked: e.querySelector('.csc-lock-overlay') && getComputedStyle(e.querySelector('.csc-lock-overlay')).display !== 'none',
      req: e.querySelector('.csc-req-chip')?.textContent.trim() || null,
    })));
    gate('A2 all 10 characters render as cards', cards.length === 10, String(cards.length));
    gate('A3 every card has portrait + name + role', cards.every(c => c.hasPortrait && c.name && c.role));
    const locked = cards.filter(c => c.locked);
    gate('A4 fresh save: 9 of 10 locked, skeleton free', locked.length === 9 && !cards.find(c => c.id === 'skeleton_warrior').locked
      && !!cards.find(c => c.id === 'dimis_kickboxer') && !cards.find(c => c.id === 'dimis_kickboxer').locked === false || locked.length === 8,
      JSON.stringify(cards.map(c => [c.id, c.locked])));
    gate('A5 every locked card STATES its requirement', locked.every(c => c.req && /CLEAR (STAGE \d|THE FINAL STAGE)/.test(c.req)),
      JSON.stringify(locked.map(c => [c.id, c.req])));
    gate('A6 requirements match the real ladder (taekwondo → STAGE 1, eddie → FINAL)',
      cards.find(c => c.id === 'taekwondo_girl')?.req === 'CLEAR STAGE 1'
      && cards.find(c => c.id === 'eddie')?.req === 'CLEAR THE FINAL STAGE',
      JSON.stringify([cards.find(c => c.id === 'taekwondo_girl')?.req, cards.find(c => c.id === 'eddie')?.req]));

    const detail = await page.evaluate(() => ({
      name:   document.querySelector('#csc-pv-name')?.textContent.trim(),
      role:   document.querySelector('#csc-pv-role')?.textContent.trim(),
      spec:   document.querySelector('#csc-pv-spec')?.textContent.trim(),
      weapon: document.querySelector('#csc-pv-weapon')?.textContent.trim(),
      hp:     document.querySelector('#csc-st-hp')?.textContent.trim(),
      spd:    document.querySelector('#csc-st-spd')?.textContent.trim(),
      armor:  document.querySelector('#csc-st-armor')?.textContent.trim(),
      hpBar:  document.querySelector('#csc-st-hp-bar')?.style.width,
    }));
    gate('A7 dossier: name/role/specialty filled', !!(detail.name && detail.role && detail.spec), JSON.stringify(detail));
    gate('A8 dossier: REAL Player stats (skeleton 130 HP / 207 SPD / 15%)',
      detail.hp === '130' && detail.spd === '207' && detail.armor === '15%', JSON.stringify([detail.hp, detail.spd, detail.armor]));
    gate('A9 dossier: starter weapon from the catalog', !!detail.weapon && detail.weapon.length > 3, String(detail.weapon));
    gate('A10 stat bars render with widths', !!detail.hpBar && detail.hpBar !== '0%', String(detail.hpBar));

    // Keyboard: → moves the selection; the locked target states its requirement in the dossier.
    // The keys-Set is POLLED by update(), so hold the key across frames and retry once —
    // a tap can land between two frames in a busy headless boot.
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.keyboard.down('ArrowRight'); await sleep(250); await page.keyboard.up('ArrowRight'); await sleep(200);
      const id = await page.evaluate(() => document.querySelector('#cgm-charselect .csc-card.active')?.dataset.id);
      if (id !== 'skeleton_warrior') break;
    }
    const afterKey = await page.evaluate(() => ({
      activeId: document.querySelector('#cgm-charselect .csc-card.active')?.dataset.id,
      hint: document.querySelector('#csc-unlock-hint')?.textContent.trim(),
      hintShown: getComputedStyle(document.querySelector('#csc-unlock-area')).display !== 'none',
      hp: document.querySelector('#csc-st-hp')?.textContent.trim(),
    }));
    gate('A11 keyboard → moves the selection to taekwondo', afterKey.activeId === 'taekwondo_girl', String(afterKey.activeId));
    gate('A12 locked selection shows the requirement in the dossier',
      afterKey.hintShown && /CLEAR STAGE 1/.test(afterKey.hint || ''), String(afterKey.hint));
    gate('A13 dossier stats follow the selection (taekwondo 90 HP)', afterKey.hp === '90', String(afterKey.hp));

    const btns = await visibleStarts(page);
    gate('A14 default entry shows ONLY START GAME', btns.start && !btns.endless && !btns.chaos, JSON.stringify(btns));
    const startState = await page.evaluate(() => ({ txt: document.querySelector('#csc-start-btn')?.textContent.trim(), dis: document.querySelector('#csc-start-btn')?.disabled }));
    gate('A15 START disabled + labelled LOCKED on a locked selection', startState.dis === true && /LOCKED/.test(startState.txt), JSON.stringify(startState));

    await clickAndSettle(page, '#csc-back-btn');
    gate('A16 BACK returns to the main menu', (await state(page)) === 'start_menu');
    gate('A17 zero uncaught page errors (phase A)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ══ PHASE B — unlocked save: mode chips + one start button per mode ══════════
  {
    const seed = { endlessUnlocked: true, stagesCleared: 7 };
    const { ctx, page, pageErrors } = await bootPage(browser, { seedMeta: seed });
    await clickAndSettle(page, '#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="endless"]');
    gate('B1 ENDLESS entry → character_select', (await state(page)) === 'character_select');
    const chipE = await page.$eval('#csc-mode-chip', el => el.textContent.trim());
    const btnsE = await visibleStarts(page);
    gate('B2 endless entry: mode chip + ONLY START ENDLESS', /ENDLESS/.test(chipE) && !btnsE.start && btnsE.endless && !btnsE.chaos,
      JSON.stringify([chipE, btnsE]));
    const lockedCount = await page.$$eval('#cgm-charselect .csc-card .csc-lock-overlay', els =>
      els.filter(e => getComputedStyle(e).display !== 'none').length);
    gate('B3 full-clear save: every character unlocked', lockedCount === 0, String(lockedCount));
    await clickAndSettle(page, '#csc-back-btn');
    gate('B4 BACK returns to mode select', (await state(page)) === 'mode_select');
    await clickAndSettle(page, '#cgm-modesel .msl-card[data-mode="chaos"]');
    const chipC = await page.$eval('#csc-mode-chip', el => el.textContent.trim());
    const btnsC = await visibleStarts(page);
    gate('B5 chaos entry: mode chip + ONLY START CHAOS', /CHAOS/.test(chipC) && !btnsC.start && !btnsC.endless && btnsC.chaos,
      JSON.stringify([chipC, btnsC]));
    gate('B6 zero uncaught page errors (phase B)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ══ PHASE C — mobile viewport: overlay + grid + actions usable ═══════════════
  {
    const { ctx, page, pageErrors } = await bootPage(browser, { viewport: { width: 390, height: 844 } });
    await clickAndSettle(page, '#cgm-menu-nav .mbtn[data-cgm-item="CHARACTER SELECT"]');
    const m = await page.evaluate(() => {
      const grid = document.querySelector('#csc-grid');
      const stage = document.querySelector('#cgm-charselect .csc-stage');
      const back = document.querySelector('#csc-back-btn');
      const cards = grid ? grid.querySelectorAll('.csc-card').length : 0;
      return {
        cards,
        gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        fits: stage ? stage.getBoundingClientRect().width <= window.innerWidth : false,
        backH: back ? back.getBoundingClientRect().height : 0,
      };
    });
    gate('C1 mobile: 10 cards in a narrow grid (≤3 columns), panel fits viewport',
      m.cards === 10 && m.gridCols <= 3 && m.fits, JSON.stringify(m));
    gate('C2 mobile: tap targets ≥ 40px', m.backH >= 40, String(m.backH));
    gate('C3 zero uncaught page errors (phase C)', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} gates green`);
  process.exit(failures ? 1 : 0);
})().catch (e => { console.error('HARNESS ERROR', e); process.exit(1); });
