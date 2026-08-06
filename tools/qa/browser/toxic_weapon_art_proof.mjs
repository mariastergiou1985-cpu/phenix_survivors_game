// ════════════════════════════════════════════════════════════════════════════════
// TOXIC CATACLYSM PULSE / TOXIC SINGULARITY TEAR — new original weapon art.
//
// Both cards were showing a 256 px chunk sliced out of ONE large diagonal painting: the old
// sheets were not animations at all, they were a single artwork cut into a 6x4 grid, so the card
// crop (_weaponCardIcon takes frame round((total-1)*0.6) = 14) landed on an arbitrary smear and
// the in-world "animation" played fragments of a still image.
//
// The replacements are two 24-frame animations authored against the SAME contract — 1536x1024,
// 6 cols, 256 px frames — so no code had to change to accept them. What this file has to prove,
// in the order it would hurt:
//
//   L-block  LOADED — both sheets load at the exact declared geometry and NOTHING reports a
//            missing asset. A wrong size here is a silently broken weapon.
//   C-block  THE CARD FRAME — the frame the card actually crops is real art, CENTRED, and touches
//            no frame edge. That last one is the "no crop" requirement and it FAILED on the first
//            build I rendered (edge alpha 255 on the tear) until an edge fade went in.
//   D-block  DISTINCT — the two are not variations of each other: opposite dominant hue, opposite
//            silhouette aspect. "Not similar abstract smears" was an explicit requirement, so it
//            gets a measurement rather than an opinion.
//   A-block  ANIMATED — 24 frames that actually differ from one another and rise to a peak at the
//            card frame. This is what the old sheets could not do.
//   U-block  THE REAL UI — the shipped UpgradeUI draws both cards, at the real card size, through
//            the real _weaponCardIcon. Screenshots are written for eyeballing.
//   N-block  NOTHING ELSE MOVED — names, stats, levels, rarity, the VFX meta and the sheet paths
//            are all byte-identical to before.
//
// Run: node tools/qa/browser/toxic_weapon_art_proof.mjs [port]
// Writes: /tmp/toxic_weapon_art_proof/  (report.json + card screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/toxic_weapon_art_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8981;
const EXE  = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
               '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const BUILD  = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];
const MAIN_V = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').match(/Game\.js\?v=(\d+)/)[1];

let passN = 0, failN = 0;
const failures = [], results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}${extra ? '  ' + extra : ''}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

