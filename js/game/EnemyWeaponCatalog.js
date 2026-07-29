/**
 * EnemyWeaponCatalog.js — PHENIX: NULL EDEN
 * ──────────────────────────────────────────
 * Data-only weapon catalog + pure helpers. No imports, no I/O, no side effects
 * at module load: it builds frozen data structures and nothing else.
 *
 * Design source of truth:
 *   assets/enemies/weapons/EnemyWeaponCatalogV1.json
 *   assets/enemies/weapons/ENEMY_WEAPON_MAPPING_V1.md
 *
 * SPRITE PATHS: the JSON spec points at assets/enemies/weapons/sprites/ — those are
 * the RAW reference cutouts with black backgrounds. The runtime sprites the game
 * actually loads are the alpha-cleaned copies in assets/effects/attacks/, so every
 * spritePath below points there. Do NOT repoint these at the reference folder.
 *
 * BACKWARD COMPAT: WEAPON_BEHAVIOR, ENEMY_WEAPONS, PRIMARY_WEAPON_MAP,
 * BOSS_WEAPON_MAP, MINI_WEAPON_MAP, getWeaponById(), getWeaponsForEnemy() keep
 * exactly the shape and values Enemy.js consumes today. The kebab-case maps and
 * the per-weapon `ownerEnemyTypes` / `speed` fields are unchanged; everything new
 * is additive.
 */

// ── Weapon behavior types ────────────────────────────────────────────
export const WEAPON_BEHAVIOR = Object.freeze({
  PROJECTILE:           'projectile',
  FAST_PROJECTILE:      'fast_projectile',
  HEAVY_PROJECTILE:     'heavy_projectile',
  PIERCING_PROJECTILE:  'piercing_projectile',
  ARC_PROJECTILE:       'arc_projectile',
  BEAM:                 'beam',
  SHORT_PULSE:          'short_pulse',
  SLASH_WAVE:           'slash_wave',
  SLASH_ARC:            'slash_arc',
  ORB_EXPLOSION:        'orb_explosion',
  BOOMERANG:            'boomerang',
});

/**
 * Every field a catalog weapon is contractually required to carry.
 * validateCatalog() enforces presence + type for all of these.
 */
export const REQUIRED_WEAPON_FIELDS = Object.freeze([
  'id',
  'displayName',
  'spritePath',
  'behavior',
  'ownerTypes',
  'damage',
  'cooldown',
  'telegraphTime',
  'telegraphRequired',
  'range',
  'projectileSpeed',
  'impactRadius',
  'impactEffect',
  'hitShape',
  'notes',
]);

// ── Engagement-range bands (world px) ────────────────────────────────
// One place for "how far does this behavior family reach". Beams/lances are the
// long end, cone/arc melee waves the short end. Referenced by the defs below so
// no caller ever has to guess a distance.
const RANGE = Object.freeze({
  ARC_LOB:    520,   // lobbed comet — arcs, so it does not reach as far as a flat shot
  SHORT_ARC:  210,   // close arc slash
  CONE_WAVE:  300,   // blade wave / cone slash
  BOOMERANG:  460,   // out-and-back, range is the outbound leg
  ORB:        560,   // slow travelling orb
  HEAVY:      600,   // heavy slow projectile
  LIGHT:      600,   // light fast bolt
  STANDARD:   640,   // ordinary aimed projectile
  TOXIC:      660,
  FROST:      620,
  BEAM_MID:   780,   // pulse/arc beam
  PIERCE:     800,   // piercing line
  NEEDLE:     820,   // sniper needle
  LANCE:      860,   // heavy piercing star lance
  BEAM_LONG:  900,   // full ritual beam
});

