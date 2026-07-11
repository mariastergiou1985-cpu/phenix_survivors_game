/**
 * AfterimageTribunal — cinematic 4-phase ULTIMATE VFX (Neon Taekwondo Girl).
 * Canvas 2D, no dependencies. API-compatible with DigitalSingularity / OssuaryReconstruction
 * (trigger / update / render / isActive / getShake / .cx .footY pinning).
 *
 *   PHASE 1  FREEZE    – hard white-cyan time-stop flash; the world "holds its breath"
 *   PHASE 2  SPLIT     – 8 afterimages of the fighter fan out into a circle (the tribunal)
 *   PHASE 3  TRIBUNAL  – one by one, each afterimage dashes THROUGH the ring in sequence,
 *                        leaving electric arcs; every dash strikes enemies on its path
 *   PHASE 4  CONVERGE  – all 8 slam back into the real fighter at once — shockwave ring
 *                        and every accumulated screen-crack shatters outward
 *
 * While isActive() the module draws the character itself — skip the normal player draw.
 */

export const TRIBUNAL_CONFIG = {
  phases: { freezeMs: 380, splitMs: 480, tribunalMs: 1600, convergeMs: 420 },
  images: { count: 8, radius: 165 },
  dash:   { everyMs: 190, hitRadius: 64, shake: 12 },
  flash:  { maxRadius: 340, shake: 18 },
  color:  { main: '#14ebd2', hot: '#aefcf2', spark: '#ffffff', glow: 'rgba(20,235,210,' },
};

const PHASE = { IDLE: 0, FREEZE: 1, SPLIT: 2, TRIBUNAL: 3, CONVERGE: 4 };

