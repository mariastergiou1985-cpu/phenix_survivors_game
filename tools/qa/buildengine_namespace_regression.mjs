import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./strip-v-loader.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { installEnv, muteConsole } = await import(
  pathToFileURL(path.join(HERE, 'headless-env.mjs')).href
);
installEnv();

const unmute = muteConsole();
const [{ WEAPON_DEFS, EVOLUTION_RECIPES, WEAPON_EXECUTORS }, catalog] = await Promise.all([
  import(pathToFileURL(path.resolve(HERE, '../../js/game/BuildEngine.js')).href),
  import(pathToFileURL(path.resolve(HERE, '../../js/game/WeaponCatalog.js')).href),
]);
await import(pathToFileURL(path.resolve(HERE, '../../js/game/BuildEngineChars5.js')).href);
unmute();

let pass = 0;
let fail = 0;
function test(name, check) {
  let ok = false;
  try { ok = check() === true; } catch (_) {}
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

console.log('=== BUILDENGINE / LEGACY NAMESPACE REGRESSION ===');
const legacyIds = new Set(Object.values(catalog.WEAPON_DEFS).map(def => def.id));

test('legacy catalog still owns null_lance and ion_halo', () =>
  legacyIds.has('null_lance') && legacyIds.has('ion_halo'));
test('BuildEngine no longer registers the colliding legacy IDs', () =>
  !WEAPON_DEFS.null_lance && !WEAPON_DEFS.ion_halo);
test('BuildEngine registers both namespaced base weapons', () =>
  !!WEAPON_DEFS.build_null_lance && !!WEAPON_DEFS.build_ion_halo);
test('namespaced weapons keep their production executors', () =>
  !!WEAPON_EXECUTORS.build_null_lance && !!WEAPON_EXECUTORS.build_ion_halo);
test('Eventide recipe points only at the namespaced lance', () =>
  EVOLUTION_RECIPES.be_eventide_impaler.weapon === 'build_null_lance' &&
  WEAPON_DEFS.build_null_lance.evolution === 'be_eventide_impaler');
test('Sovereign recipe points only at the namespaced halo', () =>
  EVOLUTION_RECIPES.be_sovereign_ion_halo.weapon === 'build_ion_halo' &&
  WEAPON_DEFS.build_ion_halo.evolution === 'be_sovereign_ion_halo');
test('visible weapon names remain Null Lance and Ion Halo', () =>
  WEAPON_DEFS.build_null_lance.name === 'Null Lance' &&
  WEAPON_DEFS.build_ion_halo.name === 'Ion Halo');

console.log(`=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
