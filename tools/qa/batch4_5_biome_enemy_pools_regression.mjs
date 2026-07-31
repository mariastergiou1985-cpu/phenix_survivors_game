// BATCH 4.5 — MILESTONE 2 / Slice B: STAGE-SPECIFIC ENEMY SUB-POOLS
// ------------------------------------------------------------------------------------------------
// Roadmap MILESTONE 2 / Slice B, item 2: "διαφορετικά enemy sub-pools ανά stage".
//
// WHAT WAS BROKEN BEFORE THIS BATCH: every Act 1 stage and every campaign stage spawned the
// IDENTICAL roster. The only per-biome difference was hpMult/speedMult/regenRate (Batch 4.3/4.4) —
// a different picture behind the same enemies. There was no biome→enemy table anywhere.
//
// The fix is a POST-SELECTION REMAP (`pickBiomeEnemy`), plugged into `Game.spawnEnemy` through the
// single gate `Game._biomeSpawnType`. WaveDirector / EnemySpawner still choose the type, the block,
// the formation, the position, the batch size, the elite flag and the cap; only AFTER a type has
// been chosen is it swapped for this biome's equivalent OF THE SAME FAMILY.
//
// WHAT THIS FILE PINS
//   §1  the table is real: every id exists in the shipping enemy catalog (sprite + stats)
//   §2  every biome is materially different from every other biome
//   §3  selection is deterministic under a seeded RNG
//   §4  every malformed input degrades to the canonical pre-Slice-B behaviour, never a throw
//   §5  the LARGE deterministic distribution proof (≥5000 draws per biome per family)
//   §6  the REAL machine: a stage transition changes the observed pool, with no stale leak
//   §7  Endless / Chaos are byte-for-byte identity
//   §8  BATCH 4.4 IS UNCHANGED — boss mapping, ACT1_STAGE_SECONDS = 80, the boss advance gate
//   §9  spawn caps are untouched
//   §10 all six rotations spawn from their own stage's pool
//   §11 an old save with no Slice B state loads and spawns normally
//   §12 exactly one registry, frozen
//
// NO BALANCE NUMBER IS INVENTED HERE. Every expected weight share is READ from the shipping table
// at runtime, so retuning a weight cannot make this file lie — only deleting the difference can.
//
//   node tools/qa/batch4_5_biome_enemy_pools_regression.mjs
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const SPAWNER = await import(pathToFileURL(path.join(ROOT, 'js/game/EnemySpawner.js')).href);
u0();

const { CAMPAIGN_BIOME_ENEMY_POOLS, BIOME_POOL_EXCLUDED, SPAWN_FAMILY,
        pickBiomeEnemy, biomeEnemyPool } = SPAWNER;

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

const RING     = Game.STAGE_RING;
const BOSSES   = Game.STAGE_BOSSES;
const BIOMES   = Object.keys(CAMPAIGN_BIOME_ENEMY_POOLS);
const FAMILIES = ['fodder', 'swarm', 'fast', 'heavy', 'ranged'];
// One canonical INPUT type per family — the thing the wave director would have asked for.
const FAM_INPUT = { fodder: 'Glitch Drone', swarm: 'Rogue Punk', fast: 'Combat Hunter',
                    heavy: 'Heavy Mech',    ranged: 'Cyber Shooter' };
const STAGE_SECS = 80;                 // mirrors ACT1_STAGE_SECONDS; proved behaviourally in §8
const ALL_LIVE_T = 60;                 // a stage time at which every gated entry is live (max min=55)
const SB_FIELD = { titan:'titanBoss', annihilator:'annihilatorBoss', bloodfang:'bloodfangBoss',
                   cyberSerpent:'cyberSerpentBoss', cyberDragon:'cyberDragonBoss' };

// ─── seeded RNG (mulberry32) — the whole point is that the test's randomness is reproducible ───
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newGame() {
  const un = muteConsole();
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  un();
  return g;
}
// The Slice A ladder gates the ring; anything about STAGES needs it granted through the real save
// field first, or it would be measuring the lock instead of the pool.
function newRun(biome = 'neon_district') {
  const g = newGame();
  if (g.meta) g.meta.stagesCleared = RING.length - 1;
  const un = muteConsole();
  g.setRunBiome(biome);
  g._applyRunBiome();
  un();
  return g;
}
/** Advance the REAL stage machine by exactly ONE stage: survive → boss spawns → boss dies → advance. */
function stepStage(g, maxSecs = 400) {
  const un = muteConsole();
  const si0 = g._stageIndex;
  for (let i = 0; i < maxSecs * 60; i++) {
    g.timeAlive += 1 / 60;
    try { g._updateStageProgression(); } catch (_) {}
    if (g._activeStageBoss) {
      const id = g._activeStageBoss.id;
      if (id === 'mech') { for (const e of g.enemies) if (e && e.enemyType === 'Security Defector Mech') e.hp = 0; }
      else { const f = SB_FIELD[id]; if (f && g[f]) g[f].hp = 0; }
    }
    if (g._stageIndex !== si0) break;
  }
  un();
  return g._stageBiome;
}
/** Survive → boss spawns → boss dies, for the CURRENT stage. Needed for the LAST stage of the ring,
 *  which has nothing to advance to and therefore never moves _stageIndex. */
function clearCurrentStageBoss(g, maxSecs = 250) {
  const un = muteConsole();
  const biome = g._stageBiome;
  for (let i = 0; i < maxSecs * 60; i++) {
    if (g._stageBossCleared[biome]) break;
    g.timeAlive += 1 / 60;
    try { g._updateStageProgression(); } catch (_) {}
    if (g._activeStageBoss) {
      const id = g._activeStageBoss.id;
      if (id === 'mech') { for (const e of g.enemies) if (e && e.enemyType === 'Security Defector Mech') e.hp = 0; }
      else { const f = SB_FIELD[id]; if (f && g[f]) g[f].hp = 0; }
    }
  }
  un();
  return !!g._stageBossCleared[biome];
}
/** Drive the stage machine for `secs` WITHOUT killing anything. */
function drive(g, secs) {
  const un = muteConsole();
  for (let i = 0; i < Math.round(secs * 60); i++) {
    g.timeAlive += 1 / 60;
    try { g._updateStageProgression(); } catch (_) {}
  }
  un();
}
/** Spawn ONE enemy through the REAL production path (Game.spawnEnemy) and return its type. */
function spawnTypeThrough(g, type) {
  const un = muteConsole();
  g.enemies.length = 0;                                    // keep the cap from short-circuiting
  let out;
  try {
    g.spawnEnemy(type, { x: (g.player?.pos?.x ?? 0) + 900, y: (g.player?.pos?.y ?? 0) + 900 });
    out = g.enemies[0] ? g.enemies[0].enemyType : undefined;
  } catch (_) { out = undefined; }
  un();
  return out;
}
/** N real spawns through Game.spawnEnemy, cycling one input per family. → { id: count } */
function sampleRealSpawns(g, n) {
  const counts = Object.create(null);
  for (let i = 0; i < n; i++) {
    const t = FAM_INPUT[FAMILIES[i % FAMILIES.length]];
    const out = spawnTypeThrough(g, t);
    counts[String(out)] = (counts[String(out)] || 0) + 1;
  }
  return counts;
}
/** N draws through the REAL gate Game._biomeSpawnType, at the game's current stage time. */
function sampleGate(g, n) {
  const counts = Object.create(null);
  for (let i = 0; i < n; i++) {
    const t = FAM_INPUT[FAMILIES[i % FAMILIES.length]];
    const out = g._biomeSpawnType(t);
    counts[String(out)] = (counts[String(out)] || 0) + 1;
  }
  return counts;
}
const idsOf   = (b) => biomeEnemyPool(b).map(e => e.id);
const setOf   = (b) => new Set(idsOf(b));
const totalOf = (c) => Object.values(c).reduce((a, x) => a + x, 0);

