// ════════════════════════════════════════════════════════════════════════════════
// FUSION ARMORY — Batch C art generator (chars 6-10 → 10 assets).
// node tools/art/generate_fusion_art_c.mjs [fusion_id]
// Ίδιοι κανόνες με το B: 1024×1024 RGBA, μεγάλο κεντρικό όπλο, καθαρή silhouette,
// στοιχεία και των 3 components, palette ανά fusion, deterministic seed.
// ════════════════════════════════════════════════════════════════════════════════
import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, seedFromString, rgba, mix, lightning, metalGrad, embers,
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

// ── 11 FERROMAG PILEDRIVER — θωρακισμένη γροθιά-έμβολο + μαγνητικά θραύσματα + ion τόξα
function drawFerromagPiledriver(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  ctx.save();
  ctx.translate(CX, CY); ctx.rotate(-0.32);          // γροθιά χτυπά ↗
  const steel = '#3a4d78', steelL = '#8aa6d9', steelD = '#141c30';
  // ΑΝΤΙΒΡΑΧΙΟ: θωρακισμένο, με πιστόνι-ράγες
  ctx.fillStyle = metalGrad(ctx, 0, -70, 0, 90, steel, steelL, steelD);
  ctx.beginPath();
  ctx.moveTo(-330, -84); ctx.lineTo(60, -100);
  ctx.quadraticCurveTo(120, -96, 128, -30);
  ctx.lineTo(128, 40);
  ctx.quadraticCurveTo(120, 100, 60, 104);
  ctx.lineTo(-330, 88);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(8,12,24,0.8)'; ctx.lineWidth = 4; ctx.stroke();
  // πλάκες θωράκισης
  for (const x of [-290, -210, -130, -50]) {
    ctx.strokeStyle = 'rgba(8,12,24,0.7)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, -92); ctx.lineTo(x + 14, 92); ctx.stroke();
    ctx.strokeStyle = rgba(steelL, 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 5, -90); ctx.lineTo(x + 19, 90); ctx.stroke();
  }
  // ΠΙΣΤΟΝΙ-ΡΑΓΕΣ πάνω/κάτω (rail identity)
  for (const s of [-1, 1]) {
    ctx.fillStyle = metalGrad(ctx, 0, s * 118 - 14, 0, s * 118 + 14, '#232f4d', steelL, '#0b1120');
    ctx.beginPath(); ctx.roundRect(-300, s * 112 - 13, 350, 26, 10); ctx.fill();
    // ενεργειακή ράγα
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createLinearGradient(-300, 0, 60, 0);
    rg.addColorStop(0, rgba(pal.glow, 0.1)); rg.addColorStop(1, rgba(pal.glow, 0.95));
    ctx.strokeStyle = rg; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(-292, s * 112); ctx.lineTo(44, s * 112); ctx.stroke();
    ctx.restore();
  }
  // ΓΡΟΘΙΑ: ογκώδης, τετράγωνη, με φωτεινό rail στους κονδύλους
  ctx.fillStyle = metalGrad(ctx, 130, -120, 320, 120, steel, steelL, steelD);
  ctx.beginPath();
  ctx.moveTo(120, -128);
  ctx.lineTo(268, -116);
  ctx.quadraticCurveTo(318, -104, 322, -40);
  ctx.lineTo(322, 52);
  ctx.quadraticCurveTo(318, 116, 262, 124);
  ctx.lineTo(120, 132);
  ctx.quadraticCurveTo(96, 60, 96, 0);
  ctx.quadraticCurveTo(96, -70, 120, -128);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(8,12,24,0.85)'; ctx.lineWidth = 5; ctx.stroke();
  // δάχτυλα: 3 βαθιές εγκοπές + ΚΟΝΔΥΛΟΙ-ΘΟΛΟΙ στο μέτωπο (να διαβάζεται γροθιά)
  for (let i = 0; i < 3; i++) {
    const y = -70 + i * 62;
    ctx.strokeStyle = 'rgba(8,12,24,0.85)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(322, y); ctx.lineTo(206, y + 8); ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const y = -100 + i * 62;
    ctx.fillStyle = metalGrad(ctx, 300, y, 344, y + 40, '#4c5f8c', steelL, '#1a2440');
    ctx.beginPath(); ctx.ellipse(318, y + 30, 26, 27, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(8,12,24,0.7)'; ctx.lineWidth = 3; ctx.stroke();
  }
  // κόνδυλοι-rail: κάθετη φωτεινή μπάρα στο μέτωπο
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = mix(pal.glow, '#ffffff', 0.3); ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.shadowColor = pal.glow; ctx.shadowBlur = 26;
  ctx.beginPath(); ctx.moveTo(324, -96); ctx.lineTo(324, 100); ctx.stroke();
  ctx.restore();
  // shockwave line μπροστά από τη γροθιά
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = rgba(pal.glow, 0.75 - k * 0.22); ctx.lineWidth = 10 - k * 3;
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(348 + k * 46, 0, 60 + k * 40, -Math.PI * 0.42, Math.PI * 0.42); ctx.stroke();
  }
  ctx.restore();
  // ΜΑΓΝΗΤΙΚΑ ΘΡΑΥΣΜΑΤΑ που συγκλίνουν στη γροθιά (shrapnel identity)
  const frag = (fx, fy, sc, rot) => {
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(rot);
    ctx.fillStyle = metalGrad(ctx, -16 * sc, 0, 16 * sc, 0, '#4c5f8c', steelL, '#1a2440');
    ctx.beginPath();
    ctx.moveTo(-18 * sc, 2 * sc); ctx.lineTo(-4 * sc, -12 * sc); ctx.lineTo(18 * sc, -2 * sc);
    ctx.lineTo(6 * sc, 6 * sc); ctx.lineTo(-2 * sc, 14 * sc);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(-18 * sc, 2 * sc); c.lineTo(-4 * sc, -12 * sc); c.lineTo(18 * sc, -2 * sc); c.stroke(); }, pal.glow, { width: 1.5, alpha: 0.8, blur: 6 });
    ctx.restore();
  };
  const fragPos = [[-40, -210, 1.4], [90, -230, 1.1], [220, -220, 1.5], [330, -170, 1.0],
                   [-80, 220, 1.2], [80, 230, 1.5], [240, 210, 1.1], [360, 150, 1.3], [400, -60, 1.2]];
  for (const [fx, fy, sc] of fragPos) frag(fx, fy, sc, rnd() * Math.PI);
  // ion τόξα: θραύσματα ↔ γροθιά (ion halo identity)
  lightning(ctx, 220, -220, 280, -110, { rnd, jag: 14, width: 3.5, color: pal.glow });
  lightning(ctx, 80, 230, 180, 120, { rnd, jag: 14, width: 3.5, color: pal.glow });
  lightning(ctx, 400, -60, 330, -10, { rnd, jag: 10, width: 3, color: pal.glow });
  // δακτύλιος συναρμολόγησης γύρω από τον καρπό
  ctx.save(); ctx.translate(96, 0); ctx.scale(0.42, 1);
  energyRing(ctx, 0, 0, 150, pal.glow, { width: 6, alpha: 0.8, blur: 16, dash: [20, 14] });
  ctx.restore();
  embers(ctx, 200, 0, 260, 18, pal.glow, rnd);
  sparkle(ctx, 332, -100, 40, '#eef4ff');
  ctx.restore();
  save(id, canvas);
}

