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

export class BuildEngineRuntime {
  constructor(game) {
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
      if (!s.burn && !s.poison && s.shock === undefined && s.fear === undefined) this._status.delete(e);
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
      if (!p) continue;
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
    this.weapons.set(id, { id, level: 1, evolved: false, cd: 0.4, volley: 0, burstQ: [],
                           charge: 0, skulls: [], bladeT: 0 });
  }
  addPassive(id) {
    const p = PASSIVE_DEFS[id];
    this.passives.set(id, Math.min(p?.maxLevel || 3, (this.passives.get(id) || 0) + 1));
  }
  _evolve(weaponId) {
    const w = this.weapons.get(weaponId);
    if (w) { w.evolved = true; w.level = 5; w.charge = 0; }
    let name = weaponId;
    for (const r of Object.values(EVOLUTION_RECIPES)) if (r.weapon === weaponId) { name = r.name; break; }
    this.game.triggerAnnouncement?.('◈ EVOLUTION — ' + name.toUpperCase() + ' ◈', CARD_COLOR.evolution);
  }
  _evolutionReady() {
    for (const [eid, r] of Object.entries(EVOLUTION_RECIPES)) {
      const wd = WEAPON_DEFS[r.weapon];
      if (wd?.owner && wd.owner !== this.game.selectedCharacter) continue;   // native evolutions ΜΟΝΟ στον ιδιοκτήτη
      const w = this.weapons.get(r.weapon);
      if (w && !w.evolved && w.level >= r.weaponLevel && (this.passives.get(r.passive) || 0) >= r.passiveLevel)
        return { eid, recipe: r };
    }
    return null;
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

    // 2) Weighted pool: όπλα (νέα/level-up) + catalysts
    const cand = [];
    for (const [wid, d] of Object.entries(WEAPON_DEFS)) {
      if (d.external) continue;                     // data-wrap παλιού συστήματος — δεν προσφέρεται ως κάρτα
      const w = this.weapons.get(wid);
      if (w && (w.level >= 5 || w.evolved)) continue;
      const wt = (w ? 2 : 3) * (d.owner === g.selectedCharacter ? 3 : 1);   // native x3 στον ιδιοκτήτη
      cand.push({ wt, card: mk('be_w_' + wid, d.name,
        (w ? 'Level ' + (w.level + 1) + ' — ' : 'NEW WEAPON — ') + d.desc +
        '  [SINGLE-TARGET DPS ' + singleTargetDps(d, (w?.level || 0) + 1) + ']',
        CARD_COLOR.weapon, '❖', () => self.addWeapon(wid)) });
    }
    for (const [pid, p] of Object.entries(PASSIVE_DEFS)) {
      const w = this.weapons.get(p.forWeapon);
      if (!w || w.evolved) continue;                            // catalyst μόνο αν υπάρχει το όπλο
      const lvl = this.passives.get(pid) || 0;
      if (lvl >= p.maxLevel) continue;
      const wt = (w.level >= 3 ? 3 : 1);                        // x3 όταν το όπλο Lv3+
      cand.push({ wt, card: mk('be_p_' + pid, p.name,
        (lvl ? 'Level ' + (lvl + 1) + ' — ' : '') + p.desc, CARD_COLOR.passive, '◈',
        () => self.addPassive(pid)) });
    }
    if (!cand.length) return false;
    // 45% πιθανότητα κάρτας BuildEngine (δεν πλημμυρίζει το pool της demo)
    if (Math.random() > 0.45) return false;
    let sum = 0; for (const c of cand) sum += c.wt;
    let r = Math.random() * sum, pick = cand[0];
    for (const c of cand) { r -= c.wt; if (r <= 0) { pick = c; break; } }
    choices[choices.length - 1] = pick.card;
    return true;
  }

