// ═══════════════════════════════════════════════════════════════════════════════
// P2.3b — BUILD ENGINE chars 4-5: BRAWLER WARRIOR + ASSASSIN CLONE
// 4 όπλα + 4 catalysts + 4 evolutions (be_*). Spec: docs/P2_BUILD_ENGINE_SPEC_GR.md
// Side-effect module (ίδιο ?v με το import του Game.js για κοινό instance).
// Συνταγή ultimates: halo -> σώμα -> λευκός πυρήνας, lighter, φάσεις, caps,
// ΚΑΝΕΝΑ PNG, μηδέν shadowBlur.
// ═══════════════════════════════════════════════════════════════════════════════
import { WEAPON_DEFS, PASSIVE_DEFS, EVOLUTION_RECIPES, WEAPON_EXECUTORS }
  from './BuildEngine.js?v=20260721300000';

function aimAngle(rt) {
  const p = rt.game.player, e = rt._nearestEnemy(p.pos.x, p.pos.y);
  if (e) return Math.atan2(e.pos.y - p.pos.y, e.pos.x - p.pos.x);
  return (p._facing || 1) > 0 ? 0 : Math.PI;
}
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function lvl(def, w, key) { const i = Math.min(w.level - 1, 4); return def[key][i]; }
function segHit(ax, ay, bx, by, e, halfW) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  let t = ((e.pos.x - ax) * dx + (e.pos.y - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx - e.pos.x, py = ay + t * dy - e.pos.y;
  return px * px + py * py < (halfW + e.radius) * (halfW + e.radius);
}
const isHeavy = e => e.isElite || (e.rank && e.rank !== 'normal') || e.radius >= 15;

// ═══ 07 · FAULTLINE FIST — ρωγμή προς κατεύθυνση, χτυπά σειρές, stagger ·
//        Tectonic Bracer -> BE_SEISMIC_GAUNTLET (διακλαδώσεις + aftershocks) ═══
WEAPON_DEFS.faultline_fist = {
  name: 'Faultline Fist', owner: 'brawler_warrior', category: 'weapon', kind: 'ground_crack',
  damage:   [18, 21, 25, 31, 38],
  cooldown: [1.60, 1.50, 1.35, 1.20, 1.05],
  amount:   [1, 1, 1, 1, 1],
  length: 240, width: 26, stagger: 0.30,
  critChance: 0.08, critMult: 1.7,
  bossMultiplier: 0.85, maxActive: 4,
  tags: ['EARTH', 'MELEE', 'LINE', 'STAGGER'],
  evolutionPassive: 'tectonic_bracer', evolution: 'be_seismic_gauntlet',
  desc: 'A fist that splits the ground — the crack tears through whole ranks and staggers them.',
};
PASSIVE_DEFS.tectonic_bracer = {
  name: 'Tectonic Bracer', category: 'evolution_passive', owner: null,
  forWeapon: 'faultline_fist', requiredFor: 'be_seismic_gauntlet', maxLevel: 3,
  bonuses: [ { crackLen: 0.12 }, { crackLen: 0.12, crackDmg: 0.10 }, { crackLen: 0.18, crackDmg: 0.15 } ],
  desc: 'The fault runs longer and hits harder. Powers the Seismic Gauntlet.',
};
EVOLUTION_RECIPES.be_seismic_gauntlet = {
  name: 'Seismic Gauntlet', weapon: 'faultline_fist', passive: 'tectonic_bracer',
  weaponLevel: 5, passiveLevel: 3,
  damage: 44, cooldown: 0.95, length: 300, width: 30,
  branches: 2, branchAngle: 0.62, branchDmg: 0.65,
  aftershocks: [0.30, 0.60], aftershockDmg: 0.5,
  bossMultiplier: 0.80, tags: ['EARTH', 'MELEE', 'LINE', 'AFTERSHOCK'],
  desc: 'The crack forks into branching faults — and the earth answers twice more with aftershocks.',
};

WEAPON_EXECUTORS.faultline_fist = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.faultline_fist, evo = EVOLUTION_RECIPES.be_seismic_gauntlet;
    const p = rt.game.player;
    w.cracks = w.cracks || [];
    w.cd -= dt;
    if (w.cd <= 0 && w.cracks.length < d.maxActive) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const dir = aimAngle(rt);
      const L = (w.evolved ? evo.length : d.length) * (1 + rt._catalystSum('crackLen'));
      const lines = [{ a: dir, mult: 1 }];
      if (w.evolved) for (let b = 1; b <= evo.branches; b++)
        lines.push({ a: dir + (b === 1 ? evo.branchAngle : -evo.branchAngle), mult: evo.branchDmg });
      // jagged κορυφές για κάθε γραμμή (προ-υπολογισμένες, σταθερές στη ζωή της ρωγμής)
      const mk = ln => {
        const pts = [[p.pos.x, p.pos.y]];
        const N = 7;
        for (let q = 1; q <= N; q++) {
          const f = q / N, off = (q === N ? 0 : (Math.random() - 0.5) * 22);
          pts.push([p.pos.x + Math.cos(ln.a) * L * f - Math.sin(ln.a) * off,
                    p.pos.y + Math.sin(ln.a) * L * f + Math.cos(ln.a) * off]);
        }
        return pts;
      };
      w.cracks.push({ t: 0, dur: 0.9, L, lines: lines.map(ln => ({ ...ln, pts: mk(ln) })),
                      shocksDone: 0, hit: new Set() });
    }
    const dmgBase = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('crackDmg'));
    const wid = w.evolved ? 'be_seismic_gauntlet' : 'faultline_fist';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.cracks.length - 1; i >= 0; i--) {
      const c = w.cracks[i]; c.t += dt;
      const grow = Math.min(1, c.t / 0.22);
      // κύριο χτύπημα καθώς απλώνει η ρωγμή
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, c.L + 80) : rt.game.enemies;
      for (const ln of c.lines) {
        const tip = Math.max(1, Math.floor(grow * (ln.pts.length - 1)));
        for (const e of near) {
          if (!e || e.hp <= 0 || c.hit.has(e)) continue;
          for (let s = 0; s < tip; s++) {
            if (segHit(ln.pts[s][0], ln.pts[s][1], ln.pts[s + 1][0], ln.pts[s + 1][1], e, (w.evolved ? evo.width : d.width) / 2)) {
              c.hit.add(e);
              rt._dealDamage(wid, e, dmgBase * ln.mult, bm, Math.random() < d.critChance);
              if (!e.isBoss?.() && !e.isMegaBoss) { e.slowTimer = Math.max(e.slowTimer || 0, d.stagger); e.slowFactor = 0.10; }
              break;
            }
          }
        }
      }
      // aftershocks (evolution): ξαναχτυπά κατά μήκος της ρωγμής
      if (w.evolved && c.shocksDone < evo.aftershocks.length && c.t >= evo.aftershocks[c.shocksDone]) {
        c.shocksDone++; c.hit.clear();
        if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: p.pos.x, y: p.pos.y, r: 60, t: 0, life: 0.3, col: '#3CFFB0' });
      }
      if (c.t >= c.dur) w.cracks.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const evo = EVOLUTION_RECIPES.be_seismic_gauntlet;
    for (const c of (w.cracks || [])) {
      const grow = Math.min(1, c.t / 0.22), fade = 1 - Math.max(0, (c.t - 0.5) / 0.4);
      // ULTIMATE PASS: aftershock re-glow — η ρωγμή ΞΑΝΑΝΑΒΕΙ σε κάθε μετασεισμό
      let boost = 1;
      if (w.evolved) for (const at of evo.aftershocks)
        if (c.t >= at && c.t < at + 0.18) boost = 1.8 - (c.t - at) * 4;
      ctx.save();
      for (const ln of c.lines) {
        const tip = Math.max(1, Math.floor(grow * (ln.pts.length - 1)));
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.85 * fade;                             // σκοτεινή σχισμή
        ctx.strokeStyle = '#0a0f0c'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(ln.pts[0][0], ln.pts[0][1]);
        for (let s = 1; s <= tip; s++) ctx.lineTo(ln.pts[s][0], ln.pts[s][1]); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, 0.35 * fade * boost);        // halo ενέργειας brawler
        ctx.strokeStyle = '#3CFFB0'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(ln.pts[0][0], ln.pts[0][1]);
        for (let s = 1; s <= tip; s++) ctx.lineTo(ln.pts[s][0], ln.pts[s][1]); ctx.stroke();
        ctx.globalAlpha = Math.min(1, 0.9 * fade * boost);         // λευκός πυρήνας
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ln.pts[0][0], ln.pts[0][1]);
        for (let s = 1; s <= tip; s++) ctx.lineTo(ln.pts[s][0], ln.pts[s][1]); ctx.stroke();
        // ΜΠΑΖΑ: πέτρες που τινάζονται κατά μήκος της σχισμής (ντετερμινιστικά ανά κορυφή)
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.9 * fade;
        ctx.fillStyle = '#2c332c';
        for (let s = 1; s <= tip; s++) {
          const seed = (s * 73 + Math.floor(ln.a * 100)) % 7;
          if (seed > 3) continue;
          const px = ln.pts[s][0] + (seed - 1.5) * 4, py = ln.pts[s][1] - c.t * (18 + seed * 8);
          ctx.save(); ctx.translate(px, py); ctx.rotate(c.t * (3 + seed));
          ctx.fillRect(-2.2, -2.2, 4.4, 4.4); ctx.restore();
        }
        // ΣΚΟΝΗ: αναδύεται και διαλύεται
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.12 * fade;
        ctx.fillStyle = '#9fb8a8';
        for (let s = 2; s <= tip; s += 2)
          ctx.beginPath(), ctx.arc(ln.pts[s][0], ln.pts[s][1] - c.t * 26, 6 + c.t * 10, 0, Math.PI * 2), ctx.fill();
      }
      ctx.restore();
    }
  },
};

