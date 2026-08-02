/**
 * TACTICAL FUSION / EXCLUSIVITY REACHABILITY REGRESSION (Maria 2026-08-02, Batch W8)
 *
 * Two dead ends, both measured on the tree before the fix.
 *
 *  T1  All FOUR tactical fusions were unreachable, for two independent reasons.
 *      (a) _buildTacticalCard() returned null on `tacticalCacheWeapons.length >= MAX_TACTICAL`
 *          BEFORE the fusion scan. A fusion requires both parents deployed — i.e. exactly
 *          MAX_TACTICAL of them — so the early return fired precisely when a fusion first became
 *          possible. canApply() gated on the same cap, so even a hand-placed card could not apply.
 *      (b) Two of the four pair tacticals owned by DIFFERENT characters:
 *            fusion_toxic_inferno = tac_hunter_sentry (assassin_clone) + tac_gravity_well (Oni)
 *            fusion_impact_storm  = tac_heavy_impact_burst (brawler) + tac_proximity_grid (euclid)
 *          Every character's pool holds only their own two plus the shared tac_missile_barrage,
 *          so measured across all 10 characters, ZERO could deploy both parents of either.
 *
 *      Fix: the cap no longer pre-empts the fusion scan; a fusion is exempt from the cap because
 *      it REPLACES its two parents (they are retired on apply); and a fusion partner is admitted
 *      into the pool ONLY once its counterpart is already on this run's deployed set.
 *
 *  T2  seismic_rift (owner brawler_warrior) needs nexus_chakram + cataclysm_pulse, but
 *      cataclysm_pulse is `exclusive` to oni_cataclysm_protocol and _buildWeaponCard filtered
 *      `(!w.exclusive || w.character === charId)`. Its only owner could therefore never hold both
 *      ingredients, and no character in the game could reach the recipe.
 *
 *      Fix: exclusivity defers to `_needed` — the ingredients of recipes isEvolutionOwnedBy()
 *      has already granted THIS character. Narrow by construction: a signature weapon can only
 *      surface in a pool that has a recipe actively asking for it.
 *
 * Run: node tools/qa/tactical_fusion_reachability_regression.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const T  = await import('../../js/game/TacticalWeaponCatalog.js');
const WC = await import('../../js/game/WeaponCatalog.js');
const GS = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');

const CHARS = ['skeleton_warrior', 'taekwondo_girl', 'cyber_arm_hero', 'brawler_warrior',
               'assassin_clone', 'eddie', 'dimis_kickboxer', 'japan_phasewalker',
               'euclid_vector', 'oni_cataclysm_protocol'];

console.log('\n── 0. the defect was real (base pools alone cannot reach 2 of 4 fusions) ──');
{
  const basePool = (c) => T.getAvailableTactical(c).filter(d => !d.exclusive || d.character === c).map(d => d.id);
  const reachableFromBase = T.FUSION_TACTICALS.filter(f =>
    CHARS.some(c => f.parents.every(p => basePool(c).includes(p))));
  console.log(`  evidence  from base pools alone, ${reachableFromBase.length}/4 fusions have any character who can deploy both parents`);
  ok('exactly two fusions were pool-reachable, two were not', reachableFromBase.length === 2,
     reachableFromBase.map(f => f.id).join(', '));
  ok('there are four fusions to reach', T.FUSION_TACTICALS.length === 4);
}

console.log('\n── 1. T1a — the cap no longer pre-empts the fusion scan ──');
{
  const body = GS.slice(GS.indexOf('_buildTacticalCard() {'));
  const head = body.slice(0, body.indexOf('for (const fdef of FUSION_TACTICALS)'));
  ok('no cap early-return above the fusion scan', !/tacticalCacheWeapons\.length >= MAX_TACTICAL\) return null;/.test(head));
  ok('the cap still guards the NORMAL pool', /if \(this\.tacticalCacheWeapons\.length >= MAX_TACTICAL\) return null;/.test(body));
  ok('canApply exempts a fusion', /canApply\(\) \{ return _isFusion \|\| game\.tacticalCacheWeapons\.length < MAX_TACTICAL; \}/.test(body));
  ok('and a fusion retires its parents so the cap is still respected',
     /if \(_isFusion && Array\.isArray\(pick\.parents\)\)/.test(body) &&
     /game\.tacticalCacheWeapons\.splice\(i, 1\);/.test(body));
}

console.log('\n── 2. T1b — every fusion is reachable, and only via its own partner ──');
{
  // Reproduce the production partner rule exactly.
  const partnersFor = (deployed) => {
    const out = new Set();
    for (const f of T.FUSION_TACTICALS) {
      if (deployed.has(f.id)) continue;
      if (deployed.has(f.parents[0]) && !deployed.has(f.parents[1])) out.add(f.parents[1]);
      if (deployed.has(f.parents[1]) && !deployed.has(f.parents[0])) out.add(f.parents[0]);
    }
    return out;
  };
  const poolFor = (c, deployed) => {
    const partners = partnersFor(deployed);
    const pool = T.getAvailableTactical(c).filter(d => !d.exclusive || d.character === c || partners.has(d.id));
    for (const pid of partners) {
      const pdef = T.getTacticalDef(pid);
      if (pdef && !pool.some(d => d.id === pid)) pool.push(pdef);
    }
    return pool.map(d => d.id);
  };

  const reached = [];
  for (const f of T.FUSION_TACTICALS) {
    // who owns either parent natively?
    const owners = CHARS.filter(c => poolFor(c, new Set()).includes(f.parents[0]) ||
                                     poolFor(c, new Set()).includes(f.parents[1]));
    let okChar = null;
    for (const c of owners) {
      const deployed = new Set();
      const base = poolFor(c, deployed);
      const first = f.parents.find(p => base.includes(p));
      if (!first) continue;
      deployed.add(first);
      if (poolFor(c, deployed).includes(f.parents.find(p => p !== first))) { okChar = c; break; }
    }
    reached.push({ id: f.id, char: okChar });
  }
  console.log('  evidence  ' + reached.map(r => `${r.id}->${r.char || 'UNREACHABLE'}`).join('  '));
  ok('all four fusions are now reachable by some character',
     reached.every(r => r.char), reached.filter(r => !r.char).map(r => r.id).join(', '));

  // NARROWNESS: with nothing deployed, no character may see another character's tactical.
  const leaks = [];
  for (const c of CHARS) {
    for (const id of poolFor(c, new Set())) {
      const d = T.TACTICAL_DEFS[id];
      if (d && d.character && d.character !== c && d.character !== '__fusion__' &&
          !T.getAvailableTactical(c).some(x => x.id === id)) leaks.push(`${c}:${id}`);
    }
  }
  ok('the base pool is completely unchanged when nothing is deployed', leaks.length === 0, leaks.join(', '));

  // and a partner appears ONLY for the fusion that asks for it
  const d0 = new Set(['tac_hunter_sentry']);
  ok('deploying one parent unlocks exactly its partner',
     poolFor('assassin_clone', d0).includes('tac_gravity_well'),
     JSON.stringify(poolFor('assassin_clone', d0)));
  ok('and unlocks nothing else',
     poolFor('assassin_clone', d0).filter(id => !T.getAvailableTactical('assassin_clone').some(x => x.id === id)).length === 1,
     JSON.stringify(poolFor('assassin_clone', d0)));
  ok('once the fusion itself is deployed the partner closes again',
     !poolFor('assassin_clone', new Set(['tac_hunter_sentry', 'tac_gravity_well', 'fusion_toxic_inferno']))
        .includes('tac_gravity_well') ||
     T.getAvailableTactical('assassin_clone').some(x => x.id === 'tac_gravity_well'));
}

console.log('\n── 3. T2 — an exclusive weapon reaches only the recipe that needs it ──');
{
  const src = GS.slice(GS.indexOf('_buildWeaponCard() {'));
  ok('the acquisition filter defers to _needed',
     /\(!w\.exclusive \|\| w\.character === charId \|\| _needed\.has\(w\.id\)\)/.test(src));
  ok('_needed is computed BEFORE the filter uses it',
     src.indexOf('const _needed = new Set();') < src.indexOf('const available  = canAcquire'));

  // reproduce _needed for every character and check the blast radius
  const recipes = WC.EVOLUTION_RECIPES || WC.RECIPES;
  const own = WC.isEvolutionOwnedBy;
  ok('the recipe table and ownership helper are available', !!recipes && typeof own === 'function');
  if (recipes && typeof own === 'function') {
    // reproduce the production supersede guard: a retired recipe must not pierce exclusivity
    const superseded = (r) => !!(BE.EVOLUTION_RECIPES['be_' + r.result] || BE.WEAPON_DEFS['build_' + r.result]);
    const exclusives = Object.values(WC.WEAPON_DEFS).filter(w => w.exclusive);
    ok('there are exclusive weapons to reason about', exclusives.length > 0, `${exclusives.length}`);
    const opened = [];
    for (const c of CHARS) {
      const needed = new Set();
      for (const r of Object.values(recipes)) {
        if (!own(r, c)) continue;
        if (superseded(r)) continue;
        for (const ing of r.ingredients) needed.add(ing);
      }
      for (const w of exclusives) if (w.character !== c && needed.has(w.id)) opened.push(`${c}:${w.id}`);
    }
    console.log(`  evidence  exclusivity is pierced in exactly ${opened.length} (character, weapon) case(s): ${opened.join(', ') || 'none'}`);
    ok('the exception is narrow, not a blanket unlock', opened.length <= 2, opened.join(', '));
    ok('and it never fires for a recipe the Build Engine superseded',
       !opened.includes('eddie:cataclysm_pulse') && !opened.includes('dimis_kickboxer:cataclysm_pulse'),
       opened.join(', '));
    ok('and it covers the case that was dead', opened.includes('brawler_warrior:cataclysm_pulse'), opened.join(', '));

    // seismic_rift must now be satisfiable by its declared owner
    const rift = Object.values(recipes).find(r => r.result === 'seismic_rift');
    ok('the seismic_rift recipe still exists', !!rift);
    if (rift) {
      const owner = CHARS.find(c => own(rift, c));
      ok('it still has a declared owner', !!owner, String(owner));
      const needed = new Set();
      for (const r of Object.values(recipes)) if (own(r, owner) && !superseded(r)) for (const ing of r.ingredients) needed.add(ing);
      const blocked = rift.ingredients.filter(ing => {
        const w = WC.WEAPON_DEFS[ing];
        return w?.exclusive && w.character !== owner && !needed.has(ing);
      });
      ok(`${owner} can now hold every seismic_rift ingredient`, blocked.length === 0, blocked.join(', '));
    }
    // NOTHING may open for a character with no recipe asking for it
    const oni = new Set();
    for (const r of Object.values(recipes)) if (own(r, 'oni_cataclysm_protocol') && !superseded(r)) for (const ing of r.ingredients) oni.add(ing);
    const strayForOni = exclusives.filter(w => w.character !== 'oni_cataclysm_protocol' && oni.has(w.id));
    ok('no other character\'s signature weapon leaks into Oni\'s pool', strayForOni.length === 0,
       strayForOni.map(w => w.id).join(', '));
  }
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
