// ════════════════════════════════════════════════════════════════════════════════
// CHAOS SIGILS wave 3 (the set closes at twelve) and the LAST TWO Titan relics.
//
//  1. Four completion sigils. Every one reads persisted state that already existed — unlocks,
//     relics, chaosRanks, chaosLedger — so the set closes with NO new run counters. Cosmetic.
//  2. emperor_singularity_edge: a miniature Amber-Gold hole that pulls, using the shipped
//     _tickSingularity falloff and Enemy.takeHit. Four hard caps: one at a time, 6 s cooldown,
//     2 s life, 14 victims per tick.
//  3. tyrant_antimatter_battery: below 30% HP, a 6-missile barrage through the shipped _petBombs
//     ordnance pipeline. Caps: fires on the CROSSING only, 25 s cooldown, 6 missiles, 4 per run.
//
// The C-block is the one that matters most here: it proves every cap actually binds.
//
// Run: node tools/qa/browser/chaos_sigils3_titan_relics_proof.mjs [port]
// Writes: /tmp/chaos_sigils3_proof/  (report.json + screenshot)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_sigils3_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8915;
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

const ALL12 = ['sg_titanbreaker', 'sg_unbroken', 'sg_apex', 'sg_pactbound',
               'sg_lawless', 'sg_centurion', 'sg_full_roster', 'sg_iron_will',
               'sg_archivist', 'sg_reliquary', 'sg_platinum', 'sg_chronicler'];
const NEW4 = ALL12.slice(8);
const BA = ['ba_cold_open', 'ba_still_standing', 'ba_long_silence'];
const TITAN_RELICS = ['overlord_prism_array', 'leviathan_nanite_core',
                      'emperor_singularity_edge', 'tyrant_antimatter_battery'];
await page.evaluate(async ([ALL12, NEW4, BA, TR]) => {
  const g = window.__g;
  g.meta._save = () => {};
  const src = await fetch('./js/game/Game.js?v=' + window.__BUILD).then(r => r.text()).catch(() => '');
  const ev = (src.match(/Enemy\.js\?v=(\d+)/) || [])[1] || '';
  try { window.__Enemy = (await import(`./js/entities/Enemy.js?v=${ev}`)).Enemy; } catch (_) { window.__Enemy = null; }
  window.__ALL12 = ALL12; window.__NEW4 = NEW4; window.__BA = BA; window.__TR = TR;
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__step = (n, keepHp) => {
    for (let i = 0; i < n; i++) {
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      if (!keepHp && g.player) g.player.hp = g.player.maxHp;
      try { g.update(1 / 60, window.__IN); } catch (_) {}
    }
  };
  window.__ctx = () => (document.querySelector('canvas#game') ||
    [...document.querySelectorAll('canvas')].find(x => x.width > 400)).getContext('2d');
  window.__wipe = () => { for (const k of ALL12.concat(BA)) delete g.meta.unlocks[k]; };
  window.__new = () => NEW4.map(k => !!g.meta.isUnlocked(k));
  window.__run = (mode, charId, law) => {
    g.selectedCharacter = charId || 'skeleton_warrior';
    g.gameState = 'playing'; g.reset();
    if (mode === 'endless') { try { g._enterEndless(); } catch (_) {} }
    if (mode === 'chaos')   { g.runChaosLaw = law === undefined ? 'blood_grid' : law; try { g._beginChaosRun(); } catch (_) {} }
    window.__step(20);
  };
  window.__end = (secs) => {
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false; g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
  };
  window.__equip = (id) => { g.meta.relics = { [id]: true }; g.meta.equippedRelic = id; };
  window.__spawn = (n, dx, dy, hp, spread) => {
    const made = [];
    for (let i = 0; i < n; i++) {
      let e = null;
      try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { break; }
      e.maxHp = hp ?? 1e7; e.hp = e.maxHp; e.stunned = 0;
      e.pos.x = g.player.pos.x + dx + i * (spread ?? 6); e.pos.y = g.player.pos.y + dy;
      g.enemies.push(e); made.push(e);
    }
    return made;
  };
  window.__openCol = (tab) => {
    try { g.goToAchievementsScreen(); } catch (_) {}
    try { g._syncAchievementsOverlay(); } catch (_) {}
    if (tab) { try { g._colSetTab(tab); } catch (_) { g._colTab = tab; try { g._colRender(); } catch (__) {} } }
    return !!g._achievementsOverlayEl;
  };
  window.__sec = (id) => {
    const s = window.__g._achievementsOverlayEl?.querySelector('#' + id);
    return s ? { text: s.textContent.replace(/\s+/g, ' ').trim(), rows: s.children.length } : null;
  };
  window.__cards = () => {
    try { g.goToCharacterSelect?.(); } catch (_) {}
    try { g._syncCharSelectOverlay?.(); } catch (_) {}
    const el = document.querySelector('#cgm-charselect');
    if (!el) return null;
    const cards = [...el.querySelectorAll('.csc-card')];
    return { cards: cards.length, withSigils: cards.filter(c => c.querySelector('.csc-sigils')).length,
             marks: cards[0]?.querySelector('.csc-sigils')?.textContent?.trim() ?? null };
  };
  window.__stats = () => ({
    credits: g.meta.credits, pf: g.meta.protocolFragments, eden: g.meta.getEdenMemory(),
    maxHp: g.player?.maxHp ?? 0, speed: g.player?.speed ?? 0, xpMult: g.player?.xpMult ?? 0,
    cd: g.player?.abilityCdMult ?? 0, dr: g.player?.contactDamageReduction ?? 0,
  });
}, [ALL12, NEW4, BA, TITAN_RELICS]);
check('A03 the Enemy class is available to the rig', await page.evaluate(() => !!window.__Enemy));

