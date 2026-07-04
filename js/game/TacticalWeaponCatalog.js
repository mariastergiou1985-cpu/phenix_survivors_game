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
  // ║ 3. CYBER ARM HERO — Heavy Void Turret                           ║
  // ║    Module E: Cyber Arm Hyper Beam                                ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.VOID_TURRET]: {
    id:          TACTICAL_ID.VOID_TURRET,
    name:        'Heavy Void Turret',
    description: 'Linear mechanical beam cannon projecting code debris with heavy RGB color bleeding',
    character:   'cyber_arm_hero',
    fxModule:    FX_MODULE.E_HYPER_BEAM,
    behavior:    TACTICAL_BEHAVIOR.LINEAR_BEAM,
    sprite:      'assets/weapons/tactical/tac_void_turret.png',
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
  // ║ 4. BRAWLER WARRIOR — Thermal Kinetic Wave                       ║
  // ║    Module F: Brawler Impact Slash                                ║
  // ╚═══════════════════════════════════════════════════════════════════╝
  [TACTICAL_ID.KINETIC_WAVE]: {
    id:          TACTICAL_ID.KINETIC_WAVE,
    name:        'Thermal Kinetic Wave',
    description: 'Horizontal slicing wave with blade smear frames, vertical floor spikes, and 0.05s hit-stops',
    character:   'brawler_warrior',
    fxModule:    FX_MODULE.F_IMPACT_SLASH,
    behavior:    TACTICAL_BEHAVIOR.HORIZONTAL_SLASH,
    sprite:      'assets/weapons/tactical/tac_kinetic_wave.png',
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
    baseDamage:  110,
    pullRadius:  300,
    pullForce:   2.5,
    collapseTime: 2.0,   // seconds of vacuum pull before detonation
    blastRadius:  450,
    duration:    8,
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
    sprite:      'assets/weapons/tactical/tac_missile_barrage.png',
    baseDamage:  65,
    missileCount: 8,
    missileSpeed: 5.5,
    homingForce:  0.08,
    tickRate:     0.5,
    duration:    10,
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
});

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
