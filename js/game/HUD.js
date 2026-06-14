import {
  WIDTH, HEIGHT, MAX_OVERLOAD, VIEW_SCALE,
  CYAN, ORANGE, RED, GREEN, WHITE, GREY, YELLOW, BLACK,
} from '../constants.js';
import { drawText, drawBar, clamp } from '../utils.js';

export function drawHUD(ctx, game) {
  const p = game.player;

  // ── Top: full-width blue XP bar (thicker + readable LV / XP readout) ─────
  const XPH = 9;
  const xpRatio = clamp(p.xp / p.xpToNext, 0, 1);
  ctx.fillStyle = 'rgba(6,14,26,0.92)';
  ctx.fillRect(0, 0, WIDTH, XPH);
  const xpGrad = ctx.createLinearGradient(0, 0, WIDTH, 0);
  xpGrad.addColorStop(0, '#1e90ff');
  xpGrad.addColorStop(1, '#66e0ff');
  ctx.fillStyle = xpGrad;
  ctx.fillRect(0, 0, Math.round(WIDTH * xpRatio), XPH);
  // thin highlight line so the fill edge reads against the dark track
  ctx.fillStyle = 'rgba(180,235,255,0.85)';
  ctx.fillRect(0, XPH - 1, Math.round(WIDTH * xpRatio), 1);
  // Readout: bold level + XP-to-next, right-aligned just under the bar.
  ctx.textAlign = 'right';
  drawText(ctx, `LV ${p.level}`, WIDTH - 12, 26, '#dff2ff', 'bold 17px Consolas, monospace');
  drawText(ctx, `${Math.floor(p.xp)} / ${p.xpToNext} XP`, WIDTH - 70, 25, '#8fc6e8', '12px Consolas, monospace');

  // ── Top-center: timer + kills (skull) ───────────────────────────────────
  const mins = Math.floor(game.timeAlive / 60).toString().padStart(2, '0');
  const secs = Math.floor(game.timeAlive % 60).toString().padStart(2, '0');
  ctx.textAlign = 'center';
  drawText(ctx, `${mins}:${secs}`, WIDTH / 2, 42, WHITE, 'bold 26px Consolas, monospace');
  _drawSkull(ctx, WIDTH / 2 - 36, 60, '#d7dee6');
  ctx.textAlign = 'left';
  drawText(ctx, `KILLS ${p.kills}`, WIDTH / 2 - 24, 65, '#d7dee6', 'bold 15px Consolas, monospace');

  // Endless-mode marker (shown after a player chooses CONTINUE — ENDLESS)
  if (game.endless) {
    ctx.textAlign = 'center';
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 500));
    ctx.globalAlpha = pulse;
    drawText(ctx, '◆ ENDLESS ◆', WIDTH / 2, 84, GREEN, 'bold 13px Consolas, monospace');
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // ── Top-left: compact Network Overload (kept — drives the blackout mechanic) ──
  let oc = CYAN;
  if (game.overload > 60) oc = ORANGE;
  if (game.overload > 82) oc = RED;
  ctx.textAlign = 'left';
  drawText(ctx, 'OVERLOAD', 12, 22, '#7fa8c8', '11px Consolas, monospace');
  drawBar(ctx, 12, 28, 150, 8, game.overload, MAX_OVERLOAD, oc);
  drawText(ctx, `${game.overload.toFixed(0)}%`, 168, 37, oc, '11px Consolas, monospace');
  // Plain-language reminder of what the meter means (display-only).
  drawText(ctx, 'GRID COLLAPSE RISK', 12, 47, 'rgba(150,180,200,0.5)', '9px Consolas, monospace');

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

  // ── Bottom-left: Q Pulse Shield (magenta) + E EMP (cyan) ────────────────
  const by = HEIGHT - 62, bs = 44;
  const Q_COLOR = '#ff4dd2';   // neon magenta — distinct from E
  const qFrac = 1 - clamp(p.pulseShieldCooldown / p.pulseShieldMaxCooldown, 0, 1);
  _drawAbilityBox(ctx, 16, by, bs, 'Q', qFrac, p.pulseShieldCooldown <= 0,
    (cx, cy) => _glyphShield(ctx, cx, cy, bs, Q_COLOR), Q_COLOR);
  const empMax = Math.max(8, 12 - p.upgrades['EMP Cloud']);
  const eFrac  = 1 - clamp(p.empCloudCooldown / empMax, 0, 1);
  _drawAbilityBox(ctx, 16 + bs + 18, by, bs, 'E', eFrac, p.empCloudCooldown <= 0,
    (cx, cy) => _glyphEMP(ctx, cx, cy, bs, CYAN), CYAN);

  // ── Bottom-right: SPACE ultimate (mana-fill, frame tinted to character identity) ──
  if (p.selectedCharacter === 'skeleton_warrior' || p.selectedCharacter === 'cyber_arm_hero' || p.selectedCharacter === 'taekwondo_girl' || p.selectedCharacter === 'brawler_warrior' || p.selectedCharacter === 'assassin_clone' || p.selectedCharacter === 'japan_phasewalker' || p.selectedCharacter === 'euclid_vector') {
    const icon = p.selectedCharacter === 'skeleton_warrior' ? game._thunderGuitarSprite
               : p.selectedCharacter === 'cyber_arm_hero'   ? game._chainsIcon
               : p.selectedCharacter === 'brawler_warrior'  ? game._weaponImages?.skyfall_lances
               : p.selectedCharacter === 'assassin_clone'   ? game._assassinPhantomSprite  // Chrome Phantom Protocol (pink phantom clone)
               : p.selectedCharacter === 'japan_phasewalker' ? game._phasewalkerSprite      // Digital Singularity ultimate
               : p.selectedCharacter === 'euclid_vector'    ? game._euclidSprite            // Plague Trail Dash ultimate
               : 'bike';  // taekwondo_girl → Cyber Ride (canvas-drawn bike glyph; no sprite asset)
    // Frame/glow color by base character identity (outfits don't change selectedCharacter).
    const ultColor = p.selectedCharacter === 'skeleton_warrior' ? '#9fd8ff'   // electric blue-white
                   : p.selectedCharacter === 'cyber_arm_hero'   ? '#ff9b3c'   // hot amber
                   : p.selectedCharacter === 'brawler_warrior'  ? '#3cffb0'   // emerald nexus
                   : p.selectedCharacter === 'assassin_clone'   ? '#ff4dd2'   // neon pink / magenta
                   : p.selectedCharacter === 'japan_phasewalker' ? '#7df9ff'  // phase cyan (Digital Singularity)
                   : p.selectedCharacter === 'euclid_vector'    ? '#00ff66'   // toxic green (Plague Trail)
                   : '#3cf0e6';                                                // aqua spirit
    const manaFrac = clamp(p.mana / 100, 0, 1);   // ultimate is ready at the fixed 100 cost, not maxMana (Mana Core safe)
    const ultCasts = Math.floor(p.mana / 100);     // how many casts the current mana affords (display-only)
    _drawUltimateBox(ctx, WIDTH - 64, HEIGHT - 66, 48, 'SPACE', manaFrac, icon, ultColor, ultCasts);

    // One-shot "ULTIMATE READY" cue — shown briefly the moment the ultimate becomes castable
    // (timer set in Game._updateUltReady). Holds, then fades over its final 0.6s. Not a loop.
    if (game._ultReadyCue > 0) {
      const a     = clamp(game._ultReadyCue / 0.6, 0, 1);
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 90);
      ctx.save();
      ctx.globalAlpha = a * pulse;
      ctx.shadowColor = CYAN; ctx.shadowBlur = 8;
      ctx.textAlign = 'right';
      drawText(ctx, 'ULTIMATE READY', WIDTH - 16, HEIGHT - 92, '#cfeaff', 'bold 14px Consolas, monospace');
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // ── Bottom-center: HP / Mana numeric readout (display-only; reflects card/upgrade max increases) ──
  ctx.textAlign = 'center';
  drawText(ctx, `HP ${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`,    WIDTH / 2 - 80, HEIGHT - 14, '#ff8a98', 'bold 14px Consolas, monospace');
  drawText(ctx, `MP ${Math.ceil(p.mana)} / ${Math.round(p.maxMana)}`, WIDTH / 2 + 80, HEIGHT - 14, '#7fe0ff', 'bold 14px Consolas, monospace');
  ctx.textAlign = 'left';

  // First-run loop hint — teaches the core → matrix → overload loop without opening
  // Instructions. Auto-dismisses (fades out over its last 1.5s); upper third, never covers
  // the player at screen-centre. Skipped in Endless. Display-only (reads game.timeAlive).
  if (game.timeAlive < 6.5 && !game.endless && !game.gameOver && !game.victory) {
    const a = clamp((6.5 - game.timeAlive) / 1.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    drawText(ctx, 'PROTECT THE GRID', WIDTH / 2, 146, CYAN, 'bold 15px Consolas, monospace');
    drawText(ctx, 'Collect cores  →  return them to a Matrix  →  keep Overload under 100%',
             WIDTH / 2, 168, '#cfe6f5', '12px Consolas, monospace');
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Contextual: while carrying cores, spell out where they go (appears only when relevant).
  if (p.carry > 0) {
    ctx.textAlign = 'center';
    drawText(ctx, `CARRYING ${p.carry} CORE${p.carry === 1 ? '' : 'S'} → RETURN TO A NEXUS`,
             WIDTH / 2, HEIGHT - 30, '#ffd23c', 'bold 12px Consolas, monospace');
  }

  // Nexus-under-attack warning (banner + off-screen arrow) + objective reminder.
  _drawMatrixWarning(ctx, game);
  ctx.textAlign = 'center';
  // Aggregate cores across ALL Nexus points (not just matrices[0]) → "CORES X/32".
  const _mx = game.matrices || [];
  let _obj = 'DEFEND THE NEXUS GRID · RETURN CORES';
  if (_mx.length) {
    let _stored = 0, _cap = 0;
    for (const m of _mx) { _stored += m.stored; _cap += m.capacity; }
    _obj = `DEFEND THE NEXUS GRID · CORES ${Math.round(_stored)}/${_cap}`;
  }
  drawText(ctx, _obj, WIDTH / 2, HEIGHT - 14, 'rgba(150,180,200,0.5)', '12px Consolas, monospace');

  // Player visibility marker — drawn last in the HUD layer so it stays on top of enemies,
  // projectiles, rain, and effects during late-game chaos.
  _drawPlayerMarker(ctx, game);

  ctx.textAlign = 'left';
}

// Warns when a Power Matrix is being drained (matrix.hackTimer > 0, set by the steal logic —
// read-only here, no gameplay change). Shows a banner while any matrix is attacked, and an
// edge arrow pointing toward the most urgent one when it is off-screen. Gentle pulse, no hard
// blink. The most urgent = lowest stored charge, tie-broken by nearest the player.
function _drawMatrixWarning(ctx, game) {
  const matrices = game.matrices || [];
  let target = null;
  for (const m of matrices) {
    if (!(m.hackTimer > 0)) continue;
    if (!target) { target = m; continue; }
    if (m.stored < target.stored) { target = m; continue; }
    if (m.stored === target.stored && game.player) {
      const dm = (m.pos.x - game.player.pos.x) ** 2 + (m.pos.y - game.player.pos.y) ** 2;
      const dt = (target.pos.x - game.player.pos.x) ** 2 + (target.pos.y - game.player.pos.y) ** 2;
      if (dm < dt) target = m;
    }
  }
  if (!target) return;

  const now   = performance.now();
  const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.006));   // gentle, not a hard blink

  // ── On-screen banner (top-center, below the timer/overload row) ──
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.shadowColor = RED; ctx.shadowBlur = 8;
  ctx.textAlign = 'center';
  drawText(ctx, '‹ NEXUS UNDER ATTACK ›', WIDTH / 2, 118, '#ff5a3c', 'bold 16px Consolas, monospace');
  ctx.restore();
  ctx.globalAlpha = 1;

  // ── Off-screen directional arrow (only when the urgent matrix is off-screen) ──
  if (!game.camera) { ctx.textAlign = 'left'; return; }
  const sx = (target.pos.x - game.camera.x) * VIEW_SCALE;
  const sy = (target.pos.y - game.camera.y) * VIEW_SCALE;
  const onScreen = sx >= 0 && sx <= WIDTH && sy >= 0 && sy <= HEIGHT;
  if (!onScreen) {
    const cx0 = WIDTH / 2, cy0 = HEIGHT / 2;
    const dx = sx - cx0, dy = sy - cy0;
    const pad = 50, halfW = WIDTH / 2 - pad, halfH = HEIGHT / 2 - pad;
    const k = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
    const ex = cx0 + dx * k, ey = cy0 + dy * k;     // point on the inset screen edge
    const ang = Math.atan2(dy, dx);

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = '#ff5a3c';
    ctx.shadowColor = RED; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-9, -9); ctx.lineTo(-9, 9); ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffb070';
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEXUS', ex - Math.cos(ang) * 18, ey - Math.sin(ang) * 18 + 3);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
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

// Soft 0..1 pulse for "ready" cues — calm sine, never a hard blink.
function _readyPulse() { return 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(performance.now() / 320)); }

