// Phase 5F read-only production audit: XP density, accessibility and collection behavior.
// Drives the real Game and XpShardSystem. It never injects XP or changes production values.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./strip-v-loader.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SELF = fileURLToPath(import.meta.url);
const GAME_FILE = path.join(ROOT, 'js/game/Game.js');
const XP_FILE = path.join(ROOT, 'js/entities/XpShards.js');
const DT = 1 / 60;
const CAP = 520;
const CULL_RADIUS = 1500;
const VIEW_HALF_W = 640;
const VIEW_HALF_H = 360;
const CELL = 96;
const RUN_SECONDS = 180;
const MODES = ['act1', 'endless', 'chaos'];
const SEEDS = [7331, 20260722, 0xC0FFEE];
const PRODUCTION_FILES = [GAME_FILE, XP_FILE, path.join(ROOT, 'js/entities/Enemy.js'),
  path.join(ROOT, 'js/game/MapManager.js')];

const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
};
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const sum = values => values.reduce((a, b) => a + b, 0);
const max = values => values.reduce((best, value) => Math.max(best, value), 0);
const round = (value, digits = 2) => +value.toFixed(digits);

function shippedMapDimensions(map) {
  map._shipImg = { complete: true, naturalWidth: 1916, naturalHeight: 821 };
  map._cityImg = { complete: true, naturalWidth: 1672, naturalHeight: 519 };
  map._chaosDeckImg = { complete: true, naturalWidth: 1672, naturalHeight: 440 };
  map._act1BoundsCache = null;
}

function walkable(game, mode, x, y, radius = 12) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (mode !== 'act1') return game.mapManager.isWalkableFootprint(x, y, radius, mode);
  const b = game.mapManager.getAct1DeckBounds();
  return !!b && x - radius >= b.x0 && x + radius <= b.x1
    && y - radius >= b.y0 && y + radius <= b.y1;
}

function directRouteBlocked(game, mode, from, to, radius = 20) {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(d / 24));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!walkable(game, mode, from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t, radius)) return true;
  }
  return false;
}

