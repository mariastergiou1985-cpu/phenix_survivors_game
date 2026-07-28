// ══════════════════════════════════════════════════════════════════════════════════════════════
// DESTRUCTIBLE OBSTACLES + HOLOGRAPHIC COLLISION CELLS (2026-07-28)
// ----------------------------------------------------------------------------------------------
// The big solid props of the multi-deck maps (machines, kiosks, fountains, pillar bases, big
// structures) are no longer permanent walls: each one is a destructible entity that
//   1. blocks movement while active (through the SAME MapManager walkability authority every
//      mover already asks — player, enemies, spawns, pickups, hazards, arenas),
//   2. takes real damage from the existing combat paths,
//   3. dies with a bounded procedural Canvas-2D destruction sequence,
//   4. removes its collider COMPLETELY — the spot returns to base walkable floor.
//
// WHERE THE ENTITIES COME FROM — no new authored data:
//   * MAIN strips: the connected components of MAIN_OBSTACLES (DeckMasks.js), the solid-core
//     masks measured on the shipped art. One component = one authored prop. The strip tiles
//     infinitely (mirror tiling), so an instance is (component, tile) and is materialised lazily
//     for the tiles around the player — bounded, never one entity per infinite repeat.
//   * SECTION decks (upper/lower): the INTERIOR blocked islands of the deck walk masks — blocked
//     components that do NOT touch the deck border. Border-connected blocked cells are the deck's
//     real walls/void and stay permanent; free-standing pillar footings and machine bases become
//     destructible. Size-filtered so a deliberately-dropped walkway (endless/upper, 1082 cells)
//     can never be opened by shooting it.
//
// WALKABILITY IS TWO LAYERS, exactly as specified:
//   immutable base masks (DeckMasks.js, frozen)  −  the OPEN-CELL overlay owned here.
// MapManager consults this handler only when a cell it is about to report as blocked might have
// been destroyed. Nothing is ever written into the base masks; a new run clears the overlay.
//
// THE OBSTACLE ART IS PAINTED INTO THE MAP PNG and cannot be erased at runtime. Destruction
// therefore ends in a permanent (run-scoped) procedural DE-REZ RESIDUE decal over the footprint:
// the object reads as dematerialised, the floor reads as open, and the collider is gone for real.
//
// All rendering is plain Canvas 2D — paths, gradients, additive blending, seeded deterministic
// debris, strict lifetimes, bounded arrays. No WebGL, no engine, no plugins, no new raster art.
// ══════════════════════════════════════════════════════════════════════════════════════════════
import { DECK_MASKS, deckMaskBits, MAIN_OBSTACLES, mainObstacleBits } from './DeckMasks.js?v=20260829000000';
import { Vec2 } from '../constants.js';

const FX_DUR          = 0.9;    // destruction sequence length, seconds (hard bound)
const REINFORCED_AREA = 10;     // cells (24 world px each); >= this = reinforced tier
const SECTION_MIN     = 3;      // interior island min cells — under this it is clutter, ignored
const SECTION_MAX     = 160;    // interior island max cells — over this it is structure, permanent
const TILE_RANGE      = 1;      // main strips: materialise instances for playerTile ± this
const MAX_INSTANCES   = 220;    // absolute cap on live entities (safety bound, never reached in play)
const MAX_DECALS      = 140;    // per-deck cap on destroyed-residue decals (FIFO)
const CAGE_H          = 24;     // holographic cage height, world px
const NEAR_GLOW_DIST  = 300;    // player proximity distance for cell brightening

