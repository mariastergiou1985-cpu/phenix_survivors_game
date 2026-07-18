// ═══════════════════════════════════════════════════════════════════════════════
// P2.3a — BUILD ENGINE chars 2-3: TAEKWONDO GIRL + CYBER ARM HERO
// 4 όπλα + 4 catalysts + 4 evolutions (be_*). Spec: docs/P2_BUILD_ENGINE_SPEC_GR.md
// Side-effect module: κάνει register DEFS + executors στο BuildEngine (ίδιο ?v —
// ΠΡΕΠΕΙ να ταιριάζει με το import του Game.js για κοινό module instance).
// ΑΠΟΛΥΤΟΣ ΚΑΝΟΝΑΣ: procedural όπως τα ultimates — halo -> σώμα -> λευκός πυρήνας,
// lighter, φάσεις, caps, ΚΑΝΕΝΑ PNG, μηδέν shadowBlur.
// ═══════════════════════════════════════════════════════════════════════════════
import { WEAPON_DEFS, PASSIVE_DEFS, EVOLUTION_RECIPES, WEAPON_EXECUTORS }
  from './BuildEngine.js?v=20260722700000';

// ── κοινά helpers του module ─────────────────────────────────────────────────
function aimAngle(rt) {
  const p = rt.game.player, e = rt._nearestEnemy(p.pos.x, p.pos.y);
  if (e) return Math.atan2(e.pos.y - p.pos.y, e.pos.x - p.pos.x);
  return (p._facing || 1) > 0 ? 0 : Math.PI;
}
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function lvl(def, w, key) { const i = Math.min(w.level - 1, 4); return def[key][i]; }

// ═══ 03 · VECTOR HEEL — ημικυκλικό ενεργειακό λάκτισμα, εναλλαγή Δ/Α,
//        bonus στην άκρη · Refraction Anklet -> BE_MIRROR_CASCADE (2 afterimages) ═══
WEAPON_DEFS.vector_heel = {
  name: 'Vector Heel', owner: 'taekwondo_girl', category: 'weapon', kind: 'melee_arc',
  damage:   [16, 19, 23, 28, 34],
  cooldown: [1.15, 1.05, 0.95, 0.85, 0.75],
  amount:   [1, 1, 1, 1, 1],
  radius:   [72, 76, 82, 90, 98],
  arc: Math.PI * 0.95, edgeBonus: 0.35, edgeFrom: 0.72,
  critChance: 0.08, critMult: 1.7, knockback: 150,
  bossMultiplier: 0.85, maxActive: 6,
  tags: ['KICK', 'MELEE', 'ARC'],
  evolutionPassive: 'refraction_anklet', evolution: 'be_mirror_cascade',
  desc: 'A crescent energy kick, alternating sides. The blade bites hardest at its edge.',
};
PASSIVE_DEFS.refraction_anklet = {
  name: 'Refraction Anklet', category: 'evolution_passive', owner: null,
  forWeapon: 'vector_heel', requiredFor: 'be_mirror_cascade', maxLevel: 3,
  bonuses: [ { heelEdge: 0.15 }, { heelEdge: 0.15, heelDmg: 0.10 }, { heelEdge: 0.20, heelDmg: 0.15 } ],
  desc: 'Light bends around the heel — the edge cuts deeper. Powers the Mirror Cascade.',
};
EVOLUTION_RECIPES.be_mirror_cascade = {
  name: 'Mirror Cascade', weapon: 'vector_heel', passive: 'refraction_anklet',
  weaponLevel: 5, passiveLevel: 3,
  damage: 40, cooldown: 0.70, radius: 108, echoes: 2, echoDelay: 0.16, echoDmg: 0.60,
  bossMultiplier: 0.80, tags: ['KICK', 'MELEE', 'ARC', 'ECHO'],
  desc: 'Every kick refracts into two delayed mirror images striking from both sides.',
};

