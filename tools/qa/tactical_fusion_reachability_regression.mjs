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
 *      Fix (2026-08-02): exclusivity defers to `_needed` — the ingredients of recipes
 *      isEvolutionOwnedBy() has already granted THIS character.
 *
 *      SUPERSEDED 2026-08-10 — "EXCLUSIVITY IS ABSOLUTE" (js/game/Game.js, _buildWeaponCard).
 *      The `_needed` piercing above was described as narrow and measured as anything but: six of
 *      the ten characters could acquire a weapon hard-locked to somebody else. It was removed.
 *      Character-exclusive weapons now stay exclusive on EVERY acquisition path, `_needed` keeps
 *      only its acquisition-ORDER bias, and a legacy recipe that needs a foreign character's
 *      exclusive is intentionally unreachable for an owner who is not that character (no dead
 *      card results — an evolution is only offered once every ingredient is level 5).
 *      Section 3 below asserts that shipped rule; see the dated note there.
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

console.log('\n── 3. T2 — exclusivity is ABSOLUTE on every acquisition path ──');
{
  // 2026-08-11 QA refresh. This section used to assert the 2026-08-02 rule "the acquisition
  // filter defers to _needed", i.e. a foreign character could acquire a signature weapon while
  // one of their recipes listed it as an ingredient. The shipped game retired that piercing —
  // see "EXCLUSIVITY IS ABSOLUTE (2026-08-10)" in js/game/Game.js _buildWeaponCard, which
  // measured the supposedly narrow exception opening a foreign exclusive for SIX of the ten
  // characters and concluded "a brawler holding Oni's signature weapon is not an edge case of a
  // recipe rule, it is the rule being wrong". The expectations below track the shipped rule:
  // the filter is unconditional, `_needed` keeps only its acquisition-ORDER bias, and a legacy
  // recipe needing a foreign exclusive is unreachable BY DESIGN for a non-owner.
  const src = GS.slice(GS.indexOf('_buildWeaponCard() {'));
  ok('the acquisition filter is unconditional — exclusivity never defers to _needed',
     /\(!w\.exclusive \|\| w\.character === charId\)\)/.test(src)
     && !/!w\.exclusive \|\| w\.character === charId \|\| _needed\.has\(w\.id\)/.test(src));
  ok('_needed is still computed BEFORE the acquisition pool is built',
     src.indexOf('const _needed = new Set();') !== -1
     && src.indexOf('const _needed = new Set();') < src.indexOf('const available  = canAcquire'));
  // `_needed` kept its other job. Without this, deleting _needed outright would pass the check
  // above by accident instead of by rule.
  ok('_needed still biases acquisition ORDER (3x weight), which is what it kept',
     /_needed\.has\(w\.id\) \? 3 : 1/.test(src));
  // The supersede guard inside the _needed loop is what stopped the bias pointing at recipes the
  // Build Engine retired and can never offer.
  ok('the _needed loop still skips recipes the Build Engine superseded',
     /BE_EVOLUTION_RECIPES\['be_' \+ r\.result\] \|\| BE_WEAPON_DEFS\['build_' \+ r\.result\]/.test(src));

  const recipes = WC.EVOLUTION_RECIPES || WC.RECIPES;
  const own = WC.isEvolutionOwnedBy;
  ok('the recipe table and ownership helper are available', !!recipes && typeof own === 'function');
  if (recipes && typeof own === 'function') {
    const superseded = (r) => !!(BE.EVOLUTION_RECIPES['be_' + r.result] || BE.WEAPON_DEFS['build_' + r.result]);
    const exclusives = Object.values(WC.WEAPON_DEFS).filter(w => w.exclusive);
    ok('there are exclusive weapons to reason about', exclusives.length > 0, `${exclusives.length}`);
    ok('every exclusive weapon is hard-locked to exactly one roster character',
       exclusives.every(w => CHARS.includes(w.character)),
       exclusives.map(w => `${w.id}->${w.character}`).join(', '));

    // The live recipes each character owns, and the ingredients that absolute exclusivity puts
    // permanently out of their reach.
    const live = (c) => Object.values(recipes).filter(r => own(r, c) && !superseded(r));
    const foreignIngs = (c, r) => r.ingredients.filter(i => {
      const w = WC.WEAPON_DEFS[i];
      return w && w.exclusive && w.character !== c;
    });
    const unreachable = [];
    for (const c of CHARS)
      for (const r of live(c)) {
        const f = foreignIngs(c, r);
        if (f.length) unreachable.push(`${c}:${r.result}(${f.join('+')})`);
      }
    console.log(`  evidence  ${unreachable.length} live (character, recipe) pair(s) are unreachable by design: ${unreachable.join(', ') || 'none'}`);

    // The other half of the decision, stated in the source: "The owners of the exclusives keep
    // every recipe of their own." Derived from the catalog, not hard-coded, so it still fails if
    // a future recipe puts one exclusive into another exclusive owner's recipe.
    const ownerBlocked = [];
    for (const w of exclusives)
      for (const r of live(w.character)) {
        const f = foreignIngs(w.character, r);
        if (f.length) ownerBlocked.push(`${w.character}:${r.result}(${f.join('+')})`);
      }
    ok('an exclusive weapon never blocks a recipe belonging to its own owner',
       ownerBlocked.length === 0, ownerBlocked.join(', '));

    // seismic_rift is the case this harness was written around. Under the shipped rule its owner
    // is held back by the foreign exclusive rather than handed it.
    const rift = Object.values(recipes).find(r => r.result === 'seismic_rift');
    ok('the seismic_rift recipe still exists', !!rift);
    if (rift) {
      const owner = CHARS.find(c => own(rift, c));
      ok('it still has a declared owner', !!owner, String(owner));
      const blocked = foreignIngs(owner, rift);
      ok(`${owner} is held back from seismic_rift by exactly the foreign exclusive`,
         blocked.length === 1
         && WC.WEAPON_DEFS[blocked[0]].exclusive === true
         && WC.WEAPON_DEFS[blocked[0]].character !== owner,
         `blocked=[${blocked.join(', ')}]`);
      // "Nothing breaks and no dead card appears" — measured, not asserted by inspection. Give
      // the owner the strongest inventory the shipped filter permits (every base weapon they may
      // legally acquire, all at max level) and confirm the recipe still never reports ready.
      const bestInv = WC.getAllBaseWeapons()
        .filter(w => !w.exclusive || w.character === owner)
        .map(w => ({ id: w.id, level: 5 }));
      const ready = WC.checkAllEvolutionsReady(bestInv).map(r => r.result);
      ok('a recipe needing a foreign exclusive never reports ready, so no dead card can appear',
         !ready.includes('seismic_rift'), `ready=${ready.join(', ')}`);
      // ...while a recipe with no foreign ingredient still does, so the check above is not
      // passing merely because nothing is ever ready.
      ok('recipes without a foreign exclusive DO still report ready for the same owner',
         ready.length > 0, `${ready.length}`);
    }
    // Oni keeps his own signature weapon and never receives Eddie's.
    const oniPool = WC.getAllBaseWeapons()
      .filter(w => !w.exclusive || w.character === 'oni_cataclysm_protocol').map(w => w.id);
    ok('no other character\'s signature weapon leaks into Oni\'s pool',
       oniPool.includes('cataclysm_pulse') && !oniPool.includes('solo_red_thunder'),
       `cataclysm_pulse=${oniPool.includes('cataclysm_pulse')} solo_red_thunder=${oniPool.includes('solo_red_thunder')}`);
  }
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
