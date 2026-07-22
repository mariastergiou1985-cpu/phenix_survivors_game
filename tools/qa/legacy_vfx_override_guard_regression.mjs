// LEGACY WORLD-VFX OVERRIDE GUARD REGRESSION
// Run: node tools/qa/legacy_vfx_override_guard_regression.mjs

import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./strip-v-loader.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(
  pathToFileURL(path.join(HERE, 'headless-env.mjs')).href
);
installEnv();

let unmute = muteConsole();
const { Game } = await import(
  pathToFileURL(path.resolve(HERE, '../../js/game/Game.js')).href
);
unmute();

const CHARACTER = 'euclid_vector';
const WEAPON = 'magnetic_arc';
const INPUT = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };

let passed = 0;
let failed = 0;
const test = (name, check) => {
  let ok = false;
  let note = '';
  try {
    const result = check();
    ok = result === true;
    if (typeof result === 'string') note = result;
  } catch (error) {
    note = `THREW: ${error?.stack || error}`;
  }
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` - ${note}` : ''}`);
};

function newRun() {
  globalThis.localStorage.clear();
  const game = new Game();
  const restore = muteConsole();
  game.audio = null;
  game.selectedCharacter = CHARACTER;
  game.gameState = 'playing';
  game.reset();
  restore();
  return game;
}

function spawn(game) {
  return game._spawnWeaponVFX(WEAPON, game.player.pos.x, game.player.pos.y, 0, 1);
}

function drive(game, seconds) {
  const step = 1 / 60;
  const frames = Math.ceil(seconds / step);
  const restore = muteConsole();
  for (let i = 0; i < frames; i++) {
    game.player.hp = game.player.maxHp;
    game.update(step, INPUT);
  }
  restore();
}

console.log('=== LEGACY WORLD-VFX OVERRIDE GUARD REGRESSION ===');

const game = newRun();
let vfx = spawn(game);
test('matching character without legacy ownership keeps the frame-sheet VFX', () =>
  !!vfx && vfx.overrideImg === null || `override=${!!vfx?.overrideImg}`);

game._weaponLevels.set(WEAPON, 1);
vfx = spawn(game);
test('positive legacy weapon ownership enables the full-card world VFX', () =>
  !!vfx?.overrideImg || 'override image missing');

game._consumedWeapons.add(WEAPON);
vfx = spawn(game);
test('consumed legacy ownership cannot enable the full-card world VFX', () =>
  !!vfx && vfx.overrideImg === null || `override=${!!vfx?.overrideImg}`);

game._consumedWeapons.delete(WEAPON);
game.buildEngine.weapons.set(WEAPON, { id: WEAPON, level: 1, evolved: false });
vfx = spawn(game);
test('same-id active BuildEngine weapon suppresses the legacy full-card world VFX', () =>
  !!vfx && vfx.overrideImg === null || `override=${!!vfx?.overrideImg}`);

game.buildEngine.weapons.delete(WEAPON);
const beforeBurst = game._activeWeaponVFX.length;
for (let i = 0; i < 8; i++) spawn(game);
test('spawn count stays exact and finite before lifetime cleanup', () =>
  game._activeWeaponVFX.length === beforeBurst + 8
    || `before=${beforeBurst}, after=${game._activeWeaponVFX.length}`);
drive(game, 1.25);
test('override VFX lifetime cleanup removes every completed instance', () =>
  game._activeWeaponVFX.length === 0 || `remaining=${game._activeWeaponVFX.length}`);

game._weaponLevels.set(WEAPON, 1);
spawn(game);
const firstRuntime = game.buildEngine;
const restore = muteConsole();
game.reset();
restore();
test('reset replaces the BuildEngine runtime and clears legacy world VFX state', () =>
  game.buildEngine !== firstRuntime
  && game._activeWeaponVFX.length === 0
  && !game._weaponLevels.has(WEAPON)
    || `freshRuntime=${game.buildEngine !== firstRuntime}, vfx=${game._activeWeaponVFX.length}, legacy=${game._weaponLevels.has(WEAPON)}`);

vfx = spawn(game);
test('second run starts clean and cannot inherit the first run override ownership', () =>
  !!vfx && vfx.overrideImg === null || `override=${!!vfx?.overrideImg}`);

game._weaponLevels.set(WEAPON, 1);
vfx = spawn(game);
test('second run can independently earn and display the legacy override', () =>
  !!vfx?.overrideImg || 'override image missing');

console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
process.exit(failed ? 1 : 0);
