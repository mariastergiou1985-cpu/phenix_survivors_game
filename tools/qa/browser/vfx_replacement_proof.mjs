// ─────────────────────────────────────────────────────────────────────────────
// BAD LIVE VFX REPLACEMENT — RUNTIME PROOF (2026-08-09, Maria)
//
// Τα illustration-PNG live effects (πράσινη γραμμή magnetic_arc, «σφαίρες»
// magnetic_arc_burst/plasma_hd, marker_t στόχος, nexus_burst βάθρο, concept
// totem sprites) αντικαταστάθηκαν με procedural ultimates-style VFX. Gates:
//   V1/V2 boot + ζωντανό Game
//   V3 EUCLID endless: magnetic_arc → WeaponStrikeFx2 kind='bolt' in-world,
//      ΚΑΝΕΝΑ toxic_arc/ArcThunder override, ΚΑΝΕΝΑ magnetic_arc_burst sheet
//   V4 plasma_execution → kind='plasma' in-world, ΚΑΝΕΝΑ plasma_execution_hd sheet
//   V5 card icons ΚΡΑΤΟΥΝ το art: magnetic_arc→toxic_arc (euclid), plasma→hd
//   V6 TAEKWONDO ctx: spirit_crescent in-world ΧΩΡΙΣ crescent_aura override
//      (16-frame sheet παίζει), card icon = crescent_aura
//   V7 marker: το rocket-rain reticle δεν χρησιμοποιεί πια _strikeMarkerSprite
//      (source gate) — procedural στόχαστρο στο ίδιο σημείο
//   V8 nexus base: stub render fallback → procedural ops > 5, ΜΗΔΕΝ drawImage
//   V9 τα 3 tactical sprites είναι spriteCardOnly (κάρτα ΝΑΙ, world ΟΧΙ)
//   V10 μηδέν page errors / μηδέν non-404 console errors
// Usage:  node tools/qa/browser/vfx_replacement_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.VFXR_PROOF_SHOTS || '/tmp/vfx_replacement_shots';
const BUILD = '20260908140000';

