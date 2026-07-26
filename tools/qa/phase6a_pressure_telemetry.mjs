// PHASE 6A — PRESSURE ATTRIBUTION TELEMETRY
// ------------------------------------------------------------------------------------------------
// Answers ONE question with data instead of hypotheses: for a player who actually MOVES, what is
// killing Endless and Chaos runs before mid game? Every earlier pass measured a stationary player,
// which is a worst case, not a skill level. This drives a kiting bot through the real production
// loop and attributes 100% of the damage the player takes to a reason code, alongside the local
// density, escape time, role mix and progression timeline that explain WHY that reason won.
//
//   node tools/qa/phase6a_pressure_telemetry.mjs                 # full matrix, JSON summary
//   node tools/qa/phase6a_pressure_telemetry.mjs --worker <seed> <char> <mode> <skill> <maxSeconds>
//
// Reads production only. No tuning value is modified anywhere.
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(HERE, '../..');

// ── call-site -> reason code. Derived from Game.js at runtime so a shifted line never silently
//    reattributes damage to the wrong bucket. ────────────────────────────────────────────────────
const REASONS = [
  [/_checkPlayerEnemyCollisions/, 'horde_contact'],
  [/_updateBossTrails/,           'boss_trail'],
  [/_updateTitan/,                'titan'],
  [/_updateAnnihilator/,          'annihilator'],
  [/_updateEnemyBullets/,         'enemy_ranged'],
  [/_updateLightningStorm/,       'lightning'],
  [/_updateRockets/,              'airstrike'],
  [/_updateGunship/,              'gunship'],
  [/_updateCyberSerpent/,         'cyber_serpent'],
  [/_updateCyberDragon/,          'cyber_dragon'],
  [/_updateBloodfang/,            'bloodfang'],
  [/_updateDoubleDemons/,         'double_demons'],
  [/_updateBossAttacks/,          'boss_attack'],
  [/_updateEndlessHazards/,       'endless_hazard'],
  [/_updateChaos/,                'chaos_hazard'],
];

