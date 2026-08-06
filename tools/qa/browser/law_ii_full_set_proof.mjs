// ════════════════════════════════════════════════════════════════════════════════
// LAW II — the full set of six second tiers, from ONE table.
//
// BLOOD GRID II shipped alone in a66305b as a pilot with its numbers, its card, its codex row, its
// HUD label and its engage transmission each typed out by hand. Five more of those would have been
// five more chances for those five copies to disagree. So the six tiers now live in one LAW_II
// table and every surface reads it. That makes the interesting question not "does NO MERCY II
// work" but "can any surface still disagree with the table" — which is what this file is about.
//
//   M-block  MODULE ORDER — the table is declared before the code that reads it. This block exists
//            because I broke exactly this while writing the feature: the codex loop ran at module
//            scope above the `const`, the module threw ReferenceError on load, and the game was a
//            guaranteed black screen. Cheap check, catastrophic failure.
//   T-block  THE TERMS — each tier is strictly harder than ITS OWN parent on both difficulty axes,
//            pays a strictly better score multiplier, and never pays less XP. Compared against the
//            parent's numbers read LIVE from the shipped modifier function, not against constants
//            typed a second time in here.
//   G-block  THE GATE — one Seal opens one tier and no other; the parent Law always stays on the
//            board beside it; losing the Seal takes the card away again.
//   C-block  THE CARD — printed numbers equal applied numbers, for all six.
//   B-block  THE BROADCAST — generated from the table, and BLOOD GRID II's line is byte-identical
//            to the one a66305b shipped, so the pilot's transmission did not silently change.
//   H-block  THE HUD — label and colour come from the table (this is where NO MERCY II would have
//            read 'NO MERCY PROTOCOL II' if nothing read the table).
//   L-block  THE LEDGER — same name in the log as on the card.
//   N-block  CONTROL — the six base Laws, the six Law Seals and CHAOS COMPLETION are untouched.
//   D-block  a real run under each NEW tier renders. No black screen, no console errors.
//
// Run: node tools/qa/browser/law_ii_full_set_proof.mjs [port]
// Writes: /tmp/law_ii_full_set_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/law_ii_full_set_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8951;
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

const SRC    = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const BUILD  = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];
const MAIN_V = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').match(/Game\.js\?v=(\d+)/)[1];

let passN = 0, failN = 0;
const failures = [], results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}${extra ? '  ' + extra : ''}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

// The six tiers and their parents. Written out here ON PURPOSE as the thing the page is checked
// AGAINST — if a tier is renamed or dropped from the table, the page and this list disagree and
// the checks fail, which is the point. No NUMBER is duplicated here: every multiplier this file
// asserts on is read out of the running game.
const TIERS = [
  { id: 'blood_grid_ii',        parent: 'blood_grid',        name: 'BLOOD GRID II',    color: '#ff6b6b' },
  { id: 'frozen_eden_ii',       parent: 'frozen_eden',       name: 'FROZEN EDEN II',   color: '#66e0ff' },
  { id: 'serpent_law_ii',       parent: 'serpent_law',       name: 'SERPENT LAW II',   color: '#ff9a55' },
  { id: 'dragon_law_ii',        parent: 'dragon_law',        name: 'DRAGON LAW II',    color: '#c07aff' },
  { id: 'no_mercy_protocol_ii', parent: 'no_mercy_protocol', name: 'NO MERCY II',      color: '#ffd166' },
  { id: 'broken_signal_ii',     parent: 'broken_signal',     name: 'BROKEN SIGNAL II', color: '#ff5fb0' },
];
const BASE6 = TIERS.map(t => t.parent);
// The order the six base cards are DISPLAYED in, which is not the order TIERS happens to list
// their parents. G01 failed on exactly that difference the first time it ran — my mistake, not
// the game's — so the shipped order is written out here and pinned rather than assumed.
const BOARD6 = ['blood_grid', 'frozen_eden', 'no_mercy_protocol', 'serpent_law', 'dragon_law', 'broken_signal'];
// The exact string commit a66305b shipped for the pilot's engage transmission.
const PILOT_BROADCAST = 'BLOOD GRID II ACTIVE. Acceleration +20%. Boss integrity +15%. Score multiplier +40%.';

