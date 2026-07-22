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
    evolutionPassive: 'ossified_dynamo', evolution: 'be_marrow_reactor',
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
    evolutionPassive: 'funeral_resonator', evolution: 'be_revenant_choir',
    desc: 'Floating skulls sing cursed notes — damage pulses that briefly stagger.',
  },
};

export const PASSIVE_DEFS = {
  // Evolution catalysts (Skeleton pair) — δίνουν ΚΑΙ πραγματικό όφελος, όχι σκέτο κλειδί.
  ossified_dynamo: {
    name: 'Ossified Dynamo', category: 'evolution_passive', owner: null,   // εμφανίζεται όταν υπάρχει το όπλο
    forWeapon: 'marrow_spitter', requiredFor: 'be_marrow_reactor',
    maxLevel: 3,
    bonuses: [ { bonePierce: 1 }, { bonePierce: 1, boneDmg: 0.10 }, { bonePierce: 2, boneDmg: 0.18 } ],
    desc: 'Bone projectiles pierce further and hit harder. Powers the Marrow Reactor.',
  },
  funeral_resonator: {
    name: 'Funeral Resonator', category: 'evolution_passive', owner: null,
    forWeapon: 'grave_cantor', requiredFor: 'be_revenant_choir',
    maxLevel: 3,
    bonuses: [ { pulseRadius: 0.12 }, { pulseRadius: 0.12, tickRate: 0.08 }, { pulseRadius: 0.20, tickRate: 0.12 } ],
    desc: 'The cursed notes ring wider and faster. Powers the Revenant Choir.',
  },
};

