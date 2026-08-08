// ════════════════════════════════════════════════════════════════════════════════
// PHENIX: NULL EDEN — Maria legacy-art replacement generator (batch 2026-08-08, v2).
// 17 procedural premium assets (node-canvas), deterministic ανά asset id.
// node tools/art/generate_legacy_replacements.mjs   (απαιτεί npm i canvas — δεν τρέχει in-game)
//
// Συμβόλαια συμπεριφοράς (από τον live κώδικα — ΜΗΝ τα αλλάξεις χωρίς να δεις το draw site):
//  • lavabombs_t.png      → 2×3 GRID (cells 627×418), Game.js τραβάει ΕΝΑ κελί ανά ζώνη, 'screen' blend.
//  • marker_t.png         → ground reticle, ζωγραφίζεται ~150px, ΧΩΡΙΣ blend → θέλει καθαρό alpha.
//  • vessel_purple_rockets→ rotate(m.ang) χωρίς offset → η μύτη ΔΕΙΧΝΕΙ +X. 92px in-game.
//  • eddie_flame.png      → 140×512, «η μύτη πάνω» (κώδικας κάνει rotate(a-π/2)), 'lighter', ~50px ύψος.
//  • nexus/nexus_burst    → 256×256, ζωγραφίζεται planted 128px με σκιά — δομή, όχι έκρηξη.
//  • storm_conductor_hd / plasma_execution_hd → 1254² single illustration: card icon + additive in-world.
// ════════════════════════════════════════════════════════════════════════════════
import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, seedFromString, rgba, mix, glow, lightning, metalGrad, embers,
         energyRing, orb, sparkle, gravitySwirl, rim, cleanAlpha } from './fusion_art_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT  = process.env.ART_OUT || ROOT;          // στο repo: γράφει κατευθείαν στα assets/

function save(rel, canvas) {
  const out = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log('  ✔', rel, `${canvas.width}×${canvas.height}`);
}
function begin(id, w, h) {
  const canvas = createCanvas(w, h);
  return { canvas, ctx: canvas.getContext('2d'), rnd: mulberry32(seedFromString(id)) };
}