// ─────────────────────────────────────────────────────────────────────
// ENEMY_TYPE_WEAPONS — REAL enemyType display name → weapon ids
// ─────────────────────────────────────────────────────────────────────
// Declared BEFORE ENEMY_WEAPONS because each weapon's `ownerTypes` array is
// DERIVED from this map (single source of truth — the two can never drift).
//
// Keys are the exact `enemyType` strings the game constructs, taken from the
// spriteMap + _initRole switch in js/entities/Enemy.js. Enemy.js derives its
// catalog key as enemyType.toLowerCase().replace(/ /g,'-'); the legacy kebab
// maps further down keep that lookup working untouched.
//
// ART-NAME → REAL enemyType REMAPS
// EnemyWeaponCatalogV1.json names seven "bosses", but six of those names are
// only ART FILES (assets/enemies/minis/<name>.png) reused by a differently named
// enemy type. The JSON's weapon set is therefore attached to the enemyType that
// actually wears that art (per Enemy.js spriteMap, lines ~573-578):
//
//   JSON boss key      art file                 REAL enemyType that uses it
//   ─────────────────  ───────────────────────  ──────────────────────────
//   forge_mauler       minis/forge-mauler       Combat Hunter
//   cryo_warden        minis/cryo-warden        Scrap Scavenger
//   null_hierophant    minis/null-hierophant    Cyber-Net Junkie
//   pale_bloodknight   minis/pale-bloodknight   Overclocked Berserker
//   rail_reaper        minis/rail-reaper        Cyber Shooter
//   reactor_colossus   minis/reactor-colossus   Heavy Mech
//   solar_tyrant       minis/solar-tyrant       Solar Tyrant  (no remap — real type)
//
// Two interpretive owner remaps from the JSON's free-text `owners` strings:
//   blacknet_scythe_arc "Stealth Aberration-style enemies" → Stealth Infiltrator
//   toxic_data_spear    "AI Rogue-style enemies"           → Cyber Shooter
//     (the JSON's own "AI Rogue elite" is rail_reaper's biome, and rail-reaper
//      art belongs to Cyber Shooter — so the spear lands there, not on the
//      Rogue AI Overlord.)
//
// ORDERING RULE: where a legacy kebab map already assigns a primary weapon for
// an enemy, that weapon is kept in slot 0 so wiring this map up later cannot
// silently change the armament enemies fire today. The JSON's remaining weapons
// follow in spec order.
//
// NOT LISTED (deliberate): Razorhound and Cybermote are contact/melee-only —
// a Bloodfang pack minion and an airstrike mote — and have no weapon identity.
export const ENEMY_TYPE_WEAPONS = Object.freeze({
  // ── Primary / base roster ──────────────────────────────────────────
  'Glitch Drone':            Object.freeze(['aether_crescent_chakram', 'eden_star_lance']),
  'Rogue Punk':              Object.freeze(['aether_crescent_chakram']),
  'Stealth Infiltrator':     Object.freeze(['eden_star_lance', 'blacknet_scythe_arc']),
  'Security Defector Mech':  Object.freeze(['arc_circuit_beam']),
  'Rogue AI Overlord':       Object.freeze(['eden_star_lance', 'null_sigil_beam', 'abyss_rift_blade',
                                            'blacknet_scythe_arc', 'cryo_shard_lance']),

  // ── Remapped art-name bosses (see table above) ─────────────────────
  'Combat Hunter':           Object.freeze(['eden_star_lance', 'magma_reaver_lance',
                                            'void_ember_comet', 'solar_halo_bolt']),   // forge_mauler set
  'Scrap Scavenger':         Object.freeze(['aether_crescent_chakram', 'cryo_shard_lance',
                                            'arc_circuit_beam']),                      // cryo_warden set
  'Cyber-Net Junkie':        Object.freeze(['cryo_shard_lance', 'null_sigil_beam',
                                            'arc_circuit_beam', 'null_rupture_orb']),  // null_hierophant set
  'Overclocked Berserker':   Object.freeze(['abyss_rift_blade', 'blacknet_scythe_arc',
                                            'null_rupture_orb']),                      // pale_bloodknight set
  'Cyber Shooter':           Object.freeze(['aether_crescent_chakram', 'eden_star_lance',
                                            'violet_spectral_needle', 'toxic_data_spear',
                                            'seraph_vector_javelin']),                 // rail_reaper set
  'Heavy Mech':              Object.freeze(['arc_circuit_beam', 'magma_reaver_lance',
                                            'solar_halo_bolt']),                       // reactor_colossus set

  // ── Gold / premium elite (JSON solar_tyrant, name is already real) ─
  'Solar Tyrant':            Object.freeze(['solar_halo_bolt', 'seraph_vector_javelin', 'eden_star_lance']),

  // ── Mini enemies (JSON mini_assignments, names already real) ───────
  'Abyss Maw':               Object.freeze(['null_rupture_orb', 'abyss_rift_blade']),
  'Amethyst Fang':           Object.freeze(['violet_spectral_needle', 'prism_wing_bolt']),
  'Cryo Claw':               Object.freeze(['cryo_shard_lance']),
  'Ember Scarab':            Object.freeze(['void_ember_comet', 'magma_reaver_lance']),
  'Pulse Burrower':          Object.freeze(['arc_circuit_beam', 'aether_crescent_chakram']),
  'Rift Eye':                Object.freeze(['null_sigil_beam', 'null_rupture_orb']),
  'Solar Stinger':           Object.freeze(['solar_halo_bolt', 'seraph_vector_javelin']),
  'Toxin Leech':             Object.freeze(['toxic_data_spear']),
  'Void Widow':              Object.freeze(['blacknet_scythe_arc', 'violet_spectral_needle']),
  'Volt Rat':                Object.freeze(['arc_circuit_beam', 'toxic_data_spear']),

  // ── Chaos-only roster ──────────────────────────────────────────────
  // NOT present in EnemyWeaponCatalogV1.json (the art pack predates Chaos mode).
  // Assigned here by BEHAVIOR FAMILY only — reusing the same 15 authored weapons,
  // no new ids, no new art. Swap freely; nothing reads this yet.
  'Neon Swarmer':            Object.freeze(['prism_wing_bolt']),
  'Data Glitch Stalker':     Object.freeze(['violet_spectral_needle', 'blacknet_scythe_arc']),
  'Plasma Juggernaut':       Object.freeze(['magma_reaver_lance', 'arc_circuit_beam']),
  'Overclocked Bomber':      Object.freeze(['null_rupture_orb', 'void_ember_comet']),
  'EMP Hacker Drone':        Object.freeze(['arc_circuit_beam']),
  'Cyber-Axe Executioner':   Object.freeze(['abyss_rift_blade', 'blacknet_scythe_arc']),
  'Malware Spreader':        Object.freeze(['toxic_data_spear']),
  'Void Rift Summoner':      Object.freeze(['null_sigil_beam', 'null_rupture_orb']),
  'Wireframe Net-Caster':    Object.freeze(['aether_crescent_chakram']),
  'Singularity Core Mech':   Object.freeze(['null_sigil_beam', 'arc_circuit_beam']),

  // ── Chaos Mega Titans ──────────────────────────────────────────────
  'Giga-Core Overlord':      Object.freeze(['arc_circuit_beam', 'magma_reaver_lance', 'eden_star_lance']),
  'Malware Leviathan':       Object.freeze(['toxic_data_spear', 'null_rupture_orb', 'abyss_rift_blade']),
  'Quantum Void Emperor':    Object.freeze(['null_sigil_beam', 'null_rupture_orb', 'violet_spectral_needle']),
  'Apocalypse Mech Tyrant':  Object.freeze(['magma_reaver_lance', 'arc_circuit_beam', 'seraph_vector_javelin']),
});

