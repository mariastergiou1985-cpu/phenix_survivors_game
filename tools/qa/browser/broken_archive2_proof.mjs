// ════════════════════════════════════════════════════════════════════════════════
// BROKEN ARCHIVE, second wave — three more entries recovered from FAILURE.
//
//   C4  THE BROKEN WORD          end a Chaos run with its contract unfulfilled
//   C5  WHAT THE PACT WAS FOR    die in Chaos after sealing a corrupted pact
//   C6  THE UNFINISHED ROTATION  die in Chaos with a Mega Titan still active
//
// C6 SHARES C2's condition, at Maria's explicit instruction after the overlap was flagged. That is
// a design decision, not an accident, so B07 pins it: the two must always move as a PAIR. If one
// ever unlocks without the other, that is a bug and this file says so.
//
// The other thing worth proving is the knock-on: the ARCHIVIST sigil is
// BROKEN_ARCHIVE.every(...), so it silently went from needing three entries to needing six. A05
// and A06 assert that is exactly what happens and that its printed requirement no longer names a
// number it can drift from.
//
// Run: node tools/qa/browser/broken_archive2_proof.mjs [port]
// Writes: /tmp/broken_archive2_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/broken_archive2_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8923;
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

const ALL6 = ['ba_cold_open', 'ba_still_standing', 'ba_long_silence',
               'ba_broken_word', 'ba_the_bargain', 'ba_unfinished'];
const NEW3 = ALL6.slice(3);
await page.evaluate(async ([ALL6, NEW3]) => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__ALL6 = ALL6; window.__NEW3 = NEW3;
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
  window.__wipe = () => { for (const k of ALL6) delete g.meta.unlocks[k]; delete g.meta.unlocks.sg_archivist; };
  window.__has = () => ALL6.map(k => !!g.meta.isUnlocked(k));
  window.__new = () => NEW3.map(k => !!g.meta.isUnlocked(k));

  window.__run = (mode, contractId) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    if (mode === 'chaos') {
      g._contractRolled = true;
      g.runChaosContract = contractId === undefined ? 'tc_boss_rush' : contractId;
      try { g._beginChaosRun(); } catch (_) {}
      g.runChaosContract = contractId === undefined ? 'tc_boss_rush' : contractId;
    } else {
      g.reset();
      try { g._enterEndless(); } catch (_) {}
      g.runChaosContract = null;
    }
    window.__step(20);
  };
  window.__at = (secs) => { g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs; };
  // Seals a REAL corrupted pact by writing into mutations.taken with the shipped `corrupt_` key
  // prefix — the same store the ledger and the PACTBOUND sigil re-derive their counts from.
  window.__pact = (n) => {
    if (!g.mutations) g.mutations = {};
    if (!g.mutations.taken) g.mutations.taken = {};
    g.mutations.taken['corrupt_test_pact'] = n;
  };
  window.__titanAlive = (alive) => {
    g._activeTitan = alive ? { enemyType: 'Giga-Core Overlord', hp: 5000, isMegaBoss: true,
                               pos: { x: 0, y: 0 } } : null;
  };
  window.__end = (secs, died) => {
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    window.__at(secs);
    g.gameOver = died !== false; g.victory = died === false;
    g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
  };
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
  window.__openLore = () => {
    try { g.goToAchievementsScreen(); } catch (_) {}
    try { g._colSelectTab?.('lore'); } catch (_) {}
    try { const t = document.querySelector('.ct-tab[data-tab="lore"]'); if (t) t.click(); } catch (_) {}
    const list = document.querySelector('#ba-list');
    const n    = document.querySelector('#ba-n');
    if (!list) return null;
    const rows = [...list.querySelectorAll('.sl-row')].map(r => ({
      num:   (r.querySelector('.sl-num')?.textContent || '').trim(),
      title: (r.querySelector('.sl-title-row')?.textContent || '').trim(),
      body:  (r.querySelector('.sl-text')?.textContent || '').trim(),
      st:    (r.querySelector('.sl-status')?.textContent || '').trim(),
    }));
    return { rows, n: (n?.textContent || '').trim(), text: list.textContent };
  };
  window.__sigilReq = () => {
    try { g._colSelectTab?.('chaos'); } catch (_) {}
    try { const t = document.querySelector('.ct-tab[data-tab="chaos"]'); if (t) t.click(); } catch (_) {}
    const sec = document.querySelector('#cxc-sigils');
    if (!sec) return null;
    const row = [...sec.querySelectorAll('.sl-row')].find(r =>
      /Broken Archive/.test(r.querySelector('.sl-text')?.textContent || ''));
    return row ? (row.querySelector('.sl-text')?.textContent || '').trim() : null;
  };
}, [ALL6, NEW3]);

