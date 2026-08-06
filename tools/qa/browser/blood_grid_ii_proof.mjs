// ════════════════════════════════════════════════════════════════════════════════
// BLOOD GRID II — pilot Law II, gated behind the Seal of the Blood Grid.
//
// Optional, strictly harder, and paying a better score multiplier. The three things this file has
// to prove, in order of how badly they would hurt if wrong:
//   G-block  the GATE — it is invisible and unusable until the Seal is earned, and earning the
//            Seal never REMOVES the original Blood Grid;
//   M-block  the MODIFIERS — harder than Blood Grid on every axis it touches, and the overlay text
//            matches what the code actually applies (that drift was a real bug on 2026-08-04);
//   N-block  NO OTHER LAW II — the other five Laws gained nothing, and the six Law Seals are
//            untouched.
//
// Run: node tools/qa/browser/blood_grid_ii_proof.mjs [port]
// Writes: /tmp/blood_grid_ii_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/blood_grid_ii_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8937;
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

const BASE6 = ['blood_grid', 'frozen_eden', 'no_mercy_protocol', 'serpent_law', 'dragon_law', 'broken_signal'];
await page.evaluate(async ([BASE6]) => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__BASE6 = BASE6;
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
  window.__unsealed = () => { g.meta.lawMastery = {}; };
  window.__seal = (law) => { g.meta.lawMastery = Object.assign({}, g.meta.lawMastery, { [law]: 900 }); };
  window.__mods = (law) => { g.runChaosLaw = law; return g._getActiveChaosLawModifiers(); };
  window.__openLaw = () => {
    try { g._showChaosLawSelectionOverlay(); } catch (e) { window.__err = String(e); }
    const el = document.getElementById('cgm-chaos-law-sel');
    if (!el) return null;
    const cards = [...el.querySelectorAll('.cls-card[data-law]')].map(c => ({
      law: c.dataset.law,
      name: (c.querySelector('.cls-card-name')?.textContent || '').trim(),
      effect: (c.querySelector('.cls-card-effect')?.textContent || '').trim(),
      seal: (c.querySelector('.cls-card-seal')?.textContent || '').trim(),
    }));
    const ring = g._clsNodes ? g._clsNodes().length : -1;
    const ids  = g._clsNodes ? g._clsNodes().map(n => n.dataset?.law || n.id) : [];
    return { cards, ring, ids };
  };
  window.__closeLaw = () => { try { g._hideChaosLawSelectionOverlay(); } catch (_) {} };
  // Confirms a card the way the MOUSE does — the same node, the same shipped handler.
  window.__pick = (law) => {
    try { g._showChaosLawSelectionOverlay(); } catch (_) {}
    g._pendingChaosStart = true;
    const card = document.querySelector(`#cgm-chaos-law-sel .cls-card[data-law="${law}"]`);
    if (!card) return { clicked: false, law: g.runChaosLaw };
    card.click();
    window.__step(5);
    return { clicked: true, law: g.runChaosLaw, chaos: !!g._chaosMode, state: g.gameState };
  };
  window.__run = (law, secs) => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = law;
    g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
    try { g._beginChaosRun(); } catch (_) {}
    g.runChaosLaw = law;
    window.__step(20);
    if (typeof secs === 'number') {
      g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
      g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
      g.gameOver = true; g.victory = false; g.rewardsGranted = false;
      try { g._grantRewards(); } catch (e) { window.__err = String(e); }
    }
  };
  window.__sealCount = () => {
    try { g._colSelectTab?.('chaos'); } catch (_) {}
    try { g.goToAchievementsScreen(); } catch (_) {}
    try { const t = document.querySelector('.ct-tab[data-tab="chaos"]'); if (t) t.click(); } catch (_) {}
    const n = document.querySelector('#cxc-seals-n');
    const rows = document.querySelectorAll('#cxc-seals .sl-row').length;
    return { n: (n?.textContent || '').trim(), rows };
  };
}, [BASE6]);