// ΣΗΜΕΙΩΣΗ IDs (Maria 2026-07-16): τα P2 evolutions φέρουν πρόθεμα be_ ώστε να
// ΣΥΝΥΠΑΡΧΟΥΝ με τα old-gen marrow_reactor/revenant_choir του WeaponCatalog μέχρι
// το migration του P2.7. Τα display names μένουν όπως στο spec.
export const EVOLUTION_RECIPES = {
  // MARROW REACTOR: τα οστά «θερμαίνονται»· κάθε χτύπημα αποθηκεύει Marrow Charge·
  // στο γέμισμα (24 hits) — κυκλική έκρηξη οστών + λευκής νεκροπλασματικής ενέργειας.
  be_marrow_reactor: {
    name: 'Marrow Reactor', weapon: 'marrow_spitter', passive: 'ossified_dynamo',
    weaponLevel: 5, passiveLevel: 3,
    damage: 34, cooldown: 0.62, amount: 5, pierce: 3,
    charge: { perHit: 1, full: 24, novaDmg: 90, novaRadius: 240, bossMultiplier: 0.70 },
    bossMultiplier: 0.80, tags: ['BONE', 'PROJECTILE', 'NOVA'],
    desc: 'Superheated marrow rounds. A full charge detonates a ring of bone and white necroplasm.',
  },
  // REVENANT CHOIR: διαδοχικοί κύκλοι φαντασμάτων· οι νότες ενώνονται σε ηχητικές
  // λεπίδες (τόξα) ανάμεσα σε γειτονικά κρανία που κόβουν ό,τι περνά.
  be_revenant_choir: {
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

// ═══════════════════════════════════════════════════════════════════════════════
// P2.2 RUNTIME — generic weapon executor + Skeleton pair end-to-end (template).
// Ενεργό ΜΟΝΟ με ?p2=1 (το Game δημιουργεί instance μόνο τότε). Μηδενική επίδραση
// χωρίς το flag. Executor primitives: burst_projectile, orbit_pulser.
// VFX: συνταγή ultimates — lighter layering (halo -> σώμα -> λευκός πυρήνας),
// φάσεις στον χρόνο, try/finally transform armor, caps, ΚΑΝΕΝΑ PNG, μηδέν shadowBlur.
// ═══════════════════════════════════════════════════════════════════════════════

// §8 χρωματικός κώδικας καρτών
const CARD_COLOR = { weapon: '#e9ecf2', passive: '#4fd8ff', evolution: '#ffd447' };
const FX_CAP = 48, NOVA_CAP = 2;

// P2.3+: pluggable executors — κάθε char-module κάνει register το δικό του όπλο:
// WEAPON_EXECUTORS[id] = { update(rt, w, dt), draw(rt, ctx, w) }
export const WEAPON_EXECUTORS = {};

// P2.6: generic hooks για τα build passives (§26-50). modDamage επιστρέφει
// πολλαπλασιαστή ΠΡΙΝ τα boss caps· onDamage/onKill μετά το χτύπημα· tick ανά frame.
// Τα hooks ΔΕΝ τρέχουν σε echo-χτυπήματα (depth guard) — μηδενική αναδρομή.
export const RUNTIME_HOOKS = { modDamage: [], onDamage: [], onKill: [], tick: [] };

export class BuildEngineRuntime {
  constructor(game) {
    console.log('%c[P2] BUILD ENGINE ACTIVE — ' + Object.keys(WEAPON_DEFS).length + ' weapons / ' +
      Object.keys(PASSIVE_DEFS).length + ' passives / ' + Object.keys(EVOLUTION_RECIPES).length + ' evolutions in pool',
      'color:#4fd8ff;font-weight:bold');
    this.game     = game;
    this.log      = new DamageLog();
    this.log.start(performance.now());
    this.weapons  = new Map();   // id -> state { id, level, evolved, cd, volley, burstQ:[], charge, skulls:[], bladeT }
    this.passives = new Map();   // id -> level
    this.shards   = [];          // bone projectiles
    this.novas    = [];          // Marrow Reactor rings
    this.fx       = [];          // transient rings/motes (bounded FX_CAP)
    this._t       = 0;
    this._status  = new Map();   // enemy -> { shock, fear, burn:{t,dps,wid}, poison:{stacks,t,wid} }
    this.patches  = [];          // burn patches (λιωμένο μέταλλο/μάγμα) — cap 8
    // P2.7 — loadout caps & pool διαχείριση (spec: 6W/6P, family limit, Banish/Seal).
    // ΣΗΜΕΙΩΣΗ: το migration του παλιού συστήματος ΔΕΝ έγινε — περιμένει την έγκριση
    // της Maria στο feel (τα 2T/1R/1A caps ανήκουν στα παλιά συστήματα ως τότε).
    this.CAPS     = { weapons: 6, passives: 6, perFamily: 2 };
    this.banished = new Set();   // banished weapon families (πρώτο tag)
    this.sealed   = new Set();   // sealed passive ids
    this.evolutionEvents = [];   // successful, recipe-eligible evolutions in this run
  }

  // ── P2.7 helpers ────────────────────────────────────────────────────────────
  _familyOf(id) { return (WEAPON_DEFS[id]?.tags || [])[0] || 'MISC'; }
  _familyCount(fam) {
    let n = 0;
    for (const w of this.weapons.values()) if (this._familyOf(w.id) === fam) n++;
    return n;
  }
  banishFamily(fam) { this.banished.add(fam); this.game.triggerAnnouncement?.('⛔ BANISHED: ' + fam, '#ff6a7a'); }
  sealPassive(pid)  { this.sealed.add(pid); this.game.triggerAnnouncement?.('⛔ SEALED: ' + (PASSIVE_DEFS[pid]?.name || pid), '#ff6a7a'); }
  // Πατιέται με B στην οθόνη level-up: κάνει banish την οικογένεια/seal το passive
  // της τρέχουσας BuildEngine κάρτας και τη σβήνει από τα choices (μένει κενή θέση).
  banishFromUI(upgradeUI) {
    if (!upgradeUI?.choices) return false;
    for (let i = 0; i < upgradeUI.choices.length; i++) {
      const k = String(upgradeUI.choices[i]?.key || '');
      if (k.startsWith('be_w_')) {
        const wid = k.slice(5);
        this.banishFamily(this._familyOf(wid));
        upgradeUI.choices[i] = { key: 'be_banished', name: 'BANISHED', description: 'This family will not be offered again this run.',
          iconColor: '#ff6a7a', icon: '⛔', rarity: 'common', maxLevel: 1, apply() {}, canApply() { return true; } };
        return true;
      }
      if (k.startsWith('be_p_')) {
        const pid = k.slice(5);
        this.sealPassive(pid);
        upgradeUI.choices[i] = { key: 'be_sealed', name: 'SEALED', description: 'This passive will not be offered again this run.',
          iconColor: '#ff6a7a', icon: '⛔', rarity: 'common', maxLevel: 1, apply() {}, canApply() { return true; } };
        return true;
      }
    }
    return false;
  }

  // ── STATUS LAYER (P2.3+): shock/burn/poison/fear με caps & boss immunity ────
  _st(e) { let s = this._status.get(e); if (!s) { s = {}; this._status.set(e, s); } return s; }
  applyShock(e, dur) {
    if (e.isBoss?.() || e.isMegaBoss) return;
    e.slowTimer = Math.max(e.slowTimer || 0, dur); e.slowFactor = 0.02;
    this._st(e).shock = dur;
    if (this.fx.length < FX_CAP) this.fx.push({ kind: 'spark', x: e.pos.x, y: e.pos.y, r: e.radius + 6, t: 0, life: 0.22 });
  }
  applyBurn(e, dps, dur, wid) { const s = this._st(e); s.burn = { t: dur, dps, wid, next: 0 }; }
  applyPoison(e, wid, addStacks = 1, maxStacks = 8) {
    const s = this._st(e); const p = s.poison || { stacks: 0, t: 0, wid, next: 0 };
    p.stacks = Math.min(maxStacks, p.stacks + addStacks); p.t = 3.0; p.wid = wid; s.poison = p;
  }
  applyFear(e, dur) {
    if (e.isBoss?.() || e.isMegaBoss) return;
    e.slowTimer = Math.max(e.slowTimer || 0, dur); e.slowFactor = Math.min(e.slowFactor ?? 1, 0.35);
    this._st(e).fear = dur;
  }
  addBurnPatch(x, y, radius, dps, dur, wid, col) {
    if (this.patches.length >= 8) this.patches.shift();
    this.patches.push({ x, y, radius, dps, dur, wid, col: col || '#ff9b3c', t: 0, next: 0 });
  }
  _tickStatus(dt) {
    for (const [e, s] of this._status) {
      if (!e || e.hp <= 0) { this._status.delete(e); continue; }
      if (s.burn) { s.burn.t -= dt; s.burn.next -= dt;
        if (s.burn.next <= 0) { s.burn.next = 0.5; this._dealDamage(s.burn.wid, e, s.burn.dps * 0.5, 0.7, false); }
        if (s.burn.t <= 0) delete s.burn; }
      if (s.poison) { s.poison.t -= dt; s.poison.next -= dt;
        if (s.poison.next <= 0) { s.poison.next = 0.5; this._dealDamage(s.poison.wid, e, s.poison.stacks * 1.3, 0.7, false); }
        if (s.poison.t <= 0) delete s.poison; }
      if (s.shock !== undefined) { s.shock -= dt; if (s.shock <= 0) delete s.shock; }
      if (s.fear !== undefined) { s.fear -= dt; if (s.fear <= 0) delete s.fear; }
      if (s.sanction !== undefined) { s.sanction -= dt; if (s.sanction <= 0) delete s.sanction; }
      if (s.shred !== undefined) { s.shred -= dt; if (s.shred <= 0) delete s.shred; }
      if (Object.keys(s).length === 0) this._status.delete(e);     // fix: κράτα custom keys (scars κ.ά.)
    }
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const pa = this.patches[i]; pa.t += dt; pa.next -= dt;
      if (pa.next <= 0) { pa.next = 0.5;
        const near = this.game._spatialGrid ? this.game._spatialGrid.query(pa.x, pa.y, pa.radius + 60) : this.game.enemies;
        for (const e of near) { if (e && e.hp > 0 && Math.hypot(e.pos.x - pa.x, e.pos.y - pa.y) < pa.radius + e.radius)
          this._dealDamage(pa.wid, e, pa.dps * 0.5, 0.7, false); } }
      if (pa.t >= pa.dur) this.patches.splice(i, 1);
    }
  }

  // ── stats με catalyst bonuses (single source: DEFS) ─────────────────────────
  _catalystSum(key) {
    let s = 0;
    for (const [pid, lvl] of this.passives) {
      const p = PASSIVE_DEFS[pid];
      if (!p || !p.bonuses) continue;                              // build passives (§26-50) δεν έχουν bonuses
      for (let i = 0; i < lvl; i++) s += (p.bonuses[i]?.[key] || 0);
    }
    return s;
  }
  _spitterStats(w) {
    if (w.evolved) {
      const e = EVOLUTION_RECIPES.be_marrow_reactor;
      return { dmg: e.damage * (1 + this._catalystSum('boneDmg')), cd: e.cooldown,
               amount: e.amount, pierce: e.pierce + this._catalystSum('bonePierce'),
               bossMult: e.bossMultiplier, crit: 0.06, critMult: 1.6, charge: e.charge };
    }
    const d = WEAPON_DEFS.marrow_spitter, i = Math.min(w.level - 1, 4);
    return { dmg: d.damage[i] * (1 + this._catalystSum('boneDmg')), cd: d.cooldown[i],
             amount: d.amount[i], pierce: d.pierce[i] + this._catalystSum('bonePierce'),
             bossMult: d.bossMultiplier, crit: d.critChance, critMult: d.critMult,
             splinter: d.splinter, charge: null };
  }
  _cantorStats(w) {
    if (w.evolved) {
      const e = EVOLUTION_RECIPES.be_revenant_choir;
      return { amount: e.amount, tick: e.tickRate * (1 - this._catalystSum('tickRate')),
               dmg: e.pulseDmg, radius: e.pulseRadius * (1 + this._catalystSum('pulseRadius')),
               bossMult: e.bossMultiplier, blade: e.blade, crit: 0.05, critMult: 1.5 };
    }
    const d = WEAPON_DEFS.grave_cantor, i = Math.min(w.level - 1, 4);
    return { amount: d.amount[i], tick: d.tickRate[i] * (1 - this._catalystSum('tickRate')),
             dmg: d.damage[i], radius: d.pulseRadius[i] * (1 + this._catalystSum('pulseRadius')),
             bossMult: d.bossMultiplier, blade: null, crit: d.critChance, critMult: d.critMult,
             stagger: d.stagger };
  }

  // ── acquisition (τα cards καλούν αυτά) ──────────────────────────────────────
  addWeapon(id) {
    const w = this.weapons.get(id);
    if (w) { w.level = Math.min(5, w.level + 1); return; }
    if (this.weapons.size >= this.CAPS.weapons) return;            // P2.7: 6W cap
    if (this._familyCount(this._familyOf(id)) >= this.CAPS.perFamily) return;   // family limit
    // Maria unified brief 2026-07-18 §6: INDEPENDENT WEAPON CLOCKS. Each weapon enters
    // the build on its own deterministic phase offset (0.35s, 0.62s, 0.89s, ...) so a
    // fresh pickup NEVER fires in the same frame as the rest of the arsenal, and the
    // build's rhythm stays interleaved instead of volleying. Existing cooldowns are
    // deliberately NOT touched when a weapon is added.
    this.weapons.set(id, { id, level: 1, evolved: false,
                           cd: 0.35 + (this.weapons.size % 6) * 0.27,
                           volley: 0, burstQ: [], charge: 0, skulls: [], bladeT: 0 });
  }
  // Seed a character's native FULL Build-Engine weapon as their starter — used for
  // characters with NO legacy base weapon (e.g. Dimi Kickboxer → Cyber-Gauntlets
  // Injection). Picks the first non-external owned weapon that has a real executor
  // and registers exactly one. Returns the weapon id, or null if none exists.
  seedNativeStarter(charId) {
    if (!charId) return null;
    for (const id in WEAPON_DEFS) {
      const d = WEAPON_DEFS[id];
      if (d && d.owner === charId && d.category === 'weapon' && !d.external && WEAPON_EXECUTORS[id]) {
        if (!this.weapons.has(id)) this.addWeapon(id);
        return id;
      }
    }
    return null;
  }
  addPassive(id) {
    const p = PASSIVE_DEFS[id];
    if (!this.passives.has(id) && this.passives.size >= this.CAPS.passives) return;   // P2.7: 6P cap
    this.passives.set(id, Math.min(p?.maxLevel || 3, (this.passives.get(id) || 0) + 1));
  }
  _evolve(weaponId) {
    const ready = this._readyEvolutions().find(entry => entry.recipe.weapon === weaponId);
    if (!ready) return false;
    let w = this.weapons.get(weaponId);
    if (!w && WEAPON_DEFS[weaponId]?.external) { this.addWeapon(weaponId); w = this.weapons.get(weaponId); }
    if (!w) return false;
    w.evolved = true; w.level = 5; w.charge = 0;
    if (WEAPON_DEFS[weaponId]?.external) this.game?._consumedWeapons?.add?.(weaponId);
    let name = weaponId;
    for (const r of Object.values(EVOLUTION_RECIPES)) if (r.weapon === weaponId) { name = r.name; break; }
    this.evolutionEvents.push({
      eid: ready.eid,
      weapon: weaponId,
      timeAlive: Number(this.game?.timeAlive || 0),
    });
    this.game.triggerAnnouncement?.('◈ EVOLUTION — ' + name.toUpperCase() + ' ◈', CARD_COLOR.evolution);
    try {   // P2.8: NULL ARSENAL discovery — ξεκλειδώνει το silhouette στο EVOLUTIONS tab
      const dk = 'phenix_be_discovered';
      const dset = new Set(JSON.parse(localStorage.getItem(dk) || '[]'));
      for (const [eid2, r2] of Object.entries(EVOLUTION_RECIPES)) if (r2.weapon === weaponId) dset.add(eid2);
      localStorage.setItem(dk, JSON.stringify([...dset]));
    } catch (_) {}
    return true;
  }
  _readyEvolutions() {
    const ready = [];
    for (const [eid, r] of Object.entries(EVOLUTION_RECIPES)) {
      const wd = WEAPON_DEFS[r.weapon];
      if (wd?.owner && wd.owner !== this.game.selectedCharacter) continue;   // native evolutions ΜΟΝΟ στον ιδιοκτήτη
      const w = this.weapons.get(r.weapon);
      if (w?.evolved) continue;
      // external data-wrap (π.χ. Solo Red Thunder): το level ζει στο παλιό σύστημα μέχρι το P2.7
      const wl = w ? w.level : (wd?.external ? (this.game._weaponLevels?.get(r.weapon) || 0) : 0);
      if (wl >= r.weaponLevel && (this.passives.get(r.passive) || 0) >= r.passiveLevel)
        ready.push({ eid, recipe: r });
    }
    return ready;
  }
  _evolutionReady() {
    return this._readyEvolutions()[0] || null;
  }

  // ── LEVEL-UP CARDS (§ weighting: native x3 owner, catalyst x3 από weapon Lv3,
  //    evolution guaranteed όταν έτοιμο). Επιστρέφει true αν έβαλε κάρτα. ────────
  injectCards(choices) {
    if (!choices || choices.length === 0) return false;
    const self = this, g = this.game;
    const mk = (key, name, desc, color, badge, applyFn) => ({
      key, name, description: desc, iconColor: color, icon: badge, rarity: 'rare',
      maxLevel: 9, synergy: true, char: null,
      apply() { applyFn(); }, canApply() { return true; },
    });

    // 1) Evolution: ΕΓΓΥΗΜΕΝΗ κάρτα όταν recipe έτοιμο (προτεραιότητα, όπως το υπάρχον σύστημα)
    const ready = this._evolutionReady();
    if (ready) {
      const r = ready.recipe;
      choices[choices.length - 1] = mk('be_evo_' + ready.eid, r.name,
        r.desc + '  [EVOLUTION]', CARD_COLOR.evolution, '☠', () => self._evolve(r.weapon));
      return true;
    }

    // 2) Weighted pool: όπλα (νέα/level-up) + catalysts.
    // P2.8: κάθε κάρτα δείχνει badges (NEW/NATIVE/EVOLUTION READY/REQUIRES) + delta
    // SINGLE-TARGET DPS (τρέχον -> επόμενο) — όλα από το ίδιο data source (§13).
    // P4B recipe convergence: εντόπισε το «lead recipe» = το owned, μη-evolved BE όπλο με catalyst
    // που έχει τη μεγαλύτερη πρόοδο (weaponLevel×2 + catalystLevel). Ενισχύουμε τα ΥΠΟΛΟΙΠΑ
    // components του ώστε να «κλείνει» ό,τι ξεκίνησε ο παίκτης, και μειώνουμε τα ΝΕΑ όπλα όσο
    // ένα recipe είναι σε εξέλιξη (dead-offer protection). ΟΧΙ pre-forced build (ο παίκτης διάλεξε
    // το όπλο), ΟΧΙ auto-max (κάθε κάρτα την επιλέγει), variety: 2 legacy slots + early acquisition.
    if (!this._catalystMap) { this._catalystMap = {}; for (const [_pid, _p] of Object.entries(PASSIVE_DEFS)) if (_p.category === 'evolution_passive' && _p.forWeapon) this._catalystMap[_p.forWeapon] = _pid; }
    let leadW = null, leadP = null, leadScore = -1;
    for (const [_wid, _w] of this.weapons) {
      if (_w.evolved) continue;
      const _cp = this._catalystMap[_wid];
      if (!_cp) continue;
      const _score = (_w.level || 0) * 2 + (this.passives.get(_cp) || 0);
      if (_score > leadScore) { leadScore = _score; leadW = _wid; leadP = _cp; }
    }
    const _midRecipe = leadScore >= 6;   // επένδυση ≥ όπλο L3 → σταμάτα να σπρώχνεις νέα όπλα
    const cand = [];
    const _wFull = this.weapons.size >= this.CAPS.weapons;
    const _pFull = this.passives.size >= this.CAPS.passives;
    for (const [wid, d] of Object.entries(WEAPON_DEFS)) {
      if (d.external) continue;                     // data-wrap παλιού συστήματος — δεν προσφέρεται ως κάρτα
      const w = this.weapons.get(wid);
      if (!w && _wFull) continue;                                  // P2.7: 6W cap — μόνο level-ups
      if (!w && this.banished.has(this._familyOf(wid))) continue;  // P2.7: banished family
      if (!w && this._familyCount(this._familyOf(wid)) >= this.CAPS.perFamily) continue;
      if (w && (w.level >= 5 || w.evolved)) continue;
      // P4B (mastery convergence + signature path): τα owned όπλα κερδίζουν βάρος με το invested
      // level (snowball προς L5 αντί για flood νέων L1)· ο ιδιοκτήτης έχει 2 native όπλα — τα
      // ενισχύουμε (×5) ώστε ο χαρακτήρας να φτάνει το signature recipe του. Τα νέα παραμένουν
      // αποκτήσιμα (variety) + 2/3 slots legacy. ΟΧΙ forcing (sampled), ΟΧΙ auto-max.
      let wt = (w ? (3 + w.level * 3) : 3) * (d.owner === g.selectedCharacter ? 5 : 1);
      if (wid === leadW) {
        const _leadCatalystLevel = this.passives.get(leadP) || 0;
        // Build the two recipe halves together instead of letting the native-weapon weight
        // starve its catalyst after weapon L3.
        wt *= (w.level >= 3 && _leadCatalystLevel < 3) ? 1.25 : 4;
      } else if (!w && _midRecipe) wt *= 0.10;
      const _badges = (w ? '' : '[NEW] ') + (d.owner === g.selectedCharacter ? '[NATIVE] ' : '');
      const _cur = w ? singleTargetDps(d, w.level) : 0;
      const _nxt = singleTargetDps(d, (w?.level || 0) + 1);
      const _delta = w ? '  [ST-DPS ' + _cur + ' → ' + _nxt + ']' : '  [ST-DPS ' + _nxt + ']';
      cand.push({ wt, card: mk('be_w_' + wid, d.name,
        _badges + (w ? 'Lv' + w.level + ' → Lv' + (w.level + 1) + ' — ' : '') + d.desc + _delta,
        CARD_COLOR.weapon, '❖', () => self.addWeapon(wid)) });
    }
    for (const [pid, p] of Object.entries(PASSIVE_DEFS)) {
      if (p.category === 'build_passive') {                        // P2.6: global build passives
        const bl = this.passives.get(pid) || 0;
        if (bl >= p.maxLevel) continue;
        if (this.sealed.has(pid)) continue;                        // P2.7: sealed
        if (!bl && _pFull) continue;                               // P2.7: 6P cap — μόνο level-ups
        cand.push({ wt: 1, card: mk('be_p_' + pid, p.name,
          (bl ? 'Level ' + (bl + 1) + ' — ' : '') + p.desc, CARD_COLOR.passive, '◆',
          () => self.addPassive(pid)) });
        continue;
      }
      const w = this.weapons.get(p.forWeapon);
      const fd = WEAPON_DEFS[p.forWeapon];
      const extLvl = (!w && fd?.external) ? (g._weaponLevels?.get(p.forWeapon) || 0) : 0;
      if ((!w && extLvl < 1) || w?.evolved) continue;           // catalyst μόνο αν υπάρχει το όπλο (ή external με level)
      const lvl = this.passives.get(pid) || 0;
      if (lvl >= p.maxLevel) continue;
      if (this.sealed.has(pid)) continue;                        // P2.7: sealed
      if (!lvl && _pFull) continue;                              // P2.7: 6P cap — μόνο level-ups
      // P4B: catalyst διαθέσιμο από weapon L1· βάρος κλιμακώνει με το weapon investment ώστε
      // να μπορεί να χτίσει προς L3 μαζί με το όπλο. Όταν κλείνει το recipe ΤΩΡΑ (όπλο L5 +
      // catalyst ένα βήμα πριν το max), ισχυρό nudge — ΟΧΙ absolute (sampled ενάντια στο pool).
      const _wl = w ? w.level : extLvl;
      const _evoReady = (_wl >= 5 && lvl + 1 >= p.maxLevel);
      // P4B recipe convergence: το βάρος του catalyst ανεβαίνει με το weapon investment·
      // όταν το όπλο φτάσει L5 (μισό recipe) οδηγούμε δυνατά τον catalyst προς L3, και
      // σχεδόν-εγγυημένα στο βήμα που ΚΛΕΙΝΕΙ το recipe. Sampled ενάντια στο pool — ΟΧΙ absolute.
      let wt = _wl >= 5 ? 24 : _wl >= 4 ? 10 : _wl >= 3 ? 4 : 1;
      if (_evoReady) wt = 40;                                   // όπλο L5 + catalyst ένα βήμα πριν το max
      if (pid === leadP) {
        wt *= 8;
        if (lvl < Math.min(3, Math.max(0, _wl - 1))) wt *= 2;
      }
      const _req = _evoReady ? '[EVOLUTION READY] ' : ('[REQUIRES: weapon Lv5 (' + _wl + '/5) + Lv' + p.maxLevel + ' (' + (lvl + 1) + '/' + p.maxLevel + ')] ');
      cand.push({ wt, card: mk('be_p_' + pid, p.name,
        _req + (lvl ? 'Lv' + lvl + ' → Lv' + (lvl + 1) + ' — ' : '') + p.desc, CARD_COLOR.passive, '◈',
        () => self.addPassive(pid)) });
    }
    if (!cand.length) return false;
    // The BE card is the focused recipe path chosen by the player. Card pacing already skips
    // every second level after level 6, so dropping more BE offers here can make an otherwise
    // focused Act 1 build mathematically unable to finish its 5+3 recipe.
    this._offers = (this._offers || 0) + 1;
    // When no BE build exists yet, reserve this one BE slot for a native starter. It is still
    // a visible player choice and the other two sampled cards remain untouched.
    const _nativeStart = !leadW
      ? cand.filter(c => {
          const key = String(c.card?.key || '');
          return key.startsWith('be_w_') && WEAPON_DEFS[key.slice(5)]?.owner === g.selectedCharacter;
        })
      : [];
    const _leadRecipe = leadW
      ? cand.filter(c => {
          const key = String(c.card?.key || '');
          return key === 'be_w_' + leadW || key === 'be_p_' + leadP;
        })
      : [];
    const _nonLead = _leadRecipe.length
      ? cand.filter(c => {
          const key = String(c.card?.key || '');
          return key !== 'be_w_' + leadW && key !== 'be_p_' + leadP;
        })
      : [];
    // Every fifth offer also exposes a second BE path. It replaces one legacy card instead of the
    // focused recipe card, so variety stays visible without deleting required recipe progress.
    const _varietyOffer = _nonLead.length && this._offers % 5 === 0;
    const pickWeighted = pool => {
      let sum = 0;
      for (const c of pool) sum += c.wt;
      let roll = Math.random() * sum;
      let pick = pool[0];
      for (const c of pool) {
        roll -= c.wt;
        if (roll <= 0) { pick = c; break; }
      }
      return pick.card;
    };
    const _focusPool = _nativeStart.length ? _nativeStart : (_leadRecipe.length ? _leadRecipe : cand);
    choices[choices.length - 1] = pickWeighted(_focusPool);
    if (_varietyOffer && choices.length > 1) choices[choices.length - 2] = pickWeighted(_nonLead);
    return true;
  }

  // ── damage chokepoint: boss caps + bossMultiplier + crits + DamageLog ────────
  _dealDamage(weaponId, e, raw, bossMult, crit) {
    const g = this.game;
    if (!e || e.hp <= 0) return false;
    let dmg = raw * (crit ? (weaponId === 'grave_cantor' || weaponId === 'be_revenant_choir' ? 1.5 : 1.6) : 1);
    const _est = this._status.get(e);
    if (_est?.sanction) dmg *= 1 + 0.12 + (this._catalystSum('markBonus') || 0);   // Dimi Sanction Mark (P2.4a)
    if (_est?.shred) dmg *= 1.15;                                  // Grey-Goo nanite shred / Armor Fracture
    const _depth = this._hookDepth || 0;
    const _tags = (WEAPON_DEFS[weaponId] || EVOLUTION_RECIPES[weaponId])?.tags || [];
    if (_depth === 0)                                              // P2.6 modDamage (ΠΡΙΝ τα boss caps) — armored
      for (const h of RUNTIME_HOOKS.modDamage) { try { const m = h(this, e, weaponId, _tags, dmg); if (m > 0) dmg *= m; } catch (_e) {} }
    const boss = (e.isBoss?.() || e.isMegaBoss);
    if (boss) dmg = g._capBossDamage(e, dmg * bossMult);
    e.takeHit(dmg, g);
    const kill = e.hp <= 0;
    this.log.hit(weaponId, dmg, { crit, kill });
    if (_depth === 0) {                                            // P2.6 events (depth guard: όχι σε echoes)
      this._hookDepth = 1;
      try {
        for (const h of RUNTIME_HOOKS.onDamage) { try { h(this, e, weaponId, _tags, dmg, crit, kill); } catch (_e) {} }
        if (kill) for (const h of RUNTIME_HOOKS.onKill) { try { h(this, e, weaponId, _tags, dmg); } catch (_e) {} }
      } finally { this._hookDepth = 0; }
    }
    return true;
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────────
  update(dt) {
    const g = this.game;
    if (!g.player) return;
    this._t += dt;
    for (const w of this.weapons.values()) {
      try {                                                        // armor: ανά όπλο
        const ex = WEAPON_EXECUTORS[w.id];
        if (ex) ex.update(this, w, dt);
        else if (w.id === 'marrow_spitter') this._updateSpitter(w, dt);
        else if (w.id === 'grave_cantor') this._updateCantor(w, dt);
      } catch (e) { if ((w._errs = (w._errs || 0) + 1) <= 2) console.error('[P2] weapon "' + w.id + '" update error', e); }
    }
    try { this._tickStatus(dt); } catch (e) { console.error('[P2] status tick error', e); }
    this._hookDepth = 0;
    for (const h of RUNTIME_HOOKS.tick) {                          // armor: ανά passive tick
      try { h(this, dt); } catch (e) { if ((this._tickErrs = (this._tickErrs || 0) + 1) <= 2) console.error('[P2] passive tick error', e); }
    }
    this._updateShards(dt);
    this._updateNovas(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) { this.fx[i].t += dt; if (this.fx[i].t >= this.fx[i].life) this.fx.splice(i, 1); }
  }

  _nearestEnemy(x, y, maxDist = 900) {
    let best = null, bd = maxDist * maxDist;
    for (const e of this.game.enemies) {
      if (!e || e.hp <= 0) continue;
      const dx = e.pos.x - x, dy = e.pos.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _updateSpitter(w, dt) {
    const g = this.game, p = g.player, s = this._spitterStats(w);
    // burst queue: πυροβολεί amount βλήματα με burstGap απόσταση
    for (let i = w.burstQ.length - 1; i >= 0; i--) {
      w.burstQ[i] -= dt;
      if (w.burstQ[i] <= 0) {
        w.burstQ.splice(i, 1);
        const tgt = this._nearestEnemy(p.pos.x, p.pos.y);
        if (tgt && this.shards.length < WEAPON_DEFS.marrow_spitter.maxActive) {
          const dx = tgt.pos.x - p.pos.x, dy = tgt.pos.y - p.pos.y, L = Math.hypot(dx, dy) || 1;
          const j = (Math.random() - 0.5) * 0.10;                 // ελαφρύ spread
          const a = Math.atan2(dy, dx) + j;
          this.shards.push({ wid: w.evolved ? 'be_marrow_reactor' : 'marrow_spitter',
            x: p.pos.x, y: p.pos.y, vx: Math.cos(a) * WEAPON_DEFS.marrow_spitter.speed,
            vy: Math.sin(a) * WEAPON_DEFS.marrow_spitter.speed, a, dmg: s.dmg,
            pierce: s.pierce, hit: new Set(), life: 1.6, t: 0, w,
            splinterVolley: w._splinterNow, splinterChild: false, evolved: w.evolved });
        }
      }
    }
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd = s.cd;
      w.volley++;
      w._splinterNow = !w.evolved && s.splinter && (w.volley % s.splinter.every === 0);
      for (let k = 0; k < s.amount; k++) w.burstQ.push(k * WEAPON_DEFS.marrow_spitter.burstGap);
    }
  }

  _updateShards(dt) {
    const g = this.game;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      sh.t += dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      if (sh.t >= sh.life) { this.shards.splice(i, 1); continue; }
      const near = g._spatialGrid ? g._spatialGrid.query(sh.x, sh.y, 70) : g.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || sh.hit.has(e)) continue;
        const dx = e.pos.x - sh.x, dy = e.pos.y - sh.y;
        if (dx * dx + dy * dy > (10 + e.radius) * (10 + e.radius)) continue;
        sh.hit.add(e);
        const st = this._spitterStats(sh.w);
        const crit = Math.random() < st.crit;
        this._dealDamage(sh.wid, e, sh.dmg, st.bossMult, crit);
        g.particles?.spawnHitSparks?.(e.pos, '#e8e4d0');
        // splinters: η 3η ριπή σπάει σε κώνο θραυσμάτων στο πρώτο χτύπημα
        if (sh.splinterVolley && !sh.splinterChild) {
          const sp = WEAPON_DEFS.marrow_spitter.splinter;
          for (let k = 0; k < sp.count; k++) {
            if (this.shards.length >= WEAPON_DEFS.marrow_spitter.maxActive) break;
            const a = sh.a + (k - (sp.count - 1) / 2) * sp.spread;
            this.shards.push({ wid: sh.wid, x: sh.x, y: sh.y,
              vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, a, dmg: sh.dmg * sp.dmgMult,
              pierce: 0, hit: new Set([e]), life: 0.5, t: 0, w: sh.w,
              splinterVolley: false, splinterChild: true, evolved: sh.evolved });
          }
        }
        // Marrow Reactor: charge ανά χτύπημα -> nova στο γέμισμα
        if (sh.evolved) {
          const ch = EVOLUTION_RECIPES.be_marrow_reactor.charge;
          sh.w.charge += ch.perHit;
          if (sh.w.charge >= ch.full && this.novas.length < NOVA_CAP) {
            sh.w.charge = 0;
            this.novas.push({ x: sh.x, y: sh.y, r: 12, t: 0, hit: new Set() });
          }
        }
        if (sh.pierce > 0) { sh.pierce--; } else { this.shards.splice(i, 1); break; }
      }
    }
  }

  _updateNovas(dt) {
    const g = this.game, ch = EVOLUTION_RECIPES.be_marrow_reactor.charge;
    for (let i = this.novas.length - 1; i >= 0; i--) {
      const n = this.novas[i];
      n.t += dt; n.r = 12 + (ch.novaRadius - 12) * Math.min(1, n.t / 0.45);
      const near = g._spatialGrid ? g._spatialGrid.query(n.x, n.y, n.r + 80) : g.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || n.hit.has(e)) continue;
        const d = Math.hypot(e.pos.x - n.x, e.pos.y - n.y);
        if (Math.abs(d - n.r) < 34 + e.radius) {                  // το δαχτυλίδι χτυπά στη διέλευση
          n.hit.add(e);
          this._dealDamage('be_marrow_reactor', e, ch.novaDmg, ch.bossMultiplier, false);
          g.particles?.spawnHitSparks?.(e.pos, '#ffffff');
        }
      }
      if (n.t >= 0.55) this.novas.splice(i, 1);
    }
  }

  _updateCantor(w, dt) {
    const g = this.game, p = g.player, s = this._cantorStats(w);
    const def = WEAPON_DEFS.grave_cantor;
    // συγχρονισμός πλήθους κρανίων (maxActive cap· evolution: 6)
    const want = Math.min(s.amount, w.evolved ? EVOLUTION_RECIPES.be_revenant_choir.maxActive : def.maxActive);
    while (w.skulls.length < want) w.skulls.push({ ph: 0, pulseT: Math.random() * s.tick, x: 0, y: 0 });
    while (w.skulls.length > want) w.skulls.pop();
    const n = w.skulls.length;
    w.orbA = (w.orbA || 0) + def.orbitSpeed * dt;                 // κοινή αργή τροχιά, ίση απόσταση φωνών
    for (let k = 0; k < n; k++) {
      const sk = w.skulls[k];
      sk.ph = w.orbA + (k * Math.PI * 2) / n;
      sk.x = p.pos.x + Math.cos(sk.ph) * def.orbitRadius;
      sk.y = p.pos.y + Math.sin(sk.ph) * def.orbitRadius;
      sk.pulseT -= dt;
      if (sk.pulseT <= 0) {
        sk.pulseT = s.tick;
        if (this.fx.length < FX_CAP) this.fx.push({ kind: 'pulse', x: sk.x, y: sk.y, r: s.radius, t: 0, life: 0.35 });
        const near = g._spatialGrid ? g._spatialGrid.query(sk.x, sk.y, s.radius + 60) : g.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          if (Math.hypot(e.pos.x - sk.x, e.pos.y - sk.y) > s.radius + e.radius) continue;
          const crit = Math.random() < s.crit;
          this._dealDamage(w.evolved ? 'be_revenant_choir' : 'grave_cantor', e, s.dmg, s.bossMult, crit);
          // micro-stagger (όχι bosses)
          if (!e.isBoss?.() && !e.isMegaBoss) {
            e.slowTimer  = Math.max(e.slowTimer || 0, def.stagger);
            e.slowFactor = 0.08;
          }
        }
      }
    }
    // Revenant Choir: ηχητικές λεπίδες μεταξύ γειτονικών κρανίων
    if (w.evolved && n >= 2) {
      const bl = EVOLUTION_RECIPES.be_revenant_choir.blade;
      w.bladeT -= dt;
      if (w.bladeT <= 0) {
        w.bladeT = bl.tick;
        for (let k = 0; k < n; k++) {
          const a = w.skulls[k], b = w.skulls[(k + 1) % n];
          const near = g._spatialGrid ? g._spatialGrid.query((a.x + b.x) / 2, (a.y + b.y) / 2, def.orbitRadius + 60) : g.enemies;
          for (const e of near) {
            if (!e || e.hp <= 0) continue;
            // απόσταση σημείου-ευθύγραμμου τμήματος
            const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
            let t = ((e.pos.x - a.x) * dx + (e.pos.y - a.y) * dy) / L2;
            t = Math.max(0, Math.min(1, t));
            const px = a.x + t * dx - e.pos.x, py = a.y + t * dy - e.pos.y;
            if (px * px + py * py < (bl.width + e.radius) * (bl.width + e.radius))
              this._dealDamage('be_revenant_choir', e, bl.dmg, EVOLUTION_RECIPES.be_revenant_choir.bossMultiplier, false);
          }
        }
      }
    }
  }

  // ── DRAW — συνταγή ultimates: halo -> σώμα -> λευκός πυρήνας, lighter, φάσεις,
  //    transform armor με try/finally, μηδέν shadowBlur. ────────────────────────
  draw(ctx) {
    const tf = ctx.getTransform();
    try {
      // bone shards — ULTIMATE PASS: ghost trail + οστικό tumble + διπλοκόνδυλη σιλουέτα
      for (const sh of this.shards) {
        const sc = sh.splinterChild ? 0.55 : 1;
        const tumble = Math.sin(this._t * 11 + sh.x * 0.013 + sh.y * 0.007) * 0.24;
        // ghost trail: 3 φαντάσματα πίσω στην τροχιά (χωρίς state — από την ταχύτητα)
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let gh = 3; gh >= 1; gh--) {
          const gx = sh.x - sh.vx * 0.016 * gh, gy = sh.y - sh.vy * 0.016 * gh;
          ctx.globalAlpha = 0.10 * (4 - gh) / 3;
          ctx.fillStyle = sh.evolved ? '#ffb46b' : '#9fdcff';
          ctx.beginPath(); ctx.ellipse(gx, gy, 9 * sc, 3.5 * sc, sh.a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        ctx.save();
        ctx.translate(sh.x, sh.y); ctx.rotate(sh.a + tumble);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = sh.evolved ? 0.34 + 0.10 * Math.sin(this._t * 18) : 0.28;   // halo (heat flicker στο evolved)
        ctx.fillStyle = sh.evolved ? '#ffd9a8' : '#cfe8ff';
        ctx.beginPath(); ctx.ellipse(0, 0, 17 * sc, 6.5 * sc, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;                                       // σώμα: κνήμη-βέλος με κονδύλους
        ctx.fillStyle = '#e8e4d0';
        ctx.beginPath();
        ctx.moveTo(12 * sc, 0); ctx.lineTo(-4 * sc, 2.2 * sc);
        ctx.lineTo(-7 * sc, 1.4 * sc); ctx.lineTo(-7 * sc, -1.4 * sc);
        ctx.lineTo(-4 * sc, -2.2 * sc); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(-7.5 * sc, 2.1 * sc, 2 * sc, 0, Math.PI * 2);        // επίφυση (διπλός κόνδυλος)
        ctx.arc(-7.5 * sc, -2.1 * sc, 2 * sc, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(90,80,60,0.55)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = sh.splinterVolley ? 1 : 0.9;             // λευκός πυρήνας (η 3η ριπή καίει πιο άσπρη)
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = sh.splinterVolley ? 1.8 : 1.2;
        ctx.beginPath(); ctx.moveTo(10 * sc, 0); ctx.lineTo(-3 * sc, 0); ctx.stroke();
        if (sh.evolved) {                                          // Marrow Reactor: στάζει πυρωμένο μεδούλι
          ctx.globalAlpha = 0.6; ctx.fillStyle = '#ff9b3c';
          ctx.beginPath(); ctx.arc(-9 * sc, Math.sin(this._t * 14 + sh.x) * 2, 1.3 * sc, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      // Marrow Reactor: τόξο φόρτισης γύρω από τον παίκτη (charge/24 -> nova)
      for (const w of this.weapons.values()) {
        if (w.id !== 'marrow_spitter' || !w.evolved) continue;
        const p = this.game.player, full = EVOLUTION_RECIPES.be_marrow_reactor.charge.full;
        const k = Math.min(1, (w.charge || 0) / full);
        if (k <= 0.02 || !p) continue;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.22 + 0.10 * k;
        ctx.strokeStyle = '#ffd9a8'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, 30, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.7 * k;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, 30, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // novas (Marrow Reactor): δαχτυλίδι οστών + λευκή νεκροπλασματική ακμή
      for (const n of this.novas) {
        const k = Math.min(1, n.t / 0.45), fade = 1 - Math.max(0, (n.t - 0.35) / 0.2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.30 * fade;
        ctx.strokeStyle = '#ffd9a8'; ctx.lineWidth = 26 * (1 - k * 0.5);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.85 * fade;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.30 * fade;                             // 2ο κλιμακωτό δαχτυλίδι (νεκροπλασματική ηχώ)
        ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 0.72, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.8 * fade;                              // θραύσματα οστών στην ακμή
        ctx.fillStyle = '#e8e4d0';
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + n.t * 2.2;
          ctx.save(); ctx.translate(n.x + Math.cos(a) * n.r, n.y + Math.sin(a) * n.r); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, 2.4); ctx.lineTo(-4, -2.4); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 0.45 * fade;                             // καμένα υπολείμματα που ανεβαίνουν
        ctx.fillStyle = '#ffd9a8';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + n.t * 1.1;
          ctx.beginPath(); ctx.arc(n.x + Math.cos(a) * n.r * 0.5, n.y + Math.sin(a) * n.r * 0.5 - n.t * 40, 1.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      // skulls + pulses + blades
      for (const w of this.weapons.values()) {
        if (w.id !== 'grave_cantor') continue;
        const n = w.skulls.length;
        if (w.evolved && n >= 2) {                                 // ηχητικές λεπίδες
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < n; k++) {
            const a = w.skulls[k], b = w.skulls[(k + 1) % n];
            const mx = (a.x + b.x) / 2 + Math.sin(this._t * 6 + k) * 8;
            const my = (a.y + b.y) / 2 + Math.cos(this._t * 6 + k) * 8;
            ctx.globalAlpha = 0.30; ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 7;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
            ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
          }
          ctx.restore();
        }
        for (const sk of w.skulls) this._drawSkull(ctx, sk, w.evolved);
      }
      // P2.3+ executors: κάθε όπλο ζωγραφίζει τα δικά του (armored — ένα σπασμένο δεν ρίχνει τα άλλα)
      for (const w of this.weapons.values()) {
        try { WEAPON_EXECUTORS[w.id]?.draw?.(this, ctx, w); }
        catch (e) { if ((w._drawErrs = (w._drawErrs || 0) + 1) <= 2) console.error('[P2] weapon "' + w.id + '" draw error', e); }
      }
      // burn patches (λιωμένο μέταλλο / μάγμα)
      for (const pa of this.patches) {
        const fade = 1 - pa.t / pa.dur;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.16 * fade; ctx.fillStyle = pa.col;
        ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = pa.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.radius * (0.7 + 0.3 * Math.sin(this._t * 5)), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // transient fx (pulse / shockring / spark / windcut)
      for (const f of this.fx) {
        const k = f.t / f.life;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (f.kind === 'pulse') {
          for (let rp = 0; rp < 3; rp++) {                         // τριπλός ηχητικός κυματισμός
            const rk = Math.max(0, k - rp * 0.14);
            if (rk <= 0) continue;
            ctx.globalAlpha = (rp === 0 ? 0.5 : 0.25) * (1 - k);
            ctx.strokeStyle = rp === 0 ? '#9fdcff' : '#6fb8de'; ctx.lineWidth = 3 - 2 * rk;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.25 + 0.75 * rk), 0, Math.PI * 2); ctx.stroke();
          }
          ctx.globalAlpha = 0.9 * (1 - k);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.25 + 0.75 * k) - 4, 0, Math.PI * 2); ctx.stroke();
          // η νότα της φωνής: ανεβαίνει και σβήνει
          const ny = f.y - 14 - k * 26, nx = f.x + Math.sin(k * 9) * 4;
          ctx.globalAlpha = 0.85 * (1 - k);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(nx, ny, 2.4, 1.8, -0.4, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(nx + 2.2, ny - 0.8); ctx.lineTo(nx + 2.2, ny - 9);
          ctx.quadraticCurveTo(nx + 6, ny - 8, nx + 6.5, ny - 4.5); ctx.stroke();
        } else if (f.kind === 'shockring') {
          ctx.globalAlpha = 0.45 * (1 - k);
          ctx.strokeStyle = f.col || '#FF9B3C'; ctx.lineWidth = 4 - 3 * k;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 0.8 * (1 - k);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * k) - 3, 0, Math.PI * 2); ctx.stroke();
        } else if (f.kind === 'spark') {
          ctx.globalAlpha = 0.85 * (1 - k);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
          for (let q = 0; q < 4; q++) { const qa = q * Math.PI / 2 + k * 2;
            ctx.beginPath(); ctx.moveTo(f.x + Math.cos(qa) * 3, f.y + Math.sin(qa) * 3);
            ctx.lineTo(f.x + Math.cos(qa) * (f.r * (0.5 + k)), f.y + Math.sin(qa) * (f.r * (0.5 + k))); ctx.stroke(); }
        } else if (f.kind === 'windcut') {
          ctx.globalAlpha = 0.35 * (1 - k);
          ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 6 - 4 * k;
          ctx.beginPath(); ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + Math.cos(f.a) * f.len * (0.4 + 0.6 * k), f.y + Math.sin(f.a) * f.len * (0.4 + 0.6 * k)); ctx.stroke();
          ctx.globalAlpha = 0.9 * (1 - k);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + Math.cos(f.a) * f.len * (0.4 + 0.6 * k), f.y + Math.sin(f.a) * f.len * (0.4 + 0.6 * k)); ctx.stroke();
        }
        ctx.restore();
      }
    } finally {
      ctx.setTransform(tf);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ═══ P2.8 — SCREEN-SPACE PANELS (καλείται μετά τα end screens/pause στο Game.draw).
  // Ύφος §9: 70% matte σκούρο / 20% λευκή πληροφορία / 10% neon accent, όχι glow.
  drawPanels(ctx, game) {
    try {
      if (game.gameOver || game.victory) { this._drawDamageReport(ctx); return; }
      if (game.paused && game.gameState === 'playing' && !game.upgradeUI && !game.mutationUI && !game._stageCompleteBanner)
        this._drawBuildPanel(ctx);
    } catch (_) { /* UI panel δεν ρίχνει ΠΟΤΕ το frame */ }
  }
  _panelBox(ctx, x, y, w, h, title, accent) {
    ctx.fillStyle = 'rgba(8,12,18,0.86)'; ctx.fillRect(x, y, w, h);            // matte
    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.globalAlpha = 1;
    ctx.fillStyle = accent; ctx.fillRect(x, y, w, 22); ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0e14'; ctx.font = 'bold 12px Consolas, monospace'; ctx.textAlign = 'left';
    ctx.fillText(title, x + 8, y + 15);
  }
  _drawBuildPanel(ctx) {
    const W = ctx.canvas.width, x = W - 336, y = 60, w = 320;
    const rows = this.log.report(performance.now());
    const share = id => { const r = rows.find(q => q.id === id || q.id === WEAPON_DEFS[id]?.evolution); return r ? r.share + '%' : '—'; };
    let lines = 0;
    const weapons = [...this.weapons.values()];
    const passives = [...this.passives.entries()];
    const nextEvos = [];
    for (const [eid, r] of Object.entries(EVOLUTION_RECIPES)) {
      const wp = this.weapons.get(r.weapon);
      if (!wp || wp.evolved) continue;
      const wd = WEAPON_DEFS[r.weapon];
      if (wd?.owner && wd.owner !== this.game.selectedCharacter) continue;
      nextEvos.push({ name: r.name, wl: wp.level, need: r.weaponLevel, pl: this.passives.get(r.passive) || 0, pn: r.passiveLevel });
    }
    const topStats = rows.slice(0, 5);
    const h = 66 + (weapons.length + passives.length + nextEvos.length + topStats.length) * 15 + 54;
    this._panelBox(ctx, x, y, w, Math.min(h, 560), 'CURRENT BUILD — NULL ARSENAL', '#4fd8ff');
    ctx.font = '11px Consolas, monospace'; ctx.textAlign = 'left';
    let ty = y + 38;
    ctx.fillStyle = '#e9ecf2'; ctx.fillText('WEAPONS ' + weapons.length + '/' + this.CAPS.weapons, x + 10, ty); ty += 15;
    for (const wp of weapons) {
      const nm = wp.evolved ? (EVOLUTION_RECIPES[WEAPON_DEFS[wp.id]?.evolution]?.name || wp.id) : (WEAPON_DEFS[wp.id]?.name || wp.id);
      ctx.fillStyle = wp.evolved ? '#ffd447' : '#ffffff';
      ctx.fillText((wp.evolved ? '★ ' : '· ') + nm + (wp.evolved ? '' : '  Lv' + wp.level), x + 14, ty);
      ctx.fillStyle = '#8fa8b8'; ctx.textAlign = 'right'; ctx.fillText(share(wp.id), x + w - 10, ty); ctx.textAlign = 'left';
      ty += 15;
    }
    ty += 4; ctx.fillStyle = '#4fd8ff'; ctx.fillText('PASSIVES ' + passives.length + '/' + this.CAPS.passives, x + 10, ty); ty += 15;
    for (const [pid, lv] of passives) {
      ctx.fillStyle = '#bfe8ff'; ctx.fillText('· ' + (PASSIVE_DEFS[pid]?.name || pid) + '  Lv' + lv, x + 14, ty); ty += 15;
    }
    if (nextEvos.length) {
      ty += 4; ctx.fillStyle = '#ffd447'; ctx.fillText('NEXT EVOLUTIONS', x + 10, ty); ty += 15;
      for (const ev of nextEvos) {
        const ready = ev.wl >= ev.need && ev.pl >= ev.pn;
        ctx.fillStyle = ready ? '#ffd447' : '#9a8d5c';
        ctx.fillText((ready ? '★ READY: ' : '· ') + ev.name + '  [W ' + ev.wl + '/' + ev.need + ' · P ' + ev.pl + '/' + ev.pn + ']', x + 14, ty);
        ty += 15;
      }
    }
    ty += 4; ctx.fillStyle = '#e9ecf2'; ctx.fillText('RUN STATISTICS (Actual Run DPS)', x + 10, ty); ty += 15;
    for (const r of topStats) {
      const nm = (WEAPON_DEFS[r.id] || EVOLUTION_RECIPES[r.id] || PASSIVE_DEFS[r.id.replace(/^bp_/, 'bp_')])?.name || r.id;
      ctx.fillStyle = '#cfd8e0';
      ctx.fillText('· ' + String(nm).slice(0, 22) + '  ' + r.avgDps + '/s  pk ' + r.peakDps, x + 14, ty); ty += 15;
    }
  }
  _drawDamageReport(ctx) {
    const rows = this.log.report(performance.now());
    if (!rows.length) return;
    // P2.9: μόνιμο telemetry — το report κάθε run σώζεται (ring buffer 20 runs).
    // Δες τα με: JSON.parse(localStorage.phenix_be_telemetry) στην κονσόλα.
    if (!this._telemetrySaved) {
      this._telemetrySaved = true;
      try {
        const tk = 'phenix_be_telemetry';
        const log = JSON.parse(localStorage.getItem(tk) || '[]');
        log.push({ t: Date.now(), char: this.game.selectedCharacter,
                   time: Math.round(this.game.timeAlive || 0),
                   endless: !!this.game.endless, chaos: !!this.game._chaosMode,
                   weapons: [...this.weapons.values()].map(w => w.id + (w.evolved ? '★' : ':L' + w.level)),
                   rows: rows.slice(0, 12) });
        while (log.length > 20) log.shift();
        localStorage.setItem(tk, JSON.stringify(log));
        console.log('[P2.9 telemetry] run saved —', rows.length, 'damage sources. WASTED PICK & shares στο localStorage.phenix_be_telemetry');
      } catch (_) {}
    }
    const W = ctx.canvas.width, H = ctx.canvas.height;
    // Maria 2026-07-16: το panel έπεφτε ΠΑΝΩ στα κουμπιά RETURN/CONTINUE των end screens
    // (κέντρο-κάτω) και μπλόκαρε τη συνέχεια σε Endless/Chaos. Μεταφέρθηκε ΠΑΝΩ-ΑΡΙΣΤΕΡΑ.
    // Maria 2026-07-18: πάνω-αριστερά προεξείχε από την άκρη του καμβά και σκέπαζε τον τίτλο
    // ENDLESS RECORDS. Πλέον παίρνει τη θέση του PERSONAL RECORDS (που αφαιρέθηκε): το HUD
    // δημοσιεύει τη γεωμετρία στο game._dmgReportSlot. Fallback στην παλιά θέση αν λείπει.
    const slot = this.game && this.game._dmgReportSlot;
    // 6 rows in the slot, not 8: at 8 the panel is 206px tall and the gap down to the
    // RETRY / UPGRADES / MAIN MENU buttons is ~200px, so it would clip them. 6 rows = 174px.
    const top = rows.slice(0, slot ? (slot.compact ? 5 : 6) : 8);   // compact side column keeps the panel short
    const h = 52 + top.length * 16 + 26;
    // LAYOUT (Maria UI audit 2026-07-19): the panel used to pin itself to x=16 — hard
    // against the left canvas edge — whenever no slot was published, and the victory
    // screen published a deliberately left-pinned x=24 while its title, credits and
    // unlock cards were centered. The end screen therefore read as lopsided.
    //
    // It is now centered on the viewport and sized relative to it, with a safe margin,
    // so it shares the same vertical axis as the rest of the end-screen content at every
    // resolution and aspect ratio. A publisher may still override x (the in-run HUD does,
    // to sit in the records column) — only the width and the safe margin are enforced.
    const SAFE = Math.max(16, Math.round(W * 0.02));
    const w = Math.min(slot ? slot.w : 560, W - SAFE * 2);
    const x = slot && slot.x != null && slot.centered !== true
      ? Math.min(Math.max(slot.x, SAFE), W - w - SAFE)      // publisher position, kept on-screen
      : Math.round((W - w) / 2);                            // default: centered on the viewport
    const y = slot ? slot.y : 36;
    const compact = !!(slot && slot.compact);
    this._panelBox(ctx, x, y, w, h,
      compact ? 'DAMAGE REPORT — ACTUAL RUN DPS' : 'DAMAGE REPORT — BUILD ENGINE (Actual Run DPS)', '#ffd447');
    ctx.font = '11px Consolas, monospace';
    let ty = y + 38;

    // COMPACT COLUMNS (Maria 2026-07-19). The full report anchors six columns at fixed
    // offsets up to x+532 — sized for the 560px panel. In the 360px victory-screen column
    // everything from TOTAL onward fell outside the box, so the numbers overlapped and the
    // last two were drawn past the border entirely. The compact variant keeps only the four
    // columns that carry the run's meaning — WEAPON / DMG / DPS / KILLS — with the numbers
    // right-aligned to fixed anchors so they cannot drift into each other as values grow.
    // PEAK and CRIT% are not deleted: they still exist in the full panel and in telemetry.
    const PAD = 10;
    const cols = compact
      ? { name: x + PAD, nameMax: w - PAD - 190 - PAD, dmg: x + w - PAD - 104, dps: x + w - PAD - 52, kills: x + w - PAD }
      : null;

    // Shorten to fit, always ending in an ellipsis rather than a hard cut.
    const fit = (t, maxW) => {
      if (ctx.measureText(t).width <= maxW) return t;
      let out = t;
      while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1);
      return out + '…';
    };
    // Compact magnitudes so a large total cannot push into the next column.
    // The first version produced "1000.0K" and "1250.00M": it never promoted to the next
    // unit, so values piled up inside one suffix and read like a bug. Rules now:
    //   • promote at every 1000, through K / M / B / T (T keeps extreme Endless runs safe)
    //   • adaptive precision — under 10: two decimals · 10-99: one · 100+: none
    //   • a value that ROUNDS UP to 1000 promotes first, so "1000K" can never be printed
    //   • the precision band is re-evaluated after rounding, so 9 999 999 reads 10.0M
    //     rather than 10.00M
    // Display only: the stored totals, DPS and kill counters are untouched.
    const num = (v) => {
      let n = Number(v);
      if (!Number.isFinite(n)) return String(v);
      const sign = n < 0 ? '-' : '';
      n = Math.abs(n);
      const U = ['', 'K', 'M', 'B', 'T'];
      let u = 0;
      while (n >= 1000 && u < U.length - 1) { n /= 1000; u++; }
      const band = (x) => (x < 10 ? 2 : x < 100 ? 1 : 0);
      let dp = band(n);
      if (Number(n.toFixed(dp)) >= 1000 && u < U.length - 1) { n /= 1000; u++; dp = band(n); }
      dp = band(Number(n.toFixed(dp)));            // re-band after rounding
      return sign + (u === 0 ? String(Math.round(n)) : n.toFixed(dp)) + U[u];
    };

    ctx.fillStyle = '#8fa8b8';
    if (compact) {
      ctx.textAlign = 'left';  ctx.fillText('WEAPON', cols.name, ty);
      ctx.textAlign = 'right';
      ctx.fillText('DMG',   cols.dmg,   ty);
      ctx.fillText('DPS',   cols.dps,   ty);
      ctx.fillText('KILLS', cols.kills, ty);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText('WEAPON', x + 10, ty); ctx.fillText('TOTAL', x + 250, ty); ctx.fillText('AVG/s', x + 320, ty);
      ctx.fillText('PEAK', x + 380, ty); ctx.fillText('KILLS', x + 438, ty); ctx.fillText('CRIT', x + 490, ty); ctx.fillText('%', x + 532, ty);
    }
    ty += 16;

    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      const nm = (WEAPON_DEFS[r.id] || EVOLUTION_RECIPES[r.id] || PASSIVE_DEFS[r.id])?.name || r.id;
      ctx.fillStyle = i === 0 ? '#ffd447' : '#e9ecf2';
      if (compact) {
        ctx.textAlign = 'left';
        ctx.fillText(fit((i === 0 ? '★ ' : '· ') + String(nm), cols.nameMax), cols.name, ty);
        ctx.textAlign = 'right';
        ctx.fillText(num(r.total),  cols.dmg,   ty);
        ctx.fillText(num(r.avgDps), cols.dps,   ty);
        ctx.fillText(num(r.kills),  cols.kills, ty);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText((i === 0 ? '★ ' : '· ') + String(nm).slice(0, 26), x + 10, ty);
        ctx.fillText(String(r.total), x + 250, ty); ctx.fillText(String(r.avgDps), x + 320, ty);
        ctx.fillText(String(r.peakDps), x + 380, ty); ctx.fillText(String(r.kills), x + 438, ty);
        ctx.fillText(String(r.crits), x + 490, ty); ctx.fillText(r.share + '%', x + 532, ty);
      }
      ty += 16;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd447';
    const bestName = (WEAPON_DEFS[top[0].id] || EVOLUTION_RECIPES[top[0].id] || {}).name || top[0].id;
    ctx.fillText(fit('MOST EFFECTIVE: ' + bestName, w - PAD * 2), x + PAD, ty + 6);
    // WASTED PICK: internal telemetry ΜΟΝΟ (spec §12/P2.9) — δεν εμφανίζεται στον παίκτη.
    // ONE-SHOT (2026-07-18): _drawDamageReport τρέχει ΣΕ ΚΑΘΕ FRAME όσο δείχνει η end screen,
    // οπότε αυτό το log σπαμάριζε την κονσόλα — μετρήθηκαν 1187 πανομοιότυπες γραμμές σε μία
    // συνεδρία. Τυπώνεται πλέον μία φορά ανά run, όπως το telemetry παραπάνω.
    if (!this._wastedLogged) {
      this._wastedLogged = true;
      const owned = rows.filter(r => this.weapons.has(r.id));
      if (owned.length > 1) console.log('[BE telemetry] WASTED PICK:', owned[owned.length - 1].id, owned[owned.length - 1].share + '%');
    }
  }

  _drawSkull(ctx, sk, evolved) {
    const bob = Math.sin(this._t * 3 + sk.ph) * 2.5;
    const jaw = Math.max(0, Math.sin(this._t * 4.2 + sk.ph * 2)) * 2.6;   // ΤΡΑΓΟΥΔΙ: το σαγόνι ανοίγει ρυθμικά
    ctx.save();
    ctx.translate(sk.x, sk.y + bob);
    ctx.globalCompositeOperation = 'lighter';                      // φασματικός μανδύας κάτω από το κρανίο
    ctx.globalAlpha = evolved ? 0.22 : 0.14;
    ctx.fillStyle = evolved ? '#9fdcff' : '#7fb8d8';
    ctx.beginPath(); ctx.moveTo(-6, 4);
    ctx.quadraticCurveTo(-9 + Math.sin(this._t * 5 + sk.ph) * 3, 16, -2, 24 + Math.sin(this._t * 6 + sk.ph) * 2);
    ctx.quadraticCurveTo(0, 18, 2, 24 + Math.cos(this._t * 6 + sk.ph) * 2);
    ctx.quadraticCurveTo(9 + Math.cos(this._t * 5 + sk.ph) * 3, 16, 6, 4); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = evolved ? 0.34 : 0.24;                       // halo ταυτότητας
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;                                           // σώμα: θόλος κρανίου (χωρίς γνάθο)
    ctx.fillStyle = '#e8e4d0';
    ctx.beginPath(); ctx.arc(0, -1.5, 7.5, Math.PI * 0.95, Math.PI * 0.05);
    ctx.lineTo(5, 3.2); ctx.lineTo(-5, 3.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(80,72,56,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.translate(0, jaw);                             // ΚΙΝΟΥΜΕΝΗ γνάθος με δόντια-εγκοπές
    ctx.fillStyle = '#ddd8c2';
    ctx.beginPath(); ctx.moveTo(5, 3.6); ctx.lineTo(3, 3.6); ctx.lineTo(2.4, 6.4); ctx.lineTo(-2.4, 6.4);
    ctx.lineTo(-3, 3.6); ctx.lineTo(-5, 3.6); ctx.lineTo(-4.2, 5.6); ctx.lineTo(4.2, 5.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(80,72,56,0.55)'; ctx.stroke();
    ctx.restore();
    if (jaw > 1.6) {                                               // μέσα στο στόμα: φως της νότας
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
      ctx.fillStyle = evolved ? '#bfefff' : '#8fd4ff';
      ctx.fillRect(-2.6, 3.4, 5.2, jaw * 0.8);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = '#101418';                                     // κόγχες
    ctx.beginPath(); ctx.arc(-2.8, -1.5, 1.9, 0, Math.PI * 2); ctx.arc(2.8, -1.5, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';                      // πυρήνας ματιών (τρεμοπαίζει στο ρυθμό)
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this._t * 4.2 + sk.ph * 2);
    ctx.fillStyle = evolved ? '#bfefff' : '#8fd4ff';
    ctx.beginPath(); ctx.arc(-2.8, -1.5, 1.0, 0, Math.PI * 2); ctx.arc(2.8, -1.5, 1.0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
// EOF — P2.2 runtime
