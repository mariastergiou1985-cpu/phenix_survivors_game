// ════════════════════════════════════════════════════════════════════════════════
// FUSION ARMORY — Batch B art generator (chars 1-5 → 10 assets).
// node tools/art/generate_fusion_art_b.mjs   (απαιτεί npm i canvas — δεν τρέχει in-game)
// Κάθε εικόνα: 1024×1024 transparent RGBA, μεγάλο κεντρικό όπλο, καθαρή silhouette,
// στοιχεία και των 3 component weapons, palette από FUSION_DEFS, deterministic seed.
// ════════════════════════════════════════════════════════════════════════════════
import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, seedFromString, rgba, mix, glow, lightning, metalGrad, embers,
         energyRing, orb, sparkle, gravitySwirl, rim, cleanAlpha } from './fusion_art_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const { FUSION_DEFS } = await import(path.join(ROOT, 'js/game/FusionCatalog.js'));

const S = 1024, CX = S / 2, CY = S / 2;

function begin(id) {
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(seedFromString(id));
  const pal = FUSION_DEFS[id].palette;
  return { canvas, ctx, rnd, pal };
}
function save(id, canvas) {
  const d = FUSION_DEFS[id];
  const out = path.join(ROOT, d.art);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  cleanAlpha(canvas, 6);
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log('✓', id, '→', d.art);
}

// Κοινό: κάθετο κεντρικό «σκηνικό» φωτός πίσω από το όπλο για depth (soft, όχι orb-μόνο).
function backGlow(ctx, pal, { r = 430, a = 0.16 } = {}) {
  orb(ctx, CX, CY, r, rgba(pal.glow, a), rgba(pal.accent, a * 0.5));
}

