// POWER MATRIX VISUAL REGRESSION - source guards plus deterministic canvas-call evidence.
// Run: node tools/qa/power_matrix_visual_regression.mjs (exit 1 on any failure)
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

register('./strip-v-loader.mjs', import.meta.url);

globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, createElement: () => ({ style: {} }) };
globalThis.Image = class {
  constructor() { this.complete = false; this.naturalWidth = 0; this.onerror = null; this._src = ''; }
  set src(value) { this._src = value; }
  get src() { return this._src; }
};
if (!globalThis.performance) globalThis.performance = { now: () => 1000 };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.resolve(HERE, '../../js');
const moduleUrl = relativePath => pathToFileURL(path.join(JS, relativePath)).href;
const { PowerMatrix, POWER_MATRIX_VISUALS } = await import(moduleUrl('entities/PowerMatrix.js'));
const { Vec2, MATRIX_RADIUS } = await import(moduleUrl('constants.js'));
const SOURCE = fs.readFileSync(path.join(JS, 'entities/PowerMatrix.js'), 'utf8');
const GAME_SOURCE = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');

const STATE_KEYS = [
  'globalAlpha', 'globalCompositeOperation', 'strokeStyle', 'fillStyle', 'lineWidth',
  'lineCap', 'shadowColor', 'shadowBlur', 'font', 'textAlign', 'imageSmoothingEnabled',
];

class RecordingContext {
  constructor({ throwOnDrawImage = false } = {}) {
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.strokeStyle = '#111111';
    this.fillStyle = '#222222';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.shadowColor = 'transparent';
    this.shadowBlur = 0;
    this.font = '10px sans-serif';
    this.textAlign = 'left';
    this.imageSmoothingEnabled = true;
    this.events = [];
    this._stack = [];
    this._path = [];
    this._throwOnDrawImage = throwOnDrawImage;
  }

  state() { return Object.fromEntries(STATE_KEYS.map(key => [key, this[key]])); }
  save() { this._stack.push(this.state()); }
  restore() {
    const state = this._stack.pop();
    if (!state) throw new Error('canvas restore without save');
    Object.assign(this, state);
  }
  beginPath() { this._path = []; }
  arc(x, y, radius, start, end, anticlockwise = false) {
    this._path.push({ kind: 'arc', x, y, radius, start, end, anticlockwise });
  }
  stroke() { this.events.push(this._event('stroke')); }
  fill() { this.events.push(this._event('fill')); }
  drawImage(image, x, y, width, height) {
    if (this._throwOnDrawImage) throw new Error('synthetic drawImage failure');
    this.events.push({ ...this._event('drawImage'), image, x, y, width, height });
  }
  fillText(text, x, y) { this.events.push({ ...this._event('fillText'), text, x, y }); }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const gradient = { kind: 'radial-gradient', x0, y0, r0, x1, y1, r1, stops: [] };
    gradient.addColorStop = (offset, color) => gradient.stops.push({ offset, color });
    return gradient;
  }
  _event(op) { return { op, ...this.state(), path: this._path.map(item => ({ ...item })) }; }
}

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

const makeMatrix = () => {
  const matrix = new PowerMatrix(new Vec2(320, 240), '#00e6ff', 6);
  matrix.biomeColors = { full: '#00e6ff', mid: '#ff00b4', depleted: '#1a2a5a' };
  matrix._sprite = { complete: true, naturalWidth: 72, naturalHeight: 72 };
  return matrix;
};
const draw = (matrix, visualState = null, contextOptions = {}) => {
  const ctx = new RecordingContext(contextOptions);
  matrix.draw(ctx, visualState);
  return ctx;
};
const firstImage = ctx => ctx.events.find(event => event.op === 'drawImage');
const additiveEvents = ctx => ctx.events.filter(event => event.globalCompositeOperation === 'lighter');
const arcOf = event => event?.path?.find(item => item.kind === 'arc');
const roleRing = (ctx, color) => ctx.events.find(event => {
  const arc = arcOf(event);
  return event.op === 'stroke' && event.strokeStyle === color
    && arc && Math.abs(arc.radius - (MATRIX_RADIUS + 4)) < 0.001;
});

console.log('=== POWER MATRIX VISUAL REGRESSION ===');

console.log('\n-- A. Source and art contract --');
T('existing matrix_base.png art remains the production sprite', () =>
  SOURCE.includes('assets/bases/matrix_base.png'));
T('gameplay system methods remain present', () =>
  typeof PowerMatrix.prototype.stealCore === 'function'
  && typeof PowerMatrix.prototype.slotCore === 'function'
  && typeof PowerMatrix.prototype.update === 'function');
