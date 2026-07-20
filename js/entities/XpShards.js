// ═══════════════════════════════════════════════════════════════════════════════
// DATA-XP SHARDS (Maria brief 2026-07-18, Phase 1) — physical XP pickups.
// Enemy deaths no longer grant XP directly: they drop cyber data fragments that
// live in the world, magnet toward the player inside pickupRadius, and grant XP
// ONLY on real collection. Pooled, capped, merge-preserving (XP is never lost).
//
// Tiers (PHENIX identity — cyber data fragments, NOT VS blue gems, NO circles):
//   small  (cyan  sliver, value ≤ 2)  — thin rotated data-bit
//   medium (lime  cell,   value ≤ 8)  — pentagonal data-cell
//   core   (magenta/gold, value  > 8) — compressed data core, double rotated square
//
// Rules honoured: object pooling · spatial cull · merge keeps EXACT total value ·
// zero shadowBlur · no PNG · capped audio via AudioManager.playXpPickup ladder.
// ═══════════════════════════════════════════════════════════════════════════════

const IS_MOBILE = (typeof navigator !== 'undefined') &&
  ((navigator.maxTouchPoints > 0) ||
   (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches));

const CAP        = IS_MOBILE ? 220 : 520;   // hard active cap — beyond this, distant shards merge
const SNAP_DIST  = 20;                       // final collect snap (px)
const CULL_DIST2 = 1500 * 1500;              // draw cull (world px², from player)

// PHENIX cyber identity (Maria unified brief 2026-07-18 §4): NO cyan/blue gem language.
//   T1 DATA FRAGMENT   — white/silver broken circuit-chip casing, small violet core
//   T2 ENCRYPTED CELL  — gunmetal segmented chip, bright white edge, acid-lime accent only
//   T3 NULL DATA CACHE — amber/orange mechanical cache, magenta+gold circuit detail
const TIER = {
  // RUNTIME READABILITY PASS (Maria video QA 2026-07-19): στο πραγματικό gameplay zoom
  // (0.72-0.75) τα 8/11/15 world px γίνονταν 6-11 screen px — «λευκές κουκκίδες/χιόνι».
  // Μεγέθη +~35% ώστε η κομμένη γωνία του T1, η segmented capsule του T2 και το
  // mechanical cache του T3 να διαβάζονται στο κανονικό zoom (όχι τεράστια — T3 ≈ 15
  // screen px). Συν σκούρο outline + contact shadow (βλ. draw) για διαχωρισμό από
  // bullets/particles. Καμία αλλαγή σε XP values/merge/cap — καθαρά οπτικό.
  small:  { max: 2,        size: 11, c: '#d9dee8', core: '#a44dff', edge: '#f4f6fb' },
  medium: { max: 8,        size: 15, c: '#3a4250', core: '#ffffff', edge: '#b8ff3c' },
  core:   { max: Infinity, size: 20, c: '#ff9a2d', core: '#ffd447', edge: '#ff2dd0' },
};
function tierFor(v) { return v <= TIER.small.max ? 'small' : v <= TIER.medium.max ? 'medium' : 'core'; }

export class XpShardSystem {
  constructor() {
    this.active = [];
    this._pool  = [];
    this._seed  = Math.random() * 1000;
  }

  _obtain() { return this._pool.pop() || {}; }
  _release(s) { if (this._pool.length < CAP) this._pool.push(s); }

  // One shard. t: spawn clock, ph: personal phase, vm: magnet speed.
  _spawn(x, y, value) {
    const s = this._obtain();
    s.x = x; s.y = y; s.value = value; s.tier = tierFor(value);
    s.t = 0; s.ph = Math.random() * Math.PI * 2;
    s.rot = Math.random() * Math.PI * 2;
    s.vm = 0; s.magnet = false; s.dead = false;
    // pop-out: small toss from the death point with a soft landing (bounce easing in update)
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 22;
    let lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d;   // landing spot
    const g = this._game;
    if (g?._clampPickupPos) {
      const c = g._clampPickupPos({ x: lx, y: ly }, 12);       // plain point — helper only reads x/y
      lx = c.x; ly = c.y;
    }
    s.tx = lx; s.ty = ly;
    this.active.push(s);
    return s;
  }

