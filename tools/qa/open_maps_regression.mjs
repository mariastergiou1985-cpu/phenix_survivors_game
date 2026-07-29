// OPEN SURVIVOR MAPS — DECORATIVE ART ONLY — CORNER ELEVATORS — ZERO INTERNAL COLLISION
// ------------------------------------------------------------------------------------------------
// Maria's decision, 2026-07-28: every deck is fully walkable across its real floor. The map art
// stays visible but is decoration - machines, kiosks, robots, fountains, pillars, bases, fences,
// planters, plants and every other painted object let the player, enemies, projectiles, pets and
// pickups straight through. The ONLY things allowed to block are the outer edge of the authored
// deck and, while it is running, the Boss Rush arena boundary.
//
// This file is the standing guard on that decision. It replaces the destructible-obstacle
// regression, which asserted the opposite and was deleted with the feature.
//
//   node tools/qa/open_maps_regression.mjs
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0; globalThis.performance = { now: () => vclock };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const { MapManager } = await import(pathToFileURL(path.join(ROOT, 'js/game/MapManager.js')).href);
const DM = await import(pathToFileURL(path.join(ROOT, 'js/game/DeckMasks.js')).href);
u0();

let pass = 0, fail = 0;
const T = (n, c, x = '') => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x ? '  — ' + x : '')); } };
const finite = o => o && Number.isFinite(o.x) && Number.isFinite(o.y);

console.log('\n── 1. THE OBSTACLE FEATURE IS GONE FROM PRODUCTION ──');
const SRC = ['js/game/Game.js', 'js/game/MapManager.js', 'js/game/BuildEngine.js', 'js/main.js', 'js/game/DeckMasks.js'];
const BANNED = /_obstacles|_destructibles|DestructibleObstacles|isOpenMain|isOpenSection|setDestructibles|MAIN_OBSTACLES|mainObstacleBits/;
for (const f of SRC) {
  const hits = readFileSync(path.join(ROOT, f), 'utf8').split('\n')
    .map((l, i) => BANNED.test(l) ? (i + 1) + ':' + l.trim().slice(0, 60) : null).filter(Boolean);
  T(`${f} carries no obstacle system`, hits.length === 0, hits.slice(0, 2).join(' | '));
}
T('DestructibleObstacles.js is not in the tree', !existsSync(path.join(ROOT, 'js/game/DestructibleObstacles.js')));
T('the obstacle regression that required collision is gone',
  !existsSync(path.join(ROOT, 'tools/qa/destructible_obstacles_regression.mjs')));

console.log('\n── 2. NO INTERNAL COLLISION DATA ANYWHERE ──');
T('DeckMasks exports no obstacle mask', DM.MAIN_OBSTACLES === undefined && DM.mainObstacleBits === undefined);
const un0 = muteConsole();
const mm = new MapManager({});
mm._cityImg = { complete: true, naturalWidth: 1672, naturalHeight: 519 };
mm._chaosDeckImg = { complete: true, naturalWidth: 1672, naturalHeight: 440 };
un0();
T('endless main has no authored block columns', (mm.CITY_BLOCK_COLS || []).length === 0);
T('chaos main has no authored block columns', (mm.CHAOS_BLOCK_COLS || []).length === 0);
for (const [mode, r0, r1] of [['endless', 210, 415], ['chaos', 135, 410]]) {
  const S = mm.CITY_SCALE;
  let blocked = 0, total = 0;
  for (let sx = 0; sx < 1672; sx += 4) for (let sy = r0 + 2; sy <= r1 - 2; sy += 4) {
    total++; if (!mm.isWalkablePoint(sx * S, sy * S, mode)) blocked++;
  }
  T(`${mode} main band is 100% walkable inside the rows`, blocked === 0, `${blocked} of ${total} blocked`);
}
// Every section deck: no blocked region may be enclosed by floor. Flood the blocked cells from the
// rectangle border; anything blocked that the flood cannot reach is an interior island.
for (const mode of ['endless', 'chaos']) for (const sec of ['upper', 'lower']) {
  const spec = DM.DECK_MASKS[mode][sec], bits = DM.deckMaskBits(mode, sec);
  const C = spec.cols, R = spec.rows;
  const at = (c, r) => bits[r * C + c] === 1;
  const seen = new Uint8Array(C * R);
  const q = [];
  for (let c = 0; c < C; c++) { for (const r of [0, R - 1]) if (!at(c, r) && !seen[r * C + c]) { seen[r * C + c] = 1; q.push([c, r]); } }
  for (let r = 0; r < R; r++) { for (const c of [0, C - 1]) if (!at(c, r) && !seen[r * C + c]) { seen[r * C + c] = 1; q.push([c, r]); } }
  for (let h = 0; h < q.length; h++) {
    const [c, r] = q[h];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= C || nr >= R) continue;
      if (at(nc, nr) || seen[nr * C + nc]) continue;
      seen[nr * C + nc] = 1; q.push([nc, nr]);
    }
  }
  let islands = 0;
  for (let i = 0; i < C * R; i++) if (bits[i] !== 1 && !seen[i]) islands++;
  T(`${mode}/${sec} has no blocked island enclosed by floor`, islands === 0, `${islands} interior blocked cells`);
}

