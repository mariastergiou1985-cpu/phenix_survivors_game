// ════════════════════════════════════════════════════════════════════════════════
// EDDIE'S FALLING RAIN — around him, following him, landing as homing notes.
//
// WHAT WAS WRONG, measured before anything was written. Eddie's falling strikes did not fall
// around Eddie at all: _fireGuitarWave placed each one at
//   camera.x + randomRange(30, _viewW - 30),  camera.y + randomRange(...)
// i.e. an ABSOLUTE point in camera space. So the curtain landed wherever the camera happened to
// be, and once placed it stayed pinned there while Eddie walked away. The ultimate's SOLO bolts
// had the opposite problem — they teleported onto a random live enemy anywhere on screen, so they
// had no relationship to Eddie either. Nothing turned into anything on landing.
//
// Maria chose to fix BOTH falling systems, so this file checks both:
//   R-block  THE RING — strikes land inside a ring measured from Eddie, in Act 1, Endless AND
//            Chaos, and an in-flight strike FOLLOWS him when he moves.
//   N-block  THE NOTES — a landed strike becomes a homing note that closes on a target, deals
//            its damage ONCE and then disappears. Capped.
//   S-block  THE STUN TIERS — normal full, elite reduced, boss small stagger, and NO STUN-LOCK:
//            a burst of notes cannot chain a boss's stagger windows end to end.
//   U-block  THE ULTIMATE — its bolts land in a ring around Eddie too, and spawn notes.
//   P-block  PERFORMANCE — a full solo under a heavy crowd stays inside frame budget and the
//            note array stays capped.
//   C-block  CONTROL — damage numbers, cooldowns and the ultimate's own cost/mana are untouched.
//
// Run: node tools/qa/browser/eddie_rain_notes_proof.mjs [port]
// Writes: /tmp/eddie_rain_notes_proof/  (report.json + screenshot)
// ════════════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT  = '/tmp/eddie_rain_notes_proof';
fs.mkdirSync(OUT, { recursive: true });

const PORT = Number(process.argv[2]) || 9101;
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
// Read every module stamp from the file that DECLARES it — BUILD and the Game.js stamp are allowed
// to differ, and assuming otherwise hung a proof earlier this session.
const GAME_V = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8').match(/Game\.js\?v=(\d+)/)[1];
const SRC    = fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8');

let passN = 0, failN = 0;
const failures = [], results = [];
const check = (id, cond, extra) => {
  results.push({ id, pass: !!cond, extra: extra ?? null });
  if (cond) { passN++; console.log(`PASS ${id}${extra ? '  ' + extra : ''}`); }
  else { failN++; failures.push(id + (extra ? ' :: ' + extra : '')); console.log(`FAIL ${id}${extra ? ' :: ' + extra : ''}`); }
};

