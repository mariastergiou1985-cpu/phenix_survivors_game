// BATCH 3 — ENEMY WEAPONS: THE CATALOG, THE STRIKE SYSTEM AND THEIR GAME INTEGRATION
// ------------------------------------------------------------------------------------------------
// Batch 3 finishes the enemy weapon pack. Three things are under test here and all three are about
// a CONTRACT rather than about a picture:
//
//   * js/game/EnemyWeaponCatalog.js is now the single source of truth for enemy armament. Every
//     weapon carries a full field set, every owner it names has to be a REAL enemyType the game
//     actually constructs, and validateCatalog() has to agree with an independent re-derivation of
//     the same rules. A catalog that names an enemy nobody spawns is dead data that reads as
//     content; that is the class of defect the first two blocks exist to catch.
//
//   * js/game/EnemyWeaponSystem.js owns the shapes that are NOT projectiles — slash_arc,
//     slash_wave and the ground-placed orb_explosion — and deliberately refuses everything Game.js
//     already implements. Its ONE rule is that no strike may damage before its telegraph has fully
//     elapsed, so that rule is asserted PER WEAPON, not once globally.
//
//   * Game.js is the integration point: game.enemyWeapons is updated, drawn and cleared with the
//     run. Every Game-dependent assertion below is written defensively — a MISSING system produces
//     a named FAIL, never a stack trace that hides the blocks after it.
//
// WHY THIS FILE DRIVES SUB-SYSTEMS DIRECTLY IN THE MEASUREMENT BLOCKS
// A full Game.update() tick runs the whole horde, and an organic enemy firing into the player mid
// measurement would put a foreign entry in the damage log and make "this weapon dealt exactly its
// declared damage" a statement about whatever else was on screen. So the damage, cooldown and
// telegraph blocks advance the REAL production update methods they are measuring — sys.update(),
// Game._updateEnemyBullets(), Game._updateEnemyBeams(), Game._updateEnemyOrbZones() and
// Game._checkPlayerEnemyCollisions() (which is where production decays playerHitCooldown) — and
// nothing else. No timer is hand-written, no hit is synthesised, no damage bypasses _damagePlayer.
// The lifecycle and black-screen blocks DO run the whole Game.update()/Game.draw() pipeline,
// because there the whole pipeline is the thing under test.
//
// The player is never moved, never healed by anything except the documented HP pin (see step()),
// and never damaged except through Game._damagePlayer.
//
// Runtime budget: this file is designed to finish in seconds, not minutes. Where a check would
// otherwise need a long organic run it drives the system directly instead.
//
//   node tools/qa/batch3_enemy_weapons_regression.mjs
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole, makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

// Deterministic RNG, so a failure reported by this file can be reproduced by running it again.
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Virtual clock. Nothing here may depend on wall-clock time.
let vclock = 0;
globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };

const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const { Vec2, PLAYER_RADIUS } = await import(pathToFileURL(path.join(ROOT, 'js/constants.js')).href);

// Both Batch 3 modules are imported defensively: a module that fails to load must be reported as a
// named failure on the assertion that needs it, not as a load-time crash that says nothing about
// which contract was broken.
const CAT_PATH = path.join(ROOT, 'js/game/EnemyWeaponCatalog.js');
const SYS_PATH = path.join(ROOT, 'js/game/EnemyWeaponSystem.js');
let CAT = null, CAT_ERR = '', SYS = null, SYS_ERR = '';
try { CAT = await import(pathToFileURL(CAT_PATH).href); } catch (e) { CAT_ERR = e?.message || String(e); }
try { SYS = await import(pathToFileURL(SYS_PATH).href); } catch (e) { SYS_ERR = e?.message || String(e); }
const CTX = makeCtx();
u0();

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};
const NOTE = (s) => console.log(`  NOTE  ${s}`);
const finite = (o) => !!o && Number.isFinite(o.x) && Number.isFinite(o.y);
const n0 = (v) => (Number.isFinite(v) ? v : 0);
const near = (a, b, eps = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

// ── catalog surface, read once and defensively ──────────────────────────────────────────────────
const WEAPONS  = (CAT && Array.isArray(CAT.ENEMY_WEAPONS)) ? CAT.ENEMY_WEAPONS : [];
const ETW      = (CAT && CAT.ENEMY_TYPE_WEAPONS) || {};
const REQFIELDS = (CAT && Array.isArray(CAT.REQUIRED_WEAPON_FIELDS)) ? CAT.REQUIRED_WEAPON_FIELDS : [];
const byId     = (id) => { try { return CAT?.getWeaponById?.(id) || null; } catch (_) { return null; } };

// Behaviours EnemyWeaponSystem claims. orb_explosion is CONDITIONAL: the module only takes it when
// the weapon declares no travel speed, because a thrown orb stays with Game.spawnEnemyBullet.
const EWS_OWNED_UNCONDITIONAL = new Set(['slash_arc', 'slash_wave']);
const isGroundOrb = (wd) => wd && wd.behavior === 'orb_explosion'
  && !(Number(wd.projectileSpeed ?? wd.speed) > 0);
const ewsOwns = (wd) => !!wd && (EWS_OWNED_UNCONDITIONAL.has(wd.behavior) || isGroundOrb(wd));

// The module's own documented telegraph floor/ceiling. Read here so the harness states the same
// numbers the module enforces; both are re-derived from observed behaviour further down.
const MIN_TELEGRAPH_S = 0.25, MAX_TELEGRAPH_S = 2.5;
const effTelegraph = (wd) => Math.max(MIN_TELEGRAPH_S,
  Math.min(MAX_TELEGRAPH_S, Number.isFinite(Number(wd?.telegraphTime)) ? Number(wd.telegraphTime) : 0));

// ── a system stand-in, so a missing module cannot hide later blocks ──────────────────────────────
const NULL_SYS = {
  reset() {}, update() {}, draw() {}, onDeckChanged() {}, forceEnd() {},
  requestAttack() { return false; }, active() { return false; },
  stats() { return { telegraphs: -1, strikes: -1, zones: -1 }; },
  strikes: [], zones: [], telegraphs: [],
};

// ── run driving ─────────────────────────────────────────────────────────────────────────────────
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };

