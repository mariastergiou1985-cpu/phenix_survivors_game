import { Vec2, MATRIX_RADIUS, CYAN_DARK, BLACK, RED, ORANGE } from '../constants.js';
import { randomRange } from '../utils.js';
import { DataCore } from './DataCore.js';

export class PowerMatrix {
  constructor(pos, color, capacity = 8) {
    this.pos      = pos;
    this.color    = color;
    this.capacity = capacity;
    this.stored   = capacity;
    this.hackTimer = 0.0;
  }

  hasCore()  { return this.stored > 0; }
  hasSpace() { return this.stored < this.capacity; }

  stealCore() {
    if (this.stored <= 0) return null;
    this.stored--;
    const offset = new Vec2(randomRange(-18, 18), randomRange(-18, 18));
    return new DataCore(this.pos.add(offset), this.color);
  }

  slotCore() {
    if (this.hasSpace()) { this.stored++; return true; }
    return false;
  }

  update(dt) {
    this.hackTimer = Math.max(0, this.hackTimer - dt);
  }

  draw(ctx) {
    const pulse  = 1 + 0.1 * Math.sin(performance.now() * 0.006);
    const radius = Math.round(MATRIX_RADIUS * pulse);

    // Outer pulsing ring
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner accent ring
    ctx.strokeStyle = CYAN_DARK;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS - 8, 0, Math.PI * 2);
    ctx.stroke();

    // Fill indicator
    const fillRatio = this.stored / this.capacity;
    const innerR    = Math.round((MATRIX_RADIUS - 12) * fillRatio);
    if (innerR > 3) {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, innerR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Port marks (6 equidistant ticks around the ring)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const inner = MATRIX_RADIUS + 4;
      const outer = MATRIX_RADIUS + 10;
      ctx.strokeStyle = this.color;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(this.pos.x + Math.cos(angle) * inner, this.pos.y + Math.sin(angle) * inner);
      ctx.lineTo(this.pos.x + Math.cos(angle) * outer, this.pos.y + Math.sin(angle) * outer);
      ctx.stroke();
    }

    // Hack warning ring (flashes when enemy is actively stealing)
    if (this.hackTimer > 0) {
      const flash     = Math.sin(performance.now() * 0.02) > 0;
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

    // Core count label
    ctx.fillStyle = BLACK;
    ctx.font      = '16px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.stored}/${this.capacity}`, this.pos.x, this.pos.y + 6);
    ctx.textAlign = 'left';
  }
}