// ── source-level check, run before the browser opens ────────────────────────
{
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');   // strip comments; a loose pattern matching my
                                                   // own prose has produced false passes before
  // Scoped to _fireGuitarWave's OWN body. A whole-file scan failed, and it was right to: the
  // same expression also lives in _updateRedThunderCurtain, which is the DEAD pre-Feedback
  // ultimate (_redCurtain is never assigned, so that method never runs). Not this commit's
  // business, and reported rather than quietly swept into the pattern.
  const _fw = code.slice(code.indexOf('_fireGuitarWave(lvl) {'));
  const _fwBody = _fw.slice(0, _fw.indexOf('\n  }'));
  check('X01 the absolute camera-space placement is GONE from _fireGuitarWave',
    _fwBody.length > 200 &&
    !/camera\.x \+ randomRange\(30, this\._viewW - 30\)/.test(_fwBody) &&
    /EDDIE_RAIN\.rIn/.test(_fwBody) && /ox:/.test(_fwBody),
    'body=' + _fwBody.length + 'ch ring=' + /EDDIE_RAIN\.rIn/.test(_fwBody));
  check('X02 the rain table is defined exactly once and carries all three stun tiers',
    (code.match(/const EDDIE_RAIN = \{/g) || []).length === 1 &&
    /stunNormal:/.test(code) && /stunElite:/.test(code) && /stunBoss:/.test(code) &&
    /cdNormal:/.test(code) && /cdElite:/.test(code) && /cdBoss:/.test(code),
    'decls=' + (code.match(/const EDDIE_RAIN = \{/g) || []).length);
}

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
  window.__IN = { keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false };
  window.__clearErr = () => { window.__err = null; };
  // A no-op audio surface. `g.audio = g.audio || {}` was not enough: optional CALL syntax
  // (a?.b()) still throws when b is missing, so playLevelUp blew up mid-ultimate and its error
  // then failed a LATER perf check through the sticky __err.
  window.__muteAudio = () => {
    const g = window.__g;
    g.audio = new Proxy({}, { get: () => () => {} });
  };
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.upgradeUI) g.upgradeUI = null;
      if (g.mutationUI) g.mutationUI = null;
      if (g.player) g.player.hp = g.player.maxHp;
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

  // A real Eddie run in whichever mode is asked for. Nothing about the rain reads a mode flag,
  // which is the point of R02 — the same code path has to serve all three.
  window.__eddie = (mode) => {
    g.selectedCharacter = 'eddie';
    g.gameState = 'playing';
    g.endless = (mode !== 'act1');
    g._chaosMode = (mode === 'chaos');
    if (mode === 'chaos') { g.runChaosLaw = null; try { g._beginChaosRun(); } catch (_) {} }
    else { try { g._enterEndless?.(); } catch (_) {} }
    g.gameOver = false; g.victory = false; g.paused = false;
    g.upgradeUI = null; g.mutationUI = null;
    if (g.player) g.player.selectedCharacter = 'eddie';
    g._goldStrikes.length = 0; g._guitarNotes.length = 0;
    if (g._eddieNotes) g._eddieNotes.length = 0;
    window.__step(6);
    if (g.player) g.player.selectedCharacter = 'eddie';
  };

  // Fire ONE guitar wave through the SHIPPED path.
  window.__wave = (lvl = 1) => {
    g._goldStrikes.length = 0;
    if (g._eddieNotes) g._eddieNotes.length = 0;
    g._fireGuitarWave(lvl);
    return g._goldStrikes.length;
  };

  window.__ringStats = () => {
    const p = g.player.pos;
    const rs = g._goldStrikes.map(b => Math.hypot(b.x - p.x, (b.gy - p.y) / 0.9));
    return { n: rs.length, min: Math.min(...rs), max: Math.max(...rs),
             hasOffset: g._goldStrikes.every(b => b.ox !== undefined) };
  };

  // A controllable dummy enemy that speaks the shipped enemy contract.
  window.__dummy = (dx, dy, opts = {}) => {
    // A REAL Vec2, cloned off the player. My first version used a plain object literal, and
    // utils.distance() calls a.distanceTo — so the dummy threw inside _brawlerTargets and inside
    // _tickVesselRockets, aborting update() before the strike loop could ever spawn a note. Six
    // checks "failed" against code that was fine. Mine, not the game's.
    const p = g.player.pos;
    const pos = p.clone(); pos.x = p.x + dx; pos.y = p.y + dy;
    const vel = p.clone(); vel.x = 0; vel.y = 0;
    const e = {
      pos, vel,
      hp: opts.hp || 100000, maxHp: opts.hp || 100000, radius: 18,
      stunned: 0, isElite: !!opts.elite, isMegaBoss: !!opts.mega,
      hits: 0, dmg: 0,
      isBoss: () => !!opts.boss || !!opts.mega,
      takeHit(d) { this.hits++; this.dmg += d; return false; },
      // The methods _updateEnemies actually calls on every entry. Adding them one crash at a
      // time is how a fake ends up silently diverging from the real contract, so they are all
      // here: update / keepInBounds / draw, plus the flags the cull and LOD paths read.
      update() {}, keepInBounds() {}, draw() {},
      _lodSkip: 0, _aiStepX: 0, _aiStepY: 0,
      applyStatus() {}, onDeath() {},
    };
    g.enemies.push(e);
    try { g._spatialGrid?.rebuild?.(g.enemies); } catch (_) {}
    return e;
  };
  window.__clearEnemies = () => { g.enemies.length = 0; try { g._spatialGrid?.rebuild?.(g.enemies); } catch (_) {} };
  window.__notes = () => (g._eddieNotes || []).length;
  window.__strikes = () => g._goldStrikes.length;
});

// ════════════════════════════════════════════════════════════════════════════
// R. THE RING
// ════════════════════════════════════════════════════════════════════════════
const rings = await page.evaluate(() => {
  const out = {};
  for (const mode of ['act1', 'endless', 'chaos']) {
    window.__eddie(mode);
    window.__clearEnemies();
    const n = window.__wave(3);
    out[mode] = Object.assign({ spawned: n }, window.__ringStats());
  }
  return out;
});
check('R01 every strike lands inside the ring measured from EDDIE, not at a camera point',
  ['act1', 'endless', 'chaos'].every(m => rings[m].spawned > 0 &&
    rings[m].min >= 80 && rings[m].max <= 460 && rings[m].hasOffset === true),
  JSON.stringify(Object.fromEntries(Object.entries(rings).map(([k, v]) =>
    [k, `n=${v.spawned} r=${v.min.toFixed(0)}..${v.max.toFixed(0)}`]))));
