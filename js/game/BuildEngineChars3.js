// ═══════════════════════════════════════════════════════════════════════════════
// P2.4a — BUILD ENGINE chars 6-7: EDDIE + DIMIS KICKBOXER
// Eddie: Solo Red Thunder = ΥΠΑΡΧΟΝ όπλο (external data-wrap, ΔΕΝ προσφέρεται ως
// κάρτα — μόνο catalyst + evolution) + Feedback Cabinet. Dimi: Cyber-Gauntlets
// Injection (Sanction Marks) + Holographic Energy Knuckles.
// Spec: docs/P2_BUILD_ENGINE_SPEC_GR.md. Συνταγή ultimates παντού.
// ═══════════════════════════════════════════════════════════════════════════════
import { WEAPON_DEFS, PASSIVE_DEFS, EVOLUTION_RECIPES, WEAPON_EXECUTORS }
  from './BuildEngine.js?v=20260719900000';

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
const isSmall = e => !(e.isBoss?.() || e.isMegaBoss || e.isElite || (e.rank && e.rank !== 'normal'));

// ═══ 11 · SOLO RED THUNDER — external data-wrap (§13 schema entry) ═══
// Το gameplay του παραμένει στο παλιό σύστημα μέχρι το P2.7 migration.
// Το entry υπάρχει ώστε catalyst/evolution/κάρτες να διαβάζουν ΕΝΑ data source.
WEAPON_DEFS.solo_red_thunder = {
  name: 'Solo Red Thunder', owner: 'eddie', category: 'weapon', kind: 'external',
  external: true,                                   // ΔΕΝ προσφέρεται ως κάρτα από το BuildEngine
  damage:   [15, 18, 22, 27, 33],                   // ενδεικτικά για κάρτες/κατάλογο (P2.8)
  cooldown: [1.25, 1.25, 1.25, 1.25, 1.25],
  amount:   [1, 1, 1, 2, 2],
  critChance: 0.10, critMult: 1.8,
  bossMultiplier: 0.85, maxActive: 12,
  tags: ['SOUND', 'LIGHTNING', 'BEAT'],
  evolutionPassive: 'forbidden_amplifier', evolution: 'be_solo_of_the_damned',
  desc: 'Every fourth note the solo arcs as lightning; on the beat, the crit echoes.',
};
PASSIVE_DEFS.forbidden_amplifier = {
  name: 'Forbidden Amplifier', category: 'evolution_passive', owner: null,
  forWeapon: 'solo_red_thunder', requiredFor: 'be_solo_of_the_damned', maxLevel: 3,
  bonuses: [ { soloChord: 1 }, { soloChord: 1, soloDmg: 0.10 }, { soloChord: 2, soloDmg: 0.18 } ],
  desc: 'An amplifier that should not exist. Powers the Solo of the Damned.',
};
EVOLUTION_RECIPES.be_solo_of_the_damned = {
  name: 'Solo of the Damned', weapon: 'solo_red_thunder', passive: 'forbidden_amplifier',
  weaponLevel: 5, passiveLevel: 3,
  chord: { every: 2.2, targets: 4, dmg: 30, hop: 1, hopDmg: 0.6, hopRange: 150, echoDmg: 0.5 },
  bossMultiplier: 0.80, tags: ['SOUND', 'LIGHTNING', 'CHORD'],
  desc: 'A damned power chord — red-white lightning strings lash the nearest four and arc onward.',
};

