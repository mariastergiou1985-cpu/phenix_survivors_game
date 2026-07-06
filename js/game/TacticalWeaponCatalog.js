// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  TacticalWeaponCatalog.js — Second Grid Cache Weapon Definitions           ║
// ║  PHENIX: NULL EDEN                                                         ║
// ║                                                                            ║
// ║  Tactical weapons are PHYSICAL MAP OBJECTS with live hitboxes.              ║
// ║  They are 100% DECOUPLED from the player's position post-spawn.            ║
// ║  They activate independently at their drop coordinates.                    ║
// ║                                                                            ║
// ║  FX Modules A–H mapped from the master VFX sheet.                          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ── Tactical Weapon IDs ─────────────────────────────────────────────────────
export const TACTICAL_ID = Object.freeze({
  LIGHTNING_TOTEM:   'tac_lightning_totem',
  SHARD_NOVA:        'tac_shard_nova',
  VOID_TURRET:       'tac_void_turret',
  KINETIC_WAVE:      'tac_kinetic_wave',
  HUNTER_SENTRY:     'tac_hunter_sentry',
  PROXIMITY_GRID:    'tac_proximity_grid',
  GRAVITY_WELL:      'tac_gravity_well',
  RAIL_STRIKE:       'tac_rail_strike',
  MISSILE_BARRAGE:   'tac_missile_barrage',
  HEAVY_IMPACT_BURST: 'tac_heavy_impact_burst',
  EDDIE_CHORD_CURTAIN: 'eddie_chord_curtain',
  EDDIE_DOUBLE_SWORDS: 'eddie_double_swords',
  // Tactical Fusions (Nexus Weapon Visual Pack) — parents must both deploy first
  FUSION_CHAKRAM_KINETIC: 'fusion_chakram_kinetic',
  FUSION_OVERDRIVE_VOID:  'fusion_overdrive_void',
  FUSION_TOXIC_INFERNO:   'fusion_toxic_inferno',
  FUSION_IMPACT_STORM:    'fusion_impact_storm',
});

// ── FX Module Types (from master VFX sheet) ─────────────────────────────────
// A = Storm Conductor Overdrive   — Electric/EMP, 360° sparks, RGB Split
// B = Protocol 0: Total Cataclysm — Gravity/Void Collapse, Screen Tear
// C = Plasma Execution Matrix     — Shuriken/Plasma Comet, Ghost Trail
// D = Crescent Tide Glitch Vortex — Ice/Cryo Ring & Arrows, Freeze Frame
// E = Cyber Arm Hyper Beam        — Mechanical/Pulse Beam, RGB Bleed
// F = Brawler Impact Slash        — Melee/Plasma Blade, Frame Drop
// G = Euclid Toxic Protocol       — Data Spear/Poison Cloud, Palette Corruption
// H = Phasewalker Spectral Web    — Spectral Needles/Drone Grid, Desync

export const FX_MODULE = Object.freeze({
  A_STORM_CONDUCTOR:    'A',
  B_TOTAL_CATACLYSM:    'B',
  C_PLASMA_EXECUTION:   'C',
  D_CRESCENT_VORTEX:    'D',
  E_HYPER_BEAM:         'E',
  F_IMPACT_SLASH:       'F',
  G_TOXIC_PROTOCOL:     'G',
  H_SPECTRAL_WEB:       'H',
});

// ── Behavior Types ──────────────────────────────────────────────────────────
export const TACTICAL_BEHAVIOR = Object.freeze({
  STATIONARY_TOTEM:    'stationary_totem',      // Fixed position, periodic AoE
  GROUND_SHOCKWAVE:    'ground_shockwave',      // Expanding ring from drop point
  LINEAR_BEAM:         'linear_beam',           // Directional beam cannon
  HORIZONTAL_SLASH:    'horizontal_slash',      // Wide slash wave
  AUTONOMOUS_DRONE:    'autonomous_drone',      // Free-flying, independent patrol
  PROXIMITY_MINE:      'proximity_mine',        // Detonates on enemy proximity
  GRAVITY_SINGULARITY: 'gravity_singularity',   // Pulls enemies + explodes
  KINETIC_RAIN:        'kinetic_rain',          // Falling projectiles in area
  HOMING_VOLLEY:       'homing_volley',         // Auto-targeting missiles
  CHORD_RAIN:          'chord_rain',            // Map-wide falling chord-fragment waves
  SWORD_BURST:         'sword_burst',           // Periodic piercing twin-blade launches
});