console.log('\n═══ 1. THE TABLE IS REAL — CATALOG CROSS-CHECK ═══');
{
  // (1) six biomes, none empty.
  T('the pool table carries exactly 6 biomes', BIOMES.length === 6, BIOMES.join(','));
  T('the 6 pool biomes are exactly STAGE_RING', BIOMES.slice().sort().join(',') === RING.slice().sort().join(','),
    BIOMES.join(','));
  for (const b of BIOMES) T(`${b}: pool is a non-empty array`, Array.isArray(biomeEnemyPool(b)) && biomeEnemyPool(b).length > 0,
    String(biomeEnemyPool(b).length));

  // (2) every id resolves in the REAL catalog: a mapped sprite whose PNG exists on disk, AND a
  // dedicated _statsForType branch (not the `default:` fallback every unknown string lands on).
  const DEFAULT_STATS = Enemy.prototype._statsForType.call({}, '__not_a_real_enemy__', 0);
  const statsFor = (id) => Enemy.prototype._statsForType.call({}, id, 0);
  const sameStats = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const allIds = [...new Set(BIOMES.flatMap(idsOf))];
  T('the table references at least 15 distinct enemy ids', allIds.length >= 15, String(allIds.length));
  for (const id of allIds) {
    let e = null, err = null;
    const un = muteConsole();
    try { e = new Enemy(id, 0); } catch (ex) { err = ex.message; }
    un();
    T(`catalog: new Enemy('${id}', 0) constructs`, !!e && !err, String(err));
    if (!e) continue;
    T(`catalog: '${id}' has a mapped sprite`, !!e.sprite, 'no spriteMap entry');
    const src = e.sprite ? String(e.sprite.src || '').split('?')[0].replace(/^\.?\//, '') : '';
    T(`catalog: '${id}' sprite file exists on disk`, !!src && fs.existsSync(path.resolve(ROOT, src)), src);
    T(`catalog: '${id}' has a dedicated stat entry (not the default fallback)`,
      !sameStats(statsFor(id), DEFAULT_STATS), JSON.stringify(statsFor(id)));
    T(`catalog: '${id}' spawns with finite positive hp/speed`,
      Number.isFinite(e.hp) && e.hp > 0 && Number.isFinite(e.baseSpeed) && e.baseSpeed > 0,
      `${e.hp}/${e.baseSpeed}`);
    T(`catalog: '${id}' is not a boss-rank enemy`, e.isBoss() === false && !e.isMegaBoss);
    T(`catalog: '${id}' is declared in SPAWN_FAMILY`, typeof SPAWN_FAMILY[id] === 'string', String(SPAWN_FAMILY[id]));
  }

  // (3) nothing excluded may appear — cross-checked against BOTH registries.
  const bossEnemyTypes = new Set(['Security Defector Mech', 'Rogue AI Overlord']);
  const bossIds   = new Set(Object.values(BOSSES).map(d => d.id));
  const bossNames = new Set(Object.values(BOSSES).map(d => String(d.name).toUpperCase()));
  for (const b of BIOMES) {
    const ids = idsOf(b);
    T(`${b}: no BIOME_POOL_EXCLUDED id in the pool`, ids.every(i => !BIOME_POOL_EXCLUDED.has(i)),
      ids.filter(i => BIOME_POOL_EXCLUDED.has(i)).join(','));
    T(`${b}: no STAGE_BOSSES id/name in the pool`,
      ids.every(i => !bossIds.has(i) && !bossNames.has(String(i).toUpperCase())),
      ids.filter(i => bossIds.has(i) || bossNames.has(String(i).toUpperCase())).join(','));
    T(`${b}: no boss / mini-boss enemy type in the pool`, ids.every(i => !bossEnemyTypes.has(i)),
      ids.filter(i => bossEnemyTypes.has(i)).join(','));
    T(`${b}: no Chaos Mega Titan in the pool`, ids.every(i => !Enemy.CHAOS_TITANS.has(i)),
      ids.filter(i => Enemy.CHAOS_TITANS.has(i)).join(','));
    T(`${b}: no event-only Cybermote in the pool`, !ids.includes('Cybermote'));
    T(`${b}: no id is duplicated inside the pool`, new Set(ids).size === ids.length, ids.join(','));
    T(`${b}: every entry declares the family SPAWN_FAMILY gives it`,
      biomeEnemyPool(b).every(e => SPAWN_FAMILY[e.id] === e.family),
      biomeEnemyPool(b).filter(e => SPAWN_FAMILY[e.id] !== e.family).map(e => e.id).join(','));
    T(`${b}: every entry has a finite weight > 0`,
      biomeEnemyPool(b).every(e => Number.isFinite(e.weight) && e.weight > 0));
    T(`${b}: every entry has a sane [minStageTime, maxStageTime] window`,
      biomeEnemyPool(b).every(e => Number.isFinite(e.minStageTime) && e.minStageTime >= 0 &&
                                   e.minStageTime < STAGE_SECS && e.maxStageTime > e.minStageTime));
    T(`${b}: carries all five families`, FAMILIES.every(f => biomeEnemyPool(b).some(e => e.family === f)),
      FAMILIES.filter(f => !biomeEnemyPool(b).some(e => e.family === f)).join(','));
    T(`${b}: at least one entry is live at stage time 0`,
      biomeEnemyPool(b).some(e => e.minStageTime === 0));
  }
  // The Chaos-only roster must be excluded wholesale, not per-biome by luck.
  const CHAOS_ONLY = ['Neon Swarmer','Data Glitch Stalker','Plasma Juggernaut','Overclocked Bomber',
                      'EMP Hacker Drone','Cyber-Axe Executioner','Malware Spreader','Void Rift Summoner',
                      'Wireframe Net-Caster','Singularity Core Mech'];
  T('every Chaos-only enemy is in BIOME_POOL_EXCLUDED', CHAOS_ONLY.every(i => BIOME_POOL_EXCLUDED.has(i)),
    CHAOS_ONLY.filter(i => !BIOME_POOL_EXCLUDED.has(i)).join(','));
  T('no Chaos-only enemy appears in any pool', CHAOS_ONLY.every(i => !allIds.includes(i)),
    CHAOS_ONLY.filter(i => allIds.includes(i)).join(','));
  T('every Chaos Mega Titan is in BIOME_POOL_EXCLUDED',
    [...Enemy.CHAOS_TITANS].every(i => BIOME_POOL_EXCLUDED.has(i)));
  T('the campaign final boss is in BIOME_POOL_EXCLUDED', BIOME_POOL_EXCLUDED.has('Rogue AI Overlord'));
  T('the mini boss is in BIOME_POOL_EXCLUDED', BIOME_POOL_EXCLUDED.has('Security Defector Mech'));
  T('the event-only Cybermote is in BIOME_POOL_EXCLUDED', BIOME_POOL_EXCLUDED.has('Cybermote'));
  T('an excluded type is passed through untouched by pickBiomeEnemy',
    [...BIOME_POOL_EXCLUDED].every(t => BIOMES.every(b => pickBiomeEnemy(t, b, 40, mulberry32(1)) === t)));
}

console.log('\n═══ 2. EVERY BIOME HAS ITS OWN SIGNATURE ═══');
{
  // (5) weights are not all identical across the table.
  const allWeights = BIOMES.flatMap(b => biomeEnemyPool(b).map(e => e.weight));
  T('weights are not all identical across the table', new Set(allWeights).size > 1,
    [...new Set(allWeights)].join(','));
  T('at least 3 distinct weight values are used', new Set(allWeights).size >= 3,
    [...new Set(allWeights)].join(','));

  // (4) no two biomes may share an id set, and each biome is materially distinct.
  for (let i = 0; i < BIOMES.length; i++) {
    for (let j = i + 1; j < BIOMES.length; j++) {
      const a = idsOf(BIOMES[i]).slice().sort().join('|');
      const b = idsOf(BIOMES[j]).slice().sort().join('|');
      T(`${BIOMES[i]} vs ${BIOMES[j]}: id sets are NOT identical`, a !== b, a);
    }
  }
  // Weight-share vector per biome (share of total weight per id), for the L1 distance below.
  const shareVec = (b) => {
    const p = biomeEnemyPool(b), tot = p.reduce((s, e) => s + e.weight, 0);
    const m = Object.create(null);
    for (const e of p) m[e.id] = e.weight / tot;
    return m;
  };
  const l1 = (x, y) => {
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    let d = 0; for (const k of keys) d += Math.abs((x[k] || 0) - (y[k] || 0));
    return d;
  };
  for (let i = 0; i < BIOMES.length; i++) {
    for (let j = i + 1; j < BIOMES.length; j++) {
      const d = l1(shareVec(BIOMES[i]), shareVec(BIOMES[j]));
      T(`${BIOMES[i]} vs ${BIOMES[j]}: weight distributions differ materially (L1 ≥ 0.30)`,
        d >= 0.30, `L1=${d.toFixed(3)}`);
    }
  }
  // Each biome: an exclusive id, OR a clearly different weight distribution from every other biome.
  for (const b of BIOMES) {
    const others = BIOMES.filter(x => x !== b);
    const otherIds = new Set(others.flatMap(idsOf));
    const excl = idsOf(b).filter(i => !otherIds.has(i));
    const minL1 = Math.min(...others.map(o => l1(shareVec(b), shareVec(o))));
    T(`${b}: exclusive id OR a clearly different weight distribution`,
      excl.length > 0 || minL1 >= 0.30,
      `exclusive=[${excl.join(',')}] minL1=${minL1.toFixed(3)}`);
    console.log(`        ${b}: exclusive=[${excl.join(', ') || '—'}]  minL1=${minL1.toFixed(3)}  ` +
                `families=${FAMILIES.map(f => f[0] + biomeEnemyPool(b).filter(e => e.family === f).length).join(' ')}`);
  }
  // Per-family composition must differ too, or "different biome" would be cosmetic.
  const famSig = (b, f) => biomeEnemyPool(b).filter(e => e.family === f)
                            .map(e => `${e.id}:${e.weight}`).sort().join('|');
  for (const f of FAMILIES) {
    const sigs = BIOMES.map(b => famSig(b, f));
    T(`family '${f}': at least 4 of the 6 biomes have a distinct composition`,
      new Set(sigs).size >= 4, `${new Set(sigs).size} distinct`);
  }
  T('no two biomes share an identical FULL signature',
    new Set(BIOMES.map(b => FAMILIES.map(f => famSig(b, f)).join('#'))).size === 6);
}

console.log('\n═══ 3. DETERMINISM UNDER A SEEDED RNG ═══');
{
  const seq = (biome, seed, n = 2000, t = ALL_LIVE_T) => {
    const rnd = mulberry32(seed);
    const out = [];
    for (let i = 0; i < n; i++) out.push(pickBiomeEnemy(FAM_INPUT[FAMILIES[i % 5]], biome, t, rnd));
    return out;
  };
  for (const b of BIOMES) {
    const a1 = seq(b, 12345), a2 = seq(b, 12345);
    T(`${b}: 2000 draws are IDENTICAL for the same seed`, a1.join(',') === a2.join(','));
    T(`${b}: the sequence is 2000 long and free of undefined`,
      a1.length === 2000 && a1.every(x => typeof x === 'string' && x.length > 0));
    const bDiff = seq(b, 999);
    T(`${b}: a DIFFERENT seed produces a different sequence`, a1.join(',') !== bDiff.join(','));
    // …but the same alphabet, so "different" is randomness, not a different pool.
    T(`${b}: both seeds draw from the same pool alphabet`,
      [...new Set(bDiff)].every(x => setOf(b).has(x)));
  }
  // Cross-biome: the same seed on two biomes must not accidentally produce the same stream.
  T('the same seed on two different biomes gives different streams',
    seq('neon_district', 7).join(',') !== seq('data_wastes', 7).join(','));
  // The default rnd (Math.random) still works and never returns undefined.
  let bad = 0;
  for (let i = 0; i < 3000; i++) {
    const o = pickBiomeEnemy(FAM_INPUT[FAMILIES[i % 5]], BIOMES[i % 6], ALL_LIVE_T);
    if (typeof o !== 'string' || !o) bad++;
  }
  T('3000 draws on the DEFAULT rng never return undefined/empty', bad === 0, String(bad));
}

console.log('\n═══ 4. FALLBACKS AND MALFORMED INPUT ═══');
{
  // (7) unknown / null / undefined / '' / number / object biome → the canonical input, untouched.
  const CANON = 'Scrap Scavenger';
  const BAD_BIOMES = [undefined, null, '', 0, 1, NaN, {}, [], 'not_a_biome', 'the_null',
                      'constructor', 'toString', '__proto__', 'hasOwnProperty', true, false];
  for (const bb of BAD_BIOMES) {
    let out, threw = false;
    try { out = pickBiomeEnemy(CANON, bb, 40, mulberry32(3)); } catch (_) { threw = true; }
    T(`biome=${JSON.stringify(bb) ?? String(bb)} → no throw`, !threw);
    T(`biome=${JSON.stringify(bb) ?? String(bb)} → canonical input returned untouched`, out === CANON, String(out));
  }
  // (8) malformed type.
  for (const bt of [null, undefined, 0, 1, {}, [], '', NaN, true]) {
    for (const b of ['neon_district', null, 'nope']) {
      let out, threw = false;
      try { out = pickBiomeEnemy(bt, b, 40, mulberry32(5)); } catch (_) { threw = true; }
      T(`type=${JSON.stringify(bt) ?? String(bt)} biome=${b} → no throw`, !threw);
      T(`type=${JSON.stringify(bt) ?? String(bt)} biome=${b} → string or the untouched input`,
        (typeof out === 'string' && out.length > 0) || Object.is(out, bt), String(out));
      T(`type=${JSON.stringify(bt) ?? String(bt)} biome=${b} → never undefined unless the input was`,
        out !== undefined || bt === undefined);
    }
  }
  // (8) absurd stage times.
  for (const st of [NaN, -5, Infinity, -Infinity, 1e12, undefined, null, '40', {}]) {
    for (const b of BIOMES) {
      let out, threw = false;
      try { out = pickBiomeEnemy('Heavy Mech', b, st, mulberry32(9)); } catch (_) { threw = true; }
      T(`stageT=${String(st)} on ${b} → no throw and a real id`,
        !threw && typeof out === 'string' && out.length > 0, String(out));
      T(`stageT=${String(st)} on ${b} → the id comes from this biome (or is the input)`,
        setOf(b).has(out) || out === 'Heavy Mech', String(out));
    }
  }
  // (8) malformed RNG.
  const BAD_RNG = { 'NaN': () => NaN, '1.5': () => 1.5, '-1': () => -1, '0': () => 0,
                    '1': () => 1, 'undefined': () => undefined, 'string': () => 'x',
                    'huge': () => 1e9, 'alternating': (() => { let i = 0; return () => (i++ % 2 ? NaN : -3); })() };
  for (const [label, rnd] of Object.entries(BAD_RNG)) {
    for (const b of BIOMES) {
      let ok = true, threw = false;
      for (let i = 0; i < 200; i++) {
        let o;
        try { o = pickBiomeEnemy(FAM_INPUT[FAMILIES[i % 5]], b, ALL_LIVE_T, rnd); } catch (_) { threw = true; break; }
        if (typeof o !== 'string' || !o || !setOf(b).has(o)) { ok = false; break; }
      }
      T(`rnd→${label} on ${b}: 200 draws, no throw, always a real pool id`, !threw && ok);
    }
  }
  // A NON-CALLABLE rnd is out of contract (the signature is `rnd = Math.random`, and the default
  // only applies to `undefined`). Pinning the real behaviour: it throws, and the production gate is
  // what contains it — Game._biomeSpawnType wraps the call in try/catch and never passes an rnd at
  // all, so no shipping path can reach this. Proved below: the gate survives the same abuse.
  for (const notFn of [null, 0, 'x', {}]) {
    let threw = false;
    try { pickBiomeEnemy('Heavy Mech', 'neon_district', 40, notFn); } catch (_) { threw = true; }
    T(`rnd=${JSON.stringify(notFn) ?? String(notFn)} → out of contract: throws inside the pool layer, ` +
      `never reachable from the game (gate passes no rnd)`, threw === true);
  }
  T('rnd=undefined falls back to Math.random (the documented default)',
    typeof pickBiomeEnemy('Heavy Mech', 'neon_district', 40, undefined) === 'string');
  // Time gating actually gates: a late entry cannot appear at stage time 0.
  for (const b of BIOMES) {
    const late = biomeEnemyPool(b).filter(e => e.minStageTime > 0).map(e => e.id);
    if (!late.length) continue;
    const rnd = mulberry32(4242);
    const seen = new Set();
    for (let i = 0; i < 4000; i++) seen.add(pickBiomeEnemy(FAM_INPUT[FAMILIES[i % 5]], b, 0, rnd));
    T(`${b}: time-gated ids [${late.join(',')}] never appear at stage time 0`,
      late.every(id => !seen.has(id)), [...seen].filter(x => late.includes(x)).join(','));
    const rnd2 = mulberry32(4242);
    const seen2 = new Set();
    for (let i = 0; i < 4000; i++) seen2.add(pickBiomeEnemy(FAM_INPUT[FAMILIES[i % 5]], b, ALL_LIVE_T, rnd2));
    T(`${b}: time-gated ids DO appear at stage time ${ALL_LIVE_T}`, late.every(id => seen2.has(id)),
      late.filter(id => !seen2.has(id)).join(','));
  }
}

console.log('\n═══ 5. LARGE DETERMINISTIC DISTRIBUTION (≥5000 draws / biome / family) ═══');
{
  const N = 5000;
  for (const b of BIOMES) {
    console.log(`\n  ── ${b} ──`);
    const pool = biomeEnemyPool(b);
    let biomeUndefined = 0, biomeForeign = 0, biomeExcluded = 0, biomeTotal = 0;
    for (const fam of FAMILIES) {
      const famEntries = pool.filter(e => e.family === fam);
      const famTotal   = famEntries.reduce((s, e) => s + e.weight, 0);
      const rnd = mulberry32(0xC0FFEE ^ (fam.length * 7919) ^ b.length);
      const counts = Object.create(null);
      for (const e of famEntries) counts[e.id] = 0;
      for (let i = 0; i < N; i++) {
        const o = pickBiomeEnemy(FAM_INPUT[fam], b, ALL_LIVE_T, rnd);
        biomeTotal++;
        if (typeof o !== 'string' || !o) { biomeUndefined++; continue; }
        if (BIOME_POOL_EXCLUDED.has(o)) biomeExcluded++;
        if (!setOf(b).has(o)) { biomeForeign++; continue; }
        counts[o] = (counts[o] || 0) + 1;
      }
      // (a) only ids from THIS biome, and only from THIS family.
      const observedIds = Object.keys(counts).filter(k => counts[k] > 0);
      T(`${b}/${fam}: every draw is an id of this biome`, observedIds.every(i => setOf(b).has(i)),
        observedIds.filter(i => !setOf(b).has(i)).join(','));
      T(`${b}/${fam}: family preserved — every draw is a '${fam}'`,
        observedIds.every(i => SPAWN_FAMILY[i] === fam),
        observedIds.filter(i => SPAWN_FAMILY[i] !== fam).join(','));
      T(`${b}/${fam}: every family member was actually drawn`,
        famEntries.every(e => counts[e.id] > 0), famEntries.filter(e => !counts[e.id]).map(e => e.id).join(','));
      // (b) observed frequency within ±20% relative of the declared weight share.
      const rows = [];
      let worst = 0, worstId = '';
      for (const e of famEntries) {
        const expShare = e.weight / famTotal;
        const obsShare = (counts[e.id] || 0) / N;
        const rel = Math.abs(obsShare - expShare) / expShare;
        if (rel > worst) { worst = rel; worstId = e.id; }
        rows.push(`${e.id}=${counts[e.id]} (obs ${(obsShare * 100).toFixed(1)}% / exp ${(expShare * 100).toFixed(1)}%)`);
      }
      console.log(`     ${fam.padEnd(7)} n=${N}  ${rows.join('  ')}`);
      T(`${b}/${fam}: every observed share is within ±20% relative of its declared weight`,
        worst <= 0.20, `worst ${worstId} rel=${(worst * 100).toFixed(1)}%`);
      T(`${b}/${fam}: the ${N} draws are fully accounted for`,
        totalOf(counts) === N, `${totalOf(counts)}/${N}`);
    }
    // (c) + (17): no excluded id, no foreign id, no undefined, over the whole 25000-draw biome sample.
    T(`${b}: ${biomeTotal} draws produced ZERO undefined results`, biomeUndefined === 0, String(biomeUndefined));
    T(`${b}: ${biomeTotal} draws produced ZERO excluded ids`, biomeExcluded === 0, String(biomeExcluded));
    T(`${b}: ${biomeTotal} draws produced ZERO foreign ids`, biomeForeign === 0, String(biomeForeign));
    T(`${b}: the biome sample is ≥ 5000 draws`, biomeTotal >= 5000, String(biomeTotal));
  }
}

console.log('\n═══ 6. THE REAL MACHINE — A STAGE TRANSITION CHANGES THE POOL ═══');
{
  const g = newRun('neon_district');
  T('an Act 1 run has chunk streaming OFF (so the stage gate owns the biome)', !g.chunkManager?.enabled);
  T('stage 1 is the selected biome', g._stageBiome === 'neon_district', String(g._stageBiome));
  drive(g, ALL_LIVE_T);                                  // deep into stage 1, boss not yet armed
  T('no stage boss armed at t=60 (window is 80s)', g._activeStageBoss === null);
  const s1 = sampleRealSpawns(g, 1500);
  const s1g = sampleGate(g, 6000);
  const ids1 = Object.keys(s1);
  T('stage 1: every REAL spawn came from neon_district\'s pool',
    ids1.every(i => setOf('neon_district').has(i)), ids1.filter(i => !setOf('neon_district').has(i)).join(','));
  T('stage 1: no real spawn was undefined', !ids1.includes('undefined'));
  T('stage 1: more than one distinct id was produced', ids1.length > 1, ids1.join(','));
  console.log(`     stage 1 (neon_district) real spawns: ${ids1.map(i => `${i}=${s1[i]}`).join('  ')}`);

  // Advance ONE stage through the real boss-gated machine.
  const b2 = stepStage(g);
  T('the machine advanced to stage 2', g._stageIndex === 1, 'si=' + g._stageIndex);
  T('stage 2 is industrial_core', b2 === 'industrial_core', String(b2));
  const s2 = sampleRealSpawns(g, 1500);
  const s2g = sampleGate(g, 6000);
  const ids2 = Object.keys(s2);
  T('stage 2: every REAL spawn came from industrial_core\'s pool',
    ids2.every(i => setOf('industrial_core').has(i)), ids2.filter(i => !setOf('industrial_core').has(i)).join(','));
  T('stage 2: no real spawn was undefined', !ids2.includes('undefined'));
  console.log(`     stage 2 (industrial_core) real spawns: ${ids2.map(i => `${i}=${s2[i]}`).join('  ')}`);

  // (9) the distribution really changed.
  T('the observed spawn distribution CHANGED between stage 1 and stage 2',
    JSON.stringify(Object.keys(s1).sort()) !== JSON.stringify(Object.keys(s2).sort()) ||
    Object.keys(s1).some(k => Math.abs((s1[k] || 0) - (s2[k] || 0)) > 0.15 * 1500),
    `${ids1.join(',')} vs ${ids2.join(',')}`);
  T('the two stages do not produce the same id set', ids1.sort().join(',') !== ids2.sort().join(','));

  // (10) nothing exclusive to stage 1 leaks into stage 2.
  const excl1 = [...setOf('neon_district')].filter(i => !setOf('industrial_core').has(i));
  T('neon_district has ids industrial_core does not', excl1.length > 0, excl1.join(','));
  T('those ids were actually seen in stage 1 (gate sample)',
    excl1.some(i => (s1g[i] || 0) > 0), excl1.map(i => `${i}=${s1g[i] || 0}`).join(','));
  T('NONE of them appear in a 1500-spawn stage 2 sample',
    excl1.every(i => !(s2[i] > 0)), excl1.filter(i => s2[i] > 0).join(','));
  T('NONE of them appear in a 6000-draw stage 2 gate sample',
    excl1.every(i => !(s2g[i] > 0)), excl1.filter(i => s2g[i] > 0).join(','));
  // …and something exclusive to stage 2 DID arrive.
  const excl2 = [...setOf('industrial_core')].filter(i => !setOf('neon_district').has(i));
  T('industrial_core has ids neon_district does not', excl2.length > 0, excl2.join(','));
  T('at least one of them appears in the stage 2 gate sample',
    excl2.some(i => (s2g[i] || 0) > 0), excl2.map(i => `${i}=${s2g[i] || 0}`).join(','));
  T('and none of them appeared in the stage 1 gate sample',
    excl2.every(i => !(s1g[i] > 0)), excl2.filter(i => s1g[i] > 0).join(','));
}

console.log('\n═══ 7. ENDLESS AND CHAOS ARE UNTOUCHED ═══');
{
  const TYPES = ['Glitch Drone','Rogue Punk','Scrap Scavenger','Combat Hunter','Heavy Mech','Cyber Shooter',
                 'Volt Rat','Toxin Leech','Abyss Maw','Rift Eye','Neon Swarmer','Plasma Juggernaut',
                 'Security Defector Mech','Rogue AI Overlord','Cybermote'];
  // (11) Endless.
  const ge = newRun('neon_district');
  ge.endless = true;
  ge.timeAlive = 300; ge._stageStartT = 240;
  let bad = 0, first = '';
  for (let i = 0; i < 6000; i++) {
    const t = TYPES[i % TYPES.length];
    const o = ge._biomeSpawnType(t);
    if (o !== t) { bad++; if (!first) first = `${t}→${o}`; }
  }
  T('Endless: _biomeSpawnType is the identity over 6000 draws', bad === 0, `${bad} remaps, first ${first}`);
  T('Endless: a real spawn keeps the requested type',
    spawnTypeThrough(ge, 'Rogue Punk') === 'Rogue Punk');
  T('Endless: the stage biome is still set (so this is the MODE gate, not a missing biome)',
    !!ge._stageBiome, String(ge._stageBiome));

  // (12) Chaos.
  const gc = newRun('data_wastes');
  gc.endless = true; gc._chaosMode = true;
  gc.timeAlive = 300; gc._stageStartT = 240;
  let badC = 0, firstC = '';
  for (let i = 0; i < 6000; i++) {
    const t = TYPES[i % TYPES.length];
    const o = gc._biomeSpawnType(t);
    if (o !== t) { badC++; if (!firstC) firstC = `${t}→${o}`; }
  }
  T('Chaos: _biomeSpawnType is the identity over 6000 draws', badC === 0, `${badC} remaps, first ${firstC}`);
  T('Chaos: a real spawn keeps the requested type', spawnTypeThrough(gc, 'Neon Swarmer') === 'Neon Swarmer');

  // Chaos without endless, and streaming maps, are pass-throughs too.
  const gc2 = newRun('data_wastes'); gc2._chaosMode = true;
  T('Chaos alone (endless off) is still the identity',
    TYPES.every(t => gc2._biomeSpawnType(t) === t));
  const gs = newRun('abyssal_trench');
  if (gs.chunkManager) {
    gs.chunkManager.enabled = true;
    T('a streaming map passes through untouched (biome is per-position there)',
      TYPES.every(t => gs._biomeSpawnType(t) === t));
    gs.chunkManager.enabled = false;
  }
  const gn = newRun('abyssal_trench');
  gn._setStageRule(null);
  T('no _stageBiome → pass-through', TYPES.every(t => gn._biomeSpawnType(t) === t));
  // The gate never throws and never returns undefined, whatever it is handed.
  const gx = newRun('glacial_expanse');
  gx.timeAlive = 40; gx._stageStartT = 0;
  let gateThrew = false, gateBad = '';
  for (const t of [null, undefined, 0, 1, {}, [], '', NaN, true, 'not_an_enemy', 'Rogue AI Overlord']) {
    let o;
    try { o = gx._biomeSpawnType(t); } catch (_) { gateThrew = true; continue; }
    if (!(Object.is(o, t) || (typeof o === 'string' && o))) gateBad = String(t) + '→' + String(o);
  }
  T('the gate never throws on a hostile type', !gateThrew);
  T('the gate returns a real string or the untouched input for a hostile type', gateBad === '', gateBad);
}

console.log('\n═══ 8. BATCH 4.4 IS UNCHANGED ═══');
{
  // (13) the six triples, asserted explicitly BY VALUE.
  const EXPECT = {
    neon_district:   { id: 'mech',         reward: 'neon_defector_core' },
    industrial_core: { id: 'annihilator',  reward: 'annihilator_forge_plate' },
    orbital_nexus:   { id: 'titan',        reward: 'titan_orbital_gyro' },
    abyssal_trench:  { id: 'cyberSerpent', reward: 'serpent_ember_coil' },
    glacial_expanse: { id: 'cyberDragon',  reward: 'dragon_cryo_heart' },
    data_wastes:     { id: 'bloodfang',    reward: 'bloodfang_wastes_fang' },
  };
  for (const [biome, e] of Object.entries(EXPECT)) {
    T(`4.4 mapping: ${biome} → ${e.id} → ${e.reward}`,
      BOSSES[biome]?.id === e.id && BOSSES[biome]?.reward === e.reward,
      `${BOSSES[biome]?.id}/${BOSSES[biome]?.reward}`);
  }
  T('4.4 mapping: exactly 6 entries, in ring order',
    Object.keys(BOSSES).join(',') === RING.join(','), Object.keys(BOSSES).join(','));
  T('4.4 mapping: still frozen', Object.isFrozen(BOSSES));
  T('4.4 mapping: 6 distinct bosses and 6 distinct rewards',
    new Set(Object.values(BOSSES).map(d => d.id)).size === 6 &&
    new Set(Object.values(BOSSES).map(d => d.reward)).size === 6);

  // (14) ACT1_STAGE_SECONDS is still 80 — proved BEHAVIOURALLY, not by reading the constant.
  const g = newRun('neon_district');
  drive(g, STAGE_SECS - 1);                       // t ≈ 79
  T('no stage boss is armed at t≈79s', g._activeStageBoss === null, `t=${g.timeAlive.toFixed(2)}`);
  T('and the stage has not advanced at t≈79s', g._stageIndex === 0);
  drive(g, 2);                                    // t ≈ 81
  T('the stage boss IS armed by t≈81s', !!g._activeStageBoss, `t=${g.timeAlive.toFixed(2)}`);
  T('it is neon_district\'s boss', g._activeStageBoss?.id === 'mech', String(g._activeStageBoss?.id));
  // A tighter bracket: nothing arms one frame before the window, something arms one frame after.
  const gA = newRun('orbital_nexus');
  drive(gA, STAGE_SECS - 0.2);
  T('orbital_nexus: still no boss at t≈79.8s', gA._activeStageBoss === null, `t=${gA.timeAlive.toFixed(2)}`);
  drive(gA, 1.0);
  T('orbital_nexus: boss armed by t≈80.8s', !!gA._activeStageBoss, `t=${gA.timeAlive.toFixed(2)}`);
  T('so the stage window is 80s, not 12 minutes', gA.timeAlive < 90);

  // (15) the boss advance gate.
  const gB = newRun('neon_district');
  drive(gB, STAGE_SECS + 4);
  T('gate: the boss is up', !!gB._activeStageBoss);
  drive(gB, 300);
  T('gate: the stage does NOT advance while the boss lives (300 extra seconds)',
    gB._stageIndex === 0, 'si=' + gB._stageIndex);
  T('gate: the stage biome did not move', gB._stageBiome === 'neon_district');
  T('gate: the pool did not move either — spawns are still neon_district',
    Object.keys(sampleRealSpawns(gB, 300)).every(i => setOf('neon_district').has(i)));
  const un = muteConsole();
  for (const e of gB.enemies) if (e && e.enemyType === 'Security Defector Mech') e.hp = 0;
  un();
  drive(gB, 1);
  T('gate: the stage advances once the boss dies', gB._stageIndex === 1, 'si=' + gB._stageIndex);
  T('gate: and the biome rule moved with it', gB._stageBiome === 'industrial_core', String(gB._stageBiome));
  T('gate: the cleared flag is recorded', gB._stageBossCleared.neon_district === true);
  T('gate: the reward was paid', gB.meta.relics[BOSSES.neon_district.reward] === true);
}

console.log('\n═══ 9. SPAWN CAPS AND INTERVALS ARE UNCHANGED ═══');
{
  // Baseline recomputed from the SHIPPING formula. The mobile clamp is provably off here.
  T('the harness is not detected as mobile (so no mobile clamp distorts the baseline)',
    (globalThis.navigator?.maxTouchPoints || 0) === 0);
  const capBaseline = (minute, { endless = false, chaos = false } = {}) => {
    let cap;
    if (minute < 2)       cap = 38 + minute * 10;
    else if (minute < 5)  cap = 44 + (minute - 2) * 12;
    else if (minute < 10) cap = 80 + (minute - 5) * 14;
    else if (minute < 20) cap = 150 + (minute - 10) * 10;
    else                  cap = Math.min(420, 250 + (minute - 20) * 8);
    if (!endless && !chaos) cap = Math.min(520, Math.round(cap * 1.6));
    if (endless) cap = Math.min(900, Math.round(cap * 3.2) + 80);
    if (chaos)   cap = Math.min(800, Math.round(cap * 2.8) + 60);
    return cap;
  };
  const g = newRun('neon_district');
  const MINUTES = [0, 1, 2, 3, 4, 5, 7, 9, 10, 12, 15, 19, 20, 22, 25, 30, 45];
  for (const m of MINUTES) {
    T(`enemyCap(min ${m}) matches the shipping formula`,
      g.spawner.enemyCap(m, { endless: false, chaos: false }) === capBaseline(m),
      `${g.spawner.enemyCap(m, {})} vs ${capBaseline(m)}`);
    T(`enemyCap(min ${m}, endless) matches the shipping formula`,
      g.spawner.enemyCap(m, { endless: true }) === capBaseline(m, { endless: true }));
    T(`enemyCap(min ${m}, chaos) matches the shipping formula`,
      g.spawner.enemyCap(m, { chaos: true }) === capBaseline(m, { chaos: true }));
  }
  // The cap the GAME asks for, through the live method, at several real clock positions and on
  // every biome — the sub-pool must not touch the budget.
  for (const m of [0, 3, 8, 14, 25]) {
    for (const b of BIOMES) {
      const gg = newRun(b);
      gg.timeAlive = m * 60 + 5;
      T(`${b}: g.enemyCap() at minute ${m} equals the baseline`,
        gg.enemyCap() === capBaseline(m), `${gg.enemyCap()} vs ${capBaseline(m)}`);
    }
  }
  // Spawn interval is likewise untouched by the biome.
  const ivBaseline = (minute) => (Math.max(0.16, 0.5 - minute * 0.025) / 1.5);
  for (const m of [0, 5, 10, 20]) {
    T(`spawnInterval(min ${m}) matches the shipping formula`,
      Math.abs(g.spawner.spawnInterval(m, {}) - ivBaseline(m)) < 1e-9,
      `${g.spawner.spawnInterval(m, {})} vs ${ivBaseline(m)}`);
    const iv = BIOMES.map(b => { const gg = newRun(b); gg.timeAlive = m * 60 + 5; return gg.enemySpawnInterval(); });
    T(`spawnInterval at minute ${m} is identical across all six biomes`,
      new Set(iv.map(x => x.toFixed(9))).size === 1, iv.join(','));
  }
  // A cap-saturated field still refuses to spawn — the remap must not bypass the cap.
  const gs = newRun('neon_district');
  gs.timeAlive = 60;
  const un = muteConsole();
  gs.enemies.length = 0;
  for (let i = 0; i < gs.enemyCap(); i++) gs.enemies.push(new Enemy('Glitch Drone', 1));
  const n0 = gs.enemies.length;
  gs.spawnEnemy('Glitch Drone', { x: 900, y: 900 });
  un();
  T('a full field still refuses a spawn (the cap is not bypassed)', gs.enemies.length === n0,
    `${n0} → ${gs.enemies.length}`);
}

console.log('\n═══ 10. ALL SIX ROTATIONS SPAWN FROM THEIR OWN STAGE POOL ═══');
{
  for (const start of RING) {
    const g = newRun(start);
    const order = g._stageOrder();
    T(`${start}: the rotated ring starts here and visits all six`,
      order[0] === start && new Set(order).size === 6, order.join(','));
    const walked = [];
    let clean = true, foreign = '', sawLate = true, missingLate = '';
    for (let s = 0; s < 6; s++) {
      const biome = g._stageBiome;
      walked.push(biome);
      // Real spawns at the stage's natural (early) time.
      const real = Object.keys(sampleRealSpawns(g, 120));
      for (const i of real) if (!setOf(biome).has(i)) { clean = false; foreign = `${biome}:${i}`; }
      // The same stage, sampled deep enough that its time-gated entries are live too. The stage
      // window is only shifted for the duration of the sample and restored immediately.
      const keep = g._stageStartT;
      g._stageStartT = g.timeAlive - ALL_LIVE_T;
      const gate = sampleGate(g, 3000);
      g._stageStartT = keep;
      for (const i of Object.keys(gate)) if (!setOf(biome).has(i)) { clean = false; foreign = `${biome}:${i}`; }
      const late = biomeEnemyPool(biome).filter(e => e.minStageTime > 0).map(e => e.id);
      for (const id of late) if (!(gate[id] > 0)) { sawLate = false; missingLate = `${biome}:${id}`; }
      if (s < 5) stepStage(g);
    }
    T(`${start}: walked all six stages in rotated order`, walked.join(',') === order.join(','), walked.join(','));
    T(`${start}: EVERY stage's spawns came from that stage's own pool`, clean, foreign);
    T(`${start}: every stage's late entries became reachable inside their own stage`, sawLate, missingLate);
    T(`${start}: reached the last stage of the ring`, g._stageIndex === 5, 'si=' + g._stageIndex);
    T(`${start}: the five stages walked past were all boss-cleared`,
      order.slice(0, 5).every(b => g._stageBossCleared[b] === true),
      order.slice(0, 5).filter(b => !g._stageBossCleared[b]).join(','));
    // The final stage of the ring has nothing to advance to, so it is cleared in place.
    T(`${start}: the FINAL stage (${order[5]}) also arms and clears its own boss`,
      clearCurrentStageBoss(g) === true);
    T(`${start}: all six bosses were cleared on the way`,
      RING.every(b => g._stageBossCleared[b] === true), RING.filter(b => !g._stageBossCleared[b]).join(','));
  }
}

console.log('\n═══ 11. OLD-SAVE COMPATIBILITY (no Slice B state) ═══');
{
  const g = newGame();
  const un = muteConsole();
  g.meta.relics = { broken_halo: true };
  g.meta.bossKills = {};
  g.meta.stagesCleared = RING.length - 1;
  delete g._stageBossCleared; delete g._stageBossRewarded; delete g._stageBossSpawned;
  delete g._stageBiome; delete g._stageIndex; delete g._stageStartT;
  g.selectedCharacter = 'skeleton_warrior';
  g.reset();
  g.meta.stagesCleared = RING.length - 1;
  g.setRunBiome('glacial_expanse');
  g._applyRunBiome();
  un();
  T('an old save keeps the relics it already owned', g.meta.relics.broken_halo === true);
  T('an old save re-initialises the Slice B stage state on reset',
    !!g._stageBossCleared && !!g._stageBossRewarded && !!g._stageBossSpawned);
  T('an old save lands on a real stage biome', g._stageBiome === 'glacial_expanse', String(g._stageBiome));
  let threw = false, out = [];
  try { out = Object.keys(sampleRealSpawns(g, 600)); } catch (_) { threw = true; }
  T('an old save spawns without throwing', !threw);
  T('an old save spawns real (never undefined) enemies', out.length > 0 && !out.includes('undefined'), out.join(','));
  T('an old save spawns from its stage pool',
    out.every(i => setOf('glacial_expanse').has(i)), out.filter(i => !setOf('glacial_expanse').has(i)).join(','));
  // A save that never heard of the ring at all: runBiome garbage → the run still spawns.
  const g2 = newGame();
  const un2 = muteConsole();
  g2.runBiome = 'a_biome_that_never_existed';
  let threw2 = false, out2 = [];
  try { out2 = Object.keys(sampleRealSpawns(g2, 300)); } catch (_) { threw2 = true; }
  un2();
  T('a save with a garbage runBiome does not throw on spawn', !threw2);
  T('and still produces real enemy types', out2.length > 0 && !out2.includes('undefined'), out2.join(','));
  // An old save mid-run with no stage rule at all falls back to the canonical roster.
  const g3 = newRun('data_wastes');
  const un3 = muteConsole(); g3._setStageRule(null); un3();
  T('no stage rule → the canonical type is spawned unchanged',
    spawnTypeThrough(g3, 'Rogue Punk') === 'Rogue Punk');
}

console.log('\n═══ 12. EXACTLY ONE REGISTRY, FROZEN ═══');
{
  for (const b of BIOMES) {
    T(`${b}: biomeEnemyPool() returns the SAME array object as the table`,
      biomeEnemyPool(b) === CAMPAIGN_BIOME_ENEMY_POOLS[b]);
    T(`${b}: the pool array is frozen`, Object.isFrozen(CAMPAIGN_BIOME_ENEMY_POOLS[b]));
    T(`${b}: every entry object is frozen`, CAMPAIGN_BIOME_ENEMY_POOLS[b].every(e => Object.isFrozen(e)));
  }
  T('the pool table itself is frozen', Object.isFrozen(CAMPAIGN_BIOME_ENEMY_POOLS));
  T('BIOME_POOL_EXCLUDED is frozen', Object.isFrozen(BIOME_POOL_EXCLUDED));
  T('SPAWN_FAMILY is frozen', Object.isFrozen(SPAWN_FAMILY));
  T('BIOME_POOL_EXCLUDED is a Set', BIOME_POOL_EXCLUDED instanceof Set);
  T('biomeEnemyPool() returns an empty array for an unknown biome',
    Array.isArray(biomeEnemyPool('nope')) && biomeEnemyPool('nope').length === 0);
  T('biomeEnemyPool() returns an empty array for null/undefined/0/{}',
    [null, undefined, 0, {}].every(b => Array.isArray(biomeEnemyPool(b)) && biomeEnemyPool(b).length === 0));
  // A write attempt must not create a second, divergent registry.
  const before = JSON.stringify(CAMPAIGN_BIOME_ENEMY_POOLS);
  try { CAMPAIGN_BIOME_ENEMY_POOLS.neon_district = []; } catch (_) {}
  try { CAMPAIGN_BIOME_ENEMY_POOLS.new_biome = []; } catch (_) {}
  try { CAMPAIGN_BIOME_ENEMY_POOLS.neon_district.push({ id: 'Rogue AI Overlord', weight: 99, family: 'heavy' }); } catch (_) {}
  T('the table survives hostile writes unchanged', JSON.stringify(CAMPAIGN_BIOME_ENEMY_POOLS) === before);
  T('and biomeEnemyPool still points at that one table',
    BIOMES.every(b => biomeEnemyPool(b) === CAMPAIGN_BIOME_ENEMY_POOLS[b]));
  // The Slice B module is the only place a biome pool comes from: the Game gate must agree with it.
  const g = newRun('abyssal_trench');
  g.timeAlive = 40; g._stageStartT = 0;
  const viaGate = new Set();
  for (let i = 0; i < 3000; i++) viaGate.add(g._biomeSpawnType(FAM_INPUT[FAMILIES[i % 5]]));
  T('Game._biomeSpawnType draws only from biomeEnemyPool(abyssal_trench)',
    [...viaGate].every(i => setOf('abyssal_trench').has(i)),
    [...viaGate].filter(i => !setOf('abyssal_trench').has(i)).join(','));
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('B4_5_BIOME_ENEMY_POOLS_DONE');
process.exit(fail === 0 ? 0 : 1);
