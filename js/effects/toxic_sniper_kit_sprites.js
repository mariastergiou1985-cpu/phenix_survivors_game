/* =====================================================================
   TOXIC SNIPER KIT — SPRITE EDITION (visuals upgraded v2)
   Same public API + integration contract. Logic (damage, collisions,
   timers, signatures, exports) UNCHANGED. Changes in this revision:
     • Orbital Katana: real, clearly-readable VECTOR KATANAS (blade +
       guard + wrapped handle), NO glow, that DRIP toxin as they spin.
     • Plague Trail Dash: lunges toward the player's MOVEMENT direction
       (player.facing, fed from WASD by the host) — not the nearest enemy.
     • Toxic bullet + gas: same upgraded neon look as before.

   Integration contract (unchanged):
     • player  -> { x, y, height, facing }   (facing = movement angle, radians)
     • enemies -> { x, y, radius, hp, sprite, spriteW, spriteH,
                    takeDamage(), applyKnockback(), beginMelt() }
     • particles -> { add(p), burst(arr) }
   ===================================================================== */

const TOXIC      = '#00ff33';
const TOXIC_DARK = '#0a9c44';
const TOXIC_DEEP = '#063b1a';
const TOXIC_LITE = '#7cff8a';
const VENOM_HOT  = '#eaffef';
const STEEL      = '#cfe6d2';
const STEEL_DK   = '#5f7a66';
const rand  = (a, b) => a + Math.random() * (b - a);
const dist  = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function loadSprite(src) {
  const img = new Image();
  img.loaded = false;
  img.addEventListener('load', () => { img.loaded = true; });
  img.src = src;
  return img;
}

/* =====================================================================
   1. TOXIC BULLET  +  TOXIC SNIPER  (automatic)
   ===================================================================== */
class ToxicBullet {
  static sprite = loadSprite('assets/weapons/toxic_bullet.png');

  constructor(x, y, tx, ty, opts = {}) {
    this.x = x; this.y = y;
    this.angle = Math.atan2(ty - y, tx - x);
    this.speed = opts.speed ?? 620;
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.w = opts.w ?? 28;
    this.h = opts.h ?? 12;
    this.radius = opts.radius ?? 6;
    this.damage = opts.damage ?? 14;
    this.dead = false;
    this.trail = [];
    this.maxTrail = 6;
  }

