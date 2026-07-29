// BATCH 2 — MAJOR EVENTS: ACID RAIN, THE EVENT ARBITER, CHAOS MEGA BOSS PACING
// ------------------------------------------------------------------------------------------------
// Batch 2 adds three things that can only be proven by driving the real Game class, because all
// three are about WHEN something is allowed to happen rather than about what it looks like:
//
//   * ACID RAIN is no longer an inline block inside Game.update. It is a class in
//     js/game/AcidRain.js with its own phase machine (idle -> warning -> raining -> fading -> idle),
//     its own bounded pools and its own eligibility rule. A phase machine that can be entered
//     twice, or that leaves puddles behind, or that paints a puddle onto a deck the player is not
//     standing on, is exactly the class of defect this file exists to catch.
//
//   * THE MAJOR-EVENT ARBITER is the single owner of the screen. Only one of bossRush, acidRain,
//     airstrike, laserGrid, vault and megaBoss may hold it at a time. Boss Rush already showed why
//     that matters — the player is locked inside a ring for three minutes and cannot walk away from
//     anything that opens on top of it — but the same reasoning applies to every pair, so every
//     ordered pair is tested here, in both directions.
//
//   * CHAOS AMBIENT MEGA BOSS PACING. Before Batch 2 the ambient Titan scheduler armed at 40s and
//     re-armed 55s after each clear, so a Chaos run met its first ambient mega boss before the
//     player had a build. The new contract is 08:00 / 16:00 / 24:00 for the first, second and third.
//     Boss Rush bosses and scripted bosses are NOT ambient mega bosses and must not count against
//     that budget — the rush spawning its own bosses is the event working, not a violation.
//
// This harness never weakens an assertion to make production pass. Where the contract genuinely
// leaves a choice to the implementation (whether stats() exposes puddle centres, whether the module
// declares its own caps) the harness detects which shape it got, asserts the strongest statement
// that shape supports, and says on stdout which branch it took.
//
//   node tools/qa/batch2_events_regression.mjs
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
register('./strip-v-loader.mjs', import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { installEnv, muteConsole, makeCtx } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

// Deterministic RNG, so a failure reported by this file can be reproduced by running it again.
// Same generator the Boss Rush harness uses, for the same reason.
const mul = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Virtual clock. Nothing here may depend on wall-clock time: the pacing block runs twenty-seven
// simulated minutes and would otherwise be at the mercy of how fast the machine is.
let vclock = 0;
globalThis.performance = { now: () => vclock };
const RD = globalThis.Date;
globalThis.Date = class extends RD { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };

const u0 = muteConsole();
const { Game } = await import(pathToFileURL(path.join(ROOT, 'js/game/Game.js')).href);
const { Enemy } = await import(pathToFileURL(path.join(ROOT, 'js/entities/Enemy.js')).href);
// The AcidRain module is imported for its declared caps. It is imported defensively because a
// MISSING module must be reported as a named failure, not as a load-time stack trace that says
// nothing about which contract was broken.
const ACID_PATH = path.join(ROOT, 'js/game/AcidRain.js');
let ACID_MOD = null, ACID_IMPORT_ERR = '';
try { ACID_MOD = await import(pathToFileURL(ACID_PATH).href); }
catch (e) { ACID_IMPORT_ERR = e && e.message ? e.message : String(e); }
const CTX = makeCtx();
u0();

let pass = 0, fail = 0;
const T = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else      { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};
const finite = (o) => o && Number.isFinite(o.x) && Number.isFinite(o.y);
const clean  = (g) => finite(g.player && g.player.pos) && finite(g.camera);
const n0     = (v) => (Number.isFinite(v) ? v : 0);

// ── acid rain access ────────────────────────────────────────────────────────────────────────────
// A missing system must produce ordinary FAIL lines on the assertions that depend on it, not a
// crash that hides every later block. The stub answers every call in the contract with a value that
// cannot be mistaken for a passing one — 'missing' is not a legal phase name.
const NULL_SYS = {
  reset() {}, update() {}, draw() {}, canStart() { return false; }, requestStart() { return false; },
  forceEnd() {}, onDeckChanged() {}, stats() { return {}; },
  get active() { return false; }, get phase() { return 'missing'; },
};
const sysOf   = (g) => (g && g.acidRainSystem) || NULL_SYS;
const ars     = (g) => { try { const s = sysOf(g).stats(); return s && typeof s === 'object' ? s : {}; } catch (_) { return {}; } };
const phaseOf = (g) => { try { return sysOf(g).phase; } catch (_) { return 'threw'; } };
const canNow  = (g) => { try { return sysOf(g).canStart() === true; } catch (_) { return false; } };
const LEGAL_PHASES = ['idle', 'warning', 'raining', 'fading'];

// Elapsed time inside the CURRENT mode, measured the way production measures it. Chaos counts from
// _chaosStartedAt and Endless from _endlessStartedAt, and both are snapshots of timeAlive — the one
// clock that stops while a card panel is open. Wall time or raw frame counts would make the pacing
// assertions disagree with the scheduler they are testing.
function modeTime(g) {
  if (g._chaosMode) return Math.max(0, g.timeAlive - Math.max(0, g._chaosStartedAt || 0));
  return Math.max(0, g.timeAlive - (g._endlessStartedAt || 0));
}

// Live AMBIENT mega bosses. Boss Rush spawns mega bosses of its own and scripted encounters place
// theirs directly; neither is ambient, so neither may count against the 08:00 / 16:00 / 24:00
// budget. The rush is excluded by only counting while no rush is running, and anything a spawner
// marked as its own is excluded by flag.
const TITANS = (Enemy && Enemy.CHAOS_TITANS) || new Set();
function ambientTitansAlive(g) {
  let n = 0;
  for (const e of (g.enemies || [])) {
    if (!e || e.hp <= 0) continue;
    if (!e.isMegaBoss || !TITANS.has || !TITANS.has(e.enemyType)) continue;
    if (e._bossRushSpawn || e._rushSpawn || e.scripted || e._scripted) continue;
    n++;
  }
  return n;
}

// ── run driving ─────────────────────────────────────────────────────────────────────────────────
const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };

function newGame(mode, seed = 1234) {
  vclock = 0;
  Math.random = mul(seed);
  const un = muteConsole();
  try { globalThis.localStorage.clear(); } catch (_) {}
  const g = new Game();
  g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.gameState = 'playing';
  g.reset();
  if (mode === 'chaos') { g._beginChaosRun(); g._chaosEntryGraceT = 0; } else { g._enterEndless(); }
  un();
  return g;
}

// The player's HP is pinned every frame. SURVIVAL IS NOT WHAT ANY ASSERTION IN THIS FILE MEASURES:
// the pacing block runs twenty-seven simulated minutes of Chaos, and a death at minute nine would
// truncate the run and turn "the third ambient mega boss arrives at or after 24:00" into a statement
// about how long a headless player survives. Damage is proven elsewhere
// (player_damage_gate_regression.mjs, weapon_be_boss_damage_regression.mjs).
// The three panels are answered here for the reason the deck harness answers them: an unanswered
// level-up card freezes timeAlive, and a frozen clock stalls every scheduler under test.
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

// ── shape detection ─────────────────────────────────────────────────────────────────────────────
// The contract lists stats() as returning counts. If the implementation ALSO exposes the puddle
// centres — under any of the obvious names, or as a live array on the instance — then the strongest
// available assertion is that every centre stands on walkable floor of the ACTIVE deck, so that is
// what gets asserted. If it does not, the count plus the damage-tick assertions are what the
// exposed surface supports, and the harness says so on stdout instead of quietly asserting less.
function puddleCentres(g) {
  const s = sysOf(g), st = ars(g);
  const cands = [st.puddleList, st.puddlePositions, st.puddleCentres, st.puddlePoints,
                 s.puddleList, s.puddles, s._puddles];
  for (const c of cands) {
    if (!Array.isArray(c) || c.length === 0) continue;
    const p0 = c[0];
    const rx = p0 && (Number.isFinite(p0.x) ? p0.x : (p0.pos && p0.pos.x));
    if (!Number.isFinite(rx)) continue;
    return c.map(p => ({ x: Number.isFinite(p.x) ? p.x : p.pos.x, y: Number.isFinite(p.y) ? p.y : p.pos.y }));
  }
  return null;
}

// Caps are read from the module when it declares them, so this file cannot drift from the numbers
// production actually enforces. When the module declares nothing, the fallbacks below are used, and
// THOSE ARE THE CONTRACT CEILINGS agreed for Batch 2: streaks <= 400, puddles <= 40,
// particles <= 600. A pool that exceeds them is a defect whether or not the module names them.
const FALLBACK_CAPS = { streaks: 400, puddles: 40, particles: 600 };
function declaredCap(kind) {
  if (!ACID_MOD) return null;
  const want = { streaks: /streak/i, puddles: /puddle/i, particles: /particle/i }[kind];
  let best = null;
  const take = (v) => { if (typeof v === 'number' && Number.isFinite(v) && v > 0 && (best == null || v < best)) best = v; };
  for (const [k, v] of Object.entries(ACID_MOD)) {
    if (typeof v === 'number') { if (want.test(k) && /max|cap|limit/i.test(k)) take(v); continue; }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const containerIsCaps = /cap|max|limit/i.test(k);
      for (const [k2, v2] of Object.entries(v)) {
        if (typeof v2 !== 'number') continue;
        if (want.test(k2) && (containerIsCaps || /max|cap|limit/i.test(k2))) take(v2);
      }
    }
  }
  return best;
}

// Waits for acid rain eligibility by running the real loop, never by writing a timer. "Eligible"
// means canStart() said yes, or the scheduler already opened a storm on its own — the second case
// proves eligibility just as well as the first and must not be mistaken for a timeout. The polling
// chunk is deliberately short so that a storm the scheduler opens by itself is caught in its
// warning phase rather than halfway through the rain.
function waitEligible(g, maxSeconds = 900, sampler = null) {
  const chunk = 5;
  for (let f = 0; f < maxSeconds * 60; f += chunk) {
    step(g, chunk, sampler);
    if (canNow(g) || sysOf(g).active) return modeTime(g);
  }
  return -1;
}

// Runs frames until the storm machine is idle again, bounded. Returns false on timeout, which is
// itself worth naming: a phase machine that never returns to idle is stuck.
function runUntilIdle(g, maxSeconds, sampler) {
  const chunk = 15;
  for (let f = 0; f < maxSeconds * 60; f += chunk) {
    step(g, chunk, sampler);
    if (phaseOf(g) === 'idle') return true;
  }
  return phaseOf(g) === 'idle';
}

// Brings the run to the START of exactly one storm and reports how it opened.
//
// The scheduler opens storms by itself the moment they become eligible, so the harness cannot
// simply wait and then call requestStart(): most of the time the scheduler would already have
// opened one, the "before" counters would be snapshotted halfway into that storm, and every delta
// assertion would measure zero. That is a harness artefact, not a defect. Two things make this
// deterministic. First, any storm still running is drained before the wait starts. Second,
// eligibility is checked BEFORE each Game.update rather than after it, so when the machine is idle
// and eligible the harness gets to call requestStart() with no update in between and cannot lose
// the frame to the scheduler. When the scheduler does win anyway (it starts the storm inside the
// same update that made it eligible) that is reported as 'scheduler' and the storm is watched in
// exactly the same way — it is the same event either way. The snapshot returned is always the last
// observation taken while the machine was still idle.
function openStormFromIdle(g, maxSeconds = 900, sampler = null) {
  if (sysOf(g).active) runUntilIdle(g, 240, sampler);
  const snapNow = () => { const s = ars(g); return { warn: n0(s.warningsShown), started: n0(s.startedCount), ticks: n0(s.puddleDamageTicks) }; };
  let snap = snapNow();
  for (let f = 0; f < maxSeconds * 60; f++) {
    if (sysOf(g).active) return { how: 'scheduler', snap };
    snap = snapNow();
    if (canNow(g)) {
      let ok = false;
      try { ok = sysOf(g).requestStart() === true; } catch (_) { ok = false; }
      return { how: ok ? 'harness' : 'refused', snap };
    }
    step(g, 1, sampler);
  }
  return { how: 'timeout', snap };
}
const STORM_OPENED = (o) => o.how === 'harness' || o.how === 'scheduler';

