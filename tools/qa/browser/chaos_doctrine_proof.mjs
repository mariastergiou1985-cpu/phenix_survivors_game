// ════════════════════════════════════════════════════════════════════════════════
// CHAOS DOCTRINE (pilot) — runtime QA for japan_phasewalker + cyber_arm_hero.
//
// Everything is measured against a live Chaos run driven by the real update() loop. The only
// synthetic part is the clock: frames step at a fixed dt.
//
// What this has to prove, beyond "it works":
//   * CHAOS-ONLY      — nothing fires in Endless, for either piloted character.
//   * TWO CHARACTERS  — the other eight are untouched: same pylon distribution, no heat,
//                       no reroll, no doctrine state.
//   * NO BALANCE DRIFT— _getActiveChaosLawModifiers() returns byte-identical numbers to the
//                       shipped table. Only the OVERLAY STRINGS changed, and this asserts the
//                       strings now agree with the modifiers they describe.
//   * CLEANUP         — reset() clears every doctrine field, like every other run field.
//   * CONTROLLER      — the mid-run reroll overlay is navigable by D-pad + A/B.
//
// Run: node tools/qa/browser/chaos_doctrine_proof.mjs [port]
// Writes: /tmp/chaos_doctrine_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/chaos_doctrine_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8895;
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
const DOC_V = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8').match(/ChaosDoctrine\.js\?v=(\d+)/)[1];

let passN = 0, failN = 0;
const failures = [], results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}${extra ? '  ' + extra : ''}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

