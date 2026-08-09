// ─────────────────────────────────────────────────────────────────────────────
// FINAL EVOLUTION — BIO-SHOCK REAPER RUNTIME PROOF (2026-08-09, Maria)
//
// Το τελευταίο ελεύθερο recipe του pool (36/36): SOLO_RED_THUNDER + GAS_NEEDLE
// → Bio-Shock Reaper (euclid_vector). Δύο ανεξάρτητα browser contexts:
//   Context A (KEYBOARD):
//     R1 boot → start_menu, 0 errors      R2 ζωντανό Game instance
//     R3 def+recipe από το ζωντανό module (name/procedural/no-sprite/owner)
//     R4 endless run ως euclid_vector     R5 EVOLVE: Bio-Shock Reaper card
//     R6 E2E: level-up panel → ΠΛΗΚΤΡΟΛΟΓΙΟ slot → αποκτήθηκε
//     R7 live fire: _evoFx με id bio_shock_reaper
//     R8 stub-render t=0.35/0.9 → πραγματικά ops, ΜΗΔΕΝ drawImage
//     R9 μηδέν errors
//   Context B (CONTROLLER — fake Gamepad → πραγματικό GamepadInput.poll):
//     C1 endless ως euclid_vector + pad connected/activated
//     C2 panel → D-pad ΠΛΗΡΗΣ ΚΥΚΛΟΣ (moves ≥ 1) → A/Cross confirm →
//        αποκτήθηκε + panel έκλεισε — κανένα page.keyboard
//     C3 μηδέν errors
// Usage:  node tools/qa/browser/evolution_bioshock_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.BIOSHOCK_PROOF_SHOTS || '/tmp/evo_bioshock_shots';
const BUILD = '20260908160000';
const ID = 'bio_shock_reaper', NAME = 'Bio-Shock Reaper';

let failures = 0;
const gate = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const baseInit = () => {
  try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
  try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 7, chaosUnlocked: true })); } catch (_) {}
};
const padInit = () => {
  const fake = {
    id: 'QA Fake Pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
    index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  window.__fakePad = fake;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [fake, null, null, null] });
  window.__padPress = (idx, ms) => new Promise((res) => {
    fake.buttons[idx].pressed = true; fake.buttons[idx].value = 1;
    setTimeout(() => {
      fake.buttons[idx].pressed = false; fake.buttons[idx].value = 0;
      setTimeout(res, 120);
    }, ms || 250);
  });
};