WEAPON_EXECUTORS.vector_heel = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.vector_heel, evo = EVOLUTION_RECIPES.be_mirror_cascade;
    const p = rt.game.player;
    w.sweeps = w.sweeps || []; w.queue = w.queue || [];
    // εκκρεμείς echo-κλωτσιές (evolution)
    for (let i = w.queue.length - 1; i >= 0; i--) {
      w.queue[i].t -= dt;
      if (w.queue[i].t <= 0) { const q = w.queue.splice(i, 1)[0]; this._kick(rt, w, q.side, q.dmgMult, true); }
    }
    w.cd -= dt;
    if (w.cd <= 0) {
      const cdArr = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      w.cd = cdArr;
      w.side = -(w.side || 1);
      this._kick(rt, w, w.side, 1, false);
      if (w.evolved) for (let k = 1; k <= evo.echoes; k++)
        w.queue.push({ t: evo.echoDelay * k, side: (k % 2 ? -w.side : w.side), dmgMult: evo.echoDmg });
    }
    // sweep lifecycle + damage (χτύπημα μία φορά ανά sweep, στη μέση της κίνησης)
    for (let i = w.sweeps.length - 1; i >= 0; i--) {
      const s = w.sweeps[i]; s.t += dt;
      if (!s.done && s.t >= s.dur * 0.4) {
        s.done = true;
        const dmgBase = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('heelDmg')) * s.dmgMult;
        const R = w.evolved ? evo.radius : lvl(d, w, 'radius');
        const edgeFrom = d.edgeFrom, edgeBonus = d.edgeBonus + rt._catalystSum('heelEdge');
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, R + 60) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y, dist = Math.hypot(dx, dy);
          if (dist > R + e.radius) continue;
          if (Math.abs(angDiff(Math.atan2(dy, dx), s.dir)) > d.arc / 2) continue;
          let dmg = dmgBase * (dist > R * edgeFrom ? 1 + edgeBonus : 1);
          rt._dealDamage(w.evolved ? 'be_mirror_cascade' : 'vector_heel', e, dmg,
            w.evolved ? evo.bossMultiplier : d.bossMultiplier, Math.random() < d.critChance);
        }
      }
      if (s.t >= s.dur) w.sweeps.splice(i, 1);
    }
  },
  _kick(rt, w, side, dmgMult, echo) {
    if ((w.sweeps || []).length >= WEAPON_DEFS.vector_heel.maxActive) return;
    w.sweeps.push({ dir: aimAngle(rt), side, t: 0, dur: 0.26, dmgMult, echo, done: false });
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.vector_heel, evo = EVOLUTION_RECIPES.be_mirror_cascade;
    const p = rt.game.player, R = w.evolved ? evo.radius : lvl(d, w, 'radius');
    for (const s of (w.sweeps || [])) {
      const k = s.t / s.dur, fade = 1 - k;
      ctx.save(); ctx.translate(p.pos.x, p.pos.y);
      ctx.globalCompositeOperation = 'lighter';
      // ULTIMATE PASS: τρία afterimages που κυνηγούν την μπροστινή ακμή
      for (let gi = 2; gi >= 0; gi--) {
        const gk = Math.max(0.02, Math.min(1, k * 1.6 - gi * 0.16));
        const a0 = s.dir - s.side * d.arc / 2, a1 = a0 + s.side * d.arc * gk;
        const alphaMul = gi === 0 ? 1 : (gi === 1 ? 0.5 : 0.25);
        ctx.globalAlpha = 0.30 * fade * alphaMul;                  // halo (aqua spirit)
        ctx.strokeStyle = s.echo ? '#bfefff' : '#3CF0E6'; ctx.lineWidth = 16 - gi * 4;
        ctx.beginPath(); ctx.arc(0, 0, R * (0.9 - gi * 0.05), Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
        if (gi === 0) {
          ctx.globalAlpha = 0.65 * fade;                           // σώμα κοψίματος
          ctx.strokeStyle = s.echo ? '#9fdcff' : '#5df5ea'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(0, 0, R * 0.96, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
          ctx.globalAlpha = 0.95 * fade;                           // λευκός πυρήνας-ακμή
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(0, 0, R, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
          // σπίθες στην αιχμή της λεπίδας
          const tipA = a1;
          const tx = Math.cos(tipA) * R, ty = Math.sin(tipA) * R;
          ctx.globalAlpha = 0.9 * fade; ctx.lineWidth = 1.2;
          for (let q = 0; q < 3; q++) {
            const qa = tipA + (q - 1) * 0.5 + s.side * 0.8;
            ctx.beginPath(); ctx.moveTo(tx, ty);
            ctx.lineTo(tx + Math.cos(qa) * (7 + q * 3), ty + Math.sin(qa) * (7 + q * 3)); ctx.stroke();
          }
          // MIRROR CASCADE: θραύσματα καθρέφτη κατά μήκος του τόξου
          if (s.echo) {
            ctx.fillStyle = '#e8fbff';
            for (let q = 0; q < 5; q++) {
              const qa = a0 + s.side * d.arc * gk * (q + 0.5) / 5;
              const qx = Math.cos(qa) * R * 0.93, qy = Math.sin(qa) * R * 0.93;
              ctx.globalAlpha = (0.35 + 0.3 * Math.sin(rt._t * 12 + q * 2)) * fade;
              ctx.save(); ctx.translate(qx, qy); ctx.rotate(rt._t * 4 + q);
              ctx.fillRect(-2.4, -3.4, 4.8, 6.8); ctx.restore();
            }
          }
        }
      }
      // στιγμή εκκίνησης: γραμμή-στάση στον παίκτη
      if (k < 0.3) {
        ctx.globalAlpha = 0.6 * (1 - k / 0.3);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(s.dir) * 20, Math.sin(s.dir) * 20); ctx.stroke();
      }
      ctx.restore();
    }
  },
};

// ═══ 04 · STORM SASH — κορδέλα-sweep 360° με μεταβλητή ακτίνα + Shock chance ·
//        Cyclone Discipline -> BE_TEMPEST_RIBBON (3 κύματα + κάθετες ανεμοτομές) ═══
WEAPON_DEFS.storm_sash = {
  name: 'Storm Sash', owner: 'taekwondo_girl', category: 'weapon', kind: 'ribbon_sweep',
  damage:   [11, 13, 16, 20, 25],
  cooldown: [1.70, 1.60, 1.45, 1.30, 1.15],
  amount:   [1, 1, 1, 1, 1],
  radius:   [86, 90, 96, 104, 114],                 // μέση ακτίνα (πάλλεται ±30%)
  shockChance: [0.10, 0.12, 0.15, 0.18, 0.22], shockDur: 0.35,
  critChance: 0.05, critMult: 1.5,
  bossMultiplier: 0.80, maxActive: 3,
  tags: ['WIND', 'SHOCK', 'MELEE', 'SWEEP'],
  evolutionPassive: 'cyclone_discipline', evolution: 'be_tempest_ribbon',
  desc: 'A storm ribbon whirls a full circle, its reach breathing in and out. May shock.',
};
PASSIVE_DEFS.cyclone_discipline = {
  name: 'Cyclone Discipline', category: 'evolution_passive', owner: null,
  forWeapon: 'storm_sash', requiredFor: 'be_tempest_ribbon', maxLevel: 3,
  bonuses: [ { sashRadius: 0.10 }, { sashRadius: 0.10, sashShock: 0.05 }, { sashRadius: 0.15, sashShock: 0.08 } ],
  desc: 'The ribbon spins wider and bites with more lightning. Powers the Tempest Ribbon.',
};
EVOLUTION_RECIPES.be_tempest_ribbon = {
  name: 'Tempest Ribbon', weapon: 'storm_sash', passive: 'cyclone_discipline',
  weaponLevel: 5, passiveLevel: 3,
  damage: 30, cooldown: 1.05, radius: 126, waves: 3, wavePhase: 0.14,
  cuts: 4, cutDmg: 22, cutLen: 150, cutW: 12,
  bossMultiplier: 0.75, tags: ['WIND', 'SHOCK', 'SWEEP', 'CUT'],
  desc: 'Three storm waves spiral out at once, then vertical wind cuts slash the compass points.',
};

WEAPON_EXECUTORS.storm_sash = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.storm_sash, evo = EVOLUTION_RECIPES.be_tempest_ribbon;
    const p = rt.game.player;
    w.spins = w.spins || [];
    w.cd -= dt;
    if (w.cd <= 0 && w.spins.length < d.maxActive) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const waves = w.evolved ? evo.waves : 1;
      for (let k = 0; k < waves; k++)
        w.spins.push({ a0: aimAngle(rt), t: -k * (w.evolved ? evo.wavePhase : 0), dur: 0.55, hit: new Set(), trail: [] });
      if (w.evolved) w._cutsAt = 0.5;                             // ανεμοτομές στο τέλος
    }
    if (w.evolved && w._cutsAt !== undefined) {
      w._cutsAt -= dt;
      if (w._cutsAt <= 0) {
        delete w._cutsAt;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, evo.cutLen + 60) : rt.game.enemies;
        for (let c = 0; c < evo.cuts; c++) {
          const ca = c * Math.PI / 2 + Math.PI / 4;
          rt.fx.length < 48 && rt.fx.push({ kind: 'windcut', x: p.pos.x, y: p.pos.y, a: ca, len: evo.cutLen, t: 0, life: 0.3 });
          for (const e of near) {
            if (!e || e.hp <= 0) continue;
            const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y, dist = Math.hypot(dx, dy);
            if (dist > evo.cutLen) continue;
            if (Math.abs(angDiff(Math.atan2(dy, dx), ca)) * dist > evo.cutW + e.radius) continue;
            rt._dealDamage('be_tempest_ribbon', e, evo.cutDmg, evo.bossMultiplier, false);
          }
        }
      }
    }
    const R0 = (w.evolved ? evo.radius : lvl(d, w, 'radius')) * (1 + rt._catalystSum('sashRadius'));
    const shockC = (w.evolved ? 0.25 : lvl(d, w, 'shockChance')) + rt._catalystSum('sashShock');
    for (let i = w.spins.length - 1; i >= 0; i--) {
      const s = w.spins[i]; s.t += dt;
      if (s.t < 0) continue;
      const prog = s.t / s.dur, ang = s.a0 + prog * Math.PI * 2;
      const R = R0 * (0.72 + 0.30 * Math.sin(prog * Math.PI * 4));
      s.trail.push([p.pos.x + Math.cos(ang) * R, p.pos.y + Math.sin(ang) * R]);
      if (s.trail.length > 18) s.trail.shift();
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, R0 * 1.3 + 60) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || s.hit.has(e)) continue;
        const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y, dist = Math.hypot(dx, dy);
        if (dist > R + e.radius + 8) continue;
        if (Math.abs(angDiff(Math.atan2(dy, dx), ang)) > 0.40) continue;
        s.hit.add(e);
        const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage'));
        rt._dealDamage(w.evolved ? 'be_tempest_ribbon' : 'storm_sash', e, dmg,
          w.evolved ? evo.bossMultiplier : d.bossMultiplier, Math.random() < d.critChance);
        if (Math.random() < shockC) rt.applyShock(e, d.shockDur);
      }
      if (prog >= 1) w.spins.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const p = rt.game.player;
    for (const s of (w.spins || [])) {
      if (s.t < 0 || s.trail.length < 2) continue;
      const n = s.trail.length;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // ULTIMATE PASS: κορδέλα με σβήσιμο κατά μήκος (η ουρά λιώνει, η κεφαλή καίει)
      for (let q = 1; q < n; q++) {
        const f = q / (n - 1);                                     // 0=ουρά, 1=κεφαλή
        ctx.globalAlpha = 0.08 + 0.30 * f;                         // halo με gradient ζωής
        ctx.strokeStyle = w.evolved ? '#9fe8ff' : '#3CF0E6';
        ctx.lineWidth = 4 + 9 * f; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.trail[q - 1][0], s.trail[q - 1][1]);
        ctx.lineTo(s.trail[q][0], s.trail[q][1]); ctx.stroke();
        ctx.globalAlpha = 0.25 + 0.70 * f;                         // λευκός πυρήνας
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.6 + 1.4 * f;
        ctx.beginPath(); ctx.moveTo(s.trail[q - 1][0], s.trail[q - 1][1]);
        ctx.lineTo(s.trail[q][0], s.trail[q][1]); ctx.stroke();
      }
      // κεφαλή-κομήτης: λευκό-καυτός πυρήνας + έκλαμψη
      const [hx, hy] = s.trail[n - 1];
      ctx.globalAlpha = 0.5; ctx.fillStyle = w.evolved ? '#9fe8ff' : '#3CF0E6';
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
      // ανεμο-ραβδώσεις: δύο εσωτερικά τόξα που γυρίζουν με τη δίνη
      const prog = s.t / s.dur;
      for (let q = 0; q < 2; q++) {
        const wa = s.a0 + prog * Math.PI * 2 + q * Math.PI;
        ctx.globalAlpha = 0.20;
        ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, 34 + q * 16, wa, wa + 1.1); ctx.stroke();
      }
      ctx.restore();
    }
  },
};

