// ════════════════════════════════════════════════════════════════════════════════
// PHENIX: NULL EDEN — legacy portraits/posters replacement (batch 2026-08-08, v2).
// 3 procedural κομμάτια στην τεχνική των ultimates (Canvas 2D, deterministic):
//   1) assets/characters/taekwondo_girl.png      1023×1537  (char select + in-game sprite)
//   2) assets/ui/main_menu_trio.png               940×1230  (protagonist trio poster)
//   3) assets/ui/vilian main menu fist theme .png 1537×1023 (villain theme)
// Τεχνική: bone-based φιγούρες (tapered capsules) + διπλό silhouette pass για rim
// lighting + εσωτερικές ενεργειακές ραφές. node tools/art/generate_legacy_portraits.mjs
// ════════════════════════════════════════════════════════════════════════════════
import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, seedFromString, rgba, mix, glow, lightning, metalGrad, embers,
         energyRing, orb, sparkle, gravitySwirl, rim, cleanAlpha } from './fusion_art_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT  = process.env.ART_OUT || ROOT;

function save(rel, canvas) {
  const out = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log('  ✔', rel, `${canvas.width}×${canvas.height}`);
}

// ── bone-figure helpers ────────────────────────────────────────────────────────
// Tapered capsule ανάμεσα σε 2 «αρθρώσεις» (κύκλοι r1/r2 + τραπέζιο που τους δένει).
function capsulePath(ctx, x1, y1, r1, x2, y2, r2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.moveTo(x1 + Math.cos(a + Math.PI / 2) * r1, y1 + Math.sin(a + Math.PI / 2) * r1);
  ctx.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2);
  ctx.lineTo(x2 + Math.cos(a - Math.PI / 2) * r2, y2 + Math.sin(a - Math.PI / 2) * r2);
  ctx.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}
