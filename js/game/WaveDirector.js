// ═══════════════════════════════════════════════════════════════════════════════
// HORDE REBUILD Φάση 4 — WAVE DIRECTOR (spec §15-§19, §29)
// Minute-by-minute wave tables ανά mode + 10 formations + targetAlive quota.
// Τα formations επηρεάζουν ΜΟΝΟ το spawn (θέση + type hint) — μετά το spawn κάθε
// enemy γυρνά στη συμπεριφορά του αρχέτυπού του (κανένα ειδικό AI εδώ).
// Οι θέσεις είναι ΕΚΤΟΣ viewport (§17): 8 sectors, margin 120-220 desktop /
// 90-170 mobile. Ranged βάρη κρατημένα χαμηλά (§2: 80-88% της ορδής melee).
// ═══════════════════════════════════════════════════════════════════════════════

const IS_MOBILE = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

const MARGIN_MIN = IS_MOBILE ? 90 : 120;
const MARGIN_MAX = IS_MOBILE ? 170 : 220;

// ── Type hints ανά mode: τα formations ζητούν κατηγορία, όχι συγκεκριμένο type ──
const HINT_POOLS = {
  act1: {
    fodder: ['Glitch Drone', 'Volt Rat'],
    melee:  ['Scrap Scavenger', 'Rogue Punk', 'Cyber-Net Junkie', 'Cryo Claw', 'Ember Scarab'],
    fast:   ['Combat Hunter', 'Stealth Infiltrator', 'Overclocked Berserker', 'Solar Stinger', 'Toxin Leech'],
    heavy:  ['Heavy Mech', 'Abyss Maw', 'Void Widow', 'Solar Tyrant'],
    ranged: ['Cyber Shooter', 'Rift Eye'],
    elite:  ['Combat Hunter', 'Heavy Mech', 'Overclocked Berserker', 'Razorhound'],
  },
  chaos: {
    fodder: ['Neon Swarmer', 'Volt Rat', 'Glitch Drone'],
    melee:  ['Rogue Punk', 'Scrap Scavenger', 'Malware Spreader', 'Cryo Claw', 'Toxin Leech'],
    fast:   ['Combat Hunter', 'Data Glitch Stalker', 'Overclocked Berserker', 'Razorhound'],
    heavy:  ['Plasma Juggernaut', 'Cyber-Axe Executioner', 'Singularity Core Mech', 'Abyss Maw'],
    ranged: ['EMP Hacker Drone', 'Wireframe Net-Caster', 'Void Rift Summoner'],
    elite:  ['Cyber-Axe Executioner', 'Singularity Core Mech', 'Razorhound'],
  },
};
HINT_POOLS.endless = HINT_POOLS.act1;   // Endless: ίδιο ρόστερ, μεγαλύτερα tables/πυκνότητα

// ── Wave tables (§15/§19) — δραματουργία ανά λεπτό ──────────────────────────────
// groups: weighted enemy pool · targetAlive: επιθυμητοί ενεργοί · interval: spawn tick
// batch: μέγεθος πακέτου · formations: ροτάρουν ανά ~10s μέσα στο block.
// Ranged βάρη <= 0.05 ώστε το 80-88% της ορδής να είναι πάντα melee (§2).
const G = (enemy, weight) => ({ enemy, weight });

