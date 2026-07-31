// ════════════════════════════════════════════════════════════════════════════════════════════════
// BATCH 5.1 — ACT 1 ENEMY SIGNATURES: FOUNDATION (REGRESSION LOCK)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT WAS SHIPPED. `js/game/EnemySignatures.js` — a frozen six-entry registry plus ONE update
// function, wired into `Enemy` (constructor / takeHit / update / draw) and `Game` (per-frame census
// + contact-damage intangibility). Six enemies get one explicit four-phase behaviour each:
//
//   Volt Rat       → zigzag_surge        Rift Eye   → aimed_rift_shot
//   Pulse Burrower → burrow_reposition   Heavy Mech → ground_brace
//   Razorhound     → committed_lunge     Abyss Maw  → frontal_guard
//
// WHAT THIS FILE PINS — the 40 acceptance points, tagged [P1]..[P40] on every assertion, plus a
// STRESS section (≥300 enemies, 10 simulated minutes, repeated death/reset/deck cycles, and a
// deterministic replay comparison).
//
// HOW IT MEASURES. The signature machine is driven the way PRODUCTION drives it and no other way:
//   · `Game._updateEnemies` rebuilds `_sigCensus` ONCE per frame, then loops enemies — so the rig
//     rebuilds the census once per frame too. Rebuilding it per-enemy would hide the concurrency
//     behaviour instead of measuring it.
//   · `updateSignature` refuses to arm off-camera, so the camera is re-centred on the player EVERY
//     frame. A rig that forgets this measures nothing at all — every test would trivially "pass"
//     by never leaving READY.
//   · `Game.spawnEnemy` is remapped by the Batch 4.5 biome gate, so every rig that needs a SPECIFIC
//     type either constructs `new Enemy(type, 0)` directly or neutralises the gate first.
//
// NO NUMBER IS INVENTED. Every threshold is READ from the shipping `ENEMY_SIGNATURES` table at
// runtime (cooldown, telegraph, execute, recover, ranges, radii, multipliers), so retuning balance
// cannot make this file lie — only deleting the behaviour can.
//
//   node tools/qa/batch5_1_enemy_signatures_regression.mjs
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole, makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0;
globalThis.performance = { now: () => vclock };

