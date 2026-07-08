/**
 * VFXSpritePlayer.js — PHENIX: NULL EDEN
 * Lightweight sprite sheet animation player for weapon VFX overlays.
 * One instance per active VFX playback. Disposable — create on fire, discard when done.
 */

export class VFXSpritePlayer {
  /**
   * @param {HTMLImageElement} spriteSheet — preloaded sprite sheet image
   * @param {number} frameW       — width of one frame in pixels
   * @param {number} frameH       — height of one frame in pixels
   * @param {number} totalFrames  — total number of frames in the sheet
   * @param {number} cols         — number of columns in the grid
   * @param {number} fps          — playback speed (frames per second)
   */
  constructor(spriteSheet, frameW, frameH, totalFrames, cols, fps) {
    this.spriteSheet = spriteSheet;
    this.frameW      = frameW;
    this.frameH      = frameH;
    this.totalFrames = totalFrames;
    this.cols        = cols;
    this.fps         = fps;

    this.currentFrame = 0;
    this.frameTimer   = 0;
    this._playing     = false;
    this._done        = false;

    // World-space position & rendering properties (set by caller)
    this.x     = 0;
    this.y     = 0;
    this.angle = 0;        // rotation in radians (aim direction)
    this.scale = 1.0;      // render scale multiplier
    this.alpha = 1.0;      // opacity (can fade toward end)

    // Nexus wielder-variant single-image mode: when set to a preloaded Image,
    // draw() renders this illustration (centered, capped, fading) instead of
    // the sheet frame, and update() adds a slow spin. Timing/alpha unchanged.
    this.overrideImg = null;

    // Single-image animation (override mode): per-art motion style + timing.
    this.animStyle = 'spin';   // spin | pulse | expand | drift | stab | slash | flicker
    this.aimAngle  = 0;        // firing direction (for stab / slash / drift)
    this._age      = 0;        // seconds since play() (override-mode animation clock)
    this._animLife = 0.6;      // override-mode animation duration (s)
  }

  /** Start (or restart) animation from frame 0. */
  play() {
    this.currentFrame = 0;
    this.frameTimer   = 0;
    this._playing     = true;
    this._done        = false;
    this.alpha        = 1.0;
    this._age         = 0;
  }

