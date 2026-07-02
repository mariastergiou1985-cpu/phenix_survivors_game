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
import { BIOME_ID, BIOME_DEFS, CHUNK_SIZE, ACTIVE_GRID } from './MapManager.js?v=20260703300000';

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
    // Neon District stays center-only (dist <= 2), not in this ring
    this._biomeRing = [
      BIOME_ID.INDUSTRIAL_CORE,
      BIOME_ID.ORBITAL_NEXUS,
      BIOME_ID.ABYSSAL_TRENCH,
      BIOME_ID.GLACIAL_EXPANSE,
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
   * Uses distance-based rings from the origin:
   *   • Ring 0 (distance 0-2): Neon District (starting area)
   *   • Ring 1+ : rotate through biome ring based on angle from origin
   * The Null is never procedurally assigned — it's a special unlock.
   * @param {number} cx
   * @param {number} cy
   * @returns {string} BIOME_ID
   */
  _getBiomeForCoords(cx, cy) {
    const dist = Math.max(Math.abs(cx), Math.abs(cy));

    // Starting area: always Neon District (3×3 chunks)
    if (dist <= 1) return BIOME_ID.NEON_DISTRICT;

    // Use angle from origin to pick biome sector
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
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: // top
        return { x: camera.x + Math.random() * viewW, y: camera.y - margin };
      case 1: // bottom
        return { x: camera.x + Math.random() * viewW, y: camera.y + viewH + margin };
      case 2: // left
        return { x: camera.x - margin, y: camera.y + Math.random() * viewH };
      default: // right
        return { x: camera.x + viewW + margin, y: camera.y + Math.random() * viewH };
    }
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
      y: b.y + margin + Math.random() * (b.w - margin * 2),
    };
  }

  // ─── Rendering Helpers ──────────────────────────────────────────────────
  /**
   * Draw all active chunk backgrounds.
   * Called by MapManager when chunk streaming is enabled.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} camera - { x, y }
   * @param {number} viewW
   * @param {number} viewH
   */
  drawChunkBackgrounds(ctx, camera, viewW, viewH) {
    for (const key of this.activeKeys) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;

      // Skip chunks fully outside viewport (frustum cull)
      if (chunk.worldRight < camera.x || chunk.worldX > camera.x + viewW) continue;
      if (chunk.worldBottom < camera.y || chunk.worldY > camera.y + viewH) continue;

      this._drawChunkBg(ctx, chunk);
    }
  }

  /**
   * Draw a single chunk's background.
   * Priority: biome map image → palette bg color fallback.
   * Adds a subtle dark overlay + grid for gameplay readability.
   */
  _drawChunkBg(ctx, chunk) {
    const pal = chunk.biome.palette;
    const mapMgr = this.game.mapManager;

    // Try to draw the biome map image (1024→2560 scale)
    const img = mapMgr ? mapMgr.getBiomeImage(chunk.biomeId) : null;

    if (img) {
      // Draw scaled biome image to fill the chunk
      ctx.drawImage(img, chunk.worldX, chunk.worldY, CHUNK_SIZE, CHUNK_SIZE);

      // Dark overlay for gameplay readability (keeps enemies/items visible)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(chunk.worldX, chunk.worldY, CHUNK_SIZE, CHUNK_SIZE);
    } else {
      // Fallback: solid palette background
      ctx.fillStyle = pal.bg;
      ctx.fillRect(chunk.worldX, chunk.worldY, CHUNK_SIZE, CHUNK_SIZE);
    }

    // Draw biome-specific grid (over both image and fallback)
    this._drawChunkGrid(ctx, chunk, pal);

    // Chunk border (subtle visual separation)
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.15;
    ctx.strokeRect(chunk.worldX, chunk.worldY, CHUNK_SIZE, CHUNK_SIZE);
    ctx.globalAlpha = 1;
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

    ctx.beginPath();
    for (let x = x0; x <= x0 + CHUNK_SIZE; x += spacing) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + CHUNK_SIZE);
    }
    for (let y = y0; y <= y0 + CHUNK_SIZE; y += spacing) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + CHUNK_SIZE, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
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
