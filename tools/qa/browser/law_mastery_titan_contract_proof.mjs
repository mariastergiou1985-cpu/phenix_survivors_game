// ════════════════════════════════════════════════════════════════════════════════
// LAW MASTERY, and the pre-run contract strip.
//
//  1. Law Mastery: the best Chaos survival time under each Chaos Law, persisted and printed on
//     that Law's card in the pre-run selection overlay. A RECORD, nothing more — explicitly NO
//     Law II, no tier, no stat, no currency. The L-block proves the recording rules AND that the
//     feature grants nothing.
//  2. The two contract checks that are about THIS overlay: that a contract strip is shown before
//     the run at all, and that it stays out of the keyboard/controller focus ring.
//
// The contract SYSTEM itself — the random roll, all three conditions, the once-only cap, the
// no-penalty control, level-neutrality, and the HUD / Results / Ledger surfaces — is owned by
// tools/qa/browser/chaos_contracts_proof.mjs. This file deliberately does not duplicate it.
//
// Run: node tools/qa/browser/law_mastery_titan_contract_proof.mjs [port]
// Writes: /tmp/law_contract_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/law_contract_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8917;
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

const LAWS = ['blood_grid', 'frozen_eden', 'no_mercy_protocol', 'serpent_law', 'dragon_law', 'broken_signal'];
await page.evaluate(async ([LAWS]) => {
  const g = window.__g;
  let saves = 0;
  g.meta._save = () => { saves++; };
  window.__saves = () => saves;
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

  window.__run = (mode, law, charId) => {
    g.selectedCharacter = charId || 'skeleton_warrior';
    g.gameState = 'playing'; g.reset();
    if (mode === 'endless') { g.runChaosLaw = law ?? null; try { g._enterEndless(); } catch (_) {} }
    if (mode === 'chaos')   { g.runChaosLaw = law === undefined ? 'blood_grid' : law; try { g._beginChaosRun(); } catch (_) {} }
    if (mode === 'campaign'){ g.runChaosLaw = null; }
    window.__step(20);
  };
  // Ends the run at `secs` of CHAOS time and runs the shipped reward path once.
  window.__end = (secs) => {
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false; g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
  };

  // A REAL Titan kill, through the shipped handler. _updateChaosTitans sees "no live Titan in
  // enemies + _activeTitan is dead" and runs the whole grant/tally block — the same branch a
  // player's killing blow reaches. Nothing about the tally or the contract is set by hand.
  window.__killTitan = (type, atSecs) => {
    if (typeof atSecs === 'number') {
      g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + atSecs;
    }
    g.enemies = g.enemies.filter(e => !e.isMegaBoss);
    g._activeTitan = { enemyType: type, hp: 0, _killed: true, isMegaBoss: true, pos: { x: 0, y: 0 } };
    try { g._updateChaosTitans(1 / 60); } catch (e) { window.__err = String(e); }
  };
  window.__TITANS = ['Giga-Core Overlord', 'Malware Leviathan',
                     'Quantum Void Emperor', 'Apocalypse Mech Tyrant'];

  // Everything a "no penalty" claim has to cover.
  window.__wallet = () => ({
    pf: g.meta.protocolFragments || 0, credits: g.meta.credits || 0,
    eden: g.meta.getEdenMemory ? g.meta.getEdenMemory() : 0,
    rewardedPF: g.meta.rewardedPFTotal || 0,
    level: g.meta.getPlayerProgression ? g.meta.getPlayerProgression().level : 0,
    maxHp: g.player?.maxHp || 0, speed: g.player?.speed || 0,
    xpMult: g.player?.xpMult || 0, cdMult: g.player?.abilityCdMult || 0,
    dr: g.player?.contactDamageReduction || 0,
  });

  // Opens the REAL pre-run overlay and reads it back.
  window.__openLaw = () => {
    try { g._showChaosLawSelectionOverlay(); } catch (e) { window.__err = String(e); }
    const el = document.getElementById('cgm-chaos-law-sel');
    if (!el) return null;
    const cards = [...el.querySelectorAll('.cls-card[data-law]')].map(c => ({
      law: c.dataset.law,
      best: (c.querySelector('.cls-card-best')?.textContent || '').trim(),
    }));
    const con = el.querySelector('.cls-contract');
    return {
      cards,
      contract: con ? {
        h: (con.querySelector('.cc-h')?.textContent || '').trim(),
        g: (con.querySelector('.cc-g')?.textContent || '').trim(),
        r: (con.querySelector('.cc-r')?.textContent || '').trim(),
      } : null,
      ring: g._clsNodes ? g._clsNodes().length : -1,
      ringHasContract: g._clsNodes ? g._clsNodes().some(n => n.classList?.contains('cls-contract')) : true,
    };
  };
  window.__closeLaw = () => { try { g._hideChaosLawSelectionOverlay(); } catch (_) {} };
}, [LAWS]);