// ═══ 08 · MAGMA UPPERCUT — κώνος μάγματος, high crit, burning patch,
//        βαριοί = bonus dmg · Volcanic Heart -> BE_PYROCLAST_UPPERCUT ═══
WEAPON_DEFS.magma_uppercut = {
  name: 'Magma Uppercut', owner: 'brawler_warrior', category: 'weapon', kind: 'cone_strike',
  damage:   [20, 24, 29, 36, 44],
  cooldown: [1.90, 1.75, 1.60, 1.45, 1.30],
  amount:   [1, 1, 1, 1, 1],
  radius: 112, arc: 0.96, heavyBonus: 0.30,
  burn: { dps: 9, dur: 2.5, patchR: 58, patchDur: 2.2 },
  critChance: 0.18, critMult: 2.0,
  bossMultiplier: 0.85, maxActive: 3,
  tags: ['MAGMA', 'MELEE', 'CONE', 'BURN'],
  evolutionPassive: 'volcanic_heart', evolution: 'be_pyroclast_uppercut',
  desc: 'An uppercut of raw magma — brutal crits, burning ground, and heavies feel it most.',
};
PASSIVE_DEFS.volcanic_heart = {
  name: 'Volcanic Heart', category: 'evolution_passive', owner: null,
  forWeapon: 'magma_uppercut', requiredFor: 'be_pyroclast_uppercut', maxLevel: 3,
  bonuses: [ { magmaBurn: 0.20 }, { magmaBurn: 0.20, magmaRadius: 0.10 }, { magmaBurn: 0.30, magmaRadius: 0.15 } ],
  desc: 'The heart burns hotter — fiercer flames, wider cone. Powers the Pyroclast Uppercut.',
};
EVOLUTION_RECIPES.be_pyroclast_uppercut = {
  name: 'Pyroclast Uppercut', weapon: 'magma_uppercut', passive: 'volcanic_heart',
  weaponLevel: 5, passiveLevel: 3,
  damage: 52, cooldown: 1.15, radius: 132,
  column: { radius: 84, dmg: 30, delay: 0.28 },
  rocks: { count: 3, dmg: 18, range: 170, patchR: 40, patchDur: 1.6 },
  bossMultiplier: 0.80, tags: ['MAGMA', 'MELEE', 'CONE', 'ERUPTION'],
  desc: 'The blow raises a volcanic column that hurls burning rocks across the field.',
};