// ════════════════════════════════════════════════════════════════════════════
// M. MODULE ORDER — the black-screen check, run before the browser is even open
// ════════════════════════════════════════════════════════════════════════════
{
  // Comments are stripped first. A loose pattern matching the prose I wrote ABOUT the code
  // instead of the code has produced a false PASS four times this session; not a fifth.
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');
  const iTable = code.indexOf('const LAW_II = {');
  const iIds   = code.indexOf('const LAW_II_IDS = Object.keys(LAW_II);');
  const iLoop  = code.indexOf('for (const _id of LAW_II_IDS) {');
  const iLaws  = code.indexOf('const CHAOS_LAWS = [');
  check('M01 LAW_II is declared before every module-scope statement that reads it',
    iTable > 0 && iIds > iTable && iLoop > iIds && iLaws > iIds && iLoop > iLaws,
    JSON.stringify({ table: iTable, ids: iIds, chaosLaws: iLaws, codexLoop: iLoop }));
  check('M02 the table is defined exactly ONCE and every tier lives in it',
    (code.match(/const LAW_II = \{/g) || []).length === 1 &&
    TIERS.every(t => new RegExp('\\n  ' + t.id + ': \\{').test(code)),
    'decls=' + (code.match(/const LAW_II = \{/g) || []).length);
  // The pilot's five hand-typed surfaces are gone: the only place its id may still be written out
  // as a literal is as a KEY of the table itself.
  const litRefs = (code.match(/'blood_grid_ii'/g) || []).length;
  check('M03 no surface still hardcodes the pilot — the five hand-typed copies are gone',
    litRefs === 0, `quoted 'blood_grid_ii' occurrences outside the table key: ${litRefs}`);
}

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

check('A00 the cache-bust chain agrees end to end',
  BUILD === IDX_V && IDX_V === MAIN_V, `${BUILD} / ${IDX_V} / ${MAIN_V}`);
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
check('A02 the module LOADS — zero page errors at boot (the TDZ regression, live)',
  pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await page.evaluate(async ([TIERS, BASE6]) => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__TIERS = TIERS; window.__BASE6 = BASE6;
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

  window.__unsealAll = () => { g.meta.lawMastery = {}; };
  window.__sealOnly = (laws) => {
    const m = {}; for (const l of [].concat(laws)) m[l] = 900; g.meta.lawMastery = m;
  };
  window.__mods = (law) => { g.runChaosLaw = law; return g._getActiveChaosLawModifiers(); };

  window.__openLaw = () => {
    try { g._showChaosLawSelectionOverlay(); } catch (e) { window.__err = String(e); }
    const el = document.getElementById('cgm-chaos-law-sel');
    if (!el) return null;
    const cards = [...el.querySelectorAll('.cls-card[data-law]')].map(c => ({
      law: c.dataset.law,
      name: (c.querySelector('.cls-card-name')?.textContent || '').trim(),
      effect: (c.querySelector('.cls-card-effect')?.textContent || '').trim(),
    }));
    const ids = g._clsNodes ? g._clsNodes().map(n => n.dataset?.law || n.id) : [];
    return { cards, ring: ids.length, ids };
  };
  window.__closeLaw = () => { try { g._hideChaosLawSelectionOverlay(); } catch (_) {} };

  // Confirms a card the way the MOUSE does — the same node, the same shipped handler.
  window.__pick = (law) => {
    try { g._showChaosLawSelectionOverlay(); } catch (_) {}
    g._pendingChaosStart = true;
    const card = document.querySelector(`#cgm-chaos-law-sel .cls-card[data-law="${law}"]`);
    if (!card) { window.__closeLaw(); return { clicked: false, law: g.runChaosLaw }; }
    card.click();
    window.__step(5);
    return { clicked: true, law: g.runChaosLaw, chaos: !!g._chaosMode };
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

  // The engage transmission, captured at the moment _enterEndless queues it.
  window.__broadcast = (law) => {
    const seen = [];
    const orig = g._queueEdenTransmission;
    g._queueEdenTransmission = function (msg, opts) { seen.push({ msg: String(msg), title: opts?.title }); };
    const prev = g.runChaosLaw;
    g.runChaosLaw = law;
    let err = null;
    try { g._enterEndless(); } catch (e) { err = String(e); }
    g._queueEdenTransmission = orig;
    g.runChaosLaw = prev;
    return { law: law, err, lines: seen.filter(s => /CHAOS LAW/.test(s.title || '')) };
  };

  // The HUD indicator, captured off a REAL 2d context so nothing can throw on a member a hand
  // written fake forgot. fillStyle is intercepted for the RAW value the code assigned — the
  // canvas normalises 8-digit hex to rgba() on read, which would hide the table's colour.
  window.__hudLaw = (law) => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d');
    const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle');
    let raw = null;
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true,
      get() { return desc.get.call(ctx); },
      set(v) { raw = v; desc.set.call(ctx, v); },
    });
    const calls = [];
    const oft = ctx.fillText.bind(ctx);
    ctx.fillText = (t, x, y) => { calls.push({ t: String(t), raw }); return oft(t, x, y); };
    const prev = g.runChaosLaw;
    g.runChaosLaw = law;
    let err = null;
    try { g._drawActiveRelicHUD(ctx); } catch (e) { err = String(e); }
    g.runChaosLaw = prev;
    return { err, line: calls.find(x => /^CHAOS: /.test(x.t)) || null, n: calls.length };
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
  window.__sealSection = () => {
    try { g.goToAchievementsScreen(); } catch (_) {}
    try { g._colSelectTab?.('chaos'); } catch (_) {}
    try { const t = document.querySelector('.ct-tab[data-tab="chaos"]'); if (t) t.click(); } catch (_) {}
    return { n: (document.querySelector('#cxc-seals-n')?.textContent || '').trim(),
             rows: document.querySelectorAll('#cxc-seals .sl-row').length };
  };
}, [TIERS, BASE6]);

// ════════════════════════════════════════════════════════════════════════════
// T. THE TERMS — harder than its OWN parent, better score, never less XP
// ════════════════════════════════════════════════════════════════════════════
const terms = await page.evaluate(() => {
  const out = [];
  for (const t of window.__TIERS) {
    out.push({ id: t.id, parent: t.parent, p: window.__mods(t.parent), c: window.__mods(t.id) });
  }
  return out;
});
for (const row of terms) {
  const harder = row.c.enemySpeedMult > row.p.enemySpeedMult && row.c.bossHpMult > row.p.bossHpMult;
  const paid   = row.c.scoreMult > row.p.scoreMult;
  const noXpCut = row.c.xpMult >= row.p.xpMult;
  check(`T-${row.id} is strictly harder than ${row.parent} and pays strictly better score`,
    harder && paid && noXpCut,
    `speed ${row.p.enemySpeedMult}→${row.c.enemySpeedMult} · boss ${row.p.bossHpMult}→${row.c.bossHpMult} · score ${row.p.scoreMult}→${row.c.scoreMult} · xp ${row.p.xpMult}→${row.c.xpMult}`);
}
check('T07 every tier is DISTINCT — six different multiplier sets, no copy-paste twins',
  new Set(terms.map(r => JSON.stringify(r.c))).size === 6,
  String(new Set(terms.map(r => JSON.stringify(r.c))).size));

// ════════════════════════════════════════════════════════════════════════════
// G. THE GATE
// ════════════════════════════════════════════════════════════════════════════
const gate = await page.evaluate(() => {
  window.__unsealAll();
  const locked = window.__openLaw(); window.__closeLaw();
  window.__sealOnly(window.__BASE6);
  const all = window.__openLaw(); window.__closeLaw();
  window.__unsealAll();
  const relocked = window.__openLaw(); window.__closeLaw();
  return { locked, all, relocked };
});
check('G01 with NO Seal earned the board is the SAME SIX cards, in the same order, as before Law II existed',
  gate.locked?.cards.length === 6 &&
  JSON.stringify(gate.locked.cards.map(c => c.law)) === JSON.stringify(BOARD6),
  JSON.stringify(gate.locked?.cards.map(c => c.law)));
check('G02 with ALL SIX Seals earned the board is twelve — the six parents FIRST, in their shipped order, then the six tiers',
  gate.all?.cards.length === 12 &&
  JSON.stringify(gate.all.cards.slice(0, 6).map(c => c.law)) === JSON.stringify(BOARD6) &&
  TIERS.every(t => gate.all.cards.some(c => c.law === t.id)),
  JSON.stringify(gate.all?.cards.map(c => c.law)));
check('G03 the gate is LIVE — losing the Seals takes every tier away again',
  gate.relocked?.cards.length === 6 && !gate.relocked.cards.some(c => /_ii$/.test(c.law)),
  JSON.stringify(gate.relocked?.cards.map(c => c.law)));

const isolation = await page.evaluate(() => {
  const out = [];
  for (const t of window.__TIERS) {
    window.__sealOnly(t.parent);
    const o = window.__openLaw(); window.__closeLaw();
    out.push({ id: t.id, count: o.cards.length, ii: o.cards.filter(c => /_ii$/.test(c.law)).map(c => c.law) });
  }
  return out;
});
check('G04 ONE Seal opens exactly ONE tier — its own, never a neighbour’s',
  isolation.length === 6 &&
  isolation.every(r => r.count === 7 && r.ii.length === 1 && r.ii[0] === r.id),
  JSON.stringify(isolation.map(r => r.id + ':' + r.ii.join('/') + '@' + r.count)));

const ring = await page.evaluate(() => {
  window.__unsealAll();
  const before = window.__openLaw(); window.__closeLaw();
  window.__sealOnly(window.__BASE6);
  const after = window.__openLaw(); window.__closeLaw();
  return { before, after };
});
check('G05 the focus ring grows by exactly SIX and still ends on SKIP then BACK',
  ring.before.ring === 8 && ring.after.ring === 14 &&
  ring.after.ids[12] === 'cls-skip-btn' && ring.after.ids[13] === 'cls-back-btn',
  JSON.stringify({ before: ring.before.ring, after: ring.after.ring, tail: ring.after.ids.slice(10) }));

const picks = await page.evaluate(() => {
  const out = [];
  for (const t of window.__TIERS) {
    window.__sealOnly(t.parent);
    const ok = window.__pick(t.id);
    window.__unsealAll();
    const gone = window.__pick(t.id);
    out.push({ id: t.id, ok, gone });
  }
  return out;
});
check('G06 every tier is SELECTABLE through the shipped click path once sealed, and absent when not',
  picks.every(p => p.ok.clicked === true && p.ok.law === p.id && p.ok.chaos === true && p.gone.clicked === false),
  JSON.stringify(picks.map(p => p.id + ':' + p.ok.clicked + '/' + p.gone.clicked)));

// ════════════════════════════════════════════════════════════════════════════
// C. THE CARD — printed numbers equal applied numbers
// ════════════════════════════════════════════════════════════════════════════
const cards = await page.evaluate(() => {
  window.__sealOnly(window.__BASE6);
  const o = window.__openLaw(); window.__closeLaw();
  const out = [];
  for (const t of window.__TIERS) {
    const card = o?.cards.find(c => c.law === t.id) || null;
    const m = window.__mods(t.id);
    // Null-safe: a build with no such card must FAIL here, not throw and take the rest down.
    if (!card) { out.push({ id: t.id, missing: true }); continue; }
    const pct = (re) => { const x = (card.effect.match(re) || [])[1]; return x === undefined ? null : Number(x); };
    out.push({
      id: t.id, name: card.name, effect: card.effect,
      saidSpeed: pct(/\+(\d+)% faster/i), appliedSpeed: Math.round((m.enemySpeedMult - 1) * 100),
      saidBoss:  pct(/\+(\d+)% HP/i),     appliedBoss:  Math.round((m.bossHpMult - 1) * 100),
      saidScore: pct(/\+(\d+)% score/i),  appliedScore: Math.round((m.scoreMult - 1) * 100),
      saidXp:    pct(/\+(\d+)% XP/i),     appliedXp:    Math.round((m.xpMult - 1) * 100),
    });
  }
  return out;
});
check('C01 the printed card and the applied modifiers agree, number for number, on all six',
  cards.length === 6 && cards.every(c => !c.missing &&
    c.saidSpeed === c.appliedSpeed && c.saidBoss === c.appliedBoss && c.saidScore === c.appliedScore),
  JSON.stringify(cards.map(c => c.id + ':' + [c.saidSpeed, c.appliedSpeed, c.saidBoss, c.appliedBoss, c.saidScore, c.appliedScore].join('/'))));
check('C02 XP is printed when and ONLY when the tier actually changes it',
  cards.every(c => (c.appliedXp === 0 ? c.saidXp === null : c.saidXp === c.appliedXp)),
  JSON.stringify(cards.map(c => c.id + ':said=' + c.saidXp + ' applied=' + c.appliedXp)));
check('C03 every card names itself with the table’s name',
  cards.every(c => c.name === (TIERS.find(t => t.id === c.id) || {}).name),
  JSON.stringify(cards.map(c => c.id + '→' + c.name)));

// ════════════════════════════════════════════════════════════════════════════
// B. THE BROADCAST
// ════════════════════════════════════════════════════════════════════════════
const casts = await page.evaluate(() => {
  const out = [];
  for (const t of window.__TIERS) out.push(window.__broadcast(t.id));
  out.push(window.__broadcast('blood_grid'));
  out.push(window.__broadcast('frozen_eden'));
  return out;
});
const castOf = (id) => casts.find(c => c.law === id);
check('B01 the pilot’s transmission is BYTE-IDENTICAL to the one a66305b shipped',
  castOf('blood_grid_ii')?.lines?.[0]?.msg === PILOT_BROADCAST,
  JSON.stringify(castOf('blood_grid_ii')?.lines?.[0]?.msg));
check('B02 every tier broadcasts exactly one line, under CHAOS LAW II, naming itself',
  TIERS.every(t => {
    const c = castOf(t.id);
    return c && c.lines.length === 1 && c.lines[0].title === 'CHAOS LAW II' &&
           c.lines[0].msg.startsWith(t.name + ' ACTIVE.');
  }),
  JSON.stringify(TIERS.map(t => t.id + ':' + (castOf(t.id)?.lines?.[0]?.msg || 'NONE'))));
check('B03 no tier accidentally broadcasts its PARENT’s line',
  TIERS.every(t => {
    const mine = castOf(t.id)?.lines?.[0]?.msg || '';
    const dad  = castOf(t.parent)?.lines?.[0]?.msg;
    return dad === undefined || mine !== dad;
  }),
  JSON.stringify({ bg: castOf('blood_grid')?.lines?.[0]?.msg, fe: castOf('frozen_eden')?.lines?.[0]?.msg }));
check('B04 CONTROL — the base Laws still broadcast their shipped lines under CHAOS LAW',
  castOf('blood_grid')?.lines?.[0]?.msg === 'BLOOD GRID ACTIVE. Enemy acceleration +7%. Score multiplier +10%.' &&
  castOf('blood_grid')?.lines?.[0]?.title === 'CHAOS LAW' &&
  castOf('frozen_eden')?.lines?.[0]?.msg === 'FROZEN EDEN ACTIVE. XP absorption amplified.',
  JSON.stringify([castOf('blood_grid')?.lines?.[0], castOf('frozen_eden')?.lines?.[0]]));

// ════════════════════════════════════════════════════════════════════════════
// H. THE HUD
// ════════════════════════════════════════════════════════════════════════════
const hud = await page.evaluate(() => {
  const out = {};
  for (const t of window.__TIERS) out[t.id] = window.__hudLaw(t.id);
  for (const l of window.__BASE6) out[l] = window.__hudLaw(l);
  out.__none = window.__hudLaw(null);
  return out;
});
check('H01 the HUD prints the table’s NAME for every tier — this is where NO MERCY II would have read "NO MERCY PROTOCOL II"',
  TIERS.every(t => hud[t.id]?.line?.t === 'CHAOS: ' + t.name),
  JSON.stringify(TIERS.map(t => t.id + '→' + (hud[t.id]?.line?.t ?? 'NONE'))));
check('H02 the HUD uses the table’s COLOUR for every tier',
  TIERS.every(t => hud[t.id]?.line?.raw === t.color + '99'),
  JSON.stringify(TIERS.map(t => t.id + '→' + (hud[t.id]?.line?.raw ?? 'NONE'))));
check('H03 CONTROL — the six base Laws keep their shipped labels and colours, unchanged',
  hud.blood_grid?.line?.t === 'CHAOS: BLOOD GRID' && hud.blood_grid.line.raw === '#ef444499' &&
  hud.frozen_eden?.line?.t === 'CHAOS: FROZEN EDEN' && hud.frozen_eden.line.raw === '#00ccff99' &&
  hud.no_mercy_protocol?.line?.t === 'CHAOS: NO MERCY' && hud.no_mercy_protocol.line.raw === '#fbbf2499' &&
  hud.serpent_law?.line?.t === 'CHAOS: SERPENT LAW' &&
  hud.dragon_law?.line?.t === 'CHAOS: DRAGON LAW' &&
  hud.broken_signal?.line?.t === 'CHAOS: BROKEN SIGNAL',
  JSON.stringify(BASE6.map(l => l + '→' + (hud[l]?.line?.t ?? 'NONE'))));
check('H04 CONTROL — with no Law running the HUD prints no law line at all, and never throws',
  hud.__none?.line === null && BASE6.concat(TIERS.map(t => t.id)).every(k => hud[k].err === null),
  JSON.stringify({ none: hud.__none?.line, errs: Object.keys(hud).filter(k => hud[k]?.err) }));

// ════════════════════════════════════════════════════════════════════════════
// L. THE LEDGER
// ════════════════════════════════════════════════════════════════════════════
const ledger = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__sealOnly(window.__BASE6);
  for (const t of window.__TIERS) window.__run(t.id, 700);
  window.__run('no_mercy_protocol', 700);      // the CONTROL row, written last
  return { short: window.__ledgerShort(), tab: window.__ledgerTab(),
           laws: (g.meta.getChaosLedger() || []).map(r => r.law) };
});
check('L01 the Ledger names each tier the way its card did — the table, not the raw id',
  TIERS.every(t => ledger.tab.includes(t.name)) && ledger.tab.includes('NO MERCY II') &&
  !ledger.tab.includes('NO MERCY PROTOCOL II'),
  JSON.stringify({ hasNoMercyII: ledger.tab.includes('NO MERCY II'),
                   hasRawId: ledger.tab.includes('NO MERCY PROTOCOL II') }));
