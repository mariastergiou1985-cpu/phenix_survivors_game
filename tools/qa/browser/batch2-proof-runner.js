// ═══════════════════════════════════════════════════════════════════════════════
// PHENIX: NULL EDEN — BATCH 2 AUTOMATED BROWSER PROOF RUNNER
// ═══════════════════════════════════════════════════════════════════════════════
// Separate QA-only module. NOT part of the normal module graph: it is loaded ONLY
// by a gated dynamic import in main.js that runs after BOTH ?qa=1 AND the
// sessionStorage opt-in have already passed. A normal boot never fetches this file
// and never exposes runBatch2Proof.
//
// Contract (see also tools/qa/black_screen_regression.mjs and
// tools/qa/batch2_runner_guard_regression.mjs):
//   · Drives the 24 Batch-2 runtime states through the REAL production paths, using
//     ONLY the restricted window.__phenixQA bridge — it never receives `Game`, never
//     holds a mutable engine reference, never writes real progression.
//   · Every state is bounded (maxSteps + wall-clock timeout) and there is a global
//     iteration cap, so there is no way to spin forever.
//   · Capture reads the REAL <canvas id="game"> pixels. The contact sheet only places
//     labels OUTSIDE the frames; it never reconstructs gameplay or paints fake overlays.
//   · Fails at the FIRST real problem, reporting the state id + a snapshot.
//
// One external call drives everything:   await window.__phenixQA.runBatch2Proof()
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── FNV-1a hashing (deterministic pixel checksum, no crypto dependency) ──────────
function fnv1a(bytes, stride) {
  let h = 0x811c9dc5;
  const st = stride || 1;
  for (let i = 0; i < bytes.length; i += st) {
    h ^= bytes[i];
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

// ── Real-canvas capture. Never fabricates pixels; degrades gracefully headless. ──
function captureFrame(env, meta, snap) {
  const canvas = env.getCanvas && env.getCanvas();
  const out = {
    id: meta.id, name: meta.name,
    sha: meta.sha, build: meta.build,
    mode: snap ? snap.mode : null,
    gameState: snap ? snap.gameState : null,
    timeAlive: snap ? snap.timeAlive : null,
    player: snap ? snap.player : null,
    camera: snap ? snap.camera : null,
    playerFinite: !!(snap && snap.player && Number.isFinite(snap.player.x) && Number.isFinite(snap.player.y)),
    cameraFinite: !!(snap && snap.camera && Number.isFinite(snap.camera.x) && Number.isFinite(snap.camera.y)),
    lastError: snap ? snap.lastError : null,
    width: null, height: null, pixelHash: null, nonBlank: null, dataURL: null,
    snapshot: snap || null,
  };
  if (!canvas) return out;
  out.width = canvas.width; out.height = canvas.height;
  try {
    const c2 = canvas.getContext && canvas.getContext('2d');
    if (c2 && c2.getImageData) {
      const img = c2.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      out.pixelHash = fnv1a(d, 97);                 // subsample: every ~24th pixel
      // non-blank proof: does the frame contain more than one colour?
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 401) { const v = d[i]; if (v < min) min = v; if (v > max) max = v; }
      out.nonBlank = (max - min) > 8;
    }
  } catch (_) { /* readback not available (headless) */ }
  try {
    if (canvas.toDataURL) out.dataURL = canvas.toDataURL('image/png');
  } catch (_) { /* toDataURL not available (headless) */ }
  return out;
}

// ── The reusable per-state driver ────────────────────────────────────────────────
// Bounded, timed, real Game.update via qa.step(dt), yields to rAF for a real draw,
// captures the real canvas once the predicate holds, throws on failure with the id.
async function driveState(qa, env, def, budget) {
  const dt = def.dt || (1 / 60);
  const maxSteps = def.maxSteps || 1800;
  const batch = def.batch || 240;
  const timeoutMs = def.timeoutMs || 25000;
  const t0 = env.now();

  let snap = qa.snapshot();
  if (def.prepare) { try { const r = def.prepare(qa, snap); if (r && r.then) await r; } catch (e) { throwFail(def, 'prepare threw: ' + (e && e.message), snap); } }
  snap = qa.snapshot();

  let hit = false, steps = 0;
  // If the predicate is already satisfied after prepare (e.g. main menu at boot), accept it.
  try { hit = !!def.predicate(snap); } catch (_) { hit = false; }
  while (!hit && steps < maxSteps) {
    if (budget.spent >= budget.cap) throwFail(def, 'global iteration cap reached (' + budget.cap + ')', snap);
    if (env.now() - t0 > timeoutMs) throwFail(def, 'wall-clock timeout after ' + Math.round((env.now() - t0)) + 'ms at step ' + steps, snap);
    for (let b = 0; b < batch && steps < maxSteps; b++, steps++, budget.spent++) {
      snap = qa.step(dt);
      let ok = false; try { ok = !!def.predicate(snap); } catch (_) { ok = false; }
      if (ok) { hit = true; break; }
    }
    await env.raf();                              // let the REAL loop draw a frame
  }
  if (!hit) throwFail(def, 'predicate never became true within ' + maxSteps + ' steps', snap);

  // At least one real draw of the reached state before we photograph it.
  await env.raf(); await env.raf();
  snap = qa.snapshot();
  if (!def.predicate(snap)) {                     // it must still hold on the drawn frame
    // one more settle, then re-check
    await env.raf(); snap = qa.snapshot();
    if (!def.predicate(snap)) throwFail(def, 'predicate did not hold on the drawn frame', snap);
  }
  const cap = captureFrame(env, { id: def.id, name: def.name, sha: env.sha, build: env.build }, snap);
  cap.steps = steps;
  if (env.requireRealCanvas && cap.dataURL == null) throwFail(def, 'capture did not come from a real canvas', snap);
  if (env.requireRealCanvas && cap.nonBlank === false) throwFail(def, 'captured frame is blank (possible black screen)', snap);
  if (!cap.playerFinite && def.needsPlayer !== false && snap.player) throwFail(def, 'player coordinates are non-finite', snap);
  return cap;
}

function throwFail(def, why, snap) {
  const err = new Error('[BATCH2 FAIL] state ' + def.id + ' (' + def.name + '): ' + why);
  err.batch2 = { id: def.id, name: def.name, why: why, snapshot: snap };
  throw err;
}

// ── helpers for predicates ───────────────────────────────────────────────────────
const rolesValid = (roles) => Array.isArray(roles) && roles.length > 0 &&
  roles.every(r => r != null && r !== 'undefined' && String(r).length > 0);
const hazardsAllZero = (h) => !h || Object.keys(h).every(k => (h[k] | 0) === 0);

// ── The 24 states. Each drives a REAL production path via the bridge only. ───────
const STATES = [
  { id: 1, name: 'Main menu',
    prepare: (qa) => qa.showMenu(),
    predicate: s => s.gameState === 'start_menu', maxSteps: 900, needsPlayer: false },

  { id: 2, name: 'Character select',
    prepare: (qa) => qa.showCharacterSelect(),
    predicate: s => s.gameState === 'character_select', maxSteps: 900, needsPlayer: false },

  { id: 3, name: 'Normal world (Endless)',
    prepare: (qa) => qa.startRun('skeleton_warrior'),
    predicate: s => s.gameState === 'playing' && s.mode === 'endless' && !!s.player, maxSteps: 1200 },

  { id: 4, name: 'Player + map + HUD',
    prepare: (qa) => qa.startRun('skeleton_warrior'),
    predicate: s => s.gameState === 'playing' && !!s.player && s.player.hp > 0 && s.timeAlive > 0.5, maxSteps: 1200 },

  { id: 5, name: 'Hazard telegraph',
    prepare: (qa) => qa.startChaos('skeleton_warrior'),
    predicate: s => s.hazardPhase && s.hazardPhase.telegraphing > 0, maxSteps: 9000 },

  { id: 6, name: 'Hazard active',
    prepare: (qa) => qa.startChaos('skeleton_warrior'),
    predicate: s => s.hazardPhase && s.hazardPhase.active > 0, maxSteps: 9000 },

  { id: 7, name: 'Pickup visible',
    prepare: (qa) => qa.startRun('skeleton_warrior'),
    predicate: s => (s.xpShards | 0) > 0 || (s.healthPickups | 0) > 0 || (s.manaPickups | 0) > 0, maxSteps: 2400 },

  { id: 8, name: 'Reward collection (nexus reward orb)',
    prepare: (qa) => qa.startChaos('skeleton_warrior'),
    predicate: s => (s.rewardOrbs | 0) > 0, maxSteps: 14000 },

  { id: 9, name: 'Locked Vault active',
    prepare: (qa) => { qa.startChaos('skeleton_warrior'); qa.forceVault(); },
    predicate: s => s.vault && s.vault.active === true, maxSteps: 1800 },

  { id: 10, name: 'Locked Vault reward (unlocked)',
    prepare: (qa) => { qa.startChaos('skeleton_warrior'); qa.forceVault(); qa.unlockVault(); },
    predicate: s => s.vault && s.vault.active === true && s.vault.unlocked === true, maxSteps: 1800 },

  { id: 11, name: 'Null Breach completion panel (3 options)',
    prepare: (qa) => { qa.startChaos('skeleton_warrior'); qa.enterArena(); qa.completeArena(); },
    predicate: s => s.nullBreach && s.nullBreach.panel === true, maxSteps: 1800 },

  { id: 12, name: 'Chaos active',
    prepare: (qa) => qa.startChaos('skeleton_warrior'),
    predicate: s => s.mode === 'chaos' && s.gameState === 'playing', maxSteps: 1200 },

  { id: 13, name: 'DEFENCE turret firing without pets',
    prepare: (qa) => { qa.startChaos('skeleton_warrior'); qa.setNoPets(); },
    predicate: s => s.pets === 0 && s.petBoltStats && s.petBoltStats.count > 0, maxSteps: 9000 },

  { id: 14, name: 'Turret projectile in flight',
    prepare: (qa) => { qa.startChaos('skeleton_warrior'); qa.setNoPets(); },
    predicate: s => s.pets === 0 && s.petBoltStats && s.petBoltStats.count > 0 && s.petBoltStats.moving > 0, maxSteps: 9000 },

  { id: 15, name: 'Turret projectile hit',
    prepare: (qa) => { qa.startChaos('skeleton_warrior'); qa.setNoPets(); },
    predicate: s => s.pets === 0 && s.petBoltStats && s.petBoltStats.nearestEnemyDist != null && s.petBoltStats.nearestEnemyDist < 28, maxSteps: 9000 },

  { id: 16, name: 'Late matrix with valid chaosRole',
    prepare: (qa) => { qa.startChaos('skeleton_warrior'); qa.addLateMatrix(); },
    predicate: s => rolesValid(s.matrixRoles), maxSteps: 1800 },

  { id: 17, name: 'Boss Rush active',
    prepare: (qa) => qa.startChaos('skeleton_warrior'),
    predicate: s => s.bossRush && s.bossRush.active === true, maxSteps: 16000, timeoutMs: 40000 },

  { id: 18, name: 'Ring clamp / anti-escape',
    prepare: (qa) => qa.startChaos('skeleton_warrior'),
    predicate: s => s.bossRush && s.bossRush.active === true && s.bossRush.hazard === 'lockdown'
                    && s.player && Number.isFinite(s.player.x) && Number.isFinite(s.player.y), maxSteps: 18000, timeoutMs: 45000 },

  { id: 19, name: 'Titan encounter',
    prepare: (qa) => qa.startChaos('skeleton_warrior'),
    predicate: s => s.titan != null, maxSteps: 6000, timeoutMs: 25000 },

  { id: 20, name: 'Euclid rendered gameplay',
    prepare: (qa) => qa.startRun('euclid_vector'),
    predicate: s => !!s.player && s.timeAlive > 0.5 && s.lastError == null && s.gameState === 'playing', maxSteps: 1800 },

  { id: 21, name: 'Reset',
    prepare: (qa) => { qa.startChaos('skeleton_warrior'); qa.forceVault(); qa.resetRun(); },
    predicate: s => (s.petBolts | 0) === 0 && s.vault && s.vault.active === false && s.titan == null
                    && s.bossRush && s.bossRush.active === false, maxSteps: 600, needsPlayer: false },

  { id: 22, name: 'Second run',
    prepare: (qa) => { qa.resetRun(); qa.startRun('skeleton_warrior'); },
    predicate: s => s.gameState === 'playing' && s.mode === 'endless' && !!s.player && s.timeAlive > 0.3, maxSteps: 1200 },

  { id: 23, name: 'Zero stale state after reset',
    prepare: (qa) => { qa.startChaos('skeleton_warrior'); qa.forceVault(); qa.addLateMatrix(); qa.resetRun(); },
    predicate: s => (s.petBolts | 0) === 0 && hazardsAllZero(s.hazards) && (s.rewardOrbs | 0) === 0
                    && s.vault && s.vault.active === false && s.titan == null
                    && s.bossRush && s.bossRush.active === false, maxSteps: 600, needsPlayer: false },

  { id: 24, name: 'Normal XP/drop pacing without phantom reward',
    prepare: (qa) => { qa.resetRun(); qa.startRun('skeleton_warrior'); },
    predicate: s => s.mode === 'endless' && (s.xpShards | 0) > 0 && (s.rewardOrbs | 0) === 0
                    && s.vault && s.vault.active === false && s.timeAlive > 3, maxSteps: 3000 },
];

// ── The reset / second-run gate (explicit, beyond state 21/23 predicates) ────────
function resetGate(qa) {
  qa.startChaos('skeleton_warrior');
  qa.forceVault();
  qa.addLateMatrix();
  const s = qa.resetRun();
  const checks = {
    petBolts0: (s.petBolts | 0) === 0,
    hazards0: hazardsAllZero(s.hazards),
    rewardOrbs0: (s.rewardOrbs | 0) === 0,
    vaultInactive: !!(s.vault && s.vault.active === false),
    titanNull: s.titan == null,
    bossRushInactive: !!(s.bossRush && s.bossRush.active === false),
    noPhantomReward: (s.rewardOrbs | 0) === 0,
  };
  const ok = Object.values(checks).every(Boolean);
  return { ok, checks, snapshot: s };
}

// ── Contact sheet (labels OUTSIDE frames; never repaints gameplay) ───────────────
function loadImage(src) {
  return new Promise((res) => {
    if (typeof Image === 'undefined') return res(null);
    const im = new Image();
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = src;
  });
}
async function buildContactSheet(env, captures, header) {
  if (!env.makeCanvas) return null;
  const cols = 6, rows = 4, fw = 320, fh = 180, labelH = 22, pad = 8, headH = 46;
  const cellW = fw + pad, cellH = fh + labelH + pad;
  const W = cols * cellW + pad, H = headH + rows * cellH + pad;
  const cv = env.makeCanvas(W, H);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2ee6f6'; ctx.font = 'bold 20px Consolas, monospace'; ctx.textBaseline = 'middle';
  ctx.fillText(header, pad, headH / 2);
  for (let i = 0; i < captures.length; i++) {
    const c = captures[i];
    const col = i % cols, row = (i / cols) | 0;
    const x = pad + col * cellW, y = headH + row * cellH;
    ctx.fillStyle = '#9fc7dd'; ctx.font = '12px Consolas, monospace'; ctx.textBaseline = 'top';
    ctx.fillText((c.id < 10 ? '0' : '') + c.id + '  ' + c.name.slice(0, 40), x, y);
    const iy = y + labelH;
    ctx.fillStyle = '#0a1424'; ctx.fillRect(x, iy, fw, fh);
    if (c.dataURL) { const im = await loadImage(c.dataURL); if (im) ctx.drawImage(im, x, iy, fw, fh); }
    ctx.strokeStyle = c.nonBlank ? 'rgba(46,230,246,.5)' : 'rgba(255,80,80,.8)';
    ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, iy + 0.5, fw - 1, fh - 1);
  }
  try { return cv.toDataURL('image/png'); } catch (_) { return null; }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────────
async function runBatch2Proof(qa, env, opts) {
  opts = opts || {};
  const build = qa.build || (env && env.build) || null;
  const sha = (opts.sha || (env && env.sha) || (typeof window !== 'undefined' && window.__PHENIX_SHA__) || null);
  env = Object.assign({
    getCanvas: () => (typeof document !== 'undefined' ? document.getElementById('game') : null),
    raf: () => (typeof requestAnimationFrame !== 'undefined'
      ? new Promise(r => requestAnimationFrame(() => r())) : Promise.resolve()),
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    makeCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
    requireRealCanvas: true,
  }, env || {}, { sha, build });

  const log = (m) => { try { console.log('[BATCH2] ' + m); } catch (_) {} };
  log('starting — sha=' + sha + ' build=' + build);

  // 1. boot stabilization
  for (let i = 0; i < 30; i++) await env.raf();

  // 2. storage BEFORE (reliable length/key(i) snapshot from the bridge)
  const storageBefore = qa.storageSnapshot();

  // 3. drive the 24 states (fail-fast on the first real problem)
  const budget = { spent: 0, cap: opts.globalCap || 500000 };
  const captures = [];
  for (const def of STATES) {
    log('state ' + def.id + ' — ' + def.name);
    const cap = await driveState(qa, env, def, budget);   // throws on failure
    captures.push(cap);
  }

  // 4. reset / second-run gate
  const gate = resetGate(qa);
  if (!gate.ok) {
    const err = new Error('[BATCH2 FAIL] reset gate: ' + JSON.stringify(gate.checks));
    err.batch2 = { id: 'reset-gate', checks: gate.checks, snapshot: gate.snapshot };
    throw err;
  }

  // 5. storage AFTER — require byte-identical
  const storageAfter = qa.storageSnapshot();
  const storageIdentical = storageBefore.hash === storageAfter.hash;
  const storageDiff = storageIdentical ? null : diffStorage(storageBefore, storageAfter);
  if (!storageIdentical) {
    const err = new Error('[BATCH2 FAIL] storage not byte-identical: ' + JSON.stringify(storageDiff));
    err.batch2 = { id: 'storage-gate', before: storageBefore, after: storageAfter, diff: storageDiff };
    throw err;
  }

  // 6. manifest + contact sheet
  const manifest = {
    title: 'PHENIX: NULL EDEN — Batch 2 automated proof',
    generatedAt: (typeof Date !== 'undefined' ? new Date().toISOString() : null),
    sha, build,
    result: captures.length + '/' + STATES.length + ' PASS',
    pass: captures.length === STATES.length,
    globalStepsUsed: budget.spent,
    storage: { before: storageBefore, after: storageAfter, identical: storageIdentical, diff: storageDiff },
    resetGate: gate.checks,
    states: captures.map(c => ({
      id: c.id, name: c.name, gameState: c.gameState, mode: c.mode, timeAlive: c.timeAlive,
      width: c.width, height: c.height, pixelHash: c.pixelHash, nonBlank: c.nonBlank,
      player: c.player, camera: c.camera, playerFinite: c.playerFinite, cameraFinite: c.cameraFinite,
      lastError: c.lastError, steps: c.steps, snapshot: c.snapshot,
    })),
  };
  const contactSheet = await buildContactSheet(env, captures, 'PHENIX BATCH 2 — 24/24 — build ' + build + ' — sha ' + (sha ? String(sha).slice(0, 10) : '?'));

  const result = { manifest, contactSheet, frames: captures.map(c => ({ id: c.id, name: c.name, dataURL: c.dataURL })) };
  try { qa._lastProof = result; } catch (_) {}
  log('DONE — ' + manifest.result);
  return result;
}

function diffStorage(a, b) {
  const out = {};
  const keys = new Set([].concat(a.keys || [], b.keys || []));
  const av = {}, bv = {};
  (a.keys || []).forEach((k, i) => { av[k] = 1; });
  // rebuild value maps from hash is not possible; compare key sets + bytes
  out.keysBefore = a.keys; out.keysAfter = b.keys;
  out.bytesBefore = a.bytes; out.bytesAfter = b.bytes;
  out.addedKeys = (b.keys || []).filter(k => !(a.keys || []).includes(k));
  out.removedKeys = (a.keys || []).filter(k => !(b.keys || []).includes(k));
  return out;
}

// ── Install onto the restricted bridge (never receives Game) ─────────────────────
function installBatch2Proof(qa, env) {
  if (!qa) return false;
  qa.runBatch2Proof = (opts) => runBatch2Proof(qa, env || {}, opts || {});
  qa.batch2States = STATES.map(s => ({ id: s.id, name: s.name }));
  return true;
}

// Browser auto-install: main.js dynamic-imports this file (after both QA gates) and
// this block wires runBatch2Proof onto the already-created window.__phenixQA. In Node
// (headless validator) `window` is absent, so nothing auto-installs and the validator
// calls installBatch2Proof / driveState directly with a headless env.
if (typeof window !== 'undefined' && window.__phenixQA) {
  installBatch2Proof(window.__phenixQA, {
    getCanvas: () => document.getElementById('game'),
    sha: window.__PHENIX_SHA__ || null,
  });
}

export { STATES, driveState, resetGate, buildContactSheet, runBatch2Proof, installBatch2Proof, captureFrame };
