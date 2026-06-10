import {
  WIDTH, HEIGHT, MAX_OVERLOAD, VIEW_SCALE,
  CYAN, ORANGE, RED, GREEN, WHITE, GREY, YELLOW, BLACK,
} from '../constants.js';
import { drawText, drawBar, clamp } from '../utils.js';

export function drawHUD(ctx, game) {
  const p = game.player;

  // ── Top: full-width blue XP bar ─────────────────────────────────────────
  const xpRatio = clamp(p.xp / p.xpToNext, 0, 1);
  ctx.fillStyle = 'rgba(6,14,26,0.92)';
  ctx.fillRect(0, 0, WIDTH, 6);
  const xpGrad = ctx.createLinearGradient(0, 0, WIDTH, 0);
  xpGrad.addColorStop(0, '#1e90ff');
  xpGrad.addColorStop(1, '#66e0ff');
  ctx.fillStyle = xpGrad;
  ctx.fillRect(0, 0, Math.round(WIDTH * xpRatio), 6);
  ctx.textAlign = 'right';
  drawText(ctx, `LV ${p.level}`, WIDTH - 12, 23, '#cfeaff', 'bold 15px Consolas, monospace');

  // ── Top-center: timer + kills (skull) ───────────────────────────────────
  const mins = Math.floor(game.timeAlive / 60).toString().padStart(2, '0');
  const secs = Math.floor(game.timeAlive % 60).toString().padStart(2, '0');
  ctx.textAlign = 'center';
  drawText(ctx, `${mins}:${secs}`, WIDTH / 2, 42, WHITE, 'bold 26px Consolas, monospace');
  _drawSkull(ctx, WIDTH / 2 - 36, 60, '#d7dee6');
  ctx.textAlign = 'left';
  drawText(ctx, `KILLS ${p.kills}`, WIDTH / 2 - 24, 65, '#d7dee6', 'bold 15px Consolas, monospace');

  // ── Top-left: compact Network Overload (kept — drives the blackout mechanic) ──
  let oc = CYAN;
  if (game.overload > 60) oc = ORANGE;
  if (game.overload > 82) oc = RED;
  ctx.textAlign = 'left';
  drawText(ctx, 'OVERLOAD', 12, 22, '#7fa8c8', '11px Consolas, monospace');
  drawBar(ctx, 12, 28, 150, 8, game.overload, MAX_OVERLOAD, oc);
  drawText(ctx, `${game.overload.toFixed(0)}%`, 168, 37, oc, '11px Consolas, monospace');

  // ── Top-right: Data-Core icon + live Grid Credits ───────────────────────
  const credits = (game.meta?.credits ?? 0).toLocaleString();
  ctx.textAlign = 'right';
  drawText(ctx, credits, WIDTH - 14, 52, '#bfefff', 'bold 18px Consolas, monospace');
  ctx.font = 'bold 18px Consolas, monospace';
  const cw = ctx.measureText(credits).width;
  _drawIcon(ctx, game._dataCoreIcon, WIDTH - 14 - cw - 26, 38, 20, '#3fd0ff');

  // Grid Blackout warning (overload mechanic — kept)
  if (game.gridBlackoutActive && (Math.floor(Date.now() / 400) % 2 === 0)) {
    ctx.textAlign = 'center';
    drawText(ctx, '!! GRID BLACKOUT ACTIVE !!', WIDTH / 2, 96, RED, '16px Consolas, monospace');
  }

  // ── Bottom-left: Q Pulse Shield + E EMP ─────────────────────────────────
  const by = HEIGHT - 62, bs = 44;
  const qFrac = 1 - clamp(p.pulseShieldCooldown / p.pulseShieldMaxCooldown, 0, 1);
  _drawAbilityBox(ctx, 16, by, bs, 'Q', qFrac, p.pulseShieldCooldown <= 0,
    (cx, cy) => _glyphShield(ctx, cx, cy, bs));
  const empMax = Math.max(8, 12 - p.upgrades['EMP Cloud']);
  const eFrac  = 1 - clamp(p.empCloudCooldown / empMax, 0, 1);
  _drawAbilityBox(ctx, 16 + bs + 18, by, bs, 'E', eFrac, p.empCloudCooldown <= 0,
    (cx, cy) => _glyphEMP(ctx, cx, cy, bs));

  // ── Bottom-right: SPACE ultimate (mana-fill) ────────────────────────────
  if (p.selectedCharacter === 'skeleton_warrior' || p.selectedCharacter === 'cyber_arm_hero' || p.selectedCharacter === 'taekwondo_girl') {
    const icon = p.selectedCharacter === 'skeleton_warrior' ? game._thunderGuitarSprite
               : p.selectedCharacter === 'cyber_arm_hero'   ? game._chainsIcon
               : game._dojangFlagSprite;
    const manaFrac = clamp(p.mana / 100, 0, 1);   // ultimate is ready at the fixed 100 cost, not maxMana (Mana Core safe)
    _drawUltimateBox(ctx, WIDTH - 64, HEIGHT - 66, 48, 'SPACE', manaFrac, icon);
  }

  // Player visibility marker — drawn last in the HUD layer so it stays on top of enemies,
  // projectiles, rain, and effects during late-game chaos.
  _drawPlayerMarker(ctx, game);

  ctx.textAlign = 'left';
}

