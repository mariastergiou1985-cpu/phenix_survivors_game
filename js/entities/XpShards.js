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

const TIER = {
  small:  { max: 2,        size: 7,  c: '#37e6ff', core: '#eaffff' },
  medium: { max: 8,        size: 10, c: '#8dff4d', core: '#f4ffe8' },
  core:   { max: Infinity, size: 14, c: '#ff2dd0', core: '#ffd447' },
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
    s.tx = x + Math.cos(a) * d; s.ty = y + Math.sin(a) * d;   // landing spot
    this.active.push(s);
    return s;
  }

  // Enemy death entry point — splits the EXACT xp value into tier denominations.
  // Max ~6 shards per death (mega boss 42 → 3×12 + 1×4 + 2×1).
  spawnBurst(x, y, total, radius = 12) {
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
    const pr = (p.pickupRadius || 90) * (game._mutationEffects?.pickupRadiusMult || 1);
    const pr2 = pr * pr;
    const px = p.pos.x, py = p.pos.y;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.t += dt;

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
      const r = s.rot + now * (s.tier === 'core' ? 0.9 : 0.4);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(r);
      if (s.tier === 'small') {
        // thin data-bit sliver (rotated diamond)
        ctx.fillStyle = T.c;
        ctx.beginPath();
        ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.36, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.36, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = T.core; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(0, -sz * 0.55); ctx.lineTo(0, sz * 0.55); ctx.stroke();
      } else if (s.tier === 'medium') {
        // pentagonal data-cell
        ctx.fillStyle = T.c;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
          const rr = sz * (k % 2 ? 0.72 : 1);
          ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = T.core; ctx.globalAlpha = 0.85;
        ctx.strokeRect(-sz * 0.28, -sz * 0.28, sz * 0.56, sz * 0.56);
      } else {
        // compressed data core: double rotated square, gold heart, additive flare
        ctx.fillStyle = T.c;
        ctx.fillRect(-sz * 0.72, -sz * 0.72, sz * 1.44, sz * 1.44);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = T.c; ctx.globalAlpha = 0.8;
        ctx.strokeRect(-sz * 0.94, -sz * 0.94, sz * 1.88, sz * 1.88);
        ctx.globalAlpha = 1;
        ctx.fillStyle = T.core;
        ctx.fillRect(-sz * 0.34, -sz * 0.34, sz * 0.68, sz * 0.68);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.30 + 0.15 * Math.sin(now * 5 + s.ph);
        ctx.fillStyle = T.core;
        ctx.fillRect(-sz * 0.5, -sz * 0.5, sz, sz);
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