// ════════════════════════════════════════════════════════════════════════════
// S. THE LAST FOUR SIGILS
// ════════════════════════════════════════════════════════════════════════════
const arch = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  for (const k of window.__BA.slice(0, 2)) g.meta.unlock(k);   // two of three
  window.__end(5 * 60);
  const two = window.__new();
  g.meta.unlock(window.__BA[2]);                                // now all three
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__end(5 * 60);
  return { two, three: window.__new() };
});
check('S01 ARCHIVIST — earned only once ALL three archive entries are recovered',
  arch.two[0] === false && arch.three[0] === true, JSON.stringify(arch));

const reliq = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  g.meta.relics = {};
  for (const r of window.__TR.slice(0, 3)) g.meta.relics[r] = true;   // three of four
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__end(5 * 60);
  const three = window.__new();
  g.meta.relics[window.__TR[3]] = true;
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__end(5 * 60);
  return { three, four: window.__new() };
});
check('S02 RELIQUARY — earned only once all FOUR Titan relics are owned',
  reliq.three[1] === false && reliq.four[1] === true, JSON.stringify(reliq));

const plat = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe(); g.meta.chaosRanks = {};
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__end(25 * 60);                                  // GOLD, not PLATINUM
  const gold = window.__new();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__end(31 * 60);                                  // PLATINUM
  return { gold, platinum: window.__new(), rank: g.meta.chaosRanks.skeleton_warrior?.bestRank };
});
check('S03 PLATINUM STANDARD — GOLD is not enough, PLATINUM earns it',
  plat.gold[2] === false && plat.platinum[2] === true && plat.rank === 'PLATINUM',
  JSON.stringify(plat));

const chron = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe(); g.meta.chaosLedger = [];
  for (let i = 0; i < 19; i++) { window.__run('chaos', 'skeleton_warrior', 'blood_grid'); window.__end(120 + i); }
  const at19 = { got: window.__new()[3], len: g.meta.getChaosLedger().length };
  window.__run('chaos', 'skeleton_warrior', 'blood_grid'); window.__end(200);
  return { at19, at20: { got: window.__new()[3], len: g.meta.getChaosLedger().length } };
});
check('S04 CHRONICLER — earned only when the ledger is full at twenty',
  chron.at19.got === false && chron.at19.len === 19 &&
  chron.at20.got === true && chron.at20.len === 20, JSON.stringify(chron));

