// ════════════════════════════════════════════════════════════════════════════════
// COLLECTION · the CHAOS tab, and the CORRUPTED section of the LORE tab.
//
// Two additions, both built on shipped UI and shipped save systems:
//
//  1. A tenth Collection tab, CHAOS: per-character Survival Ranks, the four Mega Titans, and the
//     last Chaos Ledger runs. It counts 10 ranks + 4 Titans = 14; the ledger is a LOG, not a
//     collectible, so it is deliberately not counted.
//  2. A CORRUPTED section in the existing LORE tab — three Broken Archive entries that unlock
//     from the ways a Chaos run ends BADLY, stored in the same meta.unlocks the secret logs use.
//
// The load-bearing property is that both are INERT. No currency, no buff, no stat: the three
// archive keys are read only by the LORE tab, and the CHAOS tab is read-only. The D-block
// asserts credits, fragments, Eden Memory and relics are all untouched by unlocking them.
//
// Every unlock here is earned through the real _grantRewards, and every panel is read out of the
// real rendered Collection DOM.
//
// Run: node tools/qa/browser/chaos_collection_proof.mjs [port]
// Writes: /tmp/chaos_collection_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_collection_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8909;
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
  window.__wipe = () => {
    g.meta.chaosRanks = {}; g.meta.chaosLedger = []; g.meta.bossKills = {}; g.meta.relics = {};
    for (const k of ['ba_cold_open', 'ba_still_standing', 'ba_long_silence']) delete g.meta.unlocks[k];
  };
  window.__run = (mode, charId, law) => {
    g.selectedCharacter = charId || 'skeleton_warrior';
    g.gameState = 'playing';
    g.reset();
    if (mode === 'endless') { try { g._enterEndless(); } catch (_) {} }
    if (mode === 'chaos')   { g.runChaosLaw = law === undefined ? 'blood_grid' : law; try { g._beginChaosRun(); } catch (_) {} }
    window.__step(20);
  };
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
  window.__killTitan = (type) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return false; }
    e.enemyType = type; e.isMegaBoss = true; e.maxHp = 100; e.hp = 0; e._killed = true;
    e.pos.x = g.player.pos.x + 100; e.pos.y = g.player.pos.y;
    g._activeTitan = e;
    try { g._updateChaosTitans(1 / 60); } catch (_) { return false; }
    return true;
  };
  // Leave a Mega Titan ALIVE on the field, so the run ends with it still standing.
  window.__armLiveTitan = () => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return false; }
    e.enemyType = 'Giga-Core Overlord'; e.isMegaBoss = true; e.maxHp = 5000; e.hp = 5000;
    e.pos.x = g.player.pos.x + 300; e.pos.y = g.player.pos.y;
    g._activeTitan = e;
    return true;
  };
  window.__end = (secs) => {
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false;
    g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
  };
  // Open the real Collection screen and switch to a tab through the shipped handler.
  window.__openCol = (tab) => {
    try { g.goToAchievementsScreen(); } catch (_) {}
    try { g._syncAchievementsOverlay(); } catch (_) {}
    if (tab) { try { g._colSetTab(tab); } catch (_) { g._colTab = tab; try { g._colRender(); } catch (__) {} } }
    else { try { g._colRender(); } catch (_) {} }
    return !!g._achievementsOverlayEl;
  };
  window.__tabs = () => {
    const el = window.__g._achievementsOverlayEl;
    if (!el) return null;
    return [...el.querySelectorAll('.ct-tab')].map(t => ({
      id: t.dataset.tab, label: t.childNodes[0]?.textContent?.trim(),
      n: t.querySelector('.n')?.textContent?.trim(), active: t.classList.contains('active'),
    }));
  };
  window.__panel = (name) => {
    const el = window.__g._achievementsOverlayEl;
    const p = el?.querySelector(`.ct-panel[data-panel="${name}"]`);
    if (!p) return null;
    return { text: p.textContent.replace(/\s+/g, ' ').trim(), active: p.classList.contains('active') };
  };
  window.__sec = (id) => {
    const el = window.__g._achievementsOverlayEl;
    const s = el?.querySelector('#' + id);
    if (!s) return null;
    return { text: s.textContent.replace(/\s+/g, ' ').trim(), rows: s.children.length };
  };
  window.__econ = () => ({
    credits: g.meta.credits, pf: g.meta.protocolFragments, eden: g.meta.getEdenMemory(),
    relics: Object.keys(g.meta.relics || {}).length,
  });
});
check('A03 the Enemy class is available to the rig', await page.evaluate(() => !!window.__Enemy));

