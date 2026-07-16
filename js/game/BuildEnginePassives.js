// ═══════════════════════════════════════════════════════════════════════════════
// P2.6 — BUILD ENGINE: 25 build passives (spec §26-50), generic hooks.
// Hooks: modDamage (πολλαπλασιαστής πριν τα boss caps) · onDamage · onKill · tick.
// ΟΛΑ με caps/ICD όπως ορίζει το spec. Boss immunity όπου προβλέπεται CC/execute.
// Αποφάσεις υλοποίησης (αναφέρονται ρητά — όχι σιωπηλές αποκλίσεις):
//  · §46/§47 χρησιμοποιούν το ΥΠΑΡΧΟΝ player._armorT (armor shield window του Game).
//  · §48 Momentum Shield: συνεχής κίνηση 2.5s -> μικρό armor window όσο κινείσαι.
//  · §39 Bloodless Momentum: το +AS υλοποιείται ως ταχύτερη ροή των BE cooldowns.
//  · §49 Dash Reservoir: μειώνει ΠΡΑΓΜΑΤΙΚΑ το player.dashCooldown ανά kills.
//  · §50 Phoenix Contingency: revive detect (hp<=0 -> hp>0) -> 8s +15% BE dmg +15% MS.
// ═══════════════════════════════════════════════════════════════════════════════
import { WEAPON_DEFS, PASSIVE_DEFS, EVOLUTION_RECIPES, RUNTIME_HOOKS }
  from './BuildEngine.js?v=20260718600000';

// ── per-runtime state (καθαρίζει μόνο του όταν πεθάνει το runtime instance) ────
const STATE = new WeakMap();
function S(rt) {
  let s = STATE.get(rt);
  if (!s) {
    s = { echoQ: [], hitCount: new Map(), fracICD: new Map(), sparkICD: new Map(), thermICD: new Map(),
          killWin: [], crlICD: 0, homICD: 0, aftICD: 0, revICD: 0, revBuffT: 0, revSpeedBase: null,
          bmStacks: 0, bmT: 0, density: 0, densT: 0, lastHp: null, hpDrops: [], impICD: 0,
          moveT: 0, dashKills: 0, wasDead: false, adaptICD: 0 };
    STATE.set(rt, s);
  }
  return s;
}
const L = (rt, id) => rt.passives.get(id) || 0;
const isEliteish = e => e.isElite || !!e.shootInterval || (e.rank && e.rank !== 'normal');
const noBoss = e => !(e.isBoss?.() || e.isMegaBoss);

// ── ορισμοί καρτών (§26-50) — category 'build_passive', offered σε όλους ──────
const B = (key, name, maxLevel, desc) => { PASSIVE_DEFS[key] = { name, category: 'build_passive', owner: null, maxLevel, desc }; };
B('bp_critical_relay',     'Critical Relay', 2,     'Crits relay a portion of their damage to the nearest other enemy.');
B('bp_execution_threshold','Execution Threshold', 2,'Normal enemies at death’s door are executed outright. Never bosses.');
B('bp_fracture_payload',   'Fracture Payload', 2,   'Repeated hits fracture armor — the target briefly takes extra damage. Boss-capped.');
B('bp_chain_reaction',     'Chain Reaction License', 1, 'Multi-kill blasts license a second, smaller explosion.');
B('bp_predatory_targeting','Predatory Targeting', 2,'More damage to elites, shooters and champions ONLY.');
B('bp_vector_duplication', 'Vector Duplication', 1, 'Every 8th strike duplicates itself a beat later at reduced power.');
B('bp_return_trajectory',  'Return Trajectory', 1,  'Projectiles sometimes swing back for a second, weaker pass.');
B('bp_kinetic_overtravel', 'Kinetic Overtravel', 2, 'Piercing weapons accelerate through flesh — they simply hit harder.');
B('bp_homing_correction',  'Homing Correction', 1,  'Overkill damage is re-aimed at the nearest living target.');
B('bp_terminal_velocity',  'Terminal Velocity', 2,  'Projectiles deal more damage the farther they strike from you.');
B('bp_cq_dominion',        'Close-Quarters Dominion', 2, 'Melee grows stronger the denser the crowd around you.');
B('bp_follow_through',     'Follow-Through Servo', 1, 'Heavy melee crits follow through with a second, smaller strike.');
B('bp_guard_breaker',      'Guard Breaker', 2,      'Knockback and stagger crack guards — the broken take extra damage briefly.');
B('bp_bloodless_momentum', 'Bloodless Momentum', 2, 'Melee kills briefly speed up all Build Engine weapons. Strictly capped.');
B('bp_impact_reversal',    'Impact Reversal', 1,    'Taking a hit answers with a small shockwave. Long internal cooldown.');
B('bp_elemental_conductor','Elemental Conductor', 1,'Two statuses on one target spark a fusion burst.');
B('bp_thermal_shock',      'Thermal Shock', 1,      'Burning + shocked targets burst and lose armor briefly.');
B('bp_ionized_blood',      'Ionized Blood', 2,      'Poisoned targets conduct — all Build Engine damage arcs into them harder.');
B('bp_void_saturation',    'Void Saturation', 2,    'Gravity wells saturate their prey — projectiles passing through hit harder.');
B('bp_elemental_afterimage','Elemental Afterimage', 1, 'Area strikes sometimes echo a moment later at reduced power.');
B('bp_emergency_phase',    'Emergency Phase Layer', 1, 'A sudden HP drop triggers a brief armor window. Long cooldown.');
B('bp_adaptive_plating',   'Adaptive Plating', 1,   'Sustained incoming punishment hardens you for a moment.');
B('bp_momentum_shield',    'Momentum Shield', 1,    'Keep moving and a kinetic shield holds — stand still and it drains.');
B('bp_dash_reservoir',     'Dash Reservoir', 2,     'Kills feed the reservoir — your dash recovers noticeably faster.');
B('bp_phoenix_contingency','Phoenix Contingency', 1,'On revive: surge of speed and power. Never grants an extra revive.');

