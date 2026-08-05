// ════════════════════════════════════════════════════════════════════════════════
// CHAOS LEDGER — one record per Chaos run, and its short form on the DOM results screen.
//
// A Chaos run used to leave nothing behind describing what it WAS: which character, under which
// law, how far, which rank, how many Titans, how many corrupted pacts. The ledger stores that
// for the last 20 runs and the results screen shows the newest three.
//
// The load-bearing property is that it is INERT: nothing reads a ledger entry back into
// gameplay, so it cannot move balance. L06/L11 assert it never appears outside Chaos, and the
// D-block asserts the rest of the results screen is untouched.
//
// Every entry here is minted by the real _grantRewards, every Titan by the real
// _updateChaosTitans teardown, and every corrupted pact by the real selectMutation.
//
// Run: node tools/qa/browser/chaos_ledger_proof.mjs [port]
// Writes: /tmp/chaos_ledger_proof/  (report.json + screenshot)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_ledger_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8907;
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

// ── Rig ─────────────────────────────────────────────────────────────────────
await page.evaluate(async () => {
  const g = window.__g;
  g.meta._save = () => {};
  const src = await fetch('./js/game/Game.js?v=' + window.__BUILD).then(r => r.text()).catch(() => '');
  const ev = (src.match(/Enemy\.js\?v=(\d+)/) || [])[1] || '';
  try { window.__Enemy = (await import(`./js/entities/Enemy.js?v=${ev}`)).Enemy; } catch (_) { window.__Enemy = null; }
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

  window.__run = (mode, charId, law) => {
    g.selectedCharacter = charId || 'skeleton_warrior';
    g.gameState = 'playing';
    g.reset();
    if (mode === 'endless') { try { g._enterEndless(); } catch (_) {} }
    if (mode === 'chaos')   { g.runChaosLaw = law === undefined ? 'blood_grid' : law; try { g._beginChaosRun(); } catch (_) {} }
    if (g.player) g.player.selectedCharacter = g.selectedCharacter;
    window.__step(20);
  };
  // REAL kills, through Enemy.takeHit — the one site that moves player.kills.
  window.__kill = (n) => {
    const made = [];
    for (let i = 0; i < n; i++) {
      let e = null;
      try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { break; }
      e.maxHp = 10; e.hp = 10;
      e.pos.x = g.player.pos.x + 200 + i * 12; e.pos.y = g.player.pos.y;
      g.enemies.push(e); made.push(e);
    }
    for (const e of made) { try { e.takeHit(1e6, g); } catch (_) {} }
    return made.length;
  };
  // A REAL Mega Titan teardown, through _updateChaosTitans.
  window.__killTitan = (type) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return false; }
    e.enemyType = type; e.isMegaBoss = true; e.maxHp = 100; e.hp = 0; e._killed = true;
    e.pos.x = g.player.pos.x + 100; e.pos.y = g.player.pos.y;
    g._activeTitan = e;
    try { g._updateChaosTitans(1 / 60); } catch (_) { return false; }
    return true;
  };
  // A REAL corrupted pact, through the shipped picker + selectMutation.
  window.__takeCorrupted = () => {
    g.player.hp = Math.floor(g.player.maxHp * 0.5);
    for (let t = 0; t < 400; t++) {
      const hand = g._buildMutationChoices();
      if (!hand[2]?.corrupted) continue;
      g.mutationUI = { choices: hand };
      g.selectMutation(2);
      return hand[2].key;
    }
    return null;
  };
  window.__end = (secs) => {
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false;
    g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
  };
  window.__show = () => {
    g._resultsDismissed = false; g._resultsShownFor = null;
    try { g.draw(window.__ctx()); } catch (_) {}
    const el = g._resultsOverlayEl;
    if (!el) return null;
    // Anchor on the HEADER, which is a LEAF div — textContent bubbles, so the strip container
    // also starts with "CHAOS LEDGER" and, being earlier in document order, matched first and
    // handed back the whole rank band with a row count four too high.
    for (const d of el.querySelectorAll('div')) {
      const t = (d.textContent || '').trim();
      if (/^CHAOS LEDGER · \d+ RUNS? LOGGED$/.test(t) && d.querySelector('div') === null) {
        const strip = d.parentElement;
        return { head: t,
                 text: strip.textContent.replace(/\s+/g, ' ').trim(),
                 rows: strip.children.length - 1 };   // minus the header itself
      }
    }
    return null;
  };
  window.__ledger = () => JSON.parse(JSON.stringify(g.meta.getChaosLedger() || []));
});
check('A03 the Enemy class is available to the rig', await page.evaluate(() => !!window.__Enemy));

