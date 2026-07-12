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

    // THE MACHINE-ANGEL — fully procedural robot angel (replaces the sprite box):
    // chrome segmented torso + angular visor head, twin fans of ENERGY-BLADE wings
    // that spread wider on each smite, spinning gold halo, thruster glow at the feet.
    if (angelAlpha > 0) {
      const bob = this.phase === PHASE.GUARDIAN ? Math.sin(el / 500) * 12 : 0;
      const flash = this._pulseT;
      const K = (SZ / 340) * (1 + 0.05 * Math.sin(el / 250)) * (1 + 0.06 * flash);
      const axc = this.cx, ayc = ay + bob;
      ctx.save();
      ctx.translate(axc, ayc);
      ctx.scale(K, K);
      ctx.globalAlpha = angelAlpha;
      // ── WINGS: two fans of 6 energy blades each (violet body, white edge) ──
      const spread = 0.55 + 0.25 * Math.sin(el / 700) + 0.5 * flash;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const wa = -Math.PI / 2 + side * (0.35 + (i / 5) * 1.05) * spread;
          const wl = 150 - i * 14;
          const bx = Math.cos(wa) * wl * side * (side === -1 ? -1 : 1);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.rotate(0);
          const tipX = side * Math.abs(Math.cos(wa)) * wl;
          const tipY = -40 + Math.sin(wa) * wl * 0.9;
          const g2 = ctx.createLinearGradient(side * 20, -40, tipX, tipY);
          g2.addColorStop(0, 'rgba(176,38,255,0.95)');
          g2.addColorStop(0.7, 'rgba(255,45,106,0.55)');
          g2.addColorStop(1, 'rgba(255,246,216,0.9)');
          ctx.strokeStyle = g2; ctx.lineWidth = 7 - i * 0.7; ctx.lineCap = 'round';
          ctx.shadowColor = '#b026ff'; ctx.shadowBlur = 10 + flash * 14;
          ctx.beginPath();
          ctx.moveTo(side * 18, -36);
          ctx.quadraticCurveTo(side * (30 + wl * 0.35), -70 + Math.sin(wa) * wl * 0.3, tipX, tipY);
          ctx.stroke();
          ctx.shadowBlur = 0;
          // white hot edge
          ctx.globalAlpha = angelAlpha * 0.8;
          ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(side * 18, -38);
          ctx.quadraticCurveTo(side * (30 + wl * 0.35), -72 + Math.sin(wa) * wl * 0.3, tipX, tipY - 2);
          ctx.stroke();
          ctx.restore();
        }
      }
      // ── BODY: chrome segmented torso ──
      const chrome = ctx.createLinearGradient(-24, 0, 24, 0);
      chrome.addColorStop(0, '#4a5468'); chrome.addColorStop(0.5, '#c8d2e0'); chrome.addColorStop(1, '#39445c');
      ctx.fillStyle = chrome;
      ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 1.6;
      ctx.beginPath();                                        // chest plate (inverted trapezoid)
      ctx.moveTo(-26, -46); ctx.lineTo(26, -46); ctx.lineTo(16, 6); ctx.lineTo(-16, 6); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();                                        // waist + skirt armor
      ctx.moveTo(-14, 8); ctx.lineTo(14, 8); ctx.lineTo(22, 58); ctx.lineTo(-22, 58); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // shoulder pauldrons
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 24, -48); ctx.lineTo(sd * 44, -40); ctx.lineTo(sd * 36, -18); ctx.lineTo(sd * 22, -30);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // ── CORE: glowing reactor heart (pulses on smite) ──
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = angelAlpha * (0.75 + 0.25 * Math.sin(el / 160) + flash * 0.3);
      ctx.fillStyle = flash > 0.4 ? '#fff6d8' : '#ffd447';
      ctx.shadowColor = '#ffd447'; ctx.shadowBlur = 16 + flash * 20;
      ctx.beginPath();
      ctx.moveTo(0, -30); ctx.lineTo(8, -20); ctx.lineTo(0, -10); ctx.lineTo(-8, -20); ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      // ── HEAD: angular helm + glowing visor slit ──
      ctx.fillStyle = chrome;
      ctx.beginPath();
      ctx.moveTo(-11, -74); ctx.lineTo(11, -74); ctx.lineTo(14, -56); ctx.lineTo(0, -48); ctx.lineTo(-14, -56);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = angelAlpha * (0.8 + 0.2 * Math.sin(el / 120));
      ctx.fillStyle = flash > 0.4 ? '#fff6d8' : '#ff2d6a';
      ctx.fillRect(-9, -66, 18, 3.4);                          // the visor slit
      ctx.restore();
      // ── THRUSTERS: light jets instead of legs ──
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const sd of [-1, 1]) {
        const jg = ctx.createLinearGradient(0, 58, 0, 108 + Math.sin(el / 90 + sd) * 8);
        jg.addColorStop(0, 'rgba(255,212,71,0.9)');
        jg.addColorStop(0.5, 'rgba(255,45,106,0.4)');
        jg.addColorStop(1, 'rgba(255,45,106,0)');
        ctx.fillStyle = jg;
        ctx.globalAlpha = angelAlpha * (0.7 + 0.3 * Math.sin(el / 70 + sd * 2));
        ctx.beginPath();
        ctx.moveTo(sd * 14 - 7, 58); ctx.lineTo(sd * 14 + 7, 58);
        ctx.lineTo(sd * 14, 106 + Math.sin(el / 90 + sd) * 8);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
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
