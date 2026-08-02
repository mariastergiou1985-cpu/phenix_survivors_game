/**
 * CARD / PASSIVE INTEGRITY REGRESSION (Maria 2026-08-02, Batch W4)
 *
 * Guards five defects in the card, catalyst and synergy layers. Each was measured by execution
 * against the tree before the fix.
 *
 *  P1  NULL ARSENAL rendered each catalyst's per-level STEP as if it were the total. _catalystSum
 *      adds every level up to the current one, so the codex understated what the player actually
 *      receives by 1.5x-3x on ALL 25 catalysts (Refraction Anklet Lv3 read "heelEdge +20%" while
 *      the runtime applied +50%; Entropic Dice was 3.00x out). 75 mismatched (level, key) pairs.
 *
 *  P2  A catalyst was still offered for a weapon a fusion had already silenced. update() skips a
 *      _fusionSuppressed weapon forever, so the bonus had no consumer at all: measured offered in
 *      400 of 400 draws, consuming a card slot and one of the 6 passive slots for nothing. The
 *      same guard already existed one branch above, in _readyEvolutions.
 *
 *  P3  bp_momentum_shield wrote player._armorT every frame while moving. _armorT is ALSO the
 *      armor-pickup occupancy flag (Game._updateArmorPickups only spawns while it is <= 0), so a
 *      moving player never saw another armor pickup for the rest of the run - and since the passive
 *      grants the same +15% DR, the net effect was losing the 12 s pickup for zero gain.
 *
 *  P4  Game.SYNERGY_FX declares a mark-layer for japan_phasewalker and dimis_kickboxer, and
 *      MetaProgress sells their meta stars at 1000 PF each, but the cards the FX gates on
 *      (player.upgrades[fx.card]) were never written - both were permanently inert while paid for.
 *
 *  P5  polarized_core was the only catalyst whose Lv2 row dropped its Lv1 key, which is what made
 *      the increment-vs-tier reading of these tables arguable in the first place.
 *
 * Run: node tools/qa/card_passive_integrity_regression.mjs
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

// MODULE IDENTITY: the chars modules register into this exact specifier.
// The stamp is READ FROM THE SOURCE, never hard-coded: a cache-bust bump used to leave harnesses
// pinned to a dead specifier, which silently gave them a 2-weapon BuildEngine instead of 25.
const BE_STAMP = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngineChars1.js'), 'utf8')
  .match(/BuildEngine\.js\?v=(\d+)/)[1];
const BE = await import('../../js/game/BuildEngine.js?v=' + BE_STAMP);
for (const m of ['BuildEngineChars1', 'BuildEngineChars2', 'BuildEngineChars3',
                 'BuildEngineChars4', 'BuildEngineChars5', 'BuildEnginePassives'])
  await import(`../../js/game/${m}.js?v=${BE_STAMP}`);
const UP = await import('../../js/game/Upgrades.js');

const mkRt = (char = 'x') => new BE.BuildEngineRuntime({
  enemies: [], player: { pos: { x: 0, y: 0 } }, selectedCharacter: char, timeAlive: 0,
  _weaponLevels: new Map(), _consumedWeapons: new Set(), triggerAnnouncement() {},
  meta: { getFusionTier: () => 0 },
});

console.log('\n── 1. P1 — the codex TOTAL column equals what _catalystSum delivers ──');
{
  // Reproduce the renderer's cumulative column exactly (NullArsenalUI passiveCard).
  const rt = mkRt();
  let checked = 0; const bad = [];
  for (const [pid, p] of Object.entries(BE.PASSIVE_DEFS)) {
    if (p.category !== 'evolution_passive' || !p.bonuses) continue;
    for (let lv = 1; lv <= p.bonuses.length; lv++) {
      rt.passives.set(pid, lv);
      const tot = {};
      for (let j = 0; j < lv; j++) for (const [k, v] of Object.entries(p.bonuses[j])) tot[k] = (tot[k] || 0) + v;
      for (const [k, v] of Object.entries(tot)) {
        checked++;
        if (Math.abs(rt._catalystSum(k) - v) > 1e-9) bad.push(`${pid} Lv${lv} ${k}`);
      }
      rt.passives.delete(pid);
    }
  }
  ok('every catalyst level/key matches the runtime', bad.length === 0, `${bad.length} of ${checked}: ${bad.slice(0, 6).join(', ')}`);
  ok('the check actually covered the pool', checked > 100, `${checked} pairs`);

  const ui = fs.readFileSync(path.join(ROOT, 'js/game/NullArsenalUI.js'), 'utf8');
  ok('the codex renders a TOTAL column, not just the per-level step', /TOTAL/.test(ui));
  ok('the total is accumulated across levels', /for \(let j = 0; j <= i; j\+\+\)/.test(ui));
}

console.log('\n── 2. P2 — no catalyst is offered for a fusion-silenced weapon ──');
{
  const rt = mkRt('assassin_clone');
  rt.addWeapon('monowire_lash');
  rt.weapons.get('monowire_lash').level = 5;
  const draw = () => { const c = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]; rt.injectCards(c); return c[2].key; };
  let before = 0; for (let i = 0; i < 300; i++) if (draw() === 'be_p_shadow_spool') before++;
  ok('the catalyst is offered while the weapon is live', before > 0, `${before}/300`);
  rt.weapons.get('monowire_lash')._fusionSuppressed = true;   // exactly what FusionEngine.acquire() sets
  let after = 0; for (let i = 0; i < 300; i++) if (draw() === 'be_p_shadow_spool') after++;
  ok('it is never offered once the fusion silences the weapon', after === 0, `${after}/300`);
  const evoOffers = rt._readyEvolutions().map(e => e.eid);
  ok('the evolution guard from W1 still holds', !evoOffers.includes('be_wire_garrote_web'), JSON.stringify(evoOffers));
}

console.log('\n── 3. P3 — Momentum Shield does not occupy the armor-pickup flag ──');
{
  const bp = fs.readFileSync(path.join(ROOT, 'js/game/BuildEnginePassives.js'), 'utf8');
  ok('Momentum Shield no longer writes _armorT', !/moveT >= 2\.5\) p\._armorT/.test(bp));
  ok('it uses its own window key', /_msArmorT/.test(bp));
  const pl = fs.readFileSync(path.join(ROOT, 'js/entities/Player.js'), 'utf8');
  ok('the damage reduction reads both sources', /_armorT \|\| 0\) > 0 \|\| \(this\._msArmorT/.test(pl));
  ok('the new window decays', /_msArmorT \|\| 0\) > 0\)\s*this\._msArmorT -= dt/.test(pl));
  ok('the field is initialised', /this\._msArmorT = 0;/.test(pl));
  // the two SHORT windows that legitimately share _armorT must be untouched
  ok('bp_emergency_phase still uses the pickup flag', /p\._armorT = Math\.max\(p\._armorT \|\| 0, 2\)/.test(bp));
  ok('bp_adaptive_plating still uses the pickup flag', /p\._armorT = Math\.max\(p\._armorT \|\| 0, 1\.2\)/.test(bp));
  // and the pickup spawner's gate must still be the pickup flag alone
  const gs = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
  ok('the pickup spawner still gates on _armorT only', /_armorT \|\| 0\) <= 0 && this\.armorPickups\.length === 0/.test(gs));
}

console.log('\n── 4. P4 — every SYNERGY_FX entry points at a card that exists ──');
{
  const gs = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
  const fxCards = [...gs.matchAll(/card: '(synergy_[a-z_]+)'/g)].map(m => m[1]);
  const keys = new Set(UP.ALL_UPGRADES.map(c => c.key));
  const dead = fxCards.filter(c => !keys.has(c));
  ok('SYNERGY_FX covers the expected characters', fxCards.length >= 8, `${fxCards.length} entries`);
  ok('none points at a missing card', dead.length === 0, dead.join(', '));
  for (const [key, prereq, char] of [
    ['synergy_phase_companion', 'phasewalker_phase_shard_mastery', 'japan_phasewalker'],
    ['synergy_gauntlet_resonance', 'dimi_gauntlet_mastery', 'dimis_kickboxer'],
  ]) {
    const card = UP.ALL_UPGRADES.find(c => c.key === key);
    ok(`${key} exists`, !!card);
    ok(`  its prerequisite mastery card exists`, keys.has(prereq));
    ok(`  it is gated before the mastery`, card?.prereq?.({ upgrades: {} }) === false);
    ok(`  and unlocked after it`, card?.prereq?.({ upgrades: { [prereq]: 1 } }) === true);
    ok(`  it is bound to ${char}`, card?.char === char, `got ${card?.char}`);
    ok(`  and styled as a synergy card`, card?.synergy === true && card?.rarity === 'legendary');
    // it must actually reach the player through the real sampler
    const mk = (u) => ({ character: char, selectedCharacter: char, upgrades: u });
    let none = 0, some = 0;
    for (let i = 0; i < 1500; i++) if (UP.weightedSample(mk({}), 3, { endless: true }).some(c => c.key === key)) none++;
    for (let i = 0; i < 1500; i++) if (UP.weightedSample(mk({ [prereq]: 1 }), 3, { endless: true }).some(c => c.key === key)) some++;
    ok(`  never rolls before the mastery`, none === 0, `${none}/1500`);
    ok(`  really rolls after it`, some > 0, `${some}/1500`);
  }
}

console.log('\n── 5. P5 — every catalyst table has a uniform shape ──');
{
  // These tables are INCREMENTS: a key absent at a level simply means that level adds nothing to
  // it, and most catalysts introduce their second key at Lv2. What must hold is that no level ever
  // REDUCES a running total - a decreasing pair would mean the table is a tier table after all and
  // _catalystSum is summing the wrong thing.
  const decreasing = [];
  for (const [pid, p] of Object.entries(BE.PASSIVE_DEFS)) {
    if (p.category !== 'evolution_passive' || !p.bonuses) continue;
    for (const b of p.bonuses) for (const [k, v] of Object.entries(b)) if (v < 0) decreasing.push(pid + '.' + k);
  }
  ok('no catalyst level subtracts from a running total', decreasing.length === 0, decreasing.join(', '));
  const rt = mkRt();
  rt.passives.set('polarized_core', 3);
  ok('polarized_core Lv3 still totals +2 fragments', Math.abs(rt._catalystSum('shrapFrag') - 2) < 1e-9,
     `got ${rt._catalystSum('shrapFrag')}`);
  ok('polarized_core Lv3 still totals +20% damage', Math.abs(rt._catalystSum('shrapDmg') - 0.20) < 1e-9,
     `got ${rt._catalystSum('shrapDmg')}`);
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