T('idle visual mass contract is explicit and compact', () =>
  POWER_MATRIX_VISUALS.spriteSize <= 60
  && POWER_MATRIX_VISUALS.idleSpriteAlpha <= 0.45
  && POWER_MATRIX_VISUALS.roleRingWidth <= 1.5);
T('capture and role-color contracts are explicit', () =>
  POWER_MATRIX_VISUALS.captureRingWidth === 3
  && POWER_MATRIX_VISUALS.roleColors.buff === '#ffd447'
  && POWER_MATRIX_VISUALS.roleColors.defence === '#ff5560');
T('Game drives proximity from the real player-to-matrix distance', () =>
  GAME_SOURCE.includes('const matrixDistance = this.player?.pos ? distance(this.player.pos, m.pos) : Infinity')
  && GAME_SOURCE.includes('const proximity = clamp((360 - matrixDistance) / 250, 0, 1)'));
T('Game drives capture state from real carried cores and matrix charge', () =>
  GAME_SOURCE.includes('const captureActive = acceptsCores && (this.player?.carry || 0) > 0 && matrixDistance < 260')
  && GAME_SOURCE.includes('captureProgress: m.capacity > 0 ? m.stored / m.capacity : 0'));
T('no destructive center cutout or brightness filter is used', () =>
  !SOURCE.includes('destination-out') && !/ctx\.filter\s*=/.test(SOURCE));

console.log('\n-- B. Idle draw evidence --');
const idleMatrix = makeMatrix();
const idle = draw(idleMatrix, 0);
const idleImage = firstImage(idle);
const idleRoleRing = roleRing(idle, '#00e6ff');
T('idle sprite renders at 58px', () =>
  idleImage?.width === POWER_MATRIX_VISUALS.spriteSize
  && idleImage?.height === POWER_MATRIX_VISUALS.spriteSize
    || `got ${idleImage?.width}x${idleImage?.height}`);
T('idle sprite center is translucent', () =>
  idleImage?.globalAlpha === POWER_MATRIX_VISUALS.idleSpriteAlpha
    || `alpha=${idleImage?.globalAlpha}`);
T('idle performs no additive brightness pass', () =>
  additiveEvents(idle).length === 0 || `got ${additiveEvents(idle).length}`);
T('idle has one thin, low-opacity perimeter ring', () =>
  !!idleRoleRing
  && idleRoleRing.lineWidth === POWER_MATRIX_VISUALS.roleRingWidth
  && idleRoleRing.globalAlpha === POWER_MATRIX_VISUALS.idleRingAlpha);
T('full idle matrix hides the charge label', () =>
  idle.events.every(event => event.op !== 'fillText'));
T('idle arc mass stays within the compact perimeter', () => {
  const radii = idle.events.map(arcOf).filter(Boolean).map(arc => arc.radius);
  const max = Math.max(0, ...radii);
  return max <= MATRIX_RADIUS + 4 || `max radius=${max}`;
});

console.log('\n-- C. Proximity draw evidence --');
const nearMatrix = makeMatrix();
const near = draw(nearMatrix, 1);
const nearImage = firstImage(near);
T('proximity enables an additive glow', () =>
  additiveEvents(near).some(event => event.op === 'fill'));
T('proximity raises sprite opacity without making it opaque', () =>
  nearImage?.globalAlpha === POWER_MATRIX_VISUALS.activeSpriteAlpha
  && nearImage.globalAlpha < 1
    || `alpha=${nearImage?.globalAlpha}`);
T('proximity keeps the role ring thin', () => {
  const ring = roleRing(near, '#00e6ff');
  return !!ring && ring.lineWidth < 2 || `width=${ring?.lineWidth}`;
});
T('proximity reveals compact charge status', () =>
  near.events.some(event => event.op === 'fillText' && event.text === '6/6'));

console.log('\n-- D. Capture-active evidence --');
const captureMatrix = makeMatrix();
const capture = draw(captureMatrix, { captureActive: true, captureProgress: 0.42 });
const captureStrokes = capture.events.filter(event => event.op === 'stroke'
  && event.lineWidth === POWER_MATRIX_VISUALS.captureRingWidth);
const progressStroke = captureStrokes.find(event => {
  const arc = arcOf(event);
  return arc && Math.abs(arc.start + Math.PI / 2) < 0.0001;
});
T('capture-active enables brightness even without proximity', () =>
  additiveEvents(capture).some(event => event.op === 'fill'));
T('capture draws a quiet track and one progress arc', () =>
  captureStrokes.length === 2 || `got ${captureStrokes.length} capture-width strokes`);
