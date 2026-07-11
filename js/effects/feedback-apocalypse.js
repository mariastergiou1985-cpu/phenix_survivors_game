/**
 * FeedbackApocalypse — cinematic 4-phase ULTIMATE VFX (Eddie, thunder guitarist).
 * Canvas 2D, no dependencies. API-compatible with the other ultimate modules
 * (trigger / update / render / isActive / getShake / .cx .footY pinning).
 *
 * THE GIMMICK: everything runs on a BEAT CLOCK (150ms). The sound of his guitar becomes
 * VISIBLE — expanding rings are drawn as actual guitar WAVEFORMS (sinusoidal radial
 * modulation), and lightning lands ON the beat, like the riff is striking the ground.
 *
 *   PHASE 1  POWER CHORD – Eddie plants; red speaker-cone thumps pulse out of him
 *   PHASE 2  SOUNDWAVES  – waveform rings travel outward; each ring STRIKES what it crosses
 *   PHASE 3  SOLO STORM  – jagged red/gold lightning bolts land on enemies, on the beat
 *   PHASE 4  AMP BLOWOUT – final chord: giant feedback ring + white-hot flash
 *
 * While isActive() the module draws Eddie itself — skip the normal player draw.
 */

export const FEEDBACK_CONFIG = {
  phases: { chordMs: 500, wavesMs: 1400, soloMs: 1250, blowoutMs: 500 },
  beat:   { ms: 150 },
  waves:  { count: 4, speed: 340, hitBand: 46, ampl: 9, teeth: 26 },   // waveform ring params
  bolts:  { everyMs: 150, maxPerBeat: 2, segs: 7, shake: 12 },
  flash:  { maxRadius: 380, shake: 20 },
  color:  { red: '#ff2d2d', gold: '#ffb43c', hot: '#fff2a8', glow: 'rgba(255,45,45,' },
};

const PHASE = { IDLE: 0, CHORD: 1, WAVES: 2, SOLO: 3, BLOWOUT: 4 };

