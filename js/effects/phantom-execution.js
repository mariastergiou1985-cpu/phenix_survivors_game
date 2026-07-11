/**
 * PhantomExecution — cinematic 4-phase ULTIMATE VFX (Assassin Clone).
 * Canvas 2D, no dependencies. Standard ultimate-module API
 * (trigger / update / render / isActive / getShake / .cx .footY pinning).
 *
 * THE GIMMICK: the iaijutsu trope no survivor game has. She MARKS her victims, blinks
 * between them in untraceable slash-streaks, reappears and SHEATHES the blade — and only
 * on the click of the sheathe do ALL the cuts land at once, in a single simultaneous
 * reckoning. Delay-of-death, fully choreographed.
 *
 *   PHASE 1  MARK      – up to 8 victims get pink execution sigils (rotating reticles)
 *   PHASE 2  EXECUTE   – she vanishes; phantom slash-streaks blink mark → mark (light cut)
 *   PHASE 3  SHEATHE   – she reappears at the start, blade slides home… total silence
 *   PHASE 4  RECKONING – *click* — every mark detonates in a cross-slash simultaneously
 *
 * While isActive() the module owns the player sprite (she vanishes during EXECUTE) —
 * skip the normal player draw.
 */

export const PHANTOM_CONFIG = {
  phases: { markMs: 700, executeMs: 1150, sheatheMs: 550, reckonMs: 420 },
  marks:  { max: 8, radius: 460 },
  streak: { everyMs: 140 },
  color:  { pink: '#ff4dd2', chrome: '#e8ecf4', hot: '#ffffff', glow: 'rgba(255,77,210,' },
};

const PHASE = { IDLE: 0, MARK: 1, EXECUTE: 2, SHEATHE: 3, RECKON: 4 };

export class PhantomExecution {
  constructor(canvas, sprite, opts = {}) {
    this.canvas = canvas;
    this.sprite = sprite;
    this.cfg = PHANTOM_CONFIG;
    this.SW = opts.spriteW || 48; this.SH = opts.spriteH || 64;
    this.phase = PHASE.IDLE;
    this.born = 0; this.cx = 0; this.footY = 0;
    this._marks = [];        // enemy refs (positions re-read via hooks — sigils follow victims)
    this._streaks = [];      // {x1,y1,x2,y2,life,maxLife}
    this._streakClock = 0;
    this._streakIdx = 0;
    this._reckoned = false;
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
    this.phase = PHASE.MARK;
    this.born = performance.now();
    this._marks = [];
    this._streaks = [];
    this._streakClock = 0;
    this._streakIdx = 0;
    this._reckoned = false;
  }