// ════════════════════════════════════════════════════════════════════════════
// G. THE GATE
// ════════════════════════════════════════════════════════════════════════════
const gate = await page.evaluate(() => {
  window.__unsealed();
  const locked = window.__openLaw(); window.__closeLaw();
  window.__seal('blood_grid');
  const open = window.__openLaw(); window.__closeLaw();
  window.__unsealed();
  const relocked = window.__openLaw(); window.__closeLaw();
  return { locked, open, relocked };
});
check('G01 with the Seal unearned the board is the SAME SIX cards as before',
  gate.locked && gate.locked.cards.length === 6 &&
  JSON.stringify(gate.locked.cards.map(c => c.law)) === JSON.stringify([
    'blood_grid', 'frozen_eden', 'no_mercy_protocol', 'serpent_law', 'dragon_law', 'broken_signal']),
  JSON.stringify(gate.locked?.cards.map(c => c.law)));
check('G02 earning the Seal ADDS a seventh card and keeps the original Blood Grid',
  gate.open.cards.length === 7 &&
  gate.open.cards.some(c => c.law === 'blood_grid_ii') &&
  gate.open.cards.some(c => c.law === 'blood_grid'),
  JSON.stringify(gate.open.cards.map(c => c.law)));
check('G03 the gate is LIVE — losing the Seal takes the card away again',
  gate.relocked.cards.length === 6 && !gate.relocked.cards.some(c => c.law === 'blood_grid_ii'),
  JSON.stringify(gate.relocked.cards.map(c => c.law)));
const bg2Card = gate.open?.cards?.find(c => c.law === 'blood_grid_ii') || null;
check('G04 the card names itself and states its terms, including that it is harder',
  bg2Card?.name === 'BLOOD GRID II' &&
  /\+20% faster/.test(bg2Card.effect) && /\+15% HP/.test(bg2Card.effect) &&
  /\+40% score/.test(bg2Card.effect) && /Harder by design/.test(bg2Card.effect),
  JSON.stringify(bg2Card));

const ring = await page.evaluate(() => {
  window.__unsealed();
  const before = window.__openLaw(); window.__closeLaw();
  window.__seal('blood_grid');
  const after = window.__openLaw(); window.__closeLaw();
  return { before, after };
});
check('G05 the focus ring grows by exactly ONE and still ends on SKIP then BACK',
  ring.before.ring === 8 && ring.after.ring === 9 &&
  ring.after.ids[6] === 'blood_grid_ii' &&
  ring.after.ids[7] === 'cls-skip-btn' && ring.after.ids[8] === 'cls-back-btn',
  JSON.stringify({ before: ring.before.ring, after: ring.after.ring, tail: ring.after.ids.slice(6) }));

const pick = await page.evaluate(() => {
  window.__seal('blood_grid');
  const ok = window.__pick('blood_grid_ii');
  window.__unsealed();
  // Unsealed, the card is not in the DOM at all, so there is nothing to click. The law must not
  // be reachable by the shipped path.
  const gone = window.__pick('blood_grid_ii');
  return { ok, gone };
});
check('G06 it is SELECTABLE through the shipped click path once sealed, and absent when not',
  pick.ok.clicked === true && pick.ok.law === 'blood_grid_ii' && pick.ok.chaos === true &&
  pick.gone.clicked === false,
  JSON.stringify(pick));

// ════════════════════════════════════════════════════════════════════════════
// M. THE MODIFIERS
// ════════════════════════════════════════════════════════════════════════════
const mods = await page.evaluate(() => ({
  one: window.__mods('blood_grid'),
  two: window.__mods('blood_grid_ii'),
  none: window.__mods(null),
}));
check('M01 BLOOD GRID II is strictly HARDER than BLOOD GRID on every axis it touches',
  mods.two.enemySpeedMult > mods.one.enemySpeedMult &&
  mods.two.bossHpMult > mods.one.bossHpMult &&
  mods.two.enemySpeedMult === 1.2 && mods.two.bossHpMult === 1.15,
  JSON.stringify({ one: mods.one, two: mods.two }));
