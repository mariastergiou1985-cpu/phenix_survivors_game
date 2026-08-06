// ════════════════════════════════════════════════════════════════════════════════
// TITAN TROPHIES — four cosmetic badges, one per Mega Titan, earned on the first kill.
//
// The point of this file is to prove TWO things that are easy to claim and easy to get wrong:
//   1. the badge appears on the CHAOS tab and on every character card, on the FIRST real kill,
//      including a kill that happens mid-session with the cards already built;
//   2. it is cosmetic in the strictest sense — no currency, no stat, no relic, no unlock key,
//      no save-shape change. T-block for the earning, C-block for the "changes nothing".
//
// Every kill here goes through the shipped _updateChaosTitans() handler, the same branch a real
// killing blow reaches, so the trophy is earned by the game rather than by the test.
//
// Run: node tools/qa/browser/titan_trophies_proof.mjs [port]
// Writes: /tmp/titan_trophies_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/titan_trophies_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8921;
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

const FLAGS = ['titan_overlord', 'titan_leviathan', 'titan_emperor', 'titan_tyrant'];
const MARKS = ['❖', '✹', '✵', '❂'];
await page.evaluate(async ([FLAGS, MARKS]) => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__FLAGS = FLAGS; window.__MARKS = MARKS;
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
  window.__wipe = () => { g.meta.bossKills = {}; g.meta.relics = {}; g.meta.equippedRelic = null; };
  window.__run = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    try { g._beginChaosRun(); } catch (_) {}
    window.__step(20);
  };
  window.__at = (secs) => { g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs; };
  // A REAL kill, through the shipped handler — the branch recordBossKill() actually lives on.
  window.__killTitan = (type, atSecs) => {
    if (typeof atSecs === 'number') window.__at(atSecs);
    g.enemies = g.enemies.filter(e => !e.isMegaBoss);
    g._activeTitan = { enemyType: type, hp: 0, _killed: true, isMegaBoss: true, pos: { x: 0, y: 0 } };
    try { g._updateChaosTitans(1 / 60); } catch (e) { window.__err = String(e); }
  };
  window.__TITANS = ['Giga-Core Overlord', 'Malware Leviathan',
                     'Quantum Void Emperor', 'Apocalypse Mech Tyrant'];
  // Everything a "cosmetic" claim has to cover.
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
  window.__openCol = (tab) => {
    try { g.goToAchievementsScreen(); } catch (_) {}
    const el = document.getElementById('cgm-collection') || document.querySelector('.ct-wrap')?.parentElement;
    try { g._colSelectTab?.(tab); } catch (_) {}
    try {
      const t = document.querySelector(`.ct-tab[data-tab="${tab}"]`);
      if (t) t.click();
    } catch (_) {}
    return el || document;
  };
  window.__trophySection = () => {
    const sec = document.querySelector('#cxc-trophies');
    const n   = document.querySelector('#cxc-trophies-n');
    if (!sec) return null;
    const rows = [...sec.querySelectorAll('.sl-row')].map(r => ({
      mark: (r.querySelector('.sl-num')?.textContent || '').trim(),
      name: (r.querySelector('.sl-title-row')?.textContent || '').trim(),
      req:  (r.querySelector('.sl-text')?.textContent || '').trim(),
      st:   (r.querySelector('.sl-status')?.textContent || '').trim(),
    }));
    return { rows, n: (n?.textContent || '').trim(), text: sec.textContent };
  };
  // The character cards. Anchored on the LEAF badge span, because textContent bubbles and a
  // selector on the card would happily report the whole card as "having" a badge.
  window.__cards = () => {
    try { g.goToCharacterSelect?.(); } catch (_) {}
    try { g._syncCharSelectOverlay?.(); } catch (_) {}
    const cards = [...document.querySelectorAll('.csc-card')];
    const withT = cards.filter(c => !!c.querySelector('.csc-trophies'));
    const marks = withT[0] ? [...withT[0].querySelectorAll('.csc-trophies span')].map(s => s.textContent).join('') : '';
    const sigilFirst = withT[0]
      ? !!(withT[0].querySelector('.csc-sigils') &&
           withT[0].querySelector('.csc-sigils').compareDocumentPosition(withT[0].querySelector('.csc-trophies'))
             & Node.DOCUMENT_POSITION_FOLLOWING)
      : null;
    return { cards: cards.length, withT: withT.length, marks, sigilFirst };
  };
}, [FLAGS, MARKS]);

