// ═══════════════════════════════════════════════════════════════════════════════
// P2.4b — BUILD ENGINE chars 8-10: JAPAN PHASEWALKER + EUCLID VECTOR + ONI
// 6 όπλα + 6 catalysts + 6 evolutions (be_*). Spec: docs/P2_BUILD_ENGINE_SPEC_GR.md
// Συνταγή ultimates: halo -> σώμα -> λευκός πυρήνας, lighter, φάσεις, caps,
// ΚΑΝΕΝΑ PNG, μηδέν shadowBlur.
// ═══════════════════════════════════════════════════════════════════════════════
import { WEAPON_DEFS, PASSIVE_DEFS, EVOLUTION_RECIPES, WEAPON_EXECUTORS }
  from './BuildEngine.js?v=20260719000000';

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

// ═══ 15 · PHASE NEEDLE — max pierce, phase scars, re-hit scar = bonus ·
//        Causal Thread -> BE_CAUSALITY_STITCH (χρονικές εκδοχές ξαναχτυπούν) ═══
WEAPON_DEFS.phase_needle = {
  name: 'Phase Needle', owner: 'japan_phasewalker', category: 'weapon', kind: 'phase_projectile',
  damage:   [11, 13, 16, 20, 25],
  cooldown: [1.25, 1.15, 1.05, 0.95, 0.85],
  amount:   [1, 1, 1, 2, 2],
  speed: 640, range: 420, scarBonus: 0.25, scarCap: 3,
  critChance: 0.08, critMult: 1.7,
  bossMultiplier: 0.85, maxActive: 10,
  tags: ['PHASE', 'PROJECTILE', 'PIERCE', 'SCAR'],
  evolutionPassive: 'causal_thread', evolution: 'be_causality_stitch',
  desc: 'A needle that phases through everything, scarring reality — scarred foes take more.',
};
PASSIVE_DEFS.causal_thread = {
  name: 'Causal Thread', category: 'evolution_passive', owner: null,
  forWeapon: 'phase_needle', requiredFor: 'be_causality_stitch', maxLevel: 3,
  bonuses: [ { needleDmg: 0.08 }, { needleDmg: 0.08, scarBonus: 0.05 }, { needleDmg: 0.12, scarBonus: 0.10 } ],
  desc: 'Threads of cause and effect trail the needle. Powers the Causality Stitch.',
};
EVOLUTION_RECIPES.be_causality_stitch = {
  name: 'Causality Stitch', weapon: 'phase_needle', passive: 'causal_thread',
  weaponLevel: 5, passiveLevel: 3,
  damage: 30, cooldown: 0.70, amount: 2,
  stitch: { delay: 0.5, dmgMult: 0.6 },             // η βελονιά ξαναπαίζει τη διαδρομή
  bossMultiplier: 0.80, tags: ['PHASE', 'PROJECTILE', 'SCAR', 'ECHO'],
  desc: 'Half a second later, time re-runs the needle — a stitched echo strikes the same seam.',
};

WEAPON_EXECUTORS.phase_needle = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.phase_needle, evo = EVOLUTION_RECIPES.be_causality_stitch;
    const p = rt.game.player;
    w.needles = w.needles || []; w.echoes = w.echoes || [];
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const n = Math.min(w.evolved ? evo.amount : lvl(d, w, 'amount'), d.maxActive - w.needles.length);
      const base = aimAngle(rt);
      for (let k = 0; k < n; k++) {
        const a = base + (k - (n - 1) / 2) * 0.22;
        w.needles.push({ x: p.pos.x, y: p.pos.y, x0: p.pos.x, y0: p.pos.y, a, t: 0, hit: new Set() });
      }
    }
    const dmgBase = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('needleDmg'));
    const scarB = d.scarBonus + rt._catalystSum('scarBonus');
    const wid = w.evolved ? 'be_causality_stitch' : 'phase_needle';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    const hitAlong = (nx, ny, na, distNow, hitSet, mult) => {
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(nx, ny, 60) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || hitSet.has(e)) continue;
        if ((e.pos.x - nx) ** 2 + (e.pos.y - ny) ** 2 > (8 + e.radius) ** 2) continue;
        hitSet.add(e);
        const st = rt._st(e); st.scars = Math.min(d.scarCap, (st.scars || 0));
        const dmg = dmgBase * mult * (1 + st.scars * scarB);       // re-hit σε scar = bonus
        rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
        st.scars = Math.min(d.scarCap, (st.scars || 0) + 1);       // αφήνει phase scar
      }
    };
    for (let i = w.needles.length - 1; i >= 0; i--) {
      const nd = w.needles[i]; nd.t += dt;
      nd.x += Math.cos(nd.a) * d.speed * dt; nd.y += Math.sin(nd.a) * d.speed * dt;
      hitAlong(nd.x, nd.y, nd.a, 0, nd.hit, 1);
      const dist = Math.hypot(nd.x - nd.x0, nd.y - nd.y0);
      if (dist >= d.range) {
        if (w.evolved && w.echoes.length < 6)
          w.echoes.push({ x0: nd.x0, y0: nd.y0, a: nd.a, t: -evo.stitch.delay, hit: new Set() });
        w.needles.splice(i, 1);
      }
    }
    // CAUSALITY STITCH: η διαδρομή ξαναπαίζει ως χρονική εκδοχή
    for (let i = w.echoes.length - 1; i >= 0; i--) {
      const ec = w.echoes[i]; ec.t += dt;
      if (ec.t < 0) continue;
      const dist = Math.min(d.range, ec.t * d.speed);
      const ex = ec.x0 + Math.cos(ec.a) * dist, ey = ec.y0 + Math.sin(ec.a) * dist;
      hitAlong(ex, ey, ec.a, dist, ec.hit, evo.stitch.dmgMult);
      if (dist >= d.range) w.echoes.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.phase_needle;
    const drawNeedle = (x, y, a, echo) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter';
      // ULTIMATE PASS: το ύφασμα του χώρου ΣΚΙΖΕΤΑΙ — wake από δύο αποκλίνουσες ραφές
      ctx.globalAlpha = echo ? 0.14 : 0.22;
      ctx.strokeStyle = '#b17bff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.quadraticCurveTo(-14, -4, -30, -8 - Math.sin(rt._t * 13) * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.quadraticCurveTo(-14, 4, -30, 8 + Math.sin(rt._t * 13) * 2); ctx.stroke();
      ctx.globalAlpha = echo ? 0.20 : 0.30;                        // violet phase halo
      ctx.fillStyle = '#b17bff';
      ctx.beginPath(); ctx.ellipse(-8, 0, 18, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      if (echo) {                                                  // stitch: διακεκομμένο ΝΗΜΑ ραφής πίσω από την ηχώ
        ctx.globalAlpha = 0.5; ctx.strokeStyle = '#e6d5ff'; ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-70, 0); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = echo ? 0.55 : 0.95;                        // λευκή βελόνα-πυρήνας
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = echo ? 0.9 : 1.4;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-14, 0); ctx.stroke();
      ctx.restore();
    };
    for (const nd of (w.needles || [])) drawNeedle(nd.x, nd.y, nd.a, false);
    for (const ec of (w.echoes || [])) {
      if (ec.t < 0) continue;
      const dist = Math.min(d.range, ec.t * d.speed);
      drawNeedle(ec.x0 + Math.cos(ec.a) * dist, ec.y0 + Math.sin(ec.a) * dist, ec.a, true);
    }
  },
};

