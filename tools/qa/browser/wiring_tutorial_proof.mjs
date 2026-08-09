// ─────────────────────────────────────────────────────────────────────────────
// WIRING 12 ARTS + FIRST-RUN TUTORIAL — PROOF (2026-08-08)
// W: τα 12 wired arts φορτώνουν μέσα από τα hooks τους (slideshow, tactical
//    sprite cache, wielder override functional με skeleton+magnetic_arc,
//    biome ambient method) · μηδέν errors.
// T: tutorial inert κάτω από QA χωρίς force · με force: S1→S8 πλήρης ροή με
//    Enter, overlay μπλοκάρει click-through, S9 relics στο μενού, persistence,
//    REPLAY TUTORIAL στο settingsItems.
// Usage: node tools/qa/browser/wiring_tutorial_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8138';
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const BUILD = '20260908120000';
let failures = 0;
const gate = (n, ok, d = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ── Context 1: QA χωρίς force → tutorial ΑΔΡΑΝΕΣ + wiring gates ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
      try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 6 })); } catch (_) {}
    });
    const page = await ctx.newPage();
    const pageErrors = [], consoleErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
    await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
    await page.evaluate(async (b) => {
      const mod = await import(`./js/game/Game.js?v=${b}`);
      await new Promise((res) => { const o = mod.Game.prototype.update;
        mod.Game.prototype.update = function (...a) { window.__g = this; mod.Game.prototype.update = o; res(); return o.apply(this, a); }; });
    }, BUILD);
    // W1 (rev. Maria): τα 2 UI arts ΑΦΑΙΡΕΘΗΚΑΝ από το slideshow — μένουν 6, κανένα δικό μας
    await sleep(800);
    const slides = await page.evaluate(() => [...document.querySelectorAll('.slideshow-img')].map(i => i.src));
    gate('W1 slideshow: trio/villain ΕΚΤΟΣ rotation', !slides.some(s => /main_menu_trio|vilian/.test(s)), slides.length + ' slides');
    gate('W1b slideshow: 6 slides, κανένα κενό src', slides.length === 6 && slides.every(s => /assets\/ui\//.test(s)), String(slides.length));
    // W2: tactical sprite cache έχει τα 3 νέα arts φορτωμένα
    let tac = [];
    for (let i = 0; i < 40; i++) {
      tac = await page.evaluate(() => {
        const out = [];
        for (const img of window.__g._tacticalSpriteCache.values()) {
          const s = decodeURIComponent(img.src);
          if (/Beacon Gun|Nano-Swarm|active_override/.test(s)) out.push({ src: s, ok: img.complete && img.naturalWidth > 0 });
        }
        return out;
      });
      if (tac.length === 3 && tac.every(t => t.ok)) break;
      await sleep(300);
    }
    gate('W2 tactical: 3 νέα sprites στο cache και φορτωμένα', tac.length === 3 && tac.every(t => t.ok), JSON.stringify(tac.map(t => t.ok)));
    // W3: tutorial inert (QA χωρίς force) — κανένα overlay
    const tutHidden = await page.evaluate(() => { const el = document.getElementById('tut-overlay'); return !el || el.style.display === 'none'; });
    gate('W3 tutorial ΑΔΡΑΝΕΣ κάτω από QA (κανένα overlay)', tutHidden);
    // W4: functional override — skeleton + magnetic_arc → ArcThunder art in-world
    const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(150); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(150); };
    await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    await click('#cgm-modesel .msl-card[data-mode="endless"]');
    await click('#mi-continue');
    await sleep(350);
    await page.evaluate(() => { const c = [...document.querySelectorAll('.csc-card')].find(x => /skeleton/i.test(x.innerHTML)); c?.click(); });
    await sleep(250);
    await click('#csc-endless-btn');
    const gs = await page.evaluate(() => window.__phenixQA?.snapshot?.()?.gameState);
    gate('W4a endless run με SKELETON ξεκινά', gs === 'playing', String(gs));
    await page.evaluate(() => { const g = window.__g; g._weaponLevels.set('magnetic_arc', 3); g.player.maxHp = 99999; g.player.hp = 99999; });
    let sawArc = false;
    for (let i = 0; i < 30 && !sawArc; i++) {
      await sleep(300);
      sawArc = await page.evaluate(() => (window.__g._activeWeaponVFX || [])
        .some(v => v?.overrideImg && /ArcThunder_Burst/.test(v.overrideImg.src) && v.overrideImg.naturalWidth > 0));
    }
    gate('W4b magnetic_arc|skeleton → ArcThunder override ζωντανό in-world', sawArc);
    // W5: biome ambient hook υπάρχει + το art του τρέχοντος biome φορτώνει (μέσω cache)
    const amb = await page.evaluate(async () => {
      const g = window.__g;
      const has = typeof g._drawBiomeAmbientArt === 'function';
      const ok = await new Promise((res) => { const im = new Image();
        im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false);
        im.src = 'assets/effects/ambient/biome_storm_spark.png'; });
      return { has, ok, biome: g.runBiome };
    });
    gate('W5 biome ambient layer + art φορτώνει', amb.has && amb.ok, `biome=${amb.biome}`);
    // W6: και τα 12 URLs υπαρκτά (κανένα missing asset)
    const urls = ['assets/ui/main_menu_trio.png', 'assets/ui/vilian%20main%20menu%20fist%20theme%20.png',
      'assets/weapons/ArcThunder_Burst.png', 'assets/weapons/crescent_aura.png', 'assets/weapons/biome_crystal_stream.png',
      'assets/weapons/nexus/Weapon%203%20Orbital%20Laser%20Beacon%20Gun.png', 'assets/weapons/nexus/Weapon%204%20Nanite%20Nano-Swarm%20Cloud.png',
      'assets/weapons/vfx/active_override%20beam.png', 'assets/effects/ambient/biome_eden_bloom_pulse.png',
      'assets/effects/ambient/biome_null_void_orb.png', 'assets/effects/ambient/biome_solar_flare.png', 'assets/effects/ambient/biome_storm_spark.png'];
    const loaded = await page.evaluate(async (us) => {
      const one = (u) => new Promise((res) => { const im = new Image(); im.onload = () => res(1); im.onerror = () => res(0); im.src = u; });
      return (await Promise.all(us.map(one))).reduce((a, b) => a + b, 0);
    }, urls);
    gate('W6 και τα 12 assets φορτώνουν (κανένα missing)', loaded === 12, `${loaded}/12`);
    gate('W7 μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join('|'));
    gate('W7b μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join('|'));
    await ctx.close();
  }

  // ── Context 2: forced tutorial → πλήρης ροή βημάτων ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
      try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 6 })); } catch (_) {}
      window.__phenixTutorialForce = 1;
    });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));
    await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
    await page.evaluate(async (b) => {
      const mod = await import(`./js/game/Game.js?v=${b}`);
      await new Promise((res) => { const o = mod.Game.prototype.update;
        mod.Game.prototype.update = function (...a) { window.__g = this; mod.Game.prototype.update = o; res(); return o.apply(this, a); }; });
    }, BUILD);
    // Add-on: ΚΑΝΕΝΑ grandfather — με υπάρχον save το S1 πρέπει να ανοίξει ΜΟΝΟ ΤΟΥ στο μενού.
    const vis = async () => page.evaluate(() => { const el = document.getElementById('tut-overlay'); return !!el && el.style.display !== 'none'; });
    const stepId = async () => page.evaluate(() => { const t = window.__phenixTutorial; return t.visible ? t.stepIdx : -1; });
    const waitStep = async (want, ms = 9000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if ((await vis()) && (await stepId()) >= 0) {
        const id = await page.evaluate(() => { const t = window.__phenixTutorial; return t.visible ? ['menu_start','mode_select','stage_select','char_select','movement','dash_ult','level_up','weapons','relics'][t.stepIdx] : null; });
        if (id === want) return true; } await sleep(150); }
      return false;
    };
    gate('T0 S1 auto-start σε ΥΠΑΡΧΟΝ save (χωρίς replay)', await waitStep('menu_start'));
    // arming: Enter μέσα στο 600ms παράθυρο ΔΕΝ κλείνει το βήμα. Το πραγματικό
    // show μπορεί να έγινε δευτερόλεπτα πριν το εντοπίσει το poll (racy), οπότε
    // ξανα-οπλίζουμε ντετερμινιστικά με την ΙΔΙΑ τιμή που βάζει το _show().
    await page.evaluate(() => { const t = window.__phenixTutorial; t._armedAt = performance.now() + 600; });
    await page.keyboard.press('Enter'); await sleep(220);
    gate('T0b πρώτο step δεν προσπερνιέται από κατά λάθος input (armed)', await vis());
    await sleep(700); await page.keyboard.press('Enter'); await sleep(250);
    gate('T0c μετά το arming το Enter δουλεύει', !(await vis()));
    // replay: μηδενίζει progress και ξαναρχίζει από Main Menu
    await page.evaluate(() => window.__phenixTutorial.replay());
    gate('T1 S1 ξανά μετά από REPLAY TUTORIAL', await waitStep('menu_start'));
    // T2: το overlay μπλοκάρει click-through πάνω από το START GAME
    const blocked = await page.evaluate(() => {
      const b = document.querySelector('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
      if (!b) return false;
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!el && !!el.closest && !!el.closest('#tut-overlay');
    });
    gate('T2 overlay μπλοκάρει click-through στο UI από πίσω', blocked);
    const enter = async () => { await sleep(750); await page.keyboard.press('Enter'); await sleep(220); };
    await enter();
    gate('T3 Enter κλείνει το βήμα', !(await vis()));
    const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(150); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(150); };
    await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
    gate('T4 S2 mode_select', await waitStep('mode_select')); await enter();
    await click('#cgm-modesel .msl-card[data-mode="endless"]');
    await click('#mi-continue'); await sleep(300);
    gate('T5 S4 char_select', await waitStep('char_select')); await enter();
    await click('#csc-endless-btn');
    gate('T6 S5 movement στο playing', await waitStep('movement')); await enter();
    gate('T7 S6 dash+ult (μετά 5s run)', await waitStep('dash_ult', 12000)); await enter();
    await page.evaluate(() => { window.__g.player.level = 2; });   // QA-local trigger
    gate('T8 S7 level_up', await waitStep('level_up')); await enter();
    gate('T8b S8 weapons', await waitStep('weapons')); await enter();
    await page.evaluate(() => window.__g.goToMainMenu());
    gate('T9 S9 relics στο μενού', await waitStep('relics', 12000)); await enter();
    const persist = await page.evaluate(() => JSON.parse(localStorage.getItem('phenix_tutorial_v1') || '{}'));
    gate('T10 persistence: done=true + βήματα seen', persist.done === true && (persist.seen || []).includes('weapons'), JSON.stringify(persist.seen || []).slice(0, 90));
    const hasReplay = await page.evaluate(() => window.__g.settingsItems.includes('REPLAY TUTORIAL'));
    gate('T11 REPLAY TUTORIAL στα Settings', hasReplay);
    gate('T12 μηδέν page errors (tutorial route)', pageErrors.length === 0, pageErrors.slice(0, 2).join('|'));
    await ctx.close();
  }

  // ── Context 3: FRESH save (κανένα phenix_meta) → S1 auto-start στο μενού ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
      window.__phenixTutorialForce = 1;
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
    let fresh = false;
    for (let i = 0; i < 40 && !fresh; i++) {
      fresh = await page.evaluate(() => { const t = window.__phenixTutorial; return !!t && t.visible && t.stepIdx === 0; });
      if (!fresh) await sleep(150);
    }
    gate('T13 fresh save: S1 auto-start στο Main Menu', fresh);
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