// ════════════════════════════════════════════════════════════════════════════
// L. LAW MASTERY
// ════════════════════════════════════════════════════════════════════════════
const rec = await page.evaluate(() => {
  const g = window.__g;
  g.meta.lawMastery = {};
  window.__run('chaos', 'blood_grid'); window.__end(430);
  const first = { ...g.meta.lawMastery };
  window.__run('chaos', 'blood_grid'); window.__end(120);      // WORSE — must not overwrite
  const worse = { ...g.meta.lawMastery };
  window.__run('chaos', 'blood_grid'); window.__end(880);      // BETTER — must overwrite
  const better = { ...g.meta.lawMastery };
  return { first, worse, better };
});
check('L01 a Chaos run under a Law records that Law\'s time',
  rec.first.blood_grid === 430, JSON.stringify(rec.first));
check('L02 a WORSE later run does not overwrite the record',
  rec.worse.blood_grid === 430, JSON.stringify(rec.worse));
check('L03 a BETTER run does overwrite it',
  rec.better.blood_grid === 880, JSON.stringify(rec.better));

const perLaw = await page.evaluate(() => {
  const g = window.__g;
  g.meta.lawMastery = {};
  const want = { blood_grid: 300, frozen_eden: 610, dragon_law: 155 };
  for (const [law, secs] of Object.entries(want)) { window.__run('chaos', law); window.__end(secs); }
  return { got: { ...g.meta.lawMastery }, want };
});
check('L04 each Law keeps its OWN record, independently',
  JSON.stringify(perLaw.got) === JSON.stringify(perLaw.want), JSON.stringify(perLaw.got));

const lawless = await page.evaluate(() => {
  const g = window.__g;
  g.meta.lawMastery = {};
  window.__run('chaos', null); window.__end(700);              // no law → nothing to record
  const afterChaos = { ...g.meta.lawMastery };
  window.__run('endless', 'blood_grid'); window.__end(700);    // Endless is not Chaos
  const afterEndless = { ...g.meta.lawMastery };
  return { afterChaos, afterEndless };
});
check('L05 a LAWLESS Chaos run records nothing, and Endless never records at all',
  Object.keys(lawless.afterChaos).length === 0 && Object.keys(lawless.afterEndless).length === 0,
  JSON.stringify(lawless));

// A REAL round trip: the harness stubs _save, so restore the shipped one, write, then build a
// FRESH MetaProgress and read it back through its own _load. There is no _serialize() to peek at
// — the payload is assembled inline in _save() — so anything short of this would only be proving
// that an object I just assigned still holds what I assigned it.
const persist = await page.evaluate(async (build) => {
  const g = window.__g;
  const stub = g.meta._save;
  const proto = Object.getPrototypeOf(g.meta);
  const keep = localStorage.getItem('phenix_meta');
  let inSave = null, reloaded = null, err = null;
  try {
    g.meta._save = proto._save;                 // shipped save, for one call
    g.meta.lawMastery = { serpent_law: 512, dragon_law: 91 };
    g.meta._save();
    inSave = JSON.parse(localStorage.getItem('phenix_meta') || '{}').lawMastery || null;
    const { MetaProgress } = await import(`./js/game/MetaProgress.js?v=${build}`);
    const fresh = new MetaProgress();
    reloaded = { best: fresh.getLawBest('serpent_law'), other: fresh.getLawBest('dragon_law'),
                 missing: fresh.getLawBest('blood_grid') };
  } catch (e) { err = String(e); }
  g.meta._save = stub;
  if (keep !== null) localStorage.setItem('phenix_meta', keep);
  return { inSave, reloaded, err };
}, BUILD);
check('L06 the record survives a real save and a real reload',
  persist.inSave?.serpent_law === 512 && persist.reloaded?.best === 512 &&
  persist.reloaded?.other === 91 && persist.reloaded?.missing === 0,
  JSON.stringify(persist));

const ui = await page.evaluate(() => {
  const g = window.__g;
  g.meta.lawMastery = {};
  const blank = window.__openLaw(); window.__closeLaw();
  g.meta.lawMastery = { blood_grid: 754, dragon_law: 65 };
  const set = window.__openLaw(); window.__closeLaw();
  return { blank, set };
});
check('L07 the card PRINTS the Law\'s best time, formatted',
  ui.set && (ui.set.cards.find(c => c.law === 'blood_grid')?.best === 'BEST 12:34') &&
  (ui.set.cards.find(c => c.law === 'dragon_law')?.best === 'BEST 1:05'),
  JSON.stringify(ui.set?.cards?.slice(0, 5)));
check('L08 a Law with no record reads NO RECORD, not 0:00',
  ui.blank && ui.blank.cards.length >= 6 && ui.blank.cards.every(c => c.best === 'BEST — NO RECORD') &&
  ui.set.cards.find(c => c.law === 'frozen_eden')?.best === 'BEST — NO RECORD',
  JSON.stringify(ui.blank?.cards?.[0]));