// Rounded-square ability box with a circular ready/cooldown ring + key label + % readout.
// `color` tints the frame/glyph/ring/label so Q (magenta) and E (cyan) read as distinct.
function _drawAbilityBox(ctx, x, y, s, label, frac, ready, glyphFn, color = CYAN) {
  const cx = x + s / 2, cy = y + s / 2;
  ctx.fillStyle = 'rgba(6,18,32,0.85)';
  ctx.beginPath(); ctx.roundRect(x, y, s, s, 6); ctx.fill();
  // Ready → colored border with a soft pulsing glow; not ready → dim, calm border.
  ctx.save();
  if (ready) {
    ctx.globalAlpha = _readyPulse();
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = 'rgba(120,150,170,0.45)'; ctx.lineWidth = 1.5;
  }
  ctx.beginPath(); ctx.roundRect(x, y, s, s, 6); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = ready ? 1 : 0.5;
  glyphFn(cx, cy);
  ctx.restore();
  _drawRing(ctx, cx, cy, s / 2 + 5, frac, ready, color);
  ctx.textAlign = 'center';
  drawText(ctx, label, cx, y - 8, ready ? color : '#90a4b4', 'bold 13px Consolas, monospace');
  drawText(ctx, `${Math.round(frac * 100)}%`, cx, y + s + 16, ready ? color : '#90a4b4', '11px Consolas, monospace');
}

