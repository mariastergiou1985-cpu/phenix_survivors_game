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
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
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

// A representative non-boss trash type that exists in every mode.
const TRASH = 'Glitch Drone';

// Baseline: the SAME production spawn path on a game carrying no stage rule. Building a bare
// `new Enemy(TRASH, 5)` instead would compare against a different game minute than spawnEnemy uses
// (it takes this.currentMinute()), and the mismatch would look like a scaling bug that isn't one.
function baseline() {
  const g = newGame();
  if (g.chunkManager) g.chunkManager.enabled = false;
  g._setStageRule(null);
  const e = spawnThrough(g);
  return e ? { hp: e.hp, maxHp: e.maxHp, baseSpeed: e.baseSpeed, full: e._baseSpeedFull }
           : { hp: NaN, maxHp: NaN, baseSpeed: NaN, full: NaN };
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
    // A neutral hpMult must not touch HP at all — not even round it. Enemy HP is fractional at low
    // minutes (2.99), so rounding a 1.0 mult would silently change the value and hide a real bug.
    const hpM = (m.hpMult > 0 ? m.hpMult : 1);
    const expHp    = hpM === 1 ? B.hp : Math.max(1, Math.round(B.hp * hpM));
    const expSpeed = B.baseSpeed * (m.speedMult > 0 ? m.speedMult : 1);

    const g = newGame();
    if (g.chunkManager) g.chunkManager.enabled = false;   // Act 1 / campaign: streaming is OFF
    g._setStageRule(id);
    const e = spawnThrough(g);
    if (!e) { T(`${id}: enemy reached the roster`, false, 'spawnEnemy produced nothing'); continue; }

    T(`${id}: HP scaled by hpMult ${m.hpMult ?? 1}  (${B.hp} → ${e.hp}, expected ${expHp})`,
      e.hp === expHp && e.maxHp === e.hp, `hp=${e.hp} maxHp=${e.maxHp}`);
    T(`${id}: speed scaled by speedMult ${m.speedMult ?? 1}  (${B.baseSpeed.toFixed(1)} → ${e.baseSpeed.toFixed(1)})`,
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
    const g = newGame();
    if (g.chunkManager) g.chunkManager.enabled = false;
    g._setStageRule(id);
    const e = spawnThrough(g);
    if (e) measured[id] = { hp: e.hp, speed: +e.baseSpeed.toFixed(2) };
  }
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
  const un = muteConsole();
  for (const t of [0, 12 * 60 + 1, 24 * 60 + 1, 36 * 60 + 1, 48 * 60 + 1, 60 * 60 + 1]) {
    g.timeAlive = t;
    try { g._updateStageProgression(); } catch (_) {}
    seen.push({ t, biome: g._stageBiome, hp: g._stageHpMult, sp: g._stageSpeedMult });
  }
  un();
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

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('B4_STAGE_RULES_DONE');
process.exit(fail === 0 ? 0 : 1);