// ── Weapon definitions (pre-ownerTypes) ──────────────────────────────
// `damage` / `speed` / `cooldown` / `telegraphTime` are UNCHANGED from the
// shipped catalog — no balance drift. `telegraphRequired` mirrors
// EnemyWeaponCatalogV1.json exactly. `projectileSpeed` is an explicit alias of
// `speed` (0 for hitscan beams and stationary arc slashes). `range` and
// `impactRadius` are new, expressed in world px so callers never hardcode one.
const _WEAPON_DEFS = [
  {
    id: 'void_ember_comet',
    displayName: 'Void Ember Comet',
    spritePath: 'assets/effects/attacks/void_ember_comet.png',
    ownerEnemyTypes: ['forge-mauler', 'ember-scarab'],
    behavior: WEAPON_BEHAVIOR.ARC_PROJECTILE,
    damage: 10,
    speed: 380,
    projectileSpeed: 380,
    cooldown: 2.8,
    telegraphTime: 0,
    telegraphRequired: false,
    range: RANGE.ARC_LOB,
    impactRadius: 70,
    hitShape: 'circle_aoe',
    impactEffect: 'ember_burst',
    notes: 'Medium AoE impact, ember burst. Screen shake boss version only.',
  },
  {
    id: 'null_sigil_beam',
    displayName: 'Null Sigil Beam',
    spritePath: 'assets/effects/attacks/null_sigil_beam.png',
    ownerEnemyTypes: ['null-hierophant', 'rift-eye'],
    behavior: WEAPON_BEHAVIOR.BEAM,
    damage: 6,
    speed: 0,
    projectileSpeed: 0,
    cooldown: 4.0,
    telegraphTime: 0.8,
    telegraphRequired: true,
    range: RANGE.BEAM_LONG,
    impactRadius: 26,          // half-width of the damaging beam band
    hitShape: 'line_beam',
    impactEffect: 'null_sigil_flash',
    notes: 'Telegraph line first, then continuous tick damage.',
  },
  {
    id: 'violet_spectral_needle',
    displayName: 'Violet Spectral Needle',
    spritePath: 'assets/effects/attacks/violet_spectral_needle.png',
    ownerEnemyTypes: ['rail-reaper', 'amethyst-fang', 'void-widow'],
    behavior: WEAPON_BEHAVIOR.FAST_PROJECTILE,
    damage: 14,
    speed: 720,
    projectileSpeed: 720,
    cooldown: 2.2,
    telegraphTime: 0,
    telegraphRequired: false,
    range: RANGE.NEEDLE,
    impactRadius: 10,          // deliberately tiny — spec calls for a small hitbox
    hitShape: 'line_projectile',
    impactEffect: 'violet_trail_flash',
    notes: 'Fast thin shot, high damage, small hitbox. Warning line for boss version.',
  },
  {
    id: 'eden_star_lance',
    displayName: 'Eden Star Lance',
    spritePath: 'assets/effects/attacks/eden_star_lance.png',
    ownerEnemyTypes: ['glitch-drone', 'stealth-infiltrator', 'cyber-shooter', 'combat-hunter', 'solar-tyrant'],
    behavior: WEAPON_BEHAVIOR.PIERCING_PROJECTILE,
    damage: 22,
    speed: 500,
    projectileSpeed: 500,
    cooldown: 5.0,
    telegraphTime: 1.0,
    telegraphRequired: true,
    range: RANGE.LANCE,
    impactRadius: 22,
    hitShape: 'line_projectile',
    impactEffect: 'golden_star_burst',
    notes: 'Rare heavy star-lance, piercing, bright impact. Boss elite phase only.',
  },
  {
    id: 'abyss_rift_blade',
    displayName: 'Abyss Rift Blade',
    spritePath: 'assets/effects/attacks/abyss_rift_blade.png',
    ownerEnemyTypes: ['rogue-ai-overlord', 'overclocked-berserker', 'pale-bloodknight', 'abyss-maw'],
    behavior: WEAPON_BEHAVIOR.SLASH_WAVE,
    damage: 16,
    speed: 450,
    projectileSpeed: 450,
    cooldown: 2.6,
    telegraphTime: 0.5,
    telegraphRequired: true,
    range: RANGE.CONE_WAVE,
    impactRadius: 64,          // cone wave thickness
    hitShape: 'cone_slash',
    impactEffect: 'dark_blade_wave',
    notes: 'Blade wave / cone slash. Telegraph before swing.',
  },
  {
    id: 'cryo_shard_lance',
    displayName: 'Cryo Shard Lance',
    spritePath: 'assets/effects/attacks/cryo_shard_lance.png',
    ownerEnemyTypes: ['rogue-ai-overlord', 'cyber-net-junkie', 'cryo-warden', 'cryo-claw'],
    behavior: WEAPON_BEHAVIOR.PROJECTILE,
    damage: 10,
    speed: 480,
    projectileSpeed: 480,
    cooldown: 2.0,
    telegraphTime: 0,
    telegraphRequired: false,
    range: RANGE.FROST,
    impactRadius: 18,
    hitShape: 'line_projectile',
    impactEffect: 'frost_burst',
    notes: 'Frost damage, icy burst. Slow only if existing slow system supports it.',
  },
  {
    id: 'solar_halo_bolt',
    displayName: 'Solar Halo Bolt',
    spritePath: 'assets/effects/attacks/solar_halo_bolt.png',
    ownerEnemyTypes: ['solar-tyrant', 'solar-stinger', 'forge-mauler'],
    behavior: WEAPON_BEHAVIOR.PROJECTILE,
    damage: 8,
    speed: 520,
    projectileSpeed: 520,
    cooldown: 1.6,
    telegraphTime: 0,
    telegraphRequired: false,
    range: RANGE.STANDARD,
    impactRadius: 16,
    hitShape: 'circle_projectile',
    impactEffect: 'golden_flash',
    notes: 'Readable golden shot, medium/light damage.',
  },
  {
    id: 'toxic_data_spear',
    displayName: 'Toxic Data Spear',
    spritePath: 'assets/effects/attacks/toxic_data_spear.png',
    ownerEnemyTypes: ['rail-reaper', 'toxin-leech', 'volt-rat'],
    behavior: WEAPON_BEHAVIOR.PROJECTILE,
    damage: 12,
    speed: 520,
    projectileSpeed: 520,
    cooldown: 2.4,
    telegraphTime: 0,
    telegraphRequired: false,
    range: RANGE.TOXIC,
    impactRadius: 20,
    hitShape: 'line_projectile',
    impactEffect: 'green_glitch_burst',
    notes: 'Green glitch burst. No poison/drain unless existing system.',
  },
  {
    id: 'magma_reaver_lance',
    displayName: 'Magma Reaver Lance',
    spritePath: 'assets/effects/attacks/magma_reaver_lance.png',
    ownerEnemyTypes: ['forge-mauler', 'reactor-colossus', 'ember-scarab'],
    behavior: WEAPON_BEHAVIOR.HEAVY_PROJECTILE,
    damage: 18,
    speed: 350,
    projectileSpeed: 350,
    cooldown: 3.2,
    telegraphTime: 0.6,
    telegraphRequired: true,
    range: RANGE.HEAVY,
    impactRadius: 78,
    hitShape: 'circle_aoe',
    impactEffect: 'magma_explosion',
    notes: 'Heavy fire hit, ember burst, small screen shake for boss version.',
  },
  {
    id: 'arc_circuit_beam',
    displayName: 'Arc Circuit Beam',
    spritePath: 'assets/effects/attacks/arc_circuit_beam.png',
    ownerEnemyTypes: ['security-defector-mech', 'heavy-mech', 'null-hierophant', 'reactor-colossus', 'pulse-burrower', 'volt-rat'],
    behavior: WEAPON_BEHAVIOR.BEAM,
    damage: 5,
    speed: 0,
    projectileSpeed: 0,
    cooldown: 3.5,
    telegraphTime: 0.6,
    telegraphRequired: true,
    range: RANGE.BEAM_MID,
    impactRadius: 22,          // half-width of the damaging beam band
    hitShape: 'line_beam',
    impactEffect: 'electric_arc_flash',
    notes: 'Telegraphed beam/pulse, continuous or short tick damage.',
  },
  {
    id: 'aether_crescent_chakram',
    displayName: 'Aether Crescent Chakram',
    spritePath: 'assets/effects/attacks/aether_crescent_chakram.png',
    ownerEnemyTypes: ['glitch-drone', 'rogue-punk', 'cyber-shooter', 'scrap-scavenger', 'cryo-warden', 'pulse-burrower'],
    behavior: WEAPON_BEHAVIOR.BOOMERANG,
    damage: 8,
    speed: 400,
    projectileSpeed: 400,
    cooldown: 3.0,
    telegraphTime: 0,
    telegraphRequired: false,
    range: RANGE.BOOMERANG,    // outbound leg; it returns along the same path
    impactRadius: 24,
    hitShape: 'circle_projectile',
    impactEffect: 'aether_shimmer',
    notes: 'Curving/returning projectile, light-medium damage.',
  },
  {
    id: 'prism_wing_bolt',
    displayName: 'Prism Wing Bolt',
    spritePath: 'assets/effects/attacks/prism_wing_bolt.png',
    ownerEnemyTypes: ['amethyst-fang'],
    behavior: WEAPON_BEHAVIOR.PROJECTILE,
    damage: 7,
    speed: 560,
    projectileSpeed: 560,
    cooldown: 1.8,
    telegraphTime: 0,
    telegraphRequired: false,
    range: RANGE.LIGHT,
    impactRadius: 14,
    hitShape: 'circle_projectile',
    impactEffect: 'prism_sparkle',
    notes: 'Fast elegant bolt, light-medium damage.',
  },
  {
    id: 'blacknet_scythe_arc',
    displayName: 'Blacknet Scythe Arc',
    spritePath: 'assets/effects/attacks/blacknet_scythe_arc.png',
    ownerEnemyTypes: ['rogue-ai-overlord', 'pale-bloodknight', 'void-widow'],
    behavior: WEAPON_BEHAVIOR.SLASH_ARC,
    damage: 15,
    speed: 0,                  // swung in place — the arc does not travel
    projectileSpeed: 0,
    cooldown: 2.8,
    telegraphTime: 0.5,
    telegraphRequired: true,
    range: RANGE.SHORT_ARC,
    impactRadius: 58,          // arc band thickness — must match the drawn slash
    hitShape: 'arc_slash',
    impactEffect: 'dark_scythe_trail',
    notes: 'Telegraphed arc slash, medium/heavy damage.',
  },
  {
    id: 'seraph_vector_javelin',
    displayName: 'Seraph Vector Javelin',
    spritePath: 'assets/effects/attacks/seraph_vector_javelin.png',
    ownerEnemyTypes: ['rail-reaper', 'solar-tyrant', 'solar-stinger'],
    behavior: WEAPON_BEHAVIOR.PIERCING_PROJECTILE,
    damage: 16,
    speed: 600,
    projectileSpeed: 600,
    cooldown: 3.0,
    telegraphTime: 0.4,
    telegraphRequired: true,
    range: RANGE.PIERCE,
    impactRadius: 18,
    hitShape: 'line_projectile',
    impactEffect: 'golden_pierce_flash',
    notes: 'Piercing line attack, warning line for boss version.',
  },
  {
    id: 'null_rupture_orb',
    displayName: 'Null Rupture Orb',
    spritePath: 'assets/effects/attacks/null_rupture_orb.png',
    ownerEnemyTypes: ['null-hierophant', 'pale-bloodknight', 'abyss-maw', 'rift-eye'],
    behavior: WEAPON_BEHAVIOR.ORB_EXPLOSION,
    damage: 20,
    speed: 200,
    projectileSpeed: 200,
    cooldown: 4.5,
    telegraphTime: 0.8,
    telegraphRequired: true,
    range: RANGE.ORB,
    impactRadius: 96,          // explosion radius — warning ring must be drawn at this size
    hitShape: 'circle_aoe',
    impactEffect: 'null_rupture_explosion',
    notes: 'Slow orb, warning ring, circular AoE explosion. No invisible radius.',
  },
];

