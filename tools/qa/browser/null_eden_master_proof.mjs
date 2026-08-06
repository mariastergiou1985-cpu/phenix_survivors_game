// ════════════════════════════════════════════════════════════════════════════════
// NULL EDEN MASTER — one cosmetic badge for the whole roster.
//
// Earned when EVERY playable character has reached at least SILVER on the Chaos Survival Rank.
// Derived from meta.chaosRanks, which submitChaosRun has written at the end of every Chaos run
// since Phase B — so no new save key, nothing in UNLOCK_KEYS, and retroactive.
//
// The two things worth proving hardest:
//   M-block — "at least SILVER" really means GOLD and PLATINUM count too, and nine of ten is not
//             enough. A string compare would have got the first part wrong.
//   U-block — it shows on the CHAOS tab and in Character Select, including when the tenth rank
//             lands MID-SESSION with the header already built.
//
// Run: node tools/qa/browser/null_eden_master_proof.mjs [port]
// Writes: /tmp/null_eden_master_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/null_eden_master_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8927;
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
  window.__roster = () => (g.characters || []).filter(c => !c.comingSoon).map(c => c.id);
  window.__wipe = () => { g.meta.chaosRanks = {}; };
  // Sets ranks through the SHIPPED submitChaosRun, so the thresholds under test are the game's own
  // (10 / 20 / 30 minutes) rather than a rank string I typed into the harness.
  window.__rank = (charId, secs) => { g.meta.submitChaosRun(charId, secs); };
  window.__setAll = (secs, skipLast) => {
    window.__wipe();
    const r = window.__roster();
    const n = skipLast ? r.length - 1 : r.length;
    for (let i = 0; i < n; i++) window.__rank(r[i], secs);
  };
  window.__master = () => ({ is: !!g._isNullEdenMaster(), prog: g._masterProgress() });
  // A REAL Chaos run for the given character, ended at `secs` through the shipped reward path.
  window.__run = (charId, secs) => {
    g.selectedCharacter = charId;
    g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
    try { g._beginChaosRun(); } catch (_) {}
    window.__step(20);
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false; g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
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
  window.__openCol = (tab) => {
    try { g.goToAchievementsScreen(); } catch (_) {}
    try { g._colSelectTab?.(tab); } catch (_) {}
    try { const t = document.querySelector(`.ct-tab[data-tab="${tab}"]`); if (t) t.click(); } catch (_) {}
    const sec = document.querySelector('#cxc-master');
    const n   = document.querySelector('#cxc-master-n');
    if (!sec) return null;
    const row = sec.querySelector('.sl-row');
    return {
      mark:  (row?.querySelector('.sl-num')?.textContent || '').trim(),
      title: (row?.querySelector('.sl-title-row')?.textContent || '').trim(),
      req:   (row?.querySelector('.sl-text')?.textContent || '').trim(),
      st:    (row?.querySelector('.sl-status')?.textContent || '').trim(),
      n:     (n?.textContent || '').trim(),
    };
  };
  // Character Select. Anchored on the badge element itself, and its VISIBILITY is read from the
  // computed style — textContent bubbles, and a hidden element still has text.
  window.__csc = () => {
    try { g.goToCharacterSelect?.(); } catch (_) {}
    try { g._syncCharSelectOverlay?.(); } catch (_) {}
    const b = document.querySelector('#csc-master-badge');
    if (!b) return { present: false };
    return {
      present: true,
      shown: getComputedStyle(b).display !== 'none',
      text: (b.textContent || '').trim(),
      title: b.title || '',
    };
  };
});

// ════════════════════════════════════════════════════════════════════════════
// M. EARNING IT
// ════════════════════════════════════════════════════════════════════════════
const roster = await page.evaluate(() => window.__roster());
check('M00 the playable roster is the ten characters the badge is about',
  roster.length === 10, `${roster.length} playable`);

const ladder = await page.evaluate(() => {
  const g = window.__g;
  const out = {};
  //  9:59 -> BRONZE, 10:00 -> SILVER, 20:00 -> GOLD, 30:00 -> PLATINUM (submitChaosRun's own map)
  for (const [label, secs] of [['bronze', 599], ['silver', 600], ['gold', 1200], ['platinum', 1800]]) {
    window.__setAll(secs);
    out[label] = { ...window.__master(), rank: g.meta.chaosRanks[window.__roster()[0]]?.bestRank };
  }
  return out;
});
check('M01 BRONZE across the roster is NOT enough',
  ladder.bronze.rank === 'BRONZE' && ladder.bronze.is === false && ladder.bronze.prog.at === 0,
  JSON.stringify(ladder.bronze));
check('M02 SILVER across the roster earns it',
  ladder.silver.rank === 'SILVER' && ladder.silver.is === true && ladder.silver.prog.at === 10,
  JSON.stringify(ladder.silver));
