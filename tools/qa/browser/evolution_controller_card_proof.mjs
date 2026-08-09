// ─────────────────────────────────────────────────────────────────────────────
// EVOLUTION CARD SELECTION — CONTROLLER PROOF (2026-08-09, Maria)
//
// Ξεχωριστό controller test (αίτημα Batch 2): η επιλογή EVOLVE κάρτας γίνεται
// ΑΠΟΚΛΕΙΣΤΙΚΑ μέσω του πραγματικού gamepad path — fake Gamepad στο
// navigator.getGamepads → GamepadInput.poll() → applyGamepad (main.js) →
// ArrowLeft/ArrowRight cursor + A/Cross=Enter → selectUpgrade. ΚΑΝΕΝΑ
// page.keyboard input μετά το boot.
//   P1 boot → start_menu, 0 page errors
//   P2 ζωντανό Game instance
//   P3 endless run ως assassin_clone (production flow, data-id click)
//   P4 fake pad: πάτημα Back → _controllerConnected + _controllerActivated
//      (ο ΠΡΑΓΜΑΤΙΚΟΣ GamepadInput.poll τον είδε)
//   P5 υλικά lvl5 → _buildEvolutionCard = «EVOLVE: Eclipse Frostfang» (sanity)
//   P6 πραγματικό level-up panel με την κάρτα (φυσικό XP flow)
//   P7 D-pad RIGHT κινεί τον cursor (selectedIndex) μέχρι την κάρτα —
//      αποδεικνύει το controller navigation, όχι μόνο το confirm
//   P8 A/Cross (μετά το 200ms CARD GUARD) → το evolution αποκτήθηκε + panel
//      έκλεισε — πλήρες controller confirm
//   P9 μηδέν page errors / μηδέν non-404 console errors
// Usage:  node tools/qa/browser/evolution_controller_card_proof.mjs [baseUrl]
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE  = process.argv[2] || 'http://127.0.0.1:8138';
const EXE   = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SHOTS = process.env.PAD_PROOF_SHOTS || '/tmp/evo_pad_shots';
const BUILD = '20260908150000';

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
    // ── FAKE GAMEPAD (proof-only) ──
    // Πλήρες standard-mapping pad: το ΠΡΑΓΜΑΤΙΚΟ GamepadInput.poll() το διαβάζει
    // μέσω navigator.getGamepads σε κάθε frame. __padPress(idx, ms) = φυσικό
    // πάτημα (held για ms, μετά release) — τα rising edges τα βγάζει ο poll.
    const fake = {
      id: 'QA Fake Pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
      index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    window.__fakePad = fake;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [fake, null, null, null],
    });
    window.__padPress = (idx, ms) => new Promise((res) => {
      fake.buttons[idx].pressed = true; fake.buttons[idx].value = 1;
      setTimeout(() => {
        fake.buttons[idx].pressed = false; fake.buttons[idx].value = 0;
        setTimeout(res, 120);
      }, ms || 250);
    });
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
  gate('P1 boot → start_menu', true);
  gate('P1b μηδέν page errors στο boot', pageErrors.length === 0, pageErrors.join(' | '));

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
  gate('P2 ζωντανό Game instance', await page.evaluate(() => !!window.__g));

  // P3: production flow → endless ως assassin_clone (owner του Eclipse Frostfang)
  const click = async (sel) => { await page.click(sel, { timeout: 8000 }); await sleep(160); await page.evaluate(() => window.__phenixQA?._settleFade?.()); await sleep(160); };
  await click('#cgm-menu-nav .mbtn[data-cgm-item="START GAME"]');
  await click('#cgm-modesel .msl-card[data-mode="endless"]');
  await click('#mi-continue');
  await sleep(400);
  await page.evaluate(() => { document.querySelector('.csc-card[data-id="assassin_clone"]')?.click(); });
  await sleep(250);
  await click('#csc-endless-btn');
  await sleep(800);
  const st = await page.evaluate(() => {
    const g = window.__g;
    return { gs: g.gameState, endless: !!g.endless,
             ch: g.player?.selectedCharacter || g.selectedCharacter || null };
  });
  gate('P3 endless run: playing ως assassin_clone',
       st.gs === 'playing' && st.endless && st.ch === 'assassin_clone', JSON.stringify(st));

  // P4: activation με Back (index 8 — αδέσμευτο στο gameplay branch, μηδέν side effects)
  await page.evaluate(() => window.__padPress(8, 250));
  await sleep(600);
  const pad = await page.evaluate(() => ({
    conn: !!window.__g._controllerConnected, act: !!window.__g._controllerActivated,
  }));
  gate('P4 fake pad: GamepadInput τον βλέπει (connected)', pad.conn);
  gate('P4b activation μετά το Back press', pad.act);

  // P5: υλικά lvl5 → production card (sanity πριν το E2E)
  const card = await page.evaluate(() => {
    const g = window.__g;
    g.player.maxHp = 99999; g.player.hp = 99999;
    g._weaponLevels.set('shadow_toxic', 5);
    g._weaponLevels.set('solo_red_thunder', 5);
    const c = g._buildEvolutionCard();
    return c ? { name: c.name, rarity: c.rarity } : null;
  });
  gate('P5 _buildEvolutionCard → EVOLVE: Eclipse Frostfang (legendary)',
       !!card && /Eclipse Frostfang/.test(card.name) && card.rarity === 'legendary',
       JSON.stringify(card));

  // P6-P8: φυσικό level-up panel → controller navigation → controller confirm.
  // ΟΛΗ η αλληλεπίδραση μέσω __padPress — κανένα page.keyboard από εδώ και πέρα.
  let acquired = false, navProof = null, cardSeen = false;
  for (let i = 0; i < 90 && !acquired; i++) {
    await sleep(400);
    const st2 = await page.evaluate(() => {
      const g = window.__g;
      g.player.hp = g.player.maxHp;
      if (!g.upgradeUI || !g.upgradeUI.choices) return { open: false };
      const idx = g.upgradeUI.choices.findIndex(c => c && /Eclipse Frostfang/.test(c.name || ''));
      return { open: true, idx, sel: g.upgradeUI.selectedIndex | 0, n: g.upgradeUI.choices.length };
    });
    if (!st2.open) continue;
    if (st2.idx < 0) {
      // Άσχετο panel: κλείσ' το ΚΙ ΑΥΤΟ με το χειριστήριο (A στο τρέχον cursor),
      // αφού περάσει το 200ms CARD GUARD settle window.
      await sleep(450);
      await page.evaluate(() => window.__padPress(0, 250));
      await sleep(500);
      continue;
    }
    cardSeen = true;
    await sleep(450);                                        // CARD GUARD arm window
    // P7: D-pad RIGHT μέχρι ο cursor να κάτσει στην κάρτα. Αν η κάρτα έτυχε ήδη
    // κάτω από τον cursor, κάνε ΠΛΗΡΗ ΚΥΚΛΟ (n βήματα) — το navigation πρέπει
    // να ασκηθεί πραγματικά, όχι να περάσει κενά (moves must be ≥ 1).
    let sel = st2.sel, moved = 0;
    const steps = sel === st2.idx ? st2.n : st2.n + 1;
    for (let s2 = 0; s2 < steps && (moved === 0 || sel !== st2.idx); s2++) {
      await page.evaluate(() => window.__padPress(15, 250)); // D-pad Right (BTN 15)
      await sleep(480);
      const cur = await page.evaluate(() => window.__g.upgradeUI ? (window.__g.upgradeUI.selectedIndex | 0) : -1);
      if (cur === -1) break;                                 // panel χάθηκε — ξαναπροσπάθησε στον επόμενο γύρο
      if (cur !== sel) moved++;
      sel = cur;
    }
    navProof = { landed: sel === st2.idx && moved >= 1, moved, idx: st2.idx, from: st2.sel, n: st2.n };
    if (!navProof.landed) continue;
    // P8: A/Cross → Enter → selectUpgrade(cursor)
    await page.evaluate(() => window.__padPress(0, 250));
    await sleep(600);
    acquired = await page.evaluate(() => {
      const g = window.__g;
      return (g._evolutionsDone && g._evolutionsDone.has('eclipse_frostfang'))
          || Number(g._weaponLevels.get('eclipse_frostfang') || 0) > 0
          || (g._evolvedWeapons && g._evolvedWeapons.has('eclipse_frostfang'));
    });
  }
  gate('P6 level-up panel με EVOLVE: Eclipse Frostfang εμφανίστηκε', cardSeen);
  gate('P7 D-pad navigation: cursor κινήθηκε ΚΑΙ έφτασε στην κάρτα (moves ≥ 1)',
       !!navProof && navProof.landed,
       navProof ? `from=${navProof.from} → idx=${navProof.idx} (moves=${navProof.moved}/${navProof.n})` : 'ποτέ');
  const closed = await page.evaluate(() => !window.__g.upgradeUI);
  gate('P8 A/Cross confirm → evolution αποκτήθηκε', acquired);
  gate('P8b panel έκλεισε μετά το confirm', closed);
  await shot('pad_select.png');

  await sleep(600);
  gate('P9 μηδέν page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  gate('P9b μηδέν non-404 console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures ? `\n✘ ${failures} gates FAILED` : '\n✔ ALL GATES PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
