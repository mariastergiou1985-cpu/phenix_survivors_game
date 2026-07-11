/**
 * OniMaskOverture — cinematic VISUAL-ONLY overlay for "Protocol 0: Total Cataclysm" (Oni).
 * Canvas 2D, no dependencies. Adds the missing theatrical face to the existing ultimate
 * WITHOUT touching its mechanics (buff/trail/detonation stay in protocol-0.js).
 *
 *   PHASE 1  MATERIALIZE – a giant demonic Oni mask assembles from flying shards above him
 *   PHASE 2  BURN        – the mask hovers/bobs for the 8s buff, eyes blazing, embers rising
 *   PHASE 3  SCREAM      – synced to the core detonation: the jaw TEARS OPEN, eyes flare
 *                          white-hot, a red ripple bursts from the mouth
 *
 * API: trigger(cx, footY [, buffMs]) / update(now) / render(ctx) / isActive() / .cx .footY pinning.
 * Purely cosmetic — no enemy hooks, no damage, no getShake (Protocol0 owns the shake).
 */

export const ONI_MASK_CONFIG = {
  phases: { materializeMs: 900, screamMs: 950 },
  buffMs: 8000,                       // must mirror Protocol0 duration (overridable via trigger)
  size:   { w: 120, h: 140, hover: 165 },   // mask box above the player (screen px)
  shards: 14,
  color:  { face: '#c1121f', dark: '#7a0c14', horn: '#e8e4d0', eye: '#ffd447', hot: '#fff2a8', glow: 'rgba(255,45,45,' },
};

const PHASE = { IDLE: 0, MATERIALIZE: 1, BURN: 2, SCREAM: 3 };

