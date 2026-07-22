// P1 enemy-pressure gate: 10 characters x 3 modes x 3 seeds x 2 stationary profiles.
// No player movement, HP mutation, forced damage, forced enemies, or production-value changes.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const CHARS = [
  'skeleton_warrior', 'taekwondo_girl', 'cyber_arm_hero', 'brawler_warrior',
  'assassin_clone', 'japan_phasewalker', 'euclid_vector', 'oni_cataclysm_protocol',
  'eddie', 'dimis_kickboxer',
];
const MODES = ['act1', 'endless', 'chaos'];
const SEEDS = [12345, 777, 20260721];
const PROFILES = ['normal', 'diagnostic'];
const MAX_SECONDS = 180;
const PLAYER_RADIUS = 18;

if (process.argv[2] === '--worker') {
  const seed = Number(process.argv[3]);
  const ch = process.argv[4];
  const mode = process.argv[5];
  const profile = process.argv[6];
  const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
  installEnv();

  const mulberry32 = a => () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
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
    constructor(...args) { if (args.length) super(...args); else super(vclock); }
  };
  try { globalThis.localStorage.clear(); } catch (_) {}
  try { globalThis.sessionStorage.clear?.(); } catch (_) {}

  const unmuteImports = muteConsole();
  const { Game } = await import(pathToFileURL(path.resolve(HERE, '../../js/game/Game.js')).href);
  const { Enemy } = await import(pathToFileURL(path.resolve(HERE, '../../js/entities/Enemy.js')).href + '?v=20260731000000');
  unmuteImports();

  const unmuteRun = muteConsole();
  const game = new Game();
  game.audio = null;
  game.selectedCharacter = ch;
  game.gameState = 'playing';
  if (mode === 'act1') {
    game._pendingCampaignStage = 1;
    game.reset();
    game._applyCampaignStage();
  } else if (mode === 'chaos') {
    game._beginChaosRun();
  } else {
    game.reset();
    game._enterEndless();
  }

  const metrics = {
    runtimeErrors: [],
    damage: { body: 0, ranged: 0, hazard: 0, other: 0 },
    firstDamage: { body: null, ranged: null, hazard: null, other: null },
    nearestSamples: [],
    spawnDistances: [],
    enemyTypes: {},
    enemySpawns: 0,
    firstInside200: null,
    firstInside100: null,
    firstContact: null,
    firstSurround: null,
    maxContact: 0,
    maxQuadrants: 0,
    killedBeforeContact: 0,
    stuckEnemies: new Set(),
    pathingAwaySamples: 0,
    blockedSamples: 0,
    oscillations: 0,
    knockbackSamples: 0,
    slowSamples: 0,
    stunSamples: 0,
    inwardSpeedSum: 0,
    inwardSpeedSamples: 0,
  };
  const states = new Map();
  let damageContext = 'other';
  const at = () => +(vclock / 1000).toFixed(2);
  const errorText = error => String(error?.stack || error?.message || error).slice(0, 600);

  const originalApplyDamage = game.player.applyDamage;
  game.player.applyDamage = function (amount, ...args) {
    const before = this.hp;
    const result = originalApplyDamage.call(this, amount, ...args);
    const lost = Math.max(0, before - this.hp);
    if (lost > 0) {
      const source = metrics.damage[damageContext] == null ? 'other' : damageContext;
      metrics.damage[source] += lost;
      metrics.firstDamage[source] ??= at();
    }
    return result;
  };

  const wrapContext = (name, context) => {
    const original = game[name];
    if (typeof original !== 'function') return;
    game[name] = function (...args) {
      const previous = damageContext;
      damageContext = context;
      try { return original.apply(this, args); }
      finally { damageContext = previous; }
    };
  };
  wrapContext('_checkPlayerEnemyCollisions', 'body');
  wrapContext('_updateEnemyBullets', 'ranged');
  wrapContext('_updateEndlessHazards', 'hazard');

  if (profile === 'diagnostic') {
    game.aimAssist = false;
    game._handleAutoShooting = () => {};
    if (game.buildEngine) game.buildEngine.update = () => {};
    // All shipped starter/legacy projectile paths converge on Enemy.takeHit. Suppressing that
    // method disables player damage without changing enemy HP or any production tuning value.
    Enemy.prototype.takeHit = function () {};
  }

  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  let nextSecond = 1;
  let nextMotionSample = 0.25;

  function chooseOpenPanel() {
    if (game.upgradeUI) {
      const choices = game.upgradeUI.choices || [];
      let index = choices.findIndex(card => !String(card?.key || '').startsWith('be_'));
      if (index < 0) index = 0;
      game.selectUpgrade(index);
    }
    if (game.mutationUI) game.selectMutation(0);
    if (game._postArenaChoice) game._selectPostArenaChoice(0);
  }

  function observeMotion() {
    const live = new Set(game.enemies || []);
    let nearest = Infinity;
    let contacts = 0;
    const quadrants = new Set();
    const px = game.player.pos.x;
    const py = game.player.pos.y;
    for (const enemy of live) {
      if (!enemy?.pos || enemy.hp <= 0) continue;
      const dx = enemy.pos.x - px;
      const dy = enemy.pos.y - py;
      const dist = Math.hypot(dx, dy);
      nearest = Math.min(nearest, dist);
      let state = states.get(enemy);
      if (!state) {
        state = { prevX: enemy.pos.x, prevY: enemy.pos.y, prevDist: dist, lastRadialSign: 0, contact: false, removed: false };
        states.set(enemy, state);
        metrics.enemySpawns++;
        metrics.spawnDistances.push(dist);
        metrics.enemyTypes[enemy.enemyType] = (metrics.enemyTypes[enemy.enemyType] || 0) + 1;
      }
      const contactRange = (enemy.radius || 14) + PLAYER_RADIUS;
      if (dist <= contactRange) {
        contacts++;
        state.contact = true;
        metrics.firstContact ??= at();
      }
      if (dist <= 200) metrics.firstInside200 ??= at();
      if (dist <= 100) metrics.firstInside100 ??= at();
      if (dist <= 220) quadrants.add((dx >= 0 ? 1 : 0) + (dy >= 0 ? 2 : 0));

      const moved = Math.hypot(enemy.pos.x - state.prevX, enemy.pos.y - state.prevY);
      const radial = state.prevDist - dist;
      const sign = Math.abs(radial) >= 0.4 ? Math.sign(radial) : 0;
      if (sign && state.lastRadialSign && sign !== state.lastRadialSign) metrics.oscillations++;
      if (sign) state.lastRadialSign = sign;
      if (radial < -0.5) metrics.pathingAwaySamples++;
      if (moved < 0.3 && dist > contactRange + 12) {
        metrics.blockedSamples++;
        state.blocked = (state.blocked || 0) + 1;
        if (state.blocked >= 8) metrics.stuckEnemies.add(enemy);
      } else {
        state.blocked = 0;
      }
      metrics.inwardSpeedSum += radial / 0.25;
      metrics.inwardSpeedSamples++;
      if (Math.hypot(enemy._kbx || 0, enemy._kby || 0) > 1) metrics.knockbackSamples++;
      if ((enemy.slowTimer || 0) > 0) metrics.slowSamples++;
      if ((enemy.stunned || 0) > 0) metrics.stunSamples++;
      state.prevX = enemy.pos.x;
      state.prevY = enemy.pos.y;
      state.prevDist = dist;
    }
    for (const [enemy, state] of states) {
      if (!state.removed && !live.has(enemy)) {
        state.removed = true;
        if (enemy._killed && !state.contact) metrics.killedBeforeContact++;
      }
    }
    metrics.maxContact = Math.max(metrics.maxContact, contacts);
    metrics.maxQuadrants = Math.max(metrics.maxQuadrants, quadrants.size);
    if (quadrants.size >= 3) metrics.firstSurround ??= at();
    return nearest;
  }

  for (let frame = 0; frame < MAX_SECONDS * 60; frame++) {
    vclock += 1000 / 60;
    try {
      chooseOpenPanel();
      game.update(1 / 60, input);
    } catch (error) {
      metrics.runtimeErrors.push(errorText(error));
      break;
    }
    const now = vclock / 1000;
    if (now >= nextMotionSample) {
      observeMotion();
      nextMotionSample += 0.25;
    }
    if (now >= nextSecond) {
      let nearest = Infinity;
      for (const enemy of game.enemies || []) {
        if (enemy?.hp > 0) nearest = Math.min(nearest, Math.hypot(enemy.pos.x - game.player.pos.x, enemy.pos.y - game.player.pos.y));
      }
      metrics.nearestSamples.push(Number.isFinite(nearest) ? +nearest.toFixed(2) : null);
      nextSecond++;
    }
    if (game.gameOver) break;
  }
  observeMotion();

  const finiteNearest = metrics.nearestSamples.filter(Number.isFinite).sort((a, b) => a - b);
  const median = finiteNearest.length ? finiteNearest[Math.floor(finiteNearest.length / 2)] : null;
  const modeEntryValid = mode === 'act1'
    ? game._campaignStage === 1
    : mode === 'chaos'
      ? game.endless === true && game._chaosMode === true
      : game.endless === true && game._chaosMode === false;
  const starterWeapons = [...(game.buildEngine?.weapons?.keys?.() || [])];
  const totalDamage = Object.values(metrics.damage).reduce((sum, value) => sum + value, 0);
  const result = {
    ch, mode, seed, profile,
    moveSpeed: game.player.baseSpeed,
    maxHp: game.player.maxHp,
    contactDamageReduction: game.player.contactDamageReduction,
    starterWeapons,
    timeAlive: +Number(game.timeAlive || 0).toFixed(2),
    timeToDeath: game.gameOver ? +Number(game.timeAlive || 0).toFixed(2) : null,
    finalHp: +Number(game.player.hp || 0).toFixed(2),
    enemySpawns: metrics.enemySpawns,
    enemyTypes: metrics.enemyTypes,
    medianSpawnDistance: metrics.spawnDistances.length
      ? +metrics.spawnDistances.sort((a, b) => a - b)[Math.floor(metrics.spawnDistances.length / 2)].toFixed(2) : null,
    minEnemyDistance: finiteNearest.length ? finiteNearest[0] : null,
    medianEnemyDistance: median,
    firstInside200: metrics.firstInside200,
    firstInside100: metrics.firstInside100,
    firstContact: metrics.firstContact,
    firstBodyDamage: metrics.firstDamage.body,
    firstRangedDamage: metrics.firstDamage.ranged,
    firstHazardDamage: metrics.firstDamage.hazard,
    firstSurround: metrics.firstSurround,
    maxQuadrants: metrics.maxQuadrants,
    maxContact: metrics.maxContact,
    totalDamage: +totalDamage.toFixed(2),
    damage: Object.fromEntries(Object.entries(metrics.damage).map(([key, value]) => [key, +value.toFixed(2)])),
    killedBeforeContact: metrics.killedBeforeContact,
    stuckEnemies: metrics.stuckEnemies.size,
    pathingAwaySamples: metrics.pathingAwaySamples,
    blockedSamples: metrics.blockedSamples,
    oscillations: metrics.oscillations,
    knockbackSamples: metrics.knockbackSamples,
    stunSamples: metrics.stunSamples,
    slowSamples: metrics.slowSamples,
    averageEffectiveSpeedTowardPlayer: metrics.inwardSpeedSamples
      ? +(metrics.inwardSpeedSum / metrics.inwardSpeedSamples).toFixed(2) : 0,
    modeEntryValid,
    runtimeErrors: metrics.runtimeErrors,
  };
  unmuteRun();
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

