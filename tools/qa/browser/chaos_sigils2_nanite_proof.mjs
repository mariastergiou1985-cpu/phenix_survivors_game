// ════════════════════════════════════════════════════════════════════════════════
// CHAOS SIGILS wave 2 (cosmetic) and LEVIATHAN'S NANITE CORE (the card text, delivered).
//
//  1. Four more sigils, taking the set to eight. Three of the four need NO new run state at all:
//     they read runChaosLaw, player.kills and meta.chaosRanks. The fourth reads the shipped
//     phoenixReviveCount. Cosmetic — the S-block proves nothing moves when all eight unlock.
//  2. leviathan_nanite_core stops paying a flat +10% XP and instead does what it has always
//     said: a dead enemy releases a Toxic-Cyan cloud that damages through the shipped
//     Enemy.takeHit and clogs through the shipped slowTimer, and SPREADS via its own kills.
//     The N-block measures real damage, the real status field, the real spread and all three
//     ceilings that stop the chain reaction running away.
//
// Run: node tools/qa/browser/chaos_sigils2_nanite_proof.mjs [port]
// Writes: /tmp/chaos_sigils2_proof/  (report.json + screenshot)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_sigils2_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8913;
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

const ALL8 = ['sg_titanbreaker', 'sg_unbroken', 'sg_apex', 'sg_pactbound',
              'sg_lawless', 'sg_centurion', 'sg_full_roster', 'sg_iron_will'];
const NEW4 = ALL8.slice(4);
// Wipes the WHOLE set for the same reason wave 1's does: wave 3's keys are earned by state this
// file sets up (all four Titan relics owned earns RELIQUARY), and a leftover unlock skews the
// tab counter. The assertions below still own wave 2's eight.
const SG_ALL = ['sg_titanbreaker', 'sg_unbroken', 'sg_apex', 'sg_pactbound',
  'sg_lawless', 'sg_centurion', 'sg_full_roster', 'sg_iron_will',
  'sg_archivist', 'sg_reliquary', 'sg_platinum', 'sg_chronicler'];
await page.evaluate(async ([ALL8, NEW4, SG_ALL]) => {
  const g = window.__g;
  g.meta._save = () => {};
  const src = await fetch('./js/game/Game.js?v=' + window.__BUILD).then(r => r.text()).catch(() => '');
  const ev = (src.match(/Enemy\.js\?v=(\d+)/) || [])[1] || '';
  try { window.__Enemy = (await import(`./js/entities/Enemy.js?v=${ev}`)).Enemy; } catch (_) { window.__Enemy = null; }
  window.__ALL8 = ALL8; window.__NEW4 = NEW4;
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
  window.__wipe = () => { for (const k of SG_ALL) delete g.meta.unlocks[k]; };
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
  // Place enemies without killing them, so the nanite tick is the only damage source.
  window.__spawn = (n, dx, dy, hp) => {
    const made = [];
    for (let i = 0; i < n; i++) {
      let e = null;
      try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { break; }
      e.maxHp = hp ?? 1e7; e.hp = e.maxHp; e.slowTimer = 0;
      e.pos.x = g.player.pos.x + dx + i * 6; e.pos.y = g.player.pos.y + dy;
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
    pulse: g.player?.pulseDamage ?? 0, relics: Object.keys(g.meta.relics || {}).length,
  });
}, [ALL8, NEW4, SG_ALL]);
check('A03 the Enemy class is available to the rig', await page.evaluate(() => !!window.__Enemy));

// ════════════════════════════════════════════════════════════════════════════
// S. THE FOUR NEW SIGILS
// ════════════════════════════════════════════════════════════════════════════
const lawless = await page.evaluate(() => {
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', null);   // NO LAW
  window.__end(13 * 60);
  const yes = window.__new();
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');   // a law IS active
  window.__end(13 * 60);
  return { yes, withLaw: window.__new() };
});
check('S01 LAWLESS — 12:00 in Chaos with no law, and NOT with one',
  lawless.yes[0] === true && lawless.withLaw[0] === false,
  JSON.stringify({ noLaw: lawless.yes[0], withLaw: lawless.withLaw[0] }));

