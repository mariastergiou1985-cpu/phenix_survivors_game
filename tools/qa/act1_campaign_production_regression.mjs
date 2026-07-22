// ACT 1 CAMPAIGN PRODUCTION REGRESSION — Phase 4C guard against the "invalid Act1 harness"
// bug class. The original Act1 reachability measurement was WORTHLESS because it called
//     g.reset(); g._applyCampaignStage();
// WITHOUT first setting g._pendingCampaignStage — so _applyCampaignStage() returned immediately,
// _campaignStage stayed 0, no biome/boss timers were installed, and the run was a PLAIN endless-
// like survival world mislabelled "Act1". Every Act1 number from that harness described the wrong
// game. This test makes that failure mode LOUD: it drives a REAL production campaign run through
// the true Game.update flow and asserts the campaign actually happened.
//
// A run counts as a valid Act1 production run ONLY if ALL hold:
//   • campaignStageAtStart > 0         (_pendingCampaignStage was honoured → _applyCampaignStage set the stage)
//   • all three staged boss gates fired (serpent ~90s, annihilator ~180s, titan ~255s)
//   • the stage actually cleared        (_campaignCleared at timeAlive ≈ CAMPAIGN_STAGE_SECONDS)
// and the NEGATIVE control (no _pendingCampaignStage) must be detected as NOT a campaign run —
// i.e. generic survival can never masquerade as Act1 again.
//
// This is a STRUCTURE guard, not a balance/reachability gate: it asserts the campaign machinery
// runs, NOT that evolutions happen (Act1's evolution rate is a separate, documented design
// property of 5-minute per-stage-reset stages — see PHASE4C notes). Deterministic: seeded PRNG +
// virtual clock + cleared store + child-process isolation. Exit 1 on regression.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

// ══════════════════════════════════════════════════════════════════════════════════
// WORKER — one deterministic campaign run. mode=prod sets _pendingCampaignStage (REAL run);
// mode=control omits it (must be detected as NOT a campaign). One JSON line out.
// ══════════════════════════════════════════════════════════════════════════════════
if (process.argv[2] === '--worker') {
  const seed = +process.argv[3], ch = process.argv[4], mode = process.argv[5], stage = +(process.argv[6] || 1);
  const { installEnv, muteConsole } = await import(pathToFileURL(path.join(HERE, 'headless-env.mjs')).href);
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
  const { Game } = await import(pathToFileURL(path.resolve(HERE, '../../js/game/Game.js')).href);
  const IN = (k) => ({ keys: k || new Set(), mousePos: { x: 0, y: 0 }, mouseDown: false });
  const g = new Game(); g.audio = null;
  g.selectedCharacter = ch; g.gameState = 'playing';
  if (mode === 'prod') { g._pendingCampaignStage = stage; g.paused = false; g.reset(); g._applyCampaignStage(); }
  else { /* control: the ORIGINAL invalid setup — reset + applyCampaignStage with NO pending stage */ g.paused = false; g.reset(); try { g._applyCampaignStage && g._applyCampaignStage(); } catch (_) {} }
  const campaignStageAtStart = g._campaignStage || 0;

  let cleared = false, clearedAt = null;
  const FR = 6 * 60 * 60;   // 6-minute cap (stage clears at 300s)
  for (let f = 0; f < FR; f++) {
    vclock += 1000 / 60;
    if (g.upgradeUI) { try { g.selectUpgrade(0); } catch (_) { g.upgradeUI = null; } }
    if (g.mutationUI) { try { g.selectMutation(0); } catch (_) { g.mutationUI = null; } }
    if (g._postArenaChoice) { try { g._selectPostArenaChoice(0); } catch (_) { g._postArenaChoice = false; } }
    if (g.player) g.player.hp = g.player.maxHp;   // survive to observe the full stage
    // gentle drift toward nearest enemy so combat (and boss gates) actually engage
    let keys = new Set(); const p = g.player, px = p.pos.x, py = p.pos.y; let bd = Infinity, tx = null, ty = null;
    for (const e of (g.enemies || [])) { const dx = e.pos.x - px, dy = e.pos.y - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; tx = e.pos.x; ty = e.pos.y; } }
    if (tx != null) { const dx = tx - px, dy = ty - py; if (dx > 8) keys.add('d'); else if (dx < -8) keys.add('a'); if (dy > 8) keys.add('s'); else if (dy < -8) keys.add('w'); }
    try { g.update(1 / 60, IN(keys)); } catch (_) {}
    if ((g._campaignCleared || g.paused) && clearedAt == null) { cleared = !!g._campaignCleared; clearedAt = +(vclock / 1000).toFixed(1); break; }
  }
  un();
  process.stdout.write(JSON.stringify({
    ch, seed, mode, campaignStageAtStart,
    timeAliveAtEnd: +(g.timeAlive || 0).toFixed(1),
    cleared, clearedAt,
    bosses: { serpent: !!g.cyberSerpentSpawned, annihilator: !!g.annihilatorSpawned, titan: !!g.titanSpawned },
  }));
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════════════
// MAIN — assert the campaign machinery runs (positive) and that generic survival is NOT
// mistaken for a campaign (negative control).
// ══════════════════════════════════════════════════════════════════════════════════
const SEEDS = [12345, 20260721];
const CHARS = ['skeleton_warrior', 'dimis_kickboxer'];