// ── 01 OSSUARY IMPALER — κολοσσιαία λόγχη σπονδύλων + null αιχμή + gravity δακτύλιος
function drawOssuaryImpaler(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  const boneLite = '#fdf9ec', boneBase = '#e3dbc2', boneDark = '#7d7157';
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(-Math.PI / 4.2);                    // διαγώνια λόγχη ↗
  // πίσω αύρα μόνο γύρω από το όπλο (στενή, βιολετί — όχι δίσκος)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const aura = ctx.createLinearGradient(0, 430, 0, -470);
  aura.addColorStop(0, rgba(pal.glow, 0.05)); aura.addColorStop(0.5, rgba(pal.glow, 0.16)); aura.addColorStop(1, rgba(pal.glow, 0.05));
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.ellipse(0, -20, 150, 470, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // ── GRAVITY ASSEMBLY στη βάση: gyroscope δακτύλιοι + σκοτεινός πυρήνας ──
  const gy = 322;
  // πίσω μισά δακτυλίων (πριν τον πυρήνα)
  for (const [rx, tilt, w, a] of [[130, 0.5, 10, 0.85], [100, -0.35, 7, 0.6]]) {
    ctx.save(); ctx.translate(0, gy); ctx.rotate(tilt); ctx.scale(1, 0.36);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.strokeStyle = pal.glow; ctx.lineWidth = w; ctx.shadowColor = pal.glow; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(0, 0, rx, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // σκοτεινός βαρυτικός πυρήνας με στρόβιλο
  ctx.save(); ctx.translate(0, gy);
  const vg = ctx.createRadialGradient(0, 0, 0, 0, 0, 72);
  vg.addColorStop(0, '#050110'); vg.addColorStop(0.62, '#1a0f33'); vg.addColorStop(1, 'rgba(26,15,51,0)');
  ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(0, 0, 72, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#b9a4ff', 0.9); ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 12;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.04) {
      const ang = (k / 3) * Math.PI * 2 + t * 4.2;
      const rr = 58 * (1 - t * 0.9);
      const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  orb(ctx, 0, gy, 30, '#efe6ff', rgba(pal.glow, 0.5), { alpha: 0.9 });
  // ── ΣΤΕΛΕΧΟΣ: ογκώδης σπονδυλική στήλη ──
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const y = 250 - t * 480;
    const w = 62 - t * 18, h = 74 - t * 20;
    // απόφυση αριστερά/δεξιά (πίσω από το σώμα)
    for (const s of [-1, 1]) {
      ctx.fillStyle = metalGrad(ctx, s * w * 0.6, y, s * w * 1.5, y, boneBase, boneLite, boneDark);
      ctx.beginPath();
      ctx.moveTo(s * w * 0.55, y - h * 0.16);
      ctx.quadraticCurveTo(s * w * 1.45, y - h * 0.34, s * w * 1.6, y - h * 0.02);
      ctx.quadraticCurveTo(s * w * 1.42, y + h * 0.2, s * w * 0.55, y + h * 0.16);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = boneLite;                       // κόνδυλος στην άκρη
      ctx.beginPath(); ctx.arc(s * w * 1.52, y - h * 0.05, 9 - t * 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // σώμα σπονδύλου: hourglass δίσκος
    ctx.fillStyle = metalGrad(ctx, -w, y, w, y, boneBase, boneLite, boneDark);
    ctx.beginPath();
    ctx.moveTo(-w * 0.94, y - h * 0.42);
    ctx.quadraticCurveTo(0, y - h * 0.6, w * 0.94, y - h * 0.42);
    ctx.quadraticCurveTo(w * 0.6, y, w * 0.94, y + h * 0.42);
    ctx.quadraticCurveTo(0, y + h * 0.6, -w * 0.94, y + h * 0.42);
    ctx.quadraticCurveTo(-w * 0.6, y, -w * 0.94, y - h * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#57492f', 0.5); ctx.lineWidth = 2; ctx.stroke();
    // οριζόντια σκιά-χώρισμα κάτω από κάθε δίσκο
    ctx.fillStyle = rgba('#3a2f1c', 0.35);
    ctx.beginPath(); ctx.ellipse(0, y + h * 0.44, w * 0.6, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  // null ενεργειακή ραφή που τρέχει μέσα από τη στήλη
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const seam = ctx.createLinearGradient(0, 280, 0, -320);
  seam.addColorStop(0, rgba(pal.glow, 0.15));
  seam.addColorStop(0.6, rgba(pal.glow, 0.9));
  seam.addColorStop(1, '#efe8ff');
  ctx.strokeStyle = seam; ctx.lineWidth = 13; ctx.lineCap = 'round';
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.moveTo(0, 272); ctx.lineTo(0, -252); ctx.stroke();
  ctx.restore();
  // ── ΚΕΦΑΛΗ: τριπλή οστέινη λεπίδα γύρω από null αιχμή ──
  const hb = -230;                                    // βάση κεφαλής
  // κολάρο
  ctx.fillStyle = metalGrad(ctx, -70, hb, 70, hb, boneBase, boneLite, boneDark);
  ctx.beginPath();
  ctx.moveTo(-66, hb + 22); ctx.lineTo(-40, hb - 30); ctx.lineTo(40, hb - 30); ctx.lineTo(66, hb + 22);
  ctx.quadraticCurveTo(0, hb + 52, -66, hb + 22);
  ctx.closePath(); ctx.fill();
  // πλευρικές λεπίδες: ανοιχτές προς τα έξω, με αιχμηρές μύτες (trident-crown)
  for (const s of [-1, 1]) {
    ctx.fillStyle = metalGrad(ctx, s * 20, hb - 120, s * 110, hb - 40, boneBase, boneLite, boneDark);
    ctx.beginPath();
    ctx.moveTo(s * 26, hb - 16);
    ctx.quadraticCurveTo(s * 120, hb - 50, s * 122, hb - 246);
    ctx.quadraticCurveTo(s * 74, hb - 160, s * 42, hb - 90);
    ctx.quadraticCurveTo(s * 24, hb - 50, s * 12, hb - 30);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(s * 26, hb - 16); c.quadraticCurveTo(s * 120, hb - 50, s * 122, hb - 246); c.stroke(); }, '#fffdf2', { width: 2, alpha: 0.75 });
  }
  // κεντρική μεγάλη λεπίδα: μακριά, αιχμηρή
  ctx.fillStyle = metalGrad(ctx, -34, hb - 180, 34, hb - 180, boneBase, boneLite, boneDark);
  ctx.beginPath();
  ctx.moveTo(0, hb - 408);
  ctx.quadraticCurveTo(34, hb - 260, 26, hb - 60);
  ctx.quadraticCurveTo(0, hb - 26, -26, hb - 60);
  ctx.quadraticCurveTo(-34, hb - 260, 0, hb - 408);
  ctx.closePath(); ctx.fill();
  rim(ctx, c => { c.beginPath(); c.moveTo(0, hb - 408); c.quadraticCurveTo(34, hb - 260, 26, hb - 60); c.stroke(); }, '#fffdf2', { width: 2.5, alpha: 0.85 });
  // null πυρήνας-σχισμή στην κεντρική λεπίδα
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const slit = ctx.createLinearGradient(0, hb - 390, 0, hb - 70);
  slit.addColorStop(0, '#ffffff'); slit.addColorStop(0.55, '#cdb8ff'); slit.addColorStop(1, rgba(pal.glow, 0.15));
  ctx.fillStyle = slit; ctx.shadowColor = pal.glow; ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.moveTo(0, hb - 392); ctx.quadraticCurveTo(10, hb - 240, 7, hb - 90);
  ctx.lineTo(0, hb - 66); ctx.lineTo(-7, hb - 90); ctx.quadraticCurveTo(-10, hb - 240, 0, hb - 392);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // λάμψεις αιχμών + περιφερικά θραύσματα οστών σε τροχιά γύρω από τον πυρήνα
  sparkle(ctx, 0, hb - 400, 56, '#efe6ff', { alpha: 0.95 });
  sparkle(ctx, 122, hb - 240, 28, '#efe6ff', { alpha: 0.7 });
  sparkle(ctx, -122, hb - 240, 28, '#efe6ff', { alpha: 0.7 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * (98 + rnd() * 26), y = gy + Math.sin(a) * (36 + rnd() * 10);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI);
    ctx.fillStyle = mix(boneBase, boneLite, rnd());
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-2, -6); ctx.lineTo(12, 0); ctx.lineTo(-2, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // μπροστινά μισά των gravity δακτυλίων (ΠΑΝΩ από στήλη — βάθος)
  for (const [rx, tilt, w, a] of [[130, 0.5, 10, 0.95], [100, -0.35, 7, 0.7]]) {
    ctx.save(); ctx.translate(0, gy); ctx.rotate(tilt); ctx.scale(1, 0.36);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.strokeStyle = mix(pal.glow, '#ffffff', 0.25); ctx.lineWidth = w;
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }
  embers(ctx, 0, hb - 180, 120, 14, pal.glow, rnd);
  embers(ctx, 0, gy, 130, 12, '#b9a4ff', rnd);
  ctx.restore();
  save(id, canvas);
}

// ── 02 BLACK PSALM CHOIR — απειλητικό electro-reliquary κρανίο + ion halo + drone χορωδία
function drawBlackPsalmChoir(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  const skull = (cx, cy, r, rot, main) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    const ivory = metalGrad(ctx, -r, 0, r, 0, '#cfd9d2', '#f4f8ee', '#77857f');
    // ΚΡΑΝΙΟ: μακρόστενο, γωνιώδες, με βαθιές κόγχες — όχι chibi
    ctx.fillStyle = ivory;
    ctx.beginPath();
    ctx.moveTo(-r * 0.88, -r * 0.05);
    ctx.quadraticCurveTo(-r * 0.96, -r * 0.9, -r * 0.4, -r * 1.06);   // πλάγιο μέτωπο
    ctx.quadraticCurveTo(0, -r * 1.16, r * 0.4, -r * 1.06);
    ctx.quadraticCurveTo(r * 0.96, -r * 0.9, r * 0.88, -r * 0.05);
    ctx.quadraticCurveTo(r * 0.84, r * 0.22, r * 0.56, r * 0.32);     // ζυγωματικά
    ctx.lineTo(r * 0.48, r * 0.18);
    ctx.lineTo(r * 0.34, r * 0.42);                                    // βαθούλωμα
    ctx.lineTo(r * 0.3, r * 0.86);                                     // άνω γνάθος
    ctx.quadraticCurveTo(0, r * 1.0, -r * 0.3, r * 0.86);
    ctx.lineTo(-r * 0.34, r * 0.42);
    ctx.lineTo(-r * 0.48, r * 0.18);
    ctx.lineTo(-r * 0.56, r * 0.32);
    ctx.quadraticCurveTo(-r * 0.84, r * 0.22, -r * 0.88, -r * 0.05);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,45,42,0.5)'; ctx.lineWidth = r * 0.02; ctx.stroke();
    // ρωγμές
    ctx.strokeStyle = 'rgba(28,40,38,0.75)'; ctx.lineWidth = r * 0.025; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.32, -r * 1.02); ctx.lineTo(-r * 0.2, -r * 0.7); ctx.lineTo(-r * 0.34, -r * 0.52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.62, -r * 0.6); ctx.lineTo(r * 0.5, -r * 0.42); ctx.stroke();
    // ΜΑΤΙΑ: λοξές αγριεμένες σχισμές με ion πυρά
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * r * 0.4, -r * 0.28); ctx.rotate(s * 0.34);
      ctx.fillStyle = '#040d12';
      ctx.beginPath();
      ctx.moveTo(-r * 0.34, 0);
      ctx.quadraticCurveTo(-r * 0.05, -r * 0.3, r * 0.3, -r * 0.06);   // αιχμηρό άνω βλέφαρο
      ctx.quadraticCurveTo(r * 0.05, r * 0.24, -r * 0.34, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // πύρινο ion σημείο
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(s * r * 0.36, -r * 0.3, 0, s * r * 0.36, -r * 0.3, r * 0.2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, pal.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s * r * 0.36, -r * 0.3, r * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // ρινική κοιλότητα: αιχμηρή σχισμή
    ctx.fillStyle = '#040d12';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.06); ctx.lineTo(r * 0.1, r * 0.3); ctx.lineTo(0, r * 0.38); ctx.lineTo(-r * 0.1, r * 0.3);
    ctx.closePath(); ctx.fill();
    // δόντια: άτακτα, αιχμηρά
    for (let i = -3; i <= 3; i++) {
      const tw = r * 0.11, tx = i * r * 0.13;
      const th = r * (0.26 + (i % 2 ? 0.09 : 0)) * (0.9 + rnd() * 0.2);
      ctx.fillStyle = i % 2 ? '#b9c6c0' : '#e8f0e8';
      ctx.beginPath();
      ctx.moveTo(tx - tw / 2, r * 0.56);
      ctx.lineTo(tx, r * 0.56 + th);
      ctx.lineTo(tx + tw / 2, r * 0.56);
      ctx.closePath(); ctx.fill();
    }
    // σκιά κάτω από τα ζυγωματικά
    ctx.fillStyle = 'rgba(20,30,28,0.35)';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * r * 0.5, r * 0.1, r * 0.16, r * 0.09, s * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    // RELIQUARY VISOR: μεταλλική θήκη που ΑΓΚΑΛΙΑΖΕΙ το πάνω κρανίο (drone identity)
    ctx.fillStyle = metalGrad(ctx, -r, -r, r, -r * 0.6, '#17262e', '#31505f', '#080f14');
    ctx.beginPath();
    ctx.moveTo(-r * 0.94, -r * 0.3);
    ctx.quadraticCurveTo(-r * 1.02, -r * 0.92, -r * 0.4, -r * 1.1);
    ctx.quadraticCurveTo(0, -r * 1.22, r * 0.4, -r * 1.1);
    ctx.quadraticCurveTo(r * 1.02, -r * 0.92, r * 0.94, -r * 0.3);
    ctx.lineTo(r * 0.78, -r * 0.38);
    ctx.quadraticCurveTo(r * 0.7, -r * 0.86, r * 0.3, -r * 0.94);   // εσωτερική κόψη
    ctx.quadraticCurveTo(0, -r * 1.02, -r * 0.3, -r * 0.94);
    ctx.quadraticCurveTo(-r * 0.7, -r * 0.86, -r * 0.78, -r * 0.38);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(-r * 1.0, -r * 0.9); c.quadraticCurveTo(0, -r * 1.2, r * 1.0, -r * 0.9); c.stroke(); }, pal.glow, { width: r * 0.02 + 1, alpha: 0.85 });
    // κεντρικό «ψαλμικό» ρουμπίνι στη θήκη
    orb(ctx, 0, -r * 1.08, r * 0.15, '#ffffff', rgba(pal.glow, 0.7));
    // fins πίσω-πλάγια
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#0c161c';
      ctx.beginPath();
      ctx.moveTo(s * r * 0.88, -r * 0.62);
      ctx.lineTo(s * r * 1.56, -r * 0.94);
      ctx.lineTo(s * r * 1.18, -r * 0.42);
      ctx.closePath(); ctx.fill();
      rim(ctx, c => { c.beginPath(); c.moveTo(s * r * 0.88, -r * 0.62); c.lineTo(s * r * 1.56, -r * 0.94); c.stroke(); }, pal.glow, { width: 2, alpha: 0.8 });
    }
    if (main) {
      // ενεργειακή ρωγμή μετώπου
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = pal.glow; ctx.lineWidth = r * 0.035; ctx.lineCap = 'round';
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.moveTo(-r * 0.08, -r * 0.98); ctx.lineTo(r * 0.02, -r * 0.62); ctx.lineTo(-r * 0.12, -r * 0.4);
      ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  };
  // ion halo: κεκλιμένος δακτύλιος σε προοπτική — πίσω μισό
  ctx.save(); ctx.translate(CX, CY + 60); ctx.scale(1, 0.4);
  energyRing(ctx, 0, 0, 360, pal.glow, { width: 13, alpha: 0.85, blur: 26, a0: Math.PI, a1: Math.PI * 2 });
  energyRing(ctx, 0, 0, 318, rgba(pal.core, 0.8), { width: 4, alpha: 0.7, blur: 10, dash: [26, 18], a0: Math.PI, a1: Math.PI * 2 });
  ctx.restore();
  // δορυφόροι-χορωδοί ΠΑΝΩ στο halo (ο ένας βουτά με απλό streak, όχι σωρός)
  skull(CX - 318, CY + 66, 56, -0.14, false);
  skull(CX + 320, CY + 44, 52, 0.2, false);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const dive = ctx.createLinearGradient(CX + 236, CY + 296, CX + 148, CY + 196);
  dive.addColorStop(0, rgba(pal.glow, 0)); dive.addColorStop(1, rgba(pal.glow, 0.7));
  ctx.strokeStyle = dive; ctx.lineWidth = 26; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(CX + 236, CY + 296); ctx.lineTo(CX + 152, CY + 200); ctx.stroke();
  ctx.restore();
  skull(CX + 130, CY + 178, 48, 0.62, false);
  // κεντρικό κρανίο
  skull(CX, CY - 70, 200, 0, true);
  // chain lightning χορωδίας
  lightning(ctx, CX - 318, CY + 40, CX - 90, CY - 80, { rnd, jag: 26, color: pal.glow });
  lightning(ctx, CX + 320, CY + 18, CX + 95, CY - 60, { rnd, jag: 26, color: pal.glow });
  lightning(ctx, CX + 130, CY + 160, CX + 40, CY + 40, { rnd, jag: 18, width: 3.5, color: pal.glow });
  // μπροστινό μισό halo (βάθος: περνά ΜΠΡΟΣΤΑ από τη γνάθο)
  ctx.save(); ctx.translate(CX, CY + 60); ctx.scale(1, 0.4);
  energyRing(ctx, 0, 0, 360, mix(pal.glow, '#ffffff', 0.2), { width: 13, alpha: 0.95, blur: 26, a0: 0, a1: Math.PI });
  energyRing(ctx, 0, 0, 318, rgba(pal.core, 0.9), { width: 4, alpha: 0.8, blur: 10, dash: [26, 18], a0: 0, a1: Math.PI });
  ctx.restore();
  embers(ctx, CX, CY, 340, 22, pal.glow, rnd);
  sparkle(ctx, CX + 178, CY - 268, 40, '#eaffff');
  save(id, canvas);
}

// ── 03 CYCLONE METRONOME — κυκλώνας-κώνος από κορδέλα + 2 crescent kicks + ion apex
function drawCycloneMetronome(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  backGlow(ctx, pal, { r: 410, a: 0.14 });
  // κώνος κυκλώνα: ενιαίο ΣΥΝΕΧΕΣ vortex — εσωτερικός κώνος-καταιγίδα + σπειροειδής κορδέλα
  const baseY = CY + 330, topY = CY - 300;
  // 1) εσωτερικός κώνος αέρα (ημιδιαφανής) — ενοποιεί τη silhouette
  ctx.save();
  const coneG = ctx.createLinearGradient(0, baseY, 0, topY);
  coneG.addColorStop(0, rgba(pal.glow, 0.10));
  coneG.addColorStop(0.55, rgba('#ffcf8a', 0.26));
  coneG.addColorStop(1, rgba('#fff3d9', 0.34));
  ctx.fillStyle = coneG;
  ctx.beginPath();
  ctx.moveTo(CX - 292, baseY);
  ctx.quadraticCurveTo(CX - 130, CY + 20, CX - 52, topY + 8);
  ctx.lineTo(CX + 66, topY + 8);
  ctx.quadraticCurveTo(CX + 160, CY + 30, CX + 300, baseY);
  ctx.quadraticCurveTo(CX, baseY + 66, CX - 292, baseY);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // 2) ΣΥΝΕΧΗΣ σπειροειδής κορδέλα: παραμετρική έλικα πάνω στον κώνο (storm sash identity)
  const helix = (phase, colFn, wMul, alpha, blur) => {
    ctx.save();
    ctx.lineCap = 'round';
    let prev = null;
    const T = 4.4 * Math.PI * 2;                     // 4.4 στροφές
    for (let u = 0; u <= 1; u += 0.004) {
      const ang = phase + u * T;
      const t = u;                                   // 0 βάση → 1 κορυφή
      const rx = 296 - 244 * t, ry = rx * 0.3;
      const y = baseY + (topY - baseY) * t;
      const x = CX + Math.cos(ang) * rx + 14 * Math.sin(t * 9);
      const yy = y + Math.sin(ang) * ry;
      const front = Math.sin(ang) > -0.25;           // ψευδο-βάθος
      if (prev) {
        const w = (26 - 17 * t) * wMul * (front ? 1 : 0.62);
        ctx.strokeStyle = colFn(t, front);
        ctx.globalAlpha = alpha * (front ? 1 : 0.5);
        ctx.lineWidth = Math.max(2, w);
        ctx.shadowColor = pal.glow; ctx.shadowBlur = front ? blur : 0;
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(x, yy); ctx.stroke();
      }
      prev = [x, yy];
    }
    ctx.restore();
  };
  helix(0, (t, f) => f ? mix('#c86a14', '#ffd9a1', t) : mix(pal.accent, '#000000', 0.2), 1, 0.95, 14);
  helix(Math.PI, (t, f) => f ? mix(pal.glow, '#fff3d9', t) : mix(pal.accent, '#000000', 0.35), 0.7, 0.85, 10);
  // δύο crescent kick blades μέσα στον κυκλώνα (vector heel identity)
  const crescent = (cx, cy, r, rot, flip) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, rgba(pal.glow, 0.1)); g.addColorStop(0.55, '#ffe9c4'); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.shadowColor = pal.glow; ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI * 0.62, Math.PI * 0.62);
    ctx.arc(r * 0.32, 0, r * 0.78, Math.PI * 0.62, -Math.PI * 0.62, true);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  crescent(CX + 60, CY + 60, 180, -0.5, false);
  crescent(CX - 90, CY - 130, 135, 2.4, true);
  // apex: ion εκκένωση (ion halo identity)
  orb(ctx, CX + 40, topY - 10, 90, '#ffffff', pal.glow);
  energyRing(ctx, CX + 40, topY - 10, 60, pal.glow, { width: 5, alpha: 0.9 });
  lightning(ctx, CX + 40, topY - 10, CX + 220, topY - 120, { rnd, jag: 22, color: '#ffd47a' });
  lightning(ctx, CX + 40, topY - 10, CX - 160, topY - 90, { rnd, jag: 20, width: 4, color: '#ffd47a' });
  // σκόνη/θραύσματα στη βάση
  embers(ctx, CX, baseY - 20, 260, 26, mix(pal.glow, '#ffffff', 0.2), rnd, { size: [1.5, 3.5] });
  sparkle(ctx, CX - 250, baseY - 40, 34, '#ffe9c4', { alpha: 0.7 });
  save(id, canvas);
}