// ════════════════════════════════════════════════════════════════════════════
// T. EARNING THEM
// ════════════════════════════════════════════════════════════════════════════
const earn = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run();
  const cold = window.__FLAGS.map(f => !!g.meta.bossKills?.[f]);
  const out = [];
  for (let i = 0; i < 4; i++) {
    window.__killTitan(window.__TITANS[i], 60 + i * 40);
    out.push(window.__FLAGS.map(f => !!g.meta.bossKills?.[f]));
  }
  return { cold, out };
});
check('T01 no trophy before any Titan falls',
  earn.cold.every(v => v === false), JSON.stringify(earn.cold));
check('T02 each Mega Titan grants ITS OWN trophy on the first kill, and only its own',
  JSON.stringify(earn.out) === JSON.stringify([
    [true, false, false, false], [true, true, false, false],
    [true, true, true, false],   [true, true, true, true]]),
  JSON.stringify(earn.out));

const tab = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__openCol('chaos');
  const locked = window.__trophySection();
  g.meta.bossKills = { titan_overlord: true, titan_emperor: true };
  window.__openCol('chaos');
  const some = window.__trophySection();
  g.meta.bossKills = { titan_overlord: true, titan_leviathan: true, titan_emperor: true, titan_tyrant: true };
  window.__openCol('chaos');
  const all = window.__trophySection();
  return { locked, some, all };
});
check('T03 the CHAOS tab lists all FOUR, locked, with the Titan each one needs',
  tab.locked && tab.locked.rows.length === 4 && tab.locked.n === '0 / 4' &&
  tab.locked.rows.every(r => r.name === '???' && /Destroy the /.test(r.req) && /LOCKED/.test(r.st)),
  JSON.stringify({ n: tab.locked?.n, rows: tab.locked?.rows.length, first: tab.locked?.rows[0] }));
check('T04 the CHAOS tab counts and names only the ones actually earned',
  tab.some.n === '2 / 4' &&
  /OVERLORD TROPHY/.test(tab.some.text) && /EMPEROR TROPHY/.test(tab.some.text) &&
  !/LEVIATHAN TROPHY/.test(tab.some.text) && !/TYRANT TROPHY/.test(tab.some.text) &&
  tab.all.n === '4 / 4',
  JSON.stringify({ some: tab.some.n, all: tab.all.n }));
check('T05 all four names and all four distinct marks reach the tab',
  ['OVERLORD TROPHY', 'LEVIATHAN TROPHY', 'EMPEROR TROPHY', 'TYRANT TROPHY'].every(n => tab.all.text.includes(n)) &&
  new Set(tab.all.rows.map(r => r.mark)).size === 4 &&
  String(tab.all.rows.map(r => r.mark).join('')) === '❖✹✵❂',
  JSON.stringify(tab.all.rows.map(r => r.mark + ' ' + r.st)));

const cards = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  const none = window.__cards();
  g.meta.bossKills = { titan_overlord: true };
  const one = window.__cards();
  g.meta.bossKills = { titan_overlord: true, titan_leviathan: true, titan_emperor: true, titan_tyrant: true };
  const all = window.__cards();
  return { none, one, all };
});
check('T06 the character cards show NOTHING before the first Titan falls',
  cards.none.withT === 0 && cards.none.cards === 10, JSON.stringify(cards.none));
check('T07 every card carries the badges, and only the earned ones',
  cards.one.withT === cards.one.cards && cards.one.marks === '❖' &&
  cards.all.withT === cards.all.cards && cards.all.marks === '❖✹✵❂',
  JSON.stringify({ one: cards.one.marks, all: cards.all.marks, cards: cards.all.withT }));

const midSession = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__cards();                                   // build the cards with NOTHING earned
  const before = window.__cards();
  window.__run();
  window.__killTitan(window.__TITANS[1], 90);         // a real kill, cards already built
  const after = window.__cards();
  return { before, after, killed: !!g.meta.bossKills?.titan_leviathan };
});
check('T08 a Titan felled MID-SESSION appears without a reload — the cards are built once',
  midSession.killed === true && midSession.before.withT === 0 &&
  midSession.after.withT === midSession.after.cards && midSession.after.marks === '✹',
  JSON.stringify({ before: midSession.before.withT, after: midSession.after.marks }));

const order = await page.evaluate(() => {
  const g = window.__g;
  g.meta.bossKills = { titan_overlord: true, titan_tyrant: true };
  g.meta.unlock('sg_titanbreaker');
  const c = window.__cards();
  g.meta.bossKills = {};
  const gone = window.__cards();
  return { c, gone };
});
check('T09 trophies sit BELOW the sigil row, and disappear cleanly when revoked',
  order.c.sigilFirst === true && order.c.withT === order.c.cards &&
  order.gone.withT === 0,
  JSON.stringify({ sigilFirst: order.c.sigilFirst, afterRevoke: order.gone.withT }));

