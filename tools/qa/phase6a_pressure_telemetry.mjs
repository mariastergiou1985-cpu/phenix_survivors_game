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
  [/_updateChaosPylons/,          'chaos_pylon'],
  [/_updateChaos/,                'chaos_hazard'],
  // Completed 2026-07-26: an Assassin/Chaos run produced `other:_updateEnemyOrbZones`, i.e.
  // unattributed damage, which the protocol forbids. Every method in Game.js that can reach
  // _damagePlayer or _applyPulseDamage now has a reason code.
  [/_updateEnemyOrbZones/,        'enemy_orb_zone'],
  [/_updateEnemyBeams/,           'enemy_beam'],
  [/_updateCybermotes/,           'cybermote_mine'],
  [/_updateVoidRifts/,            'void_rift'],
  [/_updateVentBursts/,           'vent_burst'],
  [/_updateNullEcho|_nullEchoStrike/, 'null_echo'],
  [/_updateNullWyrm/,             'null_wyrm'],
  [/_updateCorruptionNovas|_updateCorruptionBeam/, 'final_boss_beam'],
  [/_updateBossRush/,             'boss_rush_hazard'],
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
  const requested = {}, firstHit = {}, lastHit = {}, killBlows = {};
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
    if (reason === 'horde_contact' && landed) {
      // §7-equivalent for the horde. The question is not "did it hurt" but "could it have been
      // avoided": how many escape arcs were open, how crowded was the pulse (the contact formula
      // multiplies by 1 + 0.15*min(7, n-1)), and could the player disengage at all — an enemy that
      // is not slower than the player cannot be walked away from. This also tests the bot: contact
      // taken with 4+ free arcs is the BOT's failure, contact taken with 0-1 is a design squeeze.
      const p = game.player.pos; let touching = 0, fastest = 0, nearest = Infinity;
      for (const e of game.enemies) {
        if (!e || e.hp <= 0 || !e.pos) continue;
        const d = Math.hypot(e.pos.x - p.x, e.pos.y - p.y);
        if (d < nearest) nearest = d;
        if (d < (e.radius || 14) + 16) { touching++; fastest = Math.max(fastest, e.baseSpeed || 0); }
      }
      const pSpeed = game.player.speed || game.player.baseSpeed || 230;
      const arcs = freeArcs();
      hordeHits.push({
        t: +game.timeAlive.toFixed(2), lost: +lost.toFixed(2), touching,
        crowdMult: +(1 + 0.15 * Math.min(7, Math.max(0, touching - 1))).toFixed(2),
        freeArcs: arcs, nearest: Number.isFinite(nearest) ? +nearest.toFixed(1) : null,
        fastestTouching: +fastest.toFixed(0), playerSpeed: +pSpeed.toFixed(0),
        canOutrun: fastest > 0 ? fastest < pSpeed * 0.95 : null,
        dashReady: (game.player.dashCooldown || 0) <= 0,
        // CLASSIFIER CORRECTION 2026-07-26: dash carries i-frames, so a cornered player who still
        // has dash is not actually trapped — they can pass THROUGH the bodies. Counting those as
        // unavoidable overstated the squeeze, the same way the rocket sampler overstated fairness.
        klass: (arcs <= 1 && !((game.player.dashCooldown || 0) <= 0)) ? 'C_CORNERED'
             : arcs <= 1 ? 'C_CORNERED_BUT_DASH_READY'
             : (fastest >= pSpeed * 0.95 && !((game.player.dashCooldown || 0) <= 0)) ? 'D_CANNOT_DISENGAGE'
             : arcs <= 3 ? 'B_PRESSURED' : 'A_AVOIDABLE',
      });
    }
    if (reason === 'airstrike' || reason === 'gunship') {
      // nearest live rocket is the one that just detonated (it is spliced right after this call)
      let best = null, bestD = Infinity;
      for (const r of (game.airstrikeRockets || [])) {
        const d = Math.hypot(r.pos.x - game.player.pos.x, r.pos.y - game.player.pos.y);
        if (d < bestD) { bestD = d; best = r; }
      }
      const spawn = best ? rocketSeen.get(best) : null;
      pendingRocketHit = {
        t: +game.timeAlive.toFixed(2), reason, lost: +lost.toFixed(1), landed: !!landed,
        hitDistance: Number.isFinite(bestD) ? +bestD.toFixed(1) : null,
        blast: best ? best.blast : null, homing: best ? +Number(best.h || 0).toFixed(2) : null,
        rocketSpeed: best ? +Number(best.speed).toFixed(0) : null,
        spawnDistance: spawn ? spawn.d0 : null, flightSeconds: spawn ? spawn.flightSeconds : null,
        playerSpeed: +Number(game.player.speed || game.player.baseSpeed || 0).toFixed(0),
        dashReady: (game.player.dashCooldown || 0) <= 0,
        freeArcs: freeArcs(), concurrent: concurrent(),
      };
      rocketHits.push(pendingRocketHit);
    }
    if (lost > 0) {
      dmg[reason] = (dmg[reason] || 0) + lost;
      firstHit[reason] ??= +game.timeAlive.toFixed(2);
      chargeOverlap(lost);
      lastHit[reason] = +game.timeAlive.toFixed(2);
      events.push({ t: +game.timeAlive.toFixed(2), reason, lost: +lost.toFixed(2), hp: +game.player.hp.toFixed(1) });
      lastReason = reason;
    }
  };
  const oPulse = game._applyPulseDamage.bind(game);
  game._applyPulseDamage = function (d, o) {
    const reason = reasonFor(site()); const before = game.player.hp;
    requested[reason] = (requested[reason] || 0) + (Number(d) || 0);
    const r = oPulse(d, o); record(reason, Math.max(0, before - game.player.hp), r); return r;
  };
  const oGate = game._damagePlayer.bind(game);
  game._damagePlayer = function (d, o) {
    const reason = reasonFor(site()); const before = game.player.hp;
    requested[reason] = (requested[reason] || 0) + (Number(d) || 0);
    const r = oGate(d, o); record(reason, Math.max(0, before - game.player.hp), r); return r;
  };
  // ── XP ACCOUNTING ─────────────────────────────────────────────────────────────────────────
  // player.xp is the CURRENT BAR value: gainXp() SUBTRACTS xpToNext on every level-up. Dividing it
  // by elapsed minutes (as v1 did) measures the leftover bar, not the XP flow, which is why a level
  // 21 run reported 9.7 "XP/min" and a level 18 run reported 103.5. Both were meaningless. Total
  // collected XP is the sum of what gainXp() actually granted; generated XP is what the shard system
  // spawned; the rest is still on the ground. The identity is asserted at the end of the run.
  let xpCollected = 0, xpGenerated = 0, pickups = 0;
  const oGain = game.player.gainXp.bind(game.player);
  game.player.gainXp = function (amount, ft) {
    const before = game.player.xp, beforeLvl = game.player.level;
    const r = oGain(amount, ft);
    const granted = Math.max(1, Math.round(amount * (game.player.xpMult || 1)));
    xpCollected += granted; pickups++;
    void before; void beforeLvl;
    return r;
  };
  if (game.xpShards && typeof game.xpShards.spawnBurst === 'function') {
    const oBurst = game.xpShards.spawnBurst.bind(game.xpShards);
    game.xpShards.spawnBurst = function (x, y, total, radius, g) {
      xpGenerated += Math.max(1, Math.round(total));
      return oBurst(x, y, total, radius, g);
    };
  }

  // ── AIRSTRIKE / ROCKET GEOMETRY ───────────────────────────────────────────────────────────
  // These rockets have NO impact telegraph: they are projectiles (blast 46, gunship 42 with 60%
  // homing) travelling at 200-285 px/s, i.e. about the player's own speed. "Telegraph duration"
  // therefore does not exist here — the dodge window is the flight time, and the escape distance is
  // lateral clearance of PLAYER_RADIUS + blast.
  const rocketSeen = new Map();
  const rocketHits = [];
  const hordeHits = [];
  let pendingRocketHit = null;
  // Spawn data must be captured at the REAL spawn moment. Sampling the array once per frame missed
  // every rocket that was created and detonated inside the same update() — that is what produced
  // 27% F_TELEMETRY_UNCERTAIN in the first classified run. Wrapping push() on the live array closes
  // that hole; the array identity changes on reset()/_enterEndless(), so the hook is re-armed
  // whenever a new array appears.
  const noteRocket = r => {
    if (rocketSeen.has(r)) return;
    const d0 = Math.hypot(r.pos.x - game.player.pos.x, r.pos.y - game.player.pos.y);
    rocketSeen.set(r, {
      t0: +game.timeAlive.toFixed(2), d0: +d0.toFixed(1), speed: +Number(r.speed).toFixed(0),
      homing: +Number(r.h || 0).toFixed(2), blast: r.blast,
      flightSeconds: +(d0 / Math.max(1, r.speed)).toFixed(2),
    });
  };
  let hookedArray = null;
  const trackRockets = () => {
    const live = game.airstrikeRockets;
    if (live && live !== hookedArray) {
      hookedArray = live;
      const oPush = Array.prototype.push;
      live.push = function (...items) { for (const it of items) { try { noteRocket(it); } catch (_) {} } return oPush.apply(this, items); };
    }
    for (const r of (live || [])) noteRocket(r);
  };
  const freeArcs = () => {                       // how many of 8 escape arcs are clear of threats
    const p = game.player.pos; const blocked = new Set();
    const mark = (x, y, rad) => {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d > 260) return;
      blocked.add(((Math.round(Math.atan2(y - p.y, x - p.x) / (Math.PI / 4)) % 8) + 8) % 8);
      void rad;
    };
    for (const e of game.enemies) if (e && e.hp > 0 && e.pos) mark(e.pos.x, e.pos.y, e.radius);
    for (const z of (game.lightningZones || [])) mark(z.pos.x, z.pos.y, z.radius);
    for (const z of (game.bossLavaZones || [])) mark(z.pos.x, z.pos.y, z.radius || 40);
    for (const r of (game.airstrikeRockets || [])) mark(r.pos.x, r.pos.y, r.blast);
    return 8 - blocked.size;
  };
  const concurrent = () => ({
    lightning: (game.lightningZones || []).length,
    lava: (game.bossLavaZones || []).length,
    rockets: (game.airstrikeRockets || []).length,
    titan: !!game.titanBoss, annihilator: !!game.annihilatorBoss,
    gunship: !!game._gunship, bossRush: !!game._bossRush, acidRain: !!game.acidRain,
    enemies300: (game.enemies || []).filter(e => e && e.hp > 0 && e.pos &&
      Math.hypot(e.pos.x - game.player.pos.x, e.pos.y - game.player.pos.y) < 300).length,
  });

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
    const p = game.player.pos; let vx = 0, vy = 0, n = 0, touching = 0, nearest = Infinity;
    for (const e of game.enemies) {
      if (!e || e.hp <= 0 || !e.pos) continue;
      const dx = p.x - e.pos.x, dy = p.y - e.pos.y, d2 = dx * dx + dy * dy;
      if (d2 < 1) continue;
      const d = Math.sqrt(d2);
      if (d < nearest) nearest = d;
      if (d < (e.radius || 14) + 16 + 8) touching++;      // in or entering contact range
      if (d2 > radius * radius) continue;
      const w = 1 / d;
      vx += (dx / d) * w; vy += (dy / d) * w; n++;
    }
    return { vx, vy, n, touching, nearest };
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
  // ── §8 EVENT-OVERLAP MATRIX ───────────────────────────────────────────────────────────────
  // Each major threat system is sampled as on/off; contiguous on-samples become intervals. Damage
  // is stamped with the set of systems active at that instant, so an overlap window can be charged
  // with what it actually cost. The question this answers: does any single system know it is piling
  // onto another, or does each schedule itself in isolation and the player pay the sum?
  const SYSTEMS = {
    airstrike:  () => (game.airstrikeRockets || []).length > 0 || (game.airstrikeShips || []).length > 0,
    lightning:  () => (game.lightningZones || []).length > 0 || (game._stormActive || 0) > 0,
    titan:      () => !!game.titanBoss,
    annihilator:() => !!game.annihilatorBoss,
    gunship:    () => !!game._gunship,
    bossTrail:  () => (game.bossTrails || []).length > 0,
    bossRush:   () => !!game._bossRush,
    acidRain:   () => !!game.acidRain,
    groundHaz:  () => (game.bossLavaZones || []).length > 0 || (game._iceFields || []).length > 0 ||
                      (game._voidRifts || []).length > 0 || (game.cybermoteMines || []).length > 0,
    densePeak:  () => (game.enemies || []).filter(e => e && e.hp > 0 && e.pos &&
                      Math.hypot(e.pos.x - game.player.pos.x, e.pos.y - game.player.pos.y) < 300).length >= 25,
  };
  const sysOn = {}, sysTime = {}, pairTime = {}, pairDmg = {};
  for (const k in SYSTEMS) { sysOn[k] = false; sysTime[k] = 0; }
  let activeNow = [];
  const sampleSystems = dtSec => {
    activeNow = [];
    for (const k in SYSTEMS) {
      let on = false; try { on = !!SYSTEMS[k](); } catch (_) {}
      sysOn[k] = on;
      if (on) { sysTime[k] += dtSec; activeNow.push(k); }
    }
    for (let i = 0; i < activeNow.length; i++)
      for (let j = i + 1; j < activeNow.length; j++) {
        const key = activeNow[i] + '+' + activeNow[j];
        pairTime[key] = (pairTime[key] || 0) + dtSec;
      }
  };
  const chargeOverlap = lost => {
    for (let i = 0; i < activeNow.length; i++)
      for (let j = i + 1; j < activeNow.length; j++) {
        const key = activeNow[i] + '+' + activeNow[j];
        pairDmg[key] = (pairDmg[key] || 0) + lost;
      }
  };

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
  trackRockets();          // arm the push hook before the first frame
  for (let f = 0; f < MAXS * 60; f++) {
    vclock += 1000 / 60;
    if (game.upgradeUI)  { try { game.selectUpgrade(0); }  catch (_) { game.upgradeUI = null; } }
    if (game.mutationUI) { try { game.selectMutation(0); } catch (_) { game.mutationUI = null; } }
    if (game._postArenaChoice) { try { game._selectPostArenaChoice(0); } catch (_) { game._postArenaChoice = null; } }

    const tv = threatVector(340);
    // DASH AS THE ESCAPE TOOL (2026-07-26). The first version only dashed on raw crowd size, which
    // is not what a competent player reacts to — they dash to BREAK CONTACT. Dash carries i-frames
    // and passes through bodies, so it is the counterplay the encirclement design intends. Without
    // this the harness records "cornered" moments the player could actually have escaped, which is
    // exactly what inflated the earlier unavoidable share.
    const mustBreak = tv.touching >= 2 || tv.nearest < 46;
    const canDash = (game.player.dashCooldown || 0) <= 0;
    if (skill === 'expert') {
      const a = bestOpenArc();
      setDir(a.x, a.y, canDash && (mustBreak || tv.n >= 6));
    } else {
      const len = Math.hypot(tv.vx, tv.vy) || 1;
      setDir(tv.vx / len, tv.vy / len, canDash && (mustBreak || tv.n >= 8));
    }

    trackRockets();
    try { game.update(dt, input); } catch (e) { break; }

    moveDist += Math.hypot(game.player.pos.x - prev.x, game.player.pos.y - prev.y);
    prev = { x: game.player.pos.x, y: game.player.pos.y };
    if (f % 15 === 0) { sample(); sampleSystems(0.25); }
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
  const pct=(a,q)=>{ if(!a.length) return null; const b=a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(b.length*q))]; };
  const mean=a=>a.length? +(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2):null;
  const dist=a=>({mean:mean(a),median:pct(a,.5),p75:pct(a,.75),p90:pct(a,.90),p95:pct(a,.95),p99:pct(a,.99),max:a.length?Math.max(...a):null});

  // ── §7 airstrike fairness classification. These rockets have NO impact telegraph, so the dodge
  // window is the flight time and the escape requirement is lateral clearance of PLAYER_RADIUS+blast.
  const PR2 = 16;
  const classify = h => {
    if (h.spawnDistance == null || h.flightSeconds == null) return 'F_TELEMETRY_UNCERTAIN';
    const clearance = PR2 + (h.blast || 46);
    const spd = h.playerSpeed || 230;
    const lateralSeconds = clearance / spd;
    if (h.spawnDistance <= clearance * 1.2) return 'E_SPAWNED_ON_PLAYER';
    // A homing rocket cannot be OUTRUN when it matches the player's speed, but it can still be
    // side-stepped: the rocket re-aims, so the player needs roughly twice the lateral window. The
    // earlier rule flagged every same-speed homing rocket as unavoidable regardless of how long it
    // was in the air, which mislabelled 249px+ gunship shots that had a full second of flight.
    const needed = h.homing > 0 ? lateralSeconds * 2 : lateralSeconds;
    if (h.flightSeconds < needed) return 'D_UNAVOIDABLE_TIMING';
    if (h.freeArcs === 0) return 'C_UNAVOIDABLE_OVERLAP';
    if (h.freeArcs <= 2 || h.concurrent.rockets >= 6) return 'B_PRESSURED_BUT_FAIR';
    return 'A_AVOIDABLE';
  };
  for (const h of rocketHits) h.klass = classify(h);
  const klassCount = {};
  for (const h of rocketHits) klassCount[h.klass] = (klassCount[h.klass] || 0) + 1;
  const overlapCount = {};
  for (const h of rocketHits) {
    const c = h.concurrent || {};
    for (const k of ['lightning','lava','titan','annihilator','gunship','bossRush','acidRain'])
      if (c[k]) overlapCount[k] = (overlapCount[k] || 0) + 1;
  }
  // XP identity
  const lvlThresholds = (() => { let t = 0; for (let l = 1; l < game.player.level; l++) t += Math.round(8 + l * 5 + l * l * 1.05); return t; })();
  const xpOnGround = (game.xpShards?.active || []).reduce((a, sh) => a + (sh.value || sh.v || 0), 0);
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
    censored: died == null,
    observationSeconds: +end.toFixed(2),
    damagePerSecond: +(totalDmg / Math.max(1, end)).toFixed(2),
    perReason: Object.fromEntries(Object.keys({ ...dmg, ...accepted, ...rejected }).map(k => [k, {
      requested: +(requested[k] || 0).toFixed(1), accepted: +(dmg[k] || 0).toFixed(1),
      landedEvents: accepted[k] || 0, rejectedEvents: rejected[k] || 0,
      dmgPerEvent: accepted[k] ? +((dmg[k] || 0) / accepted[k]).toFixed(2) : 0,
      eventsPerMin: +((accepted[k] || 0) / minutes).toFixed(1),
      dmgPerMin: +((dmg[k] || 0) / minutes).toFixed(1),
      share: +(100 * (dmg[k] || 0) / (totalDmg || 1)).toFixed(1),
      firstHit: firstHit[k] ?? null, lastHit: lastHit[k] ?? null,
    }])),
    unattributed: Object.keys(dmg).filter(k => k.startsWith('other:')),
    densityDist: { d100: dist(dens.d100), d200: dist(dens.d200), d300: dist(dens.d300) },
    overlapMatrix: (() => {
      const dur = Object.fromEntries(Object.entries(sysTime).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(1)]));
      const pairs = Object.entries(pairTime).filter(([, v]) => v >= 1)
        .sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([k, v]) => [k, { seconds: +v.toFixed(1), pctOfRun: +(100 * v / Math.max(1, end)).toFixed(1),
                               damage: +(pairDmg[k] || 0).toFixed(1) }]);
      return { systemActiveSeconds: dur, topOverlaps: Object.fromEntries(pairs) };
    })(),
    hordeFairness: (() => {
      const k = {}; for (const h of hordeHits) k[h.klass] = (k[h.klass] || 0) + 1;
      const arcs = hordeHits.map(h => h.freeArcs), crowd = hordeHits.map(h => h.touching);
      const unavoid = (k.C_CORNERED || 0) + (k.D_CANNOT_DISENGAGE || 0);   // dash-ready excluded
      return { events: hordeHits.length, classes: k,
        unavoidablePct: hordeHits.length ? +(100 * unavoid / hordeHits.length).toFixed(1) : null,
        freeArcs: dist(arcs), touchingBodies: dist(crowd),
        outrunnable: hordeHits.filter(h => h.canOutrun === true).length,
        notOutrunnable: hordeHits.filter(h => h.canOutrun === false).length,
        sample: hordeHits.slice(0, 3) };
    })(),
    airstrikeFairness: { hits: rocketHits.length, classes: klassCount,
      unavoidablePct: rocketHits.length ? +(100 * ((klassCount.C_UNAVOIDABLE_OVERLAP||0)+(klassCount.D_UNAVOIDABLE_TIMING||0)+(klassCount.E_SPAWNED_ON_PLAYER||0)) / rocketHits.length).toFixed(1) : null,
      overlapAtHit: overlapCount,
      // #4 gunship check: do the 60%-homing W3 pods also spawn point-blank the way the airstrike
      // salvo did? Reported separately by homing type over EVERY rocket seen, not just the ones
      // that connected, so a near-miss point-blank spawn still shows up.
      spawnDistanceByType: (() => {
        const g = { airstrike: [], gunshipHoming: [] };
        for (const v of rocketSeen.values()) (v.homing > 0 ? g.gunshipHoming : g.airstrike).push(v.d0);
        const summ = a => a.length ? { n: a.length, min: Math.min(...a), median: dist(a).median, max: Math.max(...a) } : { n: 0 };
        return { airstrike: summ(g.airstrike), gunshipHoming: summ(g.gunshipHoming) };
      })(),
      sample: rocketHits.slice(0, 3),
      unfairSample: rocketHits.filter(h => /^[CDE]_/.test(h.klass)).slice(0, 8) },
    xpAccounting: { collected: xpCollected, generated: xpGenerated, onGround: +xpOnGround.toFixed(0),
      pickups, spentInLevels: lvlThresholds, currentBar: game.player.xp, level: game.player.level,
      collectedPerMin: +(xpCollected / minutes).toFixed(1),
      identityCollected: xpCollected - (lvlThresholds + game.player.xp),
      identityGenerated: xpGenerated - (xpCollected + xpOnGround) },
    progression: { levels: levelTimeline.slice(0, 30),
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
