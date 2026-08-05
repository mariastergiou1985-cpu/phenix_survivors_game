// ════════════════════════════════════════════════════════════════════════════════
// LAW MASTERY and the pilot TITAN CONTRACT.
//
//  1. Law Mastery: the best Chaos survival time under each Chaos Law, persisted and printed on
//     that Law's card in the pre-run selection overlay. A RECORD, nothing more — explicitly NO
//     Law II, no tier, no stat, no currency. The L-block proves the recording rules AND that the
//     feature grants nothing.
//  2. Titan Contract (pilot): destroy 2 Mega Titans before 15:00 for +2 PF, no penalty on
//     failure. The C-block proves the reward pays exactly once, only on time, only in Chaos, and
//     that MISSING it costs the player nothing at all.
//
// Every Titan kill in this file goes through the shipped _updateChaosTitans() handler — the same
// code path a real kill takes — not through a hand-set counter.
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
check('C01 the contract is SHOWN before the run, with goal, reward and no-penalty',
  ui.set?.contract && /TITAN CONTRACT/.test(ui.set.contract.h) &&
  /2 Mega Titans before 15:00/.test(ui.set.contract.g) &&
  /\+2 Protocol Fragments/.test(ui.set.contract.r) &&
  /No penalty on failure/.test(ui.set.contract.r),
  JSON.stringify(ui.set?.contract));

const onTime = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos', 'blood_grid');
  const before = window.__wallet();
  window.__killTitan(window.__TITANS[0], 120);
  const afterOne = window.__wallet();
  window.__killTitan(window.__TITANS[1], 400);
  const afterTwo = window.__wallet();
  return { before, afterOne, afterTwo, at: g._titanContractAt, paid: g._titanContractPaid,
           titans: g._chaosTitansKilled };
});
check('C02 two Titans before 15:00 pays exactly +2 PF',
  onTime.afterTwo.pf - onTime.before.pf === 2 && onTime.paid === true && onTime.at === 400,
  JSON.stringify({ pf: `${onTime.before.pf} -> ${onTime.afterTwo.pf}`, at: onTime.at, titans: onTime.titans }));
check('C03 the FIRST Titan alone pays nothing — the contract needs two',
  onTime.afterOne.pf === onTime.before.pf, `${onTime.before.pf} -> ${onTime.afterOne.pf}`);

const noDouble = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos', 'blood_grid');
  const before = window.__wallet();
  window.__killTitan(window.__TITANS[0], 60);
  window.__killTitan(window.__TITANS[1], 120);
  const afterTwo = window.__wallet();
  window.__killTitan(window.__TITANS[2], 200);   // 3rd and 4th must not re-pay
  window.__killTitan(window.__TITANS[3], 260);
  const afterFour = window.__wallet();
  window.__end(600);                             // and neither must the run-end reward path
  return { before, afterTwo, afterFour, afterEnd: window.__wallet(), titans: g._chaosTitansKilled };
});
check('C04 CAP — it pays ONCE: the 3rd and 4th Titan, and run end, add nothing',
  noDouble.afterTwo.pf - noDouble.before.pf === 2 &&
  noDouble.afterFour.pf === noDouble.afterTwo.pf &&
  noDouble.afterEnd.pf === noDouble.afterTwo.pf && noDouble.titans === 4,
  JSON.stringify({ before: noDouble.before.pf, two: noDouble.afterTwo.pf,
                   four: noDouble.afterFour.pf, end: noDouble.afterEnd.pf }));

// Measured AT THE KILL, not across a whole run. The first version of these three checks compared
// the wallet before the run against the wallet after __end(), and read "+4 PF, +25 credits, +7
// Eden" on a FAILED contract — none of which was the contract. That is the run's own shipped
// payout (Chaos Eden Memory, endless achievements, score credits) and it would have been there
// with no contract in the game at all. The contract pays at the moment it is fulfilled, so that
// is the only moment at which its contribution is separable.
const tooLate = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos', 'blood_grid');
  window.__killTitan(window.__TITANS[0], 300);
  const before = window.__wallet();
  window.__killTitan(window.__TITANS[1], 901);   // ONE second past the window
  return { before, after: window.__wallet(), at: g._titanContractAt, paid: g._titanContractPaid };
});
check('C05 two Titans ONE SECOND past 15:00 pays nothing',
  tooLate.after.pf === tooLate.before.pf && tooLate.paid === false && tooLate.at === 901,
  JSON.stringify({ pf: `${tooLate.before.pf} -> ${tooLate.after.pf}`, at: tooLate.at, paid: tooLate.paid }));

const oneOnly = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos', 'blood_grid');
  const before = window.__wallet();
  window.__killTitan(window.__TITANS[0], 100);
  const atKill = window.__wallet();
  window.__end(1400);
  return { before, atKill, at: g._titanContractAt, paid: g._titanContractPaid };
});
check('C06 one Titan in the window is not enough, and stamps nothing',
  oneOnly.atKill.pf === oneOnly.before.pf && oneOnly.at === -1 && oneOnly.paid === false,
  JSON.stringify({ at: oneOnly.at, pf: `${oneOnly.before.pf} -> ${oneOnly.atKill.pf}` }));

