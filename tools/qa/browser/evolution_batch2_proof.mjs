// ─────────────────────────────────────────────────────────────────────────────
// EVOLUTION VFX BATCH 2 — RUNTIME PROOF (2026-08-09, Maria)
//
// Πέντε νέα procedural evolutions: Eclipse Frostfang, Crimson Singularity,
// Shatter Rift Blade, Stormrift Edge, Vaporize Blade. Gates:
//   B1 boot → start_menu → endless run ως brawler_warrior (production flow)
//   B2 defs: name/procedural/isEvolution σωστά και για τα 5 (live module)
//   B3 recipes: owner/ingredients/minLevel σωστά και για τα 5
//   B4 card: με τα υλικά lvl5, _buildEvolutionCard() = «EVOLVE: Crimson
//      Singularity», rarity legendary (πραγματικό production path)
//   B5 E2E: πραγματικό level-up panel → επιλογή με ΠΛΗΚΤΡΟΛΟΓΙΟ (αριθμός slot)
//      → το evolution αποκτήθηκε
//   B6 το νέο όπλο ΠΥΡΟΔΟΤΕΙ in-world procedural VFX (_evoFx με το id)
//   B7 stub-render και των 5 χορογραφιών σε t=0.35/0.9 → πραγματικά draw ops
//   B8 μηδέν PNG path: κανένα def.sprite
//   B9 μηδέν page errors / μηδέν non-404 console errors
// Usage:  node tools/qa/browser/evolution_batch2_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.EVO2_PROOF_SHOTS || '/tmp/evo_batch2_shots';
const BUILD = '20260908160000';

