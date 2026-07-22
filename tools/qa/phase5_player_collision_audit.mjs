// PHASE 5 PLAYER / MAP COLLISION AUDIT
// Deterministic production-backed audit. It imports and drives the real Player.update,
// Game collision methods and MapManager walkability model. No production state is written.
//
// Run: node tools/qa/phase5_player_collision_audit.mjs

// Exit 1 means at least one Phase 5 acceptance gate is not satisfied.

import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
register('./strip-v-loader.mjs', import.meta.url);
const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
installEnv();

// Keep every run reproducible, including incidental production effects created by Game.update.
let randomState = 0x5a17c011;
Math.random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x100000000;
};

const ROOT = path.resolve(HERE, '../..');
const JS = path.join(ROOT, 'js');
const GAME_FILE = path.join(JS, 'game/Game.js');
const MAP_FILE = path.join(JS, 'game/MapManager.js');
const PLAYER_FILE = path.join(JS, 'entities/Player.js');
const GAME_SRC = fs.readFileSync(GAME_FILE, 'utf8');

const quiet = muteConsole();
const [{ Game }, { MapManager }, { Player }, constants] = await Promise.all([
  import(pathToFileURL(GAME_FILE).href),
  import(pathToFileURL(MAP_FILE).href),
  import(pathToFileURL(PLAYER_FILE).href),
  import(pathToFileURL(path.join(JS, 'constants.js')).href),
]);
quiet();

const { PLAYER_RADIUS, WORLD_BOUNDS, WORLD_W, WORLD_H } = constants;
const DT = 1 / 60;
const EPS = 1e-6;
const INPUT = keys => ({ keys, mousePos: { x: 0, y: 0 }, mouseDown: false });

