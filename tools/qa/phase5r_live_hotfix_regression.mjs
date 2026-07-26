// PHASE 5R LIVE REGRESSION HOTFIX
// Exact gates for zero drift, safe external force, wall sliding, detour budgeting,
// cached walkability, and card cursor/input lifecycle.

import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const HERE = path.dirname(fileURLToPath(import.meta.url));
register('./strip-v-loader.mjs', import.meta.url);
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const ROOT = path.resolve(HERE, '../..');
const file = rel => path.join(ROOT, ...rel.split('/'));
const MAIN_SRC = fs.readFileSync(file('js/main.js'), 'utf8');
const GAME_SRC = fs.readFileSync(file('js/game/Game.js'), 'utf8');

const quiet = muteConsole();
const [{ Player }, { Enemy }, { Game }, { MapManager }, { UpgradeUI }, constants] = await Promise.all([
  import(pathToFileURL(file('js/entities/Player.js')).href),
  import(pathToFileURL(file('js/entities/Enemy.js')).href),
  import(pathToFileURL(file('js/game/Game.js')).href),
  import(pathToFileURL(file('js/game/MapManager.js')).href),
  import(pathToFileURL(file('js/game/UpgradeUI.js')).href),
  import(pathToFileURL(file('js/constants.js')).href),
]);
quiet();