const outside = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  g.meta.relics = {}; for (const r of window.__TR) g.meta.relics[r] = true;
  for (const k of window.__BA) g.meta.unlock(k);
  window.__run('endless', 'skeleton_warrior'); window.__end(31 * 60);
  const afterEndless = window.__new();
  window.__run('campaign', 'skeleton_warrior'); window.__end(31 * 60);
  return { afterEndless, afterCampaign: window.__new() };
});
check('S05 CONTROL — none of the four can be earned outside Chaos',
  outside.afterEndless.every(x => !x) && outside.afterCampaign.every(x => !x),
  JSON.stringify(outside));

const cosmetic = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  const before = window.__stats();
  for (const k of window.__ALL12) g.meta.unlock(k);
  window.__step(30);
  return { before, after: window.__stats(), all: window.__ALL12.map(k => !!g.meta.isUnlocked(k)) };
});
check('S06 all TWELVE are COSMETIC — no currency and no player stat moves',
  cosmetic.all.every(Boolean) && JSON.stringify(cosmetic.before) === JSON.stringify(cosmetic.after),
  JSON.stringify({ before: cosmetic.before, after: cosmetic.after }));

const ui = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__openCol('chaos');
  const locked = { sec: window.__sec('cxc-sigils'), n: window.__sec('cxc-sigils-n').text, cards: window.__cards() };
  for (const k of window.__ALL12) g.meta.unlock(k);
  window.__openCol('chaos');
  const open = { sec: window.__sec('cxc-sigils'), n: window.__sec('cxc-sigils-n').text, cards: window.__cards() };
  return { locked, open };
});
check('S07 the CHAOS tab lists TWELVE sigils',
  ui.locked.sec.rows === 12 && ui.locked.n === '0 / 12' && ui.open.n === '12 / 12',
  `${ui.locked.sec.rows} rows, ${ui.locked.n} -> ${ui.open.n}`);
check('S08 the four new ones are named on the tab',
  ['ARCHIVIST', 'RELIQUARY', 'PLATINUM STANDARD', 'CHRONICLER'].every(n => ui.open.sec.text.includes(n)),
  ui.open.n);
check('S09 the character cards carry all twelve marks, and none before any are earned',
  ui.locked.cards.withSigils === 0 && ui.open.cards.withSigils === ui.open.cards.cards &&
  (ui.open.cards.marks || '').length >= 12,
  JSON.stringify({ locked: ui.locked.cards.withSigils, open: ui.open.cards.marks }));

// ════════════════════════════════════════════════════════════════════════════
// E. EMPEROR'S SINGULARITY EDGE
// ════════════════════════════════════════════════════════════════════════════
const emp = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  const offCd = g.player.abilityCdMult;
  window.__equip('emperor_singularity_edge');
  window.__run('endless', 'skeleton_warrior');
  const onCd = g.player.abilityCdMult;
  g.enemies.length = 0;
  const mob = window.__spawn(5, 200, 0, 1e7, 20);
  const d0 = mob.map(e => Math.hypot(e.pos.x - g.player.pos.x, e.pos.y - g.player.pos.y));
  const hp0 = mob.map(e => e.hp);
  // Open it, then MOVE it onto the mob. The hole picks a random direction 150 px from the player,
  // so a fixed mob at +200 px was often outside its 260 px reach and the check read "0 pulled"
  // while the pull maths were fine. Placement is not what this check is about.
  //
  // It sits 30 px SHORT of the nearest enemy, not on top of one. At +40 it landed exactly on the
  // third of five (spawned at +200 and spaced 20 px), whose distance-to-hole was then 0 — and the
  // shipped guard skips d2 <= 1 to avoid dividing by it. That read "4 of 5" against a working
  // pull. From -30 the five sit 30..110 px out: all inside R = 260, none degenerate.
  g._updateEmperorSingularity(1 / 60);
  if (g._emperorHole) { g._emperorHole.x = mob[0].pos.x - 30; g._emperorHole.y = mob[0].pos.y; g._emperorHole.cd = 0; }
  for (let i = 0; i < 89; i++) g._updateEmperorSingularity(1 / 60);
  const hole = g._emperorHole ? { x: g._emperorHole.x, y: g._emperorHole.y, t: g._emperorHole.t } : null;
  const moved = mob.filter((e, i) => Math.abs(Math.hypot(e.pos.x - g.player.pos.x, e.pos.y - g.player.pos.y) - d0[i]) > 1).length;
  const hurt = mob.filter((e, i) => e.hp < hp0[i]).length;
  return { offCd, onCd, hole, moved, hurt, made: mob.length };
});
check('E01 the flat ability-cooldown bonus is GONE — this replaces it',
  emp.onCd === emp.offCd, `abilityCdMult ${emp.offCd} -> ${emp.onCd}`);