  // Enemy death entry point — splits the EXACT xp value into tier denominations.
  // Max ~6 shards per death (mega boss 42 → 3×12 + 1×4 + 2×1).
  // WALKABILITY (Maria 2026-07-19): shards used to land wherever the enemy died, so a kill
  // next to a façade scattered XP into the background where the player could see it and
  // never collect it. Every shard's RESTING position (s.tx/s.ty — the landing spot, not the
  // pop-out animation) now resolves through the canonical model. The toss/magnet motion is
  // untouched, and so are values, tiers and drop rates.
  spawnBurst(x, y, total, radius = 12, game = null) {
    this._game = game || null;
    let v = Math.max(1, Math.round(total));
    let guard = 8;
    while (v > 0 && guard-- > 0) {
      let take;
      if (v > 8)      take = Math.min(v, 12);
      else if (v > 2) take = Math.min(v, 4);
      else            take = Math.min(v, 2);
      // never leave a remainder we cannot represent — fold tiny leftovers into this shard
      if (v - take === 1 && take >= 2) take += 1;
      const ox = (Math.random() - 0.5) * radius, oy = (Math.random() - 0.5) * radius;
      this._spawn(x + ox, y + oy, take);
      v -= take;
    }
    if (v > 0) this._spawn(x, y, v);   // guard exhausted — value is still preserved
  }

  update(dt, game) {
    const p = game.player;
    if (!p) return;
    // WALKABLE floor ΟΛΩΝ των modes (2026-07-19): shards ποτέ σε παράθυρα/κτίρια/void
    const db = game.getWalkableBounds ? game.getWalkableBounds() : null;
    const pr = (p.pickupRadius || 90) * (game._mutationEffects?.pickupRadiusMult || 1);
    const pr2 = pr * pr;
    const px = p.pos.x, py = p.pos.y;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.t += dt;

      if (db) {
        if (isFinite(db.x0)) s.x = Math.max(db.x0, Math.min(db.x1, s.x));
        s.y = Math.max(db.y0, Math.min(db.y1, s.y));
      }
      // drop/pop-in: ease toward the landing spot over 0.28s with a tiny overshoot
      if (s.t < 0.28 && !s.magnet) {
        const k = s.t / 0.28, e = 1 - (1 - k) * (1 - k);         // ease-out
        s.x += (s.tx - s.x) * e * 0.4;
        s.y += (s.ty - s.y) * e * 0.4;
      }

      const dx = px - s.x, dy = py - s.y;
      const d2 = dx * dx + dy * dy;

      if (!s.magnet && d2 < pr2) s.magnet = true;                 // enter magnet field
      if (s.magnet) {
        // slow start → accelerate → hard snap at the end (VS-style vacuum)
        s.vm = Math.min(1500, (s.vm || 120) + 2400 * dt);
        const d = Math.sqrt(d2) || 1;
        if (d < SNAP_DIST || s.vm * dt >= d) {
          // ── REAL COLLECTION: the only place XP is granted ──
          p.gainXp(s.value, game.floatingTexts);
          game.audio?.playXpPickup?.(s.tier);
          s.dead = true;
          this.active.splice(i, 1); this._release(s);
          continue;
        }
        s.x += (dx / d) * s.vm * dt;
        s.y += (dy / d) * s.vm * dt;
      }
    }

