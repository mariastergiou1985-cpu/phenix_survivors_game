/**
 * EMPShockwave — drop-in electric AoE shockwave VFX for HTML5 Canvas games.
 * Framework-agnostic, no dependencies, no per-pixel reads (getImageData) — built
 * to stay at 60fps. Owns: the expanding plasma ring, a cheap background-bending
 * distortion at the wavefront, branching electric tendrils, and the blue "stunned"
 * spark emitters on hit enemies. Your game keeps owning the player + enemy drawing.
 *
 * ── Wiring (4 touch points) ───────────────────────────────────────────────
 *   import { EMPShockwave } from './emp-shockwave.js';
 *   const emp = new EMPShockwave(canvas, { ring: { maxRadius: 260 } });
 *
 *   // 1. when the skill activates (after the foot-slam frame):
 *   emp.trigger(player.x, player.feetY);
 *
 *   // 2. once per frame, passing your enemy list so it can detect hits:
 *   emp.update(performance.now(), enemies, {
 *     getX: e => e.x,
 *     getY: e => e.y,
 *     onHit: e => {                 // YOU apply gameplay + the 0.1s white flash
 *       e.stunnedUntil = performance.now() + 1200;
 *       e.flashUntil   = performance.now() + 100;
 *     },
 *   });
 *
 *   // 3. draw your scene (enemies use flashUntil to render solid white):
 *   drawBackground(ctx); drawEnemies(ctx); drawPlayer(ctx);
 *
 *   // 4. draw the effect on top (distortion samples whatever is on the canvas):
 *   emp.render(ctx);
 *
 * Helper for the white flash on an enemy sprite:
 *   if (now < e.flashUntil) EMPShockwave.flashWhite(ctx, e.sprite, x, y, w, h);
 *   else                    ctx.drawImage(e.sprite, x, y, w, h);
 */

export const DEFAULT_CONFIG = {
  ring:       { maxRadius: 180, expandMs: 480, width: 14, ease: 0.5 }, // ease<1 = fast start, slow finish
  distortion: { strength: 0.04 },           // background-bend amount at the wavefront. 0 = off (and skipped)
  tendrils:   { count: 4, jitter: 46, segments: 4 }, // lightning arcs center→edge
  enemy:      { flashMs: 100, stunMs: 1200, sparkRate: 2, sparkLifeMs: 420,
                sparkSpeed: 1.8, sparkMin: 2, sparkMax: 5 },
  color:      { hue: 200, sat: 100, light: 62 }, // electric blue. Raise hue for cyan/violet.
};