  // ── damage chokepoint: boss caps + bossMultiplier + crits + DamageLog ────────
  _dealDamage(weaponId, e, raw, bossMult, crit) {
    const g = this.game;
    if (!e || e.hp <= 0) return false;
    let dmg = raw * (crit ? (weaponId === 'grave_cantor' || weaponId === 'be_revenant_choir' ? 1.5 : 1.6) : 1);
    const boss = (e.isBoss?.() || e.isMegaBoss);
    if (boss) dmg = g._capBossDamage(e, dmg * bossMult);
    e.takeHit(dmg, g);
    this.log.hit(weaponId, dmg, { crit, kill: e.hp <= 0 });
    return true;
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────────
  update(dt) {
    const g = this.game;
    if (!g.player) return;
    this._t += dt;
    for (const w of this.weapons.values()) {
      const ex = WEAPON_EXECUTORS[w.id];
      if (ex) ex.update(this, w, dt);
      else if (w.id === 'marrow_spitter') this._updateSpitter(w, dt);
      else if (w.id === 'grave_cantor') this._updateCantor(w, dt);
    }
    this._tickStatus(dt);
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
      // bone shards
      for (const sh of this.shards) {
        const sc = sh.splinterChild ? 0.55 : 1;
        ctx.save();
        ctx.translate(sh.x, sh.y); ctx.rotate(sh.a);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.28;                                    // halo ταυτότητας
        ctx.fillStyle = sh.evolved ? '#ffd9a8' : '#cfe8ff';
        ctx.beginPath(); ctx.ellipse(0, 0, 16 * sc, 6 * sc, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;                                       // σώμα: αιχμηρό οστό
        ctx.fillStyle = '#e8e4d0';
        ctx.beginPath();
        ctx.moveTo(11 * sc, 0); ctx.lineTo(-7 * sc, 3.4 * sc);
        ctx.lineTo(-4 * sc, 0); ctx.lineTo(-7 * sc, -3.4 * sc); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(90,80,60,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';                  // λευκός πυρήνας
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(9 * sc, 0); ctx.lineTo(-3 * sc, 0); ctx.stroke();
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
        ctx.globalAlpha = 0.8 * fade;                              // θραύσματα οστών στην ακμή
        ctx.fillStyle = '#e8e4d0';
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + n.t * 2.2;
          ctx.save(); ctx.translate(n.x + Math.cos(a) * n.r, n.y + Math.sin(a) * n.r); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, 2.4); ctx.lineTo(-4, -2.4); ctx.closePath(); ctx.fill();
          ctx.restore();
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
      // P2.3+ executors: κάθε όπλο ζωγραφίζει τα δικά του (ίδια συνταγή ultimates)
      for (const w of this.weapons.values()) WEAPON_EXECUTORS[w.id]?.draw?.(this, ctx, w);
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
          ctx.globalAlpha = 0.5 * (1 - k);
          ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 3 - 2 * k;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.25 + 0.75 * k), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 0.9 * (1 - k);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.25 + 0.75 * k) - 4, 0, Math.PI * 2); ctx.stroke();
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

  _drawSkull(ctx, sk, evolved) {
    const bob = Math.sin(this._t * 3 + sk.ph) * 2.5;
    ctx.save();
    ctx.translate(sk.x, sk.y + bob);
    ctx.globalCompositeOperation = 'lighter';                      // halo ταυτότητας
    ctx.globalAlpha = evolved ? 0.34 : 0.24;
    ctx.fillStyle = evolved ? '#9fdcff' : '#7fb8d8';
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;                                           // σώμα: κρανίο
    ctx.fillStyle = '#e8e4d0';
    ctx.beginPath(); ctx.arc(0, -1.5, 7.5, Math.PI * 0.95, Math.PI * 0.05); // θόλος
    ctx.lineTo(5, 4); ctx.lineTo(3, 4); ctx.lineTo(2.4, 6.4); ctx.lineTo(-2.4, 6.4); // γνάθος με δόντια-εγκοπές
    ctx.lineTo(-3, 4); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(80,72,56,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#101418';                                     // κόγχες
    ctx.beginPath(); ctx.arc(-2.8, -1.5, 1.9, 0, Math.PI * 2); ctx.arc(2.8, -1.5, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';                      // λευκός/κυανός πυρήνας ματιών
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = evolved ? '#bfefff' : '#8fd4ff';
    ctx.beginPath(); ctx.arc(-2.8, -1.5, 0.9, 0, Math.PI * 2); ctx.arc(2.8, -1.5, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
// EOF — P2.2 runtime
