import { Vec2, MATRIX_RADIUS, CYAN_DARK, BLACK, RED, ORANGE, CYAN, WHITE } from '../constants.js';
import { randomRange } from '../utils.js';
import { DataCore, rollCoreType } from './DataCore.js?v=20260614204914';

export class PowerMatrix {
  constructor(pos, color, capacity = 8) {
    this.pos      = pos;
    this.color    = color;
    this.capacity = capacity;
    this.stored   = capacity;
    this.hackTimer = 0.0;
    this.goldChanceBonus = 0;   // Grid Investor card: extra Gold Core chance, set by Game each frame

    // Visual-feedback state (no gameplay impact)
    this.flashTimer  = 0;            // brief cyan/white flash after a core is inserted
    this._prevStored = capacity;     // tracks insertions via the stored delta (slotCore untouched)
    this.pulseRings  = [];           // small expanding rings spawned on insertion

    this._sprite = new Image();
    this._sprite.onerror = () => console.warn('[Assets] Failed to load: assets/bases/matrix_base.png');
    this._sprite.src = 'assets/bases/matrix_base.png?v=20260614204914';
  }

  hasCore()  { return this.stored > 0; }
  hasSpace() { return this.stored < this.capacity; }

  stealCore() {
    if (this.stored <= 0) return null;
    // ROOT-CAUSE FIX: take a whole core's worth of CHARGE out of the matrix. Previously this
    // removed only 1 charge but dropped a 3–5 value core — so every steal MINTED 2–4 extra
    // charge of loot, and at high enemy density that flooded the map with cores. Now the charge
    // removed equals the dropped core's value, so total world-core value can never exceed the
    // matrix deficit. Gold is rarer than silver; the last dregs drop a partial silver.
    let type, value;
    if (this.stored >= 5 && Math.random() < 0.18 + this.goldChanceBonus) { type = 'gold';   value = 5; }
    else if (this.stored >= 3)                     { type = 'silver'; value = 3; }
    else                                           { type = 'silver'; value = this.stored; }
    this.stored -= value;
    const offset = new Vec2(randomRange(-18, 18), randomRange(-18, 18));
    const core   = new DataCore(this.pos.add(offset), type);
    core.value   = value;   // deposit returns exactly the charge taken → economy is conserved
    return core;
  }

  // Deposit a core worth `amount` Matrix-cores (Gold = 5, Silver = 3), capped at capacity.
  slotCore(amount = 1) {
    if (!this.hasSpace()) return false;
    this.stored = Math.min(this.capacity, this.stored + amount);
    return true;
  }

  update(dt) {
    this.hackTimer  = Math.max(0, this.hackTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    // Advance + retire insertion pulse rings
    for (const r of this.pulseRings) r.t += dt;
    if (this.pulseRings.length) this.pulseRings = this.pulseRings.filter(r => r.t < r.life);

    // Detect a core insertion purely from the stored count rising — keeps slotCore() logic intact
    if (this.stored > this._prevStored) {
      this.flashTimer = 0.35;
      this.pulseRings.push({ t: 0, life: 0.45 });
    }
    this._prevStored = this.stored;
  }

  // overloadPct (0–1): only read for danger-blink intensity; never modified here.
  draw(ctx, overloadPct = 0) {
    const f    = this.stored / this.capacity;   // fill ratio 0..1
    const now  = performance.now();
    const sz   = 72;

    // ── 1. Fill-based glow UNDER the sprite (additive radial gradient) ──
    let glowColor, glowAlpha, glowRadius;
    if (this.stored === 0) {
      // Empty / unsafe: very dim, with a red/orange danger blink that intensifies with overload.
      const blink = 0.5 + 0.5 * Math.sin(now * 0.006);
      glowColor   = (Math.sin(now * 0.006) > 0) ? RED : ORANGE;
      glowAlpha   = (0.10 + 0.22 * overloadPct) * blink;
      glowRadius  = MATRIX_RADIUS + 6;
    } else if (f < 0.5) {
      // 1–3/8: weak cyan/blue, base active but low.
      glowColor  = CYAN;
      glowAlpha  = 0.18 + 0.14 * (f / 0.5);          // ~0.18 → 0.32
      glowRadius = MATRIX_RADIUS + 10;
    } else if (this.stored < this.capacity) {
      // 4–7/8: stronger cyan, powered.
      glowColor  = CYAN;
      glowAlpha  = 0.40 + 0.20 * ((f - 0.5) / 0.5);  // ~0.40 → 0.60
      glowRadius = MATRIX_RADIUS + 18;
    } else {
      // 8/8: bright cyan→white with a subtle pulse — clearly full/protected.
      glowColor  = WHITE;
      glowAlpha  = 0.65 + 0.12 * Math.sin(now * 0.005);
      glowRadius = MATRIX_RADIUS + 22;
    }
    this._drawGlow(ctx, glowColor, glowAlpha, glowRadius);

    // Insertion flash: brief cyan/white boost layered on top of the tier glow.
    if (this.flashTimer > 0) {
      const k = this.flashTimer / 0.35;
      this._drawGlow(ctx, WHITE, 0.55 * k, MATRIX_RADIUS + 16 + 10 * k);
    }

    // ── 2. Sprite ──
    const spr = this._sprite;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, Math.round(this.pos.x - sz / 2), Math.round(this.pos.y - sz / 2), sz, sz);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.strokeStyle = this.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS, 0, Math.PI * 2); ctx.stroke();
    }

    // ── 3. Hack warning ring (flashes when an enemy is actively stealing) ──
    if (this.hackTimer > 0) {
      const flash     = Math.sin(now * 0.02) > 0;
      const ringColor = flash ? RED : ORANGE;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS + 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS + 24, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── 4. Insertion pulse rings (thin, expanding, fading) ──
    for (const r of this.pulseRings) {
      const p = r.t / r.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.strokeStyle = CYAN;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS + p * 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── 5. Core-count label ABOVE the base (small, readable, state-tinted) ──
    const label = `${this.stored}/${this.capacity}`;
    const ly    = this.pos.y - sz / 2 - 8;
    let fill    = 'white';
    if (this.stored === 0)            fill = '#ff7a3c';   // orange/red danger
    else if (this.stored >= this.capacity) fill = '#bffcff'; // cyan-white when full
    ctx.font      = '15px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillText(label, this.pos.x + 1, ly + 1);
    ctx.fillStyle = fill;
    ctx.fillText(label, this.pos.x, ly);
    ctx.textAlign = 'left';
  }

  // Lightweight additive radial glow (one gradient; no full-screen work)
  _drawGlow(ctx, color, alpha, radius) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    const g = ctx.createRadialGradient(this.pos.x, this.pos.y, radius * 0.2, this.pos.x, this.pos.y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
