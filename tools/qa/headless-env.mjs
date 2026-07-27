// Headless browser-API shim so the REAL Game class can be instantiated and driven in Node.
// Import this FIRST (before any js/ module) — it installs the globals Game.js touches at
// construction time. Deliberately minimal: every stub is inert, so anything a harness
// observes is produced by production logic, not by the shim.
//
//   import { installEnv } from './headless-env.mjs';
//   installEnv();
//   const { Game } = await import(JS + 'game/Game.js');

export function makeCtx() {
  return {
    canvas: { width: 1280, height: 720 },
    globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    shadowColor: '', shadowBlur: 0, lineCap: '', lineJoin: '', lineDashOffset: 0,
    save() {}, restore() {}, clearRect() {}, fillRect() {}, strokeRect() {}, drawImage() {},
    beginPath() {}, closePath() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, arc() {},
    arcTo() {}, rect() {}, roundRect() {}, ellipse() {}, clip() {}, translate() {}, scale() {},
    rotate() {}, setTransform() {}, resetTransform() {}, transform() {}, setLineDash() {},
    fillText() {}, strokeText() {}, putImageData() {}, drawFocusIfNeeded() {},
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    quadraticCurveTo() {}, bezierCurveTo() {}, isPointInPath: () => false,
    // getTransform was missing, and its absence was NOT harmless: Game.draw() threw inside
    // _drawFusionClouds on the very first call, which aborted the whole draw pipeline. Any system
    // that only initialises during draw therefore never came up headlessly - Oni's entire kit
    // (Protocol 0, Laser Eyes, Meteor Rain) builds in _drawOniFx behind `if (!this._canvas)`, so
    // it measured as a character that deals ZERO damage. That is a harness artifact, not a
    // production defect. Any inert stub that returns a plausible value belongs here.
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
                           inverse() { return this; },
                           multiply() { return this; },
                           translate() { return this; },
                           scale() { return this; } }),
    setLineDash2() {}, getLineDash: () => [],
    createConicGradient: () => ({ addColorStop() {} }),
    createImageData: (w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    reset() {}, roundRect2() {},
  };
}

function makeEl() {
  const ctx = makeCtx();
  const e = {
    style: {}, dataset: {}, className: '', id: '', innerHTML: '', textContent: '', value: '',
    width: 1280, height: 720, offsetWidth: 1280, offsetHeight: 720, checked: false, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { return c; }, removeChild(c) { return c; }, remove() {}, insertBefore(c) { return c; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, focus() {}, blur() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }),
    setPointerCapture() {}, releasePointerCapture() {}, scrollIntoView() {},
  };
  e.parentNode = null; e.firstChild = null; e.children = [];
  return e;
}

export function installEnv() {
  globalThis.window = globalThis;
  globalThis.document = {
    addEventListener() {}, removeEventListener() {}, createElement: makeEl,
    createElementNS: makeEl, createTextNode: () => makeEl(),
    body: makeEl(), documentElement: makeEl(), head: makeEl(),
    getElementById: () => makeEl(), querySelector: () => makeEl(), querySelectorAll: () => [],
    fonts: { add() {}, ready: Promise.resolve() }, hidden: false, referrer: '',
    fullscreenElement: null, exitFullscreen: () => Promise.resolve(),
  };
  // OffscreenCanvas is used by Effects.drawBloom; without it draw() aborts partway through and
  // every draw-initialised system stays dark (see the getTransform note above).
  globalThis.OffscreenCanvas = class {
    constructor(w = 1, h = 1) { this.width = w; this.height = h; }
    getContext() { return makeCtx(); }
    convertToBlob() { return Promise.resolve({}); }
    transferToImageBitmap() { return { width: this.width, height: this.height, close() {} }; }
  };
  globalThis.createImageBitmap = () => Promise.resolve({ width: 1, height: 1, close() {} });
  globalThis.Image = class { constructor() { this.complete = true; this.naturalWidth = 64; this.naturalHeight = 64; } set src(_) {} get src() { return ''; } addEventListener() {} };
  globalThis.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} };
  globalThis.KeyboardEvent = class { constructor(t, o = {}) { this.type = t; this.key = o.key || ''; } };
  globalThis.Event = class { constructor(t) { this.type = t; } };
  globalThis.localStorage = {
    _d: {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
    clear() { this._d = {}; }, key(i) { return Object.keys(this._d)[i] ?? null; },
    get length() { return Object.keys(this._d).length; },
  };
  globalThis.sessionStorage = globalThis.localStorage;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  // window-level listeners. Without these, js/effects/toxic_sniper_kit_sprites.js:550 threw on
  // import and euclid_vector was completely unmeasurable headlessly (~900 update errors/min),
  // which silently excluded that character from every balance and build audit.
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.dispatchEvent = () => true;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  globalThis.AudioContext = class {
    constructor() { this.destination = {}; this.currentTime = 0; this.state = 'running'; }
    createGain() { return { connect() {}, disconnect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} } }; }
    createOscillator() { return { connect() {}, disconnect() {}, start() {}, stop() {}, type: '', frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    createBiquadFilter() { return { connect() {}, disconnect() {}, type: '', frequency: { value: 0, setValueAtTime() {} }, Q: { value: 0 } }; }
    createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
    createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {}, buffer: null, loop: false }; }
    createDynamicsCompressor() { return { connect() {}, disconnect() {}, threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } }; }
    createStereoPanner() { return { connect() {}, disconnect() {}, pan: { value: 0 } }; }
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
  };
  globalThis.webkitAudioContext = globalThis.AudioContext;
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node-qa', maxTouchPoints: 0, getGamepads: () => [], language: 'en',
             serviceWorker: { register: () => Promise.resolve(), getRegistrations: () => Promise.resolve([]), addEventListener() {} } },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'location', {
    value: { hostname: 'localhost', href: 'http://localhost/', search: '', protocol: 'http:', reload() {} },
    configurable: true,
  });
  if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };
}

/** Silence the game's boot chatter so harness output stays readable. Returns a restore fn. */
export function muteConsole() {
  const { log, warn, error, info } = console;
  console.log = console.warn = console.info = () => {};
  return () => { console.log = log; console.warn = warn; console.info = info; console.error = error; };
}
