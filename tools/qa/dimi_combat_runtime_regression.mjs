// DIMI COMBAT RUNTIME REGRESSION - drives the production Mega Glove and
// Tactical Drone methods in a deterministic headless Game instance.
//
// Run: node tools/qa/dimi_combat_runtime_regression.mjs (exit 1 on failure)

import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./strip-v-loader.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(
  pathToFileURL(path.join(HERE, 'headless-env.mjs')).href
);
installEnv();

const unmuteImport = muteConsole();
const [{ Game }, { Vec2 }] = await Promise.all([
  import(pathToFileURL(path.resolve(HERE, '../../js/game/Game.js')).href),
  import(pathToFileURL(path.resolve(HERE, '../../js/constants.js')).href),
]);
unmuteImport();

const DIMI = 'dimis_kickboxer';
const STEP = 1 / 60;
const EPS = 1e-9;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  let ok = false;
  let note = '';
  try {
    const result = fn();
    ok = result === true;
    if (typeof result === 'string') note = result;
  } catch (error) {
    note = `THREW: ${error?.stack || error}`;
  }

  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push({ name, note });
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` - ${note}` : ''}`);
}

function nearly(actual, expected, tolerance = EPS) {
  return Math.abs(actual - expected) <= tolerance;
}

function makeEnemy(x, y, radius = 20) {
  return {
    pos: new Vec2(x, y),
    radius,
    hp: 1e9,
    vel: new Vec2(),
    stunned: 0,
    hits: [],
    takeHit(damage, game) {
      this.hits.push({ damage, game });
      this.hp -= damage;
    },
    isBoss() { return false; },
  };
}

function makeGame() {
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
  game.player.specialDashTimer = 0;
  game.enemies = [];
  game.projectiles = [];
  game._specialRings = [];
  game._specialTrail = [];
  game._specialBeams = [];

  const evidence = { bossCalls: 0, sparks: 0, impactAudio: 0, shakes: 0 };
  game._cyberAngelBossHit = () => { evidence.bossCalls++; };
  game.particles = { spawnHitSparks() { evidence.sparks++; } };
  game.audio = { playPlayerImpact() { evidence.impactAudio++; } };
  game.screenShake = { trigger() { evidence.shakes++; } };

  return { game, evidence };
}

function runFor(seconds, tick, step = STEP) {
  let elapsed = 0;
  while (elapsed + EPS < seconds) {
    const dt = Math.min(step, seconds - elapsed);
    elapsed += dt;
    tick(dt, elapsed);
  }
}

function gloveFor(game, seconds) {
  runFor(seconds, dt => game._updateDimiMegaGlove(dt));
}

function drawProbe() {
  const evidence = { scales: [], rotations: [], translations: [], draws: 0 };
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
      stroke() {},
      translate(x, y) { evidence.translations.push([x, y]); },
      scale(x, y) { evidence.scales.push([x, y]); },
      rotate(angle) { evidence.rotations.push(angle); },
      drawImage() { evidence.draws++; },
    },
  };
}

console.log('=== DIMI COMBAT RUNTIME REGRESSION ===');

console.log('\n-- no-target behavior --');
{
  const { game, evidence } = makeGame();
  gloveFor(game, 2.5);
  const attackEvidence = game._specialRings.length + evidence.sparks +
    evidence.impactAudio + evidence.shakes + evidence.bossCalls;

  test('Mega Glove does not fire or emit hit evidence without an eligible target', () =>
    attackEvidence === 0 ||
    `rings=${game._specialRings.length}, sparks=${evidence.sparks}, audio=${evidence.impactAudio}, ` +
      `shake=${evidence.shakes}, bossAoECalls=${evidence.bossCalls}`);
  test('Mega Glove does not create projectiles without a target', () =>
    game.projectiles.length === 0 || `projectiles=${game.projectiles.length}`);
}

{
  const { game } = makeGame();
  game._updateDimiDrones(0);
  runFor(2.2, dt => game._updateDimiDrones(dt));
  const cds = game._dimiDrones.map(drone => +drone.cd.toFixed(3));

  test('three drones emit no hit VFX/projectiles while no target exists', () =>
    (game._specialRings.length === 0 && game.projectiles.length === 0) ||
    `rings=${game._specialRings.length}, projectiles=${game.projectiles.length}`);
  test('no-target drone scans do not consume the ready-to-fire cadence', () =>
    game._dimiDrones.every(drone => drone.cd <= EPS) || `cooldowns=${cds.join(',')}`);

  const arrived = makeEnemy(game.player.pos.x, game.player.pos.y);
  game.enemies = [arrived];
  game._updateDimiDrones(0);
  test('an arriving contact threat triggers one armed drone per frame', () =>
    arrived.hits.length === 1 || `hits=${arrived.hits.length}, cooldowns=${cds.join(',')}`);
}

console.log('\n-- target and range gating --');
{
  const { game } = makeGame();
  const p = game.player.pos;
  const ahead = makeEnemy(p.x + 200, p.y);
  const behind = makeEnemy(p.x - 100, p.y);
  const tooFar = makeEnemy(p.x + 400, p.y);
  const offAxis = makeEnemy(p.x + 180, p.y + 120);
  game.enemies = [ahead, behind, tooFar, offAxis];
  gloveFor(game, 2.5);

  test('right-facing glove hits only the forward in-range corridor target', () =>
    (ahead.hits.length === 1 && behind.hits.length === 0 &&
      tooFar.hits.length === 0 && offAxis.hits.length === 0) ||
    `ahead=${ahead.hits.length}, behind=${behind.hits.length}, far=${tooFar.hits.length}, offAxis=${offAxis.hits.length}`);
  test('Mega Glove production damage is exactly 34 per landed punch', () =>
    (ahead.hits.length === 1 && ahead.hits[0].damage === 34) ||
    `damages=${ahead.hits.map(hit => hit.damage).join(',') || 'none'}`);
}

{
  const { game } = makeGame();
  const p = game.player.pos;
  game.player._facing = -1;
  const left = makeEnemy(p.x - 200, p.y);
  const right = makeEnemy(p.x + 100, p.y);
  game.enemies = [left, right];
  gloveFor(game, 2.5);

  test('left-facing glove snapshots facing and reverses its damage corridor', () =>
    (game._dimiGlove.dir === -1 && left.hits.length === 1 && right.hits.length === 0) ||
    `dir=${game._dimiGlove.dir}, left=${left.hits.length}, right=${right.hits.length}`);

  game._dimiGlove.state = 'punch';
  game._dimiGlove.t = 0.08;
  const { ctx, evidence } = drawProbe();
  game._drawDimiMegaGlove(ctx);
  test('glove renderer exposes left-facing mirror evidence via scale(-1, 1)', () =>
    evidence.scales.some(([x, y]) => x === -1 && y === 1) ||
    `scales=${JSON.stringify(evidence.scales)}`);
  test('glove renderer applies the production punch rotation (-0.58 rad)', () =>
    (evidence.draws === 1 && evidence.rotations.some(angle => nearly(angle, -0.58))) ||
    `draws=${evidence.draws}, rotations=${evidence.rotations.map(v => v.toFixed(3)).join(',')}`);
}

{
  const { game } = makeGame();
  const p = game.player.pos;
  const inRange = makeEnemy(p.x, p.y);
  const outOfRange = makeEnemy(p.x + 1000, p.y);
  game.enemies = [outOfRange, inRange];
  game._updateDimiDrones(0.4);

  test('Dimi production creates exactly three orbiting drones', () =>
    game._dimiDrones.length === 3 || `count=${game._dimiDrones.length}`);
  test('drone orbit state uses radius 120 and 120-degree spacing', () => {
    const drones = game._dimiDrones;
    const spacingA = (drones[1].ang - drones[0].ang + Math.PI * 2) % (Math.PI * 2);
    const spacingB = (drones[2].ang - drones[1].ang + Math.PI * 2) % (Math.PI * 2);
    return (drones.every(drone => drone.r === 120) &&
      nearly(spacingA, Math.PI * 2 / 3) && nearly(spacingB, Math.PI * 2 / 3)) ||
      `radii=${drones.map(drone => drone.r).join(',')}, spacing=${spacingA.toFixed(3)},${spacingB.toFixed(3)}`;
  });
  test('drone range gate damages the in-range target and ignores the far target', () =>
    (inRange.hits.length === 1 && outOfRange.hits.length === 0) ||
    `inRange=${inRange.hits.length}, far=${outOfRange.hits.length}`);
  test('a drone strike routes exactly 14 damage through takeHit', () =>
    (inRange.hits.length === 1 && inRange.hits[0].damage === 14 && inRange.hits[0].game === game) ||
    `hits=${inRange.hits.length}, damages=${inRange.hits.map(hit => hit.damage).join(',') || 'none'}`);
}

console.log('\n-- drone cadence and bounded runtime state --');
{
  const { game } = makeGame();
  const target = makeEnemy(game.player.pos.x, game.player.pos.y);
  let clock = 0;
  const hitTimes = [];
  target.takeHit = function takeHit(damage, owner) {
    this.hits.push({ damage, game: owner });
    hitTimes.push(clock);
  };
  game.enemies = [target];
  game._updateDimiDrones(0);
  game._dimiDrones[0].cd = 0;
  game._dimiDrones[1].cd = 999;
  game._dimiDrones[2].cd = 999;

  game._updateDimiDrones(0);
  clock = 0.55;
  game._updateDimiDrones(0.55);
  const hitsBeforeCadence = target.hits.length;
  clock = 1.09;
  game._updateDimiDrones(0.54);
  const hitsStillBeforeCadence = target.hits.length;
  clock = 1.11;
  game._updateDimiDrones(0.02);

  test('one drone cannot refire before its 1.1s cadence', () =>
    (hitsBeforeCadence === 1 && hitsStillBeforeCadence === 1) ||
    `hits@0.55=${hitsBeforeCadence}, hits@1.09=${hitsStillBeforeCadence}`);
  test('one drone refires at the 1.1s cadence with repeat 14 damage', () =>
    (target.hits.length === 2 && target.hits.every(hit => hit.damage === 14) &&
      nearly(hitTimes[1] - hitTimes[0], 1.11, 0.02)) ||
    `hits=${target.hits.length}, times=${hitTimes.join(',')}, damages=${target.hits.map(hit => hit.damage).join(',')}`);
  test('firing rearms the drone cooldown to 1.1s', () =>
    nearly(game._dimiDrones[0].cd, 1.1) || `cooldown=${game._dimiDrones[0].cd}`);
}

let lifecycleGame;
let oldDrones;
let oldGlove;
{
  const rig = makeGame();
  const game = rig.game;
  lifecycleGame = game;
  game.enemies = [makeEnemy(game.player.pos.x + 200, game.player.pos.y)];

  let ringPeak = 0;
  let projectilePeak = game.projectiles.length;
  runFor(120, dt => {
    game._updateDimiDrones(dt);
    game._updateDimiMegaGlove(dt);
    ringPeak = Math.max(ringPeak, game._specialRings.length);
    projectilePeak = Math.max(projectilePeak, game.projectiles.length);
    game._updateSpecialEffects(dt);
  });

  game.enemies = [];
  runFor(1, dt => game._updateSpecialEffects(dt));
  oldDrones = game._dimiDrones;
  oldGlove = game._dimiGlove;

  test('120s combat keeps Dimi VFX/projectiles bounded', () =>
    (ringPeak <= 8 && projectilePeak === 0) ||
    `ringPeak=${ringPeak}, projectilePeak=${projectilePeak}`);
  test('Dimi hit rings expire after combat', () =>
    game._specialRings.length === 0 || `rings=${game._specialRings.length}`);
}

console.log('\n-- reset and second-run isolation --');
{
  const game = lifecycleGame;
  const unmute = muteConsole();
  try {
    game.selectedCharacter = DIMI;
    game.reset();
  } finally {
    unmute();
  }

  test('reset clears Dimi drones, glove, rings, and projectiles', () =>
    (game._dimiDrones === null && game._dimiGlove === null &&
      game._specialRings.length === 0 && game.projectiles.length === 0) ||
    `drones=${game._dimiDrones?.length ?? 'null'}, glove=${game._dimiGlove?.state ?? 'null'}, ` +
      `rings=${game._specialRings.length}, projectiles=${game.projectiles.length}`);

  game.player.selectedCharacter = DIMI;
  game.player.pos = new Vec2(1000, 1000);
  game.player._facing = 1;
  game.enemies = [];
  game._updateDimiDrones(0);
  game._updateDimiMegaGlove(0);
  const secondCds = game._dimiDrones.map(drone => +drone.cd.toFixed(3));

  test('second run creates fresh Dimi state with original timers', () =>
    (game._dimiDrones !== oldDrones && game._dimiGlove !== oldGlove &&
      secondCds.join(',') === '0.4,0.7,1' && game._dimiGlove.state === 'cd' &&
      nearly(game._dimiGlove.t, 2)) ||
    `freshDrones=${game._dimiDrones !== oldDrones}, freshGlove=${game._dimiGlove !== oldGlove}, ` +
      `droneCds=${secondCds.join(',')}, glove=${game._dimiGlove.state}/${game._dimiGlove.t}`);

  game.player.selectedCharacter = 'skeleton_warrior';
  game._updateDimiDrones(0);
  game._updateDimiMegaGlove(0);
  test('leaving Dimi clears both character-owned runtime states', () =>
    (game._dimiDrones === null && game._dimiGlove === null) ||
    `drones=${game._dimiDrones?.length ?? 'null'}, glove=${game._dimiGlove?.state ?? 'null'}`);
}

console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
if (failures.length) {
  console.log('Current production failures:');
  for (const failure of failures) {
    console.log(`  - ${failure.name}${failure.note ? `: ${failure.note}` : ''}`);
  }
}

process.exit(failed ? 1 : 0);