// ── Derive ownerTypes (REAL enemyType display names) from ENEMY_TYPE_WEAPONS ──
// Reverse index, so ownerTypes can never disagree with ENEMY_TYPE_WEAPONS.
const _ownerTypesById = new Map(_WEAPON_DEFS.map(w => [w.id, []]));
for (const [enemyType, ids] of Object.entries(ENEMY_TYPE_WEAPONS)) {
  for (const id of ids) {
    const bucket = _ownerTypesById.get(id);
    if (bucket && !bucket.includes(enemyType)) bucket.push(enemyType);
  }
}

// ── Weapon definitions (public, frozen, complete) ────────────────────
export const ENEMY_WEAPONS = Object.freeze(_WEAPON_DEFS.map(w => Object.freeze({
  ...w,
  ownerTypes: Object.freeze(_ownerTypesById.get(w.id) || []),
  ownerEnemyTypes: Object.freeze(w.ownerEnemyTypes),
})));

// ── Primary / base enemy weapon assignments (Addendum Visual Mapping) ──
// LEGACY kebab-case map — this is what Enemy.js looks up today. Unchanged.
// DRONES (ranged minions): Burst Fire — Cyan/Magenta projectiles
// SECURITY MECHS (elites): Telegraphed beam — Electric/Fire
// BOSS / AI OVERLORD: Heavy Spatial Sweeping Waves — Dark Purple
export const PRIMARY_WEAPON_MAP = Object.freeze({
  'glitch-drone':           ['aether_crescent_chakram', 'eden_star_lance'],
  'rogue-punk':             ['aether_crescent_chakram'],
  'stealth-infiltrator':    ['eden_star_lance'],
  'cyber-shooter':          ['aether_crescent_chakram', 'eden_star_lance'],
  'security-defector-mech': ['arc_circuit_beam'],
  'heavy-mech':             ['arc_circuit_beam'],
  'overclocked-berserker':  ['abyss_rift_blade'],
  'combat-hunter':          ['eden_star_lance'],
  'scrap-scavenger':        ['aether_crescent_chakram'],
  'cyber-net-junkie':       ['cryo_shard_lance'],
  'rogue-ai-overlord':      ['abyss_rift_blade', 'blacknet_scythe_arc', 'cryo_shard_lance'],
});