// ── 12 SCRAPSTORM FOUNDRY — περιστρεφόμενος δακτύλιος σκραπ γύρω από χωνευτήρι + drone
function drawScrapstormFoundry(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  // ΧΩΝΕΥΤΗΡΙ-ΠΥΡΗΝΑΣ: λιωμένο μέταλλο σε κύπελλο
  const coreR = 120;
  ctx.save();
  ctx.fillStyle = metalGrad(ctx, CX - coreR, CY, CX + coreR, CY, '#4c3324', '#8a6a4e', '#1c100a');
  ctx.beginPath(); ctx.arc(CX, CY, coreR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(16,8,4,0.8)'; ctx.lineWidth = 5; ctx.stroke();
  // λιωμένη επιφάνεια
  const melt = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreR * 0.82);
  melt.addColorStop(0, '#fff3d6'); melt.addColorStop(0.5, pal.glow); melt.addColorStop(1, '#7a2e0e');
  ctx.fillStyle = melt;
  ctx.beginPath(); ctx.arc(CX, CY, coreR * 0.82, 0, Math.PI * 2); ctx.fill();
  // φυσαλίδες
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * coreR * 0.6;
    orb(ctx, CX + Math.cos(a) * d, CY + Math.sin(a) * d, 8 + rnd() * 8, '#fff7dd', rgba(pal.glow, 0.4), { alpha: 0.7 });
  }
  ctx.restore();
  // ΔΑΚΤΥΛΙΟΣ ΣΚΡΑΠ: 10 οδοντωτές πλάκες σε τροχιά (2 δακτύλιοι για βάθος)
  const plate = (px, py, sc, rot, hot) => {
    ctx.save(); ctx.translate(px, py); ctx.rotate(rot);
    ctx.fillStyle = metalGrad(ctx, -30 * sc, 0, 30 * sc, 0, '#5c4634', '#a3805e', '#241610');
    ctx.beginPath();
    ctx.moveTo(-34 * sc, 6 * sc); ctx.lineTo(-18 * sc, -22 * sc); ctx.lineTo(4 * sc, -14 * sc);
    ctx.lineTo(30 * sc, -26 * sc); ctx.lineTo(34 * sc, 4 * sc); ctx.lineTo(12 * sc, 12 * sc);
    ctx.lineTo(2 * sc, 26 * sc); ctx.lineTo(-20 * sc, 18 * sc);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(16,8,4,0.7)'; ctx.lineWidth = 2.5; ctx.stroke();
    if (hot) {                                        // πυρακτωμένη ακμή προς τον πυρήνα
      rim(ctx, c => { c.beginPath(); c.moveTo(-20 * sc, 18 * sc); c.lineTo(2 * sc, 26 * sc); c.stroke(); }, pal.glow, { width: 3, alpha: 0.9, blur: 10 });
    }
    ctx.restore();
  };
  // πίσω τόξο (πάνω μισό — πιο μικρό/σκοτεινό)
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i / 4) * Math.PI;
    plate(CX + Math.cos(a) * 235, CY + Math.sin(a) * 210 - 8, 1.15, a + 1.2, false);
  }
  // τροχιακό ίχνος
  ctx.save(); ctx.translate(CX, CY); ctx.scale(1, 0.9);
  energyRing(ctx, 0, 0, 238, rgba(pal.glow, 0.5), { width: 3, alpha: 0.7, blur: 10, dash: [8, 20] });
  ctx.restore();
  // μπροστινό τόξο (κάτω μισό — μεγάλες, hot)
  for (let i = 0; i < 6; i++) {
    const a = (i / 5) * Math.PI;
    plate(CX + Math.cos(a) * 250, CY + Math.sin(a) * 225 + 6, 1.55, a - 0.6, true);
  }
  // ΣΦΥΡΗΛΑΤΗΜΕΝΟ DRONE εκτοξεύεται πάνω-δεξιά με πύρινη ουρά (blacknet identity)
  ctx.save();
  const dx = CX + 268, dy = CY - 262;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const tg = ctx.createLinearGradient(CX + 80, CY - 90, dx, dy);
  tg.addColorStop(0, rgba(pal.glow, 0)); tg.addColorStop(1, rgba('#ffcf7d', 0.85));
  ctx.strokeStyle = tg; ctx.lineWidth = 26; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(CX + 80, CY - 90); ctx.quadraticCurveTo(CX + 190, CY - 150, dx, dy); ctx.stroke();
  ctx.restore();
  ctx.translate(dx, dy); ctx.rotate(-0.7);
  ctx.fillStyle = metalGrad(ctx, -40, 0, 40, 0, '#4c3a2c', '#96755c', '#1c120c');
  ctx.beginPath();                                   // σώμα-σφήνα
  ctx.moveTo(46, 0); ctx.lineTo(-16, -30); ctx.lineTo(-40, -8); ctx.lineTo(-40, 8); ctx.lineTo(-16, 30);
  ctx.closePath(); ctx.fill();
  for (const s of [-1, 1]) {                          // φτερά-πριόνια
    ctx.fillStyle = '#2c1e14';
    ctx.beginPath(); ctx.moveTo(-10, s * 26); ctx.lineTo(10, s * 52); ctx.lineTo(18, s * 22); ctx.closePath(); ctx.fill();
  }
  orb(ctx, 8, 0, 16, '#fff3d6', rgba(pal.glow, 0.6));
  ctx.restore();
  // σπινθήρες χωνευτηριού
  embers(ctx, CX, CY, 200, 34, '#ffcf7d', rnd);
  sparkle(ctx, CX - 20, CY - coreR - 16, 34, '#fff3d6', { alpha: 0.8 });
  save(id, canvas);
}