console.log('\n── 3. ELEVATORS SIT IN CORNERS, NOT THE CENTRE ──');
const frac = (v, a, b) => (v - a) / (b - a);
for (const mode of ['endless', 'chaos']) {
  const g = { _chaosMode: mode === 'chaos', endless: mode === 'endless', mapManager: mm, player: { pos: { x: 0, y: 0 } } };
  const gate = Game.prototype._deckGateWorld.bind(g);
  const rows = mode === 'chaos' ? mm.CHAOS_WALK_ROWS : mm.CITY_WALK_ROWS;
  const y0 = rows[0] * mm.CITY_SCALE, y1 = rows[1] * mm.CITY_SCALE;
  const u = gate('upper'), l = gate('lower');
  const uy = frac(u.y, y0, y1), ly = frac(l.y, y0, y1);
  console.log(`  ${mode} main: upper elevator at ${(100 * uy).toFixed(0)}% of the band, lower at ${(100 * ly).toFixed(0)}%`);
  T(`${mode} upper elevator is in the TOP part of the band`, uy < 0.35, `${(100 * uy).toFixed(0)}%`);
  T(`${mode} lower elevator is in the BOTTOM part of the band`, ly > 0.65, `${(100 * ly).toFixed(0)}%`);
  T(`${mode} the two main elevators are far apart`, Math.abs(uy - ly) > 0.45);
  T(`${mode} neither main elevator sits on the band centre line`, Math.abs(uy - 0.5) > 0.15 && Math.abs(ly - 0.5) > 0.15);
  for (const sec of ['upper', 'lower']) {
    const a = mm.deckAnchorWorld(mode, sec), b = mm.deckBounds(mode, sec);
    const fx = frac(a.x, b.x0, b.x1), fy = frac(a.y, b.y0, b.y1);
    const meta = mm.deckAnchorMeta()[mode + ':' + sec];
    console.log(`  ${mode}/${sec} return elevator at (${(100 * fx).toFixed(0)}%, ${(100 * fy).toFixed(0)}%) -> ${meta.corner}`);
    T(`${mode}/${sec} return elevator is not in the middle of the deck`,
      Math.hypot(fx - 0.5, fy - 0.5) > 0.28, `(${(100 * fx).toFixed(0)}%, ${(100 * fy).toFixed(0)}%)`);
    T(`${mode}/${sec} return elevator resolved to a real corner, not the fallback`, meta.fallback === false);
    T(`${mode}/${sec} return elevator stands on floor with player clearance`,
      mm.isWalkableFootprint(a.x, a.y, 16, mode + ':' + sec));
  }
}

console.log('\n── 4. EVERYTHING PASSES THROUGH THE ART ──');
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
function newGame(mode) {
  vclock = 0; const un = muteConsole();
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  if (mode === 'chaos') g._beginChaosRun(); else g._enterEndless();
  un(); return g;
}
function step(g, n) {
  const un = muteConsole();
  for (let i = 0; i < n; i++) {
    vclock += 1000 / 60;
    if (g.player) { g.player.hp = g.player.maxHp; g.gameOver = false; }
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    if (g._postArenaChoice) { try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = null; } }
    try { g.update(1 / 60, input); } catch (_) { break; }
  }
  un();
}
for (const mode of ['endless', 'chaos']) {
  const g = newGame(mode);
  const wm = g._walkMode();
  // a straight line right across a full tile must be walkable end to end
  const y = g.player.pos.y;
  let blocked = 0, n = 0;
  for (let x = g.player.pos.x - 2400; x <= g.player.pos.x + 2400; x += 24) {
    n++; if (!g.mapManager.isWalkableFootprint(x, y, 16, wm)) blocked++;
  }
  T(`${mode}: a 4800px straight line across the main deck is unobstructed`, blocked === 0, `${blocked} of ${n} blocked`);
  // the resolver never refuses an input-driven step
  let refused = 0;
  for (let i = 0; i < 400; i++) {
    const a = (i / 400) * Math.PI * 2, R = 40;
    const px = g.player.pos.x + Math.cos(a) * 900, py = y;
    const r = g.resolveWalkableMove(px, py, px + Math.cos(a) * R, py + Math.sin(a) * R, 16);
    if (!finite(r)) refused++;
  }
  T(`${mode}: the movement resolver always returns a finite position`, refused === 0, `${refused} bad`);
  step(g, 600);
  let offFloor = 0, ground = 0;
  for (const e of g.enemies) {
    if (!e || !e.pos || e.isFlying || e.flying) continue;
    ground++; if (!g.mapManager.isWalkablePoint(e.pos.x, e.pos.y, g._walkMode())) offFloor++;
  }
  T(`${mode}: every ground enemy stands on legal floor after 10s`, offFloor === 0, `${offFloor} of ${ground}`);
  T(`${mode}: no NaN after 10s of play`, finite(g.player.pos) && finite(g.camera));
  // pickups and hazards are placeable anywhere on the band
  let bad = 0;
  for (let i = 0; i < 200; i++) {
    const p = g.mapManager.findSafeSpawnPoint({ x: g.player.pos.x + (i - 100) * 37, y, radius: 18, mode: g._walkMode() });
    if (!p || !g.mapManager.isWalkableFootprint(p.x, p.y, 18, g._walkMode())) bad++;
  }
  T(`${mode}: 200 pickup placements all land on floor`, bad === 0, `${bad} bad`);
}