// Flood the player's real walkable component once, then ask whether each resting shard can
// be approached within the production pickup radius. This avoids treating a merely occluded
// shard as unreachable when the player can walk around the obstacle.
function accessibility(game, mode, shards) {
  if (!shards.length) return { unreachable: 0, behindObstacle: 0 };
  const p = game.player.pos;
  const targets = shards.map(s => ({ x: s.tx, y: s.ty }));
  const behindObstacle = targets.filter(t => directRouteBlocked(game, mode, p, t)).length;
  if (mode === 'act1') {
    return { unreachable: targets.filter(t => !walkable(game, mode, t.x, t.y, 12)).length, behindObstacle };
  }

  let minX = Math.min(p.x, ...targets.map(t => t.x)) - 240;
  let maxX = Math.max(p.x, ...targets.map(t => t.x)) + 240;
  const model = game.mapManager._walkModel(mode);
  let minY = model.rows[0] * model.scale;
  let maxY = model.rows[1] * model.scale;
  let step = 32;
  if (((maxX - minX) / step) * ((maxY - minY) / step) > 80000) step = 64;
  minX = Math.floor(minX / step) * step;
  minY = Math.floor(minY / step) * step;
  const cols = Math.max(1, Math.ceil((maxX - minX) / step) + 1);
  const rows = Math.max(1, Math.ceil((maxY - minY) / step) + 1);
  const seen = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  const ixFor = x => Math.max(0, Math.min(cols - 1, Math.round((x - minX) / step)));
  const iyFor = y => Math.max(0, Math.min(rows - 1, Math.round((y - minY) / step)));
  const legal = (ix, iy) => walkable(game, mode, minX + ix * step, minY + iy * step, 20);
  let sx = ixFor(p.x), sy = iyFor(p.y);
  if (!legal(sx, sy)) {
    let found = false;
    for (let ring = 1; ring <= 4 && !found; ring++) {
      for (let oy = -ring; oy <= ring && !found; oy++) for (let ox = -ring; ox <= ring; ox++) {
        const nx = sx + ox, ny = sy + oy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && legal(nx, ny)) {
          sx = nx; sy = ny; found = true; break;
        }
      }
    }
  }
  let head = 0, tail = 0;
  const start = sy * cols + sx;
  if (legal(sx, sy)) { seen[start] = 1; queue[tail++] = start; }
  const reachablePoints = [];
  while (head < tail) {
    const idx = queue[head++];
    const iy = Math.floor(idx / cols), ix = idx - iy * cols;
    reachablePoints.push([minX + ix * step, minY + iy * step]);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + ox, ny = iy + oy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (!seen[ni] && legal(nx, ny)) { seen[ni] = 1; queue[tail++] = ni; }
    }
  }
  const pickupRadius = (game.player.pickupRadius || 90)
    * (game._mutationEffects?.pickupRadiusMult || 1);
  const unreachable = targets.filter(t => !reachablePoints.some(([x, y]) =>
    Math.hypot(x - t.x, y - t.y) <= pickupRadius)).length;
  return { unreachable, behindObstacle };
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (process.argv[2] === '--worker') {
  const mode = process.argv[3];
  const seed = +process.argv[4];
  const profile = process.argv[5];
  const seconds = +(process.argv[6] || RUN_SECONDS);
  const { installEnv, muteConsole, makeCtx } = await import(
    pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
  installEnv();
  Math.random = mulberry32(seed);
  let clockMs = 0;
  globalThis.performance = { now: () => clockMs };
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    static now() { return clockMs; }
    constructor(...args) { if (args.length) super(...args); else super(clockMs); }
  };
  try { globalThis.localStorage.clear(); } catch (_) {}
  try { globalThis.sessionStorage.clear?.(); } catch (_) {}

  const quietImports = muteConsole();
  const { Game } = await import(pathToFileURL(GAME_FILE).href);
  quietImports();
  const quietRun = muteConsole();
  const game = new Game();
  game.audio = null;
  game.selectedCharacter = 'skeleton_warrior';
  game.gameState = 'playing';
  shippedMapDimensions(game.mapManager);
  if (mode === 'act1') {
    game.reset();
    shippedMapDimensions(game.mapManager);
  } else if (mode === 'chaos') {
    game._beginChaosRun();
  } else {
    game.reset();
    game._enterEndless();
  }
  shippedMapDimensions(game.mapManager);
  game.gameState = 'playing';

  const bornAt = new WeakMap();
  const magnetTrace = new WeakMap();
  const observedBadRest = new Set();
  const observedBadCurrent = new Set();
  const metrics = {
    mode, seed, profile, seconds,
    runtimeErrors: [], generated: 0, collectedXp: 0, spawnedObjects: 0,
    collectedObjects: 0, mergedObjects: 0, mergeValue: 0,
    activeSamples: [], visibleSamples: [], cullSamples: [], ageSamples: [],
    peakActive: 0, peakVisible: 0, peakCullVisible: 0, peakCellCount: 0, peakCellValue: 0,
    badRestDistinct: 0, badCurrentDistinct: 0,
    collectionLatency: [], magnetLatency: [], magnetEfficiency: [],
    magnetStarts: 0, magnetAwayFrames: 0, magnetFrames: 0,
    updateUs: [], drawUs: [], tiersSeen: { small: 0, medium: 0, core: 0 },
  };

  let insideBurst = false;
  const originalSpawn = game.xpShards._spawn.bind(game.xpShards);
  game.xpShards._spawn = (...args) => {
    const shard = originalSpawn(...args);
    metrics.spawnedObjects++;
    bornAt.set(shard, clockMs / 1000);
    magnetTrace.delete(shard);
    observedBadRest.delete(shard);
    observedBadCurrent.delete(shard);
    return shard;
  };
  const originalRelease = game.xpShards._release.bind(game.xpShards);
  game.xpShards._release = shard => {
    if (insideBurst && !shard.dead) metrics.mergedObjects++;
    return originalRelease(shard);
  };
  const originalBurst = game.xpShards.spawnBurst.bind(game.xpShards);
  game.xpShards.spawnBurst = (x, y, total, radius, runtime) => {
    metrics.generated += Math.max(1, Math.round(total));
    insideBurst = true;
    try { originalBurst(x, y, total, radius, runtime); } finally { insideBurst = false; }
  };

  let insideShardUpdate = false;
  const originalGainXp = game.player.gainXp.bind(game.player);
  game.player.gainXp = (amount, texts) => {
    if (insideShardUpdate) metrics.collectedXp += amount;
    return originalGainXp(amount, texts);
  };
  const originalXpUpdate = game.xpShards.update.bind(game.xpShards);
  game.xpShards.update = (dt, runtime) => {
    const before = [...game.xpShards.active];
    const positions = new Map(before.map(s => [s, {
      x: s.x, y: s.y, d: Math.hypot(s.x - runtime.player.pos.x, s.y - runtime.player.pos.y),
      magnet: s.magnet,
    }]));
    const t0 = process.hrtime.bigint();
    insideShardUpdate = true;
    try { originalXpUpdate(dt, runtime); } finally { insideShardUpdate = false; }
    metrics.updateUs.push(Number(process.hrtime.bigint() - t0) / 1000);
    const after = new Set(game.xpShards.active);
    for (const shard of game.xpShards.active) {
      const prev = positions.get(shard);
      if (!prev || !shard.magnet) continue;
      let trace = magnetTrace.get(shard);
      if (!trace) {
        trace = { started: clockMs / 1000, entryDistance: Math.max(1, prev.d), path: 0 };
        magnetTrace.set(shard, trace);
        metrics.magnetStarts++;
      }
      trace.path += Math.hypot(shard.x - prev.x, shard.y - prev.y);
      const nowD = Math.hypot(shard.x - runtime.player.pos.x, shard.y - runtime.player.pos.y);
      metrics.magnetFrames++;
      if (nowD > prev.d + 0.25) metrics.magnetAwayFrames++;
    }
    for (const shard of before) if (!after.has(shard)) {
      if (shard.dead) {
        metrics.collectedObjects++;
        metrics.collectionLatency.push(clockMs / 1000 - (bornAt.get(shard) ?? clockMs / 1000));
        let trace = magnetTrace.get(shard);
        if (!trace) {
          trace = { started: clockMs / 1000, entryDistance: 1, path: 0 };
          metrics.magnetStarts++;
        }
        metrics.magnetLatency.push(clockMs / 1000 - trace.started);
        metrics.magnetEfficiency.push(trace.path / trace.entryDistance);
      } else {
        metrics.mergedObjects++;
        metrics.mergeValue += shard.value || 0;
      }
    }
  };

  const input = keys => ({ keys, mousePos: { x: 0, y: 0 }, mouseDown: false });
  const ctx = makeCtx();
  const totalFrames = Math.round(seconds / DT);
  for (let frame = 0; frame < totalFrames; frame++) {
    clockMs += DT * 1000;
    try {
      if (game.upgradeUI) game.selectUpgrade(0);
      if (game.mutationUI) game.selectMutation(0);
      if (game._postArenaChoice) game._selectPostArenaChoice(0);
      game.player.hp = game.player.maxHp;
      game.gameOver = false;
      const keys = new Set();
      if (profile === 'collector') {
        const p = game.player.pos;
        let target = null, best = Infinity;
        for (const shard of game.xpShards.active) {
          const d2 = (shard.x - p.x) ** 2 + (shard.y - p.y) ** 2;
          if (d2 < best) { best = d2; target = shard; }
        }
        if (!target) for (const enemy of game.enemies || []) {
          const d2 = (enemy.pos.x - p.x) ** 2 + (enemy.pos.y - p.y) ** 2;
          if (d2 < best) { best = d2; target = enemy.pos; }
        }
        if (target) {
          if (target.x > p.x + 8) keys.add('d'); else if (target.x < p.x - 8) keys.add('a');
          if (target.y > p.y + 8) keys.add('s'); else if (target.y < p.y - 8) keys.add('w');
        }
      }
      game.update(DT, input(keys));
    } catch (error) {
      metrics.runtimeErrors.push(String(error?.stack || error).slice(0, 500));
      break;
    }

    if (frame % 30 === 0) {
      const active = game.xpShards.active;
      const p = game.player.pos;
      const cells = new Map();
      let visible = 0, cullVisible = 0;
      for (const shard of active) {
        const dx = shard.x - p.x, dy = shard.y - p.y;
        if (Math.abs(dx) <= VIEW_HALF_W && Math.abs(dy) <= VIEW_HALF_H) visible++;
        if (dx * dx + dy * dy <= CULL_RADIUS * CULL_RADIUS) cullVisible++;
        const key = `${Math.floor(shard.x / CELL)},${Math.floor(shard.y / CELL)}`;
        const cell = cells.get(key) || { count: 0, value: 0 };
        cell.count++; cell.value += shard.value; cells.set(key, cell);
        metrics.tiersSeen[shard.tier]++;
        if (!walkable(game, mode, shard.tx, shard.ty, 12) && !observedBadRest.has(shard)) {
          observedBadRest.add(shard); metrics.badRestDistinct++;
        }
        if (!walkable(game, mode, shard.x, shard.y, 12) && !observedBadCurrent.has(shard)) {
          observedBadCurrent.add(shard); metrics.badCurrentDistinct++;
        }
        metrics.ageSamples.push(shard.t);
      }
      for (const cell of cells.values()) {
        metrics.peakCellCount = Math.max(metrics.peakCellCount, cell.count);
        metrics.peakCellValue = Math.max(metrics.peakCellValue, cell.value);
      }
      metrics.activeSamples.push(active.length);
      metrics.visibleSamples.push(visible);
      metrics.cullSamples.push(cullVisible);
      metrics.peakActive = Math.max(metrics.peakActive, active.length);
      metrics.peakVisible = Math.max(metrics.peakVisible, visible);
      metrics.peakCullVisible = Math.max(metrics.peakCullVisible, cullVisible);
      const d0 = process.hrtime.bigint();
      game.xpShards.draw(ctx, game);
      metrics.drawUs.push(Number(process.hrtime.bigint() - d0) / 1000);
    }
  }

  const active = game.xpShards.active;
  const groundXp = sum(active.map(s => s.value || 0));
  const route = accessibility(game, mode, active);
  const result = {
    mode, seed, profile, seconds,
    runtimeErrors: metrics.runtimeErrors,
    generated: metrics.generated,
    collectedXp: metrics.collectedXp,
    groundXp,
    unexplainedXp: metrics.generated - metrics.collectedXp - groundXp,
    spawnedObjects: metrics.spawnedObjects,
    collectedObjects: metrics.collectedObjects,
    mergedObjects: metrics.mergedObjects,
    objectBalance: metrics.spawnedObjects - metrics.collectedObjects - metrics.mergedObjects - active.length,
    finalActive: active.length,
    avgActive: round(mean(metrics.activeSamples)), peakActive: metrics.peakActive,
    avgVisible: round(mean(metrics.visibleSamples)), peakVisible: metrics.peakVisible,
    avgCullVisible: round(mean(metrics.cullSamples)), peakCullVisible: metrics.peakCullVisible,
    peakCellCount: metrics.peakCellCount, peakCellValue: metrics.peakCellValue,
    avgAge: round(mean(active.map(s => s.t))),
    maxAge: round(max(metrics.ageSamples)),
    badRestDistinct: metrics.badRestDistinct,
    badCurrentDistinct: metrics.badCurrentDistinct,
    unreachable: route.unreachable,
    behindObstacle: route.behindObstacle,
    collectionLatencyAvg: round(mean(metrics.collectionLatency)),
    collectionLatencyP95: round(quantile(metrics.collectionLatency, 0.95)),
    collectionLatencyMax: round(max(metrics.collectionLatency)),
    magnetStarts: metrics.magnetStarts,
    magnetLatencyAvg: round(mean(metrics.magnetLatency), 3),
    magnetLatencyP95: round(quantile(metrics.magnetLatency, 0.95), 3),
    magnetAwayRatio: round(metrics.magnetAwayFrames / Math.max(1, metrics.magnetFrames), 4),
    magnetEfficiencyAvg: round(mean(metrics.magnetEfficiency), 3),
    updateUsAvg: round(mean(metrics.updateUs), 3),
    updateUsP95: round(quantile(metrics.updateUs, 0.95), 3),
    drawUsAvg: round(mean(metrics.drawUs), 3),
    drawUsP95: round(quantile(metrics.drawUs, 0.95), 3),
    tiersSeen: Object.fromEntries(Object.entries(metrics.tiersSeen).map(([k, v]) => [k, v > 0])),
  };
  quietRun();
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

function runWorker(job) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SELF, '--worker', job.mode, String(job.seed),
      job.profile, String(job.seconds || RUN_SECONDS)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0 || !stdout.trim()) {
        reject(new Error(`${job.mode}/${job.seed}/${job.profile} worker failed (${code}): ${stderr.slice(-500)}`));
        return;
      }
      try { resolve(JSON.parse(stdout.trim().split(/\r?\n/).pop())); }
      catch (error) { reject(new Error(`invalid worker JSON: ${error.message}\n${stdout.slice(-500)}`)); }
    });
  });
}

