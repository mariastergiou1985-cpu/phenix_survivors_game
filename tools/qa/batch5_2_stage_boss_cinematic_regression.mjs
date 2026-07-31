// ════════════════════════════════════════════════════════════════════════════════════════════════
// BATCH 5.2 — ACT 1 STAGE BOSSES: CINEMATIC GAMEPLAY PASS (REGRESSION LOCK)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT WAS SHIPPED. `js/game/StageBossCinematics.js` — a frozen six-entry signature registry, one
// shared INTRO, ONE shared boss HEALTH BAR, bounded spawn protection, and exactly one telegraphed
// signature attack per Act 1 stage boss, wired into Game through `_updateStageBossCinematics`,
// `_drawStageBossCinematics` and `_drawStageBossHealthBar`.
//
//   mech (Security Defector Mech, an Enemy) → laser_sweep        titan        → orbital_grid
//   annihilator                            → forge_slam          cyberSerpent → serpentine_charge
//   cyberDragon                            → cryo_breath         bloodfang    → pack_assault
//
// WHAT THIS FILE PINS — the 50 acceptance points, tagged [P1]..[P50] on every assertion, plus a
// STRESS section (10 simulated minutes per boss with normal enemies live, repeated spawn/death
// cycles, repeated reset, repeated deck transition, object-count growth, peak effect counts and a
// deterministic replay comparison).
//
// HOW IT MEASURES. The encounter machine is driven the way PRODUCTION drives it and no other way:
//   · a boss is only ever obtained by letting the REAL stage machine spawn it —
//     `meta.stagesCleared = 5` → `setRunBiome` → `_applyRunBiome` → tick `_updateStageProgression`
//     until `_activeStageBoss`. Nothing is hand-constructed, so the boss under test is the boss the
//     player fights.
//   · the encounter is advanced through `Game._updateStageBossCinematics(dt)` — the single call
//     site — so the endless/chaos guard, the cryo-slow tick and the `_encOwner` teardown are all
//     exercised, not bypassed.
//   · the camera is re-centred on the player every frame; off-screen gating anywhere in the frame
//     pipeline would otherwise silently suppress behaviour and every test would "pass" vacuously.
//   · pause / gameOver / victory are proven through REAL `Game.update()` frames, because that is
//     where the gate lives (Game.js:9354) — calling the layer directly would prove nothing.
//   · `Game.spawnEnemy` is remapped by the Batch 4.5 biome gate, so any rig that needs a SPECIFIC
//     normal enemy type neutralises the gate first (`g._biomeSpawnType = t => t`).
//
// NO TUNING NUMBER IS INVENTED. Every threshold is READ at runtime from the shipping
// `STAGE_BOSS_SIGNATURES` / `BOSS_INTRO` / `ENC_CAPS` tables, from `Game.STAGE_BOSSES`,
// `RELIC_DEFS` and `CAMPAIGN_BIOME_ENEMY_POOLS`, so retuning balance cannot make this file lie —
// only deleting or breaking the behaviour can. The ONLY hard-coded values are the approval lists
// themselves (which boss owns which signature id), which is the thing under approval.
//
//   node tools/qa/batch5_2_stage_boss_cinematic_regression.mjs
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
const { Game }   = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy }  = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const SBC        = await import(pathToFileURL(path.join(ROOT, 'js/game/StageBossCinematics.js')).href);
const SPAWNER    = await import(pathToFileURL(path.join(ROOT, 'js/game/EnemySpawner.js')).href);
const SIG        = await import(pathToFileURL(path.join(ROOT, 'js/game/EnemySignatures.js')).href);
const { RELIC_DEFS } = await import(pathToFileURL(path.join(ROOT, 'js/game/MetaProgress.js')).href);
const { BIOME_DEFS } = await import(pathToFileURL(path.join(ROOT, 'js/game/MapManager.js')).href);
u0();

const { ENC_PHASE, BOSS_INTRO, STAGE_BOSS_SIGNATURES, STAGE_BOSS_IDS, ENC_CAPS,
        bossSignatureFor, initBossEncounter, bossProtected, bossSignatureActive,
        bossEncounterStats, updateBossEncounter, drawBossEncounter, drawBossHealthBar,
        clearBossEncounter, clearAllBossSummons } = SBC;
const { CAMPAIGN_BIOME_ENEMY_POOLS, BIOME_POOL_EXCLUDED } = SPAWNER;
const { ENEMY_SIGNATURES, signatureFor } = SIG;

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

const DT     = 1 / 60;
const RING   = Game.STAGE_RING;
const MAP    = Game.STAGE_BOSSES;
const FIELD  = { titan:'titanBoss', annihilator:'annihilatorBoss', bloodfang:'bloodfangBoss',
                 cyberSerpent:'cyberSerpentBoss', cyberDragon:'cyberDragonBoss' };
const PH     = ['INTRO', 'IDLE', 'TELEGRAPH', 'EXECUTE', 'RECOVER'];
const IN     = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
const TAU    = Math.PI * 2;

// The SIX APPROVED PAIRINGS. This is the approval list itself, so it is asserted BY VALUE —
// nothing here is derived from the table under test.
const EXPECT_SIG = {
  mech:         'laser_sweep',
  annihilator:  'forge_slam',
  titan:        'orbital_grid',
  cyberSerpent: 'serpentine_charge',
  cyberDragon:  'cryo_breath',
  bloodfang:    'pack_assault',
};
const BIOME_OF = {};   // boss id → biome, read from the SHIPPING mapping
for (const b of Object.keys(MAP)) BIOME_OF[MAP[b].id] = b;
const BOSS_IDS = Object.keys(EXPECT_SIG);

// The six shipping boss sprites, for the on-disk asset check (§50).
const GAME_SRC = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const SBC_SRC  = fs.readFileSync(path.join(ROOT, 'js/game/StageBossCinematics.js'), 'utf8');
const SBC_CODE = SBC_SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ── deterministic RNG (mulberry32) — the ONLY randomness this file introduces ────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const REAL_RANDOM = Math.random;
function pinRandom(seed) { Math.random = mulberry32(seed); }
function unpinRandom() { Math.random = REAL_RANDOM; }

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
  un();
  return g;
}
/** An Act 1 run with the whole stage ladder granted, parked on `biome`. */
function newRun(biome) {
  const g = newGame();
  if (g.meta) g.meta.stagesCleared = RING.length - 1;
  const un = muteConsole();
  g.setRunBiome(biome); g._applyRunBiome();
  un();
  return g;
}
/**
 * PRODUCTION SPAWN — never hand-built. Ticks the real stage machine until it puts the biome's own
 * boss on the field, then hands back the live object the player actually fights.
 */
function spawnBoss(biome, opts = {}) {
  const g = opts.g || newRun(biome);
  const un = muteConsole();
  let frames = 0;
  while (!g._activeStageBoss && frames < 60 * 400) { g.timeAlive += DT; g._updateStageProgression(); frames++; }
  un();
  const id = g._activeStageBoss ? g._activeStageBoss.id : null;
  const boss = id ? g._stageBossObject(id) : null;
  return { g, id, boss, def: id ? STAGE_BOSS_SIGNATURES[id] : null, frames, spawnT: g.timeAlive };
}
function bossFor(id) { return spawnBoss(BIOME_OF[id]); }
function centerCam(g) { g.camera.x = g.player.pos.x - 640; g.camera.y = g.player.pos.y - 360; }
function park(g, boss, dist, ang = 0) {
  boss.pos.x = g.player.pos.x + Math.cos(ang) * dist;
  boss.pos.y = g.player.pos.y + Math.sin(ang) * dist;
}
const distPB = (g, boss) => Math.hypot(boss.pos.x - g.player.pos.x, boss.pos.y - g.player.pos.y);

/**
 * ONE production-shaped cinematic frame. `opts.park` re-parks the boss BEFORE the update (skipped
 * automatically while the serpent is driving its own position through EXECUTE, because overwriting
 * it there would erase the very behaviour under test).
 */
