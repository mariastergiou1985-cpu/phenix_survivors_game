// ════════════════════════════════════════════════════════════════════════════════
// MetaProgress.reset() — REGRESSION. Nine PERSISTED fields used to survive a wipe.
//
// Found by diffing the constructor's field list against reset(). Every survivor is written by
// _save(), so leaving it out did not merely skip it — the value came straight back on the next
// load while everything around it was zero:
//
//   chaosRanks · rewardedPFTotal · edenMilestonesSeen · systemLogsSeen
//   fusionCards · lastPlayerLevelRewarded · bestEddieTime · totalEddieTime
//   (profileName is deliberately KEPT — it is the player's name, not progress)
//
// chaosRanks is the headline: the Chaos Survival Rank per character IS the Chaos record, and
// everything derived from it — NULL EDEN MASTER, the RANKS column of CHAOS COMPLETION, the
// FULL ROSTER sigil — came back with it.
//
// The D-block is the other half of the brief: a NORMAL save must be completely unaffected.
//
// Run: node tools/qa/browser/meta_reset_completeness_proof.mjs [port]
// Writes: /tmp/meta_reset_completeness_proof/
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/meta_reset_completeness_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8947;
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

// The MetaProgress module itself, so every check runs against a REAL instance built by the real
// constructor and torn down by the real reset() — not against the live game's shared object.
const mpv = await page.evaluate(async (build) => {
  const src = await fetch(`./js/game/Game.js?v=${build}`).then(r => r.text());
  return (src.match(/MetaProgress\.js\?v=(\d+)/) || [])[1] || build;
}, BUILD);
await page.evaluate(async (v) => {
  const mod = await import(`./js/game/MetaProgress.js?v=${v}`);
  window.__MP = mod.MetaProgress;
  window.__KEY = 'phenix_meta';
  // Fills a save with a plausible, fully-progressed player: Chaos records, a Ledger, contracts
  // paid, Law Mastery, sigils, archive entries, Titan kills — the lot.
  window.__fill = (m) => {
    m.credits = 5000; m.protocolFragments = 40; m.rewardedPFTotal = 18;
    m.chaosRanks = { skeleton_warrior: { bestSecs: 1800, bestRank: 'PLATINUM' },
                     brawler_warrior:  { bestSecs: 900,  bestRank: 'SILVER'   } };
    m.chaosLedger = [{ char: 'skeleton_warrior', law: 'blood_grid', secs: 1500, rank: 'GOLD',
                       kills: 900, titans: 4, corrupted: 3, contract: 'tc_boss_rush',
                       contractDone: true, date: '1/1/2026' }];
    m.lawMastery = { blood_grid: 1500, dragon_law: 700 };
    m.bossKills = { titan_overlord: true, titan_tyrant: true };
    m.unlocks = { sg_titanbreaker: true, ba_cold_open: true, sg_archivist: true };
    m.relics = { overlord_prism_array: true }; m.equippedRelic = 'overlord_prism_array';
    m.bossEchoes = { overlordMega: true }; m.echoesActive = { overlordMega: true };
    m.edenMemoryPercent = 88; m.edenMilestonesSeen = { 25: true, 50: true };
    m.systemLogsSeen = { 10: true };
    // A REAL fusion id at a REAL tier. The first version used { fc_x: true }, which _load
    // CORRECTLY discards — it drops unknown ids and non-numeric tiers as save repair — so the
    // round-trip check was failing against a loader doing exactly its job.
    m.fusionCards = { fus_ossuary_impaler: 2 };
    m.lastPlayerLevelRewarded = 42; m.bestEddieTime = 321; m.totalEddieTime = 9999;
    m.achievements = { a1: true }; m.stagesCleared = 7; m.endlessUnlocked = true;
    m.runHistory = [{ mode: 'Chaos' }];
    m.profileName = 'MARIA';
  };
  // Everything reset() is supposed to leave at zero.
  window.__snap = (m) => ({
    credits: m.credits, pf: m.protocolFragments, rewardedPFTotal: m.rewardedPFTotal,
    chaosRanks: Object.keys(m.chaosRanks || {}).length,
    chaosLedger: (m.chaosLedger || []).length,
    lawMastery: Object.keys(m.lawMastery || {}).length,
    bossKills: Object.keys(m.bossKills || {}).length,
    unlocks: Object.keys(m.unlocks || {}).length,
    relics: Object.keys(m.relics || {}).length, equippedRelic: m.equippedRelic,
    bossEchoes: Object.keys(m.bossEchoes || {}).length,
    echoesActive: Object.keys(m.echoesActive || {}).length,
    eden: m.edenMemoryPercent,
    edenMilestonesSeen: Object.keys(m.edenMilestonesSeen || {}).length,
    systemLogsSeen: Object.keys(m.systemLogsSeen || {}).length,
    fusionCards: Object.keys(m.fusionCards || {}).length,
    lastPlayerLevelRewarded: m.lastPlayerLevelRewarded,
    bestEddieTime: m.bestEddieTime, totalEddieTime: m.totalEddieTime,
    achievements: Object.keys(m.achievements || {}).length,
    stagesCleared: m.stagesCleared, endlessUnlocked: m.endlessUnlocked,
    runHistory: (m.runHistory || []).length,
  });
  window.__fresh = () => { localStorage.removeItem(window.__KEY); return window.__snap(new window.__MP()); };
});