// ── 04 EYE OF THE NULL STORM — εμβληματικό μάτι τυφώνα: eyewall κορδέλα + gravity κέντρο + null lances
function drawNullStormEye(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  backGlow(ctx, pal, { r: 430, a: 0.16 });
  // ακτινωτές null lances (null lance identity) — ΠΙΣΩ από το δαχτυλίδι
  const lances = 6;
  for (let i = 0; i < lances; i++) {
    const a = (i / lances) * Math.PI * 2 + 0.35;
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(a);
    const L0 = 205, L1 = 470;
    const g = ctx.createLinearGradient(0, -L0, 0, -L1);
    g.addColorStop(0, rgba(pal.core, 0.9)); g.addColorStop(1, rgba(pal.glow, 0));
    ctx.fillStyle = g;
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(0, -L1);
    ctx.lineTo(13, -L0 - 40); ctx.lineTo(5, -L0); ctx.lineTo(-5, -L0); ctx.lineTo(-13, -L0 - 40);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(0, -L1); c.lineTo(13, -L0 - 40); c.stroke(); }, '#ffffff', { width: 1.8, alpha: 0.75 });
    ctx.restore();
  }
  // eyewall: παχιά στροβιλιζόμενη κορδέλα-δακτύλιος (storm sash identity)
  const ringR = 250;
  for (let k = 0; k < 3; k++) {
    const rr = ringR - k * 26;
    const w = 34 - k * 9;
    ctx.save();
    ctx.globalCompositeOperation = k ? 'lighter' : 'source-over';
    const segs = 5;
    for (let sgi = 0; sgi < segs; sgi++) {
      const a0 = (sgi / segs) * Math.PI * 2 + k * 0.4, a1 = a0 + (Math.PI * 2 / segs) * 0.8;
      const g = ctx.createLinearGradient(CX + Math.cos(a0) * rr, CY + Math.sin(a0) * rr, CX + Math.cos(a1) * rr, CY + Math.sin(a1) * rr);
      g.addColorStop(0, rgba(pal.glow, 0.15)); g.addColorStop(0.6, mix(pal.glow, '#ffffff', 0.25)); g.addColorStop(1, rgba(pal.core, 0.9));
      ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(CX, CY, rr, a0, a1); ctx.stroke();
    }
    ctx.restore();
  }
  // κορδέλα-ουρές που ξεφεύγουν από το eyewall
  for (const [a, len, flip] of [[0.7, 200, 1], [2.8, 230, -1], [4.6, 180, 1]]) {
    ctx.save(); ctx.translate(CX + Math.cos(a) * ringR, CY + Math.sin(a) * ringR); ctx.rotate(a + Math.PI / 2 * flip);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, rgba(pal.core, 0.95)); g.addColorStop(1, rgba(pal.glow, 0));
    ctx.strokeStyle = g; ctx.lineWidth = 20; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.6, -34 * flip, len, -70 * flip); ctx.stroke();
    ctx.restore();
  }
  // gravity μάτι: σκοτεινός πυρήνας + στρόβιλος + λεπτός εσωτερικός δακτύλιος
  gravitySwirl(ctx, CX, CY, 190, pal.glow, rnd, { arms: 6, turns: 2.0, width: 4.5, alpha: 0.8 });
  energyRing(ctx, CX, CY, 118, rgba(pal.core, 0.9), { width: 3.5, alpha: 0.85, dash: [18, 14] });
  orb(ctx, CX, CY, 60, '#eafff4', rgba(pal.glow, 0.5), { alpha: 0.9 });
  ctx.save();                                    // σκοτεινή «κόρη» του ματιού
  const pupil = ctx.createRadialGradient(CX, CY, 0, CX, CY, 46);
  pupil.addColorStop(0, 'rgba(1,10,6,0.98)'); pupil.addColorStop(1, 'rgba(1,10,6,0)');
  ctx.fillStyle = pupil; ctx.beginPath(); ctx.arc(CX, CY, 46, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  embers(ctx, CX, CY, 300, 24, pal.glow, rnd);
  sparkle(ctx, CX + ringR * 0.72, CY - ringR * 0.7, 42, '#ffffff', { alpha: 0.85 });
  save(id, canvas);
}

