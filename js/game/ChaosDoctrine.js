// ══════════════════════════════════════════════════════════════════════════════════════════════
// CHAOS DOCTRINE — per-character Chaos Mode identity (PILOT: 2 of 10 characters)
// ----------------------------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// Chaos Mode changes the WORLD and never the PLAYER. Measured before this file: across ~85
// `_chaosMode` sites in Game.js plus WaveDirector / AcidRain / NpcWalker /
// HostileProjectileDirector / Player, there is not one gameplay branch on `selectedCharacter`.
// Enemy cap x2.8 (800), spawn interval /2.4, a chaos-only enemy pool, Mega Titans, gold-core
// drip, pylons, Nexus roles, Boss Rush at 2:00 - all ten characters get exactly the same ones.
// The only two places `selectedCharacter` meets chaos are leaderboard telemetry
// (Game.js submitChaosRun) and Eden narrative strings. Neither is gameplay.
//
// THE PATTERN THIS COPIES
// FusionCatalog already solved this correctly: every one of the 20 fusions carries a
// `chaos: {...}` block read live through FusionEngine.chaos(). Data-driven, per-character,
// chaos-gated, hard-capped, ~40 read sites and zero bespoke plumbing. This file is the same
// idea applied to the character rather than the fusion.
//
// SCOPE OF THIS PILOT — deliberately two characters, approved as a pilot:
//   japan_phasewalker  REROLL DOCTRINE + FATE PYLON
//   cyber_arm_hero     HEAT DOCTRINE   + FOUNDRY PYLON
// The other eight have NO entry, get NO doctrine, and are byte-for-byte unaffected: every read
// site starts with `const doc = this._doctrine(); if (!doc) return;`, and `_doctrine()` returns
// null outside Chaos and for any character without an entry here.
//
// NOTHING HERE IS A FLAT BUFF. No +damage, no +speed, no multiplier. Each doctrine is a RULE
// with a cost, expressed entirely through systems and assets that already ship.
// ══════════════════════════════════════════════════════════════════════════════════════════════

export const CHAOS_DOCTRINE = Object.freeze({

  // ── JAPAN PHASEWALKER ───────────────────────────────────────────────────────────────────
  // Identity: probability. Die of Fates, Event Horizon Roulette, entropic dice, rerolling
  // discs, the fastest cadence in the game (0.18 s). And Chaos hands him ONE fixed law at the
  // start and one fixed pylon roll forever after — the gambler is the one character not
  // allowed to gamble. Both entries below give him back the dice.
  japan_phasewalker: Object.freeze({
    id: 'japan_phasewalker',
    label: 'REROLL DOCTRINE',
    color: '#a855f7',

    // A charge is spent the moment it is earned: the Chaos Law overlay reopens mid-run and the
    // game freezes behind it (Game.js's `_clsVisible` guard returns before any gameplay update,
    // so this needs no new pause path and no new input binding). Cancelling keeps the old law.
    reroll: Object.freeze({
      perTitanKill: 1,     // one charge per Mega Titan destroyed
      maxCharges:   3,     // hard ceiling; a charge is consumed immediately, this is the backstop
    }),

    // FATE PYLON — a d6 over effects that ALL already exist. No new effect is invented; the
    // die only changes which existing one lands and how hard.
    pylon: Object.freeze({
      id:    'fate',
      name:  'FATE PYLON',
      color: '#a855f7',
      glow:  '#a855f766',
      // faces 1-6, resolved by index. Doubling reuses the base pylon numbers (15 dmg / 5 s
      // shield / 8% heal) rather than inventing new ones.
      faces: Object.freeze(['danger2', 'danger2', 'shield2', 'shield2', 'heal2', 'jackpot']),
    }),
  }),

  // ── CYBER ARM HERO ──────────────────────────────────────────────────────────────────────
  // Identity: overheat and recoil. Railgun, foundry piston, ferro tempest, and an ultimate
  // that literally tears the screen. Nothing in the game has ever got hot. HEAT DOCTRINE gives
  // the ranged hero a reason to break contact: his weapons only fire when a target is inside
  // the 620 px acquisition radius, so walking AWAY from the crowd is what cools him. That is a
  // real positional decision in a mode built on crowd pressure, not a stat.
  cyber_arm_hero: Object.freeze({
    id: 'cyber_arm_hero',
    label: 'HEAT DOCTRINE',
    color: '#ff9a2d',

    heat: Object.freeze({
      perShot:   0.055,   // ~18 acquired-weapon shots from cold to redline
      coolPerSec: 0.34,   // ~3 s of no target in range to shed a full bar
      ventDmg:   6,       // HP per tick while redlined, through the real _damagePlayer path
      ventEvery: 1.0,     // seconds between vent ticks
      // At redline the Railgun Horizon costs NO mana and venting the ultimate drops heat to 0.
      // That is the whole loop: overheat -> free railgun -> vent -> rebuild.
      freeUltAt: 1.0,
    }),

    // FOUNDRY PYLON — dumps the accumulated heat into the foundry. Always useful (it vents),
    // and if he is running SCRAPSTORM FOUNDRY it also forges one extra drone slot for the rest
    // of the run. Capped, chaos-only, and it reads through the fusion's OWN cap expression so
    // the fusion stays the single authority on its drone count.
    pylon: Object.freeze({
      id:    'foundry',
      name:  'FOUNDRY PYLON',
      color: '#ff9a2d',
      glow:  '#ff6a0066',
      ventHeat:      1.0,   // fraction of the heat bar dumped
      foundryStack:  1,     // +1 to the SCRAPSTORM drone cap
      maxStacks:     3,     // ceiling; FusionEngine clamps against caps.dronesAlive as well
    }),
  }),
});

/**
 * The doctrine for a character id, or null. Callers must ALSO gate on Chaos — see
 * Game._doctrine(), which is the only thing that should call this in gameplay code.
 */
export function getChaosDoctrine(charId) {
  return (charId && CHAOS_DOCTRINE[charId]) || null;
}

/** Every character id that currently has a doctrine. QA reads this instead of hard-coding. */
export function doctrineCharacters() {
  return Object.keys(CHAOS_DOCTRINE);
}
