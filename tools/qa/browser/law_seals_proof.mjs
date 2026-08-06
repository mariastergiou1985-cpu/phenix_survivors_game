// ════════════════════════════════════════════════════════════════════════════════
// LAW SEALS — six cosmetic seals, one per Chaos Law, earned at 10:00 under that Law.
//
// Like the Titan Trophies, these mint NO new save state: meta.lawMastery already stores the best
// Chaos time per Law (it is what prints "BEST 12:34" on the card), so the seal is that record
// reaching 10:00. The S-block proves the threshold and the per-Law independence; the U-block
// proves both surfaces; the C-block proves it changes nothing.
//
// Every seal in the S-block is earned by a REAL Chaos run driven through _grantRewards, so
// submitLawRun writes the record the same way a player's run does.
//
// Run: node tools/qa/browser/law_seals_proof.mjs [port]
// Writes: /tmp/law_seals_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/law_seals_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8925;
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

const LAWS = ['blood_grid', 'frozen_eden', 'serpent_law', 'dragon_law', 'no_mercy_protocol', 'broken_signal'];
await page.evaluate(async ([LAWS]) => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__LAWS = LAWS;
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
  window.__wipe = () => { g.meta.lawMastery = {}; };
  // A REAL Chaos run under `law`, ended at `secs` through the shipped reward path — so the record
  // is written by submitLawRun exactly as a player's run writes it.
  window.__run = (law, secs) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = law;
    g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
    try { g._beginChaosRun(); } catch (_) {}
    g.runChaosLaw = law;
    window.__step(20);
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false; g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
  };
  window.__sealed = () => LAWS.map(l => !!g._lawSealed(l));
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
  // The pre-run Law overlay, read back per card.
  window.__openLaw = () => {
    try { g._showChaosLawSelectionOverlay(); } catch (e) { window.__err = String(e); }
    const el = document.getElementById('cgm-chaos-law-sel');
    if (!el) return null;
    const cards = [...el.querySelectorAll('.cls-card[data-law]')].map(c => ({
      law:  c.dataset.law,
      best: (c.querySelector('.cls-card-best')?.textContent || '').trim(),
      seal: (c.querySelector('.cls-card-seal')?.textContent || '').trim(),
      locked: !!c.querySelector('.cls-card-seal.locked'),
    }));
    const ring = g._clsNodes ? g._clsNodes().length : -1;
    const ringHasSeal = g._clsNodes ? g._clsNodes().some(n => n.classList?.contains('cls-card-seal')) : true;
    try { g._hideChaosLawSelectionOverlay(); } catch (_) {}
    return { cards, ring, ringHasSeal };
  };
  window.__openCol = (tab) => {
    try { g.goToAchievementsScreen(); } catch (_) {}
    try { g._colSelectTab?.(tab); } catch (_) {}
    try { const t = document.querySelector(`.ct-tab[data-tab="${tab}"]`); if (t) t.click(); } catch (_) {}
  };
  window.__sealSection = () => {
    const sec = document.querySelector('#cxc-seals');
    const n   = document.querySelector('#cxc-seals-n');
    if (!sec) return null;
    const rows = [...sec.querySelectorAll('.sl-row')].map(r => ({
      mark:  (r.querySelector('.sl-num')?.textContent || '').trim(),
      title: (r.querySelector('.sl-title-row')?.textContent || '').trim(),
      req:   (r.querySelector('.sl-text')?.textContent || '').trim(),
      st:    (r.querySelector('.sl-status')?.textContent || '').trim(),
    }));
    return { rows, n: (n?.textContent || '').trim(), text: sec.textContent };
  };
}, [LAWS]);

// ════════════════════════════════════════════════════════════════════════════
// S. EARNING THEM
// ════════════════════════════════════════════════════════════════════════════
const threshold = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  const cold = window.__sealed();
  window.__run('blood_grid', 599);                 // ONE SECOND short of 10:00
  const short = { sealed: window.__sealed(), best: g.meta.getLawBest('blood_grid') };
  window.__run('blood_grid', 600);                 // exactly 10:00
  const exact = { sealed: window.__sealed(), best: g.meta.getLawBest('blood_grid') };
  return { cold, short, exact };
});
check('S01 no Law is sealed before any run',
  threshold.cold.every(v => v === false), JSON.stringify(threshold.cold));
check('S02 9:59 does not seal it, 10:00 exactly does',
  threshold.short.sealed[0] === false && threshold.short.best === 599 &&
  threshold.exact.sealed[0] === true && threshold.exact.best === 600,
  JSON.stringify({ at599: threshold.short, at600: threshold.exact }));

