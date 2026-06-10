import { CYAN, YELLOW, ORANGE, BLUE, PURPLE, MAGENTA, GREEN, GREY, RED } from '../constants.js';

// Rarity → neon accent color (border/glow). Common reads cyan/white, then blue, purple, gold.
export const RARITY_COLORS = {
  common:    '#8be9ff',
  rare:      '#4aa3ff',
  epic:      '#b66bff',
  legendary: '#ffd23c',
};

export class UpgradeDefinition {
  constructor(key, name, description, iconColor, maxLevel, applyFn, icon = null, rarity = 'common') {
    this.key         = key;
    this.name        = name;
    this.description = description;
    this.iconColor   = iconColor;
    this.maxLevel    = maxLevel;
    this._applyFn    = applyFn;
    this.icon        = icon || name[0];   // short symbol/emoji drawn on the card
    this.rarity      = rarity;
  }

  apply(player) {
    // `|| 0` keeps newly-introduced keys numeric even if never seeded in Player.upgrades.
    player.upgrades[this.key] = (player.upgrades[this.key] || 0) + 1;
    this._applyFn(player);
  }

  canApply(player) {
    return (player.upgrades[this.key] || 0) < this.maxLevel;
  }
}

// Curated pool — every card creates a noticeable improvement to a system the player uses.
// No stamina cards, no unbound abilities. (Burn Amplifier intentionally omitted: there is
// no general burn/DoT system to amplify, and adding one is out of scope for this pass.)
export const ALL_UPGRADES = [
  // ── Offense ──────────────────────────────────────────────────────────────
  new UpgradeDefinition(
    'Fire Rate', 'Rapid Fire', '+10% fire rate',
    ORANGE, 5, p => { p.fireRateBonus += 0.10; }, '⚡', 'common'
  ),
  new UpgradeDefinition(
    'Pulse Damage', 'Precision', '+1 shot damage',
    MAGENTA, 6, () => {}, '🎯', 'rare'   // damage read from upgrades dict in Player.shoot()
  ),
  new UpgradeDefinition(
    'Projectile Speed', 'Velocity', '+7% projectile speed',
    CYAN, 5, p => { p.projSpeedBonus += 0.07; }, '🚀', 'common'
  ),
  new UpgradeDefinition(
    'Cryo Rounds', 'Cryo Rounds', 'Shots slow enemies',
    BLUE, 4, () => {}, '❄️', 'rare'   // slow applied on projectile hit in Game._updateProjectiles
  ),
  new UpgradeDefinition(
    'Suppression', 'Suppression', 'Slows hit harder & longer',
    PURPLE, 3, () => {}, '🌀', 'epic'  // amplifies the slow applied on hit
  ),
  new UpgradeDefinition(
    'Glacial Shatter', 'Glacial Shatter', 'Slowed enemies shatter in a frost burst',
    BLUE, 3, () => {}, '🧊', 'epic'  // shatter rolled on hitting an already-slowed enemy in Game._updateProjectiles
  ),
  new UpgradeDefinition(
    'Homing Disc', 'Homing Disc', 'Auto-homing shots',
    GREEN, 4, () => {}, '◉', 'rare'
  ),
  // ── Survivability ────────────────────────────────────────────────────────
  new UpgradeDefinition(
    'Max HP', 'Fortress', '+20 max HP',
    RED, 5, p => { p.maxHp += 20; p.hp += 20; }, '❤️', 'epic'
  ),
  new UpgradeDefinition(
    'Max Mana', 'Mana Core', '+15 max mana',
    CYAN, 5, p => { p.maxMana += 15; p.mana += 15; }, '💙', 'rare'
  ),
  new UpgradeDefinition(
    'Firewall Protection', 'Firewall', '-2% overload rate',
    PURPLE, 5, () => {}, 'F', 'common'   // overload dampening computed from upgrades dict
  ),
  new UpgradeDefinition(
    'EMP Cloud', 'EMP Cloud', 'E: bigger stun burst',
    GREY, 4, () => {}, 'E', 'common'
  ),
  // ── Grid economy / Mobility ─────────────────────────────────────────────────
  new UpgradeDefinition(
    'Grid Investor', 'Grid Investor', '+10% Grid Credits, +2% Gold Core',
    YELLOW, 5, () => {}, '💰', 'legendary'  // credits ×Game._awardCredits; Gold chance ×PowerMatrix.stealCore
  ),
  new UpgradeDefinition(
    'Cyber-Legs', 'Move Speed', '+4% move speed',
    CYAN, 8, p => { p.speedBonus += 0.04; }, '»', 'common'
  ),
  new UpgradeDefinition(
    'Tractor Beam', 'Magnet', '+10 pickup range',
    BLUE, 6, p => { p.pickupRadius += 10; }, '◎', 'common'
  ),
  new UpgradeDefinition(
    'Memory Bank', 'Core Slots', '+1 core carry slot',
    YELLOW, 8, p => { p.maxCarry++; }, '▣', 'common'
  ),
  new UpgradeDefinition(
    'Quantum Overhaul', 'Auto-Recover', 'Auto-recovers cores',
    ORANGE, 4, () => {}, '↻', 'rare'
  ),
  new UpgradeDefinition(
    'Auto-Forge Drone', 'Auto-Forge Drone', 'Deploys a persistent combat drone',
    ORANGE, 2, () => {}, '🛸', 'legendary'  // persistent ally drones spawned/updated in Game._updateAllyDrones
  ),
];

// ─── Weighted sample: every card is useful; bias toward the player's current build ──
// New cards stay common (weight 3); cards already invested in are weighted higher so
// the offered set leans into the build the player is forming (and reroll does the same).
export function weightedSample(player, n = 3) {
  const eligible = ALL_UPGRADES.filter(u => u.canApply(player));
  if (!eligible.length) return [];

  const weightOf = u => {
    const lvl = player.upgrades[u.key] || 0;
    return lvl === 0 ? 3 : 2 + lvl;
  };

  const chosen = [];
  const pool   = [...eligible];
  const poolW  = eligible.map(weightOf);

  for (let i = 0; i < Math.min(n, pool.length); i++) {
    let r   = Math.random() * poolW.reduce((a, b) => a + b, 0);
    let idx = 0;
    while (r > poolW[idx]) { r -= poolW[idx]; idx++; }
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
    poolW.splice(idx, 1);
  }

  return chosen;
}
