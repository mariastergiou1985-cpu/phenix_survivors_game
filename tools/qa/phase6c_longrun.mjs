// PHASE 6B §9 + PHASE 6C §13-16 — PAIRED MATRIX AND THE LONG-RUN POWER CURVE
// ------------------------------------------------------------------------------------------------
// Maria's actual complaint, in her words: with full or nearly full meta upgrades the characters
// seem to die around the 5th minute in Endless and Chaos and never get to feel godlike.
//
// This runs one configuration per process and emits PER-MINUTE rows, because a single end-of-run
// total cannot tell "the player got strong and then something killed them" apart from "the player
// was never strong". Per minute it records damage dealt, damage TAKEN and by what, kills, level,
// XP on the ground, enemy count and enemy HP, so the minute the curve turns over is visible.
//
// Bot profiles:
//   competent  - flee the local threat centroid, linear distance weight (the Phase 6A baseline)
//   expert-v2  - inverse-distance weighting, hard veto inside 70px, hazard-aware. The linear
//                weight was the CASE B artifact: one body 30px ahead scored 0.93 while five at
//                400px totalled 0.25, so the "expert" walked into contact.
//
//   node tools/qa/phase6c_longrun.mjs <id> [--min=20] [--mode=endless|chaos] [--meta=clean|max]
//                                          [--bot=competent|expert] [--novessel] [--seed=N]
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
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
const { Player } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Player.js')).href);
const META = await import(pathToFileURL(path.join(ROOT, 'js/game/MetaProgress.js')).href);
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
                         '_dealDamage', '_applyElementOnHit', '_onEnemyKilled', '?',
                         // player-side damage plumbing: naming these hides the real threat
                         '_damagePlayer', '_hurtPlayer', '_applyPlayerDamage', 'applyDamage', 'update']);
const siteOwner = () => {
  const st = (new Error().stack || '').split('\n');
  let firstHelper = null;
  for (let i = 2; i < st.length; i++) {
    const m = st[i].match(/Game\.js[^:]*:(\d+):/);
    if (m) { const o = lineOwner[Number(m[1])] || '?'; if (HELPERS.has(o)) { firstHelper ||= o; continue; } return o; }
    if (/BuildEngine[^/]*\.js/.test(st[i])) return 'buildEngine';
    if (/NpcWalker\.js/.test(st[i])) return 'npcWalker';
    if (/Enemy\.js/.test(st[i])) return 'enemy-contact-or-bullet';
  }
  return firstHelper ? 'helper-only:' + firstHelper : 'unknown';
};

const args = process.argv.slice(2);
const ID    = args.filter(a => !a.startsWith('--'))[0] || 'oni_cataclysm_protocol';
const MIN   = Number((args.find(a => a.startsWith('--min='))  || '--min=20').slice(6));
const MODE  = (args.find(a => a.startsWith('--mode=')) || '--mode=endless').slice(7);
const METAK = (args.find(a => a.startsWith('--meta=')) || '--meta=clean').slice(7);
const BOT   = (args.find(a => a.startsWith('--bot=')) || '--bot=competent').slice(6);
const SEED  = Number((args.find(a => a.startsWith('--seed=')) || '--seed=12345').slice(7));
const NOVESSEL = args.includes('--novessel');

// ── instrumentation ───────────────────────────────────────────────────────────────────────────
let dealt = 0, kills = 0;
const dealtBy = {}, takenBy = {};
let taken = 0;
const ETH = Enemy.prototype.takeHit;
let ON = false;
Enemy.prototype.takeHit = function (dmg, game) {
  const before = this.hp;
  const owner = ON ? siteOwner() : null;
  const r = ETH.call(this, dmg, game);
  const lost = Math.max(0, before - this.hp);
  if (lost > 0 && ON) { dealtBy[owner] = (dealtBy[owner] || 0) + lost; dealt += lost; if (before > 0 && this.hp <= 0) kills++; }
  return r;
};
// what actually kills the player: every path that reduces player HP, attributed by call site
const PTH = Player.prototype.applyDamage;   // the single HP-reduction entry point (Player.js:210)
if (typeof PTH === 'function') {
  Player.prototype.applyDamage = function (...a) {
    const before = this.hp;
    const owner = ON ? siteOwner() : null;
    const r = PTH.apply(this, a);
    const lost = Math.max(0, before - this.hp);
    if (lost > 0 && ON) { takenBy[owner] = (takenBy[owner] || 0) + lost; taken += lost; }
    return r;
  };
}

