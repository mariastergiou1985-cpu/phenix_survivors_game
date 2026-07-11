/**
 * MagmaCoreEruption — cinematic 3-phase ULTIMATE VFX (Brawler Warrior).
 * Canvas 2D, no dependencies. Standard ultimate-module API
 * (trigger / update / render / isActive / getShake / .cx .footY pinning).
 *
 * THE GIMMICK: the ground SHATTERS LIKE GLASS. Jagged lava fissures crack outward from
 * the Brawler's fist-slam in a radial spiderweb (pre-seeded, branch-jittered), magma
 * geysers erupt one by one ALONG the cracks, and the epicenter core finally detonates
 * in a fountain dome. The map itself looks broken.
 *
 *   PHASE 1  FISSURE  – radial cracks tear open progressively, glowing from within
 *   PHASE 2  GEYSERS  – lava columns erupt along the cracks on a cadence, striking around
 *   PHASE 3  CORE     – the epicenter detonates: magma dome + shock ring + ember rain
 */

export const MAGMA_CONFIG = {
  phases:  { fissureMs: 700, geysersMs: 1500, coreMs: 650 },
  cracks:  { count: 7, reach: 340, segs: 7, branchChance: 0.5 },
  geyser:  { everyMs: 160, hitRadius: 82, height: 120, shake: 10 },
  core:    { radius: 200, shake: 20 },
  color:   { deep: '#7a1002', lava: '#ff4d00', hot: '#ffd23c', white: '#fff4d8', glow: 'rgba(255,77,0,' },
};

const PHASE = { IDLE: 0, FISSURE: 1, GEYSERS: 2, CORE: 3 };