const perLaw = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  const out = [];
  for (const law of window.__LAWS) {
    window.__run(law, 700);
    out.push(window.__sealed().filter(Boolean).length);
  }
  return { out, mastery: { ...g.meta.lawMastery } };
});
check('S03 each Law seals ONLY itself — six runs, six seals, one at a time',
  JSON.stringify(perLaw.out) === JSON.stringify([1, 2, 3, 4, 5, 6]) &&
  Object.keys(perLaw.mastery).length === 6,
  JSON.stringify(perLaw.out));

const lawless = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run(null, 1200);                        // a LAWLESS run, well past 10:00
  const afterLawless = window.__sealed();
  g.selectedCharacter = 'skeleton_warrior';        // and plain Endless under a "law"
  g.gameState = 'playing'; g.reset();
  try { g._enterEndless(); } catch (_) {}
  g.runChaosLaw = 'blood_grid';
  g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
  g.timeAlive = 1200; g.gameOver = true; g.rewardsGranted = false;
  try { g._grantRewards(); } catch (_) {}
  return { afterLawless, afterEndless: window.__sealed() };
});
check('S04 CONTROL — a lawless run seals nothing, and Endless never seals at all',
  lawless.afterLawless.every(v => !v) && lawless.afterEndless.every(v => !v),
  JSON.stringify(lawless));

const keepBest = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('dragon_law', 900);                 // sealed at 15:00
  const sealed = g._lawSealed('dragon_law');
  window.__run('dragon_law', 120);                 // a much worse later run
  return { sealed, stillSealed: g._lawSealed('dragon_law'), best: g.meta.getLawBest('dragon_law') };
});
check('S05 a later WORSE run cannot un-seal it — the record is a best, not a last',
  keepBest.sealed === true && keepBest.stillSealed === true && keepBest.best === 900,
  JSON.stringify(keepBest));

// ════════════════════════════════════════════════════════════════════════════
// U. THE TWO SURFACES
// ════════════════════════════════════════════════════════════════════════════
const card = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  const cold = window.__openLaw();
  g.meta.lawMastery = { blood_grid: 754, frozen_eden: 400 };
  const mixed = window.__openLaw();
  return { cold, mixed };
});
check('U01 every Law card carries a seal line, unsealed by default',
  card.cold && card.cold.cards.length === 6 &&
  card.cold.cards.every(c => c.locked === true && /UNSEALED · 10:00 TO SEAL/.test(c.seal)),
  JSON.stringify(card.cold?.cards[0]));
check('U02 a sealed Law prints its seal; one short of 10:00 still reads UNSEALED',
  /SEAL OF THE BLOOD GRID/.test(card.mixed.cards.find(c => c.law === 'blood_grid').seal) &&
  card.mixed.cards.find(c => c.law === 'blood_grid').locked === false &&
  /UNSEALED/.test(card.mixed.cards.find(c => c.law === 'frozen_eden').seal) &&
  card.mixed.cards.find(c => c.law === 'frozen_eden').locked === true,
  JSON.stringify(card.mixed.cards.slice(0, 2)));
check('U03 the seal line is NOT selectable — the keyboard/controller ring is unchanged',
  card.cold.ring === 8 && card.mixed.ring === 8 && card.cold.ringHasSeal === false,
  JSON.stringify({ ring: card.mixed.ring, hasSeal: card.cold.ringHasSeal }));

const tab = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__openCol('chaos');
  const locked = window.__sealSection();
  g.meta.lawMastery = { blood_grid: 700, dragon_law: 1200 };
  window.__openCol('chaos');
  const some = window.__sealSection();
  for (const l of window.__LAWS) g.meta.lawMastery[l] = 900;
  window.__openCol('chaos');
  const all = window.__sealSection();
  return { locked, some, all };
});
check('U04 the CHAOS tab lists all SIX, unsealed, naming the Law each one needs',
  tab.locked && tab.locked.rows.length === 6 && tab.locked.n === '0 / 6' &&
  tab.locked.rows.every(r => r.title === '???' && /Survive 10:00 in Chaos under /.test(r.req) &&
                             /UNSEALED/.test(r.st)) &&
  /BLOOD GRID/.test(tab.locked.text) && /BROKEN SIGNAL/.test(tab.locked.text),
  JSON.stringify({ n: tab.locked?.n, first: tab.locked?.rows[0] }));