function worker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SELF, '--worker', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0 || !stdout) return reject(new Error(`${args.join('/')} ${(stderr || '').slice(-500)}`));
      try { resolve(JSON.parse(stdout.trim().split('\n').pop())); }
      catch (error) { reject(new Error(`${args.join('/')} invalid JSON: ${error.message}`)); }
    });
  });
}

async function runPool(jobs, concurrency = 24) {
  const results = new Array(jobs.length);
  let next = 0;
  async function lane() {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await worker(jobs[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, lane));
  return results;
}

let pass = 0;
let fail = 0;
const test = (name, check) => {
  let ok = false;
  let note = '';
  try {
    const result = check();
    ok = result === true;
    if (typeof result === 'string') note = result;
  } catch (error) { note = 'THREW: ' + error.message; }
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ' - ' + note : ''}`);
};

console.log('=== STRICT ENEMY PRESSURE / STATIONARY CHARACTER MATRIX ===');
console.log(`    ${CHARS.length} chars x ${MODES.length} modes x ${SEEDS.length} seeds x ${PROFILES.length} profiles = 180 runs`);
const jobs = [];
for (const profile of PROFILES) for (const mode of MODES) for (const ch of CHARS) for (const seed of SEEDS) {
  jobs.push([String(seed), ch, mode, profile]);
}
const runs = await runPool(jobs);

const subset = (profile, mode, ch) => runs.filter(run => run.profile === profile && run.mode === mode && (!ch || run.ch === ch));
const count = (items, predicate) => items.filter(predicate).length;
for (const mode of MODES) {
  for (const ch of CHARS) {
    const normal = subset('normal', mode, ch);
    const diagnostic = subset('diagnostic', mode, ch);
    console.log(`  ${mode.padEnd(7)} ${ch.padEnd(26)} normal contact ${count(normal, r => r.firstContact != null)}/3 death ${count(normal, r => r.timeToDeath != null)}/3 | diagnostic contact ${count(diagnostic, r => r.firstContact != null)}/3 surround ${count(diagnostic, r => r.firstSurround != null)}/3 death ${count(diagnostic, r => r.timeToDeath != null)}/3`);
  }
}

const source = readFileSync(SELF, 'utf8');
console.log('\n-- Harness validity --');
test('exactly 180 independent production-entry runs completed', () => runs.length === 180);
test('source contains no direct player HP assignment or forced enemy spawn', () =>
  !/\b(?:game\.)?player\.hp\s*(?:[+*/%-]?=(?!=)|\+\+|--)/.test(source) &&
  !/\bgame\.spawnEnemy\s*\(/.test(source));
test('all workers used the correct production mode state', () => runs.every(run => run.modeEntryValid));
test('all workers completed without runtime errors', () =>
  runs.every(run => run.runtimeErrors.length === 0) ||
  runs.filter(run => run.runtimeErrors.length).map(run => `${run.profile}/${run.mode}/${run.ch}/${run.seed}`).join(', '));

console.log('\n-- Contact diagnostic (player attacks disabled in harness only) --');
test('every character/mode reaches real contact on >=2/3 seeds', () =>
  MODES.every(mode => CHARS.every(ch => count(subset('diagnostic', mode, ch), run => run.firstContact != null) >= 2)) ||
  MODES.flatMap(mode => CHARS.map(ch => `${mode}/${ch}=${count(subset('diagnostic', mode, ch), r => r.firstContact != null)}/3`)).join(', '));
test('every character/mode is surrounded in >=3 quadrants on >=2/3 seeds', () =>
  MODES.every(mode => CHARS.every(ch => count(subset('diagnostic', mode, ch), run => run.firstSurround != null) >= 2)) ||
  MODES.flatMap(mode => CHARS.map(ch => `${mode}/${ch}=${count(subset('diagnostic', mode, ch), r => r.firstSurround != null)}/3`)).join(', '));
test('every character/mode takes body/contact damage on >=2/3 seeds', () =>
  MODES.every(mode => CHARS.every(ch => count(subset('diagnostic', mode, ch), run => run.damage.body > 0) >= 2)) || 'body damage missing');
test('no diagnostic run retains the old permanent >=100px no-contact ring', () =>
  runs.filter(run => run.profile === 'diagnostic').every(run => run.minEnemyDistance == null || run.minEnemyDistance < 100) || 'safe ring detected');

console.log('\n-- Normal starter pressure --');
test('every character/mode has real contact on at least one normal seed', () =>
  MODES.every(mode => CHARS.every(ch => count(subset('normal', mode, ch), run => run.firstContact != null) >= 1)) ||
  MODES.flatMap(mode => CHARS.filter(ch => count(subset('normal', mode, ch), r => r.firstContact != null) < 1).map(ch => `${mode}/${ch}`)).join(', '));
test('every mode kills stationary normal characters in a majority of runs', () =>
  MODES.every(mode => count(subset('normal', mode), run => run.timeToDeath != null) >= 15) ||
  MODES.map(mode => `${mode}=${count(subset('normal', mode), r => r.timeToDeath != null)}/30`).join(', '));
test('pathing trends inward overall in both profiles', () =>
  runs.reduce((sum, run) => sum + run.averageEffectiveSpeedTowardPlayer, 0) / runs.length > 0 || 'non-positive radial progress');

console.log('\n-- Mode summary --');
for (const mode of MODES) {
  for (const profile of PROFILES) {
    const group = subset(profile, mode);
    const medContact = group.map(run => run.firstContact).filter(Number.isFinite).sort((a, b) => a - b);
    const body = group.reduce((sum, run) => sum + run.damage.body, 0);
    const ranged = group.reduce((sum, run) => sum + run.damage.ranged, 0);
    const hazard = group.reduce((sum, run) => sum + run.damage.hazard, 0);
    console.log(`  ${mode}/${profile}: contact ${count(group, r => r.firstContact != null)}/30, surround ${count(group, r => r.firstSurround != null)}/30, death ${count(group, r => r.timeToDeath != null)}/30, median contact ${medContact.length ? medContact[Math.floor(medContact.length / 2)].toFixed(2) + 's' : 'n/a'}, damage body/ranged/hazard ${body.toFixed(0)}/${ranged.toFixed(0)}/${hazard.toFixed(0)}`);
  }
}
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