// evolved-only executor: πριν το evolution το όπλο ζει στο παλιό σύστημα
WEAPON_EXECUTORS.solo_red_thunder = {
  update(rt, w, dt) {
    if (!w.evolved) return;
    const evo = EVOLUTION_RECIPES.be_solo_of_the_damned, ch = evo.chord;
    const p = rt.game.player;
    w.bolts = w.bolts || []; w.chordT = (w.chordT ?? 0.8);
    w.chordT -= dt;
    if (w.chordT <= 0) {
      w.chordT = ch.every;
      const extra = rt._catalystSum('soloChord');
      const dmg = ch.dmg * (1 + rt._catalystSum('soloDmg'));
      const cand = [];
      for (const e of rt.game.enemies) {
        if (!e || e.hp <= 0) continue;
        const dd = (e.pos.x - p.pos.x) ** 2 + (e.pos.y - p.pos.y) ** 2;
        if (dd < 420 * 420) cand.push([dd, e]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      const targets = cand.slice(0, ch.targets + extra).map(c => c[1]);
      for (const e of targets) {
        const crit = Math.random() < WEAPON_DEFS.solo_red_thunder.critChance;
        rt._dealDamage('be_solo_of_the_damned', e, dmg, evo.bossMultiplier, crit);
        if (crit) rt._dealDamage('be_solo_of_the_damned', e, dmg * ch.echoDmg, evo.bossMultiplier, false);   // harmonic echo
        // chain hop στον κοντινότερο γείτονα
        let hopE = null, hd = ch.hopRange * ch.hopRange;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(e.pos.x, e.pos.y, ch.hopRange) : rt.game.enemies;
        for (const n2 of near) { if (n2 && n2.hp > 0 && n2 !== e) {
          const dd = (n2.pos.x - e.pos.x) ** 2 + (n2.pos.y - e.pos.y) ** 2; if (dd < hd) { hd = dd; hopE = n2; } } }
        if (hopE) rt._dealDamage('be_solo_of_the_damned', hopE, dmg * ch.hopDmg, evo.bossMultiplier, false);
        w.bolts.push({ x1: p.pos.x, y1: p.pos.y, x2: e.pos.x, y2: e.pos.y,
                       x3: hopE ? hopE.pos.x : null, y3: hopE ? hopE.pos.y : null, t: 0, life: 0.22 });
        if (w.bolts.length > 10) w.bolts.shift();
      }
    }
    for (let i = w.bolts.length - 1; i >= 0; i--) { w.bolts[i].t += dt; if (w.bolts[i].t >= w.bolts[i].life) w.bolts.splice(i, 1); }
  },
  draw(rt, ctx, w) {
    if (!w.evolved) return;
    for (const b of (w.bolts || [])) {
      const fade = 1 - b.t / b.life;
      const zig = (x1, y1, x2, y2, col, lw, al) => {
        ctx.globalAlpha = al * fade; ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x1, y1);
        const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * 14, my = (y1 + y2) / 2 + (Math.random() - 0.5) * 14;
        ctx.lineTo(mx, my); ctx.lineTo(x2, y2); ctx.stroke();
      };
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      zig(b.x1, b.y1, b.x2, b.y2, '#ff3b30', 5, 0.35);             // κόκκινο halo-χορδή
      zig(b.x1, b.y1, b.x2, b.y2, '#ffffff', 1.4, 0.95);           // λευκός πυρήνας
      if (b.x3 !== null) { zig(b.x2, b.y2, b.x3, b.y3, '#ff3b30', 4, 0.30); zig(b.x2, b.y2, b.x3, b.y3, '#ffffff', 1.1, 0.85); }
      ctx.restore();
    }
  },
};

// ═══ 12 · FEEDBACK CABINET — ηχείο, ορθογώνια κύματα, απωθεί μικρούς ·
//        Overdriven Vacuum Tube -> BE_AMP_OVERDRIVE_WALL (τοίχος ενισχυτών) ═══
WEAPON_DEFS.feedback_cabinet = {
  name: 'Feedback Cabinet', owner: 'eddie', category: 'weapon', kind: 'zone_wave',
  damage:   [12, 14, 17, 21, 26],
  cooldown: [1.80, 1.65, 1.50, 1.35, 1.20],
  amount:   [2, 2, 3, 3, 3],                        // κύματα ανά ριπή
  waveW: 120, waveH: 46, waveRange: 260, waveSpeed: 420, push: 110,
  critChance: 0.06, critMult: 1.5,
  bossMultiplier: 0.80, maxActive: 9,
  tags: ['SOUND', 'WAVE', 'KNOCKBACK'],
  evolutionPassive: 'overdriven_vacuum_tube', evolution: 'be_amp_overdrive_wall',
  desc: 'A feedback cabinet fires rectangular pressure waves that shove the small ones back.',
};
PASSIVE_DEFS.overdriven_vacuum_tube = {
  name: 'Overdriven Vacuum Tube', category: 'evolution_passive', owner: null,
  forWeapon: 'feedback_cabinet', requiredFor: 'be_amp_overdrive_wall', maxLevel: 3,
  bonuses: [ { waveDmg: 0.10 }, { waveDmg: 0.10, wavePush: 0.20 }, { waveDmg: 0.15, wavePush: 0.30 } ],
  desc: 'The tube glows past its rating — louder waves, harder shove. Powers the Overdrive Wall.',
};
EVOLUTION_RECIPES.be_amp_overdrive_wall = {
  name: 'Amp Overdrive Wall', weapon: 'feedback_cabinet', passive: 'overdriven_vacuum_tube',
  weaponLevel: 5, passiveLevel: 3,
  damage: 34, cooldown: 2.4,
  wall: { w: 560, h: 60, range: 380, speed: 380, push: 220 },
  bossMultiplier: 0.75, tags: ['SOUND', 'WAVE', 'WALL', 'KNOCKBACK'],
  desc: 'A wall of amplifiers slams one massive overdrive wave across the field.',
};

WEAPON_EXECUTORS.feedback_cabinet = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.feedback_cabinet, evo = EVOLUTION_RECIPES.be_amp_overdrive_wall;
    const p = rt.game.player;
    w.waves = w.waves || [];
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      const dir = aimAngle(rt);
      if (w.evolved) {
        if (w.waves.length < d.maxActive)
          w.waves.push({ dir, dist: 30, t: 0, hit: new Set(), wall: true, x: p.pos.x, y: p.pos.y });
      } else {
        const n = Math.min(lvl(d, w, 'amount'), d.maxActive - w.waves.length);
        for (let k = 0; k < n; k++)
          w.waves.push({ dir, dist: 30, t: -k * 0.14, hit: new Set(), wall: false, x: p.pos.x, y: p.pos.y });
      }
    }
    const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('waveDmg'));
    const push = (w.evolved ? evo.wall.push : d.push) * (1 + rt._catalystSum('wavePush'));
    const wid = w.evolved ? 'be_amp_overdrive_wall' : 'feedback_cabinet';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.waves.length - 1; i >= 0; i--) {
      const wv = w.waves[i]; wv.t += dt;
      if (wv.t < 0) continue;
      const spd = wv.wall ? evo.wall.speed : d.waveSpeed, rng = wv.wall ? evo.wall.range : d.waveRange;
      wv.dist += spd * dt;
      const cx = wv.x + Math.cos(wv.dir) * wv.dist, cy = wv.y + Math.sin(wv.dir) * wv.dist;
      const halfW = (wv.wall ? evo.wall.w : d.waveW) / 2, halfH = (wv.wall ? evo.wall.h : d.waveH) / 2;
      const ax = cx - Math.sin(wv.dir) * halfW, ay = cy + Math.cos(wv.dir) * halfW;
      const bx = cx + Math.sin(wv.dir) * halfW, by = cy - Math.cos(wv.dir) * halfW;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(cx, cy, halfW + 80) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || wv.hit.has(e)) continue;
        if (!segHit(ax, ay, bx, by, e, halfH)) continue;
        wv.hit.add(e);
        rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
        if (isSmall(e) || wv.wall) if (!(e.isBoss?.() || e.isMegaBoss)) {
          e.pos.x += Math.cos(wv.dir) * push * 0.14; e.pos.y += Math.sin(wv.dir) * push * 0.14;   // σπρώξιμο
        }
      }
      if (wv.dist >= rng) w.waves.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.feedback_cabinet, evo = EVOLUTION_RECIPES.be_amp_overdrive_wall;
    for (const wv of (w.waves || [])) {
      if (wv.t < 0) continue;
      const rng = wv.wall ? evo.wall.range : d.waveRange, fade = 1 - wv.dist / rng;
      const cx = wv.x + Math.cos(wv.dir) * wv.dist, cy = wv.y + Math.sin(wv.dir) * wv.dist;
      const halfW = (wv.wall ? evo.wall.w : d.waveW) / 2, halfH = (wv.wall ? evo.wall.h : d.waveH) / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(wv.dir);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 * fade;                               // κόκκινο halo Eddie
      ctx.fillStyle = '#ff3b30'; ctx.fillRect(-halfH, -halfW, halfH * 2, halfW * 2);
      ctx.globalAlpha = 0.5 * fade;                                // σώμα: γραμμές πίεσης
      ctx.strokeStyle = '#ff6b5e'; ctx.lineWidth = 2;
      for (let q = -1; q <= 1; q++) { ctx.beginPath(); ctx.moveTo(q * halfH * 0.6, -halfW); ctx.lineTo(q * halfH * 0.6, halfW); ctx.stroke(); }
      // ULTIMATE PASS: EQUALIZER μέσα στο κύμα — μπάρες που χορεύουν στη συχνότητα
      ctx.globalAlpha = 0.65 * fade; ctx.strokeStyle = '#ffb3ab'; ctx.lineWidth = 2.5;
      const bars = Math.max(4, Math.floor(halfW / 16));
      for (let q = 0; q < bars; q++) {
        const by = -halfW + (q + 0.5) * (halfW * 2 / bars);
        const bh = (3 + 8 * Math.abs(Math.sin(rt._t * 11 + q * 1.7 + wv.dist * 0.03))) * fade;
        ctx.beginPath(); ctx.moveTo(-bh / 2, by); ctx.lineTo(bh / 2, by); ctx.stroke();
      }
      ctx.globalAlpha = 0.9 * fade;                                // λευκή μπροστινή ακμή
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(halfH, -halfW); ctx.lineTo(halfH, halfW); ctx.stroke();
      ctx.restore();
    }
  },
};