// ═══ 16 · PROBABILITY DISC — bounce με τυχαία μετάλλαξη ανά bounce ·
//        Entropic Dice -> BE_QUANTUM_ROULETTE (stacking καλά rolls) ═══
WEAPON_DEFS.probability_disc = {
  name: 'Probability Disc', owner: 'japan_phasewalker', category: 'weapon', kind: 'bounce_projectile',
  damage:   [13, 15, 18, 22, 27],
  cooldown: [1.60, 1.50, 1.38, 1.25, 1.12],
  amount:   [1, 1, 1, 1, 2],
  speed: 460, bounces: [2, 2, 3, 3, 4], bounceRange: 240, size: 11,
  critChance: 0.08, critMult: 1.7,
  bossMultiplier: 0.85, maxActive: 8,
  tags: ['PHASE', 'PROJECTILE', 'BOUNCE', 'RNG'],
  evolutionPassive: 'entropic_dice', evolution: 'be_quantum_roulette',
  desc: 'A disc that rerolls itself on every bounce — bigger, faster, doubled, or lethal.',
};
PASSIVE_DEFS.entropic_dice = {
  name: 'Entropic Dice', category: 'evolution_passive', owner: null,
  forWeapon: 'probability_disc', requiredFor: 'be_quantum_roulette', maxLevel: 3,
  bonuses: [ { discBounce: 1 }, { discBounce: 1, discDmg: 0.08 }, { discBounce: 1, discDmg: 0.12 } ],
  desc: 'Loaded dice from a broken timeline. Powers the Quantum Roulette.',
};
EVOLUTION_RECIPES.be_quantum_roulette = {
  name: 'Quantum Roulette', weapon: 'probability_disc', passive: 'entropic_dice',
  weaponLevel: 5, passiveLevel: 3,
  damage: 30, cooldown: 0.95, bounces: 6,
  bossMultiplier: 0.80, tags: ['PHASE', 'PROJECTILE', 'BOUNCE', 'STACK'],
  desc: 'The wheel only spins up — every bounce keeps its winnings and doubles down.',
};