T('capture arc exactly represents 42 percent', () => {
  const arc = arcOf(progressStroke);
  const fraction = arc ? (arc.end - arc.start) / (Math.PI * 2) : -1;
  return Math.abs(fraction - 0.42) < 0.0001 || `fraction=${fraction}`;
});
T('capture displays a compact percentage label', () =>
  capture.events.some(event => event.op === 'fillText' && event.text === 'CAPTURE 42%'));
T('capture progress is clamped to 100 percent', () => {
  const capped = draw(makeMatrix(), { captureActive: true, captureProgress: 3 });
  return capped.events.some(event => event.op === 'fillText' && event.text === 'CAPTURE 100%');
});

console.log('\n-- E. Buff and defence identity --');
const buffMatrix = makeMatrix();
buffMatrix.chaosRole = 'buff';
const buff = draw(buffMatrix, 0);
const defenceMatrix = makeMatrix();
defenceMatrix.chaosRole = 'defence';
const defence = draw(defenceMatrix, 0);
T('buff matrix uses the existing gold role color', () =>
  !!roleRing(buff, POWER_MATRIX_VISUALS.roleColors.buff));
T('defence matrix uses the existing red role color', () =>
  !!roleRing(defence, POWER_MATRIX_VISUALS.roleColors.defence));
T('buff and defence rings remain visually distinct', () =>
  POWER_MATRIX_VISUALS.roleColors.buff !== POWER_MATRIX_VISUALS.roleColors.defence);

console.log('\n-- F. Canvas-state bounds --');
const boundedMatrix = makeMatrix();
const bounded = new RecordingContext();
bounded.globalAlpha = 0.37;
bounded.globalCompositeOperation = 'multiply';
bounded.strokeStyle = '#123456';
bounded.fillStyle = '#654321';
bounded.lineWidth = 7;
bounded.lineCap = 'square';
bounded.shadowColor = '#abcdef';
bounded.shadowBlur = 9;
bounded.font = '17px serif';
bounded.textAlign = 'right';
bounded.imageSmoothingEnabled = false;
const stateBefore = JSON.stringify(bounded.state());
boundedMatrix.draw(bounded, { proximity: 1, captureActive: true, captureProgress: 0.5 });
T('draw restores every tracked canvas property', () =>
  JSON.stringify(bounded.state()) === stateBefore || 'canvas state leaked');
T('draw balances the canvas save stack', () =>
  bounded._stack.length === 0 || `depth=${bounded._stack.length}`);
T('draw restores canvas state when sprite rendering throws', () => {
  const throwing = new RecordingContext({ throwOnDrawImage: true });
  const before = JSON.stringify(throwing.state());
  let threw = false;
  try { makeMatrix().draw(throwing, 0); }
  catch (error) { threw = error.message === 'synthetic drawImage failure'; }
  return threw && throwing._stack.length === 0 && JSON.stringify(throwing.state()) === before
    || `threw=${threw}, depth=${throwing._stack.length}`;
});

console.log('\n-- G. Reset and gameplay preservation --');
const resetMatrix = makeMatrix();
resetMatrix.setVisualState({ proximity: 1, captureActive: true, captureProgress: 0.73 });
resetMatrix.hackTimer = 0.8;
resetMatrix.flashTimer = 0.3;
resetMatrix.pulseRings.push({ t: 0, life: 1 });
resetMatrix.resetVisualState();
T('reset clears proximity, capture, warning and pulse state', () =>
  resetMatrix.visualProximity === 0
  && resetMatrix.captureActive === false
  && resetMatrix.captureProgress === 0
  && resetMatrix.hackTimer === 0
  && resetMatrix.flashTimer === 0
  && resetMatrix.pulseRings.length === 0);
T('a fresh second-run matrix starts visually clean', () => {
  const fresh = makeMatrix();
  return fresh.visualProximity === 0 && !fresh.captureActive && fresh.captureProgress === 0
    && fresh.hackTimer === 0 && fresh.flashTimer === 0 && fresh.pulseRings.length === 0;
});
T('core theft and deposit gameplay still work', () => {
  const matrix = makeMatrix();
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const stolen = matrix.stealCore(0);
    const deposited = matrix.slotCore(3);
    return stolen?.type === 'silver' && stolen.value === 3 && deposited && matrix.stored === 6;
  } finally { Math.random = originalRandom; }
});
T('visual draws never mutate placement or charge', () => {
  const matrix = makeMatrix();
  const before = [matrix.pos.x, matrix.pos.y, matrix.stored, matrix.capacity].join(',');
  draw(matrix, 0);
  draw(matrix, { proximity: 1, captureActive: true, captureProgress: 0.5 });
  return [matrix.pos.x, matrix.pos.y, matrix.stored, matrix.capacity].join(',') === before;
});

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
if (failures.length) {
  console.log('CURRENT FAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
}
process.exit(fail ? 1 : 0);