// One sampler shape is shared by every block so that no block can accidentally measure a different
// thing from the block next to it.
function freshState(checkCentres) {
  return {
    phases: [], lastPhase: null, startedCount: 0, overlapStarts: 0, warnMax: 0,
    maxStreaks: 0, maxPuddles: 0, maxParticles: 0, maxImpacts: 0,
    rainFrames: 0, puddleSeenWhileRaining: 0,
    ticksAtRainStart: 0, ticksGrewWhileRaining: false, ticksAtIdle: null, ticksLater: null,
    centresSeen: 0, centresOffFloor: 0, badCentres: [], nanFrames: 0, checkCentres,
  };
}
function makeSampler(state) {
  return (g) => {
    const st = ars(g), ph = phaseOf(g);
    if (state.phases[state.phases.length - 1] !== ph) state.phases.push(ph);
    state.maxStreaks   = Math.max(state.maxStreaks,   n0(st.streaks));
    state.maxPuddles   = Math.max(state.maxPuddles,   n0(st.puddles));
    state.maxParticles = Math.max(state.maxParticles, n0(st.particles));
    state.maxImpacts   = Math.max(state.maxImpacts,   n0(st.impacts));
    state.warnMax      = Math.max(state.warnMax,      n0(st.warningsShown));
    // Two storms may never overlap. The observable form of that rule is: startedCount only ever
    // moves while the machine is idle, because a storm opening on top of a running one would have
    // to increment the counter from a non-idle phase.
    const started = n0(st.startedCount);
    if (started > state.startedCount && state.lastPhase !== 'idle' && state.lastPhase !== null) state.overlapStarts++;
    state.startedCount = Math.max(state.startedCount, started);
    if (ph === 'raining') {
      state.rainFrames++;
      state.puddleSeenWhileRaining = Math.max(state.puddleSeenWhileRaining, n0(st.puddles));
      if (n0(st.puddleDamageTicks) > state.ticksAtRainStart) state.ticksGrewWhileRaining = true;
      if (state.checkCentres) {
        const ps = puddleCentres(g);
        if (ps) {
          state.centresSeen += ps.length;
          const wm = g._walkMode();
          for (const p of ps) {
            let ok = true;
            try { ok = g.mapManager.isWalkableFootprint(p.x, p.y, 12, wm) === true; } catch (_) { ok = false; }
            if (!ok) {
              state.centresOffFloor++;
              if (state.badCentres.length < 3) state.badCentres.push(`(${Math.round(p.x)},${Math.round(p.y)}) deck=${wm}`);
            }
          }
        }
      }
    }
    // Cleanup means "back to idle". The reference is taken on the first idle frame after a storm,
    // and every idle frame after that must report the same number: the puddles are gone, so nothing
    // can still be ticking damage from them.
    if (ph === 'idle' && state.lastPhase && state.lastPhase !== 'idle') state.ticksAtIdle = n0(st.puddleDamageTicks);
    if (ph === 'idle' && state.ticksAtIdle != null) state.ticksLater = n0(st.puddleDamageTicks);
    if (!clean(g)) state.nanFrames++;
    state.lastPhase = ph;
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 0. THE BATCH 2 SURFACE EXISTS ===');
T('js/game/AcidRain.js is in the tree', existsSync(ACID_PATH));
T('js/game/AcidRain.js imports cleanly', ACID_MOD != null, ACID_IMPORT_ERR);
{
  const g = newGame('chaos', 11);
  const s = g.acidRainSystem;
  T('game.acidRainSystem exists', !!s, 'undefined on the Game instance');
  for (const m of ['reset', 'update', 'draw', 'canStart', 'requestStart', 'forceEnd', 'onDeckChanged', 'stats'])
    T(`acidRainSystem.${m}() is a function`, typeof (s || {})[m] === 'function');
  T('acidRainSystem.phase is a legal phase name', LEGAL_PHASES.includes(phaseOf(g)), `got ${phaseOf(g)}`);
  T('acidRainSystem.active is a boolean', typeof sysOf(g).active === 'boolean');
  const st = ars(g);
  for (const k of ['phase', 'timeLeft', 'streaks', 'impacts', 'puddles', 'particles',
                   'puddleDamageTicks', 'warningsShown', 'startedCount', 'nextEligibleIn'])
    T(`stats() reports ${k}`, Object.prototype.hasOwnProperty.call(st, k), `keys: ${Object.keys(st).join(',') || 'none'}`);
  for (const m of ['canStartMajorEvent', 'startMajorEvent', 'endMajorEvent'])
    T(`game.${m}() is a function`, typeof g[m] === 'function');
  T('game._activeMajorEvent starts null', g._activeMajorEvent == null, `got ${String(g._activeMajorEvent)}`);
  T('game._majorEventGraceT starts at zero', n0(g._majorEventGraceT) === 0, `got ${g._majorEventGraceT}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. ACID RAIN — ELIGIBILITY, PHASES, CLEANUP ===');
let centreBranchReported = false;
for (const mode of ['endless', 'chaos']) {
  console.log(`\n-- ${mode.toUpperCase()} --`);
  const g = newGame(mode, mode === 'chaos' ? 4242 : 2424);

  // Not eligible at run start. A storm in the first seconds is the defect this pins: the player has
  // no build yet and cannot answer a screen-wide hazard.
  const canAtStart = canNow(g);
  T(`${mode}: acid rain is NOT eligible at run start`, canAtStart === false, `canStart()=${canAtStart}`);
  T(`${mode}: acid rain is idle at run start`, phaseOf(g) === 'idle', `phase ${phaseOf(g)}`);
  T(`${mode}: acid rain is inactive at run start`, sysOf(g).active === false);
  T(`${mode}: stats() reports a positive nextEligibleIn at run start`, n0(ars(g).nextEligibleIn) > 0,
    `nextEligibleIn=${ars(g).nextEligibleIn}`);
  T(`${mode}: no storm has ever started at run start`,
    n0(ars(g).startedCount) === 0 && n0(ars(g).warningsShown) === 0,
    `started=${ars(g).startedCount} warnings=${ars(g).warningsShown}`);

  const preState = freshState(false);
  const tEligible = waitEligible(g, 900, makeSampler(preState));
  T(`${mode}: acid rain becomes eligible after the minimum runtime`, tEligible >= 0, 'never became eligible within 15:00');
  T(`${mode}: eligibility is not reached instantly`, tEligible > 1, `eligible at ${tEligible.toFixed(1)}s`);
  console.log(`    eligible at ${tEligible.toFixed(1)}s of ${mode} time`);

  // ── one storm, watched end to end ────────────────────────────────────────────────────────────
  const s1 = freshState(true);
  const open1 = openStormFromIdle(g, 900);
  T(`${mode}: a storm opens once the run is eligible`, STORM_OPENED(open1), `openStorm=${open1.how}`);
  T(`${mode}: requestStart() is honoured at an idle, eligible moment`, open1.how !== 'refused',
    `openStorm=${open1.how} phase ${phaseOf(g)}`);
  console.log(`    the watched storm was opened by the ${open1.how}`);
  s1.ticksAtRainStart = open1.snap.ticks;
  const warnBefore = open1.snap.warn, startedBefore = open1.snap.started;
  const finished = runUntilIdle(g, 240, makeSampler(s1));
  step(g, 120, makeSampler(s1));      // idle frames after cleanup, so "nothing keeps ticking" is observable
  T(`${mode}: the storm returns to idle on its own`, finished, `stuck in ${phaseOf(g)}`);

  const seq = s1.phases.filter((p, i, a) => p !== a[i - 1]);
  const wanted = ['warning', 'raining', 'fading', 'idle'];
  // The recording starts wherever the sampler first looked, so the assertion is that the four
  // phases appear in the contract order with nothing else between them.
  const firstWarn = seq.indexOf('warning');
  const tail = firstWarn >= 0 ? seq.slice(firstWarn) : seq;
  T(`${mode}: phase order is idle -> warning -> raining -> fading -> idle`,
    firstWarn >= 0 && tail.length === wanted.length && wanted.every((p, i) => tail[i] === p),
    `observed ${seq.join(' -> ') || 'nothing'}`);

  const warnAfter = Math.max(s1.warnMax, n0(ars(g).warningsShown));
  const startedAfter = Math.max(s1.startedCount, n0(ars(g).startedCount));
  T(`${mode}: the warning fires exactly once for the storm`, warnAfter - warnBefore === 1,
    `warningsShown ${warnBefore} -> ${warnAfter}`);
  T(`${mode}: startedCount increments by exactly one for the storm`, startedAfter - startedBefore === 1,
    `startedCount ${startedBefore} -> ${startedAfter}`);
  T(`${mode}: no second storm opened on top of the first`, s1.overlapStarts === 0,
    `${s1.overlapStarts} starts from a non-idle phase`);
  T(`${mode}: the storm actually rained`, s1.rainFrames > 0, `${s1.rainFrames} raining frames`);
  T(`${mode}: puddles appear while it rains`, s1.puddleSeenWhileRaining > 0,
    `max puddles while raining ${s1.puddleSeenWhileRaining}`);

  // Puddle placement, in whichever of the two shapes the implementation exposes.
  if (s1.centresSeen > 0) {
    if (!centreBranchReported) { console.log('    puddle centres ARE exposed — asserting walkable-floor placement'); centreBranchReported = true; }
    T(`${mode}: every puddle centre stands on walkable floor of the ACTIVE deck`, s1.centresOffFloor === 0,
      `${s1.centresOffFloor} of ${s1.centresSeen} samples off floor: ${s1.badCentres.join(' | ')}`);
  } else {
    if (!centreBranchReported) { console.log('    puddle centres are NOT exposed — asserting counts and damage ticks'); centreBranchReported = true; }
    T(`${mode}: puddle damage ticks accumulate while it rains`, s1.ticksGrewWhileRaining === true,
      `ticks stayed at ${s1.ticksAtRainStart}`);
  }
  T(`${mode}: puddle damage ticks stop once the storm is cleaned up`,
    s1.ticksAtIdle != null && s1.ticksLater === s1.ticksAtIdle,
    `at idle ${s1.ticksAtIdle} -> later ${s1.ticksLater}`);
  T(`${mode}: puddle damage ticks never go backwards`, n0(ars(g).puddleDamageTicks) >= s1.ticksAtRainStart,
    `${s1.ticksAtRainStart} -> ${ars(g).puddleDamageTicks}`);

  // Nothing survives the storm.
  const after = ars(g);
  T(`${mode}: the storm leaves no puddles, streaks, impacts or particles`,
    n0(after.puddles) === 0 && n0(after.streaks) === 0 && n0(after.impacts) === 0 && n0(after.particles) === 0,
    `puddles=${after.puddles} streaks=${after.streaks} impacts=${after.impacts} particles=${after.particles}`);
  T(`${mode}: the system is inactive once the storm is over`, sysOf(g).active === false && phaseOf(g) === 'idle',
    `phase ${phaseOf(g)} active ${sysOf(g).active}`);
  T(`${mode}: no NaN in player or camera across the storm`, s1.nanFrames === 0 && clean(g), `${s1.nanFrames} bad frames`);

  // ── a second storm is legal later in the same run ────────────────────────────────────────────
  const s2 = freshState(false);
  const open2 = openStormFromIdle(g, 600, makeSampler(s2));
  T(`${mode}: acid rain becomes eligible again later in the same run`, open2.how !== 'timeout',
    `openStorm=${open2.how}`);
  T(`${mode}: a second storm can legally occur in the same run`, STORM_OPENED(open2), `openStorm=${open2.how}`);
  const s2b = freshState(false);
  runUntilIdle(g, 240, makeSampler(s2b));
  T(`${mode}: the second storm also cleans up completely`,
    n0(ars(g).puddles) === 0 && n0(ars(g).streaks) === 0 && n0(ars(g).particles) === 0 && n0(ars(g).impacts) === 0,
    `puddles=${ars(g).puddles} streaks=${ars(g).streaks} particles=${ars(g).particles} impacts=${ars(g).impacts}`);
  T(`${mode}: two storms never overlapped across the whole run`, s2.overlapStarts === 0 && s2b.overlapStarts === 0,
    `${s2.overlapStarts + s2b.overlapStarts} starts from a non-idle phase`);
  // The scheduler opens storms of its own accord, so the run total is not the harness's to predict.
  // What IS fixed is the relationship between the two counters: one warning per storm, never two,
  // never none — and that at least two storms have now run inside this single run.
  T(`${mode}: every storm in the run showed exactly one warning`,
    n0(ars(g).warningsShown) === n0(ars(g).startedCount),
    `warningsShown=${ars(g).warningsShown} startedCount=${ars(g).startedCount}`);
  T(`${mode}: at least two storms ran in the same run`, n0(ars(g).startedCount) >= 2,
    `startedCount=${ars(g).startedCount}`);

  // ── forceEnd() is a hard stop, not a pause ───────────────────────────────────────────────────
  const open3 = openStormFromIdle(g, 600);
  T(`${mode}: a third storm could be opened for the forceEnd test`, STORM_OPENED(open3), `openStorm=${open3.how}`);
  step(g, 120);
  try { sysOf(g).forceEnd(); } catch (_) {}
  step(g, 2);
  const fe = ars(g);
  T(`${mode}: forceEnd() returns the machine to idle`, phaseOf(g) === 'idle' && sysOf(g).active === false,
    `phase ${phaseOf(g)}`);
  T(`${mode}: forceEnd() clears every pool`,
    n0(fe.puddles) === 0 && n0(fe.streaks) === 0 && n0(fe.impacts) === 0 && n0(fe.particles) === 0,
    `puddles=${fe.puddles} streaks=${fe.streaks} impacts=${fe.impacts} particles=${fe.particles}`);
  T(`${mode}: forceEnd() releases the major-event slot`, g._activeMajorEvent !== 'acidRain',
    `_activeMajorEvent=${String(g._activeMajorEvent)}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. ACID RAIN — POOL CAPS UNDER LONG STORMS ===');
{
  const g = newGame('chaos', 7777);
  const caps = {
    streaks:   declaredCap('streaks')   ?? FALLBACK_CAPS.streaks,
    puddles:   declaredCap('puddles')   ?? FALLBACK_CAPS.puddles,
    particles: declaredCap('particles') ?? FALLBACK_CAPS.particles,
  };
  const declared = declaredCap('streaks') != null || declaredCap('puddles') != null || declaredCap('particles') != null;
  console.log(`    caps in force: streaks<=${caps.streaks} puddles<=${caps.puddles} particles<=${caps.particles}` +
              `  (${declared ? 'read from js/game/AcidRain.js' : 'contract ceilings — the module declares none'})`);

  // Enemies are deliberately allowed to build up before the storms: the puddle and impact pools are
  // fed by activity, and a storm over an empty map is not the stress case.
  const st = freshState(false);
  const sampler = makeSampler(st);
  step(g, 60 * 60, sampler);
  let storms = 0;
  for (let i = 0; i < 5; i++) {
    const o = openStormFromIdle(g, 400, sampler);
    if (!STORM_OPENED(o)) break;
    storms++;
    runUntilIdle(g, 240, sampler);
  }
  T('the cap block drove real storms', storms >= 3, `${storms} storms`);
  T(`streaks never exceed the cap (${caps.streaks})`, st.maxStreaks <= caps.streaks, `peak ${st.maxStreaks}`);
  T(`puddles never exceed the cap (${caps.puddles})`, st.maxPuddles <= caps.puddles, `peak ${st.maxPuddles}`);
  T(`particles never exceed the cap (${caps.particles})`, st.maxParticles <= caps.particles, `peak ${st.maxParticles}`);
  T('the pools were actually exercised, not empty', st.maxStreaks > 0 && st.maxPuddles > 0,
    `peak streaks ${st.maxStreaks} puddles ${st.maxPuddles}`);
  T('no NaN in player or camera across the long storm block', st.nanFrames === 0 && clean(g), `${st.nanFrames} bad frames`);
  console.log(`    peaks: streaks ${st.maxStreaks} · puddles ${st.maxPuddles} · particles ${st.maxParticles} · impacts ${st.maxImpacts}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. CHAOS AMBIENT MEGA BOSS PACING — 08:00 / 16:00 / 24:00 ===');
// Thirty-three simulated minutes of real Chaos, driven through Game.update on the virtual clock.
// The player's HP is pinned for the whole run — see the note on step(). What is measured here is
// WHEN the ambient scheduler is allowed to fire, and nothing else.
//
// HORIZON WIDENED 27:00 -> 33:00 (BATCH 3, 2026-07-29). The floors under test are 08:00/16:00/24:00,
// but the third Titan cannot arrive before its predecessor has been cleared, so the arrival chain
// drifts later whenever elite fire cadence changes. Measured, same seed 31337, same assertions:
//   baseline 60476b0 : #1@706.6s  #2@1096.6s  #3@1570.1s   (49s of margin inside a 1620s window)
//   Batch 3          : #1@781.1s  #2@1250.3s  #3@1786.1s
// Batch 3 gates elite/boss weapons that declare telegraphRequired behind a real windup, so an elite
// volley now lands ~0.4-1.0s later than it used to; the chain shifts with it. Every floor still
// holds with room to spare (781>=480, 1250>=960, 1786>=1440) — what failed at 27:00 was the probe
// window, not the pacing contract. Only this horizon changed: no assertion was relaxed, no
// exception added, no unconditional PASS. The 1786.1s figure was measured directly before the
// change was made, on a 33:00 run of the unmodified Batch 3 build.
{
  const PACE = { spawns: [], twoAlive: 0, nan: 0, maxAlive: 0 };
  const g = newGame('chaos', 31337);
  let idx = n0(g._chaosTitanIdx);
  step(g, 1980 * 60, (gg) => {
    const now = n0(gg._chaosTitanIdx);
    if (now > idx) {
      for (let k = idx + 1; k <= now; k++) {
        PACE.spawns.push({
          idx: k, t: modeTime(gg),
          rush: !!gg._bossRush,
          acid: sysOf(gg).active === true,
        });
      }
      idx = now;
    }
    if (!gg._bossRush) {
      const alive = ambientTitansAlive(gg);
      if (alive > PACE.maxAlive) PACE.maxAlive = alive;
      if (alive > 1) PACE.twoAlive++;
    }
    if (!clean(gg)) PACE.nan++;
  });
  const duringRush = PACE.spawns.filter(s => s.rush).length;
  const duringAcid = PACE.spawns.filter(s => s.acid).length;
  console.log('    ambient mega boss spawns: ' +
    (PACE.spawns.map(s => `#${s.idx}@${s.t.toFixed(1)}s`).join(' · ') || 'none') +
    `   (run reached ${modeTime(g).toFixed(0)}s)`);

  const early = PACE.spawns.filter(s => s.t < 480);
  T('zero ambient mega bosses before 08:00', early.length === 0,
    early.map(s => `#${s.idx}@${s.t.toFixed(1)}s`).join(', '));
  T('at least three ambient mega bosses inside 33:00', PACE.spawns.length >= 3, `${PACE.spawns.length} spawned`);
  const b1 = PACE.spawns[0], b2 = PACE.spawns[1], b3 = PACE.spawns[2];
  T('the FIRST ambient mega boss arrives at or after 08:00', !!b1 && b1.t >= 480, b1 ? `${b1.t.toFixed(1)}s` : 'never spawned');
  T('the SECOND ambient mega boss arrives at or after 16:00', !!b2 && b2.t >= 960, b2 ? `${b2.t.toFixed(1)}s` : 'never spawned');
  T('the THIRD ambient mega boss arrives at or after 24:00', !!b3 && b3.t >= 1440, b3 ? `${b3.t.toFixed(1)}s` : 'never spawned');
  T('the order is strictly 1, 2, 3 with no skipping', PACE.spawns.length > 0 && PACE.spawns.every((s, i) => s.idx === i + 1),
    PACE.spawns.map(s => s.idx).join(','));
  T('spawn times are strictly increasing', PACE.spawns.every((s, i) => i === 0 || s.t > PACE.spawns[i - 1].t));
  T('never two ambient mega bosses alive at once', PACE.twoAlive === 0, `${PACE.twoAlive} frames, peak ${PACE.maxAlive} alive`);
  T('never an ambient spawn while a Boss Rush is running', duringRush === 0, `${duringRush} spawns`);
  T('never an ambient spawn while acid rain is active', duringAcid === 0, `${duringAcid} spawns`);
  T('no NaN in player or camera across 33:00 of Chaos', PACE.nan === 0 && clean(g), `${PACE.nan} bad frames`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. MAJOR EVENT EXCLUSIVITY — EVERY ORDERED PAIR ===');
const TYPES = ['bossRush', 'acidRain', 'airstrike', 'laserGrid', 'vault', 'megaBoss'];
{
  // One Chaos run, warmed up past the earliest-allowed moment of every event type. Exclusivity is a
  // property of the arbiter rather than of the individual schedulers, but an arbiter that refuses
  // the FIRST claim because the type is not eligible yet would make the pair test meaningless, so
  // the run is warmed for ten minutes before the matrix starts.
  const g = newGame('chaos', 5150);
  step(g, 600 * 60);
  // Between pairs the arbiter must be empty and the grace spent, otherwise the next pair measures
  // the leftovers of the previous one instead of the rule under test. This runs BETWEEN pairs only
  // — never inside one — so it cannot soften anything a pair asserts.
  const release = () => {
    for (const t of TYPES) { try { g.endMajorEvent(t); } catch (_) {} }
    try { sysOf(g).forceEnd(); } catch (_) {}
    const un = muteConsole();
    g._bossRush = null; g._deckLockT = 0;
    // Spliced in place, never reassigned: other systems hold a reference to this exact array.
    if (Array.isArray(g.enemies))
      for (let i = g.enemies.length - 1; i >= 0; i--) if (g.enemies[i] && g.enemies[i].isMegaBoss) g.enemies.splice(i, 1);
    g._activeTitan = null;
    un();
    for (let i = 0; i < 40 && (n0(g._majorEventGraceT) > 0 || g._activeMajorEvent != null); i++) step(g, 30);
    return g._activeMajorEvent == null && n0(g._majorEventGraceT) <= 0;
  };
  T('the arbiter can be brought back to empty before the matrix', release(),
    `_activeMajorEvent=${String(g._activeMajorEvent)} grace=${g._majorEventGraceT}`);

  for (const a of TYPES) {
    for (const b of TYPES) {
      if (a === b) continue;
      release();
      let startedA = false;
      try { startedA = g.startMajorEvent(a) === true; } catch (_) { startedA = false; }
      const heldA = g._activeMajorEvent === a;
      let canB = true, startedB = true;
      try { canB = g.canStartMajorEvent(b); } catch (_) { canB = true; }
      try { startedB = g.startMajorEvent(b); } catch (_) { startedB = true; }
      const stillA = g._activeMajorEvent === a;
      T(`${a} holds the screen: ${b} is refused and does not steal the slot`,
        startedA && heldA && canB === false && startedB === false && stillA,
        `start(${a})=${startedA} active=${String(g._activeMajorEvent)} canStart(${b})=${canB} start(${b})=${startedB}`);

      // End the first. While the grace runs the second must STILL be refused — that is what the
      // grace is for — and once it is spent the second must be allowed.
      try { g.endMajorEvent(a); } catch (_) {}
      const graceAfterEnd = n0(g._majorEventGraceT);
      let refusedDuringGrace = true;
      if (graceAfterEnd > 0) { try { refusedDuringGrace = g.canStartMajorEvent(b) === false; } catch (_) { refusedDuringGrace = false; } }
      let waited = 0;
      for (let i = 0; i < 60 && n0(g._majorEventGraceT) > 0; i++) { step(g, 15); waited += 15; }
      // The wait loop drives the REAL run, so an ORGANIC scheduler can legitimately claim the slot
      // while the grace is being spent. That is the arbiter working, not a violation — but it
      // destroys the precondition this pair is about to measure ("a has ended and nothing holds the
      // slot, therefore b may start"). Observed once the pacing block was lengthened to 33:00:
      // `vault` re-opened organically during the 375-frame wait of the vault->laserGrid pair, and
      // laserGrid was then correctly refused. Restore the precondition and record that it happened.
      // This clears ONLY a third-party holder that is neither a nor b: if b itself is already
      // holding, or a never released, the assertion below still fails exactly as before.
      let stolen = null;
      if (g._activeMajorEvent != null && g._activeMajorEvent !== b) {
        stolen = g._activeMajorEvent;
        try { g.endMajorEvent(stolen); } catch (_) {}
        for (let i = 0; i < 40 && n0(g._majorEventGraceT) > 0; i++) { step(g, 15); waited += 15; }
      }
      let canB2 = false, startedB2 = false;
      try { canB2 = g.canStartMajorEvent(b) === true; } catch (_) { canB2 = false; }
      try { startedB2 = g.startMajorEvent(b) === true; } catch (_) { startedB2 = false; }
      T(`${b} can start after ${a} ends and the grace is spent`,
        refusedDuringGrace && canB2 && startedB2 && g._activeMajorEvent === b,
        `graceOnEnd=${graceAfterEnd.toFixed(2)} refusedDuringGrace=${refusedDuringGrace} canStart=${canB2} start=${startedB2} active=${String(g._activeMajorEvent)} waited=${waited}f stolenDuringWait=${String(stolen)}`);
      try { g.endMajorEvent(b); } catch (_) {}
    }
  }
  T('the matrix leaves the arbiter empty', release(), `_activeMajorEvent=${String(g._activeMajorEvent)}`);
  T('no NaN in player or camera after the exclusivity matrix', clean(g));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 5. TIMERS ARE HELD, NOT FROZEN — NO POST-BOSS-RUSH BURST ===');
{
  const g = newGame('chaos', 9001);
  step(g, 120 * 60);

  // Open the rush through the arbiter when it will do that, and fall back to the construction the
  // scheduler itself uses when the arbiter only claims the slot. Either way what follows measures
  // the same thing: what happens in the five seconds after a three-minute lock comes down.
  let viaArbiter = false;
  try { viaArbiter = g.startMajorEvent('bossRush') === true; } catch (_) { viaArbiter = false; }
  if (!g._bossRush) {
    const un = muteConsole();
    const rp = g._placeArena(g.player.pos.x, g.player.pos.y, 700, 26);
    g._bossRush = { t: 0, dur: 180, cx: rp.x, cy: rp.y, r: rp.radius, hazard: null, spawnAcc: 0, titanIdx: 0, flags: {} };
    un();
  }
  T('a Boss Rush is running for the burst test', !!g._bossRush, `startMajorEvent('bossRush')=${viaArbiter}`);

  // Make every other event timer eligible WHILE the rush runs. This is the burst the grace exists to
  // prevent: several schedulers all one step from firing at the moment the ring comes down.
  g.acidRainTimer = 0.1; g._airstrikeTimer = 0.1; g._chaosTitanTimer = 0.1;
  g._lightningTimer = 0.1; g._frozenSleetTimer = 0.1; g._cybermoteTimer = 0.1;

  // One continuous observation. Every start is stamped with the frame it happened on, so "during the
  // rush", "on the frame the rush ended" and "in the five seconds after" are three slices of the
  // same recording rather than three separate runs that could disagree.
  const marks = [];
  let frame = 0, endFrame = -1;
  let pAct = g._activeMajorEvent || null, pAcid = sysOf(g).active, pAir = (g.airstrikeShips || []).length > 0;
  let pVault = !!g.vaultDrop, pTitan = n0(g._chaosTitanIdx), pRush = !!g._bossRush;
  const observe = (gg) => {
    const act = gg._activeMajorEvent || null;
    if (act && act !== pAct) marks.push({ f: frame, kind: 'arbiter:' + act });
    const acid = sysOf(gg).active;
    if (acid && !pAcid) marks.push({ f: frame, kind: 'acidRain' });
    const air = (gg.airstrikeShips || []).length > 0;
    if (air && !pAir) marks.push({ f: frame, kind: 'airstrike' });
    const vault = !!gg.vaultDrop;
    if (vault && !pVault) marks.push({ f: frame, kind: 'vault' });
    const ti = n0(gg._chaosTitanIdx);
    if (ti > pTitan) marks.push({ f: frame, kind: 'megaBoss' });
    const rush = !!gg._bossRush;
    if (rush && !pRush) marks.push({ f: frame, kind: 'bossRush' });
    if (pRush && !rush && endFrame < 0) endFrame = frame;
    pAct = act; pAcid = acid; pAir = air; pVault = vault; pTitan = ti; pRush = rush;
  };
  const LIMIT = 300 * 60;
  while (frame < LIMIT && (endFrame < 0 || frame < endFrame + 95 * 60)) { step(g, 1, observe); frame++; }

  // The rush under observation ended. A LATER rush opening inside the 95s tail is the scheduler
  // doing its job, so the end of the observed rush is what this asserts, not the absence of rushes.
  T('the rush ran to completion', endFrame >= 0, `endFrame=${endFrame} bossRush=${!!g._bossRush}`);
  const during = marks.filter(m => endFrame < 0 || m.f < endFrame);
  T('nothing else opened DURING the rush', during.length === 0,
    during.slice(0, 6).map(m => `${m.kind}@f${m.f}`).join(', '));
  const onEnd = marks.filter(m => endFrame >= 0 && m.f === endFrame);
  T('nothing starts in the same frame the rush ends', onEnd.length === 0, onEnd.map(m => m.kind).join(', '));
  const within5 = marks.filter(m => endFrame >= 0 && m.f > endFrame && m.f <= endFrame + 300);
  T('at most ONE major event starts in the first 5s after the rush', within5.length <= 1,
    `${within5.length} started: ${within5.map(m => `${m.kind}@+${((m.f - endFrame) / 60).toFixed(2)}s`).join(', ')}`);
  // Held, not frozen: the timers must still be running, so the events do arrive — just spread out.
  const later = marks.filter(m => endFrame >= 0 && m.f > endFrame + 300);
  T('the held events do arrive after the grace (held, not frozen)', within5.length + later.length >= 1,
    `${later.length} started in the following 90s`);
  T('no NaN in player or camera after the rush', clean(g));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 6. LIFECYCLE — DECK CHANGE, RESTART, SECOND RUN ===');
{
  const g = newGame('chaos', 6060);
  // A deck change during a storm. The rain belongs to the deck the player is on: what was falling
  // and what had pooled on the floor they left must not follow them, but the EVENT itself is allowed
  // to keep running and to paint the new deck.
  const openDc = openStormFromIdle(g, 900);
  T('a storm could be opened for the deck-change test', STORM_OPENED(openDc), `openStorm=${openDc.how}`);
  let rained = false;
  for (let i = 0; i < 60 && !rained; i++) { step(g, 15); if (phaseOf(g) === 'raining' && n0(ars(g).puddles) > 0) rained = true; }
  T('the storm is raining with puddles on the floor before the deck change', rained,
    `phase ${phaseOf(g)} puddles ${ars(g).puddles}`);

  let moved = false;
  for (let i = 0; i < 40 && !moved; i++) {
    if (!g._deckTransitionBlocked()) { try { moved = g._enterDeck('upper') === true && g._deck === 'upper'; } catch (_) { moved = false; } }
    if (!moved) step(g, 15);
  }
  T('a deck change is granted during a storm', moved, `deck ${g._deck} blocked=${g._deckTransitionBlocked()}`);
  const dc = ars(g);
  T('the deck change leaves no puddles behind', n0(dc.puddles) === 0, `${dc.puddles} puddles`);
  T('the deck change leaves no drops in flight', n0(dc.streaks) === 0 && n0(dc.impacts) === 0,
    `streaks=${dc.streaks} impacts=${dc.impacts}`);
  T('the deck change leaves the phase machine in a legal state', LEGAL_PHASES.includes(phaseOf(g)), `phase ${phaseOf(g)}`);
  T('no NaN in player or camera after the deck change', clean(g));
  // The event may continue. If it does, whatever it paints on the new deck must be ON the new deck.
  const postDeck = freshState(true);
  step(g, 300, makeSampler(postDeck));
  if (postDeck.centresSeen > 0)
    T('puddles painted after the deck change are on the ACTIVE deck', postDeck.centresOffFloor === 0,
      `${postDeck.centresOffFloor} of ${postDeck.centresSeen} samples off floor: ${postDeck.badCentres.join(' | ')}`);

  // ── a new run clears everything ──────────────────────────────────────────────────────────────
  const un = muteConsole();
  g.reset(); g._beginChaosRun(); g._chaosEntryGraceT = 0;
  un();
  T('a new run releases the major-event slot', g._activeMajorEvent == null, `_activeMajorEvent=${String(g._activeMajorEvent)}`);
  T('a new run returns acid rain to idle', phaseOf(g) === 'idle' && sysOf(g).active === false, `phase ${phaseOf(g)}`);
  T('a new run empties every acid rain pool',
    n0(ars(g).puddles) === 0 && n0(ars(g).streaks) === 0 && n0(ars(g).impacts) === 0 && n0(ars(g).particles) === 0,
    `puddles=${ars(g).puddles} streaks=${ars(g).streaks} impacts=${ars(g).impacts} particles=${ars(g).particles}`);
  T('a new run resets the storm counters', n0(ars(g).startedCount) === 0 && n0(ars(g).warningsShown) === 0,
    `started=${ars(g).startedCount} warnings=${ars(g).warningsShown}`);
  T('a new run resets the ambient mega boss counter', n0(g._chaosTitanIdx) === 0, `_chaosTitanIdx=${g._chaosTitanIdx}`);
  T('a new run carries no Boss Rush lock', g._bossRush == null && n0(g._deckLockT) === 0,
    `bossRush=${!!g._bossRush} deckLock=${g._deckLockT}`);
  T('a new run starts on MAIN', g._deck === 'main', `deck ${g._deck}`);
  T('a new run spends the post-rush grace', n0(g._majorEventGraceT) === 0, `grace ${g._majorEventGraceT}`);

  // ── the second run does not inherit a pending event ──────────────────────────────────────────
  const pending = [];
  let qAct = g._activeMajorEvent || null, qAcid = sysOf(g).active, qTitan = n0(g._chaosTitanIdx), qRush = !!g._bossRush;
  step(g, 5 * 60, (gg) => {
    const a = gg._activeMajorEvent || null;
    if (a && a !== qAct) pending.push('arbiter:' + a);
    const acid = sysOf(gg).active;
    if (acid && !qAcid) pending.push('acidRain');
    const ti = n0(gg._chaosTitanIdx);
    if (ti > qTitan) pending.push('megaBoss');
    const rush = !!gg._bossRush;
    if (rush && !qRush) pending.push('bossRush');
    qAct = a; qAcid = acid; qTitan = ti; qRush = rush;
  });
  T('the second run does not immediately fire a pending event', pending.length === 0, pending.join(', '));
  T('acid rain is not eligible at the start of the second run', canNow(g) === false,
    `canStart()=${canNow(g)} nextEligibleIn=${ars(g).nextEligibleIn}`);
  T('no NaN in player or camera in the second run', clean(g));
  // One draw pass at the end. The draw path is part of the contract, and a system that throws on
  // draw would otherwise never be exercised headlessly.
  let drew = true, drawErr = '';
  const un2 = muteConsole();
  try { sysOf(g).draw(CTX); g.draw(CTX); } catch (e) { drew = false; drawErr = e.message; }
  un2();
  T('acidRainSystem.draw() and Game.draw() run headlessly without throwing', drew, drawErr);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