const { PLAYER_RADIUS } = constants;
const DT = 1 / 60;
let pass = 0;
let fail = 0;
const gate = (name, result, note = '') => {
  const ok = result === true;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` | ${note}` : ''}`);
};

const makeMap = () => {
  const mm = new MapManager();
  mm._cityImg = { complete: true, naturalWidth: 1672, naturalHeight: 519 };
  mm._chaosDeckImg = { complete: true, naturalWidth: 1672, naturalHeight: 440 };
  return mm;
};
const makeShell = (mm, mode = 'endless') => {
  const game = Object.create(Game.prototype);
  game.mapManager = mm;
  game.endless = true;
  game._chaosMode = mode === 'chaos';
  return game;
};

console.log('=== PHASE 5R LIVE HOTFIX REGRESSION ===');

console.log('\n-- A. zero-input and lifecycle --');
{
  const p = new Player('skeleton_warrior');
  const start = { x: p.pos.x, y: p.pos.y };
  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  for (let i = 0; i < 600; i++) p.update(DT, input);
  const drift = Math.hypot(p.pos.x - start.x, p.pos.y - start.y);
  gate('600 frames with zero input produce exactly zero displacement', drift === 0, `drift=${drift}`);

  p.vel.x = 200; p.vel.y = -80; p.dashTimer = 0.12; p.specialDashTimer = 0.3;
  p.cancelMovement();
  gate('pause/card/focus cancellation clears velocity and both dash timers',
    p.vel.x === 0 && p.vel.y === 0 && p.dashTimer === 0 && p.specialDashTimer === 0);
  gate('clean profile commits the visible default character before constructing Player',
    GAME_SRC.includes("const _char       = this.selectedCharacter || 'skeleton_warrior';") &&
      GAME_SRC.includes('this.selectedCharacter = _char;') &&
      GAME_SRC.includes('this.player       = new Player(_char, _outfitPath);'));
}

// ── B. wall slide, external displacement and invisible-wall sweeps ─────────────────────────────
// 2026-07-26: this section used to read `mm.CITY_BLOCK_COLS[1]` and build its scenario from
// hand-typed block rectangles. Production DELIBERATELY emptied CITY_BLOCK_COLS / CHAOS_BLOCK_COLS
// (MapManager: the authored rectangles were close to an inversion of the art and produced invisible
// slabs on open pavement — measured 85.9% blocked frames), so the index read threw
// `Cannot read properties of undefined (reading '0')` and ABORTED the whole suite before sections
// C and D ever ran. The gates below therefore assert BEHAVIOUR against whatever the current
// authoritative walkability source reports, and hold whether `blocks` is empty or later carries a
// mask derived from the art. Nothing here may assume an array index or a specific obstacle shape.
console.log('\n-- B. wall slide and external displacement --');
{
  const mm = makeMap();
  const game = makeShell(mm);

  const model = mm._walkModel('endless');
  gate('an authoritative endless walkability model is published', !!model && Array.isArray(model.rows));
  gate('the gates below do not depend on authored block columns', Array.isArray(model.blocks),
    `blocks=${model.blocks.length}`);

  const S = model.scale;
  // Derive the real walkable corridor from the live model instead of hard-coding geometry.
  let bandTop = null, bandBottom = null;
  for (let srcY = model.rows[0] - 40; srcY <= model.rows[1] + 40; srcY += 0.5) {
    if (mm.isWalkableFootprint(500 * S, srcY * S, PLAYER_RADIUS, 'endless')) {
      if (bandTop === null) bandTop = srcY;
      bandBottom = srcY;
    }
  }
  gate('the corridor is a real bounded band, not an open plane',
    bandTop !== null && bandBottom !== null && bandBottom > bandTop,
    `srcY ${bandTop}..${bandBottom}`);
  gate('a footprint above the band edge is genuinely rejected',
    !mm.isWalkableFootprint(500 * S, (model.rows[0] - 10) * S, PLAYER_RADIUS, 'endless'));

  const midY = ((bandTop + bandBottom) / 2) * S;

  // ── knockback into the BOTTOM edge: blocked axis absorbed, free axis preserved ──
  const pb = new Player('skeleton_warrior');
  pb._resolveMove = (fx, fy, tx, ty, r) => game.resolveWalkableMove(fx, fy, tx, ty, r);
  pb.pos.x = 500 * S; pb.pos.y = (bandBottom - 4) * S;
  const bb = { x: pb.pos.x, y: pb.pos.y };
  pb.applyExternalDisplacement({ x: 90, y: 90 });
  gate('external knockback never places the footprint inside an obstacle',
    mm.isWalkableFootprint(pb.pos.x, pb.pos.y, PLAYER_RADIUS, 'endless'));
  gate('diagonal external force preserves movement on the free wall axis',
    Math.abs(pb.pos.x - bb.x) > 80, `freeAxis=${(pb.pos.x - bb.x).toFixed(2)}px`);
  gate('the blocked component is absorbed, never teleported past the wall',
    pb.pos.y - bb.y >= 0 && pb.pos.y - bb.y < 90, `blockedAxis=${(pb.pos.y - bb.y).toFixed(2)}px`);

  // ── knockback into the TOP edge behaves the same way (both walls, not just one) ──
  const pt = new Player('skeleton_warrior');
  pt._resolveMove = (fx, fy, tx, ty, r) => game.resolveWalkableMove(fx, fy, tx, ty, r);
  pt.pos.x = 500 * S; pt.pos.y = (bandTop + 4) * S;
  const bt = { x: pt.pos.x, y: pt.pos.y };
  pt.applyExternalDisplacement({ x: 90, y: -90 });
  gate('the opposite wall absorbs its blocked component identically',
    mm.isWalkableFootprint(pt.pos.x, pt.pos.y, PLAYER_RADIUS, 'endless') &&
      Math.abs(pt.pos.x - bt.x) > 80 && bt.y - pt.pos.y < 90,
    `freeAxis=${(pt.pos.x - bt.x).toFixed(2)} blockedAxis=${(pt.pos.y - bt.y).toFixed(2)}`);

  // ── mid-corridor knockback is completely unconstrained (no phantom wall on open floor) ──
  const pm = new Player('skeleton_warrior');
  pm._resolveMove = (fx, fy, tx, ty, r) => game.resolveWalkableMove(fx, fy, tx, ty, r);
  pm.pos.x = 500 * S; pm.pos.y = midY;
  const bm = { x: pm.pos.x, y: pm.pos.y };
  pm.applyExternalDisplacement({ x: 90, y: 60 });
  gate('open corridor floor applies no hidden resistance',
    Math.abs(pm.pos.x - bm.x - 90) < 1e-6 && Math.abs(pm.pos.y - bm.y - 60) < 1e-6,
    `dx=${(pm.pos.x - bm.x).toFixed(2)} dy=${(pm.pos.y - bm.y).toFixed(2)}`);

  // ── resolver-level slide: diagonal into a wall keeps the free axis, drops only the blocked one ──
  const rTop = game.resolveWalkableMove(500 * S, (bandTop + 2) * S, 500 * S + 30, (bandTop + 2) * S - 30, PLAYER_RADIUS);
  gate('resolveWalkableMove slides along the wall instead of hard-blocking',
    rTop.x - 500 * S > 29 && Math.abs(rTop.y - (bandTop + 2) * S) < 1e-6,
    `dx=${(rTop.x - 500 * S).toFixed(2)} dy=${(rTop.y - (bandTop + 2) * S).toFixed(2)}`);

  // ── INVISIBLE-WALL SWEEPS on visually walkable ground (§5A) ──
  // Horizontal, vertical and diagonal sweeps across the corridor, including the mirror-tiling
  // seam, must never produce a fully blocked frame, a teleport or an off-floor footprint.
  for (const mode of ['endless', 'chaos']) {
    const mdl = mm._walkModel(mode);
    let lo = null, hi = null;
    for (let srcY = mdl.rows[0] - 40; srcY <= mdl.rows[1] + 40; srcY += 0.5) {
      if (mm.isWalkableFootprint(500 * S, srcY * S, PLAYER_RADIUS, mode)) { if (lo === null) lo = srcY; hi = srcY; }
    }
    const cy = ((lo + hi) / 2) * S;
    const g2 = makeShell(mm, mode);
    let blocked = 0, teleports = 0, offFloor = 0;
    let x = -3 * mdl.tileW * S, y = cy;                 // start well left of origin, cross seams
    for (let i = 0; i < 4000; i++) {                    // horizontal sweep over ~4 mirror periods
      const r = g2.resolveWalkableMove(x, y, x + 7, y, PLAYER_RADIUS, mode);
      if (r.x === x && r.y === y) blocked++;
      if (Math.hypot(r.x - x, r.y - y) > 20) teleports++;
      x = r.x; y = r.y;
      if (!mm.isWalkableFootprint(x, y, PLAYER_RADIUS, mode)) offFloor++;
    }
    gate(`${mode}: horizontal sweep on walkable ground has no invisible wall`,
      blocked === 0, `blocked=${blocked}`);
    gate(`${mode}: horizontal sweep never teleports or leaves the floor`,
      teleports === 0 && offFloor === 0, `teleports=${teleports} offFloor=${offFloor}`);

    let diagBlocked = 0, diagOff = 0;
    let dx = 0, dy = cy;
    for (let i = 0; i < 2000; i++) {                    // diagonal zig-zag inside the corridor
      const vy = (i % 40 < 20) ? 5 : -5;
      const r = g2.resolveWalkableMove(dx, dy, dx + 5, dy + vy, PLAYER_RADIUS, mode);
      if (r.x === dx && r.y === dy) diagBlocked++;
      dx = r.x; dy = r.y;
      if (!mm.isWalkableFootprint(dx, dy, PLAYER_RADIUS, mode)) diagOff++;
    }
    gate(`${mode}: diagonal sweep is never fully blocked on open floor`,
      diagBlocked === 0 && diagOff === 0, `blocked=${diagBlocked} offFloor=${diagOff}`);
    gate(`${mode}: no NaN/Infinity reaches the resolved player position`,
      Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(x) && Number.isFinite(y));
  }

  // ── map-specific runtime behaviour: the two decks are NOT the same model ──
  gate('endless publishes neutral pavement outside the authored strip',
    mm.isWalkablePoint(500 * S, -200 * S, 'endless') === true);
  gate('chaos deck has hard vertical bounds instead of neutral pavement',
    mm.isWalkablePoint(500 * S, -200 * S, 'chaos') === false &&
      mm.isWalkablePoint(500 * S, (mm._walkModel('chaos').tileH + 200) * S, 'chaos') === false);

  const p = pm;
  const x0 = p.pos.x, y0 = p.pos.y;
  const enemy = { pos: new constants.Vec2(p.pos.x - 1, p.pos.y), radius: 14, hp: 10, contactDamage: 0, enemyType: 'Test' };
  Object.assign(game, {
    player: p, playerHitCooldown: 0, _contactIfrT: 1, _ciDur: 0.3,
    phoenixReviveTimer: 0, enemies: [enemy], _spatialGrid: { query: () => [enemy] },
  });
  game._checkPlayerEnemyCollisions(DT);
  gate('ordinary enemy overlap cannot create zero-input body-push drift', p.pos.x === x0 && p.pos.y === y0);
  gate('all direct player pos.addMut bypasses are removed from Game',
    !/(?:this\.player|\bp)\.pos\.addMut\(/.test(GAME_SRC));
}

console.log('\n-- C. detour and frame budget --');
{
  const mm = makeMap();
  const game = makeShell(mm);
  game.player = { pos: { x: 2400, y: 780 } };
  game._resolveEnemyMove = (fx, fy) => ({ x: fx, y: fy });
  let searches = 0;
  game._findEnemyDetour = () => { searches++; return null; };
  game._recoverEnemyPos = () => null;
  game._enemyDetourBudget = 6;
  const enemies = Array.from({ length: 900 }, () => {
    const e = Object.create(Enemy.prototype);
    Object.assign(e, {
      pos: { x: 2050, y: 780 }, vel: { x: 100, y: 0 }, radius: 14,
      baseSpeed: 100, _stuckT: 1, _stuckCd: 0, _detourPos: null, _detourT: 0,
    });
    return e;
  });
  const frameTimes = [];
  for (let frame = 0; frame < 60; frame++) {
    game._enemyDetourBudget = 6;
    for (const e of enemies) { e._stuckT = 1; e._stuckCd = 0; }
    const t0 = performance.now();
    for (const e of enemies) e._stepMove(game, DT);
    frameTimes.push(performance.now() - t0);
  }
  frameTimes.sort((a, b) => a - b);
  const p95 = frameTimes[Math.floor(frameTimes.length * 0.95)];
  const max = frameTimes[frameTimes.length - 1];
  const over250 = frameTimes.filter(ms => ms > 250).length;
  gate('detour searches are globally capped at six per frame', searches === 60 * 6,
    `searches=${searches}`);
  gate('900-enemy pinned stress has no recurring 250ms stalls', p95 < 50 && over250 <= 1,
    `p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms over250=${over250}`);
}

console.log('\n-- D. allocation and cursor/card lifecycle --');
{
  const mm = makeMap();
  const a = mm._walkModel('endless');
  const b = mm._walkModel('endless');
  gate('walkability model is cached instead of allocated on every footprint query', a === b);
  const tileH = mm._cityImg.naturalHeight * mm.CITY_SCALE;
  gate('visible neutral Endless pavement has no invisible horizontal collision wall',
    mm.isWalkableFootprint(500, -80, PLAYER_RADIUS, 'endless') &&
      mm.isWalkableFootprint(500, tileH + 80, PLAYER_RADIUS, 'endless'));
  gate('footprint cannot cut through non-floor art while entering neutral pavement',
    !mm.isWalkableFootprint(500, -8, PLAYER_RADIUS, 'endless') &&
      !mm.isWalkableFootprint(500, tileH + 8, PLAYER_RADIUS, 'endless'));
  gate('combat cursor remains visible and card screens use pointer cursor',
    /inCombat \? 'crosshair' : \(game\.upgradeUI \|\| game\.mutationUI \? 'pointer'/.test(MAIN_SRC) &&
    !/inCombat \? 'none'/.test(MAIN_SRC));
  gate('mousedown refreshes scaled canvas coordinates before card hit-testing',
    /canvas\.addEventListener\('mousedown',[\s\S]{0,160}mousePos = _canvasPoint\(e\);[\s\S]{0,80}game\.setMousePos\(mousePos\)/.test(MAIN_SRC));
  gate('blocked modal movement keys are not added to the held-input set',
    /movementBlocked[\s\S]{0,220}!\(movementBlocked && MOVEMENT_KEYS\.has\(key\)\)/.test(MAIN_SRC));
  gate('focus release also cancels active player movement',
    /function _releaseAllHeldInput[\s\S]{0,260}game\.player\?\.cancelMovement\?\.\(\)/.test(MAIN_SRC));

  const ui = new UpgradeUI([{ key: 'qa', apply() {} }], { allowReroll: false, allowBanish: false });
  const rect = ui.cardRects[0];
  let selected = -1;
  ui.handleClick({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, { selectUpgrade: i => { selected = i; } });
  gate('real UpgradeUI mouse hit-test selects the visible card', selected === 0);
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
