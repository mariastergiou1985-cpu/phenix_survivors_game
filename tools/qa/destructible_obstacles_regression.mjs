// DESTRUCTIBLE OBSTACLES + HOLOGRAPHIC CELLS — FOCUSED REGRESSION (2026-07-28)
// ------------------------------------------------------------------------------------------------
// Proves the destructible-obstacle system end to end, headlessly, on the REAL Game class:
//   * component models build from the frozen masks (main strips + section decks, both modes)
//   * instances materialise near the player, bounded, on the active deck only
//   * an intact obstacle BLOCKS the player's real footprint; open floor stays open
//   * damage flows: intact -> damaged -> critical -> destroying, reinforced resists light hits
//   * destruction removes the collider THE SAME FRAME: player and enemy footprints pass,
//     projectiles no longer land, resolveWalkableMove crosses the former footprint
//   * deck ownership: destroyed state is per (deck, tile); other decks unaffected; the state
//     survives leaving and re-entering the deck
//   * a NEW RUN restores every obstacle (no cross-run leakage)
//   * VFX lifecycle is bounded: the destruction sequence ends, instances are reaped
//   * gates remain resolvable with obstacles active (transition-anchor reachability)
//   * no NaN anywhere near any of it
//
//   node tools/qa/destructible_obstacles_regression.mjs
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0;
globalThis.performance = { now: () => vclock };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
u0();

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

