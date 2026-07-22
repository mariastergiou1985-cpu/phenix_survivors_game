// Phase 5 spawn/wave audit. Production modules are observed without mutating production values.
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./strip-v-loader.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const JS = path.join(ROOT, 'js');
const moduleUrl = relativePath => pathToFileURL(path.join(JS, relativePath)).href;

const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

const restoreImports = muteConsole();
const { Game } = await import(moduleUrl('game/Game.js'));
const { WaveDirector, STAGE_WAVES } = await import(moduleUrl('game/WaveDirector.js'));
const { MATRIX_RADIUS } = await import(moduleUrl('constants.js'));
restoreImports();

const MODES = ['act1', 'endless', 'chaos'];
const SEEDS = [7331, 20260722, 0xC0FFEE];
const BATCHES_PER_FORMATION = 4;
const MIN_USEFUL_DISTANCE = 220;
const ROUTE_STEP = 36;
const SOURCES = {
  game: path.join(JS, 'game/Game.js'),
  map: path.join(JS, 'game/MapManager.js'),
  wave: path.join(JS, 'game/WaveDirector.js'),
};

const mulberry32 = initial => {
  let state = initial >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
};

const pct = (part, total) => total ? `${(part * 100 / total).toFixed(2)}%` : '0.00%';
const fmt = value => Number.isFinite(value) ? value.toFixed(1) : 'n/a';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pointToRect = (x, y, x0, y0, x1, y1) => {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dy = Math.max(y0 - y, 0, y - y1);
  return Math.hypot(dx, dy);
};

function shippedMapDimensions(map) {
  map._shipImg = { complete: true, naturalWidth: 1916, naturalHeight: 821 };
  map._cityImg = { complete: true, naturalWidth: 1672, naturalHeight: 519 };
  map._chaosDeckImg = { complete: true, naturalWidth: 1672, naturalHeight: 440 };
  map._act1BoundsCache = null;
}

function setupGame(mode) {
  const game = new Game();
  game.audio = null;
  game.selectedCharacter = 'skeleton_warrior';
  shippedMapDimensions(game.mapManager);
  game.reset();
  shippedMapDimensions(game.mapManager);
  if (mode === 'endless') game._enterEndless();
  if (mode === 'chaos') game._beginChaosRun();
  shippedMapDimensions(game.mapManager);
  game.gameState = 'playing';
  game._campaignStage = 0;
  game._updateCamera();
  return game;
}

function walkableFootprint(game, mode, x, y, radius) {
  if (mode !== 'act1') return game.mapManager.isWalkableFootprint(x, y, radius, mode);
  const bounds = game.mapManager.getAct1DeckBounds();
  return !!bounds && x - radius >= bounds.x0 && x + radius <= bounds.x1
    && y - radius >= bounds.y0 && y + radius <= bounds.y1;
}

function nearestObstacleDistance(game, mode, point) {
  if (mode === 'act1') {
    const b = game.mapManager.getAct1DeckBounds();
    if (!b) return Infinity;
    if (point.x < b.x0 || point.x > b.x1 || point.y < b.y0 || point.y > b.y1) return 0;
    return Math.min(point.x - b.x0, b.x1 - point.x, point.y - b.y0, b.y1 - point.y);
  }
  const map = game.mapManager;
  const model = map._walkModel(mode);
  if (!model) return Infinity;
  const scale = model.scale;
  const y0 = model.rows[0] * scale;
  const y1 = model.rows[1] * scale;
  let best = point.y >= y0 && point.y <= y1 ? Math.min(point.y - y0, y1 - point.y) : 0;
  const period = model.tileW * 2 * scale;
  const basePeriod = Math.floor(point.x / period);
  for (let k = basePeriod - 1; k <= basePeriod + 1; k++) {
    const base = k * period;
    for (const [bx0, bx1, by0, by1] of model.blocks) {
      const rects = [
        [base + bx0 * scale, by0 * scale, base + bx1 * scale, by1 * scale],
        [base + (2 * model.tileW - bx1) * scale, by0 * scale,
          base + (2 * model.tileW - bx0) * scale, by1 * scale],
      ];
      for (const rect of rects) best = Math.min(best, pointToRect(point.x, point.y, ...rect));
    }
  }
  return best;
}