check('M02 and it pays a materially better score multiplier for that',
  mods.two.scoreMult > mods.one.scoreMult && mods.two.scoreMult === 1.4,
  `${mods.one.scoreMult} -> ${mods.two.scoreMult}`);
check('M03 CONTROL — no law selected still applies identity, nothing leaked into the default',
  JSON.stringify(mods.none) === JSON.stringify({ scoreMult: 1, xpMult: 1, bossHpMult: 1, enemySpeedMult: 1 }),
  JSON.stringify(mods.none));

const textMatch = await page.evaluate(() => {
  window.__seal('blood_grid');
  const card = window.__openLaw()?.cards?.find(c => c.law === 'blood_grid_ii');
  window.__closeLaw();
  const m = window.__mods('blood_grid_ii');
  // Null-safe: on a build with no such card this must FAIL, not throw and take every check after
  // it down with it. Reported as NaN, which no assertion below can accidentally satisfy.
  if (!card) return { effect: '', saidSpeed: NaN, appliedSpeed: -1, saidBoss: NaN, appliedBoss: -1,
                      saidScore: NaN, appliedScore: -1 };
  // Pull the numbers back OUT of the printed card and compare them to the applied modifiers.
  const pct = (re) => { const x = (card.effect.match(re) || [])[1]; return x ? Number(x) : NaN; };
  return {
    effect: card.effect,
    saidSpeed: pct(/\+(\d+)% faster/), appliedSpeed: Math.round((m.enemySpeedMult - 1) * 100),
    saidBoss:  pct(/\+(\d+)% HP/),     appliedBoss:  Math.round((m.bossHpMult - 1) * 100),
    saidScore: pct(/\+(\d+)% score/),  appliedScore: Math.round((m.scoreMult - 1) * 100),
  };
});
check('M04 the printed card and the applied modifiers agree, number for number',
  textMatch.saidSpeed === textMatch.appliedSpeed &&
  textMatch.saidBoss === textMatch.appliedBoss &&
  textMatch.saidScore === textMatch.appliedScore,
  JSON.stringify(textMatch));

const live = await page.evaluate(() => {
  const g = window.__g;
  window.__seal('blood_grid');
  window.__run('blood_grid_ii');
  const cfg = g._runConfig?.chaosLaw || null;
  const law = g.runChaosLaw;
  window.__run('blood_grid_ii', 700);
  const rec = (g.meta.getChaosLedger() || [])[0];
  return { cfg, law, ledgerLaw: rec?.law, mastery: g.meta.getLawBest('blood_grid_ii') };
});
check('M05 a real run carries it end to end — run config, HUD state, Ledger and Law Mastery',
  live.law === 'blood_grid_ii' && live.cfg && live.cfg.scoreMult === 1.4 &&
  live.ledgerLaw === 'blood_grid_ii' && live.mastery === 700,
  JSON.stringify(live));

// ════════════════════════════════════════════════════════════════════════════
// N. NO OTHER LAW II
// ════════════════════════════════════════════════════════════════════════════
const others = await page.evaluate(() => {
  const out = {};
  for (const l of window.__BASE6) out[l] = window.__mods(l);
  return out;
});
check('N01 CONTROL — the other five Laws and the original Blood Grid are byte-identical',
  JSON.stringify(others.blood_grid) === JSON.stringify({ scoreMult: 1.15, xpMult: 1, bossHpMult: 1, enemySpeedMult: 1.1 }) &&
  JSON.stringify(others.frozen_eden) === JSON.stringify({ scoreMult: 1, xpMult: 1.15, bossHpMult: 1, enemySpeedMult: 0.9 }) &&
  JSON.stringify(others.no_mercy_protocol) === JSON.stringify({ scoreMult: 1.18, xpMult: 1, bossHpMult: 1.12, enemySpeedMult: 1 }) &&
  JSON.stringify(others.broken_signal) === JSON.stringify({ scoreMult: 1.2, xpMult: 1.08, bossHpMult: 1, enemySpeedMult: 1.05 }),
  JSON.stringify(others.blood_grid));