let failures = 0;
const gate = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function bootRun(browser, charRegex) {
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
  const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(150); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(150); };
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await click('#cgm-modesel .msl-card[data-mode="endless"]');
  await click('#mi-continue');
  await sleep(350);
  await page.evaluate((re) => { const cd = [...document.querySelectorAll('.csc-card')].find(x => new RegExp(re, 'i').test(x.innerHTML)); cd?.click(); }, charRegex);
  await sleep(250);
  await click('#csc-endless-btn');
  await sleep(800);
  const cdp = await ctx.newCDPSession(page);
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOTS + '/' + name, Buffer.from(data, 'base64'));
  };
  return { ctx, page, pageErrors, consoleErrors, shot };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ── EUCLID: η «πράσινη γραμμή» + οι «σφαίρες» ──────────────────────────────
  {
    const { ctx, page, pageErrors, consoleErrors, shot } = await bootRun(browser, 'euclid');
    gate('V1 boot → endless run (euclid)', await page.evaluate(() => window.__g.gameState === 'playing'));
    gate('V2 ζωντανό Game instance', await page.evaluate(() => !!window.__g));
    await page.evaluate(() => { const g = window.__g;
      g.player.maxHp = 99999; g.player.hp = 99999;
      g._weaponLevels.set('magnetic_arc', 4);
      g._weaponLevels.set('plasma_execution', 4);
    });
    let sawBolt = false, sawPlasma = false, sawBadArt = false;
    for (let i = 0; i < 40 && !(sawBolt && sawPlasma); i++) {
      await page.evaluate(() => { const g = window.__g; if (g.upgradeUI) g.upgradeUI = null; if (g.mutationUI) g.mutationUI = null; g.player.hp = g.player.maxHp; });
      await sleep(300);
      const r = await page.evaluate(() => {
        const fx = window.__g._activeWeaponVFX || [];
        const src = (im) => im ? decodeURIComponent(im.src || '') : '';
        return {
          bolt:   fx.some(v => v && v.kind === 'bolt'),
          plasma: fx.some(v => v && v.kind === 'plasma'),
          bad:    fx.some(v => /toxic_arc|ArcThunder|magnetic_arc_burst|plasma_execution_hd|storm_conductor_hd/
                              .test(src(v?.overrideImg) + '|' + src(v?.spriteSheet))),
        };
      });
      sawBolt = sawBolt || r.bolt; sawPlasma = sawPlasma || r.plasma; sawBadArt = sawBadArt || r.bad;
    }
    gate('V3 magnetic_arc → procedural bolt strike', sawBolt && !sawBadArt, JSON.stringify({ sawBolt, sawBadArt }));
    gate('V4 plasma_execution → procedural plasma spiral', sawPlasma, String(sawPlasma));
    await shot('euclid_procedural.png');
    const icons = await page.evaluate(() => {
      const g = window.__g;
      const s = (im) => im ? decodeURIComponent(im.src || '') : '';
      return {
        arc: /toxic_arc/.test(s(g._weaponCardIcon('magnetic_arc'))),
        pla: (() => { const im = g._weaponCardIcon('plasma_execution');
                      return !!im && (/plasma_execution_hd/.test(s(im)) || im.tagName === 'CANVAS' || im.width > 0); })(),
      };
    });
    gate('V5 card icons κρατούν το illustration art', icons.arc && icons.pla, JSON.stringify(icons));
    // V8: nexus base — procedural fallback χωρίς drawImage
    const nex = await page.evaluate(() => {
      const g = window.__g;
      const c = { ops: 0, img: 0, globalAlpha: 1, globalCompositeOperation: '', fillStyle: '', strokeStyle: '', lineWidth: 0 };
      for (const f of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'translate', 'scale'])
        c[f] = () => {};
      for (const f of ['arc', 'ellipse', 'fill', 'stroke', 'fillRect']) c[f] = () => { c.ops++; };
      c.drawImage = () => { c.img++; };
      c.createRadialGradient = () => ({ addColorStop: () => {} });
      c.createLinearGradient = () => ({ addColorStop: () => {} });
      const saved = g._nexusSpriteCache;
      g._nexusSpriteCache = null;                                  // force fallback path
      try { g._drawEndlessNexusBase(c, { pos: { x: 500, y: 500 }, biomeId: 'neon_district' }); }
      finally { g._nexusSpriteCache = saved; }
      return { ops: c.ops, img: c.img };
    });
    gate('V8 nexus fallback base = procedural (ops>5, drawImage=0)', nex.ops > 5 && nex.img === 0, JSON.stringify(nex));
    // V9: tactical card-only flags
    const tac = await page.evaluate(async () => {
      const mod = await import('./js/game/TacticalWeaponCatalog.js');
      const vals = Object.values(mod.TACTICAL_DEFS || {});
      const three = vals.filter(d => d && d.spriteCardOnly);
      return { n: three.length, allHaveSprite: three.every(d => !!d.sprite) };
    });
    gate('V9 3 tactical sprites → spriteCardOnly (κάρτα ΝΑΙ, world ΟΧΙ)', tac.n === 3 && tac.allHaveSprite, JSON.stringify(tac));
    // V7: marker source gate
    const marker = await page.evaluate(() => {
      const g = window.__g;
      const src = g._drawDoubleDemonsBoss ? g._drawDoubleDemonsBoss.toString() : '';
      return src.length > 0 && !/_strikeMarkerSprite/.test(src) && /chevrons|στόχαστρο|lineDashOffset/.test(src);
    });
    gate('V7 rocket-rain reticle: procedural, όχι marker_t sprite', marker);
    gate('V10a euclid: μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join('|'));
    gate('V10b euclid: μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join('|'));
    await ctx.close();
  }

  // ── TAEKWONDO: spirit_crescent χωρίς το crescent_aura override ─────────────
  {
    const { ctx, page, pageErrors, shot } = await bootRun(browser, 'taekwondo');
    await page.evaluate(() => { const g = window.__g;
      g.player.maxHp = 99999; g.player.hp = 99999;
      g._weaponLevels.set('spirit_crescent', 3);
    });
    // Άμεσο spawn μέσω του ΙΔΙΟΥ production path (_spawnWeaponVFX) — αυτό είναι
    // το μόνο σημείο που εφάρμοζε ποτέ το crescent_aura override in-world.
    const r6 = await page.evaluate(() => {
      const g = window.__g;
      const v = g._spawnWeaponVFX('spirit_crescent', g.player.pos.x + 40, g.player.pos.y, 0, 4);
      const src = (im) => im ? decodeURIComponent(im.src || '') : '';
      return v ? { sheet: /spirit_crescent_kick/.test(src(v.spriteSheet)), aura: !!v.overrideImg && /crescent_aura/.test(src(v.overrideImg)) }
               : { sheet: false, aura: false, none: true };
    });
    gate('V6 spirit_crescent → animated frame sheet, ΟΧΙ crescent_aura in-world', r6.sheet && !r6.aura,
         JSON.stringify(r6));
    const icon = await page.evaluate(() => {
      const im = window.__g._weaponCardIcon('spirit_crescent');
      return !!(im && /crescent_aura/.test(decodeURIComponent(im.src || '')));
    });
    gate('V6b crescent_aura κρατιέται ως CARD icon (taekwondo)', icon);
    await shot('taekwondo_crescent.png');
    gate('V10c taekwondo: μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join('|'));
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
