// POWER MATRIX PLACEMENT REGRESSION - real runtime modules, deterministic and browser-free.
// Run: node tools/qa/power_matrix_placement_regression.mjs (exit 1 on any failure)
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

register('./strip-v-loader.mjs', import.meta.url);

globalThis.window = globalThis;
globalThis.document = {
  addEventListener() {},
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, getContext: () => null, addEventListener() {} }),
};
globalThis.Image = class {
  constructor() { this.complete = false; this.naturalWidth = 0; this.onerror = null; }
  set src(_) {}
};
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.resolve(HERE, '../../js');
const moduleUrl = relativePath => pathToFileURL(path.join(JS, relativePath)).href;
const { Game } = await import(moduleUrl('game/Game.js'));
const { NexusManager } = await import(moduleUrl('game/NexusManager.js'));
const { MapManager, BIOME_ID } = await import(moduleUrl('game/MapManager.js'));
const {
  WIDTH, HEIGHT, WORLD_W, WORLD_H, VIEW_SCALE, ENDLESS_VIEW_SCALE, MATRIX_RADIUS,
} = await import(moduleUrl('constants.js'));

const NEXUS_FOOTPRINT = 44;       // NexusManager's body + interaction footprint.
const MIN_SPACING = 900;          // Existing production placement contract.
const START_AREA_RADIUS = 360;    // Clear combat radius around the run spawn.
const MAX_PER_VIEWPORT = 2;       // Existing production density contract.
const START = { x: WORLD_W / 2, y: WORLD_H / 2 };
const HAZARD_RADII = [26, 58, 64, 66, 68, 70, 74, 78, 190];

