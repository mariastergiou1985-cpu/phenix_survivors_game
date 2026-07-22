// DIMI WING EVOLUTION RUNTIME REGRESSION
// Production comparison: L5 Holographic Energy Knuckles vs Wing Guillotine.
// Run: node tools/qa/dimi_wing_evolution_runtime_regression.mjs

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

const DIMI = 'dimis_kickboxer';
const WEAPON = 'holo_energy_knuckles';
const PASSIVE = 'seraphic_wing_array';
const EVOLUTION = 'be_wing_guillotine';
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
    selectedCharacter: DIMI,
    player: { pos: { x: 0, y: 0 }, _facing: 1 },
    enemies: [],
    _spatialGrid: null,
    _weaponLevels: new Map(),
    _consumedWeapons: new Set(),
    _evolvedWeapons: new Map(),
    timeAlive: 0,
    triggerAnnouncement() {},
    _capBossDamage(_enemy, damage) { return damage; },
  };
  return { game, runtime: new BuildEngineRuntime(game) };
}

function addPassiveToMax(runtime) {
  const max = PASSIVE_DEFS[PASSIVE].maxLevel;
  for (let i = 0; i < max; i++) runtime.addPassive(PASSIVE);
}

function armWing(rig, evolved) {
  rig.runtime.addWeapon(WEAPON);
  const weapon = rig.runtime.weapons.get(WEAPON);
  weapon.level = 5;
  addPassiveToMax(rig.runtime);
  if (evolved && !rig.runtime._evolve(WEAPON)) throw new Error('production evolution rejected');
  weapon.cd = 0;
  return weapon;
}

function runFor(seconds, update, step = STEP) {
  let elapsed = 0;
  while (elapsed + EPS < seconds) {
    const dt = Math.min(step, seconds - elapsed);
    update(dt);
    elapsed += dt;
  }
}

function summary(enemies) {
  return {
    hits: enemies.reduce((sum, enemy) => sum + enemy.hits.length, 0),
    unique: enemies.filter(enemy => enemy.hits.length > 0).length,
    damage: enemies.reduce(
      (sum, enemy) => sum + enemy.hits.reduce((total, hit) => total + hit.damage, 0),
      0
    ),
  };
}

function measureBoss(evolved, seconds = 4) {
  const rig = makeRig();
  const target = makeEnemy('boss', 90, 0, { boss: true, radius: 18 });
  rig.game.enemies = [target];
  const weapon = armWing(rig, evolved);
  let casts = 0;
  let fistPeak = 0;
  let wingPeak = 0;
  runFor(seconds, dt => {
    const cdBefore = weapon.cd;
    rig.runtime.update(dt);
    if (weapon.cd > cdBefore) casts++;
    fistPeak = Math.max(fistPeak, weapon.fists?.length || 0);
    wingPeak = Math.max(wingPeak, weapon.wings?.length || 0);
  });
  const result = {
    casts,
    ...summary([target]),
    fistPeak,
    wingPeak,
  };
  weapon.cd = 999;
  runFor(2, dt => rig.runtime.update(dt));
  result.cleaned = (weapon.fists?.length || 0) === 0 && (weapon.wings?.length || 0) === 0;
  return result;
}

function spreadSwarm(count = 18, radius = 96) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * Math.PI * 2 / count;
    return makeEnemy(`swarm-${index}`, Math.cos(angle) * radius, Math.sin(angle) * radius, { radius: 10 });
  });
}

function measureSwarm(evolved, seconds = 4) {
  const rig = makeRig();
  const enemies = spreadSwarm();
  rig.game.enemies = enemies;
  const weapon = armWing(rig, evolved);
  let casts = 0;
  runFor(seconds, dt => {
    const cdBefore = weapon.cd;
    rig.runtime.update(dt);
    if (weapon.cd > cdBefore) casts++;
  });
  return { casts, ...summary(enemies) };
}

console.log('=== DIMI WING EVOLUTION RUNTIME REGRESSION ===');

console.log('\n-- production contract --');
test('Wing Guillotine recipe uses the Dimi L5 knuckles and L3 wing catalyst', () => {
  const recipe = EVOLUTION_RECIPES[EVOLUTION];
  return (
    recipe?.weapon === WEAPON && recipe.passive === PASSIVE &&
    recipe.weaponLevel === 5 && recipe.passiveLevel === 3
  ) || JSON.stringify(recipe);
});
test('base production contract remains two L5 fists with pierce two', () => {
  const def = WEAPON_DEFS[WEAPON];
  return (
    def.damage[4] === 37 && def.cooldown[4] === 1 &&
    def.amount[4] === 2 && def.pierce === 2 && def.maxActive === 8
  ) || JSON.stringify(def);
});

console.log('\n-- real hit geometry --');
{
  const rig = makeRig();
  const at = (id, angle, distance = 90) => makeEnemy(
    id,
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
    { radius: 8 }
  );
  const front = at('front', 0);
  const upper = at('upper', 0.75);
  const lower = at('lower', -0.75);
  const rear = at('rear', Math.PI);
  const outside = at('outside', 0, 150);
  rig.game.enemies = [front, upper, lower, rear, outside];
  armWing(rig, true);
  rig.runtime.update(0.13);

  test('the selected front target is caught by both scissoring blades', () =>
    front.hits.length === 2 || `frontHits=${front.hits.length}`
  );
  test('each forward flank is covered once without leaking behind Dimi', () =>
    (upper.hits.length === 1 && lower.hits.length === 1 && rear.hits.length === 0) ||
    `upper=${upper.hits.length}, lower=${lower.hits.length}, rear=${rear.hits.length}`
  );
  test('Wing Guillotine respects its real radial edge', () =>
    outside.hits.length === 0 || `outsideHits=${outside.hits.length}`
  );
}