// ════════════════════════════════════════════════════════════════════════════
// T. THE CHAOS TAB
// ════════════════════════════════════════════════════════════════════════════
const tabs = await page.evaluate(() => { window.__wipe(); window.__openCol(); return window.__tabs(); });
check('T01 a tenth tab, CHAOS, exists and sits between ACHIEVEMENTS and LORE',
  tabs.length === 10 && tabs[7]?.id === 'chaos' && tabs[7]?.label === 'CHAOS' &&
  tabs[6]?.id === 'achievements' && tabs[8]?.id === 'lore',
  tabs.map(t => t.id).join(' / '));
check('T02 it counts 10 ranks + 4 Titans and starts empty',
  tabs[7]?.n === '0/14', tabs[7]?.n);

const filled = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'taekwondo_girl', 'dragon_law');
  window.__kill(44); window.__killTitan('Giga-Core Overlord'); window.__killTitan('Malware Leviathan');
  window.__end(21 * 60 + 12);
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__kill(9);
  window.__end(4 * 60);
  window.__openCol('chaos');
  return { tabs: window.__tabs(), ranks: window.__sec('cxc-ranks'), titans: window.__sec('cxc-titans'),
           ledger: window.__sec('cxc-ledger'), rn: window.__sec('cxc-ranks-n'),
           tn: window.__sec('cxc-titans-n'), ln: window.__sec('cxc-ledger-n'),
           panel: window.__panel('chaos') };
});
check('T03 the tab counter tracks real progress — 2 ranks + 2 Titans of 14',
  filled.tabs[7]?.n === '4/14', filled.tabs[7]?.n);
check('T04 the RANKS section lists every character and marks the ones with a run',
  filled.ranks.rows === 10 && filled.rn.text === '2 / 10' &&
  /Neon Taekwondo Girl/.test(filled.ranks.text) && /GOLD/.test(filled.ranks.text) &&
  /21:12/.test(filled.ranks.text) && /BRONZE/.test(filled.ranks.text) &&
  /NO RUN/.test(filled.ranks.text),
  `${filled.ranks.rows} rows, counter ${filled.rn.text}`);
check('T05 the MEGA TITANS section shows all four and which are destroyed',
  filled.titans.rows === 4 && filled.tn.text === '2 / 4 DESTROYED' &&
  /GIGA-CORE OVERLORD/.test(filled.titans.text) && /MALWARE LEVIATHAN/.test(filled.titans.text) &&
  /RELIC ACQUIRED/.test(filled.titans.text) && /\?\?\? MEGA TITAN/.test(filled.titans.text),
  `${filled.titans.rows} rows, counter ${filled.tn.text}`);
check('T06 the CHAOS LEDGER section lists the stored runs, newest first',
  filled.ledger.rows === 2 && /2 RUNS LOGGED/.test(filled.ln.text) &&
  filled.ledger.text.indexOf('Cyber Skeleton Warrior') < filled.ledger.text.indexOf('Neon Taekwondo Girl') &&
  /BLOOD GRID/.test(filled.ledger.text) && /DRAGON LAW/.test(filled.ledger.text) &&
  /2 TITANS/.test(filled.ledger.text),
  `${filled.ledger.rows} rows, ${filled.ln.text}`);
check('T07 the panel is the ACTIVE one after switching to it through the shipped handler',
  filled.panel?.active === true);

const ledCap = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  for (let i = 0; i < 12; i++) { window.__run('chaos', 'skeleton_warrior', 'blood_grid'); window.__end(120 + i); }
  window.__openCol('chaos');
  return { rows: window.__sec('cxc-ledger').rows, n: window.__sec('cxc-ledger-n').text,
           stored: g.meta.getChaosLedger().length, tab: window.__tabs()[7].n };
});
check('T08 the ledger section stays short — 8 rows shown of 12 stored, and never counted in the tab',
  ledCap.rows === 8 && ledCap.stored === 12 && /12 RUNS LOGGED/.test(ledCap.n) &&
  ledCap.tab === '1/14', `${ledCap.rows} rows of ${ledCap.stored}, tab ${ledCap.tab}`);

const emptyLed = await page.evaluate(() => {
  window.__wipe(); window.__openCol('chaos');
  return { ledger: window.__sec('cxc-ledger'), n: window.__sec('cxc-ledger-n').text };
});
check('T09 an empty ledger says so instead of rendering a blank block',
  /No Chaos run logged yet/.test(emptyLed.ledger.text) && /0 RUNS LOGGED/.test(emptyLed.n),
  emptyLed.ledger.text);

