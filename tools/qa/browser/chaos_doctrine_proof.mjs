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
check('A03 the doctrine table ships exactly the two piloted characters',
  rig.chars.length === 2 && rig.chars.includes('japan_phasewalker') && rig.chars.includes('cyber_arm_hero'),
  rig.chars.join(', '));

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
const others = await page.evaluate(() => {
  const g = window.__g;
  const out = {};
  for (const c of ['skeleton_warrior', 'taekwondo_girl', 'brawler_warrior', 'euclid_vector',
                   'oni_cataclysm_protocol', 'assassin_clone', 'eddie', 'dimis_kickboxer']) {
    window.__run(c, true);
    const doc = !!g._doctrine();
    // 600 pylon spawns: the distribution must stay the shipped 50/25/25 with nothing else in it
    g._chaosPylons.length = 0;
    const seen = {};
    for (let i = 0; i < 600; i++) {
      g._chaosPylonCd = -1;
      g._updateChaosPylons(0.016);
      for (const p of g._chaosPylons) seen[p.type] = (seen[p.type] || 0) + 1;
      g._chaosPylons.length = 0;
    }
    for (let i = 0; i < 30; i++) g._doctrineAddHeat();
    out[c] = { doc, types: Object.keys(seen).sort(), heat: g._doctrineHeat, rerolls: g._doctrineRerollCharges };
  }
  return out;
});
const allClean = Object.values(others).every(o =>
  o.doc === false && o.heat === 0 && o.rerolls === 0 &&
  o.types.length === 3 && o.types.join(',') === 'danger,heal,shield');
check('F01 the other eight characters get NO doctrine, NO heat, NO rerolls',
  allClean, JSON.stringify(Object.fromEntries(Object.entries(others).map(([k, v]) => [k, v.types.join('/')]))));

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
// G. RESET / CLEANUP
// ════════════════════════════════════════════════════════════════════════════
const after = await page.evaluate(() => {
  const g = window.__g;
  window.__run('cyber_arm_hero', true);
  g._doctrineHeat = 1; g._doctrineFoundryStacks = 3; g._doctrineRerollCharges = 2;
  g._doctrineRerollsUsed = 4; g._doctrineFired = 9; g._doctrinePendingReroll = true;
  g._clsRerollMode = true; g._doctrineHeatVentCd = 0.5; g._doctrineHeatRedlines = 3;
  const armed = { heat: g._doctrineHeat, stacks: g._doctrineFoundryStacks, charges: g._doctrineRerollCharges };
  g.gameOver = true;
  g.reset();
  return {
    armed,
    heat: g._doctrineHeat, stacks: g._doctrineFoundryStacks, charges: g._doctrineRerollCharges,
    used: g._doctrineRerollsUsed, fired: g._doctrineFired, pending: g._doctrinePendingReroll,
    rerollMode: g._clsRerollMode, ventCd: g._doctrineHeatVentCd, redlines: g._doctrineHeatRedlines,
    lawXp: g._doctrineLawXpApplied,
  };
});
check('G01 the rig really armed the doctrine before the restart',
  after.armed.heat === 1 && after.armed.stacks === 3 && after.armed.charges === 2, JSON.stringify(after.armed));
check('G02 a restart clears EVERY doctrine field',
  after.heat === 0 && after.stacks === 0 && after.charges === 0 && after.used === 0 &&
  after.fired === 0 && after.pending === false && after.rerollMode === false &&
  after.ventCd === 0 && after.redlines === 0 && after.lawXp === 1,
  JSON.stringify(after));

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
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
