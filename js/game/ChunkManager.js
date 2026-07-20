// ─── ChunkManager.js ────────────────────────────────────────────────────────
// Chunk streaming system for PHENIX: NULL EDEN 2.0.
// Owns:
//   • Chunk data structure (position, biome, type, loaded state)
//   • 3×3 active grid around the player
//   • Load/unload lifecycle
//   • Procedural biome assignment (seeded)
//   • Dynamic world bounds (active area)
//   • Spawn helpers (camera-relative enemy placement)
// ────────────────────────────────────────────────────────────────────────────

import { EVENTS } from './EventBus.js?v=20260702700000';
import { BIOME_ID, BIOME_DEFS, CHUNK_SIZE, ACTIVE_GRID } from './MapManager.js?v=20260724000000';

// ─── Constants ──────────────────────────────────────────────────────────────
const UNLOAD_DISTANCE = 2;   // chunks beyond active grid before unload
const MAX_CACHED = 32;       // max chunks kept in memory (LRU eviction)

// ─── Chunk Content Types ────────────────────────────────────────────────────
export const CHUNK_TYPE = Object.freeze({
  OPEN_FIELD:  'open_field',
  CORRIDOR:    'corridor',
  ARENA:       'arena',
  INTERIOR:    'interior',
  VOID_ZONE:   'void_zone',
  TRANSITION:  'transition',
});

// Weighted spawn table for chunk types (from GDD 7.2)
const TYPE_WEIGHTS = [
  { type: CHUNK_TYPE.OPEN_FIELD, weight: 40 },
  { type: CHUNK_TYPE.CORRIDOR,   weight: 20 },
  { type: CHUNK_TYPE.ARENA,      weight: 10 },
  { type: CHUNK_TYPE.INTERIOR,   weight: 15 },
  { type: CHUNK_TYPE.VOID_ZONE,  weight: 10 },
  { type: CHUNK_TYPE.TRANSITION, weight: 5 },
];
const TOTAL_TYPE_WEIGHT = TYPE_WEIGHTS.reduce((s, w) => s + w.weight, 0);

// ─── Seeded RNG (simple mulberry32) ─────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic hash for chunk coordinates → consistent biome/type per position
function chunkSeed(cx, cy, worldSeed) {
  // Simple spatial hash
  return ((cx * 73856093) ^ (cy * 19349663) ^ worldSeed) >>> 0;
}

// ─── Chunk Data ─────────────────────────────────────────────────────────────
class Chunk {
  /**
   * @param {number} cx - chunk grid X coordinate
   * @param {number} cy - chunk grid Y coordinate
   * @param {string} biomeId - BIOME_ID value
   * @param {string} chunkType - CHUNK_TYPE value
   */
  constructor(cx, cy, biomeId, chunkType) {
    this.cx = cx;
    this.cy = cy;
    this.key = `${cx},${cy}`;

    // World-space bounds
    this.worldX = cx * CHUNK_SIZE;
    this.worldY = cy * CHUNK_SIZE;
    this.worldRight = this.worldX + CHUNK_SIZE;
    this.worldBottom = this.worldY + CHUNK_SIZE;

    // Content
    this.biomeId = biomeId;
    this.biome = BIOME_DEFS[biomeId];
    this.chunkType = chunkType;

    // State
    this.loaded = false;
    this.lastActive = 0;     // timestamp for LRU eviction

    // Frozen enemies (stored when chunk is unloaded)
    this.frozenEnemies = [];
  }
}

