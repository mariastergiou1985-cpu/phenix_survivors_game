// PHASE 6B-1 — ROSTER BASELINE & STARTER CERTIFICATION
// ------------------------------------------------------------------------------------------------
// Reads the REAL runtime: constructs the production Game once per character, starts a run and
// reports what the engine actually holds, not what a table says it should. Answers §13 (baseline)
// and the mechanical half of §14 (does the starter exist, is it a base weapon, does it fire).
//
//   node tools/qa/phase6b_roster_baseline.mjs            # all characters
//   node tools/qa/phase6b_roster_baseline.mjs <id> ...   # a subset
//
// Production is read-only here. Nothing is tuned.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mulberry32 = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0;
globalThis.performance = { now: () => vclock };
const RealDate = globalThis.Date;
globalThis.Date = class extends RealDate { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };

const un0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
un0();

const ROSTER = ['skeleton_warrior', 'taekwondo_girl', 'cyber_arm_hero', 'brawler_warrior',
                'assassin_clone', 'japan_phasewalker', 'euclid_vector', 'oni_cataclysm_protocol',
                'eddie', 'dimis_kickboxer'];
const WANTED = process.argv.slice(2).length ? process.argv.slice(2) : ROSTER;

const num = v => (typeof v === 'number' && Number.isFinite(v)) ? +v.toFixed(2) : v ?? null;

function baseline(id, seconds = 45) {
  Math.random = mulberry32(4242); vclock = 0;
  try { globalThis.localStorage.clear(); } catch (_) {}
  const un = muteConsole();
  const errors = [];
  const g = new Game();
  g.audio = null;
  g.selectedCharacter = id;
  g.gameState = 'playing';
  g.reset(); g._enterEndless();
  const p = g.player;

  // ── declared identity, straight off the live objects ────────────────────────────────────────
  const stats = {
    id,
    selectedCharacter: g.selectedCharacter,
    maxHp: num(p.maxHp), hp: num(p.hp),
    armor: num(p.armor ?? p.defense ?? null),
    baseSpeed: num(p.baseSpeed), speed: num(p.speed),
    maxMana: num(p.maxMana ?? null), mana: num(p.mana ?? null),
    regen: num(p.hpRegen ?? p.regen ?? null),
    damageMult: num(p.damageMult ?? p.dmgMult ?? null),
    attackSpeedMult: num(p.attackSpeedMult ?? p.atkSpeedMult ?? null),
    cooldownMult: num(p.cooldownMult ?? p.cdMult ?? null),
    pickupRadius: num(p.pickupRadius ?? p.magnetRadius ?? null),
    luck: num(p.luck ?? null),
    xpMult: num(p.xpMult ?? null),
    dashCooldownBase: num(p.dashCooldown), dashDuration: num(p.dashDuration), dashSpeed: num(p.dashSpeed),
    dashDistancePx: num((p.dashSpeed || 0) * (p.dashDuration || 0)),
    level: p.level,
  };

  // ── starter loadout, from the ACTIVE build layer ─────────────────────────────────────────────
  const be = g.buildEngine;
  const beWeapons = be?.weapons ? [...be.weapons].map(([k, v]) => ({ id: k, level: v.level ?? null, evolved: !!v.evolved })) : [];
  const bePassives = be?.passives ? [...be.passives].map(([k, v]) => ({ id: k, level: v })) : [];
  const catalog = g._weaponLevels ? [...g._weaponLevels].map(([k, v]) => ({ id: k, level: v })) : [];
  const evolvedAtStart = beWeapons.filter(w => w.evolved).map(w => w.id);

  // ── run it and watch the starter actually work ───────────────────────────────────────────────
  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  let dealt = 0, kills = 0, projPeak = 0, vfxPeak = 0, enemyPeak = 0;
  let firstDamageAt = null, framesWithProjectiles = 0;
  const oTakeHit = g._lastWeaponId;
  void oTakeHit;
  const startKills = g.kills || 0;
  const dt = 1 / 60;
  for (let f = 0; f < seconds * 60; f++) {
    vclock += 1000 / 60;
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    const hpBefore = (g.enemies || []).reduce((a, e) => a + (e && e.hp > 0 ? e.hp : 0), 0);
    try { g.update(dt, input); } catch (e) { errors.push(String(e && e.message).slice(0, 120)); break; }
    const hpAfter = (g.enemies || []).reduce((a, e) => a + (e && e.hp > 0 ? e.hp : 0), 0);
    const np = (g.projectiles || []).length;
    if (np > 0) framesWithProjectiles++;
    projPeak = Math.max(projPeak, np);
    vfxPeak = Math.max(vfxPeak, (g.particles?.list || g.particles || []).length || 0);
    enemyPeak = Math.max(enemyPeak, (g.enemies || []).length);
    const spent = hpBefore - hpAfter;
    if (spent > 0) { dealt += spent; if (firstDamageAt == null) firstDamageAt = +g.timeAlive.toFixed(2); }
    g.player.hp = g.player.maxHp;           // isolate the STARTER question from survivability
    g.gameOver = false;
  }
  kills = (g.kills || 0) - startKills;
  un();

  return {
    ...stats,
    starter: { buildEngine: beWeapons, buildEnginePassives: bePassives, legacyCatalog: catalog,
               evolvedAtStart, weaponCount: beWeapons.length + catalog.length },
    runtime: {
      seconds, secondsSimulated: +g.timeAlive.toFixed(1),
      damageDealt: Math.round(dealt), kills, dps: +(dealt / Math.max(1, g.timeAlive)).toFixed(1),
      killsPerMin: +(kills / Math.max(1, g.timeAlive / 60)).toFixed(1),
      firstDamageAt, projectilePeak: projPeak, framesWithProjectiles,
      vfxPeak, enemyPeak, levelReached: g.player.level,
      errors,
    },
  };
}

const out = [];
for (const id of WANTED) {
  let r;
  try { r = baseline(id); } catch (e) { r = { id, fatal: String(e && e.message).slice(0, 200) }; }
  out.push(r);
  const rt = r.runtime || {};
  console.error(`  ${id.padEnd(24)} hp ${String(r.maxHp).padStart(4)}  spd ${String(r.baseSpeed).padStart(4)}  ` +
    `weapons ${String(r.starter?.weaponCount ?? '?').padStart(2)}  dmg ${String(rt.damageDealt ?? '-').padStart(6)}  ` +
    `kills ${String(rt.kills ?? '-').padStart(4)}  err ${(rt.errors || []).length}${r.fatal ? '  FATAL ' + r.fatal : ''}`);
}
console.log(JSON.stringify(out, null, 1));