// ═══ 05 · HYDRAULIC KNUCKLE — windup βαριά γροθιά σε γραμμή + ground shockwave ·
//        Pressure Chamber -> BE_FOUNDRY_PISTON (βιομηχανικό έμβολο, λιωμένο μέταλλο) ═══
WEAPON_DEFS.hydraulic_knuckle = {
  name: 'Hydraulic Knuckle', owner: 'cyber_arm_hero', category: 'weapon', kind: 'line_punch',
  damage:   [22, 26, 31, 38, 46],
  cooldown: [1.75, 1.60, 1.45, 1.30, 1.15],
  amount:   [1, 1, 1, 1, 1],
  windup: 0.32, length: 150, width: 36,
  shockwave: { radius: 64, dmgMult: 0.5 },
  critChance: 0.10, critMult: 1.8, knockback: 260,
  bossMultiplier: 0.85, maxActive: 4,
  tags: ['PUNCH', 'MELEE', 'LINE', 'SHOCKWAVE'],
  evolutionPassive: 'pressure_chamber', evolution: 'be_foundry_piston',
  desc: 'A hydraulic haymaker — brief windup, then a piston line with a ground shockwave.',
};
PASSIVE_DEFS.pressure_chamber = {
  name: 'Pressure Chamber', category: 'evolution_passive', owner: null,
  forWeapon: 'hydraulic_knuckle', requiredFor: 'be_foundry_piston', maxLevel: 3,
  bonuses: [ { punchWindup: 0.06 }, { punchWindup: 0.06, punchDmg: 0.10 }, { punchWindup: 0.10, punchDmg: 0.15 } ],
  desc: 'Compressed pressure — faster windup, heavier hit. Powers the Foundry Piston.',
};
EVOLUTION_RECIPES.be_foundry_piston = {
  canBlockHostileProjectiles: true,   // HORDE §14: Piston Rampart τείχος
  name: 'Foundry Piston', weapon: 'hydraulic_knuckle', passive: 'pressure_chamber',
  weaponLevel: 5, passiveLevel: 3,
  damage: 54, cooldown: 1.00, length: 210, width: 44,
  doubleHit: { delay: 0.12, dmgMult: 0.6 },
  melt: { radius: 72, dps: 16, dur: 3.0 },
  bossMultiplier: 0.80, tags: ['PUNCH', 'MELEE', 'LINE', 'BURN'],
  desc: 'An industrial foundry piston — double strike, and molten metal pools where it lands.',
};

