/**
 * WeatherTheater — shared cinematic engine for EVERY screen-wide event/weather in PHENIX.
 * Canvas 2D, screen-space, STATELESS: every particle position derives from (index, time),
 * so there are zero per-particle arrays, zero allocations per frame, zero cleanup bugs.
 *
 * Presets (stackable — the game calls any that are active each frame):
 *   acid      – 3-depth diagonal toxic rain, ground splash rings, rising corrosion bubbles,
 *               dripping green vignette
 *   lava      – molten comets with fire trails, embers drifting UP, heat-shimmer bands,
 *               pulsing orange edge glow
 *   sleet     – slanted ice needles in 2 depths, crystalline glints, frost creeping
 *               from the corners
 *   raid      – rocket bombardment ambience: red alert edge pulse, falling streak flashes,
 *               drifting smoke columns
 *   blackout  – system failure: flickering darkness, red scan sweep, corner static ticks
 *
 * All presets accept (ctx, t, W, H, intensity 0..1) and draw additively where it matters.
 */

const pr = (i, salt = 0) => { const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return v - Math.floor(v); };

export class WeatherTheater {

  // ── ACID RAIN ────────────────────────────────────────────────────────────────
  acid(ctx, t, W, H, k = 1) {
    ctx.save();
    // dripping green vignette (top-heavy — the sky is poisoned)
    const vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, `rgba(20,90,30,${0.22 * k})`);
    vg.addColorStop(0.35, 'rgba(0,40,10,0.06)');
    vg.addColorStop(1, `rgba(0,50,20,${0.10 * k})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // three depth layers of diagonal rain (far = thin/slow/dim, near = thick/fast/bright)
    const layers = [
      { n: 26, sp: 240, len: 14, wdt: 1,   al: 0.25, drift: 0.18 },
      { n: 22, sp: 330, len: 22, wdt: 1.6, al: 0.45, drift: 0.22 },
      { n: 14, sp: 460, len: 34, wdt: 2.2, al: 0.7,  drift: 0.26 },
    ];
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#54ff9a'; ctx.lineCap = 'round';
    for (let L = 0; L < layers.length; L++) {
      const l = layers[L];
      ctx.lineWidth = l.wdt;
      for (let i = 0; i < l.n; i++) {
        const seedX = pr(i, L) * (W + 120) - 60;
        const ph = pr(i, L + 9);
        const prog = ((t * l.sp) / (H + 80) + ph) % 1;
        const x = seedX + prog * (H + 80) * l.drift;
        const y = prog * (H + 80) - 40;
        ctx.globalAlpha = l.al * k;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + l.len * l.drift, y + l.len);
        ctx.stroke();
        // splash ring right at the bottom edge
        if (prog > 0.94) {
          const sk = (prog - 0.94) / 0.06;
          ctx.globalAlpha = (1 - sk) * l.al * k;
          ctx.beginPath();
          ctx.ellipse(x + l.len * l.drift, H - 6, 4 + sk * 12, 1.5 + sk * 4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    // rising corrosion bubbles along the ground line
    ctx.fillStyle = '#9dffc4';
    for (let i = 0; i < 10; i++) {
      const cyc = (t * (0.25 + pr(i, 33) * 0.3) + pr(i, 44)) % 1;
      ctx.globalAlpha = Math.sin(cyc * Math.PI) * 0.35 * k;
      ctx.beginPath();
      ctx.arc(pr(i, 55) * W, H - 4 - cyc * 26, 1.5 + pr(i, 66) * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── LAVA RAIN ────────────────────────────────────────────────────────────────
  lava(ctx, t, W, H, k = 1) {
    ctx.save();
    // pulsing molten edge glow (bottom-heavy — the ground burns)
    const pulse = 0.8 + 0.2 * Math.sin(t * 3.1);
    const vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, `rgba(120,20,0,${0.16 * k})`);
    vg.addColorStop(0.6, 'rgba(60,10,0,0.05)');
    vg.addColorStop(1, `rgba(255,80,0,${0.14 * k * pulse})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    // molten comets streaking down with fire trails
    for (let i = 0; i < 12; i++) {
      const seedX = pr(i, 3) * (W + 100) - 50;
      const ph = pr(i, 7);
      const prog = ((t * (300 + pr(i, 5) * 160)) / (H + 100) + ph) % 1;
      const drift = 0.12 + pr(i, 11) * 0.1;
      const x = seedX + prog * (H + 100) * drift;
      const y = prog * (H + 100) - 50;
      // trail (3 fading segments)
      for (let s = 0; s < 3; s++) {
        ctx.globalAlpha = (0.55 - s * 0.16) * k;
        ctx.strokeStyle = s === 0 ? '#ffd23c' : '#ff5a00';
        ctx.lineWidth = 3 - s * 0.8;
        ctx.beginPath();
        ctx.moveTo(x - (s + 1) * 6 * drift, y - (s + 1) * 9);
        ctx.lineTo(x - s * 6 * drift, y - s * 9);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9 * k;                          // comet head
      ctx.fillStyle = '#fff4d8';
      ctx.beginPath(); ctx.arc(x, y, 2.4 + pr(i, 13) * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // embers drifting UP from the ground
    ctx.fillStyle = '#ffb43c';
    for (let i = 0; i < 14; i++) {
      const cyc = (t * (0.2 + pr(i, 21) * 0.25) + pr(i, 22)) % 1;
      const sway = Math.sin(t * 2 + i) * 14;
      ctx.globalAlpha = Math.sin(cyc * Math.PI) * 0.5 * k;
      ctx.beginPath();
      ctx.arc(pr(i, 23) * W + sway, H - cyc * H * 0.55, 1.2 + pr(i, 24) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // heat-shimmer bands (thin translucent waves near the ground)
    ctx.globalAlpha = 0.06 * k;
    ctx.fillStyle = '#ffdf9a';
    for (let b = 0; b < 3; b++) {
      const by = H - 40 - b * 34 + Math.sin(t * 2.2 + b * 2) * 6;
      ctx.fillRect(0, by, W, 8);
    }
    ctx.restore();
  }

  // ── FROZEN SLEET ─────────────────────────────────────────────────────────────
  sleet(ctx, t, W, H, k = 1) {
    ctx.save();
    // cold cast + frost creeping from the corners
    ctx.fillStyle = `rgba(160,220,255,${0.07 * k})`;
    ctx.fillRect(0, 0, W, H);
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260);
      fg.addColorStop(0, `rgba(200,240,255,${0.16 * k})`);
      fg.addColorStop(1, 'rgba(200,240,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(cx, cy, 260, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    // slanted ice needles, 2 depths
    ctx.strokeStyle = '#cfeeff'; ctx.lineCap = 'round';
    for (let L = 0; L < 2; L++) {
      const n = L ? 18 : 26, sp = L ? 520 : 360, len = L ? 26 : 16;
      ctx.lineWidth = L ? 2 : 1.2;
      for (let i = 0; i < n; i++) {
        const seedX = pr(i, L + 40) * (W + 200) - 100;
        const prog = ((t * sp) / (H + 60) + pr(i, L + 41)) % 1;
        const x = seedX + prog * (H + 60) * 0.42;         // strong wind slant
        const y = prog * (H + 60) - 30;
        ctx.globalAlpha = (L ? 0.6 : 0.32) * k;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * 0.42, y + len); ctx.stroke();
      }
    }
    // crystalline glints
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      const gk = (t * (0.6 + pr(i, 50) * 0.7) + pr(i, 51)) % 1;
      const ga = Math.max(0, Math.sin(gk * Math.PI * 2));
      const gx = pr(i, 52) * W, gy = pr(i, 53) * H * 0.8, gl = 3 + pr(i, 54) * 3;
      ctx.globalAlpha = ga * 0.7 * k;
      ctx.beginPath();
      ctx.moveTo(gx - gl, gy); ctx.lineTo(gx + gl, gy);
      ctx.moveTo(gx, gy - gl); ctx.lineTo(gx, gy + gl);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  // ── ROCKET RAID (bombardment ambience under the rocket telegraphs) ─────────
  raid(ctx, t, W, H, k = 1) {
    ctx.save();
    // red alert edge pulse
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const eg = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.75);
    eg.addColorStop(0, 'rgba(255,40,40,0)');
    eg.addColorStop(1, `rgba(255,40,40,${(0.10 + 0.08 * pulse) * k})`);
    ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    // falling streak flashes (incoming ordnance glints)
    for (let i = 0; i < 6; i++) {
      const cyc = (t * (0.8 + pr(i, 60) * 0.6) + pr(i, 61)) % 1;
      const x = pr(i, 62) * W, y = cyc * H * 0.5;
      ctx.globalAlpha = Math.max(0, 1 - cyc * 1.6) * 0.6 * k;
      ctx.strokeStyle = '#ffd0b0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 8, y - 26); ctx.lineTo(x, y); ctx.stroke();
    }
    // drifting smoke columns
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 4; i++) {
      const sx = pr(i, 70) * W;
      for (let s = 0; s < 4; s++) {
        const cyc = (t * 0.12 + pr(i * 4 + s, 71)) % 1;
        ctx.globalAlpha = Math.sin(cyc * Math.PI) * 0.10 * k;
        ctx.fillStyle = '#301818';
        ctx.beginPath();
        ctx.arc(sx + Math.sin(cyc * 5 + i) * 18, H - cyc * H * 0.7, 18 + cyc * 26, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ── WHITEOUT (Glacial hazard — replaces the flat white radial fog) ─────────
  whiteout(ctx, t, W, H, k = 1) {
    ctx.save();
    // swirling snow in 2 depths
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    for (let L = 0; L < 2; L++) {
      const n = L ? 16 : 24, sp = L ? 90 : 55;
      for (let i = 0; i < n; i++) {
        const cyc = ((t * sp) / (H + 40) + pr(i, L + 90)) % 1;
        const sway = Math.sin(t * (0.8 + pr(i, L + 91)) + i) * 40;
        ctx.globalAlpha = (L ? 0.5 : 0.25) * k;
        ctx.beginPath();
        ctx.arc(pr(i, L + 92) * W + sway, cyc * (H + 40) - 20, L ? 2.2 : 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // frost crystals growing on the screen edges
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#e6f4ff'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 10; i++) {
      const edge = i % 4;
      const px2 = edge === 0 ? pr(i, 95) * W : edge === 1 ? pr(i, 95) * W : edge === 2 ? 0 : W;
      const py2 = edge === 0 ? 0 : edge === 1 ? H : pr(i, 96) * H;
      const len = (14 + pr(i, 97) * 22) * k;
      const dir = edge === 0 ? Math.PI / 2 : edge === 1 ? -Math.PI / 2 : edge === 2 ? 0 : Math.PI;
      ctx.globalAlpha = 0.5 * k;
      ctx.beginPath(); ctx.moveTo(px2, py2);
      ctx.lineTo(px2 + Math.cos(dir + 0.4) * len, py2 + Math.sin(dir + 0.4) * len);
      ctx.moveTo(px2, py2);
      ctx.lineTo(px2 + Math.cos(dir - 0.4) * len, py2 + Math.sin(dir - 0.4) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── ABYSSAL MURK (deep-sea darkness with life in it) ───────────────────────
  murk(ctx, t, W, H, k = 1) {
    ctx.save();
    // drifting bioluminescent motes
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const cyc = (t * (0.05 + pr(i, 100) * 0.06) + pr(i, 101)) % 1;
      const gl = 0.4 + 0.6 * Math.sin(t * (1 + pr(i, 102)) + i);
      ctx.globalAlpha = Math.max(0, gl) * 0.30 * k;
      ctx.fillStyle = i % 3 ? '#3a7dc9' : '#6fd0ff';
      ctx.beginPath();
      ctx.arc(pr(i, 103) * W, ((pr(i, 104) + cyc) % 1) * H, 1.4 + pr(i, 105) * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // slow shadow shapes gliding past behind everything (source-over dark blobs)
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 3; i++) {
      const cyc = (t * 0.03 * (1 + i * 0.4) + pr(i, 110)) % 1.4 - 0.2;
      ctx.globalAlpha = 0.12 * k;
      ctx.fillStyle = '#020817';
      ctx.beginPath();
      ctx.ellipse(cyc * W * 1.2, pr(i, 111) * H, 130 + i * 50, 26 + i * 8, Math.sin(t * 0.2 + i) * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // pressure rings drifting up (very faint)
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#2f5f9f'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const cyc = (t * 0.1 + pr(i, 112)) % 1;
      ctx.globalAlpha = Math.sin(cyc * Math.PI) * 0.18 * k;
      ctx.beginPath();
      ctx.arc(pr(i, 113) * W, H - cyc * H, 8 + cyc * 26, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // ── GRID BLACKOUT (system failure ambience over the existing darkness) ─────
  blackout(ctx, t, W, H, k = 1) {
    ctx.save();
    // irregular brightness flicker (subtle — readability preserved)
    const fl = pr(Math.floor(t * 14), 80) < 0.12 ? 0.08 : 0;
    if (fl > 0) { ctx.fillStyle = `rgba(120,10,10,${fl * k})`; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'lighter';
    // red diagnostic scan sweep
    const sy = ((t * 0.14) % 1) * (H + 120) - 60;
    const sg = ctx.createLinearGradient(0, sy - 24, 0, sy + 24);
    sg.addColorStop(0, 'rgba(255,50,50,0)');
    sg.addColorStop(0.5, `rgba(255,50,50,${0.10 * k})`);
    sg.addColorStop(1, 'rgba(255,50,50,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, sy - 24, W, 48);
    // corner static ticks
    ctx.fillStyle = '#ff5050';
    for (let i = 0; i < 6; i++) {
      if (pr(Math.floor(t * 8) + i, 81) < 0.4) continue;
      const cx = (i % 2) ? W - 30 - pr(i, 82) * 60 : 30 + pr(i, 82) * 60;
      const cy = (i < 3) ? 20 + pr(i, 83) * 24 : H - 20 - pr(i, 83) * 24;
      ctx.globalAlpha = 0.5 * k;
      ctx.fillRect(cx, cy, 6 + pr(i, 84) * 10, 2);
    }
    ctx.restore();
  }
}