check('M03 "at least SILVER" really includes GOLD and PLATINUM',
  ladder.gold.rank === 'GOLD' && ladder.gold.is === true &&
  ladder.platinum.rank === 'PLATINUM' && ladder.platinum.is === true,
  JSON.stringify({ gold: ladder.gold.is, platinum: ladder.platinum.is }));

const nine = await page.evaluate(() => {
  const g = window.__g;
  window.__setAll(900, true);                    // nine at SILVER, one untouched
  const at9 = window.__master();
  window.__rank(window.__roster()[9], 900);      // the tenth
  const at10 = window.__master();
  window.__wipe();
  window.__setAll(900);
  window.__rank(window.__roster()[3], 100);      // a WORSE later run for one of them
  const afterWorse = window.__master();
  return { at9, at10, afterWorse };
});
check('M04 nine of ten is not enough — the tenth completes it',
  nine.at9.is === false && nine.at9.prog.at === 9 &&
  nine.at10.is === true && nine.at10.prog.at === 10,
  JSON.stringify({ at9: nine.at9.prog, at10: nine.at10.prog }));
check('M05 a later WORSE run cannot take it away — chaosRanks holds a best, not a last',
  nine.afterWorse.is === true && nine.afterWorse.prog.at === 10, JSON.stringify(nine.afterWorse));

const mixed = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  const r = window.__roster();
  // A realistic spread: some GOLD, some SILVER, one stuck on BRONZE.
  r.forEach((id, i) => window.__rank(id, i === 5 ? 400 : (i % 2 ? 1300 : 700)));
  const stuck = window.__master();
  window.__rank(r[5], 650);                      // that one finally clears 10:00
  return { stuck, after: window.__master() };
});
check('M06 one character short of SILVER holds the whole badge back',
  mixed.stuck.is === false && mixed.stuck.prog.at === 9 &&
  mixed.after.is === true && mixed.after.prog.at === 10,
  JSON.stringify({ stuck: mixed.stuck.prog, after: mixed.after.prog }));

const real = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  const r = window.__roster();
  for (let i = 0; i < r.length - 1; i++) window.__run(r[i], 700);   // nine REAL Chaos runs
  const at9 = window.__master();
  window.__run(r[r.length - 1], 700);                               // the tenth, for real
  return { at9, at10: window.__master() };
});
check('M07 earned through TEN REAL Chaos runs, not by writing ranks by hand',
  real.at9.is === false && real.at9.prog.at === 9 && real.at10.is === true && real.at10.prog.at === 10,
  JSON.stringify({ at9: real.at9.prog, at10: real.at10.prog }));

// ════════════════════════════════════════════════════════════════════════════
// U. THE TWO SURFACES
// ════════════════════════════════════════════════════════════════════════════
const tab = await page.evaluate(() => {
  window.__setAll(900, true);                    // nine of ten
  const partial = window.__openCol('chaos');
  window.__setAll(900);                          // all ten
  const full = window.__openCol('chaos');
  window.__wipe();
  const empty = window.__openCol('chaos');
  return { empty, partial, full };
});
check('U01 the CHAOS tab shows it LOCKED with the live count while short',
  tab.partial && tab.partial.title === '???' && /LOCKED/.test(tab.partial.st) &&
  tab.partial.n === '9 / 10' && /9 of 10 at SILVER or better/.test(tab.partial.req),
  JSON.stringify(tab.partial));
check('U02 the CHAOS tab names it and marks it MASTERED once all ten are there',
  tab.full && tab.full.title === 'NULL EDEN MASTER' && /MASTERED/.test(tab.full.st) &&
  tab.full.n === '10 / 10' && tab.full.mark === '☬',
  JSON.stringify(tab.full));
check('U03 a fresh save reads 0 / 10, not a blank or a NaN',
  tab.empty && tab.empty.n === '0 / 10' && /0 of 10 at SILVER or better/.test(tab.empty.req),
  JSON.stringify(tab.empty));

const csc = await page.evaluate(() => {
  window.__wipe();
  const none = window.__csc();
  window.__setAll(900, true);
  const nine = window.__csc();
  window.__setAll(900);
  const all = window.__csc();
  return { none, nine, all };
});
check('U04 Character Select hides the badge entirely until it is earned',
  csc.none.present === true && csc.none.shown === false && csc.none.text === '' &&
  csc.nine.shown === false,
  JSON.stringify({ none: csc.none.shown, nine: csc.nine.shown }));
check('U05 Character Select shows it, named, once all ten are at SILVER',
  csc.all.shown === true && /NULL EDEN MASTER/.test(csc.all.text) && /☬/.test(csc.all.text) &&
  /at least SILVER/.test(csc.all.title),
  JSON.stringify(csc.all));

const midSession = await page.evaluate(() => {
  window.__wipe();
  window.__setAll(900, true);
  window.__csc();                                 // header built, badge hidden
  const before = window.__csc();
  window.__run(window.__roster()[9], 700);        // the tenth rank lands MID-SESSION
  const after = window.__csc();
  return { before, after };
});
check('U06 the tenth rank landing MID-SESSION shows the badge without a reload',
  midSession.before.shown === false && midSession.after.shown === true &&
  /NULL EDEN MASTER/.test(midSession.after.text),
  JSON.stringify({ before: midSession.before.shown, after: midSession.after.shown }));