// Small downward cyan/white pointer hovering just above the player's HP/Mana bars so the player
// is instantly findable when the screen is crowded. Screen-space; follows the player via the same
// world→screen transform the camera-space block uses (scale, then camera offset). Subtle hover/pulse.
function _drawPlayerMarker(ctx, game) {
  const p = game.player;
  if (!p || !game.camera) return;

  const sx = clamp((p.pos.x - game.camera.x) * VIEW_SCALE, 12, WIDTH - 12);
  const sy = (p.pos.y - game.camera.y) * VIEW_SCALE;

  // Apex (the downward tip) sits just above the HP/Mana bars (their top is ~52 world-units above
  // the player centre). Clamp so it never tucks under the top HUD strip.
  const t     = performance.now();
  const bob   = Math.sin(t * 0.005) * 2;
  const apexY = Math.max(50, sy - 52 * VIEW_SCALE - 6) + bob;
  const baseY = apexY - 11;
  const halfW = 8;
  const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.005));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx, apexY);
  ctx.lineTo(sx - halfW, baseY);
  ctx.lineTo(sx + halfW, baseY);
  ctx.closePath();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur  = 8;
  ctx.globalAlpha = pulse;
  ctx.fillStyle   = CYAN;
  ctx.fill();
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
  ctx.lineWidth   = 1.5;
  ctx.strokeStyle = WHITE;
  ctx.stroke();
  ctx.restore();
}

// Rounded-square ability box with a circular ready/cooldown ring + key label + % readout.
function _drawAbilityBox(ctx, x, y, s, label, frac, ready, glyphFn) {
  const cx = x + s / 2, cy = y + s / 2;
  ctx.fillStyle = 'rgba(6,18,32,0.85)';
  ctx.beginPath(); ctx.roundRect(x, y, s, s, 6); ctx.fill();
  ctx.strokeStyle = ready ? CYAN : 'rgba(120,150,170,0.5)';
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x, y, s, s, 6); ctx.stroke();
  ctx.save();
  ctx.globalAlpha = ready ? 1 : 0.5;
  glyphFn(cx, cy);
  ctx.restore();
  _drawRing(ctx, cx, cy, s / 2 + 5, frac, ready);
  ctx.textAlign = 'center';
  drawText(ctx, label, cx, y - 8, ready ? '#cfeaff' : '#90a4b4', 'bold 13px Consolas, monospace');
  drawText(ctx, `${Math.round(frac * 100)}%`, cx, y + s + 16, ready ? CYAN : '#90a4b4', '11px Consolas, monospace');
}

// Bottom-right ultimate box: icon image + circular mana-fill ring.
function _drawUltimateBox(ctx, x, y, s, label, frac, icon) {
  const cx = x + s / 2, cy = y + s / 2;
  const ready = frac >= 1;
  ctx.fillStyle = 'rgba(6,18,32,0.85)';
  ctx.beginPath(); ctx.roundRect(x, y, s, s, 6); ctx.fill();
  ctx.strokeStyle = ready ? CYAN : 'rgba(120,150,170,0.5)';
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x, y, s, s, 6); ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.45 + 0.55 * frac;
  _drawIcon(ctx, icon, x + 5, y + 5, s - 10, CYAN);
  ctx.restore();
  _drawRing(ctx, cx, cy, s / 2 + 5, frac, ready);
  ctx.textAlign = 'center';
  drawText(ctx, label, cx, y - 8, ready ? '#cfeaff' : '#90a4b4', 'bold 12px Consolas, monospace');
  drawText(ctx, `${Math.round(frac * 100)}%`, cx, y + s + 16, ready ? CYAN : '#90a4b4', '11px Consolas, monospace');
}

// Circular gauge: dim full ring + bright arc sweeping clockwise from the top by `frac`.
function _drawRing(ctx, cx, cy, r, frac, ready) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(40,70,90,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  if (frac > 0) {
    ctx.strokeStyle = ready ? CYAN : '#3a86ff';
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
  }
}

function _drawIcon(ctx, img, x, y, size, fallbackColor) {
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
  }
}

