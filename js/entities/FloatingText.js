import { clamp, drawText } from '../utils.js';

export class FloatingText {
  // size  — font size in px (default 14 = standard, 18 = heavy hit, 22 = crit/boss)
  // rise  — upward speed px/s (default 35; heavy hits use 55 so they clear the crowd faster)
  constructor(text, pos, color, timer = 1.0, size = 14, rise = 35) {
    this.text  = text;
    this.pos   = pos.clone();
    this.color = color;
    this.timer = timer;
    this.size  = size;
    this.rise  = rise;
  }

  update(dt) {
    this.timer  -= dt;
    this.pos.y  -= this.rise * dt;
  }

  draw(ctx) {
    const alpha = clamp(this.timer, 0, 1);
    ctx.globalAlpha = alpha;
    drawText(ctx, this.text, this.pos.x, this.pos.y, this.color,
      `${this.size}px Consolas, monospace`);
    ctx.globalAlpha = 1;
  }
}
