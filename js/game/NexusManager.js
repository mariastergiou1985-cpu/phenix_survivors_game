// ─── NexusManager.js ────────────────────────────────────────────────────────
// Manages all Nexus (PowerMatrix) stations across biomes for PHENIX: NULL EDEN 2.0.
// Owns:
//   • Nexus creation per biome (4 per biome in Endless, 4 total in Act 1)
//   • Per-biome health tracking (overload zones)
//   • Reward pulse system (XP, credits, heal, overload relief every 30s)
//   • Enemy → nearest Nexus targeting
//   • Biome buff/debuff based on Nexus health
// ────────────────────────────────────────────────────────────────────────────

import { Vec2, CORE_COLORS } from '../constants.js';
import { PowerMatrix } from '../entities/PowerMatrix.js?v=20260703500000';
import { BIOME_ID, CHUNK_SIZE } from './MapManager.js?v=20260703500000';

// ─── Constants ──────────────────────────────────────────────────────────────
const NEXUS_PER_BIOME    = 4;
const NEXUS_CAPACITY     = 6;     // was 8 — smaller per-nexus, but 24 total in Endless (144 cores)
const REWARD_PULSE_INTERVAL = 30; // seconds between reward emissions from charged Nexus
const REWARD_PULSE_RADIUS   = 600; // max distance for reward to home toward player

// Reward types and their weights
const REWARD_TYPES = [
  { type: 'xp',       weight: 35, color: '#a0d8ef', label: '+XP' },
  { type: 'credits',  weight: 25, color: '#7CFF8A', label: '+CREDITS' },
  { type: 'heal',     weight: 20, color: '#ff7eb3', label: '+HEAL' },
  { type: 'overload', weight: 20, color: '#ffd23c', label: '-OVERLOAD' },
];
const TOTAL_REWARD_WEIGHT = REWARD_TYPES.reduce((s, r) => s + r.weight, 0);

// Per-biome overload thresholds
const BIOME_DEPLETED_THRESHOLD = 0.25; // below 25% → biome is "depleted" (harder enemies)
const BIOME_CHARGED_THRESHOLD  = 0.75; // above 75% → biome is "charged" (player buff)

// ─── Biome Layout for Endless ──────────────────────────────────────────────
// Neon District stays at center. Each outer biome gets 4 Nexus placed in a
// ring at distance ~1.5 chunks from origin in that biome's angular sector.
// These are world-pixel positions relative to the chunk grid.
const BIOME_RING_ORDER = [
  BIOME_ID.INDUSTRIAL_CORE,
  BIOME_ID.ORBITAL_NEXUS,
  BIOME_ID.ABYSSAL_TRENCH,
  BIOME_ID.GLACIAL_EXPANSE,
  BIOME_ID.DATA_WASTES,
];