// ─── ChunkManager Class ────────────────────────────────────────────────────
export class ChunkManager {
  /**
   * @param {object} opts
   * @param {object}   opts.game   - Game instance
   * @param {import('./EventBus.js').EventBus} [opts.events] - EventBus
   * @param {number}   [opts.seed] - world generation seed
   */
  constructor({ game, events = null, seed = 42 }) {
    this.game = game;
    this.events = events;
    this.worldSeed = seed;

    // ─── LOGICAL WORLD ORIGIN (Maria 2026-07-19) ───────────────────────────
    // Endless periodically rebases the world by dx = −10032px so coordinates never grow
    // without bound. CHUNK_SIZE is 1280, and 10032 / 1280 = 7.84 — NOT a whole number.
    // So a rebase shifts every physical coordinate by a fractional number of chunks, and
    // anything deriving a chunk from the physical x (biome, sector, terrain) would jump
    // while the player has not logically moved at all: the outer Nexus would despawn and
    // respawn, and biome state could desynchronise, on every single rebase.
    //
    // The fix is to keep the LOGICAL world continuous. Each rebase adds the same dx back
    // into the origin, so logical = physical + origin is invariant:
    //     physical 15000, origin 0      → logical 15000
    //     rebase dx −10032
    //     physical  4968, origin 10032  → logical 15000   (biome unchanged)
    // Every biome/chunk query must go through getBiomeForWorldPosition(), never through
    // a raw floor(x / CHUNK_SIZE).
    this.logicalOriginX = 0;
    this.logicalOriginY = 0;   // rebasing is horizontal-only today, but keep the axis explicit

    /** @type {Map<string, Chunk>} All known chunks */
    this.chunks = new Map();

    /** @type {Set<string>} Currently active chunk keys */
    this.activeKeys = new Set();

    /** Player's current chunk coordinates */
    this.playerChunkX = 0;
    this.playerChunkY = 0;

    /** Previous player chunk (for detecting chunk transitions) */
    this._prevChunkX = null;
    this._prevChunkY = null;

    /** Whether chunk streaming is active */
    this.enabled = false;

    // Biome assignment ring — 5 sectors radiating from Neon District center
    // Neon District stays center-only (dist 0), not in this ring.
    // Compact layout: 4 practical biomes total (center + 3 outer).
    this._biomeRing = [
      BIOME_ID.INDUSTRIAL_CORE,
      BIOME_ID.ABYSSAL_TRENCH,
      BIOME_ID.GLACIAL_EXPANSE,
      BIOME_ID.ORBITAL_NEXUS,
      BIOME_ID.DATA_WASTES,
    ];
  }

  // ─── Enable/Disable ─────────────────────────────────────────────────────
  enable() {
    this.enabled = true;
    // Generate initial chunks around player start position
    this._updateActiveChunks(true);
  }

  disable() {
    this.enabled = false;
  }

  // ─── Core Update ────────────────────────────────────────────────────────
  /**
   * Called every frame from Game.update(). Checks if the player has moved
   * to a new chunk and updates the active grid accordingly.
   * @param {number} dt - delta time (unused currently but available for transitions)
   */
  update(dt) {
    if (!this.enabled) return;

    const player = this.game.player;
    if (!player) return;

    // Determine which chunk the player is in
    const cx = Math.floor(player.pos.x / CHUNK_SIZE);
    const cy = Math.floor(player.pos.y / CHUNK_SIZE);

    if (cx !== this.playerChunkX || cy !== this.playerChunkY) {
      this.playerChunkX = cx;
      this.playerChunkY = cy;
      this._updateActiveChunks(false);
    }
  }

