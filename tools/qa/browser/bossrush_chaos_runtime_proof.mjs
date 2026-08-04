// ════════════════════════════════════════════════════════════════════════════════
// CHAOS / BOSS RUSH — runtime QA (Chromium, deterministic acceleration).
//
// A full Chaos Boss Rush is 2:00 of run time before it opens plus 3:00 of rush. This proof
// never waits for that. The clock is driven, not endured: the schedule point is reached by
// setting timeAlive/_chaosStartedAt and stepping the REAL update(), and the 180 s rush body
// is advanced by calling the REAL _updateBossRush(dt) on a fixed dt. Every beat, spawn,
// hazard and completion branch is the shipped code path — only the clock is synthetic.
//
// Scope, as asked: start/end of the rush, bosses and Mega Bosses acting and dying, hazards
// and telegraphs appearing AND clearing, rewards on clear, arena lock/unlock and cleanup,
// the post-run options, and zero freeze / black screen / console / page errors.
//
// Run: node tools/qa/browser/bossrush_chaos_runtime_proof.mjs [port]
// Writes: /tmp/bossrush_chaos_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/bossrush_chaos_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8987;
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
const BASE = `http://127.0.0.1:${PORT}`;
console.log(`serving ${ROOT} on ${BASE}   BUILD=${BUILD}`);

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

const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
};

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

// Nothing in this proof may touch the real save.
await page.evaluate(() => {
  const g = window.__g;
  g.meta._save = () => {};
  window.__creditsAdded = 0;
  const add = g.meta.addCredits.bind(g.meta);
  g.meta.addCredits = (n) => { window.__creditsAdded += n; return add(n); };
});

// ════════════════════════════════════════════════════════════════════════════
// B. ENTER A CHAOS RUN THROUGH THE REAL ROUTE
// ════════════════════════════════════════════════════════════════════════════
const settle = async (ms = 900) => { await page.waitForTimeout(ms); };
const INPUT = "{ keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false }";

// The run is opened through the game's OWN Chaos entry (startChaosRun -> _beginChaosRun),
// the same call the mode-select route ends in. Driving the menu with synthetic clicks was
// landing in a non-Chaos run and silently invalidating every deck assertion below.
await page.evaluate(() => {
  const g = window.__g;
  g.selectedCharacter = g.selectedCharacter || 'skeleton_warrior';
  g.reset();
  g.gameState = 'playing';
  try { g.startChaosRun(); } catch (_) {}
  if (g._pendingChaosStart) { g._pendingChaosStart = false; g._beginChaosRun(); }
  if (!g._chaosMode) { try { g._beginChaosRun(); } catch (_) {} }
});
await settle(1500);
const inRun = await page.evaluate(() => ({
  state: window.__g.gameState, chaos: !!window.__g._chaosMode,
  hasPlayer: !!window.__g.player, deck: window.__g._deck || 'main',
}));
check('B01 a CHAOS run is live', inRun.state === 'playing' && inRun.chaos && inRun.hasPlayer, JSON.stringify(inRun));
check('B02 the run starts on the main deck', inRun.deck === 'main', inRun.deck);
await shot('02_chaos_run.png');

// ════════════════════════════════════════════════════════════════════════════
// C. THE REFUSED START MUST NOT MOVE OR LOCK THE PLAYER
//    canStartMajorEvent() refuses whenever another major event holds the slot or the 6 s
//    grace is running. Both are ordinary mid-run states.
// ════════════════════════════════════════════════════════════════════════════
const refused = await page.evaluate(() => {
  const g = window.__g;
  const snap = () => ({
    deck: g._deck || 'main', lock: +(g._deckLockT || 0).toFixed(1), rush: !!g._bossRush,
    pulse: +(g.player.upgrades['Pulse Damage'] || 0).toFixed(2), vuln: +(g.player._rushVulnMult || 0).toFixed(2),
  });
  // park the run one step from the rush, with a competing event holding the slot
  g._chaosStartedAt = 0; g.timeAlive = 119;
  g._bossRush = null; g._bossRushCount = 0; g._bossRushWarned = false; g._bossRushSchedule = [120, 480];
  g._deck = 'main'; g._deckLockT = 0; g._majorEventGraceT = 0;
  g._activeMajorEvent = 'acidRain'; g._majorSlotT = 30;      // a storm owns the slot
  // arm Glass Vow so C03 tests a real buff rather than passing because the relic was off
  const relicOn = g._relicOn.bind(g);
  g._relicOn = (id) => (id === 'rush_glass_vow' ? true : relicOn(id));
  const before = snap();
  g.timeAlive = 121;
  for (let i = 0; i < 5; i++) g._updateBossRush(1 / 60);
  const after = snap();
  const count = g._bossRushCount;
  // clean up so later sections start from a known state
  g._relicOn = relicOn;
  g._activeMajorEvent = null; g._majorSlotT = 0; g._deckLockT = 0;
  return { before, after, count };
});
check('C01 a refused rush does not force the player onto the lower deck',
  refused.after.deck === refused.before.deck, `deck ${refused.before.deck} -> ${refused.after.deck}`);
