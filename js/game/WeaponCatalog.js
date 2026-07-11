/**
 * WeaponCatalog.js — PHENIX: NULL EDEN
 * ─────────────────────────────────────
 * Player Weapon & Evolution Registry.
 * Data-only weapon definitions for all 8 base character weapons
 * and 4 evolution weapons. Includes per-level scaling, evolution
 * recipes, and lookup helpers. No gameplay logic — that lives in
 * Game.js / Player.js.
 */

// ── Weapon IDs ──────────────────────────────────────────────────────
export const WEAPON_ID = Object.freeze({
  // Base weapons (one per character)
  STORM_SABER:      'storm_saber',
  MAGNETIC_ARC:     'magnetic_arc',
  SPIRIT_CRESCENT:  'spirit_crescent',
  SHADOW_TOXIC:     'shadow_toxic',
  NEXUS_CHAKRAM:    'nexus_chakram',
  GAS_NEEDLE:       'gas_needle',
  CATACLYSM_PULSE:  'cataclysm_pulse',
  GLITCH_TEAR:      'glitch_tear',
  SOLO_RED_THUNDER: 'solo_red_thunder',
  // Evolution weapons (require 2 base weapons at level 5)
  STORM_CONDUCTOR:    'storm_conductor',
  PLASMA_EXECUTION:   'plasma_execution',
  CATACLYSM_CHAIN:    'cataclysm_chain',
  FROZEN_EDEN:        'frozen_eden',
  // Depth-expansion evolutions (batch 1 — art by InkSpireM Visuals)
  CHAOS_CHORD:        'chaos_chord',
  GRID_REAPER:        'grid_reaper',
  CRYO_SOVEREIGN:     'cryo_sovereign',
  ION_HALO:           'ion_halo',
  NULL_LANCE:         'null_lance',
  EMBER_STORM:        'ember_storm',
  // Depth-expansion evolutions (batch 3 — Skeleton / Assassin / Brawler)
  BONECIRCUIT_STORM:  'bonecircuit_storm',
  VENOM_SHROUD:       'venom_shroud',
  SEISMIC_RIFT:       'seismic_rift',
  MARROW_REACTOR:   'marrow_reactor',   // NEW skeleton evolution (procedural)
  MIRROR_CASCADE:   'mirror_cascade',   // NEW taekwondo evolution (procedural)
  TEMPEST_RIBBON:   'tempest_ribbon',   // NEW taekwondo evolution (procedural)
  REVENANT_CHOIR:   'revenant_choir',   // NEW skeleton evolution (procedural)
});

// ── Weapon behavior types ───────────────────────────────────────────
export const WEAPON_BEHAVIOR = Object.freeze({
  FORWARD_ARC:        'forward_arc',
  FORWARD_CONE:       'forward_cone',
  WIDE_ARC:           'wide_arc',
  CROSS_SLASH:        'cross_slash',
  ORBIT_THROW:        'orbit_throw',
  LINE_CLOUD:         'line_cloud',
  GROUND_SHOCKWAVE:   'ground_shockwave',
  VORTEX:             'vortex',
  CIRCLE_360:         'circle_360',
  EXPANDING_SPIRAL:   'expanding_spiral',
  SEQUENTIAL_GROUND:  'sequential_ground',
  PULL_EXPLODE:       'pull_explode',
  BOLT_PROJECTILE:    'bolt_projectile',
});

// ── Level scaling multipliers ───────────────────────────────────────
const LEVEL_SCALING = [
  null, // index 0 unused
  { dmg: 1.00, cd: 1.00, aoe: 1.00 }, // Level 1 — base stats
  { dmg: 1.15, cd: 0.95, aoe: 1.00 }, // Level 2
  { dmg: 1.30, cd: 0.90, aoe: 1.10 }, // Level 3
  { dmg: 1.50, cd: 0.85, aoe: 1.20 }, // Level 4
  { dmg: 1.75, cd: 0.80, aoe: 1.30 }, // Level 5 — EVOLUTION READY
];

