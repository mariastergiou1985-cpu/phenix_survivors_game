import { Vec2, WIDTH, HEIGHT, WORLD_MARGIN, WHITE, DARK_GREY } from './constants.js';

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function distance(a, b)   { return a.distanceTo(b); }

export function safeNormalize(v) {
  return v.lengthSq() === 0 ? new Vec2() : v.normalize();
}

export function randomRange(a, b) { return a + Math.random() * (b - a); }
export function randomInt(a, b)   { return Math.floor(a + Math.random() * (b - a + 1)); }
export function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function randomPosition() {
  return new Vec2(
    randomInt(WORLD_MARGIN, WIDTH - WORLD_MARGIN),
    randomInt(WORLD_MARGIN + 40, HEIGHT - WORLD_MARGIN),
  );
}

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

export function drawText(ctx, text, x, y, color = WHITE, font = '18px Consolas, monospace') {
  ctx.font      = font;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function drawBar(ctx, x, y, w, h, value, maxValue, fillColor, backColor = DARK_GREY) {
  const ratio = clamp(value / maxValue, 0, 1);

  // Background
  ctx.fillStyle = backColor;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();

  // Fill
  if (ratio > 0) {
    ctx.fillStyle = fillColor;
    roundRect(ctx, x, y, w * ratio, h, 4);
    ctx.fill();
  }

  // Border
  ctx.strokeStyle = WHITE;
  ctx.lineWidth   = 1;
  roundRect(ctx, x, y, w, h, 4);
  ctx.stroke();
}

export function drawCircle(ctx, x, y, r, color, lineWidth = 0) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (lineWidth > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
}

export function drawLine(ctx, x1, y1, x2, y2, color, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.stroke();
}

export function fillRect(ctx, x, y, w, h, color, radius = 0) {
  ctx.fillStyle = color;
  if (radius > 0) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

export function strokeRect(ctx, x, y, w, h, color, lineWidth = 1, radius = 0) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  if (radius > 0) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
  } else {
    ctx.strokeRect(x, y, w, h);
  }
}

// Builds a rounded-rect path; call fill() or stroke() after
export function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// Simple word-wrap for canvas text
export function wrapText(ctx, text, x, y, maxWidth, lineHeight, color, font = '16px Consolas, monospace') {
  ctx.font      = font;
  ctx.fillStyle = color;
  const words = text.split(' ');
  let line = '';
  let cy   = y;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy  += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
