// ACT 1 LATE-ELIGIBILITY PROTECTION REGRESSION — Phase 4C fix guard.
// In a 300s campaign stage the evolution card is a guaranteed top-priority level-up offer once
// _evolutionReady() (weapon L5 + catalyst L3). But if the player COMPLETES that recipe in the
// final seconds, the stage can clear before any further level-up delivers the card — the earned
// evolution would be silently swallowed by the stage boundary. Game._updateCampaignProgress now
// secures it: at the 300s clear, if _evolutionReady() and the weapon is not yet evolved, the
// earned evolution fires. This test pins BOTH halves of the contract:
//   POSITIVE — a run that EARNS the full recipe late (eligible < clear, no mid-stage level-up left)
//              evolves, and the evolution fires AT the clear (firstEvo ≈ stageClearedAt), proving it
//              was C-delivered rather than a normal mid-stage level-up.
//   NEGATIVE — a run that never earns the recipe (catalyst < L3) does NOT evolve at clear. C is
//              delivery of an ALREADY-EARNED recipe, never a free/auto evolution.
// Deterministic: seeded PRNG + virtual clock + cleared store + child-process isolation. Exit 1 on
// regression.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

// ══════════════════════════════════════════════════════════════════════════════════
// WORKER — one deterministic Act1 production run (committed picker + greedy collector),
// instrumented for evolution timing. One JSON line out.
// ══════════════════════════════════════════════════════════════════════════════════
if (process.argv[2] === '--worker') {
  const seed = +process.argv[3], ch = process.argv[4];
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
  const beMod = await import(path.resolve(HERE, '../../js/game/BuildEngine.js') + '?v=20260810100000');
  un();
  const IN = (k) => ({ keys: k || new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });
  const w2p = {}; for (const [, r] of Object.entries(beMod.EVOLUTION_RECIPES)) if (r.weapon && r.passive) w2p[r.weapon] = r.passive;
  const nativeW = new Set(Object.entries(beMod.WEAPON_DEFS).filter(([, d]) => d.owner === ch).map(([wid]) => wid));

  const u = muteConsole();
  const g = new Game(); g.audio = null;
  g.selectedCharacter = ch; g.gameState = 'playing';
  g._pendingCampaignStage = 1; g.paused = false; g.reset(); g._applyCampaignStage();
  let evolutions = 0, firstEvo = null;
  const oe = g.buildEngine._evolve.bind(g.buildEngine);
  g.buildEngine._evolve = (wid) => { evolutions++; if (firstEvo == null) firstEvo = +(vclock / 1000).toFixed(1); return oe(wid); };
  let firstElig = null, maxW = 0, maxP = 0, stageClearedAt = null;
  for (let f = 0; f < 6 * 60 * 60; f++) {
    vclock += 1000 / 60;
    if (g.upgradeUI) {
      const opts = g.upgradeUI.options || g.upgradeUI.choices || [];
      let lead = null, leadLvl = -1;
      for (const [wid, w] of g.buildEngine.weapons) { if (w.evolved || !w2p[wid]) continue; const lv = w.level; if (lv > leadLvl || (lv === leadLvl && nativeW.has(wid) && !(lead && nativeW.has(lead)))) { leadLvl = lv; lead = wid; } }
      const leadP = lead ? w2p[lead] : null, lWlv = lead ? (g.buildEngine.weapons.get(lead)?.level || 0) : 0, lPlv = leadP ? (g.buildEngine.passives.get(leadP) || 0) : 0;
      let i = -1;
      if (Array.isArray(opts)) {
        i = opts.findIndex(o => String(o?.key || '').startsWith('be_evo_'));
        if (i < 0 && lead && lWlv < 5) i = opts.findIndex(o => String(o?.key || '') === 'be_w_' + lead);
        if (i < 0 && leadP && lPlv < 3) i = opts.findIndex(o => String(o?.key || '') === 'be_p_' + leadP);
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
    let keys = new Set(); const p = g.player, px = p.pos.x, py = p.pos.y; let bd = Infinity, tx = null, ty = null;
    for (const s of g.xpShards.active) { const dx = s.x - px, dy = s.y - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; tx = s.x; ty = s.y; } }
    if (tx == null) for (const e of (g.enemies || [])) { const dx = e.pos.x - px, dy = e.pos.y - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; tx = e.pos.x; ty = e.pos.y; } }
    if (tx != null) { const dx = tx - px, dy = ty - py; if (dx > 8) keys.add('d'); else if (dx < -8) keys.add('a'); if (dy > 8) keys.add('s'); else if (dy < -8) keys.add('w'); }
    try { g.update(1 / 60, IN(keys)); } catch (_) {}
    for (const [, v] of (g.buildEngine?.weapons?.entries?.() || [])) maxW = Math.max(maxW, v.evolved ? 5 : (v.level || 0));
    for (const [, pl] of (g.buildEngine?.passives?.entries?.() || [])) maxP = Math.max(maxP, pl);
    if ((g._campaignCleared || g.paused) && stageClearedAt == null) { stageClearedAt = +(vclock / 1000).toFixed(1); break; }
  }
  u();
  process.stdout.write(JSON.stringify({ ch, seed, evolutions, firstEvo, firstElig, maxW, maxP, stageClearedAt }));
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════════
function worker(seed, ch) {
  const r = spawnSync(process.execPath, [SELF, '--worker', String(seed), ch], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0 || !r.stdout) throw new Error(`worker failed seed=${seed} ch=${ch}: ${(r.stderr || '').slice(-400)}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

console.log('═══ ACT 1 LATE-ELIGIBILITY PROTECTION (deterministic · earned evolution never lost to the clear) ═══');

// POSITIVE seeds: dimis_kickboxer completes the recipe in the final seconds → evolution must be
// secured AT the clear (firstEvo ≈ stageClearedAt). NEGATIVE seed: recipe never earned → no evo.
const posA = worker(12345, 'dimis_kickboxer');
const posB = worker(20260721, 'dimis_kickboxer');
const neg  = worker(777, 'brawler_warrior');
for (const [tag, r] of [['POS dimis/12345', posA], ['POS dimis/20260721', posB], ['NEG brawler/777', neg]])
  console.log(`  ${tag}: maxWL ${r.maxW} maxPL ${r.maxP} elig ${r.firstElig} firstEvo ${r.firstEvo} cleared ${r.stageClearedAt} evolutions ${r.evolutions}`);

console.log('\n── POSITIVE: earned late recipe is SECURED at the clear ──');
T('POS-A earned the FULL recipe (weapon L5 + catalyst L3)', () => (posA.maxW >= 5 && posA.maxP >= 3) || `maxWL ${posA.maxW} maxPL ${posA.maxP}`);
T('POS-A evolved', () => posA.evolutions >= 1 || 'no evolution');
T('POS-A evolution fired AT the clear (C-delivered, not mid-stage)', () => (posA.firstEvo != null && posA.stageClearedAt != null && Math.abs(posA.firstEvo - posA.stageClearedAt) < 1.0) || `firstEvo ${posA.firstEvo} vs cleared ${posA.stageClearedAt}`);
T('POS-B earned the FULL recipe and evolved AT the clear', () => (posB.maxW >= 5 && posB.maxP >= 3 && posB.evolutions >= 1 && posB.firstEvo != null && posB.stageClearedAt != null && Math.abs(posB.firstEvo - posB.stageClearedAt) < 1.0) || `maxWL ${posB.maxW} maxPL ${posB.maxP} evo ${posB.evolutions} firstEvo ${posB.firstEvo} cleared ${posB.stageClearedAt}`);

console.log('\n── NEGATIVE: no free/auto evolution without the earned recipe ──');
T('NEG never earned the recipe (catalyst < L3)', () => neg.maxP < 3 || `maxPL ${neg.maxP} (expected < 3)`);
T('NEG did NOT evolve at the clear (C is not a free evolution)', () => neg.evolutions === 0 || `evolutions ${neg.evolutions} — unearned evolution manufactured`);

console.log('\n  CONCLUSION: An evolution recipe fully earned within a stage is delivered even if the 300s boundary cuts off the next level-up (POS). A recipe that was never earned is never evolved for free (NEG). Late-eligibility protection closes the eligible-vs-evolved gap WITHOUT manufacturing evolutions.');
console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