export class FeedbackApocalypse {
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;
    this.cfg = FEEDBACK_CONFIG;
    this.SW = opts.spriteW || sprite.naturalWidth || 48;
    this.SH = opts.spriteH || sprite.naturalHeight || 64;
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._waves = [];       // {r, struck:Set}
    this._bolts = [];       // {pts:[{x,y}], life, maxLife, gold}
    this._boltClock = 0;
    this._shake = 0;
    this._flashT = 0;
    this._waveSeed = 0;
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
    this.phase = PHASE.CHORD;
    this.born = performance.now();
    this._waves = [];
    this._bolts = [];
    this._boltClock = 0;
    this._waveSeed = Math.random() * 1000;
  }

  _spawnBolt(x, y, gold) {
    const pts = [];
    let px = x + (Math.random() - 0.5) * 90, py = -20;   // from the sky
    const n = this.cfg.bolts.segs;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({ x: px + (x - px) * t + (Math.random() - 0.5) * 34 * (1 - t), y: py + (y - py) * t });
    }
    pts[pts.length - 1] = { x, y };
    this._bolts.push({ pts, life: 200, maxLife: 200, gold });
    if (this._bolts.length > 18) this._bolts.shift();
  }

  update(now, enemies, hooks = {}) {
    if (this.phase === PHASE.IDLE) { if (this._flashT > 0) this._flashT -= 16; return; }
    const P = this.cfg.phases;
    const el = now - this.born;
    this._shake *= 0.86;
    const beatPulse = 1 - ((el % this.cfg.beat.ms) / this.cfg.beat.ms);   // 1 → 0 sawtooth per beat

    for (const b of this._bolts) b.life -= 16;
    this._bolts = this._bolts.filter(b => b.life > 0);

    if (this.phase === PHASE.CHORD) {
      if (beatPulse > 0.9) this._shake = Math.max(this._shake, 4);        // bass thump on the beat
      if (el >= P.chordMs) {
        this.phase = PHASE.WAVES;
        // launch the waveform rings, one per beat-ish, staggered radii
        for (let i = 0; i < this.cfg.waves.count; i++) this._waves.push({ r: -i * 95, struck: new Set() });
      }

    } else if (this.phase === PHASE.WAVES) {
      const HB = this.cfg.waves.hitBand;
      for (const w of this._waves) {
        w.r += this.cfg.waves.speed * 0.016;
        if (w.r <= 0 || !hooks.onStrike || !hooks.getX) continue;
        for (const e of enemies || []) {
          if (!e || (e.hp !== undefined && e.hp <= 0) || w.struck.has(e)) continue;
          const ex = hooks.getX(e), ey = hooks.getY(e);
          const d = Math.hypot(ex - this.cx, ey - this._cy());
          if (Math.abs(d - w.r) < HB) {                     // the ring CROSSED this enemy
            w.struck.add(e);
            hooks.onStrike(e, 'wave');
            this._shake = Math.max(this._shake, 5);
          }
        }
      }
      if (el >= P.chordMs + P.wavesMs) { this.phase = PHASE.SOLO; this._boltClock = 0; }

    } else if (this.phase === PHASE.SOLO) {
      this._boltClock -= 16;
      if (this._boltClock <= 0) {
        this._boltClock = this.cfg.bolts.everyMs;           // ON THE BEAT
        const live = (enemies || []).filter(e => e && (e.hp === undefined || e.hp > 0));
        let n = Math.min(this.cfg.bolts.maxPerBeat, Math.max(1, live.length));
        for (let i = 0; i < n; i++) {
          const e = live.length ? live[(Math.random() * live.length) | 0] : null;
          let x = this.cx + (Math.random() - 0.5) * 500, y = this._cy() + (Math.random() - 0.5) * 300;
          if (e && hooks.getX) { x = hooks.getX(e); y = hooks.getY(e); }
          this._spawnBolt(x, y, Math.random() < 0.35);
          if (e && hooks.onStrike) hooks.onStrike(e, 'bolt');
        }
        this._shake = Math.max(this._shake, this.cfg.bolts.shake * 0.6);
      }
      if (el >= P.chordMs + P.wavesMs + P.soloMs) this.phase = PHASE.BLOWOUT;

    } else if (this.phase === PHASE.BLOWOUT) {
      const t0 = P.chordMs + P.wavesMs + P.soloMs;
      if (el >= t0 + P.blowoutMs) {
        this.phase = PHASE.IDLE;
        this._flashT = 340;
        this._shake = this.cfg.flash.shake;
        this._waves = [];
      }
    }
  }

  // A ring drawn as a guitar WAVEFORM — radius modulated by a sin "signal" around the circle.
  _waveformRing(ctx, r, alpha, width, color) {
    if (r <= 4) return;
    const T = this.cfg.waves.teeth, A = this.cfg.waves.ampl * Math.min(1, r / 120);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.beginPath();
    const cy = this._cy();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const mod = Math.sin(a * T + this._waveSeed + r * 0.05) * A;
      const rr = r + mod;
      const x = this.cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.9;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  render(ctx) {
    const C = this.cfg.color;
    if (this.phase === PHASE.IDLE) {
      if (this._flashT > 0) {
        const a = this._flashT / 340;
        const r = this.cfg.flash.maxRadius * (1 - a * 0.7);
        this._waveformRing(ctx, r, a * 0.9, 5, C.red);
        this._waveformRing(ctx, r * 0.8, a * 0.5, 3, C.gold);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.25; ctx.fillStyle = C.hot;
        ctx.beginPath(); ctx.arc(this.cx, this._cy(), r * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      return;
    }

    const el = performance.now() - this.born;
    const beat = 1 - ((el % this.cfg.beat.ms) / this.cfg.beat.ms);
    ctx.save();

    // hot red stage-light tint, pumping with the beat
    ctx.fillStyle = `rgba(20,0,0,${0.22 + 0.10 * beat})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // waveform rings
    if (this.phase === PHASE.WAVES || this.phase === PHASE.SOLO) {
      for (const w of this._waves) {
        if (w.r <= 0) continue;
        const fade = Math.max(0, 1 - w.r / 620);
        this._waveformRing(ctx, w.r, 0.75 * fade, 3.5, C.red);
        this._waveformRing(ctx, w.r - 12, 0.35 * fade, 2, C.gold);
      }
    }

    // lightning bolts
    for (const b of this._bolts) {
      const a = b.life / b.maxLife;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.strokeStyle = b.gold ? C.gold : C.red;
      ctx.lineWidth = 3;
      ctx.shadowColor = b.gold ? C.gold : C.red; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (const p of b.pts) ctx.lineTo(p.x + (Math.random() - 0.5) * 3, p.y);
      ctx.stroke();
      ctx.globalAlpha = a * 0.6; ctx.lineWidth = 1.2; ctx.strokeStyle = C.hot;
      ctx.stroke();
      // impact flash at the tip
      const tip = b.pts[b.pts.length - 1];
      ctx.globalAlpha = a * 0.8; ctx.fillStyle = C.hot;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 7 * a + 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Eddie — beat-pumped scale (he IS the amp), red rim
    const spr = this.sprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      const pump = 1 + 0.08 * beat;
      ctx.save();
      ctx.translate(this.cx, this.footY);
      ctx.scale(pump, pump);
      ctx.shadowColor = C.red; ctx.shadowBlur = 16 * beat + 6;
      ctx.drawImage(spr, -this.SW / 2, -this.SH, this.SW, this.SH);
      ctx.restore();
      // speaker-cone thump rings right at his feet during the chord
      if (this.phase === PHASE.CHORD) {
        this._waveformRing(ctx, 40 + 60 * (1 - beat), 0.8 * beat, 3, C.red);
      }
    }

    ctx.restore();
  }
}
