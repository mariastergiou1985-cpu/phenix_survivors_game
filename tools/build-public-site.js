// PUBLIC SITE BUILDER — assembles the ONLY files the browser demo needs, into _site/.
//
// WHY THIS EXISTS. GitHub Pages serves a repository, not a build. With .nojekyll present it serves
// EVERY tracked file, so the public site currently hands out the whole QA suite, the Electron shell
// source, the internal design docs, the Adobe/Blender source .zip packs and the *.png.orig.bak art
// backups. Verified live on 2026-08-11: fetching
//   /tools/qa/browser/release_package_proof.mjs
// from the published site returns the script's real source.
//
// Deploying an ARTIFACT instead of a branch fixes that without touching repository visibility:
// only what this script emits is published. It is deliberately an ALLOW-LIST — a deny-list would
// leak the next folder somebody adds.
//
// Run: node tools/build-public-site.js     (output: _site/)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC  = path.resolve(__dirname, '..');
const DST  = path.join(SRC, '_site');

// Everything the browser actually fetches, and nothing else.
//   index.html  — the game        press.html   — the press page
//   manifest.json / sw.js         — PWA shell   js/ assets/ — the game itself
//   LICENSE                       — All Rights Reserved travels with the public copy
const TAKE = ['index.html', 'press.html', 'manifest.json', 'sw.js', 'js', 'assets', 'LICENSE'];

// Same hygiene as electron/prepare-game.js: build sources, backups, generator scripts, internal
// docs and OS metadata never reach a player.
const DENY_EXT = new Set([
  '.zip', '.7z', '.rar', '.bak', '.orig', '.py', '.bat', '.sh', '.ps1',
  '.psd', '.ai', '.xcf', '.blend', '.csv', '.md', '.ini', '.log', '.map',
  // .txt earns its place: leaving it out of this list published
  // assets/enemies/weapons/COWORK_IMPORT_PROMPT.txt — an internal authoring brief — on the first
  // build of this script. Nothing the browser fetches is a .txt.
  '.txt',
]);
const DENY_NAME = new Set(['desktop.ini', 'Thumbs.db', '.DS_Store']);
// assets/press holds the press-page screenshots, which press.html DOES serve — unlike the Electron
// package, this build keeps them.
const DENY_DIR = [].map((d) => path.normalize(d));

let tracked = null;
try {
  const out = execFileSync('git', ['-C', SRC, 'ls-files', '-z', ...TAKE], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const list = out.split('\0').filter(Boolean);
  if (list.length) { tracked = new Set(list.map((p) => path.normalize(p))); console.log(`git allow-list: ${tracked.size} tracked files`); }
} catch (_) {
  console.warn('git unavailable — extension deny-list only; untracked strays could be published.');
}

const skipped = [];
let copied = 0, bytes = 0;
const allow = (abs, stat) => {
  const rel = path.relative(SRC, abs), relN = path.normalize(rel);
  if (DENY_DIR.some((d) => relN === d || relN.startsWith(d + path.sep))) return false;
  if (stat.isDirectory()) return true;
  if (DENY_NAME.has(path.basename(abs)))              { skipped.push([rel, stat.size, 'name']); return false; }
  if (DENY_EXT.has(path.extname(abs).toLowerCase()))  { skipped.push([rel, stat.size, 'ext']);  return false; }
  if (tracked && !tracked.has(relN))                  { skipped.push([rel, stat.size, 'untracked']); return false; }
  copied++; bytes += stat.size; return true;
};

fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });
for (const item of TAKE) {
  const s = path.join(SRC, item), d = path.join(DST, item);
  if (!fs.existsSync(s)) { console.warn('skip missing', item); continue; }
  const st = fs.statSync(s);
  if (st.isDirectory()) fs.cpSync(s, d, { recursive: true, filter: (from) => allow(from, fs.statSync(from)) });
  else if (allow(s, st)) fs.copyFileSync(s, d);
}
// Pages must not run Jekyll over the output (underscore-prefixed paths would vanish).
fs.writeFileSync(path.join(DST, '.nojekyll'), '');

const prune = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) prune(path.join(dir, e.name));
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
};
prune(DST);

// A build that silently drops something is how the press kit ended up in the Steam depot. Say it.
const MB = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
console.log(`\npublished ${copied} files, ${MB(bytes)}`);
if (skipped.length) {
  console.log(`left out ${skipped.length} files, ${MB(skipped.reduce((n, s) => n + s[1], 0))}:`);
  for (const [rel, size, why] of skipped.sort((a, b) => b[1] - a[1]).slice(0, 25))
    console.log(`   ${String(MB(size)).padStart(9)}  [${why}] ${rel}`);
}

// Fail loudly rather than publish something that should have stayed private.
const LEAK = /(^|\/)(tools|electron|docs|qa_reports|release_store_package|\.github|_to_delete)\//;
const leaked = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else { const r = path.relative(DST, p).split(path.sep).join('/');
           if (LEAK.test(r) || /\.(zip|bak|orig|py|bat|md|map|log|txt|csv|ini)$/i.test(r)) leaked.push(r); }
  }
})(DST);
if (leaked.length) { console.error('\nREFUSING: dev files reached the public build:'); leaked.slice(0, 20).forEach((l) => console.error('   ' + l)); process.exit(1); }
console.log('leak check: clean — no tools/, electron/, docs/, reports, .zip, .bak, .py or source maps in _site/');
