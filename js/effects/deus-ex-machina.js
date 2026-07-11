/**
 * DeusExMachina — cinematic presentation layer for Dimi's Cyber-Angel Summoning.
 * Canvas 2D, no dependencies. Standard ultimate-module API (trigger / update / render /
 * isActive / .cx .footY pinning) + pulse() called by the game on every angel smite.
 *
 * VISUAL ONLY — the nova/smite damage stays in Game.js (_activateCyberAngelNova /
 * _updateDimiAngels). This module replaces the old ghost-hologram draw with:
 *
 *   PHASE 1  GATE     – a golden-violet heaven-gate ring dilates open high above Dimi,
 *                       a light pillar drops down onto him, screen dims
 *   PHASE 2  DESCENT  – Maria's Cyber-Angel art descends out of the gate through god-rays,
 *                       drawn SOLID with a golden rim (no more transparent ghost)
 *   PHASE 3  GUARDIAN – hover with rotating halo + falling light-feathers; every smite
 *                       (game calls pulse()) fires visible JUDGEMENT BEAMS outward
 *   PHASE 4  ASCEND   – the angel rises back into the closing gate in a streak of light
 */

export const DEUS_CONFIG = {
  phases: { gateMs: 700, descentMs: 800, ascendMs: 650 },
  totalMs: 6000,                          // must mirror the angel's 6.0s life in Game.js
  size:   { angel: 340, gateW: 260, hover: 165 },
  color:  { gold: '#ffd447', violet: '#b026ff', pink: '#ff2d6a', hot: '#fff6d8', glow: 'rgba(255,212,71,' },
};

const PHASE = { IDLE: 0, GATE: 1, DESCENT: 2, GUARDIAN: 3, ASCEND: 4 };

export class DeusExMachina {
  constructor(canvas, angelImg, opts = {}) {
    this.canvas = canvas;
    this.img = angelImg;
    this.cfg = DEUS_CONFIG;
    if (opts.totalMs) this.cfg.totalMs = opts.totalMs;
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._feathers = [];   // {x,y,vy,vx,a,r,rot}
    this._beams = [];      // {ang,life,maxLife}
    this._pulseT = 0;
  }

  isActive() { return this.phase !== PHASE.IDLE; }

  trigger(cx, footY) {
    if (this.phase !== PHASE.IDLE) return;
    this.cx = cx; this.footY = footY;
    this.phase = PHASE.GATE;
    this.born = performance.now();
    this._feathers = [];
    this._beams = [];
  }

  // Called by the game each time the angel smites — fires the visible judgement beams.
  pulse() {
    if (this.phase !== PHASE.GUARDIAN) return;
    this._pulseT = 1;
    const n = 6;
    const off = Math.random() * Math.PI;
    for (let i = 0; i < n; i++) {
      this._beams.push({ ang: off + (i / n) * Math.PI * 2, life: 260, maxLife: 260 });
    }
  }

  _gateY()  { return this.footY - this.cfg.size.hover - this.cfg.size.angel * 0.62; }
  _angelY(descend) {
    const hoverY = this.footY - this.cfg.size.hover;
    return this._gateY() + (hoverY - this._gateY()) * descend;
  }

  update(now) {
    if (this.phase === PHASE.IDLE) return;
    const el = now - this.born;
    const P = this.cfg.phases;
    this._pulseT = Math.max(0, this._pulseT - 0.05);

    if (this.phase === PHASE.GATE && el >= P.gateMs) this.phase = PHASE.DESCENT;
    if (this.phase === PHASE.DESCENT && el >= P.gateMs + P.descentMs) this.phase = PHASE.GUARDIAN;
    if (this.phase === PHASE.GUARDIAN && el >= this.cfg.totalMs - P.ascendMs) this.phase = PHASE.ASCEND;
    if (this.phase === PHASE.ASCEND && el >= this.cfg.totalMs) { this.phase = PHASE.IDLE; return; }

    // falling light-feathers while the guardian hovers
    if (this.phase === PHASE.GUARDIAN && Math.random() < 0.35) {
      this._feathers.push({
        x: this.cx + (Math.random() - 0.5) * this.cfg.size.angel * 0.9,
        y: this._angelY(1) - 40,
        vx: (Math.random() - 0.5) * 0.5, vy: 0.6 + Math.random() * 0.8,
        a: 1, r: 4 + Math.random() * 5, rot: Math.random() * Math.PI,
      });
    }
    for (const f of this._feathers) { f.x += f.vx + Math.sin(f.y / 24) * 0.4; f.y += f.vy; f.a -= 0.008; f.rot += 0.03; }
    this._feathers = this._feathers.filter(f => f.a > 0);
    for (const b of this._beams) b.life -= 16;
    this._beams = this._beams.filter(b => b.life > 0);
  }