WEAPON_EXECUTORS.probability_disc = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.probability_disc, evo = EVOLUTION_RECIPES.be_quantum_roulette;
    const p = rt.game.player;
    w.discs = w.discs || [];
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const n = Math.min(w.evolved ? 2 : lvl(d, w, 'amount'), d.maxActive - w.discs.length);
      for (let k = 0; k < n; k++) {
        const tgt = rt._nearestEnemy(p.pos.x, p.pos.y);
        if (!tgt) break;
        w.discs.push({ x: p.pos.x, y: p.pos.y, tgt, t: 0,
          bouncesLeft: (w.evolved ? evo.bounces : lvl(d, w, 'bounces')) + rt._catalystSum('discBounce'),
          mods: { size: 1, speed: 1, dmg: 1, crit: false }, hit: new Set(), roll: '' });
      }
    }
    const dmgBase = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('discDmg'));
    const wid = w.evolved ? 'be_quantum_roulette' : 'probability_disc';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.discs.length - 1; i >= 0; i--) {
      const ds = w.discs[i]; ds.t += dt;
      if (!ds.tgt || ds.tgt.hp <= 0) {                             // retarget/λήξη
        ds.tgt = null;
        let bd = d.bounceRange * d.bounceRange;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(ds.x, ds.y, d.bounceRange) : rt.game.enemies;
        for (const e of near) { if (e && e.hp > 0 && !ds.hit.has(e)) {
          const dd = (e.pos.x - ds.x) ** 2 + (e.pos.y - ds.y) ** 2; if (dd < bd) { bd = dd; ds.tgt = e; } } }
        if (!ds.tgt) { w.discs.splice(i, 1); continue; }
      }
      const spd = d.speed * ds.mods.speed;
      const dx = ds.tgt.pos.x - ds.x, dy = ds.tgt.pos.y - ds.y, dist = Math.hypot(dx, dy) || 1;
      ds.x += (dx / dist) * spd * dt; ds.y += (dy / dist) * spd * dt;
      if (dist < d.size * ds.mods.size + ds.tgt.radius) {
        const e = ds.tgt;
        ds.hit.add(e);
        rt._dealDamage(wid, e, dmgBase * ds.mods.dmg, bm, ds.mods.crit || Math.random() < d.critChance);
        ds.bouncesLeft--;
        if (ds.bouncesLeft <= 0) { w.discs.splice(i, 1); continue; }
        // ΜΕΤΑΛΛΑΞΗ: roulette roll (evolution: ΚΡΑΤΑ τα προηγούμενα — stacking).
        // P2.9 GUARDRAIL: το stacking έβγαινε 3-10x πάνω από κάθε άλλο evolution στα
        // smoke tests — cap στα 4 stacked rolls· μετά τα rolls ΑΝΤΙΚΑΘΙΣΤΟΥΝ αντί να στοιβάζουν.
        ds.stackN = (ds.stackN || 0) + 1;
        if (!w.evolved || ds.stackN > 4) ds.mods = { size: 1, speed: 1, dmg: 1, crit: false };
        const roll = ['bigger', 'faster', 'double', 'reverse', 'crit'][Math.floor(Math.random() * 5)];
        ds.roll = roll;
        if (roll === 'bigger') { ds.mods.size *= 1.35; ds.mods.dmg *= 1.2; }
        else if (roll === 'faster') { ds.mods.speed *= 1.3; }
        else if (roll === 'crit') { ds.mods.crit = true; }
        else if (roll === 'reverse') { ds.mods.dmg *= 1.25; ds.hit.clear(); }
        else if (roll === 'double' && w.discs.length < d.maxActive) {
          w.discs.push({ x: ds.x, y: ds.y, tgt: null, t: 0, bouncesLeft: Math.min(2, ds.bouncesLeft),
            mods: { ...ds.mods }, hit: new Set([e]), roll: '' });
        }
        ds.tgt = null;                                             // επόμενος στόχος στο loop
      }
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.probability_disc;
    for (const ds of (w.discs || [])) {
      const R = d.size * ds.mods.size;
      ctx.save(); ctx.translate(ds.x, ds.y); ctx.rotate(ds.t * 9);
      ctx.globalCompositeOperation = 'lighter';
      // ULTIMATE PASS: το roll φαίνεται — χρώμα παλμού ανά μετάλλαξη
      const ROLLC = { bigger: '#ffb46b', faster: '#6bffd8', double: '#6bd8ff', reverse: '#ff6b6b', crit: '#ff6bd6' };
      if (ds.roll) {
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(rt._t * 14);
        ctx.strokeStyle = ROLLC[ds.roll] || '#b17bff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, R * 1.9, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 0.30;                                      // violet halo
      ctx.fillStyle = ds.mods.crit ? '#ff6bd6' : '#b17bff';
      ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85;                                      // σώμα: δίσκος με εγκοπές πιθανότητας
      ctx.strokeStyle = '#e6d5ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      for (let q = 0; q < 6; q++) { const qa = q * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(Math.cos(qa) * R * 0.45, Math.sin(qa) * R * 0.45);
        ctx.lineTo(Math.cos(qa) * R, Math.sin(qa) * R); ctx.stroke(); }
      ctx.globalAlpha = 0.95;                                      // λευκός πυρήνας
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
};

// ═══ 17 · AXIOM RAY — γραμμή + συμμετρική 2η, τομές = bonus ·
//        Recursive Proof -> BE_FRACTAL_VERDICT (Sierpinski damage regions) ═══
WEAPON_DEFS.axiom_ray = {
  name: 'Axiom Ray', owner: 'euclid_vector', category: 'weapon', kind: 'beam_line',
  damage:   [14, 17, 20, 25, 31],
  cooldown: [1.45, 1.35, 1.25, 1.12, 1.00],
  amount:   [1, 1, 1, 1, 1],
  range: 340, width: 12, intersectBonus: 0.5,
  critChance: 0.07, critMult: 1.6,
  bossMultiplier: 0.85, maxActive: 6,
  tags: ['GEOMETRY', 'BEAM', 'TOXIN'],
  evolutionPassive: 'recursive_proof', evolution: 'be_fractal_verdict',
  desc: 'A proof drawn in light — one ray and its mirror; where they cross, the theorem bites.',
};
PASSIVE_DEFS.recursive_proof = {
  name: 'Recursive Proof', category: 'evolution_passive', owner: null,
  forWeapon: 'axiom_ray', requiredFor: 'be_fractal_verdict', maxLevel: 3,
  bonuses: [ { rayDmg: 0.08 }, { rayDmg: 0.08, rayRange: 0.10 }, { rayDmg: 0.12, rayRange: 0.15 } ],
  desc: 'The proof calls itself. Powers the Fractal Verdict.',
};
EVOLUTION_RECIPES.be_fractal_verdict = {
  name: 'Fractal Verdict', weapon: 'axiom_ray', passive: 'recursive_proof',
  weaponLevel: 5, passiveLevel: 3,
  damage: 36, cooldown: 1.30,
  fractal: { size: 150, ticks: 3, tickDmg: 18, dur: 1.0 },   // Sierpinski: κάθε τρίγωνο = damage region
  bossMultiplier: 0.80, tags: ['GEOMETRY', 'BEAM', 'FRACTAL'],
  desc: 'The verdict unfolds as a Sierpinski field — every triangle a sentence, every tick a proof.',
};

WEAPON_EXECUTORS.axiom_ray = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.axiom_ray, evo = EVOLUTION_RECIPES.be_fractal_verdict;
    const p = rt.game.player;
    w.rays = w.rays || []; w.fractals = w.fractals || [];
    w.cd -= dt;
    if (w.cd <= 0 && w.rays.length < d.maxActive) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const a = aimAngle(rt);
      const R = d.range * (1 + rt._catalystSum('rayRange'));
      const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('rayDmg'));
      const wid = w.evolved ? 'be_fractal_verdict' : 'axiom_ray';
      const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
      const beams = [a, -a];                                       // συμμετρική 2η (κατοπτρισμός στον άξονα x)
      const hitBy = new Map();                                     // e -> πλήθος beams που τον χτύπησαν
      for (const ba of beams) {
        const ex = p.pos.x + Math.cos(ba) * R, ey = p.pos.y + Math.sin(ba) * R;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query((p.pos.x + ex) / 2, (p.pos.y + ey) / 2, R / 2 + 80) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          if (!segHit(p.pos.x, p.pos.y, ex, ey, e, d.width / 2)) continue;
          hitBy.set(e, (hitBy.get(e) || 0) + 1);
        }
      }
      for (const [e, cnt] of hitBy) {
        const mult = cnt > 1 ? 1 + d.intersectBonus : 1;           // τομή = bonus
        rt._dealDamage(wid, e, dmg * mult, bm, Math.random() < d.critChance);
      }
      w.rays.push({ a, R, t: 0, x: p.pos.x, y: p.pos.y });
      // FRACTAL VERDICT: Sierpinski πεδίο στο άκρο της κύριας ακτίνας
      if (w.evolved && w.fractals.length < 2) {
        const fx = p.pos.x + Math.cos(a) * R * 0.7, fy = p.pos.y + Math.sin(a) * R * 0.7;
        w.fractals.push({ x: fx, y: fy, t: 0, next: 0, ticks: 0 });
      }
    }
    for (let i = w.rays.length - 1; i >= 0; i--) { w.rays[i].t += dt; if (w.rays[i].t >= 0.25) w.rays.splice(i, 1); }
    for (let i = w.fractals.length - 1; i >= 0; i--) {
      const f = w.fractals[i]; f.t += dt; f.next -= dt;
      if (f.next <= 0 && f.ticks < evo.fractal.ticks) {
        f.next = evo.fractal.dur / evo.fractal.ticks; f.ticks++;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(f.x, f.y, evo.fractal.size + 60) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          // μέσα στο εξωτερικό τρίγωνο (προσέγγιση: ακτίνα εγγεγραμμένου κύκλου)
          if (Math.hypot(e.pos.x - f.x, e.pos.y - f.y) > evo.fractal.size * 0.58 + e.radius) continue;
          rt._dealDamage('be_fractal_verdict', e, evo.fractal.tickDmg, evo.bossMultiplier, false);
        }
      }
      if (f.t >= evo.fractal.dur) w.fractals.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.axiom_ray, evo = EVOLUTION_RECIPES.be_fractal_verdict;
    for (const r of (w.rays || [])) {
      const fade = 1 - r.t / 0.25;
      for (const ba of [r.a, -r.a]) {
        const ex = r.x + Math.cos(ba) * r.R, ey = r.y + Math.sin(ba) * r.R;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.28 * fade;                             // toxin-green halo
        ctx.strokeStyle = '#7CFF3C'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 0.9 * fade;                              // λευκός πυρήνας
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(ex, ey); ctx.stroke();
        // ULTIMATE PASS: QED σημάδια απόδειξης που παρελαύνουν στη γραμμή
        ctx.globalAlpha = 0.8 * fade; ctx.lineWidth = 1.6;
        for (let q = 0; q < 4; q++) {
          const f = ((rt._t * 0.9 + q * 0.25) % 1);
          const qx = r.x + (ex - r.x) * f, qy = r.y + (ey - r.y) * f;
          ctx.beginPath(); ctx.moveTo(qx - 3, qy - 3); ctx.lineTo(qx + 3, qy + 3); ctx.stroke();
        }
        // τρίγωνο-σφραγίδα αξιώματος στο άκρο
        ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = '#7CFF3C'; ctx.lineWidth = 1.4;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(ba + rt._t * 3);
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, 4.5); ctx.lineTo(-4, -4.5); ctx.closePath(); ctx.stroke();
        ctx.restore();
        ctx.restore();
      }
    }
    // Sierpinski: 3 εμφωλευμένα τρίγωνα
    const tri = (ctx, x, y, s, rot) => {
      ctx.beginPath();
      for (let q = 0; q < 3; q++) { const qa = rot + q * (Math.PI * 2 / 3) - Math.PI / 2;
        const px = x + Math.cos(qa) * s, py = y + Math.sin(qa) * s;
        q === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.closePath();
    };
    for (const f of (w.fractals || [])) {
      const k = f.t / evo.fractal.dur, fade = 1 - k * 0.6;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 * fade; ctx.strokeStyle = '#7CFF3C'; ctx.lineWidth = 3;
      tri(ctx, f.x, f.y, evo.fractal.size * 0.6, k); ctx.stroke();
      ctx.globalAlpha = 0.5 * fade; ctx.lineWidth = 2;
      tri(ctx, f.x, f.y, evo.fractal.size * 0.36, -k * 1.4); ctx.stroke();
      ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      tri(ctx, f.x, f.y, evo.fractal.size * 0.2, k * 2); ctx.stroke();
      ctx.restore();
    }
  },
};

