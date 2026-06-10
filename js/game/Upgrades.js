import { CYAN, YELLOW, ORANGE, BLUE, PURPLE, MAGENTA, GREEN, GREY, RED } from '../constants.js';

export class UpgradeDefinition {
  constructor(key, name, description, iconColor, maxLevel, applyFn, icon = null) {
    this.key         = key;
    this.name        = name;
    this.description = description;
    this.iconColor   = iconColor;
    this.maxLevel    = maxLevel;
    this._applyFn    = applyFn;
    this.icon        = icon || name[0];   // short symbol drawn on the card
  }

  apply(player) {
    // `|| 0` keeps newly-introduced keys (Max HP, Fire Rate, …) numeric even if
    // they were never seeded in Player.upgrades — avoids NaN breaking canApply().
    player.upgrades[this.key] = (player.upgrades[this.key] || 0) + 1;
    this._applyFn(player);
  }

  canApply(player) {
    return (player.upgrades[this.key] || 0) < this.maxLevel;
  }
}

// Curated pool — every card boosts a system the player actually uses. No stamina
// (stamina has no upgrade value) and no Sonic Pulse (its key is unbound).
export const ALL_UPGRADES = [
  // ── Offense ──────────────────────────────────────────────────────────────
  new UpgradeDefinition(
    'Pulse Damage', 'Damage Up', '+1 shot damage',
    MAGENTA, 6, () => {}, '✦'   // damage read from upgrades dict in Player.shoot()
  ),
  new UpgradeDefinition(
    'Fire Rate', 'Fire Rate', '+8% fire rate',
    ORANGE, 5, p => { p.fireRateBonus += 0.08; }, '»'
  ),
  new UpgradeDefinition(
    'Projectile Speed', 'Shot Speed', '+6% projectile speed',
    CYAN, 5, p => { p.projSpeedBonus += 0.06; }, '→'
  ),
  new UpgradeDefinition(
    'Cryo Rounds', 'Cryo Rounds', 'Shots slow enemies',
    BLUE, 4, () => {}, '❄'   // slow applied on projectile hit in Game._updateProjectiles
  ),
  new UpgradeDefinition(
    'Homing Disc', 'Homing Disc', 'Auto-homing shots',
    GREEN, 4, () => {}, '◉'
  ),
  // ── Survivability ────────────────────────────────────────────────────────
  new UpgradeDefinition(
    'Max HP', 'Vitality', '+20 max HP',
    RED, 5, p => { p.maxHp += 20; p.hp += 20; }, '+'
  ),
  new UpgradeDefinition(
    'Max Mana', 'Mana Cell', '+25 max mana',
    CYAN, 5, p => { p.maxMana += 25; p.mana += 25; }, '◆'
  ),
  new UpgradeDefinition(
    'Firewall Protection', 'Firewall', '-2% overload rate',
    PURPLE, 5, () => {}, 'F'   // overload dampening computed from upgrades dict
  ),
  new UpgradeDefinition(
    'EMP Cloud', 'EMP Cloud', 'E: bigger stun burst',
    GREY, 4, () => {}, 'E'
  ),
  // ── Mobility / Grid economy ────────────────────────────────────────────────
  new UpgradeDefinition(
    'Cyber-Legs', 'Move Speed', '+4% move speed',
    CYAN, 8, p => { p.speedBonus += 0.04; }, '⚡'
  ),
  new UpgradeDefinition(
    'Tractor Beam', 'Magnet', '+10 pickup range',
    BLUE, 6, p => { p.pickupRadius += 10; }, '◎'
  ),
  new UpgradeDefinition(
    'Memory Bank', 'Core Slots', '+1 core carry slot',
    YELLOW, 8, p => { p.maxCarry++; }, '▣'
  ),
  new UpgradeDefinition(
    'Quantum Overhaul', 'Auto-Recover', 'Auto-recovers cores',
    ORANGE, 4, () => {}, '↻'
  ),
];

// ─── Weighted sample: prefer upgrades not yet taken ──────────────────────────
export function weightedSample(player, n = 3) {
  const eligible = ALL_UPGRADES.filter(u => u.canApply(player));
  if (!eligible.length) return [];

  const weights = eligible.map(u => (player.upgrades[u.key] ?? 0) === 0 ? 3 : 1);
  const total   = weights.reduce((a, b) => a + b, 0);
  const chosen  = [];
  const pool    = [...eligible];
  const poolW   = [...weights];

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