// ═══ 13 · CYBER-GAUNTLETS INJECTION — combo x3, το 3ο = SANCTION MARK ·
//        Ophanim Seal -> BE_SANCTION_HALO (χρυσές σφραγίδες, smite) ═══
WEAPON_DEFS.cyber_gauntlets_injection = {
  name: 'Cyber-Gauntlets Injection', owner: 'dimis_kickboxer', category: 'weapon', kind: 'combo_punch',
  damage:   [12, 14, 17, 21, 26],
  cooldown: [0.55, 0.50, 0.46, 0.42, 0.38],         // ανά χτύπημα του combo
  amount:   [1, 1, 1, 1, 1],
  radius: 78, arc: 0.85, comboFinisher: 1.6, markDur: 4.0, markBonus: 0.12,
  critChance: 0.09, critMult: 1.6,
  bossMultiplier: 0.85, maxActive: 4,
  tags: ['PUNCH', 'MELEE', 'MARK', 'COMBO'],
  evolutionPassive: 'ophanim_seal', evolution: 'be_sanction_halo',
  desc: 'A three-hit injection combo — the third strike brands a Sanction Mark on the victim.',
};
PASSIVE_DEFS.ophanim_seal = {
  name: 'Ophanim Seal', category: 'evolution_passive', owner: null,
  forWeapon: 'cyber_gauntlets_injection', requiredFor: 'be_sanction_halo', maxLevel: 3,
  bonuses: [ { gauntletDmg: 0.08 }, { gauntletDmg: 0.08, markBonus: 0.04 }, { gauntletDmg: 0.12, markBonus: 0.06 } ],
  desc: 'A burning wheel-seal turns above the fist. Powers the Sanction Halo.',
};
EVOLUTION_RECIPES.be_sanction_halo = {
  name: 'Sanction Halo', weapon: 'cyber_gauntlets_injection', passive: 'ophanim_seal',
  weaponLevel: 5, passiveLevel: 3,
  damage: 32, cooldown: 0.34,
  smite: { dmg: 42, radius: 54, perCombo: 1 },      // χρυσή στήλη σε κάθε marked στο 3ο χτύπημα
  bossMultiplier: 0.80, tags: ['PUNCH', 'MELEE', 'MARK', 'SMITE'],
  desc: 'Golden seals ring the fists — every finished combo calls a smite on the marked.',
};