// ── 05 TECTONIC MAW — πέτρινη γροθιά που ανοίγει σαγόνι γης με μάγμα + gravity χάσμα
function drawTectonicMaw(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  backGlow(ctx, pal, { r: 420, a: 0.15 });
  const rock = (x0, y0, pts, base, lite, dark) => {
    ctx.save(); ctx.translate(x0, y0);
    ctx.fillStyle = metalGrad(ctx, -80, -60, 90, 80, base, lite, dark);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(20,8,2,0.65)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  };
  const stone = '#6e5344', stoneL = '#a98a6d', stoneD = '#2e1d12';
  // ΚΑΤΩ ΣΑΓΟΝΙ: ημικυκλική αρένα βράχων με δόντια προς τα πάνω
  const jawY = CY + 150;
  ctx.save();
  // λάβα μέσα στο χάσμα
  const lava = ctx.createRadialGradient(CX, jawY + 40, 10, CX, jawY + 40, 300);
  lava.addColorStop(0, '#fff3c0'); lava.addColorStop(0.35, pal.glow); lava.addColorStop(0.8, '#5e1602'); lava.addColorStop(1, 'rgba(40,8,0,0)');
  ctx.fillStyle = lava;
  ctx.beginPath(); ctx.ellipse(CX, jawY + 40, 295, 150, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  gravitySwirl(ctx, CX, jawY + 45, 150, '#ffb46b', rnd, { arms: 4, turns: 1.4, width: 3.5, alpha: 0.5, darkCore: true });
  // δόντια κάτω σαγονιού
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (0.12 + 0.76 * (i / 7));
    const x = CX - Math.cos(a) * 300, y = jawY + 55 + Math.sin(a) * 95;
    const h = 78 + rnd() * 46, w = 40 + rnd() * 18;
    rock(x, y, [[-w / 2, 26], [-w * 0.32, -h], [w * 0.15, -h * 0.75], [w / 2, 20]], stone, stoneL, stoneD);
    // λάμψη μάγματος στις μύτες
    orb(ctx, x - w * 0.06, y - h * 0.82, 16, rgba('#ffd9a1', 0.8), rgba(pal.glow, 0.4), { alpha: 0.7 });
  }
  // χείλος σαγονιού (μπροστινό)
  ctx.save();
  ctx.fillStyle = metalGrad(ctx, CX - 320, jawY + 130, CX + 320, jawY + 190, stone, stoneL, stoneD);
  ctx.beginPath();
  ctx.moveTo(CX - 320, jawY + 120);
  ctx.quadraticCurveTo(CX, jawY + 220, CX + 320, jawY + 120);
  ctx.lineTo(CX + 300, jawY + 190);
  ctx.quadraticCurveTo(CX, jawY + 268, CX - 300, jawY + 190);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // faultline ρωγμές που ακτινοβολούν από το χάσμα (faultline fist identity)
  const crack = (x1, y1, x2, y2, w) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = pal.glow; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
    let px = x1, py = y1;
    ctx.beginPath(); ctx.moveTo(px, py);
    const segn = 5;
    for (let i = 1; i <= segn; i++) {
      const t = i / segn;
      px = x1 + (x2 - x1) * t + (rnd() * 2 - 1) * 26;
      py = y1 + (y2 - y1) * t + (rnd() * 2 - 1) * 14;
      ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.restore();
  };
  crack(CX - 250, jawY + 165, CX - 470, jawY + 260, 7);
  crack(CX + 240, jawY + 170, CX + 460, jawY + 285, 7);
  crack(CX - 60, jawY + 225, CX - 150, jawY + 350, 5);
  crack(CX + 90, jawY + 220, CX + 190, jawY + 345, 5);
  // ΓΡΟΘΙΑ: ΕΝΙΑΙΟ πέτρινο-μαγματικό gauntlet που βουτά στο σαγόνι
  ctx.save();
  ctx.translate(CX + 6, CY - 150); ctx.rotate(0.05);
  // motion streaks πίσω από τη γροθιά (ταχύτητα καθόδου)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [sxx, len] of [[-120, 190], [128, 210], [-58, 150], [70, 160]]) {
    const g = ctx.createLinearGradient(sxx, -430, sxx, -430 + len);
    g.addColorStop(0, rgba(pal.glow, 0)); g.addColorStop(1, rgba('#ffcf7d', 0.55));
    ctx.strokeStyle = g; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sxx, -430); ctx.lineTo(sxx, -430 + len); ctx.stroke();
  }
  ctx.restore();
  // ΕΝΙΑΙΑ silhouette: στενό αντιβράχιο → ΦΑΡΔΙΑ γροθιά (κώνος δύναμης)
  ctx.fillStyle = metalGrad(ctx, -150, -100, 160, 120, stone, stoneL, stoneD);
  ctx.beginPath();
  ctx.moveTo(-78, -336);                           // στενό αντιβράχιο πάνω
  ctx.lineTo(76, -342);
  ctx.lineTo(102, -140);                           // ανοίγει προς τον καρπό
  ctx.quadraticCurveTo(176, -84, 178, 10);         // έξω πλευρά γροθιάς (φαρδιά)
  ctx.quadraticCurveTo(176, 104, 88, 128);         // κάτω-δεξιά γωνία
  ctx.lineTo(-104, 124);
  ctx.quadraticCurveTo(-186, 96, -178, -2);        // αριστερή φαρδιά πλευρά
  ctx.quadraticCurveTo(-172, -90, -98, -146);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(20,8,2,0.7)'; ctx.lineWidth = 4; ctx.stroke();
  // ζώνη καρπού: ανάγλυφο ρυτίδωμα που χωρίζει αντιβράχιο/γροθιά
  ctx.strokeStyle = 'rgba(24,10,4,0.8)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-116, -122); ctx.quadraticCurveTo(0, -78, 118, -118); ctx.stroke();
  ctx.strokeStyle = rgba(stoneL, 0.65); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-112, -110); ctx.quadraticCurveTo(0, -66, 114, -106); ctx.stroke();
  // αρθρώσεις: 3 βαθιές χαράξεις-δάχτυλα στο μέτωπο της γροθιάς
  for (let i = 0; i < 3; i++) {
    const x = -56 + i * 58;
    ctx.strokeStyle = 'rgba(24,10,4,0.85)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, 124); ctx.quadraticCurveTo(x + 4, 66, x + 8, 20); ctx.stroke();
  }
  // πέτρινες πλάκες-ρωγμές πάνω στη μάζα
  ctx.strokeStyle = 'rgba(24,10,4,0.6)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-96, -180); ctx.lineTo(-30, -150); ctx.lineTo(-52, -70); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(96, -210); ctx.lineTo(48, -140); ctx.lineTo(84, -60); ctx.stroke();
  // αντίχειρας: ογκώδης, κολλημένος στην αριστερή πλευρά
  ctx.fillStyle = metalGrad(ctx, -190, 20, -100, 90, stone, stoneL, stoneD);
  ctx.beginPath();
  ctx.moveTo(-138, -20); ctx.quadraticCurveTo(-206, 8, -186, 84);
  ctx.quadraticCurveTo(-166, 128, -104, 106); ctx.lineTo(-128, -4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(20,8,2,0.7)'; ctx.lineWidth = 4; ctx.stroke();
  // ΜΑΓΜΑΤΙΚΕΣ ΦΛΕΒΕΣ: τρέχουν από το αντιβράχιο ως τις αρθρώσεις
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = pal.glow; ctx.lineCap = 'round';
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 20;
  const vein = (pts, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y); ctx.stroke(); };
  vein([[-64, -330], [-40, -220], [-68, -120], [-40, -20], [-52, 80]], 8);
  vein([[36, -334], [58, -230], [30, -130], [58, -30], [40, 70]], 8);
  vein([[-40, -220], [10, -180], [-2, -80]], 5);
  vein([[58, -230], [96, -160]], 5);
  ctx.restore();
  // λάμψη μάγματος στις αρθρώσεις — δυνατή, ευανάγνωστη
  for (let i = 0; i < 4; i++) {
    orb(ctx, -82 + i * 56, 78, 26, '#fff3d6', rgba(pal.glow, 0.55), { alpha: 0.95 });
    energyRing(ctx, -82 + i * 56, 78, 15, pal.glow, { width: 3, alpha: 0.9, blur: 10 });
  }
  ctx.restore();
  // σπίθες + θραύσματα στον αέρα
  embers(ctx, CX, jawY - 40, 280, 30, '#ffcf7d', rnd);
  for (let i = 0; i < 8; i++) {
    const x = CX + (rnd() * 2 - 1) * 300, y = CY - 40 + (rnd() * 2 - 1) * 160;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI);
    ctx.fillStyle = mix(stone, stoneL, rnd());
    ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(0, -9); ctx.lineTo(10, 3); ctx.lineTo(2, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  save(id, canvas);
}

