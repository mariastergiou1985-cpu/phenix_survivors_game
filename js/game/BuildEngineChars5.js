// ═══════════════════════════════════════════════════════════════════════════════
// P2.5 — BUILD ENGINE universal όπλα 21-25 (owner: null — προσφέρονται σε ΟΛΟΥΣ):
// Null Lance · Ion Halo · Gravity Core · Nano Mine · Blacknet Swarm Drone
// + 5 catalysts + 5 evolutions (be_*). Spec: docs/P2_BUILD_ENGINE_SPEC_GR.md
// ΣΗΜΕΙΩΣΗ IDs: τα null_lance/ion_halo του ΠΑΛΙΟΥ WeaponCatalog είναι άλλα αντικείμενα
// (old-gen evolutions) — εδώ ζουν σε ξεχωριστό namespace (WEAPON_DEFS) μέχρι το P2.7.
// Συνταγή ultimates: halo -> σώμα -> λευκός πυρήνας, lighter, caps, ΚΑΝΕΝΑ PNG.
// ═══════════════════════════════════════════════════════════════════════════════
import { WEAPON_DEFS, PASSIVE_DEFS, EVOLUTION_RECIPES, WEAPON_EXECUTORS }
  from './BuildEngine.js?v=20260718500000';

function aimAngle(rt) {
  const p = rt.game.player, e = rt._nearestEnemy(p.pos.x, p.pos.y);
  if (e) return Math.atan2(e.pos.y - p.pos.y, e.pos.x - p.pos.x);
  return (p._facing || 1) > 0 ? 0 : Math.PI;
}
function lvl(def, w, key) { const i = Math.min(w.level - 1, 4); return def[key][i]; }
function segHit(ax, ay, bx, by, e, halfW) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  let t = ((e.pos.x - ax) * dx + (e.pos.y - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx - e.pos.x, py = ay + t * dy - e.pos.y;
  return px * px + py * py < (halfW + e.radius) * (halfW + e.radius);
}
const noCC = e => e.isBoss?.() || e.isMegaBoss;
const isRangedOrElite = e => e.isElite || !!e.shootInterval || (e.rank && e.rank !== 'normal');

// ═══ 21 · NULL LANCE — γραμμή-pierce, bonus σε μακρινούς, rift στο τέλος ·
//        Collapsed Horizon -> BE_EVENTIDE_IMPALER (rift που τραβά ΣΤΗ γραμμή) ═══
WEAPON_DEFS.null_lance = {
  name: 'Null Lance', owner: null, category: 'weapon', kind: 'line_pierce',
  damage:   [15, 18, 22, 27, 33],
  cooldown: [1.50, 1.40, 1.28, 1.16, 1.05],
  amount:   [1, 1, 1, 1, 1],
  range: 380, width: 14, farFrom: 0.6, farBonus: 0.30,
  rift: { dur: 0.6, radius: 70, pull: 34, tickDmg: 6 },
  critChance: 0.08, critMult: 1.7,
  bossMultiplier: 0.85, maxActive: 3,
  tags: ['NULL', 'PROJECTILE', 'LINE', 'RIFT'],
  evolutionPassive: 'collapsed_horizon', evolution: 'be_eventide_impaler',
  desc: 'A lance of pure null — it bites hardest at range and tears a rift where it ends.',
};
PASSIVE_DEFS.collapsed_horizon = {
  name: 'Collapsed Horizon', category: 'evolution_passive', owner: null,
  forWeapon: 'null_lance', requiredFor: 'be_eventide_impaler', maxLevel: 3,
  bonuses: [ { lanceRange: 0.10 }, { lanceRange: 0.10, riftPull: 0.25 }, { lanceRange: 0.15, riftPull: 0.40 } ],
  desc: 'The horizon folds along the shaft. Powers the Eventide Impaler.',
};
EVOLUTION_RECIPES.be_eventide_impaler = {
  name: 'Eventide Impaler', weapon: 'null_lance', passive: 'collapsed_horizon',
  weaponLevel: 5, passiveLevel: 3,
  damage: 40, cooldown: 0.95, range: 440,
  impale: { pull: 90, reDelay: 0.30, reDmg: 0.7 },   // το rift τραβά ΠΑΝΩ στη γραμμή + 2ο pierce
  bossMultiplier: 0.80, tags: ['NULL', 'PROJECTILE', 'LINE', 'RIFT', 'IMPALE'],
  desc: 'The rift drags everything onto the shaft — then the lance runs them through again.',
};

WEAPON_EXECUTORS.null_lance = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.null_lance, evo = EVOLUTION_RECIPES.be_eventide_impaler;
    const p = rt.game.player;
    w.lances = w.lances || []; w.rifts = w.rifts || [];
    w.cd -= dt;
    if (w.cd <= 0 && w.lances.length < d.maxActive) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const R = (w.evolved ? evo.range : d.range) * (1 + rt._catalystSum('lanceRange'));
      w.lances.push({ a: aimAngle(rt), R, t: 0, x: p.pos.x, y: p.pos.y, fired: false, re: false });
    }
    const dmgBase = w.evolved ? evo.damage : lvl(d, w, 'damage');
    const wid = w.evolved ? 'be_eventide_impaler' : 'null_lance';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    const pierceLine = (ln, mult) => {
      const ex = ln.x + Math.cos(ln.a) * ln.R, ey = ln.y + Math.sin(ln.a) * ln.R;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query((ln.x + ex) / 2, (ln.y + ey) / 2, ln.R / 2 + 80) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0) continue;
        if (!segHit(ln.x, ln.y, ex, ey, e, d.width / 2)) continue;
        const dist = Math.hypot(e.pos.x - ln.x, e.pos.y - ln.y);
        const dmg = dmgBase * mult * (dist > ln.R * d.farFrom ? 1 + d.farBonus : 1);   // bonus σε μακρινούς
        rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
      }
      return [ex, ey];
    };
    for (let i = w.lances.length - 1; i >= 0; i--) {
      const ln = w.lances[i]; ln.t += dt;
      if (!ln.fired && ln.t >= 0.05) {
        ln.fired = true;
        const [ex, ey] = pierceLine(ln, 1);
        w.rifts.push({ x: ex, y: ey, t: 0, ln: w.evolved ? { ...ln } : null });
        if (w.rifts.length > 4) w.rifts.shift();
      }
      if (w.evolved && ln.fired && !ln.re && ln.t >= 0.05 + evo.impale.reDelay) {   // 2ο pierce
        ln.re = true; pierceLine(ln, evo.impale.reDmg);
      }
      if (ln.t >= 0.45) w.lances.splice(i, 1);
    }
    const riftPull = (w.evolved ? evo.impale.pull : d.rift.pull) * (1 + rt._catalystSum('riftPull'));
    for (let i = w.rifts.length - 1; i >= 0; i--) {
      const rf = w.rifts[i]; rf.t += dt;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(rf.x, rf.y, d.rift.radius + 70) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || noCC(e)) continue;
        if (rf.ln) {                                               // IMPALER: έλξη ΠΑΝΩ στη γραμμή
          const dx = Math.cos(rf.ln.a), dy = Math.sin(rf.ln.a);
          const relx = e.pos.x - rf.ln.x, rely = e.pos.y - rf.ln.y;
          const along = relx * dx + rely * dy;
          const lx = rf.ln.x + dx * Math.max(0, Math.min(rf.ln.R, along)), ly = rf.ln.y + dy * Math.max(0, Math.min(rf.ln.R, along));
          const ddist = Math.hypot(e.pos.x - lx, e.pos.y - ly);
          if (ddist < 120 && ddist > 2) { e.pos.x -= (e.pos.x - lx) / ddist * riftPull * dt; e.pos.y -= (e.pos.y - ly) / ddist * riftPull * dt; }
        } else {
          const ddist = Math.hypot(e.pos.x - rf.x, e.pos.y - rf.y);
          if (ddist < d.rift.radius && ddist > 2) { e.pos.x -= (e.pos.x - rf.x) / ddist * riftPull * dt; e.pos.y -= (e.pos.y - rf.y) / ddist * riftPull * dt; }
        }
      }
      if (rf.t >= d.rift.dur) w.rifts.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.null_lance;
    for (const ln of (w.lances || [])) {
      const fade = 1 - ln.t / 0.45;
      const ex = ln.x + Math.cos(ln.a) * ln.R, ey = ln.y + Math.sin(ln.a) * ln.R;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 * fade;                               // null-violet halo
      ctx.strokeStyle = '#7a5cff'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(ln.x, ln.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = 0.55 * fade;                               // σκοτεινό σώμα λόγχης
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#14102a'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(ln.x, ln.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.95 * fade;                               // λευκός πυρήνας
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ln.x, ln.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
    }
    for (const rf of (w.rifts || [])) {
      const k = rf.t / d.rift.dur, fade = 1 - k;
      ctx.save(); ctx.translate(rf.x, rf.y); ctx.rotate(rf.t * 5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * fade;                               // rift: σπασμένος δακτύλιος
      ctx.strokeStyle = '#7a5cff'; ctx.lineWidth = 4;
      for (let q = 0; q < 3; q++) { const qa = q * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(0, 0, d.rift.radius * (0.5 + 0.4 * k), qa, qa + 1.4); ctx.stroke(); }
      ctx.globalAlpha = 0.5 * fade;                                // ΕΙΣΡΟΗ: ραβδώσεις που ρουφιούνται στο κέντρο
      ctx.strokeStyle = '#b8a4ff'; ctx.lineWidth = 1.2;
      for (let q = 0; q < 6; q++) {
        const qa = q * Math.PI / 3 + rf.t * 3, fall = 1 - ((rf.t * 2.4 + q * 0.17) % 1);
        ctx.beginPath(); ctx.moveTo(Math.cos(qa) * d.rift.radius * fall, Math.sin(qa) * d.rift.radius * fall);
        ctx.lineTo(Math.cos(qa) * d.rift.radius * Math.max(0, fall - 0.22), Math.sin(qa) * d.rift.radius * Math.max(0, fall - 0.22)); ctx.stroke();
      }
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
};

// ═══ 22 · ION HALO — orbit με μεταβλητή ακτίνα, hits = charge -> chain lightning ·
//        Conductive Crown -> BE_SOVEREIGN_ION_HALO (ομόκεντροι + θόλος) ═══
WEAPON_DEFS.ion_halo = {
  name: 'Ion Halo', owner: null, category: 'weapon', kind: 'orbit_variable',
  damage:   [8, 10, 12, 15, 19],
  cooldown: [0, 0, 0, 0, 0],                        // μόνιμο halo
  amount:   [1, 1, 1, 1, 1],
  rMin: 70, rMax: 130, breathe: 2.4, touchTick: 0.4,
  charge: { perHit: 1, full: 12, chainTargets: 4, chainDmg: 22, chainRange: 200 },
  critChance: 0.06, critMult: 1.5,
  bossMultiplier: 0.80, maxActive: 2,
  tags: ['ION', 'ORBIT', 'LIGHTNING'],
  evolutionPassive: 'conductive_crown', evolution: 'be_sovereign_ion_halo',
  desc: 'A breathing ring of ions — every touch charges it toward a chain-lightning burst.',
};
PASSIVE_DEFS.conductive_crown = {
  name: 'Conductive Crown', category: 'evolution_passive', owner: null,
  forWeapon: 'ion_halo', requiredFor: 'be_sovereign_ion_halo', maxLevel: 3,
  bonuses: [ { haloDmg: 0.10 }, { haloDmg: 0.10, haloCharge: 1 }, { haloDmg: 0.15, haloCharge: 2 } ],
  desc: 'A crown that conducts. Powers the Sovereign Ion Halo.',
};
EVOLUTION_RECIPES.be_sovereign_ion_halo = {
  name: 'Sovereign Ion Halo', weapon: 'ion_halo', passive: 'conductive_crown',
  weaponLevel: 5, passiveLevel: 3,
  damage: 24, rings: 2,
  dome: { every: 3.0, radius: 150, dmg: 30 },
  bossMultiplier: 0.75, tags: ['ION', 'ORBIT', 'LIGHTNING', 'DOME'],
  desc: 'Two concentric sovereign rings — and every few breaths, a dome of ions slams down.',
};

WEAPON_EXECUTORS.ion_halo = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.ion_halo, evo = EVOLUTION_RECIPES.be_sovereign_ion_halo;
    const p = rt.game.player;
    w.ph = (w.ph || 0) + dt; w.charge = w.charge || 0; w.hitOk = w.hitOk || new Map();
    w.bolts = w.bolts || []; w.domeT = (w.domeT ?? evo.dome.every);
    const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('haloDmg'));
    const wid = w.evolved ? 'be_sovereign_ion_halo' : 'ion_halo';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    const rings = w.evolved ? evo.rings : 1;
    const breathe = (Math.sin(w.ph * (Math.PI * 2 / d.breathe)) + 1) / 2;   // 0..1
    w.radii = [];
    for (let ring = 0; ring < rings; ring++) {
      const R = d.rMin + (d.rMax - d.rMin) * breathe - ring * 34;
      if (R < 30) continue;
      w.radii.push(R);
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, R + 70) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0) continue;
        const dist = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
        if (Math.abs(dist - R) > 12 + e.radius) continue;          // αγγίζει το δαχτυλίδι
        const okAt = w.hitOk.get(e) || 0;
        if (w.ph < okAt) continue;
        w.hitOk.set(e, w.ph + d.touchTick);
        rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
        w.charge += d.charge.perHit + rt._catalystSum('haloCharge');
      }
    }
    if (w.charge >= d.charge.full) {                               // CHAIN LIGHTNING στο γέμισμα
      w.charge = 0;
      let from = { x: p.pos.x, y: p.pos.y };
      const hitSet = new Set();
      for (let hop = 0; hop < d.charge.chainTargets; hop++) {
        let best = null, bd = d.charge.chainRange ** 2;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(from.x, from.y, d.charge.chainRange) : rt.game.enemies;
        for (const e of near) { if (e && e.hp > 0 && !hitSet.has(e)) {
          const dd = (e.pos.x - from.x) ** 2 + (e.pos.y - from.y) ** 2; if (dd < bd) { bd = dd; best = e; } } }
        if (!best) break;
        hitSet.add(best);
        rt._dealDamage(wid, best, d.charge.chainDmg, bm, false);
        w.bolts.push({ x1: from.x, y1: from.y, x2: best.pos.x, y2: best.pos.y, t: 0 });
        from = { x: best.pos.x, y: best.pos.y };
      }
      if (w.bolts.length > 8) w.bolts.splice(0, w.bolts.length - 8);
    }
    for (let i = w.bolts.length - 1; i >= 0; i--) { w.bolts[i].t += dt; if (w.bolts[i].t >= 0.22) w.bolts.splice(i, 1); }
    // SOVEREIGN DOME
    if (w.evolved) {
      w.domeT -= dt;
      if (w.domeT <= 0) {
        w.domeT = evo.dome.every;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, evo.dome.radius + 60) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) > evo.dome.radius + e.radius) continue;
          rt._dealDamage(wid, e, evo.dome.dmg, bm, false);
        }
        if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: p.pos.x, y: p.pos.y, r: evo.dome.radius, t: 0, life: 0.45, col: '#4fd8ff' });
      }
    }
    // καθάρισμα νεκρών από το hitOk map (bounded)
    if (w.hitOk.size > 120) w.hitOk.clear();
  },
  draw(rt, ctx, w) {
    const p = rt.game.player;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const R of (w.radii || [])) {
      ctx.globalAlpha = 0.26;                                      // ion halo
      ctx.strokeStyle = '#4fd8ff'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.85;                                      // λευκός πυρήνας-δακτύλιος
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, R, 0, Math.PI * 2); ctx.stroke();
      // ιόντα που τρέχουν στο δαχτυλίδι
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#bfefff';
      for (let q = 0; q < 5; q++) { const qa = w.ph * 2.4 + q * (Math.PI * 2 / 5);
        ctx.beginPath(); ctx.arc(p.pos.x + Math.cos(qa) * R, p.pos.y + Math.sin(qa) * R, 2, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const b of (w.bolts || [])) {
      const fade = 1 - b.t / 0.22;
      ctx.globalAlpha = 0.35 * fade; ctx.strokeStyle = '#4fd8ff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo((b.x1 + b.x2) / 2 + 8, (b.y1 + b.y2) / 2 - 8); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.globalAlpha = 0.95 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo((b.x1 + b.x2) / 2 + 8, (b.y1 + b.y2) / 2 - 8); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    // SOVEREIGN: κροτάλισμα ανάμεσα στους δύο ομόκεντρους δακτυλίους
    if (w.evolved && (w.radii || []).length >= 2) {
      const cka = rt._t * 7 % (Math.PI * 2);
      const r1 = w.radii[0], r2 = w.radii[1];
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(rt._t * 23);
      ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(p.pos.x + Math.cos(cka) * r2, p.pos.y + Math.sin(cka) * r2);
      ctx.lineTo(p.pos.x + Math.cos(cka + 0.18) * ((r1 + r2) / 2), p.pos.y + Math.sin(cka + 0.18) * ((r1 + r2) / 2));
      ctx.lineTo(p.pos.x + Math.cos(cka + 0.32) * r1, p.pos.y + Math.sin(cka + 0.32) * r1); ctx.stroke();
    }
    ctx.restore();
  },
};

