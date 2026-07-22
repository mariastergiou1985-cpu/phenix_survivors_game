import { Vec2, MATRIX_RADIUS, CYAN_DARK, BLACK, RED, ORANGE, CYAN, WHITE } from '../constants.js';
import { randomRange } from '../utils.js';
import { DataCore, rollCoreType } from './DataCore.js?v=20260705040000';

export const POWER_MATRIX_VISUALS = Object.freeze({
  spriteSize: 58,
  idleSpriteAlpha: 0.40,
  activeSpriteAlpha: 0.82,
  idleRingAlpha: 0.28,
  roleRingWidth: 1.25,
  captureRingWidth: 3,
  roleColors: Object.freeze({ buff: '#ffd447', defence: '#ff5560' }),
});

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const withCanvasState = (ctx, draw) => {
  ctx.save();
  try { return draw(); }
  finally { ctx.restore(); }
};

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
    this.visualProximity = 0;        // 0..1; supplied by the draw caller when available
    this.captureActive   = false;    // visual contract for capture/channel interactions
    this.captureProgress = 0;        // 0..1 capture completion

    this._sprite = new Image();
    this._sprite.onerror = () => console.warn('[Assets] Failed to load: assets/bases/matrix_base.png');
    this._sprite.src = 'assets/bases/matrix_base.png?v=20260615210000';
  }

  hasCore()  { return this.stored > 0; }
  hasSpace() { return this.stored < this.capacity; }

  setVisualState({ proximity = this.visualProximity,
                   captureActive = this.captureActive,
                   captureProgress = this.captureProgress } = {}) {
    this.visualProximity = clamp01(proximity);
    this.captureActive = !!captureActive;
    this.captureProgress = clamp01(captureProgress);
    return this;
  }

  resetVisualState() {
    this.visualProximity = 0;
    this.captureActive = false;
    this.captureProgress = 0;
    this.hackTimer = 0;
    this.flashTimer = 0;
    this.pulseRings.length = 0;
    this._prevStored = this.stored;
  }

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

  // The optional second argument is deliberately backwards-compatible with Game's existing
  // numeric call. A number means proximity 0..1; an object may also provide capture state.
  // Idle is restrained. Additive brightness is reserved for proximity/capture only.
  draw(ctx, visualState = null) {
    const opts = (visualState && typeof visualState === 'object') ? visualState : null;
    const proximity = clamp01(opts?.proximity ??
      (typeof visualState === 'number' ? visualState : this.visualProximity));
    const captureProgress = clamp01(opts?.captureProgress ?? this.captureProgress);
    const captureActive = !!(opts?.captureActive ?? this.captureActive) || captureProgress > 0;
    const interaction = Math.max(proximity, captureActive ? 0.72 : 0);
    const now = performance.now();
    const sz = POWER_MATRIX_VISUALS.spriteSize;
    const bc = this.biomeColors || { full: CYAN, mid: CYAN, depleted: ORANGE };
    const roleColor = this.chaosRole === 'buff'
      ? POWER_MATRIX_VISUALS.roleColors.buff
      : this.chaosRole === 'defence'
        ? POWER_MATRIX_VISUALS.roleColors.defence
        : (bc.full || this.color || CYAN);

    ctx.save();
    try {
      // No idle additive halo. The station brightens only as the player approaches or a
      // capture/channel is active, keeping distant bases from becoming large dark/glowing blobs.
      if (interaction > 0.01) {
        this._drawGlow(ctx, roleColor, 0.14 + interaction * 0.30,
          MATRIX_RADIUS + 6 + interaction * 12);
      }

      // Existing art is retained, reduced from 72px to 58px, and composited translucently so
      // the map remains visible through its dark center. Proximity/capture raises opacity.
      const spriteAlpha = POWER_MATRIX_VISUALS.idleSpriteAlpha
        + (POWER_MATRIX_VISUALS.activeSpriteAlpha - POWER_MATRIX_VISUALS.idleSpriteAlpha) * interaction;
      const spr = this._sprite;
      withCanvasState(ctx, () => {
        ctx.globalAlpha = spriteAlpha;
        if (spr && spr.complete && spr.naturalWidth > 0) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(spr, Math.round(this.pos.x - sz / 2), Math.round(this.pos.y - sz / 2), sz, sz);
        } else {
          ctx.fillStyle = BLACK;
          ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS - 6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = roleColor; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS - 4, 0, Math.PI * 2); ctx.stroke();
        }
      });

      // One thin role-colored perimeter replaces the previous bright double halo. The existing
      // Chaos star/turret markers still render above it; this ring keeps identity at base level.
      withCanvasState(ctx, () => {
        ctx.globalAlpha = POWER_MATRIX_VISUALS.idleRingAlpha + interaction * 0.42;
        ctx.strokeStyle = roleColor;
        ctx.lineWidth = POWER_MATRIX_VISUALS.roleRingWidth + interaction * 0.45;
        ctx.shadowColor = roleColor;
        ctx.shadowBlur = interaction > 0 ? 6 * interaction : 0;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS + 4, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Clean capture read: a quiet full track plus one role-colored progress arc and compact
      // percentage. It exists only while capture/channel state is active.
      if (captureActive) {
        const rr = MATRIX_RADIUS + 10;
        const start = -Math.PI / 2;
        withCanvasState(ctx, () => {
          ctx.lineCap = 'round';
          ctx.lineWidth = POWER_MATRIX_VISUALS.captureRingWidth;
          ctx.strokeStyle = roleColor;
          ctx.globalAlpha = 0.20;
          ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, rr, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 0.92;
          ctx.beginPath();
          ctx.arc(this.pos.x, this.pos.y, rr, start, start + Math.PI * 2 * captureProgress);
          ctx.stroke();
          ctx.font = '11px Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = roleColor;
          ctx.fillText(`CAPTURE ${Math.round(captureProgress * 100)}%`, this.pos.x, this.pos.y - rr - 8);
        });
      }

      // Theft remains a warning, not a permanent source of brightness.
      if (this.hackTimer > 0) {
        const flash = Math.sin(now * 0.02) > 0;
        withCanvasState(ctx, () => {
          ctx.globalAlpha = 0.78;
          ctx.strokeStyle = flash ? RED : ORANGE;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS + 14, 0, Math.PI * 2);
          ctx.stroke();
        });
      }

      // Core insertion feedback stays thin and non-additive.
      for (const r of this.pulseRings) {
        const p = r.t / r.life;
        withCanvasState(ctx, () => {
          ctx.globalAlpha = Math.max(0, 0.65 * (1 - p));
          ctx.strokeStyle = roleColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS + 4 + p * 16, 0, Math.PI * 2);
          ctx.stroke();
        });
      }

      // Hide the full-charge label at distant idle; show it when it carries useful information.
      if (interaction > 0.01 || this.stored < this.capacity || this.hackTimer > 0) {
        const label = `${this.stored}/${this.capacity}`;
        const ly = this.pos.y - sz / 2 - 7;
        const fill = this.stored === 0 ? bc.depleted : roleColor;
        withCanvasState(ctx, () => {
          ctx.globalAlpha = 0.60 + interaction * 0.32;
          ctx.font = '11px Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0,0,0,0.72)';
          ctx.fillText(label, this.pos.x + 1, ly + 1);
          ctx.fillStyle = fill;
          ctx.fillText(label, this.pos.x, ly);
        });
      }
    } finally {
      ctx.restore();
    }
  }

  // Lightweight additive radial glow (one gradient; no full-screen work)
  _drawGlow(ctx, color, alpha, radius) {
    if (alpha <= 0) return;
    withCanvasState(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, alpha);
      const g = ctx.createRadialGradient(this.pos.x, this.pos.y, radius * 0.2, this.pos.x, this.pos.y, radius);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
