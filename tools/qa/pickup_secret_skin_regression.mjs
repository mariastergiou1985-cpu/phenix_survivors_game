// ════════════════════════════════════════════════════════════════════════════════
// PICKUP RESPAWN + SECRET SKIN PERSISTENCE — deterministic, no browser, no network.
//
// PART A — mana / armor orbs. Both spawners gate on `length === 0`. Health orbs have always
// expired, mana and armor never did, so ONE orb the player walked away from held the gate shut for
// the rest of the run. The test drives the SHIPPED update loop with the player parked far away, so
// the orb is never collected and never magneted, and asks three things: does it expire, does a new
// one arrive afterwards, and does a collectable orb still work normally.
//
// PART B — secret skins. _load() used to delete three retired unlock keys on EVERY launch while
// hasLockedSecretSkin() still counted them as "locked", so the Null Cache kept spawning, granted
// one of them, announced it, and lost it again on the next launch. The test unlocks a real skin and
// reloads three times, then exhausts the grantable pool and checks that the cache stops offering.
//
// Run: node tools/qa/pickup_secret_skin_regression.mjs   (exit 1 on failure)
// ════════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
let vclock = 0;
globalThis.performance = { now: () => vclock };
const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { MetaProgress, CHARACTER_OUTFITS, RETIRED_SECRET_SKINS } =
  await import(pathToFileURL(path.join(ROOT, 'js/game/MetaProgress.js')).href);
u0();

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

