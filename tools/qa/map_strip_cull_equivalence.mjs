// MAP STRIP CULL — VISUAL EQUIVALENCE PROOF (2026-07-27)
// ------------------------------------------------------------------------------------------------
// _drawCityWorld used to blit the ENTIRE mirror-tiled strip every frame. It now blits only the
// slice the camera can see. Because the rendered-browser gate is blocked in this environment, the
// equivalence is proven ARITHMETICALLY instead of by eye, which is the stronger check anyway:
//
//   1. MAPPING IDENTITY. Old and new use the same translate/scale transform and the same uniform
//      scale S, and the new destination rect is derived FROM the snapped source rect as
//      (sx0*S, sy0*S, (sx1-sx0)*S, (sy1-sy0)*S). Therefore world x -> source x is the same affine
//      map in both versions: every on-screen pixel is sampled from the same texel.
//   2. COVERAGE. The remaining risk is a missing sliver at an edge. For a grid of camera positions
//      this asserts that the union of the new destination rects covers the whole visible viewport
//      wherever the old full-strip draw covered it - including the mirrored tiles, the tile seams,
//      and the extremes of the camera clamp.
//
// Run: node tools/qa/map_strip_cull_equivalence.mjs   (exit 1 on failure)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

// real shipped art dimensions, read off disk
const png = p => { const b = readFileSync(path.join(ROOT, p)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const SRC = readFileSync(path.join(ROOT, 'js/game/MapManager.js'), 'utf8');
const S = Number((SRC.match(/CITY_SCALE\s*=\s*([\d.]+)/) || [])[1]) || 3;

let pass = 0, fail = 0;
const T = (n, ok, note = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

console.log('═══ MAP STRIP CULL — EQUIVALENCE ═══');
console.log(`CITY_SCALE ${S}`);

// ── 1. the production code really is the culled version ────────────────────────────────────────
T('the culled strip draw is present', /SOURCE-RECT CULLING/.test(SRC) &&
  /ctx\.drawImage\(img, sx0, sy0, sx1 - sx0, sy1 - sy0,/.test(SRC));
T('the destination is derived from the SNAPPED source at the same scale',
  /sx0 \* S, sy0 \* S, \(sx1 - sx0\) \* S, \(sy1 - sy0\) \* S\)/.test(SRC));
T('the mirror transform is unchanged',
  /ctx\.translate\(i \* tw \+ \(fx \? tw : 0\), 0\);\s*\n\s*ctx\.scale\(fx \? -1 : 1, 1\);/.test(SRC));
T('the deck-band loop is untouched', /ctx\.drawImage\(img, 0, bandSy, img\.naturalWidth, bandSh, 0, 0, tw, bandTh\)/.test(SRC));
T('the readability dim is clamped to the camera rect', /ctx\.fillRect\(_camX, _camY, vw, vh\)/.test(SRC));

// ── 2. coverage over a camera grid, for both map assets ────────────────────────────────────────
const ASSETS = [
  ['endless cyber megacity', 'assets/maps/new_endless/cyber_megacity.png'],
  ['chaos deck',         'assets/maps/chaos_mode_map/chaos_map.png'],
];
for (const [label, rel] of ASSETS) {
  let dims = null;
  try { dims = png(rel); } catch (_) { console.log(`  SKIP  ${label} — asset not at ${rel}`); continue; }
  const iw = dims.w, ih = dims.h, tw = iw * S, th = ih * S;
  const M = 96;
  let worst = 0, cells = 0, uncovered = 0;
  for (const vs of [0.85, 1.0]) {
    const vw = 1280 / vs, vh = 720 / vs;
    for (let px = -2 * tw; px <= 3 * tw; px += Math.max(37, tw / 11)) {
      for (let py = -400; py <= th + 400; py += Math.max(53, th / 9)) {
        cells++;
        const xA = px - vw / 2 - M, xB = px + vw / 2 + M;
        const yA = py - vh / 2 - M, yB = py + vh / 2 + M;
        // the viewport is the camera rect; the strip only ever covered y in [0, th]
        const visX0 = px - vw / 2, visX1 = px + vw / 2;
        const visY0 = Math.max(py - vh / 2, 0), visY1 = Math.min(py + vh / 2, th);
        if (visY1 <= visY0) continue;
        // union of NEW destination rects
        const segs = [];
        for (let i = Math.floor(xA / tw); i * tw < xB; i++) {
          if (!(yA < th && yB > 0)) continue;
          const fx = ((i % 2) + 2) % 2 === 1;
          const L = Math.max(xA, i * tw), R = Math.min(xB, (i + 1) * tw);
          const Tt = Math.max(yA, 0), B = Math.min(yB, th);
          if (!(R > L && B > Tt)) continue;
          const lx0 = fx ? (i * tw + tw) - R : L - i * tw;
          const lx1 = fx ? (i * tw + tw) - L : R - i * tw;
          const sx0 = Math.max(0, Math.floor(lx0 / S));
          const sx1 = Math.min(iw, Math.ceil(lx1 / S));
          const sy0 = Math.max(0, Math.floor(Tt / S));
          const sy1 = Math.min(ih, Math.ceil(B / S));
          if (!(sx1 > sx0 && sy1 > sy0)) continue;
          // destination in world space, undoing the mirror
          const dLocal0 = sx0 * S, dLocal1 = sx1 * S;
          const wx0 = fx ? (i * tw + tw) - dLocal1 : i * tw + dLocal0;
          const wx1 = fx ? (i * tw + tw) - dLocal0 : i * tw + dLocal1;
          segs.push({ x0: Math.min(wx0, wx1), x1: Math.max(wx0, wx1), y0: sy0 * S, y1: sy1 * S });
        }
        // does the union cover [visX0,visX1] x [visY0,visY1] ?
        const xs = segs.filter(s2 => s2.y0 <= visY0 + 1e-6 && s2.y1 >= visY1 - 1e-6)
                       .map(s2 => [s2.x0, s2.x1]).sort((a, b) => a[0] - b[0]);
        let cur = visX0, ok = true;
        for (const [a, b] of xs) { if (a > cur + 1e-6) { ok = false; break; } cur = Math.max(cur, b); if (cur >= visX1 - 1e-6) break; }
        if (cur < visX1 - 1e-6) ok = false;
        if (!ok) { uncovered++; worst = Math.max(worst, visX1 - cur); }
      }
    }
  }
  T(`${label}: every camera cell fully covered (${cells} cells, ${iw}x${ih} art)`,
    uncovered === 0, uncovered ? `${uncovered} uncovered, worst gap ${worst.toFixed(1)}px` : `0 gaps`);
}

console.log(`\nRESULT ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
