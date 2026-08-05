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

// ─── CORRUPTED MUTATIONS — Chaos Mode, japan_phasewalker only ────────────────────────────────
// His REROLL DOCTRINE turns the THIRD forced-mutation slot into a CORRUPTED offer. Unlike the six
// cards above these are not pure negatives: each pairs a real bonus with a real drawback, and BOTH
// are printed on the card BEFORE it is taken. Three rules keep them honest:
//
//   1. apply() does exactly what the card says — no hidden clause, nothing rolled after the pick.
//   2. every drawback is an existing card's own apply(), so a corrupted stack can never push a run
//      past the worst case the six ordinary mutations could already reach. Same fields, same caps.
//   3. a card is never OFFERED when its bonus could not be paid in full (a heal at full HP), and
//      the risk line is rebuilt at offer time so a component already at its cap says so out loud.
//
// Nothing here is reachable outside Chaos: Game._buildMutationChoices() only asks for a corrupted
// card when the CHAOS DOCTRINE table hands it a `mutation` block, and only japan_phasewalker has one.

const byKey = (k) => MUTATIONS.find(c => c.key === k);

// The player-facing phrasing of every drawback, keyed by the base card it reuses.
const RISK_TEXT = {
  swarm_protocol:     'enemies spawn ~12% faster',
  magnet_decay:       'pickup radius -15%',
  mana_drought:       'mana / ultimate gain -15%',
  accelerated_rounds: 'enemy projectiles +12% faster',
  targeted_plasma:    'Reactor Plasma targets you far more often',
  early_elites:       'elite waves arrive ~12% sooner',
};

export const CORRUPTED_MUTATIONS = [
  {
    key: 'corrupt_fate', name: 'CORRUPTED FATE', corrupted: true,
    bonus: 'Reroll your CHAOS LAW immediately.',
    risks: ['swarm_protocol', 'early_elites'],
    // The law overlay is always reachable one frame after the picker closes — the shipped
    // deferred path a Mega Titan kill already uses. Always payable.
    payable: () => true,
    grant: (game) => { game._doctrinePendingReroll = true; },
  },
  {
    key: 'corrupt_flesh', name: 'CORRUPTED FLESH', corrupted: true,
    bonus: 'Heal to FULL HP right now.',
    risks: ['accelerated_rounds', 'targeted_plasma'],
    // Never offered above 90% HP: a heal that heals nothing would overstate the card.
    payable: (game) => !!(game && game.player && game.player.maxHp > 0 &&
                          game.player.hp < game.player.maxHp * 0.9),
    grant: (game) => { game.player.hp = game.player.maxHp; },
  },
  {
    key: 'corrupt_phase', name: 'CORRUPTED PHASE', corrupted: true,
    bonus: '5 seconds of total invulnerability, starting now.',
    risks: ['mana_drought', 'magnet_decay'],
    // Reuses the shipped phoenix i-frame field — every damage source already checks it.
    payable: () => true,
    grant: (game) => {
      const t = Number.isFinite(game.phoenixReviveTimer) ? game.phoenixReviveTimer : 0;
      // 'none' = hold the gate without replaying the 3 s phoenix burst (a 5 s window would drive
      // that animation's gradient radius negative and throw). See Game.draw layer 6b.
      game.phoenixReviveType  = 'none';
      game.phoenixReviveTimer = Math.max(t, 5);
    },
  },
];

// Build the drawback line for a card against the CURRENT run state. A component that can no
// longer move says so, so the card never charges the player for a cost it will not collect.
function riskLine(card, m) {
  return card.risks
    .map(k => RISK_TEXT[k] + (atCap(k, m) ? ' (ALREADY AT CAP)' : ''))
    .join(' + ');
}

/**
 * Pick one corrupted card whose bonus can be paid IN FULL right now, and stamp it with a risk
 * line that matches the current run state. Returns null when none is payable — the caller then
 * falls back to an ordinary card rather than filling the slot with a card that would lie.
 */
export function sampleCorruptedMutation(game, m) {
  const pool = CORRUPTED_MUTATIONS.filter(c => {
    try { return c.payable(game) === true; } catch (_) { return false; }
  });
  if (!pool.length) return null;
  const card = pool[Math.floor(Math.random() * pool.length)];
  const risk = riskLine(card, m);
  return {
    key: card.key, name: card.name, corrupted: true,
    bonus: card.bonus, risk,
    desc: 'BONUS: ' + card.bonus + '  RISK: ' + risk + '.',   // fallback for any plain-text reader
    apply: (mm, g) => {
      for (const k of card.risks) byKey(k).apply(mm);          // same fields, same caps
      if (g) { try { card.grant(g); } catch (_) {} }
    },
  };
}