  // ─── Active Grid Management ─────────────────────────────────────────────
  /**
   * Recalculate which chunks should be active based on player position.
   * Loads new chunks, unloads distant ones.
   * @param {boolean} initial - true on first call (no transition events)
   */
  _updateActiveChunks(initial) {
    const cx = this.playerChunkX;
    const cy = this.playerChunkY;
    const half = Math.floor(ACTIVE_GRID / 2);   // 1 for 3×3
    const now = performance.now();

    const newKeys = new Set();

    // Generate/activate all chunks in the 3×3 grid
    for (let dx = -half; dx <= half; dx++) {
      for (let dy = -half; dy <= half; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        newKeys.add(key);

        if (!this.chunks.has(key)) {
          // Generate new chunk
          const chunk = this._generateChunk(cx + dx, cy + dy);
          this.chunks.set(key, chunk);
        }

        const chunk = this.chunks.get(key);
        chunk.lastActive = now;

        if (!chunk.loaded) {
          chunk.loaded = true;
          // Thaw frozen enemies
          if (chunk.frozenEnemies.length > 0 && !initial) {
            this._thawEnemies(chunk);
          }
        }
      }
    }

    // Unload chunks that are too far away
    const loaded = [];
    const unloaded = [];

    for (const [key, chunk] of this.chunks) {
      if (newKeys.has(key)) continue;

      const dist = Math.max(
        Math.abs(chunk.cx - cx),
        Math.abs(chunk.cy - cy),
      );

      if (dist > UNLOAD_DISTANCE && chunk.loaded) {
        chunk.loaded = false;
        // Freeze enemies in this chunk
        this._freezeEnemiesInChunk(chunk);
        unloaded.push(key);
      }
    }

    // LRU eviction if too many chunks cached
    if (this.chunks.size > MAX_CACHED) {
      const sorted = [...this.chunks.entries()]
        .filter(([k]) => !newKeys.has(k))
        .sort((a, b) => a[1].lastActive - b[1].lastActive);

      while (this.chunks.size > MAX_CACHED && sorted.length > 0) {
        const [evictKey] = sorted.shift();
        this.chunks.delete(evictKey);
      }
    }

    // Detect chunk transition
    if (!initial && (this._prevChunkX !== cx || this._prevChunkY !== cy)) {
      const oldBiome = this._prevChunkX !== null
        ? this._getBiomeForCoords(this._prevChunkX, this._prevChunkY)
        : null;
      const newBiome = this._getBiomeForCoords(cx, cy);

      if (this.events && oldBiome && oldBiome !== newBiome) {
        this.events.emit(EVENTS.BIOME_CHANGED, {
          from: oldBiome,
          to: newBiome,
          chunkX: cx,
          chunkY: cy,
        });
      }
    }

    this._prevChunkX = cx;
    this._prevChunkY = cy;
    this.activeKeys = newKeys;
  }

  // ─── Chunk Generation ───────────────────────────────────────────────────
  /**
   * Procedurally generate a chunk at grid coordinates (cx, cy).
   * Uses seeded RNG for deterministic world generation.
   * @param {number} cx
   * @param {number} cy
   * @returns {Chunk}
   */
  _generateChunk(cx, cy) {
    const seed = chunkSeed(cx, cy, this.worldSeed);
    const rng = mulberry32(seed);

    // Determine biome
    const biomeId = this._getBiomeForCoords(cx, cy);

    // Determine chunk type (weighted random)
    let chunkType = CHUNK_TYPE.OPEN_FIELD;

    // Starting chunk (0,0) is always open field
    if (cx === 0 && cy === 0) {
      chunkType = CHUNK_TYPE.OPEN_FIELD;
    } else {
      let roll = rng() * TOTAL_TYPE_WEIGHT;
      for (const entry of TYPE_WEIGHTS) {
        roll -= entry.weight;
        if (roll <= 0) { chunkType = entry.type; break; }
      }
    }

    return new Chunk(cx, cy, biomeId, chunkType);
  }