// ════════════════════════════════════════════════════════════════════════════
// C. COSMETIC — it must change nothing at all
// ════════════════════════════════════════════════════════════════════════════
const cosmetic = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run();
  const before = window.__stats();
  g.meta.bossKills = { titan_overlord: true, titan_leviathan: true, titan_emperor: true, titan_tyrant: true };
  window.__openCol('chaos'); window.__cards();
  window.__run();
  window.__step(60);
  return { before, after: window.__stats() };
});
check('C01 owning all four changes NO currency, NO stat, NO relic and NO unlock',
  JSON.stringify(cosmetic.before) === JSON.stringify(cosmetic.after),
  JSON.stringify({ before: cosmetic.before, after: cosmetic.after }));

const noKeys = await page.evaluate(async (build) => {
  const { UNLOCK_KEYS } = await import(`./js/game/MetaProgress.js?v=${build}`);
  const g = window.__g;
  g.meta.bossKills = { titan_overlord: true };
  // The trophy must be readable with the unlocks store completely empty — proof it lives on
  // bossKills and nowhere else, which is what makes it retroactive and unmigratable.
  const keptUnlocks = g.meta.unlocks;
  g.meta.unlocks = {};
  const stillThere = window.__cards().marks;
  g.meta.unlocks = keptUnlocks;
  return { keys: UNLOCK_KEYS.filter(k => /troph/i.test(k)), stillThere };
}, BUILD);
check('C02 no new UNLOCK_KEYS entry — the badge is read straight off bossKills',
  noKeys.keys.length === 0 && noKeys.stillThere === '❖',
  JSON.stringify(noKeys));

const retro = await page.evaluate(async (build) => {
  const { MetaProgress } = await import(`./js/game/MetaProgress.js?v=${build}`);
  const g = window.__g;
  const keep = localStorage.getItem('phenix_meta');
  const stub = g.meta._save, proto = Object.getPrototypeOf(g.meta);
  // A save written BEFORE trophies existed already contains the bossKills that earn them.
  g.meta._save = proto._save;
  g.meta.bossKills = { titan_overlord: true, titan_tyrant: true };
  g.meta._save();
  const fresh = new MetaProgress();
  const out = { overlord: fresh.bossKills?.titan_overlord === true,
                tyrant:   fresh.bossKills?.titan_tyrant === true,
                emperor:  !!fresh.bossKills?.titan_emperor,
                hasTrophyKey: JSON.stringify(fresh).includes('trophy') };
  g.meta._save = stub;
  if (keep !== null) localStorage.setItem('phenix_meta', keep);
  return out;
}, BUILD);
check('C03 RETROACTIVE — an existing save already owns the trophies it earned, with no new field',
  retro.overlord === true && retro.tyrant === true && retro.emperor === false &&
  retro.hasTrophyKey === false, JSON.stringify(retro));

const otherTabs = await page.evaluate(() => {
  const g = window.__g;
  g.meta.bossKills = { titan_overlord: true, titan_leviathan: true, titan_emperor: true, titan_tyrant: true };
  window.__openCol('chaos');
  const sig = document.querySelector('#cxc-sigils-n')?.textContent?.trim();
  const ranks = document.querySelector('#cxc-ranks-n')?.textContent?.trim();
  const tit = document.querySelector('#cxc-titans-n')?.textContent?.trim();
  return { sig, ranks, tit };
});
check('C04 CONTROL — the sigil, rank and Mega Titan sections are untouched by the new one',
  /\/ 12$/.test(otherTabs.sig || '') && /\/ 10$/.test(otherTabs.ranks || '') &&
  /4 \/ 4 DESTROYED/.test(otherTabs.tit || ''),
  JSON.stringify(otherTabs));

// ════════════════════════════════════════════════════════════════════════════
// D. DRAW / REGRESSION
// ════════════════════════════════════════════════════════════════════════════
await shot('chaos_tab.png');
const draw = await page.evaluate(() => {
  const g = window.__g;
  // Force a REAL run before sampling. The DOM screens this file opens (Collection, Character
  // Select) leave gameState on those screens and their overlay up, and draw() correctly renders
  // nothing to the canvas there — so a "no black screen" check that sampled from one was reading
  // a legitimately blank surface and calling it a black screen. Diagnosed 14/14 reproducible with
  // gameState 'character_select'. The state is now forced, and asserted, before sampling.
  const __toRun = () => {
    for (const sel of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel']) {
      const n = document.querySelector(sel); if (n) n.remove();
    }
    try { g._hideMenuOverlay?.(); } catch (_) {}
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.runChaosLaw = 'blood_grid';
    g._contractRolled = true; g.runChaosContract = 'tc_boss_rush';
    try { g._beginChaosRun(); } catch (_) {}
    g.gameState = 'playing'; g.gameOver = false; g.victory = false;
  };
  __toRun();
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
check('D01 the game is still rendering IN A RUN — no black screen',
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