// ═══ 23 · GRAVITY CORE — έλξη + compression ticks, ΟΧΙ CC σε bosses ·
//        Mass Inverter -> BE_BLACK_SUN_ENGINE (έλξη/απώθηση εναλλάξ) ═══
WEAPON_DEFS.gravity_core = {
  name: 'Gravity Core', owner: null, category: 'weapon', kind: 'gravity_zone',
  damage:   [7, 9, 11, 14, 17],                     // ανά compression tick
  cooldown: [2.40, 2.25, 2.10, 1.95, 1.80],
  amount:   [1, 1, 1, 1, 1],
  radius: 110, pull: 56, dur: 1.6, ticks: 4,
  critChance: 0.05, critMult: 1.5,
  bossMultiplier: 0.80, maxActive: 2,
  tags: ['GRAVITY', 'ZONE', 'PULL'],
  evolutionPassive: 'mass_inverter', evolution: 'be_black_sun_engine',
  desc: 'A core of compressed gravity — it drags them in and crushes in slow pulses.',
};
PASSIVE_DEFS.mass_inverter = {
  name: 'Mass Inverter', category: 'evolution_passive', owner: null,
  forWeapon: 'gravity_core', requiredFor: 'be_black_sun_engine', maxLevel: 3,
  bonuses: [ { coreRadius: 0.12 }, { coreRadius: 0.12, coreTick: 0.10 }, { coreRadius: 0.18, coreTick: 0.15 } ],
  desc: 'Mass is a suggestion. Powers the Black Sun Engine.',
};
EVOLUTION_RECIPES.be_black_sun_engine = {
  name: 'Black Sun Engine', weapon: 'gravity_core', passive: 'mass_inverter',
  weaponLevel: 5, passiveLevel: 3,
  damage: 20, cooldown: 1.60, radius: 140, dur: 2.2,
  burst: { dmg: 36, push: 240 },                    // φάση απώθησης στο τέλος
  bossMultiplier: 0.75, tags: ['GRAVITY', 'ZONE', 'PULL', 'PUSH'],
  desc: 'A black sun that inhales — then detonates outward, hurling everything away.',
};

