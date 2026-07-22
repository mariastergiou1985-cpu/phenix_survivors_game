// PHASE 4C - 10 characters x 5 deterministic Act 1 production runs.
// The shared worker uses only production input and card-selection paths: no HP/XP/level/recipe
// state injection. Every worker also completes a second stage run on the same Game instance.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const WORKER_URL = new URL('./act1_late_eligibility_protection_regression.mjs', import.meta.url);
const WORKER = fileURLToPath(WORKER_URL);
const WORKER_SOURCE = readFileSync(WORKER, 'utf8');
const SEEDS = [12345, 777, 20260721, 555, 88888];
const CHARS = [
  'skeleton_warrior',
  'taekwondo_girl',
  'cyber_arm_hero',
  'brawler_warrior',
  'assassin_clone',
  'japan_phasewalker',
  'euclid_vector',
  'oni_cataclysm_protocol',
  'eddie',
  'dimis_kickboxer',
];

function worker(seed, ch) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, '--worker', String(seed), ch, 'evolve'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0 || !stdout) {
        reject(new Error(`worker failed seed=${seed} ch=${ch}: ${stderr.slice(-600)}`));
        return;
      }
      try { resolve(JSON.parse(stdout.trim().split('\n').pop())); }
      catch (error) { reject(new Error(`invalid worker JSON seed=${seed} ch=${ch}: ${error.message}`)); }
    });
  });
}

