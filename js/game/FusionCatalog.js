// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER FUSION ARMORY — canonical data layer (Batch A, 2026-08-01).
// 20 Character Fusion Weapons: 2 ανά χαρακτήρα, 10/10 roster coverage.
// Δομή recipe: Character Signature Weapon + Weapon B + Weapon C → Fusion Weapon.
// ΚΑΝΟΝΕΣ (δεσμευτικοί):
//   • ENDLESS / CHAOS ONLY — ποτέ Campaign/Act 1, ποτέ starter, ποτέ default pool.
//   • Η κάρτα αγοράζεται ΜΟΝΙΜΑ με Protocol Fragments + Grid Cores (ΚΑΙ τα δύο,
//     atomic — MetaProgress.tryBuyFusionCard). Κανένα νέο νόμισμα.
//   • Η αγορά ΔΕΝ δίνει το όπλο· ξεκλειδώνει μόνο τη ΔΥΝΑΤΟΤΗΤΑ σχηματισμού
//     μέσα στο run όταν ισχύσουν ΟΛΕΣ οι in-run προϋποθέσεις (FusionEngine).
//   • Tier 1 = αγορά. Tiers 2-3 = αναβαθμίσεις μέσα από το ΙΔΙΟ framework.
//     Το Tier 3 προσθέτει ΠΑΝΤΑ ουσιαστική μηχανική εξέλιξη (όχι σκέτο +%).
//   • Όλα τα μεγέθη bounded: hard caps σε projectiles/fields/summons/particles,
//     tick-based persistent damage (ΠΟΤΕ per-render-frame), deterministic cleanup.
//   • Damage routing: ΜΟΝΟ μέσω BuildEngineRuntime._dealDamage (boss caps,
//     DamageLog, RUNTIME_HOOKS) — ποτέ γυμνό e.takeHit από fusion κώδικα.
//   • Assets: assets/weapons/fusions/<char_id>/<fusion_id>.png (1024×1024 RGBA,
//     premium, μοναδικό silhouette, στοιχεία και των 3 components, ανά-χαρακτήρα palette).
//   • Audio: 5 canonical hooks ανά fusion (<id>_manifest/_charge/_travel/_impact/
//     _aftermath) — authored αρχεία σε επόμενο audio Wave· μέχρι τότε σύντομο
//     per-fusion procedural voice (AudioManager.playFusionCue), ποτέ loop.
// Αριθμητικές τιμές: arrays [Tier1, Tier2, Tier3].
// ═══════════════════════════════════════════════════════════════════════════════

export const FUSION_BASE_COST   = Object.freeze({ pf: 40, grids: 2000 });  // Tier 1 (αγορά κάρτας)
export const FUSION_TIER2_COST  = Object.freeze({ pf: 15, grids: 1500 });
export const FUSION_TIER3_COST  = Object.freeze({ pf: 25, grids: 3000 });
export const FUSION_MAX_TIER    = 3;
export const FUSION_AUDIO_PHASES = Object.freeze(['manifest', 'charge', 'travel', 'impact', 'aftermath']);

// In-run recipe απαιτήσεις (ενιαίες): signature Lv5 (ή evolved), B & C Lv3+.
export const FUSION_REQ_LEVELS = Object.freeze([5, 3, 3]);

export function fusionCost(tier) {           // tier που ΑΓΟΡΑΖΕΤΑΙ (1|2|3)
  return tier === 1 ? FUSION_BASE_COST : tier === 2 ? FUSION_TIER2_COST : FUSION_TIER3_COST;
}
export function fusionHookIds(fusionId) {
  return FUSION_AUDIO_PHASES.map(p => fusionId + '_' + p);
}
export function fusionModeOk(game) {         // ΟΛΑ τα gates ρωτούν εδώ — μία αλήθεια.
  return !!game && game.gameState === 'playing' && !!game.endless && !game._bossRush;
  // Chaos: _chaosMode συνεπάγεται endless === true. Campaign/Act1: endless=false → false.
}