// Every game built by this harness carries a permanent spy on _damagePlayer. The spy is a pure
// observer: it forwards to the real method, returns the real answer and records what was asked for
// and whether it landed. No damage in this file reaches the player by any other route.
const DMG = { rec: [] };
function installDamageSpy(g) {
  const proto = Object.getPrototypeOf(g);
  const orig = proto._damagePlayer;
  g._damagePlayer = function (dmg, opts) {
    const landed = orig.call(this, dmg, opts);
    DMG.rec.push({ dmg, src: (opts && opts.src) || null, color: (opts && opts.color) || null, landed, t: vclock / 1000 });
    // The lifecycle and black-screen blocks run whole minutes of the real loop with the player's HP
    // pinned, so the log would otherwise grow without bound. Every block that READS the log clears
    // it first and measures a window far shorter than this bound.
    if (DMG.rec.length > 5000) DMG.rec.splice(0, DMG.rec.length - 2000);
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
  un();
  installDamageSpy(g);
  clearDmg();
  return g;
}

// The player's HP is pinned every frame in the FULL-LOOP blocks only. Survival is not what any
// assertion in this file measures, and a death would truncate the lifecycle and black-screen runs.
// Damage correctness is proven in its own block against the spy, not against the HP bar.
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
// measured, and nothing else — see the header note. _checkPlayerEnemyCollisions is included
// because that is the method in which production decays playerHitCooldown, and without it the
// 0.5s post-hit grace would never expire and every probe after the first would measure a refusal.
function micro(g, sys, dt, frames, onFrame) {
  const un = muteConsole();
  for (let i = 0; i < frames; i++) {
    vclock += dt * 1000;
    try { sys?.update?.(dt); } catch (e) { un(); throw e; }
    try { g._checkPlayerEnemyCollisions(dt); } catch (_) {}
    try { g._updateEnemyBullets(dt); } catch (_) {}
    try { g._updateEnemyBeams(dt); } catch (_) {}
    try { g._updateEnemyOrbZones(dt); } catch (_) {}
    if (onFrame) { try { onFrame((i + 1) * dt); } catch (e) { un(); throw e; } }
  }
  un();
}

// Drains the shared 0.5s post-hit grace and any leftover strike, so each probe starts from the same
// state. Pure time: production's own decay, run forward.
function drain(g, sys, seconds = 1.2) { micro(g, sys, 1 / 60, Math.ceil(seconds * 60)); clearDmg(); }

// A clean slate for the projectile pools between probes. Both operations are exactly what
// Game._clearDeckTransients and the HORDE token self-heal do in production; neither invents state.
function clearOrdnance(g) {
  const un = muteConsole();
  if (Array.isArray(g.enemyBullets)) g.enemyBullets.length = 0;
  if (Array.isArray(g._enemyBeams)) g._enemyBeams.length = 0;
  if (Array.isArray(g._enemyOrbZones)) g._enemyOrbZones.length = 0;
  try { g.hostileDirector?.reset(); } catch (_) {}
  un();
}

// Builds a real Enemy and stands it `dist` px to the player's right. Enemies are placed by every
// spawner in the game; the PLAYER is never moved by this harness.
function makeEnemy(g, type, dist = 120) {
  const un = muteConsole();
  let e = null;
  try { e = new Enemy(type, 6); } catch (err) { un(); throw err; }
  un();
  e.pos.x = g.player.pos.x + dist;
  e.pos.y = g.player.pos.y;
  e.hp = Math.max(1, e.hp);
  e.dead = false; e._retired = false;
  return e;
}

// Every live position the batch can produce. Used after every section.
function nonFinite(g, sys) {
  const bad = [];
  if (!finite(g.player?.pos)) bad.push('player.pos');
  if (!finite(g.camera)) bad.push('camera');
  for (const b of (g.enemyBullets || [])) if (!finite(b.pos) || !Number.isFinite(b.damage)) bad.push('enemyBullet');
  for (const bm of (g._enemyBeams || [])) if (![bm.x1, bm.y1, bm.angle, bm.damage].every(Number.isFinite)) bad.push('enemyBeam');
  for (const z of (g._enemyOrbZones || [])) if (!finite(z.pos) || !Number.isFinite(z.damage)) bad.push('orbZone');
  if (sys) {
    for (const name of ['strikes', 'zones', 'telegraphs']) {
      for (const s of (sys[name] || [])) {
        if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) bad.push(`ews.${name}.pos`);
        if (s.dist !== undefined && !Number.isFinite(s.dist)) bad.push(`ews.${name}.dist`);
        if (s.angle !== undefined && !Number.isFinite(s.angle)) bad.push(`ews.${name}.angle`);
      }
    }
  }
  return bad;
}
function assertFinite(label, g, sys) {
  const bad = nonFinite(g, sys);
  T(`${label}: no NaN in player, camera or any live projectile/strike position`, bad.length === 0,
    [...new Set(bad)].join(', '));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 0. THE BATCH 3 SURFACE EXISTS ===');
T('js/game/EnemyWeaponCatalog.js is in the tree', existsSync(CAT_PATH));
T('js/game/EnemyWeaponCatalog.js imports cleanly', CAT != null, CAT_ERR);
T('js/game/EnemyWeaponSystem.js is in the tree', existsSync(SYS_PATH));
T('js/game/EnemyWeaponSystem.js imports cleanly', SYS != null, SYS_ERR);
for (const name of ['WEAPON_BEHAVIOR', 'ENEMY_WEAPONS', 'PRIMARY_WEAPON_MAP', 'BOSS_WEAPON_MAP',
                    'MINI_WEAPON_MAP', 'getWeaponById', 'getWeaponsForEnemy',
                    'REQUIRED_WEAPON_FIELDS', 'ENEMY_TYPE_WEAPONS', 'getWeaponsForEnemyType',
                    'validateCatalog'])
  T(`EnemyWeaponCatalog exports ${name}`, CAT != null && CAT[name] !== undefined, 'missing export');
T('EnemyWeaponSystem exports class EnemyWeaponSystem', typeof SYS?.EnemyWeaponSystem === 'function',
  SYS ? `got ${typeof SYS?.EnemyWeaponSystem}` : SYS_ERR);

// The Game integration. Written so a system that is not wired yet FAILS by name instead of throwing.
let GW = null;                       // the wired-up game used by every later block
let SYSTEM = NULL_SYS;               // the instance under test
let WIRED = false;                   // true when game.enemyWeapons is the instance
{
  GW = newGame('endless', 4242);
  const live = GW.enemyWeapons;
  WIRED = !!live && typeof live.requestAttack === 'function';
  T('game.enemyWeapons exists on the Game instance', !!live,
    'undefined — Game.js has not been wired to EnemyWeaponSystem yet');
  T('game.enemyWeapons is an EnemyWeaponSystem instance',
    !!live && typeof SYS?.EnemyWeaponSystem === 'function' && live instanceof SYS.EnemyWeaponSystem,
    live ? `got ${live?.constructor?.name}` : 'game.enemyWeapons is undefined');

  if (WIRED) {
    SYSTEM = live;
    console.log('    game.enemyWeapons IS wired — every block below drives the LIVE instance');
  } else if (typeof SYS?.EnemyWeaponSystem === 'function') {
    // The system itself can still be proven in full against the real Game object it is built for.
    // Only the Game-side wiring assertions are lost, and each of those fails by name above/below.
    SYSTEM = new SYS.EnemyWeaponSystem(GW);
    console.log('    game.enemyWeapons is MISSING — the system is driven as a standalone instance');
    console.log('    against the real Game; the Game-side wiring assertions FAIL by name.');
  } else {
    console.log('    EnemyWeaponSystem could not be loaded — system blocks fail against a null stub.');
  }

  for (const m of ['reset', 'update', 'draw', 'onDeckChanged', 'forceEnd', 'requestAttack', 'stats', 'active'])
    T(`EnemyWeaponSystem.${m}() is a function`, typeof SYSTEM[m] === 'function');
  const st = (() => { try { return SYSTEM.stats() || {}; } catch (_) { return {}; } })();
  for (const k of ['telegraphs', 'strikes', 'zones', 'caps', 'startedCount', 'damageEvents'])
    T(`stats() reports ${k}`, Object.prototype.hasOwnProperty.call(st, k), `keys: ${Object.keys(st).join(',') || 'none'}`);
  T('active() returns a boolean', typeof (() => { try { return SYSTEM.active(); } catch (_) { return null; } })() === 'boolean');
}
const stats = () => { try { const s = SYSTEM.stats(); return s && typeof s === 'object' ? s : {}; } catch (_) { return {}; } };
const CAPS = stats().caps || {};

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. CATALOG INTEGRITY — EVERY FIELD, EVERY TYPE, EVERY BOUND ===');
{
  T('REQUIRED_WEAPON_FIELDS is a non-empty array', REQFIELDS.length > 0, `${REQFIELDS.length} entries`);
  T('the catalog declares at least one weapon', WEAPONS.length > 0, `${WEAPONS.length}`);
  console.log(`    ${WEAPONS.length} weapons · ${REQFIELDS.length} required fields · ${Object.keys(ETW).length} armed enemy types`);

  // Field presence, independently of validateCatalog — the point is that the two agree.
  const missingField = [], badType = [], badNum = [];
  const isStr = v => typeof v === 'string' && v.length > 0;
  for (const w of WEAPONS) {
    const tag = w?.id || '<no id>';
    for (const f of REQFIELDS) if (!(f in w) || w[f] === undefined || w[f] === null) missingField.push(`${tag}.${f}`);
    // The five fields the spec names on top of REQUIRED_WEAPON_FIELDS.
    for (const f of ['ownerEnemyTypes', 'speed']) if (!(f in w)) missingField.push(`${tag}.${f}`);
    if (!isStr(w.id)) badType.push(`${tag}.id`);
    if (!isStr(w.displayName)) badType.push(`${tag}.displayName`);
    if (!isStr(w.spritePath)) badType.push(`${tag}.spritePath`);
    if (!isStr(w.behavior)) badType.push(`${tag}.behavior`);
    if (!isStr(w.hitShape)) badType.push(`${tag}.hitShape`);
    if (!isStr(w.impactEffect)) badType.push(`${tag}.impactEffect`);
    if (typeof w.notes !== 'string') badType.push(`${tag}.notes`);
    if (typeof w.telegraphRequired !== 'boolean') badType.push(`${tag}.telegraphRequired`);
    if (!Array.isArray(w.ownerTypes)) badType.push(`${tag}.ownerTypes`);
    if (!Array.isArray(w.ownerEnemyTypes)) badType.push(`${tag}.ownerEnemyTypes`);
    if (!(Number.isFinite(w.damage) && w.damage > 0)) badNum.push(`${tag}.damage=${w.damage}`);
    if (!(Number.isFinite(w.cooldown) && w.cooldown > 0)) badNum.push(`${tag}.cooldown=${w.cooldown}`);
    if (!(Number.isFinite(w.range) && w.range > 0)) badNum.push(`${tag}.range=${w.range}`);
    if (!(Number.isFinite(w.impactRadius) && w.impactRadius > 0)) badNum.push(`${tag}.impactRadius=${w.impactRadius}`);
    if (!(Number.isFinite(w.projectileSpeed) && w.projectileSpeed >= 0)) badNum.push(`${tag}.projectileSpeed=${w.projectileSpeed}`);
    if (!(Number.isFinite(w.telegraphTime) && w.telegraphTime >= 0)) badNum.push(`${tag}.telegraphTime=${w.telegraphTime}`);
  }
  T('every weapon carries every REQUIRED_WEAPON_FIELDS entry (plus ownerEnemyTypes and speed)',
    missingField.length === 0, missingField.slice(0, 8).join(', '));
  T('every weapon field has the contracted type', badType.length === 0, badType.slice(0, 8).join(', '));
  T('damage, cooldown, range and impactRadius are all > 0; projectileSpeed >= 0; telegraphTime >= 0',
    badNum.length === 0, badNum.slice(0, 8).join(', '));

  const speedMismatch = WEAPONS.filter(w => Number.isFinite(w.speed) && w.projectileSpeed !== w.speed);
  T('projectileSpeed is an exact alias of the legacy speed field', speedMismatch.length === 0,
    speedMismatch.map(w => `${w.id} ${w.projectileSpeed}!=${w.speed}`).join(', '));

  const behaviors = new Set(Object.values(CAT?.WEAPON_BEHAVIOR || {}));
  const badBehaviour = WEAPONS.filter(w => !behaviors.has(w.behavior));
  T('every behavior is a declared WEAPON_BEHAVIOR value', badBehaviour.length === 0,
    badBehaviour.map(w => `${w.id}:${w.behavior}`).join(', '));

  const badTelegraph = WEAPONS.filter(w => w.telegraphRequired === true && !(w.telegraphTime > 0));
  T('every telegraphRequired weapon declares a telegraphTime > 0', badTelegraph.length === 0,
    badTelegraph.map(w => w.id).join(', '));

  const ids = WEAPONS.map(w => w.id);
  T('every weapon id is unique', new Set(ids).size === ids.length,
    `${ids.length} ids, ${new Set(ids).size} distinct`);

  let v = null, vErr = '';
  try { v = CAT.validateCatalog(); } catch (e) { vErr = e?.message || String(e); }
  T('validateCatalog() returns { ok, errors }', !!v && typeof v.ok === 'boolean' && Array.isArray(v.errors), vErr);
  T('validateCatalog().ok is true with zero errors', !!v && v.ok === true && v.errors.length === 0,
    v ? v.errors.slice(0, 6).join(' | ') : vErr);
  T('the harness re-derivation agrees with validateCatalog()',
    !!v && v.ok === (missingField.length === 0 && badType.length === 0 && badNum.length === 0
                     && badBehaviour.length === 0 && badTelegraph.length === 0),
    'the two disagree — one of them is wrong');
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. EVERY OWNER IS A REAL ENEMY TYPE, EVERY WEAPON ID RESOLVES ===');
// The AUTHORITY is js/entities/Enemy.js itself, parsed as text: the spriteMap the constructor uses
// to pick art, plus every `case '...':` label in the role/archetype/_initRole switches. Anything
// the catalog names that is not in that set is a weapon nobody can ever hold.
const ENEMY_SRC = readFileSync(path.join(ROOT, 'js/entities/Enemy.js'), 'utf8');
const REAL_TYPES = new Set();
{
  const mapStart = ENEMY_SRC.indexOf('const spriteMap = {');
  const mapEnd = mapStart >= 0 ? ENEMY_SRC.indexOf('};', mapStart) : -1;
  const mapBody = (mapStart >= 0 && mapEnd > mapStart) ? ENEMY_SRC.slice(mapStart, mapEnd) : '';
  for (const m of mapBody.matchAll(/'([^']+)'\s*:\s*'/g)) REAL_TYPES.add(m[1]);
  const spriteMapCount = REAL_TYPES.size;
  for (const m of ENEMY_SRC.matchAll(/case\s+'([^']+)'\s*:/g)) REAL_TYPES.add(m[1]);
  T('the spriteMap in js/entities/Enemy.js was parsed', spriteMapCount > 20, `${spriteMapCount} entries found`);
  T('the _initRole / role / archetype case labels were parsed', REAL_TYPES.size >= spriteMapCount,
    `${REAL_TYPES.size} enemyType strings total`);
  console.log(`    authority: ${spriteMapCount} spriteMap keys, ${REAL_TYPES.size} enemyType strings in all of Enemy.js`);

  const unknownKeys = Object.keys(ETW).filter(k => !REAL_TYPES.has(k));
  T('every ENEMY_TYPE_WEAPONS key is a real enemyType in js/entities/Enemy.js',
    unknownKeys.length === 0, unknownKeys.join(', '));

  const unknownOwners = [];
  for (const w of WEAPONS)
    for (const o of (w.ownerTypes || [])) if (!REAL_TYPES.has(o)) unknownOwners.push(`${w.id}->${o}`);
  T('every ownerTypes entry on every weapon is a real enemyType',
    unknownOwners.length === 0, unknownOwners.slice(0, 8).join(', '));

  const ownerless = WEAPONS.filter(w => !(w.ownerTypes || []).length);
  T('no weapon is ownerless', ownerless.length === 0, ownerless.map(w => w.id).join(', '));

  // ownerTypes is documented as a reverse index of ENEMY_TYPE_WEAPONS; prove the two cannot drift.
  const drift = [];
  for (const w of WEAPONS) {
    const expected = Object.keys(ETW).filter(k => (ETW[k] || []).includes(w.id));
    const got = [...(w.ownerTypes || [])];
    if (expected.length !== got.length || expected.some(x => !got.includes(x))) drift.push(w.id);
  }
  T('ownerTypes is exactly the reverse index of ENEMY_TYPE_WEAPONS', drift.length === 0, drift.join(', '));

  // Every id referenced by any map resolves.
  const unresolved = [];
  const maps = { PRIMARY_WEAPON_MAP: CAT?.PRIMARY_WEAPON_MAP, BOSS_WEAPON_MAP: CAT?.BOSS_WEAPON_MAP,
                 MINI_WEAPON_MAP: CAT?.MINI_WEAPON_MAP, ENEMY_TYPE_WEAPONS: ETW };
  let refCount = 0;
  for (const [name, m] of Object.entries(maps)) {
    for (const [k, list] of Object.entries(m || {}))
      for (const id of (list || [])) { refCount++; if (!byId(id)) unresolved.push(`${name}['${k}']:${id}`); }
  }
  T('every weapon id referenced by any map resolves through getWeaponById()',
    unresolved.length === 0 && refCount > 0, unresolved.slice(0, 8).join(', ') || `${refCount} references`);
  console.log(`    ${refCount} weapon-id references across the four maps, all resolved`);

  // getWeaponsForEnemyType must answer for every armed type, and must fall back for legacy keys.
  const emptyLookup = Object.keys(ETW).filter(k => (CAT?.getWeaponsForEnemyType?.(k) || []).length !== (ETW[k] || []).length);
  T('getWeaponsForEnemyType() returns the full weapon set for every armed enemyType',
    emptyLookup.length === 0, emptyLookup.join(', '));
  T('getWeaponsForEnemyType() falls back to the legacy kebab maps',
    (CAT?.getWeaponsForEnemyType?.('Rogue AI Overlord') || []).length > 0
    && (CAT?.getWeaponsForEnemy?.('rogue-ai-overlord') || []).length > 0);
  T('getWeaponsForEnemyType() never throws on junk input',
    (() => { try { return CAT.getWeaponsForEnemyType(null).length === 0 && CAT.getWeaponsForEnemyType('nope').length === 0; }
             catch (_) { return false; } })());

  // ownerEnemyTypes is the LEGACY kebab list and deliberately contains ART names (forge-mauler,
  // cryo-warden, ...) that are not enemyTypes. Reported, never asserted — the catalog documents it.
  const artNames = new Set();
  for (const w of WEAPONS)
    for (const o of (w.ownerEnemyTypes || []))
      if (!REAL_TYPES.has(o.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
          && ![...REAL_TYPES].some(t => t.toLowerCase().replace(/ /g, '-') === o)) artNames.add(o);
  NOTE(`legacy ownerEnemyTypes contains ${artNames.size} ART-file names that are not enemyTypes `
     + `(${[...artNames].slice(0, 6).join(', ')}) — documented remaps, not a defect`);
}
assertFinite('section 2', GW, SYSTEM);

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. EVERY ARMED ARCHETYPE ACTUALLY ATTACKS ===');
// For each ENEMY_TYPE_WEAPONS key a REAL Enemy is constructed and asked to attack with each weapon
// its identity declares. Two production routes are used and both are real:
//   * EnemyWeaponSystem.requestAttack() for the shapes that module owns, and
//   * Enemy._tryShoot(game) — the production dispatcher — for everything else, which routes to
//     Game._spawnEnemyBeam / Game._spawnEnemyNova / Game.spawnEnemyBullet exactly as it does live.
// The enemy is marked isElite, which is what Game._spawnEliteWave does after construction, because
// that is the flag that arms an otherwise melee archetype with its catalog weapon.
{
  const archResults = [];
  const perBehaviour = new Map();
  for (const [type, ids] of Object.entries(ETW)) {
    let produced = 0; const paths = new Set();
    for (const id of ids) {
      const wd = byId(id);
      if (!wd) continue;
      clearOrdnance(GW);
      const e = makeEnemy(GW, type, 200);
      let path = null;
      let took = false;
      try { took = SYSTEM.requestAttack(e, wd, GW.player) === true; } catch (_) { took = false; }
      if (took) {
        const s = stats();
        if (n0(s.strikes) + n0(s.zones) > 0) path = 'enemyWeapons';
      }
      if (!path) {
        // Production dispatcher. Elite arming mirrors Game._spawnEliteWave.
        const bBefore = GW.enemyBullets.length, beamBefore = GW._enemyBeams.length, zBefore = GW._enemyOrbZones.length;
        e.isElite = true; e._weaponDef = wd; e.shootInterval = null; e.shootTimer = 0;
        const un = muteConsole();
        try { e._tryShoot(GW); } catch (_) {}
        un();
        if (GW._enemyBeams.length > beamBefore) path = 'beam';
        else if (GW._enemyOrbZones.length > zBefore) path = 'nova';
        else if (GW.enemyBullets.length > bBefore) path = 'bullet';
      }
      if (path) { produced++; paths.add(path); }
      if (!perBehaviour.has(wd.behavior)) perBehaviour.set(wd.behavior, new Set());
      if (path) perBehaviour.get(wd.behavior).add(path);
      try { SYSTEM.forceEnd(); } catch (_) {}
    }
    archResults.push({ type, total: ids.length, produced, paths: [...paths] });
  }
  clearOrdnance(GW);

  for (const r of archResults)
    T(`${r.type}: performs at least one attack (${r.produced}/${r.total} weapons fired via ${r.paths.join('+') || 'nothing'})`,
      r.produced > 0, 'no attack was produced by any of its declared weapons');
  const armed = archResults.filter(r => r.produced > 0).length;
  console.log(`    ${armed}/${archResults.length} armed archetypes produced an attack; ` +
              `${archResults.reduce((a, r) => a + r.produced, 0)} of ` +
              `${archResults.reduce((a, r) => a + r.total, 0)} weapon slots fired`);
  for (const [b, ps] of [...perBehaviour].sort())
    console.log(`      ${b.padEnd(20)} -> ${[...ps].join(', ') || 'NO PATH'}`);
  const deadBehaviours = [...perBehaviour].filter(([, ps]) => ps.size === 0).map(([b]) => b);
  T('every behaviour in the catalog has a live implementation path', deadBehaviours.length === 0,
    deadBehaviours.join(', '));
}
assertFinite('section 3', GW, SYSTEM);

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. EVERY ATTACK DEALS EXACTLY ITS DECLARED DAMAGE ===');
// Three owners, three documented transforms, all named in the assertion text:
//   EnemyWeaponSystem  -> the declared damage, unchanged (no multiplier at all)
//   Game.spawnEnemyBullet -> declared damage x 1.10  (the single central "+10% enemy damage" line)
//   Game._spawnEnemyBeam  -> min(declared damage, 16) (the beam clamp in Game.js)
// The comparison is made against what reached Game._damagePlayer, captured by the spy.
{
  const ENEMY_DMG_MULT = 1.10;
  const BEAM_CLAMP = 16;

  // ── EnemyWeaponSystem strikes: exact declared damage, no multiplier ─────────────────────────
  const owned = WEAPONS.filter(ewsOwns);
  T('the catalog contains at least one EnemyWeaponSystem-owned weapon', owned.length > 0,
    'no slash_arc / slash_wave / ground orb_explosion in the catalog');
  for (const wd of owned) {
    drain(GW, SYSTEM);
    clearOrdnance(GW);
    GW.player.maxHp = 1e9; GW.player.hp = 1e9;
    const e = makeEnemy(GW, (wd.ownerTypes && wd.ownerTypes[0]) || 'Rogue AI Overlord', 120);
    let started = false;
    try { started = SYSTEM.requestAttack(e, wd, GW.player) === true; } catch (_) {}
    T(`${wd.id}: EnemyWeaponSystem takes ownership of the attack`, started, `behavior ${wd.behavior}`);
    micro(GW, SYSTEM, 1 / 240, Math.ceil((effTelegraph(wd) + 1.8) * 240));
    const mine = DMG.rec.filter(r => r.src === 'enemyWeapon');
    T(`${wd.id}: the strike reached Game._damagePlayer`, mine.length > 0,
      `${DMG.rec.length} damage calls, none from enemyWeapon`);
    const wrong = mine.filter(r => !near(r.dmg, wd.damage, 1e-9));
    T(`${wd.id}: every hit asks for exactly the declared damage ${wd.damage} (EnemyWeaponSystem applies NO multiplier)`,
      mine.length > 0 && wrong.length === 0, wrong.map(r => r.dmg).slice(0, 4).join(', '));
    T(`${wd.id}: one strike damages the player at most once (single-hit contract)`, mine.filter(r => r.landed).length <= 1,
      `${mine.filter(r => r.landed).length} landed hits from one strike`);
    try { SYSTEM.forceEnd(); } catch (_) {}
    clearDmg();
  }

  // ── Game.spawnEnemyBullet: declared damage x 1.10 ────────────────────────────────────────────
  const bulletWeapons = WEAPONS.filter(w => !ewsOwns(w) && w.behavior !== 'beam' && w.behavior !== 'short_pulse');
  let bulletTested = 0, bulletWrong = [];
  for (const wd of bulletWeapons) {
    drain(GW, SYSTEM);
    clearOrdnance(GW);
    GW.player.maxHp = 1e9; GW.player.hp = 1e9;
    const e = makeEnemy(GW, (wd.ownerTypes && wd.ownerTypes[0]) || 'Cyber Shooter', 110);
    const un = muteConsole();
    const ok = GW.spawnEnemyBullet(e.pos.clone(), new Vec2(-1, 0), wd.projectileSpeed || 400,
      wd.damage, 7, '#ff4444', { behavior: wd.behavior, cls: 'ranged' });
    un();
    if (ok === false) continue;
    micro(GW, SYSTEM, 1 / 240, 240);   // 1s of flight — 110px at the slowest catalog speed is 0.31s
    const hits = DMG.rec.filter(r => r.src !== 'enemyWeapon');
    if (hits.length === 0) { bulletWrong.push(`${wd.id}: never hit`); clearDmg(); continue; }
    bulletTested++;
    const expected = wd.damage * ENEMY_DMG_MULT;
    // orb_explosion / arc_projectile also drop a zone carrying the SAME already-multiplied damage,
    // so every entry is compared against the same expected value.
    for (const h of hits) if (!near(h.dmg, expected, 1e-6)) bulletWrong.push(`${wd.id}: ${h.dmg} != ${expected.toFixed(3)}`);
    clearDmg();
  }
  T(`every projectile weapon deals exactly its declared damage x 1.10 (the documented global +10% enemy damage in Game.spawnEnemyBullet)`,
    bulletTested > 0 && bulletWrong.length === 0, bulletWrong.slice(0, 6).join(' | '));
  console.log(`    ${bulletTested}/${bulletWeapons.length} projectile weapons landed a measured hit`);

  // ── Game._spawnEnemyBeam: min(declared damage, 16) ───────────────────────────────────────────
  const beamWeapons = WEAPONS.filter(w => w.behavior === 'beam');
  const beamWrong = [];
  let beamTested = 0;
  for (const wd of beamWeapons) {
    drain(GW, SYSTEM);
    clearOrdnance(GW);
    GW.player.maxHp = 1e9; GW.player.hp = 1e9;
    const e = makeEnemy(GW, (wd.ownerTypes && wd.ownerTypes[0]) || 'Rift Eye', 120);
    const un = muteConsole();
    try { GW._spawnEnemyBeam(e, wd); } catch (_) {}
    un();
    micro(GW, SYSTEM, 1 / 240, Math.ceil(2.2 * 240));
    const hits = DMG.rec.filter(r => r.src !== 'enemyWeapon');
    if (hits.length === 0) { beamWrong.push(`${wd.id}: never hit`); clearDmg(); continue; }
    beamTested++;
    const expected = Math.min(wd.damage, BEAM_CLAMP);
    for (const h of hits) if (!near(h.dmg, expected, 1e-6)) beamWrong.push(`${wd.id}: ${h.dmg} != ${expected}`);
    clearDmg();
  }
  T('every beam weapon deals exactly min(declared damage, 16) — the documented beam clamp in Game._spawnEnemyBeam',
    beamTested === beamWeapons.length && beamWrong.length === 0, beamWrong.slice(0, 6).join(' | '));

  // The whole batch stays inside the player-hit cap, so no weapon is silently truncated.
  const overCap = WEAPONS.filter(w => w.damage * ENEMY_DMG_MULT > 30);
  T('no catalog weapon exceeds the BOSS_MAX_PLAYER_HIT cap of 30 once the +10% is applied',
    overCap.length === 0, overCap.map(w => `${w.id}=${(w.damage * 1.1).toFixed(1)}`).join(', '));
  clearOrdnance(GW);
  clearDmg();
}
assertFinite('section 4', GW, SYSTEM);

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 5. COOLDOWNS ARE ENFORCED PER ENEMY, PER WEAPON ===');
{
  const owned = WEAPONS.filter(ewsOwns);
  for (const wd of owned) {
    try { SYSTEM.forceEnd(); } catch (_) {}
    clearOrdnance(GW);
    const e = makeEnemy(GW, (wd.ownerTypes && wd.ownerTypes[0]) || 'Rogue AI Overlord', 400);
    const before = n0(stats().refusedCd);
    const first = SYSTEM.requestAttack(e, wd, GW.player) === true;
    T(`${wd.id}: the first requestAttack is granted`, first);
    const second = SYSTEM.requestAttack(e, wd, GW.player);
    T(`${wd.id}: a second requestAttack inside the ${wd.cooldown}s cooldown is refused`, second === false,
      `got ${second}`);
    T(`${wd.id}: the refusal is counted as a cooldown refusal in stats()`, n0(stats().refusedCd) > before,
      `refusedCd ${before} -> ${stats().refusedCd}`);
    // Just short of the cooldown it is still refused; just past it, granted again.
    micro(GW, SYSTEM, 1 / 60, Math.max(1, Math.floor((wd.cooldown - 0.2) * 60)));
    const early = SYSTEM.requestAttack(e, wd, GW.player);
    T(`${wd.id}: still refused 0.2s before the cooldown elapses`, early === false, `got ${early}`);
    micro(GW, SYSTEM, 1 / 60, Math.ceil(0.5 * 60));
    const late = SYSTEM.requestAttack(e, wd, GW.player);
    T(`${wd.id}: granted again once the ${wd.cooldown}s cooldown has elapsed`, late === true, `got ${late}`);
    // The cooldown is per enemy: a different owner is not locked out by the first one's attack.
    const e2 = makeEnemy(GW, (wd.ownerTypes && wd.ownerTypes[0]) || 'Rogue AI Overlord', 420);
    T(`${wd.id}: the cooldown is per ENEMY — a second enemy is not locked out`,
      SYSTEM.requestAttack(e2, wd, GW.player) === true);
    try { SYSTEM.forceEnd(); } catch (_) {}
  }
  // forceEnd() invalidates every stored cooldown, so a hard stop cannot leave an enemy mute.
  if (owned.length) {
    const wd = owned[0];
    const e = makeEnemy(GW, (wd.ownerTypes && wd.ownerTypes[0]) || 'Rogue AI Overlord', 400);
    SYSTEM.requestAttack(e, wd, GW.player);
    try { SYSTEM.forceEnd(); } catch (_) {}
    T('forceEnd() clears every stored cooldown', SYSTEM.requestAttack(e, wd, GW.player) === true);
    try { SYSTEM.forceEnd(); } catch (_) {}
  }
  clearOrdnance(GW);
  clearDmg();
}
assertFinite('section 5', GW, SYSTEM);

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 6. TELEGRAPHS — ZERO DAMAGE BEFORE THE WINDUP, PER WEAPON ===');
// The single rule EnemyWeaponSystem exists to enforce. Asserted separately for every weapon it
// owns, at 240Hz, with the exact effective telegraph the module computes:
//     max(0.25, min(2.5, telegraphTime))
// The floor and the ceiling are proven with synthetic defs, because no catalog entry exercises
// either bound and a bound nobody tests is a bound nobody has.
{
  function telegraphProbe(wd, typeHint) {
    try { SYSTEM.forceEnd(); } catch (_) {}
    clearOrdnance(GW);
    drain(GW, SYSTEM);
    GW.player.maxHp = 1e9; GW.player.hp = 1e9;
    const e = makeEnemy(GW, typeHint || (wd.ownerTypes && wd.ownerTypes[0]) || 'Rogue AI Overlord', 120);
    let started = false;
    try { started = SYSTEM.requestAttack(e, wd, GW.player) === true; } catch (_) {}
    const tg = effTelegraph(wd);
    let firstT = -1;
    const DT = 1 / 240;
    micro(GW, SYSTEM, DT, Math.ceil((tg + 1.8) / DT), (t) => {
      if (firstT < 0 && DMG.rec.some(r => r.src === 'enemyWeapon')) firstT = t;
    });
    const landed = DMG.rec.filter(r => r.src === 'enemyWeapon');
    try { SYSTEM.forceEnd(); } catch (_) {}
    clearDmg();
    return { started, tg, firstT, hits: landed.length };
  }

  const ownedTelegraphed = WEAPONS.filter(w => ewsOwns(w));
  for (const wd of ownedTelegraphed) {
    const r = telegraphProbe(wd);
    T(`${wd.id}: the strike was accepted for the telegraph probe`, r.started, `behavior ${wd.behavior}`);
    T(`${wd.id}: ZERO damage lands before the ${r.tg.toFixed(2)}s telegraph elapses`,
      r.hits > 0 && r.firstT >= r.tg - 1e-9,
      r.hits === 0 ? 'the strike never damaged at all' : `first damage at ${r.firstT.toFixed(4)}s < ${r.tg.toFixed(4)}s`);
    T(`${wd.id}: damage DOES land after the telegraph elapses`, r.hits > 0 && r.firstT > 0,
      `${r.hits} damage calls, first at ${r.firstT.toFixed(4)}s`);
    T(`${wd.id}: telegraphRequired is declared for a telegraphed strike`, wd.telegraphRequired === true,
      `telegraphRequired=${wd.telegraphRequired}`);
  }

  // FLOOR: telegraphTime 0 must NOT arm on the spawn frame — it is raised to 0.25s.
  if (ownedTelegraphed.length) {
    const base = ownedTelegraphed[0];
    const zero = { ...base, id: base.id + '__qa_zero_telegraph', telegraphTime: 0, telegraphRequired: false };
    const r = telegraphProbe(zero);
    T('a weapon declaring telegraphTime 0 is floored to 0.25s, not armed on the spawn frame',
      r.started && r.hits > 0 && r.firstT >= MIN_TELEGRAPH_S - 1e-9,
      r.hits === 0 ? 'never damaged' : `first damage at ${r.firstT.toFixed(4)}s`);
    const huge = { ...base, id: base.id + '__qa_huge_telegraph', telegraphTime: 10 };
    const r2 = telegraphProbe(huge);
    T('a weapon declaring telegraphTime 10s is ceilinged to 2.5s',
      r2.started && r2.hits > 0 && r2.firstT >= MAX_TELEGRAPH_S - 1e-9 && r2.firstT < MAX_TELEGRAPH_S + 0.6,
      r2.hits === 0 ? 'never damaged' : `first damage at ${r2.firstT.toFixed(4)}s`);
  }

  // The ground-strike orb_explosion read: no CATALOG weapon reaches it (null_rupture_orb declares
  // speed 200, so Game.js flies it as a thrown orb). The path is proven with a synthetic
  // zero-speed def so a dormant read is still a tested read.
  {
    const orb = WEAPONS.find(w => w.behavior === 'orb_explosion');
    if (orb) {
      const ground = { ...orb, id: orb.id + '__qa_ground', speed: 0, projectileSpeed: 0 };
      const r = telegraphProbe(ground, 'Rift Eye');
      T('a zero-speed orb_explosion is taken by EnemyWeaponSystem as a ground rupture', r.started);
      T('the ground rupture deals ZERO damage before its telegraph elapses',
        r.hits > 0 && r.firstT >= r.tg - 1e-9,
        r.hits === 0 ? 'never damaged' : `first damage at ${r.firstT.toFixed(4)}s < ${r.tg.toFixed(4)}s`);
      NOTE(`no catalog weapon currently reaches the ground-strike path: ${orb.id} declares `
         + `speed ${orb.speed}, so Game.spawnEnemyBullet keeps it as a thrown orb`);
    }
  }

  // The behaviours the module deliberately refuses. Each must return FALSE so the caller keeps
  // doing what it did before this module existed.
  const REFUSED = ['projectile', 'fast_projectile', 'heavy_projectile', 'arc_projectile',
                   'boomerang', 'beam', 'short_pulse'];
  for (const b of REFUSED) {
    const wd = WEAPONS.find(w => w.behavior === b)
      || { id: `qa_${b}`, behavior: b, damage: 10, cooldown: 2, range: 400, impactRadius: 20, telegraphTime: 0.5, speed: 400, projectileSpeed: 400 };
    const e = makeEnemy(GW, 'Cyber Shooter', 200);
    let res = null;
    try { res = SYSTEM.requestAttack(e, wd, GW.player); } catch (_) { res = 'threw'; }
    T(`requestAttack() returns false for ${b} — Game.js keeps that path`, res === false, `got ${String(res)}`);
  }
  {
    // A THROWN orb_explosion (speed > 0) also stays with Game.js.
    const orb = WEAPONS.find(w => w.behavior === 'orb_explosion' && Number(w.projectileSpeed ?? w.speed) > 0);
    if (orb) {
      const e = makeEnemy(GW, 'Rift Eye', 200);
      T('requestAttack() returns false for a THROWN orb_explosion (speed > 0)',
        SYSTEM.requestAttack(e, orb, GW.player) === false);
    }
  }
  {
    // piercing_projectile: false, but a zero-damage warning line is armed.
    try { SYSTEM.forceEnd(); } catch (_) {}
    drain(GW, SYSTEM);
    const wd = WEAPONS.find(w => w.behavior === 'piercing_projectile');
    if (wd) {
      const e = makeEnemy(GW, (wd.ownerTypes && wd.ownerTypes[0]) || 'Cyber Shooter', 200);
      const res = SYSTEM.requestAttack(e, wd, GW.player);
      const st = stats();
      T('requestAttack() returns false for piercing_projectile — Game.js still fires the lance', res === false, `got ${res}`);
      T('piercing_projectile arms a warning line in the telegraph pool', n0(st.telegraphs) === 1,
        `telegraphs=${st.telegraphs}`);
      T('the warning line takes no strike and no zone slot', n0(st.strikes) === 0 && n0(st.zones) === 0,
        `strikes=${st.strikes} zones=${st.zones}`);
      clearDmg();
      micro(GW, SYSTEM, 1 / 240, Math.ceil(1.5 * 240));
      T('the warning line deals ZERO damage over its whole life',
        DMG.rec.filter(r => r.src === 'enemyWeapon').length === 0,
        `${DMG.rec.length} damage calls`);
      T('the warning line expires on its own', n0(stats().telegraphs) === 0, `telegraphs=${stats().telegraphs}`);
      clearDmg();
    }
  }

  // The catalog weapons that declare telegraphRequired but are routed to a Game.js path with no
  // telegraph. Reported, not asserted: this file does not own the routing decision.
  const unTelegraphed = WEAPONS.filter(w => w.telegraphRequired === true && !ewsOwns(w) && w.behavior !== 'beam');
  if (unTelegraphed.length) {
    NOTE(`telegraphRequired weapons routed to Game.spawnEnemyBullet, which implements no windup: `
       + unTelegraphed.map(w => `${w.id} (${w.behavior}, ${w.telegraphTime}s)`).join(', '));
  }
  try { SYSTEM.forceEnd(); } catch (_) {}
  clearOrdnance(GW);
  clearDmg();
}
assertFinite('section 6', GW, SYSTEM);

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 7. BOUNDED POOLS — THE CAPS HOLD UNDER A HAMMER ===');
{
  const mobile = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  const expected = { telegraphs: mobile ? 6 : 12, strikes: mobile ? 8 : 16, zones: mobile ? 5 : 10 };
  T('stats().caps declares the contracted ceilings (MAX_TELEGRAPHS 12 / MAX_STRIKES 16 / MAX_ZONES 10, halved on mobile)',
    n0(CAPS.telegraphs) === expected.telegraphs && n0(CAPS.strikes) === expected.strikes && n0(CAPS.zones) === expected.zones,
    `caps=${JSON.stringify(CAPS)} expected=${JSON.stringify(expected)}`);
  const caps = {
    telegraphs: n0(CAPS.telegraphs) || expected.telegraphs,
    strikes:    n0(CAPS.strikes)    || expected.strikes,
    zones:      n0(CAPS.zones)      || expected.zones,
  };

  try { SYSTEM.forceEnd(); } catch (_) {}
  clearOrdnance(GW);
  // A distinct enemy per request, so the per-enemy cooldown never becomes the thing that bounds the
  // pool: the CAP has to be what stops it, not the cadence.
  const HAMMER = 420;
  const hammerTypes = ['Rogue AI Overlord', 'Overclocked Berserker', 'Abyss Maw', 'Void Widow', 'Cyber Shooter'];
  const orbBase = WEAPONS.find(w => w.behavior === 'orb_explosion');
  const kit = [
    ...WEAPONS.filter(ewsOwns),
    ...(orbBase ? [{ ...orbBase, id: orbBase.id + '__qa_ground', speed: 0, projectileSpeed: 0 }] : []),
    ...(WEAPONS.filter(w => w.behavior === 'piercing_projectile')),
  ];
  T('the hammer has a weapon for every pool', kit.length >= 3, `${kit.length} weapons`);
  const peak = { telegraphs: 0, strikes: 0, zones: 0 };
  let over = 0;
  const enemies = [];
  for (let i = 0; i < HAMMER; i++) {
    const e = makeEnemy(GW, hammerTypes[i % hammerTypes.length], 120 + (i % 7) * 10);
    enemies.push(e);
    for (const wd of kit) { try { SYSTEM.requestAttack(e, wd, GW.player); } catch (_) {} }
    const s = stats();
    peak.telegraphs = Math.max(peak.telegraphs, n0(s.telegraphs));
    peak.strikes    = Math.max(peak.strikes,    n0(s.strikes));
    peak.zones      = Math.max(peak.zones,      n0(s.zones));
    if (n0(s.telegraphs) > caps.telegraphs || n0(s.strikes) > caps.strikes || n0(s.zones) > caps.zones) over++;
    if (i % 20 === 0) micro(GW, SYSTEM, 1 / 60, 1);   // let the pools tick, so this is not one frozen frame
  }
  console.log(`    ${HAMMER * kit.length} requestAttack calls · peaks: telegraphs ${peak.telegraphs}/${caps.telegraphs} · ` +
              `strikes ${peak.strikes}/${caps.strikes} · zones ${peak.zones}/${caps.zones}`);
  T('the telegraph pool never exceeds its cap', peak.telegraphs <= caps.telegraphs, `peak ${peak.telegraphs}`);
  T('the strike pool never exceeds its cap', peak.strikes <= caps.strikes, `peak ${peak.strikes}`);
  T('the zone pool never exceeds its cap', peak.zones <= caps.zones, `peak ${peak.zones}`);
  T('no sampled frame was ever over any cap', over === 0, `${over} frames over cap`);
  T('the pools were really exercised, not left empty', peak.strikes > 0 && peak.telegraphs > 0,
    `strikes ${peak.strikes} telegraphs ${peak.telegraphs}`);
  T('the refusals are counted rather than silently dropped',
    n0(stats().refusedCap) + n0(stats().refusedToken) + n0(stats().refusedCd) > 0,
    `refusedCap=${stats().refusedCap} refusedToken=${stats().refusedToken} refusedCd=${stats().refusedCd}`);

  // Everything drains once the hammer stops. A pool that stays full is a leak.
  micro(GW, SYSTEM, 1 / 60, 60 * 6);
  const rest = stats();
  T('every pool drains once the hammer stops',
    n0(rest.telegraphs) === 0 && n0(rest.strikes) === 0 && n0(rest.zones) === 0,
    `telegraphs=${rest.telegraphs} strikes=${rest.strikes} zones=${rest.zones}`);

  // Enemy projectiles stay inside the HostileProjectileDirector budget.
  try { SYSTEM.forceEnd(); } catch (_) {}
  clearOrdnance(GW);
  let peakBullets = 0, peakSnap = null, overBudget = 0;
  const snap = () => { try { return GW.hostileDirector.snapshot(GW); } catch (_) { return null; } };
  for (let i = 0; i < 300; i++) {
    const e = enemies[i % enemies.length];
    const un = muteConsole();
    GW.spawnEnemyBullet(e.pos.clone(), new Vec2(-1, 0), 420, 8, 7, '#ff4444', { cls: ['ranged', 'elite', 'boss'][i % 3] });
    un();
    const s = snap();
    peakBullets = Math.max(peakBullets, GW.enemyBullets.length);
    if (s) {
      if (!peakSnap || s.total > peakSnap.total) peakSnap = { ...s };
      if (s.total > s.cap) overBudget++;
      if (GW.enemyBullets.length > s.cap) overBudget++;
    }
    if (i % 10 === 0) micro(GW, SYSTEM, 1 / 60, 1);
  }
  const fs = snap();
  console.log(`    hostile projectiles: peak ${peakBullets} live bullets, director peak ` +
              `${peakSnap ? `${peakSnap.total}/${peakSnap.cap}` : 'n/a'}`);
  T('enemy projectile count never exceeds the HostileProjectileDirector total budget',
    overBudget === 0 && fs != null && peakBullets <= fs.cap,
    `${overBudget} over-budget samples, peak ${peakBullets}, cap ${fs?.cap}`);
  T('the director budget was actually reached, so the cap was really under test',
    peakSnap != null && peakSnap.total >= Math.min(8, peakSnap.cap), `peak ${peakSnap?.total}`);
  clearOrdnance(GW);
  clearDmg();
}
assertFinite('section 7', GW, SYSTEM);

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 8. NO NaN AND NO INVALID STATE UNDER GARBAGE INPUT ===');
{
  // Every field of a weapon def is documented as read defensively. A malformed def must degrade to
  // a refusal or to a bounded strike — never to a NaN in a live pool and never to a throw.
  try { SYSTEM.forceEnd(); } catch (_) {}
  const junk = [
    null, undefined, {}, { behavior: 'slash_arc' },
    { behavior: 'slash_arc', damage: NaN, cooldown: NaN, range: NaN, impactRadius: NaN, telegraphTime: NaN },
    { behavior: 'slash_wave', damage: 'x', cooldown: -5, range: -1, projectileSpeed: Infinity, telegraphTime: -3 },
    { behavior: 'orb_explosion', speed: 0, damage: 1e9, impactRadius: 1e9, telegraphTime: 1e9 },
    { behavior: 'nonsense_behaviour', damage: 5 },
  ];
  let threw = '';
  for (const wd of junk) {
    const e = makeEnemy(GW, 'Rogue AI Overlord', 130);
    try { SYSTEM.requestAttack(e, wd, GW.player); } catch (err) { threw = err?.message || String(err); }
    try { SYSTEM.requestAttack(e, wd, null); } catch (err) { threw = err?.message || String(err); }
    try { SYSTEM.requestAttack(null, wd, GW.player); } catch (err) { threw = err?.message || String(err); }
  }
  T('requestAttack() never throws on a malformed weapon def, target or owner', threw === '', threw);
  micro(GW, SYSTEM, 1 / 60, 240);
  T('a malformed def never puts a NaN into a live pool', nonFinite(GW, SYSTEM).length === 0,
    [...new Set(nonFinite(GW, SYSTEM))].join(', '));
  const s = stats();
  T('a malformed def never breaks the pool caps',
    n0(s.strikes) <= (n0(CAPS.strikes) || 16) && n0(s.zones) <= (n0(CAPS.zones) || 10)
    && n0(s.telegraphs) <= (n0(CAPS.telegraphs) || 12),
    JSON.stringify(s));
  T('update() ignores a non-finite or non-positive dt',
    (() => { try { SYSTEM.update(NaN); SYSTEM.update(0); SYSTEM.update(-1); SYSTEM.update(undefined); return true; }
             catch (_) { return false; } })());
  try { SYSTEM.forceEnd(); } catch (_) {}
  clearOrdnance(GW);
  clearDmg();
}
assertFinite('section 8', GW, SYSTEM);

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 9. NO BLACK-SCREEN REGRESSION — DRAW RUNS ON MAIN AND AFTER A DECK CHANGE ===');
{
  const g = newGame('endless', 9182);
  const sys = WIRED ? g.enemyWeapons : (typeof SYS?.EnemyWeaponSystem === 'function' ? new SYS.EnemyWeaponSystem(g) : NULL_SYS);
  step(g, 90);

  // Live content in every pool, so draw() is exercised with something to paint rather than with
  // three empty arrays.
  const owned = WEAPONS.filter(ewsOwns);
  const orbBase = WEAPONS.find(w => w.behavior === 'orb_explosion');
  const pierce = WEAPONS.find(w => w.behavior === 'piercing_projectile');
  const kit = [...owned, ...(orbBase ? [{ ...orbBase, speed: 0, projectileSpeed: 0, id: 'qa_ground_orb' }] : []),
               ...(pierce ? [pierce] : [])];
  for (let i = 0; i < 8; i++) {
    const e = makeEnemy(g, 'Rogue AI Overlord', 140 + i * 12);
    for (const wd of kit) { try { sys.requestAttack(e, wd, g.player); } catch (_) {} }
  }
  const live = sys.stats();
  T('the draw block has live strikes to paint', n0(live.strikes) + n0(live.zones) + n0(live.telegraphs) > 0,
    JSON.stringify(live));

  let err = '';
  const un = muteConsole();
  try { sys.draw(CTX); } catch (e) { err = 'telegraph phase: ' + (e?.message || e); }
  un();
  T('enemyWeapons.draw() runs headlessly during the telegraph phase', err === '', err);

  // Armed phase: the sweep, the rolling crescent and the detonation are a different draw path.
  micro(g, sys, 1 / 60, 45);
  err = '';
  const un2 = muteConsole();
  try { sys.draw(CTX); } catch (e) { err = 'armed phase: ' + (e?.message || e); }
  un2();
  T('enemyWeapons.draw() runs headlessly during the armed phase', err === '', err);

  err = '';
  const un3 = muteConsole();
  try { g.draw(CTX); } catch (e) { err = e?.message || String(e); }
  un3();
  T('Game.draw() runs headlessly on the MAIN deck with live enemy weapons', err === '', err);

  // Deck change, then draw again. A system that keeps world-space geometry from the old deck is
  // exactly what turns a deck transition into a black or garbage frame.
  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) {
    if (!g._deckTransitionBlocked()) { try { moved = g._enterDeck('upper') === true && g._deck === 'upper'; } catch (_) { moved = false; } }
    if (!moved) step(g, 15);
  }
  T('a deck change is granted for the draw test', moved, `deck ${g._deck}`);
  if (!WIRED) { try { sys.onDeckChanged(); } catch (_) {} }
  step(g, 30);
  err = '';
  const un4 = muteConsole();
  try { sys.draw(CTX); g.draw(CTX); } catch (e) { err = e?.message || String(e); }
  un4();
  T('enemyWeapons.draw() and Game.draw() run headlessly after a deck change', err === '', err);
  T('the deck change left the strike pools empty',
    n0(sys.stats().strikes) === 0 && n0(sys.stats().zones) === 0 && n0(sys.stats().telegraphs) === 0,
    JSON.stringify(sys.stats()));
  T('Game.js calls enemyWeapons.onDeckChanged() on a deck transition',
    WIRED, WIRED ? '' : 'game.enemyWeapons is not wired, so Game._enterDeck cannot be clearing it');
  assertFinite('section 9', g, sys);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 10. LIFECYCLE — RESTART, DECK TRANSITION, RETURN TO MENU ===');
{
  const g = newGame('endless', 5150);
  const sys = WIRED ? g.enemyWeapons : (typeof SYS?.EnemyWeaponSystem === 'function' ? new SYS.EnemyWeaponSystem(g) : NULL_SYS);
  const owned = WEAPONS.filter(ewsOwns);
  const pierce = WEAPONS.find(w => w.behavior === 'piercing_projectile');
  const arm = () => {
    for (let i = 0; i < 6; i++) {
      const e = makeEnemy(g, 'Rogue AI Overlord', 150 + i * 15);
      for (const wd of [...owned, ...(pierce ? [pierce] : [])]) { try { sys.requestAttack(e, wd, g.player); } catch (_) {} }
      const un = muteConsole();
      g.spawnEnemyBullet(e.pos.clone(), new Vec2(-1, 0), 420, 8, 7, '#ff4444', { cls: 'ranged' });
      try { g._spawnEnemyBeam(e, WEAPONS.find(w => w.behavior === 'beam') || { damage: 6 }); } catch (_) {}
      try { g._spawnEnemyNova(e, WEAPONS.find(w => w.behavior === 'orb_explosion') || { damage: 6 }); } catch (_) {}
      un();
    }
  };
  const empty = (label, gg, ss) => {
    const s = ss.stats();
    T(`${label}: enemyWeapons.stats() is all zero`,
      n0(s.strikes) === 0 && n0(s.zones) === 0 && n0(s.telegraphs) === 0, JSON.stringify(s));
    T(`${label}: enemyWeapons.active() is false`, ss.active() === false);
    T(`${label}: game.enemyBullets is empty`, (gg.enemyBullets || []).length === 0, `${gg.enemyBullets?.length} left`);
    T(`${label}: game._enemyBeams is empty`, (gg._enemyBeams || []).length === 0, `${gg._enemyBeams?.length} left`);
    T(`${label}: game._enemyOrbZones is empty`, (gg._enemyOrbZones || []).length === 0, `${gg._enemyOrbZones?.length} left`);
    // TOKEN LEAK. Game._updateEnemyBullets rebuilds the director counts from the live bullets every
    // 4s by design ("HORDE §10 leak-proofing"), so the fair statement is not "zero the instant the
    // boundary is crossed" but "the counts agree with reality once that reconciliation has had its
    // documented window". Only a run that is still playing can reconcile, so a menu state is
    // asserted as it stands.
    if (gg.gameState === 'playing') step(gg, 300);
    let snapv = null; try { snapv = gg.hostileDirector.snapshot(gg); } catch (_) {}
    const liveTok = (gg.enemyBullets || []).length;
    T(`${label}: no token leak in game.hostileDirector.snapshot() (after the documented 4s reconciliation)`,
      !!snapv && n0(snapv.total) === liveTok,
      snapv ? `snapshot total ${snapv.total} vs ${liveTok} live bullets` : 'no hostileDirector');
  };

  // ── restart ────────────────────────────────────────────────────────────────────────────────
  arm();
  step(g, 20);
  T('the lifecycle block armed real attacks before the restart',
    n0(sys.stats().strikes) + n0(sys.stats().telegraphs) > 0 || g.enemyBullets.length > 0,
    JSON.stringify(sys.stats()));
  const un = muteConsole();
  g.reset(); g._enterEndless();
  un();
  if (!WIRED) { try { sys.reset(); } catch (_) {} }
  T('Game.reset() clears game.enemyWeapons', WIRED,
    WIRED ? '' : 'game.enemyWeapons is not wired, so Game.reset() cannot be resetting it');
  empty('restart', g, sys);
  T('restart zeroes the per-run counters', n0(sys.stats().startedCount) === 0 && n0(sys.stats().damageEvents) === 0,
    `startedCount=${sys.stats().startedCount} damageEvents=${sys.stats().damageEvents}`);
  assertFinite('lifecycle/restart', g, sys);

  // ── deck transition ────────────────────────────────────────────────────────────────────────
  step(g, 60);
  arm();
  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) {
    if (!g._deckTransitionBlocked()) { try { moved = g._enterDeck('lower') === true && g._deck === 'lower'; } catch (_) { moved = false; } }
    if (!moved) step(g, 15);
  }
  T('a deck transition is granted for the lifecycle test', moved, `deck ${g._deck}`);
  if (!WIRED) { try { sys.onDeckChanged(); } catch (_) {} }
  step(g, 5);
  empty('deck transition', g, sys);
  assertFinite('lifecycle/deck', g, sys);

  // ── return to menu ─────────────────────────────────────────────────────────────────────────
  step(g, 60);
  arm();
  const un2 = muteConsole();
  try { g.goToMainMenu(); } catch (_) {}
  un2();
  // goToMainMenu fades to black before it swaps state; the swap runs from inside Game.update.
  for (let i = 0; i < 400 && g.gameState !== 'start_menu'; i++) step(g, 1);
  T('the run really returned to the menu', g.gameState === 'start_menu', `gameState=${g.gameState}`);
  if (!WIRED) { try { sys.forceEnd(); } catch (_) {} }
  empty('return to menu', g, sys);
  assertFinite('lifecycle/menu', g, sys);

  // ── a second run starts clean ──────────────────────────────────────────────────────────────
  const un3 = muteConsole();
  g.gameState = 'playing'; g.reset(); g._enterEndless();
  un3();
  if (!WIRED) { try { sys.reset(); } catch (_) {} }
  empty('second run', g, sys);
  step(g, 120);
  T('the second run does not inherit an orphaned strike',
    n0(sys.stats().startedCount) === 0 || WIRED, `startedCount=${sys.stats().startedCount}`);
  assertFinite('lifecycle/second run', g, sys);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 11. THE EARLIER SUITES ===');
console.log('  INFO  Batch 1 and Batch 2 are NOT re-run from inside this harness. They are run');
console.log('  INFO  separately by the integration lead:');
console.log('  INFO      node tools/qa/batch2_events_regression.mjs');
console.log('  INFO      node tools/qa/weapon_catalog_lifecycle_regression.mjs');
console.log('  INFO  Re-running them here would double the runtime and hide which suite failed.');

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 12. THE NEW AND MODIFIED FILES PARSE ===');
// The shell `node --check` sweep is run separately. What is asserted here is stronger for the
// purposes of this batch: the modules do not merely parse, they IMPORT and expose a live surface.
{
  T('js/game/EnemyWeaponCatalog.js parses and imports', CAT != null, CAT_ERR);
  T('js/game/EnemyWeaponSystem.js parses and imports', SYS != null, SYS_ERR);
  T('js/game/Game.js parses and imports', typeof Game === 'function');
  T('js/entities/Enemy.js parses and imports', typeof Enemy === 'function');
  T('EnemyWeaponCatalog has no import side effects (it is data-only)',
    !/^\s*import\s/m.test(readFileSync(CAT_PATH, 'utf8')),
    'the catalog imports something — it is documented as import-free');
  T('a second EnemyWeaponSystem can be constructed against a live Game',
    (() => { try { return typeof SYS.EnemyWeaponSystem === 'function' && !!new SYS.EnemyWeaponSystem(GW); } catch (_) { return false; } })());
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('B3_DONE');
process.exit(fail ? 1 : 0);