function segmentWalkable(game, mode, from, to, radius, step = 24) {
  const d = distance(from, to);
  const samples = Math.max(1, Math.ceil(d / step));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    if (!walkableFootprint(game, mode,
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      radius)) return false;
  }
  return true;
}

function routeExists(game, mode, from, to, radius) {
  if (!walkableFootprint(game, mode, from.x, from.y, radius)
      || !walkableFootprint(game, mode, to.x, to.y, radius)) return false;
  if (segmentWalkable(game, mode, from, to, radius)) return true;
  if (mode === 'act1') return true;

  const margin = 1100;
  const minX = Math.min(from.x, to.x) - margin;
  const maxX = Math.max(from.x, to.x) + margin;
  const model = game.mapManager._walkModel(mode);
  const minY = model.rows[0] * model.scale + radius;
  const maxY = model.rows[1] * model.scale - radius;
  const key = (ix, iy) => `${ix},${iy}`;
  const queue = [{ x: from.x, y: from.y, ix: 0, iy: 0 }];
  const seen = new Set([key(0, 0)]);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let cursor = 0;
  while (cursor < queue.length && cursor < 7000) {
    const node = queue[cursor++];
    if (distance(node, to) <= ROUTE_STEP * 1.6
        && segmentWalkable(game, mode, node, to, radius, 18)) return true;
    for (const [dx, dy] of directions) {
      const ix = node.ix + dx;
      const iy = node.iy + dy;
      const id = key(ix, iy);
      if (seen.has(id)) continue;
      const x = from.x + ix * ROUTE_STEP;
      const y = from.y + iy * ROUTE_STEP;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (!walkableFootprint(game, mode, x, y, radius)) continue;
      if (!segmentWalkable(game, mode, node, { x, y }, radius, 18)) continue;
      seen.add(id);
      queue.push({ x, y, ix, iy });
    }
  }
  return false;
}

function makeMetrics(mode) {
  return {
    mode,
    seeds: new Map(),
    spawns: 0,
    requestedDistances: [],
    finalDistances: [],
    corrections: [],
    obstacleClearances: [],
    quadrants: [0, 0, 0, 0],
    invalidFootprints: 0,
    invalidRoutes: 0,
    insideViewport: 0,
    tooClose: 0,
    matrixOverlaps: 0,
    exactPileups: 0,
    bodyOverlaps: 0,
    maxOverlap: 0,
    eliteInvalidAfterGrowth: 0,
    byFormation: new Map(),
    probeFailures: [],
    examples: {
      invalidFootprint: [],
      invalidRoute: [],
      insideViewport: [],
      tooClose: [],
      matrixOverlap: [],
      pileup: [],
    },
  };
}

function keepExample(list, value) {
  if (list.length < 3) list.push(value);
}