// ── Weapon definitions ──────────────────────────────────────────────
export const WEAPON_DEFS = Object.freeze({

  // ────────────────────────────────────────────────────────────────
  // BASE WEAPONS (8)
  // ────────────────────────────────────────────────────────────────

  [WEAPON_ID.STORM_SABER]: {
    id: 'storm_saber',
    name: 'Storm Saber Cursed Slash',
    description: 'A crackling cursed blade unleashes a forward curved slash wave of electric fury.',
    character: 'skeleton_warrior',
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.FORWARD_ARC,
    isEvolution: false,
    color: '#9fd8ff',
    sprite: 'assets/weapons/vfx/storm_saber_slash.png',
    grid: { cols: 4, rows: 4, frameW: 128, frameH: 128 },
    totalFrames: 16,
    fps: 24,
    baseStats: {
      damage: 28,
      cooldown: 1.2,
      aoeRadius: 80,
      speed: 6,
      piercing: 1,
    },
  },

  [WEAPON_ID.MAGNETIC_ARC]: {
    id: 'magnetic_arc',
    name: 'Overloaded Magnetic Arc Burst',
    description: 'Overcharged magnetic rings burst forward in a cone of crackling arc energy.',
    character: 'cyber_arm_hero',
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.FORWARD_CONE,
    isEvolution: false,
    color: '#7ab8ff',
    sprite: 'assets/weapons/vfx/magnetic_arc_burst.png',
    grid: { cols: 4, rows: 4, frameW: 128, frameH: 128 },
    totalFrames: 16,
    fps: 24,
    baseStats: {
      damage: 22,
      cooldown: 1.0,
      aoeRadius: 70,
      speed: 7,
      piercing: 1,
    },
  },

  [WEAPON_ID.SPIRIT_CRESCENT]: {
    id: 'spirit_crescent',
    name: 'Spirit Crescent Kick Aura',
    description: 'A crescent moon of spirit ice sweeps outward in a wide arc following each kick.',
    character: 'taekwondo_girl',
    element: 'ice',
    behavior: WEAPON_BEHAVIOR.WIDE_ARC,
    isEvolution: false,
    color: '#7fe0ff',
    sprite: 'assets/weapons/vfx/spirit_crescent_kick.png',
    grid: { cols: 4, rows: 4, frameW: 256, frameH: 128 },
    totalFrames: 16,
    fps: 24,
    baseStats: {
      damage: 25,
      cooldown: 0.9,
      aoeRadius: 100,
      speed: 8,
      piercing: 2,
    },
  },

  [WEAPON_ID.SHADOW_TOXIC]: {
    id: 'shadow_toxic',
    name: 'Shadow-Toxic Diagonal Cuts',
    description: 'Twin diagonal slashes carve a toxic X across targets, leaving corrosive residue.',
    character: 'assassin_clone',
    element: 'toxin',
    behavior: WEAPON_BEHAVIOR.CROSS_SLASH,
    isEvolution: false,
    color: '#7CFF4D',
    sprite: 'assets/weapons/vfx/shadow_toxic_cuts.png',
    grid: { cols: 4, rows: 3, frameW: 128, frameH: 128 },
    totalFrames: 12,
    fps: 20,
    baseStats: {
      damage: 32,
      cooldown: 1.4,
      aoeRadius: 55,
      speed: 9,
      piercing: 2,
    },
  },

  [WEAPON_ID.NEXUS_CHAKRAM]: {
    id: 'nexus_chakram',
    name: 'Nexus Chakram',
    description: 'A blazing fire ring orbits the wielder before being hurled outward in a searing arc.',
    character: 'brawler_warrior',
    element: 'fire',
    behavior: WEAPON_BEHAVIOR.ORBIT_THROW,
    isEvolution: false,
    color: '#ff6a1a',
    sprite: 'assets/weapons/vfx/nexus_chakram.png',
    grid: { cols: 6, rows: 4, frameW: 256, frameH: 256 },
    totalFrames: 24,
    fps: 28,
    baseStats: {
      damage: 18,
      cooldown: 0.8,
      aoeRadius: 110,
      speed: 5,
      piercing: 3,
    },
  },

  [WEAPON_ID.GAS_NEEDLE]: {
    id: 'gas_needle',
    name: 'Digital Gas Needle Vector',
    description: 'A precision toxin needle fires forward, leaving a lingering digital gas cloud in its wake.',
    character: 'euclid_vector',
    element: 'toxin',
    behavior: WEAPON_BEHAVIOR.LINE_CLOUD,
    isEvolution: false,
    color: '#8fdf7f',
    sprite: 'assets/weapons/vfx/gas_needle_vector.png',
    grid: { cols: 4, rows: 4, frameW: 128, frameH: 128 },
    totalFrames: 16,
    fps: 22,
    baseStats: {
      damage: 30,
      cooldown: 1.5,
      aoeRadius: 60,
      speed: 10,
      piercing: 1,
    },
  },

  [WEAPON_ID.CATACLYSM_PULSE]: {
    id: 'cataclysm_pulse',
    name: 'Demonic Cataclysm Pulse',
    description: 'A devastating ground-lava shockwave erupts outward, branded with burning demonic sigils.',
    character: 'oni_cataclysm_protocol',
    exclusive: true,   // HARD-LOCKED to Oni — never appears in other characters' weapon pools
    element: 'fire',
    behavior: WEAPON_BEHAVIOR.GROUND_SHOCKWAVE,
    isEvolution: false,
    color: '#ff3030',
    sprite: 'assets/weapons/vfx/cataclysm_pulse.png',
    grid: { cols: 6, rows: 4, frameW: 256, frameH: 256 },
    totalFrames: 24,
    fps: 20,
    baseStats: {
      damage: 45,
      cooldown: 2.5,
      aoeRadius: 160,
      speed: 3,
      piercing: 99,
    },
  },

  [WEAPON_ID.GLITCH_TEAR]: {
    id: 'glitch_tear',
    name: 'Glitch Singularity Tear',
    description: 'A black hole vortex rips through digital space, warping light with RGB distortion.',
    character: 'japan_phasewalker',
    element: 'void',
    behavior: WEAPON_BEHAVIOR.VORTEX,
    isEvolution: false,
    color: '#6600CC',
    sprite: 'assets/weapons/vfx/glitch_tear.png',
    grid: { cols: 5, rows: 4, frameW: 256, frameH: 256 },
    totalFrames: 20,
    fps: 18,
    baseStats: {
      damage: 35,
      cooldown: 2.0,
      aoeRadius: 90,
      speed: 4,
      piercing: 5,
    },
  },

  [WEAPON_ID.SOLO_RED_THUNDER]: {
    id: 'solo_red_thunder',
    name: 'Solo Red Thunder',
    description: 'NEW WEAPON — auto-fires red thunder riffs independently. His solo never stops.',
    character: 'eddie',
    exclusive: true,   // HARD-LOCKED to Eddie — never appears in other characters' weapon pools
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.BOLT_PROJECTILE,
    isEvolution: false,
    color: '#ff2d2d',
    // Single illustration (card icon / VFX override art) — NOT a frame sheet, so it has
    // no grid/totalFrames/fps and must never be added to WEAPON_VFX_META in Game.js.
    sprite: 'assets/weapons/solo_red_thunder.png',
    baseStats: {
      damage: 38,        // ~1.3x the base-weapon damage median (29) — hits harder than average
      cooldown: 1.1,
      aoeRadius: 70,
      speed: 12,
      piercing: 2,
    },
  },

  // ────────────────────────────────────────────────────────────────
  // EVOLUTION WEAPONS (4) — require 2 base weapons at level 5
  // ────────────────────────────────────────────────────────────────

  [WEAPON_ID.STORM_CONDUCTOR]: {
    id: 'storm_conductor',
    name: 'Storm Conductor',
    description: 'The saber and arc merge into a full 360-degree lightning storm that annihilates all nearby foes.',
    character: null,
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.CIRCLE_360,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.STORM_SABER, WEAPON_ID.MAGNETIC_ARC],
    color: '#c0e8ff',
    sprite: 'assets/weapons/vfx/storm_conductor_hd.png',
    grid: { cols: 6, rows: 4, frameW: 256, frameH: 256 },
    totalFrames: 24,
    fps: 28,
    baseStats: {
      damage: 65,
      cooldown: 3.0,
      aoeRadius: 200,
      speed: 0,
      piercing: 99,
    },
  },

  [WEAPON_ID.PLASMA_EXECUTION]: {
    id: 'plasma_execution',
    name: 'Plasma Execution Loop',
    description: 'Toxic blades and burning chakrams spiral outward in an ever-expanding loop of plasma death.',
    character: null,
    element: 'fire',
    behavior: WEAPON_BEHAVIOR.EXPANDING_SPIRAL,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.SHADOW_TOXIC, WEAPON_ID.NEXUS_CHAKRAM],
    color: '#ff7adf',
    sprite: 'assets/weapons/vfx/plasma_execution_hd.png',
    grid: { cols: 6, rows: 4, frameW: 256, frameH: 256 },
    totalFrames: 24,
    fps: 24,
    baseStats: {
      damage: 55,
      cooldown: 2.5,
      aoeRadius: 170,
      speed: 4,
      piercing: 99,
    },
  },

  [WEAPON_ID.CATACLYSM_CHAIN]: {
    id: 'cataclysm_chain',
    name: 'Cataclysm Chain Reaction',
    description: 'Lava pulses and gas clouds chain-detonate across the ground in sequential eruptions.',
    character: null,
    element: 'fire',
    behavior: WEAPON_BEHAVIOR.SEQUENTIAL_GROUND,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.CATACLYSM_PULSE, WEAPON_ID.GAS_NEEDLE],
    color: '#ff5500',
    sprite: 'assets/weapons/vfx/cataclysm_chain.png',
    grid: { cols: 8, rows: 4, frameW: 256, frameH: 256 },
    totalFrames: 32,
    fps: 24,
    baseStats: {
      damage: 80,
      cooldown: 4.0,
      aoeRadius: 220,
      speed: 2,
      piercing: 99,
    },
  },

  [WEAPON_ID.FROZEN_EDEN]: {
    id: 'frozen_eden',
    name: 'Frozen Eden / Glitch Vortex',
    description: 'Crescent ice and void singularity fuse — a pull vortex freezes and shatters all caught within.',
    character: null,
    element: 'void',
    behavior: WEAPON_BEHAVIOR.PULL_EXPLODE,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.SPIRIT_CRESCENT, WEAPON_ID.GLITCH_TEAR],
    color: '#aa44ff',
    sprite: 'assets/weapons/vfx/frozen_eden.png',
    grid: { cols: 5, rows: 4, frameW: 256, frameH: 256 },
    totalFrames: 20,
    fps: 20,
    baseStats: {
      damage: 50,
      cooldown: 3.5,
      aoeRadius: 140,
      speed: 3,
      piercing: 99,
    },
  },

  // ── Depth-expansion evolutions (batch 1) ────────────────────────────
  // Single-illustration sprites (NOT frame sheets → never added to WEAPON_VFX_META,
  // so the card shows the whole art and no VFX fanfare is spawned). Each reuses an
  // existing, proven behavior so the runtime damage path is unchanged.
  [WEAPON_ID.CHAOS_CHORD]: {
    id: 'chaos_chord',
    name: 'Chaos Chord',
    description: "Eddie's solo detonates into homing note-bolts and map-wide golden lightning.",
    character: null,
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.BOLT_PROJECTILE,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.SOLO_RED_THUNDER, WEAPON_ID.STORM_SABER],
    color: '#ffd23c',
    sprite: 'assets/weapons/vfx/chaos_chord.png',
    grid: { cols: 1, rows: 1, frameW: 1254, frameH: 1254 },
    totalFrames: 1,
    fps: 1,
    baseStats: { damage: 70, cooldown: 2.2, aoeRadius: 150, speed: 6, piercing: 99 },
  },

  [WEAPON_ID.GRID_REAPER]: {
    id: 'grid_reaper',
    name: 'Grid Reaper',
    description: 'A toxic lattice scythe reaps everything in a wide arc, leaving corrosive residue.',
    character: null,
    element: 'toxin',
    behavior: WEAPON_BEHAVIOR.WIDE_ARC,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.GAS_NEEDLE, WEAPON_ID.SHADOW_TOXIC],
    color: '#7CFF4D',
    sprite: 'assets/weapons/vfx/grid_reaper.png',
    grid: { cols: 1, rows: 1, frameW: 1254, frameH: 1254 },
    totalFrames: 1,
    fps: 1,
    baseStats: { damage: 65, cooldown: 2.6, aoeRadius: 190, speed: 3, piercing: 99 },
  },

  [WEAPON_ID.CRYO_SOVEREIGN]: {
    id: 'cryo_sovereign',
    name: 'Cryo Sovereign',
    description: 'A crystalline field freezes all caught inside, then shatters them apart.',
    character: null,
    element: 'ice',
    behavior: WEAPON_BEHAVIOR.PULL_EXPLODE,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.SPIRIT_CRESCENT, WEAPON_ID.MAGNETIC_ARC],
    color: '#7fe0ff',
    sprite: 'assets/weapons/vfx/cryo_sovereign.png',
    grid: { cols: 1, rows: 1, frameW: 1254, frameH: 1254 },
    totalFrames: 1,
    fps: 1,
    baseStats: { damage: 55, cooldown: 3.2, aoeRadius: 170, speed: 3, piercing: 99 },
  },

  [WEAPON_ID.ION_HALO]: {
    id: 'ion_halo',
    name: 'Ion Halo',
    description: 'A spinning ion ring orbits you and chain-lightnings nearby foes.',
    character: null,
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.CIRCLE_360,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.MAGNETIC_ARC, WEAPON_ID.NEXUS_CHAKRAM],
    color: '#3fa9ff',
    sprite: 'assets/weapons/vfx/ion_halo.png',
    grid: { cols: 1, rows: 1, frameW: 1254, frameH: 1254 },
    totalFrames: 1,
    fps: 1,
    baseStats: { damage: 45, cooldown: 2.0, aoeRadius: 150, speed: 4, piercing: 99 },
  },

  [WEAPON_ID.NULL_LANCE]: {
    id: 'null_lance',
    name: 'Null Lance',
    description: 'A void lance pierces all in a line and drags enemies into its singularity.',
    character: null,
    element: 'void',
    behavior: WEAPON_BEHAVIOR.BOLT_PROJECTILE,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.GLITCH_TEAR, WEAPON_ID.MAGNETIC_ARC],
    color: '#cfe0ff',
    sprite: 'assets/weapons/vfx/null_lance.png',
    grid: { cols: 1, rows: 1, frameW: 1254, frameH: 1254 },
    totalFrames: 1,
    fps: 1,
    baseStats: { damage: 75, cooldown: 2.8, aoeRadius: 140, speed: 7, piercing: 99 },
  },

  [WEAPON_ID.EMBER_STORM]: {
    id: 'ember_storm',
    name: 'Ember Storm',
    description: 'A whirling ember vortex lingers on the ground and burns anything that enters.',
    character: null,
    element: 'fire',
    behavior: WEAPON_BEHAVIOR.VORTEX,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.CATACLYSM_PULSE, WEAPON_ID.SHADOW_TOXIC],
    color: '#ff7a1a',
    sprite: 'assets/weapons/vfx/ember_storm.png',
    grid: { cols: 1, rows: 1, frameW: 1254, frameH: 1254 },
    totalFrames: 1,
    fps: 1,
    baseStats: { damage: 60, cooldown: 3.0, aoeRadius: 200, speed: 2, piercing: 99 },
  },

  [WEAPON_ID.BONECIRCUIT_STORM]: {
    id: 'bonecircuit_storm',
    name: 'Bonecircuit Storm',
    description: 'A spiral of electrified bone shards whirls outward, arcing lightning between them.',
    character: null,
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.EXPANDING_SPIRAL,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.STORM_SABER, WEAPON_ID.NEXUS_CHAKRAM],
    color: '#7fd0ff',
    sprite: 'assets/weapons/vfx/bonecircuit_storm.png',
    grid: { cols: 1, rows: 1, frameW: 1254, frameH: 1254 },
    totalFrames: 1,
    fps: 1,
    baseStats: { damage: 62, cooldown: 2.6, aoeRadius: 180, speed: 4, piercing: 99 },
  },

  [WEAPON_ID.VENOM_SHROUD]: {
    id: 'venom_shroud',
    name: 'Venom Shroud',
    description: 'A cloud of phantom toxic blades disperses and reforms, poisoning everything it passes.',
    character: null,
    element: 'toxin',
    behavior: WEAPON_BEHAVIOR.LINE_CLOUD,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.SHADOW_TOXIC, WEAPON_ID.GLITCH_TEAR],
    color: '#7CFF4D',
    sprite: 'assets/weapons/vfx/venom_shroud.png',
    grid: { cols: 1, rows: 1, frameW: 1254, frameH: 1254 },
    totalFrames: 1,
    fps: 1,
    baseStats: { damage: 58, cooldown: 2.4, aoeRadius: 175, speed: 5, piercing: 99 },
  },

  [WEAPON_ID.SEISMIC_RIFT]: {
    id: 'seismic_rift',
    name: 'Seismic Rift',
    description: 'A kinetic shockwave rips the ground open, hurling foes back from the impact.',
    character: null,
    element: 'fire',
    behavior: WEAPON_BEHAVIOR.GROUND_SHOCKWAVE,
    isEvolution: true,
    evolvedFrom: [WEAPON_ID.NEXUS_CHAKRAM, WEAPON_ID.CATACLYSM_PULSE],
    color: '#ffb347',
    sprite: 'assets/weapons/vfx/seismic_rift.png',
    grid: { cols: 1, rows: 1, frameW: 1254, frameH: 1254 },
    totalFrames: 1,
    fps: 1,
    baseStats: { damage: 68, cooldown: 3.0, aoeRadius: 210, speed: 3, piercing: 99 },
  },
  // ── NEW-GENERATION EVOLUTIONS (procedural — drawn like the ultimates, no sprite sheet).
  // `procedural: true` routes them to Game._spawnEvoFx instead of the sprite VFX player.
  [WEAPON_ID.MARROW_REACTOR]: {
    id: 'marrow_reactor',
    name: 'Marrow Reactor',
    description: 'Bone ribs cage the target, then the reactor VENTS — electric marrow erupts through the gaps.',
    character: 'skeleton_warrior',
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.GROUND_SHOCKWAVE,
    isEvolution: true,
    procedural: true,
    color: '#e8e4d0',
    baseStats: { damage: 40, cooldown: 2.6, aoeRadius: 130, speed: 0, piercing: 99 },
  },
  [WEAPON_ID.MIRROR_CASCADE]: {
    id: 'mirror_cascade',
    name: 'Mirror Cascade',
    description: 'Ice mirrors materialize in an arc — her kick REFLECTS pane to pane, striking at every bounce.',
    character: 'taekwondo_girl',
    element: 'ice',
    behavior: WEAPON_BEHAVIOR.FORWARD_ARC,
    isEvolution: true,
    procedural: true,
    color: '#7fe0ff',
    baseStats: { damage: 30, cooldown: 2.4, aoeRadius: 120, speed: 0, piercing: 99 },
  },
  [WEAPON_ID.TEMPEST_RIBBON]: {
    id: 'tempest_ribbon',
    name: 'Tempest Ribbon',
    description: 'A storm ribbon dances a figure-eight around the strike point, shearing everything on its path.',
    character: 'taekwondo_girl',
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.CIRCLE_360,
    isEvolution: true,
    procedural: true,
    color: '#14ebd2',
    baseStats: { damage: 24, cooldown: 2.8, aoeRadius: 150, speed: 0, piercing: 99 },
  },
  [WEAPON_ID.REVENANT_CHOIR]: {
    id: 'revenant_choir',
    name: 'Revenant Choir',
    description: 'Three revenant skulls rise, SING a bone-toothed shockwave, then dive as hunting streaks.',
    character: 'skeleton_warrior',
    element: 'electric',
    behavior: WEAPON_BEHAVIOR.CIRCLE_360,
    isEvolution: true,
    procedural: true,
    color: '#bfefff',
    baseStats: { damage: 26, cooldown: 3.0, aoeRadius: 150, speed: 0, piercing: 99 },
  },

});