const centurion = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  g.player.kills = 1000;
  window.__end(5 * 60);
  const at1000 = window.__new();
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  g.player.kills = 999;
  window.__end(5 * 60);
  return { at1000, at999: window.__new() };
});
check('S02 CENTURION — 1,000 kills in one run, and 999 is not enough',
  centurion.at1000[1] === true && centurion.at999[1] === false,
  JSON.stringify({ at1000: centurion.at1000[1], at999: centurion.at999[1] }));

const roster = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe(); g.meta.chaosRanks = {};
  const ids = g.characters.map(c => c.id);
  const seen = [];
  for (const id of ids) {
    window.__run('chaos', id, 'blood_grid');
    window.__end(4 * 60);
    seen.push({ id, ranked: Object.keys(g.meta.chaosRanks).length, got: !!g.meta.isUnlocked('sg_full_roster') });
  }
  return { total: ids.length, ninth: seen[ids.length - 2], tenth: seen[ids.length - 1] };
});
check('S03 FULL ROSTER — earned only once ALL ten characters have a logged rank',
  roster.ninth.got === false && roster.tenth.got === true && roster.tenth.ranked === roster.total,
  JSON.stringify({ afterNine: roster.ninth, afterTen: roster.tenth }));

const iron = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  g.phoenixReviveCount = 0;
  window.__end(16 * 60);
  const clean = window.__new();
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  g.phoenixReviveCount = 1;                       // one revive spent
  window.__end(16 * 60);
  return { clean, revived: window.__new() };
});
check('S04 IRON WILL — 15:00 with no revive spent, and denied by a single revive',
  iron.clean[3] === true && iron.revived[3] === false,
  JSON.stringify({ clean: iron.clean[3], revived: iron.revived[3] }));

const outside = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe(); g.meta.chaosRanks = {};
  window.__run('endless', 'skeleton_warrior');
  g.player.kills = 5000; g.phoenixReviveCount = 0; g.runChaosLaw = null;
  window.__end(16 * 60);
  const afterEndless = window.__new();
  window.__run('campaign', 'skeleton_warrior');
  g.player.kills = 5000;
  window.__end(16 * 60);
  return { afterEndless, afterCampaign: window.__new() };
});
check('S05 CONTROL — none of the four can be earned outside Chaos',
  outside.afterEndless.every(x => !x) && outside.afterCampaign.every(x => !x),
  JSON.stringify(outside));

const cosmetic = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  const before = window.__stats();
  for (const k of window.__ALL8) g.meta.unlock(k);
  window.__step(30);
  return { before, after: window.__stats(), all: window.__ALL8.map(k => !!g.meta.isUnlocked(k)) };
});
check('S06 all eight are COSMETIC — no currency, no relic, no player stat moves',
  cosmetic.all.every(Boolean) && JSON.stringify(cosmetic.before) === JSON.stringify(cosmetic.after),
  JSON.stringify({ before: cosmetic.before, after: cosmetic.after }));

const ui = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__openCol('chaos');
  const locked = { sec: window.__sec('cxc-sigils'), n: window.__sec('cxc-sigils-n').text, cards: window.__cards() };
  for (const k of window.__ALL8) g.meta.unlock(k);
  window.__openCol('chaos');
  const open = { sec: window.__sec('cxc-sigils'), n: window.__sec('cxc-sigils-n').text, cards: window.__cards() };
  return { locked, open };
});
// Total-agnostic, exactly as wave 1's equivalent was made when wave 2 landed: this file owns the
// EIGHT of waves 1-2, not the size of the set. Wave 3 took the set to twelve, and "rows === 8"
// would have failed against a tab that is working perfectly.
check('S07 the CHAOS tab lists the eight, locked, with their requirements',
  ui.locked.sec.rows >= 8 && /^0 \/ \d+$/.test(ui.locked.n) &&
  /Survive 12:00 in Chaos with NO LAW/.test(ui.locked.sec.text) &&
  /1,000 enemies/.test(ui.locked.sec.text) &&
  /all ten characters/.test(ui.locked.sec.text) &&
  /without spending a single Phoenix revive/.test(ui.locked.sec.text),
  `${ui.locked.sec.rows} rows, ${ui.locked.n}`);
