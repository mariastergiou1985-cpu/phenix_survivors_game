/**
 * RailgunHorizon — cinematic 3-phase ULTIMATE VFX (Cyber Arm Hero).
 * Canvas 2D, no dependencies. Standard ultimate-module API
 * (trigger / update / render / isActive / getShake / .cx .footY pinning).
 *
 * THE GIMMICK: the world is BISECTED. A railgun beam erupts across the ENTIRE screen
 * width at the hero's height — and the screen literally TEARS: the already-rendered
 * frame above and below the beam is displaced (canvas self-copy, no getImageData),
 * like the shot split the map along the horizon.
 *
 *   PHASE 1  CHARGE    – targeting line locks on, plasma converges into the arm
 *   PHASE 2  FIRE      – full-width white-hot beam + REAL screen tear + heavy strike
 *   PHASE 3  AFTERGLOW – the tear seals; molten edges ripple, sparks drip, burn ticks
 */

export const RAILGUN_CONFIG = {
  phases: { chargeMs: 750, fireMs: 460, afterglowMs: 950 },
  beam:   { band: 62, tear: 9, coreW: 10, sheathW: 46 },
  burn:   { everyMs: 260 },
  flash:  { shake: 22 },
  color:  { orange: '#ff6600', deep: '#cc2200', hot: '#fff4e0', spark: '#ffc266', glow: 'rgba(255,102,0,' },
};

const PHASE = { IDLE: 0, CHARGE: 1, FIRE: 2, AFTERGLOW: 3 };

