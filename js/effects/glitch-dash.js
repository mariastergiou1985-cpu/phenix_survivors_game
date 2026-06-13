/**
 * GlitchDash — drop-in cyberpunk dash VFX for HTML5 Canvas games.
 * Framework-agnostic: no dependencies, no DOM assumptions beyond a 2D canvas.
 *
 * It does NOT draw your player sprite (your game already does that). It draws:
 *   - RGB-split ghost silhouettes with digital scanlines
 *   - a screen-tear / pixel-displacement corruption along the dash path
 *   - a square neon-pixel burst at departure (A) and arrival (B)
 * ...all fading to 0 in ~0.2s.
 *
 * ── Wiring (3 touch points) ───────────────────────────────────────────────
 *   import { GlitchDash } from './glitch-dash.js';
 *   const fx = new GlitchDash(canvas, playerSpriteImage, { spriteW: 64, spriteH: 96 });
 *
 *   // 1. when the dash input fires (player already at A, about to jump to B):
 *   fx.trigger(player.x, targetX, player.y, player.facing);
 *
 *   // 2. once per frame in your update step:
 *   fx.update(performance.now());
 *
 *   // 3. in your render step:
 *   drawBackground(ctx);
 *   fx.renderBehind(ctx);   // tear + ghosts sit behind the player
 *   drawPlayer(ctx);
 *   fx.renderFront(ctx);    // particles pop in front
 *
 * Notes:
 *   - x is the player's CENTER x; y is the player's FOOT/bottom y (match how you draw).
 *   - facing is +1 (right) or -1 (left); only used if you read fx for slide easing.
 *   - The module snapshots the canvas at trigger time, so call trigger() before you
 *     clear the canvas for the new frame (i.e. during input/update, not mid-render).
 */

export const DEFAULT_CONFIG = {
  ghosts:    { count: 4, lifeMs: 200, baseAlpha: 0.5, aberration: 6, scanGap: 3 },
  tear:      { lifeMs: 200, sliceH: 6, maxShift: 24 },
  particles: { perBurst: 28, lifeMs: 200, minSize: 2, maxSize: 6, speed: 3.4 },
  color:     { hue: 196, sat: 100, light: 65 }, // electric blue. Bump hue to recolor everything.
};

export class GlitchDash {
  /**
   * @param {HTMLCanvasElement} canvas  your game canvas (used to snapshot for the tear)
   * @param {HTMLImageElement}  sprite  the player sprite image (used for ghost silhouettes)
   * @param {object} opts  { spriteW, spriteH, ...CONFIG overrides }
   */
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;
    this.cfg = mergeConfig(DEFAULT_CONFIG, opts);

    this.SW = opts.spriteW || sprite.naturalWidth || sprite.width;
    this.SH = opts.spriteH || sprite.naturalHeight || sprite.height;

    this.ghosts = [];
    this.particles = [];
    this.tear = null;

    // offscreen scratch for compositing each ghost
    this._gbuf = document.createElement('canvas');
    this._gctx = this._gbuf.getContext('2d');
    this._PAD = 28;

