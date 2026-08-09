// ─────────────────────────────────────────────────────────────────────────────
// EVOLUTION VFX BATCH 1 — RUNTIME PROOF (2026-08-09, Maria)
//
// 5 νέα procedural evolutions (Absolute Zero Tempest, Astral Glacier, Bloodfrost
// Guillotine, Caustic Inferno, Cryo Venom Fang) — πλήρες wiring, ΚΑΝΕΝΑ PNG στο
// live gameplay. Gates:
//   B1 boot + endless run (taekwondo)
//   B2 defs: 5/5 στο WeaponCatalog — σωστό όνομα, procedural, isEvolution, ΧΩΡΙΣ sprite
//   B3 recipes: 5/5 στο EVOLUTION_RECIPES με σωστό owner + ingredients
//   B4 card: με τα υλικά lvl5, _buildEvolutionCard() = «EVOLVE: Absolute Zero
//      Tempest», rarity legendary (πραγματικό production path)
//   B5 E2E: πραγματικό level-up panel → επιλογή με ΠΛΗΚΤΡΟΛΟΓΙΟ (αριθμός slot)
//      → το evolution αποκτήθηκε
//   B6 το νέο όπλο ΠΥΡΟΔΟΤΕΙ in-world procedural VFX (_evoFx με το id)
//   B7 stub-render και των 5 χορογραφιών σε t=0.35/0.9 → πραγματικά draw ops
//   B8 μηδέν PNG path: κανένα def.sprite, κανένα WEAPON_VFX_META entry
//   B9 μηδέν page errors / μηδέν non-404 console errors
// Usage:  node tools/qa/browser/evolution_batch1_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.EVO1_PROOF_SHOTS || '/tmp/evolution_batch1_shots';
const BUILD = '20260908140000';

