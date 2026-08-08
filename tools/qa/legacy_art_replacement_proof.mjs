// ════════════════════════════════════════════════════════════════════════════════
// QA proof — Maria legacy-art replacement batch (2026-08-08).
// Στατικά, μετρήσιμα gates πάνω στα 21 παραγόμενα PNG (χωρίς browser):
//   G1 διαστάσεις == αναμενόμενες (ο κώδικας ΔΕΝ άλλαξε συμβόλαια)
//   G2 πραγματικό RGBA alpha όπου απαιτείται transparent sprite
//   G3 ορατό περιεχόμενο (coverage) πάνω από κατώφλι ανά αρχείο
//   G4 lavabombs: 2×3 grid — και τα 6 κελιά έχουν περιεχόμενο, καθαρά όρια κελιών
//   G5 προσανατολισμοί: rocket μύτη +X (φωτεινή αιχμή δεξιά), flame κεφαλή πάνω
//   G6 marker: ορατός πυρήνας στο κέντρο (ζωγραφίζεται ΧΩΡΙΣ blend)
//   G7 καμία «σκουπιδο-άκρη»: ≤1% ορατών pixels στο εξωτερικό δαχτυλίδι 2px
//   R1 (report) παλέτες: pairwise απόσταση μέσου ορατού RGB των weapon arts
// node tools/qa/legacy_art_replacement_proof.mjs [ART_ROOT]
// ════════════════════════════════════════════════════════════════════════════════
import { createCanvas, loadImage } from 'canvas';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] || path.resolve(HERE, '../..');

const FILES = [
  // [σχετικό path, W, H, χρειάζεται alpha, ελάχιστο coverage %, μέγιστο coverage %]
  ['assets/characters/taekwondo_girl.png',                        1023, 1537, true,  8,  70],
  ['assets/ui/main_menu_trio.png',                                 940, 1230, false, 95, 100],
  ['assets/ui/vilian main menu fist theme .png',                  1537, 1023, false, 95, 100],
  ['assets/weapons/ArcThunder_Burst.png',                         1254, 1254, true, 15,  90],
  ['assets/weapons/crescent_aura.png',                            1254, 1254, true, 10,  80],
  ['assets/weapons/nexus_burst.png',                              1254, 1254, true, 10,  85],
  ['assets/nexus/nexus_burst.png',                                 256,  256, true, 10,  90],
  ['assets/weapons/biome_crystal_stream.png',                     1086, 1448, true,  8,  85],
  ['assets/weapons/lavabombs_t.png',                              1254, 1254, true, 10,  90],
  ['assets/weapons/marker_t.png',                                 1254, 1254, true,  6,  80],
  ['assets/weapons/vessel_purple_rockets.png',                    1254, 1254, true,  8,  80],
  ['assets/weapons/eddie_flame.png',                               140,  512, true, 15,  95],
  ['assets/weapons/nexus/Weapon 3 Orbital Laser Beacon Gun.png',  1254, 1254, true, 10,  90],
  ['assets/weapons/nexus/Weapon 4 Nanite Nano-Swarm Cloud.png',   1254, 1254, true, 10,  95],
  ['assets/weapons/vfx/plasma_execution_hd.png',                  1254, 1254, true, 12,  90],
  ['assets/weapons/vfx/storm_conductor_hd.png',                   1254, 1254, true, 12,  90],
  ['assets/weapons/vfx/active_override beam.png',                 1254, 1254, true, 10,  85],
  ['assets/effects/ambient/biome_eden_bloom_pulse.png',           1086, 1448, true,  6,  80],
  ['assets/effects/ambient/biome_null_void_orb.png',              1086, 1448, true,  6,  80],
  ['assets/effects/ambient/biome_solar_flare.png',                1086, 1448, true,  6,  85],
  ['assets/effects/ambient/biome_storm_spark.png',                1086, 1448, true,  6,  80],
];
// υποσύνολο για τον πίνακα παλέτας (τα «ενεργειακά» 1254² — πρέπει να διαφέρουν)
const PALETTE_SET = [
  'assets/weapons/ArcThunder_Burst.png', 'assets/weapons/crescent_aura.png',
  'assets/weapons/nexus_burst.png', 'assets/weapons/lavabombs_t.png',
  'assets/weapons/marker_t.png', 'assets/weapons/vessel_purple_rockets.png',
  'assets/weapons/nexus/Weapon 3 Orbital Laser Beacon Gun.png',
  'assets/weapons/nexus/Weapon 4 Nanite Nano-Swarm Cloud.png',
  'assets/weapons/vfx/plasma_execution_hd.png', 'assets/weapons/vfx/storm_conductor_hd.png',
  'assets/weapons/vfx/active_override beam.png',
];

let pass = 0, fail = 0;
const gate = (ok, label) => {
  console.log(`${ok ? '  ✔' : '  ✘'} ${label}`);
  ok ? pass++ : fail++;
};

async function analyze(rel) {
  const img = await loadImage(path.join(ROOT, rel));
  const cv = createCanvas(img.width, img.height);
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, img.width, img.height).data;
  return { img, d, W: img.width, H: img.height };
}
const A = (d, W, x, y) => d[(y * W + x) * 4 + 3];
const LUM = (d, W, x, y) => { const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };

