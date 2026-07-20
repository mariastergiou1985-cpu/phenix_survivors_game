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
  INDUSTRIAL_CORE: 'industrial_core',
  ORBITAL_NEXUS:   'orbital_nexus',
  ABYSSAL_TRENCH:  'abyssal_trench',
  GLACIAL_EXPANSE: 'glacial_expanse',
  DATA_WASTES:     'data_wastes',
  THE_NULL:        'the_null',       // special endgame biome — not in ring
};

export const BIOME_DEFS = {
  // ── 1. Neon District — center biome, magenta/cyan cyber metropolis ──────
  [BIOME_ID.NEON_DISTRICT]: {
    name: 'Neon District',
    description: 'Electric cyber metropolis — neon rain, holograms, dense city-tech',
    mapImage: 'assets/maps/biomes/neon-district-map.jpg',
    palette: {
      bg:        '#0a0e1f',
      grid:      '#1a2a5a',
      accent1:   '#00e6ff',   // cyan
      accent2:   '#ff00b4',   // magenta
      ambient:   '#0d1530',
      hazard:    '#ff3750',
    },
    gridStyle: 'neon',
    hazards: ['grid_blackout', 'signal_hijack', 'adstorm_riot', 'overcharge_riot'],
    enemyModifiers: { speedMult: 1.0, hpMult: 1.0 },
    music: 'neon_district',
    fogColor: 'rgba(10, 0, 40, 0.15)',
    particleColors: ['#00e6ff', '#ff00b4', '#9650ff'],
  },

  // ── 2. Industrial Core — furnace hell, orange/black ember, molten channels ─
  [BIOME_ID.INDUSTRIAL_CORE]: {
    name: 'Industrial Core',
    description: 'Furnace megafactory — molten channels, smoke stacks, heavy machine',
    mapImage: 'assets/maps/biomes/industrial-core-map.jpg',
    palette: {
      bg:        '#0a0604',
      grid:      '#3a1a08',
      accent1:   '#ff6a00',   // orange ember
      accent2:   '#ffb830',   // molten gold
      ambient:   '#1a0a04',
      hazard:    '#ff2200',
    },
    gridStyle: 'industrial',
    hazards: ['furnace_overload', 'molten_rupture', 'steam_hammer_surge', 'scrapfall_collapse'],
    enemyModifiers: { speedMult: 0.85, hpMult: 1.4 },
    music: 'industrial_core',
    fogColor: 'rgba(40, 15, 0, 0.20)',
    particleColors: ['#ff6a00', '#ffb830', '#ff2200'],
  },

  // ── 3. Orbital Nexus — blue/white starlight, orbital cyber station ─────
  [BIOME_ID.ORBITAL_NEXUS]: {
    name: 'Orbital Nexus',
    description: 'High-orbit cyber station — starfield void, advanced energy relays',
    mapImage: 'assets/maps/biomes/orbital-nexus-map.jpg',
    palette: {
      bg:        '#020610',
      grid:      '#0a1a40',
      accent1:   '#3a8aff',   // station blue
      accent2:   '#80d0ff',   // starlight
      ambient:   '#040a18',
      hazard:    '#60a0ff',
    },
    gridStyle: 'neon',
    hazards: ['solar_flare_surge', 'hull_breach_cascade', 'satellite_debris_storm', 'reactor_sync_failure'],
    enemyModifiers: { speedMult: 1.1, hpMult: 1.1 },
    music: 'orbital_nexus',
    fogColor: 'rgba(0, 10, 40, 0.18)',
    particleColors: ['#3a8aff', '#80d0ff', '#ffffff'],
  },

  // ── 4. Abyssal Trench — deep blue/cyan/aqua, underwater cyber civilization ─
  [BIOME_ID.ABYSSAL_TRENCH]: {
    name: 'Abyssal Trench',
    description: 'Underwater cyber civilization — domes, bioluminescence, trench darkness',
    mapImage: 'assets/maps/biomes/abyssal-trench-map.jpg',
    palette: {
      bg:        '#020a14',
      grid:      '#0a2038',
      accent1:   '#00d4c8',   // aqua
      accent2:   '#30a0ff',   // deep cyan
      ambient:   '#041018',
      hazard:    '#00ffb0',
    },
    gridStyle: 'organic',
    hazards: ['pressure_crush', 'bio_lum_bloom', 'leviathan_wake', 'dome_fracture_emergency'],
    enemyModifiers: { speedMult: 0.9, hpMult: 1.2, regenRate: 0.5 },
    music: 'abyssal_trench',
    fogColor: 'rgba(0, 20, 40, 0.25)',
    particleColors: ['#00d4c8', '#30a0ff', '#a060ff'],
  },

  // ── 5. Glacial Expanse — ice blue/white/steel, frozen cryo frontier ────
  [BIOME_ID.GLACIAL_EXPANSE]: {
    name: 'Glacial Expanse',
    description: 'Frozen techno-frontier — ice formations, cryo machinery, blizzard',
    mapImage: 'assets/maps/biomes/glacial-expanse-map.jpg',
    palette: {
      bg:        '#080e14',
      grid:      '#1a2a3a',
      accent1:   '#70c8ff',   // ice blue
      accent2:   '#c0e8ff',   // frost white
      ambient:   '#0c1420',
      hazard:    '#40a0d0',
    },
    gridStyle: 'neon',
    hazards: ['whiteout_protocol', 'ice_growth_surge', 'cryoquakes', 'frozen_core_venting'],
    enemyModifiers: { speedMult: 0.8, hpMult: 1.3 },
    music: 'glacial_expanse',
    fogColor: 'rgba(20, 30, 50, 0.22)',
    particleColors: ['#70c8ff', '#c0e8ff', '#ffffff'],
  },

  // ── 6. Data Wastes — ashen gray/cyan/teal, corrupted dead wasteland ────
  [BIOME_ID.DATA_WASTES]: {
    name: 'Data Wastes',
    description: 'Corrupted dead techno-wasteland — data residue, ghost-energy ruins',
    mapImage: 'assets/maps/biomes/data-wastes-map.jpg',
    palette: {
      bg:        '#0a0c0a',
      grid:      '#1a2a20',
      accent1:   '#30c8a0',   // teal
      accent2:   '#80ffcc',   // bright cyan-green
      ambient:   '#0c100c',
      hazard:    '#20d0a0',
    },
    gridStyle: 'corrupted',
    hazards: ['data_storm', 'reality_decay', 'scrap_surge', 'null_seepage'],
    enemyModifiers: { speedMult: 0.9, hpMult: 1.2 },
    music: 'data_wastes',
    fogColor: 'rgba(10, 20, 15, 0.22)',
    particleColors: ['#30c8a0', '#80ffcc', '#40ffff'],
  },

  // ── 7. The Null — special endgame biome, not in biome ring ─────────────
  [BIOME_ID.THE_NULL]: {
    name: 'The Null',
    description: 'The final void — reality dissolving, maximum danger',
    mapImage: null,            // procedural only
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
export const CHUNK_SIZE = 1280;       // pixels per chunk — halved from 2560 for tighter world
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

    // ── CYBER MEGACITY deck (Maria brief 2026-07-18, Phase 11 — Endless map) ──
    // Maria's approved concept, drawn in WORLD SPACE at a fixed integer upscale and
    // mirror-tiled in both axes so edges always match: no seams, no visible image
    // ends, no stretch, and the gameplay zoom is never touched.
    this._cityImg = new Image();
    this._cityImg.onerror = () => console.warn('[Map] cyber_megacity map missing — endless keeps the chunk world');
    this._cityImg.src = 'assets/maps/new_endless/cyber_megacity.png';
    this.CITY_SCALE = 3;   // 1672×519 → 5016×1557 world px per tile (integer — no distortion)
    // ── WALKABLE deck bands (video-grounded pass 2026-07-19) ──────────────────
    // Μετρημένα με row-luminance/saturation profiling πάνω στα assets (όχι εκτίμηση):
    // CITY (519 rows): 0-130 σκyline/νέον (sat>80) → background· 210-415 καθαρή plaza
    //   (sat≈50, φωτεινό δάπεδο)· 420+ κάγκελα/κάτω δομές → background.
    // CHAOS (440 rows): 0-120 window band με πλανήτες (sat 96-112) → background·
    //   135-410 ανοιχτό deck floor (sat≈30)· 415+ κάτω τοίχος → background.
    // Ο παίκτης/enemies/pickups περιορίζονται σε αυτές τις ζώνες — ποτέ πάνω σε
    // προσόψεις, σωλήνες, ταράτσες ή παράθυρα. Οριζόντια: άπειρη συνέχεια (mirror tiling).
    this.CITY_WALK_ROWS  = [210, 415];
    this.CHAOS_WALK_ROWS = [135, 410];
    // ── AUTHORED OBSTACLE COLUMNS (Maria video QA 2026-07-19) ─────────────────
    // The row bands above keep entities off the skyline and the lower structures, but the
    // video proved a horizontal band alone is not enough: inside the walkable rows the art
    // still contains solid pillars, kiosks and cable towers, and the player walked through
    // them. These are authored NO-GO columns expressed in SOURCE-IMAGE x (same space as
    // the row bands), repeated with the tile, plus the row range they actually block.
    // Kept deliberately coarse — a handful of rectangles is maintainable and provably
    // correct, where a per-pixel mask of a painterly asset is neither.
    this.CITY_BLOCK_COLS  = [ [180, 250, 210, 300], [700, 780, 210, 330], [1240, 1320, 210, 300] ];
    this.CHAOS_BLOCK_COLS = [ [300, 372, 135, 250], [980, 1060, 135, 265] ];
    // Maria 2026-07-19 VIDEO-GROUNDED CORRECTION: το gameplay video («chaos mode map is
    // shit.mp4») απέδειξε ότι το chaos_mode_only_new_map.png είναι το multi-biome patchwork
    // (πάγος/έρημος/industrial/void με perspective γέφυρες) — FAIL. Το σωστό εγκεκριμένο
    // asset είναι το «new chaos map.png» (1672×440 top-down station deck, ίδιο pixel-art
    // style/πλάτος με το megacity), αντιγραμμένο στο canonical path chaos_map.png.
    // Ένα και μόνο active Chaos path — το παλιό patchwork δεν φορτώνεται πουθενά.
    this._chaosDeckImg = new Image();
    this._chaosDeckImg.onerror = () => console.warn('[Map] chaos map missing — chaos keeps the chunk world');
    this._chaosDeckImg.src = 'assets/maps/chaos_mode_map/chaos_map.png';
    // ACT 1 — SPACESHIP DECK (Maria's approved asset: assets/maps/act1_spaceship/spaceship.png,
    // 1916×821 — a full station deck floating in space). Width-fit into the fixed 3000×1688
    // world (uniform scale ≈1.566, painterly art → smoothing stays ON, no distortion), space
    // fill above/below. The WALKABLE deck band is published to the game as _act1DeckBounds so
    // player/spawns/pickups never sit on the windows, planets or structural frames.
    this._shipImg = new Image();
    this._shipImg.onerror = () => console.warn('[Map] act1 spaceship.png missing — Act 1 keeps the legacy map');
    this._shipImg.src = 'assets/maps/act1_spaceship/spaceship.png';

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
    // Mobile: the full-res PNG backgrounds are 2.3–5.3 MB each and frequently fail to decode
    // on phones (low memory) → the game fell back to the bare grid ("maps disappeared"). Load
    // the light ~300 KB JPG variants on touch devices so the maps actually render. Desktop = PNG.
    const IS_MOBILE = (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const M = (png) => IS_MOBILE ? png.replace(/\.png$/, '.jpg') : png;

    this._bgImage = new Image();
    this._bgImage.onerror = () => {
      const fallback = new Image();
      fallback.src = M('assets/backgrounds/cyberpunk_city_background.png');
      this._bgImage = fallback;
    };
    this._bgImage.src = `${M('assets/backgrounds/cyber_city_bg_clean.png')}${v}`;

    this._endlessBgImage = new Image();
    this._endlessBgImage.onerror = () =>
      console.warn('[MapManager] missing endless bg — using default');
    this._endlessBgImage.src = `${M('assets/maps/endless/stage_02_neon_shinjuku_plaza.png')}${v}`;

    this._chaosBgImage = new Image();
    this._chaosBgImage.onerror = () => {
      console.warn('[MapManager] missing chaos bg — falling back to CHAOS_mode.png');
      this._chaosBgImage.src = `assets/ui/CHAOS_mode.png${v}`;   // safe fallback
    };
    // Maria's dedicated Chaos Mode map (video-grounded pass 2026-07-19: single canonical
    // path chaos_map.png — the multi-biome patchwork is no longer referenced anywhere).
    this._chaosBgImage.src = `${M('assets/maps/chaos_mode_map/chaos_map.png')}${v}`;

    // ── Biome map images (for chunk streaming) ───────────────────────────
    this.biomeImages = {};   // { biomeId: Image }
    for (const [id, def] of Object.entries(BIOME_DEFS)) {
      if (!def.mapImage) continue;           // THE_NULL has no map image
      const img = new Image();
      img.onerror = () =>
        console.warn(`[MapManager] biome image failed: ${def.mapImage}`);
      img.src = `${def.mapImage}${v}`;
      this.biomeImages[id] = img;
    }
  }

  /**
   * Get a preloaded biome map image (or null if not loaded / not available).
   * @param {string} biomeId
   * @returns {HTMLImageElement|null}
   */
  getBiomeImage(biomeId) {
    const img = this.biomeImages?.[biomeId];
    if (!img || !img.complete || img.naturalWidth === 0) return null;
    return img;
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
   * ACT 1 — INTERIOR SPACESHIP world (fixed 3000×1688 arena, fixed zoom, no tiling
   * needed horizontally: the ×2 strip is 3344px wide and covers the world with a small
   * right-edge crop of the outer frame only). Vertically centred; neutral deck-floor
   * bands (quiet rows 302-338 of the concept) fill above/below — nothing mirrored,
   * nothing stretched, no visible image edge inside the playfield.
   */
  // WALKABLE deck band of the Act 1 spaceship (measured on spaceship.png: the clean deck
  // floor spans x 130..1790, y 185..700 of the 1916×821 asset). Computed lazily the moment
  // the image is ready — player/spawn/pickup clamps read this every frame.

  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL WALKABILITY API
  // One authority for "can a gameplay entity stand here". Player, enemies, bosses,
  // Nexus, Grid Cache, Vault, XP and pickups all route through this; no system may
  // keep its own bounds. Coordinates are WORLD pixels; the conversion to source-image
  // rows/columns (and the mirror tiling) happens here.
  // ═══════════════════════════════════════════════════════════════════════════

  /** @returns {{rows:number[], blocks:number[][], scale:number, tileW:number}|null} */
  _walkModel(mode) {
    const chaos = mode === 'chaos';
    const img   = chaos ? this._chaosDeckImg : this._cityImg;
    if (!img || !img.complete || !img.naturalWidth) return null;
    return {
      rows:   chaos ? this.CHAOS_WALK_ROWS  : this.CITY_WALK_ROWS,
      blocks: chaos ? this.CHAOS_BLOCK_COLS : this.CITY_BLOCK_COLS,
      scale:  this.CITY_SCALE,
      tileW:  img.naturalWidth,
    };
  }

  /** True when this exact world point sits on real, unobstructed floor. */
  isWalkablePoint(x, y, mode = 'endless') {
    const m = this._walkModel(mode);
    if (!m) return true;                       // no art loaded yet — never block gameplay
    const srcY = y / m.scale;
    if (srcY < m.rows[0] || srcY > m.rows[1]) return false;      // skyline / lower structures
    // Mirror tiling: period is 2 tiles, the second mirrored. Fold world x into source x.
    const period = m.tileW * 2;
    let t = ((x / m.scale) % period + period) % period;
    const srcX = (t < m.tileW) ? t : (period - t);
    for (const [x0, x1, y0, y1] of m.blocks) {
      if (srcX >= x0 && srcX <= x1 && srcY >= y0 && srcY <= y1) return false;
    }
    return true;
  }

  /** True when the whole circular footprint is on floor, not just the centre. */
  isWalkableFootprint(x, y, radius = 0, mode = 'endless') {
    if (!this.isWalkablePoint(x, y, mode)) return false;
    if (radius <= 0) return true;
    const r = radius;
    return this.isWalkablePoint(x - r, y, mode) && this.isWalkablePoint(x + r, y, mode)
        && this.isWalkablePoint(x, y - r, mode) && this.isWalkablePoint(x, y + r, mode);
  }

  /**
   * Nearest legal placement for a footprint. Bounded spiral search — never an infinite
   * retry loop; if nothing is found it returns the band's centre line at this x, which
   * is always inside the walkable rows, so an object can never be dropped into the void.
   */
  findNearestWalkablePoint(x, y, radius = 0, mode = 'endless') {
    if (this.isWalkableFootprint(x, y, radius, mode)) return { x, y };
    const m = this._walkModel(mode);
    if (!m) return { x, y };
    const STEP = 24, MAX_RINGS = 40;                    // ≤ 960px out, hard bound
    for (let ring = 1; ring <= MAX_RINGS; ring++) {
      const d = ring * STEP;
      for (let a = 0; a < 12; a++) {
        const th = (a / 12) * Math.PI * 2;
        const nx = x + Math.cos(th) * d, ny = y + Math.sin(th) * d;
        if (this.isWalkableFootprint(nx, ny, radius, mode)) return { x: nx, y: ny };
      }
    }
    const midY = (m.rows[0] + m.rows[1]) * 0.5 * m.scale;   // deterministic in-band fallback
    return { x, y: midY };
  }

  /**
   * Safe spawn honouring a keep-away list, so objects do not pile onto the player or
   * onto each other. Deterministic order, bounded attempts.
   */
  findSafeSpawnPoint({ x, y, radius = 0, mode = 'endless', avoid = [], minDist = 0 } = {}) {
    const ok = (px, py) => {
      if (!this.isWalkableFootprint(px, py, radius, mode)) return false;
      for (const a of avoid) {
        if (!a) continue;
        const ax = a.x ?? a.pos?.x, ay = a.y ?? a.pos?.y;
        if (ax == null || ay == null) continue;
        if (Math.hypot(px - ax, py - ay) < minDist) return false;   // too close to keep-away
      }
      return true;
    };
    if (ok(x, y)) return { x, y };
    const m = this._walkModel(mode);
    const STEP = 40, MAX_RINGS = 24;
    for (let ring = 1; ring <= MAX_RINGS; ring++) {
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * Math.PI * 2, d = ring * STEP;
        const nx = x + Math.cos(th) * d, ny = y + Math.sin(th) * d;
        if (ok(nx, ny)) return { x: nx, y: ny };
      }
    }
    return this.findNearestWalkablePoint(x, y, radius, mode);   // never the void
  }

  getAct1DeckBounds() {
    if (this._act1BoundsCache) return this._act1BoundsCache;
    const img = this._shipImg;
    if (!img || !img.complete || !img.naturalWidth) return null;
    const S  = this.worldW / img.naturalWidth;
    const y0 = Math.round((this.worldH - img.naturalHeight * S) / 2);
    this._act1BoundsCache = {
      x0: Math.round(130 * S), x1: Math.round(1790 * S),
      y0: y0 + Math.round(185 * S), y1: y0 + Math.round(700 * S),
    };
    return this._act1BoundsCache;
  }

  _drawShipWorld(ctx, opts = {}) {
    const img = this._shipImg;
    const iw = img.naturalWidth, ih = img.naturalHeight;      // 1916 × 821
    const S  = this.worldW / iw;                              // width-fit ≈ 1.566 (uniform — no stretch)
    const th = Math.round(ih * S);                            // ≈ 1285
    const y0 = Math.round((this.worldH - th) / 2);            // ≈ 201
    // space fill above/below the station (matches the art's own starfield edges)
    ctx.fillStyle = '#0a0d26';
    ctx.fillRect(0, 0, this.worldW, this.worldH);
    ctx.drawImage(img, 0, 0, iw, ih, 0, y0, this.worldW, th); // painterly art — smoothing stays on
    // walkable band published via getAct1DeckBounds() (lazy — see below)
    // readability dim (ship art is BRIGHT — combat must sit on top)
    ctx.fillStyle = opts.gridBlackoutActive ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 0, this.worldW, this.worldH);
  }

  /**
   * CYBER MEGACITY world deck (Maria brief 2026-07-18, Phase 11 — Endless).
   * The approved concept strip is drawn in WORLD coordinates under the existing camera
   * transform (fixed zoom — the map scrolls under the player, survivor-style).
   * Mirror-tiling on BOTH axes: tile (i,j) flips horizontally when i is odd and
   * vertically when j is odd, so every edge meets its own mirror — mathematically
   * seamless, no visible image border in any direction, zero stretch, integer upscale
   * with pixelated rendering (uniform pixel-density policy). Only visible tiles draw.
   */
  _drawCityWorld(ctx, opts = {}, img = this._cityImg) {
    const S   = this.CITY_SCALE;
    const tw  = img.naturalWidth  * S;
    const th  = img.naturalHeight * S;
    const g   = this.game;
    const p   = g?.player; if (!p) return;
    const vs  = g._viewScale || 1;
    const vw  = 1280 / vs, vh = 720 / vs;                 // visible world rect (fixed zoom)
    const M   = 96;                                        // preload margin — no popping
    const xA  = p.pos.x - vw / 2 - M, xB = p.pos.x + vw / 2 + M;
    const yA  = p.pos.y - vh / 2 - M, yB = p.pos.y + vh / 2 + M;

    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;                     // crisp pixels, uniform policy
    // Vertical mirror-tiling REJECTED in rendered QA (Maria's rule: no upside-down
    // buildings/holograms). Row j=0 carries the full concept strip (X mirror-tiling only —
    // edges meet their own mirror, zero seams). Rows above/below extend with a NEUTRAL
    // deck-floor band sliced from the same asset (plaza pavement, no landmarks), tiled
    // upright — believable vertical continuation, nothing inverted, zero stretch.
    // Measured: rows 450-490 are the flattest pavement in the concept (lowest pixel
    // variance across the strip) — a repeating band there reads as continuous deck,
    // with no helipads/props to betray the repetition.
    const bandSy = 450;
    const bandSh = 40;
    const bandTh = bandSh * S;
    for (let i = Math.floor(xA / tw); i * tw < xB; i++) {
      const fx = ((i % 2) + 2) % 2 === 1;
      // main strip row (j = 0)
      if (yA < th && yB > 0) {
        ctx.save();
        ctx.translate(i * tw + (fx ? tw : 0), 0);
        ctx.scale(fx ? -1 : 1, 1);
        ctx.drawImage(img, 0, 0, tw, th);
        ctx.restore();
      }
      // neutral deck bands above (y < 0) and below (y >= th)
      for (let by = Math.floor(yA / bandTh) * bandTh; by < yB; by += bandTh) {
        if (by + bandTh > 0 && by < th) continue;          // main strip owns this range
        ctx.save();
        ctx.translate(i * tw + (fx ? tw : 0), by);
        ctx.scale(fx ? -1 : 1, 1);
        ctx.drawImage(img, 0, bandSy, img.naturalWidth, bandSh, 0, 0, tw, bandTh);
        ctx.restore();
      }
    }
    ctx.imageSmoothingEnabled = prevSmooth;

    // Readability dim — same policy the chunk world uses, so combat stays on top
    ctx.fillStyle = opts.gridBlackoutActive ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.30)';
    ctx.fillRect(xA, yA, xB - xA, yB - yA);
  }

  /**
   * Draw the world background. Drop-in replacement for Game._drawWorldBackground.
   * Phase 0: delegates to legacy image-based rendering.
   * Phase 1: will use chunk-based tile rendering per biome.
   */
  drawWorldBackground(ctx, opts = {}) {
    const { chaosMode, endless, gridBlackoutActive } = opts;

    if (this.chunkStreamingEnabled) {
      // Phase 11 (Maria brief): ENDLESS uses the CYBER MEGACITY deck, CHAOS uses Maria's
      // new chaos deck — each with its OWN identity, same seamless world-space system.
      const _deck = chaosMode ? this._chaosDeckImg : (endless ? this._cityImg : null);
      if (_deck && _deck.complete && _deck.naturalWidth > 0) {
        this._drawCityWorld(ctx, opts, _deck);
        return;
      }
      this._drawChunkWorld(ctx, opts);
      return;
    }

    // ── ACT 1: INTERIOR SPACESHIP (Maria concept — fixed world, fixed zoom) ──
    // Only the plain Act 1 run (no campaign stage, no endless/chaos) uses the ship.
    if (!endless && !chaosMode && !this.game?._campaignStage &&
        this._shipImg && this._shipImg.complete && this._shipImg.naturalWidth > 0) {
      this._drawShipWorld(ctx, opts);
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
    // Phase 1: delegate to ChunkManager for biome-colored chunk rendering.
    const cm = this.game?.chunkManager;
    if (cm && cm.enabled) {
      const cam  = this.game.camera;
      const vw   = this.game._viewW;
      const vh   = this.game._viewH;
      cm.drawChunkBackgrounds(ctx, cam, vw, vh);

      // #70 fix — Chaos Mode uses chunk streaming (so the single chaos-map image was never shown).
      // Tile Maria's new chaos map across the visible camera region as a translucent overlay so the
      // Chaos world actually reads as the new map, blended over the biome chunks.
      const cb = this._chaosBgImage;
      if (opts && opts.chaosMode && cb && cb.complete && cb.naturalWidth > 0) {
        const TS = 1400;                                   // world-px tile size
        const x0 = Math.floor(cam.x / TS) * TS, y0 = Math.floor(cam.y / TS) * TS;
        ctx.save();
        ctx.globalAlpha = 0.9;                             // dominant so Maria's chaos map clearly reads
        for (let x = x0; x < cam.x + vw + TS; x += TS) {
          for (let y = y0; y < cam.y + vh + TS; y += TS) {
            ctx.drawImage(cb, x, y, TS, TS);
          }
        }
        ctx.restore();
      }
    }
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