  update(dt, bounds) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.maxTrail) this.trail.shift();
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -40 || this.x > bounds.w + 40 ||
        this.y < -40 || this.y > bounds.h + 40) this.dead = true;
  }

  _blit(ctx, x, y, alpha, scale) {
    const img = ToxicBullet.sprite;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(this.angle);
    if (img.loaded) {
      ctx.imageSmoothingEnabled = false;
      const w = this.w * scale, h = this.h * scale;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      const w = this.w * scale, h = this.h * scale;
      ctx.fillStyle = TOXIC_DARK;
      ctx.beginPath();
      ctx.moveTo(w * 0.50, 0); ctx.lineTo(-w * 0.30, h * 0.45);
      ctx.lineTo(-w * 0.12, 0); ctx.lineTo(-w * 0.30, -h * 0.45);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = TOXIC;
      ctx.beginPath();
      ctx.moveTo(w * 0.40, 0); ctx.lineTo(-w * 0.16, h * 0.24);
      ctx.lineTo(-w * 0.05, 0); ctx.lineTo(-w * 0.16, -h * 0.24);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = VENOM_HOT;
      ctx.beginPath(); ctx.arc(w * 0.42, 0, Math.max(1, h * 0.13), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const a = (i + 1) / this.trail.length;
      this._blit(ctx, p.x, p.y, a * 0.35, 0.45 + a * 0.45);
    }
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.w);
    g.addColorStop(0, 'rgba(124,255,138,0.55)');
    g.addColorStop(1, 'rgba(0,255,51,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.w, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = TOXIC; ctx.shadowBlur = 14;
    this._blit(ctx, this.x, this.y, 1, 1);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

class ToxicSniper {
  constructor(player, enemies, particles, bounds) {
    this.player = player;
    this.enemies = enemies;
    this.particles = particles;
    this.bounds = bounds;
    this.bullets = [];
    this.fireInterval = 1.5;
    this.fireTimer = 0;
    this.bulletDamage = 14;
    this.poison = { dps: 6, duration: 3, tickEvery: 0.2 };
  }

  findTarget() {
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.dying) continue;
      if (e.x < 0 || e.x > this.bounds.w || e.y < 0 || e.y > this.bounds.h) continue;
      const d = dist(this.player.x, this.player.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  fire(target) {
    this.bullets.push(new ToxicBullet(this.player.x, this.player.y, target.x, target.y, { damage: this.bulletDamage }));
  }

  spawnImpactParticles(x, y) {
    const out = [];
    const n = Math.floor(rand(10, 16));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(60, 260);
      out.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        gravity: 520, size: rand(2, 5),
        color: Math.random() < 0.25 ? '#d6ffe0' : TOXIC,
        life: rand(0.3, 0.5), maxLife: 0.5, dead: false,
        update(dt) { this.life -= dt; if (this.life <= 0) { this.dead = true; return; }
                     this.vy += this.gravity * dt; this.x += this.vx * dt; this.y += this.vy * dt; },
        draw(c) { c.globalAlpha = clamp(this.life / this.maxLife, 0, 1); c.fillStyle = this.color;
                  c.fillRect(this.x | 0, this.y | 0, this.size, this.size); c.globalAlpha = 1; }
      });
    }
    out.push({
      x, y, r: 2, maxR: rand(22, 34), life: 0.32, maxLife: 0.32, dead: false,
      update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; this.r += (this.maxR - this.r) * Math.min(1, dt * 10); },
      draw(c) { const t = clamp(this.life / this.maxLife, 0, 1); c.save(); c.globalCompositeOperation = 'lighter';
                c.globalAlpha = t; c.strokeStyle = TOXIC_LITE; c.lineWidth = 2;
                c.beginPath(); c.arc(this.x, this.y, this.r, 0, Math.PI * 2); c.stroke(); c.restore(); c.globalAlpha = 1; }
    });
    this.particles.burst(out);
  }

  applyPoison(e) {
    e.poison = { timeLeft: this.poison.duration, tickTimer: 0,
                 tickEvery: this.poison.tickEvery, dps: this.poison.dps };
  }

  update(dt) {
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      const t = this.findTarget();
      if (t) { this.fire(t); this.fireTimer = this.fireInterval; }
      else { this.fireTimer = 0.1; }
    }
    for (const b of this.bullets) {
      b.update(dt, this.bounds);
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || e.dying) continue;
        if (dist(b.x, b.y, e.x, e.y) <= b.radius + e.radius) {
          e.takeDamage(b.damage);
          this.applyPoison(e);
          this.spawnImpactParticles(b.x, b.y);
          b.dead = true;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  draw(ctx) { for (const b of this.bullets) b.draw(ctx); }
}

/* =====================================================================
   2. ORBITAL KATANA BARRIER  — clear vector katanas, no glow, drip toxin
   ===================================================================== */
class OrbitalKatanaBarrier {
  static sprite = loadSprite('assets/weapons/katana.png');

  constructor(player, enemies, particles) {
    this.player = player;
    this.enemies = enemies;
    this.particles = particles;

    this.angle = 0;
    this.spinSpeed = 2.6;
    this.orbitRadius = 78;
    this.bladeLength = player.height * 0.95;   // a bit longer so it reads clearly as a sword
    this.bladeWidth = this.bladeLength * 0.20;
    this.damage = 30;
    this.knockback = 360;

    this.blades = [
      { offset: 0,       recoil: 0, flash: 0, hits: new Map() },
      { offset: Math.PI, recoil: 0, flash: 0, hits: new Map() }
    ];

    this._drips    = [];   // falling toxin droplets shed by the blades
    this._dripAcc  = 0;
  }

