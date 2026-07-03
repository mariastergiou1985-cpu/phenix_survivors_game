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

import { EventBus, EVENTS } from './EventBus.js?v=20260702700000';

// ─── Enemy Pool Tables ──────────────────────────────────────────────────────
// Each tier: { from: seconds, pool: string[] }
// Pool is passed to randomChoice() — duplicates = higher weight.
const ACT1_POOLS = [
  { from: 0,   pool: ['Scrap Scavenger', 'Scrap Scavenger', 'Combat Hunter', 'Glitch Drone'] },
  { from: 60,  pool: ['Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Scrap Scavenger'] },
  { from: 90,  pool: ['Combat Hunter', 'Combat Hunter', 'Cyber Shooter', 'Scrap Scavenger', 'Scrap Scavenger'] },
  { from: 180, pool: ['Combat Hunter', 'Combat Hunter', 'Cyber Shooter', 'Cyber Shooter', 'Scrap Scavenger', 'Cyber-Net Junkie', 'Rogue Punk'] },
  { from: 360, pool: ['Combat Hunter', 'Cyber Shooter', 'Stealth Infiltrator', 'Scrap Scavenger', 'Cyber-Net Junkie', 'Rogue Punk'] },
  { from: 600, pool: ['Combat Hunter', 'Cyber Shooter', 'Overclocked Berserker', 'Scrap Scavenger', 'Cyber-Net Junkie', 'Rogue Punk'] },
  { from: 900, pool: ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Scrap Scavenger', 'Rogue Punk'] },
  { from: 1200, pool: ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Cyber-Net Junkie', 'Rogue Punk'] },
  { from: 1500, pool: ['Overclocked Berserker', 'Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Cyber-Net Junkie', 'Rogue Punk'] },
];

const CHAOS_POOL = [
  'Overclocked Berserker', 'Overclocked Berserker',
  'Combat Hunter',         'Combat Hunter',
  'Cyber Shooter',         'Cyber Shooter',
  'Heavy Mech',            'Heavy Mech',
  'Cyber-Net Junkie',      'Stealth Infiltrator',
  'Scrap Scavenger',
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
  pool: ['Combat Hunter', 'Cyber Shooter', 'Heavy Mech', 'Overclocked Berserker', 'Stealth Infiltrator'],
};

// ─── Population Cap Curve ───────────────────────────────────────────────────
// Five pressure tiers so the map is never empty for long.
export const CAP_TIERS = [
  { from: 0,  base: 28,  perMin: 8  },   // 28 → 36   light
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
    if (minute < 2)       cap = 28 + minute * 8;
    else if (minute < 5)  cap = 44 + (minute - 2) * 12;
    else if (minute < 10) cap = 80 + (minute - 5) * 14;
    else if (minute < 20) cap = 150 + (minute - 10) * 10;
    else                  cap = Math.min(280, 250 + (minute - 20) * 5);

    if (mode.endless) cap = Math.min(400, Math.round(cap * 2.5) + 50);
    if (mode.chaos)   cap = Math.min(280, Math.round(cap * 1.3));
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
    if (mode.chaos)   iv = Math.max(0.06, iv / 1.5);
    return iv * (mode.spawnRateMult || 1);
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
    let count = minute < 2 ? 3 : minute < 5 ? 4 : minute < 10 ? 5 : 6;
    // Endless: bigger batches to fill the larger visible area
    if (mode.endless) count += 3;
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
      return randomChoice(CHAOS_POOL);
    }

    // ── Act 1 / Endless: time-tiered pools ───────────────────────────────
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

// ─── Exported Pool Data (for future biome-specific overrides) ────────────
export { ACT1_POOLS, CHAOS_POOL };