export class MagmaCoreEruption {
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;                  // API-uniform (Brawler stays visible)
    this.cfg = MAGMA_CONFIG;
    this.SW = opts.spriteW || 48; this.SH = opts.spriteH || 64;
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._ox = 0; this._oy = 0;            // epicenter LOCKED at trigger (cracks don't follow)
    this._cracks = [];                     // [{pts:[{x,y}], branch:[{x,y}...]|null}] offsets from epicenter
    this._geysers = [];                    // {x,y,t,maxT,struck}
    this._geyserClock = 0;
    this._embers = [];                     // {x,y,vx,vy,a,r}
    this._coreFired = false;
    this._shake = 0;
    this._flashT = 0;
  }

  isActive() { return this.phase !== PHASE.IDLE; }

  getShake() {
    if (this._shake <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() * 2 - 1) * this._shake, y: (Math.random() * 2 - 1) * this._shake };
  }

  trigger(cx, footY) {
    if (this.phase !== PHASE.IDLE) return;
    this.cx = cx; this.footY = footY;
    this._ox = cx; this._oy = footY;       // slam point stays put
    this.phase = PHASE.FISSURE;
    this.born = performance.now();
    this._geysers = []; this._embers = [];
    this._geyserClock = 0;
    this._coreFired = false;
    // pre-seed the crack spiderweb (offsets; ellipse-squashed for ground perspective)
    const C = this.cfg.cracks;
    this._cracks = [];
    for (let i = 0; i < C.count; i++) {
      const baseAng = (i / C.count) * Math.PI * 2 + Math.random() * 0.5;
      const pts = [{ x: 0, y: 0 }];
      let ang = baseAng, dist = 0;
      for (let sgm = 1; sgm <= C.segs; sgm++) {
        ang += (Math.random() - 0.5) * 0.7;
        dist = (sgm / C.segs) * C.reach * (0.8 + Math.random() * 0.35);
        pts.push({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist * 0.55 });
      }
      let branch = null;
      if (Math.random() < C.branchChance) {
        const from = pts[2 + ((Math.random() * (C.segs - 3)) | 0)];
        const bAng = baseAng + (Math.random() < 0.5 ? 0.9 : -0.9);
        branch = [ { x: from.x, y: from.y } ];
        for (let bs = 1; bs <= 3; bs++) {
          branch.push({ x: from.x + Math.cos(bAng) * bs * 42, y: from.y + Math.sin(bAng) * bs * 42 * 0.55 });
        }
      }
      this._cracks.push({ pts, branch });
    }
  }

  _crackPoint() {   // random point along a random crack (for geyser placement)
    const c = this._cracks[(Math.random() * this._cracks.length) | 0];
    const p = c.pts[1 + ((Math.random() * (c.pts.length - 1)) | 0)];
    return { x: this._ox + p.x, y: this._oy + p.y };
  }

  update(now, enemies, hooks = {}) {
    if (this.phase === PHASE.IDLE) { if (this._flashT > 0) this._flashT -= 16; return; }
    const P = this.cfg.phases;
    const el = now - this.born;
    this._shake *= 0.86;

    for (const e of this._embers) { e.x += e.vx; e.y += e.vy; e.vy += 0.15; e.a -= 0.014; }
    this._embers = this._embers.filter(e => e.a > 0);
    for (const g of this._geysers) g.t += 16;

    if (this.phase === PHASE.FISSURE) {
      if ((el % 90) < 17) this._shake = Math.max(this._shake, 3);       // rumble
      if (el >= P.fissureMs) this.phase = PHASE.GEYSERS;

    } else if (this.phase === PHASE.GEYSERS) {
      this._geyserClock -= 16;
      if (this._geyserClock <= 0) {
        this._geyserClock = this.cfg.geyser.everyMs;
        const pt = this._crackPoint();
        const g = { x: pt.x, y: pt.y, t: 0, maxT: 520, struck: false };
        this._geysers.push(g);
        this._shake = Math.max(this._shake, this.cfg.geyser.shake * 0.5);
        for (let i = 0; i < 6; i++) {
          this._embers.push({ x: g.x, y: g.y, vx: (Math.random() - 0.5) * 3,
                              vy: -(2.5 + Math.random() * 3.5), a: 1, r: 2 + Math.random() * 2.5 });
        }
        if (hooks.onStrike && hooks.getX) {
          const HR = this.cfg.geyser.hitRadius;
          for (const e of enemies || []) {
            if (!e || (e.hp !== undefined && e.hp <= 0)) continue;
            const ex = hooks.getX(e), ey = hooks.getY(e);
            if ((ex - g.x) ** 2 + (ey - g.y) ** 2 < HR * HR) hooks.onStrike(e, 'geyser');
          }
        }
      }
      if (el >= P.fissureMs + P.geysersMs) this.phase = PHASE.CORE;

    } else if (this.phase === PHASE.CORE) {
      if (!this._coreFired) {
        this._coreFired = true;
        this._shake = this.cfg.core.shake;
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2;
          this._embers.push({ x: this._ox, y: this._oy, vx: Math.cos(a) * (2 + Math.random() * 4),
                              vy: -Math.abs(Math.sin(a)) * (4 + Math.random() * 5) - 2, a: 1, r: 2.5 + Math.random() * 3 });
        }
        if (hooks.onStrike && hooks.getX) {
          const R = this.cfg.core.radius;
          for (const e of enemies || []) {
            if (!e || (e.hp !== undefined && e.hp <= 0)) continue;
            const ex = hooks.getX(e), ey = hooks.getY(e);
            if ((ex - this._ox) ** 2 + (ey - this._oy) ** 2 < R * R) hooks.onStrike(e, 'core');
          }
        }
      }
      if (el >= P.fissureMs + P.geysersMs + P.coreMs) {
        this.phase = PHASE.IDLE;
        this._flashT = 320;
      }
    }
  }

  _drawCracks(ctx, reveal, dim) {
    const C = this.cfg.color;
    for (const c of this._cracks) {
      for (const seq of [c.pts, c.branch]) {
        if (!seq) continue;
        const upto = Math.max(2, Math.ceil(seq.length * reveal));
        // hot core line + dark rim, drawn twice for depth
        for (const pass of [{ w: 6, col: C.deep, a: 0.9 }, { w: 2.5, col: C.lava, a: 1 }]) {
          ctx.save();
          if (pass.col === C.lava) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = C.lava; ctx.shadowBlur = 9; }
          ctx.globalAlpha = pass.a * dim;
          ctx.strokeStyle = pass.col; ctx.lineWidth = pass.w;
          ctx.beginPath();
          for (let i = 0; i < upto && i < seq.length; i++) {
            const x = this._ox + seq[i].x, y = this._oy + seq[i].y;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  render(ctx) {
    const C = this.cfg.color;
    if (this.phase === PHASE.IDLE) {
      if (this._flashT > 0) {                                  // cooling cracks linger
        this._drawCracks(ctx, 1, this._flashT / 320 * 0.5);
      }
      return;
    }

    const el = performance.now() - this.born;
    const P = this.cfg.phases;
    ctx.save();

    // heat haze dim
    ctx.fillStyle = 'rgba(14,3,0,0.28)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // cracks (progressive reveal in FISSURE, full after)
    const reveal = this.phase === PHASE.FISSURE ? Math.min(1, el / P.fissureMs) : 1;
    this._drawCracks(ctx, reveal, 1);

    // under-glow pool at the epicenter, breathing
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const breathe = 0.75 + 0.25 * Math.sin(el / 140);
    const pool = ctx.createRadialGradient(this._ox, this._oy, 0, this._ox, this._oy, 130);
    pool.addColorStop(0, C.glow + (0.45 * breathe) + ')');
    pool.addColorStop(1, C.glow + '0)');
    ctx.fillStyle = pool;
    ctx.beginPath(); ctx.ellipse(this._ox, this._oy, 130, 72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // geysers — erupting lava columns (grow fast, collapse slow)
    for (const g of this._geysers) {
      const t = Math.min(1, g.t / g.maxT);
      const up = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
      if (up <= 0) continue;
      const h = this.cfg.geyser.height * up;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createLinearGradient(g.x, g.y, g.x, g.y - h);
      grad.addColorStop(0, C.hot); grad.addColorStop(0.6, C.lava); grad.addColorStop(1, C.glow + '0)');
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = grad;
      const w = 14 * up;
      ctx.beginPath();
      ctx.moveTo(g.x - w, g.y);
      ctx.quadraticCurveTo(g.x - w * 0.5, g.y - h * 0.7, g.x, g.y - h);
      ctx.quadraticCurveTo(g.x + w * 0.5, g.y - h * 0.7, g.x + w, g.y);
      ctx.closePath(); ctx.fill();
      // base splash ellipse
      ctx.globalAlpha = 0.65 * up;
      ctx.strokeStyle = C.lava; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, 26 * up + 6, 12 * up + 3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // CORE detonation dome
    if (this.phase === PHASE.CORE) {
      const t = Math.min(1, (el - P.fissureMs - P.geysersMs) / P.coreMs);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // white flash
      ctx.fillStyle = `rgba(255,244,216,${0.4 * (1 - t)})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      // rising dome
      const dr = this.cfg.core.radius * (0.3 + 0.7 * t);
      const dome = ctx.createRadialGradient(this._ox, this._oy, 0, this._ox, this._oy, dr);
      dome.addColorStop(0, C.glow + (0.7 * (1 - t)) + ')');
      dome.addColorStop(0.7, C.glow + (0.35 * (1 - t)) + ')');
      dome.addColorStop(1, C.glow + '0)');
      ctx.fillStyle = dome;
      ctx.beginPath(); ctx.ellipse(this._ox, this._oy - dr * 0.25, dr, dr * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      // shock ring on the ground
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = C.hot; ctx.lineWidth = 5 * (1 - t) + 1;
      ctx.beginPath(); ctx.ellipse(this._ox, this._oy, dr * 1.25, dr * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // embers
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const e of this._embers) {
      ctx.globalAlpha = e.a;
      ctx.fillStyle = Math.random() < 0.3 ? C.hot : C.lava;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }
}
