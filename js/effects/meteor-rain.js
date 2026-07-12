/**
 * MeteorRain — "Sharp Meteor Rain": a 5-second AoE that rains jagged crystalline
 * red meteors into a targeted ground circle. Each meteor accelerates diagonally
 * down, shatters on impact into debris, and deals AoE damage in a small radius.
 * Framework-agnostic, no dependencies, no getImageData.
 *
 * ── Wiring ────────────────────────────────────────────────────────────────
 *   import { MeteorRain } from './meteor-rain.js';
 *   const rain = new MeteorRain(canvas, { area:{ radius:180 }, spawn:{ perSec:5 } });
 *   rain.cast(targetX, groundY, enemies, {
 *     getX:e=>e.x, getY:e=>e.y,
 *     onImpact: (e) => { e.hp -= 35; },   // called per enemy inside an impact radius
 *   });
 *   // each frame:
 *   rain.update(performance.now(), enemies);
 *   rain.render(ctx);
 */

export const METEOR_DEFAULTS = {
  duration: { ms: 5000 },
  area:     { radius: 180 },
  spawn:    { perSec: 5 },
  meteor:   { speed: 6, accel: 0.25, sizeMin: 16, sizeMax: 32, topY: -40 },
  impact:   { radius: 46, debris: 18 },
  grid:     { cell: 22 },
  color:    { hue: 4, sat: 100, light: 56 },
};

// Meteors are now FULLY PROCEDURAL (ultimate-grade, Maria 2026-07-12) — the sprite
// sheet drew as a mushy blob. Each meteor is a seeded jagged rock silhouette with
// molten crack veins, a white-hot nose and a 3-layer tapering fire trail.

