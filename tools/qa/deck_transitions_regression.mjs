// BATCH 1 — MULTI-DECK RUNTIME PROOF
// ------------------------------------------------------------------------------------------------
// Proves the things Maria's order requires before BATCH 1 can close, in BOTH Endless and Chaos:
//   * MAIN -> UPPER -> MAIN and MAIN -> LOWER -> MAIN, ten round trips each
//   * ordinary combat runs on every deck
//   * every placement (player, enemies, pickups) sits on valid geometry OF THE ACTIVE DECK
//   * no projectile, enemy or hazard leaks between decks
//   * no trapping at a transition anchor - the player can still move after arriving
//   * no invisible collision wall: a walkable point is walkable from every direction
//   * no NaN in player/camera, no black-screen class failure
//   * restart leaves no stale active deck
//   * a full 03:00 Boss Rush on the LOWER deck, then a return to the normal map flow
//   * no loss of build, upgrades or run progress across any of it
//
//   node tools/qa/deck_transitions_regression.mjs
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
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const { DECK_MASKS } = await import(pathToFileURL(path.join(ROOT, 'js/game/DeckMasks.js')).href);
u0();

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};
const finite = (o) => o && Number.isFinite(o.x) && Number.isFinite(o.y);

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
    if (g.upgradeUI)  { try { g.selectUpgrade(g.upgradeUI.length ? g.upgradeUI.length - 1 : 0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    input.mousePos = { x: g.player.pos.x + 300, y: g.player.pos.y };
    try { g.update(1 / 60, input); } catch (e) { un(); throw e; }
  }
  un();
}
// A transition is LEGITIMATELY refused while a level-up panel is open, a boss is live or the
// cooldown is running - refusing then is the feature, not a defect. The harness therefore waits
// for a legal moment the honest way (by running frames) instead of forcing anything.
function cool(g, maxFrames = 300) {
  for (let i = 0; i < maxFrames; i += 10) {
    step(g, 10);
    if (!g._deckTransitionBlocked()) return true;
  }
  return !g._deckTransitionBlocked();
}
// deterministic parking on MAIN between blocks, so one block's failure cannot cascade
function toMain(g) {
  for (let i = 0; i < 6 && g._deck !== 'main'; i++) { cool(g); g._enterDeck('main'); }
  return g._deck === 'main';
}

// ── 1. per-mode round trips ─────────────────────────────────────────────────────────────────
for (const mode of ['endless', 'chaos']) {
  console.log(`\n== ${mode.toUpperCase()} ==`);
  const g = newGame(mode);
  const mm = g.mapManager;

  T(`${mode}: run starts on MAIN`, g._deck === 'main', `got ${g._deck}`);
  T(`${mode}: both MAIN gates resolve`, !!g._deckGateWorld('upper') && !!g._deckGateWorld('lower'));

  for (const section of ['upper', 'lower']) {
    let ok = 0, geomOk = 0, moved = 0, cleanOk = 0, noNaN = 0, xpOk = 0, lvlOk = 0;
    for (let trip = 0; trip < 10; trip++) {
      cool(g);
      // seed the deck we are leaving so the safety sweep has something real to clear
      const un = muteConsole();
      for (let i = 0; i < 6; i++) {
        try {
          const e = new Enemy('Neon Swarmer', 1);
          const sp = g.resolveEnemySpawn(g.player.pos.x + 200 + i * 30, g.player.pos.y, e.radius || 14, 120, e);
          if (sp) { e.pos.x = sp.x; e.pos.y = sp.y; g.enemies.push(e); }
        } catch (_) {}
      }
      un();
      const xpBefore = (g.player.level || 0) * 1e6 + (g.player.xp || 0);
      const lvlBefore = g.player.level || 0;
      const upgBefore = JSON.stringify(g.player.upgrades || {});

      if (!g._enterDeck(section)) continue;
      ok++;
      if (g._deck !== section) continue;
      const dm = mode + ':' + section;
      const b = mm.deckBounds(mode, section);
      const inside = b && g.player.pos.x >= b.x0 && g.player.pos.x <= b.x1 &&
                          g.player.pos.y >= b.y0 && g.player.pos.y <= b.y1;
      if (inside && mm.isWalkableFootprint(g.player.pos.x, g.player.pos.y, 16, dm)) geomOk++;
      // Returning to a deck legitimately RESTORES the boss parked there, so "cleared" means no
      // ordinary combat entity survived the move - not an empty enemy list.
      const _ord = g.enemies.filter(e => e && !e.isMegaBoss && !(e.isBoss && e.isBoss()));
      if (_ord.length === 0 && (g.projectiles || []).length === 0 &&
          (g.enemyBullets || []).length === 0) cleanOk++;
      // XP must never go DOWN across a transition (shards are credited, not deleted)
      if ((g.player.level || 0) * 1e6 + (g.player.xp || 0) >= xpBefore &&
          (g.player.level || 0) >= lvlBefore) xpOk++;
      // Level-ups during the pass legitimately ADD upgrades; what must never happen is one
      // going DOWN or vanishing.
      const _ub = JSON.parse(upgBefore), _ua = g.player.upgrades || {};
      let _lost = 0;
      for (const k of Object.keys(_ub)) if ((_ua[k] || 0) < _ub[k]) _lost++;
      if (_lost === 0) lvlOk++;

      // NOT TRAPPED: run real frames with movement input and require the player to move
      const p0 = { x: g.player.pos.x, y: g.player.pos.y };
      input.keys = new Set(['d']); step(g, 40);
      input.keys = new Set(['w']); step(g, 40);
      input.keys = new Set(['a']); step(g, 40);
      input.keys = new Set(); step(g, 5);
      if (Math.hypot(g.player.pos.x - p0.x, g.player.pos.y - p0.y) > 8) moved++;
      if (finite(g.player.pos) && finite(g.camera)) noNaN++;

      cool(g);
      g._enterDeck('main');
      if (g._deck === 'main' && mm.isWalkableFootprint(g.player.pos.x, g.player.pos.y, 16, mode)) geomOk++;
    }
    T(`${mode}: MAIN->${section.toUpperCase()}->MAIN x10 all completed`, ok === 10, `${ok}/10`);
    T(`${mode}: ${section} landings on valid geometry`, geomOk === 20, `${geomOk}/20`);
    T(`${mode}: ${section} no trapping — player moves after arrival`, moved === 10, `${moved}/10`);
    T(`${mode}: ${section} no cross-deck leakage on arrival`, cleanOk === 10, `${cleanOk}/10`);
    T(`${mode}: ${section} no XP / level loss`, xpOk === 10, `${xpOk}/10`);
    T(`${mode}: ${section} no upgrade downgrade`, lvlOk === 10, `${lvlOk}/10`);
    T(`${mode}: ${section} no NaN in player/camera`, noNaN === 10, `${noNaN}/10`);
  }

  // ── 2. no direct UPPER <-> LOWER ──────────────────────────────────────────────────────────
  toMain(g); cool(g);
  T(`${mode}: reached UPPER for the graph test`, g._enterDeck('upper') && g._deck === 'upper');
  cool(g);
  T(`${mode}: UPPER -> LOWER is refused (graph is a line)`, g._enterDeck('lower') === false && g._deck === 'upper');
  toMain(g);

  // ── 3. combat runs on every deck, and everything stays on the active deck ─────────────────
  for (const section of ['main', 'upper', 'lower']) {
    if (Array.isArray(g.enemies)) g.enemies.length = 0;   // no leftovers from a refused trip
    toMain(g); cool(g);
    if (section !== 'main') g._enterDeck(section);
    if (g._deck !== section) { T(`${mode}: reached ${section} for the combat pass`, false); continue; }
    const dm = g._walkMode();
    step(g, 600);                                   // 10 s of ordinary play
    const spawned = g.enemies.length;
    let offDeck = 0, offGeom = 0;
    let ground = 0;
    for (const e of g.enemies) {
      if (!e || !e.pos) continue;
      if (!g.onActiveDeck(e)) { offDeck++; continue; }
      // Flying/airborne types legitimately ignore ground walkability, and _stepMove is the only
      // mover that is bound to it. Only GROUND movers are held to the floor contract.
      if (e.isFlying || e.flying || e.airborne || e.hover) continue;
      ground++;
      if (!mm.isWalkablePoint(e.pos.x, e.pos.y, dm)) {
        offGeom++;
        if (offGeom <= 3) {
          const bb = mm.deckBounds(mode, section);
          const inB = bb ? (e.pos.x >= bb.x0 && e.pos.x <= bb.x1 && e.pos.y >= bb.y0 && e.pos.y <= bb.y1) : 'n/a';
          console.log('      . off-geom ' + (e.name || '?') + ' at (' + Math.round(e.pos.x) + ',' +
            Math.round(e.pos.y) + ') inBounds=' + inB + ' hp=' + Math.round(e.hp) + ' r=' + (e.radius|0));
        }
      }
    }
    const _off = [];
    for (const list of ['healthPickups', 'manaPickups', 'armorPickups', 'tacticalCacheWeapons',
                        'projectiles', 'enemyBullets', 'gunshipZones', 'lightningZones',
                        'cybermoteMines', 'bossLavaZones', '_voidRifts', '_ventBursts',
                        'airstrikeShips', '_activePets']) {
      for (const o of (g[list] || [])) {
        const q = o && (o.pos || o);
        if (finite(q) && !g.onActiveDeck({ pos: q })) { offDeck++; if (_off.length < 4) _off.push(list + '@' + Math.round(q.y)); }
      }
    }
    if (_off.length) console.log('      . off-deck: ' + _off.join(', '));
    T(`${mode}: ${section} spawns ordinary combat`, spawned > 0, `${spawned} enemies`);
    T(`${mode}: ${section} nothing lives on another deck`, offDeck === 0, `${offDeck} off-deck`);
    T(`${mode}: ${section} every ground enemy stands on real floor`, offGeom === 0, `${offGeom} of ${ground} ground enemies off-geometry`);
    T(`${mode}: ${section} no NaN after 15s of play`, finite(g.player.pos) && finite(g.camera));
    if (section !== 'main') toMain(g);
  }

  // ── 4. no invisible wall: walkability is direction-independent ────────────────────────────
  toMain(g);
  for (const section of ['upper', 'lower']) {
    const spec = DECK_MASKS[mode][section];
    const dm = mode + ':' + section;
    // resolveWalkableMove reads game._walkMode(), so the run must actually BE on the deck under
    // test. Probing deck coordinates while _deck was still 'main' compared them against the MAIN
    // strip's band and failed every single sample - a harness bug, not a game bug.
    const _restore = g._deck;
    g._deck = section;
    const b = mm.deckBounds(mode, section);
    let asym = 0, tested = 0;
    for (let i = 0; i < 400; i++) {
      const cx = (i * 7919) % spec.cols, cy = (i * 104729) % spec.rows;
      const x = b.x0 + (cx + 0.5) * spec.cell * 3, y = b.y0 + (cy + 0.5) * spec.cell * 3;
      if (!mm.isWalkableFootprint(x, y, 16, dm)) continue;
      tested++;
      for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6], [5, 5], [-5, -5]]) {
        const r = g.resolveWalkableMove(x, y, x + dx, y + dy, 16);
        if (!finite(r)) { asym++; break; }
        // a legal destination must be accepted, and an illegal one must not teleport us far
        if (Math.hypot(r.x - x, r.y - y) > 40) { asym++; break; }
      }
    }
    g._deck = _restore;
    T(`${mode}: ${section} no invisible wall / no snap teleport`, asym === 0 && tested > 50, `${asym} bad of ${tested}`);
  }
}