export class OniMaskOverture {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.cfg = ONI_MASK_CONFIG;
    if (opts.size) Object.assign(this.cfg.size, opts.size);
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._buffMs = this.cfg.buffMs;
    this._shards = [];    // {dx,dy,ang} start offsets for the materialize
    this._embers = [];    // {x,y,vy,a,r}
  }

  isActive() { return this.phase !== PHASE.IDLE; }

  trigger(cx, footY, buffMs) {
    if (this.phase !== PHASE.IDLE) return;
    this.cx = cx; this.footY = footY;
    this._buffMs = buffMs || this.cfg.buffMs;
    this.phase = PHASE.MATERIALIZE;
    this.born = performance.now();
    this._shards = [];
    for (let i = 0; i < this.cfg.shards; i++) {
      const a = Math.random() * Math.PI * 2;
      this._shards.push({ dx: Math.cos(a) * (220 + Math.random() * 160), dy: Math.sin(a) * (180 + Math.random() * 120), ang: a });
    }
    this._embers = [];
  }

  _maskY() { return this.footY - this.cfg.size.hover; }

  update(now) {
    if (this.phase === PHASE.IDLE) return;
    const el = now - this.born;
    const M = this.cfg.phases.materializeMs;

    if (this.phase === PHASE.MATERIALIZE && el >= M) this.phase = PHASE.BURN;
    if (this.phase === PHASE.BURN && el >= this._buffMs) this.phase = PHASE.SCREAM;
    if (this.phase === PHASE.SCREAM && el >= this._buffMs + this.cfg.phases.screamMs) { this.phase = PHASE.IDLE; return; }

    // rising embers while burning
    if (this.phase === PHASE.BURN && Math.random() < 0.5) {
      this._embers.push({ x: this.cx + (Math.random() - 0.5) * this.cfg.size.w, y: this._maskY() + this.cfg.size.h * 0.4,
                          vy: -(20 + Math.random() * 40) / 60, a: 0.9, r: 1.5 + Math.random() * 2.5 });
    }
    for (const e of this._embers) { e.y += e.vy; e.a -= 0.012; }
    this._embers = this._embers.filter(e => e.a > 0);
    if (this._embers.length > 60) this._embers.splice(0, this._embers.length - 60);
  }

  // Draw one half of the mask contour (mirrored for the other side).
  _facePath(ctx, x, y, w, h, jawDrop) {
    ctx.beginPath();
    ctx.moveTo(x, y - h * 0.48);                                        // brow center
    ctx.bezierCurveTo(x + w * 0.55, y - h * 0.52, x + w * 0.58, y - h * 0.05, x + w * 0.44, y + h * 0.22);
    ctx.bezierCurveTo(x + w * 0.34, y + h * 0.42 + jawDrop, x + w * 0.14, y + h * 0.52 + jawDrop, x, y + h * 0.50 + jawDrop);
    ctx.bezierCurveTo(x - w * 0.14, y + h * 0.52 + jawDrop, x - w * 0.34, y + h * 0.42 + jawDrop, x - w * 0.44, y + h * 0.22);
    ctx.bezierCurveTo(x - w * 0.58, y - h * 0.05, x - w * 0.55, y - h * 0.52, x, y - h * 0.48);
    ctx.closePath();
  }

  render(ctx) {
    if (this.phase === PHASE.IDLE) return;
    const el = performance.now() - this.born;
    const C = this.cfg.color, S = this.cfg.size;
    const M = this.cfg.phases.materializeMs;

    let asm = 1, jaw = 0, eyeHot = 0, alpha = 1;
    if (this.phase === PHASE.MATERIALIZE) { const t = el / M; asm = t * t * (3 - 2 * t); }
    if (this.phase === PHASE.SCREAM) {
      const t = Math.min(1, (el - this._buffMs) / this.cfg.phases.screamMs);
      jaw = S.h * 0.34 * Math.min(1, t * 2.2);                          // jaw tears open fast
      eyeHot = Math.min(1, t * 2);
      alpha = 1 - Math.max(0, (t - 0.65) / 0.35);                       // fade at the very end
    }

    const bob = Math.sin(el / 480) * 6;
    const x = this.cx, y = this._maskY() + bob;
    const w = S.w * (0.7 + 0.3 * asm), h = S.h * (0.7 + 0.3 * asm);

    ctx.save();
    ctx.globalAlpha = alpha * (0.25 + 0.75 * asm);

    // embers
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const e of this._embers) {
      ctx.globalAlpha = e.a * alpha * 0.8;
      ctx.fillStyle = C.eye;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // materialize shards flying in
    if (this.phase === PHASE.MATERIALIZE) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const sh of this._shards) {
        const t = 1 - asm;
        const sx = x + sh.dx * t, sy = y + sh.dy * t;
        ctx.globalAlpha = 0.7 * asm + 0.15;
        ctx.fillStyle = C.face;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(sh.ang + el / 200);
        ctx.fillRect(-7, -3, 14, 6);
        ctx.restore();
      }
      ctx.restore();
    }

    // aura glow behind the mask
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, w * 1.15);
    g.addColorStop(0, C.glow + (0.30 * asm * alpha) + ')');
    g.addColorStop(1, C.glow + '0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, w * 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // horns (bone-white, curved out of the brow)
    ctx.fillStyle = C.horn;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * w * 0.26, y - h * 0.40);
      ctx.quadraticCurveTo(x + s * w * 0.52, y - h * 0.78, x + s * w * 0.30, y - h * 0.95);
      ctx.quadraticCurveTo(x + s * w * 0.40, y - h * 0.66, x + s * w * 0.12, y - h * 0.46);
      ctx.closePath(); ctx.fill();
    }

    // face plate (upper) + jaw (lower, drops on scream)
    const grad = ctx.createLinearGradient(x, y - h * 0.5, x, y + h * 0.55 + jaw);
    grad.addColorStop(0, C.face); grad.addColorStop(1, C.dark);
    this._facePath(ctx, x, y, w, h, jaw);
    ctx.fillStyle = grad; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = C.dark; ctx.stroke();

    // scream mouth — black void with fangs, revealed as the jaw drops
    const mouthH = h * 0.16 + jaw;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y + h * 0.26 + jaw * 0.45, w * 0.30, mouthH * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0004'; ctx.fill();
    ctx.clip();
    ctx.fillStyle = C.horn;                                            // fangs
    for (let i = -2; i <= 2; i++) {
      const fx = x + i * w * 0.11;
      ctx.beginPath(); ctx.moveTo(fx - 5, y + h * 0.26 + jaw * 0.45 - mouthH * 0.5);
      ctx.lineTo(fx + 5, y + h * 0.26 + jaw * 0.45 - mouthH * 0.5);
      ctx.lineTo(fx, y + h * 0.26 + jaw * 0.45 - mouthH * 0.5 + 12 + jaw * 0.2);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx - 5, y + h * 0.26 + jaw * 0.45 + mouthH * 0.5);
      ctx.lineTo(fx + 5, y + h * 0.26 + jaw * 0.45 + mouthH * 0.5);
      ctx.lineTo(fx, y + h * 0.26 + jaw * 0.45 + mouthH * 0.5 - 10 - jaw * 0.2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // eyes — angry slants; gold burning → white-hot on scream
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of [-1, 1]) {
      const ex = x + s * w * 0.20, ey = y - h * 0.10;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(s * 0.32);
      const flick = 0.75 + 0.25 * Math.sin(el / 90 + s);
      ctx.shadowColor = eyeHot > 0 ? C.hot : C.eye; ctx.shadowBlur = 16;
      ctx.fillStyle = eyeHot > 0 ? C.hot : C.eye;
      ctx.globalAlpha = alpha * flick;
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.13, h * 0.045 + eyeHot * 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // scream ripple out of the mouth
    if (jaw > 0) {
      const t = Math.min(1, (el - this._buffMs) / this.cfg.phases.screamMs);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = C.face; ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(x, y + h * 0.3, 30 + t * 260, -0.5, Math.PI + 0.5); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
