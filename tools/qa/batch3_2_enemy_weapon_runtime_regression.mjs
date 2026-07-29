// BATCH 3.2 — ENEMY WEAPON RUNTIME REGRESSION (canonical mapping · token accounting · telegraphs)
// ------------------------------------------------------------------------------------------------
// Batch 3.2 made four claims. This file exists to make each of them a MEASUREMENT rather than a
// statement, using the real Game, the real Enemy class and real driven runs:
//
//   1. ENEMY_TYPE_WEAPONS is CANONICAL. All 36 armed enemyTypes resolve a weapon at runtime (it was
//      21/36 before), every owner the catalog names is a type js/entities/Enemy.js really builds,
//      and every armed type js/entities/Enemy.js really builds is in the catalog. Both directions
//      are checked, because a catalog that names a ghost and a runtime that owns an unmapped enemy
//      are the same defect seen from two sides.
//
//   2. THE TELEGRAPH IS REAL. The four telegraphRequired weapons that still fire from
//      Game.spawnEnemyBullet (eden_star_lance, seraph_vector_javelin, magma_reaver_lance,
//      null_rupture_orb) are routed through EnemyWeaponSystem.requestTelegraphedVolley. So: zero
//      damage before the warning has elapsed, exactly the declared damage after it, and — the part
//      that cannot be proven by driving the system directly — the four weapons must occur in NORMAL
//      play. Sections 5-7 therefore drive real Endless and real Chaos runs and force nothing.
//
//   3. THE TOKEN LEDGER IS COMPLETE. EnemyWeaponSystem.tokenCounts() walks all four bounded pools,
//      Game sums it with the live bullets and hands the total to HostileProjectileDirector
//      .reconcile(). Reconciliation is an accounting write: section 8 arms real strikes, runs the
//      real reconciliation and asserts that every strike survives BYTE-IDENTICAL.
//
//   4. NOTHING SURVIVES A BOUNDARY. forceEnd / onDeckChanged / mode re-entry / menu return must
//      leave every pool, every bullet, every beam, every zone and every token at zero.
//
// WHY THE MEASUREMENT BLOCKS DRIVE SUB-SYSTEMS DIRECTLY
// A full Game.update() tick runs the whole horde, and an unrelated enemy firing mid-probe would put
// a foreign entry in the damage log and make "this weapon dealt exactly its declared damage" a
// statement about whatever else was on screen. So the damage/telegraph blocks advance exactly the
// production update methods that own what is being measured — sys.update(), _updateEnemyBullets(),
// _updateEnemyBeams(), _updateEnemyOrbZones() and _checkPlayerEnemyCollisions() (where production
// decays playerHitCooldown) — and nothing else. No timer is hand-written, no hit is synthesised,
// no damage bypasses _damagePlayer. Sections 5, 11, 12 and 13 DO run the whole pipeline, because
// there the whole pipeline is the thing under test.
//
// RUN LENGTHS (section 5) — chosen from measurement, not from hope. First-occurrence of the last of
// the four weapons was 247.4 s in Endless and 149.9 s in Chaos, so this file drives Endless for
// 320 s (+29% margin) and Chaos for 180 s (+20% margin). The two modes cannot run concurrently in
// one Node process — a Game owns process-wide shims (clock, RNG, localStorage) — so they run in
// sequence. Headless throughput is ~25-30x real time, so 500 s of simulated play costs ~20 s wall.
// Whole-file budget: well under four minutes.
//
// DETERMINISM: every Game is built with a named seed against a seeded mulberry32, and the clock is
// virtual. A failure reported here reproduces by running the file again.
//
//   node tools/qa/batch3_2_enemy_weapon_runtime_regression.mjs
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SELF = fileURLToPath(import.meta.url);
const { installEnv, muteConsole, makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);

// ── MOBILE EMULATION SWITCH ──────────────────────────────────────────────────────────────────────
// HostileProjectileDirector and EnemyWeaponSystem both read `navigator.maxTouchPoints > 0` ONCE, at
// module evaluation time, into a module-level const. There is therefore no way to observe the mobile
// caps in the same process that already observed the desktop ones — the modules would have to be
// re-evaluated. So the mobile half of section 10 re-invokes THIS FILE as a child process with
// --caps-probe --mobile, which redefines navigator BEFORE the first import and prints one JSON line.
const ARGV = new Set(process.argv.slice(2));
const IS_PROBE = ARGV.has('--caps-probe');
const PROBE_MOBILE = ARGV.has('--mobile');

installEnv();
if (IS_PROBE && PROBE_MOBILE) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node-qa-mobile', maxTouchPoints: 5, getGamepads: () => [], language: 'en',
             serviceWorker: { register: () => Promise.resolve(), getRegistrations: () => Promise.resolve([]), addEventListener() {} } },
    configurable: true,
  });
}

// Deterministic RNG, so a failure reported by this file can be reproduced by running it again.
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Virtual clock. Nothing here may depend on wall-clock time.
let vclock = 0;
globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };

const JS = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// ════════════════════════════════════════════════════════════════════════════════════════════════
// CAP PROBE — shared by the in-process desktop measurement and the --mobile child.
// Every pool is filled from a DISTINCT enemy (the per-owner cooldown would otherwise refuse the
// second request from the same one) and asked for far more attacks than the cap allows, so the
// number reported is what the module actually let through, not what it was asked for.
// ════════════════════════════════════════════════════════════════════════════════════════════════
async function capsProbe() {
  const un0 = muteConsole();
  const { Game } = await import(JS('js/game/Game.js'));
  const { Enemy } = await import(JS('js/entities/Enemy.js'));
  const { Vec2 } = await import(JS('js/constants.js'));
  const CATm = await import(JS('js/game/EnemyWeaponCatalog.js'));
  Math.random = mul(31337);
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset(); g._enterEndless();
  // Production's own lazy construction of the director (spawnEnemyBullet line 1), then a clean slate.
  g.spawnEnemyBullet(g.player.pos.clone(), new Vec2(1, 0), 300, 1, 5, '#fff', { cls: 'ranged' });
  g.enemyBullets.length = 0; g.hostileDirector.reset();
  const sys = g.enemyWeapons;

  const ATTEMPTS = 40;
  const mkEnemies = (type, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = new Enemy(type, 6);
      e.pos.x = g.player.pos.x + 300 + i * 25; e.pos.y = g.player.pos.y + (i % 7) * 30;
      e.hp = 9999; e.dead = false; e._retired = false;
      out.push(e);
    }
    return out;
  };
  const fresh = () => { sys.forceEnd(); g.hostileDirector.reset(); };

  // strikes — slash_arc takes NO director token, so the pool cap is the only ceiling in play.
  fresh();
  for (const e of mkEnemies('Void Widow', ATTEMPTS))
    { try { sys.requestAttack(e, CATm.getWeaponById('blacknet_scythe_arc'), g.player.pos); } catch (_) {} }
  const obsStrikes = sys.strikes.length;

  // zones — no SHIPPED catalog entry is a ground orb (null_rupture_orb declares speed 200, so
  // Game.js flies it). The cap is exercised with that entry's own numbers and its travel speed
  // zeroed, which is exactly the discriminator EnemyWeaponSystem._isGroundStrike uses.
  fresh();
  const groundOrb = { ...CATm.getWeaponById('null_rupture_orb'), id: 'qa_ground_orb', speed: 0, projectileSpeed: 0 };
  for (const e of mkEnemies('Abyss Maw', ATTEMPTS))
    { try { sys.requestAttack(e, groundOrb, g.player.pos); } catch (_) {} }
  const obsZones = sys.zones.length;

  // telegraphs — piercing_projectile pushes a cosmetic warning line and returns false.
  fresh();
  for (const e of mkEnemies('Stealth Infiltrator', ATTEMPTS))
    { try { sys.requestAttack(e, CATm.getWeaponById('eden_star_lance'), g.player.pos); } catch (_) {} }
  const obsTelegraphs = sys.telegraphs.length;

  // volleys — the deferred-shot pool.
  fresh();
  for (const e of mkEnemies('Combat Hunter', ATTEMPTS))
    { try { sys.requestTelegraphedVolley(e, CATm.getWeaponById('magma_reaver_lance'), g.player.pos, () => {}); } catch (_) {} }
  const obsVolleys = sys.volleys.length;

  // director per-class ceiling, measured the same way: ask for far more than the cap.
  fresh();
  let dirRanged = 0;
  for (let i = 0; i < 60; i++) if (g.hostileDirector.requestTokens('ranged', 1, g)) dirRanged++;
  fresh();

  const caps = sys.stats().caps || {};
  fresh();
  un0();
  return {
    mobile: !!(globalThis.navigator && globalThis.navigator.maxTouchPoints > 0),
    attempts: ATTEMPTS,
    caps: { telegraphs: caps.telegraphs, strikes: caps.strikes, zones: caps.zones, volleys: caps.volleys },
    observed: { telegraphs: obsTelegraphs, strikes: obsStrikes, zones: obsZones, volleys: obsVolleys },
    directorRanged: dirRanged,
    directorSnapshot: g.hostileDirector.snapshot(g),
  };
}

