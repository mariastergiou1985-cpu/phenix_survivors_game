// ════════════════════════════════════════════════════════════════════════════════
// FUSION ARMORY art library — shared premium-rendering helpers (node-canvas).
// Όλα deterministic (seeded PRNG ανά fusion) ώστε η αναπαραγωγή να είναι ακριβής.
// Στόχος: μεγάλο κεντρικό weapon, καθαρή silhouette, transparent RGBA 1024×1024,
// διαφορετική palette ανά fusion, στοιχεία και των 3 components σε κάθε εικόνα.
// ════════════════════════════════════════════════════════════════════════════════
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}
export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
export function mix(hexA, hexB, t) {
  const A = hexToRgb(hexA), B = hexToRgb(hexB);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Πολλαπλό glow pass γύρω από ένα path: draw(ctx) γεμίζει/χαράσσει το σχήμα.
export function glow(ctx, draw, color, { blurs = [60, 30, 12], alphas = [0.25, 0.35, 0.6], composite = 'lighter' } = {}) {
  for (let i = 0; i < blurs.length; i++) {
    ctx.save();
    ctx.globalCompositeOperation = composite;
    ctx.shadowColor = color;
    ctx.shadowBlur = blurs[i];
    ctx.globalAlpha = alphas[i];
    draw(ctx);
    ctx.restore();
  }
}

// Κεραυνός/ενεργειακό τόξο ανάμεσα σε 2 σημεία με deterministic τρέμουλο.
export function lightning(ctx, x1, y1, x2, y2, { seg = 9, jag = 18, width = 5, color = '#9be8ff', core = '#ffffff', rnd = Math.random } = {}) {
  const pts = [[x1, y1]];
  for (let i = 1; i < seg; i++) {
    const t = i / seg;
    const nx = x1 + (x2 - x1) * t, ny = y1 + (y2 - y1) * t;
    const px = -(y2 - y1), py = (x2 - x1);
    const L = Math.hypot(px, py) || 1;
    const o = (rnd() * 2 - 1) * jag * Math.sin(Math.PI * t);
    pts.push([nx + (px / L) * o, ny + (py / L) * o]);
  }
  pts.push([x2, y2]);
  const stroke = (w, c, a, blur) => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = c; ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  };
  stroke(width * 2.6, color, 0.35, 24);
  stroke(width * 1.4, color, 0.7, 10);
  stroke(width * 0.6, core, 0.95, 0);
  return pts;
}

// Μεταλλική ράβδος/λεπίδα gradient (σκοτεινό πλάι, φωτεινή ράχη, rim light).
export function metalGrad(ctx, x1, y1, x2, y2, base, lite, dark) {
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0.0, dark);
  g.addColorStop(0.35, base);
  g.addColorStop(0.52, lite);
  g.addColorStop(0.68, base);
  g.addColorStop(1.0, dark);
  return g;
}

// Ember/σπινθήρες γύρω από σημείο.
export function embers(ctx, cx, cy, r, n, color, rnd, { size = [1.5, 4.5], alpha = [0.25, 0.9] } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const s = size[0] + rnd() * (size[1] - size[0]);
    ctx.globalAlpha = alpha[0] + rnd() * (alpha[1] - alpha[0]);
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Ενεργειακός δακτύλιος (πλήρης ή τόξο) με glow.
export function energyRing(ctx, cx, cy, r, color, { width = 8, a0 = 0, a1 = Math.PI * 2, alpha = 0.9, blur = 22, dash = null } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.shadowColor = color; ctx.shadowBlur = blur;
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
  ctx.restore();
}

// Μαλακή ενεργειακή σφαίρα-πυρήνας.
export function orb(ctx, cx, cy, r, inner, outer, { alpha = 1 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Λάμψη-αστέρι (4 ακτίνες) — highlights σε αιχμές.
export function sparkle(ctx, x, y, r, color, { alpha = 0.9, thin = 0.16 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 12;
  for (const rot of [0, Math.PI / 2]) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, -r * thin, 0, -r * thin);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.quadraticCurveTo(0, r * thin, 0, r * thin);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  orb(ctx, x, y, r * 0.5, color, rgba(color, 0.4));
  ctx.restore();
}

// Βαρυτικός στρόβιλος: σπειροειδείς γραμμές που καταλήγουν σε σκοτεινό κέντρο.
export function gravitySwirl(ctx, cx, cy, r, color, rnd, { arms = 5, turns = 1.8, width = 3.5, alpha = 0.7, darkCore = true } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < arms; k++) {
    const off = (k / arms) * Math.PI * 2 + rnd() * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.02) {
      const ang = off + t * turns * Math.PI * 2;
      const rr = r * (1 - t * 0.92);
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * 0.92;
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  if (darkCore) {
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.34);
    g.addColorStop(0, 'rgba(2,2,8,0.95)');
    g.addColorStop(0.75, 'rgba(4,4,14,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// Rim light κατά μήκος ενός path (ξαναχαράσσει την ακμή με φωτεινή λεπτή γραμμή).
export function rim(ctx, draw, color, { width = 2.5, alpha = 0.85, blur = 10 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color; ctx.shadowBlur = blur;
  draw(ctx);
  ctx.restore();
}

// Καθαρισμός ημι-διαφανών «σκουπιδιών» alpha (< κατώφλι) — καθαρή silhouette,
// όχι square artifacts. Επιστρέφει bounding box του ορατού περιεχομένου.
export function cleanAlpha(canvas, threshold = 8) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < threshold) { d[i] = 0; continue; }
    const p = (i - 3) / 4, x = p % canvas.width, y = (p / canvas.width) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  ctx.putImageData(img, 0, 0);
  return { minX, minY, maxX, maxY };
}
