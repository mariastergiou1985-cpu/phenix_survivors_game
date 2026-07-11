/**
 * EuclidTheorem — "THEOREM OF ROT" cinematic ULTIMATE VFX (Euclid Vector).
 * Canvas 2D, no dependencies. API-compatible with the other ultimate modules
 * (trigger / update / render / isActive / getShake / .cx .footY pinning).
 *
 * THE GIMMICK: the screen becomes a LIVING GEOMETRY PROOF. Compass-and-straightedge
 * construction lines draw themselves from enemy to enemy (the diagram FOLLOWS them as
 * they move), each completed line poisons its endpoints, and the proof closes with a
 * giant Q.E.D. tombstone (∎) that collapses every "proven" enemy into toxin.
 *
 *   PHASE 1  AXIOM        – a compass circle inscribes itself around Euclid, symbols rise
 *   PHASE 2  CONSTRUCTION – glowing green proof-lines connect enemies one by one
 *   PHASE 3  QED          – the whole diagram flashes, ∎ stamps the screen, burst damage
 */

export const THEOREM_CONFIG = {
  phases: { axiomMs: 550, constructMs: 1700, qedMs: 750 },
  lines:  { everyMs: 210, drawMs: 260, maxTargets: 9 },
  dmg:    {},                                              // damage lives in the game hooks
  color:  { ink: '#7CFF4D', dim: '#2f9e2f', hot: '#eaffd0', glow: 'rgba(124,255,77,' },
  symbols: ['π', 'Σ', '∠', '≅', 'Δ', '√', 'θ', '≡'],
};

const PHASE = { IDLE: 0, AXIOM: 1, CONSTRUCT: 2, QED: 3 };

