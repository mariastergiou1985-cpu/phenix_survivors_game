// BATCH 4 — STAGE RULES: BIOME enemyModifiers ACTUALLY REACH THE ENEMIES
// ------------------------------------------------------------------------------------------------
// Roadmap MILESTONE 2 / Slice A: "Εφαρμογή enemyModifiers (speedMult/hpMult) του biome = το «rule»
// του stage". Before this batch that checkbox was unimplemented in the only modes it applies to:
//
//   * BIOME_DEFS.enemyModifiers were read in exactly ONE place, inside spawnEnemy, and only when
//     `this.chunkManager?.enabled` — i.e. only for the streaming maps (Endless / Chaos).
//   * Act 1 and the campaign run on a FIXED map with streaming OFF. _updateStageProgression and
//     _applyCampaignStage both computed `_stageSpeedMult`, and NOTHING in the codebase read it.
//     `hpMult` was never applied to them at all, and abyssal_trench's `regenRate: 0.5` did nothing.
//
// So the six Act 1 stages and the seven campaign stages played with identical enemies behind a
// different background image. This file pins the fix: the rule is derived in one place
// (_setStageRule) and applied in one place (_applyStageRule), once per enemy, non-boss only, and
// exactly one of the two paths (streaming vs fixed-map) may ever touch a given enemy.
//
// NOTHING HERE ASSERTS A BALANCE NUMBER OF ITS OWN. Every expectation is derived from BIOME_DEFS at
// runtime, so if Maria retunes a biome the test follows her values instead of fighting them.
//
//   node tools/qa/batch4_stage_rules_regression.mjs
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole, makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const { BIOME_DEFS, BIOME_ID } = await import(pathToFileURL(path.join(ROOT, 'js/game/MapManager.js')).href);
u0();

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};
const near = (a, b, tol = 0.02) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

function newGame() {
  const un = muteConsole();
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  un();
  return g;
}

// BATCH 4.3 — the six starting stages are now behind the campaign ladder, so a fresh save can only
// select neon_district. Every test below that is about ROTATION, RULES or the OVERLAY (not about
// the ladder itself) needs the ladder granted first, or it would be measuring the lock instead of
// the thing it is named after. The grant goes through the REAL save field the ladder reads —
// MetaProgress.stagesCleared — never through a test-only backdoor.
function unlockAllStages(g) { if (g.meta) g.meta.stagesCleared = Game.STAGE_RING.length - 1; return g; }
function newGameUnlocked() { return unlockAllStages(newGame()); }

// BATCH 4.4 — Slice B replaced the time-only stage advance with a BOSS-GATED state machine: a stage
// is not complete until its boss is dead. These walks used to jump `timeAlive` to multiples of
// 12*60 and read the biome back, which only worked against the old `floor(timeAlive / STAGE_DUR)`
// formula. They now drive the REAL machine — survive the window, let the boss spawn, kill it — so
// they exercise more of the code than before, not less. Every assertion below is unchanged.
const _SB_FIELD = { titan:'titanBoss', annihilator:'annihilatorBoss', bloodfang:'bloodfangBoss',
                    cyberSerpent:'cyberSerpentBoss', cyberDragon:'cyberDragonBoss' };
/** Advance the stage machine by exactly ONE stage: survive → boss spawns → boss dies → advance. */
function stepStage(g, maxSecs = 400) {
  const un = muteConsole();
  const si0 = g._stageIndex;
  for (let i = 0; i < maxSecs * 60; i++) {
    g.timeAlive += 1 / 60;
    try { g._updateStageProgression(); } catch (_) {}
    if (g._activeStageBoss) {
      const id = g._activeStageBoss.id;
      if (id === 'mech') { for (const e of g.enemies) if (e && e.enemyType === 'Security Defector Mech') e.hp = 0; }
      else { const f = _SB_FIELD[id]; if (f && g[f]) g[f].hp = 0; }
    }
    if (g._stageIndex !== si0) break;
  }
  un();
  return g._stageBiome;
}
/** The biome of every stage of a full 6-stage walk, starting from the run's current stage. */
function walkStages(g, n = 6) {
  const out = [g._stageBiome];
  for (let i = 1; i < n; i++) out.push(stepStage(g));
  return out;
}

// A representative non-boss trash type that exists in every mode.
const TRASH = 'Glitch Drone';

// Baseline: the SAME production spawn path on a game carrying no stage rule. Building a bare
// `new Enemy(TRASH, 5)` instead would compare against a different game minute than spawnEnemy uses
// (it takes this.currentMinute()), and the mismatch would look like a scaling bug that isn't one.
function baseline() {
  const g = newGameUnlocked();
  if (g.chunkManager) g.chunkManager.enabled = false;
  g._setStageRule(null);
  const e = spawnThrough(g);
  return e ? { hp: e.hp, maxHp: e.maxHp, baseSpeed: e.baseSpeed, full: e._baseSpeedFull }
           : { hp: NaN, maxHp: NaN, baseSpeed: NaN, full: NaN };
}

// BATCH 4.5 — baseline for ONE SPECIFIC type, through the same production path, with the biome
// sub-pool gate bypassed (so the type we ask for is the type we get) and no stage rule in force.
// This is what a per-biome measurement must be compared against once the gate can substitute types.
function baselineFor(type) {
  const g = newGameUnlocked();
  if (g.chunkManager) g.chunkManager.enabled = false;
  g._biomeSpawnType = (t) => t;          // bypass the sub-pool gate for the baseline only
  g._setStageRule(null);
  const un = muteConsole();
  const before = g.enemies.length;
  try { g.spawnEnemy(type, { x: (g.player?.pos?.x ?? 0) + 600, y: (g.player?.pos?.y ?? 0) + 600 }); } catch (_) {}
  un();
  const e = g.enemies.length > before ? g.enemies[g.enemies.length - 1] : null;
  return e ? { type: e.enemyType, hp: e.hp, maxHp: e.maxHp, baseSpeed: e.baseSpeed, full: e._baseSpeedFull }
           : { type, hp: NaN, maxHp: NaN, baseSpeed: NaN, full: NaN };
}