// Ζωγραφίζει ολόκληρη φιγούρα (λίστα bones + κύκλοι) ΔΥΟ φορές: κάτω φωτεινή
// offset στη φορά του φωτός (rim), πάνω σκούρα. Έπειτα optional glow-stroke.
function drawFigure(ctx, bones, circles, { fill = '#0a0e1c', rimCol = '#2ee6f6',
    rimDx = -7, rimDy = -7, rimBlur = 26, rimAlpha = 0.95, glowStroke = null } = {}) {
  const paint = (dx, dy, style, blur, alphaV, asStroke = false, lw = 4) => {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.globalAlpha = alphaV;
    if (blur) { ctx.shadowColor = style; ctx.shadowBlur = blur; }
    ctx.beginPath();
    for (const [x1, y1, r1, x2, y2, r2] of bones) capsulePath(ctx, x1, y1, r1, x2, y2, r2);
    for (const [cx, cy, r] of circles) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
    if (asStroke) { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.stroke(); }
    else { ctx.fillStyle = style; ctx.fill(); }
    ctx.restore();
  };
  paint(rimDx, rimDy, rimCol, rimBlur, rimAlpha);        // φωτεινό underlayer → rim
  paint(rimDx * 0.4, rimDy * 0.4, mix(rimCol, '#ffffff', 0.5), 10, 0.9);
  paint(0, 0, fill, 0, 1);                               // σκούρα μάζα από πάνω
  if (glowStroke) paint(0, 0, glowStroke, 14, 0.35, true, 3);
}
// Ενεργειακή ραφή (γραμμή πάνω στη σκούρα μάζα).
function seam(ctx, pts, col, { w = 4, a = 0.9, blur = 14 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = a;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = col; ctx.shadowBlur = blur;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) {
    if (p.length === 4) ctx.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else ctx.lineTo(p[0], p[1]);
  }
  ctx.stroke();
  ctx.restore();
}
// Κορδέλα φωτός (για μαλλιά/υφάσματα-ενέργεια): bezier με μεταβλητό πλάτος.
function ribbon(ctx, p0, p1, p2, p3, w0, w1, col, { alpha = 0.9, blur = 18, core = null } = {}) {
  const B = (t, a, b, c, d) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };
  const pts = [];
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const x = B(t, p0[0], p1[0], p2[0], p3[0]);
    const y = B(t, p0[1], p1[1], p2[1], p3[1]);
    pts.push([x, y, w0 + (w1 - w0) * t]);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = col; ctx.shadowBlur = blur;
  ctx.fillStyle = col; ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < pts.length - 1; i++) {
    const [x, y, w] = pts[i], [x2, y2] = pts[i + 1];
    const a = Math.atan2(y2 - y, x2 - x);
    const px = Math.cos(a + Math.PI / 2), py = Math.sin(a + Math.PI / 2);
    if (i === 0) ctx.moveTo(x + px * w, y + py * w);
    ctx.lineTo(x2 + px * w, y2 + py * w);
  }
  for (let i = pts.length - 1; i > 0; i--) {
    const [x, y, w] = pts[i];
    const [xp, yp] = pts[i - 1];
    const a = Math.atan2(y - yp, x - xp);
    const px = Math.cos(a - Math.PI / 2), py = Math.sin(a - Math.PI / 2);
    ctx.lineTo(x + px * w, y + py * w);
  }
  ctx.closePath(); ctx.fill();
  if (core) {
    ctx.strokeStyle = core; ctx.lineWidth = Math.max(2, w1 * 0.5); ctx.globalAlpha = alpha;
    ctx.shadowBlur = blur * 0.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ════════════════════════════════════════════════════════════════════════════════
// 01 · NEON TAEKWONDO GIRL — SPIRIT FORM (1023×1537, transparent)
// «Velocity anomaly»: ολογραφική spirit-μορφή σε ιπτάμενη πλάγια κλωτσιά.
// Σώμα από φως (λευκό-cyan hologram) με dobok-πάνελ, μαύρη ζώνη που ανεμίζει,
// μαλλιά-κορδέλες magenta φωτός, crescent τροχιά κάτω από την κλωτσιά.
// ════════════════════════════════════════════════════════════════════════════════
function genTaekwondoGirl() {
  const W = 1023, H = 1537;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const rnd = mulberry32(seedFromString('taekwondo_spirit_2026'));
  const CYA = '#3cf0e6', ICE = '#d9fffb', MAG = '#ff4fa0', INK = '#0b1526';

  // ── πίσω σκηνικό-αύρα: μεγάλο crescent τροχιάς + ταχύτητα ──
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = CYA; ctx.lineWidth = 34; ctx.globalAlpha = 0.4;
  ctx.shadowColor = CYA; ctx.shadowBlur = 60;
  ctx.beginPath(); ctx.arc(360, 1080, 560, -Math.PI * 0.78, -Math.PI * 0.02); ctx.stroke();
  ctx.lineWidth = 10; ctx.globalAlpha = 0.85; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(360, 1080, 560, -Math.PI * 0.74, -Math.PI * 0.05); ctx.stroke();
  ctx.restore();
  // speed-lines πίσω από τη φιγούρα (κατεύθυνση κίνησης: πάνω-δεξιά)
  for (let i = 0; i < 16; i++) {
    const t = rnd();
    const x = 120 + t * 420, y = 1180 - t * 520 + (rnd() - 0.5) * 160;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(i % 3 ? CYA : ICE, 0.12 + rnd() * 0.22);
    ctx.lineWidth = 3 + rnd() * 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 150 - rnd() * 200, y + 90 + rnd() * 120); ctx.stroke();
    ctx.restore();
  }

  // ── πόζα (ιπτάμενη πλάγια κλωτσιά προς πάνω-δεξιά) — αθλητική μάζα ──
  const HEAD = [330, 545, 72];
  const chest = [400, 700], pelvis = [475, 845];
  const kickKnee = [645, 745], kickAnkle = [805, 645], kickFoot = [880, 598];
  const foldKnee = [475, 1020], foldAnkle = [350, 1085], foldFoot = [290, 1115];
  const lShoulder = [365, 665], lElbow = [235, 745], lFist = [148, 852];
  const rShoulder = [432, 685], rElbow = [505, 562], rFist = [565, 458];

  // hologram gradient fill για το σώμα
  const holo = ctx.createLinearGradient(200, 500, 900, 1100);
  holo.addColorStop(0, 'rgba(224,255,253,0.97)');
  holo.addColorStop(0.5, 'rgba(96,244,234,0.93)');
  holo.addColorStop(1, 'rgba(28,140,168,0.88)');

  const bones = [
    // κορμός (φαρδύς στο στήθος, στενεύει στη μέση) + λαιμός
    [...chest, 96, ...pelvis, 74],
    [...chest, 66, HEAD[0] + 16, HEAD[1] + 56, 34],
    // πόδι κλωτσιάς (γεμάτος μηρός/κνήμη/πέλμα)
    [...pelvis, 72, ...kickKnee, 54],
    [...kickKnee, 50, ...kickAnkle, 36],
    [...kickAnkle, 33, ...kickFoot, 26],
    // διπλωμένο πόδι
    [...pelvis, 70, ...foldKnee, 52],
    [...foldKnee, 48, ...foldAnkle, 34],
    [...foldAnkle, 31, ...foldFoot, 24],
    // χέρια (πιο γεμάτα)
    [...lShoulder, 42, ...lElbow, 32], [...lElbow, 30, ...lFist, 28],
    [...rShoulder, 42, ...rElbow, 32], [...rElbow, 30, ...rFist, 28],
  ];
  const circles = [HEAD];

  // rim + σώμα: εδώ το «σκούρο» στρώμα είναι το hologram gradient (φωτεινό σώμα!)
  // κάτω στρώμα: έντονο cyan glow ώστε να υπάρχει λάμψη-περίγραμμα.
  const paint = (dx, dy, style, blur, alphaV) => {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.globalAlpha = alphaV;
    if (blur) { ctx.shadowColor = CYA, ctx.shadowBlur = blur; }
    ctx.beginPath();
    for (const [x1, y1, r1, x2, y2, r2] of bones) capsulePath(ctx, x1, y1, r1, x2, y2, r2);
    for (const [cx, cy, r] of circles) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
    ctx.fillStyle = style; ctx.fill();
    ctx.restore();
  };
  paint(0, 0, rgba(CYA, 0.9), 60, 0.55);        // εξωτερική λάμψη
  paint(0, 0, holo, 24, 1);                     // σώμα-φως

  // scanlines hologram μέσα στο σώμα
  ctx.save();
  ctx.beginPath();
  for (const [x1, y1, r1, x2, y2, r2] of bones) capsulePath(ctx, x1, y1, r1, x2, y2, r2);
  for (const [cx, cy, r] of circles) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
  ctx.clip();
  ctx.globalAlpha = 0.20; ctx.strokeStyle = '#063a4a'; ctx.lineWidth = 3;
  for (let y = 420; y < 1240; y += 16) { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(960, y); ctx.stroke(); }
  // dobok-πάνελ: πιο λευκές ζώνες στον κορμό/μηρούς (σαν στολή μέσα στο φως)
  ctx.globalAlpha = 0.65; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); capsulePath(ctx, chest[0], chest[1] + 6, 84, pelvis[0] - 6, pelvis[1] - 18, 62); ctx.fill();
  ctx.beginPath(); capsulePath(ctx, pelvis[0], pelvis[1], 62, kickKnee[0] - 10, kickKnee[1] + 6, 46); ctx.fill();
  ctx.beginPath(); capsulePath(ctx, pelvis[0] - 6, pelvis[1] + 8, 60, foldKnee[0], foldKnee[1] - 16, 44); ctx.fill();
  ctx.beginPath(); capsulePath(ctx, lShoulder[0], lShoulder[1], 38, lElbow[0], lElbow[1], 28); ctx.fill();
  ctx.beginPath(); capsulePath(ctx, rShoulder[0], rShoulder[1], 38, rElbow[0], rElbow[1], 28); ctx.fill();
  ctx.restore();

  // κοφτερές ενεργειακές ραφές πάνω στο σώμα (γιακάς V μόνο ως seam — όχι μαύρη μπογιά)
  seam(ctx, [[chest[0] - 64, chest[1] - 38], [chest[0] + 4, chest[1] + 62, chest[0] + 4, chest[1] + 62], [chest[0] + 70, chest[1] - 46]], '#0e6c78', { w: 9, a: 0.85, blur: 4 });
  seam(ctx, [[chest[0] - 60, chest[1] - 36], [chest[0] + 4, chest[1] + 56, chest[0] + 4, chest[1] + 56], [chest[0] + 66, chest[1] - 44]], ICE, { w: 3.5, a: 0.95, blur: 10 });
  seam(ctx, [[pelvis[0], pelvis[1]], [kickKnee[0], kickKnee[1]], [kickAnkle[0], kickAnkle[1]], [kickFoot[0], kickFoot[1]]], ICE, { w: 5, a: 0.9 });
  seam(ctx, [[lShoulder[0], lShoulder[1]], [lElbow[0], lElbow[1]], [lFist[0], lFist[1]]], ICE, { w: 4, a: 0.8 });

  // ── ΖΩΝΗ: ενεργειακή magenta ζώνη + δύο κορδέλες που ανεμίζουν ──
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = MAG; ctx.lineWidth = 16; ctx.globalAlpha = 0.95;
  ctx.shadowColor = MAG; ctx.shadowBlur = 22; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(pelvis[0] - 66, pelvis[1] - 30);
  ctx.quadraticCurveTo(pelvis[0], pelvis[1] + 6, pelvis[0] + 66, pelvis[1] - 26); ctx.stroke();
  ctx.restore();
  ribbon(ctx, [pelvis[0] - 20, pelvis[1] - 6], [340, 930], [230, 1000], [130, 1030], 22, 6, MAG, { alpha: 0.9, core: '#ffd0e8' });
  ribbon(ctx, [pelvis[0] + 6, pelvis[1] + 2], [420, 1000], [370, 1100], [320, 1180], 18, 5, MAG, { alpha: 0.8, core: '#ffd0e8' });
  orb(ctx, pelvis[0] - 2, pelvis[1] - 12, 24, rgba('#ffffff', 0.95), rgba(MAG, 0.6));

  // ── ΚΕΦΑΛΙ: μαλλιά swept-back + visor-μπάντα ──
  // μαλλιά: γεμάτο magenta ημισφαίριο πάνω από το κρανίο με μυτερές πίσω τούφες
  ctx.save();
  const hairG = ctx.createLinearGradient(HEAD[0] - 80, HEAD[1] - 80, HEAD[0] + 40, HEAD[1] + 20);
  hairG.addColorStop(0, '#ff77c0'); hairG.addColorStop(0.5, MAG); hairG.addColorStop(1, '#8a1a56');
  ctx.fillStyle = hairG;
  ctx.strokeStyle = '#ffc2e2'; ctx.lineWidth = 4; ctx.globalAlpha = 0.98;
  ctx.shadowColor = MAG; ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(HEAD[0] + 68, HEAD[1] - 16);                      // μέτωπο δεξιά
  ctx.quadraticCurveTo(HEAD[0] + 52, HEAD[1] - 78, HEAD[0] - 12, HEAD[1] - 82); // κορυφή
  ctx.quadraticCurveTo(HEAD[0] - 66, HEAD[1] - 78, HEAD[0] - 92, HEAD[1] - 30); // πίσω
  ctx.quadraticCurveTo(HEAD[0] - 120, HEAD[1] + 4, HEAD[0] - 140, HEAD[1] + 30); // τούφα 1 έξω
  ctx.quadraticCurveTo(HEAD[0] - 104, HEAD[1] + 24, HEAD[0] - 86, HEAD[1] + 32); // μέσα
  ctx.quadraticCurveTo(HEAD[0] - 98, HEAD[1] + 60, HEAD[0] - 110, HEAD[1] + 82); // τούφα 2
  ctx.quadraticCurveTo(HEAD[0] - 72, HEAD[1] + 62, HEAD[0] - 58, HEAD[1] + 48);
  ctx.quadraticCurveTo(HEAD[0] - 12, HEAD[1] - 26, HEAD[0] + 68, HEAD[1] - 16);  // γραμμή μετώπου
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.85; ctx.stroke();
  ctx.restore();
  // visor-μπάντα: λαμπερή cyan σχισμή πάνω στο φωτεινό πρόσωπο
  seam(ctx, [[HEAD[0] - 50, HEAD[1] + 14], [HEAD[0] + 12, HEAD[1] - 2, HEAD[0] + 64, HEAD[1] - 12]], '#063a4a', { w: 15, a: 0.9, blur: 2 });
  seam(ctx, [[HEAD[0] - 44, HEAD[1] + 12], [HEAD[0] + 12, HEAD[1] - 4, HEAD[0] + 58, HEAD[1] - 12]], ICE, { w: 5, a: 1, blur: 18 });
  orb(ctx, HEAD[0] + 36, HEAD[1] - 10, 11, rgba('#ffffff', 1), rgba(CYA, 0.6));
  // μαλλιά: κορδέλες magenta φωτός που ανεμίζουν πίσω-αριστερά (ξεκινούν από το καπάκι)
  ribbon(ctx, [HEAD[0] - 26, HEAD[1] - 56], [210, 430], [130, 560], [56, 690], 34, 7, MAG, { alpha: 0.9, core: '#ffd0e8' });
  ribbon(ctx, [HEAD[0] - 44, HEAD[1] - 28], [170, 520], [85, 645], [36, 790], 26, 6, MAG, { alpha: 0.8, core: '#ffd0e8' });
  ribbon(ctx, [HEAD[0] + 8, HEAD[1] - 66], [290, 410], [220, 510], [140, 590], 24, 5, mix(MAG, '#ffffff', 0.25), { alpha: 0.75 });
  ribbon(ctx, [HEAD[0] - 56, HEAD[1] - 2], [130, 600], [80, 705], [60, 865], 17, 4, MAG, { alpha: 0.65 });

  // ── ενεργειακά τελειώματα ──
  // λάμψη-ίχνος στο πόδι της κλωτσιάς + crescent λεπίδα στο πέλμα
  cometTail(ctxProxy(ctx), kickFoot[0], kickFoot[1], 30, 300, Math.atan2(596 - 740, 872 - 640), ICE, CYA, { alpha: 0.9 });
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = ICE; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.shadowColor = CYA; ctx.shadowBlur = 30; ctx.globalAlpha = 0.95;
  ctx.beginPath(); ctx.arc(kickFoot[0] - 30, kickFoot[1] + 30, 110, -1.9, -0.2); ctx.stroke();
  ctx.restore();
  sparkle(ctx, kickFoot[0] + 10, kickFoot[1] - 10, 46, '#ffffff', { alpha: 0.98 });
  // γροθιές: μικρά φωτεινά δαχτυλίδια
  for (const f of [lFist, rFist]) {
    energyRing(ctx, f[0], f[1], 34, CYA, { width: 6, alpha: 0.9, blur: 18 });
    orb(ctx, f[0], f[1], 18, rgba(ICE, 0.95), rgba(CYA, 0.5));
  }
  // σωματίδια-ψηφία γύρω από το σώμα (hologram dissolve στις άκρες)
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = 60 + rnd() * 120;
    const bx = [lFist, foldFoot, kickFoot, HEAD][i % 4];
    const x = bx[0] + Math.cos(a) * d, y = bx[1] + Math.sin(a) * d;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 + rnd() * 0.5; ctx.fillStyle = i % 3 ? CYA : ICE;
    ctx.shadowColor = CYA; ctx.shadowBlur = 8;
    ctx.fillRect(x, y, 4 + rnd() * 7, 4 + rnd() * 7);
    ctx.restore();
  }
  embers(ctx, 470, 850, 420, 40, CYA, rnd, { size: [1.5, 4], alpha: [0.2, 0.7] });
  cleanAlpha(canvas);
  save('assets/characters/taekwondo_girl.png', canvas);
}
// μικρό proxy ώστε το cometTail (από το άλλο αρχείο-στυλ) να δουλέψει εδώ
function ctxProxy(ctx) { return ctx; }
function cometTail(ctx, x, y, r, tail, ang, inner, outerC, { alpha = 0.9 } = {}) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, 0, -tail, 0);
  g.addColorStop(0, rgba(inner, alpha * 0.9));
  g.addColorStop(0.25, rgba(outerC, alpha * 0.55));
  g.addColorStop(1, rgba(outerC, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.9);
  ctx.quadraticCurveTo(-tail * 0.45, -r * 0.5, -tail, 0);
  ctx.quadraticCurveTo(-tail * 0.45, r * 0.5, 0, r * 0.9);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ════════════════════════════════════════════════════════════════════════════════
// 02 · MAIN MENU PROTAGONIST TRIO — assets/ui/main_menu_trio.png (940×1230)
// Τρεις ήρωες-σιλουέτες με σωστές αναλογίες μπροστά από neon πύλη:
// κέντρο tank (γροθιά-αύρα), αριστερά gunner με ράιφλ, δεξιά martial artist
// σε ψηλή κλωτσιά. Rim lighting ανά χαρακτήρα (cyan/amber/magenta).
// ════════════════════════════════════════════════════════════════════════════════
function genMenuTrio() {
  const W = 940, H = 1230;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const rnd = mulberry32(seedFromString('menu_trio_v2_2026'));
  const CYA = '#2ee6f6', AMB = '#ffb400', MAG = '#ff2d95', INK = '#0a0e1c';
  // φόντο
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#04050d'); bg.addColorStop(0.55, '#0a1026'); bg.addColorStop(1, '#03040a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // πύλη
  orb(ctx, W / 2, 520, 420, rgba(CYA, 0.26), rgba('#122', 0.08));
  energyRing(ctx, W / 2, 520, 360, CYA, { width: 14, alpha: 0.75, blur: 40 });
  energyRing(ctx, W / 2, 520, 300, '#9fefff', { width: 4, alpha: 0.55, blur: 16, dash: [40, 26] });
  // ψηφιακή βροχή
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W, y0 = rnd() * H * 0.75, len = 40 + rnd() * 130;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(i % 4 ? CYA : MAG, 0.05 + rnd() * 0.10);
    ctx.lineWidth = 1.5 + rnd() * 2;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + len); ctx.stroke();
    ctx.restore();
  }
  // πόλη-σιλουέτα
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const bw = 40 + rnd() * 80, bh = 100 + rnd() * 240;
    const bx = (i / 18) * W + rnd() * 30 - 15;
    ctx.fillStyle = `rgba(7,10,22,${0.8 + rnd() * 0.2})`;
    ctx.fillRect(bx, H - 300 - bh, bw, bh);
    for (let wnd = 0; wnd < 7; wnd++) {
      if (rnd() < 0.5) continue;
      ctx.fillStyle = rgba(rnd() < 0.7 ? CYA : AMB, 0.20 + rnd() * 0.35);
      ctx.fillRect(bx + 6 + rnd() * (bw - 14), H - 300 - bh + 8 + rnd() * (bh - 20), 4, 7);
    }
  }
  ctx.restore();
  // δάπεδο
  for (let i = 0; i < 10; i++) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(CYA, 0.08 + i * 0.015); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, H - 260 + i * 28); ctx.lineTo(W, H - 260 + i * 28); ctx.stroke();
    ctx.restore();
  }
  const ground = (x, y, s, col) => {
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(x, y, 120 * s, 24 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = 4;
    ctx.shadowColor = col; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.ellipse(x, y, 140 * s, 30 * s, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };

  // ── ΚΕΝΤΡΟ: TANK (μετωπικός, τεράστιοι ώμοι, φωτεινή γροθιά μπροστά στο στήθος) ──
  {
    const X = W / 2, Y = 1130, S = 0.56;                    // βάση ποδιών
    const P = (x, y) => [X + x * S, Y + y * S];
    const head = [...P(0, -1010), 62 * S];
    const chest = P(0, -800), pelvis = P(0, -560);
    const bones = [
      [...chest, 128 * S, ...pelvis, 88 * S],
      [...chest, 84 * S, ...P(0, -940), 40 * S],
      // ώμοι-μπράτσα (τεράστια)
      [...P(-150, -860), 74 * S, ...P(-220, -680), 56 * S],
      [...P(-220, -680), 54 * S, ...P(-150, -520), 52 * S],   // αριστερή γροθιά προς κέντρο
      [...P(150, -860), 74 * S, ...P(230, -700), 56 * S],
      [...P(230, -700), 54 * S, ...P(80, -740), 52 * S],      // δεξιά γροθιά ΜΠΡΟΣΤΑ στο στήθος
      // πόδια
      [...P(-70, -540), 62 * S, ...P(-90, -280), 50 * S],
      [...P(-90, -280), 48 * S, ...P(-100, -30), 44 * S],
      [...P(70, -540), 62 * S, ...P(90, -280), 50 * S],
      [...P(90, -280), 48 * S, ...P(100, -30), 44 * S],
      // πέλματα
      [...P(-100, -24), 40 * S, ...P(-130, 0), 30 * S],
      [...P(100, -24), 40 * S, ...P(130, 0), 30 * S],
    ];
    ground(X, Y + 8, 1.15, CYA);
    drawFigure(ctx, bones, [head], { fill: INK, rimCol: CYA, rimDx: -6, rimDy: -8 });
    // ενεργειακές ραφές: ώμοι + visor
    seam(ctx, [P(-150, -892), P(-40, -860, 40 * 0 + X, Y - 860 * S)], CYA, { w: 4, a: 0.7 });
    seam(ctx, [[head[0] - 34 * S * 1.6, head[1] - 4], [head[0] + 40 * S * 1.6, head[1] - 10]], '#b6f6ff', { w: 6 * S + 2, a: 1, blur: 18 });
    // φωτεινή γροθιά μπροστά (fist theme)
    const fist = P(80, -740);
    orb(ctx, fist[0], fist[1], 44, rgba('#ffffff', 0.95), rgba(CYA, 0.55));
    energyRing(ctx, fist[0], fist[1], 64, CYA, { width: 6, alpha: 0.95, blur: 22 });
    energyRing(ctx, fist[0], fist[1], 92, CYA, { width: 3.5, alpha: 0.5, blur: 14, dash: [14, 18] });
  }

  // ── ΑΡΙΣΤΕΡΑ: GUNNER (προφίλ προς τα δεξιά, μακρύ ράιφλ) ──
  {
    const X = W / 2 - 302, Y = 1160, S = 0.47;
    const P = (x, y) => [X + x * S, Y + y * S];
    const head = [...P(30, -1000), 56 * S];
    const chest = P(20, -810), pelvis = P(0, -560);
    // ράιφλ πρώτα (πίσω από τα χέρια)
    ctx.save();
    ctx.translate(...P(240, -700)); ctx.rotate(-0.10);
    ctx.fillStyle = '#11162a';
    ctx.strokeStyle = AMB; ctx.lineWidth = 3; ctx.shadowColor = AMB; ctx.shadowBlur = 16;
    ctx.fillRect(-210 * S, -26 * S, 660 * S, 44 * S);       // κάννη+σώμα
    ctx.strokeRect(-210 * S, -26 * S, 660 * S, 44 * S);
    ctx.fillRect(-40 * S, 18 * S, 90 * S, 70 * S);          // λαβή
    ctx.fillRect(300 * S, -44 * S, 120 * S, 24 * S);        // scope
    ctx.restore();
    const bones = [
      [...chest, 92 * S, ...pelvis, 64 * S],
      [...chest, 60 * S, ...P(36, -940), 30 * S],
      // μπροστινό χέρι στο ράιφλ
      [...P(80, -830), 44 * S, ...P(190, -740), 34 * S],
      [...P(190, -740), 32 * S, ...P(300, -700), 30 * S],
      // πίσω χέρι (σκανδάλη)
      [...P(-30, -830), 42 * S, ...P(30, -700), 32 * S],
      [...P(30, -700), 30 * S, ...P(130, -680), 28 * S],
      // πόδια σε διασκελισμό
      [...P(-10, -540), 56 * S, ...P(90, -290), 44 * S],
      [...P(90, -290), 42 * S, ...P(120, -30), 38 * S],
      [...P(-10, -540), 54 * S, ...P(-110, -300), 44 * S],
      [...P(-110, -300), 42 * S, ...P(-150, -30), 38 * S],
      [...P(120, -24), 34 * S, ...P(160, 0), 26 * S],
      [...P(-150, -24), 34 * S, ...P(-190, 0), 26 * S],
    ];
    ground(X, Y + 6, 0.95, AMB);
    drawFigure(ctx, bones, [head], { fill: INK, rimCol: AMB, rimDx: -6, rimDy: -7 });
    // muzzle flare + visor
    sparkle(ctx, P(450, -712)[0], P(450, -712)[1], 26, AMB, { alpha: 0.95 });
    seam(ctx, [[head[0] - 20, head[1] - 2], [head[0] + 30, head[1] - 8]], '#ffe2a8', { w: 5, a: 1, blur: 16 });
    orb(ctx, chest[0] + 10, chest[1] + 10, 16, rgba('#fff', 0.9), rgba(AMB, 0.5));
  }

  // ── ΔΕΞΙΑ: MARTIAL ARTIST (ψηλή κλωτσιά προς τα πάνω-αριστερά, κοιτά το κέντρο) ──
  {
    const X = W / 2 + 282, Y = 1160, S = 0.47;
    const P = (x, y) => [X + x * S, Y + y * S];
    const head = [...P(-20, -980), 54 * S];
    const chest = P(-10, -800), pelvis = P(0, -560);
    const bones = [
      [...chest, 84 * S, ...pelvis, 60 * S],
      [...chest, 56 * S, ...P(-24, -920), 28 * S],
      // στήριξη: πόδι κάτω
      [...pelvis, 54 * S, ...P(-40, -290), 44 * S],
      [...P(-40, -290), 42 * S, ...P(-50, -30), 38 * S],
      [...P(-50, -24), 34 * S, ...P(-90, 0), 26 * S],
      // κλωτσιά: ψηλά προς τα ΕΞΩ (δεξιά)
      [...pelvis, 54 * S, ...P(150, -680), 44 * S],
      [...P(150, -680), 42 * S, ...P(295, -830), 32 * S],
      [...P(295, -830), 30 * S, ...P(360, -895), 24 * S],
      // χέρια σε guard (έξω από τη σιλουέτα του κορμού)
      [...P(-70, -840), 40 * S, ...P(-160, -740), 30 * S],
      [...P(-160, -740), 28 * S, ...P(-120, -630), 27 * S],
      [...P(60, -840), 40 * S, ...P(30, -710), 29 * S],
      [...P(30, -710), 27 * S, ...P(110, -650), 26 * S],
    ];
    ground(X, Y + 6, 0.95, MAG);
    drawFigure(ctx, bones, [head], { fill: INK, rimCol: MAG, rimDx: 7, rimDy: -7 });
    // crescent ίχνος της κλωτσιάς (ακολουθεί την τροχιά προς τα πάνω-δεξιά)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = MAG; ctx.lineWidth = 10; ctx.globalAlpha = 0.9;
    ctx.shadowColor = MAG; ctx.shadowBlur = 26; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(P(90, -520)[0], P(90, -520)[1], 250 * S, -1.9, -0.35); ctx.stroke();
    ctx.restore();
    sparkle(ctx, P(372, -905)[0], P(372, -905)[1], 32, '#ffd7ec', { alpha: 0.95 });
    seam(ctx, [[head[0] - 26, head[1] - 2], [head[0] + 20, head[1] - 8]], '#ffc8e4', { w: 5, a: 1, blur: 16 });
  }

  // κορυφή: διακριτικές γραμμές τίτλου + αστέρι
  for (const [y, w2, col] of [[96, 300, CYA], [116, 200, MAG]]) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.globalAlpha = 0.8;
    ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W / 2 - w2 / 2, y); ctx.lineTo(W / 2 + w2 / 2, y); ctx.stroke();
    ctx.restore();
  }
  sparkle(ctx, W / 2, 80, 38, '#ffffff', { alpha: 0.9 });
  const vg = ctx.createRadialGradient(W / 2, H * 0.52, H * 0.26, W / 2, H * 0.52, H * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,6,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  save('assets/ui/main_menu_trio.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 03 · VILLAIN MAIN MENU THEME — assets/ui/vilian main menu fist theme .png (1537×1023)
// Ο NULL αρχηγός όρθιος μπροστά από πύργο δεδομένων, υψωμένη γροθιά με
// συντριμμένο δαχτυλίδι ενέργειας· ατμόσφαιρα βιολετί data-καταιγίδας.
// ════════════════════════════════════════════════════════════════════════════════
function genVillainTheme() {
  const W = 1537, H = 1023;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const rnd = mulberry32(seedFromString('villain_v2_2026'));
  const UV = '#8a2bff', MAGD = '#c95cff', RED = '#ff2038', INK = '#07050f';
  const CXV = W / 2 - 120;
  // φόντο
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0618'); bg.addColorStop(0.6, '#150a2e'); bg.addColorStop(1, '#060310');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // πύργος δεδομένων πίσω δεξιά (μονόλιθος με warning φώτα)
  ctx.save();
  ctx.fillStyle = '#0d0920';
  ctx.strokeStyle = UV; ctx.lineWidth = 4; ctx.shadowColor = UV; ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.moveTo(W - 470, H); ctx.lineTo(W - 430, 140); ctx.lineTo(W - 330, 80); ctx.lineTo(W - 230, 150);
  ctx.lineTo(W - 200, H);
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.9; ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 12; i++) {
    const y = 200 + i * 62;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(i % 4 === 0 ? RED : MAGD, 0.35 + rnd() * 0.3);
    ctx.shadowColor = MAGD; ctx.shadowBlur = 10;
    ctx.fillRect(W - 420 + (i % 3) * 40, y, 26, 8);
    ctx.restore();
  }
  // data-καταιγίδα
  for (let i = 0; i < 80; i++) {
    const x = rnd() * W, y0 = rnd() * H, len = 30 + rnd() * 110;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(i % 5 ? UV : RED, 0.04 + rnd() * 0.09);
    ctx.lineWidth = 1.5 + rnd() * 2;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + len); ctx.stroke();
    ctx.restore();
  }
  for (let i = 0; i < 5; i++) {
    const x0 = rnd() * W;
    lightning(ctx, x0, 0, x0 + (rnd() - 0.5) * 280, 200 + rnd() * 220,
              { seg: 8, jag: 28, width: 3, color: MAGD, core: '#ffffff', rnd });
  }
  // backlight δίσκος πίσω από τη φιγούρα
  orb(ctx, CXV, 420, 480, rgba(UV, 0.38), rgba('#1c0a3a', 0.14));
  energyRing(ctx, CXV, 420, 400, MAGD, { width: 9, alpha: 0.55, blur: 32 });

  // ── ΦΙΓΟΥΡΑ: όρθιος άρχοντας (μακρύ παλτό-κάπα, υψωμένη γροθιά) ──
  const Y = 980, S = 0.82;
  const P = (x, y) => [CXV + x * S, Y + y * S];
  const head = [...P(-10, -900), 56 * S];
  const chest = P(0, -720), pelvis = P(0, -480);
  // κάπα: μεγάλο γωνιώδες σχήμα πίσω από το σώμα
  ctx.save();
  ctx.fillStyle = '#0b0716';
  ctx.strokeStyle = UV; ctx.lineWidth = 5; ctx.lineJoin = 'round';
  ctx.shadowColor = UV; ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.moveTo(...P(-30, -880));
  ctx.lineTo(...P(-190, -760)); ctx.lineTo(...P(-260, -420)); ctx.lineTo(...P(-310, 0));
  ctx.lineTo(...P(-180, -60)); ctx.lineTo(...P(-90, 0)); ctx.lineTo(...P(60, -40));
  ctx.lineTo(...P(200, 0)); ctx.lineTo(...P(250, -60)); ctx.lineTo(...P(230, -430));
  ctx.lineTo(...P(160, -770));
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.95; ctx.stroke();
  ctx.restore();
  // σώμα
  const bones = [
    [...chest, 100 * S, ...pelvis, 70 * S],
    [...chest, 64 * S, ...P(-6, -850), 32 * S],
    // αριστερό χέρι κάτω (σφιγμένη γροθιά στο πλάι)
    [...P(-98, -770), 48 * S, ...P(-150, -580), 38 * S],
    [...P(-150, -580), 36 * S, ...P(-130, -430), 36 * S],
    // δεξί χέρι: υψωμένη γροθιά ψηλά
    [...P(96, -780), 50 * S, ...P(210, -880), 40 * S],
    [...P(210, -880), 38 * S, ...P(260, -1010), 40 * S],
    // πόδια (πλατύ στήσιμο)
    [...P(-40, -460), 58 * S, ...P(-80, -220), 48 * S],
    [...P(-80, -220), 46 * S, ...P(-95, -20), 44 * S],
    [...P(40, -460), 58 * S, ...P(90, -220), 48 * S],
    [...P(90, -220), 46 * S, ...P(110, -20), 44 * S],
    [...P(-95, -16), 42 * S, ...P(-135, 4), 30 * S],
    [...P(110, -16), 42 * S, ...P(150, 4), 30 * S],
  ];
  drawFigure(ctx, bones, [head], { fill: INK, rimCol: MAGD, rimDx: -8, rimDy: -6, rimBlur: 32 });
  // κεφάλι: γωνιώδης κορώνα-κράνος + μάτια-σχισμές
  ctx.save();
  ctx.fillStyle = INK; ctx.strokeStyle = MAGD; ctx.lineWidth = 4;
  ctx.shadowColor = UV; ctx.shadowBlur = 20; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(head[0] - 62, head[1] + 6);
  ctx.lineTo(head[0] - 70, head[1] - 60); ctx.lineTo(head[0] - 34, head[1] - 34);
  ctx.lineTo(head[0] - 12, head[1] - 78); ctx.lineTo(head[0] + 14, head[1] - 34);
  ctx.lineTo(head[0] + 48, head[1] - 66); ctx.lineTo(head[0] + 62, head[1] + 2);
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.95; ctx.stroke();
  ctx.restore();
  for (const s of [-1, 1]) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = MAGD; ctx.shadowBlur = 24; ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(head[0] + s * 34, head[1] - 6);
    ctx.lineTo(head[0] + s * 8, head[1] + 2);
    ctx.lineTo(head[0] + s * 34, head[1] + 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    orb(ctx, head[0] + s * 24, head[1], 14, rgba(MAGD, 0.95), rgba(UV, 0.4));
  }
  // στήθος: κόκκινος πυρήνας + ραφές πανοπλίας
  orb(ctx, chest[0], chest[1] + 6, 30, rgba('#ffffff', 0.95), rgba(RED, 0.75));
  energyRing(ctx, chest[0], chest[1] + 6, 48, RED, { width: 5, alpha: 0.95, blur: 18 });
  seam(ctx, [P(-70, -760), P(0, -700, ...P(0, -700)), P(70, -760)], MAGD, { w: 4, a: 0.8 });
  seam(ctx, [P(-52, -560), P(0, -520, ...P(0, -520)), P(52, -560)], MAGD, { w: 4, a: 0.7 });
  seam(ctx, [P(-40, -460), P(-80, -220), P(-95, -20)], UV, { w: 3.5, a: 0.6 });
  seam(ctx, [P(40, -460), P(90, -220), P(110, -20)], UV, { w: 3.5, a: 0.6 });
  // υψωμένη γροθιά: σπασμένο δαχτυλίδι + κεραυνοί + θραύσματα
  const fist = P(260, -1010);
  energyRing(ctx, fist[0], fist[1], 96, MAGD, { width: 10, alpha: 0.95, blur: 30, a0: -2.6, a1: 0.4 });
  energyRing(ctx, fist[0], fist[1], 96, MAGD, { width: 10, alpha: 0.95, blur: 30, a0: 0.9, a1: 2.4 });
  energyRing(ctx, fist[0], fist[1], 140, UV, { width: 5, alpha: 0.6, blur: 18, dash: [20, 24] });
  orb(ctx, fist[0], fist[1], 46, rgba('#ffffff', 0.95), rgba(MAGD, 0.6));
  lightning(ctx, fist[0], fist[1], fist[0] + 150, fist[1] - 80, { seg: 7, jag: 20, width: 4.5, color: MAGD, core: '#fff', rnd });
  lightning(ctx, fist[0], fist[1], fist[0] - 130, fist[1] - 110, { seg: 7, jag: 20, width: 4.5, color: MAGD, core: '#fff', rnd });
  lightning(ctx, fist[0], fist[1], fist[0] + 40, fist[1] - 170, { seg: 6, jag: 18, width: 3.5, color: '#ffffff', core: '#fff', rnd });
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2, d = 70 + rnd() * 110;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(fist[0] + Math.cos(a) * d, fist[1] + Math.sin(a) * d);
    ctx.rotate(rnd() * Math.PI);
    ctx.fillStyle = rgba(MAGD, 0.5 + rnd() * 0.4);
    ctx.shadowColor = MAGD; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(8 + rnd() * 10, 0); ctx.lineTo(-6, 5 + rnd() * 5); ctx.lineTo(-6, -5 - rnd() * 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // κάτω γροθιά: αχνό δαχτυλίδι φόρτισης
  const lfist = P(-130, -430);
  energyRing(ctx, lfist[0], lfist[1], 52, UV, { width: 5, alpha: 0.7, blur: 16 });
  // δάπεδο: ανακλάσεις
  for (let i = 0; i < 10; i++) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(UV, 0.07 + i * 0.012); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 928 + i * 10); ctx.lineTo(W, 928 + i * 10); ctx.stroke();
    ctx.restore();
  }
  orb(ctx, CXV, 960, 340, rgba(UV, 0.16), rgba('#000', 0));
  // tendrils-καλώδια στο δάπεδο
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? -1 : 1;
    const bx = CXV + s * (140 + rnd() * 260);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(UV, 0.45 + rnd() * 0.3); ctx.lineWidth = 3.5 + rnd() * 4;
    ctx.shadowColor = UV; ctx.shadowBlur = 12; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, 965);
    ctx.bezierCurveTo(bx + s * 90, 930 - rnd() * 50, bx + s * 170, 990, bx + s * (280 + rnd() * 120), 930 + rnd() * 70);
    ctx.stroke(); ctx.restore();
  }
  // κόκκινα warning glyphs στις γωνίες
  for (const [gx, gy] of [[90, 90], [W - 90, 90], [90, H - 90], [W - 90, H - 90]]) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = RED; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.5;
    ctx.shadowColor = RED; ctx.shadowBlur = 14;
    ctx.strokeRect(gx - 24, gy - 24, 48, 48);
    ctx.beginPath(); ctx.moveTo(gx - 11, gy); ctx.lineTo(gx + 11, gy); ctx.stroke();
    ctx.restore();
  }
  const vg = ctx.createRadialGradient(CXV, H * 0.45, H * 0.3, CXV, H * 0.45, H * 0.9);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,0,8,0.6)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  save('assets/ui/vilian main menu fist theme .png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
const JOBS = { taekwondo_girl: genTaekwondoGirl, menu_trio: genMenuTrio, villain_theme: genVillainTheme };
const only = process.argv[2];
console.log('PHENIX legacy portraits → ' + OUT);
for (const [id, fn] of Object.entries(JOBS)) {
  if (only && id !== only) continue;
  console.log('•', id); fn();
}
console.log('done.');
