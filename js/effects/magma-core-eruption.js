/**
 * MagmaCoreEruption — REBUILT AS «PLANET CRACKER» (Maria 2026-07-12).
 * Canvas 2D, no dependencies. Same class name + ultimate-module API so the
 * Game.js wiring (trigger / update / render / isActive / getShake / cx,footY,
 * onStrike kinds 'core' & default) is untouched.
 *
 * THE GIMMICK no other game has: the Brawler hits the ground SO hard that the
 * SCREEN ITSELF cracks like glass. A jagged crack-web spreads across the whole
 * viewport from the impact point, MAGMA LIGHT bleeds up through the cracks,
 * wedge-shards of the picture slip out of place — and then the web heals
 * BACKWARDS, retracting into the fist point with white glints.
 *
 *   PHASE 1  WINDUP   – slow dim, fist-charge rings collapse into the player
 *   PHASE 2  IMPACT   – flash; the crack-web draws across the screen (kind 'core' hit)
 *   PHASE 3  BLEED    – magma light pulses through the cracks; picture shards slip
 *                       (canvas self-copy); enemies near any crack take ticks
 *   PHASE 4  HEAL     – the web retracts backwards into the epicenter, white tips
 */

export const MAGMA_CONFIG = {
  phases: { windupMs: 620, impactMs: 200, bleedMs: 2300, healMs: 700 },
  cracks: { spokes: 11, jag: 34, step: 46, branchEvery: 3 },
  damage: { coreRadius: 300, crackWidth: 46, tickMs: 420 },
};

const PHASE = { IDLE: 0, WINDUP: 1, IMPACT: 2, BLEED: 3, HEAL: 4 };
const pr = (i, salt = 0) => { const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return v - Math.floor(v); };

