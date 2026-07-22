/* =====================================================================
   TOXIC SNIPER KIT — SPRITE EDITION (v3)
   Same public API + integration contract. Logic for the auto sniper is
   unchanged. This revision EVOLVES the Orbital Katana + Plague gas only:
     • Orbital Katana: now THREE large, clearly-visible vector katanas
       that EXTEND outward (range pulse), DRIP toxin that DEALS DAMAGE,
       and hit hard (full damage to every enemy in range, bosses included).
     • Plague gas: clouds linger much longer AND leave a toxic ground
       SLICK ("toxic rain") that keeps damaging enemies that stand in it.
   Names/classes/exports unchanged → safe drop-in.

   Integration contract (unchanged):
     • player  -> { x, y, height, facing }
     • enemies -> { x, y, radius, hp, sprite, spriteW, spriteH,
                    takeDamage(), applyKnockback(), beginMelt() }
     • particles -> { add(p), burst(arr) }
   ===================================================================== */

const TOXIC      = '#00ff33';
const TOXIC_DARK = '#0a9c44';
const TOXIC_DEEP = '#063b1a';
const TOXIC_LITE = '#7cff8a';
const STEEL      = '#cfe6d2';
const STEEL_DK   = '#5f7a66';

// ── Euclid Toxin Nerf — tunable constants ────────────────────────────────────
// Raise intervals to spawn puffs/slicks less often; lower DPS for lighter DoT.
const PLAGUE_PUFF_INTERVAL  = 0.10;  // s between gas-puff spawns (was 0.06)
const PLAGUE_SLICK_INTERVAL = 0.30;  // s between ground-slick spawns (was 0.18)
const PLAGUE_PUFF_DPS       = 47;    // gas puff DPS (was 55, ~-15%)
const PLAGUE_SLICK_DPS      = 19;    // ground slick DPS (was 22, ~-14%)
const PLAYER_CONTACT_RADIUS = 18;
// ─────────────────────────────────────────────────────────────────────────────
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
   1. TOXIC BULLET  +  TOXIC SNIPER  (automatic — unchanged)
   ===================================================================== */
class ToxicBullet {
  static sprite = { loaded: false };   // Maria 2026-07-16: PNG retired — procedural needle only (ultimate-style)

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
      // ── THEOREM NEEDLE (Maria 2026-07-16, unique-signature pass) ─────────────
      // Euclid weaponizes GEOMETRY itself: a toxin vector-dart wrapped in a rotating
      // double proof-helix, with an axiom-triangle tip. Ultimate recipe: lighter
      // layers, identity halo -> body -> white-hot core. No sprites, no shadowBlur.
      const w = this.w * scale, h = this.h * scale;
      const tt = performance.now() * 0.02 + this.x * 0.05;        // helix phase
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.30;                             // identity halo
      ctx.fillStyle = TOXIC;
      ctx.fillRect(-w * 0.62, -h, w * 1.24, h * 2);
      // vector shaft (the "line segment" — his primitive)
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = TOXIC; ctx.lineWidth = Math.max(1.5, h * 0.22);
      ctx.beginPath(); ctx.moveTo(-w * 0.5, 0); ctx.lineTo(w * 0.34, 0); ctx.stroke();
      // double proof-helix coiling around the shaft (two counter-phased sine strands)
      ctx.lineWidth = 1.2;
      for (const ph of [0, Math.PI]) {
        ctx.strokeStyle = ph === 0 ? TOXIC_LITE : '#baffd0';
        ctx.globalAlpha = alpha * 0.75;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const px2 = -w * 0.5 + (w * 0.84) * (k / 6);
          const py2 = Math.sin(tt + ph + k * 1.05) * h * 0.42;
          k === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.stroke();
      }
      // axiom tip: solid toxin triangle with a white QED core
      ctx.globalAlpha = alpha;
      ctx.fillStyle = TOXIC;
      ctx.beginPath();
      ctx.moveTo(w * 0.30, -h * 0.40); ctx.lineTo(w * 0.66, 0); ctx.lineTo(w * 0.30, h * 0.40);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#eaffef';
      ctx.beginPath();
      ctx.moveTo(w * 0.38, -h * 0.16); ctx.lineTo(w * 0.58, 0); ctx.lineTo(w * 0.38, h * 0.16);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx) {
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const a = (i + 1) / this.trail.length;
      this._blit(ctx, p.x, p.y, a * 0.4, 0.5 + a * 0.4);
    }
    this._blit(ctx, this.x, this.y, 1, 1);   // (shadowBlur removed — perf rule 2026-07-12)
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
    this.targetRange = 340;
    this.bulletDamage = 14;
    this.poison = { dps: 6, duration: 3, tickEvery: 0.2 };
  }

  findTarget() {
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.dying) continue;
      if (e.x < 0 || e.x > this.bounds.w || e.y < 0 || e.y > this.bounds.h) continue;
      const d = dist(this.player.x, this.player.y, e.x, e.y);
      if (d > this.targetRange) continue;
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
   2. ORBITAL KATANA BARRIER — 3 big katanas, extend/range, damaging drips
   ===================================================================== */
