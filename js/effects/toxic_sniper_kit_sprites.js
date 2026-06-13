/* =====================================================================
   TOXIC SNIPER KIT — SPRITE EDITION
   Three weapon systems refactored to render real Image (PNG) sprites
   via ctx.drawImage instead of vector primitives.

   Integration contract (unchanged):
     • player  -> { x, y, height, facing }
     • enemies -> array of objects exposing:
                  x, y, radius, hp, sprite (Image), spriteW, spriteH,
                  takeDamage(), applyKnockback(), beginMelt()
     • particles -> a manager with add(p) / burst(arr)

   Drop your own pixel art in by editing the `*.src` lines at the top
   of each class. Every sprite carries a `.loaded` flag so drawImage is
   only ever called on a decoded image (prevents InvalidStateError and
   the broken-frame flicker you get when drawing too early).
   ===================================================================== */

const TOXIC = '#00ff33';
const rand  = (a, b) => a + Math.random() * (b - a);
const dist  = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* Tiny helper: make an Image and track when it is safe to draw. */
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
  // ---- sprite source (drop your own pixel art here) ----
  static sprite = loadSprite('assets/weapons/toxic_bullet.png');

  constructor(x, y, tx, ty, opts = {}) {
    this.x = x; this.y = y;
    this.angle = Math.atan2(ty - y, tx - x);
    this.speed = opts.speed ?? 620;
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;

    this.w = opts.w ?? 28;          // draw size of the bullet sprite
    this.h = opts.h ?? 12;
    this.radius = opts.radius ?? 6; // collision radius
    this.damage = opts.damage ?? 14;

    this.dead = false;
    this.trail = [];                // {x, y} history for fading copies
    this.maxTrail = 5;
  }

  update(dt, bounds) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.maxTrail) this.trail.shift();

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.x < -40 || this.x > bounds.w + 40 ||
        this.y < -40 || this.y > bounds.h + 40) this.dead = true;
  }

  // draw one rotated copy of the bullet sprite at (x, y) with alpha/scale
  _blit(ctx, x, y, alpha, scale) {
    const img = ToxicBullet.sprite;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(this.angle);
    if (img.loaded) {
      ctx.imageSmoothingEnabled = false;   // keep pixel art crisp
      const w = this.w * scale, h = this.h * scale;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      // graceful fallback until the PNG decodes
      ctx.fillStyle = TOXIC;
      ctx.fillRect(-this.w * scale / 2, -this.h * scale / 2,
                   this.w * scale, this.h * scale);
    }
    ctx.restore();
  }

  draw(ctx) {
    // VFX trail: scaled-down, fading copies of the bullet sprite
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const a = (i + 1) / this.trail.length;        // head = brightest
      this._blit(ctx, p.x, p.y, a * 0.4, 0.5 + a * 0.4);
    }
    // glow + crisp head sprite
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
    this.bulletDamage = 14;   // host can scale this (e.g. Euclid's Toxin Shot Mastery)
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

  // square pixel debris (kept as primitives — cheap and reads as sparks)
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
   2. ORBITAL KATANA BARRIER  (passive, sprite blades)
   ===================================================================== */
class OrbitalKatanaBarrier {
  // ---- sprite source (a vertical blade pointing "up" works best) ----
  static sprite = loadSprite('assets/weapons/katana.png');

  constructor(player, enemies, particles) {
    this.player = player;
    this.enemies = enemies;
    this.particles = particles;

    this.angle = 0;
    this.spinSpeed = 2.6;                      // rad/s
    this.orbitRadius = 78;                     // base distance from pivot
    this.bladeLength = player.height * 0.82;   // slightly shorter than char
    this.bladeWidth = this.bladeLength * 0.22; // sprite aspect
    this.damage = 30;
    this.knockback = 360;

    this.blades = [
      { offset: 0,       recoil: 0, flash: 0, hits: new Map() },
      { offset: Math.PI, recoil: 0, flash: 0, hits: new Map() }
    ];
  }