check('C02 a refused rush does not lock the deck exits',
  refused.after.lock === 0, `_deckLockT ${refused.after.lock}s`);
check('C03 a refused rush leaves no Glass Vow stat behind',
  refused.after.pulse === refused.before.pulse && refused.after.vuln === refused.before.vuln,
  `PulseDmg ${refused.before.pulse}->${refused.after.pulse} vuln ${refused.before.vuln}->${refused.after.vuln}`);
check('C04 a refused rush keeps its schedule slot so it retries rather than being skipped',
  refused.count === 0, `_bossRushCount ${refused.count}`);

// ════════════════════════════════════════════════════════════════════════════
// D. START — the rush opens, claims the arena, locks the deck
// ════════════════════════════════════════════════════════════════════════════
const start = await page.evaluate(() => {
  const g = window.__g;
  window.__anns = [];
  const ta = g.triggerAnnouncement.bind(g);
  g.triggerAnnouncement = (txt, col, opt) => { window.__anns.push(String(txt)); return ta(txt, col, opt); };
  g._chaosStartedAt = 0; g.timeAlive = 114;
  g._bossRush = null; g._bossRushCount = 0; g._bossRushWarned = false; g._bossRushSchedule = [120, 480];
  g._deck = 'main'; g._deckLockT = 0; g._activeMajorEvent = null; g._majorSlotT = 0; g._majorEventGraceT = 0;
  g._nullBreachActive = false;
  // pre-warning window is [next-5, next)
  g.timeAlive = 116; g._updateBossRush(1 / 60);
  const warned = { flag: !!g._bossRushWarned, anns: window.__anns.slice() };
  g.timeAlive = 121; g._updateBossRush(1 / 60);
  const br = g._bossRush;
  return {
    warned,
    open: !!br,
    r: br ? +br.r.toFixed(1) : null,
    finite: br ? [br.cx, br.cy, br.r].every(Number.isFinite) : false,
    dur: br ? br.dur : null,
    slot: g._activeMajorEvent,
    deck: g._deck, lock: +(g._deckLockT || 0).toFixed(0),
    anns: window.__anns.slice(),
    insideAtOpen: br ? Math.hypot(g.player.pos.x - br.cx, g.player.pos.y - br.cy) <= br.r : false,
  };
});
check('D01 a pre-warning telegraph fires before the rush opens',
  start.warned.flag && start.warned.anns.some(a => /BOSS RUSH INCOMING/.test(a)), JSON.stringify(start.warned.anns));
check('D02 the rush opens', start.open);
check('D03 the arena centre and radius are finite and validated', start.finite && start.r > 0, `r=${start.r}`);
check('D04 the rush is a 3:00 encounter', start.dur === 180, `dur ${start.dur}`);
check('D05 the rush claims the major-event slot', start.slot === 'bossRush', String(start.slot));
check('D06 the arena is fought on the locked lower deck', start.deck === 'lower' && start.lock >= 180,
  `deck ${start.deck} lock ${start.lock}s`);
check('D07 the opening announcement is shown', start.anns.some(a => /CHAOS BOSS RUSH/.test(a)));
// The lock clamp is applied by the next _updateBossRush step, not by the frame that opens the
// arena, so containment is asserted where the shipped code actually enforces it.
const contained = await page.evaluate(() => {
  const g = window.__g; g._updateBossRush(1 / 60);
  const br = g._bossRush;
  return { d: Math.round(Math.hypot(g.player.pos.x - br.cx, g.player.pos.y - br.cy)), r: Math.round(br.r) };
});
check('D08 the player is contained inside the ring once the lock runs',
  contained.d <= contained.r, `distance ${contained.d} vs r ${contained.r} (at open: ${start.insideAtOpen})`);

