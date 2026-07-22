// Phase 5 Dimi audit. Drives the production Mega Glove and Tactical Drone
// methods frame by frame without changing production state or source files.
// Run: node tools/qa/phase5_dimi_audit.mjs

import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

register('./strip-v-loader.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(
  pathToFileURL(path.join(HERE, 'headless-env.mjs')).href
);
installEnv();

const unmuteImport = muteConsole();
const [{ Game }, { Vec2, PLAYER_RADIUS }] = await Promise.all([
  import(pathToFileURL(path.resolve(HERE, '../../js/game/Game.js')).href),
  import(pathToFileURL(path.resolve(HERE, '../../js/constants.js')).href),
]);
unmuteImport();

const GAME_PATH = path.resolve(HERE, '../../js/game/Game.js');
const GAME_SOURCE = fs.readFileSync(GAME_PATH, 'utf8');
const DIMI = 'dimis_kickboxer';
const STEP = 1 / 120;
const EPS = 1e-8;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, predicate, evidence = '') {
  let ok = false;
  let note = evidence;
  try {
    const result = typeof predicate === 'function' ? predicate() : predicate;
    ok = result === true;
    if (typeof result === 'string') note = result;
  } catch (error) {
    note = `THREW: ${error?.stack || error}`;
  }
  if (ok) passed++;
  else {
    failed++;
    failures.push({ name, evidence: note });
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` | ${note}` : ''}`);
  return ok;
}

function lineOf(needle, occurrence = 1) {
  let from = 0;
  let at = -1;
  for (let i = 0; i < occurrence; i++) {
    at = GAME_SOURCE.indexOf(needle, from);
    if (at < 0) return 0;
    from = at + needle.length;
  }
  return GAME_SOURCE.slice(0, at).split('\n').length;
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function nearly(actual, expected, tolerance = EPS) {
  return Math.abs(actual - expected) <= tolerance;
}

function runFor(seconds, tick, step = STEP) {
  let elapsed = 0;
  while (elapsed + EPS < seconds) {
    const dt = Math.min(step, seconds - elapsed);
    elapsed += dt;
    tick(dt, elapsed);
  }
}

function makeEnemy(id, x, y, { hp = 1e9, radius = 20, boss = false } = {}) {
  return {
    id,
    pos: new Vec2(x, y),
    radius,
    hp,
    maxHp: hp,
    vel: new Vec2(),
    stunned: 0,
    hits: [],
    isMegaBoss: boss,
    isBoss() { return boss; },
    takeHit(damage, game) {
      this.hits.push({ damage, game });
      this.hp -= damage;
    },
  };
}

function freshGame() {
  localStorage.clear();
  const unmute = muteConsole();
  let game;
  try {
    game = new Game();
    game.selectedCharacter = DIMI;
    game.reset();
  } finally {
    unmute();
  }

  game.player.selectedCharacter = DIMI;
  game.player.pos = new Vec2(1000, 1000);
  game.player._facing = 1;
  game.enemies = [];
  game.projectiles = [];
  game._specialRings = [];
  game._specialTrail = [];
  game._specialBeams = [];
  game.floatingTexts = [];

  const evidence = {
    bossCalls: 0,
    sparks: 0,
    impactAudio: 0,
    shakes: 0,
  };
  game._cyberAngelBossHit = () => { evidence.bossCalls++; };
  game.particles = { spawnHitSparks() { evidence.sparks++; } };
  game.audio = { playPlayerImpact() { evidence.impactAudio++; } };
  game.screenShake = { trigger() { evidence.shakes++; } };
  return { game, evidence };
}

function gloveFor(game, seconds) {
  runFor(seconds, dt => game._updateDimiMegaGlove(dt));
}

function droneFor(game, seconds) {
  runFor(seconds, dt => game._updateDimiDrones(dt));
}

function drawProbe() {
  const evidence = {
    draws: [],
    scales: [],
    rotations: [],
    translations: [],
    strokes: 0,
  };
  return {
    evidence,
    ctx: {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      strokeStyle: '',
      lineWidth: 1,
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() { evidence.strokes++; },
      translate(x, y) { evidence.translations.push([x, y]); },
      scale(x, y) { evidence.scales.push([x, y]); },
      rotate(angle) { evidence.rotations.push(angle); },
      drawImage(...args) { evidence.draws.push(args); },
    },
  };
}

function totalHits(enemies) {
  return enemies.reduce((sum, enemy) => sum + enemy.hits.length, 0);
}

function totalDamage(enemies) {
  return enemies.reduce(
    (sum, enemy) => sum + enemy.hits.reduce((subtotal, hit) => subtotal + hit.damage, 0),
    0
  );
}

console.log('=== PHASE 5 | DIMI PRODUCTION DEFECT AUDIT ===');
console.log('Real Game methods, deterministic 120 FPS inputs.\n');

console.log('A. Right/left facing, pivot, spawn direction, and collision corridor');
const facingMetrics = {};
for (const [label, dir] of [['right', 1], ['left', -1]]) {
  const { game } = freshGame();
  game.player._facing = dir;
  const forward = makeEnemy(`${label}-forward`, game.player.pos.x + dir * 200, game.player.pos.y);
  const rear = makeEnemy(`${label}-rear`, game.player.pos.x - dir * 100, game.player.pos.y);
  const offAxis = makeEnemy(`${label}-off-axis`, game.player.pos.x + dir * 200, game.player.pos.y + 106);
  const pastReach = makeEnemy(`${label}-past-reach`, game.player.pos.x + dir * 311, game.player.pos.y);
  game.enemies = [forward, rear, offAxis, pastReach];
  gloveFor(game, 2.5);

  game._dimiGlove.state = 'punch';
  game._dimiGlove.t = 0.08;
  game._dimiGlove.dir = dir;
  game._dimiGloveImg = { complete: true, naturalWidth: 512 };
  const probe = drawProbe();
  game._drawDimiMegaGlove(probe.ctx);
  const anchor = probe.evidence.translations[0];
  facingMetrics[label] = {
    dir: game._dimiGlove.dir,
    forwardHits: forward.hits.length,
    rearHits: rear.hits.length,
    offAxisHits: offAxis.hits.length,
    pastReachHits: pastReach.hits.length,
    anchorX: round(anchor?.[0] ?? NaN),
    mirrored: probe.evidence.scales.some(([x, y]) => x === dir && y === 1),
    rotation: round(probe.evidence.rotations[0] ?? NaN),
  };

  test(`${label}: only the target in the forward corridor is hit`,
    () => forward.hits.length === 1 && rear.hits.length === 0 &&
      offAxis.hits.length === 0 && pastReach.hits.length === 0,
    JSON.stringify(facingMetrics[label]));
  test(`${label}: draw anchor and sprite flip follow the snapshotted facing`,
    () => Math.sign(anchor[0] - game.player.pos.x) === dir &&
      probe.evidence.scales.some(([x, y]) => x === dir && y === 1),
    JSON.stringify(facingMetrics[label]));
  test(`${label}: glove uses its production rotation and draws one approved sprite`,
    () => probe.evidence.draws.length === 1 &&
      probe.evidence.rotations.some(angle => nearly(angle, -0.58)),
    `draws=${probe.evidence.draws.length}, rotation=${facingMetrics[label].rotation}`);
}
console.log(`  Facing evidence: ${JSON.stringify(facingMetrics)}`);

console.log('\nB. Valid-target gating, no idle fire, and stale-target cleanup');
{
  const { game, evidence } = freshGame();
  gloveFor(game, 8);
  test('no target: glove never leaves cooldown or emits attack/hit evidence',
    () => game._dimiGlove.state === 'cd' && game._specialRings.length === 0 &&
      evidence.sparks === 0 && evidence.impactAudio === 0 && evidence.shakes === 0 &&
      evidence.bossCalls === 0,
    `state=${game._dimiGlove.state}, ring=${game._specialRings.length}, sparks=${evidence.sparks}, ` +
      `audio=${evidence.impactAudio}, shake=${evidence.shakes}, bossCalls=${evidence.bossCalls}`);
  test('no target: glove does not create a hidden projectile',
    () => game.projectiles.length === 0,
    `projectiles=${game.projectiles.length}`);
}

{
  const { game } = freshGame();
  game._updateDimiDrones(0);
  droneFor(game, 8);
  const cooldowns = game._dimiDrones.map(drone => round(drone.cd));
  test('no target: all three drones remain armed without hit VFX or projectiles',
    () => game._dimiDrones.length === 3 && game._dimiDrones.every(drone => drone.cd <= 0) &&
      game._specialRings.length === 0 && game.projectiles.length === 0,
    `count=${game._dimiDrones.length}, cooldowns=${cooldowns.join(',')}, ` +
      `rings=${game._specialRings.length}, projectiles=${game.projectiles.length}`);

  const stale = makeEnemy('stale-drone-target', game.player.pos.x, game.player.pos.y, { hp: 0 });
  game.enemies = [stale];
  game._updateDimiDrones(0);
  test('dead/stale target: drones do not consume cadence or deal damage',
    () => stale.hits.length === 0 && game._dimiDrones.every(drone => drone.cd <= 0),
    `hits=${stale.hits.length}, cooldowns=${game._dimiDrones.map(d => round(d.cd)).join(',')}`);
}

let staleGloveEvidence;
{
  const { game, evidence } = freshGame();
  const target = makeEnemy('stale-glove-target', game.player.pos.x + 180, game.player.pos.y);
  game.enemies = [target];
  runFor(2.01, dt => game._updateDimiMegaGlove(dt));
  const armedState = game._dimiGlove.state;
  game.enemies = [];
  runFor(0.5, dt => game._updateDimiMegaGlove(dt));
  staleGloveEvidence = {
    armedState,
    finalState: game._dimiGlove.state,
    hits: target.hits.length,
    rings: game._specialRings.length,
    sparks: evidence.sparks,
    audio: evidence.impactAudio,
    shake: evidence.shakes,
    bossCalls: evidence.bossCalls,
  };
  test('stale target removed during windup cancels the empty-space punch',
    () => game._specialRings.length === 0 && evidence.sparks === 0 &&
      evidence.impactAudio === 0 && evidence.shakes === 0 && evidence.bossCalls === 0,
    JSON.stringify(staleGloveEvidence));
}
console.log(`  Stale-target evidence: ${JSON.stringify(staleGloveEvidence)}`);

console.log('\nC. Sparse-target DPS, hit count, cadence, range, and feedback');
const sparseMetrics = {};
{
  const { game, evidence } = freshGame();
  const target = makeEnemy('glove-sparse', game.player.pos.x + 180, game.player.pos.y);
  game.enemies = [target];
  let clock = 0;
  const hitTimes = [];
  target.takeHit = function takeHit(damage, owner) {
    this.hits.push({ damage, game: owner });
    this.hp -= damage;
    hitTimes.push(clock);
  };
  runFor(10, dt => {
    clock += dt;
    game._updateDimiMegaGlove(dt);
  });
  const intervals = hitTimes.slice(1).map((time, index) => time - hitTimes[index]);
  sparseMetrics.glove = {
    seconds: 10,
    hits: target.hits.length,
    damage: totalDamage([target]),
    dps: round(totalDamage([target]) / 10),
    hitTimes: hitTimes.map(time => round(time)),
    cadence: intervals.map(value => round(value)),
    rings: game._specialRings.length,
    sparks: evidence.sparks,
    audio: evidence.impactAudio,
    shake: evidence.shakes,
  };
  test('sparse target: glove lands 34 damage exactly once per attack cycle',
    () => target.hits.length === 3 && target.hits.every(hit => hit.damage === 34),
    JSON.stringify(sparseMetrics.glove));
  test('sparse target: repeat cadence remains stable at the measured 3.70s full cycle',
    () => intervals.length === 2 && intervals.every(value => nearly(value, 3.7, 0.02)),
    `intervals=${sparseMetrics.glove.cadence.join(',')}`);
  test('sparse target: every glove impact has ring, spark, audio, and shake feedback',
    () => game._specialRings.length === target.hits.length &&
      evidence.sparks === target.hits.length && evidence.impactAudio === target.hits.length &&
      evidence.shakes === target.hits.length,
    `hits=${target.hits.length}, rings=${game._specialRings.length}, sparks=${evidence.sparks}, ` +
      `audio=${evidence.impactAudio}, shake=${evidence.shakes}`);
}

{
  const { game } = freshGame();
  const target = makeEnemy('drone-sparse', game.player.pos.x, game.player.pos.y);
  let clock = 0;
  const hitTimes = [];
  target.takeHit = function takeHit(damage, owner) {
    this.hits.push({ damage, game: owner });
    this.hp -= damage;
    hitTimes.push(clock);
  };
  game.enemies = [target];
  runFor(10, dt => {
    clock += dt;
    game._updateDimiDrones(dt);
  });
  sparseMetrics.drones = {
    seconds: 10,
    count: game._dimiDrones.length,
    hits: target.hits.length,
    damage: totalDamage([target]),
    dps: round(totalDamage([target]) / 10),
    firstHit: round(hitTimes[0]),
    lastHit: round(hitTimes.at(-1)),
    rings: game._specialRings.length,
    projectiles: game.projectiles.length,
    beams: game._specialBeams.length,
    trails: game._specialTrail.length,
  };
  test('sparse target: exactly three drones stay active and every strike deals 14',
    () => game._dimiDrones.length === 3 && target.hits.length > 0 &&
      target.hits.every(hit => hit.damage === 14 && hit.game === game),
    JSON.stringify(sparseMetrics.drones));
  test('sparse target: measured aggregate drone output is 27 hits / 378 damage / 37.8 DPS',
    () => target.hits.length === 27 && totalDamage([target]) === 378,
    JSON.stringify(sparseMetrics.drones));
  test('sparse target: every direct drone hit creates an impact ring',
    () => game._specialRings.length === target.hits.length,
    `hits=${target.hits.length}, rings=${game._specialRings.length}`);
  test('drone fire has a visible projectile, beam, trail, or muzzle link before impact',
    () => game.projectiles.length > 0 || game._specialBeams.length > 0 ||
      game._specialTrail.length > 0,
    `hits=${target.hits.length}, projectiles=${game.projectiles.length}, ` +
      `beams=${game._specialBeams.length}, trails=${game._specialTrail.length}`);
}
console.log(`  Sparse evidence: ${JSON.stringify(sparseMetrics)}`);

console.log('\nD. Drone collision edge and crowd acquisition');
{
  const { game } = freshGame();
  const reach = PLAYER_RADIUS + 20;
  const inside = makeEnemy('inside-edge', game.player.pos.x + reach - 0.01, game.player.pos.y);
  const exact = makeEnemy('exact-edge', game.player.pos.x + reach, game.player.pos.y);
  const outside = makeEnemy('outside-edge', game.player.pos.x + reach + 0.01, game.player.pos.y);
  game.enemies = [outside, exact, inside];
  game._updateDimiDrones(1.1);
  test('drone collision is strict inside player radius + enemy radius',
    () => inside.hits.length === 1 && exact.hits.length === 0 && outside.hits.length === 0,
    `reach=${reach}, inside=${inside.hits.length}, exact=${exact.hits.length}, outside=${outside.hits.length}`);
}

let crowdMetrics;
{
  const { game } = freshGame();
  const enemies = Array.from({ length: 12 }, (_, index) => {
    const angle = index * Math.PI * 2 / 12;
    return makeEnemy(
      `crowd-${index}`,
      game.player.pos.x + Math.cos(angle) * 24,
      game.player.pos.y + Math.sin(angle) * 24,
      { hp: 14, radius: 20 }
    );
  });
  game.enemies = enemies;
  let perFramePeak = 0;
  let previousHits = 0;
  runFor(5, dt => {
    game._updateDimiDrones(dt);
    const hits = totalHits(enemies);
    perFramePeak = Math.max(perFramePeak, hits - previousHits);
    previousHits = hits;
  });
  crowdMetrics = {
    targets: enemies.length,
    uniqueHit: enemies.filter(enemy => enemy.hits.length > 0).length,
    killed: enemies.filter(enemy => enemy.hp <= 0).length,
    hits: totalHits(enemies),
    damage: totalDamage(enemies),
    perFramePeak,
    rings: game._specialRings.length,
  };
  test('crowd: all 12 contact targets are acquired and cleared in 5s',
    () => crowdMetrics.uniqueHit === 12 && crowdMetrics.killed === 12,
    JSON.stringify(crowdMetrics));
  test('crowd: strikeCommitted bounds the burst to one drone hit per frame',
    () => perFramePeak === 1,
    JSON.stringify(crowdMetrics));
}
console.log(`  Crowd evidence: ${JSON.stringify(crowdMetrics)}`);

console.log('\nE. Approved sprite visibility and runtime cleanup');
{
  const { game } = freshGame();
  game._dimiDroneImg = { complete: true, naturalWidth: 512 };
  game._updateDimiDrones(0);
  const probe = drawProbe();
  game._drawDimiDrones(probe.ctx);
  const sizes = probe.evidence.draws.map(args => [args[3], args[4]]);
  test('three approved drone sprites render with glow and body layers',
    () => probe.evidence.draws.length === 6,
    `drawCalls=${probe.evidence.draws.length}, sizes=${JSON.stringify(sizes)}`);
  test('drone body layer remains a readable 96x96 at the 120px orbit',
    () => probe.evidence.draws.filter(args => args[3] === 96 && args[4] === 96).length === 3 &&
      game._dimiDrones.every(drone => drone.r === 120),
    `body96=${probe.evidence.draws.filter(args => args[3] === 96 && args[4] === 96).length}, ` +
      `radii=${game._dimiDrones.map(drone => drone.r).join(',')}`);
}

let cleanupMetrics;
let lifecycle;
{
  lifecycle = freshGame();
  const { game } = lifecycle;
  game.enemies = [makeEnemy('long-run', game.player.pos.x, game.player.pos.y)];
  let ringPeak = 0;
  let projectilePeak = 0;
  runFor(60, dt => {
    game._updateDimiDrones(dt);
    game._updateDimiMegaGlove(dt);
    ringPeak = Math.max(ringPeak, game._specialRings.length);
    projectilePeak = Math.max(projectilePeak, game.projectiles.length);
    game._updateSpecialEffects(dt);
  });
  game.enemies = [];
  runFor(1, dt => game._updateSpecialEffects(dt));
  cleanupMetrics = {
    ringPeak,
    projectilePeak,
    finalRings: game._specialRings.length,
    finalProjectiles: game.projectiles.length,
    drones: game._dimiDrones.length,
    gloveState: game._dimiGlove.state,
  };
  test('60s runtime keeps Dimi transient arrays bounded',
    () => ringPeak <= 3 && projectilePeak === 0,
    JSON.stringify(cleanupMetrics));
  test('all Dimi impact rings expire after combat',
    () => game._specialRings.length === 0,
    JSON.stringify(cleanupMetrics));

  game.player.selectedCharacter = 'skeleton_warrior';
  game._updateDimiDrones(0);
  game._updateDimiMegaGlove(0);
  test('character switch clears stale glove and drone ownership state',
    () => game._dimiDrones === null && game._dimiGlove === null,
    `drones=${game._dimiDrones?.length ?? 'null'}, glove=${game._dimiGlove?.state ?? 'null'}`);
}
console.log(`  Cleanup evidence: ${JSON.stringify(cleanupMetrics)}`);

console.log('\nF. Reset and second-run isolation');
{
  const { game } = lifecycle;
  game.player.selectedCharacter = DIMI;
  game._updateDimiDrones(0);
  game._updateDimiMegaGlove(0);
  const firstDrones = game._dimiDrones;
  const firstGlove = game._dimiGlove;

  const unmute = muteConsole();
  try {
    game.selectedCharacter = DIMI;
    game.reset();
  } finally {
    unmute();
  }
  test('Game.reset clears drones, glove, rings, and projectiles',
    () => game._dimiDrones === null && game._dimiGlove === null &&
      game._specialRings.length === 0 && game.projectiles.length === 0,
    `drones=${game._dimiDrones?.length ?? 'null'}, glove=${game._dimiGlove?.state ?? 'null'}, ` +
      `rings=${game._specialRings.length}, projectiles=${game.projectiles.length}`);

  game.player.selectedCharacter = DIMI;
  game.player.pos = new Vec2(1000, 1000);
  game.player._facing = -1;
  game.enemies = [makeEnemy('second-run', 800, 1000)];
  game._updateDimiDrones(0);
  gloveFor(game, 2.5);
  const timers = game._dimiDrones.map(drone => round(drone.cd));
  test('second run creates fresh states and attacks in the new left-facing direction',
    () => game._dimiDrones !== firstDrones && game._dimiGlove !== firstGlove &&
      game._dimiDrones.length === 3 && game._dimiGlove.dir === -1 &&
      game.enemies[0].hits.length === 1,
    `freshDrones=${game._dimiDrones !== firstDrones}, freshGlove=${game._dimiGlove !== firstGlove}, ` +
      `dir=${game._dimiGlove.dir}, hits=${game.enemies[0].hits.length}, droneTimers=${timers.join(',')}`);
}

console.log('\nG. Root causes and targeted recommendations');
const rootCauses = [
  {
    id: 'DIMI-01',
    file: 'js/game/Game.js',
    lines: `${lineOf('const inCorridor = this.enemies.some')} -> ${lineOf("if (!g.hitDone && g.t <= 0.10)")}`,
    cause: 'Mega Glove validates a target only when entering windup. Impact then executes unconditionally after the target disappears.',
    recommendation: 'At impact, revalidate a live enemy in the snapshotted corridor or a live boss near impact; cancel to retract without hit VFX when neither exists.',
    reproduced: staleGloveEvidence.rings > 0,
  },
  {
    id: 'DIMI-02',
    file: 'js/game/Game.js',
    lines: `${lineOf('best.takeHit(14, this)')} -> ${lineOf('_drawDimiDrones(ctx)')}`,
    cause: 'Drone damage is immediate and only creates an impact ring. No projectile, beam, muzzle flash, or trail connects the visible orbiting drone to the target.',
    recommendation: 'Keep the approved drone art and direct-hit collision, but add a short-lived bounded tracer/beam plus muzzle flash from the firing drone to the selected target.',
    reproduced: sparseMetrics.drones.hits > 0 && sparseMetrics.drones.projectiles === 0 &&
      sparseMetrics.drones.beams === 0 && sparseMetrics.drones.trails === 0,
  },
];
for (const root of rootCauses) {
  console.log(`  ${root.id} ${root.file}:${root.lines} reproduced=${root.reproduced}`);
  console.log(`    Cause: ${root.cause}`);
  console.log(`    Fix:   ${root.recommendation}`);
}

console.log(`\n=== RESULT: ${passed} PASS / ${failed} FAIL ===`);
if (failures.length) {
  console.log('Current production failures:');
  for (const failure of failures) {
    console.log(`  - ${failure.name}${failure.evidence ? `: ${failure.evidence}` : ''}`);
  }
}
console.log('No production or existing file was modified. No commit was created.');
process.exitCode = failed ? 1 : 0;