class OrbitalKatanaBarrier {
  static sprite = { loaded: false };   // Maria 2026-07-16: PNG retired — vector blade only (ultimate-style)

  constructor(player, enemies, particles) {
    this.player = player;
    this.enemies = enemies;
    this.particles = particles;

    this.angle = 0;
    this.spinSpeed = 2.4;                        // rad/s
    this.baseRadius = 92;                        // wider base orbit = more range
    this.extendPhase = 0;                        // drives the in/out "extend" pulse
    this.extendAmt = 48;                         // how far the blades reach out at peak
    this.bladeLength = Math.max(70, player.height * 1.25);  // BIG → clearly visible
    this.bladeWidth = this.bladeLength * 0.22;
    this.damage = 26;                            // per contact; fast re-hit = strong sustained
    this.knockback = 300;
    this.dripDamage = 6;                         // dripping toxin DOES damage now

    // THREE blades, evenly spaced
    this.blades = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map(offset => ({
      offset, recoil: 0, flash: 0, hits: new Map(), a: offset, x: 0, y: 0,
    }));

    this.drips = [];
    this.dripAcc = 0;
  }

  get orbitRadius() {
    // smooth 0..1 pulse → blades breathe outward, sweeping a bigger ring
    const pulse = 0.5 + 0.5 * Math.sin(this.extendPhase * 1.4);
    return this.baseRadius + pulse * this.extendAmt;
  }