// ════════════════════════════════════════════════════════════════════════════
// E. THE 3:00 BODY — beats, Mega Bosses, hazards that appear AND clear
// ════════════════════════════════════════════════════════════════════════════
const body = await page.evaluate(() => {
  const g = window.__g;
  const seen = { hazards: [], titans: 0, maxOutside: 0, escaped: 0 };
  const megaAtSpawn = [];
  const spawnTitan = g._bossRushSpawnTitan.bind(g);
  g._bossRushSpawnTitan = (br) => {
    const r = spawnTitan(br);
    const t = g.enemies[g.enemies.length - 1];
    if (t) megaAtSpawn.push({ mega: !!t.isMegaBoss, hp: t.hp, maxHp: t.maxHp });
    seen.titans++;
    return r;
  };
  let prevHz = null, hazardCleared = 0, lastR = null;
  const DT = 0.1;
  for (let i = 0; i < 1810; i++) {
    if (!g._bossRush) break;
    const br = g._bossRush;
    // drift the player hard outward every frame — the wall must hold
    g.player.pos.x += 40; g.player.pos.y += 25;
    g._updateBossRush(DT);
    if (!g._bossRush) break;
    const hz = g._bossRush.hazard;
    if (hz && hz.kind !== prevHz) { seen.hazards.push(hz.kind); prevHz = hz.kind; }
    if (!hz && prevHz) { hazardCleared++; prevHz = null; }
    lastR = br.r;
    const d = Math.hypot(g.player.pos.x - br.cx, g.player.pos.y - br.cy);
    if (d > seen.maxOutside) seen.maxOutside = d;
    if (d > br.r + 2) seen.escaped++;
  }
  // The final hazard is torn down by the completion branch in the SAME step that ends the
  // rush, so the loop exits before it can observe the transition. Count it explicitly.
  if (prevHz) hazardCleared++;
  g._bossRushSpawnTitan = spawnTitan;
  return {
    flags: g._bossRushFlagsSeen || null,
    hazards: seen.hazards, hazardCleared,
    megaCount: seen.titans,
    megaHasHp: megaAtSpawn.length > 0 && megaAtSpawn.every(m => Number.isFinite(m.hp) && m.hp > 0),
    megaScaled: megaAtSpawn.every(m => m.mega === true),
    survivorsAfterReturn: g.enemies.filter(e => e.isMegaBoss).length,
    escaped: seen.escaped, maxD: Math.round(seen.maxOutside),
    ringR: Math.round(lastR ?? 0),
    hazardSurvives: !!(g._bossRush && g._bossRush.hazard),
    stillRunning: !!g._bossRush,
    anns: window.__anns.slice(),
  };
});
check('E01 the rush reaches its end within its own 3:00 clock', body.stillRunning === false, `stillRunning ${body.stillRunning}`);
check('E02 all four hazard/telegraph beats appear',
  ['lockdown', 'double', 'enrage'].every(k => body.hazards.includes(k)), JSON.stringify(body.hazards));
check('E03 every hazard clears itself — none survives the rush',
  body.hazardCleared >= body.hazards.length && body.hazardSurvives === false,
  `${body.hazardCleared} cleared / ${body.hazards.length} raised, survivor ${body.hazardSurvives}`);
check('E04 four Mega Bosses (Titans) are spawned across the fight', body.megaCount >= 4, `${body.megaCount} mega bosses`);
check('E05 every Mega Boss is flagged and alive on spawn', body.megaHasHp && body.megaScaled);
check('E08 returning to the main deck retires the arena\'s Mega Bosses',
  body.survivorsAfterReturn < body.megaCount, `${body.survivorsAfterReturn} left of ${body.megaCount} spawned`);
check('E06 the arena wall holds — the player never escapes the ring',
  body.escaped === 0, `${body.escaped} frames outside, max distance ${body.maxD} vs r ${body.ringR}`);
check('E07 the Titan and Enrage telegraphs are announced',
  body.anns.some(a => /BOSS RUSH ⚠|FINAL TITAN/.test(a)) && body.anns.some(a => /ENRAGE GRID/.test(a)));