const meanRGB = {};
for (const [rel, EW, EH, needsAlpha, minCov, maxCov] of FILES) {
  console.log('•', rel);
  let a;
  try { a = await analyze(rel); }
  catch (e) { gate(false, `load: ${e.message}`); continue; }
  const { d, W, H } = a;
  gate(W === EW && H === EH, `G1 διαστάσεις ${W}×${H} == ${EW}×${EH}`);
  let visible = 0, transparent = 0, edge = 0, sum = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const al = A(d, W, x, y);
    if (al === 0) transparent++;
    if (al > 24) {
      visible++;
      const i = (y * W + x) * 4;
      sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2];
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) edge++;
    }
  }
  const cov = (visible / (W * H)) * 100;
  meanRGB[rel] = visible ? sum.map(v => v / visible) : [0, 0, 0];
  if (needsAlpha) gate(transparent / (W * H) > 0.05, `G2 transparent bg (${((transparent / (W * H)) * 100).toFixed(1)}% διαφανές)`);
  gate(cov >= minCov && cov <= maxCov, `G3 coverage ${cov.toFixed(1)}% εντός [${minCov},${maxCov}]`);
  if (needsAlpha) gate(edge / Math.max(1, visible) < 0.01, `G7 καθαρές άκρες (${((edge / Math.max(1, visible)) * 100).toFixed(2)}% στο ring)`);

  if (rel.endsWith('lavabombs_t.png')) {
    const cw = W / 2, ch = H / 3;
    let allCells = true;
    for (let cell = 0; cell < 6; cell++) {
      const x0 = (cell % 2) * cw, y0 = ((cell / 2) | 0) * ch;
      let v = 0;
      for (let y = y0 + 10; y < y0 + ch - 10; y += 2) for (let x = x0 + 10; x < x0 + cw - 10; x += 2)
        if (A(d, W, x, y) > 24) v++;
      if (v / ((cw * ch) / 4) < 0.03) allCells = false;
    }
    gate(allCells, 'G4 και τα 6 κελιά 2×3 έχουν περιεχόμενο');
    let borderHits = 0, borderTot = 0;
    for (let y = 0; y < H; y++) { borderTot++; if (A(d, W, 627, y) > 24) borderHits++; }
    for (const by of [418, 836]) for (let x = 0; x < W; x++) { borderTot++; if (A(d, W, x, by) > 24) borderHits++; }
    gate(borderHits / borderTot < 0.02, `G4 όρια κελιών καθαρά (${((borderHits / borderTot) * 100).toFixed(2)}%)`);
  }
  if (rel.endsWith('vessel_purple_rockets.png')) {
    let brightRight = 0;
    for (let y = 0; y < H; y += 2) for (let x = Math.floor(W * 0.86); x < W; x += 2)
      if (A(d, W, x, y) > 100 && LUM(d, W, x, y) > 180) brightRight++;
    gate(brightRight > 40, `G5 φωτεινή μύτη στη δεξιά ζώνη (+X) [${brightRight} px]`);
  }
  if (rel.endsWith('eddie_flame.png')) {
    // η πιο φωτεινή σειρά (κεφαλή) πρέπει να είναι στο πάνω 35% της εικόνας
    let bestY = 0, bestRow = -1;
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) if (A(d, W, x, y) > 24) row += LUM(d, W, x, y);
      if (row > bestRow) { bestRow = row; bestY = y; }
    }
    // κατώφλι 45%: σωστός προσανατολισμός ~38% (κεφαλή+λευκή καρδιά πάνω), ανάποδος ~62%
    gate(bestY < H * 0.45, `G5 κεφαλή φλόγας πάνω (peak row y=${bestY} < ${Math.round(H * 0.45)})`);
  }
  if (rel.endsWith('marker_t.png')) {
    gate(A(d, W, W >> 1, H >> 1) > 60, `G6 ορατός πυρήνας στο κέντρο (α=${A(d, W, W >> 1, H >> 1)})`);
  }
}

// R1: πίνακας αποστάσεων παλέτας
console.log('\nR1 · pairwise απόσταση μέσου ορατού RGB (weapon arts):');
let minPair = [Infinity, '', ''];
for (let i = 0; i < PALETTE_SET.length; i++) for (let j = i + 1; j < PALETTE_SET.length; j++) {
  const a = meanRGB[PALETTE_SET[i]], b = meanRGB[PALETTE_SET[j]];
  if (!a || !b) continue;
  const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  if (dist < minPair[0]) minPair = [dist, PALETTE_SET[i], PALETTE_SET[j]];
}
console.log(`   ελάχιστη απόσταση: ${minPair[0].toFixed(1)} (${path.basename(minPair[1])} ↔ ${path.basename(minPair[2])})`);
gate(minPair[0] > 28, `R1 καμία ζευγαρωτή παλέτα πολύ κοντινή (min ${minPair[0].toFixed(1)} > 28)`);

console.log(`\nΣΥΝΟΛΟ: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