check('S08 earning them names all eight on the tab',
  /^8 \/ \d+$/.test(ui.open.n) && ['TITANBREAKER', 'UNBROKEN', 'APEX PROTOCOL', 'PACTBOUND',
    'LAWLESS', 'CENTURION', 'FULL ROSTER', 'IRON WILL'].every(n => ui.open.sec.text.includes(n)),
  ui.open.n);
check('S09 the character cards carry all eight marks, and none before any are earned',
  ui.locked.cards.withSigils === 0 && ui.open.cards.withSigils === ui.open.cards.cards &&
  (ui.open.cards.marks || '').length >= 8,
  JSON.stringify({ locked: ui.locked.cards.withSigils, open: ui.open.cards.marks }));

// ════════════════════════════════════════════════════════════════════════════
// N. LEVIATHAN'S NANITE CORE
// ════════════════════════════════════════════════════════════════════════════
const statLine = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  const off = g.player.xpMult;
  g.meta.relics = { leviathan_nanite_core: true }; g.meta.equippedRelic = 'leviathan_nanite_core';
  window.__run('endless', 'skeleton_warrior');
  return { off, on: g.player.xpMult, clouds: (g._naniteClouds || []).length };
});
check('N01 the flat +10% XP is GONE — this replaces it, it does not stack',
  statLine.on === statLine.off, `xpMult ${statLine.off} -> ${statLine.on}`);

const seed = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = { leviathan_nanite_core: true }; g.meta.equippedRelic = 'leviathan_nanite_core';
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0; g._naniteClouds.length = 0; g._naniteSeedCd = 0;
  const victim = window.__spawn(1, 200, 0, 10)[0];
  try { victim.takeHit(1e6, g); } catch (_) {}            // a REAL death, through takeHit
  return { clouds: g._naniteClouds.length, at: g._naniteClouds[0] ? { x: g._naniteClouds[0].x, y: g._naniteClouds[0].y } : null,
           vx: victim.pos.x, vy: victim.pos.y };
});
check('N02 a real enemy death seeds a cloud where it fell',
  seed.clouds === 1 && Math.abs(seed.at.x - seed.vx) < 1 && Math.abs(seed.at.y - seed.vy) < 1,
  JSON.stringify(seed));

const dot = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = { leviathan_nanite_core: true }; g.meta.equippedRelic = 'leviathan_nanite_core';
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0; g._naniteClouds.length = 0; g._naniteSeedCd = 0;
  const inside = window.__spawn(1, 240, 0)[0];
  const outside = window.__spawn(1, 900, 0)[0];
  g._naniteClouds.push({ x: inside.pos.x, y: inside.pos.y, t: 3.0, cd: 0 });
  const hp0 = inside.hp, slow0 = inside.slowTimer;
  for (let i = 0; i < 60; i++) g._updateNaniteClouds(1 / 60);   // one second of ticks
  return { hurt: inside.hp < hp0, dealt: hp0 - inside.hp, slowed: inside.slowTimer > slow0,
           slowFactor: inside.slowFactor, farUntouched: outside.hp === outside.maxHp };
});
check('N03 the cloud damages what stands in it, through the shipped takeHit',
  dot.hurt === true && dot.dealt > 0, `${dot.dealt} damage in 1 s`);
check('N04 it also clogs through the SHIPPED slow status — no new enemy field',
  dot.slowed === true && dot.slowFactor === 0.55, `slowFactor ${dot.slowFactor}`);
check('N05 an enemy outside the cloud is untouched', dot.farUntouched === true);

