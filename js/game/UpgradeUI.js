import { WIDTH, HEIGHT, YELLOW, WHITE, GREY } from '../constants.js';
import { drawText, wrapText, roundRect } from '../utils.js';
import { RARITY_COLORS } from './Upgrades.js?v=20260706300000';

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

    this.selectedIndex = 0;   // controller cursor — highlighted when a gamepad is active

    // Reroll button centered below the cards
    const rbW = 240, rbH = 40;
    this.rerollRect = { x: (WIDTH - rbW) / 2, y: startY + cardH + 22, w: rbW, h: rbH };
  }

  // Rebind choices after a reroll without recreating the layout (count is unchanged).
  setChoices(choices) { this.choices = choices; }

  // Special cards get a bespoke neon accent so they read as premium; everything else keeps its
  // rarity color. Corrosive = acid green; weapon-mastery cards inherit their character identity.
  _accentFor(upg) {
    if (upg.reward)  return upg.iconColor;   // reward/gift cards: bright premium accent
    if (upg.synergy) return upg.iconColor;   // synergy cards: bright per-character premium accent
    if (upg.chaosOnly) return upg.iconColor; // chaos cards: bright per-card chaos accent
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

      // Controller cursor highlight — white outer ring when this card is selected via gamepad
      if (game?._controllerActivated && i === this.selectedIndex) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 4;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur  = 28;
        roundRect(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 15);
        ctx.stroke();
        ctx.restore();
      }

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

      // Icon — IMAGE art when the card carries a loaded iconImg (Nexus pack
      // illustrations), otherwise the classic symbol/emoji glyph.
      // iconImg can be an HTMLImageElement (Nexus illustrations) OR an offscreen
      // canvas (frame-0 crop of a VFX sheet). Canvases have no complete/naturalWidth,
      // so readiness/size are read from width/height instead.
      const _icCanvas = !!upg.iconImg && upg.iconImg.naturalWidth === undefined;
      if (upg.iconImg && (_icCanvas ? upg.iconImg.width > 0
                                    : (upg.iconImg.complete && upg.iconImg.naturalWidth > 0))) {
        const iw = _icCanvas ? upg.iconImg.width  : upg.iconImg.naturalWidth,
              ih = _icCanvas ? upg.iconImg.height : upg.iconImg.naturalHeight;
        const fit = Math.min(72 / iw, 72 / ih);          // fit inside the 80×80 box w/ 4px pad
        const dw = iw * fit, dh = ih * fit;
        ctx.save();
        roundRect(ctx, ix, iy, 80, 80, 10);
        ctx.clip();                                      // keep art inside the rounded frame
        ctx.drawImage(upg.iconImg, ix + (80 - dw) / 2, iy + (80 - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        // Icon symbol/emoji (large, centered)
        ctx.font      = (upg.icon && upg.icon.length > 1 ? '34px' : '42px') + ' "Segoe UI Emoji", Consolas, monospace';
        ctx.fillStyle = upg.iconColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(upg.icon, ix + 40, iy + 42);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
      }

      // Upgrade name — bold, bright, with a subtle glow for readability.
      // Auto-fit: long names (e.g. "Storm Saber Cursed Slash Lv.2") shrink to
      // stay inside the card frame instead of overflowing past its edges.
      ctx.save();
      let _nameSize = 19;
      ctx.font = 'bold ' + _nameSize + 'px Consolas, monospace';
      const _maxNameW = r.w - 24;
      while (_nameSize > 12 && ctx.measureText(upg.name).width > _maxNameW) {
        _nameSize -= 1;
        ctx.font = 'bold ' + _nameSize + 'px Consolas, monospace';
      }
      ctx.fillStyle = WHITE;
      ctx.shadowColor = accent; ctx.shadowBlur = 6;
      ctx.textAlign = 'center';
      ctx.fillText(upg.name, r.x + r.w / 2, r.y + 122);
      ctx.restore();

      // Category / rarity label — premium badge per card type
      ctx.font      = 'bold 11px Consolas, monospace';
      const catLabel = upg.reward     ? '★ REWARD ★'
                     : upg.synergy    ? '★ SYNERGY ★'
                     : upg.chaosOnly  ? '★ CHAOS ★'
                     : upg.endlessOnly ? '∞ ENDLESS'
                     : upg.key === 'Auto-Forge Drone' || upg.key === 'sentry_drone' ? '◆ ALLY'
                     : upg.char       ? '⬡ MASTERY'
                     : upg.rarity.toUpperCase();
      const catColor = (upg.reward || upg.synergy || upg.chaosOnly || upg.endlessOnly || upg.char) ? accent : rarity;
      ctx.fillStyle = catColor;
      ctx.textAlign = 'center';
      ctx.fillText(catLabel, r.x + r.w / 2, r.y + 140);
      ctx.textAlign = 'left';

      // Description (word-wrapped)
      wrapText(ctx, upg.description, r.x + 12, r.y + 162, r.w - 24, 20, WHITE, '14px Consolas, monospace');

      // Current level dots — capped at 10 so re-offerable cards (maxLevel 99,
      // e.g. tactical GRID CACHE cards) never overflow the card with dot rows.
      const level = Math.min(player.upgrades[upg.key] ?? 0, 10);
      for (let d = 0; d < level; d++) {
        ctx.fillStyle = upg.iconColor;
        ctx.beginPath();
        ctx.arc(r.x + 12 + d * 14, r.y + r.h - 24, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Empty dots to max — same cap: past 10 the dot row is meaningless.
      for (let d = level; d < Math.min(upg.maxLevel, 10); d++) {
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
    const rerollsLeft = game ? (game.rerollsLeft ?? 0) : 0;
    ctx.fillText(available ? `↻ REROLL (${rerollsLeft})  [R]` : '↻ REROLL USED', rr.x + rr.w / 2, rr.y + 26);
    ctx.textAlign = 'left';
  }
}
