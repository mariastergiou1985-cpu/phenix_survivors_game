import { clamp, drawText } from '../utils.js';

export class FloatingText {
  constructor(text, pos, color, timer = 1.0) {
    this.text  = text;
    this.pos   = pos.clone();
    this.color = color;
    this.timer = timer;
  }

  update(dt) {
    this.timer  -= dt;
    this.pos.y  -= 35 * dt;
  }

  draw(ctx) {
    const alpha = clamp(this.timer, 0, 1);
    ctx.globalAlpha = alpha;
    drawText(ctx, this.text, this.pos.x, this.pos.y, this.color);
    ctx.globalAlpha = 1;
  }
}
