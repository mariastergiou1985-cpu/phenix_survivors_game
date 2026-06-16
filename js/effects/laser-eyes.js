/**
 * LaserEyes — "Cyber-Infrared Laser Eyes": a charged, piercing hitscan beam.
 * Phases: charge (0.3s, eyes glow + rising smoke) -> fire (1.5s parallel beams) -> done.
 * The beams pierce ALL enemies on their line and tick damage every 0.1s.
 * Framework-agnostic, no dependencies, no getImageData.
 *
 * ── Wiring ────────────────────────────────────────────────────────────────
 *   import { LaserEyes } from './laser-eyes.js';
 *   const eyes = new LaserEyes(canvas);
 *   eyes.cast({
 *     getEyes: () => [ {x:px-12,y:py-180}, {x:px+12,y:py-180},   // human eyes
 *                      {x:px-30,y:py-230}, {x:px+30,y:py-230} ], // oni eyes
 *     getAim:  () => ({ x: mouseX, y: mouseY }),                 // direction the beams point
 *     enemies, getX:e=>e.x, getY:e=>e.y, groundY: floorY,
 *     onTick:  e => { e.hp -= 6; },                              // damage tick (every 0.1s)
 *   });
 *   // each frame:
 *   eyes.update(performance.now(), enemies);
 *   eyes.render(ctx);
 */

export const LASER_DEFAULTS = {
  charge: { ms: 300 },
  beam:   { durationMs: 1500, width: 2.6, maxLen: 1500, hitWidth: 16, tickMs: 100 },
  burn:   { sparkRate: 1, disruptRate: 0, fireRate: 0.1, fireLifeMs: 600 },  // reduced for performance
  color:  { hue: 2, sat: 100, light: 56 },
};