  update(dt) {
    this.angle = (this.angle + this.spinSpeed * dt) % (Math.PI * 2);
    this.extendPhase += dt;
    const cx = this.player.x, cy = this.player.y;
    const R = this.orbitRadius;

    for (const blade of this.blades) {
      blade.recoil += (0 - blade.recoil) * Math.min(1, dt * 12);
      if (blade.flash > 0) blade.flash -= dt;

      const a = this.angle + blade.offset;
      const r = R + blade.recoil;
      blade.a = a;
      blade.x = cx + Math.cos(a) * r;
      blade.y = cy + Math.sin(a) * r;

      for (const e of this.enemies) {
        if (e.dead || e.dying) continue;
        // The large blades remain visually prominent, but their free baseline barrier is
        // contact control rather than a permanent 180px exclusion ring.
        if (dist(cx, cy, e.x, e.y) >= PLAYER_CONTACT_RADIUS + e.radius) continue;
        const last = blade.hits.get(e) ?? -1;
        if (last > 0) { blade.hits.set(e, last - dt); continue; }
        const reach = e.radius + this.bladeWidth + this.bladeLength * 0.5;
        if (dist(blade.x, blade.y, e.x, e.y) <= reach) {
          e.takeDamage(this.damage);                 // full damage to everyone in reach (bosses incl.)
          const ka = Math.atan2(e.y - cy, e.x - cx);
          e.applyKnockback(Math.cos(ka) * this.knockback, Math.sin(ka) * this.knockback);
          if (e.hp <= 0 && !e.dying && e.beginMelt) e.beginMelt();
          blade.flash = 0.12;
          blade.recoil = 26;
          blade.hits.set(e, 0.22);                   // re-hit cadence
        }
      }
    }

    // ── shed toxin drips from the blades — these DEAL DAMAGE ──
    this.dripAcc += dt;
    if (this.dripAcc >= 0.045) {
      this.dripAcc = 0;
      for (const blade of this.blades) {
        if (Math.random() > 0.75) continue;          // uneven, organic drip
        const r = R + blade.recoil + this.bladeLength * (0.2 + Math.random() * 0.7);
        const px = -Math.sin(blade.a), py = Math.cos(blade.a);
        const j = rand(-this.bladeWidth * 0.4, this.bladeWidth * 0.4);
        this.drips.push({
          x: cx + Math.cos(blade.a) * r + px * j,
          y: cy + Math.sin(blade.a) * r + py * j,
          vx: rand(-14, 14), vy: rand(10, 46),
          size: rand(2.5, 4.5), life: rand(0.6, 1.0), maxLife: 1.0, dead: false, hit: false,
        });
      }
    }
    for (const d of this.drips) {
      d.life -= dt; if (d.life <= 0) { d.dead = true; continue; }
      d.vy += 620 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      if (!d.hit) {
        for (const e of this.enemies) {
          if (e.dead || e.dying) continue;
          if (dist(d.x, d.y, e.x, e.y) <= d.size + e.radius) {
            e.takeDamage(this.dripDamage);            // toxin drip damage
            if (e.hp <= 0 && !e.dying && e.beginMelt) e.beginMelt();
            d.hit = true; d.dead = true; break;
          }
        }
      }
    }
    this.drips = this.drips.filter(d => !d.dead);
  }

