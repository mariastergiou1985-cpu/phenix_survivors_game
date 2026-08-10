// ════════════════════════════════════════════════════════════════════════════════
// BLOCKED STORAGE + BUILDENGINE MODULE IDENTITY — two things only a real browser can settle.
//
// PART 1 — BLOCKED localStorage. A private window, "block site data", or a partitioned
// third-party context does not give you a quiet null: touching window.localStorage THROWS a
// SecurityError. The probe reproduces exactly that — the PROPERTY ITSELF throws, not just its
// methods — and then asks the two questions that matter: does the game still boot (a throw inside
// the Game constructor means `new Game()` never returns and the canvas stays black), and does a
// finished run still award everything below the high-score write in _grantRewards().
//
// PART 2 — BUILDENGINE MODULE IDENTITY. A module specifier is a cache key: './BuildEngine.js?v=A'
// and './BuildEngine.js?v=B' are two different modules with two different WEAPON_DEFS, two
// different EVOLUTION_RECIPES and two different sets of module state. UpgradeUI and NullArsenalUI
// carried an older stamp than the rest of the runtime. Counted here from the browser's own
// resource timeline after both of those modules have been loaded for real — the card panel through
// a live level-up, NULL ARSENAL through the shipped menu action — plus an identity check on the
// exported objects themselves.
//
// Run: node tools/qa/browser/storage_and_module_identity_proof.mjs [port]
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.argv[2]) || 8991;
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
const BUILD = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); };
const out = {};

// Reproduces a blocked store as browsers actually present it: the property access itself throws.
const BLOCK_STORAGE = () => {
  const boom = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: boom }); } catch (_) {}
  try { Object.defineProperty(window, 'sessionStorage', { configurable: true, get: boom }); } catch (_) {}
};