check('R02 the SAME path serves Act 1, Endless and Chaos — no mode branch in the rain',
  ['act1', 'endless', 'chaos'].every(m => rings[m].spawned === rings.act1.spawned),
  JSON.stringify(['act1', 'endless', 'chaos'].map(m => m + ':' + rings[m].spawned)));

const follow = await page.evaluate(() => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  window.__wave(3);
  const p = g.player.pos;
  const before = g._goldStrikes.map(b => ({ x: b.x, y: b.gy }));
  const rBefore = before.map(s => Math.hypot(s.x - p.x, (s.y - p.y) / 0.9));
  // Teleport Eddie a long way. An in-flight strike must come WITH him.
  g.player.pos.x += 900; g.player.pos.y -= 420;
  window.__step(1);
  const after = g._goldStrikes.map(b => ({ x: b.x, y: b.gy }));
  const rAfter = after.map(s => Math.hypot(s.x - g.player.pos.x, (s.y - g.player.pos.y) / 0.9));
  const moved = before.length && after.length
    ? Math.hypot(after[0].x - before[0].x, after[0].y - before[0].y) : 0;
  return { n: after.length, moved,
           rBefore: rBefore.length ? Math.max(...rBefore) : -1,
           rAfter:  rAfter.length  ? Math.max(...rAfter)  : -1 };
});
check('R03 an IN-FLIGHT strike follows Eddie — it moves with him and keeps its ring offset',
  follow.n > 0 && follow.moved > 500 && follow.rAfter <= 460 && Math.abs(follow.rAfter - follow.rBefore) < 2,
  JSON.stringify(follow));

// ════════════════════════════════════════════════════════════════════════════
// N. THE NOTES
// ════════════════════════════════════════════════════════════════════════════
const notes = await page.evaluate(() => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  const e = window.__dummy(260, 0);
  window.__wave(3);
  const strikes = g._goldStrikes.length;
  window.__step(30);                       // let them fall (fall = 0.34 s ≈ 21 frames)
  const spawned = window.__notes();
  const hitsAtLanding = e.hits;
  const hitsAfterStrikes = (() => {
    while (window.__strikes() > 0) window.__step(1);   // every strike has landed and been removed
    return e.hits;
  })();
  window.__step(60);
  const midHits = e.hits;
  // Long enough that every note has either connected or expired: noteLife is 2.6 s = 156 frames.
  // The first version stepped 80 and 2 notes were still in flight — my count, not a leak.
  window.__step(200);
  return { strikes, spawned, hitsAtLanding, hitsAfterStrikes, hits: e.hits, midHits, dmg: e.dmg,
           left: window.__notes(), stunned: e.stunned };
});
check('N01 a landed strike becomes a homing note',
  notes.strikes > 0 && notes.spawned > 0, JSON.stringify(notes));
check('N02 the notes CLOSE on a target and land damage on it — hits landed AFTER every strike is gone',
  notes.spawned > 0 && notes.midHits > notes.hitsAfterStrikes && notes.dmg > 0, JSON.stringify(notes));
check('N03 each note hits ONCE and then disappears — nothing lingers',
  notes.left === 0, JSON.stringify({ left: notes.left }));

const cap = await page.evaluate(() => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  let peak = 0;
  for (let w = 0; w < 6; w++) { g._fireGuitarWave(5); window.__step(26); peak = Math.max(peak, window.__notes()); }
  return { peak };
});
check('N04 the note array is HARD CAPPED — six back-to-back waves cannot flood it',
  cap.peak > 0 && cap.peak <= 26, JSON.stringify(cap));

// ════════════════════════════════════════════════════════════════════════════
// S. THE STUN TIERS
// ════════════════════════════════════════════════════════════════════════════
const tiers = await page.evaluate(() => {
  const g = window.__g;
  window.__eddie('endless');
  const out = {};
  for (const [name, opts] of [['normal', {}], ['elite', { elite: true }], ['boss', { boss: true }],
                              ['mega', { mega: true }]]) {
    window.__clearEnemies();
    const e = window.__dummy(0, 0, opts);
    e.stunned = 0; e._eddieStunCd = 0;
    if (typeof g._applyEddieStun !== 'function') { out[name] = -1; continue; }
    g._applyEddieStun(e);
    out[name] = e.stunned;
  }
  return out;
});
check('S01 normals take the FULL stun, elites a reduced one, bosses only a small stagger',
  tiers.normal > tiers.elite && tiers.elite > tiers.boss && tiers.boss > 0 &&
  tiers.boss <= 0.30 && tiers.mega === tiers.boss,
  JSON.stringify(tiers));

