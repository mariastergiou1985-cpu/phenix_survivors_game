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
  meteor:   { speed: 6, accel: 0.25, sizeMin: 10, sizeMax: 20, topY: -40 },
  impact:   { radius: 46, debris: 14 },
  grid:     { cell: 22 },
  color:    { hue: 4, sat: 100, light: 56 },
};

// ── Official meteorite sprite (FX sheets) — replaces the procedural red balls.
// void_ember_comet: the engine's canonical flaming-comet asset. Crystals remain
// only as a fallback while the image is still loading.
const _METEOR_SPRITE = (typeof Image !== 'undefined') ? new Image() : null;
if (_METEOR_SPRITE) _METEOR_SPRITE.src = 'assets/enemies/weapons/sprites/void_ember_comet.png?v=20260705000000';

export class MeteorRain {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const cfg = JSON.parse(JSON.stringify(METEOR_DEFAULTS));
    for (const k in opts) if (cfg[k] && typeof cfg[k] === 'object') Object.assign(cfg[k], opts[k]);
    this.cfg = cfg;
    this.state = 'idle';
    this._meteors = []; this._debris = [];
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
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // meteors
    ctx.shadowColor = this._c(1); ctx.shadowBlur = 12;
    for (const m of this._meteors) {
      // trail
      ctx.strokeStyle = this._c(0.5, 55); ctx.lineWidth = m.size * 0.5;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 2.5, m.y - m.vy * 2.5); ctx.stroke();
      if (_METEOR_SPRITE && _METEOR_SPRITE.complete && _METEOR_SPRITE.naturalWidth > 0) {
        // Official meteorite asset at 1.5× the old visual footprint, nose-first along velocity.
        const sz = m.size * 3;
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 4);
        ctx.drawImage(_METEOR_SPRITE, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      } else {
        ctx.fillStyle = this._c(0.95, 55); this._crystal(ctx, m.x, m.y, m.size, m.rot);
        ctx.fillStyle = this._c(1, 85); this._crystal(ctx, m.x, m.y, m.size * 0.5, m.rot);
      }
    }
    // debris
    ctx.shadowBlur = 6;
    for (const d of this._debris) { const t = (now - d.born) / d.life; if (t >= 1) continue; ctx.globalAlpha = 1 - t; ctx.fillStyle = this._c(1, 60, d.ember ? 28 : this.cfg.color.hue); this._crystal(ctx, d.x, d.y, d.size, d.rot); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