const revoke = await page.evaluate(() => {
  window.__setAll(900);
  const on = window.__csc();
  window.__wipe();
  const off = window.__csc();
  return { on: on.shown, off: off.shown, text: off.text };
});
check('U07 it disappears cleanly when the ranks go away — no orphan chip left behind',
  revoke.on === true && revoke.off === false && revoke.text === '', JSON.stringify(revoke));

// ════════════════════════════════════════════════════════════════════════════
// C. COSMETIC — no gameplay reward
// ════════════════════════════════════════════════════════════════════════════
const cosmetic = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  g.selectedCharacter = 'skeleton_warrior';
  g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
  g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
  try { g._beginChaosRun(); } catch (_) {}
  window.__step(20);
  const before = window.__stats();
  window.__setAll(1800);                          // PLATINUM everywhere — the badge, maxed
  window.__openCol('chaos'); window.__csc();
  window.__step(60);
  return { before, after: window.__stats(), is: g._isNullEdenMaster() };
});
check('C01 earning it changes NO currency, NO stat, NO relic and NO unlock',
  cosmetic.is === true && JSON.stringify(cosmetic.before) === JSON.stringify(cosmetic.after),
  JSON.stringify({ before: cosmetic.before, after: cosmetic.after }));

const noKeys = await page.evaluate(async (build) => {
  const { UNLOCK_KEYS, MetaProgress } = await import(`./js/game/MetaProgress.js?v=${build}`);
  const g = window.__g;
  const keep = localStorage.getItem('phenix_meta');
  const stub = g.meta._save, proto = Object.getPrototypeOf(g.meta);
  g.meta._save = proto._save;
  window.__setAll(900);
  g.meta._save();
  const fresh = new MetaProgress();
  const ranked = Object.keys(fresh.chaosRanks || {}).length;
  const out = {
    // Anchored on the badge's own name, not on a bare /master/ — that matched the shipped
    // `grandmaster_dojang_girl` secret-skin key and reported a "new" key this commit never added.
    keys: UNLOCK_KEYS.filter(k => /null_?eden_?master/i.test(k)),
    ranked,
    hasMasterKey: JSON.stringify(fresh).toLowerCase().includes('nulledenmaster'),
  };
  g.meta._save = stub;
  if (keep !== null) localStorage.setItem('phenix_meta', keep);
  return out;
}, BUILD);
check('C02 RETROACTIVE — no new UNLOCK_KEYS entry and no new save field; it reads chaosRanks',
  noKeys.keys.length === 0 && noKeys.hasMasterKey === false && noKeys.ranked === 10,
  JSON.stringify(noKeys));

const others = await page.evaluate(() => {
  window.__setAll(1800);
  window.__openCol('chaos');
  return {
    sig:  document.querySelector('#cxc-sigils-n')?.textContent?.trim(),
    tro:  document.querySelector('#cxc-trophies-n')?.textContent?.trim(),
    seal: document.querySelector('#cxc-seals-n')?.textContent?.trim(),
    rank: document.querySelector('#cxc-ranks-n')?.textContent?.trim(),
  };
});
check('C03 CONTROL — the sigil, trophy, seal and rank sections are untouched by the new one',
  /\/ 12$/.test(others.sig || '') && /\/ 4$/.test(others.tro || '') &&
  /\/ 6$/.test(others.seal || '') && /\/ 10$/.test(others.rank || ''),
  JSON.stringify(others));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
await shot('char_select.png');
const draw = await page.evaluate(() => {
  const g = window.__g;
  // Force a REAL run before sampling. The DOM screens this file opens (Collection, Character
  // Select) leave gameState on those screens and their overlay up, and draw() correctly renders
  // nothing to the canvas there — so a "no black screen" check that sampled from one was reading
  // a legitimately blank surface and calling it a black screen. Diagnosed 14/14 reproducible with
  // gameState 'character_select'. The state is now forced, and asserted, before sampling.
  const __toRun = () => {
    // Leave the DOM screens through the SHIPPED teardown, not by ripping nodes out. Removing
    // #cgm-charselect by hand left g._charSelectOverlayEl cached, so update() walked gameState
    // straight back to 'character_select' and the frame sampled a screen the canvas does not draw.
    try { g._hideCharSelectOverlay?.(); } catch (_) {}
    try { g._hideChaosLawSelectionOverlay?.(); } catch (_) {}
    try { g._hideMenuOverlay?.(); } catch (_) {}
    for (const sel of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel']) {
      const n = document.querySelector(sel); if (n) n.remove();
    }
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
    try { g._beginChaosRun(); } catch (_) {}
    g.gameState = 'playing'; g.gameOver = false; g.victory = false;
  };
  __toRun();
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
