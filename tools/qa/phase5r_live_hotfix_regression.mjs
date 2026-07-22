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

console.log('\n-- B. wall slide and external displacement --');
{
  const mm = makeMap();
  const game = makeShell(mm);
  const p = new Player('skeleton_warrior');
  p._resolveMove = (fx, fy, tx, ty, r) => game.resolveWalkableMove(fx, fy, tx, ty, r);
  const block = mm.CITY_BLOCK_COLS[1];
  p.pos.x = block[0] * mm.CITY_SCALE - PLAYER_RADIUS - 2;
  p.pos.y = (block[2] + 20) * mm.CITY_SCALE;
  const beforeY = p.pos.y;
  p.applyExternalDisplacement({ x: 90, y: 90 });
  gate('external knockback never places the footprint inside an obstacle',
    mm.isWalkableFootprint(p.pos.x, p.pos.y, PLAYER_RADIUS, 'endless'));
  gate('diagonal external force preserves movement on the free wall axis', p.pos.y > beforeY + 20,
    `slide=${(p.pos.y - beforeY).toFixed(2)}px`);

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