// Bottom-right ultimate box: icon image + circular mana-fill ring. `color` = character identity.
function _drawUltimateBox(ctx, x, y, s, label, frac, icon, color = CYAN, casts = 0) {
  const cx = x + s / 2, cy = y + s / 2;
  const ready = frac >= 1;
  ctx.fillStyle = 'rgba(6,18,32,0.85)';
  ctx.beginPath(); ctx.roundRect(x, y, s, s, 6); ctx.fill();
  // Ready → character-colored border with a soft pulsing glow; not ready → dim but readable.
  ctx.save();
  if (ready) {
    ctx.globalAlpha = _readyPulse();
    ctx.shadowColor = color; ctx.shadowBlur = 11;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = 'rgba(120,150,170,0.5)'; ctx.lineWidth = 1.5;
  }
  ctx.beginPath(); ctx.roundRect(x, y, s, s, 6); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.45 + 0.55 * frac;
  _drawIcon(ctx, icon, x + 5, y + 5, s - 10, color);
  ctx.restore();
  _drawRing(ctx, cx, cy, s / 2 + 5, frac, ready, color);
  ctx.textAlign = 'center';
  drawText(ctx, label, cx, y - 8, ready ? color : '#90a4b4', 'bold 12px Consolas, monospace');
  drawText(ctx, `${Math.round(frac * 100)}%`, cx, y + s + 16, ready ? color : '#90a4b4', '11px Consolas, monospace');

  // Multi-cast stock indicator (display-only): casts = floor(mana / 100), so it drops immediately
  // after a cast spends 100 mana. 2+ adds a brighter second-color border; the badge shows the count.
  if (casts >= 1) {
    if (casts >= 2) {
      ctx.save();
      ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x - 2, y - 2, s + 4, s + 4, 7); ctx.stroke();
      ctx.restore();
    }
    const badge = casts >= 3 ? 'ULT x3+' : 'ULT x' + casts;
    ctx.save();
    ctx.font = 'bold 11px Consolas, monospace';
    const bw  = ctx.measureText(badge).width + 12;
    const bx  = x - bw - 6, byb = cy - 9;        // sits just left of the ult box (screen-edge safe)
    ctx.fillStyle = '#0b1626';
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(bx, byb, bw, 18, 4); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center';
    drawText(ctx, badge, bx + bw / 2, byb + 13, color, 'bold 11px Consolas, monospace');
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

// Circular gauge: dim full ring + bright arc sweeping clockwise from the top by `frac`.
function _drawRing(ctx, cx, cy, r, frac, ready, color = CYAN) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(40,70,90,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  if (frac > 0) {
    ctx.strokeStyle = ready ? color : 'rgba(120,150,170,0.7)';
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
  }
}

function _drawIcon(ctx, img, x, y, size, fallbackColor) {
  if (img === 'bike') { _glyphBike(ctx, x, y, size, fallbackColor); return; }
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
  }
}