let pass = 0;
let fail = 0;
const failures = [];
const T = (name, check) => {
  let ok = false;
  let note = '';
  try {
    const result = check();
    ok = result === true;
    if (typeof result === 'string') note = result;
  } catch (error) {
    note = `THREW: ${error.message}`;
  }
  if (ok) pass++;
  else { fail++; failures.push(`${name}${note ? ` - ${note}` : ''}`); }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` - ${note}` : ''}`);
};

const makeMap = () => {
  const map = new MapManager({});
  map._shipImg = { complete: true, naturalWidth: 1916, naturalHeight: 821 };
  map._cityImg = { complete: true, naturalWidth: 1672, naturalHeight: 519 };
  map._chaosDeckImg = { complete: true, naturalWidth: 1672, naturalHeight: 440 };
  return map;
};

const makeAct1 = (map = makeMap()) => {
  const manager = new NexusManager({ endless: false });
  manager.mapManager = map;
  manager.init(WORLD_W, WORLD_H);
  return manager;
};

const makeEndless = (map = makeMap()) => {
  const manager = makeAct1(map);
  manager.repositionForEndless();
  return manager;
};

const makeDirectEndless = (map = makeMap()) => {
  const manager = new NexusManager({ endless: true });
  manager.mapManager = map;
  manager.init(WORLD_W, WORLD_H);
  return manager;
};

const positions = manager => manager.matrices.map(m => ({ x: m.pos.x, y: m.pos.y }));
const formatPoint = p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const closestPair = points => {
  let best = { distance: Infinity, a: null, b: null };
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = distance(points[i], points[j]);
      if (d < best.distance) best = { distance: d, a: points[i], b: points[j] };
    }
  }
  return best;
};

const closestToStart = points => points.reduce((best, point) => {
  const d = distance(point, START);
  return d < best.distance ? { point, distance: d } : best;
}, { point: null, distance: Infinity });

// A maximum-density viewport can always be shifted until one edge touches a point.
const maxViewportDensity = (points, width, height) => {
  if (!points.length) return { count: 0, x: 0, y: 0 };
  const xs = points.flatMap(p => [p.x, p.x - width]);
  const ys = points.flatMap(p => [p.y, p.y - height]);
  let best = { count: 0, x: 0, y: 0 };
  for (const x of xs) {
    for (const y of ys) {
      const count = points.filter(p => p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height).length;
      if (count > best.count) best = { count, x, y };
    }
  }
  return best;
};

const layoutSnapshot = manager => JSON.stringify({
  active: manager.matrices.map(m => [m.biomeId, +m.pos.x.toFixed(4), +m.pos.y.toFixed(4)]),
  outer: manager.outerRecords.map(r => [r.biomeId, r.sector, r.x, r.y]),
});

const withSeed = (initialSeed, fn) => {
  const originalRandom = Math.random;
  let seed = initialSeed >>> 0;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  try { return fn(); }
  finally { Math.random = originalRandom; }
};

const settleOuter = (manager, biomeId) => {
  for (let i = 0; i < 50; i++) manager._syncOuterNexus(biomeId, 1 / 60);
  return manager.matrices.find(m => m.isOuterNexus) || null;
};

console.log('=== POWER MATRIX PLACEMENT REGRESSION ===');

console.log('\n-- A. Active runtime ownership --');
const resetSource = Game.prototype.reset.toString();
T('Game.reset uses NexusManager.init as the active placement path', () =>
  resetSource.includes('this.nexusManager.init(WORLD_W, WORLD_H)')
  && !resetSource.includes('this._createMatrices()'));
T('Game.reset re-aliases matrices to the manager-owned array', () =>
  resetSource.includes('this.matrices = this.nexusManager.matrices'));

console.log('\n-- B. Act 1 placement --');
const act1Map = makeMap();
const act1 = makeAct1(act1Map);
const act1Points = positions(act1);
const act1Bounds = act1Map.getAct1DeckBounds();
const act1Pair = closestPair(act1Points);
const act1Start = closestToStart(act1Points);
const act1Density = maxViewportDensity(act1Points, WIDTH / VIEW_SCALE, HEIGHT / VIEW_SCALE);

T('Act 1 creates exactly four matrices', () => act1Points.length === 4 || `got ${act1Points.length}`);
T(`Act 1 minimum spacing is at least ${MIN_SPACING}px`, () =>
  act1Pair.distance >= MIN_SPACING
    || `closest ${act1Pair.distance.toFixed(1)}px at ${formatPoint(act1Pair.a)} / ${formatPoint(act1Pair.b)}`);
T('Act 1 matrix footprints stay inside the real deck bounds', () => {
  const bad = act1Points.filter(p => p.x - NEXUS_FOOTPRINT < act1Bounds.x0
    || p.x + NEXUS_FOOTPRINT > act1Bounds.x1
    || p.y - NEXUS_FOOTPRINT < act1Bounds.y0
    || p.y + NEXUS_FOOTPRINT > act1Bounds.y1);
  return bad.length === 0 || `${bad.length} invalid: ${bad.map(formatPoint).join(', ')}`;
});
T('Act 1 matrices do not overlap the start clear area', () => {
  const required = START_AREA_RADIUS + MATRIX_RADIUS;
  return act1Start.distance >= required
    || `closest ${act1Start.distance.toFixed(1)}px at ${formatPoint(act1Start.point)}, required ${required}px`;
});
T(`Act 1 viewport density is at most ${MAX_PER_VIEWPORT}`, () =>
  act1Density.count <= MAX_PER_VIEWPORT
    || `found ${act1Density.count} in one ${(WIDTH / VIEW_SCALE).toFixed(1)}x${(HEIGHT / VIEW_SCALE).toFixed(1)} viewport`);

console.log('\n-- C. Endless and Chaos placement --');
const endlessMap = makeMap();
const endless = makeEndless(endlessMap);
const endlessCentral = endless.matrices.filter(m => !m.isOuterNexus);
const endlessPoints = endlessCentral.map(m => m.pos);
const endlessPair = closestPair(endlessPoints);
const endlessStart = closestToStart(endlessPoints);
const endlessDensity = maxViewportDensity(endlessPoints, WIDTH / ENDLESS_VIEW_SCALE, HEIGHT / ENDLESS_VIEW_SCALE);

T('Endless keeps exactly four permanent central matrices', () =>
  endlessCentral.length === 4 || `got ${endlessCentral.length}`);
T(`Endless central minimum spacing is at least ${MIN_SPACING}px`, () =>
  endlessPair.distance >= MIN_SPACING
    || `closest ${endlessPair.distance.toFixed(1)}px at ${formatPoint(endlessPair.a)} / ${formatPoint(endlessPair.b)}`);
T('Endless central matrix footprints are walkable', () => {
  const bad = endlessPoints.filter(p => !endlessMap.isWalkableFootprint(p.x, p.y, NEXUS_FOOTPRINT, 'endless'));
  return bad.length === 0 || `${bad.length} invalid: ${bad.map(formatPoint).join(', ')}`;
});
T('Chaos central matrix footprints are walkable', () => {
  const bad = endlessPoints.filter(p => !endlessMap.isWalkableFootprint(p.x, p.y, NEXUS_FOOTPRINT, 'chaos'));
  return bad.length === 0 || `${bad.length} invalid: ${bad.map(formatPoint).join(', ')}`;
});
T('Endless matrices do not overlap the start clear area', () => {
  const required = START_AREA_RADIUS + MATRIX_RADIUS;
  return endlessStart.distance >= required
    || `closest ${endlessStart.distance.toFixed(1)}px at ${formatPoint(endlessStart.point)}, required ${required}px`;
});
T(`Endless viewport density is at most ${MAX_PER_VIEWPORT}`, () =>
  endlessDensity.count <= MAX_PER_VIEWPORT
    || `found ${endlessDensity.count} in one ${(WIDTH / ENDLESS_VIEW_SCALE).toFixed(1)}x${(HEIGHT / ENDLESS_VIEW_SCALE).toFixed(1)} viewport`);

const outerBiomes = [
  BIOME_ID.INDUSTRIAL_CORE,
  BIOME_ID.ABYSSAL_TRENCH,
  BIOME_ID.GLACIAL_EXPANSE,
  BIOME_ID.ORBITAL_NEXUS,
  BIOME_ID.DATA_WASTES,
];
const outerPlacements = [];
for (const biomeId of outerBiomes) {
  const outer = settleOuter(endless, biomeId);
  if (outer) outerPlacements.push({ biomeId, x: outer.pos.x, y: outer.pos.y });
}
T('all five streamed outer matrices instantiate', () =>
  outerPlacements.length === outerBiomes.length || `got ${outerPlacements.length}`);
T('streamed outer matrix footprints are walkable after correction', () => {
  const bad = outerPlacements.filter(p => !endlessMap.isWalkableFootprint(p.x, p.y, NEXUS_FOOTPRINT, 'endless'));
  return bad.length === 0 || `${bad.length} invalid: ${bad.map(p => `${p.biomeId}${formatPoint(p)}`).join(', ')}`;
});

console.log('\n-- D. Ground-hazard exclusion --');
const hazardGame = Object.create(Game.prototype);
hazardGame.endless = true;
hazardGame._chaosMode = false;
hazardGame.mapManager = endlessMap;
hazardGame.matrices = endlessCentral;
let hazardCandidates = 0;
const hazardOverlaps = [];
for (const matrix of endlessCentral) {
  if (!endlessMap.isWalkableFootprint(matrix.pos.x, matrix.pos.y, NEXUS_FOOTPRINT, 'endless')) continue;
  for (const radius of HAZARD_RADII) {
    const placed = hazardGame.placeGroundHazard(matrix.pos.x, matrix.pos.y, radius);
    if (!placed) continue;
    hazardCandidates++;
    if (distance(placed, matrix.pos) < radius + MATRIX_RADIUS) {
      hazardOverlaps.push({ radius, matrix: matrix.pos, placed });
    }
  }
}
T('at least one real ground-hazard candidate is testable', () =>
  hazardCandidates > 0 || 'no walkable matrix/hazard pair was testable');
T('placeGroundHazard keeps damage footprints off matrices', () =>
  hazardOverlaps.length === 0
    || `${hazardOverlaps.length}/${hazardCandidates} overlaps; first r=${hazardOverlaps[0].radius} at ${formatPoint(hazardOverlaps[0].placed)}`);

console.log('\n-- E. Reset and second-run cleanup --');
const reused = makeEndless(makeMap());
const firstRunMatrices = reused.matrices.slice();
const lateMatrix = { pos: { x: -999, y: -999 }, stored: 1, capacity: 6, isOuterNexus: true };
reused.matrices.push(lateMatrix);
reused.rewardOrbs.push({ stale: true });
reused.rewardTimer = 17;
settleOuter(reused, BIOME_ID.INDUSTRIAL_CORE);

// These are the Nexus-specific operations performed by Game.reset before/at manager.init.
reused.endless = false;
reused.rewardOrbs.length = 0;
reused.rewardTimer = 0;
reused.init(WORLD_W, WORLD_H);
const secondRunSnapshot = layoutSnapshot(reused);

T('second run contains exactly four fresh Act 1 matrices', () =>
  reused.matrices.length === 4 || `got ${reused.matrices.length}`);
T('second run retains no first-run or late matrix instance', () =>
  reused.matrices.every(m => !firstRunMatrices.includes(m) && m !== lateMatrix));
T('second run clears streamed outer definitions and active instance', () =>
  reused.outerRecords.length === 0 && reused._activeOuter === null
    || `records=${reused.outerRecords.length}, active=${!!reused._activeOuter}`);
T('second run clears reward orbs and reward timer', () =>
  reused.rewardOrbs.length === 0 && reused.rewardTimer === 0
    || `orbs=${reused.rewardOrbs.length}, timer=${reused.rewardTimer}`);
T('second-run layout matches a fresh Act 1 run', () =>
  secondRunSnapshot === layoutSnapshot(makeAct1(makeMap())) || 'layout drift after reuse');

console.log('\n-- F. Same-seed determinism --');
const seededLayout = seed => withSeed(seed, () => {
  const map = makeMap();
  const act = makeAct1(map);
  const end = makeEndless(map);
  const directEnd = makeDirectEndless(map);
  return `${layoutSnapshot(act)}|${layoutSnapshot(end)}|${layoutSnapshot(directEnd)}`;
});
T('same seed produces byte-identical Act 1 and Endless layouts', () =>
  seededLayout(0x51a7c0de) === seededLayout(0x51a7c0de));
T('direct Endless and Act 1 -> Endless use the same central layout', () => {
  const transitioned = makeEndless(makeMap()).matrices.filter(m => !m.isOuterNexus).map(m => [m.pos.x, m.pos.y]);
  const direct = makeDirectEndless(makeMap()).matrices.filter(m => !m.isOuterNexus).map(m => [m.pos.x, m.pos.y]);
  return JSON.stringify(transitioned) === JSON.stringify(direct)
    || `${JSON.stringify(transitioned)} vs ${JSON.stringify(direct)}`;
});
T('repeated init is deterministic and duplicate-free', () => {
  const manager = makeAct1(makeMap());
  const before = layoutSnapshot(manager);
  manager.init(WORLD_W, WORLD_H);
  return manager.matrices.length === 4 && layoutSnapshot(manager) === before
    ? true : `count=${manager.matrices.length}`;
});

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
if (failures.length) {
  console.log('CURRENT FAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
}
process.exit(fail ? 1 : 0);
