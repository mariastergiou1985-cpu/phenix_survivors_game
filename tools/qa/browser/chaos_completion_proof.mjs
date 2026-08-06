// ════════════════════════════════════════════════════════════════════════════════
// CHAOS COMPLETION — one cosmetic percentage over everything Chaos has to collect.
//
//   RANKS 10 · TITANS 4 · SEALS 6 · SIGILS 12 · ARCHIVE 6   = 38
//
// Every source is already derivable from persisted state, so this mints nothing. The two things
// worth proving hardest:
//   P-block — the arithmetic is right at every edge (0%, partial, 37/38, 100%) and the denominator
//             comes from the TABLES rather than a hardcoded 38, so it moves on its own.
//   N-block — nothing is double-counted, and the sources that must NOT be in it (the Chaos Ledger,
//             and NULL EDEN MASTER, which is itself derived from RANKS) are not.
//
// Run: node tools/qa/browser/chaos_completion_proof.mjs [port]
// Writes: /tmp/chaos_completion_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_completion_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8929;
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

const SIGILS = ['sg_titanbreaker', 'sg_unbroken', 'sg_apex', 'sg_pactbound',
                'sg_lawless', 'sg_centurion', 'sg_full_roster', 'sg_iron_will',
                'sg_archivist', 'sg_reliquary', 'sg_platinum', 'sg_chronicler'];
const ARCHIVE = ['ba_cold_open', 'ba_still_standing', 'ba_long_silence',
                 'ba_broken_word', 'ba_the_bargain', 'ba_unfinished'];
const FLAGS = ['titan_overlord', 'titan_leviathan', 'titan_emperor', 'titan_tyrant'];
const LAWS  = ['blood_grid', 'frozen_eden', 'serpent_law', 'dragon_law', 'no_mercy_protocol', 'broken_signal'];
await page.evaluate(async ([SIGILS, ARCHIVE, FLAGS, LAWS]) => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__SIGILS = SIGILS; window.__ARCHIVE = ARCHIVE; window.__FLAGS = FLAGS; window.__LAWS = LAWS;
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
  window.__roster = () => (g.characters || []).filter(c => !c.comingSoon).map(c => c.id);
  window.__wipe = () => {
    g.meta.chaosRanks = {}; g.meta.bossKills = {}; g.meta.lawMastery = {};
    g.meta.chaosLedger = [];
    for (const k of SIGILS.concat(ARCHIVE)) delete g.meta.unlocks[k];
  };
  // Fill exactly N of one source, leaving the rest alone.
  window.__fill = {
    ranks:   (n) => { const r = window.__roster(); for (let i = 0; i < n; i++) g.meta.submitChaosRun(r[i], 900); },
    titans:  (n) => { for (let i = 0; i < n; i++) g.meta.bossKills[FLAGS[i]] = true; },
    seals:   (n) => { for (let i = 0; i < n; i++) g.meta.lawMastery[LAWS[i]] = 900; },
    sigils:  (n) => { for (let i = 0; i < n; i++) g.meta.unlock(SIGILS[i]); },
    archive: (n) => { for (let i = 0; i < n; i++) g.meta.unlock(ARCHIVE[i]); },
  };
  window.__fillAll = () => { window.__fill.ranks(10); window.__fill.titans(4); window.__fill.seals(6);
                             window.__fill.sigils(12); window.__fill.archive(6); };
  window.__comp = () => g._chaosCompletion();
  window.__stats = () => ({
    credits: g.meta.credits || 0, pf: g.meta.protocolFragments || 0,
    eden: g.meta.getEdenMemory ? g.meta.getEdenMemory() : 0,
    rewardedPF: g.meta.rewardedPFTotal || 0,
    level: g.meta.getPlayerProgression ? g.meta.getPlayerProgression().level : 0,
    relics: Object.keys(g.meta.relics || {}).length,
    maxHp: g.player?.maxHp || 0, speed: g.player?.speed || 0,
    xpMult: g.player?.xpMult || 0, cdMult: g.player?.abilityCdMult || 0,
    dr: g.player?.contactDamageReduction || 0, pulse: g.player?.pulseDamage || 0,
  });
  window.__openCol = () => {
    try { g.goToAchievementsScreen(); } catch (_) {}
    try { g._colSelectTab?.('chaos'); } catch (_) {}
    try { const t = document.querySelector('.ct-tab[data-tab="chaos"]'); if (t) t.click(); } catch (_) {}
    const pct = document.querySelector('#cxc-completion-pct');
    const bar = document.querySelector('#cxc-completion-bar');
    const prt = document.querySelector('#cxc-completion-parts');
    if (!pct) return null;
    return { pct: (pct.textContent || '').trim(), bar: bar ? bar.style.width : null,
             parts: (prt?.textContent || '').trim() };
  };
}, [SIGILS, ARCHIVE, FLAGS, LAWS]);

