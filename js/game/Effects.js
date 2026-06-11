import { Vec2, WIDTH, HEIGHT, GREY } from '../constants.js';
import { clamp } from '../utils.js';

// ─── Particle ─────────────────────────────────────────────────────────────────
class Particle {
  constructor(pos, vel, color, radius, life) {
    this.pos     = pos.clone();
    this.vel     = vel;
    this.color   = color;
    this.radius  = radius;
    this.life    = life;
    this.maxLife = life;
  }

  update(dt) {
    this.pos.addMut(this.vel.scale(dt));
    this.life -= dt;
  }

  draw(ctx) {
    ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, Math.max(1, this.radius * (this.life / this.maxLife)), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ─── ParticleSystem ───────────────────────────────────────────────────────────
export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.MAX       = 200;
  }

  _add(p) {
    if (this.particles.length >= this.MAX) this.particles.shift();
    this.particles.push(p);
  }

  spawnCorePickup(pos, color) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const speed = 80 + Math.random() * 80;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this._add(new Particle(pos, vel, color, 3, 0.4));
    }
  }

  spawnCoreSlot(pos, color) {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const speed = 60 + Math.random() * 60;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed - 40);
      this._add(new Particle(pos, vel, color, 4, 0.6));
    }
  }

  spawnHitSparks(pos, color, count = 4, size = 2) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 60;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this._add(new Particle(pos, vel, color, size, 0.25));
    }
  }

  // Short cyber/glitch spark burst on enemy death (color + white flecks).
  // count/size are optional so callers can scale the burst by enemy weight; the
  // defaults reproduce the original 8-particle burst exactly.
  spawnDeathBurst(pos, color, count = 8, size = 2) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 110;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this._add(new Particle(pos, vel, i % 3 === 0 ? '#e6f5ff' : color, size + Math.random() * 2, 0.3));
    }
  }

  // Expanding neon shock-ring for heavier/elite/boss-type deaths. Evenly spaced
  // particles flung radially outward read as a clean cyber ring. Uses the same
  // capped pool — no new system, no Game-loop wiring.
  spawnDeathRing(pos, color, count = 14, speed = 160, size = 2) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this._add(new Particle(pos, vel, color, size, 0.32));
    }
  }

  // Bite-impact blood splash — stylized crimson/red flecks (short, arcade, not gore).
  spawnBloodSplash(pos) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 140;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this._add(new Particle(pos, vel, i % 4 === 0 ? '#ff3750' : '#a8112a', 2 + Math.random() * 2, 0.3));
    }
  }

  // Bigger one-shot burst for boss death; cycles through `colors`.
  spawnExplosion(pos, colors, count = 24) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 220;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this._add(new Particle(pos, vel, colors[i % colors.length], 3 + Math.random() * 3, 0.4 + Math.random() * 0.4));
    }
  }

  update(dt) {
    this.particles = this.particles.filter(p => {
      p.update(dt);
      return p.life > 0;
    });
  }

  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }
}

// ─── ScreenShake ──────────────────────────────────────────────────────────────
export class ScreenShake {
  constructor() {
    this.intensity = 0;
    this.timer     = 0;
    this._ox = 0;
    this._oy = 0;
  }

  trigger(intensity, duration) {
    this.intensity = intensity;
    this.timer     = duration;
  }

  update(dt) {
    if (this.timer <= 0) { this._ox = 0; this._oy = 0; return; }
    this.timer -= dt;
    const i  = this.intensity * clamp(this.timer, 0, 1);
    this._ox = (Math.random() - 0.5) * i * 2;
    this._oy = (Math.random() - 0.5) * i * 2;
  }

  getOffset() { return [this._ox, this._oy]; }
}

// ─── Additive neon glow ───────────────────────────────────────────────────────
// Soft additive halo (globalCompositeOperation 'lighter'). Cheap: two stacked
// arcs, no gradients/offscreen. Always restores canvas state.
export function drawGlow(ctx, x, y, r, color, alpha = 0.5) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha * 1.6);
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ─── VignetteEffect ───────────────────────────────────────────────────────────
export function drawVignette(ctx, overload, timeAlive) {
  if (overload <= 60) return;
  const intensity = (overload - 60) / 40;
  const pulse     = 0.5 + 0.5 * Math.sin(timeAlive * 3 * (1 + intensity));
  const alpha     = intensity * pulse * 0.43;

  ctx.save();
  const grad = ctx.createRadialGradient(
    WIDTH / 2, HEIGHT / 2, HEIGHT * 0.3,
    WIDTH / 2, HEIGHT / 2, HEIGHT * 0.8,
  );
  grad.addColorStop(0, 'rgba(255,55,80,0)');
  grad.addColorStop(1, `rgba(255,55,80,${alpha.toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
}

// ─── EMPRing ──────────────────────────────────────────────────────────────────
export class EMPRing {
  constructor(pos, maxRadius) {
    this.pos       = pos.clone();
    this.maxRadius = maxRadius;
    this.radius    = 0;
    this.life      = 0.6;
  }

  update(dt) {
    this.life  -= dt;
    this.radius = this.maxRadius * (1 - this.life / 0.6);
  }

  draw(ctx) {
    if (this.life <= 0) return;
    ctx.globalAlpha = clamp(this.life / 0.6, 0, 1);
    ctx.strokeStyle = GREY;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  alive() { return this.life > 0; }
}
