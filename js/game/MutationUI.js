import { WIDTH, HEIGHT, WHITE } from '../constants.js';

// Forced mutation picker — smaller, cleaner, danger-styled cards. NO skip button, NO reroll button.
// Keys 1/2/3 and mouse click select; ESC is intentionally not handled here so it can never close
// the choice. Game freezes the world while this is open (see Game.update upgradeUI/mutationUI gate).
export class MutationUI {
  constructor(choices) {
    this.choices = choices;
    // A CORRUPTED card (Chaos / REROLL DOCTRINE only) prints a bonus AND a drawback, so the whole
    // row grows to fit them. Hands with no corrupted card keep the shipped 180x200 geometry and
    // the shipped drawing path byte-for-byte — nothing changes for any other character.
    this.hasCorrupt = choices.some(c => c && c.corrupted);
    const cardW = this.hasCorrupt ? 200 : 180;
    const cardH = this.hasCorrupt ? 244 : 200;   // smaller than the 220x250 level-up cards
    const gap = 26;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (WIDTH  - totalW) / 2;
    const startY = (HEIGHT - cardH)  / 2 - 4;
    this.cardRects = choices.map((_, i) => ({ x: startX + i * (cardW + gap), y: startY, w: cardW, h: cardH }));
    this.selectedIndex = 0;   // controller cursor
    this.hoveredIndex = -1;
  }

  handleClick(mousePos, game) {
    for (let i = 0; i < this.cardRects.length; i++) {
      const r = this.cardRects[i];
      if (mousePos.x >= r.x && mousePos.x <= r.x + r.w && mousePos.y >= r.y && mousePos.y <= r.y + r.h) {
        this.selectedIndex = i;
        game.selectMutation(i);
        return;
      }
    }
  }

  updateHover(mousePos) {
    this.hoveredIndex = this.cardRects.findIndex(r =>
      mousePos.x >= r.x && mousePos.x <= r.x + r.w &&
      mousePos.y >= r.y && mousePos.y <= r.y + r.h);
    return this.hoveredIndex >= 0;
  }

  draw(ctx, player, game) {
    ctx.save();
    ctx.fillStyle = 'rgba(12,0,0,0.80)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const top = this.cardRects[0].y;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4040';
    ctx.font = 'bold 34px Consolas, monospace';
    ctx.fillText('⚠ FORCED MUTATION', WIDTH / 2, top - 72);
    ctx.fillStyle = '#ffb070';
    ctx.font = 'bold 16px Consolas, monospace';
    ctx.fillText('CHOOSE 1 — NO ESCAPE', WIDTH / 2, top - 46);
    if (this.hasCorrupt) {
      ctx.fillStyle = '#ff2d95';
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.fillText('REROLL DOCTRINE — ONE OFFER IS CORRUPTED. BOTH HALVES ARE SHOWN.', WIDTH / 2, top - 24);
    }

    for (let i = 0; i < this.choices.length; i++) {
      const c = this.choices[i], r = this.cardRects[i];
      const taken = (game.mutations && game.mutations.taken[c.key]) || 0;
      const cx = r.x + r.w / 2;

      ctx.fillStyle = c.corrupted ? '#1a0616' : '#180a0a';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = c.corrupted ? '#ff2d95' : '#ff5a3c'; ctx.lineWidth = c.corrupted ? 3 : 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      ctx.fillStyle = c.corrupted ? '#ff2d95' : '#ff9b3c';
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`[${i + 1}]`, r.x + 12, r.y + 26);

      ctx.textAlign = 'center';

      if (this.hasCorrupt) {
        // Taller layout: the row is only this shape when a corrupted offer is in it.
        let y = r.y + 52;
        ctx.fillStyle = c.corrupted ? '#ff6ac0' : '#ff6a5a';
        ctx.font = 'bold 15px Consolas, monospace';
        y = this._wrap(ctx, c.name, cx, y, r.w - 18, 18) + 18;

        if (c.corrupted) {
          ctx.fillStyle = '#ff2d95';
          ctx.font = 'bold 11px Consolas, monospace';
          ctx.fillText('⚠ CORRUPTED — HIGH RISK', cx, y); y += 24;

          ctx.fillStyle = '#7CFF4D';
          ctx.font = 'bold 11px Consolas, monospace';
          ctx.fillText('BONUS', cx, y); y += 14;
          ctx.fillStyle = '#d8ffc8';
          ctx.font = '11px Consolas, monospace';
          y = this._wrap(ctx, c.bonus, cx, y, r.w - 20, 13) + 12;

          ctx.fillStyle = '#ff5a3c';
          ctx.font = 'bold 11px Consolas, monospace';
          ctx.fillText('RISK', cx, y); y += 14;
          ctx.fillStyle = '#ffd0c4';
          ctx.font = '11px Consolas, monospace';
          this._wrap(ctx, c.risk, cx, y, r.w - 20, 13);
        } else {
          ctx.fillStyle = WHITE;
          ctx.font = '12px Consolas, monospace';
          this._wrap(ctx, c.desc, cx, y + 22, r.w - 24, 16);
        }
      } else {
        ctx.fillStyle = '#ff6a5a';
        ctx.font = 'bold 16px Consolas, monospace';
        this._wrap(ctx, c.name, cx, r.y + 70, r.w - 18, 20);

        ctx.fillStyle = WHITE;
        ctx.font = '12px Consolas, monospace';
        this._wrap(ctx, c.desc, cx, r.y + 120, r.w - 24, 16);
      }

      if (taken > 0) {
        ctx.fillStyle = '#ffd24d';
        ctx.font = 'bold 12px Consolas, monospace';
        ctx.fillText(`STACK ×${taken}`, r.x + r.w / 2, r.y + r.h - 16);
      }

      // Controller cursor highlight — orange outer ring when this card is selected via gamepad
      if (i === this.hoveredIndex || (game?._controllerActivated && i === this.selectedIndex)) {
        ctx.save();
        ctx.strokeStyle = c.corrupted ? '#ff8ad4' : '#ffb070';
        ctx.lineWidth   = 4;
        ctx.shadowColor = c.corrupted ? '#ff8ad4' : '#ffb070';
        ctx.shadowBlur  = 20;
        ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // Minimal centered word-wrap. Returns the y of the LAST line drawn so a caller can stack
  // blocks under it (the corrupted card's BONUS / RISK sections); callers that ignore the
  // return value behave exactly as before.
  _wrap(ctx, text, cx, y, maxW, lh) {
    const words = String(text).split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, yy); line = w; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, cx, yy);
    return yy;
  }
}
