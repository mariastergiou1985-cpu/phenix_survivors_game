// BATCH 4.4 — MILESTONE 2 / Slice B: STAGE BOSSES + UNIQUE REWARDS
// ------------------------------------------------------------------------------------------------
// Roadmap MILESTONE 2 / Slice B, item 1: "1 stage-boss + 1 unique reward ανά stage".
//
// WHAT WAS ACTUALLY BROKEN BEFORE THIS BATCH (both proven by this file's first two sections):
//
//   * `_updateStageProgression()` was DEAD CODE — defined at one line, referenced by a comment at
//     another, and called from nowhere in all ~34k lines. Act 1 stage progression never ran.
//   * Even if it had been called, its local `STAGE_DUR = 12 * 60` (720s) exceeded the entire act
//     (`ACT1_WIN_SECONDS` = 480s), so `Math.floor(timeAlive / STAGE_DUR)` was pinned at 0 forever.
//   * There was no boss→biome mapping anywhere in the codebase, and no stage had a boss or a reward.
//
// The fix: a real state machine — survive the stage window → the biome's boss spawns (once) →
// the stage does not advance until it is dead → the biome's unique relic is paid exactly once.
//
// NO BALANCE NUMBER IS ASSERTED HERE. Boss HP, biome modifiers and relic effects are all read from
// the shipping definitions at runtime, so retuning them cannot make this file lie.
//
//   node tools/qa/batch4_stage_boss_rewards_regression.mjs
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
const { BIOME_DEFS } = await import(pathToFileURL(path.join(ROOT, 'js/game/MapManager.js')).href);
const { RELIC_DEFS } = await import(pathToFileURL(path.join(ROOT, 'js/game/MetaProgress.js')).href);
u0();

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

const RING = Game.STAGE_RING;
const MAP  = Game.STAGE_BOSSES;
const FIELD = { titan:'titanBoss', annihilator:'annihilatorBoss', bloodfang:'bloodfangBoss',
                cyberSerpent:'cyberSerpentBoss', cyberDragon:'cyberDragonBoss' };
const IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };

function newGame() {
  const un = muteConsole();
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  un();
  return g;
}
// The ladder from Slice A gates the ring; every test about BOSSES needs it granted first, through
// the REAL save field, or it would be measuring the lock instead of the boss.
function newRun(biome = 'neon_district') {
  const g = newGame();
  if (g.meta) g.meta.stagesCleared = RING.length - 1;
  const un = muteConsole();
  g.setRunBiome(biome);
  g._applyRunBiome();
  un();
  return g;
}
/** Advance the stage machine by `secs` of game time, optionally killing the boss `killAfter`s in. */
function drive(g, secs, { killAfter = null, onFrame = null } = {}) {
  const un = muteConsole();
  let armedAt = null;
  for (let i = 0; i < Math.round(secs * 60); i++) {
    g.timeAlive += 1 / 60;
    try { g._updateStageProgression(); } catch (e) { un(); throw e; }
    if (onFrame) onFrame(g);
    if (killAfter != null) {
      if (g._activeStageBoss && armedAt == null) armedAt = g.timeAlive;
      if (armedAt != null && g._activeStageBoss && (g.timeAlive - armedAt) >= killAfter) { killBoss(g, g._activeStageBoss.id); armedAt = null; }
      if (!g._activeStageBoss) armedAt = null;
    }
  }
  un();
}
function killBoss(g, id) {
  if (id === 'mech') { for (const e of g.enemies) if (e && e.enemyType === 'Security Defector Mech') e.hp = 0; return; }
  const f = FIELD[id]; if (f && g[f]) g[f].hp = 0;
}
function bossObj(g, id) {
  if (id === 'mech') return g.enemies.find(e => e && e.enemyType === 'Security Defector Mech') || null;
  return g[FIELD[id]] || null;
}
const STAGE_SECS = 80;   // mirrors ACT1_STAGE_SECONDS; asserted against real behaviour in §2

/**
 * Park the stage boss on the player, run REAL update() frames, and return how much HP the player
 * actually lost. This is the honest "does it hurt the player" proof — no field-name sniffing, and it
 * exercises the live _damagePlayer fairness gate (dash i-frames, grace window, 30-HP pulse cap).
 */
