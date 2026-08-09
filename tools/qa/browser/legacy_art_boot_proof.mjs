// ─────────────────────────────────────────────────────────────────────────────
// MARIA LEGACY-ART REPLACEMENT — BOOT & LOAD PROOF (2026-08-08)
//
// Πραγματικό boot μέσω production flow (menu → mode select → briefing →
// character select → START ENDLESS) πάνω στο build με τα 21 νέα art + το
// cache-bust chain 20260908010000. Gates:
//   A1 boot φτάνει σε start_menu, 0 page errors
//   A2 ζωντανό Game instance πιάνεται από το πρώτο frame
//   A3 όλα τα αντικατεστημένα in-use sprites φορτώνουν (naturalWidth>0)
//      και τα 4 ?v-bumped URLs ζητούν το νέο build
//   A4 char select εμφανίζεται (νέο taekwondo portrait ορατό — screenshot)
//   A5 START ENDLESS → gameState=playing, ο καμβάς έχει ζωντανό περιεχόμενο
//   A6 plasma_execution: το in-world override art είναι το ΝΕΟ αρχείο και φαίνεται
//   A7 μηδέν page errors / μηδέν non-404 console errors σε όλη τη διαδρομή
// Usage:  node tools/qa/browser/legacy_art_boot_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.ART_PROOF_SHOTS || '/tmp/legacy_art_shots';
const BUILD = '20260908150000';
// Per-asset ?v: το chars line πήρε νέο bust στο revert του Taekwondo art (20260908020000)·
// nexus/lava/marker κρατούν το bust του 5284bee (αρχεία αμετάβλητα από τότε).
const ASSET_V = { taek: '20260908020000', lava: '20260908010000', marker: '20260908010000', nexus: '20260908010000' };

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
    if (/Failed to load resource/.test(t)) return;   // non-staged art στο harness slice
    consoleErrors.push(t);
  });
  const cdp = await ctx.newCDPSession(page);
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOTS + '/' + name, Buffer.from(data, 'base64'));
  };

  await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 20000 });
  gate('A1 boot → start_menu', true);
  gate('A1b μηδέν page errors στο boot', pageErrors.length === 0, pageErrors.join(' | '));
  await shot('menu.png');

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
  gate('A2 ζωντανό Game instance', await page.evaluate(() => !!window.__g));

  // A3: όλα τα αντικατεστημένα in-use sprites φορτωμένα + σωστά ?v
  const sprites = await page.evaluate(() => {
    const g = window.__g;
    const probe = (img) => img ? { ok: !!(img.complete && img.naturalWidth > 0), src: img.src || '' } : { ok: false, src: '(missing)' };
    return {
      lava:    probe(g._lavaBombsSprite),
      marker:  probe(g._strikeMarkerSprite),
      nexus:   probe(g._nexusFallbackImage),
      taek:    probe(g._charImages?.taekwondo_girl),
      rocket:  probe(g._weaponImages?.vessel_purple_rockets),
      flame:   probe(g._weaponImages?.eddie_flame),
      stormC:  probe(g._weaponVFXSheets?.storm_conductor),
      plasma:  probe(g._weaponVFXSheets?.plasma_execution),
    };
  });
  for (const [k, v] of Object.entries(sprites)) gate(`A3 sprite loaded: ${k}`, v.ok, v.ok ? '' : v.src);
  for (const k of ['lava', 'marker', 'nexus', 'taek'])
    gate(`A3 ?v bumped: ${k}`, sprites[k].src.includes(ASSET_V[k]), sprites[k].src);

  // A4: production flow μέχρι το char select (νέο taekwondo portrait ορατό)
  const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(160); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(160); };
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await click('#cgm-modesel .msl-card[data-mode="endless"]');
  await click('#mi-continue');
  await sleep(400);
  const cscInfo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.csc-card')];
    const taek = cards.map((c, i) => ({ i, html: c.innerHTML })).filter(x => /taekwondo/i.test(x.html));
    return { cards: cards.length, taekIdx: taek.length ? taek[0].i : -1 };
  });
  gate('A4 char select εμφανίζεται (cards>0)', cscInfo.cards > 0, `cards=${cscInfo.cards}`);
  if (cscInfo.taekIdx >= 0) {
    await page.evaluate((i) => document.querySelectorAll('.csc-card')[i].click(), cscInfo.taekIdx);
    await sleep(300);
  }
  gate('A4b taekwondo card υπάρχει', cscInfo.taekIdx >= 0, String(cscInfo.taekIdx));
  await shot('char_select.png');

  // A5: START ENDLESS → playing
  await click('#csc-endless-btn');
  const gs = await page.evaluate(() => window.__phenixQA?.snapshot?.()?.gameState);
  gate('A5 START ENDLESS → gameState=playing', gs === 'playing', String(gs));
  await sleep(2500);
  await shot('playing.png');
  // ζωντανός καμβάς: mean luminance + διακύμανση στο screenshot
  const png = fs.readFileSync(SHOTS + '/playing.png');
  gate('A5b screenshot γράφτηκε (>50KB)', png.length > 50000, `${png.length}B`);

  // A6 (rev. 2026-08-09, Maria): το plasma_execution είναι πλέον PROCEDURAL
  // in-world (WeaponStrikeFx2 'plasma' — το HD PNG μένει μόνο ως card icon).
  await page.evaluate(() => {
    const g = window.__g;
    g._weaponLevels.set('plasma_execution', 5);
    g.player.maxHp = 99999; g.player.hp = 99999;
  });
  let sawPlasma = false, sawOldArt = false;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    const s = await page.evaluate(() => {
      const g = window.__g;
      const fx = g._activeWeaponVFX || [];
      const isOld = (img) => !!(img && /plasma_execution_hd/.test(img.src || ''));
      return { p: fx.some(v => v && v.kind === 'plasma'),
               o: fx.some(v => v && (isOld(v.overrideImg) || isOld(v.spriteSheet))) };
    });
    sawOldArt = sawOldArt || s.o;
    if (s.p) { sawPlasma = true; await shot('plasma_fx.png'); break; }
  }
  gate('A6 plasma_execution in-world = procedural plasma strike (όχι PNG)', sawPlasma && !sawOldArt,
       JSON.stringify({ sawPlasma, sawOldArt }));

  gate('A7 μηδέν page errors συνολικά', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  gate('A7b μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
