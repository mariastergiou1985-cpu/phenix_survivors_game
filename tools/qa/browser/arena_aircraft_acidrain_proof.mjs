// ════════════════════════════════════════════════════════════════════════════════
// NULL ARENA AIRCRAFT + ACID RAIN — Chromium proof.
//
// A. AIRCRAFT MUST NEVER RUN INSIDE THE NULL BREACH ARENA.
//    Three sources put them there: the arena spawned its own airstrike every ~25-35 s,
//    the ambient AIRSTRIKE was never told about the arena (_majorEventBlocked checks
//    boss rush and the major slot, not the arena), and the GUNSHIP had no major-event
//    gate at all. Proven by running the REAL update methods for simulated minutes
//    inside the arena and requiring zero aircraft, then leaving the arena and
//    requiring the events to come back — a gate that never re-opens is also a bug.
//
// B. ACID RAIN DREW A GREEN SQUARE.
//    Its draw is entirely world-space but was called from the screen-space block, so
//    the haze filled (cam.x, cam.y, viewW, viewH) under an identity transform: a green
//    rectangle pinned at the camera's world coordinate. Proven two ways — the canvas
//    transform in effect during the draw, and PIXELS: during a storm the green wash
//    must be present in all four corners of the canvas (a uniform atmosphere), which
//    a rectangle anchored off-origin cannot satisfy.
//
// Run: node tools/qa/browser/arena_aircraft_acidrain_proof.mjs [port]
// Writes: /tmp/arena_acid_proof/  (report.json + screenshots)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/arena_acid_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 8971;
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
  if (cond) { passN++; console.log(`PASS ${id}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;
console.log(`serving ${ROOT} on ${BASE}   BUILD=${BUILD}`);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);

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

// Record the transform in effect for every fillRect issued from AcidRain.
await page.addInitScript(() => {
  const C = CanvasRenderingContext2D.prototype;
  window.__acidRects = [];
  const oFR = C.fillRect;
  C.fillRect = function (x, y, w, h) {
    try {
      const st = new Error().stack || '';
      if (/AcidRain/.test(st) && Math.abs(w) > 40 && Math.abs(h) > 40) {
        const t = this.getTransform();
        window.__acidRects.push({
          x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
          m: [t.a, t.b, t.c, t.d, t.e, t.f].map(v => +v.toFixed(2)),
          fn: (st.split('\n')[2] || '').trim().replace(/https?:\/\/[^/]+\//, ''),
        });
        if (window.__acidRects.length > 40) window.__acidRects.shift();
      }
    } catch (_) {}
    return oFR.apply(this, arguments);
  };
});

const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
};

const probeCorners = () => page.evaluate(() => {
  const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const cx = o.getContext('2d', { willReadFrequently: true });
  cx.drawImage(c, 0, 0);
  const probe = (x, y) => {
    const d = cx.getImageData(x, y, 24, 24).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return { r: r / n, g: g / n, b: b / n };
  };
  const W = c.width, H = c.height;
  return { W, H, corners: { tl: probe(8, 60), tr: probe(W - 34, 60), bl: probe(8, H - 34), br: probe(W - 34, H - 34) } };
});

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

// real Endless run
await page.evaluate(() => {
  const g = window.__g;
  g.meta._save = () => {};
  if (!g.meta.isEndlessUnlocked()) g.meta.unlockEndless();
  g.selectedCharacter = 'skeleton_warrior';
  g.gameState = 'playing';
  g.reset();
  g._enterEndless();
});
await page.waitForTimeout(2500);
check('A02 a real Endless run is live',
  await page.evaluate(() => window.__g.gameState === 'playing' && !!window.__g.endless));
check('A03 zero page errors at boot', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

// ════════════════════════════════════════════════════════════════════════════
// A. AIRCRAFT vs THE ARENA
// ════════════════════════════════════════════════════════════════════════════

// Baseline: outside the arena the events still fire. A gate that blocks everywhere
// would pass every "no aircraft" check while quietly deleting the event.
const outside = await page.evaluate(() => {
  const g = window.__g;
  g._nullBreachActive = false; g._nullBreachArena = null;
  g._bossRush = null; g._activeMajorEvent = null; g._majorEventGraceT = 0;
  g._majorSalvoGapT = 0;
  g.airstrikeShips.length = 0; g.airstrikeRockets.length = 0; g.gunships.length = 0;
  g._airstrikeTimer = 0.1; g._gunshipTimer = 0.1;
  // Separate loops on purpose: both events share _majorSalvoArm/_majorSalvoBlocked, so
  // driving them together lets whichever fires first starve the other — that is existing
  // designed behaviour, not the gate under test here.
  let spawnedAir = 0, spawnedGun = 0;
  for (let i = 0; i < 60 * 90; i++) {
    g._updateAirstrike(1 / 60);
    if (g.airstrikeShips.length > spawnedAir) spawnedAir = g.airstrikeShips.length;
  }
  g.airstrikeShips.length = 0; g.airstrikeRockets.length = 0;
  g._activeMajorEvent = null; g._majorEventGraceT = 0; g._majorSalvoGapT = 0;
  g._gunshipTimer = 0.1;
  for (let i = 0; i < 60 * 90; i++) {
    g._updateGunship(1 / 60);
    if (g.gunships.length > spawnedGun) spawnedGun = g.gunships.length;
  }
  return { spawnedAir, spawnedGun, allowed: g._aircraftEventsAllowed() };
});
check('B01 outside the arena the AIRSTRIKE still fires', outside.spawnedAir >= 1, JSON.stringify(outside));
check('B02 outside the arena the GUNSHIP still fires', outside.spawnedGun >= 1, JSON.stringify(outside));
check('B03 the gate reports aircraft allowed outside the arena', outside.allowed === true);

// Inside the arena: zero aircraft, for minutes, from every source.
const inside = await page.evaluate(() => {
  const g = window.__g;
  g.airstrikeShips.length = 0; g.airstrikeRockets.length = 0; g.gunships.length = 0;
  g._bossRush = null; g._activeMajorEvent = null; g._majorEventGraceT = 0; g._majorSalvoGapT = 0;
  g._airstrikeTimer = 0.1; g._gunshipTimer = 0.1;                  // both due immediately
  g._nullBreachActive = true;
  g._nullBreachArena = {
    timer: 120, spawnCd: 5, majorCd: 0, miniBossIdx: 0, majorIdx: 0, phase: 0, kills: 0,
    phase1Transmitted: false, midTransmitted: false, finalTransmitted: false,
    center: g.player.pos.clone(), radius: 1100,
  };
  const allowedInside = g._aircraftEventsAllowed();
  let maxAir = 0, maxRockets = 0, maxGun = 0, arenaThrew = null;
  for (let i = 0; i < 60 * 180; i++) {          // 3 simulated minutes
    g._updateAirstrike(1 / 60);
    g._updateGunship(1 / 60);
    try { g._updateNullBreachArena(1 / 60); } catch (e) { arenaThrew = String(e).slice(0, 120); break; }
    maxAir     = Math.max(maxAir, g.airstrikeShips.length);
    maxRockets = Math.max(maxRockets, g.airstrikeRockets.length);
    maxGun     = Math.max(maxGun, g.gunships.length);
    if (!g._nullBreachArena) break;             // arena ended on its own
  }
  // sampled INSIDE the arena, before any teardown the loop above may have reached
  return { maxAir, maxRockets, maxGun, arenaThrew, allowed: allowedInside };
});
check('B04 the arena update runs without throwing', inside.arenaThrew === null, String(inside.arenaThrew));
check('B05 the gate reports aircraft barred inside the arena', inside.allowed === false);
check('B06 zero AIRSTRIKE ships across 3 simulated arena minutes', inside.maxAir === 0, JSON.stringify(inside));
check('B07 zero airstrike rockets inside the arena', inside.maxRockets === 0, JSON.stringify(inside));
check('B08 zero GUNSHIPS inside the arena', inside.maxGun === 0, JSON.stringify(inside));

// An aircraft already airborne when the arena opens must not survive into it.
const boundary = await page.evaluate(() => {
  const g = window.__g;
  g._nullBreachActive = false; g._nullBreachArena = null;
  g.airstrikeShips.length = 0; g.airstrikeRockets.length = 0; g.gunships.length = 0;
  g._activeMajorEvent = null; g._majorEventGraceT = 0; g._majorSalvoGapT = 0;
  g._airstrikeTimer = 0.1;
  for (let i = 0; i < 60 * 20 && g.airstrikeShips.length === 0; i++) g._updateAirstrike(1 / 60);
  for (let i = 0; i < 60 * 6; i++) g._updateAirstrike(1 / 60);      // let it fire a salvo
  const before = { ships: g.airstrikeShips.length, rockets: g.airstrikeRockets.length,
                   slot: g._activeMajorEvent };
  g._enterNullBreachArena();
  const after = { ships: g.airstrikeShips.length, rockets: g.airstrikeRockets.length,
                  slot: g._activeMajorEvent, arena: !!g._nullBreachArena };
  return { before, after };
});
check('B09 the probe really did get a ship in the air first', boundary.before.ships >= 1,
  JSON.stringify(boundary));
check('B10 entering the arena clears in-flight aircraft and ordnance',
  boundary.after.ships === 0 && boundary.after.rockets === 0, JSON.stringify(boundary));
check('B11 entering the arena frees the major-event slot the strike held',
  boundary.after.slot !== 'airstrike', JSON.stringify(boundary));

// Leaving the arena must re-open the gate — a deferred strike, not a deleted one.
const after = await page.evaluate(() => {
  const g = window.__g;
  const heldTimer = g._airstrikeTimer;
  g._nullBreachActive = false; g._nullBreachArena = null;
  g._activeMajorEvent = null; g._majorEventGraceT = 0; g._majorSalvoGapT = 0;
  g.airstrikeShips.length = 0; g.gunships.length = 0;
  // B12 already proves the timer was HELD (not drained). This step is about the GATE
  // re-opening, so arm both timers rather than waiting out a legitimate 2-minute cooldown.
  g._airstrikeTimer = 0.1;
  let air = 0, gun = 0;
  for (let i = 0; i < 60 * 90; i++) {
    g._updateAirstrike(1 / 60);
    air = Math.max(air, g.airstrikeShips.length);
  }
  // separate window again — the two share the salvo lockout by design (see B02)
  g.airstrikeShips.length = 0; g.airstrikeRockets.length = 0;
  g._activeMajorEvent = null; g._majorEventGraceT = 0; g._majorSalvoGapT = 0;
  g._gunshipTimer = 0.1;
  for (let i = 0; i < 60 * 90; i++) {
    g._updateGunship(1 / 60);
    gun = Math.max(gun, g.gunships.length);
  }
  return { heldTimer: +heldTimer.toFixed(2), air, gun, allowed: g._aircraftEventsAllowed() };
});
check('B12 the airstrike timer was HELD during the arena, not drained to a burst',
  after.heldTimer > 0, JSON.stringify(after));
check('B13 leaving the arena lets the AIRSTRIKE fire again', after.air >= 1, JSON.stringify(after));
check('B14 leaving the arena lets the GUNSHIP fire again', after.gun >= 1, JSON.stringify(after));

// The arena no longer references an aircraft timer at all.
const src = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
check('B15 the arena no longer carries its own aircraft cadence', !/airCd/.test(src),
  (src.match(/.*airCd.*/g) || []).slice(0, 2).join(' | '));

// ════════════════════════════════════════════════════════════════════════════
// B. ACID RAIN
// ════════════════════════════════════════════════════════════════════════════
// FRESH RUN. The block above drives the arena and the major-event machinery by hand for
// simulated minutes; starting the storm on top of that state tests the leftovers, not the
// storm. reset() + _enterEndless() is the same path the game uses to begin a run.
await page.evaluate(() => {
  const g = window.__g;
  g.gameState = 'playing';
  g.reset();
  g._enterEndless();
});
// QA AFFORDANCE, not a game change: this bot never moves, and acid puddles plus ordinary
// pressure kill it inside a minute. A dead run makes update() return early, which freezes
// the storm mid-phase and every reading after that is about the corpse, not the event.
await page.evaluate(() => {
  if (window.__hpKeeper) clearInterval(window.__hpKeeper);
  window.__hpKeeper = setInterval(() => {
    const g = window.__g;
    if (!g) return;
    if (g.player) { g.player.hp = g.player.maxHp; g.gameOver = false; g.victory = false; }
    // A level-up / mutation / post-arena screen PAUSES the run by design and dims the
    // scene. Left unanswered it freezes the storm at whatever phase it was in and every
    // pixel reading below becomes a reading of the card panel.
    for (let n = 0; n < 4; n++) {
      if (g.upgradeUI)  { try { g.selectUpgrade(0); }  catch (_) { g.upgradeUI = null; }  continue; }
      if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } continue; }
      if (g._postArenaChoice) { try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = false; } continue; }
      break;
    }
    g.paused = false;
  }, 100);
});
await page.waitForTimeout(2200);
check('C00 the acid-rain block starts from a clean live run',
  await page.evaluate(() => window.__g.gameState === 'playing' && !!window.__g.endless &&
    !window.__g._nullBreachActive && window.__g.acidRainSystem._phase === 'idle'),
  await page.evaluate(() => JSON.stringify({ gs: window.__g.gameState, endless: !!window.__g.endless,
    arena: !!window.__g._nullBreachActive, phase: window.__g.acidRainSystem._phase })));
await page.waitForTimeout(800);            // let the scene settle before the baseline
const baseline = await probeCorners();
await page.evaluate(() => {
  const g = window.__g, a = g.acidRainSystem;
  a._cdLeft = 0; a._warned = false;
  a._enterPhase('warning', 2.0);
  window.__acidRects = [];
});
await page.waitForTimeout(900);
const tele = await page.evaluate(() => ({
  phase: window.__g.acidRainSystem._phase,
  rects: window.__acidRects.slice(-4),
}));
check('C01 the telegraph phase is live', tele.phase === 'warning', tele.phase);
await shot('01_telegraph.png');

await page.waitForTimeout(2200);
await page.evaluate(() => { window.__acidRects = []; });
await page.waitForTimeout(500);
const rain = await page.evaluate(() => {
  const g = window.__g;
  const rects = window.__acidRects.slice();
  const st = g.acidRainSystem.stats();
  return { phase: st.phase, streaks: st.streaks, impacts: st.impacts, puddles: st.puddles,
           rects: rects.slice(-3), n: rects.length,
           viewW: g._viewW, viewH: g._viewH, cam: { x: g.camera.x, y: g.camera.y } };
});
check('C02 the rain phase is live and producing VFX',
  rain.phase === 'raining' && rain.streaks > 0, JSON.stringify({ phase: rain.phase, streaks: rain.streaks }));
check('C03 AcidRain draws under the CAMERA transform, not the identity matrix',
  rain.n > 0 && rain.rects.every(r => r.m[0] !== 1 || r.m[4] !== 0 || r.m[5] !== 0),
  JSON.stringify(rain.rects));
// the world rect must map onto the canvas: x*a + e ≈ 0, w*a ≈ 1280
const mapped = rain.rects.map(r => ({
  sx: +(r.x * r.m[0] + r.m[4]).toFixed(1), sy: +(r.y * r.m[3] + r.m[5]).toFixed(1),
  sw: +(r.w * r.m[0]).toFixed(1), sh: +(r.h * r.m[3]).toFixed(1),
}));
check('C04 the full-view wash maps exactly onto the canvas (no offset square)',
  mapped.length > 0 && mapped.every(m => Math.abs(m.sx) < 4 && Math.abs(m.sy) < 4 &&
    Math.abs(m.sw - 1280) < 8 && Math.abs(m.sh - 720) < 8),
  JSON.stringify(mapped));
await shot('02_raining.png');

// GEOMETRY, NOT PIXELS. A pixel A/B was tried first and abandoned on evidence: with the
// storm forcibly idle, the same two captures 80 ms apart still drifted ~7 green-lead points,
// because scanlines, chromatic aberration, the code rain and the damage pulse all animate
// every frame. That noise is larger than a 0.16-alpha wash, so pixels cannot answer this
// question honestly. The recorded fillRect + its transform can, and answers it exactly:
// map the world rect through the live matrix and check it covers the whole canvas. That IS
// the defect — before the fix the same rect mapped to (747, 420) at 1507x847 under identity,
// a green rectangle hanging off the bottom-right.
const cover = await page.evaluate(() => {
  const c = document.querySelector('canvas#game') || [...document.querySelectorAll('canvas')].find(x => x.width > 400);
  const rs = window.__acidRects.slice(-6);
  return { W: c.width, H: c.height, rs };
});
const mappedAll = cover.rs.map(r => ({
  x0: r.x * r.m[0] + r.m[4], y0: r.y * r.m[3] + r.m[5],
  x1: (r.x + r.w) * r.m[0] + r.m[4], y1: (r.y + r.h) * r.m[3] + r.m[5],
}));
check('C05 the toxic wash covers the whole canvas — every corner is inside it',
  mappedAll.length > 0 && mappedAll.every(m =>
    m.x0 <= 2 && m.y0 <= 2 && m.x1 >= cover.W - 2 && m.y1 >= cover.H - 2),
  JSON.stringify({ canvas: [cover.W, cover.H], mapped: mappedAll.map(m => [m.x0 | 0, m.y0 | 0, m.x1 | 0, m.y1 | 0]) }));
check('C06 it is not an off-origin rectangle: no edge starts inside the canvas',
  mappedAll.every(m => !(m.x0 > 4 || m.y0 > 4 || m.x1 < cover.W - 4 || m.y1 < cover.H - 4)),
  JSON.stringify(mappedAll.map(m => [m.x0 | 0, m.y0 | 0, m.x1 | 0, m.y1 | 0])));

// cleanup at the end of the storm
await page.evaluate(() => {
  const a = window.__g.acidRainSystem;
  a._enterPhase('fading', 0.4);
});
await page.waitForTimeout(1600);
await page.evaluate(() => { window.__acidRects = []; });
await page.waitForTimeout(500);
const done = await page.evaluate(() => {
  const st = window.__g.acidRainSystem.stats();
  return { ...st, drawnAfter: window.__acidRects.length };
});
check('C07 the storm returns to idle', done.phase === 'idle', done.phase);
check('C08 nothing survives the storm — streaks, impacts, particles, puddles all cleared',
  done.streaks === 0 && done.impacts === 0 && done.particles === 0 && done.puddles === 0,
  JSON.stringify(done));
check('C09 nothing is drawn after cleanup', done.drawnAfter === 0, String(done.drawnAfter));
await shot('03_after_cleanup.png');

// And the source-level invariant, from the browser side: the storm must not be drawn from
// the screen-space block ever again.
const gameSrc = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');
const drawFn  = gameSrc.slice(gameSrc.indexOf('  draw(ctx) {'));
const iCall   = drawFn.indexOf('this.acidRainSystem.draw(ctx);');
const iEnd    = drawFn.indexOf('ctx.restore();  // end camera-space block');
check('C10 the draw call lives inside the camera-space block, and only there',
  iCall > 0 && iEnd > 0 && iCall < iEnd &&
  (gameSrc.match(/this\.acidRainSystem\.draw\(ctx\);/g) || []).length === 1,
  JSON.stringify({ iCall, iEnd }));
await page.evaluate(() => { if (window.__hpKeeper) clearInterval(window.__hpKeeper); });

check('D01 zero page errors across the whole session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const gameErrors = consoleErrors.filter(t => !/audio\/music/.test(t));
check('D02 zero game console errors across the whole session', gameErrors.length === 0, gameErrors.slice(0, 3).join(' | '));

fs.writeFileSync(path.join(OUT, 'report.json'),
  JSON.stringify({ build: BUILD, pass: passN, fail: failN, results, mapped: mappedAll, pageErrors, consoleErrors }, null, 1));

console.log(`\n=== RESULT: ${passN} PASS / ${failN} FAIL ===`);
if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
console.log('shots + report: ' + OUT);
await browser.close();
srv.close();
process.exit(failN ? 1 : 0);