export class MeteorRain {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const cfg = JSON.parse(JSON.stringify(METEOR_DEFAULTS));
    for (const k in opts) if (cfg[k] && typeof cfg[k] === 'object') Object.assign(cfg[k], opts[k]);
    this.cfg = cfg;
    this.state = 'idle';
    this._meteors = []; this._debris = []; this._rings = [];
    this._acc = 0; this._last = 0;
  }
  isActive() { return this.state !== 'idle'; }
  _c(a = 1, l = this.cfg.color.light, h = this.cfg.color.hue) { return `hsla(${h},${this.cfg.color.sat}%,${l}%,${a})`; }

  /** cx = circle center x, groundY = where the circle sits / where meteors land. */
  cast(cx, groundY, enemies, opts) {
    this.state = 'active'; this.born = performance.now();
    this.cx = cx; this.cy = groundY; this.enemies = enemies || []; this.opts = opts;
    this._meteors.length = 0; this._debris.length = 0; this._acc = 0; this._last = this.born;
  }

  /** Uniformly random landing point inside the circle. */
  _pickLanding() {
    const ang = Math.random() * Math.PI * 2;
    const r = this.cfg.area.radius * Math.sqrt(Math.random()); // sqrt = uniform area distribution
    return { x: this.cx + Math.cos(ang) * r, y: this.cy };
  }
  _spawnMeteor() {
    const land = this._pickLanding();
    // Impact-crater physics: random spawn offsets ABOVE the screen, falling in
    // from either side with an arc (vx decays, vy gains) toward the target zone.
    const topY = this.cfg.meteor.topY - Math.random() * 90;
    const side = Math.random() < 0.5 ? -1 : 1;
    const sx = land.x - side * (this.cy - topY) * (0.25 + Math.random() * 0.45);
    let dx = land.x - sx, dy = land.y - topY; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const sp = this.cfg.meteor.speed;
    this._meteors.push({
      x: sx, y: topY, vx: dx * sp, vy: dy * sp, ax: dx * this.cfg.meteor.accel, ay: dy * this.cfg.meteor.accel,
      size: this.cfg.meteor.sizeMin + Math.random() * (this.cfg.meteor.sizeMax - this.cfg.meteor.sizeMin),
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      seed: Math.random() * 1000,   // per-meteor rock silhouette
      arc: 0.9955 + Math.random() * 0.003,   // per-meteor horizontal decay → parabolic arc
    });
  }

  update(now, enemies) {
    this._now = now;
    if (enemies) this.enemies = enemies;
    if (this.state !== 'idle') {
      const elapsed = now - this.born;
      const dt = now - this._last; this._last = now;
      // consistent spawn rate while channeling
      if (elapsed < this.cfg.duration.ms) {
        this._acc += dt;
        const every = 1000 / this.cfg.spawn.perSec;
        let _mg = 0; while (this._acc >= every && _mg++ < 6) { this._spawnMeteor(); this._acc -= every; }
        if (this._acc > every * 3) this._acc = every;   // perf: never let a frame spike burst-spawn meteors
      }
      // move + impact
      for (const m of this._meteors) {
        m.vx = m.vx * (m.arc || 1) + m.ax; m.vy += m.ay * 1.35;   // arc velocity: horizontal decays, vertical gains
        m.x += m.vx; m.y += m.vy; m.rot += m.vr;
        if (m.y >= this.cy) { m.dead = true; this._impact(m.x, this.cy, now); }
      }
      this._meteors = this._meteors.filter(m => !m.dead);
      if (this._meteors.length > 80) this._meteors.length = 80;   // hard cap
      if (elapsed >= this.cfg.duration.ms && this._meteors.length === 0) this.state = 'idle';
    }
    // debris
    for (const d of this._debris) { d.x += d.vx; d.y += d.vy; d.vy += 0.25; d.vx *= 0.96; d.rot += d.vr; }
    this._debris = this._debris.filter(d => now - d.born < d.life);
    if (this._debris.length > 240) this._debris.length = 240;   // hard cap
  }

  _impact(x, y, now) {
    // AoE damage in a tiny radius
    if (this.opts && this.opts.onImpact) {
      const r2 = this.cfg.impact.radius * this.cfg.impact.radius;
      for (const en of this.enemies) { const dx = this.opts.getX(en) - x, dy = this.opts.getY(en) - y; if (dx * dx + dy * dy <= r2) this.opts.onImpact(en); }
    }
    // impact shock ring + ground flash
    this._rings = this._rings || [];
    this._rings.push({ x, y, born: now, life: 420 });
    if (this._rings.length > 20) this._rings.shift();
    // shatter into crystalline debris
    for (let i = 0; i < this.cfg.impact.debris; i++) { const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 4;
      this._debris.push({ x, y, vx: Math.cos(a) * s, vy: -Math.abs(Math.sin(a) * s) - 1, size: 2 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, born: now, life: 460, ember: Math.random() < 0.4 }); }
  }

  _crystal(ctx, x, y, size, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.5, -size * 0.2); ctx.lineTo(size * 0.3, size); ctx.lineTo(-size * 0.35, size * 0.7); ctx.lineTo(-size * 0.5, -size * 0.3); ctx.closePath();
    ctx.fill(); ctx.restore();
  }

  render(ctx) {
    const now = this._now ?? performance.now();
    // ground grid circle while channeling
    if (this.state !== 'idle' && (now - this.born) < this.cfg.duration.ms) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
      ctx.save();
      ctx.beginPath(); ctx.arc(this.cx, this.cy, this.cfg.area.radius, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = this._c(0.18 + 0.12 * pulse, 50); ctx.lineWidth = 1;
      const c = this.cfg.grid.cell, x0 = this.cx - this.cfg.area.radius, y0 = this.cy - this.cfg.area.radius;
      ctx.beginPath();
      for (let x = x0; x <= this.cx + this.cfg.area.radius; x += c) { ctx.moveTo(x, this.cy - this.cfg.area.radius); ctx.lineTo(x, this.cy + this.cfg.area.radius); }
      for (let y = y0; y <= this.cy + this.cfg.area.radius; y += c) { ctx.moveTo(this.cx - this.cfg.area.radius, y); ctx.lineTo(this.cx + this.cfg.area.radius, y); }
      ctx.stroke(); ctx.restore();
      ctx.save(); ctx.strokeStyle = this._c(0.5 + 0.3 * pulse, 60); ctx.lineWidth = 2; ctx.shadowColor = this._c(1); ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, this.cfg.area.radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.save();
    // meteors — procedural molten rocks, nose-first along velocity
    const pr = (sd, i) => { const v = Math.sin(sd * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };
    for (const m of this._meteors) {
      const ang = Math.atan2(m.vy, m.vx);
      const R = m.size * 0.65;
      // ── 3-layer tapering fire trail (lighter) ──
      ctx.globalCompositeOperation = 'lighter';
      const trail = [
        { len: 5.2, w: R * 1.7, col: 'rgba(255,60,20,0.22)' },
        { len: 3.6, w: R * 1.0, col: 'rgba(255,140,40,0.45)' },
        { len: 2.2, w: R * 0.45, col: 'rgba(255,244,214,0.85)' },
      ];
      for (const tl of trail) {
        ctx.strokeStyle = tl.col; ctx.lineWidth = tl.w; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(m.x - m.vx * 0.6, m.y - m.vy * 0.6);
        ctx.lineTo(m.x - m.vx * tl.len, m.y - m.vy * tl.len);
        ctx.stroke();
      }
      // shed sparks along the trail
      for (let sp2 = 0; sp2 < 3; sp2++) {
        const st = 1 + pr(m.seed, sp2) * 3;
        ctx.globalAlpha = 0.7 - sp2 * 0.2;
        ctx.fillStyle = sp2 % 2 ? '#ffd23c' : '#ff7a3c';
        ctx.beginPath();
        ctx.arc(m.x - m.vx * st + (pr(m.seed, sp2 + 5) - 0.5) * 10,
                m.y - m.vy * st + (pr(m.seed, sp2 + 9) - 0.5) * 10, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // ── the rock: seeded jagged silhouette (dark body over the glow) ──
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(ang + m.rot * 0.2);
      const pts = 7;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#241009';
      ctx.strokeStyle = '#ff7a3c'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const pa = (i / pts) * Math.PI * 2;
        const rr = R * (0.75 + pr(m.seed, i) * 0.5);
        i === 0 ? ctx.moveTo(Math.cos(pa) * rr, Math.sin(pa) * rr)
                : ctx.lineTo(Math.cos(pa) * rr, Math.sin(pa) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // molten crack veins across the rock
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ffb03c'; ctx.lineWidth = 1.2;
      for (let c2 = 0; c2 < 3; c2++) {
        const a1 = pr(m.seed, c2 + 20) * Math.PI * 2;
        const a2 = a1 + 1.6 + pr(m.seed, c2 + 30) * 1.4;
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin((this._now || 0) * 0.02 + c2 * 2);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a1) * R * 0.8, Math.sin(a1) * R * 0.8);
        ctx.lineTo(Math.cos((a1 + a2) / 2) * R * 0.25, Math.sin((a1 + a2) / 2) * R * 0.25);
        ctx.lineTo(Math.cos(a2) * R * 0.8, Math.sin(a2) * R * 0.8);
        ctx.stroke();
      }
      // white-hot nose (leading edge — the air burns first)
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#fff4d8';
      ctx.shadowColor = '#ff7a3c'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(R * 0.55, 0, R * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    // impact shock rings — flattened ground ellipses + white flash core
    for (const rg of (this._rings || [])) {
      const t = (now - rg.born) / rg.life; if (t >= 1) continue;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = t < 0.25 ? '#fff4d8' : '#ff7a3c';
      ctx.lineWidth = 3.5 * (1 - t) + 0.8;
      ctx.beginPath(); ctx.ellipse(rg.x, rg.y, 10 + t * 52, (10 + t * 52) * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      if (t < 0.2) {
        ctx.globalAlpha = (1 - t / 0.2) * 0.7;
        ctx.fillStyle = '#fff4d8';
        ctx.beginPath(); ctx.arc(rg.x, rg.y - 4, 8 + t * 40, 0, Math.PI * 2); ctx.fill();
      }
    }
    this._rings = (this._rings || []).filter(rg => now - rg.born < rg.life);
    ctx.globalAlpha = 1;
    // debris
    ctx.shadowBlur = 6;
    for (const d of this._debris) { const t = (now - d.born) / d.life; if (t >= 1) continue; ctx.globalAlpha = 1 - t; ctx.fillStyle = this._c(1, 60, d.ember ? 28 : this.cfg.color.hue); this._crystal(ctx, d.x, d.y, d.size, d.rot); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