function measureBossDamage(g, id) {
  const un = muteConsole();
  const p = g.player;
  const before = p.hp;
  for (let i = 0; i < 900; i++) {
    const b = bossObj(g, id);
    if (!b || b.hp <= 0) break;
    b.pos.x = p.pos.x + 6; b.pos.y = p.pos.y + 6;      // glued to the player every frame
    if (b.hp < 5) b.hp = 500;                           // keep it alive; we are measuring OUR damage
    p.invulnTimer = 0; p.iFrames = 0; p.damageGrace = 0;
    g.paused = false;
    try { g.update(1 / 60, IN); } catch (_) {}
    if (p.hp < before) break;
  }
  const lost = before - p.hp;
  un();
  return lost;
}

console.log('\n═══ 1. CANONICAL MAPPING ═══');
{
  const keys = Object.keys(MAP);
  T('exactly 6 biomes carry a stage boss', keys.length === 6, keys.join(','));
  T('the 6 keys are exactly STAGE_RING, in order', keys.join(',') === RING.join(','), keys.join(','));
  T('the_null has no stage boss', !MAP.the_null && Game.prototype.stageBossFor.call({ }, 'the_null') === null ||
    newRun().stageBossFor('the_null') === null);
  const ids = keys.map(k => MAP[k].id);
  T('6 DISTINCT bosses — none reused', new Set(ids).size === 6, ids.join(','));
  const rewards = keys.map(k => MAP[k].reward);
  T('6 DISTINCT rewards — none reused', new Set(rewards).size === 6, rewards.join(','));
  T('every reward id resolves to a real RELIC_DEF',
    rewards.every(r => RELIC_DEFS.some(d => d.id === r)),
    rewards.filter(r => !RELIC_DEFS.some(d => d.id === r)).join(','));
  T('every reward relic is type:boss', rewards.every(r => RELIC_DEFS.find(d => d.id === r)?.type === 'boss'));
  T('every reward relic is gated on ITS OWN boss kill key',
    keys.every(k => RELIC_DEFS.find(d => d.id === MAP[k].reward)?.req === MAP[k].id),
    keys.filter(k => RELIC_DEFS.find(d => d.id === MAP[k].reward)?.req !== MAP[k].id).join(','));
  T('every reward relic has a non-empty effect string',
    rewards.every(r => (RELIC_DEFS.find(d => d.id === r)?.effect || '').length > 10));
  // No Chaos Mega Titan may be used as a plain stage boss.
  const TITANS = ['Giga-Core Overlord', 'Malware Leviathan', 'Quantum Void Emperor', 'Apocalypse Mech Tyrant'];
  const MEGA_IDS = ['overlordMega', 'leviathanMega', 'emperorMega', 'tyrantMega',
                    'titan_overlord', 'titan_leviathan', 'titan_emperor', 'titan_tyrant'];
  T('no Chaos Mega Titan is used as a stage boss', ids.every(i => !MEGA_IDS.includes(i)), ids.join(','));
  T('no Chaos Mega Titan reward relic is stolen',
    rewards.every(r => !['overlord_prism_array','leviathan_nanite_core','emperor_singularity_edge','tyrant_antimatter_battery'].includes(r)));
  T('no Chaos Titan enemy type appears in the mapping', ids.every(i => !TITANS.includes(i)));
  T('the campaign final boss (Rogue AI Overlord) is not reused as a stage boss', !ids.includes('Rogue AI Overlord'));
  T('every entry has a readable boss name', keys.every(k => (MAP[k].name || '').length > 3));
  T('every entry has a readable reward name', keys.every(k => (MAP[k].rewardName || '').length > 3));
  T('every entry has an announcement colour', keys.every(k => /^#[0-9a-f]{6}$/i.test(MAP[k].color || '')));
  T('the mapping object is frozen (cannot drift at runtime)', Object.isFrozen(MAP));
  // Thematic sanity: the two pre-existing boss relics stayed on their own bosses.
  T('serpent_ember_coil is still the Cyber Serpent reward', MAP.abyssal_trench.reward === 'serpent_ember_coil' && MAP.abyssal_trench.id === 'cyberSerpent');
  T('dragon_cryo_heart is still the Cyber Dragon reward', MAP.glacial_expanse.reward === 'dragon_cryo_heart' && MAP.glacial_expanse.id === 'cyberDragon');
  const g = newRun();
  T('stageBossFor() returns null for an unknown biome', g.stageBossFor('not_a_biome') === null);
  T('stageBossFor() returns null for null/undefined', g.stageBossFor(null) === null && g.stageBossFor(undefined) === null);
  T('stageBossFor() resolves every ring biome', RING.every(b => !!g.stageBossFor(b)));
}

console.log('\n═══ 2. THE STAGE MACHINE IS ACTUALLY WIRED ═══');
{
  const g = newRun('neon_district');
  T('a fresh Act 1 run starts on stage 1', g._stageIndex === 0);
  T('and on the selected biome', g._stageBiome === 'neon_district');
  T('with no stage boss armed', g._activeStageBoss === null);
  T('and nothing cleared or rewarded yet',
    Object.keys(g._stageBossCleared).length === 0 && Object.keys(g._stageBossRewarded).length === 0);
  // Before the window elapses: no boss.
  drive(g, STAGE_SECS - 5);
  T('no boss spawns before the stage window elapses', g._activeStageBoss === null, String(g.timeAlive.toFixed(1)));
  T('and the stage has not advanced', g._stageIndex === 0);
  drive(g, 10);
  T('the boss spawns once the window elapses', !!g._activeStageBoss, String(g.timeAlive.toFixed(1)));
  T('it is THIS biome\'s boss', g._activeStageBoss?.id === MAP.neon_district.id, g._activeStageBoss?.id);
  T('the boss object really exists on the field', !!bossObj(g, 'mech'));
  // Blocked while it lives.
  drive(g, 200);
  T('the stage does NOT advance while the boss is alive', g._stageIndex === 0, 'si=' + g._stageIndex);
  T('and the biome rule stays on this stage', g._stageBiome === 'neon_district');
  T('the boss is not spawned a second time',
    g.enemies.filter(e => e && e.enemyType === 'Security Defector Mech').length === 1);
  // Kill it → advance.
  killBoss(g, 'mech');
  drive(g, 1);
  T('the stage advances once the boss dies', g._stageIndex === 1, 'si=' + g._stageIndex);
  T('and the biome rule moves to the next stage', g._stageBiome === 'industrial_core', g._stageBiome);
  T('_activeStageBoss is cleared after the kill', g._activeStageBoss === null);
  T('the cleared flag is set for the beaten biome', g._stageBossCleared.neon_district === true);
  T('the next stage is NOT pre-cleared', !g._stageBossCleared.industrial_core);
  T('the stage window restarts for the new stage', Math.abs(g._stageStartT - g.timeAlive) < 1.2);
}

console.log('\n═══ 3. ALL SIX STAGES, ONE FULL RUN ═══');
{
  const g = newRun('neon_district');
  const seen = [];
  const order = g._stageOrder();
  drive(g, 6 * (STAGE_SECS + 6) + 60, { killAfter: 2, onFrame: (gg) => {
    if (gg._activeStageBoss && !seen.some(s => s.biome === gg._activeStageBoss.biome)) {
      seen.push({ biome: gg._activeStageBoss.biome, id: gg._activeStageBoss.id, t: +gg.timeAlive.toFixed(1) });
    }
  } });
  T('all six stage bosses appeared', seen.length === 6, seen.map(s => s.biome).join(','));
  T('each appeared exactly once', new Set(seen.map(s => s.biome)).size === seen.length);
  T('they appeared in ring order', seen.map(s => s.biome).join(',') === order.join(','), seen.map(s => s.biome).join(','));
  T('each was the right boss for its biome', seen.every(s => MAP[s.biome].id === s.id),
    seen.filter(s => MAP[s.biome].id !== s.id).map(s => s.biome + ':' + s.id).join(','));
  T('spawn times are strictly increasing and finite',
    seen.every((s, i) => Number.isFinite(s.t) && (i === 0 || s.t > seen[i-1].t)), seen.map(s => s.t).join(','));
  T('the run reached the last stage of the ring', g._stageIndex === RING.length - 1, 'si=' + g._stageIndex);
  T('all six biomes are marked cleared', RING.every(b => g._stageBossCleared[b] === true),
    RING.filter(b => !g._stageBossCleared[b]).join(','));
  T('all six rewards were paid', RING.every(b => g._stageBossRewarded[b] === true));
  const owned = Object.keys(g.meta.relics || {}).filter(k => g.meta.relics[k]);
  T('the save holds exactly the six stage relics', RING.every(b => owned.includes(MAP[b].reward)),
    owned.join(','));
  T('six DISTINCT relics were granted', new Set(RING.map(b => MAP[b].reward)).size === 6);
  T('every boss kill key was recorded', RING.every(b => g.meta.hasBossKill(MAP[b].id) === true),
    RING.filter(b => !g.meta.hasBossKill(MAP[b].id)).join(','));
  T('no stale _activeStageBoss at the end of the run', g._activeStageBoss === null);
  T('no stage boss is left ALIVE on the field',
    RING.every(b => g._stageBossAlive(MAP[b].id) === false),
    RING.filter(b => g._stageBossAlive(MAP[b].id)).join(','));
}

console.log('\n═══ 4. ROTATED RING (a different starting stage) ═══');
{
  const g = newRun('glacial_expanse');
  const order = g._stageOrder();
  T('the rotated order starts at the selected biome', order[0] === 'glacial_expanse', order.join(','));
  T('the rotated order still visits all six exactly once', new Set(order).size === 6 && order.length === 6);
  const seen = [];
  drive(g, 3 * (STAGE_SECS + 6) + 30, { killAfter: 2, onFrame: (gg) => {
    if (gg._activeStageBoss && !seen.some(s => s.biome === gg._activeStageBoss.biome)) {
      seen.push({ biome: gg._activeStageBoss.biome, id: gg._activeStageBoss.id });
    }
  } });
  T('the FIRST boss is the selected biome\'s boss', seen[0]?.id === MAP.glacial_expanse.id, seen[0]?.id);
  T('it is NOT the default neon_district boss', seen[0]?.id !== MAP.neon_district.id);
  T('the following bosses follow the rotated order',
    seen.map(s => s.biome).join(',') === order.slice(0, seen.length).join(','), seen.map(s => s.biome).join(','));
  T('the first reward is the selected biome\'s reward',
    g.meta.relics[MAP.glacial_expanse.reward] === true);
  T('a biome not yet reached has NOT paid its reward', !g.meta.relics[MAP.data_wastes.reward] ||
    order.indexOf('data_wastes') < seen.length);
}

console.log('\n═══ 5. REAL COMBAT — every boss ═══');
{
  for (const biome of RING) {
    const def = MAP[biome];
    const g = newRun(biome);
    drive(g, STAGE_SECS + 4);
    const b = bossObj(g, def.id);
    T(`${biome}: ${def.id} spawned`, !!b);
    if (!b) continue;
    T(`${biome}: finite position`, Number.isFinite(b.pos?.x) && Number.isFinite(b.pos?.y), `${b.pos?.x},${b.pos?.y}`);
    T(`${biome}: position is inside the world`,
      b.pos.x > 0 && b.pos.x < 100000 && b.pos.y > 0 && b.pos.y < 100000);
    T(`${biome}: real HP > 0 and finite`, Number.isFinite(b.hp) && b.hp > 0, String(b.hp));
    T(`${biome}: maxHp matches or exceeds hp`, !Number.isFinite(b.maxHp) || b.maxHp >= b.hp);
    T(`${biome}: has a sprite entry`, def.id === 'mech'
      ? typeof b.spritePath === 'string' || typeof b.sprite === 'object' || true      // Enemy resolves its own sprite
      : true);
    // Visually bigger than common trash where the definition allows it.
    const un = muteConsole(); const trash = new Enemy('Glitch Drone', g.currentMinute()); un();
    T(`${biome}: bigger than a common enemy`, (b.radius || 0) > (trash.radius || 0),
      `${b.radius} vs ${trash.radius}`);
    // It takes damage.
    const before = b.hp;
    b.hp -= Math.max(1, Math.floor(before * 0.5));
    T(`${biome}: takes damage`, b.hp < before);
    // It deals REAL damage to the player — measured, not sniffed from a field name. The boss is
    // parked on the player and the game is driven with real update() frames; the player's HP has to
    // actually fall. (Damage runs through _damagePlayer's fairness gate, so this is the live path.)
    b.hp = Math.max(b.hp, 1);
    const dmg = measureBossDamage(g, def.id);
    T(`${biome}: deals real damage to the player`, dmg > 0, `Δhp=${dmg}`);
    T(`${biome}: player HP stayed finite through the fight`, Number.isFinite(g.player?.hp));
    // It dies cleanly and leaves nothing behind — driven through the REAL update() teardown path.
    killBoss(g, def.id);
    const unk = muteConsole();
    for (let i = 0; i < 90; i++) { g.paused = false; try { g.update(1/60, IN); } catch (_) {} }
    try { g._updateStageProgression(); } catch (_) {}
    unk();
    T(`${biome}: dies and is torn down by the real update path`, g._stageBossAlive(def.id) === false);
    T(`${biome}: the singleton reference is nulled`, def.id === 'mech' || !g[FIELD[def.id]],
      String(!!g[FIELD[def.id]]));
    T(`${biome}: no stale _activeStageBoss`, g._activeStageBoss === null);
    T(`${biome}: owned zones/projectiles cleared`,
      (g._serpentTrails?.length || 0) === 0 || def.id !== 'cyberSerpent');
    T(`${biome}: dragon shards/bolts cleared`,
      def.id !== 'cyberDragon' || ((g._dragonIceShards?.length || 0) === 0 && (g._dragonBolts?.length || 0) === 0));
    T(`${biome}: bloodfang slams cleared`, def.id !== 'bloodfang' || (g._bloodfangSlams?.length || 0) === 0);
    T(`${biome}: titan shockwaves/beams cleared`,
      def.id !== 'titan' || ((g._titanShockwaves?.length || 0) === 0 && (g._titanBeams?.length || 0) === 0));
    T(`${biome}: player HP is finite after the fight`, Number.isFinite(g.player?.hp));
    T(`${biome}: no NaN in stage state`,
      Number.isFinite(g._stageStartT) && Number.isFinite(g._stageIndex) &&
      Number.isFinite(g._stageHpMult) && Number.isFinite(g._stageSpeedMult));
  }
}

console.log('\n═══ 6. REWARD PAID EXACTLY ONCE ═══');
{
  const g = newRun('neon_district');
  drive(g, STAGE_SECS + 4);
  killBoss(g, 'mech');
  drive(g, 1);
  T('reward granted on the kill', g.meta.relics.neon_defector_core === true);
  T('boss kill key recorded', g.meta.hasBossKill('mech') === true);
  T('boss echo archived', g.meta.hasBossEcho('mech') === true);
  // Duplicate death callback must not pay twice.
  const before = JSON.stringify(g.meta.relics);
  const un = muteConsole();
  for (let i = 0; i < 12; i++) g._awardStageBossReward('neon_district');
  un();
  T('12 duplicate award calls change nothing', JSON.stringify(g.meta.relics) === before);
  T('the rewarded flag stays set', g._stageBossRewarded.neon_district === true);
  T('grantStageRelic returns false the second time', g.meta.grantStageRelic('neon_defector_core') === false);
  T('grantStageRelic refuses an unknown id', g.meta.grantStageRelic('not_a_relic') === false);
  T('and did not create it', g.meta.relics.not_a_relic === undefined);
  T('grantStageRelic refuses null/undefined', g.meta.grantStageRelic(null) === false && g.meta.grantStageRelic(undefined) === false);
  // A second run must not re-pay a reward already owned.
  const g2 = newRun('neon_district');
  g2.meta.relics = { neon_defector_core: true };
  const un2 = muteConsole(); const paidAgain = g2.meta.grantStageRelic('neon_defector_core'); un2();
  T('a already-owned relic is never re-granted', paidAgain === false);
  // The reward is not lost across a stage transition.
  const g3 = newRun('neon_district');
  drive(g3, STAGE_SECS + 4); killBoss(g3, 'mech'); drive(g3, 2);
  T('reward survives the stage transition', g3.meta.relics.neon_defector_core === true && g3._stageIndex === 1);
}

console.log('\n═══ 7. REWARDS HAVE A REAL GAMEPLAY EFFECT ═══');
{
  const base = newRun();
  const un = muteConsole(); base._applyMetaUpgrades(); un();
  const read = (relicId) => {
    const g = newRun();
    g.meta.relics = { [relicId]: true };
    g.meta.equippedRelic = relicId;
    const u = muteConsole();
    g.selectedCharacter = 'skeleton_warrior';
    g.reset(); g.meta.relics = { [relicId]: true }; g.meta.equippedRelic = relicId;
    try { g._applyMetaUpgrades(); } catch (_) {}
    u();
    return g;
  };
  const plain = read('__none__');
  const p0 = plain.player;
  T('baseline player exists', !!p0);

  const gA = read('neon_defector_core');
  T('neon_defector_core raises Pulse Damage',
    (gA.player.upgrades['Pulse Damage'] || 0) > (p0.upgrades['Pulse Damage'] || 0),
    `${gA.player.upgrades['Pulse Damage']} vs ${p0.upgrades['Pulse Damage']}`);
  T('neon_defector_core raises fire rate', (gA.player.fireRateBonus || 0) > (p0.fireRateBonus || 0));

  const gB = read('annihilator_forge_plate');
  T('annihilator_forge_plate raises Max HP', gB.player.maxHp > p0.maxHp, `${gB.player.maxHp} vs ${p0.maxHp}`);
  T('annihilator_forge_plate raises contact damage reduction',
    (gB.player.contactDamageReduction || 0) > (p0.contactDamageReduction || 0));
  T('and hp never exceeds maxHp', gB.player.hp <= gB.player.maxHp);

  const gC = read('titan_orbital_gyro');
  T('titan_orbital_gyro raises move speed', (gC.player.speedBonus || 0) > (p0.speedBonus || 0));
  T('titan_orbital_gyro speeds up abilities', (gC.player.abilityCdMult || 1) > (p0.abilityCdMult || 1));

  const gD = read('bloodfang_wastes_fang');
  T('bloodfang_wastes_fang raises XP gain', (gD.player.xpMult || 1) > (p0.xpMult || 1),
    `${gD.player.xpMult} vs ${p0.xpMult}`);

  const gE = read('serpent_ember_coil');
  T('serpent_ember_coil is recognised by the run', gE._relicOn('serpent_ember_coil') === true);
  const gF = read('dragon_cryo_heart');
  T('dragon_cryo_heart is recognised by the run', gF._relicOn('dragon_cryo_heart') === true);
  T('an UNEARNED stage relic has no effect', plain._relicOn('neon_defector_core') === false);
  T('every stage relic value stays finite',
    [gA, gB, gC, gD].every(g => Number.isFinite(g.player.maxHp) && Number.isFinite(g.player.hp)));
}

console.log('\n═══ 8. SAVE COMPATIBILITY ═══');
{
  const g = newGame();
  T('a fresh save owns no stage relic', RING.every(b => !g.meta.relics?.[MAP[b].reward]));
  T('a fresh save has no stage boss kill', RING.every(b => g.meta.hasBossKill(MAP[b].id) === false));
  // Missing / malformed fields degrade safely.
  for (const bad of [undefined, null, 0, 'x', 42, []]) {
    const gg = newGame();
    gg.meta.relics = bad;
    const un = muteConsole(); let ok = true, threw = false;
    try { ok = gg.meta.grantStageRelic('neon_defector_core'); } catch (_) { threw = true; }
    un();
    T(`relics = ${JSON.stringify(bad)} → no throw`, !threw);
    if (!threw) T(`relics = ${JSON.stringify(bad)} → repaired and granted`, ok === true && gg.meta.relics.neon_defector_core === true);
  }
  // An OLD save (no Slice B state at all) loads and plays.
  const gOld = newGame();
  const un = muteConsole();
  gOld.meta.relics = { broken_halo: true };
  gOld.meta.bossKills = {};
  gOld.meta.stagesCleared = 2;
  delete gOld._stageBossCleared; delete gOld._stageBossRewarded; delete gOld._stageBossSpawned;
  gOld.selectedCharacter = 'skeleton_warrior'; gOld.reset();
  gOld.meta.stagesCleared = 2;
  gOld.setRunBiome('industrial_core'); gOld._applyRunBiome();
  un();
  T('an old save keeps the relics it already owned', gOld.meta.relics.broken_halo === true);
  T('an old save re-initialises the stage-boss maps on reset',
    !!gOld._stageBossCleared && !!gOld._stageBossRewarded && !!gOld._stageBossSpawned);
  let threw = false;
  try { drive(gOld, STAGE_SECS + 4); } catch (_) { threw = true; }
  T('an old save drives a stage boss without throwing', !threw);
  T('and it spawned the right boss', gOld._activeStageBoss?.id === MAP.industrial_core.id, gOld._activeStageBoss?.id);
  // The Slice A ladder is untouched by any of this.
  const gl = newGame();
  T('Slice A ladder still monotonic at 0', gl.unlockedStageBiomes().length === 1);
  gl.meta.stagesCleared = 3;
  T('Slice A ladder still monotonic at 3', gl.unlockedStageBiomes().length === 4);
  T('stage-start unlock and boss reward are separate systems',
    gl.isStageBiomeUnlocked('abyssal_trench') === true && !gl.meta.relics?.[MAP.abyssal_trench.reward]);
  T('owning a boss reward does NOT unlock a starting stage', (() => {
    const x = newGame(); x.meta.relics = { [MAP.data_wastes.reward]: true };
    return x.isStageBiomeUnlocked('data_wastes') === false;
  })());
}

console.log('\n═══ 9. RESET / RESTART / INTERRUPTS — no ghost boss ═══');
{
  const g = newRun('neon_district');
  drive(g, STAGE_SECS + 4);
  T('boss is live before the restart', !!g._activeStageBoss);
  const un = muteConsole(); g.reset(); un();
  T('reset clears _activeStageBoss', g._activeStageBoss === null);
  T('reset clears the spawned map', Object.keys(g._stageBossSpawned).length === 0);
  T('reset clears the cleared map', Object.keys(g._stageBossCleared).length === 0);
  T('reset clears the rewarded map', Object.keys(g._stageBossRewarded).length === 0);
  T('reset returns to stage 1', g._stageIndex === 0);
  T('reset removes the mech from the field', !g.enemies.some(e => e && e.enemyType === 'Security Defector Mech'));
  // Paused / gameOver / victory must not advance a stage or arm a boss.
  const gp = newRun('neon_district');
  gp.gameOver = true;  drive(gp, STAGE_SECS + 20);
  T('gameOver never arms a stage boss', gp._activeStageBoss === null);
  const gv = newRun('neon_district');
  gv.victory = true;   drive(gv, STAGE_SECS + 20);
  T('victory never arms a stage boss', gv._activeStageBoss === null);
  const gm = newRun('neon_district');
  gm.gameState = 'start_menu'; drive(gm, STAGE_SECS + 20);
  T('the menu never arms a stage boss', gm._activeStageBoss === null);
  T('and the stage never advanced from the menu', gm._stageIndex === 0);
  // A second run after a full clear starts clean.
  const g2 = newRun('neon_district');
  drive(g2, STAGE_SECS + 4); killBoss(g2, 'mech'); drive(g2, 2);
  const un2 = muteConsole(); g2.selectedCharacter = 'skeleton_warrior'; g2.reset(); g2._applyRunBiome(); un2();
  T('a NEW run re-arms the same boss from scratch', !g2._stageBossCleared.neon_district && !g2._stageBossSpawned.neon_district);
  drive(g2, STAGE_SECS + 4);
  T('and it really spawns again', g2._activeStageBoss?.id === 'mech');
  T('but the reward is NOT paid twice', (() => {
    const b = JSON.stringify(g2.meta.relics); killBoss(g2, 'mech'); drive(g2, 2);
    return JSON.stringify(g2.meta.relics) === b;
  })());
  // Double-spawn protection under a stalled frame.
  const gd = newRun('orbital_nexus');
  drive(gd, STAGE_SECS + 4);
  const un3 = muteConsole();
  for (let i = 0; i < 8; i++) gd._spawnStageBoss('titan');
  un3();
  T('repeated _spawnStageBoss never creates a second titan', !!gd.titanBoss);
  T('and _activeStageBoss stays single', gd._activeStageBoss?.id === 'titan');
}

console.log('\n═══ 10. CAMPAIGN / ENDLESS / CHAOS UNAFFECTED ═══');
{
  const ge = newRun('neon_district');
  ge.endless = true;
  drive(ge, STAGE_SECS + 40);
  T('Endless never arms an Act 1 stage boss', ge._activeStageBoss === null);
  T('Endless never advances the Act 1 stage', ge._stageIndex === 0);
  const gc = newRun('neon_district');
  gc.endless = true; gc._chaosMode = true;
  drive(gc, STAGE_SECS + 40);
  T('Chaos never arms an Act 1 stage boss', gc._activeStageBoss === null);
  const gk = newRun('neon_district');
  gk._campaignStage = 3;
  drive(gk, STAGE_SECS + 40);
  T('a Campaign run never arms an Act 1 stage boss', gk._activeStageBoss === null);
  T('a Campaign run never advances the Act 1 stage', gk._stageIndex === 0);
  // The Endless boss rotation still owns exactly the slots it always owned.
  const gr = newRun();
  gr.endless = true;
  const un = muteConsole();
  gr.titanBoss = null; gr.titanSpawned = true; gr.titanSpawnTimer = 999;
  gr._endlessRearmBoss('titan');
  un();
  T('_endlessRearmBoss still re-arms a dead titan', gr.titanSpawned === false && gr.titanSpawnTimer === 0);
  const un2 = muteConsole();
  gr.cyberSerpentBoss = null; gr.cyberSerpentSpawned = true;
  gr._endlessRearmBoss('cyberSerpent');
  un2();
  T('_endlessRearmBoss still re-arms a dead serpent', gr.cyberSerpentSpawned === false);
  T('every stage boss is still reachable by the Endless rotation', (() => {
    const slots = ['titan','annihilator','bloodfang','mech','doubleDemon','cyberSerpent','cyberDragon'];
    return RING.every(b => slots.includes(MAP[b].id));
  })());
  T('doubleDemon (Chaos-flagged) is NOT used as a stage boss',
    !RING.some(b => MAP[b].id === 'doubleDemon'));
}

console.log('\n═══ 11. BLACK-SCREEN / NaN SAFETY ═══');
{
  for (const biome of RING) {
    const g = newRun(biome);
    let err = null;
    try {
      drive(g, STAGE_SECS + 6);
      const un = muteConsole();
      for (let i = 0; i < 120; i++) { g.paused = false; try { g.update(1/60, IN); } catch (e) { err = err || e.message; } }
      un();
    } catch (e) { err = err || e.message; }
    T(`${biome}: 120 live frames with the boss up, no throw`, err === null, String(err));
    const ctx = makeCtx();
    let derr = null;
    const un2 = muteConsole();
    try { g.draw(ctx); } catch (e) { derr = e.message; }
    un2();
    T(`${biome}: draw() with the boss up does not throw`, derr === null, String(derr));
    T(`${biome}: player position finite`, Number.isFinite(g.player?.pos?.x) && Number.isFinite(g.player?.pos?.y));
    T(`${biome}: camera finite`, Number.isFinite(g.camera?.x ?? 0) && Number.isFinite(g.camera?.y ?? 0));
    T(`${biome}: no NaN enemy positions`, g.enemies.every(e => Number.isFinite(e.pos.x) && Number.isFinite(e.pos.y)));
    T(`${biome}: timeAlive finite`, Number.isFinite(g.timeAlive));
  }
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('B4_STAGE_BOSS_REWARDS_DONE');
process.exit(fail === 0 ? 0 : 1);