function recordSpawn(metrics, game, mode, seed, formation, requested, enemy, batch) {
  const player = game.player.pos;
  const final = { x: enemy.pos.x, y: enemy.pos.y };
  const radius = enemy.radius || 14;
  const requestedDistance = distance(requested, player);
  const finalDistance = distance(final, player);
  const correction = distance(requested, final);
  const dx = final.x - player.x;
  const dy = final.y - player.y;
  const quadrant = (dx >= 0 ? 1 : 0) + (dy >= 0 ? 2 : 0);
  const footprintValid = walkableFootprint(game, mode, final.x, final.y, radius);
  const routeValid = footprintValid && routeExists(game, mode, final, player, radius);
  const inViewport = final.x >= game.camera.x && final.x <= game.camera.x + game._viewW
    && final.y >= game.camera.y && final.y <= game.camera.y + game._viewH;
  const matrixOverlap = (game.matrices || []).some(matrix => matrix?.pos
    && distance(final, matrix.pos) < radius + MATRIX_RADIUS);
  const example = `${seed}/${formation} req=(${fmt(requested.x)},${fmt(requested.y)}) final=(${fmt(final.x)},${fmt(final.y)}) r=${fmt(radius)} d=${fmt(finalDistance)} corr=${fmt(correction)}`;
  let overlap = 0;
  for (const previous of batch) {
    const d = distance(final, previous.pos);
    if (d < radius + previous.radius) {
      overlap++;
      metrics.bodyOverlaps++;
      if (d < 2) {
        metrics.exactPileups++;
        keepExample(metrics.examples.pileup, `${example} overlap=${fmt(d)}px`);
      }
    }
  }
  metrics.maxOverlap = Math.max(metrics.maxOverlap, overlap);
  metrics.spawns++;
  metrics.requestedDistances.push(requestedDistance);
  metrics.finalDistances.push(finalDistance);
  metrics.corrections.push(correction);
  metrics.obstacleClearances.push(nearestObstacleDistance(game, mode, final));
  metrics.quadrants[quadrant]++;
  if (!footprintValid) {
    metrics.invalidFootprints++;
    keepExample(metrics.examples.invalidFootprint, example);
  }
  if (!routeValid) {
    metrics.invalidRoutes++;
    keepExample(metrics.examples.invalidRoute, example);
  }
  if (inViewport) {
    metrics.insideViewport++;
    keepExample(metrics.examples.insideViewport, example);
  }
  if (finalDistance < MIN_USEFUL_DISTANCE) {
    metrics.tooClose++;
    keepExample(metrics.examples.tooClose, example);
  }
  if (matrixOverlap) {
    metrics.matrixOverlaps++;
    keepExample(metrics.examples.matrixOverlap, example);
  }
  if (enemy.isElite && !footprintValid) metrics.eliteInvalidAfterGrowth++;
  const formationMetric = metrics.byFormation.get(formation) || { spawns: 0, quadrants: [0, 0, 0, 0] };
  formationMetric.spawns++;
  formationMetric.quadrants[quadrant]++;
  metrics.byFormation.set(formation, formationMetric);
  const seedMetric = metrics.seeds.get(seed) || { spawns: 0, quadrants: [0, 0, 0, 0] };
  seedMetric.spawns++;
  seedMetric.quadrants[quadrant]++;
  metrics.seeds.set(seed, seedMetric);
  batch.push({ pos: final, radius });
}

function applyProductionDeckClamp(game, enemy) {
  const bounds = game.getWalkableBounds();
  if (!bounds) return;
  if (Number.isFinite(bounds.x0)) enemy.pos.x = Math.max(bounds.x0, Math.min(bounds.x1, enemy.pos.x));
  enemy.pos.y = Math.max(bounds.y0, Math.min(bounds.y1, enemy.pos.y));
}

function spawnProbe(game, mode, requested, existing = []) {
  game.enemies.length = 0;
  game.enemies.push(...existing);
  const before = game.enemies.length;
  game.spawnEnemy('Scrap Scavenger', requested, false);
  const enemy = game.enemies[before];
  if (!enemy) return null;
  applyProductionDeckClamp(game, enemy);
  return enemy;
}