  update(dt) {
    this.angle = (this.angle + this.spinSpeed * dt) % (Math.PI * 2);
    const cx = this.player.x, cy = this.player.y;

    for (const blade of this.blades) {
      blade.recoil += (0 - blade.recoil) * Math.min(1, dt * 12);   // ease back
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
          blade.recoil = 26;                 // bounce outward, snaps back via ease
          blade.hits.set(e, 0.25);
        }
      }
    }
  }

  draw(ctx) {
    const cx = this.player.x, cy = this.player.y;
    const img = OrbitalKatanaBarrier.sprite;

    // motion-blur arc: faint blended ring behind the blades
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = TOXIC;
    ctx.lineWidth = this.bladeLength;
    ctx.beginPath();
    ctx.arc(cx, cy, this.orbitRadius + this.bladeLength * 0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (const blade of this.blades) {
      const r = this.orbitRadius + blade.recoil;

      // per-blade trailing sweep (smooth high-speed blur)
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = blade.flash > 0 ? '#eaffef' : TOXIC;
      ctx.lineWidth = this.bladeWidth + 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r + this.bladeLength * 0.5, blade.a - 0.55, blade.a);
      ctx.stroke();
      ctx.restore();

      // rotate the actual katana sprite around the PLAYER pivot, then
      // push out along the radius (recoil lives in the translation).
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(blade.a + Math.PI / 2);       // +90° so an "up" sprite points outward
      ctx.translate(0, -(r + this.bladeLength * 0.5));
      ctx.shadowColor = TOXIC;
      ctx.shadowBlur = blade.flash > 0 ? 28 : 14;
      ctx.imageSmoothingEnabled = false;
      if (img.loaded) {
        ctx.drawImage(img, -this.bladeWidth / 2, -this.bladeLength / 2,
                      this.bladeWidth, this.bladeLength);
      } else {
        ctx.fillStyle = blade.flash > 0 ? '#eaffef' : TOXIC;
        ctx.fillRect(-this.bladeWidth / 2, -this.bladeLength / 2,
                     this.bladeWidth, this.bladeLength);
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }
}

/* =====================================================================
   3. PLAGUE TRAIL DASH  (spacebar ultimate, sprite smoke)
   ===================================================================== */
class ToxicGasPuff {
  // ---- sprite source: a single soft round smoke tile ----
  static sprite = loadSprite('assets/weapons/smoke_puff.png');

  constructor(x, y) {
    this.x = x + rand(-10, 10);
    this.y = y + rand(-8, 8);
    this.size = rand(48, 84);
    this.rot = rand(0, Math.PI * 2);
    this.rotSpeed = rand(-1.2, 1.2);
    this.scale = rand(0.7, 1.15);
    this.scaleGrow = rand(0.05, 0.25);     // puffs swell as they rise
    this.life = 4;                          // seconds
    this.maxLife = this.life;
    this.dps = 55;                          // heavy corrosive ticks
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    this.rot += this.rotSpeed * dt;
    this.scale += this.scaleGrow * dt;
    this.y -= 4 * dt;                        // slow upward drift
  }
  get radius() { return (this.size * this.scale) / 2; }
  draw(ctx) {
    const img = ToxicGasPuff.sprite;
    const t = clamp(this.life / this.maxLife, 0, 1);
    const s = this.size * this.scale;
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);                    // randomly rotated each puff
    if (img.loaded) {
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
    } else {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, s / 2);
      g.addColorStop(0, `rgba(120,255,150,${0.55 * t})`);
      g.addColorStop(0.4, `rgba(0,255,51,${0.30 * t})`);
      g.addColorStop(1, 'rgba(4,40,18,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
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

    let ang = this.player.facing ?? 0;
    let nearest = null, nd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.dying) continue;
      const d = dist(this.player.x, this.player.y, e.x, e.y);
      if (d < nd) { nd = d; nearest = e; }
    }
    if (nearest) ang = Math.atan2(nearest.y - this.player.y, nearest.x - this.player.x);
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

    // dense puff trail at the feet during + after the dash
    if (this.trailTimer > 0) {
      this.trailTimer -= dt;
      this.spawnAcc += dt;
      if (this.spawnAcc >= 0.06) {
        this.spawnAcc = 0;
        const fx = this.player.x, fy = this.player.y + this.player.height * 0.42;
        this.clouds.push(new ToxicGasPuff(fx, fy));
        this.clouds.push(new ToxicGasPuff(fx, fy));   // double up for thickness
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
    ctx.globalCompositeOperation = 'lighter';     // overlapping puffs glow
    for (const c of this.clouds) c.draw(ctx);
    ctx.restore();
  }

  // ---- call this from the enemy's own draw() while it is dissolving ----
  // Squishes the enemy's image sprite on the Y-axis and widens X so it
  // melts into a puddle. `t` is the melt progress 0..1.
  static drawMeltingEnemy(ctx, enemy, t) {
    t = clamp(t, 0, 1);
    const img = enemy.sprite;
    const w = (enemy.spriteW ?? enemy.radius * 2) * (1 + t * 1.4);  // widen X
    const h = (enemy.spriteH ?? enemy.radius * 2) * (1 - t);        // squish Y
    ctx.save();
    ctx.globalAlpha = 1 - t * 0.7;
    // anchor to the feet so it collapses downward into a puddle
    ctx.translate(enemy.x, enemy.y + (enemy.spriteH ?? enemy.radius * 2) / 2);
    if (img && img.loaded) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -w / 2, -h, w, h);
    } else {
      ctx.fillStyle = TOXIC;
      ctx.beginPath();
      ctx.ellipse(0, -h / 2, w / 2, Math.max(2, h / 2), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export { ToxicBullet, ToxicSniper, OrbitalKatanaBarrier, ToxicGasPuff, PlagueTrailDash };
