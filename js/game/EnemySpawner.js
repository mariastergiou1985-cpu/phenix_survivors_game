// ─── EnemySpawner.js ──────────────────────────────────────────────────────
// Decoupled enemy-spawning orchestrator. Owns:
//   • time-based enemy pool tables (Act 1, Endless, Chaos)
//   • population cap curve
//   • spawn-rate curve
//   • chooseEnemyType() logic
//   • _updateSpawning() tick
//   • elite-wave config
//   • boss rearm helpers
// Game.js delegates to this module; boss-specific _spawn* methods stay in
// Game.js until Phase 2 when each boss gets its own class.
// ──────────────────────────────────────────────────────────────────────────

import { EventBus, EVENTS } from './EventBus.js?v=20260703990000';

// Mobile detection (touch / coarse pointer). On phones the full desktop density (up to 340
// enemies) tanks the framerate and can crash — so enemyCap() clamps hard when this is true.
// Desktop is completely unaffected.
const IS_MOBILE = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

// ─── Enemy Pool Tables ──────────────────────────────────────────────────────
// Each tier: { from: seconds, pool: string[] }
// Pool is passed to randomChoice() — duplicates = higher weight.
const ACT1_POOLS = [
  { from: 0,   pool: ['Scrap Scavenger', 'Combat Hunter', 'Glitch Drone', 'Rogue Punk', 'Volt Rat', 'Cryo Claw', 'Cyber Shooter', 'Stealth Infiltrator'] },
  { from: 60,  pool: ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator', 'Volt Rat', 'Cryo Claw', 'Toxin Leech'] },
  { from: 90,  pool: ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator', 'Overclocked Berserker', 'Volt Rat', 'Solar Stinger', 'Ember Scarab'] },
  { from: 180, pool: ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator', 'Overclocked Berserker', 'Cyber-Net Junkie', 'Solar Stinger', 'Amethyst Fang', 'Ember Scarab', 'Volt Rat'] },
  { from: 360, pool: ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator', 'Overclocked Berserker', 'Cyber-Net Junkie', 'Heavy Mech', 'Pulse Burrower', 'Rift Eye', 'Void Widow', 'Solar Stinger'] },
  { from: 600, pool: ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator', 'Overclocked Berserker', 'Cyber-Net Junkie', 'Heavy Mech', 'Abyss Maw', 'Void Widow', 'Amethyst Fang', 'Pulse Burrower'] },
  { from: 900, pool: ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator', 'Overclocked Berserker', 'Heavy Mech', 'Cyber-Net Junkie', 'Abyss Maw', 'Rift Eye', 'Ember Scarab', 'Void Widow', 'Volt Rat', 'Razorhound'] },
  { from: 1200, pool: ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator', 'Overclocked Berserker', 'Heavy Mech', 'Cyber-Net Junkie', 'Abyss Maw', 'Amethyst Fang', 'Solar Stinger', 'Pulse Burrower', 'Toxin Leech', 'Cryo Claw'] },
  { from: 1500, pool: ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Glitch Drone', 'Rogue Punk', 'Stealth Infiltrator', 'Overclocked Berserker', 'Heavy Mech', 'Cyber-Net Junkie', 'Abyss Maw', 'Void Widow', 'Rift Eye', 'Ember Scarab', 'Amethyst Fang', 'Solar Stinger', 'Volt Rat', 'Pulse Burrower', 'Toxin Leech', 'Cryo Claw', 'Razorhound', 'Solar Tyrant'] },
];

// #81 — Complete Chaos roster: EVERY enemy family is eligible in Chaos (Act 1 + Endless + new
// Chaos enemies), weighted so swarm/chaser pressure is common and heavies/elites are rarer.
// Bosses/mega-bosses/titans arrive via their own systems (chooseEnemyType inserts, ELITE_WAVE,
// Events mega_boss, chaos-titan scheduler, Boss Rush) — this pool is the standard population.
const CHAOS_POOL = [
  // ── Melee / chaser pressure (common) ──
  'Combat Hunter',         'Combat Hunter',
  'Overclocked Berserker', 'Overclocked Berserker',
  'Rogue Punk',            'Stealth Infiltrator',
  'Cyber-Axe Executioner', 'Cyber-Axe Executioner',
  // ── Ranged / shooters (medium) ──
  'Cyber Shooter',         'EMP Hacker Drone',      'EMP Hacker Drone',
  'Wireframe Net-Caster',  'Solar Stinger',
  // ── Swarm (very common) ──
  'Neon Swarmer',          'Neon Swarmer',          'Neon Swarmer',
  'Glitch Drone',          'Volt Rat',              'Scrap Scavenger',
  // ── Suicide / bombers ──
  'Overclocked Bomber',    'Overclocked Bomber',
  // ── Zoners / DoT / area denial ──
  'Malware Spreader',      'Toxin Leech',           'Cryo Claw',
  'Void Rift Summoner',    'Data Glitch Stalker',   'Data Glitch Stalker',
  // ── Heavies / elites (rarer) ──
  'Heavy Mech',            'Plasma Juggernaut',     'Singularity Core Mech',
  'Cyber-Net Junkie',      'Abyss Maw',             'Void Widow',
  'Razorhound',            'Razorhound',            'Solar Tyrant',
  'Amethyst Fang',         'Ember Scarab',          'Rift Eye',
  'Pulse Burrower',
];

// ─── Elite Wave Config ──────────────────────────────────────────────────────
export const ELITE_WAVE = {
  firstDelay:   90,
  interval:    110,
  baseBatch:     3,
  batch10min:    4,
  batch20min:    5,
  hpMult:      2.0,
  speedMult:   1.10,
  radiusMult:  1.20,
  pool: ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Stealth Infiltrator', 'Glitch Drone', 'Rogue Punk', 'Abyss Maw', 'Void Widow', 'Ember Scarab', 'Amethyst Fang', 'Solar Stinger', 'Rift Eye', 'Cryo Claw', 'Toxin Leech', 'Volt Rat', 'Pulse Burrower', 'Razorhound', 'Solar Tyrant'],
};

// ─── Population Cap Curve ───────────────────────────────────────────────────
// Five pressure tiers so the map is never empty for long.
export const CAP_TIERS = [
  { from: 0,  base: 38,  perMin: 10 },   // 38 → 58   light
  { from: 2,  base: 44,  perMin: 12 },   // 44 → 80   constant
  { from: 5,  base: 80,  perMin: 14 },   // 80 → 150  groups
  { from: 10, base: 150, perMin: 10 },   // 150 → 250 continuous
  { from: 20, base: 250, perMin: 5, cap: 280 }, // heavy chaos, perf-capped
];

export const BOSS_WARN_COOLDOWN = 90;

// ─── Helpers ────────────────────────────────────────────────────────────────
function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── EnemySpawner Class ─────────────────────────────────────────────────────
export class EnemySpawner {
  /**
   * @param {object} opts
   * @param {object} opts.game  - Game instance reference
   * @param {EventBus} [opts.events] - optional EventBus for decoupled notifications
   */
  constructor({ game, events = null }) {
    this.game   = game;
    this.events = events;
  }

  // ─── Population Cap ─────────────────────────────────────────────────────
  /**
   * Dynamic enemy cap based on game time and mode.
   * @param {number} minute - current game minute
   * @param {object} mode - { endless: bool, chaos: bool }
   * @returns {number}
   */
  enemyCap(minute, mode = {}) {
    let cap;
    if (minute < 2)       cap = 38 + minute * 10;
    else if (minute < 5)  cap = 44 + (minute - 2) * 12;
    else if (minute < 10) cap = 80 + (minute - 5) * 14;
    else if (minute < 20) cap = 150 + (minute - 10) * 10;
    else                  cap = Math.min(420, 250 + (minute - 20) * 8);   // Π1 horde pass: late Act-1 crowds

    // HORDE REBUILD §26: Act 1 πρέπει να χωρά τα targetAlive των wave tables (έως 265
    // στο Final Collapse) — ×1.6 με ταβάνι 520. Endless/Chaos/mobile clamps ως είχαν.
    if (!mode.endless && !mode.chaos) cap = Math.min(520, Math.round(cap * 1.6));
    // Π1 HORDE PASS (Maria: reach VS-scale crowds) — enabled by the per-frame spatial grid
    // (projectile/bolt collisions no longer scan every enemy) + existing offscreen draw-cull.
    if (mode.endless) cap = Math.min(900, Math.round(cap * 3.2) + 80);
    if (mode.chaos)   cap = Math.min(800, Math.round(cap * 2.8) + 60);   // CHAOS SURGE: a true flood
    if (IS_MOBILE)    cap = Math.min(cap, 260);                          // phones: 2.6x the old ceiling (grid + cull carry it)
    return cap;
  }

  // ─── Spawn Interval ─────────────────────────────────────────────────────
  /**
   * Time between spawn ticks.
   * @param {number} minute
   * @param {object} mode - { endless, chaos, spawnRateMult }
   * @returns {number} seconds
   */
  spawnInterval(minute, mode = {}) {
    let iv = Math.max(0.16, 0.5 - minute * 0.025);
    if (mode.endless) iv = Math.max(0.04, iv * 0.30);
    if (mode.chaos)   iv = Math.max(0.045, iv / 2.4);   // CHAOS SURGE: respawn outpaces even Eddie's clear speed
    // BALANCE (Maria): characters got strong — pressure comes from DENSITY, not damage nerfs.
    // +15% spawn rate in every mode; the global 340-enemy hard cap + culling keep perf safe.
    return (iv / 1.5) * (mode.spawnRateMult || 1);   // pressure pass 2: +50% density (was +15%) — Maria: 'poli ligi i exthroi'
  }

  // ─── Spawn Batch Size ───────────────────────────────────────────────────
  /**
   * How many enemies to spawn per tick.
   * @param {number} minute
   * @param {number} currentCount - current enemy count
   * @param {number} cap - current enemy cap
   * @returns {number}
   */
  spawnBatchSize(minute, currentCount, cap, mode = {}) {
    let count = minute < 2 ? 5 : minute < 5 ? 4 : minute < 10 ? 5 : 6;
    // Endless: bigger batches to fill the larger visible area
    if (mode.endless) count += 3;
    if (mode.chaos)   count += 4;   // CHAOS SURGE: bigger batches
    // Catch-up surge if battlefield is below 70% cap
    if (currentCount < cap * 0.7) count += 4;
    return count;
  }

  // ─── Choose Enemy Type ──────────────────────────────────────────────────
  /**
   * Select an enemy type from the time-based pool.
   * @param {number} timeAlive - seconds alive
   * @param {object} ctx - { chaos, enemies, megaBoss }
   * @returns {string} enemy type name
   */
  chooseEnemyType(timeAlive, ctx = {}) {
    const minute = Math.floor(timeAlive / 60);

    // ── Chaos Mode: full late-game pool ──────────────────────────────────
    if (ctx.chaos) {
      if (!ctx.megaBoss && !ctx.enemies?.some(e => e.enemyType === 'Rogue AI Overlord'))
        return 'Rogue AI Overlord';
      if (!ctx.enemies?.some(e => e.enemyType === 'Security Defector Mech') && Math.random() < 0.12)
        return 'Security Defector Mech';
      // VARIETY DIRECTOR (Maria): rotate the WHOLE roster — reroll against the last
      // FOUR picks (up to 5 tries), so the same few commons can never dominate the field.
      this._chaosHistory = this._chaosHistory || [];
      let pick = randomChoice(CHAOS_POOL);
      for (let tr = 0; tr < 5 && this._chaosHistory.includes(pick); tr++) pick = randomChoice(CHAOS_POOL);
      this._chaosHistory.push(pick);
      if (this._chaosHistory.length > 4) this._chaosHistory.shift();
      return pick;
    }

    // ── Act 1 / Endless: time-tiered pools ───────────────────────────────
    // ENDLESS VARIETY (Maria): the full roster unlocks far sooner — Endless walks the
    // tier ladder at 2x speed with a +4min head start, so heavies/elites/zoners show
    // up in the first minutes instead of after 15-25.
    if (ctx.endless) timeAlive = timeAlive * 2 + 240;
    // Special boss insertions for mid/late tiers
    if (minute >= 10 && minute < 15) {
      if (!ctx.enemies?.some(e => e.enemyType === 'Heavy Mech'))
        return 'Heavy Mech';
    }
    if (minute >= 15 && minute < 20) {
      if (!ctx.enemies?.some(e => e.enemyType === 'Security Defector Mech'))
        return 'Security Defector Mech';
    }
    if (minute >= 25) {
      if (!ctx.enemies?.some(e => e.enemyType === 'Rogue AI Overlord') && !ctx.megaBoss)
        return 'Rogue AI Overlord';
    }

    // Find the matching pool tier (walk backwards to find highest applicable)
    let pool = ACT1_POOLS[0].pool;
    for (const tier of ACT1_POOLS) {
      if (timeAlive >= tier.from) pool = tier.pool;
      else break;
    }
    return randomChoice(pool);
  }

  // ─── Elite Wave Batch Size ──────────────────────────────────────────────
  eliteWaveBatch(elapsedEndless) {
    if (elapsedEndless >= 20 * 60) return ELITE_WAVE.batch20min;
    if (elapsedEndless >= 10 * 60) return ELITE_WAVE.batch10min;
    return ELITE_WAVE.baseBatch;
  }

  // ─── Boss Rearm ─────────────────────────────────────────────────────────
  /**
   * Check if a boss slot can be rearmed and reset its spawn flag.
   * Returns true if rearmed, false if the boss is still alive.
   * @param {string} slot
   * @param {object} state - boss references and flags from Game
   * @returns {boolean}
   */
  canRearmBoss(slot, state) {
    switch (slot) {
      case 'titan':
        return !state.titanBoss || state.titanBoss.hp <= 0;
      case 'annihilator':
        return !state.annihilatorBoss || state.annihilatorBoss.hp <= 0;
      case 'bloodfang':
        return !state.bloodfangBoss || state.bloodfangBoss.hp <= 0;
      case 'doubleDemon':
        return !state.doubleDemonsBoss || state.doubleDemonsBoss.hp <= 0;
      case 'cyberSerpent':
        return !state.cyberSerpentBoss || state.cyberSerpentBoss.hp <= 0;
      case 'cyberDragon':
        return !state.cyberDragonBoss || state.cyberDragonBoss.hp <= 0;
      default:
        return false;
    }
  }

  // ─── Boss Rearm Delays ──────────────────────────────────────────────────
  static BOSS_REARM_DELAY = {
    titan:        0,
    annihilator:  0,
    bloodfang:    0,
    doubleDemon:  0,   // DD_SPAWN_DELAY
    cyberSerpent: 20,
    cyberDragon:  25,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ROADMAP MILESTONE 2 / Slice B — STAGE-SPECIFIC ENEMY SUB-POOLS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// This is the consumer the "for future biome-specific overrides" export below was always waiting
// for. Until now every Act 1 stage and every campaign stage spawned the IDENTICAL roster — the only
// per-biome difference was hpMult/speedMult/regenRate on the enemy that came out. Different picture,
// same enemies.
//
// HOW IT PLUGS IN — this is a POST-SELECTION REMAP, not a second spawn system. The existing
// machinery still does all the work: WaveDirector picks the block, the formation, the position, the
// batch size, the elite flag and the type; EnemySpawner.chooseEnemyType still owns the tier ladder
// and the boss insertions; enemyCap()/targetAlive/interval still own the budget. Only AFTER a type
// has been chosen by that machinery does `applyBiomePool` swap it for the biome's own equivalent.
// Nothing about difficulty scaling, spawn caps, elite rules, event overrides or the boss flow moves.
//
// FAMILY PRESERVATION is what keeps the formations meaningful. A HEAVY_COLUMN that asked for a heavy
// still gets a heavy — Industrial Core answers with a Heavy Mech, Glacial Expanse with an Abyss Maw.
// A RANGED_POCKET still gets a ranged. So the biome changes WHICH enemies fill a role, never WHICH
// roles the wave director asked for.
//
// Every id below is an existing, shipping enemy with existing art. No new PNG, no placeholder, no
// invented id — `batch4_5_biome_enemy_pools_regression.mjs` proves that against the real catalog.

/** Spawn family per enemy type — mirrors Enemy._archetypeForType, with shield/charger folded into
 *  heavy so the five families here match the five HINT_POOLS categories the formations request. */
const SPAWN_FAMILY = Object.freeze({
  'Glitch Drone': 'fodder', 'Volt Rat': 'fodder',
  'Rogue Punk': 'swarm', 'Scrap Scavenger': 'swarm', 'Cyber-Net Junkie': 'swarm',
  'Ember Scarab': 'swarm', 'Pulse Burrower': 'swarm', 'Cryo Claw': 'swarm',
  'Combat Hunter': 'fast', 'Stealth Infiltrator': 'fast', 'Overclocked Berserker': 'fast',
  'Solar Stinger': 'fast', 'Toxin Leech': 'fast', 'Amethyst Fang': 'fast', 'Razorhound': 'fast',
  'Heavy Mech': 'heavy', 'Solar Tyrant': 'heavy', 'Void Widow': 'heavy', 'Abyss Maw': 'heavy',
  'Cyber Shooter': 'ranged', 'Rift Eye': 'ranged',
});

/** Types that must NEVER be produced by a normal biome spawn. Bosses, the mini boss, the Chaos Mega
 *  Titans, the Chaos-only roster and the event-only Cybermote. A type in this set is passed through
 *  untouched, so the tier-ladder boss insertions and _spawnStageBoss keep working exactly as before. */
const BIOME_POOL_EXCLUDED = Object.freeze(new Set([
  // boss / mini boss / mega boss
  'Rogue AI Overlord', 'Security Defector Mech',
  'Giga-Core Overlord', 'Malware Leviathan', 'Quantum Void Emperor', 'Apocalypse Mech Tyrant',
  // event-only
  'Cybermote',
  // Chaos-only roster
  'Neon Swarmer', 'Data Glitch Stalker', 'Plasma Juggernaut', 'Overclocked Bomber',
  'EMP Hacker Drone', 'Cyber-Axe Executioner', 'Malware Spreader', 'Void Rift Summoner',
  'Wireframe Net-Caster', 'Singularity Core Mech',
]));

// E(id, weight, family, minStageTime, maxStageTime) — `minStageTime`/`maxStageTime` are SECONDS INTO
// THE CURRENT 80s STAGE, so late entries are the stage's own escalation rather than a global clock.
const E = (id, weight, family, minStageTime = 0, maxStageTime = Infinity) =>
  Object.freeze({ id, weight, family, minStageTime, maxStageTime });

/**
 * biome → weighted sub-pool. Every biome carries all five families, which guarantees a
 * family-preserving remap can always resolve and no pool can ever be empty for a requested role.
 */
const CAMPAIGN_BIOME_ENEMY_POOLS = Object.freeze({
  // 1 · NEON DISTRICT — the introduction stage. Fast light melee + a little ranged harassment,
  // lowest pressure of the ring. The single heavy is rare and arrives only in the last third.
  neon_district: Object.freeze([
    E('Glitch Drone', 4, 'fodder'), E('Volt Rat', 3, 'fodder'),
    E('Rogue Punk', 4, 'swarm'), E('Scrap Scavenger', 2, 'swarm'),
    E('Stealth Infiltrator', 3, 'fast'), E('Combat Hunter', 2, 'fast', 30),
    E('Cyber Shooter', 2, 'ranged', 15),
    E('Heavy Mech', 1, 'heavy', 55),
  ]),
  // 2 · INDUSTRIAL CORE — mechanical pressure: armoured bodies and chargers, not a swarm stage.
  // Heavy weight is the highest of the ring and the Solar Tyrant closes the stage out.
  industrial_core: Object.freeze([
    E('Glitch Drone', 2, 'fodder'),
    E('Scrap Scavenger', 4, 'swarm'), E('Pulse Burrower', 3, 'swarm'),
    E('Overclocked Berserker', 3, 'fast'), E('Combat Hunter', 2, 'fast'),
    E('Cyber Shooter', 2, 'ranged'),
    E('Heavy Mech', 3, 'heavy'), E('Solar Tyrant', 1, 'heavy', 50),
  ]),
  // 3 · ORBITAL NEXUS — drones and precision projectile pressure. Only Cyber Shooter and Rift Eye
  // actually fire as non-elites, so readability holds: this is technical spacing, not bullet spam.
  orbital_nexus: Object.freeze([
    E('Glitch Drone', 4, 'fodder'), E('Volt Rat', 2, 'fodder'),
    E('Cyber-Net Junkie', 2, 'swarm'),
    E('Solar Stinger', 3, 'fast'), E('Amethyst Fang', 2, 'fast', 20), E('Combat Hunter', 1, 'fast'),
    E('Cyber Shooter', 3, 'ranged'), E('Rift Eye', 2, 'ranged', 25),
    E('Void Widow', 2, 'heavy'),
  ]),
  // 4 · ABYSSAL TRENCH — claustrophobic swarm with toxin/void bodies. The one ambush predator
  // (Razorhound) is gated to the last half so the player is never boxed in unfairly at the start.
  abyssal_trench: Object.freeze([
    E('Glitch Drone', 2, 'fodder'),
    E('Cyber-Net Junkie', 4, 'swarm'), E('Cryo Claw', 3, 'swarm'),
    E('Toxin Leech', 4, 'fast'), E('Razorhound', 1, 'fast', 45),
    E('Rift Eye', 2, 'ranged'),
    // Abyss Maw at 4 (not 3) is the one measured tune in this table: at 3 the pool-axis mean HP of
    // abyssal_trench (6.1) sat just under orbital_nexus (6.7) and broke the ring's upward ramp.
    E('Abyss Maw', 4, 'heavy'), E('Void Widow', 2, 'heavy'),
  ]),
  // 5 · GLACIAL EXPANSE — slow, durable targets. Cryo Claw is the only freeze-flavoured body and it
  // is not stacked with a second one, so control effects stay readable instead of piling up.
  glacial_expanse: Object.freeze([
    E('Glitch Drone', 2, 'fodder'),
    E('Cryo Claw', 4, 'swarm'), E('Scrap Scavenger', 3, 'swarm'),
    E('Combat Hunter', 2, 'fast'), E('Stealth Infiltrator', 1, 'fast'),
    E('Cyber Shooter', 2, 'ranged'),
    E('Abyss Maw', 3, 'heavy'), E('Heavy Mech', 2, 'heavy'), E('Solar Tyrant', 1, 'heavy', 50),
  ]),
  // 6 · DATA WASTES — the unstable late-campaign mix: fast bodies, the most ranged weight of the
  // ring, and two heavies. Harder than everything before it, deliberately short of Chaos density.
  data_wastes: Object.freeze([
    E('Volt Rat', 3, 'fodder'),
    E('Ember Scarab', 3, 'swarm'), E('Rogue Punk', 2, 'swarm'),
    E('Overclocked Berserker', 3, 'fast'), E('Combat Hunter', 2, 'fast'),
    E('Razorhound', 2, 'fast', 25), E('Amethyst Fang', 1, 'fast'),
    E('Cyber Shooter', 2, 'ranged'), E('Rift Eye', 2, 'ranged', 20),
    E('Void Widow', 2, 'heavy'), E('Heavy Mech', 2, 'heavy'),
  ]),
});

/** The family a type belongs to for remap purposes, or null if it has no biome family. */
function spawnFamilyOf(type) { return SPAWN_FAMILY[type] || null; }

/**
 * Remap an ALREADY-CHOSEN enemy type to this biome's equivalent of the same family.
 *
 * @param {string}   type       the type the existing machinery chose
 * @param {string|null} biome   active campaign biome id, or null/unknown
 * @param {number}   stageT     seconds elapsed inside the current 80s stage
 * @param {function} rnd        RNG in [0,1). Defaults to Math.random — the SAME source the rest of
 *                              the spawn path already uses, so no new randomness is introduced. The
 *                              parameter exists so tests can drive it deterministically with a seed.
 * @returns {string} the biome type, or `type` unchanged on any miss. NEVER undefined.
 */
export function pickBiomeEnemy(type, biome, stageT = 0, rnd = Math.random) {
  // ── Fallbacks, in order. Any of these returns the untouched input, so an unknown biome, a
  // malformed table or a boss type simply behaves exactly like the pre-Slice-B build. ──
  if (typeof type !== 'string' || !type) return type;
  if (BIOME_POOL_EXCLUDED.has(type)) return type;              // bosses / event / chaos-only
  const pool = (biome && CAMPAIGN_BIOME_ENEMY_POOLS[biome]) || null;
  if (!Array.isArray(pool) || pool.length === 0) return type;  // unknown/null biome → canonical pool

  const t = Number.isFinite(stageT) ? Math.max(0, stageT) : 0;
  const live = [];
  for (const e of pool) {
    if (!e || typeof e.id !== 'string' || !(e.weight > 0)) continue;   // malformed entry → skipped
    if (BIOME_POOL_EXCLUDED.has(e.id)) continue;                       // belt & braces
    const lo = Number.isFinite(e.minStageTime) ? e.minStageTime : 0;
    const hi = Number.isFinite(e.maxStageTime) ? e.maxStageTime : Infinity;
    if (t < lo || t > hi) continue;
    live.push(e);
  }
  if (live.length === 0) return type;

  // Prefer the SAME family, so the formation that asked for a heavy still gets a heavy.
  const fam = spawnFamilyOf(type);
  let cand = fam ? live.filter(e => e.family === fam) : [];
  if (cand.length === 0) cand = live;                          // biome has no such family yet → any

  let total = 0;
  for (const e of cand) total += e.weight;
  if (!(total > 0)) return type;
  let r = rnd() * total;
  for (const e of cand) { r -= e.weight; if (r <= 0) return e.id; }
  return cand[cand.length - 1].id;                             // float guard — never undefined
}

/** Read-only view of a biome's sub-pool (used by QA + tooling). Empty array for unknown ids. */
export function biomeEnemyPool(biome) {
  const p = biome && CAMPAIGN_BIOME_ENEMY_POOLS[biome];
  return Array.isArray(p) ? p : [];
}

// ─── Exported Pool Data (for future biome-specific overrides) ────────────
export { ACT1_POOLS, CHAOS_POOL, CAMPAIGN_BIOME_ENEMY_POOLS, BIOME_POOL_EXCLUDED, SPAWN_FAMILY };