WEAPON_EXECUTORS.cyber_gauntlets_injection = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.cyber_gauntlets_injection, evo = EVOLUTION_RECIPES.be_sanction_halo;
    const p = rt.game.player;
    w.hits = w.hits || []; w.combo = w.combo || 0; w.smites = w.smites || [];
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      w.combo = (w.combo % 3) + 1;
      const fin = w.combo === 3;
      const dir = aimAngle(rt);
      const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('gauntletDmg')) * (fin ? d.comboFinisher : 1);
      const wid = w.evolved ? 'be_sanction_halo' : 'cyber_gauntlets_injection';
      const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(p.pos.x, p.pos.y, d.radius + 60) : rt.game.enemies;
      const marked = [];
      for (const e of near) {
        if (!e || e.hp <= 0) continue;
        const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y, dist = Math.hypot(dx, dy);
        if (dist > d.radius + e.radius) continue;
        if (Math.abs(angDiff(Math.atan2(dy, dx), dir)) > d.arc / 2) continue;
        rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
        if (fin && e.hp > 0) {                                     // SANCTION MARK στο 3ο χτύπημα
          const st = rt._st(e); st.sanction = d.markDur; marked.push(e);
        }
      }
      w.hits.push({ dir, t: 0, combo: w.combo, x: p.pos.x, y: p.pos.y });
      if (w.hits.length > d.maxActive) w.hits.shift();
      if (w.evolved && fin)                                        // SMITE σε marked (evolution)
        for (const e of marked) w.smites.push({ x: e.pos.x, y: e.pos.y, e, t: 0, dur: 0.32, done: false });
    }
    for (let i = w.hits.length - 1; i >= 0; i--) { w.hits[i].t += dt; if (w.hits[i].t > 0.22) w.hits.splice(i, 1); }
    for (let i = w.smites.length - 1; i >= 0; i--) {
      const s = w.smites[i]; s.t += dt;
      if (!s.done && s.t >= 0.16) {
        s.done = true;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(s.x, s.y, evo.smite.radius + 60) : rt.game.enemies;
        for (const e of near) {
          if (!e || e.hp <= 0) continue;
          if (Math.hypot(e.pos.x - s.x, e.pos.y - s.y) > evo.smite.radius + e.radius) continue;
          rt._dealDamage('be_sanction_halo', e, evo.smite.dmg, evo.bossMultiplier, false);
        }
      }
      if (s.t >= s.dur) w.smites.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.cyber_gauntlets_injection;
    for (const h of (w.hits || [])) {
      const k = h.t / 0.22, fade = 1 - k;
      const fin = h.combo === 3;
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.dir);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.28 * fade;                               // χρυσό halo Dimi
      ctx.fillStyle = fin ? '#ffd447' : '#ffe89a';
      ctx.beginPath(); ctx.arc(d.radius * 0.6, 0, 26 + 8 * k, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.8 * fade;                                // σώμα: διπλή γραμμή γροθιάς
      ctx.strokeStyle = fin ? '#ffd447' : '#e8e8f0'; ctx.lineWidth = fin ? 4 : 2.5;
      ctx.beginPath(); ctx.moveTo(10, h.combo === 2 ? 6 : -6); ctx.lineTo(d.radius * 0.85, 0); ctx.stroke();
      // ULTIMATE PASS: αστέρι κρούσης στη γροθιά + ΤΡΟΧΟΣ-ΣΦΡΑΓΙΔΑ ophanim στο finisher
      ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      for (let q = 0; q < 4; q++) {
        const qa = q * Math.PI / 2 + k * 3;
        ctx.beginPath(); ctx.moveTo(d.radius * 0.85, 0);
        ctx.lineTo(d.radius * 0.85 + Math.cos(qa) * (5 + 6 * k), Math.sin(qa) * (5 + 6 * k)); ctx.stroke();
      }
      if (fin) {
        ctx.globalAlpha = 0.55 * fade; ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(d.radius * 0.6, 0, 15 + 8 * k, 0, Math.PI * 2); ctx.stroke();
        for (let q = 0; q < 6; q++) {                              // δόντια του τροχού (ophanim)
          const qa = q * Math.PI / 3 - rt._t * 5;
          ctx.beginPath(); ctx.moveTo(d.radius * 0.6 + Math.cos(qa) * (15 + 8 * k), Math.sin(qa) * (15 + 8 * k));
          ctx.lineTo(d.radius * 0.6 + Math.cos(qa) * (19 + 8 * k), Math.sin(qa) * (19 + 8 * k)); ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.95 * fade;                               // λευκός πυρήνας
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(12, h.combo === 2 ? 4 : -4); ctx.lineTo(d.radius * 0.8, 0); ctx.stroke();
      ctx.restore();
    }
    for (const s of (w.smites || [])) {
      const k = s.t / s.dur, fade = 1 - k;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 * fade;                               // χρυσή στήλη
      ctx.fillStyle = '#ffd447'; ctx.fillRect(s.x - 12, s.y - 90 * (1 - k), 24, 90 * (1 - k));
      // περιστρεφόμενη σφραγίδα στη βάση του smite
      ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = '#ffe89a'; ctx.lineWidth = 1.5;
      for (let q = 0; q < 3; q++) {
        const qa = rt._t * 4 + q * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.arc(s.x, s.y, 18 + 10 * k, qa, qa + 1.4); ctx.stroke();
      }
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 30 + 24 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.95 * fade;                               // λευκός πυρήνας στήλης
      ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - 2.5, s.y - 84 * (1 - k), 5, 84 * (1 - k));
      ctx.restore();
    }
  },
};