// ── helper: προγραμματισμένα echoes (δεν μπαίνουν σε άπειρη αναδρομή:
//    τα hooks αγνοούνται σε depth>0 μέσω rt._hookDepth στο BuildEngine) ─────────
function queueEcho(rt, e, wid, dmg, delay) {
  const s = S(rt);
  if (s.echoQ.length >= 24) return;
  s.echoQ.push({ t: delay, e, wid, dmg });
}
function nearestOther(rt, x, y, exclude, range = 180) {
  let best = null, bd = range * range;
  const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(x, y, range) : rt.game.enemies;
  for (const e of near) {
    if (!e || e.hp <= 0 || e === exclude) continue;
    const dd = (e.pos.x - x) ** 2 + (e.pos.y - y) ** 2;
    if (dd < bd) { bd = dd; best = e; }
  }
  return best;
}

// ═══ modDamage — πολλαπλασιαστές ΠΡΙΝ τα boss caps ═══════════════════════════
RUNTIME_HOOKS.modDamage.push((rt, e, wid, tags) => {
  let m = 1;
  const s = S(rt);
  // §30 Predatory Targeting
  const pt = L(rt, 'bp_predatory_targeting');
  if (pt && isEliteish(e)) m *= 1 + 0.10 * pt;
  // §33 Kinetic Overtravel
  const ko = L(rt, 'bp_kinetic_overtravel');
  if (ko && tags.includes('PIERCE')) m *= 1 + 0.06 * ko;
  // §35 Terminal Velocity
  const tv = L(rt, 'bp_terminal_velocity');
  if (tv && tags.includes('PROJECTILE')) {
    const p = rt.game.player, dist = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
    if (dist > 220) m *= 1 + 0.10 * tv;
  }
  // §36 Close-Quarters Dominion (πυκνότητα cached στο tick)
  const cq = L(rt, 'bp_cq_dominion');
  if (cq && tags.includes('MELEE') && s.density >= 4) m *= 1 + (s.density >= 8 ? 0.11 : 0.075) * cq;
  // §38 Guard Breaker (σπασμένη άμυνα)
  const gb = L(rt, 'bp_guard_breaker');
  if (gb && rt._status.get(e)?.guardbrk) m *= 1 + 0.075 * gb;
  // §43 Ionized Blood
  const ib = L(rt, 'bp_ionized_blood');
  if (ib && rt._status.get(e)?.poison) m *= 1 + 0.06 * ib;
  // §44 Void Saturation (σημαδεμένοι από gravity wells στο tick)
  const vs = L(rt, 'bp_void_saturation');
  if (vs && tags.includes('PROJECTILE') && rt._status.get(e)?.voided) m *= 1 + 0.075 * vs;
  // §50 Phoenix Contingency buff window
  if (s.revBuffT > 0) m *= 1.15;
  return m;
});