// ── Boss weapon assignments ──────────────────────────────────────────
// Only the Rogue AI Overlord is a real Enemy type that routes through this
// catalog. The other named bosses (Cyber Titan, Cyber Serpent/Dragon, Double
// Demons, Bloodfang, the Endless act bosses, etc.) are bespoke boss objects
// with custom attack code in Game.js/Events.js — they never do a catalog
// lookup, so the seven old keys here (cryo-warden, forge-mauler, ...) were
// dead data with no matching enemyType and have been removed.
export const BOSS_WEAPON_MAP = Object.freeze({
  'rogue-ai-overlord': ['eden_star_lance', 'null_sigil_beam'],
});

// ── Mini enemy weapon assignments ────────────────────────────────────
export const MINI_WEAPON_MAP = Object.freeze({
  'abyss-maw':       ['null_rupture_orb', 'abyss_rift_blade'],
  'amethyst-fang':   ['violet_spectral_needle', 'prism_wing_bolt'],
  'cryo-claw':       ['cryo_shard_lance'],
  'ember-scarab':    ['void_ember_comet', 'magma_reaver_lance'],
  'pulse-burrower':  ['arc_circuit_beam', 'aether_crescent_chakram'],
  'rift-eye':        ['null_sigil_beam', 'null_rupture_orb'],
  'solar-stinger':   ['solar_halo_bolt', 'seraph_vector_javelin'],
  'toxin-leech':     ['toxic_data_spear'],
  'void-widow':      ['blacknet_scythe_arc', 'violet_spectral_needle'],
  'volt-rat':        ['arc_circuit_beam', 'toxic_data_spear'],
});

