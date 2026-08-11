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

// 2026-08-11 QA refresh — the guarded pair moved sets, the rule did not.
// This harness used to drive 'magnetic_arc|euclid_vector'. Two shipped decisions retired that
// pair as a probe of the legacy world-override path:
//   * "CARD-ONLY overrides (2026-08-09, Maria)" in js/game/Game.js put magnetic_arc|euclid_vector
//     (plus the other three magnetic_arc wielders, both plasma_execution wielders, both
//     storm_conductor wielders and spirit_crescent|taekwondo_girl) into WORLD_OVERRIDE_CARD_ONLY:
//     the illustration stays a card icon and the in-world visual is no longer the override art.
//   * "ΕΠΕΚΤΑΣΗ 2026-08-09 (Maria)" in _spawnWeaponVFX makes MAGNETIC_ARC early-return a
//     procedural WeaponStrikeFx2 bolt strike before the override branch is even reached — that
//     object has no `overrideImg` field at all, so the old `=== null` checks read `undefined`.
// So the pair is driven onto a wielder combo that is still a LIVE world override on the frame-sheet
// path (storm_saber|oni_cataclysm_protocol, WIELDER_VFX_OVERRIDES and NOT in the card-only set),
// and the card-only rule itself is guarded at the bottom of this file with a pair that stayed on
// the sheet path (spirit_crescent|taekwondo_girl). Every ownership/suppression/lifetime rule below
// is unchanged.
const CHARACTER = 'oni_cataclysm_protocol';
const WEAPON = 'storm_saber';
// A pair that is in WIELDER_VFX_OVERRIDES *and* in WORLD_OVERRIDE_CARD_ONLY, and whose weapon
// still renders through the normal animated frame sheet (no procedural early-return).
const CARD_ONLY_CHARACTER = 'taekwondo_girl';
const CARD_ONLY_WEAPON = 'spirit_crescent';
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

function newRun(character = CHARACTER) {
  globalThis.localStorage.clear();
  const game = new Game();
  const restore = muteConsole();
  game.audio = null;
  game.selectedCharacter = character;
  game.gameState = 'playing';
  game.reset();
  restore();
  return game;
}

function spawn(game, weapon = WEAPON) {
  return game._spawnWeaponVFX(weapon, game.player.pos.x, game.player.pos.y, 0, 1);
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
// 2026-08-11 QA refresh — measure the stated invariant, not "the array is empty".
// drive() runs the REAL game loop, and by this point the run legitimately owns the weapon
// (_weaponLevels was set above), so the player auto-fires it and spawns fresh VFX during the
// 1.25s. Asserting `length === 0` therefore raced production behaviour rather than the cleanup
// rule — verified by identity: after the drive, 0 of the 12 instances spawned here survived and
// the single remaining object was a brand-new one at frame 0/16 with isDone() === false.
// The check below is what the assertion always meant, and is strictly harder to fake: every
// instance alive before the drive must be gone, AND nothing left may report isDone().
const preDrive = game._activeWeaponVFX.slice();
drive(game, 1.25);
test('override VFX lifetime cleanup removes every completed instance', () => {
  const survivors = preDrive.filter(v => game._activeWeaponVFX.includes(v));
  const completedStillPresent = game._activeWeaponVFX.filter(
    v => typeof v.isDone === 'function' && v.isDone());
  return (preDrive.length > 0 && survivors.length === 0 && completedStillPresent.length === 0)
    || `tracked=${preDrive.length}, survivors=${survivors.length}, completed-still-present=${completedStillPresent.length}`;
});

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

// ── The other side of the same rule (2026-08-09 CARD-ONLY decision) ──────────────────────────
// A pair listed in WIELDER_VFX_OVERRIDES but also in WORLD_OVERRIDE_CARD_ONLY must keep its
// animated frame sheet in-world no matter how strong the legacy ownership is. Without this the
// harness could be made green again just by deleting the card-only branch from _spawnWeaponVFX.
const cardOnlyGame = newRun(CARD_ONLY_CHARACTER);
let cardVfx = spawn(cardOnlyGame, CARD_ONLY_WEAPON);
test('card-only pair renders the frame sheet before any legacy ownership', () =>
  !!cardVfx && cardVfx.overrideImg === null
    || `vfx=${!!cardVfx}, override=${cardVfx ? String(cardVfx.overrideImg) : 'n/a'}`);

cardOnlyGame._weaponLevels.set(CARD_ONLY_WEAPON, 5);
cardOnlyGame._evolvedWeapons?.add?.(CARD_ONLY_WEAPON);
cardVfx = spawn(cardOnlyGame, CARD_ONLY_WEAPON);
test('card-only pair still refuses the world override under full legacy ownership', () =>
  !!cardVfx && cardVfx.overrideImg === null
    || `vfx=${!!cardVfx}, override=${cardVfx ? String(cardVfx.overrideImg) : 'n/a'}`);

console.log(`\n=== ${passed} PASS / ${failed} FAIL ===`);
process.exit(failed ? 1 : 0);