export class RailgunHorizon {
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;                 // API-uniform (hero stays visible; not drawn here)
    this.cfg = RAILGUN_CONFIG;
    this.SW = opts.spriteW || 48; this.SH = opts.spriteH || 64;
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._beamY = 0;                      // locked at FIRE (doesn't follow the player after)
    this._fired = false;
    this._burnClock = 0;
    this._sparks = [];                    // {x,y,vx,vy,a}
    this._shake = 0;
    this._flashT = 0;
  }

  isActive() { return this.phase !== PHASE.IDLE; }

  getShake() {
    if (this._shake <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() * 2 - 1) * this._shake, y: (Math.random() * 2 - 1) * this._shake };
  }

  _cy() { return this.footY - this.SH / 2; }

  trigger(cx, footY) {
    if (this.phase !== PHASE.IDLE) return;
    this.cx = cx; this.footY = footY;
    this.phase = PHASE.CHARGE;
    this.born = performance.now();
    this._fired = false;
    this._sparks = [];
    this._burnClock = 0;
  }

  update(now, enemies, hooks = {}) {
    if (this.phase === PHASE.IDLE) { if (this._flashT > 0) this._flashT -= 16; return; }
    const P = this.cfg.phases;
    const el = now - this.born;
    this._shake *= 0.86;

    if (this.phase === PHASE.CHARGE) {
      this._beamY = this._cy();                              // tracks the hero while charging
      if (el >= P.chargeMs) {
        this.phase = PHASE.FIRE;
        this._shake = this.cfg.flash.shake;
        if (!this._fired && hooks.onStrike && hooks.getY) {  // one heavy strike, whole band
          this._fired = true;
          const B = this.cfg.beam.band;
          for (const e of enemies || []) {
            if (!e || (e.hp !== undefined && e.hp <= 0)) continue;
            if (Math.abs(hooks.getY(e) - this._beamY) < B) hooks.onStrike(e, 'core');
          }
        }
        // eruption sparks along the whole beam
        const W = this.canvas ? this.canvas.width : 1600;
        for (let i = 0; i < 40; i++) {
          this._sparks.push({ x: Math.random() * W, y: this._beamY,
                              vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 5,
                              a: 1 });
        }
      }

    } else if (this.phase === PHASE.FIRE) {
      if (el >= P.chargeMs + P.fireMs) this.phase = PHASE.AFTERGLOW;

    } else if (this.phase === PHASE.AFTERGLOW) {
      this._burnClock -= 16;
      if (this._burnClock <= 0 && hooks.onStrike && hooks.getY) {   // residual burn ticks
        this._burnClock = this.cfg.burn.everyMs;
        const B = this.cfg.beam.band * 0.8;
        for (const e of enemies || []) {
          if (!e || (e.hp !== undefined && e.hp <= 0)) continue;
          if (Math.abs(hooks.getY(e) - this._beamY) < B) hooks.onStrike(e, 'burn');
        }
      }
      if (el >= P.chargeMs + P.fireMs + P.afterglowMs) {
        this.phase = PHASE.IDLE;
        this._flashT = 260;
      }
    }

    for (const s of this._sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.12; s.a -= 0.02; }
    this._sparks = this._sparks.filter(s => s.a > 0);
  }

  render(ctx) {
    const C = this.cfg.color;
    const W = ctx.canvas.width;
    if (this.phase === PHASE.IDLE) {
      if (this._flashT > 0) {                                // fading seam
        const a = this._flashT / 260;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = C.deep; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, this._beamY); ctx.lineTo(W, this._beamY); ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const el = performance.now() - this.born;
    const P = this.cfg.phases;
    ctx.save();

    if (this.phase === PHASE.CHARGE) {
      const t = el / P.chargeMs;
      // heat dim
      ctx.fillStyle = `rgba(12,3,0,${0.25 * t})`;
      ctx.fillRect(0, 0, W, ctx.canvas.height);
      // targeting line — flickers into lock across the full width
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.55 * t * (0.7 + 0.3 * Math.sin(el / 35));
      ctx.strokeStyle = C.orange; ctx.lineWidth = 1.5 + 2 * t;
      ctx.setLineDash(t < 0.75 ? [14, 10] : []);
      ctx.beginPath(); ctx.moveTo(0, this._beamY); ctx.lineTo(W, this._beamY); ctx.stroke();
      ctx.setLineDash([]);
      // plasma converging into the arm
      for (let i = 0; i < 7; i++) {
        const seed = (el / 320 + i / 7) % 1;
        const d = (1 - seed) * 220;
        const a = i * 0.9 + el / 900;
        ctx.globalAlpha = seed * 0.8;
        ctx.fillStyle = C.spark;
        ctx.beginPath();
        ctx.arc(this.cx + Math.cos(a) * d, this._cy() + Math.sin(a) * d * 0.6, 2 + seed * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

    } else {
      const isFire = this.phase === PHASE.FIRE;
      const t = isFire ? (el - P.chargeMs) / P.fireMs
                       : (el - P.chargeMs - P.fireMs) / P.afterglowMs;
      const power = isFire ? 1 - 0.25 * t : (1 - t) * 0.75;
      const y = this._beamY;

      // REAL SCREEN TEAR — self-copy the rendered frame, displaced (no getImageData)
      if (isFire) {
        const tear = Math.round(this.cfg.beam.tear * (1 - t));
        if (tear > 0) {
          try {
            const cv = ctx.canvas;
            const topH = Math.max(1, Math.floor(y));
            const botY = Math.ceil(y);
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.drawImage(cv, 0, 0, cv.width, topH, 0, -tear, cv.width, topH);          // upper half up
            ctx.drawImage(cv, 0, botY, cv.width, cv.height - botY, 0, botY + tear, cv.width, cv.height - botY); // lower half down
            ctx.restore();
          } catch (_) { /* tear is decorative — never let it kill the frame */ }
        }
        // hard white flash on eruption
        ctx.fillStyle = `rgba(255,244,224,${0.5 * (1 - t)})`;
        ctx.fillRect(0, 0, W, ctx.canvas.height);
      }

      // beam: plasma sheath + white-hot core, full width
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const sheath = this.cfg.beam.sheathW * power;
      const grad = ctx.createLinearGradient(0, y - sheath, 0, y + sheath);
      grad.addColorStop(0, C.glow + '0)');
      grad.addColorStop(0.5, C.glow + (0.75 * power) + ')');
      grad.addColorStop(1, C.glow + '0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y - sheath, W, sheath * 2);
      ctx.globalAlpha = power;
      ctx.fillStyle = C.hot;
      ctx.fillRect(0, y - this.cfg.beam.coreW * power / 2, W, this.cfg.beam.coreW * power);
      // molten ripple edges (afterglow)
      if (!isFire) {
        ctx.globalAlpha = power * 0.9;
        ctx.strokeStyle = C.deep; ctx.lineWidth = 2;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          for (let x = 0; x <= W; x += 14) {
            const yy = y + s * (10 + Math.sin(x / 26 + el / 130) * 5 * power);
            x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
      }
      ctx.restore();

      // sparks
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of this._sparks) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = C.spark;
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