console.log('\n── 5. THE ONLY TEMPORARY BOUNDARY IS BOSS RUSH ──');
{
  const g = newGame('chaos');
  g.player.hp = g.player.maxHp = 1e9;
  step(g, 60);
  const un = muteConsole();
  g._bossRushCount = 0; g._bossRushSchedule = [0, 999999]; g._chaosStartTime = 0;
  try { g._updateBossRush(1 / 60); } catch (_) {}
  un();
  T('boss rush starts and takes the run to the lower deck', !!g._bossRush && g._deck === 'lower', `deck=${g._deck}`);
  T('boss rush locks the exits while it runs', g._enterDeck('main') === false && g._deck === 'lower');
  const br = g._bossRush;
  const b = g.mapManager.deckBounds('chaos', 'lower');
  T('the arena disk is inside the lower deck',
    br && br.cx - br.r >= b.x0 && br.cx + br.r <= b.x1 && br.cy - br.r >= b.y0 && br.cy + br.r <= b.y1);
  for (let f = 0; f < 190 * 60 && g._bossRush; f += 60) step(g, 60);
  T('boss rush ends and unlocks', g._bossRush == null && (g._deckLockT || 0) === 0);
  T('the run returns to the main deck', g._deck === 'main', `deck=${g._deck}`);
  // no leftover boundary: the whole band is walkable again
  let stuck = 0;
  for (let i = 0; i < 300; i++) {
    const x = g.player.pos.x + (i - 150) * 40;
    if (!g.mapManager.isWalkableFootprint(x, g.player.pos.y, 16, g._walkMode())) stuck++;
  }
  T('no invisible wall survives the boss rush', stuck === 0, `${stuck} blocked samples`);
  T('no NaN after the boss rush', finite(g.player.pos) && finite(g.camera));
}

console.log('\n── 6. A BOSS RUSH THAT FIRES ON A SECTION DECK DOES NOT TRAP THE PLAYER ──');
{
  const g = newGame('chaos');
  g.player.hp = g.player.maxHp = 1e9;
  step(g, 200);
  for (let i = 0; i < 8 && g._deck !== 'upper'; i++) { step(g, 200); g._enterDeck('upper'); }
  if (g._deck !== 'upper') { T('reached the upper deck for the trap test', false); }
  else {
    const un = muteConsole();
    g._bossRushCount = 0; g._bossRushSchedule = [0, 999999]; g._chaosStartTime = 0;
    try { g._updateBossRush(1 / 60); } catch (_) {}
    un();
    T('a rush starting on the UPPER deck still moves the run to the lower deck',
      !!g._bossRush && g._deck === 'lower', `deck=${g._deck}`);
    for (let f = 0; f < 190 * 60 && g._bossRush; f += 60) step(g, 60);
    T('and it still returns to the main deck afterwards', g._deck === 'main', `deck=${g._deck}`);
  }
}

console.log('\n── 7. SECOND RUN ──');
{
  const g = newGame('endless');
  step(g, 120); g._enterDeck('upper');
  const un = muteConsole(); g.reset(); g._enterEndless(); un();
  T('a second run starts on the main deck', g._deck === 'main', `deck=${g._deck}`);
  T('a second run carries no deck lock or return anchor', g._deckReturn == null && (g._deckLockT || 0) === 0);
  step(g, 300);
  T('a second run plays without NaN', finite(g.player.pos) && finite(g.camera));
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