const lock = await page.evaluate(() => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  const boss = window.__dummy(0, 0, { boss: true });
  boss.stunned = 0; boss._eddieStunCd = 0;
  if (typeof g._applyEddieStun !== 'function') {
    return { firstBurst: { applied: -1, stunned: -1 }, duty: 1 };   // absent => FAIL, never throw
  }
  // Twenty notes landing on the same boss in the same instant — the shape that produces a lock.
  let applied = 0;
  for (let i = 0; i < 20; i++) { if (g._applyEddieStun(boss) > 0) applied++; }
  const firstBurst = { applied, stunned: boss.stunned };
  // Now measure the DUTY CYCLE over three seconds of notes raining on it every frame.
  boss.stunned = 0; boss._eddieStunCd = 0;
  let stunnedFrames = 0;
  const F = 180;
  for (let i = 0; i < F; i++) {
    g._applyEddieStun(boss);
    if (boss.stunned > 0) stunnedFrames++;
    boss.stunned = Math.max(0, boss.stunned - 1 / 60);
    if (boss._eddieStunCd > 0) boss._eddieStunCd -= 1 / 60;
  }
  return { firstBurst, duty: stunnedFrames / F };
});
check('S02 NO STUN-LOCK — twenty simultaneous notes apply the stagger ONCE, not twenty times',
  lock.firstBurst.applied === 1 && lock.firstBurst.stunned <= 0.30, JSON.stringify(lock.firstBurst));
check('S03 and under three seconds of continuous notes a boss is free MOST of the time',
  lock.duty < 0.35, `stunned duty cycle = ${(lock.duty * 100).toFixed(1)}%`);

const normalStun = await page.evaluate(() => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  const e = window.__dummy(240, 0);
  window.__wave(3);
  window.__step(30);
  window.__step(80);
  return { stunned: e.stunned, hits: e.hits };
});
check('S04 a real landed note actually stuns a normal enemy through the shipped path',
  normalStun.hits > 0 && normalStun.stunned > 0, JSON.stringify(normalStun));

// ════════════════════════════════════════════════════════════════════════════
// U. THE ULTIMATE
// ════════════════════════════════════════════════════════════════════════════
const ult = await page.evaluate(async (v) => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  window.__dummy(120, 40);
  const mod = await import(`./js/effects/feedback-apocalypse.js?v=${v}`);
  const cfg = mod.FEEDBACK_CONFIG;
  // Drive the module directly with the SAME hooks Game wires, and record where bolts land and
  // whether each landing produced a note.
  const fx = new mod.FeedbackApocalypse(window.__ctx().canvas, { complete: true, naturalWidth: 32, naturalHeight: 48 },
                                        { spriteW: 32, spriteH: 48 });
  fx.trigger(600, 400);
  const lands = [];
  const strikes = [];
  let t = 0;
  const P = cfg.phases;
  const total = P.chordMs + P.wavesMs + P.soloMs + P.blowoutMs + 40;
  const fake = [{ hp: 100, pos: { x: 0, y: 0 } }];
  while (t <= total) {
    fx.update(fx.born + t, fake, {
      getX: () => 600, getY: () => 400 - 24,
      onStrike: (e, k) => strikes.push(k),
      onLand: (x, y) => lands.push({ x, y }),
    });
    t += 16;
  }
  const cy = 400 - 48 / 2;
  const rs = lands.map(L => Math.hypot(L.x - 600, (L.y - cy) / cfg.ring.squash));
  return { hasRingCfg: !!cfg.ring, lands: lands.length, strikes: strikes.length,
           rMin: rs.length ? Math.min(...rs) : -1, rMax: rs.length ? Math.max(...rs) : -1,
           rIn: cfg.ring?.rIn, rOut: cfg.ring?.rOut };
}, fs.readFileSync(path.join(ROOT, 'js/game/Game.js'), 'utf8').match(/feedback-apocalypse\.js\?v=(\d+)/)[1]);
check('U01 the ultimate declares its own ring and lands every SOLO bolt inside it, around Eddie',
  ult.hasRingCfg && ult.lands > 0 &&
  ult.rMin >= ult.rIn - 1 && ult.rMax <= ult.rOut + 1,
  JSON.stringify(ult));