// ═══ 14 · HOLOGRAPHIC ENERGY KNUCKLES — τεράστιες holo γροθιές, χτυπούν και
//        ΠΙΣΩ από τον 1ο στόχο · Seraphic Wing Array -> BE_WING_GUILLOTINE ═══
WEAPON_DEFS.holo_energy_knuckles = {
  name: 'Holographic Energy Knuckles', owner: 'dimis_kickboxer', category: 'weapon', kind: 'holo_projectile',
  damage:   [17, 20, 24, 30, 37],
  cooldown: [1.45, 1.35, 1.25, 1.12, 1.00],
  amount:   [1, 1, 1, 2, 2],
  speed: 380, size: 24, pierce: 2,                  // pierce 2 = χτυπά και πίσω από τον 1ο
  critChance: 0.08, critMult: 1.6,
  bossMultiplier: 0.85, maxActive: 8,
  tags: ['HOLO', 'PROJECTILE', 'PIERCE'],
  evolutionPassive: 'seraphic_wing_array', evolution: 'be_wing_guillotine',
  desc: 'Huge holographic fists that punch straight through the first target into the next.',
};
PASSIVE_DEFS.seraphic_wing_array = {
  name: 'Seraphic Wing Array', category: 'evolution_passive', owner: null,
  forWeapon: 'holo_energy_knuckles', requiredFor: 'be_wing_guillotine', maxLevel: 3,
  bonuses: [ { holoDmg: 0.08 }, { holoDmg: 0.08, holoSize: 0.15 }, { holoDmg: 0.12, holoSize: 0.25 } ],
  desc: 'Wing-arrays unfold behind each fist. Powers the Wing Guillotine.',
};
EVOLUTION_RECIPES.be_wing_guillotine = {
  name: 'Wing Guillotine', weapon: 'holo_energy_knuckles', passive: 'seraphic_wing_array',
  weaponLevel: 5, passiveLevel: 3,
  damage: 44, cooldown: 1.35,
  wings: { radius: 120, arc: 1.25, dmg: 36 },       // δύο φτερο-λεπίδες Δ+Α ταυτόχρονα
  bossMultiplier: 0.80, tags: ['HOLO', 'MELEE', 'WING', 'GUILLOTINE'],
  desc: 'Mechanical wing-blades scissor both flanks at once — a guillotine of light.',
};