// ═══ 18 · PHI CUTTER — λεπίδα σε λογαριθμική σπείρα, bonus έξω, επιστρέφει ·
//        Fibonacci Engine -> BE_GOLDEN_SPIRAL_GUILLOTINE ═══
WEAPON_DEFS.phi_cutter = {
  name: 'Phi Cutter', owner: 'euclid_vector', category: 'weapon', kind: 'spiral_blade',
  damage:   [12, 14, 17, 21, 26],
  cooldown: [1.75, 1.62, 1.50, 1.35, 1.20],
  amount:   [1, 1, 1, 1, 1],
  maxR: 200, spins: 1.6, dur: 1.5, outerFrom: 0.6, outerBonus: 0.35,
  critChance: 0.08, critMult: 1.7,
  bossMultiplier: 0.85, maxActive: 3,
  tags: ['GEOMETRY', 'SPIRAL', 'BLADE'],
  evolutionPassive: 'fibonacci_engine', evolution: 'be_golden_spiral_guillotine',
  desc: 'A blade riding the golden spiral — it cuts deepest far from home, then rides back.',
};
PASSIVE_DEFS.fibonacci_engine = {
  name: 'Fibonacci Engine', category: 'evolution_passive', owner: null,
  forWeapon: 'phi_cutter', requiredFor: 'be_golden_spiral_guillotine', maxLevel: 3,
  bonuses: [ { phiDmg: 0.08 }, { phiDmg: 0.08, phiRadius: 0.12 }, { phiDmg: 0.12, phiRadius: 0.18 } ],
  desc: 'The sequence turns itself. Powers the Golden Spiral Guillotine.',
};
EVOLUTION_RECIPES.be_golden_spiral_guillotine = {
  name: 'Golden Spiral Guillotine', weapon: 'phi_cutter', passive: 'fibonacci_engine',
  weaponLevel: 5, passiveLevel: 3,
  damage: 32, cooldown: 1.05, maxR: 250, blades: 2,
  bossMultiplier: 0.80, tags: ['GEOMETRY', 'SPIRAL', 'BLADE', 'GOLDEN'],
  desc: 'Two golden blades spiral out in perfect opposition — a guillotine drawn by phi itself.',
};