export class AfterimageTribunal {
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;
    this.cfg = TRIBUNAL_CONFIG;
    this.SW = opts.spriteW || sprite.naturalWidth || 48;
    this.SH = opts.spriteH || sprite.naturalHeight || 64;
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._images = [];      // {ang, x, y, dashT, fromX,fromY,toX,toY, done}
    this._dashIdx = -1;
    this._dashClock = 0;
    this._cracks = [];      // electric screen cracks {pts:[{x,y}], a}
    this._shake = 0;
    this._flashT = 0;
    this._struck = null;    // Set per dash to avoid double hits
  }

  isActive() { return this.phase !== PHASE.IDLE; }

  getShake() {
    if (this._shake <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() * 2 - 1) * this._shake, y: (Math.random() * 2 - 1) * this._shake };
  }

  trigger(cx, footY) {
    if (this.phase !== PHASE.IDLE) return;
    this.cx = cx; this.footY = footY;
    this.phase = PHASE.FREEZE;
    this.born = performance.now();
    this._images = [];
    this._cracks = [];
    this._dashIdx = -1;
    this._dashClock = 0;
    const N = this.cfg.images.count;
    for (let i = 0; i < N; i++) {
      this._images.push({ ang: (i / N) * Math.PI * 2 - Math.PI / 2, x: cx, y: footY, dashT: -1, done: false });
    }
  }

  _cy() { return this.footY - this.SH / 2; }

  _addCrack(x, y) {
    const pts = [{ x, y }];
    let a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 6; k++) {
      a += (Math.random() - 0.5) * 1.4;
      const last = pts[pts.length - 1];
      pts.push({ x: last.x + Math.cos(a) * (18 + Math.random() * 30), y: last.y + Math.sin(a) * (18 + Math.random() * 30) });
    }
    this._cracks.push({ pts, a: 1 });
    if (this._cracks.length > 26) this._cracks.shift();
  }

  update(now, enemies, hooks = {}) {
    if (this.phase === PHASE.IDLE) { if (this._flashT > 0) this._flashT -= 16; return; }
    const P = this.cfg.phases;
    const el = now - this.born;
    this._shake *= 0.85;
    const R = this.cfg.images.radius, cy = this._cy();

    if (this.phase === PHASE.FREEZE) {
      if (el >= P.freezeMs) this.phase = PHASE.SPLIT;

    } else if (this.phase === PHASE.SPLIT) {
      const t = Math.min(1, (el - P.freezeMs) / P.splitMs);
      const e = 1 - Math.pow(1 - t, 3);                       // ease-out
      for (const im of this._images) {
        im.x = this.cx + Math.cos(im.ang) * R * e;
        im.y = cy + Math.sin(im.ang) * R * 0.72 * e;
      }
      if (t >= 1) { this.phase = PHASE.TRIBUNAL; this._dashClock = 0; }

    } else if (this.phase === PHASE.TRIBUNAL) {
      this._dashClock -= 16;
      // launch the next dash on cadence
      if (this._dashClock <= 0 && this._dashIdx < this._images.length - 1) {
        this._dashClock = this.cfg.dash.everyMs;
        this._dashIdx++;
        const im = this._images[this._dashIdx];
        const opp = this._images[(this._dashIdx + this._images.length / 2) % this._images.length];
        im.fromX = im.x; im.fromY = im.y;
        im.toX = opp.x; im.toY = opp.y;                       // dash straight through the ring
        im.dashT = 0;
        this._struck = new Set();
      }
      // advance active dashes + strike enemies near the moving image
      for (const im of this._images) {
        if (im.dashT >= 0 && !im.done) {
          im.dashT = Math.min(1, im.dashT + 0.09);
          const t = im.dashT, e = t * t * (3 - 2 * t);        // smoothstep
          im.x = im.fromX + (im.toX - im.fromX) * e;
          im.y = im.fromY + (im.toY - im.fromY) * e;
          if (hooks.onStrike && hooks.getX) {
            const HR = this.cfg.dash.hitRadius;
            for (const en of enemies || []) {
              if (!en || (en.hp !== undefined && en.hp <= 0) || this._struck?.has(en)) continue;
              const ex = hooks.getX(en), ey = hooks.getY(en);
              if ((im.x - ex) * (im.x - ex) + (im.y - ey) * (im.y - ey) < HR * HR) {
                this._struck.add(en);
                hooks.onStrike(en);
                this._addCrack(ex, ey);
                this._shake = Math.max(this._shake, this.cfg.dash.shake * 0.5);
              }
            }
          }
          if (im.dashT >= 1) { im.done = true; this._addCrack(im.x, im.y); }
        }
      }
      if (el >= P.freezeMs + P.splitMs + P.tribunalMs) this.phase = PHASE.CONVERGE;

    } else if (this.phase === PHASE.CONVERGE) {
      const t0 = P.freezeMs + P.splitMs + P.tribunalMs;
      const t = Math.min(1, (el - t0) / P.convergeMs);
      const e = t * t;                                        // accelerate inward
      for (const im of this._images) {
        im.x += (this.cx - im.x) * e;
        im.y += (cy - im.y) * e;
      }
      for (const c of this._cracks) c.a = Math.max(0, 1 - t * 1.4);
      if (t >= 1) {
        this.phase = PHASE.IDLE;
        this._flashT = 300;
        this._shake = this.cfg.flash.shake;
        this._cracks = [];
      }
    }
  }

  _drawImage(ctx, x, y, alpha, hot) {
    const spr = this.sprite;
    if (!spr || !spr.complete || !spr.naturalWidth) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = hot ? this.cfg.color.hot : this.cfg.color.main;
    ctx.shadowBlur = hot ? 18 : 10;
    ctx.drawImage(spr, x - this.SW / 2, y - this.SH / 2, this.SW, this.SH);
    // additive ghost pass = neon hologram read
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.35;
    ctx.drawImage(spr, x - this.SW / 2, y - this.SH / 2, this.SW, this.SH);
    ctx.restore();
  }

  render(ctx) {
    const C = this.cfg.color;
    if (this.phase === PHASE.IDLE) {
      if (this._flashT > 0) {                                  // converge shockwave (lingers)
        const a = this._flashT / 300;
        const r = this.cfg.flash.maxRadius * (1 - a);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = C.main; ctx.lineWidth = 5 * a + 1;
        ctx.beginPath(); ctx.arc(this.cx, this._cy(), r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = a * 0.35;
        ctx.beginPath(); ctx.arc(this.cx, this._cy(), r * 0.86, 0, Math.PI * 2); ctx.lineWidth = 14 * a; ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const el = performance.now() - this.born;
    ctx.save();

    // FREEZE: hard flash + cool tint
    if (this.phase === PHASE.FREEZE) {
      const t = el / this.cfg.phases.freezeMs;
      ctx.fillStyle = `rgba(230,255,252,${0.55 * (1 - t)})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    // dark cool tint through the tribunal so the neon images pop
    if (this.phase === PHASE.SPLIT || this.phase === PHASE.TRIBUNAL) {
      ctx.fillStyle = 'rgba(0,10,14,0.30)';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    // electric cracks
    for (const c of this._cracks) {
      if (c.a <= 0) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7 * c.a;
      ctx.strokeStyle = C.spark; ctx.lineWidth = 1.6;
      ctx.shadowColor = C.main; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(c.pts[0].x, c.pts[0].y);
      for (const p of c.pts) ctx.lineTo(p.x + (Math.random() - 0.5) * 2, p.y + (Math.random() - 0.5) * 2);
      ctx.stroke();
      ctx.restore();
    }

    // dash trails (active dashers)
    if (this.phase === PHASE.TRIBUNAL) {
      for (const im of this._images) {
        if (im.dashT >= 0 && im.dashT < 1) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = C.main; ctx.lineWidth = 3;
          ctx.shadowColor = C.main; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.moveTo(im.fromX, im.fromY); ctx.lineTo(im.x, im.y); ctx.stroke();
          ctx.restore();
        }
      }
    }

    // the real fighter stays visible at the center (she IS the judge)
    this._drawImage(ctx, this.cx, this._cy(), 1, false);

    // afterimages
    for (let i = 0; i < this._images.length; i++) {
      const im = this._images[i];
      const dashing = im.dashT >= 0 && im.dashT < 1;
      const flicker = 0.55 + 0.30 * Math.sin(el / 40 + i * 2.4);
      this._drawImage(ctx, im.x, im.y, dashing ? 0.95 : flicker * 0.6, dashing);
    }

    ctx.restore();
  }
}
