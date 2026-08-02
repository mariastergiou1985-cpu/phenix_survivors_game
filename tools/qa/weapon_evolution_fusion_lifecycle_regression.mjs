/**
 * WEAPON EVOLUTION / FUSION LIFECYCLE REGRESSION (Maria 2026-08-02, Batch W1)
 *
 * Guards three HIGH defects found by the weapon-ecosystem audit. Each test below reproduces
 * the exact failure that was executed against the pristine tree at bd82196.
 *
 *  H1  BuildEngine._evolve() reached an `external` weapon (Solo Red Thunder) through
 *      addWeapon(), which returns SILENTLY at the 6-weapon / per-family cap. _evolve() then
 *      returned false, but the guaranteed evolution card ignores the return value — so the
 *      card became a permanent no-op AND, because injectCards() still reported success, no
 *      other BuildEngine card could ever be offered again for the rest of the run.
 *      Measured on pristine: evolved=false, weapon absent, 50 consecutive level-ups blocked.
 *
 *  H2  _readyEvolutions() checked `w.evolved` but not `w._fusionSuppressed`. A component that
 *      a fusion has silenced is skipped forever by update(), so evolving it burned the
 *      guaranteed legendary pick on a weapon that then dealt ZERO damage for the rest of the
 *      run. 17 of the 20 fusion recipes could reach this state.
 *
 *  H3  fusionModeOk() was used both as the ACQUISITION gate and as the per-frame tick gate.
 *      Boss Rush clears it, so during a Boss Rush an already-acquired fusion stopped updating
 *      while its replaced component stayed _fusionSuppressed — the player lost the fusion AND
 *      the weapon it replaced for the whole encounter.
 *
 * Run: node tools/qa/weapon_evolution_fusion_lifecycle_regression.mjs
 */
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

// ── browser doubles ────────────────────────────────────────────────────────
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, width: 0, height: 0 }),
  querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };
globalThis.Image = globalThis.Image || class { constructor() { this.src = ''; this.complete = false; this.naturalWidth = 0; } };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null };
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);

// MODULE IDENTITY: BuildEngineChars1-5 + BuildEnginePassives register into
// './BuildEngine.js?v=20260902070000'. Importing BuildEngine without that exact query yields a
// DIFFERENT, nearly-empty module instance and every assertion below would fail for the wrong
// reason. Keep these specifiers in step with Game.js.
const BE = await import('../../js/game/BuildEngine.js?v=20260902070000');
for (const m of ['BuildEngineChars1', 'BuildEngineChars2', 'BuildEngineChars3',
                 'BuildEngineChars4', 'BuildEngineChars5', 'BuildEnginePassives'])
  await import(`../../js/game/${m}.js?v=20260902070000`);
const FC = await import('../../js/game/FusionCatalog.js?v=20260902070000');
const FE = await import('../../js/game/FusionEngine.js?v=20260902070000');

const mkGame = (char) => ({
  selectedCharacter: char, gameState: 'playing', endless: true, _bossRush: false,
  gameOver: false, victory: false, timeAlive: 60, _chaosMode: false,
  _weaponLevels: new Map(), _consumedWeapons: new Set(),
  triggerAnnouncement() {}, player: { pos: { x: 0, y: 0 }, hp: 100, maxHp: 100 },
  enemies: [], meta: { getFusionTier: () => 1 },
});
const fillEddieToCap = (rt) => {
  for (const id of ['feedback_cabinet', 'gravity_core', 'nano_mine',
                    'blacknet_swarm_drone', 'build_ion_halo', 'build_null_lance']) rt.addWeapon(id);
};

console.log('\n── 0. Module identity is intact ──');
{
  ok('BuildEngine registry populated (25 weapons)', Object.keys(BE.WEAPON_DEFS).length === 25,
     `got ${Object.keys(BE.WEAPON_DEFS).length} — check the ?v= query on every import`);
  ok('50 passives registered', Object.keys(BE.PASSIVE_DEFS).length === 50);
  ok('25 evolution recipes registered', Object.keys(BE.EVOLUTION_RECIPES).length === 25);
  ok('20 fusion defs', Object.keys(FC.FUSION_DEFS).length === 20);
}

console.log('\n── 1. H1 — an external weapon evolves even at the BE weapon cap ──');
{
  const g = mkGame('eddie');
  const rt = new BE.BuildEngineRuntime(g); g.buildEngine = rt;
  fillEddieToCap(rt);
  ok('BE really is at the 6-weapon cap', rt.weapons.size === rt.CAPS.weapons, `size ${rt.weapons.size}`);
  g._weaponLevels.set('solo_red_thunder', 5);
  for (let i = 0; i < 3; i++) rt.addPassive('forbidden_amplifier');
  const ready = rt._readyEvolutions().map(e => e.eid);
  ok('the external evolution is reported ready', ready.includes('be_solo_of_the_damned'), JSON.stringify(ready));
  const evolved = rt._evolve('solo_red_thunder');
  ok('_evolve() succeeds instead of silently failing', evolved === true, `returned ${evolved}`);
  ok('the evolved weapon really entered the runtime', rt.weapons.has('solo_red_thunder'));
  ok('it is flagged evolved at level 5', rt.weapons.get('solo_red_thunder')?.evolved === true
     && rt.weapons.get('solo_red_thunder')?.level === 5);
  ok('the legacy layer is told to stop firing it', g._consumedWeapons.has('solo_red_thunder'));
  ok('the recipe is cleared, so the guaranteed card is not stuck',
     !rt._readyEvolutions().map(e => e.eid).includes('be_solo_of_the_damned'));
}