function worker(seed, ch, mode, stage = 1) {
  const r = spawnSync(process.execPath, [SELF, '--worker', String(seed), ch, mode, String(stage)], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0 || !r.stdout) throw new Error(`worker failed seed=${seed} ch=${ch} mode=${mode}: ${(r.stderr || '').slice(-400)}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

console.log('═══ ACT 1 CAMPAIGN PRODUCTION (deterministic · the campaign machinery actually runs) ═══');
console.log(`── ${SEEDS.length} seeds × ${CHARS.length} chars, REAL Game.update production flow, 6-min cap, process isolation ──`);

const prod = [];
for (const s of SEEDS) for (const c of CHARS) prod.push(worker(s, c, 'prod'));
for (const r of prod) console.log(`  seed ${String(r.seed).padStart(8)} ${r.ch.padEnd(20)}: stageAtStart ${r.campaignStageAtStart}, cleared ${r.cleared}@${r.clearedAt}s (tAlive ${r.timeAliveAtEnd}), bosses S${+r.bosses.serpent}/A${+r.bosses.annihilator}/T${+r.bosses.titan}`);

// NEGATIVE CONTROL — the original invalid setup: MUST NOT read as a campaign run.
const control = worker(SEEDS[0], CHARS[0], 'control');
console.log(`  CONTROL (no _pendingCampaignStage): stageAtStart ${control.campaignStageAtStart}, cleared ${control.cleared} — must be NOT-a-campaign`);

console.log('\n── POSITIVE: real campaign machinery ──');
T('every prod run started IN a campaign stage (_pendingCampaignStage honoured)', () => prod.every(r => r.campaignStageAtStart > 0) || 'stageAtStart: ' + prod.map(r => r.campaignStageAtStart).join(','));
T('every prod run CLEARED the stage (stage transition fired ~300s)', () => prod.every(r => r.cleared === true && r.clearedAt >= 295 && r.clearedAt <= 320) || 'clearedAt: ' + prod.map(r => r.clearedAt).join(','));
T('all three staged boss gates fired in every prod run (serpent+annihilator+titan)', () => prod.every(r => r.bosses.serpent && r.bosses.annihilator && r.bosses.titan) || 'bosses: ' + prod.map(r => `${+r.bosses.serpent}${+r.bosses.annihilator}${+r.bosses.titan}`).join(','));

console.log('\n── NEGATIVE CONTROL: generic survival is NOT a campaign ──');
T('control run (no pending stage) did NOT enter a campaign stage', () => control.campaignStageAtStart === 0 || `control campaignStageAtStart=${control.campaignStageAtStart} (invalid harness would report >0)`);
T('control run did NOT fire a stage clear', () => control.cleared === false || 'control falsely cleared a stage');

console.log('\n  CONCLUSION: Act1 measurements are only valid when campaignStageAtStart>0, all boss gates fire, and the stage clears. Any harness that omits _pendingCampaignStage (the original bug) is rejected by the negative control. This guard pins the STRUCTURE of a campaign run; Act1 evolution RATE is a separate documented design property.');

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