// ════════════════════════════════════════════════════════════════════════════
// B. EARNING THE THREE
// ════════════════════════════════════════════════════════════════════════════
const brokenWord = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'tc_boss_rush');
  g._chaosRushCleared = 1; g._updateChaosContract();      // contract FULFILLED
  window.__end(400, false);
  const fulfilled = !!g.meta.isUnlocked('ba_broken_word');
  window.__wipe();
  window.__run('chaos', 'tc_boss_rush');                  // never cleared one
  window.__end(400, false);
  const failed = !!g.meta.isUnlocked('ba_broken_word');
  return { fulfilled, failed };
});
check('B01 C4 THE BROKEN WORD — recovered only when the contract goes UNFULFILLED',
  brokenWord.fulfilled === false && brokenWord.failed === true, JSON.stringify(brokenWord));

const noContract = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', null);                            // a run with NO contract at all
  window.__end(400, false);
  return { got: !!g.meta.isUnlocked('ba_broken_word'), contract: g.runChaosContract };
});
check('B02 C4 needs a contract to have been offered — a run with none has nothing to fail',
  noContract.got === false, JSON.stringify(noContract));

const pact = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos');
  window.__end(400, true);                                // died, NO pact sealed
  const noPact = !!g.meta.isUnlocked('ba_the_bargain');
  window.__wipe();
  window.__run('chaos');
  window.__pact(2);
  window.__end(400, false);                               // pact sealed, SURVIVED
  const survived = !!g.meta.isUnlocked('ba_the_bargain');
  window.__wipe();
  window.__run('chaos');
  window.__pact(1);
  window.__end(400, true);                                // pact sealed AND died
  const both = !!g.meta.isUnlocked('ba_the_bargain');
  return { noPact, survived, both };
});
check('B03 C5 WHAT THE PACT WAS FOR — needs BOTH a sealed pact and a death',
  pact.noPact === false && pact.survived === false && pact.both === true, JSON.stringify(pact));

const unfinished = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos');
  window.__titanAlive(false);
  window.__end(400, true);                                // died, no Titan on the field
  const noTitan = window.__ALL6.map(k => !!g.meta.isUnlocked(k));
  window.__wipe();
  window.__run('chaos');
  window.__titanAlive(true);
  window.__end(400, false);                               // Titan alive, but SURVIVED
  const alive = !!g.meta.isUnlocked('ba_unfinished');
  window.__wipe();
  window.__run('chaos');
  window.__titanAlive(true);
  window.__end(400, true);                                // died with a Titan still up
  const both = { c2: !!g.meta.isUnlocked('ba_still_standing'),
                 c6: !!g.meta.isUnlocked('ba_unfinished') };
  return { noTitan, alive, both };
});
check('B04 C6 THE UNFINISHED ROTATION — needs a death with a Mega Titan still up',
  unfinished.noTitan[5] === false && unfinished.alive === false && unfinished.both.c6 === true,
  JSON.stringify({ noTitan: unfinished.noTitan[5], survived: unfinished.alive, died: unfinished.both.c6 }));

const pairing = await page.evaluate(() => {
  const g = window.__g;
  const out = [];
  // Six runs across the whole space of (titan alive) x (died) — C2 and C6 must never diverge.
  for (const titan of [true, false]) {
    for (const died of [true, false]) {
      window.__wipe();
      window.__run('chaos');
      window.__titanAlive(titan);
      window.__end(400, died);
      out.push({ titan, died, c2: !!g.meta.isUnlocked('ba_still_standing'),
                 c6: !!g.meta.isUnlocked('ba_unfinished') });
    }
  }
  return out;
});
check('B05 C6 and C2 are COMPANION entries — they always move as a pair, by design',
  pairing.length === 4 && pairing.every(r => r.c2 === r.c6) &&
  pairing.filter(r => r.c2).length === 1,
  JSON.stringify(pairing));

const notChaos = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('endless');
  window.__pact(3); window.__titanAlive(true);
  window.__end(400, true);
  return window.__has();
});
check('B06 CONTROL — none of the six can be recovered outside Chaos',
  notChaos.every(v => v === false), JSON.stringify(notChaos));

// Idempotency asserted as ONE RUN vs THREE IDENTICAL RUNS, not against a number I counted by
// hand. The first version expected five entries from this scenario and got four — and four was
// right (a 400 s run is past C1's 3:00 window and short of C3's 10:00), so the assertion was
// wrong, not the code. A hand-counted expectation would also have to be re-counted every time an
// entry is added; this one never does.
const idem = await page.evaluate(() => {
  const g = window.__g;
  const doRun = () => {
    window.__run('chaos');
    window.__pact(1); window.__titanAlive(true);
    window.__end(400, true);
  };
  const keys = () => Object.keys(g.meta.unlocks).filter(k => k.indexOf('ba_') === 0).sort().join(',');
  window.__wipe();
  doRun();
  const once = keys();
  doRun(); doRun();
  const thrice = keys();
  return { once, thrice, n: once ? once.split(',').length : 0 };
});
check('B07 repeating the same failure recovers each entry once, not many times',
  idem.n > 0 && idem.once === idem.thrice, JSON.stringify(idem));