WEAPON_EXECUTORS.phi_cutter = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.phi_cutter, evo = EVOLUTION_RECIPES.be_golden_spiral_guillotine;
    const p = rt.game.player;
    w.blades = w.blades || [];
    w.cd -= dt;
    if (w.cd <= 0 && w.blades.length < d.maxActive * (w.evolved ? 2 : 1)) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const nB = w.evolved ? evo.blades : 1;
      const base = aimAngle(rt);
      for (let k = 0; k < nB; k++)
        w.blades.push({ a0: base + k * Math.PI, t: 0, hit: new Map() });
    }
    const maxR = (w.evolved ? evo.maxR : d.maxR) * (1 + rt._catalystSum('phiRadius'));
    const dmgBase = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('phiDmg'));
    const wid = w.evolved ? 'be_golden_spiral_guillotine' : 'phi_cutter';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.blades.length - 1; i >= 0; i--) {
      const b = w.blades[i]; b.t += dt;
      const prog = b.t / d.dur;
      if (prog >= 1) { w.blades.splice(i, 1); continue; }
      // out (0..0.55) κατά τη σπείρα, return (0.55..1)
      const outP = prog < 0.55 ? prog / 0.55 : (1 - prog) / 0.45;
      const R = maxR * outP;
      const ang = b.a0 + prog * d.spins * Math.PI * 2;
      const bx = p.pos.x + Math.cos(ang) * R, by = p.pos.y + Math.sin(ang) * R;
      b.x = bx; b.y = by; b.ang = ang;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(bx, by, 60) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0) continue;
        if ((e.pos.x - bx) ** 2 + (e.pos.y - by) ** 2 > (16 + e.radius) ** 2) continue;
        const okAt = b.hit.get(e) || 0;
        if (b.t < okAt) continue;
        b.hit.set(e, b.t + 0.4);
        const dmg = dmgBase * (R > maxR * d.outerFrom ? 1 + d.outerBonus : 1);   // bonus στην έξω ζώνη
        rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
      }
    }
  },
  draw(rt, ctx, w) {
    const dD = WEAPON_DEFS.phi_cutter, evoD = EVOLUTION_RECIPES.be_golden_spiral_guillotine;
    const pp = rt.game.player;
    const maxR = (w.evolved ? evoD.maxR : dD.maxR) * (1 + rt._catalystSum('phiRadius'));
    for (const b of (w.blades || [])) {
      if (b.x === undefined) continue;
      // ULTIMATE PASS: ο δρόμος της χρυσής σπείρας — αχνά σημάδια φ πίσω από τη λεπίδα
      const progB = b.t / dD.dur;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.20; ctx.strokeStyle = w.evolved ? '#ffd447' : '#7CFF3C'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let q = 0; q <= 9; q++) {
        const f = Math.max(0, progB - q * 0.022);
        const outF = f < 0.55 ? f / 0.55 : (1 - f) / 0.45;
        const qa = b.a0 + f * dD.spins * Math.PI * 2, qr = maxR * outF;
        const qx = pp.pos.x + Math.cos(qa) * qr, qy = pp.pos.y + Math.sin(qa) * qr;
        q === 0 ? ctx.moveTo(qx, qy) : ctx.lineTo(qx, qy);
      }
      ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate((b.ang || 0) + Math.PI / 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30;                                      // golden halo
      ctx.fillStyle = w.evolved ? '#ffd447' : '#7CFF3C';
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.8;                                       // σώμα: καμπύλη λεπίδα φ
      ctx.strokeStyle = w.evolved ? '#ffe89a' : '#b8ff7c'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.quadraticCurveTo(7, 0, 0, 13); ctx.stroke();
      ctx.globalAlpha = 0.95;                                      // λευκή ακμή
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(4, 0, 0, 11); ctx.stroke();
      ctx.restore();
    }
  },
};

// ═══ 19 · HANNYA CLEAVER — αργό τεράστιο swing, Fear σε μικρούς, kills = red charge ·
//        Demon Calligraphy -> BE_HANNYA_BRAND (φλεγόμενο kanji -> έκρηξη) ═══
WEAPON_DEFS.hannya_cleaver = {
  name: 'Hannya Cleaver', owner: 'oni_cataclysm_protocol', category: 'weapon', kind: 'heavy_arc',
  damage:   [30, 35, 42, 51, 62],
  cooldown: [2.30, 2.15, 2.00, 1.85, 1.70],
  amount:   [1, 1, 1, 1, 1],
  radius: 132, arc: 1.65, windup: 0.38, fearDur: 0.8,
  rage: { perKill: 0.04, cap: 10, decay: 5.0 },     // kills = κόκκινη φόρτιση (+4%/stack, max 10)
  critChance: 0.10, critMult: 1.8,
  bossMultiplier: 0.85, maxActive: 2,
  tags: ['ONI', 'MELEE', 'ARC', 'FEAR'],
  evolutionPassive: 'demon_calligraphy', evolution: 'be_hannya_brand',
  desc: 'A monstrous cleaver arc — the small ones flee, and every kill feeds the red charge.',
};
PASSIVE_DEFS.demon_calligraphy = {
  name: 'Demon Calligraphy', category: 'evolution_passive', owner: null,
  forWeapon: 'hannya_cleaver', requiredFor: 'be_hannya_brand', maxLevel: 3,
  bonuses: [ { cleaverDmg: 0.08 }, { cleaverDmg: 0.08, rageCap: 2 }, { cleaverDmg: 0.12, rageCap: 4 } ],
  desc: 'Each stroke is a brushstroke. Powers the Hannya Brand.',
};
EVOLUTION_RECIPES.be_hannya_brand = {
  name: 'Hannya Brand', weapon: 'hannya_cleaver', passive: 'demon_calligraphy',
  weaponLevel: 5, passiveLevel: 3,
  damage: 72, cooldown: 1.55,
  brand: { every: 3, radius: 92, igniteDelay: 0.8, dmg: 60, burnDps: 14, burnDur: 2.5 },
  bossMultiplier: 0.80, tags: ['ONI', 'MELEE', 'ARC', 'KANJI', 'BURN'],
  desc: 'Every third swing brands a burning kanji into the ground — then it IGNITES in blue fire.',
};

