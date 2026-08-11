// Copies the web game into electron/game/ (run before npm start / npm run dist).
//
// PACKAGE HYGIENE (2026-08-11). This used to be `cpSync(assets)` — the whole folder, whatever was
// in it — so the shipped build carried 92 MB of things a player must never receive: six source /
// spec .zip packs (Adobe and Blender sources, 91.7 MB), four *.png.orig.bak art backups (10.4 MB),
// two Blender generator .py scripts, a .bat, a .csv sprite manifest, an internal .md mapping doc,
// a COWORK_IMPORT_PROMPT.txt and two Windows desktop.ini files. None of it is fetched by the game —
// verified: no runtime reference to any of these extensions exists in js/, index.html or sw.js.
//
// Two filters, belt and braces:
//
//   1. GIT ALLOW-LIST (preferred). The package should contain exactly the files the repository
//      tracks, so a stray file sitting in a working folder — an art export mid-review, a scratch
//      render — cannot ride along into a Steam upload just because it happened to be on disk.
//   2. EXTENSION DENY-LIST (always applied, and the fallback when git is unavailable — a source zip
//      someone commits by mistake is still refused).
//
// Anything skipped is printed with its size, so the build says out loud what it left behind
// instead of silently shipping or silently dropping.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, '..');
const DST = path.join(__dirname, 'game');
const TAKE = ['index.html', 'manifest.json', 'sw.js', 'js', 'assets'];

// Never ship: build sources, backups, generator scripts, internal docs, OS metadata.
const DENY_EXT = new Set([
  '.zip', '.7z', '.rar',              // source / spec packs
  '.bak', '.orig',                    // art backups (*.png.orig.bak matches on .bak)
  '.py', '.bat', '.sh', '.ps1',       // generator + build scripts
  '.psd', '.ai', '.xcf', '.blend',    // editable sources
  '.csv', '.md', '.txt', '.ini',      // manifests, internal docs, OS metadata
  '.log',
]);
const DENY_NAME = new Set(['desktop.ini', 'Thumbs.db', '.DS_Store']);

// Whole folders that belong to the website, not to the game. assets/press holds the marketing
// screenshots for press.html — press.html is not packaged, and nothing in js/, index.html or sw.js
// ever references assets/press, so every Steam customer was downloading the press kit with the
// game. Checked by grepping the packaged code for each asset folder before adding one here:
// assets/pwa stays (manifest.json cites the icons and electron-builder takes its app icon from
// game/assets/pwa/icon.ico), and assets/emp stays even though nothing seems to reference its one
// file — an art asset is not something this script gets to decide is dead.
const DENY_DIR = ['assets/press'].map((d) => path.normalize(d));

// ── git allow-list ───────────────────────────────────────────────────────────
let tracked = null;
try {
  const out = execFileSync('git', ['-C', SRC, 'ls-files', '-z', ...TAKE], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const list = out.split('\0').filter(Boolean);
  if (list.length) {
    tracked = new Set(list.map((p) => path.normalize(p)));
    console.log(`git allow-list: ${tracked.size} tracked files`);
  }
} catch (_) {
  console.warn('git not available — falling back to the extension deny-list only.');
  console.warn('UNTRACKED FILES IN assets/ OR js/ WILL BE COPIED. Check the package before uploading.');
}

const skipped = [];
let copied = 0, bytes = 0;

const allow = (abs, stat) => {
  const rel = path.relative(SRC, abs);
  const relN = path.normalize(rel);
  if (DENY_DIR.some((d) => relN === d || relN.startsWith(d + path.sep))) {
    // cpSync stops descending the moment a directory is refused, so the files inside it are never
    // offered to this filter and would vanish from the report. Measure and log the folder here —
    // a packager that drops things without saying so is how the press kit shipped for months.
    if (stat.isDirectory()) {
      let n = 0, bytes = 0;
      const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } };
      try { walk(abs); } catch (_) {}
      skipped.push([`${rel}/  (${n} files)`, bytes, 'dir']);
    }
    return false;
  }
  if (stat.isDirectory()) return true;                       // directories are walked, not shipped
  const base = path.basename(abs);
  if (DENY_NAME.has(base))                       { skipped.push([rel, stat.size, 'name']); return false; }
  if (DENY_EXT.has(path.extname(abs).toLowerCase())) { skipped.push([rel, stat.size, 'ext']); return false; }
  if (tracked && !tracked.has(path.normalize(rel)))  { skipped.push([rel, stat.size, 'untracked']); return false; }
  copied++; bytes += stat.size;
  return true;
};

fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });
for (const item of TAKE) {
  const s = path.join(SRC, item), d = path.join(DST, item);
  if (!fs.existsSync(s)) { console.warn('skip missing', item); continue; }
  fs.cpSync(s, d, { recursive: true, filter: (from) => allow(from, fs.statSync(from)) });
  console.log('copied', item);
}

// Empty directories survive cpSync's filter (the directory itself was allowed, its files were not).
// A Steam upload full of empty folders is untidy rather than dangerous, but prune them anyway.
const prune = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) prune(path.join(dir, e.name));
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
};
prune(DST);

const MB = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
console.log(`\npackaged ${copied} files, ${MB(bytes)}`);
if (skipped.length) {
  const saved = skipped.reduce((n, s) => n + s[1], 0);
  console.log(`left out ${skipped.length} files, ${MB(saved)}:`);
  for (const [rel, size, why] of skipped.sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(MB(size)).padStart(9)}  [${why}] ${rel}`);
  }
}
console.log('\ngame/ ready — now: npm start');
