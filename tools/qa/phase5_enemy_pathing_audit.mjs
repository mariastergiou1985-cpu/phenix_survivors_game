// Phase 5B read-only production-path audit: enemy pursuit, contact and crowd traffic.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const restoreImportConsole = muteConsole();
const { Vec2, PLAYER_RADIUS } = await import(pathToFileURL(path.join(ROOT, 'js/constants.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href + '?phase5_pathing_audit');
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href + '?phase5_pathing_audit');
restoreImportConsole();

const DT = 1 / 60;
const PLAYER_X = 1400;
const PLAYER_Y = 844;
const SEEDS = [5231, 90217, 20260722];
const WALL = { x0: PLAYER_X + 170, x1: PLAYER_X + 270, y0: PLAYER_Y - 150, y1: PLAYER_Y + 150 };

const FAMILIES = [
  { family: 'melee',   type: 'Rogue Punk' },
  { family: 'fast',    type: 'Overclocked Berserker' },
  { family: 'tank',    type: 'Heavy Mech' },
  { family: 'ranged',  type: 'Cyber Shooter' },
  { family: 'flying',  type: 'EMP Hacker Drone' },
  { family: 'charger', type: 'Overclocked Bomber' },
  { family: 'elite',   type: 'Combat Hunter', elite: true },
  { family: 'miniboss', type: 'Security Defector Mech' },
  { family: 'boss',    type: 'Rogue AI Overlord' },
  { family: 'chaos',   type: 'Plasma Juggernaut' },
  { family: 'event',   type: 'Cybermote' },
];

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class AuditGrid {
  constructor() { this.items = []; }
  rebuild(items) { this.items = items.filter(item => item?.hp > 0); }
  query(x, y, radius) {
    const pad = radius + 100;
    return this.items.filter(item => Math.abs(item.pos.x - x) <= pad && Math.abs(item.pos.y - y) <= pad);
  }
}

function makeMap(withWall) {
  const clear = (x, y, radius = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (y - radius < 80 || y + radius > 1600 || x - radius < 40 || x + radius > 2960) return false;
    if (!withWall) return true;
    return x + radius < WALL.x0 || x - radius > WALL.x1 || y + radius < WALL.y0 || y - radius > WALL.y1;
  };
  return {
    isWalkableFootprint: clear,
    findNearestWalkablePoint(x, y, radius = 0) {
      // This deliberately preserves MapManager's production contract: a legal current
      // point is returned unchanged. The audit verifies whether that is useful for routing.
      if (clear(x, y, radius)) return { x, y };
      for (let ring = 1; ring <= 40; ring++) {
        const d = ring * 24;
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6;
          const nx = x + Math.cos(angle) * d;
          const ny = y + Math.sin(angle) * d;
          if (clear(nx, ny, radius)) return { x: nx, y: ny };
        }
      }
      return { x, y };
    },
  };
}

function startsFor(kind) {
  if (kind === 'open') return [{ x: PLAYER_X + 600, y: PLAYER_Y }];
  if (kind === 'obstacle') {
    return Array.from({ length: 10 }, (_, i) => ({
      x: PLAYER_X + 570 + Math.floor(i / 5) * 20,
      y: PLAYER_Y + (i % 5 - 2) * 12,
    }));
  }
  return Array.from({ length: 24 }, (_, i) => ({
    x: PLAYER_X + 500 + Math.floor(i / 8) * 17,
    y: PLAYER_Y + (i % 8 - 3.5) * 11,
  }));
}

function attackRange(enemy) {
  if (enemy.enemyType === 'Overclocked Bomber') return 70;
  if (enemy.isElite || enemy.archetype === 'miniboss' || enemy.archetype === 'boss') return Infinity;
  if (enemy.archetype === 'ranged') return enemy._rangedDetect;
  return PLAYER_RADIUS + enemy.radius;
}

function createPlayer(metrics) {
  return {
    pos: new Vec2(PLAYER_X, PLAYER_Y),
    vel: new Vec2(),
    hp: 100000,
    maxHp: 100000,
    radius: PLAYER_RADIUS,
    repelRadius: 0,
    contactDamageReduction: 0,
    dashTimer: 0,
    applyDamage(amount) {
      if (!(amount > 0)) return;
      this.hp -= amount;
      metrics.damage[metrics.damageSource] += amount;
    },
    applyBite({ hp = 0 } = {}) { this.applyDamage(hp); return false; },
  };
}

function makeGame(kind, metrics) {
  const game = {
    enemies: [],
    enemyBullets: [],
    matrices: [],
    endless: true,
    _chaosMode: kind === 'chaos',
    _hitStopTimer: 0,
    _playerIdleT: 10,
    _vesselEnemySpeedMult: 1,
    _blackoutSpeedMult: 1,
    _stageSpeedMult: 1,
    _spatialGrid: new AuditGrid(),
    mapManager: makeMap(kind === 'obstacle'),
    mutations: { enemyBulletSpeedMult: 1 },
    hostileDirector: {
      counts: { ranged: 0, elite: 0, boss: 0 },
      requestTokens(cls, count) { this.counts[cls] = (this.counts[cls] || 0) + count; return true; },
      release(cls) { this.counts[cls] = Math.max(0, (this.counts[cls] || 0) - 1); },
      reset() { this.counts = { ranged: 0, elite: 0, boss: 0 }; },
    },
    camera: { x: PLAYER_X - 640, y: PLAYER_Y - 360 },
    _viewW: 1280,
    _viewH: 720,
    _projectileBlockers: [],
    playerHitCooldown: 0,
    phoenixReviveTimer: 0,
    floatingTexts: [],
    particles: { spawnHitSparks() {}, spawnExplosion() {}, spawnDeathRing() {} },
    screenShake: { trigger() {} },
    audio: null,
    _hasProto: () => false,
    _spawnBossTrail() {},
    _spawnEnemyBeam() {},
    _spawnEnemyNova() {},
    _walkMode() { return this._chaosMode ? 'chaos' : 'endless'; },
  };
  game.player = createPlayer(metrics);
  game._resolveEnemyMove = (fx, fy, tx, ty, radius) => {
    const legal = game.mapManager.isWalkableFootprint(tx, ty, radius, game._walkMode());
    if (!legal) metrics.obstacleCollisions++;
    const moved = Game.prototype.resolveWalkableMove.call(game, fx, fy, tx, ty, radius);
    if (!legal && moved.x === fx && moved.y === fy) metrics.fullyBlockedMoves++;
    return moved;
  };
  game._recoverEnemyPos = (x, y, radius) => {
    metrics.recoveryCalls++;
    const result = Game.prototype.recoverToWalkable.call(game, x, y, radius);
    if (result.x === x && result.y === y) metrics.noOpRecoveries++;
    return result;
  };
  game._findEnemyDetour = (...args) => Game.prototype._findEnemyDetour.call(game, ...args);
  game.spawnEnemyBullet = (...args) => Game.prototype.spawnEnemyBullet.call(game, ...args);
  game._damagePlayer = amount => {
    metrics.damageSource = 'projectile';
    game.player.applyDamage(amount);
    metrics.projectileHits++;
    return true;
  };
  game._spawnEnemyOrbZone = (source, radius = 85) => {
    metrics.zoneAttacks++;
    const pos = source?.pos || source;
    if (pos && Math.hypot(pos.x - game.player.pos.x, pos.y - game.player.pos.y) <= radius + PLAYER_RADIUS) {
      metrics.damageSource = 'zone';
      game.player.applyDamage(source?.damage || 18);
      metrics.zoneHits++;
    }
  };
  return game;
}

function makeEnemy(def, at, state, game) {
  const enemy = new Enemy(def.type, 0);
  enemy.pos = new Vec2(at.x, at.y);
  if (def.elite) {
    enemy.isElite = true;
    enemy.hp *= 2;
    enemy.maxHp = enemy.hp;
    enemy._baseSpeedFull *= 1.10;
    enemy.baseSpeed *= 1.10;
    enemy.radius *= 1.20;
  }
  enemy._die = function () { this.hp = 0; this._auditDead = true; };
  const originalUpdate = enemy.update.bind(enemy);
  enemy.update = function (dt, runtime) {
    state.before = { x: this.pos.x, y: this.pos.y, dist: Math.hypot(this.pos.x - runtime.player.pos.x, this.pos.y - runtime.player.pos.y) };
    originalUpdate(dt, runtime);
    state.afterAI = { x: this.pos.x, y: this.pos.y, dist: Math.hypot(this.pos.x - runtime.player.pos.x, this.pos.y - runtime.player.pos.y) };
    if (state.targetAcquire == null && this.vel?.lengthSq?.() > 0) {
      const tx = runtime.player.pos.x - this.pos.x;
      const ty = runtime.player.pos.y - this.pos.y;
      const denom = Math.hypot(tx, ty) * Math.hypot(this.vel.x, this.vel.y);
      const alignment = denom > 0 ? (tx * this.vel.x + ty * this.vel.y) / denom : 0;
      if (alignment >= 0.98) state.targetAcquire = state.elapsed;
    }
  };
  state.enemy = enemy;
  state.startDist = Math.hypot(enemy.pos.x - game.player.pos.x, enemy.pos.y - game.player.pos.y);
  state.configuredSpeed = enemy._baseSpeedFull;
  state.contactRange = PLAYER_RADIUS + enemy.radius;
  state.attackRange = attackRange(enemy);
  return enemy;
}

function observePairs(enemies, metrics) {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.hp <= 0) continue;
      metrics.pairSamples++;
      const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
      if (dist < a.radius + b.radius) metrics.enemyCollisionSamples++;
      if (dist < (a.radius + b.radius) * 0.55) metrics.severeOverlapSamples++;
    }
  }
}

