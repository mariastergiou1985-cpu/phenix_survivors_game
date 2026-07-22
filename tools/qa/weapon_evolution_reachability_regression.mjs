// WEAPON EVOLUTION REACHABILITY GATE — Phase-4B outcome. In NATURAL committed play the level-up/
// card economy NOW delivers weapon L5, catalyst L3, natural eligibility and real evolutions.
//
// ── HISTORY ──────────────────────────────────────────────────────────────────────────
// Phase-2/3 this file was a DEFECT TRACKER: natural runs reached neither weapon L5 nor any
// evolution (reachability = 0). Phase-4B fixed the card economy (BuildEngine.injectCards):
//   • owned-weapon weight scales with invested level (mastery convergence, snowball → L5),
//   • owner's native weapons boosted (signature recipe path),
//   • catalyst weight scales with weapon investment + strong (not absolute) recipe-close nudge,
//   • lead-recipe convergence: finish the weapon+catalyst the player invested in,
//   • dead-offer protection: stop pushing NEW weapons mid-recipe,
//   • BE-slot presence raised 45%→~85% (BE is the primary progression layer, 1/3 slot).
// The test was therefore FLIPPED (as its old comment promised) into a PASSING GATE.
//
// ── MEASUREMENT REALISM ──────────────────────────────────────────────────────────────
// XP is collected by a greedy collector (Phase-4E proved a stationary/'d'-only bot collects
// ~2-3% of dropped XP — a movement artifact, not an economy defect; the shard ledger is
// leak-free, see xp_conservation_regression). The picker models COMMITTED play: acquire a
// native, then finish that weapon (→L5) + its catalyst (→L3), take any evolution offered.
// Deterministic: seeded PRNG + virtual monotonic clock + cleared store + child-process
// isolation. If a future change breaks reachability again, THIS GATE FAILS. Exit 1 on failure.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

// ══════════════════════════════════════════════════════════════════════════════════
// WORKER MODE — one deterministic natural run (greedy collector + committed picker).
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
  const be = await import(path.resolve(HERE, '../../js/game/BuildEngine.js?v=20260810100000'));
  const IN = (k) => ({ keys: k || new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });
  const g = new Game(); g.audio = null;
  g.selectedCharacter = ch; g.gameState = 'playing'; g.reset(); g._enterEndless();

  // weapon→catalyst map + this char's native weapons
  const recipes = Object.entries(be.EVOLUTION_RECIPES);
  const w2p = {}; for (const [, r] of recipes) if (r.weapon && r.passive) w2p[r.weapon] = r.passive;
  const nativeW = new Set(Object.entries(be.WEAPON_DEFS).filter(([, d]) => d.owner === ch).map(([wid]) => wid));

  let beEvo = 0, legacyEvo = 0, maxW = 0, maxP = 0, firstElig = null;
  if (g.buildEngine?._evolve) { const oe = g.buildEngine._evolve.bind(g.buildEngine); g.buildEngine._evolve = (w) => { beEvo++; return oe(w); }; }
  if (g.triggerAnnouncement) { const oa = g.triggerAnnouncement.bind(g); g.triggerAnnouncement = (m, ...a) => { if (/EVOLUTION/i.test(String(m || ''))) legacyEvo++; return oa(m, ...a); }; }

  for (let f = 0; f < minutes * 60 * 60; f++) {
    vclock += 1000 / 60;
    if (g.upgradeUI) {
      const opts = g.upgradeUI.options || g.upgradeUI.choices || [];
      // COMMITTED play: commit to the most-invested owned non-evolved BE weapon with a catalyst
      // (prefer native); pursue weapon→L5 + catalyst→L3; take any evolution; else acquire a native
      // to start; else a legacy card (don't scatter into off-recipe weapons).
      let lead = null, leadLvl = -1;
      for (const [wid, w] of g.buildEngine.weapons) { if (w.evolved || !w2p[wid]) continue; const lv = w.level; if (lv > leadLvl || (lv === leadLvl && nativeW.has(wid) && !(lead && nativeW.has(lead)))) { leadLvl = lv; lead = wid; } }
      const leadP = lead ? w2p[lead] : null;
      const leadWlv = lead ? (g.buildEngine.weapons.get(lead)?.level || 0) : 0;
      const leadPlv = leadP ? (g.buildEngine.passives.get(leadP) || 0) : 0;
      let i = -1;
      if (Array.isArray(opts)) {
        i = opts.findIndex(o => String(o?.key || '').startsWith('be_evo_'));
        if (i < 0 && lead && leadWlv < 5) i = opts.findIndex(o => String(o?.key || '') === 'be_w_' + lead);
        if (i < 0 && leadP && leadPlv < 3) i = opts.findIndex(o => String(o?.key || '') === 'be_p_' + leadP);
        if (i < 0 && !lead) i = opts.findIndex(o => { const k = String(o?.key || ''); return k.startsWith('be_w_') && nativeW.has(k.slice(5)); });
        if (i < 0) i = opts.findIndex(o => !String(o?.key || '').startsWith('be_'));
      }
      if (i < 0) i = 0;
      try { g.selectUpgrade(i); } catch (_) { g.upgradeUI = null; }
      if (firstElig == null && g.buildEngine._evolutionReady()) firstElig = +(vclock / 1000).toFixed(1);
    }
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
    for (const [, v] of (g.buildEngine?.weapons?.entries?.() || [])) maxW = Math.max(maxW, v.evolved ? 5 : (v.level || 0));
    for (const [, pl] of (g.buildEngine?.passives?.entries?.() || [])) maxP = Math.max(maxP, pl);
  }
  un();
  process.stdout.write(JSON.stringify({ ch, seed, playerLevel: g.player?.level || 0, maxWeaponLevel: maxW, maxPassiveLevel: maxP, eligible: firstElig != null, firstEligible: firstElig, evolutions: beEvo + legacyEvo }));
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════════════
// MAIN MODE — spawn deterministic workers, assert reachability WORKS.
// ══════════════════════════════════════════════════════════════════════════════════
const SEEDS = [12345, 777, 20260721, 555, 88888];
const CHARS = ['skeleton_warrior', 'oni_cataclysm_protocol', 'taekwondo_girl', 'dimis_kickboxer'];
const MINUTES = 8;