function runExclusionProbes(game, mode, metrics) {
  const radius = 14;
  const matrix = (game.matrices || []).find(item => item?.pos);
  if (matrix) {
    const enemy = spawnProbe(game, mode, { x: matrix.pos.x, y: matrix.pos.y });
    if (enemy && distance(enemy.pos, matrix.pos) < (enemy.radius || radius) + MATRIX_RADIUS) {
      metrics.probeFailures.push(`Matrix/base exclusion: spawn ${fmt(distance(enemy.pos, matrix.pos))}px από κέντρο Matrix`);
    }
  }

  const mapMode = mode === 'act1' ? null : mode;
  let hazardPoint = { x: game.player.pos.x + 520, y: game.player.pos.y };
  if (mapMode) hazardPoint = game.mapManager.findSafeSpawnPoint({
    ...hazardPoint, radius: 64, mode: mapMode, avoid: [game.player.pos], minDist: 320,
  });
  const placedHazard = game.placeGroundHazard(hazardPoint.x, hazardPoint.y, 64);
  if (placedHazard) {
    game.lightningZones = [{ pos: { x: placedHazard.x, y: placedHazard.y }, radius: 64, t: 0, warn: 1, flash: 1 }];
    const enemy = spawnProbe(game, mode, { x: placedHazard.x, y: placedHazard.y });
    if (enemy && distance(enemy.pos, placedHazard) < (enemy.radius || radius) + 64) {
      metrics.probeFailures.push(`hazard exclusion: spawn ${fmt(distance(enemy.pos, placedHazard))}px από ενεργό hazard`);
    }
  }

  let overlapPoint = { x: game.player.pos.x - 520, y: game.player.pos.y };
  if (mapMode) overlapPoint = game.mapManager.findSafeSpawnPoint({
    ...overlapPoint, radius, mode: mapMode, avoid: [game.player.pos], minDist: 320,
  });
  const blocker = { pos: { x: overlapPoint.x, y: overlapPoint.y }, radius, hp: 100 };
  const enemy = spawnProbe(game, mode, { x: overlapPoint.x, y: overlapPoint.y }, [blocker]);
  if (enemy && distance(enemy.pos, blocker.pos) < (enemy.radius || radius) + blocker.radius) {
    metrics.probeFailures.push(`enemy-overlap exclusion: spawn ${fmt(distance(enemy.pos, blocker.pos))}px από υπάρχον enemy`);
  }
  game.enemies.length = 0;
}

function auditMode(mode) {
  const metrics = makeMetrics(mode);
  for (const seed of SEEDS) {
    Math.random = mulberry32(seed ^ (mode === 'act1' ? 0xA11 : mode === 'endless' ? 0xE11 : 0xC405));
    const restoreRun = muteConsole();
    const game = setupGame(mode);
    const director = new WaveDirector();
    const table = STAGE_WAVES[mode];

    for (const block of table) {
      game.timeAlive = block.start + Math.min(30, Math.max(1, (block.end - block.start) / 2));
      game._updateCamera();
      for (const formation of block.formations) {
        for (let batchIndex = 0; batchIndex < BATCHES_PER_FORMATION; batchIndex++) {
          game.enemies.length = 0;
          director._formAngle = Math.random() * Math.PI * 2;
          const count = block.batch + Math.min(6, Math.ceil(block.targetAlive / 12));
          const plan = director.spawnPlan(formation, count, game.camera, game._viewW, game._viewH);
          const batch = [];
          let first = true;
          for (const requested of plan) {
            const type = first
              ? null
              : requested.hint
                ? director.pickFromHint(mode, requested.hint)
                : director.pickEnemy(block);
            first = false;
            const before = game.enemies.length;
            game.spawnEnemy(type, { x: requested.x, y: requested.y }, !!requested.elite);
            const enemy = game.enemies[before];
            if (!enemy) continue;
            applyProductionDeckClamp(game, enemy);
            recordSpawn(metrics, game, mode, seed, formation, requested, enemy, batch);
          }
        }
      }
    }
    if (seed === SEEDS[0]) runExclusionProbes(game, mode, metrics);
    restoreRun();
  }
  return metrics;
}

function lineOf(file, needle) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const index = lines.findIndex(line => line.includes(needle));
  return index < 0 ? '?' : index + 1;
}

function sourceRef(fileKey, needle) {
  return `${path.relative(ROOT, SOURCES[fileKey]).replaceAll('\\', '/')}:${lineOf(SOURCES[fileKey], needle)}`;
}

function pacing(mode) {
  const table = STAGE_WAVES[mode];
  const rates = table.map(block => block.batch / block.interval);
  return {
    blocks: table.length,
    targetMin: Math.min(...table.map(block => block.targetAlive)),
    targetMax: Math.max(...table.map(block => block.targetAlive)),
    intervalMin: Math.min(...table.map(block => block.interval)),
    intervalMax: Math.max(...table.map(block => block.interval)),
    rateMin: Math.min(...rates),
    rateMax: Math.max(...rates),
  };
}