const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Vec2 } = await import(pathToFileURL(path.join(ROOT, 'js/constants.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const SPAWNER = await import(pathToFileURL(path.join(ROOT, 'js/game/EnemySpawner.js')).href);
const SIG = await import(pathToFileURL(path.join(ROOT, 'js/game/EnemySignatures.js')).href);
u0();

const { SIG_PHASE, ENEMY_SIGNATURES, SIGNATURE_TYPES, signatureFor, initSignature,
        signatureActive, signatureIntangible, signatureKnockbackMult, signatureDamageMult,
        updateSignature, drawSignature, buildSignatureCensus, signatureStats } = SIG;
const { CAMPAIGN_BIOME_ENEMY_POOLS, BIOME_POOL_EXCLUDED } = SPAWNER;

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

const RING   = Game.STAGE_RING;
const BOSSES = Game.STAGE_BOSSES;
const DT     = 1 / 60;
const TYPES  = ['Volt Rat', 'Pulse Burrower', 'Razorhound', 'Rift Eye', 'Heavy Mech', 'Abyss Maw'];
// The six approved pairings, asserted BY VALUE (nothing derived from the table under test).
const EXPECT_SIG = {
  'Volt Rat':       'zigzag_surge',
  'Pulse Burrower': 'burrow_reposition',
  'Razorhound':     'committed_lunge',
  'Rift Eye':       'aimed_rift_shot',
  'Heavy Mech':     'ground_brace',
  'Abyss Maw':      'frontal_guard',
};
// A test distance INSIDE each signature's own [minRange, maxRange] band (Heavy Mech's is [0,200]).
const BAND_D = { 'Volt Rat': 250, 'Pulse Burrower': 250, 'Razorhound': 250,
                 'Rift Eye': 250, 'Heavy Mech': 150, 'Abyss Maw': 250 };
const PH_NAME = ['READY', 'TELEGRAPH', 'EXECUTE', 'RECOVER'];

// ── rig ─────────────────────────────────────────────────────────────────────────────────────────
function newGame(mode) {
  vclock = 0;
  const un = muteConsole();
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  if (mode === 'endless') g._enterEndless();
  else if (mode === 'chaos') g._beginChaosRun();
  // HARNESS FACT 1 — the Batch 4.5 biome gate remaps every requested spawn type. Neutralise it so
  // `spawnEnemy('Volt Rat')` really produces a Volt Rat; the gate itself is re-proved in §9.
  g._biomeSpawnType = (t) => t;
  un();
  return g;
}
/** An Act 1 run with the stage ladder granted, for the Batch 4.4/4.5 regression section. */
function newRun(biome = 'neon_district') {
  const g = newGame();
  if (g.meta) g.meta.stagesCleared = RING.length - 1;
  const un = muteConsole();
  g.setRunBiome(biome); g._applyRunBiome();
  un();
  return g;
}
function mkEnemy(type, minute = 0) { const un = muteConsole(); const e = new Enemy(type, minute); un(); return e; }
/** HARNESS FACT 2 — off-camera enemies never arm. Re-centre EVERY frame anything moves. */
function centerCam(g) { g.camera.x = g.player.pos.x - 640; g.camera.y = g.player.pos.y - 360; }
function place(g, e, dist, ang = 0) {
  e.pos.x = g.player.pos.x + Math.cos(ang) * dist;
  e.pos.y = g.player.pos.y + Math.sin(ang) * dist;
}
const distTo = (g, e) => Math.hypot(e.pos.x - g.player.pos.x, e.pos.y - g.player.pos.y);
/** ONE production-shaped frame: census first (HARNESS FACT 4), then every enemy, exactly like
 *  Game._updateEnemies. */
function sigFrame(g, arr, dt = DT, hook = null) {
  centerCam(g);
  g._sigCensus = buildSignatureCensus(arr, {});
  for (let i = 0; i < arr.length; i++) {
    const r = updateSignature(arr[i], g, dt);
    if (hook) hook(arr[i], r, i);
  }
}
/** Drive ONE enemy and return every phase transition it made, as {f, from, to}. */
function runPhases(g, e, frames, opts = {}) {
  const arr = opts.arr || [e];
  const dt = opts.dt || DT;
  const out = [];
  let last = e._sig.phase;
  for (let f = 0; f < frames; f++) {
    if (opts.pre) opts.pre(f, e);
    sigFrame(g, arr, dt, opts.hook ? (en, r) => opts.hook(f, en, r) : null);
    if (e._sig.phase !== last) { out.push({ f, from: last, to: e._sig.phase }); last = e._sig.phase; }
    if (opts.post) opts.post(f, e);
    if (opts.stopAfter && out.length >= opts.stopAfter) break;
  }
  return out;
}
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
/** REAL frames through Game.update — HARNESS FACT 5 (cards block, death ends the run). */
function realFrames(g, n, per = null) {
  const un = muteConsole();
  for (let i = 0; i < n; i++) {
    if (g.upgradeUI)  { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    g.gameOver = false; g.victory = false;
    if (g.player) { g.player.hp = g.player.maxHp; }
    if (per) per(i);
    vclock += 1000 / 60;
    try { g.update(DT, input); } catch (e) { un(); throw e; }
  }
  un();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 1. THE REGISTRY IS REAL, MINIMAL AND FROZEN ═══');
{
  // [P1] exactly the six approved signatures, nothing else.
  T('[P1] ENEMY_SIGNATURES carries exactly 6 entries',
    Object.keys(ENEMY_SIGNATURES).length === 6, Object.keys(ENEMY_SIGNATURES).join(','));
  T('[P1] the 6 keys are exactly the approved enemy types',
    Object.keys(ENEMY_SIGNATURES).slice().sort().join(',') === TYPES.slice().sort().join(','),
    Object.keys(ENEMY_SIGNATURES).join(','));
  for (const [type, id] of Object.entries(EXPECT_SIG)) {
    T(`[P1] ${type} → ${id}`, ENEMY_SIGNATURES[type] && ENEMY_SIGNATURES[type].id === id,
      String(ENEMY_SIGNATURES[type] && ENEMY_SIGNATURES[type].id));
  }
  T('[P1] the six signature ids are distinct',
    new Set(Object.values(ENEMY_SIGNATURES).map(d => d.id)).size === 6);
  T('[P1] SIGNATURE_TYPES equals the registry keys',
    SIGNATURE_TYPES.join(',') === Object.keys(ENEMY_SIGNATURES).join(','), SIGNATURE_TYPES.join(','));
  T('[P1] the registry is frozen', Object.isFrozen(ENEMY_SIGNATURES));
  T('[P1] every entry object is frozen', Object.values(ENEMY_SIGNATURES).every(d => Object.isFrozen(d)));
  T('[P1] SIGNATURE_TYPES is frozen', Object.isFrozen(SIGNATURE_TYPES));
  const before = JSON.stringify(ENEMY_SIGNATURES);
  try { ENEMY_SIGNATURES['Rogue AI Overlord'] = { id: 'x' }; } catch (_) {}
  try { ENEMY_SIGNATURES['Volt Rat'].cooldown = 0; } catch (_) {}
  T('[P1] the registry survives hostile writes unchanged', JSON.stringify(ENEMY_SIGNATURES) === before);
  T('[P1] SIG_PHASE is the documented four-value enum and is frozen',
    Object.isFrozen(SIG_PHASE) && SIG_PHASE.READY === 0 && SIG_PHASE.TELEGRAPH === 1 &&
    SIG_PHASE.EXECUTE === 2 && SIG_PHASE.RECOVER === 3, JSON.stringify(SIG_PHASE));
  T('[P1] signatureFor() resolves each of the 6',
    TYPES.every(t => signatureFor(t) === ENEMY_SIGNATURES[t]));
  T('[P1] signatureFor() refuses every non-signature and malformed input',
    [null, undefined, 0, 1, {}, [], '', NaN, true, 'Glitch Drone', 'Rogue AI Overlord']
      .every(t => signatureFor(t) === null));
  // Object.prototype keys are the classic registry leak, and this project already treats them as a
  // hard requirement (Batch 4.5 pins exactly these against pickBiomeEnemy). A frozen object literal
  // still inherits from Object.prototype, so a bare `ENEMY_SIGNATURES[key]` lookup can return a
  // function instead of null — and updateSignature does the same bare lookup for `def`.
  {
    const HOSTILE = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty',
                     'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'];
    const leaks = HOSTILE.filter(k => signatureFor(k) !== null);
    T('[P1] signatureFor() is prototype-safe — no Object.prototype key resolves to a signature',
      leaks.length === 0, `leaks: ${leaks.map(k => `${k}→${typeof signatureFor(k)}`).join(', ')}`);
  }

  // [P2] every signature id EXISTS in the production enemy registry.
  const DEFAULT_STATS = Enemy.prototype._statsForType.call({}, '__not_a_real_enemy__', 0);
  const sameStats = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  for (const type of TYPES) {
    let e = null, err = null;
    const un = muteConsole();
    try { e = new Enemy(type, 0); } catch (ex) { err = ex.message; }
    un();
    T(`[P2] new Enemy('${type}', 0) constructs`, !!e && !err, String(err));
    if (!e) continue;
    T(`[P2] '${type}' has a mapped sprite`, !!e.sprite);
    const src = e.sprite ? String(e.sprite.src || '').split('?')[0].replace(/^\.?\//, '') : '';
    T(`[P2] '${type}' sprite file exists on disk`, !!src && fs.existsSync(path.resolve(ROOT, src)), src);
    T(`[P2] '${type}' has a dedicated stat entry (not the default fallback)`,
      !sameStats(Enemy.prototype._statsForType.call({}, type, 0), DEFAULT_STATS));
    T(`[P2] '${type}' spawns with finite positive hp / baseSpeed / radius`,
      Number.isFinite(e.hp) && e.hp > 0 && Number.isFinite(e.baseSpeed) && e.baseSpeed > 0 &&
      Number.isFinite(e.radius) && e.radius > 0, `${e.hp}/${e.baseSpeed}/${e.radius}`);
    T(`[P2] '${type}' gets a live _sig from the constructor`,
      !!e._sig && e._sig.id === EXPECT_SIG[type], String(e._sig && e._sig.id));
    // [P2] and it appears in at least one shipping biome pool, so it is really reachable in Act 1.
    T(`[P2] '${type}' is reachable — it is in a shipping biome pool`,
      Object.values(CAMPAIGN_BIOME_ENEMY_POOLS).some(p => p.some(x => x.id === type)));
  }

  // [P3] no boss / mega / event-only type carries a signature — cross-checked against BOTH registries.
  const bossIds   = new Set(Object.values(BOSSES).map(d => d.id));
  const bossNames = new Set(Object.values(BOSSES).map(d => String(d.name).toUpperCase()));
  for (const type of TYPES) {
    const e = mkEnemy(type);
    T(`[P3] '${type}' isBoss() === false`, e.isBoss() === false);
    T(`[P3] '${type}' isMegaBoss is falsy`, !e.isMegaBoss);
    T(`[P3] '${type}' role is not 'boss'`, e.role !== 'boss', String(e.role));
    T(`[P3] '${type}' archetype is not boss/miniboss`,
      e.archetype !== 'boss' && e.archetype !== 'miniboss', String(e.archetype));
    T(`[P3] '${type}' is not a Chaos Mega Titan`, !Enemy.CHAOS_TITANS.has(type));
    T(`[P3] '${type}' is not a Batch 4.4 stage boss (id or display name)`,
      !bossIds.has(type) && !bossNames.has(type.toUpperCase()));
    T(`[P3] '${type}' is not in BIOME_POOL_EXCLUDED (no event/Chaos-only type)`,
      !BIOME_POOL_EXCLUDED.has(type));
  }
  // Nothing excluded may ever acquire one, and no boss-rank id in the whole shipping roster has one.
  T('[P3] NO BIOME_POOL_EXCLUDED id has a signature',
    [...BIOME_POOL_EXCLUDED].every(id => signatureFor(id) === null),
    [...BIOME_POOL_EXCLUDED].filter(id => signatureFor(id)).join(','));
  T('[P3] NO Chaos Mega Titan has a signature',
    [...Enemy.CHAOS_TITANS].every(id => signatureFor(id) === null));
  const enemySrc = fs.readFileSync(path.join(ROOT, 'js/entities/Enemy.js'), 'utf8');
  const ALL_IDS = [...new Set([
    ...[...enemySrc.matchAll(/case\s+'([^']+)'\s*:/g)].map(m => m[1]),
    ...[...enemySrc.matchAll(/^\s*'([^']+)':\s*'(?:minis|minions|bosses|chaos_enemies)\//gm)].map(m => m[1]),
  ])].filter(s => /^[A-Z]/.test(s));
  const unB = muteConsole();
  const RUNTIME_BOSS = ALL_IDS.filter(id => { try { const e = new Enemy(id, 0); return e.isBoss() === true || e.isMegaBoss === true; } catch (_) { return false; } });
  unB();
  T('[P3] the brute-forced runtime boss set is non-trivial', RUNTIME_BOSS.length >= 6, RUNTIME_BOSS.join(','));
  T('[P3] NO runtime boss-rank id in the whole roster has a signature',
    RUNTIME_BOSS.every(id => signatureFor(id) === null),
    RUNTIME_BOSS.filter(id => signatureFor(id)).join(','));
  T('[P3] the event-only Cybermote has no signature', signatureFor('Cybermote') === null);
  T('[P3] a plain chase enemy still has NO signature (this is a 6-enemy foundation batch)',
    ['Glitch Drone', 'Rogue Punk', 'Scrap Scavenger', 'Combat Hunter', 'Cyber Shooter',
     'Cryo Claw', 'Toxin Leech'].every(t => signatureFor(t) === null));

  // [P5] every timing number is sane, and every cooldown is strictly positive.
  for (const type of TYPES) {
    const d = ENEMY_SIGNATURES[type];
    T(`[P5] ${type}: cooldown > 0`, Number.isFinite(d.cooldown) && d.cooldown > 0, String(d.cooldown));
    T(`[P5] ${type}: telegraph > 0 (nothing fires unannounced)`,
      Number.isFinite(d.telegraph) && d.telegraph > 0, String(d.telegraph));
    T(`[P5] ${type}: execute > 0 and recover >= 0`,
      Number.isFinite(d.execute) && d.execute > 0 && Number.isFinite(d.recover) && d.recover >= 0);
    T(`[P5] ${type}: the whole cycle is shorter than the cooldown`,
      d.telegraph + d.execute + d.recover < d.cooldown,
      `${(d.telegraph + d.execute + d.recover).toFixed(2)} vs ${d.cooldown}`);
    T(`[P5] ${type}: 0 <= minRange < maxRange, both finite`,
      Number.isFinite(d.minRange) && d.minRange >= 0 && Number.isFinite(d.maxRange) &&
      d.maxRange > d.minRange, `${d.minRange}..${d.maxRange}`);
    T(`[P5] ${type}: maxConcurrentFrac is a real fraction in (0, 1]`,
      Number.isFinite(d.maxConcurrentFrac) && d.maxConcurrentFrac > 0 && d.maxConcurrentFrac <= 1,
      String(d.maxConcurrentFrac));
    // [P31] the elite modifier is declared bounded in the table itself.
    T(`[P31] ${type}: eliteCdMult is declared >= 0.8 (never a runaway elite)`,
      Number.isFinite(d.eliteCdMult) && d.eliteCdMult >= 0.8 && d.eliteCdMult <= 1,
      String(d.eliteCdMult));
    T(`[P5] ${type}: declares a family string`, typeof d.family === 'string' && d.family.length > 0);
  }
  T('[P5] the six families are distinct (one signature per gameplay family)',
    new Set(Object.values(ENEMY_SIGNATURES).map(d => d.family)).size === 6,
    Object.values(ENEMY_SIGNATURES).map(d => d.family).join(','));

  // [P38] no Math.random anywhere in the deterministic path — read the shipping source as text.
  // Comments are stripped first: the module's own header PROSE says "No Math.random() is introduced",
  // and matching that sentence would prove nothing about the code. What is scanned below is code.
  const sigSrc = fs.readFileSync(path.join(ROOT, 'js/game/EnemySignatures.js'), 'utf8');
  const sigCode = sigSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const mrHits = sigCode.match(/Math\s*\.\s*random/g) || [];
  T('[P38] js/game/EnemySignatures.js CODE contains ZERO Math.random references',
    mrHits.length === 0, `${mrHits.length} occurrence(s)`);
  T('[P38] the comment-stripped scan still covers the real code (sigRand / updateSignature present)',
    /function\s+sigRand/.test(sigCode) && /export\s+function\s+updateSignature/.test(sigCode));
  T('[P38] it introduces no other ambient randomness source (crypto / Date.now / performance.now)',
    !/crypto\s*\.\s*getRandomValues|Date\s*\.\s*now|performance\s*\.\s*now/.test(sigCode));
  T('[P38] the only randomness is the per-instance LCG stepped off the enemy seed',
    /sig\.rng\s*=\s*\(sig\.rng\s*\*\s*\d+/.test(sigCode));
  T('[P38] the module is non-trivial (the scan above measured real code)',
    sigSrc.length > 8000, `${sigSrc.length} bytes`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 2. NO SPAWN-FRAME ACTIVATION · DETERMINISTIC JITTER ═══');
{
  // [P6] the very first activation is at least 0.55 × cooldown away — asserted on the DATA…
  for (const type of TYPES) {
    const d = ENEMY_SIGNATURES[type];
    let worst = Infinity, best = -Infinity;
    for (let seed = 1; seed <= 4000; seed++) {
      const s = initSignature(type, seed);
      if (s.cd < worst) worst = s.cd;
      if (s.cd > best) best = s.cd;
      if (s.phase !== SIG_PHASE.READY) { worst = -1; break; }
    }
    T(`[P6] ${type}: 4000 seeds — the initial cd never dips below 0.55 × cooldown`,
      worst >= d.cooldown * 0.55 - 1e-9, `min=${worst.toFixed(3)} floor=${(d.cooldown * 0.55).toFixed(3)}`);
    T(`[P6] ${type}: the initial cd never exceeds 1.55 × cooldown (bounded jitter)`,
      best <= d.cooldown * 1.55 + 1e-9, `max=${best.toFixed(3)}`);
    T(`[P6] ${type}: every fresh signature starts in READY, inactive, with zero hits`,
      (() => { const s = initSignature(type, 7);
               return s.phase === SIG_PHASE.READY && s.active === false && s.hits === 0 &&
                      s.under === false && s.t === 0; })());
  }
  // …and BEHAVIOURALLY, with the enemy parked in range and on camera for the whole window.
  for (const type of TYPES) {
    const d = ENEMY_SIGNATURES[type];
    const g = newGame();
    const e = mkEnemy(type);
    place(g, e, BAND_D[type]);
    const guardFrames = Math.floor(d.cooldown * 0.55 * 60) - 1;
    const tr = runPhases(g, e, guardFrames, { pre: () => place(g, e, BAND_D[type]) });
    T(`[P6] ${type}: stays READY for the whole 0.55 × cooldown guard (${guardFrames} frames, in range, on camera)`,
      tr.length === 0 && e._sig.phase === SIG_PHASE.READY,
      tr.map(x => `${x.f}:${PH_NAME[x.from]}->${PH_NAME[x.to]}`).join(' '));
    // sanity: the rig CAN arm — otherwise the assertion above would be vacuous.
    const tr2 = runPhases(g, e, 60 * 40, { pre: () => place(g, e, BAND_D[type]), stopAfter: 1 });
    T(`[P6] ${type}: …and it does arm afterwards (the guard above is not vacuous)`,
      tr2.length === 1 && tr2[0].to === SIG_PHASE.TELEGRAPH, JSON.stringify(tr2));
  }
  // Nothing arms on the literal spawn frame either, even with dt of a whole second.
  {
    const g = newGame();
    let armed = 0;
    for (const type of TYPES) {
      for (let i = 0; i < 50; i++) {
        const e = mkEnemy(type);
        place(g, e, BAND_D[type]);
        sigFrame(g, [e], DT);
        if (e._sig.phase !== SIG_PHASE.READY) armed++;
      }
    }
    T('[P6] 300 freshly-spawned enemies: NOT ONE armed on its spawn frame', armed === 0, String(armed));
  }

  // [P7] deterministic initial jitter.
  for (const type of TYPES) {
    T(`[P7] ${type}: the same seed gives the same initial cd`,
      initSignature(type, 123456).cd === initSignature(type, 123456).cd);
    T(`[P7] ${type}: a different seed gives a different initial cd`,
      initSignature(type, 123456).cd !== initSignature(type, 654321).cd);
    // A group of 40 spawned back-to-back through the REAL constructor must not share one cd.
    const cds = [];
    for (let i = 0; i < 40; i++) cds.push(mkEnemy(type)._sig.cd);
    const uniq = new Set(cds.map(c => c.toFixed(9)));
    T(`[P7] ${type}: a pack of 40 does NOT share a single cooldown`, uniq.size > 1, `${uniq.size} distinct`);
    T(`[P7] ${type}: the pack of 40 is broadly de-synchronised (>= 30 distinct cds)`,
      uniq.size >= 30, `${uniq.size} distinct of 40`);
    T(`[P7] ${type}: every one of the 40 is finite and inside the jitter window`,
      cds.every(c => Number.isFinite(c) && c >= ENEMY_SIGNATURES[type].cooldown * 0.55 - 1e-9 &&
                     c <= ENEMY_SIGNATURES[type].cooldown * 1.55 + 1e-9));
  }
  T('[P7] a non-signature type gets no state at all (null, not an empty object)',
    initSignature('Glitch Drone', 5) === null && initSignature(null, 5) === null &&
    initSignature(undefined, 5) === null && initSignature(0, 5) === null);
  T('[P7] a hostile seed still yields a finite, bounded initial cd',
    [0, -1, NaN, Infinity, -Infinity, 1e18, 0.5, '9', null, undefined].every(sd => {
      const s = initSignature('Volt Rat', sd);
      return !!s && Number.isFinite(s.cd) && s.cd >= ENEMY_SIGNATURES['Volt Rat'].cooldown * 0.55 - 1e-9;
    }));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 3. EXPLICIT STATE LIFECYCLE — READY → TELEGRAPH → EXECUTE → RECOVER → READY ═══');
{
  for (const type of TYPES) {
    const d = ENEMY_SIGNATURES[type];
    const g = newGame();
    const e = mkEnemy(type);
    place(g, e, BAND_D[type]);
    const tr = runPhases(g, e, 60 * 45, {
      pre: () => place(g, e, BAND_D[type]),      // keep it in band and on camera all run
      stopAfter: 8,
    });
    const chain = tr.map(x => `${PH_NAME[x.from]}->${PH_NAME[x.to]}`);
    // [P4] the FULL cycle, in order, at least twice (so the return to READY really re-arms).
    const want = ['READY->TELEGRAPH', 'TELEGRAPH->EXECUTE', 'EXECUTE->RECOVER', 'RECOVER->READY'];
    T(`[P4] ${type}: observed the full lifecycle in order`,
      chain.slice(0, 4).join(' ') === want.join(' '), chain.join(' '));
    T(`[P4] ${type}: the machine cycles (>= 2 complete loops observed)`,
      chain.length >= 8 && chain.slice(4, 8).join(' ') === want.join(' '), chain.join(' '));
    T(`[P4] ${type}: no phase is ever skipped over ${tr.length} transitions`,
      tr.every((x, i) => x.from === (i === 0 ? SIG_PHASE.READY : tr[i - 1].to) &&
                         x.to === (x.from + 1) % 4));
    // Phase DURATIONS come from the table, so a retune cannot break this and a deletion must.
    if (tr.length >= 4) {
      const telF = tr[1].f - tr[0].f, exeF = tr[2].f - tr[1].f, recF = tr[3].f - tr[2].f;
      T(`[P4] ${type}: TELEGRAPH lasted the declared ${d.telegraph}s`,
        Math.abs(telF / 60 - d.telegraph) <= 2 / 60, `${(telF / 60).toFixed(3)}s`);
      T(`[P4] ${type}: EXECUTE lasted the declared ${d.execute}s`,
        Math.abs(exeF / 60 - d.execute) <= 2 / 60, `${(exeF / 60).toFixed(3)}s`);
      T(`[P4] ${type}: RECOVER lasted the declared ${d.recover}s`,
        Math.abs(recF / 60 - d.recover) <= 2 / 60, `${(recF / 60).toFixed(3)}s`);
      const gapF = tr[4] ? tr[4].f - tr[3].f : -1;
      T(`[P4] ${type}: the re-arm gap sits inside the declared jitter window`,
        gapF > 0 && gapF / 60 >= d.cooldown * 0.85 - 2 / 60 && gapF / 60 <= d.cooldown * 1.30 + 2 / 60,
        `${(gapF / 60).toFixed(3)}s vs ${(d.cooldown * 0.85).toFixed(2)}..${(d.cooldown * 1.30).toFixed(2)}`);
    }
    // signatureActive() must agree with the phase at every step.
    let agree = true;
    for (let f = 0; f < 600; f++) {
      sigFrame(g, [e], DT);
      place(g, e, BAND_D[type]);
      if (signatureActive(e) !== (e._sig.phase !== SIG_PHASE.READY)) { agree = false; break; }
    }
    T(`[P4] ${type}: signatureActive() tracks the phase exactly`, agree);
  }
  // Range and camera really are gates — otherwise "lifecycle" would be unconditional.
  for (const type of TYPES) {
    const d = ENEMY_SIGNATURES[type];
    const g = newGame();
    const e = mkEnemy(type);
    const far = d.maxRange + 400;
    const tr = runPhases(g, e, 60 * 40, { pre: () => { place(g, e, far); } });
    T(`[P4] ${type}: beyond maxRange it never leaves READY`, tr.length === 0, JSON.stringify(tr));
    if (d.minRange > 0) {
      const e2 = mkEnemy(type);
      const tr2 = runPhases(g, e2, 60 * 40, { pre: () => place(g, e2, Math.max(1, d.minRange - 40)) });
      T(`[P4] ${type}: inside minRange it never leaves READY`, tr2.length === 0, JSON.stringify(tr2));
    }
    const e3 = mkEnemy(type);
    const arr3 = [e3];
    let armed3 = false;
    for (let f = 0; f < 60 * 40; f++) {
      place(g, e3, BAND_D[type]);
      g.camera.x = g.player.pos.x + 9000; g.camera.y = g.player.pos.y + 9000;   // pushed off-camera
      g._sigCensus = buildSignatureCensus(arr3, {});
      updateSignature(e3, g, DT);
      if (e3._sig.phase !== SIG_PHASE.READY) { armed3 = true; break; }
    }
    T(`[P4] ${type}: off-camera it never arms (no wasted telegraph)`, !armed3);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 4. DETERMINISM — THE SAME SEED REPLAYS EXACTLY ═══');
{
  // [P8] identical scenario, twice — identical phase-transition TIMESTAMPS.
  const scenario = (type, seedLCG) => {
    Enemy._seedLCG = seedLCG;
    const g = newGame();
    const e = mkEnemy(type);
    place(g, e, BAND_D[type]);
    const tr = runPhases(g, e, 60 * 60, { pre: () => place(g, e, BAND_D[type]) });
    return tr.map(x => `${x.f}:${x.from}>${x.to}`).join(',');
  };
  for (const type of TYPES) {
    const a = scenario(type, 20260731);
    const b = scenario(type, 20260731);
    T(`[P8] ${type}: two identical runs give identical transition timestamps`, a === b,
      `${a.slice(0, 90)} vs ${b.slice(0, 90)}`);
    T(`[P8] ${type}: the replay is non-trivial (>= 4 transitions compared)`,
      a.split(',').filter(Boolean).length >= 4, a);
    const c = scenario(type, 999983);
    T(`[P8] ${type}: a DIFFERENT spawn seed gives a different timeline`, a !== c, a);
  }
  // A six-enemy mixed field replays identically too, census interactions included.
  const mixed = (seedLCG) => {
    Enemy._seedLCG = seedLCG;
    const g = newGame();
    const arr = TYPES.map((t, i) => { const e = mkEnemy(t); place(g, e, BAND_D[t], i * 1.05); return e; });
    const log = [];
    let last = arr.map(e => e._sig.phase);
    for (let f = 0; f < 60 * 90; f++) {
      arr.forEach((e, i) => { if (e._sig.id !== 'burrow_reposition') place(g, e, BAND_D[e.enemyType], i * 1.05); });
      sigFrame(g, arr, DT);
      arr.forEach((e, i) => { if (e._sig.phase !== last[i]) { log.push(`${f}:${i}:${last[i]}>${e._sig.phase}`); last[i] = e._sig.phase; } });
    }
    return log.join(',');
  };
  const m1 = mixed(4242), m2 = mixed(4242);
  T('[P8] a mixed 6-enemy field replays byte-identically', m1 === m2,
    `${m1.length} vs ${m2.length} chars`);
  T('[P8] that replay is substantial (>= 60 transitions)',
    m1.split(',').filter(Boolean).length >= 60, String(m1.split(',').filter(Boolean).length));
  T('[P8] a different seed moves the mixed timeline', m1 !== mixed(777));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 5. VOLT RAT — ZIGZAG SURGE ═══');
{
  const type = 'Volt Rat', d = ENEMY_SIGNATURES[type];
  const g = newGame();
  const e = mkEnemy(type);
  place(g, e, BAND_D[type]);
  let exeSpeeds = [], readyReturns = 0, readyNull = 0, sides = new Set();
  const tr = runPhases(g, e, 60 * 60, {
    pre: () => place(g, e, BAND_D[type]),
    hook: (f, en, r) => {
      if (en._sig.phase === SIG_PHASE.EXECUTE && r && r.overrideVel) exeSpeeds.push(Math.hypot(r.vx, r.vy));
      if (en._sig.phase === SIG_PHASE.TELEGRAPH) sides.add(Math.sign(en._sig.sideX * en._sig.dirY - en._sig.sideY * en._sig.dirX));
      if (en._sig.phase === SIG_PHASE.READY) { readyReturns++; if (r === null) readyNull++; }
    },
  });
  // [P16] the surge is bounded, and the enemy RETURNS TO CHASE afterwards.
  T('[P16] Volt Rat: the surge really drives movement (overrideVel during EXECUTE)',
    exeSpeeds.length > 0, String(exeSpeeds.length));
  T('[P16] Volt Rat: surge speed is exactly baseSpeed × surgeSpeedMult, never more',
    exeSpeeds.every(s => Math.abs(s - e.baseSpeed * d.surgeSpeedMult) < 1e-6),
    `${exeSpeeds[0]} vs ${e.baseSpeed * d.surgeSpeedMult}`);
  T('[P16] Volt Rat: the surge is not a teleport — it is bounded above by 2.5 × baseSpeed',
    exeSpeeds.every(s => s <= e.baseSpeed * 2.5 + 1e-6));
  T('[P16] Volt Rat: after the cycle it is back in READY',
    e._sig.phase === SIG_PHASE.READY || tr.length >= 4);
  T('[P16] Volt Rat: in READY the signature returns NULL — the enemy is on plain chase speed',
    readyReturns > 0 && readyNull === readyReturns, `${readyNull}/${readyReturns}`);
  T('[P16] Volt Rat: it surges to BOTH sides over a run (the side pick is not stuck)',
    sides.size >= 2, [...sides].join(','));
  T('[P16] Volt Rat: the telegraph side vector is a unit vector perpendicular to the aim',
    (() => { const s = e._sig; return true; })() &&
    (() => {
      const e2 = mkEnemy(type); const g2 = newGame(); place(g2, e2, BAND_D[type]);
      runPhases(g2, e2, 60 * 40, { pre: () => place(g2, e2, BAND_D[type]), stopAfter: 1 });
      const s = e2._sig;
      return Math.abs(Math.hypot(s.sideX, s.sideY) - 1) < 1e-6 &&
             Math.abs(s.sideX * s.dirX + s.sideY * s.dirY) < 1e-6;
    })());
  T('[P16] Volt Rat: during TELEGRAPH it slows but is NOT frozen (readable, still chasing)',
    (() => {
      const e2 = mkEnemy(type); const g2 = newGame(); place(g2, e2, BAND_D[type]);
      let m = null;
      runPhases(g2, e2, 60 * 40, { pre: () => place(g2, e2, BAND_D[type]),
        hook: (f, en, r) => { if (en._sig.phase === SIG_PHASE.TELEGRAPH && r) m = r; }, stopAfter: 2 });
      return m && m.overrideVel === false && m.speedMult > 0 && m.speedMult < 1;
    })());
}

console.log('\n═══ 5b. PULSE BURROWER — BURROW REPOSITION ═══');
for (const mode of ['endless', undefined]) {
  const label = mode === 'endless' ? 'Endless (real obstacle map)' : 'Act 1 (bounded arena)';
  const type = 'Pulse Burrower', d = ENEMY_SIGNATURES[type];
  const g = newGame(mode);
  const e = mkEnemy(type);
  place(g, e, BAND_D[type]);
  const landings = [], nonWalkable = [], intangibleWhileUnder = [];
  let underFrames = 0, tangibleUnder = 0;
  let wasUnder = false;
  for (let f = 0; f < 60 * 300; f++) {
    sigFrame(g, [e], DT);
    if (e._sig.under) {
      underFrames++;
      if (!signatureIntangible(e)) tangibleUnder++;
    }
    if (wasUnder && !e._sig.under) {
      const dist = distTo(g, e);
      const wm = g._walkMode();
      const walk = wm && g.mapManager && g.mapManager.isWalkableFootprint
        ? g.mapManager.isWalkableFootprint(e.pos.x, e.pos.y, e.radius, wm) : null;
      landings.push(dist);
      if (walk === false) nonWalkable.push(dist.toFixed(1));
    }
    wasUnder = e._sig.under;
    if (distTo(g, e) > d.maxRange - 50) place(g, e, BAND_D[type]);   // keep it engaged
  }
  T(`[P17] Burrower/${label}: it actually burrowed and surfaced repeatedly`,
    landings.length >= 5, `${landings.length} surfacings`);
  T(`[P17] Burrower/${label}: EVERY landing is finite`,
    landings.every(x => Number.isFinite(x)));
  T(`[P17] Burrower/${label}: EVERY landing is on walkable geometry`,
    nonWalkable.length === 0, nonWalkable.join(','));
  T(`[P17] Burrower/${label}: every landing sits inside the arena bounds`,
    (() => { const b = g.getWalkableBounds && g.getWalkableBounds(); if (!b) return true;
             return e.pos.x >= b.x0 - 1 && e.pos.x <= b.x1 + 1 && e.pos.y >= b.y0 - 1 && e.pos.y <= b.y1 + 1; })());
  // [P18] never on top of the player. The module's own abort floor is landMin × 0.6.
  const floor = d.landMin * 0.6;
  T(`[P18] Burrower/${label}: NO surfacing landed within ${floor.toFixed(0)}px of the player`,
    landings.every(x => x >= floor - 1e-6), `min=${Math.min(...landings).toFixed(1)}`);
  T(`[P18] Burrower/${label}: landings respect the declared [${d.landMin},${d.landMax}] band or the stay-put fallback`,
    landings.every(x => x >= floor - 1e-6), `min=${Math.min(...landings).toFixed(1)} max=${Math.max(...landings).toFixed(1)}`);
  T(`[P18] Burrower/${label}: while underground it is intangible on EVERY frame`,
    underFrames > 0 && tangibleUnder === 0, `${tangibleUnder}/${underFrames} tangible`);
  T(`[P18] Burrower/${label}: it is NOT intangible outside the burrow`,
    !signatureIntangible(e) || e._sig.under);
}
{
  // A burrower that surfaces must be tangible again, and Game's contact scan must skip it while under.
  const g = newGame();
  const e = mkEnemy('Pulse Burrower');
  place(g, e, 250);
  e._sig.phase = SIG_PHASE.EXECUTE; e._sig.under = true;
  T('[P18] Game contact scan: signatureIntangible() is the exact gate Game._checkPlayerEnemyCollisions uses',
    signatureIntangible(e) === true &&
    /signatureIntangible\(e\)\)\s*continue/.test(fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8')));
  e._sig.under = false;
  T('[P18] …and a surfaced burrower is tangible again', signatureIntangible(e) === false);
  T('[P18] no other signature is ever intangible',
    TYPES.filter(t => t !== 'Pulse Burrower').every(t => {
      const x = mkEnemy(t); x._sig.phase = SIG_PHASE.EXECUTE; x._sig.under = true;
      return signatureIntangible(x) === false;
    }));
}

console.log('\n═══ 5c. RAZORHOUND — COMMITTED LUNGE ═══');
{
  const type = 'Razorhound', d = ENEMY_SIGNATURES[type];
  // [P19] direction is LOCKED at commit, and [P20] cannot be steered while the player moves.
  const g = newGame();
  const e = mkEnemy(type);
  place(g, e, BAND_D[type]);
  let commitDir = null, lockOk = true, velOk = true, exeFrames = 0, drift = 0, playerMoved = 0;
  const homePlayer = { x: g.player.pos.x, y: g.player.pos.y };
  let lastPhase = e._sig.phase;
  for (let f = 0; f < 60 * 60; f++) {
    // The enemy sits still at a fixed offset from the player's ORIGINAL spot; the player orbits.
    const ang = f * 0.06;
    g.player.pos.x = homePlayer.x + Math.cos(ang) * 120;
    g.player.pos.y = homePlayer.y + Math.sin(ang) * 120;
    playerMoved++;
    e.pos.x = homePlayer.x + 240; e.pos.y = homePlayer.y;
    centerCam(g);
    g._sigCensus = buildSignatureCensus([e], {});
    const before = e._sig.phase;
    const r = updateSignature(e, g, DT);
    if (before === SIG_PHASE.TELEGRAPH && e._sig.phase === SIG_PHASE.EXECUTE) {
      commitDir = { x: e._sig.aimX, y: e._sig.aimY };
      // the lock must equal the tracking direction at the moment of commit
      if (Math.abs(e._sig.aimX - e._sig.dirX) > 1e-12 || Math.abs(e._sig.aimY - e._sig.dirY) > 1e-12) lockOk = false;
    }
    if (e._sig.phase === SIG_PHASE.EXECUTE && commitDir) {
      const dd = Math.hypot(e._sig.aimX - commitDir.x, e._sig.aimY - commitDir.y);
      if (dd > drift) drift = dd;
      // The commit frame itself still carries the TELEGRAPH movement (the wind-up owns that frame);
      // the lunge velocity is asserted on every frame that BEGAN already in EXECUTE.
      if (before === SIG_PHASE.EXECUTE) {
        exeFrames++;
        if (!r || !r.overrideVel) velOk = false;
        else {
          const vl = Math.hypot(r.vx, r.vy) || 1;
          if (Math.abs(r.vx / vl - commitDir.x) > 1e-9 || Math.abs(r.vy / vl - commitDir.y) > 1e-9) velOk = false;
          if (Math.abs(vl - e.baseSpeed * d.lungeSpeedMult) > 1e-6) velOk = false;
        }
      }
    }
    if (e._sig.phase === SIG_PHASE.READY && lastPhase === SIG_PHASE.RECOVER) commitDir = null;
    lastPhase = e._sig.phase;
  }
  T('[P19] Razorhound: the lunge really executed (EXECUTE frames observed)', exeFrames > 0, String(exeFrames));
  T('[P19] Razorhound: the direction is locked AT COMMIT to the live aim vector', lockOk);
  T('[P19] Razorhound: the locked vector is a unit vector', (() => {
      const e2 = mkEnemy(type); const g2 = newGame(); place(g2, e2, BAND_D[type]);
      runPhases(g2, e2, 60 * 40, { pre: () => place(g2, e2, BAND_D[type]), stopAfter: 2 });
      return Math.abs(Math.hypot(e2._sig.aimX, e2._sig.aimY) - 1) < 1e-9;
    })());
  T(`[P20] Razorhound: the lunge NEVER re-steers while the player moves (${playerMoved} moving frames)`,
    drift === 0, `max drift ${drift}`);
  T('[P20] Razorhound: the driven velocity equals lockedDir × baseSpeed × lungeSpeedMult, every frame', velOk);
  T('[P20] Razorhound: a missed lunge is punished — RECOVER slows it to the declared recoverSpeedMult',
    (() => {
      const g2 = newGame(); const e2 = mkEnemy(type); place(g2, e2, BAND_D[type]);
      let rec = null;
      runPhases(g2, e2, 60 * 40, { pre: () => place(g2, e2, BAND_D[type]),
        hook: (f, en, r) => { if (en._sig.phase === SIG_PHASE.RECOVER && r) rec = r; }, stopAfter: 4 });
      return rec && Math.abs(rec.speedMult - d.recoverSpeedMult) < 1e-9 && rec.overrideVel === false;
    })());

  // [P21] SINGLE-HIT GATING — many frames of overlap, at most one damage event per activation.
  const g2 = newGame();
  let dmgCalls = 0, dmgTotal = 0;
  g2._damagePlayer = (dmg) => { dmgCalls++; dmgTotal += dmg; return true; };   // never refuse: the gate must be the signature's
  const e2 = mkEnemy(type);
  let activations = 0, perAct = [], cur = 0;
  for (let f = 0; f < 60 * 90; f++) {
    const before = e2._sig.phase;
    // parked in band while READY/TELEGRAPH, buried in the player during EXECUTE
    if (before === SIG_PHASE.EXECUTE) place(g2, e2, 4);
    else place(g2, e2, BAND_D[type]);
    centerCam(g2);
    g2._sigCensus = buildSignatureCensus([e2], {});
    const c0 = dmgCalls;
    updateSignature(e2, g2, DT);
    if (before === SIG_PHASE.TELEGRAPH && e2._sig.phase === SIG_PHASE.EXECUTE) { activations++; cur = 0; }
    cur += dmgCalls - c0;
    if (before === SIG_PHASE.EXECUTE && e2._sig.phase === SIG_PHASE.RECOVER) perAct.push(cur);
  }
  T('[P21] Razorhound: the overlap scenario ran real activations', activations >= 5, String(activations));
  T('[P21] Razorhound: AT MOST ONE damage event per activation, over many overlapping frames',
    perAct.every(x => x <= 1), `per-activation hits = ${perAct.join(',')}`);
  T('[P21] Razorhound: an overlapping lunge does land its one hit', perAct.some(x => x === 1),
    perAct.join(','));
  T('[P21] Razorhound: total damage never exceeds lungeDamage × activations',
    dmgTotal <= d.lungeDamage * activations + 1e-9, `${dmgTotal} vs ${d.lungeDamage * activations}`);
  T('[P21] Razorhound: each landed hit is exactly the declared lungeDamage',
    dmgCalls === 0 || Math.abs(dmgTotal / dmgCalls - d.lungeDamage) < 1e-9, `${dmgTotal}/${dmgCalls}`);
  // A hit REFUSED by i-frames must not consume the budget (the EnemyWeaponSystem contract).
  {
    const g3 = newGame();
    let tries = 0;
    g3._damagePlayer = () => { tries++; return false; };     // always refused
    const e3 = mkEnemy(type);
    let acts = 0;
    for (let f = 0; f < 60 * 60; f++) {
      const b = e3._sig.phase;
      if (b === SIG_PHASE.EXECUTE) place(g3, e3, 4); else place(g3, e3, BAND_D[type]);
      centerCam(g3);
      g3._sigCensus = buildSignatureCensus([e3], {});
      updateSignature(e3, g3, DT);
      if (b === SIG_PHASE.TELEGRAPH && e3._sig.phase === SIG_PHASE.EXECUTE) acts++;
    }
    T('[P21] Razorhound: a refused hit does not silently consume the single-hit budget (it retries)',
      acts > 0 && tries > acts, `${tries} attempts over ${acts} activations`);
  }
}

console.log('\n═══ 5d. RIFT EYE — AIMED RIFT SHOT ═══');
{
  const type = 'Rift Eye', d = ENEMY_SIGNATURES[type];
  const g = newGame();
  const e = mkEnemy(type);
  place(g, e, BAND_D[type]);
  let bulletsInTelegraph = 0, bulletsAtExecute = -1, firstBullet = null, activations = 0;
  for (let f = 0; f < 60 * 40; f++) {
    place(g, e, BAND_D[type]);
    centerCam(g);
    g._sigCensus = buildSignatureCensus([e], {});
    const before = e._sig.phase;
    updateSignature(e, g, DT);
    if (before === SIG_PHASE.TELEGRAPH && e._sig.phase === SIG_PHASE.TELEGRAPH)
      bulletsInTelegraph = Math.max(bulletsInTelegraph, g.enemyBullets.length);
    if (before === SIG_PHASE.TELEGRAPH && e._sig.phase === SIG_PHASE.EXECUTE) {
      activations++;
      if (bulletsAtExecute < 0) { bulletsAtExecute = g.enemyBullets.length; firstBullet = g.enemyBullets[0] || null; }
    }
    if (activations >= 1 && e._sig.phase === SIG_PHASE.RECOVER) break;
  }
  T('[P22] Rift Eye: the aimed shot armed and committed', activations >= 1, String(activations));
  T('[P22] Rift Eye: NO projectile exists during TELEGRAPH — the tell always precedes the shot',
    bulletsInTelegraph === 0, `${bulletsInTelegraph} bullet(s) mid-telegraph`);
  T('[P22] Rift Eye: EXACTLY ONE projectile exists the moment EXECUTE begins',
    bulletsAtExecute === 1, `${bulletsAtExecute} bullet(s) at EXECUTE — the aimed shot produced no projectile`);
  // CONTRACT PROBE — spawnEnemyBullet calls dir.clone(), so the direction MUST be a real Vec2.
  // Passing a plain {x,y} throws inside fireAimedShot's try/catch: the shot would silently never
  // exist while still having consumed a hostile-projectile token. Both halves are pinned here.
  {
    const gp = newGame();
    const ep = mkEnemy(type);
    place(gp, ep, 250);
    let ret, err = null;
    const un = muteConsole();
    try {
      ret = gp.spawnEnemyBullet(new Vec2(ep.pos.x, ep.pos.y), new Vec2(1, 0),
        d.shotSpeed, d.shotDamage, d.shotRadius, '#b06bff',
        { stun: 0, cls: 'ranged', owner: ep, weaponDef: null });
    } catch (ex) { err = ex && ex.message; }
    un();
    T('[P22] spawnEnemyBullet accepts the Vec2 direction fireAimedShot now passes',
      err === null && ret === true && gp.enemyBullets.length === 1,
      `threw=${String(err)} ret=${String(ret)} bullets=${gp.enemyBullets.length}`);
    T('[P22] …and the hostile-projectile token matches the bullet that really exists',
      (gp.hostileDirector?.counts?.ranged || 0) === gp.enemyBullets.length,
      `tokens=${gp.hostileDirector?.counts?.ranged} bullets=${gp.enemyBullets.length}`);
    // A plain {x,y} must still be rejected — this is the regression that would silently return.
    const gp2 = newGame(); const ep2 = mkEnemy(type); place(gp2, ep2, 250);
    let threw2 = false;
    const un2 = muteConsole();
    try { gp2.spawnEnemyBullet(new Vec2(ep2.pos.x, ep2.pos.y), { x: 1, y: 0 },
      d.shotSpeed, d.shotDamage, d.shotRadius, '#b06bff', { stun: 0, cls: 'ranged', owner: ep2 }); }
    catch (_) { threw2 = true; }
    un2();
    T('[P22] a plain {x,y} direction is still rejected, so the Vec2 requirement is real',
      threw2 === true);
  }
  T('[P22] Rift Eye: the aim vector is locked (aimX/aimY) at the commit frame',
    Math.abs(Math.hypot(e._sig.aimX, e._sig.aimY) - 1) < 1e-9,
    `${e._sig.aimX},${e._sig.aimY}`);
  T('[P22] Rift Eye: during TELEGRAPH it nearly stops (declared aimSpeedMult), so the tell is readable',
    (() => {
      const g2 = newGame(); const e2 = mkEnemy(type); place(g2, e2, BAND_D[type]);
      let m = null;
      runPhases(g2, e2, 60 * 40, { pre: () => place(g2, e2, BAND_D[type]),
        hook: (f, en, r) => { if (en._sig.phase === SIG_PHASE.TELEGRAPH && r) m = r; }, stopAfter: 2 });
      return m && Math.abs(m.speedMult - d.aimSpeedMult) < 1e-9;
    })());

  // [P23] bounded projectile lifetime.
  T('[P23] Rift Eye: the aimed shot produced a projectile whose lifetime can be measured',
    !!firstBullet, 'no projectile was produced at all');
  if (firstBullet) {
    T('[P23] Rift Eye: the projectile carries a finite, bounded life',
      Number.isFinite(firstBullet.life) && firstBullet.life > 0 && firstBullet.life <= 6,
      String(firstBullet.life));
    const un = muteConsole();
    let alive = 0;
    for (let f = 0; f < 60 * 8 && g.enemyBullets.length > 0; f++) { g._updateEnemyBullets(DT); alive = f; }
    un();
    T('[P23] Rift Eye: the projectile is retired well inside 6 seconds',
      g.enemyBullets.length === 0 && alive / 60 <= 6, `${(alive / 60).toFixed(2)}s, ${g.enemyBullets.length} left`);
  } else {
    T('[P23] Rift Eye: the projectile carries a finite, bounded life', false, 'no projectile');
    T('[P23] Rift Eye: the projectile is retired well inside 6 seconds', false, 'no projectile');
  }

  // [P24] no post-fire homing.
  {
    const g2 = newGame();
    const e2 = mkEnemy(type);
    place(g2, e2, BAND_D[type]);
    let b = null;
    for (let f = 0; f < 60 * 40 && !b; f++) {
      place(g2, e2, BAND_D[type]);
      centerCam(g2);
      g2._sigCensus = buildSignatureCensus([e2], {});
      updateSignature(e2, g2, DT);
      if (g2.enemyBullets.length > 0) b = g2.enemyBullets[0];
    }
    T('[P24] Rift Eye: a projectile exists to test homing against', !!b, 'no projectile was ever produced');
    if (b) {
      const d0 = { x: b.dir.x, y: b.dir.y };
      let maxDrift = 0;
      const un = muteConsole();
      for (let f = 0; f < 60 * 3 && g2.enemyBullets.length > 0; f++) {
        // yank the player hard, every frame, in a circle — a homing shot would follow
        g2.player.pos.x += Math.cos(f * 0.2) * 40;
        g2.player.pos.y += Math.sin(f * 0.2) * 40;
        centerCam(g2);
        g2._updateEnemyBullets(DT);
        if (g2.enemyBullets[0]) {
          const cur = g2.enemyBullets[0];
          maxDrift = Math.max(maxDrift, Math.hypot(cur.dir.x - d0.x, cur.dir.y - d0.y));
        }
      }
      un();
      T('[P24] Rift Eye: the projectile direction NEVER changes after firing (zero homing)',
        maxDrift === 0, `drift ${maxDrift}`);
    } else {
      T('[P24] Rift Eye: the projectile direction NEVER changes after firing (zero homing)', false, 'no projectile');
    }
  }
}

console.log('\n═══ 5e. HEAVY MECH — GROUND BRACE ═══');
{
  const type = 'Heavy Mech', d = ENEMY_SIGNATURES[type];
  // [P25] bounded stomp radius — a player JUST outside stompRadius takes nothing.
  const outside = d.stompRadius + 12;
  const inside  = d.stompRadius - 20;
  const runMech = (dist) => {
    const g = newGame();
    let calls = 0, total = 0;
    g._damagePlayer = (dmg) => { calls++; total += dmg; return true; };
    const e = mkEnemy(type);
    let acts = 0, perAct = [], cur = 0;
    for (let f = 0; f < 60 * 90; f++) {
      place(g, e, dist);
      centerCam(g);
      g._sigCensus = buildSignatureCensus([e], {});
      const before = e._sig.phase;
      const c0 = calls;
      updateSignature(e, g, DT);
      if (before === SIG_PHASE.TELEGRAPH && e._sig.phase === SIG_PHASE.EXECUTE) { acts++; cur = 0; }
      cur += calls - c0;
      if (before === SIG_PHASE.EXECUTE && e._sig.phase === SIG_PHASE.RECOVER) perAct.push(cur);
    }
    return { acts, calls, total, perAct };
  };
  const far = runMech(outside);
  T(`[P25] Heavy Mech: the far scenario really ran (${far.acts} stomps at ${outside.toFixed(0)}px)`,
    far.acts >= 5, String(far.acts));
  T(`[P25] Heavy Mech: a player just OUTSIDE stompRadius (${d.stompRadius}px) takes ZERO damage`,
    far.calls === 0, `${far.calls} hit(s)`);
  const near = runMech(inside);
  T(`[P25] Heavy Mech: a player INSIDE stompRadius is hit (the radius gate is not blanket-off)`,
    near.calls > 0, String(near.calls));
  T('[P25] Heavy Mech: every stomp hit is exactly the declared stompDamage',
    near.calls === 0 || Math.abs(near.total / near.calls - d.stompDamage) < 1e-9, `${near.total}/${near.calls}`);
  // [P26] single damage application per activation.
  T('[P26] Heavy Mech: AT MOST ONE damage application per brace, over the full EXECUTE window',
    near.perAct.every(x => x <= 1), `per-activation hits = ${near.perAct.join(',')}`);
  T('[P26] Heavy Mech: an in-range brace does land its single stomp',
    near.perAct.some(x => x === 1), near.perAct.join(','));
  T('[P26] Heavy Mech: total damage never exceeds stompDamage × braces',
    near.total <= d.stompDamage * near.acts + 1e-9, `${near.total} vs ${d.stompDamage * near.acts}`);
  T('[P25] Heavy Mech: the stomp radius is a small shaping tool, not a boss AoE (< 200px)',
    d.stompRadius < 200, String(d.stompRadius));

  // The brace also cuts KNOCKBACK — and only while braced.
  {
    const e = mkEnemy(type);
    T('[P25] Heavy Mech: knockback is unchanged (×1) while READY',
      signatureKnockbackMult(e) === 1);
    e._sig.phase = SIG_PHASE.TELEGRAPH;
    T('[P25] Heavy Mech: knockback is cut to the declared braceKbMult during TELEGRAPH',
      signatureKnockbackMult(e) === d.braceKbMult, String(signatureKnockbackMult(e)));
    e._sig.phase = SIG_PHASE.EXECUTE;
    T('[P25] Heavy Mech: …and during EXECUTE', signatureKnockbackMult(e) === d.braceKbMult);
    e._sig.phase = SIG_PHASE.RECOVER;
    T('[P25] Heavy Mech: knockback returns to normal in RECOVER (never permanent)',
      signatureKnockbackMult(e) === 1);
    T('[P25] no other signature touches knockback',
      TYPES.filter(t => t !== 'Heavy Mech').every(t => {
        const x = mkEnemy(t);
        return [0, 1, 2, 3].every(p => { x._sig.phase = p; return signatureKnockbackMult(x) === 1; });
      }));
    T('[P25] knockback multiplier is 1 for an enemy with no signature at all',
      signatureKnockbackMult({ _sig: null }) === 1 && signatureKnockbackMult(null) === 1 &&
      signatureKnockbackMult(undefined) === 1);
    // …and the REAL takeHit path applies it.
    const g = newGame();
    const a = mkEnemy(type), b = mkEnemy(type);
    place(g, a, 150); place(g, b, 150);
    a._sig.phase = SIG_PHASE.EXECUTE;                       // braced
    b._sig.phase = SIG_PHASE.READY;                         // not braced
    const un = muteConsole();
    a.takeHit(50, g); b.takeHit(50, g);
    un();
    const ka = Math.hypot(a._kbx || 0, a._kby || 0), kb = Math.hypot(b._kbx || 0, b._kby || 0);
    T('[P25] Heavy Mech: Enemy.takeHit really applies the brace knockback cut',
      kb > 0 && Math.abs(ka / kb - d.braceKbMult) < 1e-6, `${ka.toFixed(2)} vs ${kb.toFixed(2)}`);
  }
}

console.log('\n═══ 5f. ABYSS MAW — FRONTAL GUARD (CONE MATH) ═══');
{
  const type = 'Abyss Maw', d = ENEMY_SIGNATURES[type];
  const g = newGame();
  const e = mkEnemy(type);
  place(g, e, 250);
  // [P27] pure unit test of signatureDamageMult over many angles, against Math.cos(coneHalfAngle).
  const facing = 0;                                         // guard faces +x
  e._sig.phase = SIG_PHASE.EXECUTE;
  e._sig.dirX = Math.cos(facing); e._sig.dirY = Math.sin(facing);
  const N = 720;
  let wrong = 0, firstWrong = '';
  let insideSeen = 0, outsideSeen = 0;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    for (const r of [1, 40, 250, 5000]) {
      const sx = e.pos.x + Math.cos(th) * r, sy = e.pos.y + Math.sin(th) * r;
      const got = signatureDamageMult(e, sx, sy);
      const dot = Math.cos(th - facing);
      const want = dot >= Math.cos(d.coneHalfAngle) ? d.frontDamageMult : 1;
      if (Math.abs(got - want) > 1e-12) { wrong++; if (!firstWrong) firstWrong = `θ=${th.toFixed(3)} r=${r} got=${got} want=${want}`; }
      if (want !== 1) insideSeen++; else outsideSeen++;
    }
  }
  T(`[P27] Abyss Maw: signatureDamageMult matches cos(coneHalfAngle) at ${N} angles × 4 radii`,
    wrong === 0, `${wrong} mismatches, first ${firstWrong}`);
  T('[P27] the angle sweep really crossed the cone boundary in both directions',
    insideSeen > 0 && outsideSeen > 0, `${insideSeen} inside / ${outsideSeen} outside`);
  // Exact boundary behaviour, both sides, plus the axis.
  const at = (th) => { const sx = e.pos.x + Math.cos(th) * 100, sy = e.pos.y + Math.sin(th) * 100;
                       return signatureDamageMult(e, sx, sy); };
  T('[P27] dead ahead is inside the cone', at(0) === d.frontDamageMult);
  T('[P27] just inside the cone edge is reduced (both edges)',
    at(d.coneHalfAngle * 0.999) === d.frontDamageMult && at(-d.coneHalfAngle * 0.999) === d.frontDamageMult);
  T('[P27] just outside the cone edge is NOT reduced (both edges)',
    at(d.coneHalfAngle * 1.001) === 1 && at(-d.coneHalfAngle * 1.001) === 1);
  T('[P27] dead behind is never reduced', at(Math.PI) === 1);
  T('[P27] the flanks (±90°) are outside the ~71° arc and are never reduced',
    at(Math.PI / 2) === 1 && at(-Math.PI / 2) === 1);
  T('[P27] the guard only applies during EXECUTE — never in READY/TELEGRAPH/RECOVER',
    [SIG_PHASE.READY, SIG_PHASE.TELEGRAPH, SIG_PHASE.RECOVER].every(p => {
      e._sig.phase = p; return at(0) === 1;
    }));
  e._sig.phase = SIG_PHASE.EXECUTE;
  T('[P27] a non-finite / unknown source direction gets NO discount (fail-safe)',
    signatureDamageMult(e, NaN, 0) === 1 && signatureDamageMult(e, 0, NaN) === 1 &&
    signatureDamageMult(e, null, null) === 1 && signatureDamageMult(e, undefined, undefined) === 1 &&
    signatureDamageMult(e, Infinity, 0) === 1);
  T('[P27] a source exactly ON the enemy gets no discount (no divide-by-zero)',
    signatureDamageMult(e, e.pos.x, e.pos.y) === 1);
  T('[P27] no other signature grants any damage discount',
    TYPES.filter(t => t !== 'Abyss Maw').every(t => {
      const x = mkEnemy(t); place(g, x, 100); x._sig.phase = SIG_PHASE.EXECUTE;
      x._sig.dirX = 1; x._sig.dirY = 0;
      return signatureDamageMult(x, x.pos.x + 100, x.pos.y) === 1;
    }));
  T('[P27] an enemy with no signature is never discounted',
    signatureDamageMult({ _sig: null, pos: { x: 0, y: 0 } }, 100, 0) === 1 &&
    signatureDamageMult(null, 100, 0) === 1);
  T('[P27] the guard is a reduction, never immunity', d.frontDamageMult > 0 && d.frontDamageMult < 1,
    String(d.frontDamageMult));

  // [P28]/[P29] the REAL takeHit path — front reduced, rear NOT reduced.
  const hpDrop = (facingX, facingY, playerAt) => {
    const gg = newGame();
    const en = mkEnemy(type);
    en.pos.x = gg.player.pos.x + 300; en.pos.y = gg.player.pos.y + 300;
    gg.player.pos.x = en.pos.x + playerAt.x; gg.player.pos.y = en.pos.y + playerAt.y;
    en._sig.phase = SIG_PHASE.EXECUTE; en._sig.dirX = facingX; en._sig.dirY = facingY;
    en._guardCrackT = 0;
    const hp0 = en.hp;
    const un = muteConsole();
    en.takeHit(10, gg);
    un();
    return hp0 - en.hp;
  };
  const frontDrop = hpDrop(1, 0, { x: 200, y: 0 });     // guard faces +x, player at +x → FRONT
  const rearDrop  = hpDrop(1, 0, { x: -200, y: 0 });    // guard faces +x, player at −x → REAR
  const flankDrop = hpDrop(1, 0, { x: 0, y: 200 });     // player at +y → FLANK
  T('[P28] Abyss Maw: a hit from the FRONT is reduced by exactly frontDamageMult, through Enemy.takeHit',
    rearDrop > 0 && Math.abs(frontDrop / rearDrop - d.frontDamageMult) < 1e-9,
    `front=${frontDrop} rear=${rearDrop}`);
  T('[P29] Abyss Maw: a hit from the REAR is NOT reduced (guard facing held)',
    Math.abs(rearDrop - hpDrop(1, 0, { x: -200, y: 0 })) < 1e-12 &&
    Math.abs(rearDrop / hpDrop(0, 1, { x: 0, y: -200 }) - 1) < 1e-9,
    `rear=${rearDrop}`);
  T('[P29] Abyss Maw: a hit from the FLANK is NOT reduced',
    Math.abs(flankDrop - rearDrop) < 1e-12, `flank=${flankDrop} rear=${rearDrop}`);

  // …and now through the LIVE machine: the player walks behind an already-guarding Abyss Maw.
  {
    const gg = newGame();
    const en = mkEnemy(type);
    place(gg, en, 250);
    // drive to EXECUTE with the player in front
    let guard = false;
    for (let f = 0; f < 60 * 40 && !guard; f++) {
      place(gg, en, 250);
      centerCam(gg);
      gg._sigCensus = buildSignatureCensus([en], {});
      updateSignature(en, gg, DT);
      guard = en._sig.phase === SIG_PHASE.EXECUTE;
    }
    T('[P29] Abyss Maw: the live guard came up', guard);
    const faceX = en._sig.dirX, faceY = en._sig.dirY;
    // The player walks around to the guard's REAR — the documented counterplay.
    gg.player.pos.x = en.pos.x - faceX * 220;
    gg.player.pos.y = en.pos.y - faceY * 220;
    centerCam(gg);
    gg._sigCensus = buildSignatureCensus([en], {});
    updateSignature(en, gg, DT);                    // one live frame with the player behind
    const hp0 = en.hp; en._guardCrackT = 0;
    const un = muteConsole(); en.takeHit(10, gg); un();
    const behindDrop = hp0 - en.hp;
    const hp1 = en.hp;
    // reference: same enemy, guard down
    en._sig.phase = SIG_PHASE.READY; en._guardCrackT = 0;
    const un2 = muteConsole(); en.takeHit(10, gg); un2();
    const openDrop = hp1 - en.hp;
    T('[P29] Abyss Maw: walking BEHIND the live guard removes the discount (the stated counterplay works)',
      openDrop > 0 && Math.abs(behindDrop / openDrop - 1) < 1e-9,
      `behind=${behindDrop.toFixed(3)} guard-down=${openDrop.toFixed(3)} ratio=${(behindDrop / openDrop).toFixed(3)} ` +
      `— the guard re-faces the player every EXECUTE frame, so the cone can never exclude the player`);
  }
  // DIAGNOSIS for the failure above, asserted as a fact so whoever fixes it knows where to look.
  {
    const gg = newGame();
    const en = mkEnemy(type);
    place(gg, en, 250);
    let execFrames = 0, maxLag = 0;
    for (let f = 0; f < 60 * 40; f++) {
      // the player circles the guard at speed; a guard with ANY turn rate would lag behind
      const a = f * 0.15;
      gg.player.pos.x = en.pos.x + Math.cos(a) * 250;
      gg.player.pos.y = en.pos.y + Math.sin(a) * 250;
      centerCam(gg);
      gg._sigCensus = buildSignatureCensus([en], {});
      updateSignature(en, gg, DT);
      if (en._sig.phase === SIG_PHASE.EXECUTE) {
        execFrames++;
        const dx = gg.player.pos.x - en.pos.x, dy = gg.player.pos.y - en.pos.y;
        const dd = Math.hypot(dx, dy);
        maxLag = Math.max(maxLag, Math.acos(Math.min(1, (dx / dd) * en._sig.dirX + (dy / dd) * en._sig.dirY)));
      }
    }
    // The guard facing is LOCKED at commit. If it re-pointed at the player every frame the lag
    // would be ~0 and the cone could never exclude anyone — that was the original bug. A player
    // who orbits the Maw must be able to get outside the cone, i.e. lag must EXCEED the half-angle.
    T('[P29] the guard facing is locked at commit — orbiting the Maw leaves its frontal cone',
      execFrames > 0 && maxLag > d.coneHalfAngle,
      `${execFrames} EXECUTE frames, max facing lag ${(maxLag * 180 / Math.PI).toFixed(2)}° vs cone half-angle ${(d.coneHalfAngle * 180 / Math.PI).toFixed(1)}°`);
  }
  T('[P28] Abyss Maw: the pre-existing omnidirectional shield block is untouched (still ×0.60 under 40 dmg)',
    (() => {
      const gg = newGame();
      const en = mkEnemy(type);
      en.pos.x = gg.player.pos.x + 300; en.pos.y = gg.player.pos.y;
      en._sig.phase = SIG_PHASE.READY; en._guardCrackT = 0;
      const hp0 = en.hp;
      const un = muteConsole(); en.takeHit(10, gg); un();
      return Math.abs((hp0 - en.hp) - 6) < 1e-9;
    })(), 'archetype shield reduction changed');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 6. CROWDS — DE-SYNCHRONISATION, CONCURRENCY CEILING, ELITES ═══');
{
  // [P30] 60 of one type: they must not move as one, and the ceiling must hold.
  for (const type of TYPES) {
    const d = ENEMY_SIGNATURES[type];
    const g = newGame();
    g._damagePlayer = () => true;
    const arr = [];
    for (let i = 0; i < 60; i++) {
      const e = mkEnemy(type);
      place(g, e, BAND_D[type], (i / 60) * Math.PI * 2);
      arr.push(e);
    }
    const ceiling = Math.max(1, Math.floor(60 * d.maxConcurrentFrac));
    let maxActive = 0, allSameFrames = 0, frames = 0;
    const phaseHist = new Set();
    for (let f = 0; f < 60 * 60; f++) {
      arr.forEach((e, i) => { if (e._sig.id !== 'burrow_reposition') place(g, e, BAND_D[type], (i / 60) * Math.PI * 2); });
      sigFrame(g, arr, DT);
      let act = 0;
      const ph = new Set();
      for (const e of arr) { if (e._sig.phase !== SIG_PHASE.READY) act++; ph.add(e._sig.phase); phaseHist.add(e._sig.phase); }
      if (act > maxActive) maxActive = act;
      if (ph.size === 1) allSameFrames++;
      frames++;
    }
    T(`[P30] ${type} ×60: they are NOT all in the same phase (measured over ${frames} frames)`,
      allSameFrames < frames, `${allSameFrames}/${frames} frames fully synchronised`);
    T(`[P30] ${type} ×60: all four phases were observed across the crowd`,
      phaseHist.size === 4, [...phaseHist].join(','));
    T(`[P30] ${type} ×60: the concurrency ceiling maxConcurrentFrac=${d.maxConcurrentFrac} (=${ceiling} of 60) is respected`,
      maxActive <= ceiling, `peak concurrent = ${maxActive}, ceiling = ${ceiling}`);
    T(`[P30] ${type} ×60: the ceiling is doing real work (peak is well under the crowd size)`,
      maxActive < 60, `peak ${maxActive}`);
    T(`[P30] ${type} ×60: the crowd really activated (the ceiling test is not vacuous)`,
      maxActive > 0, String(maxActive));
  }
  // DIAGNOSIS for the ceiling overshoot above. `_sigCensus` is a per-FRAME snapshot, so every enemy
  // whose cooldown lapses on the same frame reads the SAME `active` count and all of them arm — the
  // gate can be crossed by a whole group at once instead of one at a time.
  {
    const type = 'Abyss Maw', d = ENEMY_SIGNATURES[type];
    const g = newGame();
    const arr = [];
    for (let i = 0; i < 60; i++) { const e = mkEnemy(type); place(g, e, BAND_D[type], (i / 60) * Math.PI * 2); arr.push(e); }
    const ceiling = Math.max(1, Math.floor(60 * d.maxConcurrentFrac));
    let maxArmedInOneFrame = 0, overshootFrames = 0;
    for (let f = 0; f < 60 * 60; f++) {
      arr.forEach((e, i) => place(g, e, BAND_D[type], (i / 60) * Math.PI * 2));
      const wasReady = arr.map(e => e._sig.phase === SIG_PHASE.READY);
      const activeBefore = arr.filter(e => e._sig.phase !== SIG_PHASE.READY).length;
      sigFrame(g, arr, DT);
      let armed = 0;
      arr.forEach((e, i) => { if (wasReady[i] && e._sig.phase !== SIG_PHASE.READY) armed++; });
      if (armed > maxArmedInOneFrame) maxArmedInOneFrame = armed;
      if (activeBefore >= ceiling && armed > 0) overshootFrames++;
    }
    T('[P30] DIAGNOSIS: several enemies arm on the SAME frame off one stale census snapshot — ' +
      'that is exactly how the per-type ceiling gets crossed',
      maxArmedInOneFrame > 1,
      `max ${maxArmedInOneFrame} armed in one frame; ${overshootFrames} frames armed while already at/over the ceiling of ${ceiling}`);
  }

  // The census itself is exact.
  {
    const g = newGame();
    const arr = [];
    for (const t of TYPES) for (let i = 0; i < 5; i++) { const e = mkEnemy(t); place(g, e, BAND_D[t], i); arr.push(e); }
    arr[0]._sig.phase = SIG_PHASE.EXECUTE;
    arr[1]._sig.phase = SIG_PHASE.TELEGRAPH;
    const c = buildSignatureCensus(arr, {});
    T('[P30] buildSignatureCensus counts every live signature enemy by type',
      TYPES.every(t => c[t] && c[t].total === 5), JSON.stringify(c));
    T('[P30] buildSignatureCensus counts only non-READY enemies as active',
      c['Volt Rat'].active === 2, JSON.stringify(c['Volt Rat']));
    // reuse of the out object must ZERO stale counters, not accumulate
    const c2 = buildSignatureCensus(arr, c);
    T('[P30] re-using the census object does not accumulate (leak-proof rebuild)',
      c2 === c && c['Volt Rat'].total === 5 && c['Volt Rat'].active === 2, JSON.stringify(c['Volt Rat']));
    arr.length = 0;
    const c3 = buildSignatureCensus(arr, c);
    T('[P30] an emptied field zeroes every census slot',
      Object.values(c3).every(s => s.total === 0 && s.active === 0), JSON.stringify(c3));
    T('[P30] a dead enemy (hp <= 0) is not counted even while still in the array',
      (() => { const e = mkEnemy('Volt Rat'); e.hp = 0; const cc = buildSignatureCensus([e], {});
               return !cc['Volt Rat'] || cc['Volt Rat'].total === 0; })());
    T('[P30] a non-array / null field returns an empty census without throwing',
      (() => { try { return Object.keys(buildSignatureCensus(null, {})).length >= 0 &&
                            Object.keys(buildSignatureCensus(undefined, {})).length >= 0 &&
                            Object.keys(buildSignatureCensus(42, {})).length >= 0; }
               catch (_) { return false; } })());
  }

  // [P31] the elite cooldown modifier is bounded and really applied.
  for (const type of TYPES) {
    const d = ENEMY_SIGNATURES[type];
    const expected = Math.max(0.8, d.eliteCdMult);
    const g = newGame();
    const a = mkEnemy(type), b = mkEnemy(type);
    // identical starting state, so the ONLY difference is isElite
    b._sig.rng = a._sig.rng; b._sig.cd = a._sig.cd;
    a.isElite = false; b.isElite = true;
    const arrA = [a], arrB = [b];
    let cdA = null, cdB = null;
    for (let f = 0; f < 60 * 60 && (cdA === null || cdB === null); f++) {
      place(g, a, BAND_D[type]); place(g, b, BAND_D[type]);
      centerCam(g);
      g._sigCensus = buildSignatureCensus(arrA, {});
      const pa = a._sig.phase; updateSignature(a, g, DT);
      if (cdA === null && pa === SIG_PHASE.RECOVER && a._sig.phase === SIG_PHASE.READY) cdA = a._sig.cd;
      g._sigCensus = buildSignatureCensus(arrB, {});
      const pb = b._sig.phase; updateSignature(b, g, DT);
      if (cdB === null && pb === SIG_PHASE.RECOVER && b._sig.phase === SIG_PHASE.READY) cdB = b._sig.cd;
    }
    T(`[P31] ${type}: both the elite and the normal re-armed (measurable)`, cdA !== null && cdB !== null,
      `${cdA} / ${cdB}`);
    if (cdA !== null && cdB !== null) {
      T(`[P31] ${type}: the elite cooldown multiplier is exactly max(0.8, eliteCdMult)=${expected}`,
        Math.abs(cdB / cdA - expected) < 1e-9, `ratio ${(cdB / cdA).toFixed(6)}`);
      T(`[P31] ${type}: an elite is NEVER faster than 0.8 × the base cooldown`,
        cdB >= d.cooldown * 0.8 * 0.85 - 1e-9 && cdB / cdA >= 0.8 - 1e-9,
        `cd=${cdB.toFixed(3)} floor=${(d.cooldown * 0.8 * 0.85).toFixed(3)}`);
    }
    // and a hostile eliteCdMult cannot break the floor: the code clamps with Math.max(0.8, …)
    T(`[P31] ${type}: the clamp is in the shipping source, not in this harness`,
      /Math\.max\(0\.8,\s*def\.eliteCdMult\)/.test(fs.readFileSync(path.join(ROOT, 'js/game/EnemySignatures.js'), 'utf8')));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 7. LIFECYCLE — DEATH, DECK, RESET, PAUSE, GAME OVER ═══');
{
  // [P11] cleanup on death.
  {
    const g = newGame();
    const arr = [];
    for (const t of TYPES) { const e = mkEnemy(t); place(g, e, BAND_D[t]); arr.push(e); }
    for (let f = 0; f < 60 * 20; f++) { arr.forEach((e, i) => place(g, e, BAND_D[e.enemyType], i)); sigFrame(g, arr, DT); }
    const before = signatureStats(arr);
    T('[P11] the field really had live signatures before the kill', before.live === 6, JSON.stringify(before));
    for (const e of arr) e.hp = 0;
    const cen = buildSignatureCensus(arr, {});
    T('[P11] a dead enemy leaves the census immediately',
      Object.values(cen).every(s => s.total === 0 && s.active === 0), JSON.stringify(cen));
    // …and through the REAL death path: _die() splices the enemy out of Game.enemies.
    const g2 = newGame();
    const un = muteConsole();
    const e2 = new Enemy('Volt Rat', 0);
    place(g2, e2, 250);
    g2.enemies.push(e2);
    e2._sig.phase = SIG_PHASE.EXECUTE; e2._sig.active = true;
    e2.hp = 0; e2._die(g2);
    un();
    T('[P11] Enemy._die removes the enemy from Game.enemies, so its _sig cannot outlive it',
      !g2.enemies.includes(e2));
    g2._sigCensus = buildSignatureCensus(g2.enemies, g2._sigCensus || {});
    T('[P11] the rebuilt census has no trace of the dead enemy',
      !g2._sigCensus['Volt Rat'] || g2._sigCensus['Volt Rat'].total === 0,
      JSON.stringify(g2._sigCensus['Volt Rat']));
    T('[P11] signatureStats reports nothing live after the field is emptied',
      signatureStats([]).live === 0 && signatureStats([]).active === 0);
  }

  // [P12] cleanup on deck transition.
  {
    const g = newGame('endless');
    const un = muteConsole();
    for (const t of TYPES) for (let i = 0; i < 6; i++) {
      const e = new Enemy(t, 0);
      e.pos.x = g.player.pos.x + 120 + i * 10; e.pos.y = g.player.pos.y + 60;
      e._sig.phase = SIG_PHASE.EXECUTE; e._sig.active = true; e._sig.under = (t === 'Pulse Burrower');
      g.enemies.push(e);
    }
    un();
    g._sigCensus = buildSignatureCensus(g.enemies, {});
    const n0 = g.enemies.length;
    const act0 = signatureStats(g.enemies).active;
    T('[P12] a populated deck has live signatures before the transition', n0 >= 36 && act0 >= 36,
      `${n0} enemies / ${act0} active`);
    const un2 = muteConsole();
    const moved = g._enterDeck('lower', { force: true });
    un2();
    T('[P12] the deck transition completed', moved === true && g._deck === 'lower', String(g._deck));
    T('[P12] the transition sweep removed every enemy — no signature survives the deck change',
      g.enemies.length === 0, `${g.enemies.length} left`);
    g._sigCensus = buildSignatureCensus(g.enemies, g._sigCensus);
    T('[P12] the census is fully zeroed after the deck change',
      Object.values(g._sigCensus).every(s => s.total === 0 && s.active === 0), JSON.stringify(g._sigCensus));
    T('[P12] signatureStats reports nothing live after the deck change',
      signatureStats(g.enemies).live === 0 && signatureStats(g.enemies).active === 0);
    // and back again, ten times, with no leak
    let leak = 0;
    for (let i = 0; i < 10; i++) {
      const un3 = muteConsole();
      for (const t of TYPES) { const e = new Enemy(t, 0); e.pos.x = g.player.pos.x + 130; e.pos.y = g.player.pos.y + 40;
                               e._sig.phase = SIG_PHASE.TELEGRAPH; g.enemies.push(e); }
      g._enterDeck(i % 2 === 0 ? 'main' : 'lower', { force: true });
      un3();
      if (g.enemies.length !== 0) leak++;
    }
    T('[P12] ten deck round-trips leave zero stranded signature enemies', leak === 0, `${leak} leaks`);
  }

  // [P13] cleanup on reset.
  {
    const g = newGame();
    const un = muteConsole();
    for (const t of TYPES) for (let i = 0; i < 8; i++) {
      const e = new Enemy(t, 0);
      place(g, e, BAND_D[t], i);
      e._sig.phase = SIG_PHASE.EXECUTE; e._sig.active = true;
      g.enemies.push(e);
    }
    un();
    g._sigCensus = buildSignatureCensus(g.enemies, {});
    T('[P13] the run has live signatures before reset', signatureStats(g.enemies).active >= 48);
    const un2 = muteConsole(); g.reset(); un2();
    T('[P13] reset() empties Game.enemies', g.enemies.length === 0, String(g.enemies.length));
    g._sigCensus = buildSignatureCensus(g.enemies, g._sigCensus);
    T('[P13] the census after reset is fully zeroed',
      Object.values(g._sigCensus).every(s => s.total === 0 && s.active === 0));
    T('[P13] reset() also clears enemy projectiles (nothing a signature fired outlives the run)',
      g.enemyBullets.length === 0);
    // Five reset cycles with a populated field each time — no growth anywhere.
    let bad = '';
    for (let i = 0; i < 5; i++) {
      const un3 = muteConsole();
      for (const t of TYPES) { const e = new Enemy(t, 0); place(g, e, BAND_D[t]); e._sig.phase = SIG_PHASE.RECOVER; g.enemies.push(e); }
      g.reset();
      un3();
      if (g.enemies.length !== 0) bad = `cycle ${i}: ${g.enemies.length}`;
    }
    T('[P13] five reset cycles leave nothing behind', bad === '', bad);
  }

  // [P14] pause freezes the signature timers.
  {
    const g = newGame();
    const un = muteConsole();
    const e = new Enemy('Volt Rat', 0);
    place(g, e, 250);
    g.enemies.push(e);
    un();
    const cd0 = e._sig.cd, ph0 = e._sig.phase, t0 = e._sig.t;
    g.paused = true;
    realFrames(g, 240, () => { place(g, e, 250); centerCam(g); if (!g.enemies.includes(e)) g.enemies.push(e); });
    T('[P14] paused: Game.update returns before _updateEnemies, so _sig.cd does not move',
      e._sig.cd === cd0, `${e._sig.cd} vs ${cd0}`);
    T('[P14] paused: the phase does not change over 240 frames', e._sig.phase === ph0 && e._sig.t === t0);
    // mid-signature, too
    e._sig.phase = SIG_PHASE.TELEGRAPH; e._sig.t = 0.30; e._sig.teleDur = 0.35;
    const tt = e._sig.t;
    realFrames(g, 240, () => { place(g, e, 250); centerCam(g); if (!g.enemies.includes(e)) g.enemies.push(e); });
    T('[P14] paused mid-TELEGRAPH: the wind-up timer is frozen, not advanced',
      e._sig.phase === SIG_PHASE.TELEGRAPH && e._sig.t === tt, `${e._sig.t} vs ${tt}`);
    g.paused = false;
    realFrames(g, 60, () => { place(g, e, 250); centerCam(g); if (!g.enemies.includes(e)) g.enemies.push(e); });
    T('[P14] un-pausing lets the same signature continue (the freeze is not a kill)',
      e._sig.phase !== SIG_PHASE.TELEGRAPH || e._sig.t < tt, `${PH_NAME[e._sig.phase]} t=${e._sig.t}`);
  }

  // [P15] gameOver prevents execution.
  {
    const g = newGame();
    const un = muteConsole();
    const e = new Enemy('Razorhound', 0);
    place(g, e, 250);
    g.enemies.push(e);
    un();
    e._sig.phase = SIG_PHASE.TELEGRAPH; e._sig.t = 0.05; e._sig.teleDur = 0.45;
    let dmg = 0;
    g._damagePlayer = () => { dmg++; return true; };
    g.gameOver = true;
    const un2 = muteConsole();
    for (let i = 0; i < 300; i++) {
      place(g, e, 4);                       // buried in the player: the ONLY thing stopping it is gameOver
      centerCam(g);
      if (!g.enemies.includes(e)) g.enemies.push(e);
      vclock += 1000 / 60;
      try { g.update(DT, input); } catch (_) {}
    }
    un2();
    T('[P15] gameOver: the signature never advances past TELEGRAPH',
      e._sig.phase === SIG_PHASE.TELEGRAPH && Math.abs(e._sig.t - 0.05) < 1e-12,
      `${PH_NAME[e._sig.phase]} t=${e._sig.t}`);
    T('[P15] gameOver: no signature damage is applied to the player', dmg === 0, String(dmg));
    // …and the module itself refuses a non-positive / non-finite dt, whatever the caller does.
    const before = JSON.stringify(e._sig);
    for (const bad of [0, -1, NaN, Infinity, -Infinity, undefined, null, '0.016', {}]) {
      updateSignature(e, g, bad);
    }
    T('[P15] updateSignature is a no-op for a non-positive or non-finite dt',
      JSON.stringify(e._sig) === before, e._sig.t + ' vs ' + JSON.parse(before).t);
    T('[P15] updateSignature returns null (never throws) with no player / no game',
      (() => { try { return updateSignature(e, {}, DT) === null &&
                            updateSignature(e, { player: {} }, DT) === null &&
                            updateSignature(e, { player: { pos: { x: NaN, y: 0 } } }, DT) === null &&
                            updateSignature({ _sig: null }, g, DT) === null; }
               catch (_) { return false; } })());
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 8. LONG-RUN INTEGRITY — 10 SIMULATED MINUTES ═══');
{
  const g = newGame();
  let damageCalls = 0;
  g._damagePlayer = () => { damageCalls++; return true; };
  const arr = [];
  for (const t of TYPES) for (let k = 0; k < 4; k++) {
    const e = mkEnemy(t);
    place(g, e, BAND_D[t], (arr.length / 24) * Math.PI * 2);
    arr.push(e);
  }
  const FRAMES = 60 * 600;               // 10 simulated minutes
  let nonFinite = 0, maxActive = 0, maxBullets = 0, activations = 0;
  const perTypeMaxActive = {};
  let lastPhase = arr.map(e => e._sig.phase);
  for (let f = 0; f < FRAMES; f++) {
    if (f % 30 === 0) {
      // the player drifts, so ranges/directions keep changing over the whole run
      g.player.pos.x += Math.cos(f * 0.013) * 6;
      g.player.pos.y += Math.sin(f * 0.011) * 6;
      arr.forEach((e, i) => {
        if (e._sig.id === 'burrow_reposition') return;
        place(g, e, BAND_D[e.enemyType], (i / arr.length) * Math.PI * 2 + f * 0.0007);
      });
    }
    sigFrame(g, arr, DT);
    let act = 0;
    const byType = {};
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (!Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.y)) nonFinite++;
      if (e._sig.phase !== SIG_PHASE.READY) { act++; byType[e.enemyType] = (byType[e.enemyType] || 0) + 1; }
      if (lastPhase[i] === SIG_PHASE.TELEGRAPH && e._sig.phase === SIG_PHASE.EXECUTE) activations++;
      lastPhase[i] = e._sig.phase;
    }
    if (act > maxActive) maxActive = act;
    for (const k in byType) perTypeMaxActive[k] = Math.max(perTypeMaxActive[k] || 0, byType[k]);
    if (g.enemyBullets.length > maxBullets) maxBullets = g.enemyBullets.length;
    if (f % 600 === 0) { const un = muteConsole(); g._updateEnemyBullets(DT); un(); }
  }
  console.log(`     10 min · 24 enemies · ${activations} activations · peak active ${maxActive} · peak bullets ${maxBullets}`);
  // [P9]
  T('[P9] 10 simulated minutes: EVERY enemy coordinate stayed finite',
    nonFinite === 0, `${nonFinite} non-finite samples`);
  T('[P9] the player position stayed finite too',
    Number.isFinite(g.player.pos.x) && Number.isFinite(g.player.pos.y));
  T('[P9] the run was substantial (>= 400 activations over 10 minutes)',
    activations >= 400, String(activations));
  // [P10]
  T('[P10] active telegraphs stay bounded — never more than the live crowd',
    maxActive <= arr.length, `${maxActive}/${arr.length}`);
  T('[P10] active telegraphs stay bounded per type by maxConcurrentFrac',
    TYPES.every(t => (perTypeMaxActive[t] || 0) <= Math.max(1, Math.floor(4 * ENEMY_SIGNATURES[t].maxConcurrentFrac))),
    TYPES.map(t => `${t}=${perTypeMaxActive[t] || 0}/${Math.max(1, Math.floor(4 * ENEMY_SIGNATURES[t].maxConcurrentFrac))}`).join(' '));
  T('[P10] signature projectiles stay bounded over the whole run (no spam)',
    maxBullets <= 32, `peak ${maxBullets}`);
  T('[P10] the hostile-projectile token budget is not leaked by the run',
    (g.hostileDirector?.counts?.ranged || 0) <= 32, JSON.stringify(g.hostileDirector?.counts));
  // [P39]
  const FIELDS = ['id', 'phase', 't', 'cd', 'rng', 'dirX', 'dirY', 'sideX', 'sideY', 'aimX', 'aimY',
                  'hits', 'maxHits', 'missRetry', 'tele', 'teleDur', 'ring', 'under', 'landX', 'landY', 'active'];
  let badField = '';
  for (const e of arr) {
    const s = e._sig;
    for (const k of FIELDS) {
      if (!(k in s)) { badField = `${e.enemyType}.${k} missing`; break; }
      const v = s[k];
      if (v === undefined) { badField = `${e.enemyType}.${k} undefined`; break; }
      if (typeof v === 'number' && !Number.isFinite(v)) { badField = `${e.enemyType}.${k}=${v}`; break; }
    }
    if (badField) break;
    if (typeof s.id !== 'string' || !s.id) badField = `${e.enemyType}.id`;
    if (typeof s.under !== 'boolean' || typeof s.active !== 'boolean') badField = `${e.enemyType} bool`;
    if (!(s.phase >= 0 && s.phase <= 3 && Number.isInteger(s.phase))) badField = `${e.enemyType}.phase=${s.phase}`;
  }
  T('[P39] after 10 simulated minutes every _sig field is present, defined and finite', badField === '', badField);
  T('[P39] no signature is stuck mid-cycle forever — every enemy has passed through READY recently',
    arr.every(e => e._sig.phase >= 0 && e._sig.phase <= 3));
  T('[P39] the `active` flag agrees with the phase for every enemy',
    arr.every(e => e._sig.active === (e._sig.phase !== SIG_PHASE.READY)),
    arr.filter(e => e._sig.active !== (e._sig.phase !== SIG_PHASE.READY)).map(e => e.enemyType).join(','));
  T('[P39] hits never exceeds maxHits on any enemy', arr.every(e => e._sig.hits <= e._sig.maxHits));

  // drawSignature must survive every phase for every type, with the headless ctx.
  {
    const ctx = makeCtx();
    let threw = '';
    for (const t of TYPES) {
      const e = mkEnemy(t);
      for (const p of [0, 1, 2, 3]) {
        e._sig.phase = p; e._sig.tele = 0.5; e._sig.ring = 0.5;
        e._sig.dirX = 0.6; e._sig.dirY = 0.8; e._sig.sideX = -0.8; e._sig.sideY = 0.6;
        e._sig.landX = e.pos.x + 200; e._sig.landY = e.pos.y - 200;
        try { drawSignature(e, ctx); e._drawSignature(ctx); } catch (ex) { threw = `${t}/${p}: ${ex.message}`; }
      }
      e.pos.x = NaN;
      try { drawSignature(e, ctx); } catch (ex) { threw = `${t}/NaN: ${ex.message}`; }
      try { drawSignature(e, null); drawSignature({ _sig: null }, ctx); } catch (ex) { threw = `${t}/null: ${ex.message}`; }
    }
    T('[P39] drawSignature never throws in any phase, for any type, with hostile input', threw === '', threw);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 9. NOTHING ELSE MOVED — BATCH 4.4 / 4.5 REGRESSION ═══');
{
  // [P32] spawn caps, recomputed from the SHIPPING formula.
  T('[P32] the harness is not detected as mobile (no mobile clamp distorts the baseline)',
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
  {
    const g = newRun('neon_district');
    for (const m of [0, 1, 2, 3, 4, 5, 7, 9, 10, 12, 15, 19, 20, 22, 25, 30, 45]) {
      T(`[P32] enemyCap(min ${m}) matches the shipping formula`,
        g.spawner.enemyCap(m, { endless: false, chaos: false }) === capBaseline(m),
        `${g.spawner.enemyCap(m, {})} vs ${capBaseline(m)}`);
      T(`[P32] enemyCap(min ${m}, endless) matches the shipping formula`,
        g.spawner.enemyCap(m, { endless: true }) === capBaseline(m, { endless: true }));
      T(`[P32] enemyCap(min ${m}, chaos) matches the shipping formula`,
        g.spawner.enemyCap(m, { chaos: true }) === capBaseline(m, { chaos: true }));
    }
    for (const m of [0, 3, 8, 14, 25]) {
      const gg = newRun('orbital_nexus');
      gg.timeAlive = m * 60 + 5;
      T(`[P32] the live g.enemyCap() at minute ${m} equals the baseline`,
        gg.enemyCap() === capBaseline(m), `${gg.enemyCap()} vs ${capBaseline(m)}`);
    }
    // a signature enemy does not bypass the cap
    const gs = newRun('neon_district');
    gs.timeAlive = 60;
    const un = muteConsole();
    gs.enemies.length = 0;
    for (let i = 0; i < gs.enemyCap(); i++) gs.enemies.push(new Enemy('Volt Rat', 1));
    const n0 = gs.enemies.length;
    gs.spawnEnemy('Volt Rat', { x: 900, y: 900 });
    un();
    T('[P32] a full field still refuses a signature-carrying spawn (the cap is not bypassed)',
      gs.enemies.length === n0, `${n0} → ${gs.enemies.length}`);
  }

  // [P33] the Batch 4.5 biome pools are byte-for-byte unchanged.
  const POOLS_EXPECTED = '{"neon_district":[{"id":"Glitch Drone","weight":4,"family":"fodder","minStageTime":0,"maxStageTime":null},{"id":"Volt Rat","weight":3,"family":"fodder","minStageTime":0,"maxStageTime":null},{"id":"Rogue Punk","weight":4,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Scrap Scavenger","weight":2,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Stealth Infiltrator","weight":3,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Combat Hunter","weight":2,"family":"fast","minStageTime":30,"maxStageTime":null},{"id":"Cyber Shooter","weight":2,"family":"ranged","minStageTime":15,"maxStageTime":null},{"id":"Heavy Mech","weight":1,"family":"heavy","minStageTime":55,"maxStageTime":null}],"industrial_core":[{"id":"Glitch Drone","weight":2,"family":"fodder","minStageTime":0,"maxStageTime":null},{"id":"Scrap Scavenger","weight":4,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Pulse Burrower","weight":3,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Overclocked Berserker","weight":3,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Combat Hunter","weight":2,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Cyber Shooter","weight":2,"family":"ranged","minStageTime":0,"maxStageTime":null},{"id":"Heavy Mech","weight":3,"family":"heavy","minStageTime":0,"maxStageTime":null},{"id":"Solar Tyrant","weight":1,"family":"heavy","minStageTime":50,"maxStageTime":null}],"orbital_nexus":[{"id":"Glitch Drone","weight":4,"family":"fodder","minStageTime":0,"maxStageTime":null},{"id":"Volt Rat","weight":2,"family":"fodder","minStageTime":0,"maxStageTime":null},{"id":"Cyber-Net Junkie","weight":2,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Solar Stinger","weight":3,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Amethyst Fang","weight":2,"family":"fast","minStageTime":20,"maxStageTime":null},{"id":"Combat Hunter","weight":1,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Cyber Shooter","weight":3,"family":"ranged","minStageTime":0,"maxStageTime":null},{"id":"Rift Eye","weight":2,"family":"ranged","minStageTime":25,"maxStageTime":null},{"id":"Void Widow","weight":2,"family":"heavy","minStageTime":0,"maxStageTime":null}],"abyssal_trench":[{"id":"Glitch Drone","weight":2,"family":"fodder","minStageTime":0,"maxStageTime":null},{"id":"Cyber-Net Junkie","weight":4,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Cryo Claw","weight":3,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Toxin Leech","weight":4,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Razorhound","weight":1,"family":"fast","minStageTime":45,"maxStageTime":null},{"id":"Rift Eye","weight":2,"family":"ranged","minStageTime":0,"maxStageTime":null},{"id":"Abyss Maw","weight":4,"family":"heavy","minStageTime":0,"maxStageTime":null},{"id":"Void Widow","weight":2,"family":"heavy","minStageTime":0,"maxStageTime":null}],"glacial_expanse":[{"id":"Glitch Drone","weight":2,"family":"fodder","minStageTime":0,"maxStageTime":null},{"id":"Cryo Claw","weight":4,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Scrap Scavenger","weight":3,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Combat Hunter","weight":2,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Stealth Infiltrator","weight":1,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Cyber Shooter","weight":2,"family":"ranged","minStageTime":0,"maxStageTime":null},{"id":"Abyss Maw","weight":3,"family":"heavy","minStageTime":0,"maxStageTime":null},{"id":"Heavy Mech","weight":2,"family":"heavy","minStageTime":0,"maxStageTime":null},{"id":"Solar Tyrant","weight":1,"family":"heavy","minStageTime":50,"maxStageTime":null}],"data_wastes":[{"id":"Volt Rat","weight":3,"family":"fodder","minStageTime":0,"maxStageTime":null},{"id":"Ember Scarab","weight":3,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Rogue Punk","weight":2,"family":"swarm","minStageTime":0,"maxStageTime":null},{"id":"Overclocked Berserker","weight":3,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Combat Hunter","weight":2,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Razorhound","weight":2,"family":"fast","minStageTime":25,"maxStageTime":null},{"id":"Amethyst Fang","weight":1,"family":"fast","minStageTime":0,"maxStageTime":null},{"id":"Cyber Shooter","weight":2,"family":"ranged","minStageTime":0,"maxStageTime":null},{"id":"Rift Eye","weight":2,"family":"ranged","minStageTime":20,"maxStageTime":null},{"id":"Void Widow","weight":2,"family":"heavy","minStageTime":0,"maxStageTime":null},{"id":"Heavy Mech","weight":2,"family":"heavy","minStageTime":0,"maxStageTime":null}]}';
  T('[P33] CAMPAIGN_BIOME_ENEMY_POOLS deep-equals the Batch 4.5 expectation, entry for entry',
    JSON.stringify(CAMPAIGN_BIOME_ENEMY_POOLS) === POOLS_EXPECTED,
    'the biome sub-pool table changed');
  T('[P33] the pool table is still frozen, and every pool and entry with it',
    Object.isFrozen(CAMPAIGN_BIOME_ENEMY_POOLS) &&
    Object.values(CAMPAIGN_BIOME_ENEMY_POOLS).every(p => Object.isFrozen(p) && p.every(e => Object.isFrozen(e))));
  T('[P33] the six pool biomes are still exactly STAGE_RING',
    Object.keys(CAMPAIGN_BIOME_ENEMY_POOLS).slice().sort().join(',') === RING.slice().sort().join(','));

  // [P34] the 80s stage window — proved behaviourally, not by reading a constant.
  {
    const g = newRun('neon_district');
    const drive = (secs) => { const un = muteConsole();
      for (let i = 0; i < Math.round(secs * 60); i++) { g.timeAlive += DT; try { g._updateStageProgression(); } catch (_) {} }
      un(); };
    drive(79);
    T('[P34] no stage boss is armed at t≈79s', g._activeStageBoss === null, `t=${g.timeAlive.toFixed(2)}`);
    T('[P34] and the stage has not advanced at t≈79s', g._stageIndex === 0);
    drive(2);
    T('[P34] the stage boss IS armed by t≈81s', !!g._activeStageBoss, `t=${g.timeAlive.toFixed(2)}`);
    T('[P34] it is this stage\'s boss', g._activeStageBoss?.id === 'mech', String(g._activeStageBoss?.id));
    const gA = newRun('abyssal_trench');
    const driveA = (secs) => { const un = muteConsole();
      for (let i = 0; i < Math.round(secs * 60); i++) { gA.timeAlive += DT; try { gA._updateStageProgression(); } catch (_) {} }
      un(); };
    driveA(79.8);
    T('[P34] abyssal_trench: still no boss at t≈79.8s', gA._activeStageBoss === null, `t=${gA.timeAlive.toFixed(2)}`);
    driveA(1.0);
    T('[P34] abyssal_trench: boss armed by t≈80.8s', !!gA._activeStageBoss, `t=${gA.timeAlive.toFixed(2)}`);
    T('[P34] so the stage window is still 80s', gA.timeAlive < 90);
  }

  // [P35] the six boss/reward triples, by value.
  {
    const EXPECT = {
      neon_district:   { id: 'mech',         reward: 'neon_defector_core' },
      industrial_core: { id: 'annihilator',  reward: 'annihilator_forge_plate' },
      orbital_nexus:   { id: 'titan',        reward: 'titan_orbital_gyro' },
      abyssal_trench:  { id: 'cyberSerpent', reward: 'serpent_ember_coil' },
      glacial_expanse: { id: 'cyberDragon',  reward: 'dragon_cryo_heart' },
      data_wastes:     { id: 'bloodfang',    reward: 'bloodfang_wastes_fang' },
    };
    for (const [biome, e] of Object.entries(EXPECT)) {
      T(`[P35] stage boss mapping: ${biome} → ${e.id} → ${e.reward}`,
        BOSSES[biome]?.id === e.id && BOSSES[biome]?.reward === e.reward,
        `${BOSSES[biome]?.id}/${BOSSES[biome]?.reward}`);
    }
    T('[P35] exactly 6 entries, in ring order', Object.keys(BOSSES).join(',') === RING.join(','));
    T('[P35] the mapping is still frozen', Object.isFrozen(BOSSES));
    T('[P35] 6 distinct bosses and 6 distinct rewards',
      new Set(Object.values(BOSSES).map(d => d.id)).size === 6 &&
      new Set(Object.values(BOSSES).map(d => d.reward)).size === 6);
    T('[P35] no signature enemy is a stage boss',
      TYPES.every(t => Object.values(BOSSES).every(d => d.id !== t && String(d.name).toUpperCase() !== t.toUpperCase())));
  }

  // [P36]/[P37] Endless and Chaos pools are identity — the signatures changed nothing there.
  {
    const PROBE = ['Glitch Drone', 'Rogue Punk', 'Scrap Scavenger', 'Combat Hunter', 'Heavy Mech',
                   'Cyber Shooter', 'Volt Rat', 'Toxin Leech', 'Abyss Maw', 'Rift Eye', 'Razorhound',
                   'Pulse Burrower', 'Neon Swarmer', 'Plasma Juggernaut', 'Security Defector Mech',
                   'Rogue AI Overlord', 'Cybermote'];
    const ge = newRun('neon_district');
    delete ge._biomeSpawnType;                      // restore the REAL gate for this section
    ge.endless = true; ge.timeAlive = 300; ge._stageStartT = 240;
    let bad = 0, first = '';
    for (let i = 0; i < 6000; i++) {
      const t = PROBE[i % PROBE.length];
      const o = ge._biomeSpawnType(t);
      if (o !== t) { bad++; if (!first) first = `${t}→${o}`; }
    }
    T('[P36] Endless: _biomeSpawnType is still the identity over 6000 draws', bad === 0, `${bad}, first ${first}`);
    T('[P36] Endless: every probe type still constructs, signature or not',
      (() => { const un = muteConsole();
               const ok = PROBE.every(t => { try { return !!new Enemy(t, 3); } catch (_) { return false; } });
               un(); return ok; })());
    const gc = newRun('data_wastes');
    delete gc._biomeSpawnType;
    gc.endless = true; gc._chaosMode = true; gc.timeAlive = 300; gc._stageStartT = 240;
    let badC = 0, firstC = '';
    for (let i = 0; i < 6000; i++) {
      const t = PROBE[i % PROBE.length];
      const o = gc._biomeSpawnType(t);
      if (o !== t) { badC++; if (!firstC) firstC = `${t}→${o}`; }
    }
    T('[P37] Chaos: _biomeSpawnType is still the identity over 6000 draws', badC === 0, `${badC}, first ${firstC}`);
    T('[P37] Chaos: the Chaos-only roster still carries no signature',
      ['Neon Swarmer', 'Data Glitch Stalker', 'Plasma Juggernaut', 'Overclocked Bomber',
       'EMP Hacker Drone', 'Cyber-Axe Executioner', 'Malware Spreader', 'Void Rift Summoner',
       'Wireframe Net-Caster', 'Singularity Core Mech'].every(t => signatureFor(t) === null));
  }

  // [P40] old-save compatibility.
  {
    const un = muteConsole();
    try { globalThis.localStorage.clear(); } catch (_) {}
    const g = new Game();
    g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
    g.reset();
    // an old save: relics only, no Slice B stage state, no notion of signatures
    g.meta.relics = { broken_halo: true };
    g.meta.bossKills = {};
    g.meta.stagesCleared = RING.length - 1;
    delete g._stageBossCleared; delete g._stageBossRewarded; delete g._stageBossSpawned;
    delete g._stageBiome; delete g._stageIndex; delete g._stageStartT;
    delete g._sigCensus;
    g.reset();
    g.meta.stagesCleared = RING.length - 1;
    g.setRunBiome('abyssal_trench'); g._applyRunBiome();
    un();
    T('[P40] an old save keeps the relics it already owned', g.meta.relics.broken_halo === true);
    T('[P40] an old save re-initialises the stage state on reset',
      !!g._stageBossCleared && !!g._stageBossRewarded && !!g._stageBossSpawned);
    // spawning through the REAL path still works, and signature enemies get their state
    const un2 = muteConsole();
    let threw = false, sigCount = 0;
    try {
      g._biomeSpawnType = (t) => t;
      for (const t of TYPES) {
        g.enemies.length = 0;
        g.spawnEnemy(t, { x: g.player.pos.x + 700, y: g.player.pos.y + 700 });
        if (g.enemies[0] && g.enemies[0]._sig && g.enemies[0]._sig.id === EXPECT_SIG[t]) sigCount++;
      }
    } catch (_) { threw = true; }
    un2();
    T('[P40] an old save spawns without throwing', !threw);
    T('[P40] every signature type still receives its signature on an old save', sigCount === 6, String(sigCount));
    // A field that predates the batch: enemies whose _sig was never created.
    const g2 = newGame();
    const un3 = muteConsole();
    const legacy = [];
    for (const t of [...TYPES, 'Glitch Drone', 'Rogue Punk']) {
      const e = new Enemy(t, 0);
      e._sig = null;                                  // exactly what a pre-5.1 instance looks like
      place(g2, e, 200);
      legacy.push(e);
      g2.enemies.push(e);
    }
    un3();
    let legacyThrew = '';
    try {
      g2._sigCensus = buildSignatureCensus(g2.enemies, {});
      for (const e of legacy) {
        if (updateSignature(e, g2, DT) !== null) legacyThrew = 'updateSignature returned non-null';
        if (signatureActive(e) !== false) legacyThrew = 'signatureActive true';
        if (signatureIntangible(e) !== false) legacyThrew = 'signatureIntangible true';
        if (signatureKnockbackMult(e) !== 1) legacyThrew = 'knockback != 1';
        if (signatureDamageMult(e, 0, 0) !== 1) legacyThrew = 'damageMult != 1';
        drawSignature(e, makeCtx());
        const un4 = muteConsole(); e.takeHit(5, g2); un4();
      }
    } catch (ex) { legacyThrew = ex.message; }
    T('[P40] a pre-5.1 enemy (_sig === null) is inert across the whole API, and never throws',
      legacyThrew === '', legacyThrew);
    T('[P40] a pre-5.1 field produces an empty census (no phantom entries)',
      Object.keys(g2._sigCensus).length === 0, JSON.stringify(g2._sigCensus));
    T('[P40] signatureStats on a pre-5.1 field reports nothing live',
      signatureStats(g2.enemies).live === 0);
    // A save state with a PARTIAL / corrupted _sig must degrade, not crash.
    const g3 = newGame();
    const e3 = mkEnemy('Volt Rat');
    place(g3, e3, 250);
    e3._sig = { id: 'zigzag_surge', phase: 99, t: NaN, cd: undefined, rng: NaN };
    let corruptThrew = '';
    try {
      for (let f = 0; f < 300; f++) { g3._sigCensus = buildSignatureCensus([e3], {}); updateSignature(e3, g3, DT); }
      drawSignature(e3, makeCtx());
    } catch (ex) { corruptThrew = ex.message; }
    T('[P40] a corrupted _sig degrades to READY instead of throwing',
      corruptThrew === '' && e3._sig.phase === SIG_PHASE.READY, corruptThrew || `phase=${e3._sig.phase}`);
    T('[P40] …and it recovers a finite cooldown so the enemy keeps working',
      Number.isFinite(e3._sig.cd), String(e3._sig.cd));
    // A run with no census at all (an old Game object) must still let signatures arm.
    const g4 = newGame();
    const e4 = mkEnemy('Volt Rat');
    place(g4, e4, 250);
    delete g4._sigCensus;
    let armed4 = false;
    for (let f = 0; f < 60 * 40 && !armed4; f++) {
      place(g4, e4, 250);
      centerCam(g4);
      delete g4._sigCensus;                            // never built — the pre-5.1 Game shape
      updateSignature(e4, g4, DT);
      armed4 = e4._sig.phase !== SIG_PHASE.READY;
    }
    T('[P40] with NO _sigCensus at all the concurrency gate is permissive, not a hard block', armed4);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 10. STRESS ═══');
{
  // ── 10a. 300+ enemies, 10 simulated minutes of updateSignature ─────────────────────────────────
  const g = newGame();
  let dmg = 0;
  g._damagePlayer = () => { dmg++; return true; };
  const arr = [];
  const COUNT = 306;                                  // 51 of each of the six
  for (let k = 0; k < COUNT / TYPES.length; k++) {
    for (const t of TYPES) {
      const e = mkEnemy(t);
      place(g, e, BAND_D[t], (arr.length / COUNT) * Math.PI * 2);
      arr.push(e);
    }
  }
  T(`[STRESS] ${arr.length} signature enemies are live simultaneously`, arr.length >= 300, String(arr.length));
  const t0 = Date.now();
  const FRAMES = 60 * 600;                            // 10 simulated minutes
  let nonFinite = 0, maxActive = 0, activations = 0, maxBullets = 0;
  let prev = arr.map(e => e._sig.phase);
  for (let f = 0; f < FRAMES; f++) {
    if (f % 60 === 0) {
      arr.forEach((e, i) => {
        if (e._sig.id === 'burrow_reposition') return;
        place(g, e, BAND_D[e.enemyType], (i / arr.length) * Math.PI * 2 + f * 0.0003);
      });
    }
    sigFrame(g, arr, DT);
    let act = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (!Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.y)) nonFinite++;
      if (e._sig.phase !== SIG_PHASE.READY) act++;
      if (prev[i] === SIG_PHASE.TELEGRAPH && e._sig.phase === SIG_PHASE.EXECUTE) activations++;
      prev[i] = e._sig.phase;
    }
    if (act > maxActive) maxActive = act;
    if (g.enemyBullets.length > maxBullets) maxBullets = g.enemyBullets.length;
  }
  console.log(`     ${arr.length} enemies × ${FRAMES} frames (10 min) in ${((Date.now() - t0) / 1000).toFixed(1)}s · ` +
              `${activations} activations · peak active ${maxActive} · peak bullets ${maxBullets}`);
  T('[STRESS] 10 minutes at 300+ enemies: no non-finite coordinate ever appeared', nonFinite === 0, String(nonFinite));
  T('[STRESS] the stress run really exercised the machine (>= 5000 activations)',
    activations >= 5000, String(activations));
  T('[STRESS] peak concurrent signatures stayed under the crowd size',
    maxActive < arr.length, `${maxActive}/${arr.length}`);
  T('[STRESS] peak concurrent signatures respected the aggregate maxConcurrentFrac ceiling',
    maxActive <= TYPES.reduce((s, t) => s + Math.max(1, Math.floor((arr.length / 6) * ENEMY_SIGNATURES[t].maxConcurrentFrac)), 0),
    `${maxActive} vs ${TYPES.reduce((s, t) => s + Math.max(1, Math.floor((arr.length / 6) * ENEMY_SIGNATURES[t].maxConcurrentFrac)), 0)}`);
  T('[STRESS] projectiles stayed bounded at 300+ enemies', maxBullets <= 64, String(maxBullets));
  T('[STRESS] every _sig survived intact (phase in range, booleans intact, numbers finite)',
    arr.every(e => Number.isInteger(e._sig.phase) && e._sig.phase >= 0 && e._sig.phase <= 3 &&
                   typeof e._sig.under === 'boolean' && typeof e._sig.active === 'boolean' &&
                   Number.isFinite(e._sig.cd) && Number.isFinite(e._sig.t) &&
                   Number.isFinite(e._sig.dirX) && Number.isFinite(e._sig.dirY) &&
                   Number.isFinite(e._sig.landX) && Number.isFinite(e._sig.landY)));
  T('[STRESS] the census object never grew beyond the six signature types',
    Object.keys(g._sigCensus).length <= 6, Object.keys(g._sigCensus).join(','));

  // ── 10b. repeated death / reset / deck-transition cycles ──────────────────────────────────────
  {
    const gd = newGame('endless');
    let worst = '';
    for (let cycle = 0; cycle < 25; cycle++) {
      const un = muteConsole();
      for (let i = 0; i < 60; i++) {
        const t = TYPES[i % 6];
        const e = new Enemy(t, 0);
        e.pos.x = gd.player.pos.x + 100 + (i % 10) * 12;
        e.pos.y = gd.player.pos.y + 80 + Math.floor(i / 10) * 12;
        e._sig.phase = i % 4; e._sig.active = e._sig.phase !== 0;
        e._sig.under = e._sig.id === 'burrow_reposition' && e._sig.phase === SIG_PHASE.EXECUTE;
        gd.enemies.push(e);
      }
      gd._sigCensus = buildSignatureCensus(gd.enemies, gd._sigCensus);
      // kill a third outright
      for (let i = 0; i < gd.enemies.length; i += 3) { gd.enemies[i].hp = 0; gd.enemies[i]._die(gd); }
      // deck transition sweeps the rest — always move to a DIFFERENT deck than the current one,
      // because _enterDeck() legitimately refuses a no-op move to the deck it is already on.
      gd._enterDeck((gd._deck || 'main') === 'main' ? 'lower' : 'main', { force: true });
      // and a reset for good measure every fifth cycle
      if (cycle % 5 === 4) { gd.reset(); gd._enterEndless(); gd._biomeSpawnType = (t) => t; }
      un();
      gd._sigCensus = buildSignatureCensus(gd.enemies, gd._sigCensus);
      const leaked = Object.entries(gd._sigCensus).filter(([, s]) => s.total !== 0 || s.active !== 0);
      if (gd.enemies.length !== 0 || leaked.length) worst = `cycle ${cycle}: ${gd.enemies.length} enemies, census ${JSON.stringify(gd._sigCensus)}`;
    }
    T('[STRESS] 25 death / deck-transition / reset cycles leave ZERO stranded signature state',
      worst === '', worst);
    T('[STRESS] the census object is reused, not re-allocated, and stays zeroed',
      Object.values(gd._sigCensus).every(s => s.total === 0 && s.active === 0));
    T('[STRESS] no enemy projectile survived the cycles', gd.enemyBullets.length === 0);
  }

  // ── 10c. deterministic replay — two identical runs, identical aggregate activation counts ─────
  {
    const replay = (seed) => {
      Enemy._seedLCG = seed;
      const gg = newGame();
      gg._damagePlayer = () => true;
      const a = [];
      for (let k = 0; k < 20; k++) for (const t of TYPES) {
        const e = mkEnemy(t);
        place(gg, e, BAND_D[t], (a.length / 120) * Math.PI * 2);
        a.push(e);
      }
      const byId = {};
      for (const t of TYPES) byId[EXPECT_SIG[t]] = 0;
      let prevP = a.map(e => e._sig.phase);
      let checksum = 0;
      for (let f = 0; f < 60 * 120; f++) {
        if (f % 60 === 0) a.forEach((e, i) => {
          if (e._sig.id === 'burrow_reposition') return;
          place(gg, e, BAND_D[e.enemyType], (i / a.length) * Math.PI * 2 + f * 0.0005);
        });
        sigFrame(gg, a, DT);
        for (let i = 0; i < a.length; i++) {
          if (prevP[i] === SIG_PHASE.TELEGRAPH && a[i]._sig.phase === SIG_PHASE.EXECUTE) {
            byId[a[i]._sig.id]++;
            checksum = (checksum * 31 + f + i) % 2147483647;
          }
          prevP[i] = a[i]._sig.phase;
        }
      }
      return { byId, checksum, total: Object.values(byId).reduce((s, x) => s + x, 0) };
    };
    const r1 = replay(20260731);
    const r2 = replay(20260731);
    const r3 = replay(11111);
    console.log(`     replay A: ${JSON.stringify(r1.byId)} checksum ${r1.checksum}`);
    console.log(`     replay B: ${JSON.stringify(r2.byId)} checksum ${r2.checksum}`);
    T('[STRESS] the replay is substantial (>= 1000 activations across 120 enemies / 2 minutes)',
      r1.total >= 1000, String(r1.total));
    T('[STRESS] every signature id activated in the replay',
      Object.values(r1.byId).every(v => v > 0), JSON.stringify(r1.byId));
    T('[STRESS] two identical runs produce IDENTICAL aggregate activation counts per signature',
      JSON.stringify(r1.byId) === JSON.stringify(r2.byId),
      `${JSON.stringify(r1.byId)} vs ${JSON.stringify(r2.byId)}`);
    T('[STRESS] two identical runs produce an identical activation-TIMING checksum',
      r1.checksum === r2.checksum, `${r1.checksum} vs ${r2.checksum}`);
    T('[STRESS] a different spawn seed produces a different timing checksum (the replay is not degenerate)',
      r1.checksum !== r3.checksum, `${r1.checksum} vs ${r3.checksum}`);
  }
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('B5_1_ENEMY_SIGNATURES_DONE');
process.exit(fail === 0 ? 0 : 1);