check('E02 a hole opens and PULLS enemies — real position change, through the shipped falloff',
  emp.hole !== null && emp.moved === emp.made, `${emp.moved} of ${emp.made} pulled`);
check('E03 it grinds what it holds, through the shipped takeHit',
  emp.hurt > 0, `${emp.hurt} of ${emp.made} damaged`);

// ── CAPS ──
const empCaps = await page.evaluate(() => {
  const g = window.__g;
  window.__equip('emperor_singularity_edge');
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0;
  // ONE at a time: run long enough for several life-cycles and never see two.
  let maxAlive = 0, openings = 0, wasOpen = false;
  for (let i = 0; i < 60 * 30; i++) {           // 30 s
    g._updateEmperorSingularity(1 / 60);
    const open = !!g._emperorHole;
    if (open && !wasOpen) openings++;
    wasOpen = open;
    maxAlive = Math.max(maxAlive, open ? 1 : 0);
  }
  // Victim ceiling: a dense mob, one tick.
  g._emperorHole = null; g._emperorCd = 0;
  g.enemies.length = 0;
  const mob = window.__spawn(40, 120, 0, 1e7, 4);
  g._updateEmperorSingularity(1 / 60);          // opens
  // Same placement pin as E02, and for the same reason: the hole opens at a RANDOM angle 150 px
  // from the player, so roughly half the time it landed BEHIND them and the whole mob at +120..+276
  // sat outside R = 260 — one run in two read "0 of 40" against a working cap. Parked 30 px short
  // of the nearest enemy the forty sit 30..186 px out, all in range, so the 14 is the ceiling
  // biting rather than the geometry.
  // Null-safe on purpose: on a build where no hole ever opens this must FAIL, not throw and take
  // every check after it down with it.
  if (g._emperorHole) {
    g._emperorHole.x = mob[0].pos.x - 30; g._emperorHole.y = mob[0].pos.y;
    g._emperorHole.cd = 0;
  }
  const before = mob.map(e => e.hp);
  g._updateEmperorSingularity(1 / 60);          // one bite
  const hitN = mob.filter((e, i) => e.hp < before[i]).length;
  return { maxAlive, openings, hitN };
});
check('E04 CAP — only ONE hole is ever alive, and it re-opens on its cooldown',
  empCaps.maxAlive === 1 && empCaps.openings >= 3 && empCaps.openings <= 5,
  `${empCaps.openings} openings in 30 s (2 s life + 6 s cooldown from CLOSE => ~3-4), max alive ${empCaps.maxAlive}`);
check('E05 CAP — at most 14 enemies are touched in a single tick',
  empCaps.hitN > 0 && empCaps.hitN <= 14, `${empCaps.hitN} of 40 hit in one tick`);

const empOff = await page.evaluate(() => {
  const g = window.__g;
  window.__equip('emperor_singularity_edge');
  window.__run('endless', 'skeleton_warrior');
  for (let i = 0; i < 30; i++) g._updateEmperorSingularity(1 / 60);
  const during = !!g._emperorHole;
  g.meta.relics = { emperor_singularity_edge: true, null_battery: true };
  g.meta.equippedRelic = 'null_battery';
  g._updateEmperorSingularity(1 / 60);
  return { during, afterUnequip: !!g._emperorHole };
});
check('E06 unequipping closes the hole', empOff.during === true && empOff.afterUnequip === false,
  JSON.stringify(empOff));

