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
  }

  /** Start (or restart) animation from frame 0. */
  play() {
    this.currentFrame = 0;
    this.frameTimer   = 0;
    this._playing     = true;
    this._done        = false;
    this.alpha        = 1.0;
  }

  /**
   * Advance the animation by dt seconds.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    if (!this._playing) return;

    // Single-image override: slow spin replaces frame-by-frame motion
    if (this.overrideImg) this.angle += dt * 2;

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

    // Nexus wielder-variant single-image mode — draw the override illustration
    // (respecting the 320px cap and alpha fade) instead of the sheet frame.
    if (this.overrideImg) {
      const oi = this.overrideImg;
      if (!oi.complete || oi.naturalWidth === 0) return;
      let odw = oi.naturalWidth * this.scale;
      let odh = oi.naturalHeight * this.scale;
      const _om = Math.max(odw, odh);
      if (_om > 320) { const _ok = 320 / _om; odw *= _ok; odh *= _ok; }
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.globalCompositeOperation = 'lighter';   // additive blend for energy VFX
      ctx.translate(this.x, this.y);
      if (this.angle !== 0) ctx.rotate(this.angle);
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
