// ═══════════════════════════════════════════════════════════════════════════════
// P2 BUILD ENGINE — data layer (P2.1). Spec: docs/P2_BUILD_ENGINE_SPEC_GR.md
// ΕΝΑ data source (§13): gameplay, level-up cards, NULL ARSENAL και Damage Report
// διαβάζουν ΟΛΑ από εδώ. Arrays = τιμή ανά level (Lv1..Lv5).
// ΑΠΟΛΥΤΟΣ ΚΑΝΟΝΑΣ: κάθε όπλο/evolution = unique + premium, procedural όπως τα
// ultimates (lighter layers: halo -> σώμα -> λευκός πυρήνας), ΚΑΝΕΝΑ PNG,
// μηδέν shadowBlur σε loops, caps παντού, boss modifiers παντού.
// ═══════════════════════════════════════════════════════════════════════════════

export const WEAPON_DEFS = {
  // ── 01 · SKELETON — MARROW SPITTER ──────────────────────────────────────────
  // Τρεις διαδοχικές ριπές αιχμηρών οστών στον κοντινότερο εχθρό· pierce 1·
  // κάθε 3η επίθεση σπάει σε bone splinters (κώνος 3 θραυσμάτων, 45% dmg).
  marrow_spitter: {
    name: 'Marrow Spitter', owner: 'skeleton_warrior', category: 'weapon',
    kind: 'burst_projectile',                    // executor primitive
    damage:   [14, 16, 19, 23, 28],
    cooldown: [1.30, 1.20, 1.10, 0.95, 0.80],
    amount:   [3, 3, 3, 4, 4],                   // βλήματα ανά ριπή (burst)
    burstGap: 0.09,                              // s ανάμεσα στα βλήματα της ριπής
    pierce:   [1, 1, 1, 2, 2],
    speed:    520,
    critChance: 0.06, critMult: 1.6,
    splinter: { every: 3, count: 3, dmgMult: 0.45, spread: 0.5 },  // η 3η επίθεση σπάει
    knockback: 90, bossMultiplier: 0.85, maxActive: 24,
    tags: ['BONE', 'PROJECTILE', 'PIERCE'],
    evolutionPassive: 'ossified_dynamo', evolution: 'marrow_reactor',
    desc: 'Fires jagged bone volleys. Every third volley shatters into splinters.',
  },
  // ── 02 · SKELETON — GRAVE CANTOR ────────────────────────────────────────────
  // Αιωρούμενα κρανία σε αργή τροχιά· damage pulses με micro-stagger·
  // Amount = περισσότερες «φωνές» (κρανία).
  grave_cantor: {
    name: 'Grave Cantor', owner: 'skeleton_warrior', category: 'weapon',
    kind: 'orbit_pulser',
    damage:   [9, 11, 13, 16, 20],               // ανά pulse
    cooldown: [0, 0, 0, 0, 0],                   // orbit weapon — μόνιμο όσο ζει
    amount:   [1, 2, 2, 3, 4],                   // κρανία-φωνές
    tickRate: [1.10, 1.05, 1.00, 0.90, 0.80],    // pulse κάθε Χ s ανά κρανίο
    pulseRadius: [64, 66, 70, 76, 84],
    orbitRadius: 96, orbitSpeed: 0.9,            // rad/s (αργή τροχιά)
    stagger: 0.22,                               // micro-stagger στο pulse
    critChance: 0.05, critMult: 1.5,
    bossMultiplier: 0.80, maxActive: 4,
    tags: ['BONE', 'SOUND', 'ORBIT', 'AOE'],
    evolutionPassive: 'funeral_resonator', evolution: 'revenant_choir',
    desc: 'Floating skulls sing cursed notes — damage pulses that briefly stagger.',
  },
};

export const PASSIVE_DEFS = {
  // Evolution catalysts (Skeleton pair) — δίνουν ΚΑΙ πραγματικό όφελος, όχι σκέτο κλειδί.
  ossified_dynamo: {
    name: 'Ossified Dynamo', category: 'evolution_passive', owner: null,   // εμφανίζεται όταν υπάρχει το όπλο
    forWeapon: 'marrow_spitter', requiredFor: 'marrow_reactor',
    maxLevel: 3,
    bonuses: [ { bonePierce: 1 }, { bonePierce: 1, boneDmg: 0.10 }, { bonePierce: 2, boneDmg: 0.18 } ],
    desc: 'Bone projectiles pierce further and hit harder. Powers the Marrow Reactor.',
  },
  funeral_resonator: {
    name: 'Funeral Resonator', category: 'evolution_passive', owner: null,
    forWeapon: 'grave_cantor', requiredFor: 'revenant_choir',
    maxLevel: 3,
    bonuses: [ { pulseRadius: 0.12 }, { pulseRadius: 0.12, tickRate: 0.08 }, { pulseRadius: 0.20, tickRate: 0.12 } ],
    desc: 'The cursed notes ring wider and faster. Powers the Revenant Choir.',
  },
};

