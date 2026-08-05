// ══════════════════════════════════════════════════════════════════════════════════════════════
// CHAOS DOCTRINE — per-character Chaos Mode identity (PILOT: 8 of 10 characters)
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
// SCOPE OF THIS PILOT — four characters, approved in two waves:
//   japan_phasewalker  REROLL DOCTRINE + FATE PYLON      (wave 1)
//   cyber_arm_hero     HEAT DOCTRINE   + FOUNDRY PYLON   (wave 1)
//   assassin_clone     SHROUD DOCTRINE + VENOM PYLON     (wave 2)
//   euclid_vector      AXIOM DOCTRINE  + PROOF PYLON     (wave 2)
//   oni_cataclysm_...  CATACLYSM DEBT  + PYRE PYLON      (wave 3)
//   eddie              SETLIST         + AMP PYLON       (wave 3)
//   taekwondo_girl     MOMENTUM LAW    + FROST PYLON     (wave 4)
//   dimis_kickboxer    JUDGEMENT ROUND + AEGIS PYLON     (wave 4)
// The other two have NO entry, get NO doctrine, and are byte-for-byte unaffected: every read
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

  // ── ASSASSIN CLONE ──────────────────────────────────────────────────────────────────────
  // Identity: marks and execution. Widow's Loom cinches and executes below a threshold;
  // Phantom Needle marks the three toughest and executes or armour-shreds. Both thresholds are
  // STATIC percentages - and in a mode that puts 800 enemies on screen, "execute the ones
  // already nearly dead" is the one fantasy Chaos quietly erases. SHROUD DOCTRINE turns his
  // threshold into something he EARNS by not being touched, which is the assassin's actual
  // promise: perfection, or nothing.
  assassin_clone: Object.freeze({
    id: 'assassin_clone',
    label: 'SHROUD DOCTRINE',
    color: '#7CFF4D',

    // The shroud is a STAKE, not a drain: it only grows while he goes untouched, it is spent
    // whole on one execution window, and a single hit wipes it. Deliberately NOT shaped like
    // cyber_arm_hero's heat - that one builds from playing normally and punishes; this one
    // builds from restraint and pays out.
    shroud: Object.freeze({
      fillPerSec:  0.14,   // ~7 s untouched to arm from empty
      execBonus:   0.35,   // ADDED to the fusion's own execution threshold, for one window
      windowSecs:  6.0,    // how long the armed window lasts once full
    }),

    // VENOM PYLON - the poison finishes what he started. It executes only enemies ALREADY at or
    // under a low fraction, never a boss, and every finish feeds the shroud back. No new hazard
    // entity, no new per-enemy state: a radius sweep through the same takeHit path.
    pylon: Object.freeze({
      id:    'venom',
      name:  'VENOM PYLON',
      color: '#7CFF4D',
      glow:  '#44ff8866',
      radius:        240,
      execPct:       0.30,   // only enemies at/below 30% maxHp
      maxKills:      8,      // hard cap per pylon
      shroudPerKill: 0.10,
    }),
  }),

  // ── EUCLID VECTOR ───────────────────────────────────────────────────────────────────────
  // Identity: proof. Axioms, theorems, the golden ratio, a Q.E.D. tombstone, and the only
  // ultimate in the game with a variable mana cost. Chaos never asks him to prove anything.
  // AXIOM DOCTRINE makes WHERE he kills matter: two kills define a line, and the line is
  // asserted through everything standing on it.
  euclid_vector: Object.freeze({
    id: 'euclid_vector',
    label: 'AXIOM DOCTRINE',
    color: '#ffd447',

    // THE CAPS ARE THE DESIGN. An unbounded "everything on the line dies" would delete Chaos at
    // 800 enemies - it was flagged as the most interesting AND most dangerous idea in the
    // proposal, so every one of these exists to bound it:
    //   minSeparation  a line needs two DISTANT kills, so a blob cannot draw one
    //   maxVictims     at most six per line, whatever the density
    //   cooldown       at most ~1.8 lines a second
    //   bossFraction   bosses and Titans take a quarter, never the full theorem
    // The result is a positional rule, not a damage stat: spread your kills and the geometry
    // pays; kill everything in one pile and it never fires.
    axiom: Object.freeze({
      minSeparation: 220,
      lineWidth:      44,
      damage:         42,
      maxVictims:      6,
      cooldown:      0.55,
      bossFraction:  0.25,
      trailSecs:     0.45,   // how long the drawn line lingers
    }),

    // PROOF PYLON - the only pylon that asks the player to PLAN. Touching one anchors a vertex
    // instead of paying out; the third anchor closes the triangle and the interior is proved.
    // Anchors live on the game, not as new entities, so the pylon lifecycle is untouched.
    pylon: Object.freeze({
      id:    'proof',
      name:  'PROOF PYLON',
      color: '#ffd447',
      glow:  '#ffcc0066',
      vertices:   3,
      damage:   180,
      maxVictims: 24,
      flashSecs: 0.7,
    }),
  }),

  // ── ONI CATACLYSM PROTOCOL ──────────────────────────────────────────────────────────────
  // His ultimate is ALREADY a miniature Chaos: eight seconds of 50% damage reduction and +40%
  // move speed with a molten trail, then a screen-wide detonation that also takes 15% of every
  // normal enemy's max HP. So in Chaos the character does not escalate - he simply repeats.
  // CATACLYSM DEBT gives the repetition a price that grows with the run.
  oni_cataclysm_protocol: Object.freeze({
    id: 'oni_cataclysm_protocol',
    label: 'CATACLYSM DEBT',
    color: '#ff4d2d',

    // Every Mega Titan he kills adds a step of debt. At full debt Protocol 0 costs NO mana -
    // but firing it while indebted leaves the ground irradiated, and the fallout does not care
    // whose side he is on. The player keeps the trigger: the ultimate is never auto-fired, so
    // the decision "take the free cast and live in the fallout, or pay down the debt first"
    // stays theirs. That is the whole doctrine.
    debt: Object.freeze({
      perTitanKill: 0.34,   // three Titans to full
      falloutSecs:   14,
      falloutRadius: 420,
      falloutTick:  0.5,    // seconds between fallout damage ticks
      falloutEnemy:  26,    // per tick, to enemies
      falloutSelf:    5,    // per tick, to HIM - through the real _damagePlayer path
      maxVictims:    18,    // per tick, so a dense crowd cannot uncap it
    }),

    // PYRE PYLON - the safety valve. It burns enemies around it AND pays down one step of debt,
    // so the player can choose to stay solvent instead of banking the free cast. Without it the
    // debt would be a one-way ratchet; with it, it is a decision every time a pylon appears.
    pylon: Object.freeze({
      id:    'pyre',
      name:  'PYRE PYLON',
      color: '#ff4d2d',
      glow:  '#ff2d0066',
      radius:      300,
      damage:       90,
      maxVictims:   14,
      debtRelief: 0.34,   // exactly one Titan's worth
    }),
  }),

  // ── EDDIE ────────────────────────────────────────────────────────────────────────────────
  // He owns something no other character has: a 150 ms BEAT CLOCK inside his ultimate, and real
  // hooks into the audio system. In Chaos that is currently decoration - the music changes and
  // means nothing. SETLIST makes the beat mechanical.
  //
  // THE BEAT COUNTER HERE IS LOGICAL, NOT ACOUSTIC. It advances on dt in _updateChaosDoctrine
  // and never reads the audio clock, so a player with the sound muted, SFX at 0 or the tab
  // backgrounded plays exactly the same game. Tying it to audio would have silently deleted the
  // mechanic for anyone playing quiet - that was the flagged risk in the proposal, and this is
  // the answer to it.
  eddie: Object.freeze({
    id: 'eddie',
    label: 'SETLIST',
    color: '#ff2d55',

    // The timed action is the ULTIMATE, not the kill: a player cannot choose the frame a Titan
    // dies on, but they absolutely choose when to hit the solo. Land it on the beat and the
    // crowd gives you an encore; miss and you get feedback.
    setlist: Object.freeze({
      basePeriod:   0.60,   // seconds per beat at the top of the set
      periodPerSong: 0.06,  // each Mega Titan killed is a song - the set gets faster
      minPeriod:    0.30,
      window:       0.12,   // +/- around the beat that counts as on-beat
      encoreCut:       6,   // mana off the ultimate per encore stack
      minCost:        50,   // floor: his ultimate is 80, so at most five encores matter
      feedbackDmg:     8,   // missing the beat bites, through the real _damagePlayer path
      maxSongs:       10,
    }),

    // AMP PYLON - two-sided, like everything else he does. It hands him one guaranteed encore
    // AND advances the set by a song, so the beat he has to hit gets tighter from then on.
    pylon: Object.freeze({
      id:    'amp',
      name:  'AMP PYLON',
      color: '#ff2d55',
      glow:  '#ff005566',
      freeEncore: 1,
      songs:      1,
    }),
  }),

  // ── TAEKWONDO GIRL ──────────────────────────────────────────────────────────────────────
  // The speed character in a mode that punishes standing still - and Chaos never once rewarded
  // actually MOVING. A player who sprints across the deck and one who kites in a three-metre
  // circle get exactly the same run. MOMENTUM LAW makes the distance she covers the mechanic.
  // It fits the map too: the chaos decks are roughly twice as open as the endless ones.
  taekwondo_girl: Object.freeze({
    id: 'taekwondo_girl',
    label: 'MOMENTUM LAW',
    color: '#7ae7ff',

    momentum: Object.freeze({
      // Both halves reuse the SHIPPED chill: Enemy.slowTimer/slowFactor for the trail, and
      // Player._chillT for the frostbite. No new status system, no new per-entity field.
      speedThreshold: 130,   // world px/s above which the trail forms
      dropEvery:      0.14,  // seconds between trail nodes
      nodeLife:       2.2,
      nodeRadius:      86,
      nodeDamage:       9,   // per tick, to enemies crossing it
      tickEvery:      0.35,
      slowSecs:       1.20,  // written into the enemy's own slowTimer
      maxNodes:        26,   // hard cap: the trail is a ribbon, not a carpet
      maxVictimsPerTick: 10,

      // Standing still bites back. The counter is PAUSED whenever the player could not move
      // even if they wanted to - card panel, mutation panel, the law overlay, pause, and the
      // Boss Rush hazard rings - because punishing someone for a screen the game itself froze
      // is a bug, not a design.
      stillSecs:      2.5,   // grace before frostbite starts
      frostbiteEvery: 1.0,   // seconds per frostbite refresh while still
    }),

    // FROST PYLON - two-sided. The zone halves enemy speed, and it slows HER shots inside it
    // too, so the safest ground is also the ground where she does least.
    pylon: Object.freeze({
      id:    'frost',
      name:  'FROST PYLON',
      color: '#7ae7ff',
      glow:  '#3ad6ff66',
      radius:      260,
      slowSecs:    4.0,
      maxVictims:   24,
      selfChill:   2.0,   // seconds of her own chill, applied on touch — the cost side
    }),
  }),

  // ── DIMI KICKBOXER ──────────────────────────────────────────────────────────────────────
  // The only character with a DEFENSIVE fusion (Aegis of Judgement), the only cooldown-gated
  // ultimate rather than a mana one, and the only holy element in the game. And Chaos tests
  // exactly one thing: damage output. His entire distinguishing identity sits idle in the mode
  // where it should shine.
  dimis_kickboxer: Object.freeze({
    id: 'dimis_kickboxer',
    label: 'JUDGEMENT ROUND',
    color: '#ffe9a3',

    // WHAT THIS DELIBERATELY IS NOT. The proposal's version locked his damage output for 20 s.
    // That was flagged there as the most aggressive idea in the document and as needing a
    // playtest BEFORE shipping, and on reflection it is simply bad: zeroing a player's output
    // for twenty seconds in a mode with 800 enemies on screen is not risk/reward, it is a death
    // sentence dressed as design. What ships instead keeps every ounce of the "his Chaos tests
    // DEFENCE" idea and none of the lockout: during a Round the hits he takes CHARGE something
    // instead of only hurting, and the cost is that his panic button is unavailable.
    round: Object.freeze({
      everySecs:    75,    // how often Chaos declares one
      durationSecs: 20,
      chargePerHit: 0.14,  // ~7 absorbed hits to a full verdict
      smiteDamage:  240,
      smiteRadius:  520,
      maxVictims:    24,
      // While a Round runs his ultimate cooldown is HELD, not reset - he fights it without the
      // panic button, and gets the button back untouched the moment the Round ends.
      holdUltimate: true,
    }),

    // AEGIS PYLON - the engine of the doctrine. Five seconds during which nothing can hurt him
    // AND every hit that would have landed charges the Verdict instead. No movement clamp: the
    // natural cost is that he spends the immunity walking INTO the crowd, and the crowd is
    // still there when it drops.
    pylon: Object.freeze({
      id:    'aegis',
      name:  'AEGIS PYLON',
      color: '#ffe9a3',
      glow:  '#ffd06666',
      immuneSecs:      5.0,
      chargePerBlock: 0.10,
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
