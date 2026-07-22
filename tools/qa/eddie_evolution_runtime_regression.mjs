// EDDIE EVOLUTION RUNTIME REGRESSION
// Deterministic source/runtime proof for Solo of the Damned and Amp Overdrive Wall.
// Run: node tools/qa/eddie_evolution_runtime_regression.mjs

import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./strip-v-loader.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(
  pathToFileURL(path.join(HERE, 'headless-env.mjs')).href
);
installEnv();

Math.random = () => 0.5;

let unmute = muteConsole();
const { Game } = await import(
  pathToFileURL(path.resolve(HERE, '../../js/game/Game.js')).href
);
const {
  BuildEngineRuntime,
  EVOLUTION_RECIPES,
  PASSIVE_DEFS,
  WEAPON_DEFS,
} = await import(
  pathToFileURL(path.resolve(HERE, '../../js/game/BuildEngine.js')).href
);
unmute();

const EDDIE = 'eddie';
const STEP = 1 / 120;
const EPS = 1e-7;

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
  if (ok) passed++;
  else {
    failed++;
    failures.push({ name, note });
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` - ${note}` : ''}`);
}

function nearly(actual, expected, tolerance = EPS) {
  return Math.abs(actual - expected) <= tolerance;
}

function makeEnemy(id, x, y, { boss = false, radius = 12 } = {}) {
  return {
    id,
    pos: { x, y },
    radius,
    hp: 1e9,
    maxHp: 1e9,
    hits: [],
    isMegaBoss: boss,
    isBoss() { return boss; },
    takeHit(damage, game) {
      this.hits.push({ damage, game });
      this.hp -= damage;
    },
  };
}

function makeRig() {
  const game = {
    selectedCharacter: EDDIE,
    player: { pos: { x: 0, y: 0 }, _facing: 1 },
    enemies: [],
    _spatialGrid: null,
    _weaponLevels: new Map([['solo_red_thunder', 5]]),
    _consumedWeapons: new Set(),
    _evolvedWeapons: new Map(),
    timeAlive: 0,
    triggerAnnouncement() {},
    _capBossDamage(_enemy, damage) { return damage; },
  };
  return { game, runtime: new BuildEngineRuntime(game) };
}

function addPassiveToMax(runtime, passiveId) {
  const max = PASSIVE_DEFS[passiveId].maxLevel;
  for (let i = 0; i < max; i++) runtime.addPassive(passiveId);
}

function activateSolo(rig) {
  rig.game._weaponLevels.set('solo_red_thunder', 5);
  addPassiveToMax(rig.runtime, 'forbidden_amplifier');
  return rig.runtime._evolve('solo_red_thunder');
}

function activateWall(rig) {
  rig.runtime.addWeapon('feedback_cabinet');
  rig.runtime.weapons.get('feedback_cabinet').level = 5;
  addPassiveToMax(rig.runtime, 'overdriven_vacuum_tube');
  return rig.runtime._evolve('feedback_cabinet');
}

function runFor(seconds, update, step = STEP) {
  let elapsed = 0;
  while (elapsed + EPS < seconds) {
    const dt = Math.min(step, seconds - elapsed);
    update(dt);
    elapsed += dt;
  }
}

function ringEnemies(innerCount = 8, outerCount = 12) {
  const enemies = [];
  for (let i = 0; i < innerCount; i++) {
    const angle = i * Math.PI * 2 / innerCount;
    enemies.push(makeEnemy(`inner-${i}`, Math.cos(angle) * 100, Math.sin(angle) * 100));
  }
  for (let i = 0; i < outerCount; i++) {
    const angle = i * Math.PI * 2 / outerCount;
    enemies.push(makeEnemy(`outer-${i}`, Math.cos(angle) * 220, Math.sin(angle) * 220));
  }
  return enemies;
}

function hitSummary(enemies) {
  return {
    hits: enemies.reduce((sum, enemy) => sum + enemy.hits.length, 0),
    unique: enemies.filter(enemy => enemy.hits.length > 0).length,
    damage: enemies.reduce(
      (sum, enemy) => sum + enemy.hits.reduce((n, hit) => n + hit.damage, 0),
      0
    ),
  };
}

function measureWall({ evolved, seconds = 4.79, boss = true }) {
  const rig = makeRig();
  const target = makeEnemy('wall-target', 120, 0, { boss, radius: 20 });
  rig.game.enemies = [target];
  rig.runtime.addWeapon('feedback_cabinet');
  const weapon = rig.runtime.weapons.get('feedback_cabinet');
  weapon.level = 5;
  addPassiveToMax(rig.runtime, 'overdriven_vacuum_tube');
  if (evolved) rig.runtime._evolve('feedback_cabinet');
  weapon.cd = 0;

  let peak = 0, casts = 0;
  runFor(seconds, dt => {
    const cdBefore = weapon.cd;
    rig.runtime.update(dt);
    if (weapon.cd > cdBefore) casts++;
    peak = Math.max(peak, weapon.waves?.length || 0);
  });
  const total = target.hits.reduce((sum, hit) => sum + hit.damage, 0);
  const originalX = target.pos.x;
  weapon.cd = 999;
  runFor(2, dt => rig.runtime.update(dt));
  return {
    hits: target.hits.length,
    total,
    casts,
    peak,
    cleaned: (weapon.waves?.length || 0) === 0,
    bossMoved: target.pos.x !== originalX,
  };
}

console.log('=== EDDIE EVOLUTION RUNTIME REGRESSION ===');

console.log('\n-- source contract and production eligibility --');
test('Eddie recipe catalog points at the intended base weapons and catalysts', () => {
  const solo = EVOLUTION_RECIPES.be_solo_of_the_damned;
  const wall = EVOLUTION_RECIPES.be_amp_overdrive_wall;
  return (
    solo?.weapon === 'solo_red_thunder' && solo.passive === 'forbidden_amplifier' &&
    wall?.weapon === 'feedback_cabinet' && wall.passive === 'overdriven_vacuum_tube'
  ) || `solo=${solo?.weapon}/${solo?.passive}, wall=${wall?.weapon}/${wall?.passive}`;
});
test('both Eddie evolutions require weapon L5 and catalyst L3', () => {
  const recipes = [
    EVOLUTION_RECIPES.be_solo_of_the_damned,
    EVOLUTION_RECIPES.be_amp_overdrive_wall,
  ];
  return recipes.every(recipe => recipe.weaponLevel === 5 && recipe.passiveLevel === 3) ||
    recipes.map(recipe => `${recipe.weaponLevel}+${recipe.passiveLevel}`).join(',');
});
test('Solo remains an external legacy base while Feedback Cabinet is BuildEngine-native', () =>
  (WEAPON_DEFS.solo_red_thunder.external === true &&
    WEAPON_DEFS.feedback_cabinet.external !== true) ||
  `solo.external=${WEAPON_DEFS.solo_red_thunder.external}, feedback.external=${WEAPON_DEFS.feedback_cabinet.external}`
);

{
  const solo = makeRig();
  test('Solo rejects evolution while its catalyst is missing', () =>
    !solo.runtime._readyEvolutions().some(entry => entry.eid === 'be_solo_of_the_damned') ||
    'recipe was ready without catalyst'
  );
  const activated = activateSolo(solo);
  const state = solo.runtime.weapons.get('solo_red_thunder');
  test('Solo evolves only after production eligibility is complete', () =>
    (activated && state?.evolved && state.level === 5) ||
    `activated=${activated}, evolved=${state?.evolved}, level=${state?.level}`
  );
  test('Solo evolution consumes the external base and records one event', () =>
    (solo.game._consumedWeapons.has('solo_red_thunder') &&
      solo.runtime.evolutionEvents.length === 1 &&
      solo.runtime.evolutionEvents[0].eid === 'be_solo_of_the_damned') ||
    `consumed=${solo.game._consumedWeapons.has('solo_red_thunder')}, events=${JSON.stringify(solo.runtime.evolutionEvents)}`
  );
}

{
  const wall = makeRig();
  wall.runtime.addWeapon('feedback_cabinet');
  wall.runtime.weapons.get('feedback_cabinet').level = 5;
  test('Amp Wall rejects evolution while its catalyst is missing', () =>
    !wall.runtime._readyEvolutions().some(entry => entry.eid === 'be_amp_overdrive_wall') ||
    'recipe was ready without catalyst'
  );
  const activated = activateWall(wall);
  test('Amp Wall evolves the existing BuildEngine weapon and records one event', () => {
    const state = wall.runtime.weapons.get('feedback_cabinet');
    return (activated && state?.evolved && state.level === 5 &&
      wall.runtime.evolutionEvents.at(-1)?.eid === 'be_amp_overdrive_wall') ||
      `activated=${activated}, state=${JSON.stringify(state)}, events=${JSON.stringify(wall.runtime.evolutionEvents)}`;
  });
}

console.log('\n-- Solo of the Damned swarm, cadence, and bounds --');
{
  const rig = makeRig();
  activateSolo(rig);
  const weapon = rig.runtime.weapons.get('solo_red_thunder');
  const enemies = ringEnemies();
  rig.game.enemies = enemies;

  rig.runtime.update(0.79);
  test('Solo does not fire before its deterministic 0.8s opening delay', () =>
    hitSummary(enemies).hits === 0 || `hits=${hitSummary(enemies).hits}`
  );
  rig.runtime.update(0.011);
  const first = hitSummary(enemies);
  test('one Solo chord emits 8 primary hits and 8 chain hits at catalyst L3', () =>
    first.hits === 16 || `hits=${first.hits}, unique=${first.unique}, damage=${first.damage}`
  );
  test('Solo chain hops expand into 16 distinct swarm targets', () =>
    first.unique === 16 || `unique=${first.unique}, hits=${first.hits}`
  );
  test('Solo chord damage is finite and matches the 8 primary + 8 hop contract', () => {
    const primary = 30 * 1.28;
    const expected = 8 * primary + 8 * primary * 0.6;
    return (Number.isFinite(first.damage) && nearly(first.damage, expected)) ||
      `damage=${first.damage}, expected=${expected}`;
  });

  const hitsAfterFirst = first.hits;
  rig.runtime.update(2.18);
  test('Solo cannot refire before its 2.2s cadence', () =>
    hitSummary(enemies).hits === hitsAfterFirst ||
    `before=${hitsAfterFirst}, after=${hitSummary(enemies).hits}`
  );
  rig.runtime.update(0.021);
  test('Solo refires when the 2.2s cadence elapses', () =>
    hitSummary(enemies).hits === hitsAfterFirst * 2 ||
    `expected=${hitsAfterFirst * 2}, actual=${hitSummary(enemies).hits}`
  );

  let boltPeak = weapon.bolts.length;
  for (let i = 0; i < 40; i++) {
    rig.runtime.update(2.2);
    boltPeak = Math.max(boltPeak, weapon.bolts.length);
  }
  test('Solo visual bolt state stays within its hard bound during repeated chords', () =>
    boltPeak <= 10 || `boltPeak=${boltPeak}`
  );
  weapon.chordT = 999;
  rig.runtime.update(0.23);
  test('Solo visual bolts expire after combat', () =>
    weapon.bolts.length === 0 || `bolts=${weapon.bolts.length}`
  );
}

console.log('\n-- Amp Overdrive Wall boss tuning and runtime bounds --');
{
  const base = measureWall({ evolved: false });
  const evolved = measureWall({ evolved: true });
  const ratio = evolved.total / base.total;
  console.log(
    `  evidence  L5 base boss: ${base.casts} casts / ${base.hits} hits / ${base.total.toFixed(2)} damage; ` +
    `evolved wall: ${evolved.casts} casts / ${evolved.hits} hits / ${evolved.total.toFixed(2)} damage; ratio=${ratio.toFixed(3)}`
  );

  test('4.79s cadence window yields four base volleys and two evolved walls', () =>
    (base.casts === 4 && evolved.casts === 2) ||
    `baseCasts=${base.casts}, evolvedCasts=${evolved.casts}`
  );
  test('evolved wall delivers three cabinet impacts per boss crossing', () =>
    evolved.hits === evolved.casts * 3 ||
    `casts=${evolved.casts}, hits=${evolved.hits}`
  );
  test('base and evolved boss damage match their exact damage/multiplier contracts', () => {
    const catalyst = 1.35;
    const expectedBase = base.casts * 3 * 26 * catalyst * 0.80;
    const expectedEvolved = evolved.casts * 3 * 34 * catalyst * 0.75;
    return (nearly(base.total, expectedBase) && nearly(evolved.total, expectedEvolved)) ||
      `base=${base.total}/${expectedBase}, evolved=${evolved.total}/${expectedEvolved}`;
  });
  test('evolved wall retains at least 60% of L5 base sustained boss damage', () =>
    ratio >= 0.60 || `ratio=${ratio.toFixed(3)}, base=${base.total}, evolved=${evolved.total}`
  );
  test('evolved wall never displaces a boss', () =>
    evolved.bossMoved === false || 'boss position changed'
  );
  test('base and evolved wave arrays remain bounded and clean after idle', () =>
    (base.peak <= WEAPON_DEFS.feedback_cabinet.maxActive && evolved.peak <= 1 &&
      base.cleaned && evolved.cleaned) ||
    `basePeak=${base.peak}, evolvedPeak=${evolved.peak}, baseClean=${base.cleaned}, evolvedClean=${evolved.cleaned}`
  );
}

{
  const rig = makeRig();
  activateWall(rig);
  const weapon = rig.runtime.weapons.get('feedback_cabinet');
  weapon.cd = 0;
  rig.game.enemies = Array.from({ length: 9 }, (_, index) =>
    makeEnemy(`wall-swarm-${index}`, 120, -240 + index * 60)
  );
  runFor(1.1, dt => rig.runtime.update(dt));
  const summary = hitSummary(rig.game.enemies);
  test('one evolved wall crosses and hits all 9 spread swarm targets once', () =>
    (summary.unique === 9 && summary.hits === 9) ||
    `unique=${summary.unique}, hits=${summary.hits}`
  );
}

console.log('\n-- real reset and clean second run --');
{
  unmute = muteConsole();
  const game = new Game();
  game.selectedCharacter = EDDIE;
  game.reset();
  unmute();
  game._spatialGrid = null;
  game._capBossDamage = (_enemy, damage) => damage;

  const firstRuntime = game.buildEngine;
  game._weaponLevels.set('solo_red_thunder', 5);
  addPassiveToMax(firstRuntime, 'forbidden_amplifier');
  firstRuntime._evolve('solo_red_thunder');
  firstRuntime.addWeapon('feedback_cabinet');
  firstRuntime.weapons.get('feedback_cabinet').level = 5;
  addPassiveToMax(firstRuntime, 'overdriven_vacuum_tube');
  firstRuntime._evolve('feedback_cabinet');
  const firstSolo = firstRuntime.weapons.get('solo_red_thunder');
  const firstWall = firstRuntime.weapons.get('feedback_cabinet');

  unmute = muteConsole();
  game.selectedCharacter = EDDIE;
  game.reset();
  unmute();

  test('Game.reset replaces Eddie BuildEngine runtime and clears both evolutions', () =>
    (game.buildEngine !== firstRuntime && game.buildEngine.weapons.size === 0 &&
      game.buildEngine.passives.size === 0 && game.buildEngine.evolutionEvents.length === 0 &&
      game._consumedWeapons.size === 0) ||
    `fresh=${game.buildEngine !== firstRuntime}, weapons=${game.buildEngine.weapons.size}, ` +
      `passives=${game.buildEngine.passives.size}, events=${game.buildEngine.evolutionEvents.length}, consumed=${game._consumedWeapons.size}`
  );
  test('reset restores Eddie legacy Solo base at level 1', () =>
    game._weaponLevels.get('solo_red_thunder') === 1 ||
    `soloLevel=${game._weaponLevels.get('solo_red_thunder')}`
  );

  const secondRuntime = game.buildEngine;
  game._weaponLevels.set('solo_red_thunder', 5);
  addPassiveToMax(secondRuntime, 'forbidden_amplifier');
  const secondSoloActivated = secondRuntime._evolve('solo_red_thunder');
  secondRuntime.addWeapon('feedback_cabinet');
  secondRuntime.weapons.get('feedback_cabinet').level = 5;
  addPassiveToMax(secondRuntime, 'overdriven_vacuum_tube');
  const secondWallActivated = secondRuntime._evolve('feedback_cabinet');

  test('second run creates fresh Eddie weapon objects and exactly two new evolution events', () => {
    const secondSolo = secondRuntime.weapons.get('solo_red_thunder');
    const secondWall = secondRuntime.weapons.get('feedback_cabinet');
    return (secondSoloActivated && secondWallActivated &&
      secondSolo !== firstSolo && secondWall !== firstWall &&
      secondRuntime.evolutionEvents.length === 2 &&
      secondRuntime.evolutionEvents.map(event => event.eid).join(',') ===
        'be_solo_of_the_damned,be_amp_overdrive_wall') ||
      `solo=${secondSoloActivated}, wall=${secondWallActivated}, freshSolo=${secondSolo !== firstSolo}, ` +
        `freshWall=${secondWall !== firstWall}, events=${JSON.stringify(secondRuntime.evolutionEvents)}`;
  });
  test('Eddie BuildEngine evolution never writes the legacy evolved layer', () =>
    game._evolvedWeapons.size === 0 || `legacyEvolved=${game._evolvedWeapons.size}`
  );
}

console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
if (failures.length) {
  console.log('Current production failures:');
  for (const failure of failures) {
    console.log(`  - ${failure.name}${failure.note ? `: ${failure.note}` : ''}`);
  }
}

process.exit(failed ? 1 : 0);