// ── harness ───────────────────────────────────────────────────────────────────
function newRun() {
  vclock = 0;
  const un = muteConsole();
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  g._enterEndless();
  un();
  return g;
}
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
// Real Vec2 — the shipped collect path calls pos.clone() for the pickup particles, so a plain
// {x,y} literal would throw inside production code and make the test about the harness.
const V = (g, x, y) => new (g.player.pos.constructor)(x, y);
function step(g, frames) {
  const un = muteConsole();
  for (let i = 0; i < frames; i++) {
    if (g.player) { g.player.maxHp = 1e9; g.player.hp = 1e9; }
    vclock += 1000 / 60;
    if (g.upgradeUI)  { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    input.mousePos = { x: g.player.pos.x + 300, y: g.player.pos.y };
    try { g.update(1 / 60, input); } catch (e) { un(); throw e; }
  }
  un();
}
const FR = n => Math.round(n * 60);

console.log('\n═══ PICKUP RESPAWN + SECRET SKIN REGRESSION ═══');

// ── PART A1: MANA ─────────────────────────────────────────────────────────────
console.log('\n── A1. mana orb ──');
{
  const g = newRun();
  step(g, FR(1));
  // Park an orb far enough away that neither the magnet (>=90px, scales with pickupRadius) nor the
  // collect radius can ever touch it, and keep the player pinned there for the whole test. This is
  // the "player walked away and forgot about it" case, which is what used to be permanent.
  const far = { x: g.player.pos.x + 4000, y: g.player.pos.y };
  g.manaPickups.length = 0;
  g.manaPickups.push({ pos: V(g, far.x, far.y), timer: undefined });   // legacy orb: no timer field
  g.player.mana = 0;                                                       // spawner is eligible
  const t0 = g.manaPickups.length;
  const px = g.player.pos.x, py = g.player.pos.y;
  let sawEmpty = false, respawned = 0, maxAlive = 0;
  for (let s = 0; s < 90; s++) {                       // 90 s of game time, 1 s at a time
    step(g, 60);
    g.player.pos.x = px; g.player.pos.y = py;          // the player never approaches it
    g.player.mana = 0;
    maxAlive = Math.max(maxAlive, g.manaPickups.length);
    if (g.manaPickups.length === 0) sawEmpty = true;
    else if (sawEmpty) respawned = Math.max(respawned, 1);
  }
  T('A1 the abandoned mana orb starts with a lifetime the loop can see',
    t0 === 1 && typeof g.manaPickups[0]?.timer !== 'undefined' || sawEmpty,
    `t0=${t0}`);
  T('A1 the abandoned mana orb DESPAWNS (the respawn gate reopens)', sawEmpty);
  T('A1 a NEW mana orb spawns after it expired', respawned === 1, `respawned=${respawned}`);
  T('A1 never more than one mana orb on the ground (no spam)', maxAlive <= 1, `max=${maxAlive}`);
}

// ── PART A2: ARMOR ────────────────────────────────────────────────────────────
console.log('\n── A2. armor orb ──');
{
  const g = newRun();
  step(g, FR(1));
  const px = g.player.pos.x, py = g.player.pos.y;
  g.armorPickups.length = 0;
  g.armorPickups.push({ pos: V(g, px + 4000, py) });
  g.player._armorT = 0;
  let sawEmpty = false, respawned = 0, maxAlive = 0;
  for (let s = 0; s < 110; s++) {
    step(g, 60);
    g.player.pos.x = px; g.player.pos.y = py;
    g.player._armorT = 0;
    maxAlive = Math.max(maxAlive, g.armorPickups.length);
    if (g.armorPickups.length === 0) sawEmpty = true;
    else if (sawEmpty) respawned = Math.max(respawned, 1);
  }
  T('A2 the abandoned armor orb DESPAWNS', sawEmpty);
  T('A2 a NEW armor orb spawns after it expired', respawned === 1, `respawned=${respawned}`);
  T('A2 never more than one armor orb on the ground', maxAlive <= 1, `max=${maxAlive}`);
}

// ── PART A3: collecting still works, and the value did not change ─────────────
console.log('\n── A3. collection is unchanged ──');
{
  const g = newRun();
  step(g, FR(1));
  g.manaPickups.length = 0; g.armorPickups.length = 0;
  g.player.mana = 0; g.player.maxMana = 100; g.player._armorT = 0;
  g.manaPickups.push({ pos: V(g, g.player.pos.x + 4, g.player.pos.y), timer: 45 });
  step(g, 6);
  T('A3 a mana orb under the player is still collected', g.manaPickups.length === 0);
  T('A3 and still restores 25 mana (value unchanged)', g.player.mana === 25, `mana=${g.player.mana}`);
  g.armorPickups.push({ pos: V(g, g.player.pos.x + 4, g.player.pos.y), timer: 45 });
  step(g, 6);
  T('A3 an armor orb under the player is still collected', g.armorPickups.length === 0);
  T('A3 and still grants 12 s of armor (value unchanged)', Math.round(g.player._armorT) === 12,
    `armorT=${g.player._armorT}`);
}

// ── PART B: SECRET SKINS ──────────────────────────────────────────────────────
console.log('\n── B. secret skins / Null Cache ──');
const GRANTABLE = Object.values(CHARACTER_OUTFITS)
  .map(o => o?.secret).filter(s => s?.unlockKey && !RETIRED_SECRET_SKINS.has(s.unlockKey))
  .map(s => s.unlockKey);
console.log(`     grantable keys: ${GRANTABLE.join(', ')}`);
console.log(`     retired keys:   ${[...RETIRED_SECRET_SKINS].join(', ')}`);

const fresh = () => { const un = muteConsole(); try { globalThis.localStorage.clear(); } finally { un(); } };
const load  = () => { const un = muteConsole(); try { return new MetaProgress(); } finally { un(); } };

{
  fresh();
  const m0 = load();
  const name = m0.unlockRandomSecretSkin();
  const key  = GRANTABLE.find(k => m0.isUnlocked(k));
  T('B1 the Null Cache grants a GRANTABLE skin', !!name && !!key, `name=${name} key=${key}`);
  T('B1 and never a retired one', [...RETIRED_SECRET_SKINS].every(k => !m0.isUnlocked(k)));
  const a = load(), b = load(), c = load();
  T('B2 the unlock survives reload x3 (persistence)',
    !!key && a.isUnlocked(key) && b.isUnlocked(key) && c.isUnlocked(key),
    `key=${key} -> ${a.isUnlocked(key)}/${b.isUnlocked(key)}/${c.isUnlocked(key)}`);
  T('B2 and _load() deletes nothing on those reloads',
    GRANTABLE.filter(k => c.isUnlocked(k)).length === GRANTABLE.filter(k => m0.isUnlocked(k)).length);
}

{
  // Exhaust the grantable pool: the cache must stop claiming there is something to find, and the
  // reward call must return null instead of handing over a retired key.
  fresh();
  const m = load();
  const names = [];
  for (let i = 0; i < GRANTABLE.length + 3; i++) {
    const n = m.unlockRandomSecretSkin();
    if (n) names.push(n);
  }
  T('B3 exactly the grantable skins are ever granted, no duplicates',
    names.length === GRANTABLE.length && new Set(names).size === names.length,
    `${names.length} granted: ${names.join(' | ')}`);
  T('B3 hasLockedSecretSkin() is FALSE once they are all owned — the cache stops spawning',
    m.hasLockedSecretSkin() === false);
  T('B3 a further decrypt returns null instead of a retired key', m.unlockRandomSecretSkin() === null);
  T('B3 no retired key was ever unlocked', [...RETIRED_SECRET_SKINS].every(k => !m.isUnlocked(k)));
  const r = load();
  T('B3 all of it survives a reload', GRANTABLE.every(k => r.isUnlocked(k)) && r.hasLockedSecretSkin() === false);
}

{
  // A legacy save that already carries a retired key: swept ONCE, then left alone forever, and a
  // legitimately unlocked skin sitting next to it is never touched.
  fresh();
  const un = muteConsole();
  try {
    globalThis.localStorage.setItem('phenix_meta', JSON.stringify({
      unlocks: { crimson_oni: true, [GRANTABLE[0]]: true }, credits: 500, stagesCleared: 3,
    }));
  } finally { un(); }
  const m1 = load();
  T('B4 the retired key is cleared out of a legacy save', m1.isUnlocked('crimson_oni') === false);
  T('B4 the legitimate skin next to it is untouched', m1.isUnlocked(GRANTABLE[0]) === true);
  const raw1 = globalThis.localStorage.getItem('phenix_meta');
  const m2 = load();
  const raw2 = globalThis.localStorage.getItem('phenix_meta');
  const m3 = load();
  T('B4 the sweep is recorded so it never runs again', (m2.secretSkinLockVersion || 0) >= 1);
  T('B4 the save is byte-identical across the next two loads', raw2 === raw1);
  T('B4 and the legitimate skin is still there', m3.isUnlocked(GRANTABLE[0]) === true);
}

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══\n`);
process.exit(fail ? 1 : 0);
