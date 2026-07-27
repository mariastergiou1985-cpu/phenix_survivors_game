// PHASE 6B §6/§7/§8 — VESSEL SOURCE OF TRUTH + XP SOURCE ACCOUNTING + SPATIAL DISTRIBUTION
// ------------------------------------------------------------------------------------------------
// Three questions, one run, because they share the same instrumentation:
//
//  §6  Is the companion rocket an alpha_phoenix ability or a baseline every vessel gets?
//      Run the SAME character on every vessel id and compare the _tickVesselRockets damage.
//
//  §7  Is XP conserved? generated must equal collected + still-on-the-ground + a NAMED
//      terminal bucket. No bucket may be called "unexplained".
//
//  §8  WHERE does XP come from and how long does it take to reach the player? Records the
//      player-to-kill distance at every shard spawn, the collection latency, and the share
//      of XP created outside 300 / 500 / 720 px. 720 px is the vessel rocket's reach: if the
//      vessel farms beyond the player's ability to walk there, the XP shows up as generated
//      and NOT collected, and THAT is a mechanism. Without this measurement "the vessel
//      steals XP" is an accusation, not a finding.
//
//   node tools/qa/phase6b_xp_accounting.mjs [seconds] <id> [--vessel=alpha_phoenix] [--novessel]
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
const { Player } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Player.js')).href);
const { XpShardSystem } = await import(pathToFileURL(path.join(ROOT, 'js/entities/XpShards.js')).href);
const { makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
const DRAW_CTX = makeCtx();
u0();

const GAME_SRC = readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const lineOwner = (() => {
  const lines = GAME_SRC.split('\n'); const own = new Array(lines.length + 1); let cur = '?';
  for (let i = 0; i < lines.length; i++) { const m = lines[i].match(/^  ([A-Za-z_][\w]*)\s*\(/); if (m) cur = m[1]; own[i + 1] = cur; }
  return own;
})();
const HELPERS = new Set(['_brawlerHit', '_capBossDamage', '_tryCorrode', '_targetIsBoss',
                         '_dealDamage', '_applyElementOnHit', '_onEnemyKilled', '?']);
const siteOwner = () => {
  const st = (new Error().stack || '').split('\n');
  let firstHelper = null;
  for (let i = 2; i < st.length; i++) {
    const m = st[i].match(/Game\.js[^:]*:(\d+):/);
    if (m) { const o = lineOwner[Number(m[1])] || '?'; if (HELPERS.has(o)) { firstHelper ||= o; continue; } return o; }
    if (/BuildEngine[^/]*\.js/.test(st[i])) return 'buildEngine';
    if (/NpcWalker\.js/.test(st[i])) return 'npcWalker';
  }
  return firstHelper ? 'helper-only:' + firstHelper : 'unknown';
};
// which side of the XP pipeline is granting: the shard collector, or a direct Game.js grant?
const xpGrantSite = () => {
  const st = (new Error().stack || '').split('\n');
  for (let i = 2; i < st.length; i++) {
    if (/XpShards\.js/.test(st[i])) return 'shard-collect';
    const m = st[i].match(/Game\.js[^:]*:(\d+):/);
    if (m) return 'direct:' + (lineOwner[Number(m[1])] || '?');
    if (/Enemy\.js/.test(st[i])) return 'direct:Enemy.die-fallback';
  }
  return 'direct:unknown';
};

const args = process.argv.slice(2);
const SECONDS = Number(args[0]) > 0 ? Number(args.shift()) : 240;
const ID = args.filter(a => !a.startsWith('--'))[0] || 'oni_cataclysm_protocol';
const VESSEL = (args.find(a => a.startsWith('--vessel=')) || '--vessel=alpha_phoenix').slice(9);
const NOVESSEL = args.includes('--novessel');
const SEED = Number((args.find(a => a.startsWith('--seed=')) || '--seed=12345').slice(7));

// ── instrumentation ───────────────────────────────────────────────────────────────────────────
let GEN = 0, COLL = 0;                      // xp created by shard bursts / granted on collection
const grantBy = {};                          // grant path -> xp
const dmgBy = {};                            // damage source -> hp removed
let TOTAL_DMG = 0, KILLS = 0;
const spawnDist = [];                        // player->kill distance at every burst
const latency = [];                          // {lat, age, v, timer} per collected shard
let unstamped = 0;
let G = null;                                // live game, for player position

const ESB = XpShardSystem.prototype.spawnBurst;
XpShardSystem.prototype.spawnBurst = function (x, y, total, radius, game) {
  const v = Math.max(1, Math.round(total));
  GEN += v;
  const p = game?.player || G?.player;
  if (p?.pos) spawnDist.push({ d: Math.hypot(p.pos.x - x, p.pos.y - y), v, t: vclock / 1000 });
  return ESB.call(this, x, y, total, radius, game);
};
// INSTRUMENT CORRECTION. Stamping _bornAt on the tail of this.active AFTER spawnBurst is wrong:
// spawnBurst calls _compact() before returning, which reorders and filters the array, so the
// stamps landed on the wrong objects and un-stamped shards defaulted to age = whole run. That
// inflated the measured latency (p90 read 47.5s on a 120s run). Stamp inside _spawn instead,
// which is the single place a shard object enters play.
const ESP = XpShardSystem.prototype._spawn;
XpShardSystem.prototype._spawn = function (x, y, value) {
  const s = ESP.call(this, x, y, value);
  if (s) s._bornAt = vclock / 1000;
  return s;
};
const EGX = Player.prototype.gainXp;
Player.prototype.gainXp = function (amount, ft) {
  const site = xpGrantSite();
  const before = this.xp + this._lvlAcc0;
  const r = EGX.call(this, amount, ft);
  const gained = Math.max(1, Math.round(amount * (this.xpMult || 1)));
  grantBy[site] = (grantBy[site] || 0) + gained;
  if (site === 'shard-collect') COLL += gained;
  return r;
};
// collection latency: the shard system splices on collect, so wrap update and diff the set
const EUP = XpShardSystem.prototype.update;
XpShardSystem.prototype.update = function (dt, game) {
  const seen = new Map();
  // s.t is the shard's own age clock; the system force-magnets any shard at t >= 20s, so
  // recording it at collection separates "the player walked into it" from "the 20s self-clear
  // timer delivered it". Those are very different player experiences.
  for (const s of this.active) seen.set(s, { born: s._bornAt ?? null, age: s.t, magnet: !!s.magnet });
  const r = EUP.call(this, dt, game);
  const still = new Set(this.active);
  for (const [s, info] of seen) {
    if (still.has(s) || !s.dead) continue;
    if (info.born == null) { unstamped++; continue; }
    latency.push({ lat: (vclock / 1000) - info.born, age: info.age, v: s.value || 0, timer: info.age >= 20 });
  }
  return r;
};
const ETH = Enemy.prototype.takeHit;
let SINK = null;
Enemy.prototype.takeHit = function (dmg, game) {
  const before = this.hp;
  const owner = SINK ? siteOwner() : null;
  const r = ETH.call(this, dmg, game);
  const lost = Math.max(0, before - this.hp);
  if (lost > 0 && SINK) { dmgBy[owner] = (dmgBy[owner] || 0) + lost; TOTAL_DMG += lost; if (before > 0 && this.hp <= 0) KILLS++; }
  return r;
};

function pct(arr, sel, q) { if (!arr.length) return null; const a = arr.map(sel).sort((x, y) => x - y); return +a[Math.min(a.length - 1, Math.floor(q * a.length))].toFixed(1); }

function run() {
  Math.random = mul(SEED); vclock = 0;
  try { globalThis.localStorage.clear(); } catch (_) {}
  const un = muteConsole();
  const g = new Game(); G = g;
  g.audio = null; g.selectedCharacter = ID; g.gameState = 'playing';
  if (g.meta) { g.meta.selectedVessel = VESSEL; g.meta.unlockedVessels = { ...(g.meta.unlockedVessels || {}), [VESSEL]: true }; }
  g.reset(); g._enterEndless();
  if (NOVESSEL) { g._vesselCompanion = null; g._activeVesselId = null; }
  const p = g.player;
  p._lvlAcc0 = 0;
  SINK = true;

  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  const setDir = (dx, dy, dash) => {
    input.keys.clear();
    if (dy < -0.35) input.keys.add('w'); else if (dy > 0.35) input.keys.add('s');
    if (dx < -0.35) input.keys.add('a'); else if (dx > 0.35) input.keys.add('d');
    if (dash) input.keys.add('shift');
  };
  for (let f = 0; f < SECONDS * 60; f++) {
    vclock += 1000 / 60;
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    let vx = 0, vy = 0, nearest = Infinity, touching = 0;
    for (const e of g.enemies) {
      if (!e || e.hp <= 0 || !e.pos) continue;
      const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y, d = Math.hypot(dx, dy);
      if (d > 340 || d < 1) continue;
      vx += dx / d; vy += dy / d;
      if (d < nearest) nearest = d;
      if (d < 16 + (e.radius || 14)) touching++;
    }
    const len = Math.hypot(vx, vy) || 1;
    setDir(vx / len, vy / len, (p.dashCooldown || 0) <= 0 && (touching >= 2 || nearest < 46));
    input.mousePos = { x: p.pos.x + 400, y: p.pos.y };
    if (NOVESSEL && (g._vesselCompanion || g._activeVesselId)) { g._vesselCompanion = null; g._activeVesselId = null; }
    try { g.update(1 / 60, input); } catch (_) { break; }
    try { g.draw(DRAW_CTX); } catch (_) {}
    p.hp = p.maxHp; g.gameOver = false;
  }
  SINK = null;
  const remaining = (g.xpShards?.active || []).reduce((a, s) => a + (s.value || 0), 0);
  un();

  const dmgRows = Object.entries(dmgBy).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, Math.round(v), +(100 * v / (TOTAL_DMG || 1)).toFixed(1)]);
  const totalGenWeight = spawnDist.reduce((a, s) => a + s.v, 0) || 1;
  const outside = r => +(100 * spawnDist.filter(s => s.d > r).reduce((a, s) => a + s.v, 0) / totalGenWeight).toFixed(1);
  const shardXpMult = g.player.xpMult || 1;
  return {
    id: ID, vessel: NOVESSEL ? null : VESSEL, seed: SEED, seconds: SECONDS,
    level: g.player.level, kills: KILLS,
    damage: { total: Math.round(TOTAL_DMG), vesselRockets: Math.round(dmgBy._tickVesselRockets || 0),
              vesselRocketPct: +(100 * (dmgBy._tickVesselRockets || 0) / (TOTAL_DMG || 1)).toFixed(1),
              bySource: dmgRows.slice(0, 8) },
    xp: {
      generatedByShards: GEN, xpMult: shardXpMult,
      generatedAfterMult: Math.round(GEN * shardXpMult),
      collectedFromShards: COLL, stillOnGround: remaining,
      stillOnGroundAfterMult: Math.round(remaining * shardXpMult),
      // conservation identity, all three terms named, nothing called "unexplained"
      residual: Math.round(GEN * shardXpMult) - COLL - Math.round(remaining * shardXpMult),
      byGrantPath: Object.entries(grantBy).sort((a, b) => b[1] - a[1]),
    },
    spatial: {
      bursts: spawnDist.length,
      killDistP50: pct(spawnDist, s => s.d, 0.5), killDistP90: pct(spawnDist, s => s.d, 0.9),
      killDistMax: spawnDist.length ? +Math.max(...spawnDist.map(s => s.d)).toFixed(1) : null,
      xpPctBeyond300: outside(300), xpPctBeyond500: outside(500), xpPctBeyond720: outside(720),
      collectedShards: latency.length, unstampedShards: unstamped,
      latencyP50: pct(latency, s => s.lat, 0.5), latencyP90: pct(latency, s => s.lat, 0.9),
      latencyMax: latency.length ? +Math.max(...latency.map(s => s.lat)).toFixed(1) : null,
      // share of COLLECTED XP that arrived only because the 20s self-clear timer fired
      xpPctViaSelfClearTimer: latency.length
        ? +(100 * latency.filter(s => s.timer).reduce((a, s) => a + s.v, 0) / (latency.reduce((a, s) => a + s.v, 0) || 1)).toFixed(1)
        : null,
    },
  };
}

const r = run();
console.error(`  ${r.id.padEnd(24)} vessel=${String(r.vessel).padEnd(22)} lvl ${String(r.level).padStart(2)}  kills ${String(r.kills).padStart(4)}  ` +
  `rockets ${String(r.damage.vesselRocketPct).padStart(5)}%  XP gen ${r.xp.generatedAfterMult} coll ${r.xp.collectedFromShards} ground ${r.xp.stillOnGroundAfterMult} residual ${r.xp.residual}  ` +
  `killDist p50/p90 ${r.spatial.killDistP50}/${r.spatial.killDistP90}  >720px ${r.spatial.xpPctBeyond720}%  lat p50/p90 ${r.spatial.latencyP50}/${r.spatial.latencyP90}s  via-20s-timer ${r.spatial.xpPctViaSelfClearTimer}%`);
console.log(JSON.stringify(r, null, 1));