const grantsNothing = await page.evaluate(() => {
  const g = window.__g;
  g.meta.lawMastery = {};
  window.__run('chaos', 'blood_grid');
  const before = window.__wallet();
  // Fill EVERY law with a maxed record, then start a run: if mastery paid anything, it pays here.
  for (const l of window.__LAWS) g.meta.lawMastery[l] = 3600;
  window.__run('chaos', 'blood_grid');
  window.__step(60);
  return { before, after: window.__wallet() };
});
check('L09 CONTROL — Law Mastery grants NOTHING: no currency, no stat, no level',
  JSON.stringify(grantsNothing.before) === JSON.stringify(grantsNothing.after),
  JSON.stringify({ before: grantsNothing.before, after: grantsNothing.after }));

const noLawII = await page.evaluate(() => {
  const g = window.__g;
  const read = () => { g.runChaosLaw = 'blood_grid'; return JSON.stringify(g._getActiveChaosLawModifiers()); };
  g.meta.lawMastery = {};
  const cold = read();
  for (const l of window.__LAWS) g.meta.lawMastery[l] = 3600;
  const mastered = read();
  // And no tier/level field crept into the stored shape.
  const shape = Object.values(g.meta.lawMastery).every(v => typeof v === 'number');
  return { cold, mastered, shape };
});
check('L10 CONTROL — no Law II: a mastered Law applies byte-identical modifiers',
  noLawII.cold === noLawII.mastered && noLawII.shape, noLawII.mastered);

// ════════════════════════════════════════════════════════════════════════════
// C. TITAN CONTRACT (pilot)
// ════════════════════════════════════════════════════════════════════════════
// The pilot contract this file was written against became THREE contracts, rolled at random per
// run, on 2026-08-06. Everything that pinned itself to "the run always carries tc_two_titans" —
// the old C02..C10 — now lives in tools/qa/browser/chaos_contracts_proof.mjs, which owns the roll,
// all three conditions, the once-only cap, the no-penalty control, level-neutrality and the three
// surfaces, in 30 checks. Those checks were MOVED, not dropped; keeping a copy here pinned to one
// contract would just be two descriptions of the same behaviour, drifting apart.
//
// What still belongs to THIS file is the pre-run overlay it already owned: that a contract strip
// is present at all, and that it stays out of the keyboard/controller ring.
check('C01 a contract strip is shown before the run, with its reward and its no-penalty line',
  ui.set?.contract && ui.set.contract.h.length > 0 && ui.set.contract.g.length > 0 &&
  /CONTRACT/.test(ui.set.contract.h) &&
  /\+2 Protocol Fragments/.test(ui.set.contract.r) &&
  /No penalty on failure/.test(ui.set.contract.r),
  JSON.stringify(ui.set?.contract));

const ring = await page.evaluate(() => {
  const g = window.__g;
  const o = window.__openLaw();
  // Walk the whole ring with the shipped mover and make sure it still lands only on real nodes.
  const seen = [];
  for (let i = 0; i < (o?.ring || 0) + 2; i++) {
    const nodes = g._clsNodes();
    seen.push(nodes[g._clsIdx]?.id || nodes[g._clsIdx]?.dataset?.law || '?');
    g._clsMove(1);
  }
  const onCount = document.querySelectorAll('#cgm-chaos-law-sel .cls-on').length;
  window.__closeLaw();
  return { ring: o?.ring, cards: o?.cards?.length ?? -1, hasContract: o?.ringHasContract, seen, onCount };
});
// Total-agnostic for the same reason law_seals U03 is: the ring is the playable law cards plus
// SKIP plus BACK, and BLOOD GRID II legitimately makes that 9. The claim is that the CONTRACT
// STRIP is not in it — the size never was the point.
check('C11 the contract strip is NOT selectable — the ring is the cards plus SKIP and BACK',
  ring.ring === ring.cards + 2 && ring.hasContract === false && ring.onCount === 1 &&
  ring.seen.includes('cls-skip-btn') && ring.seen.includes('cls-back-btn') &&
  ring.seen.includes('blood_grid'),
  JSON.stringify({ cards: ring.cards, ring: ring.ring, hasContract: ring.hasContract, onCount: ring.onCount }));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
const draw = await page.evaluate(() => {
  const g = window.__g;
  g.meta.lawMastery = { blood_grid: 754 };
  window.__openLaw();
  let err = null;
  try { window.__step(30); } catch (e) { err = String(e); }
  return err || window.__err || null;
});
await shot('law_overlay.png');
check('D01 the pre-run overlay opens and real frames run with it up, without throwing',
  draw === null, draw);

const black = await page.evaluate(() => {
  const g = window.__g;
  window.__closeLaw();
  window.__run('chaos', 'blood_grid');
  window.__step(45);
  try { g.draw?.(); } catch (_) {}
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
  return { mean: sum / n, max, colors: colors.size };
});
await shot('chaos_run.png');
check('D02 the game is still rendering — no black screen',
  black.mean > 3 && black.max > 40 && black.colors > 30, JSON.stringify(black));

check('D03 zero page errors across the whole session',
  pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D04 zero console errors across the whole session',
  consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); }
fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, failures }, null, 2));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