const spread = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = { leviathan_nanite_core: true }; g.meta.equippedRelic = 'leviathan_nanite_core';
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0; g._naniteClouds.length = 0; g._naniteSeedCd = 0;
  // A tight knot of frail enemies: the first cloud kills one, which seeds the next, and so on.
  const knot = window.__spawn(6, 260, 0, 12);
  g._naniteClouds.push({ x: knot[0].pos.x, y: knot[0].pos.y, t: 3.0, cd: 0 });
  const c0 = g._naniteClouds.length;
  // Measure the PEAK, not the end state: a cloud lives 3 s, so after 200 frames the seeded ones
  // have expired again and the final count says nothing about whether they ever existed. The
  // first version of this check read the end state and reported "1 -> 1" while the spread was
  // working perfectly.
  let peak = c0;
  for (let i = 0; i < 200; i++) {
    g._naniteSeedCd = 0;
    g._updateNaniteClouds(1 / 60);
    peak = Math.max(peak, g._naniteClouds.length);
  }
  return { c0, peak, end: g._naniteClouds.length,
           alive: g.enemies.filter(e => e.hp > 0).length, made: knot.length };
});
check('N06 the clouds SPREAD — a cloud kill seeds another where that enemy fell',
  spread.peak > spread.c0 && spread.alive < spread.made,
  `${spread.c0} -> peak ${spread.peak} clouds (${spread.end} left after expiry), ` +
  `${spread.made - spread.alive} of ${spread.made} killed`);

const caps = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = { leviathan_nanite_core: true }; g.meta.equippedRelic = 'leviathan_nanite_core';
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0; g._naniteClouds.length = 0;
  // Count ceiling: 200 seeds with the cooldown forced open must not exceed 18.
  for (let i = 0; i < 200; i++) { g._naniteSeedCd = 0; g._seedNaniteCloud(i * 30, 0); }
  const count = g._naniteClouds.length;
  // Rate ceiling: without forcing the cooldown, back-to-back seeds are refused.
  g._naniteClouds.length = 0; g._naniteSeedCd = 0;
  for (let i = 0; i < 50; i++) g._seedNaniteCloud(i * 30, 0);
  const rate = g._naniteClouds.length;
  // Per-tick victim ceiling.
  g._naniteClouds.length = 0; g.enemies.length = 0;
  const mob = window.__spawn(30, 300, 0);
  g._naniteClouds.push({ x: mob[0].pos.x + 60, y: mob[0].pos.y, t: 3.0, cd: 0 });
  const before = mob.map(e => e.hp);
  g._updateNaniteClouds(1 / 60);
  const hitN = mob.filter((e, i) => e.hp < before[i]).length;
  return { count, rate, hitN };
});
check('N07 the count ceiling holds — 200 seeds never exceed 18 clouds',
  caps.count === 18, `${caps.count} clouds`);
check('N08 the rate ceiling holds — back-to-back seeds are refused',
  caps.rate === 1, `${caps.rate} cloud from 50 immediate seeds`);
check('N09 the per-tick victim ceiling holds — at most 8 enemies per tick',
  caps.hitN > 0 && caps.hitN <= 8, `${caps.hitN} enemies hit in one tick`);

const cleanup = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = { leviathan_nanite_core: true }; g.meta.equippedRelic = 'leviathan_nanite_core';
  window.__run('endless', 'skeleton_warrior');
  g._naniteClouds.length = 0; g._naniteSeedCd = 0;
  g._seedNaniteCloud(g.player.pos.x, g.player.pos.y);
  const during = g._naniteClouds.length;
  // Unequip by equipping something ELSE — getEquippedRelic auto-equips the first owned relic
  // when the slot is empty, so nulling it would simply re-select this one.
  g.meta.relics = { leviathan_nanite_core: true, null_battery: true };
  g.meta.equippedRelic = 'null_battery';
  g._updateNaniteClouds(1 / 60);
  const afterUnequip = g._naniteClouds.length;
  // Expiry: a cloud lives 3 s and then goes.
  g.meta.equippedRelic = 'leviathan_nanite_core';
  g._naniteSeedCd = 0; g._seedNaniteCloud(g.player.pos.x, g.player.pos.y);
  for (let i = 0; i < 240; i++) g._updateNaniteClouds(1 / 60);
  const afterExpiry = g._naniteClouds.length;
  window.__run('endless', 'skeleton_warrior');
  return { during, afterUnequip, afterExpiry, afterRestart: (g._naniteClouds || []).length };
});
check('N10 unequipping clears the clouds, they expire on their own, and a fresh run starts empty',
  cleanup.during === 1 && cleanup.afterUnequip === 0 && cleanup.afterExpiry === 0 &&
  cleanup.afterRestart === 0, JSON.stringify(cleanup));