// ═══ onDamage — μετά το χτύπημα ═══════════════════════════════════════════════
RUNTIME_HOOKS.onDamage.push((rt, e, wid, tags, dmg, crit, kill) => {
  const s = S(rt), now = rt._t;
  // §26 Critical Relay
  const cr = L(rt, 'bp_critical_relay');
  if (cr && crit && dmg >= 5) {
    const other = nearestOther(rt, e.pos.x, e.pos.y, e);
    if (other) queueEcho(rt, other, 'bp_critical_relay', dmg * (0.30 + 0.20 * (cr - 1)), 0.05);
  }
  // §27 Execution Threshold (ΟΧΙ bosses)
  const ex = L(rt, 'bp_execution_threshold');
  if (ex && !kill && noBoss(e) && e.maxHp > 0 && e.hp / e.maxHp < 0.05 + 0.03 * ex)
    queueEcho(rt, e, 'bp_execution_threshold', e.hp + 1, 0.02);
  // §28 Fracture Payload (8 hits -> shred 2s· boss ICD 5s)
  const fp = L(rt, 'bp_fracture_payload');
  if (fp && !kill) {
    const n = (s.hitCount.get(e) || 0) + 1;
    if (n >= 8 - fp) {
      const icdU = s.fracICD.get(e) || 0;
      const isB = !noBoss(e);
      if (!isB || now >= icdU) {
        s.hitCount.set(e, 0);
        const st = rt._st(e); st.shred = Math.max(st.shred || 0, 2.0);
        if (isB) s.fracICD.set(e, now + 5);
      }
    } else s.hitCount.set(e, n);
    if (s.hitCount.size > 200) s.hitCount.clear();
  }
  // §31 Vector Duplication (κάθε 8η επίθεση -> echo 40%)
  const vd = L(rt, 'bp_vector_duplication');
  if (vd) {
    s.vdN = (s.vdN || 0) + 1;
    if (s.vdN >= 8) { s.vdN = 0; if (e.hp > 0) queueEcho(rt, e, 'bp_vector_duplication', dmg * 0.4, 0.25); }
  }
  // §32 Return Trajectory (projectiles, 15%)
  const rj = L(rt, 'bp_return_trajectory');
  if (rj && tags.includes('PROJECTILE') && !tags.includes('NOVA') && Math.random() < 0.15 && e.hp > 0)
    queueEcho(rt, e, 'bp_return_trajectory', dmg * 0.5, 0.20);
  // §37 Follow-Through Servo (melee crit -> 2ο 35%)
  const ft = L(rt, 'bp_follow_through');
  if (ft && crit && tags.includes('MELEE') && e.hp > 0)
    queueEcho(rt, e, 'bp_follow_through', dmg * 0.35, 0.15);
  // §38 Guard Breaker: τα KB/STAGGER όπλα σπάνε την άμυνα
  const gb = L(rt, 'bp_guard_breaker');
  if (gb && (tags.includes('KNOCKBACK') || tags.includes('STAGGER'))) {
    const st = rt._st(e); st.guardbrk = 1.5;
  }
  // §41 Elemental Conductor (2 statuses -> fusion spark, per-enemy ICD 2s)
  const ec = L(rt, 'bp_elemental_conductor');
  if (ec) {
    const st = rt._status.get(e);
    const cnt = st ? ((st.burn ? 1 : 0) + (st.poison ? 1 : 0) + (st.shock !== undefined ? 1 : 0)) : 0;
    if (cnt >= 2 && now >= (s.sparkICD.get(e) || 0)) {
      s.sparkICD.set(e, now + 2);
      queueEcho(rt, e, 'bp_elemental_conductor', 25, 0.05);
      if (rt.fx.length < 48) rt.fx.push({ kind: 'spark', x: e.pos.x, y: e.pos.y, r: e.radius + 10, t: 0, life: 0.3 });
      if (s.sparkICD.size > 120) s.sparkICD.clear();
    }
  }
  // §42 Thermal Shock (burn + shock -> burst + shred, per-enemy ICD 2.5s)
  const ts = L(rt, 'bp_thermal_shock');
  if (ts) {
    const st = rt._status.get(e);
    if (st?.burn && st.shock !== undefined && now >= (s.thermICD.get(e) || 0)) {
      s.thermICD.set(e, now + 2.5);
      queueEcho(rt, e, 'bp_thermal_shock', 20, 0.05);
      st.shred = Math.max(st.shred || 0, 1.5);
      if (s.thermICD.size > 120) s.thermICD.clear();
    }
  }
  // §34 Homing Correction (overkill -> κοντινότερος, ICD 0.5s)
  const hc = L(rt, 'bp_homing_correction');
  if (hc && kill && e.hp < 0 && now >= s.homICD) {
    const over = Math.min(-e.hp, 40);
    const other = nearestOther(rt, e.pos.x, e.pos.y, e, 200);
    if (other && over > 2) { s.homICD = now + 0.5; queueEcho(rt, other, 'bp_homing_correction', over, 0.08); }
  }
  // §45 Elemental Afterimage (AOE/ZONE/NOVA, 12%, global ICD 0.5s)
  const ea = L(rt, 'bp_elemental_afterimage');
  if (ea && (tags.includes('AOE') || tags.includes('ZONE') || tags.includes('NOVA')) &&
      Math.random() < 0.12 && now >= s.aftICD && e.hp > 0) {
    s.aftICD = now + 0.5;
    queueEcho(rt, e, 'bp_elemental_afterimage', dmg * 0.4, 0.30);
  }
});