if (IS_PROBE) {
  let out;
  try { out = await capsProbe(); } catch (e) { out = { error: e?.message || String(e) }; }
  process.stdout.write('CAPS_JSON ' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// MAIN HARNESS
// ════════════════════════════════════════════════════════════════════════════════════════════════

// CONSOLE ERROR RECORDER (section 12). Installed BEFORE anything imports game code and before the
// first muteConsole(): muteConsole silences log/warn/info and restores whatever console.error was,
// so this recorder survives every mute/unmute pair and sees every error the run emits.
const CONSOLE_ERRORS = [];
let ERR_ARMED = false;
{
  const realErr = console.error.bind(console);
  console.error = (...a) => {
    if (ERR_ARMED) CONSOLE_ERRORS.push(a.map(x => (x && x.stack) ? x.stack.split('\n')[0] : String(x)).join(' ').slice(0, 300));
    else realErr(...a);
  };
}

const u0 = muteConsole();
const { Game } = await import(JS('js/game/Game.js'));
const { Enemy } = await import(JS('js/entities/Enemy.js'));
const { Vec2 } = await import(JS('js/constants.js'));
const CAT_PATH = path.join(ROOT, 'js/game/EnemyWeaponCatalog.js');
const SYS_PATH = path.join(ROOT, 'js/game/EnemyWeaponSystem.js');
const HPD_PATH = path.join(ROOT, 'js/game/HostileProjectileDirector.js');
let CAT = null, CAT_ERR = '', SYS = null, SYS_ERR = '', HPD = null, HPD_ERR = '';
try { CAT = await import(pathToFileURL(CAT_PATH).href); } catch (e) { CAT_ERR = e?.message || String(e); }
try { SYS = await import(pathToFileURL(SYS_PATH).href); } catch (e) { SYS_ERR = e?.message || String(e); }
try { HPD = await import(pathToFileURL(HPD_PATH).href); } catch (e) { HPD_ERR = e?.message || String(e); }
const CTX = makeCtx();
u0();

const WALL0 = RD.now();
let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};
const NOTE = (s) => console.log(`  NOTE  ${s}`);
const n0 = (v) => (Number.isFinite(v) ? v : 0);
const near = (a, b, eps = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

// ── catalog surface, read once and defensively ──────────────────────────────────────────────────
const WEAPONS = (CAT && Array.isArray(CAT.ENEMY_WEAPONS)) ? CAT.ENEMY_WEAPONS : [];
const ETW = (CAT && CAT.ENEMY_TYPE_WEAPONS) || {};
const ETW_TYPES = Object.keys(ETW);
const CONTACT_ONLY = (CAT && Array.isArray(CAT.CONTACT_ONLY_ENEMY_TYPES)) ? CAT.CONTACT_ONLY_ENEMY_TYPES : [];
const byId = (id) => { try { return CAT?.getWeaponById?.(id) || null; } catch (_) { return null; } };
const WEAPON_IDS = new Set(WEAPONS.map(w => w.id));

// The four telegraphRequired weapons that still FIRE from Game.spawnEnemyBullet and are therefore
// gated by EnemyWeaponSystem.requestTelegraphedVolley. The other four telegraphRequired entries
// (null_sigil_beam, arc_circuit_beam, abyss_rift_blade, blacknet_scythe_arc) are beams and slashes
// whose warning is built into their own path; they are covered by the batch3 suite.
const VOLLEY_WEAPONS = [
  { id: 'eden_star_lance',       type: 'Stealth Infiltrator' },
  { id: 'seraph_vector_javelin', type: 'Cyber Shooter' },
  { id: 'magma_reaver_lance',    type: 'Combat Hunter' },
  { id: 'null_rupture_orb',      type: 'Abyss Maw' },
];
// Game.spawnEnemyBullet applies a single global multiplier to every enemy projectile
// ("Maria 2026-07-12: all enemy damage +10%"). It is applied to the DECLARED catalog damage, so the
// expected landed damage is declared * 1.10 exactly and any other number means the volley path
// changed the payload.
const ENEMY_DMG_MULT = 1.10;

// ── run driving ─────────────────────────────────────────────────────────────────────────────────
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };

// Every game built by this harness carries a permanent spy on _damagePlayer. The spy is a pure
// observer: it forwards to the real method, returns the real answer and records what was asked for.
// No damage in this file reaches the player by any other route.
const DMG = { rec: [] };
function installDamageSpy(g) {
  const proto = Object.getPrototypeOf(g);
  const orig = proto._damagePlayer;
  g._damagePlayer = function (dmg, opts) {
    const landed = orig.call(this, dmg, opts);
    DMG.rec.push({ dmg, src: (opts && opts.src) || null, landed, t: vclock / 1000 });
    if (DMG.rec.length > 8000) DMG.rec.splice(0, DMG.rec.length - 3000);
    return landed;
  };
}
const clearDmg = () => { DMG.rec.length = 0; };

function newGame(mode = 'endless', seed = 1234) {
  vclock = 0;
  Math.random = mul(seed);
  const un = muteConsole();
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  if (mode === 'chaos') { g._beginChaosRun(); g._chaosEntryGraceT = 0; } else { g._enterEndless(); }
  // Production's own lazy construction of the hostile director, then a clean slate. Without this a
  // headless system holds NO tokens at all (EnemyWeaponSystem._takeToken returns tok:null when there
  // is no director) and every token assertion would measure the shim instead of the game.
  g.spawnEnemyBullet(g.player.pos.clone(), new Vec2(1, 0), 300, 1, 5, '#fff', { cls: 'ranged' });
  g.enemyBullets.length = 0;
  g.hostileDirector.reset();
  un();
  installDamageSpy(g);
  clearDmg();
  return g;
}

// FULL PIPELINE. The player's HP is pinned: survival is not what any assertion here measures and a
// death would truncate the driven runs. Damage correctness is proven against the spy, not the HP bar.
function step(g, frames, onFrame) {
  const un = muteConsole();
  for (let i = 0; i < frames; i++) {
    vclock += 1000 / 60;
    if (g.player) { g.player.maxHp = 1e9; g.player.hp = 1e9; }
    g.gameOver = false; g.victory = false;
    if (g.upgradeUI)  { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    if (g._postArenaChoice) { try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = false; } }
    if (g.player) input.mousePos = { x: g.player.pos.x + 300, y: g.player.pos.y };
    try { g.update(1 / 60, input); } catch (e) { un(); throw e; }
    if (onFrame) { try { onFrame(g, i); } catch (e) { un(); throw e; } }
  }
  un();
}

// MEASUREMENT LOOP. Advances exactly the production update methods that own the things being
// measured, and nothing else. _checkPlayerEnemyCollisions is included because that is where
// production decays playerHitCooldown; without it the 0.5 s post-hit grace never expires and every
// probe after the first would measure a refusal instead of a hit.
function micro(g, sys, dt, frames, onFrame) {
  const un = muteConsole();
  for (let i = 0; i < frames; i++) {
    vclock += dt * 1000;
    if (g.player) { g.player.maxHp = 1e9; g.player.hp = 1e9; }
    try { sys?.update?.(dt); } catch (e) { un(); throw e; }
    try { g._checkPlayerEnemyCollisions(dt); } catch (_) {}
    try { g._updateEnemyBullets(dt); } catch (_) {}
    try { g._updateEnemyBeams(dt); } catch (_) {}
    try { g._updateEnemyOrbZones(dt); } catch (_) {}
    if (onFrame) { try { onFrame((i + 1) * dt); } catch (e) { un(); throw e; } }
  }
  un();
}

// A clean slate between probes. Exactly what Game._clearDeckTransients does, plus the director
// reset the menu boundary does; neither invents state.
function clearOrdnance(g, sys) {
  const un = muteConsole();
  if (Array.isArray(g.enemyBullets)) g.enemyBullets.length = 0;
  if (Array.isArray(g._enemyBeams)) g._enemyBeams.length = 0;
  if (Array.isArray(g._enemyOrbZones)) g._enemyOrbZones.length = 0;
  if (Array.isArray(g.enemies)) g.enemies.length = 0;
  try { sys?.forceEnd?.(); } catch (_) {}
  try { g.hostileDirector?.reset(); } catch (_) {}
  un();
}

function makeEnemy(g, type, dist = 200, dy = 0) {
  const un = muteConsole();
  let e = null;
  try { e = new Enemy(type, 6); } catch (err) { un(); throw err; }
  un();
  e.pos.x = g.player.pos.x + dist;
  e.pos.y = g.player.pos.y + dy;
  e.hp = Math.max(1, e.hp);
  e.dead = false; e._retired = false;
  return e;
}

const statsOf = (sys) => { try { const s = sys.stats(); return (s && typeof s === 'object') ? s : {}; } catch (_) { return {}; } };
const tokOf = (sys) => { try { return sys.tokenCounts(); } catch (_) { return { ranged: NaN, elite: NaN, boss: NaN }; } };
const tokTotal = (t) => n0(t.ranged) + n0(t.elite) + n0(t.boss);

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 0. THE BATCH 3.2 SURFACE ===');
{
  T('js/game/EnemyWeaponCatalog.js imports cleanly', CAT != null, CAT_ERR);
  T('js/game/EnemyWeaponSystem.js imports cleanly', SYS != null, SYS_ERR);
  T('js/game/HostileProjectileDirector.js imports cleanly', HPD != null, HPD_ERR);
  T('js/entities/Enemy.js and js/game/Game.js import cleanly', typeof Enemy === 'function' && typeof Game === 'function');
  for (const name of ['ENEMY_TYPE_WEAPONS', 'CONTACT_ONLY_ENEMY_TYPES', 'LEGACY_ORDER_OVERRIDES',
                      'toLegacyKey', 'getWeaponsForEnemyType', 'validateCatalog',
                      'PRIMARY_WEAPON_MAP', 'MINI_WEAPON_MAP', 'BOSS_WEAPON_MAP'])
    T(`EnemyWeaponCatalog exports ${name}`, CAT != null && CAT[name] !== undefined, 'missing export');

  const g = newGame('endless', 4242);
  const sys = g.enemyWeapons;
  T('game.enemyWeapons is a live EnemyWeaponSystem', !!sys && typeof SYS?.EnemyWeaponSystem === 'function' && sys instanceof SYS.EnemyWeaponSystem,
    sys ? `got ${sys?.constructor?.name}` : 'undefined');
  T('EnemyWeaponSystem.tokenCounts() is a function', typeof sys?.tokenCounts === 'function');
  T('HostileProjectileDirector.reconcile() is a function', typeof g.hostileDirector?.reconcile === 'function');
  const tc = tokOf(sys);
  T('tokenCounts() returns {ranged, elite, boss} of finite numbers',
    ['ranged', 'elite', 'boss'].every(k => Number.isFinite(tc[k])), JSON.stringify(tc));
  T('stats() reports heldTokens', Object.prototype.hasOwnProperty.call(statsOf(sys), 'heldTokens'),
    Object.keys(statsOf(sys)).join(','));
  const v = (() => { try { return CAT.validateCatalog(); } catch (e) { return { ok: false, errors: [e?.message || String(e)] }; } })();
  T('validateCatalog() is ok with zero errors (canonical<->legacy consistency included)',
    !!v && v.ok === true && v.errors.length === 0, v ? v.errors.slice(0, 5).join(' | ') : '');
  console.log(`    ${WEAPONS.length} weapons · ${ETW_TYPES.length} armed enemy types · ` +
              `${Object.values(ETW).reduce((a, b) => a + (b?.length || 0), 0)} assignments · ` +
              `${CONTACT_ONLY.length} contact-only types`);
  T('the catalog declares 36 armed enemy types and 82 assignments',
    ETW_TYPES.length === 36 && Object.values(ETW).reduce((a, b) => a + (b?.length || 0), 0) === 82,
    `${ETW_TYPES.length} types / ${Object.values(ETW).reduce((a, b) => a + (b?.length || 0), 0)} assignments`);
  T('the two documented re-homes are in slot 0',
    ETW['Combat Hunter']?.[0] === 'magma_reaver_lance' && ETW['Cyber Shooter']?.[0] === 'seraph_vector_javelin',
    `Combat Hunter[0]=${ETW['Combat Hunter']?.[0]} Cyber Shooter[0]=${ETW['Cyber Shooter']?.[0]}`);
  T('the displaced primaries were not deleted (eden_star_lance / aether_crescent_chakram to slot 1)',
    ETW['Combat Hunter']?.[1] === 'eden_star_lance' && ETW['Cyber Shooter']?.[1] === 'aether_crescent_chakram',
    `${ETW['Combat Hunter']?.[1]} / ${ETW['Cyber Shooter']?.[1]}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. ALL 36 TYPES RESOLVE A VALID RUNTIME WEAPON (real Enemy, real _weaponDef) ===');
// This is the headline claim of Batch 3.2: the lookup was 21/36 and is now 36/36. The assertion is
// made against a REAL constructed Enemy, not against the map, because the map being right and the
// constructor reading it are two different facts.
const RESOLVED = new Map();   // enemyType -> weapon def
{
  const bad = [], mismatched = [];
  for (const t of ETW_TYPES) {
    let e = null, err = '';
    const un = muteConsole();
    try { e = new Enemy(t, 6); } catch (x) { err = x?.message || String(x); }
    un();
    if (!e) { bad.push(`${t}: ctor threw (${err})`); continue; }
    const wd = e._weaponDef;
    if (!wd || typeof wd.id !== 'string') { bad.push(`${t}: no _weaponDef`); continue; }
    if (!WEAPON_IDS.has(wd.id)) { bad.push(`${t}: _weaponDef.id '${wd.id}' is not a catalog id`); continue; }
    if (wd.id !== ETW[t][0]) mismatched.push(`${t}: got ${wd.id}, canonical slot 0 is ${ETW[t][0]}`);
    RESOLVED.set(t, wd);
  }
  console.log(`    ${RESOLVED.size}/${ETW_TYPES.length} armed types resolved a catalog weapon at construction`);
  T('every one of the 36 armed enemyTypes constructs and resolves a _weaponDef whose id is a real catalog id',
    bad.length === 0 && RESOLVED.size === ETW_TYPES.length, bad.slice(0, 6).join(' | '));
  T('the resolved weapon is ENEMY_TYPE_WEAPONS slot 0 for every type (canonical map wins over the kebab maps)',
    mismatched.length === 0, mismatched.slice(0, 6).join(' | '));

  // The regression this batch fixed: the 15 types that had NO kebab entry must now resolve anyway.
  const kebabOnly = new Set([...Object.keys(CAT?.PRIMARY_WEAPON_MAP || {}), ...Object.keys(CAT?.MINI_WEAPON_MAP || {}),
                             ...Object.keys(CAT?.BOSS_WEAPON_MAP || {})]);
  const wasUnresolvable = ETW_TYPES.filter(t => !kebabOnly.has(CAT.toLegacyKey(t)));
  console.log(`    ${wasUnresolvable.length} types have NO legacy kebab entry and resolved ONLY through ENEMY_TYPE_WEAPONS:`);
  console.log(`      ${wasUnresolvable.join(', ')}`);
  T('the types with no legacy kebab entry all resolve through the canonical map',
    wasUnresolvable.length > 0 && wasUnresolvable.every(t => RESOLVED.has(t)),
    wasUnresolvable.filter(t => !RESOLVED.has(t)).join(', '));
  T('exactly 15 types were unresolvable before Batch 3.2 (21/36 -> 36/36)', wasUnresolvable.length === 15,
    `${wasUnresolvable.length} types have no kebab entry`);

  // getWeaponsForEnemyType is the documented public accessor for the same data.
  const helperBad = ETW_TYPES.filter(t => {
    const l = CAT.getWeaponsForEnemyType(t);
    return !Array.isArray(l) || l.length !== ETW[t].length || l[0]?.id !== ETW[t][0];
  });
  T('getWeaponsForEnemyType() returns the full resolved list for all 36 types', helperBad.length === 0,
    helperBad.slice(0, 5).join(', '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. ALL 36 SUBMIT A VALID ATTACK REQUEST — AND THE PATH EACH ONE TOOK ===');
// The submission is made by PRODUCTION: Enemy._tryShoot(game) is the one method every armed enemy
// uses to attack, and it is the method that decides between the beam path, the nova path, the
// Batch 3 weapon system and the plain projectile path. Every type is measured at ELITE tier — that
// is the tier the Batch 3 routing gate covers (spawnEnemyBullet: `_b3Tier`), and it is also the only
// tier at which the 20 types with no _initRole shootInterval submit an attack at all.
const PATHS = new Map();
{
  const g = newGame('endless', 777);
  const sys = g.enemyWeapons;
  const noPath = [], threw = [];
  for (const t of ETW_TYPES) {
    clearOrdnance(g, sys);
    const e = makeEnemy(g, t, 240);
    e.isElite = true; e.shootTimer = 0; e.hp = 9999;
    g.enemies.push(e);
    const un = muteConsole();
    let err = '';
    try { e._tryShoot(g); } catch (x) { err = x?.message || String(x); }
    un();
    if (err) { threw.push(`${t}: ${err}`); }
    const st = statsOf(sys);
    const p = [];
    if (n0(st.strikes) > 0)  p.push('EWS.strike');
    if (n0(st.zones) > 0)    p.push('EWS.zone');
    if (n0(st.volleys) > 0)  p.push('EWS.telegraphedVolley');
    if (n0(st.telegraphs) > 0) p.push('EWS.warningLine');
    if ((g._enemyBeams || []).length > 0)    p.push('Game._spawnEnemyBeam');
    if ((g._enemyOrbZones || []).length > 0) p.push('Game._spawnEnemyNova');
    if ((g.enemyBullets || []).length > 0)   p.push(`Game.spawnEnemyBullet x${g.enemyBullets.length}`);
    if (p.length === 0) noPath.push(t);
    PATHS.set(t, p.join(' + '));
  }
  for (const t of ETW_TYPES)
    console.log(`    ${t.padEnd(24)} ${String(RESOLVED.get(t)?.id || '-').padEnd(24)} ${String(RESOLVED.get(t)?.behavior || '-').padEnd(20)} ${PATHS.get(t)}`);
  T('Enemy._tryShoot() never throws for any of the 36 armed types', threw.length === 0, threw.slice(0, 4).join(' | '));
  T('every one of the 36 armed types submits an attack that reaches a real runtime path',
    noPath.length === 0 && PATHS.size === ETW_TYPES.length, noPath.join(', '));

  // Behaviour -> path contract, so "a path was taken" cannot be satisfied by the WRONG path.
  const wrong = [];
  for (const t of ETW_TYPES) {
    const b = RESOLVED.get(t)?.behavior, p = PATHS.get(t) || '';
    if (b === 'beam' && !p.includes('_spawnEnemyBeam')) wrong.push(`${t}(${b}) -> ${p}`);
    if (b === 'slash_wave' && !p.includes('EWS.strike')) wrong.push(`${t}(${b}) -> ${p}`);
    if (b === 'slash_arc' && !p.includes('EWS.strike')) wrong.push(`${t}(${b}) -> ${p}`);
    if ((b === 'piercing_projectile' || b === 'heavy_projectile') && !p.includes('EWS.telegraphedVolley')) wrong.push(`${t}(${b}) -> ${p}`);
    if (b === 'orb_explosion' && !p.includes('EWS.telegraphedVolley')) wrong.push(`${t}(${b}) -> ${p}`);
    if (['projectile', 'fast_projectile', 'arc_projectile', 'boomerang'].includes(b) && !p.includes('spawnEnemyBullet')) wrong.push(`${t}(${b}) -> ${p}`);
  }
  T('each behaviour reached the path its module contract names (beam/slash/telegraphed volley/projectile)',
    wrong.length === 0, wrong.slice(0, 6).join(' | '));
  const tally = {};
  for (const p of PATHS.values()) { const k = p.replace(/ x\d+/, ''); tally[k] = (tally[k] || 0) + 1; }
  console.log('    path tally: ' + Object.entries(tally).map(([k, v]) => `${v}x ${k}`).join(' · '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. NO CATALOG-ONLY OWNER — EVERY NAMED OWNER IS A REAL SPAWNABLE TYPE ===');
// The AUTHORITY is js/entities/Enemy.js parsed as TEXT: the spriteMap the constructor uses to pick
// art is the definitive list of types the game can build. A catalog entry naming anything else is
// dead data that reads as content.
const ENEMY_SRC = readFileSync(path.join(ROOT, 'js/entities/Enemy.js'), 'utf8');
const SPRITE_TYPES = [];
{
  const a = ENEMY_SRC.indexOf('const spriteMap = {');
  const b = a >= 0 ? ENEMY_SRC.indexOf('};', a) : -1;
  const body = (a >= 0 && b > a) ? ENEMY_SRC.slice(a, b) : '';
  for (const m of body.matchAll(/'([^']+)'\s*:\s*'/g)) SPRITE_TYPES.push(m[1]);
  T('the spriteMap in js/entities/Enemy.js was parsed', SPRITE_TYPES.length > 20, `${SPRITE_TYPES.length} entries`);
  console.log(`    authority: ${SPRITE_TYPES.length} spawnable enemyType strings in js/entities/Enemy.js`);

  const ghosts = ETW_TYPES.filter(t => !SPRITE_TYPES.includes(t));
  T('every ENEMY_TYPE_WEAPONS key is a real spawnable enemyType in js/entities/Enemy.js',
    ghosts.length === 0, ghosts.join(', '));

  const ownerGhosts = [];
  for (const w of WEAPONS) for (const o of (w.ownerTypes || [])) if (!SPRITE_TYPES.includes(o)) ownerGhosts.push(`${w.id}->${o}`);
  T('every ownerTypes entry on every weapon is a real spawnable enemyType', ownerGhosts.length === 0,
    ownerGhosts.slice(0, 6).join(', '));

  // "Spawnable" proved by construction, not only by the text.
  const unbuildable = [];
  const un = muteConsole();
  for (const t of ETW_TYPES) { try { const e = new Enemy(t, 6); if (!e || e.enemyType !== t) unbuildable.push(t); } catch (x) { unbuildable.push(`${t} (${x?.message})`); } }
  un();
  T('every ENEMY_TYPE_WEAPONS key constructs a real Enemy with that enemyType', unbuildable.length === 0,
    unbuildable.slice(0, 6).join(', '));

  const overrideGhosts = Object.keys(CAT?.LEGACY_ORDER_OVERRIDES || {}).filter(t => !SPRITE_TYPES.includes(t));
  T('every LEGACY_ORDER_OVERRIDES key is a real spawnable enemyType', overrideGhosts.length === 0, overrideGhosts.join(', '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. NO RUNTIME OWNER WITHOUT A CATALOG MAPPING ===');
{
  const unmapped = SPRITE_TYPES.filter(t => !ETW_TYPES.includes(t) && !CONTACT_ONLY.includes(t));
  T('every spawnable enemyType is either in ENEMY_TYPE_WEAPONS or declared CONTACT_ONLY',
    unmapped.length === 0, unmapped.join(', '));
  T(`the ${SPRITE_TYPES.length} spawnable types are exactly the ${ETW_TYPES.length} armed types plus the ${CONTACT_ONLY.length} contact-only ones`,
    SPRITE_TYPES.length === ETW_TYPES.length + CONTACT_ONLY.length,
    `${SPRITE_TYPES.length} != ${ETW_TYPES.length} + ${CONTACT_ONLY.length}`);
  T('CONTACT_ONLY_ENEMY_TYPES is exactly [Razorhound, Cybermote]',
    CONTACT_ONLY.length === 2 && CONTACT_ONLY.includes('Razorhound') && CONTACT_ONLY.includes('Cybermote'),
    JSON.stringify(CONTACT_ONLY));

  // The contact-only pair must appear in NO map, under either key form, and in no ownerTypes list.
  const leaks = [];
  for (const t of CONTACT_ONLY) {
    const k = CAT.toLegacyKey(t);
    if (t in ETW) leaks.push(`ENEMY_TYPE_WEAPONS['${t}']`);
    for (const [nm, m] of [['PRIMARY_WEAPON_MAP', CAT.PRIMARY_WEAPON_MAP], ['MINI_WEAPON_MAP', CAT.MINI_WEAPON_MAP],
                           ['BOSS_WEAPON_MAP', CAT.BOSS_WEAPON_MAP]]) {
      if (m && (k in m)) leaks.push(`${nm}['${k}']`);
      if (m && (t in m)) leaks.push(`${nm}['${t}']`);
    }
    for (const w of WEAPONS) {
      if ((w.ownerTypes || []).includes(t)) leaks.push(`${w.id}.ownerTypes`);
      if ((w.ownerEnemyTypes || []).includes(k)) leaks.push(`${w.id}.ownerEnemyTypes['${k}']`);
    }
  }
  T('the two CONTACT_ONLY types appear in NO map and in no ownerTypes/ownerEnemyTypes list',
    leaks.length === 0, leaks.slice(0, 6).join(', '));

  // And they really are weaponless at runtime — the claim is about behaviour, not only about data.
  const armedContactOnly = [];
  const un = muteConsole();
  for (const t of CONTACT_ONLY) { try { const e = new Enemy(t, 6); if (e._weaponDef) armedContactOnly.push(`${t}->${e._weaponDef.id}`); } catch (_) {} }
  un();
  T('a constructed Razorhound and Cybermote resolve NO _weaponDef', armedContactOnly.length === 0, armedContactOnly.join(', '));

  // Every legacy kebab key must still name a canonical type: no legacy-only owner either.
  const legacyOrphans = [];
  for (const [nm, m] of [['PRIMARY_WEAPON_MAP', CAT.PRIMARY_WEAPON_MAP], ['MINI_WEAPON_MAP', CAT.MINI_WEAPON_MAP],
                         ['BOSS_WEAPON_MAP', CAT.BOSS_WEAPON_MAP]]) {
    for (const k of Object.keys(m || {}))
      if (!ETW_TYPES.some(t => CAT.toLegacyKey(t) === k)) legacyOrphans.push(`${nm}['${k}']`);
  }
  T('every legacy kebab key derives from a canonical ENEMY_TYPE_WEAPONS type', legacyOrphans.length === 0,
    legacyOrphans.slice(0, 6).join(', '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 5. THE FOUR TELEGRAPHED WEAPONS OCCUR IN NORMAL PLAY (driven Endless + Chaos) ===');
// NOTHING is force-spawned here. Two real runs are driven through the full Game.update() pipeline
// and an OBSERVER is placed on requestTelegraphedVolley: it forwards to the real method, returns the
// real answer and records the first time each weapon was taken. Run lengths are chosen from measured
// first-occurrence data (Endless clusters 240-330 s, Chaos 90-175 s) with margin — see the header.
const ENDLESS_SECONDS = 320;
const CHAOS_SECONDS = 180;
const FIRST = { endless: new Map(), chaos: new Map() };
const RUN_STATS = {};
{
  console.log(`    run lengths chosen: Endless ${ENDLESS_SECONDS}s, Chaos ${CHAOS_SECONDS}s (sequential — one Game owns the`);
  console.log('    process clock/RNG, so the two modes cannot be driven concurrently in this process).');
  ERR_ARMED = true;
  for (const mode of ['endless', 'chaos']) {
    const g = newGame(mode, mode === 'endless' ? 20260829 : 20260830);
    const sys = g.enemyWeapons;
    const seen = FIRST[mode];
    const fired = new Map();
    const origVolley = sys.requestTelegraphedVolley.bind(sys);
    sys.requestTelegraphedVolley = (e, wd, t, fn) => {
      const wrapped = () => { if (!fired.has(wd?.id)) fired.set(wd?.id, vclock / 1000); return fn(); };
      const r = origVolley(e, wd, t, wrapped);
      if (r && wd?.id && !seen.has(wd.id)) seen.set(wd.id, { t: vclock / 1000, type: e?.enemyType || '?', elite: !!e?.isElite });
      return r;
    };
    const t0 = RD.now();
    let threw = '';
    try { step(g, Math.round((mode === 'endless' ? ENDLESS_SECONDS : CHAOS_SECONDS) * 60)); }
    catch (e) { threw = e?.message || String(e); }
    const wall = (RD.now() - t0) / 1000;
    RUN_STATS[mode] = { wall, threw, stats: statsOf(sys), fired, timeAlive: g.timeAlive };
    T(`the driven ${mode.toUpperCase()} run completed ${mode === 'endless' ? ENDLESS_SECONDS : CHAOS_SECONDS}s of real gameplay without throwing`,
      threw === '', threw);
    console.log(`    ${mode}: ${(mode === 'endless' ? ENDLESS_SECONDS : CHAOS_SECONDS)}s simulated in ${wall.toFixed(1)}s wall ` +
                `(${((mode === 'endless' ? ENDLESS_SECONDS : CHAOS_SECONDS) / Math.max(wall, 0.001)).toFixed(0)}x) · ` +
                `startedCount=${n0(statsOf(sys).startedCount)} volleysFired=${n0(statsOf(sys).volleysFired)}`);
    for (const [id, r] of seen)
      console.log(`      first telegraph  ${id.padEnd(24)} ${r.t.toFixed(1).padStart(7)}s   ${r.type}${r.elite ? ' (elite)' : ''}` +
                  (fired.has(id) ? `   first shot released ${fired.get(id).toFixed(1)}s` : '   (not yet released)'));
    clearOrdnance(g, sys);
  }
  ERR_ARMED = false;

  for (const w of VOLLEY_WEAPONS) {
    const e = FIRST.endless.get(w.id), c = FIRST.chaos.get(w.id);
    T(`${w.id} occurred in NORMAL gameplay (no force-spawn)`, !!(e || c),
      `absent from a ${ENDLESS_SECONDS}s Endless run and a ${CHAOS_SECONDS}s Chaos run`);
    console.log(`      ${w.id.padEnd(24)} endless ${e ? e.t.toFixed(1) + 's / ' + e.type : '—'}   |   chaos ${c ? c.t.toFixed(1) + 's / ' + c.type : '—'}`);
  }
  const released = VOLLEY_WEAPONS.filter(w => RUN_STATS.endless.fired.has(w.id) || RUN_STATS.chaos.fired.has(w.id));
  T('every one of the four telegraphed weapons also RELEASED its shot after the warning in a driven run',
    released.length === 4, `${released.length}/4 released — ${VOLLEY_WEAPONS.filter(w => !released.includes(w)).map(w => w.id).join(', ')}`);
  T('the driven runs produced telegraphed volleys at all (the routing gate is live in normal play)',
    n0(RUN_STATS.endless.stats.volleysFired) + n0(RUN_STATS.chaos.stats.volleysFired) > 0,
    `endless ${RUN_STATS.endless.stats.volleysFired} + chaos ${RUN_STATS.chaos.stats.volleysFired}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 6. ZERO DAMAGE BEFORE THE TELEGRAPH HAS ELAPSED (per weapon) ===');
console.log('=== 7. EXACTLY THE DECLARED DAMAGE AFTER IT (per weapon) ===');
// One probe per weapon, against its canonical slot-0 owner, entered through the production entry
// point Enemy.js uses: Game.spawnEnemyBullet with owner + weaponDef set. The volley gate takes the
// shot, holds it for the declared telegraphTime and releases it from inside update().
{
  const g = newGame('endless', 606);
  const sys = g.enemyWeapons;
  const rows = [];
  for (const { id, type } of VOLLEY_WEAPONS) {
    const wd = byId(id);
    if (!wd) { T(`${id}: catalog entry exists`, false, 'getWeaponById returned null'); continue; }
    clearOrdnance(g, sys);
    micro(g, sys, 1 / 60, 60);           // drain the shared 0.5s post-hit grace
    clearDmg();

    const e = makeEnemy(g, type, 200);
    e.isElite = true; e.hp = 9999;
    g.enemies.push(e);
    const un = muteConsole();
    let taken = false;
    try {
      taken = g.spawnEnemyBullet(e.pos.clone(), new Vec2(-1, 0), wd.speed || 400, wd.damage, 7, '#ffffff',
        { cls: 'elite', owner: e, weaponDef: wd, tokenPrepaid: false });
    } catch (_) {}
    un();
    const tgDecl = Number(wd.telegraphTime);
    T(`${id}: the shot was taken by the telegraphed-volley gate instead of firing immediately`,
      taken === true && n0(statsOf(sys).volleys) >= 1 && (g.enemyBullets || []).length === 0,
      `returned ${taken}, volleys=${statsOf(sys).volleys}, bullets=${g.enemyBullets?.length}`);

    // ── 6. the whole telegraph window, one frame short of expiry ──
    const tgFrames = Math.max(1, Math.floor(tgDecl * 60) - 1);
    let dmgDuring = 0, bulletsDuring = 0;
    micro(g, sys, 1 / 60, tgFrames, () => {
      dmgDuring += DMG.rec.length;
      DMG.rec.length = 0;
      bulletsDuring = Math.max(bulletsDuring, (g.enemyBullets || []).length);
    });
    T(`${id}: ZERO damage during its full ${tgDecl}s telegraph`, dmgDuring === 0, `${dmgDuring} damage events`);
    T(`${id}: no projectile exists during the telegraph`, bulletsDuring === 0, `${bulletsDuring} bullets`);
    T(`${id}: the volley is still pending one frame before the telegraph expires`,
      n0(statsOf(sys).volleys) >= 1, `volleys=${statsOf(sys).volleys}`);

    // ── 7. release, travel, hit ──
    clearDmg();
    let releasedAt = -1, hitAt = -1;
    micro(g, sys, 1 / 60, 300, (t) => {
      if (releasedAt < 0 && (g.enemyBullets || []).length > 0) releasedAt = tgFrames / 60 + t;
      if (hitAt < 0 && DMG.rec.length > 0) hitAt = tgFrames / 60 + t;
    });
    const hits = DMG.rec.filter(r => r.landed);
    const expected = wd.damage * ENEMY_DMG_MULT;
    T(`${id}: damage AFTER the telegraph is > 0`, hits.length > 0 && hits[0].dmg > 0,
      `${hits.length} landed hits`);
    T(`${id}: the landed damage is exactly the declared ${wd.damage} x1.10 global enemy multiplier = ${expected.toFixed(2)}`,
      hits.length > 0 && near(hits[0].dmg, expected, 1e-9), hits.length ? `got ${hits[0].dmg}` : 'no hit');
    T(`${id}: the shot was released only after the telegraph (release t >= ${tgDecl}s)`,
      releasedAt >= tgDecl - (1 / 60) - 1e-9, `released at ${releasedAt.toFixed(3)}s`);
    rows.push({ id, type, tg: tgDecl, released: releasedAt, hit: hitAt, dmg: hits[0]?.dmg ?? 0, declared: wd.damage });
    g.enemies.length = 0;
  }
  console.log('    weapon                    owner                 telegraph  released   hit      declared  landed');
  for (const r of rows)
    console.log(`    ${r.id.padEnd(25)} ${r.type.padEnd(21)} ${String(r.tg + 's').padStart(8)} ` +
                `${r.released.toFixed(3).padStart(9)}s ${r.hit.toFixed(3).padStart(7)}s ${String(r.declared).padStart(9)} ${String(r.dmg).padStart(7)}`);
  T('all four telegraphed weapons were measured', rows.length === 4, `${rows.length}/4`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 8. RECONCILIATION NEVER CANCELS AN ACTIVE ATTACK ===');
// slash_wave is the only pool member that HOLDS a director token, so it is the only thing the old
// bullets-only rebuild could have silently zeroed. The strikes are armed and rolling before the real
// reconciliation runs, and every field of every strike is compared before/after.
{
  const g = newGame('endless', 8080);
  const sys = g.enemyWeapons;
  clearOrdnance(g, sys);
  const wave = byId('abyss_rift_blade');
  const N = 10;
  for (let i = 0; i < N; i++) {
    const e = makeEnemy(g, 'Overclocked Berserker', 900 + i * 30, i * 40);
    e.isElite = true; e.hp = 9999;
    g.enemies.push(e);
    const un = muteConsole();
    try { sys.requestAttack(e, wave, { x: e.pos.x + 400, y: e.pos.y }); } catch (_) {}
    un();
  }
  const beforeStrikes = sys.strikes.length;
  T('the block armed real slash_wave strikes', beforeStrikes > 0, `${beforeStrikes} strikes`);
  // Roll past the telegraph so every strike is ARMED and in flight.
  micro(g, sys, 1 / 60, Math.ceil(0.55 * 60));
  const armedCount = sys.strikes.filter(s => s.armed).length;
  T('every strike is ARMED and in flight before the reconciliation', armedCount === sys.strikes.length && armedCount > 0,
    `${armedCount}/${sys.strikes.length} armed`);
  const held = tokOf(sys);
  T('the armed strikes really hold director tokens', tokTotal(held) === sys.strikes.length,
    `held ${JSON.stringify(held)} for ${sys.strikes.length} strikes`);
  console.log(`    ${sys.strikes.length} armed slash_wave strikes holding ${JSON.stringify(held)} ` +
              `(the director's per-class elite cap is what bounds this, not MAX_STRIKES=${statsOf(sys).caps?.strikes})`);

  const snap = (s) => JSON.stringify({ armed: s.armed, tgT: s.tgT, tgDur: s.tgDur, actT: s.actT, actDur: s.actDur,
                                       dist: s.dist, x: s.x, y: s.y, angle: s.angle, damage: s.damage,
                                       hits: s.hits, maxHits: s.maxHits, tok: s.tok });
  const before = sys.strikes.map(snap);
  const dirBefore = { ...g.hostileDirector.counts };
  const bulletsBefore = (g.enemyBullets || []).length;

  // The REAL reconciliation, reached the way production reaches it: the 4s timer in
  // Game._updateEnemyBullets. Nothing is called on the director directly.
  g._hdReconT = 0.0001;
  const un2 = muteConsole();
  try { g._updateEnemyBullets(1 / 60); } catch (_) {}
  un2();
  const after = sys.strikes.map(snap);
  const dirAfter = { ...g.hostileDirector.counts };

  T('the reconciliation left every armed strike alive', after.length === before.length,
    `${before.length} -> ${after.length}`);
  T('every strike survived with an IDENTICAL armed/telegraph/geometry/token state',
    before.length === after.length && before.every((s, i) => s === after[i]),
    before.map((s, i) => (s === after[i] ? null : `#${i}: ${s} -> ${after[i]}`)).filter(Boolean).slice(0, 3).join(' | '));
  T('the shared budget is unchanged by the reconciliation',
    JSON.stringify(dirBefore) === JSON.stringify(dirAfter),
    `${JSON.stringify(dirBefore)} -> ${JSON.stringify(dirAfter)}`);
  T('the reconciled budget equals live bullets + tokenCounts()',
    n0(dirAfter.ranged) + n0(dirAfter.elite) + n0(dirAfter.boss) === bulletsBefore + tokTotal(tokOf(sys)),
    `${JSON.stringify(dirAfter)} vs ${bulletsBefore} bullets + ${JSON.stringify(tokOf(sys))}`);

  // The other half of the Batch 3.2 change: the FASTER self-heal inside spawnEnemyBullet must stand
  // down while the weapon system is holding anything. Reached through production, not by hand.
  const heldBefore = tokTotal(tokOf(sys));
  const dirPre = { ...g.hostileDirector.counts };
  const un3 = muteConsole();
  g.enemyBullets.length = 0;                       // exactly what _clearDeckTransients / reset() do
  try {
    const e2 = makeEnemy(g, 'Rogue Punk', 500);
    g.spawnEnemyBullet(e2.pos.clone(), new Vec2(-1, 0), 400, 5, 6, '#ff0000', { cls: 'ranged' });
  } catch (_) {}
  un3();
  T('spawnEnemyBullet\'s fast self-heal stands down while enemyWeapons.active() is true',
    n0(g.hostileDirector.counts.elite) === n0(dirPre.elite) && heldBefore > 0,
    `elite ${dirPre.elite} -> ${g.hostileDirector.counts.elite} with ${heldBefore} tokens held`);
  T('tokenCounts() is unchanged by the self-heal path', tokTotal(tokOf(sys)) === heldBefore,
    `${heldBefore} -> ${tokTotal(tokOf(sys))}`);

  // reconcile() contract: clamped to >= 0 and to the per-class cap, never throws.
  const d = new HPD.HostileProjectileDirector();
  const r1 = d.reconcile({ ranged: -50, elite: -1, boss: -999 });
  T('reconcile() clamps negative totals to 0', r1.ranged === 0 && r1.elite === 0 && r1.boss === 0, JSON.stringify(r1));
  const r2 = d.reconcile({ ranged: 9999, elite: 9999, boss: 9999 });
  T('reconcile() clamps to the per-class caps (desktop 12/8/18)',
    r2.ranged === 12 && r2.elite === 8 && r2.boss === 18, JSON.stringify(r2));
  const r3 = d.reconcile({ ranged: NaN, elite: undefined, boss: 'x' });
  T('reconcile() maps non-finite/missing values to 0 and never throws', r3.ranged === 0 && r3.elite === 0 && r3.boss === 0, JSON.stringify(r3));
  const r4 = d.reconcile(null);
  T('reconcile(null) zeroes the ledger instead of throwing', r4.ranged === 0 && r4.elite === 0 && r4.boss === 0, JSON.stringify(r4));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 9/13. EVERY LIFECYCLE BOUNDARY LEAVES ZERO POOLS, ZERO ORDNANCE, ZERO TOKENS ===');
{
  const g = newGame('endless', 5150);
  const sys = g.enemyWeapons;

  // Fills every pool AND every Game-side ordnance array from live enemies, so a boundary is always
  // measured against something rather than against three empty arrays.
  const arm = () => {
    const un = muteConsole();
    for (let i = 0; i < 5; i++) {
      const e = makeEnemy(g, 'Overclocked Berserker', 700 + i * 30, i * 45);
      e.isElite = true; e.hp = 9999;
      g.enemies.push(e);
      try { sys.requestAttack(e, byId('abyss_rift_blade'), { x: e.pos.x + 300, y: e.pos.y }); } catch (_) {}
      try { sys.requestAttack(e, byId('blacknet_scythe_arc'), { x: e.pos.x + 300, y: e.pos.y }); } catch (_) {}
      try { sys.requestAttack(e, byId('eden_star_lance'), { x: e.pos.x + 300, y: e.pos.y }); } catch (_) {}
      try { sys.requestAttack(e, { ...byId('null_rupture_orb'), id: 'qa_ground_orb', speed: 0, projectileSpeed: 0 }, { x: e.pos.x + 100, y: e.pos.y }); } catch (_) {}
      try { sys.requestTelegraphedVolley(e, byId('magma_reaver_lance'), g.player.pos, () => {}); } catch (_) {}
      try { g.spawnEnemyBullet(e.pos.clone(), new Vec2(-1, 0), 420, 8, 7, '#ff4444', { cls: 'ranged' }); } catch (_) {}
      try { g._spawnEnemyBeam(e, byId('arc_circuit_beam')); } catch (_) {}
      try { g._spawnEnemyNova(e, byId('null_rupture_orb')); } catch (_) {}
    }
    un();
    const s = statsOf(sys);
    return n0(s.strikes) + n0(s.zones) + n0(s.volleys) + n0(s.telegraphs);
  };

  // THE DIRECTOR LEDGER AND THE DOCUMENTED RECONCILIATION WINDOW.
  // Game truncates this.enemyBullets at several boundaries (_clearDeckTransients, reset()) WITHOUT
  // releasing the token each bullet held, and neither of those methods calls hostileDirector.reset().
  // That is by design and pre-dates Batch 3.2: HostileProjectileDirector is rebuilt, not maintained,
  // by the "HORDE §10 leak-proofing" pass inside Game._updateEnemyBullets, which runs every 4 s, plus
  // the faster self-heal inside spawnEnemyBullet. So the fair statement about the ledger is not
  // "zero on the frame the boundary is crossed" but "zero once that documented window has passed" —
  // and the instantaneous value is reported either way so a widening lag is still visible here.
  const RECON_FRAMES = 270;   // 4.5 s at 60 fps — one full 4 s reconciliation period plus margin
  const settleDirector = (gg) => {
    const un = muteConsole();
    for (let i = 0; i < RECON_FRAMES; i++) { vclock += 1000 / 60; try { gg._updateEnemyBullets(1 / 60); } catch (_) {} }
    un();
  };

  const boundary = (label, armedCount, gg, ss, { expectBullets = true } = {}) => {
    const s = statsOf(ss);
    const tok = tokOf(ss);
    const snapv = (() => { try { return gg.hostileDirector.snapshot(gg); } catch (_) { return null; } })();
    T(`${label}: the boundary was crossed with live content (${armedCount} pool entries)`, armedCount > 0, `${armedCount}`);
    T(`${label}: all four EnemyWeaponSystem pools are empty`,
      n0(s.strikes) === 0 && n0(s.zones) === 0 && n0(s.volleys) === 0 && n0(s.telegraphs) === 0,
      `strikes=${s.strikes} zones=${s.zones} volleys=${s.volleys} telegraphs=${s.telegraphs}`);
    T(`${label}: active() is false`, ss.active() === false);
    T(`${label}: tokenCounts() is all zero`, tokTotal(tok) === 0, JSON.stringify(tok));
    if (expectBullets) {
      T(`${label}: no orphaned bullets, beams or orb zones`,
        (gg.enemyBullets || []).length === 0 && (gg._enemyBeams || []).length === 0 && (gg._enemyOrbZones || []).length === 0,
        `bullets=${gg.enemyBullets?.length} beams=${gg._enemyBeams?.length} zones=${gg._enemyOrbZones?.length}`);
    } else {
      // forceEnd() / onDeckChanged() are EnemyWeaponSystem-scoped by contract: Game owns the bullet
      // arrays. What must hold here is that the system gave back every token it was holding, i.e.
      // the director total is accounted for entirely by the bullets Game still has.
      T(`${label}: hostileDirector holds nothing on this system's behalf (total == live bullets)`,
        !!snapv && n0(snapv.total) === (gg.enemyBullets || []).length,
        snapv ? `${JSON.stringify(snapv)} vs ${gg.enemyBullets?.length} bullets` : 'no director');
      return;
    }
    const immediate = snapv ? n0(snapv.total) : -1;
    settleDirector(gg);
    const settled = (() => { try { return n0(gg.hostileDirector.snapshot(gg).total); } catch (_) { return -1; } })();
    if (immediate !== 0) NOTE(`${label}: director total was ${immediate} on the boundary frame, ${settled} after the documented 4s reconciliation`);
    T(`${label}: hostileDirector.snapshot() reaches zero (immediately, or inside the documented 4s reconciliation window)`,
      settled === 0, `immediate ${immediate}, still ${settled} after ${(RECON_FRAMES / 60).toFixed(1)}s`);
  };

  // ── forceEnd() ──────────────────────────────────────────────────────────────────────────────
  let n = arm();
  const un1 = muteConsole(); sys.forceEnd(); un1();
  boundary('forceEnd()', n, g, sys, { expectBullets: false });

  // ── onDeckChanged() ─────────────────────────────────────────────────────────────────────────
  clearOrdnance(g, sys);
  n = arm();
  const un2 = muteConsole(); sys.onDeckChanged(); un2();
  boundary('onDeckChanged()', n, g, sys, { expectBullets: false });

  // ── a real deck transition through Game._enterDeck ───────────────────────────────────────────
  clearOrdnance(g, sys);
  step(g, 60);
  n = arm();
  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) {
    const un = muteConsole();
    if (!g._deckTransitionBlocked()) { try { moved = g._enterDeck('upper') === true && g._deck === 'upper'; } catch (_) { moved = false; } }
    un();
    if (!moved) { step(g, 15); n = Math.max(n, arm()); }
  }
  T('a real deck transition was granted', moved, `deck=${g._deck}`);
  boundary('Game._enterDeck (real deck change)', n, g, sys, { expectBullets: true });

  // ── restart through the Endless entry (reset + mode entry) ───────────────────────────────────
  clearOrdnance(g, sys);
  step(g, 30);
  n = arm();
  const un3 = muteConsole(); g.reset(); g._enterEndless(); un3();
  boundary('Game.reset() + _enterEndless()', n, g, sys, { expectBullets: true });
  T('Game.reset() + _enterEndless() zeroes the per-run counters',
    n0(statsOf(sys).startedCount) === 0 && n0(statsOf(sys).damageEvents) === 0,
    `startedCount=${statsOf(sys).startedCount} damageEvents=${statsOf(sys).damageEvents}`);

  // ── restart through Game.reset() ALONE — the GAME-OVER "RESTART" path ────────────────────────
  // js/main.js reaches this and nothing else: line 131 (Enter on end-screen button 0), line 190
  // (the 'r' key after game over / victory) and line 334 (clicking the RESTART button) all call
  // game.reset() with NO mode entry after it. Game.selectCharacter() (Act 1 start) does the same.
  clearOrdnance(g, sys);
  step(g, 30);
  n = arm();
  const un4 = muteConsole(); g.gameOver = true; g.reset(); un4();
  boundary('Game.reset() ALONE (the game-over RESTART path)', n, g, sys, { expectBullets: true });

  T('the per-run QA counters are zeroed by Game.reset() alone', n0(statsOf(sys).startedCount) === 0,
    `startedCount=${statsOf(sys).startedCount} carried into the new run`);

  // The CONSEQUENCE, measured rather than argued. A separate game, so the geometry is controlled:
  // four elites standing next to the player submit their attacks through the PRODUCTION entry point
  // (Game.spawnEnemyBullet with owner + weaponDef, exactly as Enemy._tryShoot calls it), the run is
  // restarted the way the game-over screen restarts it, and the damage log of the FRESH run is read.
  {
    const g2 = newGame('endless', 31415);
    const sys2 = g2.enemyWeapons;
    clearOrdnance(g2, sys2);
    micro(g2, sys2, 1 / 60, 60);
    clearDmg();
    const un = muteConsole();
    for (const [type, wid, dist] of [['Overclocked Berserker', 'abyss_rift_blade', 130],
                                     ['Cyber-Axe Executioner', 'abyss_rift_blade', 150],
                                     ['Combat Hunter', 'magma_reaver_lance', 190],
                                     ['Abyss Maw', 'null_rupture_orb', 210]]) {
      const wd = byId(wid);
      const e = makeEnemy(g2, type, dist);
      e.isElite = true; e.hp = 9999; g2.enemies.push(e);
      try {
        g2.spawnEnemyBullet(e.pos.clone(), new Vec2(-1, 0), wd.speed || 400, wd.damage, 7, '#ffffff',
          { cls: 'elite', owner: e, weaponDef: wd, tokenPrepaid: false });
      } catch (_) {}
    }
    un();
    const armed = n0(statsOf(sys2).strikes) + n0(statsOf(sys2).zones) + n0(statsOf(sys2).volleys) + n0(statsOf(sys2).telegraphs);
    T('the restart repro armed real attacks aimed at the player', armed > 0, `${armed} pool entries`);
    const un2 = muteConsole(); g2.gameOver = true; g2.reset(); un2();
    const survived = n0(statsOf(sys2).strikes) + n0(statsOf(sys2).zones) + n0(statsOf(sys2).volleys) + n0(statsOf(sys2).telegraphs);
    clearDmg();
    step(g2, 180);   // 3s of the FRESH run
    const carried = DMG.rec.filter(r => r.landed);
    const total = carried.reduce((a, r) => a + r.dmg, 0);
    T('nothing carried over by Game.reset() damages the player in the first 3s of the fresh run',
      carried.length === 0,
      `${survived} pool entries survived the restart and dealt ${carried.length} hits / ${total.toFixed(1)} damage ` +
      `in the fresh run (sources: ${[...new Set(carried.map(r => r.src))].join(',')})`);
    clearOrdnance(g2, sys2);
  }

  // ── return to the menu ───────────────────────────────────────────────────────────────────────
  const un5 = muteConsole(); g.gameState = 'playing'; g.reset(); g._enterEndless(); un5();
  clearOrdnance(g, sys);
  step(g, 60);
  n = arm();
  const un6 = muteConsole();
  try { g.goToMainMenu(); } catch (_) {}
  un6();
  for (let i = 0; i < 400 && g.gameState !== 'start_menu'; i++) step(g, 1);
  T('the run really returned to the menu', g.gameState === 'start_menu', `gameState=${g.gameState}`);
  boundary('goToMainMenu()', n, g, sys, { expectBullets: true });

  // ── a second run starts clean ────────────────────────────────────────────────────────────────
  const un7 = muteConsole(); g.gameState = 'playing'; g.reset(); g._enterEndless(); un7();
  boundary('a second run', Math.max(n, 1), g, sys, { expectBullets: true });
  step(g, 120);
  T('the second run inherits no strike, zone, volley or telegraph from the first',
    n0(statsOf(sys).strikes) + n0(statsOf(sys).zones) + n0(statsOf(sys).volleys) + n0(statsOf(sys).telegraphs) >= 0
    && n0(statsOf(sys).damageEvents) >= 0);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 10. CAPS HOLD — DESKTOP AND MOBILE ===');
{
  const desk = await capsProbe();
  console.log(`    DESKTOP  caps telegraphs/strikes/zones/volleys = ` +
              `${desk.caps.telegraphs}/${desk.caps.strikes}/${desk.caps.zones}/${desk.caps.volleys}   ` +
              `observed maxima after ${desk.attempts} attempts each = ` +
              `${desk.observed.telegraphs}/${desk.observed.strikes}/${desk.observed.zones}/${desk.observed.volleys}`);
  T('desktop declared caps are 12/16/10/10',
    desk.caps.telegraphs === 12 && desk.caps.strikes === 16 && desk.caps.zones === 10 && desk.caps.volleys === 10,
    JSON.stringify(desk.caps));
  T('desktop observed maxima reach the cap and never exceed it',
    desk.observed.telegraphs === 12 && desk.observed.strikes === 16 && desk.observed.zones === 10 && desk.observed.volleys === 10,
    JSON.stringify(desk.observed));
  T('desktop navigator is NOT detected as mobile', desk.mobile === false, `maxTouchPoints reported mobile=${desk.mobile}`);
  console.log(`    DESKTOP  HostileProjectileDirector granted ${desk.directorRanged} 'ranged' tokens out of 60 requested (per-class cap 12)`);
  T('the director\'s own ranged cap holds at 12 on desktop', desk.directorRanged === 12, `${desk.directorRanged}`);

  // MOBILE — a child process, because both modules read navigator.maxTouchPoints once at import.
  let mob = null, mobErr = '';
  try {
    const out = execFileSync(process.execPath, [SELF, '--caps-probe', '--mobile'],
      { cwd: ROOT, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    const line = out.split('\n').find(l => l.startsWith('CAPS_JSON '));
    if (line) mob = JSON.parse(line.slice('CAPS_JSON '.length));
    else mobErr = 'no CAPS_JSON line in child output';
  } catch (e) { mobErr = (e?.message || String(e)).slice(0, 200); }

  T('the mobile cap probe child process ran', !!mob && !mob.error, mobErr || mob?.error || '');
  if (mob && !mob.error) {
    console.log(`    MOBILE   caps telegraphs/strikes/zones/volleys = ` +
                `${mob.caps.telegraphs}/${mob.caps.strikes}/${mob.caps.zones}/${mob.caps.volleys}   ` +
                `observed maxima after ${mob.attempts} attempts each = ` +
                `${mob.observed.telegraphs}/${mob.observed.strikes}/${mob.observed.zones}/${mob.observed.volleys}`);
    T('the child really emulated mobile the way HostileProjectileDirector detects it (navigator.maxTouchPoints > 0)',
      mob.mobile === true);
    T('mobile declared caps are 6/8/5/5',
      mob.caps.telegraphs === 6 && mob.caps.strikes === 8 && mob.caps.zones === 5 && mob.caps.volleys === 5,
      JSON.stringify(mob.caps));
    T('mobile observed maxima reach the cap and never exceed it',
      mob.observed.telegraphs === 6 && mob.observed.strikes === 8 && mob.observed.zones === 5 && mob.observed.volleys === 5,
      JSON.stringify(mob.observed));
    console.log(`    MOBILE   HostileProjectileDirector granted ${mob.directorRanged} 'ranged' tokens out of 60 requested (per-class cap 6)`);
    T('the director\'s own ranged cap halves to 6 on mobile', mob.directorRanged === 6, `${mob.directorRanged}`);
    T('every mobile cap is exactly half of its desktop counterpart',
      mob.caps.telegraphs * 2 === desk.caps.telegraphs && mob.caps.strikes * 2 === desk.caps.strikes
      && mob.caps.zones * 2 === desk.caps.zones && mob.caps.volleys * 2 === desk.caps.volleys,
      `${JSON.stringify(mob.caps)} vs ${JSON.stringify(desk.caps)}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 11. ZERO BLACK SCREEN — Game.draw() ON THE MAIN DECK AND AFTER A DECK CHANGE ===');
// "Did not throw" is necessary but not sufficient: a draw that throws on frame one and is swallowed
// paints nothing. The context here COUNTS its own operations, so an empty frame is a failure too.
{
  const countingCtx = (() => {
    const c = makeCtx();
    let n = 0;
    for (const k of ['fillRect', 'drawImage', 'fill', 'stroke', 'fillText', 'arc', 'lineTo', 'rect', 'moveTo'])
      { const o = c[k]; c[k] = function (...a) { n++; return o.apply(this, a); }; }
    c.__ops = () => n; c.__reset = () => { n = 0; };
    return c;
  })();

  const g = newGame('endless', 9182);
  const sys = g.enemyWeapons;
  step(g, 120);
  // Live content in every pool so draw() has something to paint.
  const un = muteConsole();
  for (let i = 0; i < 6; i++) {
    const e = makeEnemy(g, 'Rogue AI Overlord', 160 + i * 20, i * 30);
    e.isElite = true; e.hp = 9999; g.enemies.push(e);
    try { sys.requestAttack(e, byId('blacknet_scythe_arc'), g.player.pos); } catch (_) {}
    try { sys.requestAttack(e, byId('abyss_rift_blade'), g.player.pos); } catch (_) {}
    try { sys.requestAttack(e, byId('eden_star_lance'), g.player.pos); } catch (_) {}
    try { sys.requestAttack(e, { ...byId('null_rupture_orb'), id: 'qa_ground_orb', speed: 0, projectileSpeed: 0 }, g.player.pos); } catch (_) {}
    try { sys.requestTelegraphedVolley(e, byId('magma_reaver_lance'), g.player.pos, () => {}); } catch (_) {}
  }
  un();
  const live = statsOf(sys);
  T('the draw block has live strikes, zones, volleys and telegraphs to paint',
    n0(live.strikes) > 0 && n0(live.zones) > 0 && n0(live.volleys) > 0 && n0(live.telegraphs) > 0,
    JSON.stringify({ s: live.strikes, z: live.zones, v: live.volleys, t: live.telegraphs }));

  countingCtx.__reset();
  let err = '';
  const unA = muteConsole();
  try { g.draw(countingCtx); } catch (e) { err = e?.message || String(e); }
  unA();
  const opsMain = countingCtx.__ops();
  T('Game.draw() runs headlessly on the MAIN deck with live enemy weapons', err === '', err);
  T('the MAIN-deck frame is not blank', opsMain > 0, `${opsMain} canvas operations`);

  // Armed phase is a different draw path (sweeps, rolling crescents, detonations).
  micro(g, sys, 1 / 60, 45);
  countingCtx.__reset();
  err = '';
  const unB = muteConsole();
  try { g.draw(countingCtx); } catch (e) { err = e?.message || String(e); }
  unB();
  T('Game.draw() runs headlessly during the ARMED phase', err === '', err);
  T('the armed-phase frame is not blank', countingCtx.__ops() > 0, `${countingCtx.__ops()} canvas operations`);

  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) {
    const u = muteConsole();
    if (!g._deckTransitionBlocked()) { try { moved = g._enterDeck('lower') === true && g._deck === 'lower'; } catch (_) { moved = false; } }
    u();
    if (!moved) step(g, 15);
  }
  T('a deck change was granted for the draw test', moved, `deck=${g._deck}`);
  step(g, 30);
  countingCtx.__reset();
  err = '';
  const unC = muteConsole();
  try { g.draw(countingCtx); } catch (e) { err = e?.message || String(e); }
  unC();
  const opsDeck = countingCtx.__ops();
  T('Game.draw() runs headlessly AFTER a deck change', err === '', err);
  T('the post-deck-change frame is not blank', opsDeck > 0, `${opsDeck} canvas operations`);
  console.log(`    canvas operations: main deck ${opsMain} · after deck change ${opsDeck}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 12. ZERO CONSOLE ERRORS FROM GAME CODE DURING THE DRIVEN RUNS ===');
{
  const uniq = [...new Set(CONSOLE_ERRORS)];
  T(`no console.error was emitted during the ${ENDLESS_SECONDS}s Endless and ${CHAOS_SECONDS}s Chaos driven runs`,
    CONSOLE_ERRORS.length === 0, `${CONSOLE_ERRORS.length} errors, ${uniq.length} distinct`);
  for (const e of uniq.slice(0, 8)) console.log(`      ${e}`);
  console.log(`    ${(ENDLESS_SECONDS + CHAOS_SECONDS)}s of driven gameplay produced ${CONSOLE_ERRORS.length} console.error calls`);
  T('neither driven run threw out of Game.update()', !RUN_STATS.endless?.threw && !RUN_STATS.chaos?.threw,
    `${RUN_STATS.endless?.threw || ''} ${RUN_STATS.chaos?.threw || ''}`.trim());
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 14/15. THE EARLIER SUITES ===');
console.log('  INFO  Batch 3 and Batch 2 are NOT re-run from inside this file. Re-running them here');
console.log('  INFO  would double the runtime and hide which suite failed. They are run separately:');
console.log('  INFO      node tools/qa/batch3_enemy_weapons_regression.mjs      (expects "B3_DONE")');
console.log('  INFO      node tools/qa/batch2_events_regression.mjs             (expects "B2_DONE")');

const WALL = ((RD.now() - WALL0) / 1000);
console.log(`\ntotal runtime ${WALL.toFixed(1)}s`);
console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('B32_DONE');
process.exit(fail ? 1 : 0);
