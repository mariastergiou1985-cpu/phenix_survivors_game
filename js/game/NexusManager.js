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
import { PowerMatrix } from '../entities/PowerMatrix.js?v=20260712090000';
import { BIOME_ID, CHUNK_SIZE } from './MapManager.js?v=20260724000000';

// ─── Constants ──────────────────────────────────────────────────────────────
const NEXUS_PER_BIOME    = 1;     // 1 per outer biome
// FEATURE FLAG. Kept as a kill-switch. The blocker that forced this OFF — the Endless
// rebase of 10032px not being a whole multiple of CHUNK_SIZE 1280, so floor(x/CHUNK_SIZE)
// changed while the player stood still — is fixed: ChunkManager now keeps a logical world
// origin and getBiomeForWorldPosition() is the single biome authority, so biome identity
// is invariant across rebases. Covered by tools/qa/nexus_stream_regression.mjs.
const OUTER_NEXUS_STREAMING_ENABLED = true;
const NEXUS_FOOTPRINT    = 44;    // body + interaction padding used for walkability checks
const OUTER_SWAP_HOLD    = 0.6;   // s a biome must be held before the outer Nexus swaps (boundary hysteresis)
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

// Chaos Mode buff stars — TACTICAL/OFFENSIVE only, never flat HP (no 'heal').
// 'haste' = temporary attack-speed buff (applied via player.applyChaosHaste).
const CHAOS_REWARD_TYPES = [
  { type: 'haste',   weight: 34, color: '#ffd447', label: '★ HASTE' },
  { type: 'xp',      weight: 30, color: '#a0d8ef', label: '+XP' },
  { type: 'mana',    weight: 20, color: '#7fe0ff', label: '+MANA' },
  { type: 'credits', weight: 16, color: '#7CFF8A', label: '+CREDITS' },
];
const TOTAL_CHAOS_WEIGHT = CHAOS_REWARD_TYPES.reduce((s, r) => s + r.weight, 0);
function pickChaosReward() {
  let roll = Math.random() * TOTAL_CHAOS_WEIGHT;
  for (const r of CHAOS_REWARD_TYPES) { if ((roll -= r.weight) <= 0) return r; }
  return CHAOS_REWARD_TYPES[0];
}

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
    this.outerRecords  = [];      // 5 persistent biome state records (see _syncOuterNexus)
    this._activeOuter  = null;    // the single streamed-in outer Nexus instance, or null
    this._activeSector = -1;
    this._pendingSector = -1;
    this._pendingHold  = 0;

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
    this.outerRecords  = [];      // 5 persistent biome state records (see _syncOuterNexus)
    this._activeOuter  = null;    // the single streamed-in outer Nexus instance, or null
    this._activeSector = -1;
    this._pendingSector = -1;
    this._pendingHold  = 0;
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
    // BOUNDS + ASYMMETRY FIX (Maria video QA 2026-07-19). These were [260,230],
    // [W-260,230], [280,H-200], [W-280,H-200]: a perfect rectangle, and worse, y=230 and
    // y=H-200 are OUTSIDE the Act 1 walkable deck (measured band y 491..1297), so the top
    // pair floated 261px above the floor and the bottom pair 191px below it — visible in
    // the background void but unreachable, because the player clamps to the deck.
    //
    // Placement now comes from the caller's authored districts, expressed as fractions of
    // the real walkable band so it can never drift outside the floor again. Four distinct
    // districts, no two sharing a row or a column, ~690px+ minimum separation.
    const band = this.act1Bounds ||
                 { x0: 204, x1: 2803, y0: 491, y1: 1297 };   // measured deck fallback
    const bw = band.x1 - band.x0, bh = band.y1 - band.y0;
    const F = [
      [0.91, 0.88],   // far right, low
      [0.40, 0.44],   // left-of-centre, mid height
      [0.08, 0.79],   // far left, lower
      [0.72, 0.10],   // right-of-centre, high
    ];
    const positions = F.map(([fx, fy]) => [
      Math.round(band.x0 + bw * fx),
      Math.round(band.y0 + bh * fy),
    ]);
    void worldW; void worldH;   // world rect is NOT the walkable area — kept for signature compat
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
    // AUTHORED ASYMMETRY (Maria video QA 2026-07-19): these were a perfect square —
    // 0.35/0.65 on both axes — so the four Endless Neon Nexus read as machine-placed
    // furniture and framed together as one cluster. Same authored-district treatment as
    // the Act 1 layout: four distinct districts, no two sharing a row or a column, none
    // on a shared centre. Values are fractions of CHUNK_SIZE and stay deterministic, so
    // the Endless layout is stable across a run and identical between sessions.
    // NOTE: this list is duplicated in _createEndlessNexus and repositionForEndless and
    // the two MUST stay identical — entering Endless directly and transitioning from
    // Act 1 have to produce the same world, or the same run would relayout mid-session.
    const neonPositions = [
      [CHUNK_SIZE * 0.22,  CHUNK_SIZE * 0.41],   // west, mid-height
      [CHUNK_SIZE * 0.58,  CHUNK_SIZE * 0.19],   // centre-east, high
      [CHUNK_SIZE * 0.79,  CHUNK_SIZE * 0.63],   // far east, below centre
      [CHUNK_SIZE * 0.38,  CHUNK_SIZE * 0.81],   // centre-west, low
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
    // IDEMPOTENCY GUARD (runtime harness 2026-07-19): this builder is reachable from
    // both Endless entry paths and again on retry/reset. Without clearing first, a second
    // call appended another five records — the harness measured 10 — which would later
    // stream in a duplicate outer Nexus and desynchronise every saved charge.
    this._despawnOuter();
    this.outerRecords.length = 0;
    this._activeSector = -1; this._pendingSector = -1; this._pendingHold = 0;
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

      // STREAMED OUTER NEXUS (Maria decision 2026-07-19): previously all five outer
      // biome Nexus were instantiated at once, so Endless carried 9 permanent Nexus and
      // the screen read as a cluster of bases. Now each biome keeps a persistent STATE
      // RECORD here and only the player's current biome is ever instantiated as a world
      // sprite — see _syncOuterNexus(). Charge/progress survives leaving and returning,
      // because it lives on the record, not on the throwaway instance.
      for (let n = 0; n < NEXUS_PER_BIOME; n++) {
        // Deterministic offset per biome so the ring is not a perfect circle: the angle
        // is nudged within its own sector and the radius varies per biome. Stable across
        // sessions (derived from the sector index, not Math.random).
        const wob    = Math.sin((s + 1) * 12.9898) * 0.5;               // −0.5..0.5
        const angle  = sectorAngle + wob * (Math.PI / sectorCount) * 0.55;
        const r      = ringDist * (0.82 + 0.26 * (0.5 + 0.5 * Math.sin((s + 1) * 78.233)));
        const x = Math.round(r * Math.cos(angle));
        const y = Math.round(r * Math.sin(angle));

        const bColors = BIOME_NEXUS_COLORS[biomeId] || BIOME_NEXUS_COLORS[BIOME_ID.NEON_DISTRICT];
        this.outerRecords.push({
          biomeId, sector: s, x, y, colors: bColors,
          capacity: NEXUS_CAPACITY + (this.capacityBonus || 0),
          stored: NEXUS_CAPACITY + (this.capacityBonus || 0),   // starts full, like the central four
          activated: false, completed: false, lastInteraction: -Infinity,
          instance: null,                                        // set only while streamed in
        });
        void biomeArr;   // biome arrays stay for the central Nexus; outer live on records
      }
    }
  }

  // ─── OUTER NEXUS STREAMING ───────────────────────────────────────────────
  /**
   * Instantiates AT MOST ONE outer-biome Nexus — the one for the biome the player is
   * currently in. Called every frame; cheap when nothing changes.
   *
   * Why: all five used to exist as world sprites at once, which (with the four central
   * Nexus) put nine permanent bases on the map and made Endless read as a cluster of
   * stations rather than a city with landmarks in it.
   *
   * State lives on the record, the sprite is disposable: leaving a biome writes the
   * instance's charge back to its record and drops the sprite; returning rebuilds a
   * sprite from the record, so progress is never lost and rewards never double.
   *
   * HYSTERESIS: a player walking along a sector boundary would otherwise cross back and
   * forth every frame and spawn/despawn continuously. A biome must be held for
   * OUTER_SWAP_HOLD seconds before the swap commits.
   */
  /** Writes the live instance's state back to its record and removes the sprite. */
  _despawnOuter() {
    if (!this._activeOuter) return;
    const prev = this.outerRecords[this._activeSector];
    if (prev) {
      prev.stored    = this._activeOuter.stored ?? prev.stored;
      prev.activated = this._activeOuter.activated ?? prev.activated;
      prev.instance  = null;
    }
    const i = this.matrices.indexOf(this._activeOuter);
    if (i >= 0) this.matrices.splice(i, 1);   // splice keeps the array identity Game aliases
    this._activeOuter = null;
  }

  _syncOuterNexus(biomeId, dt = 0) {
    if (!OUTER_NEXUS_STREAMING_ENABLED) return;   // see flag comment at top of file
    if (!this.endless || !this.outerRecords.length) return;
    // SINGLE SOURCE OF TRUTH (Maria §6, 2026-07-19): the biome ID is supplied by
    // ChunkManager._getBiomeForCoords(), which works in CHUNK coordinates. An earlier
    // version of this method derived the sector itself from atan2 on raw world pixels —
    // a second, independent sector model. That was wrong twice over: it could disagree
    // with the chunk system about which biome the player is in, and because the Endless
    // world rebases by −10032px, the raw coordinates change while the player does not
    // move, so the biome would flip for no gameplay reason and the outer Nexus would
    // despawn/respawn on every rebase. Never compute the sector here.
    const sector = this.outerRecords.findIndex(r => r.biomeId === biomeId);
    if (sector < 0) {                      // player is in the central Neon District
      if (this._activeOuter) this._despawnOuter();
      this._pendingSector = -1; this._pendingHold = 0; this._activeSector = -1;
      return;
    }

    if (sector !== this._pendingSector) { this._pendingSector = sector; this._pendingHold = 0; }
    else if (this._pendingHold < OUTER_SWAP_HOLD) { this._pendingHold += dt; }

    const committed = (this._pendingHold >= OUTER_SWAP_HOLD) ? sector : this._activeSector;
    if (committed === this._activeSector && this._activeOuter) return;   // nothing to do

    this._despawnOuter();   // save state + fully remove the previous instance

    // 2. rebuild the new biome's Nexus from its record
    const rec = this.outerRecords[committed];
    this._activeSector = committed;
    if (!rec) return;
    // Resolve the authored position against the walkable model ONCE and cache it on the
    // record. Re-correcting on every stream-in would move the Nexus a little each time the
    // player returned to the biome; caching keeps it a fixed world landmark. The canonical
    // record x/y are never overwritten, so a rebase cannot drift the stored placement.
    if (rec.fixedX == null) {
      const mm = this.mapManager;
      if (mm?.isWalkableFootprint && !mm.isWalkableFootprint(rec.x, rec.y, NEXUS_FOOTPRINT, 'endless')) {
        const p = mm.findNearestWalkablePoint(rec.x, rec.y, NEXUS_FOOTPRINT, 'endless');
        rec.fixedX = p.x; rec.fixedY = p.y;
      } else { rec.fixedX = rec.x; rec.fixedY = rec.y; }
    }
    const m = new PowerMatrix(new Vec2(rec.fixedX, rec.fixedY), rec.colors.full, rec.capacity);
    m.biomeId     = rec.biomeId;
    m.biomeColors = rec.colors;
    m.stored      = rec.stored;                     // restore charge — no reset, no reward re-grant
    m.activated   = rec.activated;
    m.isOuterNexus = true;
    rec.instance  = m;
    this._activeOuter = m;
    this.matrices.push(m);
  }

  /** Live counts for the QA overlay — never used by gameplay logic. */
  getBaseCounts() {
    return {
      centralNexus:     this.matrices.filter(m => !m.isOuterNexus).length,
      outerDefinitions: this.outerRecords.length,
      outerActive:      this._activeOuter ? 1 : 0,
    };
  }

  // ─── Reposition (Endless entry from Act 1) ──────────────────────────────
  /**
   * Called when transitioning Act 1 → Endless. Repositions the four central Neon Nexus
   * to their authored Endless districts, then builds the outer-biome STATE RECORDS.
   * BIOME_RING_ORDER has 5 entries and NEXUS_PER_BIOME is 1, so there are 5 outer
   * records — an older comment here claimed 20, which was never what the code did.
   * The records are not world objects: _syncOuterNexus() streams in at most one at a
   * time, so Endless carries 4 permanent central Nexus + 0..1 outer = 5 maximum.
   */
  repositionForEndless() {
    // Move existing Neon District Nexus to Endless positions
    const neonArr = this.biomeNexus.get(BIOME_ID.NEON_DISTRICT);
    // AUTHORED ASYMMETRY (Maria video QA 2026-07-19): these were a perfect square —
    // 0.35/0.65 on both axes — so the four Endless Neon Nexus read as machine-placed
    // furniture and framed together as one cluster. Same authored-district treatment as
    // the Act 1 layout: four distinct districts, no two sharing a row or a column, none
    // on a shared centre. Values are fractions of CHUNK_SIZE and stay deterministic, so
    // the Endless layout is stable across a run and identical between sessions.
    // NOTE: this list is duplicated in _createEndlessNexus and repositionForEndless and
    // the two MUST stay identical — entering Endless directly and transitioning from
    // Act 1 have to produce the same world, or the same run would relayout mid-session.
    const neonPositions = [
      [CHUNK_SIZE * 0.22,  CHUNK_SIZE * 0.41],   // west, mid-height
      [CHUNK_SIZE * 0.58,  CHUNK_SIZE * 0.19],   // centre-east, high
      [CHUNK_SIZE * 0.79,  CHUNK_SIZE * 0.63],   // far east, below centre
      [CHUNK_SIZE * 0.38,  CHUNK_SIZE * 0.81],   // centre-west, low
    ];
    for (let i = 0; i < neonArr.length && i < neonPositions.length; i++) {
      neonArr[i].pos.x = neonPositions[i][0];
      neonArr[i].pos.y = neonPositions[i][1];
    }

    // Spawn outer-biome Nexus (matches _createEndlessNexus layout)
    this.endless = true;
    // IDEMPOTENCY GUARD (runtime harness 2026-07-19): this builder is reachable from
    // both Endless entry paths and again on retry/reset. Without clearing first, a second
    // call appended another five records — the harness measured 10 — which would later
    // stream in a duplicate outer Nexus and desynchronise every saved charge.
    this._despawnOuter();
    this.outerRecords.length = 0;
    this._activeSector = -1; this._pendingSector = -1; this._pendingHold = 0;
    const ringDist = CHUNK_SIZE * 0.8; // INSIDE the 3x3 playable arena — matches _createEndlessNexus
    const sectorCount = BIOME_RING_ORDER.length;

    for (let s = 0; s < sectorCount; s++) {
      const biomeId = BIOME_RING_ORDER[s];
      const biomeArr = this.biomeNexus.get(biomeId);
      // Angle matches ChunkManager sector mapping
      const sectorCenter = (s + 0.5) / sectorCount;
      const sectorAngle = sectorCenter * Math.PI * 2 - Math.PI;

      // STREAMED OUTER NEXUS (Maria decision 2026-07-19): previously all five outer
      // biome Nexus were instantiated at once, so Endless carried 9 permanent Nexus and
      // the screen read as a cluster of bases. Now each biome keeps a persistent STATE
      // RECORD here and only the player's current biome is ever instantiated as a world
      // sprite — see _syncOuterNexus(). Charge/progress survives leaving and returning,
      // because it lives on the record, not on the throwaway instance.
      for (let n = 0; n < NEXUS_PER_BIOME; n++) {
        // Deterministic offset per biome so the ring is not a perfect circle: the angle
        // is nudged within its own sector and the radius varies per biome. Stable across
        // sessions (derived from the sector index, not Math.random).
        const wob    = Math.sin((s + 1) * 12.9898) * 0.5;               // −0.5..0.5
        const angle  = sectorAngle + wob * (Math.PI / sectorCount) * 0.55;
        const r      = ringDist * (0.82 + 0.26 * (0.5 + 0.5 * Math.sin((s + 1) * 78.233)));
        const x = Math.round(r * Math.cos(angle));
        const y = Math.round(r * Math.sin(angle));

        const bColors = BIOME_NEXUS_COLORS[biomeId] || BIOME_NEXUS_COLORS[BIOME_ID.NEON_DISTRICT];
        this.outerRecords.push({
          biomeId, sector: s, x, y, colors: bColors,
          capacity: NEXUS_CAPACITY + (this.capacityBonus || 0),
          stored: NEXUS_CAPACITY + (this.capacityBonus || 0),   // starts full, like the central four
          activated: false, completed: false, lastInteraction: -Infinity,
          instance: null,                                        // set only while streamed in
        });
        void biomeArr;   // biome arrays stay for the central Nexus; outer live on records
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

  // ─── Φ14 Chaos role separation ───────────────────────────────────────────
  // Chaos-only: matrices split into BUFF (emit tactical stars — cyan/gold identity) and
  // DEFENCE (turret + shield dome — red/gunmetal identity). Alternating by index so both
  // roles always exist; roles persist for the whole chaos run.
  assignChaosRoles() {
    let i = 0;
    for (const m of this.matrices) {
      m.chaosRole = (i++ % 2 === 0) ? 'buff' : 'defence';
      m._turretCd = 0.6 + (i % 3) * 0.3;   // stagger first shots
    }
    this._chaosRolesAssigned = true;
  }

  /**
   * Give a chaosRole to any matrix that appeared AFTER _beginChaosRun().
   * assignChaosRoles() runs exactly once at Chaos entry, so every matrix streamed in later
   * kept chaosRole === undefined: measured {buff:2, defence:2} at t=0 becoming
   * {buff:2, defence:2, undefined:1} by ~5 min and staying that way. Such a base gets no
   * turret and no dome, yet still emits reward orbs (the skip in _emitRewards tests
   * === 'defence'), so the defence-base count was frozen at 2 for any run length.
   * Alternates from the current defence count so the buff/defence split stays even.
   */
  assignChaosRoleIfMissing() {
    if (!this._chaosRolesAssigned) return;             // not a Chaos run — leave roles alone
    let defence = 0;
    for (const m of this.matrices) if (m.chaosRole === 'defence') defence++;
    for (const m of this.matrices) {
      if (m.chaosRole) continue;
      const total = this.matrices.filter(x => x.chaosRole).length;
      m.chaosRole = (defence * 2 <= total) ? 'defence' : 'buff';
      if (m.chaosRole === 'defence') defence++;
      m._turretCd = 0.6 + (this.matrices.indexOf(m) % 3) * 0.3;
    }
  }

  // ─── Reward System ──────────────────────────────────────────────────────
  _emitRewards(player) {
    if (!player) return;
    for (const m of this.matrices) {
      // Only Nexus with stored > 0 can emit rewards
      if (m.stored <= 0) continue;
      // Φ14: DEFENCE bases never emit buff stars — their power goes to the turret/dome
      if (this.chaos && m.chaosRole === 'defence') continue;
      // Only emit if player is within range
      if (dist(m.pos, player.pos) > REWARD_PULSE_RADIUS) continue;

      // Spend 1 stored charge per reward pulse
      m.stored = Math.max(0, m.stored - 1);

      const reward = this.chaos ? pickChaosReward() : pickWeightedReward();
      const angle = Math.atan2(player.pos.y - m.pos.y, player.pos.x - m.pos.x);
      const speed = 200;

      this.rewardOrbs.push({
        pos: m.pos.clone(),
        vel: new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed),
        life: 12.0,                      // failsafe only — orbs now ALWAYS reach the player
        maxLife: 12.0,
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

      // DEAD-STRAIGHT pursuit (Maria: stars must visibly fly ONTO the player and land):
      // velocity is aimed directly at the player every frame, speed ramps 320→980.
      const dx = player.pos.x - orb.pos.x;
      const dy = player.pos.y - (orb.pos.y - 0) - 0;
      const d = Math.sqrt(dx * dx + dy * dy);
      orb._age = (orb._age || 0) + dt;
      const sp = Math.min(980, 320 + orb._age * 520);
      if (d > 1) {
        orb.vel.x = (dx / d) * sp;
        orb.vel.y = (dy / d) * sp;
        orb.pos.x += orb.vel.x * dt;
        orb.pos.y += orb.vel.y * dt;
      }
      // sparkle trail breadcrumbs (drawn in drawRewardOrbs)
      orb._trail = orb._trail || [];
      orb._trail.push({ x: orb.pos.x, y: orb.pos.y });
      if (orb._trail.length > 9) orb._trail.shift();

      // Collect ON the player (Game.js applies the reward and splices)
      if (d < 64) {
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
      // golden comet trail — makes the flight to the player unmistakable
      if (orb._trail && orb._trail.length > 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let ti = 0; ti < orb._trail.length - 1; ti++) {
          const tp = orb._trail[ti];
          const tk = ti / orb._trail.length;
          ctx.globalAlpha = tk * 0.55 * alpha;
          ctx.fillStyle = ti % 2 ? '#ffd23c' : '#fff6c0';
          ctx.beginPath(); ctx.arc(tp.x, tp.y, 2 + tk * 5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() * 0.008);
      const R = 20 * pulse;                       // BIG gold star (outer radius)
      const spin = performance.now() * 0.0015;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Soft gold glow
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(orb.pos.x, orb.pos.y, R * 0.2, orb.pos.x, orb.pos.y, R * 2.4);
      g.addColorStop(0, 'rgba(255,210,60,0.85)');
      g.addColorStop(1, 'rgba(255,170,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(orb.pos.x, orb.pos.y, R * 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Solid gold 5-point star
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(orb.pos.x, orb.pos.y);
      ctx.rotate(spin);
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (Math.PI / 5) * k - Math.PI / 2;
        const rad = (k % 2 === 0) ? R : R * 0.45;
        const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffd23c';
      ctx.fill();
      ctx.strokeStyle = '#fff6c0';
      ctx.lineWidth = 2;
      ctx.stroke();
      // bright center
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
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
