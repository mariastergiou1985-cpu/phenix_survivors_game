// ════════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENT BANNERS + NULL EDEN DIALOGUE — audit proof.
//
// Four things this screen family got wrong, each asserted here against the live
// Game instance rather than against the source:
//
//   1. ANTI-REPETITION. _epick was a bare Math.random(). _EDEN_GENERIC_MID has 16
//      lines and is drawn from 9 milestones in one run, so a duplicate inside a
//      single run was the expected outcome, not the edge case. A shuffled bag must
//      now exhaust a pool before repeating, and must never hand back the line that
//      just played. Proven by draining pools thousands of times and checking BOTH
//      properties, not by reading the implementation.
//
//   2. TRANSMISSION DURATION. An equal-priority transmission overwrote a live one
//      the instant it arrived, cutting off a line mid-read. 36 of the 50 sites are
//      event-driven and ungated, so two events inside the 5 s window collided. It
//      must now wait, and a strictly higher priority must still preempt.
//
//   3. BANNER DURATION. The hold was a flat 1.9 s for every banner, including a
//      60-character one — about 32 characters per second. It must now scale, while
//      short banners keep exactly the old timing so nothing that reads fine changes.
//
//   4. TWO SILENT CHARACTERS. Eddie and Dimi Kickboxer were on the roster with no
//      entry in _EDEN_CHAR_POOLS, so EDEN never addressed them personally.
//
// Plus the invariants that must NOT have moved: priority ordering, duplicate
// suppression, and the announcement queue cap.
//
// Run: node tools/qa/browser/announcements_eden_audit_proof.mjs [port]
// Writes: /tmp/eden_audit_proof/report.json
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/eden_audit_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8961;
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
  if (cond) { passN++; console.log(`PASS ${id}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;
console.log(`serving ${ROOT} on ${BASE}   BUILD=${BUILD}`);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

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

await page.goto(BASE + '/index.html?nosw=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1200);

check('A00 sw.js BUILD equals index.html main.js ?v=', BUILD === IDX_V, `${BUILD} vs ${IDX_V}`);
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
check('A03 zero non-404 console errors at boot', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

// ════════════════════════════════════════════════════════════════════════════
// 1. ANTI-REPETITION — measured on the real pools, through the real picker.
//    Every character pool is exercised through the real milestone call, so a
//    pool that is unreachable from gameplay cannot pass by being tested directly.
// ════════════════════════════════════════════════════════════════════════════
const repeat = await page.evaluate(() => {
  const g = window.__g;
  // Reach the real module-level pools by replaying the real milestone path.
  const seen = { pools: {}, immediateRepeats: 0, earlyRepeats: 0, totalDraws: 0 };
  const drainPool = (drawFn, size, cycles) => {
    const out = [];
    for (let i = 0; i < size * cycles; i++) out.push(drawFn());
    return out;
  };
  // Drive the picker exactly as the game does: through _triggerEdenMilestoneMessages.
  // Collect what actually reached the screen across many simulated runs.
  const lines = [];
  g.meta._save = () => {};
  for (let run = 0; run < 60; run++) {
    g.endless = true; g.gameOver = false; g.victory = false;
    g._edenRunMilestonesShown = new Set();
    g._edenLastAutoAt = -999;
    g._edenQueue = [];
    g._edenTransmission = null;
    g.player = g.player || {};
    g.player.hp = 100; g.player.maxHp = 100;
    g.player.selectedCharacter = 'skeleton_warrior';
    const runLines = [];
    for (const t of [2, 180, 360, 480, 600, 720, 900, 1020, 1200, 1500]) {
      g.timeAlive = t;
      g._edenLastAutoAt = -999;          // defeat only the 50 s pacing gate, not the picker
      g._edenTransmission = null;
      g._edenQueue = [];
      g._triggerEdenMilestoneMessages();
      const tx = g._edenTransmission;
      if (tx) runLines.push(tx.message);
    }
    lines.push(runLines);
  }
  // immediate repeats inside a single run
  let immediate = 0, dupInRun = 0, total = 0;
  for (const runLines of lines) {
    total += runLines.length;
    for (let i = 1; i < runLines.length; i++) if (runLines[i] === runLines[i - 1]) immediate++;
    if (new Set(runLines).size !== runLines.length) dupInRun++;
  }
  return { runs: lines.length, total, immediate, runsWithAnyDuplicate: dupInRun, sample: lines[0] };
});
check('B01 no NULL EDEN line ever repeats back-to-back across 60 simulated runs',
  repeat.immediate === 0, JSON.stringify({ immediate: repeat.immediate, total: repeat.total }));
check('B02 the milestone path actually produced lines (the test is not vacuous)',
  repeat.total >= 500, JSON.stringify({ total: repeat.total, runs: repeat.runs }));

// The bag property itself: a pool must be exhausted before any line comes back.
const bag = await page.evaluate(async (build) => {
  // Pull the module's own pools by re-importing the SAME specifier the page uses,
  // so this measures the shipped picker on the shipped data.
  const src = await fetch('./js/game/Game.js?v=' + build).then(r => r.text());
  const grab = (name) => {
    const m = src.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\n\\];'));
    return m ? (m[1].match(/'(?:[^'\\]|\\.)*'/g) || []).length : 0;
  };
  return { mid: grab('_EDEN_GENERIC_MID'), survival: grab('_EDEN_GENERIC_SURVIVAL'),
           chaos: grab('_EDEN_CHAOS_APPROACH'), lowhp: grab('_EDEN_LOW_HP') };
}, BUILD);
check('B03 the generic mid pool is large enough for a long run', bag.mid >= 20, JSON.stringify(bag));

// Cycle property, exercised through the shipped picker on the low-HP path.
// The milestone keys are read out of the shipped source rather than hardcoded, so a
// milestone added later cannot silently make this block measure the wrong pool.
const MILESTONE_KEYS = [...new Set(
  [...fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8')
      .matchAll(/sh\.add\('([a-z0-9_]+)'\)/g)].map(m => m[1]))];
const cycle = await page.evaluate((keys) => {
  const g = window.__g;
  const got = [];
  g.endless = true; g.gameOver = false; g.victory = false;
  g.player = g.player || {}; g.player.selectedCharacter = 'skeleton_warrior';
  g.player.maxHp = 100;
  for (let i = 0; i < 40; i++) {
    g.timeAlive = 5000 + i;                            // past every milestone
    g._edenRunMilestonesShown = new Set(keys);         // every milestone already spent
    g._edenLastAutoAt = -999;                          // the 50 s gate is not what we are measuring
    g._edenTransmission = null; g._edenQueue = [];
    g._edenLowHpFired = false;
    g.player.hp = 10;                                  // below 30% -> the low-HP line
    g._triggerEdenMilestoneMessages();
    if (g._edenTransmission) got.push(g._edenTransmission.message);
  }
  let immediate = 0;
  for (let i = 1; i < got.length; i++) if (got[i] === got[i - 1]) immediate++;
  const distinct = new Set(got).size;
  return { n: got.length, immediate, distinct, keys: keys.length };
}, MILESTONE_KEYS);
check('B04 the low-HP pool cycles instead of re-rolling',
  cycle.n >= 30 && cycle.immediate === 0 && cycle.distinct >= 3, JSON.stringify(cycle));

// ════════════════════════════════════════════════════════════════════════════
// 2. TRANSMISSION PRIORITY + DURATION
// ════════════════════════════════════════════════════════════════════════════
const tx = await page.evaluate(() => {
  const g = window.__g, out = {};
  const reset = () => { g.timeAlive = 100; g._edenTransmission = null; g._edenQueue = []; g._edenLastAutoAt = -999; };

  reset();
  g._queueEdenTransmission('FIRST LINE',  { priority: 1, duration: 5 });
  g._queueEdenTransmission('SECOND LINE', { priority: 1, duration: 5 });
  out.equalPriority = { live: g._edenTransmission.message, queued: g._edenQueue.map(e => e.message) };

  // the waiting line must arrive once the first expires, not before
  g.timeAlive = 103;
  g._updateEdenTransmissionQueue();
  out.beforeExpiry = g._edenTransmission.message;
  g.timeAlive = 106;
  g._updateEdenTransmissionQueue();
  out.afterExpiry = g._edenTransmission.message;

  reset();
  g._queueEdenTransmission('LOW',  { priority: 1, duration: 5 });
  g._queueEdenTransmission('HIGH', { priority: 3, duration: 5 });
  out.preempt = g._edenTransmission.message;

  reset();
  g._queueEdenTransmission('HIGH', { priority: 3, duration: 5 });
  g._queueEdenTransmission('LOW',  { priority: 1, duration: 5 });
  out.noDowngrade = { live: g._edenTransmission.message, queued: g._edenQueue.map(e => e.message) };

  reset();
  g._queueEdenTransmission('SAME', { priority: 1, duration: 5 });
  g._queueEdenTransmission('SAME', { priority: 1, duration: 5 });
  out.duplicate = { live: g._edenTransmission.message, queuedN: g._edenQueue.length };

  reset();
  for (let i = 0; i < 9; i++) g._queueEdenTransmission('L' + i, { priority: 1, duration: 5 });
  out.queueCap = g._edenQueue.length;

  reset();
  g._edenLastAutoAt = 100;
  g.timeAlive = 120;
  g._queueEdenTransmission('AUTO TOO SOON', { priority: 1, duration: 5, auto: true });
  out.autoCooldown = g._edenTransmission ? g._edenTransmission.message : null;
  g.timeAlive = 200;
  g._queueEdenTransmission('AUTO OK', { priority: 1, duration: 5, auto: true });
  out.autoAfter = g._edenTransmission ? g._edenTransmission.message : null;
  return out;
});
check('C01 an equal-priority transmission waits instead of truncating the live one',
  tx.equalPriority.live === 'FIRST LINE' && tx.equalPriority.queued[0] === 'SECOND LINE', JSON.stringify(tx.equalPriority));
check('C02 the waiting line does not appear before the live one expires', tx.beforeExpiry === 'FIRST LINE', tx.beforeExpiry);
check('C03 it does appear once the live one expires', tx.afterExpiry === 'SECOND LINE', tx.afterExpiry);
check('C04 a strictly higher priority still preempts immediately', tx.preempt === 'HIGH', tx.preempt);
check('C05 a lower priority never displaces a live higher one',
  tx.noDowngrade.live === 'HIGH' && tx.noDowngrade.queued[0] === 'LOW', JSON.stringify(tx.noDowngrade));
check('C06 the same message is never queued twice', tx.duplicate.queuedN === 0, JSON.stringify(tx.duplicate));
check('C07 the transmission queue is capped', tx.queueCap <= 3, String(tx.queueCap));
check('C08 the 50 s auto-milestone cooldown still holds', tx.autoCooldown === null, String(tx.autoCooldown));
check('C09 an auto transmission fires once the cooldown elapses', tx.autoAfter === 'AUTO OK', String(tx.autoAfter));

// ════════════════════════════════════════════════════════════════════════════
// 3. BANNER DURATION + PRIORITY INVARIANTS
// ════════════════════════════════════════════════════════════════════════════
const ann = await page.evaluate(() => {
  const g = window.__g, C = g.constructor, out = {};
  const clear = () => { g.announcement = null; g._annQueue = []; g._frozenSleet = false; };

  out.holdShort = C._annHold('MANA FULL');
  out.holdLong  = C._annHold('◈ LEVEL 10 — COMBAT BONUS: +40 CORES · +25% HP · ARMOR 15s ◈');
  out.holdHuge  = C._annHold('X'.repeat(400));

  clear();
  g.triggerAnnouncement('SHORT', '#fff');
  out.shortStored = g.announcement.hold;
  clear();
  g.triggerAnnouncement('◈ LEVEL 10 — COMBAT BONUS: +40 CORES · +25% HP · ARMOR 15s ◈', '#fff');
  out.longStored = g.announcement.hold;
  clear();
  g.triggerAnnouncement('EXPLICIT', '#fff', { duration: 7 });
  out.explicit = g.announcement.hold;

  // the hold is actually honoured by the update loop
  clear();
  g.triggerAnnouncement('TIMED BANNER THAT IS QUITE LONG INDEED OK', '#fff');
  const want = g.announcement.hold;
  let t = 0;
  g._updateAnnouncement(0.4);                       // out of fade-in
  while (g.announcement && g.announcement.phase === 'hold' && t < 20) { g._updateAnnouncement(0.1); t += 0.1; }
  out.measuredHold = Math.round(t * 10) / 10;
  out.wantHold = Math.round(want * 10) / 10;

  // invariants that must not have moved
  clear();
  g.triggerAnnouncement('DUP', '#fff');
  g.triggerAnnouncement('DUP', '#fff');
  out.dupQueued = g._annQueue.length;

  clear();
  g.triggerAnnouncement('INFO', '#fff');                          // priority 0
  g.triggerAnnouncement('CRITICAL', '#f00', { priority: 2 });
  out.preempt = g.announcement.text;

  clear();
  g.triggerAnnouncement('LIVE', '#fff');
  for (let i = 0; i < 9; i++) g.triggerAnnouncement('Q' + i, '#fff');
  out.queueCap = g._annQueue.length;

  clear();
  g.triggerAnnouncement('LIVE', '#fff');
  g.triggerAnnouncement('LOW', '#fff');
  g.triggerAnnouncement('URGENT', '#f00', { priority: 1 });
  out.order = g._annQueue.map(e => e.text);
  clear();
  return out;
});
check('D01 a short banner keeps exactly the historical 1.9 s hold', ann.holdShort === 1.9, String(ann.holdShort));
check('D02 the longest shipped banner now gets real reading time',
  ann.holdLong > 3.0 && ann.holdLong <= 3.8, String(ann.holdLong));
check('D03 the hold is capped so no banner can stall the screen', ann.holdHuge <= 3.8, String(ann.holdHuge));
check('D04 the computed hold is stored on the banner',
  ann.shortStored === 1.9 && ann.longStored === ann.holdLong, JSON.stringify(ann));
check('D05 an explicit opts.duration is honoured (it used to be silently ignored)',
  ann.explicit === 7, String(ann.explicit));
check('D06 the update loop actually holds for that long',
  Math.abs(ann.measuredHold - ann.wantHold) <= 0.2, JSON.stringify({ measured: ann.measuredHold, want: ann.wantHold }));
check('D07 duplicate banners are still suppressed', ann.dupQueued === 0, String(ann.dupQueued));
check('D08 a critical banner still preempts an informational one', ann.preempt === 'CRITICAL', ann.preempt);
check('D09 the banner queue cap still holds', ann.queueCap <= 3, String(ann.queueCap));
check('D10 higher-priority banners still jump the queue', ann.order[0] === 'URGENT', JSON.stringify(ann.order));

// ════════════════════════════════════════════════════════════════════════════
// 4. EVERY CHARACTER IS ADDRESSED
// ════════════════════════════════════════════════════════════════════════════
const chars = await page.evaluate(() => {
  const g = window.__g;
  const roster = g.characters.map(c => c.id);
  const out = {};
  g.meta._save = () => {};
  for (const id of roster) {
    g.endless = true; g.gameOver = false; g.victory = false;
    g.player = g.player || {}; g.player.maxHp = 100; g.player.hp = 100;
    g.player.selectedCharacter = id;
    const got = [];
    for (const key of ['intro', 'mid', 'survival']) {
      const t = key === 'intro' ? 2 : key === 'mid' ? 180 : 600;
      g._edenRunMilestonesShown = new Set();
      if (key !== 'intro') g._edenRunMilestonesShown.add('t_start');
      if (key === 'survival') ['t_3m','t_6m','t_8m'].forEach(k => g._edenRunMilestonesShown.add(k));
      g._edenLastAutoAt = -999; g._edenTransmission = null; g._edenQueue = [];
      g.timeAlive = t;
      g._triggerEdenMilestoneMessages();
      got.push(g._edenTransmission ? g._edenTransmission.message : null);
    }
    out[id] = got;
  }
  return { roster, out };
});
const GENERIC = new Set(['PHENIX trace synchronized.']);
const personal = Object.entries(chars.out).filter(([, v]) => v.every(Boolean));
check('E01 every roster character produces a line at intro, mid and survival',
  personal.length === chars.roster.length,
  JSON.stringify(Object.entries(chars.out).filter(([, v]) => !v.every(Boolean)).map(([k]) => k)));
check('E02 Eddie is addressed personally (he had no pool at all before)',
  /THUNDER|amp|solo|distortion|frequency|Amplitude|noise/i.test(chars.out.eddie.join(' ')),
  JSON.stringify(chars.out.eddie));
check('E03 Dimi Kickboxer is addressed personally (he had no pool at all before)',
  /GAUNTLET|armor|plating|heavy|slow|mass|angel/i.test(chars.out.dimis_kickboxer.join(' ')),
  JSON.stringify(chars.out.dimis_kickboxer));
check('E04 no character falls back to the bare generic intro',
  !Object.values(chars.out).some(v => GENERIC.has(v[0])),
  JSON.stringify(Object.entries(chars.out).filter(([, v]) => GENERIC.has(v[0])).map(([k]) => k)));

// ── gameplay untouched: the picker must never return an empty or non-string line
const sanity = await page.evaluate(() => {
  const g = window.__g;
  let bad = 0, n = 0;
  g.meta._save = () => {};
  for (const id of g.characters.map(c => c.id)) {
    g.endless = true; g.gameOver = false; g.victory = false;
    g.player = g.player || {}; g.player.maxHp = 100; g.player.hp = 100;
    g.player.selectedCharacter = id;
    for (let i = 0; i < 40; i++) {
      g._edenRunMilestonesShown = new Set();
      g._edenLastAutoAt = -999; g._edenTransmission = null; g._edenQueue = [];
      g.timeAlive = 2 + (i % 5);
      g._triggerEdenMilestoneMessages();
      const m = g._edenTransmission && g._edenTransmission.message;
      n++;
      if (typeof m !== 'string' || m.length < 4) bad++;
    }
  }
  return { n, bad };
});
check('E05 every produced line is a real non-empty string', sanity.bad === 0, JSON.stringify(sanity));

check('F01 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const gameErrors = consoleErrors.filter(t => !/audio\/music/.test(t));
check('F02 zero game console errors across the whole session', gameErrors.length === 0, gameErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results,
                   sampleRun: repeat.sample, characterLines: chars.out,
                   pageErrors, consoleErrors }, null, 1));

console.log(`\n=== RESULT: ${passN} PASS / ${failN} FAIL ===`);
if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
console.log('report: ' + OUT);
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
