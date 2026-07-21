// WEAPON RENDER PROOF GUARD — asserts the QA-only forced-weapon-render hook in main.js is safe:
// gated behind ?qa=1 + sessionStorage opt-in (same as the whole bridge), never exposes a raw Game/
// Player/array/weapon reference, returns only Object.freeze immutable snapshots, routes through
// isolateSave() (no localStorage writes / no progression), and is fully torn down by
// clearWeaponProofState(). Static source guards (parse-time safe). Run: node ... (exit 1 on failure)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = fs.readFileSync(path.resolve(HERE, '../../js/main.js'), 'utf8');

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

const METHODS = ['equipWeaponForProof', 'spawnProofTargets', 'fireWeaponProof', 'snapshotWeaponProof', 'clearWeaponProofState'];
const start = MAIN.indexOf('equipWeaponForProof(');
// Scope this guard to the LEGACY weapon-proof methods only. The BuildEngine-live proof methods that
// follow (activateBeEvolutionForProof … clearBeEvolutionProof) have their own dedicated guard
// (be_evolution_proof_guard_regression.mjs) and legitimately stub localStorage.setItem across _evolve.
let end = MAIN.indexOf('activateBeEvolutionForProof(', start);
if (end < 0) end = MAIN.indexOf('disable() {', start);
const BLOCK = start >= 0 && end > start ? MAIN.slice(start, end) : '';

console.log('=== WEAPON RENDER PROOF GUARD ===\n-- existence + gating --');
T('all 5 proof methods exist', () => { const m = METHODS.filter(x => MAIN.includes(x + '(')); return m.length === 5 || 'missing: ' + METHODS.filter(x => !MAIN.includes(x + '(')).join(','); });
T('proof block is INSIDE installQaBridge (after gates)', () => {
  const gate = MAIN.indexOf("params.get('qa') !== '1' || !optIn) return;");
  const inst = MAIN.indexOf('function installQaBridge');
  return (gate > 0 && inst >= 0 && start > gate) || `gate=${gate} start=${start}`;
});
T('gates (?qa=1 AND opt-in) precede __phenixQA', () => {
  const gate = MAIN.indexOf("params.get('qa') !== '1' || !optIn) return;");
  const assign = MAIN.indexOf('window.__phenixQA =');
  return gate > 0 && assign > gate;
});

console.log('\n-- no raw Game / Player / array / mutable exposure --');
T('no proof method returns bare game/player/arrays', () => {
  return (!/return\s+game\s*;/.test(BLOCK) && !/return\s+g\s*;/.test(BLOCK) &&
         !/return\s+g\.enemies/.test(BLOCK) && !/return\s+g\.player/.test(BLOCK) &&
         !/return\s+g\.projectiles/.test(BLOCK) && !/return\s+game\.enemies/.test(BLOCK)) || 'raw ref returned';
});
T('never exposes whole Game on window (inherited rule)', () => !/window\.__phenix\s*=\s*game/.test(MAIN));
T('every proof return is Object.freeze (immutable snapshot)', () => {
  const frozen = BLOCK.match(/return\s+Object\.freeze\(/g) || [];
  const rawObj = BLOCK.match(/return\s+\{/g) || [];
  return (frozen.length >= 5 && rawObj.length === 0) || `frozen=${frozen.length} rawObj=${rawObj.length}`;
});

console.log('\n-- save / progression isolation --');
T('equip/spawn/fire route through isolateSave()', () => {
  const eq = BLOCK.slice(BLOCK.indexOf('equipWeaponForProof('), BLOCK.indexOf('spawnProofTargets('));
  const sp = BLOCK.slice(BLOCK.indexOf('spawnProofTargets('), BLOCK.indexOf('fireWeaponProof('));
  const fi = BLOCK.slice(BLOCK.indexOf('fireWeaponProof('), BLOCK.indexOf('snapshotWeaponProof('));
  return (eq.includes('isolateSave()') && sp.includes('isolateSave()') && fi.includes('isolateSave()')) || 'missing isolateSave';
});
T('clearWeaponProofState calls restoreSave()', () => {
  const cl = BLOCK.slice(BLOCK.indexOf('clearWeaponProofState('));
  return cl.includes('restoreSave()') || 'no restoreSave';
});
T('no proof method WRITES localStorage (only getItem for lastError)', () => {
  const CODE = BLOCK.replace(/\/\/[^\n]*/g, '');   // strip line comments — a prose mention is not a write
  return (!/localStorage\.setItem/.test(CODE) && !/localStorage\.removeItem/.test(CODE) && !/localStorage\.clear/.test(CODE)) || 'localStorage write in proof';
});
T('no proof method mutates meta/unlock/progression', () => {
  return !/\bunlockCharacter\b|\bclearStage\b|\bunlockEndless\b|\baddCredits\b|\bunlockRandomSecretSkin\b/.test(BLOCK) || 'progression call in proof';
});

console.log('\n-- teardown / cleanup --');
T('clearWeaponProofState empties weapon-VFX pools + weapon levels', () => {
  const cl = BLOCK.slice(BLOCK.indexOf('clearWeaponProofState('));
  return cl.includes('_activeWeaponVFX') && cl.includes('length = 0') && cl.includes('_weaponLevels') && cl.includes('clear');
});
T('equipWeaponForProof saves & restores previous character', () => BLOCK.includes('_proofPrevChar'));
T('bounded loops (fire/spawn Math.min ceiling)', () => (BLOCK.match(/Math\.min\(600,/g) || []).length >= 2 || 'unbounded proof loop');

console.log(`\n=== ${pass} PASS . ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
