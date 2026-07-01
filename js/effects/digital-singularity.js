/**
 * DigitalSingularity — cinematic 4-phase ULTIMATE VFX for HTML5 Canvas games.
 * Framework-agnostic, no dependencies, no getImageData. Owns a phase state machine:
 *
 *   PHASE 1  DISSOLVE   – the character pixel-dissolves (noise matrix) to invisible
 *   PHASE 2  STORM      – screen darkens ~40%, blue data particles (bits/code/squares) swarm
 *   PHASE 3  STRIKE     – laser-thin blue lines slash through enemies + screen shake
 *   PHASE 4  REFORM     – dissolve reverses, character snaps back with a neon flash blast
 *
 * IMPORTANT: while the ult is active the module draws the character itself (dissolving /
 * reforming), so your game should SKIP its normal player draw while `ult.isActive()`.
 *
 * ── Wiring ────────────────────────────────────────────────────────────────
 *   import { DigitalSingularity } from './digital-singularity.js';
 *   const ult = new DigitalSingularity(canvas, playerSprite, { spriteW:150, spriteH:300 });
 *
 *   // activate the ultimate (cx = player center x, footY = player foot/bottom y):
 *   ult.trigger(player.x, player.footY);
 *
 *   // each frame, pass enemies so phase 3 can target them:
 *   ult.update(performance.now(), enemies, {
 *     getX: e => e.x, getY: e => e.y,
 *     onStrike: e => { e.hp -= 40; },     // YOUR damage hook, called per laser hit
 *   });
 *
 *   // render — apply the screen shake to your WHOLE scene:
 *   const s = ult.getShake();
 *   ctx.save(); ctx.translate(s.x, s.y);
 *   drawBackground(ctx); drawEnemies(ctx);
 *   if (!ult.isActive()) drawPlayer(ctx);   // module owns the player during the ult
 *   ult.render(ctx);
 *   ctx.restore();
 */

export const DEFAULT_CONFIG = {
  phases:   { dissolveMs: 600, stormMs: 1400, strikeMs: 1200, reformMs: 750 },
  dissolve: { cell: 7, edgeBand: 0.10, shardChance: 0.18 }, // grid cell px, glowing edge width, % cells that fly off
  storm:    { max: 80, darken: 0.4, sizeMin: 2, sizeMax: 6, speed: 3.4, codeChance: 0.5 },
  strike:   { intervalMs: 200, life: 90, shake: 15 },        // laser cadence, laser lifetime, shake impulse
  flash:    { maxRadius: 360, burst: 30, shake: 22 },        // reform blast
  color:    { hue: 200, sat: 100, light: 62 },               // electric blue; one dial recolors everything
};

const PHASE = { IDLE: 0, DISSOLVE: 1, STORM: 2, STRIKE: 3, REFORM: 4 };

export class DigitalSingularity {
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;
    this.cfg = mergeConfig(DEFAULT_CONFIG, opts);
    this.SW = opts.spriteW || sprite.naturalWidth || sprite.width;
    this.SH = opts.spriteH || sprite.naturalHeight || sprite.height;

    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;

    this._buf = document.createElement('canvas');   // dissolve scratch
    this._bctx = this._buf.getContext('2d');
    this._cells = [];                                // {gx,gy,thr,gone}
    this._particles = [];                            // storm data
    this._lasers = [];                               // {a,b,born,life}
    this._flash = null;                              // {born}
    this._shakeAmp = 0;
    this._lastStrike = 0;
    this._stormAlpha = 0;