// Lightweight Cyber Ride bike glyph (two wheels + frame + handlebar/seat) in the character color.
function _glyphBike(ctx, x, y, size, color = CYAN) {
  const cx = x + size / 2, r = size * 0.16;
  const wy = y + size * 0.66;
  const lwx = cx - size * 0.24, rwx = cx + size * 0.24;
  const hub = cx - size * 0.02, top = y + size * 0.40;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(lwx, wy, r, 0, Math.PI * 2); ctx.stroke();   // rear wheel
  ctx.beginPath(); ctx.arc(rwx, wy, r, 0, Math.PI * 2); ctx.stroke();   // front wheel
  ctx.beginPath();
  ctx.moveTo(lwx, wy); ctx.lineTo(hub, top); ctx.lineTo(rwx, wy);       // frame triangle
  ctx.lineTo(rwx + size * 0.10, top);                                   // fork up to bars
  ctx.moveTo(hub, top); ctx.lineTo(hub - size * 0.05, top - size * 0.12); // seat post
  ctx.stroke();
  ctx.restore();
}

function _glyphShield(ctx, cx, cy, s, color = CYAN) {
  const w = s * 0.42, h = s * 0.52;
  ctx.fillStyle = 'rgba(255,77,210,0.16)';
  ctx.strokeStyle = color; ctx.lineWidth = 2;
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

function _glyphEMP(ctx, cx, cy, s, color = CYAN) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.6;
  for (let i = 1; i <= 3; i++) {
    ctx.globalAlpha = 1 - i * 0.22;
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.1 * i, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
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

    // Death-cause clarity (display only): translate finalMessage into a plain
    // "why you lost" line + a matching tip. Does not affect any game logic.
    let cause = '', hint = '';
    if (game.finalMessage === 'CITY GRID TOTAL BLACKOUT') {
      cause = 'CAUSE: OVERLOAD REACHED 100%';
      hint  = 'DEFEND THE NEXUS · RETURN CORES TO REDUCE OVERLOAD';
    } else if (game.finalMessage === 'CYBER-HERO OFFLINE') {
      cause = 'CAUSE: HERO DEFEATED';
      hint  = 'UPGRADE HP · USE PHENIX REVIVES WISELY';
    }
    if (cause) {
      ctx.font      = 'bold 20px Consolas, monospace';
      ctx.fillStyle = '#ff6a7a';
      ctx.fillText(cause, WIDTH / 2, 112);
      ctx.font      = '13px Consolas, monospace';
      ctx.fillStyle = 'rgba(150,180,200,0.75)';
      ctx.fillText(hint, WIDTH / 2, 134);
    }
  }

  const mins = Math.floor(game.timeAlive / 60).toString().padStart(2, '0');
  const secs = Math.floor(game.timeAlive % 60).toString().padStart(2, '0');
  const lx = WIDTH / 2 - 280;
  const rx = WIDTH / 2 + 280;
  let y = game.victory ? 130 : 158;

  // New high score banner (suppressed in Endless — Endless shows per-record ★ NEW BEST below)
  if (game.isNewHighScore && !game.endless) {
    ctx.font      = 'bold 26px Consolas, monospace';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.fillText('★  NEW HIGH SCORE!  ★', WIDTH / 2, y);
    y += 38;
  }

  if (game.endless && game.endlessRun) {
    // ── Endless mode: THIS RUN vs BEST personal records ──────────────────────
    y = _drawEndlessRecords(ctx, game, y, lx, rx);
    // Newly-earned Endless achievements (this run only) — under the records panel.
    if (game.endlessNewAchievements && game.endlessNewAchievements.length) {
      y = _drawEndlessAchievements(ctx, game, y);
    }
  } else {
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

// Endless personal-records panel for the end screen: THIS RUN vs BEST for Time / Score / Level,
// with a gold ★ NEW BEST tag on any record this run set. Display-only; reads the snapshot set in
// Game._grantRewards (endlessRun / endlessBest / endlessNewBest). Returns the next y.
function _drawEndlessRecords(ctx, game, startY, lx, rx) {
  const run   = game.endlessRun     || { time: 0, score: 0, level: 0 };
  const best  = game.endlessBest    || run;
  const isNew = game.endlessNewBest || {};

  const fmtTime = (s) => {
    const m = Math.floor((s || 0) / 60).toString().padStart(2, '0');
    const c = Math.floor((s || 0) % 60).toString().padStart(2, '0');
    return `${m}:${c}`;
  };
  const fmtNum = (n) => Math.floor(n || 0).toLocaleString();

  let y = startY;

  // Header
  ctx.font      = 'bold 22px Consolas, monospace';
  ctx.fillStyle = GREEN;
  ctx.textAlign = 'center';
  ctx.fillText('◆ ENDLESS RECORDS ◆', WIDTH / 2, y);
  y += 34;

  // Column anchors (right edges of the THIS RUN / BEST value columns)
  const runR  = WIDTH / 2 + 90;
  const bestR = WIDTH / 2 + 250;
  const tagX  = WIDTH / 2 + 262;   // left edge of the ★ NEW BEST tag

  // Column headers
  ctx.font      = '14px Consolas, monospace';
  ctx.fillStyle = '#7fa8c8';
  ctx.textAlign = 'right';
  ctx.fillText('THIS RUN', runR, y);
  ctx.fillText('BEST', bestR, y);
  y += 26;

  const rows = [
    ['TIME',  fmtTime(run.time),  fmtTime(best.time),  isNew.time],
    ['SCORE', fmtNum(run.score),  fmtNum(best.score),  isNew.score],
    ['LEVEL', fmtNum(run.level),  fmtNum(best.level),  isNew.level],
  ];

  for (const [label, runV, bestV, beat] of rows) {
    ctx.font      = '22px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = CYAN;
    ctx.fillText(label, lx, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = beat ? '#FFD700' : WHITE;
    ctx.fillText(runV, runR, y);
    ctx.fillStyle = beat ? '#FFD700' : YELLOW;
    ctx.fillText(bestV, bestR, y);

    if (beat) {
      ctx.textAlign = 'left';
      ctx.font      = 'bold 14px Consolas, monospace';
      ctx.fillStyle = '#FFD700';
      ctx.fillText('★ NEW BEST', tagX, y);
    }
    y += 30;
  }

  ctx.textAlign = 'left';
  return y;
}

// Newly-earned Endless achievements panel for the end screen: a gold "ACHIEVEMENTS UNLOCKED"
// header + a ★ line per achievement earned THIS run (already-earned ones are filtered out in
// MetaProgress before this point). Laid out in columns of up to 3 rows so even a big first run
// that earns several at once stays clean and never overlaps the buttons. Display-only.
function _drawEndlessAchievements(ctx, game, startY) {
  const items = game.endlessNewAchievements || [];
  if (!items.length) return startY;

  let y = startY + 14;

  ctx.font      = 'bold 18px Consolas, monospace';
  ctx.fillStyle = GREEN;
  ctx.textAlign = 'center';
  ctx.fillText('ACHIEVEMENTS UNLOCKED', WIDTH / 2, y);
  y += 28;

  const perCol = 3;
  const lineH  = 22;
  const colW   = 260;
  const cols   = Math.ceil(items.length / perCol);
  const rows   = Math.min(perCol, items.length);
  const startX = WIDTH / 2 - (cols * colW) / 2;

  ctx.font = '16px Consolas, monospace';
  for (let i = 0; i < items.length; i++) {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const cx  = startX + col * colW + colW / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('★ ' + items[i].name, cx, y + row * lineH);
  }

  ctx.textAlign = 'left';
  return y + rows * lineH;
}
