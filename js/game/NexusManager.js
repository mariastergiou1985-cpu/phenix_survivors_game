// ─── NexusManager.js ────────────────────────────────────────────────────────
// Manages all Nexus (PowerMatrix) stations across biomes for PHENIX: NULL EDEN 2.0.
// Owns:
//   • Nexus creation per biome (4 per biome in Endless, 4 total in Act 1)
//   • Per-biome health tracking (charge levels)
//   • Reward pulse system (XP, credits, heal, mana every 18s — spends 1 charge)
//   • Kill-based recharge: 100 enemy kills = +1 stored charge to depleted/non-full Nexus
//   • Biome-aware Nexus colors + visual states (full/partial/depleted)
// ────────────────────────────────────────────────────────────────────────────

import { Vec2, CORE_COLORS } from '../constants.js';
import { PowerMatrix } from '../entities/PowerMatrix.js?v=20260705150000';
import { BIOME_ID, CHUNK_SIZE } from './MapManager.js?v=20260703999000';

// ─── Constants ──────────────────────────────────────────────────────────────
const NEXUS_PER_BIOME    = 1;     // 1 per outer biome — placed near active area, not far away
const NEXUS_CAPACITY     = 6;     // was 8 — smaller per-nexus, but 24 total in Endless (144 cores)
const REWARD_PULSE_INTERVAL = 18; // seconds between reward emissions from charged Nexus (was 30)
const REWARD_PULSE_RADIUS   = 900; // max distance for reward to home toward player (was 600)

// Reward types and their weights
const REWARD_TYPES = [
  { type: 'xp',       weight: 35, color: '#a0d8ef', label: '+XP' },
  { type: 'credits',  weight: 25, color: '#7CFF8A', label: '+CREDITS' },
  { type: 'heal',     weight: 20, color: '#ff7eb3', label: '+HEAL' },
  { type: 'mana',     weight: 20, color: '#7fe0ff', label: '+MANA' },
];
const TOTAL_REWARD_WEIGHT = REWARD_TYPES.reduce((s, r) => s + r.weight, 0);

// Per-biome charge thresholds
const BIOME_DEPLETED_THRESHOLD = 0.25; // below 25% → biome is "depleted" (harder enemies)
const BIOME_CHARGED_THRESHOLD  = 0.75; // above 75% → biome is "charged" (player buff)

// ─── Biome-specific Nexus Colors ──────────────────────────────────────────
// Each biome has a primary glow and a depleted (powered-down) tone.
// Full Nexus uses the primary; partial blends toward depleted; empty uses depleted.
const BIOME_NEXUS_COLORS = {
  [BIOME_ID.NEON_DISTRICT]:   { full: '#00e6ff', mid: '#ff00b4', depleted: '#1a2a5a' },  // cyan/magenta
  [BIOME_ID.INDUSTRIAL_CORE]: { full: '#ff6a00', mid: '#ffb830', depleted: '#3a1a08' },  // orange/ember
  [BIOME_ID.ORBITAL_NEXUS]:   { full: '#8060ff', mid: '#3a8aff', depleted: '#0a1a40' },  // violet/blue
  [BIOME_ID.ABYSSAL_TRENCH]:  { full: '#4040cc', mid: '#00d4c8', depleted: '#0a2038' },  // deep blue/aqua
  [BIOME_ID.GLACIAL_EXPANSE]: { full: '#70c8ff', mid: '#c0e8ff', depleted: '#1a2a3a' },  // ice blue/white
  [BIOME_ID.DATA_WASTES]:     { full: '#30c8a0', mid: '#80ffcc', depleted: '#1a2a20' },  // teal/green
};