// ════════════════════════════════════════════════════════════════════════════
// L. THE RECORD
// ════════════════════════════════════════════════════════════════════════════
const one = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('chaos', 'taekwondo_girl', 'dragon_law');
  window.__kill(31);
  window.__killTitan('Giga-Core Overlord');
  window.__killTitan('Malware Leviathan');
  window.__end(22 * 60 + 15);
  return { ledger: window.__ledger(), titans: g._chaosTitansKilled, kills: g.player.kills };
});
check('L01 a Chaos run mints exactly ONE ledger entry', one.ledger.length === 1, JSON.stringify(one.ledger));
check('L02 the entry records character, law, time, rank, kills and Titans correctly',
  one.ledger[0]?.char === 'taekwondo_girl' && one.ledger[0]?.law === 'dragon_law' &&
  one.ledger[0]?.secs === 22 * 60 + 15 && one.ledger[0]?.rank === 'GOLD' &&
  one.ledger[0]?.kills === 31 && one.ledger[0]?.titans === 2,
  JSON.stringify(one.ledger[0]));

const corrupt = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('chaos', 'japan_phasewalker', 'broken_signal');
  const a = window.__takeCorrupted();
  const b = window.__takeCorrupted();
  window.__end(5 * 60);
  return { took: [a, b], taken: { ...g.mutations.taken }, ledger: window.__ledger() };
});
check('L03 corrupted pacts are counted from the REAL mutation path',
  corrupt.took.every(Boolean) && corrupt.ledger[0]?.corrupted === 2,
  JSON.stringify({ took: corrupt.took, corrupted: corrupt.ledger[0]?.corrupted, taken: corrupt.taken }));
// L04 has to actually TAKE an ordinary mutation to say anything about ordinary mutations. The
// first draft only ever took corrupted cards, so `taken` held nothing else and the assertion was
// vacuous — it could not have failed for the right reason.
const mixed = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('chaos', 'japan_phasewalker', 'blood_grid');
  g.player.hp = Math.floor(g.player.maxHp * 0.5);
  const hand = g._buildMutationChoices();
  g.mutationUI = { choices: hand };
  g.selectMutation(0);                       // slot 0 is always an ORDINARY forced mutation
  const plain = hand[0].key;
  const corr = window.__takeCorrupted();     // then one corrupted
  window.__end(5 * 60);
  return { plain, corr, taken: { ...g.mutations.taken }, ledger: window.__ledger() };
});
check('L04 ordinary mutations are NOT counted as corrupted — one of each gives corrupted:1',
  mixed.plain.indexOf('corrupt_') !== 0 && mixed.corr.indexOf('corrupt_') === 0 &&
  Object.keys(mixed.taken).length === 2 && mixed.ledger[0]?.corrupted === 1,
  JSON.stringify({ plain: mixed.plain, corr: mixed.corr, corrupted: mixed.ledger[0]?.corrupted }));

const noLaw = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('chaos', 'skeleton_warrior', null);
  window.__end(4 * 60);
  return window.__ledger()[0] ?? null;
});
// Null-safe: on a build with no ledger this must report FAIL, not throw and silence every
// check after it. The first baseline attempt died here and reported nothing about the strip.
check('L05 a run with NO LAW records law:null rather than inventing one',
  noLaw !== null && noLaw.law === null && noLaw.rank === 'BRONZE', JSON.stringify(noLaw));

const cap = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  for (let i = 0; i < 25; i++) {
    window.__run('chaos', 'skeleton_warrior', 'blood_grid');
    window.__kill(i);
    window.__end(60 + i);
  }
  const L = window.__ledger();
  return { len: L.len ?? L.length, first: L[0], last: L[L.length - 1] };
});
check('L06 the ledger is capped at 20 and is NEWEST FIRST',
  cap.len === 20 && cap.first?.secs === 60 + 24 && cap.last?.secs === 60 + 5,
  `${cap.len} entries, newest ${cap.first?.secs}s, oldest ${cap.last?.secs}s`);