// ════════════════════════════════════════════════════════════════════════════
// T. TYRANT'S ANTI-MATTER BATTERY
// ════════════════════════════════════════════════════════════════════════════
const tyr = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  const offDr = g.player.contactDamageReduction;
  window.__equip('tyrant_antimatter_battery');
  window.__run('endless', 'skeleton_warrior');
  const onDr = g.player.contactDamageReduction;
  g._petBombs.length = 0; g.enemies.length = 0;
  g.player.hp = g.player.maxHp;                       // healthy: nothing fires
  g._updateTyrantBarrage(1 / 60);
  const healthy = g._petBombs.length;
  g.player.hp = Math.floor(g.player.maxHp * 0.25);    // cross below 30%
  g._updateTyrantBarrage(1 / 60);
  const fired = g._petBombs.length;
  const withDmg = g._petBombs.filter(b => b.dmg > 0).length;
  return { offDr, onDr, healthy, fired, withDmg, barrages: g._tyrantBarrages };
});
check('T01 the flat +8% contact DR is GONE — this replaces it',
  tyr.onDr === tyr.offDr, `contactDamageReduction ${tyr.offDr} -> ${tyr.onDr}`);
check('T02 nothing fires at healthy HP, and crossing below 30% fires SIX missiles',
  tyr.healthy === 0 && tyr.fired === 6 && tyr.withDmg === 6 && tyr.barrages === 1,
  JSON.stringify(tyr));

const tyrDmg = await page.evaluate(() => {
  const g = window.__g;
  window.__equip('tyrant_antimatter_battery');
  window.__run('endless', 'skeleton_warrior');
  g._petBombs.length = 0; g.enemies.length = 0;
  const mob = window.__spawn(4, 150, 0, 1e7, 30);
  const hp0 = mob.map(e => e.hp);
  g.player.hp = Math.floor(g.player.maxHp * 0.2);
  g._updateTyrantBarrage(1 / 60);
  for (let i = 0; i < 120; i++) window.__step(1, true);   // let them fly and detonate
  const hurt = mob.filter((e, i) => e.hp < hp0[i]).length;
  const stunned = mob.filter(e => (e.stunned || 0) > 0 || e.hp < e.maxHp).length;
  return { hurt, stunned, made: mob.length, left: g._petBombs.length };
});
check('T03 the missiles detonate and do real damage through the shipped bomb pipeline',
  tyrDmg.hurt > 0, `${tyrDmg.hurt} of ${tyrDmg.made} damaged, ${tyrDmg.left} bombs left`);

const tyrCaps = await page.evaluate(() => {
  const g = window.__g;
  window.__equip('tyrant_antimatter_battery');
  window.__run('endless', 'skeleton_warrior');
  g._petBombs.length = 0; g.enemies.length = 0;
  // CROSSING only: staying low must not re-fire.
  g.player.hp = Math.floor(g.player.maxHp * 0.2);
  g._updateTyrantBarrage(1 / 60);
  const first = g._petBombs.length;
  for (let i = 0; i < 60 * 5; i++) g._updateTyrantBarrage(1 / 60);   // 5 s still low
  const stayingLow = g._petBombs.length;
  // COOLDOWN: heal up and cross again immediately — refused.
  g.player.hp = g.player.maxHp; g._updateTyrantBarrage(1 / 60);
  g.player.hp = Math.floor(g.player.maxHp * 0.2); g._updateTyrantBarrage(1 / 60);
  const tooSoon = g._tyrantBarrages;
  // RUN CAP: force the cooldown open and cross many times.
  for (let k = 0; k < 12; k++) {
    g._tyrantCd = 0;
    g.player.hp = g.player.maxHp; g._updateTyrantBarrage(1 / 60);
    g.player.hp = Math.floor(g.player.maxHp * 0.2); g._updateTyrantBarrage(1 / 60);
  }
  const capped = g._tyrantBarrages;
  window.__run('endless', 'skeleton_warrior');
  return { first, stayingLow, tooSoon, capped, afterRestart: g._tyrantBarrages };
});
check('T04 CAP — it fires on the CROSSING only; staying low does not re-fire',
  tyrCaps.first === 6 && tyrCaps.stayingLow === 6, `${tyrCaps.stayingLow} bombs after 5 s low`);