// ═══ onKill ════════════════════════════════════════════════════════════════════
RUNTIME_HOOKS.onKill.push((rt, e, wid, tags) => {
  const s = S(rt), now = rt._t;
  // §29 Chain Reaction License (3 kills σε 0.5s από AOE-type -> 2η μικρότερη έκρηξη, ICD 2s)
  const crl = L(rt, 'bp_chain_reaction');
  if (crl && (tags.includes('AOE') || tags.includes('NOVA') || tags.includes('ZONE') || tags.includes('MINE'))) {
    s.killWin.push([now, e.pos.x, e.pos.y]);
    while (s.killWin.length && now - s.killWin[0][0] > 0.5) s.killWin.shift();
    if (s.killWin.length >= 3 && now >= s.crlICD) {
      s.crlICD = now + 2;
      const [, kx, ky] = s.killWin[s.killWin.length - 1];
      s.killWin.length = 0;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(kx, ky, 140) : rt.game.enemies;
      for (const e2 of near) {
        if (!e2 || e2.hp <= 0) continue;
        if ((e2.pos.x - kx) ** 2 + (e2.pos.y - ky) ** 2 > (80 + e2.radius) ** 2) continue;
        queueEcho(rt, e2, 'bp_chain_reaction', 20, 0.06);
      }
      if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: kx, y: ky, r: 80, t: 0, life: 0.3, col: '#ffd447' });
    }
  }
  // §39 Bloodless Momentum (melee kill -> +AS stack, cap 5, 3s)
  const bm = L(rt, 'bp_bloodless_momentum');
  if (bm && tags.includes('MELEE')) { s.bmStacks = Math.min(3 + bm, s.bmStacks + 1); s.bmT = 3.0; }
  // §49 Dash Reservoir (kills -> dash cooldown relief)
  const dr = L(rt, 'bp_dash_reservoir');
  if (dr) {
    s.dashKills++;
    const needed = dr >= 2 ? 10 : 16;
    if (s.dashKills >= needed) {
      s.dashKills = 0;
      const p = rt.game.player;
      if (p && typeof p.dashCooldown === 'number') p.dashCooldown = Math.max(0, p.dashCooldown - 1.2);
    }
  }
});