WEAPON_EXECUTORS.gravity_core = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.gravity_core, evo = EVOLUTION_RECIPES.be_black_sun_engine;
    const p = rt.game.player;
    w.cores = w.cores || [];
    w.cd -= dt;
    if (w.cd <= 0 && w.cores.length < d.maxActive) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      // deploy στο κέντρο βάρους των 3 κοντινότερων
      const cand = [];
      for (const e of rt.game.enemies) {
        if (!e || e.hp <= 0) continue;
        const dd = (e.pos.x - p.pos.x) ** 2 + (e.pos.y - p.pos.y) ** 2;
        if (dd < 420 * 420) cand.push([dd, e]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      if (cand.length) {
        const top = cand.slice(0, 3).map(c => c[1]);
        const cx = top.reduce((s, e) => s + e.pos.x, 0) / top.length;
        const cy = top.reduce((s, e) => s + e.pos.y, 0) / top.length;
        w.cores.push({ x: cx, y: cy, t: 0, next: 0, ticksDone: 0, burstDone: false });
      }
    }
    const R = (w.evolved ? evo.radius : d.radius) * (1 + rt._catalystSum('coreRadius'));
    const dur = w.evolved ? evo.dur : d.dur;
    const tickDmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('coreTick'));
    const wid = w.evolved ? 'be_black_sun_engine' : 'gravity_core';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.cores.length - 1; i >= 0; i--) {
      const c = w.cores[i]; c.t += dt; c.next -= dt;
      const pulling = !w.evolved || c.t < dur * 0.75;              // BLACK SUN: pull -> push
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(c.x, c.y, R + 80) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || noCC(e)) continue;                  // ΟΧΙ CC σε bosses
        const dist = Math.hypot(e.pos.x - c.x, e.pos.y - c.y);
        if (dist > R || dist < 3) continue;
        if (pulling) { e.pos.x -= (e.pos.x - c.x) / dist * d.pull * dt; e.pos.y -= (e.pos.y - c.y) / dist * d.pull * dt; }
      }
      if (c.next <= 0 && c.ticksDone < d.ticks) {                  // compression tick
        c.next = dur / d.ticks; c.ticksDone++;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          if (Math.hypot(e.pos.x - c.x, e.pos.y - c.y) > R * 0.7 + e.radius) continue;
          rt._dealDamage(wid, e, tickDmg, bm, Math.random() < d.critChance);
        }
      }
      if (w.evolved && !c.burstDone && c.t >= dur * 0.75) {        // BLACK SUN burst
        c.burstDone = true;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          const dist = Math.hypot(e.pos.x - c.x, e.pos.y - c.y);
          if (dist > R + e.radius) continue;
          rt._dealDamage(wid, e, evo.burst.dmg, bm, false);
          if (!noCC(e) && dist > 2) { e.pos.x += (e.pos.x - c.x) / dist * evo.burst.push * 0.14; e.pos.y += (e.pos.y - c.y) / dist * evo.burst.push * 0.14; }
        }
        if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: c.x, y: c.y, r: R, t: 0, life: 0.4, col: '#9a6bff' });
      }
      if (c.t >= dur) w.cores.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.gravity_core, evo = EVOLUTION_RECIPES.be_black_sun_engine;
    const R0 = (w.evolved ? evo.radius : d.radius) * (1 + rt._catalystSum('coreRadius'));
    const dur = w.evolved ? evo.dur : d.dur;
    for (const c of (w.cores || [])) {
      const k = c.t / dur, fade = 1 - Math.max(0, (k - 0.8) / 0.2);
      ctx.save(); ctx.translate(c.x, c.y);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.75 * fade;                               // μαύρος πυρήνας
      ctx.fillStyle = '#0a0614';
      ctx.beginPath(); ctx.arc(0, 0, 12 + 4 * Math.sin(c.t * 9), 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 * fade;                               // violet δίσκος προσαύξησης
      ctx.strokeStyle = '#9a6bff'; ctx.lineWidth = 3;
      for (let q = 0; q < 3; q++) {
        const qr = R0 * (0.35 + 0.22 * q) * (1 - 0.25 * Math.sin(c.t * 4 + q));
        ctx.beginPath(); ctx.arc(0, 0, qr, c.t * (2 + q), c.t * (2 + q) + 4.6); ctx.stroke();
      }
      ctx.globalAlpha = 0.10 * fade;                               // ΒΑΡΥΤΙΚΟΣ ΦΑΚΟΣ: λεπτός κύκλος παραμόρφωσης
      ctx.strokeStyle = '#e6d5ff'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(0, 0, R0 * 0.92, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.65 * fade;                               // ΥΛΗ που πέφτει σπειροειδώς στον πυρήνα
      ctx.fillStyle = '#c8a8ff';
      for (let q = 0; q < 7; q++) {
        const fall = 1 - ((c.t * 1.6 + q * 0.143) % 1);
        const qa = q * 0.9 + c.t * 5 + fall * 4;
        ctx.beginPath(); ctx.arc(Math.cos(qa) * R0 * 0.85 * fall, Math.sin(qa) * R0 * 0.85 * fall, 1.5 + fall, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 0.9 * fade;                                // λευκό χείλος πυρήνα
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, 0, 13 + 4 * Math.sin(c.t * 9), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },
};

// ═══ 24 · NANO MINE — proximity, κώνος nanites, links μεταξύ τους, cap ·
//        Replicator Gel -> BE_GREY_GOO_MINEFIELD (mini-mines + shred) ═══
WEAPON_DEFS.nano_mine = {
  name: 'Nano Mine', owner: null, category: 'weapon', kind: 'proximity_mine',
  damage:   [16, 19, 23, 28, 34],
  cooldown: [1.90, 1.75, 1.62, 1.50, 1.38],
  amount:   [1, 1, 1, 1, 1],
  cap: [3, 3, 4, 5, 6], triggerR: 60,
  cone: { radius: 96, arc: 1.2 },
  link: { range: 150, tickDmg: 4, tick: 0.4 },
  critChance: 0.07, critMult: 1.6,
  bossMultiplier: 0.85, maxActive: 12,
  tags: ['NANO', 'MINE', 'ZONE', 'LINK'],
  evolutionPassive: 'replicator_gel', evolution: 'be_grey_goo_minefield',
  desc: 'Proximity mines that erupt in nanite cones — and lace killing threads between them.',
};
PASSIVE_DEFS.replicator_gel = {
  name: 'Replicator Gel', category: 'evolution_passive', owner: null,
  forWeapon: 'nano_mine', requiredFor: 'be_grey_goo_minefield', maxLevel: 3,
  bonuses: [ { mineDmg: 0.10 }, { mineDmg: 0.10, mineCap: 1 }, { mineDmg: 0.15, mineCap: 2 } ],
  desc: 'The gel remembers how to multiply. Powers the Grey-Goo Minefield.',
};
EVOLUTION_RECIPES.be_grey_goo_minefield = {
  name: 'Grey-Goo Minefield', weapon: 'nano_mine', passive: 'replicator_gel',
  weaponLevel: 5, passiveLevel: 3,
  damage: 42, cooldown: 1.10, cap: 8,
  mini: { count: 2, dmgMult: 0.6 },                 // η έκρηξη γεννά mini-mines (χωρίς αναπαραγωγή)
  shredDur: 3.0,                                    // nanite shred: +15% BuildEngine dmg
  bossMultiplier: 0.80, tags: ['NANO', 'MINE', 'ZONE', 'SHRED'],
  desc: 'Every blast seeds mini-mines, and the goo strips armor down to grey dust.',
};

WEAPON_EXECUTORS.nano_mine = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.nano_mine, evo = EVOLUTION_RECIPES.be_grey_goo_minefield;
    const p = rt.game.player;
    w.mines = w.mines || []; w.linkT = (w.linkT || 0) - dt;
    w.cd -= dt;
    const cap = (w.evolved ? evo.cap : lvl(d, w, 'cap')) + rt._catalystSum('mineCap');
    if (w.cd <= 0 && w.mines.length < Math.min(cap, d.maxActive)) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      w.mines.push({ x: p.pos.x, y: p.pos.y, t: 0, armT: 0.35, mini: false });
    }
    const dmgBase = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('mineDmg'));
    const wid = w.evolved ? 'be_grey_goo_minefield' : 'nano_mine';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    const explode = (m) => {
      const tgt = rt._nearestEnemy(m.x, m.y, 220);
      const dir = tgt ? Math.atan2(tgt.pos.y - m.y, tgt.pos.x - m.x) : Math.random() * Math.PI * 2;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(m.x, m.y, d.cone.radius + 70) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0) continue;
        const dx = e.pos.x - m.x, dy = e.pos.y - m.y, dist = Math.hypot(dx, dy);
        if (dist > d.cone.radius + e.radius) continue;
        let da = Math.atan2(dy, dx) - dir; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) > d.cone.arc / 2 && dist > d.triggerR) continue;   // κώνος + μικρή σφαίρα γύρω
        rt._dealDamage(wid, e, dmgBase * (m.mini ? evo.mini.dmgMult : 1), bm, Math.random() < d.critChance);
        if (w.evolved) { const st = rt._st(e); st.shred = evo.shredDur; }    // GREY GOO shred
      }
      if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: m.x, y: m.y, r: d.cone.radius * 0.7, t: 0, life: 0.3, col: '#9dff6b' });
      if (w.evolved && !m.mini)                                    // γεννά mini-mines
        for (let k = 0; k < evo.mini.count && w.mines.length < d.maxActive; k++)
          w.mines.push({ x: m.x + (Math.random() - 0.5) * 70, y: m.y + (Math.random() - 0.5) * 70, t: 0, armT: 0.4, mini: true });
    };
    for (let i = w.mines.length - 1; i >= 0; i--) {
      const m = w.mines[i]; m.t += dt; m.armT -= dt;
      if (m.armT > 0) continue;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(m.x, m.y, d.triggerR + 60) : rt.game.enemies;
      let triggered = false;
      for (const e of near) {
        if (!e || e.hp <= 0) continue;
        if ((e.pos.x - m.x) ** 2 + (e.pos.y - m.y) ** 2 < (d.triggerR + e.radius) ** 2) { triggered = true; break; }
      }
      if (triggered) { explode(m); w.mines.splice(i, 1); }
    }
    // laser links μεταξύ γειτονικών ναρκών
    if (w.linkT <= 0) {
      w.linkT = d.link.tick;
      for (let a = 0; a < w.mines.length; a++) for (let b = a + 1; b < w.mines.length; b++) {
        const mA = w.mines[a], mB = w.mines[b];
        if (mA.armT > 0 || mB.armT > 0) continue;
        if ((mA.x - mB.x) ** 2 + (mA.y - mB.y) ** 2 > d.link.range ** 2) continue;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query((mA.x + mB.x) / 2, (mA.y + mB.y) / 2, d.link.range) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          if (!segHit(mA.x, mA.y, mB.x, mB.y, e, 6)) continue;
          rt._dealDamage(wid, e, d.link.tickDmg, bm, false);
        }
      }
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.nano_mine;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let a = 0; a < (w.mines || []).length; a++) {             // links πρώτα (κάτω από τις νάρκες)
      for (let b = a + 1; b < w.mines.length; b++) {
        const mA = w.mines[a], mB = w.mines[b];
        if (mA.armT > 0 || mB.armT > 0) continue;
        if ((mA.x - mB.x) ** 2 + (mA.y - mB.y) ** 2 > d.link.range ** 2) continue;
        ctx.globalAlpha = 0.22; ctx.strokeStyle = '#9dff6b'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(mA.x, mA.y); ctx.lineTo(mB.x, mB.y); ctx.stroke();
        ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(mA.x, mA.y); ctx.lineTo(mB.x, mB.y); ctx.stroke();
        // DATA PACKET: nanite-κόμβος που ταξιδεύει στο νήμα
        const dk = (rt._t * 1.8 + (a * 3 + b) * 0.21) % 1;
        ctx.globalAlpha = 0.95; ctx.fillStyle = '#d8ffb8';
        ctx.beginPath(); ctx.arc(mA.x + (mB.x - mA.x) * dk, mA.y + (mB.y - mA.y) * dk, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const m of (w.mines || [])) {
      const armed = m.armT <= 0, sc = m.mini ? 0.65 : 1;
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.t * 1.6);
      ctx.globalAlpha = armed ? 0.30 : 0.14;                       // halo
      ctx.fillStyle = '#9dff6b';
      ctx.beginPath(); ctx.arc(0, 0, 12 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;                                         // σώμα: εξάγωνη νάρκη
      ctx.strokeStyle = '#5a6a52'; ctx.fillStyle = '#1a221a'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let q = 0; q < 6; q++) { const qa = q * Math.PI / 3;
        const px = Math.cos(qa) * 7 * sc, py = Math.sin(qa) * 7 * sc;
        q === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = armed ? (0.55 + 0.4 * Math.sin(m.t * 8)) : 0.25;   // παλλόμενο μάτι
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 2 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};

// ═══ 25 · BLACKNET SWARM DRONE — στοχεύει ranged/elite, bursts, επιστροφή reload ·
//        Distributed Intelligence -> BE_BLACKNET_HIVE_DOMINION ═══
WEAPON_DEFS.blacknet_swarm_drone = {
  name: 'Blacknet Swarm Drone', owner: null, category: 'weapon', kind: 'summon_drone',
  damage:   [6, 7, 9, 11, 14],                      // ανά bolt (burst x3)
  cooldown: [0.35, 0.33, 0.31, 0.29, 0.27],         // μεταξύ bolts του burst
  amount:   [1, 1, 2, 2, 3],                        // drones
  burst: 3, reload: 1.2, range: 300, boltSpeed: 620,
  critChance: 0.08, critMult: 1.6,
  bossMultiplier: 0.85, maxActive: 4,
  tags: ['BLACKNET', 'SUMMON', 'DRONE'],
  evolutionPassive: 'distributed_intelligence', evolution: 'be_blacknet_hive_dominion',
  desc: 'Blacknet drones that hunt shooters and elites first — burst, fall back, reload.',
};
PASSIVE_DEFS.distributed_intelligence = {
  name: 'Distributed Intelligence', category: 'evolution_passive', owner: null,
  forWeapon: 'blacknet_swarm_drone', requiredFor: 'be_blacknet_hive_dominion', maxLevel: 3,
  bonuses: [ { droneDmg: 0.10 }, { droneDmg: 0.10, droneCount: 1 }, { droneDmg: 0.15, droneCount: 1 } ],
  desc: 'The swarm thinks as one. Powers the Blacknet Hive Dominion.',
};
EVOLUTION_RECIPES.be_blacknet_hive_dominion = {
  name: 'Blacknet Hive Dominion', weapon: 'blacknet_swarm_drone', passive: 'distributed_intelligence',
  weaponLevel: 5, passiveLevel: 3,
  damage: 16, amount: 4,
  laser: { dps: 18, range: 260, tick: 0.3 },        // συνεχείς laser δεσμοί σε elites
  bossMultiplier: 0.80, tags: ['BLACKNET', 'SUMMON', 'DRONE', 'LASER'],
  desc: 'The hive locks a single verdict — shared targets, and standing lasers pin every elite.',
};

WEAPON_EXECUTORS.blacknet_swarm_drone = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.blacknet_swarm_drone, evo = EVOLUTION_RECIPES.be_blacknet_hive_dominion;
    const p = rt.game.player;
    w.drones = w.drones || []; w.bolts = w.bolts || []; w.laserT = (w.laserT || 0) - dt;
    const want = Math.min((w.evolved ? evo.amount : lvl(d, w, 'amount')) + rt._catalystSum('droneCount'), d.maxActive);
    while (w.drones.length < want) w.drones.push({ ph: Math.random() * 6, x: p.pos.x, y: p.pos.y, state: 'seek', shots: 0, t: 0, tgt: null });
    while (w.drones.length > want) w.drones.pop();
    const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('droneDmg'));
    const wid = w.evolved ? 'be_blacknet_hive_dominion' : 'blacknet_swarm_drone';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    // HIVE: κοινός στόχος στο evolution
    let hiveTgt = null;
    if (w.evolved) {
      let bd = d.range * d.range * 4;
      for (const e of rt.game.enemies) { if (e && e.hp > 0 && isRangedOrElite(e)) {
        const dd = (e.pos.x - p.pos.x) ** 2 + (e.pos.y - p.pos.y) ** 2; if (dd < bd) { bd = dd; hiveTgt = e; } } }
      if (!hiveTgt) hiveTgt = rt._nearestEnemy(p.pos.x, p.pos.y, d.range * 1.5);
    }
    for (const dr of w.drones) {
      dr.ph += dt * 2.2; dr.t -= dt;
      const hoverX = p.pos.x + Math.cos(dr.ph) * 46, hoverY = p.pos.y + Math.sin(dr.ph) * 46 - 24;
      if (dr.state === 'seek') {
        dr.tgt = hiveTgt;
        if (!dr.tgt) {                                             // προτεραιότητα: ranged/elite
          let bd = d.range * d.range;
          for (const e of rt.game.enemies) { if (e && e.hp > 0 && isRangedOrElite(e)) {
            const dd = (e.pos.x - p.pos.x) ** 2 + (e.pos.y - p.pos.y) ** 2; if (dd < bd) { bd = dd; dr.tgt = e; } } }
          if (!dr.tgt) dr.tgt = rt._nearestEnemy(p.pos.x, p.pos.y, d.range);
        }
        if (dr.tgt) { dr.state = 'burst'; dr.shots = 0; dr.t = 0; }
      } else if (dr.state === 'burst') {
        if (!dr.tgt || dr.tgt.hp <= 0) { dr.state = 'seek'; continue; }
        if (dr.t <= 0 && dr.shots < d.burst) {
          dr.t = lvl(d, w, 'cooldown'); dr.shots++;
          const a = Math.atan2(dr.tgt.pos.y - dr.y, dr.tgt.pos.x - dr.x);
          w.bolts.push({ x: dr.x, y: dr.y, a, t: 0, life: 0.7, hit: new Set() });
          if (w.bolts.length > 20) w.bolts.shift();
        }
        if (dr.shots >= d.burst) { dr.state = 'reload'; dr.t = d.reload; }
      } else if (dr.state === 'reload') {
        if (dr.t <= 0) dr.state = 'seek';
      }
      // κίνηση: burst = κράτα απόσταση από στόχο, αλλιώς hover στον παίκτη
      const tx = (dr.state === 'burst' && dr.tgt) ? dr.tgt.pos.x + Math.cos(dr.ph * 2) * 70 : hoverX;
      const ty = (dr.state === 'burst' && dr.tgt) ? dr.tgt.pos.y + Math.sin(dr.ph * 2) * 70 : hoverY;
      dr.x += (tx - dr.x) * Math.min(1, 4 * dt); dr.y += (ty - dr.y) * Math.min(1, 4 * dt);
    }
    for (let i = w.bolts.length - 1; i >= 0; i--) {
      const b = w.bolts[i]; b.t += dt;
      b.x += Math.cos(b.a) * d.boltSpeed * dt; b.y += Math.sin(b.a) * d.boltSpeed * dt;
      if (b.t >= b.life) { w.bolts.splice(i, 1); continue; }
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(b.x, b.y, 60) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || b.hit.has(e)) continue;
        if ((e.pos.x - b.x) ** 2 + (e.pos.y - b.y) ** 2 > (7 + e.radius) ** 2) continue;
        b.hit.add(e);
        rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
        w.bolts.splice(i, 1); break;
      }
    }
    // HIVE DOMINION: laser links από κάθε drone σε elites εντός εμβέλειας
    if (w.evolved && w.laserT <= 0) {
      w.laserT = evo.laser.tick;
      w.lasers = [];
      for (const dr of w.drones) {
        for (const e of rt.game.enemies) {
          if (!e || e.hp <= 0 || !isRangedOrElite(e)) continue;
          if ((e.pos.x - dr.x) ** 2 + (e.pos.y - dr.y) ** 2 > evo.laser.range ** 2) continue;
          rt._dealDamage(wid, e, evo.laser.dps * evo.laser.tick, bm, false);
          w.lasers.push({ x1: dr.x, y1: dr.y, x2: e.pos.x, y2: e.pos.y });
          break;                                                   // ένας δεσμός ανά drone
        }
      }
    }
  },
  draw(rt, ctx, w) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const l of (w.lasers || [])) {                            // hive lasers
      ctx.globalAlpha = 0.30; ctx.strokeStyle = '#ff3b6b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    }
    for (const b of (w.bolts || [])) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      if (b.t < 0.06) {                                            // λάμψη κάννης στη γέννηση του bolt
        ctx.globalAlpha = 0.8 * (1 - b.t / 0.06); ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(-2, 0, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ff3b6b';
      ctx.beginPath(); ctx.ellipse(-3, 0, 9, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-5, 0); ctx.stroke();
      ctx.restore();
    }
    for (const dr of (w.drones || [])) {
      ctx.save(); ctx.translate(dr.x, dr.y);
      ctx.globalAlpha = 0.28; ctx.fillStyle = '#ff3b6b';           // halo
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#14141c'; ctx.strokeStyle = '#3a3a4c'; ctx.lineWidth = 1.2;   // σώμα: μικρό stealth ρομβοειδές
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(0, 4.5); ctx.lineTo(-6, 0); ctx.lineTo(0, -4.5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.95;
      ctx.fillStyle = dr.state === 'reload' ? '#ffb84d' : '#ff3b6b';   // μάτι κατάστασης
      ctx.beginPath(); ctx.arc(1, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(rt._t * 30 + dr.ph * 7);  // THRUSTER: τρεμάμενη φλόγα
      ctx.fillStyle = '#7fd8ff';
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-11 - 3 * Math.sin(rt._t * 25 + dr.ph), 1.6); ctx.lineTo(-11 - 3 * Math.sin(rt._t * 25 + dr.ph), -1.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};

export const BE_UNIVERSALS = ['null_lance', 'ion_halo', 'gravity_core', 'nano_mine', 'blacknet_swarm_drone'];