// ── 13 WIDOW'S LOOM — εξάγωνος ιστός μονομοριακών νημάτων + kunai κόμβοι + venom
function drawWidowsLoom(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  const R = 350;
  const nodes = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    nodes.push([CX + Math.cos(a) * R, CY + Math.sin(a) * R * 0.94, a]);
  }
  // ΙΣΤΟΣ: ακτίνες + 3 εσωτερικά εξάγωνα + διαγώνιοι — λεπτά φωσφορίζοντα νήματα
  const wire = (x1, y1, x2, y2, w, a) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(pal.glow, a); ctx.lineWidth = w;
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // λευκός πυρήνας νήματος
    ctx.strokeStyle = rgba('#ffffff', a * 0.8); ctx.lineWidth = Math.max(1, w * 0.35); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  };
  for (let ring = 1; ring <= 3; ring++) {
    const k = ring / 3.4;
    for (let i = 0; i < 6; i++) {
      const [x1, y1] = nodes[i], [x2, y2] = nodes[(i + 1) % 6];
      wire(CX + (x1 - CX) * k, CY + (y1 - CY) * k, CX + (x2 - CX) * k, CY + (y2 - CY) * k, 2.2, 0.6);
    }
  }
  for (let i = 0; i < 6; i++) {                       // ακτίνες + εξωτερικό εξάγωνο
    const [x1, y1] = nodes[i], [x2, y2] = nodes[(i + 1) % 6];
    wire(CX, CY, x1, y1, 3, 0.85);
    wire(x1, y1, x2, y2, 3.4, 0.9);
  }
  wire(nodes[0][0], nodes[0][1], nodes[2][0], nodes[2][1], 1.6, 0.4);   // «λάθος» διαγώνιοι — οργανικός ιστός
  wire(nodes[1][0], nodes[1][1], nodes[4][0], nodes[4][1], 1.6, 0.4);
  // VENOM ΣΤΑΓΟΝΕΣ πάνω στα νήματα
  for (let i = 0; i < 9; i++) {
    const n1 = nodes[i % 6], n2 = nodes[(i + 1) % 6];
    const t = 0.25 + rnd() * 0.5;
    const x = n1[0] + (n2[0] - n1[0]) * t, y = n1[1] + (n2[1] - n1[1]) * t;
    orb(ctx, x, y, 9 + rnd() * 7, '#f2ffe6', rgba(pal.glow, 0.6), { alpha: 0.85 });
  }
  // KUNAI ΚΟΜΒΟΙ: 6 καρφωμένα kunai στις γωνίες (toxin kunai identity)
  for (const [nx, ny, a] of nodes) {
    ctx.save(); ctx.translate(nx, ny); ctx.rotate(a + Math.PI / 2);
    // λεπίδα προς τα έξω
    ctx.fillStyle = metalGrad(ctx, -14, 0, 14, 0, '#5c6e62', '#c9d8c4', '#22301f');
    ctx.beginPath();
    ctx.moveTo(0, 58); ctx.lineTo(15, 8); ctx.lineTo(6, -6); ctx.lineTo(-6, -6); ctx.lineTo(-15, 8);
    ctx.closePath(); ctx.fill();
    rim(ctx, c => { c.beginPath(); c.moveTo(0, 58); c.lineTo(15, 8); c.stroke(); }, '#eaffe0', { width: 1.8, alpha: 0.8 });
    // λαβή με κρίκο
    ctx.fillStyle = '#1e2c1a';
    ctx.beginPath(); ctx.roundRect(-5, -46, 10, 42, 4); ctx.fill();
    ctx.strokeStyle = '#8aff3b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, -56, 10, 0, Math.PI * 2); ctx.stroke();
    // venom στάξιμο από τη μύτη
    orb(ctx, 0, 64, 8, '#f2ffe6', rgba(pal.glow, 0.7), { alpha: 0.9 });
    ctx.restore();
  }
  // ΚΕΝΤΡΟ: black-widow emblem — σκοτεινή σφαίρα με πράσινη κλεψύδρα
  ctx.save();
  const cg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 96);
  cg.addColorStop(0, '#101c0c'); cg.addColorStop(0.72, '#0a1406'); cg.addColorStop(1, 'rgba(10,20,6,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(CX, CY, 96, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = pal.glow; ctx.shadowColor = pal.glow; ctx.shadowBlur = 20;
  ctx.beginPath();                                    // κλεψύδρα
  ctx.moveTo(CX - 26, CY - 44); ctx.lineTo(CX + 26, CY - 44); ctx.lineTo(CX + 6, CY);
  ctx.lineTo(CX + 26, CY + 44); ctx.lineTo(CX - 26, CY + 44); ctx.lineTo(CX - 6, CY);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  energyRing(ctx, CX, CY, 74, pal.glow, { width: 3.5, alpha: 0.9, blur: 12, dash: [14, 10] });
  // 8 λεπτά πόδια-γραμμές γύρω από το κέντρο (αραχνοειδής υπαινιγμός)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const x1 = CX + Math.cos(a) * 78, y1 = CY + Math.sin(a) * 78;
    const x2 = CX + Math.cos(a + 0.35) * 132, y2 = CY + Math.sin(a + 0.35) * 132;
    wire(x1, y1, x2, y2, 2.2, 0.65);
  }
  embers(ctx, CX, CY, 330, 20, pal.glow, rnd, { size: [1.2, 3] });
  sparkle(ctx, nodes[0][0], nodes[0][1] - 70, 36, '#f2ffe6', { alpha: 0.8 });
  save(id, canvas);
}

// ── 14 PHANTOM NEEDLE PROTOCOL — 3 null-βελόνες συγκλίνουν σε tracking sigil + drone
function drawPhantomNeedleProtocol(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  // TRACKING SIGIL: ΜΕΓΑΛΟΣ αρχαϊκός στόχος κάτω-δεξιά (το σημείο ταυτόχρονης εκτέλεσης)
  const tx = CX + 150, ty = CY + 170;
  ctx.save(); ctx.translate(tx, ty);
  energyRing(ctx, 0, 0, 218, pal.glow, { width: 6, alpha: 0.9, blur: 20 });
  energyRing(ctx, 0, 0, 170, rgba(pal.core, 0.9), { width: 3, alpha: 0.8, dash: [22, 14] });
  energyRing(ctx, 0, 0, 88, pal.glow, { width: 4, alpha: 0.9, blur: 12 });
  // αιχμηρά γεωμετρικά χαράγματα στον δακτύλιο (ρόμβοι — όχι γράμματα)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.save(); ctx.translate(Math.cos(a) * 194, Math.sin(a) * 194); ctx.rotate(a + Math.PI / 2);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(pal.core, 0.9);
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(7, 0); ctx.lineTo(0, 12); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.restore();
  }
  // σταυρόνημα
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(pal.glow, 0.85); ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(-66, 0); ctx.lineTo(66, 0); ctx.moveTo(0, -66); ctx.lineTo(0, 66); ctx.stroke();
  ctx.restore();
  orb(ctx, 0, 0, 34, '#ffffff', rgba(pal.glow, 0.6));
  ctx.restore();
  // ΟΙ 3 ΒΕΛΟΝΕΣ: μακριές null-βελόνες σε σχηματισμό, συγκλίνουν στο sigil
  const needle = (nx, ny, ang, len, sc) => {
    ctx.save(); ctx.translate(nx, ny); ctx.rotate(ang);
    // phantom trail
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const tr = ctx.createLinearGradient(-len - 160, 0, -len * 0.3, 0);
    tr.addColorStop(0, rgba(pal.glow, 0)); tr.addColorStop(1, rgba(pal.glow, 0.5));
    ctx.strokeStyle = tr; ctx.lineWidth = 16 * sc; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-len - 160, 0); ctx.lineTo(-len * 0.3, 0); ctx.stroke();
    ctx.restore();
    // σώμα βελόνας: μακρύ, λεπτό, με σκοτεινό μέταλλο και φωτεινή ραφή
    ctx.fillStyle = metalGrad(ctx, 0, -10 * sc, 0, 10 * sc, '#3c2c56', '#8a70b8', '#160e26');
    ctx.beginPath();
    ctx.moveTo(len, 0);                              // αιχμή
    ctx.lineTo(len * 0.4, -9 * sc);
    ctx.lineTo(-len * 0.62, -6 * sc);
    ctx.lineTo(-len * 0.78, -16 * sc);               // πτερύγιο ουράς
    ctx.lineTo(-len * 0.7, 0);
    ctx.lineTo(-len * 0.78, 16 * sc);
    ctx.lineTo(-len * 0.62, 6 * sc);
    ctx.lineTo(len * 0.4, 9 * sc);
    ctx.closePath(); ctx.fill();
    // null ραφή
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createLinearGradient(-len * 0.6, 0, len, 0);
    sg.addColorStop(0, rgba(pal.glow, 0.2)); sg.addColorStop(1, '#ffffff');
    ctx.strokeStyle = sg; ctx.lineWidth = 4 * sc; ctx.lineCap = 'round';
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(-len * 0.6, 0); ctx.lineTo(len * 0.92, 0); ctx.stroke();
    ctx.restore();
    sparkle(ctx, len, 0, 30 * sc, '#f4ecff', { alpha: 0.9 });
    ctx.restore();
  };
  // Οι 3 βελόνες ΣΥΓΚΛΙΝΟΥΝ πάνω στο sigil — η αιχμή κάθε μίας ακουμπά τον στόχο
  const aimAt = (sxx, syy, dist, len, sc) => {
    const ang = Math.atan2(ty - syy, tx - sxx);
    const nx = tx - Math.cos(ang) * dist, ny = ty - Math.sin(ang) * dist;
    needle(nx, ny, ang, len, sc);
  };
  aimAt(CX - 420, CY - 420, 300, 270, 1.25);          // κύρια από πάνω-αριστερά
  aimAt(CX - 520, CY + 40, 330, 220, 1.0);
  aimAt(CX + 60, CY - 520, 320, 210, 0.95);
  // STEALTH DRONE: αχνή σφήνα-σιλουέτα πάνω-αριστερά (blacknet identity)
  ctx.save();
  ctx.translate(CX - 330, CY - 300); ctx.rotate(0.5);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#1a1030';
  ctx.beginPath();
  ctx.moveTo(60, 0); ctx.lineTo(-30, -38); ctx.lineTo(-12, 0); ctx.lineTo(-30, 38);
  ctx.closePath(); ctx.fill();
  rim(ctx, c => { c.beginPath(); c.moveTo(60, 0); c.lineTo(-30, -38); c.stroke(); }, pal.glow, { width: 2, alpha: 0.7 });
  orb(ctx, 6, 0, 10, '#ffffff', rgba(pal.glow, 0.8), { alpha: 0.9 });
  ctx.restore();
  // poison chains: τόξα δηλητηρίου γύρω από το sigil (chain identity)
  lightning(ctx, tx - 150, ty, tx - 250, ty - 60, { rnd, jag: 12, width: 3, color: '#b9ff6b' });
  lightning(ctx, tx + 20, ty + 150, tx + 90, ty + 250, { rnd, jag: 12, width: 3, color: '#b9ff6b' });
  embers(ctx, tx, ty, 190, 16, pal.glow, rnd, { size: [1.5, 3.5] });
  save(id, canvas);
}

