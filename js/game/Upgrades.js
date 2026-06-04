import { CYAN, YELLOW, ORANGE, BLUE, PURPLE, MAGENTA, WHITE, GREEN, GREY } from '../constants.js';

export class UpgradeDefinition {
  constructor(key, name, description, iconColor, maxLevel, applyFn) {
    this.key         = key;
    this.name        = name;
    this.description = description;
    this.iconColor   = iconColor;
    this.maxLevel    = maxLevel;
    this._applyFn    = applyFn;
  }

  apply(player) {
    player.upgrades[this.key]++;
    this._applyFn(player);
  }

  canApply(player) {
    return (player.upgrades[this.key] ?? 0) < this.maxLevel;
  }
}

export const ALL_UPGRADES = [
  new UpgradeDefinition(
    'Cyber-Legs', 'Cyber-Legs', '+3% move speed per level',
    CYAN, 8, p => { p.speedBonus += 0.03; }
  ),
  new UpgradeDefinition(
    'Memory Bank', 'Memory Bank', '+1 core carry slot',
    YELLOW, 8, p => { p.maxCarry++; }
  ),
  new UpgradeDefinition(
    'Overclock Boost', 'Overclock Boost', '+10 max stamina',
    ORANGE, 6, p => { p.maxStamina += 10; p.stamina = p.maxStamina; }
  ),
  new UpgradeDefinition(
    'Tractor Beam', 'Tractor Beam', '+8 pickup radius',
    BLUE, 6, p => { p.pickupRadius += 8; }
  ),
  new UpgradeDefinition(
    'Firewall Protection', 'Firewall', '-2% overload rate',
    PURPLE, 5, () => {}  // overload dampening is computed from upgrades dict directly
  ),
  new UpgradeDefinition(
    'Pulse Damage', 'Pulse Damage', '+1 projectile damage',
    MAGENTA, 5, () => {}  // damage computed from upgrades dict in Player.shoot()
  ),
  new UpgradeDefinition(
    'Sonic Pulse', 'Sonic Pulse', 'Q: cone knockback, wider each level',
    WHITE, 5, () => {}
  ),
  new UpgradeDefinition(
    'Homing Disc', 'Homing Disc', 'Auto-launches homing shots at core carriers',
    GREEN, 4, () => {}
  ),
  new UpgradeDefinition(
    'EMP Cloud', 'EMP Cloud', 'E: stuns all enemies in radius',
    GREY, 4, () => {}
  ),
  new UpgradeDefinition(
    'Quantum Overhaul', 'Quantum Overhaul', 'Auto-recovers nearest loose core',
    ORANGE, 4, () => {}
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