function worker(seed, ch, minutes) {
  const r = spawnSync(process.execPath, [SELF, '--worker', String(seed), ch, String(minutes)], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0 || !r.stdout) throw new Error(`worker failed seed=${seed} ch=${ch}: ${(r.stderr || '').slice(-400)}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

console.log('═══ WEAPON EVOLUTION REACHABILITY GATE (deterministic · Phase-4B outcome) ═══');
console.log(`── ${SEEDS.length} seeds × ${CHARS.length} chars @ ${MINUTES} min, greedy collector + committed picker, seeded PRNG + virtual clock + process isolation ──`);

const d1 = worker(SEEDS[0], CHARS[0], 2), d2 = worker(SEEDS[0], CHARS[0], 2);
const deterministic = JSON.stringify(d1) === JSON.stringify(d2);

const runs = [];
for (const s of SEEDS) for (const c of CHARS) runs.push(worker(s, c, MINUTES));
for (const r of runs) console.log(`  seed ${String(r.seed).padStart(8)} ${r.ch.padEnd(24)}: plvl ${r.playerLevel}, maxWLvl ${r.maxWeaponLevel}, maxPLvl ${r.maxPassiveLevel}, eligible ${r.eligible ? 'Y' : 'n'}, evolutions ${r.evolutions}`);

// per-character aggregates
const byChar = {};
for (const c of CHARS) { const rs = runs.filter(r => r.ch === c); byChar[c] = { l5: rs.filter(r => r.maxWeaponLevel >= 5).length, cat: rs.filter(r => r.maxPassiveLevel >= 3).length, elig: rs.filter(r => r.eligible).length, evo: rs.filter(r => r.evolutions > 0).length, n: rs.length }; }

console.log('\n── DETERMINISM ──');
T('repeated (seed,char) run is byte-identical (no RNG/clock/state leak)', () => deterministic || `d1=${JSON.stringify(d1)} d2=${JSON.stringify(d2)}`);

console.log('\n── REACHABILITY WORKS (Phase-4B) ──');
T('weapon L5 IS reachable naturally — every character on ≥1 seed', () => CHARS.every(c => byChar[c].l5 >= 1) || 'l5/char: ' + CHARS.map(c => c + '=' + byChar[c].l5 + '/' + byChar[c].n).join(', '));
T('catalyst L3 IS reachable naturally — every character on ≥1 seed', () => CHARS.every(c => byChar[c].cat >= 1) || 'cat/char: ' + CHARS.map(c => c + '=' + byChar[c].cat + '/' + byChar[c].n).join(', '));
T('natural evolution eligibility occurs — every character on ≥1 seed', () => CHARS.every(c => byChar[c].elig >= 1) || 'elig/char: ' + CHARS.map(c => c + '=' + byChar[c].elig + '/' + byChar[c].n).join(', '));
T('≥1 natural evolution fires — every character on ≥1 seed', () => CHARS.every(c => byChar[c].evo >= 1) || 'evo/char: ' + CHARS.map(c => c + '=' + byChar[c].evo + '/' + byChar[c].n).join(', '));
T('reachability is not a fluke — ≥50% of all runs reach weapon L5', () => { const n = runs.filter(r => r.maxWeaponLevel >= 5).length; return n >= runs.length / 2 || `only ${n}/${runs.length}`; });

console.log('\n── VARIETY PRESERVED (not a guaranteed-same-build / not fully deterministic) ──');
T('not every run evolves identically (some runs collection-limited, no evo)', () => { const e = runs.filter(r => r.evolutions > 0).length; return (e > 0 && e < runs.length) || `evolved ${e}/${runs.length} — suspicious if all-or-nothing`; });

const totalEvo = runs.reduce((s, r) => s + r.evolutions, 0);
const evoRuns = runs.filter(r => r.evolutions > 0).length;
console.log(`\n  SUMMARY: ${totalEvo} evolutions across ${runs.length} deterministic runs; ${evoRuns}/${runs.length} runs evolved.`);
for (const c of CHARS) console.log(`    ${c.padEnd(24)}: L5 ${byChar[c].l5}/${byChar[c].n}, catL3 ${byChar[c].cat}/${byChar[c].n}, eligible ${byChar[c].elig}/${byChar[c].n}, evolved ${byChar[c].evo}/${byChar[c].n}`);
console.log('  Collection-limited seeds (few level-ups) may not evolve — that is the XP-collection axis (see PHASE4E_XP_BASELINE_ACCOUNTING), not the card economy.');

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