// ── Extra shared helpers (πάνω στη fusion lib) ─────────────────────────────────
function crystalShard(ctx, x, y, len, wid, ang, base, lite, dark, rnd) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  const p = [[0, -len / 2], [wid * 0.42, -len * 0.18], [wid * 0.34, len * 0.30],
             [0, len / 2], [-wid * 0.34, len * 0.30], [-wid * 0.42, -len * 0.18]];
  const face = (pts, fill, a = 1) => {
    ctx.globalAlpha = a; ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
    ctx.closePath(); ctx.fill();
  };
  face(p, metalGrad(ctx, -wid / 2, 0, wid / 2, 0, base, lite, dark));
  face([p[0], p[1], p[2], p[3]], rgba('#ffffff', 0.10 + rnd() * 0.08));
  face([p[0], p[5], p[4], p[3]], rgba('#000010', 0.22));
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.85; ctx.strokeStyle = lite; ctx.lineWidth = Math.max(2, wid * 0.05);
  ctx.shadowColor = lite; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[3][0], p[3][1]); ctx.stroke();
  ctx.restore();
}
// Κομήτης: φωτεινή κεφαλή + ουρά προς τα πίσω (κατεύθυνση κίνησης = ang).
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
function techArc(ctx, cx, cy, r, a0, a1, color, { width = 5, alpha = 0.85, dash = [26, 16], blur = 12 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width;
  ctx.setLineDash(dash); ctx.lineCap = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = blur;
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
  ctx.restore();
}
// Γλώσσα φλόγας με κυρτή αιχμή (κατακόρυφη, κεφαλή στο top).
function flameTongue(ctx, cx, topY, botY, w, curl, col, alpha) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(0, topY, 0, botY);
  g.addColorStop(0, rgba(col, 0.98)); g.addColorStop(0.7, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.shadowColor = col; ctx.shadowBlur = 18;
  const h = botY - topY;
  ctx.beginPath();
  ctx.moveTo(cx + curl, topY);
  ctx.bezierCurveTo(cx + w * 1.15 + curl * 0.4, topY + h * 0.24, cx + w * 0.72, topY + h * 0.52, cx + w * 0.5, topY + h * 0.7);
  ctx.bezierCurveTo(cx + w * 0.32, topY + h * 0.86, cx + w * 0.16, topY + h * 0.94, cx, botY);
  ctx.bezierCurveTo(cx - w * 0.16, topY + h * 0.94, cx - w * 0.32, topY + h * 0.86, cx - w * 0.5, topY + h * 0.7);
  ctx.bezierCurveTo(cx - w * 0.72, topY + h * 0.52, cx - w * 1.15 + curl * 0.4, topY + h * 0.24, cx + curl, topY);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ════════════════════════════════════════════════════════════════════════════════
// 04 · ARC THUNDER BURST — assets/weapons/ArcThunder_Burst.png (1254²)
// Βασιλικό μπλε ηλεκτρικό ξέσπασμα: 13 διακλαδωμένοι κεραυνοί από λευκό ήλιο,
// πλάσμα-νέφη, δύο δαχτυλίδια-κυκλώματα, sparkles στις αιχμές.
// ════════════════════════════════════════════════════════════════════════════════
function genArcThunder() {
  const S = 1254, C = S / 2;
  const { canvas, ctx, rnd } = begin('arc_thunder_burst', S, S);
  const BLUE = '#2f6bff', ICE = '#9fd0ff', CORE = '#eaf6ff';
  orb(ctx, C, C, 520, rgba(BLUE, 0.34), rgba('#0c1c4a', 0.16));
  // πλάσμα-νέφη — πυκνά, στροβιλισμένα γύρω από τον πυρήνα
  for (let i = 0; i < 44; i++) {
    const a = rnd() * Math.PI * 2, d = 70 + Math.sqrt(rnd()) * 380;
    orb(ctx, C + Math.cos(a) * d, C + Math.sin(a) * d, 46 + rnd() * 110,
        rgba(i % 3 ? BLUE : ICE, 0.12 + rnd() * 0.12), rgba('#0a1436', 0.05), { alpha: 0.9 });
  }
  // δαχτυλίδια-κυκλώματα
  energyRing(ctx, C, C, 356, ICE, { width: 8, alpha: 0.65, blur: 20, dash: [66, 30] });
  energyRing(ctx, C, C, 470, BLUE, { width: 6, alpha: 0.5, blur: 16, dash: [30, 44] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    orb(ctx, C + Math.cos(a) * 356, C + Math.sin(a) * 356, 16, rgba(CORE, 0.9), rgba(ICE, 0.5));
  }
  // 13 κύριοι κεραυνοί με διακλαδώσεις
  const bolts = 13;
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * Math.PI * 2 + rnd() * 0.24;
    const L = 400 + rnd() * 190;
    const x2 = C + Math.cos(a) * L, y2 = C + Math.sin(a) * L;
    const pts = lightning(ctx, C + Math.cos(a) * 60, C + Math.sin(a) * 60, x2, y2,
                          { seg: 12, jag: 38, width: 8, color: BLUE, core: CORE, rnd });
    for (let b = 0; b < 1 + (rnd() < 0.7 ? 1 : 0); b++) {
      const p = pts[3 + ((rnd() * (pts.length - 5)) | 0)];
      const ba = a + (rnd() - 0.5) * 1.6, bl = 110 + rnd() * 170;
      lightning(ctx, p[0], p[1], p[0] + Math.cos(ba) * bl, p[1] + Math.sin(ba) * bl,
                { seg: 7, jag: 22, width: 4.5, color: ICE, core: CORE, rnd });
    }
    sparkle(ctx, x2, y2, 30 + rnd() * 26, ICE, { alpha: 0.95 });
  }
  embers(ctx, C, C, 500, 90, ICE, rnd, { size: [1.5, 4.5], alpha: [0.25, 0.85] });
  // πυρήνας: λευκός ήλιος + δαχτυλίδια + οριζόντιο flare
  orb(ctx, C, C, 205, rgba('#ffffff', 1), rgba(ICE, 0.8));
  sparkle(ctx, C, C, 300, CORE, { alpha: 0.9, thin: 0.10 });
  energyRing(ctx, C, C, 150, CORE, { width: 12, alpha: 0.95, blur: 32 });
  energyRing(ctx, C, C, 215, BLUE, { width: 6, alpha: 0.7, blur: 18, dash: [10, 22] });
  cleanAlpha(canvas);
  save('assets/weapons/ArcThunder_Burst.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 05 · CRESCENT AURA — assets/weapons/crescent_aura.png (1254²)
// ΠΡΑΓΜΑΤΙΚΟ μισοφέγγαρο-λεπίδα (δίσκος − offset δίσκος), άνοιγμα δεξιά,
// βιολετί σώμα, λευκή κοφτερή εξωτερική ακμή, αύρα-απόηχοι και αστέρια.
// ════════════════════════════════════════════════════════════════════════════════
function genCrescentAura() {
  const S = 1254, C = S / 2;
  const { canvas, ctx, rnd } = begin('crescent_aura', S, S);
  const VIO = '#8b3dff', MAG = '#d86bff', CORE = '#f6e9ff';
  const R = 450, OFF = 240, R2 = 400;              // δίσκος, offset κοπής, δίσκος κοπής
  const buildCrescent = (scale, cut) => {          // επιστρέφει offscreen με crescent alpha
    const oc = createCanvas(S, S), o = oc.getContext('2d');
    o.save();
    const g = o.createLinearGradient(C - R, C - R, C + R * 0.4, C + R);
    g.addColorStop(0, mix(VIO, '#22093f', 0.5)); g.addColorStop(0.55, VIO); g.addColorStop(1, MAG);
    o.fillStyle = g;
    o.beginPath(); o.arc(C, C, R * scale, 0, Math.PI * 2); o.fill();
    o.globalCompositeOperation = 'destination-out';
    o.beginPath(); o.arc(C + OFF, C, R2 * scale * cut, 0, Math.PI * 2); o.fill();
    o.restore();
    return oc;
  };
  // αύρα-απόηχοι: 3 crescents σε περιστροφή/κλίμακα, χαμηλό alpha
  for (const [rot, sc, al] of [[-0.22, 1.06, 0.20], [-0.11, 1.02, 0.26], [0.1, 0.94, 0.16]]) {
    const cc = buildCrescent(sc, 1);
    ctx.save();
    ctx.translate(C, C); ctx.rotate(rot); ctx.translate(-C, -C);
    ctx.globalAlpha = al; ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(cc, 0, 0);
    ctx.restore();
  }
  // κύριο crescent
  const main = buildCrescent(1, 1);
  ctx.drawImage(main, 0, 0);
  // εσωτερικές ενεργειακές φλέβες — clipped στο crescent
  ctx.save();
  ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2);
  ctx.arc(C + OFF, C, R2, 0, Math.PI * 2, true); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const rr = R * (0.55 + rnd() * 0.43);
    const a0 = Math.PI * 0.55 + rnd() * Math.PI * 0.9;
    ctx.strokeStyle = rgba(i % 3 ? MAG : CORE, 0.22 + rnd() * 0.4);
    ctx.lineWidth = 2 + rnd() * 6; ctx.lineCap = 'round';
    ctx.shadowColor = MAG; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(C, C, rr, a0, a0 + 0.12 + rnd() * 0.3); ctx.stroke();
  }
  // αστέρια μέσα στο σώμα
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * 0.6 + rnd() * Math.PI * 0.8;
    const rr = R * (0.6 + rnd() * 0.34);
    sparkle(ctx, C + Math.cos(a) * rr, C + Math.sin(a) * rr, 8 + rnd() * 20, CORE, { alpha: 0.5 + rnd() * 0.45 });
  }
  ctx.restore();
  // λευκή κοφτερή εξωτερική ακμή (αριστερό τόξο) — 3 πάσα
  const edge = (w, col, al, blur) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.globalAlpha = al; ctx.shadowColor = col; ctx.shadowBlur = blur;
    ctx.beginPath(); ctx.arc(C, C, R - 4, Math.PI * 0.56, Math.PI * 1.44); ctx.stroke();
    ctx.restore();
  };
  edge(30, MAG, 0.4, 60); edge(14, MAG, 0.7, 26); edge(7, CORE, 0.98, 18);
  // κέρατα: υπολόγισε τα σημεία τομής των 2 κύκλων και βάλε αιχμές-sparkles
  const d = OFF, ix = (d * d + R * R - R2 * R2) / (2 * d);
  const iy = Math.sqrt(Math.max(0, R * R - ix * ix));
  for (const s of [-1, 1]) {
    const hx = C + ix, hy = C + s * iy;
    cometTail(ctx, hx, hy, 20, 210, Math.atan2(s * -0.6, 1), CORE, MAG, { alpha: 0.85 });
    sparkle(ctx, hx, hy, 52, CORE, { alpha: 0.98 });
  }
  // σκόρπια αστέρια-σκόνη γύρω από την αύρα
  embers(ctx, C - 80, C, R + 60, 70, MAG, rnd, { size: [1.5, 4.5], alpha: [0.2, 0.7] });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.5 + rnd() * Math.PI;
    const rr = R + 40 + rnd() * 120;
    sparkle(ctx, C + Math.cos(a) * rr, C + Math.sin(a) * rr, 8 + rnd() * 14, MAG, { alpha: 0.4 + rnd() * 0.35 });
  }
  cleanAlpha(canvas);
  save('assets/weapons/crescent_aura.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 06 · NEXUS BURST — assets/weapons/nexus_burst.png (1254²) + assets/nexus/nexus_burst.png (256²)
// Κρυσταλλικός ΠΥΡΗΝΑΣ-ΔΟΜΗ: μεγάλος faceted οβελίσκος πάνω από δακτύλιο βάσης,
// αστρικό ξέσπασμα, δορυφορικά shards. Διαβάζεται planted στα 128px.
// ════════════════════════════════════════════════════════════════════════════════
function genNexusBurst() {
  const S = 1254, C = S / 2;
  const { canvas, ctx, rnd } = begin('nexus_burst', S, S);
  const IND = '#7466ff', CYA = '#58f0ff', CORE = '#f0fbff', DARK = '#141038';
  // αστρικό ξέσπασμα πίσω — φωτεινό, 8 μεγάλες + 8 μικρές ακτίνες
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    const L = i % 2 ? 300 : 560;
    ctx.globalAlpha = i % 2 ? 0.6 : 0.9;
    const gg = ctx.createLinearGradient(C, C, C + Math.cos(a) * L, C + Math.sin(a) * L);
    gg.addColorStop(0, rgba(CYA, 0.95)); gg.addColorStop(1, rgba(IND, 0));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(C + Math.cos(a + 1.5708) * 22, C + Math.sin(a + 1.5708) * 22);
    ctx.lineTo(C + Math.cos(a) * L, C + Math.sin(a) * L);
    ctx.lineTo(C + Math.cos(a - 1.5708) * 22, C + Math.sin(a - 1.5708) * 22);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  orb(ctx, C, C - 30, 380, rgba(IND, 0.30), rgba(DARK, 0.12));
  // δακτύλιος βάσης (planted)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = CYA; ctx.lineWidth = 18; ctx.globalAlpha = 0.95;
  ctx.shadowColor = CYA; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.ellipse(C, C + 340, 320, 100, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.45; ctx.lineWidth = 7; ctx.setLineDash([46, 28]);
  ctx.beginPath(); ctx.ellipse(C, C + 340, 396, 130, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 8; i++) {                          // κόμβοι πάνω στον δακτύλιο
    const a = (i / 8) * Math.PI * 2;
    orb(ctx, C + Math.cos(a) * 320, C + 340 + Math.sin(a) * 100, 14, rgba(CORE, 0.9), rgba(CYA, 0.5));
  }
  // δορυφορικά shards ΠΙΣΩ από τον οβελίσκο
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.55;
    const dd = 360 + (i % 2) * 90;
    const sx = C + Math.cos(a) * dd, sy = C - 40 + Math.sin(a) * dd * 0.58;
    cometTail(ctx, sx, sy, 20, 130, a + Math.PI * 0.5, CORE, IND, { alpha: 0.5 });
    crystalShard(ctx, sx, sy, 150 + rnd() * 90, 70, a + Math.PI / 2, IND, CYA, DARK, rnd);
  }
  // κεντρικός faceted οβελίσκος — μεγάλος, με έντονο εσωτερικό φως
  crystalShard(ctx, C, C - 60, 760, 340, 0, IND, CORE, DARK, rnd);
  // εσωτερική «καρδιά» του οβελίσκου
  orb(ctx, C, C - 60, 150, rgba('#ffffff', 0.98), rgba(CYA, 0.65));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';   // κάθετη φλέβα φωτός
  ctx.strokeStyle = CORE; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.shadowColor = CYA; ctx.shadowBlur = 26; ctx.globalAlpha = 0.95;
  ctx.beginPath(); ctx.moveTo(C, C - 420); ctx.lineTo(C, C + 300); ctx.stroke();
  ctx.restore();
  energyRing(ctx, C, C - 60, 190, CYA, { width: 8, alpha: 0.85, blur: 24, dash: [34, 20] });
  energyRing(ctx, C, C - 60, 262, IND, { width: 5, alpha: 0.55, blur: 16, dash: [12, 28] });
  techArc(ctx, C, C - 60, 330, -0.8, 0.8, CYA, { width: 6, alpha: 0.7, dash: [60, 36] });
  techArc(ctx, C, C - 60, 330, Math.PI - 0.8, Math.PI + 0.8, CYA, { width: 6, alpha: 0.7, dash: [60, 36] });
  embers(ctx, C, C, 460, 80, CYA, rnd, { size: [1.5, 5], alpha: [0.25, 0.85] });
  sparkle(ctx, C, C - 440, 84, CORE, { alpha: 1 });
  sparkle(ctx, C, C + 320, 40, CYA, { alpha: 0.8 });
  cleanAlpha(canvas);
  save('assets/weapons/nexus_burst.png', canvas);
  const c2 = createCanvas(256, 256), x2 = c2.getContext('2d');
  x2.drawImage(canvas, 0, 0, 256, 256);
  save('assets/nexus/nexus_burst.png', c2);
}

// ════════════════════════════════════════════════════════════════════════════════
// 07 · BIOME CRYSTAL STREAM — assets/weapons/biome_crystal_stream.png (1086×1448)
// Κάθετη «βροχή» από teal κρυστάλλους: 8 shards με μύτη ΚΑΤΩ κατά μήκος
// S-στήλης, ο καθένας με δικό του trail, impact burst με θραύσματα στη βάση.
// ════════════════════════════════════════════════════════════════════════════════
function genCrystalStream() {
  const W = 1086, H = 1448, CX = W / 2, IY = H - 250;
  const { canvas, ctx, rnd } = begin('biome_crystal_stream', W, H);
  const TEAL = '#19e0b4', AQUA = '#8ffce7', CORE = '#eafffa', DARK = '#083a30';
  // κανάλι φωτός πίσω από τη στήλη
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, 60, 0, IY);
  g.addColorStop(0, rgba(TEAL, 0)); g.addColorStop(0.5, rgba(TEAL, 0.16)); g.addColorStop(1, rgba(AQUA, 0.30));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(CX - 120, 40); ctx.quadraticCurveTo(CX - 240, H * 0.5, CX - 300, IY);
  ctx.lineTo(CX + 300, IY); ctx.quadraticCurveTo(CX + 240, H * 0.5, CX + 120, 40);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // shards: μύτη κάτω (rotate π), S-curve x-offset, κατανεμημένοι σε ΟΛΟ το ύψος
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = 150 + t * (IY - 270);
    const x = CX + Math.sin(t * Math.PI * 2.2 + 0.4) * (150 - t * 50) + (rnd() - 0.5) * 70;
    const len = 120 + t * 180 + rnd() * 40, wid = len * 0.44;
    const tilt = Math.PI + (rnd() - 0.5) * 0.24;              // μύτη κάτω
    cometTail(ctx, x, y - len * 0.35, wid * 0.26, 170 + t * 150, Math.PI / 2, CORE, TEAL, { alpha: 0.42 });
    crystalShard(ctx, x, y, len, wid, tilt, TEAL, CORE, DARK, rnd);
    sparkle(ctx, x - wid * 0.12, y + len * 0.30, 18 + rnd() * 16, CORE, { alpha: 0.85 });
    // μικρο-θραύσματα δίπλα
    for (let k = 0; k < 2; k++) {
      const ox = (rnd() - 0.5) * 200, oy = (rnd() - 0.5) * 110;
      crystalShard(ctx, x + ox, y + oy, 30 + rnd() * 40, 20, Math.PI + (rnd() - 0.5) * 0.7, TEAL, AQUA, DARK, rnd);
    }
  }
  // impact burst στη βάση — ΜΕΓΑΛΟ
  sparkle(ctx, CX, IY, 270, CORE, { alpha: 0.98, thin: 0.12 });
  orb(ctx, CX, IY, 140, rgba(CORE, 0.98), rgba(TEAL, 0.6));
  energyRing(ctx, CX, IY, 235, TEAL, { width: 12, alpha: 0.9, blur: 28 });
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = TEAL; ctx.lineWidth = 7; ctx.globalAlpha = 0.6;
  ctx.shadowColor = TEAL; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.ellipse(CX, IY + 46, 350, 110, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([30, 22]); ctx.lineWidth = 4; ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.ellipse(CX, IY + 46, 250, 78, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // εκτοξευμένα θραύσματα από το impact
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * 1.05 + rnd() * Math.PI * 0.9;
    const dd = 150 + rnd() * 240;
    crystalShard(ctx, CX + Math.cos(a) * dd, IY + Math.sin(a) * dd * 0.4,
                 44 + rnd() * 66, 30, rnd() * Math.PI, TEAL, AQUA, DARK, rnd);
  }
  embers(ctx, CX, IY - 60, 320, 60, AQUA, rnd);
  cleanAlpha(canvas);
  save('assets/weapons/biome_crystal_stream.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 08 · LAVA BOMBS — assets/weapons/lavabombs_t.png (1254², ΑΥΣΤΗΡΑ 2×3 grid)
// 6 μολυβένιες βόμβες μάγματος: κρούστα-πλάκες, πυρωμένες ρωγμές, ΜΑΚΡΙΑ ουρά
// φωτιάς προς τα πάνω, δορυφορικά κομμάτια + πλούσια embers.
// ════════════════════════════════════════════════════════════════════════════════
function genLavaBombs() {
  const S = 1254, COLS = 2, ROWS = 3, CW = S / COLS, CH = S / ROWS;
  const { canvas, ctx, rnd } = begin('lavabombs', S, S);
  const LAVA = '#ff6a14', GOLD = '#ffd24a', CRUST = '#31160c', CRUST2 = '#4a2412';
  for (let cell = 0; cell < 6; cell++) {
    const cx = (cell % COLS) * CW + CW / 2;
    const cy = ((cell / COLS) | 0) * CH + CH / 2 + 52;
    const R = 104 + (cell % 3) * 15;
    const tailA = -Math.PI / 2 + (cell - 2.5) * 0.15;      // κίνηση κάτω → ουρά πάνω
    ctx.save();
    ctx.beginPath(); ctx.rect((cell % COLS) * CW + 4, ((cell / COLS) | 0) * CH + 4, CW - 8, CH - 8); ctx.clip();
    // ΜΑΚΡΙΑ ουρά (3 στρώσεις)
    cometTail(ctx, cx, cy, R * 1.05, CH * 0.92, tailA + Math.PI, GOLD, LAVA, { alpha: 0.95 });
    cometTail(ctx, cx, cy, R * 0.66, CH * 0.7, tailA + Math.PI, '#fff3c0', GOLD, { alpha: 0.9 });
    cometTail(ctx, cx, cy, R * 0.3, CH * 0.5, tailA + Math.PI, '#ffffff', '#fff3c0', { alpha: 0.9 });
    // embers κατά μήκος της ουράς
    for (let e = 0; e < 16; e++) {
      const tt = rnd();
      const ex = cx - Math.cos(tailA + Math.PI) * 0 + Math.cos(tailA) * (R + tt * CH * 0.7) + (rnd() - 0.5) * R * 1.4;
      const ey = cy + Math.sin(tailA) * (R + tt * CH * 0.7) + (rnd() - 0.5) * 30;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 + rnd() * 0.6; ctx.fillStyle = e % 3 ? GOLD : '#fff3c0';
      ctx.shadowColor = LAVA; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(ex, ey, 2 + rnd() * 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // δορυφορικά κομμάτια που ξεκόλλησαν
    for (let s = 0; s < 3; s++) {
      const sa = tailA + (rnd() - 0.5) * 1.2;
      const sd = R * (1.3 + rnd() * 0.9);
      const sx = cx + Math.cos(sa) * sd, sy = cy + Math.sin(sa) * sd;
      const sr = 10 + rnd() * 22;
      const sg = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, sr * 0.1, sx, sy, sr);
      sg.addColorStop(0, GOLD); sg.addColorStop(0.6, LAVA); sg.addColorStop(1, '#7a1e00');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    // πυρωμένος πυρήνας + σφαίρα μάγματος
    orb(ctx, cx, cy, R * 1.5, rgba(GOLD, 0.85), rgba(LAVA, 0.4));
    const bg = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    bg.addColorStop(0, GOLD); bg.addColorStop(0.55, LAVA); bg.addColorStop(1, '#a12800');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // κρούστα-πλάκες
    const plates = 7 + ((rnd() * 3) | 0);
    for (let p = 0; p < plates; p++) {
      const pa = rnd() * Math.PI * 2, pd = rnd() * R * 0.62;
      const px = cx + Math.cos(pa) * pd, py = cy + Math.sin(pa) * pd;
      const pr = R * (0.26 + rnd() * 0.3);
      ctx.fillStyle = p % 2 ? CRUST : CRUST2;
      ctx.beginPath();
      const verts = 6 + ((rnd() * 3) | 0);
      for (let v = 0; v < verts; v++) {
        const va = (v / verts) * Math.PI * 2 + rnd() * 0.5;
        const vr = pr * (0.7 + rnd() * 0.45);
        const vx = px + Math.cos(va) * vr, vy = py + Math.sin(va) * vr;
        const dd = Math.hypot(vx - cx, vy - cy);
        const kk = dd > R * 0.94 ? (R * 0.94) / dd : 1;
        if (v === 0) ctx.moveTo(cx + (vx - cx) * kk, cy + (vy - cy) * kk);
        else ctx.lineTo(cx + (vx - cx) * kk, cy + (vy - cy) * kk);
      }
      ctx.closePath(); ctx.fill();
    }
    // λαμπερές ρωγμές
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 7; k++) {
      const a0 = rnd() * Math.PI * 2;
      ctx.strokeStyle = rgba(GOLD, 0.8); ctx.lineWidth = 3 + rnd() * 4;
      ctx.shadowColor = LAVA; ctx.shadowBlur = 16; ctx.lineCap = 'round';
      ctx.beginPath();
      let px = cx + Math.cos(a0) * R * 0.2, py = cy + Math.sin(a0) * R * 0.2;
      ctx.moveTo(px, py);
      for (let sgm = 0; sgm < 4; sgm++) {
        const na = a0 + (rnd() - 0.5) * 1.2;
        px += Math.cos(na) * R * 0.22; py += Math.sin(na) * R * 0.22;
        const dd = Math.hypot(px - cx, py - cy);
        if (dd > R * 0.92) break;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
    rim(ctx, c => { c.beginPath(); c.arc(cx, cy, R - 3, -2.4, -0.4); c.stroke(); }, GOLD, { width: 6, alpha: 0.85, blur: 18 });
    embers(ctx, cx, cy - R * 0.4, R * 1.5, 26, GOLD, rnd, { size: [1.5, 5], alpha: [0.3, 0.9] });
    ctx.restore();
  }
  cleanAlpha(canvas);
  save('assets/weapons/lavabombs_t.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 09 · TARGET MARKER — assets/weapons/marker_t.png (1254²)
// Crimson strike reticle εδάφους: σπασμένα τόξα, ΕΝΤΟΝΟ dashed δαχτυλίδι,
// 4 γεμάτα βέλη-chevrons προς τα μέσα, διαμάντι-πυρήνας. Καθαρό alpha.
// ════════════════════════════════════════════════════════════════════════════════
function genTargetMarker() {
  const S = 1254, C = S / 2;
  const { canvas, ctx, rnd } = begin('target_marker', S, S);
  const RED = '#ff2038', HOT = '#ff7a6a', CORE = '#fff0ee';
  orb(ctx, C, C, 520, rgba(RED, 0.20), rgba(RED, 0.06));
  // εξωτερικά 4 σπασμένα τόξα (διπλά)
  for (let k = 0; k < 4; k++) {
    const a0 = k * Math.PI / 2 + 0.28;
    energyRing(ctx, C, C, 520, RED, { width: 24, alpha: 0.95, blur: 28, a0, a1: a0 + Math.PI / 2 - 0.56 });
    energyRing(ctx, C, C, 520, CORE, { width: 7, alpha: 0.95, blur: 8, a0: a0 + 0.02, a1: a0 + Math.PI / 2 - 0.6 });
  }
  // dashed μεσαίο δαχτυλίδι — έντονο, διπλό
  energyRing(ctx, C, C, 402, RED, { width: 16, alpha: 0.95, blur: 20, dash: [52, 34] });
  energyRing(ctx, C, C, 402, CORE, { width: 5, alpha: 0.8, blur: 8, dash: [52, 34] });
  // ticks
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = i % 6 === 0 ? 312 : 344, r1 = 378;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = i % 6 === 0 ? CORE : RED; ctx.globalAlpha = i % 6 === 0 ? 0.95 : 0.65;
    ctx.lineWidth = i % 6 === 0 ? 12 : 6; ctx.lineCap = 'round';
    ctx.shadowColor = RED; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
    ctx.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
    ctx.stroke(); ctx.restore();
  }
  // 4 ΓΕΜΑΤΑ βέλη-chevrons που δείχνουν το κέντρο
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    ctx.save();
    ctx.translate(C + Math.cos(a) * 262, C + Math.sin(a) * 262);
    ctx.rotate(a + Math.PI);                                // μύτη προς το κέντρο
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = RED; ctx.shadowBlur = 24;
    ctx.fillStyle = RED; ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(64, 0); ctx.lineTo(-58, 74); ctx.lineTo(-28, 0); ctx.lineTo(-58, -74);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = CORE; ctx.globalAlpha = 0.95; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(52, 0); ctx.lineTo(-30, 48); ctx.lineTo(-12, 0); ctx.lineTo(-30, -48);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // σταυρός που δεν ακουμπά το κέντρο
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = CORE; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.shadowColor = RED; ctx.shadowBlur = 16; ctx.globalAlpha = 0.95;
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    ctx.beginPath();
    ctx.moveTo(C + Math.cos(a) * 74, C + Math.sin(a) * 74);
    ctx.lineTo(C + Math.cos(a) * 168, C + Math.sin(a) * 168);
    ctx.stroke();
  }
  ctx.restore();
  // διαμάντι-πυρήνας (μεγαλύτερο, διπλό)
  ctx.save();
  ctx.translate(C, C); ctx.rotate(Math.PI / 4);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = RED; ctx.lineWidth = 18; ctx.shadowColor = RED; ctx.shadowBlur = 26;
  ctx.strokeRect(-56, -56, 112, 112);
  ctx.strokeStyle = CORE; ctx.lineWidth = 6; ctx.shadowBlur = 8;
  ctx.strokeRect(-56, -56, 112, 112);
  ctx.restore();
  orb(ctx, C, C, 40, rgba(CORE, 0.98), rgba(HOT, 0.55));
  embers(ctx, C, C, 480, 26, HOT, rnd, { size: [1.5, 3.5], alpha: [0.2, 0.6] });
  cleanAlpha(canvas);
  save('assets/weapons/marker_t.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 10 · VESSEL PURPLE ROCKET — assets/weapons/vessel_purple_rockets.png (1254²)
// Smart-πύραυλος χρώμιο+μωβ, ΜΥΤΗ +X: λαμπερή μωβ μύτη-αισθητήρας, canards,
// τριπλά πίσω πτερύγια, ΦΩΤΕΙΝΟ πλούμιο εξάτμισης + δαχτυλίδι ώθησης.
// ════════════════════════════════════════════════════════════════════════════════
function genVesselRocket() {
  const S = 1254, C = S / 2;
  const { canvas, ctx, rnd } = begin('vessel_purple_rocket', S, S);
  const PUR = '#b24cff', LAV = '#e0a0ff', CORE = '#f8ecff', ALLOY = '#463d63', DARKA = '#171226';
  const L = 900, W = 225;
  const x0 = C - L * 0.40, x1 = C + L * 0.60;
  // ΠΛΟΥΜΙΟ εξάτμισης — μεγάλο, φωτεινό, 3 στρώσεις + δαχτυλίδι
  cometTail(ctx, x0 - 10, C, W * 0.5, 560, 0, '#ffffff', PUR, { alpha: 1 });
  cometTail(ctx, x0 - 10, C, W * 0.32, 400, 0, CORE, LAV, { alpha: 0.95 });
  cometTail(ctx, x0 - 10, C, W * 0.16, 260, 0, '#ffffff', '#ffffff', { alpha: 0.9 });
  energyRing(ctx, x0 - 30, C, W * 0.36, LAV, { width: 14, alpha: 0.95, blur: 28 });
  energyRing(ctx, x0 - 90, C, W * 0.5, PUR, { width: 8, alpha: 0.6, blur: 20 });
  embers(ctx, x0 - 200, C, 220, 46, LAV, rnd, { size: [2, 6], alpha: [0.3, 0.9] });
  // speed streaks
  for (let i = 0; i < 12; i++) {
    const y = C + (rnd() - 0.5) * W * 2.4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(LAV, 0.15 + rnd() * 0.28); ctx.lineWidth = 3 + rnd() * 4; ctx.lineCap = 'round';
    const sx = x0 - 40 + rnd() * 560;
    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx - 160 - rnd() * 260, y); ctx.stroke();
    ctx.restore();
  }
  // πίσω πτερύγια (πάνω/κάτω μεγάλα + κεντρικό κάθετο μικρό)
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.fillStyle = metalGrad(ctx, 0, C + s * W * 0.2, 0, C + s * W * 1.1, ALLOY, '#6e5f9e', DARKA);
    ctx.beginPath();
    ctx.moveTo(x0 + 60, C + s * W * 0.30);
    ctx.lineTo(x0 - 70, C + s * W * 1.06);
    ctx.lineTo(x0 + 150, C + s * W * 0.86);
    ctx.lineTo(x0 + 240, C + s * W * 0.34);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(x0 - 70, C + s * W * 1.06); c.lineTo(x0 + 150, C + s * W * 0.86); c.stroke(); }, PUR, { width: 6, alpha: 0.95, blur: 16 });
    // φως στην άκρη πτερυγίου
    orb(ctx, x0 - 58, C + s * W * 1.02, 16, rgba(CORE, 0.95), rgba(PUR, 0.6));
    ctx.restore();
  }
  // κεντρικό ραχιαίο πτερύγιο (πίσω, πάνω από το σώμα)
  ctx.save();
  ctx.fillStyle = metalGrad(ctx, 0, C - W * 0.1, 0, C - W * 0.75, '#57497e', '#8b7cc0', DARKA);
  ctx.beginPath();
  ctx.moveTo(x0 + 90, C - W * 0.30);
  ctx.lineTo(x0 + 40, C - W * 0.72);
  ctx.lineTo(x0 + 220, C - W * 0.42);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // σώμα
  ctx.save();
  ctx.fillStyle = metalGrad(ctx, 0, C - W / 2, 0, C + W / 2, '#544a74', '#a396cf', DARKA);
  ctx.beginPath();
  ctx.moveTo(x0, C - W * 0.34);
  ctx.lineTo(x1 - 260, C - W * 0.40);
  ctx.quadraticCurveTo(x1 - 60, C - W * 0.32, x1, C);
  ctx.quadraticCurveTo(x1 - 60, C + W * 0.32, x1 - 260, C + W * 0.40);
  ctx.lineTo(x0, C + W * 0.34);
  ctx.quadraticCurveTo(x0 - 40, C, x0, C - W * 0.34);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // ΛΑΜΠΕΡΗ μωβ μύτη (gradient προς την αιχμή)
  ctx.save();
  const ng = ctx.createLinearGradient(x1 - 300, 0, x1, 0);
  ng.addColorStop(0, rgba(PUR, 0)); ng.addColorStop(0.55, rgba(PUR, 0.75)); ng.addColorStop(1, rgba(CORE, 0.98));
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.moveTo(x1 - 280, C - W * 0.395);
  ctx.quadraticCurveTo(x1 - 60, C - W * 0.32, x1, C);
  ctx.quadraticCurveTo(x1 - 60, C + W * 0.32, x1 - 280, C + W * 0.395);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  sparkle(ctx, x1 - 26, C, 70, '#ffffff', { alpha: 0.98 });
  // μωβ ζώνη + panel ρίγες + φώτα
  ctx.save();
  ctx.fillStyle = metalGrad(ctx, 0, C - W / 2, 0, C + W / 2, PUR, LAV, '#5a1d8a');
  ctx.beginPath();
  ctx.moveTo(x1 - 470, C - W * 0.385); ctx.lineTo(x1 - 350, C - W * 0.39);
  ctx.lineTo(x1 - 350, C + W * 0.39); ctx.lineTo(x1 - 470, C + W * 0.385);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = DARKA; ctx.lineWidth = 5;
  for (const px of [x0 + 140, x0 + 260, x1 - 560]) {
    ctx.beginPath(); ctx.moveTo(px, C - W * 0.35); ctx.lineTo(px, C + W * 0.35); ctx.stroke();
  }
  ctx.restore();
  for (const px of [x0 + 200, x0 + 320, x1 - 520]) {       // σειρά φώτων
    orb(ctx, px, C, 12, rgba(CORE, 0.9), rgba(PUR, 0.5));
  }
  // canards κοντά στη μύτη
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.fillStyle = metalGrad(ctx, 0, C + s * W * 0.2, 0, C + s * W * 0.62, '#57497e', '#8b7cc0', DARKA);
    ctx.beginPath();
    ctx.moveTo(x1 - 400, C + s * W * 0.30);
    ctx.lineTo(x1 - 470, C + s * W * 0.62);
    ctx.lineTo(x1 - 330, C + s * W * 0.38);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // rim light ράχης
  rim(ctx, c => { c.beginPath(); c.moveTo(x0, C - W * 0.34); c.lineTo(x1 - 260, C - W * 0.40); c.quadraticCurveTo(x1 - 60, C - W * 0.32, x1, C); c.stroke(); }, LAV, { width: 7, alpha: 0.95, blur: 18 });
  cleanAlpha(canvas);
  save('assets/weapons/vessel_purple_rockets.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 11 · FLAME BURST (Eddie base shot) — assets/weapons/eddie_flame.png (140×512)
// Ζωντανή φλόγα-κομήτης, κεφαλή ΠΑΝΩ: λευκός πυρήνας, χρυσές/πορτοκαλί γλώσσες
// με κυρτές αιχμές, πλαϊνά «γλειψίματα», embers. Για 'lighter' στα ~50px.
// ════════════════════════════════════════════════════════════════════════════════
function genEddieFlame() {
  const W = 140, H = 512, CX = W / 2;
  const { canvas, ctx, rnd } = begin('eddie_flame', W, H);
  const ORA = '#ff5a1a', GOLD = '#ffc83c', CORE = '#fff6da';
  const headY = 74;
  // εξωτερικό σώμα φλόγας
  flameTongue(ctx, CX, headY - 46, H - 10, 56, 0, ORA, 0.9);
  // πλαϊνά γλειψίματα (αριστερά/δεξιά, πιο κοντά)
  flameTongue(ctx, CX - 26, headY + 60, H - 150, 26, -14, ORA, 0.7);
  flameTongue(ctx, CX + 26, headY + 90, H - 120, 24, 14, GOLD, 0.65);
  // μεσαία χρυσή γλώσσα
  flameTongue(ctx, CX, headY - 26, H - 120, 38, 4, GOLD, 0.95);
  // εσωτερική λευκή καρδιά
  flameTongue(ctx, CX, headY - 8, H - 230, 22, -3, CORE, 0.98);
  // κεφαλή: λευκός-χρυσός πυρήνας
  orb(ctx, CX, headY, 50, rgba('#ffffff', 1), rgba(GOLD, 0.8));
  orb(ctx, CX, headY, 24, rgba('#ffffff', 1), rgba(CORE, 0.95));
  sparkle(ctx, CX, headY - 6, 40, '#ffffff', { alpha: 0.95 });
  // embers
  for (let i = 0; i < 18; i++) {
    const y = headY + 50 + rnd() * (H - 170);
    const x = CX + (rnd() - 0.5) * (34 + (y - headY) * 0.22);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 + rnd() * 0.6;
    ctx.fillStyle = i % 3 ? GOLD : CORE;
    ctx.shadowColor = ORA; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(x, y, 1.5 + rnd() * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  cleanAlpha(canvas);
  save('assets/weapons/eddie_flame.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 12 · ORBITAL LASER BEACON GUN — assets/weapons/nexus/Weapon 3 Orbital Laser Beacon Gun.png (1254²)
// Sleek beacon-μονόλιθος που ρίχνει ΙΣΧΥΡΗ κάθετη amber δέσμη ως την κορυφή,
// ανερχόμενα δαχτυλίδια, στόχευση εδάφους, amber φώτα, 3 γωνιώδη πόδια.
// ════════════════════════════════════════════════════════════════════════════════
function genOrbitalBeacon() {
  const S = 1254, C = S / 2, GY = 960;
  const { canvas, ctx, rnd } = begin('orbital_beacon', S, S);
  const AMB = '#ffb400', HOT = '#ff5a2a', CORE = '#fff5d6', ALLOY = '#39404e', DARKA = '#141922';
  const headY = GY - 560;                                  // κεφαλή εκπομπής
  // ΔΕΣΜΗ: από την κεφαλή ως την κορυφή, 3 στρώσεις, φαρδαίνει ψηλά
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const beam = (wTop, wBot, col, a) => {
    const g = ctx.createLinearGradient(0, 10, 0, headY);
    g.addColorStop(0, rgba(col, a * 0.85)); g.addColorStop(0.85, rgba(col, a)); g.addColorStop(1, rgba(col, a));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(C - wTop, 6); ctx.lineTo(C + wTop, 6);
    ctx.lineTo(C + wBot, headY); ctx.lineTo(C - wBot, headY);
    ctx.closePath(); ctx.fill();
  };
  beam(150, 64, AMB, 0.55); beam(92, 40, '#ffd984', 0.75); beam(34, 16, '#ffffff', 0.98);
  ctx.restore();
  // ανερχόμενα δαχτυλίδια
  for (const [y, r, al] of [[180, 170, 0.9], [400, 130, 0.7], [620, 100, 0.55], [790, 80, 0.45]]) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al;
    ctx.strokeStyle = AMB; ctx.lineWidth = 12; ctx.shadowColor = AMB; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.ellipse(C, y, r, r * 0.26, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  sparkle(ctx, C, 60, 150, CORE, { alpha: 0.98, thin: 0.1 });
  // στόχευση εδάφους (διπλή, φωτεινή)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = HOT; ctx.lineWidth = 14; ctx.globalAlpha = 0.9;
  ctx.shadowColor = HOT; ctx.shadowBlur = 28;
  ctx.beginPath(); ctx.ellipse(C, GY + 70, 440, 132, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = AMB; ctx.setLineDash([48, 32]); ctx.lineWidth = 7; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.ellipse(C, GY + 70, 330, 96, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    orb(ctx, C + Math.cos(a) * 440, GY + 70 + Math.sin(a) * 132, 15, rgba(CORE, 0.9), rgba(HOT, 0.5));
  }
  // πόδια (2 μπροστά + 1 πίσω κεντρικό)
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.fillStyle = metalGrad(ctx, C, 0, C + s * 300, 0, ALLOY, '#5c6678', DARKA);
    ctx.beginPath();
    ctx.moveTo(C + s * 66, GY - 340);
    ctx.lineTo(C + s * 140, GY - 300);
    ctx.lineTo(C + s * 330, GY + 40);
    ctx.lineTo(C + s * 236, GY + 66);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = DARKA;                                  // πέλμα
    ctx.beginPath();
    ctx.moveTo(C + s * 366, GY + 18); ctx.lineTo(C + s * 226, GY + 78);
    ctx.lineTo(C + s * 250, GY + 108); ctx.lineTo(C + s * 396, GY + 54);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(C + s * 140, GY - 300); c.lineTo(C + s * 330, GY + 40); c.stroke(); }, AMB, { width: 4, alpha: 0.7, blur: 12 });
    ctx.restore();
  }
  // σώμα-μονόλιθος: ψηλή γωνιώδης κολόνα
  ctx.save();
  ctx.fillStyle = metalGrad(ctx, C - 130, 0, C + 130, 0, ALLOY, '#727e94', DARKA);
  ctx.beginPath();
  ctx.moveTo(C - 104, GY - 300);
  ctx.lineTo(C - 128, headY + 130); ctx.lineTo(C - 66, headY + 40);
  ctx.lineTo(C + 66, headY + 40); ctx.lineTo(C + 128, headY + 130);
  ctx.lineTo(C + 104, GY - 300);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // κάθετη amber φλέβα στο σώμα + panel ρίγες + φώτα
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = AMB; ctx.lineWidth = 10; ctx.globalAlpha = 0.9;
  ctx.shadowColor = AMB; ctx.shadowBlur = 20; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(C, headY + 70); ctx.lineTo(C, GY - 330); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = DARKA; ctx.lineWidth = 6;
  for (const yy of [headY + 160, headY + 250, headY + 340, GY - 360]) {
    ctx.beginPath(); ctx.moveTo(C - 110, yy); ctx.lineTo(C + 110, yy); ctx.stroke();
  }
  ctx.restore();
  for (const s of [-1, 1]) {
    orb(ctx, C + s * 78, headY + 200, 20, rgba(CORE, 0.95), rgba(AMB, 0.6));
    orb(ctx, C + s * 78, headY + 300, 14, rgba(HOT, 0.9), rgba(HOT, 0.4));
  }
  // κεφαλή εκπομπής: χοάνη + λαμπερός φακός + δαχτυλίδι
  ctx.save();
  ctx.fillStyle = metalGrad(ctx, C - 170, 0, C + 170, 0, '#4a5364', '#8794ac', DARKA);
  ctx.beginPath();
  ctx.moveTo(C - 168, headY + 60); ctx.lineTo(C + 168, headY + 60);
  ctx.lineTo(C + 104, headY - 70); ctx.lineTo(C - 104, headY - 70);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  rim(ctx, c => { c.beginPath(); c.moveTo(C - 168, headY + 60); c.lineTo(C - 104, headY - 70); c.lineTo(C + 104, headY - 70); c.lineTo(C + 168, headY + 60); c.stroke(); }, AMB, { width: 5, alpha: 0.9, blur: 14 });
  orb(ctx, C, headY - 10, 110, rgba('#ffffff', 1), rgba(AMB, 0.8));
  sparkle(ctx, C, headY - 10, 170, CORE, { alpha: 0.95 });
  energyRing(ctx, C, headY - 10, 148, AMB, { width: 9, alpha: 0.95, blur: 26 });
  embers(ctx, C, headY, 260, 40, AMB, rnd);
  cleanAlpha(canvas);
  save('assets/weapons/nexus/Weapon 3 Orbital Laser Beacon Gun.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 13 · NANITE NANO-SWARM CLOUD — assets/weapons/nexus/Weapon 4 Nanite Nano-Swarm Cloud.png (1254²)
// Οργανικό ΝΕΦΟΣ από σμήνη μικρο-τρίγωνα nanites: ακανόνιστες συστάδες, ρεύματα
// με διαφορετικές καμπύλες, 7 «αρχηγοί» με μάτι-πυρήνα, σκοτεινή μεταλλική μάζα.
// ════════════════════════════════════════════════════════════════════════════════
function genNanoSwarm() {
  const S = 1254, C = S / 2;
  const { canvas, ctx, rnd } = begin('nano_swarm_cloud', S, S);
  const NGRN = '#8cff5a', SIL = '#c8d4d2', CORE = '#f2ffe8', DARKN = '#0c1410';
  const tri = (x, y, r, ang, fill, alpha, glowCol) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    if (glowCol) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = glowCol; ctx.shadowBlur = 8; }
    ctx.globalAlpha = alpha; ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(r * 1.4, 0); ctx.lineTo(-r, r * 0.8); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, -r * 0.8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  // νέφος-βάση: ακανόνιστη σκοτεινή μάζα (μετατοπισμένη ελαφρώς) + πράσινη ανταύγεια
  for (let i = 0; i < 42; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 400;
    const x = C - 40 + Math.cos(a) * d, y = C + 20 + Math.sin(a) * d * 0.72;
    ctx.save();
    ctx.globalAlpha = 0.10 + rnd() * 0.16;
    ctx.fillStyle = i % 3 ? DARKN : '#15281d';
    ctx.beginPath(); ctx.arc(x, y, 60 + rnd() * 160, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  orb(ctx, C, C, 460, rgba(NGRN, 0.13), rgba(NGRN, 0.04));
  // 5 ρεύματα με ΔΙΑΦΟΡΕΤΙΚΕΣ καμπύλες (bezier, όχι κανονική σπείρα)
  const flowPts = [];
  for (let f = 0; f < 5; f++) {
    const a0 = (f / 5) * Math.PI * 2 + rnd() * 0.6;          // ομοιόμορφη κάλυψη περιμέτρου
    const p0 = [C + Math.cos(a0) * (430 + rnd() * 120), C + Math.sin(a0) * (380 + rnd() * 100)];
    const p3 = [C + (rnd() - 0.5) * 140, C + (rnd() - 0.5) * 120];
    const p1 = [p0[0] + (rnd() - 0.5) * 500, p0[1] + (rnd() - 0.5) * 500];
    const p2 = [p3[0] + (rnd() - 0.5) * 420, p3[1] + (rnd() - 0.5) * 420];
    const pts = [];
    for (let t = 0; t <= 1; t += 0.02) {
      const u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
    flowPts.push(pts);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(NGRN, 0.13); ctx.lineWidth = 26; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.stroke(); ctx.restore();
  }
  // nanites κατά μήκος των ρευμάτων — πυκνότητα αυξάνεται προς το τέλος (κέντρο)
  for (const pts of flowPts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const dens = 1 + ((i / pts.length) * 3 + rnd() * 2) | 0;
      for (let k = 0; k < dens; k++) {
        const [x, y] = pts[i];
        const ang = Math.atan2(pts[i + 1][1] - y, pts[i + 1][0] - x);
        const spread = 26 + (1 - i / pts.length) * 70;
        const ox = (rnd() - 0.5) * spread, oy = (rnd() - 0.5) * spread;
        const r = 5 + rnd() * 12;
        const metal = rnd() < 0.55;
        tri(x + ox, y + oy, r, ang + (rnd() - 0.5) * 0.6,
            metal ? rgba(SIL, 0.85) : rgba(NGRN, 0.92), 0.5 + rnd() * 0.5, metal ? null : NGRN);
      }
    }
  }
  // 4 συστάδες ΚΑΤΑ ΜΗΚΟΣ των ρευμάτων (ίδιος προσανατολισμός → οργανωμένο σμήνος)
  for (let ccl = 0; ccl < 4; ccl++) {
    const pts = flowPts[ccl % flowPts.length];
    const idx = 8 + ((rnd() * (pts.length - 16)) | 0);
    const [cx, cy] = pts[idx];
    const ang = Math.atan2(pts[idx + 1][1] - cy, pts[idx + 1][0] - cx);
    for (let k = 0; k < 12 + rnd() * 8; k++) {
      tri(cx + (rnd() - 0.5) * 130, cy + (rnd() - 0.5) * 90, 4 + rnd() * 9,
          ang + (rnd() - 0.5) * 0.35, rnd() < 0.5 ? rgba(SIL, 0.8) : rgba(NGRN, 0.9),
          0.4 + rnd() * 0.5, rnd() < 0.4 ? NGRN : null);
    }
  }
  // 6 «αρχηγοί» — ΜΕΓΑΛΑ nanites με λαμπερό μάτι-πυρήνα και trail
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4 + rnd() * 0.3;
    const d = 150 + rnd() * 250;
    const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d * 0.85;
    const r = 50 + rnd() * 26, ang = a + Math.PI * (0.6 + rnd() * 0.3);
    cometTail(ctx, x, y, r * 0.5, 190 + rnd() * 110, ang, CORE, NGRN, { alpha: 0.6 });
    tri(x, y, r, ang, metalGrad(ctx, x - r, y, x + r, y, '#9fb3ad', '#e8f6f0', '#41524c'), 1, null);
    tri(x, y, r * 0.99, ang, 'rgba(0,0,0,0)', 0.001, NGRN);   // glow pass γύρω από τον αρχηγό
    orb(ctx, x + Math.cos(ang) * r * 0.5, y + Math.sin(ang) * r * 0.5, r * 0.4, rgba(CORE, 1), rgba(NGRN, 0.8));
    sparkle(ctx, x + Math.cos(ang) * r * 0.5, y + Math.sin(ang) * r * 0.5, r * 0.75, NGRN, { alpha: 0.85 });
  }
  // πυρήνας σμήνους — μικρός, φωτεινός
  orb(ctx, C, C, 100, rgba(CORE, 0.95), rgba(NGRN, 0.55));
  sparkle(ctx, C, C, 150, NGRN, { alpha: 0.8 });
  embers(ctx, C, C, 480, 90, NGRN, rnd, { size: [1, 3.5], alpha: [0.2, 0.7] });
  cleanAlpha(canvas);
  save('assets/weapons/nexus/Weapon 4 Nanite Nano-Swarm Cloud.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 14 · PLASMA EXECUTION MATRIX — assets/weapons/vfx/plasma_execution_hd.png (1254²)
// Ματζέντα «execution X»: διασταυρωμένες λεπίδες πλάσματος, περιστρεφόμενα
// matrix-πλαίσια, σπείρα blade-πετάλων, λαμπερός πυρήνας.
// ════════════════════════════════════════════════════════════════════════════════
function genPlasmaExecution() {
  const S = 1254, C = S / 2;
  const { canvas, ctx, rnd } = begin('plasma_execution_matrix', S, S);
  const MAG = '#ff5cd2', PNK = '#ff9ae8', CORE = '#fff0fb', DEEP = '#8a1560';
  orb(ctx, C, C, 460, rgba(MAG, 0.26), rgba(DEEP, 0.10));
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const ang = t * Math.PI * 4.2;
    const rr = 150 + t * 400;
    const x = C + Math.cos(ang) * rr, y = C + Math.sin(ang) * rr;
    const sz = 26 + t * 54;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42 + 0.55 * (1 - t);
    const g = ctx.createLinearGradient(0, -sz, 0, sz);
    g.addColorStop(0, rgba(CORE, 0.95)); g.addColorStop(0.5, rgba(MAG, 0.85)); g.addColorStop(1, rgba(DEEP, 0.2));
    ctx.fillStyle = g;
    ctx.shadowColor = MAG; ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.quadraticCurveTo(sz * 0.62, -sz * 0.2, 0, sz);
    ctx.quadraticCurveTo(-sz * 0.2, -sz * 0.15, 0, -sz);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  for (const [rot, sz, w, al] of [[Math.PI / 4, 360, 15, 0.85], [0, 300, 9, 0.55]]) {
    ctx.save();
    ctx.translate(C, C); ctx.rotate(rot);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = MAG; ctx.lineWidth = w; ctx.globalAlpha = al;
    ctx.shadowColor = MAG; ctx.shadowBlur = 28;
    ctx.setLineDash([90, 46]);
    ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
    ctx.restore();
  }
  const blade = (ang) => {
    ctx.save();
    ctx.translate(C, C); ctx.rotate(ang);
    const L = 440, W2 = 78;
    const g = ctx.createLinearGradient(0, -W2, 0, W2);
    g.addColorStop(0, rgba(CORE, 0.98)); g.addColorStop(0.5, rgba(MAG, 0.92)); g.addColorStop(1, rgba(DEEP, 0.5));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.shadowColor = MAG; ctx.shadowBlur = 32;
    ctx.beginPath();
    ctx.moveTo(-L, 0);
    ctx.quadraticCurveTo(-L * 0.5, -W2, 0, -W2 * 0.7);
    ctx.quadraticCurveTo(L * 0.5, -W2 * 0.5, L, 0);
    ctx.quadraticCurveTo(L * 0.5, W2 * 0.5, 0, W2 * 0.7);
    ctx.quadraticCurveTo(-L * 0.5, W2, -L, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = CORE; ctx.lineWidth = 6; ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(-L, 0); ctx.quadraticCurveTo(-L * 0.5, -W2, 0, -W2 * 0.7);
    ctx.quadraticCurveTo(L * 0.5, -W2 * 0.5, L, 0);
    ctx.stroke();
    sparkle(ctx, L - 16, 0, 48, CORE, { alpha: 0.98 });
    sparkle(ctx, -L + 16, 0, 48, CORE, { alpha: 0.98 });
    ctx.restore();
  };
  blade(Math.PI / 4); blade(-Math.PI / 4);
  orb(ctx, C, C, 135, rgba('#ffffff', 1), rgba(PNK, 0.8));
  energyRing(ctx, C, C, 175, PNK, { width: 9, alpha: 0.95, blur: 28 });
  embers(ctx, C, C, 470, 70, PNK, rnd, { size: [1.5, 4.5], alpha: [0.25, 0.85] });
  cleanAlpha(canvas);
  save('assets/weapons/vfx/plasma_execution_hd.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 15 · STORM CONDUCTOR — assets/weapons/vfx/storm_conductor_hd.png (1254²)
// Παγωμένο 360° mandala: αγώγιμος δακτύλιος με κόμβους, ακτινωτοί κεραυνοί,
// τόξα-εκκενώσεις ΑΝΑΜΕΣΑ στους κόμβους, κεντρική σφαίρα-αγωγός με πηνίο.
// ════════════════════════════════════════════════════════════════════════════════
function genStormConductor() {
  const S = 1254, C = S / 2;
  const { canvas, ctx, rnd } = begin('storm_conductor', S, S);
  const ICE = '#c0e8ff', ELEC = '#7db8ff', CORE = '#f4faff', DEEP = '#274a80';
  orb(ctx, C, C, 500, rgba(ELEC, 0.22), rgba(DEEP, 0.10));
  energyRing(ctx, C, C, 480, ICE, { width: 18, alpha: 0.95, blur: 32 });
  energyRing(ctx, C, C, 434, ELEC, { width: 6, alpha: 0.6, blur: 16, dash: [50, 30] });
  const nodes = 10;
  // εκκενώσεις-τόξα ΑΝΑΜΕΣΑ σε γειτονικούς κόμβους (πάνω στον δακτύλιο)
  for (let i = 0; i < nodes; i++) {
    const a0 = (i / nodes) * Math.PI * 2;
    const a1 = ((i + 1) / nodes) * Math.PI * 2;
    lightning(ctx, C + Math.cos(a0) * 480, C + Math.sin(a0) * 480,
              C + Math.cos(a1) * 480, C + Math.sin(a1) * 480,
              { seg: 7, jag: 18, width: 3.5, color: ICE, core: CORE, rnd });
  }
  for (let i = 0; i < nodes; i++) {
    const a = (i / nodes) * Math.PI * 2;
    orb(ctx, C + Math.cos(a) * 480, C + Math.sin(a) * 480, 30, rgba(CORE, 0.98), rgba(ICE, 0.6));
  }
  // ακτινωτοί κεραυνοί σφαίρα → κόμβοι
  for (let i = 0; i < nodes; i++) {
    const a = (i / nodes) * Math.PI * 2 + 0.05;
    const x = C + Math.cos(a) * 468, y = C + Math.sin(a) * 468;
    const pts = lightning(ctx, C + Math.cos(a) * 140, C + Math.sin(a) * 140, x, y,
                          { seg: 10, jag: 28, width: 6.5, color: ELEC, core: CORE, rnd });
    if (rnd() < 0.7) {
      const p = pts[4 + ((rnd() * 4) | 0)];
      const ba = a + (rnd() - 0.5) * 1.3;
      lightning(ctx, p[0], p[1], p[0] + Math.cos(ba) * 140, p[1] + Math.sin(ba) * 140,
                { seg: 5, jag: 16, width: 3.5, color: ICE, core: CORE, rnd });
    }
  }
  energyRing(ctx, C, C, 255, ICE, { width: 8, alpha: 0.7, blur: 20, dash: [16, 12] });
  // κεντρικός αγωγός: σφαίρα + κάθετο πηνίο (τόξα αριστερά-δεξιά)
  orb(ctx, C, C, 160, rgba('#ffffff', 1), rgba(ICE, 0.75));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = ELEC; ctx.globalAlpha = 0.9; ctx.lineWidth = 8;
  ctx.shadowColor = ELEC; ctx.shadowBlur = 18;
  for (const k of [-2, -1, 0, 1, 2]) {
    const rr = 132 - Math.abs(k) * 16;
    ctx.beginPath(); ctx.ellipse(C, C + k * 40, rr, 20, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  sparkle(ctx, C, C - 180, 44, CORE, { alpha: 0.95 });
  sparkle(ctx, C, C + 180, 44, CORE, { alpha: 0.95 });
  embers(ctx, C, C, 490, 80, ICE, rnd, { size: [1.5, 4], alpha: [0.25, 0.8] });
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = 210 + rnd() * 250;
    sparkle(ctx, C + Math.cos(a) * d, C + Math.sin(a) * d, 12 + rnd() * 24, CORE, { alpha: 0.6 + rnd() * 0.35 });
  }
  cleanAlpha(canvas);
  save('assets/weapons/vfx/storm_conductor_hd.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 16 · ACTIVE OVERRIDE BEAM — assets/weapons/vfx/active_override beam.png (1254²)
// UV-βιολετί δέσμη από γωνιώδη εκτοξευτή: ΠΑΧΙΑ δέσμη με λευκή καρδιά, μεγάλο
// muzzle burst, δαχτυλίδια-σοκ, dissipation burst πριν το δεξί όριο.
// ════════════════════════════════════════════════════════════════════════════════
function genOverrideBeam() {
  const S = 1254, CY = S / 2;
  const { canvas, ctx, rnd } = begin('active_override_beam', S, S);
  const UV = '#8a2bff', LIL = '#c99aff', CORE = '#f4eaff', ALLOY = '#38324e', DARKA = '#100d1c';
  const MX = 380, EX = S - 120;                            // μύτη εκτοξευτή, τέλος δέσμης
  // δέσμη — 3 στρώσεις, παχιά
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const beam = (h, col, a) => {
    const g = ctx.createLinearGradient(MX, 0, EX, 0);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(0.8, rgba(col, a * 0.85)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(MX, CY - h); ctx.lineTo(EX - 30, CY - h * 0.55);
    ctx.lineTo(EX, CY); ctx.lineTo(EX - 30, CY + h * 0.55);
    ctx.lineTo(MX, CY + h);
    ctx.closePath(); ctx.fill();
  };
  beam(120, UV, 0.6); beam(66, LIL, 0.85); beam(26, '#ffffff', 1);
  ctx.restore();
  // dissipation burst στο τέλος
  sparkle(ctx, EX - 40, CY, 110, CORE, { alpha: 0.9 });
  orb(ctx, EX - 40, CY, 70, rgba(CORE, 0.9), rgba(UV, 0.5));
  // δαχτυλίδια-σοκ
  for (const [x, r, al] of [[600, 135, 0.9], [830, 100, 0.7], [1030, 72, 0.55]]) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al;
    ctx.strokeStyle = LIL; ctx.lineWidth = 12; ctx.shadowColor = UV; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.ellipse(x, CY, r * 0.3, r, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // ηλεκτρικές εκκενώσεις γύρω από τη δέσμη
  for (let i = 0; i < 9; i++) {
    const x0 = MX + 60 + rnd() * 640;
    const s = rnd() < 0.5 ? -1 : 1;
    lightning(ctx, x0, CY + s * 26, x0 + 90 + rnd() * 130, CY + s * (100 + rnd() * 120),
              { seg: 6, jag: 20, width: 4, color: LIL, core: CORE, rnd });
  }
  // ΜΕΓΑΛΟ muzzle burst
  sparkle(ctx, MX + 10, CY, 210, CORE, { alpha: 0.98, thin: 0.12 });
  orb(ctx, MX + 8, CY, 130, rgba('#ffffff', 0.98), rgba(UV, 0.7));
  energyRing(ctx, MX + 8, CY, 172, LIL, { width: 12, alpha: 0.95, blur: 30 });
  energyRing(ctx, MX + 8, CY, 230, UV, { width: 6, alpha: 0.6, blur: 18, dash: [20, 26] });
  // εκτοξευτής: στιβαρό γωνιώδες σώμα με ράγες + vents
  ctx.save();
  ctx.fillStyle = metalGrad(ctx, 0, CY - 200, 0, CY + 200, ALLOY, '#6a5f92', DARKA);
  ctx.beginPath();
  ctx.moveTo(60, CY - 168);
  ctx.lineTo(240, CY - 196); ctx.lineTo(MX - 30, CY - 96);
  ctx.lineTo(MX + 6, CY - 48); ctx.lineTo(MX + 6, CY + 48);
  ctx.lineTo(MX - 30, CY + 96); ctx.lineTo(240, CY + 196);
  ctx.lineTo(60, CY + 168); ctx.lineTo(104, CY);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // ράγες επιτάχυνσης πάνω στο ρύγχος (δύο φωτεινές μπάρες)
  for (const s of [-1, 1]) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = LIL; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.shadowColor = UV; ctx.shadowBlur = 18; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(210, CY + s * 96); ctx.lineTo(MX - 24, CY + s * 52); ctx.stroke();
    ctx.restore();
  }
  // βαριά «σαγόνια» πάνω/κάτω + φώτα + vents
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.fillStyle = metalGrad(ctx, 0, CY + s * 70, 0, CY + s * 230, '#4d4570', '#8478ab', DARKA);
    ctx.beginPath();
    ctx.moveTo(140, CY + s * 128);
    ctx.lineTo(336, CY + s * 158); ctx.lineTo(306, CY + s * 248); ctx.lineTo(110, CY + s * 214);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(336, CY + s * 158); c.lineTo(306, CY + s * 248); c.stroke(); }, UV, { width: 6, alpha: 0.95, blur: 16 });
    orb(ctx, 238, CY + s * 190, 20, rgba(CORE, 0.95), rgba(UV, 0.6));
    // vents
    ctx.save(); ctx.globalAlpha = 0.6; ctx.strokeStyle = DARKA; ctx.lineWidth = 7;
    for (const vx of [170, 210, 250]) {
      ctx.beginPath(); ctx.moveTo(vx, CY + s * 150); ctx.lineTo(vx + 16, CY + s * 216); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }
  // panel ρίγες + καλώδια
  ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = DARKA; ctx.lineWidth = 6;
  for (const xx of [150, 215, 285]) {
    ctx.beginPath(); ctx.moveTo(xx, CY - 150); ctx.lineTo(xx, CY + 150); ctx.stroke();
  }
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = UV; ctx.lineWidth = 8; ctx.globalAlpha = 0.85;
  ctx.shadowColor = UV; ctx.shadowBlur = 18; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(114, CY - 64); ctx.quadraticCurveTo(240, CY - 22, MX - 44, CY - 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(114, CY + 64); ctx.quadraticCurveTo(240, CY + 22, MX - 44, CY + 18); ctx.stroke();
  ctx.restore();
  orb(ctx, 150, CY, 26, rgba(CORE, 0.95), rgba(UV, 0.6));   // πίσω αντιδραστήρας
  embers(ctx, 780, CY, 280, 46, LIL, rnd, { size: [1.5, 4.5], alpha: [0.2, 0.75] });
  cleanAlpha(canvas);
  save('assets/weapons/vfx/active_override beam.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 17 · EDEN BLOOM PULSE — assets/effects/ambient/biome_eden_bloom_pulse.png (1086×1448)
// Φωτεινό άνθος-παλμός: comet-trail από ψηλά, διπλό δαχτυλίδι πετάλων,
// ΚΕΝΤΡΑΡΙΣΜΕΝΟΙ παλμοί-δαχτυλίδια γύρω από το άνθος + πεσμένα πέταλα.
// ════════════════════════════════════════════════════════════════════════════════
function genEdenBloom() {
  const W = 1086, H = 1448, CX = W / 2, BY = 900;           // κέντρο άνθους
  const { canvas, ctx, rnd } = begin('biome_eden_bloom_pulse', W, H);
  const ROSE = '#ff8ad2', LEAF = '#5cf09a', CORE = '#fff4fb';
  // φωτεινό comet-trail από ψηλά (κίνηση κάτω → ουρά πάνω)
  cometTail(ctx, CX, BY - 210, 84, 760, Math.PI / 2, CORE, ROSE, { alpha: 0.9 });
  cometTail(ctx, CX, BY - 210, 46, 540, Math.PI / 2, '#ffffff', LEAF, { alpha: 0.7 });
  // μικρά πέταλα που στροβιλίζονται κατά μήκος του trail
  for (let i = 0; i < 10; i++) {
    const t = rnd();
    const y = 170 + t * (BY - 420);
    const x = CX + Math.sin(t * 9 + i) * (50 + 60 * (1 - t));
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 + rnd() * 0.4;
    ctx.fillStyle = rgba(i % 3 ? ROSE : LEAF, 0.85);
    ctx.shadowColor = ROSE; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(0, 0, 12 + rnd() * 14, 6 + rnd() * 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // παλμοί-δαχτυλίδια ΓΥΡΩ από το άνθος (ομόκεντρα)
  energyRing(ctx, CX, BY, 330, ROSE, { width: 9, alpha: 0.6, blur: 26 });
  energyRing(ctx, CX, BY, 250, LEAF, { width: 7, alpha: 0.7, blur: 20, dash: [34, 24] });
  // άνθος: 2 δαχτυλίδια πετάλων + πυρήνας
  const petals = (n, r0, r1, col, alpha, rot) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rot;
      ctx.save();
      ctx.translate(CX, BY); ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
      const g = ctx.createLinearGradient(0, -r1, 0, 0);
      g.addColorStop(0, rgba(CORE, 0.55)); g.addColorStop(0.25, rgba(col, 0.85)); g.addColorStop(1, rgba(col, 0.10));
      ctx.fillStyle = g; ctx.shadowColor = col; ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, -r0);
      ctx.quadraticCurveTo(r1 * 0.44, -r0 - (r1 - r0) * 0.55, 0, -r1);
      ctx.quadraticCurveTo(-r1 * 0.44, -r0 - (r1 - r0) * 0.55, 0, -r0);
      ctx.closePath(); ctx.fill();
      // ροζ ακμή πετάλου (κρατά το χρώμα ορατό)
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 4; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, -r0);
      ctx.quadraticCurveTo(r1 * 0.44, -r0 - (r1 - r0) * 0.55, 0, -r1);
      ctx.stroke();
      ctx.restore();
    }
  };
  petals(9, 64, 320, ROSE, 0.85, 0.2);
  petals(7, 44, 200, LEAF, 0.7, 0.55);
  orb(ctx, CX, BY, 70, rgba('#ffffff', 0.95), rgba(ROSE, 0.8));
  sparkle(ctx, CX, BY, 110, CORE, { alpha: 0.7 });
  // impact κάτω: ελλειπτικός παλμός εδάφους + πεσμένα πέταλα
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = ROSE; ctx.lineWidth = 8; ctx.globalAlpha = 0.65;
  ctx.shadowColor = ROSE; ctx.shadowBlur = 22;
  ctx.beginPath(); ctx.ellipse(CX, H - 220, 340, 105, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = LEAF; ctx.setLineDash([26, 20]); ctx.lineWidth = 5; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.ellipse(CX, H - 220, 235, 72, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, d = 80 + rnd() * 300;
    const x = CX + Math.cos(a) * d, y = H - 225 + Math.sin(a) * d * 0.28;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 + rnd() * 0.45;
    ctx.fillStyle = rgba(i % 3 ? ROSE : LEAF, 0.85);
    ctx.shadowColor = ROSE; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.ellipse(0, 0, 11 + rnd() * 15, 6 + rnd() * 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  embers(ctx, CX, BY, 340, 46, ROSE, rnd);
  cleanAlpha(canvas);
  save('assets/effects/ambient/biome_eden_bloom_pulse.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 18 · NULL VOID ORB — assets/effects/ambient/biome_null_void_orb.png (1086×1448)
// Μαύρη σφαίρα-κενό: λείες ελλειπτικές accretion-τροχιές, φωτεινές εισρέουσες
// ίνες, λεπτός καυτός ορίζοντας, σκοτεινό trail πάνω, ρωγμή-δαχτυλίδι κάτω.
// ════════════════════════════════════════════════════════════════════════════════
function genNullVoidOrb() {
  const W = 1086, H = 1448, CX = W / 2, OY = 600;
  const { canvas, ctx, rnd } = begin('biome_null_void_orb', W, H);
  const VOID = '#7a3cff', DIM = '#2e1560', CORE = '#efe6ff';
  // trail πτώσης πάνω — σκοτεινό με βιολετί άκρη
  cometTail(ctx, CX, OY - 120, 110, 460, Math.PI / 2, VOID, DIM, { alpha: 0.5 });
  // δίσκος παραμόρφωσης
  orb(ctx, CX, OY, 380, rgba(VOID, 0.30), rgba(DIM, 0.12));
  // accretion: 4 λείες ελλειπτικές τροχιές σε διαφορετικές κλίσεις
  for (const [rx, ry, rot, al, w] of [[340, 110, -0.35, 0.75, 9], [300, 96, 0.4, 0.6, 7],
                                       [385, 130, 0.05, 0.5, 6], [260, 82, -0.05, 0.7, 8]]) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(CX, OY); ctx.rotate(rot);
    const gr = ctx.createLinearGradient(-rx, 0, rx, 0);
    gr.addColorStop(0, rgba(VOID, 0)); gr.addColorStop(0.3, rgba(VOID, al)); gr.addColorStop(0.65, rgba(CORE, al * 0.8)); gr.addColorStop(1, rgba(VOID, 0));
    ctx.strokeStyle = gr; ctx.lineWidth = w;
    ctx.shadowColor = VOID; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // εισρέουσες ίνες — φωτεινές, καταλήγουν στον ορίζοντα
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = 300 + rnd() * 190;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(i % 3 ? VOID : CORE, 0.35 + rnd() * 0.4);
    ctx.lineWidth = 3 + rnd() * 3.5; ctx.lineCap = 'round';
    ctx.shadowColor = VOID; ctx.shadowBlur = 14;
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.05) {
      const rr = 208 + (r0 - 208) * (1 - t);
      const ang = a + t * 1.9;
      const x = CX + Math.cos(ang) * rr, y = OY + Math.sin(ang) * rr * 0.9;
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.restore();
  }
  // σφαίρα: μαύρος πυρήνας + διπλός ορίζοντας
  ctx.save();
  const bg = ctx.createRadialGradient(CX, OY, 40, CX, OY, 205);
  bg.addColorStop(0, 'rgba(0,0,4,1)'); bg.addColorStop(0.82, 'rgba(6,2,16,0.99)'); bg.addColorStop(1, 'rgba(10,4,26,0.92)');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(CX, OY, 205, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  energyRing(ctx, CX, OY, 210, VOID, { width: 14, alpha: 0.95, blur: 38 });
  energyRing(ctx, CX, OY, 210, CORE, { width: 4.5, alpha: 0.95, blur: 10 });
  // lensing τόξα + αστεράκια-μάρτυρες
  techArc(ctx, CX, OY, 268, -0.65, 0.65, CORE, { width: 5, alpha: 0.75, dash: [74, 42] });
  techArc(ctx, CX, OY, 268, Math.PI - 0.65, Math.PI + 0.65, CORE, { width: 5, alpha: 0.75, dash: [74, 42] });
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, d = 260 + rnd() * 180;
    sparkle(ctx, CX + Math.cos(a) * d, OY + Math.sin(a) * d * 0.9, 8 + rnd() * 16, CORE, { alpha: 0.5 + rnd() * 0.4 });
  }
  // impact κάτω: βιολετί glow + ρωγμή-δαχτυλίδι + shards
  orb(ctx, CX, H - 250, 170, rgba(VOID, 0.4), rgba(DIM, 0.15));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = VOID; ctx.lineWidth = 10; ctx.globalAlpha = 0.85;
  ctx.shadowColor = VOID; ctx.shadowBlur = 26;
  ctx.beginPath(); ctx.ellipse(CX, H - 240, 330, 102, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = CORE; ctx.setLineDash([26, 20]); ctx.lineWidth = 4.5; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.ellipse(CX, H - 240, 232, 70, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = 130 + rnd() * 210;
    crystalShard(ctx, CX + Math.cos(a) * d, H - 242 + Math.sin(a) * d * 0.3,
                 34 + rnd() * 48, 22, rnd() * Math.PI, DIM, VOID, '#05010c', rnd);
  }
  embers(ctx, CX, OY, 400, 50, VOID, rnd, { size: [1.5, 3.5], alpha: [0.2, 0.7] });
  cleanAlpha(canvas);
  save('assets/effects/ambient/biome_null_void_orb.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 19 · SOLAR FLARE — assets/effects/ambient/biome_solar_flare.png (1086×1448)
// Χρυσός πύρινος κομήτης που ΠΕΦΤΕΙ: κεφαλή χαμηλά με λευκό πυρήνα + coronal
// loops, ουρά που ρέει ΠΑΝΩ με πλάσμα-νήματα, impact flare-αστέρι στη βάση.
// ════════════════════════════════════════════════════════════════════════════════
function genSolarFlare() {
  const W = 1086, H = 1448, CX = W / 2, HY = 820;           // κεφαλή στο κάτω τρίτο
  const { canvas, ctx, rnd } = begin('biome_solar_flare', W, H);
  const GOLD = '#ffb400', HOT = '#ff6a2a', CORE = '#fff6d8';
  // ουρά προς τα ΠΑΝΩ (κίνηση κάτω) — 3 στρώσεις
  cometTail(ctx, CX, HY, 168, 740, Math.PI / 2, GOLD, HOT, { alpha: 0.9 });
  cometTail(ctx, CX, HY, 104, 560, Math.PI / 2, CORE, GOLD, { alpha: 0.9 });
  cometTail(ctx, CX, HY, 52, 380, Math.PI / 2, '#ffffff', CORE, { alpha: 0.95 });
  // πλάσμα-νήματα που ελίσσονται στην ουρά
  for (let i = 0; i < 7; i++) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(i % 2 ? GOLD : HOT, 0.4 + rnd() * 0.3);
    ctx.lineWidth = 4 + rnd() * 5; ctx.lineCap = 'round';
    ctx.shadowColor = GOLD; ctx.shadowBlur = 16;
    const ph = rnd() * Math.PI * 2, amp = 30 + rnd() * 70;
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.03) {
      const y = HY - 60 - t * (600 + rnd() * 2);
      const x = CX + Math.sin(t * 6 + ph) * amp * (1 - t * 0.55);
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.restore();
  }
  // coronal loops γύρω από την κεφαλή (τόξα που βγαίνουν και ξαναμπαίνουν)
  for (let i = 0; i < 6; i++) {
    const a0 = rnd() * Math.PI * 2;
    const r = 220 + rnd() * 130;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(i % 2 ? GOLD : HOT, 0.55 + rnd() * 0.3);
    ctx.lineWidth = 8 + rnd() * 8; ctx.lineCap = 'round';
    ctx.shadowColor = GOLD; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(CX, HY, r, a0, a0 + 0.7 + rnd() * 0.5); ctx.stroke();
    ctx.restore();
  }
  // εκτοξευμένες πύρινες γλώσσες
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2;
    cometTail(ctx, CX + Math.cos(a) * 150, HY + Math.sin(a) * 150, 24 + rnd() * 28,
              150 + rnd() * 200, a + Math.PI, CORE, i % 2 ? GOLD : HOT, { alpha: 0.7 });
  }
  // κεφαλή: λευκός ήλιος + κοκκώδες χείλος + δαχτυλίδι
  orb(ctx, CX, HY, 200, rgba('#ffffff', 1), rgba(GOLD, 0.85));
  energyRing(ctx, CX, HY, 222, GOLD, { width: 11, alpha: 0.95, blur: 32 });
  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2;
    sparkle(ctx, CX + Math.cos(a) * (208 + rnd() * 70), HY + Math.sin(a) * (208 + rnd() * 70),
            8 + rnd() * 22, i % 3 ? GOLD : CORE, { alpha: 0.5 + rnd() * 0.45 });
  }
  // impact flare στη βάση: επίπεδο αστέρι + ελλειπτικά δαχτυλίδια (καθαρά χωριστό από την κεφαλή)
  sparkle(ctx, CX, H - 170, 190, CORE, { alpha: 0.95, thin: 0.10 });
  orb(ctx, CX, H - 170, 90, rgba(CORE, 0.95), rgba(HOT, 0.6));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = GOLD; ctx.lineWidth = 9; ctx.globalAlpha = 0.75;
  ctx.shadowColor = GOLD; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.ellipse(CX, H - 160, 350, 96, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = HOT; ctx.setLineDash([30, 22]); ctx.lineWidth = 5; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.ellipse(CX, H - 160, 246, 66, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  embers(ctx, CX, HY - 160, 360, 80, GOLD, rnd, { size: [1.5, 4.5], alpha: [0.25, 0.85] });
  cleanAlpha(canvas);
  save('assets/effects/ambient/biome_solar_flare.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
// 20 · STORM SPARK — assets/effects/ambient/biome_storm_spark.png (1086×1448)
// Κυανός zigzag κεραυνός: απαλά νέφη με cyan under-glow ψηλά, παχύς κύριος
// κεραυνός με κλαδιά, starburst + διπλό δαχτυλίδι + σπινθήρες εδάφους.
// ════════════════════════════════════════════════════════════════════════════════
function genStormSpark() {
  const W = 1086, H = 1448, CX = W / 2, IY = H - 280;
  const { canvas, ctx, rnd } = begin('biome_storm_spark', W, H);
  const CYAN = '#33e6ff', DEEPB = '#1560b0', CORE = '#eefcff';
  // αφετηρία: μικρός λαμπερός κόμβος-πηγή αντί για νέφη (καθαρή σύνθεση)
  orb(ctx, CX - 30, 150, 90, rgba(CORE, 0.85), rgba(CYAN, 0.4));
  sparkle(ctx, CX - 30, 150, 120, CORE, { alpha: 0.9 });
  energyRing(ctx, CX - 30, 150, 130, CYAN, { width: 6, alpha: 0.55, blur: 18, dash: [26, 20] });
  // κύριος κεραυνός — παχιά zigzag βήματα
  const steps = [[CX - 30, 150], [CX + 150, 370], [CX - 120, 595], [CX + 95, 830], [CX - 60, 1050], [CX, IY]];
  for (let i = 0; i < steps.length - 1; i++) {
    lightning(ctx, steps[i][0], steps[i][1], steps[i + 1][0], steps[i + 1][1],
              { seg: 8, jag: 28, width: 12, color: CYAN, core: CORE, rnd });
    if (i < steps.length - 2) {
      const [bx, by] = steps[i + 1];
      const ba = Math.PI / 2 + (rnd() - 0.5) * 2.2;
      lightning(ctx, bx, by, bx + Math.cos(ba) * (130 + rnd() * 170), by + Math.sin(ba) * (110 + rnd() * 130),
                { seg: 6, jag: 20, width: 5, color: CYAN, core: CORE, rnd });
    }
    orb(ctx, steps[i + 1][0], steps[i + 1][1], 26, rgba(CORE, 0.7), rgba(CYAN, 0.4));
  }
  // impact: starburst + διπλό δαχτυλίδι + σπινθήρες εδάφους
  sparkle(ctx, CX, IY, 260, CORE, { alpha: 0.98, thin: 0.12 });
  orb(ctx, CX, IY, 128, rgba('#ffffff', 1), rgba(CYAN, 0.75));
  energyRing(ctx, CX, IY, 205, CYAN, { width: 13, alpha: 0.95, blur: 30 });
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = CYAN; ctx.lineWidth = 7; ctx.globalAlpha = 0.65;
  ctx.shadowColor = CYAN; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.ellipse(CX, IY + 44, 335, 100, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([26, 20]); ctx.lineWidth = 4.5; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.ellipse(CX, IY + 44, 235, 70, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + rnd() * Math.PI;
    const d = 140 + rnd() * 250;
    lightning(ctx, CX, IY, CX + Math.cos(a) * d, IY + 30 + Math.abs(Math.sin(a)) * 66,
              { seg: 5, jag: 15, width: 3.5, color: CYAN, core: CORE, rnd });
  }
  embers(ctx, CX, IY, 330, 50, CYAN, rnd, { size: [1.5, 4], alpha: [0.25, 0.8] });
  cleanAlpha(canvas);
  save('assets/effects/ambient/biome_storm_spark.png', canvas);
}

// ════════════════════════════════════════════════════════════════════════════════
const JOBS = {
  arc_thunder: genArcThunder, crescent_aura: genCrescentAura, nexus_burst: genNexusBurst,
  crystal_stream: genCrystalStream, lava_bombs: genLavaBombs, target_marker: genTargetMarker,
  vessel_rocket: genVesselRocket, eddie_flame: genEddieFlame, orbital_beacon: genOrbitalBeacon,
  nano_swarm: genNanoSwarm, plasma_execution: genPlasmaExecution, storm_conductor: genStormConductor,
  override_beam: genOverrideBeam, eden_bloom: genEdenBloom, null_void_orb: genNullVoidOrb,
  solar_flare: genSolarFlare, storm_spark: genStormSpark,
};
const only = process.argv[2];
console.log('PHENIX legacy replacements → ' + OUT);
for (const [id, fn] of Object.entries(JOBS)) {
  if (only && id !== only) continue;
  console.log('•', id); fn();
}
console.log('done.');