// ─── Biome Layout for Endless ──────────────────────────────────────────────
// Neon District stays at center. Each outer biome gets 4 Nexus placed in a
// ring at distance ~1.5 chunks from origin in that biome's angular sector.
// These are world-pixel positions relative to the chunk grid.
const BIOME_RING_ORDER = [
  BIOME_ID.INDUSTRIAL_CORE,
  BIOME_ID.ABYSSAL_TRENCH,
  BIOME_ID.GLACIAL_EXPANSE,
  BIOME_ID.ORBITAL_NEXUS,
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
    const neonColors = BIOME_NEXUS_COLORS[BIOME_ID.NEON_DISTRICT];
    for (let i = 0; i < positions.length; i++) {
      const [x, y] = positions[i];
      const m = new PowerMatrix(new Vec2(x, y), neonColors.full, NEXUS_CAPACITY + (this.capacityBonus || 0));
      m.biomeId = BIOME_ID.NEON_DISTRICT;
      m.biomeColors = neonColors;
      this.matrices.push(m);
      neonArr.push(m);
    }
  }

  /**
   * Endless: 4 Neon District Nexus near center + 1 Nexus per outer biome
   * placed in a ring ~1.5 chunks from origin in their angular sector.
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
    const neonColors = BIOME_NEXUS_COLORS[BIOME_ID.NEON_DISTRICT];
    for (let i = 0; i < neonPositions.length; i++) {
      const [x, y] = neonPositions[i];
      const m = new PowerMatrix(new Vec2(x, y), neonColors.full, NEXUS_CAPACITY + (this.capacityBonus || 0));
      m.biomeId = BIOME_ID.NEON_DISTRICT;
      m.biomeColors = neonColors;
      this.matrices.push(m);
      neonArr.push(m);
    }

    // ── Outer biomes: 1 Nexus each, placed near the active gameplay area ──
    // Nexus are world support stations — reachable during normal play.
    // Placed at ~1.5 chunks from origin in each biome's angular sector center.
    // Angle formula matches ChunkManager._getBiomeForCoords so each Nexus
    // lands inside its own biome territory.
    const ringDist = CHUNK_SIZE * 0.8; // INSIDE the 3x3 playable arena (walls at +/-1.5 chunks) — unified on both Endless entry paths
    const sectorCount = BIOME_RING_ORDER.length;

    for (let s = 0; s < sectorCount; s++) {
      const biomeId = BIOME_RING_ORDER[s];
      const biomeArr = this.biomeNexus.get(biomeId);
      // Match ChunkManager's angle mapping: normalizedAngle = (atan2+PI)/(2*PI)
      // Sector s covers normalized range [s/N, (s+1)/N), so center = (s+0.5)/N
      // Convert back: angle = center * 2*PI - PI
      const sectorCenter = (s + 0.5) / sectorCount;
      const sectorAngle = sectorCenter * Math.PI * 2 - Math.PI;

      for (let n = 0; n < NEXUS_PER_BIOME; n++) {
        const angle = sectorAngle;
        const r = ringDist;

        const x = Math.round(r * Math.cos(angle));
        const y = Math.round(r * Math.sin(angle));

        const bColors = BIOME_NEXUS_COLORS[biomeId] || BIOME_NEXUS_COLORS[BIOME_ID.NEON_DISTRICT];
        const m = new PowerMatrix(new Vec2(x, y), bColors.full, NEXUS_CAPACITY + (this.capacityBonus || 0));
        m.biomeId = biomeId;
        m.biomeColors = bColors;
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

    // Spawn outer-biome Nexus (matches _createEndlessNexus layout)
    this.endless = true;
    const ringDist = CHUNK_SIZE * 0.8; // INSIDE the 3x3 playable arena — matches _createEndlessNexus
    const sectorCount = BIOME_RING_ORDER.length;

    for (let s = 0; s < sectorCount; s++) {
      const biomeId = BIOME_RING_ORDER[s];
      const biomeArr = this.biomeNexus.get(biomeId);
      // Angle matches ChunkManager sector mapping
      const sectorCenter = (s + 0.5) / sectorCount;
      const sectorAngle = sectorCenter * Math.PI * 2 - Math.PI;

      for (let n = 0; n < NEXUS_PER_BIOME; n++) {
        const angle = sectorAngle;
        const r = ringDist;

        const x = Math.round(r * Math.cos(angle));
        const y = Math.round(r * Math.sin(angle));

        const bColors = BIOME_NEXUS_COLORS[biomeId] || BIOME_NEXUS_COLORS[BIOME_ID.NEON_DISTRICT];
        const m = new PowerMatrix(new Vec2(x, y), bColors.full, NEXUS_CAPACITY + (this.capacityBonus || 0));
        m.biomeId = biomeId;
        m.biomeColors = bColors;
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
      // Only Nexus with stored > 0 can emit rewards
      if (m.stored <= 0) continue;
      // Only emit if player is within range
      if (dist(m.pos, player.pos) > REWARD_PULSE_RADIUS) continue;

      // Spend 1 stored charge per reward pulse
      m.stored = Math.max(0, m.stored - 1);

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
      if (d < 50) {
        orb._collected = true;
      }
    }
  }

  // collectRewards() — removed (dead code). Reward orbs are collected directly
  // in Game.js via the _collected flag + splice loop (lines 5552-5564).

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

  // ─── Nexus Recharge (called by Game.js when overload meter hits 100) ───
  /**
   * Add +1 stored charge to the closest depleted or non-full Nexus.
   * Priority: closest depleted (stored===0) to player, then closest non-full.
   * @param {Vec2} playerPos
   * @returns {PowerMatrix|null} the Nexus that was recharged, or null if all full
   */
  rechargeNexus(playerPos) {
    // 1. Closest depleted Nexus to player
    const depleted = this.matrices.filter(m => m.stored <= 0);
    if (depleted.length) {
      const target = depleted.reduce((a, b) => dist(playerPos, a.pos) < dist(playerPos, b.pos) ? a : b);
      target.stored = Math.min(target.capacity, target.stored + 1);
      return target;
    }
    // 2. Closest non-full Nexus
    const nonFull = this.matrices.filter(m => m.stored < m.capacity);
    if (nonFull.length) {
      const target = nonFull.reduce((a, b) => dist(playerPos, a.pos) < dist(playerPos, b.pos) ? a : b);
      target.stored = Math.min(target.capacity, target.stored + 1);
      return target;
    }
    // 3. All full — nothing to recharge
    return null;
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