  // ─── Biome Assignment ───────────────────────────────────────────────────
  /**
   * Determine which biome a chunk belongs to based on its position.
   * Compact arena layout (v2):
   *   • dist === 0 : Neon District (center chunk)
   *   • dist >= 1  : 3 outer biomes by angular sector — extends infinitely
   *     so any visible chunk has a real biome (no black void ever).
   * Player is hard-clamped to dist 0–1 by getWorldBounds().
   * Chunks beyond dist 1 are visual padding only (camera overflow).
   * @param {number} cx
   * @param {number} cy
   * @returns {string} BIOME_ID
   */
  /** Biome id at a world position (delegates to the sector ring mapping). */
  biomeAtWorld(x, y) {
    return this._getBiomeForCoords(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
  }

  /** Chunk type of the chunk the player currently stands in (null if unknown). */
  currentChunkType() {
    const c = this.chunks.get(`${this.playerChunkX},${this.playerChunkY}`);
    return c ? c.chunkType : null;
  }

  // ─── PUBLIC BIOME/COORDINATE API ─────────────────────────────────────────
  /** Physical world position → logical position (rebase-invariant). */
  toLogical(worldX, worldY) {
    return { x: worldX + this.logicalOriginX, y: worldY + this.logicalOriginY };
  }

  /**
   * THE single authority for "which biome is this world position in".
   * Callers pass PHYSICAL world coordinates (player.pos.x/y) and get the canonical
   * biome back; the logical conversion happens here so no caller can accidentally
   * build a second, rebase-sensitive sector model.
   */
  getBiomeForWorldPosition(worldX, worldY) {
    const lx = worldX + this.logicalOriginX;
    const ly = worldY + this.logicalOriginY;
    return this._getBiomeForCoords(Math.floor(lx / CHUNK_SIZE), Math.floor(ly / CHUNK_SIZE));
  }

  /**
   * Canonical world-rebase hook. Called EXACTLY ONCE per rebase, from the single place
   * that shifts the world. It only moves the logical origin — shifting the physical
   * runtime objects stays the caller's job — so that logical coordinates, and therefore
   * biome identity, survive the rebase completely unchanged.
   */
  applyWorldRebase(dx, dy = 0) {
    this.logicalOriginX -= dx;
    this.logicalOriginY -= dy;
  }

  _getBiomeForCoords(cx, cy) {
    // Center chunk: Neon District
    if (cx === 0 && cy === 0) return BIOME_ID.NEON_DISTRICT;

    // ALL other chunks: angular sector biome (no Null — no black void)
    const angle = Math.atan2(cy, cx);                          // -PI to PI
    const normalizedAngle = (angle + Math.PI) / (2 * Math.PI); // 0 to 1
    const sectorIndex = Math.floor(normalizedAngle * this._biomeRing.length) % this._biomeRing.length;

    return this._biomeRing[sectorIndex];
  }

  // ─── Enemy Freeze/Thaw ──────────────────────────────────────────────────
  /**
   * Freeze enemies that are inside an unloaded chunk.
   * Removes them from the game's active enemy array and stores them in the chunk.
   */
  _freezeEnemiesInChunk(chunk) {
    if (!this.game.enemies) return;

    const frozen = [];
    const remaining = [];

    for (const enemy of this.game.enemies) {
      if (this._isInChunk(enemy.pos, chunk)) {
        frozen.push({
          type: enemy.enemyType,
          hp: enemy.hp,
          x: enemy.pos.x,
          y: enemy.pos.y,
        });
      } else {
        remaining.push(enemy);
      }
    }

    if (frozen.length > 0) {
      chunk.frozenEnemies = frozen;
      this.game.enemies = remaining;
    }
  }

  /**
   * Thaw previously frozen enemies back into the game.
   */
  _thawEnemies(chunk) {
    // Thaw is handled by Game.js — we just emit an event with the data
    if (this.events && chunk.frozenEnemies.length > 0) {
      this.events.emit(EVENTS.ENEMIES_THAW, {
        enemies: chunk.frozenEnemies,
        chunkKey: chunk.key,
      });
      chunk.frozenEnemies = [];
    }
  }

  // ─── Query Helpers ──────────────────────────────────────────────────────

  /** Check if a world position is inside a specific chunk */
  _isInChunk(pos, chunk) {
    return pos.x >= chunk.worldX && pos.x < chunk.worldRight
        && pos.y >= chunk.worldY && pos.y < chunk.worldBottom;
  }

  /** Get the chunk at a world position */
  getChunkAt(worldX, worldY) {
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cy = Math.floor(worldY / CHUNK_SIZE);
    return this.chunks.get(`${cx},${cy}`) || null;
  }

  /** Get the biome at a world position */
  getBiomeAt(worldX, worldY) {
    const chunk = this.getChunkAt(worldX, worldY);
    if (chunk) return chunk.biome;
    // Fallback: calculate without creating a chunk
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cy = Math.floor(worldY / CHUNK_SIZE);
    return BIOME_DEFS[this._getBiomeForCoords(cx, cy)];
  }

  /** Get all currently active (loaded) chunks */
  getActiveChunks() {
    const result = [];
    for (const key of this.activeKeys) {
      const chunk = this.chunks.get(key);
      if (chunk) result.push(chunk);
    }
    return result;
  }

  /** Get the player's current chunk */
  getPlayerChunk() {
    return this.chunks.get(`${this.playerChunkX},${this.playerChunkY}`) || null;
  }

  // ─── World Bounds (Active Area) ─────────────────────────────────────────
  /**
   * Returns the bounding box of the active chunk grid.
   * Used by camera, entity clamping, and spawn logic.
   * @returns {{ x: number, y: number, w: number, h: number, right: number, bottom: number }}
   */
  getActiveBounds() {
    const half = Math.floor(ACTIVE_GRID / 2);
    const x = (this.playerChunkX - half) * CHUNK_SIZE;
    const y = (this.playerChunkY - half) * CHUNK_SIZE;
    const size = ACTIVE_GRID * CHUNK_SIZE;
    return {
      x, y,
      w: size, h: size,
      right: x + size,
      bottom: y + size,
    };
  }

  // ─── Fixed World Bounds (playable area, not camera-relative) ─────────────
  /**
   * Returns the fixed bounding box of the entire playable area (dist 0–2).
   * Player and entities are hard-clamped to this region to prevent wandering
   * Compact arena: chunks [-1,1] → 3×3 grid = 3840×3840px.
   * Player is hard-clamped to this area. Chunks beyond are visual padding only.
   */
  getWorldBounds() {
    const minChunk = -1;
    const maxChunk =  1;
    return {
      left:   minChunk * CHUNK_SIZE,
      top:    minChunk * CHUNK_SIZE,
      right:  (maxChunk + 1) * CHUNK_SIZE,
      bottom: (maxChunk + 1) * CHUNK_SIZE,
    };
  }

  // ─── Spawn Helpers (camera-relative) ────────────────────────────────────
  /**
   * Get a spawn position just outside the camera viewport.
   * Replaces the old fixed-edge spawn logic for chunk streaming.
   * @param {object} camera - { x, y } camera position
   * @param {number} viewW - viewport width in world units
   * @param {number} viewH - viewport height in world units
   * @param {number} margin - how far outside the viewport to spawn (default 40)
   * @returns {{ x: number, y: number }}
   */
  getSpawnEdge(camera, viewW, viewH, margin = 40) {
    // 360° circular spawn around viewport center
    const cx = camera.x + viewW / 2;
    const cy = camera.y + viewH / 2;
    const spawnRadius = Math.max(viewW, viewH) / 2 + margin;
    const angle = Math.random() * Math.PI * 2;
    const x = cx + Math.cos(angle) * spawnRadius;
    const y = cy + Math.sin(angle) * spawnRadius;

    // Clamp to world bounds so spawns don't appear in void
    const wb = this.getWorldBounds();
    return {
      x: Math.max(wb.left, Math.min(wb.right, x)),
      y: Math.max(wb.top, Math.min(wb.bottom, y)),
    };
  }

  /**
   * Get a random position within the active area (for random spawns, drops, etc.)
   * @param {number} margin - inset from active bounds
   * @returns {{ x: number, y: number }}
   */
  getRandomActivePosition(margin = 100) {
    const b = this.getActiveBounds();
    return {
      x: b.x + margin + Math.random() * (b.w - margin * 2),
      y: b.y + margin + Math.random() * (b.h - margin * 2),
    };
  }

  // ─── Rendering Helpers ──────────────────────────────────────────────────
  /**
   * Draw ALL camera-visible chunk backgrounds (not just activeKeys).
   * Computes chunk range from camera viewport so no black gaps appear.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} camera - { x, y }
   * @param {number} viewW
   * @param {number} viewH
   */
  drawChunkBackgrounds(ctx, camera, viewW, viewH) {
    // Compute which chunk coords the camera can see (+ 1 chunk padding)
    const minCX = Math.floor(camera.x / CHUNK_SIZE) - 1;
    const maxCX = Math.floor((camera.x + viewW) / CHUNK_SIZE) + 1;
    const minCY = Math.floor(camera.y / CHUNK_SIZE) - 1;
    const maxCY = Math.floor((camera.y + viewH) / CHUNK_SIZE) + 1;

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = `${cx},${cy}`;
        let chunk = this.chunks.get(key);

        // Create temporary visual-only chunk data for rendering
        if (!chunk) {
          const biomeId = this._getBiomeForCoords(cx, cy);
          const biome   = BIOME_DEFS[biomeId];
          chunk = {
            cx, cy, biomeId, biome,
            worldX:      cx * CHUNK_SIZE,
            worldY:      cy * CHUNK_SIZE,
            worldRight:  (cx + 1) * CHUNK_SIZE,
            worldBottom: (cy + 1) * CHUNK_SIZE,
          };
        }

        this._drawChunkBg(ctx, chunk, cx, cy);
      }
    }