WEAPON_EXECUTORS.hannya_cleaver = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.hannya_cleaver, evo = EVOLUTION_RECIPES.be_hannya_brand;
    const p = rt.game.player;
    w.swings = w.swings || []; w.brands = w.brands || []; w.rage = w.rage || 0; w.rageT = w.rageT || 0;
    w.swingN = w.swingN || 0;
    w.rageT -= dt; if (w.rageT <= 0 && w.rage > 0) { w.rage = Math.max(0, w.rage - dt * 2); }
    w.cd -= dt;
    if (w.cd <= 0 && w.swings.length < d.maxActive) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      w.swingN++;
      w.swings.push({ dir: aimAngle(rt), t: 0, fired: false, x: p.pos.x, y: p.pos.y,
                      brand: w.evolved && (w.swingN % evo.brand.every === 0) });
    }
    const rageCap = d.rage.cap + rt._catalystSum('rageCap');
    const dmgBase = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('cleaverDmg'))
                    * (1 + Math.min(w.rage, rageCap) * d.rage.perKill);
    const wid = w.evolved ? 'be_hannya_brand' : 'hannya_cleaver';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.swings.length - 1; i >= 0; i--) {
      const s = w.swings[i]; s.t += dt;
      if (!s.fired && s.t >= d.windup) {
        s.fired = true; s.x = p.pos.x; s.y = p.pos.y;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(s.x, s.y, d.radius + 60) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          const dx = e.pos.x - s.x, dy = e.pos.y - s.y, dist = Math.hypot(dx, dy);
          if (dist > d.radius + e.radius) continue;
          if (Math.abs(angDiff(Math.atan2(dy, dx), s.dir)) > d.arc / 2) continue;
          const wasAlive = e.hp > 0;
          rt._dealDamage(wid, e, dmgBase, bm, Math.random() < d.critChance);
          rt.applyFear(e, d.fearDur);
          if (wasAlive && e.hp <= 0) { w.rage = Math.min(rageCap, w.rage + 1); w.rageT = d.rage.decay; }
        }
        if (s.brand) {                                             // BRAND: kanji στο έδαφος
          const bx = s.x + Math.cos(s.dir) * d.radius * 0.62, by = s.y + Math.sin(s.dir) * d.radius * 0.62;
          w.brands.push({ x: bx, y: by, t: 0, lit: false,
            strokes: Array.from({ length: 6 }, () => [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60,
                                                       (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60]) });
          if (w.brands.length > 3) w.brands.shift();
        }
      }
      if (s.t >= d.windup + 0.34) w.swings.splice(i, 1);
    }
    for (let i = w.brands.length - 1; i >= 0; i--) {
      const b = w.brands[i]; b.t += dt;
      if (!b.lit && b.t >= evo.brand.igniteDelay) {
        b.lit = true;                                              // ΕΚΡΗΞΗ μπλε oni-φωτιάς
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(b.x, b.y, evo.brand.radius + 60) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          if (Math.hypot(e.pos.x - b.x, e.pos.y - b.y) > evo.brand.radius + e.radius) continue;
          rt._dealDamage('be_hannya_brand', e, evo.brand.dmg, evo.bossMultiplier, false);
          rt.applyBurn(e, evo.brand.burnDps, evo.brand.burnDur, 'be_hannya_brand');
        }
        if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: b.x, y: b.y, r: evo.brand.radius, t: 0, life: 0.4, col: '#4d7cff' });
      }
      if (b.t >= evo.brand.igniteDelay + 0.5) w.brands.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.hannya_cleaver, evo = EVOLUTION_RECIPES.be_hannya_brand;
    const p = rt.game.player;
    for (const s of (w.swings || [])) {
      if (!s.fired) {                                              // windup: κόκκινη τηλεγράφηση + ΜΑΣΚΑ ONI
        const k = s.t / d.windup;
        ctx.save(); ctx.translate(p.pos.x, p.pos.y);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.14 + 0.16 * k;
        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, d.radius, s.dir - d.arc / 2, s.dir + d.arc / 2); ctx.closePath(); ctx.fill();
        if (k > 0.5) {                                             // δύο μάτια hannya ανάβουν στο σκοτάδι του κώνου
          const mx = Math.cos(s.dir) * d.radius * 0.5, my = Math.sin(s.dir) * d.radius * 0.5;
          ctx.globalAlpha = (k - 0.5) * 2;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(mx - 7, my - 3, 3.5, 1.6, s.dir, 0, Math.PI * 2);
          ctx.ellipse(mx + 7, my - 3, 3.5, 1.6, s.dir, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore(); continue;
      }
      const k = (s.t - d.windup) / 0.34, fade = 1 - k;
      const a0 = s.dir - d.arc / 2, a1 = a0 + d.arc * Math.min(1, k * 2.2);
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.32 * fade;                               // κόκκινο oni halo
      ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.arc(0, 0, d.radius * 0.88, a0, a1); ctx.stroke();
      ctx.globalAlpha = 0.6 * fade;                                // σώμα λεπίδας
      ctx.strokeStyle = '#ff8a7a'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(0, 0, d.radius * 0.95, a0, a1); ctx.stroke();
      ctx.globalAlpha = 0.95 * fade;                               // λευκή ακμή
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, d.radius, a0, a1); ctx.stroke();
      ctx.restore();
    }
    // RED CHARGE: πύρινες γλώσσες οργής σε τόξο πάνω από τον παίκτη (1 ανά kill-stack)
    if ((w.rage || 0) >= 1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const nR = Math.min(12, Math.floor(w.rage));
      for (let q = 0; q < nR; q++) {
        const qa = -Math.PI / 2 + (q - (nR - 1) / 2) * 0.22;
        const fl = 6 + 3 * Math.sin(rt._t * 12 + q * 2);
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(p.pos.x + Math.cos(qa) * 26, p.pos.y + Math.sin(qa) * 26);
        ctx.lineTo(p.pos.x + Math.cos(qa) * (26 + fl), p.pos.y + Math.sin(qa) * (26 + fl)); ctx.stroke();
      }
      ctx.restore();
    }
    for (const b of (w.brands || [])) {
      const kW = Math.min(1, b.t / evo.brand.igniteDelay);
      const strokesToShow = Math.ceil(kW * b.strokes.length);
      ctx.save(); ctx.translate(b.x, b.y);
      ctx.globalCompositeOperation = 'lighter';
      const col = b.lit ? '#4d7cff' : '#ff4d4d';
      ctx.globalAlpha = b.lit ? 0.7 : 0.45;                        // πινελιές kanji
      ctx.strokeStyle = col; ctx.lineWidth = b.lit ? 5 : 3.5; ctx.lineCap = 'round';
      for (let q = 0; q < strokesToShow; q++) { const st = b.strokes[q];
        ctx.beginPath(); ctx.moveTo(st[0], st[1]); ctx.lineTo(st[2], st[3]); ctx.stroke(); }
      ctx.globalAlpha = b.lit ? 0.95 : 0.6;                        // λευκή άκρη πινέλου
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      for (let q = 0; q < strokesToShow; q++) { const st = b.strokes[q];
        ctx.beginPath(); ctx.moveTo(st[0], st[1]); ctx.lineTo(st[2], st[3]); ctx.stroke(); }
      if (b.lit) {                                                 // δαχτυλίδι μπλε φωτιάς
        ctx.globalAlpha = 0.5; ctx.strokeStyle = '#4d7cff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, evo.brand.radius * Math.min(1, (b.t - evo.brand.igniteDelay) / 0.3), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  },
};

// ═══ 20 · HUNGRY SPIRIT LANTERN — πνεύματα σε low-HP στόχους, επιστροφές
//        φορτίζουν wave · Yomi Incense -> BE_GATE_OF_HUNGRY_GHOSTS (πύλη-πομπή) ═══
WEAPON_DEFS.hungry_spirit_lantern = {
  name: 'Hungry Spirit Lantern', owner: 'oni_cataclysm_protocol', category: 'weapon', kind: 'seeker_spirit',
  damage:   [10, 12, 15, 18, 22],
  cooldown: [1.55, 1.45, 1.32, 1.20, 1.08],
  amount:   [2, 2, 3, 3, 3],
  seekRange: 360, speed: 330,
  wave: { charges: 6, dmg: 26, radius: 140 },
  critChance: 0.06, critMult: 1.5,
  bossMultiplier: 0.80, maxActive: 9,
  tags: ['ONI', 'SPIRIT', 'SEEKER', 'WAVE'],
  evolutionPassive: 'yomi_incense', evolution: 'be_gate_of_hungry_ghosts',
  desc: 'Lantern spirits hunt the weakest — each one that returns feeds the hungry wave.',
};
PASSIVE_DEFS.yomi_incense = {
  name: 'Yomi Incense', category: 'evolution_passive', owner: null,
  forWeapon: 'hungry_spirit_lantern', requiredFor: 'be_gate_of_hungry_ghosts', maxLevel: 3,
  bonuses: [ { spiritDmg: 0.10 }, { spiritDmg: 0.10, spiritCount: 1 }, { spiritDmg: 0.15, spiritCount: 1 } ],
  desc: 'Smoke that the dead can smell. Powers the Gate of Hungry Ghosts.',
};
EVOLUTION_RECIPES.be_gate_of_hungry_ghosts = {
  name: 'Gate of Hungry Ghosts', weapon: 'hungry_spirit_lantern', passive: 'yomi_incense',
  weaponLevel: 5, passiveLevel: 3,
  damage: 26, cooldown: 0.95,
  gate: { every: 6.0, ghosts: 5, length: 300, width: 26, ghostDmg: 24, stagger: 0.35 },
  bossMultiplier: 0.75, tags: ['ONI', 'SPIRIT', 'GATE', 'PROCESSION'],
  desc: 'A torii gate rises — five hungry ghosts march out in procession, devouring the path.',
};

WEAPON_EXECUTORS.hungry_spirit_lantern = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.hungry_spirit_lantern, evo = EVOLUTION_RECIPES.be_gate_of_hungry_ghosts;
    const p = rt.game.player;
    w.spirits = w.spirits || []; w.charges = w.charges || 0; w.gateT = (w.gateT ?? evo.gate.every); w.gate = w.gate || null;
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      // στόχευση: οι πιο low-HP εντός εμβέλειας
      const cand = [];
      for (const e of rt.game.enemies) {
        if (!e || e.hp <= 0) continue;
        if ((e.pos.x - p.pos.x) ** 2 + (e.pos.y - p.pos.y) ** 2 > d.seekRange * d.seekRange) continue;
        cand.push(e);
      }
      cand.sort((a, b) => (a.hp / (a.maxHp || 1)) - (b.hp / (b.maxHp || 1)));
      const n = Math.min((w.evolved ? 3 : lvl(d, w, 'amount')) + rt._catalystSum('spiritCount'),
                         cand.length, d.maxActive - w.spirits.length);
      for (let k = 0; k < n; k++)
        w.spirits.push({ x: p.pos.x, y: p.pos.y, tgt: cand[k], back: false, ph: Math.random() * 6 });
    }
    const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('spiritDmg'));
    const wid = w.evolved ? 'be_gate_of_hungry_ghosts' : 'hungry_spirit_lantern';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.spirits.length - 1; i >= 0; i--) {
      const s = w.spirits[i]; s.ph += dt * 7;
      const tx = s.back ? p.pos.x : (s.tgt && s.tgt.hp > 0 ? s.tgt.pos.x : p.pos.x);
      const ty = s.back ? p.pos.y : (s.tgt && s.tgt.hp > 0 ? s.tgt.pos.y : p.pos.y);
      if (!s.back && (!s.tgt || s.tgt.hp <= 0)) { s.back = true; }
      const dx = tx - s.x, dy = ty - s.y, dist = Math.hypot(dx, dy) || 1;
      s.x += (dx / dist) * d.speed * dt + Math.sin(s.ph) * 18 * dt;
      s.y += (dy / dist) * d.speed * dt + Math.cos(s.ph) * 18 * dt;
      if (!s.back && dist < 14 + (s.tgt.radius || 0)) {
        rt._dealDamage(wid, s.tgt, dmg, bm, Math.random() < d.critChance);
        s.back = true;
      } else if (s.back && dist < 22) {
        w.spirits.splice(i, 1);
        w.charges++;                                               // η επιστροφή φορτίζει το φανάρι
        if (w.charges >= d.wave.charges) {
          w.charges = 0;
          const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, d.wave.radius + 60) : rt.game.enemies;
          for (const e of near) {
            if (!e || e.hp <= 0) continue;
            if (Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) > d.wave.radius + e.radius) continue;
            rt._dealDamage(wid, e, d.wave.dmg, bm, false);
          }
          if (rt.fx.length < 48) rt.fx.push({ kind: 'shockring', x: p.pos.x, y: p.pos.y, r: d.wave.radius, t: 0, life: 0.4, col: '#9a6bff' });
        }
      }
    }
    // GATE OF HUNGRY GHOSTS: πομπή 5 φαντασμάτων σε ευθεία
    if (w.evolved) {
      w.gateT -= dt;
      if (w.gateT <= 0 && !w.gate) {
        w.gateT = evo.gate.every;
        const dir = aimAngle(rt);
        w.gate = { x: p.pos.x + Math.cos(dir) * 40, y: p.pos.y + Math.sin(dir) * 40, dir, t: 0,
                   ghosts: Array.from({ length: evo.gate.ghosts }, (_, q) => ({ off: -q * 44, hit: new Set() })) };
      }
      if (w.gate) {
        const gt = w.gate; gt.t += dt;
        const speed = 260;
        for (const gh of gt.ghosts) {
          gh.off += speed * dt;
          if (gh.off < 0 || gh.off > evo.gate.length) continue;
          const gx = gt.x + Math.cos(gt.dir) * gh.off, gy = gt.y + Math.sin(gt.dir) * gh.off;
          const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(gx, gy, 60) : rt.game.enemies;
          for (const e of near) {
            if (!e || e.hp <= 0 || gh.hit.has(e)) continue;
            if ((e.pos.x - gx) ** 2 + (e.pos.y - gy) ** 2 > (evo.gate.width / 2 + e.radius) ** 2) continue;
            gh.hit.add(e);
            rt._dealDamage('be_gate_of_hungry_ghosts', e, evo.gate.ghostDmg, evo.bossMultiplier, false);
            if (!e.isBoss?.() && !e.isMegaBoss) { e.slowTimer = Math.max(e.slowTimer || 0, evo.gate.stagger); e.slowFactor = 0.12; }
          }
        }
        if (gt.ghosts.every(gh => gh.off > evo.gate.length)) w.gate = null;
      }
    }
  },
  draw(rt, ctx, w) {
    const evo = EVOLUTION_RECIPES.be_gate_of_hungry_ghosts;
    const pl = rt.game.player, chg = (w.charges || 0) / WEAPON_DEFS.hungry_spirit_lantern.wave.charges;
    // ULTIMATE PASS: το ΦΑΝΑΡΙ — κρέμεται πάνω από τον παίκτη και γεμίζει με ψυχές
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lx = pl.pos.x, ly = pl.pos.y - 34 + Math.sin(rt._t * 2.2) * 2;
    ctx.globalAlpha = 0.20 + 0.35 * chg;                           // φωτεινότητα = φόρτιση
    ctx.fillStyle = '#9a6bff';
    ctx.beginPath(); ctx.arc(lx, ly, 10 + 5 * chg, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#3a2f52'; ctx.lineWidth = 1.4;   // σκελετός φαναριού
    ctx.strokeRect(lx - 4.5, ly - 6, 9, 12);
    ctx.beginPath(); ctx.moveTo(lx - 4.5, ly - 6); ctx.lineTo(lx, ly - 10); ctx.lineTo(lx + 4.5, ly - 6); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.5 * chg;                             // η φλόγα-ψυχή μέσα
    ctx.fillStyle = chg >= 1 ? '#ffffff' : '#c8a8ff';
    ctx.beginPath(); ctx.ellipse(lx, ly, 2.2 + 1.5 * chg, 3.4 + 1.5 * chg, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    for (const s of (w.spirits || [])) {
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30;                                      // πορφυρό halo πνεύματος
      ctx.fillStyle = '#9a6bff';
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35;                                      // wispy ουρά που κυματίζει
      ctx.strokeStyle = '#c8a8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 8);
      ctx.quadraticCurveTo(Math.sin(s.ph * 2) * 6, 16, Math.sin(s.ph * 3) * 4, 24); ctx.stroke();
      ctx.globalAlpha = 0.7;                                       // σώμα: φλογίτσα-πνεύμα με ουρά
      ctx.fillStyle = '#c8a8ff';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(6, 0, 0, 9); ctx.quadraticCurveTo(-6, 0, 0, -7); ctx.fill();
      ctx.globalAlpha = 0.95;                                      // λευκός πυρήνας
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -1, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (w.gate) {
      const gt = w.gate;
      ctx.save(); ctx.translate(gt.x, gt.y); ctx.rotate(gt.dir);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;                                       // torii: δύο στύλοι + διπλό υπέρθυρο
      ctx.strokeStyle = '#9a6bff'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, -30); ctx.lineTo(-8, 30); ctx.stroke();
      ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-14, -32); ctx.lineTo(6, -32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14, 32); ctx.lineTo(6, 32); ctx.stroke();
      ctx.restore();
      for (const gh of gt.ghosts) {
        if (gh.off < 0 || gh.off > evo.gate.length) continue;
        const gx = gt.x + Math.cos(gt.dir) * gh.off, gy = gt.y + Math.sin(gt.dir) * gh.off;
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(gt.dir + Math.PI / 2);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.32; ctx.fillStyle = '#9a6bff';         // halo
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.75; ctx.fillStyle = '#c8a8ff';         // σώμα-φάντασμα
        ctx.beginPath(); ctx.arc(0, -4, 7, Math.PI, 0);
        ctx.lineTo(7, 8); ctx.lineTo(3.5, 5); ctx.lineTo(0, 8); ctx.lineTo(-3.5, 5); ctx.lineTo(-7, 8);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.95; ctx.fillStyle = '#1a1030';         // μάτια
        ctx.beginPath(); ctx.arc(-2.4, -4, 1.4, 0, Math.PI * 2); ctx.arc(2.4, -4, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  },
};

export const BE_CHARS4 = ['phase_needle', 'probability_disc', 'axiom_ray', 'phi_cutter', 'hannya_cleaver', 'hungry_spirit_lantern'];