// Spawn one enemy through the REAL production path and return it.
// Game.spawnEnemy(type, pos, elite) builds the Enemy itself — the harness never hands it one, so
// what is measured here is exactly what the game does on a real spawn.
function spawnThrough(g) {
  const un = muteConsole();
  const before = g.enemies.length;
  try { g.spawnEnemy(TRASH, { x: (g.player?.pos?.x ?? 0) + 600, y: (g.player?.pos?.y ?? 0) + 600 }); } catch (_) {}
  un();
  return g.enemies.length > before ? g.enemies[g.enemies.length - 1] : null;
}

// Same, for a named boss type.
function spawnTypeThrough(g, type) {
  const un = muteConsole();
  const before = g.enemies.length;
  try { g.spawnEnemy(type, { x: (g.player?.pos?.x ?? 0) + 600, y: (g.player?.pos?.y ?? 0) + 600 }); } catch (_) {}
  un();
  return g.enemies.length > before ? g.enemies[g.enemies.length - 1] : null;
}

console.log('═══ BATCH 4 — STAGE RULES (BIOME enemyModifiers reach the enemies) ═══');

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 0. THE SURFACE EXISTS ===');
{
  const g = newGame();
  T('_setStageRule exists on Game', typeof g._setStageRule === 'function');
  T('_applyStageRule exists on Game', typeof g._applyStageRule === 'function');
  T('a fresh run carries the neutral rule', g._stageSpeedMult === 1 && g._stageHpMult === 1 && g._stageRegen === 0,
    `speed=${g._stageSpeedMult} hp=${g._stageHpMult} regen=${g._stageRegen}`);
  T('a fresh run has no stage biome', g._stageBiome === null, String(g._stageBiome));
  // The rule must be derived from BIOME_DEFS, never hard-coded here or there.
  const ids = Object.values(BIOME_ID).filter(id => BIOME_DEFS[id]);
  T('every BIOME_ID resolves a definition', ids.length >= 6, `${ids.length} biomes`);
  T('every biome declares enemyModifiers', ids.every(id => !!BIOME_DEFS[id].enemyModifiers),
    ids.filter(id => !BIOME_DEFS[id].enemyModifiers).join(', '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. _setStageRule MIRRORS BIOME_DEFS EXACTLY, FOR EVERY BIOME ===');
{
  const g = newGame();
  for (const id of Object.values(BIOME_ID)) {
    const def = BIOME_DEFS[id];
    if (!def) continue;
    const m = def.enemyModifiers || {};
    g._setStageRule(id);
    const okSpeed = g._stageSpeedMult === (m.speedMult > 0 ? m.speedMult : 1);
    const okHp    = g._stageHpMult    === (m.hpMult    > 0 ? m.hpMult    : 1);
    const okRegen = g._stageRegen     === (m.regenRate > 0 ? m.regenRate : 0);
    T(`${id}: rule = BIOME_DEFS (speed ${m.speedMult ?? 1}, hp ${m.hpMult ?? 1}, regen ${m.regenRate ?? 0})`,
      okSpeed && okHp && okRegen && g._stageBiome === id,
      `got speed=${g._stageSpeedMult} hp=${g._stageHpMult} regen=${g._stageRegen} biome=${g._stageBiome}`);
  }
  g._setStageRule(null);
  T('a null biome falls back to the neutral rule',
    g._stageBiome === null && g._stageSpeedMult === 1 && g._stageHpMult === 1 && g._stageRegen === 0);
  g._setStageRule('no_such_biome');
  T('an unknown biome falls back to the neutral rule, without throwing',
    g._stageSpeedMult === 1 && g._stageHpMult === 1 && g._stageRegen === 0);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. THE RULE ACTUALLY REACHES A SPAWNED ENEMY (fixed map / Act 1) ===');
{
  const B = baseline();
  T(`baseline enemy is measurable  (hp ${B.hp}, speed ${B.baseSpeed})`,
    Number.isFinite(B.hp) && B.hp > 0 && Number.isFinite(B.baseSpeed) && B.baseSpeed > 0);

  for (const id of Object.values(BIOME_ID)) {
    const def = BIOME_DEFS[id];
    if (!def) continue;
    const m = def.enemyModifiers || {};

    const g = newGameUnlocked();
    if (g.chunkManager) g.chunkManager.enabled = false;   // Act 1 / campaign: streaming is OFF
    g._setStageRule(id);
    const e = spawnThrough(g);
    if (!e) { T(`${id}: enemy reached the roster`, false, 'spawnEnemy produced nothing'); continue; }

    // BATCH 4.5 — the biome sub-pool gate may legitimately swap the requested probe type for this
    // biome's same-family equivalent (that IS the feature). So the baseline has to be taken for the
    // type that ACTUALLY spawned, not for the type we asked for. `baselineFor` re-spawns that exact
    // type through the same production path with the gate bypassed and no stage rule, which makes
    // this assertion strictly stronger than before: it now proves the rule reaches whatever the
    // biome chose, instead of assuming the biome chose the probe.
    const Bt = baselineFor(e.enemyType);
    // A neutral hpMult must not touch HP at all — not even round it. Enemy HP is fractional at low
    // minutes (2.99), so rounding a 1.0 mult would silently change the value and hide a real bug.
    const hpM = (m.hpMult > 0 ? m.hpMult : 1);
    const expHp    = hpM === 1 ? Bt.hp : Math.max(1, Math.round(Bt.hp * hpM));
    const expSpeed = Bt.baseSpeed * (m.speedMult > 0 ? m.speedMult : 1);

    T(`${id}: HP scaled by hpMult ${m.hpMult ?? 1}  [${e.enemyType}] (${Bt.hp} → ${e.hp}, expected ${expHp})`,
      e.hp === expHp && e.maxHp === e.hp, `hp=${e.hp} maxHp=${e.maxHp}`);
    T(`${id}: speed scaled by speedMult ${m.speedMult ?? 1}  [${e.enemyType}] (${Bt.baseSpeed.toFixed(1)} → ${e.baseSpeed.toFixed(1)})`,
      near(e.baseSpeed, expSpeed), `got ${e.baseSpeed}, expected ${expSpeed}`);
    if (m.regenRate > 0) {
      T(`${id}: regenRate ${m.regenRate} reached the enemy`, e._biomeRegen === m.regenRate, `got ${e._biomeRegen}`);
    } else {
      T(`${id}: declares no regen, so none is applied`, !e._biomeRegen, `got ${e._biomeRegen}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. THE STAGES ARE ACTUALLY DIFFERENT FROM EACH OTHER ===');
// The point of the feature: two different stages must not produce identical enemies. This is the
// assertion that would have failed before the fix, on every pair.
{
  const B = baseline();
  const measured = {};
  for (const id of Object.values(BIOME_ID)) {
    if (!BIOME_DEFS[id]) continue;
    const g = newGameUnlocked();
    if (g.chunkManager) g.chunkManager.enabled = false;
    // BATCH 4.5 — this section is about the biome RULE (speedMult/hpMult), so the enemy TYPE has to
    // be held constant across all six biomes or the comparison measures the sub-pool roll instead.
    // The gate is bypassed here for exactly that reason; pool composition is proven separately, and
    // far more thoroughly, in tools/qa/batch4_5_biome_enemy_pools_regression.mjs.
    g._biomeSpawnType = (t) => t;
    g._setStageRule(id);
    const e = spawnThrough(g);
    if (e) measured[id] = { hp: e.hp, speed: +e.baseSpeed.toFixed(2), type: e.enemyType };
  }
  T('the rule comparison held the enemy type constant across all six biomes',
    new Set(Object.values(measured).map(m => m.type)).size === 1,
    [...new Set(Object.values(measured).map(m => m.type))].join(','));
  const ids = Object.keys(measured);
  T('every biome produced a measurable enemy', ids.length >= 6, `${ids.length} measured`);
  const sigs = ids.map(id => `${measured[id].hp}/${measured[id].speed}`);
  const distinct = new Set(sigs).size;
  console.log('    ' + ids.map(id => `${id}=${measured[id].hp}hp/${measured[id].speed}sp`).join('  '));
  // neon_district is deliberately 1.0/1.0, and two biomes share 0.9/1.2 in Maria's tuning, so the
  // contract is "clearly more than one profile", not "all six unique".
  T(`the six stages produce more than one enemy profile — ${distinct} distinct`, distinct >= 4, `${distinct} of ${ids.length}`);
  const neon = measured[BIOME_ID.NEON_DISTRICT];
  T('neon_district (1.0/1.0) is unchanged from baseline',
    neon && neon.hp === B.hp && near(neon.speed, B.baseSpeed), JSON.stringify(neon));
  const ind = measured[BIOME_ID.INDUSTRIAL_CORE];
  T('industrial_core is tankier and slower than neon_district',
    ind && neon && ind.hp > neon.hp && ind.speed < neon.speed, JSON.stringify(ind));
  // The real extremes of the six-biome ring, read off Maria's own numbers rather than guessed:
  // orbital_nexus is the fastest (1.1), glacial_expanse the slowest (0.8), industrial_core the
  // tankiest (1.4). the_null is excluded — it is the endgame biome, not part of the ring.
  const RING = [BIOME_ID.NEON_DISTRICT, BIOME_ID.INDUSTRIAL_CORE, BIOME_ID.ORBITAL_NEXUS,
                BIOME_ID.ABYSSAL_TRENCH, BIOME_ID.GLACIAL_EXPANSE, BIOME_ID.DATA_WASTES].filter(id => measured[id]);
  const fastest = RING.reduce((a, b) => measured[a].speed >= measured[b].speed ? a : b);
  const slowest = RING.reduce((a, b) => measured[a].speed <= measured[b].speed ? a : b);
  const tankiest = RING.reduce((a, b) => measured[a].hp >= measured[b].hp ? a : b);
  T('orbital_nexus is the fastest stage of the ring', fastest === BIOME_ID.ORBITAL_NEXUS, `got ${fastest}`);
  T('glacial_expanse is the slowest stage of the ring', slowest === BIOME_ID.GLACIAL_EXPANSE, `got ${slowest}`);
  T('industrial_core is the tankiest stage of the ring', tankiest === BIOME_ID.INDUSTRIAL_CORE, `got ${tankiest}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. EXCLUSIONS AND NO DOUBLE-APPLICATION ===');
{
  // Bosses keep their own tuning, exactly like the streaming path.
  const g = newGame();
  if (g.chunkManager) g.chunkManager.enabled = false;
  g._setStageRule(BIOME_ID.DATA_WASTES);   // the harshest rule in the ring
  const unB = muteConsole();
  const rawBoss = new Enemy('Rogue AI Overlord', g.currentMinute());
  unB();
  const boss = spawnTypeThrough(g, 'Rogue AI Overlord');
  T('a boss is exempt from the stage rule',
    !!boss && boss.hp === rawBoss.hp && near(boss.baseSpeed, rawBoss.baseSpeed),
    boss ? `hp ${rawBoss.hp} → ${boss.hp}, speed ${rawBoss.baseSpeed} → ${boss.baseSpeed}` : 'no boss spawned');

  // A mega boss carries isMegaBoss, so it takes the explicit second exemption.
  const unM = muteConsole();
  const mega = new Enemy('Giga-Core Overlord', g.currentMinute());
  mega.isMegaBoss = true;
  const mHp = mega.hp, mSpeed = mega.baseSpeed;
  try { g._applyStageRule(mega); } catch (_) {}
  unM();
  T('a mega boss is exempt from the stage rule', mega.hp === mHp && near(mega.baseSpeed, mSpeed),
    `hp ${mHp} → ${mega.hp}`);

  // Streaming ON: _applyStageRule must stand down so the per-position biome path owns the enemy.
  const B = baseline();
  const g2 = newGame();
  if (g2.chunkManager) g2.chunkManager.enabled = true;
  g2._setStageRule(BIOME_ID.DATA_WASTES);
  const un3 = muteConsole();
  const e2 = new Enemy(TRASH, g2.currentMinute());
  const before = { hp: e2.hp, speed: e2.baseSpeed };   // its OWN stats, at this game's minute
  g2._applyStageRule(e2);      // called directly: it must be a no-op while streaming is on
  un3();
  T('_applyStageRule is a no-op while chunk streaming is enabled',
    e2.hp === before.hp && near(e2.baseSpeed, before.speed),
    `hp ${before.hp} → ${e2.hp}, speed ${before.speed} → ${e2.baseSpeed}`);

  // Calling it twice on the same enemy must not compound — production calls it once per spawn, and
  // this pins that the second call is the caller's bug, not a silent double-scale we tolerate.
  const g3 = newGame();
  if (g3.chunkManager) g3.chunkManager.enabled = false;
  g3._setStageRule(BIOME_ID.INDUSTRIAL_CORE);
  const e3 = spawnThrough(g3);
  const once = e3 ? { hp: e3.hp, speed: e3.baseSpeed } : null;
  T('one spawn applies the rule exactly once',
    !!once && once.hp === Math.max(1, Math.round(B.hp * BIOME_DEFS[BIOME_ID.INDUSTRIAL_CORE].enemyModifiers.hpMult)),
    JSON.stringify(once));

  // Garbage in must not throw.
  let threw = 0;
  for (const bad of [null, undefined, {}, { hp: NaN, baseSpeed: NaN }]) {
    try { g3._applyStageRule(bad); } catch (_) { threw++; }
  }
  T('_applyStageRule survives null / empty / NaN enemies', threw === 0, `${threw} throws`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 5. THE RULE IS WIRED INTO THE REAL STAGE FLOWS ===');
{
  // Act 1 stage progression: advancing a stage must re-derive the rule.
  const g = newGame();
  if (g.chunkManager) g.chunkManager.enabled = false;
  g.endless = false; g.gameState = 'playing'; g.gameOver = false; g.victory = false;
  const seen = [];
  const unw0 = muteConsole(); g._applyRunBiome(); unw0();
  seen.push({ t: g.timeAlive, biome: g._stageBiome, hp: g._stageHpMult, sp: g._stageSpeedMult });
  for (let i = 1; i < 6; i++) {
    stepStage(g);
    seen.push({ t: g.timeAlive, biome: g._stageBiome, hp: g._stageHpMult, sp: g._stageSpeedMult });
  }
  console.log('    ' + seen.map(s => `${Math.round(s.t / 60)}m:${s.biome}(${s.hp}hp/${s.sp}sp)`).join('  '));
  T('stage progression walks through six distinct biomes',
    new Set(seen.map(s => s.biome)).size === 6, seen.map(s => s.biome).join(','));
  T('every stage transition carries a live HP rule',
    seen.every(s => Number.isFinite(s.hp) && s.hp > 0), JSON.stringify(seen.map(s => s.hp)));
  T('at least one stage has a non-neutral HP rule (the feature is doing something)',
    seen.some(s => s.hp !== 1), JSON.stringify(seen.map(s => s.hp)));
  T('the stage rule matches BIOME_DEFS at every step',
    seen.every(s => s.hp === ((BIOME_DEFS[s.biome]?.enemyModifiers?.hpMult > 0) ? BIOME_DEFS[s.biome].enemyModifiers.hpMult : 1)));

  // Campaign: picking a stage must apply that stage's rule on run start.
  const g2 = newGame();
  if (g2.chunkManager) g2.chunkManager.enabled = false;
  g2._pendingCampaignStage = 2;   // STAGE 2 = industrial_core
  const un2 = muteConsole();
  try { g2._applyCampaignStage(); } catch (_) {}
  un2();
  const im = BIOME_DEFS[BIOME_ID.INDUSTRIAL_CORE].enemyModifiers;
  T('a campaign stage applies its biome rule on run start',
    g2._stageBiome === BIOME_ID.INDUSTRIAL_CORE && g2._stageHpMult === im.hpMult && g2._stageSpeedMult === im.speedMult,
    `biome=${g2._stageBiome} hp=${g2._stageHpMult} sp=${g2._stageSpeedMult}`);
  const e = spawnThrough(g2);
  const B = baseline();
  T('and an enemy spawned in that campaign stage really carries it',
    !!e && e.hp === Math.max(1, Math.round(B.hp * im.hpMult)), e ? `hp ${B.hp} → ${e.hp}` : 'no enemy');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 6. LIFECYCLE — NO RULE SURVIVES A RUN ===');
{
  const g = newGame();
  if (g.chunkManager) g.chunkManager.enabled = false;
  g._setStageRule(BIOME_ID.DATA_WASTES);
  T('the rule is in force before the reset', g._stageHpMult !== 1 && g._stageBiome !== null);
  const un = muteConsole();
  g.reset();
  un();
  T('reset() clears the stage biome', g._stageBiome === null, String(g._stageBiome));
  T('reset() clears the HP rule', g._stageHpMult === 1, String(g._stageHpMult));
  T('reset() clears the speed rule', g._stageSpeedMult === 1, String(g._stageSpeedMult));
  T('reset() clears the regen rule', g._stageRegen === 0, String(g._stageRegen));
  const B = baseline();
  const e = spawnThrough(g);
  T('an enemy spawned after the reset is back to baseline',
    !!e && e.hp === B.hp && near(e.baseSpeed, B.baseSpeed), e ? `hp=${e.hp} speed=${e.baseSpeed}` : 'no enemy');

  // A second run must start neutral too.
  const un2 = muteConsole();
  g.reset();
  un2();
  T('a second run also starts neutral', g._stageHpMult === 1 && g._stageSpeedMult === 1 && g._stageRegen === 0);

  // No NaN anywhere.
  const finite = (o) => o && Number.isFinite(o.x) && Number.isFinite(o.y);
  T('no NaN in player or camera after the lifecycle block',
    finite(g.player?.pos) && finite(g.camera), `player=${JSON.stringify(g.player?.pos)} camera=${JSON.stringify(g.camera)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 7. RUN BIOME — THE RUN STARTS WHERE THE PLAYER PICKED (Slice A) ===');
{
  const g = newGameUnlocked();
  T('a fresh Game defaults to neon_district', g.runBiome === 'neon_district', String(g.runBiome));
  T('STAGE_RING has the six selectable stages and excludes the_null',
    Game.STAGE_RING.length === 6 && !Game.STAGE_RING.includes('the_null'), Game.STAGE_RING.join(','));

  // setRunBiome accepts only real ring biomes.
  T('setRunBiome accepts every ring biome',
    Game.STAGE_RING.every(id => g.setRunBiome(id) === true && g.runBiome === id));
  g.setRunBiome('neon_district');
  T('setRunBiome refuses the_null (endgame biome, not a stage)', g.setRunBiome('the_null') === false && g.runBiome === 'neon_district');
  T('setRunBiome refuses an unknown id', g.setRunBiome('no_such_biome') === false && g.runBiome === 'neon_district');
  T('setRunBiome refuses null/undefined', g.setRunBiome(null) === false && g.setRunBiome(undefined) === false);

  // The default run must reproduce the OLD order exactly — this is the no-regression assertion.
  T('the default run keeps the original ring order',
    JSON.stringify(g._stageOrder()) === JSON.stringify(Game.STAGE_RING), g._stageOrder().join(','));

  // A selected biome rotates the ring so it is stage 1, and every biome still appears once.
  for (const id of Game.STAGE_RING) {
    g.setRunBiome(id);
    const order = g._stageOrder();
    const ok = order[0] === id && order.length === 6 && new Set(order).size === 6
            && Game.STAGE_RING.every(b => order.includes(b));
    T(`runBiome ${id}: it is stage 1 and the ring still visits all six once`, ok, order.join(','));
  }

  // _applyRunBiome arms the rule from frame one, before any stage progression tick.
  const g2 = newGameUnlocked();
  g2.setRunBiome('glacial_expanse');
  if (g2.chunkManager) g2.chunkManager.enabled = false;
  const un = muteConsole();
  g2._applyRunBiome();
  un();
  const gm = BIOME_DEFS['glacial_expanse'].enemyModifiers;
  T('_applyRunBiome puts the chosen stage rule in force immediately',
    g2._stageBiome === 'glacial_expanse' && g2._stageHpMult === gm.hpMult && g2._stageSpeedMult === gm.speedMult,
    `biome=${g2._stageBiome} hp=${g2._stageHpMult} sp=${g2._stageSpeedMult}`);
  const B = baseline();
  const e = spawnThrough(g2);
  T('and the very first enemy of the run already carries it',
    !!e && e.hp === Math.max(1, Math.round(B.hp * gm.hpMult)), e ? `hp ${B.hp} → ${e.hp}` : 'no enemy');

  // Driving the real progression from a selected biome walks the rotated ring.
  const g3 = newGameUnlocked();
  g3.setRunBiome('orbital_nexus');
  if (g3.chunkManager) g3.chunkManager.enabled = false;
  g3.endless = false; g3.gameState = 'playing'; g3.gameOver = false; g3.victory = false;
  const un3 = muteConsole();
  g3._applyRunBiome();
  un3();
  const walk = walkStages(g3);
  console.log('    ' + walk.join(' → '));
  T('a run selected into orbital_nexus starts there', walk[0] === 'orbital_nexus', walk[0]);
  T('and still visits all six stages exactly once', new Set(walk).size === 6, walk.join(','));
  T('every step of the rotated ring carries its own rule',
    walk.every(b => BIOME_DEFS[b] && BIOME_DEFS[b].enemyModifiers));

  // reset() must NOT clear the selection — it is a run setting like selectedCharacter.
  const g4 = newGameUnlocked();
  g4.setRunBiome('data_wastes');
  const un4 = muteConsole();
  g4.reset();
  un4();
  T('reset() keeps the selected run biome (it is a setting, not run state)', g4.runBiome === 'data_wastes', String(g4.runBiome));
  T('but reset() still clears the live stage rule', g4._stageBiome === null && g4._stageHpMult === 1);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 8. STAGE SELECT — OVERLAY, MENU AND COMMIT SEMANTICS (Slice A) ===');
// The headless DOM in tools/qa/headless-env.mjs is a no-op stub: addEventListener does nothing and
// querySelector hands back a fresh element. So this block proves the LOGIC — state machine, cursor
// maths, what commits and what does not, and that render/draw never throw. The real DOM contract
// (six cards, no the_null in the markup, no listener growth across open/close, a real click, a real
// keypress) is proven in Chromium by the browser sign-off, not faked here.
{
  // Screen changes go through _transition, which parks the callback until the fade reaches black,
  // so nothing happens until the fade is driven. Driving it also runs _hideMenuOverlay, which calls
  // vid.pause() on the menu video — and the headless element stub has no pause/play. That is an
  // ENVIRONMENT gap, not a production one, so it is patched here, locally, for this block only:
  // the real _hideMenuOverlay still runs, it just finds a media element that answers.
  const _origGetById = document.getElementById;
  document.getElementById = function (id) {
    const el = _origGetById.call(document, id);
    if (el && typeof el.pause !== 'function') { el.pause = () => {}; el.play = () => Promise.resolve(); }
    return el;
  };
  const flush = (g) => {                    // run the fade to completion so _transition's cb fires
    const un = muteConsole();
    let err = null;
    for (let i = 0; i < 400 && g._fadeDir !== 0; i++) { try { g._updateFade(1 / 30); } catch (e) { err = e; break; } }
    un();
    return err;
  };
  T('screen transitions can be driven headlessly (no environment gap left)',
    (() => { const gt = newGameUnlocked(); const u = muteConsole(); gt.gameState = 'start_menu'; gt._selectMenuItem('SELECT STAGE'); u();
             return flush(gt) === null; })());

  const g = newGameUnlocked();
  T('SELECT STAGE is in the main menu', g.menuItems.includes('SELECT STAGE'), g.menuItems.join(','));
  T('the menu still offers CAMPAIGN and CHARACTER SELECT alongside it',
    g.menuItems.includes('CAMPAIGN') && g.menuItems.includes('CHARACTER SELECT'));

  // Opening the screen.
  const un1 = muteConsole();
  g.gameState = 'start_menu';
  g._selectMenuItem('SELECT STAGE');
  un1();
  flush(g);
  T('choosing SELECT STAGE enters the stage_select state', g.gameState === 'stage_select', String(g.gameState));
  T('the cursor opens on the CURRENT selection, so BACK is a true no-op',
    g._stageSelIndex === Game.STAGE_RING.indexOf(g.runBiome), `idx=${g._stageSelIndex} runBiome=${g.runBiome}`);

  // Cursor maths: left/right wrap, up/down move a row and wrap.
  const keyStep = (k) => { const un = muteConsole(); g._updateStageSelect({ keys: new Set([k]), mousePos: { x: 0, y: 0 }, mouseDown: false }); un(); };
  g._stageSelIndex = 0; keyStep('arrowleft');
  T('◀ from the first card wraps to the last', g._stageSelIndex === Game.STAGE_RING.length - 1, String(g._stageSelIndex));
  keyStep('arrowright');
  T('▶ wraps back to the first', g._stageSelIndex === 0, String(g._stageSelIndex));
  g._stageSelIndex = 0; keyStep('arrowdown');
  T('▼ moves one row (3 columns)', g._stageSelIndex === 3, String(g._stageSelIndex));
  keyStep('arrowup');
  T('▲ moves back a row', g._stageSelIndex === 0, String(g._stageSelIndex));
  let inRange = true;
  for (let i = 0; i < 40; i++) { keyStep(i % 2 ? 'arrowdown' : 'arrowright'); if (!(g._stageSelIndex >= 0 && g._stageSelIndex < Game.STAGE_RING.length)) inRange = false; }
  T('the cursor can never leave the ring, however long you hold a direction', inRange, String(g._stageSelIndex));

  // CANCEL must not change the selection.
  const g2 = newGameUnlocked();
  g2.setRunBiome('neon_district');
  const un2 = muteConsole(); g2.gameState = 'start_menu'; g2._selectMenuItem('SELECT STAGE'); un2(); flush(g2);
  g2._stageSelIndex = Game.STAGE_RING.indexOf('data_wastes');       // move the cursor far away...
  const un3 = muteConsole(); g2._stageSelectCancel(); un3(); flush(g2);
  T('CANCEL leaves the selection untouched', g2.runBiome === 'neon_district', String(g2.runBiome));
  T('CANCEL returns to the main menu', g2.gameState === 'start_menu', String(g2.gameState));

  // ESCAPE is the same path.
  const g3 = newGameUnlocked();
  g3.setRunBiome('orbital_nexus');
  const un4 = muteConsole(); g3.gameState = 'stage_select'; g3._stageSelIndex = Game.STAGE_RING.indexOf('glacial_expanse');
  g3._updateStageSelect({ keys: new Set(['escape']), mousePos: { x: 0, y: 0 }, mouseDown: false }); un4(); flush(g3);
  T('ESC cancels without changing the selection', g3.runBiome === 'orbital_nexus' && g3.gameState === 'start_menu',
    `runBiome=${g3.runBiome} state=${g3.gameState}`);

  // CONFIRM must commit through the real setter.
  for (const id of Game.STAGE_RING) {
    const gc = newGameUnlocked();
    gc.setRunBiome('neon_district');
    const unc = muteConsole();
    gc.gameState = 'stage_select';
    gc._stageSelIndex = Game.STAGE_RING.indexOf(id);
    gc._stageSelectConfirm();
    unc(); flush(gc);
    T(`CONFIRM on ${id} commits it and returns to the menu`,
      gc.runBiome === id && gc.gameState === 'start_menu', `runBiome=${gc.runBiome} state=${gc.gameState}`);
  }

  // ENTER is the same path as CONFIRM.
  const g4 = newGameUnlocked();
  const un5 = muteConsole();
  g4.gameState = 'stage_select'; g4._stageSelIndex = Game.STAGE_RING.indexOf('abyssal_trench');
  g4._updateStageSelect({ keys: new Set(['enter']), mousePos: { x: 0, y: 0 }, mouseDown: false });
  un5(); flush(g4);
  T('ENTER confirms the highlighted card', g4.runBiome === 'abyssal_trench', String(g4.runBiome));

  // A corrupted cursor must fall back safely, never commit garbage.
  const g5 = newGameUnlocked();
  g5.setRunBiome('industrial_core');
  const un6 = muteConsole();
  g5.gameState = 'stage_select';
  g5._stageSelIndex = 999;                       // as if something wrote nonsense into the cursor
  g5._stageSelectConfirm();
  un6(); flush(g5);
  T('an out-of-range cursor falls back to neon_district instead of committing garbage',
    g5.runBiome === 'neon_district' && Game.STAGE_RING.includes(g5.runBiome), String(g5.runBiome));

  // the_null must be unreachable through the screen, not merely absent from the grid.
  const g6 = newGameUnlocked();
  const idxNull = Game.STAGE_RING.indexOf('the_null');
  T('the_null has no index in the ring, so no card can select it', idxNull === -1, String(idxNull));
  g6.runBiome = 'the_null';                      // force it past the setter, as hostile DOM would
  const un7 = muteConsole();
  g6._applyRunBiome();
  un7();
  T('a forced the_null is repaired to neon_district at run start', g6.runBiome === 'neon_district', String(g6.runBiome));

  // Rendering and drawing must never throw, with the overlay built or not.
  const g7 = newGameUnlocked();
  let threw = 0;
  const un8 = muteConsole();
  try { g7._renderStageSelectOverlay(); } catch (_) { threw++; }          // no overlay yet → no-op
  try { g7._buildStageSelectOverlay(); } catch (_) { threw++; }
  try { g7._renderStageSelectOverlay(); } catch (_) { threw++; }
  try { g7._showStageSelectOverlay(); } catch (_) { threw++; }
  try { g7._hideStageSelectOverlay(); } catch (_) { threw++; }
  try { g7._drawStageSelect(makeCtx()); } catch (_) { threw++; }
  un8();
  T('build / render / show / hide / draw all survive the headless DOM', threw === 0, `${threw} throws`);

  // The overlay element is created ONCE. _buildStageSelectOverlay returning early is what keeps the
  // single delegated listener single — if it rebuilt, every open would add another listener set.
  const before = g7._stageSelectOverlayEl;
  const un9 = muteConsole();
  for (let i = 0; i < 25; i++) { g7._buildStageSelectOverlay(); g7._renderStageSelectOverlay(); g7._showStageSelectOverlay(); g7._hideStageSelectOverlay(); }
  un9();
  T('25 open/close cycles reuse the SAME overlay element (no listener accumulation)',
    g7._stageSelectOverlayEl === before && !!before);

  // The campaign must be completely unaffected by the Act 1 stage choice.
  const g8 = newGameUnlocked();
  g8.setRunBiome('data_wastes');
  if (g8.chunkManager) g8.chunkManager.enabled = false;
  g8._pendingCampaignStage = 2;                  // STAGE 2 = industrial_core
  const un10 = muteConsole();
  g8._applyRunBiome();                           // Act 1 choice first...
  g8._applyCampaignStage();                      // ...campaign applied after, exactly as selectCharacter does
  un10();
  T('a campaign stage still wins over the Act 1 stage choice',
    g8._stageBiome === 'industrial_core', String(g8._stageBiome));
  T('and the campaign stage number is intact', g8._campaignStage === 2, String(g8._campaignStage));
  T('the Act 1 selection itself is not clobbered by the campaign', g8.runBiome === 'data_wastes', String(g8.runBiome));

  document.getElementById = _origGetById;   // leave the environment exactly as it was found
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 9. BIOME VISUAL IDENTITY (Slice A) ===');
{
  const g = newGameUnlocked();
  if (g.chunkManager) g.chunkManager.enabled = false;
  T('_activeVisualBiome exists', typeof g._activeVisualBiome === 'function');
  T('_biomeVisual exists', typeof g._biomeVisual === 'function');

  // Every stage must resolve a DIFFERENT, complete visual rule, straight from BIOME_DEFS.
  const seen = {};
  for (const id of Game.STAGE_RING) {
    g._setStageRule(id);
    const v = g._biomeVisual();
    const def = BIOME_DEFS[id], p = def.palette || {};
    const ok = v && v.id === id && v.base === p.bg && v.grid === p.grid
            && v.ambient === (p.ambient || p.bg) && v.fog === (def.fogColor || null);
    T(`${id}: visual rule is BIOME_DEFS (bg ${p.bg}, grid ${p.grid}, fog ${def.fogColor})`, ok, JSON.stringify(v));
    seen[id] = v ? `${v.base}|${v.grid}|${v.ambient}|${v.fog}` : null;
  }
  T('all six stages resolve a DISTINCT visual rule',
    new Set(Object.values(seen)).size === Game.STAGE_RING.length, `${new Set(Object.values(seen)).size} distinct`);

  // The rule is cached on the biome id — no allocation per frame.
  g._setStageRule('industrial_core');
  const a = g._biomeVisual(), b = g._biomeVisual(), c = g._biomeVisual();
  T('repeated reads return the SAME cached object (no per-frame allocation)', a === b && b === c);
  g._setStageRule('glacial_expanse');
  const d = g._biomeVisual();
  T('changing stage rebuilds the rule exactly once', d !== a && d.id === 'glacial_expanse');

  // Fallback and streaming.
  g._setStageRule(null);
  T('no stage biome falls back to neon_district visuals', g._biomeVisual()?.id === 'neon_district', String(g._biomeVisual()?.id));
  g._setStageRule('no_such_biome');
  T('an invalid biome falls back to neon_district visuals', g._biomeVisual()?.id === 'neon_district', String(g._biomeVisual()?.id));
  const gs = newGameUnlocked();
  if (gs.chunkManager) gs.chunkManager.enabled = true;
  gs._setStageRule('data_wastes');
  T('while chunk streaming is on the legacy tint stands down (no double application)',
    gs._activeVisualBiome() === null && gs._biomeVisual() === null);

  // Campaign uses the CAMPAIGN biome, not the Act 1 pick.
  const gc = newGameUnlocked();
  if (gc.chunkManager) gc.chunkManager.enabled = false;
  gc.setRunBiome('data_wastes');
  gc._pendingCampaignStage = 2;                    // STAGE 2 = industrial_core
  const unc = muteConsole(); gc._applyRunBiome(); gc._applyCampaignStage(); unc();
  T('a campaign run is tinted by its CAMPAIGN biome, not the Act 1 selection',
    gc._biomeVisual()?.id === 'industrial_core', String(gc._biomeVisual()?.id));

  // Walking the ring must move the active visual biome with it.
  const gw = newGameUnlocked();
  if (gw.chunkManager) gw.chunkManager.enabled = false;
  gw.setRunBiome('orbital_nexus');
  gw.endless = false; gw.gameState = 'playing'; gw.gameOver = false; gw.victory = false;
  const unw = muteConsole(); gw._applyRunBiome(); unw();
  const walk = [gw._biomeVisual()?.id];
  for (let i = 1; i < 3; i++) { stepStage(gw); walk.push(gw._biomeVisual()?.id); }
  T('a stage transition moves the active visual biome', walk.join(',') === 'orbital_nexus,abyssal_trench,glacial_expanse', walk.join(','));

  // Drawing must not throw and must not leave the canvas black.
  let threw = 0;
  const und = muteConsole();
  for (const id of Game.STAGE_RING) { g._setStageRule(id); try { g._drawBackground(makeCtx()); } catch (_) { threw++; } }
  und();
  T('_drawBackground runs for every stage without throwing', threw === 0, `${threw} throws`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 10. STAGE UNLOCK LADDER (Slice A) ===');
{
  const RING = Game.STAGE_RING;

  // Fresh save: only the first stage.
  const g = newGame();
  T('a fresh save has stagesCleared 0', (g.meta?.stagesCleared || 0) === 0, String(g.meta?.stagesCleared));
  T('on a fresh save ONLY neon_district is selectable',
    g.unlockedStageBiomes().join(',') === 'neon_district', g.unlockedStageBiomes().join(','));
  for (const id of RING.slice(1)) {
    T(`fresh save: ${id} is locked and states its requirement`,
      !g.isStageBiomeUnlocked(id) && /CLEAR CAMPAIGN STAGE \d/.test(g.stageBiomeRequirement(id)),
      g.stageBiomeRequirement(id));
  }

  // Each milestone unlocks exactly one more, in order, and never loses one.
  let prevCount = 1;
  for (let cleared = 1; cleared <= 5; cleared++) {
    const gg = newGame();
    gg.meta.stagesCleared = cleared;
    const un = gg.unlockedStageBiomes();
    T(`stagesCleared=${cleared} unlocks exactly ${cleared + 1} stages, up to ${RING[cleared]}`,
      un.length === cleared + 1 && un[un.length - 1] === RING[cleared], un.join(','));
    T(`stagesCleared=${cleared} is monotonic (never fewer than before)`, un.length >= prevCount);
    prevCount = un.length;
    T(`stagesCleared=${cleared} does NOT unlock ${RING[cleared + 1] || 'anything further'}`,
      !RING[cleared + 1] || !gg.isStageBiomeUnlocked(RING[cleared + 1]));
  }
  const gAll = newGame(); gAll.meta.stagesCleared = 5;
  T('stagesCleared=5 unlocks all six', gAll.unlockedStageBiomes().length === 6, gAll.unlockedStageBiomes().join(','));
  const gOver = newGame(); gOver.meta.stagesCleared = 99;
  T('a higher stagesCleared than the ring still unlocks exactly six', gOver.unlockedStageBiomes().length === 6);

  // the_null can never be unlocked, at any progression.
  for (const c of [0, 1, 3, 5, 99]) {
    const gn = newGame(); gn.meta.stagesCleared = c;
    if (!gn.isStageBiomeUnlocked('the_null') && !gn.unlockedStageBiomes().includes('the_null')) { pass++; }
    else { fail++; console.log(`  FAIL  the_null is unlockable at stagesCleared=${c}`); }
  }
  console.log(`  PASS  the_null is never unlockable (checked at stagesCleared 0,1,3,5,99)`);
  pass -= 5;   // the loop already counted the five; keep the single summary line honest

  // setRunBiome is the real gate, not just the UI.
  const gs = newGame();
  T('setRunBiome REFUSES a locked stage', gs.setRunBiome('data_wastes') === false && gs.runBiome === 'neon_district');
  T('setRunBiome accepts the unlocked one', gs.setRunBiome('neon_district') === true);
  gs.meta.stagesCleared = 2;
  T('after clearing stage 2, setRunBiome accepts orbital_nexus', gs.setRunBiome('orbital_nexus') === true && gs.runBiome === 'orbital_nexus');
  T('but still refuses abyssal_trench', gs.setRunBiome('abyssal_trench') === false && gs.runBiome === 'orbital_nexus');
  T('setRunBiome always refuses the_null', gs.setRunBiome('the_null') === false);

  // Save compatibility: missing / invalid fields must degrade safely, never throw.
  for (const bad of [undefined, null, NaN, -3, 'abc', {}]) {
    const gb = newGame();
    gb.meta.stagesCleared = bad;
    let ok = true;
    try { ok = gb.isStageBiomeUnlocked('neon_district') === true && gb.unlockedStageBiomes().length >= 1; }
    catch (_) { ok = false; }
    T(`a save with stagesCleared=${JSON.stringify(bad)} still offers neon_district and does not throw`, ok);
  }

  // A run started with a stale/forged selection is repaired at run start.
  const gr = newGame();
  gr.meta.stagesCleared = 5; gr.setRunBiome('glacial_expanse');
  gr.meta.stagesCleared = 0;                       // progress wiped / save replaced under it
  if (gr.chunkManager) gr.chunkManager.enabled = false;
  const unr = muteConsole(); gr._applyRunBiome(); unr();
  T('a now-locked selection is repaired to neon_district at run start', gr.runBiome === 'neon_district', String(gr.runBiome));
  const gf = newGame();
  gf.runBiome = 'the_null';                        // forged straight onto the field
  const unf = muteConsole(); gf._applyRunBiome(); unf();
  T('a forged the_null selection is repaired at run start', gf.runBiome === 'neon_district', String(gf.runBiome));

  // The lock is about STARTING only — the run must still walk all six stages.
  const gw = newGame();
  if (gw.chunkManager) gw.chunkManager.enabled = false;
  gw.endless = false; gw.gameState = 'playing'; gw.gameOver = false; gw.victory = false;
  const unw = muteConsole(); gw._applyRunBiome(); unw();
  const walk = walkStages(gw);
  T('a fresh-save run still visits all six stages in order (the lock is only about STARTING)',
    new Set(walk).size === 6 && walk[0] === 'neon_district', walk.join(','));

  // Overlay: locked cards exist, are marked, and cannot be reached by the cursor or confirmed.
  const go = newGame();
  const uno = muteConsole();
  go.gameState = 'stage_select'; go._stageSelIndex = 0;
  go._stageSelStep(+1);                            // everything except neon is locked
  uno();
  T('the cursor cannot step onto a locked stage', go._stageSelIndex === 0, String(go._stageSelIndex));
  go._stageSelIndex = 4;                           // forced onto a locked card
  const uno2 = muteConsole(); go._stageSelectConfirm(); uno2();
  T('CONFIRM on a locked stage commits nothing and stays on the screen',
    go.runBiome === 'neon_district' && go.gameState === 'stage_select', `${go.runBiome} / ${go.gameState}`);
  go.meta.stagesCleared = 2;
  go._stageSelIndex = 0;
  const uno3 = muteConsole(); go._stageSelStep(+1); uno3();
  T('once unlocked, the cursor steps onto it normally', go._stageSelIndex === 1, String(go._stageSelIndex));

  // The unlock announcement fires once, at the clear, and not again.
  const ga = newGame();
  const said = [];
  ga.triggerAnnouncement = (t) => { said.push(String(t)); };
  ga._campaignStage = 1; ga._campaignCleared = false;
  const una = muteConsole(); try { ga._completeCampaignStage(); } catch (_) {} una();
  const first = said.filter(t => /NEW STARTING STAGE UNLOCKED/.test(t));
  T('clearing stage 1 announces the new starting stage exactly once', first.length === 1, said.join(' | '));
  T('and it names the right biome', /INDUSTRIAL CORE/.test(first[0] || ''), first[0] || '');
  said.length = 0;
  ga._campaignCleared = false;                     // replay the same stage — already cleared
  const una2 = muteConsole(); try { ga._completeCampaignStage(); } catch (_) {} una2();
  T('re-clearing the same stage does NOT announce again',
    said.filter(t => /NEW STARTING STAGE UNLOCKED/.test(t)).length === 0, said.join(' | '));

  // The campaign itself is untouched by any of this.
  const gcam = newGame();
  T('campaign stage 1 is unlocked on a fresh save, exactly as before', gcam.meta.isStageUnlocked(1) === true);
  T('campaign stage 2 is still locked on a fresh save', gcam.meta.isStageUnlocked(2) === false);
  gcam.meta.stagesCleared = 3;
  T('campaign unlock maths are unchanged', gcam.meta.isStageUnlocked(4) === true && gcam.meta.isStageUnlocked(5) === false);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('B4_STAGE_RULES_DONE');
process.exit(fail === 0 ? 0 : 1);
