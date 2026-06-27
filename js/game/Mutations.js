// Forced Endless Mutation Cards — Phase 1. Run-scoped NEGATIVE mutations only.
// These NEVER buff the player, are NEVER saved (no MetaProgress), and never touch Protocol
// Fragments / Grid Credits / Overload / cores. Each card mutates the run-scoped `mutations`
// object that Game.js read-sites multiply by; apply() clamps to a per-card cap so no single
// stack can hard-lock a run. Entirely Endless-only (Game arms the timer in _enterEndless).

export const MUTATIONS = [
  {
    key: 'swarm_protocol',
    name: 'SWARM PROTOCOL',
    desc: 'Enemies spawn ~12% faster.',
    apply: (m) => { m.spawnRateMult = Math.max(0.62, m.spawnRateMult * 0.88); },   // floor 0.62
  },
  {
    key: 'magnet_decay',
    name: 'MAGNET DECAY',
    desc: 'Pickup radius -15%.',
    apply: (m) => { m.pickupRadiusMult = Math.max(0.55, m.pickupRadiusMult * 0.85); },   // floor 0.55
  },
  {
    key: 'mana_drought',
    name: 'MANA DROUGHT',
    desc: 'Mana / ultimate gain -15%.',
    apply: (m) => { m.manaGainMult = Math.max(0.55, m.manaGainMult * 0.85); },   // floor 0.55
  },
  {
    key: 'accelerated_rounds',
    name: 'ACCELERATED ROUNDS',
    desc: 'Enemy projectiles +12% faster.',
    apply: (m) => { m.enemyBulletSpeedMult = Math.min(1.5, m.enemyBulletSpeedMult * 1.12); },   // cap 1.5
  },
  {
    key: 'targeted_plasma',
    name: 'TARGETED PLASMA',
    desc: 'Reactor Plasma targets you more often.',
    apply: (m) => { m.plasmaOnPlayerChanceBonus = Math.min(0.40, m.plasmaOnPlayerChanceBonus + 0.18); },   // +0.18, cap 0.40 (→ 0.90 total)
  },
  {
    key: 'early_elites',
    name: 'EARLY ELITES',
    desc: 'Elite waves arrive ~12% sooner.',
    apply: (m) => { m.eliteIntervalMult = Math.max(0.62, m.eliteIntervalMult * 0.88); },   // floor 0.62
  },
];

// True when a card can no longer push its field (already at cap) — used to prefer fresh cards.
function atCap(key, m) {
  switch (key) {
    case 'swarm_protocol':     return m.spawnRateMult            <= 0.62 + 1e-6;
    case 'magnet_decay':       return m.pickupRadiusMult         <= 0.55 + 1e-6;
    case 'mana_drought':       return m.manaGainMult             <= 0.55 + 1e-6;
    case 'accelerated_rounds': return m.enemyBulletSpeedMult     >= 1.50 - 1e-6;
    case 'targeted_plasma':    return m.plasmaOnPlayerChanceBonus >= 0.40 - 1e-6;
    case 'early_elites':       return m.eliteIntervalMult        <= 0.62 + 1e-6;
    default:                   return false;
  }
}

// Sample `count` DISTINCT cards, preferring ones not already maxed. The pool of 6 (>= 3) means the
// forced choice is never empty and rarely repetitive. No skip/reroll — the caller forces a pick.
export function sampleMutations(count, m) {
  const fresh = MUTATIONS.filter(c => !atCap(c.key, m));
  const pool  = (fresh.length >= count ? fresh : MUTATIONS).slice();
  const out   = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
