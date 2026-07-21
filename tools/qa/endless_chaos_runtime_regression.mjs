// ENDLESS / CHAOS RUNTIME INTEGRITY — drives the REAL Game class headlessly at accelerated
// time. Unlike a hand-written model, every number here is produced by production code, so a
// failure is a real defect and a pass is real evidence.
//
// Covers: long-run stability, unbounded array growth, non-finite coordinates, event lifecycle
// (Null Breach arena, Boss Rush, Chaos Titans, Locked Vault), stale state after death/restart/
// mode transition, pause behaviour, and FPS independence of the schedulers.
//
// Run: node tools/qa/endless_chaos_runtime_regression.mjs   (exit 1 on failure)

import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
register('./strip-v-loader.mjs', import.meta.url);
const { installEnv, muteConsole } = await import(path.join(HERE, 'headless-env.mjs'));
installEnv();

const JS = path.resolve(HERE, '../../js');
const unmute = muteConsole();
const { Game } = await import(path.join(JS, 'game/Game.js'));
unmute();

let pass = 0, fail = 0;
const T = (n, f, hint = '') => {
  let ok = false, note = '';
  try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; }
  catch (e) { note = 'THREW: ' + e.message; }
  if (!ok && !note) note = hint;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`);
};
const IN = () => ({ keys: new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });

// Driving the real game costs ~3s wall per simulated minute, so the suite default is a
// meaningful-but-quick run and the full-length audit is opt-in:
//   node endless_chaos_runtime_regression.mjs            → all phases, default lengths
//   node endless_chaos_runtime_regression.mjs chaos      → one phase (keeps each run short)
//   PHENIX_QA_LONG=1 node ... chaos                      → full 60-minute audit lengths
const PHASE = (process.argv[2] || 'all').toLowerCase();
const LONG = process.env.PHENIX_QA_LONG === '1';
const RUN = p => PHASE === 'all' || PHASE === p;
const MIN_ENDLESS = LONG ? 20 : 8;
const MIN_CHAOS = LONG ? 60 : 14;
const MIN_CHAOS_SHORT = LONG ? 14 : 3;   // long enough to observe Boss Rush #1 at 2:00
const MIN_FPS = LONG ? 10 : 4;

// Arrays that grow per-event/per-frame and must stay bounded across a long run.
const TRACKED = ['enemies', 'projectiles', 'enemyBullets', 'floatingTexts', 'xpShards',
                 'airstrikeShips', 'rockets', 'cybermotes', 'iceFields', 'voidRifts',
                 'enemyBeams', 'enemyOrbZones', 'ventBursts', 'homingDiscs', 'effects'];

/**
 * Drive a real run. Auto-dismisses card screens (a headless run never picks, and an
 * un-dismissed card screen freezes timeAlive — which would silently invalidate the whole
 * measurement) and keeps the player alive so pacing can be observed to the end.
 */
function drive(g, seconds, dt, opts = {}) {
  const frames = Math.round(seconds / dt);
  const st = {
    updateErrors: 0, firstError: null, drawErrors: 0,
    peak: Object.fromEntries(TRACKED.map(k => [k, 0])),
    nonFinite: [], cards: 0, panels: 0,
    events: { arena: 0, bossRush: 0, vault: 0, titan: 0 },
    seen: { arena: false, bossRush: false, vault: false, titan: false },
    samples: [],
  };
  const input = IN();
  for (let f = 0; f < frames; f++) {
    if (g.upgradeUI) { try { g.selectUpgrade(0); st.cards++; } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); st.cards++; } catch (_) { g.mutationUI = null; } }
    // The post-Arena panel legitimately freezes the run until the player chooses. A headless
    // run never chooses, so without this the whole measurement would stall at ~7:00.
    if (g._postArenaChoice) { st.panels++; try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = false; } }
    if (opts.immortal && g.player) { g.player.hp = g.player.maxHp; g.gameOver = false; }
    try { g.update(dt, input); } catch (e) { st.updateErrors++; if (!st.firstError) st.firstError = e; }

    // rising-edge event counters, read from the REAL state fields
    const arena = !!g._nullBreachActive;
    if (arena && !st.seen.arena) st.events.arena++;
    st.seen.arena = arena;
    const rush = !!g._bossRush;
    if (rush && !st.seen.bossRush) st.events.bossRush++;
    st.seen.bossRush = rush;
    const vault = !!g.vaultDrop;
    if (vault && !st.seen.vault) st.events.vault++;
    st.seen.vault = vault;
    const titan = !!g._activeTitan;
    if (titan && !st.seen.titan) st.events.titan++;
    st.seen.titan = titan;

    if ((f & 63) === 0) {
      for (const k of TRACKED) { const a = g[k]; if (Array.isArray(a) && a.length > st.peak[k]) st.peak[k] = a.length; }
      const p = g.player, c = g.camera;
      if (p && (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.y))) st.nonFinite.push(`player@${f}`);
      if (c && (!Number.isFinite(c.x) || !Number.isFinite(c.y))) st.nonFinite.push(`camera@${f}`);
      if (!Number.isFinite(g.timeAlive)) st.nonFinite.push(`timeAlive@${f}`);
      for (const e of (g.enemies || [])) {
        if (!Number.isFinite(e.pos?.x) || !Number.isFinite(e.pos?.y) || !Number.isFinite(e.hp)) { st.nonFinite.push(`enemy ${e.enemyType}@${f}`); break; }
      }
    }
  }
  st.timeAlive = g.timeAlive;
  return st;
}

function newRun(mode) {
  const un = muteConsole();
  const g = new Game();
  g.audio = null;
  g.gameState = 'playing';
  g.reset();
  // Chaos MUST go through the real entry path: _beginChaosRun() is what stamps
  // _chaosStartedAt, and the Boss Rush scheduler measures chaosEl from it. Setting
  // _chaosMode directly leaves the -1 sentinel, which pins chaosEl at 0 forever and
  // silently disables every Boss Rush — a harness shortcut that would fake a defect.
  if (mode === 'chaos') g._beginChaosRun();
  else if (mode === 'endless') g._enterEndless();
  un();
  return g;
}

console.log('═══ ENDLESS / CHAOS RUNTIME INTEGRITY ═══');
console.log('    (real Game instance, accelerated deterministic time)');

// ── 1. ENDLESS long run ─────────────────────────────────────────────────────
if (RUN('endless')) {
console.log(`\n── 1. Endless · ${MIN_ENDLESS} simulated minutes ──`);
const gE = newRun('endless');
const tE0 = Date.now();
const E = drive(gE, MIN_ENDLESS * 60, 1 / 60, { immortal: true });
console.log(`    driven in ${((Date.now() - tE0) / 1000).toFixed(1)}s · timeAlive=${E.timeAlive.toFixed(0)}s · cards auto-picked=${E.cards} · post-arena panels dismissed=${E.panels}`);
console.log(`    peak arrays: ${Object.entries(E.peak).filter(([, v]) => v > 0).map(([k, v]) => k + '=' + v).join(' ')}`);
console.log(`    events: ${JSON.stringify(E.events)}`);
T(`${MIN_ENDLESS} λεπτά Endless χωρίς update error`, () => E.updateErrors === 0,
  E.firstError ? `${E.updateErrors} errors, first: ${E.firstError.message} @ ${String(E.firstError.stack).split('\n')[1].trim()}` : '');
T('καμία μη-πεπερασμένη τιμή (player/camera/enemies/timeAlive)', () => E.nonFinite.length === 0, E.nonFinite.slice(0, 3).join(','));
T('timeAlive προχώρησε πραγματικά (τα card screens δεν πάγωσαν το run)', () => E.timeAlive > MIN_ENDLESS * 60 * 0.9, `timeAlive=${E.timeAlive.toFixed(0)}s`);
T('enemies bounded από το enemyCap', () => E.peak.enemies <= (gE.enemyCap() * 3 + 60), `peak=${E.peak.enemies} cap=${gE.enemyCap()}`);
T('floatingTexts δεν αυξάνονται ανεξέλεγκτα', () => E.peak.floatingTexts < 500, `peak=${E.peak.floatingTexts}`);
T('projectiles bounded', () => E.peak.projectiles < 2000, `peak=${E.peak.projectiles}`);
T('enemyBullets bounded', () => E.peak.enemyBullets < 3000, `peak=${E.peak.enemyBullets}`);
const EXPECT_ARENA = (MIN_ENDLESS * 60 >= 720 + 130) ? 2 : 1;   // breach 1 @5:00, breach 2 @12:00 (+120s arena)
T(`Null Breach arena ενεργοποιήθηκε ${EXPECT_ARENA}× στα ${MIN_ENDLESS} λεπτά (5:00 / 12:00)`,
  () => E.events.arena === EXPECT_ARENA, `fired ${E.events.arena}×`);
T('η arena ΤΕΛΕΙΩΣΕ (δεν έμεινε μόνιμα ενεργή)', () => gE._nullBreachActive === false);
T('τα Null Breach flags καταναλώθηκαν όσα events έτρεξαν',
  () => (gE._nullBreach1Done === true) && (EXPECT_ARENA < 2 || gE._nullBreach2Done === true),
  `b1=${gE._nullBreach1Done} b2=${gE._nullBreach2Done}`);
T('το run παραμένει παίξιμο (όχι gameOver λόγω engine fault)', () => gE.gameOver === false);
}

// ── 2. CHAOS: Boss Rush schedule + 180s sequence ────────────────────────────
// A full 60-minute Chaos sim costs >10 min of wall time (enemy-dense), so scheduling is
// proven from the REAL schedule state plus a short drive that observes rush #1 actually
// firing at its scheduled game-time. PHENIX_QA_LONG=1 runs the full-length version.
if (RUN('chaos')) {
console.log(`\n── 2. Chaos · Boss Rush schedule + 180s sequence ──`);
const gC = newRun('chaos');
const C = drive(gC, MIN_CHAOS_SHORT * 60, 1 / 60, { immortal: true });
console.log(`    ${MIN_CHAOS_SHORT} sim-min · timeAlive=${C.timeAlive.toFixed(0)}s · events=${JSON.stringify(C.events)}`);
console.log(`    peak arrays: ${Object.entries(C.peak).filter(([, v]) => v > 0).map(([k, v]) => k + '=' + v).join(' ')}`);
const SRC = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');

T(`${MIN_CHAOS_SHORT} λεπτά Chaos χωρίς update error`, () => C.updateErrors === 0,
  C.firstError ? `${C.updateErrors} errors, first: ${C.firstError.message}` : '');
T('καμία μη-πεπερασμένη τιμή στο Chaos', () => C.nonFinite.length === 0, C.nonFinite.slice(0, 3).join(','));
T('Boss Rush schedule έχει ΑΚΡΙΒΩΣ 2 εγγραφές ανά run',
  () => Array.isArray(gC._bossRushSchedule) && gC._bossRushSchedule.length === 2,
  `schedule=${JSON.stringify(gC._bossRushSchedule)}`);
T('Chaos schedule = [120, 480] (Endless = [480, 900])',
  () => /_bossRushSchedule = this\._chaosMode \? \[120, 480\] : \[480, 900\]/.test(SRC));
T('Boss Rush #1 όντως ενεργοποιήθηκε στο προγραμματισμένο game-time',
  () => C.events.bossRush >= 1, `fired ${C.events.bossRush}×`);
T('ο μετρητής δεν ξεπερνά ποτέ το μήκος του schedule',
  () => gC._bossRushCount <= 2, `count=${gC._bossRushCount}`);
T('Boss Rush ΔΕΝ ανοίγει όσο τρέχει το Null Breach Arena (mutual exclusion)',
  () => /chaosEl >= next && !this\._nullBreachActive/.test(SRC));
T('Boss Rush χρησιμοποιεί game-time (chaosEl), όχι wall-clock',
  () => /const chaosEl = this\._chaosMode/.test(SRC) && /this\.timeAlive - \(this\._chaosStartedAt/.test(SRC));
T('η διάρκεια του rush είναι 180s (3:00)', () => /t: 0, dur: 180,/.test(SRC));
T('Chaos Titans εμφανίστηκαν', () => C.events.titan > 0, `titans=${C.events.titan}`);
T('enemies bounded στο Chaos', () => C.peak.enemies <= (gC.enemyCap() * 3 + 120), `peak=${C.peak.enemies} cap=${gC.enemyCap()}`);
T('κανένα tracked array δεν ξέφυγε (<5000)',
  () => Object.entries(C.peak).every(([, v]) => v < 5000) || Object.entries(C.peak).filter(([, v]) => v >= 5000).map(([k, v]) => k + '=' + v).join(','));

console.log('    · 180-second Boss Rush sequence (game-time beats, one-shot flags)');
const BEATS = [
  ['0:00-0:30 XP swarm',        /if \(T < 30 && br\.spawnAcc <= 0/],
  ['0:30 lockdown ring',        /if \(T >= 30 && !br\.flags\.lockdown\)/],
  ['0:45 elite assault',        /if \(T >= 45 && !br\.flags\.elite\)/],
  ['1:00 first Mega Titan',     /if \(T >= 60 && !br\.flags\.titan1\)/],
  ['1:28 second Mega Titan',    /if \(T >= 88 && !br\.flags\.titan2\)/],
  ['1:30 double ring',          /if \(T >= 90 && !br\.flags\.doublering\)/],
];
for (const [label, re] of BEATS) T(`beat ${label}`, () => re.test(SRC));
T('κάθε beat είναι one-shot flag (κανένα duplicate spawn)',
  () => ['lockdown', 'elite', 'titan1', 'titan2', 'doublering']
    .every(f => new RegExp(`br\\.flags\\.${f} = true`).test(SRC)));
T('το ρολόι του rush είναι game-time (br.t += dt) — FPS-independent', () => /br\.t \+= dt;/.test(SRC));
T('ο παίκτης κλειδώνεται μέσα στο rush arena', () => /pd > LOCK_R && pd > 0/.test(SRC));
}

// ── 3. FPS independence ─────────────────────────────────────────────────────
if (RUN('fps')) {
console.log('\n── 3. FPS independence (30 / 60 / 120 Hz, ίδιος game-time) ──');
const fpsRes = {};
for (const hz of [30, 60, 120]) {
  const g = newRun('chaos');
  const r = drive(g, MIN_FPS * 60, 1 / hz, { immortal: true });
  fpsRes[hz] = { arena: r.events.arena, rush: r.events.bossRush, titan: r.events.titan,
                 t: +r.timeAlive.toFixed(0), errs: r.updateErrors };
}
console.log(`    ${JSON.stringify(fpsRes)}`);
T('game-time ίδιος σε 30/60/120 Hz (±2s)', () => {
  const ts = [30, 60, 120].map(h => fpsRes[h].t);
  return Math.max(...ts) - Math.min(...ts) <= 2 || `timeAlive: ${ts.join(' / ')}`;
});
T('Boss Rush count ανεξάρτητο από FPS', () => {
  const v = [30, 60, 120].map(h => fpsRes[h].rush);
  return new Set(v).size === 1 || `rushes: ${v.join(' / ')}`;
});
T('Titan count ανεξάρτητο από FPS (±1)', () => {
  const v = [30, 60, 120].map(h => fpsRes[h].titan);
  return Math.max(...v) - Math.min(...v) <= 1 || `titans: ${v.join(' / ')}`;
});
T('κανένα update error σε καμία συχνότητα', () => [30, 60, 120].every(h => fpsRes[h].errs === 0));
}

// ── 4. pause must freeze game time and all schedulers ───────────────────────
if (RUN('pause')) {
console.log('\n── 4. pause / focus ──');
{
  const g = newRun('chaos');
  drive(g, 60, 1 / 60, { immortal: true });
  const before = { t: g.timeAlive, rush: g._bossRushCount, titan: g._chaosTitanTimer, boss: g._endlessBossTimer };
  g.paused = true;
  const input = IN();
  for (let f = 0; f < 60 * 60 * 5; f++) { try { g.update(1 / 60, input); } catch (_) {} }   // 5 min paused
  const after = { t: g.timeAlive, rush: g._bossRushCount, titan: g._chaosTitanTimer, boss: g._endlessBossTimer };
  g.paused = false;
  T('timeAlive ΔΕΝ προχωρά όσο είναι paused', () => Math.abs(after.t - before.t) < 0.05, `${before.t.toFixed(2)} → ${after.t.toFixed(2)}`);
  T('boss rotation timer ΔΕΝ τρέχει όσο είναι paused', () => Math.abs((after.boss ?? 0) - (before.boss ?? 0)) < 0.05,
    `${before.boss} → ${after.boss}`);
  T('Chaos Titan timer ΔΕΝ τρέχει όσο είναι paused', () => Math.abs((after.titan ?? 0) - (before.titan ?? 0)) < 0.05,
    `${before.titan} → ${after.titan}`);
  T('Boss Rush δεν προχωρά όσο είναι paused', () => after.rush === before.rush);
  T('το run συνεχίζει κανονικά μετά το unpause', () => {
    const t0 = g.timeAlive;
    for (let f = 0; f < 120; f++) { try { g.update(1 / 60, IN()); } catch (_) {} }
    return g.timeAlive > t0;
  });
}
}

// ── 5. state isolation: death / restart / mode transition ───────────────────
if (RUN('isolation')) {
console.log('\n── 5. state isolation ──');
{
  const g = newRun('chaos');
  drive(g, 8 * 60, 1 / 60, { immortal: true });          // past the first Boss Rush (2:00) and arena
  const hadRush = g._bossRushCount > 0;
  const un = muteConsole(); g.reset(); un();
  T('προηγούμενο run είχε όντως ενεργοποιήσει events (το test δεν είναι κενό)', () => hadRush, `rushCount=${g._bossRushCount}`);
  T('reset() καθαρίζει το Boss Rush state', () => g._bossRush == null && (g._bossRushCount == null || g._bossRushCount === 0),
    `rush=${g._bossRush} count=${g._bossRushCount}`);
  T('reset() καθαρίζει το arena state', () => g._nullBreachActive === false && g._nullBreach1Done === false && g._nullBreach2Done === false);
  T('reset() καθαρίζει τον Locked Vault', () => g.vaultDrop == null);
  T('reset() καθαρίζει το Chaos Titan state', () => g._activeTitan == null);
  T('reset() μηδενίζει το timeAlive', () => g.timeAlive === 0, `timeAlive=${g.timeAlive}`);
  T('νέο run μετά το reset τρέχει χωρίς error', () => {
    const un2 = muteConsole(); g.gameState = 'playing'; g._enterEndless(); un2();
    const r = drive(g, 60, 1 / 60, { immortal: true });
    return r.updateErrors === 0 || `${r.updateErrors} errors: ${r.firstError?.message}`;
  });
}
}

// ── 6. death inside the arena must not leave the arena latched ──────────────
if (RUN('arena')) {
console.log('\n── 6. death μέσα στην arena ──');
{
  const g = newRun('endless');
  const input = IN();
  let latched = false;
  for (let f = 0; f < 60 * 60 * 7; f++) {                 // run past the 5:00 arena
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    if (g._nullBreachActive && !latched) {                // kill the player mid-arena
      latched = true;
      if (g.player) g.player.hp = 0;
    }
    if (!latched && g.player) g.player.hp = g.player.maxHp;
    try { g.update(1 / 60, input); } catch (_) {}
  }
  T('η arena όντως ενεργοποιήθηκε (το test δεν είναι κενό)', () => latched);
  T('θάνατος μέσα στην arena δεν αφήνει την arena μόνιμα ενεργή',
    () => g.gameOver === false || g._nullBreachActive === false,
    `gameOver=${g.gameOver} arenaActive=${g._nullBreachActive}`);
  const un = muteConsole(); g.reset(); un();
  T('reset μετά από θάνατο στην arena καθαρίζει τα πάντα',
    () => g._nullBreachActive === false && g.gameOver === false && g.vaultDrop == null);
}
}

// ── 7. post-Arena decision panel must not soft-lock ─────────────────────────
// update() returns early while _postArenaChoice is true, so `timeAlive += dt` never runs.
// Staging the panel's dialogue off timeAlive left et === 0 forever: _pacMsgStep never left 0,
// so the 5 lines AND the 3 options were never drawn, and main.js gates the mouse/touch click
// path on _pacMsgStep >= 5 — mouse and touch players were soft-locked with a blank panel.
if (RUN('panel')) {
  console.log('\n── 7. post-Arena decision panel ──');
  const { makeCtx } = await import(path.join(HERE, 'headless-env.mjs'));
  const g = newRun('endless');
  const ctx = makeCtx();

  T('timeAlive ΕΙΝΑΙ παγωμένο όσο το panel είναι ανοιχτό (η συνθήκη του bug)', () => {
    g._postArenaChoice = true;
    const t0 = g.timeAlive;
    for (let f = 0; f < 120; f++) { try { g.update(1 / 60, IN()); } catch (_) {} }
    return g.timeAlive === t0 || `timeAlive moved ${t0} → ${g.timeAlive}`;
  });

  T('το panel clock ΔΕΝ βασίζεται στο timeAlive', () => {
    const src = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');
    return !/const et = this\.timeAlive - this\._pacMsgAt/.test(src) &&
           /const et = \(performance\.now\(\) - this\._pacMsgAt\) \/ 1000/.test(src);
  });

  T('_pacMsgStep φτάνει στο 5 → οι 3 επιλογές σχεδιάζονται και το mouse path ενεργοποιείται', () => {
    g._postArenaChoice = true;
    g._pacMsgStep = 0;
    g._pacMsgAt = performance.now() - 4000;   // panel has been up 4s in REAL time
    g._drawPostArenaChoice(ctx);
    return g._pacMsgStep === 5 || `_pacMsgStep=${g._pacMsgStep} (0 ⇒ blank panel, dead mouse path)`;
  });

  T('και οι 5 γραμμές διαλόγου αποκαλύπτονται σταδιακά', () => {
    const steps = [0.1, 0.5, 1.5, 2.5, 3.2, 4.0].map(sec => {
      g._pacMsgStep = 0;
      g._pacMsgAt = performance.now() - sec * 1000;
      g._drawPostArenaChoice(ctx);
      return g._pacMsgStep;
    });
    return steps.join(',') === '0,1,2,3,4,5' || `steps=${steps.join(',')}`;
  });

  T('και οι 3 επιλογές παραμένουν προσβάσιμες μέσω keyboard', () => {
    const src = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');
    return /keys\.has\('arrowup'\) \|\| keys\.has\('w'\)/.test(src) &&
           /keys\.has\('enter'\) \|\| keys\.has\(' '\)/.test(src) &&
           /_selectPostArenaChoice\(this\._pacIdx\)/.test(src);
  });

  T('το mouse click path στο main.js περιμένει _pacMsgStep >= 5 (γι΄ αυτό ήταν νεκρό)', () => {
    const m = fs.readFileSync(path.join(JS, 'main.js'), 'utf8');
    return /game\._postArenaChoice && game\._pacMsgStep >= 5/.test(m);
  });

  T('_selectPostArenaChoice κλείνει το panel και ξεπαγώνει το run', () => {
    g._postArenaChoice = true;
    try { g._selectPostArenaChoice(0); } catch (_) {}
    const t0 = g.timeAlive;
    for (let f = 0; f < 120; f++) { try { g.update(1 / 60, IN()); } catch (_) {} }
    return g._postArenaChoice === false && g.timeAlive > t0 ||
      `panel=${g._postArenaChoice} timeAlive ${t0} → ${g.timeAlive}`;
  });
}

// ── 8. Locked Vault: schedule-backed, exactly 6, deferral never loses one ───
// Before the fix the gate was `Math.random() > 0.35` + a 600s cooldown whose stamp
// (_lastVaultSpawnAt) survived reset(). Measured across four full simulated hours: 6, 6, 6
// and 5 vaults — the count depended on luck and boss-kill rate. Worse, run 2 after reset()
// produced ZERO vaults in 20 minutes because it inherited run 1's cooldown stamp.
if (RUN('vault')) {
  console.log('\n── 8. Locked Vault ──');
  const g = newRun('chaos');
  const SRC = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');

  T('υπάρχει schedule με ΑΚΡΙΒΩΣ 6 opportunities',
    () => Array.isArray(g._vaultSchedule) && g._vaultSchedule.length === 6,
    `schedule=${JSON.stringify(g._vaultSchedule)}`);
  T('reset() μηδενίζει _vaultIdx και _lastVaultSpawnAt', () => {
    const un = muteConsole(); g.reset(); un();
    return g._vaultIdx === 0 && g._lastVaultSpawnAt == null && g.vaultDrop == null;
  });
  T('το πιθανοτικό gate αφαιρέθηκε (η εξάρτηση από τύχη)',
    () => !/if \(Math\.random\(\) > 0\.35\) return;/.test(SRC));
  T('ο 600s cooldown δεν καθορίζει πια το πλήθος',
    () => !/if \(this\.timeAlive - \(this\._lastVaultSpawnAt \?\? -99999\) < 600\) return;/.test(SRC));

  // Drive the REAL gate the way Enemy.js does, at each scheduled time.
  const gv = newRun('chaos');
  const at = (t) => { gv.timeAlive = t; };
  const bossKill = () => { try { gv._maybeSpawnVaultDrop(gv.player.pos.clone()); } catch (_) {} };
  let spawned = 0; const stamps = [];
  for (const w of gv._vaultSchedule) {
    at(w + 1);
    for (let i = 0; i < 50 && !gv.vaultDrop; i++) bossKill();   // 50 boss kills in the window
    if (gv.vaultDrop) { spawned++; stamps.push(w); gv.vaultDrop = null; }   // simulate collection
  }
  console.log(`    scheduled windows honoured: ${spawned}/6 at t=${stamps.join(', ')}`);
  T('και τα 6 scheduled windows παράγουν vault', () => spawned === 6, `got ${spawned}/6`);
  T('όλες οι opportunities καταναλώθηκαν ακριβώς μία φορά', () => gv._vaultIdx === 6, `_vaultIdx=${gv._vaultIdx}`);
  T('7ο vault ΔΕΝ είναι δυνατό', () => {
    at(3600); for (let i = 0; i < 200; i++) bossKill();
    return gv.vaultDrop == null && gv._vaultIdx === 6;
  });

  // Deferral: an exclusive event must HOLD the window, not burn it.
  for (const [label, field] of [['Boss Rush', '_bossRush'], ['Null Breach arena', '_nullBreachActive'], ['ενεργός Titan', '_activeTitan']]) {
    const gd = newRun('chaos');
    gd.timeAlive = gd._vaultSchedule[0] + 5;
    gd[field] = (field === '_nullBreachActive') ? true : { t: 0 };
    for (let i = 0; i < 200; i++) { try { gd._maybeSpawnVaultDrop(gd.player.pos.clone()); } catch (_) {} }
    const held = gd.vaultDrop == null && gd._vaultIdx === 0 && gd._vaultPending === true;
    gd[field] = (field === '_nullBreachActive') ? false : null;
    try { gd._maybeSpawnVaultDrop(gd.player.pos.clone()); } catch (_) {}
    T(`${label}: το window αναβάλλεται και ΔΕΝ χάνεται`,
      () => held && gd.vaultDrop != null && gd._vaultIdx === 1,
      `held=${held} afterEvent=${gd.vaultDrop != null} idx=${gd._vaultIdx}`);
  }

  T('window που δεν διεκδικήθηκε από boss kill παραδίδεται μετά από 45s', () => {
    const gq = newRun('chaos');
    gq.timeAlive = gq._vaultSchedule[0] + 46;      // window open, no boss kill at all
    try { gq._updateVaultDrop(1 / 60); } catch (_) {}
    return gq.vaultDrop != null && gq._vaultIdx === 1;
  });

  T('δεύτερο run μετά από reset δίνει τα ίδια vaults (καμία διαρροή cooldown)', () => {
    const g2 = newRun('chaos');
    g2.timeAlive = g2._vaultSchedule[0] + 1;
    for (let i = 0; i < 50 && !g2.vaultDrop; i++) { try { g2._maybeSpawnVaultDrop(g2.player.pos.clone()); } catch (_) {} }
    const run1 = g2.vaultDrop != null;
    const un = muteConsole(); g2.reset(); g2.gameState = 'playing'; g2._beginChaosRun(); un();
    g2.timeAlive = g2._vaultSchedule[0] + 1;
    for (let i = 0; i < 50 && !g2.vaultDrop; i++) { try { g2._maybeSpawnVaultDrop(g2.player.pos.clone()); } catch (_) {} }
    return run1 && g2.vaultDrop != null && g2._vaultIdx === 1;
  });

  T('ποτέ δύο vault ταυτόχρονα', () => {
    const g3 = newRun('chaos');
    g3.timeAlive = g3._vaultSchedule[0] + 1;
    for (let i = 0; i < 300; i++) { try { g3._maybeSpawnVaultDrop(g3.player.pos.clone()); } catch (_) {} }
    return g3._vaultIdx === 1 && g3.vaultDrop != null;
  });

  T('το vault count είναι ανεξάρτητο από FPS (schedule σε game-time)', () => {
    const counts = [30, 60, 120].map(hz => {
      const gf = newRun('chaos');
      let n = 0;
      for (const w of gf._vaultSchedule) {
        gf.timeAlive = w + 1 / hz;
        for (let i = 0; i < 50 && !gf.vaultDrop; i++) { try { gf._maybeSpawnVaultDrop(gf.player.pos.clone()); } catch (_) {} }
        if (gf.vaultDrop) { n++; gf.vaultDrop = null; }
      }
      return n;
    });
    return new Set(counts).size === 1 && counts[0] === 6 || `counts=${counts.join('/')}`;
  });
}

// ── 9. Ground hazards: placement, orphaning, damage path, rebase ────────────
if (RUN('hazard')) {
  console.log('\n── 9. Ground hazards ──');
  const SRC = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');

  // D1 — nullEchoZones bypassed placeGroundHazard: 757/1000 landed on non-walkable floor.
  T('nullEchoZones `zones` περνούν από placeGroundHazard',
    () => /const _nz = this\.placeGroundHazard\(P\.pos\.x \+ Math\.cos\(ang\) \* aimed/.test(SRC));
  T('nullEchoZones `pools` περνούν από placeGroundHazard',
    () => /const _np2 = this\.placeGroundHazard\(P\.pos\.x \+ Math\.cos\(ang\) \* off/.test(SRC));
  T('κανένα raw-polar push στο nullEchoZones',
    () => !/pos: new Vec2\(P\.pos\.x \+ Math\.cos\(ang\) \* (aimed|off), P\.pos\.y \+ Math\.sin\(ang\) \* (aimed|off)\)/.test(SRC));

  // D2 — zones outlived their caster, froze, and painted a telegraph ring forever.
  T('τα zones πεθαίνουν μαζί με τον Echo τους', () => {
    const g = newRun('endless');
    g.nullEcho = { life: 0.5, pos: g.player.pos.clone(), c1: '#fff', kind: 'zones' };
    g.nullEchoZones.push({ pos: g.player.pos.clone(), radius: 66, warn: 1.0, t: 0, struck: false, c: '#fff' });
    for (let f = 0; f < 60 * 60; f++) { try { g._updateNullEcho(1 / 60); } catch (_) {} }
    return (g.nullEcho == null && g.nullEchoZones.length === 0) || `echo=${g.nullEcho} zones=${g.nullEchoZones.length}`;
  });

  // D3 — lava was the ONE damage source bypassing _damagePlayer's gates.
  T('bossLavaZones περνούν από _damagePlayer (όχι applyDamage απευθείας)',
    () => /this\._damagePlayer\(z\.dps \* \(1 - this\.player\.contactDamageReduction\)/.test(SRC) &&
          !/this\.player\.applyDamage\(z\.dps \* \(1 - this\.player\.contactDamageReduction\)\);/.test(SRC));

  // D4 — sh() silently skipped six hazard systems; measured dx = -10032, they moved 0.
  T('_maybeRebaseWorld μετακινεί ΟΛΑ τα hazard systems', () => {
    for (const f of ['_chaosPylons', '_titanShockwaves', '_titanBeams', '_iceFields', '_nanoMines']) {
      if (!new RegExp(`shA\\(this\\.${f}\\)`).test(SRC)) return `${f} δεν μετακινείται`;
    }
    return (/_w\.x0 \+= dx;/.test(SRC) && /for \(const _s of _w\.trail\)/.test(SRC)) || 'nullWyrm δεν μετακινείται';
  });
  T('το no-op sh(this.nullWyrm) αφαιρέθηκε',
    () => !/sh\(this\.nullEcho\); sh\(this\.nullWyrm\);/.test(SRC));

  // D6 / D7 — small but real reset/cap holes.
  T('το blink push έχει το ίδιο cap με τα αδέλφια του',
    () => /if \(this\.nullEchoZones\.length < 8\) \{[\s\S]{0,140}placeGroundHazard\(P\.pos\.x, P\.pos\.y, 78\)/.test(SRC));
  T('_plasmaWarnCd αρχικοποιείται στο reset()', () => {
    const g = newRun('endless');
    g._plasmaWarnCd = 42;
    const un = muteConsole(); g.reset(); un();
    return g._plasmaWarnCd === 0 || `value=${g._plasmaWarnCd}`;
  });

  // Caps still hold, and every hazard array empties on reset.
  T('όλα τα hazard arrays αδειάζουν στο reset()', () => {
    const g = newRun('chaos');
    const HZ = ['bossLavaZones', 'lightningZones', 'nullEchoZones', 'cybermoteMines', 'gunshipZones',
                '_iceFields', '_voidRifts', '_enemyOrbZones', '_ventBursts', '_chaosPylons',
                '_titanShockwaves', '_titanBeams', '_nanoMines'];
    for (const k of HZ) if (Array.isArray(g[k])) g[k].push({ pos: { x: 0, y: 0 }, radius: 1, t: 0 });
    const un = muteConsole(); g.reset(); un();
    const dirty = HZ.filter(k => Array.isArray(g[k]) && g[k].length > 0);
    return dirty.length === 0 || 'έμειναν: ' + dirty.join(',');
  });
  T('nullWyrm / nullEcho καθαρίζονται στο reset()', () => {
    const g = newRun('endless');
    g.nullWyrm = { x0: 0, x1: 1, head: { x: 0, y: 0 }, trail: [] };
    g.nullEcho = { life: 1, pos: g.player.pos.clone() };
    const un = muteConsole(); g.reset(); un();
    return g.nullWyrm == null && g.nullEcho == null;
  });
}

// ── 10. Rewards / pickups / progression callbacks ───────────────────────────
if (RUN('rewards')) {
  console.log('\n── 10. Rewards / pickups ──');
  const SRC = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');
  const ESRC = fs.readFileSync(path.join(JS, 'entities/Enemy.js'), 'utf8');

  // D1 — HP-attrition stamps were page-scoped (??=), so run 2 got almost no health drops.
  T('reset() μηδενίζει τα HP-attrition stamps', () => {
    const g = newRun('chaos');
    g._hpLastDropT = 1800; g._hpLastSpawnT = 1800; g._pityArmed = 3;
    const un = muteConsole(); g.reset(); un();
    return (g._hpLastDropT <= -999 && g._hpLastSpawnT <= -999 && g._pityArmed === 0) ||
      `drop=${g._hpLastDropT} spawn=${g._hpLastSpawnT} pity=${g._pityArmed}`;
  });

  // D2 — uncollected Nexus reward orbs survived the run boundary and paid out in run 2.
  T('reset() αδειάζει τα nexusManager.rewardOrbs', () => {
    const g = newRun('chaos');
    if (!g.nexusManager) return 'no nexusManager';
    g.nexusManager.rewardOrbs.push({ pos: { x: 0, y: 0 }, kind: 'credits', amount: 3, _collected: false });
    const un = muteConsole(); g.reset(); un();
    return g.nexusManager.rewardOrbs.length === 0 || `length=${g.nexusManager.rewardOrbs.length}`;
  });

  // D3 — Enemy.js pickup drops bypassed _clampPickupPos (3/20 health, 8/41 mana off-mesh).
  T('τα elite drops περνούν από _clampPickupPos',
    () => /game\.healthPickups\.push\(\{ pos: game\._clampPickupPos\(this\.pos\.clone\(\)\), timer: 25/.test(ESRC) &&
          /game\.manaPickups\.push\(\{ pos: game\._clampPickupPos\(this\.pos\.clone\(\)\) \}\)/.test(ESRC));
  T('τα boss drops περνούν από _clampPickupPos',
    () => /game\.healthPickups\.push\(\{ pos: game\._clampPickupPos\(_bp\), timer: 30/.test(ESRC));
  T('κανένα raw this.pos.clone() pickup push στο Enemy.js',
    () => !/healthPickups\.push\(\{ pos: this\.pos\.clone\(\), timer: 25/.test(ESRC) &&
          !/manaPickups\.push\(\{ pos: this\.pos\.clone\(\) \}\)/.test(ESRC));

  // D5 — _grantRewards assigned over the in-run total instead of accumulating.
  T('runCreditsEarned συσσωρεύει, δεν αντικαθιστά', () => {
    const g = newRun('chaos');
    g.runCreditsEarned = 449;
    g.rewardsGranted = false;
    try { g._grantRewards(); } catch (_) {}
    return g.runCreditsEarned >= 449 || `runCreditsEarned=${g.runCreditsEarned} (in-run 449 discarded)`;
  });

  // D6 — reward was thrown away if the Titan died on the frame the player died.
  T('το Titan reward επιβιώνει θανάτου στο ίδιο frame', () => {
    const g = newRun('chaos');
    let kills = 0;
    g.meta = { ...g.meta, recordBossKill: () => { kills++; }, recordBossEcho: () => false, addEdenMemory: () => {}, _save: () => {} };
    g._activeTitan = { enemyType: 'Quantum Void Emperor', hp: 0, pos: g.player.pos.clone() };
    g.enemies.length = 0;
    g.gameOver = true;
    try { g._updateChaosTitans(1 / 60); } catch (_) {}
    return kills === 1 || `recordBossKill fired ${kills}×`;
  });

  // D7 — absence from `enemies` was treated as death, so a despawn paid the reward.
  T('το Titan reward απαιτεί ΠΡΑΓΜΑΤΙΚΟ kill (όχι despawn)', () => {
    const g = newRun('chaos');
    let kills = 0;
    g.meta = { ...g.meta, recordBossKill: () => { kills++; }, recordBossEcho: () => false, addEdenMemory: () => {}, _save: () => {} };
    g._activeTitan = { enemyType: 'Quantum Void Emperor', hp: 9999, pos: g.player.pos.clone() };
    g.enemies.length = 0;
    try { g._updateChaosTitans(1 / 60); } catch (_) {}
    return (kills === 0 && g._activeTitan == null) || `recordBossKill fired ${kills}× on a full-HP despawn`;
  });
  T('Enemy._die σημειώνει _killed (η μόνη πραγματική death path)',
    () => /_die\(game\) \{[\s\S]{0,400}this\._killed = true;/.test(ESRC));

  // D8 / D11 — banner + scatter counters leaked across runs.
  T('reset() μηδενίζει _theftAnnounced και _pickupFixN', () => {
    const g = newRun('chaos');
    g._theftAnnounced = true; g._pickupFixN = 286;
    const un = muteConsole(); g.reset(); un();
    return (g._theftAnnounced === false && g._pickupFixN === 0) ||
      `theft=${g._theftAnnounced} fixN=${g._pickupFixN}`;
  });

  // Lock-ins that already pass.
  T('reset() αδειάζει ΟΛΑ τα pickup containers', () => {
    const g = newRun('chaos');
    g.healthPickups.push({ pos: { x: 0, y: 0 }, timer: 9 });
    g.manaPickups.push({ pos: { x: 0, y: 0 } });
    g.armorPickups.push({ pos: { x: 0, y: 0 } });
    g.groundCores.push({ pos: { x: 0, y: 0 } });
    g.gridCache = { pos: { x: 0, y: 0 }, timer: 9 };
    g.vaultDrop = { pos: { x: 0, y: 0 }, timer: 9 };
    const un = muteConsole(); g.reset(); un();
    const dirty = ['healthPickups', 'manaPickups', 'armorPickups', 'groundCores']
      .filter(k => Array.isArray(g[k]) && g[k].length > 0);
    return (dirty.length === 0 && g.gridCache == null && g.vaultDrop == null) ||
      `dirty=${dirty.join(',')} cache=${!!g.gridCache} vault=${!!g.vaultDrop}`;
  });
  T('τα MetaProgress unlocks είναι idempotent', () => {
    const g = newRun('chaos');
    if (!g.meta?.unlock) return 'no meta.unlock';
    const before = JSON.stringify(g.meta.unlocked ?? {});
    g.meta.unlock('log_1985'); const mid = JSON.stringify(g.meta.unlocked ?? {});
    g.meta.unlock('log_1985'); const after = JSON.stringify(g.meta.unlocked ?? {});
    return mid === after || 'δεύτερο unlock άλλαξε το state';
  });
  T('_grantRewards είναι one-shot ανά run (rewardsGranted)',
    () => /this\.rewardsGranted\s+= false;/.test(SRC) && /if \(this\.rewardsGranted\) return;/.test(SRC) && /this\.rewardsGranted = true;/.test(SRC));
}

// ── 11. _petBolts: two producers, one gated consumer ────────────────────────
// The tick and draw loops lived inside _tickPets/_drawPets, which early-return when
// _activePets is empty — the DEFAULT save state. The Chaos DEFENCE turret feeds the same
// array without a pet, so with the default loadout the array only ever grew (camped: 1079
// in 10 min, 1647 in 20 min, drain time INFINITE) and every turret bolt was inert and
// invisible. Ungating lands ~950 turret hits per 10 min where production landed 0.
if (RUN('petbolts')) {
  console.log('\n── 11. _petBolts ──');
  const SRC = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');

  T('_petBolts είναι array αμέσως μετά το new Game()', () => {
    const un = muteConsole(); const g = new Game(); un();
    return Array.isArray(g._petBolts) || `type=${typeof g._petBolts}`;
  });
  T('ο tick των projectiles ΔΕΝ είναι gated στα _activePets',
    () => /_tickPetProjectiles\(dt\) \{/.test(SRC) &&
          !/_tickPetProjectiles\(dt\) \{\s*\n\s*if \(!this\._activePets/.test(SRC));
  T('ο draw των projectiles ΔΕΝ είναι gated στα _activePets',
    () => /_drawPetProjectiles\(ctx\) \{/.test(SRC) &&
          !/_drawPetProjectiles\(ctx\) \{\s*\n\s*if \(!this\._activePets/.test(SRC));
  T('καλείται από το κύριο update, όχι μόνο από το _tickPets',
    () => /this\._tickPetProjectiles\(dt\);   \/\/ ungated/.test(SRC));
  T('και οι δύο producers έχουν documented cap',
    () => (SRC.match(/if \(this\._petBolts\.length < 256\)/g) || []).length === 2,
    `βρέθηκαν ${(SRC.match(/if \(this\._petBolts\.length < 256\)/g) || []).length}/2`);
  T('υπάρχει max-distance cull (rebase/teleport δεν αφήνει stranded bolts)',
    () => /_bdx \* _bdx \+ _bdy \* _bdy > 2200 \* 2200/.test(SRC));
  T('το world rebase μετακινεί τα _petBolts', () => /shA\(this\._petBolts\)/.test(SRC));

  // Behavioural: bolts must MOVE, EXPIRE and DRAIN with zero pets equipped.
  T('τα bolts κινούνται και λήγουν ΧΩΡΙΣ pet (drain, όχι άπειρο)', () => {
    const g = newRun('chaos');
    g._activePets = [];
    for (let i = 0; i < 60; i++) {
      g._petBolts.push({ x: 100 + i, y: 100, vx: 300, vy: 0, dmg: 1, color: '#fff', life: 1.1 });
    }
    const before = g._petBolts.length;
    const x0 = g._petBolts[0].x;
    for (let f = 0; f < 60; f++) { try { g._tickPetProjectiles(1 / 60); } catch (_) {} }
    const moved = g._petBolts.length === 0 || g._petBolts[0].x !== x0;
    for (let f = 0; f < 180; f++) { try { g._tickPetProjectiles(1 / 60); } catch (_) {} }
    return (before === 60 && moved && g._petBolts.length === 0) ||
      `before=${before} moved=${moved} after=${g._petBolts.length} (παλιά: έμεναν για πάντα)`;
  });
  T('το TTL είναι dt-driven (ίδιο drain σε 30/60/120 Hz)', () => {
    const left = [30, 60, 120].map(hz => {
      const g = newRun('chaos');
      g._activePets = [];
      for (let i = 0; i < 20; i++) g._petBolts.push({ x: 0, y: 0, vx: 0, vy: 0, dmg: 1, color: '#fff', life: 1.1 });
      const frames = Math.round(2 * hz);           // 2 seconds of game time
      for (let f = 0; f < frames; f++) { try { g._tickPetProjectiles(1 / hz); } catch (_) {} }
      return g._petBolts.length;
    });
    return (new Set(left).size === 1 && left[0] === 0) || `left=${left.join('/')}`;
  });
  T('reset() αδειάζει τα _petBolts', () => {
    const g = newRun('chaos');
    g._petBolts.push({ x: 0, y: 0, vx: 0, vy: 0, dmg: 1, color: '#fff', life: 1.1 });
    const un = muteConsole(); g.reset(); un();
    return g._petBolts.length === 0 || `length=${g._petBolts.length}`;
  });
}

// ── 12. Boss Rush ring: anti-escape safeguard, not a DPS hazard ─────────────
if (RUN('bossring')) {
  console.log('\n── 12. Boss Rush ring (anti-escape contract) ──');
  const SRC = fs.readFileSync(path.join(JS, 'game/Game.js'), 'utf8');

  T('το συμβόλαιο είναι τεκμηριωμένο στην πηγή',
    () => /ANTI-ESCAPE SAFEGUARD/.test(SRC));
  T('τα damage values 16 / 18 / 26 παραμένουν αμετάβλητα',
    () => /dmg: 16,/.test(SRC) && /dmg: 18,/.test(SRC) && /dmg: 26,/.test(SRC));
  T('ο clamp επαναφέρει τον παίκτη σε finite θέση', () => {
    const g = newRun('chaos');
    g._bossRush = { t: 40, dur: 180, cx: 0, cy: 0, hazard: { kind: 'lockdown', r: 400, minR: 150, shrink: 30, dmg: 16, t: 5, dur: 15 }, spawnAcc: 0, titanIdx: 0, flags: { lockdown: true } };
    g.player.pos.x = 99999; g.player.pos.y = 99999;
    for (let f = 0; f < 30; f++) { try { g._updateBossRush(1 / 60); } catch (_) {} }
    const d = Math.hypot(g.player.pos.x - 0, g.player.pos.y - 0);
    return (Number.isFinite(g.player.pos.x) && Number.isFinite(g.player.pos.y) && d <= 400 + 1) ||
      `pos=(${g.player.pos.x},${g.player.pos.y}) dist=${d}`;
  });
  T('clamped παίκτης ΔΕΝ δέχεται περιοδικό ring damage κάθε frame', () => {
    const g = newRun('chaos');
    g._bossRush = { t: 40, dur: 180, cx: 0, cy: 0, hazard: { kind: 'lockdown', r: 400, minR: 150, shrink: 0, dmg: 16, t: 5, dur: 15 }, spawnAcc: 0, titanIdx: 0, flags: { lockdown: true } };
    g.player.pos.x = 5000; g.player.pos.y = 0;
    let hits = 0; const realDmg = g._damagePlayer.bind(g);
    g._damagePlayer = (...a) => { hits++; return realDmg(...a); };
    for (let f = 0; f < 600; f++) { g.player.hp = g.player.maxHp; try { g._updateBossRush(1 / 60); } catch (_) {} }
    return hits <= 2 || `${hits} damage calls σε 10s — αυτό θα ήταν per-frame loop`;
  });
  T('paused: κανένα breach damage', () => {
    const g = newRun('chaos');
    g._bossRush = { t: 40, dur: 180, cx: 0, cy: 0, hazard: { kind: 'lockdown', r: 400, minR: 150, shrink: 30, dmg: 16, t: 5, dur: 15 }, spawnAcc: 0, titanIdx: 0, flags: { lockdown: true } };
    g.player.pos.x = 5000; g.paused = true;
    let hits = 0; g._damagePlayer = () => { hits++; };
    for (let f = 0; f < 300; f++) { try { g._updateBossRush(1 / 60); } catch (_) {} }
    g.paused = false;
    return hits === 0 || `${hits} damage calls ενώ paused`;
  });
  T('reset() καθαρίζει το ring state', () => {
    const g = newRun('chaos');
    g._bossRush = { t: 40, dur: 180, cx: 0, cy: 0, hazard: { kind: 'lockdown', r: 400 }, flags: {} };
    const un = muteConsole(); g.reset(); un();
    return g._bossRush == null || `_bossRush=${JSON.stringify(g._bossRush)}`;
  });
  T('ίδιο αποτέλεσμα σε 30/60/120 Hz', () => {
    const res = [30, 60, 120].map(hz => {
      const g = newRun('chaos');
      g._bossRush = { t: 40, dur: 180, cx: 0, cy: 0, hazard: { kind: 'lockdown', r: 400, minR: 150, shrink: 0, dmg: 16, t: 5, dur: 15 }, spawnAcc: 0, titanIdx: 0, flags: { lockdown: true } };
      g.player.pos.x = 5000; g.player.pos.y = 0;
      let hits = 0; g._damagePlayer = () => { hits++; };
      for (let f = 0; f < 5 * hz; f++) { try { g._updateBossRush(1 / hz); } catch (_) {} }
      return hits;
    });
    return new Set(res).size === 1 || `hits=${res.join('/')}`;
  });
}

console.log(`\n═══ ${pass} assertions passed · ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