    // Soft dark edge-fade at the playable world bounds so the padding area
    // beyond the wall reads as an intentional vignette, not a hard cut.
    this._drawWorldEdgeFade(ctx, camera, viewW, viewH);
  }

  /**
   * Darken everything beyond getWorldBounds() with a ~140px gradient ramp at the
   * boundary followed by a flat dark fill. Replaces the old per-chunk step fade.
   * Cheap: at most 4 linear gradients + fills per frame, only when the (padded)
   * viewport actually reaches a boundary. No canvas allocations.
   */
  _drawWorldEdgeFade(ctx, camera, viewW, viewH) {
    const wb   = this.getWorldBounds();
    const FADE = 140;    // gradient depth (px) just outside the boundary
    const MAXA = 0.62;   // final darkness of the out-of-bounds padding area
    // Cover the whole drawn area including the +1 chunk visual padding
    const vx = camera.x - CHUNK_SIZE, vy = camera.y - CHUNK_SIZE;
    const vr = camera.x + viewW + CHUNK_SIZE, vb = camera.y + viewH + CHUNK_SIZE;
    const vh = vb - vy, vw = vr - vx;
    ctx.save();
    if (vr > wb.right) {                                   // RIGHT edge
      const g = ctx.createLinearGradient(wb.right, 0, wb.right + FADE, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${MAXA})`);
      ctx.fillStyle = g;
      ctx.fillRect(wb.right, vy, FADE, vh);
      if (vr > wb.right + FADE) {
        ctx.fillStyle = `rgba(0,0,0,${MAXA})`;
        ctx.fillRect(wb.right + FADE, vy, vr - wb.right - FADE, vh);
      }
    }
    if (vx < wb.left) {                                    // LEFT edge
      const g = ctx.createLinearGradient(wb.left, 0, wb.left - FADE, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${MAXA})`);
      ctx.fillStyle = g;
      ctx.fillRect(wb.left - FADE, vy, FADE, vh);
      if (vx < wb.left - FADE) {
        ctx.fillStyle = `rgba(0,0,0,${MAXA})`;
        ctx.fillRect(vx, vy, wb.left - FADE - vx, vh);
      }
    }
    if (vb > wb.bottom) {                                  // BOTTOM edge
      const g = ctx.createLinearGradient(0, wb.bottom, 0, wb.bottom + FADE);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${MAXA})`);
      ctx.fillStyle = g;
      ctx.fillRect(vx, wb.bottom, vw, FADE);
      if (vb > wb.bottom + FADE) {
        ctx.fillStyle = `rgba(0,0,0,${MAXA})`;
        ctx.fillRect(vx, wb.bottom + FADE, vw, vb - wb.bottom - FADE);
      }
    }
    if (vy < wb.top) {                                     // TOP edge
      const g = ctx.createLinearGradient(0, wb.top, 0, wb.top - FADE);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${MAXA})`);
      ctx.fillStyle = g;
      ctx.fillRect(vx, wb.top - FADE, vw, FADE);
      if (vy < wb.top - FADE) {
        ctx.fillStyle = `rgba(0,0,0,${MAXA})`;
        ctx.fillRect(vx, vy, vw, wb.top - FADE - vy);
      }
    }
    ctx.restore();
  }

  /**
   * Draw a single chunk's background.
   * Priority: biome map image → palette bg color fallback.
   * Adds a subtle dark overlay + grid for gameplay readability.
   */
  _drawChunkBg(ctx, chunk, cx, cy) {
    const pal = chunk.biome.palette;
    const mapMgr = this.game.mapManager;

    // Try to draw the biome map image (1024→2560 scale)
    const img = mapMgr ? mapMgr.getBiomeImage(chunk.biomeId) : null;

    // Integer destination + 1px opaque overlap: kills hairline seams between
    // chunk tiles at fractional view scales (later chunks overwrite the overlap).
    const dx = Math.round(chunk.worldX);
    const dy = Math.round(chunk.worldY);
    if (img) {
      ctx.drawImage(img, dx, dy, CHUNK_SIZE + 1, CHUNK_SIZE + 1);
      // Readability overlay — lighter than before (0.35 flat black made the city mush),
      // and biome-tinted so each district keeps its color identity through the dim.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      ctx.fillRect(dx, dy, CHUNK_SIZE, CHUNK_SIZE);
    } else {
      // Fallback: solid palette background (opaque → safe to overlap 1px)
      ctx.fillStyle = pal.bg;
      ctx.fillRect(dx, dy, CHUNK_SIZE + 1, CHUNK_SIZE + 1);
    }

    // ── BIOME SEAM FEATHERING (Maria's video: 'map inside the map') ──────────
    // Where a neighbouring chunk belongs to a DIFFERENT biome, the two map images
    // used to butt together in a razor-sharp vertical/horizontal cut that read as
    // a rendering bug. Each edge facing a foreign biome now gets a 130px smog
    // gradient (deep at the seam → transparent inward), so districts hand over
    // to each other through a believable transition band instead of a knife edge.
    try {
      const FB = 130;
      const nb = (dx2, dy2) => this._getBiomeForCoords(chunk.cx + dx2, chunk.cy + dy2);
      const mkGrad = (x1, y1, x2, y2) => {
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, 'rgba(4,6,12,0.62)');
        g.addColorStop(0.55, 'rgba(4,6,12,0.28)');
        g.addColorStop(1, 'rgba(4,6,12,0)');
        return g;
      };
      if (nb(1, 0)  !== chunk.biomeId) { ctx.fillStyle = mkGrad(dx + CHUNK_SIZE, 0, dx + CHUNK_SIZE - FB, 0); ctx.fillRect(dx + CHUNK_SIZE - FB, dy, FB, CHUNK_SIZE); }
      if (nb(-1, 0) !== chunk.biomeId) { ctx.fillStyle = mkGrad(dx, 0, dx + FB, 0);                           ctx.fillRect(dx, dy, FB, CHUNK_SIZE); }
      if (nb(0, 1)  !== chunk.biomeId) { ctx.fillStyle = mkGrad(0, dy + CHUNK_SIZE, 0, dy + CHUNK_SIZE - FB); ctx.fillRect(dx, dy + CHUNK_SIZE - FB, CHUNK_SIZE, FB); }
      if (nb(0, -1) !== chunk.biomeId) { ctx.fillStyle = mkGrad(0, dy, 0, dy + FB);                           ctx.fillRect(dx, dy, CHUNK_SIZE, FB); }
    } catch (e) { /* feathering is cosmetic — never break the map */ }

    // Draw biome-specific grid
    this._drawChunkGrid(ctx, chunk, pal);

    // Out-of-bounds darkening is handled by _drawWorldEdgeFade() (smooth gradient
    // at the world bounds) instead of the old per-chunk step fade, which read as
    // a hard vertical/horizontal cut exactly at the playable boundary.
    // No strokeRect — eliminates ugly square biome seams
  }

  /**
   * Draw grid lines inside a chunk based on biome style.
   */
  _drawChunkGrid(ctx, chunk, pal) {
    const gridStyle = chunk.biome.gridStyle || 'neon';
    const x0 = chunk.worldX;
    const y0 = chunk.worldY;
    const spacing = gridStyle === 'neon' ? 80 : gridStyle === 'static' ? 120 : 100;

    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = gridStyle === 'neon' ? 0.25 : 0.15;

    // Interior lines only (start at +spacing, strict < end): lines exactly on
    // chunk borders were drawn by BOTH neighbouring chunks → double-alpha bright
    // seam at every chunk boundary (the thin bright vertical line at world edge).
    ctx.beginPath();
    for (let x = x0 + spacing; x < x0 + CHUNK_SIZE; x += spacing) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + CHUNK_SIZE);
    }
    for (let y = y0 + spacing; y < y0 + CHUNK_SIZE; y += spacing) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + CHUNK_SIZE, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Living-city pass (cinematic map, bounded + deterministic per chunk) ──
    // A) DATA PULSES: bright packets racing along grid lines (2 per chunk, looping).
    // B) CITY LIGHTS: 6 tiny biome-colored window lights blinking at their own tempo.
    // Everything derives from (chunk coords, time) — zero state, zero allocations.
    const tNow = performance.now() / 1000;
    const seed = ((chunk.cx * 73856093) ^ (chunk.cy * 19349663)) >>> 0;
    const prC = (i) => { const v = Math.sin((seed % 1000) * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // A) data pulses — one horizontal, one vertical lane per chunk
    for (let piC = 0; piC < 2; piC++) {
      const lane = 1 + Math.floor(prC(piC) * ((CHUNK_SIZE / spacing) - 1));
      const cyc = (tNow * (0.10 + prC(piC + 4) * 0.08) + prC(piC + 8)) % 1;
      const head = cyc * CHUNK_SIZE;
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (piC === 0) {                                   // horizontal packet
        const yy = y0 + lane * spacing;
        ctx.moveTo(x0 + Math.max(0, head - 34), yy);
        ctx.lineTo(x0 + head, yy);
      } else {                                           // vertical packet
        const xx = x0 + lane * spacing;
        ctx.moveTo(xx, y0 + Math.max(0, head - 34));
        ctx.lineTo(xx, y0 + head);
      }
      ctx.stroke();
      // packet head dot
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (piC === 0) ctx.arc(x0 + head, y0 + lane * spacing, 1.6, 0, Math.PI * 2);
      else           ctx.arc(x0 + lane * spacing, y0 + head, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // B) blinking city lights
    for (let liC = 0; liC < 6; liC++) {
      const lx = x0 + prC(liC + 20) * CHUNK_SIZE;
      const ly = y0 + prC(liC + 30) * CHUNK_SIZE;
      const blink = 0.5 + 0.5 * Math.sin(tNow * (0.7 + prC(liC + 40) * 1.6) + liC * 2.2);
      ctx.globalAlpha = 0.22 * blink;
      ctx.fillStyle = pal.grid;
      ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.10 * blink;
      ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ─── Debug ──────────────────────────────────────────────────────────────
  /**
   * Draw debug overlay showing chunk boundaries, biome names, and types.
   * @param {CanvasRenderingContext2D} ctx
   */
  drawDebug(ctx) {
    ctx.save();
    ctx.font = '14px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const key of this.activeKeys) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;

      const midX = chunk.worldX + CHUNK_SIZE / 2;
      const midY = chunk.worldY + CHUNK_SIZE / 2;

      // Chunk border
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 2;
      ctx.strokeRect(chunk.worldX, chunk.worldY, CHUNK_SIZE, CHUNK_SIZE);

      // Label
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(midX - 80, midY - 22, 160, 44);
      ctx.fillStyle = '#ff0';
      ctx.fillText(`${chunk.cx},${chunk.cy}`, midX, midY - 8);
      ctx.fillStyle = '#0ff';
      ctx.font = '11px Consolas, monospace';
      ctx.fillText(`${chunk.biome.name} | ${chunk.chunkType}`, midX, midY + 10);
      ctx.font = '14px Consolas, monospace';
    }
    ctx.restore();
  }

  /** Log chunk state to console */
  debugDump() {
    console.group('[ChunkManager] Debug');
    console.log('Enabled:', this.enabled);
    console.log('Player chunk:', this.playerChunkX, this.playerChunkY);
    console.log('Active chunks:', this.activeKeys.size);
    console.log('Total cached:', this.chunks.size);
    for (const key of this.activeKeys) {
      const c = this.chunks.get(key);
      if (c) console.log(`  ${key}: ${c.biome.name} (${c.chunkType})`);
    }
    console.groupEnd();
  }
}