// ════════════════════════════════════════════════════════════════════════════
// P. THE ARITHMETIC
// ════════════════════════════════════════════════════════════════════════════
const empty = await page.evaluate(() => { window.__wipe(); return window.__comp(); });
check('P01 a fresh save reads 0% over the five sources, with the right denominators',
  empty.pct === 0 && empty.done === 0 && empty.total === 38 &&
  JSON.stringify(empty.parts.map(p => [p.label, p.total])) ===
    JSON.stringify([['RANKS', 10], ['TITANS', 4], ['SEALS', 6], ['SIGILS', 12], ['ARCHIVE', 6]]),
  JSON.stringify({ total: empty.total, parts: empty.parts.map(p => p.label + ':' + p.total) }));

const full = await page.evaluate(() => { window.__wipe(); window.__fillAll(); return window.__comp(); });
check('P02 everything collected reads exactly 100%, 38 of 38',
  full.pct === 100 && full.done === 38 && full.total === 38 &&
  full.parts.every(p => p.done === p.total),
  JSON.stringify({ pct: full.pct, done: full.done, parts: full.parts.map(p => p.label + ' ' + p.done + '/' + p.total) }));

const each = await page.evaluate(() => {
  const out = {};
  for (const [k, n] of [['ranks', 10], ['titans', 4], ['seals', 6], ['sigils', 12], ['archive', 6]]) {
    window.__wipe();
    window.__fill[k](n);
    const c = window.__comp();
    out[k] = { done: c.done, pct: c.pct, part: c.parts.find(p => p.label.toLowerCase().startsWith(k.slice(0, 4)))?.done };
  }
  return out;
});
check('P03 each source contributes exactly its own count and nothing else\'s',
  each.ranks.done === 10 && each.titans.done === 4 && each.seals.done === 6 &&
  each.sigils.done === 12 && each.archive.done === 6,
  JSON.stringify(each));

const edge = await page.evaluate(() => {
  window.__wipe(); window.__fillAll();
  // Drop exactly ONE, from the archive. 37/38 = 97.3% and must NOT round up to 100.
  g_meta_drop();
  function g_meta_drop() { delete window.__g.meta.unlocks[window.__ARCHIVE[5]]; }
  const at37 = window.__comp();
  window.__g.meta.unlock(window.__ARCHIVE[5]);
  return { at37, at38: window.__comp() };
});
check('P04 37 of 38 is 97%, NOT 100 — the percentage is floored, so 99% means unfinished',
  edge.at37.done === 37 && edge.at37.pct === 97 && edge.at38.pct === 100,
  JSON.stringify({ at37: edge.at37.pct, at38: edge.at38.pct }));

const mixed = await page.evaluate(() => {
  window.__wipe();
  window.__fill.ranks(3); window.__fill.titans(2); window.__fill.seals(1);
  window.__fill.sigils(5); window.__fill.archive(4);
  return window.__comp();
});
check('P05 a partial sheet sums correctly: 3+2+1+5+4 = 15 of 38 = 39%',
  mixed.done === 15 && mixed.total === 38 && mixed.pct === 39,
  JSON.stringify({ done: mixed.done, pct: mixed.pct, parts: mixed.parts.map(p => p.label + ' ' + p.done) }));