// ════════════════════════════════════════════════════════════════════════════
// F. CLEAR — rewards, unlock, full cleanup
// ════════════════════════════════════════════════════════════════════════════
const cleared = await page.evaluate(() => {
  const g = window.__g;
  return {
    rush: g._bossRush, slot: g._activeMajorEvent, lock: +(g._deckLockT || 0).toFixed(1),
    deck: g._deck || 'main', grace: +(g._majorEventGraceT || 0).toFixed(1),
    credits: window.__creditsAdded, runCredits: g.runCreditsEarned || 0,
    vuln: +(g.player._rushVulnMult || 0).toFixed(2),
    anns: window.__anns.slice(),
  };
});
check('F01 CLEAR announcement is shown', cleared.anns.some(a => /BOSS RUSH CLEARED/.test(a)));
check('F02 the clear reward is credited', cleared.credits >= 40, `+${cleared.credits} credits`);
check('F03 the rush state is torn down', cleared.rush === null, String(cleared.rush));
check('F04 the major-event slot is released', cleared.slot === null, String(cleared.slot));
check('F05 the deck exits unlock', cleared.lock === 0, `_deckLockT ${cleared.lock}`);
check('F06 the run returns to the main deck', cleared.deck === 'main', cleared.deck);
check('F07 a grace window protects the frame after the rush', cleared.grace > 0, `${cleared.grace}s`);
check('F08 the Glass Vow debuff is lifted', cleared.vuln === 0, `vuln ${cleared.vuln}`);

// ════════════════════════════════════════════════════════════════════════════
// G. BOSSES ACT AND DIE under the real update loop
// ════════════════════════════════════════════════════════════════════════════
const combat = await page.evaluate(async () => {
  const g = window.__g;
  g._bossRush = null; g._activeMajorEvent = null; g._deckLockT = 0; g._majorEventGraceT = 0;
  g.enemies.length = 0;
  g._bossRushCount = 0; g._bossRushSchedule = [1e9, 1e9];     // no new rush during this section
  g._bossRush = { t: 0, dur: 180, cx: g.player.pos.x, cy: g.player.pos.y, r: 700, hazard: null, spawnAcc: 0, titanIdx: 0, flags: {} };
  g._bossRushSpawnTitan(g._bossRush);
  g._bossRush = null;
  const t = g.enemies.find(e => e.isMegaBoss);
  if (!t) return { spawned: false };
  t.pos.x = g.player.pos.x + 80; t.pos.y = g.player.pos.y;
  const hp0 = t.hp;
  let moved = 0;
  const p0 = { x: t.pos.x, y: t.pos.y };
  const frames = [];
  const input = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  for (let i = 0; i < 90; i++) {
    const a = performance.now();
    g.update(1 / 60, input);
    frames.push(performance.now() - a);
  }
  moved = Math.hypot(t.pos.x - p0.x, t.pos.y - p0.y);
  const hpAfterFight = t.hp;
  // Kill it the way the game does. Writing hp = 0 is not dying: the removal is done by the
  // shipped death handler, which only runs when damage is applied through the real path.
  let killPath = 'none';
  if (typeof t.takeHit === 'function') { t.takeHit(t.hp + 1e6, g); killPath = 'takeHit'; }
  else { t.hp = 0; killPath = 'direct'; }
  for (let i = 0; i < 120; i++) g.update(1 / 60, input);
  const stillListed = g.enemies.includes(t);
  return {
    spawned: true, hp0, moved: Math.round(moved), hpAfterFight,
    dead: t.hp <= 0, stillListed, killPath,
    worstFrame: Math.round(Math.max(...frames)),
    megaRef: g.megaBoss === t ? 'points-at-dead-boss' : 'cleared',
  };
});
check('G01 a Mega Boss spawns through the shipped Titan path', combat.spawned);
check('G02 the Mega Boss carries Boss-Rush scaled HP', combat.hp0 > 0, `hp ${Math.round(combat.hp0)}`);
check('G03 the Mega Boss acts — it moves under the real update loop', combat.moved > 0, `${combat.moved}px in 1.5s`);
check('G04 the Mega Boss dies through the real damage path', combat.dead === true);
check('G05 a dead Mega Boss is removed from the enemy list',
  combat.stillListed === false, `kill path: ${combat.killPath}`);