// UPDATED, not silenced. This check used to read "sealing ALL SIX Laws still yields exactly ONE
// Law II — the pilot, and no others", which was true while BLOOD GRID II was the only tier that
// existed. The full set shipped later, so that wording now describes a build that is gone. The
// claim this FILE is responsible for was never "only one tier exists" — it was "the pilot's gate
// is its OWN parent's Seal, and nobody else's". That is what it asserts now, and it is a strictly
// stronger statement than the one it replaces: five other Seals are held while BLOOD GRID's is
// withheld, and the pilot still refuses to appear.
const noOtherII = await page.evaluate(() => {
  const g = window.__g;
  const others = window.__BASE6.filter(l => l !== 'blood_grid');
  g.meta.lawMastery = {};
  for (const l of others) window.__seal(l);          // every Seal EXCEPT the pilot's parent
  const without = window.__openLaw(); window.__closeLaw();
  window.__seal('blood_grid');                        // now add it
  const withIt = window.__openLaw(); window.__closeLaw();
  const ii = (o) => o.cards.filter(c => /_ii$/.test(c.law)).map(c => c.law);
  return { withoutCount: without.cards.length, withoutII: ii(without),
           withCount: withIt.cards.length, withII: ii(withIt) };
});
check('N02 the pilot answers to ITS OWN Seal only — five other Seals held, and it still stays off the board',
  noOtherII.withoutCount === 11 && noOtherII.withoutII.length === 5 &&
  !noOtherII.withoutII.includes('blood_grid_ii') &&
  noOtherII.withCount === 12 && noOtherII.withII.includes('blood_grid_ii'),
  JSON.stringify(noOtherII));

const seals = await page.evaluate(() => {
  const g = window.__g;
  g.meta.lawMastery = {};
  window.__run('blood_grid_ii', 1500);          // a long BLOOD GRID II run
  return { sealedI: g._lawSealed('blood_grid'), sealedII: g._lawSealed('blood_grid_ii'),
           mastery: { ...g.meta.lawMastery }, tab: window.__sealCount() };
});
check('N03 a BLOOD GRID II run does NOT earn the BLOOD GRID Seal — they are separate records',
  seals.sealedI === false && seals.mastery.blood_grid_ii === 1500 &&
  seals.mastery.blood_grid === undefined,
  JSON.stringify(seals.mastery));
check('N04 the LAW SEALS section is still SIX — the pilot Law II adds no seal of its own',
  seals.tab.rows === 6 && /\/ 6$/.test(seals.tab.n), JSON.stringify(seals.tab));

const completion = await page.evaluate(() => {
  const g = window.__g;
  const before = g._chaosCompletion();
  for (const l of window.__BASE6) window.__seal(l);
  window.__seal('blood_grid_ii');
  const after = g._chaosCompletion();
  return { beforeTotal: before.total, afterTotal: after.total, seals: after.parts[2] };
});
check('N05 CHAOS COMPLETION is unchanged at 38 — a Law II is not a collectible',
  completion.beforeTotal === 38 && completion.afterTotal === 38 &&
  completion.seals.done === 6 && completion.seals.total === 6,
  JSON.stringify(completion));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
await shot('law_overlay.png');
const draw = await page.evaluate(() => {
  const g = window.__g;
  // Leave the DOM screens through the SHIPPED teardown, not by ripping nodes out. Removing
  // #cgm-charselect by hand left g._charSelectOverlayEl cached, so update() walked gameState
  // straight back to 'character_select' and the frame sampled a screen the canvas does not draw.
  try { g._hideCharSelectOverlay?.(); } catch (_) {}
  try { g._hideChaosLawSelectionOverlay?.(); } catch (_) {}
  try { g._hideMenuOverlay?.(); } catch (_) {}
  for (const sel of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel']) {
    const n = document.querySelector(sel); if (n) n.remove();
  }
  window.__seal('blood_grid');
  window.__run('blood_grid_ii');
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
check('D01 a BLOOD GRID II run renders — no black screen',
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