const derived = await page.evaluate(async (build) => {
  const mod = await import(`./js/game/Game.js?v=${build}`);
  // The denominator must come from the TABLES, not a literal. Read the source and assert no
  // hardcoded 38 is doing the work — if a sigil is added tomorrow this has to move by itself.
  const src = await fetch(`./js/game/Game.js?v=${build}`).then(r => r.text());
  const fn = (src.match(/_chaosCompletion\(\)\s*\{[\s\S]*?\n  \}/) || [''])[0];
  // COMMENTS STRIPPED before the test. The first version matched the word "38" inside this
  // function's own comment ("100% at 37 of 38") and reported a hardcoded denominator that does not
  // exist. Only executable lines can hardcode anything.
  const code = fn.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  return { hasLiteral38: /\b38\b/.test(code), usesTables: /TITAN_TROPHIES|LAW_SEALS|CHAOS_SIGILS|BROKEN_ARCHIVE/.test(code) };
}, BUILD);
check('P06 the denominator is computed from the tables, not a hardcoded 38',
  derived.hasLiteral38 === false && derived.usesTables === true, JSON.stringify(derived));

// ════════════════════════════════════════════════════════════════════════════
// N. NOT DOUBLE-COUNTED, NOT STORED
// ════════════════════════════════════════════════════════════════════════════
const ledger = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__fill.ranks(10);
  const before = window.__comp();
  // A full Chaos Ledger and the NULL EDEN MASTER badge must move NOTHING: the ledger is a log,
  // and the master badge is itself derived from the same ten rank records already counted.
  for (let i = 0; i < 20; i++) {
    g.meta.recordChaosRun({ char: 'skeleton_warrior', law: 'blood_grid', secs: 900,
                            rank: 'SILVER', kills: 50, titans: 1, corrupted: 1 });
  }
  return { before, after: window.__comp(), master: !!g._isNullEdenMaster(),
           ledgerLen: (g.meta.getChaosLedger() || []).length };
});
check('N01 a full Chaos Ledger and the MASTER badge move the percentage by ZERO',
  ledger.master === true && ledger.ledgerLen === 20 &&
  ledger.after.done === ledger.before.done && ledger.after.total === ledger.before.total,
  JSON.stringify({ before: ledger.before.done, after: ledger.after.done, master: ledger.master }));

const noDouble = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  // ARCHIVIST is a SIGIL earned by owning the whole ARCHIVE. Both are counted, once each — 6
  // archive entries plus 1 sigil = 7, not 6 or 12.
  window.__fill.archive(6);
  const archiveOnly = window.__comp();
  g.meta.unlock('sg_archivist');
  const withSigil = window.__comp();
  // And re-unlocking the same key cannot inflate it.
  for (let i = 0; i < 5; i++) { g.meta.unlock('sg_archivist'); window.__fill.archive(6); }
  return { archiveOnly: archiveOnly.done, withSigil: withSigil.done, repeated: window.__comp().done };
});
check('N02 overlapping unlocks are counted ONCE each, and repeats cannot inflate it',
  noDouble.archiveOnly === 6 && noDouble.withSigil === 7 && noDouble.repeated === 7,
  JSON.stringify(noDouble));

const comingSoon = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  const roster = window.__roster().length;
  const all = (g.characters || []).length;
  const c = window.__comp();
  // Null-safe: on a build where _chaosCompletion returns no parts this must FAIL, not throw and
  // take every check after it down with it.
  return { roster, all, ranksTotal: c?.parts?.[0]?.total ?? -1 };
});
check('N03 the RANKS denominator is the PLAYABLE roster, not the raw character list',
  comingSoon.ranksTotal === comingSoon.roster, JSON.stringify(comingSoon));

const noStore = await page.evaluate(async (build) => {
  const { UNLOCK_KEYS, MetaProgress } = await import(`./js/game/MetaProgress.js?v=${build}`);
  const g = window.__g;
  const keep = localStorage.getItem('phenix_meta');
  const stub = g.meta._save, proto = Object.getPrototypeOf(g.meta);
  g.meta._save = proto._save;
  window.__wipe(); window.__fillAll();
  g.meta._save();
  const blob = JSON.parse(localStorage.getItem('phenix_meta') || '{}');
  const out = {
    // Anchored on THIS feature's name. A bare /percent/ matched the shipped `edenMemoryPercent`
    // save field and reported a new field this commit never added.
    keys: UNLOCK_KEYS.filter(k => /chaos_?completion/i.test(k)),
    hasField: Object.keys(blob).some(k => /chaosCompletion|completionPct/i.test(k)),
    reloadedPct: null,
  };
  const fresh = new MetaProgress();
  const savedMeta = g.meta; g.meta = fresh;
  out.reloadedPct = g._chaosCompletion().pct;      // 100% must survive purely from the save
  g.meta = savedMeta;
  g.meta._save = stub;
  if (keep !== null) localStorage.setItem('phenix_meta', keep);
  return out;
}, BUILD);
check('N04 nothing new is stored — the percentage rebuilds itself from a reloaded save',
  noStore.keys.length === 0 && noStore.hasField === false && noStore.reloadedPct === 100,
  JSON.stringify(noStore));