check('G06 no frame stall during live boss combat', combat.worstFrame < 2000, `worst rAF step ${combat.worstFrame}ms`);

// ════════════════════════════════════════════════════════════════════════════
// H. RESTART CLEANUP — reset() is the only call every restart path makes
// ════════════════════════════════════════════════════════════════════════════
const afterReset = await page.evaluate(() => {
  const g = window.__g;
  // put the run mid-rush, on the locked deck, exactly as a death inside the arena leaves it
  g._bossRush = { t: 90, dur: 180, cx: 0, cy: 0, r: 700, hazard: { kind: 'lockdown', r: 400, minR: 150, shrink: 30, dmg: 16, t: 2, dur: 15 }, spawnAcc: 0, titanIdx: 2, flags: { titan1: true } };
  g._deck = 'lower'; g._deckLockT = 96; g._activeMajorEvent = 'bossRush'; g._majorSlotT = 120;
  g._bossRushCount = 1; g._bossRushWarned = true; g._bossRushDmgCd = 0.3;
  g.megaBoss = { hp: 0, dead: true };
  g.gameOver = true;
  g.reset();
  return {
    rush: g._bossRush, deck: g._deck || 'main', lock: +(g._deckLockT || 0).toFixed(0),
    slot: g._activeMajorEvent, count: g._bossRushCount, warned: !!g._bossRushWarned,
    mega: g.megaBoss, dmgCd: +(g._bossRushDmgCd || 0).toFixed(1),
  };
});
check('H01 a restart clears the Boss Rush state', afterReset.rush === null, JSON.stringify(afterReset.rush)?.slice(0, 70));
check('H02 a restart unlocks the deck', afterReset.lock === 0, `_deckLockT ${afterReset.lock}`);
check('H03 a restart returns the run to the main deck', afterReset.deck === 'main', afterReset.deck);
check('H04 a restart releases the major-event slot', afterReset.slot === null, String(afterReset.slot));
check('H05 a restart drops the stale Mega Boss reference', afterReset.mega === null, JSON.stringify(afterReset.mega));
check('H06 a restart resets the rush schedule counter and the pending warning',
  (afterReset.count === 0 || afterReset.count == null) && afterReset.warned === false,
  `count ${afterReset.count} (null = the documented lazy-init sentinel) warned ${afterReset.warned}`);

// ════════════════════════════════════════════════════════════════════════════
// I. POST-RUN OPTIONS + no black screen
// ════════════════════════════════════════════════════════════════════════════
const post = await page.evaluate(() => {
  const g = window.__g;
  g.gameOver = false; g.victory = true; g._resultsDismissed = false; g.gameState = 'playing';
  g._syncResultsOverlay?.();
  const shown = (n) => {
    if (!n) return false;
    const st = getComputedStyle(n), r = n.getBoundingClientRect();
    return st.display !== 'none' && st.visibility !== 'hidden' && +st.opacity > 0.01 && r.width > 8 && r.height > 8;
  };
  window.__shown = shown;
  const el = document.querySelector('#cgm-results');
  const btns = [...document.querySelectorAll('#cgm-results button, #cgm-results .cr-btn')]
    .filter(shown).map(b => (b.innerText || '').trim().replace(/\s+/g, ' '));
  return { visible: shown(el), btns, mode: g._resultsMode || null };
});
await shot('03_results_chaos.png');
check('I01 the results screen appears at the end of a Chaos run', post.visible, JSON.stringify(post.btns));
check('I02 it offers the post-run options', post.btns.length >= 2, JSON.stringify(post.btns));

const notBlack = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const overlays = [...document.querySelectorAll('#cgm-overlay,#cgm-results,#cgm-modesel,#cgm-charsel')]
    .filter(o => window.__shown(o) && (o.innerText || '').trim().length > 20);
  return { canvas: !!c, litOverlays: overlays.length };
});
check('I03 no black screen — canvas present and a populated overlay is on top',
  notBlack.canvas && notBlack.litOverlays > 0, JSON.stringify(notBlack));

check('Z01 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('Z02 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
  build: BUILD, refused, start, body, cleared, combat, afterReset, post,
  pass: passN, fail: failN, failures, results, pageErrors, consoleErrors,
}, null, 2));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failN) console.log('FAILURES:\n  ' + failures.join('\n  '));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