export class EMPShockwave {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.cfg = mergeConfig(DEFAULT_CONFIG, opts);
    this.active = false;        // is the ring currently expanding?
    this.cx = 0; this.cy = 0;
    this.born = 0; this.radius = 0;
    this._hit = new Set();      // enemies already hit this cast (by reference)
    this._emitters = [];        // { ref, getX, getY, until }  -> blue spark sources
    this._sparks = [];          // { x, y, vx, vy, size, born, life }
    this._tmp = document.createElement('canvas'); // scratch for flashWhite
  }

  /** Fire the shockwave at the player's feet (cx = center x, cy = foot y). */
  trigger(cx, cy) {
    this.active = true;
    this.cx = cx; this.cy = cy;
    this.born = performance.now();
    this.radius = 0;
    this._hit.clear();
  }

  _neon(a = 1, l = this.cfg.color.light) {
    return `hsla(${this.cfg.color.hue},${this.cfg.color.sat}%,${l}%,${a})`;
  }

  /**
   * @param {number} now
   * @param {Array}  enemies  optional — your live enemy list
   * @param {object} opts     { getX, getY, onHit }  — how to read/notify enemies
   */
  update(now, enemies, opts) {
    this._now = now;

    // grow the ring
    if (this.active) {
      const t = (now - this.born) / this.cfg.ring.expandMs;
      if (t >= 1) { this.active = false; this.radius = this.cfg.ring.maxRadius; }
      else {
        const e = Math.pow(t, this.cfg.ring.ease); // ease-out by default
        this.radius = e * this.cfg.ring.maxRadius;
      }

      // hit detection — only while the ring is sweeping outward
      if (enemies && opts) {
        const r2 = this.radius * this.radius;
        for (const en of enemies) {
          if (this._hit.has(en)) continue;
          const dx = opts.getX(en) - this.cx, dy = opts.getY(en) - this.cy;
          if (dx * dx + dy * dy <= r2) {
            this._hit.add(en);
            if (opts.onHit) opts.onHit(en);              // game applies stun + white flash
            this._emitters.push({                        // attach a spark source to this enemy
              ref: en, getX: opts.getX, getY: opts.getY,
              until: now + this.cfg.enemy.stunMs,
            });
          }
        }
      }
    }

    // spark emitters (run past the ring, for the whole stun duration)
    const E = this.cfg.enemy;
    for (const em of this._emitters) {
      if (now >= em.until) continue;
      const ex = em.getX(em.ref), ey = em.getY(em.ref);
      for (let i = 0; i < E.sparkRate; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = E.sparkSpeed * (0.3 + Math.random());
        this._sparks.push({
          x: ex, y: ey, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 0.4,
          size: E.sparkMin + Math.random() * (E.sparkMax - E.sparkMin),
          born: now, life: E.sparkLifeMs,
        });
      }
    }
    this._emitters = this._emitters.filter(em => now < em.until);
    if (this._emitters.length > 48) this._emitters.length = 48;     // hard cap

    // advance + cull sparks
    for (const s of this._sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.05; s.vx *= 0.95; }
    this._sparks = this._sparks.filter(s => now - s.born < s.life);
    if (this._sparks.length > 240) this._sparks.length = 240;       // hard cap
  }

  /** True if a world point is currently inside the swept radius (for manual gameplay checks). */
  isInside(x, y) {
    if (!this.active && this.radius === 0) return false;
    const dx = x - this.cx, dy = y - this.cy;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  /** Draw everything. Call AFTER your scene is drawn (distortion samples the canvas). */
  render(ctx) {
    const now = this._now ?? performance.now();
    if (this.active || (now - this.born) < this.cfg.ring.expandMs) {
      const t = Math.min(1, (now - this.born) / this.cfg.ring.expandMs);
      const fade = 1 - t; // ring brightness/strength fades as it reaches the rim
      this._drawDistortion(ctx, fade);
      this._drawRing(ctx, fade);
      this._drawTendrils(ctx, fade);
    }
    this._drawSparks(ctx, now);
  }

  _drawDistortion(ctx, fade) {
    const s = this.cfg.distortion.strength;
    if (s <= 0 || this.radius < 4) return;
    const w = this.cfg.ring.width * 2.2;
    const rOuter = this.radius + w, rInner = Math.max(0, this.radius - w);
    // SAFE refraction fake (no canvas self-copy — that whole family of scaled
    // drawImage(ctx.canvas) feedbacks caused the infinite-mirror corruption):
    // a chromatic double-fringe rides the wavefront — cyan leading edge, white
    // core, faint dark trailing band. Reads as lensing without touching pixels.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = '#8ff4ff'; ctx.lineWidth = w * 0.8;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, rOuter - w * 0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.22 * fade;
    ctx.strokeStyle = '#02060c'; ctx.lineWidth = w * 0.5;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, Math.max(1, rInner + w * 0.25), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  _drawRing(ctx, fade) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // soft outer glow
    ctx.lineWidth = this.cfg.ring.width;
    ctx.strokeStyle = this._neon(0.35 * fade + 0.15, this.cfg.color.light);
    ctx.shadowColor = this._neon(1); ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2); ctx.stroke();
    // bright thin core
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.strokeStyle = this._neon(0.9 * fade + 0.1, 92);
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  _drawTendrils(ctx, fade) {
    const T = this.cfg.tendrils;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = this._neon(1); ctx.shadowBlur = 10;
    for (let b = 0; b < T.count; b++) {
      // even spread + jitter so they branch all around the ring
      const ang = (b / T.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const pts = this._bolt(ang, this.radius, T.jitter, T.segments);
      // glow pass
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = this._neon((0.5 + Math.random() * 0.4) * fade, 70);
      this._stroke(ctx, pts);
      // hot core
      ctx.lineWidth = 1;
      ctx.strokeStyle = this._neon(0.9 * fade, 95);
      this._stroke(ctx, pts);
    }
    ctx.restore();
  }

  _bolt(angle, len, jitter, subdiv) {
    // fractal midpoint displacement: center -> ring edge along `angle`
    const ex = this.cx + Math.cos(angle) * len, ey = this.cy + Math.sin(angle) * len;
    let pts = [[this.cx, this.cy], [ex, ey]];
    for (let s = 0; s < subdiv; s++) {
      const np = [];
      for (let j = 0; j < pts.length - 1; j++) {
        const [x1, y1] = pts[j], [x2, y2] = pts[j + 1];
        const dx = x2 - x1, dy = y2 - y1, seg = Math.hypot(dx, dy) || 1;
        const off = (Math.random() - 0.5) * jitter * (seg / len);
        np.push([x1, y1], [(x1 + x2) / 2 - dy / seg * off, (y1 + y2) / 2 + dx / seg * off]);
      }
      np.push(pts[pts.length - 1]);
      pts = np;
    }
    return pts;
  }

  _stroke(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  _drawSparks(ctx, now) {
    if (!this._sparks.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // shadowBlur removed (2026-07-12 perf pass): with up to 240 sparks live it was
    // one of the heaviest per-frame costs. Halo faked with a soft under-rect.
    for (const s of this._sparks) {
      const t = (now - s.born) / s.life; if (t >= 1) continue;
      const halo = s.size * 2.0;
      ctx.globalAlpha = (1 - t) * 0.30;
      ctx.fillStyle = this._neon(1, 50);
      ctx.fillRect(s.x - halo / 2, s.y - halo / 2, halo, halo);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = this._neon(1, 70);
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size); // square neon static
    }
    ctx.restore();
  }

  /** Convenience: draw a sprite tinted SOLID WHITE (the 0.1s stun flash). */
  static flashWhite(ctx, img, x, y, w, h) {
    return EMPShockwave._flash(ctx, img, x, y, w, h, '#ffffff');
  }
  static _flash(ctx, img, x, y, w, h, color) {
    const t = EMPShockwave._tmpStatic || (EMPShockwave._tmpStatic = document.createElement('canvas'));
    t.width = w; t.height = h;
    const g = t.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    ctx.drawImage(t, x, y);
  }
}

function mergeConfig(base, opts) {
  const out = JSON.parse(JSON.stringify(base));
  for (const k of Object.keys(base)) if (opts[k]) Object.assign(out[k], opts[k]);
  return out;
}