// ════════════════════════════════════════════════════════════════════════════
// R. THE RESET
// ════════════════════════════════════════════════════════════════════════════
const inMemory = await page.evaluate(() => {
  const keep = localStorage.getItem(window.__KEY);
  const m = new window.__MP();
  window.__fill(m);
  const before = window.__snap(m);
  m.reset();
  const after = window.__snap(m);
  const fresh = window.__fresh();
  if (keep !== null) localStorage.setItem(window.__KEY, keep); else localStorage.removeItem(window.__KEY);
  return { before, after, fresh };
});
check('R01 the fixture really was fully progressed before the wipe',
  inMemory.before.chaosRanks === 2 && inMemory.before.chaosLedger === 1 &&
  inMemory.before.lawMastery === 2 && inMemory.before.rewardedPFTotal === 18 &&
  inMemory.before.credits === 5000,
  JSON.stringify(inMemory.before));
check('R02 reset() leaves the object IDENTICAL to a brand-new MetaProgress',
  JSON.stringify(inMemory.after) === JSON.stringify(inMemory.fresh),
  JSON.stringify({ after: inMemory.after, fresh: inMemory.fresh }));

const chaosBits = await page.evaluate(() => {
  const keep = localStorage.getItem(window.__KEY);
  const m = new window.__MP();
  window.__fill(m);
  m.reset();
  const out = {
    chaosRanks: Object.keys(m.chaosRanks || {}).length,
    chaosLedger: (m.chaosLedger || []).length,
    lawMastery: Object.keys(m.lawMastery || {}).length,
    rewardedPFTotal: m.rewardedPFTotal,
    unlocks: Object.keys(m.unlocks || {}).length,
    bossKills: Object.keys(m.bossKills || {}).length,
  };
  if (keep !== null) localStorage.setItem(window.__KEY, keep); else localStorage.removeItem(window.__KEY);
  return out;
});
check('R03 every CHAOS record is gone — ranks, Ledger, Law Mastery, contract PF, unlocks, Titan kills',
  chaosBits.chaosRanks === 0 && chaosBits.chaosLedger === 0 && chaosBits.lawMastery === 0 &&
  chaosBits.rewardedPFTotal === 0 && chaosBits.unlocks === 0 && chaosBits.bossKills === 0,
  JSON.stringify(chaosBits));

// The check that actually matters: a wipe has to SURVIVE A RELOAD. Every field that was missing is
// persisted, so the old reset() wrote a save that brought the values straight back.
const reloaded = await page.evaluate(() => {
  const keep = localStorage.getItem(window.__KEY);
  const m = new window.__MP();
  window.__fill(m);
  m._save();
  m.reset();                      // reset() saves as its last act
  const afterReload = window.__snap(new window.__MP());
  const fresh = window.__fresh();
  if (keep !== null) localStorage.setItem(window.__KEY, keep); else localStorage.removeItem(window.__KEY);
  return { afterReload, fresh };
});
check('R04 the wipe SURVIVES A RELOAD — nothing comes back from the save',
  JSON.stringify(reloaded.afterReload) === JSON.stringify(reloaded.fresh),
  JSON.stringify({ reloaded: reloaded.afterReload, fresh: reloaded.fresh }));

const noSurvivors = await page.evaluate(() => {
  // Diff the CONSTRUCTOR's own field set against a reset instance, field by field, so a future
  // field added to the constructor and forgotten here fails this check automatically.
  const keep = localStorage.getItem(window.__KEY);
  const virgin = new window.__MP();
  const wiped  = new window.__MP();
  window.__fill(wiped);
  wiped.reset();
  const diff = [];
  for (const k of Object.keys(virgin)) {
    if (k.startsWith('_')) continue;
    const a = JSON.stringify(virgin[k]), b = JSON.stringify(wiped[k]);
    if (a !== b) diff.push({ field: k, fresh: a, afterReset: b });
  }
  if (keep !== null) localStorage.setItem(window.__KEY, keep); else localStorage.removeItem(window.__KEY);
  return diff;
});
check('R05 NO field survives a reset except profileName, which is kept on purpose',
  noSurvivors.length === 1 && noSurvivors[0].field === 'profileName',
  JSON.stringify(noSurvivors));

