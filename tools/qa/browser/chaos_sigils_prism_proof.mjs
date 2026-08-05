// ════════════════════════════════════════════════════════════════════════════════
// CHAOS SIGILS (cosmetic) and OVERLORD'S PRISM ARRAY (the relic's card text, delivered).
//
//  1. Four sigils, each earned for HOW a Chaos run was played rather than how long. Cosmetic:
//     the keys are read by the CHAOS tab and the character card and by nothing else. The
//     S-block proves that by unlocking all four against a frozen economy and player stat sheet.
//  2. overlord_prism_array stops paying a flat +2 pulse damage and instead does what it has
//     always said: two orbiting drones firing Plasma-White beams through the shipped _petBolts
//     pipeline. The P-block measures real bolts, real damage and real cleanup.
//
// Run: node tools/qa/browser/chaos_sigils_prism_proof.mjs [port]
// Writes: /tmp/chaos_sigils_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_sigils_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8911;
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

const SG = ['sg_titanbreaker', 'sg_unbroken', 'sg_apex', 'sg_pactbound'];
await page.evaluate(async (SG) => {
  const g = window.__g;
  g.meta._save = () => {};
  const src = await fetch('./js/game/Game.js?v=' + window.__BUILD).then(r => r.text()).catch(() => '');
  const ev = (src.match(/Enemy\.js\?v=(\d+)/) || [])[1] || '';
  try { window.__Enemy = (await import(`./js/entities/Enemy.js?v=${ev}`)).Enemy; } catch (_) { window.__Enemy = null; }
  window.__SG = SG;
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
  window.__wipe = () => { for (const k of SG) delete g.meta.unlocks[k]; };
  window.__has = () => SG.map(k => !!g.meta.isUnlocked(k));
  window.__run = (mode, charId, law) => {
    g.selectedCharacter = charId || 'skeleton_warrior';
    g.gameState = 'playing'; g.reset();
    if (mode === 'endless') { try { g._enterEndless(); } catch (_) {} }
    if (mode === 'chaos')   { g.runChaosLaw = law === undefined ? 'blood_grid' : law; try { g._beginChaosRun(); } catch (_) {} }
    window.__step(20);
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
  window.__takeCorrupted = () => {
    g.player.hp = Math.floor(g.player.maxHp * 0.5);
    for (let t = 0; t < 400; t++) {
      const hand = g._buildMutationChoices();
      if (!hand[2]?.corrupted) continue;
      g.mutationUI = { choices: hand }; g.selectMutation(2); return hand[2].key;
    }
    return null;
  };
  window.__end = (secs) => {
    g.meta.endlessRecords = { time: 999999, score: 999999999, level: 9999 };
    g.timeAlive = (g._chaosStartedAt >= 0 ? g._chaosStartedAt : 0) + secs;
    g.gameOver = true; g.victory = false; g.rewardsGranted = false;
    try { g._grantRewards(); } catch (e) { window.__err = String(e); }
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
    maxHp: g.player?.maxHp ?? 0, speed: g.player?.speed ?? 0, pulse: g.player?.pulseDamage ?? 0,
    fireRate: g.player?.fireRate ?? 0, relics: Object.keys(g.meta.relics || {}).length,
  });
}, SG);
check('A03 the Enemy class is available to the rig', await page.evaluate(() => !!window.__Enemy));

// ════════════════════════════════════════════════════════════════════════════
// S. THE FOUR SIGILS
// ════════════════════════════════════════════════════════════════════════════
const s1 = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  for (const t of ['Giga-Core Overlord', 'Malware Leviathan', 'Quantum Void Emperor', 'Apocalypse Mech Tyrant']) window.__killTitan(t);
  window.__end(8 * 60);
  return { has: window.__has(), types: g._chaosTitanTypes.length };
});
check('S01 TITANBREAKER — all four Mega Titans in one run',
  s1.has[0] === true && s1.types === 4 && s1.has.slice(1).every(x => !x), JSON.stringify(s1));

const s1neg = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  for (let i = 0; i < 4; i++) window.__killTitan('Giga-Core Overlord');   // the SAME one, four times
  window.__end(8 * 60);
  return { has: window.__has(), types: g._chaosTitanTypes.length, kills: g._chaosTitansKilled };
});
check('S01b killing the SAME Titan four times does not earn it — distinct types only',
  s1neg.has[0] === false && s1neg.types === 1 && s1neg.kills === 4, JSON.stringify(s1neg));