// ════════════════════════════════════════════════════════════════════════════
// B. THE CORRUPTED SECTION
// ════════════════════════════════════════════════════════════════════════════
const baLocked = await page.evaluate(() => {
  window.__wipe(); window.__openCol('lore');
  return { sec: window.__sec('ba-list'), n: window.__sec('ba-n').text, tabs: window.__tabs() };
});
check('B01 the LORE tab carries a CORRUPTED section with three locked entries',
  baLocked.sec.rows === 3 && baLocked.n === '0 / 3' &&
  (baLocked.sec.text.match(/\?\?\?/g) || []).length === 3 &&
  /LOST/.test(baLocked.sec.text), `${baLocked.sec.rows} rows, ${baLocked.n}`);
check('B02 a locked entry shows its REQUIREMENT, not its text',
  /Die in Chaos inside the first 3:00/.test(baLocked.sec.text) &&
  !/does not open a door/.test(baLocked.sec.text), baLocked.sec.text.slice(0, 120));

const ba1 = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__end(150);                                   // died at 2:30 — under 3:00
  window.__openCol('lore');
  return { unlocked: !!g.meta.isUnlocked('ba_cold_open'), sec: window.__sec('ba-list'),
           n: window.__sec('ba-n').text, others: [g.meta.isUnlocked('ba_still_standing'), g.meta.isUnlocked('ba_long_silence')] };
});
check('B03 dying inside the first 3:00 recovers THE GRID DOES NOT WARM UP',
  ba1.unlocked === true && /THE GRID DOES NOT WARM UP/.test(ba1.sec.text) &&
  /does not open a door/.test(ba1.sec.text) && ba1.n === '1 / 3' &&
  ba1.others.every(x => !x), `${ba1.n}, others ${JSON.stringify(ba1.others)}`);

const ba2 = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__armLiveTitan();                             // a Mega Titan still standing
  window.__end(7 * 60);
  window.__openCol('lore');
  return { unlocked: !!g.meta.isUnlocked('ba_still_standing'), sec: window.__sec('ba-list'),
           n: window.__sec('ba-n').text, cold: g.meta.isUnlocked('ba_cold_open') };
});
check('B04 dying with a Mega Titan still alive recovers IT WAS STILL STANDING',
  ba2.unlocked === true && /IT WAS STILL STANDING/.test(ba2.sec.text) && ba2.n === '1 / 3' &&
  ba2.cold !== true, `${ba2.n}`);

const ba3 = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__end(11 * 60);                               // 11:00, zero Titans killed
  window.__openCol('lore');
  return { unlocked: !!g.meta.isUnlocked('ba_long_silence'), sec: window.__sec('ba-list'),
           n: window.__sec('ba-n').text };
});
check('B05 surviving 10:00 with no Mega Titan kill recovers THE LONG SILENCE',
  ba3.unlocked === true && /THE LONG SILENCE/.test(ba3.sec.text) && ba3.n === '1 / 3', ba3.n);

const ba3neg = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__killTitan('Quantum Void Emperor');          // a Titan DID fall
  window.__end(11 * 60);
  return { silence: !!g.meta.isUnlocked('ba_long_silence'), titans: g._chaosTitansKilled };
});
check('B06 a 10:00 run that DID kill a Titan does not recover THE LONG SILENCE',
  ba3neg.silence === false && ba3neg.titans === 1, JSON.stringify(ba3neg));

const outside = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('endless', 'skeleton_warrior'); window.__end(120);     // a short Endless death
  const afterEndless = ['ba_cold_open', 'ba_still_standing', 'ba_long_silence'].map(k => g.meta.isUnlocked(k));
  window.__run('campaign', 'skeleton_warrior'); window.__end(700);
  const afterCampaign = ['ba_cold_open', 'ba_still_standing', 'ba_long_silence'].map(k => g.meta.isUnlocked(k));
  return { afterEndless, afterCampaign };
});
check('B07 CONTROL — no archive entry can be recovered outside Chaos',
  outside.afterEndless.every(x => !x) && outside.afterCampaign.every(x => !x),
  JSON.stringify(outside));

