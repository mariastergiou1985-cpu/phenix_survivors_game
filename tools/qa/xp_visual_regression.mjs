// XP SHARD VISUAL REGRESSION - deterministic visuals plus gameplay-state invariants.
// Run: node tools/qa/xp_visual_regression.mjs (exit 1 on any failure)
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

Object.defineProperty(globalThis, 'performance', { value: { now: () => 1000 }, configurable: true });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.resolve(HERE, '../../js/entities/XpShards.js');
const { XpShardSystem, XP_SHARD_VISUALS } = await import(pathToFileURL(SOURCE_PATH).href);
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

const STATE_KEYS = ['globalAlpha', 'globalCompositeOperation', 'fillStyle', 'strokeStyle', 'lineWidth'];
class RecordingContext {
  constructor() {
    this.globalAlpha = 1; this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1;
    this.events = []; this._stack = []; this._path = [];
  }
  state() { return Object.fromEntries(STATE_KEYS.map(key => [key, this[key]])); }
  save() { this._stack.push(this.state()); }
  restore() { Object.assign(this, this._stack.pop()); }
  beginPath() { this._path = []; }
  moveTo(x, y) { this._path.push(['M', x, y]); }
  lineTo(x, y) { this._path.push(['L', x, y]); }
  closePath() { this._path.push(['Z']); }
  fill() { this.events.push({ op: 'fill', ...this.state(), path: this._path.map(v => [...v]) }); }
  stroke() { this.events.push({ op: 'stroke', ...this.state(), path: this._path.map(v => [...v]) }); }
  fillRect(x, y, width, height) { this.events.push({ op: 'fillRect', x, y, width, height, ...this.state() }); }
  strokeRect(x, y, width, height) { this.events.push({ op: 'strokeRect', x, y, width, height, ...this.state() }); }
  ellipse(x, y, rx, ry) { this._path.push(['E', x, y, rx, ry]); }
  translate() {}
  rotate() {}
}