function _glyphShield(ctx, cx, cy, s) {
  const w = s * 0.42, h = s * 0.52;
  ctx.fillStyle = 'rgba(0,200,255,0.18)';
  ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.5);
  ctx.lineTo(cx + w * 0.5, cy - h * 0.28);
  ctx.lineTo(cx + w * 0.5, cy + h * 0.08);
  ctx.quadraticCurveTo(cx + w * 0.45, cy + h * 0.42, cx, cy + h * 0.5);
  ctx.quadraticCurveTo(cx - w * 0.45, cy + h * 0.42, cx - w * 0.5, cy + h * 0.08);
  ctx.lineTo(cx - w * 0.5, cy - h * 0.28);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
}

function _glyphEMP(ctx, cx, cy, s) {
  ctx.strokeStyle = CYAN; ctx.lineWidth = 1.6;
  for (let i = 1; i <= 3; i++) {
    ctx.globalAlpha = 1 - i * 0.22;
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.1 * i, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = CYAN;
  ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
}

function _drawSkull(ctx, cx, cy, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();   // cranium
  ctx.fillRect(cx - 4, cy + 4, 8, 4);                                // jaw
  ctx.fillStyle = 'rgba(10,15,25,1)';                                // eye sockets
  ctx.beginPath(); ctx.arc(cx - 2.7, cy - 0.5, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 2.7, cy - 0.5, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawEndScreen(ctx, game) {
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Title
  if (game.victory) {
    ctx.font      = '44px Consolas, monospace';
    ctx.fillStyle = GREEN;
    ctx.textAlign = 'center';
    ctx.fillText(game.finalMessage, WIDTH / 2, 80);
  } else {
    ctx.font      = '48px Consolas, monospace';
    ctx.fillStyle = '#ff2244';
    ctx.textAlign = 'center';
    ctx.fillText('CITY GRID BLACKOUT', WIDTH / 2, 80);
  }

  const mins = Math.floor(game.timeAlive / 60).toString().padStart(2, '0');
  const secs = Math.floor(game.timeAlive % 60).toString().padStart(2, '0');
  const lx = WIDTH / 2 - 280;
  const rx = WIDTH / 2 + 280;
  let y = 130;

  // New high score banner
  if (game.isNewHighScore) {
    ctx.font      = 'bold 26px Consolas, monospace';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.fillText('★  NEW HIGH SCORE!  ★', WIDTH / 2, y);
    y += 38;
  }

  // Run stats
  const runStats = [
    ['Score',               `${Math.floor(game.score ?? 0)}`],
    ['Best Score',          `${game.bestScore ?? 0}`],
    ['Max Combo',           `x${game.maxCombo ?? 0}`],
    ['Survival Time',       `${mins}:${secs}`],
    ['Enemies Defeated',    `${game.player.kills}`],
    ['Data-Cores Secured',  `${game.player.coresSecured}`],
    ['Grid Credits Earned', `+${game.runCreditsEarned ?? 0}`],
    ['Total Grid Credits',  `${game.meta?.credits ?? 0}`],
  ];

  ctx.font      = '22px Consolas, monospace';
  ctx.textAlign = 'left';
  for (const [label, value] of runStats) {
    ctx.fillStyle = CYAN;
    ctx.fillText(label, lx, y);
    ctx.fillStyle = YELLOW;
    ctx.textAlign = 'right';
    ctx.fillText(value, rx, y);
    ctx.textAlign = 'left';
    y += 28;
  }

  // Separator
  y += 6;
  ctx.strokeStyle = '#2a4060';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(lx, y);
  ctx.lineTo(rx, y);
  ctx.stroke();

  // Buttons: RETRY / UPGRADES / MAIN MENU
  const BW = 200, BH = 46, BY = 440;
  const btns = [
    { label: 'RETRY',     x: 316, border: CYAN     },
    { label: 'UPGRADES',  x: 540, border: YELLOW   },
    { label: 'MAIN MENU', x: 764, border: '#ff4444' },
  ];
  for (const btn of btns) {
    ctx.fillStyle   = 'rgba(0, 20, 40, 0.9)';
    ctx.strokeStyle = btn.border;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect(btn.x, BY, BW, BH, 4);
    ctx.fill();
    ctx.stroke();
    ctx.font      = '20px Consolas, monospace';
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.fillText(btn.label, btn.x + BW / 2, BY + BH / 2 + 7);
  }

  // Keyboard hint
  ctx.font      = '16px Consolas, monospace';
  ctx.fillStyle = '#5a7080';
  ctx.textAlign = 'center';
  ctx.fillText('R = Retry   •   ESC = Main Menu', WIDTH / 2, 510);

  ctx.textAlign = 'left';
}