async function bootEndlessEuclid(ctx, errs) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.page.push(String(e && e.message || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return;
    errs.console.push(t);
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
  const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(160); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(160); };
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await click('#cgm-modesel .msl-card[data-mode="endless"]');
  await click('#mi-continue');
  await sleep(400);
  await page.evaluate(() => { document.querySelector('.csc-card[data-id="euclid_vector"]')?.click(); });
  await sleep(250);
  await click('#csc-endless-btn');
  await sleep(800);
  return page;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ════ Context A — KEYBOARD ════
  const errsA = { page: [], console: [] };
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctxA.addInitScript(baseInit);
  const pageA = await bootEndlessEuclid(ctxA, errsA);
  gate('R1 boot → start_menu (keyboard ctx)', true);
  gate('R1b μηδέν page errors στο boot', errsA.page.length === 0, errsA.page.join(' | '));
  gate('R2 ζωντανό Game instance', await pageA.evaluate(() => !!window.__g));

  const catalog = await pageA.evaluate(async (arg) => {
    const mod = await import(`./js/game/WeaponCatalog.js?v=${arg.build}`);
    const d = mod.getWeaponDef(arg.id);
    const r = mod.EVOLUTION_RECIPES.find(x => x.result === arg.id);
    return {
      def: d ? { name: d.name, proc: !!d.procedural, evo: !!d.isEvolution, sprite: d.sprite || null } : null,
      rec: r ? { ing: [...r.ingredients].sort(), min: r.minLevel, owner: r.owner || null } : null,
    };
  }, { build: BUILD, id: ID });
  gate('R3 def: Bio-Shock Reaper procedural+isEvolution, ΧΩΡΙΣ sprite',
       !!catalog.def && catalog.def.name === NAME && catalog.def.proc && catalog.def.evo && !catalog.def.sprite,
       JSON.stringify(catalog.def));
  gate('R3b recipe: gas_needle+solo_red_thunder / euclid_vector / minLevel 5',
       !!catalog.rec && catalog.rec.min === 5
           && JSON.stringify(catalog.rec.ing) === JSON.stringify(['gas_needle', 'solo_red_thunder'])
           && Array.isArray(catalog.rec.owner) && catalog.rec.owner.length === 1 && catalog.rec.owner[0] === 'euclid_vector',
       JSON.stringify(catalog.rec));

  const stA = await pageA.evaluate(() => {
    const g = window.__g;
    return { gs: g.gameState, endless: !!g.endless, ch: g.player?.selectedCharacter || g.selectedCharacter || null };
  });
  gate('R4 endless run: playing ως euclid_vector',
       stA.gs === 'playing' && stA.endless && stA.ch === 'euclid_vector', JSON.stringify(stA));

  const card = await pageA.evaluate(() => {
    const g = window.__g;
    g.player.maxHp = 99999; g.player.hp = 99999;
    g._weaponLevels.set('gas_needle', 5);
    g._weaponLevels.set('solo_red_thunder', 5);
    const c = g._buildEvolutionCard();
    return c ? { name: c.name, rarity: c.rarity, evo: !!c._isEvolutionCard } : null;
  });
  gate('R5 _buildEvolutionCard → EVOLVE: Bio-Shock Reaper (legendary)',
       !!card && /Bio-Shock Reaper/.test(card.name) && card.rarity === 'legendary' && card.evo,
       JSON.stringify(card));

  let acquiredA = false, slot = -1;
  for (let i = 0; i < 90 && !acquiredA; i++) {
    await sleep(400);
    const st2 = await pageA.evaluate((name) => {
      const g = window.__g;
      g.player.hp = g.player.maxHp;
      if (!g.upgradeUI || !g.upgradeUI.choices) return { open: false };
      const idx = g.upgradeUI.choices.findIndex(c => c && (c.name || '').includes(name));
      return { open: true, idx };
    }, NAME);
    if (st2.open) {
      if (st2.idx >= 0) {
        slot = st2.idx;
        await pageA.keyboard.press(String(st2.idx + 1));
        await sleep(500);
        acquiredA = await pageA.evaluate((id) => {
          const g = window.__g;
          return (g._evolutionsDone && g._evolutionsDone.has(id))
              || Number(g._weaponLevels.get(id) || 0) > 0
              || (g._evolvedWeapons && g._evolvedWeapons.has(id));
        }, ID);
      } else {
        await pageA.keyboard.press('1');
        await sleep(250);
      }
    }
  }
  gate('R6 E2E KEYBOARD: level-up card → slot select → αποκτήθηκε', acquiredA, `slot=${slot + 1}`);

  let fired = false;
  for (let i = 0; i < 40 && !fired; i++) {
    await sleep(400);
    fired = await pageA.evaluate((id) => {
      const g = window.__g;
      g.player.hp = g.player.maxHp;
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      return !!(g._evoFx && g._evoFx.some(f => f.id === id));
    }, ID);
  }
  gate('R7 Bio-Shock Reaper πυροδοτεί in-world procedural VFX', fired);
  {
    const cdp = await ctxA.newCDPSession(pageA);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOTS + '/bioshock_live.png', Buffer.from(data, 'base64'));
  }

  const stub = await pageA.evaluate((id) => {
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
    for (const [t, key] of [[0.35, 'a'], [0.9, 'b']]) {
      g._evoFx = [{ id, x: 0, y: 0, angle: 0, t, seed: 123, R: 140, color: '#7dff3a' }];
      const c = mk();
      try { g._drawEvoFx(c); } catch (e) { out.err = String(e.message).slice(0, 60); }
      out[key] = c.ops; out.img = (out.img || 0) + c.img;
    }
    g._evoFx = saved;
    return out;
  }, ID);
  gate(`R8 stub-render: χορογραφία ζωγραφίζει (mid=${stub.a}, fade=${stub.b}, drawImage=${stub.img})`,
       stub.a > 10 && stub.b > 5 && stub.img === 0, stub.err || '');

  gate('R9 μηδέν page errors (keyboard ctx)', errsA.page.length === 0, errsA.page.slice(0, 3).join(' | '));
  gate('R9b μηδέν non-404 console errors', errsA.console.length === 0, errsA.console.slice(0, 3).join(' | '));
  await ctxA.close();

  // ════ Context B — CONTROLLER ════
  const errsB = { page: [], console: [] };
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctxB.addInitScript(baseInit);
  await ctxB.addInitScript(padInit);
  const pageB = await bootEndlessEuclid(ctxB, errsB);
  const stB = await pageB.evaluate(() => {
    const g = window.__g;
    return { gs: g.gameState, ch: g.player?.selectedCharacter || g.selectedCharacter || null };
  });
  await pageB.evaluate(() => window.__padPress(8, 250));    // Back = activation
  await sleep(600);
  const pad = await pageB.evaluate(() => ({
    conn: !!window.__g._controllerConnected, act: !!window.__g._controllerActivated,
  }));
  gate('C1 controller ctx: endless ως euclid_vector + pad connected/activated',
       stB.gs === 'playing' && stB.ch === 'euclid_vector' && pad.conn && pad.act,
       JSON.stringify({ ...stB, ...pad }));

  await pageB.evaluate(() => {
    const g = window.__g;
    g.player.maxHp = 99999; g.player.hp = 99999;
    g._weaponLevels.set('gas_needle', 5);
    g._weaponLevels.set('solo_red_thunder', 5);
  });
  let acquiredB = false, navProof = null, cardSeen = false;
  for (let i = 0; i < 90 && !acquiredB; i++) {
    await sleep(400);
    const st2 = await pageB.evaluate((name) => {
      const g = window.__g;
      g.player.hp = g.player.maxHp;
      if (!g.upgradeUI || !g.upgradeUI.choices) return { open: false };
      const idx = g.upgradeUI.choices.findIndex(c => c && (c.name || '').includes(name));
      return { open: true, idx, sel: g.upgradeUI.selectedIndex | 0, n: g.upgradeUI.choices.length };
    }, NAME);
    if (!st2.open) continue;
    if (st2.idx < 0) {
      await sleep(450);
      await pageB.evaluate(() => window.__padPress(0, 250));  // A στο άσχετο panel
      await sleep(500);
      continue;
    }
    cardSeen = true;
    await sleep(450);                                         // CARD GUARD arm
    let sel = st2.sel, moved = 0;
    const steps = sel === st2.idx ? st2.n : st2.n + 1;        // full cycle αν ήδη πάνω της
    for (let s2 = 0; s2 < steps && (moved === 0 || sel !== st2.idx); s2++) {
      await pageB.evaluate(() => window.__padPress(15, 250)); // D-pad Right
      await sleep(480);
      const cur = await pageB.evaluate(() => window.__g.upgradeUI ? (window.__g.upgradeUI.selectedIndex | 0) : -1);
      if (cur === -1) break;
      if (cur !== sel) moved++;
      sel = cur;
    }
    navProof = { landed: sel === st2.idx && moved >= 1, moved, n: st2.n, idx: st2.idx };
    if (!navProof.landed) continue;
    await pageB.evaluate(() => window.__padPress(0, 250));    // A/Cross confirm
    await sleep(600);
    acquiredB = await pageB.evaluate((id) => {
      const g = window.__g;
      return (g._evolutionsDone && g._evolutionsDone.has(id))
          || Number(g._weaponLevels.get(id) || 0) > 0
          || (g._evolvedWeapons && g._evolvedWeapons.has(id));
    }, ID);
  }
  const closedB = await pageB.evaluate(() => !window.__g.upgradeUI);
  gate('C2 CONTROLLER: panel με την κάρτα εμφανίστηκε', cardSeen);
  gate('C2b D-pad navigation (moves ≥ 1) + A/Cross → αποκτήθηκε',
       acquiredB && !!navProof && navProof.landed,
       navProof ? `moves=${navProof.moved}/${navProof.n}, idx=${navProof.idx}` : 'ποτέ');
  gate('C2c panel έκλεισε μετά το confirm', closedB);
  gate('C3 μηδέν page errors (controller ctx)', errsB.page.length === 0, errsB.page.slice(0, 3).join(' | '));
  gate('C3b μηδέν non-404 console errors', errsB.console.length === 0, errsB.console.slice(0, 3).join(' | '));
  await ctxB.close();

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