// ════════════════════════════════════════════════════════════════════════════
// A. THE CORRUPTED SECTION, and the ARCHIVIST knock-on
// ════════════════════════════════════════════════════════════════════════════
const lore = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  const locked = window.__openLore();
  for (const k of window.__ALL6) g.meta.unlock(k);
  const open = window.__openLore();
  return { locked, open };
});
check('A01 the CORRUPTED section lists SIX entries, C1 to C6',
  lore.locked && lore.locked.rows.length === 6 && lore.locked.n === '0 / 6' &&
  lore.locked.rows.map(r => r.num).join(',') === 'C1,C2,C3,C4,C5,C6',
  JSON.stringify({ n: lore.locked?.n, nums: lore.locked?.rows.map(r => r.num) }));
check('A02 locked entries hide their text and show the requirement instead',
  lore.locked.rows.slice(3).every(r => r.title === '???' && /LOST/.test(r.st) && r.body.length > 0) &&
  /contract unfulfilled/.test(lore.locked.text) &&
  /corrupted pact/.test(lore.locked.text) &&
  /Mega Titan still active/.test(lore.locked.text),
  JSON.stringify(lore.locked.rows[3]));
check('A03 recovered entries print their title and their text',
  lore.open.n === '6 / 6' &&
  /THE BROKEN WORD/.test(lore.open.text) &&
  /WHAT THE PACT WAS FOR/.test(lore.open.text) &&
  /THE UNFINISHED ROTATION/.test(lore.open.text) &&
  lore.open.rows.slice(3).every(r => /RECOVERED/.test(r.st) && r.body.length > 120),
  JSON.stringify({ n: lore.open.n, sts: lore.open.rows.map(r => r.st) }));

const archivist = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  for (const k of window.__ALL6.slice(0, 3)) g.meta.unlock(k);   // the ORIGINAL three
  window.__run('chaos');
  window.__end(400, false);
  const atThree = !!g.meta.isUnlocked('sg_archivist');
  for (const k of window.__ALL6) g.meta.unlock(k);
  window.__run('chaos');
  window.__end(400, false);
  const atSix = !!g.meta.isUnlocked('sg_archivist');
  return { atThree, atSix, req: window.__sigilReq() };
});
check('A04 ARCHIVIST now needs the WHOLE archive — three is no longer enough',
  archivist.atThree === false && archivist.atSix === true,
  JSON.stringify({ atThree: archivist.atThree, atSix: archivist.atSix }));
check('A05 and its printed requirement no longer names a number it can drift from',
  archivist.req && /every Broken Archive entry/i.test(archivist.req) && !/three/i.test(archivist.req),
  archivist.req);

// ════════════════════════════════════════════════════════════════════════════
// C. INERT — no reward, no gameplay
// ════════════════════════════════════════════════════════════════════════════
const inert = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos');
  const before = window.__stats();
  for (const k of window.__ALL6) g.meta.unlock(k);
  window.__openLore();
  window.__run('chaos');
  window.__step(60);
  return { before, after: window.__stats() };
});
check('C01 recovering all six changes NO currency, NO relic and NO player stat',
  JSON.stringify(inert.before) === JSON.stringify(inert.after),
  JSON.stringify({ before: inert.before, after: inert.after }));

const failCost = await page.evaluate(() => {
  const g = window.__g;
  const delta = (a, b) => { const o = {}; for (const k of Object.keys(a)) o[k] = +(b[k] - a[k]).toFixed(4); return o; };
  // Two matched runs — same length, same death — differing ONLY in whether they trip the new
  // entries. Recovering lore must cost and pay exactly nothing.
  window.__wipe();
  window.__run('chaos');
  const a0 = window.__stats();
  window.__titanAlive(false);
  window.__end(400, true);
  const plain = delta(a0, window.__stats());

  window.__wipe();
  window.__run('chaos');
  const b0 = window.__stats();
  window.__pact(2); window.__titanAlive(true);
  window.__end(400, true);
  const lorey = delta(b0, window.__stats());
  return { plain, lorey, diff: delta(plain, lorey), got: window.__has().filter(Boolean).length };
});
check('C02 a run that recovers THREE entries pays exactly what an identical run without them pays',
  failCost.got >= 3 && Object.values(failCost.diff).every(v => v === 0),
  JSON.stringify({ recovered: failCost.got, diff: failCost.diff }));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
await shot('lore_tab.png');
const draw = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos');
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
  return { mean: sum / n, max, colors: colors.size, err };
});
await shot('chaos_run.png');
check('D01 the game is still rendering — no black screen',
  draw.err === null && draw.mean > 3 && draw.max > 40 && draw.colors > 30, JSON.stringify(draw));
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