console.log('\n-- boss and spread-swarm production measurements --');
{
  const base = measureBoss(false);
  const evolved = measureBoss(true);
  const ratio = evolved.damage / base.damage;
  console.log(
    `  evidence boss 4.00s: base=${base.casts} casts/${base.hits} hits/${base.damage.toFixed(3)} dmg; ` +
    `evolved=${evolved.casts} casts/${evolved.hits} hits/${evolved.damage.toFixed(3)} dmg; ratio=${ratio.toFixed(3)}; ` +
    `arrayPeaks=${base.fistPeak}/${evolved.wingPeak}; cleaned=${base.cleaned && evolved.cleaned}`
  );

  test('base and evolved cadence both produce four casts in 4.00s', () =>
    (base.casts === 4 && evolved.casts === 4) ||
    `baseCasts=${base.casts}, evolvedCasts=${evolved.casts}`
  );
  test('L5 base boss damage matches two production fists per cast', () => {
    const expected = base.casts * 2 * 37 * 1.28 * 0.85;
    return nearly(base.damage, expected) || `actual=${base.damage}, expected=${expected}`;
  });
  test('evolved boss damage matches two production wing blades per cast', () => {
    const recipe = EVOLUTION_RECIPES[EVOLUTION];
    const expected = evolved.casts * 2 * recipe.wings.dmg * 1.28 * recipe.bossMultiplier;
    return nearly(evolved.damage, expected) || `actual=${evolved.damage}, expected=${expected}`;
  });
  test('Wing Guillotine is not a sustained boss-damage downgrade', () =>
    ratio >= 1 || `ratio=${ratio.toFixed(3)}, base=${base.damage}, evolved=${evolved.damage}`
  );
  test('boss runtime arrays stay bounded and fully expire', () =>
    (base.fistPeak <= WEAPON_DEFS[WEAPON].maxActive && evolved.wingPeak <= 1 &&
      base.cleaned && evolved.cleaned) ||
    `basePeak=${base.fistPeak}, evolvedPeak=${evolved.wingPeak}, baseClean=${base.cleaned}, evolvedClean=${evolved.cleaned}`
  );

  const baseSwarm = measureSwarm(false);
  const evolvedSwarm = measureSwarm(true);
  console.log(
    `  evidence swarm 4.00s: base=${baseSwarm.casts} casts/${baseSwarm.hits} hits/` +
    `${baseSwarm.unique} unique/${baseSwarm.damage.toFixed(3)} dmg; evolved=${evolvedSwarm.casts} casts/` +
    `${evolvedSwarm.hits} hits/${evolvedSwarm.unique} unique/${evolvedSwarm.damage.toFixed(3)} dmg`
  );
  test('Wing Guillotine expands real spread-swarm coverage over the L5 base', () =>
    evolvedSwarm.unique > baseSwarm.unique ||
    `baseUnique=${baseSwarm.unique}, evolvedUnique=${evolvedSwarm.unique}`
  );
  test('Wing Guillotine does not lose total damage in the spread-swarm target', () =>
    evolvedSwarm.damage >= baseSwarm.damage ||
    `baseDamage=${baseSwarm.damage}, evolvedDamage=${evolvedSwarm.damage}`
  );
}

console.log('\n-- actual reset and second-run isolation --');
{
  unmute = muteConsole();
  let game;
  try {
    game = new Game();
    game.selectedCharacter = DIMI;
    game.reset();
  } finally {
    unmute();
  }
  game.player.pos = { x: 0, y: 0 };
  game.enemies = [makeEnemy('run-one', 90, 0)];
  const firstRuntime = game.buildEngine;
  const firstWeapon = armWing({ game, runtime: firstRuntime }, true);
  firstRuntime.update(0.13);
  const firstWings = firstWeapon.wings;

  unmute = muteConsole();
  try {
    game.selectedCharacter = DIMI;
    game.reset();
  } finally {
    unmute();
  }
  test('Game.reset replaces the BuildEngine runtime and drops old wing arrays', () =>
    (game.buildEngine !== firstRuntime && !game.buildEngine.weapons.has(WEAPON)) ||
    `newRuntime=${game.buildEngine !== firstRuntime}, hasOldWeapon=${game.buildEngine.weapons.has(WEAPON)}`
  );

  game.player.pos = { x: 0, y: 0 };
  game.enemies = [makeEnemy('run-two', 90, 0)];
  const secondWeapon = armWing({ game, runtime: game.buildEngine }, true);
  game.buildEngine.update(0.13);
  test('second run creates fresh bounded wing state and lands normally', () =>
    (secondWeapon.wings !== firstWings && secondWeapon.wings.length === 1 &&
      game.enemies[0].hits.length === 2) ||
    `fresh=${secondWeapon.wings !== firstWings}, wings=${secondWeapon.wings.length}, hits=${game.enemies[0].hits.length}`
  );
}

console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
if (failures.length) {
  console.log('Current production failures:');
  for (const failure of failures) {
    console.log(`  - ${failure.name}${failure.note ? `: ${failure.note}` : ''}`);
  }
}
process.exitCode = failed ? 1 : 0;