// ── Evolution recipes ───────────────────────────────────────────────
export const EVOLUTION_RECIPES = Object.freeze([
  {
    result: WEAPON_ID.STORM_CONDUCTOR,
    ingredients: [WEAPON_ID.STORM_SABER, WEAPON_ID.MAGNETIC_ARC],
    minLevel: 5,
  },
  {
    result: WEAPON_ID.PLASMA_EXECUTION,
    ingredients: [WEAPON_ID.SHADOW_TOXIC, WEAPON_ID.NEXUS_CHAKRAM],
    minLevel: 5,
  },
  {
    result: WEAPON_ID.CATACLYSM_CHAIN,
    ingredients: [WEAPON_ID.CATACLYSM_PULSE, WEAPON_ID.GAS_NEEDLE],
    minLevel: 5,
  },
  {
    result: WEAPON_ID.FROZEN_EDEN,
    ingredients: [WEAPON_ID.SPIRIT_CRESCENT, WEAPON_ID.GLITCH_TEAR],
    minLevel: 5,
  },
  // ── Depth-expansion recipes (batch 1). `owner` pins the recipe to a single
  // character (overrides ingredient-derived ownership) so each new evolution
  // stays exclusive and never leaks into another character's card rotation. ──
  {
    result: WEAPON_ID.MARROW_REACTOR,
    ingredients: [WEAPON_ID.STORM_SABER, WEAPON_ID.GAS_NEEDLE],
    minLevel: 5,
    owner: ['skeleton_warrior'],
  },
  {
    result: WEAPON_ID.REVENANT_CHOIR,
    ingredients: [WEAPON_ID.NEXUS_CHAKRAM, WEAPON_ID.GLITCH_TEAR],
    minLevel: 5,
    owner: ['skeleton_warrior'],
  },
  {
    result: WEAPON_ID.MIRROR_CASCADE,
    ingredients: [WEAPON_ID.SPIRIT_CRESCENT, WEAPON_ID.MAGNETIC_ARC],
    minLevel: 5,
    owner: ['taekwondo_girl'],
  },
  {
    result: WEAPON_ID.TEMPEST_RIBBON,
    ingredients: [WEAPON_ID.STORM_SABER, WEAPON_ID.SHADOW_TOXIC],
    minLevel: 5,
    owner: ['taekwondo_girl'],
  },
  {
    result: WEAPON_ID.CHAOS_CHORD,
    ingredients: [WEAPON_ID.SOLO_RED_THUNDER, WEAPON_ID.STORM_SABER],
    minLevel: 5,
    owner: ['eddie'],
  },
  {
    result: WEAPON_ID.GRID_REAPER,
    ingredients: [WEAPON_ID.GAS_NEEDLE, WEAPON_ID.SHADOW_TOXIC],
    minLevel: 5,
    owner: ['euclid_vector'],
  },
  {
    result: WEAPON_ID.CRYO_SOVEREIGN,
    ingredients: [WEAPON_ID.SPIRIT_CRESCENT, WEAPON_ID.MAGNETIC_ARC],
    minLevel: 5,
    owner: ['taekwondo_girl'],
  },
  {
    result: WEAPON_ID.ION_HALO,
    ingredients: [WEAPON_ID.MAGNETIC_ARC, WEAPON_ID.NEXUS_CHAKRAM],
    minLevel: 5,
    owner: ['cyber_arm_hero'],
  },
  {
    result: WEAPON_ID.NULL_LANCE,
    ingredients: [WEAPON_ID.GLITCH_TEAR, WEAPON_ID.MAGNETIC_ARC],
    minLevel: 5,
    owner: ['japan_phasewalker'],
  },
  {
    result: WEAPON_ID.EMBER_STORM,
    ingredients: [WEAPON_ID.CATACLYSM_PULSE, WEAPON_ID.SHADOW_TOXIC],
    minLevel: 5,
    owner: ['oni_cataclysm_protocol'],
  },
  {
    result: WEAPON_ID.BONECIRCUIT_STORM,
    ingredients: [WEAPON_ID.STORM_SABER, WEAPON_ID.NEXUS_CHAKRAM],
    minLevel: 5,
    owner: ['skeleton_warrior'],
  },
  {
    result: WEAPON_ID.VENOM_SHROUD,
    ingredients: [WEAPON_ID.SHADOW_TOXIC, WEAPON_ID.GLITCH_TEAR],
    minLevel: 5,
    owner: ['assassin_clone'],
  },
  {
    result: WEAPON_ID.SEISMIC_RIFT,
    ingredients: [WEAPON_ID.NEXUS_CHAKRAM, WEAPON_ID.CATACLYSM_PULSE],
    minLevel: 5,
    owner: ['brawler_warrior'],
  },
]);