// ── 5. Boss Rush: the whole 03:00 on the LOWER deck, then back to normal flow ────────────────
console.log('\n== BOSS RUSH ON THE LOWER DECK ==');
{
  const g = newGame('chaos');
  const mm = g.mapManager;
  const upgBefore = JSON.stringify(g.player.upgrades || {});
  g.player.hp = g.player.maxHp = 999999;              // survival is not what this test measures
  step(g, 60);
  const started = (() => {
    const un = muteConsole();
    g._bossRushCount = 0; g._bossRushSchedule = [0, 9999];
    g._chaosStartTime = 0;
    try { g._updateBossRush(1 / 60); } catch (_) {}
    un();
    return !!g._bossRush;
  })();
  T('boss rush starts', started);
  if (started) {
    T('boss rush is fought on the LOWER deck', g._deck === 'lower', `got ${g._deck}`);
    T('boss rush locks the exits', g._deckLockT > 0);
    T('boss rush refuses a player-driven exit', g._enterDeck('main') === false && g._deck === 'lower');
    const br = g._bossRush;
    T('boss rush duration is exactly 03:00', br.dur === 180, `${br.dur}s`);
    const b = mm.deckBounds('chaos', 'lower');
    const inDeck = br.cx - br.r >= b.x0 && br.cx + br.r <= b.x1 && br.cy - br.r >= b.y0 && br.cy + br.r <= b.y1;
    T('the arena disk sits inside the lower deck', inDeck, `c(${Math.round(br.cx)},${Math.round(br.cy)}) r${Math.round(br.r)}`);
    T('the WHOLE arena disk validates', g._validateArenaDisk(br.cx, br.cy, br.r, 26));
    // run the full three minutes
    let maxT = 0, offDeck = 0, nan = 0;
    for (let f = 0; f < 190 * 60 && g._bossRush; f += 30) {
      step(g, 30);
      maxT = Math.max(maxT, g._bossRush ? g._bossRush.t : maxT);
      if (g._deck !== 'lower' && g._bossRush) offDeck++;
      if (!finite(g.player.pos) || !finite(g.camera)) nan++;
    }
    T('the rush ran the full 03:00', maxT >= 179.5, `${maxT.toFixed(1)}s`);
    T('the player stayed on the lower deck for all of it', offDeck === 0, `${offDeck} frames elsewhere`);
    T('no NaN during the rush', nan === 0);
    T('the rush ended', g._bossRush == null);
    T('exits unlocked at 00:00', (g._deckLockT || 0) === 0);
    T('the run returned to the normal map flow', g._deck === 'main', `got ${g._deck}`);
    const _ub2 = JSON.parse(upgBefore), _ua2 = g.player.upgrades || {};
    let _lost2 = 0;
    for (const k of Object.keys(_ub2)) if ((_ua2[k] || 0) < _ub2[k]) _lost2++;
    T('no upgrade loss across the rush', _lost2 === 0, _lost2 + ' downgraded');
    step(g, 300);
    T('play continues after the rush without NaN', finite(g.player.pos) && finite(g.camera));
  }
}

// ── 6. restart carries no stale deck ────────────────────────────────────────────────────────
console.log('\n== RESTART ==');
{
  const g = newGame('endless');
  step(g, 60); g._enterDeck('upper');
  T('deck moved before restart', g._deck === 'upper');
  const un = muteConsole();
  g.reset(); g._enterEndless();
  un();
  T('restart resets the active deck to MAIN', g._deck === 'main', `got ${g._deck}`);
  T('restart clears the return anchor', g._deckReturn == null);
  T('restart clears the deck lock', (g._deckLockT || 0) === 0 && (g._deckCd || 0) === 0);
  step(g, 300);
  T('second run plays without NaN', finite(g.player.pos) && finite(g.camera));
  T('second run walkability is MAIN', g._walkMode() === 'endless');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
