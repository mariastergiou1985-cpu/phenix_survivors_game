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

  // Layered normal-enemy death pop: colored burst ring + white core flash + scatter.
  // Better visual weight than basic spawnDeathBurst — intended for all normal enemy deaths.
  spawnDeathBurstImproved(pos, color, count = 10, size = 2.2) {
    // Scatter burst
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 130;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this._add(new Particle(pos, vel, i % 4 === 0 ? '#e6f5ff' : color, size + Math.random() * 2.5, 0.35));
    }
    // Evenly-spaced ring (reads as an expanding circle)
    const ringCount = 10;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const speed = 140 + Math.random() * 30;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this._add(new Particle(pos, vel, color, 1.8, 0.28));
    }
    // Bright core flash (3 white sparks outward)
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const vel   = new Vec2(Math.cos(angle) * 55, Math.sin(angle) * 55);
      this._add(new Particle(pos, vel, '#ffffff', 2.5, 0.18));
    }
  }

  // Pre-ability spiral spark — spawn multiple calls with varied angles for a spiral burst.
  // Each call adds one outward radial particle. Caller loops 8-12 times with evenly spaced angles.
  spawnWindupSpark(pos, angle, color, speed = 110) {
    const vel = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this._add(new Particle(pos, vel, color, 2.5, 0.22));
  }

  // Element-tagged death burst — reads the weapon hit color to pick an element palette.
  // Adds a scatter burst + a small radial ring so element kills feel distinct from generic deaths.
  // Capped by the shared MAX pool — no extra overhead. Called from Enemy._die() when _lastHitColor set.
  spawnElementDeath(pos, hitColor) {
    const hc = (hitColor || '').toLowerCase();
    let palette;
    if      (/ff[46][04a]|ff[89]/.test(hc))   palette = ['#ff6600','#ffaa00','#ff2200','#ffddaa']; // fire/orange
    else if (/00ff[cf]|0af|9650|b35c/.test(hc)) palette = ['#cc44ff','#9933ff','#ff44cc','#cc00ff']; // void/gravity/purple
    else if (/00ff[e-f]|#0[0a]f|00cc|cyan/.test(hc)) palette = ['#00ffff','#00aaff','#0066ff','#aaffff']; // cyan/beam/ice
    else if (/00ff4|44ff|88ff/.test(hc))       palette = ['#00ff44','#44ff00','#88ff44','#00cc33']; // poison/green
    else if (/ff4dd|ff00ff|magent/.test(hc))   palette = ['#ff44cc','#ff00ff','#ffaaff','#cc00aa']; // magenta
    else                                        palette = ['#44ccff','#ffffff','#aaddff','#66eeff']; // generic cyber

    // Scatter burst (12 sparks)
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 75 + Math.random() * 115;
      const vel   = new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this._add(new Particle(pos, vel, palette[i % palette.length], 2 + Math.random() * 2.5, 0.35));
    }
    // Element ring (8 evenly spaced)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const vel   = new Vec2(Math.cos(angle) * 100, Math.sin(angle) * 100);
      this._add(new Particle(pos, vel, palette[0], 1.5, 0.25));
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
    this._maxTimer = 0.001;  // duration at last intensity update — used for decay curve
    this._ox = 0;
    this._oy = 0;
  }

  // Keep the strongest active shake — never let a weaker trigger cut a heavy one short
  trigger(intensity, duration) {
    if (intensity > this.intensity) {
      this.intensity = intensity;
      this._maxTimer = Math.max(duration, 0.001);
    }
    if (duration > this.timer) this.timer = duration;
  }

  update(dt) {
    if (this.timer <= 0) {
      // Smooth settle: drift back to zero rather than snapping (avoids sudden pop)
      this._ox *= 0.65;
      this._oy *= 0.65;
      if (Math.abs(this._ox) < 0.05) this._ox = 0;
      if (Math.abs(this._oy) < 0.05) this._oy = 0;
      // Decay intensity so the next trigger starts clean
      this.intensity *= 0.5;
      if (this.intensity < 0.1) this.intensity = 0;
      return;
    }
    this.timer -= dt;
    // Proper linear decay: full intensity when triggered, fades to 0 as timer reaches 0
    const decay = Math.max(0, this.timer / this._maxTimer);
    const i     = this.intensity * decay;
    // Smoothed noise: lerp toward a random target each frame — feels cinematic, not jittery
    const tx = (Math.random() - 0.5) * i * 2;
    const ty = (Math.random() - 0.5) * i * 2;
    this._ox = this._ox * 0.35 + tx * 0.65;
    this._oy = this._oy * 0.35 + ty * 0.65;
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

// ─── Player damage pulse ────────────────────────────────────────────────────────
// Short red edge-vignette flashed when the player takes a hit. Same radial style as
// drawVignette (transparent center → readable), scaled by the remaining flash time and
// the hit's intensity (boss attacks pass a higher intensity than chip/contact). Visual only.
export function drawDamagePulse(ctx, flash, intensity, duration) {
  if (flash <= 0 || intensity <= 0) return;
  const t     = clamp(flash / duration, 0, 1);   // 1 at the moment of the hit → 0 as it fades
  const alpha = t * intensity * 0.34;             // peak ~0.34 for a heavy hit — premium, not opaque
  ctx.save();
  const grad = ctx.createRadialGradient(
    WIDTH / 2, HEIGHT / 2, HEIGHT * 0.26,
    WIDTH / 2, HEIGHT / 2, HEIGHT * 0.82,
  );
  grad.addColorStop(0, 'rgba(255,40,60,0)');
  grad.addColorStop(1, `rgba(255,40,60,${alpha.toFixed(3)})`);
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

// ─── ChaosAmbientSystem ───────────────────────────────────────────────────────
// Bounded (MAX=40) slowly-drifting neon particle field for Chaos Mode atmosphere.
// Spawn at world-space positions near the player, draw in world-space camera ctx.
export class ChaosAmbientSystem {
  constructor() {
    this.MAX       = 40;
    this.particles = [];
  }

  spawn(x, y) {
    if (this.particles.length >= this.MAX) this.particles.shift();
    const angle = Math.random() * Math.PI * 2;
    const speed = 8 + Math.random() * 18;
    this.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.2 + Math.random() * 1.2,
      maxLife: 2.4,
      r: 1.8 + Math.random() * 2.0,
      color: Math.random() < 0.55 ? '#ff2d95' : (Math.random() < 0.5 ? '#9b6bff' : '#ff5533'),
    });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1) * 0.55;
      ctx.globalAlpha = a;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  clear() { this.particles.length = 0; }
}

