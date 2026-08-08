// ════════════════════════════════════════════════════════════════════════════════
// NULL ARENA SIEGE — a bigger arena, a 360° armored encirclement, and a real way out.
//
// WHAT WAS THERE. The Null Breach Arena was a fixed containment circle: radius 1100, a hard
// vector clamp that snapped the player back inside every frame, and a two-minute boss gauntlet.
// There was no shrinking circle to replace — arena.radius is never written after _placeArena — so
// what actually needed replacing was the WALL: the only way out was the timer.
//
// WHAT SHIPPED. The arena is significantly bigger (1100 -> 1760, still validated by _placeArena),
// the wall is now a ring of twenty armored bodies that closes in slowly, their armor breaks from
// damage and much faster from stun/CC, and cutting three consecutive nodes out of the ring opens
// a hole the clamp stops holding — walk through it and the run keeps the normal arena reward AND
// gains a second relic slot for the rest of the run.
//
//   A-block  THE ARENA — bigger radius, and the siege exists with all twenty slots filled.
//   C-block  CLOSING IN — the ring moves inward, slowly, and never past its floor.
//   R-block  ARMOR — damage eats armor at a fraction; STUN eats a flat chunk and is measurably
//            the faster route; the CC bonus has a refractory window so one freeze is not free.
//   B-block  BREAKOUT — the clamp holds with no hole, yields inside one, and only pays when the
//            player actually goes THROUGH.
//   X-block  THE EXTRA RELIC — granted once, run-scoped, alongside the equipped one, and gone on
//            reset. The normal reward is still paid in full.
//   P-block  PERFORMANCE and cleanup — no node outlives its arena.
//
// Run: node tools/qa/browser/null_arena_siege_proof.mjs [port]
// Writes: /tmp/null_arena_siege_proof/  (report.json + screenshot)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/null_arena_siege_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 9201;
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

const BUILD  = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/BUILD = '(\d+)'/)[1];
const IDX_V  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/main\.js\?v=(\d+)/)[1];
const GAME_V = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').match(/Game\.js\?v=(\d+)/)[1];

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

