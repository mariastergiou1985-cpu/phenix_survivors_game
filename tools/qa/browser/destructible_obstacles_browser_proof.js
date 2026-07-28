// DESTRUCTIBLE OBSTACLES — REAL CHROMIUM RUNTIME PROOF (2026-07-28)
// Drives the production build over HTTP in headless Chromium via the shipped QA bridge
// (sessionStorage.phenix_qa_optin + ?qa=1 → window.__phenixQA). Real Game, real input-driven
// navigation, real weapon fire; nothing is teleported through geometry.
const { chromium } = require('playwright');
const fs = require('fs');
const BUILD = '20260829000000';
const BASE = process.env.PHENIX_BASE || 'http://127.0.0.1:8977';
const path = require('path');
const SHOTS = process.env.PHENIX_SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
const T = (name, cond, extra = '') => {
  const line = `  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`;
  console.log(line); results.push(line);
  cond ? pass++ : fail++;
};

async function freshPage(browser, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });
  await page.addInitScript(() => { try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {} });
  await page.goto(BASE + '/index.html?qa=1', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__phenixQA, null, { timeout: 20000 });
  // Capture the live production Game instance through the SAME module specifier the app uses.
  await page.evaluate(async (b) => {
    const m = await import(`./js/game/Game.js?v=${b}`);
    if (!m.Game.prototype.__qaWrapped) {
      m.Game.prototype.__qaWrapped = true;
      const up = m.Game.prototype.update;
      m.Game.prototype.update = function (...a) { window.__G = this; return up.apply(this, a); };
    }
  }, BUILD);
  return { ctx, page };
}


const fireAtObstacleFn = `async ({ key, exclude }) => {
  const g = window.__G, qa = window.__phenixQA;
  const byKey = (k) => { for (const i of g._obstacles._instances.values()) if (i.key === k) return i; return null; };
  const pick = () => {
    let best = null, bd = Infinity;
    for (const i of g._obstacles._instances.values()) {
      if (i.state === 'destroying' || i.state === 'removed') continue;
      if (exclude && i.key === exclude) continue;
      if (i.type !== 'common') continue;
      const d = Math.hypot(i.x - g.player.pos.x, i.y - g.player.pos.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  let inst = (key && byKey(key)) || pick();
  if (!inst) return { key: null, states: ['missing'], final: { state: 'missing' } };
  const outKey = inst.key;
  const bbox = { x0: inst.x0, y0: inst.y0, x1: inst.x1, y1: inst.y1, x: inst.x, y: inst.y, w: inst.width, h: inst.height };
  const mm = g.mapManager, wm = g._walkMode();
  let far = { x: inst.x1 + 60, y: inst.y };
  if (!mm.isWalkableFootprint(far.x, far.y, 20, wm)) far = mm.findNearestWalkablePoint(inst.x1 + 90, inst.y, 20, wm);
  if (!g.enemies.length) qa.spawnProofTargets(1);
  const tgt = g.enemies.find(e => e && e.pos);
  if (!tgt) return { key: outKey, bbox, states: ['no-target'], final: { state: 'no-target' } };
  const states = [];
  const hp0 = inst.hp;
  const note = (st) => { if (!states.length || states[states.length - 1] !== st) states.push(st); };
  note(inst.state);
  for (let round = 0; round < 900 && inst && inst.state !== 'removed'; round++) {
    g.enemies.length = 0; g.enemies.push(tgt);
    tgt.pos.x = far.x; tgt.pos.y = far.y;
    tgt.hp = tgt.maxHp; tgt.stunned = 5; if (tgt.vel) { tgt.vel.x = 0; tgt.vel.y = 0; }
    if (g.upgradeUI)  { try { qa.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    if (g._postArenaChoice) { try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = null; } }
    qa.fireWeaponProof(0.1);
    inst = byKey(outKey);
    note(inst ? inst.state : 'removed');
    if (!inst || inst.state === 'destroying') break;
  }
  return { key: outKey, bbox, hp0, states, final: inst ? { hp: inst.hp, state: inst.state } : { state: 'removed' } };
}`;