// ── Character ownership (HARD LOCK) ─────────────────────────────────
// An evolution belongs ONLY to the characters whose NATIVE weapon is one
// of its ingredients. Every character owns exactly one evolution recipe.
// Foreign characters never see an unowned evolution card (no cross-
// character contamination in the level-up rotation).
export function getEvolutionOwners(recipe) {
  // Explicit owner pin (depth-expansion recipes) wins over ingredient-derived ownership.
  if (recipe.owner && recipe.owner.length) return recipe.owner;
  return recipe.ingredients
    .map(id => _weaponIndex.get(id)?.character)
    .filter(Boolean);
}
export function isEvolutionOwnedBy(recipe, characterId) {
  return getEvolutionOwners(recipe).includes(characterId);
}

// ── Dynamic card naming — NameLookupTable ───────────────────────────
// The card label reflects the WIELDER's identity. Mechanics (damage, AoE,
// cooldown) stay 100% shared — only the display string changes.
// Native wielder → canonical name. Foreign wielder → class-flavored name:
// CHAR_FLAVOR prefix + the weapon's core noun.
const WEAPON_CORE_NOUN = {
  storm_saber:      'Saber Slash',
  magnetic_arc:     'Arc Burst',
  spirit_crescent:  'Crescent Aura',
  shadow_toxic:     'Shadow Cuts',
  nexus_chakram:    'Chakram',
  gas_needle:       'Needle Vector',
  cataclysm_pulse:  'Cataclysm Pulse',
  glitch_tear:      'Singularity Tear',
  solo_red_thunder: 'Thunder Riff',
  storm_conductor:  'Storm Conductor',
  plasma_execution: 'Plasma Execution',
  cataclysm_chain:  'Cataclysm Chain',
  frozen_eden:      'Frozen Eden',
  chaos_chord:      'Chaos Chord',
  grid_reaper:      'Grid Reaper',
  cryo_sovereign:   'Cryo Sovereign',
  ion_halo:         'Ion Halo',
  null_lance:       'Null Lance',
  ember_storm:      'Ember Storm',
  bonecircuit_storm:'Bonecircuit Storm',
  venom_shroud:     'Venom Shroud',
  seismic_rift:     'Seismic Rift',
};
const CHAR_FLAVOR = {
  skeleton_warrior:       'Bone-Cursed',
  taekwondo_girl:         'Spirit',
  cyber_arm_hero:         'Inferno',
  brawler_warrior:        'Rift',
  assassin_clone:         'Phantom',
  euclid_vector:          'Toxic',
  japan_phasewalker:      'Null-Phase',
  oni_cataclysm_protocol: 'Crimson-Demon',
  eddie:                  'Thunder',
};
export function getCardDisplayName(weaponId, characterId) {
  const def = _weaponIndex.get(weaponId);
  if (!def) return weaponId;
  if (!characterId || def.character === characterId || !CHAR_FLAVOR[characterId]) return def.name;
  const core = WEAPON_CORE_NOUN[weaponId] || def.name;
  return CHAR_FLAVOR[characterId] + ' ' + core;
}