// ── 06 PYROCLAST PAYLOAD — βαλλιστικό μαγματικό payload σε mid-air διαχωρισμό
function drawPyroclastPayload(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  backGlow(ctx, pal, { r: 420, a: 0.14 });
  ctx.save();
  ctx.translate(CX, CY); ctx.rotate(-Math.PI / 5);   // εκτόξευση ↗
  // ουρά καπνού/φωτιάς
  const g = ctx.createLinearGradient(0, 420, 0, -60);
  g.addColorStop(0, 'rgba(120,40,8,0)');
  g.addColorStop(0.5, rgba(pal.glow, 0.4));
  g.addColorStop(1, rgba('#fff3d6', 0.9));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-58, 430); ctx.quadraticCurveTo(-30, 140, -26, -40);
  ctx.lineTo(26, -40); ctx.quadraticCurveTo(30, 140, 58, 430);
  ctx.closePath(); ctx.fill();
  // ΠΥΡΑΥΛΙΚΗ ΕΞΑΤΜΙΣΗ: φλόγα-κώνος στην ουρά
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const fl = ctx.createLinearGradient(0, 170, 0, 470);
  fl.addColorStop(0, '#fff3d6'); fl.addColorStop(0.35, pal.glow); fl.addColorStop(1, 'rgba(200,60,10,0)');
  ctx.fillStyle = fl; ctx.shadowColor = pal.glow; ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.moveTo(-40, 168);
  ctx.quadraticCurveTo(-56, 300, 0, 460);
  ctx.quadraticCurveTo(56, 300, 40, 168);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-20, 170); ctx.quadraticCurveTo(-22, 260, 0, 330); ctx.quadraticCurveTo(22, 260, 20, 170);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // ΣΩΜΑ: χάλκινο warhead με μαγματικές ραφές (magma identity)
  const hull = metalGrad(ctx, -80, 0, 80, 0, '#8a5c38', '#d9a06a', '#3a2410');
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(0, -330);
  ctx.quadraticCurveTo(86, -180, 78, 30);
  ctx.quadraticCurveTo(70, 130, 46, 170);
  ctx.lineTo(-46, 170);
  ctx.quadraticCurveTo(-70, 130, -78, 30);
  ctx.quadraticCurveTo(-86, -180, 0, -330);
  ctx.closePath(); ctx.fill();
  rim(ctx, c => { c.beginPath(); c.moveTo(0, -330); c.quadraticCurveTo(86, -180, 78, 30); c.stroke(); }, '#ffd9a1', { width: 2.5, alpha: 0.8 });
  // μαγματικές ραφές-πλάκες
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = pal.glow; ctx.lineWidth = 5; ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
  for (const yy of [-210, -110, -10, 90]) {
    ctx.beginPath(); ctx.moveTo(-70, yy); ctx.quadraticCurveTo(0, yy + 26, 70, yy); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, -320); ctx.lineTo(0, 160); ctx.stroke();
  ctx.restore();
  // μύτη: πυρακτωμένη
  orb(ctx, 0, -300, 90, '#fff7dd', rgba(pal.glow, 0.5));
  // NULL πτερύγια ουράς (null lance identity)
  for (const s of [-1, 1]) {
    ctx.save(); ctx.scale(s, 1);
    ctx.fillStyle = metalGrad(ctx, 40, 120, 130, 220, '#2c2338', '#4a3a63', '#140e1e');
    ctx.beginPath();
    ctx.moveTo(44, 90); ctx.lineTo(128, 208); ctx.lineTo(112, 238); ctx.lineTo(40, 170);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(44, 90); c.lineTo(128, 208); c.stroke(); }, '#b48cff', { width: 2.5, alpha: 0.9 });
    ctx.restore();
  }
  // ΔΙΑΧΩΡΙΣΜΟΣ: 4 magma mines ξεκολλάνε πλευρικά (nano mine identity)
  const mine = (mx, my, r, rot) => {
    // πύρινη ουρά-κομήτης: ΚΑΜΠΥΛΗ, λεπταίνει, ξεκινά κοντά στο σκάφος
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createLinearGradient(mx * 0.55, my * 0.55 + 60, mx, my);
    tg.addColorStop(0, rgba(pal.glow, 0)); tg.addColorStop(1, rgba('#ffcf7d', 0.75));
    ctx.strokeStyle = tg; ctx.lineWidth = r * 0.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(mx * 0.55, my * 0.55 + 60);
    ctx.quadraticCurveTo(mx * 0.85, my * 0.72 + 30, mx, my); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(mx, my); ctx.rotate(rot);
    ctx.fillStyle = metalGrad(ctx, -r, 0, r, 0, '#6e5138', '#b08054', '#2a1a0c');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // αγκάθια επαφής
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = '#2a1c12';
      ctx.beginPath(); ctx.moveTo(r - 2, -4); ctx.lineTo(r + 12, 0); ctx.lineTo(r - 2, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // μαγματικός ισημερινός + πυρήνας
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = pal.glow; ctx.lineWidth = 4; ctx.shadowColor = pal.glow; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.86, r * 0.38, 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    orb(ctx, 0, 0, r * 0.42, '#fff3d6', rgba(pal.glow, 0.5));
    ctx.restore();
  };
  mine(-165, -60, 46, 0.4);
  mine(175, -130, 42, -0.7);
  mine(-195, 130, 38, 1.2);
  mine(205, 90, 40, 0.1);
  // (τα νήματα καλύπτονται από τις πύρινες ουρές των mines — όχι διπλά «καλαμάκια»)
  embers(ctx, 0, 260, 200, 26, '#ffcf7d', rnd);
  sparkle(ctx, 0, -318, 52, '#fff7dd');
  ctx.restore();
  save(id, canvas);
}

// ── 07 COMPASS OF RUIN — γεωμετρικός διαβήτης πάνω σε φλεγόμενο κύκλο
function drawCompassOfRuin(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  backGlow(ctx, pal, { r: 430, a: 0.15 });
  // εγγεγραμμένος κύκλος σε προοπτική (boundary field)
  ctx.save(); ctx.translate(CX, CY + 240); ctx.scale(1, 0.36);
  energyRing(ctx, 0, 0, 350, pal.glow, { width: 16, alpha: 0.95, blur: 30 });
  energyRing(ctx, 0, 0, 300, rgba(pal.core, 0.9), { width: 4, alpha: 0.85, blur: 8, dash: [24, 16] });
  energyRing(ctx, 0, 0, 392, rgba(pal.glow, 0.5), { width: 5, alpha: 0.6, blur: 16 });
  // τόξα ιόντων πάνω στην περιφέρεια (ion split identity)
  ctx.restore();
  for (const a of [0.5, 2.2, 3.9, 5.3]) {
    const x = CX + Math.cos(a) * 350, y = CY + 240 + Math.sin(a) * 350 * 0.36;
    orb(ctx, x, y, 26, '#ffffff', rgba(pal.glow, 0.5));
  }
  lightning(ctx, CX + Math.cos(0.5) * 350, CY + 240 + Math.sin(0.5) * 126, CX + Math.cos(1.4) * 300, CY + 240 + Math.sin(1.4) * 108, { rnd, jag: 16, width: 3.5, color: pal.glow });
  lightning(ctx, CX + Math.cos(3.9) * 350, CY + 240 + Math.sin(3.9) * 126, CX + Math.cos(3.1) * 310, CY + 240 + Math.sin(3.1) * 112, { rnd, jag: 16, width: 3.5, color: pal.glow });
  // ΔΙΑΒΗΤΗΣ: hinge orb ψηλά, δύο σκέλη ως δοκοί φωτός με μεταλλικό κέλυφος
  const hx = CX, hy = CY - 330;
  const legTip = [[CX - 255, CY + 268], [CX + 262, CY + 253]];   // πάνω στην περιφέρεια
  for (const [tx, ty] of legTip) {
    // μεταλλικό σκέλος
    ctx.save();
    const ang = Math.atan2(ty - hy, tx - hx);
    ctx.translate(hx, hy); ctx.rotate(ang);
    const len = Math.hypot(tx - hx, ty - hy);
    ctx.fillStyle = metalGrad(ctx, 0, -22, 0, 22, '#31456e', '#5f7fb8', '#141d33');
    ctx.beginPath();
    ctx.moveTo(30, -20); ctx.lineTo(len * 0.55, -11); ctx.lineTo(len - 12, -3);
    ctx.lineTo(len - 12, 3); ctx.lineTo(len * 0.55, 11); ctx.lineTo(30, 20);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(30, -20); c.lineTo(len * 0.55, -11); c.lineTo(len - 12, -3); c.stroke(); }, '#bcd6ff', { width: 2, alpha: 0.8 });
    // δέσμη axiom ΜΕΣΑ στο σκέλος (axiom ray identity)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const bg = ctx.createLinearGradient(30, 0, len, 0);
    bg.addColorStop(0, rgba(pal.glow, 0.2)); bg.addColorStop(1, '#ffffff');
    ctx.strokeStyle = bg; ctx.lineWidth = 6; ctx.shadowColor = pal.glow; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(len - 8, 0); ctx.stroke();
    ctx.restore();
    ctx.restore();
    // επαφή με τον κύκλο: λάμψη
    sparkle(ctx, tx, ty, 42, '#eaf6ff');
  }
  // σπείρα phi χαραγμένη ανάμεσα στα σκέλη (phi cutter identity)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#8fd0ff', 0.75); ctx.lineWidth = 4.5;
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 14;
  ctx.beginPath();
  let sr = 14;
  for (let t = 0; t < Math.PI * 3.2; t += 0.05) {
    const x = CX + Math.cos(t + 1.4) * sr, y = CY - 20 + Math.sin(t + 1.4) * sr;
    if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    sr *= 1.018;
  }
  ctx.stroke(); ctx.restore();
  // hinge: κορυφαία άρθρωση με κρύσταλλο + διακοσμητική κορώνα
  ctx.fillStyle = metalGrad(ctx, hx - 40, hy, hx + 40, hy, '#31456e', '#5f7fb8', '#141d33');
  ctx.beginPath();
  ctx.moveTo(hx - 40, hy + 30); ctx.lineTo(hx - 20, hy - 40); ctx.lineTo(hx + 20, hy - 40); ctx.lineTo(hx + 40, hy + 30);
  ctx.lineTo(hx + 16, hy + 66); ctx.lineTo(hx - 16, hy + 66);
  ctx.closePath(); ctx.fill();
  orb(ctx, hx, hy - 2, 58, '#ffffff', rgba(pal.glow, 0.6));
  energyRing(ctx, hx, hy - 2, 40, pal.glow, { width: 4, alpha: 0.95 });
  // μικρή «κεραία» Q.E.D.
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = pal.glow; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.moveTo(hx, hy - 44); ctx.lineTo(hx, hy - 96); ctx.stroke();
  ctx.restore();
  orb(ctx, hx, hy - 104, 20, '#ffffff', rgba(pal.glow, 0.6));
  embers(ctx, CX, CY + 160, 330, 20, pal.glow, rnd);
  save(id, canvas);
}