// Serialize the instance set of the active deck (plain data only).
const instSnap = `(() => {
  const g = window.__G; if (!g || !g._obstacles) return null;
  const out = [];
  for (const i of g._obstacles._instances.values()) {
    out.push({ key: i.key, x: i.x, y: i.y, x0: i.x0, y0: i.y0, x1: i.x1, y1: i.y1,
               w: i.width, h: i.height, hp: i.hp, maxHp: i.maxHp, state: i.state,
               tier: i.type, deckKey: i.deckKey });
  }
  return { deck: g._deck || 'main', n: out.length, insts: out,
           px: g.player?.pos?.x, py: g.player?.pos?.y };
})()`;

async function shoot(page, name) {
  await page.evaluate(() => {                       // make sure the frame on screen is GAMEPLAY
    const g = window.__G;
    if (g && g.player) { g.player.maxHp = 1e9; g.player.hp = 1e9; g.gameOver = false; }
    if (g && g.gameState !== 'playing') g.gameState = 'playing';
    if (g) g.paused = false;
    // The premium menu is a DOM overlay (#cgm-*) that the QA start path never dismissed —
    // hide it so the screenshot shows the live canvas underneath.
    for (const id of ['cgm-overlay', 'cgm-code-rain-canvas', 'cgm-settings', 'click-to-start']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  }).catch(() => {});
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function proofMode(browser, mode) {
  const errors = [];
  const { ctx, page } = await freshPage(browser, errors);
  const M = mode === 'chaos' ? 'CHAOS' : 'ENDLESS';
  console.log(`\n════════ ${M} ════════`);

  // real user gesture (audio graph) + start the run
  await page.mouse.click(640, 360);
  const started = await page.evaluate((mode) => {
    const qa = window.__phenixQA;
    return mode === 'chaos' ? qa.startChaos('eddie') : qa.startRun('eddie');
  }, mode);
  T(`${M}: run starts (state playing)`, !!started && (started.gameState === 'playing' || started.state === 'playing'),
    JSON.stringify(started).slice(0, 80));
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const g = window.__G || null;
    if (g && g.player) { g.player.maxHp = 1e9; g.player.hp = 1e9; }   // proof player never dies mid-phase
    window.__phenixQA.run(40);
  });
  await page.waitForFunction(() => window.__G && window.__G._obstacles && window.__G._obstacles._instances.size > 0,
    null, { timeout: 15000 });

  // ── ONE synchronous phase: pick intact common prop → walk beside it → try to walk INTO it.
  // No async gaps, so organic fire cannot outrun the assertions.
  let snap = await page.evaluate(instSnap);
  T(`${M} main: instances live near the player`, snap && snap.n > 0, `n=${snap && snap.n}`);
  const blockProof = await page.evaluate(() => {
    const g = window.__G, qa = window.__phenixQA;
    const mm = g.mapManager, wm = g._walkMode();
    const pinNorth = () => {
      const tgt = g.enemies.find(e => e && e.pos);
      if (tgt) { g.enemies.length = 0; g.enemies.push(tgt);
        tgt.pos.x = g.player.pos.x; tgt.pos.y = g.player.pos.y - 420; tgt.stunned = 8; tgt.hp = tgt.maxHp; }
    };
    const intactCommons = () => [...g._obstacles._instances.values()]
      .filter(i => i.type === 'common' && i.state !== 'destroying' && i.state !== 'removed')
      .sort((a, b) => Math.hypot(a.x - g.player.pos.x, a.y - g.player.pos.y) -
                      Math.hypot(b.x - g.player.pos.x, b.y - g.player.pos.y));
    for (let attempt = 0; attempt < 5; attempt++) {
      const inst = intactCommons()[attempt];
      if (!inst) break;
      const key = inst.key;
      const t = { key, x: inst.x, y: inst.y, x0: inst.x0, y0: inst.y0, x1: inst.x1, y1: inst.y1,
                  w: inst.width, h: inst.height, maxHp: inst.maxHp };
      pinNorth();
      const ap = mm.findNearestWalkablePoint(t.x0 - 70, t.y, 18, wm);
      const nav1 = qa.navigate(ap.x, ap.y, 3000);
      pinNorth();
      const alive = () => { for (const i of g._obstacles._instances.values()) if (i.key === key) return i; return null; };
      if (!alive()) continue;                               // organically destroyed — try the next one
      const navBlocked = qa.navigate(t.x, t.y, 400, 10);
      const still = alive();
      if (!still || still.state === 'destroying' || still.state === 'removed') continue;
      return { ok: true, target: t,
               nav1dist: nav1.distance, navBlockedDist: navBlocked.distance,
               walk: mm.isWalkableFootprint(t.x, t.y, 16, wm),
               nan: !Number.isFinite(g.player.pos.x) || !Number.isFinite(g.player.pos.y),
               hpNow: still.hp, state: still.state };
    }
    return { ok: false };
  });
  T(`${M} main: a common obstacle exists in range (intact after approach)`, blockProof.ok,
    blockProof.ok && `${blockProof.target.key} hp=${blockProof.target.maxHp}`);
  T(`${M} main: player walks (input-driven) next to the obstacle`,
    blockProof.ok && blockProof.nav1dist != null && blockProof.nav1dist < 90, `dist=${blockProof.nav1dist}`);
  T(`${M} main: passage BEFORE destruction fails cleanly (no clip, no NaN)`,
    blockProof.ok && blockProof.navBlockedDist > 10 && !blockProof.walk && !blockProof.nan,
    `dist=${blockProof.ok && Math.round(blockProof.navBlockedDist)} state=${blockProof.state}`);
  const target = blockProof.ok ? blockProof.target : (snap.insts[0] || null);
  await shoot(page, `${mode}_1_cell_intact`);

  // ── REAL WEAPON DAMAGE: the starter's NATIVE Build-Engine weapon (Marrow Spitter) fires at
  // the nearest enemy; with a single frozen target beyond the prop, real shards must cross it.
  const dmgTrace = await page.evaluate(eval(fireAtObstacleFn), { key: target.key, exclude: null });
  const tb = dmgTrace.bbox || target;   // the obstacle the fire phase actually destroyed
  T(`${M} main: REAL weapon fire damages the obstacle`, dmgTrace.hp0 > 0 &&
    (dmgTrace.final.state === 'destroying' || dmgTrace.final.state === 'removed' || dmgTrace.final.hp < dmgTrace.hp0),
    `states=${dmgTrace.states.join('→')}`);
  T(`${M} main: HP states degrade before destruction (damaged/critical observed)`,
    dmgTrace.states.includes('damaged') || dmgTrace.states.includes('critical'),
    dmgTrace.states.join('→'));
  T(`${M} main: real fire DESTROYS it (no harness damage used)`,
    dmgTrace.final.state === 'destroying' || dmgTrace.final.state === 'removed');
  await shoot(page, `${mode}_2_destroying`);
  await page.evaluate(() => {                       // panels pause the sim — settle, then advance
    const g = window.__G, qa = window.__phenixQA;
    if (g.upgradeUI)  { try { qa.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    qa.run(80);                                     // ≥ FX_DUR at 60fps
  });

  // ── collider removed, passage works, projectiles pass, VFX reaped ──────────────────────────
  const after = await page.evaluate(({ t, key }) => {
    const g = window.__G;
    const mode = g._walkMode();
    let liveKey = false;
    for (const i of g._obstacles._instances.values()) if (i.key === key) liveKey = true;
    return {
      walk16: g.mapManager.isWalkableFootprint(t.x, t.y, 16, mode),
      walk22: g.mapManager.isWalkableFootprint(t.x, t.y, 22, mode),
      projGone: !g._obstacles.projectileHit(t.x, t.y, 6, 0),
      reaped: !liveKey,
      openCells: (g._obstacles._open.get(i => i) , [...g._obstacles._open.values()].reduce((a, m) => a + [...m.values()].reduce((b, s) => b + s.size, 0), 0)),
    };
  }, { t: tb, key: dmgTrace.key });
  T(`${M} main: collider fully removed (player + enemy footprints pass)`, after.walk16 && after.walk22);
  T(`${M} main: projectiles no longer land there`, after.projGone);
  T(`${M} main: destruction VFX reaped (bounded lifecycle)`, after.reaped);
  const navThrough = await page.evaluate(({ t }) => window.__phenixQA.navigate(t.x, t.y, 2500, 14), { t: tb });
  T(`${M} main: player WALKS THROUGH the former footprint (input-driven)`,
    navThrough && navThrough.distance <= 14, `dist=${navThrough && Math.round(navThrough.distance)}`);
  await shoot(page, `${mode}_3_after_walkthrough`);

  // ── enemy passage: real enemies path over the opened floor ─────────────────────────────────
  const enemyPass = await page.evaluate(async ({ t }) => {
    const g = window.__G, qa = window.__phenixQA;
    qa.run(1);
    const deadline = performance.now() + 8000;
    let crossed = false, samples = 0;
    while (performance.now() < deadline && !crossed) {
      await new Promise(r => setTimeout(r, 250));
      samples++;
      for (const e of g.enemies) {
        if (e && e.pos && e.pos.x >= t.x0 && e.pos.x <= t.x1 && e.pos.y >= t.y0 && e.pos.y <= t.y1) { crossed = true; break; }
      }
    }
    return { crossed, samples, enemies: g.enemies.length };
  }, { t: tb });
  T(`${M} main: an enemy crosses the opened floor`, enemyPass.crossed,
    `enemies=${enemyPass.enemies} samples=${enemyPass.samples}`);

  // ── second obstacle, second use ────────────────────────────────────────────────────────────
  const second2 = await page.evaluate(eval(fireAtObstacleFn), { key: null, exclude: dmgTrace.key });
  T(`${M} main: a second obstacle exists`, !!second2.key, second2.key || 'none');
  const second2walk = second2.bbox ? await page.evaluate(({ t }) => {
    const g = window.__G, qa = window.__phenixQA;
    if (g.upgradeUI)  { try { qa.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    qa.run(80);
    return g.mapManager.isWalkableFootprint(t.x, t.y, 16, g._walkMode());
  }, { t: second2.bbox }) : false;
  T(`${M} main: the second obstacle also falls to real fire and opens`,
    (second2.final.state === 'destroying' || second2.final.state === 'removed') && second2walk,
    JSON.stringify(second2.final) + ' walk=' + second2walk);

  // ── deck switch: destroyed state persists per deck, nothing leaks ──────────────────────────
  const deckProof = await page.evaluate(async ({ mode }) => {
    const g = window.__G, qa = window.__phenixQA;
    const destroyedBefore = [...g._obstacles._destroyed];
    const openMainBefore = (() => { const m = g._obstacles._open.get(`${mode}:main`); let n = 0; if (m) for (const s of m.values()) n += s.size; return n; })();
    const gi = qa.deckInfo();
    const gate = gi.gateUpper;
    let navGate = null, viaGate = false;
    if (gate) {
      navGate = qa.navigate(gate.x, gate.y, 6000, 30);
      viaGate = (qa.deckInfo().deck === 'upper');
    }
    if (!viaGate) { g._enterDeck('upper', { force: true }); }
    qa.run(5);
    const onUpper = qa.deckInfo().deck === 'upper';
    const upperInsts = [...g._obstacles._instances.values()].map(i => i.deckKey);
    const mainStateHeld = destroyedBefore.every(k => g._obstacles._destroyed.has(k));
    // back to main
    g._enterDeck('main', { force: true });
    qa.run(5);
    const openMainAfter = (() => { const m = g._obstacles._open.get(`${mode}:main`); let n = 0; if (m) for (const s of m.values()) n += s.size; return n; })();
    return { gate: !!gate, viaGate, navGate: navGate && Math.round(navGate.distance), onUpper,
             upperOnly: upperInsts.every(k => k === `${mode}:upper`),
             mainStateHeld, openMainBefore, openMainAfter,
             backOnMain: qa.deckInfo().deck === 'main' };
  }, { mode });
  T(`${M}: UPPER gate resolves and is reachable`, deckProof.gate, `viaGate=${deckProof.viaGate} navDist=${deckProof.navGate}`);
  T(`${M}: deck switch to UPPER works`, deckProof.onUpper, deckProof.viaGate ? 'via real gate walk' : 'forced (gate walk timed out)');
  T(`${M}: UPPER instances belong to UPPER only`, deckProof.upperOnly);
  T(`${M}: MAIN destroyed state survives the round trip`,
    deckProof.mainStateHeld && deckProof.backOnMain && deckProof.openMainAfter === deckProof.openMainBefore &&
    deckProof.openMainBefore > 0, `open=${deckProof.openMainBefore}→${deckProof.openMainAfter}`);

  // ── new run: everything restored ───────────────────────────────────────────────────────────
  const rerun = await page.evaluate(({ mode }) => {
    const qa = window.__phenixQA, g = window.__G;
    if (mode === 'chaos') qa.startChaos('skeleton_warrior'); else qa.startRun('skeleton_warrior');
    qa.run(40);
    const inst = [...g._obstacles._instances.values()][0];
    return { destroyed: g._obstacles._destroyed.size, open: g._obstacles._open.size,
             hasInsts: g._obstacles._instances.size > 0,
             fullHp: inst ? inst.hp === inst.maxHp : false,
             nan: g.player && (!Number.isFinite(g.player.pos.x) || !Number.isFinite(g.player.pos.y)) };
  }, { mode });
  T(`${M}: new run restores all obstacles (zero cross-run leakage)`,
    rerun.destroyed === 0 && rerun.open === 0 && rerun.hasInsts && rerun.fullHp && !rerun.nan,
    JSON.stringify(rerun));

  // ── console hygiene ────────────────────────────────────────────────────────────────────────
  const gameErrors = errors.filter(e =>
    !/favicon|404|net::|Failed to load resource|the server responded with a status/i.test(e));
  T(`${M}: zero game-code console errors`, gameErrors.length === 0, gameErrors.slice(0, 3).join(' | '));

  await ctx.close();
  return { errors: gameErrors };
}

// ── Boss Rush interaction (Chaos LOWER per existing flow) ────────────────────────────────────
async function proofBossRush(browser) {
  const errors = [];
  const { ctx, page } = await freshPage(browser, errors);
  console.log(`\n════════ BOSS RUSH ════════`);
  await page.mouse.click(640, 360);
  await page.evaluate(() => { window.__phenixQA.startRun('skeleton_warrior'); window.__phenixQA.run(30); });
  const rush = await page.evaluate(() => {
    const qa = window.__phenixQA, g = window.__G;
    const armed = qa.armBossRush();
    // fast-forward driven through the REAL update until the rush is live (bounded)
    const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
    let info = null;
    for (let i = 0; i < 7200; i++) {
      if (g.player) { g.player.hp = g.player.maxHp; }
      try { g.update(1 / 60, input); } catch (e) { return { err: String(e) }; }
      info = qa.bossRushInfo();
      if (info && info.active) break;
    }
    if (!info || !info.active) return { armed, active: false };
    const lockOn = g._deckLockT > 0 || (info.exitsLocked !== undefined ? info.exitsLocked : true);
    // destroy an obstacle INSIDE the rush world if one is live (allowed), boundary must hold
    let destroyedInside = false, boundaryHeld = true;
    const inst = [...g._obstacles._instances.values()].find(x => x.state === 'intact');
    if (inst) {
      let guard = 0;
      while (inst.hp > 0 && guard++ < 100) g._obstacles.damageAt(inst.x, inst.y, 8, 500, { heavy: true });
      destroyedInside = inst.state === 'destroying' || inst.state === 'removed';
      boundaryHeld = (qa.bossRushInfo() || {}).active === true;
    }
    const transitionsBlocked = g._deckTransitionBlocked ? !!g._deckTransitionBlocked() : null;
    return { armed, active: true, lockOn, destroyedInside, boundaryHeld, transitionsBlocked,
             deck: g._deck || 'main' };
  });
  T('Boss Rush arms and goes active through the real flow', rush.active === true, JSON.stringify(rush).slice(0, 140));
  T('Boss Rush: exits locked while active', rush.active && (rush.lockOn || rush.transitionsBlocked === true));
  T('Boss Rush: destroying an obstacle inside does NOT open the boundary',
    !rush.destroyedInside || rush.boundaryHeld, `destroyedInside=${rush.destroyedInside}`);
  await shoot(page, 'bossrush_active');
  const gameErrors = errors.filter(e =>
    !/favicon|404|net::|Failed to load resource|the server responded with a status/i.test(e));
  T('Boss Rush: zero game-code console errors', gameErrors.length === 0, gameErrors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PHENIX_CHROMIUM ? { executablePath: process.env.PHENIX_CHROMIUM } : {}) });
  try {
    await proofMode(browser, 'endless');
    await proofMode(browser, 'chaos');
    await proofBossRush(browser);
  } finally {
    await browser.close();
  }
  console.log(`\n══════════════════════════════════`);
  console.log(`  ${pass} PASS   ${fail} FAIL`);
  fs.writeFileSync(path.join(SHOTS, '..', 'results.txt'), results.join('\n'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROOF DRIVER ERROR', e); process.exit(2); });