  update(now, enemies, hooks = {}) {
    if (this.phase === PHASE.IDLE) { if (this._flashT > 0) this._flashT -= 16; return; }
    const P = this.cfg.phases;
    const el = now - this.born;
    this._shake *= 0.85;

    for (const s of this._streaks) s.life -= 16;
    this._streaks = this._streaks.filter(s => s.life > 0);

    if (this.phase === PHASE.MARK) {
      if (!this._marks.length && hooks.getX) {   // lock victims once, nearest first
        const R2 = this.cfg.marks.radius ** 2;
        const live = (enemies || []).filter(e => {
          if (!e || (e.hp !== undefined && e.hp <= 0)) return false;
          const dx = hooks.getX(e) - this.cx, dy = hooks.getY(e) - this._cy();
          return dx * dx + dy * dy < R2;
        });
        live.sort((a, b) => {
          const da = (hooks.getX(a) - this.cx) ** 2 + (hooks.getY(a) - this._cy()) ** 2;
          const db = (hooks.getX(b) - this.cx) ** 2 + (hooks.getY(b) - this._cy()) ** 2;
          return da - db;
        });
        this._marks = live.slice(0, this.cfg.marks.max);
      }
      if (el >= P.markMs) this.phase = this._marks.length ? PHASE.EXECUTE : PHASE.SHEATHE;

    } else if (this.phase === PHASE.EXECUTE) {
      this._streakClock -= 16;
      if (this._streakClock <= 0 && hooks.getX) {
        this._streakClock = this.cfg.streak.everyMs;
        const live = this._marks.filter(e => e && (e.hp === undefined || e.hp > 0));
        if (live.length) {
          const from = this._streakIdx === 0
            ? { x: this.cx, y: this._cy() }
            : { x: hooks.getX(live[(this._streakIdx - 1) % live.length]), y: hooks.getY(live[(this._streakIdx - 1) % live.length]) };
          const target = live[this._streakIdx % live.length];
          const to = { x: hooks.getX(target), y: hooks.getY(target) };
          this._streaks.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, life: 240, maxLife: 240 });
          if (hooks.onStrike) hooks.onStrike(target, 'pass');      // light cut per blink
          this._streakIdx++;
          this._shake = Math.max(this._shake, 4);
        }
      }
      if (el >= P.markMs + P.executeMs) this.phase = PHASE.SHEATHE;

    } else if (this.phase === PHASE.SHEATHE) {
      // silence — nothing moves but the sigils breathing
      if (el >= P.markMs + P.executeMs + P.sheatheMs) this.phase = PHASE.RECKON;

    } else if (this.phase === PHASE.RECKON) {
      if (!this._reckoned) {
        this._reckoned = true;
        this._shake = 15;
        if (hooks.onStrike) {
          for (const e of this._marks) {
            if (e && (e.hp === undefined || e.hp > 0)) hooks.onStrike(e, 'reckon');   // the real cut
          }
        }
      }
      if (el >= P.markMs + P.executeMs + P.sheatheMs + P.reckonMs) {
        this.phase = PHASE.IDLE;
        this._flashT = 280;
        this._marks = [];
      }
    }
  }

  _drawSigil(ctx, x, y, t, hot) {
    const C = this.cfg.color;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t / 600);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hot ? C.hot : C.pink;
    ctx.shadowColor = C.pink; ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    const r = 20 + 2 * Math.sin(t / 130);
    // rotating broken ring
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(0, 0, r, a, a + Math.PI * 0.44); ctx.stroke();
    }
    // inner execution X
    ctx.lineWidth = 2.6;
    const k = r * 0.45;
    ctx.beginPath(); ctx.moveTo(-k, -k); ctx.lineTo(k, k); ctx.moveTo(k, -k); ctx.lineTo(-k, k); ctx.stroke();
    ctx.restore();
  }

  render(ctx, hooks = {}) {
    const C = this.cfg.color;
    if (this.phase === PHASE.IDLE) {
      if (this._flashT > 0) {
        const a = this._flashT / 280;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.45;
        ctx.strokeStyle = C.pink; ctx.lineWidth = 3 * a;
        ctx.beginPath(); ctx.arc(this.cx, this._cy(), 260 * (1 - a * 0.5), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const el = performance.now() - this.born;
    const P = this.cfg.phases;
    ctx.save();

    // cold chrome dim — deepest during the sheathe silence
    const dim = this.phase === PHASE.SHEATHE ? 0.45 : 0.30;
    ctx.fillStyle = `rgba(6,2,12,${dim})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // sigils on living marks (they FOLLOW their victims)
    if (hooks.getX) {
      const hot = this.phase === PHASE.SHEATHE || this.phase === PHASE.RECKON;
      for (const e of this._marks) {
        if (!e || (e.hp !== undefined && e.hp <= 0)) continue;
        this._drawSigil(ctx, hooks.getX(e), hooks.getY(e), el, hot);
      }
    }

    // phantom slash streaks
    for (const s of this._streaks) {
      const a = s.life / s.maxLife;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.strokeStyle = C.chrome; ctx.lineWidth = 2.6;
      ctx.shadowColor = C.pink; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = C.pink; ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();
    }

    // RECKONING: simultaneous cross-slash detonations on every mark
    if (this.phase === PHASE.RECKON && hooks.getX) {
      const t = Math.min(1, (el - P.markMs - P.executeMs - P.sheatheMs) / P.reckonMs);
      for (const e of this._marks) {
        if (!e) continue;
        const x = hooks.getX(e), y = hooks.getY(e);
        const len = 26 + t * 64;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = C.hot; ctx.lineWidth = 3.5 * (1 - t) + 1;
        ctx.shadowColor = C.pink; ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(x - len, y - len); ctx.lineTo(x + len, y + len);
        ctx.moveTo(x + len, y - len); ctx.lineTo(x - len, y + len);
        ctx.stroke();
        ctx.restore();
      }
      // white flash on the click
      ctx.fillStyle = `rgba(255,255,255,${0.30 * (1 - t)})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    // the assassin: visible in MARK, GONE in EXECUTE, rematerializes on SHEATHE
    const spr = this.sprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      let a = 1, flicker = 0;
      if (this.phase === PHASE.MARK) { a = 1 - 0.6 * Math.min(1, el / P.markMs); flicker = 1; }
      else if (this.phase === PHASE.EXECUTE) a = 0;
      else {
        const t = Math.min(1, (el - P.markMs - P.executeMs) / 220);
        a = t; flicker = 1 - t;
      }
      if (a > 0) {
        ctx.save();
        ctx.globalAlpha = a * (flicker ? (0.7 + 0.3 * Math.sin(el / 38)) : 1);
        ctx.shadowColor = C.pink; ctx.shadowBlur = 14;
        ctx.drawImage(spr, this.cx - this.SW / 2, this.footY - this.SH, this.SW, this.SH);
        ctx.restore();
      }
      // sheathe glint — a single bright line sweeping down at her side
      if (this.phase === PHASE.SHEATHE) {
        const t = Math.min(1, (el - P.markMs - P.executeMs) / P.sheatheMs);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9 * (1 - Math.abs(2 * t - 1));
        ctx.strokeStyle = C.hot; ctx.lineWidth = 2;
        ctx.shadowColor = C.chrome; ctx.shadowBlur = 10;
        const gy = this.footY - this.SH * (1 - t * 0.8);
        ctx.beginPath(); ctx.moveTo(this.cx + 8, gy - 12); ctx.lineTo(this.cx + 22, gy + 8); ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }
}