// ── 08 GOLDEN COLLAPSE — λεπίδα-χρυσή σπείρα με κόμβους-νάρκες και βαρυτικό μάτι
function drawGoldenCollapse(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  backGlow(ctx, pal, { r: 420, a: 0.16 });
  const ecx = CX + 30, ecy = CY + 30;                 // «μάτι» σπείρας
  // Η ΣΠΕΙΡΑ-ΛΕΠΙΔΑ: golden log-spiral (per-turn ratio 1/φ) — 3 πλήρεις στροφές
  const DECAY = 0.9966, STEP = 0.045, T_MAX = Math.PI * 6, PH = 0.8;
  const spiralR = (t, scale) => 360 * scale * Math.pow(DECAY, t / STEP);
  const spiral = (scale, width, colorL, colorD, blur, lighter) => {
    ctx.save();
    if (lighter) ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    let prev = null;
    for (let t = 0; t < T_MAX; t += STEP) {
      const r = spiralR(t, scale);
      if (r < 78) break;                             // η λάμα σταματά πριν το μάτι — όχι bullseye
      const x = ecx + Math.cos(t + PH) * r, y = ecy + Math.sin(t + PH) * r;
      if (prev) {
        const w = Math.max(2.5, width * (r / (360 * scale)));
        const g = ctx.createLinearGradient(prev[0], prev[1], x, y);
        g.addColorStop(0, colorL); g.addColorStop(1, colorD);
        ctx.strokeStyle = g; ctx.lineWidth = w;
        if (blur) { ctx.shadowColor = pal.glow; ctx.shadowBlur = blur; }
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(x, y); ctx.stroke();
      }
      prev = [x, y];
    }
    ctx.restore();
  };
  spiral(1.05, 46, 'rgba(80,54,8,0.95)', 'rgba(56,36,5,0.95)', 0, false);   // σκιά/πάχος λάμας
  spiral(1.0, 34, '#f6d878', '#b98a1e', 18, false);                          // χρυσό σώμα
  spiral(0.96, 10, '#fffbe0', rgba('#ffd447', 0.6), 14, true);               // φωτεινή ακμή
  // ακμή-δόντια στο εξωτερικό της λάμας (blade identity)
  for (let k = 0; k < 14; k++) {
    const t = 0.5 + k * 0.62;
    const rr = spiralR(t, 1.03);
    if (rr < 60) break;
    const x = ecx + Math.cos(t + PH) * rr, y = ecy + Math.sin(t + PH) * rr;
    const ang = t + PH + Math.PI / 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#e7bd4e';
    const th = Math.max(12, 34 * (rr / 360));
    ctx.beginPath(); ctx.moveTo(-th * 0.55, 0); ctx.lineTo(4, -th); ctx.lineTo(th * 0.55, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // κόμβοι-νάρκες πάνω στη σπείρα (nano mine identity)
  for (let i = 0; i < 8; i++) {
    const t = 0.85 + i * 1.35;
    const rr = spiralR(t, 1.0);
    if (rr < 55) break;
    const x = ecx + Math.cos(t + PH) * rr, y = ecy + Math.sin(t + PH) * rr;
    const r0 = Math.max(12, 15 + rr * 0.05);
    ctx.fillStyle = metalGrad(ctx, x - r0, y, x + r0, y, '#7a5c14', '#c8a13c', '#3a2a06');
    ctx.beginPath(); ctx.arc(x, y, r0, 0, Math.PI * 2); ctx.fill();
    orb(ctx, x, y, r0 * 0.62, '#fff6cf', rgba(pal.glow, 0.55));
    energyRing(ctx, x, y, r0 + 6, rgba(pal.glow, 0.8), { width: 2.5, alpha: 0.8, blur: 8 });
  }
  // βαρυτικό μάτι στο κέντρο (gravity core identity)
  gravitySwirl(ctx, ecx, ecy, 110, pal.glow, rnd, { arms: 5, turns: 1.7, width: 3.5, alpha: 0.8 });
  orb(ctx, ecx, ecy, 40, '#fff6cf', rgba(pal.glow, 0.4), { alpha: 0.85 });
  ctx.save();
  const pupil = ctx.createRadialGradient(ecx, ecy, 0, ecx, ecy, 34);
  pupil.addColorStop(0, 'rgba(10,7,0,0.98)'); pupil.addColorStop(1, 'rgba(10,7,0,0)');
  ctx.fillStyle = pupil; ctx.beginPath(); ctx.arc(ecx, ecy, 34, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // φ σύμβολο δίπλα στο μάτι
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#fff2c0'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.ellipse(ecx, ecy, 17, 24, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ecx, ecy - 44); ctx.lineTo(ecx, ecy + 44); ctx.stroke();
  ctx.restore();
  embers(ctx, ecx, ecy, 320, 24, '#ffe9a1', rnd);
  sparkle(ctx, ecx + 305, ecy - 195, 46, '#fffbe0');
  save(id, canvas);
}

// ── 09 HUNGRY HELL FEAST — δαιμονικός cleaver-σαγόνι + φανάρι + gravity στρόβιλος
function drawHungryHellFeast(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  backGlow(ctx, pal, { r: 430, a: 0.16 });
  // βαρυτική πύλη πίσω από τη λεπίδα: σκοτεινό rift με ζεστό χείλος (όχι scribble)
  ctx.save();
  ctx.translate(CX - 40, CY - 30); ctx.rotate(0.42);
  const riftG = ctx.createRadialGradient(0, 0, 40, 0, 0, 330);
  riftG.addColorStop(0, 'rgba(8,0,3,0.92)');
  riftG.addColorStop(0.72, 'rgba(30,2,8,0.55)');
  riftG.addColorStop(1, 'rgba(30,2,8,0)');
  ctx.fillStyle = riftG;
  ctx.beginPath(); ctx.ellipse(0, 0, 330, 250, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(pal.glow, 0.55); ctx.lineWidth = 6;
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.ellipse(0, 0, 312, 234, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(CX - 20, CY); ctx.rotate(0.42);      // διαγώνιος cleaver
  // ΛΑΒΗ: τυλιγμένη, δεμένη στην πάνω-δεξιά γωνία της λεπίδας
  ctx.save(); ctx.translate(178, -218); ctx.rotate(-0.62);
  ctx.fillStyle = metalGrad(ctx, -17, 0, 17, 0, '#3a1a10', '#6e3a22', '#160a06');
  ctx.beginPath(); ctx.roundRect(-17, -206, 34, 216, 12); ctx.fill();
  for (let i = 0; i < 5; i++) {                      // δέσιμο λαβής
    ctx.strokeStyle = i % 2 ? '#20100a' : '#54301e';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-17, -180 + i * 36); ctx.lineTo(17, -164 + i * 36); ctx.stroke();
  }
  // pommel: μπρούτζινο δαχτυλίδι-κρίκος (δένει με την αλυσίδα του φαναριού)
  ctx.strokeStyle = metalGrad(ctx, -22, -238, 22, -196, '#8a6a2e', '#d9b45e', '#3a2a0e');
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(0, -218, 17, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // ΣΩΜΑ ΛΕΠΙΔΑΣ: ογκώδης cleaver — τα ΔΟΝΤΙΑ είναι μέρος της silhouette της ακμής
  const bladePath = () => {
    ctx.beginPath();
    ctx.moveTo(196, -186);                           // ώμος στη λαβή
    ctx.quadraticCurveTo(230, -60, 208, 148);        // δεξιά πλευρά
    // ΚΑΤΩ ΑΚΜΗ-ΣΑΓΟΝΙ: κυματιστά δόντια-κυνόδοντες ενσωματωμένα στο path
    let px = 208, py = 148;
    const tipX = -308, tipY = 22;
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const bx = 208 + (tipX - 208) * t;
      const by = 148 + (tipY - 148) * t + Math.sin(t * Math.PI) * 66;   // κοιλιά προς τα κάτω
      const fang = 56 * (1 - t * 0.45);
      const mx = (px + bx) / 2, my = (py + by) / 2;
      // κυνόδοντας: βαθύ V ανάμεσα στα σημεία
      ctx.quadraticCurveTo(px + (mx - px) * 0.5, my + fang, mx, my + fang);
      ctx.quadraticCurveTo(mx + (bx - mx) * 0.4, by - 8, bx, by);
      px = bx; py = by;
    }
    ctx.lineTo(-352, -24);                           // μύτη-γάντζος
    ctx.quadraticCurveTo(-330, -66, -286, -76);
    ctx.quadraticCurveTo(-120, -196, 96, -206);      // πλάτη
    ctx.quadraticCurveTo(160, -206, 196, -186);
    ctx.closePath();
  };
  ctx.fillStyle = metalGrad(ctx, -240, -160, 180, 240, '#5e1a24', '#8e2e3c', '#22050c');
  bladePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(18,3,7,0.8)'; ctx.lineWidth = 4; bladePath(); ctx.stroke();
  // σκούρα «σπονδυλωτή» πλάτη (ράχη cleaver)
  ctx.fillStyle = 'rgba(24,4,10,0.85)';
  ctx.beginPath();
  ctx.moveTo(96, -206); ctx.quadraticCurveTo(-120, -196, -286, -76);
  ctx.quadraticCurveTo(-140, -140, 20, -168); ctx.quadraticCurveTo(80, -180, 96, -206);
  ctx.closePath(); ctx.fill();
  // καρφιά στη ράχη
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = 60 - t * 300, y = -186 + t * 96;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.6 - t * 0.3);
    ctx.fillStyle = '#c9a13c';
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(0, -26); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  rim(ctx, c => { c.beginPath(); c.moveTo(96, -206); c.quadraticCurveTo(-120, -196, -286, -76); c.stroke(); }, '#ff7d8a', { width: 3, alpha: 0.85 });
  // πυρωμένη γραμμή κατά μήκος του σαγονιού (πάνω από τα δόντια)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = pal.glow; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 28;
  ctx.beginPath(); ctx.moveTo(196, 108); ctx.quadraticCurveTo(-60, 190, -296, 10); ctx.stroke();
  ctx.restore();
  // λευκά δόντια-ένθετα ΜΕΣΑ στους κυνόδοντες της ακμής (κοκάλινο σαγόνι)
  ctx.fillStyle = metalGrad(ctx, -240, 60, 160, 260, '#efe3d2', '#fffaf0', '#b9a289');
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    const bx = 208 + (-308 - 208) * t;
    const by = 148 + (22 - 148) * t + Math.sin(t * Math.PI) * 66;
    const fang = 44 * (1 - t * 0.45);
    ctx.save(); ctx.translate(bx + 30, by + 6); ctx.rotate(-0.2 - t * 0.4);
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.quadraticCurveTo(-2, fang * 0.5, 2, fang); ctx.quadraticCurveTo(10, fang * 0.4, 16, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // δαιμονικό μάτι-έμβλημα στη λεπίδα (almond, όχι έλλειψη-«καρύδι»)
  ctx.save(); ctx.translate(-52, -20); ctx.rotate(-0.24);
  orb(ctx, 0, 0, 72, '#ffd9a8', rgba(pal.glow, 0.5));
  ctx.fillStyle = '#ffb03e';
  ctx.beginPath();
  ctx.moveTo(-58, 0); ctx.quadraticCurveTo(0, -42, 58, 0); ctx.quadraticCurveTo(0, 42, -58, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#22050c';
  ctx.beginPath(); ctx.ellipse(0, 0, 12, 30, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
  // ΦΑΝΑΡΙ κρεμασμένο με αλυσίδα από τον άξονα (spirit lantern identity)
  const lx = CX + 300, ly = CY - 160;
  ctx.save();
  ctx.strokeStyle = '#c8a13c'; ctx.lineWidth = 5;
  ctx.setLineDash([14, 10]);
  ctx.beginPath(); ctx.moveTo(CX + 195, CY + 60); ctx.quadraticCurveTo(lx - 40, ly + 130, lx, ly + 60); ctx.stroke();
  ctx.setLineDash([]);
  // σώμα φαναριού
  ctx.fillStyle = metalGrad(ctx, lx - 44, ly, lx + 44, ly, '#7a2436', '#a8404e', '#3a0a14');
  ctx.beginPath();
  ctx.moveTo(lx - 34, ly - 48); ctx.quadraticCurveTo(lx, ly - 72, lx + 34, ly - 48);
  ctx.quadraticCurveTo(lx + 52, ly, lx + 34, ly + 46);
  ctx.quadraticCurveTo(lx, ly + 66, lx - 34, ly + 46);
  ctx.quadraticCurveTo(lx - 52, ly, lx - 34, ly - 48);
  ctx.closePath(); ctx.fill();
  // καπάκι + κρίκος
  ctx.fillStyle = '#e8b13a';
  ctx.beginPath(); ctx.roundRect(lx - 24, ly - 78, 48, 16, 6); ctx.fill();
  ctx.beginPath(); ctx.arc(lx, ly - 90, 10, 0, Math.PI * 2); ctx.stroke();
  // πνεύμα μέσα: ΠΕΙΝΑΣΜΕΝΟ, αγριεμένο πρόσωπο (λοξές σχισμές + ανοιχτό στόμα με δόντια)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const sg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 42);
  sg.addColorStop(0, '#fff1d6'); sg.addColorStop(0.5, '#ffb46b'); sg.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(lx, ly, 42, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#3a0a14';
  for (const s of [-1, 1]) {                         // λοξές σχισμές-μάτια
    ctx.save(); ctx.translate(lx + s * 12, ly - 12); ctx.rotate(s * 0.5);
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, -7, 10, 0); ctx.quadraticCurveTo(0, 4, -10, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();                                   // ανοιχτό στόμα
  ctx.moveTo(lx - 16, ly + 8); ctx.quadraticCurveTo(lx, ly + 2, lx + 16, ly + 8);
  ctx.quadraticCurveTo(lx + 8, ly + 26, lx, ly + 27); ctx.quadraticCurveTo(lx - 8, ly + 26, lx - 16, ly + 8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe9c9';                         // κυνόδοντες
  ctx.beginPath(); ctx.moveTo(lx - 11, ly + 9); ctx.lineTo(lx - 8, ly + 18); ctx.lineTo(lx - 5, ly + 9); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(lx + 5, ly + 9); ctx.lineTo(lx + 8, ly + 18); ctx.lineTo(lx + 11, ly + 9); ctx.closePath(); ctx.fill();
  ctx.restore();
  embers(ctx, CX - 80, CY, 340, 30, '#ff9d5e', rnd);
  sparkle(ctx, CX - 268, CY + 118, 40, '#ffe3e3');
  save(id, canvas);
}

// ── 10 NIGHT PARADE — τελετουργικό lantern-staff με πομπή μικρών φαναριών
function drawNightParade(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  backGlow(ctx, pal, { r: 430, a: 0.15 });
  // ΡΑΒΔΟΣ: ψηλό κατακόρυφο staff με drone-head (blacknet identity)
  const sx = CX - 130;
  ctx.fillStyle = metalGrad(ctx, sx - 14, 0, sx + 14, 0, '#3a1e56', '#5e3a86', '#180a28');
  ctx.beginPath(); ctx.roundRect(sx - 13, CY - 330, 26, 700, 10); ctx.fill();
  rim(ctx, c => { c.beginPath(); c.moveTo(sx - 13, CY - 320); c.lineTo(sx - 13, CY + 350); c.stroke(); }, pal.glow, { width: 2, alpha: 0.5 });
  // drone-head: γεωμετρική κεφαλή με fins και μάτι
  ctx.save(); ctx.translate(sx, CY - 360);
  ctx.fillStyle = metalGrad(ctx, -60, 0, 60, 0, '#2c1a3e', '#4e3070', '#120822');
  ctx.beginPath();
  ctx.moveTo(-52, 30); ctx.lineTo(-30, -46); ctx.lineTo(30, -46); ctx.lineTo(52, 30); ctx.lineTo(0, 56);
  ctx.closePath(); ctx.fill();
  for (const s of [-1, 1]) {                        // fins
    ctx.fillStyle = '#1c0f2e';
    ctx.beginPath(); ctx.moveTo(s * 48, 6); ctx.lineTo(s * 92, -26); ctx.lineTo(s * 56, -26); ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(s * 48, 6); c.lineTo(s * 92, -26); c.stroke(); }, pal.glow, { width: 2, alpha: 0.8 });
  }
  orb(ctx, 0, -2, 30, '#ffffff', rgba(pal.glow, 0.6));
  energyRing(ctx, 0, -2, 20, pal.glow, { width: 3.5, alpha: 0.95 });
  ctx.restore();
  // ΚΕΝΤΡΙΚΟ ΦΑΝΑΡΙ: μεγάλο chochin με δαιμονικό πρόσωπο (spirit lantern identity)
  const bigLantern = (lx, ly, w, h, main) => {
    ctx.save(); ctx.translate(lx, ly);
    // σώμα: ribbed paper lantern
    const bodyG = ctx.createLinearGradient(-w, 0, w, 0);
    bodyG.addColorStop(0, mix(pal.accent, '#000000', 0.25));
    bodyG.addColorStop(0.35, pal.glow);
    bodyG.addColorStop(0.55, '#f4d7ff');
    bodyG.addColorStop(0.8, pal.glow);
    bodyG.addColorStop(1, mix(pal.accent, '#000000', 0.3));
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.fill();
    // ribs: ΟΡΙΖΟΝΤΙΑ τόξα chochin (μπροστινή όψη μόνο — όχι disco μπάλα)
    ctx.strokeStyle = 'rgba(30,8,50,0.55)'; ctx.lineWidth = main ? 4 : 2.5;
    for (let i = -3; i <= 3; i++) {
      const yy = i * h * 0.24;
      const ww = w * Math.sqrt(Math.max(0, 1 - Math.pow(yy / h, 2)));
      ctx.beginPath(); ctx.ellipse(0, yy, ww, h * 0.055, 0, 0, Math.PI); ctx.stroke();
    }
    // εσωτερικό φως-πυρήνας (το φανάρι ΚΑΙΕΙ)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(0, -h * 0.1, 0, 0, -h * 0.1, w * 0.85);
    lg.addColorStop(0, rgba('#ffe9ff', main ? 0.5 : 0.4));
    lg.addColorStop(0.6, rgba(pal.glow, 0.22));
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // caps
    ctx.fillStyle = '#e8b13a';
    ctx.beginPath(); ctx.roundRect(-w * 0.5, -h - 16, w, 18, 6); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-w * 0.42, h - 2, w * 0.84, 16, 6); ctx.fill();
    if (main) {
      // ΟΡΓΙΣΜΕΝΟ oni πρόσωπο: V-φρύδια, στενεμένα μάτια, ανοιχτό σαγόνι με κυνόδοντες
      ctx.fillStyle = '#1c0524';
      for (const s of [-1, 1]) {
        // φρύδι: χοντρή λοξή δοκός προς τα μέσα-κάτω
        ctx.save(); ctx.translate(s * w * 0.3, -h * 0.34); ctx.rotate(s * 0.55);
        ctx.beginPath(); ctx.roundRect(-w * 0.26, -h * 0.05, w * 0.52, h * 0.1, 8); ctx.fill();
        ctx.restore();
        // μάτι: αιχμηρή σχισμή κάτω από το φρύδι
        ctx.save(); ctx.translate(s * w * 0.32, -h * 0.16); ctx.rotate(s * 0.38);
        ctx.beginPath();
        ctx.moveTo(-w * 0.2, 0); ctx.quadraticCurveTo(0, -h * 0.12, w * 0.2, 0);
        ctx.quadraticCurveTo(0, h * 0.06, -w * 0.2, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        orb(ctx, s * w * 0.3, -h * 0.17, w * 0.07, '#ffffff', rgba('#ffe36b', 0.9));
      }
      // ρουθούνια
      ctx.fillStyle = '#1c0524';
      ctx.beginPath(); ctx.ellipse(-w * 0.08, h * 0.05, w * 0.05, h * 0.03, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w * 0.08, h * 0.05, w * 0.05, h * 0.03, -0.4, 0, Math.PI * 2); ctx.fill();
      // ανοιχτό στόμα: σκοτεινό, φαρδύ, με 4 μεγάλους κυνόδοντες
      ctx.fillStyle = '#170320';
      ctx.beginPath();
      ctx.moveTo(-w * 0.52, h * 0.22);
      ctx.quadraticCurveTo(0, h * 0.1, w * 0.52, h * 0.22);
      ctx.quadraticCurveTo(w * 0.3, h * 0.66, 0, h * 0.7);
      ctx.quadraticCurveTo(-w * 0.3, h * 0.66, -w * 0.52, h * 0.22);
      ctx.closePath(); ctx.fill();
      // λάμψη λαιμού μέσα στο στόμα
      orb(ctx, 0, h * 0.42, w * 0.2, rgba('#ff9d5e', 0.8), rgba(pal.glow, 0.3), { alpha: 0.7 });
      ctx.fillStyle = '#fdeaff';
      for (const [tx, dir, sc] of [[-0.36, 1, 1], [0.36, 1, 1], [-0.16, -1, 0.7], [0.16, -1, 0.7]]) {
        // dir 1 = κυνόδοντας από πάνω προς τα κάτω
        const bx = tx * w;
        const y0 = dir > 0 ? h * 0.24 : h * 0.62;
        ctx.beginPath();
        ctx.moveTo(bx - w * 0.07 * sc, y0);
        ctx.lineTo(bx, y0 + dir * h * 0.24 * sc);
        ctx.lineTo(bx + w * 0.07 * sc, y0);
        ctx.closePath(); ctx.fill();
      }
      // κόκκινη κάθετη σφραγίδα-kanji band στο μέτωπο
      ctx.fillStyle = 'rgba(200,30,60,0.9)';
      ctx.fillRect(-w * 0.07, -h * 0.94, w * 0.14, h * 0.3);
      ctx.fillStyle = '#fdeaff';
      ctx.fillRect(-w * 0.04, -h * 0.88, w * 0.08, h * 0.05);
      ctx.fillRect(-w * 0.04, -h * 0.79, w * 0.08, h * 0.05);
    }
    ctx.restore();
  };
  // βραχίονας που κρατά την πομπή: καμπύλο δοκάρι από το staff
  ctx.strokeStyle = metalGrad(ctx, sx, CY - 300, CX + 380, CY - 180, '#3a1e56', '#5e3a86', '#180a28');
  ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx + 6, CY - 300); ctx.quadraticCurveTo(CX + 200, CY - 380, CX + 390, CY - 210); ctx.stroke();
  // μικρά φανάρια της πομπής κρεμασμένα στο δοκάρι
  const hang = [[CX + 55, CY - 335, 42, 54], [CX + 195, CY - 330, 38, 50], [CX + 320, CY - 268, 36, 46]];
  for (const [hxx, hyy, w, h] of hang) {
    ctx.strokeStyle = '#c8a13c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(hxx, hyy); ctx.lineTo(hxx, hyy + 46); ctx.stroke();
    bigLantern(hxx, hyy + 46 + h, w, h, false);
  }
  // κεντρικό φανάρι κρεμασμένο από τον σταυρό staff/δοκαριού
  ctx.strokeStyle = '#c8a13c'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(sx + 60, CY - 296); ctx.lineTo(sx + 92, CY - 208); ctx.stroke();
  bigLantern(sx + 110, CY - 30, 150, 180, true);
  // ion τόξα ανάμεσα στα φανάρια (ion fence identity)
  lightning(ctx, CX + 55, CY - 235 + 54, CX + 195, CY - 230 + 50, { rnd, jag: 14, width: 3.5, color: pal.glow });
  lightning(ctx, CX + 195, CY - 230 + 50, CX + 320, CY - 176 + 46, { rnd, jag: 12, width: 3, color: pal.glow });
  lightning(ctx, sx + 110, CY + 150, CX + 55, CY - 130, { rnd, jag: 22, width: 4, color: pal.glow });
  // πνεύματα-φωτάκια πομπής
  for (let i = 0; i < 5; i++) {
    const x = CX - 320 + i * 60 + rnd() * 20, y = CY + 300 - i * 30;
    orb(ctx, x, y, 14 + rnd() * 10, '#fdeaff', rgba(pal.glow, 0.5), { alpha: 0.8 });
  }
  embers(ctx, CX, CY, 350, 26, pal.glow, rnd);
  save(id, canvas);
}

// ── RUN ─────────────────────────────────────────────────────────────────────────
const JOBS = {
  fus_ossuary_impaler: drawOssuaryImpaler,
  fus_black_psalm_choir: drawBlackPsalmChoir,
  fus_cyclone_metronome: drawCycloneMetronome,
  fus_null_storm_eye: drawNullStormEye,
  fus_tectonic_maw: drawTectonicMaw,
  fus_pyroclast_payload: drawPyroclastPayload,
  fus_compass_of_ruin: drawCompassOfRuin,
  fus_golden_collapse: drawGoldenCollapse,
  fus_hungry_hell_feast: drawHungryHellFeast,
  fus_night_parade: drawNightParade,
};
const only = process.argv[2];
for (const [id, fn] of Object.entries(JOBS)) {
  if (only && id !== only) continue;
  fn(id);
}
console.log('DONE');
