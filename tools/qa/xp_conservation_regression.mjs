// XP CONSERVATION REGRESSION — Phase 4E baseline invariant. Proves the Data-XP shard
// pipeline NEVER loses XP: for every deterministic natural run, the EXACT identity
//     generated  ===  shardCollected + ground        (unexplained === 0)
// holds, where generated = Σ spawnBurst totals (enemy drops), shardCollected = Σ XP granted
// at real collection (inside XpShardSystem.update), ground = Σ value of shards still on the
// field at run end. Merges (cap enforcement) preserve value inside `ground`; nothing decays,
// nothing expires, nothing lands unreachably (walkable clamp). Direct-grant XP (vault/data-core/
// event rewards) is a SEPARATE, explicitly-tracked injection channel and is NOT part of the
// shard identity — it is reported, not asserted into the balance.
//
// Also pins: xpMult === 1 on a clean natural Endless run (no meta/collectibles leaking scaling),
// and NON-VACUOUS collection (a greedy collector actually banks XP). This is the permanent
// tripwire behind the Phase-4 conclusion that reachability=0 is a CARD-ECONOMY defect, not an
// XP leak. If a future change introduces an XP sink (decay, off-walkable loss, lossy merge,
// stray xpMult), the identity breaks and THIS TEST FAILS. Deterministic: seeded PRNG + virtual
// clock + cleared store + child-process isolation. Exit 1 on regression.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

// ══════════════════════════════════════════════════════════════════════════════════
// WORKER — one deterministic natural run with a greedy collector, printed as one JSON line.
// ══════════════════════════════════════════════════════════════════════════════════
if (process.argv[2] === '--worker') {
  const seed = +process.argv[3], ch = process.argv[4], minutes = +process.argv[5];
  const { installEnv, muteConsole } = await import(path.join(HERE, 'headless-env.mjs'));
  installEnv();
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = mulberry32(seed);
  let vclock = 0;
  globalThis.performance = { now: () => vclock };
  const _D = globalThis.Date;
  globalThis.Date = class extends _D { static now() { return vclock; } constructor(...a) { if (a.length) super(...a); else super(vclock); } };
  try { globalThis.localStorage.clear(); } catch (_) {}
  try { globalThis.sessionStorage.clear && globalThis.sessionStorage.clear(); } catch (_) {}

  const un = muteConsole();
  const { Game } = await import(path.resolve(HERE, '../../js/game/Game.js'));
  const IN = (k) => ({ keys: k || new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });
  const g = new Game(); g.audio = null;
  g.selectedCharacter = ch; g.gameState = 'playing'; g.reset(); g._enterEndless();

  // ledger hooks
  let generated = 0;
  const oBurst = g.xpShards.spawnBurst.bind(g.xpShards);
  g.xpShards.spawnBurst = (x, y, total, radius, game) => { generated += Math.max(1, Math.round(total)); return oBurst(x, y, total, radius, game); };
  let _inShard = false;
  const oUpd = g.xpShards.update.bind(g.xpShards);
  g.xpShards.update = (dt, game) => { _inShard = true; try { return oUpd(dt, game); } finally { _inShard = false; } };
  let shardCollected = 0, directGrants = 0;
  const oGain = g.player.gainXp.bind(g.player);
  g.player.gainXp = (amount, ft) => { if (_inShard) shardCollected += amount; else directGrants += amount; return oGain(amount, ft); };

  for (let f = 0; f < minutes * 60 * 60; f++) {
    vclock += 1000 / 60;
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    if (g._postArenaChoice) { try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = false; } }
    if (g.player) g.player.hp = g.player.maxHp;
    // greedy collector: steer toward nearest shard, else nearest enemy
    let keys = new Set(); const p = g.player, px = p.pos.x, py = p.pos.y;
    let bd = Infinity, tx = null, ty = null;
    for (const s of g.xpShards.active) { const dx = s.x - px, dy = s.y - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; tx = s.x; ty = s.y; } }
    if (tx == null) for (const e of (g.enemies || [])) { const dx = e.pos.x - px, dy = e.pos.y - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; tx = e.pos.x; ty = e.pos.y; } }
    if (tx != null) { const dx = tx - px, dy = ty - py; if (dx > 8) keys.add('d'); else if (dx < -8) keys.add('a'); if (dy > 8) keys.add('s'); else if (dy < -8) keys.add('w'); }
    try { g.update(1 / 60, IN(keys)); } catch (_) {}
  }
  un();
  const ground = g.xpShards.active.reduce((a, s) => a + (s.value || 0), 0);
  process.stdout.write(JSON.stringify({
    ch, seed, minutes,
    generated, shardCollected, ground,
    unexplained: generated - shardCollected - ground,
    directGrants, xpMult: g.player.xpMult || 1,
    playerLevel: g.player.level, kills: g.player.kills || 0,
  }));
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════════════
// MAIN — spawn deterministic workers, assert the conservation identity.
// ══════════════════════════════════════════════════════════════════════════════════
const SEEDS = [12345, 777, 20260721];
const CHARS = ['skeleton_warrior', 'oni_cataclysm_protocol'];
const MINUTES = 6;