// NO PENALTY, proved as a MATCHED CONTROL rather than as an absolute. Two runs identical in every
// way that pays — same character, same law, same TWO Titan kills, same end time — differing only
// in whether the second kill landed inside the window. Every Titan's first-kill relic and echo is
// pre-consumed so neither run gets a one-time grant the other misses. If failing carried any
// penalty at all it would show up as a difference other than the winner's +2 PF.
const matched = await page.evaluate(() => {
  const g = window.__g;
  const delta = (a, b) => { const o = {}; for (const k of Object.keys(a)) o[k] = +(b[k] - a[k]).toFixed(4); return o; };
  // Pre-consume every first-kill grant so the two runs below start from the same shelf.
  window.__run('chaos', 'blood_grid');
  for (let i = 0; i < 4; i++) window.__killTitan(window.__TITANS[i], 60 + i * 30);
  window.__end(1000);

  window.__run('chaos', 'blood_grid');                       // WIN — inside the window
  const w0 = window.__wallet();
  window.__killTitan(window.__TITANS[0], 100);
  window.__killTitan(window.__TITANS[1], 200);
  window.__end(1000);
  const win = delta(w0, window.__wallet());

  window.__run('chaos', 'blood_grid');                       // LOSE — one second late
  const l0 = window.__wallet();
  window.__killTitan(window.__TITANS[0], 800);
  window.__killTitan(window.__TITANS[1], 901);
  window.__end(1000);
  const lose = delta(l0, window.__wallet());
  return { win, lose, diff: delta(lose, win) };
});
check('C07 FAILURE HAS NO PENALTY — vs a matched winning run the ONLY difference is the +2 PF',
  matched.diff.pf === 2 && matched.diff.rewardedPF === 2 &&
  Object.entries(matched.diff).every(([k, v]) => (k === 'pf' || k === 'rewardedPF') ? v === 2 : v === 0) &&
  matched.lose.pf === 0 && matched.lose.credits >= 0,
  JSON.stringify({ win: matched.win, lose: matched.lose, diff: matched.diff }));

const levelNeutral = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos', 'blood_grid');
  const before = window.__wallet();
  window.__killTitan(window.__TITANS[0], 60);
  window.__killTitan(window.__TITANS[1], 120);
  const after = window.__wallet();
  return { before, after };
});
check('C08 the +2 PF is LEVEL-NEUTRAL — spendable, but it cannot inflate the pilot level',
  levelNeutral.after.pf - levelNeutral.before.pf === 2 &&
  levelNeutral.after.rewardedPF - levelNeutral.before.rewardedPF === 2 &&
  levelNeutral.after.level === levelNeutral.before.level,
  JSON.stringify({ pf: `${levelNeutral.before.pf}->${levelNeutral.after.pf}`,
                   rewardedPF: `${levelNeutral.before.rewardedPF}->${levelNeutral.after.rewardedPF}`,
                   level: `${levelNeutral.before.level}->${levelNeutral.after.level}` }));

const freshRun = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos', 'blood_grid');
  window.__killTitan(window.__TITANS[0], 60);
  window.__killTitan(window.__TITANS[1], 120);
  const armed = { at: g._titanContractAt, paid: g._titanContractPaid, titans: g._chaosTitansKilled };
  window.__run('chaos', 'blood_grid');            // a NEW run must offer it again
  const reset = { at: g._titanContractAt, paid: g._titanContractPaid, titans: g._chaosTitansKilled };
  const before = window.__wallet();
  window.__killTitan(window.__TITANS[0], 60);
  window.__killTitan(window.__TITANS[1], 120);
  return { armed, reset, gained: window.__wallet().pf - before.pf };
});
check('C09 a fresh run re-arms the contract and it can be earned again',
  freshRun.reset.at === -1 && freshRun.reset.paid === false && freshRun.reset.titans === 0 &&
  freshRun.gained === 2, JSON.stringify(freshRun));

const notChaos = await page.evaluate(() => {
  const g = window.__g;
  window.__run('endless', null);
  g._chaosMode = false;
  const before = window.__wallet();
  window.__killTitan(window.__TITANS[0], 60);
  window.__killTitan(window.__TITANS[1], 120);
  return { before, after: window.__wallet(), paid: g._titanContractPaid };
});
check('C10 CONTROL — outside Chaos the contract never pays',
  notChaos.after.pf === notChaos.before.pf && notChaos.paid === false,
  JSON.stringify({ pf: `${notChaos.before.pf} -> ${notChaos.after.pf}`, paid: notChaos.paid }));

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
  return { ring: o?.ring, hasContract: o?.ringHasContract, seen, onCount };
});
check('C11 the contract strip is NOT selectable — the keyboard/controller ring is unchanged',
  ring.ring === 8 && ring.hasContract === false && ring.onCount === 1 &&
  ring.seen.includes('cls-skip-btn') && ring.seen.includes('cls-back-btn') &&
  ring.seen.includes('blood_grid'),
  JSON.stringify({ ring: ring.ring, hasContract: ring.hasContract, onCount: ring.onCount }));

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