// The LORE tab counter is asserted as a DELTA, not a fixed number: its total also contains the
// Eden-Memory-gated milestones and logs, so "18/18" only holds at 100% memory and the check would
// have been measuring the wrong thing.
const allThree = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__openCol('lore');
  const eden0 = g.meta.edenMemoryPercent;               // the OTHER lore source — hold it still
  const t0 = window.__tabs()[8].n.split('/').map(Number);
  window.__run('chaos', 'skeleton_warrior', 'blood_grid'); window.__end(150);
  window.__run('chaos', 'skeleton_warrior', 'blood_grid'); window.__armLiveTitan(); window.__end(7 * 60);
  window.__run('chaos', 'skeleton_warrior', 'blood_grid'); window.__end(11 * 60);
  // Each of those runs also paid +3 Eden Memory, which unlocks milestones and logs in this same
  // tab. Restore it so the delta measures the ARCHIVE and nothing else.
  g.meta.edenMemoryPercent = eden0;
  window.__openCol('lore');
  const t1 = window.__tabs()[8].n.split('/').map(Number);
  return { n: window.__sec('ba-n').text, sec: window.__sec('ba-list'), t0, t1 };
});
check('B08 all three can be recovered, and the LORE tab counter grows by exactly three',
  allThree.n === '3 / 3' && !/\?\?\?/.test(allThree.sec.text) &&
  /THE GRID DOES NOT WARM UP/.test(allThree.sec.text) &&
  /IT WAS STILL STANDING/.test(allThree.sec.text) &&
  /THE LONG SILENCE/.test(allThree.sec.text) &&
  allThree.t1[0] === allThree.t0[0] + 3 && allThree.t1[1] === allThree.t0[1],
  `${allThree.n}, lore tab ${allThree.t0.join('/')} -> ${allThree.t1.join('/')}`);

// ════════════════════════════════════════════════════════════════════════════
// D. NO CURRENCY, NO BUFF, NOTHING ELSE MOVED
// ════════════════════════════════════════════════════════════════════════════
// Isolate the UNLOCK itself. Measuring across whole runs is useless here — the runs pay their own
// end-of-run credits and Eden Memory, so the numbers move for reasons that have nothing to do
// with the archive. (The first draft of this check compared a value against itself and could
// never have failed.)
const inert = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  const before = window.__econ();
  for (const k of ['ba_cold_open', 'ba_still_standing', 'ba_long_silence']) g.meta.unlock(k);
  const after = window.__econ();
  return { before, after, unlocked: ['ba_cold_open', 'ba_still_standing', 'ba_long_silence']
    .map(k => g.meta.isUnlocked(k)), outfits: { ...(g.meta.selectedOutfits || {}) } };
});
check('D01 the archive keys are INERT — recovering all three pays no currency, no Eden, no relic',
  inert.unlocked.every(Boolean) &&
  inert.after.credits === inert.before.credits && inert.after.pf === inert.before.pf &&
  inert.after.eden === inert.before.eden && inert.after.relics === inert.before.relics,
  JSON.stringify({ before: inert.before, after: inert.after }));

const untouched = await page.evaluate(() => {
  const g = window.__g;
  window.__openCol('characters');
  const t = window.__tabs();
  // The nine shipped tabs must keep their ids and their order around the new one.
  return { ids: t.map(x => x.id), active: t.find(x => x.active)?.id,
           lore: window.__panel('lore')?.text?.slice(0, 80),
           em: window.__sec('em-list')?.rows, sl: window.__sec('sl-list')?.rows };
});
// A real CONTROL: the nine shipped tabs must keep their ids AND their relative order. It passes
// with or without the new tab, which is the whole point — asserting the new tab's presence here
// too (as the first draft did) would have made it a feature check wearing a control's label.
check('D02 CONTROL — the nine shipped tabs keep their ids and relative order',
  JSON.stringify(untouched.ids.filter(id => id !== 'chaos')) === JSON.stringify(
    ['characters', 'weapons', 'evolutions', 'fusions', 'relics', 'skins', 'achievements', 'lore', 'ost']),
  untouched.ids.join(' / '));
check('D02b and CHAOS is inserted between ACHIEVEMENTS and LORE',
  untouched.ids.indexOf('chaos') === untouched.ids.indexOf('achievements') + 1 &&
  untouched.ids.indexOf('lore') === untouched.ids.indexOf('chaos') + 1,
  untouched.ids.join(' / '));
check('D03 CONTROL — the LORE tab keeps its milestones and system logs intact',
  untouched.em === 5 && untouched.sl === 10, `${untouched.em} milestones, ${untouched.sl} logs`);

// Take the run down first: the results overlay is still up from the last __end() and would sit
// on top of the Collection in the capture, which is what the first version of this screenshot
// actually photographed.
await page.evaluate(() => {
  const g = window.__g;
  g.gameOver = false; g.victory = false;
  try { g._hideResultsOverlay(); } catch (_) {}
  window.__openCol('chaos');
});
await page.waitForTimeout(400);
await shot('01_chaos_tab.png');
await page.evaluate(() => { window.__openCol('lore'); });
await page.waitForTimeout(400);
await shot('02_lore_corrupted.png');

await page.evaluate(() => {
  const g = window.__g;
  try { g.goToMainMenu(); } catch (_) {}
  g.gameOver = false; g.victory = false;
});
await page.waitForTimeout(500);
check('D04 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D05 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, tabs, filled, inert, ledCap, emptyLed, baLocked, ba1, ba2, ba3, ba3neg, outside, allThree, untouched,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