const noRelic = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0; g._naniteClouds.length = 0; g._naniteSeedCd = 0;
  const victim = window.__spawn(1, 200, 0, 10)[0];
  try { victim.takeHit(1e6, g); } catch (_) {}
  return { clouds: g._naniteClouds.length };
});
check('N11 CONTROL — without the relic a death seeds nothing', noRelic.clouds === 0, JSON.stringify(noRelic));

const others = await page.evaluate(() => {
  const g = window.__g;
  const FIELDS = { emperor_singularity_edge: 'abilityCdMult', tyrant_antimatter_battery: 'contactDamageReduction' };
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  const base = {}; for (const f of Object.values(FIELDS)) base[f] = g.player[f] || 0;
  const out = {};
  for (const [id, field] of Object.entries(FIELDS)) {
    g.meta.relics = { [id]: true }; g.meta.equippedRelic = id;
    window.__run('endless', 'skeleton_warrior');
    out[id] = +((g.player[field] || 0) - base[field]).toFixed(4);
  }
  // And the one already upgraded stays upgraded.
  g.meta.relics = { overlord_prism_array: true }; g.meta.equippedRelic = 'overlord_prism_array';
  window.__run('endless', 'skeleton_warrior');
  window.__step(10);
  out.prismDrones = (g._prismDrones || []).length;
  return out;
});
// The expectation here FLIPPED on 2026-08-05, and it is worth saying why rather than quietly
// editing the numbers. This check used to assert emperor_singularity_edge still paid +0.10
// abilityCdMult and tyrant_antimatter_battery still paid +0.08 contact DR, because at the time
// both were unimplemented and those flat stats were all they did. Wave 3 implements both — the
// singularity and the low-HP barrage REPLACE those stat lines, exactly as the nanite DoT replaced
// the Leviathan's +10% xpMult one wave earlier. Asserting the old numbers would be asserting
// against a change that was asked for. Both deltas must now read 0.
check('N12 CONTROL — no Titan relic pays a flat stat any more, and the Overlord still works',
  Math.abs(others.emperor_singularity_edge) < 1e-3 &&
  Math.abs(others.tyrant_antimatter_battery) < 1e-3 &&
  others.prismDrones === 2, JSON.stringify(others));

// ── A real frame with clouds on screen ──
await page.evaluate(() => {
  const g = window.__g;
  try { g._hideCharSelectOverlay?.(); } catch (_) {}
  if (g._achievementsOverlayEl) g._achievementsOverlayEl.style.display = 'none';
  g.meta.relics = { leviathan_nanite_core: true }; g.meta.equippedRelic = 'leviathan_nanite_core';
  window.__run('endless', 'skeleton_warrior');
  g._naniteClouds.length = 0;
  for (let i = 0; i < 5; i++) {
    g._naniteClouds.push({ x: g.player.pos.x + 90 + i * 70, y: g.player.pos.y + (i % 2 ? 70 : -70), t: 3.0, cd: 0 });
  }
  window.__spawn(6, 150, 0);
  window.__step(20);
  try { g.draw(window.__ctx()); } catch (e) { window.__drawErr = String(e); }
});
const drawErr = await page.evaluate(() => window.__drawErr ?? null);
check('N13 a real frame draws with the clouds on screen, without throwing', drawErr === null, String(drawErr));
await shot('01_nanite_clouds.png');

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
check('D01 the game is still rendering — no black screen',
  lum.ok && !(lum.mean < 6 && lum.max < 24) && lum.colors > 4, JSON.stringify(lum));
check('D02 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D03 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, lawless, centurion, roster, iron, outside, cosmetic, ui,
  statLine, seed, dot, spread, caps, cleanup, noRelic, others, lum,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