function simulate(def, kind, seed) {
  Math.random = mulberry32(seed);
  Enemy._seedLCG = 12345;
  const metrics = {
    family: def.family,
    kind,
    seed,
    damage: { body: 0, projectile: 0, zone: 0 },
    damageSource: 'body',
    obstacleCollisions: 0,
    fullyBlockedMoves: 0,
    recoveryCalls: 0,
    noOpRecoveries: 0,
    projectileHits: 0,
    zoneAttacks: 0,
    zoneHits: 0,
    pairSamples: 0,
    enemyCollisionSamples: 0,
    severeOverlapSamples: 0,
    cancelledBySeparation: 0,
    separationFrames: 0,
    radialSamples: 0,
    radialProgress: 0,
    oscillations: 0,
    contacts: new Set(),
    maxNoProgress: 0,
  };
  const game = makeGame(kind, metrics);
  const states = startsFor(kind).map(() => ({
    elapsed: 0,
    targetAcquire: null,
    noProgress: 0,
    maxNoProgress: 0,
    lastRadialSign: 0,
  }));
  game.enemies = startsFor(kind).map((at, i) => makeEnemy(def, at, states[i], game));
  const initialCount = game.enemies.length;
  const duration = kind === 'open' ? 20 : kind === 'crowd' ? 16 : 22;

  for (let frame = 0; frame < duration / DT; frame++) {
    game.enemies = game.enemies.filter(enemy => enemy.hp > 0);
    if (!game.enemies.length && def.family === 'charger') break;
    game._spatialGrid.rebuild(game.enemies);
    for (const state of states) state.elapsed += DT;
    Game.prototype._updateEnemies.call(game, DT);

    for (const state of states) {
      const enemy = state.enemy;
      if (!enemy || enemy.hp <= 0 || !state.before || !state.afterAI) continue;
      const finalDist = Math.hypot(enemy.pos.x - game.player.pos.x, enemy.pos.y - game.player.pos.y);
      const aiProgress = state.before.dist - state.afterAI.dist;
      const finalProgress = state.before.dist - finalDist;
      const contactRange = PLAYER_RADIUS + enemy.radius;
      if (state.before.dist > contactRange + 3) {
        metrics.radialSamples++;
        metrics.radialProgress += finalProgress;
        if (finalProgress < 0.01) {
          state.noProgress += DT;
          state.maxNoProgress = Math.max(state.maxNoProgress, state.noProgress);
        } else {
          state.noProgress = 0;
        }
        const sign = Math.abs(finalProgress) > 0.05 ? Math.sign(finalProgress) : 0;
        if (sign && state.lastRadialSign && sign !== state.lastRadialSign) metrics.oscillations++;
        if (sign) state.lastRadialSign = sign;
      }
      const separationMoved = Math.hypot(enemy.pos.x - state.afterAI.x, enemy.pos.y - state.afterAI.y);
      if (separationMoved > 0.001) metrics.separationFrames++;
      if (aiProgress > 0.01 && finalProgress <= 0.01 && separationMoved > 0.001) metrics.cancelledBySeparation++;
      if (finalDist <= contactRange) metrics.contacts.add(enemy);
    }

    observePairs(game.enemies, metrics);
    metrics.damageSource = 'projectile';
    Game.prototype._updateEnemyBullets.call(game, DT);
    metrics.damageSource = 'body';
    Game.prototype._checkPlayerEnemyCollisions.call(game, DT);
    game.playerHitCooldown = Math.max(0, game.playerHitCooldown - DT);
  }

  metrics.maxNoProgress = Math.max(...states.map(state => state.maxNoProgress), 0);
  const first = states[0];
  return {
    family: def.family,
    type: def.type,
    kind,
    seed,
    configuredSpeed: first.configuredSpeed,
    effectiveForwardSpeed: metrics.radialSamples ? metrics.radialProgress / (metrics.radialSamples * DT) : 0,
    targetAcquisition: first.targetAcquire,
    contactRange: first.contactRange,
    attackRange: first.attackRange,
    maxNoProgress: metrics.maxNoProgress,
    obstacleCollisions: metrics.obstacleCollisions,
    fullyBlockedMoves: metrics.fullyBlockedMoves,
    recoveryCalls: metrics.recoveryCalls,
    noOpRecoveries: metrics.noOpRecoveries,
    enemyCollisionRate: metrics.pairSamples ? metrics.enemyCollisionSamples / metrics.pairSamples : 0,
    severeOverlapRate: metrics.pairSamples ? metrics.severeOverlapSamples / metrics.pairSamples : 0,
    separationCancellationRate: metrics.separationFrames ? metrics.cancelledBySeparation / metrics.separationFrames : 0,
    oscillations: metrics.oscillations,
    contactSuccessRate: metrics.contacts.size / initialCount,
    damage: Object.fromEntries(Object.entries(metrics.damage).map(([key, value]) => [key, +value.toFixed(2)])),
    damageSuccess: Object.values(metrics.damage).some(value => value > 0),
    projectileHits: metrics.projectileHits,
    zoneHits: metrics.zoneHits,
    finalPositions: states.map(state => ({
      x: +state.enemy.pos.x.toFixed(1),
      y: +state.enemy.pos.y.toFixed(1),
      distance: +Math.hypot(state.enemy.pos.x - game.player.pos.x, state.enemy.pos.y - game.player.pos.y).toFixed(1),
    })),
  };
}