let pass = 0;
let fail = 0;
function gate(name, result, note = '') {
  const ok = result === true;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` | ${note}` : ''}`);
  return ok;
}

function pngSize(rel) {
  const abs = path.join(ROOT, ...rel.split('/'));
  const b = fs.readFileSync(abs);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`invalid PNG: ${rel}`);
  return { rel, abs, width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
}

function imageStub(dim) {
  return { complete: true, naturalWidth: dim.width, naturalHeight: dim.height };
}

function metricLine(name, m) {
  const recovery = m.recoveryFrames == null ? 'καμία' : `${m.recoveryFrames}f/${(m.recoveryFrames * m.dt).toFixed(3)}s`;
  console.log(
    `    ${name}: είσοδος=${m.inputFrames}f μετατόπιση=${m.displacement.toFixed(2)}px ` +
    `μπλοκαρισμένα=${m.blockedFrames}f μηδενική-κίνηση=${m.zeroMotionFrames}f κόλλημα=${m.stuckSeconds.toFixed(3)}s ` +
    `ολίσθηση=${m.slideDistance.toFixed(2)}px διείσδυση=${m.maxPenetration.toFixed(2)}px ` +
    `μέγιστο-βήμα=${m.maxStep.toFixed(2)}px ανάκτηση=${recovery}`,
  );
}

function circleRectPenetration(x, y, radius, rect) {
  const qx = Math.max(rect.x0, Math.min(rect.x1, x));
  const qy = Math.max(rect.y0, Math.min(rect.y1, y));
  const outsideDistance = Math.hypot(x - qx, y - qy);
  if (outsideDistance > EPS) return Math.max(0, radius - outsideDistance);
  const insideDepth = Math.min(x - rect.x0, rect.x1 - x, y - rect.y0, rect.y1 - y);
  return radius + Math.max(0, insideDepth);
}

function worldRects(mm, mode) {
  const blocks = mode === 'chaos' ? mm.CHAOS_BLOCK_COLS : mm.CITY_BLOCK_COLS;
  return blocks.map(([x0, x1, y0, y1]) => ({
    x0: x0 * mm.CITY_SCALE,
    x1: x1 * mm.CITY_SCALE,
    y0: y0 * mm.CITY_SCALE,
    y1: y1 * mm.CITY_SCALE,
  }));
}

function exactModelPenetration(mm, mode, x, y, radius) {
  const rows = mode === 'chaos' ? mm.CHAOS_WALK_ROWS : mm.CITY_WALK_ROWS;
  const top = rows[0] * mm.CITY_SCALE;
  const bottom = rows[1] * mm.CITY_SCALE;
  let pen = Math.max(0, top - (y - radius), (y + radius) - bottom);
  for (const rect of worldRects(mm, mode)) pen = Math.max(pen, circleRectPenetration(x, y, radius, rect));
  return pen;
}

function shell(mm, mode, campaignStage = 0) {
  const g = Object.create(Game.prototype);
  g.mapManager = mm;
  g.endless = mode === 'endless' || mode === 'chaos';
  g._chaosMode = mode === 'chaos';
  g._campaignStage = campaignStage;
  return g;
}

function resetPlayer(p, start) {
  p.pos.x = start.x;
  p.pos.y = start.y;
  p.vel.x = 0;
  p.vel.y = 0;
  p.dashTimer = 0;
  p.dashCooldown = 0;
  p.specialDashTimer = 0;
  p.stamina = p.maxStamina;
  p.staggerTimer = 0;
  p._chillT = 0;
}

function runPlayerRoute({
  mm, mode, start, frames, dt = DT, character = 'skeleton_warrior',
  keysAt = () => new Set(), slideAxis = null, startInvalid = false,
}) {
  const g = shell(mm, mode);
  const p = new Player(character);
  resetPlayer(p, start);
  p._resolveMove = (fx, fy, tx, ty, r) => g.resolveWalkableMove(fx, fy, tx, ty, r);

  let blockedFrames = 0;
  let zeroMotionFrames = 0;
  let zeroRun = 0;
  let longestZeroRun = 0;
  let slideDistance = 0;
  let maxPenetration = exactModelPenetration(mm, mode, p.pos.x, p.pos.y, PLAYER_RADIUS);
  let maxStep = 0;
  let recoveryFrames = null;
  const x0 = p.pos.x;
  const y0 = p.pos.y;

  for (let frame = 0; frame < frames; frame++) {
    const keys = keysAt(frame);
    const bx = p.pos.x;
    const by = p.pos.y;
    p.update(dt, INPUT(keys));
    const dx = p.pos.x - bx;
    const dy = p.pos.y - by;
    const moved = Math.hypot(dx, dy);
    const wanted = Math.hypot(p.vel.x * dt, p.vel.y * dt);
    maxStep = Math.max(maxStep, moved);
    if (wanted > EPS && moved + EPS < wanted * 0.98) blockedFrames++;
    if (wanted > EPS && moved <= EPS) {
      zeroMotionFrames++;
      zeroRun++;
      longestZeroRun = Math.max(longestZeroRun, zeroRun);
    } else {
      zeroRun = 0;
    }
    if (slideAxis === 'x') slideDistance += Math.abs(dx);
    if (slideAxis === 'y') slideDistance += Math.abs(dy);
    maxPenetration = Math.max(maxPenetration, exactModelPenetration(mm, mode, p.pos.x, p.pos.y, PLAYER_RADIUS));
    if (startInvalid && recoveryFrames == null && mm.isWalkableFootprint(p.pos.x, p.pos.y, PLAYER_RADIUS, mode)) {
      recoveryFrames = frame + 1;
    }
  }

  return {
    player: p,
    inputFrames: frames,
    displacement: Math.hypot(p.pos.x - x0, p.pos.y - y0),
    blockedFrames,
    zeroMotionFrames,
    stuckSeconds: longestZeroRun * dt,
    slideDistance,
    maxPenetration,
    maxStep,
    recoveryFrames,
    dt,
  };
}

function runAct1EdgeRoute(shipDim) {
  const silence = muteConsole();
  const g = new Game();
  g.audio = null;
  g.selectedCharacter = 'skeleton_warrior';
  g.gameState = 'playing';
  g.paused = false;
  g.reset();
  g.gameState = 'playing';
  g.paused = false;
  g.mapManager._shipImg = imageStub(shipDim);
  g.mapManager._act1BoundsCache = null;
  const b = g.getWalkableBounds();
  const p = g.player;
  resetPlayer(p, { x: b.x0 + 32, y: (b.y0 + b.y1) / 2 });
  const x0 = p.pos.x;
  let blockedFrames = 0;
  let zeroMotionFrames = 0;
  let zeroRun = 0;
  let longestZeroRun = 0;
  let maxStep = 0;
  let maxPenetration = 0;

  for (let frame = 0; frame < 30; frame++) {
    p.hp = p.maxHp;
    const bx = p.pos.x;
    const by = p.pos.y;
    g.update(DT, INPUT(new Set(['a'])));
    const moved = Math.hypot(p.pos.x - bx, p.pos.y - by);
    const wanted = Math.hypot(p.vel.x * DT, p.vel.y * DT);
    maxStep = Math.max(maxStep, moved);
    if (wanted > EPS && moved + EPS < wanted * 0.98) blockedFrames++;
    if (wanted > EPS && moved <= EPS) {
      zeroMotionFrames++;
      zeroRun++;
      longestZeroRun = Math.max(longestZeroRun, zeroRun);
    } else zeroRun = 0;
    maxPenetration = Math.max(maxPenetration, Math.max(0, b.x0 - (p.pos.x - PLAYER_RADIUS)));
  }

  let recoveryFrames = null;
  for (let frame = 0; frame < 10; frame++) {
    const bx = p.pos.x;
    p.hp = p.maxHp;
    g.update(DT, INPUT(new Set(['d'])));
    if (p.pos.x > bx + EPS) { recoveryFrames = frame + 1; break; }
  }
  silence();
  return {
    inputFrames: 30,
    displacement: Math.abs(p.pos.x - x0),
    blockedFrames,
    zeroMotionFrames,
    stuckSeconds: longestZeroRun * DT,
    slideDistance: 0,
    maxPenetration,
    maxStep,
    recoveryFrames,
    dt: DT,
    bounds: b,
  };
}

console.log('=== ΦΑΣΗ 5 / ΕΛΕΓΧΟΣ ΚΙΝΗΣΗΣ ΠΑΙΚΤΗ ΚΑΙ ΣΥΓΚΡΟΥΣΕΩΝ ΧΑΡΤΗ ===');

console.log('\n-- Α. Απογραφή production χαρτών --');
const campaignStart = GAME_SRC.indexOf('const CAMPAIGN_STAGES');
const campaignEnd = GAME_SRC.indexOf('];', campaignStart);
const campaignBlock = GAME_SRC.slice(campaignStart, campaignEnd + 2);
const campaignPaths = [...campaignBlock.matchAll(/map:\s*'([^']+)'/g)].map(m => m[1]);
const mapPaths = [
  'assets/maps/act1_spaceship/spaceship.png',
  ...campaignPaths,
  'assets/maps/new_endless/cyber_megacity.png',
  'assets/maps/chaos_mode_map/chaos_map.png',
];
const mapDims = mapPaths.map(pngSize);
for (const d of mapDims) console.log(`    ${d.rel}: ${d.width}x${d.height}, ${(d.bytes / 1048576).toFixed(2)} MiB`);
gate('εντοπίστηκαν και αποκωδικοποιήθηκαν 10/10 production χάρτες', mapDims.length === 10, `πλήθος=${mapDims.length}`);
gate('οι 7/7 εγγραφές campaign δείχνουν σε έγκυρα PNG assets', campaignPaths.length === 7 && mapDims.slice(1, 8).every(d => d.width > 0 && d.height > 0), `πλήθος=${campaignPaths.length}`);

const byPath = Object.fromEntries(mapDims.map(d => [d.rel, d]));
const mm = new MapManager({});
mm._shipImg = imageStub(byPath['assets/maps/act1_spaceship/spaceship.png']);
mm._cityImg = imageStub(byPath['assets/maps/new_endless/cyber_megacity.png']);
mm._chaosDeckImg = imageStub(byPath['assets/maps/chaos_mode_map/chaos_map.png']);
mm._act1BoundsCache = null;

console.log('\n-- Β. Ακτίνα παίκτη και ελεύθερη κίνηση --');
WORLD_BOUNDS.left = -1000000;
WORLD_BOUNDS.top = -1000000;
WORLD_BOUNDS.right = 1000000;
WORLD_BOUNDS.bottom = 1000000;
let observedRadius = null;
const radiusProbe = new Player('skeleton_warrior');
radiusProbe._resolveMove = (fx, fy, tx, ty, r) => { observedRadius = r; return { x: tx, y: ty }; };
radiusProbe.update(DT, INPUT(new Set(['d'])));
gate('το Player.update στέλνει την κανονική ακτίνα στον resolver του Game', observedRadius === PLAYER_RADIUS && PLAYER_RADIUS === 16, `ακτίνα=${observedRadius}`);

const cardinal = runPlayerRoute({ mm, mode: 'endless', start: { x: 1500, y: 1080 }, frames: 60, keysAt: () => new Set(['d']) });
const diagonal = runPlayerRoute({ mm, mode: 'endless', start: { x: 1500, y: 1080 }, frames: 60, keysAt: () => new Set(['d', 'w']) });
metricLine('ευθεία/ελεύθερη', cardinal);
metricLine('διαγώνια/ελεύθερη', diagonal);
gate('η διαγώνια κίνηση κανονικοποιείται στην ίδια μετατόπιση με την ευθεία', Math.abs(cardinal.displacement - diagonal.displacement) < 0.01, `ευθεία=${cardinal.displacement.toFixed(2)} διαγώνια=${diagonal.displacement.toFixed(2)}`);
gate('η ελεύθερη κίνηση δεν έχει μπλοκαρισμένα ή μηδενικά frames', cardinal.blockedFrames === 0 && diagonal.blockedFrames === 0 && cardinal.zeroMotionFrames === 0 && diagonal.zeroMotionFrames === 0);

console.log('\n-- Γ. Authored εμπόδια και δομή αόρατων colliders --');
let badAuthoredSamples = 0;
for (const mode of ['endless', 'chaos']) {
  for (const rect of worldRects(mm, mode)) {
    const cx = (rect.x0 + rect.x1) / 2;
    const cy = (rect.y0 + rect.y1) / 2;
    if (mm.isWalkablePoint(cx, cy, mode)) badAuthoredSamples++;
  }
}
gate('και τα 5 authored no-go ορθογώνια απορρίπτουν το κέντρο τους', badAuthoredSamples === 0, `λανθασμένα-δεκτά=${badAuthoredSamples}`);
gate('οι authored ζώνες και τα ορθογώνια χωρούν στις διαστάσεις των εικόνων',
  mm.CITY_WALK_ROWS[1] <= mm._cityImg.naturalHeight &&
  mm.CHAOS_WALK_ROWS[1] <= mm._chaosDeckImg.naturalHeight &&
  mm.CITY_BLOCK_COLS.every(r => r[0] >= 0 && r[1] <= mm._cityImg.naturalWidth && r[2] >= mm.CITY_WALK_ROWS[0] && r[3] <= mm.CITY_WALK_ROWS[1]) &&
  mm.CHAOS_BLOCK_COLS.every(r => r[0] >= 0 && r[1] <= mm._chaosDeckImg.naturalWidth && r[2] >= mm.CHAOS_WALK_ROWS[0] && r[3] <= mm.CHAOS_WALK_ROWS[1]));

console.log('\n-- Δ. Ευθεία σύγκρουση, ολίσθηση τοίχου και διαδρομή γύρω από μεγάλα props --');
const cityRect = worldRects(mm, 'endless')[0];
const chaosRect = worldRects(mm, 'chaos')[0];
const straight = runPlayerRoute({
  mm, mode: 'endless', start: { x: (cityRect.x0 + cityRect.x1) / 2, y: cityRect.y1 + PLAYER_RADIUS + 80 },
  frames: 60, keysAt: () => new Set(['w']), slideAxis: 'y',
});
const citySlide = runPlayerRoute({
  mm, mode: 'endless', start: { x: cityRect.x1 + PLAYER_RADIUS + 3, y: 280 * mm.CITY_SCALE },
  frames: 30, keysAt: () => new Set(['a', 'w']), slideAxis: 'y',
});
const chaosSlide = runPlayerRoute({
  mm, mode: 'chaos', start: { x: chaosRect.x1 + PLAYER_RADIUS + 3, y: 220 * mm.CITY_SCALE },
  frames: 30, keysAt: () => new Set(['a', 'w']), slideAxis: 'y',
});
metricLine('ευθεία/endless', straight);
metricLine('ολίσθηση-τοίχου/endless', citySlide);
metricLine('ολίσθηση-τοίχου/chaos', chaosSlide);
gate('η ευθεία κίνηση σταματά πριν από το εμπόδιο χωρίς διείσδυση', straight.blockedFrames > 0 && straight.maxPenetration <= 0.01, `μπλοκαρισμένα=${straight.blockedFrames} διείσδυση=${straight.maxPenetration.toFixed(2)}`);
gate('η ολίσθηση τοίχου διατηρεί ουσιαστική κίνηση στον ελεύθερο άξονα', citySlide.slideDistance > 60 && chaosSlide.slideDistance > 60 && citySlide.zeroMotionFrames === 0 && chaosSlide.zeroMotionFrames === 0, `city=${citySlide.slideDistance.toFixed(2)} chaos=${chaosSlide.slideDistance.toFixed(2)}`);

const minClearance = mode => {
  const rows = mode === 'chaos' ? mm.CHAOS_WALK_ROWS : mm.CITY_WALK_ROWS;
  const blocks = mode === 'chaos' ? mm.CHAOS_BLOCK_COLS : mm.CITY_BLOCK_COLS;
  const bottomGaps = blocks.map(b => (rows[1] - b[3]) * mm.CITY_SCALE - PLAYER_RADIUS * 2);
  const horizontalGaps = blocks.slice(1).map((b, i) => (b[0] - blocks[i][1]) * mm.CITY_SCALE - PLAYER_RADIUS * 2);
  return Math.min(...bottomGaps, ...horizontalGaps);
};
const cityGap = minClearance('endless');
const chaosGap = minClearance('chaos');
const gapRoute = runPlayerRoute({
  mm,
  mode: 'endless',
  start: { x: 650 * mm.CITY_SCALE, y: ((330 * mm.CITY_SCALE + PLAYER_RADIUS) + (mm.CITY_WALK_ROWS[1] * mm.CITY_SCALE - PLAYER_RADIUS)) / 2 },
  frames: 180,
  keysAt: () => new Set(['d']),
  slideAxis: 'x',
});
metricLine('στενότερο authored πέρασμα', gapRoute);
gate('όλα τα authored περάσματα υπερβαίνουν τη διάμετρο παίκτη των 32px', cityGap > 0 && chaosGap > 0, `ωφέλιμο city=${cityGap.toFixed(0)}px chaos=${chaosGap.toFixed(0)}px`);
gate('το στενότερο production πέρασμα διασχίζεται χωρίς κόλλημα', gapRoute.displacement > 600 && gapRoute.zeroMotionFrames === 0 && gapRoute.maxPenetration <= 0.01, `απόσταση=${gapRoute.displacement.toFixed(2)} μηδενικά=${gapRoute.zeroMotionFrames}`);

console.log('\n-- Ε. Σύγκρουση dash στο production όριο frame των 50ms --');
const dash = runPlayerRoute({
  mm,
  mode: 'endless',
  character: 'taekwondo_girl',
  start: { x: (cityRect.x0 + cityRect.x1) / 2, y: cityRect.y1 + PLAYER_RADIUS + 184 },
  frames: 10,
  dt: 0.05,
  keysAt: frame => frame === 0 ? new Set(['w', 'shift']) : new Set(['w']),
  slideAxis: 'y',
});
metricLine('dash/endless@20Hz', dash);
gate('το dash μπλοκάρεται από το εμπόδιο χωρίς tunnelling ή διείσδυση', dash.blockedFrames > 0 && dash.maxPenetration <= 0.01 && dash.maxStep <= 49, `μέγιστο-βήμα=${dash.maxStep.toFixed(2)} διείσδυση=${dash.maxPenetration.toFixed(2)}`);

console.log('\n-- ΣΤ. Ακριβές κυκλικό footprint στις γωνίες εμποδίων --');
let cornerMisses = 0;
let maxCornerPenetration = 0;
let worstCorner = null;
for (const mode of ['endless', 'chaos']) {
  for (const rect of worldRects(mm, mode)) {
    for (const side of [-1, 1]) {
      const cx = side < 0 ? rect.x0 : rect.x1;
      const cy = rect.y1;
      for (let ax = 0.25; ax < PLAYER_RADIUS; ax += 0.25) {
        for (let ay = 0.25; ay < PLAYER_RADIUS; ay += 0.25) {
          const x = cx + side * ax;
          const y = cy + ay;
          const pen = circleRectPenetration(x, y, PLAYER_RADIUS, rect);
          if (pen > EPS && mm.isWalkableFootprint(x, y, PLAYER_RADIUS, mode)) {
            cornerMisses++;
            if (pen > maxCornerPenetration) {
              maxCornerPenetration = pen;
              worstCorner = { mode, x, y };
            }
          }
        }
      }
    }
  }
}
gate('το κυκλικό footprint δεν έχει ψευδώς walkable δείγματα σε γωνίες', cornerMisses === 0,
  `αστοχίες=${cornerMisses} μέγιστη-διείσδυση=${maxCornerPenetration.toFixed(2)}px στο ${worstCorner ? `${worstCorner.mode}(${worstCorner.x.toFixed(2)},${worstCorner.y.toFixed(2)})` : 'κανένα'}`);

console.log('\n-- Ζ. Ανάκτηση από άκυρη κολλημένη θέση --');
const stuck = runPlayerRoute({
  mm,
  mode: 'endless',
  start: { x: (cityRect.x0 + cityRect.x1) / 2, y: (cityRect.y0 + cityRect.y1) / 2 },
  frames: 180,
  keysAt: () => new Set(['s']),
  slideAxis: 'y',
  startInvalid: true,
});
metricLine('εξαναγκασμένη-θέση-μέσα-σε-εμπόδιο', stuck);
gate('ο παίκτης ανακτάται από άκυρη θέση εμποδίου μέσα σε 120 frames', stuck.recoveryFrames != null && stuck.recoveryFrames <= 120,
  `ανάκτηση=${stuck.recoveryFrames == null ? 'καμία' : `${stuck.recoveryFrames}f`} μηδενικά=${stuck.zeroMotionFrames}f κόλλημα=${stuck.stuckSeconds.toFixed(2)}s`);

console.log('\n-- Η. Footprint καταστρώματος Act 1 και κάλυψη campaign χαρτών --');
WORLD_BOUNDS.left = 0;
WORLD_BOUNDS.top = 0;
WORLD_BOUNDS.right = WORLD_W;
WORLD_BOUNDS.bottom = WORLD_H;
const act1 = runAct1EdgeRoute(byPath['assets/maps/act1_spaceship/spaceship.png']);
metricLine('Act1/άκρη-καταστρώματος', act1);
gate('το clamp του Act 1 κρατά ολόκληρο το footprint των 16px μέσα στο κατάστρωμα', act1.maxPenetration <= 0.01,
  `διείσδυση-center-clamp=${act1.maxPenetration.toFixed(2)}px όρια=[${act1.bounds.x0},${act1.bounds.x1}]x[${act1.bounds.y0},${act1.bounds.y1}]`);

let campaignCollisionModels = 0;
const campaignCoverage = [];
for (let i = 0; i < campaignPaths.length; i++) {
  const g = shell(mm, 'campaign', i + 1);
  const hasMode = g._walkMode() != null;
  const hasBounds = g.getWalkableBounds() != null;
  if (hasMode || hasBounds) campaignCollisionModels++;
  campaignCoverage.push(`${i + 1}:${hasMode ? 'μοντέλο' : hasBounds ? 'όρια' : 'κανένα'}`);
}
const campaignFree = runPlayerRoute({
  mm,
  mode: 'campaign',
  start: { x: 1200, y: 844 },
  frames: 60,
  keysAt: () => new Set(['d']),
  slideAxis: 'x',
});
metricLine('campaign/αντιπροσωπευτική-ελεύθερη-διαδρομή', campaignFree);
gate('και οι 7 campaign χάρτες δημοσιεύουν map-specific collision ή walkability bounds', campaignCollisionModels === 7,
  `κάλυψη=${campaignCollisionModels}/7 ${campaignCoverage.join(' ')}`);

console.log('\n-- Θ. Ντετερμινισμός και απομόνωση modes --');
gate('Act 1 και campaign δεν κληρονομούν τα εμπόδια Endless/Chaos', shell(mm, 'act1')._walkMode() === null && shell(mm, 'campaign', 1)._walkMode() === null);
gate('Endless και Chaos χρησιμοποιούν διαφορετικά production walkability models', shell(mm, 'endless')._walkMode() === 'endless' && shell(mm, 'chaos')._walkMode() === 'chaos');
gate('όλες οι μετρημένες έξοδοι διαδρομών παραμένουν πεπερασμένες', [cardinal, diagonal, straight, citySlide, chaosSlide, gapRoute, dash, stuck, act1, campaignFree].every(m =>
  [m.displacement, m.stuckSeconds, m.slideDistance, m.maxPenetration, m.maxStep].every(Number.isFinite)));

console.log('\n-- ΤΕΚΜΗΡΙΑ ΡΙΖΙΚΩΝ ΑΙΤΙΩΝ --');
console.log(`    footprint γωνιών: ${cornerMisses} ψευδώς walkable δείγματα, μέγιστη ακριβής διείσδυση ${maxCornerPenetration.toFixed(2)}px`);
console.log(`    ανάκτηση άκυρης θέσης: ${stuck.recoveryFrames == null ? 'καμία ανάκτηση' : `${stuck.recoveryFrames} frames`}, ${stuck.zeroMotionFrames}/${stuck.inputFrames} frames μηδενικής κίνησης`);
console.log(`    Act 1: το center-only clamp επιτρέπει ${act1.maxPenetration.toFixed(2)}px από την ακτίνα ${PLAYER_RADIUS}px έξω από το μετρημένο κατάστρωμα`);
console.log(`    Campaign: ${campaignCollisionModels}/7 χάρτες εκθέτουν collision coverage, αντιπροσωπευτική μετατόπιση 60f=${campaignFree.displacement.toFixed(2)}px, μπλοκαρισμένα=${campaignFree.blockedFrames}`);
console.log('    πηγή: MapManager.js:438-443, Game.js:30142-30160, Game.js:30242-30254, Game.js:8868-8872, Player.js:420-429');

console.log(`\n=== ΑΠΟΤΕΛΕΣΜΑ: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