// ── Internal index for fast lookups ─────────────────────────────────
const _weaponIndex = new Map(Object.values(WEAPON_DEFS).map(w => [w.id, w]));
const _characterWeaponIndex = new Map(
  Object.values(WEAPON_DEFS)
    .filter(w => w.character !== null)
    .map(w => [w.character, w])
);

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Get a weapon definition by ID.
 * @param {string} weaponId
 * @returns {object|null}
 */
export function getWeaponDef(weaponId) {
  return _weaponIndex.get(weaponId) || null;
}

/**
 * Get scaled weapon stats at a given level (1–5).
 * Returns { damage, cooldown, aoeRadius, speed, piercing }.
 * @param {string} weaponId
 * @param {number} level — 1 to 5
 * @returns {object|null}
 */
export function getWeaponStatsAtLevel(weaponId, level) {
  const def = _weaponIndex.get(weaponId);
  if (!def) return null;
  const clampedLevel = Math.max(1, Math.min(5, level));
  const scale = LEVEL_SCALING[clampedLevel];
  const base = def.baseStats;
  return {
    damage:    Math.round(base.damage * scale.dmg),
    cooldown:  +(base.cooldown * scale.cd).toFixed(3),
    aoeRadius: Math.round(base.aoeRadius * scale.aoe),
    speed:     base.speed,
    piercing:  base.piercing,
  };
}

