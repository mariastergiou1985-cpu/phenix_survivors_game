// BUILDENGINE-LIVE EVOLUTION RENDER-PROOF GUARD — asserts the QA-only BE-evolution render hook in
// main.js is safe: gated behind ?qa=1 + sessionStorage opt-in (same bridge), activates via the REAL
// BuildEngine production path (_evolutionReady/_evolve) — NEVER the legacy evolution inject — stubs
// localStorage.setItem across _evolve (which writes phenix_be_discovered) so no storage/progression
// write, returns only Object.freeze immutable snapshots, never exposes raw Game/BuildEngine/Player/
// arrays, is bounded, tracks legacy no-dual-layer, and is fully torn down by clearBeEvolutionProof().
// Static source guards (parse-time safe). Exit 1 on failure.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = fs.readFileSync(path.resolve(HERE, '../../js/main.js'), 'utf8');

let pass = 0, fail = 0;
const T = (n, f) => { let ok = false, note = ''; try { const r = f(); ok = r === true; if (typeof r === 'string') note = r; } catch (e) { note = 'THREW: ' + e.message; } ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };

const METHODS = ['activateBeEvolutionForProof', 'equipBeBaseForProof', 'spawnBeEvolutionProofTargets', 'advanceBeEvolutionProof', 'snapshotBeEvolutionProof', 'clearBeEvolutionProof'];
const start = MAIN.indexOf('activateBeEvolutionForProof(');
const end = MAIN.indexOf('disable() {', start);
const BLOCK = start >= 0 && end > start ? MAIN.slice(start, end) : '';

console.log('=== BUILDENGINE EVOLUTION RENDER-PROOF GUARD ===\n-- existence + gating --');
T('all 6 BE proof methods exist', () => { const miss = METHODS.filter(x => !MAIN.includes(x + '(')); return miss.length === 0 || 'missing: ' + miss.join(','); });
T('BE proof block is INSIDE installQaBridge (after gates)', () => {
  const gate = MAIN.indexOf("params.get('qa') !== '1' || !optIn) return;");
  return (gate > 0 && start > gate) || `gate=${gate} start=${start}`;
});
T('gates (?qa=1 AND opt-in) precede __phenixQA', () => {
  const gate = MAIN.indexOf("params.get('qa') !== '1' || !optIn) return;");
  const assign = MAIN.indexOf('window.__phenixQA =');
  return gate > 0 && assign > gate;
});

console.log('\n-- production path (NOT legacy inject) --');
T('activates via BuildEngine production path (_evolutionReady + _evolve)', () => (/buildEngine\._evolve\(/.test(BLOCK) && /_evolutionReady\(/.test(BLOCK)) || 'missing production-path calls');
T('never injects a legacy evolution (_evolvedWeapons never written)', () => !/_evolvedWeapons\.set\(|_evolvedWeapons\[/.test(BLOCK) || 'writes legacy _evolvedWeapons');
T('tracks legacy no-dual-layer (snapshot reads _evolvedWeapons.size)', () => /_evolvedWeapons\s*&&\s*[a-z]*\._evolvedWeapons\.size|_evolvedWeapons\.size/.test(BLOCK) || 'no legacyEvolved instrumentation');

console.log('\n-- isolation / immutability --');
T('BE proof routes through isolateSave()', () => (BLOCK.match(/isolateSave\(\)/g) || []).length >= 4 || 'isolateSave not on every driver');
T('localStorage.setItem stubbed across _evolve (no storage write)', () => /localStorage\.setItem = function \(\) \{\}/.test(BLOCK) || 'no localStorage guard around _evolve');
T('clearBeEvolutionProof calls restoreSave', () => /clearBeEvolutionProof\(\)[\s\S]*restoreSave\(\)/.test(BLOCK) || 'no restoreSave in teardown');
T('every BE return is Object.freeze (immutable)', () => !/return\s+(game|g|be|this\._beProof|\{[^)]*\bpos\b)/.test(BLOCK) && /Object\.freeze/.test(BLOCK) || 'a BE return is not frozen / leaks a live ref');
T('never exposes raw Game/BuildEngine/Player on window', () => !/window\.(game|buildEngine|player)\s*=/.test(BLOCK) || 'raw engine exposed on window');

console.log('\n-- teardown / bounds --');
T('clearBeEvolutionProof empties BE weapons + fx pools', () => /clearBeEvolutionProof\(\)[\s\S]*weapons\.clear\(\)[\s\S]*shards\.length = 0/.test(BLOCK) || 'teardown does not clear BE pools');
T('bounded loops (Math.min ceiling in spawn/advance)', () => (BLOCK.match(/Math\.min\(600/g) || []).length >= 2 || 'unbounded frame loops');

console.log('\n-- normal-boot absence (inherited) --');
T('BE methods only reachable through the gated bridge (no top-level export)', () => start > MAIN.indexOf("params.get('qa') !== '1' || !optIn) return;") || 'BE method appears before the gate');

console.log(`\n=== ${pass} PASS · ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