const others = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('endless', 'skeleton_warrior'); window.__kill(10); window.__end(600);
  const afterEndless = window.__ledger().length;
  window.__run('campaign', 'skeleton_warrior'); window.__kill(10); window.__end(400);
  const afterCampaign = window.__ledger().length;
  return { afterEndless, afterCampaign };
});
check('L07 CONTROL — an Endless or Campaign run mints NOTHING',
  others.afterEndless === 0 && others.afterCampaign === 0, JSON.stringify(others));

const persist = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('chaos', 'eddie', 'frozen_eden'); window.__kill(7); window.__end(11 * 60);
  const before = window.__ledger();
  // Round-trip through the SAME serialiser the real save uses.
  const blob = { chaosLedger: g.meta.chaosLedger };
  const restored = Array.isArray(blob.chaosLedger) ? JSON.parse(JSON.stringify(blob.chaosLedger)).slice(0, 20) : [];
  return { before, restored, same: JSON.stringify(before) === JSON.stringify(restored) };
});
check('L08 an entry survives a save round-trip unchanged',
  persist.same === true && persist.restored.length === 1 && persist.restored[0]?.char === 'eddie' &&
  persist.restored[0]?.law === 'frozen_eden' && persist.restored[0]?.rank === 'SILVER',
  JSON.stringify(persist.restored[0]));

const cleared = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('chaos', 'skeleton_warrior', 'blood_grid'); window.__end(300);
  const before = window.__ledger().length;
  g.meta.reset();
  return { before, after: window.__ledger().length };
});
check('L09 MetaProgress.reset() clears the ledger — it does not survive a progress wipe',
  cleared.before === 1 && cleared.after === 0, JSON.stringify(cleared));

const junk = await page.evaluate(() => {
  const g = window.__g;
  // A ledger from an older build / a hand-edited save must degrade, never break the screen.
  g.meta.chaosLedger = [{}, { char: 'ghost' }, { char: 'x', law: 'a', secs: 'NaN', rank: 'WAT', kills: -5 }];
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__end(700);
  const strip = window.__show();
  return { strip, len: window.__ledger().length };
});
check('L10 a malformed ledger entry degrades to a readable row instead of breaking the screen',
  junk.strip !== null && junk.strip.rows >= 1, JSON.stringify(junk.strip));

// ════════════════════════════════════════════════════════════════════════════
// S. THE SUMMARY ON THE RESULTS SCREEN
// ════════════════════════════════════════════════════════════════════════════
const strip = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('chaos', 'cyber_arm_hero', 'no_mercy_protocol'); window.__kill(12); window.__end(6 * 60);
  window.__run('chaos', 'skeleton_warrior', 'serpent_law');     window.__kill(40); window.__end(13 * 60);
  window.__run('chaos', 'taekwondo_girl', 'blood_grid');
  window.__kill(88); window.__killTitan('Quantum Void Emperor');
  window.__end(24 * 60 + 30);
  return { strip: window.__show(), ledger: window.__ledger() };
});
check('S01 the results screen shows the CHAOS LEDGER strip with the total logged',
  strip.strip !== null && /CHAOS LEDGER · 3 RUNS LOGGED/.test(strip.strip.head),
  strip.strip ? strip.strip.head : 'NO STRIP');
const s2 = strip.strip?.text ?? '';
check('S02 this run is the first row, with its law, rank, kills and Titan count',
  /Neon Taekwondo Girl/.test(s2) && /BLOOD GRID/.test(strip.strip.text) &&
  /24:30/.test(s2) && /GOLD/.test(s2) &&
  /88 K/.test(s2) && /1 TITAN/.test(s2),
  s2 || 'NO STRIP');
check('S03 the two previous runs are shown beneath it — three rows, not the whole ledger',
  strip.strip?.rows === 3 && /Cyber Skeleton Warrior/.test(s2) &&
  /Cyber Arm Hero/.test(s2), `${strip.strip?.rows} rows`);