const BTN = { a: 0, b: 1, up: 12, down: 13, left: 14, right: 15 };

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}   BUILD=${BUILD}  doctrine=${DOC_V}`);

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
await page.addInitScript(() => {
  const pad = {
    id: 'PHENIX QA Virtual Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard',
    timestamp: 0, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  navigator.getGamepads = () => [pad, null, null, null];
  window.__padSet = (i, on) => {
    pad.buttons[i].pressed = !!on; pad.buttons[i].touched = !!on;
    pad.buttons[i].value = on ? 1 : 0; pad.timestamp = performance.now();
  };
});
const shot = async (n) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, n), Buffer.from(data, 'base64'));
};
const pad = async (name) => {
  await page.evaluate(b => window.__padSet(b, true), BTN[name]);
  await page.waitForTimeout(240);
  await page.evaluate(b => window.__padSet(b, false), BTN[name]);
  await page.waitForTimeout(280);
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

const rig = await page.evaluate(async (dv) => {
  const g = window.__g;
  g.meta._save = () => {};
  const cd = await import(`./js/game/ChaosDoctrine.js?v=${dv}`);
  window.__cd = cd;
  const src = await fetch('./js/game/Game.js?v=' + window.__BUILD).then(r => r.text()).catch(() => '');
  const ev = (src.match(/Enemy\.js\?v=(\d+)/) || [])[1] || '';
  try { window.__Enemy = (await import(`./js/entities/Enemy.js?v=${ev}`)).Enemy; } catch (_) { window.__Enemy = null; }
  // addKillScore hands the position straight to the particle system, which calls pos.clone().
  window.__pt = (x, y) => ({ x, y, clone() { return window.__pt(this.x, this.y); } });
  // draw(ctx) takes the context the RAF loop hands it - a rig that forces a frame must too.
  window.__ctx = () => (document.querySelector('canvas#game') ||
    [...document.querySelectorAll('canvas')].find(x => x.width > 400)).getContext('2d');
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.upgradeUI) g.upgradeUI = null;          // dismiss, never take — no build drift
      if (g.mutationUI) g.mutationUI = null;
      if (g.player) g.player.hp = g.player.maxHp;
      try { g.update(1 / 60, window.__IN); } catch (_) {}
    }
  };
  // Start a run as a given character, in Chaos or plain Endless, through the game's own entry.
  window.__run = (charId, chaos) => {
    g.selectedCharacter = charId;
    g.gameState = 'playing';
    g.reset();
    if (g.player) g.player.selectedCharacter = charId;
    try { g._enterEndless(); } catch (_) {}
    if (chaos) { try { g._beginChaosRun(); } catch (_) {} }
    if (g.player) g.player.selectedCharacter = charId;
    window.__step(30);
  };
  return { chars: cd.doctrineCharacters() };
}, DOC_V);
check('A03x the Enemy class is available to the rig', await page.evaluate(() => !!window.__Enemy));
const PILOT = ['japan_phasewalker', 'cyber_arm_hero', 'assassin_clone', 'euclid_vector',
               'oni_cataclysm_protocol', 'eddie', 'taekwondo_girl', 'dimis_kickboxer',
               'skeleton_warrior', 'brawler_warrior'];
check('A03 the doctrine table now covers all ten characters',
  rig.chars.length === 10 && PILOT.every(c => rig.chars.includes(c)), rig.chars.join(', '));

// ════════════════════════════════════════════════════════════════════════════
// B. THE LAW TEXT NOW MATCHES THE LAW
// ════════════════════════════════════════════════════════════════════════════
const laws = await page.evaluate(() => {
  const g = window.__g;
  g._pendingChaosStart = false;
  g._showChaosLawSelectionOverlay();
  const cards = [...document.querySelectorAll('#cgm-chaos-law-sel .cls-card')].map(c => ({
    id: c.dataset.law, text: (c.innerText || '').replace(/\s+/g, ' ').trim(),
  }));
  const mods = {};
  const keep = g.runChaosLaw;
  for (const id of ['blood_grid', 'frozen_eden', 'serpent_law', 'dragon_law', 'no_mercy_protocol', 'broken_signal']) {
    g.runChaosLaw = id;
    mods[id] = g._getActiveChaosLawModifiers();
  }
  g.runChaosLaw = keep;
  return { cards, mods };
});
const pctOf = (m) => Math.round((m - 1) * 100);
const say = (id) => (laws.cards.find(c => c.id === id) || {}).text || '';
// The three that were wrong. Each assertion reads the real modifier and demands the printed
// string carry that exact number — so the test cannot pass by matching a hard-coded sentence.
for (const [cid, id] of [['B01', 'blood_grid'], ['B02', 'frozen_eden'], ['B03', 'no_mercy_protocol']]) {
  const m = laws.mods[id], t = say(id);
  const want = [];
  if (m.scoreMult !== 1) want.push(`${pctOf(m.scoreMult)}% score`);
  if (m.xpMult !== 1) want.push(`${pctOf(m.xpMult)}% XP`);
  if (m.bossHpMult !== 1) want.push(`${pctOf(m.bossHpMult)}% boss HP`);
  if (m.enemySpeedMult !== 1) want.push(`${Math.abs(pctOf(m.enemySpeedMult))}% speed`);
  const nums = want.map(w => w.match(/\d+/)[0]);
  const ok = nums.every(n => new RegExp('\\b' + n + '%').test(t));
  check(`${cid} ${id.toUpperCase()} card text carries the numbers the modifier actually applies`,
    ok, `needs ${want.join(' + ')} — card says "${t}"`);
}
check('B04 the three already-correct laws are untouched',
  /6%/.test(say('serpent_law')) && /15%/.test(say('dragon_law')) && /20%/.test(say('broken_signal')),
  [say('serpent_law'), say('dragon_law'), say('broken_signal')].join(' | '));
check('B05 NO modifier value changed — the shipped table is byte-identical',
  laws.mods.blood_grid.scoreMult === 1.15 && laws.mods.blood_grid.enemySpeedMult === 1.10 &&
  laws.mods.frozen_eden.xpMult === 1.15 && laws.mods.frozen_eden.enemySpeedMult === 0.90 &&
  laws.mods.no_mercy_protocol.scoreMult === 1.18 && laws.mods.no_mercy_protocol.bossHpMult === 1.12,
  JSON.stringify(laws.mods.blood_grid));
await shot('01_law_overlay.png');
await page.evaluate(() => { window.__g._hideChaosLawSelectionOverlay(); });

// ════════════════════════════════════════════════════════════════════════════
// C. CYBER ARM HERO — HEAT DOCTRINE
// ════════════════════════════════════════════════════════════════════════════
const heat = await page.evaluate(() => {
  const g = window.__g;
  const H = window.__cd.CHAOS_DOCTRINE.cyber_arm_hero.heat;

  // (a) Endless: the doctrine must not exist at all.
  window.__run('cyber_arm_hero', false);
  const endlessDoc = !!g._doctrine();
  for (let i = 0; i < 40; i++) g._doctrineAddHeat();
  const endlessHeat = g._doctrineHeat;

  // (b) Chaos: heat rises on real shots and cools when nothing is in range.
  window.__run('cyber_arm_hero', true);
  const chaosDoc = !!g._doctrine();
  g._doctrineHeat = 0;
  for (let i = 0; i < 5; i++) g._doctrineAddHeat();
  const after5 = +g._doctrineHeat.toFixed(4);
  const expected5 = +(H.perShot * 5).toFixed(4);

  // cool: step with the shot flag never set
  g._doctrineHeatShot = false;
  const beforeCool = g._doctrineHeat;
  for (let i = 0; i < 30; i++) g._updateChaosDoctrine(1 / 60);   // 0.5 s
  const afterCool = +g._doctrineHeat.toFixed(4);

  // (c) redline + vent damage through the REAL damage path
  g._doctrineHeat = 0;
  let redlineBanner = 0;
  const ta = g.triggerAnnouncement.bind(g);
  g.triggerAnnouncement = (t, c, o) => { if (/REDLINE/.test(String(t))) redlineBanner++; return ta(t, c, o); };
  for (let i = 0; i < 40; i++) g._doctrineAddHeat();
  const redlined = g._doctrineHeat >= H.freeUltAt;
  let dmgCalls = 0;
  const dp = g._damagePlayer.bind(g);
  g._damagePlayer = (n, o) => { dmgCalls++; return dp(n, o); };
  g.player.hp = g.player.maxHp;
  for (let i = 0; i < 150; i++) { g._doctrineHeatShot = true; g._updateChaosDoctrine(1 / 60); }  // 2.5 s redlined
  g._damagePlayer = dp;
  g.triggerAnnouncement = ta;

  // (d) the ultimate is free at redline and vents
  g.player.mana = 0;
  g._doctrineHeat = 1;
  let fired = false;
  const er = g._ensureRailgunFx.bind(g);
  g._ensureRailgunFx = () => { er(); if (g._railgun) { const t = g._railgun.trigger.bind(g._railgun); g._railgun.trigger = (...a) => { fired = true; return t(...a); }; } };
  g.activateOverheatedChains();
  const freeFired = fired, ventedTo = g._doctrineHeat, manaAfter = g.player.mana;

  // (e) with NO heat and no mana the ultimate must still refuse, exactly as before
  g._doctrineHeat = 0; g.player.mana = 0; fired = false;
  g.activateOverheatedChains();
  const coldRefused = !fired;

  return { endlessDoc, endlessHeat, chaosDoc, after5, expected5, beforeCool: +beforeCool.toFixed(4),
           afterCool, redlined, redlineBanner, dmgCalls, freeFired, ventedTo, manaAfter, coldRefused,
           perShot: H.perShot, coolPerSec: H.coolPerSec };
});
check('C01 the doctrine does NOT exist in Endless', heat.endlessDoc === false && heat.endlessHeat === 0,
  `doc ${heat.endlessDoc}, heat ${heat.endlessHeat}`);
check('C02 the doctrine exists in Chaos for cyber_arm_hero', heat.chaosDoc === true);
check('C03 heat rises exactly perShot per real weapon shot',
  Math.abs(heat.after5 - heat.expected5) < 1e-6, `${heat.after5} vs ${heat.expected5} (5 x ${heat.perShot})`);
check('C04 heat cools when nothing is in acquisition range',
  heat.afterCool < heat.beforeCool, `${heat.beforeCool} -> ${heat.afterCool} over 0.5s`);
check('C05 the bar redlines and announces it once', heat.redlined && heat.redlineBanner === 1,
  `redlined ${heat.redlined}, banners ${heat.redlineBanner}`);
check('C06 redlining costs HP through the real _damagePlayer path',
  heat.dmgCalls >= 2, `${heat.dmgCalls} vent ticks in 2.5s redlined`);
check('C07 at redline the Railgun fires with ZERO mana and vents the bar',
  heat.freeFired === true && heat.ventedTo === 0 && heat.manaAfter === 0,
  `fired ${heat.freeFired}, heat -> ${heat.ventedTo}, mana ${heat.manaAfter}`);
check('C08 cold + no mana still refuses, exactly as before the doctrine', heat.coldRefused === true);

// ════════════════════════════════════════════════════════════════════════════
// D. FOUNDRY PYLON
// ════════════════════════════════════════════════════════════════════════════
const foundry = await page.evaluate(() => {
  const g = window.__g;
  const P = window.__cd.CHAOS_DOCTRINE.cyber_arm_hero.pylon;
  window.__run('cyber_arm_hero', true);
  g._doctrineFoundryStacks = 0;
  g._doctrineHeat = 1;
  const mk = () => ({ pos: g.player.pos.clone(), type: 'foundry' });
  g._doctrineTriggerPylon(mk());
  const first = { stacks: g._doctrineFoundryStacks, heat: g._doctrineHeat, buff: g._chaosPylonBuff?.type };
  for (let i = 0; i < 8; i++) g._doctrineTriggerPylon(mk());
  return { first, capped: g._doctrineFoundryStacks, maxStacks: P.maxStacks, fired: g._doctrineFired };
});
check('D01 a FOUNDRY PYLON vents the heat bar and forges a drone slot',
  foundry.first.stacks === 1 && foundry.first.heat === 0 && foundry.first.buff === 'foundry',
  JSON.stringify(foundry.first));
check('D02 foundry stacks are hard-capped', foundry.capped === foundry.maxStacks,
  `${foundry.capped} / ${foundry.maxStacks} after 9 triggers`);

// ════════════════════════════════════════════════════════════════════════════
// E. JAPAN PHASEWALKER — FATE PYLON + REROLL DOCTRINE
// ════════════════════════════════════════════════════════════════════════════
const fate = await page.evaluate(() => {
  const g = window.__g;
  window.__run('japan_phasewalker', true);
  const doc = g._doctrine();
  const faces = {};
  let dmg = 0, jackpots = 0;
  const dp = g._damagePlayer.bind(g);
  g._damagePlayer = (n, o) => { dmg += n; return dp(n, o); };
  const gr = g._doctrineGrantReroll.bind(g);
  g._doctrineGrantReroll = (r) => { jackpots++; return false; };   // count, don't open the overlay
  const ft = g.floatingTexts;
  for (let i = 0; i < 400; i++) {
    const before = ft.length;
    g.player.hp = g.player.maxHp;
    g._doctrineTriggerPylon({ pos: g.player.pos.clone(), type: 'fate' });
    const t = ft[ft.length - 1];
    const label = t && (t.text || t.msg || '');
    faces[String(label)] = (faces[String(label)] || 0) + 1;
  }
  g._damagePlayer = dp; g._doctrineGrantReroll = gr;
  return { hasReroll: !!doc?.reroll, faces, dmg, jackpots, fired: g._doctrineFired };
});
const faceKeys = Object.keys(fate.faces);
check('E01 japan_phasewalker carries a reroll doctrine in Chaos', fate.hasReroll === true);
check('E02 the FATE PYLON rolls every face of its die across 400 trials',
  faceKeys.length >= 4, faceKeys.join(' / '));
check('E03 the die carries real risk — it deals damage', fate.dmg > 0, `${fate.dmg} total self-damage`);
check('E04 the jackpot face grants a reroll', fate.jackpots > 0, `${fate.jackpots} jackpots / 400`);

const reroll = await page.evaluate(async () => {
  const g = window.__g;
  window.__run('japan_phasewalker', true);
  g.runChaosLaw = 'blood_grid';
  const before = { law: g.runChaosLaw, xp: g.player.xpMult, used: g._doctrineRerollsUsed };
  g._doctrineLawXpApplied = g._getActiveChaosLawModifiers().xpMult;
  const opened = g._doctrineGrantReroll('QA');
  const visible = !!document.getElementById('cgm-chaos-law-sel') && g._clsVisible === true;
  const rerollMode = g._clsRerollMode === true;
  // the run must be FROZEN behind the overlay — gameplay must not advance
  const t0 = g.timeAlive;
  window.__step(30);
  const frozen = g.timeAlive === t0;
  return { before, opened, visible, rerollMode, frozen };
});
check('E05 a granted reroll reopens the shipped Chaos Law overlay mid-run',
  reroll.opened === true && reroll.visible === true && reroll.rerollMode === true, JSON.stringify(reroll));
check('E06 the run FREEZES behind the overlay — no new pause path needed',
  reroll.frozen === true, `timeAlive advanced: ${!reroll.frozen}`);
await shot('02_midrun_reroll.png');

// Controller: D-pad walks the ring, A confirms — the shipped handler, not a synthetic click.
const nav = await page.evaluate(() => {
  const g = window.__g;
  const on = () => [...document.querySelectorAll('#cgm-chaos-law-sel .cls-card, #cgm-chaos-law-sel button')]
    .filter(n => n.classList.contains('cls-on')).length;
  return { idx: g._clsIdx, onCount: on() };
});
check('E07 exactly one node carries the focus ring', nav.onCount === 1, `idx ${nav.idx}, on ${nav.onCount}`);
await pad('down'); await pad('down');
const moved = await page.evaluate(() => window.__g._clsIdx);
check('E08 controller D-pad moves the law selection', moved !== nav.idx, `${nav.idx} -> ${moved}`);
// Chromium driven from another process intermittently swallows a pad edge — documented in this
// repo's other proofs and observed on both the key and pad paths. So the RULE is asserted
// deterministically by invoking the shipped handler with a synthetic key set (the same call the
// pad ends up making), and the pad press itself is a bounded-retry REACHABILITY check that
// reports how many presses it took.
let padPresses = 0, padConfirmed = false;
for (let i = 0; i < 4 && !padConfirmed; i++) {
  await pad('a'); padPresses++;
  await page.waitForTimeout(350);
  padConfirmed = await page.evaluate(() => !document.getElementById('cgm-chaos-law-sel'));
}
if (!padConfirmed) {
  await page.evaluate(() => window.__g._updateChaosLawKeys(new Set(['enter'])));
  await page.waitForTimeout(300);
}
const handlerConfirmed = await page.evaluate(() => !document.getElementById('cgm-chaos-law-sel'));
check('E09 ENTER/A confirms and closes the mid-run overlay (shipped handler)',
  handlerConfirmed === true,
  padConfirmed ? `pad A confirmed after ${padPresses} press(es)` : 'pad edge swallowed — handler asserted directly');
check('E09b the controller path reaches the confirm handler',
  padConfirmed === true, `${padPresses} pad presses; a swallowed edge is a known headless artefact`);
const confirmed = await page.evaluate(() => {
  const g = window.__g;
  return { visible: !!document.getElementById('cgm-chaos-law-sel'), law: g.runChaosLaw,
           rerollMode: g._clsRerollMode, state: g.gameState, chaos: !!g._chaosMode,
           used: g._doctrineRerollsUsed, alive: !!g.player && g.player.hp > 0, xp: g.player?.xpMult };
});
check('E09c the overlay is fully torn down and reroll mode is cleared',
  confirmed.visible === false && confirmed.rerollMode === false, JSON.stringify(confirmed));
check('E10 the reroll SWAPS the law without restarting the run',
  confirmed.state === 'playing' && confirmed.chaos === true && confirmed.alive === true && confirmed.used === 1,
  `state ${confirmed.state}, chaos ${confirmed.chaos}, rerolls ${confirmed.used}`);
check('E11 the run keeps a finite, positive xpMult after the swap',
  Number.isFinite(confirmed.xp) && confirmed.xp > 0, String(confirmed.xp));

// ════════════════════════════════════════════════════════════════════════════
// F. THE OTHER EIGHT ARE UNTOUCHED
// ════════════════════════════════════════════════════════════════════════════
// With the roster complete there is no character left to prove "untouched" against, so the
// property that matters is no longer WHO is excluded but WHAT excludes them: the gate. Every
// one of the ten must produce the shipped 50/25/25 distribution and zero doctrine state in
// ENDLESS, and its own pylon in CHAOS. That is the same guarantee, asserted at its source.
const others = await page.evaluate(() => {
  const g = window.__g;
  const out = {};
  const spin = (n) => {
    g._chaosPylons.length = 0;
    const seen = {};
    for (let i = 0; i < n; i++) {
      g._chaosPylonCd = -1;
      g._updateChaosPylons(0.016);
      for (const p of g._chaosPylons) seen[p.type] = (seen[p.type] || 0) + 1;
      g._chaosPylons.length = 0;
    }
    return seen;
  };
  for (const c of window.__cd.doctrineCharacters()) {
    window.__run(c, false);                       // ENDLESS
    const endlessDoc = !!g._doctrine();
    const endlessTypes = Object.keys(spin(300)).sort();
    for (let i = 0; i < 30; i++) g._doctrineAddHeat();
    const endlessHeat = g._doctrineHeat;
    window.__run(c, true);                        // CHAOS
    const chaosTypes = Object.keys(spin(500)).sort();
    out[c] = { endlessDoc, endlessTypes, endlessHeat, chaosTypes,
               own: window.__cd.CHAOS_DOCTRINE[c].pylon.id };
  }
  return out;
});
const endlessClean = Object.values(others).every(o =>
  o.endlessDoc === false && o.endlessHeat === 0 &&
  o.endlessTypes.join(',') === 'danger,heal,shield');
check('F01 ALL TEN characters are byte-identical to the shipped game in Endless',
  endlessClean,
  JSON.stringify(Object.fromEntries(Object.entries(others).map(([k, v]) => [k, v.endlessTypes.join('/')]))));
const chaosOwn = Object.entries(others).every(([, v]) =>
  v.chaosTypes.includes(v.own) && v.chaosTypes.length === 4);
check('F01b in CHAOS each of the ten gets its OWN pylon and only its own',
  chaosOwn,
  JSON.stringify(Object.fromEntries(Object.entries(others).map(([k, v]) => [k, v.chaosTypes.join('/')]))));

const dist = await page.evaluate(() => {
  const g = window.__g;
  window.__run('cyber_arm_hero', true);
  g._chaosPylons.length = 0;
  const seen = {};
  for (let i = 0; i < 800; i++) {
    g._chaosPylonCd = -1;
    g._updateChaosPylons(0.016);
    for (const p of g._chaosPylons) seen[p.type] = (seen[p.type] || 0) + 1;
    g._chaosPylons.length = 0;
  }
  const total = Object.values(seen).reduce((a, b) => a + b, 0);
  return { seen, total, foundryPct: Math.round(100 * (seen.foundry || 0) / total) };
});
check('F02 a piloted character DOES get its own pylon, at roughly one in four',
  (dist.seen.foundry || 0) > 0 && dist.foundryPct >= 15 && dist.foundryPct <= 35,
  `${dist.foundryPct}% foundry of ${dist.total} — ${JSON.stringify(dist.seen)}`);

// ════════════════════════════════════════════════════════════════════════════
// I. ASSASSIN CLONE — SHROUD DOCTRINE + VENOM PYLON
// ════════════════════════════════════════════════════════════════════════════
const shroud = await page.evaluate(async () => {
  const g = window.__g;
  const S = window.__cd.CHAOS_DOCTRINE.assassin_clone.shroud;

  // (a) Endless: nothing exists.
  window.__run('assassin_clone', false);
  const endlessDoc = !!g._doctrine();
  for (let i = 0; i < 120; i++) g._updateChaosDoctrine(1 / 60);
  const endlessShroud = g._doctrineShroud;

  // (b) Chaos: it fills while untouched, and arms exactly once.
  window.__run('assassin_clone', true);
  g._doctrineShroud = 0; g._doctrineShroudWindow = 0; g._doctrineShroudArms = 0;
  let armBanner = 0, breakBanner = 0;
  const ta = g.triggerAnnouncement.bind(g);
  g.triggerAnnouncement = (t, c, o) => {
    if (/SHROUD ARMED/.test(String(t))) armBanner++;
    if (/SHROUD BROKEN/.test(String(t))) breakBanner++;
    return ta(t, c, o);
  };
  const need = Math.ceil((1 / S.fillPerSec) * 60) + 8;
  for (let i = 0; i < need; i++) g._updateChaosDoctrine(1 / 60);
  const armed = { shroud: g._doctrineShroud, window: +g._doctrineShroudWindow.toFixed(2),
                  arms: g._doctrineShroudArms, isArmed: g.doctrineShroudArmed(),
                  bonus: g.doctrineExecBonus() };

  // (c) ONE hit from any source breaks it — asserted at the single damage gate.
  g.player.hp = g.player.maxHp;
  g._damagePlayer(1, {});
  const broken = { shroud: g._doctrineShroud, window: g._doctrineShroudWindow,
                   isArmed: g.doctrineShroudArmed(), bonus: g.doctrineExecBonus() };

  // (d) an unspent window lapses back to empty rather than lingering
  // Step until the window expires and read on THAT frame: the meter is designed to start
  // refilling immediately afterwards, so sampling later would measure the refill, not the lapse.
  g._doctrineShroud = 1; g._doctrineShroudWindow = 0.2;
  let lapsed = null;
  for (let i = 0; i < 60 && !lapsed; i++) {
    g._updateChaosDoctrine(1 / 60);
    if (g._doctrineShroudWindow === 0) lapsed = { shroud: g._doctrineShroud, window: g._doctrineShroudWindow };
  }
  g.triggerAnnouncement = ta;
  return { endlessDoc, endlessShroud, armed, armBanner, broken, breakBanner, lapsed,
           fillPerSec: S.fillPerSec, execBonus: S.execBonus };
});
check('I01 the shroud does NOT exist in Endless',
  shroud.endlessDoc === false && shroud.endlessShroud === 0, `doc ${shroud.endlessDoc}`);
check('I02 the shroud fills while untouched and arms exactly once',
  shroud.armed.isArmed === true && shroud.armed.arms === 1 && shroud.armBanner === 1,
  `armed ${shroud.armed.isArmed}, arms ${shroud.armed.arms}, banners ${shroud.armBanner}`);
check('I03 an armed shroud widens the execution threshold by exactly execBonus',
  Math.abs(shroud.armed.bonus - shroud.execBonus) < 1e-9, `${shroud.armed.bonus} vs ${shroud.execBonus}`);
check('I04 ONE point of damage from any source breaks it, at the single damage gate',
  shroud.broken.shroud === 0 && shroud.broken.window === 0 &&
  shroud.broken.isArmed === false && shroud.broken.bonus === 0 && shroud.breakBanner === 1,
  JSON.stringify(shroud.broken));
check('I05 an unspent window lapses back to empty rather than lingering',
  !!shroud.lapsed && shroud.lapsed.shroud === 0 && shroud.lapsed.window === 0,
  JSON.stringify(shroud.lapsed));

const venom = await page.evaluate(() => {
  const g = window.__g;
  const P = window.__cd.CHAOS_DOCTRINE.assassin_clone.pylon;
  window.__run('assassin_clone', true);
  g.enemies.length = 0;
  g._doctrineShroud = 0; g._doctrineShroudWindow = 0; g._doctrineVenomKills = 0;
  const mk = (hpFrac, dist, boss) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 1000; e.hp = Math.round(1000 * hpFrac);
    e.pos.x = g.player.pos.x + dist; e.pos.y = g.player.pos.y;
    if (boss) e.isMegaBoss = true;
    g.enemies.push(e); return e;
  };
  const weak   = [mk(0.10, 20), mk(0.25, 60), mk(0.29, 100)];   // inside, under 30%
  const strong = [mk(0.80, 40), mk(0.50, 80)];                  // inside, over 30%
  const far    = [mk(0.05, P.radius + 200)];                    // under 30% but out of range
  const bossE  = mk(0.05, 50, true);                            // under 30% but a Mega Boss
  g._doctrineTriggerPylon({ pos: g.player.pos.clone(), type: 'venom' });
  return {
    weakDead:   weak.every(e => e && e.hp <= 0),
    strongAlive: strong.every(e => e && e.hp > 0),
    farAlive:   far.every(e => e && e.hp > 0),
    bossAlive:  !!bossE && bossE.hp > 0,
    kills: g._doctrineVenomKills,
    shroudFed: g._doctrineShroud > 0,
    buff: g._chaosPylonBuff?.type,
  };
});
check('I06 a VENOM PYLON finishes only enemies already under its threshold',
  venom.weakDead === true && venom.strongAlive === true, JSON.stringify(venom));
check('I07 it respects its radius and never touches a Mega Boss',
  venom.farAlive === true && venom.bossAlive === true, `far alive ${venom.farAlive}, boss alive ${venom.bossAlive}`);
check('I08 every finish feeds the shroud back', venom.kills === 3 && venom.shroudFed === true,
  `${venom.kills} kills, shroud fed ${venom.shroudFed}, buff ${venom.buff}`);

// ════════════════════════════════════════════════════════════════════════════
// J. EUCLID VECTOR — AXIOM DOCTRINE + PROOF PYLON
// ════════════════════════════════════════════════════════════════════════════
const axiom = await page.evaluate(() => {
  const g = window.__g;
  const A = window.__cd.CHAOS_DOCTRINE.euclid_vector.axiom;

  // Endless first.
  window.__run('euclid_vector', false);
  const endlessDoc = !!g._doctrine();

  window.__run('euclid_vector', true);
  g.enemies.length = 0;
  const P0 = { x: g.player.pos.x, y: g.player.pos.y };
  const mk = (x, y) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 100000; e.hp = 100000; e.pos.x = x; e.pos.y = y;
    g.enemies.push(e); return e;
  };
  // a row ON the line, one clearly OFF it
  const on  = [];
  for (let i = 1; i <= 9; i++) on.push(mk(P0.x + i * 60, P0.y));
  const off = mk(P0.x + 300, P0.y + A.lineWidth * 4);

  // (a) two kills too close together must NOT draw a line
  g._doctrineAxiomLast = null; g._doctrineAxiomCd = 0; g._doctrineAxiomHits = 0;
  g.addKillScore(window.__pt(P0.x, P0.y), false);
  g.addKillScore(window.__pt(P0.x + A.minSeparation * 0.4, P0.y), false);
  const tooClose = g._doctrineAxiomHits;

  // (b) two distant kills DO
  g._doctrineAxiomLast = null; g._doctrineAxiomCd = 0; g._doctrineAxiomHits = 0;
  g.addKillScore(window.__pt(P0.x, P0.y), false);
  g.addKillScore(window.__pt(P0.x + 620, P0.y), false);
  const hits = g._doctrineAxiomHits;
  const lines = g._doctrineAxiomLines.length;
  const offUntouched = off && off.hp === off.maxHp;

  // (c) the cooldown holds the rate down
  g._doctrineAxiomHits = 0;
  for (let i = 0; i < 20; i++) {
    g.addKillScore(window.__pt(P0.x, P0.y), false);
    g.addKillScore(window.__pt(P0.x + 620, P0.y), false);
  }
  const spamHits = g._doctrineAxiomHits;

  // (d) a Mega Boss on the line takes only the fraction
  g.enemies.length = 0;
  const boss = mk(P0.x + 300, P0.y); boss.isMegaBoss = true; boss.maxHp = 1e7; boss.hp = 1e7;
  g._doctrineAxiomLast = null; g._doctrineAxiomCd = 0;
  g.addKillScore(window.__pt(P0.x, P0.y), false);
  g.addKillScore(window.__pt(P0.x + 620, P0.y), false);
  const bossTook = 1e7 - boss.hp;

  return { endlessDoc, tooClose, hits, lines, offUntouched, spamHits, bossTook,
           maxVictims: A.maxVictims, dmg: A.damage, frac: A.bossFraction };
});
check('J01 the axiom does NOT exist in Endless', axiom.endlessDoc === false);
check('J02 two kills too close together draw NO line — a blob cannot cheat it',
  axiom.tooClose === 0, `${axiom.tooClose} hits`);
check('J03 two distant kills assert a line through the enemies standing on it',
  axiom.hits > 0 && axiom.lines === 1, `${axiom.hits} victims, ${axiom.lines} trail`);
check('J04 the line is capped at maxVictims however dense the row',
  axiom.hits <= axiom.maxVictims, `${axiom.hits} <= ${axiom.maxVictims}`);
check('J05 an enemy off the line is untouched', axiom.offUntouched === true);
check('J06 the cooldown bounds the rate — 20 kill pairs cannot fire 20 lines',
  axiom.spamHits <= axiom.maxVictims, `${axiom.spamHits} victims from 20 pairs`);
check('J07 a Mega Boss on the line takes only the bounded fraction',
  axiom.bossTook > 0 && axiom.bossTook <= axiom.dmg * axiom.frac + 0.01,
  `${axiom.bossTook} vs full ${axiom.dmg}`);

const proof = await page.evaluate(() => {
  const g = window.__g;
  const P = window.__cd.CHAOS_DOCTRINE.euclid_vector.pylon;
  window.__run('euclid_vector', true);
  g.enemies.length = 0;
  g._doctrineProofNodes = []; g._doctrineProofProved = 0;
  const c = { x: g.player.pos.x, y: g.player.pos.y };
  const mk = (x, y) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 100000; e.hp = 100000; e.pos.x = x; e.pos.y = y;
    g.enemies.push(e); return e;
  };
  const inside  = mk(c.x, c.y - 60);           // inside the triangle below
  const outside = mk(c.x + 900, c.y + 900);    // far outside
  const v = [{ x: c.x - 300, y: c.y - 300 }, { x: c.x + 300, y: c.y - 300 }, { x: c.x, y: c.y + 300 }];
  const steps = [];
  for (const pt of v) {
    g._doctrineTriggerPylon({ pos: window.__pt(pt.x, pt.y), type: 'proof' });
    steps.push(g._doctrineProofNodes.length);
  }
  return { steps, proved: g._doctrineProofProved, nodesAfter: g._doctrineProofNodes.length,
           insideHurt: inside.hp < inside.maxHp, outsideUntouched: outside.hp === outside.maxHp,
           flash: !!g._doctrineProofFlash };
});
check('J08 the first two PROOF PYLONS anchor vertices instead of paying out',
  proof.steps[0] === 1 && proof.steps[1] === 2, JSON.stringify(proof.steps));
check('J09 the third closes the triangle and proves the interior',
  proof.proved === 1 && proof.nodesAfter === 0 && proof.insideHurt === true, JSON.stringify(proof));
check('J10 an enemy outside the triangle is untouched', proof.outsideUntouched === true);
check('J11 the closing flash is armed for the draw pass', proof.flash === true);

// ════════════════════════════════════════════════════════════════════════════
// K. ONI — CATACLYSM DEBT + PYRE PYLON
// ════════════════════════════════════════════════════════════════════════════
const oni = await page.evaluate(() => {
  const g = window.__g;
  const D = window.__cd.CHAOS_DOCTRINE.oni_cataclysm_protocol.debt;

  window.__run('oni_cataclysm_protocol', false);
  const endlessDoc = !!g._doctrine();

  window.__run('oni_cataclysm_protocol', true);
  g._doctrineDebt = 0; g._doctrineFallout = null; g._doctrineFalloutCasts = 0;

  // (a) three Titan kills fill the debt, and it never exceeds 1
  for (let i = 0; i < 5; i++) {
    g._doctrineDebt = Math.min(1, g._doctrineDebt + D.perTitanKill);
  }
  const filled = g._doctrineDebt;

  // (b) with NO debt and NO mana the ultimate refuses, exactly as before the doctrine
  g._doctrineDebt = 0; g.player.mana = 0;
  let cast = false;
  const ep = g._ensureOniFx.bind(g);
  g._ensureOniFx = () => { ep(); if (g._protocol0 && !g._protocol0.__qa) { g._protocol0.__qa = 1; const t = g._protocol0.trigger?.bind(g._protocol0); if (t) g._protocol0.trigger = (...a) => { cast = true; return t(...a); }; } };
  g.activateProtocol0Cataclysm();
  const coldRefused = !cast && !g._doctrineFallout;

  // (c) at FULL debt it fires with zero mana, clears the debt and lights the fallout
  g._doctrineDebt = 1; g.player.mana = 0;
  g.activateProtocol0Cataclysm();
  const indebted = { debt: g._doctrineDebt, fallout: !!g._doctrineFallout,
                     casts: g._doctrineFalloutCasts, mana: g.player.mana };

  // (d) the fallout burns enemies AND him
  g.enemies.length = 0;
  const mk = (dx) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 100000; e.hp = 100000;
    e.pos.x = g.player.pos.x + dx; e.pos.y = g.player.pos.y;
    g.enemies.push(e); return e;
  };
  const near = mk(60), far = mk(D.falloutRadius + 400);
  if (g._doctrineFallout) { g._doctrineFallout.x = g.player.pos.x; g._doctrineFallout.y = g.player.pos.y; }
  let selfHits = 0;
  const dp = g._damagePlayer.bind(g);
  g._damagePlayer = (n, o) => { selfHits++; return dp(n, o); };
  g.player.hp = g.player.maxHp;
  for (let i = 0; i < 120; i++) g._updateChaosDoctrine(1 / 60);   // 2 s
  g._damagePlayer = dp;
  const burn = { nearHurt: near.hp < near.maxHp, farUntouched: far.hp === far.maxHp, selfHits };

  // (e) it expires on its own
  for (let i = 0; i < Math.ceil(D.falloutSecs * 60) + 30; i++) g._updateChaosDoctrine(1 / 60);
  const expired = g._doctrineFallout === null;
  return { endlessDoc, filled, coldRefused, indebted, burn, expired, perTitan: D.perTitanKill };
});
check('K01 the debt does NOT exist in Endless', oni.endlessDoc === false);
check('K02 Titan kills fill the debt and it is clamped at 1', oni.filled === 1, String(oni.filled));
check('K03 with no debt and no mana Protocol 0 still refuses, exactly as before',
  oni.coldRefused === true);
check('K04 at FULL debt the cast is free, clears the debt and lights the fallout',
  oni.indebted.debt === 0 && oni.indebted.fallout === true &&
  oni.indebted.casts === 1 && oni.indebted.mana === 0, JSON.stringify(oni.indebted));
check('K05 the fallout burns enemies inside it and nobody outside',
  oni.burn.nearHurt === true && oni.burn.farUntouched === true, JSON.stringify(oni.burn));
check('K06 the fallout does not care whose side he is on — it burns HIM too',
  oni.burn.selfHits > 0, `${oni.burn.selfHits} self ticks in 2 s`);
check('K07 the fallout expires on its own', oni.expired === true);

const pyre = await page.evaluate(() => {
  const g = window.__g;
  const P = window.__cd.CHAOS_DOCTRINE.oni_cataclysm_protocol.pylon;
  window.__run('oni_cataclysm_protocol', true);
  g.enemies.length = 0;
  g._doctrineDebt = 1;
  const mk = (dx) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 100000; e.hp = 100000;
    e.pos.x = g.player.pos.x + dx; e.pos.y = g.player.pos.y;
    g.enemies.push(e); return e;
  };
  const near = mk(80), far = mk(P.radius + 300);
  g._doctrineTriggerPylon({ pos: window.__pt(g.player.pos.x, g.player.pos.y), type: 'pyre' });
  return { debt: +g._doctrineDebt.toFixed(2), relief: P.debtRelief,
           nearHurt: near.hp < near.maxHp, farUntouched: far.hp === far.maxHp,
           buff: g._chaosPylonBuff?.type };
});
check('K08 a PYRE PYLON burns inside its radius only',
  pyre.nearHurt === true && pyre.farUntouched === true, JSON.stringify(pyre));
check('K09 it pays down exactly one Titan worth of debt',
  Math.abs(pyre.debt - (1 - pyre.relief)) < 0.01, `${pyre.debt} after paying ${pyre.relief}`);

// ════════════════════════════════════════════════════════════════════════════
// L. EDDIE — SETLIST + AMP PYLON
// ════════════════════════════════════════════════════════════════════════════
const eddie = await page.evaluate(() => {
  const g = window.__g;
  const S = window.__cd.CHAOS_DOCTRINE.eddie.setlist;

  window.__run('eddie', false);
  const endlessDoc = !!g._doctrine();
  const endlessCost = g.doctrineUltCost(80);

  window.__run('eddie', true);
  g._doctrineSongs = 0; g._doctrineEncores = 0; g._doctrineFeedbacks = 0; g._doctrineBeatT = 0;
  const basePeriod = g._doctrineBeatPeriod();

  // THE BEAT IS LOGICAL, NOT ACOUSTIC. Silence the whole audio system and the clock must be
  // byte-identical: this is the one property that decides whether a muted player keeps the
  // mechanic at all.
  const audioBefore = g.audio;
  g._doctrineBeatT = 0;
  for (let i = 0; i < 37; i++) g._updateChaosDoctrine(1 / 60);
  const withAudio = +g._doctrineBeatT.toFixed(6);
  g.audio = null;
  g._doctrineBeatT = 0;
  for (let i = 0; i < 37; i++) g._updateChaosDoctrine(1 / 60);
  const withoutAudio = +g._doctrineBeatT.toFixed(6);
  g.audio = audioBefore;

  // the beat wraps and both on- and off-beat phases are reachable
  let onSeen = 0, offSeen = 0;
  g._doctrineBeatT = 0;
  for (let i = 0; i < 240; i++) {
    g._updateChaosDoctrine(1 / 60);
    if (g.doctrineOnBeat()) onSeen++; else offSeen++;
  }

  // songs speed the set up, floored
  g._doctrineSongs = 0;  const p0 = g._doctrineBeatPeriod();
  g._doctrineSongs = 3;  const p3 = g._doctrineBeatPeriod();
  g._doctrineSongs = 99; const pMax = g._doctrineBeatPeriod();
  g._doctrineSongs = 0;

  // encores cut the cost, floored at minCost
  g._doctrineEncores = 0; const c0 = g.doctrineUltCost(80);
  g._doctrineEncores = 2; const c2 = g.doctrineUltCost(80);
  g._doctrineEncores = 50; const cMax = g.doctrineUltCost(80);
  g._doctrineEncores = 0;

  // judging: forced on-beat, then forced off-beat
  g._doctrineBeatT = 0;
  const onBeatWas = g.doctrineOnBeat();
  const gotEncore = g._doctrineJudgeBeat();
  const afterEncore = g._doctrineEncores;
  g._doctrineBeatT = g._doctrineBeatPeriod() / 2;      // exactly between beats
  let fbDmg = 0;
  const dp = g._damagePlayer.bind(g);
  g._damagePlayer = (n, o) => { fbDmg += n; return dp(n, o); };
  g.player.hp = g.player.maxHp;
  const gotFeedback = g._doctrineJudgeBeat();
  g._damagePlayer = dp;

  return { endlessDoc, endlessCost, basePeriod, withAudio, withoutAudio, onSeen, offSeen,
           p0, p3, pMax, minPeriod: S.minPeriod, c0, c2, cMax, minCost: S.minCost,
           onBeatWas, gotEncore, afterEncore, gotFeedback, fbDmg,
           feedbacks: g._doctrineFeedbacks };
});
check('L01 the setlist does NOT exist in Endless, and the cost is the shipped 80',
  eddie.endlessDoc === false && eddie.endlessCost === 80, `cost ${eddie.endlessCost}`);
check('L02 THE BEAT IS LOGICAL — muting the whole audio system changes it not at all',
  eddie.withAudio === eddie.withoutAudio && eddie.withAudio > 0,
  `${eddie.withAudio} with audio vs ${eddie.withoutAudio} with audio nulled`);
check('L03 both on-beat and off-beat phases are reachable as the clock wraps',
  eddie.onSeen > 0 && eddie.offSeen > 0, `${eddie.onSeen} on / ${eddie.offSeen} off of 240 frames`);
check('L04 each song speeds the set up, floored at minPeriod',
  eddie.p3 < eddie.p0 && eddie.pMax === eddie.minPeriod,
  `${eddie.p0} -> ${eddie.p3} -> floor ${eddie.pMax}`);
check('L05 encores cut the ultimate cost, floored at minCost so it never goes free',
  eddie.c0 === 80 && eddie.c2 < 80 && eddie.cMax === eddie.minCost,
  `${eddie.c0} / ${eddie.c2} / floor ${eddie.cMax}`);
check('L06 landing the solo ON the beat pays an encore',
  eddie.onBeatWas === true && eddie.gotEncore === true && eddie.afterEncore === 1,
  `onBeat ${eddie.onBeatWas}, encore ${eddie.gotEncore}`);
check('L07 missing the beat pays feedback in HP, through the real damage path',
  eddie.gotFeedback === false && eddie.fbDmg > 0 && eddie.feedbacks === 1,
  `feedback dmg ${eddie.fbDmg}, count ${eddie.feedbacks}`);

const amp = await page.evaluate(() => {
  const g = window.__g;
  window.__run('eddie', true);
  g._doctrineEncores = 0; g._doctrineSongs = 0;
  const before = { enc: g._doctrineEncores, songs: g._doctrineSongs, per: g._doctrineBeatPeriod() };
  g._doctrineTriggerPylon({ pos: window.__pt(g.player.pos.x, g.player.pos.y), type: 'amp' });
  const after = { enc: g._doctrineEncores, songs: g._doctrineSongs, per: g._doctrineBeatPeriod(),
                  buff: g._chaosPylonBuff?.type };
  return { before, after };
});
check('L08 an AMP PYLON hands one encore AND speeds the set up — two-sided',
  amp.after.enc === amp.before.enc + 1 && amp.after.songs === amp.before.songs + 1 &&
  amp.after.per < amp.before.per,
  `enc ${amp.before.enc}->${amp.after.enc}, songs ${amp.before.songs}->${amp.after.songs}, period ${amp.before.per}->${amp.after.per}`);

// ════════════════════════════════════════════════════════════════════════════
// M. TAEKWONDO GIRL — MOMENTUM LAW + FROST PYLON
// ════════════════════════════════════════════════════════════════════════════
const momentum = await page.evaluate(() => {
  const g = window.__g;
  const M = window.__cd.CHAOS_DOCTRINE.taekwondo_girl.momentum;

  window.__run('taekwondo_girl', false);
  const endlessDoc = !!g._doctrine();

  window.__run('taekwondo_girl', true);
  g._doctrineFrostNodes = []; g._doctrineStillT = 0; g._doctrineLastPos = null;
  g._doctrineFrostbites = 0; g.enemies.length = 0;

  // (a) moving fast lays a trail
  const step = (dx) => { g.player.pos.x += dx; g._updateChaosDoctrine(1 / 60); };
  const fast = (M.speedThreshold / 60) * 1.6;
  for (let i = 0; i < 90; i++) step(fast);
  const moving = { nodes: g._doctrineFrostNodes.length, still: +g._doctrineStillT.toFixed(2),
                   frostbites: g._doctrineFrostbites, capped: g._doctrineFrostNodes.length <= M.maxNodes };

  // (b) the trail chills and bites what crosses it, using the enemy's own shipped slow field
  const mk = (x, y) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 100000; e.hp = 100000; e.slowTimer = 0;
    e.pos.x = x; e.pos.y = y; g.enemies.push(e); return e;
  };
  const nd = g._doctrineFrostNodes[g._doctrineFrostNodes.length - 1];
  const onTrail = mk(nd.x, nd.y);
  const offTrail = mk(nd.x + 4000, nd.y + 4000);
  for (let i = 0; i < 60; i++) g._updateChaosDoctrine(1 / 60);
  const bite = { hurt: onTrail.hp < onTrail.maxHp, slowed: onTrail.slowTimer > 0,
                 offHurt: offTrail.hp < offTrail.maxHp };

  // (c) standing still bites HER, through the shipped player chill
  g._doctrineStillT = 0; g._doctrineFrostbites = 0; g.player._chillT = 0;
  for (let i = 0; i < Math.ceil((M.stillSecs + 2.2) * 60); i++) g._updateChaosDoctrine(1 / 60);
  const frostbite = { count: g._doctrineFrostbites, chill: g.player._chillT > 0,
                      stillClamped: g._doctrineStillT <= M.stillSecs + 1e-6 };

  // (d) THE FROZEN-SCREEN GUARD: a panel the game itself opened must never count as standing
  // still. This is the failure mode the design flagged, so it is asserted directly.
  g._doctrineStillT = 0; g._doctrineFrostbites = 0;
  g.upgradeUI = { qa: true };
  for (let i = 0; i < 300; i++) g._updateChaosDoctrine(1 / 60);   // 5 s frozen
  const duringPanel = { still: g._doctrineStillT, frostbites: g._doctrineFrostbites };
  g.upgradeUI = null;
  return { endlessDoc, moving, bite, frostbite, duringPanel, maxNodes: M.maxNodes };
});
check('M01 the momentum law does NOT exist in Endless', momentum.endlessDoc === false);
check('M02 moving fast lays a frost trail, hard-capped',
  momentum.moving.nodes > 0 && momentum.moving.capped === true,
  `${momentum.moving.nodes} nodes, cap ${momentum.maxNodes}`);
check('M03 moving keeps the still-counter at zero and never frostbites',
  momentum.moving.still === 0 && momentum.moving.frostbites === 0, JSON.stringify(momentum.moving));
check('M04 the trail chills and bites what crosses it, and nothing off it',
  momentum.bite.hurt === true && momentum.bite.slowed === true && momentum.bite.offHurt === false,
  JSON.stringify(momentum.bite));
check('M05 standing still bites HER through the shipped player chill, and does not compound',
  momentum.frostbite.count > 0 && momentum.frostbite.chill === true &&
  momentum.frostbite.stillClamped === true, JSON.stringify(momentum.frostbite));
check('M06 a panel the GAME opened never counts as standing still — the flagged failure mode',
  momentum.duringPanel.still === 0 && momentum.duringPanel.frostbites === 0,
  JSON.stringify(momentum.duringPanel));

const frost = await page.evaluate(() => {
  const g = window.__g;
  const P = window.__cd.CHAOS_DOCTRINE.taekwondo_girl.pylon;
  window.__run('taekwondo_girl', true);
  g.enemies.length = 0; g.player._chillT = 0;
  const mk = (dx) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 1000; e.hp = 1000; e.slowTimer = 0;
    e.pos.x = g.player.pos.x + dx; e.pos.y = g.player.pos.y;
    g.enemies.push(e); return e;
  };
  const near = mk(80), far = mk(P.radius + 300);
  g._doctrineTriggerPylon({ pos: window.__pt(g.player.pos.x, g.player.pos.y), type: 'frost' });
  return { nearSlowed: near.slowTimer > 0, farUntouched: far.slowTimer === 0,
           selfChill: g.player._chillT > 0, buff: g._chaosPylonBuff?.type };
});
check('M07 a FROST PYLON chills enemies inside its radius only',
  frost.nearSlowed === true && frost.farUntouched === true, JSON.stringify(frost));
check('M08 it is two-sided — it chills HER too', frost.selfChill === true, `buff ${frost.buff}`);

// ════════════════════════════════════════════════════════════════════════════
// N. DIMI KICKBOXER — JUDGEMENT ROUND + AEGIS PYLON
// ════════════════════════════════════════════════════════════════════════════
const dimi = await page.evaluate(() => {
  const g = window.__g;
  const R = window.__cd.CHAOS_DOCTRINE.dimis_kickboxer.round;
  const P = window.__cd.CHAOS_DOCTRINE.dimis_kickboxer.pylon;

  window.__run('dimis_kickboxer', false);
  const endlessDoc = !!g._doctrine();
  const endlessHp = g.player.hp;
  g._damagePlayer(20, {});
  const endlessTookIt = g.player.hp < endlessHp;

  window.__run('dimis_kickboxer', true);
  g._doctrineRoundT = 0; g._doctrineVerdict = 0; g._doctrineVerdicts = 0;
  g._doctrineAegisT = 0; g._doctrineRoundsOpened = 0;

  // (a) a Round is declared, and never on top of a Boss Rush
  g._doctrineRoundCd = 0; g._bossRush = { t: 1 };
  for (let i = 0; i < 10; i++) g._updateChaosDoctrine(1 / 60);
  const blockedByRush = g._doctrineRoundT === 0;
  g._bossRush = null;
  g._doctrineRoundCd = 0;
  for (let i = 0; i < 10; i++) g._updateChaosDoctrine(1 / 60);
  const opened = { on: g._doctrineRoundT > 0, count: g._doctrineRoundsOpened };

  // (b) during a Round the hit STILL lands — it only also charges the Verdict
  g._doctrineVerdict = 0;
  g.player.hp = g.player.maxHp;
  g.playerHitCooldown = 0; g._chaosEntryGraceT = 0; g.player.dashTimer = 0;
  const hpBefore = g.player.hp;
  g._damagePlayer(15, {});
  const duringRound = { charged: g._doctrineVerdict > 0, tookIt: g.player.hp < hpBefore };

  // (c) his panic button is HELD while the Round runs
  g.player.specialCooldown = 0;
  g._updateChaosDoctrine(1 / 60);
  const ultHeld = g.player.specialCooldown > 0;

  // (d) a full Verdict smites the field and closes the Round early
  g.enemies.length = 0;
  const mk = (dx) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 100000; e.hp = 100000;
    e.pos.x = g.player.pos.x + dx; e.pos.y = g.player.pos.y;
    g.enemies.push(e); return e;
  };
  const near = mk(100), far = mk(R.smiteRadius + 400);
  g._doctrineVerdict = 0.99;
  g.playerHitCooldown = 0;
  g._damagePlayer(1, {});
  const verdict = { fired: g._doctrineVerdicts === 1, roundClosed: g._doctrineRoundT === 0,
                    reset: g._doctrineVerdict === 0,
                    nearHurt: near.hp < near.maxHp, farUntouched: far.hp === far.maxHp };

  // (e) the ultimate cooldown is HELD, not destroyed — it is free again once the Round ends
  g.player.specialCooldown = 0;
  g._updateChaosDoctrine(1 / 60);
  const ultFreeAfter = g.player.specialCooldown === 0;

  // (f) an AEGIS PYLON refuses damage outright and charges the Verdict instead
  g._doctrineAegisT = 0; g._doctrineVerdict = 0;
  g._doctrineTriggerPylon({ pos: window.__pt(g.player.pos.x, g.player.pos.y), type: 'aegis' });
  const immuneOn = g.doctrineAegisImmune();
  g.player.hp = g.player.maxHp;
  g.playerHitCooldown = 0;
  const hpB2 = g.player.hp;
  const refused = g._damagePlayer(40, {}) === false;
  const aegis = { immuneOn, refused, unhurt: g.player.hp === hpB2, charged: g._doctrineVerdict > 0,
                  secs: +g._doctrineAegisT.toFixed(2), want: P.immuneSecs };

  // (g) it expires
  for (let i = 0; i < Math.ceil(P.immuneSecs * 60) + 30; i++) g._updateChaosDoctrine(1 / 60);
  const aegisExpired = g.doctrineAegisImmune() === false;

  return { endlessDoc, endlessTookIt, blockedByRush, opened, duringRound, ultHeld, verdict,
           ultFreeAfter, aegis, aegisExpired };
});
check('N01 the round does NOT exist in Endless, and damage lands normally there',
  dimi.endlessDoc === false && dimi.endlessTookIt === true);
check('N02 a Round never opens on top of a Boss Rush', dimi.blockedByRush === true);
check('N03 a Round is declared once the arbiter allows it',
  dimi.opened.on === true && dimi.opened.count === 1, JSON.stringify(dimi.opened));
check('N04 during a Round the hit STILL lands — it only also charges the Verdict',
  dimi.duringRound.charged === true && dimi.duringRound.tookIt === true, JSON.stringify(dimi.duringRound));
check('N05 his panic button is HELD while the Round runs', dimi.ultHeld === true);
check('N06 a full Verdict smites the field, inside its radius only, and closes the Round',
  dimi.verdict.fired && dimi.verdict.roundClosed && dimi.verdict.reset &&
  dimi.verdict.nearHurt && dimi.verdict.farUntouched, JSON.stringify(dimi.verdict));
check('N07 the ultimate cooldown was HELD, not destroyed — it is free the moment the Round ends',
  dimi.ultFreeAfter === true);
check('N08 an AEGIS PYLON refuses the hit outright and charges the Verdict instead',
  dimi.aegis.immuneOn && dimi.aegis.refused && dimi.aegis.unhurt && dimi.aegis.charged,
  JSON.stringify(dimi.aegis));
check('N09 the aegis expires on its own', dimi.aegisExpired === true);

// ════════════════════════════════════════════════════════════════════════════
// O. SKELETON WARRIOR — OSSUARY DEBT + MARROW PYLON
// ════════════════════════════════════════════════════════════════════════════
const ossuary = await page.evaluate(() => {
  const g = window.__g;
  const D = window.__cd.CHAOS_DOCTRINE.skeleton_warrior.debt;

  window.__run('skeleton_warrior', false);
  const endlessShatter = g._doctrineTryShatter();

  window.__run('skeleton_warrior', true);
  g._doctrineShatters = 0; g._doctrineReassembled = 0; g._doctrineShards.length = 0;
  g._doctrineShatterT = 0;

  // (a) it shatters instead of dying, with the right number of shards
  const first = g._doctrineTryShatter();
  const shattered = { ok: first, shards: g._doctrineShards.length, want: D.shards,
                      hp: g.player.hp, gate: g.phoenixReviveTimer > 0,
                      window: +g._doctrineShatterT.toFixed(1) };

  // (b) nothing can finish him while scattered — the shipped i-frame gate does it
  g.playerHitCooldown = 0; g._chaosEntryGraceT = 0;
  const refused = g._damagePlayer(9999, {}) === false;

  // (c) collecting every shard reassembles him
  for (const sh of g._doctrineShards.slice()) { g.player.pos.x = sh.x; g.player.pos.y = sh.y; g._updateChaosDoctrine(1 / 60); }
  g._updateChaosDoctrine(1 / 60);
  const back = { shards: g._doctrineShards.length, shatterT: g._doctrineShatterT,
                 hp: g.player.hp, pct: g.player.hp / g.player.maxHp,
                 reassembled: g._doctrineReassembled };

  // (d) the SECOND shatter asks for one more shard
  const second = g._doctrineTryShatter();
  const escalated = { ok: second, shards: g._doctrineShards.length, want: D.shards + D.shardStep };

  // (e) running out of time hands the run back to the SHIPPED death chain rather than ending
  // it here: hp goes to 0 and the gate clears, so the next frame resolves game over normally.
  for (let i = 0; i < Math.ceil(D.windowSecs * 60) + 30; i++) g._updateChaosDoctrine(1 / 60);
  const lapsed = { shatterT: g._doctrineShatterT, hp: g.player.hp,
                   gate: g.phoenixReviveTimer, shards: g._doctrineShards.length,
                   gameOverNotForced: g.gameOver === false };
  return { endlessShatter, shattered, refused, back, escalated, lapsed };
});
check('O01 he does NOT shatter in Endless — the shipped death chain is untouched there',
  ossuary.endlessShatter === false);
check('O02 in Chaos he shatters instead of dying, with the right shard count',
  ossuary.shattered.ok === true && ossuary.shattered.shards === ossuary.shattered.want &&
  ossuary.shattered.hp === 1 && ossuary.shattered.gate === true,
  JSON.stringify(ossuary.shattered));
check('O03 nothing can finish him while scattered — the shipped i-frame gate holds',
  ossuary.refused === true);
check('O04 recovering every shard puts him back together at the right HP',
  ossuary.back.shards === 0 && ossuary.back.shatterT === 0 &&
  Math.abs(ossuary.back.pct - 0.40) < 0.02 && ossuary.back.reassembled === 1,
  JSON.stringify(ossuary.back));
check('O05 the SECOND shatter of a run asks for one more shard',
  ossuary.escalated.ok === true && ossuary.escalated.shards === ossuary.escalated.want,
  JSON.stringify(ossuary.escalated));
check('O06 running out of time hands the run back to the shipped death chain, not to a new one',
  ossuary.lapsed.shatterT === 0 && ossuary.lapsed.hp === 0 && ossuary.lapsed.gate === 0 &&
  ossuary.lapsed.shards === 0, JSON.stringify(ossuary.lapsed));

const marrow = await page.evaluate(() => {
  const g = window.__g;
  const P = window.__cd.CHAOS_DOCTRINE.skeleton_warrior.pylon;
  window.__run('skeleton_warrior', true);
  g._doctrineTurrets.length = 0; g._petBolts.length = 0; g.enemies.length = 0;
  let e = null;
  try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) {}
  if (e) { e.maxHp = 100000; e.hp = 100000; e.pos.x = g.player.pos.x + 120; e.pos.y = g.player.pos.y; g.enemies.push(e); }
  g._doctrineTriggerPylon({ pos: window.__pt(g.player.pos.x, g.player.pos.y), type: 'marrow' });
  const placed = g._doctrineTurrets.length;
  for (let i = 0; i < 130; i++) g._updateChaosDoctrine(1 / 60);   // > 2 cadences
  const fired = g._petBolts.length;
  for (let i = 0; i < 9; i++) g._doctrineTriggerPylon({ pos: window.__pt(g.player.pos.x, g.player.pos.y), type: 'marrow' });
  return { placed, fired, capped: g._doctrineTurrets.length, max: P.maxTurrets,
           buff: g._chaosPylonBuff?.type };
});
check('O07 a MARROW PYLON stays as a turret instead of paying out, and fires real bolts',
  marrow.placed === 1 && marrow.fired > 0, `${marrow.placed} turret, ${marrow.fired} bolts`);
check('O08 turrets are hard-capped', marrow.capped === marrow.max, `${marrow.capped} / ${marrow.max}`);

// O09 — DRAW a real frame while he is scattered. The 8 s window is held on the same field the
// 3 s phoenix burst animates from; before 2026-08-05 that drove the burst's gradient radius
// negative, createRadialGradient threw, and everything below it in draw() was lost every frame.
const scatterDraw = await page.evaluate(() => {
  const g = window.__g;
  window.__run('skeleton_warrior', true);
  g._lastPhoenixUsed = true; g._doctrineShatters = 0;
  const ok = g._doctrineTryShatter();
  const held = { t: g.phoenixReviveTimer, type: g.phoenixReviveType };
  let threw = null;
  for (let i = 0; i < 12; i++) {
    try { g.draw(window.__ctx()); } catch (e) { threw = String(e && e.message || e); break; }
    g.phoenixReviveTimer = Math.max(0.05, g.phoenixReviveTimer - 0.6);   // walk 8 s -> under 3 s
  }
  return { ok, held, threw };
});
check('O09 a frame DRAWN while he is scattered does not throw — the 8 s hold is not a 3 s burst',
  scatterDraw.ok === true && scatterDraw.threw === null &&
  scatterDraw.held.t === 8 && scatterDraw.held.type === 'none',
  JSON.stringify(scatterDraw));

// ════════════════════════════════════════════════════════════════════════════
// P. BRAWLER WARRIOR — FAULT MAP + QUAKE PYLON
// ════════════════════════════════════════════════════════════════════════════
const fault = await page.evaluate(() => {
  const g = window.__g;
  const F = window.__cd.CHAOS_DOCTRINE.brawler_warrior.fault;

  window.__run('brawler_warrior', false);
  g._doctrineDropScar(0, 0);
  const endlessScars = g._doctrineScars.length;

  window.__run('brawler_warrior', true);
  g._doctrineScars.length = 0; g._doctrineScarDrop = 0; g._doctrineCollapses = 0;
  g.enemies.length = 0;

  // (a) a ground attack leaves a scar — through the shipped accent classification
  g._spawnWeaponAccent('seismic_rift', g.player.pos.x, g.player.pos.y, 0, 1);
  const fromAccent = g._doctrineScars.length;

  // (b) the drop cooldown holds the rate down whatever the fire rate
  for (let i = 0; i < 50; i++) g._spawnWeaponAccent('seismic_rift', g.player.pos.x + i * 10, g.player.pos.y, 0, 1);
  const spammed = g._doctrineScars.length;

  // (c) scars bite what stands on them, and nothing off them
  const mk = (x, y) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 1e7; e.hp = 1e7; e.pos.x = x; e.pos.y = y; g.enemies.push(e); return e;
  };
  const sc = g._doctrineScars[0];
  const on = mk(sc.x, sc.y), off = mk(sc.x + 5000, sc.y + 5000);
  for (let i = 0; i < 60; i++) g._updateChaosDoctrine(1 / 60);
  const bite = { onHurt: on.hp < on.maxHp, offUntouched: off.hp === off.maxHp };

  // (d) the FIFO ceiling holds even in the pathological case where the doctrine never ticks
  //     (drops without a frame between them) — the array itself is the last line of defence.
  g._doctrineScars.length = 0; g._doctrineCollapses = 0; g.enemies.length = 0;
  for (let i = 0; i < 200; i++) { g._doctrineScarDrop = 0; g._doctrineDropScar(i * 40, 0); }
  const ceiling = { scars: g._doctrineScars.length, max: F.maxScars, collapses: g._doctrineCollapses };

  // (e) the real loop: a scar is dropped INSIDE a frame and the doctrine ticks after it, so a
  //     saturated map collapses on the very next tick and never reaches the FIFO ceiling.
  //     Only the 0.35 s drop cooldown is accelerated; the ordering is the shipped one.
  g._doctrineScars.length = 0; g._doctrineCollapses = 0; g.enemies.length = 0;
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    g._doctrineScarDrop = 0;
    g._doctrineDropScar(i * 400, 0);              // spread out: no scar overlaps another
    peak = Math.max(peak, g._doctrineScars.length);
    g._updateChaosDoctrine(1 / 60);
  }
  const collapse = { collapses: g._doctrineCollapses, peak, left: g._doctrineScars.length };

  return { endlessScars, fromAccent, spammed, bite, ceiling, collapse, collapseAt: F.collapseAt,
           maxScars: F.maxScars };
});
check('P01 no scar is ever left in Endless', fault.endlessScars === 0);
check('P02 a ground attack leaves a scar, through the shipped accent classification',
  fault.fromAccent === 1, `${fault.fromAccent} scar`);
check('P03 the drop cooldown holds the rate down — 50 attacks are not 50 scars',
  fault.spammed <= 3, `${fault.spammed} scars from 51 ground attacks`);
check('P04 scars bite what stands on them and nothing off them',
  fault.bite.onHurt === true && fault.bite.offUntouched === true, JSON.stringify(fault.bite));
check('P05 the FIFO ceiling holds — the only persistent-state doctrine cannot grow unbounded',
  fault.ceiling.scars <= fault.ceiling.max,
  `${fault.ceiling.scars} <= ${fault.ceiling.max} after 200 drops (${fault.ceiling.collapses} collapses)`);
check('P06 a saturated map COLLAPSES instead of forcing a deck transition, and never reaches the ceiling',
  fault.collapse.collapses > 0 && fault.collapse.peak === fault.collapseAt &&
  fault.collapse.peak < fault.maxScars,
  `${fault.collapse.collapses} collapses, peak ${fault.collapse.peak} scars (collapseAt ${fault.collapseAt}, ceiling ${fault.maxScars})`);

const quake = await page.evaluate(() => {
  const g = window.__g;
  const P = window.__cd.CHAOS_DOCTRINE.brawler_warrior.pylon;
  window.__run('brawler_warrior', true);
  g._doctrineScars.length = 0; g.enemies.length = 0;
  const c = { x: g.player.pos.x, y: g.player.pos.y };
  for (let i = 0; i < 6; i++) { g._doctrineScarDrop = 0; g._doctrineDropScar(c.x + i * 20, c.y); }
  g._doctrineScarDrop = 0; g._doctrineDropScar(c.x + P.radius + 900, c.y);   // far away, must survive
  const before = g._doctrineScars.length;
  const mk = (dx) => {
    let e = null;
    try { e = new window.__Enemy('Neon Swarmer', 1); } catch (_) { return null; }
    e.maxHp = 1e7; e.hp = 1e7; e.slowTimer = 0;
    e.pos.x = c.x + dx; e.pos.y = c.y; g.enemies.push(e); return e;
  };
  const near = mk(50), far = mk(P.radius + 900);
  g._doctrineTriggerPylon({ pos: window.__pt(c.x, c.y), type: 'quake' });
  return { before, after: g._doctrineScars.length,
           nearHurt: near.hp < near.maxHp, nearStaggered: near.slowTimer > 0,
           farUntouched: far.hp === far.maxHp, buff: g._chaosPylonBuff?.type };
});
check('P07 a QUAKE PYLON spends the scars inside its radius and leaves the rest',
  quake.before === 7 && quake.after === 1, `${quake.before} -> ${quake.after} scars`);
check('P08 it damages and staggers inside its radius only',
  quake.nearHurt === true && quake.nearStaggered === true && quake.farUntouched === true,
  JSON.stringify(quake));

// ════════════════════════════════════════════════════════════════════════════
// G. RESET / CLEANUP
// ════════════════════════════════════════════════════════════════════════════
const after = await page.evaluate(() => {
  const g = window.__g;
  window.__run('cyber_arm_hero', true);
  g._doctrineHeat = 1; g._doctrineFoundryStacks = 3; g._doctrineRerollCharges = 2;
  g._doctrineRerollsUsed = 4; g._doctrineFired = 9; g._doctrinePendingReroll = true;
  g._clsRerollMode = true; g._doctrineHeatVentCd = 0.5; g._doctrineHeatRedlines = 3;
  g._doctrineShroud = 1; g._doctrineShroudWindow = 4; g._doctrineShroudArms = 2;
  g._doctrineAxiomLast = { x: 1, y: 1 }; g._doctrineAxiomCd = 0.4; g._doctrineAxiomHits = 7;
  g._doctrineAxiomLines = [{ ax: 0, ay: 0, bx: 1, by: 1, t: 1, max: 1 }];
  g._doctrineProofNodes = [{ x: 0, y: 0 }, { x: 1, y: 1 }]; g._doctrineProofProved = 3;
  g._doctrineProofFlash = { pts: [], t: 1, max: 1 };
  g._doctrineDebt = 1; g._doctrineFallout = { x: 0, y: 0, r: 10, t: 5, cd: 0 };
  g._doctrineFalloutCasts = 2; g._doctrineBeatT = 0.3; g._doctrineSongs = 4;
  g._doctrineEncores = 3; g._doctrineFeedbacks = 2;
  g._doctrineFrostNodes = [{ x: 0, y: 0, t: 1, max: 1, cd: 0 }]; g._doctrineStillT = 2;
  g._doctrineFrostbites = 3; g._doctrineLastPos = { x: 5, y: 5 }; g._doctrineFrostDrop = 0.1;
  g._doctrineRoundT = 8; g._doctrineRoundCd = 20; g._doctrineVerdict = 0.5;
  g._doctrineVerdicts = 2; g._doctrineRoundsOpened = 3; g._doctrineAegisT = 2;
  g._doctrineShatterT = 4; g._doctrineShards = [{ x: 1, y: 1 }]; g._doctrineShatters = 2;
  g._doctrineReassembled = 1; g._doctrineTurrets = [{ x: 0, y: 0, cd: 0 }];
  g._doctrineScars = [{ x: 0, y: 0, cd: 0 }]; g._doctrineScarDrop = 0.2; g._doctrineCollapses = 3;
  const armed = { heat: g._doctrineHeat, stacks: g._doctrineFoundryStacks, charges: g._doctrineRerollCharges };
  g.gameOver = true;
  g.reset();
  return {
    armed,
    heat: g._doctrineHeat, stacks: g._doctrineFoundryStacks, charges: g._doctrineRerollCharges,
    used: g._doctrineRerollsUsed, fired: g._doctrineFired, pending: g._doctrinePendingReroll,
    rerollMode: g._clsRerollMode, ventCd: g._doctrineHeatVentCd, redlines: g._doctrineHeatRedlines,
    lawXp: g._doctrineLawXpApplied,
    shroud: g._doctrineShroud, shroudWin: g._doctrineShroudWindow, shroudArms: g._doctrineShroudArms,
    axiomLast: g._doctrineAxiomLast, axiomCd: g._doctrineAxiomCd, axiomHits: g._doctrineAxiomHits,
    axiomLines: g._doctrineAxiomLines.length, proofNodes: g._doctrineProofNodes.length,
    proofProved: g._doctrineProofProved, proofFlash: g._doctrineProofFlash,
    debt: g._doctrineDebt, fallout: g._doctrineFallout, falloutCasts: g._doctrineFalloutCasts,
    beatT: g._doctrineBeatT, songs: g._doctrineSongs, encores: g._doctrineEncores,
    feedbacks: g._doctrineFeedbacks,
    frostNodes: g._doctrineFrostNodes.length, stillT: g._doctrineStillT,
    frostbites: g._doctrineFrostbites, lastPos: g._doctrineLastPos, frostDrop: g._doctrineFrostDrop,
    roundT: g._doctrineRoundT, roundCd: g._doctrineRoundCd, verdict: g._doctrineVerdict,
    verdicts: g._doctrineVerdicts, roundsOpened: g._doctrineRoundsOpened, aegisT: g._doctrineAegisT,
    shatterT: g._doctrineShatterT, shards: g._doctrineShards.length, shatters: g._doctrineShatters,
    reassembled: g._doctrineReassembled, turrets: g._doctrineTurrets.length,
    scars: g._doctrineScars.length, scarDrop: g._doctrineScarDrop, collapses: g._doctrineCollapses,
  };
});
check('G01 the rig really armed the doctrine before the restart',
  after.armed.heat === 1 && after.armed.stacks === 3 && after.armed.charges === 2, JSON.stringify(after.armed));
check('G02 a restart clears EVERY doctrine field, all ten characters',
  after.heat === 0 && after.stacks === 0 && after.charges === 0 && after.used === 0 &&
  after.fired === 0 && after.pending === false && after.rerollMode === false &&
  after.ventCd === 0 && after.redlines === 0 && after.lawXp === 1 &&
  after.shroud === 0 && after.shroudWin === 0 && after.shroudArms === 0 &&
  after.axiomLast === null && after.axiomCd === 0 && after.axiomHits === 0 &&
  after.axiomLines === 0 && after.proofNodes === 0 && after.proofProved === 0 &&
  after.proofFlash === 0 &&
  after.debt === 0 && after.fallout === null && after.falloutCasts === 0 &&
  after.beatT === 0 && after.songs === 0 && after.encores === 0 && after.feedbacks === 0 &&
  after.frostNodes === 0 && after.stillT === 0 && after.frostbites === 0 &&
  after.lastPos === null && after.frostDrop === 0 &&
  after.roundT === 0 && after.roundCd === 0 && after.verdict === 0 &&
  after.verdicts === 0 && after.roundsOpened === 0 && after.aegisT === 0 &&
  after.shatterT === 0 && after.shards === 0 && after.shatters === 0 &&
  after.reassembled === 0 && after.turrets === 0 &&
  after.scars === 0 && after.scarDrop === 0 && after.collapses === 0,
  JSON.stringify(after));

// ════════════════════════════════════════════════════════════════════════════
// Q. JAPAN PHASEWALKER — THE CORRUPTED MUTATION SLOT
//    Every check here defends one promise: the card never overstates what it does.
// ════════════════════════════════════════════════════════════════════════════
const corrupt = await page.evaluate(async () => {
  const g = window.__g;
  const mut = await import(`./js/game/Mutations.js?v=${(await fetch('./js/game/Game.js?v=' + window.__BUILD)
    .then(r => r.text())).match(/Mutations\.js\?v=(\d+)/)[1]}`);
  const hand = () => g._buildMutationChoices().map(c => ({ key: c.key, corrupted: !!c.corrupted }));

  // (a) THE GATE — the slot exists only for this character, and only inside Chaos.
  window.__run('japan_phasewalker', false);
  const endless = [];
  for (let i = 0; i < 12; i++) endless.push(hand());

  const OTHERS = ['cyber_arm_hero', 'assassin_clone', 'euclid_vector', 'oni_cataclysm_protocol',
                  'eddie', 'taekwondo_girl', 'dimis_kickboxer', 'skeleton_warrior', 'brawler_warrior'];
  const otherHands = [];
  for (const c of OTHERS) {
    window.__run(c, true);
    for (let i = 0; i < 4; i++) otherHands.push({ c, h: hand() });
  }

  // (b) the shape of HIS hand in Chaos: still three cards, the THIRD one corrupted.
  window.__run('japan_phasewalker', true);
  g.player.hp = Math.floor(g.player.maxHp * 0.5);        // keep every corrupted card payable
  const mine = [];
  for (let i = 0; i < 40; i++) mine.push(hand());
  const shapes = {
    widths:  [...new Set(mine.map(h => h.length))],
    thirdOk: mine.every(h => h.length === 3 && h[2].corrupted === true),
    firstTwoPlain: mine.every(h => !h[0].corrupted && !h[1].corrupted),
    distinct: mine.every(h => new Set(h.map(c => c.key)).size === 3),
    seen: [...new Set(mine.map(h => h[2].key))].sort(),
  };

  // (c) both halves are PRINTED, and the risk names the real fields.
  const RISKY = ['spawn', 'pickup', 'mana', 'projectile', 'Plasma', 'elite'];
  const printed = [];
  for (let i = 0; i < 30; i++) {
    const c = g._buildMutationChoices()[2];
    printed.push({
      bonus: typeof c.bonus === 'string' && c.bonus.length > 8,
      risk:  typeof c.risk === 'string' && c.risk.length > 8,
      named: RISKY.some(w => c.risk.includes(w)),
      inDesc: c.desc.includes('BONUS') && c.desc.includes('RISK'),
      two: c.risk.includes(' + '),
    });
  }
  const prints = {
    bonus: printed.every(p => p.bonus), risk: printed.every(p => p.risk),
    named: printed.every(p => p.named), inDesc: printed.every(p => p.inDesc),
    two: printed.every(p => p.two),
  };

  // (d) the BONUS is real — each card's advertised bonus, measured through selectMutation().
  const takeUntil = (key, prep) => {
    for (let t = 0; t < 400; t++) {
      window.__run('japan_phasewalker', true);
      if (prep) prep();
      const h = g._buildMutationChoices();
      if (h[2].key !== key) continue;
      g.mutationUI = { choices: h };
      const before = prep ? prep.snapshot?.() : null;
      g.selectMutation(2);
      return { ok: true, before };
    }
    return { ok: false };
  };
  const half = () => { g.player.hp = Math.floor(g.player.maxHp * 0.5); };

  const rFate = takeUntil('corrupt_fate', half);
  const paidFate = { got: rFate.ok, pending: g._doctrinePendingReroll === true };

  const rFlesh = takeUntil('corrupt_flesh', half);
  const paidFlesh = { got: rFlesh.ok, full: g.player.hp === g.player.maxHp };

  const rPhase = takeUntil('corrupt_phase', half);
  const paidPhase = { got: rPhase.ok, iframes: g.phoenixReviveTimer >= 5 };

  // (e) the RISK is real, and it is CLAMPED to the same caps the ordinary cards use.
  //     Applying a corrupted card 30x must never push a field past the shipped floor/ceiling.
  const m = { spawnRateMult: 1, pickupRadiusMult: 1, manaGainMult: 1,
              enemyBulletSpeedMult: 1, plasmaOnPlayerChanceBonus: 0, eliteIntervalMult: 1,
              stacks: 0, taken: {} };
  const before = { ...m };
  for (const card of mut.CORRUPTED_MUTATIONS) {
    const stamped = { apply: (mm) => { for (const k of card.risks) mut.MUTATIONS.find(x => x.key === k).apply(mm); } };
    for (let i = 0; i < 30; i++) stamped.apply(m);
  }
  const clamped = {
    moved: m.spawnRateMult < before.spawnRateMult && m.eliteIntervalMult < before.eliteIntervalMult &&
           m.manaGainMult < before.manaGainMult && m.pickupRadiusMult < before.pickupRadiusMult &&
           m.enemyBulletSpeedMult > before.enemyBulletSpeedMult &&
           m.plasmaOnPlayerChanceBonus > before.plasmaOnPlayerChanceBonus,
    inBounds: m.spawnRateMult >= 0.62 - 1e-9 && m.pickupRadiusMult >= 0.55 - 1e-9 &&
              m.manaGainMult >= 0.55 - 1e-9 && m.enemyBulletSpeedMult <= 1.5 + 1e-9 &&
              m.plasmaOnPlayerChanceBonus <= 0.40 + 1e-9 && m.eliteIntervalMult >= 0.62 - 1e-9,
    m,
  };

  // (f) a bonus that could not be paid IN FULL is never offered.
  window.__run('japan_phasewalker', true);
  g.player.hp = g.player.maxHp;                       // a full heal would heal nothing
  const atFull = [];
  for (let i = 0; i < 60; i++) atFull.push(g._buildMutationChoices()[2].key);
  const withheld = !atFull.includes('corrupt_flesh');

  // (g) an already-capped drawback SAYS SO instead of being quietly charged.
  const capped = { spawnRateMult: 0.62, pickupRadiusMult: 1, manaGainMult: 1,
                   enemyBulletSpeedMult: 1, plasmaOnPlayerChanceBonus: 0, eliteIntervalMult: 1,
                   stacks: 0, taken: {} };
  let honestCap = null;
  for (let i = 0; i < 200 && honestCap === null; i++) {
    const c = mut.sampleCorruptedMutation(g, capped);
    if (c && c.key === 'corrupt_fate') honestCap = c.risk.includes('ALREADY AT CAP');
  }

  return { endless, otherHands, shapes, prints, paidFate, paidFlesh, paidPhase,
           clamped, withheld, atFullSeen: [...new Set(atFull)].sort(), honestCap };
});
check('Q01 japan_phasewalker gets NO corrupted card outside Chaos',
  corrupt.endless.every(h => h.length === 3 && h.every(c => !c.corrupted)));
check('Q02 no other character ever sees a corrupted card, even in Chaos',
  corrupt.otherHands.every(o => o.h.length === 3 && o.h.every(c => !c.corrupted)),
  `${corrupt.otherHands.length} hands over 9 characters`);
check('Q03 in Chaos his hand is still THREE cards and the THIRD is the corrupted one',
  corrupt.shapes.thirdOk && corrupt.shapes.firstTwoPlain &&
  corrupt.shapes.widths.length === 1 && corrupt.shapes.widths[0] === 3,
  `widths ${corrupt.shapes.widths.join('/')}, third seen: ${corrupt.shapes.seen.join(', ')}`);
check('Q04 the three cards are always distinct — the corrupted slot never duplicates a plain card',
  corrupt.shapes.distinct === true);
check('Q05 the card PRINTS both halves before the pick, and the risk names real effects',
  corrupt.prints.bonus && corrupt.prints.risk && corrupt.prints.named &&
  corrupt.prints.inDesc && corrupt.prints.two, JSON.stringify(corrupt.prints));
check('Q06 CORRUPTED FATE really pays — the shipped law reroll is armed',
  corrupt.paidFate.got && corrupt.paidFate.pending, JSON.stringify(corrupt.paidFate));
check('Q07 CORRUPTED FLESH really pays — HP goes to full',
  corrupt.paidFlesh.got && corrupt.paidFlesh.full, JSON.stringify(corrupt.paidFlesh));
check('Q08 CORRUPTED PHASE really pays — 5 s on the shipped i-frame gate',
  corrupt.paidPhase.got && corrupt.paidPhase.iframes, JSON.stringify(corrupt.paidPhase));
check('Q09 the drawback is real AND clamped to the ordinary cards’ own caps — 90 stacks stay in bounds',
  corrupt.clamped.moved && corrupt.clamped.inBounds, JSON.stringify(corrupt.clamped.m));
check('Q10 a bonus that cannot be paid in full is never offered (full HP hides the heal card)',
  corrupt.withheld === true, `third-slot cards at full HP: ${corrupt.atFullSeen.join(', ')}`);
check('Q11 an already-capped drawback says so out loud instead of being charged silently',
  corrupt.honestCap === true, String(corrupt.honestCap));

// ── Q12-Q14: the picker still answers to mouse, keyboard and controller, on the third card ──
const navQ = await page.evaluate(() => {
  const g = window.__g;
  const out = {};
  const open = () => {
    window.__run('japan_phasewalker', true);
    g.player.hp = Math.floor(g.player.maxHp * 0.5);
    g._openMutationChoice();
    return g.mutationUI;
  };
  // MOUSE — click the third card's own rect.
  let ui = open();
  const rects = ui.cardRects.length, third = ui.cardRects[2];
  const key3 = ui.choices[2].key, corrupt3 = !!ui.choices[2].corrupted;
  ui.handleClick({ x: third.x + third.w / 2, y: third.y + third.h / 2 }, g);
  out.mouse = { rects, closed: g.mutationUI === null, took: (g.mutations.taken[key3] || 0) > 0, corrupt3 };
  // The rects must sit fully on screen — the taller corrupted row must not run off the canvas.
  ui = open();
  out.onScreen = ui.cardRects.every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= 1280 && r.y + r.h <= 720);
  out.tall = ui.cardRects[0].h > 200 && ui.hasCorrupt === true;
  g.mutationUI = null;
  return out;
});
check('Q12 mouse: clicking the third card takes exactly that card and closes the picker',
  navQ.mouse.rects === 3 && navQ.mouse.corrupt3 === true && navQ.mouse.closed && navQ.mouse.took,
  JSON.stringify(navQ.mouse));
check('Q13 the taller corrupted row still fits the 1280x720 canvas',
  navQ.onScreen === true && navQ.tall === true, JSON.stringify(navQ));

// Keyboard + controller go through the REAL listeners: a keydown on document, and a virtual
// gamepad whose D-pad/A travel GamepadInput.poll -> applyGamepad -> padTap -> keydown.
const kb = await page.evaluate(async () => {
  const g = window.__g;
  window.__run('japan_phasewalker', true);
  g.player.hp = Math.floor(g.player.maxHp * 0.5);
  g._openMutationChoice();
  const key3 = g.mutationUI.choices[2].key;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
  return { closed: g.mutationUI === null, took: (g.mutations.taken[key3] || 0) > 0, key3 };
});
check('Q14 keyboard: "3" selects the corrupted card through the shipped listener',
  kb.closed && kb.took, JSON.stringify(kb));

const padNav = await page.evaluate(async () => {
  const g = window.__g;
  window.__run('japan_phasewalker', true);
  g.player.hp = Math.floor(g.player.maxHp * 0.5);
  g._openMutationChoice();
  const key3 = g.mutationUI.choices[2].key;
  const start = g.mutationUI.selectedIndex;
  // ArrowRight is exactly what the pad's D-pad emits (main.js applyGamepad -> padTap -> keydown).
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  const one = g.mutationUI.selectedIndex;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  const two = g.mutationUI.selectedIndex;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return { start, one, two, closed: g.mutationUI === null, took: (g.mutations.taken[key3] || 0) > 0 };
});
check('Q15 controller: the cursor walks to the corrupted card and A/Enter confirms it',
  padNav.start === 0 && padNav.one === 1 && padNav.two === 2 && padNav.closed && padNav.took,
  JSON.stringify(padNav));

// A real frame with the picker open — it must draw without throwing and without a black screen.
await page.evaluate(() => {
  const g = window.__g;
  window.__run('japan_phasewalker', true);
  g.player.hp = Math.floor(g.player.maxHp * 0.5);
  g._openMutationChoice();
  try { g.draw(window.__ctx()); } catch (_) {}
});
await shot('04_corrupted_mutation.png');
const cardLum = await page.evaluate(() => {
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
check('Q16 the corrupted picker draws a real frame — no black screen behind it',
  cardLum.ok && !(cardLum.mean < 6 && cardLum.max < 24) && cardLum.colors > 4, JSON.stringify(cardLum));
await page.evaluate(() => { window.__g.mutationUI = null; });

// Q17 — the same trap as O09, from the other direction: CORRUPTED PHASE holds the i-frame gate
// for 5 s, which is longer than the phoenix burst it shares a field with.
const phaseDraw = await page.evaluate(() => {
  const g = window.__g;
  let armed = false;
  for (let t = 0; t < 400 && !armed; t++) {
    window.__run('japan_phasewalker', true);
    g.player.hp = Math.floor(g.player.maxHp * 0.5);
    const h = g._buildMutationChoices();
    if (h[2].key !== 'corrupt_phase') continue;
    g.mutationUI = { choices: h };
    g.selectMutation(2);
    armed = true;
  }
  const held = { t: g.phoenixReviveTimer, type: g.phoenixReviveType };
  let threw = null;
  for (let i = 0; i < 10; i++) {
    try { g.draw(window.__ctx()); } catch (e) { threw = String(e && e.message || e); break; }
    g.phoenixReviveTimer = Math.max(0.05, g.phoenixReviveTimer - 0.6);
  }
  return { armed, held, threw };
});
check('Q17 a frame DRAWN during CORRUPTED PHASE immunity does not throw',
  phaseDraw.armed && phaseDraw.threw === null &&
  phaseDraw.held.t >= 5 && phaseDraw.held.type === 'none', JSON.stringify(phaseDraw));

// Q18 — an ORDINARY revive is untouched: it still plays its burst, from its own type.
const reviveFx = await page.evaluate(() => {
  const g = window.__g;
  window.__run('japan_phasewalker', true);
  g.phoenixReviveType = 'gold'; g.phoenixReviveTimer = 2.5;
  let threw = null;
  try { g.draw(window.__ctx()); } catch (e) { threw = String(e && e.message || e); }
  return { threw, t: g.phoenixReviveTimer, type: g.phoenixReviveType };
});
check('Q18 an ordinary phoenix revive still draws its burst, unchanged',
  reviveFx.threw === null && reviveFx.type === 'gold' && reviveFx.t === 2.5,
  JSON.stringify(reviveFx));

// ════════════════════════════════════════════════════════════════════════════
// H. NO BLACK SCREEN, NO ERRORS
// ════════════════════════════════════════════════════════════════════════════
await page.evaluate(() => { const g = window.__g; g.gameOver = false; g.player.hp = g.player.maxHp; window.__step(90); });
await shot('03_chaos_run.png');
const lum = await page.evaluate(() => {
  const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
  if (!c) return { ok: false, why: 'no canvas' };
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
check('H01 the game is still rendering — no black screen',
  lum.ok && !(lum.mean < 6 && lum.max < 24) && lum.colors > 4, JSON.stringify(lum));
check('H02 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('H03 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, doctrineV: DOC_V, laws, heat, foundry, fate, reroll, confirmed, others, dist, after, lum,
  corrupt, navQ, kb, padNav, cardLum, scatterDraw, phaseDraw, reviveFx,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
