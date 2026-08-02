/**
 * LEGACY WEAPON LAYER RESTORE REGRESSION (Maria 2026-08-02, Batch W7)
 *
 * THE DEFECT. Game._injectWeaponCard() ended with:
 *
 *     if (this.buildEngine && this.buildEngine.injectCards(choices)) return;
 *
 * and BuildEngineRuntime.injectCards() returns true on essentially EVERY level-up — measured
 * 108000 of 108000 draws. Everything after that line was therefore unreachable in the shipped
 * build: the WeaponCatalog acquire/upgrade cards, the Tactical Cache card, and the legacy
 * evolution card. A second kill switch sat one branch below:
 *
 *     const evoCard = this.buildEngine ? null : this._buildEvolutionCard();
 *
 * so all 33 WeaponCatalog evolutions were retired outright. Since buildEngine is constructed
 * unconditionally (the ?p2 opt-out is retired), neither path could ever run.
 *
 * Consequence measured on the pristine tree: legacy _wacq_ / _wupg_ / _tac_ / _wevo_ offers were
 * 0 per 1000 draws across every mode and every character, and no legacy weapon could exceed
 * level 3 (mastery cards cap there), so no legacy evolution could ever be earned.
 *
 * It also silently broke a BUILD ENGINE weapon: BE.WEAPON_DEFS.solo_red_thunder is `external`,
 * a data-wrap whose level lives in the legacy _weaponLevels map. Its only level-up card
 * (_wupg_solo_red_thunder) was in the dead layer, so it was pinned at level 1 and the BE
 * evolution be_solo_of_the_damned — which requires weaponLevel 5 — was itself unreachable.
 *
 * THE RESTORE. The legacy layer now runs against a PRIVATE one-slot array and lands on
 * choices[0]; the Build Engine keeps choices[last] (and choices[last-1] on its variety offer),
 * so it can never be displaced. The blanket evolution retirement is replaced by a per-recipe
 * supersede test: the 22 legacy recipes the Build Engine re-issued under the be_ / build_ prefix
 * with the SAME display name stay retired, so the two layers can never offer the same weapon
 * twice; the 11 legacy-only ones come back.
 *
 * Run: node tools/qa/legacy_layer_restore_regression.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, width: 0, height: 0 }),
  querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };
globalThis.Image = globalThis.Image || class { constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; } };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null };
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);

const BE_STAMP = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngineChars1.js'), 'utf8')
  .match(/BuildEngine\.js\?v=(\d+)/)[1];
const BE = await import('../../js/game/BuildEngine.js?v=' + BE_STAMP);
for (const m of ['BuildEngineChars1', 'BuildEngineChars2', 'BuildEngineChars3',
                 'BuildEngineChars4', 'BuildEngineChars5', 'BuildEnginePassives'])
  await import(`../../js/game/${m}.js?v=${BE_STAMP}`);
const WC = await import('../../js/game/WeaponCatalog.js');
const GS = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');

console.log('\n── 0. module identity (a wrong ?v= would make every number below meaningless) ──');
{
  ok('the BuildEngine registry really loaded', Object.keys(BE.WEAPON_DEFS).length === 25,
     `${Object.keys(BE.WEAPON_DEFS).length} weapons`);
  ok('25 BE evolution recipes', Object.keys(BE.EVOLUTION_RECIPES).length === 25);
  ok('the legacy catalog is intact', Object.keys(WC.WEAPON_DEFS).length === 42,
     `${Object.keys(WC.WEAPON_DEFS).length}`);
}

console.log('\n── 1. neither kill switch survives ──');
{
  ok('injectCards no longer returns straight out of the method',
     !/if \(this\.buildEngine && this\.buildEngine\.injectCards\(choices\)\) return;/.test(GS));
  ok('the legacy layer gets a private one-slot array',
     /const _legacySlot = \[null\];\s*\n\s*this\._injectLegacyWeaponCard\(_legacySlot\);/.test(GS));
  ok('and it lands on choices[0], never on a Build-Engine slot',
     /if \(_legacySlot\[0\]\) choices\[0\] = _legacySlot\[0\];/.test(GS));
  ok('the buildEngine === null emergency path still calls the same body',
     /this\._injectLegacyWeaponCard\(choices\);/.test(GS));
  ok('the blanket evolution retirement is gone',
     !/const evoCard = this\.buildEngine \? null : this\._buildEvolutionCard\(\);/.test(GS));
  ok('the legacy evolution builder is called unconditionally',
     /const evoCard = this\._buildEvolutionCard\(\);/.test(GS));
  ok('a per-recipe supersede test replaced it',
     /if \(BE_EVOLUTION_RECIPES\['be_' \+ recipe\.result\] \|\| BE_WEAPON_DEFS\['build_' \+ recipe\.result\]\) continue;/.test(GS));
  ok('EVOLUTION_RECIPES is imported for that test',
     /EVOLUTION_RECIPES as BE_EVOLUTION_RECIPES/.test(GS));
}

console.log('\n── 2. the supersede rule selects EXACTLY the duplicated ids ──');
{
  // A legacy recipe is superseded iff the Build Engine re-issued it. The test that matters is not
  // "does the id look similar" but "would the player see two cards with the SAME NAME".
  const recipes = WC.EVOLUTION_RECIPES || WC.RECIPES || null;
  ok('the legacy recipe table is reachable from the catalog', !!recipes,
     'expected WeaponCatalog to export its recipes');
  if (recipes) {
    const all = Object.values(recipes);
    const superseded = [], legacyOnly = [], nameMismatch = [];
    for (const r of all) {
      const be = BE.EVOLUTION_RECIPES['be_' + r.result] || BE.WEAPON_DEFS['build_' + r.result];
      if (!be) { legacyOnly.push(r.result); continue; }
      superseded.push(r.result);
      const legacyName = WC.WEAPON_DEFS[r.result]?.name;
      if (legacyName && be.name && legacyName !== be.name) nameMismatch.push(`${r.result}: "${legacyName}" vs "${be.name}"`);
    }
    console.log(`  evidence  ${all.length} legacy recipes -> ${superseded.length} superseded, ${legacyOnly.length} legacy-only`);
    ok('every recipe is classified', superseded.length + legacyOnly.length === all.length);
    ok('the superseded set is non-trivial', superseded.length >= 20, `${superseded.length}`);
    ok('and some legacy-only evolutions really do come back', legacyOnly.length >= 8, `${legacyOnly.length}: ${legacyOnly.join(', ')}`);
    // THE POINT OF THE RULE: no duplicate display name can ever reach one card screen.
    ok('every superseded id shares its display name with the BE re-issue (so retiring it is right)',
       nameMismatch.length === 0, nameMismatch.join(' | '));
    // and nothing that is legacy-only may have a BE twin under any prefix
    const leak = legacyOnly.filter(id => BE.EVOLUTION_RECIPES['be_' + id] || BE.WEAPON_DEFS['build_' + id] || BE.WEAPON_DEFS[id]);
    ok('no restored evolution collides with a live Build-Engine id', leak.length === 0, leak.join(', '));
  }
}

console.log('\n── 3. the external Build-Engine weapon can reach level 5 again ──');
{
  // solo_red_thunder is `external`: BuildEngine reads its level out of the LEGACY _weaponLevels
  // map. With the legacy upgrade card dead it was pinned at 1, which made the BE evolution
  // be_solo_of_the_damned (weaponLevel 5) unreachable — a Build-Engine defect caused by the
  // legacy layer being switched off.
  ok('solo_red_thunder is still declared external', BE.WEAPON_DEFS.solo_red_thunder?.external === true);
  ok('its BE evolution still requires level 5',
     BE.EVOLUTION_RECIPES.be_solo_of_the_damned?.weaponLevel === 5);
  ok('the legacy catalog still owns the weapon that carries its level', !!WC.WEAPON_DEFS.solo_red_thunder);
  // the upgrade card key must exist in the restored path
  ok('the legacy upgrade card key is built by the restored layer', /_wupg_/.test(GS));
  ok('and the acquire card key too', /_wacq_/.test(GS));

  // drive the real runtime: with the level present, the evolution becomes ready
  const g = {
    selectedCharacter: 'eddie', gameState: 'playing', endless: true, _bossRush: false,
    gameOver: false, timeAlive: 60, _weaponLevels: new Map(), _consumedWeapons: new Set(),
    triggerAnnouncement() {}, player: { pos: { x: 0, y: 0 } }, enemies: [], meta: { getFusionTier: () => 0 },
  };
  const rt = new BE.BuildEngineRuntime(g); g.buildEngine = rt;
  for (let i = 0; i < 3; i++) rt.addPassive('forbidden_amplifier');
  g._weaponLevels.set('solo_red_thunder', 1);
  const atL1 = rt._readyEvolutions().map(e => e.eid);
  g._weaponLevels.set('solo_red_thunder', 5);
  const atL5 = rt._readyEvolutions().map(e => e.eid);
  ok('at level 1 the BE evolution is NOT offered', !atL1.includes('be_solo_of_the_damned'), JSON.stringify(atL1));
  ok('at level 5 it is', atL5.includes('be_solo_of_the_damned'), JSON.stringify(atL5));
}

console.log('\n── 4. the Build-Engine layer keeps its slots ──');
{
  // The restore must not move, reweight or displace anything the Build Engine writes.
  ok('BE still writes the LAST slot', /choices\[choices\.length - 1\]/.test(
     fs.readFileSync(path.join(ROOT, 'js/game/BuildEngine.js'), 'utf8')));
  const g = {
    selectedCharacter: 'assassin_clone', gameState: 'playing', endless: true, timeAlive: 60,
    _weaponLevels: new Map(), _consumedWeapons: new Set(), triggerAnnouncement() {},
    player: { pos: { x: 0, y: 0 } }, enemies: [], meta: { getFusionTier: () => 0 },
  };
  const rt = new BE.BuildEngineRuntime(g);
  let placed = 0, lastSlot = 0;
  for (let i = 0; i < 2000; i++) {
    const c = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    if (rt.injectCards(c)) {
      placed++;
      if (c[2].key !== 'c') lastSlot++;
    }
  }
  console.log(`  evidence  injectCards placed a card in ${placed}/2000 draws, ${lastSlot} of them in the last slot`);
  ok('injectCards still succeeds on effectively every draw', placed >= 1900, `${placed}/2000`);
  ok('and it still owns the last slot', lastSlot === placed, `${lastSlot} of ${placed}`);
  ok('caps untouched', rt.CAPS.weapons === 6 && rt.CAPS.passives === 6 && rt.CAPS.perFamily === 2,
     JSON.stringify(rt.CAPS));
}

console.log('\n── 5. the cache-bust chain moved together ──');
{
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw  = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const mn  = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  const B = idx.match(/js\/main\.js\?v=(\d+)/)[1];
  ok('sw.js BUILD equals index.html main.js ?v', sw.includes(`const BUILD = '${B}'`), B);
  ok('main.js imports Game.js at the same stamp', mn.includes(`./game/Game.js?v=${B}`));
  const stamps = new Set();
  for (const f of ['BuildEngineChars1', 'BuildEngineChars2', 'BuildEngineChars3', 'BuildEngineChars4',
                   'BuildEngineChars5', 'BuildEnginePassives', 'Game', 'FusionEngine',
                   'NullArsenalUI', 'UpgradeUI']) {
    const s = fs.readFileSync(path.join(ROOT, `js/game/${f}.js`), 'utf8');
    for (const m of s.matchAll(/BuildEngine\.js\?v=(\d+)/g)) stamps.add(m[1]);
  }
  ok('every module imports ONE BuildEngine instance', stamps.size === 1, [...stamps].join(', '));
  ok('and that instance is the one the harness measured', stamps.has(BE_STAMP));
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