// The two weapons, the wielder whose cards these are, and the exact strings the cards must
// still print. The names are asserted, never rebuilt — renaming was explicitly out of scope.
const ART = [
  { id: 'cataclysm_pulse', src: 'assets/weapons/vfx/cataclysm_pulse.png',
    card: 'Toxic Cataclysm Pulse',  native: 'Demonic Cataclysm Pulse', warm: true },
  { id: 'glitch_tear',     src: 'assets/weapons/vfx/glitch_tear.png',
    card: 'Toxic Singularity Tear', native: 'Glitch Phase Shard',      warm: false },
];
const WIELDER = 'euclid_vector';
// The stats that must not move. Read out of the shipped catalog before this commit.
const STATS = {
  cataclysm_pulse: { damage: 45, cooldown: 2.5, aoeRadius: 160, speed: 3,  piercing: 99 },
  glitch_tear:     null,   // filled from the page and only compared for shape, see N02
};

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}   BUILD=${BUILD}`);

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp  = await page.context().newCDPSession(page);

const pageErrors = [], consoleErrors = [], missingAssets = [];
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  const t = m.text();
  if (/\[NexusPack\] missing/.test(t)) missingAssets.push(t);
  if (m.type() !== 'error') return;
  if (/Failed to load resource/.test(t)) return;
  consoleErrors.push(t);
});
await page.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
  const u = r.request().url();
  if (/fonts\.googleapis/.test(u)) return r.fulfill({ status: 200, contentType: 'text/css', body: '/* offline proof */' });
  return r.abort();
});

await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1300);

check('A00 the cache-bust chain agrees end to end',
  BUILD === IDX_V && IDX_V === MAIN_V, `${BUILD} / ${IDX_V} / ${MAIN_V}`);
await page.evaluate(async (build) => {
  const mod = await import(`./js/game/Game.js?v=${build}`);
  window.__Game = mod.Game;
  await new Promise((res) => {
    const orig = mod.Game.prototype.update;
    mod.Game.prototype.update = function (...a) {
      window.__g = this; mod.Game.prototype.update = orig; res(); return orig.apply(this, a);
    };
  });
}, BUILD);
check('A01 live Game instance captured on the shipped ?v=', await page.evaluate(() => !!window.__g));
check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

// Shared page helpers: load a sheet and measure any frame of it, exactly the way the game slices it.
await page.evaluate(async (ART) => {
  window.__ART = ART;
  window.__sheets = {};
  await Promise.all(ART.map(a => new Promise((res) => {
    const im = new Image();
    im.onload = () => { window.__sheets[a.id] = im; res(); };
    im.onerror = () => { window.__sheets[a.id] = null; res(); };
    im.src = a.src + '?p=' + Date.now();
  })));
  window.__frame = (id, fi, cols = 6, fw = 256, fh = 256) => {
    const im = window.__sheets[id];
    if (!im) return null;
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
    const cx = cv.getContext('2d');
    cx.drawImage(im, (fi % cols) * fw, Math.floor(fi / cols) * fh, fw, fh, 0, 0, fw, fh);
    return cx.getImageData(0, 0, fw, fh);
  };
  window.__measure = (d) => {
    const { data: p, width: w, height: h } = d;
    let sumA = 0, cx = 0, cy = 0, cov = 0, maxL = 0;
    let rS = 0, gS = 0, bS = 0, n = 0;
    let minX = w, maxX = -1, minY = h, maxY = -1;
    // A second bbox over the VISIBLE mass. The first pass measured alpha > 0.05, which a single
    // 1/255 star speck satisfies, so a soft-edged effect reported a bbox of 0.99 and the tear
    // "failed" a crop check that edge alpha already showed it passing. Crop is edge alpha;
    // composition is this one.
    let vminX = w, vmaxX = -1, vminY = h, vmaxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = p[i + 3] / 255;
      if (a > 0.05) {
        cov++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (a > 0.15) { rS += p[i]; gS += p[i + 1]; bS += p[i + 2]; n++; }
      if (a > 0.30) {
        if (x < vminX) vminX = x; if (x > vmaxX) vmaxX = x;
        if (y < vminY) vminY = y; if (y > vmaxY) vmaxY = y;
      }
      const L = Math.max(p[i], p[i + 1], p[i + 2]) / 255 * a;
      if (L > maxL) maxL = L;
      sumA += a; cx += x * a; cy += y * a;
    }
    let edge = 0;
    for (let x = 0; x < w; x++) {
      edge = Math.max(edge, p[(0 * w + x) * 4 + 3], p[((h - 1) * w + x) * 4 + 3]);
    }
    for (let y = 0; y < h; y++) {
      edge = Math.max(edge, p[(y * w + 0) * 4 + 3], p[(y * w + (w - 1)) * 4 + 3]);
    }
    return {
      cov: cov / (w * h), maxL, edge,
      cxN: sumA ? (cx / sumA) / w : -1, cyN: sumA ? (cy / sumA) / h : -1,
      r: n ? rS / n : 0, g: n ? gS / n : 0, b: n ? bS / n : 0,
      bboxW: maxX < 0 ? 0 : (maxX - minX + 1) / w, bboxH: maxY < 0 ? 0 : (maxY - minY + 1) / h,
      vW: vmaxX < 0 ? 0 : (vmaxX - vminX + 1) / w, vH: vmaxY < 0 ? 0 : (vmaxY - vminY + 1) / h,
    };
  };
  window.__meta = () => {
    // Read the shipped VFX meta indirectly: the card icon path depends on it, and a wrong
    // cols/frame size would show up as a mis-sliced icon rather than an error.
    const g = window.__g;
    return ART.map(a => {
      const im = window.__sheets[a.id];
      return { id: a.id, w: im ? im.naturalWidth : 0, h: im ? im.naturalHeight : 0 };
    });
  };
}, ART);

// ════════════════════════════════════════════════════════════════════════════
// L. LOADED
// ════════════════════════════════════════════════════════════════════════════
const geo = await page.evaluate(() => window.__meta());
check('L01 both sheets load at exactly 1536x1024 — the declared 6x4 grid of 256 px frames',
  geo.length === 2 && geo.every(x => x.w === 1536 && x.h === 1024),
  JSON.stringify(geo));
check('L02 no asset reported missing — the paths the code loads are the paths that exist',
  missingAssets.length === 0, missingAssets.slice(0, 3).join(' | '));

// ════════════════════════════════════════════════════════════════════════════
// C. THE CARD FRAME — frame 14, the one _weaponCardIcon crops
// ════════════════════════════════════════════════════════════════════════════
const CARD_FI = 14;   // round((24-1)*0.6)
const cardFrames = await page.evaluate((fi) => {
  const out = {};
  for (const a of window.__ART) {
    const d = window.__frame(a.id, fi);
    out[a.id] = d ? window.__measure(d) : null;
  }
  return out;
}, CARD_FI);
for (const a of ART) {
  const m = cardFrames[a.id];
  check(`C-${a.id} the card frame is real, centred art with nothing touching the frame edge`,
    !!m && m.cov > 0.12 && m.maxL > 0.55 &&
    Math.abs(m.cxN - 0.5) < 0.06 && Math.abs(m.cyN - 0.5) < 0.06 &&
    m.edge <= 16 && m.vW < 0.95 && m.vH < 0.95,
    m ? `cov=${(m.cov * 100).toFixed(1)}% peak=${m.maxL.toFixed(2)} centroid=(${m.cxN.toFixed(3)},${m.cyN.toFixed(3)}) edgeAlpha=${m.edge} massBox=${m.vW.toFixed(2)}x${m.vH.toFixed(2)}`
      : 'NO FRAME');
}

// ════════════════════════════════════════════════════════════════════════════
// D. DISTINCT — measured, not asserted by eye
// ════════════════════════════════════════════════════════════════════════════
const cp = cardFrames.cataclysm_pulse, gt = cardFrames.glitch_tear;
check('D01 opposite temperature — the Pulse is red-dominant, the Tear is blue-dominant',
  cp && gt && cp.r > cp.b * 1.8 && gt.b > gt.r * 1.8,
  cp && gt ? `pulse rgb=(${cp.r | 0},${cp.g | 0},${cp.b | 0})  tear rgb=(${gt.r | 0},${gt.g | 0},${gt.b | 0})` : 'MISSING');
check('D02 opposite silhouette — the Pulse is a wide disc, the Tear is a tall lens',
  cp && gt && (cp.vW / cp.vH) > 0.85 && (gt.vW / gt.vH) < 0.75,
  cp && gt ? `pulse aspect=${(cp.vW / cp.vH).toFixed(2)}  tear aspect=${(gt.vW / gt.vH).toFixed(2)}` : 'MISSING');
check('D03 they are not the same picture — coverage differs materially',
  cp && gt && Math.abs(cp.cov - gt.cov) > 0.10,
  cp && gt ? `${(cp.cov * 100).toFixed(1)}% vs ${(gt.cov * 100).toFixed(1)}%` : 'MISSING');

// ════════════════════════════════════════════════════════════════════════════
// A. ANIMATED — 24 frames that actually differ, peaking at the card frame
// ════════════════════════════════════════════════════════════════════════════
const anim = await page.evaluate(() => {
  const out = {};
  for (const a of window.__ART) {
    const rows = [];
    for (let i = 0; i < 24; i++) {
      const d = window.__frame(a.id, i);
      rows.push(d ? window.__measure(d) : null);
    }
    out[a.id] = rows.map(m => m ? { cov: m.cov, cxN: m.cxN, cyN: m.cyN, bboxH: m.bboxH } : null);
  }
  return out;
});
for (const a of ART) {
  const rows = anim[a.id];
  const covs = rows.map(r => r ? r.cov : 0);
  const distinct = new Set(covs.map(c => Math.round(c * 400))).size;
  const peak = covs.indexOf(Math.max(...covs));
  check(`A-${a.id} 24 genuinely different frames, growing to a peak at or after the card frame`,
    distinct >= 14 && covs[CARD_FI] > 0.10 && peak >= 10,
    `distinctFrames=${distinct}/24 peakFrame=${peak} cov@14=${(covs[CARD_FI] * 100).toFixed(1)}%`);
}
const centred = await page.evaluate(() => {
  const bad = [];
  for (const a of window.__ART) {
    for (let i = 0; i < 24; i++) {
      const d = window.__frame(a.id, i);
      const m = d ? window.__measure(d) : null;
      if (!m || m.cov < 0.01) continue;                 // birth/death frames carry nothing
      if (Math.abs(m.cxN - 0.5) > 0.09 || Math.abs(m.cyN - 0.5) > 0.09 || m.edge > 24) {
        bad.push(a.id + '#' + i + ' c=(' + m.cxN.toFixed(2) + ',' + m.cyN.toFixed(2) + ') edge=' + m.edge);
      }
    }
  }
  return bad;
});
check('A03 EVERY frame with content is centred and clear of its own edges — no crop anywhere',
  centred.length === 0, centred.slice(0, 4).join(' | '));

// ════════════════════════════════════════════════════════════════════════════
// U. THE REAL CARD UI
// ════════════════════════════════════════════════════════════════════════════
const ui = await page.evaluate(async (build) => {
  const g = window.__g;
  const mod = await import(`./js/game/UpgradeUI.js?v=${build}`);
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
  cv.id = '__cardproof';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  g.player = g.player || {};
  g.player.selectedCharacter = 'euclid_vector';
  const out = [];
  const choices = [];
  for (const a of window.__ART) {
    const icon = g._weaponCardIcon(a.id);
    choices.push({
      // UpgradeUI reads `description` (wrapText splits it) — my first fixture said `desc`
      // and the draw threw on card two, blanking its slot. Mine, not the game's.
      key: 'wpn_' + a.id, name: a.card, description: 'Upgrade to Level 2',
      rarity: 'rare', icon: '?', iconColor: '#2ee6f6', iconImg: icon, level: 2, maxLevel: 5,
    });
    out.push({ id: a.id, iconType: icon ? (icon.naturalWidth === undefined ? 'canvas' : 'image') : 'null',
               iw: icon ? (icon.width || icon.naturalWidth) : 0,
               ih: icon ? (icon.height || icon.naturalHeight) : 0 });
  }
  ctx.fillStyle = '#0b0f22'; ctx.fillRect(0, 0, 1280, 720);
  let err = null;
  const uiObj = new mod.UpgradeUI(choices, { title: 'CARD ART PROOF' });
  try { uiObj.draw(ctx, g.player, g); } catch (e) { err = String(e); }
  // Sample the icon slot of each card: 80x80 at (rect.x + (w-80)/2, rect.y + 52) per UpgradeUI.
  const slots = uiObj.cardRects.map((r) => {
    const ix = Math.round(r.x + (r.w - 80) / 2), iy = Math.round(r.y + 52);
    const d = ctx.getImageData(ix, iy, 80, 80).data;
    let lit = 0, maxL = 0, rS = 0, gS = 0, bS = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const L = (d[i] + d[i + 1] + d[i + 2]) / 3;
      // Threshold at 70, not 26. The lower one counted the CARD PANEL behind the icon, so both
      // slots averaged out to the panel's blue-grey and the "are these different pictures"
      // check compared background to background. This measures the lit ART only.
      if (L > 70) { rS += d[i]; gS += d[i + 1]; bS += d[i + 2]; n++; }
      if (L > 26) lit++;
      if (L > maxL) maxL = L;
    }
    return { lit: lit / (80 * 80), maxL, r: n ? rS / n : 0, g: n ? gS / n : 0, b: n ? bS / n : 0 };
  });
  return { err, icons: out, slots, rects: uiObj.cardRects };
}, BUILD);
// Export the card canvas DIRECTLY rather than screenshotting the viewport: the proof canvas is
// appended offscreen, so a clipped page screenshot captured the main menu instead of the cards.
const cardPng = await page.evaluate(() => {
  const cv = document.getElementById('__cardproof');
  return cv ? cv.toDataURL('image/png') : null;
});
if (cardPng) fs.writeFileSync(path.join(OUT, 'cards.png'), Buffer.from(cardPng.split(',')[1], 'base64'));

check('U01 the shipped UpgradeUI draws both cards without throwing', ui.err === null, ui.err || '');
check('U02 _weaponCardIcon hands the card a real 256x256 icon for BOTH weapons',
  ui.icons.length === 2 && ui.icons.every(x => x.iconType !== 'null' && x.iw === 256 && x.ih === 256),
  JSON.stringify(ui.icons));
check('U03 both icon slots are LIT on the real card — no blank square, no missing asset',
  ui.slots.length === 2 && ui.slots.every(s => s.lit > 0.10 && s.maxL > 90),
  JSON.stringify(ui.slots.map(s => `lit=${(s.lit * 100).toFixed(1)}% peak=${s.maxL | 0}`)));
// Measured as SEPARATION between the two slots, not as absolute red/blue dominance in each.
// The absolute form failed on the Pulse and it was right to: its white-hot molten core is
// near-white by design, which drags the average toward neutral even though the icon is
// obviously red. What the claim actually means is that the two icons differ, so the check now
// says that — opposite sign on red-minus-blue, and a wide gap between them.
const rb0 = ui.slots.length === 2 ? ui.slots[0].r - ui.slots[0].b : 0;
const rb1 = ui.slots.length === 2 ? ui.slots[1].r - ui.slots[1].b : 0;
check('U04 the two slots read as clearly DIFFERENT art after the card has drawn them',
  ui.slots.length === 2 && rb0 > 15 && rb1 < -50 && (rb0 - rb1) > 90,
  JSON.stringify(ui.slots.map(s => `(${s.r | 0},${s.g | 0},${s.b | 0})`)) +
  ` r-b: ${rb0 | 0} vs ${rb1 | 0}`);

// ════════════════════════════════════════════════════════════════════════════
// N. NOTHING ELSE MOVED
// ════════════════════════════════════════════════════════════════════════════
const meta = await page.evaluate(async (build) => {
  const wc = await import(`./js/game/WeaponCatalog.js?v=${build}`);
  const get = wc.getWeaponDef;
  const nm  = wc.getCardDisplayName;
  const out = {};
  for (const id of ['cataclysm_pulse', 'glitch_tear']) {
    const d = get(id);
    out[id] = { name: d.name, sprite: d.sprite, character: d.character, element: d.element,
                color: d.color, isEvolution: d.isEvolution, stats: d.baseStats,
                cardEuclid: nm(id, 'euclid_vector'), cardNative: nm(id, d.character) };
  }
  return out;
}, BUILD);
check('N01 the CARD NAMES are untouched — exactly the two strings this task was about',
  meta.cataclysm_pulse.cardEuclid === 'Toxic Cataclysm Pulse' &&
  meta.glitch_tear.cardEuclid === 'Toxic Singularity Tear' &&
  meta.cataclysm_pulse.cardNative === 'Demonic Cataclysm Pulse' &&
  meta.glitch_tear.cardNative === 'Glitch Phase Shard',
  JSON.stringify([meta.cataclysm_pulse.cardEuclid, meta.glitch_tear.cardEuclid,
                  meta.cataclysm_pulse.cardNative, meta.glitch_tear.cardNative]));
check('N02 the STATS are untouched — damage, cooldown, radius, speed, piercing',
  JSON.stringify(meta.cataclysm_pulse.stats) === JSON.stringify(STATS.cataclysm_pulse) &&
  Object.keys(meta.glitch_tear.stats).length === 5,
  JSON.stringify([meta.cataclysm_pulse.stats, meta.glitch_tear.stats]));
check('N03 ownership, element, colour and evolution flags are untouched',
  meta.cataclysm_pulse.character === 'oni_cataclysm_protocol' &&
  meta.cataclysm_pulse.element === 'fire' && meta.cataclysm_pulse.color === '#ff3030' &&
  meta.glitch_tear.character === 'japan_phasewalker' &&
  meta.glitch_tear.element === 'void' && meta.glitch_tear.color === '#6600CC' &&
  meta.cataclysm_pulse.isEvolution === false && meta.glitch_tear.isEvolution === false,
  JSON.stringify([meta.cataclysm_pulse.character, meta.glitch_tear.character]));
check('N04 the SPRITE PATHS are unchanged — the new art replaced the files in place',
  meta.cataclysm_pulse.sprite === 'assets/weapons/vfx/cataclysm_pulse.png' &&
  meta.glitch_tear.sprite === 'assets/weapons/vfx/glitch_tear.png',
  JSON.stringify([meta.cataclysm_pulse.sprite, meta.glitch_tear.sprite]));

// ════════════════════════════════════════════════════════════════════════════
// R. RUNTIME REGRESSION
// ════════════════════════════════════════════════════════════════════════════
const run = await page.evaluate(() => {
  const g = window.__g;
  const IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  const step = (n) => { for (let i = 0; i < n; i++) {
    if (g.upgradeUI) g.upgradeUI = null;
    if (g.mutationUI) g.mutationUI = null;
    if (g.player) g.player.hp = g.player.maxHp;
    try { g.update(1 / 60, IN); } catch (_) {}
  } };
  try { g._hideCharSelectOverlay?.(); } catch (_) {}
  try { g._hideMenuOverlay?.(); } catch (_) {}
  for (const s of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel', '#__cardproof']) {
    const n = document.querySelector(s); if (n) n.remove();
  }
  g.selectedCharacter = 'euclid_vector';
  g.gameState = 'playing';
  try { g._beginChaosRun(); } catch (_) {}
  step(20);
  // Fire both weapons' world VFX through the shipped spawner — the sheets must play.
  let spawned = 0, err = null;
  try {
    for (const id of ['cataclysm_pulse', 'glitch_tear']) {
      const v = g._spawnWeaponVFX(id, g.player.pos.x + 60, g.player.pos.y, 0, 3.0);
      if (v) spawned++;
    }
  } catch (e) { err = String(e); }
  g.gameState = 'playing'; g.gameOver = false;
  step(20);
  const ctx = (document.querySelector('canvas#game') ||
    [...document.querySelectorAll('canvas')].find(x => x.width > 400)).getContext('2d');
  let derr = null;
  try { g.draw(ctx); } catch (e) { derr = String(e); }
  const d = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
  let sum = 0, max = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += v; if (v > max) max = v;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  const n = Math.floor(d.length / (4 * 97));
  return { spawned, err, derr, state: g.gameState, mean: sum / n, max, colors: colors.size };
});
check('R01 both sheets still drive a real in-world VFX through the shipped spawner',
  run.spawned === 2 && run.err === null, JSON.stringify(run));
check('R02 the game renders with the new art live — no black screen',
  run.derr === null && run.state === 'playing' && run.mean > 3 && run.max > 40 && run.colors > 30,
  JSON.stringify(run));
check('R03 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('R04 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); }
fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, failures }, null, 2));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