export class MagmaCoreEruption {
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;
    this.SW = opts.spriteW || 48; this.SH = opts.spriteH || 64;
    this.cfg = MAGMA_CONFIG;
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._ex = 0; this._ey = 0;            // epicenter (locked at impact)
    this._spokes = [];                     // [{pts:[{x,y}...], branch:[{x,y}..]|null}]
    this._seed = 0;
    this._shake = 0;
    this._tickAcc = 0;
    this._coreHit = false;
  }

  isActive() { return this.phase !== PHASE.IDLE; }
  getShake() {
    if (this._shake <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() * 2 - 1) * this._shake, y: (Math.random() * 2 - 1) * this._shake };
  }

  trigger(cx, footY) {
    if (this.phase !== PHASE.IDLE) return;
    this.cx = cx; this.footY = footY;
    this.phase = PHASE.WINDUP;
    this.born = performance.now();
    this._seed = (Math.random() * 1000) | 0;
    this._coreHit = false;
    this._tickAcc = 0;
  }

  _buildCracks() {
    const W = this.canvas.width, H = this.canvas.height;
    const diag = Math.hypot(W, H);
    this._spokes = [];
    const n = this.cfg.cracks.spokes;
    for (let i = 0; i < n; i++) {
      const baseA = (i / n) * Math.PI * 2 + pr(this._seed, i) * 0.5;
      const len = diag * (0.55 + pr(this._seed, i + 40) * 0.5);
      const pts = [{ x: this._ex, y: this._ey }];
      let x = this._ex, y = this._ey, a = baseA, d = 0, k = 0;
      let branch = null;
      while (d < len) {
        const st = this.cfg.cracks.step * (0.7 + pr(this._seed, i * 31 + k) * 0.7);
        a = baseA + (pr(this._seed, i * 57 + k) - 0.5) * (this.cfg.cracks.jag / 40);
        x += Math.cos(a) * st; y += Math.sin(a) * st; d += st; k++;
        pts.push({ x, y });
        if (!branch && k === this.cfg.cracks.branchEvery + (i % 3)) {
          // one side-branch per spoke: short jagged offshoot
          const bA = a + (pr(this._seed, i + 77) > 0.5 ? 0.9 : -0.9);
          let bx = x, by = y; branch = [{ x: bx, y: by }];
          for (let b = 0; b < 3; b++) {
            bx += Math.cos(bA + (pr(this._seed, b + i) - 0.5) * 0.6) * st * 0.7;
            by += Math.sin(bA + (pr(this._seed, b + i) - 0.5) * 0.6) * st * 0.7;
            branch.push({ x: bx, y: by });
          }
        }
      }
      this._spokes.push({ pts, branch });
    }
  }

  update(now, enemies, hooks = {}) {
    if (this.phase === PHASE.IDLE) return;
    const P = this.cfg.phases;
    const el = now - this.born;
    this._shake *= 0.86;

    if (this.phase === PHASE.WINDUP && el >= P.windupMs) {
      this.phase = PHASE.IMPACT;
      this._ex = this.cx; this._ey = this.footY - this.SH * 0.4;   // lock epicenter
      this._buildCracks();
      this._shake = 17;
      // the punch itself — heavy hit around the epicenter
      if (hooks.onStrike && hooks.getX && !this._coreHit) {
        this._coreHit = true;
        const R2 = this.cfg.damage.coreRadius ** 2;
        for (const e of (enemies || [])) {
          if (!e || (e.hp !== undefined && e.hp <= 0)) continue;
          const dx = hooks.getX(e) - this._ex, dy = hooks.getY(e) - this._ey;
          if (dx * dx + dy * dy <= R2) hooks.onStrike(e, 'core');
        }
      }
    } else if (this.phase === PHASE.IMPACT && el >= P.windupMs + P.impactMs) {
      this.phase = PHASE.BLEED;
    } else if (this.phase === PHASE.BLEED) {
      // magma ticks: enemies close to ANY crack line take damage
      this._tickAcc += 16.7;
      if (this._tickAcc >= this.cfg.damage.tickMs && hooks.onStrike && hooks.getX) {
        this._tickAcc = 0;
        const W2 = this.cfg.damage.crackWidth ** 2;
        for (const e of (enemies || [])) {
          if (!e || (e.hp !== undefined && e.hp <= 0)) continue;
          const ex = hooks.getX(e), ey = hooks.getY(e);
          let hit = false;
          for (const sp of this._spokes) {
            const pts = sp.pts;
            for (let j = 0; j + 2 < pts.length && !hit; j += 2) {
              // point-to-segment squared distance (coarse: every 2nd segment)
              const ax = pts[j].x, ay = pts[j].y, bx = pts[j + 2].x, by = pts[j + 2].y;
              const abx = bx - ax, aby = by - ay;
              const t = Math.max(0, Math.min(1, ((ex - ax) * abx + (ey - ay) * aby) / ((abx * abx + aby * aby) || 1)));
              const dx = ex - (ax + abx * t), dy = ey - (ay + aby * t);
              if (dx * dx + dy * dy <= W2) hit = true;
            }
            if (hit) break;
          }
          if (hit) hooks.onStrike(e, 'crack');
        }
        this._shake = Math.max(this._shake, 3);
      }
      if (el >= P.windupMs + P.impactMs + P.bleedMs) this.phase = PHASE.HEAL;
    } else if (this.phase === PHASE.HEAL && el >= P.windupMs + P.impactMs + P.bleedMs + P.healMs) {
      this.phase = PHASE.IDLE;
    }
  }

  _drawCrackPath(ctx, pts, upTo) {
    ctx.beginPath();
    const n = Math.max(2, Math.ceil(pts.length * upTo));
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  render(ctx) {
    if (this.phase === PHASE.IDLE) return;
    ctx.save();
    try {
      const P = this.cfg.phases;
      const el = performance.now() - this.born;
      const W = ctx.canvas.width, H = ctx.canvas.height;

      if (this.phase === PHASE.WINDUP) {
        // slow dim + charge rings collapsing into the fist
        const k = Math.min(1, el / P.windupMs);
        ctx.fillStyle = `rgba(10,4,2,${0.35 * k})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const rk = ((k * 1.6 + i * 0.33) % 1);
          ctx.globalAlpha = rk * 0.8;
          ctx.strokeStyle = i % 2 ? '#ff7a3c' : '#ffd23c';
          ctx.lineWidth = 3 - i * 0.6;
          const rr = (1 - rk) * 220 + 18;
          ctx.beginPath(); ctx.ellipse(this.cx, this.footY - 8, rr, rr * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
        }
        return;   // finally{} owns the restore — the old inline restore double-popped the caller's stack
      }

      // crack progress: draws out fast on impact, holds, retracts on heal
      let upTo = 1, glow = 1;
      if (this.phase === PHASE.IMPACT) {
        upTo = Math.min(1, (el - P.windupMs) / P.impactMs);
        // white concussion flash
        ctx.fillStyle = `rgba(255,244,220,${(1 - upTo) * 0.55})`;
        ctx.fillRect(0, 0, W, H);
      } else if (this.phase === PHASE.HEAL) {
        const hk = (el - P.windupMs - P.impactMs - P.bleedMs) / P.healMs;
        upTo = Math.max(0, 1 - hk);
        glow = 1 - hk * 0.6;
      }

      const pulse = 0.75 + 0.25 * Math.sin(el / 110);

      // ── SHARD STRESS: the wedges between cracks glow under strain (NO canvas
      // self-copy — the drawImage(canvas) version fed back on itself and tiled
      // the whole screen into infinite mirror copies; Maria's screenshot) ──
      if (this.phase === PHASE.BLEED) {
        const strain = 0.5 + 0.5 * Math.sin(el / 300);
        for (let w2 = 0; w2 < 2; w2++) {
          const s0 = this._spokes[w2 * 4], s1 = this._spokes[w2 * 4 + 1];
          if (!s0 || !s1) continue;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath();
          ctx.moveTo(this._ex, this._ey);
          for (const q of s0.pts) ctx.lineTo(q.x, q.y);
          for (let j = s1.pts.length - 1; j >= 0; j--) ctx.lineTo(s1.pts[j].x, s1.pts[j].y);
          ctx.closePath();
          const wg = ctx.createRadialGradient(this._ex, this._ey, 20, this._ex, this._ey, 420);
          wg.addColorStop(0, `rgba(255,120,40,${0.16 * strain})`);
          wg.addColorStop(1, 'rgba(255,120,40,0)');
          ctx.fillStyle = wg;
          ctx.fill();
          ctx.restore();
        }
      }

      // ── the crack web: dark fissure + magma vein + white core ──
      for (let pass = 0; pass < 3; pass++) {
        ctx.save();
        if (pass === 0) {                                // dark glass fissure
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = 'rgba(6,2,0,0.9)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
          ctx.globalAlpha = 0.9 * glow;
        } else if (pass === 1) {                         // magma bleeding through
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = '#ff5a00'; ctx.lineWidth = 4;
          ctx.shadowColor = '#ff5a00'; ctx.shadowBlur = 16;
          ctx.globalAlpha = (this.phase === PHASE.BLEED ? pulse : 0.8) * glow;
        } else {                                         // white-hot centerline
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = '#fff0d8'; ctx.lineWidth = 1.4;
          ctx.globalAlpha = 0.85 * glow;
        }
        for (const sp of this._spokes) {
          this._drawCrackPath(ctx, sp.pts, upTo);
          if (sp.branch && upTo > 0.5) this._drawCrackPath(ctx, sp.branch, (upTo - 0.5) * 2);
        }
        ctx.restore();
      }

      // heal glints: white sparks at each receding crack tip
      if (this.phase === PHASE.HEAL) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const sp of this._spokes) {
          const idx = Math.max(1, Math.floor(sp.pts.length * upTo) - 1);
          const tip = sp.pts[idx];
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#ffd23c'; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(tip.x, tip.y, 2.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // epicenter: molten fist crater glowing all along
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cg = ctx.createRadialGradient(this._ex, this._ey, 2, this._ex, this._ey, 90);
      cg.addColorStop(0, `rgba(255,240,216,${0.8 * pulse * glow})`);
      cg.addColorStop(0.4, `rgba(255,90,0,${0.45 * glow})`);
      cg.addColorStop(1, 'rgba(255,90,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(this._ex, this._ey, 90, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } catch (e) {
      if (!this._rendErr) { console.error('[PlanetCracker render]', e); this._rendErr = true; }
      this.phase = PHASE.IDLE;
    } finally {
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
    }
  }
}