  /**
   * Advance the animation by dt seconds.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    if (!this._playing) return;

    // Single-image override: TIME-BASED per-art animation (transform only — the
    // illustration pixels are never altered, just moved/scaled/faded so it feels alive).
    if (this.overrideImg) {
      this._age = (this._age || 0) + dt;
      const spinRate = this.animStyle === 'flicker' ? 7.0
                     : this.animStyle === 'spin'    ? 3.2
                     : 1.4;
      this.angle += dt * spinRate;
      const life = this._animLife || 0.6;
      const p = Math.min(1, this._age / life);
      this.alpha = p < 0.18 ? (p / 0.18) : Math.max(0, 1 - (p - 0.18) / 0.82);
      if (this._age >= life) { this._playing = false; this._done = true; }
      return;
    }

    this.frameTimer += dt;
    const frameDuration = 1.0 / this.fps;

    while (this.frameTimer >= frameDuration) {
      this.frameTimer -= frameDuration;
      this.currentFrame++;

      if (this.currentFrame >= this.totalFrames) {
        this.currentFrame = this.totalFrames - 1;
        this._playing     = false;
        this._done        = true;
        break;
      }
    }

    // Fade alpha over the last 25% of frames for smooth dissolve
    const progress = this.currentFrame / (this.totalFrames - 1 || 1);
    if (progress > 0.75) {
      this.alpha = 1.0 - ((progress - 0.75) / 0.25) * 0.6;
    }
  }

  /**
   * Draw the current frame onto a canvas context.
   * Caller must have already applied camera transform (world-space ctx).
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (!this._playing && !this._done) return;

    // Single-image mode — draw the override illustration with a PER-ART animation.
    // The whole image is fit to a base size then animated by transform only (scale /
    // rotate / drift / fade); the illustration itself is never modified or replaced.
    if (this.overrideImg) {
      const oi = this.overrideImg;
      if (!oi.complete || oi.naturalWidth === 0) return;
      const p   = Math.min(1, (this._age || 0) / (this._animLife || 0.6));   // 0..1 progress
      const aim = this.aimAngle || 0;
      let sc = 1, rot = this.angle, ox = 0, oy = 0, am = 1;
      switch (this.animStyle) {
        case 'pulse':   sc = 0.78 + 0.42 * Math.sin(p * Math.PI); break;                    // grow → shrink throb
        case 'expand':  sc = 0.5 + 1.15 * p; am = 1 - p * 0.35; rot = this.angle * 0.35; break; // bloom outward
        case 'drift':   sc = 0.82 + 0.3 * p; ox = Math.cos(aim) * 36 * p; oy = Math.sin(aim) * 36 * p; break; // cloud drifts
        case 'stab':    rot = aim; sc = 1.3 - 0.6 * p; ox = Math.cos(aim) * 34 * p; oy = Math.sin(aim) * 34 * p; break; // thrust along aim
        case 'slash':   rot = aim + (p - 0.5) * 1.4; sc = 0.9 + 0.18 * Math.sin(p * Math.PI); break;   // arc sweep
        case 'flicker': rot = this.angle; sc = 0.9 + 0.12 * Math.sin((this._age || 0) * 42); am = 0.72 + 0.28 * Math.abs(Math.sin((this._age || 0) * 60)); break; // electric jitter
        case 'spin':
        default:        rot = this.angle; sc = 0.85 + 0.16 * Math.sin(p * Math.PI); break;   // steady swirl
      }
      // Fit whole art to a base display size, then apply the animated scale.
      const BASE   = 300;
      const natMax = Math.max(oi.naturalWidth, oi.naturalHeight) || 1;
      const k      = (BASE / natMax) * sc;
      let odw = oi.naturalWidth * k;
      let odh = oi.naturalHeight * k;
      const _om = Math.max(odw, odh);
      if (_om > 470) { const _ok = 470 / _om; odw *= _ok; odh *= _ok; }   // readability safety cap
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha * am);
      ctx.globalCompositeOperation = 'lighter';   // additive blend for energy VFX
      ctx.translate(this.x + ox, this.y + oy);
      if (rot !== 0) ctx.rotate(rot);
      ctx.drawImage(oi, -odw / 2, -odh / 2, odw, odh);
      ctx.restore();
      return;
    }
    if (!this.spriteSheet || !this.spriteSheet.complete) return;
    if (this.spriteSheet.naturalWidth === 0) return;

    const col = this.currentFrame % this.cols;
    const row = Math.floor(this.currentFrame / this.cols);
    const sx  = col * this.frameW;
    const sy  = row * this.frameH;

    let dw = this.frameW * this.scale;
    let dh = this.frameH * this.scale;
    // Readability hard cap: no weapon VFX may exceed 320px on screen. Large
    // source frames (256px sheets, e.g. Nexus Chakram) at high scale were
    // filling the arena with washed-out additive rings.
    const _max = Math.max(dw, dh);
    if (_max > 320) { const _k = 320 / _max; dw *= _k; dh *= _k; }

    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.globalCompositeOperation = 'lighter';   // additive blend for energy VFX
    ctx.translate(this.x, this.y);
    if (this.angle !== 0) ctx.rotate(this.angle);
    ctx.drawImage(
      this.spriteSheet,
      sx, sy, this.frameW, this.frameH,
      -dw / 2, -dh / 2, dw, dh
    );
    ctx.restore();
  }

  /** @returns {boolean} true while the animation is actively playing */
  isPlaying() { return this._playing; }

  /** @returns {boolean} true after the animation completed all frames */
  isDone() { return this._done; }
}
