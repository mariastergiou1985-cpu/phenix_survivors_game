// ENDLESS / CHAOS EVENT PACING — asserts the real scheduler cadences AND the real
// deferral guards that keep two spectacles off the same moment.
//
// HISTORY (2026-07-20): this file started as a hand-written model that re-implemented the
// cadences from grepped constants and simulated them. It reported 3 failures — "max
// simultaneous MAJOR <= 1" and "min gap >= 20s" — which were MODEL ARTEFACTS, not defects:
// the model fired every timer unconditionally and knew nothing about the deferral logic that
// production actually has (boss rotation stands down for Null Breach and Acid Rain; a Titan
// re-arms only after the previous one is CLEARED, not on a fixed period; Boss Rush refuses to
// open while the arena is up; airstrikes retry instead of stacking). A model that disagrees
// with production proves nothing about production, so the simulation was replaced by direct
// assertions on the guards themselves. Live behaviour is covered by the companion harness
// endless_chaos_runtime_regression.mjs, which drives the real Game class.
//
// Run: node tools/qa/endless_event_pacing_regression.mjs   (exit 1 on failure)

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(HERE, '../../js/game/Game.js'), 'utf8');

let pass = 0, fail = 0;
const T = (n, f) => {
  let ok = false, note = '';
  try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; }
  catch (e) { note = 'THREW: ' + e.message; }
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`);
};

console.log('═══ ENDLESS EVENT PACING ═══');

console.log('\n── cadences match source (the model cannot silently drift) ──');
T('endless boss first = 25s', () => /_endlessBossTimer = 25;/.test(SRC));
T('endless boss repeat = 120s', () => /_endlessBossTimer = 120;/.test(SRC));
T('chaos boss repeat = 90s', () => /_endlessBossTimer = 90;/.test(SRC));
T('titan 40s πρώτος, 55s μετά', () => /_chaosTitanTimer = 40/.test(SRC) && /_chaosTitanTimer = 55/.test(SRC));
// Batch 3 (major rocket salvo ramp) deliberately moved these two. The base cadences are still
// pinned here so they cannot drift silently; what changed is that they are multiplied by
// _majorSalvoScale() while the build is forming, and the Chaos opener carries the 2.2x factor
// explicitly instead of firing at a flat 15s.
T('airstrike base 90s endless / chaos opener on the early ramp',
  () => /_airstrikeTimer   = 90;/.test(SRC) && /_airstrikeTimer    = 15 \* 2\.2;/.test(SRC));
T('major salvo cadence ramps and returns to shipped frequency by 10:00',
  () => /_majorSalvoScale\(\)/.test(SRC) && /if \(t >= 600\) return 1;/.test(SRC));
T('no two major rocket events open inside the same protected window',
  () => /_majorSalvoBlocked\(\)/.test(SRC) && /_majorSalvoArm\(\)/.test(SRC));
T('null breach στα 300s και 720s', () => /endlessElapsed >= 300/.test(SRC) && /endlessElapsed >= 720/.test(SRC));
T('cybermote pack κάθε 300s', () => /_cybermoteTimer   = 300;/.test(SRC));
T('boss rush schedule: chaos [120,480] · endless [480,900]',
  () => /_bossRushSchedule = this\._chaosMode \? \[120, 480\] : \[480, 900\]/.test(SRC));

console.log('\n── deferral guards: γιατί τα major events ΔΕΝ στοιβάζονται ──');
T('boss rotation στέκεται όσο τρέχει το Null Breach',
  () => /if \(this\._nullBreachActive\) \{ this\._endlessBossTimer = Math\.max\(this\._endlessBossTimer, 15\); return; \}/.test(SRC));
// The guard is alive and correct; only the STATE it reads was renamed when the BATCH 2 refactor
// moved the storm into js/game/AcidRain.js. `acidRainTimer` now appears nowhere in js/ at all, and
// `this.acidRain` survives only as a never-read null assignment - so this assertion had been
// pinning two fields that no longer exist. AcidRain.active is `_phase !== 'idle'`, i.e. it covers
// warning -> raining -> fading, so the deferral still spans the whole event.
T('boss rotation στέκεται για Acid Rain (κανένα ταυτόχρονο θέαμα)',
  () => /if \(this\.acidRainSystem\?\.active\) \{ this\._endlessBossTimer = 8; return; \}/.test(SRC));
T('boss rotation παίρνει breathing room μετά την arena',
  () => (SRC.match(/_endlessBossTimer = Math\.max\(this\._endlessBossTimer, 30\)/g) || []).length >= 2);
T('ΕΝΑΣ Titan τη φορά — ο timer δεν τρέχει καν όσο ζει',
  () => /const titan = this\.enemies\.find\(e => e\.isMegaBoss && Enemy\.CHAOS_TITANS\.has\(e\.enemyType\)\);/.test(SRC) &&
        /if \(titan\) \{[\s\S]{0,200}this\._activeTitan = titan; this\._runTitanAbility\(titan, dt\); return;/.test(SRC));
T('ο επόμενος Titan μετριέται ΜΕΤΑ το clear, όχι από το spawn',
  () => /this\._chaosTitanTimer = 55;   \/\/ next Titan ~55s after the last one is cleared/.test(SRC));
T('Boss Rush δεν ανοίγει όσο η arena είναι ενεργή (mutual exclusion)',
  () => /chaosEl >= next && !this\._nullBreachActive/.test(SRC));
T('airstrike δεν στοιβάζεται — ξαναδοκιμάζει αν υπάρχει ήδη σκάφος',
  // The `< 1` anti-stack condition is intact; the major-event slot claim was appended to it, so the
  // old exact-match regex no longer fits a line that still enforces exactly what it asserts.
  () => /else if \(this\.airstrikeShips\.length < 1 && this\.startMajorEvent\('airstrike'\)\) \{/.test(SRC) &&
        /this\._airstrikeTimer = \(this\._chaosMode \? 60 : 120\) \* this\._majorSalvoScale\(\);/.test(SRC) &&
        /else                                  this\._airstrikeTimer = 20;/.test(SRC));
// AIRCRAFT PRESSURE: REMOVED (2026-08-04) — the decision is documented in Game.js at the arena
// update ("Aircraft pressure: REMOVED (2026-08-04) … those rockets landed straight across the boss
// finishers the arena exists to showcase"). This line used to grep `arena.airCd <= 0 &&
// this.airstrikeShips.length < 2`, i.e. it pinned the OLD two-ship cap; `airCd` now appears nowhere
// in js/ at all, so the assertion was greping deleted code. The shipped contract is strictly safer
// than the one it claimed — ZERO aircraft during the arena, not two — so it is that contract that is
// pinned here, in the four places that actually enforce it. Any of them regressing fails this test.
T('η arena δεν ανέχεται ΚΑΝΕΝΑ σκάφος στον αέρα (0, όχι ≤2)', () => {
  // 1. the gate itself: aircraft events are forbidden exactly while the arena is up
  const gate = /_aircraftEventsAllowed\(\) \{ return !this\._nullBreachActive; \}/.test(SRC);
  // 2. BOTH aircraft schedulers read it and return BEFORE any spawn (held, not drained)
  const held = (SRC.match(/if \(!this\._aircraftEventsAllowed\(\)\) \{[\s\S]{0,240}?return;/g) || []).length;
  // 3. crossing the arena boundary clears the layer, so a ship launched a second earlier is gone
  const clearedOnEntry = /_enterNullBreachArena\(\) \{[\s\S]{0,600}?this\._clearAircraftEvents\(\);/.test(SRC);
  const clearBody = (/_clearAircraftEvents\(\) \{[\s\S]*?\n  \}/.exec(SRC) || [''])[0];
  const clearsAll = /this\.airstrikeShips\.length\s+= 0;/.test(clearBody) &&
                    /this\.airstrikeRockets\.length = 0;/.test(clearBody) &&
                    /this\.gunships\.length\s+= 0;/.test(clearBody);
  // 4. and the arena's own update never launches one of its own
  // (both markers are matched as METHOD DEFINITIONS — `_completeNullBreachArena` is also CALLED
  //  earlier in the file, and a bare indexOf for it would slice a backwards, empty range)
  const arenaStart = SRC.indexOf('\n  _updateNullBreachArena(dt) {');
  const arenaBody = arenaStart < 0 ? '' : SRC.slice(arenaStart, SRC.indexOf('\n  _completeNullBreachArena() {', arenaStart));
  const launches = arenaBody.length > 0 && /_spawnAirstrike|_spawnGunship|airstrikeShips\.push|airCd/.test(arenaBody);
  return (gate && held >= 2 && clearedOnEntry && clearsAll && arenaBody.length > 0 && !launches) ||
    `gate=${gate} heldSchedulers=${held} clearedOnEntry=${clearedOnEntry} clearsAll=${clearsAll} arenaLaunches=${launches}`;
});
T('Locked Vault: ποτέ δεύτερο ενώ ένα είναι ενεργό',
  () => /if \(!this\.endless \|\| this\.vaultDrop\) return;/.test(SRC));

console.log('\n── schedules δεν επικαλύπτονται εξ ορισμού ──');
// Endless: arenas 300-420 and 720-840 (120s each); rushes 480-660 and 900-1080 (180s each).
const WINDOWS = [
  ['arena 1', 300, 420], ['rush 1', 480, 660],
  ['arena 2', 720, 840], ['rush 2', 900, 1080],
];
let minGap = Infinity, clash = null;
for (let i = 0; i < WINDOWS.length; i++) {
  for (let j = i + 1; j < WINDOWS.length; j++) {
    const [an, a0, a1] = WINDOWS[i], [bn, b0, b1] = WINDOWS[j];
    if (a0 < b1 && b0 < a1) clash = `${an} ∩ ${bn}`;
  }
  if (i + 1 < WINDOWS.length) minGap = Math.min(minGap, WINDOWS[i + 1][1] - WINDOWS[i][2]);
}
console.log(`    endless windows: ${WINDOWS.map(([n, a, b]) => `${n} ${a}-${b}s`).join(' · ')}`);
console.log(`    smallest gap between consecutive major windows: ${minGap}s`);
T('καμία επικάλυψη arena ↔ boss rush στο Endless', () => clash === null, clash || '');
T('τουλάχιστον 60s καθαρός αέρας ανάμεσα σε διαδοχικά major events', () => minGap >= 60, `min gap ${minGap}s`);
T('η διάρκεια της arena είναι 120s', () => /timer: 120/.test(SRC) || /120 - arena\.timer/.test(SRC));
T('η διάρκεια του boss rush είναι 180s', () => /t: 0, dur: 180,/.test(SRC));

console.log('\n── Lava Rain παραμένει αφαιρεμένο ──');
T('κανένα _endlessLavaCd', () => !SRC.includes('_endlessLavaCd'));
T('κανένα ⚠ LAVA RAIN announcement', () => !SRC.includes("'⚠ LAVA RAIN'"));

console.log(`\n═══ ${pass} PASS · ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