export const FUSION_DEFS = Object.freeze({

  // ═════ 01 · SKELETON WARRIOR — OSSUARY IMPALER ═══════════════════════════════
  // Marrow Spitter + Null Lance + Gravity Core → κολοσσιαία λόγχη οστού-και-κενού.
  // Κύκλος: πάνω από τον παίκτη συναρμολογούνται σπόνδυλοι σε λόγχη (assembly) →
  // charge → εκτόξευση piercing line στον πυκνότερο διάδρομο (travel) → στο τέρμα
  // ανοίγει βαρυτικό rift που ΤΡΑΒΑ τους εχθρούς (secondary, tick-based) → το rift
  // καταρρέει σε ακτινωτό nova θραυσμάτων οστού (aftermath) → cooldown.
  fus_ossuary_impaler: {
    id: 'fus_ossuary_impaler', char: 'skeleton_warrior', name: 'OSSUARY IMPALER',
    components: ['marrow_spitter', 'build_null_lance', 'gravity_core'],
    replaces: ['marrow_spitter'],            // ο βασικός spitter σιωπά όσο υπάρχει το fusion
    role: 'lane execution + crowd pull',
    tags: ['BONE', 'NULL', 'GRAVITY', 'FUSION'],
    palette: { core: '#efe9d3', glow: '#8f7bff', accent: '#41306e', bg: '#0c0716' },
    art: 'assets/weapons/fusions/skeleton_warrior/fus_ossuary_impaler.png',
    desc: 'A cathedral of vertebrae reforged around a null core — the lance that buries whole lanes.',
    mechanicText: 'Assembles a colossal bone-null lance, impales the densest lane (pierce ALL), tears a gravity rift at its terminus that drags victims in, then detonates a radial bone nova.',
    mech: {
      cooldown: [11, 9.5, 8], chargeS: 0.9, travelSpeed: 980, range: 900,
      laneDamage: [130, 165, 200], lanePierce: Infinity, laneWidth: 46,
      rift: { durS: [2.2, 2.6, 3.0], pullPerS: 240, radius: [170, 190, 210], tickS: 0.45, tickDmg: [18, 24, 30] },
      nova: { dmg: [90, 115, 140], radius: [230, 250, 270], shards: 14 },
      bossMultiplier: 0.60,
      caps: { activeLances: 1, riftFields: 1, novaShards: 18 },
    },
    tiers: [
      'Tier 1 — full cycle: lance → gravity rift → bone nova.',
      'Tier 2 — +25% lane/rift/nova damage, faster cycle, wider rift.',
      'Tier 3 — MARROW ECHO: the nova leaves 3 impaled bone pylons that fire one splinter volley each before crumbling.',
    ],
    t3: { pylons: 3, pylonVolleyDmg: 46, pylonRange: 320, pylonLifeS: 2.0 },
    chaos: { riftDurMult: 1.35, novaDmgMult: 1.2, extraPylon: 1 },   // hard-capped: 4 pylons max
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 02 · SKELETON WARRIOR — BLACK PSALM CHOIR ═════════════════════════════
  // Grave Cantor + Ion Halo + Blacknet Swarm Drone → ηλεκτρισμένο οστέινο φρούριο.
  // Κύκλος: 4 reliquary κρανία-drones υλοποιούνται σε τροχιά (manifest) → κάθε
  // pulse του χορού φορτίζει ιόντα (charge) → γεμάτο κρανίο ΑΠΟΣΠΑΤΑΙ και βουτά
  // στο πυκνότερο cluster (travel/summon) → έκρηξη + chain lightning (impact/
  // secondary) → το κρανίο ανασχηματίζεται μετά από cooldown (aftermath).
  fus_black_psalm_choir: {
    id: 'fus_black_psalm_choir', char: 'skeleton_warrior', name: 'BLACK PSALM CHOIR',
    components: ['grave_cantor', 'build_ion_halo', 'blacknet_swarm_drone'],
    replaces: ['grave_cantor'],
    role: 'orbiting fortress + dive-bomb chains',
    tags: ['BONE', 'ION', 'BLACKNET', 'FUSION'],
    palette: { core: '#e6f6ff', glow: '#39d7ff', accent: '#0f4a5e', bg: '#020d12' },
    art: 'assets/weapons/fusions/skeleton_warrior/fus_black_psalm_choir.png',
    desc: 'Four reliquary skulls sing the black psalm — and when a verse ends, one of them dives.',
    mechanicText: 'An orbiting fortress of 4 electro-reliquary skulls. Choir pulses charge them with ions; a fully charged skull detaches, dive-bombs the densest cluster and detonates in chain lightning, then re-forms.',
    mech: {
      skulls: [4, 4, 5], orbitRadius: 120, orbitSpeed: 0.8,
      pulse: { tickS: 0.9, dmg: [16, 20, 26], radius: 90 },
      chargePerPulse: 1, chargeFull: 4,
      dive: { dmg: [95, 120, 150], radius: 150, speed: 760, reformS: [3.0, 2.6, 2.2] },
      chains: { count: [3, 4, 5], dmg: [34, 42, 52], range: 220 },
      bossMultiplier: 0.65,
      caps: { skulls: 5, simultaneousDives: 2, chainsPerDive: 6 },
    },
    tiers: [
      'Tier 1 — full cycle: choir pulses → charged skull dive → chain lightning.',
      'Tier 2 — +1 chain, stronger pulses, faster re-forming.',
      'Τier 3 — REQUIEM VERSE: a 5th skull joins, and every dive leaves a psalm field (2s) that slows and shocks inside it.',
    ],
    t3: { field: { durS: 2.0, radius: 140, tickS: 0.5, tickDmg: 14, slow: 0.35 } },
    chaos: { extraChain: 2, reformMult: 0.8, fieldDurMult: 1.3 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 03 · TAEKWONDO GIRL — CYCLONE METRONOME ═══════════════════════════════
  // Vector Heel + Storm Sash + Ion Halo → κλιμακούμενος κυκλώνας-σάρωση.
  // Κύκλος: δύο crescent kicks σφραγίζουν τον αέρα (manifest) → η κορδέλα δένει
  // τα crescents σε κυκλώνα (charge) → ο κυκλώνας ΤΑΞΙΔΕΥΕΙ κατευθυντικά και
  // ΜΕΓΑΛΩΝΕΙ όσο σαρώνει, παρασύροντας τους μικρούς (travel/CC) → στο απόγειο
  // εκφορτίζει chain lightning (impact) → διαλύεται σε ηλεκτρισμένη αύρα (aftermath).
  fus_cyclone_metronome: {
    id: 'fus_cyclone_metronome', char: 'taekwondo_girl', name: 'CYCLONE METRONOME',
    components: ['vector_heel', 'storm_sash', 'build_ion_halo'],
    replaces: ['vector_heel'],
    role: 'growing directional sweep + drag',
    tags: ['KICK', 'WIND', 'ION', 'FUSION'],
    palette: { core: '#fff2e0', glow: '#ff9d2e', accent: '#7a3b0e', bg: '#160a02' },
    art: 'assets/weapons/fusions/taekwondo_girl/fus_cyclone_metronome.png',
    desc: 'Two crescent kicks, one storm ribbon, and the metronome starts counting — in hurricanes.',
    mechanicText: 'Launches a travelling cyclone that GROWS as it sweeps, dragging light enemies along its wall; at apex it discharges chain lightning through everything it carries, then collapses into a static aura.',
    mech: {
      cooldown: [9, 8, 7], travelSpeed: 300, travelS: [2.4, 2.6, 2.8],
      radius0: 90, radiusMax: [190, 210, 230],
      wallTickS: 0.4, wallDmg: [22, 28, 35], dragPerS: 190,
      apexChains: { count: [4, 5, 6], dmg: [46, 58, 72], range: 240 },
      aura: { durS: 1.4, radius: 150, tickS: 0.5, tickDmg: 16 },
      bossMultiplier: 0.60,
      caps: { activeCyclones: 1, draggedEnemies: 24, chains: 8 },
    },
    tiers: [
      'Tier 1 — full cycle: growing cyclone → drag → apex chain discharge → aura.',
      'Tier 2 — bigger apex radius, +1 chain, +27% wall damage.',
      'Tier 3 — DOUBLE TIME: the metronome ticks twice — a second, mirrored cyclone launches in the opposite direction.',
    ],
    t3: { mirrorCyclone: true, mirrorDmgMult: 0.75 },
    chaos: { radiusMult: 1.15, dragMult: 1.3, extraChain: 1 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 04 · TAEKWONDO GIRL — EYE OF THE NULL STORM ═══════════════════════════
  // Storm Sash + Gravity Core + Null Lance → στατικός τυφώνας-φυλακή.
  // Κύκλος: η κορδέλα καρφώνεται στο έδαφος και ανοίγει μάτι τυφώνα (manifest) →
  // το eyewall χτίζεται (charge) → persistent field: το βαρυτικό μάτι ΣΥΜΠΙΕΖΕΙ
  // τους εχθρούς πάνω στο eyewall όπου χτυπούν ribbon-blades (deployment, ticks)
  // → περιοδικά το μάτι εκτοξεύει null lances ακτινωτά (secondary) → κατάρρευση
  // με τελικό squeeze (aftermath).
  fus_null_storm_eye: {
    id: 'fus_null_storm_eye', char: 'taekwondo_girl', name: 'EYE OF THE NULL STORM',
    components: ['storm_sash', 'gravity_core', 'build_null_lance'],
    replaces: ['storm_sash'],
    role: 'persistent compression field + radial lances',
    tags: ['WIND', 'GRAVITY', 'NULL', 'FUSION'],
    palette: { core: '#eafff4', glow: '#2ef2a0', accent: '#0e5e3f', bg: '#03130c' },
    art: 'assets/weapons/fusions/taekwondo_girl/fus_null_storm_eye.png',
    desc: 'She plants the sash, and the storm grows an eye — nothing inside it is going anywhere.',
    mechanicText: 'Deploys a stationary hurricane: the gravity eye compresses enemies onto the eyewall where ribbon blades tick; the eye periodically fires null lances radially at the survivors; collapse squeezes everything inward once.',
    mech: {
      cooldown: [13, 11.5, 10], durS: [4.0, 4.5, 5.0],
      radius: [200, 220, 240], wallWidth: 46,
      compressPerS: 220, wallTickS: 0.45, wallDmg: [24, 30, 38],
      lances: { everyS: 1.2, count: [3, 4, 5], dmg: [40, 50, 62], range: 420, pierce: 3 },
      collapse: { dmg: [80, 100, 125], radius: 240 },
      bossMultiplier: 0.55,
      caps: { activeStorms: 1, lancesPerBurst: 6 },
    },
    tiers: [
      'Tier 1 — full cycle: eye deploy → compression + wall ticks → radial null lances → collapse.',
      'Tier 2 — longer, wider storm, +1 lance, +25% wall damage.',
      'Tier 3 — STILLPOINT: enemies that die on the eyewall detonate as micro null-rifts (chain reaction).',
    ],
    t3: { corpseRift: { dmg: 36, radius: 90, cap: 8 } },
    chaos: { durMult: 1.3, compressMult: 1.25, lanceEveryMult: 0.8 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 05 · BRAWLER — TECTONIC MAW ═══════════════════════════════════════════
  // Faultline Fist + Gravity Core + Magma Uppercut → καταβόθρα που καταπίνει ράγκες.
  // Κύκλος: γροθιά στο έδαφος (manifest) → αστεροειδείς ρωγμές ανοίγουν (charge)
  // → το κέντρο ΒΟΥΛΙΑΖΕΙ σε βαρυτική καταβόθρα που τραβά τους εχθρούς μέσα
  // (deployment/CC) → geyser μάγματος εκτινάσσεται από τον πάτο (impact) →
  // καμένη κρούστα ticks (aftermath).
  fus_tectonic_maw: {
    id: 'fus_tectonic_maw', char: 'brawler_warrior', name: 'TECTONIC MAW',
    components: ['faultline_fist', 'gravity_core', 'magma_uppercut'],
    replaces: ['faultline_fist'],
    role: 'sinkhole compression + eruption',
    tags: ['EARTH', 'GRAVITY', 'MAGMA', 'FUSION'],
    palette: { core: '#ffe9c9', glow: '#ff6a2e', accent: '#7a2e0e', bg: '#150702' },
    art: 'assets/weapons/fusions/brawler_warrior/fus_tectonic_maw.png',
    desc: 'The ground opens its mouth where he punches — and the earth is hungry.',
    mechanicText: 'Splits the ground into a star of faultlines that SINK into a gravity sinkhole, dragging ranks in; a magma geyser erupts from the bottom, and the burnt crust keeps cooking whatever crawls out.',
    mech: {
      cooldown: [12, 10.5, 9], crackRange: 300, crackDmg: [50, 62, 78],
      sink: { durS: [1.8, 2.0, 2.2], radius: [180, 200, 220], pullPerS: 260, tickS: 0.45, tickDmg: [16, 20, 26] },
      geyser: { dmg: [120, 150, 185], radius: [160, 175, 190] },
      crust: { durS: 2.5, tickS: 0.5, tickDmg: [14, 18, 22], radius: 170 },
      bossMultiplier: 0.60,
      caps: { activeMaws: 1, crackArms: 6 },
    },
    tiers: [
      'Tier 1 — full cycle: faultline star → sinkhole pull → magma geyser → burning crust.',
      'Tier 2 — bigger maw, +25% geyser damage, longer sink.',
      'Tier 3 — AFTERSHOCK JAW: the maw bites TWICE — a second, offset sinkhole opens where most enemies fled.',
    ],
    t3: { secondMaw: { delayS: 1.2, dmgMult: 0.8 } },
    chaos: { radiusMult: 1.2, pullMult: 1.25, crustDurMult: 1.4 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 06 · BRAWLER — PYROCLAST PAYLOAD ══════════════════════════════════════
  // Magma Uppercut + Nano Mine + Null Lance → βαλλιστικό φορτίο ναρκών μάγματος.
  // Κύκλος: uppercut εκτοξεύει πυρακτωμένο payload στον ουρανό (manifest/charge)
  // → το payload διαχωρίζεται πάνω από τη γραμμή στόχευσης (cinematic missile
  // separation) → βροχή από magma mines κατά μήκος διαδρόμου (travel/deployment)
  // → οι νάρκες δένονται με πυρωμένα νήματα· όποιος τα διασχίζει αναφλέγεται
  // (secondary) → αλυσιδωτή έκρηξη από άκρη σε άκρη (impact/aftermath).
  fus_pyroclast_payload: {
    id: 'fus_pyroclast_payload', char: 'brawler_warrior', name: 'PYROCLAST PAYLOAD',
    components: ['magma_uppercut', 'nano_mine', 'build_null_lance'],
    replaces: ['magma_uppercut'],
    role: 'cinematic mine corridor + chain detonation',
    tags: ['MAGMA', 'NANO', 'NULL', 'FUSION'],
    palette: { core: '#fff3d6', glow: '#ffb02e', accent: '#8a4a0e', bg: '#160c02' },
    art: 'assets/weapons/fusions/brawler_warrior/fus_pyroclast_payload.png',
    desc: 'One uppercut, one sky full of burning ordnance — the corridor decides who crosses.',
    mechanicText: 'An uppercut launches a molten payload that separates mid-air and rains a corridor of magma mines; ignited threads lace the mines, burning whoever crosses, then the corridor detonates in sequence.',
    mech: {
      cooldown: [11, 10, 9], corridorLen: [420, 470, 520], corridorWidth: 110,
      mines: { count: [6, 7, 8], armS: 0.5, contactDmg: [55, 68, 84], radius: 95 },
      threads: { tickS: 0.4, tickDmg: [12, 16, 20], burnS: 2.0, burnDps: [10, 13, 16] },
      wave: { detonateGapS: 0.16, dmg: [70, 88, 110], radius: 120 },
      bossMultiplier: 0.60,
      caps: { corridors: 1, mines: 8, burningEnemies: 30 },
    },
    tiers: [
      'Tier 1 — full cycle: launch → separation → mine corridor → threads → sequential detonation.',
      'Tier 2 — longer corridor, +1 mine, +24% detonation damage.',
      'Tier 3 — NULL PRIMER: the final mine collapses into a null implosion that pulls and pierces (mini rift).',
    ],
    t3: { nullImplosion: { dmg: 90, radius: 150, pullPerS: 300, durS: 0.8 } },
    chaos: { extraMine: 1, threadDmgMult: 1.3, waveDmgMult: 1.15 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 07 · EUCLID — COMPASS OF RUIN ═════════════════════════════════════════
  // Axiom Ray + Phi Cutter + Ion Halo → γεωμετρικός διαβήτης-δικαστής.
  // Κύκλος: ένας γιγάντιος διαβήτης χαράζει περιφέρεια γύρω από τον παίκτη
  // (manifest) → η περιφέρεια στερεοποιείται σε φωτεινό όριο (charge) → δύο
  // ακτίνες-δείκτες σαρώνουν σαν λεπτοδείκτες, και όπου τέμνουν το όριο η δέσμη
  // ΔΙΑΣΠΑΤΑΙ σε τόξα ιόντων (deployment/secondary) → Q.E.D. flash στο κλείσιμο
  // του κύκλου (impact) → το όριο σβήνει σε σκόνη αξιωμάτων (aftermath).
  fus_compass_of_ruin: {
    id: 'fus_compass_of_ruin', char: 'euclid_vector', name: 'COMPASS OF RUIN',
    components: ['axiom_ray', 'phi_cutter', 'build_ion_halo'],
    replaces: ['axiom_ray'],
    role: 'rotating beam sweep + boundary field',
    tags: ['GEOMETRY', 'BEAM', 'ION', 'FUSION'],
    palette: { core: '#eaf6ff', glow: '#5aa2ff', accent: '#1e3f8a', bg: '#040817' },
    art: 'assets/weapons/fusions/euclid_vector/fus_compass_of_ruin.png',
    desc: 'He draws one perfect circle — and everything on its circumference is a proven casualty.',
    mechanicText: 'Inscribes a lethal circle; two beam hands sweep it like a clock while the circumference burns as a boundary field; where beam meets boundary, ion arcs split off and chain inward. Closing the circle stamps a Q.E.D. burst.',
    mech: {
      cooldown: [12, 11, 10], durS: [3.6, 4.0, 4.4], radius: [230, 250, 270],
      boundary: { tickS: 0.45, tickDmg: [18, 23, 29], width: 30 },
      hands: { count: 2, sweepRadPerS: 1.6, dmg: [30, 38, 47], width: 26, tickS: 0.30 },
      splitArcs: { everyS: 0.8, count: [2, 3, 3], dmg: [26, 33, 41], range: 200 },
      qed: { dmg: [110, 135, 165], radius: [240, 260, 280] },
      bossMultiplier: 0.55,
      caps: { activeCompasses: 1, arcsAlive: 8 },
    },
    tiers: [
      'Tier 1 — full cycle: inscribe → boundary + sweeping beam hands → ion splits → Q.E.D.',
      'Tier 2 — wider circle, +26% boundary/hand damage, third split arc.',
      'Tier 3 — COROLLARY: after Q.E.D., the two beam hands detach and scissor once across the whole arena diameter.',
    ],
    t3: { scissor: { dmg: 95, width: 34, lenMult: 2.2 } },
    chaos: { durMult: 1.25, sweepMult: 1.25, qedDmgMult: 1.2 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 08 · EUCLID — GOLDEN COLLAPSE ═════════════════════════════════════════
  // Phi Cutter + Gravity Core + Nano Mine → σπείρα Fibonacci που καταρρέει.
  // Κύκλος: κόμβοι-νάρκες υλοποιούνται πάνω σε χρυσή σπείρα (manifest) → η
  // βαρύτητα κυλά τους εχθρούς ΚΑΤΑ ΜΗΚΟΣ της σπείρας προς το κέντρο (charge/CC)
  // → οι κόμβοι πυροδοτούνται σειριακά απ' έξω προς τα μέσα (chain reaction,
  // travel) → τελική συμπίεση-implosion στο κέντρο (impact) → χρυσή τομή
  // χαραγμένη στο έδαφος ως damage residue (aftermath).
  fus_golden_collapse: {
    id: 'fus_golden_collapse', char: 'euclid_vector', name: 'GOLDEN COLLAPSE',
    components: ['phi_cutter', 'gravity_core', 'nano_mine'],
    replaces: ['phi_cutter'],
    role: 'spiral compression + sequential detonation',
    tags: ['GEOMETRY', 'GRAVITY', 'NANO', 'FUSION'],
    palette: { core: '#fff8dc', glow: '#ffd447', accent: '#8a6a1e', bg: '#141002' },
    art: 'assets/weapons/fusions/euclid_vector/fus_golden_collapse.png',
    desc: 'The most beautiful ratio in mathematics, weaponised — everything spirals inward, once.',
    mechanicText: 'Lays nano-mine nodes along a golden spiral; gravity rolls enemies along the spiral path toward the centre while nodes detonate in Fibonacci sequence from the outside in, ending in a central implosion.',
    mech: {
      cooldown: [12, 11, 10], spiralRadius: [260, 285, 310],
      nodes: { count: [7, 8, 9], dmg: [46, 57, 70], radius: 100, gapS: 0.22 },
      spiralPullPerS: 200, spiralTickS: 0.5, spiralTickDmg: [10, 13, 17],
      implosion: { dmg: [125, 155, 190], radius: [170, 185, 200] },
      residue: { durS: 2.0, tickS: 0.5, tickDmg: 12 },
      bossMultiplier: 0.55,
      caps: { activeSpirals: 1, nodes: 9 },
    },
    tiers: [
      'Tier 1 — full cycle: spiral nodes → gravity roll inward → sequential detonation → implosion.',
      'Tier 2 — wider spiral, +1 node, +24% implosion damage.',
      'Tier 3 — PERFECT PROOF: enemies killed by node blasts leave golden shards that arc to the centre and amplify the implosion (up to +60%).',
    ],
    t3: { shardAmpPerKill: 0.06, shardAmpCap: 0.60 },
    chaos: { pullMult: 1.3, nodeGapMult: 0.8, residueDurMult: 1.5 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 09 · ONI — HUNGRY HELL FEAST ══════════════════════════════════════════
  // Hannya Cleaver + Hungry Spirit Lantern + Gravity Core → διαστασιακό στόμα.
  // Κύκλος: σχίζεται dimensional tear σε στόμα δαίμονα (manifest) → φανάρια-
  // πνεύματα ΜΑΝΤΡΩΝΟΥΝ τους τρομαγμένους προς το στόμα ενώ η βαρύτητα τραβά
  // (charge/CC) → το στόμα ΚΑΤΑΠΙΝΕΙ non-boss εχθρούς κάτω από κατώφλι HP
  // (execution) → κάθε ψυχή ταΐζει τον τελικό κολοσσιαίο cleaver (impact) →
  // η μπουκιά κλείνει και το tear ράβεται (aftermath).
  fus_hungry_hell_feast: {
    id: 'fus_hungry_hell_feast', char: 'oni_cataclysm_protocol', name: 'HUNGRY HELL FEAST',
    components: ['hannya_cleaver', 'hungry_spirit_lantern', 'gravity_core'],
    replaces: ['hannya_cleaver'],
    role: 'dimensional execution maw + soul-fed finisher',
    tags: ['ONI', 'SPIRIT', 'GRAVITY', 'FUSION'],
    palette: { core: '#ffe3e3', glow: '#ff3b4d', accent: '#7a0e1e', bg: '#160204' },
    art: 'assets/weapons/fusions/oni_cataclysm_protocol/fus_hungry_hell_feast.png',
    desc: 'Hell opened its mouth where he pointed — and every soul it swallows sharpens the blade.',
    mechanicText: 'Tears open a demon maw; lantern spirits herd feared enemies in while gravity pulls. The maw EXECUTES non-bosses below an HP threshold; every soul eaten feeds a final colossal cleaver bite.',
    mech: {
      cooldown: [14, 12.5, 11], durS: [3.0, 3.4, 3.8],
      maw: { radius: [150, 165, 180], pullPerS: 250, tickS: 0.5, tickDmg: [20, 25, 31] },
      spirits: { count: 3, herdRadius: 320, fearS: 1.2 },
      execute: { pctMaxHp: [0.22, 0.26, 0.30], cap: 140, everyS: 0.4, maxPerCycle: 12 },
      bite: { baseDmg: [90, 110, 135], perSoul: [14, 17, 21], soulCap: 12, arc: 2.4, radius: 240 },
      bossMultiplier: 0.55,                 // execution ΔΕΝ ισχύει σε bosses — μόνο το bite damage
      caps: { activeMaws: 1, spirits: 3, soulsCounted: 12 },
    },
    tiers: [
      'Tier 1 — full cycle: tear → herd + pull → execution feast → soul-fed cleaver bite.',
      'Tier 2 — higher execution threshold, bigger maw, +22% bite damage.',
      'Tier 3 — SECOND COURSE: if the feast reaches its soul cap, the maw ROARS — a fear nova that resets the spirits for one bonus herd-and-bite.',
    ],
    t3: { secondCourse: { fearNovaRadius: 300, biteDmgMult: 0.7 } },
    chaos: { execPctBonus: 0.04, soulCapBonus: 4, durMult: 1.25 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 10 · ONI — NIGHT PARADE ═══════════════════════════════════════════════
  // Hungry Spirit Lantern + Blacknet Swarm Drone + Ion Halo → Hyakki Yagyō.
  // Κύκλος: 6 πνεύματα-drones με φανάρια υλοποιούνται σε πομπή (manifest/summon)
  // → η πομπή παρατάσσεται (charge) → ΔΙΑΣΧΙΖΕΙ την αρένα σε ευθεία φάλαγγα
  // (directional sweep/travel), καίγοντας και τρομάζοντας ό,τι αγγίζει → τα
  // φανάρια δένονται με τόξα ιόντων μεταξύ τους — κινούμενος φράχτης (secondary)
  // → στο τέλος της πορείας τα φανάρια σβήνουν ένα-ένα με μικρές εκρήξεις (aftermath).
  fus_night_parade: {
    id: 'fus_night_parade', char: 'oni_cataclysm_protocol', name: 'NIGHT PARADE',
    components: ['hungry_spirit_lantern', 'blacknet_swarm_drone', 'build_ion_halo'],
    replaces: ['hungry_spirit_lantern'],
    role: 'marching summon wall + moving ion fence',
    tags: ['ONI', 'BLACKNET', 'ION', 'FUSION'],
    palette: { core: '#fdeaff', glow: '#c26bff', accent: '#5a1e8a', bg: '#0d0216' },
    art: 'assets/weapons/fusions/oni_cataclysm_protocol/fus_night_parade.png',
    desc: 'One hundred demons would not march for him. Six lanterns were enough.',
    mechanicText: 'Summons a procession of six lantern spirits that march in line across the arena — a moving fence of ion arcs strung between them, burning and fearing everything the parade walks through.',
    mech: {
      cooldown: [13, 11.5, 10], marchSpeed: 190, marchS: [3.2, 3.6, 4.0],
      lanterns: [6, 6, 7], spacing: 92,
      touch: { dmg: [40, 50, 62], fearS: 1.0, radius: 54 },
      fence: { tickS: 0.4, tickDmg: [18, 23, 29] },
      endBursts: { dmg: [45, 56, 70], radius: 110, gapS: 0.15 },
      bossMultiplier: 0.60,
      caps: { parades: 1, lanterns: 7 },
    },
    tiers: [
      'Tier 1 — full cycle: summon procession → march → ion fence → lantern end-bursts.',
      'Tier 2 — longer march, +25% fence damage, stronger bursts.',
      'Tier 3 — RETURN PROCESSION: the parade turns at the end of its path and marches BACK through the survivors once.',
    ],
    t3: { returnMarch: { dmgMult: 0.8 } },
    chaos: { extraLantern: 1, marchDurMult: 1.2, fenceDmgMult: 1.25 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 11 · CYBER-ARM — FERROMAG PILEDRIVER ══════════════════════════════════
  // Hydraulic Knuckle + Magnetic Shrapnel + Ion Halo → σιδηρομαγνητική γροθιά.
  // Κύκλος: θραύσματα + ιόντα ΣΥΝΑΡΜΟΛΟΓΟΥΝΤΑΙ πάνω στο μπράτσο σε rail-gauntlet
  // (assembly/manifest) → πιστόνι οπλίζει (charge) → μαγνητισμένο shockwave line
  // punch· τα θραύσματα ΚΑΡΦΩΝΟΝΤΑΙ στα θύματα (travel/impact) → μετά 1s ΟΛΑ τα
  // καρφωμένα θραύσματα ΕΠΙΣΤΡΕΦΟΥΝ στη γροθιά σχίζοντας ξανά (retaliation
  // return) → τόξα ιόντων ανάμεσα στους μαρκαρισμένους (secondary/aftermath).
  fus_ferromag_piledriver: {
    id: 'fus_ferromag_piledriver', char: 'cyber_arm_hero', name: 'FERROMAG PILEDRIVER',
    components: ['hydraulic_knuckle', 'magnetic_shrapnel', 'build_ion_halo'],
    replaces: ['hydraulic_knuckle'],
    role: 'assembly punch + shrapnel yank-back',
    tags: ['PUNCH', 'METAL', 'ION', 'FUSION'],
    palette: { core: '#eef4ff', glow: '#7ba6ff', accent: '#2e4a8a', bg: '#050915' },
    art: 'assets/weapons/fusions/cyber_arm_hero/fus_ferromag_piledriver.png',
    desc: 'The arm builds its own hammer out of everything magnetic — then calls it all back.',
    mechanicText: 'Shrapnel and ions assemble a rail-gauntlet on the arm; the piston fires a magnetized shockwave line that embeds fragments in victims — one second later every fragment is YANKED back through them to the fist, arcing ions between the wounded.',
    mech: {
      cooldown: [10, 9, 8], assembleS: 0.7,
      punch: { dmg: [110, 138, 170], range: [380, 410, 440], width: 84 },
      embed: { frags: [8, 10, 12], fragDmg: 0 },
      yank: { delayS: 1.0, dmgPerFrag: [38, 47, 58] },
      arcs: { count: [3, 4, 5], dmg: [30, 38, 47], range: 200 },
      bossMultiplier: 0.65,
      caps: { activePunches: 1, embeddedFrags: 12, arcs: 6 },
    },
    tiers: [
      'Tier 1 — full cycle: assembly → piston line punch → embed → yank-back → ion arcs.',
      'Tier 2 — +25% punch/yank damage, +2 fragments, longer line.',
      'Tier 3 — OVERPRESSURE: the yank-back compresses victims toward the fist line and slams them with a second, shorter piston.',
    ],
    t3: { slam: { dmg: 80, range: 240, width: 100, pullPerS: 320 } },
    chaos: { extraFrags: 2, arcDmgMult: 1.3, cdMult: 0.9 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 12 · CYBER-ARM — SCRAPSTORM FOUNDRY ═══════════════════════════════════
  // Magnetic Shrapnel + Nano Mine + Blacknet Swarm Drone → περιστρεφόμενο χυτήριο.
  // Κύκλος: συντρίμμια μαζεύονται σε περιστρεφόμενη ασπίδα-δακτύλιο (manifest) →
  // το χυτήριο ζεσταίνει (charge) → persistent orbit: επαφή = chip damage· κάθε N
  // επαφές το χυτήριο ΣΦΥΡΗΛΑΤΕΙ homing scrap-drone που ορμά στον πιο μακρινό
  // πυκνό στόχο (secondary/travel) → έκρηξη σε κώνο ναϊτών (impact) → στο τέλος
  // η ασπίδα καταρρέει σε τελικό δαχτυλίδι θραυσμάτων (aftermath).
  fus_scrapstorm_foundry: {
    id: 'fus_scrapstorm_foundry', char: 'cyber_arm_hero', name: 'SCRAPSTORM FOUNDRY',
    components: ['magnetic_shrapnel', 'nano_mine', 'blacknet_swarm_drone'],
    replaces: ['magnetic_shrapnel'],
    role: 'orbiting scrap shield + forged homing drones',
    tags: ['METAL', 'NANO', 'BLACKNET', 'FUSION'],
    palette: { core: '#fff0e6', glow: '#ff8a4d', accent: '#8a3e1e', bg: '#140802' },
    art: 'assets/weapons/fusions/cyber_arm_hero/fus_scrapstorm_foundry.png',
    desc: 'A foundry with no walls — it grinds what touches it and ships the product express.',
    mechanicText: 'A rotating debris ring grinds enemies on contact; every few hits the foundry FORGES a homing scrap-drone that seeks dense clusters and bursts into a nanite cone. On expiry the ring collapses outward as one final shard nova.',
    mech: {
      durS: [6.0, 6.5, 7.0], cooldown: [12, 11, 10],
      ring: { radius: 110, tickS: 0.35, tickDmg: [17, 21, 27], pieces: 10 },
      forge: { hitsPerDrone: 6, droneDmg: [62, 77, 95], coneDmg: [28, 35, 44], droneCap: [3, 4, 5], speed: 620 },
      novaEnd: { dmg: [70, 88, 108], radius: 190, shards: 12 },
      bossMultiplier: 0.60,
      caps: { rings: 1, dronesAlive: 5, shards: 14 },
    },
    tiers: [
      'Tier 1 — full cycle: scrap ring → grind → forge homing drones → end nova.',
      'Tier 2 — +24% grind/drone damage, +1 drone cap, longer ring.',
      'Tier 3 — SMELTDOWN: drones leave molten nano-slag pools where they burst (2s tick fields).',
    ],
    t3: { slag: { durS: 2.0, radius: 90, tickS: 0.5, tickDmg: 15, cap: 4 } },
    chaos: { ringDmgMult: 1.25, hitsPerDroneMult: 0.75, slagDurMult: 1.4 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 13 · ASSASSIN — WIDOW'S LOOM ══════════════════════════════════════════
  // Monowire Lash + Toxin Kunai + Nano Mine → θανάσιμος αργαλειός.
  // Κύκλος: kunai-καρφιά εκτοξεύονται σε δαχτυλίδι και καρφώνουν κόμβους
  // (manifest) → μονομοριακά νήματα υφαίνονται ανάμεσά τους σε ιστό (charge/
  // deployment) → persistent web: όποιος διασχίζει νήμα κόβεται + στοιβάζει
  // venom (ticks/secondary) → στα 5 stacks ο ιστός ΣΦΙΓΓΕΙ — execution στους
  // μαρκαρισμένους non-boss, burst στους bosses (impact) → τα νήματα λιώνουν σε
  // τοξικό αχνό (aftermath).
  fus_widows_loom: {
    id: 'fus_widows_loom', char: 'assassin_clone', name: "WIDOW'S LOOM",
    components: ['monowire_lash', 'toxin_kunai', 'nano_mine'],
    replaces: ['monowire_lash'],
    role: 'web lattice field + venom cinch execution',
    tags: ['WIRE', 'POISON', 'NANO', 'FUSION'],
    palette: { core: '#f2ffe6', glow: '#8aff3b', accent: '#3e7a0e', bg: '#081402' },
    art: 'assets/weapons/fusions/assassin_clone/fus_widows_loom.png',
    desc: 'She weaves once. The garden does the killing quietly, thread by thread.',
    mechanicText: 'Pins kunai nodes in a ring and weaves a monowire web between them; crossing a wire cuts and stacks venom. At five stacks the loom CINCHES — executing marked non-bosses below threshold and bursting everything else.',
    mech: {
      cooldown: [13, 11.5, 10], durS: [4.5, 5.0, 5.5],
      web: { nodes: [6, 7, 8], radius: [210, 230, 250], wireTickS: 0.4, wireDmg: [15, 19, 24], venomPerCut: 1 },
      cinch: { stacksNeeded: 5, execPct: [0.20, 0.24, 0.28], execCap: 130, burstDmg: [65, 82, 102] },
      dissolve: { durS: 1.5, tickS: 0.5, tickDmg: 10, radius: 200 },
      bossMultiplier: 0.55,
      caps: { looms: 1, nodes: 8, executionsPerCinch: 10 },
    },
    tiers: [
      'Tier 1 — full cycle: pin nodes → weave → venom cuts → cinch execution → toxic dissolve.',
      'Tier 2 — +1 node, wider loom, higher execution threshold.',
      'Tier 3 — BLACK WIDOW: the cinch re-weaves once — a second, tighter loom forms instantly at half radius.',
    ],
    t3: { reweave: { radiusMult: 0.55, dmgMult: 0.8 } },
    chaos: { venomPerCutBonus: 1, execPctBonus: 0.04, durMult: 1.25 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 14 · ASSASSIN — PHANTOM NEEDLE PROTOCOL ═══════════════════════════════
  // Toxin Kunai + Null Lance + Blacknet Swarm Drone → πρωτόκολλο τριπλής εκτέλεσης.
  // Κύκλος: sigils μαρκάρουν τους 3 πιο εύρωστους στόχους στην οθόνη (manifest/
  // targeting) → stealth drones υλικοποιούνται και οπλίζουν null-βελόνες (charge)
  // → οι βελόνες ΚΥΝΗΓΟΥΝ homing τους μαρκαρισμένους (travel) → ΤΑΥΤΟΧΡΟΝΟ
  // χτύπημα και στους 3 (impact) → poison burst που ΑΛΥΣΙΔΩΝΕΙ στους γύρω
  // (secondary/chain) → τα drones διαλύονται σε καπνό (aftermath).
  fus_phantom_needle_protocol: {
    id: 'fus_phantom_needle_protocol', char: 'assassin_clone', name: 'PHANTOM NEEDLE PROTOCOL',
    components: ['toxin_kunai', 'build_null_lance', 'blacknet_swarm_drone'],
    replaces: ['toxin_kunai'],
    role: 'homing triple assassination + poison chains',
    tags: ['POISON', 'NULL', 'BLACKNET', 'FUSION'],
    palette: { core: '#eee6ff', glow: '#a63bff', accent: '#4a0e7a', bg: '#0b0214' },
    art: 'assets/weapons/fusions/assassin_clone/fus_phantom_needle_protocol.png',
    desc: 'Three names on the list, three needles in the dark — the protocol never misses twice.',
    mechanicText: 'Tracking sigils mark the three toughest enemies on screen; phantom drones deliver homing null-needles that strike ALL marks simultaneously, each detonating a poison burst that chains to nearby enemies. Bosses take a shredded-armor window instead of the execution bonus.',
    mech: {
      cooldown: [10, 9, 8], marks: 3, sigilS: 0.8,
      needles: { dmg: [95, 118, 145], speed: 900, executeBelowPct: 0.15, execCap: 120 },
      burst: { dmg: [45, 56, 70], radius: 130 },
      chains: { count: [2, 3, 4], dmg: [30, 38, 47], range: 190 },
      bossShred: { durS: 3.0, mult: 1.15 },
      bossMultiplier: 0.65,
      caps: { volleys: 1, needles: 3, chainsPerBurst: 4 },
    },
    tiers: [
      'Tier 1 — full cycle: mark 3 → phantom delivery → simultaneous strike → poison chains.',
      'Tier 2 — +24% needle damage, +1 chain, faster protocol.',
      'Tier 3 — CONTINGENCY CLAUSE: if any marked target survives the needle, a second needle re-strikes it after 0.6s (once).',
    ],
    t3: { restrike: { delayS: 0.6, dmgMult: 0.7 } },
    chaos: { extraMark: 1, chainDmgMult: 1.25, cdMult: 0.85 },   // 4 marks max στο Chaos
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 15 · PHASEWALKER — DIE OF FATES ═══════════════════════════════════════
  // Probability Disc + Phase Needle + Null Lance → κβαντικό ζάρι-κολοσσός.
  // Κύκλος: ένα γιγάντιο πολυεδρικό ζάρι υλικοποιείται από phase-θραύσματα
  // (manifest) → περιστρέφεται καθώς φορτίζει πιθανότητες (charge) → ΚΥΛΑΕΙ
  // σε ευθεία συνθλίβοντας ό,τι βρει (travel) → σε κάθε αναπήδηση «κληρώνει»
  // μία από 4 έδρες με διαφορετικό αποτέλεσμα (needle nova / phase rift /
  // lance volley / time-slow field) — deterministic κύκλος εδρών (secondary) →
  // στο τέλος σπάει σε phase σπίθες (aftermath).
  fus_die_of_fates: {
    id: 'fus_die_of_fates', char: 'japan_phasewalker', name: 'DIE OF FATES',
    components: ['probability_disc', 'phase_needle', 'build_null_lance'],
    replaces: ['probability_disc'],
    role: 'rolling crusher + rotating face effects',
    tags: ['PHASE', 'RNG', 'NULL', 'FUSION'],
    palette: { core: '#e6fbff', glow: '#3bffd0', accent: '#0e7a6a', bg: '#021412' },
    art: 'assets/weapons/fusions/japan_phasewalker/fus_die_of_fates.png',
    desc: 'He carved a die from four possible futures. All four of them hurt.',
    mechanicText: 'A colossal quantum die rolls across the arena, crushing what it lands on; every bounce resolves a different face — needle nova, phase rift, lance volley or a time-slow field — cycling deterministically through all four.',
    mech: {
      cooldown: [11, 10, 9], rollSpeed: 340, bounces: [4, 5, 6], bounceGapS: 0.55,
      crush: { dmg: [80, 100, 124], radius: 110 },
      faces: {
        needleNova: { count: 8, dmg: [30, 38, 47], range: 260 },
        phaseRift:  { durS: 1.6, radius: 130, tickS: 0.4, tickDmg: [16, 20, 25], scarMult: 1.15 },
        lanceVolley:{ count: 3, dmg: [42, 52, 65], pierce: 3, range: 380 },
        slowField:  { durS: 1.8, radius: 170, slow: 0.45, tickS: 0.5, tickDmg: [10, 13, 16] },
      },
      bossMultiplier: 0.60,
      caps: { dice: 1, fieldsAlive: 2, novaNeedles: 10 },
    },
    tiers: [
      'Tier 1 — full cycle: manifest die → roll → per-bounce face effects → shatter.',
      'Tier 2 — +1 bounce, +25% crush/face damage.',
      'Tier 3 — LOADED DICE: the final bounce resolves ALL FOUR faces at once.',
    ],
    t3: { jackpotFinalBounce: true, jackpotDmgMult: 0.8 },
    chaos: { extraBounce: 1, faceDmgMult: 1.2, slowBonus: 0.10 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 16 · PHASEWALKER — EVENT HORIZON ROULETTE ═════════════════════════════
  // Probability Disc + Ion Halo + Gravity Core → ρουλέτα-ορίζοντας γεγονότων.
  // Κύκλος: φαρδύς τροχός-ρουλέτα από phase orbs υλικοποιείται γύρω από τον
  // παίκτη (manifest) → ο τροχός γυρνά και η βαρύτητα τραβά τους εχθρούς πάνω
  // στη στεφάνη (charge/CC) → κάθε 3s η μπίλια «κάθεται»: το επιλεγμένο orb
  // εκτοξεύεται ως ricochet δίσκος με reroll bounces (travel/secondary) → τόξα
  // ιόντων γεφυρώνουν orb↔δίσκο όσο πετά (impact) → στη λήξη ο τροχός
  // καταρρέει προς τα μέσα σε παλμό (aftermath).
  fus_event_horizon_roulette: {
    id: 'fus_event_horizon_roulette', char: 'japan_phasewalker', name: 'EVENT HORIZON ROULETTE',
    components: ['probability_disc', 'build_ion_halo', 'gravity_core'],
    replaces: [],                            // additive: ο βασικός δίσκος συνεχίζει
    role: 'wheel fortress + pull + ricochet payouts',
    tags: ['PHASE', 'ION', 'GRAVITY', 'FUSION'],
    palette: { core: '#fff0fa', glow: '#ff5ad0', accent: '#8a0e5e', bg: '#14020e' },
    art: 'assets/weapons/fusions/japan_phasewalker/fus_event_horizon_roulette.png',
    desc: 'The house always wins — the house is a spinning event horizon.',
    mechanicText: 'A wide roulette wheel of phase orbs spins around the player while gravity drags enemies onto the rim; every three seconds the ball lands and the chosen orb fires as a rerolling ricochet disc, ion arcs bridging wheel and disc in flight. On expiry the wheel collapses inward in one pulse.',
    mech: {
      cooldown: [13, 12, 11], durS: [5.0, 5.5, 6.0],
      wheel: { orbs: [8, 9, 10], radius: 180, spinRadPerS: 1.4, rimTickS: 0.45, rimDmg: [14, 18, 23], pullPerS: 170 },
      payout: { everyS: 3.0, discDmg: [58, 72, 90], bounces: 3, speed: 700 },
      bridge: { tickS: 0.4, dmg: [16, 20, 25] },
      collapse: { dmg: [85, 105, 130], radius: 220 },
      bossMultiplier: 0.55,
      caps: { wheels: 1, discsAlive: 2, orbs: 10 },
    },
    tiers: [
      'Tier 1 — full cycle: wheel manifest → spin + pull → payouts → collapse pulse.',
      'Tier 2 — +1 orb, +24% rim/payout damage, longer wheel.',
      'Tier 3 — DOUBLE ZERO: payouts fire TWO discs in opposite directions.',
    ],
    t3: { doublePayout: true, secondDiscDmgMult: 0.75 },
    chaos: { payoutEveryMult: 0.75, pullMult: 1.3, extraOrb: 1 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 17 · EDDIE — WALL OF SOUND ════════════════════════════════════════════
  // Solo Red Thunder + Feedback Cabinet + Ion Halo → σκηνή-οχυρό.
  // Κύκλος: δύο πύργοι-ενισχυτές υψώνονται μπροστά από τον Eddie (manifest/
  // assembly) → το σύστημα κουρδίζει, τόξο ιόντων γεφυρώνει τους πύργους
  // (charge) → persistent front: πιεστικά κύματα ήχου κυλούν προς τα εμπρός στο
  // beat, σπρώχνοντας και ζημιώνοντας (deployment/travel) → κάθε 4ο beat ένα
  // ΚΟΚΚΙΝΟ lightning solo σαρώνει όλο το μέτωπο (impact) → οι πύργοι σβήνουν με
  // feedback screech (aftermath).
  fus_wall_of_sound: {
    id: 'fus_wall_of_sound', char: 'eddie', name: 'WALL OF SOUND',
    components: ['solo_red_thunder', 'feedback_cabinet', 'build_ion_halo'],
    replaces: ['feedback_cabinet'],
    role: 'deployed stage front + beat-synced solo sweep',
    tags: ['SOUND', 'LIGHTNING', 'ION', 'FUSION'],
    palette: { core: '#ffe6e6', glow: '#ff2e3e', accent: '#8a0e1e', bg: '#140203' },
    art: 'assets/weapons/fusions/eddie/fus_wall_of_sound.png',
    desc: 'Two amps, one bridge of lightning, and a front row nobody survives.',
    mechanicText: 'Raises two amp towers bridged by an ion arc; pressure waves roll forward on the beat, shoving the crowd back — and every fourth beat a red lightning solo sweeps the whole front.',
    mech: {
      cooldown: [13, 12, 11], durS: [5.0, 5.5, 6.0], towerGap: 240,
      waves: { beatS: 0.75, dmg: [26, 33, 41], range: [340, 370, 400], width: 260, push: 180 },
      solo: { everyBeats: 4, dmg: [95, 118, 145], width: 300 },
      bridge: { tickS: 0.4, dmg: [15, 19, 24], length: 240 },
      screech: { dmg: [55, 70, 88], radius: 200 },
      bossMultiplier: 0.60,
      caps: { stages: 1, wavesAlive: 4 },
    },
    tiers: [
      'Tier 1 — full cycle: raise towers → beat waves → 4th-beat red solo → feedback screech.',
      'Tier 2 — +25% wave/solo damage, longer set, deeper front.',
      'Tier 3 — ENCORE: when the set ends, the towers overload and fire one full-length solo in BOTH directions.',
    ],
    t3: { encore: { dmgMult: 0.85, bothDirections: true } },
    chaos: { beatMult: 0.85, soloEveryBeats: 3, durMult: 1.2 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 18 · EDDIE — BASS SINGULARITY ═════════════════════════════════════════
  // Feedback Cabinet + Gravity Core + Blacknet Swarm Drone → υπογούφερ μαύρη τρύπα.
  // Κύκλος: ένα subwoofer core κατεβαίνει και καρφώνεται στο έδαφος (manifest) →
  // «inhale»: το bass drop ρουφά τους εχθρούς προς το core (charge/CC) → «drop»:
  // εκρηκτικό κύμα πίεσης (impact) — εναλλάξ σε ρυθμό → 2 roadie-drones με
  // speakers αντηχούν μικρότερους παλμούς στα πλάγια (secondary/summon) → το
  // core κλείνει με τελικό υπόκωφο boom (aftermath).
  fus_bass_singularity: {
    id: 'fus_bass_singularity', char: 'eddie', name: 'BASS SINGULARITY',
    components: ['feedback_cabinet', 'gravity_core', 'blacknet_swarm_drone'],
    replaces: [],                            // additive: το cabinet συνεχίζει να παίζει
    role: 'rhythmic pull/blast core + echo drones',
    tags: ['SOUND', 'GRAVITY', 'BLACKNET', 'FUSION'],
    palette: { core: '#e6ecff', glow: '#4d6bff', accent: '#1e2e8a', bg: '#030514' },
    art: 'assets/weapons/fusions/eddie/fus_bass_singularity.png',
    desc: 'Turn the sub low enough and gravity starts taking requests.',
    mechanicText: 'Drops a subwoofer core that alternates on rhythm between INHALE (dragging the crowd in) and DROP (a crushing pressure blast), while two roadie-drones echo smaller pulses at the flanks; ends on one final sub-harmonic boom.',
    mech: {
      cooldown: [13, 12, 11], durS: [4.8, 5.2, 5.6],
      rhythmS: 1.1,
      inhale: { pullPerS: 280, radius: [220, 240, 260], tickS: 0.5, tickDmg: [12, 15, 19] },
      drop: { dmg: [70, 88, 110], radius: [180, 195, 210], push: 220 },
      roadies: { count: 2, pulseDmg: [24, 30, 38], pulseRadius: 110, pulseS: 1.1 },
      boom: { dmg: [100, 125, 155], radius: 250 },
      bossMultiplier: 0.55,
      caps: { cores: 1, roadies: 2 },
    },
    tiers: [
      'Tier 1 — full cycle: core drop → inhale/drop rhythm → roadie echoes → final boom.',
      'Tier 2 — wider inhale, +25% drop damage, longer set.',
      'Tier 3 — DROP THE BASS: every second DROP also fires a shockwave ring that travels outward (bounded).',
    ],
    t3: { ring: { dmg: 42, speed: 420, maxR: 320, width: 40 } },
    chaos: { rhythmMult: 0.85, pullMult: 1.3, boomDmgMult: 1.2 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 19 · DIMI'S KICKBOXER — THOUSAND FIST VERDICT ═════════════════════════
  // Cyber-Gauntlets Injection + Holo Energy Knuckles + Null Lance → ετυμηγορία.
  // Κύκλος: το combo σφραγίζει Sanction Marks (manifest) → ένας διάδρομος από
  // γιγάντιες ολογραφικές γροθιές υλικοποιείται μπροστά (charge/assembly) → οι
  // γροθιές ΓΡΟΝΘΟΚΟΠΟΥΝ σειριακά κατά μήκος του διαδρόμου, καθεμιά διαπερνά
  // (travel/impact) → φινάλε: null-lance uppercut στο τέλος του διαδρόμου —
  // execution burst σε όσους φέρουν Mark (secondary) → οι γροθιές θρυμματίζονται
  // σε holo-γυαλί (aftermath).
  fus_thousand_fist_verdict: {
    id: 'fus_thousand_fist_verdict', char: 'dimis_kickboxer', name: 'THOUSAND FIST VERDICT',
    components: ['cyber_gauntlets_injection', 'holo_energy_knuckles', 'build_null_lance'],
    replaces: ['holo_energy_knuckles'],
    role: 'sequential fist corridor + marked execution finale',
    tags: ['PUNCH', 'HOLO', 'NULL', 'FUSION'],
    palette: { core: '#fffbe6', glow: '#ffd447', accent: '#8a6e0e', bg: '#141002' },
    art: 'assets/weapons/fusions/dimis_kickboxer/fus_thousand_fist_verdict.png',
    desc: 'The tribunal takes no witnesses — a corridor of fists delivers the sentence.',
    mechanicText: 'Materializes a corridor of giant holographic fists that punch in sequence down the lane, each piercing through; the verdict lands as a null-lance uppercut at the corridor end — an execution burst on everything carrying a Sanction Mark.',
    mech: {
      cooldown: [11, 10, 9], corridorLen: [440, 480, 520], corridorWidth: 120,
      fists: { count: [5, 6, 7], gapS: 0.16, dmg: [58, 72, 90], radius: 90 },
      uppercut: { dmg: [110, 138, 170], radius: 150 },
      verdict: { markedBonusPct: [0.12, 0.15, 0.18], cap: 110 },
      bossMultiplier: 0.65,
      caps: { corridors: 1, fists: 7 },
    },
    tiers: [
      'Tier 1 — full cycle: marks → fist corridor → sequential punches → null uppercut verdict.',
      'Tier 2 — +1 fist, longer corridor, +24% damage.',
      'Tier 3 — UNANIMOUS RULING: enemies killed by the verdict release their Mark as a homing sanction sigil that brands the nearest unmarked enemy.',
    ],
    t3: { sigilTransfer: { cap: 6, brandDmg: 24 } },
    chaos: { extraFist: 1, verdictBonusPct: 0.05, cdMult: 0.9 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },

  // ═════ 20 · DIMI'S KICKBOXER — AEGIS OF JUDGEMENT ════════════════════════════
  // Holo Energy Knuckles + Ion Halo + Gravity Core → αμυντικός αντίποινος κλοιός.
  // Κύκλος: ολογραφικός φρουρός-δακτύλιος υψώνεται γύρω από τον Dimi (manifest)
  // → κάθε εχθρική επαφή/χτύπημα πάνω στον κλοιό ΑΠΟΡΡΟΦΑΤΑΙ και φορτίζει τον
  // μετρητή (charge/retaliation) → η βαρύτητα κρατά τους επιτιθέμενους σε
  // απόσταση μπράτσου (deployment/CC) → στο γέμισμα: ακτινωτός καταιγισμός
  // holo-γροθιών + τόξα ιόντων (impact/secondary) → ο κλοιός σβήνει αφήνοντας
  // 1.5s προστατευτικό afterglow (aftermath).
  fus_aegis_of_judgement: {
    id: 'fus_aegis_of_judgement', char: 'dimis_kickboxer', name: 'AEGIS OF JUDGEMENT',
    components: ['holo_energy_knuckles', 'build_ion_halo', 'gravity_core'],
    replaces: [],                            // additive: defensive layer
    role: 'parry/retaliation ring + counter barrage',
    tags: ['HOLO', 'ION', 'GRAVITY', 'FUSION'],
    palette: { core: '#e6fff7', glow: '#2ee6b8', accent: '#0e8a6a', bg: '#021410' },
    art: 'assets/weapons/fusions/dimis_kickboxer/fus_aegis_of_judgement.png',
    desc: 'Every blow you land on the guard is evidence — and the counter is the sentence.',
    mechanicText: 'A holographic guard ring absorbs enemy contact around Dimi and charges a counter meter while gravity holds attackers at arm’s length; at full charge it unleashes a radial holo-fist barrage laced with ion arcs, then leaves a brief protective afterglow.',
    mech: {
      cooldown: [12, 11, 10], durS: [5.0, 5.5, 6.0],
      ring: { radius: 130, holdPerS: 150, absorbCap: [10, 12, 14], dmgReduce: 0.25 },
      meterPerHit: 1, meterFull: [8, 8, 8],
      barrage: { fists: [8, 10, 12], dmg: [48, 60, 75], range: 260 },
      arcs: { count: [3, 4, 5], dmg: [28, 35, 44], range: 200 },
      afterglow: { durS: 1.5, dmgReduce: 0.30 },
      bossMultiplier: 0.60,
      caps: { rings: 1, barrageFists: 12 },
    },
    tiers: [
      'Tier 1 — full cycle: guard ring → absorb + hold → counter barrage → afterglow.',
      'Tier 2 — +2 barrage fists, higher absorb cap, +25% counter damage.',
      'Tier 3 — CLOSING STATEMENT: if the meter fills twice in one deployment, the second barrage adds a gravity slam that yanks all enemies in range to the ring edge first.',
    ],
    t3: { slamFirst: { pullPerS: 400, durS: 0.5 } },
    chaos: { meterFullReduce: 2, arcDmgMult: 1.25, afterglowDurMult: 1.4 },
    costs: { base: FUSION_BASE_COST, t2: FUSION_TIER2_COST, t3: FUSION_TIER3_COST },
  },
});

// ─── Παράγωγα / helpers ─────────────────────────────────────────────────────────

export const FUSION_IDS = Object.freeze(Object.keys(FUSION_DEFS));

// Σειρά εμφάνισης στην κάρτα-UI: ομαδοποίηση ανά χαρακτήρα με τη σειρά του roster.
export const FUSION_ROSTER_ORDER = Object.freeze([
  'skeleton_warrior', 'taekwondo_girl', 'brawler_warrior', 'euclid_vector',
  'oni_cataclysm_protocol', 'cyber_arm_hero', 'assassin_clone',
  'japan_phasewalker', 'eddie', 'dimis_kickboxer',
]);
export const FUSION_CARD_ORDER = Object.freeze(
  FUSION_ROSTER_ORDER.flatMap(ch => FUSION_IDS.filter(id => FUSION_DEFS[id].char === ch))
);

export const CHAR_DISPLAY_NAMES = Object.freeze({
  skeleton_warrior: 'Skeleton Warrior', taekwondo_girl: 'Taekwondo Girl',
  brawler_warrior: 'Brawler', euclid_vector: 'Euclid',
  oni_cataclysm_protocol: 'Oni', cyber_arm_hero: 'Cyber-Arm',
  assassin_clone: 'Assassin', japan_phasewalker: 'Phasewalker',
  eddie: 'Eddie', dimis_kickboxer: "Dimi's Kickboxer",
});

export function fusionsForChar(charId) {
  return FUSION_CARD_ORDER.filter(id => FUSION_DEFS[id].char === charId);
}

// Πλήρης λίστα canonical audio hooks (100) — παραδοτέο για το επόμενο authored Wave.
export function allFusionAudioHooks() {
  const out = [];
  for (const id of FUSION_CARD_ORDER) out.push(...fusionHookIds(id));
  return out;
}

// Επικύρωση recipe εντός run — καλείται από το FusionEngine (Batch D).
// rt = BuildEngineRuntime. Επιστρέφει true ΜΟΝΟ αν και τα 3 components υπάρχουν
// στα απαιτούμενα levels (evolved μετρά ως Lv5). External weapons (π.χ. Solo Red
// Thunder του Eddie) ζουν στο legacy layer μέχρι το evolution — το level τους
// διαβάζεται από game._weaponLevels, ακριβώς όπως στο BuildEngine._readyEvolutions.
export function fusionRecipeReady(def, rt, weaponDefs) {
  if (!def || !rt || !rt.weapons) return false;
  for (let i = 0; i < def.components.length; i++) {
    const cid = def.components[i];
    const w = rt.weapons.get(cid);
    let lvl = 0;
    if (w) lvl = w.evolved ? 5 : (w.level | 0);
    else if (weaponDefs && weaponDefs[cid]?.external) {
      lvl = Number(rt.game?._weaponLevels?.get?.(cid) || 0);
    }
    if (lvl < FUSION_REQ_LEVELS[i]) return false;
  }
  return true;
}

// Sanity: δομική αυτο-επικύρωση (την τρέχει και το regression suite).
export function validateFusionCatalog() {
  const errs = [];
  const perChar = {};
  const recipes = new Set();
  for (const [id, d] of Object.entries(FUSION_DEFS)) {
    if (d.id !== id) errs.push(id + ': id mismatch');
    if (!d.char || !CHAR_DISPLAY_NAMES[d.char]) errs.push(id + ': bad char ' + d.char);
    if (!Array.isArray(d.components) || d.components.length !== 3) errs.push(id + ': needs exactly 3 components');
    const rk = d.components.join('+');
    if (recipes.has(rk)) errs.push(id + ': duplicate recipe ' + rk);
    recipes.add(rk);
    if (!d.art || !d.art.startsWith('assets/weapons/fusions/' + d.char + '/')) errs.push(id + ': bad art path');
    if (!d.art || !d.art.endsWith(id + '.png')) errs.push(id + ': art filename must be <fusion_id>.png');
    for (const r of (d.replaces || [])) if (!d.components.includes(r)) errs.push(id + ': replaces non-component ' + r);
    if (!Array.isArray(d.tiers) || d.tiers.length !== 3) errs.push(id + ': needs 3 tier descriptions');
    if (!d.mech || !d.mech.bossMultiplier || d.mech.bossMultiplier > 0.7) errs.push(id + ': bossMultiplier missing or > 0.7');
    if (!d.mech.caps) errs.push(id + ': missing hard caps');
    perChar[d.char] = (perChar[d.char] || 0) + 1;
  }
  for (const ch of FUSION_ROSTER_ORDER) {
    if ((perChar[ch] || 0) < 2) errs.push(ch + ': fewer than 2 fusions');
  }
  if (Object.keys(FUSION_DEFS).length < 20) errs.push('fewer than 20 fusions total');
  return errs;
}