WEAPON_EXECUTORS.magma_uppercut = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.magma_uppercut, evo = EVOLUTION_RECIPES.be_pyroclast_uppercut;
    const p = rt.game.player;
    w.strikes = w.strikes || []; w.rocks = w.rocks || [];
    w.cd -= dt;
    if (w.cd <= 0 && w.strikes.length < d.maxActive) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const dir = aimAngle(rt);
      const R = (w.evolved ? evo.radius : d.radius) * (1 + rt._catalystSum('magmaRadius'));
      w.strikes.push({ dir, t: 0, dur: 0.45, R, hitDone: false, colDone: !w.evolved,
                       x: p.pos.x, y: p.pos.y });
    }
    const dmgBase = w.evolved ? evo.damage : lvl(d, w, 'damage');
    const burnDps = d.burn.dps * (1 + rt._catalystSum('magmaBurn'));
    const wid = w.evolved ? 'be_pyroclast_uppercut' : 'magma_uppercut';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.strikes.length - 1; i >= 0; i--) {
      const s = w.strikes[i]; s.t += dt;
      if (!s.hitDone && s.t >= 0.10) {
        s.hitDone = true;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(s.x, s.y, s.R + 60) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          const dx = e.pos.x - s.x, dy = e.pos.y - s.y, dist = Math.hypot(dx, dy);
          if (dist > s.R + e.radius) continue;
          if (Math.abs(angDiff(Math.atan2(dy, dx), s.dir)) > d.arc / 2) continue;
          const dmg = dmgBase * (isHeavy(e) ? 1 + d.heavyBonus : 1);
          rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
          rt.applyBurn(e, burnDps, d.burn.dur, wid);
        }
        const px = s.x + Math.cos(s.dir) * s.R * 0.6, py = s.y + Math.sin(s.dir) * s.R * 0.6;
        rt.addBurnPatch(px, py, d.burn.patchR, burnDps, d.burn.patchDur, wid, '#ff5a3c');
      }
      // ηφαιστειακή στήλη + βράχοι (evolution)
      if (!s.colDone && s.t >= evo.column.delay) {
        s.colDone = true;
        const cx = s.x + Math.cos(s.dir) * s.R * 0.8, cy = s.y + Math.sin(s.dir) * s.R * 0.8;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(cx, cy, evo.column.radius + 60) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          if (Math.hypot(e.pos.x - cx, e.pos.y - cy) > evo.column.radius + e.radius) continue;
          rt._dealDamage(wid, e, evo.column.dmg, bm, false);
        }
        if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: cx, y: cy, r: evo.column.radius, t: 0, life: 0.35, col: '#ff5a3c' });
        for (let k = 0; k < evo.rocks.count; k++) {
          const ra = s.dir + (k - 1) * 0.7 + (Math.random() - 0.5) * 0.3;
          w.rocks.push({ x: cx, y: cy, a: ra, t: 0, fly: 0.5,
                         tx: cx + Math.cos(ra) * evo.rocks.range, ty: cy + Math.sin(ra) * evo.rocks.range });
        }
      }
      if (s.t >= s.dur) w.strikes.splice(i, 1);
    }
    // βράχοι σε πτήση -> πρόσκρουση + mini patch
    for (let i = w.rocks.length - 1; i >= 0; i--) {
      const r = w.rocks[i]; r.t += dt;
      if (r.t >= r.fly) {
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(r.tx, r.ty, 70) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          if (Math.hypot(e.pos.x - r.tx, e.pos.y - r.ty) > 34 + e.radius) continue;
          rt._dealDamage(wid, e, evo.rocks.dmg, bm, false);
        }
        rt.addBurnPatch(r.tx, r.ty, evo.rocks.patchR, burnDps * 0.7, evo.rocks.patchDur, wid, '#ff7a3c');
        w.rocks.splice(i, 1);
      }
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.magma_uppercut;
    for (const s of (w.strikes || [])) {
      const k = Math.min(1, s.t / 0.18), fade = 1 - Math.max(0, (s.t - 0.2) / 0.25);
      if (fade <= 0) continue;
      const a0 = s.dir - d.arc / 2, a1 = s.dir - d.arc / 2 + d.arc * k;
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 * fade;                               // halo μάγματος
      ctx.fillStyle = '#ff5a3c';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s.R, a0, a1); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.55 * fade;                               // σώμα: ΦΛΕΒΕΣ ΛΑΒΑΣ (jagged ακτίνες)
      ctx.strokeStyle = '#ff8a4c'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      for (let q = 0; q <= 4; q++) {
        const qa = a0 + (d.arc * k) * (q / 4);
        ctx.beginPath(); ctx.moveTo(Math.cos(qa) * s.R * 0.25, Math.sin(qa) * s.R * 0.25);
        const zig = (q % 2 ? 1 : -1) * 7;
        ctx.lineTo(Math.cos(qa) * s.R * 0.6 - Math.sin(qa) * zig, Math.sin(qa) * s.R * 0.6 + Math.cos(qa) * zig);
        ctx.lineTo(Math.cos(qa) * s.R, Math.sin(qa) * s.R); ctx.stroke();
      }
      ctx.globalAlpha = 0.7 * fade;                                // ΚΑΦΤΡΕΣ: αναδύονται από τον κώνο
      ctx.fillStyle = '#ffb46b';
      for (let q = 0; q < 6; q++) {
        const qa = a0 + d.arc * ((q + 0.5) / 6);
        const qr = s.R * (0.4 + 0.4 * ((q * 53) % 10) / 10);
        ctx.beginPath();
        ctx.arc(Math.cos(qa) * qr, Math.sin(qa) * qr - s.t * (50 + q * 14), 1.6 + (q % 2), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 0.9 * fade;                                // λευκός πυρήνας-ακμή
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, s.R, a0, a1); ctx.stroke();
      ctx.restore();
    }
    for (const r of (w.rocks || [])) {                             // βράχοι: καμπύλη πτήση + καπνός + πύρινη ουρά
      const f = r.t / r.fly, x = r.x + (r.tx - r.x) * f, y = r.y + (r.ty - r.y) * f - Math.sin(f * Math.PI) * 46;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let gh = 3; gh >= 1; gh--) {                            // ΚΑΠΝΟΣ: γκρίζα φούσκα πίσω στην τροχιά
        const gf = Math.max(0, f - gh * 0.07);
        const gx = r.x + (r.tx - r.x) * gf, gy = r.y + (r.ty - r.y) * gf - Math.sin(gf * Math.PI) * 46;
        ctx.globalAlpha = 0.10 * (4 - gh) / 3;
        ctx.fillStyle = gh === 1 ? '#ff9b5c' : '#8a8a92';
        ctx.beginPath(); ctx.arc(gx, gy, 5 + gh * 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#ff7a3c';
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#3a2a22';                                   // σώμα βράχου με πυρωμένες ρωγμές
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff7a3c'; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(x - 4, y - 1); ctx.lineTo(x - 1, y + 1); ctx.lineTo(x + 3, y - 2); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
};

// ═══ 09 · MONOWIRE LASH — καλώδιο ευθεία + επιστροφή, high crit, x2 hit ·
//        Shadow Spool -> BE_WIRE_GARROTE_WEB (δίκτυο καλωδίων σε στόχους) ═══
WEAPON_DEFS.monowire_lash = {
  name: 'Monowire Lash', owner: 'assassin_clone', category: 'weapon', kind: 'wire_lash',
  damage:   [13, 15, 18, 22, 27],
  cooldown: [1.35, 1.25, 1.15, 1.05, 0.95],
  amount:   [1, 1, 1, 1, 1],
  range: 320, width: 10, flyTime: 0.28,
  critChance: 0.22, critMult: 2.2,
  bossMultiplier: 0.85, maxActive: 3,
  tags: ['WIRE', 'LINE', 'CRIT'],
  evolutionPassive: 'shadow_spool', evolution: 'be_wire_garrote_web',
  desc: 'A monomolecular wire snaps out and back — two cuts, and the crits are merciless.',
};
PASSIVE_DEFS.shadow_spool = {
  name: 'Shadow Spool', category: 'evolution_passive', owner: null,
  forWeapon: 'monowire_lash', requiredFor: 'be_wire_garrote_web', maxLevel: 3,
  bonuses: [ { wireRange: 0.12 }, { wireRange: 0.12, wireCrit: 0.04 }, { wireRange: 0.18, wireCrit: 0.06 } ],
  desc: 'More spool, longer reach, crueler crits. Powers the Wire Garrote Web.',
};
EVOLUTION_RECIPES.be_wire_garrote_web = {
  name: 'Wire Garrote Web', weapon: 'monowire_lash', passive: 'shadow_spool',
  weaponLevel: 5, passiveLevel: 3,
  damage: 32, cooldown: 0.85, range: 380,
  web: { targets: 4, dur: 1.2, tick: 0.3, dmg: 14, width: 8 },
  bossMultiplier: 0.80, tags: ['WIRE', 'LINE', 'CRIT', 'WEB'],
  desc: 'On the return, the wire weaves a garrote web between victims — it cuts as they struggle.',
};

WEAPON_EXECUTORS.monowire_lash = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.monowire_lash, evo = EVOLUTION_RECIPES.be_wire_garrote_web;
    const p = rt.game.player;
    w.lashes = w.lashes || []; w.webs = w.webs || [];
    w.cd -= dt;
    if (w.cd <= 0 && w.lashes.length < d.maxActive) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const R = (w.evolved ? evo.range : d.range) * (1 + rt._catalystSum('wireRange'));
      w.lashes.push({ dir: aimAngle(rt), t: 0, R, out: true, hit: new Set(), x: p.pos.x, y: p.pos.y });
    }
    const dmg = w.evolved ? evo.damage : lvl(d, w, 'damage');
    const crit = d.critChance + rt._catalystSum('wireCrit');
    const wid = w.evolved ? 'be_wire_garrote_web' : 'monowire_lash';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.lashes.length - 1; i >= 0; i--) {
      const l = w.lashes[i]; l.t += dt;
      const phase = l.t / d.flyTime;                               // 0..1 out, 1..2 back
      if (l.out && phase >= 1) { l.out = false; l.hit.clear(); }
      const ext = l.out ? Math.min(1, phase) : Math.max(0, 2 - phase);
      const tipX = l.x + Math.cos(l.dir) * l.R * ext, tipY = l.y + Math.sin(l.dir) * l.R * ext;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query((l.x + tipX) / 2, (l.y + tipY) / 2, l.R / 2 + 60) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || l.hit.has(e)) continue;
        if (!segHit(l.x, l.y, tipX, tipY, e, d.width / 2)) continue;
        l.hit.add(e);
        rt._dealDamage(wid, e, dmg, bm, Math.random() < crit);
      }
      if (phase >= 2) {
        // WEB (evolution): ύφανση ανάμεσα στους 4 κοντινότερους
        if (w.evolved && w.webs.length < 2) {
          const cand = [];
          for (const e of rt.game.enemies) {
            if (!e || e.hp <= 0) continue;
            const dd = (e.pos.x - p.pos.x) ** 2 + (e.pos.y - p.pos.y) ** 2;
            if (dd < 340 * 340) cand.push([dd, e]);
          }
          cand.sort((a, b) => a[0] - b[0]);
          const targets = cand.slice(0, evo.web.targets).map(c => c[1]);
          if (targets.length >= 2) w.webs.push({ targets, t: 0, next: 0 });
        }
        w.lashes.splice(i, 1);
      }
    }
    for (let i = w.webs.length - 1; i >= 0; i--) {
      const web = w.webs[i]; web.t += dt; web.next -= dt;
      web.targets = web.targets.filter(e => e && e.hp > 0);
      if (web.targets.length < 2 || web.t >= evo.web.dur) { w.webs.splice(i, 1); continue; }
      if (web.next <= 0) {
        web.next = evo.web.tick;
        for (let a = 0; a < web.targets.length; a++) {
          const eA = web.targets[a], eB = web.targets[(a + 1) % web.targets.length];
          const near = rt.game._spatialGrid ? rt.game._spatialGrid.query((eA.pos.x + eB.pos.x) / 2, (eA.pos.y + eB.pos.y) / 2, 240) : rt.game.enemies;
          for (const e of near) {
            if (!e || e.hp <= 0) continue;
            if (!segHit(eA.pos.x, eA.pos.y, eB.pos.x, eB.pos.y, e, evo.web.width)) continue;
            rt._dealDamage(wid, e, evo.web.dmg, bm, false);
          }
        }
      }
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.monowire_lash;
    for (const l of (w.lashes || [])) {
      const phase = l.t / d.flyTime, ext = l.out ? Math.min(1, phase) : Math.max(0, 2 - phase);
      const tipX = l.x + Math.cos(l.dir) * l.R * ext, tipY = l.y + Math.sin(l.dir) * l.R * ext;
      // ULTIMATE PASS: το σύρμα ΔΟΝΕΙΤΑΙ — αρμονικές ταλάντωσης κατά μήκος
      const wob = (f) => Math.sin(f * Math.PI * 3 + rt._t * 30) * 3.2 * Math.sin(f * Math.PI);
      const px2 = -Math.sin(l.dir), py2 = Math.cos(l.dir);
      const wirePath = () => {
        ctx.beginPath(); ctx.moveTo(l.x, l.y);
        for (let q = 1; q <= 8; q++) {
          const f = q / 8, wx = l.x + (tipX - l.x) * f + px2 * wob(f), wy = l.y + (tipY - l.y) * f + py2 * wob(f);
          ctx.lineTo(wx, wy);
        }
      };
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30;                                      // crimson halo assassin
      ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 5; wirePath(); ctx.stroke();
      ctx.globalAlpha = 0.16;                                      // afterglow δεύτερης αρμονικής
      ctx.lineWidth = 9; wirePath(); ctx.stroke();
      ctx.globalAlpha = 0.95;                                      // λευκό-καυτό σύρμα
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; wirePath(); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff';            // αιχμή
      ctx.beginPath(); ctx.arc(tipX, tipY, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const web of (w.webs || [])) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let a = 0; a < web.targets.length; a++) {
        const eA = web.targets[a], eB = web.targets[(a + 1) % web.targets.length];
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(eA.pos.x, eA.pos.y); ctx.lineTo(eB.pos.x, eB.pos.y); ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(eA.pos.x, eA.pos.y); ctx.lineTo(eB.pos.x, eB.pos.y); ctx.stroke();
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(rt._t * 10 + a * 2);   // κόμβοι που πάλλονται
        ctx.fillStyle = '#ffd0da';
        ctx.beginPath(); ctx.arc(eA.pos.x, eA.pos.y, 2.4, 0, Math.PI * 2); ctx.fill();
        // λευκός παλμός που ΤΡΕΧΕΙ πάνω στο νήμα
        const pk = (rt._t * 1.4 + a * 0.33) % 1;
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(eA.pos.x + (eB.pos.x - eA.pos.x) * pk, eA.pos.y + (eB.pos.y - eA.pos.y) * pk, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  },
};

// ═══ 10 · TOXIN KUNAI — stacking poison + Marks για crit executions ·
//        Nightshade Matrix -> BE_POISON_PETAL_WALTZ (πέταλα-λεπίδες χορογραφία) ═══
WEAPON_DEFS.toxin_kunai = {
  name: 'Toxin Kunai', owner: 'assassin_clone', category: 'weapon', kind: 'poison_projectile',
  damage:   [9, 11, 13, 16, 20],
  cooldown: [1.10, 1.00, 0.92, 0.83, 0.75],
  amount:   [2, 2, 3, 3, 4],
  speed: 560, markStacks: 5,
  execution: { pctMaxHp: 0.25, cap: 120 },        // crit σε marked = execution burst (όχι bosses)
  critChance: 0.12, critMult: 1.8,
  bossMultiplier: 0.85, maxActive: 20,
  tags: ['POISON', 'PROJECTILE', 'MARK'],
  evolutionPassive: 'nightshade_matrix', evolution: 'be_poison_petal_waltz',
  desc: 'Poisoned kunai stack venom — five stacks mark the victim for a critical execution.',
};
PASSIVE_DEFS.nightshade_matrix = {
  name: 'Nightshade Matrix', category: 'evolution_passive', owner: null,
  forWeapon: 'toxin_kunai', requiredFor: 'be_poison_petal_waltz', maxLevel: 3,
  bonuses: [ { kunaiDmg: 0.10 }, { kunaiDmg: 0.10, kunaiStacks: 1 }, { kunaiDmg: 0.15, kunaiStacks: 1 } ],
  desc: 'A darker toxin — heavier hits, faster venom stacks. Powers the Poison Petal Waltz.',
};
EVOLUTION_RECIPES.be_poison_petal_waltz = {
  name: 'Poison Petal Waltz', weapon: 'toxin_kunai', passive: 'nightshade_matrix',
  weaponLevel: 5, passiveLevel: 3,
  damage: 24, cooldown: 0.62, amount: 4,
  waltz: { every: 4.0, petals: 8, dur: 1.4, maxR: 190, dmg: 16 },
  bossMultiplier: 0.80, tags: ['POISON', 'PROJECTILE', 'MARK', 'PETAL'],
  desc: 'Every few beats, blade-petals waltz outward in a poisoned spiral choreography.',
};

WEAPON_EXECUTORS.toxin_kunai = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.toxin_kunai, evo = EVOLUTION_RECIPES.be_poison_petal_waltz;
    const p = rt.game.player;
    w.kunai = w.kunai || []; w.waltz = w.waltz || null; w.waltzT = (w.waltzT ?? evo.waltz.every);
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const n = Math.min(w.evolved ? evo.amount : lvl(d, w, 'amount'), d.maxActive - w.kunai.length);
      const base = aimAngle(rt);
      for (let k = 0; k < n; k++) {
        const a = base + (k - (n - 1) / 2) * 0.16;
        w.kunai.push({ x: p.pos.x, y: p.pos.y, a, t: 0, life: 0.9, hit: new Set() });
      }
    }
    const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('kunaiDmg'));
    const stacks = 1 + rt._catalystSum('kunaiStacks');
    const wid = w.evolved ? 'be_poison_petal_waltz' : 'toxin_kunai';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.kunai.length - 1; i >= 0; i--) {
      const kn = w.kunai[i]; kn.t += dt;
      kn.x += Math.cos(kn.a) * d.speed * dt; kn.y += Math.sin(kn.a) * d.speed * dt;
      if (kn.t >= kn.life) { w.kunai.splice(i, 1); continue; }
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(kn.x, kn.y, 60) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || kn.hit.has(e)) continue;
        if ((e.pos.x - kn.x) ** 2 + (e.pos.y - kn.y) ** 2 > (8 + e.radius) ** 2) continue;
        kn.hit.add(e);
        const st = rt._st(e);
        const marked = (st.poison?.stacks || 0) >= d.markStacks;
        const isCrit = Math.random() < d.critChance;
        rt._dealDamage(wid, e, dmg, bm, isCrit);
        rt.applyPoison(e, wid, stacks);
        if (marked && isCrit && !e.isBoss?.() && !e.isMegaBoss && e.hp > 0) {
          const burst = Math.min(e.maxHp * d.execution.pctMaxHp, d.execution.cap);   // EXECUTION
          rt._dealDamage(wid, e, burst, 1, false);
          if (rt.fx.length < 48) rt.fx.push({ kind: 'spark', x: e.pos.x, y: e.pos.y, r: e.radius + 10, t: 0, life: 0.3 });
        }
        w.kunai.splice(i, 1); break;
      }
    }
    // POISON PETAL WALTZ (evolution): σπειροειδής χορογραφία πετάλων
    if (w.evolved) {
      w.waltzT -= dt;
      if (w.waltzT <= 0 && !w.waltz) { w.waltzT = evo.waltz.every; w.waltz = { t: 0, hit: new Map() }; }
      if (w.waltz) {
        const s = w.waltz; s.t += dt;
        const prog = s.t / evo.waltz.dur, R = 26 + (evo.waltz.maxR - 26) * prog;
        for (let pe = 0; pe < evo.waltz.petals; pe++) {
          const pa = prog * Math.PI * 3 + pe * (Math.PI * 2 / evo.waltz.petals);
          const px = p.pos.x + Math.cos(pa) * R, py = p.pos.y + Math.sin(pa) * R;
          const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(px, py, 50) : rt.game.enemies;
          for (const e of near) {
            if (!e || e.hp <= 0) continue;
            if ((e.pos.x - px) ** 2 + (e.pos.y - py) ** 2 > (14 + e.radius) ** 2) continue;
            const okAt = s.hit.get(e) || 0;
            if (s.t >= okAt) { s.hit.set(e, s.t + 0.4); rt._dealDamage(wid, e, evo.waltz.dmg, bm, false); rt.applyPoison(e, wid, 1); }
          }
        }
        if (prog >= 1) w.waltz = null;
      }
    }
  },
  draw(rt, ctx, w) {
    const evo = EVOLUTION_RECIPES.be_poison_petal_waltz;
    const p = rt.game.player;
    for (const kn of (w.kunai || [])) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';       // ατμός δηλητηρίου πίσω στην τροχιά
      for (let gh = 3; gh >= 1; gh--) {
        ctx.globalAlpha = 0.09 * (4 - gh);
        ctx.fillStyle = '#7CFF3C';
        ctx.beginPath(); ctx.arc(kn.x - Math.cos(kn.a) * 11 * gh, kn.y - Math.sin(kn.a) * 11 * gh + Math.sin(rt._t * 9 + gh) * 2, 4 - gh * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.save(); ctx.translate(kn.x, kn.y); ctx.rotate(kn.a);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 + 0.08 * Math.sin(rt._t * 20);        // venom halo (γυαλάδα λεπίδας)
      ctx.fillStyle = '#7CFF3C';
      ctx.beginPath(); ctx.ellipse(-4, 0, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#c8ccd4';                                   // σώμα kunai
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-1, 2.6); ctx.lineTo(-5, 0.8); ctx.lineTo(-5, -0.8); ctx.lineTo(-1, -2.6); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9;            // λευκή ακμή
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-1, 0); ctx.stroke();
      ctx.restore();
    }
    if (w.waltz) {
      const s = w.waltz, prog = s.t / evo.waltz.dur, R = 26 + (evo.waltz.maxR - 26) * prog, fade = 1 - prog * 0.5;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let pe = 0; pe < evo.waltz.petals; pe++) {
        const pa = prog * Math.PI * 3 + pe * (Math.PI * 2 / evo.waltz.petals);
        const px = p.pos.x + Math.cos(pa) * R, py = p.pos.y + Math.sin(pa) * R;
        ctx.save(); ctx.translate(px, py); ctx.rotate(pa + Math.PI / 2);
        ctx.globalAlpha = 0.30 * fade; ctx.fillStyle = '#7CFF3C';   // halo πετάλου
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.75 * fade; ctx.fillStyle = '#b8ff7c';   // σώμα-πέταλο (καμπύλη λεπίδα)
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(6, -2, 0, 10); ctx.quadraticCurveTo(-2, -2, 0, -11); ctx.fill();
        ctx.globalAlpha = 0.95 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(3, -2, 0, 9); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  },
};

export const BE_CHARS2 = ['faultline_fist', 'magma_uppercut', 'monowire_lash', 'toxin_kunai'];