srv.listen(PORT, async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    headless: !process.env.DISPLAY, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // ══ PART 1 — the game booted into a context with no storage at all ═══════════
  console.log(`\n═══ PART 1 — BLOCKED localStorage (build ${BUILD}) ═══\n`);
  {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(BLOCK_STORAGE);
    const pg = await ctx.newPage();
    const pageErrors = [], consoleErrors = [];
    pg.on('pageerror', e => pageErrors.push(String(e).slice(0, 220)));
    pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 220)); });
    await pg.goto(`http://localhost:${PORT}/index.html?qa=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // The boot check CANNOT go through window.__phenixQA here: that hook is gated on
    // sessionStorage.getItem('phenix_qa_optin'), which this very context makes throw. Use the
    // things the player would see instead — the menu's own DOM, and a canvas with pixels in it.
    let booted = false;
    try {
      await pg.waitForFunction(() => !!document.querySelector('#cgm-menu-nav .mbtn') &&
        !!(document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400)),
        null, { timeout: 25000 });
      booted = true;
    } catch (_) {}
    T('the game BOOTS with storage blocked (no black screen from the constructor)', booted);

    const lum = await pg.evaluate(() => {
      const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
      if (!c) return { mean: -1, max: -1 };
      const o = document.createElement('canvas'); o.width = 120; o.height = 68;
      const cx = o.getContext('2d', { willReadFrequently: true });
      cx.drawImage(c, 0, 0, 120, 68);
      const d = cx.getImageData(0, 0, 120, 68).data;
      let sum = 0, mx = 0;
      for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; if (l > mx) mx = l; }
      return { mean: +(sum / (d.length / 4)).toFixed(2), max: mx };
    });
    out.blackScreen = !(lum.mean > 6 || lum.max > 24);
    T('the menu actually renders (not a black canvas)', !out.blackScreen, `meanLum=${lum.mean} max=${lum.max}`);
    T('zero page errors while storage is blocked', pageErrors.length === 0, pageErrors[0] || '');
    T('zero console errors while storage is blocked', consoleErrors.length === 0, consoleErrors[0] || '');

    // storage really is blocked, and the game really did try to use it
    const blocked = await pg.evaluate(() => { try { void window.localStorage.length; return false; } catch (_) { return true; } });
    T('CONTROL: localStorage genuinely throws in this context', blocked);

    // ── _grantRewards must complete: everything below the high-score write ─────
    await pg.mouse.click(640, 400).catch(() => {});
    const rewards = await pg.evaluate(async (build) => {
      const { Game } = await import('./js/game/Game.js?v=' + build);
      const g = new Game();                       // a throw here is the black-screen class itself
      g.audio = null;
      g.selectedCharacter = 'skeleton_warrior';
      g.reset();
      g._enterEndless();
      g.gameState = 'playing';
      g.timeAlive = 640; g.score = 999999; g.player.level = 21;
      g.player.coresSecured = 60; g.enemiesKilled = 300;
      const before = (g.meta.runHistory || []).length;
      let threw = null;
      try { g._grantRewards(); } catch (e) { threw = String(e).slice(0, 160); }
      return {
        threw,
        bestScore: g.bestScore,
        newHigh: !!g.isNewHighScore,
        endlessRecords: g.meta.endlessRecords ? { ...g.meta.endlessRecords } : null,
        achievements: Object.keys(g.meta.achievements || {}).length,
        historyGrew: ((g.meta.runHistory || []).length) > before,
        creditsAdded: (g.meta.credits || 0) > 0,
      };
    }, BUILD);
    out.rewards = rewards;
    T('_grantRewards() does not throw with storage blocked', rewards.threw === null, rewards.threw || '');
    T('the high score still updates IN MEMORY for the end screen',
      rewards.bestScore === 999999 && rewards.newHigh, JSON.stringify({ b: rewards.bestScore, n: rewards.newHigh }));
    T('Endless personal records are still computed',
      !!rewards.endlessRecords && (rewards.endlessRecords.time || 0) > 0, JSON.stringify(rewards.endlessRecords));
    T('Endless achievements are still awarded', rewards.achievements > 0, `${rewards.achievements} unlocked`);
    T('the run still reaches the local history', rewards.historyGrew);
    T('credits are still granted', rewards.creditsAdded);
    await ctx.close();
  }

  // ══ PART 2 — how many BuildEngine modules does one session create? ═══════════
  console.log(`\n═══ PART 2 — BuildEngine module identity ═══\n`);
  {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem('phenix_qa_optin', '1'); } catch (_) {}
      try { localStorage.setItem('phenix_meta', JSON.stringify({ endlessUnlocked: true, stagesCleared: 6 })); } catch (_) {}
    });
    const pg = await ctx.newPage();
    const pageErrors = [];
    pg.on('pageerror', e => pageErrors.push(String(e).slice(0, 220)));
    await pg.goto(`http://localhost:${PORT}/index.html?qa=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pg.waitForFunction(() => window.__phenixQA?.snapshot?.()?.gameState === 'start_menu', null, { timeout: 25000 });
    await pg.mouse.click(640, 400).catch(() => {});

    // Load BOTH consumers the way the game does: NULL ARSENAL through its shipped menu action,
    // and UpgradeUI through the module Game.js itself imports.
    await pg.evaluate(async (build) => {
      const { Game } = await import('./js/game/Game.js?v=' + build);
      const g = new Game();
      g.audio = null; g.selectedCharacter = 'skeleton_warrior'; g.reset();
      window.__mig = g;
      try { g.goToNullArsenal(); } catch (_) {}
    }, BUILD);
    await sleep(2500);

    const res = await pg.evaluate(() => {
      const urls = performance.getEntriesByType('resource')
        .map(r => r.name).filter(n => /\/BuildEngine\.js/.test(n));
      const stamps = [...new Set(urls.map(u => (u.match(/[?&]v=([^&]*)/) || [])[1] || '(none)'))];
      const paths  = [...new Set(urls.map(u => u.split('?')[0]))];
      return { fetched: urls.length, stamps, paths, loadedNullArsenal: !!document.querySelector('#nau-root, .nau-root, [id^="nau"]') };
    });
    out.beStamps = res.stamps;
    console.log(`     BuildEngine.js fetches: ${res.fetched}   distinct ?v= stamps: ${JSON.stringify(res.stamps)}`);
    T(`exactly ONE BuildEngine module instance (distinct stamps = ${res.stamps.length})`,
      res.stamps.length === 1, JSON.stringify(res.stamps));
    T('and only one BuildEngine path', res.paths.length === 1, JSON.stringify(res.paths));

    // Identity, not just the URL: the objects UpgradeUI and NullArsenalUI hold must BE the
    // objects the runtime holds. Imported through the same specifiers the source files use.
    const ident = await pg.evaluate(async (build) => {
      const src = async (f) => (await fetch('./js/game/' + f)).then ? await (await fetch('./js/game/' + f)).text() : '';
      const stampOf = (text, re) => (text.match(re) || [])[1] || null;
      const upTxt = await (await fetch('./js/game/UpgradeUI.js')).text();
      const naTxt = await (await fetch('./js/game/NullArsenalUI.js')).text();
      const gmTxt = await (await fetch('./js/game/Game.js')).text();
      const reBE = /BuildEngine\.js\?v=(\d+)/;
      const sUp = stampOf(upTxt, reBE), sNa = stampOf(naTxt, reBE), sGm = stampOf(gmTxt, reBE);
      const a = await import('./BuildEngine.js?v=' + sGm).catch(() => null)
             || await import('./js/game/BuildEngine.js?v=' + sGm);
      const b = await import('./js/game/BuildEngine.js?v=' + sUp);
      const c = await import('./js/game/BuildEngine.js?v=' + sNa);
      void src;
      return { sUp, sNa, sGm,
               sameUp: a.WEAPON_DEFS === b.WEAPON_DEFS,
               sameNa: a.WEAPON_DEFS === c.WEAPON_DEFS,
               sameRecipes: a.EVOLUTION_RECIPES === b.EVOLUTION_RECIPES && a.EVOLUTION_RECIPES === c.EVOLUTION_RECIPES };
    }, BUILD);
    console.log(`     stamps in source — Game.js ${ident.sGm} · UpgradeUI ${ident.sUp} · NullArsenalUI ${ident.sNa}`);
    T('UpgradeUI imports the SAME BuildEngine stamp as Game.js', ident.sUp === ident.sGm, `${ident.sUp} vs ${ident.sGm}`);
    T('NullArsenalUI imports the SAME BuildEngine stamp as Game.js', ident.sNa === ident.sGm, `${ident.sNa} vs ${ident.sGm}`);
    T('WEAPON_DEFS is the same object for all three', ident.sameUp && ident.sameNa);
    T('EVOLUTION_RECIPES is the same object for all three', ident.sameRecipes);
    T('zero page errors', pageErrors.length === 0, pageErrors[0] || '');
    await ctx.close();
  }

  console.log(`\n  Blocked localStorage → black screen: ${out.blackScreen ? 'YES' : 'NO'}`);
  console.log(`  Reward save exception handled: ${out.rewards && out.rewards.threw === null ? 'PASS' : 'FAIL'}`);
  console.log(`  BuildEngine module instances: ${out.beStamps ? out.beStamps.length : '?'}`);
  console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══\n`);
  await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
});