const FIVE = [
  { id: 'eclipse_frostfang',   name: 'Eclipse Frostfang',   owner: 'assassin_clone',
    ing: ['shadow_toxic', 'solo_red_thunder'] },
  { id: 'crimson_singularity', name: 'Crimson Singularity', owner: 'brawler_warrior',
    ing: ['nexus_chakram', 'solo_red_thunder'] },
  { id: 'shatter_rift_blade',  name: 'Shatter Rift Blade',  owner: 'eddie',
    ing: ['solo_red_thunder', 'glitch_tear'] },
  { id: 'stormrift_edge',      name: 'Stormrift Edge',      owner: 'cyber_arm_hero',
    ing: ['magnetic_arc', 'shadow_toxic'] },
  { id: 'vaporize_blade',      name: 'Vaporize Blade',      owner: 'brawler_warrior',
    ing: ['spirit_crescent', 'solo_red_thunder'] },
];

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
    try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 7, chaosUnlocked: true })); } catch (_) {}
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
  gate('B1 boot → start_menu', true);
  gate('B1b μηδέν page errors στο boot', pageErrors.length === 0, pageErrors.join(' | '));

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
  gate('B2 ζωντανό Game instance', await page.evaluate(() => !!window.__g));

  // B2b/B3: defs + recipes από το ΖΩΝΤΑΝΟ module (ίδιο ?v με το Game.js import)
  const catalog = await page.evaluate(async (arg) => {
    const mod = await import(`./js/game/WeaponCatalog.js?v=${arg.build}`);
    const out = { defs: {}, recipes: {} };
    for (const f of arg.five) {
      const d = mod.getWeaponDef(f.id);
      out.defs[f.id] = d ? { name: d.name, proc: !!d.procedural, evo: !!d.isEvolution, sprite: d.sprite || null } : null;
      const r = mod.EVOLUTION_RECIPES.find(x => x.result === f.id);
      out.recipes[f.id] = r ? { ing: [...r.ingredients].sort(), min: r.minLevel, owner: r.owner || null } : null;
    }
    return out;
  }, { build: BUILD, five: FIVE });
  for (const f of FIVE) {
    const d = catalog.defs[f.id], r = catalog.recipes[f.id];
    gate(`B2 def ${f.id}: name+procedural+isEvolution`,
         !!d && d.name === f.name && d.proc && d.evo, JSON.stringify(d));
    gate(`B3 recipe ${f.id}: ingredients+owner+minLevel 5`,
         !!r && r.min === 5 && JSON.stringify(r.ing) === JSON.stringify([...f.ing].sort())
             && Array.isArray(r.owner) && r.owner.length === 1 && r.owner[0] === f.owner,
         JSON.stringify(r));
  }

  // B1c: production flow → endless run ως brawler_warrior
  const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(160); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(160); };
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await click('#cgm-modesel .msl-card[data-mode="endless"]');
  await click('#mi-continue');
  await sleep(400);
  await page.evaluate(() => { document.querySelector('.csc-card[data-id="brawler_warrior"]')?.click(); });
  await sleep(250);
  await click('#csc-endless-btn');
  await sleep(800);
  const st = await page.evaluate(() => {
    const g = window.__g;
    return { gs: g.gameState, endless: !!g.endless,
             ch: g.player?.selectedCharacter || g.selectedCharacter || null };
  });
  gate('B1c endless run: playing ως brawler_warrior',
       st.gs === 'playing' && st.endless && st.ch === 'brawler_warrior', JSON.stringify(st));

  // B4: production card path (υλικά lvl5 → EVOLVE card)
  const card = await page.evaluate(() => {
    const g = window.__g;
    g.player.maxHp = 99999; g.player.hp = 99999;
    g._weaponLevels.set('nexus_chakram', 5);
    g._weaponLevels.set('solo_red_thunder', 5);
    const c = g._buildEvolutionCard();
    return c ? { name: c.name, rarity: c.rarity, evo: !!c._isEvolutionCard } : null;
  });
  gate('B4 _buildEvolutionCard → EVOLVE: Crimson Singularity (legendary)',
       !!card && /Crimson Singularity/.test(card.name) && card.rarity === 'legendary' && card.evo,
       JSON.stringify(card));

  // B5: πραγματικό level-up panel + επιλογή με ΠΛΗΚΤΡΟΛΟΓΙΟ
  let acquired = false, slot = -1;
  for (let i = 0; i < 90 && !acquired; i++) {
    await sleep(400);
    const st2 = await page.evaluate(() => {
      const g = window.__g;
      g.player.hp = g.player.maxHp;
      if (!g.upgradeUI || !g.upgradeUI.choices) return { open: false };
      const idx = g.upgradeUI.choices.findIndex(c => c && /Crimson Singularity/.test(c.name || ''));
      return { open: true, idx };
    });
    if (st2.open) {
      if (st2.idx >= 0) {
        slot = st2.idx;
        await page.keyboard.press(String(st2.idx + 1));          // επιλογή με keyboard
        await sleep(500);
        acquired = await page.evaluate(() => {
          const g = window.__g;
          return (g._evolutionsDone && g._evolutionsDone.has('crimson_singularity'))
              || Number(g._weaponLevels.get('crimson_singularity') || 0) > 0
              || (g._evolvedWeapons && g._evolvedWeapons.has('crimson_singularity'));
        });
      } else {
        await page.keyboard.press('1');                          // άσχετο panel — προχώρα
        await sleep(250);
      }
    }
  }
  gate('B5 E2E: level-up card → keyboard select → evolution αποκτήθηκε', acquired, `slot=${slot + 1}`);

  // B6: το όπλο πυροδοτεί ζωντανό procedural VFX in-world
  let fired = false;
  for (let i = 0; i < 40 && !fired; i++) {
    await sleep(400);
    fired = await page.evaluate(() => {
      const g = window.__g;
      g.player.hp = g.player.maxHp;
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      return !!(g._evoFx && g._evoFx.some(f => f.id === 'crimson_singularity'));
    });
  }
  gate('B6 Crimson Singularity πυροδοτεί in-world procedural VFX', fired);
  await shot('evo2_live.png');

  // B7: stub-render και των 5 χορογραφιών (t=0.35 mid-act, t=0.9 dissolve)
  const stub = await page.evaluate((five) => {
    const g = window.__g;
    const mk = () => {
      const c = { ops: 0, img: 0, globalAlpha: 1, globalCompositeOperation: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', lineDashOffset: 0, shadowBlur: 0 };
      for (const f of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'translate', 'scale', 'rotate', 'closePath', 'setLineDash', 'quadraticCurveTo'])
        c[f] = () => {};
      for (const f of ['arc', 'ellipse', 'fill', 'stroke', 'fillRect'])
        c[f] = () => { c.ops++; };
      c.drawImage = () => { c.img++; };
      c.createRadialGradient = () => ({ addColorStop: () => {} });
      c.createLinearGradient = () => ({ addColorStop: () => {} });
      return c;
    };
    const saved = g._evoFx;
    const out = {};
    for (const f of five) {
      let opsA = 0, opsB = 0, imgs = 0;
      for (const [t, key] of [[0.35, 'a'], [0.9, 'b']]) {
        g._evoFx = [{ id: f.id, x: 0, y: 0, angle: 0, t, seed: 123, R: 140, color: '#9fd8ff' }];
        const c = mk();
        try { g._drawEvoFx(c); } catch (e) { out[f.id + '_err'] = String(e.message).slice(0, 60); }
        if (key === 'a') opsA = c.ops; else opsB = c.ops;
        imgs += c.img;
      }
      out[f.id] = { opsA, opsB, imgs };
    }
    g._evoFx = saved;
    return out;
  }, FIVE);
  for (const f of FIVE) {
    const r = stub[f.id] || {};
    const ok = r.opsA > 10 && r.opsB > 5 && r.imgs === 0;
    gate(`B7 ${f.id}: χορογραφία ζωγραφίζει (mid=${r.opsA}, fade=${r.opsB}, drawImage=${r.imgs})`, ok,
         stub[f.id + '_err'] || '');
  }

  // B8: κανένα def.sprite (μηδέν PNG path in-world)
  const noSprite = FIVE.every(f => catalog.defs[f.id] && !catalog.defs[f.id].sprite);
  gate('B8 κανένα def.sprite στα 5 (procedural-only)', noSprite);

  await sleep(600);
  gate('B9 μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  gate('B9b μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