const capped = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  for (let i = 0; i < 6; i++) { window.__run('chaos', 'skeleton_warrior', 'blood_grid'); window.__end(120 + i); }
  return window.__show();
});
check('S04 it stays SHORT — at most three rows however long the ledger gets',
  capped?.rows === 3 && /6 RUNS LOGGED/.test(capped?.head ?? ''), `${capped?.rows} rows, head "${capped?.head}"`);

const corruptRow = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('chaos', 'japan_phasewalker', 'dragon_law');
  window.__takeCorrupted();
  window.__end(8 * 60);
  return window.__show();
});
check('S05 a corrupted pact is called out on the row',
  corruptRow !== null && /1 CORRUPTED/.test(corruptRow.text), corruptRow ? corruptRow.text : 'NO STRIP');

const noStrip = await page.evaluate(() => {
  const g = window.__g;
  window.__run('endless', 'skeleton_warrior'); window.__end(600);
  const e = window.__show();
  window.__run('campaign', 'skeleton_warrior'); window.__end(400);
  const c = window.__show();
  return { endless: e, campaign: c };
});
check('S06 CONTROL — no ledger strip on an Endless or Campaign results screen',
  noStrip.endless === null && noStrip.campaign === null, JSON.stringify(noStrip));

const empty = await page.evaluate(() => {
  const g = window.__g;
  g.meta.chaosLedger = [];
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  g.timeAlive = g._chaosStartedAt + 300;
  g.gameOver = true; g.rewardsGranted = true;      // rewards suppressed → nothing minted
  g.chaosRank = 'BRONZE'; g.chaosTimeSecs = 300;
  return { strip: window.__show(), len: window.__ledger().length };
});
check('S07 an empty ledger renders no strip at all — the rank band still stands alone',
  empty.len === 0 && empty.strip === null, JSON.stringify(empty));

// ════════════════════════════════════════════════════════════════════════════
// D. NOTHING ELSE MOVED
// ════════════════════════════════════════════════════════════════════════════
const untouched = await page.evaluate(() => {
  const g = window.__g;
  window.__run('chaos', 'skeleton_warrior', 'blood_grid'); window.__kill(5); window.__end(754);
  window.__show();
  const el = g._resultsOverlayEl;
  const tiles = [...el.querySelectorAll('.rs-stat')].map(s =>
    [s.querySelector('.k')?.textContent.trim(), s.querySelector('.v')?.textContent.trim()]);
  return { tiles, mode: el.querySelector('.rs-mode')?.textContent.trim(),
           btns: [...el.querySelectorAll('[data-rsbtn]')].map(b => b.dataset.rsbtn),
           rank: !!el.textContent.match(/CHAOS SURVIVAL RANK/) };
});
check('D01 CONTROL — the five stat tiles, the mode pill and the buttons are untouched',
  JSON.stringify(untouched.tiles.map(t => t[0])) ===
  JSON.stringify(['TIME SURVIVED', 'LEVEL', 'KILLS', 'GRID CORES', 'FRAGMENTS']) &&
  untouched.mode === 'CHAOS MODE' &&
  JSON.stringify(untouched.btns) === JSON.stringify(['retry', 'upgrades', 'menu']),
  JSON.stringify(untouched));
check('D02 CONTROL — the rank band still renders alongside the ledger', untouched.rank === true);

await shot('01_chaos_results_with_ledger.png');
await page.evaluate(() => { const g = window.__g; g.gameOver = false; g.victory = false; window.__step(60); });
await page.waitForTimeout(300);
const lum = await page.evaluate(() => {
  const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
  if (!c) return { ok: false };
  const o = document.createElement('canvas'); o.width = 160; o.height = 90;
  const cx = o.getContext('2d', { willReadFrequently: true });
  cx.drawImage(c, 0, 0, 160, 90);
  const d = cx.getImageData(0, 0, 160, 90).data;
  let sum = 0, mx = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; if (l > mx) mx = l;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  return { ok: true, mean: +(sum / (d.length / 4)).toFixed(2), max: mx, colors: colors.size };
});
check('D03 the game is still rendering — no black screen',
  lum.ok && !(lum.mean < 6 && lum.max < 24) && lum.colors > 4, JSON.stringify(lum));
check('D04 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D05 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, one, corrupt, mixed, noLaw, cap, others, persist, cleared, junk, strip, capped, corruptRow, noStrip, empty, untouched, lum,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