check('U05 the tab counts and names only the ones actually sealed, and shows the record',
  tab.some.n === '2 / 6' &&
  /SEAL OF THE BLOOD GRID/.test(tab.some.text) && /SEAL OF THE DRAGON/.test(tab.some.text) &&
  !/SEAL OF FROZEN EDEN/.test(tab.some.text) &&
  /Best 11:40/.test(tab.some.text) && /Best 20:00/.test(tab.some.text),
  JSON.stringify({ n: tab.some.n }));
check('U06 all six names and all six distinct marks reach the tab',
  tab.all.n === '6 / 6' &&
  ['SEAL OF THE BLOOD GRID', 'SEAL OF FROZEN EDEN', 'SEAL OF THE SERPENT',
   'SEAL OF THE DRAGON', 'SEAL OF NO MERCY', 'SEAL OF THE BROKEN SIGNAL']
    .every(n => tab.all.text.includes(n)) &&
  new Set(tab.all.rows.map(r => r.mark)).size === 6,
  JSON.stringify(tab.all.rows.map(r => r.mark)));

// ════════════════════════════════════════════════════════════════════════════
// C. COSMETIC — it must change nothing
// ════════════════════════════════════════════════════════════════════════════
// No _grantRewards between the two snapshots. The first version called __run() again to "play a
// bit after earning them", and __run ends the run through the reward path — so it read +1 credit
// and +3 Eden Memory and blamed the seals for the run's own shipped payout. The seals are granted,
// both surfaces are opened, and 60 real frames are stepped, all inside ONE unfinished run.
const cosmetic = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  g.selectedCharacter = 'skeleton_warrior';
  g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
  g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
  try { g._beginChaosRun(); } catch (_) {}
  window.__step(20);
  const before = window.__stats();
  for (const l of window.__LAWS) g.meta.lawMastery[l] = 3600;   // every seal, maxed
  window.__openCol('chaos'); window.__openLaw();
  window.__step(60);
  return { before, after: window.__stats() };
});
check('C01 owning all six changes NO currency, NO stat, NO relic and NO unlock',
  JSON.stringify(cosmetic.before) === JSON.stringify(cosmetic.after),
  JSON.stringify({ before: cosmetic.before, after: cosmetic.after }));

const noKeys = await page.evaluate(async (build) => {
  const { UNLOCK_KEYS, MetaProgress } = await import(`./js/game/MetaProgress.js?v=${build}`);
  const g = window.__g;
  const keep = localStorage.getItem('phenix_meta');
  const stub = g.meta._save, proto = Object.getPrototypeOf(g.meta);
  // A save written before seals existed already carries the lawMastery that earns them.
  g.meta._save = proto._save;
  g.meta.lawMastery = { serpent_law: 1000, frozen_eden: 200 };
  g.meta._save();
  const fresh = new MetaProgress();
  const out = {
    keys: UNLOCK_KEYS.filter(k => /seal/i.test(k)),
    reloaded: { serpent: fresh.getLawBest('serpent_law'), frozen: fresh.getLawBest('frozen_eden') },
    hasSealKey: JSON.stringify(fresh).toLowerCase().includes('seal'),
  };
  g.meta._save = stub;
  if (keep !== null) localStorage.setItem('phenix_meta', keep);
  return out;
}, BUILD);
check('C02 no new UNLOCK_KEYS entry and no new save field — the seal is derived from lawMastery',
  noKeys.keys.length === 0 && noKeys.hasSealKey === false &&
  noKeys.reloaded.serpent === 1000 && noKeys.reloaded.frozen === 200,
  JSON.stringify(noKeys));

const others = await page.evaluate(() => {
  const g = window.__g;
  for (const l of window.__LAWS) g.meta.lawMastery[l] = 3600;
  window.__openCol('chaos');
  return {
    sig: document.querySelector('#cxc-sigils-n')?.textContent?.trim(),
    tro: document.querySelector('#cxc-trophies-n')?.textContent?.trim(),
    ranks: document.querySelector('#cxc-ranks-n')?.textContent?.trim(),
  };
});
check('C03 CONTROL — the sigil, trophy and rank sections are untouched by the new one',
  /\/ 12$/.test(others.sig || '') && /\/ 4$/.test(others.tro || '') && /\/ 10$/.test(others.ranks || ''),
  JSON.stringify(others));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
await shot('chaos_tab.png');
const draw = await page.evaluate(() => {
  const g = window.__g;
  window.__run('blood_grid', 100);
  g.gameOver = false; g.victory = false;
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
