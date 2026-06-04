import { WIDTH, HEIGHT, YELLOW, WHITE, GREY } from '../constants.js';
import { drawText, wrapText, roundRect } from '../utils.js';

export class UpgradeUI {
  constructor(choices) {
    this.choices = choices;

    const cardW  = 220;
    const cardH  = 320;
    const gap    = 30;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (WIDTH  - totalW) / 2;
    const startY = (HEIGHT - cardH)  / 2;

    this.cardRects = choices.map((_, i) => ({
      x: startX + i * (cardW + gap),
      y: startY,
      w: cardW,
      h: cardH,
    }));
  }

  handleClick(mousePos, game) {
    this.cardRects.forEach((r, i) => {
      if (
        mousePos.x >= r.x && mousePos.x <= r.x + r.w &&
        mousePos.y >= r.y && mousePos.y <= r.y + r.h
      ) {
        game.selectUpgrade(i);
      }
    });
  }

  draw(ctx, player) {
    // Dim overlay
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Title
    const titleY = this.cardRects[0].y - 48;
    ctx.font      = '28px Consolas, monospace';
    ctx.fillStyle = YELLOW;
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${player.level}  —  CHOOSE AN UPGRADE`, WIDTH / 2, titleY);
    ctx.textAlign = 'left';

    this.choices.forEach((upg, i) => {
      const r = this.cardRects[i];

      // Card background
      ctx.fillStyle   = '#0b1220';
      ctx.strokeStyle = upg.iconColor;
      ctx.lineWidth   = 2;
      roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      ctx.stroke();

      // Icon box
      const ix = r.x + (r.w - 80) / 2;
      const iy = r.y + 18;
      ctx.fillStyle   = upg.iconColor + '33';
      ctx.strokeStyle = upg.iconColor;
      ctx.lineWidth   = 2;
      roundRect(ctx, ix, iy, 80, 80, 8);
      ctx.fill();
      ctx.stroke();

      // Icon symbol (first letter of name, large)
      ctx.font      = '40px Consolas, monospace';
      ctx.fillStyle = upg.iconColor;
      ctx.textAlign = 'center';
      ctx.fillText(upg.name[0], ix + 40, iy + 55);
      ctx.textAlign = 'left';

      // Upgrade name
      ctx.font      = '17px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.fillText(upg.name, r.x + r.w / 2, r.y + 118);
      ctx.textAlign = 'left';

      // Description (word-wrapped)
      wrapText(ctx, upg.description, r.x + 12, r.y + 142, r.w - 24, 20, GREY, '14px Consolas, monospace');

      // Current level dots
      const level = player.upgrades[upg.key] ?? 0;
      for (let d = 0; d < level; d++) {
        ctx.fillStyle = upg.iconColor;
        ctx.beginPath();
        ctx.arc(r.x + 12 + d * 14, r.y + r.h - 24, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Empty dots to max
      for (let d = level; d < upg.maxLevel; d++) {
        ctx.strokeStyle = upg.iconColor + '55';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(r.x + 12 + d * 14, r.y + r.h - 24, 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Keyboard hint
      ctx.font      = '14px Consolas, monospace';
      ctx.fillStyle = GREY;
      ctx.textAlign = 'right';
      ctx.fillText(`[${i + 1}]`, r.x + r.w - 8, r.y + r.h - 10);
      ctx.textAlign = 'left';
    });
  }
}
