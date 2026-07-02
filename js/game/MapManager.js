// ─── MapManager.js ─────────────────────────────────────────────────────────
// Manages world map, biomes, chunk streaming, and background rendering.
// Phase 0: wraps existing background logic + adds biome system foundation.
// Phase 1: adds chunk streaming (2560×2560 tiles, 3×3 active grid).
// ───────────────────────────────────────────────────────────────────────────

import { Vec2, WORLD_W, WORLD_H, DARK_BG, GRID_LINE } from '../constants.js';

// ─── Biome Definitions ───────────────────────────────────────────────────────
// Each biome defines its visual identity, hazards, enemy modifiers, and colors.
// The map system picks biomes per chunk or per run depending on mode.

export const BIOME_ID = {
  NEON_DISTRICT:   'neon_district',
  DATA_WASTES:     'data_wastes',
  VOID_RIFT:       'void_rift',
  INDUSTRIAL_CORE: 'industrial_core',
  BIOLAB_SECTOR:   'biolab_sector',
  THE_NULL:        'the_null',
};

export const BIOME_DEFS = {
  [BIOME_ID.NEON_DISTRICT]: {
    name: 'Neon District',
    description: 'Glowing city streets with holographic signs and neon rain',
    palette: {
      bg:        '#0a0e1f',
      grid:      '#1a3a5a',
      accent1:   '#00e6ff',   // cyan
      accent2:   '#ff00b4',   // magenta
      ambient:   '#0d1530',
      hazard:    '#ff3750',
    },
    gridStyle: 'neon',          // grid rendering style
    hazards: ['neon_overload', 'hologram_decoy'],
    enemyModifiers: { speedMult: 1.0, hpMult: 1.0 },
    music: 'neon_district',
    fogColor: 'rgba(0, 40, 80, 0.15)',
    particleColors: ['#00e6ff', '#ff00b4', '#9650ff'],
  },

  [BIOME_ID.DATA_WASTES]: {
    name: 'Data Wastes',
    description: 'Corrupted data landscapes with glitch storms and static fields',
    palette: {
      bg:        '#0c0a08',
      grid:      '#2a2010',
      accent1:   '#ff9100',   // orange
      accent2:   '#ffe650',   // yellow
      ambient:   '#1a1408',
      hazard:    '#ff5500',
    },
    gridStyle: 'corrupted',
    hazards: ['data_corruption', 'static_field'],
    enemyModifiers: { speedMult: 0.9, hpMult: 1.2 },
    music: 'data_wastes',
    fogColor: 'rgba(40, 30, 0, 0.20)',
    particleColors: ['#ff9100', '#ffe650', '#ff5500'],
  },

  [BIOME_ID.VOID_RIFT]: {
    name: 'Void Rift Zone',
    description: 'Unstable dimensional tears with gravity anomalies',
    palette: {
      bg:        '#08040f',
      grid:      '#2a1050',
      accent1:   '#9650ff',   // purple
      accent2:   '#ff2d95',   // pink
      ambient:   '#0f0820',
      hazard:    '#c030ff',
    },
    gridStyle: 'rift',
    hazards: ['gravity_well', 'void_tear'],
    enemyModifiers: { speedMult: 1.1, hpMult: 1.1 },
    music: 'void_rift',
    fogColor: 'rgba(30, 0, 60, 0.25)',
    particleColors: ['#9650ff', '#ff2d95', '#c030ff'],
  },

  [BIOME_ID.INDUSTRIAL_CORE]: {
    name: 'Industrial Core',
    description: 'Heavy machinery, conveyor belts, and molten metal hazards',
    palette: {
      bg:        '#0a0808',
      grid:      '#3a2020',
      accent1:   '#ff3750',   // red
      accent2:   '#ff9100',   // orange
      ambient:   '#1a0c0c',
      hazard:    '#ff2200',
    },
    gridStyle: 'industrial',
    hazards: ['conveyor_belt', 'molten_zone'],
    enemyModifiers: { speedMult: 0.85, hpMult: 1.4 },
    music: 'industrial_core',
    fogColor: 'rgba(40, 10, 0, 0.18)',
    particleColors: ['#ff3750', '#ff9100', '#ff6600'],
  },

  [BIOME_ID.BIOLAB_SECTOR]: {
    name: 'Biolab Sector',
    description: 'Overgrown labs with toxic pools and mutant spawning vats',
    palette: {
      bg:        '#040f08',
      grid:      '#0a3a1a',
      accent1:   '#28ff8c',   // green
      accent2:   '#00e6ff',   // cyan
      ambient:   '#081a0c',
      hazard:    '#50ff00',
    },
    gridStyle: 'organic',
    hazards: ['toxic_pool', 'spore_burst'],
    enemyModifiers: { speedMult: 1.05, hpMult: 1.0, regenRate: 0.5 },
    music: 'biolab_sector',
    fogColor: 'rgba(0, 40, 10, 0.20)',
    particleColors: ['#28ff8c', '#00e6ff', '#50ff00'],
  },

  [BIOME_ID.THE_NULL]: {
    name: 'The Null',
    description: 'The final void — reality dissolving, maximum danger',
    palette: {
      bg:        '#020204',
      grid:      '#101020',
      accent1:   '#ffffff',
      accent2:   '#ff2d95',
      ambient:   '#050508',
      hazard:    '#ff0040',
    },
    gridStyle: 'null',
    hazards: ['reality_collapse', 'null_pulse'],
    enemyModifiers: { speedMult: 1.2, hpMult: 1.6 },
    music: 'the_null',
    fogColor: 'rgba(0, 0, 0, 0.35)',
    particleColors: ['#ffffff', '#ff2d95', '#8080ff'],
  },
};

