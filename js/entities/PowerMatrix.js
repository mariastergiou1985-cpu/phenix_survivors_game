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

    this._sprite = new Image();
    this._sprite.src = 'assets/bases/matrix_base.png';
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
    // Sprite (replaces all old rings, fill indicator, port marks)
    const spr = this._sprite;
    const sz  = 72;
    if (spr && spr.complete && spr.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, Math.round(this.pos.x - sz / 2), Math.round(this.pos.y - sz / 2), sz, sz);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.strokeStyle = this.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, MATRIX_RADIUS, 0, Math.PI * 2); ctx.stroke();
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

    // Core count label (white + shadow for readability over sprite)
    ctx.font      = '16px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(`${this.stored}/${this.capacity}`, this.pos.x + 1, this.pos.y + 7);
    ctx.fillStyle = 'white';
    ctx.fillText(`${this.stored}/${this.capacity}`, this.pos.x, this.pos.y + 6);
    ctx.textAlign = 'left';
  }
}