  _drawVectorBlade(ctx, blade) {
    // ── AXIOM SHARD (Maria 2026-07-16, unique-signature pass) ────────────────────
    // Not a katana: a floating THEOREM made solid. An open geometric compass-blade —
    // two rulers meeting at an acute vertex (his angle), a taut hypotenuse edge of
    // pure toxin, orbiting proof-dashes along it, and a burning vertex core. Pure
    // vectors, lighter layering, zero shadowBlur (perf rule 2026-07-12).
    const bw = this.bladeWidth, bl = this.bladeLength;
    const hot = blade.flash > 0;
    const t = performance.now() * 0.004 + blade.a;
    ctx.globalCompositeOperation = 'lighter';
    // identity halo along the long axis
    ctx.globalAlpha = hot ? 0.5 : 0.25;
    ctx.strokeStyle = TOXIC; ctx.lineWidth = bw * 0.9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -bl * 0.46); ctx.lineTo(0, bl * 0.30); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // the two ruler-arms (dark steel with etched gradations)
    ctx.globalAlpha = 1;
    ctx.strokeStyle = hot ? '#eaffef' : STEEL; ctx.lineWidth = Math.max(2, bw * 0.16); ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-bw * 0.34, bl * 0.30); ctx.lineTo(0, -bl * 0.50);   // left arm to the vertex
    ctx.lineTo(bw * 0.34, bl * 0.30);                               // right arm back down
    ctx.stroke();
    ctx.strokeStyle = STEEL_DK; ctx.lineWidth = 1;
    for (let k = 1; k <= 4; k++) {                                  // ruler gradations (his measurements)
      const yy = -bl * 0.50 + (bl * 0.8) * (k / 5);
      const xx = bw * 0.34 * (k / 5);
      ctx.beginPath(); ctx.moveTo(-xx - 2, yy); ctx.lineTo(-xx + 2, yy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xx - 2, yy);  ctx.lineTo(xx + 2, yy);  ctx.stroke();
    }
    // the HYPOTENUSE — a taut cutting edge of pure toxin closing the triangle
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = hot ? 1 : 0.85;
    ctx.strokeStyle = TOXIC; ctx.lineWidth = Math.max(2.5, bw * 0.20);
    ctx.beginPath(); ctx.moveTo(-bw * 0.34, bl * 0.30); ctx.lineTo(bw * 0.34, bl * 0.30); ctx.stroke();
    ctx.strokeStyle = '#eaffef'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-bw * 0.34, bl * 0.295); ctx.lineTo(bw * 0.34, bl * 0.295); ctx.stroke();
    // proof-dashes orbiting the hypotenuse (Q.E.D. ticks marching along the edge)
    ctx.fillStyle = TOXIC_LITE;
    for (let k = 0; k < 3; k++) {
      const u = ((t * 0.9 + k / 3) % 1);
      ctx.globalAlpha = 0.9 * Math.sin(u * Math.PI);
      ctx.fillRect(-bw * 0.34 + u * bw * 0.68 - 1.5, bl * 0.24, 3, 5);
    }
    // burning vertex core (the acute angle itself is the weapon)
    ctx.globalAlpha = hot ? 1 : 0.85;
    ctx.fillStyle = TOXIC;
    ctx.beginPath(); ctx.arc(0, -bl * 0.50, Math.max(3, bw * 0.20), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -bl * 0.50, Math.max(1.5, bw * 0.10), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  draw(ctx) {
    const cx = this.player.x, cy = this.player.y;
    const img = OrbitalKatanaBarrier.sprite;
    const R = this.orbitRadius;

    for (const blade of this.blades) {
      const r = R + blade.recoil;
      // trailing sweep (visibility of the spin)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.20;
      ctx.strokeStyle = blade.flash > 0 ? '#eaffef' : TOXIC;
      ctx.lineWidth = this.bladeWidth + 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r + this.bladeLength * 0.5, blade.a - 0.55, blade.a);
      ctx.stroke();
      ctx.restore();

      // the katana (sprite if present, else big clear vector blade)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(blade.a + Math.PI / 2);
      ctx.translate(0, -(r + this.bladeLength * 0.5));
      ctx.imageSmoothingEnabled = false;
      this._drawVectorBlade(ctx, blade);   // always the vector blade (PNG retired; shadowBlur removed)
      ctx.restore();
    }
    ctx.shadowBlur = 0;

    // damaging toxin drips (solid droplets with a short tail)
    for (const d of this.drips) {
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
   3. PLAGUE TRAIL DASH — longer-lasting gas + lingering toxic SLICK
   ===================================================================== */
class ToxicGasPuff {
  static sprite = { loaded: false };   // Maria 2026-07-16: PNG retired — radial-gradient puff only (ultimate-style)

  constructor(x, y) {
    this.x = x + rand(-10, 10);
    this.y = y + rand(-8, 8);
    this.size = rand(60, 104);
    this.rot = rand(0, Math.PI * 2);
    this.rotSpeed = rand(-1.0, 1.0);
    this.scale = rand(0.7, 1.15);
    this.scaleGrow = rand(0.04, 0.18);
    this.life = 7;                              // ⬅ lingers much longer (was 4)
    this.maxLife = this.life;
    this.dps = PLAGUE_PUFF_DPS;
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    this.rot += this.rotSpeed * dt;
    this.scale += this.scaleGrow * dt;
    this.y -= 2.5 * dt;                          // slow drift (stays low longer)
  }
  get radius() { return (this.size * this.scale) / 2; }
  draw(ctx) {
    const img = ToxicGasPuff.sprite;
    const t = clamp(this.life / this.maxLife, 0, 1);
    const s = this.size * this.scale;
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    if (img.loaded) {
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
    } else {
      // ── PLAGUE GEOMETRY (Maria 2026-07-16, unique-signature pass): toxin mist
      // condensing around a dissolving wireframe polygon — geometry decomposing
      // into plague. Gradient mist body + one rotating hex skeleton + vertex motes.
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
      // dissolving hex skeleton — fades and breaks apart as the puff dies
      const hr = s * 0.30;
      ctx.globalAlpha = t * t * 0.55;                       // skeleton dies faster than the mist
      ctx.strokeStyle = TOXIC_LITE; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const an = this.rot * 1.6 + k * Math.PI / 3;
        const gap = (k + ((this.maxLife - this.life) * 2 | 0)) % 6 === 0;   // missing edges = decomposition
        const px2 = Math.cos(an) * hr, py2 = Math.sin(an) * hr;
        (k === 0 || gap) ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
      }
      ctx.stroke();
      for (let k = 0; k < 3; k++) {                         // glowing vertex motes drifting off
        const an = this.rot * 1.6 + k * 2.09;
        ctx.globalAlpha = t * 0.7;
        ctx.fillStyle = k === 1 ? '#eaffef' : TOXIC;
        ctx.beginPath();
        ctx.arc(Math.cos(an) * hr, Math.sin(an) * hr, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// Lingering ground slick ("toxic rain" puddle) — persists and damages.
class ToxicSlick {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = rand(40, 64);
    this.life = 9;            // lingers a long time
    this.maxLife = this.life;
    this.dps = PLAGUE_SLICK_DPS;
    this.rot = rand(0, Math.PI * 2);
    this.dead = false;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(ctx) {
    const t = clamp(this.life / this.maxLife, 0, 1);
    ctx.save();
    ctx.translate(this.x, this.y);
    // flat toxic puddle (drawn as an ellipse for a ground feel)
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, this.r);
    g.addColorStop(0,   `rgba(120,255,150,${0.30 * t})`);
    g.addColorStop(0.6, `rgba(0,255,51,${0.18 * t})`);
    g.addColorStop(1,   'rgba(4,40,18,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, this.r, this.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    // a few bubbling specks
    ctx.fillStyle = `rgba(214,255,224,${0.4 * t})`;
    for (let i = 0; i < 3; i++) {
      const a = this.rot + i * 2.1, rr = this.r * (0.2 + 0.5 * ((i + t) % 1));
      ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.55, 2, 0, Math.PI * 2); ctx.fill();
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
    this.slicks = [];

    this.cooldown = 8;
    this.cdTimer = 0;
    this.dashDuration = 0.35;
    this.dashTimer = 0;
    this.trailDuration = 4;          // a bit longer coverage
    this.trailTimer = 0;
    this.dashSpeed = 1500;
    this.dashVx = 0; this.dashVy = 0;
    this.spawnAcc = 0;
    this.slickAcc = 0;

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
    // lunge toward the player's movement direction (fed from WASD via player.facing)
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
      const fx = this.player.x, fy = this.player.y + this.player.height * 0.42;
      this.spawnAcc += dt;
      if (this.spawnAcc >= PLAGUE_PUFF_INTERVAL) {
        this.spawnAcc = 0;
        this.clouds.push(new ToxicGasPuff(fx, fy));
        this.clouds.push(new ToxicGasPuff(fx, fy));
      }
      // drop lingering ground slicks along the trail (the "toxic rain")
      this.slickAcc += dt;
      if (this.slickAcc >= PLAGUE_SLICK_INTERVAL) { this.slickAcc = 0; this.slicks.push(new ToxicSlick(fx, fy)); }
    }

    // clouds damage
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

    // slicks damage (lingering DoT on the ground)
    for (const s of this.slicks) {
      s.update(dt);
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist(s.x, s.y, e.x, e.y) <= s.r + e.radius) {
          e.takeDamage(s.dps * dt);
          if (e.hp <= 0 && !e.dying) e.beginMelt();
        }
      }
    }
    this.slicks = this.slicks.filter(s => !s.dead);
  }

  draw(ctx) {
    // slicks first (ground), then puffs above
    for (const s of this.slicks) s.draw(ctx);
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
    ctx.globalAlpha = 1 - t * 0.7;
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