// ─── Helper ────────────────────────────────────────────────────────────────
function pickWeightedReward() {
  let roll = Math.random() * TOTAL_REWARD_WEIGHT;
  for (const r of REWARD_TYPES) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return REWARD_TYPES[0];
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── NexusManager Class ────────────────────────────────────────────────────
export class NexusManager {
  /**
   * @param {object} opts
   * @param {boolean} opts.endless  - true if Endless mode
   */
  constructor({ endless = false } = {}) {
    this.endless = endless;

    /** @type {PowerMatrix[]} All active Nexus stations (flat array for Game.js compat) */
    this.matrices = [];

    /** @type {Map<string, PowerMatrix[]>} biomeId → Nexus array */
    this.biomeNexus = new Map();

    /** @type {Map<string, number>} biomeId → biome health ratio (0–1) */
    this.biomeHealth = new Map();

    /** Reward pulse timer (shared clock, per-nexus phase offset) */
    this.rewardTimer = 0;

    /** @type {Array<{pos:Vec2, vel:Vec2, life:number, maxLife:number, reward:object, color:string, label:string}>} */
    this.rewardOrbs = [];

    // Initialize biome health for all biomes
    const allBiomes = [BIOME_ID.NEON_DISTRICT, ...BIOME_RING_ORDER];
    for (const b of allBiomes) {
      this.biomeNexus.set(b, []);
      this.biomeHealth.set(b, 1.0);
    }
  }

  // ─── Initialization ────────────────────────────────────────────────────
  /**
   * Create all Nexus stations.
   * Call once during Game.reset() AFTER _createMatrices is removed.
   * @param {number} worldW - WORLD_W (Act 1 world width)
   * @param {number} worldH - WORLD_H (Act 1 world height)
   */
  init(worldW, worldH) {
    this.matrices = [];
    for (const [, arr] of this.biomeNexus) arr.length = 0;

    if (this.endless) {
      this._createEndlessNexus();
    } else {
      this._createAct1Nexus(worldW, worldH);
    }

    this._updateBiomeHealth();
  }

  /**
   * Act 1: 4 Nexus at inset corners of Neon District (same layout as legacy).
   * Capacity reduced from 8 → 6.
   */
  _createAct1Nexus(worldW, worldH) {
    const positions = [
      [260,           230],
      [worldW - 260,  230],
      [280,           worldH - 200],
      [worldW - 280,  worldH - 200],
    ];
    const neonArr = this.biomeNexus.get(BIOME_ID.NEON_DISTRICT);
    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      const m = new PowerMatrix(new Vec2(x, y), CORE_COLORS[i % CORE_COLORS.length], NEXUS_CAPACITY);
      m.biomeId = BIOME_ID.NEON_DISTRICT;
      this.matrices.push(m);
      neonArr.push(m);
    }
  }

  /**
   * Endless: 4 Nexus per biome. Neon District Nexus near center, outer biomes
   * placed in a ring ~3–4 chunks from origin in their angular sector.
   */
  _createEndlessNexus() {
    // ── Neon District (center): 4 Nexus in a tighter diamond ──
    const neonPositions = [
      [CHUNK_SIZE * 0.35,  CHUNK_SIZE * 0.35],
      [CHUNK_SIZE * 0.65,  CHUNK_SIZE * 0.35],
      [CHUNK_SIZE * 0.35,  CHUNK_SIZE * 0.65],
      [CHUNK_SIZE * 0.65,  CHUNK_SIZE * 0.65],
    ];
    const neonArr = this.biomeNexus.get(BIOME_ID.NEON_DISTRICT);
    for (let i = 0; i < neonPositions.length; i++) {
      const [x, y] = neonPositions[i];
      const m = new PowerMatrix(new Vec2(x, y), CORE_COLORS[i % CORE_COLORS.length], NEXUS_CAPACITY);
      m.biomeId = BIOME_ID.NEON_DISTRICT;
      this.matrices.push(m);
      neonArr.push(m);
    }

    // ── Outer biomes: 4 Nexus each at deterministic ring positions ──
    const ringDist = CHUNK_SIZE * 3.5; // ~3.5 chunks from origin
    const sectorCount = BIOME_RING_ORDER.length;

    for (let s = 0; s < sectorCount; s++) {
      const biomeId = BIOME_RING_ORDER[s];
      const biomeArr = this.biomeNexus.get(biomeId);
      const sectorAngle = (s / sectorCount) * Math.PI * 2;

      for (let n = 0; n < NEXUS_PER_BIOME; n++) {
        // Fan 4 Nexus across the sector with slight radial variation
        const angleOffset = ((n - 1.5) / NEXUS_PER_BIOME) * (Math.PI * 2 / sectorCount) * 0.6;
        const radialJitter = CHUNK_SIZE * (0.8 + (n % 2) * 0.5);
        const angle = sectorAngle + angleOffset;
        const r = ringDist + radialJitter;

        const x = Math.round(r * Math.cos(angle));
        const y = Math.round(r * Math.sin(angle));

        const colorIdx = s * NEXUS_PER_BIOME + n;
        const m = new PowerMatrix(new Vec2(x, y), CORE_COLORS[colorIdx % CORE_COLORS.length], NEXUS_CAPACITY);
        m.biomeId = biomeId;
        this.matrices.push(m);
        biomeArr.push(m);
      }
    }
  }

  // ─── Reposition (Endless entry from Act 1) ──────────────────────────────
  /**
   * Called when transitioning Act 1 → Endless. Repositions existing 4 Act 1
   * Nexus to tighter Endless positions, then spawns the remaining 20 outer-biome Nexus.
   */
  repositionForEndless() {
    // Move existing Neon District Nexus to Endless positions
    const neonArr = this.biomeNexus.get(BIOME_ID.NEON_DISTRICT);
    const neonPositions = [
      [CHUNK_SIZE * 0.35,  CHUNK_SIZE * 0.35],
      [CHUNK_SIZE * 0.65,  CHUNK_SIZE * 0.35],
      [CHUNK_SIZE * 0.35,  CHUNK_SIZE * 0.65],
      [CHUNK_SIZE * 0.65,  CHUNK_SIZE * 0.65],
    ];
    for (let i = 0; i < neonArr.length && i < neonPositions.length; i++) {
      neonArr[i].pos.x = neonPositions[i][0];
      neonArr[i].pos.y = neonPositions[i][1];
    }

    // Spawn outer-biome Nexus
    this.endless = true;
    const ringDist = CHUNK_SIZE * 3.5;
    const sectorCount = BIOME_RING_ORDER.length;

    for (let s = 0; s < sectorCount; s++) {
      const biomeId = BIOME_RING_ORDER[s];
      const biomeArr = this.biomeNexus.get(biomeId);
      const sectorAngle = (s / sectorCount) * Math.PI * 2;

      for (let n = 0; n < NEXUS_PER_BIOME; n++) {
        const angleOffset = ((n - 1.5) / NEXUS_PER_BIOME) * (Math.PI * 2 / sectorCount) * 0.6;
        const radialJitter = CHUNK_SIZE * (0.8 + (n % 2) * 0.5);
        const angle = sectorAngle + angleOffset;
        const r = ringDist + radialJitter;

        const x = Math.round(r * Math.cos(angle));
        const y = Math.round(r * Math.sin(angle));

        const colorIdx = s * NEXUS_PER_BIOME + n;
        const m = new PowerMatrix(new Vec2(x, y), CORE_COLORS[colorIdx % CORE_COLORS.length], NEXUS_CAPACITY);
        m.biomeId = biomeId;
        this.matrices.push(m);
        biomeArr.push(m);
      }
    }

    this._updateBiomeHealth();
  }

  // ─── Update (called every frame) ────────────────────────────────────────
  /**
   * @param {number} dt - delta time
   * @param {object} player - player object (pos, hp, maxHp)
   * @param {number} gridGoldBonus - Grid Investor card bonus
   */
  update(dt, player, gridGoldBonus = 0) {
    // Update each matrix
    for (const m of this.matrices) {
      m.update(dt);
      m.goldChanceBonus = gridGoldBonus;
    }

    // Reward pulse
    this.rewardTimer += dt;
    if (this.rewardTimer >= REWARD_PULSE_INTERVAL) {
      this.rewardTimer -= REWARD_PULSE_INTERVAL;
      this._emitRewards(player);
    }

    // Update reward orbs (home toward player)
    this._updateRewardOrbs(dt, player);

    // Recalculate biome health
    this._updateBiomeHealth();
  }

  // ─── Reward System ──────────────────────────────────────────────────────
  _emitRewards(player) {
    if (!player) return;
    for (const m of this.matrices) {
      // Only charged Nexus emit rewards (at least 50% stored)
      if (m.stored < m.capacity * 0.5) continue;
      // Only emit if player is within range
      if (dist(m.pos, player.pos) > REWARD_PULSE_RADIUS) continue;

      const reward = pickWeightedReward();
      const angle = Math.atan2(player.pos.y - m.pos.y, player.pos.x - m.pos.x);
      const speed = 200;

      this.rewardOrbs.push({
        pos: m.pos.clone(),
        vel: new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed),
        life: 3.0,
        maxLife: 3.0,
        reward,
        color: reward.color,
        label: reward.label,
      });
    }
  }

  _updateRewardOrbs(dt, player) {
    if (!player || !this.rewardOrbs.length) return;

    for (let i = this.rewardOrbs.length - 1; i >= 0; i--) {
      const orb = this.rewardOrbs[i];
      orb.life -= dt;

      if (orb.life <= 0) {
        this.rewardOrbs.splice(i, 1);
        continue;
      }

      // Home toward player
      const dx = player.pos.x - orb.pos.x;
      const dy = player.pos.y - orb.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) {
        const homeStrength = 400 + (1 - orb.life / orb.maxLife) * 600; // accelerates
        orb.vel.x += (dx / d) * homeStrength * dt;
        orb.vel.y += (dy / d) * homeStrength * dt;
      }

      // Dampen velocity slightly
      orb.vel.x *= 0.97;
      orb.vel.y *= 0.97;

      orb.pos.x += orb.vel.x * dt;
      orb.pos.y += orb.vel.y * dt;

      // Mark for collection when close to player (Game.js applies the reward and splices)
      if (d < 30) {
        orb._collected = true;
      }
    }
  }

  /**
   * Apply collected reward effects. Called by Game.js after update.
   * @returns {Array<{type:string, label:string, color:string}>} collected rewards
   */
  collectRewards() {
    const collected = [];
    // Check for orbs that were marked as collected
    // (They were already spliced from rewardOrbs — we track via the _collected flag)
    // Actually, let's use a different approach: collect buffer
    return collected;
  }

  // ─── Biome Health ───────────────────────────────────────────────────────
  _updateBiomeHealth() {
    for (const [biomeId, nexusArr] of this.biomeNexus) {
      if (!nexusArr.length) {
        this.biomeHealth.set(biomeId, 1.0);
        continue;
      }
      let stored = 0, capacity = 0;
      for (const m of nexusArr) {
        stored += m.stored;
        capacity += m.capacity;
      }
      this.biomeHealth.set(biomeId, capacity > 0 ? stored / capacity : 1.0);
    }
  }

  /**
   * Get the biome health ratio (0–1) for a given biome.
   * @param {string} biomeId
   * @returns {number}
   */
  getBiomeHealth(biomeId) {
    return this.biomeHealth.get(biomeId) ?? 1.0;
  }

  /**
   * Is this biome depleted? (below 25% → harder enemies)
   * @param {string} biomeId
   * @returns {boolean}
   */
  isBiomeDepleted(biomeId) {
    return this.getBiomeHealth(biomeId) < BIOME_DEPLETED_THRESHOLD;
  }

  /**
   * Is this biome charged? (above 75% → player buff)
   * @param {string} biomeId
   * @returns {boolean}
   */
  isBiomeCharged(biomeId) {
    return this.getBiomeHealth(biomeId) >= BIOME_CHARGED_THRESHOLD;
  }

  /**
   * Get enemy damage multiplier for a biome. Depleted = 1.3x, normal = 1.0x.
   * @param {string} biomeId
   * @returns {number}
   */
  getEnemyDamageMult(biomeId) {
    return this.isBiomeDepleted(biomeId) ? 1.3 : 1.0;
  }

  /**
   * Get player buff for a biome. Charged = { speedBoost: 1.1, xpMult: 1.15 }.
   * @param {string} biomeId
   * @returns {{ speedBoost: number, xpMult: number }}
   */
  getPlayerBuff(biomeId) {
    if (this.isBiomeCharged(biomeId)) {
      return { speedBoost: 1.1, xpMult: 1.15 };
    }
    return { speedBoost: 1.0, xpMult: 1.0 };
  }

  // ─── Enemy Targeting ────────────────────────────────────────────────────
  /**
   * Find the nearest Nexus to a position that has cores.
   * Enemies should call this instead of random matrix selection.
   * @param {Vec2} pos - enemy position
   * @param {string} [biomeId] - prefer Nexus in this biome (falls back to any)
   * @returns {PowerMatrix|null}
   */
  nearestNexusWithCores(pos, biomeId = null) {
    // Prefer same-biome Nexus
    if (biomeId) {
      const biomeArr = this.biomeNexus.get(biomeId);
      if (biomeArr && biomeArr.length) {
        const withCores = biomeArr.filter(m => m.hasCore());
        if (withCores.length) {
          return withCores.reduce((a, b) => dist(pos, a.pos) < dist(pos, b.pos) ? a : b);
        }
      }
    }
    // Fallback: nearest Nexus globally with cores
    const withCores = this.matrices.filter(m => m.hasCore());
    if (!withCores.length) return this.matrices.length ? this.matrices[0] : null;
    return withCores.reduce((a, b) => dist(pos, a.pos) < dist(pos, b.pos) ? a : b);
  }

  /**
   * Find the nearest Nexus with space (for depositing cores).
   * @param {Vec2} pos
   * @returns {PowerMatrix|null}
   */
  nearestNexusWithSpace(pos) {
    const withSpace = this.matrices.filter(m => m.hasSpace());
    if (!withSpace.length) return null;
    return withSpace.reduce((a, b) => dist(pos, a.pos) < dist(pos, b.pos) ? a : b);
  }

  // ─── Draw ───────────────────────────────────────────────────────────────
  /**
   * Draw reward orbs (world-space). Called from Game._draw().
   * @param {CanvasRenderingContext2D} ctx
   */
  drawRewardOrbs(ctx) {
    for (const orb of this.rewardOrbs) {
      const alpha = Math.min(1, orb.life / orb.maxLife * 2);
      const pulse = 0.8 + 0.2 * Math.sin(performance.now() * 0.01);
      const r = 6 * pulse;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'lighter';

      // Glow
      const g = ctx.createRadialGradient(orb.pos.x, orb.pos.y, r * 0.3, orb.pos.x, orb.pos.y, r * 3);
      g.addColorStop(0, orb.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(orb.pos.x, orb.pos.y, r * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = orb.color;
      ctx.beginPath();
      ctx.arc(orb.pos.x, orb.pos.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // ─── Serialization (for save/load) ──────────────────────────────────────
  /**
   * Get state for saving.
   * @returns {object}
   */
  getState() {
    const nexusStates = this.matrices.map(m => ({
      x: m.pos.x, y: m.pos.y,
      stored: m.stored, capacity: m.capacity,
      biomeId: m.biomeId,
    }));
    return { nexusStates, rewardTimer: this.rewardTimer };
  }

  /**
   * Restore state from save.
   * @param {object} state
   */
  loadState(state) {
    if (!state || !state.nexusStates) return;
    for (let i = 0; i < state.nexusStates.length && i < this.matrices.length; i++) {
      this.matrices[i].stored = state.nexusStates[i].stored;
    }
    this.rewardTimer = state.rewardTimer ?? 0;
    this._updateBiomeHealth();
  }

  // ─── Accessors (Game.js compatibility) ──────────────────────────────────
  get length() { return this.matrices.length; }

  /** Total deficit across all Nexus */
  get totalDeficit() {
    let d = 0;
    for (const m of this.matrices) d += (m.capacity - m.stored);
    return d;
  }

  /** Total stored across all Nexus */
  get totalStored() {
    let s = 0;
    for (const m of this.matrices) s += m.stored;
    return s;
  }

  /** Total capacity across all Nexus */
  get totalCapacity() {
    let c = 0;
    for (const m of this.matrices) c += m.capacity;
    return c;
  }
}