// ── Tactical Weapon Definitions ─────────────────────────────────────────────
export const TACTICAL_DEFS = Object.freeze({

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 1. CYBER SKELETON — Lightning Blade Totem                       ║
  // ║    Module A: Storm Conductor Overdrive                          ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.LIGHTNING_TOTEM]: {
    id:          TACTICAL_ID.LIGHTNING_TOTEM,
    name:        'Lightning Blade Totem',
    description: '360° rotating electric totem emitting EMP sparks and crosshair particles',
    character:   'skeleton_warrior',
    fxModule:    FX_MODULE.A_STORM_CONDUCTOR,
    behavior:    TACTICAL_BEHAVIOR.STATIONARY_TOTEM,
    sprite:      'assets/weapons/tactical/tac_lightning_totem.png',
    baseDamage:  75,
    aoeRadius:   200,
    tickRate:     0.8,    // seconds between pulses
    duration:    12,      // seconds active
    color:       '#00ccff',
    glitchFx: {
      rgbSplit:   true,   // RGB channel offset on hit
      frameSkip:  true,   // brief animation stutter
    },
    particles: {
      type:       'electric_sparks',
      crosshair:  true,   // "+" shaped particle bursts
      count:      12,
      speed:      3.5,
      color1:     '#00ccff',
      color2:     '#ffffff',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 2. NEON TAEKWONDO — Electric Shard Nova                         ║
  // ║    Module D: Crescent Tide Glitch Vortex                        ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.SHARD_NOVA]: {
    id:          TACTICAL_ID.SHARD_NOVA,
    name:        'Electric Shard Nova',
    description: 'Standing cryo ring grid projecting geometric ice shards with freeze-frame lag',
    character:   'taekwondo_girl',
    fxModule:    FX_MODULE.D_CRESCENT_VORTEX,
    behavior:    TACTICAL_BEHAVIOR.GROUND_SHOCKWAVE,
    sprite:      'assets/weapons/tactical/tac_shard_nova.png',
    baseDamage:  68,
    aoeRadius:   240,
    tickRate:     1.2,
    duration:    10,
    color:       '#44ddff',
    glitchFx: {
      freezeFrame: true,  // momentary game freeze on detonation
      gridLock:    true,  // grid pattern overlay
    },
    particles: {
      type:       'cryo_shards',
      arrows:     true,   // arrow smear trails
      count:      8,
      speed:      4.0,
      color1:     '#88eeff',
      color2:     '#ffffff',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 3. CYBER SKELETON — Heavy Void Turret (Nexus pack reassignment) ║
  // ║    Module E: Cyber Arm Hyper Beam                                ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.VOID_TURRET]: {
    id:          TACTICAL_ID.VOID_TURRET,
    name:        'Heavy Void Turret',
    description: 'Linear mechanical beam cannon projecting code debris with heavy RGB color bleeding',
    character:   'skeleton_warrior',
    fxModule:    FX_MODULE.E_HYPER_BEAM,
    behavior:    TACTICAL_BEHAVIOR.LINEAR_BEAM,
    sprite:      'assets/weapons/nexus/skeleton_nexus_heavy_void_turret.png',
    baseDamage:  95,
    beamLength:  500,
    beamWidth:   24,
    tickRate:     1.5,
    duration:    14,
    color:       '#ff8800',
    glitchFx: {
      rgbBleed:    true,  // heavy RGB color bleed on beam
      tearHoriz:   true,  // horizontal screen tear lines
    },
    particles: {
      type:       'code_debris',
      pulseWaves: true,   // beam pulse wave expanding
      count:      6,
      speed:      2.5,
      color1:     '#ffaa00',
      color2:     '#ff4400',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 4. NEON TAEKWONDO — Thermal Kinetic Wave (Nexus pack reassignment) ║
  // ║    Module F: Brawler Impact Slash                                ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.KINETIC_WAVE]: {
    id:          TACTICAL_ID.KINETIC_WAVE,
    name:        'Thermal Kinetic Wave',
    description: 'Horizontal slicing wave with blade smear frames, vertical floor spikes, and 0.05s hit-stops',
    character:   'taekwondo_girl',
    fxModule:    FX_MODULE.F_IMPACT_SLASH,
    behavior:    TACTICAL_BEHAVIOR.HORIZONTAL_SLASH,
    sprite:      'assets/weapons/nexus/taekwondo_thermal_kinetic_wave.png',
    baseDamage:  85,
    slashWidth:  400,
    slashHeight: 60,
    tickRate:     1.0,
    duration:    11,
    color:       '#44ccff',
    hitStopMs:   50,       // 0.05s engine hit-stop per strike
    glitchFx: {
      frameDrop:   true,  // momentary frame drop simulation
      vectorFlash: true,  // white vector flash on impact
    },
    particles: {
      type:       'slash_smear',
      spikes:     true,   // vertical floor spike explosions
      count:      10,
      speed:      5.0,
      color1:     '#66ddff',
      color2:     '#ffffff',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 4b. BRAWLER WARRIOR — Heavy Impact Burst (Nexus pack)           ║
  // ║     Clone of Thermal Kinetic Wave — same behavior & numbers.     ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.HEAVY_IMPACT_BURST]: {
    id:          TACTICAL_ID.HEAVY_IMPACT_BURST,
    name:        'Heavy Impact Burst',
    description: 'Horizontal slicing impact wave with blade smear frames, vertical floor spikes, and 0.05s hit-stops',
    character:   'brawler_warrior',
    fxModule:    FX_MODULE.F_IMPACT_SLASH,
    behavior:    TACTICAL_BEHAVIOR.HORIZONTAL_SLASH,
    sprite:      'assets/weapons/nexus/brawler_heavy_impact_burst.png',
    baseDamage:  85,
    slashWidth:  400,
    slashHeight: 60,
    tickRate:     1.0,
    duration:    11,
    color:       '#44ccff',
    hitStopMs:   50,
    glitchFx: {
      frameDrop:   true,
      vectorFlash: true,
    },
    particles: {
      type:       'slash_smear',
      spikes:     true,
      count:      10,
      speed:      5.0,
      color1:     '#66ddff',
      color2:     '#ffffff',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 5. ASSASSIN CLONE — Hunter-Killer Sentry                        ║
  // ║    Module C: Plasma Execution Matrix                             ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.HUNTER_SENTRY]: {
    id:          TACTICAL_ID.HUNTER_SENTRY,
    name:        'Hunter-Killer Sentry',
    description: 'Free-flying autonomous drone with emissive comet trails and ghost afterimages',
    character:   'assassin_clone',
    fxModule:    FX_MODULE.C_PLASMA_EXECUTION,
    behavior:    TACTICAL_BEHAVIOR.AUTONOMOUS_DRONE,
    sprite:      'assets/weapons/tactical/tac_hunter_sentry.png',
    baseDamage:  72,
    patrolRadius: 280,
    flySpeed:    3.0,
    tickRate:     0.6,
    duration:    15,
    color:       '#cc44ff',
    glitchFx: {
      ghostTrail:  true,  // afterimage trail behind drone
      pixelShred:  true,  // pixel shred on kill
    },
    particles: {
      type:       'comet_trail',
      afterimage: true,   // ghost afterimages at prior positions
      count:      5,
      speed:      2.0,
      color1:     '#bb44ff',
      color2:     '#ff66ff',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 6. EUCLID VECTOR — Cluster Proximity Grid                       ║
  // ║    Module G: Euclid Toxic Protocol                               ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.PROXIMITY_GRID]: {
    id:          TACTICAL_ID.PROXIMITY_GRID,
    name:        'Cluster Proximity Grid',
    description: 'Stationary floor mines bursting into binary 0/1 particles with enemy palette corruption',
    character:   'euclid_vector',
    fxModule:    FX_MODULE.G_TOXIC_PROTOCOL,
    behavior:    TACTICAL_BEHAVIOR.PROXIMITY_MINE,
    sprite:      'assets/weapons/tactical/tac_proximity_grid.png',
    baseDamage:  60,
    mineCount:   5,
    triggerRadius: 80,
    blastRadius:  140,
    duration:    20,
    color:       '#44ff44',
    glitchFx: {
      paletteCorruption: true,  // enemy color swap on hit
      horizTrail:        true,  // horizontal data trail
    },
    particles: {
      type:       'binary_burst',
      dataSmoke:  true,   // toxic data cloud
      count:      16,
      speed:      2.0,
      color1:     '#00ff44',
      color2:     '#88ff88',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 7. ONI CATACLYSM — Spatial Gravity Well                         ║
  // ║    Module B: Protocol 0: Total Cataclysm                         ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.GRAVITY_WELL]: {
    id:          TACTICAL_ID.GRAVITY_WELL,
    name:        'Spatial Gravity Well',
    description: 'Vacuum black hole singularity → fullscreen apocalyptic explosion with map screen tearing',
    character:   'oni_cataclysm_protocol',
    exclusive:   true,    // Oni-only, never leaks to other characters
    fxModule:    FX_MODULE.B_TOTAL_CATACLYSM,
    behavior:    TACTICAL_BEHAVIOR.GRAVITY_SINGULARITY,
    sprite:      'assets/weapons/tactical/tac_gravity_well.png',
    baseDamage:  160,
    pullRadius:  300,
    pullForce:   2.5,
    collapseTime: 2.0,   // seconds of vacuum pull before detonation
    blastRadius:  450,
    duration:    12,
    color:       '#ff3030',
    glitchFx: {
      screenTear:  true,  // full screen tear on detonation
      invertFlash: true,  // inverted color flash
    },
    particles: {
      type:       'void_debris',
      voidDistortion: true,
      count:      20,
      speed:      1.5,
      color1:     '#ff2200',
      color2:     '#440000',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 8. JAPAN PHASEWALKER — Hyper-Velocity Rail Strike                ║
  // ║    Module H: Phasewalker Spectral Web                            ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.RAIL_STRIKE]: {
    id:          TACTICAL_ID.RAIL_STRIKE,
    name:        'Hyper-Velocity Rail Strike',
    description: 'Falling kinetic railgun spikes linking into geometric web, 20px target desynchronization',
    character:   'japan_phasewalker',
    fxModule:    FX_MODULE.H_SPECTRAL_WEB,
    behavior:    TACTICAL_BEHAVIOR.KINETIC_RAIN,
    sprite:      'assets/weapons/tactical/tac_rail_strike.png',
    baseDamage:  80,
    spikeCount:  6,
    aoeRadius:   200,
    desyncPx:    20,      // target rendering desync offset
    tickRate:     1.4,
    duration:    12,
    color:       '#aa66ff',
    glitchFx: {
      desync:        true,  // 20px rendering desynchronization
      invertColors:  true,  // inverted colors on hit
    },
    particles: {
      type:       'spectral_needles',
      droneGrid:  true,   // geometric web pattern
      count:      8,
      speed:      6.0,
      color1:     '#9944ff',
      color2:     '#cc88ff',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 9. GLOBAL CACHE DROP — Missile Barrage Overdrive                 ║
  // ║    Universal Flare Flashes                                       ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.MISSILE_BARRAGE]: {
    id:          TACTICAL_ID.MISSILE_BARRAGE,
    name:        'Missile Barrage Overdrive',
    description: 'Auto-navigating homing missiles sweeping across the entire screen layout',
    character:   null,     // GLOBAL — any character can receive
    fxModule:    null,     // Uses Universal Flare Flashes
    behavior:    TACTICAL_BEHAVIOR.HOMING_VOLLEY,
    sprite:      'assets/weapons/nexus/arm_missile_barrage_overdrive.png',
    baseDamage:  90,
    missileCount: 8,
    missileSpeed: 5.5,
    homingForce:  0.08,
    tickRate:     0.5,
    duration:    14,
    color:       '#ffcc00',
    glitchFx: {
      flareFlash: true,   // bright universal flare on impact
    },
    particles: {
      type:       'missile_trail',
      flare:      true,   // impact flare flashes
      count:      8,
      speed:      5.5,
      color1:     '#ffcc00',
      color2:     '#ff8800',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 10. EDDIE — Eddie Chord Curtain (GRID CACHE)                     ║
  // ║     Module A: Storm Conductor Overdrive                          ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.EDDIE_CHORD_CURTAIN]: {
    id:          TACTICAL_ID.EDDIE_CHORD_CURTAIN,
    name:        'Eddie Chord Curtain',
    description: 'GRID CACHE — rains red thunder chords across the map',
    character:   'eddie',
    exclusive:   true,    // Eddie-only, never leaks to other characters (mirrors GRAVITY_WELL)
    fxModule:    FX_MODULE.A_STORM_CONDUCTOR,
    behavior:    TACTICAL_BEHAVIOR.CHORD_RAIN,
    sprite:      'assets/weapons/tactical/tac_eddie_chord_curtain.png',
    baseDamage:  30,
    aoeRadius:   60,
    tickRate:     2.2,    // seconds between fragment waves
    duration:    14,      // seconds active
    color:       '#ff2d2d',
    glitchFx: {
      rgbSplit:   true,
    },
    particles: {
      type:       'electric_sparks',
      count:      8,
      speed:      3.0,
      color1:     '#ff2d2d',
      color2:     '#ffd23c',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ 11. EDDIE — Nexus Eddie Double Swords (BURST)                    ║
  // ║     Module F: Brawler Impact Slash                               ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.EDDIE_DOUBLE_SWORDS]: {
    id:          TACTICAL_ID.EDDIE_DOUBLE_SWORDS,
    name:        'Nexus Eddie Double Swords',
    description: 'BURST — launches twin inferno blades through enemy lines',
    character:   'eddie',
    exclusive:   true,    // Eddie-only, never leaks to other characters
    fxModule:    FX_MODULE.F_IMPACT_SLASH,
    behavior:    TACTICAL_BEHAVIOR.SWORD_BURST,
    sprite:      'assets/weapons/nexus/eddie_double_swords.png',
    baseDamage:  55,
    swathRadius: 54,
    swordSpeed:  520,
    tickRate:     8.0,    // seconds between blade launches
    duration:    24,      // seconds active (~3 launches)
    color:       '#ff6a1a',
    glitchFx: {
      vectorFlash: true,
    },
    particles: {
      type:       'slash_smear',
      count:      6,
      speed:      4.0,
      color1:     '#ff6a1a',
      color2:     '#ffd23c',
    },
  },

  // ╔═══════════════════════════════════════════════════════════════════╗
  // ║ TACTICAL FUSIONS — Nexus Weapon Visual Pack                      ║
  // ║ Offered only when BOTH parent tacticals were deployed this run.  ║
  // ║ character '__fusion__' + exclusive keep them out of the normal   ║
  // ║ getAvailableTactical() pool. Stats derived from parents:         ║
  // ║ dmg = round((A+B)*0.75), duration = max, tickRate = min of the   ║
  // ║ parents that define one. Behaviors inherited — zero new mechanics.║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.FUSION_CHAKRAM_KINETIC]: {
    id:          TACTICAL_ID.FUSION_CHAKRAM_KINETIC,
    name:        'Chakram Kinetic Storm',
    description: 'Kinetic slash wave supercharged by barrage overdrive cadence',
    character:   '__fusion__',
    exclusive:   true,
    fusion:      true,
    parents:     [TACTICAL_ID.KINETIC_WAVE, TACTICAL_ID.MISSILE_BARRAGE],
    fxModule:    FX_MODULE.F_IMPACT_SLASH,
    behavior:    TACTICAL_BEHAVIOR.HORIZONTAL_SLASH,
    sprite:      'assets/weapons/nexus/evolution/nexus_taekwondo_evol_chakram_kinetic_wave.png',
    baseDamage:  113,     // Math.round((85 + 65) * 0.75)
    slashWidth:  400,
    slashHeight: 60,
    tickRate:     0.5,    // min(1.0, 0.5)
    duration:    11,      // max(11, 10)
    color:       '#44ccff',
    hitStopMs:   50,
    glitchFx: { frameDrop: true, vectorFlash: true },
    particles: { type: 'slash_smear', spikes: true, count: 10, speed: 5.0, color1: '#66ddff', color2: '#ffffff' },
  },

  [TACTICAL_ID.FUSION_OVERDRIVE_VOID]: {
    id:          TACTICAL_ID.FUSION_OVERDRIVE_VOID,
    name:        'Overdrive Void Barrage',
    description: 'Homing barrage volley charged with void-turret firepower',
    character:   '__fusion__',
    exclusive:   true,
    fusion:      true,
    parents:     [TACTICAL_ID.MISSILE_BARRAGE, TACTICAL_ID.VOID_TURRET],
    fxModule:    null,
    behavior:    TACTICAL_BEHAVIOR.HOMING_VOLLEY,
    sprite:      'assets/weapons/nexus/evolution/arm_nexus_evol_overdrive_void_barrage.png',
    baseDamage:  120,     // Math.round((65 + 95) * 0.75)
    missileCount: 8,
    missileSpeed: 5.5,
    homingForce:  0.08,
    tickRate:     0.5,    // min(0.5, 1.5)
    duration:    14,      // max(10, 14)
    color:       '#ffcc00',
    glitchFx: { flareFlash: true },
    particles: { type: 'missile_trail', flare: true, count: 8, speed: 5.5, color1: '#ffcc00', color2: '#ff8800' },
  },

  [TACTICAL_ID.FUSION_TOXIC_INFERNO]: {
    id:          TACTICAL_ID.FUSION_TOXIC_INFERNO,
    name:        'Toxic Inferno Fangs',
    description: 'Autonomous hunter drone burning with cataclysm venom',
    character:   '__fusion__',
    exclusive:   true,
    fusion:      true,
    parents:     [TACTICAL_ID.HUNTER_SENTRY, TACTICAL_ID.GRAVITY_WELL],
    fxModule:    FX_MODULE.C_PLASMA_EXECUTION,
    behavior:    TACTICAL_BEHAVIOR.AUTONOMOUS_DRONE,
    sprite:      'assets/weapons/nexus/evolution/oni_assassin_evol_toxic_inferno_fangs.png',
    baseDamage:  137,     // Math.round((72 + 110) * 0.75)
    patrolRadius: 280,
    flySpeed:    3.0,
    tickRate:     0.6,    // min of parents defining one (GRAVITY_WELL has none)
    duration:    15,      // max(15, 8)
    color:       '#cc44ff',
    glitchFx: { ghostTrail: true, pixelShred: true },
    particles: { type: 'comet_trail', afterimage: true, count: 5, speed: 2.0, color1: '#bb44ff', color2: '#ff66ff' },
  },

  [TACTICAL_ID.FUSION_IMPACT_STORM]: {
    id:          TACTICAL_ID.FUSION_IMPACT_STORM,
    name:        'Magnetic Impact Storm',
    description: 'Expanding impact shockwaves seeded with proximity charge bursts',
    character:   '__fusion__',
    exclusive:   true,
    fusion:      true,
    parents:     [TACTICAL_ID.HEAVY_IMPACT_BURST, TACTICAL_ID.PROXIMITY_GRID],
    fxModule:    FX_MODULE.G_TOXIC_PROTOCOL,
    behavior:    TACTICAL_BEHAVIOR.GROUND_SHOCKWAVE,
    sprite:      'assets/weapons/nexus/evolution/brawler_euclid_evol_magnetic_impact_storm.png',
    baseDamage:  109,     // Math.round((85 + 60) * 0.75)
    aoeRadius:   240,     // neither parent defines aoeRadius — engine default for ground_shockwave
    tickRate:     1.0,    // min of parents defining one (PROXIMITY_GRID has none)
    duration:    20,      // max(11, 20)
    color:       '#44ccff',
    glitchFx: { frameDrop: true, vectorFlash: true },
    particles: { type: 'binary_burst', dataSmoke: true, count: 16, speed: 2.0, color1: '#00ff44', color2: '#88ff88' },
  },
});

// ── Tactical Fusions (Nexus pack) — offered by Game when both parents deployed ──
export const FUSION_TACTICALS = Object.freeze([
  TACTICAL_DEFS[TACTICAL_ID.FUSION_CHAKRAM_KINETIC],
  TACTICAL_DEFS[TACTICAL_ID.FUSION_OVERDRIVE_VOID],
  TACTICAL_DEFS[TACTICAL_ID.FUSION_TOXIC_INFERNO],
  TACTICAL_DEFS[TACTICAL_ID.FUSION_IMPACT_STORM],
]);

// ── Helper Functions ────────────────────────────────────────────────────────

/** Get all tactical weapon definitions */
export function getAllTacticalWeapons() {
  return Object.values(TACTICAL_DEFS);
}

/** Get tactical weapon definition by ID */
export function getTacticalDef(id) {
  return TACTICAL_DEFS[id] || null;
}

/** Get the tactical weapon for a specific character */
export function getTacticalForCharacter(characterId) {
  for (const def of Object.values(TACTICAL_DEFS)) {
    if (def.character === characterId) return def;
  }
  return null;
}

/** Get all tactical weapons available to a character (own + global) */
export function getAvailableTactical(characterId) {
  return Object.values(TACTICAL_DEFS).filter(
    d => d.character === null || d.character === characterId
  );
}

/** Preload all tactical weapon sprites and return a Map<id, Image> */
export function preloadTacticalSprites() {
  const cache = new Map();
  for (const def of Object.values(TACTICAL_DEFS)) {
    const img = new Image();
    img.src = def.sprite;
    img.onerror = () => console.warn('[TacticalWeapon] Failed to load sprite:', def.sprite);
    cache.set(def.id, img);
  }
  return cache;
}