export const EVOLUTION_RECIPES = {
  // MARROW REACTOR: τα οστά «θερμαίνονται»· κάθε χτύπημα αποθηκεύει Marrow Charge·
  // στο γέμισμα (24 hits) — κυκλική έκρηξη οστών + λευκής νεκροπλασματικής ενέργειας.
  marrow_reactor: {
    name: 'Marrow Reactor', weapon: 'marrow_spitter', passive: 'ossified_dynamo',
    weaponLevel: 5, passiveLevel: 3,
    damage: 34, cooldown: 0.62, amount: 5, pierce: 3,
    charge: { perHit: 1, full: 24, novaDmg: 90, novaRadius: 240, bossMultiplier: 0.70 },
    bossMultiplier: 0.80, tags: ['BONE', 'PROJECTILE', 'NOVA'],
    desc: 'Superheated marrow rounds. A full charge detonates a ring of bone and white necroplasm.',
  },
  // REVENANT CHOIR: διαδοχικοί κύκλοι φαντασμάτων· οι νότες ενώνονται σε ηχητικές
  // λεπίδες (τόξα) ανάμεσα σε γειτονικά κρανία που κόβουν ό,τι περνά.
  revenant_choir: {
    name: 'Revenant Choir', weapon: 'grave_cantor', passive: 'funeral_resonator',
    weaponLevel: 5, passiveLevel: 3,
    amount: 6, tickRate: 0.55, pulseDmg: 26, pulseRadius: 100,
    blade: { dmg: 18, width: 14, tick: 0.4 },    // ηχητικές λεπίδες μεταξύ κρανίων
    bossMultiplier: 0.75, maxActive: 6, tags: ['BONE', 'SOUND', 'ORBIT', 'BLADE'],
    desc: 'A choir of revenants — their joined notes form sonic blades between the skulls.',
  },
};

// ─── ACTUAL RUN DPS (§6): ο πραγματικός μετρητής ανά όπλο ───────────────────────
export class DamageLog {
  constructor() { this.byWeapon = new Map(); this._t0 = 0; }
  start(now) { this._t0 = now; this.byWeapon.clear(); }
  hit(weaponId, dmg, { crit = false, kill = false } = {}) {
    let w = this.byWeapon.get(weaponId);
    if (!w) { w = { total: 0, hits: 0, crits: 0, kills: 0, peak: 0, _win: [], }; this.byWeapon.set(weaponId, w); }
    w.total += dmg; w.hits++; if (crit) w.crits++; if (kill) w.kills++;
    const now = performance.now();
    w._win.push([now, dmg]);                                  // 3s κυλιόμενο παράθυρο για Peak DPS
    while (w._win.length && now - w._win[0][0] > 3000) w._win.shift();
    let winSum = 0; for (const [, d] of w._win) winSum += d;
    w.peak = Math.max(w.peak, winSum / 3);
  }
  report(now) {
    const secs = Math.max(1, (now - this._t0) / 1000);
    let grand = 0; for (const w of this.byWeapon.values()) grand += w.total;
    const rows = [];
    for (const [id, w] of this.byWeapon) rows.push({
      id, total: Math.round(w.total), avgDps: Math.round(w.total / secs),
      peakDps: Math.round(w.peak), kills: w.kills, crits: w.crits,
      share: grand > 0 ? Math.round(100 * w.total / grand) : 0,
    });
    rows.sort((a, b) => b.total - a.total);
    return rows;
  }
}

// Theoretical SINGLE-TARGET DPS (§6) — μόνο για τις κάρτες του καταλόγου, με σαφές label.
export function singleTargetDps(def, level) {
  const i = Math.max(0, Math.min(level - 1, def.damage.length - 1));
  const cd = def.cooldown[i] || def.tickRate?.[i] || 1;
  return cd > 0 ? Math.round((def.damage[i] * (def.amount?.[i] || 1)) / cd * 10) / 10 : 0;
}