async function runPool(jobs, concurrency = 4) {
  const results = new Array(jobs.length);
  let next = 0;
  async function runner() {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await runWorker(jobs[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, runner));
  return results;
}

const jobs = [];
for (const mode of MODES) for (const seed of SEEDS) {
  jobs.push({ mode, seed, profile: 'collector' });
}
for (const mode of MODES) jobs.push({ mode, seed: SEEDS[0], profile: 'stationary' });
const duplicateJob = { mode: 'endless', seed: SEEDS[0], profile: 'collector', seconds: RUN_SECONDS };
const sourceDigest = () => {
  const hash = createHash('sha256');
  for (const file of PRODUCTION_FILES) hash.update(readFileSync(file));
  return hash.digest('hex');
};
const sourceBefore = sourceDigest();

console.log('=== PHASE 5F XP WORLD DENSITY / ACCESSIBILITY AUDIT ===');
console.log('    12 natural production runs: 3 modes x 3 collector seeds + 1 stationary stress/mode');
console.log(`    ${RUN_SECONDS}s/run, real enemies, real starter weapon, no injected XP, exact ledger`);

// Some production schedulers still use real event-loop callbacks. Serial workers eliminate
// CPU-contention timing as a variable and make the long-run audit reproducible.
const results = await runPool(jobs, 1);
const [dupA, dupB] = await runPool([duplicateJob, duplicateJob], 1);
const sourceAfter = sourceDigest();
const collectors = results.filter(r => r.profile === 'collector');
const stationary = results.filter(r => r.profile === 'stationary');

for (const r of results) {
  console.log(
    `  ${r.mode.padEnd(7)} ${String(r.seed).padStart(8)} ${r.profile.padEnd(10)} ` +
    `XP=${r.generated}/${r.collectedXp}/${r.groundXp} active=${r.avgActive}/${r.peakActive} ` +
    `merged=${r.mergedObjects} visible=${r.avgVisible}/${r.peakVisible} ` +
    `cull=${r.avgCullVisible}/${r.peakCullVisible} cell=${r.peakCellCount} ` +
    `age=${r.avgAge}/${r.maxAge}s latency-p95=${r.collectionLatencyP95}s ` +
    `magnet-p95=${r.magnetLatencyP95}s ` +
    `invalid=${r.badRestDistinct} unreachable=${r.unreachable} ` +
    `update-p95=${r.updateUsP95}us draw-p95=${r.drawUsP95}us`,
  );
}

let pass = 0, fail = 0;
function gate(name, ok, note = '') {
  ok = ok === true;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` | ${note}` : ''}`);
}
const stable = r => {
  const { updateUsAvg, updateUsP95, drawUsAvg, drawUsP95, ...rest } = r;
  return rest;
};
console.log('\n-- Gates --');
gate('production sources stayed unchanged during the audit', sourceBefore === sourceAfter);
gate('deterministic repeated production run', JSON.stringify(stable(dupA)) === JSON.stringify(stable(dupB)));
gate('no runtime errors', results.every(r => r.runtimeErrors.length === 0));
gate('all natural collector runs generate and collect XP', collectors.every(r => r.generated > 0 && r.collectedXp > 0));
gate('exact XP conservation: generated = collected + ground', results.every(r => r.unexplainedXp === 0),
  `unexplained total=${sum(results.map(r => r.unexplainedXp))}`);
gate('exact shard object accounting across collection and merges', results.every(r => r.objectBalance === 0));
gate(`active world objects stay under desktop cap ${CAP}`, results.every(r => r.peakActive <= CAP),
  `peak=${Math.max(...results.map(r => r.peakActive))}`);
gate('resting XP on non-walkable geometry = 0', results.every(r => r.badRestDistinct === 0),
  `bad=${sum(results.map(r => r.badRestDistinct))}`);
gate('unreachable active XP = 0', results.every(r => r.unreachable === 0),
  `bad=${sum(results.map(r => r.unreachable))}`);
gate('collector p95 pickup latency <= 30s', collectors.every(r => r.collectionLatencyP95 <= 30),
  `worst=${Math.max(...collectors.map(r => r.collectionLatencyP95))}s`);
gate('magnet path is effectively monotonic', collectors.every(r => r.magnetAwayRatio <= 0.01),
  `worst away ratio=${Math.max(...collectors.map(r => r.magnetAwayRatio))}`);
gate('all three visual value tiers occur across natural play',
  ['small', 'medium', 'core'].every(tier => results.some(r => r.tiersSeen[tier])));
gate('collector viewport remains readable (peak <= 120 shards)', collectors.every(r => r.peakVisible <= 120),
  `peak=${Math.max(...collectors.map(r => r.peakVisible))}`);
gate('collector has no dense XP carpet (<= 24 shards / 96px cell)', collectors.every(r => r.peakCellCount <= 24),
  `peak=${Math.max(...collectors.map(r => r.peakCellCount))}`);
gate('stationary field has no permanent carpet (oldest <= 120s and cell <= 32)',
  stationary.every(r => r.maxAge <= 120 && r.peakCellCount <= 32),
  `oldest=${Math.max(...stationary.map(r => r.maxAge))}s cell=${Math.max(...stationary.map(r => r.peakCellCount))}`);
gate('XP update p95 <= 2ms headless', results.every(r => r.updateUsP95 <= 2000),
  `worst=${Math.max(...results.map(r => r.updateUsP95))}us`);
gate('XP draw p95 <= 5ms headless', results.every(r => r.drawUsP95 <= 5000),
  `worst=${Math.max(...results.map(r => r.drawUsP95))}us`);

const sourceLine = (file, needle) => {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const index = lines.findIndex(line => line.includes(needle));
  return index < 0 ? 'not found' : `${path.relative(ROOT, file).replaceAll('\\', '/')}:${index + 1}`;
};
console.log('\n-- Production evidence --');
console.log(`  cap/merge trigger: ${sourceLine(XP_FILE, 'if (this.active.length > CAP)')}`);
console.log(`  shard lifetime has no expiry path: ${sourceLine(XP_FILE, 's.t += dt')}`);
console.log(`  straight-line magnet integration: ${sourceLine(XP_FILE, 's.x += (dx / d) * s.vm * dt')}`);
console.log(`  canonical pickup correction: ${sourceLine(GAME_FILE, '_clampPickupPos(pos, radius = 18)')}`);
console.log(`  natural enemy XP drop entry: ${sourceLine(path.join(ROOT, 'js/entities/Enemy.js'), 'xpShards.spawnBurst')}`);

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
