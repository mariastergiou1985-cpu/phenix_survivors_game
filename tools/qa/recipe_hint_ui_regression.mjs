// Phase 4D: recipe hints on BuildEngine weapon/catalyst level-up cards.
// Run: node tools/qa/recipe_hint_ui_regression.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

await import(pathToFileURL(path.join(ROOT, 'js/game/BuildEngineChars3.js')).href + '?recipe-hint-test');
const { UpgradeUI } = await import(pathToFileURL(path.join(ROOT, 'js/game/UpgradeUI.js')).href + '?recipe-hint-test');

let pass = 0;
let fail = 0;
const test = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  FAIL  ${name} - ${error.message}`);
  }
};

const ui = new UpgradeUI([{ key: 'plain' }]);
const buildEngine = {
  weapons: new Map([['marrow_spitter', { level: 3, evolved: false }]]),
  passives: new Map([['ossified_dynamo', 2]]),
};
const game = { buildEngine, _weaponLevels: new Map() };

console.log('RECIPE HINT UI REGRESSION');

test('weapon card resolves its existing recipe metadata', () => {
  const hint = ui._recipeHint({ key: 'be_w_marrow_spitter' }, game);
  assert.equal(hint.recipeId, 'be_marrow_reactor');
  assert.equal(hint.recipeName, 'Marrow Reactor');
  assert.equal(hint.weaponName, 'Marrow Spitter');
  assert.equal(hint.catalystName, 'Ossified Dynamo');
});

test('catalyst card resolves the same recipe', () => {
  const hint = ui._recipeHint({ key: 'be_p_ossified_dynamo' }, game);
  assert.equal(hint.recipeId, 'be_marrow_reactor');
});

test('hint reports live weapon L5 and catalyst L3 progress', () => {
  const hint = ui._recipeHint({ key: 'be_w_marrow_spitter' }, game);
  assert.deepEqual(
    [hint.weaponLevel, hint.weaponRequired, hint.catalystLevel, hint.catalystRequired],
    [3, 5, 2, 3]
  );
});

test('external BuildEngine weapon reads the existing legacy level state', () => {
  const externalGame = {
    buildEngine: { weapons: new Map(), passives: new Map([['forbidden_amplifier', 1]]) },
    _weaponLevels: new Map([['solo_red_thunder', 4]]),
  };
  const hint = ui._recipeHint({ key: 'be_p_forbidden_amplifier' }, externalGame);
  assert.equal(hint.recipeName, 'Solo of the Damned');
  assert.equal(hint.weaponLevel, 4);
  assert.equal(hint.catalystLevel, 1);
});

test('ordinary and non-recipe BuildEngine cards stay unchanged', () => {
  assert.equal(ui._recipeHint({ key: 'move_speed' }, game), null);
  assert.equal(ui._recipeHint({ key: 'be_p_not_a_recipe' }, game), null);
  assert.equal(ui._recipeHint({ key: 'be_w_marrow_spitter' }, {}), null);
});

test('compact renderer prints recipe, both ingredients, and progress', () => {
  const text = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left',
    save() {}, restore() {}, fill() {}, stroke() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, arcTo() {}, quadraticCurveTo() {},
    measureText(value) { return { width: String(value).length * 5.5 }; },
    fillText(value) { text.push(String(value)); },
  };
  const hint = ui._recipeHint({ key: 'be_w_marrow_spitter' }, game);
  ui._drawRecipeHint(ctx, { x: 0, y: 0, w: 220, h: 288 }, hint, '#ffd447');
  assert(text.some(value => value.includes('Marrow Reactor')));
  assert(text.some(value => value.includes('Marrow Spitter')));
  assert(text.some(value => value.includes('Ossified Dynamo')));
  assert(text.includes('3/5'));
  assert(text.includes('2/3'));
});

test('UI source contains no evolution or economy mutation call', () => {
  const source = fs.readFileSync(path.join(ROOT, 'js/game/UpgradeUI.js'), 'utf8');
  assert(!source.includes('._evolve('));
  assert(!source.includes('.addWeapon('));
  assert(!source.includes('.addPassive('));
  assert(!source.includes('._readyEvolutions('));
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