const s2 = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  window.__end(11 * 60);                                  // 11:00, zero pulses taken
  return { has: window.__has(), pulses: g._chaosPulseHits };
});
check('S02 UNBROKEN — 10:00 in Chaos with no CHAOS PULSE taken',
  s2.has[1] === true && s2.pulses === 0, JSON.stringify(s2));

const s2neg = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  g._chaosPulseHits = 1;                                   // one pulse taken, the standard is broken
  window.__end(11 * 60);
  return { has: window.__has(), pulses: g._chaosPulseHits };
});
check('S02b a single CHAOS PULSE denies it', s2neg.has[1] === false, JSON.stringify(s2neg));

const s3 = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  g._chaosRushCleared = 1;                                 // set by the real Boss Rush completion
  window.__end(9 * 60);
  return window.__has();
});
check('S03 APEX PROTOCOL — clearing a Boss Rush in Chaos', s3[2] === true, JSON.stringify(s3));

const s4 = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'japan_phasewalker', 'blood_grid');
  const took = [window.__takeCorrupted(), window.__takeCorrupted(), window.__takeCorrupted()];
  window.__end(6 * 60);
  return { has: window.__has(), took, taken: { ...g.mutations.taken } };
});
check('S04 PACTBOUND — three corrupted pacts sealed in one run, through the real picker',
  s4.has[3] === true && s4.took.every(Boolean), JSON.stringify(s4.took));

const s4neg = await page.evaluate(() => {
  window.__wipe();
  window.__run('chaos', 'japan_phasewalker', 'blood_grid');
  window.__takeCorrupted(); window.__takeCorrupted();      // only two
  window.__end(6 * 60);
  return window.__has();
});
check('S04b two pacts are not enough', s4neg[3] === false, JSON.stringify(s4neg));

const outside = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('endless', 'skeleton_warrior');
  g._chaosRushCleared = 1; g._chaosTitanTypes = ['a', 'b', 'c', 'd'];
  window.__end(11 * 60);
  const afterEndless = window.__has();
  window.__run('campaign', 'skeleton_warrior'); window.__end(11 * 60);
  return { afterEndless, afterCampaign: window.__has() };
});
check('S05 CONTROL — no sigil can be earned outside Chaos',
  outside.afterEndless.every(x => !x) && outside.afterCampaign.every(x => !x),
  JSON.stringify(outside));

// ── Cosmetic: unlocking all four must move nothing ──
const cosmetic = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__run('chaos', 'skeleton_warrior', 'blood_grid');
  const before = window.__stats();
  for (const k of window.__SG) g.meta.unlock(k);
  window.__step(30);
  const after = window.__stats();
  return { before, after, has: window.__has() };
});
check('S06 the sigils are COSMETIC — no currency, no relic, and no player stat moves',
  cosmetic.has.every(Boolean) &&
  JSON.stringify(cosmetic.before) === JSON.stringify(cosmetic.after),
  JSON.stringify({ before: cosmetic.before, after: cosmetic.after }));

const ui = await page.evaluate(() => {
  const g = window.__g;
  window.__wipe();
  window.__openCol('chaos');
  const locked = { sec: window.__sec('cxc-sigils'), n: window.__sec('cxc-sigils-n').text, cards: window.__cards() };
  for (const k of window.__SG) g.meta.unlock(k);
  window.__openCol('chaos');
  const open = { sec: window.__sec('cxc-sigils'), n: window.__sec('cxc-sigils-n').text, cards: window.__cards() };
  return { locked, open };
});
// Total-agnostic, for the same reason as S08: this file owns wave 1, not the size of the set.
// It asserts the four it wiped are present and locked, and that NONE of them is counted.
check('S07 the CHAOS tab lists the four, locked, with their requirements',
  ui.locked.sec.rows >= 4 && /^0 \/ \d+$/.test(ui.locked.n) &&
  /Destroy all four Mega Titans/.test(ui.locked.sec.text) &&
  (ui.locked.sec.text.match(/\?\?\?/g) || []).length >= 4,
  `${ui.locked.sec.rows} rows, ${ui.locked.n}`);
// Total-agnostic on purpose: sigils are added in waves, and hardcoding "4 / 4" made this check
// fail the moment wave 2 landed even though nothing about wave 1 had changed. The claim is that
// the four THIS file is about are named and counted, not that four is the whole set.
check('S08 earning them names them on the tab',
  /^4 \/ \d+$/.test(ui.open.n) && /TITANBREAKER/.test(ui.open.sec.text) &&
  /UNBROKEN/.test(ui.open.sec.text) && /APEX PROTOCOL/.test(ui.open.sec.text) &&
  /PACTBOUND/.test(ui.open.sec.text), ui.open.n);