function maxMeta(m) {
  const all = [...(META.META_UPGRADES || []), ...(META.SKILL_TREE || []), ...(META.SYNERGY_UPGRADES || [])];
  for (const u of all) if (u && u.key) m.levels[u.key] = u.maxLevel ?? 1;
  m.gridCores = 999999; m.fragments = 999;
  return all.length;
}

function run() {
  Math.random = mul(SEED); vclock = 0;
  try { globalThis.localStorage.clear(); } catch (_) {}
  const un = muteConsole();
  const g = new Game();
  g.audio = null; g.selectedCharacter = ID; g.gameState = 'playing';
  let metaKeys = 0;
  if (METAK === 'max' && g.meta) metaKeys = maxMeta(g.meta);
  g.reset();
  // CORRECTION (2026-07-27): there is no _enterChaosMode. The earlier version fell through to
  // _enterEndless() for both modes and produced byte-identical 'chaos' and 'endless' rows in all
  // 28 pairs - those Chaos numbers were withdrawn. _beginChaosRun() is the real entry, the same
  // one the in-game QA bridge (main.js __phenixQA.startChaos) uses.
  if (MODE === 'chaos') g._beginChaosRun();
  else g._enterEndless();
  if (NOVESSEL) { g._vesselCompanion = null; g._activeVesselId = null; }
  const p = g.player;
  ON = true;

  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  const setDir = (dx, dy, dash) => {
    input.keys.clear();
    if (dy < -0.35) input.keys.add('w'); else if (dy > 0.35) input.keys.add('s');
    if (dx < -0.35) input.keys.add('a'); else if (dx > 0.35) input.keys.add('d');
    if (dash) input.keys.add('shift');
  };
  // EXPERT-V2 weighting. Linear (420-d)/420 let one body at 30px score 0.93 while five at
  // 400px totalled 0.25, so the bot drifted into contact. Inverse distance plus a hard veto
  // inside 70px makes the nearest body dominate, which is what a good player actually does.
  const steer = () => {
    let vx = 0, vy = 0, nearest = Infinity, touching = 0, veto = null;
    for (const e of g.enemies) {
      if (!e || e.hp <= 0 || !e.pos) continue;
      const dx = p.pos.x - e.pos.x, dy = p.pos.y - e.pos.y, d = Math.hypot(dx, dy);
      if (d > 420 || d < 1) continue;
      const w = BOT === 'expert' ? Math.min(8, 90 / d) : (420 - d) / 420;
      vx += (dx / d) * w; vy += (dy / d) * w;
      if (d < nearest) { nearest = d; if (BOT === 'expert' && d < 70) veto = { x: dx / d, y: dy / d }; }
      if (d < 16 + (e.radius || 14)) touching++;
    }
    if (veto) { vx = veto.x * 10; vy = veto.y * 10; }
    return { vx, vy, nearest, touching };
  };

  const rows = [];
  let mDealt = 0, mTaken = 0, mKills = 0, deathSec = null;
  // build progression, straight off BuildEngine state - no new framework, just read what is there
  const beWeapons = () => (g.buildEngine?.weapons ? [...g.buildEngine.weapons.values()] : []);
  const evoCount  = () => beWeapons().filter(w => w?.evolved).length;
  let firstEvoSec = null, firstEvoLvl = null;
  const F = MIN * 60 * 60;
  for (let f = 0; f < F; f++) {
    vclock += 1000 / 60;
    // PICK THE LAST CARD, NOT SLOT 0. _injectWeaponCard() APPENDS the weapon/BuildEngine card,
    // so a slot-0 bot never takes one: it collects passives forever, the BuildEngine weapon map
    // stays empty and the run reports zero evolutions. That is a harness artifact, not a game
    // property - it already invalidated one earlier evolution count. Greedy-last takes the weapon
    // whenever one is offered, which is what a player chasing a build does.
    if (g.upgradeUI) { try { g.selectUpgrade(g.upgradeUI.choices.length - 1); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    const s = steer();
    const len = Math.hypot(s.vx, s.vy) || 1;
    setDir(s.vx / len, s.vy / len, (p.dashCooldown || 0) <= 0 && (s.touching >= 2 || s.nearest < (BOT === 'expert' ? 90 : 46)));
    input.mousePos = { x: p.pos.x + 400, y: p.pos.y };
    if (NOVESSEL && (g._vesselCompanion || g._activeVesselId)) { g._vesselCompanion = null; g._activeVesselId = null; }
    const d0 = dealt, t0 = taken, k0 = kills;
    try { g.update(1 / 60, input); } catch (_) { break; }
    try { g.draw(DRAW_CTX); } catch (_) {}
    mDealt += dealt - d0; mTaken += taken - t0; mKills += kills - k0;
    if (firstEvoSec === null && evoCount() > 0) { firstEvoSec = +(f / 60).toFixed(1); firstEvoLvl = p.level; }
    if (deathSec === null && (g.gameOver || p.hp <= 0)) { deathSec = +(f / 60).toFixed(1); break; }
    if ((f + 1) % 3600 === 0) {
      let ehp = 0; for (const e of g.enemies) ehp += Math.max(0, e?.hp || 0);
      rows.push({ min: (f + 1) / 3600, dealt: Math.round(mDealt), taken: Math.round(mTaken), kills: mKills,
                  lvl: p.level, hp: Math.round(p.hp), maxHp: Math.round(p.maxHp),
                  enemies: g.enemies.length, enemyHp: Math.round(ehp),
                  groundXp: (g.xpShards?.active || []).reduce((a, x) => a + (x.value || 0), 0) });
      mDealt = 0; mTaken = 0; mKills = 0;
    }
  }
  ON = false;
  const alive = deathSec === null;
  un();
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, Math.round(v)]);
  const finalWeapons = beWeapons();
  return { id: ID, mode: MODE, meta: METAK, metaKeysMaxed: metaKeys, bot: BOT, vessel: !NOVESSEL, seed: SEED,
           firstEvolutionSec: firstEvoSec, firstEvolutionLevel: firstEvoLvl,
           evolutionsAtEnd: finalWeapons.filter(w => w?.evolved).length,
           weaponsAtEnd: finalWeapons.length,
           weaponLevelsAtEnd: finalWeapons.map(w => (w?.id || '?') + ':' + (w?.level ?? 0) + (w?.evolved ? '*' : '')),
           minutes: MIN, survived: alive, deathSec, finalLevel: p.level, kills, totalDealt: Math.round(dealt),
           totalTaken: Math.round(taken), dealtTop: top(dealtBy), takenTop: top(takenBy), perMinute: rows };
}

const r = run();
console.error(`  ${r.id.padEnd(24)} ${r.mode.padEnd(7)} meta=${r.meta.padEnd(5)} bot=${r.bot.padEnd(9)} vessel=${r.vessel ? 'on ' : 'off'} seed=${r.seed}  ` +
  (r.survived ? `SURVIVED ${r.minutes}min` : `DIED ${r.deathSec}s (min ${(r.deathSec / 60).toFixed(1)})`) +
  `  lvl ${r.finalLevel}  kills ${r.kills}  taken ${r.totalTaken}  evo1 ${r.firstEvolutionSec ?? 'never'}s  evos ${r.evolutionsAtEnd}/${r.weaponsAtEnd}  top-threat ${(r.takenTop[0] || ['-'])[0]}`);
console.log(JSON.stringify(r, null, 1));