// ─── CRT Vignette ─────────────────────────────────────────────────────────────
// Permanent always-on corner darkening — transparent center, dark corners.
// Drawn last over world + HUD so the entire screen reads like a curved CRT monitor.
export function drawCRTVignette(ctx) {
  ctx.save();
  const grad = ctx.createRadialGradient(
    WIDTH / 2, HEIGHT / 2, HEIGHT * 0.28,
    WIDTH / 2, HEIGHT / 2, HEIGHT * 0.76
  );
  grad.addColorStop(0,    'rgba(0,0,0,0)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.06)');
  grad.addColorStop(1,    'rgba(0,0,0,0.48)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
}

// ─── Chromatic Aberration ─────────────────────────────────────────────────────
// RGB edge-channel split on player damage — red fringe left, cyan fringe right.
// Fades together with the damage pulse for a premium "display malfunction" feel.
export function drawChromaticAberration(ctx, flash, intensity, duration) {
  if (flash <= 0 || intensity <= 0) return;
  const t     = clamp(flash / duration, 0, 1);
  const alpha = t * intensity * 0.32;
  if (alpha < 0.01) return;

  ctx.save();

  // Red fringe — left edge
  const rg = ctx.createLinearGradient(0, 0, 100, 0);
  rg.addColorStop(0, `rgba(255,30,60,${(alpha * 0.9).toFixed(3)})`);
  rg.addColorStop(1, 'rgba(255,30,60,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, 100, HEIGHT);

  // Cyan fringe — right edge
  const cg = ctx.createLinearGradient(WIDTH, 0, WIDTH - 100, 0);
  cg.addColorStop(0, `rgba(0,220,255,${(alpha * 0.9).toFixed(3)})`);
  cg.addColorStop(1, 'rgba(0,220,255,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(WIDTH - 100, 0, 100, HEIGHT);

  // Thin scan-distortion band (drifts near screen centre on heavy hits)
  const by = (HEIGHT / 2) + (t - 0.5) * 80;
  const bg = ctx.createLinearGradient(0, by, 0, by + 3);
  bg.addColorStop(0, `rgba(255,255,255,${(alpha * 0.18).toFixed(3)})`);
  bg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, by, WIDTH, 3);

  ctx.restore();
}

// ─── Bloom / neon glow pass ───────────────────────────────────────────────────
// Canvas 2D post-process bloom.  Snapshots the rendered frame into an
// OffscreenCanvas (created once, reused every frame), then composites it back
// blurred with 'screen' blending so bright neon pixels spread a soft halo
// without darkening anything.  alpha 0.22 = subtle premium look.
// ct