export class LaserEyes {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const cfg = JSON.parse(JSON.stringify(LASER_DEFAULTS));
    for (const k in opts) if (cfg[k] && typeof cfg[k] === 'object') Object.assign(cfg[k], opts[k]);
    this.cfg = cfg;
    this.state = 'idle';
    this._smoke = []; this._sparks = []; this._fires = []; this._disrupt = [];
    this._lastTick = 0;
  }
  isActive() { return this.state !== 'idle'; }
  _c(a = 1, l = this.cfg.color.light, h = this.cfg.color.hue) { return `hsla(${h},${this.cfg.color.sat}%,${l}%,${a})`; }

  cast(opts) {
    this.opts = opts; this.enemies = opts.enemies || [];
    this.state = 'charge'; this.born = performance.now();
    this._smoke.length = 0; this._sparks.length = 0; this._fires.length = 0; this._disrupt.length = 0;
    this._lastTick = 0;
  }

  _dir() {
    const eyes = this.opts.getEyes(), aim = this.opts.getAim();
    let ex = 0, ey = 0; for (const e of eyes) { ex += e.x; ey += e.y; }
    ex /= eyes.length; ey /= eyes.length;
    let dx = aim.x - ex, dy = aim.y - ey; const m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  }
  _endpoint(eye, dir) {
    let len = this.cfg.beam.maxLen;
    const gy = this.opts.groundY;
    if (gy != null && dir.y > 0.001) { const d = (gy - eye.y) / dir.y; if (d > 0 && d < len) { len = d; return { x: eye.x + dir.x * len, y: eye.y + dir.y * len, ground: true }; } }
    return { x: eye.x + dir.x * len, y: eye.y + dir.y * len, ground: false };
  }

  update(now, enemies) {
    this._now = now;
    if (enemies) this.enemies = enemies;
    if (this.state === 'charge') {
      const eyes = this.opts.getEyes();
      for (const e of eyes) if (Math.random() < 0.2)
        this._smoke.push({ x: e.x + (Math.random() - 0.5) * 6, y: e.y, vx: (Math.random() - 0.5) * 0.3, vy: -0.6 - Math.random() * 0.6, size: 3 + Math.random() * 4, born: now, life: 500 });
      if (now - this.born >= this.cfg.charge.ms) { this.state = 'fire'; this.fireBorn = now; this._lastTick = now; }
    } else if (this.state === 'fire') {
      const dir = this._dir(), eyes = this.opts.getEyes();
      const ends = eyes.map(e => this._endpoint(e, dir));
      // damage tick (pierces everyone on the line)
      if (now - this._lastTick >= this.cfg.beam.tickMs) {
        this._lastTick = now;
        for (const en of this.enemies) {
          const ex = this.opts.getX(en), ey = this.opts.getY(en);
          if (this._onBeam(ex, ey, eyes, dir, ends)) { if (this.opts.onTick) this.opts.onTick(en); this._spark(ex, ey, 2); }
        }
      }
      // burn at endpoints (ground / max range)
      for (const end of ends) {
        for (let i = 0; i < this.cfg.burn.sparkRate; i++) this._spark(end.x, end.y, 1);
        if (end.ground && Math.random() < this.cfg.burn.fireRate)
          this._fires.push({ x: end.x + (Math.random() - 0.5) * 18, y: end.y, size: 6 + Math.random() * 10, born: now, life: this.cfg.burn.fireLifeMs });
        for (let i = 0; i < this.cfg.burn.disruptRate; i++) {
          const t = Math.random();
          this._disrupt.push({ x: eyes[0].x + (end.x - eyes[0].x) * t + (Math.random() - 0.5) * 10, y: eyes[0].y + (end.y - eyes[0].y) * t + (Math.random() - 0.5) * 10, size: 2 + Math.random() * 3, born: now, life: 160 });
        }
      }
      if (now - this.fireBorn >= this.cfg.beam.durationMs) this.state = 'idle';
    }
    this._step(now);
  }

  _onBeam(ex, ey, eyes, dir, ends) {
    for (let i = 0; i < eyes.length; i++) {
      const e = eyes[i], len = Math.hypot(ends[i].x - e.x, ends[i].y - e.y);
      const wx = ex - e.x, wy = ey - e.y, t = wx * dir.x + wy * dir.y;
      if (t < 0 || t > len) continue;
      const perp = Math.abs(wx * dir.y - wy * dir.x);
      if (perp <= this.cfg.beam.hitWidth) return true;
    }
    return false;
  }
  _spark(x, y, n) {
    if (this._sparks.length > 60) return;  // cap for performance
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3.5;
      this._sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6, size: 2 + Math.random() * 3, born: this._now, life: 280, ember: Math.random() < 0.5 }); }
  }
  _step(now) {
    for (const p of this._smoke) { p.x += p.vx; p.y += p.vy; p.vy *= 0.99; }
    this._smoke = this._smoke.filter(p => now - p.born < p.life);
    for (const p of this._sparks) { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.vx *= 0.95; }
    this._sparks = this._sparks.filter(p => now - p.born < p.life);
    this._fires = this._fires.filter(p => now - p.born < p.life);
    this._disrupt = this._disrupt.filter(p => now - p.born < p.life);
  }

  render(ctx) {
    const now = this._now ?? performance.now();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // smoke (charge)
    for (const p of this._smoke) { const t = (now - p.born) / p.life; if (t >= 1) continue; ctx.globalAlpha = (1 - t) * 0.5; ctx.fillStyle = this._c(1, 40); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;

    if (this.state === 'charge') {
      const k = Math.min(1, (now - this.born) / this.cfg.charge.ms);
      ctx.shadowColor = this._c(1); ctx.shadowBlur = 14 + 10 * k;
      for (const e of this.opts.getEyes()) { ctx.fillStyle = this._c(0.9, 60 + 30 * k); ctx.beginPath(); ctx.arc(e.x, e.y, 2 + 3 * k, 0, Math.PI * 2); ctx.fill(); }
    }
    if (this.state === 'fire') {
      const dir = this._dir(), eyes = this.opts.getEyes(), ends = eyes.map(e => this._endpoint(e, dir));
      const flick = 0.7 + Math.random() * 0.3;
      // No shadowBlur on beams (performance) — two-pass: glow layer + bright core
      for (let i = 0; i < eyes.length; i++) {
        ctx.strokeStyle = this._c(0.4 * flick, 50); ctx.lineWidth = this.cfg.beam.width * 2.5;
        ctx.beginPath(); ctx.moveTo(eyes[i].x, eyes[i].y); ctx.lineTo(ends[i].x, ends[i].y); ctx.stroke();
        ctx.strokeStyle = this._c(flick, 92); ctx.lineWidth = this.cfg.beam.width;
        ctx.beginPath(); ctx.moveTo(eyes[i].x, eyes[i].y); ctx.lineTo(ends[i].x, ends[i].y); ctx.stroke();
      }
      // pixel disruption along the beams
      for (const d of this._disrupt) { const t = (now - d.born) / d.life; if (t >= 1) continue; ctx.globalAlpha = 1 - t; ctx.fillStyle = this._c(1, 75); ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size); }
      ctx.globalAlpha = 1;
    }
    // ground fire zones
    for (const f of this._fires) { const t = (now - f.born) / f.life; if (t >= 1) continue; const fl = 0.6 + Math.random() * 0.4; ctx.globalAlpha = (1 - t) * fl; ctx.fillStyle = this._c(1, 55, Math.random() < 0.5 ? this.cfg.color.hue : 28); ctx.beginPath(); ctx.arc(f.x, f.y - (1 - t) * 6, f.size * (0.6 + 0.4 * (1 - t)), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    // sparks
    for (const p of this._sparks) { const t = (now - p.born) / p.life; if (t >= 1) continue; ctx.globalAlpha = 1 - t; ctx.fillStyle = this._c(1, 60, p.ember ? 30 : this.cfg.color.hue); ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