// ═══ tick — ουρά echoes, buffs, defensive layers ═══════════════════════════════
RUNTIME_HOOKS.tick.push((rt, dt) => {
  const s = S(rt), p = rt.game.player, now = rt._t;
  // echo queue (τα echoes χτυπούν με depth-guard, χωρίς νέα hooks)
  for (let i = s.echoQ.length - 1; i >= 0; i--) {
    const q = s.echoQ[i]; q.t -= dt;
    if (q.t > 0) continue;
    s.echoQ.splice(i, 1);
    if (q.e && q.e.hp > 0) rt._dealDamage(q.wid, q.e, q.dmg, 0.7, false);
  }
  // §36 πυκνότητα (cache κάθε 0.3s)
  s.densT -= dt;
  if (s.densT <= 0 && p) {
    s.densT = 0.3; s.density = 0;
    const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, 130) : rt.game.enemies;
    for (const e of near) if (e && e.hp > 0 && Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) < 130) s.density++;
  }
  // §38 guard break decay (custom status key — δικό μας decay)
  for (const [e, st] of rt._status) {
    if (st.guardbrk !== undefined) { st.guardbrk -= dt; if (st.guardbrk <= 0) delete st.guardbrk; }
    if (st.voided !== undefined) { st.voided -= dt; if (st.voided <= 0) delete st.voided; }
  }
  // §39 Bloodless Momentum: επιταχύνει τη ροή των BE cooldowns
  if (s.bmStacks > 0) {
    s.bmT -= dt;
    if (s.bmT <= 0) { s.bmStacks = 0; }
    else { const extra = dt * 0.06 * s.bmStacks;
      for (const w of rt.weapons.values()) w.cd -= extra; }
  }
  // §44 Void Saturation: σημάδεψε εχθρούς μέσα σε ενεργά gravity wells
  if (L(rt, 'bp_void_saturation')) {
    const gw = rt.weapons.get('gravity_core');
    if (gw && gw.cores) for (const c of gw.cores) {
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(c.x, c.y, 160) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0) continue;
        if ((e.pos.x - c.x) ** 2 + (e.pos.y - c.y) ** 2 < 160 * 160) { const st = rt._st(e); st.voided = 0.4; }
      }
    }
  }
  if (!p) return;
  // hp tracking για §40/§46/§47/§50
  if (s.lastHp === null) s.lastHp = p.hp;
  const drop = s.lastHp - p.hp;
  if (drop > 0.5) {
    s.hpDrops.push([now, drop]);
    while (s.hpDrops.length && now - s.hpDrops[0][0] > 4) s.hpDrops.shift();
    // §40 Impact Reversal (shockwave, ICD 3s)
    if (L(rt, 'bp_impact_reversal') && now >= s.impICD) {
      s.impICD = now + 3;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, 90 + 60) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0) continue;
        if (Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) > 90 + e.radius) continue;
        queueEcho(rt, e, 'bp_impact_reversal', 18, 0.03);
      }
      if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: p.pos.x, y: p.pos.y, r: 90, t: 0, life: 0.3, col: '#e9ecf2' });
    }
    // §46 Emergency Phase Layer: απότομη πτώση >12% maxHp εντός 1s -> armor 2s, ICD 45s
    if (L(rt, 'bp_emergency_phase') && now >= s.revICD) {
      let recent = 0; for (const [t0, dd] of s.hpDrops) if (now - t0 <= 1) recent += dd;
      if (p.maxHp > 0 && recent >= p.maxHp * 0.12) {
        s.revICD = now + 45;
        p._armorT = Math.max(p._armorT || 0, 2);
        rt.game.triggerAnnouncement?.('◈ EMERGENCY PHASE LAYER ◈', '#4fd8ff');
      }
    }
    // §47 Adaptive Plating: 3+ χτυπήματα σε 4s -> armor 1.2s, ICD 12s
    if (L(rt, 'bp_adaptive_plating') && now >= s.adaptICD && s.hpDrops.length >= 3) {
      s.adaptICD = now + 12;
      p._armorT = Math.max(p._armorT || 0, 1.2);
    }
  }
  s.lastHp = p.hp;
  // §48 Momentum Shield: συνεχής κίνηση -> μικρό διαρκές armor window όσο τρέχεις
  if (L(rt, 'bp_momentum_shield')) {
    const moving = p.vel && Math.hypot(p.vel.x, p.vel.y) > 40;
    s.moveT = moving ? s.moveT + dt : 0;
    if (s.moveT >= 2.5) p._armorT = Math.max(p._armorT || 0, 0.35);   // κρατιέται μόνο όσο κινείσαι
  }
  // §50 Phoenix Contingency: revive detect -> 8s buff (+15% BE dmg μέσω modDamage +15% MS)
  if (L(rt, 'bp_phoenix_contingency')) {
    if (p.hp <= 0) s.wasDead = true;
    else if (s.wasDead && p.hp > 0) {
      s.wasDead = false;
      if (s.revBuffT <= 0) {
        s.revBuffT = 8;
        if (s.revSpeedBase === null && typeof p.speed === 'number') { s.revSpeedBase = p.speed; p.speed = p.speed * 1.15; }
        rt.game.triggerAnnouncement?.('◈ PHOENIX CONTINGENCY ◈', '#ffd447');
      }
    }
    if (s.revBuffT > 0) {
      s.revBuffT -= dt;
      if (s.revBuffT <= 0 && s.revSpeedBase !== null) { p.speed = s.revSpeedBase; s.revSpeedBase = null; }
    }
  }
});

export const BE_BUILD_PASSIVES = Object.keys(PASSIVE_DEFS).filter(k => k.startsWith('bp_'));