const cosmetic = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  g.selectedCharacter = 'skeleton_warrior';
  g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
  g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
  try { g._beginChaosRun(); } catch (_) {}
  window.__step(20);
  const before = window.__stats();
  window.__fillAll();
  window.__openCol();
  window.__step(60);
  return { before, after: window.__stats(), pct: window.__comp().pct };
});
check('N05 reaching 100% changes NO currency, NO relic and NO player stat',
  cosmetic.pct === 100 && JSON.stringify(cosmetic.before) === JSON.stringify(cosmetic.after),
  JSON.stringify({ before: cosmetic.before, after: cosmetic.after }));

// ════════════════════════════════════════════════════════════════════════════
// U. THE TAB
// ════════════════════════════════════════════════════════════════════════════
const ui = await page.evaluate(() => {
  window.__wipe();
  const zero = window.__openCol();
  window.__fill.ranks(3); window.__fill.titans(2); window.__fill.seals(1);
  window.__fill.sigils(5); window.__fill.archive(4);
  const part = window.__openCol();
  window.__fillAll();
  const done = window.__openCol();
  return { zero, part, done };
});
check('U01 the CHAOS tab prints the percentage and drives the bar from it',
  ui.zero && ui.zero.pct === '0%' && ui.zero.bar === '0%' &&
  ui.part.pct === '39%' && ui.part.bar === '39%' &&
  ui.done.pct === '100%' && ui.done.bar === '100%',
  JSON.stringify({ zero: ui.zero?.pct, part: ui.part.pct, done: ui.done.pct, bar: ui.done.bar }));
check('U02 the breakdown names all five sources, so the number is never a black box',
  /15 \/ 38/.test(ui.part.parts) && /RANKS 3\/10/.test(ui.part.parts) &&
  /TITANS 2\/4/.test(ui.part.parts) && /SEALS 1\/6/.test(ui.part.parts) &&
  /SIGILS 5\/12/.test(ui.part.parts) && /ARCHIVE 4\/6/.test(ui.part.parts),
  ui.part.parts);
check('U03 a fresh save shows 0 / 38 rather than a blank or a NaN',
  /^0 \/ 38 ·/.test(ui.zero.parts) && !/NaN|undefined/.test(ui.zero.parts), ui.zero.parts);

const others = await page.evaluate(() => {
  window.__fillAll();
  window.__openCol();
  return {
    master: document.querySelector('#cxc-master-n')?.textContent?.trim(),
    sig:    document.querySelector('#cxc-sigils-n')?.textContent?.trim(),
    tro:    document.querySelector('#cxc-trophies-n')?.textContent?.trim(),
    seal:   document.querySelector('#cxc-seals-n')?.textContent?.trim(),
    rank:   document.querySelector('#cxc-ranks-n')?.textContent?.trim(),
  };
});
check('U04 CONTROL — every other section on the tab still reads exactly what it read before',
  others.master === '10 / 10' && others.sig === '12 / 12' && others.tro === '4 / 4' &&
  others.seal === '6 / 6' && others.rank === '10 / 10',
  JSON.stringify(others));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
await shot('chaos_tab.png');
const draw = await page.evaluate(() => {
  const g = window.__g;
  for (const sel of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel']) {
    const n = document.querySelector(sel); if (n) n.remove();
  }
  try { g._hideMenuOverlay?.(); } catch (_) {}
  g.selectedCharacter = 'skeleton_warrior';
  g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
  g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
  try { g._beginChaosRun(); } catch (_) {}
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
