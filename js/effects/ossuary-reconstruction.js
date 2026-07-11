/**
 * OssuaryReconstruction — cinematic 4-phase ULTIMATE VFX (Cyber Skeleton Warrior).
 * Canvas 2D, framework-agnostic, no dependencies, no getImageData. API-compatible with
 * DigitalSingularity (trigger / update / render / isActive / getShake / .cx .footY pinning).
 *
 *   PHASE 1  SHATTER  – the skeleton bursts into bone shards (capsules) with crimson edge glow
 *   PHASE 2  SWARM    – screen darkens ~35%, the shards spiral outward as a hunting swarm
 *   PHASE 3  REAP     – shards streak through enemies in boomerang arcs (onStrike per hit)
 *   PHASE 4  REWIND   – THE SIGNATURE: every shard replays its recorded flight path BACKWARDS
 *                       (true time-reverse) and the skeleton reassembles bottom-up + red flash
 *
 * While isActive() the module draws the character itself — skip the normal player draw.
 */

export const OSSUARY_CONFIG = {
  phases: { shatterMs: 650, swarmMs: 1200, reapMs: 1400, rewindMs: 850 },
  shards: { count: 26, lenMin: 10, lenMax: 26, trail: 6 },
  swarm:  { darken: 0.35, spin: 2.6, radius: 150 },
  reap:   { strikeEveryMs: 170, hitRadius: 46, shake: 13 },
  flash:  { maxRadius: 330, shake: 20 },
  color:  { bone: '#e8e4d0', boneDark: '#b8b2a0', blood: '#ff2d55', glow: 'rgba(255,45,85,' },
};

const PHASE = { IDLE: 0, SHATTER: 1, SWARM: 2, REAP: 3, REWIND: 4, FLASH: 5 };

