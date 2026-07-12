import { Vec2, MATRIX_RADIUS, CYAN_DARK, BLACK, RED, ORANGE, CYAN, WHITE } from '../constants.js';
import { randomRange } from '../utils.js';
import { DataCore, rollCoreType } from './DataCore.js?v=20260705040000';

export class PowerMatrix {
  constructor(pos, color, capacity = 6) {
    this.pos      = pos;
    this.color    = color;
    this.capacity = capacity;
    this.stored   = capacity;
    this.hackTimer = 0.0;
    this.goldChanceBonus = 0;   // Grid Investor card: extra Gold Core chance, set by Game each frame
    this.biomeId  = null;       // assigned by NexusManager — which biome this Nexus belongs to

    // Visual-feedback state (no gameplay impact)
    this.flashTimer  = 0;            // brief cyan/white flash after a core is inserted
    this._prevStored = capacity;     // tracks insertions via the stored delta (slotCore untouched)
    this.pulseRings  = [];           // small expanding rings spawned on insertion

    this._sprite = new Image();
    this._sprite.onerror = () => console.warn('[Assets] Failed to load: assets/bases/matrix_base.png');
    this._sprite.src = 'assets/bases/matrix_base.png?v=20260615210000';
  }

  hasCore()  { return this.stored > 0; }
  hasSpace() { return this.stored < this.capacity; }

  stealCore(goldBonus = 0) {
    // RE-ENABLED (defense loop, Maria 2026-07-12): thieves pull a core out of the
    // base — the player hunts them down, recovers the dropped core and returns it.
    if (this.stored <= 0) return null;
    const gold = Math.random() < 0.22 + goldBonus;
    const val  = Math.min(gold ? 5 : 3, this.stored);
    this.stored -= val;
    this.hackTimer = 0.9;                 // warning flash on the base
    return { type: gold && val === 5 ? 'gold' : 'silver', value: val };
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
    if (this.pulseRings.length) { const _a = this.pulseRings; let _w = 0; for (let _i = 0; _i < _a.length; _i++) { const r = _a[_i]; if (r.t < r.life) _a[_w++] = r; } _a.length = _w; }

    // Detect a core insertion purely from the stored count rising — keeps slotCore() logic intact
    if (this.stored > this._prevStored) {
      this.flashTimer = 0.35;
      this.pulseRings.push({ t: 0, life: 0.45 });
    }
    this._prevStored = this.stored;
  }

  // Biome-aware glow: uses this.biomeColors when set by NexusManager,
  // otherwise falls back to legacy CYAN/WHITE palette.
  draw(ctx) {
    const f    = this.stored / this.capacity;   // fill ratio 0..1
    const now  = performance.now();
    const sz   = 72;

    // Biome color palette (fallback to legacy if not assigned)
    const bc = this.biomeColors || { full: CYAN, mid: CYAN, depleted: ORANGE };

    // ── 1. Fill-based glow UNDER the sprite (additive radial gradient) ──
    let glowColor, glowAlpha, glowRadius;
    if (this.stored === 0) {
      // Depleted: dim biome depleted tone with slow pulse
      const blink = 0.5 + 0.5 * Math.sin(now * 0.004);
      glowColor   = bc.depleted;
      glowAlpha   = 0.12 * blink;
      glowRadius  = MATRIX_RADIUS + 6;
    } else if (f < 0.5) {
      // Low charge: mid biome color, weak glow
      glowColor  = bc.mid;
      glowAlpha  = 0.18 + 0.14 * (f / 0.5);          // ~0.18 → 0.32
      glowRadius = MATRIX_RADIUS + 10;
    } else if (this.stored < this.capacity) {
      // Partial charge: mid→full blend region, stronger glow
      glowColor  = bc.mid;
      glowAlpha  = 0.40 + 0.20 * ((f - 0.5) / 0.5);  // ~0.40 → 0.60
      glowRadius = MATRIX_RADIUS + 18;
    } else {
      // Full: bright biome primary with subtle pulse
      glowColor  = bc.full;
      glowAlpha  = 0.65 + 0.12 * Math.sin(now * 0.005);
      glowRadius = MATRIX_RADIUS + 22;
    }
    this._drawGlow(ctx, glowColor, glowAlpha, glowRadius);

    // ── BRIGHT PERIMETER RING (Maria: bases need a clearly visible rim) ──
    // Double ring in the biome color: crisp bright inner line + soft outer halo,
    // with a slow rotating highlight arc so the base reads even in dark biomes.
    {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rr = MATRIX_RADIUS + 12;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = glowColor; ctx.lineWidth = 2.4;
      ctx.shadowColor = glowColor; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, rr + 4, 0, Math.PI * 2); ctx.stroke();
      // rotating white highlight arc
      const ha = now * 0.0016;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, rr, ha, ha + 0.9); ctx.stroke();
      ctx.restore();
    }

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
      ctx.strokeStyle = bc.full;
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
    if (this.stored === 0)            fill = bc.depleted;
    else if (this.stored >= this.capacity) fill = bc.full;
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