if (process.argv[2] === '--worker') {
  const seed  = Number(process.argv[3]);
  const char  = process.argv[4];
  const mode  = process.argv[5];
  const skill = process.argv[6];
  const MAXS  = Number(process.argv[7] || 420);

  const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
  installEnv();
  const mulberry32 = a => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = mulberry32(seed);
  let vclock = 0;
  globalThis.performance = { now: () => vclock };
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    static now() { return vclock; }
    constructor(...a) { if (a.length) super(...a); else super(vclock); }
  };
  try { globalThis.localStorage.clear(); } catch (_) {}

  const un = muteConsole();
  const { Game }  = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
  const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
  const GAME_SRC  = (await import('node:fs')).readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
  un();

  // line -> enclosing method name, built once from the source
  const lineOwner = (() => {
    const lines = GAME_SRC.split('\n'); const own = new Array(lines.length + 1); let cur = '?';
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^  ([A-Za-z_][\w]*)\s*\(/);
      if (m) cur = m[1];
      own[i + 1] = cur;
    }
    return own;
  })();
  const reasonFor = line => {
    const fn = lineOwner[line] || '?';
    for (const [re, code] of REASONS) if (re.test(fn)) return code;
    return 'other:' + fn;
  };

  const unrun = muteConsole();
  const game = new Game();
  game.audio = null;
  game.selectedCharacter = char;
  game.gameState = 'playing';
  if (mode === 'chaos') { game.reset(); game._beginChaosRun(); }
  else                  { game.reset(); game._enterEndless(); }

  // ── instrumentation ─────────────────────────────────────────────────────────────────────────
  const dmg = {};                    // reason -> HP
  const accepted = {}, rejected = {};
  const events = [];                 // {t, reason, hp}
  let lastReason = null;
  const site = () => {
    const st = (new Error().stack || '').split('\n');
    for (let i = 2; i < st.length; i++) {
      const m = st[i].match(/Game\.js[^:]*:(\d+):/);
      if (m) return Number(m[1]);
    }
    return 0;
  };
  const record = (reason, lost, landed) => {
    if (landed) { accepted[reason] = (accepted[reason] || 0) + 1; } else { rejected[reason] = (rejected[reason] || 0) + 1; }
    if (lost > 0) {
      dmg[reason] = (dmg[reason] || 0) + lost;
      events.push({ t: +game.timeAlive.toFixed(2), reason, lost: +lost.toFixed(2), hp: +game.player.hp.toFixed(1) });
      lastReason = reason;
    }
  };
  const oPulse = game._applyPulseDamage.bind(game);
  game._applyPulseDamage = function (d, o) {
    const reason = reasonFor(site()); const before = game.player.hp;
    const r = oPulse(d, o); record(reason, Math.max(0, before - game.player.hp), r); return r;
  };
  const oGate = game._damagePlayer.bind(game);
  game._damagePlayer = function (d, o) {
    const reason = reasonFor(site()); const before = game.player.hp;
    const r = oGate(d, o); record(reason, Math.max(0, before - game.player.hp), r); return r;
  };
  // weapon damage share
  const weapon = {};
  const oHit = Enemy.prototype.takeHit;
  Enemy.prototype.takeHit = function (d, g, ...rest) {
    const before = this.hp; const r = oHit.call(this, d, g, ...rest);
    const done = Math.max(0, before - this.hp);
    if (done > 0) { const k = game._lastWeaponId || 'unattributed'; weapon[k] = (weapon[k] || 0) + done; }
    return r;
  };

  // ── kiting bot ──────────────────────────────────────────────────────────────────────────────
  // competent: always moving away from the local threat centroid, dashes when boxed in.
  // expert:    same, plus it steers toward the widest open arc instead of straight backwards.
  const keys = new Set();
  const input = { keys, mousePos: { x: 0, y: 0 }, mouseDown: false };
  const setDir = (dx, dy, dash) => {
    keys.clear();
    if (dy < -0.35) keys.add('w'); else if (dy > 0.35) keys.add('s');
    if (dx < -0.35) keys.add('a'); else if (dx > 0.35) keys.add('d');
    if (dash) keys.add('shift');
  };
  const threatVector = radius => {
    const p = game.player.pos; let vx = 0, vy = 0, n = 0;
    for (const e of game.enemies) {
      if (!e || e.hp <= 0 || !e.pos) continue;
      const dx = p.x - e.pos.x, dy = p.y - e.pos.y, d2 = dx * dx + dy * dy;
      if (d2 > radius * radius || d2 < 1) continue;
      const d = Math.sqrt(d2), w = 1 / d;
      vx += (dx / d) * w; vy += (dy / d) * w; n++;
    }
    return { vx, vy, n };
  };
  const bestOpenArc = () => {                     // expert: 16 rays, pick the emptiest
    const p = game.player.pos; let best = 0, bestScore = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
      let score = 0;
      for (const e of game.enemies) {
        if (!e || e.hp <= 0 || !e.pos) continue;
        const dx = e.pos.x - p.x, dy = e.pos.y - p.y, d = Math.hypot(dx, dy);
        if (d > 420 || d < 1) continue;
        const dot = (dx / d) * cx + (dy / d) * cy;
        if (dot > 0.2) score -= dot * (420 - d) / 420;
      }
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return { x: Math.cos(best), y: Math.sin(best) };
  };

  // ── sampling ────────────────────────────────────────────────────────────────────────────────
  const dens = { d100: [], d200: [], d300: [] };
  const contactBodies = [], arcs = [], roleSamples = {};
  let exposureFrames = 0, contactFrames = 0, moveDist = 0, escapeSum = 0, escapeN = 0;
  let inContact = false, contactStart = 0;
  const levelTimeline = [], evoTimeline = [], dpsTimeline = [];
  let lastLevel = game.player.level, lastKillDmg = 0;
  let prev = { x: game.player.pos.x, y: game.player.pos.y };
  const PR = 16;

  const sample = () => {
    const p = game.player.pos; let d100 = 0, d200 = 0, d300 = 0, touching = 0;
    const q = new Set(); const roles = {};
    for (const e of game.enemies) {
      if (!e || e.hp <= 0 || !e.pos) continue;
      const dx = e.pos.x - p.x, dy = e.pos.y - p.y, d = Math.hypot(dx, dy);
      if (d < 300) { d300++; roles[e.archetype || '?'] = (roles[e.archetype || '?'] || 0) + 1; }
      if (d < 200) d200++;
      if (d < 100) d100++;
      if (d < (e.radius || 14) + PR) { touching++; q.add(Math.round(Math.atan2(dy, dx) / (Math.PI / 4))); }
    }
    dens.d100.push(d100); dens.d200.push(d200); dens.d300.push(d300);
    contactBodies.push(touching); arcs.push(q.size);
    for (const k in roles) roleSamples[k] = (roleSamples[k] || 0) + roles[k];
    if (d300 > 0) exposureFrames++;
    if (touching > 0) {
      contactFrames++;
      if (!inContact) { inContact = true; contactStart = game.timeAlive; }
    } else if (inContact) {
      inContact = false; escapeSum += game.timeAlive - contactStart; escapeN++;
    }
  };

  let died = null, killingBlow = null;
  const dt = 1 / 60;
  for (let f = 0; f < MAXS * 60; f++) {
    vclock += 1000 / 60;
    if (game.upgradeUI)  { try { game.selectUpgrade(0); }  catch (_) { game.upgradeUI = null; } }
    if (game.mutationUI) { try { game.selectMutation(0); } catch (_) { game.mutationUI = null; } }
    if (game._postArenaChoice) { try { game._selectPostArenaChoice(0); } catch (_) { game._postArenaChoice = null; } }

    const tv = threatVector(340);
    if (skill === 'expert') {
      const a = bestOpenArc();
      const boxed = tv.n >= 6;
      setDir(a.x, a.y, boxed && game.player.dashCooldown <= 0);
    } else {
      const len = Math.hypot(tv.vx, tv.vy) || 1;
      const boxed = tv.n >= 8;
      setDir(tv.vx / len, tv.vy / len, boxed && game.player.dashCooldown <= 0);
    }

    try { game.update(dt, input); } catch (e) { break; }

    moveDist += Math.hypot(game.player.pos.x - prev.x, game.player.pos.y - prev.y);
    prev = { x: game.player.pos.x, y: game.player.pos.y };
    if (f % 15 === 0) sample();
    if (game.player.level !== lastLevel) { levelTimeline.push({ t: +game.timeAlive.toFixed(1), lvl: game.player.level }); lastLevel = game.player.level; }
    if (f % 300 === 0) {
      const tot = Object.values(weapon).reduce((a, b) => a + b, 0);
      dpsTimeline.push({ t: +game.timeAlive.toFixed(0), dps: +((tot - lastKillDmg) / 5).toFixed(1) });
      lastKillDmg = tot;
    }
    if (game.gameOver) { died = +game.timeAlive.toFixed(2); killingBlow = lastReason; break; }
  }
  unrun();

  const end = died != null ? died : game.timeAlive;
  const win = s => events.filter(e => e.t >= end - s).reduce((a, e) => a + e.lost, 0);
  const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const mx  = a => (a.length ? Math.max(...a) : null);
  const totalDmg = Object.values(dmg).reduce((a, b) => a + b, 0);
  const roleTot = Object.values(roleSamples).reduce((a, b) => a + b, 0) || 1;
  const totalWeapon = Object.values(weapon).reduce((a, b) => a + b, 0);
  const minutes = Math.max(end / 60, 1 / 60);

  process.stdout.write(JSON.stringify({
    seed, char, mode, skill,
    died, timeAlive: +end.toFixed(2), maxHp: game.player.maxHp, level: game.player.level,
    killingBlow,
    damageByReason: Object.fromEntries(Object.entries(dmg).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, { hp: +v.toFixed(1), pct: +(100 * v / (totalDmg || 1)).toFixed(1) }])),
    totalDamage: +totalDmg.toFixed(1),
    damageLast: { s1: +win(1).toFixed(1), s3: +win(3).toFixed(1), s5: +win(5).toFixed(1), s10: +win(10).toFixed(1) },
    pulsesPerMin: {
      accepted: Object.fromEntries(Object.entries(accepted).map(([k, v]) => [k, +(v / minutes).toFixed(1)])),
      rejected: Object.fromEntries(Object.entries(rejected).map(([k, v]) => [k, +(v / minutes).toFixed(1)])),
    },
    density: { d100: { med: med(dens.d100), max: mx(dens.d100) },
               d200: { med: med(dens.d200), max: mx(dens.d200) },
               d300: { med: med(dens.d300), max: mx(dens.d300) } },
    contact: { medBodies: med(contactBodies), maxBodies: mx(contactBodies),
               maxArcs: mx(arcs), medArcs: med(arcs),
               contactUptimePct: +(100 * contactFrames / Math.max(1, dens.d100.length)).toFixed(1),
               exposurePct: +(100 * exposureFrames / Math.max(1, dens.d100.length)).toFixed(1),
               meanEscapeSeconds: escapeN ? +(escapeSum / escapeN).toFixed(2) : null, escapes: escapeN },
    roleMix: Object.fromEntries(Object.entries(roleSamples).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, +(100 * v / roleTot).toFixed(1)])),
    progression: { xpPerMin: +((game.player.xp || 0) / minutes).toFixed(1), levels: levelTimeline.slice(0, 30),
                   levelsPerMin: +(levelTimeline.length / minutes).toFixed(2) },
    weaponShare: Object.fromEntries(Object.entries(weapon).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v]) => [k, +(100 * v / (totalWeapon || 1)).toFixed(1)])),
    dpsTimeline: dpsTimeline.slice(0, 20),
    movementPx: +moveDist.toFixed(0),
    deathWindow: events.slice(-8),
    bossOverlapAtDeath: { titan: !!game.titanBoss, annihilator: !!game.annihilatorBoss,
                          bossRush: !!game._bossRush, arena: !!game._nullBreachActive,
                          lightning: (game.lightningZones || []).length, acidRain: !!game.acidRain },
  }));
  process.exit(0);
}

// ── parent ────────────────────────────────────────────────────────────────────────────────────
const MATRIX = [];
for (const mode of ['endless', 'chaos'])
  for (const skill of ['competent', 'expert'])
    for (const seed of [12345, 777, 20260721])
      MATRIX.push({ seed, char: 'euclid_vector', mode, skill });

const runOne = job => new Promise(res => {
  const p = spawn(process.execPath, [SELF, '--worker', String(job.seed), job.char, job.mode, job.skill, '420'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.on('close', () => { try { res(JSON.parse(out)); } catch (_) { res({ ...job, error: 'no output' }); } });
});

const results = [];
for (let i = 0; i < MATRIX.length; i += 3) {
  results.push(...await Promise.all(MATRIX.slice(i, i + 3).map(runOne)));
  process.stderr.write(`  ${results.length}/${MATRIX.length}\n`);
}
console.log(JSON.stringify(results, null, 1));
