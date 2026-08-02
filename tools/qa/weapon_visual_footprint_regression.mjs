/**
 * WEAPON VISUAL FOOTPRINT REGRESSION (Maria 2026-08-02, Batch W5a)
 *
 * Guards six visual defects. Every one was measured against the tree at 4549864.
 *
 *  V1  WEAPON_VFX_META declared a frame grid that the PNG on disk cannot hold.
 *      glitch_tear.png is 1536x1024 = a 6x4 grid of 256px frames, but the entry said cols: 5 /
 *      totalFrames: 20, so the renderer computed col = n % 5 and row = floor(n / 5) - every
 *      frame after the first five came from the wrong cell and column 6 was never shown.
 *      magnetic_arc_burst.png is a 1254x1254 single illustration, but the entry asked for a 4x4
 *      grid of 128px frames, so it sampled sixteen 128px crops out of the top-left CORNER.
 *      This test re-derives the grid from every PNG header, so the class cannot come back.
 *
 *  V2  Four weapons reach VFXSpritePlayer through the single-image override path, where
 *      animStyle is the only thing that animates the art. None had an entry, so all four fell
 *      back to 'spin': a saber slash, an electric arc and a crescent kick all rotated like a
 *      swirl.
 *
 *  V3  Wing Guillotine's fade term was unclamped. The wing lives to dur + 0.15 (0.45 s) while
 *      the fade hits zero at 0.345 s, so the last ~106 ms asked for a NEGATIVE globalAlpha.
 *      Canvas silently ignores an out-of-range globalAlpha, so instead of dissolving, the wing
 *      kept the previous draw call's alpha (0.95) and flashed back to full brightness.
 *
 *  V4  Holographic Energy Knuckles hit at (size + enemyRadius) - `size` is the fist's RADIUS,
 *      ~38px against an average body - but drew `size` as the fist's WIDTH: a 24px box, radius
 *      12. Enemies died 26px away from where the fist looked.
 *
 *  V5  Sanction Halo's smite damages everything inside 128px and drew a ring that topped out at
 *      54px, so the player could not see what the pillar was about to take.
 *
 *  V6  VFXSpritePlayer set globalCompositeOperation = 'lighter' and overwrote it with 'screen'
 *      on the very next statement - dead code that made the intended blend mode ambiguous.
 *
 * Run: node tools/qa/weapon_visual_footprint_regression.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

const GS  = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const C3  = fs.readFileSync(path.join(ROOT, 'js/game/BuildEngineChars3.js'), 'utf8');
const VFX = fs.readFileSync(path.join(ROOT, 'js/game/VFXSpritePlayer.js'), 'utf8');

const pngSize = (f) => {
  try { const b = fs.readFileSync(path.join(ROOT, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
  catch (_) { return null; }
};

console.log('\n── 1. V1 — every declared frame grid fits the PNG on disk ──');
{
  const meta = GS.match(/const WEAPON_VFX_META = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  const src  = {};
  for (const m of GS.matchAll(/\['([a-z0-9_]+)',\s*'(assets\/[^']+)'\]/g)) src[m[1]] = m[2];
  const bad = [], missing = [];
  let checked = 0;
  for (const m of meta.matchAll(/^\s{2}([a-z0-9_]+):\s*\{\s*cols:\s*(\d+),\s*frameW:\s*(\d+),\s*frameH:\s*(\d+),\s*totalFrames:\s*(\d+)/gm)) {
    const [, id, cols, fw, fh, tf] = m;
    const f = src[id];
    if (!f) { missing.push(id); continue; }
    const d = pngSize(f);
    if (!d) { missing.push(id + '(' + f + ')'); continue; }
    checked++;
    const gridCols = Math.round(d[0] / +fw), gridRows = Math.round(d[1] / +fh);
    // the last frame's source rect must land fully inside the image
    const lastCol = (+tf - 1) % +cols, lastRow = Math.floor((+tf - 1) / +cols);
    if (+cols !== gridCols || +tf > gridCols * gridRows ||
        (lastCol + 1) * +fw > d[0] || (lastRow + 1) * +fh > d[1])
      bad.push(`${id}: decl ${cols}x?/${tf}f of ${fw}x${fh} vs sheet ${d[0]}x${d[1]} (${gridCols}x${gridRows})`);
  }
  ok('every VFX sheet entry matches its PNG', bad.length === 0, bad.join(' | '));
  ok('no VFX sheet entry points at a missing file', missing.length === 0, missing.join(', '));
  ok('the check actually covered the pack', checked >= 20, `${checked} sheets`);
  ok('glitch_tear is a 6x4 grid of 24 frames',
     /glitch_tear:\s*\{ cols: 6, frameW: 256, frameH: 256, totalFrames: 24/.test(meta));
  ok('magnetic_arc is single-illustration form',
     /magnetic_arc:\s*\{ cols: 1, frameW: 1254, frameH: 1254, totalFrames: 1/.test(meta));
}

console.log('\n── 2. V2 — every override-path weapon declares an animation style ──');
{
  const styleBlk = GS.match(/const WEAPON_ANIM_STYLE = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  const styled = new Set([...styleBlk.matchAll(/^\s{2}([a-z0-9_]+):\s*'([a-z]+)'/gm)].map(m => m[1]));
  const ovBlk = GS.match(/const WIELDER_VFX_OVERRIDES = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  const overridden = new Set([...ovBlk.matchAll(/^\s{2}'([a-z0-9_]+)\|/gm)].map(m => m[1]));
  const unstyled = [...overridden].filter(id => !styled.has(id));
  ok('the override table is non-trivial', overridden.size >= 12, `${overridden.size} weapons`);
  ok('no override-path weapon falls back to the default spin', unstyled.length === 0, unstyled.join(', '));
  // and the styles must be ones VFXSpritePlayer actually implements
  const impl = new Set([...VFX.matchAll(/case '([a-z]+)':/g)].map(m => m[1]));
  impl.add('spin');
  const unknown = [...styleBlk.matchAll(/^\s{2}[a-z0-9_]+:\s*'([a-z]+)'/gm)].map(m => m[1]).filter(s => !impl.has(s));
  ok('every declared style is implemented by VFXSpritePlayer', unknown.length === 0, unknown.join(', '));
}

console.log('\n── 3. V3 — Wing Guillotine never asks for an out-of-range alpha ──');
{
  ok('the fade term is clamped in source',
     /fade = Math\.max\(0, Math\.min\(1, 1 - Math\.max\(0, \(g\.t - g\.dur \* 0\.5\) \/ \(g\.dur \* 0\.65\)\)\)\)/.test(C3));
  // replicate both expressions across the wing's REAL lifetime (dur + 0.15)
  const dur = 0.30;
  let oldNeg = 0, newBad = 0, min = 1;
  for (let t = 0; t <= dur + 0.15 + 1e-9; t += 0.001) {
    const o = 1 - Math.max(0, (t - dur * 0.5) / (dur * 0.65));
    const n = Math.max(0, Math.min(1, o));
    if (o < 0) oldNeg++;
    if (o < min) min = o;
    if (n < 0 || n > 1) newBad++;
  }
  ok('the defect was real (old term went negative)', oldNeg > 0 && min < -0.4, `min ${min.toFixed(3)}`);
  ok('the clamped term stays inside [0,1] for the whole lifetime', newBad === 0);
  // every alpha the wing draw sets is fade-scaled, so a clamped fade bounds all of them
  const wingBlk = C3.slice(C3.indexOf('for (const g of (w.wings || []))'));
  const alphas = [...wingBlk.slice(0, wingBlk.indexOf('ctx.restore();')).matchAll(/globalAlpha = ([0-9.]+) \* fade/g)].map(m => +m[1]);
  ok('every wing alpha is a fade-scaled constant <= 1', alphas.length >= 3 && alphas.every(a => a > 0 && a <= 1),
     JSON.stringify(alphas));
}

console.log('\n── 4. V4/V5 — the art footprint matches the damage footprint ──');
{
  // V4: the fist's drawn half-extent must equal the radius update() collides with.
  ok('the fist body is drawn at the collision radius', /ctx\.strokeRect\(-fw, -fw \* 1\.1, fw \* 2, fw \* 2\.2\)/.test(C3));
  ok('fw is the weapon size, i.e. the same term the hit test uses', /const fw = size;/.test(C3));
  ok('the hit test still uses (size + e.radius)', /\(size \+ e\.radius\) \*\* 2/.test(C3));
  // the fist's own numbers must be untouched — this is a draw-only change
  ok('holo_energy_knuckles keeps size 24 / pierce 2', /speed: 380, size: 24, pierce: 2/.test(C3));
  ok('its damage table is untouched', /damage:\s*\[17, 20, 24, 30, 37\]/.test(C3));

  // V5: the smite ring must reach the radius it damages at.
  ok('the smite ring is derived from the real radius', /const SR = EVOLUTION_RECIPES\.be_sanction_halo\.smite\.radius;/.test(C3));
  ok('the outer ring ends exactly at that radius', /ctx\.arc\(s\.x, s\.y, SR \* 0\.5 \+ SR \* 0\.5 \* k, 0, Math\.PI \* 2\)/.test(C3));
  ok('no hard-coded 54px ceiling remains', !/ctx\.arc\(s\.x, s\.y, 30 \+ 24 \* k/.test(C3));
  ok('the smite damage numbers are untouched', /smite: \{ dmg: 42, radius: 128, perCombo: 1, chain: 1, chainRange: 190 \}/.test(C3));
}

console.log('\n── 5. V6 — no dead composite-operation assignment ──');
{
  const overrideBlk = VFX.slice(VFX.indexOf('if (this.overrideImg) {', VFX.indexOf('draw(ctx)')));
  // window = up to the drawImage that ends the override branch, so comment length cannot skew it
  const ops = [...overrideBlk.slice(0, overrideBlk.indexOf('ctx.drawImage(oi,')).matchAll(/globalCompositeOperation = '([a-z]+)'/g)].map(m => m[1]);
  ok('the override path sets the blend mode exactly once', ops.length === 1, JSON.stringify(ops));
  ok('and it is the intended one', ops[0] === 'screen', String(ops[0]));
}

console.log('\n── 6. the cache-bust chain moved together ──');
{
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw  = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const mn  = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  const B = idx.match(/js\/main\.js\?v=(\d+)/)[1];
  ok('sw.js BUILD equals index.html main.js ?v', sw.includes(`const BUILD = '${B}'`), B);
  ok('main.js imports Game.js at the same stamp', mn.includes(`./game/Game.js?v=${B}`));
  ok('Game.js imports the changed chars module at the same stamp', GS.includes(`./BuildEngineChars3.js?v=${B}`));
  ok('Game.js imports the changed VFX module at the same stamp', GS.includes(`./VFXSpritePlayer.js?v=${B}`));
  // MODULE IDENTITY: all six side-effect registrars must import ONE BuildEngine instance.
  const beStamps = new Set();
  for (const f of ['BuildEngineChars1', 'BuildEngineChars2', 'BuildEngineChars3',
                   'BuildEngineChars4', 'BuildEngineChars5', 'BuildEnginePassives', 'Game',
                   'FusionEngine', 'NullArsenalUI', 'UpgradeUI']) {
    const s = fs.readFileSync(path.join(ROOT, `js/game/${f}.js`), 'utf8');
    for (const m of s.matchAll(/BuildEngine\.js\?v=(\d+)/g)) beStamps.add(m[1]);
  }
  ok('every module imports the SAME BuildEngine instance', beStamps.size === 1, [...beStamps].join(', '));
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail ? 1 : 0);