check('L02 CONTROL — a base-Law row still reads exactly as it always did',
  /NO MERCY PROTOCOL(?! II)/.test(ledger.short) && ledger.laws.includes('no_mercy_protocol'),
  ledger.short.slice(0, 160));
check('L03 each tier is stored under its OWN id, so the records never merge with the parent’s',
  TIERS.every(t => ledger.laws.includes(t.id)),
  JSON.stringify(ledger.laws));

// ════════════════════════════════════════════════════════════════════════════
// N. CONTROL — nothing else moved
// ════════════════════════════════════════════════════════════════════════════
const others = await page.evaluate(() => {
  const out = {};
  for (const l of window.__BASE6) out[l] = window.__mods(l);
  out.__none = window.__mods(null);
  return out;
});
check('N01 CONTROL — all six base Laws are byte-identical, and no-law is still identity',
  JSON.stringify(others.blood_grid) === JSON.stringify({ scoreMult: 1.15, xpMult: 1, bossHpMult: 1, enemySpeedMult: 1.1 }) &&
  JSON.stringify(others.frozen_eden) === JSON.stringify({ scoreMult: 1, xpMult: 1.15, bossHpMult: 1, enemySpeedMult: 0.9 }) &&
  JSON.stringify(others.serpent_law) === JSON.stringify({ scoreMult: 1.12, xpMult: 1, bossHpMult: 1.06, enemySpeedMult: 1.06 }) &&
  JSON.stringify(others.dragon_law) === JSON.stringify({ scoreMult: 1, xpMult: 1.12, bossHpMult: 1.15, enemySpeedMult: 1 }) &&
  JSON.stringify(others.no_mercy_protocol) === JSON.stringify({ scoreMult: 1.18, xpMult: 1, bossHpMult: 1.12, enemySpeedMult: 1 }) &&
  JSON.stringify(others.broken_signal) === JSON.stringify({ scoreMult: 1.2, xpMult: 1.08, bossHpMult: 1, enemySpeedMult: 1.05 }) &&
  JSON.stringify(others.__none) === JSON.stringify({ scoreMult: 1, xpMult: 1, bossHpMult: 1, enemySpeedMult: 1 }),
  JSON.stringify(others));