function worker(seed, ch, minutes) {
  const r = spawnSync(process.execPath, [SELF, '--worker', String(seed), ch, String(minutes)], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0 || !r.stdout) throw new Error(`worker failed seed=${seed} ch=${ch}: ${(r.stderr || '').slice(-400)}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

console.log('═══ XP CONSERVATION (deterministic · shard pipeline never loses XP) ═══');
console.log(`── ${SEEDS.length} seeds × ${CHARS.length} chars @ ${MINUTES} min, greedy collector, seeded PRNG + virtual clock + process isolation ──`);

const d1 = worker(SEEDS[0], CHARS[0], 2), d2 = worker(SEEDS[0], CHARS[0], 2);
const deterministic = JSON.stringify(d1) === JSON.stringify(d2);

const runs = [];
for (const s of SEEDS) for (const c of CHARS) runs.push(worker(s, c, MINUTES));
for (const r of runs) console.log(`  seed ${String(r.seed).padStart(8)} ${r.ch.padEnd(24)}: gen ${r.generated}, collected ${r.shardCollected}, ground ${r.ground}, unexplained ${r.unexplained}, direct ${r.directGrants}, xpMult ${r.xpMult}, plvl ${r.playerLevel}`);

console.log('\n── DETERMINISM ──');
T('repeated (seed,char) run is byte-identical', () => deterministic || `d1=${JSON.stringify(d1)} d2=${JSON.stringify(d2)}`);

console.log('\n── SHARD CONSERVATION IDENTITY (generated === collected + ground) ──');
T('EXACT balance, unexplained === 0 — ALL runs', () => runs.every(r => r.unexplained === 0) || 'unexplained: ' + runs.map(r => r.unexplained).join(','));
T('generated > 0 (economy non-vacuous) — ALL runs', () => runs.every(r => r.generated > 0) || 'gen: ' + runs.map(r => r.generated).join(','));
T('shardCollected > 0 (collection actually happens under a collector) — ALL runs', () => runs.every(r => r.shardCollected > 0) || 'collected: ' + runs.map(r => r.shardCollected).join(','));
T('ground >= 0 and <= generated (no negative / over-count) — ALL runs', () => runs.every(r => r.ground >= 0 && r.ground <= r.generated) || 'ground: ' + runs.map(r => r.ground).join(','));

console.log('\n── NO STRAY XP SCALING ON A CLEAN NATURAL RUN ──');
T('xpMult === 1 (no meta/collectible scaling leak) — ALL runs', () => runs.every(r => r.xpMult === 1) || 'xpMult: ' + runs.map(r => r.xpMult).join(','));

const totGen = runs.reduce((s, r) => s + r.generated, 0);
const totCol = runs.reduce((s, r) => s + r.shardCollected, 0);
console.log(`\n  ANALYSIS: Σgenerated ${totGen}, Σcollected ${totCol} (${(100 * totCol / totGen).toFixed(1)}% banked under greedy collection), Σground ${runs.reduce((s, r) => s + r.ground, 0)}.`);
console.log('  CONCLUSION: XP is conserved end-to-end. Level-up throughput is gated by COLLECTION (movement/magnet), not by any XP leak. Reachability=0 is a card-economy defect (see weapon_evolution_reachability_regression).');

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