  update(dt) {
    this.angle = (this.angle + this.spinSpeed * dt) % (Math.PI * 2);
    const cx = this.player.x, cy = this.player.y;

    for (const blade of this.blades) {
      blade.recoil += (0 - blade.recoil) * Math.min(1, dt * 12);
      if (blade.flash > 0) blade.flash -= dt;

      const a = this.angle + blade.offset;
      const r = this.orbitRadius + blade.recoil;
      blade.a = a;
      blade.x = cx + Math.cos(a) * r;
      blade.y = cy + Math.sin(a) * r;

      for (const e of this.enemies) {
        if (e.dead || e.dying) continue;
        const last = blade.hits.get(e) ?? -1;
        if (last > 0) { blade.hits.set(e, last - dt); continue; }
        const reach = e.radius + this.bladeWidth + this.bladeLength * 0.5;
        if (dist(blade.x, blade.y, e.x, e.y) <= reach) {
          e.takeDamage(this.damage);
          const ka = Math.atan2(e.y - cy, e.x - cx);
          e.applyKnockback(Math.cos(ka) * this.knockback, Math.sin(ka) * this.knockback);
          blade.flash = 0.12;
          blade.recoil = 26;
          blade.hits.set(e, 0.25);
        }
      }
    }

    // shed toxin drips from a random point along each blade
    this._dripAcc += dt;
    if (this._dripAcc >= 0.05) {
      this._dripAcc = 0;
      for (const blade of this.blades) {
        if (Math.random() > 0.7) continue;                 // not every tick → uneven, organic drip
        const r  = this.orbitRadius + blade.recoil + this.bladeLength * (0.15 + Math.random() * 0.8);
        const ox = Math.cos(blade.a) * r, oy = Math.sin(blade.a) * r;
        // small perpendicular jitter so drops leave the cutting edge, not the centerline
        const px = -Math.sin(blade.a), py = Math.cos(blade.a);
        const j  = rand(-this.bladeWidth * 0.4, this.bladeWidth * 0.4);
        this._drips.push({
          x: cx + ox + px * j, y: cy + oy + py * j,
          vx: rand(-12, 12), vy: rand(0, 30),
          size: rand(2, 4), life: rand(0.5, 0.9), maxLife: 0.9, dead: false,
        });
      }
    }
    for (const d of this._drips) {
      d.life -= dt; if (d.life <= 0) { d.dead = true; continue; }
      d.vy += 600 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
    }
    this._drips = this._drips.filter(d => !d.dead);
  }