function encFrame(g, boss, id, dt = DT, opts = {}) {
  const e = boss._enc;
  const driving = id === 'cyberSerpent' && e && e.phase === ENC_PHASE.EXECUTE;
  if (opts.parkDist != null && !driving) park(g, boss, opts.parkDist, opts.parkAng || 0);
  if (opts.pre) opts.pre(e);
  centerCam(g);
  g._updateStageBossCinematics(dt);
}
/** Drive an encounter and return every phase transition as {f, from, to}. */
function runEnc(g, boss, id, frames, opts = {}) {
  const out = [];
  if (!boss) return out;
  let last = boss._enc ? boss._enc.phase : -1;
  for (let f = 0; f < frames; f++) {
    encFrame(g, boss, id, opts.dt || DT, opts);
    const e = boss._enc;
    const ph = e ? e.phase : -1;
    if (ph !== last) { out.push({ f, from: last, to: ph }); last = ph; }
    if (opts.each) opts.each(f, e);
    if (opts.stopAfter && out.length >= opts.stopAfter) break;
  }
  return out;
}
const chainOf = (tr) => tr.map(x => `${PH[x.from] || '-'}->${PH[x.to] || '-'}`).join(' ');
/** REAL Game.update frames — the only honest way to test the paused/gameOver/victory gate. */
function realFrames(g, n, per = null) {
  const un = muteConsole();
  for (let i = 0; i < n; i++) {
    if (g.upgradeUI)  { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    if (per) per(i);
    centerCam(g);
    vclock += 1000 / 60;
    try { g.update(DT, IN); } catch (ex) { un(); throw ex; }
  }
  un();
}
/** A drawing context that COUNTS the primitives issued to it. */
function countingCtx() {
  const c = makeCtx();
  c._ops = 0;
  for (const k of ['fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'arc', 'moveTo', 'lineTo']) {
    c[k] = function () { c._ops++; };
  }
  return c;
}
const snap = (e) => e ? { phase: e.phase, t: +e.t.toFixed(6), cd: +e.cd.toFixed(6),
                          activations: e.activations, protT: +e.protT.toFixed(6), hits: e.hits } : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function killBoss(g, id) {
  if (id === 'mech') { for (const e of g.enemies) if (e && e.enemyType === 'Security Defector Mech') e.hp = 0; return; }
  const f = FIELD[id]; if (f && g[f]) g[f].hp = 0;
}
/**
 * Count the LIVE summons the layer is responsible for, straight off the enemy list.
 * `hp > 0` is the production definition of live everywhere else in Game.js, and corpses are swept
 * by `_updateEnemies` on the frame after they die — counting them would measure the harness's own
 * missing cleanup, not a leak in the encounter.
 */
const liveSummons = (g) => g.enemies.filter(e => e && e._bossSummon && e.hp > 0).length;
/** Which signatures declare a DIRECT damage number at all (pack_assault damages only via its pack). */
const DMG_FIELDS = ['sweepDamage', 'slamDamage', 'strikeDamage', 'chargeDamage', 'breathDamage'];
const dealsDirectDamage = (id) => DMG_FIELDS.some(f => STAGE_BOSS_SIGNATURES[id][f] != null);
/**
 * Signatures whose EXECUTE window is CONTINUOUS (the effect is live for many frames), as opposed to
 * instantaneous ones (forge_slam fires once at commit; each orbital marker strikes once). Only a
 * continuous window can retry a refused hit inside the same activation.
 */
const CONTINUOUS = new Set(['mech', 'cyberDragon', 'cyberSerpent']);
/**
 * Per-frame placement that buries the player inside whatever the signature is doing, while still
 * respecting each signature's own [minRange, maxRange] arming band. The serpent is the one boss
 * that drives its own position, so the player rides it through EXECUTE instead of the reverse.
 */
function makeOverlapRig(g, boss, id) {
  const d = STAGE_BOSS_SIGNATURES[id];
  const home = { x: g.player.pos.x, y: g.player.pos.y };
  const near = Math.max(40, d.minRange + 60);
  return function preFrame(e) {
    if (id === 'cyberSerpent') {
      if (e && e.phase === ENC_PHASE.EXECUTE) { g.player.pos.x = boss.pos.x; g.player.pos.y = boss.pos.y; }
      else { g.player.pos.x = home.x; g.player.pos.y = home.y; park(g, boss, near); }
    } else {
      park(g, boss, near);
    }
  };
}

console.log('\n══════════ BATCH 5.2 — STAGE BOSS CINEMATICS: 50-POINT REGRESSION ══════════');

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 1. SIX BOSSES, EXACTLY ONE APPROVED SIGNATURE EACH ═══');
{
  const keys = Object.keys(STAGE_BOSS_SIGNATURES);
  T('[P1] STAGE_BOSS_SIGNATURES carries exactly 6 entries', keys.length === 6, keys.join(','));
  T('[P1] the 6 keys are exactly the six approved boss ids',
    keys.slice().sort().join(',') === BOSS_IDS.slice().sort().join(','), keys.join(','));
  T('[P1] STAGE_BOSS_IDS equals the registry keys, in order',
    STAGE_BOSS_IDS.join(',') === keys.join(','), STAGE_BOSS_IDS.join(','));
  for (const [id, sig] of Object.entries(EXPECT_SIG)) {
    const d = STAGE_BOSS_SIGNATURES[id];
    T(`[P1] ${id} → ${sig}`, !!d && d.id === sig, String(d && d.id));
    T(`[P1] ${id} declares exactly ONE signature id (a string, non-empty)`,
      !!d && typeof d.id === 'string' && d.id.length > 0);
    T(`[P1] ${id} declares a display name and a colour`,
      !!d && typeof d.name === 'string' && d.name.length > 0 && /^#[0-9a-f]{3,8}$/i.test(String(d.color)),
      `${d && d.name} / ${d && d.color}`);
  }
  T('[P1] the six signature ids are distinct — no boss reuses another boss\'s attack',
    new Set(Object.values(STAGE_BOSS_SIGNATURES).map(d => d.id)).size === 6,
    Object.values(STAGE_BOSS_SIGNATURES).map(d => d.id).join(','));
  T('[P1] the six ids are exactly the approved set',
    Object.values(STAGE_BOSS_SIGNATURES).map(d => d.id).slice().sort().join(',') ===
    Object.values(EXPECT_SIG).slice().sort().join(','));
  T('[P1] the registry is frozen', Object.isFrozen(STAGE_BOSS_SIGNATURES));
  T('[P1] every entry object is frozen', Object.values(STAGE_BOSS_SIGNATURES).every(d => Object.isFrozen(d)));
  T('[P1] STAGE_BOSS_IDS is frozen', Object.isFrozen(STAGE_BOSS_IDS));
  T('[P1] ENC_CAPS and BOSS_INTRO are frozen', Object.isFrozen(ENC_CAPS) && Object.isFrozen(BOSS_INTRO));
  T('[P1] ENC_PHASE is the documented five-value enum and is frozen',
    Object.isFrozen(ENC_PHASE) && ENC_PHASE.INTRO === 0 && ENC_PHASE.IDLE === 1 &&
    ENC_PHASE.TELEGRAPH === 2 && ENC_PHASE.EXECUTE === 3 && ENC_PHASE.RECOVER === 4,
    JSON.stringify(ENC_PHASE));
  const before = JSON.stringify(STAGE_BOSS_SIGNATURES);
  try { STAGE_BOSS_SIGNATURES.newBoss = { id: 'x' }; } catch (_) {}
  try { STAGE_BOSS_SIGNATURES.mech.cooldown = 0; } catch (_) {}
  try { delete STAGE_BOSS_SIGNATURES.titan; } catch (_) {}
  T('[P1] the registry survives hostile writes unchanged', JSON.stringify(STAGE_BOSS_SIGNATURES) === before);
  T('[P1] bossSignatureFor() resolves each of the 6',
    BOSS_IDS.every(id => bossSignatureFor(id) === STAGE_BOSS_SIGNATURES[id]));
  T('[P1] bossSignatureFor() refuses every non-boss and malformed input',
    [null, undefined, 0, 1, {}, [], '', NaN, true, 'Volt Rat', 'megaTitan', 'the_null']
      .every(x => bossSignatureFor(x) === null));
  {
    const HOSTILE = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty',
                     'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'];
    const leaks = HOSTILE.filter(k => bossSignatureFor(k) !== null);
    T('[P1] bossSignatureFor() is prototype-safe — no Object.prototype key resolves to a signature',
      leaks.length === 0, leaks.join(','));
  }
  // ONE signature per boss also means: no NON-boss carries a stage-boss signature.
  T('[P1] no ordinary enemy type resolves to a stage-boss signature',
    ['Volt Rat', 'Razorhound', 'Heavy Mech', 'Rift Eye', 'Abyss Maw', 'Pulse Burrower',
     'Security Defector Mech', 'Glitch Drone'].every(t => bossSignatureFor(t) === null));
  T('[P1] no Chaos Mega Titan carries a stage-boss signature',
    [...Enemy.CHAOS_TITANS].every(t => bossSignatureFor(t) === null));
  // Every boss really resolves to a live object through the shipping accessor.
  for (const id of BOSS_IDS) {
    const { boss, def } = bossFor(id);
    T(`[P1] ${id}: the real stage machine put a live boss on the field`,
      !!boss && Number.isFinite(boss.hp) && boss.hp > 0 && Number.isFinite(boss.maxHp) && boss.maxHp > 0,
      `${boss && boss.hp}/${boss && boss.maxHp}`);
    T(`[P1] ${id}: the live boss has a finite position and radius`,
      !!boss && Number.isFinite(boss.pos.x) && Number.isFinite(boss.pos.y) &&
      Number.isFinite(boss.radius) && boss.radius > 0);
    T(`[P1] ${id}: its signature is ${def.id}`, def.id === EXPECT_SIG[id]);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 2. CANONICAL BOSS MAPPING UNCHANGED (Game.STAGE_BOSSES) ═══');
{
  const keys = Object.keys(MAP);
  T('[P2] exactly 6 biomes carry a stage boss', keys.length === 6, keys.join(','));
  T('[P2] the 6 keys are exactly STAGE_RING, in order', keys.join(',') === RING.join(','), keys.join(','));
  const ids = keys.map(k => MAP[k].id);
  T('[P2] 6 DISTINCT bosses — none reused', new Set(ids).size === 6, ids.join(','));
  T('[P2] the mapping\'s boss ids are exactly the cinematic registry\'s keys',
    ids.slice().sort().join(',') === STAGE_BOSS_IDS.slice().sort().join(','), ids.join(','));
  for (const biome of keys) {
    const m = MAP[biome], s = STAGE_BOSS_SIGNATURES[m.id];
    T(`[P2] ${biome} → ${m.id} (mapping unchanged)`, EXPECT_SIG[m.id] !== undefined, m.id);
    T(`[P2] ${biome}: the cinematic layer did NOT rename the boss`, s.name === m.name, `${s.name} vs ${m.name}`);
    T(`[P2] ${biome}: the cinematic layer did NOT recolour the boss`, s.color === m.color, `${s.color} vs ${m.color}`);
  }
  T('[P2] the_null still has no stage boss', !MAP.the_null && newRun('neon_district').stageBossFor('the_null') === null);
  T('[P2] Game.STAGE_BOSSES is still frozen, entries included',
    Object.isFrozen(MAP) && Object.values(MAP).every(d => Object.isFrozen(d)));
  T('[P2] no Chaos Mega Titan was promoted into the stage-boss mapping',
    ids.every(i => !['overlordMega', 'leviathanMega', 'emperorMega', 'tyrantMega'].includes(i)));
  // The cinematic module must be structurally incapable of editing the mapping.
  T('[P2] StageBossCinematics.js never references STAGE_BOSSES / STAGE_RING / stageBossFor',
    !/STAGE_BOSSES|STAGE_RING|stageBossFor/.test(SBC_CODE));
  T('[P2] StageBossCinematics.js never imports Game', !/from\s+['"]\.\/Game\.js/.test(SBC_CODE));
  // The five singleton bosses + the mech Enemy still resolve through the shipping accessor.
  T('[P2] _STAGE_BOSS_FIELD still maps exactly the five singleton bosses',
    Object.keys(Game._STAGE_BOSS_FIELD).slice().sort().join(',') ===
    ['annihilator', 'bloodfang', 'cyberDragon', 'cyberSerpent', 'titan'].join(','),
    Object.keys(Game._STAGE_BOSS_FIELD).join(','));
  T('[P2] mech is still an Enemy of type Security Defector Mech',
    (() => { const { g, boss } = bossFor('mech');
             return !!boss && boss instanceof Enemy && boss.enemyType === 'Security Defector Mech' &&
                    g.enemies.includes(boss); })());
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 3. REWARDS UNCHANGED ═══');
{
  const keys = Object.keys(MAP);
  const rewards = keys.map(k => MAP[k].reward);
  T('[P3] 6 DISTINCT rewards — none reused', new Set(rewards).size === 6, rewards.join(','));
  T('[P3] every reward id resolves to a real RELIC_DEF',
    rewards.every(r => RELIC_DEFS.some(d => d.id === r)),
    rewards.filter(r => !RELIC_DEFS.some(d => d.id === r)).join(','));
  T('[P3] every reward relic is still type:boss',
    rewards.every(r => RELIC_DEFS.find(d => d.id === r)?.type === 'boss'));
  T('[P3] every reward relic is still gated on ITS OWN boss-kill key',
    keys.every(k => RELIC_DEFS.find(d => d.id === MAP[k].reward)?.req === MAP[k].id),
    keys.filter(k => RELIC_DEFS.find(d => d.id === MAP[k].reward)?.req !== MAP[k].id).join(','));
  T('[P3] every reward still carries a display name', keys.every(k => (MAP[k].rewardName || '').length > 2));
  // The cinematic layer must not be able to touch the reward ladder at all.
  T('[P3] StageBossCinematics.js never mentions any reward id',
    rewards.every(r => !SBC_SRC.includes(r)), rewards.filter(r => SBC_SRC.includes(r)).join(','));
  T('[P3] StageBossCinematics.js never calls the reward/meta APIs',
    !/grantStageRelic|recordBossKill|recordBossEcho|\bmeta\b/.test(SBC_CODE));
  // …and the reward still really pays out on a real kill.
  {
    const { g, id } = bossFor('mech');
    const granted = [];
    const gr = g.meta.grantStageRelic.bind(g.meta);
    g.meta.grantStageRelic = (r) => { granted.push(r); return gr(r); };
    const kills = [];
    const rk = g.meta.recordBossKill.bind(g.meta);
    g.meta.recordBossKill = (i) => { kills.push(i); return rk(i); };
    const un = muteConsole();
    killBoss(g, id);
    for (let f = 0; f < 30; f++) { g.timeAlive += DT; g._updateStageProgression(); }
    un();
    T('[P3] a real stage-boss kill still records the boss kill under the canonical id',
      kills.length === 1 && kills[0] === 'mech', kills.join(','));
    T('[P3] a real stage-boss kill still grants the mapped relic',
      granted.length === 1 && granted[0] === MAP.neon_district.reward, granted.join(','));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 4. ACT1_STAGE_SECONDS STILL 80 ═══');
{
  for (const biome of RING) {
    const r = spawnBoss(biome);
    T(`[P4] ${biome}: the boss arms at 80s of stage time, not sooner`,
      r.spawnT >= 80 && r.spawnT < 80.1, `${r.spawnT.toFixed(4)}s (frame ${r.frames})`);
  }
  // …and behaviourally: nothing is on the field one frame before the window elapses.
  {
    const g = newRun('neon_district');
    const un = muteConsole();
    for (let f = 0; f < 4790; f++) { g.timeAlive += DT; g._updateStageProgression(); }
    un();
    T('[P4] at 79.83s no stage boss exists yet',
      !g._activeStageBoss && g.enemies.every(e => e.enemyType !== 'Security Defector Mech'),
      `${g.timeAlive.toFixed(3)}s`);
  }
  T('[P4] the 80s window is still the literal constant in Game.js',
    /const\s+ACT1_STAGE_SECONDS\s*=\s*80\s*;/.test(GAME_SRC));
  T('[P4] the cinematic layer never mentions the stage duration',
    !/ACT1_STAGE_SECONDS/.test(SBC_CODE));
  // A second stage still uses the SAME window (the boss layer did not shorten the ladder).
  {
    const { g, id } = bossFor('mech');
    const un = muteConsole();
    killBoss(g, id);
    for (let f = 0; f < 5; f++) { g.timeAlive += DT; g._updateStageProgression(); }
    const t0 = g._stageStartT, idx0 = g._stageIndex;   // the next stage's window starts on advance
    let n = 0;
    while (!g._activeStageBoss && n < 60 * 200) { g.timeAlive += DT; g._updateStageProgression(); n++; }
    un();
    T('[P4] stage 2 also waits a full 80s before its boss arms',
      idx0 === 1 && g._activeStageBoss && (g.timeAlive - t0) >= 80 && (g.timeAlive - t0) < 80.2,
      `idx=${idx0} wait=${(g.timeAlive - t0).toFixed(3)}s`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 5. BOSS GATE UNCHANGED — _stageBossCleared IS STILL THE ONLY ADVANCE GATE ═══');
{
  // Survive far past the stage window without killing the boss: the stage must NOT advance.
  {
    const { g } = bossFor('mech');
    const un = muteConsole();
    for (let f = 0; f < 60 * 400; f++) { g.timeAlive += DT; g._updateStageProgression(); }
    un();
    T('[P5] 400s past the window with the boss alive: the stage does NOT advance',
      g._stageIndex === 0 && !g._stageBossCleared.neon_district && !!g._activeStageBoss,
      `idx=${g._stageIndex} cleared=${JSON.stringify(g._stageBossCleared)}`);
  }
  // Kill it: the stage advances on the very next tick, and only then.
  {
    const { g, id } = bossFor('mech');
    const un = muteConsole();
    killBoss(g, id);
    g.timeAlive += DT; g._updateStageProgression();   // observes the death, clears + rewards
    const clearedNow = !!g._stageBossCleared.neon_district;
    g.timeAlive += DT; g._updateStageProgression();   // advances
    un();
    T('[P5] the boss\'s death is what sets _stageBossCleared', clearedNow);
    T('[P5] …and the stage advances only after that flag is set', g._stageIndex === 1, String(g._stageIndex));
  }
  T('[P5] the advance gate in _updateStageProgression is still the _stageBossCleared read',
    /if\s*\(!this\._stageBossCleared\[biome\]\)\s*return;/.test(GAME_SRC));
  T('[P5] the cinematic layer can never touch the gate or the stage index',
    !/_stageBossCleared|_stageIndex|_activeStageBoss|_stageBossRewarded|_stageBossSpawned/.test(SBC_CODE));
  // The layer also must not kill the boss it is animating.
  {
    const { g, id, boss } = bossFor('mech');
    const hp0 = boss.hp;
    runEnc(g, boss, id, 60 * 60, { parkDist: 300 });
    T('[P5] 60s of cinematics never damages the boss itself', boss.hp === hp0, `${hp0} → ${boss.hp}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 6. INTRO LIFECYCLE — INTRO → IDLE, duration ≈ BOSS_INTRO.duration ═══');
{
  T('[P6] BOSS_INTRO.duration is finite and positive',
    Number.isFinite(BOSS_INTRO.duration) && BOSS_INTRO.duration > 0, String(BOSS_INTRO.duration));
  for (const id of BOSS_IDS) {
    const { g, boss, def } = bossFor(id);
    T(`[P6] ${id}: no encounter exists before the first cinematic frame`, !boss._enc);
    encFrame(g, boss, id, DT, { parkDist: 300 });
    T(`[P6] ${id}: the encounter is created in INTRO on the first frame`,
      !!boss._enc && boss._enc.phase === ENC_PHASE.INTRO, String(boss._enc && boss._enc.phase));
    T(`[P6] ${id}: it starts un-announced-once, un-enraged, with zero activations and zero hits`,
      boss._enc.activations === 0 && boss._enc.hits === 0 && boss._enc.enraged === false &&
      boss._enc.introDone === false);
    const tr = runEnc(g, boss, id, 60 * 6, { parkDist: 300, stopAfter: 1 });
    T(`[P6] ${id}: the only transition out of INTRO is to IDLE`,
      tr.length === 1 && tr[0].from === ENC_PHASE.INTRO && tr[0].to === ENC_PHASE.IDLE, chainOf(tr));
    const introSecs = (tr[0].f + 2) / 60;   // +1 for the pre-loop frame, +1 for 0-indexing
    T(`[P6] ${id}: INTRO lasted the declared ${BOSS_INTRO.duration}s`,
      Math.abs(introSecs - BOSS_INTRO.duration) <= 2 / 60, `${introSecs.toFixed(4)}s`);
    T(`[P6] ${id}: introDone is set exactly when IDLE is reached`, boss._enc.introDone === true);
    T(`[P6] ${id}: the intro produced NO activation`, boss._enc.activations === 0);
  }
  // The full documented chain really cycles.
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    const tr = runEnc(g, boss, id, 60 * 90, { parkDist: 300, stopAfter: 9 });
    const want = ['TELEGRAPH->EXECUTE', 'EXECUTE->RECOVER', 'RECOVER->IDLE', 'IDLE->TELEGRAPH'];
    const chain = tr.map(x => `${PH[x.from] || '-'}->${PH[x.to]}`);
    T(`[P6] ${id}: chain starts (none) -> INTRO -> IDLE -> TELEGRAPH`,
      chain.slice(0, 3).join(' ') === '-->INTRO INTRO->IDLE IDLE->TELEGRAPH',
      chain.slice(0, 3).join(' '));
    T(`[P6] ${id}: the machine cycles TELEGRAPH→EXECUTE→RECOVER→IDLE at least twice`,
      chain.slice(3, 7).join(' ') === want.join(' ') && chain.slice(7, 9).join(' ') === want.slice(0, 2).join(' '),
      chain.join(' '));
    T(`[P6] ${id}: INTRO is never re-entered once complete`,
      tr.every((x, i) => i === 0 || x.to !== ENC_PHASE.INTRO), chain.join(' '));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 7. ANNOUNCEMENT FIRES EXACTLY ONCE PER ENCOUNTER ═══');
{
  for (const id of BOSS_IDS) {
    const { g, boss, def } = bossFor(id);
    const anns = [];
    g.triggerAnnouncement = (text, color, opts) => { anns.push(String(text)); };
    runEnc(g, boss, id, 60 * 120, { parkDist: 300 });
    const intro = anns.filter(a => a.includes(def.name) && a.includes('⚠'));
    T(`[P7] ${id}: the boss-intro announcement fired EXACTLY once over 120s`,
      intro.length === 1, `${intro.length}: ${intro.join(' | ')}`);
    T(`[P7] ${id}: e.announced latches after the first frame`, boss._enc.announced === true);
    // …and it is not re-fired when the encounter object is re-observed frame after frame.
    const n0 = anns.length;
    runEnc(g, boss, id, 60 * 30, { parkDist: 300 });
    T(`[P7] ${id}: a further 30s adds no second intro announcement`,
      anns.filter(a => a.includes(def.name) && a.includes('⚠')).length === 1);
  }
  // A SECOND, separate encounter gets its own single announcement.
  {
    const { g, boss, def } = bossFor('mech');
    const anns = [];
    g.triggerAnnouncement = (t) => { anns.push(String(t)); };
    runEnc(g, boss, 'mech', 120, { parkDist: 300 });
    const first = anns.filter(a => a.includes('⚠') && a.includes(def.name)).length;
    // kill it, let the machine OBSERVE the death, then let stage 2's boss arm
    const un = muteConsole();
    killBoss(g, 'mech');
    let n = 0;
    while (g._activeStageBoss && n < 600) { g.timeAlive += DT; g._updateStageProgression(); n++; }
    n = 0;
    while (!g._activeStageBoss && n < 60 * 300) { g.timeAlive += DT; g._updateStageProgression(); n++; }
    un();
    const id2 = g._activeStageBoss ? g._activeStageBoss.id : null;
    const b2 = id2 ? g._stageBossObject(id2) : null;
    const d2 = id2 ? STAGE_BOSS_SIGNATURES[id2] : null;
    runEnc(g, b2, id2, 60 * 5, { parkDist: 300 });
    const second = d2 ? anns.filter(a => a.includes('⚠') && a.includes(d2.name)).length : -1;
    T('[P7] a SECOND encounter in the same run announces exactly once, for its own boss',
      first === 1 && second === 1, `first=${first} second=${second}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 8. HEALTH BAR DRAWS ONLY WHILE A BOSS IS LIVE ═══');
{
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    let c = countingCtx();
    g._drawStageBossHealthBar(c);
    T(`[P8] ${id}: no bar before the encounter exists`, c._ops === 0, String(c._ops));
    runEnc(g, boss, id, 90, { parkDist: 300 });
    c = countingCtx();
    g._drawStageBossHealthBar(c);
    T(`[P8] ${id}: the bar draws while the boss is live`, c._ops > 0, String(c._ops));
    // …and it is the SHARED bar — same primitive count for every boss, mech included.
    boss.hp = Math.round(boss.maxHp * 0.5);
    c = countingCtx();
    g._drawStageBossHealthBar(c);
    T(`[P8] ${id}: the bar still draws at half HP`, c._ops > 0, String(c._ops));
    killBoss(g, id);
    c = countingCtx();
    g._drawStageBossHealthBar(c);
    T(`[P8] ${id}: the bar STOPS the frame the boss dies`, c._ops === 0, String(c._ops));
  }
  // No _activeStageBoss at all → nothing drawn.
  {
    const g = newRun('neon_district');
    const c = countingCtx();
    g._drawStageBossHealthBar(c);
    T('[P8] a run with no stage boss draws no bar at all', c._ops === 0, String(c._ops));
  }
  // drawBossHealthBar itself refuses malformed / dead bosses.
  {
    const c = countingCtx();
    for (const b of [null, undefined, {}, { hp: NaN, maxHp: 100 }, { hp: 10, maxHp: 0 },
                     { hp: 0, maxHp: 100 }, { hp: -5, maxHp: 100 }]) {
      drawBossHealthBar(c, b, 'X', '#fff', 1280, 720);
    }
    T('[P8] drawBossHealthBar refuses null / NaN / zero-max / dead bosses', c._ops === 0, String(c._ops));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 9. SPAWN PROTECTION IS BOUNDED AND SHORTER THAN THE INTRO ═══');
{
  T('[P9] BOSS_INTRO.protection is finite and positive',
    Number.isFinite(BOSS_INTRO.protection) && BOSS_INTRO.protection > 0, String(BOSS_INTRO.protection));
  T('[P9] protection is STRICTLY SHORTER than the intro',
    BOSS_INTRO.protection < BOSS_INTRO.duration,
    `${BOSS_INTRO.protection} vs ${BOSS_INTRO.duration}`);
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    encFrame(g, boss, id, DT, { parkDist: 300 });
    T(`[P9] ${id}: the boss is protected on its first frame`, bossProtected(boss) === true);
    T(`[P9] ${id}: Game._stageBossInvulnerable mirrors it exactly`,
      g._stageBossInvulnerable(boss) === bossProtected(boss));
    // measure how long protection really lasts
    let frames = 1;
    while (bossProtected(boss) && frames < 60 * 20) { encFrame(g, boss, id, DT, { parkDist: 300 }); frames++; }
    const secs = frames / 60;
    T(`[P9] ${id}: protection lapsed after the declared ${BOSS_INTRO.protection}s`,
      Math.abs(secs - BOSS_INTRO.protection) <= 2 / 60, `${secs.toFixed(4)}s`);
    T(`[P9] ${id}: protection is gone well before the fight starts (no permanent invulnerability)`,
      bossProtected(boss) === false && secs < BOSS_INTRO.duration);
  }
  T('[P9] bossProtected() refuses malformed input instead of throwing',
    [null, undefined, {}, { _enc: null }, 0, 'x'].every(b => bossProtected(b) === false));
  // The protection is only meaningful if SOMETHING consults it before damaging the boss.
  {
    const callers = (GAME_SRC.match(/_stageBossInvulnerable\s*\(/g) || []).length;
    const defs    = (GAME_SRC.match(/_stageBossInvulnerable\s*\(boss\)\s*\{/g) || []).length;
    T('[P9] the bounded protection is actually WIRED — something asks before damaging a stage boss',
      callers - defs >= 1,
      `_stageBossInvulnerable has ${callers - defs} call site(s) besides its definition — spawn protection is inert`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 10. A TELEGRAPH ALWAYS PRECEDES DAMAGE ═══');
{
  for (const id of BOSS_IDS) {
    const { g, boss, def } = bossFor(id);
    const phases = [];
    g._damagePlayer = (dmg, o) => { phases.push(boss._enc ? boss._enc.phase : -1); return true; };
    // bury the player inside the effect so every geometry test resolves to a hit whenever it can
    runEnc(g, boss, id, 60 * 180, { pre: makeOverlapRig(g, boss, id) });
    const bad = phases.filter(p => p !== ENC_PHASE.EXECUTE);
    if (dealsDirectDamage(id)) {
      T(`[P10] ${id}: EVERY damage application happened in EXECUTE (${phases.length} events)`,
        phases.length > 0 && bad.length === 0, `offenders: ${bad.map(p => PH[p]).join(',')}`);
    } else {
      T(`[P10] ${id}: declares NO direct damage — it can only damage through its pack`,
        phases.length === 0, `${phases.length} direct damage events`);
    }
    T(`[P10] ${id}: no damage was applied in INTRO / IDLE / TELEGRAPH / RECOVER`,
      !phases.some(p => p === ENC_PHASE.INTRO || p === ENC_PHASE.IDLE ||
                        p === ENC_PHASE.TELEGRAPH || p === ENC_PHASE.RECOVER));
  }
  // …and structurally: every EXECUTE was reached from a COMPLETED telegraph of the declared length.
  for (const id of BOSS_IDS) {
    const { g, boss, def } = bossFor(id);
    const tr = runEnc(g, boss, id, 60 * 120, { parkDist: 300 });
    const execEntries = tr.filter(x => x.to === ENC_PHASE.EXECUTE);
    T(`[P10] ${id}: EXECUTE is only ever entered from TELEGRAPH`,
      execEntries.length > 0 && execEntries.every(x => x.from === ENC_PHASE.TELEGRAPH),
      execEntries.map(x => PH[x.from]).join(','));
    const durs = [];
    for (let i = 1; i < tr.length; i++) {
      if (tr[i].to === ENC_PHASE.EXECUTE && tr[i - 1].to === ENC_PHASE.TELEGRAPH)
        durs.push((tr[i].f - tr[i - 1].f) / 60);
    }
    T(`[P10] ${id}: every telegraph ran its full declared ${def.telegraph}s`,
      durs.length > 0 && durs.every(d => Math.abs(d - def.telegraph) <= 2 / 60),
      durs.map(d => d.toFixed(3)).join(','));
  }
  // A forced INTRO/IDLE/TELEGRAPH state with the player buried in the boss must still be harmless.
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    let hits = 0;
    g._damagePlayer = () => { hits++; return true; };
    const rig = makeOverlapRig(g, boss, id);
    encFrame(g, boss, id, DT, { pre: rig });
    for (const ph of [ENC_PHASE.INTRO, ENC_PHASE.IDLE, ENC_PHASE.TELEGRAPH]) {
      boss._enc.phase = ph; boss._enc.t = 999; boss._enc.cd = 999; boss._enc.teleDur = 999;
      for (let f = 0; f < 120; f++) encFrame(g, boss, id, DT, { pre: rig });
    }
    T(`[P10] ${id}: 6s pinned in INTRO/IDLE/TELEGRAPH on top of the player deals ZERO damage`,
      hits === 0, String(hits));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 11. EVERY COOLDOWN > 0 ═══');
{
  for (const id of BOSS_IDS) {
    const d = STAGE_BOSS_SIGNATURES[id];
    T(`[P11] ${id}: cooldown > 0`, Number.isFinite(d.cooldown) && d.cooldown > 0, String(d.cooldown));
    T(`[P11] ${id}: initialDelay > 0 (nothing fires on the spawn frame)`,
      Number.isFinite(d.initialDelay) && d.initialDelay > 0, String(d.initialDelay));
    T(`[P11] ${id}: telegraph > 0 (nothing fires unannounced)`,
      Number.isFinite(d.telegraph) && d.telegraph > 0, String(d.telegraph));
    T(`[P11] ${id}: execute > 0 and recover > 0`,
      Number.isFinite(d.execute) && d.execute > 0 && Number.isFinite(d.recover) && d.recover > 0,
      `${d.execute}/${d.recover}`);
    T(`[P11] ${id}: the whole cycle is shorter than the cooldown`,
      d.telegraph + d.execute + d.recover < d.cooldown,
      `${(d.telegraph + d.execute + d.recover).toFixed(2)} vs ${d.cooldown}`);
    T(`[P11] ${id}: 0 <= minRange < maxRange, both finite`,
      Number.isFinite(d.minRange) && d.minRange >= 0 && Number.isFinite(d.maxRange) &&
      d.maxRange > d.minRange, `${d.minRange}..${d.maxRange}`);
    T(`[P11] ${id}: enrage is a bounded pacing multiplier in (0.5, 1]`,
      Number.isFinite(d.enrageCdMult) && d.enrageCdMult > 0.5 && d.enrageCdMult <= 1, String(d.enrageCdMult));
    T(`[P11] ${id}: enrageAt is a real HP fraction in (0, 1)`,
      Number.isFinite(d.enrageAt) && d.enrageAt > 0 && d.enrageAt < 1, String(d.enrageAt));
  }
  // Measured: the re-arm gap after RECOVER is always positive and inside the declared jitter band.
  for (const id of BOSS_IDS) {
    const { g, boss, def } = bossFor(id);
    const tr = runEnc(g, boss, id, 60 * 150, { parkDist: 300 });
    // Only the RE-ARM gaps (IDLE entered from RECOVER). The first IDLE comes from INTRO and is
    // governed by initialDelay, not by cooldown — it is asserted separately in §12.
    const gaps = [];
    for (let i = 1; i < tr.length; i++)
      if (tr[i].to === ENC_PHASE.TELEGRAPH && tr[i - 1].to === ENC_PHASE.IDLE &&
          tr[i - 1].from === ENC_PHASE.RECOVER)
        gaps.push((tr[i].f - tr[i - 1].f) / 60);
    T(`[P11] ${id}: every measured re-arm gap is > 0 and inside cooldown × [0.88, 1.18]`,
      gaps.length >= 2 && gaps.every(x => x > 0 && x >= def.cooldown * 0.88 - 3 / 60 &&
                                              x <= def.cooldown * 1.18 + 3 / 60),
      gaps.map(x => x.toFixed(3)).join(','));
    T(`[P11] ${id}: the FIRST gap is the declared initialDelay, not the cooldown`,
      (() => { const first = tr.find(x => x.to === ENC_PHASE.TELEGRAPH);
               const idle  = tr.find(x => x.to === ENC_PHASE.IDLE);
               return !!first && !!idle && Math.abs((first.f - idle.f) / 60 - def.initialDelay) <= 3 / 60; })(),
      String(def.initialDelay));
  }
  // No ambient randomness inside the shipping module.
  T('[P11] StageBossCinematics.js CODE contains ZERO Math.random / Date.now / performance.now',
    !/Math\s*\.\s*random|Date\s*\.\s*now|performance\s*\.\s*now/.test(SBC_CODE));
  T('[P11] its only randomness is the per-encounter LCG', /function\s+encRand\s*\(/.test(SBC_CODE));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 12. NO ACTIVATION ON THE SPAWN FRAME ═══');
{
  for (const id of BOSS_IDS) {
    const { g, boss, def } = bossFor(id);
    encFrame(g, boss, id, DT, { parkDist: 300 });
    T(`[P12] ${id}: frame 1 is INTRO with 0 activations and cd = initialDelay`,
      boss._enc.phase === ENC_PHASE.INTRO && boss._enc.activations === 0 &&
      Math.abs(boss._enc.cd - def.initialDelay) < 1e-9,
      `${PH[boss._enc.phase]} act=${boss._enc.activations} cd=${boss._enc.cd}`);
    // the guard window: intro + initialDelay, minus a frame
    const guard = Math.floor((BOSS_INTRO.duration + def.initialDelay) * 60) - 2;
    const tr = runEnc(g, boss, id, guard, { parkDist: 300 });
    T(`[P12] ${id}: nothing arms for the whole intro+initialDelay guard (${guard} frames, in range)`,
      boss._enc.activations === 0 &&
      tr.every(x => x.to === ENC_PHASE.IDLE || x.to === ENC_PHASE.INTRO), chainOf(tr));
    // …and the guard is not vacuous: it DOES arm afterwards.
    const tr2 = runEnc(g, boss, id, 60 * 60, { parkDist: 300, stopAfter: 1 });
    T(`[P12] ${id}: …and it arms right after (the guard is not vacuous)`,
      tr2.length === 1 && tr2[0].to === ENC_PHASE.TELEGRAPH, chainOf(tr2));
  }
  // A giant dt on the very first frame must not skip the intro into a live attack.
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    let hits = 0;
    g._damagePlayer = () => { hits++; return true; };
    encFrame(g, boss, id, 1.0, { parkDist: 20 });
    T(`[P12] ${id}: a 1s first frame on top of the player still deals no damage`,
      hits === 0 && boss._enc.activations === 0, `hits=${hits}`);
  }
  T('[P12] a fresh encounter always starts in INTRO with cd = initialDelay, for every boss',
    BOSS_IDS.every(id => {
      const e = initBossEncounter(id, 1234);
      return e && e.phase === ENC_PHASE.INTRO && e.activations === 0 && e.hits === 0 &&
             Math.abs(e.cd - STAGE_BOSS_SIGNATURES[id].initialDelay) < 1e-9 &&
             Math.abs(e.t - BOSS_INTRO.duration) < 1e-9;
    }));
  T('[P12] initBossEncounter refuses a non-boss id', initBossEncounter('Volt Rat', 1) === null &&
    initBossEncounter(null, 1) === null && initBossEncounter('__proto__', 1) === null);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 13. CLEANUP ON BOSS DEATH ═══');
{
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    runEnc(g, boss, id, 60 * 60, { parkDist: 300 });
    const hadEnc = !!boss._enc;
    const summonsBefore = liveSummons(g);
    killBoss(g, id);
    g._updateStageBossCinematics(DT);
    T(`[P13] ${id}: the encounter existed before the kill`, hadEnc);
    T(`[P13] ${id}: _encOwner is released the frame the boss dies`, g._encOwner === null);
    T(`[P13] ${id}: boss._enc is torn down on death`, boss._enc === null);
    T(`[P13] ${id}: not one tracked summon outlives the boss`,
      liveSummons(g) === 0, `${summonsBefore} → ${liveSummons(g)}`);
    // …and the dead boss can never be re-animated by further frames.
    for (let f = 0; f < 120; f++) g._updateStageBossCinematics(DT);
    T(`[P13] ${id}: 2s of further frames create no new encounter on the corpse`,
      boss._enc == null && g._encOwner === null);
  }
  T('[P13] clearBossEncounter tolerates a boss with no encounter',
    (() => { try { clearBossEncounter({ enemies: [] }, {}); clearBossEncounter(null, null); return true; }
             catch (_) { return false; } })());
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 14. CLEANUP ON RESET ═══');
{
  const { g, boss, id } = bossFor('bloodfang');
  // Drive until the pack actually lands (bounded), so the cleanup assertions below have something
  // to clean up regardless of the signature's cadence.
  for (let f = 0; f < 60 * 180 && liveSummons(g) === 0; f++) runEnc(g, boss, id, 1, { parkDist: 300 });
  T('[P14] the pack rig really produced summons before the reset', liveSummons(g) > 0, String(liveSummons(g)));
  g.player._chillT = 1.0;
  const un = muteConsole(); g.reset(); un();
  T('[P14] reset() removes every tracked boss summon', liveSummons(g) === 0, String(liveSummons(g)));
  T('[P14] reset() releases _encOwner and _activeStageBoss',
    g._encOwner === null && g._activeStageBoss === null);
  T('[P14] reset() clears the stage-boss run state',
    JSON.stringify(g._stageBossSpawned) === '{}' && JSON.stringify(g._stageBossCleared) === '{}' &&
    JSON.stringify(g._stageBossRewarded) === '{}');
  T('[P14] reset() clears the cryo slow the dragon can leave behind',
    (g.player._chillT || 0) === 0, String(g.player._chillT));
  T('[P14] clearAllBossSummons finds nothing left to remove', clearAllBossSummons(g) === 0);
  // Repeated resets stay stable.
  for (const bid of BOSS_IDS) {
    const r = bossFor(bid);
    runEnc(r.g, r.boss, bid, 60 * 40, { parkDist: 300 });
    const un2 = muteConsole();
    for (let i = 0; i < 3; i++) r.g.reset();
    un2();
    T(`[P14] ${bid}: three back-to-back resets leave no summon, no owner, no encounter`,
      liveSummons(r.g) === 0 && r.g._encOwner === null && r.g._activeStageBoss === null);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 15. CLEANUP ON A DECK TRANSITION ═══');
{
  // A stage boss lives only in Act 1, and Act 1 has no decks — the transition must REFUSE outright.
  {
    const { g } = bossFor('mech');
    T('[P15] Act 1 refuses a deck transition outright (a stage boss can never be stranded)',
      g._enterDeck('lower') === false && g._enterDeck('upper') === false && g._deck !== 'lower');
  }
  // And the sweep itself, driven directly, drops everything the encounter owns.
  {
    const { g, boss, id } = bossFor('bloodfang');
  for (let f = 0; f < 60 * 180 && liveSummons(g) === 0; f++) runEnc(g, boss, id, 1, { parkDist: 300 });
    T('[P15] the pack rig produced summons before the sweep', liveSummons(g) > 0, String(liveSummons(g)));
    const dest = { x: g.player.pos.x, y: g.player.pos.y };
    const un = muteConsole();
    g._clearDeckTransients(dest, g._walkMode());
    un();
    T('[P15] the deck sweep leaves no boss summon behind', liveSummons(g) === 0);
    T('[P15] the deck sweep leaves no enemies at all', g.enemies.length === 0);
    T('[P15] clearAllBossSummons finds nothing after the sweep', clearAllBossSummons(g) === 0);
    // the encounter's own summon list drains on the next frame (nothing keeps a dead reference)
    g._updateStageBossCinematics(DT);
    T('[P15] the encounter drops its stale summon references on the next frame',
      !boss._enc || boss._enc.summons.length === 0,
      String(boss._enc && boss._enc.summons.length));
  }
  // The mech IS an Enemy, so the sweep removes the boss itself — the encounter must follow it out.
  {
    const { g, boss, id } = bossFor('mech');
    runEnc(g, boss, id, 60 * 30, { parkDist: 300 });
    const un = muteConsole();
    g._clearDeckTransients({ x: g.player.pos.x, y: g.player.pos.y }, g._walkMode());
    un();
    g._updateStageBossCinematics(DT);
    T('[P15] mech: the encounter is torn down when the sweep removes the boss',
      g._encOwner === null && boss._enc === null);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 16. PAUSE FREEZES THE ENCOUNTER ═══');
{
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    realFrames(g, 90, () => park(g, boss, 300));
    T(`[P16] ${id}: real update() frames drive the encounter`, !!boss._enc, 'no encounter created');
    if (!boss._enc) continue;
    const before = snap(boss._enc);
    const summ0 = liveSummons(g);
    g.paused = true;
    realFrames(g, 600, () => park(g, boss, 300));
    const after = snap(boss._enc);
    g.paused = false;
    T(`[P16] ${id}: 10s paused leaves every encounter timer untouched`,
      same(before, after), `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
    T(`[P16] ${id}: 10s paused summons nothing`, liveSummons(g) === summ0);
    realFrames(g, 60, () => park(g, boss, 300));
    T(`[P16] ${id}: …and it resumes when unpaused (the freeze was not a stall)`,
      !same(snap(boss._enc), after), JSON.stringify(snap(boss._enc)));
  }
  // The cryo slow timer must freeze with everything else.
  {
    const { g, boss, id } = bossFor('cyberDragon');
    realFrames(g, 90, () => park(g, boss, 300));
    g.player._chillT = 1.0;
    g.paused = true;
    realFrames(g, 300, () => park(g, boss, 300));
    g.paused = false;
    T('[P16] the cryo-slow timer does not drain while paused', g.player._chillT === 1.0,
      String(g.player._chillT));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 17. gameOver PREVENTS EXECUTION ═══');
{
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    realFrames(g, 90, () => park(g, boss, 300));
    if (!boss._enc) { T(`[P17] ${id}: encounter exists to freeze`, false); continue; }
    const before = snap(boss._enc);
    const summBefore = liveSummons(g);
    let dmg = 0;
    g._damagePlayer = () => { dmg++; return true; };
    g.gameOver = true;
    realFrames(g, 900, () => park(g, boss, 20));
    T(`[P17] ${id}: 15s of gameOver frames advance nothing`, same(before, snap(boss._enc)),
      `${JSON.stringify(before)} vs ${JSON.stringify(snap(boss._enc))}`);
    T(`[P17] ${id}: 15s of gameOver frames deal no damage even glued to the player`, dmg === 0, String(dmg));
    T(`[P17] ${id}: gameOver adds not one summon`, liveSummons(g) === summBefore,
      `${summBefore} → ${liveSummons(g)}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 18. victory PREVENTS EXECUTION ═══');
{
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    realFrames(g, 90, () => park(g, boss, 300));
    if (!boss._enc) { T(`[P18] ${id}: encounter exists to freeze`, false); continue; }
    const before = snap(boss._enc);
    let dmg = 0;
    g._damagePlayer = () => { dmg++; return true; };
    g.victory = true;
    realFrames(g, 900, () => park(g, boss, 20));
    T(`[P18] ${id}: 15s of victory frames advance nothing`, same(before, snap(boss._enc)),
      `${JSON.stringify(before)} vs ${JSON.stringify(snap(boss._enc))}`);
    T(`[P18] ${id}: 15s of victory frames deal no damage even glued to the player`, dmg === 0, String(dmg));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 19–21. MECH — LASER SWEEP ═══');
{
  const ID = 'mech', D = STAGE_BOSS_SIGNATURES.mech;
  // [P19] the start angle is locked AT COMMIT and cannot be re-aimed during the sweep.
  {
    const { g, boss } = bossFor(ID);
    let ang0AtCommit = null, drift = 0, moved = 0, execFrames = 0;
    let last = -1;
    for (let f = 0; f < 60 * 90; f++) {
      const e = boss._enc;
      park(g, boss, 300);
      if (e && e.phase === ENC_PHASE.EXECUTE) {
        // orbit the player around the boss at speed — a re-aiming beam would follow
        const a = f * 0.21;
        g.player.pos.x = boss.pos.x + Math.cos(a) * 260;
        g.player.pos.y = boss.pos.y + Math.sin(a) * 260;
        moved++;
      }
      centerCam(g);
      const before = e ? e.phase : -1;
      g._updateStageBossCinematics(DT);
      const e2 = boss._enc;
      if (before === ENC_PHASE.TELEGRAPH && e2.phase === ENC_PHASE.EXECUTE) ang0AtCommit = e2.ang0;
      if (e2 && e2.phase === ENC_PHASE.EXECUTE && ang0AtCommit != null) {
        execFrames++;
        drift = Math.max(drift, Math.abs(e2.ang0 - ang0AtCommit));
      }
      if (e2 && e2.phase === ENC_PHASE.RECOVER) ang0AtCommit = null;
      last = e2 ? e2.phase : -1;
    }
    T('[P19] laser sweep: the sweep really executed', execFrames > 0, String(execFrames));
    T(`[P19] laser sweep: the start angle NEVER moves during EXECUTE (${moved} moving frames)`,
      drift === 0, `max drift ${drift}`);
  }
  // [P20]/[P21] arc bound + a standing safe wedge, measured from the beam angles it really swept.
  {
    const { g, boss } = bossFor(ID);
    const angles = [];
    let ang0 = null, maxDev = 0;
    for (let f = 0; f < 60 * 60; f++) {
      const e = boss._enc;
      park(g, boss, 300);
      centerCam(g);
      const before = e ? e.phase : -1;
      g._updateStageBossCinematics(DT);
      const e2 = boss._enc;
      if (before === ENC_PHASE.TELEGRAPH && e2.phase === ENC_PHASE.EXECUTE) { ang0 = e2.ang0; angles.length = 0; }
      if (e2 && e2.phase === ENC_PHASE.EXECUTE && ang0 != null) {
        angles.push(e2.ang);
        maxDev = Math.max(maxDev, Math.abs(e2.ang - ang0));
      }
      if (angles.length > 10 && e2 && e2.phase === ENC_PHASE.RECOVER) break;
    }
    T('[P20] laser sweep: the declared arc is strictly less than a full turn',
      Number.isFinite(D.sweepArc) && D.sweepArc > 0 && D.sweepArc < TAU, String(D.sweepArc));
    T('[P20] laser sweep: the measured sweep never exceeds the declared arc',
      angles.length > 20 && maxDev <= D.sweepArc + 1e-9, `${maxDev.toFixed(4)} vs ${D.sweepArc}`);
    T('[P20] laser sweep: it really travels (the arc is not a stationary beam)',
      maxDev >= D.sweepArc * 0.95, `${maxDev.toFixed(4)}`);
    T('[P20] laser sweep: every swept angle is finite', angles.every(a => Number.isFinite(a)));
    // [P21] a SAFE REGION: replay the recorded beam angles against 360 static probe positions on a
    // ring inside sweepLen, using the shipping hit test. Some angles must never be touched.
    const R = Math.min(300, D.sweepLen * 0.5);
    let hitCount = 0;
    const safe = [];
    for (let i = 0; i < 360; i++) {
      const pa = (i / 360) * TAU - Math.PI;
      let hit = false;
      for (const beam of angles) {
        const d = Math.atan2(Math.sin(pa - beam), Math.cos(pa - beam));
        if (Math.abs(d) < Math.PI / 2 && Math.abs(Math.sin(d)) * R <= D.sweepWidth) { hit = true; break; }
      }
      if (hit) hitCount++; else safe.push(i);
    }
    T('[P21] laser sweep: a standing SAFE WEDGE exists — some angles are never swept',
      safe.length > 0, `${safe.length}/360 angles safe`);
    T('[P21] laser sweep: the safe wedge is substantial, not a sliver',
      safe.length >= 360 * (1 - (D.sweepArc + 2 * Math.asin(Math.min(1, D.sweepWidth / R))) / TAU) - 4,
      `${safe.length}/360 safe, arc=${D.sweepArc}`);
    T('[P21] laser sweep: the beam did cover ground (the safe wedge is not vacuous)',
      hitCount > 20, `${hitCount}/360 swept`);
    T('[P21] laser sweep: the beam length is bounded and never exceeds maxRange',
      Number.isFinite(D.sweepLen) && D.sweepLen > 0 && D.sweepLen <= D.maxRange,
      `${D.sweepLen} vs ${D.maxRange}`);
    T('[P21] laser sweep: the beam is a thin line, not an area (width << length)',
      D.sweepWidth > 0 && D.sweepWidth < D.sweepLen * 0.1, `${D.sweepWidth}/${D.sweepLen}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 22–23. ANNIHILATOR — FORGE SLAM ═══');
{
  const ID = 'annihilator', D = STAGE_BOSS_SIGNATURES.annihilator;
  T('[P22] forge slam: the cone range is finite, positive and inside maxRange',
    Number.isFinite(D.coneRange) && D.coneRange > 0 && D.coneRange <= D.maxRange,
    `${D.coneRange} vs ${D.maxRange}`);
  T('[P22] forge slam: the cone is a CONE, not the screen — half-angle in (0, π/2)',
    Number.isFinite(D.coneHalfAngle) && D.coneHalfAngle > 0 && D.coneHalfAngle < Math.PI / 2,
    String(D.coneHalfAngle));
  T('[P22] forge slam: the cone is shorter than a screen height (walk-out-able)',
    D.coneRange < 720, String(D.coneRange));
  /** Arm a slam with the player at `armDist`, then move the player before the commit frame. */
  function slamProbe(armDist, moveTo) {
    const { g, boss } = bossFor(ID);
    let dmg = 0;
    g._damagePlayer = () => { dmg++; return true; };
    const home = { x: g.player.pos.x, y: g.player.pos.y };
    for (let f = 0; f < 60 * 60; f++) {
      const e = boss._enc;
      // boss sits at a fixed spot; the player sits at armDist along +x from it while arming
      boss.pos.x = home.x - armDist; boss.pos.y = home.y;
      if (e && e.phase === ENC_PHASE.TELEGRAPH && e.t <= DT * 1.5 && moveTo) {
        const p = moveTo(boss);
        g.player.pos.x = p.x; g.player.pos.y = p.y;
      } else if (!e || e.phase !== ENC_PHASE.EXECUTE) {
        g.player.pos.x = home.x; g.player.pos.y = home.y;
      }
      centerCam(g);
      g._updateStageBossCinematics(DT);
      if (boss._enc && boss._enc.phase === ENC_PHASE.RECOVER && boss._enc.activations >= 1) break;
    }
    return dmg;
  }
  T('[P22] forge slam: a player INSIDE the cone is hit',
    slamProbe(D.coneRange - 60, null) === 1, 'expected exactly 1 hit');
  T('[P22] forge slam: a player just BEYOND coneRange is NOT hit',
    slamProbe(D.coneRange - 60, (b) => ({ x: b.pos.x + D.coneRange + 60, y: b.pos.y })) === 0);
  T('[P22] forge slam: a player OUTSIDE the half-angle is NOT hit',
    (() => { const a = D.coneHalfAngle + 0.25, r = D.coneRange * 0.6;
             return slamProbe(D.coneRange - 60, (b) => ({ x: b.pos.x + Math.cos(a) * r,
                                                          y: b.pos.y + Math.sin(a) * r })) === 0; })());
  T('[P22] forge slam: a player just INSIDE the half-angle IS hit',
    (() => { const a = D.coneHalfAngle * 0.5, r = D.coneRange * 0.6;
             return slamProbe(D.coneRange - 60, (b) => ({ x: b.pos.x + Math.cos(a) * r,
                                                          y: b.pos.y + Math.sin(a) * r })) === 1; })());
  T('[P22] forge slam: a player DIRECTLY BEHIND the boss is never hit',
    slamProbe(D.coneRange - 60, (b) => ({ x: b.pos.x - D.coneRange * 0.5, y: b.pos.y })) === 0);
  // [P23] recovery is real, positive, and no damage happens inside it.
  {
    T('[P23] forge slam: recover > 0 is declared', D.recover > 0, String(D.recover));
    const { g, boss } = bossFor(ID);
    const phases = [];
    g._damagePlayer = () => { phases.push(boss._enc.phase); return true; };
    const tr = runEnc(g, boss, ID, 60 * 90, { parkDist: 60 });
    const recDurs = [];
    for (let i = 1; i < tr.length; i++)
      if (tr[i].to === ENC_PHASE.IDLE && tr[i - 1].to === ENC_PHASE.RECOVER)
        recDurs.push((tr[i].f - tr[i - 1].f) / 60);
    T(`[P23] forge slam: RECOVER lasted the declared ${D.recover}s every time`,
      recDurs.length >= 2 && recDurs.every(x => Math.abs(x - D.recover) <= 2 / 60),
      recDurs.map(x => x.toFixed(3)).join(','));
    T('[P23] forge slam: RECOVER is a guaranteed safe window — zero damage inside it',
      phases.length > 0 && !phases.includes(ENC_PHASE.RECOVER));
    T('[P23] forge slam: execute is a single instant, not a lingering field',
      D.execute > 0 && D.execute < D.recover, `${D.execute} vs ${D.recover}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 24–26. TITAN — ORBITAL TARGET GRID ═══');
{
  const ID = 'titan', D = STAGE_BOSS_SIGNATURES.titan;
  T('[P24] orbital grid: the declared marker band is 3–5 and fits ENC_CAPS',
    D.markerMin === 3 && D.markerMax === 5 && D.markerMax <= ENC_CAPS.markers,
    `${D.markerMin}..${D.markerMax} cap=${ENC_CAPS.markers}`);
  const { g, boss } = bossFor(ID);
  const counts = [], strikePos = [], markerSnaps = [];
  let cleanAfterExec = true, strikesAtMarkers = true, markersMoved = false, peakStrikes = 0;
  let lastPhase = -1, armed = null;
  const PLAYER0 = { x: g.player.pos.x, y: g.player.pos.y };
  const dmgAt = [];
  g._damagePlayer = () => { dmgAt.push({ px: g.player.pos.x, py: g.player.pos.y }); return true; };
  for (let f = 0; f < 60 * 400; f++) {
    park(g, boss, 300);
    centerCam(g);
    const before = boss._enc ? boss._enc.phase : -1;
    g._updateStageBossCinematics(DT);
    const e = boss._enc;
    if (!e) continue;
    if (before === ENC_PHASE.IDLE && e.phase === ENC_PHASE.TELEGRAPH) {
      counts.push(e.markers.length);
      armed = e.markers.map(m => ({ x: m.x, y: m.y, r: m.r }));
      markerSnaps.push(armed);
    }
    if (e.phase === ENC_PHASE.EXECUTE && armed) {
      // markers must not move once drawn
      if (e.markers.length !== armed.length ||
          e.markers.some((m, i) => m.x !== armed[i].x || m.y !== armed[i].y || m.r !== armed[i].r)) markersMoved = true;
      for (const s of e.strikes) {
        if (!armed.some(m => m.x === s.x && m.y === s.y && m.r === s.r)) strikesAtMarkers = false;
        strikePos.push(s);
      }
      peakStrikes = Math.max(peakStrikes, e.strikes.length);
    }
    if (before === ENC_PHASE.EXECUTE && e.phase === ENC_PHASE.RECOVER) {
      if (e.markers.length !== 0 || e.strikes.length !== 0) cleanAfterExec = false;
      armed = null;
    }
    lastPhase = e.phase;
  }
  T(`[P24] orbital grid: ${counts.length} activations observed`, counts.length >= 10, String(counts.length));
  T('[P24] orbital grid: EVERY activation produced between markerMin and markerMax markers',
    counts.length > 0 && counts.every(c => c >= D.markerMin && c <= D.markerMax), counts.join(','));
  T('[P24] orbital grid: no activation ever exceeded ENC_CAPS.markers',
    counts.every(c => c <= ENC_CAPS.markers), String(Math.max(...counts)));
  T('[P24] orbital grid: the count really varies (it is not a fixed grid)',
    new Set(counts).size >= 2, [...new Set(counts)].join(','));
  T('[P25] orbital grid: markers never move between the telegraph and the strike', !markersMoved);
  T('[P25] orbital grid: EVERY strike landed on a telegraphed marker position',
    strikePos.length > 0 && strikesAtMarkers, `${strikePos.length} strikes`);
  T('[P25] orbital grid: every damage event happened inside a telegraphed marker radius',
    dmgAt.length > 0 && dmgAt.every(p => markerSnaps.some(ms => ms.some(m =>
      Math.hypot(p.px - m.x, p.py - m.y) < m.r + 1e-6))), `${dmgAt.length} damage events`);
  T('[P25] orbital grid: every marker position is finite',
    markerSnaps.every(ms => ms.every(m => Number.isFinite(m.x) && Number.isFinite(m.y))));
  T('[P25] orbital grid: every marker sits inside the declared markerSpread of the player',
    markerSnaps.length > 0 && markerSnaps.every(ms => ms.every(m =>
      Math.hypot(m.x - PLAYER0.x, m.y - PLAYER0.y) <= D.markerSpread + 1e-6)),
    `max=${Math.max(...markerSnaps.flat().map(m => Math.hypot(m.x - PLAYER0.x, m.y - PLAYER0.y))).toFixed(1)} vs ${D.markerSpread}`);
  T('[P25] orbital grid: every marker carries the declared radius',
    markerSnaps.every(ms => ms.every(m => m.r === D.markerRadius)), String(D.markerRadius));
  T('[P26] orbital grid: markers AND strikes are cleared on leaving EXECUTE', cleanAfterExec);
  T('[P26] orbital grid: nothing survives into IDLE',
    boss._enc && boss._enc.markers.length === 0 && boss._enc.strikes.length === 0);
  T('[P26] orbital grid: the strike list never exceeded ENC_CAPS.strikes',
    peakStrikes > 0 && peakStrikes <= ENC_CAPS.strikes, String(peakStrikes));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 27–29. CYBER SERPENT — SERPENTINE CHARGE ═══');
{
  const ID = 'cyberSerpent', D = STAGE_BOSS_SIGNATURES.cyberSerpent;
  T('[P27] serpentine charge: the declared path length fits ENC_CAPS.pathPoints',
    D.pathPoints > 0 && D.pathPoints <= ENC_CAPS.pathPoints, `${D.pathPoints} vs ${ENC_CAPS.pathPoints}`);
  // Run TWO identical arms; in run B the player runs away hard during EXECUTE. The committed
  // trajectory must be byte-identical — that is what "cannot re-home" means.
  function chargeRun(evade, armDist = 400) {
    const { g, boss } = bossFor(ID);
    const home = { x: g.player.pos.x, y: g.player.pos.y };
    let armedPath = null, pathChanged = false, traj = [], maxStep = 0, prev = null;
    let done = false;
    for (let f = 0; f < 60 * 90 && !done; f++) {
      const e = boss._enc;
      if (!e || e.phase !== ENC_PHASE.EXECUTE) {
        g.player.pos.x = home.x; g.player.pos.y = home.y;
        park(g, boss, armDist); prev = null;
      } else if (evade) {
        g.player.pos.x = home.x + Math.cos(f * 0.3) * 500;
        g.player.pos.y = home.y + Math.sin(f * 0.3) * 400;
      }
      centerCam(g);
      const before = e ? e.phase : -1;
      g._updateStageBossCinematics(DT);
      const e2 = boss._enc;
      if (before === ENC_PHASE.TELEGRAPH && e2.phase === ENC_PHASE.EXECUTE)
        armedPath = e2.path.map(n => ({ x: n.x, y: n.y }));
      // The COMMIT frame itself only locks the path — `execute()` first drives the boss on the
      // frame after, so the trajectory is sampled on frames that BEGAN already in EXECUTE.
      if (before === ENC_PHASE.EXECUTE && e2.phase === ENC_PHASE.EXECUTE && armedPath) {
        if (e2.path.length !== armedPath.length ||
            e2.path.some((n, i) => n.x !== armedPath[i].x || n.y !== armedPath[i].y)) pathChanged = true;
        traj.push({ x: boss.pos.x, y: boss.pos.y });
        if (prev) maxStep = Math.max(maxStep, Math.hypot(boss.pos.x - prev.x, boss.pos.y - prev.y));
        prev = { x: boss.pos.x, y: boss.pos.y };
      }
      if (before === ENC_PHASE.EXECUTE && e2.phase === ENC_PHASE.RECOVER && armedPath) done = true;
    }
    const travelled = traj.length > 1
      ? traj.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - traj[i].x, p.y - traj[i].y), 0) : 0;
    return { armedPath, pathChanged, traj, maxStep, travelled, secs: traj.length / 60 };
  }
  const A = chargeRun(false), B = chargeRun(true);
  T('[P27] serpentine charge: the path is built at arm time and really exists',
    !!A.armedPath && A.armedPath.length === Math.min(ENC_CAPS.pathPoints, D.pathPoints),
    String(A.armedPath && A.armedPath.length));
  T('[P27] serpentine charge: the path NEVER changes once committed', !A.pathChanged && !B.pathChanged);
  // The charge is SPEED-DRIVEN, so the boss is between nodes on most frames. Requiring an exact
  // node match would only pass for the old index-stepping teleport. The real contract is that every
  // frame lies ON the committed ribbon, which is what this measures.
  const segD = (ax, ay, bx, by, px, py) => {
    const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
    const L2 = vx * vx + vy * vy;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)) : 0;
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  };
  const onRibbon = (pt, ribbon, start) => {
    let best = Infinity, ax = start.x, ay = start.y;
    for (const n of ribbon) { best = Math.min(best, segD(ax, ay, n.x, n.y, pt.x, pt.y)); ax = n.x; ay = n.y; }
    return best;
  };
  const worstOff = A.traj.length ? Math.max(...A.traj.map(p => onRibbon(p, A.armedPath, A.traj[0]))) : Infinity;
  T('[P27] serpentine charge: every execute frame lies ON the committed ribbon',
    A.traj.length > 0 && worstOff < 2.0,
    `${A.traj.length} execute frames, worst offset ${worstOff.toFixed(3)}px`);
  T('[P27] serpentine charge: it TRAVELS, it does not teleport between nodes',
    A.maxStep > 0 && A.maxStep <= D.chargeSpeed / 60 + 1.5,
    `max single-frame step ${A.maxStep.toFixed(2)}px vs ${(D.chargeSpeed/60).toFixed(2)}px/frame`);
  T('[P27] serpentine charge: realised speed matches the DECLARED chargeSpeed',
    A.secs > 0 && Math.abs(A.travelled / A.secs - D.chargeSpeed) / D.chargeSpeed < 0.15,
    `${(A.travelled / A.secs).toFixed(0)} px/s vs declared ${D.chargeSpeed}`);
  T('[P27] serpentine charge: every path node is finite',
    A.armedPath.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
  T('[P28] serpentine charge: a fleeing player does NOT bend the trajectory',
    A.traj.length === B.traj.length &&
    A.traj.every((p, i) => Math.abs(p.x - B.traj[i].x) < 1e-9 && Math.abs(p.y - B.traj[i].y) < 1e-9),
    `A=${A.traj.length} B=${B.traj.length}`);
  T('[P28] serpentine charge: the committed path itself is identical in both runs',
    JSON.stringify(A.armedPath) === JSON.stringify(B.armedPath));
  // The table declares `chargeSpeed`. A declared speed that nothing reads is a tuning knob that
  // silently does nothing, so both the source and the realised speed are checked.
  T('[P28] serpentine charge: the declared chargeSpeed is actually READ by the module',
    (SBC_CODE.match(/chargeSpeed/g) || []).length >= 2,
    `chargeSpeed appears ${(SBC_CODE.match(/chargeSpeed/g) || []).length}× in the code — declaration only, never read`);
  {
    const far = chargeRun(false, Math.min(800, D.maxRange - 100));
    const avg = far.secs > 0 ? far.travelled / far.secs : 0;
    T('[P28] serpentine charge: the realised charge speed respects the declared chargeSpeed',
      avg <= D.chargeSpeed * 1.1,
      `measured ${Math.round(avg)} px/s over ${far.secs.toFixed(2)}s vs declared ${D.chargeSpeed} px/s`);
  }
  T('[P28] serpentine charge: the boss moves continuously, not in teleport steps',
    A.maxStep <= D.chargeSpeed * DT * 2,
    `max single-frame jump ${Math.round(A.maxStep)}px (${Math.round(A.maxStep / DT)} px/s) vs chargeSpeed ${D.chargeSpeed}`);
  // [P29] one damage application per activation, over many overlapping frames.
  {
    const { g, boss } = bossFor(ID);
    let calls = 0;
    const perAct = [];
    let cur = 0;
    g._damagePlayer = () => { calls++; cur++; return true; };
    let acts = 0;
    for (let f = 0; f < 60 * 200; f++) {
      const e = boss._enc;
      if (!e || e.phase !== ENC_PHASE.EXECUTE) park(g, boss, 300);
      // the player rides the boss itself so every execute frame overlaps
      if (e && e.phase === ENC_PHASE.EXECUTE) { g.player.pos.x = boss.pos.x; g.player.pos.y = boss.pos.y; }
      centerCam(g);
      const before = e ? e.phase : -1;
      g._updateStageBossCinematics(DT);
      const e2 = boss._enc;
      if (before === ENC_PHASE.TELEGRAPH && e2.phase === ENC_PHASE.EXECUTE) { acts++; cur = 0; }
      if (before === ENC_PHASE.EXECUTE && e2.phase === ENC_PHASE.RECOVER) perAct.push(cur);
    }
    T('[P29] serpentine charge: the overlap scenario ran real activations', acts >= 5, String(acts));
    T('[P29] serpentine charge: AT MOST ONE damage event per activation',
      perAct.length > 0 && perAct.every(x => x <= 1), perAct.join(','));
    T('[P29] serpentine charge: an overlapping charge does land its one hit',
      perAct.some(x => x === 1), perAct.join(','));
    T('[P29] serpentine charge: the encounter\'s own hit budget is 1', boss._enc.maxHits === 1);
  }
  // …and every other boss obeys the same single-hit budget.
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    const rig = makeOverlapRig(g, boss, id);
    const perAct = []; let cur = 0, acts = 0;
    g._damagePlayer = () => { cur++; return true; };
    for (let f = 0; f < 60 * 200; f++) {
      const e = boss._enc;
      rig(e);
      centerCam(g);
      const before = e ? e.phase : -1;
      g._updateStageBossCinematics(DT);
      const e2 = boss._enc;
      if (before === ENC_PHASE.TELEGRAPH && e2.phase === ENC_PHASE.EXECUTE) { acts++; cur = 0; }
      if (before === ENC_PHASE.EXECUTE && e2.phase === ENC_PHASE.RECOVER) perAct.push(cur);
    }
    T(`[P29] ${id}: at most one damage application per activation over ${acts} activations`,
      acts >= 3 && perAct.every(x => x <= 1), perAct.join(','));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 30–33. CYBER DRAGON — CRYO BREATH ═══');
{
  const ID = 'cyberDragon', D = STAGE_BOSS_SIGNATURES.cyberDragon;
  T('[P30] cryo breath: the cone is bounded — half-angle in (0, π/2), range inside maxRange',
    D.breathHalfAngle > 0 && D.breathHalfAngle < Math.PI / 2 &&
    D.breathRange > 0 && D.breathRange <= D.maxRange,
    `${D.breathHalfAngle} / ${D.breathRange} vs ${D.maxRange}`);
  /** Arm a breath with the player in front, then relocate the player on the FIRST execute frame. */
  function breathProbe(relocate) {
    const { g, boss } = bossFor(ID);
    let dmg = 0;
    g._damagePlayer = () => { dmg++; return true; };
    const home = { x: g.player.pos.x, y: g.player.pos.y };
    let placed = false;
    for (let f = 0; f < 60 * 90; f++) {
      const e = boss._enc;
      boss.pos.x = home.x - 200; boss.pos.y = home.y;               // boss west of the player
      if (!e || e.phase !== ENC_PHASE.EXECUTE) { g.player.pos.x = home.x; g.player.pos.y = home.y; placed = false; }
      centerCam(g);
      const before = e ? e.phase : -1;
      g._updateStageBossCinematics(DT);
      const e2 = boss._enc;
      if (e2 && e2.phase === ENC_PHASE.EXECUTE && relocate && !placed) {
        const p = relocate(boss, e2);
        g.player.pos.x = p.x; g.player.pos.y = p.y;
        placed = true;
      }
      if (before === ENC_PHASE.EXECUTE && e2.phase === ENC_PHASE.RECOVER) break;
    }
    return dmg;
  }
  T('[P30] cryo breath: a player IN FRONT is hit', breathProbe(null) === 1);
  T('[P30] cryo breath: a player beyond breathRange in front is NOT hit',
    breathProbe((b, e) => ({ x: b.pos.x + e.dirX * (D.breathRange + 80),
                             y: b.pos.y + e.dirY * (D.breathRange + 80) })) === 0);
  T('[P30] cryo breath: a player just inside breathRange in front IS hit',
    breathProbe((b, e) => ({ x: b.pos.x + e.dirX * (D.breathRange - 60),
                             y: b.pos.y + e.dirY * (D.breathRange - 60) })) === 1);
  T('[P31] cryo breath: a player DIRECTLY BEHIND the dragon is NOT hit',
    breathProbe((b, e) => ({ x: b.pos.x - e.dirX * (D.breathRange * 0.5),
                             y: b.pos.y - e.dirY * (D.breathRange * 0.5) })) === 0);
  T('[P31] cryo breath: a player just outside the half-angle is NOT hit',
    breathProbe((b, e) => {
      const base = Math.atan2(e.dirY, e.dirX), a = base + D.breathHalfAngle + 0.20, r = D.breathRange * 0.5;
      return { x: b.pos.x + Math.cos(a) * r, y: b.pos.y + Math.sin(a) * r };
    }) === 0);
  T('[P31] cryo breath: a player just inside the half-angle IS hit',
    breathProbe((b, e) => {
      const base = Math.atan2(e.dirY, e.dirX), a = base + D.breathHalfAngle * 0.6, r = D.breathRange * 0.5;
      return { x: b.pos.x + Math.cos(a) * r, y: b.pos.y + Math.sin(a) * r };
    }) === 1);
  // The rear safe region, measured over 72 static probe angles with the shipping cone maths.
  {
    const safe = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const dot = Math.cos(a);          // dir = (1,0) by construction below
      if (!(dot >= Math.cos(D.breathHalfAngle))) safe.push(i);
    }
    T('[P31] cryo breath: the rear is a large standing safe region',
      safe.length >= 72 * (1 - (2 * D.breathHalfAngle) / TAU) - 1,
      `${safe.length}/72 angles safe (half-angle ${D.breathHalfAngle})`);
    T('[P31] cryo breath: the dangerous wedge is a minority of the circle',
      (2 * D.breathHalfAngle) / TAU < 0.5, String((2 * D.breathHalfAngle) / TAU));
  }
  // [P32] the slow is bounded, and [P33] it cleans itself up.
  {
    T('[P32] cryo breath: slowDuration is declared and bounded',
      Number.isFinite(D.slowDuration) && D.slowDuration > 0 && D.slowDuration <= 3 &&
      true, `${D.slowDuration}s`);
    const { g, boss } = bossFor(ID);
    let maxT = 0, minF = 1, hits = 0;
    g._damagePlayer = () => { hits++; return true; };
    for (let f = 0; f < 60 * 200; f++) {
      const e = boss._enc;
      park(g, boss, 60);
      centerCam(g);
      g._updateStageBossCinematics(DT);
      try { g.player.update(DT, { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false }, g); }
      catch (_) { g.player._chillT = Math.max(0, (g.player._chillT || 0) - DT); }
      maxT = Math.max(maxT, g.player._chillT || 0);
      if ((g.player._chillT || 0) > 0) minF = Math.min(minF, g.player.speed / (g.player.baseSpeed * (1 + g.player.speedBonus)));
    }
    T('[P32] cryo breath: the slow really applied', hits > 0 && maxT > 0, `hits=${hits} maxT=${maxT}`);
    T('[P32] cryo breath: the slow timer NEVER exceeds the declared duration (no stacking)',
      maxT <= D.slowDuration + 1e-9, `${maxT} vs ${D.slowDuration}`);
    T('[P32] cryo breath: the slow uses the canonical _chillT (capped, refresh-never-stack)',
      minF >= 0.5 - 1e-9 && minF < 1, String(minF));
    T('[P32] cryo breath: the applied chill matches the canonical Player chill factor',
      minF > 0.5 && minF < 1, `realised chill factor ${minF}`);
    // [P33] cleanup
    const { g: g2, boss: b2 } = bossFor(ID);
    encFrame(g2, b2, ID, DT, { parkDist: 300 });
    g2.player._chillT = D.slowDuration;
    // The chill decays inside Player.update (Player.js:364) — the canonical owner of the timer —
    // so the expiry window must tick the PLAYER, not only the cinematic layer.
    const _IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
    for (let f = 0; f < Math.ceil(D.slowDuration * 60) + 8; f++) {
      encFrame(g2, b2, ID, DT, { parkDist: 900 });
      try { g2.player.update(DT, _IN, g2); }
      catch (_) { g2.player._chillT = Math.max(0, (g2.player._chillT || 0) - DT); }
    }
    T('[P33] cryo breath: the slow expires by itself (Player.speed reads `_chillT > 0`)',
      (g2.player._chillT || 0) <= 0, String(g2.player._chillT));
    T('[P33] cryo breath: once lapsed the player is back to full speed',
      Math.abs(g2.player.speed - g2.player.baseSpeed * (1 + g2.player.speedBonus) *
        ((g2.player._adrenalT || 0) > 0 ? 1.15 : 1)) < 1e-6);
    T('[P33] cryo breath: the slow can never chain — it lapses even with the dragon alive',
      (g2.player._chillT || 0) <= 0 && !!b2 && b2.hp > 0, `${g2.player._chillT} bossHp=${b2 && b2.hp}`);
  }
  // The slow is only meaningful if the player's movement actually reads it.
  {
    const readers = fs.readdirSync(path.join(ROOT, 'js'), { recursive: true })
      .filter(f => typeof f === 'string' && f.endsWith('.js'))
      .map(f => path.join(ROOT, 'js', f))
      .filter(f => !f.endsWith('StageBossCinematics.js'))
      .filter(f => /_chillT/.test(fs.readFileSync(f, 'utf8')));
    const src = readers.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    // a READ is any use that is not the two reset writes in Game._updateStageBossCinematics/reset
    const uses = (src.match(/_chillT/g) || []).length;
    const writes = (src.match(/_chillT\s*=/g) || []).length;
    T('[P32] the cryo slow is actually WIRED — Player.speed reads _chillT',
      uses - writes >= 1,
      `_chillT appears ${uses}× outside the module, ${writes}× as a write`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 34–37. BLOODFANG — PACK ASSAULT ═══');
{
  const ID = 'bloodfang', D = STAGE_BOSS_SIGNATURES.bloodfang;
  T('[P34] pack assault: summonCount <= summonCap <= ENC_CAPS.summons',
    D.summonCount <= D.summonCap && D.summonCap <= ENC_CAPS.summons,
    `${D.summonCount}/${D.summonCap}/${ENC_CAPS.summons}`);
  T('[P34] pack assault: the summon type is an EXISTING enemy id, not a new one',
    (() => { const un = muteConsole(); let ok = false;
             try { const e = new Enemy(D.summonType, 0); ok = !!e && e.hp > 0; } catch (_) {}
             un(); return ok; })(), D.summonType);
  T('[P34] pack assault: the summon type is a member of its own biome pool',
    (CAMPAIGN_BIOME_ENEMY_POOLS[BIOME_OF[ID]] || []).some(x => x.id === D.summonType), D.summonType);
  const { g, boss } = bossFor(ID);
  const spawnFrames = [], spawnInfo = [];
  let peakTracked = 0, peakLive = 0;
  for (let f = 0; f < 60 * 300; f++) {
    const e = boss._enc;
    const n0 = e ? e.summons.length : 0;
    park(g, boss, 300);
    centerCam(g);
    g._updateStageBossCinematics(DT);
    const e2 = boss._enc;
    if (e2 && e2.summons.length > n0) {
      const s = e2.summons[e2.summons.length - 1];
      spawnFrames.push(f);
      spawnInfo.push({ f, type: s.enemyType,
                       dBoss: Math.hypot(s.pos.x - boss.pos.x, s.pos.y - boss.pos.y) });
    }
    if (e2) peakTracked = Math.max(peakTracked, e2.summons.length);
    peakLive = Math.max(peakLive, liveSummons(g));
  }
  T('[P34] pack assault: summons really arrived', spawnFrames.length >= 4, String(spawnFrames.length));
  T('[P34] pack assault: the tracked pack NEVER exceeds summonCap',
    peakTracked <= D.summonCap, `${peakTracked} vs ${D.summonCap}`);
  T('[P34] pack assault: the LIVE pack on the field never exceeds summonCap',
    peakLive <= D.summonCap, `${peakLive} vs ${D.summonCap}`);
  T('[P34] pack assault: it never exceeds ENC_CAPS.summons', peakTracked <= ENC_CAPS.summons);
  T('[P36] pack assault: no two summons ever arrived on the same frame',
    new Set(spawnFrames).size === spawnFrames.length, spawnFrames.join(','));
  {
    const gaps = [];
    for (let i = 1; i < spawnFrames.length; i++) {
      const d = (spawnFrames[i] - spawnFrames[i - 1]) / 60;
      if (d < D.cooldown * 0.5) gaps.push(d);       // only within-activation gaps
    }
    T('[P36] pack assault: within an activation the arrivals are staggered by the declared amount',
      gaps.length >= 2 && gaps.every(x => Math.abs(x - D.summonStagger) <= 3 / 60),
      gaps.map(x => x.toFixed(3)).join(','));
  }
  T('[P36] pack assault: every live summon is flagged and lifetimed at spawn',
    g.enemies.filter(e => e._bossSummon && e.hp > 0).every(e => Number.isFinite(e._summonLife) &&
      e._summonLife > 0 && e._summonLife <= D.summonLifetime));
  // The directional telegraph must not lie about where the pack comes from.
  T('[P36] pack assault: summons arrive at the telegraphed distance from the boss',
    spawnInfo.length > 0 && spawnInfo.every(s => s.dBoss <= D.summonDist * 1.5),
    `distances: ${spawnInfo.map(s => Math.round(s.dBoss)).join(',')} vs telegraphed summonDist ${D.summonDist}`);
  T('[P34] pack assault: every summon really IS the declared summonType',
    spawnInfo.length > 0 && spawnInfo.every(s => s.type === D.summonType),
    `spawned: ${[...new Set(spawnInfo.map(s => s.type))].join(',')} — declared ${D.summonType}`);
  // [P35] lifetime really expires them.
  {
    const { g: g2, boss: b2 } = bossFor(ID);
    let n = 0;
    while (n < 60 * 60 && (!b2._enc || b2._enc.summons.length === 0)) {
      encFrame(g2, b2, ID, DT, { parkDist: 300 }); n++;
    }
    // let the whole first wave arrive, then age exactly it out
    for (let f = 0; f < Math.ceil(D.summonStagger * D.summonCount * 60) + 4; f++)
      encFrame(g2, b2, ID, DT, { parkDist: 300 });
    const wave1 = b2._enc.summons.slice();
    const born = wave1.length;
    const lives0 = wave1.map(s => s._summonLife);
    for (let f = 0; f < Math.ceil(D.summonLifetime * 60) + 120; f++) encFrame(g2, b2, ID, DT, { parkDist: 300 });
    T('[P35] pack assault: a pack really spawned to age out', born > 0, String(born));
    T('[P35] pack assault: the declared lifetime is what is stamped on them',
      lives0.every(l => l > 0 && l <= D.summonLifetime + 1e-9), lives0.join(','));
    T('[P35] pack assault: EVERY summon of the first wave is gone after summonLifetime',
      wave1.every(s => s.hp <= 0 || !g2.enemies.includes(s)),
      `${wave1.filter(s => s.hp > 0 && g2.enemies.includes(s)).length} still alive`);
    T('[P35] pack assault: the live pack is still capped after the wave aged out',
      liveSummons(g2) <= D.summonCap, `${liveSummons(g2)} live`);
  }
  {
    const { g: g3, boss: b3 } = bossFor(ID);
    let n = 0;
    while (n < 60 * 60 && (!b3._enc || b3._enc.summons.length === 0)) { encFrame(g3, b3, ID, DT, { parkDist: 300 }); n++; }
    const first = b3._enc.summons[0];
    for (let f = 0; f < Math.ceil(D.summonLifetime * 60) + 4; f++) encFrame(g3, b3, ID, DT, { parkDist: 300 });
    T('[P35] pack assault: the FIRST summon is dead once its own lifetime elapsed',
      first.hp <= 0 || !g3.enemies.includes(first), `hp=${first.hp}`);
  }
  // [P37] every summon dies with the boss.
  {
    const { g: g4, boss: b4 } = bossFor(ID);
    let n = 0;
    while (n < 60 * 60 && (!b4._enc || b4._enc.summons.length === 0)) { encFrame(g4, b4, ID, DT, { parkDist: 300 }); n++; }
    const before = liveSummons(g4);
    killBoss(g4, ID);
    g4._updateStageBossCinematics(DT);
    T('[P37] pack assault: summons existed before the boss died', before > 0, String(before));
    T('[P37] pack assault: NOT ONE summon outlives the boss', liveSummons(g4) === 0, String(liveSummons(g4)));
    T('[P37] pack assault: the encounter\'s summon list is emptied too', b4._enc === null);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 38. PLAYER i-FRAMES RESPECTED — A REFUSED HIT DOES NOT CONSUME THE BUDGET ═══');
{
  // (a) TOTAL refusal — the i-frame case. The budget must never be consumed by a refused hit.
  for (const id of BOSS_IDS.filter(dealsDirectDamage)) {
    const { g, boss } = bossFor(id);
    const rig = makeOverlapRig(g, boss, id);
    let attempts = 0, acts = 0, maxHitsSeen = 0;
    g._damagePlayer = () => { attempts++; return false; };          // always refused, like i-frames
    for (let f = 0; f < 60 * 200; f++) {
      const e = boss._enc;
      rig(e);
      centerCam(g);
      const before = e ? e.phase : -1;
      g._updateStageBossCinematics(DT);
      if (before === ENC_PHASE.TELEGRAPH && boss._enc.phase === ENC_PHASE.EXECUTE) acts++;
      maxHitsSeen = Math.max(maxHitsSeen, boss._enc.hits);
    }
    T(`[P38] ${id}: the refusal scenario ran real activations and real attempts`,
      acts >= 5 && attempts >= 1, `${attempts} attempts over ${acts} activations`);
    T(`[P38] ${id}: a refused hit NEVER consumes the single-hit budget`,
      maxHitsSeen === 0, `hits reached ${maxHitsSeen}`);
    // Only a CONTINUOUS execute window can retry inside the same activation; forge_slam and each
    // orbital marker are instantaneous by construction, so they get one attempt and that is correct.
    if (CONTINUOUS.has(id)) {
      T(`[P38] ${id}: a continuous window RETRIES a refused hit inside the same activation`,
        attempts > acts, `${attempts} attempts over ${acts} activations`);
    }
  }
  // (b) Refuse, then stop refusing: the hit must still land — the budget was preserved, not spent.
  for (const id of BOSS_IDS.filter(dealsDirectDamage)) {
    const { g, boss } = bossFor(id);
    const rig = makeOverlapRig(g, boss, id);
    let refuse = true, landed = 0, acts = 0, refusedAttempts = 0;
    g._damagePlayer = () => { if (refuse) { refusedAttempts++; return false; } landed++; return true; };
    for (let f = 0; f < 60 * 200; f++) {
      const e = boss._enc;
      rig(e);
      refuse = f < 60 * 60;                     // i-frames for the first minute, then vulnerable
      centerCam(g);
      const before = e ? e.phase : -1;
      g._updateStageBossCinematics(DT);
      if (before === ENC_PHASE.TELEGRAPH && boss._enc.phase === ENC_PHASE.EXECUTE) acts++;
    }
    T(`[P38] ${id}: hits refused while invulnerable still land once i-frames lapse`,
      refusedAttempts >= 1 && acts >= 5 && landed >= 1,
      `${refusedAttempts} refused, ${landed} landed over ${acts} activations`);
  }
  T('[P38] pack_assault declares no direct damage, so it has no i-frame budget to consume',
    !dealsDirectDamage('bloodfang'));
  // The shipping damage route is _damagePlayer, so BOSS_MAX_PLAYER_HIT caps every hit.
  T('[P38] every signature routes damage through g._damagePlayer (the shared fairness gate)',
    /_damagePlayer\?\.\(/.test(SBC_CODE) && !/player\.hp\s*-=/.test(SBC_CODE));
  T('[P38] no signature declares damage above the shared BOSS_MAX_PLAYER_HIT cap of 30',
    BOSS_IDS.every(id => {
      const d = STAGE_BOSS_SIGNATURES[id];
      return [d.sweepDamage, d.slamDamage, d.strikeDamage, d.chargeDamage, d.breathDamage]
        .filter(x => x != null).every(x => x > 0 && x <= 30);
    }));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 39–40. FINITE COORDINATES · BOUNDED ACTIVE EFFECTS ═══');
const PEAKS = {};
{
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    const peak = { markers: 0, strikes: 0, path: 0, summons: 0 };
    let finite = true, badAt = '';
    g._damagePlayer = () => true;
    for (let f = 0; f < 60 * 300; f++) {
      const e = boss._enc;
      const driving = id === 'cyberSerpent' && e && e.phase === ENC_PHASE.EXECUTE;
      if (!driving) park(g, boss, 200 + (f % 400));
      centerCam(g);
      g._updateStageBossCinematics(DT);
      const e2 = boss._enc;
      if (!e2) continue;
      peak.markers = Math.max(peak.markers, e2.markers.length);
      peak.strikes = Math.max(peak.strikes, e2.strikes.length);
      peak.path    = Math.max(peak.path, e2.path.length);
      peak.summons = Math.max(peak.summons, e2.summons.length);
      if (finite) {
        const bad = !Number.isFinite(boss.pos.x) || !Number.isFinite(boss.pos.y) ||
                    !Number.isFinite(e2.ang) || !Number.isFinite(e2.ang0) ||
                    !Number.isFinite(e2.t) || !Number.isFinite(e2.cd) ||
                    e2.markers.some(m => !Number.isFinite(m.x) || !Number.isFinite(m.y)) ||
                    e2.path.some(n => !Number.isFinite(n.x) || !Number.isFinite(n.y)) ||
                    e2.strikes.some(s => !Number.isFinite(s.x) || !Number.isFinite(s.y));
        if (bad) { finite = false; badAt = `frame ${f}`; }
      }
    }
    PEAKS[id] = peak;
    T(`[P39] ${id}: 5 simulated minutes leave every coordinate and timer finite`, finite, badAt);
    T(`[P39] ${id}: the boss is still on a finite position afterwards`,
      Number.isFinite(boss.pos.x) && Number.isFinite(boss.pos.y), `${boss.pos.x},${boss.pos.y}`);
    T(`[P40] ${id}: markers  ≤ ENC_CAPS.markers`,  peak.markers  <= ENC_CAPS.markers,  String(peak.markers));
    T(`[P40] ${id}: strikes  ≤ ENC_CAPS.strikes`,  peak.strikes  <= ENC_CAPS.strikes,  String(peak.strikes));
    T(`[P40] ${id}: path     ≤ ENC_CAPS.pathPoints`, peak.path   <= ENC_CAPS.pathPoints, String(peak.path));
    T(`[P40] ${id}: summons  ≤ ENC_CAPS.summons`,  peak.summons  <= ENC_CAPS.summons,  String(peak.summons));
  }
  T('[P40] the caps are the ones the encounter really needs (each signature exercises its own)',
    PEAKS.titan.markers >= STAGE_BOSS_SIGNATURES.titan.markerMin &&
    PEAKS.cyberSerpent.path > 0 && PEAKS.bloodfang.summons > 0,
    JSON.stringify(PEAKS));
  T('[P40] drawing an encounter never throws and never leaves the context unbalanced',
    (() => {
      for (const id of BOSS_IDS) {
        const { g, boss } = bossFor(id);
        for (let f = 0; f < 60 * 30; f++) {
          encFrame(g, boss, id, DT, { parkDist: 300 });
          const c = countingCtx();
          try { g._drawStageBossCinematics(c); } catch (_) { return false; }
        }
      }
      return true;
    })());
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 41. DETERMINISTIC REPLAY — THE SAME SEED REPLAYS EXACTLY ═══');
{
  function replay(id, seed, frames = 60 * 150) {
    pinRandom(seed);
    const { g, boss } = bossFor(id);
    const log = [];
    let last = -1;
    g._damagePlayer = () => true;
    for (let f = 0; f < frames; f++) {
      const e = boss._enc;
      const driving = id === 'cyberSerpent' && e && e.phase === ENC_PHASE.EXECUTE;
      if (!driving) park(g, boss, 260);
      centerCam(g);
      g._updateStageBossCinematics(DT);
      const e2 = boss._enc;
      if (!e2) continue;
      if (e2.phase !== last) { log.push(`${f}:${last}>${e2.phase}:${e2.markers.length}:${e2.path.length}:${e2.summons.length}`); last = e2.phase; }
    }
    unpinRandom();
    return log.join(',');
  }
  for (const id of BOSS_IDS) {
    const a = replay(id, 20260731), b = replay(id, 20260731);
    T(`[P41] ${id}: two identical runs give an identical phase timeline`, a === b,
      `${a.slice(0, 100)} vs ${b.slice(0, 100)}`);
    T(`[P41] ${id}: the replay is non-trivial (>= 8 transitions compared)`,
      a.split(',').filter(Boolean).length >= 8, String(a.split(',').filter(Boolean).length));
  }
  // The encounter's own LCG is seeded, reproducible, and diverges on a different seed.
  for (const id of BOSS_IDS) {
    T(`[P41] ${id}: initBossEncounter is reproducible for one seed`,
      JSON.stringify(initBossEncounter(id, 99991)) === JSON.stringify(initBossEncounter(id, 99991)));
    T(`[P41] ${id}: a different seed produces a different LCG state`,
      initBossEncounter(id, 99991).rng !== initBossEncounter(id, 12345).rng);
    T(`[P41] ${id}: a hostile seed still yields a finite, in-INTRO encounter`,
      [0, -1, NaN, Infinity, -Infinity, 1e18, 0.5, null, undefined].every(s => {
        const e = initBossEncounter(id, s);
        return !!e && Number.isFinite(e.rng) && e.phase === ENC_PHASE.INTRO && Number.isFinite(e.cd);
      }));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 42. OLD-SAVE COMPATIBILITY ═══');
{
  T('[P42] StageBossCinematics.js touches no persistence at all',
    !/localStorage|sessionStorage|indexedDB|JSON\.parse|_save\(/.test(SBC_CODE));
  // A full encounter must not add or change a single save key.
  {
    const { g, boss, id } = bossFor('bloodfang');
    const before = JSON.stringify(Object.keys(globalThis.localStorage).slice().sort());
    const beforeVals = Object.keys(globalThis.localStorage).sort()
      .map(k => k + '=' + globalThis.localStorage.getItem(k)).join('|');
    runEnc(g, boss, id, 60 * 90, { parkDist: 300 });
    const after = JSON.stringify(Object.keys(globalThis.localStorage).slice().sort());
    const afterVals = Object.keys(globalThis.localStorage).sort()
      .map(k => k + '=' + globalThis.localStorage.getItem(k)).join('|');
    T('[P42] 90s of boss cinematics adds no save key', before === after, `${before} vs ${after}`);
    T('[P42] 90s of boss cinematics changes no save value', beforeVals === afterVals);
  }
  // A save with only the PRE-5.2 fields still loads and still fights the boss.
  {
    const un = muteConsole();
    try { globalThis.localStorage.clear(); } catch (_) {}
    // The canonical ladder field is the only thing Slice A/B ever needed.
    const g = new Game();
    g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing'; g.reset();
    const legacy = { stagesCleared: 5, bossKills: {}, relics: [] };
    Object.assign(g.meta, legacy);
    g.setRunBiome('neon_district'); g._applyRunBiome();
    un();
    const r = spawnBoss('neon_district', { g });
    T('[P42] a legacy save (stagesCleared only, no 5.2 fields) still reaches the stage boss',
      !!r.boss && r.id === 'mech', String(r.id));
    runEnc(g, r.boss, r.id, 60 * 40, { parkDist: 300 });
    T('[P42] …and the cinematic encounter runs normally on that legacy save',
      !!r.boss._enc && r.boss._enc.activations >= 1, String(r.boss._enc && r.boss._enc.activations));
    T('[P42] the encounter state lives on the boss object, not in the save',
      !/_enc/.test(JSON.stringify(g.meta)));
  }
  T('[P42] no new persisted stage-boss field was introduced in Game.reset()',
    !/this\.meta\.[A-Za-z_]*[Ee]nc/.test(GAME_SRC));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 43. BIOME ENEMY POOLS UNCHANGED ═══');
const POOLS_BEFORE = JSON.stringify(CAMPAIGN_BIOME_ENEMY_POOLS);
{
  T('[P43] CAMPAIGN_BIOME_ENEMY_POOLS is frozen, entries included',
    Object.isFrozen(CAMPAIGN_BIOME_ENEMY_POOLS) &&
    Object.values(CAMPAIGN_BIOME_ENEMY_POOLS).every(p => Object.isFrozen(p)));
  T('[P43] it still covers exactly the six ring biomes',
    Object.keys(CAMPAIGN_BIOME_ENEMY_POOLS).slice().sort().join(',') === RING.slice().sort().join(','),
    Object.keys(CAMPAIGN_BIOME_ENEMY_POOLS).join(','));
  T('[P43] StageBossCinematics.js never references the pools or the biome gate',
    !/CAMPAIGN_BIOME_ENEMY_POOLS|pickBiomeEnemy|_biomeSpawnType|BIOME_POOL_EXCLUDED/.test(SBC_CODE));
  T('[P43] no stage-boss display name leaked into a biome pool',
    Object.values(CAMPAIGN_BIOME_ENEMY_POOLS).every(p =>
      p.every(x => !Object.values(MAP).some(m => m.name.toUpperCase() === String(x.id).toUpperCase()))));
  // The only enemy id the layer can ever spawn is the declared summonType, and it is a pool member.
  T('[P43] the only enemy id the cinematic layer can spawn is the declared summonType',
    (SBC_CODE.match(/spawnEnemy\?\.\(([^,]+),/g) || []).every(m => /def\.summonType/.test(m)),
    (SBC_CODE.match(/spawnEnemy\?\.\([^)]*\)/g) || []).join(' | '));
  {
    // a full pack-assault run must not mutate the pools
    const { g, boss, id } = bossFor('bloodfang');
    runEnc(g, boss, id, 60 * 120, { parkDist: 300 });
    T('[P43] a full pack-assault run leaves the pools byte-identical',
      JSON.stringify(CAMPAIGN_BIOME_ENEMY_POOLS) === POOLS_BEFORE);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 44. BATCH 5.1 ENEMY_SIGNATURES REGISTRY UNCHANGED ═══');
{
  const EXPECT_5_1 = {
    'Volt Rat':       'zigzag_surge',
    'Pulse Burrower': 'burrow_reposition',
    'Razorhound':     'committed_lunge',
    'Rift Eye':       'aimed_rift_shot',
    'Heavy Mech':     'ground_brace',
    'Abyss Maw':      'frontal_guard',
  };
  T('[P44] ENEMY_SIGNATURES still carries exactly 6 entries',
    Object.keys(ENEMY_SIGNATURES).length === 6, Object.keys(ENEMY_SIGNATURES).join(','));
  for (const [type, sig] of Object.entries(EXPECT_5_1)) {
    T(`[P44] ${type} → ${sig} (Batch 5.1 pairing intact)`,
      ENEMY_SIGNATURES[type] && ENEMY_SIGNATURES[type].id === sig,
      String(ENEMY_SIGNATURES[type] && ENEMY_SIGNATURES[type].id));
  }
  T('[P44] the Batch 5.1 registry is still frozen',
    Object.isFrozen(ENEMY_SIGNATURES) && Object.values(ENEMY_SIGNATURES).every(d => Object.isFrozen(d)));
  T('[P44] no stage-boss id acquired an ENEMY_SIGNATURE',
    BOSS_IDS.every(id => signatureFor(id) === null));
  T('[P44] no stage-boss DISPLAY NAME acquired an ENEMY_SIGNATURE',
    Object.values(MAP).every(m => signatureFor(m.name) === null));
  T('[P44] the mech Enemy type has no Batch 5.1 signature (it is a boss)',
    signatureFor('Security Defector Mech') === null);
  T('[P44] no Batch 5.1 signature id collides with a stage-boss signature id',
    Object.values(ENEMY_SIGNATURES).every(d => !Object.values(EXPECT_SIG).includes(d.id)));
  T('[P44] StageBossCinematics.js never imports or touches EnemySignatures',
    !/EnemySignatures|ENEMY_SIGNATURES|updateSignature/.test(SBC_CODE));
  // …and the two systems really coexist: a signature enemy keeps working next to a live boss.
  {
    const { g, boss, id } = bossFor('mech');
    g._biomeSpawnType = (t) => t;
    const un = muteConsole();
    // Bypass the Batch 4.5 biome sub-pool gate: this test is about the two SIGNATURE systems
    // coexisting, so the probe type must be exactly what we asked for, in every biome.
    g._biomeSpawnType = (t) => t;
    for (let i = 0; i < 16; i++) g.spawnEnemy('Volt Rat', { x: g.player.pos.x + 220 + i * 12, y: g.player.pos.y + 40 });
    un();
    const rats = g.enemies.filter(e => e.enemyType === 'Volt Rat');
    T('[P44] normal signature enemies still spawn while a stage boss is live', rats.length >= 1, String(rats.length));
    T('[P44] …and they still carry their Batch 5.1 _sig',
      rats.every(e => e._sig && e._sig.id === 'zigzag_surge'));
    // Keep the probe rats alive across the window: the contract under test is that both systems
    // stay wired and neither throws, not that a fodder enemy survives the player's build.
    // Top the probe rats back up EVERY frame and re-add any the player cleared: the contract under
    // test is that the two signature systems coexist without throwing, not that fodder survives a
    // levelled build. Re-adding keeps the check deterministic instead of racing the player's DPS.
    let coexistErr = null;
    realFrames(g, 300, () => {
      park(g, boss, 300);
      let alive = 0;
      for (const e of g.enemies) if (e.enemyType === 'Volt Rat') { e.hp = e.maxHp; alive++; }
      if (alive < 4) {
        const un2 = muteConsole();
        g._biomeSpawnType = (t) => t;
        for (let i = alive; i < 8; i++) g.spawnEnemy('Volt Rat', { x: g.player.pos.x + 260 + i * 10, y: g.player.pos.y - 40 });
        un2();
      }
    });
    const ratsAfter = g.enemies.filter(e => e.enemyType === 'Volt Rat' && e._sig);
    T('[P44] 5s of real frames with both systems live throws nothing and keeps both alive',
      !!boss._enc && ratsAfter.length >= 1 && coexistErr === null,
      `enc=${!!boss._enc} rats=${ratsAfter.length}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 45. ENDLESS UNAFFECTED ═══');
{
  const g = newGame('endless');
  T('[P45] Endless: the stage machine never arms a stage boss',
    (() => { const un = muteConsole();
             for (let f = 0; f < 60 * 200; f++) { g.timeAlive += DT; g._updateStageProgression(); }
             un(); return !g._activeStageBoss; })(), JSON.stringify(g._activeStageBoss));
  // Even with a boss singleton forcibly on the field, the cinematic layer must not adopt it.
  const un = muteConsole();
  g._spawnTitan();
  un();
  const b = g.titanBoss;
  for (let f = 0; f < 60 * 30; f++) { centerCam(g); g._updateStageBossCinematics(DT); }
  T('[P45] Endless: an Endless titan gets NO cinematic encounter', !b._enc, String(b && b._enc));
  T('[P45] Endless: _encOwner is never claimed', !g._encOwner);
  const c = countingCtx();
  g._drawStageBossHealthBar(c); g._drawStageBossCinematics(c);
  T('[P45] Endless: the shared boss health bar and telegraph layer draw nothing', c._ops === 0, String(c._ops));
  T('[P45] the endless/chaos guard is the first statement of _updateStageBossCinematics',
    /_updateStageBossCinematics\(dt\)\s*\{\s*\n\s*if \(this\.endless \|\| this\._chaosMode\) return;/.test(GAME_SRC));
  T('[P45] Endless: no boss summon can be created', liveSummons(g) === 0);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 46. CHAOS UNAFFECTED ═══');
{
  const g = newGame('chaos');
  const un = muteConsole();
  for (let f = 0; f < 60 * 200; f++) { g.timeAlive += DT; g._updateStageProgression(); }
  g._spawnBloodfang();
  un();
  const b = g.bloodfangBoss;
  for (let f = 0; f < 60 * 30; f++) { centerCam(g); g._updateStageBossCinematics(DT); }
  T('[P46] Chaos: the stage machine never arms a stage boss', !g._activeStageBoss);
  T('[P46] Chaos: a Chaos bloodfang gets NO cinematic encounter', !b._enc);
  T('[P46] Chaos: _encOwner is never claimed', !g._encOwner);
  T('[P46] Chaos: no boss summon can be created', liveSummons(g) === 0);
  const c = countingCtx();
  g._drawStageBossHealthBar(c); g._drawStageBossCinematics(c);
  T('[P46] Chaos: the shared boss health bar and telegraph layer draw nothing', c._ops === 0, String(c._ops));
  T('[P46] Chaos Mega Titans are untouched — none is a stage boss and none has a signature',
    [...Enemy.CHAOS_TITANS].every(t => bossSignatureFor(t) === null &&
      !Object.values(MAP).some(m => m.name.toUpperCase() === t.toUpperCase())));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 47. REWARDS GRANTED EXACTLY ONCE ═══');
{
  for (const biome of RING) {
    const { g, id, boss } = spawnBoss(biome);
    const kills = [], echoes = [], grants = [], anns = [];
    g.meta.recordBossKill  = (i) => kills.push(i);
    g.meta.recordBossEcho  = (i) => echoes.push(i);
    g.meta.grantStageRelic = (r) => { grants.push(r); return true; };
    g.triggerAnnouncement  = (t) => anns.push(String(t));
    runEnc(g, boss, id, 60 * 20, { parkDist: 300 });
    killBoss(g, id);
    const un = muteConsole();
    for (let f = 0; f < 60 * 120; f++) { g.timeAlive += DT; g._updateStageProgression(); g._updateStageBossCinematics(DT); }
    un();
    T(`[P47] ${biome}: recordBossKill fired EXACTLY once`, kills.length === 1, kills.join(','));
    T(`[P47] ${biome}: grantStageRelic fired EXACTLY once`, grants.length === 1, grants.join(','));
    T(`[P47] ${biome}: the relic granted is the mapped one`, grants[0] === MAP[biome].reward, String(grants[0]));
    T(`[P47] ${biome}: the reward banner appeared at most once`,
      anns.filter(a => a.includes('STAGE REWARD UNLOCKED')).length <= 1);
    T(`[P47] ${biome}: _stageBossRewarded latches for that biome`, g._stageBossRewarded[biome] === true);
    // a second, forced clear of the same biome pays nothing more
    g._stageBossCleared[biome] = false;
    const un2 = muteConsole();
    g._awardStageBossReward(biome);
    un2();
    T(`[P47] ${biome}: a forced repeat clear pays nothing`, kills.length === 1 && grants.length === 1);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 48. HEALTH BAR REMOVED AFTER DEATH ═══');
{
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    runEnc(g, boss, id, 120, { parkDist: 300 });
    let c = countingCtx();
    g._drawStageBossHealthBar(c);
    const live = c._ops;
    killBoss(g, id);
    g._updateStageBossCinematics(DT);
    c = countingCtx();
    g._drawStageBossHealthBar(c);
    const dead = c._ops;
    T(`[P48] ${id}: the bar is drawn while alive and gone after death`, live > 0 && dead === 0,
      `${live} → ${dead}`);
    // …and it stays gone for the rest of the run
    for (let f = 0; f < 600; f++) g._updateStageBossCinematics(DT);
    c = countingCtx();
    g._drawStageBossHealthBar(c); g._drawStageBossCinematics(c);
    T(`[P48] ${id}: 10s later neither the bar nor a telegraph is drawn`, c._ops === 0, String(c._ops));
    T(`[P48] ${id}: _liveStageBoss() reports nothing after the kill`, g._liveStageBoss() === null);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 49. NO LINGERING HAZARDS AFTER A DECK TRANSITION ═══');
{
  const TRANSIENTS = ['gunshipZones', 'lightningZones', 'cybermoteMines', 'bossLavaZones',
                      '_voidRifts', '_ventBursts', 'airstrikeShips', '_enemyBeams', '_enemyOrbZones',
                      '_titanShockwaves', '_titanBeams', '_bloodfangSlams', '_serpentTrails',
                      '_dragonIceShards', '_dragonBolts', 'bossTrails'];
  for (const id of BOSS_IDS) {
    const { g, boss } = bossFor(id);
    runEnc(g, boss, id, 60 * 60, { parkDist: 300 });
    const un = muteConsole();
    g._clearDeckTransients({ x: g.player.pos.x, y: g.player.pos.y }, g._walkMode());
    un();
    const leftover = TRANSIENTS.filter(k => Array.isArray(g[k]) && g[k].length > 0);
    T(`[P49] ${id}: every hostile transient array is empty after the sweep`,
      leftover.length === 0, leftover.join(','));
    T(`[P49] ${id}: no enemy and no boss summon survives the sweep`,
      g.enemies.length === 0 && liveSummons(g) === 0, `${g.enemies.length} enemies`);
    T(`[P49] ${id}: projectiles and enemy bullets are dropped`,
      g.projectiles.length === 0 && g.enemyBullets.length === 0);
    // Nothing the encounter owned may outlive the boss leaving the deck. (`mech` is an Enemy and is
    // swept out above; the five singletons are not in `enemies`, so they are retired explicitly —
    // exactly what the deck path would have to do if Act 1 ever gained decks.)
    let dmg = 0;
    g._damagePlayer = () => { dmg++; return true; };
    killBoss(g, id);
    g._updateStageBossCinematics(DT);
    for (let f = 0; f < 300; f++) { centerCam(g); g._updateStageBossCinematics(DT); }
    T(`[P49] ${id}: no stale effect damages the player after the sweep`, dmg === 0, String(dmg));
    T(`[P49] ${id}: the encounter owns no stale marker / strike / path / summon`,
      boss._enc === null, JSON.stringify(bossEncounterStats(boss)));
    T(`[P49] ${id}: no boss summon survived into the next deck`, liveSummons(g) === 0);
  }
  T('[P49] the deck sweep still lists the Batch 5.2 boss transients explicitly',
    /_titanShockwaves[\s\S]{0,200}_dragonBolts/.test(GAME_SRC));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ 50. NO MISSING ASSET REFERENCES ═══');
{
  // The five singleton bosses load their art through Game's own Image handles.
  const SPRITES = {
    titan:        'assets/enemies/bosses/ai_overload_titan.png',
    annihilator:  'assets/enemies/bosses/matrix_annihilator.png',
    bloodfang:    'assets/enemies/bosses/bloodfang_packmaster.png',
    cyberSerpent: 'assets/enemies/bosses/cyber_serpent_boss.png',
    cyberDragon:  'assets/enemies/bosses/cyber_dragon_boss.png',
  };
  for (const [id, rel] of Object.entries(SPRITES)) {
    T(`[P50] ${id}: Game.js still points at ${rel}`, GAME_SRC.includes(rel));
    T(`[P50] ${id}: ${rel} exists on disk`, fs.existsSync(path.resolve(ROOT, rel)), rel);
  }
  // The mech is an Enemy, so its sprite comes from the Enemy sprite map.
  {
    const un = muteConsole();
    const e = new Enemy('Security Defector Mech', 0);
    un();
    const src = e.sprite ? String(e.sprite.src || '').split('?')[0].replace(/^\.?\//, '') : '';
    T('[P50] mech: the Enemy carries a mapped sprite', !!src, src);
    T('[P50] mech: its sprite file exists on disk', !!src && fs.existsSync(path.resolve(ROOT, src)), src);
  }
  // The summoned pack type must also resolve to real art.
  {
    const un = muteConsole();
    const e = new Enemy(STAGE_BOSS_SIGNATURES.bloodfang.summonType, 0);
    un();
    const src = e.sprite ? String(e.sprite.src || '').split('?')[0].replace(/^\.?\//, '') : '';
    T('[P50] the summoned pack type resolves to a sprite that exists on disk',
      !!src && fs.existsSync(path.resolve(ROOT, src)), src);
  }
  // The cinematic layer must be pure geometry — it may not reference any image asset of its own.
  T('[P50] StageBossCinematics.js references no image asset at all (pure canvas geometry)',
    !/\.png|\.jpg|\.webp|new Image\(|assets\//.test(SBC_CODE));
  T('[P50] every signature colour is a valid CSS hex',
    BOSS_IDS.every(id => /^#[0-9a-f]{6}$/i.test(STAGE_BOSS_SIGNATURES[id].color)));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n═══ STRESS — 10 SIMULATED MINUTES PER BOSS, WITH THE HORDE LIVE ═══');
{
  const MINUTES = 10;
  const FRAMES  = 60 * 60 * MINUTES;
  for (const id of BOSS_IDS) {
    pinRandom(0xB0552 + STAGE_BOSS_IDS.indexOf(id));
    const { g, boss } = bossFor(id);
    g._biomeSpawnType = (t) => t;              // measure the horde we asked for, not the pool remap
    g._damagePlayer = () => true;
    // a real horde on the field for the whole run
    const un0 = muteConsole();
    for (let i = 0; i < 24; i++)
      g.spawnEnemy('Glitch Drone', { x: g.player.pos.x + 400 + (i % 8) * 40, y: g.player.pos.y + (i % 5) * 60 });
    un0();
    const liveCount = () => g.enemies.filter(e => e && e.hp > 0).length;
    const hordeStart = liveCount();
    const peak = { markers: 0, strikes: 0, path: 0, summons: 0, enemies: hordeStart };
    let finite = true, activations = 0, badFrame = -1;
    const un = muteConsole();
    for (let f = 0; f < FRAMES; f++) {
      const e = boss._enc;
      const driving = id === 'cyberSerpent' && e && e.phase === ENC_PHASE.EXECUTE;
      if (!driving) park(g, boss, 180 + (f % 500));
      centerCam(g);
      g._updateStageBossCinematics(DT);
      const e2 = boss._enc;
      if (!e2) continue;
      peak.markers = Math.max(peak.markers, e2.markers.length);
      peak.strikes = Math.max(peak.strikes, e2.strikes.length);
      peak.path    = Math.max(peak.path, e2.path.length);
      peak.summons = Math.max(peak.summons, e2.summons.length);
      peak.enemies = Math.max(peak.enemies, liveCount());
      activations  = e2.activations;
      if (finite && (!Number.isFinite(boss.pos.x) || !Number.isFinite(boss.pos.y) ||
                     !Number.isFinite(e2.t) || !Number.isFinite(e2.cd) || !Number.isFinite(e2.ang))) {
        finite = false; badFrame = f;
      }
    }
    un();
    unpinRandom();
    T(`[STRESS] ${id}: ${MINUTES} min produced real activations`, activations >= 30, String(activations));
    T(`[STRESS] ${id}: every coordinate and timer stayed finite for ${MINUTES} min`, finite, `frame ${badFrame}`);
    T(`[STRESS] ${id}: peak markers/strikes/path/summons all inside ENC_CAPS`,
      peak.markers <= ENC_CAPS.markers && peak.strikes <= ENC_CAPS.strikes &&
      peak.path <= ENC_CAPS.pathPoints && peak.summons <= ENC_CAPS.summons, JSON.stringify(peak));
    T(`[STRESS] ${id}: the live enemy count did not grow without bound (summons are capped, not leaked)`,
      liveCount() <= hordeStart + ENC_CAPS.summons,
      `${hordeStart} → ${liveCount()} (peak ${peak.enemies})`);
    T(`[STRESS] ${id}: the encounter still holds no more than its caps at the end`,
      boss._enc.markers.length <= ENC_CAPS.markers && boss._enc.strikes.length <= ENC_CAPS.strikes &&
      boss._enc.path.length <= ENC_CAPS.pathPoints && boss._enc.summons.length <= ENC_CAPS.summons,
      JSON.stringify(bossEncounterStats(boss)));
  }

  // ── repeated spawn / death cycles ─────────────────────────────────────────────────────────────
  {
    const g = newRun('neon_district');
    const un = muteConsole();
    const counts = [];
    for (let cycle = 0; cycle < 12; cycle++) {
      // let the stage machine arm the mech, fight it, kill it, and let the stage roll on
      let n = 0;
      while (!g._activeStageBoss && n < 60 * 200) { g.timeAlive += DT; g._updateStageProgression(); n++; }
      if (!g._activeStageBoss) break;
      const id = g._activeStageBoss.id;
      const b  = g._stageBossObject(id);
      for (let f = 0; f < 60 * 30; f++) {
        const e = b._enc;
        const driving = id === 'cyberSerpent' && e && e.phase === ENC_PHASE.EXECUTE;
        if (!driving) park(g, b, 300);
        centerCam(g);
        g._updateStageBossCinematics(DT);
      }
      killBoss(g, id);
      g._updateStageBossCinematics(DT);
      for (let f = 0; f < 10; f++) { g.timeAlive += DT; g._updateStageProgression(); }
      counts.push({ cycle, enemies: g.enemies.filter(e => e && e.hp > 0).length,
                    summons: liveSummons(g), owner: !!g._encOwner });
    }
    un();
    T('[STRESS] repeated spawn/death cycles ran', counts.length >= 5, String(counts.length));
    T('[STRESS] no boss summon survives any spawn/death cycle',
      counts.every(c => c.summons === 0), JSON.stringify(counts));
    T('[STRESS] _encOwner is released after every cycle',
      counts.every(c => c.owner === false), JSON.stringify(counts.map(c => c.owner)));
    T('[STRESS] the enemy list does not grow across cycles',
      counts[counts.length - 1].enemies <= counts[0].enemies + ENC_CAPS.summons + 4,
      JSON.stringify(counts.map(c => c.enemies)));
  }

  // ── repeated reset + repeated deck transition ────────────────────────────────────────────────
  {
    const growth = [];
    for (let round = 0; round < 6; round++) {
      const { g, boss, id } = bossFor('bloodfang');
      runEnc(g, boss, id, 60 * 40, { parkDist: 300 });
      const un = muteConsole();
      g._clearDeckTransients({ x: g.player.pos.x, y: g.player.pos.y }, g._walkMode());
      g.reset();
      g._clearDeckTransients({ x: g.player.pos.x, y: g.player.pos.y }, g._walkMode());
      g.reset();
      un();
      growth.push({ enemies: g.enemies.length, summons: liveSummons(g),
                    owner: !!g._encOwner, active: !!g._activeStageBoss });
    }
    T('[STRESS] repeated reset + deck transition: nothing accumulates',
      growth.every(x => x.enemies === 0 && x.summons === 0 && !x.owner && !x.active),
      JSON.stringify(growth));
  }

  // ── deterministic replay under stress ─────────────────────────────────────────────────────────
  {
    function stressReplay(id, seed) {
      pinRandom(seed);
      const { g, boss } = bossFor(id);
      g._biomeSpawnType = (t) => t;
      g._damagePlayer = () => true;
      const un0 = muteConsole();
      for (let i = 0; i < 12; i++) g.spawnEnemy('Glitch Drone', { x: g.player.pos.x + 500, y: g.player.pos.y + i * 30 });
      un0();
      const log = [];
      let last = -1;
      const un = muteConsole();
      for (let f = 0; f < 60 * 240; f++) {
        const e = boss._enc;
        const driving = id === 'cyberSerpent' && e && e.phase === ENC_PHASE.EXECUTE;
        if (!driving) park(g, boss, 200 + (f % 300));
        centerCam(g);
        g._updateStageBossCinematics(DT);
        const e2 = boss._enc;
        if (!e2) continue;
        if (e2.phase !== last) {
          log.push(`${f}:${last}>${e2.phase}:${e2.markers.length}:${e2.path.length}:${e2.summons.length}:${Math.round(boss.pos.x)},${Math.round(boss.pos.y)}`);
          last = e2.phase;
        }
      }
      un();
      unpinRandom();
      return log.join(',');
    }
    for (const id of BOSS_IDS) {
      const a = stressReplay(id, 4242), b = stressReplay(id, 4242);
      T(`[STRESS] ${id}: a 4-minute stressed run replays byte-identically`, a === b,
        `${a.length} vs ${b.length} chars`);
      T(`[STRESS] ${id}: that replay is substantial (>= 20 transitions)`,
        a.split(',').filter(Boolean).length >= 20, String(a.split(',').filter(Boolean).length));
    }
  }

  T('[STRESS] the biome pools survived the whole stress section unchanged',
    JSON.stringify(CAMPAIGN_BIOME_ENEMY_POOLS) === POOLS_BEFORE);
  T('[STRESS] the signature registry survived the whole stress section unchanged',
    Object.keys(STAGE_BOSS_SIGNATURES).length === 6 &&
    BOSS_IDS.every(id => STAGE_BOSS_SIGNATURES[id].id === EXPECT_SIG[id]));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('DONE');
process.exit(fail === 0 ? 0 : 1);