await page.goto(`http://127.0.0.1:${PORT}/index.html?nosw=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cgm-overlay', { timeout: 20000 });
await page.waitForTimeout(1300);

check('A00 the cache-bust chain agrees on sw.js and index.html', BUILD === IDX_V, `${BUILD} / ${IDX_V}`);
await page.evaluate(async (build) => {
  const mod = await import(`./js/game/Game.js?v=${build}`);
  await new Promise((res) => {
    const orig = mod.Game.prototype.update;
    mod.Game.prototype.update = function (...a) {
      window.__g = this; mod.Game.prototype.update = orig; res(); return orig.apply(this, a);
    };
  });
}, GAME_V);
check('A01 live Game instance captured on the shipped ?v=', await page.evaluate(() => !!window.__g));
check('A02 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await page.evaluate(() => {
  const g = window.__g;
  g.meta._save = () => {};
  g.audio = new Proxy({}, { get: () => () => {} });
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__err = null;
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      if (g.player) g.player.hp = g.player.maxHp;      // the siege deals contact damage
      try { g.update(1 / 60, window.__IN); } catch (e) { window.__err = String(e); }
    }
  };
  window.__ctx = () => (document.querySelector('canvas#game') ||
    [...document.querySelectorAll('canvas')].find(x => x.width > 400)).getContext('2d');
  try { g._hideCharSelectOverlay?.(); } catch (_) {}
  try { g._hideMenuOverlay?.(); } catch (_) {}
  for (const s of ['#cgm-charselect', '#cgm-collection', '#cgm-chaos-law-sel']) {
    const n = document.querySelector(s); if (n) n.remove();
  }

  // Open a REAL arena through the shipped entry point, then freeze its own two-minute timer so
  // the siege can be studied without the gauntlet ending the test out from under it.
  window.__arena = () => {
    g.selectedCharacter = 'skeleton_warrior';
    g.gameState = 'playing'; g.endless = true; g._chaosMode = false;
    g.gameOver = false; g.victory = false; g.paused = false;
    g.upgradeUI = null; g.mutationUI = null;
    g._breakoutRelic = null;
    // Tear the PREVIOUS siege down through the shipped path first. Nulling the arena alone leaked
    // every node into g.enemies; after a few blocks enemyCap() refused new spawns and the ring
    // came up empty, which failed six checks against working code.
    try { g._clearSiege?.(); } catch (_) {}
    g.enemies.length = 0;
    g._nullBreachArena = null; g._nullBreachActive = false;
    g._postArenaChoice = null;
    try { g._enterEndless?.(); } catch (_) {}
    window.__step(4);
    g._endlessStartedAt = g.timeAlive;
    try { g._enterNullBreachArena(); } catch (e) { window.__err = String(e); }
    return !!g._nullBreachArena;
  };
  window.__freezeTimer = () => { if (g._nullBreachArena) g._nullBreachArena.timer = 9999; };
  window.__a = () => g._nullBreachArena;
  window.__siege = () => {
    const a = g._nullBreachArena;
    if (!a || !a.siege) return null;
    const live = a.siege.nodes.filter(Boolean);
    return {
      slots: a.siege.nodes.length, live: live.length, k: a.siege.k,
      radius: a.radius, rx: a.rx, ry: a.ry,
      armor: live.map(e => e._siege.armor),
      wrapped: live.every(e => e._siegeTakeHitWrapped === true),
      inEnemies: live.every(e => g.enemies.includes(e)),
      gapNodes: a.gapNodes || 0, gapAngle: a.gapAngle, gapHalf: a.gapHalfWidth || 0,
      brokeOut: !!a.brokeOut,
    };
  };
  // Kill node slots i..j so a controlled hole can be opened.
  window.__killNodes = (from, count) => {
    const a = g._nullBreachArena;
    if (!a || !a.siege) return 0;
    let n = 0;
    for (let k = 0; k < count; k++) {
      const e = a.siege.nodes[(from + k) % a.siege.nodes.length];
      if (!e) continue;
      e.hp = 0;
      const i = g.enemies.indexOf(e);
      if (i >= 0) g.enemies.splice(i, 1);
      n++;
    }
    window.__step(1);
    return n;
  };
  window.__pos = () => ({ x: g.player.pos.x, y: g.player.pos.y });
  // Positions are given in ELLIPSE space now: rFrac is the normalised distance to the boundary,
  // so 0.95 is 95% of the way out along whatever axis `ang` points down.
  window.__put = (ang, rFrac) => {
    const a = g._nullBreachArena;
    if (!a) return;
    g.player.pos.x = a.center.x + Math.cos(ang) * (a.rx || a.radius) * rFrac;
    g.player.pos.y = a.center.y + Math.sin(ang) * (a.ry || a.radius) * rFrac;
  };
  // Normalised ellipse distance — 1.0 is exactly the wall.
  window.__distC = () => {
    const a = g._nullBreachArena;
    if (!a || typeof g._arenaNorm !== 'function') return -1;
    return g._arenaNorm(g.player.pos.x, g.player.pos.y);
  };
});

// ════════════════════════════════════════════════════════════════════════════
// A. THE ARENA
// ════════════════════════════════════════════════════════════════════════════
const start = await page.evaluate(() => {
  const ok = window.__arena();
  window.__freezeTimer();
  const atSpawn = window.__siege();          // BEFORE any frame runs
  window.__step(2);
  return { ok, atSpawn, s: window.__siege(), err: window.__err };
});
// THE ARENA SIZE IS CAPPED BY THE MAP, NOT BY THIS COMMIT — and the check now says so instead of
// pretending. _arenaFitRadius() clamps every arena to half the walkable band minus padding, and
// the Endless band is 615 px, so the fit is ~250 whether the request is 1100 or 1760. The old
// arena was ALREADY 250 there. Raising the constant therefore changes nothing in Endless, which is
// exactly where the arena occurs — reported to Maria rather than papered over. A03 asserts the two
// facts that ARE true: the request grew, and the fit is the band's cap and not something the siege
// broke. Making the arena genuinely bigger needs elliptical geometry (wide on X, band-capped on Y)
// and is a separate decision.
const fit = await page.evaluate(() => {
  const g = window.__g;
  const b = g.getWalkableBounds?.() || null;
  return { fit1100: g._arenaFitRadius(1100), fit1760: g._arenaFitRadius(1760),
           band: b ? Math.round(b.y1 - b.y0) : null };
});
check('A03 the arena is an ELLIPSE — wide on the unbounded axis, band-capped on the bound one',
  start.ok && start.s && start.s.rx > start.s.ry * 4 && start.s.ry === fit.fit1100,
  JSON.stringify({ rx: start.s?.rx, ry: start.s?.ry, bandCap: fit.fit1100, walkableBandPx: fit.band }));
check('A03b the playable AREA is SIGNIFICANTLY bigger than the circle it replaced',
  start.s && (start.s.rx * start.s.ry) >= (fit.fit1100 * fit.fit1100) * 4,
  start.s ? `area x${((start.s.rx * start.s.ry) / (fit.fit1100 * fit.fit1100)).toFixed(1)} vs the old circle`
          : 'no siege on this build');
check('A04 a full 360 degree siege exists — twenty slots, every one filled',
  start.s && start.s.slots === 20 && start.s.live === 20, JSON.stringify({ slots: start.s?.slots, live: start.s?.live }));
check('A05 the nodes are REAL enemies in the shipped enemy list, so every weapon reaches them',
  start.s && start.s.inEnemies === true && start.s.wrapped === true,
  JSON.stringify({ inEnemies: start.s?.inEnemies, armorWrapped: start.s?.wrapped }));
check('A06 every node starts fully armored',
  start.atSpawn && start.atSpawn.armor.length === 20 && start.atSpawn.armor.every(a => a === 240),
  JSON.stringify({ n: start.atSpawn?.armor.length, armor: start.atSpawn?.armor }));

const spread = await page.evaluate(() => {
  const a = window.__a();
  if (!a || !a.siege) return { minGap: -1, maxGap: -1, rMin: -1, rMax: -1, absent: true };
  const live = a.siege.nodes.filter(Boolean);
  const _rx = a.rx || a.radius, _ry = a.ry || a.radius;
  const angs = live.map(e => Math.atan2((e.pos.y - a.center.y) / _ry, (e.pos.x - a.center.x) / _rx))
                   .map(x => (x + Math.PI * 2) % (Math.PI * 2)).sort((p, q) => p - q);
  let minGap = Infinity, maxGap = 0;
  for (let i = 0; i < angs.length; i++) {
    const d = (angs[(i + 1) % angs.length] - angs[i] + Math.PI * 2) % (Math.PI * 2);
    minGap = Math.min(minGap, d); maxGap = Math.max(maxGap, d);
  }
  // Radii are measured in ELLIPSE space, where an even ring is a constant value.
  const rs = live.map(e => window.__g._arenaNorm(e.pos.x, e.pos.y) * 100);
  return { minGap, maxGap, rMin: Math.min(...rs), rMax: Math.max(...rs) };
});
check('A07 the ring is EVEN — the nodes surround the player instead of clumping',
  !spread.absent && Math.abs(spread.maxGap - spread.minGap) < 0.02 && (spread.rMax - spread.rMin) < 2,
  `gap ${spread.minGap.toFixed(3)}..${spread.maxGap.toFixed(3)} rad, r ${spread.rMin.toFixed(0)}..${spread.rMax.toFixed(0)}`);

// ════════════════════════════════════════════════════════════════════════════
// C. CLOSING IN
// ════════════════════════════════════════════════════════════════════════════
const closing = await page.evaluate(() => {
  const a = window.__a();
  if (!a || !a.siege) return { r0: -1, r1: -1, r2: -1, floor: 0, radius: 0, absent: true };
  const ry = a.ry || a.radius;
  const r0 = a.siege.k * ry;
  window.__step(300);                    // 5 seconds
  const r1 = a.siege.k * ry;
  window.__step(60 * 200);               // long enough to reach the floor
  const r2 = a.siege.k * ry;
  return { r0, r1, r2, floor: ry * 0.24, radius: a.radius };
});
check('C01 the siege closes INWARD, and slowly — a few dozen px over five seconds, not a snap',
  !closing.absent && closing.r1 < closing.r0 && (closing.r0 - closing.r1) > 10 && (closing.r0 - closing.r1) < 60,
  `${closing.r0.toFixed(0)} -> ${closing.r1.toFixed(0)} in 5 s`);
check('C02 it never closes past its floor — the centre is not crushed',
  !closing.absent && closing.r2 >= closing.floor - 1, `r=${closing.r2.toFixed(0)} floor=${closing.floor.toFixed(0)}`);

// ════════════════════════════════════════════════════════════════════════════
// R. ARMOR: damage vs stun
// ════════════════════════════════════════════════════════════════════════════
const armorDmg = await page.evaluate(() => {
  window.__arena(); window.__freezeTimer(); window.__step(2);
  const a = window.__a();
  if (!a || !a.siege) return { a0: -1, a1: -1, hp0: -1, hp1: -1, absent: true };
  const e = a.siege.nodes.find(Boolean);
  if (!e) return { a0: -1, a1: -1, hp0: -1, hp1: -1, absent: true };
  const s = e._siege;
  const a0 = s.armor, hp0 = e.hp;
  e.takeHit(100, window.__g);                  // one 100-damage hit through the SHIPPED takeHit
  return { a0, a1: s.armor, hp0, hp1: e.hp };
});
check('R01 damage EATS armor at a fraction, and part of the hit still reaches the body',
  armorDmg.a0 - armorDmg.a1 === 55 && armorDmg.hp1 < armorDmg.hp0,
  JSON.stringify(armorDmg));

const armorStun = await page.evaluate(() => {
  window.__arena(); window.__freezeTimer(); window.__step(2);
  const a = window.__a();
  if (!a || !a.siege || !a.siege.nodes.find(Boolean)) {
    return { a0: -1, a1: -1, perApplication: -1, applicationsPerSecond: 99, armorLeft: -1, absent: true };
  }
  const e = a.siege.nodes.find(Boolean);
  const s = e._siege;
  const a0 = s.armor;
  e.stunned = 3.0;                       // a single CC application
  window.__step(1);
  const a1 = s.armor;
  // Hold the stun for a full second: the refractory window must limit how often it pays.
  let applications = 0, prev = a1;
  for (let i = 0; i < 60; i++) { e.stunned = 3.0; window.__step(1); if (s.armor < prev) { applications++; prev = s.armor; } }
  return { a0, a1, perApplication: a0 - a1, applicationsPerSecond: applications, armorLeft: s.armor };
});
check('R02 STUN eats a flat chunk of armor — measurably more per application than damage does',
  armorStun.perApplication === 85 && armorStun.perApplication > 55, JSON.stringify(armorStun));
check('R03 the CC bonus has a REFRACTORY window — a held freeze cannot delete the ring for free',
  armorStun.applicationsPerSecond <= 3, `${armorStun.applicationsPerSecond} applications in 1 s`);

const efficiency = await page.evaluate(() => {
  // The claim is "more EFFECTIVE from stun/CC". Measured as: how much raw damage would be needed
  // to strip one node's armor, versus how many CC applications.
  window.__arena(); window.__freezeTimer(); window.__step(2);
  const a = window.__a();
  const nodes = (a && a.siege) ? a.siege.nodes.filter(Boolean) : [];
  if (nodes.length < 2) return { dmgDealt: -1, ccApps: -1, dmgHits: -1, absent: true };
  const byDmg = nodes[0], byCc = nodes[1];
  let dmgDealt = 0;
  while (byDmg._siege.armor > 0 && dmgDealt < 100000) { byDmg.takeHit(20, window.__g); dmgDealt += 20; }
  let ccApps = 0;
  while (byCc._siege.armor > 0 && ccApps < 200) {
    byCc._siege.stunCd = 0; byCc.stunned = 2.0; window.__step(1); ccApps++;
  }
  return { dmgDealt, ccApps, dmgHits: dmgDealt / 20 };
});
check('R04 CC strips a plate in a THIRD of the hits raw damage needs — the efficient route',
  efficiency.ccApps > 0 && efficiency.ccApps * 3 <= efficiency.dmgHits,
  `${efficiency.ccApps} CC applications vs ${efficiency.dmgHits} damage hits`);

const breachState = await page.evaluate(() => {
  window.__arena(); window.__freezeTimer(); window.__step(2);
  const a = window.__a();
  const e = (a && a.siege) ? a.siege.nodes.find(Boolean) : null;
  if (!e) return { armorGone: -1, hpMid: -1, hpAfter: -1, full: -1, absent: true };
  const hp0 = e.hp;
  while (e._siege.armor > 0) e.takeHit(50, window.__g);
  const armorGone = e._siege.armor;
  const hpMid = e.hp;
  e.takeHit(100, window.__g);                  // once breached the body takes it in FULL
  return { armorGone, hpMid, hpAfter: e.hp, full: hpMid - e.hp };
});
check('R05 once the plate is gone the body takes damage in FULL — a breached node is killable',
  breachState.armorGone === 0 && breachState.full === 100, JSON.stringify(breachState));

// ════════════════════════════════════════════════════════════════════════════
// B. BREAKOUT
// ════════════════════════════════════════════════════════════════════════════
const walled = await page.evaluate(() => {
  window.__arena(); window.__freezeTimer(); window.__step(2);
  const a = window.__a();
  const before = window.__siege();
  // 1.4x the boundary, not 3x. A 3x teleport is 4800 px on the wide axis, which lands outside the
  // deck the arena was placed on and tears the whole arena down through a path that has nothing to
  // do with the clamp — the check was measuring the wrong thing. The claim here is "the wall
  // holds", and a player who walks into it is a step past the boundary, not a kilometre.
  window.__put(0, 1.4);
  window.__step(2);
  const after = window.__siege();
  return { dist: window.__distC(), radius: a.radius, brokeOut: !!a.brokeOut,
           liveBefore: before ? before.live : -1, liveAfter: after ? after.live : -1,
           gapBefore: before ? before.gapNodes : -1, gapAfter: after ? after.gapNodes : -1,
           arenaGone: !window.__a() };
});
check('B01 with NO hole the clamp still holds — the arena is a containment, not a suggestion',
  walled.dist > 0 && walled.dist <= 1.0 && walled.brokeOut === false, JSON.stringify(walled));

const tooSmall = await page.evaluate(() => {
  window.__arena(); window.__freezeTimer(); window.__step(2);
  const a = window.__a();
  const killed = window.__killNodes(0, 2);          // TWO nodes: below the three-node threshold
  const s = window.__siege();
  if (!s) return { killed: -1, gapNodes: -1, dist: -1, radius: 0, brokeOut: true, absent: true };
  window.__put(0, 1.4);   // one step past the wall, not a kilometre — see B01
  window.__step(2);
  return { killed, gapNodes: s.gapNodes, dist: window.__distC(), radius: a.radius, brokeOut: !!a.brokeOut };
});
check('B02 a hole of TWO nodes is not a passage — the clamp still holds and nothing is paid',
  tooSmall.killed === 2 && tooSmall.dist > 0 && tooSmall.dist <= 1.0 && tooSmall.brokeOut === false,
  JSON.stringify(tooSmall));

const holeButInside = await page.evaluate(() => {
  window.__arena(); window.__freezeTimer(); window.__put(Math.PI, 0.05); window.__step(2);
  const a = window.__a();
  window.__killNodes(0, 4);
  const s = window.__siege();
  if (!s) return { gapNodes: -1, brokeOut: true, relic: 'ARENA GONE' };
  window.__put(s.gapAngle, 0.30);                   // hole is open, but the player stays in the middle
  window.__step(30);
  return { gapNodes: s.gapNodes, brokeOut: !!window.__a()?.brokeOut,
           relic: window.__g ? window.__g._breakoutRelic : 'n/a' };
});
check('B03 cutting the hole is not enough — standing in the middle pays NOTHING',
  holeButInside.gapNodes >= 3 && holeButInside.brokeOut === false && !holeButInside.relic,
  JSON.stringify(holeButInside));

const through = await page.evaluate(() => {
  const g = window.__g;
  window.__arena(); window.__freezeTimer(); window.__put(Math.PI, 0.05); window.__step(2);
  window.__killNodes(0, 4);
  const s = window.__siege();
  if (!s) return { gapNodes: -1, arenaGone: true, relic: null, pfBefore: 0, pfAfter: 0,
                   scoreGain: 0, panel: false, enemiesWithSiege: -1 };
  const pf = g.meta.getProtocolFragments ? g.meta.getProtocolFragments() : 0;
  const score0 = g.score;
  window.__put(s.gapAngle, 0.95);                   // walk OUT through the hole
  window.__step(3);
  return { gapNodes: s.gapNodes, arenaGone: !g._nullBreachArena,
           relic: g._breakoutRelic || null,
           pfBefore: pf, pfAfter: g.meta.getProtocolFragments ? g.meta.getProtocolFragments() : 0,
           scoreGain: g.score - score0, panel: !!g._postArenaChoice,
           enemiesWithSiege: g.enemies.filter(e => e && e._siege).length };
});
check('B04 walking THROUGH the hole breaks the siege',
  through.gapNodes >= 3 && through.arenaGone === true, JSON.stringify(through));
check('B05 the NORMAL arena reward is still paid in full — fragments, score and the post-arena panel',
  through.pfAfter > through.pfBefore && through.scoreGain >= 2000 && through.panel === true,
  JSON.stringify({ pf: `${through.pfBefore}->${through.pfAfter}`, score: through.scoreGain, panel: through.panel }));
check('B06 no siege node outlives the arena that owned it',
  through.enemiesWithSiege === 0, `${through.enemiesWithSiege} left`);

// ════════════════════════════════════════════════════════════════════════════
// X. THE EXTRA RELIC
// ════════════════════════════════════════════════════════════════════════════
check('X01 a successful breakout grants ONE extra relic',
  !!through.relic, String(through.relic));

const relicSlot = await page.evaluate(() => {
  const g = window.__g;
  const extra = g._breakoutRelic;
  const equipped = g.meta.getEquippedRelic ? g.meta.getEquippedRelic() : null;
  return {
    extra, equipped,
    extraOn: g._relicOn(extra),
    equippedStillOn: equipped ? g._relicOn(equipped) : null,
    distinct: extra !== equipped,
    // The extra relic must NOT have been written into the save — it is a run-scoped slot.
    inSave: !!(g.meta.relics && g.meta.relics[extra] === true && !g.meta.isRelicUnlocked?.(extra)),
    savedEquip: g.meta.equippedRelic,
  };
});
check('X02 the extra relic is used ALONGSIDE the first — both read as ON at the same time',
  relicSlot.extraOn === true && relicSlot.distinct === true &&
  (relicSlot.equipped === null || relicSlot.equippedStillOn === true),
  JSON.stringify(relicSlot));
check('X03 it did NOT change the equipped relic and did not touch the save',
  relicSlot.savedEquip === relicSlot.equipped, JSON.stringify({ savedEquip: relicSlot.savedEquip, equipped: relicSlot.equipped }));

const once = await page.evaluate(() => {
  const g = window.__g;
  const first = g._breakoutRelic;
  if (typeof g._grantBreakoutRelic !== 'function') return { first: null, granted: true, after: null };
  const granted = g._grantBreakoutRelic();          // a second breakout must not stack slots
  return { first, granted, after: g._breakoutRelic };
});
check('X04 only ONE extra slot per run — a second breakout cannot stack another',
  once.granted === false && once.after === once.first, JSON.stringify(once));

const scoped = await page.evaluate(() => {
  const g = window.__g;
  const before = g._breakoutRelic;
  try { g.reset(); } catch (e) { window.__err = String(e); }
  return { before, after: g._breakoutRelic || null };
});
check('X05 the slot is RUN-SCOPED — reset() clears it, so it never leaks into the next run',
  !!scoped.before && scoped.after === null, JSON.stringify(scoped));

// ════════════════════════════════════════════════════════════════════════════
// P. PERFORMANCE + DRAW
// ════════════════════════════════════════════════════════════════════════════
const perf = await page.evaluate(() => {
  window.__err = null;
  window.__arena(); window.__freezeTimer(); window.__step(4);
  const t0 = performance.now();
  window.__step(600);                                // ten seconds of a full live siege
  const ms = performance.now() - t0;
  const s = window.__siege();
  return { ms, perFrame: ms / 600, live: s ? s.live : -1, err: window.__err };
});
check('P01 ten seconds of a full twenty-node siege stays inside frame budget',
  perf.err === null && perf.perFrame < 16.7, `${perf.perFrame.toFixed(2)} ms/frame over 600 frames`);

const draw = await page.evaluate(() => {
  const g = window.__g;
  window.__arena(); window.__freezeTimer(); window.__put(Math.PI, 0.05); window.__step(4);
  window.__killNodes(5, 4);                          // an open hole, so its arc draws too
  window.__put(0, 0.2);
  window.__step(4);
  g.gameState = 'playing'; g.gameOver = false;
  let err = null;
  try { g.draw(window.__ctx()); } catch (e) { err = String(e); }
  const ctx = window.__ctx();
  const d = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
  let sum = 0, max = 0; const colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += v; if (v > max) max = v;
    colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  }
  const n = Math.floor(d.length / (4 * 97));
  return { err, state: g.gameState, mean: sum / n, max, colors: colors.size };
});
const { data: shot } = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(OUT, 'siege.png'), Buffer.from(shot, 'base64'));
check('D01 a live siege with an open hole renders — no black screen',
  draw.err === null && draw.state === 'playing' && draw.mean > 3 && draw.max > 40 && draw.colors > 30,
  JSON.stringify(draw));
check('D02 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
check('D03 zero console errors across the whole session', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log(`\n${passN} PASS / ${failN} FAIL`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + f); }
fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, failures }, null, 2));
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