const derived = await page.evaluate(() => {
  const g = window.__g, keep = localStorage.getItem(window.__KEY);
  const saved = g.meta;
  const m = new window.__MP();
  window.__fill(m);
  g.meta = m;
  const before = { master: g._isNullEdenMaster(), completion: g._chaosCompletion().done,
                   ranks: g._chaosCompletion().parts[0].done };
  m.reset();
  const after = { master: g._isNullEdenMaster(), completion: g._chaosCompletion().done,
                  ranks: g._chaosCompletion().parts[0].done };
  g.meta = saved;
  if (keep !== null) localStorage.setItem(window.__KEY, keep); else localStorage.removeItem(window.__KEY);
  return { before, after };
});
check('R06 everything DERIVED from chaosRanks resets with it — completion and the MASTER badge',
  derived.before.completion > 0 && derived.before.ranks > 0 &&
  derived.after.completion === 0 && derived.after.ranks === 0 && derived.after.master === false,
  JSON.stringify(derived));

// ════════════════════════════════════════════════════════════════════════════
// D. A NORMAL SAVE IS UNTOUCHED
// ════════════════════════════════════════════════════════════════════════════
const normal = await page.evaluate(() => {
  const keep = localStorage.getItem(window.__KEY);
  const m = new window.__MP();
  window.__fill(m);
  m._save();
  const raw = localStorage.getItem(window.__KEY);
  const reloadedSnap = window.__snap(new window.__MP());
  const filled = window.__snap(m);
  const parsed = JSON.parse(raw || '{}');
  if (keep !== null) localStorage.setItem(window.__KEY, keep); else localStorage.removeItem(window.__KEY);
  const diff = [];
  for (const k of Object.keys(filled)) {
    if (JSON.stringify(filled[k]) !== JSON.stringify(reloadedSnap[k]))
      diff.push({ field: k, saved: filled[k], loaded: reloadedSnap[k] });
  }
  return { same: diff.length === 0, diff, keys: Object.keys(parsed).length,
           hasChaosRanks: !!parsed.chaosRanks, name: parsed.profileName };
});
check('D01 a save/load round trip with NO reset is unchanged — normal play is untouched',
  normal.same === true && normal.hasChaosRanks === true && normal.keys > 25,
  JSON.stringify({ same: normal.same, keys: normal.keys, diff: normal.diff }));

const nameKept = await page.evaluate(() => {
  const keep = localStorage.getItem(window.__KEY);
  const m = new window.__MP();
  window.__fill(m);
  m.reset();
  const after = m.profileName;
  const reloadedName = new window.__MP().profileName;
  if (keep !== null) localStorage.setItem(window.__KEY, keep); else localStorage.removeItem(window.__KEY);
  return { after, reloadedName };
});
check('D02 the player\'s profile name is deliberately KEPT across a reset',
  nameKept.after === 'MARIA' && nameKept.reloadedName === 'MARIA', JSON.stringify(nameKept));

const idempotent = await page.evaluate(() => {
  const keep = localStorage.getItem(window.__KEY);
  const m = new window.__MP();
  window.__fill(m);
  m.reset(); const once = window.__snap(m);
  m.reset(); m.reset(); const thrice = window.__snap(m);
  if (keep !== null) localStorage.setItem(window.__KEY, keep); else localStorage.removeItem(window.__KEY);
  return { same: JSON.stringify(once) === JSON.stringify(thrice) };
});
check('D03 reset() is idempotent — three in a row is the same as one',
  idempotent.same === true, JSON.stringify(idempotent));

const liveGame = await page.evaluate(() => {
  const g = window.__g;
  let err = null;
  try {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
    g._beginChaosRun();
    for (let i = 0; i < 40; i++) g.update(1 / 60, { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });
  } catch (e) { err = String(e); }
  return { err, state: g.gameState };
});
check('D04 the live game still starts and runs a Chaos run after all this',
  liveGame.err === null && liveGame.state === 'playing', JSON.stringify(liveGame));
check('D05 zero page errors across the whole session',
  pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D06 zero console errors across the whole session',
  consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); }
fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, failures }, null, 2));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