export class OssuaryReconstruction {
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;
    this.cfg = OSSUARY_CONFIG;
    this.SW = opts.spriteW || sprite.naturalWidth || sprite.width || 48;
    this.SH = opts.spriteH || sprite.naturalHeight || sprite.height || 64;
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._shards = [];          // {x,y,vx,vy,ang,spin,len,w, path:[{x,y,ang}], pathI}
    this._strikeCd = 0;
    this._shake = 0;
    this._flashT = 0;           // lingering reform flash (renders after isActive() clears)
    this._reveal = 1;           // 1 = sprite fully visible, 0 = fully shattered
  }

  isActive() { return this.phase !== PHASE.IDLE; }

  getShake() {
    if (this._shake <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() * 2 - 1) * this._shake, y: (Math.random() * 2 - 1) * this._shake };
  }

  trigger(cx, footY) {
    if (this.phase !== PHASE.IDLE) return;
    this.cx = cx; this.footY = footY;
    this.phase = PHASE.SHATTER;
    this.born = performance.now();
    this._reveal = 1;
    this._shards = [];
    const C = this.cfg.shards;
    for (let i = 0; i < C.count; i++) {
      // shards seeded across the sprite body so the burst reads as "the skeleton came apart"
      const fy = this.footY - Math.random() * this.SH;
      const fx = this.cx + (Math.random() - 0.5) * this.SW;
      const a  = Math.random() * Math.PI * 2;
      this._shards.push({
        x: fx, y: fy,
        vx: Math.cos(a) * (60 + Math.random() * 160),
        vy: Math.sin(a) * (60 + Math.random() * 160) - 40,
        ang: a, spin: (Math.random() - 0.5) * 10,
        len: C.lenMin + Math.random() * (C.lenMax - C.lenMin),
        w: 3 + Math.random() * 3,
        path: [], pathI: 0,
      });
    }
  }

  update(now, enemies, hooks = {}) {
    if (this.phase === PHASE.IDLE) {
      if (this._flashT > 0) this._flashT -= 16;
      return;
    }
    const P = this.cfg.phases;
    const el = now - this.born;
    this._shake *= 0.86;

    const record = (s) => { s.path.push({ x: s.x, y: s.y, ang: s.ang }); if (s.path.length > 400) s.path.shift(); };

    if (this.phase === PHASE.SHATTER) {
      this._reveal = Math.max(0, 1 - el / P.shatterMs);
      for (const s of this._shards) {
        s.x += s.vx * 0.016; s.y += s.vy * 0.016; s.ang += s.spin * 0.016;
        record(s);
      }
      if (el >= P.shatterMs) { this.phase = PHASE.SWARM; this._reveal = 0; }

    } else if (this.phase === PHASE.SWARM) {
      const t = (el - P.shatterMs) / P.swarmMs;
      const R = this.cfg.swarm.radius * (0.4 + 0.9 * t);
      this._shards.forEach((s, i) => {
        const a = (i / this._shards.length) * Math.PI * 2 + (el / 1000) * this.cfg.swarm.spin;
        const tx = this.cx + Math.cos(a) * R, ty = this.footY - this.SH * 0.5 + Math.sin(a) * R * 0.7;
        s.x += (tx - s.x) * 0.10; s.y += (ty - s.y) * 0.10; s.ang = a + Math.PI / 2;
        record(s);
      });
      if (el >= P.shatterMs + P.swarmMs) { this.phase = PHASE.REAP; this._strikeCd = 0; }

    } else if (this.phase === PHASE.REAP) {
      // shards home into enemies in fast boomerang arcs; damage on proximity, capped cadence
      this._strikeCd -= 16;
      const live = (enemies || []).filter(e => e && (e.hp === undefined || e.hp > 0));
      this._shards.forEach((s, i) => {
        const e = live.length ? live[i % live.length] : null;
        let tx = this.cx, ty = this.footY - this.SH * 0.5;
        if (e && hooks.getX) { tx = hooks.getX(e); ty = hooks.getY(e); }
        const curve = Math.sin((performance.now() / 120) + i) * 55;   // boomerang wobble
        s.x += (tx - s.x) * 0.14 + Math.cos(s.ang) * curve * 0.02;
        s.y += (ty - s.y) * 0.14 + Math.sin(s.ang) * curve * 0.02;
        s.ang += 0.35;
        record(s);
      });
      if (this._strikeCd <= 0 && hooks.onStrike && hooks.getX) {
        this._strikeCd = this.cfg.reap.strikeEveryMs;
        const HR = this.cfg.reap.hitRadius;
        for (const e of live) {
          const ex = hooks.getX(e), ey = hooks.getY(e);
          if (this._shards.some(s => (s.x - ex) * (s.x - ex) + (s.y - ey) * (s.y - ey) < HR * HR)) {
            hooks.onStrike(e);
            this._shake = Math.max(this._shake, this.cfg.reap.shake * 0.45);
          }
        }
      }
      if (el >= P.shatterMs + P.swarmMs + P.reapMs) this.phase = PHASE.REWIND;

    } else if (this.phase === PHASE.REWIND) {
      // THE SIGNATURE: play every shard's recorded path BACKWARDS (true time-reverse)
      const t0 = P.shatterMs + P.swarmMs + P.reapMs;
      const t  = Math.min(1, (el - t0) / P.rewindMs);
      let allHome = true;
      for (const s of this._shards) {
        const idx = Math.max(0, Math.floor((1 - t) * (s.path.length - 1)));
        const p = s.path[idx];
        if (p) { s.x = p.x; s.y = p.y; s.ang = p.ang; }
        if (idx > 2) allHome = false;
      }
      this._reveal = t;                          // skeleton reassembles bottom-up as shards return
      if (t >= 1 || allHome) {
        this.phase = PHASE.IDLE;
        this._reveal = 1;
        this._flashT = 320;                      // lingering red reform blast
        this._shake = this.cfg.flash.shake;
      }
    }
  }

  render(ctx) {
    const C = this.cfg.color;
    // lingering reform flash even after IDLE
    if (this.phase === PHASE.IDLE) {
      if (this._flashT > 0) {
        const a = this._flashT / 320;
        const r = this.cfg.flash.maxRadius * (1 - a * 0.6);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(this.cx, this.footY - this.SH / 2, 0, this.cx, this.footY - this.SH / 2, r);
        g.addColorStop(0, C.glow + (0.5 * a) + ')');
        g.addColorStop(1, C.glow + '0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(this.cx, this.footY - this.SH / 2, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      return;
    }

    ctx.save();
    // darken during the swarm/reap so the bone-white shards pop
    if (this.phase === PHASE.SWARM || this.phase === PHASE.REAP) {
      ctx.fillStyle = `rgba(6,0,10,${this.cfg.swarm.darken})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    // character sprite: bottom-up reveal (shatter = top disappears first; rewind = rebuilds up)
    if (this._reveal > 0 && this.sprite && this.sprite.complete && this.sprite.naturalWidth > 0) {
      const h = this.SH * this._reveal;
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.cx - this.SW, this.footY - h, this.SW * 2, h);   // clip: keep the LOWER part
      ctx.clip();
      ctx.shadowColor = C.blood; ctx.shadowBlur = 14 * (1 - this._reveal) + 4;
      ctx.drawImage(this.sprite, this.cx - this.SW / 2, this.footY - this.SH, this.SW, this.SH);
      ctx.restore();
      // red scan-line at the tear edge
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - Math.abs(2 * this._reveal - 1));
      ctx.strokeStyle = C.blood; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.cx - this.SW * 0.7, this.footY - h); ctx.lineTo(this.cx + this.SW * 0.7, this.footY - h); ctx.stroke();
      ctx.restore();
    }

    // bone shards — ivory capsules with crimson trails
    for (const s of this._shards) {
      // trail (last few recorded points)
      const n = s.path.length;
      if (n > 2) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 1; k <= this.cfg.shards.trail; k++) {
          const p = s.path[Math.max(0, n - 1 - k * 3)];
          if (!p) break;
          ctx.globalAlpha = 0.16 * (1 - k / (this.cfg.shards.trail + 1));
          ctx.fillStyle = C.blood;
          ctx.beginPath(); ctx.arc(p.x, p.y, s.w * 0.9, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      // capsule bone
      ctx.save();
      ctx.translate(s.x, s.y); ctx.rotate(s.ang);
      ctx.shadowColor = C.blood; ctx.shadowBlur = 7;
      ctx.fillStyle = C.bone;
      ctx.beginPath();
      const L = s.len / 2, W = s.w;
      ctx.moveTo(-L, -W / 2); ctx.lineTo(L, -W / 2);
      ctx.arc(L, 0, W / 2, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-L, W / 2);
      ctx.arc(-L, 0, W / 2, Math.PI / 2, -Math.PI / 2);
      ctx.closePath(); ctx.fill();
      // knuckle ends (reads as a real bone, not a pill)
      ctx.fillStyle = C.boneDark;
      ctx.beginPath(); ctx.arc(-L, -W * 0.45, W * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-L,  W * 0.45, W * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( L, -W * 0.45, W * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( L,  W * 0.45, W * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}