// ── 15 DIE OF FATES — κβαντικό πολυεδρικό ζάρι που κυλά με 4 όψεις-μοίρες
function drawDieOfFates(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  // ΤΡΟΧΙΑ ΚΥΛΙΣΗΣ: αψίδα-ίχνος πίσω από το ζάρι
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const arc = ctx.createLinearGradient(CX - 420, CY + 220, CX + 200, CY - 80);
  arc.addColorStop(0, rgba(pal.glow, 0)); arc.addColorStop(1, rgba(pal.glow, 0.55));
  ctx.strokeStyle = arc; ctx.lineWidth = 30; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(CX - 420, CY + 260); ctx.quadraticCurveTo(CX - 200, CY - 130, CX + 60, CY - 40); ctx.stroke();
  ctx.restore();
  // αφήνει πίσω phase-αντίγραφα (ghost dice)
  const dieShape = (cx, cy, R, rot, alpha, detailed) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    // εξάγωνη silhouette (προβολή εικοσάεδρου)
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      pts.push([Math.cos(a) * R, Math.sin(a) * R]);
    }
    ctx.fillStyle = detailed ? metalGrad(ctx, -R, -R, R, R, '#0e3a34', '#1e6e60', '#04140f') : rgba(pal.glow, 0.25);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.closePath(); ctx.fill();
    if (detailed) {
      ctx.strokeStyle = rgba(pal.glow, 0.95); ctx.lineWidth = 4;
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 14;
      ctx.stroke();
      // εσωτερικές έδρες: κεντρικό τρίγωνο + ακτίνες προς κορυφές
      const tri = [pts[0], pts[2], pts[4]];
      ctx.strokeStyle = rgba(pal.glow, 0.8); ctx.lineWidth = 3; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(tri[0][0], tri[0][1]);
      ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]); ctx.closePath(); ctx.stroke();
      for (const [x, y] of [pts[1], pts[3], pts[5]]) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x, y); ctx.stroke();
      }
      // φωτεινές κορυφές
      for (const [x, y] of pts) orb(ctx, x, y, 12, '#ffffff', rgba(pal.glow, 0.7), { alpha: 0.9 });
    }
    ctx.restore();
  };
  dieShape(CX - 330, CY + 180, 120, 0.5, 0.16, false);   // ghosts
  dieShape(CX - 170, CY + 20, 150, 0.9, 0.24, false);
  // ΤΟ ΖΑΡΙ: μεγάλο, μπροστά κάτω-δεξιά
  const dx = CX + 130, dy = CY + 90, R = 250;
  dieShape(dx, dy, R, 0.18, 1, true);
  // 4 ΟΨΕΙΣ-ΜΟΙΡΕΣ πάνω στις έδρες: βελόνα / rift / λόγχη / κλεψύδρα (slow)
  const face = (fx, fy, k) => {
    ctx.save(); ctx.translate(dx + fx, dy + fy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#d9fff6'; ctx.fillStyle = '#d9fff6';
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
    if (k === 0) {              // βελόνα
      ctx.beginPath(); ctx.moveTo(-26, 22); ctx.lineTo(26, -22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(26, -22); ctx.lineTo(10, -20); ctx.moveTo(26, -22); ctx.lineTo(24, -6); ctx.stroke();
    } else if (k === 1) {       // rift: οφθαλμός-σχισμή
      ctx.beginPath(); ctx.moveTo(-28, 0); ctx.quadraticCurveTo(0, -26, 28, 0); ctx.quadraticCurveTo(0, 26, -28, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    } else if (k === 2) {       // λόγχη: τρίαινα-βέλος
      ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(0, -22); ctx.moveTo(-14, -8); ctx.lineTo(0, -24); ctx.lineTo(14, -8); ctx.stroke();
    } else {                    // κλεψύδρα (time-slow)
      ctx.beginPath(); ctx.moveTo(-16, -20); ctx.lineTo(16, -20); ctx.lineTo(-16, 20); ctx.lineTo(16, 20); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  };
  face(0, -R * 0.52, 0); face(-R * 0.5, R * 0.28, 1); face(R * 0.5, R * 0.28, 2); face(0, R * 0.02, 3);
  // phase σπίθες + λάμψη πρόσκρουσης στο έδαφος
  embers(ctx, dx, dy, R + 60, 26, pal.glow, rnd);
  ctx.save(); ctx.translate(dx, dy + R * 0.94); ctx.scale(1, 0.3);
  energyRing(ctx, 0, 0, 150, pal.glow, { width: 8, alpha: 0.7, blur: 20 });
  ctx.restore();
  sparkle(ctx, dx + R * 0.62, dy - R * 0.62, 46, '#e6fbff');
  save(id, canvas);
}

// ── 16 EVENT HORIZON ROULETTE — κεκλιμένος τροχός-ρουλέτα από phase orbs + payout δίσκος
function drawEventHorizonRoulette(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  const cy = CY + 60, tilt = 0.42;                    // προοπτική
  const rimR = 330;
  const P = (a, r) => [CX + Math.cos(a) * r, cy + Math.sin(a) * r * tilt];
  // ΣΤΕΦΑΝΗ: διπλός μεταλλικός δακτύλιος με pockets
  for (const [rr, w, colL] of [[rimR, 26, '#8a4a72'], [rimR - 56, 12, '#5e2e4e']]) {
    ctx.save();
    ctx.strokeStyle = metalGrad(ctx, CX - rr, cy, CX + rr, cy, '#4a1e3c', colL, '#1c0a16');
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.ellipse(CX, cy, rr, rr * tilt, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  rim(ctx, c => { c.beginPath(); c.ellipse(CX, cy, rimR + 14, (rimR + 14) * tilt, 0, Math.PI * 0.95, Math.PI * 2.05); c.stroke(); }, pal.glow, { width: 3, alpha: 0.8, blur: 12 });
  // ακτίνες τροχού
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const [x1, y1] = P(a, rimR - 62), [x2, y2] = P(a, 96);
    ctx.strokeStyle = rgba('#8a4a72', 0.75); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // PHASE ORBS στα pockets (10) — εναλλάξ χρώματα ρουλέτας
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const [x, y] = P(a, rimR - 28);
    const back = Math.sin(a) < 0;
    const col = i % 2 ? pal.glow : '#ffd447';
    orb(ctx, x, y, back ? 17 : 24, '#ffffff', rgba(col, 0.65), { alpha: back ? 0.65 : 1 });
    if (!back) energyRing(ctx, x, y, 30, col, { width: 2.5, alpha: 0.8, blur: 8 });
  }
  // ΒΑΡΥΤΙΚΟ ΚΕΝΤΡΟ: σκοτεινός κώνος-χοάνη
  ctx.save();
  const wellG = ctx.createRadialGradient(CX, cy, 0, CX, cy, 120);
  wellG.addColorStop(0, '#050008'); wellG.addColorStop(0.7, '#180820'); wellG.addColorStop(1, 'rgba(24,8,32,0)');
  ctx.fillStyle = wellG;
  ctx.beginPath(); ctx.ellipse(CX, cy, 120, 120 * tilt + 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  gravitySwirl(ctx, CX, cy, 92, pal.glow, rnd, { arms: 4, turns: 1.6, width: 3, alpha: 0.75, darkCore: false });
  energyRing(ctx, CX, cy, 52, pal.glow, { width: 3, alpha: 0.9, blur: 10, dash: [10, 8] });
  // ΚΕΝΤΡΙΚΟΣ ΑΞΟΝΑΣ-ΤΟΥΡΕΛΑ πάνω από τη χοάνη
  ctx.fillStyle = metalGrad(ctx, CX - 30, cy - 120, CX + 30, cy, '#4a1e3c', '#a86a92', '#1c0a16');
  ctx.beginPath();
  ctx.moveTo(CX - 26, cy - 6); ctx.lineTo(CX - 12, cy - 132); ctx.lineTo(CX + 12, cy - 132); ctx.lineTo(CX + 26, cy - 6);
  ctx.closePath(); ctx.fill();
  orb(ctx, CX, cy - 148, 30, '#ffffff', rgba(pal.glow, 0.7));
  energyRing(ctx, CX, cy - 148, 20, pal.glow, { width: 3, alpha: 0.95 });
  // PAYOUT: ένας δίσκος εκτοξεύεται εφαπτομενικά με ricochet trail
  const [px, py] = P(5.6, rimR - 28);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const tr = ctx.createLinearGradient(px, py, px + 240, py - 210);
  tr.addColorStop(0, rgba(pal.glow, 0.8)); tr.addColorStop(1, rgba(pal.glow, 0));
  ctx.strokeStyle = tr; ctx.lineWidth = 18; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 150, py - 130); ctx.lineTo(px + 260, py - 150); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.translate(px + 260, py - 155); ctx.rotate(0.4);
  ctx.fillStyle = metalGrad(ctx, -34, 0, 34, 0, '#8a2a66', '#ff5ad0', '#3a0e2c');
  ctx.beginPath(); ctx.ellipse(0, 0, 36, 14, 0, 0, Math.PI * 2); ctx.fill();
  rim(ctx, c => { c.beginPath(); c.ellipse(0, 0, 36, 14, 0, 0, Math.PI * 2); c.stroke(); }, '#ffffff', { width: 2, alpha: 0.9 });
  orb(ctx, 0, 0, 12, '#ffffff', rgba(pal.glow, 0.8));
  ctx.restore();
  // τόξα ιόντων τροχός↔δίσκος
  lightning(ctx, px + 40, py - 30, px + 200, py - 140, { rnd, jag: 16, width: 3.5, color: pal.glow });
  embers(ctx, CX, cy, rimR, 26, pal.glow, rnd, { size: [1.4, 3.4] });
  sparkle(ctx, CX - rimR * 0.7, cy - rimR * 0.28, 38, '#fff0fa', { alpha: 0.8 });
  save(id, canvas);
}

// ── 17 WALL OF SOUND — δίδυμοι πύργοι-ενισχυτές + κόκκινο lightning solo + κύματα πίεσης
function drawWallOfSound(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  const towerX = [CX - 210, CX + 210], towerW = 240, towerTop = CY - 300, towerBot = CY + 320;
  // ΚΥΜΑΤΑ ΠΙΕΣΗΣ μπροστά (κάτω) — τόξα που απλώνονται
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 4; k++) {
    ctx.strokeStyle = rgba(pal.glow, 0.55 - k * 0.12);
    ctx.lineWidth = 12 - k * 2.4;
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.ellipse(CX, towerBot + 40, 240 + k * 96, 44 + k * 18, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
  }
  ctx.restore();
  // ΠΥΡΓΟΙ: 2 στοίβες με 3 καμπίνες η καθεμιά
  for (const tx0 of towerX) {
    for (let row = 0; row < 3; row++) {
      const y0 = towerTop + row * 210, hh = 196;
      // καμπίνα
      ctx.fillStyle = metalGrad(ctx, tx0 - towerW / 2, y0, tx0 + towerW / 2, y0 + hh, '#2c0f14', '#5a2028', '#12060a');
      ctx.beginPath(); ctx.roundRect(tx0 - towerW / 2, y0, towerW, hh, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(8,2,4,0.9)'; ctx.lineWidth = 4; ctx.stroke();
      rim(ctx, c => { c.beginPath(); c.roundRect(tx0 - towerW / 2 + 5, y0 + 5, towerW - 10, hh - 10, 10); c.stroke(); }, rgba(pal.glow, 0.5), { width: 1.6, alpha: 0.7, blur: 6 });
      // κώνος ηχείου
      const scx = tx0, scy = y0 + hh / 2, sr = 74;
      ctx.fillStyle = metalGrad(ctx, scx - sr, scy, scx + sr, scy, '#1c0a0e', '#43161c', '#0a0406');
      ctx.beginPath(); ctx.arc(scx, scy, sr, 0, Math.PI * 2); ctx.fill();
      const coneG = ctx.createRadialGradient(scx, scy, 4, scx, scy, sr * 0.82);
      coneG.addColorStop(0, '#6e2830'); coneG.addColorStop(0.75, '#20080c'); coneG.addColorStop(1, '#3c1218');
      ctx.fillStyle = coneG;
      ctx.beginPath(); ctx.arc(scx, scy, sr * 0.82, 0, Math.PI * 2); ctx.fill();
      // κόκκινος παλμός στον κώνο
      energyRing(ctx, scx, scy, sr * 0.5, pal.glow, { width: 4, alpha: 0.85, blur: 14 });
      orb(ctx, scx, scy, sr * 0.24, '#ffdada', rgba(pal.glow, 0.7));
      // μπουλόνια
      for (const [bx, by] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.fillStyle = '#7a3a42';
        ctx.beginPath(); ctx.arc(tx0 + bx * (towerW / 2 - 18), y0 + hh / 2 + by * (hh / 2 - 18), 6, 0, Math.PI * 2); ctx.fill();
      }
    }
    // κολώνα βάσης
    ctx.fillStyle = '#12060a';
    ctx.beginPath(); ctx.roundRect(tx0 - towerW / 2 - 14, towerBot - 12, towerW + 28, 34, 8); ctx.fill();
  }
  // ΚΟΚΚΙΝΟ LIGHTNING SOLO: γέφυρα ανάμεσα στις κορυφές (solo red thunder identity)
  lightning(ctx, towerX[0], towerTop - 18, towerX[1], towerTop - 18, { rnd, seg: 13, jag: 44, width: 7, color: pal.glow, core: '#fff0f0' });
  lightning(ctx, towerX[0] + 30, towerTop + 6, towerX[1] - 30, towerTop - 2, { rnd, seg: 11, jag: 30, width: 4, color: pal.glow, core: '#ffdada' });
  // κεραίες-ion στις κορυφές (ion halo identity)
  for (const tx0 of towerX) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = pal.glow; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(tx0, towerTop); ctx.lineTo(tx0, towerTop - 52); ctx.stroke();
    ctx.restore();
    orb(ctx, tx0, towerTop - 64, 22, '#ffffff', rgba(pal.glow, 0.7));
    energyRing(ctx, tx0, towerTop - 64, 33, pal.glow, { width: 3, alpha: 0.9, blur: 10 });
  }
  // δίχτυ ενέργειας ανάμεσα στους πύργους (ion bridge)
  for (let i = 1; i < 4; i++) {
    const y = towerTop + i * 150;
    lightning(ctx, towerX[0] + towerW / 2, y, towerX[1] - towerW / 2, y + (rnd() * 40 - 20), { rnd, jag: 18, width: 2.5, color: mix(pal.glow, '#ffffff', 0.2) });
  }
  embers(ctx, CX, CY, 360, 30, pal.glow, rnd, { size: [1.4, 3.6] });
  sparkle(ctx, CX, towerTop - 30, 44, '#ffe6e6');
  save(id, canvas);
}

// ── 18 BASS SINGULARITY — υπογούφερ-μαύρη τρύπα με δίσκο προσαύξησης + roadie drones
function drawBassSingularity(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  const R = 300;
  // ΚΑΜΠΙΝΑ: οκτάγωνο κέλυφος γύρω από τον γούφερ
  ctx.save(); ctx.translate(CX, CY);
  ctx.fillStyle = metalGrad(ctx, -R, -R, R, R, '#0e1430', '#28356e', '#050818');
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * (R + 40), y = Math.sin(a) * (R + 40);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(4,6,18,0.9)'; ctx.lineWidth = 6; ctx.stroke();
  rim(ctx, c => {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * (R + 30), y = Math.sin(a) * (R + 30);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.closePath(); c.stroke();
  }, rgba(pal.glow, 0.6), { width: 2, alpha: 0.8, blur: 8 });
  // μπουλόνια στις γωνίες
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
    ctx.fillStyle = '#3c4a8a';
    ctx.beginPath(); ctx.arc(Math.cos(a) * (R + 14), Math.sin(a) * (R + 14), 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Ο ΓΟΥΦΕΡ-ΟΡΙΖΟΝΤΑΣ: ομόκεντροι κώνοι που βυθίζονται σε μαύρο κέντρο
  for (let k = 0; k < 5; k++) {
    const rr = R - k * 52;
    const g = ctx.createRadialGradient(CX, CY, rr * 0.55, CX, CY, rr);
    g.addColorStop(0, `rgba(${8 + k * 6},${10 + k * 8},${30 + k * 14},1)`);
    g.addColorStop(1, `rgba(${20 + k * 10},${28 + k * 12},${70 + k * 20},1)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CX, CY, rr, 0, Math.PI * 2); ctx.fill();
    // φωτεινό χείλος κάθε κώνου (bending light)
    energyRing(ctx, CX, CY, rr, mix(pal.glow, '#ffffff', k * 0.12), { width: 3.5 - k * 0.4, alpha: 0.5 + k * 0.08, blur: 12 });
  }
  // δίσκος προσαύξησης: φωτεινός κεκλιμένος δακτύλιος γύρω από το κέντρο
  ctx.save(); ctx.translate(CX, CY); ctx.rotate(-0.34); ctx.scale(1, 0.32);
  energyRing(ctx, 0, 0, 175, '#9db4ff', { width: 16, alpha: 0.95, blur: 30 });
  energyRing(ctx, 0, 0, 210, rgba(pal.glow, 0.6), { width: 6, alpha: 0.7, blur: 16 });
  ctx.restore();
  // ΜΑΥΡΗ ΤΡΥΠΑ: πυρήνας
  ctx.save();
  const bh = ctx.createRadialGradient(CX, CY, 0, CX, CY, 96);
  bh.addColorStop(0, '#000004'); bh.addColorStop(0.8, '#02020c'); bh.addColorStop(1, 'rgba(2,2,12,0)');
  ctx.fillStyle = bh;
  ctx.beginPath(); ctx.arc(CX, CY, 96, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  energyRing(ctx, CX, CY, 74, '#ffffff', { width: 3, alpha: 0.95, blur: 18 });
  // ΚΥΜΑ DROP: παλμός-δακτύλιος που φεύγει προς τα έξω κάτω
  ctx.save(); ctx.translate(CX, CY + 330); ctx.scale(1, 0.3);
  for (let k = 0; k < 2; k++) energyRing(ctx, 0, 0, 220 + k * 90, pal.glow, { width: 10 - k * 4, alpha: 0.6 - k * 0.2, blur: 18 });
  ctx.restore();
  // ROADIE DRONES: 2 μικρά ιπτάμενα ηχεία με πτερύγια, εκατέρωθεν
  const roadie = (rx, ry, s) => {
    ctx.save(); ctx.translate(rx, ry); ctx.scale(s, s); ctx.rotate(s > 0 ? 0.12 : -0.12);
    ctx.fillStyle = metalGrad(ctx, -60, 0, 60, 0, '#141c3c', '#33427e', '#080c1e');
    ctx.beginPath(); ctx.roundRect(-58, -48, 116, 96, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(4,6,18,0.9)'; ctx.lineWidth = 3; ctx.stroke();
    // κώνος
    const cg = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    cg.addColorStop(0, '#9db4ff'); cg.addColorStop(0.5, '#1a2450'); cg.addColorStop(1, '#0a0f28');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    energyRing(ctx, 0, 0, 20, pal.glow, { width: 2.5, alpha: 0.9, blur: 8 });
    // πτερύγια-thrusters
    for (const sd of [-1, 1]) {
      ctx.fillStyle = '#0c1230';
      ctx.beginPath(); ctx.moveTo(sd * 56, -20); ctx.lineTo(sd * 92, -44); ctx.lineTo(sd * 78, -6); ctx.closePath(); ctx.fill();
      rim(ctx, c => { c.beginPath(); c.moveTo(sd * 56, -20); c.lineTo(sd * 92, -44); c.stroke(); }, pal.glow, { width: 1.6, alpha: 0.8 });
    }
    orb(ctx, 0, 58, 12, '#ffffff', rgba(pal.glow, 0.7), { alpha: 0.8 });   // thruster κάτω
    ctx.restore();
  };
  roadie(CX - 385, CY - 190, 1);
  roadie(CX + 385, CY - 150, -1);
  // παλμοί από τα roadies
  ctx.save(); ctx.translate(CX - 385, CY - 190);
  energyRing(ctx, 0, 0, 84, pal.glow, { width: 3, alpha: 0.5, blur: 10 });
  ctx.restore();
  ctx.save(); ctx.translate(CX + 385, CY - 150);
  energyRing(ctx, 0, 0, 84, pal.glow, { width: 3, alpha: 0.5, blur: 10 });
  ctx.restore();
  embers(ctx, CX, CY, 340, 24, '#9db4ff', rnd, { size: [1.2, 3] });
  sparkle(ctx, CX + 205, CY - 205, 40, '#e6ecff');
  save(id, canvas);
}

// ── 19 THOUSAND FIST VERDICT — διάδρομος ολογραφικών γροθιών σε προοπτική + null φινάλε
function drawThousandFistVerdict(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  // NULL ΦΙΝΑΛΕ στο βάθος του διαδρόμου (πάνω-δεξιά): κάθετη λόγχη-έκρηξη
  const vx = CX + 250, vy = CY - 230;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const vg = ctx.createLinearGradient(vx, vy + 160, vx, vy - 200);
  vg.addColorStop(0, rgba('#b48cff', 0.1)); vg.addColorStop(0.7, rgba('#b48cff', 0.8)); vg.addColorStop(1, '#ffffff');
  ctx.strokeStyle = vg; ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.shadowColor = '#b48cff'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.moveTo(vx, vy + 170); ctx.lineTo(vx, vy - 190); ctx.stroke();
  ctx.restore();
  sparkle(ctx, vx, vy - 196, 56, '#f0e6ff');
  energyRing(ctx, vx, vy + 60, 90, '#b48cff', { width: 5, alpha: 0.7, blur: 16 });
  // ΔΙΑΔΡΟΜΟΣ ΓΡΟΘΙΩΝ: 4 holo γροθιές σε προοπτική από κάτω-αριστερά προς το φινάλε
  const fist = (fx, fy, sc, rot, alpha) => {
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(rot); ctx.scale(sc, sc);
    ctx.globalAlpha = alpha;
    // hologram στυλ: ημιδιαφανές σώμα + φωτεινές ακμές + scanlines
    const bodyFill = rgba(pal.glow, 0.22);
    const edge = mix(pal.glow, '#ffffff', 0.35);
    const path = () => {
      ctx.beginPath();
      // αντιβράχιο (πίσω-αριστερά) → γροθιά (μπροστά-δεξιά)
      ctx.moveTo(-190, -34);
      ctx.lineTo(-40, -58);
      ctx.quadraticCurveTo(30, -78, 86, -64);        // ράχη παλάμης
      ctx.quadraticCurveTo(130, -50, 128, -6);       // κόνδυλοι πάνω
      ctx.lineTo(126, 40);
      ctx.quadraticCurveTo(120, 74, 74, 78);         // κάτω γροθιά
      ctx.lineTo(-42, 66);
      ctx.lineTo(-190, 40);
      ctx.closePath();
    };
    ctx.fillStyle = bodyFill; path(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = edge; ctx.lineWidth = 5; ctx.shadowColor = pal.glow; ctx.shadowBlur = 18;
    path(); ctx.stroke();
    ctx.restore();
    // δάχτυλα: 3 φωτεινές εγκοπές
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(edge, 0.9); ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = -44 + i * 38;
      ctx.beginPath(); ctx.moveTo(128, y); ctx.lineTo(64, y + 8); ctx.stroke();
    }
    // αντίχειρας
    ctx.beginPath(); ctx.moveTo(6, 52); ctx.quadraticCurveTo(46, 66, 92, 52); ctx.stroke();
    // scanlines
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = rgba('#ffffff', 0.35); ctx.lineWidth = 1.5;
    for (let y = -66; y < 80; y += 13) { ctx.beginPath(); ctx.moveTo(-186, y); ctx.lineTo(126, y); ctx.stroke(); }
    ctx.restore();
    // impact flash στους κονδύλους
    orb(ctx, 134, 6, 42, '#fffbe6', rgba(pal.glow, 0.6), { alpha: 0.9 });
    ctx.restore();
  };
  fist(CX - 300, CY + 290, 0.62, -0.5, 0.5);
  fist(CX - 120, CY + 130, 0.86, -0.48, 0.72);
  fist(CX + 90, CY - 50, 1.12, -0.46, 1);
  // sanction sigils που πλέουν στον διάδρομο (mark identity)
  const sigil = (sx, sy, r, alpha) => {
    // Sanction Mark: ρόμβος με κάθετη σχισμή + ακτίνες — ΚΑΝΕΝΑ σχήμα γράμματος
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
    energyRing(ctx, sx, sy, r, '#ffd447', { width: 3, alpha: 0.9, blur: 10 });
    ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.shadowColor = '#ffd447'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(sx, sy - r * 0.6); ctx.lineTo(sx + r * 0.48, sy); ctx.lineTo(sx, sy + r * 0.6);
    ctx.lineTo(sx - r * 0.48, sy); ctx.closePath();
    ctx.moveTo(sx, sy - r * 0.26); ctx.lineTo(sx, sy + r * 0.26);
    ctx.stroke();
    for (const a of [0.6, 2.2, 4.0, 5.4]) {          // μικρές ακτίνες γύρω
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * r * 1.06, sy + Math.sin(a) * r * 1.06);
      ctx.lineTo(sx + Math.cos(a) * r * 1.34, sy + Math.sin(a) * r * 1.34);
      ctx.stroke();
    }
    ctx.restore();
  };
  sigil(CX - 330, CY - 60, 44, 0.8);
  sigil(CX - 90, CY - 240, 34, 0.65);
  sigil(CX + 60, CY + 250, 38, 0.7);
  // χρυσή σκόνη διαδρόμου
  embers(ctx, CX, CY, 380, 30, '#ffd447', rnd, { size: [1.4, 3.4] });
  save(id, canvas);
}

// ── 20 AEGIS OF JUDGEMENT — ολογραφικός φρουρός-κλοιός: γάντι-ασπίδα + εξάγωνα + τόξα
function drawAegisOfJudgement(id) {
  const { canvas, ctx, rnd, pal } = begin(id);
  // ΚΛΟΙΟΣ: δακτύλιος από holo εξάγωνα γύρω από το κέντρο
  const hexRing = (RR, n, sc, alpha) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.16;
      const x = CX + Math.cos(a) * RR, y = CY + Math.sin(a) * RR * 0.94;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.globalAlpha = alpha * (Math.sin(a) > 0 ? 1 : 0.6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = pal.glow; ctx.lineWidth = 3.5;
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 12;
      ctx.fillStyle = rgba(pal.glow, 0.13);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const b = (k / 6) * Math.PI * 2 + Math.PI / 6;
        const hx = Math.cos(b) * 44 * sc, hy = Math.sin(b) * 44 * sc;
        k === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  };
  hexRing(348, 10, 1.0, 0.8);
  hexRing(258, 8, 0.72, 0.5);
  // περιστροφικά ίχνη
  ctx.save(); ctx.translate(CX, CY); ctx.scale(1, 0.94);
  energyRing(ctx, 0, 0, 302, rgba(pal.glow, 0.55), { width: 3, alpha: 0.7, blur: 10, dash: [10, 26] });
  ctx.restore();
  // ΚΕΝΤΡΙΚΟ HOLO ΓΑΝΤΙ-ΑΣΠΙΔΑ: αντιβράχιο κάθετο σε στάση block
  ctx.save();
  ctx.translate(CX, CY + 30); ctx.rotate(-0.06);
  const edge = mix(pal.glow, '#ffffff', 0.3);
  const guard = () => {
    ctx.beginPath();
    // γροθιά πάνω
    ctx.moveTo(-66, -290);
    ctx.quadraticCurveTo(-20, -336, 44, -318);
    ctx.quadraticCurveTo(96, -300, 92, -238);
    ctx.lineTo(88, -180);
    // αντιβράχιο κάθετο
    ctx.quadraticCurveTo(92, -60, 78, 130);
    ctx.quadraticCurveTo(70, 220, 30, 262);          // καρπός-βάση
    ctx.lineTo(-52, 262);
    ctx.quadraticCurveTo(-92, 210, -86, 60);
    ctx.quadraticCurveTo(-82, -120, -70, -232);
    ctx.closePath();
  };
  ctx.fillStyle = rgba(pal.glow, 0.2);
  guard(); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = edge; ctx.lineWidth = 6; ctx.shadowColor = pal.glow; ctx.shadowBlur = 22;
  guard(); ctx.stroke();
  ctx.restore();
  // δάχτυλα γροθιάς
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(edge, 0.95); ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x = -44 + i * 40;
    ctx.beginPath(); ctx.moveTo(x, -318); ctx.lineTo(x + 6, -252); ctx.stroke();
  }
  // scanlines στο αντιβράχιο
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = rgba('#ffffff', 0.4); ctx.lineWidth = 1.5;
  for (let y = -300; y < 260; y += 16) { ctx.beginPath(); ctx.moveTo(-84, y); ctx.lineTo(90, y); ctx.stroke(); }
  ctx.restore();
  // φορτίο αντεπίθεσης: αλυσίδα ενεργειακών κόμβων-ρόμβων κατά μήκος του αντιβραχίου
  // (διηγητικό στοιχείο του όπλου — όχι UI μπάρες)
  for (let i = 0; i < 7; i++) {
    const y = 200 - i * 62;
    const on = i < 5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = on ? rgba(pal.glow, 0.95) : rgba(pal.glow, 0.2);
    ctx.shadowColor = pal.glow; ctx.shadowBlur = on ? 16 : 0;
    ctx.beginPath();
    ctx.moveTo(0, y - 22); ctx.lineTo(20, y); ctx.lineTo(0, y + 22); ctx.lineTo(-20, y);
    ctx.closePath(); ctx.fill();
    if (on) orb(ctx, 0, y, 10, '#ffffff', rgba(pal.glow, 0.7), { alpha: 0.9 });
    ctx.restore();
  }
  ctx.restore();
  // ΒΑΡΥΤΙΚΗ ΣΥΓΚΡΑΤΗΣΗ: τόξα-αναστολείς που κρατούν εχθρικά «βέλη» σε απόσταση
  for (const a of [0.4, 1.7, 2.9, 4.1, 5.2]) {
    const x = CX + Math.cos(a) * 430, y = CY + Math.sin(a) * 410;
    // εισερχόμενο βέλος που «πάγωσε» στον κλοιό
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#8a4040';
    ctx.beginPath(); ctx.moveTo(46, 0); ctx.lineTo(-6, -12); ctx.lineTo(-6, 12); ctx.closePath(); ctx.fill();
    ctx.restore();
    // λάμψη απορρόφησης στο σημείο επαφής με τον κλοιό
    const hx = CX + Math.cos(a) * 352, hy = CY + Math.sin(a) * 334;
    orb(ctx, hx, hy, 26, '#ffffff', rgba(pal.glow, 0.6), { alpha: 0.85 });
  }
  // ion τόξα ανάμεσα σε γειτονικά εξάγωνα
  lightning(ctx, CX + 330, CY - 120, CX + 210, CY - 280, { rnd, jag: 14, width: 3, color: pal.glow });
  lightning(ctx, CX - 330, CY + 100, CX - 200, CY + 280, { rnd, jag: 14, width: 3, color: pal.glow });
  embers(ctx, CX, CY, 380, 24, pal.glow, rnd, { size: [1.3, 3.2] });
  sparkle(ctx, CX + 66, CY - 300, 40, '#e6fff7', { alpha: 0.85 });
  save(id, canvas);
}

// ── RUN ─────────────────────────────────────────────────────────────────────────
const JOBS = {
  fus_ferromag_piledriver: drawFerromagPiledriver,
  fus_scrapstorm_foundry: drawScrapstormFoundry,
  fus_widows_loom: drawWidowsLoom,
  fus_phantom_needle_protocol: drawPhantomNeedleProtocol,
  fus_die_of_fates: drawDieOfFates,
  fus_event_horizon_roulette: drawEventHorizonRoulette,
  fus_wall_of_sound: drawWallOfSound,
  fus_bass_singularity: drawBassSingularity,
  fus_thousand_fist_verdict: drawThousandFistVerdict,
  fus_aegis_of_judgement: drawAegisOfJudgement,
};
const only = process.argv[2];
for (const [id, fn] of Object.entries(JOBS)) {
  if (only && id !== only) continue;
  fn(id);
}
console.log('DONE');