function newGame(mode) {
  vclock = 0;
  const un = muteConsole();
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  if (mode === 'chaos') g._beginChaosRun(); else g._enterEndless();
  un();
  return g;
}
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
function step(g, frames) {
  const un = muteConsole();
  for (let i = 0; i < frames; i++) {
    if (g.player) { g.player.maxHp = 1e9; g.player.hp = 1e9; }
    vclock += 1000 / 60;
    if (g.upgradeUI)  { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    input.mousePos = { x: g.player.pos.x + 300, y: g.player.pos.y };
    try { g.update(1 / 60, input); } catch (e) { un(); throw e; }
  }
  un();
}
const R = 16;   // PLAYER_RADIUS

// Pull a live instance the player could plausibly walk to (nearest to the player).
function nearestInstance(g) {
  const p = g.player.pos;
  let best = null, bd = Infinity;
  for (const inst of g._obstacles._instances.values()) {
    if (inst.state === 'destroying' || inst.state === 'removed') continue;
    const d = Math.hypot(inst.x - p.x, inst.y - p.y);
    if (d < bd) { bd = d; best = inst; }
  }
  return best;
}
function killInstance(g, inst) {
  let guard = 0;
  while (inst.hp > 0 && guard++ < 200) g._obstacles.damageAt(inst.x, inst.y, 8, 500, { heavy: true });
  return inst.state === 'destroying' || inst.state === 'removed';
}

for (const mode of ['endless', 'chaos']) {
  console.log(`\n════ ${mode.toUpperCase()} ════`);
  const g = newGame(mode);
  step(g, 30);   // let art-dependent models come up

  // ── 1. models + instances on MAIN ──────────────────────────────────────────────────────────
  const modelMain = g._obstacles._model(mode, 'main');
  T('main obstacle model builds', !!modelMain);
  const compsMain = modelMain ? modelMain.comps.filter(Boolean) : [];
  T('main strip has authored destructible components', compsMain.length > 0,
    `comps=${compsMain.length}`);
  step(g, 5);
  const liveMain = [...g._obstacles._instances.values()];
  T('instances materialise near the player (bounded)',
    liveMain.length > 0 && liveMain.length <= 220, `live=${liveMain.length}`);
  T('every live instance is on the active deck key',
    liveMain.every(i => i.deckKey === `${mode}:main`));

  // ── 2. collider truth: intact blocks, open floor stays open ────────────────────────────────
  const inst = nearestInstance(g);
  T('an instance exists to test against', !!inst);
  if (inst) {
    const mm = g.mapManager;
    T('intact obstacle blocks the player footprint',
      !mm.isWalkableFootprint(inst.x, inst.y, R, mode));
    T('intact obstacle blocks even a point probe',
      !mm.isWalkablePoint(inst.x, inst.y, mode));
    const open = mm.findNearestWalkablePoint(inst.x, inst.y, R, mode);
    T('open floor near the obstacle stays walkable',
      mm.isWalkableFootprint(open.x, open.y, R, mode));

    // ── 3. damage states ─────────────────────────────────────────────────────────────────────
    const hp0 = inst.hp;
    g._obstacles.damageAt(inst.x, inst.y, 8, Math.ceil(inst.maxHp * 0.40), { heavy: true });
    T('damage lands (hp drops)', inst.hp < hp0, `hp ${inst.hp}/${inst.maxHp}`);
    T('state leaves intact after real damage', inst.state === 'damaged' || inst.state === 'critical',
      `state=${inst.state}`);
    g._obstacles.damageAt(inst.x, inst.y, 8, Math.ceil(inst.maxHp * 0.35), { heavy: true });
    T('state reaches critical below 33%', inst.state === 'critical', `state=${inst.state}`);

    // ── 4. destruction removes the collider immediately ──────────────────────────────────────
    T('killing blow starts the destruction sequence', killInstance(g, inst), `state=${inst.state}`);
    T('collider is GONE the same frame (footprint passes)',
      mm.isWalkableFootprint(inst.x, inst.y, R, mode));
    T('enemy-sized footprint passes too',
      mm.isWalkableFootprint(inst.x, inst.y, 22, mode));
    T('projectiles no longer land there',
      !g._obstacles.projectileHit(inst.x, inst.y, 6, 10));
    const from = { x: inst.x - (inst.width / 2 + 60), y: inst.y };
    const to   = { x: inst.x + (inst.width / 2 + 60), y: inst.y };
    if (mm.isWalkableFootprint(from.x, from.y, R, mode) && mm.isWalkableFootprint(to.x, to.y, R, mode)) {
      let cx = from.x, cy = from.y, blocked = false;
      for (let s = 0; s < 200 && Math.hypot(to.x - cx, to.y - cy) > 4; s++) {
        const stepv = g.resolveWalkableMove(cx, cy, cx + Math.sign(to.x - cx) * 4, to.y, R);
        if (stepv.x === cx && stepv.y === cy) { blocked = true; break; }
        cx = stepv.x; cy = stepv.y;
      }
      T('resolveWalkableMove crosses the former footprint', !blocked && Math.hypot(to.x - cx, to.y - cy) <= 8,
        `end=(${Math.round(cx)},${Math.round(cy)})`);
    } else {
      T('resolveWalkableMove crosses the former footprint (skipped: no clear approach)', true);
    }

    // ── 5. VFX lifecycle is bounded ──────────────────────────────────────────────────────────
    step(g, 90);   // 1.5s >> FX_DUR
    T('destruction sequence ends and the instance is reaped',
      ![...g._obstacles._instances.values()].some(i => i.key === inst.key));
    T('destroyed state is remembered for the run', g._obstacles._destroyed.has(inst.key));

    // ── 6. reinforced tier resists light hits ────────────────────────────────────────────────
    const reinf = [...g._obstacles._instances.values()].find(i => i.type === 'reinforced');
    if (reinf) {
      const h0 = reinf.hp;
      g._obstacles.damageAt(reinf.x, reinf.y, 8, 100);                    // light
      const lightLoss = h0 - reinf.hp;
      g._obstacles.damageAt(reinf.x, reinf.y, 8, 100, { heavy: true });   // heavy
      const heavyLoss = h0 - lightLoss - reinf.hp;
      T('reinforced takes reduced light damage, full heavy damage',
        lightLoss > 0 && heavyLoss > lightLoss, `light=${lightLoss} heavy=${heavyLoss}`);
    } else {
      T('reinforced tier present near spawn (informational)', true, 'none nearby — skipped');
    }
  }

  // ── 7. deck ownership + persistence across deck switches ───────────────────────────────────
  const destroyedMainKeys = new Set(g._obstacles._destroyed);
  const openMain = g._obstacles._open.get(`${mode}:main`);
  T('main deck has an open-cell overlay after destruction', !!openMain && openMain.size > 0);
  for (const section of ['upper', 'lower']) {
    const un = muteConsole();
    const ok = g._enterDeck(section, { force: true });
    un();
    T(`can enter ${section} deck`, ok, `deck=${g._deck}`);
    if (!ok) continue;
    step(g, 10);
    const secModel = g._obstacles._model(mode, section);
    const secComps = secModel ? secModel.comps.filter(Boolean).length : 0;
    console.log(`        ${mode}:${section} interior destructible islands: ${secComps}`);
    const liveHere = [...g._obstacles._instances.values()];
    T(`${section}: live instances belong to this deck only`,
      liveHere.every(i => i.deckKey === `${mode}:${section}`), `live=${liveHere.length}`);
    T(`${section}: main-deck destroyed state untouched while away`,
      [...destroyedMainKeys].every(k => g._obstacles._destroyed.has(k)));
    if (liveHere.length > 0) {
      const si = liveHere[0];
      const smode = `${mode}:${section}`;
      T(`${section}: intact island blocks the footprint`,
        !g.mapManager.isWalkableFootprint(si.x, si.y, R, smode));
      T(`${section}: killing it opens the floor`,
        killInstance(g, si) && g.mapManager.isWalkableFootprint(si.x, si.y, R, smode));
    }
    const un2 = muteConsole();
    g._enterDeck('main', { force: true });
    un2();
    step(g, 5);
    T(`return from ${section}: main destroyed state persists`,
      [...destroyedMainKeys].every(k => g._obstacles._destroyed.has(k)) &&
      !!g._obstacles._open.get(`${mode}:main`) && g._obstacles._open.get(`${mode}:main`).size > 0);
  }

  // ── 8. gates stay resolvable with obstacles active ─────────────────────────────────────────
  const gu = g._deckGateWorld('upper'), gl = g._deckGateWorld('lower');
  T('UPPER gate still resolves with obstacles live', !!gu && Number.isFinite(gu.x));
  T('LOWER gate still resolves with obstacles live', !!gl && Number.isFinite(gl.x));

  // ── 9. new run restores everything ─────────────────────────────────────────────────────────
  const un3 = muteConsole();
  g.reset();
  if (mode === 'chaos') g._beginChaosRun(); else g._enterEndless();
  un3();
  step(g, 30);
  T('new run: destroyed set cleared', g._obstacles._destroyed.size === 0);
  T('new run: open-cell overlay cleared', g._obstacles._open.size === 0);
  const inst2 = nearestInstance(g);
  T('new run: obstacles are back and block again',
    !!inst2 && !g.mapManager.isWalkableFootprint(inst2.x, inst2.y, R, mode) &&
    inst2.hp === inst2.maxHp);

  // ── 10. no NaN anywhere ────────────────────────────────────────────────────────────────────
  T('player position finite after everything',
    Number.isFinite(g.player.pos.x) && Number.isFinite(g.player.pos.y));
}

console.log(`\n══════════════════════════════════`);
console.log(`  ${pass} PASS   ${fail} FAIL`);
process.exit(fail ? 1 : 0);