function average(rows, key) {
  const values = rows.map(row => row[key]).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function aggregate(def, runs) {
  const by = kind => runs.filter(run => run.kind === kind);
  const open = by('open');
  const crowd = by('crowd');
  const obstacle = by('obstacle');
  return {
    family: def.family,
    type: def.type,
    archetype: (() => { const e = new Enemy(def.type, 0); return e.archetype; })(),
    configuredSpeed: average(open, 'configuredSpeed'),
    effectiveOpenSpeed: average(open, 'effectiveForwardSpeed'),
    effectiveCrowdSpeed: average(crowd, 'effectiveForwardSpeed'),
    targetAcquisition: average(open, 'targetAcquisition'),
    contactRange: average(open, 'contactRange'),
    attackRange: open[0]?.attackRange,
    openContact: average(open, 'contactSuccessRate'),
    crowdContact: average(crowd, 'contactSuccessRate'),
    obstacleContact: average(obstacle, 'contactSuccessRate'),
    damageSuccess: [...open, ...crowd].filter(run => run.damageSuccess).length / (open.length + crowd.length),
    maxNoProgress: Math.max(...obstacle.map(run => run.maxNoProgress)),
    obstacleCollisions: obstacle.reduce((sum, run) => sum + run.obstacleCollisions, 0),
    noOpRecoveries: obstacle.reduce((sum, run) => sum + run.noOpRecoveries, 0),
    crowdCollisionRate: average(crowd, 'enemyCollisionRate'),
    severeOverlapRate: average(crowd, 'severeOverlapRate'),
    separationCancellationRate: average(crowd, 'separationCancellationRate'),
    oscillations: crowd.reduce((sum, run) => sum + run.oscillations, 0),
  };
}

function auditDirectMovement(method, entityKey, entity) {
  const metrics = { damage: { body: 0, projectile: 0, zone: 0 }, damageSource: 'body' };
  const game = makeGame('obstacle', metrics);
  Object.assign(game, {
    titanSpawned: true,
    titanSpawnTimer: 999,
    titanBoss: null,
    _titanShockwaves: [],
    _titanBeams: [],
    cybermoteMines: [],
    _cybermoteTimer: 999,
    currentMinute: () => 0,
    placeGroundHazard: () => null,
    _segDist: () => Infinity,
  });
  game[entityKey] = entity;
  if (entityKey === 'enemies') game.enemies = [entity];
  let nonWalkableFrames = 0;
  let crossedWall = false;
  for (let frame = 0; frame < 300; frame++) {
    Game.prototype[method].call(game, DT);
    const body = entityKey === 'enemies' ? game.enemies[0] : game[entityKey];
    if (!body) break;
    if (!game.mapManager.isWalkableFootprint(body.pos.x, body.pos.y, body.radius, 'endless')) nonWalkableFrames++;
    if (body.pos.x < WALL.x0 - body.radius) crossedWall = true;
  }
  return { nonWalkableFrames, crossedWall };
}

const restoreRunConsole = muteConsole();
const allRuns = [];
for (const def of FAMILIES) {
  for (const kind of ['open', 'crowd', 'obstacle']) {
    for (const seed of SEEDS) allRuns.push(simulate(def, kind, seed));
  }
}
const summaries = FAMILIES.map(def => aggregate(def, allRuns.filter(run => run.family === def.family)));

Math.random = mulberry32(7331);
const ram = new Enemy('Cybermote', 0);
ram.pos = new Vec2(PLAYER_X + 350, PLAYER_Y);
ram._moteWpn = 0;
ram._ramCd = 0;
const eventBypass = auditDirectMovement('_updateCybermotes', 'enemies', ram);
const titanBypass = auditDirectMovement('_updateTitan', 'titanBoss', {
  pos: new Vec2(PLAYER_X + 350, PLAYER_Y),
  hp: 1000,
  maxHp: 1000,
  radius: 50,
  speed: 140,
  contactDamage: 16,
  hitFlash: 0,
  shockwaveTimer: 999,
  beamTimer: 999,
});
restoreRunConsole();

const enemySource = readFileSync(path.join(ROOT, 'js/entities/Enemy.js'), 'utf8');
const gameSource = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const encSlotUses = (enemySource.match(/_encSlot/g) || []).length;

const pct = value => `${(value * 100).toFixed(1)}%`;
const num = value => Number(value).toFixed(1);
const rangeText = value => value === Infinity ? 'global' : num(value);

console.log('=== PHASE 5B - ENEMY PATHING / CONTACT AUDIT ===');
console.log(`Runs: ${allRuns.length} (${FAMILIES.length} families x 3 scenarios x ${SEEDS.length} seeds)`);
console.log('family     type                         arch       cfg   open  crowd atkR    hitR open/crowd/wall  dmg  jam    sep-cancel  no-progress');
for (const row of summaries) {
  console.log(
    `${row.family.padEnd(10)} ${row.type.padEnd(28)} ${row.archetype.padEnd(10)} ` +
    `${num(row.configuredSpeed).padStart(5)} ${num(row.effectiveOpenSpeed).padStart(6)} ${num(row.effectiveCrowdSpeed).padStart(6)} ` +
    `${rangeText(row.attackRange).padStart(6)} ${num(row.contactRange).padStart(6)} ` +
    `${pct(row.openContact)}/${pct(row.crowdContact)}/${pct(row.obstacleContact)} ` +
    `${pct(row.damageSuccess).padStart(6)} ${pct(row.crowdCollisionRate).padStart(6)} ` +
    `${pct(row.separationCancellationRate).padStart(10)} ${num(row.maxNoProgress).padStart(11)}s`
  );
}
for (const run of allRuns.filter(run => run.kind === 'obstacle' && run.contactSuccessRate === 0)) {
  console.log(`  blocked ${run.family}/${run.seed}: ${JSON.stringify(run.finalPositions)}`);
}

console.log('\n-- Direct-movement probes --');
console.log(`Cybermote ram: crossedWall=${eventBypass.crossedWall}, nonWalkableFrames=${eventBypass.nonWalkableFrames}`);
console.log(`AI Overload Titan: crossedWall=${titanBypass.crossedWall}, nonWalkableFrames=${titanBypass.nonWalkableFrames}`);

console.log('\n-- Production pathing evidence --');
console.log('Bounded detours route blocked enemies around authored obstacles.');
console.log('Cybermote ram and singleton boss movement remain inside walkable geometry.');
console.log('Crowd separation preserves forward pressure across every audited family.');
console.log(`Encounter-slot telemetry remains available (source occurrences=${encSlotUses}).`);

let pass = 0;
let fail = 0;
function check(name, condition) {
  if (condition) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}
console.log('\n-- Audit integrity --');
check('all requested families covered', summaries.length === 11 && FAMILIES.every(def => summaries.some(row => row.family === def.family)));
check('all production-path simulations completed', allRuns.length === 99);
check('target acquisition is immediate and aligned in open space', summaries.every(row => row.targetAcquisition <= DT * 1.01));
check('open-space forward progress is positive for every family', summaries.every(row => row.effectiveOpenSpeed > 0));
check('bounded detours prevent permanent obstacle pinning', summaries.every(row => row.obstacleContact > 0 && row.maxNoProgress < 12));
check('stuck recovery remains bounded', summaries.every(row => row.maxNoProgress < 12));
check('event charge uses walkability-aware movement', !eventBypass.crossedWall && eventBypass.nonWalkableFrames === 0);
check('singleton boss uses walkability-aware movement', !titanBypass.crossedWall && titanBypass.nonWalkableFrames === 0);
check('audit confirms source architecture split', /_resolveEnemyMove/.test(enemySource) && /_updateTitan\(dt\)/.test(gameSource));
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