// ── Helper: lookup weapon by id ──────────────────────────────────────
const _weaponIndex = new Map(ENEMY_WEAPONS.map(w => [w.id, w]));
export function getWeaponById(id) { return _weaponIndex.get(id) || null; }

// ── Helper: get all weapons for an enemy type (LEGACY kebab key) ─────
export function getWeaponsForEnemy(enemyId) {
  const ids = BOSS_WEAPON_MAP[enemyId] || MINI_WEAPON_MAP[enemyId] || PRIMARY_WEAPON_MAP[enemyId] || [];
  return ids.map(id => _weaponIndex.get(id)).filter(Boolean);
}

/**
 * Get all weapon defs for a REAL enemyType display name (e.g. 'Solar Tyrant').
 * Falls back to the legacy kebab maps using Enemy.js's own key derivation, so it
 * works for anything either map knows about. Never throws; [] when unknown.
 * @param {string} displayName
 * @returns {Array<object>}
 */
export function getWeaponsForEnemyType(displayName) {
  if (typeof displayName !== 'string' || displayName.length === 0) return [];
  const ids = ENEMY_TYPE_WEAPONS[displayName];
  if (Array.isArray(ids)) return ids.map(id => _weaponIndex.get(id)).filter(Boolean);
  // Fallback: same key derivation Enemy.js uses.
  return getWeaponsForEnemy(displayName.toLowerCase().replace(/ /g, '-'));
}

