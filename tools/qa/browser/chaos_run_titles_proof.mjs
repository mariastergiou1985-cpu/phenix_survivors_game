// ════════════════════════════════════════════════════════════════════════════════
// CHAOS RUN TITLES — three cosmetic marks on what a single run WAS.
//
//   TITAN HUNTER    4 Mega Titans in one run
//   LAW SURVIVOR    20:00 survived
//   CORRUPTED SOUL  3 corrupted mutations sealed
//
// Derived from the Ledger record itself ({ titans, secs, corrupted }), which recordChaosRun has
// stored per run since b37cba2 — so nothing new is saved, and old rows earn their titles
// retroactively. The S-block pins each threshold at the boundary; the A-block proves the Results
// screen and the Ledger agree BECAUSE they call one function; the C-block proves it pays nothing.
//
// Run: node tools/qa/browser/chaos_run_titles_proof.mjs [port]
// Writes: /tmp/chaos_run_titles_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_run_titles_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8935;
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

const BUILD = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];

let passN = 0, failN = 0;
const failures = [], results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}${extra ? '  ' + extra : ''}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}   BUILD=${BUILD}`);

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp  = await page.context().newCDPSession(page);

const pageErrors = [], consoleErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/.test(t)) return;
  consoleErrors.push(t);
});
await page.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
  const u = r.request().url();
  if (/fonts\.googleapis/.test(u)) return r.fulfill({ status: 200, contentType: 'text/css', body: '/* offline proof */' });
  return r.abort();
});
const shot = async (n) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, n), Buffer.from(data, 'base64'));
};

await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1300);

check('A00 sw.js BUILD equals index.html main.js ?v=', BUILD === IDX_V, `${BUILD} vs ${IDX_V}`);
await page.evaluate(b => { window.__BUILD = b; }, BUILD);
await page.evaluate(async (build) => {
  const mod = await import(`./js/game/Game.js?v=${build}`);
  await new Promise((res) => {
    const orig = mod.Game.prototype.update;
    mod.Game.prototype.update = function (...a) {
      window.__g = this; mod.Game.prototype.update = orig; res(); return orig.apply(this, a);
    };
  });
}, BUILD);
check('A01 live Game instance captured on the shipped ?v=', await page.evaluate(() => !!window.__g));
check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await page.evaluate(async () => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      if (g.player) g.player.hp = g.player.maxHp;
      try { g.update(1 / 60, window.__IN); } catch (_) {}
    }
  };
  window.__ctx = () => (document.querySelector('canvas#game') ||
    [...document.querySelectorAll('canvas')].find(x => x.width > 400)).getContext('2d');
  window.__names = (rec) => g._chaosTitlesFor(rec).map(t => t.name);

  window.__start = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
    try { g._beginChaosRun(); } catch (_) {}
    window.__step(20);
  };
  // Seals REAL corrupted pacts through the shipped mutations.taken store with its `corrupt_`
  // prefix — the same source the Ledger and the PACTBOUND sigil re-derive their counts from.
  window.__pacts = (n) => {
    if (!g.mutations) g.mutations = {};
    g.mutations.taken = {};
    for (let i = 0; i < n; i++) g.mutations.taken['corrupt_p' + i] = 1;
  };
  window.__killTitan = (type) => {
    g.enemies = g.enemies.filter(e => !e.isMegaBoss);
    g._activeTitan = { enemyType: type, hp: 0, _killed: true, isMegaBoss: true, pos: { x: 0, y: 0 } };
    try { g._updateChaosTitans(1 / 60); } catch (e) { window.__err = String(e); }
  };
  window.__TITANS = ['Giga-Core Overlord', 'Malware Leviathan',
                     'Quantum Void Emperor', 'Apocalypse Mech Tyrant'];
  window.__end = (secs) => {
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false; g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
  };
  // The RESULTS strip, read out of the real _resultsHTML.
  window.__results = () => {
    let html = '';
    try { html = g._resultsHTML(); } catch (e) { window.__err = String(e); return null; }
    const d = document.createElement('div'); d.innerHTML = html;
    const head = [...d.querySelectorAll('div')].find(n =>
      n.children.length === 0 && /^RUN TITLES$/.test((n.textContent || '').trim()));
    if (!head) return { present: false, text: '', chips: [] };
    const block = head.parentElement;
    return { present: true, text: (block.textContent || '').replace(/\s+/g, ' ').trim(),
             chips: [...block.querySelectorAll('span')].map(s => (s.textContent || '').trim()) };
  };
  // The LEDGER, both places it renders.
  window.__ledgerShort = () => {
    const esc = (v) => String(v ?? '');
    try { return g._chaosLedgerHTML(esc, (s) => String(s), { BRONZE: '#fff', SILVER: '#fff', GOLD: '#fff', PLATINUM: '#fff' }) || ''; }
    catch (e) { window.__err = String(e); return ''; }
  };
  window.__ledgerTab = () => {
    try { g.goToAchievementsScreen(); } catch (_) {}
    try { g._colSelectTab?.('chaos'); } catch (_) {}
    try { const t = document.querySelector('.ct-tab[data-tab="chaos"]'); if (t) t.click(); } catch (_) {}
    const el = document.querySelector('#cxc-ledger');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  };
  window.__stats = () => ({
    credits: g.meta.credits || 0, pf: g.meta.protocolFragments || 0,
    eden: g.meta.getEdenMemory ? g.meta.getEdenMemory() : 0,
    rewardedPF: g.meta.rewardedPFTotal || 0,
    level: g.meta.getPlayerProgression ? g.meta.getPlayerProgression().level : 0,
    relics: Object.keys(g.meta.relics || {}).length,
    unlocks: Object.keys(g.meta.unlocks || {}).length,
    maxHp: g.player?.maxHp || 0, speed: g.player?.speed || 0,
    xpMult: g.player?.xpMult || 0, cdMult: g.player?.abilityCdMult || 0,
    dr: g.player?.contactDamageReduction || 0, pulse: g.player?.pulseDamage || 0,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// S. THE THRESHOLDS
// ════════════════════════════════════════════════════════════════════════════
const edges = await page.evaluate(() => ({
  none:      window.__names({ titans: 0, secs: 0, corrupted: 0 }),
  titan3:    window.__names({ titans: 3, secs: 0, corrupted: 0 }),
  titan4:    window.__names({ titans: 4, secs: 0, corrupted: 0 }),
  secs1199:  window.__names({ titans: 0, secs: 1199, corrupted: 0 }),
  secs1200:  window.__names({ titans: 0, secs: 1200, corrupted: 0 }),
  corrupt2:  window.__names({ titans: 0, secs: 0, corrupted: 2 }),
  corrupt3:  window.__names({ titans: 0, secs: 0, corrupted: 3 }),
}));
check('S01 TITAN HUNTER — three Titans is not enough, four earns it',
  edges.titan3.length === 0 && JSON.stringify(edges.titan4) === JSON.stringify(['TITAN HUNTER']),
  JSON.stringify({ three: edges.titan3, four: edges.titan4 }));
check('S02 LAW SURVIVOR — 19:59 is not enough, 20:00 exactly earns it',
  edges.secs1199.length === 0 && JSON.stringify(edges.secs1200) === JSON.stringify(['LAW SURVIVOR']),
  JSON.stringify({ at1199: edges.secs1199, at1200: edges.secs1200 }));
check('S03 CORRUPTED SOUL — two pacts is not enough, three earns it',
  edges.corrupt2.length === 0 && JSON.stringify(edges.corrupt3) === JSON.stringify(['CORRUPTED SOUL']),
  JSON.stringify({ two: edges.corrupt2, three: edges.corrupt3 }));
check('S04 a run that met nothing earns no title at all — the normal case',
  edges.none.length === 0, JSON.stringify(edges.none));

const stacking = await page.evaluate(() => ({
  all:  window.__names({ titans: 4, secs: 1800, corrupted: 5 }),
  two:  window.__names({ titans: 4, secs: 1800, corrupted: 0 }),
  over: window.__names({ titans: 9, secs: 9999, corrupted: 9 }),
}));
check('S05 titles STACK — they describe the run, they are not ranked or exclusive',
  JSON.stringify(stacking.all) === JSON.stringify(['TITAN HUNTER', 'LAW SURVIVOR', 'CORRUPTED SOUL']) &&
  JSON.stringify(stacking.two) === JSON.stringify(['TITAN HUNTER', 'LAW SURVIVOR']) &&
  JSON.stringify(stacking.over) === JSON.stringify(stacking.all),
  JSON.stringify(stacking));

const real = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__start();
  window.__pacts(3);
  for (let i = 0; i < 4; i++) window.__killTitan(window.__TITANS[i]);
  // The live reading is taken with 25 minutes ON THE CLOCK, not before it. The first version
  // snapshotted mid-run and then compared against a record written at 1500 s — of course
  // LAW SURVIVOR was missing from one side; the run had been going twenty frames, not twenty
  // minutes. Advancing the clock first compares like with like.
  g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + 1500;
  const live = window.__names(g._thisRunTitleRec());
  window.__end(1500);
  const rec = (g.meta.getChaosLedger() || [])[0];
  return { live, stored: window.__names(rec), rec: { t: rec?.titans, s: rec?.secs, c: rec?.corrupted } };
});
check('S06 earned by a REAL run — four real Titan kills, three real pacts, past 20:00',
  JSON.stringify(real.live) === JSON.stringify(['TITAN HUNTER', 'LAW SURVIVOR', 'CORRUPTED SOUL']) &&
  JSON.stringify(real.stored) === JSON.stringify(real.live) &&
  real.rec.t === 4 && real.rec.s === 1500 && real.rec.c === 3,
  JSON.stringify(real));

// ════════════════════════════════════════════════════════════════════════════
// A. RESULTS AND LEDGER AGREE
// ════════════════════════════════════════════════════════════════════════════
const surfaces = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__start();
  window.__pacts(3);
  for (let i = 0; i < 4; i++) window.__killTitan(window.__TITANS[i]);
  window.__end(1500);
  return { results: window.__results(), short: window.__ledgerShort(), tab: window.__ledgerTab() };
});
check('A01 the RESULTS screen prints the run\'s titles under a RUN TITLES heading',
  surfaces.results?.present === true &&
  surfaces.results.chips.includes('TITAN HUNTER') &&
  surfaces.results.chips.includes('LAW SURVIVOR') &&
  surfaces.results.chips.includes('CORRUPTED SOUL'),
  JSON.stringify(surfaces.results?.chips));
check('A02 the LEDGER prints them on that run\'s row, in both places it renders',
  /TITAN HUNTER/.test(surfaces.short) && /LAW SURVIVOR/.test(surfaces.short) &&
  /CORRUPTED SOUL/.test(surfaces.short) &&
  /TITAN HUNTER/.test(surfaces.tab) && /CORRUPTED SOUL/.test(surfaces.tab),
  JSON.stringify({ short: /TITAN HUNTER/.test(surfaces.short), tab: /TITAN HUNTER/.test(surfaces.tab) }));

const agree = await page.evaluate(() => {
  const g = window.__g;
  // The Results screen and the Ledger must agree for EVERY combination, because they call one
  // function on one record. Walk the whole 2x2x2 space of the three conditions.
  const rows = [];
  for (const t of [3, 4]) for (const s of [1199, 1200]) for (const c of [2, 3]) {
    g.meta.chaosLedger = [];
    window.__start();
    window.__pacts(c);
    for (let i = 0; i < t; i++) window.__killTitan(window.__TITANS[i % 4]);
    g._chaosTitansKilled = t;                       // t=4 needs 4 distinct; force the tally
    window.__end(s);
    const rec = (g.meta.getChaosLedger() || [])[0];
    const res = window.__results();
    const fromLedger = window.__names(rec).sort().join(',');
    const fromResults = (res?.chips || []).slice().sort().join(',');
    rows.push({ t, s, c, fromLedger, fromResults, same: fromLedger === fromResults });
  }
  return rows;
});
check('A03 Results and Ledger agree on ALL EIGHT combinations — one function, one record',
  agree.length === 8 && agree.every(r => r.same),
  JSON.stringify(agree.filter(r => !r.same).slice(0, 2)) + ' mismatches of ' + agree.length);

const noTitles = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__start();
  window.__pacts(0);
  window.__end(300);                                 // a short, plain, titleless run
  return { results: window.__results(), short: window.__ledgerShort() };
});
check('A04 a titleless run shows NO heading and NO chip — no empty "RUN TITLES" box',
  noTitles.results?.present === false &&
  !/TITAN HUNTER|LAW SURVIVOR|CORRUPTED SOUL/.test(noTitles.short),
  JSON.stringify({ present: noTitles.results?.present }));

const retro = await page.evaluate(() => {
  const g = window.__g;
  // A row written BEFORE titles existed carries the three numbers already — so it earns its
  // titles with no migration at all.
  g.meta.chaosLedger = [{ char: 'skeleton_warrior', law: 'blood_grid', secs: 1400, rank: 'GOLD',
                          kills: 900, titans: 4, corrupted: 1, date: '1/1/2026' }];
  return { names: window.__names(g.meta.chaosLedger[0]), short: window.__ledgerShort() };
});
check('A05 RETROACTIVE — a pre-titles Ledger row earns its titles from the numbers it already has',
  JSON.stringify(retro.names) === JSON.stringify(['TITAN HUNTER', 'LAW SURVIVOR']) &&
  /TITAN HUNTER/.test(retro.short) && !/CORRUPTED SOUL/.test(retro.short),
  JSON.stringify(retro.names));

// ════════════════════════════════════════════════════════════════════════════
// C. COSMETIC — no reward, no stat
// ════════════════════════════════════════════════════════════════════════════
const matched = await page.evaluate(() => {
  const g = window.__g;
  const delta = (a, b) => { const o = {}; for (const k of Object.keys(a)) o[k] = +(b[k] - a[k]).toFixed(4); return o; };
  // Pre-consume every Titan first-kill grant so the two runs start from the same shelf.
  window.__start();
  for (let i = 0; i < 4; i++) window.__killTitan(window.__TITANS[i]);
  window.__end(1500);

  window.__start();                                  // a run that earns ALL THREE titles
  const a0 = window.__stats();
  window.__pacts(3);
  for (let i = 0; i < 4; i++) window.__killTitan(window.__TITANS[i]);
  g._chaosTitansKilled = 4;
  window.__end(1500);
  const titled = delta(a0, window.__stats());

  window.__start();                                  // the SAME run, one short of every threshold
  const b0 = window.__stats();
  window.__pacts(2);
  for (let i = 0; i < 3; i++) window.__killTitan(window.__TITANS[i]);
  g._chaosTitansKilled = 3;
  window.__end(1500);
  const plain = delta(b0, window.__stats());
  return { titled, plain, diff: delta(plain, titled) };
});
check('C01 earning all three titles pays EXACTLY what an untitled run of the same length pays',
  Object.values(matched.diff).every(v => v === 0),
  JSON.stringify({ titled: matched.titled, plain: matched.plain, diff: matched.diff }));

const noStore = await page.evaluate(async (build) => {
  const { UNLOCK_KEYS, MetaProgress } = await import(`./js/game/MetaProgress.js?v=${build}`);
  const g = window.__g;
  const keep = localStorage.getItem('phenix_meta');
  const stub = g.meta._save, proto = Object.getPrototypeOf(g.meta);
  g.meta._save = proto._save;
  g.meta.chaosLedger = [];
  g.meta.recordChaosRun({ char: 'skeleton_warrior', law: 'blood_grid', secs: 1500,
                          rank: 'GOLD', kills: 10, titans: 4, corrupted: 3 });
  g.meta._save();
  const fresh = new MetaProgress();
  const row = (fresh.getChaosLedger() || [])[0] || {};
  const out = {
    keys: UNLOCK_KEYS.filter(k => /titan_hunter|law_survivor|corrupted_soul|run_?title/i.test(k)),
    rowKeys: Object.keys(row).filter(k => /title/i.test(k)),
    reloaded: window.__names(row),
  };
  g.meta._save = stub;
  if (keep !== null) localStorage.setItem('phenix_meta', keep);
  return out;
}, BUILD);
check('C02 nothing new is stored — no unlock key, no Ledger field; it rebuilds from the numbers',
  noStore.keys.length === 0 && noStore.rowKeys.length === 0 &&
  JSON.stringify(noStore.reloaded) === JSON.stringify(['TITAN HUNTER', 'LAW SURVIVOR', 'CORRUPTED SOUL']),
  JSON.stringify(noStore));

const completion = await page.evaluate(() => {
  const g = window.__g;
  const before = g._chaosCompletion();
  g.meta.chaosLedger = [];
  for (let i = 0; i < 20; i++) {
    g.meta.recordChaosRun({ char: 'skeleton_warrior', law: 'blood_grid', secs: 1800,
                            rank: 'PLATINUM', kills: 999, titans: 4, corrupted: 5 });
  }
  return { before: before.done, after: g._chaosCompletion().done, total: g._chaosCompletion().total };
});
check('C03 CONTROL — titles are NOT collectibles: CHAOS COMPLETION does not move',
  completion.after === completion.before && completion.total === 38,
  JSON.stringify(completion));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
await shot('results.png');
const draw = await page.evaluate(() => {
  const g = window.__g;
  for (const sel of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel']) {
    const n = document.querySelector(sel); if (n) n.remove();
  }
  try { g._hideMenuOverlay?.(); } catch (_) {}
  window.__start();
  g.gameState = 'playing'; g.gameOver = false; g.victory = false;
  window.__step(45);
  let err = null;
  try { g.draw(window.__ctx()); } catch (e) { err = String(e); }
  const ctx = window.__ctx();
  const { width: w, height: h } = ctx.canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, max = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += v; if (v > max) max = v;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  const n = Math.floor(d.length / (4 * 97));
  return { mean: sum / n, max, colors: colors.size, err, state: g.gameState };
});
await shot('chaos_run.png');
check('D01 the game is still rendering IN A RUN — no black screen',
  draw.err === null && draw.state === 'playing' &&
  draw.mean > 3 && draw.max > 40 && draw.colors > 30, JSON.stringify(draw));
check('D02 zero page errors across the whole session',
  pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D03 zero console errors across the whole session',
  consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); }
fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, failures }, null, 2));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