/**
 * Check if the player has two weapons at the required level to
 * produce an evolution. Returns the first matching recipe or null.
 * @param {{ id: string, level: number }[]} playerWeapons
 * @returns {object|null} — matching recipe { result, ingredients, minLevel }
 */
export function checkEvolutionReady(playerWeapons) {
  const ready = new Set(
    playerWeapons
      .filter(w => w.level >= 5)
      .map(w => w.id)
  );
  for (const recipe of EVOLUTION_RECIPES) {
    if (recipe.ingredients.every(id => ready.has(id))) {
      return recipe;
    }
  }
  return null;
}

/**
 * Get all evolution recipes the player qualifies for.
 * @param {{ id: string, level: number }[]} playerWeapons
 * @returns {object[]}
 */
export function checkAllEvolutionsReady(playerWeapons) {
  const ready = new Set(
    playerWeapons
      .filter(w => w.level >= 5)
      .map(w => w.id)
  );
  return EVOLUTION_RECIPES.filter(recipe =>
    recipe.ingredients.every(id => ready.has(id))
  );
}

/**
 * Get the base weapon definition that belongs to a character.
 * @param {string} characterId — e.g. 'skeleton_warrior'
 * @returns {object|null}
 */
export function getWeaponForCharacter(characterId) {
  return _characterWeaponIndex.get(characterId) || null;
}

/**
 * Get all base (non-evolution) weapons.
 * @returns {object[]}
 */
export function getAllBaseWeapons() {
  return Object.values(WEAPON_DEFS).filter(w => !w.isEvolution);
}

/**
 * Get all evolution weapons.
 * @returns {object[]}
 */
export function getAllEvolutions() {
  return Object.values(WEAPON_DEFS).filter(w => w.isEvolution);
}
