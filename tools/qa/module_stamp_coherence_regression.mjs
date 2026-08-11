// ════════════════════════════════════════════════════════════════════════════════
// MODULE STAMP COHERENCE — the cache-bust invariants, checked by reading the source.
//
// A module specifier IS the cache key. './BuildEngine.js?v=A' and './BuildEngine.js?v=B' are two
// different modules with two different sets of exports and two different sets of module state, and
// a specifier that does not move is a URL a returning browser is entitled to serve from its cache.
// Both failure modes have shipped in this project already, which is why they are asserted here
// instead of being remembered:
//
//   SPLIT BRAIN — two importers referencing the same module at different stamps. UpgradeUI and
//   NullArsenalUI sat on an older BuildEngine stamp than the other ten importers, so the card panel
//   and the arsenal held a different WEAPON_DEFS from the runtime.
//
//   STALE PARENT — a module is edited (its own import stamps move) but the specifier its importer
//   uses does not. Commit e4640ca moved the BuildEngine stamp inside BuildEngineChars1-5,
//   BuildEnginePassives, FusionEngine and NullArsenalUI, while Game.js still imported those eight
//   files at their old stamps: a warm cache would hand back the OLD copies, which import the OLD
//   BuildEngine, and the 25 character weapons would register into an instance the runtime never
//   reads. A fresh browser looks perfectly healthy, which is exactly what makes it worth a test.
//
// Also checks the three-link cache-bust chain sw.js BUILD -> index.html -> js/main.js.
//
// Pure static analysis of the shipped files. No game boot, no browser, runs in well under a second.
//
// Run: node tools/qa/module_stamp_coherence_regression.mjs   (exit 1 on failure)
// ════════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

let pass = 0, fail = 0;
const T = (n, c, x = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${x ? '  — ' + x : ''}`); } };

// ── collect every stamped specifier in every shipped .js ─────────────────────
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(path.join(ROOT, 'js'));
files.push(path.join(ROOT, 'sw.js'));

const RE = /['"](\.{1,2}\/[A-Za-z0-9_\/-]+\.js)\?v=(\d+)['"]/g;
const refs = [];                                   // { importer, target(abs), stamp }
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(RE)) {
    const target = path.resolve(path.dirname(f), m[1]);
    refs.push({ importer: path.relative(ROOT, f), target, targetRel: path.relative(ROOT, target), stamp: Number(m[2]) });
  }
}
console.log(`\n═══ MODULE STAMP COHERENCE ═══\n     ${refs.length} stamped imports across ${files.length} files\n`);
T('CONTROL: the repo really does use stamped specifiers', refs.length > 40, `${refs.length}`);
T('every stamped import resolves to a file that exists',
  refs.every(r => fs.existsSync(r.target)),
  refs.filter(r => !fs.existsSync(r.target)).slice(0, 4).map(r => `${r.importer} -> ${r.targetRel}`).join(' | '));

// ── 1. SPLIT BRAIN: one module, one stamp, everywhere ────────────────────────
console.log('\n── 1. one module, one stamp ──');
const byTarget = new Map();
for (const r of refs) {
  if (!byTarget.has(r.targetRel)) byTarget.set(r.targetRel, new Map());
  const m = byTarget.get(r.targetRel);
  if (!m.has(r.stamp)) m.set(r.stamp, []);
  m.get(r.stamp).push(r.importer);
}
const split = [...byTarget.entries()].filter(([, m]) => m.size > 1);
for (const [t, m] of split) {
  console.log(`     ${t}:`);
  for (const [s, imps] of [...m.entries()].sort((a, b) => b[0] - a[0])) {
    console.log(`        ?v=${s}  <-  ${imps.join(', ')}`);
  }
}
T('no module is imported at two different stamps (no second module instance)',
  split.length === 0, split.map(([t]) => t).join(', '));

// ── 2. STALE PARENT: an importer must not be older than what its child declares ──
console.log('\n── 2. an edited module is imported at a stamp at least as new ──');
// The highest stamp a file declares in its OWN imports is a lower bound on when that file last
// changed: you cannot have written that number into it before that build existed.
const ownMax = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let mx = 0;
  for (const m of src.matchAll(RE)) mx = Math.max(mx, Number(m[2]));
  if (mx) ownMax.set(path.relative(ROOT, f), mx);
}
const stale = [];
for (const r of refs) {
  const childMax = ownMax.get(r.targetRel);
  if (childMax && r.stamp < childMax) {
    stale.push({ ...r, childMax });
  }
}
for (const s of stale) {
  console.log(`     ${s.importer} imports ${s.targetRel} at ?v=${s.stamp}, but that file itself declares ?v=${s.childMax}`);
}
T('no module is imported at a stamp older than the stamps it declares itself',
  stale.length === 0,
  stale.slice(0, 6).map(s => `${s.targetRel} ${s.stamp}<${s.childMax}`).join(' | '));

// ── 3. the three-link cache-bust chain ───────────────────────────────────────
console.log('\n── 3. cache-bust chain ──');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const mainjs = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
const build = (sw.match(/BUILD\s*=\s*'(\d+)'/) || [])[1];
const htmlV = (html.match(/js\/main\.js\?v=(\d+)/) || [])[1];
const gameV = (mainjs.match(/\.\/game\/Game\.js\?v=(\d+)/) || [])[1];
console.log(`     sw.js BUILD=${build}  ·  index.html main.js?v=${htmlV}  ·  main.js Game.js?v=${gameV}`);
T('sw.js BUILD is present', !!build);
T('index.html main.js?v= equals sw.js BUILD', htmlV === build, `${htmlV} vs ${build}`);
T('js/main.js Game.js?v= equals sw.js BUILD', gameV === build, `${gameV} vs ${build}`);

// ── 4. Game.js is the newest thing in the graph ──────────────────────────────
// Game.js imports nearly everything, so any module edited in the same commit must be imported at a
// stamp no newer than Game.js's own — otherwise the chain was bumped out of order.
console.log('\n── 4. nothing is imported from the future ──');
const future = refs.filter(r => Number(build) && r.stamp > Number(build));
T('no stamp is newer than the current BUILD', future.length === 0,
  future.slice(0, 4).map(r => `${r.importer} -> ${r.targetRel} @${r.stamp}`).join(' | '));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══\n`);
process.exit(fail ? 1 : 0);