check('T05 CAP — the 25 s cooldown refuses an immediate second barrage',
  tyrCaps.tooSoon === 1, `${tyrCaps.tooSoon} barrages`);
check('T06 CAP — never more than 4 barrages in a run, and a fresh run resets the tally',
  tyrCaps.capped === 4 && tyrCaps.afterRestart === 0,
  `${tyrCaps.capped} barrages from 12 forced crossings, ${tyrCaps.afterRestart} after restart`);

const tyrOff = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  g._petBombs.length = 0;
  g.player.hp = Math.floor(g.player.maxHp * 0.2);
  for (let i = 0; i < 60; i++) g._updateTyrantBarrage(1 / 60);
  return { bombs: g._petBombs.length, barrages: g._tyrantBarrages };
});
check('T07 CONTROL — without the relic, low HP fires nothing',
  tyrOff.bombs === 0 && tyrOff.barrages === 0, JSON.stringify(tyrOff));

const freezeBomb = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  g._petBombs.length = 0; g.enemies.length = 0;
  const e = window.__spawn(1, 100, 0, 1e7)[0];
  // A bomb with NO dmg field — exactly what the freeze pet has always dropped.
  g._petBombs.push({ x: e.pos.x, y: e.pos.y, targetX: e.pos.x, targetY: e.pos.y,
                     timer: 0.05, radius: 130, freezeDur: 1.2, color: '#8ff', detonated: false });
  const hp0 = e.hp;
  // Drive ONLY the bomb tick. __step runs the whole game, and the player's own auto-fire was
  // damaging this enemy — which made the control read "the freeze bomb did damage" when it had
  // not touched it at all.
  for (let i = 0; i < 20; i++) g._tickPetProjectiles(1 / 60);
  return { stunned: (e.stunned || 0) > 0, hpUnchanged: e.hp === hp0 };
});
check('T08 CONTROL — a bomb with no dmg field still only freezes, exactly as it always did',
  freezeBomb.stunned === true && freezeBomb.hpUnchanged === true, JSON.stringify(freezeBomb));

const otherTwo = await page.evaluate(() => {
  const g = window.__g;
  window.__equip('overlord_prism_array');
  window.__run('endless', 'skeleton_warrior'); window.__step(10);
  const drones = (g._prismDrones || []).length;
  window.__equip('leviathan_nanite_core');
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0; g._naniteClouds.length = 0; g._naniteSeedCd = 0;
  const v = window.__spawn(1, 200, 0, 10)[0];
  try { v.takeHit(1e6, g); } catch (_) {}
  return { drones, clouds: g._naniteClouds.length };
});
check('T09 CONTROL — the two already-upgraded relics still work',
  otherTwo.drones === 2 && otherTwo.clouds === 1, JSON.stringify(otherTwo));

// ── A real frame with both new effects live ──
await page.evaluate(() => {
  const g = window.__g;
  try { g._hideCharSelectOverlay?.(); } catch (_) {}
  if (g._achievementsOverlayEl) g._achievementsOverlayEl.style.display = 'none';
  window.__equip('emperor_singularity_edge');
  window.__run('endless', 'skeleton_warrior');
  window.__spawn(8, 120, 0, 1e6, 30);
  for (let i = 0; i < 40; i++) g._updateEmperorSingularity(1 / 60);
  window.__step(5);
  try { g.draw(window.__ctx()); } catch (e) { window.__drawErr = String(e); }
});
const drawErr = await page.evaluate(() => window.__drawErr ?? null);
check('D01 a real frame draws with the singularity open, without throwing', drawErr === null, String(drawErr));
await shot('01_singularity.png');

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
check('D02 the game is still rendering — no black screen',
  lum.ok && !(lum.mean < 6 && lum.max < 24) && lum.colors > 4, JSON.stringify(lum));
check('D03 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D04 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, arch, reliq, plat, chron, outside, cosmetic, ui,
  emp, empCaps, empOff, tyr, tyrDmg, tyrCaps, tyrOff, freezeBomb, otherTwo, lum,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