export class EuclidTheorem {
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;                                  // unused (Euclid stays visible) but API-uniform
    this.cfg = THEOREM_CONFIG;
    this.SW = opts.spriteW || 48; this.SH = opts.spriteH || 64;
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._targets = [];      // enemy refs (positions re-read via hooks each frame)
    this._lines = [];        // {a,b, t, struck}  a/b = enemy ref or 'player'
    this._lineClock = 0;
    this._symbols = [];      // {x,y,ch,a,vy}
    this._shake = 0;
    this._flashT = 0;
    this._qedFired = false;
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
    this.phase = PHASE.AXIOM;
    this.born = performance.now();
    this._targets = [];
    this._lines = [];
    this._lineClock = 0;
    this._symbols = [];
    this._qedFired = false;
  }

  _pos(node, hooks) {
    if (node === 'player') return { x: this.cx, y: this._cy() };
    return { x: hooks.getX(node), y: hooks.getY(node) };
  }

  update(now, enemies, hooks = {}) {
    if (this.phase === PHASE.IDLE) { if (this._flashT > 0) this._flashT -= 16; return; }
    const P = this.cfg.phases;
    const el = now - this.born;
    this._shake *= 0.85;

    // floating math symbols
    if ((this.phase === PHASE.AXIOM || this.phase === PHASE.CONSTRUCT) && Math.random() < 0.25) {
      const S = this.cfg.symbols;
      this._symbols.push({ x: this.cx + (Math.random() - 0.5) * 240, y: this._cy() + 40,
                           ch: S[(Math.random() * S.length) | 0], a: 1, vy: -(30 + Math.random() * 30) / 60 });
    }
    for (const s of this._symbols) { s.y += s.vy; s.a -= 0.011; }
    this._symbols = this._symbols.filter(s => s.a > 0);

    if (this.phase === PHASE.AXIOM) {
      if (el >= P.axiomMs) {
        this.phase = PHASE.CONSTRUCT;
        // lock targets: nearest live enemies (refs — the diagram will FOLLOW them)
        const live = (enemies || []).filter(e => e && (e.hp === undefined || e.hp > 0) && hooks.getX);
        live.sort((a, b) => {
          const da = (hooks.getX(a) - this.cx) ** 2 + (hooks.getY(a) - this._cy()) ** 2;
          const db = (hooks.getX(b) - this.cx) ** 2 + (hooks.getY(b) - this._cy()) ** 2;
          return da - db;
        });
        this._targets = live.slice(0, this.cfg.lines.maxTargets);
      }

    } else if (this.phase === PHASE.CONSTRUCT) {
      this._lineClock -= 16;
      if (this._lineClock <= 0 && this._targets.length) {
        this._lineClock = this.cfg.lines.everyMs;
        // next construction line: player→E1, E1→E2, E2→E3... then random cross-connections
        const n = this._lines.length;
        let a, b;
        if (n === 0) { a = 'player'; b = this._targets[0]; }
        else if (n < this._targets.length) { a = this._targets[n - 1]; b = this._targets[n]; }
        else {
          a = this._targets[(Math.random() * this._targets.length) | 0];
          b = this._targets[(Math.random() * this._targets.length) | 0];
          if (a === b) b = this._targets[(this._targets.indexOf(a) + 1) % this._targets.length];
        }
        if (b) this._lines.push({ a, b, t: 0, struck: false });
      }
      for (const L of this._lines) {
        if (L.t < 1) L.t = Math.min(1, L.t + 16 / this.cfg.lines.drawMs);
        if (L.t >= 1 && !L.struck) {
          L.struck = true;
          this._shake = Math.max(this._shake, 4);
          if (hooks.onStrike) {
            for (const node of [L.a, L.b]) {
              if (node !== 'player' && node && (node.hp === undefined || node.hp > 0)) hooks.onStrike(node, 'line');
            }
          }
        }
      }
      if (el >= P.axiomMs + P.constructMs) this.phase = PHASE.QED;

    } else if (this.phase === PHASE.QED) {
      if (!this._qedFired) {
        this._qedFired = true;
        this._shake = 16;
        if (hooks.onStrike) {
          const proven = new Set();
          for (const L of this._lines) { if (L.a !== 'player') proven.add(L.a); if (L.b !== 'player') proven.add(L.b); }
          for (const e of proven) { if (e && (e.hp === undefined || e.hp > 0)) hooks.onStrike(e, 'qed'); }
        }
      }
      if (el >= P.axiomMs + P.constructMs + P.qedMs) {
        this.phase = PHASE.IDLE;
        this._flashT = 300;
        this._lines = [];
        this._targets = [];
      }
    }
  }

  render(ctx, hooks = {}) {
    const C = this.cfg.color;
    if (this.phase === PHASE.IDLE) {
      if (this._flashT > 0) {
        const a = this._flashT / 300;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.6;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 4 * a;
        ctx.beginPath(); ctx.arc(this.cx, this._cy(), 300 * (1 - a * 0.5), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const el = performance.now() - this.born;
    const P = this.cfg.phases;
    ctx.save();

    // parchment-dark tint — the world becomes the proof sheet
    ctx.fillStyle = 'rgba(2,12,2,0.30)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // AXIOM: compass circle inscribing itself around Euclid
    const circT = Math.min(1, el / P.axiomMs);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
    ctx.shadowColor = C.ink; ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(this.cx, this._cy(), 88, -Math.PI / 2, -Math.PI / 2 + circT * Math.PI * 2); ctx.stroke();
    // compass tick marks
    if (circT >= 1) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + el / 3000;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(this.cx + Math.cos(a) * 82, this._cy() + Math.sin(a) * 82);
        ctx.lineTo(this.cx + Math.cos(a) * 94, this._cy() + Math.sin(a) * 94);
        ctx.stroke();
      }
    }
    ctx.restore();

    // construction lines — dashed "pencil" underlay + glowing ink stroke with a pen-tip spark
    if (hooks.getX) {
      for (const L of this._lines) {
        const pa = this._pos(L.a, hooks), pb = this._pos(L.b, hooks);
        const ex = pa.x + (pb.x - pa.x) * L.t, ey = pa.y + (pb.y - pa.y) * L.t;
        ctx.save();
        ctx.setLineDash([6, 6]);                            // pencil guide (full length, faint)
        ctx.globalAlpha = 0.25; ctx.strokeStyle = C.dim; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'lighter';           // inked portion (draws itself)
        ctx.globalAlpha = 0.9; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
        ctx.shadowColor = C.ink; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(ex, ey); ctx.stroke();
        if (L.t < 1) {                                      // pen tip
          ctx.fillStyle = C.hot;
          ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
        }
        // vertex dots
        for (const p of [pa, pb]) {
          ctx.globalAlpha = 0.8; ctx.fillStyle = C.ink;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }

    // floating math symbols
    ctx.save();
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    for (const s of this._symbols) {
      ctx.globalAlpha = s.a * 0.8;
      ctx.fillStyle = C.ink;
      ctx.shadowColor = C.ink; ctx.shadowBlur = 6;
      ctx.fillText(s.ch, s.x, s.y);
    }
    ctx.restore();

    // QED stamp
    if (this.phase === PHASE.QED) {
      const t = Math.min(1, (el - P.axiomMs - P.constructMs) / P.qedMs);
      const pop = t < 0.3 ? t / 0.3 : 1;
      const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(this.cx, this._cy() - 60);
      ctx.scale(0.6 + 1.9 * (1 - pop) + 0.6 * pop, 0.6 + 1.9 * (1 - pop) + 0.6 * pop);  // slams down
      ctx.font = 'bold 64px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = C.ink; ctx.shadowBlur = 22;
      ctx.fillStyle = C.hot;
      ctx.fillText('Q.E.D.', 0, 0);
      ctx.font = 'bold 46px Georgia, serif';
      ctx.fillText('∎', 0, 52);                        // the tombstone ∎
      ctx.restore();
      // toxin burst ring
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 5 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(this.cx, this._cy(), 40 + t * 420, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