WEAPON_EXECUTORS.holo_energy_knuckles = {
  update(rt, w, dt) {
    const d = WEAPON_DEFS.holo_energy_knuckles, evo = EVOLUTION_RECIPES.be_wing_guillotine;
    const p = rt.game.player;
    w.fists = w.fists || []; w.wings = w.wings || [];
    w.cd -= dt;
    if (w.cd <= 0) {
      w.cd = w.evolved ? evo.cooldown : lvl(d, w, 'cooldown');
      if (w.evolved) {
        const dir = aimAngle(rt);
        w.wings.push({ dir, t: 0, dur: 0.30, hitL: new Set(), hitR: new Set(), x: p.pos.x, y: p.pos.y, done: false });
      } else {
        const n = Math.min(lvl(d, w, 'amount'), d.maxActive - w.fists.length);
        const base = aimAngle(rt);
        for (let k = 0; k < n; k++) {
          const a = base + (k - (n - 1) / 2) * 0.3;
          w.fists.push({ x: p.pos.x, y: p.pos.y, a, t: 0, life: 1.1, pierce: d.pierce, hit: new Set() });
        }
      }
    }
    const size = d.size * (1 + rt._catalystSum('holoSize'));
    const dmg = (w.evolved ? evo.damage : lvl(d, w, 'damage')) * (1 + rt._catalystSum('holoDmg'));
    const wid = w.evolved ? 'be_wing_guillotine' : 'holo_energy_knuckles';
    const bm = w.evolved ? evo.bossMultiplier : d.bossMultiplier;
    for (let i = w.fists.length - 1; i >= 0; i--) {
      const f = w.fists[i]; f.t += dt;
      f.x += Math.cos(f.a) * d.speed * dt; f.y += Math.sin(f.a) * d.speed * dt;
      if (f.t >= f.life) { w.fists.splice(i, 1); continue; }
      const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(f.x, f.y, size + 60) : rt.game.enemies;
      for (const e of near) {
        if (!e || e.hp <= 0 || f.hit.has(e)) continue;
        if ((e.pos.x - f.x) ** 2 + (e.pos.y - f.y) ** 2 > (size + e.radius) ** 2) continue;
        f.hit.add(e);
        rt._dealDamage(wid, e, dmg, bm, Math.random() < d.critChance);
        if (f.pierce > 0) { f.pierce--; } else { w.fists.splice(i, 1); break; }
      }
    }
    // WING GUILLOTINE: δύο τόξα-φτερά αριστερά+δεξιά ταυτόχρονα
    for (let i = w.wings.length - 1; i >= 0; i--) {
      const g = w.wings[i]; g.t += dt;
      if (!g.done && g.t >= g.dur * 0.4) {
        g.done = true;
        const near = rt.game._spatialGrid ? rt.game._spatialGrid.query(g.x, g.y, evo.wings.radius + 60) : rt.game.enemies;
        for (const side of [-1, 1]) {
          const cA = g.dir + side * Math.PI / 2;
          for (const e of near) {
            if (!e || e.hp <= 0) continue;
            const dx = e.pos.x - g.x, dy = e.pos.y - g.y, dist = Math.hypot(dx, dy);
            if (dist > evo.wings.radius + e.radius) continue;
            if (Math.abs(angDiff(Math.atan2(dy, dx), cA)) > evo.wings.arc / 2) continue;
            const set = side < 0 ? g.hitL : g.hitR;
            if (set.has(e)) continue; set.add(e);
            rt._dealDamage(wid, e, evo.wings.dmg, bm, Math.random() < d.critChance);
          }
        }
      }
      if (g.t >= g.dur + 0.15) w.wings.splice(i, 1);
    }
  },
  draw(rt, ctx, w) {
    const d = WEAPON_DEFS.holo_energy_knuckles, evo = EVOLUTION_RECIPES.be_wing_guillotine;
    const size = d.size * (1 + rt._catalystSum('holoSize'));
    for (const f of (w.fists || [])) {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.24;                                      // holo halo
      ctx.fillStyle = '#ffd447';
      ctx.beginPath(); ctx.arc(0, 0, size * 1.25, 0, Math.PI * 2); ctx.fill();
      // ULTIMATE PASS: RGB-split ghost του ολογράμματος (ψηφιακό glitch)
      const gl = Math.sin(rt._t * 17 + f.x * 0.05) > 0.7 ? 2.5 : 1;
      ctx.globalAlpha = 0.22; ctx.strokeStyle = '#6bd8ff'; ctx.lineWidth = 2;
      ctx.strokeRect(-size * 0.5 - gl, -size * 0.55, size, size * 1.1);
      ctx.globalAlpha = 0.22; ctx.strokeStyle = '#ff6bd6';
      ctx.strokeRect(-size * 0.5 + gl, -size * 0.55, size, size * 1.1);
      ctx.globalAlpha = 0.6;                                       // σώμα: holo γροθιά (τετράγωνη με δάχτυλα)
      ctx.strokeStyle = '#ffe89a'; ctx.lineWidth = 2;
      ctx.strokeRect(-size * 0.5, -size * 0.55, size, size * 1.1);
      for (let q = -1; q <= 1; q++) { ctx.beginPath(); ctx.moveTo(size * 0.5, q * size * 0.33); ctx.lineTo(size * 0.78, q * size * 0.33); ctx.stroke(); }
      ctx.globalAlpha = 0.35;                                      // scanlines ολογράμματος
      ctx.lineWidth = 1;
      for (let q = -2; q <= 2; q++) { ctx.beginPath(); ctx.moveTo(-size * 0.5, q * size * 0.22); ctx.lineTo(size * 0.5, q * size * 0.22); ctx.stroke(); }
      ctx.globalAlpha = 0.95;                                      // λευκός πυρήνας
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(size * 0.2, 0, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const g of (w.wings || [])) {
      const k = Math.min(1, g.t / g.dur), fade = 1 - Math.max(0, (g.t - g.dur * 0.5) / (g.dur * 0.65));
      ctx.save(); ctx.translate(g.x, g.y);
      for (const side of [-1, 1]) {
        const cA = g.dir + side * Math.PI / 2;
        const a0 = cA - evo.wings.arc / 2, a1 = a0 + evo.wings.arc * k;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.26 * fade;                             // φτερό-halo
        ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.arc(0, 0, evo.wings.radius * 0.9, a0, a1); ctx.stroke();
        ctx.globalAlpha = 0.55 * fade;                             // σώμα: πτεροειδείς σχισμές
        ctx.strokeStyle = '#ffe89a'; ctx.lineWidth = 3;
        for (let q = 0; q <= 3; q++) {
          const qa = a0 + (evo.wings.arc * k) * (q / 3);
          ctx.beginPath(); ctx.moveTo(Math.cos(qa) * evo.wings.radius * 0.5, Math.sin(qa) * evo.wings.radius * 0.5);
          ctx.lineTo(Math.cos(qa) * evo.wings.radius, Math.sin(qa) * evo.wings.radius); ctx.stroke();
        }
        ctx.globalAlpha = 0.95 * fade;                             // λευκή ακμή-λεπίδα
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, 0, evo.wings.radius, a0, a1); ctx.stroke();
      }
      ctx.restore();
    }
  },
};

export const BE_CHARS3 = ['solo_red_thunder', 'feedback_cabinet', 'cyber_gauntlets_injection', 'holo_energy_knuckles'];
