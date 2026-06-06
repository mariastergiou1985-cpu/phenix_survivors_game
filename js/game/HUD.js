import {
  WIDTH, HEIGHT, MAX_OVERLOAD,
  CYAN, ORANGE, RED, GREEN, WHITE, GREY, YELLOW, BLACK,
} from '../constants.js';
import { drawText, drawBar } from '../utils.js';

export function drawHUD(ctx, game) {
  // Time
  const mins = Math.floor(game.timeAlive / 60).toString().padStart(2, '0');
  const secs = Math.floor(game.timeAlive % 60).toString().padStart(2, '0');
  drawText(ctx, `TIME ${mins}:${secs}`, 18, 30, CYAN);

  // HP bar
  drawText(ctx, 'HP', 145, 30, WHITE);
  drawBar(ctx, 175, 12, 140, 18, game.player.hp, game.player.maxHp, GREEN);

  // Stamina bar
  drawText(ctx, 'STAM', 335, 30, WHITE);
  drawBar(ctx, 390, 12, 130, 18, game.player.stamina, game.player.maxStamina, CYAN);

  // Overload bar
  let overloadColor = CYAN;
  if (game.overload > 60) overloadColor = ORANGE;
  if (game.overload > 82) overloadColor = RED;

  drawText(ctx, 'NETWORK OVERLOAD', 550, 30, WHITE);
  drawBar(ctx, 735, 12, 240, 18, game.overload, MAX_OVERLOAD, overloadColor);
  drawText(ctx, `${game.overload.toFixed(1).padStart(5, '0')}%`, 985, 30, overloadColor);

  // Inventory / Level
  drawText(ctx, `CORES ${game.player.carry}/${game.player.maxCarry}`, 1095, 15, YELLOW);
  drawText(ctx, `LV ${game.player.level} XP ${game.player.xp}/${game.player.xpToNext}`, 1095, 32, GREEN);

  // Ability cooldown indicators
  _drawAbilityHUD(ctx, game.player);

  // Aim assist indicator (bottom-right)
  const aaColor = game.aimAssist ? GREEN : GREY;
  drawText(ctx, game.aimAssist ? '[T] AIM ASSIST: ON' : '[T] AIM ASSIST: OFF',
    WIDTH - 200, HEIGHT - 50, aaColor, '13px Consolas, monospace');

  const sc = game.player.specialCooldown;
  const spText  = sc <= 0 ? '[E] SPECIAL: READY' : `[E] SPECIAL: ${Math.ceil(sc)}s`;
  const spColor = sc <= 0 ? CYAN : GREY;
  drawText(ctx, spText, WIDTH - 220, HEIGHT - 32, spColor, '13px Consolas, monospace');

  // Score / Best (stacked under CORES/LV, top-right)
  drawText(ctx, `SCORE: ${Math.floor(game.score ?? 0)}`, 1095, 48, WHITE,  '13px Consolas, monospace');
  drawText(ctx, `BEST:  ${game.bestScore ?? 0}`,         1095, 63, YELLOW, '13px Consolas, monospace');
  if ((game.comboCount ?? 0) >= 2) {
    const n   = game.comboCount;
    const col = n >= 10 ? '#FFCC00' : n >= 5 ? '#00CCFF' : '#00FF88';
    drawText(ctx, `COMBO x${n}`, 1095, 80, col, 'bold 13px Consolas, monospace');
  }

  // Grid Blackout warning
  if (game.gridBlackoutActive) {
    const flash = (Math.floor(Date.now() / 400) % 2 === 0);
    if (flash) drawText(ctx, '!! GRID BLACKOUT ACTIVE !!', WIDTH / 2 - 160, 30, RED, '18px Consolas, monospace');
  }

  // Bottom status bar
  const statY = HEIGHT - 14;
  const leftStatus = `Enemies: ${game.enemies.length}/${game.enemyCap()} | Cores on ground: ${game.groundCores.length} | Secured: ${game.player.coresSecured} | Intercepts: ${game.player.coresIntercepted}`;
  const rightStatus = `Volatility x${game.coreVolatilityMultiplier().toFixed(2)} | Overload Rate x${game.overloadRateMultiplier().toFixed(2)}`;
  drawText(ctx, leftStatus,  18,           statY, GREY, '14px Consolas, monospace');
  drawText(ctx, rightStatus, 760,          statY, GREY, '14px Consolas, monospace');
}

function _drawAbilityHUD(ctx, player) {
  let x = 18;
  const y = HEIGHT - 50;

  if (player.upgrades['Sonic Pulse'] > 0) {
    const cd    = player.sonicPulseCooldown;
    const maxCd = Math.max(2.5, 5.0 - player.upgrades['Sonic Pulse'] * 0.5);
    drawText(ctx, '[Q] PULSE', x, y, cd <= 0 ? WHITE : GREY, '14px Consolas, monospace');
    if (cd > 0) drawBar(ctx, x, y + 5, 68, 3, maxCd - cd, maxCd, CYAN);
    x += 88;
  }

  if (player.upgrades['EMP Cloud'] > 0) {
    const cd    = player.empCloudCooldown;
    const maxCd = Math.max(8.0, 18.0 - player.upgrades['EMP Cloud'] * 2.0);
    drawText(ctx, '[E] EMP', x, y, cd <= 0 ? WHITE : GREY, '14px Consolas, monospace');
    if (cd > 0) drawBar(ctx, x, y + 5, 68, 3, maxCd - cd, maxCd, ORANGE);
    x += 88;
  }

  if (player.upgrades['Homing Disc'] > 0) {
    drawText(ctx, 'DISC', x, y, CYAN, '14px Consolas, monospace');
    x += 60;
  }

  if (player.upgrades['Quantum Overhaul'] > 0) {
    drawText(ctx, 'QOB', x, y, ORANGE, '14px Consolas, monospace');
  }
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