  // clear, solid katana: steel blade + toxic cutting edge + guard + wrapped handle. No glow.
  _drawVectorBlade(ctx, blade) {
    const bw = this.bladeWidth, bl = this.bladeLength;
    const hot = blade.flash > 0;
    const steel = hot ? '#ffffff' : STEEL;
    const edge  = hot ? '#ffffff' : TOXIC;

    // blade body (tip at -y/outward, guard/handle toward +y/pivot)
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.moveTo(0, -bl * 0.50);
    ctx.lineTo(bw * 0.30, -bl * 0.30);
    ctx.lineTo(bw * 0.26,  bl * 0.16);
    ctx.lineTo(-bw * 0.26, bl * 0.16);
    ctx.lineTo(-bw * 0.30, -bl * 0.30);
    ctx.closePath(); ctx.fill();

    // toxic cutting edge (right side + tip)
    ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.6, bw * 0.17); ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -bl * 0.50);
    ctx.lineTo(bw * 0.30, -bl * 0.30);
    ctx.lineTo(bw * 0.26,  bl * 0.16);
    ctx.stroke();
    // darker spine (left side)
    ctx.strokeStyle = STEEL_DK; ctx.lineWidth = Math.max(1, bw * 0.09);
    ctx.beginPath();
    ctx.moveTo(-bw * 0.22, -bl * 0.32); ctx.lineTo(-bw * 0.20, bl * 0.12);
    ctx.stroke();

    // guard (tsuba)
    ctx.fillStyle = hot ? '#ffffff' : TOXIC_DARK;
    ctx.fillRect(-bw * 0.55, bl * 0.16, bw * 1.10, Math.max(2, bl * 0.055));

    // handle (tsuka) + wrap stripes
    ctx.fillStyle = '#13241a';
    ctx.fillRect(-bw * 0.22, bl * 0.21, bw * 0.44, bl * 0.27);
    ctx.strokeStyle = TOXIC_DARK; ctx.lineWidth = 1;
    for (let hy = bl * 0.24; hy < bl * 0.46; hy += bl * 0.055) {
      ctx.beginPath(); ctx.moveTo(-bw * 0.22, hy); ctx.lineTo(bw * 0.22, hy); ctx.stroke();
    }
  }

  draw(ctx) {
    const cx = this.player.x, cy = this.player.y;
    const img = OrbitalKatanaBarrier.sprite;

    for (const blade of this.blades) {
      const r = this.orbitRadius + blade.recoil;

      // faint, NON-glow motion streak (normal blend, low alpha) so the spin reads
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = '#9fd6a8';
      ctx.lineWidth = this.bladeWidth * 0.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r + this.bladeLength * 0.5, blade.a - 0.5, blade.a);
      ctx.stroke();
      ctx.restore();

      // the katana itself (sprite if present, else the clear vector blade) — no shadow/glow
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(blade.a + Math.PI / 2);
      ctx.translate(0, -(r + this.bladeLength * 0.5));
      ctx.imageSmoothingEnabled = false;
      if (img.loaded) {
        ctx.drawImage(img, -this.bladeWidth / 2, -this.bladeLength / 2, this.bladeWidth, this.bladeLength);
      } else {
        this._drawVectorBlade(ctx, blade);
      }
      ctx.restore();
    }

    // toxin drips (world space, solid droplets with a short tail — no glow)
    for (const d of this._drips) {
      const t = clamp(d.life / d.maxLife, 0, 1);
      ctx.globalAlpha = t;
      ctx.strokeStyle = TOXIC_DARK; ctx.lineWidth = d.size * 0.7;
      ctx.beginPath(); ctx.moveTo(d.x, d.y - d.size * 1.6); ctx.lineTo(d.x, d.y); ctx.stroke();
      ctx.fillStyle = TOXIC;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = TOXIC_LITE;
      ctx.beginPath(); ctx.arc(d.x - d.size * 0.3, d.y - d.size * 0.3, d.size * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/* =====================================================================
   3. PLAGUE TRAIL DASH  (spacebar ultimate, toxic gas)
   ===================================================================== */
class ToxicGasPuff {
  static sprite = loadSprite('assets/weapons/smoke_puff.png');

  constructor(x, y) {
    this.x = x + rand(-10, 10);
    this.y = y + rand(-8, 8);
    this.size = rand(48, 84);
    this.rot = rand(0, Math.PI * 2);
    this.rotSpeed = rand(-1.2, 1.2);
    this.scale = rand(0.7, 1.15);
    this.scaleGrow = rand(0.05, 0.25);
    this.life = 4;
    this.maxLife = this.life;
    this.dps = 55;
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    this.rot += this.rotSpeed * dt;
    this.scale += this.scaleGrow * dt;
    this.y -= 4 * dt;
  }
  get radius() { return (this.size * this.scale) / 2; }
  draw(ctx) {
    const img = ToxicGasPuff.sprite;
    const t = clamp(this.life / this.maxLife, 0, 1);
    const s = this.size * this.scale;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    if (img.loaded) {
      ctx.globalAlpha = t * 0.85;
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
    } else {
      for (let k = 0; k < 3; k++) {
        const ox = Math.cos(this.rot + k * 2.1) * s * 0.12;
        const oy = Math.sin(this.rot * 1.3 + k * 2.1) * s * 0.12;
        const rr = (s / 2) * (1 - k * 0.18);
        const g = ctx.createRadialGradient(ox, oy, 1, ox, oy, rr);
        g.addColorStop(0,   `rgba(150,255,170,${0.50 * t})`);
        g.addColorStop(0.45,`rgba(0,255,51,${0.26 * t})`);
        g.addColorStop(1,   'rgba(4,40,18,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ox, oy, rr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `rgba(214,255,224,${0.5 * t})`;
      ctx.beginPath();
      ctx.arc(Math.cos(this.rot * 2) * s * 0.1, Math.sin(this.rot * 2) * s * 0.1, Math.max(1, s * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

class PlagueTrailDash {
  constructor(player, enemies, particles, bounds) {
    this.player = player;
    this.enemies = enemies;
    this.particles = particles;
    this.bounds = bounds;
    this.clouds = [];

    this.cooldown = 8;
    this.cdTimer = 0;
    this.dashDuration = 0.35;
    this.dashTimer = 0;
    this.trailDuration = 3;
    this.trailTimer = 0;
    this.dashSpeed = 1500;
    this.dashVx = 0; this.dashVy = 0;
    this.spawnAcc = 0;

    this._key = (e) => { if (e.code === 'Space') { e.preventDefault(); this.trigger(); } };
    window.addEventListener('keydown', this._key);
  }
  destroy() { window.removeEventListener('keydown', this._key); }

  get ready() { return this.cdTimer <= 0; }
  get cooldownPct() { return 1 - clamp(this.cdTimer / this.cooldown, 0, 1); }

  trigger() {
    if (!this.ready) return;
    this.cdTimer = this.cooldown;
    this.dashTimer = this.dashDuration;
    this.trailTimer = this.trailDuration;

    // Lunge toward the player's MOVEMENT direction (facing, fed from WASD by the host).
    const ang = this.player.facing ?? 0;
    this.dashVx = Math.cos(ang) * this.dashSpeed;
    this.dashVy = Math.sin(ang) * this.dashSpeed;
  }

  update(dt) {
    if (this.cdTimer > 0) this.cdTimer -= dt;

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.player.x = clamp(this.player.x + this.dashVx * dt, 20, this.bounds.w - 20);
      this.player.y = clamp(this.player.y + this.dashVy * dt, 20, this.bounds.h - 20);
    }

    if (this.trailTimer > 0) {
      this.trailTimer -= dt;
      this.spawnAcc += dt;
      if (this.spawnAcc >= 0.06) {
        this.spawnAcc = 0;
        const fx = this.player.x, fy = this.player.y + this.player.height * 0.42;
        this.clouds.push(new ToxicGasPuff(fx, fy));
        this.clouds.push(new ToxicGasPuff(fx, fy));
      }
    }

    for (const c of this.clouds) {
      c.update(dt);
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist(c.x, c.y, e.x, e.y) <= c.radius + e.radius) {
          e.takeDamage(c.dps * dt);
          if (e.hp <= 0 && !e.dying) e.beginMelt();
        }
      }
    }
    this.clouds = this.clouds.filter(c => !c.dead);
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const c of this.clouds) c.draw(ctx);
    ctx.restore();
  }

  static drawMeltingEnemy(ctx, enemy, t) {
    t = clamp(t, 0, 1);
    const img = enemy.sprite;
    const w = (enemy.spriteW ?? enemy.radius * 2) * (1 + t * 1.4);
    const h = (enemy.spriteH ?? enemy.radius * 2) * (1 - t);
    ctx.save();
    ctx.translate(enemy.x, enemy.y + (enemy.spriteH ?? enemy.radius * 2) / 2);
    if (img && img.loaded) {
      ctx.globalAlpha = 1 - t * 0.7;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -w / 2, -h, w, h);
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, -h / 2, 1, 0, -h / 2, w / 2);
      g.addColorStop(0, `rgba(124,255,138,${(1 - t) * 0.8})`);
      g.addColorStop(0.6, `rgba(0,255,51,${(1 - t) * 0.4})`);
      g.addColorStop(1, 'rgba(4,40,18,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -h / 2, w / 2, Math.max(2, h / 2), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export { ToxicBullet, ToxicSniper, OrbitalKatanaBarrier, ToxicGasPuff, PlagueTrailDash };