check('U02 every ultimate bolt landing raises the note hook',
  ult.lands > 0, `${ult.lands} landings`);
check('U03 the ultimate still strikes what is under the bolt — damage did not move to empty ground',
  ult.strikes > 0, `${ult.strikes} strikes`);

const ultLive = await page.evaluate(async () => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  const e = window.__dummy(90, 30);
  const p = g.player;
  p.mana = p.maxMana || 100;
  const manaBefore = p.mana;
  if (g._eddieNotes) g._eddieNotes.length = 0;
  window.__muteAudio(); window.__clearErr();
  try { g.activateRedThunderCurtain(); } catch (err) { window.__err = String(err); }
  const fired = !!g._feedbackApoc?.isActive?.();
  // REAL TIME, not just frames. FeedbackApocalypse runs off performance.now(), and its SOLO
  // phase — the one that drops bolts — does not begin until 1.9 s after the trigger. 260
  // synchronous update() calls are about 200 ms of wall clock, so the first version never
  // reached the phase under test and reported peak 0 against a working hook.
  let peak = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 4200) {
    window.__step(2);
    peak = Math.max(peak, window.__notes());
    await new Promise(r => setTimeout(r, 12));
  }
  return { fired, manaBefore, manaAfter: p.mana, peak, hits: e.hits,
           phaseEnded: !g._feedbackApoc?.isActive?.(), err: window.__err || null };
});
check('U04 a REAL ultimate cast spawns homing notes and costs exactly what it always cost',
  ultLive.fired === true && (ultLive.manaBefore - ultLive.manaAfter) === 80 && ultLive.peak > 0,
  JSON.stringify(ultLive));

// ════════════════════════════════════════════════════════════════════════════
// P. PERFORMANCE
// ════════════════════════════════════════════════════════════════════════════
const perf = await page.evaluate(() => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2, r = 120 + (i % 7) * 45;
    window.__dummy(Math.cos(a) * r, Math.sin(a) * r);
  }
  window.__muteAudio(); window.__clearErr();
  window.__step(10);
  const t0 = performance.now();
  let peakNotes = 0, peakStrikes = 0;
  for (let w = 0; w < 5; w++) {
    g._fireGuitarWave(5);
    for (let i = 0; i < 40; i++) {
      window.__step(1);
      peakNotes = Math.max(peakNotes, window.__notes());
      peakStrikes = Math.max(peakStrikes, g._goldStrikes.length);
    }
  }
  const ms = performance.now() - t0;
  return { frames: 200, ms, perFrame: ms / 200, peakNotes, peakStrikes, err: window.__err || null };
});
check('P01 200 update frames of full solo under 90 enemies stay inside frame budget',
  perf.err === null && perf.perFrame < 16.7, `${perf.perFrame.toFixed(2)} ms/frame over ${perf.frames} frames`);
check('P02 both arrays stay bounded through five overlapping waves',
  perf.peakNotes <= 26 && perf.peakStrikes <= 200, JSON.stringify(perf));

// ════════════════════════════════════════════════════════════════════════════
// C. CONTROL + DRAW
// ════════════════════════════════════════════════════════════════════════════
const ctrl = await page.evaluate(() => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  window.__wave(3);
  const s = g._goldStrikes[0];
  const notesArr = g._eddieNotes;
  // Strike damage per level is the shipped formula 30 + 10*lvl; note damage is a FRACTION of it,
  // so the note cannot be a second full-damage hit.
  window.__step(30);
  const n = (notesArr || [])[0];
  return { strikeDmg: s ? s.dmg : -1, noteDmg: n ? n.dmg : -1, lvl3Expected: 30 + 10 * 3 };
});
check('C01 strike damage is unchanged and the note carries only a FRACTION of it',
  ctrl.strikeDmg === ctrl.lvl3Expected && ctrl.noteDmg > 0 && ctrl.noteDmg < ctrl.strikeDmg,
  JSON.stringify(ctrl));

const draw = await page.evaluate(() => {
  const g = window.__g;
  window.__eddie('endless');
  window.__clearEnemies();
  window.__dummy(200, 0);
  g._fireGuitarWave(4);
  window.__step(26);
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
  return { err, state: g.gameState, mean: sum / n, max, colors: colors.size, notes: window.__notes() };
});
const { data: shot } = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(OUT, 'eddie_rain.png'), Buffer.from(shot, 'base64'));
check('D01 a live solo with notes on screen renders — no black screen',
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