// ─── Chunk Constants ─────────────────────────────────────────────────────────
export const CHUNK_SIZE = 2560;       // pixels per chunk (square)
export const ACTIVE_GRID = 3;         // 3×3 active chunks around player
export const CHUNK_TYPES = ['empty', 'normal', 'dense', 'elite', 'treasure', 'boss'];

// ─── MapManager Class ────────────────────────────────────────────────────────
export class MapManager {
  /**
   * @param {object} opts
   * @param {object} opts.game - reference to Game instance (for camera, player, etc.)
   */
  constructor(opts = {}) {
    this.game = opts.game || null;

    // Current biome (default: Neon District for Act 1)
    this.currentBiomeId = BIOME_ID.NEON_DISTRICT;
    this.currentBiome = BIOME_DEFS[this.currentBiomeId];

    // Chunk system state (Phase 1 — initially disabled, uses legacy fixed map)
    this.chunkStreamingEnabled = false;
    this.chunks = new Map();           // key: "cx,cy" → ChunkData
    this.activeChunks = [];            // currently loaded chunk keys
    this.playerChunk = { cx: 0, cy: 0 };

    // World bounds (legacy: fixed; streaming: infinite with active window)
    this.worldW = WORLD_W;
    this.worldH = WORLD_H;

    // Background images (migrated from Game.js — same loading logic)
    this._bgImage = null;
    this._endlessBgImage = null;
    this._chaosBgImage = null;

    // Procedural background cache (for biomes without image assets)
    this._bgCanvas = null;
    this._bgCtx = null;
    this._bgDirty = true;

    // Biome transition state
    this._transitionProgress = 0;    // 0 = fully in current biome, 1 = fully in next
    this._transitionBiomeId = null;
    this._transitionDuration = 2.0;  // seconds for biome crossfade
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  /**
   * Load background images. Called once from Game constructor.
   * Preserves exact same loading logic as the original Game.js code.
   */
  loadBackgrounds(cacheBust = '') {
    const v = cacheBust ? `?v=${cacheBust}` : '';

    this._bgImage = new Image();
    this._bgImage.onerror = () => {
      const fallback = new Image();
      fallback.src = 'assets/backgrounds/cyberpunk_city_background.png';
      this._bgImage = fallback;
    };
    this._bgImage.src = `assets/backgrounds/cyber_city_bg_clean.png${v}`;

    this._endlessBgImage = new Image();
    this._endlessBgImage.onerror = () =>
      console.warn('[MapManager] missing endless bg — using default');
    this._endlessBgImage.src = `assets/maps/endless/stage_02_neon_shinjuku_plaza.png${v}`;

    this._chaosBgImage = new Image();
    this._chaosBgImage.onerror = () =>
      console.warn('[MapManager] missing chaos bg');
    this._chaosBgImage.src = `assets/ui/CHAOS_mode.png${v}`;
  }

  // ── Biome Management ────────────────────────────────────────────────────────

  /**
   * Set the active biome by ID. Optionally transition smoothly.
   * @param {string} biomeId - one of BIOME_ID values
   * @param {boolean} instant - if true, skip transition
   */
  setBiome(biomeId, instant = false) {
    if (!BIOME_DEFS[biomeId]) {
      console.warn(`[MapManager] Unknown biome: ${biomeId}`);
      return;
    }
    if (biomeId === this.currentBiomeId) return;

    if (instant) {
      this.currentBiomeId = biomeId;
      this.currentBiome = BIOME_DEFS[biomeId];
      this._bgDirty = true;
      this._transitionProgress = 0;
      this._transitionBiomeId = null;
    } else {
      this._transitionBiomeId = biomeId;
      this._transitionProgress = 0;
    }
  }

  /**
   * Get the current biome definition (accounts for transitions).
   */
  getBiome() {
    return this.currentBiome;
  }

  /**
   * Get enemy modifiers for the current biome.
   */
  getEnemyModifiers() {
    return this.currentBiome.enemyModifiers || { speedMult: 1, hpMult: 1 };
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  update(dt) {
    // Biome transition
    if (this._transitionBiomeId) {
      this._transitionProgress += dt / this._transitionDuration;
      if (this._transitionProgress >= 1) {
        this.currentBiomeId = this._transitionBiomeId;
        this.currentBiome = BIOME_DEFS[this._transitionBiomeId];
        this._transitionBiomeId = null;
        this._transitionProgress = 0;
        this._bgDirty = true;
      }
    }

    // Chunk streaming update (Phase 1 — when enabled)
    if (this.chunkStreamingEnabled && this.game?.player) {
      this._updateChunks();
    }
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────

  /**
   * Draw the world background. Drop-in replacement for Game._drawWorldBackground.
   * Phase 0: delegates to legacy image-based rendering.
   * Phase 1: will use chunk-based tile rendering per biome.
   */
  drawWorldBackground(ctx, opts = {}) {
    const { chaosMode, endless, gridBlackoutActive } = opts;

    if (this.chunkStreamingEnabled) {
      this._drawChunkWorld(ctx, opts);
      return;
    }

    // ── Legacy rendering (identical to original Game._drawWorldBackground) ──
    ctx.fillStyle = this.currentBiome.palette.bg;
    ctx.fillRect(0, 0, this.worldW, this.worldH);

    const cb  = this._chaosBgImage;
    const eb  = this._endlessBgImage;
    const img = (chaosMode && cb && cb.complete && cb.naturalWidth > 0)
              ? cb
              : (endless && eb && eb.complete && eb.naturalWidth > 0) ? eb : this._bgImage;

    if (img && img.complete && img.naturalWidth > 0) {
      const scale = this.worldW / img.naturalWidth;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, 0, 0, this.worldW, drawH);

      ctx.fillStyle = gridBlackoutActive ? 'rgba(0,0,0,0.65)'
                    : chaosMode          ? 'rgba(0,0,8,0.28)'
                    : endless            ? 'rgba(0,0,0,0.46)'
                    :                      'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, this.worldW, this.worldH);

      // Chaos grid overlay
      if (chaosMode) {
        const _gs = 80;
        const _gt = performance.now() * 0.0003;
        ctx.save();
        ctx.globalAlpha = 0.05 + 0.02 * Math.sin(_gt);
        ctx.strokeStyle = '#ff2d95';
        ctx.lineWidth   = 0.5;
        for (let _gx = 0; _gx < this.worldW; _gx += _gs) {
          ctx.beginPath(); ctx.moveTo(_gx, 0); ctx.lineTo(_gx, this.worldH); ctx.stroke();
        }
        for (let _gy = 0; _gy < this.worldH; _gy += _gs) {
          ctx.beginPath(); ctx.moveTo(0, _gy); ctx.lineTo(this.worldW, _gy); ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      // Fallback: animated grid
      this._drawProceduralGrid(ctx, this.worldW, this.worldH);
    }
  }

  /**
   * Draw the static background (menu screens). Drop-in for Game._drawBackground.
   */
  drawMenuBackground(ctx, bgImage, width, height, gridBlackoutActive) {
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, width, height);

    const img = bgImage || this._bgImage;
    if (img && img.complete && img.naturalWidth > 0) {
      const scale = width / img.naturalWidth;
      const drawH = img.naturalHeight * scale;
      ctx.drawImage(img, 0, 0, width, drawH);
      ctx.fillStyle = gridBlackoutActive
        ? 'rgba(0,0,0,0.65)'
        : 'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, width, height);
    } else {
      this._drawProceduralGrid(ctx, width, height);
    }
  }

  // ── Procedural Biome Background ─────────────────────────────────────────────

  /**
   * Generate a procedural background based on the current biome.
   * Used when no image asset exists for a biome, or for chunk tiles.
   */
  drawBiomeBackground(ctx, biomeId, x, y, w, h) {
    const biome = BIOME_DEFS[biomeId] || this.currentBiome;
    const p = biome.palette;

    // Base fill
    ctx.fillStyle = p.bg;
    ctx.fillRect(x, y, w, h);

    // Biome-specific grid style
    switch (biome.gridStyle) {
      case 'neon':       this._drawNeonGrid(ctx, x, y, w, h, p); break;
      case 'corrupted':  this._drawCorruptedGrid(ctx, x, y, w, h, p); break;
      case 'rift':       this._drawRiftGrid(ctx, x, y, w, h, p); break;
      case 'industrial': this._drawIndustrialGrid(ctx, x, y, w, h, p); break;
      case 'organic':    this._drawOrganicGrid(ctx, x, y, w, h, p); break;
      case 'null':       this._drawNullGrid(ctx, x, y, w, h, p); break;
      default:           this._drawProceduralGrid(ctx, w, h); break;
    }

    // Fog overlay
    if (biome.fogColor) {
      ctx.fillStyle = biome.fogColor;
      ctx.fillRect(x, y, w, h);
    }
  }

  // ── Grid Styles per Biome ──────────────────────────────────────────────────

  _drawNeonGrid(ctx, x, y, w, h, p) {
    const spacing = 48;
    const t = performance.now() * 0.0002;
    ctx.save();
    ctx.globalAlpha = 0.12 + 0.04 * Math.sin(t);
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += spacing) {
      ctx.beginPath(); ctx.moveTo(x + gx, y); ctx.lineTo(x + gx, y + h); ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += spacing) {
      ctx.beginPath(); ctx.moveTo(x, y + gy); ctx.lineTo(x + w, y + gy); ctx.stroke();
    }
    // Accent glow lines (horizontal, sparse)
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = p.accent1;
    ctx.lineWidth = 2;
    for (let gy = spacing * 3; gy < h; gy += spacing * 6) {
      ctx.beginPath(); ctx.moveTo(x, y + gy); ctx.lineTo(x + w, y + gy); ctx.stroke();
    }
    ctx.restore();
  }

  _drawCorruptedGrid(ctx, x, y, w, h, p) {
    const spacing = 52;
    const t = performance.now() * 0.001;
    ctx.save();
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.10;
    // Glitchy offset lines
    for (let gx = 0; gx < w; gx += spacing) {
      const offset = Math.sin(gx * 0.01 + t) * 6;
      ctx.beginPath(); ctx.moveTo(x + gx + offset, y); ctx.lineTo(x + gx - offset, y + h); ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += spacing) {
      const offset = Math.cos(gy * 0.01 + t * 1.3) * 4;
      ctx.beginPath(); ctx.moveTo(x, y + gy + offset); ctx.lineTo(x + w, y + gy - offset); ctx.stroke();
    }
    // Random static blocks
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = p.accent1;
    const seed = Math.floor(t * 2) % 1000;
    for (let i = 0; i < 8; i++) {
      const bx = ((seed * (i + 1) * 137) % w);
      const by = ((seed * (i + 1) * 251) % h);
      ctx.fillRect(x + bx, y + by, 30 + (i * 7) % 40, 3);
    }
    ctx.restore();
  }

  _drawRiftGrid(ctx, x, y, w, h, p) {
    const t = performance.now() * 0.0004;
    ctx.save();
    // Warped concentric circles
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.08;
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let r = 40; r < Math.max(w, h); r += 60) {
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const warp = Math.sin(a * 3 + t) * 15 + Math.cos(a * 5 - t * 0.7) * 10;
        const px = cx + Math.cos(a) * (r + warp);
        const py = cy + Math.sin(a) * (r + warp);
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // Void tear streaks
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = p.accent1;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + t * 0.2;
      const len = 80 + i * 30;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawIndustrialGrid(ctx, x, y, w, h, p) {
    const spacing = 64;
    ctx.save();
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.10;
    // Heavy rectangular grid
    for (let gx = 0; gx < w; gx += spacing) {
      ctx.beginPath(); ctx.moveTo(x + gx, y); ctx.lineTo(x + gx, y + h); ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += spacing) {
      ctx.beginPath(); ctx.moveTo(x, y + gy); ctx.lineTo(x + w, y + gy); ctx.stroke();
    }
    // Rivets at intersections
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = p.accent2;
    for (let gx = 0; gx < w; gx += spacing) {
      for (let gy = 0; gy < h; gy += spacing) {
        ctx.beginPath();
        ctx.arc(x + gx, y + gy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Warning stripes (diagonal hash)
    ctx.globalAlpha = 0.03;
    ctx.strokeStyle = p.hazard;
    ctx.lineWidth = 8;
    for (let d = -h; d < w + h; d += 120) {
      ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); ctx.stroke();
    }
    ctx.restore();
  }

  _drawOrganicGrid(ctx, x, y, w, h, p) {
    const t = performance.now() * 0.0003;
    ctx.save();
    // Cellular/organic shapes
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.08;
    // Pseudo-random cell centers (seeded by position)
    const cells = [];
    for (let i = 0; i < 20; i++) {
      cells.push({
        x: x + (((i * 137 + 42) * 73) % w),
        y: y + (((i * 251 + 17) * 53) % h),
        r: 40 + (i * 31) % 60,
      });
    }
    for (const c of cells) {
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.1) {
        const wobble = Math.sin(a * 4 + t + c.r * 0.01) * 8;
        const px = c.x + Math.cos(a) * (c.r + wobble);
        const py = c.y + Math.sin(a) * (c.r + wobble);
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // Toxic drip lines
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = p.accent1;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      const lx = x + ((i * 197 + 33) % w);
      const ly = y + ((i * 89 + 12) % (h * 0.3));
      const len = 30 + (i * 41) % 80;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + Math.sin(t + i) * 5, ly + len); ctx.stroke();
    }
    ctx.restore();
  }

  _drawNullGrid(ctx, x, y, w, h, p) {
    const t = performance.now() * 0.0005;
    ctx.save();
    // Barely visible flickering grid — reality breaking down
    ctx.globalAlpha = 0.03 + 0.02 * Math.sin(t * 3);
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 0.5;
    const spacing = 40;
    for (let gx = 0; gx < w; gx += spacing) {
      // Some lines randomly disappear
      if (Math.sin(gx * 0.1 + t * 2) > 0.3) {
        ctx.beginPath(); ctx.moveTo(x + gx, y); ctx.lineTo(x + gx, y + h); ctx.stroke();
      }
    }
    for (let gy = 0; gy < h; gy += spacing) {
      if (Math.cos(gy * 0.1 + t * 1.7) > 0.3) {
        ctx.beginPath(); ctx.moveTo(x, y + gy); ctx.lineTo(x + w, y + gy); ctx.stroke();
      }
    }
    // White noise pixels
    ctx.globalAlpha = 0.02;
    ctx.fillStyle = '#ffffff';
    const seed = Math.floor(t * 8) % 500;
    for (let i = 0; i < 30; i++) {
      const px = (seed * (i + 1) * 137) % w;
      const py = (seed * (i + 1) * 251) % h;
      ctx.fillRect(x + px, y + py, 2, 2);
    }
    ctx.restore();
  }

  _drawProceduralGrid(ctx, w, h) {
    const spacing = 48;
    const offset = Math.floor(performance.now() * 0.025) % spacing;
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    for (let x = -spacing; x < w + spacing; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x + offset, 0); ctx.lineTo(x + offset, h); ctx.stroke();
    }
    for (let y = 0; y < h + spacing; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  // ── Chunk Streaming (Phase 1 — placeholder, will be implemented next) ──────

  _updateChunks() {
    // TODO Phase 1: calculate player chunk position, load/unload chunks
    // For now, no-op — legacy fixed map is used
  }

  _drawChunkWorld(ctx, opts) {
    // TODO Phase 1: render active chunks with biome backgrounds
    // For now, fall through to legacy
    this.drawWorldBackground(ctx, { ...opts });
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  /**
   * Clamp a position to world bounds (legacy mode).
   */
  clampToWorld(pos, margin = 0) {
    pos.x = Math.max(margin, Math.min(this.worldW - margin, pos.x));
    pos.y = Math.max(margin, Math.min(this.worldH - margin, pos.y));
    return pos;
  }

  /**
   * Get a random position within world bounds.
   */
  randomWorldPos(margin = 40) {
    return new Vec2(
      margin + Math.random() * (this.worldW - margin * 2),
      margin + Math.random() * (this.worldH - margin * 2),
    );
  }

  /**
   * Check if a position is within the active world area.
   */
  isInBounds(pos, margin = 0) {
    return pos.x >= -margin && pos.x <= this.worldW + margin
        && pos.y >= -margin && pos.y <= this.worldH + margin;
  }
}