let pass = 0, fail = 0;
const failures = [];
const T = (name, check) => {
  let result = false;
  try { result = check(); } catch (error) { result = `THREW: ${error.message}`; }
  const ok = result === true;
  if (ok) pass++; else { fail++; failures.push(`${name}: ${result || 'false'}`); }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !result ? '' : ` - ${result}`}`);
};

const fixedRandom = fn => {
  const original = Math.random;
  Math.random = () => 0.25;
  try { return fn(); } finally { Math.random = original; }
};
const gameAt = (x = 0, y = 0) => ({
  player: { pos: { x, y }, pickupRadius: 90, gainXp() {} },
  floatingTexts: [], audio: { playXpPickup() {} },
});
const drawTier = value => fixedRandom(() => {
  const system = new XpShardSystem();
  system._spawn(100, 100, value);
  system.active[0].t = 1;
  const ctx = new RecordingContext();
  system.draw(ctx, gameAt());
  return { system, ctx };
});

console.log('=== XP SHARD VISUAL REGRESSION ===');

console.log('\n-- A. Explicit visual contract --');
T('tier accounting thresholds remain exactly 2 and 8', () =>
  XP_SHARD_VISUALS.small.max === 2 && XP_SHARD_VISUALS.medium.max === 8
  && XP_SHARD_VISUALS.core.max === Infinity);
T('tier sizes remain exactly 11, 15 and 20', () =>
  XP_SHARD_VISUALS.small.size === 11 && XP_SHARD_VISUALS.medium.size === 15
  && XP_SHARD_VISUALS.core.size === 20);
T('all three bodies are bright and chromatically distinct', () => {
  const bodies = Object.values(XP_SHARD_VISUALS).map(tier => tier.body);
  return new Set(bodies).size === 3 && bodies.every(color => color !== '#3a4250');
});
T('each value grade owns a distinct glow', () =>
  new Set(Object.values(XP_SHARD_VISUALS).map(tier => tier.glow)).size === 3);
T('visuals use no image sprite, blur or circular matrix halo', () =>
  !SOURCE.includes('drawImage(') && !/ctx\.shadowBlur\s*=/.test(SOURCE) && !SOURCE.includes('ctx.arc('));

console.log('\n-- B. Deterministic draw evidence --');
const small = drawTier(2), medium = drawTier(8), core = drawTier(9);
const additive = sample => sample.ctx.events.filter(event => event.globalCompositeOperation === 'lighter');
T('small shard resolves to the small tier', () => small.system.active[0].tier === 'small');
T('medium shard resolves to the medium tier', () => medium.system.active[0].tier === 'medium');
T('core shard resolves above value 8', () => core.system.active[0].tier === 'core');
T('every tier emits two additive polygon glow layers', () =>
  [small, medium, core].every(sample => additive(sample).length === 2));
T('small, medium and core silhouettes have distinct path complexity', () => {
  const bodyPoints = sample => sample.ctx.events
    .filter(event => event.op === 'fill' && event.globalCompositeOperation === 'source-over')
    .map(event => event.path.filter(point => point[0] === 'L').length);
  const signatures = [small, medium, core].map(sample => bodyPoints(sample).join(','));
  return new Set(signatures).size === 3 || signatures.join(' / ');
});
T('draw restores canvas state and balances save/restore', () =>
  [small, medium, core].every(({ ctx }) => ctx._stack.length === 0
    && ctx.globalAlpha === 1 && ctx.globalCompositeOperation === 'source-over'));
T('draw never mutates shard gameplay state', () => fixedRandom(() => {
  const system = new XpShardSystem();
  system._spawn(120, 140, 9); system.active[0].t = 1;
  const before = JSON.stringify(system.active[0]);
  system.draw(new RecordingContext(), gameAt());
  return JSON.stringify(system.active[0]) === before;
}));

console.log('\n-- C. Accounting, cap, walkability and pickup preservation --');
T('spawnBurst preserves exact XP totals across denominations', () => fixedRandom(() => {
  const system = new XpShardSystem();
  for (const total of [1, 2, 3, 8, 9, 12, 42, 137]) {
    system.active.length = 0;
    system.spawnBurst(500, 500, total, 12);
    if (system.active.reduce((sum, shard) => sum + shard.value, 0) !== total) return `total=${total}`;
  }
  return true;
}));
T('cap merge preserves exact value and keeps the desktop cap', () => fixedRandom(() => {
  const system = new XpShardSystem();
  for (let i = 0; i < 550; i++) system._spawn(900 + i, 900, 1);
  const before = system.active.reduce((sum, shard) => sum + shard.value, 0);
  system.update(0, gameAt());
  const after = system.active.reduce((sum, shard) => sum + shard.value, 0);
  return before === 550 && after === before && system.active.length <= 520
    || `before=${before}, after=${after}, count=${system.active.length}`;
}));
T('spawn landing still uses canonical walkability clamp', () => fixedRandom(() => {
  const system = new XpShardSystem();
  system.spawnBurst(-500, -500, 12, 12, { _clampPickupPos: () => ({ x: 77, y: 88 }) });
  return system.active.every(shard => shard.tx === 77 && shard.ty === 88);
}));
T('real pickup grants the exact shard value once and recycles it', () => fixedRandom(() => {
  const system = new XpShardSystem();
  let gained = 0, sounds = 0;
  system._spawn(5, 0, 9); system.active[0].t = 1;
  const game = gameAt();
  game.player.gainXp = value => { gained += value; };
  game.audio.playXpPickup = tier => { if (tier === 'core') sounds++; };
  system.update(1 / 60, game);
  system.update(1 / 60, game);
  return gained === 9 && sounds === 1 && system.active.length === 0 && system._pool.length === 1;
}));
T('fresh second-run system starts with clean active and pool state', () => {
  const fresh = new XpShardSystem();
  return fresh.active.length === 0 && fresh._pool.length === 0;
});

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
for (const failure of failures) console.log(`  - ${failure}`);
process.exit(fail ? 1 : 0);