  _drawGate(ctx, open, alpha) {
    const C = this.cfg.color;
    const gy = this._gateY();
    const w = this.cfg.size.gateW * open, h = w * 0.30;
    if (w < 4) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // outer violet ring + inner gold ring (elliptic — a gate seen from below)
    ctx.globalAlpha = 0.8 * alpha;
    ctx.strokeStyle = C.violet; ctx.lineWidth = 5;
    ctx.shadowColor = C.violet; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.ellipse(this.cx, gy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.9 * alpha;
    ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
    ctx.shadowColor = C.gold; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(this.cx, gy, w * 0.38, h * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
    // gate glow disc
    const g = ctx.createRadialGradient(this.cx, gy, 0, this.cx, gy, w * 0.5);
    g.addColorStop(0, C.glow + (0.5 * alpha) + ')');
    g.addColorStop(1, C.glow + '0)');
    ctx.fillStyle = g; ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.ellipse(this.cx, gy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawPillar(ctx, alpha) {
    const C = this.cfg.color;
    const gy = this._gateY();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, gy, 0, this.footY);
    g.addColorStop(0, C.glow + (0.35 * alpha) + ')');
    g.addColorStop(1, C.glow + '0)');
    ctx.fillStyle = g;
    const w = 90;
    ctx.beginPath();
    ctx.moveTo(this.cx - w * 0.35, gy);
    ctx.lineTo(this.cx + w * 0.35, gy);
    ctx.lineTo(this.cx + w * 0.6, this.footY);
    ctx.lineTo(this.cx - w * 0.6, this.footY);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  render(ctx) {
    if (this.phase === PHASE.IDLE) return;
    const el = performance.now() - this.born;
    const P = this.cfg.phases;
    const C = this.cfg.color;
    const SZ = this.cfg.size.angel;

    ctx.save();
    // holy dim — the world kneels
    ctx.fillStyle = 'rgba(8,2,16,0.30)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    let gateOpen = 1, gateAlpha = 1, descend = 1, angelAlpha = 1;
    if (this.phase === PHASE.GATE) {
      const t = el / P.gateMs;
      gateOpen = t * t * (3 - 2 * t);
      descend = 0; angelAlpha = 0;
    } else if (this.phase === PHASE.DESCENT) {
      const t = (el - P.gateMs) / P.descentMs;
      descend = t * t * (3 - 2 * t);
      angelAlpha = Math.min(1, t * 2);
    } else if (this.phase === PHASE.ASCEND) {
      const t = (el - (this.cfg.totalMs - P.ascendMs)) / P.ascendMs;
      descend = 1 - t * t;
      angelAlpha = 1 - t;
      gateAlpha = 1 - t * 0.5;
    }

    this._drawPillar(ctx, gateAlpha * (this.phase === PHASE.GATE ? gateOpen : 1));
    this._drawGate(ctx, gateOpen, gateAlpha);

    const ay = this._angelY(descend);

    // god-rays behind the angel
    if (angelAlpha > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(this.cx, ay);
      ctx.rotate(el / 4000);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const g = ctx.createLinearGradient(0, 0, Math.cos(a) * SZ, Math.sin(a) * SZ);
        g.addColorStop(0, C.glow + (0.22 * angelAlpha) + ')');
        g.addColorStop(1, C.glow + '0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, SZ, a - 0.09, a + 0.09);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // judgement beams (fired on each smite via pulse())
    for (const b of this._beams) {
      const t = b.life / b.maxLife;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = t * 0.85;
      ctx.strokeStyle = C.pink; ctx.lineWidth = 4 * t + 1;
      ctx.shadowColor = C.pink; ctx.shadowBlur = 12;
      const len = 130 + (1 - t) * 260;
      ctx.beginPath();
      ctx.moveTo(this.cx + Math.cos(b.ang) * 40, ay + Math.sin(b.ang) * 40);
      ctx.lineTo(this.cx + Math.cos(b.ang) * len, ay + Math.sin(b.ang) * len);
      ctx.stroke();
      ctx.restore();
    }

    // the angel — Maria's art, SOLID, golden rim, gentle hover bob + smite flash
    const img = this.img;
    if (img && img.complete && img.naturalWidth > 0 && angelAlpha > 0) {
      const bob = this.phase === PHASE.GUARDIAN ? Math.sin(el / 500) * 12 : 0;
      const flash = this._pulseT;
      const size = SZ * (1 + 0.05 * Math.sin(el / 250)) * (1 + 0.06 * flash);
      ctx.save();
      ctx.globalAlpha = angelAlpha;
      ctx.shadowColor = flash > 0.4 ? C.hot : C.gold;
      ctx.shadowBlur = 22 + 26 * flash;
      ctx.drawImage(img, this.cx - size / 2, ay + bob - size / 2, size, size);
      ctx.restore();
      // rotating halo above the head
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = angelAlpha * (0.6 + 0.3 * Math.sin(el / 300));
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3.5;
      ctx.shadowColor = C.gold; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(this.cx, ay + bob - size * 0.46, size * 0.16, size * 0.05, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // falling light-feathers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this._feathers) {
      ctx.save();
      ctx.translate(f.x, f.y); ctx.rotate(f.rot + Math.sin(f.y / 30) * 0.4);
      ctx.globalAlpha = f.a * 0.8;
      ctx.fillStyle = C.hot;
      ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(0, 0, f.r, f.r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    ctx.restore();
  }
}