console.log('\n── 2. H1 — the card pool is not starved after the external evolution ──');
{
  const g = mkGame('eddie');
  const rt = new BE.BuildEngineRuntime(g); g.buildEngine = rt;
  const fe = new FE.FusionEngine(g); g.fusionEngine = fe;
  fillEddieToCap(rt);
  for (const id of ['feedback_cabinet', 'gravity_core', 'build_ion_halo', 'blacknet_swarm_drone']) {
    const w = rt.weapons.get(id); if (w) w.level = 5;
  }
  g._weaponLevels.set('solo_red_thunder', 5);
  for (let i = 0; i < 3; i++) rt.addPassive('forbidden_amplifier');
  const seen = [];
  for (let lv = 0; lv < 4; lv++) {
    const choices = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    let src = 'none';
    if (fe.injectCard(choices)) src = 'fusion';
    else if (rt.injectCards(choices)) src = 'be';
    const key = choices[choices.length - 1].key;
    if (src === 'be' && key.startsWith('be_evo_')) choices[choices.length - 1].apply?.({ upgrades: {} });
    seen.push(src + ':' + key);
  }
  ok('level-up 1 offers the external evolution', /^be:be_evo_be_solo_of_the_damned/.test(seen[0]), seen[0]);
  ok('the run is not locked out — a fusion card follows', seen.slice(1).some(s => s.startsWith('fusion:')),
     JSON.stringify(seen));
}

console.log('\n── 3. H2 — a fusion-suppressed component is never offered an evolution ──');
{
  const g = mkGame('assassin_clone');
  const rt = new BE.BuildEngineRuntime(g); g.buildEngine = rt;
  rt.addWeapon('monowire_lash'); rt.addWeapon('toxin_kunai');
  rt.weapons.get('monowire_lash').level = 5;
  rt.weapons.get('toxin_kunai').level = 5;
  for (let i = 0; i < 3; i++) { rt.addPassive('shadow_spool'); rt.addPassive('nightshade_matrix'); }
  const before = rt._readyEvolutions().map(e => e.eid);
  ok('both evolutions are ready to begin with', before.includes('be_wire_garrote_web')
     && before.includes('be_poison_petal_waltz'), JSON.stringify(before));
  rt.weapons.get('monowire_lash')._fusionSuppressed = true;   // exactly what FusionEngine.acquire() sets
  const after = rt._readyEvolutions().map(e => e.eid);
  ok('the suppressed component is dropped from the offer',
     !after.includes('be_wire_garrote_web'), JSON.stringify(after));
  ok('the player\'s other valid evolution still surfaces', after.includes('be_poison_petal_waltz'));
  ok('the guaranteed pick is not wasted (offer is non-empty)', after.length > 0);
}

console.log('\n── 4. H3 — Boss Rush blocks NEW fusions but never silences acquired ones ──');
{
  ok('fusionRunOk() exists as a separate runtime gate', typeof FC.fusionRunOk === 'function');
  const g = mkGame('taekwondo_girl');
  const fe = new FE.FusionEngine(g); g.fusionEngine = fe;
  g.buildEngine = new BE.BuildEngineRuntime(g);
  ok('FusionEngine exposes runOk()', typeof fe.runOk === 'function');
  g._bossRush = false;
  ok('outside Boss Rush: acquisition allowed', fe.modeOk() === true);
  ok('outside Boss Rush: tick allowed', fe.runOk() === true);
  g._bossRush = true;
  ok('inside Boss Rush: NEW acquisitions still blocked', fe.modeOk() === false);
  ok('inside Boss Rush: an acquired fusion keeps ticking', fe.runOk() === true);
  g._bossRush = false; g.endless = false;
  ok('Campaign/Act 1: tick gate closed too', fe.runOk() === false);
  g.endless = true; g.gameOver = true;
  ok('game over closes the tick gate', fe.runOk() === false);
  g.gameOver = false; g.gameState = 'menu';
  ok('menu closes the tick gate', fe.runOk() === false);
}

console.log('\n── 5. Nothing else was widened ──');
{
  const g = mkGame('taekwondo_girl');
  const rt = new BE.BuildEngineRuntime(g); g.buildEngine = rt;
  ok('caps untouched: 6 weapons / 6 passives / 2 per family',
     rt.CAPS.weapons === 6 && rt.CAPS.passives === 6 && rt.CAPS.perFamily === 2, JSON.stringify(rt.CAPS));
  // a NON-external weapon must still obey the cap
  for (const id of ['vector_heel', 'storm_sash', 'gravity_core', 'nano_mine',
                    'build_ion_halo', 'build_null_lance']) rt.addWeapon(id);
  const sizeAtCap = rt.weapons.size;
  rt.addWeapon('blacknet_swarm_drone');
  ok('a normal weapon is still refused at the cap', rt.weapons.size === sizeAtCap,
     `${sizeAtCap} -> ${rt.weapons.size}`);
  ok('required fusion component levels unchanged [5,3,3]',
     JSON.stringify(FC.FUSION_REQ_LEVELS) === '[5,3,3]');
  ok('fusionModeOk still refuses Campaign', FC.fusionModeOk({ gameState: 'playing', endless: false }) === false);
  ok('fusionModeOk still refuses Boss Rush', FC.fusionModeOk({ gameState: 'playing', endless: true, _bossRush: true }) === false);
  ok('catalog validates clean', (FC.validateFusionCatalog?.() ?? []).length === 0);
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
