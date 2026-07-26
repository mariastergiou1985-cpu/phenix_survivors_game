// PHASE 6B-1b — ROSTER DPS, RE-MEASURED PER HIT WITH CALL-SITE ATTRIBUTION
// ------------------------------------------------------------------------------------------------
// Replaces the DPS column of phase6b_roster_baseline, which was withdrawn: it measured damage as
// the per-frame drop in summed enemy HP, and enemy SPAWNS push that sum the other way, so the
// number was contaminated by the spawn schedule rather than by the weapon.
//
// This counts the actual HP each enemy loses on each Enemy.takeHit, and attributes it by CALL SITE:
// the stack is walked for the first Game.js frame, and the line is mapped to its enclosing method
// using the same technique that got Phase 6A to zero unattributed damage. Game._lastWeaponId is
// useless here - it is never assigned anywhere in the codebase.
//
//   node tools/qa/phase6b_roster_dps_v2.mjs [seconds] <id> [<id> ...]
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let vclock = 0; globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
const u0 = muteConsole();
const { Game }  = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
u0();

// line -> enclosing method, built once from the real source
const GAME_SRC = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const lineOwner = (() => {
  const lines = GAME_SRC.split('\n'); const own = new Array(lines.length + 1); let cur = '?';
  for (let i = 0; i < lines.length; i++) { const m = lines[i].match(/^  ([A-Za-z_][\w]*)\s*\(/); if (m) cur = m[1]; own[i + 1] = cur; }
  return own;
})();
const siteOwner = () => {
  const st = (new Error().stack || '').split('\n');
  for (let i = 2; i < st.length; i++) {
    const m = st[i].match(/Game\.js[^:]*:(\d+):/);
    if (m) return lineOwner[Number(m[1])] || '?';
    if (/BuildEngine[^/]*\.js/.test(st[i])) return 'buildEngine';
    if (/NpcWalker\.js/.test(st[i])) return 'npcWalker';
  }
  return 'unknown';
};
// method -> role bucket. Anything unmatched stays visible under its own method name.
const BUCKET = [
  [/^_updatePlayerWeapon|^_updateWeaponProjectiles|^_updateProjectiles|^_fireWeapon|^_spawnWeapon|Weapon(?!Accent)/i, 'starter/weapons'],
  [/^_updatePet|petBolt|^_updatePets/i, 'pets'],
  [/tactical|^_updateTactical/i, 'tacticals'],
  [/ultimate|^_ult|Ultimate/i, 'ultimate'],
  [/^buildEngine$/, 'buildEngine'],
  [/^_updateSpecial|specialBeam|^_updateDimiDrones/i, 'character-special'],
  [/^_updateSynergy|synergy/i, 'synergy'],
  [/^_updateEmp|^_updatePulseShield|shockwave/i, 'utility Q/E'],
];
const bucketOf = m => { for (const [re, b] of BUCKET) if (re.test(m)) return b; return m; };

const args = process.argv.slice(2);
const SECONDS = Number(args[0]) > 0 ? Number(args.shift()) : 45;
const IDS = args.length ? args : ['skeleton_warrior'];

const ETH = Enemy.prototype.takeHit;
let SINK = null;
Enemy.prototype.takeHit = function (dmg, game) {
  const before = this.hp;
  const owner = SINK ? siteOwner() : null;
  const r = ETH.call(this, dmg, game);
  const lost = Math.max(0, before - this.hp);
  if (lost > 0 && SINK) SINK(owner, lost, before, this);
  return r;
};

function run(id) {
  Math.random = mul(12345); vclock = 0;
  try { globalThis.localStorage.clear(); } catch (_) {}
  const un = muteConsole();
  const g = new Game();
  g.audio = null; g.selectedCharacter = id; g.gameState = 'playing';
  g.reset(); g._enterEndless();
  const p = g.player;

  const by = {}; let total = 0, kills = 0;
  SINK = (owner, lost, before, e) => {
    const b = bucketOf(owner || 'unknown');
    by[b] = (by[b] || 0) + lost; total += lost;
    if (before > 0 && e.hp <= 0) kills++;
  };

  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  let peakEnemies = 0;
  for (let f = 0; f < SECONDS * 60; f++) {
    vclock += 1000 / 60;
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    try { g.update(1 / 60, input); } catch (_) { break; }
    peakEnemies = Math.max(peakEnemies, g.enemies.length);
    p.hp = p.maxHp; g.gameOver = false;
  }
  SINK = null; un();

  const rows = Object.entries(by).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, Math.round(v), +(100 * v / (total || 1)).toFixed(1)]);
  const weapons = rows.filter(r => r[0] === 'starter/weapons').reduce((a, r) => a + r[1], 0);
  return { id, seconds: SECONDS, totalDamage: Math.round(total), dps: +(total / SECONDS).toFixed(1),
           kills, killsPerMin: Math.round(kills / (SECONDS / 60)), level: g.player.level,
           weaponShareOfDamagePct: +(100 * weapons / (total || 1)).toFixed(1),
           peakEnemies, bySource: rows.slice(0, 8) };
}

const out = [];
for (const id of IDS) {
  const r = run(id); out.push(r);
  console.error(`  ${r.id.padEnd(24)} dps ${String(r.dps).padStart(7)}  total ${String(r.totalDamage).padStart(7)}  ` +
    `kills/min ${String(r.killsPerMin).padStart(4)}  lvl ${String(r.level).padStart(2)}  weapons ${String(r.weaponShareOfDamagePct).padStart(5)}%  ` +
    `top: ${r.bySource.slice(0, 3).map(s => s[0] + ' ' + s[2] + '%').join(', ')}`);
}
console.log(JSON.stringify(out, null, 1));