    this._buildCells();
  }

  isActive() { return this.phase !== PHASE.IDLE; }
  phaseName() { return ['idle', 'dissolve', 'storm', 'strike', 'reform'][this.phase]; }

  _buildCells() {
    const c = this.cfg.dissolve.cell;
    this._cols = Math.ceil(this.SW / c);
    this._rows = Math.ceil(this.SH / c);
    this._cells = [];
    for (let gy = 0; gy < this._rows; gy++)
      for (let gx = 0; gx < this._cols; gx++)
        this._cells.push({ gx, gy, thr: Math.random(), gone: false });
  }

  _neon(a = 1, l = this.cfg.color.light) {
    return `hsla(${this.cfg.color.hue},${this.cfg.color.sat}%,${l}%,${a})`;
  }

  /** Fire the ultimate at the player's position. */
  trigger(cx, footY) {
    this.phase = PHASE.DISSOLVE;
    this.born = performance.now();
    this.cx = cx; this.footY = footY;
    this._particles.length = 0;
    this._lasers.length = 0;
    this._flash = null;
    this._shakeAmp = 0;
    this._stormAlpha = 0;
    this._lastStrike = 0;
    for (const cell of this._cells) cell.gone = false;
  }

  // ── phase clock ──────────────────────────────────────────────────────────
  _resolvePhase(now) {
    const P = this.cfg.phases;
    let e = now - this.born;
    if (e < P.dissolveMs) return { phase: PHASE.DISSOLVE, t: e / P.dissolveMs };
    e -= P.dissolveMs;
    if (e < P.stormMs) return { phase: PHASE.STORM, t: e / P.stormMs };
    e -= P.stormMs;
    if (e < P.strikeMs) return { phase: PHASE.STRIKE, t: e / P.strikeMs };
    e -= P.strikeMs;
    if (e < P.reformMs) return { phase: PHASE.REFORM, t: e / P.reformMs };
    return { phase: PHASE.IDLE, t: 1 };
  }

  update(now, enemies, opts) {
    this._now = now;
    if (this.phase === PHASE.IDLE) return;

    const { phase, t } = this._resolvePhase(now);
    this.phase = phase;
    this._t = t;
    if (phase === PHASE.IDLE) { this._endParticles(now); this._stepFX(now); return; }

    // ── PHASE 1: dissolve — pop cells past threshold, spit out shards ──
    if (phase === PHASE.DISSOLVE) {
      for (const cell of this._cells) {
        if (!cell.gone && cell.thr < t) {
          cell.gone = true;
          if (Math.random() < this.cfg.dissolve.shardChance) this._spawnShard(cell, now);
        }
      }
    }

    // ── darken envelope (in over storm, hold, out over reform) ──
    if (phase === PHASE.STORM)  this._stormAlpha = Math.min(1, t * 4);
    if (phase === PHASE.STRIKE) this._stormAlpha = 1;
    if (phase === PHASE.REFORM) this._stormAlpha = Math.max(0, 1 - t * 1.4);

    // ── storm spawning (phases 2 & 3) ──
    if (phase === PHASE.STORM || phase === PHASE.STRIKE) {
      const want = this.cfg.storm.max;
      let _sg = 0; while (this._particles.length < want && _sg++ < want + 8) this._spawnStorm(now);
    }

    // ── PHASE 3: laser strikes + shake ──
    if (phase === PHASE.STRIKE) {
      if (now - this._lastStrike >= this.cfg.strike.intervalMs) {
        this._lastStrike = now;
        this._spawnLaser(now, enemies, opts);
      }
    }

    // ── PHASE 4: reform — trigger the flash blast once at the start ──
    if (phase === PHASE.REFORM && !this._flash) {
      this._flash = { born: now };
      this._shakeAmp = Math.max(this._shakeAmp, this.cfg.flash.shake);
      this._spawnFlashBurst(now);
    }

    this._stepFX(now);
  }

  _stepFX(now) {
    // particles
    const W = this.canvas.width, H = this.canvas.height;
    for (const p of this._particles) {
      p.x += p.vx; p.y += p.vy;
      // wrap to keep the storm full
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
      p.tw = (p.tw + p.twSpd) % (Math.PI * 2);
    }
    // lasers
    this._lasers = this._lasers.filter(l => now - l.born < l.life);
    // shake decay
    this._shakeAmp *= 0.86;
    if (this._shakeAmp < 0.2) this._shakeAmp = 0;
  }

  _endParticles() { this._particles.length = 0; this._lasers.length = 0; this._flash = null; this._shakeAmp = 0; }

  // ── spawners ───────────────────────────────────────────────────────────
  _spawnShard(cell, now) {
    const c = this.cfg.dissolve.cell;
    const x = this.cx - this.SW / 2 + cell.gx * c, y = this.footY - this.SH + cell.gy * c;
    const ang = Math.random() * Math.PI * 2, spd = 1 + Math.random() * 2.5;
    this._particles.push({
      type: 'square', x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1,
      size: c, char: '', tw: Math.random() * 6, twSpd: 0.2 + Math.random() * 0.3,
    });
  }
  _spawnStorm(now) {
    const S = this.cfg.storm, W = this.canvas.width, H = this.canvas.height;
    const isCode = Math.random() < S.codeChance;
    const ang = Math.random() * Math.PI * 2;
    const spd = S.speed * (0.3 + Math.random());
    const p = {
      x: Math.random() * W, y: Math.random() * H,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      tw: Math.random() * 6, twSpd: 0.1 + Math.random() * 0.4,
    };
    if (isCode) {
      const r = Math.random();
      p.type = r < 0.5 ? 'bit' : 'code';
      p.char = p.type === 'bit'
        ? (Math.random() < 0.5 ? '0' : '1')
        : Array.from({ length: 3 + (Math.random() * 4 | 0) }, () => (Math.random() < 0.5 ? '0' : '1')).join('');
      p.size = 9 + Math.random() * 7;
      p.vy = Math.abs(p.vy) * 1.4 + 1; // code rains downward (matrix feel)
    } else {
      p.type = 'square';
      p.size = S.sizeMin + Math.random() * (S.sizeMax - S.sizeMin);
    }
    this._particles.push(p);
  }
  _spawnLaser(now, enemies, opts) {
    const W = this.canvas.width, H = this.canvas.height;
    let px, py, target = null;
    if (enemies && enemies.length && opts) {
      target = enemies[(Math.random() * enemies.length) | 0];
      px = opts.getX(target); py = opts.getY(target);
      if (opts.onStrike) opts.onStrike(target);
    } else { px = Math.random() * W; py = Math.random() * H; }
    // a screen-spanning line through (px,py) at a random angle
    const ang = Math.random() * Math.PI;
    const dx = Math.cos(ang) * 2000, dy = Math.sin(ang) * 2000;
    this._lasers.push({ a: { x: px - dx, y: py - dy }, b: { x: px + dx, y: py + dy }, born: now, life: this.cfg.strike.life });
    this._shakeAmp = Math.max(this._shakeAmp, this.cfg.strike.shake);
  }
  _spawnFlashBurst(now) {
    for (let i = 0; i < this.cfg.flash.burst; i++) {
      const ang = Math.random() * Math.PI * 2, spd = 2 + Math.random() * 5;
      this._particles.push({
        type: 'square', x: this.cx, y: this.footY - this.SH / 2,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        size: 2 + Math.random() * 5, char: '', tw: 0, twSpd: 0.3,
      });
    }
  }

  /** Random screen-shake offset to apply to the whole scene. */
  getShake() {
    if (this._shakeAmp <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * 2 * this._shakeAmp, y: (Math.random() - 0.5) * 2 * this._shakeAmp };
  }

  // ── render ───────────────────────────────────────────────────────────────
  render(ctx) {
    if (this.phase === PHASE.IDLE) return;
    const now = this._now ?? performance.now();

    // 1. darken
    if (this._stormAlpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(2,4,10,${this.cfg.storm.darken * this._stormAlpha})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
    // 2. dissolving / reforming character
    if (this.phase === PHASE.DISSOLVE) this._drawCharacter(ctx, this._t, false);
    else if (this.phase === PHASE.REFORM) this._drawCharacter(ctx, 1 - this._t, true);
    // 3. storm particles
    this._drawStorm(ctx);
    // 4. lasers
    this._drawLasers(ctx, now);
    // 5. reform flash blast
    this._drawFlash(ctx, now);
  }

  _drawCharacter(ctx, progress, reform) {
    const buf = this._buf, b = this._bctx, c = this.cfg.dissolve.cell;
    buf.width = this.SW; buf.height = this.SH;
    b.clearRect(0, 0, this.SW, this.SH);
    b.drawImage(this.sprite, 0, 0, this.SW, this.SH);
    // carve away dissolved cells
    b.globalCompositeOperation = 'destination-out';
    b.fillStyle = '#000';
    for (const cell of this._cells) {
      const hidden = reform ? cell.thr > progress : cell.thr < progress;
      if (hidden) b.fillRect(cell.gx * c, cell.gy * c, c, c);
    }
    // glowing blue edge on cells right at the dissolve front
    b.globalCompositeOperation = 'source-atop';
    b.fillStyle = this._neon(0.9, 78);
    const lo = progress - this.cfg.dissolve.edgeBand, hi = progress + this.cfg.dissolve.edgeBand;
    for (const cell of this._cells) {
      if (cell.thr > lo && cell.thr < hi) b.fillRect(cell.gx * c, cell.gy * c, c, c);
    }
    b.globalCompositeOperation = 'source-over';
    ctx.drawImage(buf, this.cx - this.SW / 2, this.footY - this.SH);
  }

  _drawStorm(ctx) {
    if (!this._particles.length || this._stormAlpha <= 0 && this.phase !== PHASE.DISSOLVE) {
      // still show dissolve shards in phase 1 even before darken
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = this._neon(1); ctx.shadowBlur = 0;   // perf: shadowBlur over ~170 text particles was a major per-frame cost
    ctx.textBaseline = 'middle';
    const baseA = Math.max(this._stormAlpha, this.phase === PHASE.DISSOLVE ? 0.6 : 0);
    for (const p of this._particles) {
      const a = baseA * (0.55 + 0.45 * Math.sin(p.tw)); // twinkle
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      if (p.type === 'square') {
        ctx.fillStyle = this._neon(1, 70);
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = this._neon(1, 72);
        ctx.font = `${p.size | 0}px ui-monospace, monospace`;
        ctx.fillText(p.char, p.x, p.y);
      }
    }
    ctx.restore();
  }

  _drawLasers(ctx, now) {
    if (!this._lasers.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = this._neon(1); ctx.shadowBlur = 16;
    for (const l of this._lasers) {
      const t = (now - l.born) / l.life; if (t >= 1) continue;
      const a = 1 - t;
      ctx.strokeStyle = this._neon(0.5 * a, 60); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
      ctx.strokeStyle = this._neon(a, 96); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
    }
    ctx.restore();
  }

  _drawFlash(ctx, now) {
    if (!this._flash) return;
    const dur = this.cfg.phases.reformMs;
    const t = (now - this._flash.born) / dur; if (t >= 1) { return; }
    const cx = this.cx, cy = this.footY - this.SH / 2;
    const r = this.cfg.flash.maxRadius * t;
    const a = 1 - t;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
    g.addColorStop(0, this._neon(0.9 * a, 96));
    g.addColorStop(0.4, this._neon(0.5 * a, 70));
    g.addColorStop(1, this._neon(0, 60));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
    // bright rim
    ctx.strokeStyle = this._neon(a, 96); ctx.lineWidth = 3; ctx.shadowColor = this._neon(1); ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function mergeConfig(base, opts) {
  const out = JSON.parse(JSON.stringify(base));
  for (const k of Object.keys(base)) if (opts[k]) Object.assign(out[k], opts[k]);
  return out;
}