// Deterministic tiny PRNG (mulberry32) — debris and cracks are seeded per entity, never random.
function _rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class DestructibleObstacles {
  constructor(game) {
    this.game       = game;
    this._models    = new Map();   // deckKey -> component model (built once per mode/deck)
    this._instances = new Map();   // key -> live entity on the ACTIVE deck near the player
    this._open      = new Map();   // deckKey -> Map<tile, Set<cellIdx>>  (destroyed colliders)
    this._destroyed = new Set();   // instance keys destroyed this run (survives deck switches)
    this._decals    = new Map();   // deckKey -> [{tile,x0,y0,x1,y1,seed}] destroyed-residue decals
    this._activeDeckKey = null;
    this._t         = 0;           // animation clock (accumulated dt — pauses with the game)
    this._sparkCd   = 0;
  }

  // ── RUN LIFECYCLE ──────────────────────────────────────────────────────────────────────────
  /** New run: every obstacle returns, HP and states clear, zero cross-run leakage. */
  resetRun() {
    this._instances.clear();
    this._open.clear();
    this._destroyed.clear();
    this._decals.clear();
    this._activeDeckKey = null;
    this._t = 0;
  }

  // ── DYNAMIC WALKABILITY (consulted by MapManager on otherwise-blocked cells only) ──────────
  /** Main-strip obstacle cell already destroyed on this tile? */
  isOpenMain(mode, tile, cellIdx) {
    const m = this._open.get(mode + ':main');
    if (!m) return false;
    const s = m.get(tile);
    return s ? s.has(cellIdx) : false;
  }
  /** Section-deck blocked cell already destroyed? */
  isOpenSection(mode, section, cellIdx) {
    const m = this._open.get(mode + ':' + section);
    if (!m) return false;
    const s = m.get(0);
    return s ? s.has(cellIdx) : false;
  }

  // ── MODELS (component labelling — once per mode/deck, from the frozen masks) ───────────────
  _model(mode, deck) {
    const key = mode + ':' + deck;
    if (this._models.has(key)) return this._models.get(key);
    const mm = this.game.mapManager;
    if (!mm) return null;
    let model = null;
    if (deck === 'main') model = this._buildMainModel(mode, mm);
    else                 model = this._buildSectionModel(mode, deck, mm);
    if (model) this._models.set(key, model);      // null = art not ready yet, retry next tick
    return model;
  }

  _label(blocked, cols, rows, cellOk) {
    // 4-connected component labelling over `blocked` (Uint8Array, 1 = solid). Deterministic
    // row-major scan order; bounded by the mask size. Returns [{id,cells,area,c0,r0,c1,r1}].
    const compId = new Int32Array(cols * rows).fill(-1);
    const comps = [];
    const stack = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i0 = r * cols + c;
        if (blocked[i0] !== 1 || compId[i0] !== -1) continue;
        const id = comps.length;
        const comp = { id, cells: [], area: 0, c0: c, r0: r, c1: c, r1: r };
        stack.length = 0; stack.push(i0); compId[i0] = id;
        while (stack.length) {
          const i = stack.pop();
          const cy = (i / cols) | 0, cx = i - cy * cols;
          comp.cells.push(i); comp.area++;
          if (cx < comp.c0) comp.c0 = cx; if (cx > comp.c1) comp.c1 = cx;
          if (cy < comp.r0) comp.r0 = cy; if (cy > comp.r1) comp.r1 = cy;
          const nb = [i - 1, i + 1, i - cols, i + cols];
          const nx = [cx - 1, cx + 1, cx, cx];
          for (let k = 0; k < 4; k++) {
            const j = nb[k];
            if (nx[k] < 0 || nx[k] >= cols || j < 0 || j >= cols * rows) continue;
            if (blocked[j] === 1 && compId[j] === -1) { compId[j] = id; stack.push(j); }
          }
        }
        if (cellOk && !cellOk(comp)) { comps.push(null); continue; }   // keep ids stable
        comps.push(comp);
      }
    }
    return { comps, compId };
  }

  _buildMainModel(mode, mm) {
    const spec = MAIN_OBSTACLES[mode];
    const bits = spec ? mainObstacleBits(mode) : null;
    const wm   = mm._walkModel ? mm._walkModel(mode) : null;   // needs the art for tileW
    if (!spec || !bits || !wm || wm.kind === 'mask') return null;
    const S = mm.CITY_SCALE;
    const { comps, compId } = this._label(bits, spec.cols, spec.maskRows, null);
    return {
      kind: 'main', mode, deck: 'main', spec,
      cols: spec.cols, rows: spec.maskRows,
      cellW: spec.cell * S,
      tileWorld: wm.tileW * S,
      comps: comps.map(c => c && this._finishComp(c, spec.cell * S)),
      compId,
    };
  }

  _buildSectionModel(mode, deck, mm) {
    const spec = DECK_MASKS[mode] && DECK_MASKS[mode][deck];
    const bits = spec ? deckMaskBits(mode, deck) : null;
    const b    = mm.deckBounds ? mm.deckBounds(mode, deck) : null;
    if (!spec || !bits || !b) return null;
    const cols = spec.cols, rows = spec.rows, n = cols * rows;
    // blocked = NOT walkable; flood the border-connected blocked region (walls / void).
    const blocked = new Uint8Array(n);
    for (let i = 0; i < n; i++) blocked[i] = bits[i] === 1 ? 0 : 1;
    const exterior = new Uint8Array(n);
    const queue = [];
    for (let c = 0; c < cols; c++) { queue.push(c, (rows - 1) * cols + c); }
    for (let r = 0; r < rows; r++) { queue.push(r * cols, r * cols + cols - 1); }
    for (const i of queue) if (blocked[i] === 1) exterior[i] = 1;
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      if (blocked[i] !== 1 || exterior[i] !== 1) continue;
      const cy = (i / cols) | 0, cx = i - cy * cols;
      const nb = [[cx - 1, i - 1], [cx + 1, i + 1], [cx, i - cols], [cx, i + cols]];
      for (const [nxc, j] of nb) {
        if (nxc < 0 || nxc >= cols || j < 0 || j >= n) continue;
        if (blocked[j] === 1 && exterior[j] !== 1) { exterior[j] = 1; queue.push(j); }
      }
    }
    // interior islands only, size-filtered, and each must actually border walkable floor.
    const interior = new Uint8Array(n);
    for (let i = 0; i < n; i++) interior[i] = (blocked[i] === 1 && exterior[i] !== 1) ? 1 : 0;
    const touchFloor = (comp) => {
      let touches = 0;
      for (const i of comp.cells) {
        const cy = (i / cols) | 0, cx = i - cy * cols;
        if (cx > 0 && bits[i - 1] === 1) touches++;
        if (cx < cols - 1 && bits[i + 1] === 1) touches++;
        if (cy > 0 && bits[i - cols] === 1) touches++;
        if (cy < rows - 1 && bits[i + cols] === 1) touches++;
        if (touches >= 3) return true;
      }
      return false;
    };
    const { comps, compId } = this._label(interior, cols, rows,
      c => c.area >= SECTION_MIN && c.area <= SECTION_MAX && touchFloor(c));
    const S = mm.CITY_SCALE;
    return {
      kind: 'section', mode, deck, spec,
      cols, rows, cellW: spec.cell * S,
      ox: b.x0, oy: b.y0,
      comps: comps.map(c => c && this._finishComp(c, spec.cell * S)),
      compId,
    };
  }

  _finishComp(c, cellW) {
    c.tier  = c.area >= REINFORCED_AREA ? 'reinforced' : 'common';
    c.maxHp = c.tier === 'reinforced' ? Math.round(420 + 22 * c.area)
                                      : Math.round(70 + 16 * c.area);
    c.w = (c.c1 - c.c0 + 1) * cellW;
    c.h = (c.r1 - c.r0 + 1) * cellW;
    return c;
  }

  // ── INSTANCES (live entities on the active deck, near the player — bounded) ────────────────
  _compWorldBox(model, comp, tile) {
    const cw = model.cellW;
    if (model.kind === 'section') {
      return { x0: model.ox + comp.c0 * cw, y0: model.oy + comp.r0 * cw,
               x1: model.ox + (comp.c1 + 1) * cw, y1: model.oy + (comp.r1 + 1) * cw };
    }
    const tW = model.tileWorld;
    const mirrored = ((tile % 2) + 2) % 2 === 1;
    const sx0 = comp.c0 * cw, sx1 = (comp.c1 + 1) * cw;
    const x0 = tile * tW + (mirrored ? tW - sx1 : sx0);
    return { x0, y0: comp.r0 * cw, x1: x0 + (sx1 - sx0), y1: (comp.r1 + 1) * cw };
  }

  _ensureInstance(model, deckKey, comp, tile) {
    if (!comp) return;
    const key = deckKey + ':' + comp.id + ':' + tile;
    if (this._destroyed.has(key) || this._instances.has(key)) return;
    if (this._instances.size >= MAX_INSTANCES) return;
    const b = this._compWorldBox(model, comp, tile);
    this._instances.set(key, {
      key, deckKey, model, comp, tile,
      id: comp.id, deckId: deckKey, type: comp.tier,
      x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2,
      width: b.x1 - b.x0, height: b.y1 - b.y0,
      x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
      maxHp: comp.maxHp, hp: comp.maxHp,
      state: 'intact', damageFlash: 0, pulseT: 0, fxT: 0,
      destroyed: false, collisionEnabled: true,
      seed: _hash(key), debris: null,
    });
  }

  /** Per-frame tick. Cheap: bounded instance set, no allocation on the steady path. */
  update(dt) {
    const g = this.game;
    const mode = g._chaosMode ? 'chaos' : (g.endless ? 'endless' : null);
    if (!mode) {
      if (this._instances.size) this._instances.clear();
      return;
    }
    this._t += dt;
    if (this._sparkCd > 0) this._sparkCd -= dt;
    const deck = g._deck || 'main';
    const deckKey = mode + ':' + deck;
    if (this._activeDeckKey !== deckKey) {
      // Deck switch: live entities belong to exactly one deck. Destroyed state lives in
      // _open/_destroyed/_decals (all deck-keyed), so nothing leaks across decks.
      this._instances.clear();
      this._activeDeckKey = deckKey;
    }
    const model = this._model(mode, deck);
    if (model) {
      if (model.kind === 'main') {
        const px = g.player && g.player.pos ? g.player.pos.x : 0;
        const pt = Math.floor(px / model.tileWorld);
        for (const [k, inst] of this._instances) {
          if (inst.state === 'destroying') continue;               // let the sequence finish
          if (inst.tile < pt - TILE_RANGE || inst.tile > pt + TILE_RANGE) this._instances.delete(k);
        }
        for (let tile = pt - TILE_RANGE; tile <= pt + TILE_RANGE; tile++) {
          for (const comp of model.comps) this._ensureInstance(model, deckKey, comp, tile);
        }
      } else {
        for (const comp of model.comps) this._ensureInstance(model, deckKey, comp, 0);
      }
    }
    for (const [k, inst] of this._instances) {
      if (inst.damageFlash > 0) inst.damageFlash -= dt;
      if (inst.pulseT > 0) inst.pulseT -= dt;
      if (inst.state === 'destroying') {
        inst.fxT += dt;
        if (inst.fxT >= FX_DUR) { inst.state = 'removed'; this._instances.delete(k); }
      }
    }
  }

  // ── DAMAGE (called from the existing combat paths — never a separate damage system) ────────
  _overlaps(inst, x, y, r) {
    const qx = Math.max(inst.x0, Math.min(inst.x1, x));
    const qy = Math.max(inst.y0, Math.min(inst.y1, y));
    const dx = x - qx, dy = y - qy;
    return dx * dx + dy * dy <= r * r;
  }

  /**
   * Area damage at a world point. opts.heavy marks explosions / ultimates / evolved strikes:
   * reinforced obstacles resist everything else (they still fall to enough cumulative fire).
   * Returns the number of obstacles hit.
   */
  damageAt(x, y, r, dmg, opts = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(r >= 0) || !(dmg > 0)) return 0;
    let hits = 0;
    for (const inst of this._instances.values()) {
      if (!inst.collisionEnabled || inst.state === 'destroying' || inst.state === 'removed') continue;
      if (!this._overlaps(inst, x, y, r + 4)) continue;
      this._applyDamage(inst, dmg, opts, x, y);
      hits++;
    }
    return hits;
  }

  /** Projectile contact test. Consumes the projectile (returns true) on the first solid hit. */
  projectileHit(x, y, r, dmg, opts = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    for (const inst of this._instances.values()) {
      if (!inst.collisionEnabled || inst.state === 'destroying' || inst.state === 'removed') continue;
      if (!this._overlaps(inst, x, y, (r || 4) + 2)) continue;
      if (dmg > 0) this._applyDamage(inst, dmg, opts, x, y);
      return true;
    }
    return false;
  }

  _applyDamage(inst, dmg, opts, hx, hy) {
    let d = dmg;
    if (inst.type === 'reinforced' && !(opts && opts.heavy)) d *= 0.45;
    if (!(d > 0)) return;
    inst.hp -= d;
    inst.damageFlash = 0.12;
    inst.pulseT = Math.max(inst.pulseT, 0.30);
    if (inst.hp <= 0) { this._destroy(inst); return; }
    const q = inst.hp / inst.maxHp;
    inst.state = q < 0.33 ? 'critical' : (q < 0.66 ? 'damaged' : 'intact');
    if (this._sparkCd <= 0) {                        // visible, throttled hit feedback
      this._sparkCd = 0.06;
      const sx = Math.max(inst.x0, Math.min(inst.x1, hx ?? inst.x));
      const sy = Math.max(inst.y0, Math.min(inst.y1, hy ?? inst.y));
      this.game.particles?.spawnHitSparks?.(new Vec2(sx, sy), inst.type === 'reinforced' ? '#ff9100' : '#39d6ff');
    }
  }

  _destroy(inst) {
    inst.hp = 0;
    inst.state = 'destroying';
    inst.destroyed = true;
    inst.collisionEnabled = false;
    inst.fxT = 0;
    this._destroyed.add(inst.key);
    // COLLIDER REMOVED NOW — the same frame the destruction starts. No invisible ruin collider.
    this._openComp(inst);
    // Seeded, bounded debris: few LARGE readable pieces, deterministic per entity.
    const rnd = _rng(inst.seed);
    const n = 5 + Math.min(3, Math.floor(inst.comp.area / 6));
    inst.debris = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      inst.debris.push({
        a, spd: 70 + rnd() * 130,
        w: 6 + rnd() * Math.min(18, inst.width * 0.25),
        h: 4 + rnd() * 10,
        rot: rnd() * Math.PI, vr: (rnd() - 0.5) * 7,
        up: 30 + rnd() * 60,
      });
    }
    // Residue decal (run-scoped, FIFO-capped) — the spot reads destroyed from now on.
    const dk = inst.deckKey;
    if (!this._decals.has(dk)) this._decals.set(dk, []);
    const arr = this._decals.get(dk);
    arr.push({ tile: inst.tile, x0: inst.x0, y0: inst.y0, x1: inst.x1, y1: inst.y1, seed: inst.seed });
    if (arr.length > MAX_DECALS) arr.shift();
    // Existing bounded feedback systems only.
    this.game.audio?.playNanoMineExplode?.();
    this.game.screenShake?.trigger?.(3, 0.25);
    this.game.particles?.spawnExplosion?.(new Vec2(inst.x, inst.y),
      inst.type === 'reinforced' ? ['#ff9100', '#ffe650', '#ffffff'] : ['#39d6ff', '#9fe8ff', '#ffffff'], 16);
  }

  _openComp(inst) {
    const dk = inst.deckKey;
    if (!this._open.has(dk)) this._open.set(dk, new Map());
    const perTile = this._open.get(dk);
    const tile = inst.model.kind === 'main' ? inst.tile : 0;
    if (!perTile.has(tile)) perTile.set(tile, new Set());
    const s = perTile.get(tile);
    for (const i of inst.comp.cells) s.add(i);
  }

  // ── RENDER — Canvas 2D only, world-space, under entities ───────────────────────────────────
  draw(ctx) {
    const g = this.game;
    if (!(g.endless || g._chaosMode)) return;
    const cam = g.camera;
    if (!cam) return;
    const vx0 = cam.x - 80, vy0 = cam.y - 80;
    const vx1 = cam.x + (g._viewW || 1280) + 80, vy1 = cam.y + (g._viewH || 720) + 80;
    const px = g.player && g.player.pos ? g.player.pos.x : 0;
    const py = g.player && g.player.pos ? g.player.pos.y : 0;

    // 1) residue decals of this deck (under the cages)
    const decals = this._decals.get(this._activeDeckKey);
    if (decals) {
      for (const d of decals) {
        if (d.x1 < vx0 || d.x0 > vx1 || d.y1 < vy0 || d.y0 > vy1) continue;
        this._drawResidue(ctx, d);
      }
    }
    // 2) live cells + destruction sequences
    for (const inst of this._instances.values()) {
      if (inst.x1 < vx0 || inst.x0 > vx1 || inst.y1 < vy0 || inst.y0 > vy1) continue;
      if (inst.state === 'destroying') this._drawDestruction(ctx, inst);
      else this._drawCage(ctx, inst, px, py);
    }
  }

  _colors(inst) {
    return inst.type === 'reinforced'
      ? { line: '#ff9100', glow: 'rgba(255,145,0,',  face: 'rgba(255,145,0,'  }
      : { line: '#39d6ff', glow: 'rgba(57,214,255,', face: 'rgba(57,214,255,' };
  }

  /** Premium 2.5D holographic containment cage on the collider footprint. No text, no numbers. */
  _drawCage(ctx, inst, px, py) {
    const { x0, y0, x1, y1 } = inst;
    const H = CAGE_H;
    const t = this._t;
    const C = this._colors(inst);
    const dx = Math.max(0, Math.max(x0 - px, px - x1));
    const dy = Math.max(0, Math.max(y0 - py, py - y1));
    const near = Math.max(0, 1 - Math.hypot(dx, dy) / NEAR_GLOW_DIST);
    const q = inst.hp / inst.maxHp;
    // base visibility + proximity + damage pulse; critical flickers.
    let alpha = 0.30 + 0.32 * near + (inst.pulseT > 0 ? 0.35 * (inst.pulseT / 0.30) : 0);
    if (inst.state === 'critical') alpha *= 0.72 + 0.28 * Math.abs(Math.sin(t * 22 + inst.seed));
    if (inst.damageFlash > 0) alpha = Math.min(1, alpha + 0.4);
    const rnd = _rng(inst.seed);
    // critical: edge instability — small deterministic jitter that animates with time.
    const jit = inst.state === 'critical' ? 2.2 : (inst.state === 'damaged' ? 0.8 : 0);
    const j = (k) => jit ? Math.sin(t * 13 + inst.seed + k * 2.7) * jit : 0;

    ctx.save();
    ctx.lineJoin = 'round';
    // ── top face (lifted by H) — translucent hologram plane
    ctx.globalAlpha = alpha * 0.30;
    ctx.fillStyle = C.face + '0.16)';
    ctx.fillRect(x0, y0 - H, x1 - x0, y1 - y0);
    // ── vertical edges (perspective posts at the 4 corners)
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    corners.forEach(([cx, cy], k) => {
      ctx.moveTo(cx + j(k), cy);
      ctx.lineTo(cx + j(k + 1), cy - H);
    });
    ctx.stroke();
    // ── base + top outlines
    ctx.globalAlpha = alpha;
    ctx.strokeRect(x0 + j(1), y0 + j(2), (x1 - x0), (y1 - y0));
    ctx.globalAlpha = alpha * 0.75;
    ctx.strokeRect(x0 + j(3), y0 - H + j(4), (x1 - x0), (y1 - y0));
    // ── additive glow pass: scan line sweeping the base plane
    ctx.globalCompositeOperation = 'lighter';
    const sweep = ((t * 0.6 + (inst.seed % 97) / 97) % 1);
    const sy = y0 + (y1 - y0) * sweep;
    const grad = ctx.createLinearGradient(0, sy - 8, 0, sy + 8);
    grad.addColorStop(0, C.glow + '0)');
    grad.addColorStop(0.5, C.glow + (0.16 * alpha).toFixed(3) + ')');
    grad.addColorStop(1, C.glow + '0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, sy - 8, x1 - x0, 16);
    // ── cracks when the HP drops (seeded polylines on the base plane)
    if (q < 0.66) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, alpha + 0.15);
      ctx.strokeStyle = inst.type === 'reinforced' ? '#ffd27a' : '#c9f2ff';
      ctx.lineWidth = 1;
      const cracks = q < 0.33 ? 4 : 2;
      for (let c = 0; c < cracks; c++) {
        let cxp = x0 + rnd() * (x1 - x0), cyp = y0 + rnd() * (y1 - y0);
        ctx.beginPath(); ctx.moveTo(cxp, cyp);
        const segs = 3 + ((inst.seed >> c) & 3);
        for (let s = 0; s < segs; s++) {
          cxp += (rnd() - 0.5) * 26; cyp += (rnd() - 0.5) * 22;
          cxp = Math.max(x0, Math.min(x1, cxp)); cyp = Math.max(y0, Math.min(y1, cyp));
          ctx.lineTo(cxp, cyp);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Bounded procedural destruction: flicker → warp → burst ring → debris → residue smoke. */
  _drawDestruction(ctx, inst) {
    const p = Math.min(1, inst.fxT / FX_DUR);
    const { x0, y0, x1, y1 } = inst;
    const cx = inst.x, cy = inst.y;
    const C = this._colors(inst);
    ctx.save();
    // 1) collapsing cage: flicker hard, edges melt down (0 → 0.45)
    if (p < 0.45) {
      const k = p / 0.45;
      const flick = 0.5 + 0.5 * Math.sin(inst.fxT * 70 + inst.seed);
      const h = CAGE_H * (1 - k);
      ctx.globalAlpha = (1 - k) * 0.85 * flick;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeRect(x0, y0 - h, x1 - x0, y1 - y0);
    }
    ctx.globalCompositeOperation = 'lighter';
    // 2) burst ring + core flash (0.1 → 0.6)
    if (p >= 0.1 && p < 0.6) {
      const k = (p - 0.1) / 0.5;
      const R = 14 + k * Math.max(inst.width, inst.height) * 0.9;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.8);
      g2.addColorStop(0, 'rgba(255,255,255,' + (0.5 * (1 - k)).toFixed(3) + ')');
      g2.addColorStop(1, C.glow + '0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    // 3) big readable debris pieces (0.12 → 0.85), deterministic, few
    if (inst.debris && p >= 0.12 && p < 0.85) {
      const k = (p - 0.12) / 0.73;
      for (const d of inst.debris) {
        const dist = d.spd * k;
        const dxp = cx + Math.cos(d.a) * dist;
        const dyp = cy + Math.sin(d.a) * dist - d.up * k * (1 - k) * 2;   // small arc up then down
        ctx.save();
        ctx.translate(dxp, dyp);
        ctx.rotate(d.rot + d.vr * k);
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = C.face + '0.55)';
        ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
        ctx.restore();
      }
    }
    // 4) fast-clearing energy residue (0.55 → 1)
    if (p >= 0.55) {
      const k = (p - 0.55) / 0.45;
      ctx.globalAlpha = (1 - k) * 0.35;
      const g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(inst.width, inst.height) * 0.7);
      g3.addColorStop(0, C.glow + '0.30)');
      g3.addColorStop(1, C.glow + '0)');
      ctx.fillStyle = g3;
      ctx.fillRect(x0 - 20, y0 - 20, (x1 - x0) + 40, (y1 - y0) + 40);
    }
    ctx.restore();
  }

  /** Run-scoped de-rez residue: the painted prop reads as dematerialised, the floor as open. */
  _drawResidue(ctx, d) {
    const t = this._t;
    ctx.save();
    // darken the footprint — the art below reads as a powered-down husk
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#04070d';
    ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
    // faint glitch scan shimmer, deterministic per decal, very low alpha
    ctx.globalCompositeOperation = 'lighter';
    const ph = ((t * 0.35 + (d.seed % 89) / 89) % 1);
    const sy = d.y0 + (d.y1 - d.y0) * ph;
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#39d6ff';
    ctx.fillRect(d.x0, sy, d.x1 - d.x0, 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#1b4a5e';
    ctx.setLineDash([5, 7]);
    ctx.strokeRect(d.x0 + 1, d.y0 + 1, (d.x1 - d.x0) - 2, (d.y1 - d.y0) - 2);
    ctx.restore();
  }
}