check('S09 the character cards show the marks — and show NOTHING before any are earned',
  ui.locked.cards.withSigils === 0 && ui.open.cards.withSigils === ui.open.cards.cards &&
  ui.open.cards.cards === 10 && (ui.open.cards.marks || '').length >= 4,
  JSON.stringify({ locked: ui.locked.cards, open: ui.open.cards }));

// ════════════════════════════════════════════════════════════════════════════
// P. OVERLORD'S PRISM ARRAY
// ════════════════════════════════════════════════════════════════════════════
const prism = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  const offPulse = g.player.pulseDamage;
  const offDrones = (g._prismDrones || []).length;

  g.meta.relics = { overlord_prism_array: true };
  g.meta.equippedRelic = 'overlord_prism_array';
  window.__run('endless', 'skeleton_warrior');
  const onPulse = g.player.pulseDamage;
  window.__step(10);
  const drones = (g._prismDrones || []).map(d => ({ x: d.x, y: d.y }));
  return { offPulse, offDrones, onPulse, drones, count: drones.length,
           equipped: g._relicOn('overlord_prism_array') };
});
check('P01 the relic is equipped and spawns exactly two orbiting drones',
  prism.equipped === true && prism.count === 2 && prism.offDrones === 0,
  `${prism.count} drones, ${prism.offDrones} without the relic`);
check('P02 the flat +2 pulse damage is GONE — this replaces it, it does not stack',
  prism.onPulse === prism.offPulse, `pulse ${prism.offPulse} -> ${prism.onPulse}`);

const fire = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = { overlord_prism_array: true };
  g.meta.equippedRelic = 'overlord_prism_array';
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0; g._petBolts.length = 0;
  const mk = (dx) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 1e7; e.hp = 1e7; e.pos.x = g.player.pos.x + dx; e.pos.y = g.player.pos.y;
    g.enemies.push(e); return e;
  };
  const near = mk(220);
  let bolts = 0;
  for (let i = 0; i < 200; i++) { g._updatePrismDrones(1 / 60); bolts = Math.max(bolts, g._petBolts.length); }
  const white = g._petBolts.filter(b => b.color === '#eaffff');
  const hpBefore = near.hp;
  for (let i = 0; i < 200; i++) { window.__step(1); }        // real update: bolts travel and hit
  return { bolts, white: white.length, dmg: white[0]?.dmg ?? 0,
           hurt: near.hp < hpBefore, hpBefore, hpAfter: near.hp };
});
check('P03 the drones fire real bolts into the shipped _petBolts pipeline',
  fire.bolts > 0 && fire.white > 0 && fire.dmg === 26,
  `${fire.bolts} bolts, ${fire.white} plasma-white, ${fire.dmg} dmg each`);
check('P04 those bolts do real damage to a real enemy',
  fire.hurt === true, `${fire.hpBefore} -> ${fire.hpAfter}`);

const range = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = { overlord_prism_array: true };
  g.meta.equippedRelic = 'overlord_prism_array';
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0; g._petBolts.length = 0;
  let e = null;
  try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) {}
  e.maxHp = 1e7; e.hp = 1e7; e.pos.x = g.player.pos.x + 3000; e.pos.y = g.player.pos.y;  // far away
  g.enemies.push(e);
  for (let i = 0; i < 200; i++) g._updatePrismDrones(1 / 60);
  return { bolts: g._petBolts.length };
});
check('P05 an enemy outside the 460 px range is not shot at', range.bolts === 0, `${range.bolts} bolts`);

const cleanup = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = { overlord_prism_array: true };
  g.meta.equippedRelic = 'overlord_prism_array';
  window.__run('endless', 'skeleton_warrior');
  window.__step(20);
  const during = (g._prismDrones || []).length;
  // Unequip by equipping something ELSE, not by nulling equippedRelic: getEquippedRelic()
  // auto-equips the first OWNED relic when the slot is empty, so nulling it here simply
  // re-selected the same relic and the drones correctly stayed up. Shipped behaviour, and the
  // first version of this check mistook it for a leak.
  g.meta.relics = { overlord_prism_array: true, null_battery: true };
  g.meta.equippedRelic = 'null_battery';
  window.__step(20);
  const afterUnequip = (g._prismDrones || []).length;
  g.meta.equippedRelic = 'overlord_prism_array';
  window.__run('endless', 'skeleton_warrior');    // a fresh run rebuilds them
  window.__step(20);
  const afterRestart = (g._prismDrones || []).length;
  return { during, afterUnequip, afterRestart };
});
check('P06 unequipping clears the drones, and a fresh run rebuilds them',
  cleanup.during === 2 && cleanup.afterUnequip === 0 && cleanup.afterRestart === 2,
  JSON.stringify(cleanup));

