/**
 * Protocol0 — "Protocol 0: Total Cataclysm" ULTIMATE. An 8-second tank fusion:
 *   STAGE 1  fuse + tank buff (50% damage reduction, +40% move speed) for 8s
 *   STAGE 2  while active, movement leaves a molten-lava trail; touching enemies
 *            deals collision damage + knockdown
 *   STAGE 3  at second 8, core detonation: screen-wide red/black shockwave that
 *            clears projectiles, deals burst damage, leaves a glitch grid
 * Framework-agnostic, no dependencies, no getImageData.
 *
 * ── Wiring ────────────────────────────────────────────────────────────────
 *   import { Protocol0 } from './protocol-0.js';
 *   const ult = new Protocol0(canvas);
 *   ult.trigger(player.x, player.y, enemies, {
 *     getX:e=>e.x, getY:e=>e.y,
 *     onBuffStart: b => { player.dmgReduction = b.damageReduction; player.speedMult = b.speedMult; },
 *     onBuffEnd:   () => { player.dmgReduction = 0; player.speedMult = 1; },
 *     onCollide:   e => { e.hp -= 25; e.knockdownUntil = performance.now()+500; },
 *     onDetonate:  () => { clearProjectiles(); enemies.forEach(e => e.hp -= 200); },
 *   });
 *   // each frame, pass the LIVE player position so the trail follows:
 *   ult.update(performance.now(), player.x, player.y, enemies);
 *   ult.render(ctx);
 *   // apply buff anywhere you compute movement/damage:
 *   const buff = ult.getBuff();   // {damageReduction, speedMult} or null
 */

export const PROTOCOL_DEFAULTS = {
  duration: { ms: 8000 },
  buff:     { damageReduction: 0.5, speedMult: 1.4 },
  trail:    { lifeMs: 750, width: 34, dropEveryPx: 14 },
  collide:  { radius: 40, cooldownMs: 400 },
  detonate: { ms: 850, gridMs: 1200 },
  color:    { hue: 4, sat: 100, light: 52 },
};

