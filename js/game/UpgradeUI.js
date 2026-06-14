import { WIDTH, HEIGHT, YELLOW, WHITE, GREY } from '../constants.js';
import { drawText, wrapText, roundRect } from '../utils.js';
import { RARITY_COLORS } from './Upgrades.js?v=20260614110916';

export class UpgradeUI {
  constructor(choices) {
    this.choices = choices;

    const cardW  = 220;
    const cardH  = 250;   // shorter cards (descriptions are now one short line)
    const gap    = 30;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (WIDTH  - totalW) / 2;
    const startY = (HEIGHT - cardH)  / 2 - 10;

    this.cardRects = choices.map((_, i) => ({
      x: startX + i * (cardW + gap),
      y: startY,
      w: cardW,
      h: cardH,
    }));

    // Reroll button centered below the cards
    const rbW = 240, rbH = 40;
    this.rerollRect = { x: (WIDTH - rbW) / 2, y: startY + cardH + 22, w: rbW, h: rbH };
  }

  // Rebind choices after a reroll without recreating the layout (count is unchanged).
  setChoices(choices) { this.choices = choices; }

  // Special cards get a bespoke neon accent so they read as premium; everything else keeps its
  // rarity color. Corrosive = acid green; weapon-mastery cards inherit their character identity.
  _accentFor(upg) {
    if (upg.key === 'corrosive_payload') return '#7CFF3C';
    switch (upg.char) {
      case 'skeleton_warrior': return '#AEE3FF';   // blue-white electric
      case 'cyber_arm_hero':   return '#FF9B3C';   // industrial orange
      case 'taekwondo_girl':   return '#3CF0E6';   // aqua spirit
      case 'brawler_warrior':  return '#3CFFB0';   // cyan-green energy
      default:                 return null;
    }
  }

  handleClick(mousePos, game) {
    const rr = this.rerollRect;
    if (mousePos.x >= rr.x && mousePos.x <= rr.x + rr.w &&
        mousePos.y >= rr.y && mousePos.y <= rr.y + rr.h) {
      game.rerollUpgrade();
      return;
    }
    this.cardRects.forEach((r, i) => {
      if (
        mousePos.x >= r.x && mousePos.x <= r.x + r.w &&
        mousePos.y >= r.y && mousePos.y <= r.y + r.h
      ) {
        game.selectUpgrade(i);
      }
    });
  }

  draw(ctx, player, game) {
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
      const r      = this.cardRects[i];
      const rarity = RARITY_COLORS[upg.rarity] || upg.iconColor;
      const accent = this._accentFor(upg) || rarity;   // special cards override the neon color
      const special = accent !== rarity;

      // Card background — dark glass panel with a neon accent border + soft outer glow
      ctx.save();
      ctx.fillStyle = special ? '#0c1626' : '#0b1220';
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fill();

      // Subtle clipped scanlines + a faint accent wash for a premium cyber-glass feel (lightweight)
      ctx.save();
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.clip();
      ctx.fillStyle = accent + (special ? '14' : '0c');
      ctx.fillRect(r.x, r.y, r.w, 26);                 // header tint band
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth   = 1;
      for (let sy = r.y + 6; sy < r.y + r.h; sy += 6) {
        ctx.beginPath(); ctx.moveTo(r.x, sy); ctx.lineTo(r.x + r.w, sy); ctx.stroke();
      }
      ctx.restore();

      ctx.shadowColor = accent;
      ctx.shadowBlur  = special ? 20 : 16;             // soft neon glow around the border
      ctx.strokeStyle = accent;
      ctx.lineWidth   = special ? 3 : 2.5;
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.stroke();
      ctx.restore();

      // Icon box — tinted by rarity with a thin glowing frame
      const ix = r.x + (r.w - 80) / 2;
      const iy = r.y + 16;
      ctx.save();
      ctx.fillStyle = accent + '22';
      roundRect(ctx, ix, iy, 80, 80, 10);
      ctx.fill();
      ctx.shadowColor = accent; ctx.shadowBlur = 8;
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      roundRect(ctx, ix, iy, 80, 80, 10);
      ctx.stroke();
      ctx.restore();

      // Thin accent divider under the icon — separates title block, reinforces hierarchy
      ctx.save();
      ctx.strokeStyle = accent + '66';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r.x + 18, r.y + 104); ctx.lineTo(r.x + r.w - 18, r.y + 104);
      ctx.stroke();
      ctx.restore();

      // Icon symbol/emoji (large, centered)
      ctx.font      = (upg.icon.length > 1 ? '34px' : '42px') + ' "Segoe UI Emoji", Consolas, monospace';
      ctx.fillStyle = upg.iconColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(upg.icon, ix + 40, iy + 42);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';

      // Upgrade name — bold, bright, with a subtle glow for readability
      ctx.save();
      ctx.font      = 'bold 19px Consolas, monospace';
      ctx.fillStyle = WHITE;
      ctx.shadowColor = accent; ctx.shadowBlur = 6;
      ctx.textAlign = 'center';
      ctx.fillText(upg.name, r.x + r.w / 2, r.y + 122);
      ctx.restore();

      // Rarity label
      ctx.font      = 'bold 11px Consolas, monospace';
      ctx.fillStyle = rarity;
      ctx.textAlign = 'center';
      ctx.fillText(upg.rarity.toUpperCase(), r.x + r.w / 2, r.y + 140);
      ctx.textAlign = 'left';

      // Description (word-wrapped)
      wrapText(ctx, upg.description, r.x + 12, r.y + 162, r.w - 24, 20, WHITE, '14px Consolas, monospace');

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

    // ── Reroll button (one free reroll per level-up screen) ──────────────────
    const rr        = this.rerollRect;
    const available = !game || game.rerollAvailable;
    ctx.fillStyle   = available ? 'rgba(20,40,60,0.95)' : 'rgba(20,26,34,0.8)';
    ctx.strokeStyle = available ? YELLOW : GREY;
    ctx.lineWidth   = 2;
    roundRect(ctx, rr.x, rr.y, rr.w, rr.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.font      = 'bold 16px Consolas, monospace';
    ctx.fillStyle = available ? YELLOW : GREY;
    ctx.textAlign = 'center';
    ctx.fillText(available ? '↻ REROLL  [R]' : '↻ REROLL USED', rr.x + rr.w / 2, rr.y + 26);
    ctx.textAlign = 'left';
  }
}