const noRelic = await page.evaluate(() => {
  const g = window.__g;
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  g.enemies.length = 0; g._petBolts.length = 0;
  let e = null;
  try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) {}
  e.maxHp = 1e7; e.hp = 1e7; e.pos.x = g.player.pos.x + 200; e.pos.y = g.player.pos.y;
  g.enemies.push(e);
  for (let i = 0; i < 200; i++) window.__step(1);
  return { drones: (g._prismDrones || []).length, white: g._petBolts.filter(b => b.color === '#eaffff').length };
});
check('P07 CONTROL — without the relic there are no drones and no plasma-white bolts',
  noRelic.drones === 0 && noRelic.white === 0, JSON.stringify(noRelic));

// Measured as a DELTA against no relic. These fields are fed by meta upgrades too
// (contactDamageReduction alone accumulates from firewall, armorPlating and the skill tree), so
// the absolute values depend on the save — the first version of this check compared against a
// clean sheet and read 0.23 where it expected 0.08. The relic's own contribution is the claim.
const others = await page.evaluate(() => {
  const g = window.__g;
  // leviathan_nanite_core was REMOVED from this list on 2026-08-05: its flat +10% xpMult was
  // deliberately replaced by the nanite DoT, so asserting the stat line still exists would be
  // asserting the old behaviour against a change that was requested. Its own proof
  // (chaos_sigils2_nanite_proof) now owns it.
  const FIELDS = { emperor_singularity_edge: 'abilityCdMult',
                   tyrant_antimatter_battery: 'contactDamageReduction' };
  g.meta.relics = {}; g.meta.equippedRelic = null;
  window.__run('endless', 'skeleton_warrior');
  const base = {}; for (const f of Object.values(FIELDS)) base[f] = g.player[f] || 0;
  const out = {};
  for (const [id, field] of Object.entries(FIELDS)) {
    g.meta.relics = { [id]: true }; g.meta.equippedRelic = id;
    window.__run('endless', 'skeleton_warrior');
    out[id] = +((g.player[field] || 0) - base[field]).toFixed(4);
  }
  return { base, out };
});
check('P08 CONTROL — the two still-unimplemented Titan relics keep their shipped stat lines',
  Math.abs(others.out.emperor_singularity_edge - 0.10) < 1e-3 &&   // abilityCdMult 1 -> 1.10
  Math.abs(others.out.tyrant_antimatter_battery - 0.08) < 1e-3,    // +8% contact DR
  JSON.stringify(others));

// ── Draw a real frame with the drones up ──
await page.evaluate(() => {
  const g = window.__g;
  // Close the Collection and the char-select left open by the S-block, or they photograph
  // themselves instead of the drones — which is exactly what the first capture did.
  try { g._hideCharSelectOverlay?.(); } catch (_) {}
  if (g._achievementsOverlayEl) g._achievementsOverlayEl.style.display = 'none';
  g.meta.relics = { overlord_prism_array: true }; g.meta.equippedRelic = 'overlord_prism_array';
  window.__run('endless', 'skeleton_warrior');
  // Enemies in range so the drones are actually firing in the frame.
  for (let i = 0; i < 6; i++) {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { break; }
    e.maxHp = 1e6; e.hp = 1e6;
    e.pos.x = g.player.pos.x + 150 + i * 40; e.pos.y = g.player.pos.y + (i % 2 ? 60 : -60);
    g.enemies.push(e);
  }
  window.__step(40);
  try { g.draw(window.__ctx()); } catch (e) { window.__drawErr = String(e); }
});
const drawErr = await page.evaluate(() => window.__drawErr ?? null);
check('P09 a real frame draws with the drones on screen, without throwing', drawErr === null, String(drawErr));
await shot('01_prism_drones.png');

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
  build: BUILD, s1, s1neg, s2, s2neg, s3, s4, s4neg, outside, cosmetic, ui,
  prism, fire, range, cleanup, noRelic, others, lum,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