/**
 * Pure, headless-safe integrity check over the whole catalog.
 * No I/O, no globals, no DOM. Safe to call from a test or a boot assert.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCatalog() {
  const errors = [];
  const behaviors = new Set(Object.values(WEAPON_BEHAVIOR));
  const seenIds = new Set();

  const isStr = v => typeof v === 'string' && v.length > 0;
  const isNum = v => typeof v === 'number' && Number.isFinite(v);

  for (let i = 0; i < ENEMY_WEAPONS.length; i++) {
    const w = ENEMY_WEAPONS[i];
    const tag = `weapon[${i}] ${w && w.id ? w.id : '<no id>'}`;

    if (!w || typeof w !== 'object') { errors.push(`${tag}: not an object`); continue; }

    // Presence of every required field.
    for (const f of REQUIRED_WEAPON_FIELDS) {
      if (!(f in w) || w[f] === undefined || w[f] === null) errors.push(`${tag}: missing field '${f}'`);
    }

    // Types.
    if (!isStr(w.id))            errors.push(`${tag}: id must be a non-empty string`);
    if (!isStr(w.displayName))   errors.push(`${tag}: displayName must be a non-empty string`);
    if (!isStr(w.spritePath))    errors.push(`${tag}: spritePath must be a non-empty string`);
    if (!isStr(w.hitShape))      errors.push(`${tag}: hitShape must be a non-empty string`);
    if (!isStr(w.impactEffect))  errors.push(`${tag}: impactEffect must be a non-empty string`);
    if (typeof w.notes !== 'string') errors.push(`${tag}: notes must be a string`);
    if (typeof w.telegraphRequired !== 'boolean') errors.push(`${tag}: telegraphRequired must be a boolean`);

    if (!Array.isArray(w.ownerTypes)) {
      errors.push(`${tag}: ownerTypes must be an array`);
    } else {
      if (w.ownerTypes.length === 0) errors.push(`${tag}: ownerTypes is empty — weapon has no owner`);
      for (const o of w.ownerTypes) {
        if (!isStr(o)) errors.push(`${tag}: ownerTypes entry must be a non-empty string`);
        else if (!(o in ENEMY_TYPE_WEAPONS)) errors.push(`${tag}: ownerTypes '${o}' is not a key of ENEMY_TYPE_WEAPONS`);
      }
    }

    // Behavior must be a declared value.
    if (!behaviors.has(w.behavior)) errors.push(`${tag}: behavior '${w.behavior}' is not a WEAPON_BEHAVIOR value`);

    // Numeric ranges.
    if (!isNum(w.damage)       || w.damage       <= 0) errors.push(`${tag}: damage must be > 0`);
    if (!isNum(w.cooldown)     || w.cooldown     <= 0) errors.push(`${tag}: cooldown must be > 0`);
    if (!isNum(w.range)        || w.range        <= 0) errors.push(`${tag}: range must be > 0`);
    if (!isNum(w.impactRadius) || w.impactRadius <= 0) errors.push(`${tag}: impactRadius must be > 0`);
    if (!isNum(w.projectileSpeed) || w.projectileSpeed < 0) errors.push(`${tag}: projectileSpeed must be >= 0`);
    if (!isNum(w.telegraphTime) || w.telegraphTime < 0) errors.push(`${tag}: telegraphTime must be >= 0`);

    // projectileSpeed is an alias of the legacy `speed` field.
    if (isNum(w.speed) && w.projectileSpeed !== w.speed) {
      errors.push(`${tag}: projectileSpeed (${w.projectileSpeed}) !== speed (${w.speed})`);
    }

    // Telegraph contract: a telegraphed attack needs a real windup.
    if (w.telegraphRequired === true && !(isNum(w.telegraphTime) && w.telegraphTime > 0)) {
      errors.push(`${tag}: telegraphRequired is true but telegraphTime is not > 0`);
    }

    // Unique ids.
    if (isStr(w.id)) {
      if (seenIds.has(w.id)) errors.push(`${tag}: duplicate weapon id '${w.id}'`);
      seenIds.add(w.id);
    }
  }

  // Every id referenced by any map must resolve to a real weapon.
  const checkMap = (name, map) => {
    for (const [key, ids] of Object.entries(map)) {
      if (!isStr(key)) { errors.push(`${name}: invalid key`); continue; }
      if (!Array.isArray(ids)) { errors.push(`${name}['${key}']: value must be an array`); continue; }
      if (ids.length === 0)    { errors.push(`${name}['${key}']: empty weapon list`); continue; }
      for (const id of ids) {
        if (!seenIds.has(id)) errors.push(`${name}['${key}']: unknown weapon id '${id}'`);
      }
    }
  };
  checkMap('PRIMARY_WEAPON_MAP',  PRIMARY_WEAPON_MAP);
  checkMap('BOSS_WEAPON_MAP',     BOSS_WEAPON_MAP);
  checkMap('MINI_WEAPON_MAP',     MINI_WEAPON_MAP);
  checkMap('ENEMY_TYPE_WEAPONS',  ENEMY_TYPE_WEAPONS);

  return { ok: errors.length === 0, errors };
}