let pass = 0;
let fail = 0;
const test = (name, check) => {
  let ok = false;
  let note = '';
  try {
    const result = check();
    ok = result === true;
    if (typeof result === 'string') note = result;
  } catch (error) { note = 'THREW: ' + error.message; }
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ' - ' + note : ''}`);
};

console.log('=== PHASE 4C ACT 1 NATURAL EVOLUTION MATRIX ===');
console.log(`-- ${CHARS.length} characters x ${SEEDS.length} seeds; two real runs per worker; no state injection --`);

const runs = [];
for (const ch of CHARS) {
  const charRuns = await Promise.all(SEEDS.map(seed => worker(seed, ch)));
  runs.push(...charRuns);
  for (const run of charRuns) {
    console.log(`  ${run.ch.padEnd(26)} ${String(run.seed).padStart(8)}: lvl ${String(run.playerLevel).padStart(2)}, hp ${String(Math.round(run.playerHp ?? 0)).padStart(3)}, XP ${run.shardCollectedXp}/${run.generatedXp}, offers W${run.targetWeaponOffers}/P${run.catalystOffers}/E${run.evolutionOffers}, recipe ${run.maxWeaponLevel}+${run.maxPassiveLevel}, evo ${run.evolutions}, second ${run.secondRun.stageCount ? 'clear' : run.secondRun.failureReason}, ${run.failureReason || 'success'}`);
  }
}

const byChar = Object.fromEntries(CHARS.map(ch => {
  const charRuns = runs.filter(run => run.ch === ch);
  const beWeaponKeys = new Set(charRuns.flatMap(run => run.offeredBeWeaponKeys || []));
  const bePassiveKeys = new Set(charRuns.flatMap(run => run.offeredBePassiveKeys || []));
  const nonLeadBeKeys = new Set(charRuns.flatMap(run => run.nonLeadBeOfferKeys || []));
  return [ch, {
    runs: charRuns.length,
    success: charRuns.filter(run => run.evolutions > 0).length,
    l5: charRuns.filter(run => run.maxWeaponLevel >= 5).length,
    catalyst3: charRuns.filter(run => run.maxPassiveLevel >= 3).length,
    beWeaponVariety: beWeaponKeys.size,
    bePassiveVariety: bePassiveKeys.size,
    nonLeadBeVariety: nonLeadBeKeys.size,
    nonLeadBeOfferCount: charRuns.reduce((sum, run) => sum + (run.nonLeadBeOfferCount || 0), 0),
  }];
}));
const totalSuccess = runs.filter(run => run.evolutions > 0).length;
const offeredBeWeaponVariety = new Set(runs.flatMap(run => run.offeredBeWeaponKeys || [])).size;
const offeredBePassiveVariety = new Set(runs.flatMap(run => run.offeredBePassiveKeys || [])).size;
const nonLeadBeVariety = new Set(runs.flatMap(run => run.nonLeadBeOfferKeys || [])).size;
const runsWithNonLeadBeOffers = runs.filter(run => run.nonLeadBeOfferCount > 0).length;

console.log('\n-- Harness purity and production validity --');
const forbiddenMutations = [
  ['direct HP assignment', /\b(?:game\.)?player\.hp\s*(?:[+*/%-]?=(?!=)|\+\+|--)/],
  ['direct XP assignment', /\b(?:game\.)?player\.xp\s*(?:[+*/%-]?=(?!=)|\+\+|--)/],
  ['direct pending-level assignment', /pendingLevelupCount\s*(?:[+*/%-]?=(?!=)|\+\+|--)/],
  ['direct weapon-state assignment', /weapons\.get\([^\n]+\)\.(?:level|evolved)\s*(?:[+*/%-]?=(?!=)|\+\+|--)/],
  ['direct weapon-map mutation', /buildEngine\.weapons\.(?:set|delete|clear)\s*\(/],
  ['direct passive mutation', /buildEngine\.passives\.(?:set|delete|clear)\s*\(/],
  ['direct weapon acquisition', /buildEngine\.addWeapon\s*\(/],
  ['direct catalyst acquisition', /buildEngine\.addPassive\s*\(/],
  ['direct recipe-table mutation', /EVOLUTION_RECIPES(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)\s*=(?!=)/],
];
test('worker source contains no direct HP/XP/level/recipe mutation', () => {
  const hits = forbiddenMutations.filter(([, pattern]) => pattern.test(WORKER_SOURCE)).map(([name]) => name);
  return hits.length === 0 || hits.join(', ');
});
test('all 50 first runs completed one real campaign stage', () =>
  runs.length === 50 && runs.every(run => run.stageCount === 1 && run.stageClearedAt >= 295 && run.stageClearedAt <= 320) ||
  runs.filter(run => run.stageCount !== 1).map(run => `${run.ch}/${run.seed}:${run.failureReason}`).join(', '));
test('all 50 runs fired all three campaign boss gates', () =>
  runs.every(run => run.bosses?.serpent && run.bosses?.annihilator && run.bosses?.titan) || 'boss gate missing');
test('all 50 runs completed without swallowed runtime errors', () =>
  runs.every(run => run.runtimeErrors.length === 0) || runs.filter(run => run.runtimeErrors.length).map(run => `${run.ch}/${run.seed}`).join(', '));
test('physical XP ledger balances; production direct XP is separately accounted', () =>
  runs.every(run => run.directXp >= 0 && run.unexplainedXp === 0 && run.generatedXp === run.shardCollectedXp + run.groundXp) || 'XP ledger mismatch');
test('first- and second-run instrumentation restored the original production methods', () =>
  runs.every(run => run.instrumentationRestored && run.secondRun.instrumentationRestored) || 'stacked instrumentation detected');

console.log('\n-- Evolution event integrity --');
test('every successful evolution maps 1:1 to one selected evolution card', () =>
  runs.every(run => run.oneToOneEvolutionChoice) || runs.filter(run => !run.oneToOneEvolutionChoice).map(run => `${run.ch}/${run.seed}`).join(', '));
test('no successful evolution occurred outside an evolution-card selection', () =>
  runs.every(run => run.automaticEvolutionEvents === 0) || 'automatic evolution event detected');
test('no evolution-card selection or _evolve call failed silently', () =>
  runs.every(run => run.invalidEvolutionSelections === 0 && run.failedEvolutionCalls === 0) || 'failed selection/call detected');
test('stage-clear evolution never fired before the stage-clear selection', () =>
  runs.every(run => run.evolutionsBeforeStageChoice == null || run.evolutionsBeforeStageChoice === 0) || 'pre-choice evolution detected');
test('stage-clear opportunities are unique and resolved once per evolution eid', () =>
  runs.every(run => run.stageChoicePerEidIntegrity) ||
  runs.filter(run => !run.stageChoicePerEidIntegrity)
    .map(run => `${run.ch}/${run.seed}:missing=${run.missingStageChoiceOfferEids},dup=${run.duplicateStageChoiceEids},lost=${run.unresolvedStageChoiceEids}`).join(', '));

console.log('\n-- Real second-run flow --');
test('all workers started the second run from clean reset state', () =>
  runs.every(run => run.secondRun.startClean) || runs.filter(run => !run.secondRun.startClean).map(run => `${run.ch}/${run.seed}`).join(', '));
test('all second runs completed a real campaign stage on the same Game instance', () =>
  runs.every(run => run.secondRun.clean && run.secondRun.stageClearedAt >= 295 && run.secondRun.stageClearedAt <= 320) ||
  runs.filter(run => !run.secondRun.clean).map(run => `${run.ch}/${run.seed}:${run.secondRun.failureReason}`).join(', '));
test('second runs also preserve 1:1 choice-to-evolution integrity', () =>
  runs.every(run => run.secondRun.oneToOneEvolutionChoice && run.secondRun.automaticEvolutionEvents === 0 &&
    run.secondRun.stageChoicePerEidIntegrity) || 'second-run evolution/choice mismatch');

console.log('\n-- Phase 4C acceptance --');
test('Act 1 >=4/5 successful evolutions per character', () =>
  CHARS.every(ch => byChar[ch].success >= 4) || CHARS.map(ch => `${ch}=${byChar[ch].success}/5`).join(', '));
test('overall Act 1 successful evolution rate >=80%', () =>
  totalSuccess >= 40 || `${totalSuccess}/50 (${(100 * totalSuccess / 50).toFixed(0)}%)`);
test('no character has 0% successful evolution rate', () =>
  CHARS.every(ch => byChar[ch].success > 0) || CHARS.filter(ch => byChar[ch].success === 0).join(', '));
test('every run exposes both BE weapon and BE passive offers', () =>
  runs.every(run => run.beWeaponOfferCount > 0 && run.bePassiveOfferCount > 0) ||
  runs.filter(run => run.beWeaponOfferCount < 1 || run.bePassiveOfferCount < 1)
    .map(run => `${run.ch}/${run.seed}:W${run.beWeaponOfferCount}/P${run.bePassiveOfferCount}`).join(', '));
test('each character sees at least two distinct BE weapon and passive offers across its seeds', () =>
  CHARS.every(ch => byChar[ch].beWeaponVariety >= 2 && byChar[ch].bePassiveVariety >= 2) ||
  CHARS.map(ch => `${ch}:W${byChar[ch].beWeaponVariety}/P${byChar[ch].bePassiveVariety}`).join(', '));
test('every run exposes at least one non-lead BE weapon/passive offer', () =>
  runsWithNonLeadBeOffers === runs.length ||
  `${runsWithNonLeadBeOffers}/${runs.length} runs; keys=${nonLeadBeVariety}`);

console.log('\n-- Per-character summary --');
for (const ch of CHARS) {
  const result = byChar[ch];
  console.log(`  ${ch.padEnd(26)} evolved ${result.success}/5, weapon L5 ${result.l5}/5, catalyst L3 ${result.catalyst3}/5, BE variety W${result.beWeaponVariety}/P${result.bePassiveVariety}, non-lead ${result.nonLeadBeOfferCount}`);
}
console.log(`  TOTAL ${totalSuccess}/50 (${(100 * totalSuccess / 50).toFixed(0)}%), BE offers W${offeredBeWeaponVariety}/P${offeredBePassiveVariety}, non-lead keys ${nonLeadBeVariety}, runs ${runsWithNonLeadBeOffers}/50`);
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