const seals = await page.evaluate(() => {
  const g = window.__g;
  g.meta.lawMastery = {};
  for (const t of window.__TIERS) window.__run(t.id, 1500);   // long runs under every tier
  return { mastery: { ...g.meta.lawMastery },
           parents: window.__BASE6.map(l => g._lawSealed(l)),
           section: window.__sealSection(),
           completion: (() => { const c = g._chaosCompletion(); return { total: c.total, seals: c.parts[2] }; })() };
});
check('N02 a tier run does NOT earn its parent’s Seal — the two records stay separate',
  seals.parents.every(v => v === false) &&
  TIERS.every(t => seals.mastery[t.id] === 1500) &&
  BASE6.every(l => seals.mastery[l] === undefined),
  JSON.stringify(seals.mastery));
check('N03 the LAW SEALS section is still SIX — a tier adds no seal of its own',
  seals.section.rows === 6 && /\/ 6$/.test(seals.section.n), JSON.stringify(seals.section));
check('N04 CHAOS COMPLETION is unchanged at 38 — a Law II is not a collectible',
  seals.completion.total === 38 && seals.completion.seals.total === 6,
  JSON.stringify(seals.completion));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
await page.evaluate(() => {
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
});
const draws = await page.evaluate(() => {
  const g = window.__g;
  const out = [];
  for (const t of window.__TIERS) {
    window.__sealOnly(t.parent);
    window.__run(t.id);
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
    out.push({ id: t.id, mean: sum / n, max, colors: colors.size, err, state: g.gameState });
  }
  return out;
});
await shot('chaos_run_law_ii.png');
check('D01 a real run under EVERY tier renders — no black screen on any of the six',
  draws.length === 6 && draws.every(d =>
    d.err === null && d.state === 'playing' && d.mean > 3 && d.max > 40 && d.colors > 30),
  JSON.stringify(draws.map(d => d.id + ':mean=' + d.mean.toFixed(1) + ' max=' + d.max + ' col=' + d.colors + (d.err ? ' ERR=' + d.err : ''))));
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