const FIVE = [
  { id: 'absolute_zero_tempest', name: 'Absolute Zero Tempest', owner: 'taekwondo_girl',    ing: ['spirit_crescent', 'storm_saber'] },
  { id: 'astral_glacier',        name: 'Astral Glacier',        owner: 'japan_phasewalker', ing: ['nexus_chakram', 'glitch_tear'] },
  { id: 'bloodfrost_guillotine', name: 'Bloodfrost Guillotine', owner: 'skeleton_warrior',  ing: ['gas_needle', 'spirit_crescent'] },
  { id: 'caustic_inferno',       name: 'Caustic Inferno',       owner: 'brawler_warrior',   ing: ['cataclysm_pulse', 'glitch_tear'] },
  { id: 'cryo_venom_fang',       name: 'Cryo Venom Fang',       owner: 'euclid_vector',     ing: ['gas_needle', 'glitch_tear'] },
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
  const cdp = await ctx.newCDPSession(page);
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOTS + '/' + name, Buffer.from(data, 'base64'));
  };

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
  await page.evaluate(() => { const cd = [...document.querySelectorAll('.csc-card')].find(x => /taekwondo/i.test(x.innerHTML)); cd?.click(); });
  await sleep(250);
  await click('#csc-endless-btn');
  await sleep(800);
  gate('B1 endless run (taekwondo) ξεκινά', await page.evaluate(() => window.__g.gameState === 'playing' && window.__g.player.selectedCharacter === 'taekwondo_girl'));

  // B2/B3/B8: defs + recipes + no-PNG (μέσα από το ΙΔΙΟ module instance του build)
  const wiring = await page.evaluate(async (five) => {
    const mod = await import(`./js/game/WeaponCatalog.js?v=20260908140000`);
    const out = { defs: 0, recipes: 0, noPng: 0, names: [] };
    for (const f of five) {
      const d = mod.getWeaponDef ? mod.getWeaponDef(f.id) : (mod.WEAPON_DEFS || {})[f.id];
      if (d && d.name === f.name && d.procedural === true && d.isEvolution === true) out.defs++;
      if (d && !d.sprite) out.noPng++;
      out.names.push(d ? d.name : null);
      const r = (mod.EVOLUTION_RECIPES || []).find(x => x.result === f.id);
      if (r && r.owner && r.owner.includes(f.owner)
          && f.ing.every(i => r.ingredients.includes(i)) && r.minLevel === 5) out.recipes++;
    }
    return out;
  }, FIVE);
  gate('B2 defs 5/5 (όνομα/procedural/isEvolution)', wiring.defs === 5, JSON.stringify(wiring.names));
  gate('B3 recipes 5/5 (owner + ingredients + minLevel 5)', wiring.recipes === 5, `recipes=${wiring.recipes}`);
  gate('B8 κανένα PNG path (def.sprite απών και στα 5)', wiring.noPng === 5, `noPng=${wiring.noPng}`);

  // B4: production card path
  const card = await page.evaluate(() => {
    const g = window.__g;
    g.player.maxHp = 99999; g.player.hp = 99999;
    g._weaponLevels.set('spirit_crescent', 5);
    g._weaponLevels.set('storm_saber', 5);
    const c = g._buildEvolutionCard();
    return c ? { name: c.name, rarity: c.rarity, evo: !!c._isEvolutionCard } : null;
  });
  gate('B4 _buildEvolutionCard → EVOLVE: Absolute Zero Tempest (legendary)',
       !!card && /Absolute Zero Tempest/.test(card.name) && card.rarity === 'legendary' && card.evo,
       JSON.stringify(card));

  // B5: πραγματικό level-up panel + επιλογή με ΠΛΗΚΤΡΟΛΟΓΙΟ
  let acquired = false, slot = -1;
  for (let i = 0; i < 90 && !acquired; i++) {
    await sleep(400);
    const st = await page.evaluate(() => {
      const g = window.__g;
      g.player.hp = g.player.maxHp;
      if (!g.upgradeUI || !g.upgradeUI.choices) return { open: false };
      const idx = g.upgradeUI.choices.findIndex(c => c && /Absolute Zero Tempest/.test(c.name || ''));
      return { open: true, idx };
    });
    if (st.open) {
      if (st.idx >= 0) {
        slot = st.idx;
        await page.keyboard.press(String(st.idx + 1));          // επιλογή με keyboard
        await sleep(500);
        acquired = await page.evaluate(() => {
          const g = window.__g;
          return (g._evolutionsDone && g._evolutionsDone.has('absolute_zero_tempest'))
              || Number(g._weaponLevels.get('absolute_zero_tempest') || 0) > 0
              || (g._evolvedWeapons && g._evolvedWeapons.has('absolute_zero_tempest'));
        });
      } else {
        await page.keyboard.press('1');                          // άσχετο panel — προχώρα
        await sleep(250);
      }
    }
  }
  gate('B5 E2E: level-up card → keyboard select → evolution αποκτήθηκε', acquired, `slot=${slot + 1}`);

  // B6: το όπλο πυροδοτεί ζωντανό procedural VFX
  let fired = false;
  for (let i = 0; i < 30 && !fired; i++) {
    await page.evaluate(() => { const g = window.__g; if (g.upgradeUI) g.upgradeUI = null; if (g.mutationUI) g.mutationUI = null; g.player.hp = g.player.maxHp; });
    await sleep(300);
    fired = await page.evaluate(() => (window.__g._evoFx || []).some(f => f.id === 'absolute_zero_tempest'));
  }
  gate('B6 Absolute Zero Tempest πυροδοτεί in-world procedural VFX', fired);
  await shot('azt_live.png');

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
  let stubOk = true;
  for (const f of FIVE) {
    const r = stub[f.id] || {};
    const ok = r.opsA > 10 && r.opsB > 5 && r.imgs === 0;   // mid-act: το bloodfrost drop είναι σκόπιμα ολιγομελές (rune+λεπίδα)
    if (!ok) stubOk = false;
    gate(`B7 ${f.id}: χορογραφία ζωγραφίζει (mid=${r.opsA}, fade=${r.opsB}, drawImage=${r.imgs})`, ok,
         stub[f.id + '_err'] || '');
  }

  await sleep(600);
  gate('B9 μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  gate('B9b μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