export class Protocol0 {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const cfg = JSON.parse(JSON.stringify(PROTOCOL_DEFAULTS));
    for (const k in opts) if (cfg[k] && typeof cfg[k] === 'object') Object.assign(cfg[k], opts[k]);
    this.cfg = cfg;
    this.state = 'idle';
    this._trail = []; this._collided = new Map();
    this._shock = null; this._gridBorn = 0;
    this.x = 0; this.y = 0;
  }
  isActive() { return this.state === 'active'; }
  isRunning() { return this.state !== 'idle'; }
  getBuff() { return this.state === 'active' ? { ...this.cfg.buff } : null; }
  _c(a = 1, l = this.cfg.color.light, h = this.cfg.color.hue) { return `hsla(${h},${this.cfg.color.sat}%,${l}%,${a})`; }

  trigger(x, y, enemies, opts) {
    this.state = 'active'; this.born = performance.now();
    this.x = x; this.y = y; this._lastPos = { x, y }; this._dropAcc = 0;
    this.enemies = enemies || []; this.opts = opts || {};
    this._trail.length = 0; this._collided.clear(); this._shock = null; this._detonated = false;
    if (this.opts.onBuffStart) this.opts.onBuffStart({ ...this.cfg.buff });
  }

  update(now, x, y, enemies) {
    this._now = now;
    if (enemies) this.enemies = enemies;
    if (x != null) this.x = x; if (y != null) this.y = y;

    if (this.state === 'active') {
      // STAGE 2: lava trail + collision while moving
      const dx = this.x - this._lastPos.x, dy = this.y - this._lastPos.y, moved = Math.hypot(dx, dy);
      this._dropAcc += moved;
      let _tg = 0;
      while (this._dropAcc >= this.cfg.trail.dropEveryPx && _tg++ < 16) {
        this._dropAcc -= this.cfg.trail.dropEveryPx;
        this._trail.push({ x: this.x, y: this.y, born: now });
      }
      if (this._dropAcc > this.cfg.trail.dropEveryPx * 4) this._dropAcc = 0;   // perf: no burst on teleport/large move
      if (moved > 0.1) {
        const r2 = this.cfg.collide.radius * this.cfg.collide.radius;
        for (const en of this.enemies) {
          const ex = this.opts.getX(en), ey = this.opts.getY(en);
          if ((ex - this.x) ** 2 + (ey - this.y) ** 2 <= r2) {
            const last = this._collided.get(en) || 0;
            if (now - last >= this.cfg.collide.cooldownMs) { this._collided.set(en, now); if (this.opts.onCollide) this.opts.onCollide(en); }
          }
        }
      }
      this._lastPos = { x: this.x, y: this.y };
      if (now - this.born >= this.cfg.duration.ms) this._detonate(now);
    } else if (this.state === 'detonate') {
      if (now - this._shock.born >= this.cfg.detonate.ms) { this.state = 'glitch'; this._gridBorn = now; }
    } else if (this.state === 'glitch') {
      if (now - this._gridBorn >= this.cfg.detonate.gridMs) this.state = 'idle';
    }
    this._trail = this._trail.filter(s => now - s.born < this.cfg.trail.lifeMs);
      if (this._trail.length > 140) this._trail.splice(0, this._trail.length - 140);   // hard cap
  }

  _detonate(now) {
    this._detonated = true;
    if (this.opts.onBuffEnd) this.opts.onBuffEnd();
    if (this.opts.onDetonate) this.opts.onDetonate();
    const maxR = Math.hypot(this.canvas.width, this.canvas.height);
    this._shock = { x: this.x, y: this.y, born: now, maxR };
    this.state = 'detonate';
  }

  render(ctx) {
    const now = this._now ?? performance.now();
    // STAGE 2: molten lava trail
    if (this._trail.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of this._trail) {
        const t = (now - s.born) / this.cfg.trail.lifeMs; if (t >= 1) continue;
        const a = 1 - t, r = this.cfg.trail.width * (0.5 + 0.5 * a);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        g.addColorStop(0, this._c(0.8 * a, 60, 28)); g.addColorStop(0.5, this._c(0.5 * a, 48)); g.addColorStop(1, this._c(0, 40));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // STAGE 1: titan fusion aura around the player
    if (this.state === 'active') {
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.012);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = this._c(1); ctx.shadowBlur = 28;
      ctx.strokeStyle = this._c(0.6 * pulse, 55); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(this.x, this.y - 60, 70 + 8 * pulse, 0, Math.PI * 2); ctx.stroke();
      // jagged inner ring
      ctx.strokeStyle = this._c(0.9, 70); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2, rr = 52 + (i % 2 ? 10 : 0); const px = this.x + Math.cos(a) * rr, py = this.y - 60 + Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    // STAGE 3: core detonation shockwave
    if (this.state === 'detonate' && this._shock) {
      const t = (now - this._shock.born) / this.cfg.detonate.ms, r = this._shock.maxR * t, a = 1 - t;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(this._shock.x, this._shock.y, r * 0.6, this._shock.x, this._shock.y, r);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, `rgba(10,0,0,${0.5 * a})`); g.addColorStop(0.92, this._c(0.9 * a, 55)); g.addColorStop(1, this._c(0, 40));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this._shock.x, this._shock.y, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = this._c(a, 92); ctx.lineWidth = 5; ctx.shadowColor = this._c(1); ctx.shadowBlur = 26;
      ctx.beginPath(); ctx.arc(this._shock.x, this._shock.y, Math.max(1, r), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // STAGE 3 aftermath: glitch distortion grid
    if (this.state === 'glitch') {
      const t = (now - this._gridBorn) / this.cfg.detonate.gridMs, a = (1 - t) * 0.5;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = this._c(a, 50); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= this.canvas.width; x += 26) { const off = (Math.random() - 0.5) * 8 * (1 - t); ctx.moveTo(x + off, 0); ctx.lineTo(x + off, this.canvas.height); }
      for (let y = 0; y <= this.canvas.height; y += 26) { const off = (Math.random() - 0.5) * 8 * (1 - t); ctx.moveTo(0, y + off); ctx.lineTo(this.canvas.width, y + off); }
      ctx.stroke(); ctx.restore();
    }
  }
}