export const STAGE_WAVES = {
  // ═══ ACT 1 — 8λεπτη δραματουργία (§19) ═══
  act1: [
    { start: 0,   end: 60,  targetAlive: 45,  interval: 0.75, batch: 3, formations: ['PERIMETER'],
      groups: [G('Scrap Scavenger', 0.5), G('Glitch Drone', 0.3), G('Rogue Punk', 0.2)] },                       // Readable Entry — ΚΑΘΟΛΟΥ projectiles
    { start: 60,  end: 120, targetAlive: 80,  interval: 0.50, batch: 4, formations: ['PERIMETER', 'RING_PRESSURE'],
      groups: [G('Scrap Scavenger', 0.35), G('Glitch Drone', 0.25), G('Volt Rat', 0.22), G('Rogue Punk', 0.18)] }, // First Surround
    { start: 120, end: 180, targetAlive: 105, interval: 0.45, batch: 4, formations: ['PERIMETER', 'FAST_HUNTER_BURST'],
      groups: [G('Scrap Scavenger', 0.28), G('Volt Rat', 0.24), G('Combat Hunter', 0.18),
               G('Stealth Infiltrator', 0.14), G('Rogue Punk', 0.12), G('Cyber Shooter', 0.04)] },                // Speed Contrast — 1ος σπάνιος ranged
    { start: 180, end: 240, targetAlive: 130, interval: 0.42, batch: 5, formations: ['DIRECTIONAL_WALL', 'PERIMETER'],
      groups: [G('Rogue Punk', 0.26), G('Scrap Scavenger', 0.22), G('Heavy Mech', 0.14), G('Cryo Claw', 0.14),
               G('Volt Rat', 0.14), G('Abyss Maw', 0.06), G('Cyber Shooter', 0.04)] },                            // Wall Pressure
    { start: 240, end: 300, targetAlive: 150, interval: 0.38, batch: 5, formations: ['ELITE_ESCORT', 'PERIMETER', 'RING_PRESSURE'],
      groups: [G('Cyber-Net Junkie', 0.24), G('Rogue Punk', 0.2), G('Combat Hunter', 0.18), G('Volt Rat', 0.18),
               G('Ember Scarab', 0.12), G('Heavy Mech', 0.08)] },                                                 // Elite Test
    { start: 300, end: 360, targetAlive: 195, interval: 0.32, batch: 6, formations: ['RING_PRESSURE', 'CRESCENT', 'PERIMETER'],
      groups: [G('Volt Rat', 0.3), G('Glitch Drone', 0.24), G('Scrap Scavenger', 0.2),
               G('Solar Stinger', 0.14), G('Toxin Leech', 0.12)] },                                               // Dense Horde — τα evolutions λάμπουν
    { start: 360, end: 420, targetAlive: 225, interval: 0.30, batch: 6, formations: ['HEAVY_COLUMN', 'FAST_HUNTER_BURST', 'PERIMETER', 'RANGED_POCKET'],
      groups: [G('Rogue Punk', 0.2), G('Combat Hunter', 0.18), G('Heavy Mech', 0.14), G('Volt Rat', 0.18),
               G('Overclocked Berserker', 0.12), G('Abyss Maw', 0.08), G('Void Widow', 0.06), G('Rift Eye', 0.04)] }, // Mixed Pressure
    { start: 420, end: 1e9, targetAlive: 265, interval: 0.26, batch: 7, formations: ['TWIN_WALL', 'RING_PRESSURE', 'FOUR_CORNER', 'PERIMETER'],
      groups: [G('Volt Rat', 0.24), G('Rogue Punk', 0.2), G('Scrap Scavenger', 0.18), G('Combat Hunter', 0.14),
               G('Heavy Mech', 0.1), G('Cryo Claw', 0.1), G('Cyber Shooter', 0.04)] },                            // Final Collapse -> boss (τα boss slots μένουν στα υπάρχοντα συστήματα)
  ],

  // ═══ ENDLESS — 10λεπτος κύκλος, +18% targetAlive ανά loop (§29: πυκνότερη ορδή) ═══
  endless: [
    { start: 0,   end: 75,  targetAlive: 220, interval: 0.30, batch: 6, formations: ['PERIMETER', 'RING_PRESSURE'],
      groups: [G('Scrap Scavenger', 0.26), G('Volt Rat', 0.24), G('Glitch Drone', 0.2), G('Rogue Punk', 0.18), G('Combat Hunter', 0.12)] },
    { start: 75,  end: 150, targetAlive: 300, interval: 0.26, batch: 7, formations: ['RING_PRESSURE', 'FAST_HUNTER_BURST', 'PERIMETER'],
      groups: [G('Volt Rat', 0.26), G('Combat Hunter', 0.2), G('Stealth Infiltrator', 0.16), G('Scrap Scavenger', 0.16),
               G('Solar Stinger', 0.12), G('Cyber Shooter', 0.05), G('Toxin Leech', 0.05)] },
    { start: 150, end: 240, targetAlive: 380, interval: 0.22, batch: 8, formations: ['DIRECTIONAL_WALL', 'PERIMETER', 'HEAVY_COLUMN'],
      groups: [G('Rogue Punk', 0.22), G('Volt Rat', 0.2), G('Heavy Mech', 0.14), G('Cryo Claw', 0.14),
               G('Combat Hunter', 0.14), G('Abyss Maw', 0.08), G('Ember Scarab', 0.08)] },
    { start: 240, end: 330, targetAlive: 450, interval: 0.20, batch: 9, formations: ['ELITE_ESCORT', 'RING_PRESSURE', 'CRESCENT'],
      groups: [G('Volt Rat', 0.24), G('Cyber-Net Junkie', 0.18), G('Combat Hunter', 0.16), G('Glitch Drone', 0.16),
               G('Heavy Mech', 0.1), G('Void Widow', 0.08), G('Rift Eye', 0.04), G('Pulse Burrower', 0.04)] },
    { start: 330, end: 450, targetAlive: 540, interval: 0.17, batch: 10, formations: ['TWIN_WALL', 'RING_PRESSURE', 'FAST_HUNTER_BURST', 'RANGED_POCKET'],
      groups: [G('Volt Rat', 0.26), G('Solar Stinger', 0.18), G('Rogue Punk', 0.18), G('Combat Hunter', 0.14),
               G('Razorhound', 0.1), G('Abyss Maw', 0.08), G('Cyber Shooter', 0.06)] },
    { start: 450, end: 600, targetAlive: 650, interval: 0.15, batch: 11, formations: ['FOUR_CORNER', 'TWIN_WALL', 'RING_PRESSURE', 'HEAVY_COLUMN'],
      groups: [G('Volt Rat', 0.24), G('Glitch Drone', 0.2), G('Rogue Punk', 0.16), G('Heavy Mech', 0.12),
               G('Solar Tyrant', 0.08), G('Combat Hunter', 0.12), G('Amethyst Fang', 0.08)] },
  ],

  // ═══ CHAOS — υψηλότερη density, mixed formations, elites· projectiles ΔΕΝ κλιμακώνουν (§29) ═══
  chaos: [
    { start: 0,   end: 90,  targetAlive: 280, interval: 0.24, batch: 8, formations: ['PERIMETER', 'RING_PRESSURE', 'FAST_HUNTER_BURST'],
      groups: [G('Neon Swarmer', 0.3), G('Volt Rat', 0.2), G('Rogue Punk', 0.16), G('Combat Hunter', 0.14),
               G('Data Glitch Stalker', 0.12), G('EMP Hacker Drone', 0.04), G('Malware Spreader', 0.04)] },
    { start: 90,  end: 210, targetAlive: 400, interval: 0.19, batch: 9, formations: ['DIRECTIONAL_WALL', 'ELITE_ESCORT', 'RING_PRESSURE', 'HEAVY_COLUMN'],
      groups: [G('Neon Swarmer', 0.26), G('Glitch Drone', 0.16), G('Cyber-Axe Executioner', 0.14), G('Overclocked Bomber', 0.1),
               G('Toxin Leech', 0.12), G('Plasma Juggernaut', 0.08), G('Data Glitch Stalker', 0.1), G('Wireframe Net-Caster', 0.04)] },
    { start: 210, end: 360, targetAlive: 520, interval: 0.16, batch: 10, formations: ['TWIN_WALL', 'CRESCENT', 'FAST_HUNTER_BURST', 'RANGED_POCKET'],
      groups: [G('Neon Swarmer', 0.28), G('Volt Rat', 0.18), G('Razorhound', 0.14), G('Cyber-Axe Executioner', 0.12),
               G('Malware Spreader', 0.1), G('Singularity Core Mech', 0.08), G('Overclocked Bomber', 0.06), G('Void Rift Summoner', 0.04)] },
    { start: 360, end: 1e9, targetAlive: 640, interval: 0.14, batch: 11, formations: ['FOUR_CORNER', 'TWIN_WALL', 'RING_PRESSURE', 'ELITE_ESCORT'],
      groups: [G('Neon Swarmer', 0.26), G('Glitch Drone', 0.18), G('Rogue Punk', 0.14), G('Plasma Juggernaut', 0.1),
               G('Cyber-Axe Executioner', 0.12), G('Data Glitch Stalker', 0.1), G('Abyss Maw', 0.06), G('EMP Hacker Drone', 0.04)] },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────────
export class WaveDirector {
  constructor() {
    this._formT = 0;          // χρόνος τρέχοντος formation
    this._formIdx = 0;
    this._formAngle = Math.random() * Math.PI * 2;   // κατεύθυνση για walls/crescent
  }

  static mode(game) {
    if (game._chaosMode) return 'chaos';
    if (game.endless) return 'endless';
    return 'act1';
  }

  /** Το ενεργό block για χρόνο t (Endless: loop 600s με +18% targetAlive ανά κύκλο). */
  blockFor(mode, t) {
    const table = STAGE_WAVES[mode];
    let tt = t, loopMult = 1;
    if (mode === 'endless') {
      const loop = Math.floor(t / 600);
      tt = t % 600;
      loopMult = 1 + 0.18 * loop;                      // §29: density, ΟΧΙ bullets
    }
    let blk = table[0];
    for (const b of table) if (tt >= b.start) blk = b; else break;
    if (loopMult !== 1) return { ...blk, targetAlive: Math.round(blk.targetAlive * loopMult) };
    return blk;
  }

  /** Ροτάρει formation μέσα στο block κάθε 9-14s — στιγμές directional πίεσης (§17). */
  activeFormation(blk, dt) {
    this._formT -= dt;
    if (this._formT <= 0) {
      this._formT = 9 + Math.random() * 5;
      this._formIdx = Math.floor(Math.random() * blk.formations.length);
      this._formAngle = Math.random() * Math.PI * 2;
    }
    return blk.formations[this._formIdx] || 'PERIMETER';
  }

  /** Weighted pick από το block pool. */
  pickEnemy(blk) {
    let r = Math.random(), acc = 0;
    for (const g of blk.groups) { acc += g.weight; if (r <= acc) return g.enemy; }
    return blk.groups[blk.groups.length - 1].enemy;
  }

  pickFromHint(mode, hint) {
    const pool = HINT_POOLS[mode]?.[hint];
    return pool ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  /**
   * §17/§18: n θέσεις spawn ΕΚΤΟΣ viewport για το formation.
   * Επιστρέφει [{x, y, hint, elite}] — hint = type κατηγορία (ή null = block pool).
   */
  spawnPlan(formation, n, camera, viewW, viewH) {
    const cx = camera.x + viewW / 2, cy = camera.y + viewH / 2;
    const halfDiag = Math.hypot(viewW, viewH) / 2;
    const m = () => MARGIN_MIN + Math.random() * (MARGIN_MAX - MARGIN_MIN);
    const R = () => halfDiag + m();
    const at = (ang, rad, hint = null, elite = false) =>
      ({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad, hint, elite });
    const out = [];
    const A = this._formAngle;

    switch (formation) {
      case 'RING_PRESSURE': {                    // κύκλος που καταρρέει προς το κέντρο
        for (let i = 0; i < n; i++) out.push(at((i / n) * Math.PI * 2 + A, R()));
        break;
      }
      case 'DIRECTIONAL_WALL': {                 // πυκνός τοίχος από ΜΙΑ πλευρά
        for (let i = 0; i < n; i++) out.push(at(A + (Math.random() - 0.5) * 0.55, R()));
        break;
      }
      case 'TWIN_WALL': {                        // δύο τοίχοι από αντίθετες πλευρές
        for (let i = 0; i < n; i++) out.push(at((i % 2 ? A : A + Math.PI) + (Math.random() - 0.5) * 0.5, R()));
        break;
      }
      case 'FOUR_CORNER': {                      // 4 συμπαγείς ομάδες από γωνίες
        for (let i = 0; i < n; i++) out.push(at(Math.PI / 4 + (i % 4) * Math.PI / 2 + (Math.random() - 0.5) * 0.3, R()));
        break;
      }
      case 'CRESCENT': {                         // καμπύλη 140° που κλείνει στο κέντρο
        for (let i = 0; i < n; i++) out.push(at(A + (i / Math.max(1, n - 1) - 0.5) * 2.44, R()));
        break;
      }
      case 'FAST_HUNTER_BURST': {                // μικρή σφιχτή ομάδα γρήγορων
        for (let i = 0; i < n; i++) out.push(at(A + (Math.random() - 0.5) * 0.35, R(), i < Math.ceil(n * 0.6) ? 'fast' : null));
        break;
      }
      case 'HEAVY_COLUMN': {                     // στήλη heavy με fodder τριγύρω
        for (let i = 0; i < n; i++) {
          const heavyCore = i < Math.ceil(n * 0.35);
          out.push(at(A + (Math.random() - 0.5) * (heavyCore ? 0.18 : 0.6),
                      R() + (heavyCore ? i * 26 : 0), heavyCore ? 'heavy' : 'fodder'));
        }
        break;
      }
      case 'ELITE_ESCORT': {                     // elite στο κέντρο, melee συνοδοί
        for (let i = 0; i < n; i++)
          out.push(at(A + (Math.random() - 0.5) * 0.4, R() + (i === 0 ? 30 : Math.random() * 60),
                      i === 0 ? 'elite' : 'melee', i === 0));
        break;
      }
      case 'RANGED_POCKET': {                    // 2-4 ranged ΠΙΣΩ από melee ομάδα
        const rangedN = Math.min(4, Math.max(2, Math.round(n * 0.25)));
        for (let i = 0; i < n; i++) {
          const isR = i < rangedN;
          out.push(at(A + (Math.random() - 0.5) * 0.5, R() + (isR ? 120 : 0), isR ? 'ranged' : 'melee'));
        }
        break;
      }
      case 'PERIMETER':
      default: {                                 // ολόκληρη η περίμετρος — 8 sectors
        for (let i = 0; i < n; i++) out.push(at(Math.floor(Math.random() * 8) * (Math.PI / 4) + (Math.random() - 0.5) * 0.7, R()));
        break;
      }
    }
    return out;
  }
}
