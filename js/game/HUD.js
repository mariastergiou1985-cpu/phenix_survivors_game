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
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const color = game.victory ? GREEN : RED;
  ctx.font      = '46px Consolas, monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(game.finalMessage, WIDTH / 2, HEIGHT / 2 - 150);

  const mins = Math.floor(game.timeAlive / 60).toString().padStart(2, '0');
  const secs = Math.floor(game.timeAlive % 60).toString().padStart(2, '0');

  const stats = [
    `Survival Time: ${mins}:${secs}`,
    `Data-Cores Secured: ${game.player.coresSecured}`,
    `Cores Intercepted: ${game.player.coresIntercepted}`,
    `Cyber-Punks Neutralized: ${game.player.kills}`,
    `Final Level: ${game.player.level}`,
    `Final Overload: ${game.overload.toFixed(1)}%`,
    '',
    'Press R to restart',
    'Press ESC to quit / pause',
  ];

  ctx.font = '26px Consolas, monospace';
  let y = HEIGHT / 2 - 70;
  for (const line of stats) {
    ctx.fillStyle = WHITE;
    ctx.fillText(line, WIDTH / 2, y);
    y += 34;
  }

  ctx.textAlign = 'left';
}