    // ── CAP enforcement: merge the FARTHEST shards pairwise, preserving exact value ──
    if (this.active.length > CAP) {
      const overflow = this.active.length - CAP;
      // sort a shallow copy of indices by distance desc (far shards merge first)
      const byDist = this.active.map((s, idx) => {
        const ddx = s.x - px, ddy = s.y - py;
        return [ddx * ddx + ddy * ddy, idx];
      }).sort((a, b) => b[0] - a[0]);
      const toMerge = Math.min(overflow + 8, Math.floor(this.active.length / 4));
      const doomed = new Set();
      for (let k = 0; k + 1 < toMerge * 2 && k + 1 < byDist.length; k += 2) {
        const a = this.active[byDist[k][1]], b = this.active[byDist[k + 1][1]];
        if (!a || !b || doomed.has(a) || doomed.has(b)) continue;
        a.value += b.value;                                       // EXACT XP preserved
        a.tier = tierFor(a.value);
        doomed.add(b);
      }
      if (doomed.size) {
        this.active = this.active.filter(s => !doomed.has(s));
        for (const s of doomed) this._release(s);
      }
    }
  }

  draw(ctx, game) {
    const p = game.player; if (!p) return;
    const px = p.pos.x, py = p.pos.y;
    const now = performance.now() / 1000;
    ctx.save();
    ctx.lineWidth = 1.4;
    for (const s of this.active) {
      const ddx = s.x - px, ddy = s.y - py;
      if (ddx * ddx + ddy * ddy > CULL_DIST2) continue;           // spatial cull
      const T = TIER[s.tier];
      const pulse = 1 + Math.sin(now * 3.2 + s.ph) * 0.08;
      const sz = T.size * pulse * (s.t < 0.2 ? (0.4 + 3 * s.t) : 1);   // pop-in growth
      const r = s.rot + now * (s.tier === 'core' ? 0.7 : 0.25);
      // magnet trail: broken-code dashes behind the shard (no glowing blue ball)
      if (s.magnet && s.vm > 200) {
        const d = Math.max(1, Math.hypot(px - s.x, py - s.y));
        const ux = (s.x - px) / d, uy = (s.y - py) / d;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = T.edge;
        for (let k = 1; k <= 3; k++) {
          const tx = s.x + ux * k * 9, ty = s.y + uy * k * 9;
          ctx.fillRect(tx - 1.5, ty - 0.8, 3 - k * 0.6, 1.6);
        }
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(s.x, s.y);
      // contact shadow (un-rotated) — δένει το shard με το δάπεδο, δεν μοιάζει με particle
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = '#04060c';
      ctx.beginPath();
      ctx.ellipse(0, sz * 0.62, sz * 0.72, sz * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.rotate(r);
      // σκούρο περίγραμμα κάτω από κάθε σχήμα — contrast πάνω σε φωτεινό δάπεδο
      ctx.strokeStyle = 'rgba(6,9,16,0.85)';
      const flick = Math.sin(now * 11 + s.ph) > 0.86;         // data flicker
      if (s.tier === 'small') {
        // T1 DATA FRAGMENT — asymmetric broken circuit-chip: silver casing, cut corner,
        // two digital notches, small violet energy core. No cyan, no gem.
        ctx.fillStyle = T.c;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.7, -sz * 0.45);
        ctx.lineTo(sz * 0.35, -sz * 0.55);
        ctx.lineTo(sz * 0.7, -sz * 0.1);                       // cut corner
        ctx.lineTo(sz * 0.55, sz * 0.5);
        ctx.lineTo(-sz * 0.3, sz * 0.55);
        ctx.lineTo(-sz * 0.75, sz * 0.05);
        ctx.closePath();
        ctx.lineWidth = 2.6; ctx.stroke();                     // dark outline πίσω από το σώμα
        ctx.fill();
        ctx.fillStyle = '#8a92a2';                             // digital notches
        ctx.fillRect(-sz * 0.2, -sz * 0.55, sz * 0.16, sz * 0.2);
        ctx.fillRect(sz * 0.28, sz * 0.36, sz * 0.18, sz * 0.2);
        ctx.fillStyle = flick ? '#d9b3ff' : T.core;            // violet core
        ctx.fillRect(-sz * 0.18, -sz * 0.16, sz * 0.36, sz * 0.32);
      } else if (s.tier === 'medium') {
        // T2 ENCRYPTED DATA CELL — gunmetal segmented capsule-chip, bright white edge,
        // acid-lime accent line only, scan pulse.
        ctx.fillStyle = T.c;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.8, -sz * 0.35); ctx.lineTo(sz * 0.5, -sz * 0.5);
        ctx.lineTo(sz * 0.8, 0); ctx.lineTo(sz * 0.5, sz * 0.5);
        ctx.lineTo(-sz * 0.8, sz * 0.35);
        ctx.closePath();
        ctx.lineWidth = 2.6; ctx.stroke();                     // dark outline πίσω από το σώμα
        ctx.fill();
        ctx.strokeStyle = T.core; ctx.globalAlpha = 0.95; ctx.lineWidth = 1.4;  // white edge
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#12161e';                             // segment gaps
        ctx.fillRect(-sz * 0.28, -sz * 0.42, sz * 0.1, sz * 0.84);
        ctx.fillRect(sz * 0.16, -sz * 0.42, sz * 0.1, sz * 0.8);
        const scan = ((now * 1.4 + s.ph) % 1);                 // scan pulse (lime accent)
        ctx.fillStyle = T.edge; ctx.globalAlpha = 0.8;
        ctx.fillRect(-sz * 0.8 + scan * sz * 1.5, -sz * 0.34, sz * 0.08, sz * 0.68);
      } else {
        // T3 NULL DATA CACHE — compact mechanical encrypted cache: amber body,
        // gold circuit ticks, magenta seal, heavier pulse + rotating outer frame.
        ctx.fillStyle = T.c;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * sz * 0.8, Math.sin(a) * sz * 0.8);
        }
        ctx.closePath();
        ctx.lineWidth = 2.8; ctx.stroke();                     // dark outline πίσω από το σώμα
        ctx.fill();
        ctx.strokeStyle = T.edge; ctx.lineWidth = 1.6;         // magenta seal ring
        ctx.stroke();
        ctx.fillStyle = T.core;                                // gold circuit ticks
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.fillRect(Math.cos(a) * sz * 0.45 - 1.5, Math.sin(a) * sz * 0.45 - 1.5, 3, 3);
        }
        ctx.fillStyle = flick ? '#fff2c0' : T.core;
        ctx.fillRect(-sz * 0.22, -sz * 0.22, sz * 0.44, sz * 0.44);
        ctx.rotate(-r * 1.8);                                  // counter-rotating outer frame
        ctx.strokeStyle = T.core; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2;
        ctx.strokeRect(-sz * 1.05, -sz * 1.05, sz * 2.1, sz * 2.1);
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