WEAPON_EXECUTORS.hydraulic_knuckle = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.hydraulic_knuckle, evo = EVOLUTION_RECIPES.be_foundry_piston;
    const p = rt.game.player;
    w.punches = w.punches || [];
    w.cd -= dt;
    if (w.cd <= 0 && w.punches.length < d.maxActive) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const wind = Math.max(0.10, d.windup - rt._catalystSum('punchWindup'));
      w.punches.push({ dir: aimAngle(rt), t: 0, wind, fired: false, second: false, x: p.pos.x, y: p.pos.y });
    }
    for (let i = w.punches.length - 1; i >= 0; i--) {
      const pu = w.punches[i]; pu.t += dt;
      if (!pu.fired && pu.t >= pu.wind) {
        pu.fired = true; pu.x = p.pos.x; pu.y = p.pos.y;           // εκτόξευση από τρέχουσα θέση
        this._strike(rt, w, pu, 1);
        // HORDE §14 canBlockHostileProjectiles (evolved Piston Rampart): η γροθιά
        // λειτουργεί στιγμιαία ως τείχος για κανονικά εχθρικά bullets.
        if (w.evolved) {
          const L = evo.length;
          (rt.game._projectileBlockers ||= []).push(
            { x: pu.x + Math.cos(pu.dir) * L, y: pu.y + Math.sin(pu.dir) * L, r: 46 });
        }
        if (w.evolved) pu.secondAt = pu.t + evo.doubleHit.delay;
      }
      if (w.evolved && pu.fired && !pu.second && pu.secondAt && pu.t >= pu.secondAt) {
        pu.second = true; this._strike(rt, w, pu, evo.doubleHit.dmgMult);
      }
      if (pu.t >= pu.wind + 0.30) w.punches.splice(i, 1);
    }
  },
  _strike(rt, w, pu, mult) {
    const d = WEAPON_DEFS.hydraulic_knuckle, evo = EVOLUTION_RECIPES.be_foundry_piston;
    const L = w.evolved ? evo.length : d.length, W = (w.evolved ? evo.width : d.width) / 2;
    const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('punchDmg')) * mult;
    const wid = w.evolved ? 'be_foundry_piston' : 'hydraulic_knuckle';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    const ex = pu.x + Math.cos(pu.dir) * L, ey = pu.y + Math.sin(pu.dir) * L;
    const near = rt.game._spatialGrid ? rt.game._spatialGrid.query((pu.x + ex) / 2, (pu.y + ey) / 2, L / 2 + 80) : rt.game.enemies;
    for (const e of near) {
      if (!e || e.hp <= 0) continue;
      const dx = ex - pu.x, dy = ey - pu.y, L2 = dx * dx + dy * dy || 1;
      let t = ((e.pos.x - pu.x) * dx + (e.pos.y - pu.y) * dy) / L2; t = Math.max(0, Math.min(1, t));
      const px = pu.x + t * dx - e.pos.x, py = pu.y + t * dy - e.pos.y;
      const inLine = px * px + py * py < (W + e.radius) * (W + e.radius);
      const inWave = Math.hypot(e.pos.x - ex, e.pos.y - ey) < d.shockwave.radius + e.radius;
      if (!inLine && !inWave) continue;
      rt._dealDamage(wid, e, inLine ? dmg : dmg * d.shockwave.dmgMult, bm, Math.random() < d.critChance);
    }
    if (w.evolved && mult === 1) rt.addBurnPatch(ex, ey, evo.melt.radius, evo.melt.dps, evo.melt.dur, wid, '#ff9b3c');
    if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: ex, y: ey, r: d.shockwave.radius, t: 0, life: 0.28, col: w.evolved ? '#ffb058' : '#FF9B3C' });
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.hydraulic_knuckle, evo = EVOLUTION_RECIPES.be_foundry_piston;
    const p = rt.game.player;
    for (const pu of (w.punches || [])) {
      if (!pu.fired) {                                             // ULTIMATE PASS: υδραυλική συμπίεση
        const k = pu.t / pu.wind;
        ctx.save(); ctx.translate(p.pos.x, p.pos.y); ctx.rotate(pu.dir);
        ctx.globalCompositeOperation = 'lighter';
        for (let ring = 0; ring < 3; ring++) {                     // δακτύλιοι που συγκλίνουν στη γροθιά
          const rk = (k + ring / 3) % 1;
          ctx.globalAlpha = 0.30 * (1 - rk);
          ctx.strokeStyle = '#FF9B3C'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(14, 0, 26 * (1 - rk) + 5, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 0.5 + 0.5 * k;                           // πυρήνας που πυρώνει
        ctx.fillStyle = k > 0.75 ? '#ffffff' : '#ffc888';
        ctx.beginPath(); ctx.arc(14, 0, 3 + 2 * k, 0, Math.PI * 2); ctx.fill();
        ctx.restore(); continue;
      }
      const L = w.evolved ? evo.length : d.length, W = w.evolved ? evo.width : d.width;
      const k = Math.min(1, (pu.t - pu.wind) / 0.12), fade = 1 - Math.max(0, (pu.t - pu.wind - 0.12) / 0.18);
      ctx.save(); ctx.translate(pu.x, pu.y); ctx.rotate(pu.dir);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 * fade;                               // halo βιομηχανικό πορτοκαλί
      ctx.fillStyle = '#FF9B3C'; ctx.fillRect(0, -W * 0.8, L * k, W * 1.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.9 * fade;                                // σώμα: ατσάλινο έμβολο με αρθρώσεις + πριτσίνια
      ctx.fillStyle = '#c8ccd4'; ctx.fillRect(0, -W / 2, L * k, W);
      ctx.strokeStyle = 'rgba(40,44,52,0.8)'; ctx.lineWidth = 1.5;
      for (let seg = 1; seg <= 3; seg++) {
        const sx = (L * k * seg) / 4;
        ctx.beginPath(); ctx.moveTo(sx, -W / 2); ctx.lineTo(sx, W / 2); ctx.stroke();
        ctx.fillStyle = '#7a8290';                                  // πριτσίνια στην άρθρωση
        ctx.beginPath(); ctx.arc(sx, -W * 0.32, 1.6, 0, Math.PI * 2); ctx.arc(sx, W * 0.32, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c8ccd4';
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * fade;                               // ΑΤΜΟΙ ΠΙΕΣΗΣ: εκτονώνονται κάθετα στις αρθρώσεις
      ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 2;
      for (let seg = 1; seg <= 3; seg++) {
        const sx = (L * k * seg) / 4, jl = 6 + 10 * k + seg * 2;
        ctx.beginPath(); ctx.moveTo(sx, -W / 2); ctx.lineTo(sx - 3, -W / 2 - jl); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, W / 2); ctx.lineTo(sx - 3, W / 2 + jl); ctx.stroke();
      }
      if (w.evolved) {                                             // FOUNDRY: λιωμένο μέταλλο στάζει από την κεφαλή
        ctx.globalAlpha = 0.8 * fade; ctx.fillStyle = '#ff7a3c';
        for (let q = 0; q < 3; q++) {
          ctx.beginPath(); ctx.arc(L * k - 4 - q * 7, W / 2 + 2 + ((rt._t * 60 + q * 13) % 8), 1.8, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 0.95 * fade;                               // λευκός πυρήνας
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * k, 0); ctx.stroke();
      ctx.globalAlpha = 0.9 * fade;                                // κεφαλή-σφυρί: λευκή πλάκα κρούσης
      ctx.fillStyle = '#ffffff'; ctx.fillRect(L * k - 3, -W * 0.42, 3.5, W * 0.84);
      ctx.restore();
    }
  },
};

// ═══ 06 · MAGNETIC SHRAPNEL — boomerang θραύσματα που καμπυλώνουν σε elites ·
//        Polarized Core -> BE_FERRO_TEMPEST (μαγνητικός ανεμοστρόβιλος) ═══
WEAPON_DEFS.magnetic_shrapnel = {
  name: 'Magnetic Shrapnel', owner: 'cyber_arm_hero', category: 'weapon', kind: 'boomerang',
  damage:   [10, 12, 15, 18, 22],
  cooldown: [1.55, 1.45, 1.35, 1.20, 1.05],
  amount:   [3, 3, 4, 4, 5],
  range: 300, flyTime: 0.5,
  critChance: 0.07, critMult: 1.6,
  bossMultiplier: 0.85, maxActive: 18,
  tags: ['METAL', 'PROJECTILE', 'BOOMERANG'],
  evolutionPassive: 'polarized_core', evolution: 'be_ferro_tempest',
  desc: 'Jagged magnetic fragments that boomerang back — and curve hungrily toward elites.',
};
PASSIVE_DEFS.polarized_core = {
  name: 'Polarized Core', category: 'evolution_passive', owner: null,
  forWeapon: 'magnetic_shrapnel', requiredFor: 'be_ferro_tempest', maxLevel: 3,
  bonuses: [ { shrapDmg: 0.08 }, { shrapFrag: 1 }, { shrapFrag: 1, shrapDmg: 0.12 } ],
  desc: 'A stronger field — more fragments, harder hits. Powers the Ferro Tempest.',
};
EVOLUTION_RECIPES.be_ferro_tempest = {
  name: 'Ferro Tempest', weapon: 'magnetic_shrapnel', passive: 'polarized_core',
  weaponLevel: 5, passiveLevel: 3,
  damage: 26, cooldown: 0.95, amount: 6,
  tempest: { every: 3, frags: 8, dur: 1.8, maxR: 210, pull: 46, pullR: 130 },
  bossMultiplier: 0.75, tags: ['METAL', 'PROJECTILE', 'TORNADO'],
  desc: 'Every third volley ignites a magnetic tornado of spiralling steel that drags the light in.',
};

WEAPON_EXECUTORS.magnetic_shrapnel = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.magnetic_shrapnel, evo = EVOLUTION_RECIPES.be_ferro_tempest;
    const p = rt.game.player;
    w.frags = w.frags || []; w.storm = w.storm || null; w.volley = w.volley || 0;
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      w.volley++;
      if (w.evolved && w.volley % evo.tempest.every === 0 && !w.storm) {
        w.storm = { t: 0, x: p.pos.x, y: p.pos.y, hit: new Map() };  // hit -> επόμενο επιτρεπτό t ανά εχθρό
      } else {
        const n = Math.min((w.evolved ? evo.amount : lvl(d, w, 'amount')) + rt._catalystSum('shrapFrag'),
                           d.maxActive - w.frags.length);
        const base = aimAngle(rt);
        for (let k = 0; k < n; k++) {
          const a = base + (k - (n - 1) / 2) * 0.38;
          w.frags.push({ a, t: 0, out: true, hit: new Set(), x: p.pos.x, y: p.pos.y,
                         vx: Math.cos(a), vy: Math.sin(a), spin: Math.random() * 6 });
        }
      }
    }
    const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('shrapDmg'));
    const wid = w.evolved ? 'be_ferro_tempest' : 'magnetic_shrapnel';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    // θραύσματα out-and-back με μαγνητική καμπύλωση προς elites
    const speed = d.range / d.flyTime;
    for (let i = w.frags.length - 1; i >= 0; i--) {
      const f = w.frags[i]; f.t += dt; f.spin += dt * 10;
      if (f.out && f.t >= d.flyTime) { f.out = false; f.hit.clear(); }
      if (f.out) {
        let tx = f.vx, ty = f.vy;                                  // καμπύλωση: μείξη προς κοντινό elite
        let bestE = null, bd = 200 * 200;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(f.x, f.y, 200) : rt.game.enemies;
        for (const e of near) { if (e && e.hp > 0 && (e.isElite || (e.rank && e.rank !== 'normal'))) {
          const dd = (e.pos.x - f.x) ** 2 + (e.pos.y - f.y) ** 2; if (dd < bd) { bd = dd; bestE = e; } } }
        if (bestE) {
          const ma = Math.atan2(bestE.pos.y - f.y, bestE.pos.x - f.x);
          const cur = Math.atan2(ty, tx), na = cur + angDiff(ma, cur) * 3 * dt;
          f.vx = Math.cos(na); f.vy = Math.sin(na);
        }
        f.x += f.vx * speed * dt; f.y += f.vy * speed * dt;
      } else {
        const dx = p.pos.x - f.x, dy = p.pos.y - f.y, dist = Math.hypot(dx, dy);
        if (dist < 24) { w.frags.splice(i, 1); continue; }
        f.x += (dx / dist) * speed * 1.15 * dt; f.y += (dy / dist) * speed * 1.15 * dt;
      }
      const near2 = rt.game._spatialGrid ? rt.game._spatialGrid.query(f.x, f.y, 60) : rt.game.enemies;
      for (const e of near2) {
        if (!e || e.hp <= 0 || f.hit.has(e)) continue;
        if ((e.pos.x - f.x) ** 2 + (e.pos.y - f.y) ** 2 > (9 + e.radius) ** 2) continue;
        f.hit.add(e);
        rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
      }
    }
    // FERRO TEMPEST tornado
    if (w.storm) {
      const s = w.storm; s.t += dt;
      const prog = s.t / evo.tempest.dur, R = 30 + (evo.tempest.maxR - 30) * prog;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(s.x, s.y, R + 80) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0) continue;
        const dist = Math.hypot(e.pos.x - s.x, e.pos.y - s.y);
        if (!e.isBoss?.() && !e.isMegaBoss && !e.isElite && dist < evo.tempest.pullR + R * 0.4) {
          const pk = evo.tempest.pull * dt / Math.max(1, dist);    // απαλή έλξη προς το κέντρο
          e.pos.x -= (e.pos.x - s.x) * pk; e.pos.y -= (e.pos.y - s.y) * pk;
        }
        if (Math.abs(dist - R) < 26 + e.radius) {
          const okAt = s.hit.get(e) || 0;
          if (s.t >= okAt) { s.hit.set(e, s.t + 0.35); rt._dealDamage(wid, e, dmg * 0.8, bm, false); }
        }
      }
      if (s.t >= evo.tempest.dur) w.storm = null;
    }
  },
  draw(rt, ctx, w) {
    const evo = EVOLUTION_RECIPES.be_ferro_tempest;
    for (const f of (w.frags || [])) {
      // ULTIMATE PASS: trail πολικότητας (πορτοκαλί έξω / κυανό επιστροφή)
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let gh = 2; gh >= 1; gh--) {
        ctx.globalAlpha = 0.10 * (3 - gh);
        ctx.fillStyle = f.out ? '#FF9B3C' : '#7fd8ff';
        ctx.beginPath(); ctx.arc(f.x - f.vx * 9 * gh, f.y - f.vy * 9 * gh, 5 - gh, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.spin);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.28 + 0.08 * Math.sin(rt._t * 16);        // μαγνητικό halo που πάλλεται
      ctx.fillStyle = f.out ? '#FF9B3C' : '#7fd8ff';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35;                                      // ΓΡΑΜΜΕΣ ΠΕΔΙΟΥ: δύο μικρά τόξα γύρω από το θραύσμα
      ctx.strokeStyle = f.out ? '#ffcf9b' : '#bfefff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0.4, 2.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 7.5, Math.PI + 0.4, Math.PI + 2.2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;                                         // σώμα: πριονωτό θραύσμα
      ctx.fillStyle = '#c8ccd4';
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-2, 4); ctx.lineTo(-5, 0); ctx.lineTo(-2, -4); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9;                                       // λευκός πυρήνας
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (w.storm) {
      const s = w.storm, prog = s.t / evo.tempest.dur, R = 30 + (evo.tempest.maxR - 30) * prog, fade = 1 - prog * 0.6;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let arm = 0; arm < 3; arm++) {                          // σπειροειδείς βραχίονες
        ctx.globalAlpha = 0.30 * fade;
        ctx.strokeStyle = '#FF9B3C'; ctx.lineWidth = 5;
        ctx.beginPath();
        for (let q = 0; q <= 10; q++) {
          const qa = s.t * 4 + arm * (Math.PI * 2 / 3) + q * 0.28, qr = R * (q / 10);
          const qx = s.x + Math.cos(qa) * qr, qy = s.y + Math.sin(qa) * qr;
          q === 0 ? ctx.moveTo(qx, qy) : ctx.lineTo(qx, qy);
        }
        ctx.stroke();
      }
      for (let arm = 0; arm < 2; arm++) {                          // ΑΝΤΙΘΕΤΟΙ εσωτερικοί βραχίονες (κυανοί)
        ctx.globalAlpha = 0.22 * fade;
        ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let q = 0; q <= 8; q++) {
          const qa = -s.t * 5 + arm * Math.PI + q * 0.33, qr = R * 0.6 * (q / 8);
          const qx = s.x + Math.cos(qa) * qr, qy = s.y + Math.sin(qa) * qr;
          q === 0 ? ctx.moveTo(qx, qy) : ctx.lineTo(qx, qy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 0.7 * fade;                                // ΣΥΝΤΡΙΜΜΙΑ: ατσάλινα θραύσματα στη δίνη
      ctx.fillStyle = '#c8ccd4';
      for (let q = 0; q < 8; q++) {
        const qa = s.t * 6 + q * (Math.PI * 2 / 8), qr = R * (0.4 + 0.5 * ((q * 37) % 10) / 10);
        ctx.save(); ctx.translate(s.x + Math.cos(qa) * qr, s.y + Math.sin(qa) * qr); ctx.rotate(qa * 3);
        ctx.fillRect(-2.5, -1.2, 5, 2.4); ctx.restore();
      }
      ctx.globalAlpha = 0.85 * fade;                               // λευκή εξωτερική ακμή
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },
};

export const BE_CHARS1 = ['vector_heel', 'storm_sash', 'hydraulic_knuckle', 'magnetic_shrapnel'];