const originalRandom = Math.random;
const results = [];
try {
  for (const mode of MODES) results.push(auditMode(mode));
} finally {
  Math.random = originalRandom;
}

let pass = 0;
let fail = 0;
const failures = [];
function gate(name, ok, detail) {
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}: ${detail}`);
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

console.log('=== PHASE 5 - SPAWN / WAVE DISTRIBUTION AUDIT ===');
console.log(`Seeds: ${SEEDS.join(', ')} | ${BATCHES_PER_FORMATION} batches ανά formation/block\n`);

for (const metrics of results) {
  const total = metrics.spawns;
  const p = pacing(metrics.mode);
  const maxQuadrant = Math.max(...metrics.quadrants);
  const left = metrics.quadrants[0] + metrics.quadrants[2];
  const right = metrics.quadrants[1] + metrics.quadrants[3];
  const top = metrics.quadrants[0] + metrics.quadrants[1];
  const bottom = metrics.quadrants[2] + metrics.quadrants[3];
  const lrBias = Math.abs(left - right) / total;
  const tbBias = Math.abs(top - bottom) / total;
  console.log(`-- ${metrics.mode.toUpperCase()} --`);
  console.log(`  spawns=${total}, quadrants=${metrics.quadrants.join('/')}, max-share=${pct(maxQuadrant, total)}, LR-bias=${pct(Math.abs(left - right), total)}, TB-bias=${pct(Math.abs(top - bottom), total)}`);
  console.log(`  distance requested min/median/p95=${fmt(Math.min(...metrics.requestedDistances))}/${fmt(quantile(metrics.requestedDistances, 0.5))}/${fmt(quantile(metrics.requestedDistances, 0.95))}px`);
  console.log(`  distance final     min/median/p95=${fmt(Math.min(...metrics.finalDistances))}/${fmt(quantile(metrics.finalDistances, 0.5))}/${fmt(quantile(metrics.finalDistances, 0.95))}px`);
  console.log(`  correction         median/p95/max=${fmt(quantile(metrics.corrections, 0.5))}/${fmt(quantile(metrics.corrections, 0.95))}/${fmt(Math.max(...metrics.corrections))}px`);
  console.log(`  nearest obstacle   min/median=${fmt(Math.min(...metrics.obstacleClearances))}/${fmt(quantile(metrics.obstacleClearances, 0.5))}px`);
  console.log(`  invalid footprint=${metrics.invalidFootprints}, invalid route=${metrics.invalidRoutes}, inside viewport=${metrics.insideViewport}, <${MIN_USEFUL_DISTANCE}px=${metrics.tooClose}`);
  console.log(`  organic matrix overlap=${metrics.matrixOverlaps}, body-overlap pairs=${metrics.bodyOverlaps}, exact pileups=${metrics.exactPileups}, max overlap/spawn=${metrics.maxOverlap}, elite-invalid=${metrics.eliteInvalidAfterGrowth}`);
  console.log(`  pacing blocks=${p.blocks}, targetAlive=${p.targetMin}-${p.targetMax}, interval=${p.intervalMin.toFixed(2)}-${p.intervalMax.toFixed(2)}s, nominal batch rate=${p.rateMin.toFixed(1)}-${p.rateMax.toFixed(1)}/s`);
  for (const [seed, seedMetric] of metrics.seeds) {
    const seedMax = Math.max(...seedMetric.quadrants);
    console.log(`  seed ${seed}: n=${seedMetric.spawns}, quadrants=${seedMetric.quadrants.join('/')}, max-share=${pct(seedMax, seedMetric.spawns)}`);
  }
  for (const [kind, examples] of Object.entries(metrics.examples)) {
    if (examples.length) console.log(`  examples ${kind}: ${examples.join(' | ')}`);
  }
  if (metrics.probeFailures.length) console.log(`  exclusion probes: ${metrics.probeFailures.join(' | ')}`);

  gate(`${metrics.mode}: κάθε τελικό footprint είναι walkable`, metrics.invalidFootprints === 0,
    `${metrics.invalidFootprints}/${total} invalid`);
  gate(`${metrics.mode}: κάθε spawn έχει route προς player`, metrics.invalidRoutes === 0,
    `${metrics.invalidRoutes}/${total} invalid`);
  gate(`${metrics.mode}: κανένα spawn μέσα στο useful-distance gate`, metrics.tooClose === 0,
    `${metrics.tooClose}/${total} κάτω από ${MIN_USEFUL_DISTANCE}px`);
  gate(`${metrics.mode}: κανένα διορθωμένο spawn μέσα στο viewport`, metrics.insideViewport === 0,
    `${metrics.insideViewport}/${total} μέσα στο viewport`);
  gate(`${metrics.mode}: χωρίς συστηματικό one-side bias`, maxQuadrant / total <= 0.40 && lrBias <= 0.18 && tbBias <= 0.18,
    `max quadrant=${pct(maxQuadrant, total)}, LR=${pct(Math.abs(left - right), total)}, TB=${pct(Math.abs(top - bottom), total)}`);
  gate(`${metrics.mode}: bounded οργανικό overlap`, metrics.exactPileups === 0 && metrics.maxOverlap <= 4,
    `exact=${metrics.exactPileups}, max=${metrics.maxOverlap}`);
  gate(`${metrics.mode}: οργανικά spawns εκτός Matrix/base`, metrics.matrixOverlaps === 0,
    `${metrics.matrixOverlaps}/${total} overlaps`);
  gate(`${metrics.mode}: resolver αποκλείει Matrix/hazard/enemy`, metrics.probeFailures.length === 0,
    metrics.probeFailures.join(' | '));
  console.log('');
}

console.log('-- Production root causes --');
console.log(`  1. ${sourceRef('game', '_walkMode()')} και ${sourceRef('game', 'return null;                       // Act 1')}: το Act 1 παρακάμπτει το footprint-aware spawn resolver.`);
console.log(`  2. ${sourceRef('game', 'if (isFinite(_db.x0)) e.pos.x')}–${sourceRef('game', 'e.pos.y = Math.max(_db.y0')}: το post-spawn clamp περιορίζει μόνο το κέντρο, όχι ολόκληρο το radius.`);
console.log(`  3. ${sourceRef('game', 'e.isElite = true; e.hp')}–${sourceRef('game', 'e._baseSpeedFull *= 1.10; e.radius *= 1.2')}: το elite radius μεγαλώνει μετά τον έλεγχο της θέσης.`);
console.log(`  4. ${sourceRef('game', 'avoid: this.player ? [this.player.pos]')}: ο resolver αποφεύγει μόνο τον player.`);
console.log(`  5. ${sourceRef('map', 'for (const a of avoid)')}: το canonical findSafeSpawnPoint υποστηρίζει avoid-list, αλλά δεν λαμβάνει Matrix, hazards ή υπάρχοντες enemies από τον caller.`);
console.log(`  6. ${sourceRef('wave', 'const R = () => halfDiag + m()')}: το WaveDirector ζητά σωστά off-screen ακτίνα, αλλά η τελική διόρθωση/clamp μπορεί να ακυρώσει αυτή την εγγύηση.`);

console.log('\n-- Targeted recommendations --');
console.log('  A. Κάνε το resolveEnemySpawn κοινό για Act 1/Endless/Chaos και έλεγξε ολόκληρο το τελικό footprint μετά από κάθε radius mutation/clamp.');
console.log('  B. Πέρασε bounded avoid zones για Matrix/base, ενεργά ground hazards και κοντινά enemy bodies στο findSafeSpawnPoint.');
console.log('  C. Μετά από elite scaling ή corridor nudge, κάνε μία τελική bounded revalidation χωρίς μεταβολή enemy stats.');
console.log('  D. Διατήρησε formation intent, αλλά αν correction φέρει spawn εντός viewport, κάνε lateral retry στο ίδιο sector αντί για center-only clamp.');

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
if (failures.length) {
  console.log('Αποτυχίες:');
  for (const item of failures) console.log(`  - ${item}`);
}
process.exitCode = fail ? 1 : 0;