    // precompute the three channel-tinted silhouettes once (cheap RGB-split source)
    this._buildSilhouettes();
  }

  /** Rebuild tinted silhouettes — call if you swap the sprite or its display size. */
  setSprite(sprite, spriteW, spriteH) {
    this.sprite = sprite;
    if (spriteW) this.SW = spriteW;
    if (spriteH) this.SH = spriteH;
    this._buildSilhouettes();
  }

  _buildSilhouettes() {
    const tint = (color) => {
      const c = document.createElement('canvas');
      c.width = this.SW; c.height = this.SH;
      const g = c.getContext('2d');
      g.drawImage(this.sprite, 0, 0, this.SW, this.SH);
      g.globalCompositeOperation = 'source-atop'; // recolor only opaque sprite pixels
      g.fillStyle = color; g.fillRect(0, 0, this.SW, this.SH);
      return c;
    };
    this._silR = tint('rgb(255,0,60)');
    this._silG = tint('rgb(0,255,120)');
    this._silB = tint('rgb(60,90,255)');
  }

  _neon(a = 1, l = this.cfg.color.light) {
    return `hsla(${this.cfg.color.hue},${this.cfg.color.sat}%,${l}%,${a})`;
  }

  /** Fire the effect. fromX→toX is the dash; y is the player's foot line. */
  trigger(fromX, toX, y, facing = 1) {
    const now = performance.now();
    const A = fromX, B = toX;

    // 1. silhouette ghosts spaced along the path (faint near A, brighter near B)
    this.ghosts.length = 0;
    const gc = this.cfg.ghosts;
    for (let i = 0; i < gc.count; i++) {
      const t = (i + 1) / (gc.count + 1);
      this.ghosts.push({
        x: A + (B - A) * t, y,
        born: now + i * 8, life: gc.lifeMs,
        alpha: gc.baseAlpha * (0.45 + 0.55 * t),
      });
    }

    // 2. screen-tear: snapshot the path band from the (still-drawn) canvas
    const left = Math.min(A, B) - this.SW, right = Math.max(A, B) + this.SW;
    const rx = Math.max(0, left), rw = Math.min(this.canvas.width, right) - rx;
    const ry = Math.max(0, y - this.SH - 20), rh = this.SH + 34;
    if (rw > 0 && rh > 0) {
      const buf = document.createElement('canvas');
      buf.width = rw; buf.height = rh;
      buf.getContext('2d').drawImage(this.canvas, rx, ry, rw, rh, 0, 0, rw, rh);
      this.tear = { x: rx, y: ry, w: rw, h: rh, buf, born: now, life: this.cfg.tear.lifeMs };
    }

    // 3. neon burst at departure and arrival
    this._burst(A, y - this.SH * 0.5, now);
    this._burst(B, y - this.SH * 0.5, now);
  }

  _burst(x, y, now) {
    const P = this.cfg.particles;
    for (let i = 0; i < P.perBurst; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = P.speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 0.6,
        size: P.minSize + Math.random() * (P.maxSize - P.minSize),
        born: now, life: P.lifeMs,
      });
    }
  }

  update(now) {
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.96; }
    this.ghosts = this.ghosts.filter(g => now - g.born < g.life);
    this.particles = this.particles.filter(p => now - p.born < p.life);
    if (this.tear && now - this.tear.born >= this.tear.life) this.tear = null;
    this._now = now;
  }

  /** Tear + ghosts. Call AFTER the background, BEFORE drawing the player. */
  renderBehind(ctx) {
    const now = this._now ?? performance.now();
    this._drawTear(ctx, now);
    for (const g of this.ghosts) this._drawGhost(ctx, g, now);
  }

  /** Neon particles. Call AFTER drawing the player. */
  renderFront(ctx) {
    const now = this._now ?? performance.now();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const t = (now - p.born) / p.life; if (t >= 1) continue;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = this._neon(1);
      ctx.shadowColor = this._neon(1); ctx.shadowBlur = 8;
      const s = p.size; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }

  _drawGhost(ctx, gh, now) {
    const age = now - gh.born; if (age < 0) return;
    const t = age / gh.life; if (t >= 1) return;
    const a = gh.alpha * (1 - t), off = this.cfg.ghosts.aberration;
    const PAD = this._PAD, buf = this._gbuf, g = this._gctx;
    buf.width = this.SW + PAD * 2; buf.height = this.SH + PAD * 2;
    g.clearRect(0, 0, buf.width, buf.height);
    g.globalCompositeOperation = 'lighter';           // RGB split
    g.drawImage(this._silR, PAD - off, PAD);
    g.drawImage(this._silG, PAD,       PAD);
    g.drawImage(this._silB, PAD + off, PAD);
    g.globalCompositeOperation = 'destination-out';   // carve scanlines
    g.fillStyle = '#000';
    for (let y = 0; y < buf.height; y += this.cfg.ghosts.scanGap) g.fillRect(0, y, buf.width, 1);
    g.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.drawImage(buf, gh.x - this.SW / 2 - PAD, gh.y - this.SH - PAD);
    ctx.globalAlpha = 1;
  }

  _drawTear(ctx, now) {
    if (!this.tear) return;
    const T = this.tear, t = (now - T.born) / T.life; if (t >= 1) return;
    ctx.globalAlpha = 1 - t;
    const amp = this.cfg.tear.maxShift * (1 - t);
    for (let y = 0; y < T.h; y += this.cfg.tear.sliceH) {
      const shift = (Math.sin(y * 0.7 + now * 0.05) + (Math.random() - 0.5)) * amp;
      const sh = Math.min(this.cfg.tear.sliceH, T.h - y);
      ctx.drawImage(T.buf, 0, y, T.w, sh, T.x + shift, T.y + y, T.w, sh);
    }
    ctx.globalAlpha = 1;
  }
}

function mergeConfig(base, opts) {
  const out = JSON.parse(JSON.stringify(base));
  for (const k of Object.keys(base)) if (opts[k]) Object.assign(out[k], opts[k]);
  return out;
}
